#!/usr/bin/env node
/**
 * Simulación headless de una partida con bots.
 *
 * No crea `pc.App`, no carga sprites ni audio y no necesita GPU/WebGL. El
 * arnés construye el estado de partida, los hosts que consumen `sim/**` y un
 * `CombatFxPort` de no-ops, y avanza el mismo paso fijo de 60 Hz que `Game`.
 *
 * Uso:
 *   node --import tsx scripts/sim-headless.ts --map arena --bots 4 --seconds 60
 *   node --import tsx scripts/sim-headless.ts --trace .cache/sim.jsonl --every 5
 *
 * Limitaciones conocidas del spike:
 * - Los colliders que genera `render/world/sections/*` para árboles y rocas no
 *   existen aquí. Sí se reconstruyen las bases y las cordilleras/muros del
 *   mapa, que son datos puros.
 * - Los objetos recogibles están desactivados para no arrastrar `PickupField`.
 * - Las animaciones y los sonidos se omiten: `assetFor` devuelve `undefined` y
 *   el puerto de FX es un no-op.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import {
  ABILITIES,
  abilityTotalTime,
  commonAnimationFor,
  MOVESETS,
  type AbilityDef,
  type CommonAbilityId
} from '../src/game/abilities';
import {
  ABILITY_EXECUTORS,
  type AbilityExecutorDeps
} from '../src/game/abilityExecutors';
import { buildBotHazards } from '../src/game/ai/hazards';
import { createBotSquad } from '../src/game/ai/blackboard';
import type { BotHazard, BotWorldView } from '../src/game/ai/types';
import {
  BotController,
  botVisionFactor
} from '../src/game/bot';
import { BotNavGrid } from '../src/game/botNav';
import { buildCastPlan } from '../src/game/castPlan';
import {
  closestPointOnCollider,
  closestPointOnSegment,
  pointSegmentDistance,
  raycastColliderDistance,
  segmentBlockedByColliders
} from '../src/game/combat';
import { CONFIG } from '../src/game/config';
import type { CombatFxPort, TelegraphHandle } from '../src/game/core/ports/fx';
import type { AoeFallenAlly } from '../src/game/core/abilities/aoe';
import {
  assistXpFor,
  collectKillAssists,
  type AssistCredit
} from '../src/game/core/match/assists';
import type { Collider } from '../src/game/core/world';
import { CAST_EFFECTS } from '../src/game/effects';
import { combatStatsFor, baseStatsFor } from '../src/game/pokedex';
import type { MatchPlayerConfig } from '../src/game/core/match/config';
import type {
  ActiveAoe,
  ActiveCast,
  MatchPlayerState,
  PendingInstantHit,
  PendingMeleeHit,
  Projectile,
  QueuedCast,
  SupportContribution
} from '../src/game/matchState';
import type { DeviceInputSnapshot } from '../src/game/input';
import { IDLE_INPUT } from '../src/game/input';
import {
  parseMap,
  type MapIndexEntry
} from '../src/game/map';
import {
  createGameMode,
  defaultModeSettings,
  type GameModeId,
  type GameModeRuntime,
  type MatchEndReason,
  type ModeContext,
  type ModeXpAward,
  type ObjectiveZone
} from '../src/game/modes';
import {
  TEAM_INFO,
  cameraYawForTeam,
  createTeamRecord,
  facingToCenter,
  spawnForTeam
} from '../src/game/multiplayer';
import {
  maxHitRadius,
  hitRadiusForPokemon,
  speedForPokemon
} from '../src/game/roster';
import {
  stepActiveCast,
  armHitFrame,
  applyCastPresentation,
  type CastSystemHost
} from '../src/game/sim/cast';
import {
  stepDash,
  type DashSystemHost
} from '../src/game/sim/dash';
import {
  applyAbilityDamage,
  stepDamageOverTime,
  type DamageOptions,
  type DamageSystemHost
} from '../src/game/sim/damage';
import {
  stepInstantHits,
  stepMeleeHits,
  type HitSystemHost
} from '../src/game/sim/hits';
import {
  knockOut as knockOutSystem,
  type KnockoutHost
} from '../src/game/sim/knockout';
import {
  stepPlayer,
  type PlayerSystemHost
} from '../src/game/sim/player';
import {
  stepProjectiles,
  type ProjectileSystemHost
} from '../src/game/sim/projectiles';
import {
  stepActiveAoes,
  stepPendingAoeEnds,
  type AoeSystemHost,
  type PendingAoeEnd
} from '../src/game/sim/aoes';
import {
  emitAoeEvent,
  resolveAoeHit,
  type AoeResolutionHost
} from '../src/game/sim/aoeResolution';
import {
  stepAtmosphere,
  type AtmosphereSystemHost
} from '../src/game/sim/atmosphere';
import {
  stepParticipation,
  stepRegeneration,
  breakRegen,
  type StatusSystemHost
} from '../src/game/sim/status';
import { refreshCombatVisibility } from '../src/game/sim/visibility';
import {
  BASE_COLLIDER_RADIUS,
  resolveDeepWater,
  resolveTeamTerrain,
  setActiveMap,
  terrainAt,
  type GameMap,
  type Team
} from '../src/game/terrain';
import { terrainSpeedEffect } from '../src/game/terrainSpeed';
import { terrainConcealment, visionForPokemon } from '../src/game/vision';
import type { World } from '../src/game/world';
import {
  XP_REWARDS,
  XP_RULES,
  emptyXpBreakdown,
  type XpSource
} from '../src/game/xp';

/** Paso fijo autoritativo, idéntico a `Game.FIXED_STEP`. */
const FIXED_STEP = 1 / 60;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface Options {
  map: string;
  bots: number;
  seconds: number;
  difficulty: 'easy' | 'normal' | 'hard' | 'expert';
  seed: number | 'random';
  trace: string | null;
  every: number;
  json: string | null;
  mode: GameModeId;
  timeLimit: number;
  maxKos: number;
  pokemon: string[];
  common: CommonAbilityId | 'mix';
  /** Cierra la partida en el primer KO (duelos de balance). */
  duel: boolean;
  quiet: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (!arg.startsWith('--')) {
      throw new Error(`Argumento no reconocido: ${arg}`);
    }
    const key = arg.slice(2);
    if (key === 'quiet' || key === 'duel') {
      values.set(key, 'true');
      continue;
    }
    const value = argv[++index];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Falta el valor de --${key}`);
    }
    values.set(key, value);
  }

  const difficulty = (values.get('difficulty') ?? 'normal') as Options['difficulty'];
  if (!['easy', 'normal', 'hard', 'expert'].includes(difficulty)) {
    throw new Error('--difficulty debe ser easy, normal, hard o expert');
  }
  const mode = (values.get('mode') ?? 'tdm') as GameModeId;
  if (mode !== 'tdm' && mode !== 'koth') {
    throw new Error('--mode debe ser tdm o koth');
  }
  const seedValue = values.get('seed') ?? '12345';
  const seed = seedValue === 'random' ? 'random' : Number(seedValue);
  if (seed !== 'random' && !Number.isFinite(seed)) {
    throw new Error('--seed debe ser un número o "random"');
  }
  const common = (values.get('common') ?? 'mix') as Options['common'];
  if (
    common !== 'mix' &&
    common !== 'proteccion' &&
    common !== 'impulso' &&
    common !== 'regeneracion'
  ) {
    throw new Error('--common debe ser proteccion, impulso, regeneracion o mix');
  }

  const bots = Number(values.get('bots') ?? 4);
  if (!Number.isInteger(bots) || bots < 1 || bots > 8) {
    throw new Error('--bots debe ser un entero entre 1 y 8');
  }
  const seconds = Number(values.get('seconds') ?? 60);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('--seconds debe ser mayor que cero');
  }
  const every = Number(values.get('every') ?? 1);
  if (!Number.isInteger(every) || every < 1) {
    throw new Error('--every debe ser un entero positivo');
  }

  return {
    map: values.get('map') ?? 'arena',
    bots,
    seconds,
    difficulty,
    seed,
    trace: values.get('trace') ?? null,
    every,
    json: values.get('json') ?? null,
    mode,
    timeLimit: Number(values.get('time-limit') ?? 0),
    maxKos: Number(values.get('max-kos') ?? 50),
    pokemon: (values.get('pokemon') ?? '0025,0094,0658,0007')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    common,
    duel: values.get('duel') === 'true',
    quiet: values.get('quiet') === 'true'
  };
}

function printHelp(): void {
  console.log(`Simulación headless de newpoke (sin PlayCanvas ni GPU)

Opciones:
  --map <id>          Mapa de public/maps/index.json (por defecto: arena)
  --bots <n>          Número de bots, 1-8 (por defecto: 4)
  --seconds <n>       Segundos de simulación (por defecto: 60)
  --difficulty <d>    easy | normal | hard | expert (por defecto: normal)
  --seed <n|random>   Semilla de Math.random (por defecto: 12345)
  --trace <archivo>   Escribe una traza JSONL por frame
  --every <n>         Cada cuántos pasos se escribe la traza (por defecto: 1)
  --json <archivo>    Escribe el resumen en JSON
  --mode <tdm|koth>   Modo de juego (por defecto: tdm)
  --time-limit <s>    Límite de tiempo del modo; 0 lo desactiva (por defecto: 0)
  --max-kos <n>       KOs para ganar en tdm (por defecto: 50)
  --pokemon <ids>     Lista separada por comas (por defecto: 0025,0094,0658,0007)
  --common <id|mix>   Instinto común (por defecto: mix)
  --duel              Termina la partida en el primer KO (duelos de balance)
  --quiet             No imprime la tabla final
  --help              Muestra esta ayuda`);
}

// ---------------------------------------------------------------------------
// RNG reproducible
// ---------------------------------------------------------------------------

/** Mulberry32: suficiente para reproducir decisiones y tiradas de daño. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Datos puros del mapa y los Pokémon
// ---------------------------------------------------------------------------

export interface PokemonEntry {
  name: string;
  types: string[];
  accent: [number, number, number];
}

export function loadManifest(file: string): Map<string, PokemonEntry> {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    pokemon?: Array<{
      id?: string;
      name?: string;
      types?: string[];
      accent?: string;
    }>;
  };
  const entries = new Map<string, PokemonEntry>();
  for (const pokemon of raw.pokemon ?? []) {
    if (!pokemon.id) continue;
    entries.set(pokemon.id, {
      name: pokemon.name ?? pokemon.id,
      types: pokemon.types?.length ? pokemon.types : ['Normal'],
      accent: hexToRgb(pokemon.accent ?? '#ffffff')
    });
  }
  return entries;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  if (value.length !== 6) return [255, 255, 255];
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}

export function loadMapFile(id: string): GameMap {
  const indexRaw = JSON.parse(
    readFileSync(path.resolve('public/maps/index.json'), 'utf8')
  ) as { maps?: MapIndexEntry[] } | MapIndexEntry[];
  const entries = Array.isArray(indexRaw) ? indexRaw : indexRaw.maps ?? [];
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(
      `Mapa "${id}" no encontrado. Disponibles: ${entries
        .map((candidate) => candidate.id)
        .join(', ')}`
    );
  }
  const raw = JSON.parse(
    readFileSync(path.resolve('public/maps', entry.file), 'utf8')
  );
  return parseMap(raw, entry);
}

/**
 * Reconstruye los colliders que el render deriva del mapa: bases y
 * cordilleras/muros. Los árboles y rocas decorativas no se generan porque su
 * posición vive en `render/world/sections/*`.
 */
function buildMapColliders(map: GameMap): Collider[] {
  const colliders: Collider[] = [];
  for (const base of map.respawns) {
    colliders.push({
      type: 'circle',
      x: base.x,
      z: base.z,
      radius: BASE_COLLIDER_RADIUS
    });
  }
  for (const range of map.mountains) {
    const samples = sampleRange(range.points, 0.8);
    for (let index = 1; index < samples.length; index++) {
      const a = samples[index - 1];
      const b = samples[index];
      colliders.push({
        type: 'segment',
        ax: a[0],
        az: a[1],
        bx: b[0],
        bz: b[1],
        radius: range.width / 2,
        sightRadius: range.width * 0.65
      });
    }
  }
  return colliders;
}

/** Muestreo suavizado idéntico al de `render/world/sections/barriers.ts`. */
function sampleRange(
  points: ReadonlyArray<readonly [number, number]>,
  step: number
): Array<[number, number]> {
  if (points.length === 0) return [];
  const out: Array<[number, number]> = [];
  let previous: readonly [number, number] = points[0];
  out.push([previous[0], previous[1]]);
  for (let index = 1; index < points.length - 1; index++) {
    const control = points[index];
    const next = points[index + 1];
    const end: [number, number] = [
      (control[0] + next[0]) / 2,
      (control[1] + next[1]) / 2
    ];
    const span =
      Math.hypot(control[0] - previous[0], control[1] - previous[1]) +
      Math.hypot(end[0] - control[0], end[1] - control[1]);
    const steps = Math.max(2, Math.ceil(span / step));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const inv = 1 - t;
      out.push([
        inv * inv * previous[0] + 2 * inv * t * control[0] + t * t * end[0],
        inv * inv * previous[1] + 2 * inv * t * control[1] + t * t * end[1]
      ]);
    }
    previous = end;
  }
  const last = points[points.length - 1];
  const span = Math.hypot(last[0] - previous[0], last[1] - previous[1]);
  const steps = Math.max(2, Math.ceil(span / step));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    out.push([
      previous[0] + (last[0] - previous[0]) * t,
      previous[1] + (last[1] - previous[1]) * t
    ]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// FX y mundo sin render
// ---------------------------------------------------------------------------

function createNoopFx(): CombatFxPort {
  const handle = {
    setPosition(_x: number, _z: number): void {},
    update(_dt: number): void {},
    destroy(): void {},
    setCenter(_x: number, _z: number): void {},
    setColor(_color: readonly [number, number, number]): void {}
  };
  // Todas las llamadas del puerto devuelven el mismo handle; las que declaran
  // `void` lo ignoran y las que esperan un handle reciben uno válido.
  return new Proxy(
    {},
    {
      get() {
        return () => handle;
      }
    }
  ) as CombatFxPort;
}

/** `World` reducido a lo que consume `sim/**`: colliders y límites. */
function createHeadlessWorld(
  colliders: Collider[],
  map: GameMap
): World {
  const bounds = {
    x: (map.tiles[0]?.length ?? 0) * map.tileSize * 0.5,
    z: map.tiles.length * map.tileSize * 0.5
  };
  return {
    colliders,
    bounds,
    waterHeight: map.waterHeight
  } as World;
}

// ---------------------------------------------------------------------------
// Hosts
// ---------------------------------------------------------------------------

interface Hosts {
  player: PlayerSystemHost;
  cast: CastSystemHost;
  dash: DashSystemHost;
  hit: HitSystemHost;
  projectile: ProjectileSystemHost;
  aoe: AoeSystemHost;
  atmosphere: AtmosphereSystemHost;
  status: StatusSystemHost;
  damage: DamageSystemHost;
  knockout: KnockoutHost;
  aoeResolution: AoeResolutionHost;
}

interface Metrics {
  casts: number;
  castsBySlot: Map<number, number>;
  hits: number;
  hitsBySlot: Map<number, number>;
  projectiles: number;
  aoes: number;
  distanceBySlot: Map<number, number>;
  kills: Array<{ at: number; killer: number; victim: number; ability: string }>;
}

interface FrameTrace {
  step: number;
  t: number;
  players: Array<{
    slot: number;
    team: Team;
    x: number;
    z: number;
    hp: number;
    alive: boolean;
    cast: string | null;
    dash: boolean;
    target: number | null;
    retreat: boolean;
    recovering: boolean;
  }>;
}

export interface SimSummary {
  map: string;
  mode: GameModeId;
  bots: number;
  difficulty: string;
  seed: number | 'random';
  fixedStep: number;
  steps: number;
  simSeconds: number;
  wallSeconds: number;
  speedRatio: number;
  matchOver: boolean;
  winner: Team | null;
  endReason: MatchEndReason | 'simulationLimit' | null;
  endDetail: string | null;
  scores: Record<Team, number>;
  players: Array<{
    slot: number;
    team: Team;
    pokemonId: string;
    commonAbilityId: string;
    kills: number;
    deaths: number;
    damageDealt: number;
    damageTaken: number;
    healing: number;
    xp: number;
    distance: number;
    casts: number;
    hits: number;
    hp: number;
    maxHp: number;
  }>;
  totals: {
    casts: number;
    hits: number;
    projectiles: number;
    aoes: number;
    kills: number;
  };
  kills: Metrics['kills'];
}

// ---------------------------------------------------------------------------
// Partida headless
// ---------------------------------------------------------------------------

export class HeadlessMatch {
  readonly map: GameMap;
  readonly world: World;
  readonly players: MatchPlayerState[] = [];
  readonly projectiles: Projectile[] = [];
  readonly activeAoes: ActiveAoe[] = [];
  readonly pendingAoeEnds: PendingAoeEnd[] = [];
  queuedCasts: QueuedCast[] = [];
  readonly bots = new Map<number, BotController>();
  readonly botSquad = createBotSquad();
  readonly botNav: BotNavGrid;
  readonly gameMode: GameModeRuntime;
  readonly objectiveZone: ObjectiveZone | null;
  readonly teamScores: Record<Team, number> = createTeamRecord(() => 0);
  readonly fx = createNoopFx();
  readonly metrics: Metrics = {
    casts: 0,
    castsBySlot: new Map(),
    hits: 0,
    hitsBySlot: new Map(),
    projectiles: 0,
    aoes: 0,
    distanceBySlot: new Map(),
    kills: []
  };

  pendingInstantHits: PendingInstantHit[] = [];
  pendingMeleeHits: PendingMeleeHit[] = [];
  visibleByTeam = createTeamRecord(() => new Set<number>());
  visibleByTeamScratch = createTeamRecord(() => new Set<number>());
  atmosphereTick = 0;
  simulationStep = 0;
  matchElapsed = 0;
  matchOver = false;
  winner: Team | null = null;
  endReason: MatchEndReason | null = null;
  endDetail: string | null = null;

  readonly atmosphere = 'clear' as const;
  readonly atmosphereVision = 1;
  readonly timeLimitSeconds: number;

  hosts: Hosts;
  private readonly options: Options;

  constructor(
    map: GameMap,
    options: Options,
    manifest: Map<string, PokemonEntry>
  ) {
    this.map = map;
    this.options = options;
    setActiveMap(map);

    const colliders = buildMapColliders(map);
    this.world = createHeadlessWorld(colliders, map);
    this.botNav = new BotNavGrid(colliders);

    const teams = map.teams.slice(0, 4);
    if (teams.length < 2) {
      throw new Error('El mapa necesita al menos dos equipos');
    }

    const settings = defaultModeSettings(options.mode);
    if (options.mode === 'tdm' && Number.isFinite(options.maxKos)) {
      settings.koTarget = options.maxKos;
    }
    const declaredObjective = map.objectives[0];
    this.objectiveZone =
      options.mode === 'koth'
        ? declaredObjective
          ? {
              x: declaredObjective.x,
              z: declaredObjective.z,
              radius: declaredObjective.radius
            }
          : { x: 0, z: 0, radius: 4.5 }
        : null;
    this.gameMode = createGameMode({
      modeId: options.mode,
      settings,
      objective: this.objectiveZone,
      objectives: this.objectiveZone ? [this.objectiveZone] : []
    });
    this.timeLimitSeconds = options.timeLimit;

    this.hosts = this.createHosts();

    for (let index = 0; index < options.bots; index++) {
      const team = teams[index % teams.length];
      const indexInTeam = Math.floor(index / teams.length);
      const pokemonId =
        options.pokemon[index % Math.max(1, options.pokemon.length)] ?? '0025';
      const commonAbilityId =
        options.common === 'mix'
          ? (['proteccion', 'impulso', 'regeneracion'] as const)[
              index % 3
            ]
          : options.common;
      const player = this.createPlayer(
        index,
        team,
        indexInTeam,
        pokemonId,
        commonAbilityId,
        manifest
      );
      this.players.push(player);
      this.metrics.distanceBySlot.set(player.slot, 0);
      this.metrics.castsBySlot.set(player.slot, 0);
      this.metrics.hitsBySlot.set(player.slot, 0);
      this.bots.set(
        player.slot,
        new BotController(
          player.slot,
          options.difficulty,
          this.botNav,
          this.botSquad
        )
      );
    }

    this.refreshVisibility();
    for (const player of this.players) {
      this.metrics.distanceBySlot.set(player.slot, 0);
    }
  }

  private createPlayer(
    slot: number,
    team: Team,
    indexInTeam: number,
    pokemonId: string,
    commonAbilityId: CommonAbilityId,
    manifest: Map<string, PokemonEntry>
  ): MatchPlayerState {
    const spawn = spawnForTeam(team, indexInTeam);
    const terrain = terrainAt(spawn.x, spawn.z);
    const terrainEffect = terrainSpeedEffect(terrain, []);
    const entry = manifest.get(pokemonId);
    if (!entry) {
      throw new Error(
        `El Pokémon "${pokemonId}" no aparece en public/sprites/manifest.json`
      );
    }
    const combat = combatStatsFor(baseStatsFor(pokemonId));
    const moveset = MOVESETS[pokemonId] ?? [null, null, null, null];
    const facing = facingToCenter(team, spawn.x, spawn.z);

    const config: MatchPlayerConfig = {
      slot,
      name: `Bot ${slot + 1}`,
      deviceId: `headless-bot-${slot}`,
      deviceKind: 'gamepad',
      team,
      pokemonId,
      commonAbilityId,
      movementMode: 'normal',
      isBot: true,
      botDifficulty: this.options.difficulty
    };

    return {
      ...config,
      types: entry.types,
      hitRadius: hitRadiusForPokemon(pokemonId),
      maxSpeed: speedForPokemon(pokemonId),
      x: spawn.x,
      z: spawn.z,
      facing,
      cameraYaw: cameraYawForTeam(team, spawn.x, spawn.z),
      vx: 0,
      vz: 0,
      submerge: 0,
      animation: 'idle',
      playback: 1,
      hidden: false,
      terrain,
      terrainMultiplier: terrainEffect.multiplier,
      terrainSpeedReason: terrainEffect.reason,
      visionRange: visionForPokemon(pokemonId),
      visionFactor: botVisionFactor(this.options.difficulty),
      concealment: terrainConcealment(terrain, entry.types),
      accent: entry.accent,
      enemiesSeeing: 0,
      spawn,
      combat,
      hp: combat.hp,
      maxHp: combat.hp,
      damageReduction: 0,
      shieldSpeedMultiplier: 1,
      damageReductionTimer: 0,
      shieldFx: null,
      hiddenTimer: 0,
      regenGraceTimer: 0,
      regenAccumulator: 0,
      regenerating: false,
      alive: true,
      respawnTimer: 0,
      invulnerableTimer: 0,
      stunTimer: 0,
      hurtTimer: 0,
      animationFrame: null,
      dash: null,
      activeCast: null,
      deathFade: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      damageDealt: 0,
      damageTaken: 0,
      abilityHealing: 0,
      pickupHealing: 0,
      xp: 0,
      xpBreakdown: emptyXpBreakdown(),
      killStreak: 0,
      recentKills: [],
      damageContributors: new Map(),
      slowContributors: new Map(),
      supportContributors: new Map(),
      killFarm: new Map(),
      participationTimer: 0,
      participationAwarded: 0,
      lastActionAt: 0,
      cooldowns: [0, 0, 0, 0, 0],
      cooldownTotals: [0, 0, 0, 0, 0],
      repeatAbilityId: null,
      repeatAbilityCount: 0,
      repeatAbilityAt: 0,
      buffs: [],
      slowEffects: [],
      slowMultiplier: 1,
      dots: [],
      abilityIds: [...moveset, commonAbilityId]
    };
  }

  // --- Hosts ---------------------------------------------------------------

  private createHosts(): Hosts {
    const damage: DamageSystemHost = {
      combatFx: this.fx,
      atmosphere: this.atmosphere,
      buffMultiplier: (player, stat) => this.buffMultiplier(player, stat),
      applySlow: (attacker, target, def, slow, color) =>
        this.applySlow(attacker, target, def, slow, color),
      activeCastArmor: (target) => this.activeCastArmor(target),
      spawnArmorFeedback: () => {},
      interruptWithRefund: (target, lethal) =>
        this.interruptWithRefund(target, lethal),
      applyKnockback: (target, fromX, fromZ, distance) =>
        this.applyKnockback(target, fromX, fromZ, distance),
      playImpactSound: () => {},
      showDamagePopup: () => {},
      showHealPopup: (target, amount, source) =>
        this.recordSupport(source, target, 'heal', amount),
      awardCombatXp: (attacker, target, applied, raw, final) =>
        this.awardCombatXp(attacker, target, applied, raw, final),
      awardXp: (player, source, amount) => this.awardXp(player, source, amount),
      vibrateOnDamage: () => {},
      knockOut: (target, killer, abilityName) =>
        this.knockOut(target, killer, abilityName)
    };

    const aoeResolution: AoeResolutionHost = {
      combatFx: this.fx,
      matchPlayers: this.players,
      world: this.world,
      pendingAoeEnds: this.pendingAoeEnds,
      isMatchOver: () => this.matchOver,
      canHit: (attacker, target) => this.canHit(attacker, target),
      applyAbilityDamage: (attacker, target, def, options) =>
        this.applyDamage(attacker, target, def, options),
      interruptWithRefund: (target, lethal) =>
        this.interruptWithRefund(target, lethal),
      applyKnockback: (target, fromX, fromZ, distance) =>
        this.applyKnockback(target, fromX, fromZ, distance),
      applySlow: (attacker, target, def, slow, color) =>
        this.applySlow(attacker, target, def, slow, color),
      reviveAoeAlly: (target, fraction, def, caster) =>
        this.reviveAoeAlly(target, fraction, def, caster),
      showHealPopup: (target, amount, source) =>
        this.recordSupport(source, target, 'heal', amount),
      awardXp: (player, source, amount) => this.awardXp(player, source, amount)
    };

    const aoe: AoeSystemHost = {
      activeAoes: this.activeAoes,
      pendingAoeEnds: this.pendingAoeEnds,
      isMatchOver: () => this.matchOver,
      resolveAoeHit: (hit) => resolveAoeHit(aoeResolution, hit),
      emitAoeEvent: (phase, player, def, x, z, dirX, dirZ, elapsed) =>
        emitAoeEvent(
          aoeResolution,
          phase,
          player,
          def,
          x,
          z,
          dirX,
          dirZ,
          elapsed
        )
    };

    const cast: CastSystemHost = {
      isMatchOver: () => this.matchOver,
      assetFor: () => undefined,
      queueCast: (player, def, targetX, targetZ, marker, dirX, dirZ, activeCast) =>
        this.queueCast(
          player,
          def,
          targetX,
          targetZ,
          marker,
          dirX,
          dirZ,
          activeCast
        ),
      updateCamera: () => {}
    };

    const dash: DashSystemHost = {
      matchPlayers: this.players,
      pendingInstantHits: this.pendingInstantHits,
      combatFx: this.fx,
      isMatchOver: () => this.matchOver,
      dashPosition: (player, x, z, dirX, dirZ, distance) =>
        this.dashPosition(player, x, z, dirX, dirZ, distance),
      canHit: (attacker, target) => this.canHit(attacker, target),
      dashSweepHits: (target, ax, az, bx, bz, dirX, dirZ, reach) =>
        this.dashSweepHits(target, ax, az, bx, bz, dirX, dirZ, reach),
      syncDashCast: (player, duration) => this.syncDashCast(player, duration),
      updateCamera: () => {}
    };

    const hit: HitSystemHost = {
      takeInstantHits: () => {
        const hits = this.pendingInstantHits;
        this.pendingInstantHits = [];
        return hits;
      },
      takeMeleeHits: () => {
        const hits = this.pendingMeleeHits;
        this.pendingMeleeHits = [];
        return hits;
      },
      world: this.world,
      combatFx: this.fx,
      isMatchOver: () => this.matchOver,
      canHit: (attacker, target) => this.canHit(attacker, target),
      dashSweepHits: (target, ax, az, bx, bz, dirX, dirZ, reach) =>
        this.dashSweepHits(target, ax, az, bx, bz, dirX, dirZ, reach),
      applyAbilityDamage: (attacker, target, def, options) =>
        this.applyDamage(attacker, target, def, options),
      applyKnockback: (target, fromX, fromZ, distance) =>
        this.applyKnockback(target, fromX, fromZ, distance),
      cancelCast: (player) => this.cancelCast(player)
    };

    const projectile: ProjectileSystemHost = {
      projectiles: this.projectiles,
      matchPlayers: this.players,
      world: this.world,
      combatFx: this.fx,
      isMatchOver: () => this.matchOver,
      canHit: (attacker, target) => this.canHit(attacker, target),
      applyAbilityDamage: (attacker, target, def, options) =>
        this.applyDamage(attacker, target, def, options),
      removeProjectile: (projectileToRemove) =>
        this.removeProjectile(projectileToRemove),
      playImpactSound: () => {}
    };

    const atmosphere: AtmosphereSystemHost = {
      isMatchOver: () => this.matchOver,
      showDamage: () => {},
      vibrate: () => {},
      emitStats: () => {}
    };

    const status: StatusSystemHost = {
      isMatchOver: () => this.matchOver,
      awardXp: (player, source, amount) => this.awardXp(player, source, amount),
      showHeal: () => {}
    };

    const player: PlayerSystemHost = {
      atmosphere: this.atmosphere,
      refreshSlowMultiplier: (target) => this.refreshSlowMultiplier(target),
      respawnPlayer: (target) => this.respawnPlayer(target),
      updateCamera: () => {},
      stepActiveCast: (target, input, dt) =>
        stepActiveCast(cast, target, input, dt),
      stepDash: (target, input, dt) => stepDash(dash, target, input, dt),
      buffMultiplier: (target, stat) => this.buffMultiplier(target, stat),
      resolvePosition: (target, x, z) => this.resolvePosition(target, x, z),
      castAbility: (target, slotIndex) => this.castAbility(target, slotIndex)
    };

    const knockout: KnockoutHost = {
      isMatchOver: () => this.matchOver,
      assetFor: () => undefined,
      cancelCast: (playerToCancel) => this.cancelCast(playerToCancel),
      clearRepeatCooldown: (playerToClear) =>
        this.clearRepeatCooldown(playerToClear),
      playDeathCopies: () => {},
      spawnDeathMarker: () => {},
      collectAssists: (killer, victim) => this.collectAssists(killer, victim),
      pushKillFeed: (killer, victim, abilityName, assists) =>
        this.pushKillFeed(killer, victim, abilityName, assists),
      awardKillXp: (killer, victim, assists) =>
        this.awardKillXp(killer, victim, assists),
      handleModeKnockout: (killer, victim) =>
        this.handleModeKnockout(killer, victim),
      emitStats: () => {}
    };

    return {
      player,
      cast,
      dash,
      hit,
      projectile,
      aoe,
      atmosphere,
      status,
      damage,
      knockout,
      aoeResolution
    };
  }

  // --- Combate -------------------------------------------------------------

  private cooldownForCast(
    player: MatchPlayerState,
    abilityId: string,
    def: AbilityDef
  ): number {
    const repeat = def.repeatCooldown;
    if (!repeat || repeat.step <= 0 || repeat.max <= 0) {
      this.clearRepeatCooldown(player);
      return def.cooldown;
    }
    const continues =
      player.repeatAbilityId === abilityId &&
      this.matchElapsed - player.repeatAbilityAt <= repeat.resetAfter;
    player.repeatAbilityCount = continues ? player.repeatAbilityCount + 1 : 0;
    player.repeatAbilityId = abilityId;
    player.repeatAbilityAt = this.matchElapsed;
    const extra = Math.min(player.repeatAbilityCount * repeat.step, repeat.max);
    return def.cooldown * (1 + extra);
  }

  private clearRepeatCooldown(player: MatchPlayerState): void {
    player.repeatAbilityId = null;
    player.repeatAbilityCount = 0;
    player.repeatAbilityAt = 0;
  }

  private hasQueuedCast(player: MatchPlayerState): boolean {
    return this.queuedCasts.some((cast) => cast.player === player);
  }

  private castAbility(player: MatchPlayerState, slotIndex: number): void {
    if (!player.alive || this.matchOver) return;
    if (player.activeCast || player.dash) return;
    if (this.hasQueuedCast(player)) return;
    const abilityId = player.abilityIds[slotIndex];
    if (!abilityId) return;
    const baseDef = ABILITIES[abilityId];
    if (!baseDef) return;
    if (player.cooldowns[slotIndex] > 0.0001) return;
    if (player.damageReductionTimer > 0) return;

    const def =
      slotIndex === 4
        ? {
            ...baseDef,
            animation: commonAnimationFor(
              player.pokemonId,
              player.commonAbilityId,
              baseDef
            )
          }
        : baseDef;

    breakRegen(player);
    if (player.invulnerableTimer > 0 && (def.power > 0 || def.slow !== null)) {
      player.invulnerableTimer = 0;
    }

    const cooldown = this.cooldownForCast(player, abilityId, def);
    player.cooldowns[slotIndex] = cooldown;
    player.cooldownTotals[slotIndex] = cooldown;
    if (!def.preserveMomentum) {
      player.vx = 0;
      player.vz = 0;
    }

    const plan = buildCastPlan(def, () => null);
    let dirX = Math.sin(player.facing);
    let dirZ = Math.cos(player.facing);

    const reach =
      def.shape === 'aoe'
        ? raycastColliderDistance(
            player.x,
            player.z,
            dirX,
            dirZ,
            def.range,
            this.world.colliders,
            CONFIG.combat.aoeSightPadding
          )
        : def.shape === 'beam'
          ? Math.max(
              0.1,
              raycastColliderDistance(
                player.x,
                player.z,
                dirX,
                dirZ,
                def.range,
                this.world.colliders
              )
            )
          : def.range;
    const targetX = player.x + dirX * reach;
    const targetZ = player.z + dirZ * reach;
    const teamAccent = TEAM_INFO[player.team].accent;
    const owner = { slot: player.slot, team: player.team };

    const marker =
      def.startup > 0 && def.shape === 'aoe'
        ? def.aoeShape === 'cone'
          ? this.fx.spawnAoeConeTelegraph(
              targetX,
              targetZ,
              dirX,
              dirZ,
              def.radius + maxHitRadius(),
              def.halfAngle,
              teamAccent,
              def.startup,
              Math.max(0.1, def.aoeDuration),
              owner
            )
          : this.fx.spawnAoeTelegraph(
              targetX,
              targetZ,
              def.radius + maxHitRadius(),
              teamAccent,
              def.startup,
              Math.max(0.1, def.aoeDuration),
              owner
            )
        : null;
    const lane =
      def.startup > 0 && def.shape === 'beam'
        ? this.fx.spawnBeamLane(
            player.x,
            player.z,
            targetX,
            targetZ,
            def.radius + maxHitRadius(),
            teamAccent,
            def.startup,
            def.beamStyle,
            owner
          )
        : null;

    const cast: ActiveCast = {
      def,
      slotIndex,
      elapsed: 0,
      plan,
      effectAt: plan.effectAt,
      fired: false,
      canceled: false,
      forcedFrame: null,
      forcedAnimation: null,
      forcedFrames: 0,
      hiddenCaster: false,
      invulnerableCaster: false,
      marker,
      lane,
      armorFx: null,
      armorRemaining: def.armorPool,
      targetX,
      targetZ,
      originX: targetX,
      originZ: targetZ,
      dirX,
      dirZ
    };
    player.activeCast = cast;

    if (def.armorPool > 0) {
      const armorDuration =
        def.armorWindow === 'cast' ? abilityTotalTime(def) : def.startup;
      cast.armorFx = this.fx.spawnArmorAura(
        player,
        player.accent,
        Math.max(0.7, player.hitRadius * 1.8),
        armorDuration
      );
    }

    if (def.shape === 'aoe') {
      emitAoeEvent(
        this.hosts.aoeResolution,
        'start',
        player,
        def,
        targetX,
        targetZ,
        dirX,
        dirZ,
        0
      );
    }

    if (plan.effectAt <= 0) {
      cast.fired = true;
      this.queueCast(player, def, targetX, targetZ, marker, dirX, dirZ, cast);
      armHitFrame(this.hosts.cast, player, cast);
    }

    applyCastPresentation(this.hosts.cast, player, cast);
    this.metrics.casts += 1;
    this.metrics.castsBySlot.set(
      player.slot,
      (this.metrics.castsBySlot.get(player.slot) ?? 0) + 1
    );
  }

  private queueCast(
    player: MatchPlayerState,
    def: AbilityDef,
    targetX: number | undefined,
    targetZ: number | undefined,
    marker: TelegraphHandle | null | undefined,
    dirX: number | undefined,
    dirZ: number | undefined,
    activeCast: ActiveCast
  ): void {
    this.queuedCasts.push({
      player,
      def,
      targetX,
      targetZ,
      marker,
      dirX,
      dirZ,
      activeCast
    });
  }

  private resolveQueuedCasts(): void {
    if (this.queuedCasts.length === 0) return;
    const casts = this.queuedCasts;
    this.queuedCasts = [];
    for (const cast of casts) {
      if (this.matchOver) break;
      if (cast.activeCast.canceled) continue;
      this.executeAbility(
        cast.player,
        cast.def,
        cast.targetX,
        cast.targetZ,
        cast.marker,
        cast.dirX,
        cast.dirZ,
        cast.activeCast
      );
    }
  }

  private executeAbility(
    player: MatchPlayerState,
    def: AbilityDef,
    targetX?: number,
    targetZ?: number,
    marker?: TelegraphHandle | null,
    dirX?: number,
    dirZ?: number,
    activeCast?: ActiveCast
  ): void {
    CAST_EFFECTS({
      player,
      def,
      combatFx: this.fx,
      showHealPopup: (target, amount) => {
        this.awardXp(
          target,
          'healing',
          amount * XP_REWARDS.healingPerHp
        );
      }
    });

    // Un solo token por lanzamiento: si la forma golpea a varios rivales o
    // tiene varios ticks, `healOnHit` cura una única vez.
    const healToken = def.healOnHit ? { healed: false } : undefined;

    const deps: AbilityExecutorDeps = {
      combatFx: this.fx,
      world: this.world,
      matchPlayers: this.players,
      spawnShield: () => {},
      canHit: (attacker, target) => this.canHit(attacker, target),
      applyAbilityDamage: (attacker, target, ability, options) =>
        this.applyDamage(attacker, target, ability, options),
      dashPosition: (source, x, z, sourceDirX, sourceDirZ, distance) =>
        this.dashPosition(source, x, z, sourceDirX, sourceDirZ, distance),
      addProjectile: (projectileToAdd) => {
        this.projectiles.push(projectileToAdd);
        this.metrics.projectiles += 1;
      },
      addActiveAoe: (aoeToAdd) => {
        this.activeAoes.push(aoeToAdd);
        this.metrics.aoes += 1;
      },
      activeCast,
      addPendingMeleeHit: (hitToAdd) => this.pendingMeleeHits.push(hitToAdd),
      marker,
      castDirX: dirX,
      castDirZ: dirZ,
      aimAssist: () => null,
      resolveAoeHit: (hit) =>
        resolveAoeHit(this.hosts.aoeResolution, hit),
      emitAoeEvent: (phase, source, ability, x, z, eventDirX, eventDirZ, elapsed) =>
        emitAoeEvent(
          this.hosts.aoeResolution,
          phase,
          source,
          ability,
          x,
          z,
          eventDirX,
          eventDirZ,
          elapsed
        ),
      healToken
    };

    ABILITY_EXECUTORS[def.shape](player, def, deps, targetX, targetZ);
    if (def.shape === 'dash' && player.dash) {
      this.syncDashCast(player, player.dash.duration);
    }
    this.applySelfDamage(player, def);
  }

  private syncDashCast(player: MatchPlayerState, duration: number): void {
    const cast = player.activeCast;
    if (!cast || cast.def.shape !== 'dash') return;
    const active = Math.max(0, Math.min(cast.def.active, duration));
    cast.plan = {
      ...cast.plan,
      activeEnd: cast.effectAt + active,
      endAt: cast.effectAt + active + Math.max(0, cast.def.recovery)
    };
  }

  private applySelfDamage(
    player: MatchPlayerState,
    def: AbilityDef
  ): void {
    if (def.selfDamage <= 0 || !player.alive) return;
    const raw = Math.round(player.maxHp * def.selfDamage);
    const amount = Math.min(raw, Math.max(0, player.hp - 1));
    if (amount <= 0) return;
    player.hp -= amount;
    player.damageTaken += amount;
    breakRegen(player);
    player.hurtTimer = Math.max(player.hurtTimer, 0.25);
  }

  private canHit(
    attacker: MatchPlayerState,
    target: MatchPlayerState
  ): boolean {
    return (
      target !== attacker &&
      target.alive &&
      target.team !== attacker.team &&
      target.invulnerableTimer <= 0
    );
  }

  private applyDamage(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    options?: DamageOptions
  ): boolean {
    const landed = applyAbilityDamage(
      this.hosts.damage,
      attacker,
      target,
      def,
      options
    );
    if (landed) {
      this.metrics.hits += 1;
      this.metrics.hitsBySlot.set(
        attacker.slot,
        (this.metrics.hitsBySlot.get(attacker.slot) ?? 0) + 1
      );
    }
    return landed;
  }

  private cancelCast(player: MatchPlayerState): void {
    const cast = player.activeCast;
    if (!cast) return;
    cast.canceled = true;
    if (cast.def.blockMovementDuringCast) this.cutCastAoes(cast);
    cast.marker?.destroy();
    cast.lane?.destroy();
    cast.armorFx?.destroy();
    cast.armorFx = null;
    if (cast.hiddenCaster) player.hidden = false;
    if (cast.invulnerableCaster) player.invulnerableTimer = 0;
    player.activeCast = null;
    player.animationFrame = null;
  }

  private cutCastAoes(cast: ActiveCast): void {
    for (let index = this.activeAoes.length - 1; index >= 0; index--) {
      const aoe = this.activeAoes[index];
      if (aoe.cast !== cast) continue;
      aoe.fx?.destroy();
      this.activeAoes.splice(index, 1);
    }
  }

  private interruptWithRefund(
    target: MatchPlayerState,
    lethal: boolean
  ): void {
    const cast = target.activeCast;
    const beforeEffect = cast != null && !cast.fired;
    target.dash = null;
    this.cancelCast(target);
    if (!cast || !beforeEffect || lethal) return;
    const remaining = target.cooldowns[cast.slotIndex] ?? 0;
    const total =
      target.cooldownTotals[cast.slotIndex] ?? cast.def.cooldown;
    target.cooldowns[cast.slotIndex] = Math.min(remaining, total * 0.5);
  }

  private activeCastArmor(target: MatchPlayerState): number {
    const cast = target.activeCast;
    if (!cast || cast.def.armorPool <= 0) return 0;
    if (cast.def.armorWindow === 'startup' && cast.fired) return 0;
    return cast.armorRemaining;
  }

  private buffMultiplier(
    player: MatchPlayerState,
    stat: 'speed' | 'attack' | 'defense' | 'spAttack' | 'spDefense'
  ): number {
    let multiplier = 1;
    for (const buff of player.buffs) {
      if (buff.stat === stat) multiplier *= buff.multiplier;
    }
    return multiplier;
  }

  private applySlow(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    slow: { multiplier: number; duration: number },
    _color: readonly [number, number, number]
  ): void {
    if (slow.duration <= 0) return;
    const source = `${attacker.slot}:${def.id}`;
    if (target.slowEffects.some((effect) => effect.source === source)) return;
    target.slowEffects.push({
      source,
      multiplier: slow.multiplier,
      remaining: slow.duration
    });
    this.refreshSlowMultiplier(target);
    if (attacker.team !== target.team) {
      target.slowContributors.set(attacker.slot, this.matchElapsed);
    }
  }

  private refreshSlowMultiplier(target: MatchPlayerState): void {
    target.slowMultiplier = target.slowEffects.reduce(
      (slowest, effect) => Math.min(slowest, effect.multiplier),
      1
    );
  }

  private applyKnockback(
    target: MatchPlayerState,
    fromX: number,
    fromZ: number,
    distance: number
  ): void {
    if (distance <= 0) return;
    const dx = target.x - fromX;
    const dz = target.z - fromZ;
    const length = Math.hypot(dx, dz);
    if (length < 0.0001) return;
    const resolved = this.dashPosition(
      target,
      target.x,
      target.z,
      dx / length,
      dz / length,
      distance
    );
    target.x = resolved.x;
    target.z = resolved.z;
  }

  private removeProjectile(projectile: Projectile): void {
    const index = this.projectiles.indexOf(projectile);
    if (index < 0) return;
    projectile.visual.destroy();
    this.projectiles.splice(index, 1);
  }

  // --- Colisiones ----------------------------------------------------------

  private resolvePosition(
    self: Pick<MatchPlayerState, 'types' | 'team'>,
    x: number,
    z: number
  ): { x: number; z: number } {
    const radius = CONFIG.player.radius;
    const colliders = this.world.colliders;
    let px = x;
    let pz = z;

    for (let iteration = 0; iteration < 4; iteration++) {
      let pushed = false;

      for (const collider of colliders) {
        const closest = closestPointOnCollider(collider, px, pz);
        const dx = px - closest.x;
        const dz = pz - closest.z;
        const distance = Math.hypot(dx, dz);
        const minimum = collider.radius + radius;
        if (distance < minimum) {
          if (distance < 0.0001) {
            px += minimum;
          } else {
            px = closest.x + (dx / distance) * minimum;
            pz = closest.z + (dz / distance) * minimum;
          }
          pushed = true;
        }
      }

      if (!self.types.includes('Water')) {
        const resolved = resolveDeepWater(px, pz, radius);
        if (resolved[0] !== px || resolved[1] !== pz) {
          px = resolved[0];
          pz = resolved[1];
          pushed = true;
        }
      }

      const resolvedTeam = resolveTeamTerrain(px, pz, radius, self.team);
      if (resolvedTeam[0] !== px || resolvedTeam[1] !== pz) {
        px = resolvedTeam[0];
        pz = resolvedTeam[1];
        pushed = true;
      }

      for (const other of this.players) {
        if (other === self || !other.alive) continue;
        const dx = px - other.x;
        const dz = pz - other.z;
        const distance = Math.hypot(dx, dz);
        const minimum = radius * 2;
        if (distance < minimum) {
          if (distance < 0.0001) {
            px += minimum;
          } else {
            px = other.x + (dx / distance) * minimum;
            pz = other.z + (dz / distance) * minimum;
          }
          pushed = true;
        }
      }

      if (!pushed) break;
    }

    const bounds = this.world.bounds;
    return {
      x: Math.min(bounds.x, Math.max(-bounds.x, px)),
      z: Math.min(bounds.z, Math.max(-bounds.z, pz))
    };
  }

  private dashPosition(
    self: MatchPlayerState,
    startX: number,
    startZ: number,
    dirX: number,
    dirZ: number,
    distance: number
  ): { x: number; z: number } {
    const stepLength = 0.15;
    const steps = Math.max(1, Math.ceil(distance / stepLength));
    const stepX = (dirX * distance) / steps;
    const stepZ = (dirZ * distance) / steps;
    const stepSize = Math.hypot(stepX, stepZ);
    const colliders = this.world.colliders;
    let x = startX;
    let z = startZ;

    for (let index = 0; index < steps; index++) {
      const targetX = x + stepX;
      const targetZ = z + stepZ;
      if (
        segmentBlockedByColliders(
          x,
          z,
          targetX,
          targetZ,
          colliders,
          CONFIG.player.radius
        )
      ) {
        break;
      }

      const next = this.resolvePosition(self, targetX, targetZ);
      const moved = Math.hypot(next.x - x, next.z - z);
      if (moved < stepSize * 0.35) break;
      x = next.x;
      z = next.z;
    }

    return { x, z };
  }

  private dashSweepHits(
    target: MatchPlayerState,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    dirX: number,
    dirZ: number,
    reach: number
  ): boolean {
    if ((target.x - ax) * dirX + (target.z - az) * dirZ < 0) return false;
    if (pointSegmentDistance(target.x, target.z, ax, az, bx, bz) > reach) {
      return false;
    }
    const closest = closestPointOnSegment(target.x, target.z, ax, az, bx, bz);
    return !segmentBlockedByColliders(
      closest.x,
      closest.z,
      target.x,
      target.z,
      this.world.colliders
    );
  }

  // --- Vida, muerte y XP ---------------------------------------------------

  private respawnPlayer(player: MatchPlayerState): void {
    const resolved = this.resolvePosition(
      player,
      player.spawn.x,
      player.spawn.z
    );
    this.revivePlayer(player, resolved.x, resolved.z, 1);
  }

  private revivePlayer(
    player: MatchPlayerState,
    x: number,
    z: number,
    hpFraction: number
  ): void {
    player.x = x;
    player.z = z;
    player.facing = facingToCenter(player.team, x, z);
    player.vx = 0;
    player.vz = 0;
    player.hp = Math.max(
      1,
      Math.round(player.maxHp * Math.min(1, Math.max(0, hpFraction)))
    );
    player.alive = true;
    player.respawnTimer = 0;
    player.invulnerableTimer = CONFIG.combat.invulnerabilitySeconds;
    player.stunTimer = 0;
    player.hurtTimer = 0;
    player.animationFrame = null;
    player.dash = null;
    this.cancelCast(player);
    this.clearRepeatCooldown(player);
    player.deathFade = 0;
    player.cooldowns[4] = 0;
    player.cooldownTotals[4] = 0;
    player.buffs = [];
    player.slowEffects = [];
    player.slowMultiplier = 1;
    player.damageReductionTimer = 0;
    player.damageReduction = 0;
    player.shieldSpeedMultiplier = 1;
    breakRegen(player);
    player.animation = 'idle';
    player.playback = 1;
    player.terrain = terrainAt(player.x, player.z);
    const terrainEffect = terrainSpeedEffect(player.terrain, player.types);
    player.terrainMultiplier = terrainEffect.multiplier;
    player.terrainSpeedReason = terrainEffect.reason;
    player.concealment = terrainConcealment(player.terrain, player.types);
    player.submerge = 0;
  }

  private reviveAoeAlly(
    target: AoeFallenAlly<MatchPlayerState>,
    fraction: number,
    _def: AbilityDef,
    caster: MatchPlayerState
  ): boolean {
    const player = target.player;
    if (player.alive) return false;
    if (!target.lineOfSight) return false;
    this.revivePlayer(player, player.x, player.z, fraction);
    this.recordSupport(caster, player, 'revive');
    this.awardXp(caster, 'revive', XP_REWARDS.revive);
    return true;
  }

  /**
   * Registra la curación o el revive de un aliado, con la misma ventana que la
   * partida real, para que las asistencias del banco de pruebas no divergan.
   */
  private recordSupport(
    source: MatchPlayerState | null,
    target: MatchPlayerState,
    kind: 'heal' | 'revive',
    amount = 0
  ): void {
    if (!source || source === target || source.team !== target.team) return;
    if (kind === 'heal' && amount <= 0) return;
    const window = XP_RULES.assistWindowSeconds;
    const now = this.matchElapsed;
    let contribution: SupportContribution | undefined =
      target.supportContributors.get(source.slot);
    if (
      !contribution ||
      now - Math.max(contribution.healAt, contribution.reviveAt) > window
    ) {
      contribution = { heal: 0, healAt: 0, revives: 0, reviveAt: 0 };
      target.supportContributors.set(source.slot, contribution);
    }
    if (kind === 'heal') {
      contribution.heal += amount;
      contribution.healAt = now;
    } else {
      contribution.revives += 1;
      contribution.reviveAt = now;
    }
  }

  private collectAssists(
    killer: MatchPlayerState,
    victim: MatchPlayerState
  ): AssistCredit[] {
    const playersBySlot = new Map(
      this.players.map((player) => [player.slot, player])
    );
    return collectKillAssists(
      killer,
      victim,
      playersBySlot,
      this.matchElapsed
    );
  }

  private knockOut(
    target: MatchPlayerState,
    killer: MatchPlayerState,
    abilityName: string
  ): void {
    knockOutSystem(this.hosts.knockout, target, killer, abilityName);
  }

  private pushKillFeed(
    killer: MatchPlayerState,
    victim: MatchPlayerState,
    abilityName: string,
    _assists: readonly AssistCredit[]
  ): void {
    this.metrics.kills.push({
      at: this.matchElapsed,
      killer: killer.slot,
      victim: victim.slot,
      ability: abilityName
    });
  }

  private awardXp(
    player: MatchPlayerState,
    source: XpSource,
    amount: number
  ): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    player.xp += amount;
    player.xpBreakdown[source] += amount;
    if (source !== 'participation' && source !== 'result') {
      player.lastActionAt = this.matchElapsed;
    }
  }

  private awardCombatXp(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    appliedDamage: number,
    rawDamage: number,
    finalDamage: number
  ): void {
    if (
      appliedDamage <= 0 ||
      attacker === target ||
      attacker.team === target.team
    ) {
      return;
    }
    const maxHp = Math.max(1, target.maxHp);
    const contribution = target.damageContributors.get(attacker.slot) ?? {
      amount: 0,
      at: this.matchElapsed,
      xp: 0
    };
    contribution.amount += appliedDamage;
    contribution.at = this.matchElapsed;
    target.damageContributors.set(attacker.slot, contribution);

    const room = XP_REWARDS.damageCapPerVictim - contribution.xp;
    if (room > 0) {
      const gained = Math.min(
        room,
        (appliedDamage / maxHp) * XP_REWARDS.damagePerMaxHp
      );
      contribution.xp += gained;
      this.awardXp(attacker, 'damage', gained);
    }

    this.awardXp(
      target,
      'taken',
      (appliedDamage / maxHp) * XP_REWARDS.takenPerMaxHp
    );

    const blocked = Math.max(0, rawDamage - finalDamage);
    if (blocked > 0) {
      this.awardXp(
        target,
        'blocked',
        (blocked / maxHp) * XP_REWARDS.blockedPerMaxHp
      );
    }
  }

  private awardKillXp(
    killer: MatchPlayerState,
    target: MatchPlayerState,
    assists: readonly AssistCredit[]
  ): void {
    const farm = killer.killFarm.get(target.slot);
    const repeated =
      farm && this.matchElapsed - farm.at <= XP_RULES.killFarmWindowSeconds
        ? farm.count
        : 0;
    const multiplier = repeated === 0 ? 1 : repeated === 1 ? 0.5 : 0.25;
    killer.killFarm.set(target.slot, {
      count: repeated + 1,
      at: this.matchElapsed
    });
    this.awardXp(killer, 'ko', XP_REWARDS.ko * multiplier);

    if (target.killStreak >= XP_RULES.shutdownStreak) {
      this.awardXp(killer, 'shutdown', XP_REWARDS.shutdown);
    }

    for (const assist of assists) {
      const assistant = this.players.find(
        (player) => player.slot === assist.slot
      );
      if (!assistant) continue;
      assistant.assists += 1;
      this.awardXp(assistant, 'assist', assistXpFor(assist.kinds));
    }

    killer.recentKills.push(this.matchElapsed);
    killer.recentKills = killer.recentKills.filter(
      (at) => this.matchElapsed - at <= XP_RULES.multikillWindowSeconds
    );
    const chain = killer.recentKills.length;
    if (chain === 2) {
      this.awardXp(killer, 'multikill', XP_REWARDS.multikill2);
    } else if (chain === 3) {
      this.awardXp(killer, 'multikill', XP_REWARDS.multikill3);
    } else if (chain === 4) {
      this.awardXp(killer, 'multikill', XP_REWARDS.multikill4);
    }

    killer.killStreak += 1;
  }

  private awardMatchResult(winner: Team | null): void {
    for (const player of this.players) {
      this.awardXp(
        player,
        'result',
        winner !== null && player.team === winner
          ? XP_REWARDS.win
          : XP_REWARDS.loss
      );
    }
  }

  // --- Modo ----------------------------------------------------------------

  private modeContext(): ModeContext {
    return {
      elapsed: this.matchElapsed,
      timeLimitSeconds: this.timeLimitSeconds,
      scores: this.teamScores,
      players: this.players,
      objective: this.objectiveZone
    };
  }

  private applyModeXp(awards: readonly ModeXpAward[]): void {
    for (const award of awards) {
      if (!Number.isFinite(award.amount) || award.amount <= 0) continue;
      const player = this.players.find(
        (candidate) => candidate.slot === award.slot
      );
      if (!player) continue;
      this.awardXp(player, award.source, award.amount);
    }
  }

  private advanceGameMode(dt: number): void {
    if (this.matchOver) return;
    const context = this.modeContext();
    const result = this.gameMode.onEvent(context, { type: 'tick', dt });
    this.applyModeXp(result.xp);
    if (result.outcome) {
      this.finishMatch(result.outcome);
      return;
    }
    if (this.timeLimitSeconds <= 0) return;
    if (this.matchElapsed < this.timeLimitSeconds) return;
    this.finishMatch(this.gameMode.resolveTimeout(context));
  }

  private handleModeKnockout(
    killer: MatchPlayerState,
    victim: MatchPlayerState
  ): void {
    const result = this.gameMode.onEvent(this.modeContext(), {
      type: 'knockout',
      killerSlot: killer.slot,
      victimSlot: victim.slot,
      killerTeam: killer.team,
      victimTeam: victim.team
    });
    this.applyModeXp(result.xp);
    if (result.outcome) this.finishMatch(result.outcome);
  }

  private finishMatch(outcome: {
    winner: Team | null;
    reason: MatchEndReason;
    detail: string;
  }): void {
    if (this.matchOver) return;
    this.matchOver = true;
    this.winner = outcome.winner;
    this.endReason = outcome.reason;
    this.endDetail = outcome.detail;
    this.awardMatchResult(outcome.winner);
  }

  // --- Visibilidad y paso --------------------------------------------------

  private refreshVisibility(): void {
    const previous = this.visibleByTeam;
    const current = this.visibleByTeamScratch;
    refreshCombatVisibility(
      this.players,
      previous,
      current,
      this.world.colliders,
      this.atmosphereVision
    );
    this.visibleByTeam = current;
    this.visibleByTeamScratch = previous;
  }

  private botViews(): Record<Team, BotWorldView> {
    const objective = this.gameMode.getBotObjective() ?? undefined;
    return {
      red: {
        visibleSlots: this.visibleByTeam.red,
        atmosphere: this.atmosphere,
        objective
      },
      blue: {
        visibleSlots: this.visibleByTeam.blue,
        atmosphere: this.atmosphere,
        objective
      },
      yellow: {
        visibleSlots: this.visibleByTeam.yellow,
        atmosphere: this.atmosphere,
        objective
      },
      green: {
        visibleSlots: this.visibleByTeam.green,
        atmosphere: this.atmosphere,
        objective
      }
    };
  }

  step(): void {
    if (this.matchOver) return;

    this.simulationStep += 1;
    this.matchElapsed += FIXED_STEP;

    // `Game` descuenta los frames forzados una vez por render. Aquí hay un
    // render por paso, así que se descuentan aquí; si no, un casteo con pose de
    // impacto nunca terminaría.
    for (const player of this.players) {
      const cast = player.activeCast;
      if (cast && cast.forcedFrames > 0) cast.forcedFrames--;
    }

    this.advanceGameMode(FIXED_STEP);
    if (this.matchOver) return;

    this.botNav.beginFrame();
    const hazards: readonly BotHazard[] =
      this.bots.size > 0
        ? buildBotHazards(this.projectiles, this.activeAoes)
        : [];
    const views = this.botViews();

    for (const player of this.players) {
      const bot = player.isBot ? this.bots.get(player.slot) : null;
      const input: DeviceInputSnapshot = bot
        ? bot.update(
            FIXED_STEP,
            player,
            this.players,
            this.world.colliders,
            undefined,
            hazards,
            views[player.team]
          )
        : IDLE_INPUT;
      stepPlayer(this.hosts.player, player, input, FIXED_STEP);
      if (this.matchOver) break;
    }

    if (!this.matchOver) {
      stepDamageOverTime(
        this.players,
        FIXED_STEP,
        this.hosts.damage,
        () => this.matchOver
      );
    }

    if (!this.matchOver) {
      this.atmosphereTick = stepAtmosphere(
        this.players,
        FIXED_STEP,
        this.atmosphere,
        this.atmosphereTick,
        this.hosts.atmosphere
      );
    }

    if (!this.matchOver) {
      this.resolveQueuedCasts();
      if (!this.matchOver) stepInstantHits(this.hosts.hit);
      if (!this.matchOver) stepMeleeHits(this.hosts.hit);
      if (!this.matchOver) stepProjectiles(this.hosts.projectile, FIXED_STEP);
      if (!this.matchOver) stepActiveAoes(this.hosts.aoe, FIXED_STEP);
      if (!this.matchOver) stepPendingAoeEnds(this.hosts.aoe, FIXED_STEP);
    }

    this.refreshVisibility();

    if (!this.matchOver) {
      stepRegeneration(this.players, FIXED_STEP, this.hosts.status);
      stepParticipation(
        this.players,
        FIXED_STEP,
        this.matchElapsed,
        this.hosts.status
      );
    }

    for (const player of this.players) {
      const previous = this.previousPositions.get(player.slot);
      if (previous) {
        this.metrics.distanceBySlot.set(
          player.slot,
          (this.metrics.distanceBySlot.get(player.slot) ?? 0) +
            Math.hypot(player.x - previous.x, player.z - previous.z)
        );
      }
      this.previousPositions.set(player.slot, {
        x: player.x,
        z: player.z
      });
    }

    if (this.options.duel && !this.matchOver && this.metrics.kills.length > 0) {
      this.finishDuel();
    }
  }

  /** Cierra el duelo en el primer KO; el ganador es el equipo del lanzador. */
  private finishDuel(): void {
    const kill = this.metrics.kills[0];
    const killer = this.players.find((player) => player.slot === kill.killer);
    const victim = this.players.find((player) => player.slot === kill.victim);
    const winner =
      killer && victim && killer.team !== victim.team ? killer.team : null;
    this.finishMatch({
      winner,
      reason: 'koTarget',
      detail: 'Duelo cerrado en el primer KO.'
    });
  }

  private readonly previousPositions = new Map<
    number,
    { x: number; z: number }
  >();

  // --- Instrumentación -----------------------------------------------------

  traceFrame(): FrameTrace {
    return {
      step: this.simulationStep,
      t: Number(this.matchElapsed.toFixed(4)),
      players: this.players.map((player) => {
        const bot = this.bots.get(player.slot) as unknown as
          | {
              target?: MatchPlayerState | null;
              retreat?: boolean;
              recovering?: boolean;
            }
          | undefined;
        return {
          slot: player.slot,
          team: player.team,
          x: Number(player.x.toFixed(3)),
          z: Number(player.z.toFixed(3)),
          hp: Number(player.hp.toFixed(1)),
          alive: player.alive,
          cast: player.activeCast?.def.id ?? null,
          dash: player.dash !== null,
          target: bot?.target?.slot ?? null,
          retreat: bot?.retreat ?? false,
          recovering: bot?.recovering ?? false
        };
      })
    };
  }

  summary(
    wallSeconds: number,
    steps: number,
    seed: number | 'random'
  ): SimSummary {
    return {
      map: this.map.id,
      mode: this.options.mode,
      bots: this.players.length,
      difficulty: this.options.difficulty,
      seed,
      fixedStep: FIXED_STEP,
      steps,
      simSeconds: Number(this.matchElapsed.toFixed(3)),
      wallSeconds: Number(wallSeconds.toFixed(3)),
      speedRatio: wallSeconds > 0 ? this.matchElapsed / wallSeconds : 0,
      matchOver: this.matchOver,
      winner: this.winner,
      endReason: this.matchOver
        ? this.endReason
        : 'simulationLimit',
      endDetail: this.endDetail,
      scores: { ...this.teamScores },
      players: this.players.map((player) => ({
        slot: player.slot,
        team: player.team,
        pokemonId: player.pokemonId,
        commonAbilityId: player.commonAbilityId,
        kills: player.kills,
        deaths: player.deaths,
        damageDealt: Math.round(player.damageDealt),
        damageTaken: Math.round(player.damageTaken),
        healing: Math.round(player.abilityHealing + player.pickupHealing),
        xp: Math.round(player.xp),
        distance: Number(
          (this.metrics.distanceBySlot.get(player.slot) ?? 0).toFixed(1)
        ),
        casts: this.metrics.castsBySlot.get(player.slot) ?? 0,
        hits: this.metrics.hitsBySlot.get(player.slot) ?? 0,
        hp: Number(player.hp.toFixed(1)),
        maxHp: player.maxHp
      })),
      totals: {
        casts: this.metrics.casts,
        hits: this.metrics.hits,
        projectiles: this.metrics.projectiles,
        aoes: this.metrics.aoes,
        kills: this.metrics.kills.length
      },
      kills: this.metrics.kills
    };
  }
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

export function formatSummary(summary: SimSummary): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('Simulación headless newpoke');
  lines.push(
    `Mapa: ${summary.map} | Modo: ${summary.mode} | Bots: ${summary.bots} | ` +
      `Dificultad: ${summary.difficulty} | Seed: ${summary.seed}`
  );
  lines.push(
    `Duración: ${summary.simSeconds.toFixed(1)} s de simulación ` +
      `(${summary.steps} pasos de ${(summary.fixedStep * 1000).toFixed(1)} ms) ` +
      `en ${summary.wallSeconds.toFixed(2)} s reales ` +
      `(${summary.speedRatio.toFixed(0)}x tiempo real)`
  );
  lines.push(
    `Resultado: ${
      summary.matchOver
        ? summary.winner
          ? `gana ${summary.winner}`
          : 'empate'
        : 'partida en curso'
    } | ${summary.endReason ?? '-'}` +
      (summary.endDetail ? ` | ${summary.endDetail}` : '')
  );
  lines.push(
    `Marcador: ${Object.entries(summary.scores)
      .map(([team, score]) => `${team} ${score}`)
      .join('  ')}`
  );
  lines.push(
    `Totales: ${summary.totals.kills} KOs, ${summary.totals.casts} casteos, ` +
      `${summary.totals.hits} impactos, ${summary.totals.projectiles} proyectiles, ` +
      `${summary.totals.aoes} áreas`
  );
  lines.push('');
  lines.push(
    '| slot | equipo | Pokémon | KOs | muertes | daño | recibido | curación | XP | dist | casteos | impactos |'
  );
  lines.push(
    '| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
  );
  for (const player of summary.players) {
    lines.push(
      `| ${player.slot} | ${player.team} | ${player.pokemonId} | ` +
        `${player.kills} | ${player.deaths} | ${player.damageDealt} | ` +
        `${player.damageTaken} | ${player.healing} | ${player.xp} | ` +
        `${player.distance} | ${player.casts} | ${player.hits} |`
    );
  }
  if (summary.kills.length > 0) {
    lines.push('');
    lines.push('Últimas bajas:');
    for (const kill of summary.kills.slice(-8)) {
      lines.push(
        `  ${kill.at.toFixed(1)} s: slot ${kill.killer} mató a slot ` +
          `${kill.victim} con ${kill.ability}`
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const seed =
    options.seed === 'random'
      ? Math.floor(Math.random() * 0xffffffff)
      : options.seed;
  if (options.seed !== 'random') {
    Math.random = mulberry32(seed as number);
  }

  const manifest = loadManifest(
    path.resolve('public/sprites/manifest.json')
  );
  const map = loadMapFile(options.map);
  const match = new HeadlessMatch(map, options, manifest);
  const totalSteps = Math.round(options.seconds / FIXED_STEP);

  if (!options.quiet) {
    console.log(
      `Simulando ${options.seconds} s (${totalSteps} pasos) en ${map.name} ` +
        `con ${options.bots} bots...`
    );
  }

  const trace: FrameTrace[] = [];
  const started = performance.now();
  let steps = 0;
  for (let index = 0; index < totalSteps; index++) {
    match.step();
    steps += 1;
    if (
      options.trace &&
      (index % options.every === 0 || match.matchOver)
    ) {
      trace.push(match.traceFrame());
    }
    if (match.matchOver) break;
  }
  const wallSeconds = (performance.now() - started) / 1000;
  const summary = match.summary(wallSeconds, steps, seed);

  if (options.trace) {
    const payload = trace.map((frame) => JSON.stringify(frame)).join('\n');
    writeFileSync(path.resolve(options.trace), `${payload}\n`);
  }
  if (options.json) {
    writeFileSync(
      path.resolve(options.json),
      `${JSON.stringify(summary, null, 2)}\n`
    );
  }
  if (!options.quiet) {
    console.log(formatSummary(summary));
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) main();
