import * as pc from 'playcanvas';
import {
  ABILITIES,
  ABILITY_SLOTS,
  DEFAULT_COMMON_ABILITY,
  MOVESETS,
  REGENERATION_DELAY_SECONDS,
  REGENERATION_HP_PER_SECOND,
  commonAbilityOption,
  commonAnimationFor,
  isCommonAbilityId,
  type AbilityDef,
  type AbilitySlot,
  type BuffSpec,
  type BuffStat,
  type SlowSpec
} from './abilities';
import {
  ABILITY_EXECUTORS,
  type AbilityExecutorDeps
} from './abilityExecutors';
import {
  defaultAoeEffect,
  type AoeEffectContext,
  type AoeFallenAlly,
  type AoeHitInput,
  type AoeHitOptions,
  type AoeTarget
} from './aoeEffect';
import { Actor } from './actor';
import {
  configureAudio,
  disposeAudio,
  pauseMatchMusic,
  playAbilityCast,
  playAbilityImpact,
  resumeMatchMusic,
  startMatchMusic,
  stopMatchMusic
} from './audio';
import { BotController, createBotSquad } from './bot';
import { BotNavGrid } from './botNav';
import { CameraRig } from './camera';
import {
  KO_TARGET,
  closestPointOnCollider,
  closestPointOnSegment,
  computeDamage,
  pointBlockedByColliders,
  pointSegmentDistance,
  raycastColliderDistance,
  rollAccuracy,
  rollCritical,
  rollRandomFactor,
  sectorOverlapsCircle,
  segmentBlockedByColliders
} from './combat';
import { CombatFx } from './combatFx';
import { CONFIG, DEG, RAD } from './config';
import { DamageNumbers, type DamageNumberView } from './damageNumbers';
import { DeathMarker } from './deathMarker';
import { applyHealFraction, applyHealSelf, CAST_EFFECTS } from './effects';
import { FogDecal, FogMask, FogView, createFogDecalMesh, createFogMesh, type SightOccluder, type VisionCircle } from './fog';
import {
  IDLE_INPUT,
  Input,
  type DeviceInputSnapshot,
  type InputDeviceInfo,
  type InputFrame,
  type MenuAction
} from './input';
import type { PickupSpawn } from './items';
import { loadMap, loadMapIndex, type MapIndexEntry } from './map';
import type {
  ActiveAoe,
  HealOnHitToken,
  MatchPlayerState,
  PendingInstantHit,
  PendingMeleeHit,
  Projectile,
  QueuedCast,
  SlowEffect
} from './matchState';
import {
  PickupField,
  disposeItemTextures,
  loadItemTextures,
  type ItemTextureMap,
  type PickupHandlers
} from './pickups';
import {
  MAX_PLAYERS,
  TEAM_INFO,
  cameraYawForTeam,
  computeSplitLayout,
  facingToCenter,
  spawnForTeam,
  syncTeamsWithMap,
  type MatchEndResult,
  type MatchPlayerConfig,
  type KillFeedEntry,
  type PlayerMatchStats
} from './multiplayer';
import { baseStatsFor, combatStatsFor } from './pokedex';
import { hitRadiusForPokemon, maxHitRadius, speedForPokemon } from './roster';
import { rumbleOnDamage } from './rumble';
import { disposeSpriteAsset, loadSpriteAsset, type SpriteAsset } from './sprite';
import {
  XP_REWARDS,
  XP_RULES,
  emptyXpBreakdown,
  levelFromXp,
  xpStatus,
  type XpSource
} from './xp';
import {
  TERRAINS,
  getActiveMap,
  resolveDeepWater,
  setActiveMap,
  terrainAt,
  type GameMap,
  type Team
} from './terrain';
import { terrainSpeedEffect } from './terrainSpeed';
import { typeEffectiveness } from './typeChart';
import type { AnimationName, LoadingProgress, SpriteManifest } from './types';
import {
  effectiveVisionRange,
  isTargetVisible,
  terrainConcealment,
  visionForPokemon
} from './vision';
import { buildWorld, type Collider, type World } from './world';

export interface GameCallbacks {
  onReady(manifest: SpriteManifest, maps: MapIndexEntry[], activeMapId: string): void;
  onProgress(progress: LoadingProgress): void;
  onError(message: string): void;
  onDevicesChanged(devices: InputDeviceInfo[]): void;
  onMenuInput(event: { deviceId: string; action: MenuAction }): void;
  onPauseRequest(): void;
  onMatchStats(stats: PlayerMatchStats[]): void;
  onMatchEnd(result: MatchEndResult): void;
  /** Segundos restantes de la cuenta atrás inicial; `null` al terminar. */
  onCountdown(remaining: number | null): void;
}

export interface GameOptions {
  /** Mapa que se carga al montar `/play`. */
  mapId?: string;
  /** Manifiesto ya descargado por la sesión, para no pedirlo dos veces. */
  manifest?: SpriteManifest;
  /** KOs de equipo necesarios para ganar; por defecto, `CONFIG.combat.koTarget`. */
  koTarget?: number;
}

function angleLerp(current: number, target: number, t: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * Math.min(1, Math.max(0, t));
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Convierte el `accent` hexadecimal del manifiesto a 0-255. */
function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  if (value.length !== 6) return [255, 255, 255];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

/** Tipos vacíos: la ocultación de un punto usa solo el terreno, sin especie. */
const NO_TYPES: readonly string[] = [];

/** Segundos que cada KO permanece en el feed antes de desaparecer. */
const KILL_FEED_TTL_SECONDS = 6;
/** Tope de entradas del feed; al llenarse se descarta la más antigua. */
const KILL_FEED_MAX_ENTRIES = 4;
/** Cuenta atrás antes de que los jugadores puedan moverse al empezar. */
const MATCH_COUNTDOWN_SECONDS = 5;
/** Tiempo que se mantiene el cartel de salida después de la cuenta atrás. */
const MATCH_COUNTDOWN_GO_SECONDS = 0.8;
/** Altura del decal de KO sobre el suelo. */
const DEATH_MARKER_GROUND_Y = 0.06;
/** Separación de la marca sobre la superficie cuando el KO ocurre en el agua. */
const DEATH_MARKER_WATER_LIFT = 0.02;

/**
 * Orquestador del motor. React nunca toca la escena: pide empezar/terminar una
 * partida y recibe eventos de entrada y telemetría por callbacks.
 *
 * Multijugador local:
 * - 1-8 jugadores, un teclado y varios mandos.
 * - Dos equipos con base propia.
 * - Una cámara por jugador y una copia de cada actor por viewport: el billboard
 *   y la fila de 8 direcciones dependen de la cámara, así que compartir actores
 *   entre vistas haría que mirasen mal desde los otros ángulos.
 */
export class Game {
  private readonly callbacks: GameCallbacks;
  private readonly options: GameOptions;
  private readonly app: pc.Application;
  private readonly input: Input;

  /**
   * El mundo y la cámara de menú se crean en `init`, después de cargar el JSON
   * del mapa, y se reconstruyen al cambiar de mapa.
   */
  private world!: World;
  private menuCamera!: CameraRig;
  private mapIndex: MapIndexEntry[] = [];
  private activeMapId = '';

  private readonly baseCameraLayers: number[];
  /** Capa del mundo: respaldo de los FX fuera de partida. */
  private readonly worldLayerId: number;

  private manifest: SpriteManifest | null = null;
  private readonly assets = new Map<string, SpriteAsset>();
  /** Texturas de los objetos recogibles, cargadas una vez por partida. */
  private readonly itemTextures: ItemTextureMap = new Map();
  /** Objetos del mapa activo; se reconstruyen al cambiar de mapa. */
  private pickups: PickupField | null = null;
  /** Objetos que superaron la validación de posición y se ofrecen a los bots. */
  private pickupSpawns: readonly PickupSpawn[] = [];
  private readonly pickupHandlers: PickupHandlers = {
    pokemonFor: (player) => this.assets.get(player.pokemonId)?.entry ?? null,
    heal: (player, amount) => {
      if (!player.alive) return 0;
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + amount);
      const healed = player.hp - before;
      player.pickupHealing += healed;
      if (healed > 0) {
        this.awardXp(player, 'healing', healed * XP_REWARDS.healingPerHp);
      }
      return healed;
    },
    showHeal: (player, amount) => this.showHealPopup(player, amount),
    onCollected: (player, definition) => {
      this.combatFx.spawnBuff(player.x, player.z, hexToRgb(definition.color), 1.05);
      this.awardXp(player, 'pickup', XP_REWARDS.pickup);
    },
    canReach: (player, spawn) => {
      const colliders = this.world.colliders;
      // Los objetos no se recogen a través de muros, rocas ni árboles.
      if (segmentBlockedByColliders(player.x, player.z, spawn.x, spawn.z, colliders)) {
        return false;
      }
      // La niebla también cuenta: un objeto fuera de la visión del equipo no se
      // consume. Se usa su máscara para que la visibilidad de recogida coincida
      // con la que se pinta en pantalla; los objetos no aplican la ocultación
      // del terreno, así que la máscara se consulta sin esa capa.
      const mask = this.fogMasks.get(player.team);
      if (mask) return mask.isVisibleAt(spawn.x, spawn.z);
      return this.teamSeesPoint(player.team, spawn.x, spawn.z, 0, colliders);
    }
  };

  private matchPlayers: MatchPlayerState[] = [];
  /**
   * Vistas locales (cámaras/paneles). Los bots juegan en `matchPlayers` pero no
   * consumen una vista: así un humano contra tres bots no parte la pantalla en
   * cuatro ni renderiza el mundo cuatro veces.
   */
  private views: MatchPlayerState[] = [];
  private bots = new Map<number, BotController>();
  private viewLayers: pc.Layer[] = [];
  /** Marca de KO en el suelo, una copia por vista. Solo la ve su equipo. */
  private deathMarkers = new Map<number, Array<DeathMarker | null>>();
  /** Proyectiles activos de todas las vistas. */
  private projectiles: Projectile[] = [];
  /** Áreas persistentes con daño periódico. */
  private activeAoes: ActiveAoe[] = [];
  /** Golpes melee del frame actual, resueltos después de mover a todos. */
  private pendingMeleeHits: PendingMeleeHit[] = [];
  /** Habilidades instantáneas que esperan al final del frame para ejecutarse. */
  private queuedCasts: QueuedCast[] = [];
  /** Golpes de dash detectados al moverse, resueltos con el resto del frame. */
  private pendingInstantHits: PendingInstantHit[] = [];
  /** Marcador de la partida; gana el primero que llegue a `koTarget`. */
  private teamScores: Record<Team, number> = { blue: 0, red: 0 };
  /** Límite de KOs de esta partida, fijado al crearla. */
  private readonly koTarget: number;
  /** Últimos KOs globales; cada vista pinta su propio feed con esta lista. */
  private killFeed: KillFeedEntry[] = [];
  private killFeedSeq = 0;
  /** Tiempo de simulación de la partida, usado para caducar el feed. */
  private matchElapsed = 0;
  private matchOver = false;
  private winner: Team | null = null;
  private readonly combatFx: CombatFx;
  private readonly damageNumbers: DamageNumbers;
  /** Quads de niebla, uno por vista. */
  private fogViews: FogView[] = [];
  /** Malla compartida por todas las vistas; se crea en la primera partida. */
  private fogMesh: pc.Mesh | null = null;
  /** Decals de sombra de cordillera en el suelo, uno por vista. */
  private fogDecals: FogDecal[] = [];
  private fogDecalMesh: pc.Mesh | null = null;
  /**
   * Máscara de visibilidad world-space por equipo. Es independiente de la
   * cámara, así que todas las vistas del mismo equipo comparten la suya.
   */
  private readonly fogMasks = new Map<Team, FogMask>();
  /** Buffers de círculos por vista, para poner el observador local primero. */
  private readonly viewCircles: VisionCircle[][] = [];
  /** Tramos de cordillera y árboles que proyectan sombra dentro de la niebla. */
  private sightOccluders: SightOccluder[] = [];
  /**
   * Slots visibles para cada equipo en el frame anterior. La visión es
   * compartida, así que la histéresis también se guarda por equipo.
   */
  private visibleByTeam: Record<Team, Set<number>> = {
    blue: new Set(),
    red: new Set()
  };
  /**
   * Objetos que cada equipo ve y si están disponibles. Solo contiene puntos
   * visibles: los bots no pueden consultar el estado del resto.
   */
  private pickupKnowledge: Record<Team, Map<string, boolean>> = {
    blue: new Map(),
    red: new Map()
  };

  private ready = false;
  private mode: 'menu' | 'match' = 'menu';
  private paused = false;
  /** Segundos restantes de la cuenta atrás inicial. */
  private countdown = 0;
  /** Tiempo que queda mostrando el cartel de salida. */
  private countdownGo = 0;
  /** Último segundo enviado a React, para no repetir el callback cada frame. */
  private countdownShown: number | null = null;
  private disposed = false;

  private statsTimer = 0;
  private fps = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks, options: GameOptions = {}) {
    this.callbacks = callbacks;
    this.options = options;
    this.koTarget = Math.max(1, Math.floor(options.koTarget ?? KO_TARGET));

    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: false
      }
    });
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);

    this.input = new Input(canvas);

    this.baseCameraLayers = ['World', 'Depth', 'Skybox', 'UI', 'Immediate']
      .map((name) => this.app.scene.layers.getLayerByName(name)?.id)
      .filter((id): id is number => id !== undefined);

    const worldLayerId =
      this.app.scene.layers.getLayerByName('World')?.id ?? pc.LAYERID_WORLD;
    this.worldLayerId = worldLayerId;

    // El SoundManager de PlayCanvas se crea con la aplicación; los sonidos se
    // precargan en segundo plano mientras se construye el mapa.
    configureAudio(this.app);
    // Los FX preguntan en qué capas de vista deben dibujarse; el resolvedor usa
    // la misma visibilidad que la niebla de los actores.
    this.combatFx = new CombatFx(
      this.app,
      worldLayerId,
      (x, z, ignoreTerrainConcealment) =>
        this.fxLayersAt(x, z, ignoreTerrainConcealment)
    );
    this.damageNumbers = new DamageNumbers(this.app);

    this.app.on('update', this.onUpdate);
    this.app.start();
  }

  async init(): Promise<void> {
    try {
      this.callbacks.onProgress({ loaded: 0, total: 17, label: 'Cargando mapas' });
      this.mapIndex = await loadMapIndex();
      const entry =
        this.mapIndex.find((candidate) => candidate.id === this.options.mapId) ??
        this.mapIndex[0];
      const map = await loadMap(entry);

      this.callbacks.onProgress({ loaded: 0, total: 17, label: 'Cargando objetos' });
      const itemTextures = await loadItemTextures(this.app);
      for (const [id, textures] of itemTextures) this.itemTextures.set(id, textures);

      this.applyMap(map);

      let manifest = this.options.manifest ?? null;
      if (!manifest) {
        this.callbacks.onProgress({
          loaded: 0,
          total: 12,
          label: 'Leyendo el manifiesto de sprites'
        });
        const response = await fetch(
          `${import.meta.env.BASE_URL}sprites/manifest.json?v=${Date.now()}`
        );
        if (!response.ok) {
          throw new Error(`No se pudo cargar el manifiesto (HTTP ${response.status})`);
        }
        manifest = (await response.json()) as SpriteManifest;
      }
      this.manifest = manifest;

      const total = manifest.pokemon.length * 4;
      let loaded = 0;
      this.callbacks.onProgress({ loaded, total, label: 'Cargando sprites' });

      await Promise.all(
        manifest.pokemon.map(async (entry) => {
          const asset = await loadSpriteAsset(this.app.graphicsDevice, entry);
          this.assets.set(entry.id, asset);
          loaded += 4;
          this.callbacks.onProgress({
            loaded,
            total,
            label: `${entry.name} listo`
          });
        })
      );

      if (this.disposed) return;

      this.ready = true;
      this.mode = 'menu';
      this.menuCamera.setEnabled(true);
      this.callbacks.onReady(manifest, this.mapIndex, this.activeMapId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido al cargar';
      this.callbacks.onError(message);
    }
  }

  /** Cambia el mapa activo. Solo se permite desde el menú. */
  async selectMap(id: string): Promise<boolean> {
    if (!this.ready || this.mode !== 'menu' || id === this.activeMapId) return false;
    const entry = this.mapIndex.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`No existe el mapa "${id}"`);
    const map = await loadMap(entry);
    this.applyMap(map);
    this.menuCamera.setEnabled(true);
    return true;
  }

  /**
   * Reemplaza el mundo actual por el mapa indicado. Se usa al arrancar y al
   * cambiar de mapa; destruye la partida anterior para no dejar entidades ni
   * materiales del mapa anterior.
   */
  private applyMap(map: GameMap): void {
    this.clearMatch();
    this.pickups?.dispose();
    this.pickups = null;
    this.menuCamera?.dispose();
    this.world?.dispose();

    setActiveMap(map);
    syncTeamsWithMap();
    this.world = buildWorld(this.app);
    // Los objetos se validan contra el mundo ya construido: un centro fuera de
    // los límites, en agua profunda o dentro de un collider (muro, roca, árbol,
    // base...) no se crea y tampoco se ofrece a los bots.
    this.pickupSpawns = map.pickups.filter((spawn) => {
      const issue = this.pickupPlacementIssue(map, spawn);
      if (issue) {
        console.warn(
          `[items] Se descarta ${spawn.type} en (${spawn.x}, ${spawn.z}): ${issue}.`
        );
        return false;
      }
      return true;
    });
    this.pickups = new PickupField(this.app, this.world.shadowMaterial, this.itemTextures);
    this.pickups.setMap(this.pickupSpawns);
    this.activeMapId = map.id;
    this.rebuildSightOccluders();
    this.menuCamera = new CameraRig(this.app, map.spawn);
    this.refreshSunShadows();
  }

  /**
   * Motivo por el que un objeto del mapa no sería alcanzable, o `null` si lo es.
   * Se comprueba con el mundo ya construido, así que cubre también los props
   * procedurales que no están declarados en el JSON.
   */
  private pickupPlacementIssue(map: GameMap, spawn: PickupSpawn): string | null {
    const cols = map.tiles[0]?.length ?? 0;
    const rows = map.tiles.length;
    const tileSize = map.tileSize;
    const halfX = (cols * tileSize) / 2;
    const halfZ = (rows * tileSize) / 2;
    if (
      !Number.isFinite(spawn.x) ||
      !Number.isFinite(spawn.z) ||
      spawn.x < -halfX ||
      spawn.x > halfX ||
      spawn.z < -halfZ ||
      spawn.z > halfZ
    ) {
      return 'fuera de los límites del mapa';
    }
    const col = Math.floor((spawn.x + halfX) / tileSize);
    const row = Math.floor((spawn.z + halfZ) / tileSize);
    if (map.tiles[row]?.[col] === 'waterHigh') {
      return 'en aguas profundas';
    }
    if (pointBlockedByColliders(spawn.x, spawn.z, this.world?.colliders ?? [])) {
      return 'dentro de un obstáculo';
    }
    return null;
  }

  /**
   * Rehornea el shadow map del sol cuando hay sombras activas. El mapa es
   * estático y los actores no proyectan sombra direccional, así que basta con
   * renderizarlas una vez por encuadre de cámara en vez de repetir el pase por
   * cada viewport del splitscreen. Sin sombras activas no hace nada.
   */
  private refreshSunShadows(): void {
    if (!CONFIG.sun.shadows) return;
    const sun = this.app.root.findByName('sun') as pc.Entity | null;
    if (sun?.light) sun.light.shadowUpdateMode = pc.SHADOWUPDATE_THISFRAME;
  }

  private rebuildSightOccluders(): void {
    this.sightOccluders = this.world.colliders.flatMap<SightOccluder>((collider) => {
      if (collider.sightRadius === undefined) return [];
      if (collider.type === 'segment') {
        return [
          {
            x: (collider.ax + collider.bx) / 2,
            z: (collider.az + collider.bz) / 2,
            // Mismo radio que usa la línea de visión: la sombra de la niebla
            // cubre exactamente la zona en la que un actor queda oculto.
            radius: collider.sightRadius,
            ax: collider.ax,
            az: collider.az,
            bx: collider.bx,
            bz: collider.bz
          }
        ];
      }
      // Árboles: oclusor puntual con el radio de la copa. Antes no proyectaban
      // sombra y un Pokémon podía desaparecer detrás de ellos con la niebla
      // despejada.
      return [
        {
          x: collider.x,
          z: collider.z,
          radius: collider.sightRadius,
          ax: collider.x,
          az: collider.z,
          bx: collider.x,
          bz: collider.z
        }
      ];
    });
  }

  /** Empieza una partida con los jugadores ya elegidos en React. */
  startMatch(configs: MatchPlayerConfig[]): boolean {
    if (!this.ready || configs.length === 0) return false;

    // Nunca se descarta a un jugador en silencio: un sprite que no llegó a
    // cargarse dejaría la partida en 1v0 y el HUD repartiría los paneles con
    // otro número de jugadores. Mejor abortar y avisar para volver al roster.
    const missing = configs.filter(
      (config) => !this.assets.has(config.pokemonId)
    );
    if (missing.length > 0) {
      const ids = [...new Set(missing.map((config) => config.pokemonId))];
      this.callbacks.onError(
        `No se pudo cargar el sprite de ${ids.join(', ')}. Vuelve al roster e inténtalo de nuevo.`
      );
      return false;
    }

    this.clearMatch();
    this.pickups?.reset();

    // El lobby ya limita el número de jugadores; se recorta por seguridad.
    const valid = configs.slice(0, MAX_PLAYERS);
    if (valid.length === 0) return false;

    // Una partida necesita al menos una vista humana. Los bots completan los
    // equipos, pero no sustituyen al jugador local.
    const humanConfigs = valid.filter((config) => !config.isBot);
    if (humanConfigs.length === 0) {
      this.callbacks.onError('Añade al menos un jugador humano antes de empezar.');
      return false;
    }

    this.mode = 'match';
    this.paused = false;
    startMatchMusic();
    this.statsTimer = 0;
    this.fps = 0;
    this.countdown = MATCH_COUNTDOWN_SECONDS;
    this.countdownGo = 0;
    this.countdownShown = MATCH_COUNTDOWN_SECONDS;
    this.callbacks.onCountdown(MATCH_COUNTDOWN_SECONDS);
    this.menuCamera.setEnabled(false);
    this.app.graphicsDevice.maxPixelRatio = Math.min(
      window.devicePixelRatio || 1,
      humanConfigs.length > 4 ? 1.2 : 1.5
    );

    const layout = computeSplitLayout(humanConfigs.length);
    const hasBots = valid.some((config) => config.isBot);
    const botNav = hasBots ? new BotNavGrid(this.world.colliders) : null;
    const botSquad = hasBots ? createBotSquad() : null;
    const teamIndex: Record<Team, number> = { blue: 0, red: 0 };
    let viewIndex = 0;

    valid.forEach((config) => {
      const asset = this.assets.get(config.pokemonId);
      if (!asset) return;

      const isBot = config.isBot === true;
      const currentView = isBot ? -1 : viewIndex++;
      const indexInTeam = teamIndex[config.team];
      const spawn = spawnForTeam(config.team, indexInTeam);
      teamIndex[config.team] += 1;
      // El punto de aparición se resuelve también aquí, no solo al reaparecer:
      // si un collider o el agua profunda invaden la base, la primera copia y
      // la cámara deben nacer ya en una posición válida.
      const resolvedSpawn = this.resolvePosition(
        { types: asset.entry.types },
        spawn.x,
        spawn.z
      );
      const spawnPoint = { x: resolvedSpawn.x, z: resolvedSpawn.z };
      const facing = facingToCenter(config.team, spawnPoint.x, spawnPoint.z);
      const terrain = terrainAt(spawnPoint.x, spawnPoint.z);
      const spawnTerrainEffect = terrainSpeedEffect(terrain, asset.entry.types);
      const combat = combatStatsFor(baseStatsFor(config.pokemonId));
      const moveset = MOVESETS[config.pokemonId] ?? [null, null, null, null];
      const commonAbilityId = isCommonAbilityId(config.commonAbilityId)
        ? config.commonAbilityId
        : DEFAULT_COMMON_ABILITY;

      let layer: pc.Layer | null = null;
      if (!isBot) {
        layer = new pc.Layer({ name: `match-view-${currentView + 1}` });
        const layerComposition = this.app.scene.layers;
        const worldLayer = layerComposition.getLayerByName('World');
        // El cuerpo del sprite es opaco (alphaTest): debe ir antes de las
        // transparencias del mundo (agua, partículas) para que el agua pueda
        // taparle las piernas al sumergirse. El anillo y la sombra son
        // transparentes y van al final, por encima del agua.
        const worldTransparent = worldLayer
          ? layerComposition.getTransparentIndex(worldLayer)
          : -1;
        layerComposition.insertOpaque(
          layer,
          worldTransparent >= 0 ? worldTransparent : layerComposition.layerList.length
        );
        layerComposition.pushTransparent(layer);
        this.viewLayers.push(layer);
      }

      const camera = new CameraRig(this.app, spawnPoint);
      if (layer) {
        camera.setViewport(layout[currentView]);
        camera.setLayers([...this.baseCameraLayers, layer.id]);
        camera.setEnabled(true);
      } else {
        // Los bots conservan una cámara deshabilitada porque `stepPlayer` usa
        // su yaw para convertir la entrada en movimiento relativo.
        camera.setEnabled(false);
      }
      camera.yaw = cameraYawForTeam(config.team, spawnPoint.x, spawnPoint.z);
      camera.distance =
        CONFIG.camera.distance * (humanConfigs.length > 2 ? 1.12 : 1);

      const player: MatchPlayerState = {
        ...config,
        commonAbilityId,
        types: asset.entry.types,
        accent: hexToRgb(asset.entry.accent),
        maxSpeed: speedForPokemon(config.pokemonId),
        hitRadius: hitRadiusForPokemon(config.pokemonId),
        x: spawnPoint.x,
        z: spawnPoint.z,
        facing,
        vx: 0,
        vz: 0,
        submerge: 0,
        animation: 'idle',
        playback: 1,
        terrain,
        terrainMultiplier: spawnTerrainEffect.multiplier,
        terrainSpeedReason: spawnTerrainEffect.reason,
        visionRange: visionForPokemon(config.pokemonId),
        concealment: terrainConcealment(terrain, asset.entry.types),
        enemiesSeeing: 0,
        camera,
        copies: [],
        viewport: layer ? layout[currentView] : { x: 0, y: 0, w: 1, h: 1 },
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
        actionTimer: 0,
        actionPlayback: 1,
        moveLockTimer: 0,
        actionAnimation: null,
        actionHold: false,
        castLockTimer: 0,
        dash: null,
        pendingCast: null,
        deathFade: 0,
        kills: 0,
        deaths: 0,
        damageDealt: 0,
        damageTaken: 0,
        abilityHealing: 0,
        pickupHealing: 0,
        xp: 0,
        xpBreakdown: emptyXpBreakdown(),
        killStreak: 0,
        recentKills: [],
        damageContributors: new Map(),
        killFarm: new Map(),
        participationTimer: 0,
        participationAwarded: 0,
        lastActionAt: 0,
        cooldowns: [0, 0, 0, 0, 0],
        buffs: [],
        slowEffects: [],
        slowMultiplier: 1,
        abilityIds: [...moveset, commonAbilityId]
      };
      this.matchPlayers.push(player);

      if (isBot) {
        if (botNav && botSquad) {
          this.bots.set(
            config.slot,
            new BotController(
              config.slot,
              config.botDifficulty ?? 'normal',
              botNav,
              botSquad,
              // Los bots conocen las posiciones de los objetos, pero no su
              // estado disponible/usado. Solo reciben los que superaron la
              // validación de posición del mapa.
              this.pickupSpawns
            )
          );
        }
      } else {
        this.views.push(player);
      }

      if (layer) {
        this.fogViews.push(
          new FogView(
            this.app.graphicsDevice,
            this.ensureFogMesh(),
            camera.entity,
            layer.id,
            currentView
          )
        );
        this.fogDecals.push(
          new FogDecal(
            this.app.graphicsDevice,
            this.app.root,
            this.ensureFogDecalMesh(),
            layer.id,
            currentView,
            this.ensureFogMask(config.team)
          )
        );
      }
    });

    // Cada actor tiene una copia por vista (no por jugador): los bots se ven
    // en las pantallas humanas, pero no generan una vista propia.
    this.matchPlayers.forEach((player) => {
      const asset = this.assets.get(player.pokemonId);
      if (!asset) return;
      this.views.forEach((viewer, viewIndex) => {
        const copy = new Actor(
          this.app,
          asset,
          this.world.shadowMaterial,
          { x: player.x, z: player.z },
          player.facing,
          true,
          viewer.slot === player.slot,
          TEAM_INFO[player.team].accent,
          // Solo el Pokémon que controla este viewport va sin contorno.
          viewer.slot !== player.slot,
          player.hitRadius
        );
        const layer = this.viewLayers[viewIndex];
        if (layer) copy.setLayer(layer.id);
        copy.play('idle');
        player.copies.push(copy);
      });
    });

    // La máscara de niebla también alimenta la visibilidad de los objetos, así
    // que debe existir para los dos equipos aunque uno no tenga vistas humanas.
    this.ensureFogMask('blue');
    this.ensureFogMask('red');

    // Copias de los objetos por viewport: cada una vive en la capa de su vista
    // y se muestra únicamente cuando el equipo de esa vista ve el objeto.
    this.pickups?.setViewLayers(this.viewLayers.map((layer) => layer.id));

    // Con sombras del sol activas, el encuadre depende de la cámara: se
    // rehornean al empezar para cubrir las bases de ambos equipos.
    this.refreshSunShadows();

    this.callbacks.onMatchStats([]);
    return true;
  }

  /** Vuelve al menú de selección y destruye la partida actual. */
  endMatch(): void {
    this.clearMatch();
    stopMatchMusic();
    this.pickups?.reset();
    this.mode = 'menu';
    this.paused = false;
    this.statsTimer = 0;
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.menuCamera.setEnabled(true);
    this.refreshSunShadows();
    this.callbacks.onMatchStats([]);
    this.callbacks.onCountdown(null);
  }

  private clearMatch(): void {
    for (const projectile of this.projectiles) projectile.visual.destroy();
    this.projectiles = [];
    this.activeAoes = [];
    this.pendingMeleeHits = [];
    this.queuedCasts = [];
    this.pendingInstantHits = [];
    this.combatFx.clear();
    this.damageNumbers.clear();
    this.teamScores = { blue: 0, red: 0 };
    this.killFeed = [];
    this.killFeedSeq = 0;
    this.matchElapsed = 0;
    this.matchOver = false;
    this.winner = null;
    this.countdown = 0;
    this.countdownGo = 0;
    this.countdownShown = null;

    this.pickups?.clearViewLayers();

    for (const fog of this.fogViews) fog.destroy();
    this.fogViews = [];
    for (const decal of this.fogDecals) decal.destroy();
    this.fogDecals = [];
    // Las vistas y los decals comparten estas mallas. Al destruir sus
    // instancias, PlayCanvas libera la malla cuando se queda sin referencias,
    // así que no se pueden conservar para la revancha: se recrean al empezar
    // la siguiente partida.
    this.fogMesh?.destroy();
    this.fogMesh = null;
    this.fogDecalMesh?.destroy();
    this.fogDecalMesh = null;
    for (const mask of this.fogMasks.values()) mask.destroy();
    this.fogMasks.clear();
    this.viewCircles.length = 0;
    this.visibleByTeam = { blue: new Set(), red: new Set() };
    this.pickupKnowledge = { blue: new Map(), red: new Map() };

    for (const markers of this.deathMarkers.values()) {
      for (const marker of markers) marker?.destroy();
    }
    this.deathMarkers.clear();

    for (const player of this.matchPlayers) {
      for (const copy of player.copies) copy.destroy();
      player.copies = [];
      player.camera.dispose();
    }
    for (const layer of this.viewLayers) this.app.scene.layers.remove(layer);
    this.matchPlayers = [];
    this.views = [];
    this.bots.clear();
    this.viewLayers = [];
  }

  /**
   * Quad unitario compartido por todas las vistas. Cada `FogView` crea su
   * propia instancia y su propio material; lo único compartido es la malla.
   */
  private ensureFogMesh(): pc.Mesh {
    if (!this.fogMesh) this.fogMesh = createFogMesh(this.app.graphicsDevice);
    return this.fogMesh;
  }

  /** Plano horizontal compartido por los decals de sombra. */
  private ensureFogDecalMesh(): pc.Mesh {
    if (!this.fogDecalMesh) this.fogDecalMesh = createFogDecalMesh(this.app.graphicsDevice);
    return this.fogDecalMesh;
  }

  /**
   * Máscara world-space del equipo. Se crea una sola vez por equipo y la
   * comparten todas sus vistas: el resultado no depende de la cámara.
   */
  private ensureFogMask(team: Team): FogMask {
    let mask = this.fogMasks.get(team);
    if (!mask) {
      mask = new FogMask(
        this.app.graphicsDevice,
        this.sightOccluders,
        `fog-mask-${team}`
      );
      this.fogMasks.set(team, mask);
    }
    return mask;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.mode === 'match' && !this.matchOver) {
      if (paused) pauseMatchMusic();
      else resumeMatchMusic();
    }
    if (!paused) return;
    for (const player of this.matchPlayers) {
      player.vx = 0;
      player.vz = 0;
      // Un jugador KO conserva su faint; un dash o un hitstun tampoco se
      // interrumpen visualmente al pausar.
      if (
        !player.alive ||
        player.dash !== null ||
        player.pendingCast !== null ||
        player.stunTimer > 0 ||
        player.hurtTimer > 0
      ) {
        continue;
      }
      player.animation = 'idle';
      player.playback = 1;
      for (const copy of player.copies) copy.play('idle');
    }
  }

  private onUpdate = (dt: number): void => {
    if (this.disposed || !this.world) return;
    const frameDt = Math.min(dt, 0.05);
    const frame = this.input.poll();

    if (frame.changed) this.callbacks.onDevicesChanged(frame.devices);

    this.fps =
      this.fps === 0
        ? 1 / Math.max(frameDt, 0.0001)
        : this.fps * 0.92 + (1 / Math.max(frameDt, 0.0001)) * 0.08;

    if (!this.ready) {
      this.world.update(frameDt);
      return;
    }

    const wasPaused = this.paused;

    // En menús y en pausa, React recibe las acciones de borde. Durante la
    // partida activa el motor las consume para pausar/movernos.
    if (this.mode === 'menu' || this.paused) {
      for (const event of frame.actions) this.callbacks.onMenuInput(event);
    }

    if (this.mode === 'menu') {
      this.updateMenu(frameDt);
      return;
    }

    // Con la partida terminada se deja respirar al mundo y a los efectos, pero
    // no se simulan jugadores ni habilidades.
    if (this.matchOver) {
      this.world.update(frameDt);
      this.combatFx.update(frameDt);
      this.damageNumbers.update(frameDt);
      return;
    }

    if (this.paused) {
      this.world.update(frameDt);
      return;
    }

    // Si se acaba de reanudar con B/Esc, el mismo frame conserva el borde de
    // cancelar y volvería a pausar. Saltamos un frame de simulación.
    if (wasPaused) {
      this.world.update(frameDt);
      return;
    }

    // Cuenta atrás inicial: los jugadores ya ven el mapa y su HUD, pero la
    // simulación sigue congelada hasta que llega a cero.
    if (this.countdown > 0) {
      this.tickCountdown(frameDt);
      this.updateMatch(frameDt, frame, true);
      return;
    }

    if (this.countdownGo > 0) {
      this.countdownGo = Math.max(0, this.countdownGo - frameDt);
      if (this.countdownGo === 0) this.callbacks.onCountdown(null);
    }

    this.updateMatch(frameDt, frame);
  };

  /** Avanza la cuenta atrás y avisa a React cuando cambia el segundo visible. */
  private tickCountdown(dt: number): void {
    this.countdown = Math.max(0, this.countdown - dt);
    const second = this.countdown > 0 ? Math.ceil(this.countdown) : 0;
    if (second !== this.countdownShown) {
      this.countdownShown = second;
      this.callbacks.onCountdown(second);
    }
    if (this.countdown === 0) this.countdownGo = MATCH_COUNTDOWN_GO_SECONDS;
  }

  private updateMenu(dt: number): void {
    this.menuCamera.yaw += CONFIG.camera.attractSpeed * dt;
    this.menuCamera.update(dt, getActiveMap().spawn, 0, 0);
    this.world.update(dt);
    this.pickups?.update(dt, [this.menuCamera.position]);
  }

  private updateMatch(dt: number, frame: InputFrame, frozen = false): void {
    // Start/Escape/B pausan la partida. El coste de comprobarlo antes de mover
    // es despreciable y evita un frame de movimiento fantasma.
    for (const player of this.views) {
      const snapshot = frame.snapshots.get(player.deviceId) ?? IDLE_INPUT;
      if (snapshot.startPressed || snapshot.cancel) {
        this.setPaused(true);
        this.callbacks.onPauseRequest();
        return;
      }
    }

    if (!frozen) {
      this.matchElapsed += dt;

      for (const player of this.matchPlayers) {
        const bot = player.isBot ? this.bots.get(player.slot) : null;
        const input = bot
          ? bot.update(
              dt,
              player,
              this.matchPlayers,
              this.world.colliders,
              this.pickupKnowledge[player.team]
            )
          : frame.snapshots.get(player.deviceId) ?? IDLE_INPUT;
        this.stepPlayer(player, input, dt);
        // Defensivo: si alguna fase de `stepPlayer` llegara a cerrar la partida,
        // el resto de jugadores no debería seguir actuando.
        if (this.matchOver) break;
      }

      // Cada fase puede cerrar la partida; el resto no debe ejecutarse en el
      // mismo frame. La presentación (copias, niebla, FX) sí corre siempre.
      if (!this.matchOver) {
        // Las acciones se resuelven aquí, después de que todos los jugadores
        // hayan avanzado su turno. El orden es fijo y reproducible: casts
        // instantáneos (haces y áreas sin retardo) → golpes de dash → melee →
        // proyectiles → áreas. Dentro de cada fase se respeta el orden de
        // lanzamiento/creación. Si varios golpes son letales para el mismo
        // objetivo en este frame, el KO queda para el primero de ese orden.
        this.resolveQueuedCasts();
        if (!this.matchOver) this.resolveInstantHits();
        if (!this.matchOver) this.resolveMeleeHits();
        if (!this.matchOver) this.updateProjectiles(dt);
        if (!this.matchOver) this.updateActiveAoes(dt);
        if (!this.matchOver) this.pickups?.collect(this.matchPlayers, this.pickupHandlers);
      }
    }

    // Primero las cámaras ya están actualizadas; cada copia se orienta hacia
    // la cámara del viewport que la va a dibujar.
    this.views.forEach((cameraOwner, viewIndex) => {
      const cameraPosition = cameraOwner.camera.position;
      this.matchPlayers.forEach((player) => {
        const copy = player.copies[viewIndex];
        if (!copy) return;
        copy.setPosition(player.x, player.z);
        copy.setFacing(player.facing);
        copy.play(player.animation);
        // Solo la animación de preparación `once` deja de repetirse. El resto
        // (andar, reposo, clips en bucle) debe seguir avanzando: sin esto, un
        // windup móvil sin animación propia, como Giro Fuego, dejaba el caminar
        // congelado en su último frame para siempre.
        const pendingDef = player.pendingCast?.def;
        const windupClip = pendingDef
          ? pendingDef.windupAnimation ?? pendingDef.animation
          : null;
        // Un clip de preparación `once` se detiene en su último frame. Si al
        // lanzar se reutiliza ese mismo clip, se mantiene esa pose final en vez
        // de reiniciarlo: si no, la animación se ve dos veces seguidas.
        const holdAction =
          player.actionHold &&
          player.actionTimer > 0 &&
          player.animation === player.actionAnimation;
        copy.setLoop(
          !holdAction &&
            (windupClip === null ||
              player.animation !== windupClip ||
              pendingDef?.windupAnimationMode === 'loop')
        );
        copy.setPlayback(player.playback);
        copy.setSubmerge(player.submerge, this.world.waterHeight);
        copy.setHealth(player.alive ? player.hp / player.maxHp : 0);
        copy.setLevel(levelFromXp(player.xp));
        copy.setHitboxDebug(CONFIG.debug.showHitboxes);
        copy.update(dt, cameraPosition);
      });
      // El retrato de la marca de KO se mantiene de pie en cada vista aunque
      // la cámara orbite alrededor del cuerpo.
      this.deathMarkers.forEach((markers) => {
        markers[viewIndex]?.faceCamera(cameraPosition);
      });
    });

    // La niebla se resuelve después de mover a todos: cada copia se oculta en
    // las vistas que no la ven y cada cámara recibe la unión de círculos del
    // equipo.
    this.updateVision();
    if (!frozen) this.updateRegeneration(dt);
    if (!frozen) this.updateParticipation(dt);

    this.world.update(dt);
    this.pickups?.update(
      dt,
      this.views.map((view) => view.camera.position)
    );
    this.combatFx.update(dt);
    this.damageNumbers.update(dt);

    this.statsTimer += dt;
    if (this.statsTimer >= 0.25) {
      this.statsTimer = 0;
      this.emitMatchStats();
    }
  }

  private stepPlayer(player: MatchPlayerState, input: DeviceInputSnapshot, dt: number): void {
    // Temporizadores de combate: corren también mientras el jugador está KO.
    for (let index = 0; index < player.cooldowns.length; index++) {
      player.cooldowns[index] = Math.max(0, player.cooldowns[index] - dt);
    }
    for (const buff of player.buffs) buff.duration -= dt;
    player.buffs = player.buffs.filter((buff) => buff.duration > 0);
    if (player.slowEffects.length > 0) {
      for (const effect of player.slowEffects) effect.remaining -= dt;
      player.slowEffects = player.slowEffects.filter(
        (effect) => effect.remaining > 0
      );
      this.refreshSlowMultiplier(player);
    }
    if (player.invulnerableTimer > 0) {
      player.invulnerableTimer = Math.max(0, player.invulnerableTimer - dt);
    }
    if (player.damageReductionTimer > 0) {
      player.damageReductionTimer = Math.max(0, player.damageReductionTimer - dt);
      if (player.damageReductionTimer === 0) player.shieldSpeedMultiplier = 1;
    }
    if (player.stunTimer > 0) {
      player.stunTimer = Math.max(0, player.stunTimer - dt);
    }
    if (player.hurtTimer > 0) player.hurtTimer = Math.max(0, player.hurtTimer - dt);
    if (player.actionTimer > 0) {
      player.actionTimer = Math.max(0, player.actionTimer - dt);
      if (player.actionTimer === 0) player.actionHold = false;
    }
    if (player.castLockTimer > 0) {
      player.castLockTimer = Math.max(0, player.castLockTimer - dt);
    }
    if (player.moveLockTimer > 0) {
      player.moveLockTimer = Math.max(0, player.moveLockTimer - dt);
    }
    if (player.deathFade > 0) player.deathFade = Math.max(0, player.deathFade - dt);

    if (!player.alive) {
      player.vx = 0;
      player.vz = 0;
      player.respawnTimer = Math.max(0, player.respawnTimer - dt);
      if (player.respawnTimer <= 0) this.respawnPlayer(player);
      this.updateCamera(player, input, dt);
      return;
    }

    // Hitstun: bloquea movimiento y habilidades, pero deja girar la cámara.
    if (player.stunTimer > 0) {
      player.vx = 0;
      player.vz = 0;
      player.animation = 'hurt';
      player.playback = 1;
      const terrain = terrainAt(player.x, player.z);
      player.terrain = terrain;
      player.concealment = terrainConcealment(terrain, player.types);
      this.updateCamera(player, input, dt);
      return;
    }

    // Una habilidad con preparación bloquea movimiento y otras habilidades
    // mientras se reproduce su animación.
    if (this.stepPendingCast(player, input, dt)) return;

    // Un dash consume el frame: no se mezcla con el movimiento normal.
    if (this.stepDash(player, input, dt)) return;

    const yaw = player.camera.yaw;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    // El bloqueo de las melee ignora el input de movimiento y también impide
    // lanzar otra habilidad hasta que el clip termina; la cámara sigue girando.
    const moveX = player.moveLockTimer > 0 ? 0 : input.moveX;
    const moveY = player.moveLockTimer > 0 ? 0 : input.moveY;
    const desiredX = rightX * moveX + forwardX * moveY;
    const desiredZ = rightZ * moveX + forwardZ * moveY;
    const magnitude = Math.hypot(desiredX, desiredZ);

    const terrainEffect = terrainSpeedEffect(
      terrainAt(player.x, player.z),
      player.types
    );
    player.terrainMultiplier = terrainEffect.multiplier;
    player.terrainSpeedReason = terrainEffect.reason;
    const shieldSpeed =
      player.damageReductionTimer > 0 ? player.shieldSpeedMultiplier : 1;
    const maxSpeed =
      player.maxSpeed *
      terrainEffect.multiplier *
      this.buffMultiplier(player, 'speed') *
      player.slowMultiplier *
      shieldSpeed;

    const targetSpeed = maxSpeed * Math.min(1, magnitude);
    const currentSpeed = Math.hypot(player.vx, player.vz);

    if (magnitude > 0.001) {
      // El rumbo de avance gira hacia la entrada en vez de interpolar cada eje
      // por separado. Al mezclar `vx` y `vz` la inercia lateral sobrevive al
      // giro y el Pokémon derrapa: sigue desplazándose hacia el lado anterior
      // mientras ya mira hacia el nuevo. Girando el vector se conserva la
      // rapidez y el cuerpo traza un arco corto.
      const dirX = desiredX / magnitude;
      const dirZ = desiredZ / magnitude;
      // De entrada se apunta a la dirección exacta pedida. Solo se sustituye
      // por un rumbo intermedio si hace falta girar poco a poco.
      let headingX = dirX;
      let headingZ = dirZ;

      if (currentSpeed > 0.0001) {
        const currentX = player.vx / currentSpeed;
        const currentZ = player.vz / currentSpeed;
        const dot = clamp(currentX * dirX + currentZ * dirZ, -1, 1);
        const angle = Math.acos(dot);
        const maxStep = CONFIG.player.turnRate * dt;
        // Los giros casi opuestos se invierten en seco: girar el vector poco a
        // poco los desviaba hacia un lado trazando un arco en vez de volver.
        const snap = angle > CONFIG.player.turnSnapAngle * DEG;
        if (!snap && angle > maxStep) {
          const side = currentX * dirZ - currentZ * dirX >= 0 ? 1 : -1;
          const cos = Math.cos(maxStep);
          const sin = Math.sin(maxStep) * side;
          const nextX = currentX * cos - currentZ * sin;
          const nextZ = currentX * sin + currentZ * cos;
          headingX = nextX;
          headingZ = nextZ;
        }
      }

      const rate =
        (targetSpeed >= currentSpeed
          ? CONFIG.player.acceleration
          : CONFIG.player.deceleration) * dt;
      const nextSpeed =
        currentSpeed + clamp(targetSpeed - currentSpeed, -rate, rate);
      player.vx = headingX * nextSpeed;
      player.vz = headingZ * nextSpeed;
    } else if (currentSpeed > 0.0001) {
      // Sin entrada se frena en línea recta, conservando el rumbo.
      const nextSpeed = Math.max(0, currentSpeed - CONFIG.player.deceleration * dt);
      const scale = nextSpeed / currentSpeed;
      player.vx *= scale;
      player.vz *= scale;
    } else {
      player.vx = 0;
      player.vz = 0;
    }

    const resolved = this.resolvePosition(
      player,
      player.x + player.vx * dt,
      player.z + player.vz * dt
    );
    player.x = resolved.x;
    player.z = resolved.z;

    const speed = Math.hypot(player.vx, player.vz);
    if (speed > CONFIG.player.minFacingSpeed) {
      const targetFacing = Math.atan2(player.vx, player.vz);
      player.facing = angleLerp(
        player.facing,
        targetFacing,
        1 - Math.exp(-CONFIG.player.turnLerp * dt)
      );
    }

    // Prioridad de animación: daño > ataque > andar > reposo. Durante un
    // windup móvil, andar tiene prioridad sobre el ataque para no deslizar.
    if (player.hurtTimer > 0) {
      player.animation = 'hurt';
      player.playback = 1;
    } else if (
      player.actionTimer > 0 &&
      player.actionAnimation !== null &&
      !(
        player.pendingCast?.def.moveWhileWindup &&
        speed > CONFIG.player.minFacingSpeed
      )
    ) {
      player.animation = player.actionAnimation;
      player.playback = player.actionPlayback;
    } else if (speed > CONFIG.player.minFacingSpeed) {
      player.animation = 'walk';
      player.playback = clamp(
        speed / CONFIG.sprite.walkRateRefSpeed,
        CONFIG.sprite.walkRateMin,
        CONFIG.sprite.walkRateMax
      );
    } else {
      player.animation = 'idle';
      player.playback = 1;
    }

    const terrain = terrainAt(player.x, player.z);
    player.terrain = terrain;
    // La velocidad de este frame se calculó con el terreno de partida, pero el
    // HUD debe mostrar el del punto al que se ha llegado: si no, durante un
    // frame enseña el terreno nuevo con el multiplicador anterior.
    const movedTerrainEffect = terrainSpeedEffect(terrain, player.types);
    player.terrainMultiplier = movedTerrainEffect.multiplier;
    player.terrainSpeedReason = movedTerrainEffect.reason;
    player.concealment = terrainConcealment(terrain, player.types);
    const targetSubmerge =
      terrain === 'waterHigh'
        ? CONFIG.player.submergeDeep
        : terrain === 'waterLow' || terrain === 'poison'
          ? CONFIG.player.submergeShallow
          : 0;
    player.submerge +=
      (targetSubmerge - player.submerge) * (1 - Math.exp(-CONFIG.player.submergeLerp * dt));
    if (player.submerge < 0.0005) player.submerge = 0;

    // Las habilidades se lanzan después de mover y girar: así salen siempre en
    // la dirección real a la que apunta el Pokémon en este frame.
    if (input.ability1) this.castAbility(player, 0);
    if (input.ability2) this.castAbility(player, 1);
    if (input.ability3) this.castAbility(player, 2);
    if (input.ability4) this.castAbility(player, 3);
    if (input.commonAbility && player.commonAbilityId !== 'regeneracion') {
      this.castAbility(player, 4);
    }

    this.updateCamera(player, input, dt);
  }

  private updateCamera(
    player: MatchPlayerState,
    input: DeviceInputSnapshot,
    dt: number
  ): void {
    player.camera.addYaw(input.pointerYaw);
    if (input.wheel !== 0) {
      player.camera.addZoom(-input.wheel * CONFIG.camera.wheelStep);
    }
    player.camera.update(dt, player, input.cameraX, input.zoom);
  }

  /**
   * Avanza un dash activo. El desplazamiento se reparte durante la animación
   * (QuickStrike) para que se vea el salto, en vez de teletransportar al actor.
   * Devuelve `true` si este frame lo ha consumido el dash.
   */
  /** Ajusta la velocidad de la animación a la duración real del dash. */
  private animationPlaybackFor(
    player: MatchPlayerState,
    animation: AnimationName,
    duration: number
  ): number {
    const asset = this.assets.get(player.pokemonId);
    const clip =
      asset?.entry.animations[animation] ?? asset?.entry.animations.attack;
    const naturalDuration = clip
      ? clip.durations.reduce((total, ticks) => total + ticks, 0) / 60
      : duration;
    return naturalDuration > 0
      ? naturalDuration / Math.max(0.05, duration)
      : 1;
  }

  /**
   * Avanza una habilidad en preparación. El efecto (proyectil, haz, melee...)
   * no se ejecuta hasta que termina `windup`; durante ese tiempo el Pokémon
   * está quieto y reproduce la animación de la habilidad.
   */
  private stepPendingCast(
    player: MatchPlayerState,
    input: DeviceInputSnapshot,
    dt: number
  ): boolean {
    // La partida pudo terminar en una fase anterior del mismo frame: la
    // preparación no debe seguir avanzando ni llegar a ejecutarse.
    if (this.matchOver) return true;
    const pending = player.pendingCast;
    if (!pending) return false;

    pending.elapsed += dt;
    // Las habilidades marcadas con `moveWhileWindup` dejan seguir moviéndose;
    // el centro del área ya está fijado y la marca permanece en el suelo.
    const movable = pending.def.moveWhileWindup;
    if (!movable) {
      player.vx = 0;
      player.vz = 0;
      // La preparación puede tener su propia animación (por ejemplo, Shoot);
      // si no, se reutiliza la de lanzamiento. Si la habilidad no define
      // ninguna, se mantiene el reposo en vez de inventar una pose.
      const animation = pending.def.windupAnimation ?? pending.def.animation;
      if (animation === null) {
        player.animation = 'idle';
        player.playback = 1;
      } else {
        player.animation = animation;
        // `once`: el clip dura exactamente lo que la preparación; `loop`: velocidad
        // fija y repetición hasta que termine el windup.
        player.playback =
          pending.def.windupAnimationMode === 'loop'
            ? Math.max(0.05, pending.def.windupAnimationSpeed)
            : this.animationPlaybackFor(player, animation, pending.windup);
      }
    } else {
      // Mantén la pose de preparación mientras el Pokémon esté quieto; al
      // andar, la animación de caminar tiene prioridad.
      player.actionTimer = Math.max(player.actionTimer, 0.05);
    }

    const terrain = terrainAt(player.x, player.z);
    player.terrain = terrain;
    // El HUD también se actualiza durante la preparación: antes conservaba el
    // multiplicador del último paso normal aunque el terreno ya hubiera cambiado.
    const windupTerrainEffect = terrainSpeedEffect(terrain, player.types);
    player.terrainMultiplier = windupTerrainEffect.multiplier;
    player.terrainSpeedReason = windupTerrainEffect.reason;
    player.concealment = terrainConcealment(terrain, player.types);

    if (pending.elapsed >= pending.windup) {
      // La marca del área ya no se destruye al impactar: su aro sigue marcando
      // el límite durante el efecto y se autodestruye al acabar. El carril del
      // haz también sigue visible mientras se reproduce el haz.
      player.pendingCast = null;
      this.queueCast(player, pending.def, pending.targetX, pending.targetZ);
    }

    if (!movable) {
      this.updateCamera(player, input, dt);
      return true;
    }
    return false;
  }

  /**
   * Comprueba si un objetivo cae dentro del barrido de un dash. Solo cuenta el
   * tramo que queda por delante del punto de partida (`dirX/dirZ`): si no, el
   * semicírculo trasero golpea a un rival que el dash ya está dejando atrás.
   * También descarta los objetivos tapados por un obstáculo. Se usa al detectar
   * el golpe y otra vez al resolverlo, por si el objetivo se ha movido.
   */
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

  private stepDash(
    player: MatchPlayerState,
    input: DeviceInputSnapshot,
    dt: number
  ): boolean {
    // Igual que la preparación: un dash en curso no sigue tras el final.
    if (this.matchOver) return true;
    const dash = player.dash;
    if (!dash) return false;

    const previousX = player.x;
    const previousZ = player.z;
    dash.elapsed += dt;

    // El último frame no recorre `speed * dt` completos: se limita al resto de
    // la distancia para que el dash acabe exactamente en `distance`. Antes el
    // paso no se limitaba y el desplazamiento real podía superarla hasta en un
    // frame entero, alcanzando objetivos fuera del radio previsto.
    const remaining = Math.max(0, dash.distance - dash.traveled);
    const stepDistance = Math.min(dash.speed * dt, remaining);
    const next = this.dashPosition(
      player,
      player.x,
      player.z,
      dash.dirX,
      dash.dirZ,
      stepDistance
    );
    player.x = next.x;
    player.z = next.z;
    const moved = Math.hypot(player.x - previousX, player.z - previousZ);
    dash.traveled += moved;

    const dashBaseReach = Math.max(0.5, dash.def.radius);
    // Impulso no hace daño ni aplica control: es solo desplazamiento. Los
    // demás dash conservan su golpe al paso.
    const dashCanHit = dash.def.power > 0 || dash.def.slow !== null;
    for (const target of dashCanHit ? this.matchPlayers : []) {
      if (dash.hit.has(target) || !this.canHit(player, target)) continue;
      const dashReach = dashBaseReach + target.hitRadius;
      if (
        !this.dashSweepHits(
          target,
          previousX,
          previousZ,
          player.x,
          player.z,
          dash.dirX,
          dash.dirZ,
          dashReach
        )
      ) {
        continue;
      }
      dash.hit.add(target);
      // El impacto se aplica en la fase común: si este dash mata al rival
      // antes de que le toque actuar, el orden de los jugadores volvería a
      // decidir el intercambio. Se guarda el tramo del barrido para revalidar
      // que el objetivo sigue dentro y sin obstáculos al resolverlo.
      this.pendingInstantHits.push({
        attacker: player,
        target,
        def: dash.def,
        healToken: dash.healToken,
        ax: previousX,
        az: previousZ,
        bx: player.x,
        bz: player.z,
        dirX: dash.dirX,
        dirZ: dash.dirZ,
        reach: dashReach
      });
    }

    dash.trailTimer -= dt;
    if (moved > 0.01 && dash.trailTimer <= 0) {
      this.combatFx.spawnDash(
        previousX,
        previousZ,
        player.x,
        player.z,
        dash.def.color
      );
      dash.trailTimer = 0.04;
    }

    if (dash.def.animation !== null) {
      player.animation = dash.def.animation;
      player.playback = dash.playback;
    }
    player.vx = dash.dirX * dash.speed;
    player.vz = dash.dirZ * dash.speed;

    const terrain = terrainAt(player.x, player.z);
    player.terrain = terrain;
    // Durante el dash el HUD mantiene el terreno y su multiplicador sincronizados.
    const dashTerrainEffect = terrainSpeedEffect(terrain, player.types);
    player.terrainMultiplier = dashTerrainEffect.multiplier;
    player.terrainSpeedReason = dashTerrainEffect.reason;
    player.concealment = terrainConcealment(terrain, player.types);
    const targetSubmerge =
      terrain === 'waterHigh'
        ? CONFIG.player.submergeDeep
        : terrain === 'waterLow' || terrain === 'poison'
          ? CONFIG.player.submergeShallow
          : 0;
    player.submerge +=
      (targetSubmerge - player.submerge) *
      (1 - Math.exp(-CONFIG.player.submergeLerp * dt));
    if (player.submerge < 0.0005) player.submerge = 0;

    // Si un obstáculo dinámico detiene el avance, el dash termina en el acto
    // en vez de quedarse reproduciendo la animación en el sitio. Se compara
    // con el paso pedido de este frame, no con `speed * dt`, porque el último
    // paso puede ser más corto por la distancia restante.
    const expected = stepDistance;
    if (dash.elapsed > dt && expected > 0.001 && moved < expected * 0.2) {
      player.dash = null;
      player.vx = 0;
      player.vz = 0;
      player.actionTimer = 0;
      this.updateCamera(player, input, dt);
      return true;
    }

    // El dash acaba al llegar a su distancia o al agotar la duración. Con el
    // paso limitado, la distancia se alcanza como muy tarde en el mismo frame
    // que la duración, así que no queda desplazamiento pendiente.
    const arrived = dash.traveled >= dash.distance - 0.001;
    if (arrived || dash.elapsed >= dash.duration) {
      player.dash = null;
      player.vx = 0;
      player.vz = 0;
      player.actionTimer = 0;
    }

    this.updateCamera(player, input, dt);
    return true;
  }

  private buffMultiplier(player: MatchPlayerState, stat: BuffStat): number {
    let multiplier = 1;
    for (const buff of player.buffs) {
      if (buff.stat === stat) multiplier *= buff.multiplier;
    }
    return multiplier;
  }

  /**
   * Reaparece en el punto de origen del equipo con 2 s de invulnerabilidad.
   * Los cooldowns del kit no se reinician: solo el del instinto activo.
   */
  private respawnPlayer(player: MatchPlayerState): void {
    const resolved = this.resolvePosition(player, player.spawn.x, player.spawn.z);
    this.revivePlayer(player, resolved.x, resolved.z, 1);
    this.combatFx.spawnBuff(player.x, player.z, [255, 255, 255], 1.1);
  }

  /**
   * Devuelve a la vida al jugador en `(x, z)` con una fracción de su vida
   * máxima. Comparten este reinicio el respawn de la base y las habilidades de
   * revivir, que conservan el punto donde cayó el aliado.
   */
  private revivePlayer(
    player: MatchPlayerState,
    x: number,
    z: number,
    hpFraction: number
  ): void {
    this.removeDeathMarker(player.slot);
    player.x = x;
    player.z = z;
    player.facing = facingToCenter(player.team, x, z);
    player.vx = 0;
    player.vz = 0;
    player.hp = Math.max(
      1,
      Math.round(player.maxHp * clamp(hpFraction, 0, 1))
    );
    player.alive = true;
    player.respawnTimer = 0;
    player.invulnerableTimer = CONFIG.combat.invulnerabilitySeconds;
    player.stunTimer = 0;
    player.hurtTimer = 0;
    player.actionTimer = 0;
    player.actionPlayback = 1;
    player.actionAnimation = null;
    player.actionHold = false;
    player.moveLockTimer = 0;
    player.castLockTimer = 0;
    player.dash = null;
    this.cancelPendingCast(player);
    player.deathFade = 0;
    // Los enfriamientos del kit siguen corriendo durante los 5 s de muerte: no
    // se reinician al reaparecer. El instinto activo sí se resetea, como pide
    // `docs/common-abilities.md` (sección Respawn).
    player.cooldowns[4] = 0;
    player.buffs = [];
    player.slowEffects = [];
    player.slowMultiplier = 1;
    player.damageReductionTimer = 0;
    player.damageReduction = 0;
    player.shieldSpeedMultiplier = 1;
    this.breakRegen(player);
    player.animation = 'idle';
    player.playback = 1;
    // El HUD lee estos campos hasta el primer frame de movimiento: deben
    // reflejar el terreno del punto de reaparición, no el de la vida anterior.
    player.terrain = terrainAt(player.x, player.z);
    const terrainEffect = terrainSpeedEffect(player.terrain, player.types);
    player.terrainMultiplier = terrainEffect.multiplier;
    player.terrainSpeedReason = terrainEffect.reason;
    player.concealment = terrainConcealment(player.terrain, player.types);
    player.submerge = 0;
  }

  /** Revive desde un área a un aliado caído, en el punto de su marcador. */
  private reviveAoeAlly(
    target: AoeFallenAlly,
    fraction: number,
    def: AbilityDef
  ): boolean {
    const player = target.player;
    if (player.alive) return false;
    this.revivePlayer(player, player.x, player.z, fraction);
    this.showHealPopup(player, player.hp);
    this.combatFx.spawnBuff(player.x, player.z, def.color, 1.1);
    return true;
  }

  /**
   * Deja una marca en el punto del KO, con una copia por vista aliada. La marca
   * es información de equipo: solo se crea en las vistas del equipo del Pokémon
   * caído, aunque el cuerpo esté fuera de la niebla.
   */
  private spawnDeathMarker(target: MatchPlayerState): void {
    const asset = this.assets.get(target.pokemonId);
    const terrain = terrainAt(target.x, target.z);
    const onWater = terrain === 'waterLow' || terrain === 'waterHigh';
    const y = onWater
      ? this.world.waterHeight + DEATH_MARKER_WATER_LIFT
      : DEATH_MARKER_GROUND_Y;

    const markers: Array<DeathMarker | null> = this.views.map(() => null);
    this.views.forEach((viewer, index) => {
      if (viewer.team !== target.team) return;
      const layer = this.viewLayers[index];
      if (!layer) return;
      const marker = new DeathMarker(
        this.app,
        target.x,
        target.z,
        y,
        asset?.portrait ?? null
      );
      marker.setLayer(layer.id);
      marker.faceCamera(viewer.camera.position);
      markers[index] = marker;
    });
    if (markers.some((marker) => marker !== null)) {
      this.deathMarkers.set(target.slot, markers);
    }
  }

  private removeDeathMarker(slot: number): void {
    const markers = this.deathMarkers.get(slot);
    if (!markers) return;
    for (const marker of markers) marker?.destroy();
    this.deathMarkers.delete(slot);
  }

  /** Reinicia el estado de la regeneración pasiva. */
  private breakRegen(player: MatchPlayerState): void {
    player.hiddenTimer = 0;
    player.regenGraceTimer = 0;
    player.regenAccumulator = 0;
    player.regenerating = false;
  }

  /**
   * Regeneración: tras `REGENERATION_DELAY_SECONDS` sin ser visto, cura
   * `REGENERATION_HP_PER_SECOND` PV/s. Usa `enemiesSeeing`, que se acaba de
   * recalcular en `updateVision`, y una gracia de 0,2 s para que un frame de
   * visibilidad en el borde no reinicie el contador.
   */
  private updateRegeneration(dt: number): void {
    for (const player of this.matchPlayers) {
      if (!player.alive || player.commonAbilityId !== 'regeneracion') {
        this.breakRegen(player);
        continue;
      }

      if (player.enemiesSeeing > 0) {
        player.regenGraceTimer += dt;
        if (player.regenGraceTimer >= 0.2) {
          player.hiddenTimer = 0;
          player.regenAccumulator = 0;
          player.regenerating = false;
        }
        continue;
      }

      player.regenGraceTimer = 0;
      player.hiddenTimer += dt;
      if (
        player.hiddenTimer < REGENERATION_DELAY_SECONDS ||
        player.hp >= player.maxHp
      ) {
        player.regenerating = false;
        continue;
      }

      player.regenerating = true;
      player.regenAccumulator += dt * REGENERATION_HP_PER_SECOND;
      const whole = Math.floor(player.regenAccumulator);
      if (whole <= 0) continue;
      player.regenAccumulator -= whole;
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + whole);
      const healed = player.hp - before;
      if (healed > 0) {
        player.abilityHealing += healed;
        this.awardXp(player, 'healing', healed * XP_REWARDS.healingPerHp);
        this.showHealPopup(player, healed);
      }
      if (player.hp >= player.maxHp) player.regenerating = false;
    }
  }

  /** Cancela una habilidad en preparación y retira sus marcas del suelo. */
  private cancelPendingCast(player: MatchPlayerState): void {
    if (!player.pendingCast) return;
    player.pendingCast.marker?.destroy();
    player.pendingCast.lane?.destroy();
    player.pendingCast = null;
    // La recuperación global se fija al ejecutar; un casteo que nunca llega a
    // ejecutarse no debe dejar al jugador bloqueado. Se limpia aquí para que
    // una interrupción no arrastre el timer aunque cambie el orden de fases.
    player.castLockTimer = 0;
  }

  private castAbility(player: MatchPlayerState, slotIndex: number): void {
    if (!player.alive || this.matchOver) return;
    if (player.pendingCast || player.dash) return;
    // Las habilidades instantáneas de este frame aún no se han ejecutado: sin
    // esta comprobación se podrían encolar dos (p. ej. dash + haz) pulsando
    // dos botones a la vez, y se gastarían ambos enfriamientos.
    if (this.hasQueuedCast(player)) return;
    // Bloqueo global de casteo: durante la recuperación de la habilidad
    // anterior no se puede lanzar otra, sea cual sea el hueco.
    if (player.castLockTimer > 0) return;
    // Las melee no usan `castLockTimer` (su cadencia la marca el cooldown),
    // pero sí comprometen el golpe: no se puede encadenar otra habilidad hasta
    // que termine su clip/`moveLock`. Sin esto, un haz podía empezar a cargarse
    // con la animación melee a medias y ocultarla.
    if (player.moveLockTimer > 0) return;
    const abilityId = player.abilityIds[slotIndex];
    if (!abilityId) return;
    const baseDef = ABILITIES[abilityId];
    if (!baseDef) return;
    if (player.cooldowns[slotIndex] > 0.0001) return;
    // Mientras Protección está activa no se puede usar ninguna otra habilidad.
    if (player.damageReductionTimer > 0) return;

    // Los instintos comunes pueden sobrescribir su animación por Pokémon sin
    // tocar el resto de la definición.
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

    // Cualquier habilidad usada corta la regeneración pasiva.
    this.breakRegen(player);
    // Atacar desde la protección de spawn la retira: la invulnerabilidad
    // defensiva no debe servir para lanzar gratis una rotación ofensiva. Los
    // buffs y dash de estado (Protección, Impulso, Agilidad) no la rompen.
    if (player.invulnerableTimer > 0 && (def.power > 0 || def.slow !== null)) {
      player.invulnerableTimer = 0;
    }
    player.cooldowns[slotIndex] = def.cooldown;
    // La recuperación global se cobra en `executeAbility`, cuando la habilidad
    // se ejecuta de verdad. Durante el windup ya bloquea `pendingCast`; si el
    // lanzamiento se interrumpe, no debe quedar un bloqueo que nunca se usó.
    // Las melee se limitan con su cooldown y `moveLock`, y no usan este timer.
    // Solo las habilidades con animación propia ocupan el canal de acción;
    // sin animación el Pokémon conserva su reposo o su caminar.
    player.actionTimer = def.animation === null ? 0 : def.animationTime;
    player.actionPlayback = 1;
    player.actionAnimation = def.animation;
    player.actionHold = false;
    if (def.animation !== null) player.animation = def.animation;
    player.playback = 1;
    // Las habilidades pensadas para usarse en movimiento conservan la inercia:
    // poner la velocidad a cero producía un frenazo brusco y luego el jugador
    // volvía a acelerar, justo el efecto que no queremos en Protección.
    if (!def.preserveMomentum) {
      player.vx = 0;
      player.vz = 0;
    }

    if (def.windup > 0) {
      // La pose inicial de la preparación también usa su animación propia, así
      // no hay un frame con la animación de lanzamiento antes del windup.
      const windupAnimation = def.windupAnimation ?? def.animation;
      if (windupAnimation !== null) {
        const windupPlayback =
          def.windupAnimationMode === 'loop'
            ? Math.max(0.05, def.windupAnimationSpeed)
            : this.animationPlaybackFor(
                player,
                windupAnimation,
                def.windup
              );
        player.animation = windupAnimation;
        player.playback = windupPlayback;
        // En los windups móviles la prioridad de animación usa `actionAnimation`
        // mientras el Pokémon está quieto. Debe apuntar a la preparación y no al
        // lanzamiento: si no, el clip de `shoot` se reproduce durante el windup
        // y vuelve a empezar al ejecutar la habilidad.
        player.actionAnimation = windupAnimation;
        player.actionPlayback = windupPlayback;
      } else {
        player.animation = 'idle';
        player.playback = 1;
        player.actionAnimation = null;
        player.actionPlayback = 1;
      }
      const dirX = Math.sin(player.facing);
      const dirZ = Math.cos(player.facing);
      // Las habilidades de área no se pueden colocar detrás de un obstáculo:
      // el centro se detiene antes del primer collider. Los haces hacen lo
      // mismo para que el carril y el haz terminen en el mismo punto.
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
      // Las marcas de área usan el color del equipo del lanzador: así se
      // distingue de inmediato a quién pertenece el aviso.
      const teamAccent = TEAM_INFO[player.team].accent;
      // Las habilidades de área fijan su centro al empezar el retardo y
      // muestran la marca en el suelo hasta que termina el efecto. El aro
      // (color del equipo) es persistente; el relleno de carga solo dura el
      // `windup`. El aro dibuja el radio máximo de golpe (área + mayor hurtbox)
      // y la comprobación usa ese mismo valor: todo el interior es golpeable y
      // el borde coincide con el límite real.
      const marker =
        def.shape === 'aoe'
          ? this.combatFx.spawnAoeTelegraph(
              targetX,
              targetZ,
              def.radius + maxHitRadius(),
              teamAccent,
              def.windup,
              Math.max(0.1, def.aoeDuration)
            )
          : null;
      // Los haces muestran su carril desde el inicio del windup. El ancho es el
      // radio máximo de golpe (haz + mayor hurtbox), el mismo que usa la
      // comprobación: todo el interior del carril es golpeable.
      const lane =
        def.shape === 'beam'
          ? this.combatFx.spawnBeamLane(
              player.x,
              player.z,
              targetX,
              targetZ,
              def.radius + maxHitRadius(),
              teamAccent,
              def.windup,
              def.beamStyle
            )
          : null;
      player.pendingCast = {
        def,
        slotIndex,
        elapsed: 0,
        windup: def.windup,
        marker,
        lane,
        targetX,
        targetZ
      };
      return;
    }

    this.queueCast(player, def);
  }

  /** ¿Tiene este jugador una habilidad instantánea esperando resolución? */
  private hasQueuedCast(player: MatchPlayerState): boolean {
    return this.queuedCasts.some((cast) => cast.player === player);
  }

  /**
   * Aplaza la ejecución de una habilidad hasta la fase común del final del
   * frame. La preparación y el enfriamiento se cobran en el acto; el efecto
   * (daño, control, proyectil, área o dash) espera a que todos los jugadores
   * hayan tenido su turno.
   */
  private queueCast(
    player: MatchPlayerState,
    def: AbilityDef,
    targetX?: number,
    targetZ?: number
  ): void {
    this.queuedCasts.push({ player, def, targetX, targetZ });
  }

  /** Ejecuta las habilidades instantáneas encoladas en orden de lanzamiento. */
  private resolveQueuedCasts(): void {
    if (this.queuedCasts.length === 0) return;
    const casts = this.queuedCasts;
    this.queuedCasts = [];
    for (const cast of casts) {
      // Un golpe anterior de esta misma tanda pudo cerrar la partida.
      if (this.matchOver) break;
      this.executeAbility(cast.player, cast.def, cast.targetX, cast.targetZ);
    }
  }

  /** Ejecuta el efecto de una habilidad cuando termina su preparación. */
  private executeAbility(
    player: MatchPlayerState,
    def: AbilityDef,
    targetX?: number,
    targetZ?: number
  ): void {
    // El lock de movimiento, la recuperación global y el clip de ataque
    // empiezan cuando la habilidad se ejecuta de verdad (tras el windup, si lo
    // tiene). En las melee el lock y el clip duran lo mismo. Reiniciar el clip
    // vale para todas las formas: si `windup > animationTime` (por ejemplo,
    // Ataque Celeste), el temporizador arrancado en `castAbility` se agotaba
    // durante la preparación y la animación de lanzamiento no llegaba a verse
    // nunca.
    const windupClip =
      def.windup > 0 ? def.windupAnimation ?? def.animation : null;
    // Si la preparación usó la misma animación que el lanzamiento, el clip ya
    // se reprodujo entero y está en su último frame. Reiniciarlo aquí lo
    // mostraría dos veces seguidas, así que se mantiene esa pose.
    const reusesWindupClip =
      windupClip !== null && windupClip === def.animation;
    player.moveLockTimer = Math.max(player.moveLockTimer, def.moveLock);
    if (def.shape !== 'melee') {
      player.castLockTimer = Math.max(player.castLockTimer, def.castTime);
    }
    if (def.animation !== null) {
      player.actionTimer = def.animationTime;
      player.actionAnimation = def.animation;
      if (reusesWindupClip) {
        player.actionHold = true;
        player.animation = def.animation;
      } else {
        player.actionHold = false;
        player.actionPlayback = this.animationPlaybackFor(
          player,
          def.animation,
          def.animationTime
        );
        player.animation = def.animation;
        player.playback = player.actionPlayback;
      }
    }

    // El sonido va con el efecto real, no con el inicio del windup: en
    // habilidades cargadas el golpe suena cuando sale, no cuando se prepara.
    playAbilityCast(def);

    CAST_EFFECTS({
      player,
      def,
      combatFx: this.combatFx,
      showHealPopup: (target, amount) => {
        this.showHealPopup(target, amount);
        this.awardXp(target, 'healing', amount * XP_REWARDS.healingPerHp);
      }
    });

    // Un solo token por lanzamiento: si la forma golpea a varios rivales o
    // tiene varios ticks, `healOnHit` cura una única vez, no por impacto.
    const healToken: HealOnHitToken | undefined = def.healOnHit
      ? { healed: false }
      : undefined;

    const deps: AbilityExecutorDeps = {
      combatFx: this.combatFx,
      world: this.world,
      matchPlayers: this.matchPlayers,
      spawnShield: (source, ability) => this.spawnProtectionShield(source, ability),
      canHit: (attacker, target) => this.canHit(attacker, target),
      applyAbilityDamage: (attacker, target, ability, options) =>
        this.applyAbilityDamage(attacker, target, ability, options),
      dashPosition: (source, x, z, dirX, dirZ, distance) =>
        this.dashPosition(source, x, z, dirX, dirZ, distance),
      animationPlaybackFor: (source, animation, duration) =>
        this.animationPlaybackFor(source, animation, duration),
      addProjectile: (projectile) => this.projectiles.push(projectile),
      addActiveAoe: (aoe) => this.activeAoes.push(aoe),
      addPendingMeleeHit: (hit) => this.pendingMeleeHits.push(hit),
      resolveAoeHit: (hit) => this.resolveAoeHit(hit),
      healToken
    };

    ABILITY_EXECUTORS[def.shape](player, def, deps, targetX, targetZ);
    this.applySelfDamage(player, def);
  }

  /**
   * Coste de vida de habilidades como Explosión. Se aplica después del efecto
   * para que el golpe salga aunque el lanzador se quede al borde de la muerte,
   * y nunca le quita la última vida: como mínimo conserva 1 PV.
   */
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
    this.breakRegen(player);
    player.hurtTimer = Math.max(player.hurtTimer, 0.25);
    this.vibrateOnDamage(player, amount);
    this.showDamagePopup(player, amount, false, 1);
  }

  /**
   * Vibra el mando del jugador humano que acaba de recibir daño. Los bots
   * llevan `deviceKind: 'gamepad'` para compartir el modelo del lobby, pero no
   * tienen un mando físico detrás, así que se descartan.
   */
  private vibrateOnDamage(target: MatchPlayerState, damage: number): void {
    if (target.isBot || target.deviceKind !== 'gamepad') return;
    rumbleOnDamage(target.deviceId, damage, target.maxHp);
  }

  /** Genera el escudo esférico de Protección con el accent del Pokémon. */
  private spawnProtectionShield(
    player: MatchPlayerState,
    def: AbilityDef
  ): void {
    const asset = this.assets.get(player.pokemonId);
    const idle = asset?.entry.animations.idle;
    const anchorY = idle?.anchors[0]?.y ?? (idle?.frameHeight ?? 32) * 0.75;
    const spriteHeight =
      anchorY * CONFIG.sprite.pixelScale * CONFIG.sprite.verticalStretch;
    const radius = Math.min(1.5, Math.max(0.65, spriteHeight * 0.55));
    const centerY = Math.max(radius + 0.15, spriteHeight * 0.55);
    player.shieldFx?.destroy();
    player.shieldFx = this.combatFx.spawnProtectionShield(
      player,
      player.accent,
      radius,
      centerY,
      def.shieldDuration
    );
  }

  private canHit(attacker: MatchPlayerState, target: MatchPlayerState): boolean {
    return (
      target !== attacker &&
      target.alive &&
      target.team !== attacker.team &&
      target.invulnerableTimer <= 0
    );
  }

  /**
   * Aplica una ralentización de estado. Cada lanzador/habilidad mantiene un
   * único efecto: los ticks de un área no renuevan la duración. Los efectos de
   * distinto origen conviven con su propio tiempo y solo el más fuerte (el
   * multiplicador más bajo) marca la velocidad actual.
   */
  private applySlow(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    slow: SlowSpec,
    color: readonly [number, number, number]
  ): void {
    if (slow.duration <= 0) return;
    const source = `${attacker.slot}:${def.id}`;
    if (target.slowEffects.some((effect) => effect.source === source)) return;
    const effect: SlowEffect = {
      source,
      multiplier: slow.multiplier,
      remaining: slow.duration
    };
    target.slowEffects.push(effect);
    this.refreshSlowMultiplier(target);
    this.combatFx.spawnBuff(target.x, target.z, color, 0.95);
  }

  /** Recalcula la velocidad con la ralentización más fuerte que siga activa. */
  private refreshSlowMultiplier(target: MatchPlayerState): void {
    target.slowMultiplier = target.slowEffects.reduce(
      (slowest, effect) => Math.min(slowest, effect.multiplier),
      1
    );
  }

  /** Cancela dash, preparación y locks de acción de un objetivo. */
  private interruptPlayer(target: MatchPlayerState): void {
    target.actionTimer = 0;
    target.moveLockTimer = 0;
    target.dash = null;
    this.cancelPendingCast(target);
  }

  /**
   * Control de un golpe que conecta: puede cancelar dash/preparación, aplicar
   * hitstun y empujar. Lo comparten las habilidades dañinas y las de estado: en
   * ambos casos el objetivo ha recibido un impacto válido. El empuje sale de
   * `sourceX/sourceZ` (punto de entrada del proyectil o centro del área); sin
   * origen explícito, del atacante.
   */
  private applyHitControl(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    options: {
      cancel: boolean;
      hitstun: number;
      knockback: number;
      sourceX?: number;
      sourceZ?: number;
    }
  ): void {
    if (options.cancel) this.interruptPlayer(target);
    if (options.hitstun > 0) {
      target.stunTimer = Math.max(target.stunTimer, options.hitstun);
    }
    if (options.knockback > 0) {
      this.applyKnockback(
        target,
        options.sourceX ?? attacker.x,
        options.sourceZ ?? attacker.z,
        options.knockback
      );
    }
  }

  /**
   * Multiplicador de daño por distancia al centro en habilidades de área.
   * Sin `radialDamage` devuelve 1. Con él, el centro hace el 100 % y el borde
   * `radialMinDamage` (0 % por defecto), con interpolación lineal.
   */
  private radialDamageMultiplier(
    def: AbilityDef,
    distance: number,
    radius: number
  ): number {
    if (!def.radialDamage) return 1;
    const t = Math.min(1, Math.max(0, distance / Math.max(0.001, radius)));
    const min = Math.min(1, Math.max(0, def.radialMinDamage));
    return 1 - (1 - min) * t;
  }

  /**
   * Reúne a todos los Pokémon vivos dentro del área (aliados, enemigos y el
   * propio lanzador) y delega la aplicación de efectos en el callback de la
   * habilidad. El motor solo aporta los datos y los servicios de golpe.
   */
  private resolveAoeHit(hit: AoeHitInput): void {
    const targets: AoeTarget[] = [];
    const fallenAllies: AoeFallenAlly[] = [];
    for (const player of this.matchPlayers) {
      if (!player.alive) {
        // Los aliados caídos siguen en el punto del KO hasta reaparecer: son
        // los únicos revivibles por un área.
        if (player.team !== hit.owner.team) continue;
        const distance = Math.hypot(player.x - hit.x, player.z - hit.z);
        if (distance > hit.radius + maxHitRadius() + player.hitRadius) continue;
        fallenAllies.push({ player, distance });
        continue;
      }
      const distance = Math.hypot(player.x - hit.x, player.z - hit.z);
      if (distance > hit.radius + maxHitRadius() + player.hitRadius) continue;
      const radialMultiplier = this.radialDamageMultiplier(
        hit.def,
        distance,
        hit.radius
      );
      targets.push({
        player,
        distance,
        radialMultiplier,
        damagePower: hit.power * radialMultiplier,
        isAlly: player.team === hit.owner.team,
        isEnemy: player.team !== hit.owner.team,
        isSelf: player === hit.owner,
        lineOfSight: !segmentBlockedByColliders(
          hit.x,
          hit.z,
          player.x,
          player.z,
          this.world.colliders
        ),
        hittable: this.canHit(hit.owner, player)
      });
    }

    const context: AoeEffectContext = {
      caster: hit.owner,
      def: hit.def,
      x: hit.x,
      z: hit.z,
      radius: hit.radius,
      mode: hit.mode,
      tick: hit.tick,
      elapsed: hit.elapsed,
      power: hit.power,
      targets,
      fallenAllies,
      applyHit: (target, options) => this.applyAoeHit(hit, target, options),
      applyHitstun: (target, seconds, cancel = false) =>
        this.applyAoeHitstun(target, seconds, cancel),
      applyKnockback: (target, distance) =>
        this.applyKnockback(target.player, hit.x, hit.z, distance),
      applySlow: (target, slow) =>
        this.applySlow(hit.owner, target.player, hit.def, slow, hit.def.color),
      applyBuff: (target, buff) => this.applyAoeBuff(target, buff, hit.def),
      applyHeal: (target, fraction) =>
        this.applyAoeHeal(target, fraction, hit.def, hit.owner),
      revive: (target, fraction) =>
        this.reviveAoeAlly(target, fraction, hit.def),
      isMatchOver: () => this.matchOver
    };
    (hit.def.aoeEffect ?? defaultAoeEffect)(context);
  }

  /** Ejecuta el golpe estándar de un área contra un objetivo concreto. */
  private applyAoeHit(
    hit: AoeHitInput,
    target: AoeTarget,
    options: AoeHitOptions = {}
  ): boolean {
    return this.applyAbilityDamage(hit.owner, target.player, hit.def, {
      power: options.power ?? target.damagePower,
      control: options.control ?? hit.mode === 'instant',
      cancel: options.cancel,
      hitstun: options.hitstun,
      knockback: options.knockback,
      slow: options.slow,
      healToken: options.healToken ?? hit.healToken,
      impactX: options.impactX,
      impactZ: options.impactZ,
      sourceX: options.sourceX ?? hit.x,
      sourceZ: options.sourceZ ?? hit.z,
      immuneMarked: hit.immuneMarked
    });
  }

  /** Hitstun y cancelación opcional solicitados por un callback de área. */
  private applyAoeHitstun(
    target: AoeTarget,
    seconds: number,
    cancel: boolean
  ): void {
    if (cancel) this.interruptPlayer(target.player);
    if (seconds > 0) {
      target.player.stunTimer = Math.max(target.player.stunTimer, seconds);
    }
  }

  /** Buff/debuff temporal aplicado a un objetivo por un callback de área. */
  private applyAoeBuff(
    target: AoeTarget,
    buff: BuffSpec,
    def: AbilityDef
  ): void {
    target.player.buffs.push({ ...buff, duration: buff.duration });
    this.combatFx.spawnBuff(target.player.x, target.player.z, def.color, 0.95);
  }

  /** Cura a un objetivo del área una fracción de su vida máxima. */
  private applyAoeHeal(
    target: AoeTarget,
    fraction: number,
    def: AbilityDef,
    caster: MatchPlayerState
  ): void {
    const healed = applyHealFraction(
      target.player,
      fraction,
      def,
      this.combatFx,
      (healedPlayer, amount) => {
        this.showHealPopup(healedPlayer, amount);
      },
      // La estadística y la XP de curación son para quien lanza la habilidad.
      caster
    );
    if (healed > 0) {
      this.awardXp(caster, 'healing', healed * XP_REWARDS.healingPerHp);
    }
  }

  private applyAbilityDamage(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    options: {
      power?: number;
      control?: boolean;
      cancel?: boolean;
      hitstun?: number;
      knockback?: number | null;
      slow?: SlowSpec | null;
      healToken?: HealOnHitToken;
      impactX?: number;
      impactZ?: number;
      sourceX?: number;
      sourceZ?: number;
      /**
       * Registro de la marca de inmunidad del lanzamiento. Si el objetivo ya
       * está en el conjunto, no se repite el aviso (una marca por lanzamiento
       * y objetivo, no una por tick).
       */
      immuneMarked?: Set<number>;
    } = {}
  ): boolean {
    const power = options.power ?? def.power;
    const damaging = power > 0 && def.category !== 'status';
    const control = options.control ?? true;
    const cancel = options.cancel ?? control;
    const hitstun =
      options.hitstun ?? (control ? CONFIG.combat.hitstunSeconds : 0);
    const knockback =
      options.knockback === undefined
        ? control
          ? def.knockback
          : 0
        : options.knockback ?? 0;
    const slow = options.slow === undefined ? def.slow : options.slow;
    if (!rollAccuracy(def.accuracy)) return false;

    // La inmunidad de tipo anula el golpe completo: ni daño, ni estado, ni
    // impacto, ni control. Así `Onda Trueno` no ralentiza a un Pokémon de tipo
    // Tierra ni `Bomba Lodo` ralentiza a Lucario aunque el daño sea 0. El golpe
    // sí conecta, así que se muestra la marca 🚫 para explicar por qué no hizo
    // nada.
    const effectiveness = typeEffectiveness(def.type, target.types);
    if (effectiveness === 0) {
      // En áreas persistentes el mismo rival inmune recibe un tick tras otro:
      // la marca se muestra solo la primera vez para no apilar avisos.
      if (!options.immuneMarked || !options.immuneMarked.has(target.slot)) {
        this.showImmunePopup(target);
        options.immuneMarked?.add(target.slot);
      }
      return false;
    }
    // El impacto suena para cualquier golpe válido, también los de estado:
    // Paralizador u Onda Trueno chocan igual aunque no resten vida.
    playAbilityImpact(effectiveness);

    // La ralentización se aplica aunque la habilidad no haga daño (Paralizador).
    if (slow && target.alive) {
      this.applySlow(attacker, target, def, slow, def.color);
    }

    // Una habilidad de estado no resta vida, pero su impacto cuenta como golpe:
    // cancela dash y preparación igual que una dañina, como describe el README.
    if (!damaging) {
      this.applyHitControl(attacker, target, {
        cancel,
        hitstun,
        knockback,
        sourceX: options.sourceX,
        sourceZ: options.sourceZ
      });
      return false;
    }

    const critical = rollCritical();
    const category = def.category === 'physical' ? 'physical' : 'special';
    const physical = category === 'physical';
    const result = computeDamage({
      moveType: def.type,
      category,
      power,
      attacker: attacker.combat,
      defender: target.combat,
      attackerTypes: attacker.types,
      defenderTypes: target.types,
      attackMultiplier: this.buffMultiplier(attacker, physical ? 'attack' : 'spAttack'),
      defenseMultiplier: this.buffMultiplier(target, physical ? 'defense' : 'spDefense'),
      critical,
      randomFactor: rollRandomFactor()
    });

    // La inmunidad ya se ha descartado arriba, así que un golpe dañino válido
    // siempre resta al menos 1 PV y puede mostrar su impacto y su número.
    const reduction =
      target.damageReductionTimer > 0 ? target.damageReduction : 0;
    const finalDamage = Math.max(1, Math.round(result.damage * (1 - reduction)));
    const lethal = finalDamage >= target.hp;
    this.combatFx.spawnImpact(
      options.impactX ?? target.x,
      options.impactZ ?? target.z,
      def.color,
      result.effectiveness,
      def.impactStyle
    );
    this.showDamagePopup(
      target,
      finalDamage,
      result.critical,
      result.effectiveness,
      lethal
    );

    // El control puede venir del `control` estándar o de los ajustes propios
    // del callback de un área (cancel, hitstun y empuje por separado).
    this.applyHitControl(attacker, target, {
      cancel,
      hitstun,
      knockback,
      sourceX: options.sourceX,
      sourceZ: options.sourceZ
    });

    // Solo cuenta el daño que descuenta vida real: el exceso de un golpe letal
    // no infla las estadísticas. El autodaño de habilidades como Explosión sí
    // suma como daño recibido del lanzador.
    const appliedDamage = Math.min(finalDamage, target.hp);
    target.hp = Math.max(0, target.hp - finalDamage);
    target.damageTaken += appliedDamage;
    if (attacker.team !== target.team) attacker.damageDealt += appliedDamage;
    this.awardCombatXp(attacker, target, appliedDamage, result.damage, finalDamage);
    this.breakRegen(target);
    target.hurtTimer = Math.max(target.hurtTimer, control ? 0.35 : 0.2);
    this.vibrateOnDamage(target, appliedDamage);
    if (target.hp <= 0) this.knockOut(target, attacker);

    // `healOnHit` se resuelve aquí, en el único punto donde un golpe resta vida
    // de verdad. Así funciona en todas las formas (melee, proyectil, haz, área
    // y dash) y una tirada fallida o un objetivo inmune no curan. El token hace
    // que un lanzamiento con varios impactos o ticks cure una sola vez.
    if (def.healOnHit && options.healToken && !options.healToken.healed) {
      options.healToken.healed = true;
      applyHealSelf(attacker, def, this.combatFx, (healed, amount) => {
        this.showHealPopup(healed, amount);
        this.awardXp(healed, 'healing', amount * XP_REWARDS.healingPerHp);
      });
    }
    return true;
  }

  /**
   * Crea un número de daño en cada viewport donde se ve al objetivo. El texto,
   * el quad y la animación los gestiona `DamageNumbers` dentro de PlayCanvas.
   */
  private showDamagePopup(
    target: MatchPlayerState,
    amount: number,
    critical: boolean,
    effectiveness: number,
    lethal = false
  ): void {
    this.spawnNumberPopup(target, {
      amount,
      critical,
      effectiveness,
      heal: false,
      lethal
    });
  }

  /** Número de curación flotante, con el mismo sistema que el daño. */
  private showHealPopup(target: MatchPlayerState, amount: number): void {
    this.spawnNumberPopup(target, {
      amount,
      critical: false,
      effectiveness: 1,
      heal: true,
      lethal: false
    });
  }

  /** Marca de inmunidad cuando la habilidad conecta pero el tipo la anula. */
  private showImmunePopup(target: MatchPlayerState): void {
    this.spawnNumberPopup(target, {
      amount: 0,
      critical: false,
      effectiveness: 1,
      heal: false,
      lethal: false,
      immune: true
    });
  }

  private spawnNumberPopup(
    target: MatchPlayerState,
    options: {
      amount: number;
      critical: boolean;
      effectiveness: number;
      heal: boolean;
      lethal: boolean;
      immune?: boolean;
    }
  ): void {
    const asset = this.assets.get(target.pokemonId);
    if (!asset) return;

    const idle = asset.entry.animations.idle;
    const anchorY = idle.anchors[0]?.y ?? idle.frameHeight * 0.75;
    const worldY =
      0.04 +
      anchorY * CONFIG.sprite.pixelScale * CONFIG.sprite.verticalStretch +
      0.2;

    const views: DamageNumberView[] = [];
    this.views.forEach((viewer, viewIndex) => {
      const copy = target.copies[viewIndex];
      const camera = viewer.camera.entity.camera;
      const layer = this.viewLayers[viewIndex];
      if (!copy?.isVisible || !camera || !layer) return;
      views.push({ camera, layerId: layer.id });
    });

    if (views.length === 0) return;
    this.damageNumbers.spawn({
      x: target.x,
      y: worldY,
      z: target.z,
      amount: options.amount,
      critical: options.critical,
      effectiveness: options.effectiveness,
      heal: options.heal,
      lethal: options.lethal,
      immune: options.immune ?? false,
      views
    });
  }

  private knockOut(target: MatchPlayerState, killer: MatchPlayerState): void {
    // El fin de partida es idempotente: el primer KO que alcanza `koTarget`
    // decide el ganador y los KO posteriores del mismo frame ni suman ni
    // vuelven a llamar a `onMatchEnd`.
    if (this.matchOver) return;
    if (!target.alive) return;
    const entry = this.assets.get(target.pokemonId)?.entry;
    const deathAnimation = entry?.animations.faint ?? entry?.animations.hurt;
    const deathDuration = deathAnimation
      ? deathAnimation.durations.reduce((total, ticks) => total + ticks, 0) / 60
      : 0.7;

    target.alive = false;
    target.hp = 0;
    target.deaths += 1;
    target.respawnTimer = CONFIG.combat.respawnSeconds;
    target.deathFade = Math.max(0.45, deathDuration);
    target.hurtTimer = 0;
    target.actionTimer = 0;
    target.moveLockTimer = 0;
    target.castLockTimer = 0;
    target.dash = null;
    this.cancelPendingCast(target);
    target.vx = 0;
    target.vz = 0;
    target.buffs = [];
    target.slowEffects = [];
    target.slowMultiplier = 1;
    target.damageReductionTimer = 0;
    target.damageReduction = 0;
    target.shieldSpeedMultiplier = 1;
    target.shieldFx?.destroy();
    target.shieldFx = null;
    this.breakRegen(target);
    target.animation = entry?.animations.faint ? 'faint' : 'hurt';
    target.playback = 1;
    for (const copy of target.copies) copy.play(target.animation, true);
    this.spawnDeathMarker(target);

    this.pushKillFeed(killer, target);

    if (killer.team !== target.team) {
      killer.kills += 1;
      this.awardKillXp(killer, target);
      this.teamScores[killer.team] += 1;
      if (this.teamScores[killer.team] >= this.koTarget) {
        this.matchOver = true;
        this.winner = killer.team;
        this.awardMatchResult(killer.team);
        // La partida termina aquí: el tema de combate no debe seguir bajo el
        // modal de resultados.
        stopMatchMusic();
        const result: MatchEndResult = {
          winner: killer.team,
          blueScore: this.teamScores.blue,
          redScore: this.teamScores.red
        };
        this.callbacks.onMatchEnd(result);
      }
    }

    // La víctima pierde la racha y las aportaciones de esta vida. Sus propias
    // bajas repetidas se conservan: el castigo por farmeo es contra quien
    // muere, no contra quien mata.
    target.killStreak = 0;
    target.recentKills = [];
    target.damageContributors.clear();
    this.emitMatchStats();
  }

  /**
   * Guarda el KO para el feed de las vistas. Se conservan los últimos
   * `KILL_FEED_MAX_ENTRIES`; al entrar uno nuevo se descarta el más antiguo.
   */
  private pushKillFeed(killer: MatchPlayerState, victim: MatchPlayerState): void {
    const entry: KillFeedEntry = {
      id: ++this.killFeedSeq,
      at: this.matchElapsed,
      killerName: killer.name,
      killerTeam: killer.team,
      killerSlot: killer.slot,
      killerPokemonId: killer.pokemonId,
      victimName: victim.name,
      victimTeam: victim.team,
      victimSlot: victim.slot,
      victimPokemonId: victim.pokemonId
    };
    this.killFeed = [entry, ...this.killFeed].slice(0, KILL_FEED_MAX_ENTRIES);
  }

  /** Retira del feed los KOs que ya superaron su tiempo de vida. */
  private pruneKillFeed(): void {
    if (this.killFeed.length === 0) return;
    const oldestVisible = this.matchElapsed - KILL_FEED_TTL_SECONDS;
    const fresh = this.killFeed.filter((entry) => entry.at >= oldestVisible);
    if (fresh.length !== this.killFeed.length) this.killFeed = fresh;
  }

  /**
   * Suma XP decorativa. No toca vida, stats ni daño: solo alimenta el nivel y
   * el desglose que se muestran en el HUD y en el marcador final.
   */
  private awardXp(
    player: MatchPlayerState,
    source: XpSource,
    amount: number
  ): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    player.xp += amount;
    player.xpBreakdown[source] += amount;
    // La participación se calcula a partir del tiempo y no debe renovar el
    // contador de actividad que la habilita.
    if (source !== 'participation' && source !== 'result') {
      player.lastActionAt = this.matchElapsed;
    }
  }

  /**
   * XP por intercambio de daño. Se normaliza por la vida máxima del objetivo
   * para que pelear contra un tanque no rinda más que contra un frágil, y se
   * limita la XP de daño por víctima y vida para que una curación constante no
   * convierta a un rival en una fuente infinita.
   */
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

    // Daño que Protección convirtió en nada: premia el bloqueo sin tocar la
    // fórmula de combate.
    const blocked = Math.max(0, rawDamage - finalDamage);
    if (blocked > 0) {
      this.awardXp(
        target,
        'blocked',
        (blocked / maxHp) * XP_REWARDS.blockedPerMaxHp
      );
    }
  }

  /** XP de una baja: KO, shutdown, asistencias y multibajas. */
  private awardKillXp(
    killer: MatchPlayerState,
    target: MatchPlayerState
  ): void {
    // Farmeo: matar una y otra vez al mismo rival rinde cada vez menos.
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

    // Shutdown: la víctima venía en racha.
    if (target.killStreak >= XP_RULES.shutdownStreak) {
      this.awardXp(killer, 'shutdown', XP_REWARDS.shutdown);
    }

    // Asistencias: quien aportó al menos el 20 % de la vida de la víctima en
    // los últimos 10 s. La ventana se mide contra la última aportación.
    for (const [slot, contribution] of target.damageContributors) {
      if (slot === killer.slot) continue;
      if (
        contribution.amount <
        target.maxHp * XP_RULES.assistMinDamageFraction
      ) {
        continue;
      }
      if (
        this.matchElapsed - contribution.at >
        XP_RULES.assistWindowSeconds
      ) {
        continue;
      }
      const assistant = this.matchPlayers.find((player) => player.slot === slot);
      if (!assistant || assistant.team === target.team) continue;
      this.awardXp(assistant, 'assist', XP_REWARDS.assist);
    }

    // Multibajas: se premia la 2.ª, la 3.ª y la 4.ª baja de la cadena. Las
    // siguientes ya no suman para no premiar una carnicería infinita.
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

  /** Reparte la XP de victoria y derrota cuando termina la partida. */
  private awardMatchResult(winner: Team): void {
    for (const player of this.matchPlayers) {
      this.awardXp(
        player,
        'result',
        player.team === winner ? XP_REWARDS.win : XP_REWARDS.loss
      );
    }
  }

  /**
   * Goteo de participación: 1 XP cada 10 s vivos, con un tope de 30 y solo si
   * el jugador ha hecho algo de combate en los últimos 30 s. Es decorativo y
   * está pensado para que un apoyo no termine la partida en nivel 1.
   */
  private updateParticipation(dt: number): void {
    if (this.matchOver) return;
    for (const player of this.matchPlayers) {
      if (!player.alive) continue;
      if (player.participationAwarded >= XP_REWARDS.participationCap) {
        player.participationTimer = 0;
        continue;
      }
      if (
        this.matchElapsed - player.lastActionAt >
        XP_RULES.participationIdleSeconds
      ) {
        continue;
      }
      player.participationTimer += dt;
      while (
        player.participationTimer >= XP_RULES.participationTickSeconds &&
        player.participationAwarded < XP_REWARDS.participationCap
      ) {
        player.participationTimer -= XP_RULES.participationTickSeconds;
        player.participationAwarded += XP_REWARDS.participationPerTick;
        this.awardXp(
          player,
          'participation',
          XP_REWARDS.participationPerTick
        );
      }
    }
  }

  private updateProjectiles(dt: number): void {
    // Un KO en un paso anterior del frame cancela los proyectiles restantes.
    if (this.matchOver) return;
    // Se recorre en orden de creación, no del más nuevo al más antiguo: si dos
    // proyectiles alcanzan al mismo objetivo en el mismo frame, el KO se
    // atribuye al más antiguo y el recién creado no puede robarlo. Se usa una
    // copia porque los proyectiles se retiran durante el recorrido.
    for (const projectile of this.projectiles.slice()) {
      // Un impacto de este mismo frame pudo cerrar la partida.
      if (this.matchOver) return;
      const previousX = projectile.x;
      const previousZ = projectile.z;
      // El último tramo se recorta al alcance restante para que el proyectil
      // termine siempre exactamente en `range`. Sin este recorte, a 20 FPS la
      // muestra final podía saltar de 8 a 9 u, no comprobar ese tramo y
      // desaparecer: el alcance efectivo dependía del framerate.
      const advance = Math.hypot(projectile.vx, projectile.vz) * dt;
      const remaining = Math.max(0, projectile.def.range - projectile.traveled);
      const step = Math.min(advance, remaining);
      const exhausted = step >= remaining;
      const reach = advance > 0 ? step / advance : 0;
      projectile.x += projectile.vx * dt * reach;
      projectile.z += projectile.vz * dt * reach;
      projectile.traveled += step;
      projectile.visual.setPosition(projectile.x, projectile.z);
      projectile.visual.update(dt);
      const bounds = this.world.bounds;
      const padding = Math.max(0.05, projectile.def.radius);
      // Se comprueba todo el tramo recorrido, no solo la posición final: a
      // 20 FPS (dt 0,05) el shuriken de Greninja avanza 1 u por frame y podía
      // atravesar un árbol de ~0,22 u de radio sin que el punto final tocara
      // nada. El padding es el radio del proyectil, igual que antes.
      const blocked = segmentBlockedByColliders(
        previousX,
        previousZ,
        projectile.x,
        projectile.z,
        this.world.colliders,
        padding
      );
      const travelX = projectile.x - previousX;
      const travelZ = projectile.z - previousZ;
      const travelLength = Math.hypot(travelX, travelZ);

      // Punto de estallido del obstáculo. Se calcula aparte de los objetivos
      // porque el impacto se resuelve por el primer evento del tramo.
      let obstacleImpactX = projectile.x;
      let obstacleImpactZ = projectile.z;
      if (blocked) {
        // La piedra, el orbe o el shuriken también deben estallar al chocar con
        // un separador, muro, roca o árbol. Se busca el primer punto de
        // contacto dentro del tramo, pero se retrasa un poco hacia el lanzador:
        // así el estallido queda fuera del radio de ocultación de la cordillera
        // y se ve, en vez de desaparecer dentro de la niebla del separador.
        const impactPadding = padding + 0.6;
        const contact = raycastColliderDistance(
          previousX,
          previousZ,
          travelX,
          travelZ,
          travelLength,
          this.world.colliders,
          impactPadding
        );
        const ratio = travelLength > 0.000001 ? contact / travelLength : 0;
        obstacleImpactX = previousX + travelX * ratio;
        obstacleImpactZ = previousZ + travelZ * ratio;
      }

      if (
        !blocked &&
        (Math.abs(projectile.x) > bounds.x ||
          Math.abs(projectile.z) > bounds.z)
      ) {
        this.removeProjectile(projectile);
        continue;
      }

      const hits: Array<{
        target: MatchPlayerState;
        distance: number;
        impactX: number;
        impactZ: number;
      }> = [];
      for (const target of this.matchPlayers) {
        if (!this.canHit(projectile.owner, target)) continue;
        if (projectile.hit.has(target)) continue;
        const hitRadius = target.hitRadius + projectile.def.radius;
        // La distancia se mide contra todo el tramo recorrido, no solo contra
        // la posición final: con pasos largos un roce lateral podía caer entre
        // dos muestras y perderse.
        if (
          pointSegmentDistance(
            target.x,
            target.z,
            previousX,
            previousZ,
            projectile.x,
            projectile.z
          ) > hitRadius
        ) {
          continue;
        }
        // La línea desde el punto de contacto hasta el objetivo tampoco puede
        // cruzar un obstáculo: un impacto justo al otro lado de un muro no
        // cuenta.
        const contact = closestPointOnSegment(
          target.x,
          target.z,
          previousX,
          previousZ,
          projectile.x,
          projectile.z
        );
        if (
          segmentBlockedByColliders(
            contact.x,
            contact.z,
            target.x,
            target.z,
            this.world.colliders
          )
        ) {
          continue;
        }

        // El estallido se dibuja en la superficie de entrada del proyectil, no
        // en el centro del objetivo. Cerca de un separador, ese centro puede
        // caer dentro de su radio de niebla y el impacto desaparecía. La misma
        // distancia de entrada ordena los objetivos dentro del tramo.
        let entryDistance = 0;
        let impactX = target.x;
        let impactZ = target.z;
        if (travelLength > 0.0001) {
          const unitX = travelX / travelLength;
          const unitZ = travelZ / travelLength;
          const toTargetX = target.x - previousX;
          const toTargetZ = target.z - previousZ;
          const along = toTargetX * unitX + toTargetZ * unitZ;
          const perpendicular = Math.abs(
            toTargetX * unitZ - toTargetZ * unitX
          );
          const entryOffset = Math.sqrt(
            Math.max(
              0,
              hitRadius * hitRadius - perpendicular * perpendicular
            )
          );
          entryDistance = Math.min(
            travelLength,
            Math.max(0, along - entryOffset)
          );
          impactX = previousX + unitX * entryDistance;
          impactZ = previousZ + unitZ * entryDistance;
        }
        // Si hay un collider entre el inicio del tramo y la superficie de
        // entrada del objetivo, el obstáculo es anterior: no se puede golpear
        // primero al rival que queda detrás.
        if (
          blocked &&
          segmentBlockedByColliders(
            previousX,
            previousZ,
            impactX,
            impactZ,
            this.world.colliders,
            padding
          )
        ) {
          continue;
        }
        hits.push({
          target,
          distance: entryDistance,
          impactX,
          impactZ
        });
      }
      hits.sort((a, b) => a.distance - b.distance);

      let removed = false;
      for (const hit of hits) {
        if (this.matchOver) break;
        projectile.hit.add(hit.target);
        this.applyAbilityDamage(projectile.owner, hit.target, projectile.def, {
          healToken: projectile.healToken,
          impactX: hit.impactX,
          impactZ: hit.impactZ,
          // El empuje nace donde entra el proyectil, no donde esté ahora el
          // tirador: si se movió durante el vuelo, la dirección no cambia.
          sourceX: hit.impactX,
          sourceZ: hit.impactZ
        });
        if (projectile.pierce > 0) {
          projectile.pierce -= 1;
        } else {
          this.removeProjectile(projectile);
          removed = true;
          break;
        }
      }
      if (removed || this.matchOver) continue;

      if (blocked) {
        this.combatFx.spawnImpact(
          obstacleImpactX,
          obstacleImpactZ,
          projectile.def.color,
          1,
          projectile.def.impactStyle
        );
        // Un proyectil que choca contra un muro también debe oírse.
        playAbilityImpact(1);
        this.removeProjectile(projectile);
        continue;
      }

      // El alcance se agota después de revisar el tramo final, no antes.
      if (exhausted) this.removeProjectile(projectile);
    }
  }

  /**
   * Avanza las áreas persistentes y golpea en cada tick a los enemigos que
   * sigan dentro. En modo `overTime`, `power` se interpreta como daño por
   * segundo, así que cada tick usa `power × aoeTickInterval`.
   */
  private updateActiveAoes(dt: number): void {
    // Si un tick de un área cierra la partida, las áreas restantes no siguen
    // repartiendo daño hasta el siguiente frame (que ya no se simula).
    if (this.matchOver) return;
    // Orden de creación, como los proyectiles: el área más antigua hace su tick
    // antes y, si dos ticks son letales en el mismo frame, el KO no cambia
    // según cuál se creó después. Se recorre una copia porque las áreas
    // terminadas se retiran durante el recorrido.
    for (const aoe of this.activeAoes.slice()) {
      aoe.elapsed += dt;
      aoe.tickTimer -= dt;
      // El primer tick cae al aparecer el área (tickTimer empieza en 0).
      let guard = 0;
      while (
        aoe.tickTimer <= 0 &&
        aoe.elapsed < aoe.duration &&
        guard < 8
      ) {
        guard += 1;
        this.tickAoe(aoe);
        aoe.tickTimer += aoe.tickInterval;
      }
      if (aoe.elapsed >= aoe.duration) {
        const index = this.activeAoes.indexOf(aoe);
        if (index >= 0) this.activeAoes.splice(index, 1);
      }
    }
  }

  private tickAoe(aoe: ActiveAoe): void {
    const basePower = aoe.def.power * aoe.tickInterval;
    // El callback de la habilidad decide qué se aplica en cada tick. El efecto
    // por defecto conserva el comportamiento histórico: si no hay daño ni
    // slow, el tick no hace nada, pero un callback propio puede seguir
    // repartiendo buffs o debuffs.
    this.resolveAoeHit({
      owner: aoe.owner,
      def: aoe.def,
      x: aoe.x,
      z: aoe.z,
      radius: aoe.radius,
      mode: 'overTime',
      tick: aoe.tick,
      elapsed: aoe.elapsed,
      power: basePower,
      healToken: aoe.healToken,
      immuneMarked: aoe.immuneMarked
    });
    aoe.tick += 1;
  }

  /**
   * Aplica los golpes de dash del frame. La detección ya ocurrió durante el
   * movimiento, pero el objetivo pudo moverse después (actúa más tarde en
   * `matchPlayers`) o quedar tras un obstáculo: se revalida el tramo guardado
   * antes de aplicar el daño, igual que hace la melee.
   */
  private resolveInstantHits(): void {
    if (this.pendingInstantHits.length === 0) return;
    const hits = this.pendingInstantHits;
    this.pendingInstantHits = [];
    // Los golpes se aplican en orden de lanzamiento. Si varios son letales en
    // el mismo frame, el KO se atribuye al primero: es una regla explícita y
    // reproducible, y ninguno de los posteriores puede robarlo.
    for (const hit of hits) {
      if (this.matchOver) break;
      if (!this.canHit(hit.attacker, hit.target)) continue;
      if (
        !this.dashSweepHits(
          hit.target,
          hit.ax,
          hit.az,
          hit.bx,
          hit.bz,
          hit.dirX,
          hit.dirZ,
          hit.reach
        )
      ) {
        continue;
      }
      // El empuje de un golpe de dash sigue la dirección del desplazamiento, no
      // la posición final del lanzador: si el dash termina más allá del
      // objetivo, `target - attacker` puede apuntar hacia atrás y empujarlo en
      // contra del dash. Se usa un origen justo detrás del objetivo sobre la
      // dirección del dash; `applyKnockback` solo necesita el vector.
      this.applyAbilityDamage(hit.attacker, hit.target, hit.def, {
        healToken: hit.healToken,
        sourceX: hit.target.x - hit.dirX,
        sourceZ: hit.target.z - hit.dirZ
      });
    }
  }

  private meleePairKey(a: MatchPlayerState, b: MatchPlayerState): string {
    return a.slot < b.slot ? `${a.slot}-${b.slot}` : `${b.slot}-${a.slot}`;
  }

  /**
   * Un golpe melee pendiente sigue siendo válido si el atacante vive, el
   * objetivo se puede golpear, ambos siguen dentro del rango y del cono y no
   * hay ningún obstáculo entre ellos. Se usa tanto para emparejar choques como
   * para aplicar el daño: así un golpe caducado (atacante muerto, objetivo
   * invulnerable o al otro lado de un muro) no puede anular el golpe rival.
   */
  private meleeHitValid(hit: PendingMeleeHit): boolean {
    const { attacker, target, def } = hit;
    if (!attacker.alive || !this.canHit(attacker, target)) return false;
    if (
      !sectorOverlapsCircle(
        attacker.x,
        attacker.z,
        attacker.facing,
        def.halfAngle * DEG,
        def.range + maxHitRadius(),
        target.x,
        target.z,
        target.hitRadius
      )
    ) {
      return false;
    }
    return !segmentBlockedByColliders(
      attacker.x,
      attacker.z,
      target.x,
      target.z,
      this.world.colliders,
      CONFIG.combat.meleeSightPadding
    );
  }

  /**
   * Resuelve los golpes melee del frame. Si dos rivales se golpean mutuamente,
   * se produce un choque: ninguno recibe daño, ambos reciben un stun corto y
   * retroceden. Así dos Placajes simultáneos no se intercambian gratis.
   */
  private resolveMeleeHits(): void {
    // La partida pudo terminar antes de esta fase; los golpes pendientes se
    // descartan para no dañar a nadie tras el resultado.
    if (this.matchOver) {
      this.pendingMeleeHits = [];
      return;
    }
    if (this.pendingMeleeHits.length === 0) return;
    const hits = this.pendingMeleeHits;
    this.pendingMeleeHits = [];
    // Solo los golpes que siguen siendo válidos pueden emparejarse en un
    // choque. Antes se emparejaban sin comprobar nada, así que un atacante
    // muerto o un objetivo invulnerable podía anular el golpe del rival.
    const validHits = hits.filter((hit) => this.meleeHitValid(hit));
    const clashPairs = new Set<string>();

    for (const hit of validHits) {
      const key = this.meleePairKey(hit.attacker, hit.target);
      if (clashPairs.has(key)) continue;
      const reverse = validHits.some(
        (other) =>
          other.attacker === hit.target && other.target === hit.attacker
      );
      if (!reverse) continue;

      clashPairs.add(key);
      const midpointX = (hit.attacker.x + hit.target.x) / 2;
      const midpointZ = (hit.attacker.z + hit.target.z) / 2;
      this.combatFx.spawnHit(midpointX, midpointZ, [255, 240, 170], 2);

      for (const player of [hit.attacker, hit.target]) {
        player.stunTimer = Math.max(
          player.stunTimer,
          CONFIG.combat.clashStunSeconds
        );
        player.hurtTimer = Math.max(player.hurtTimer, 0.35);
        player.actionTimer = 0;
        player.moveLockTimer = 0;
        player.dash = null;
        this.cancelPendingCast(player);
        player.vx = 0;
        player.vz = 0;
        player.animation = 'hurt';
        player.playback = 1;
      }

      this.applyKnockback(
        hit.attacker,
        hit.target.x,
        hit.target.z,
        CONFIG.combat.clashKnockback
      );
      this.applyKnockback(
        hit.target,
        hit.attacker.x,
        hit.attacker.z,
        CONFIG.combat.clashKnockback
      );
    }

    // Misma regla que en los golpes de dash: orden de lanzamiento y, si varios
    // son letales en el mismo frame, el KO queda para el primero.
    for (const hit of hits) {
      // Un golpe anterior de esta misma tanda pudo cerrar la partida.
      if (this.matchOver) break;
      if (clashPairs.has(this.meleePairKey(hit.attacker, hit.target))) continue;
      // El objetivo puede haberse movido en este mismo frame (dash, empuje de
      // otro golpe...), así que se revalida todo antes de aplicar el daño.
      if (!this.meleeHitValid(hit)) continue;
      this.applyAbilityDamage(hit.attacker, hit.target, hit.def, {
        healToken: hit.healToken
      });
    }
  }

  /** Empuja al objetivo en dirección opuesta al atacante. */
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

  private emitMatchStats(): void {
    this.pruneKillFeed();
    // Se emiten todos los combatientes, no solo las vistas humanas: la pantalla
    // final y cualquier marcador necesitan también las estadísticas de los bots.
    const stats: PlayerMatchStats[] = this.matchPlayers.map((player) => {
      // Cada humano tiene una copia por vista y su brújula usa la de su propia
      // vista. Los bots no generan vista: se leen de la primera pantalla.
      const viewIndex = player.isBot ? 0 : this.views.indexOf(player);
      const own = player.copies[viewIndex] ?? player.copies[0];
      const row = own?.billboard.currentRow ?? 0;
      const terrain = TERRAINS[player.terrain];
      const commonOption = commonAbilityOption(player.commonAbilityId);
      const commonDef = ABILITIES[player.commonAbilityId];
      const xp = xpStatus(player.xp);
      return {
        slot: player.slot,
        name: player.name,
        team: player.team,
        pokemonId: player.pokemonId,
        fps: Math.round(this.fps),
        yaw: player.camera.yaw * RAD,
        row,
        direction: this.manifest?.directions[row] ?? 'S',
        facing: ((player.facing * RAD) % 360 + 360) % 360,
        speed: Math.hypot(player.vx, player.vz),
        x: player.x,
        z: player.z,
        gamepad: player.deviceKind === 'gamepad',
        animation: player.animation,
        terrain: player.terrain,
        terrainName: terrain.name,
        terrainType: terrain.type,
        terrainSpeedMultiplier: player.terrainMultiplier,
        terrainSpeedReason: player.terrainSpeedReason,
        visionRange: player.visionRange,
        detectionRange: effectiveVisionRange(player.visionRange, player.concealment.value),
        concealment: player.concealment.value,
        concealmentBase: player.concealment.base,
        concealmentMultiplier: player.concealment.multiplier,
        concealmentReason: player.concealment.reason,
        enemiesSeeing: player.enemiesSeeing,
        discovered: player.alive && player.enemiesSeeing > 0,
        hp: player.hp,
        maxHp: player.maxHp,
        alive: player.alive,
        respawnIn: player.respawnTimer,
        invulnerable: player.invulnerableTimer > 0,
        kills: player.kills,
        deaths: player.deaths,
        damageDealt: player.damageDealt,
        damageTaken: player.damageTaken,
        abilityHealing: player.abilityHealing,
        pickupHealing: player.pickupHealing,
        xp: xp.xp,
        level: xp.level,
        rank: xp.rank,
        xpIntoLevel: xp.intoLevel,
        xpToNext: xp.toNext,
        xpProgress: xp.progress,
        xpBreakdown: { ...player.xpBreakdown },
        buffs: player.buffs.map((buff) => ({
          stat: buff.stat,
          multiplier: buff.multiplier,
          remaining: buff.duration
        })),
        slows: player.slowEffects.map((effect) => ({
          multiplier: effect.multiplier,
          remaining: effect.remaining
        })),
        abilities: player.abilityIds.slice(0, 4).map((id, abilityIndex) => {
          const def = id ? ABILITIES[id] : null;
          return {
            slot: ABILITY_SLOTS[abilityIndex] as AbilitySlot,
            id: id ?? '',
            name: def?.name ?? 'Sin asignar',
            type: def?.type ?? '',
            category: def?.category ?? 'status',
            cooldown: player.cooldowns[abilityIndex] ?? 0,
            duration: def?.cooldown ?? 0
          };
        }),
        shieldActive: player.damageReductionTimer > 0,
        commonAbility: commonOption
          ? {
              id: commonOption.id,
              name: commonOption.name,
              short: commonOption.short,
              passive: commonOption.passive,
              cooldown: player.cooldowns[4] ?? 0,
              duration: commonDef?.cooldown ?? 0,
              readyIn: commonOption.passive
                ? Math.max(0, REGENERATION_DELAY_SECONDS - player.hiddenTimer)
                : 0,
              active: commonOption.passive ? player.regenerating : false,
              // El icono de Regeneración solo describe el estado real: si el
              // jugador está KO, lo ve un rival o está a vida máxima, no se
              // dibuja (docs/common-abilities.md, HUD).
              hidden:
                commonOption.passive &&
                (!player.alive ||
                  player.enemiesSeeing > 0 ||
                  player.hp >= player.maxHp),
              description: commonOption.description
            }
          : null,
        feed: this.killFeed,
        blueScore: this.teamScores.blue,
        redScore: this.teamScores.red,
        winner: this.winner
      };
    });
    this.callbacks.onMatchStats(stats);
  }

  /**
   * Capas de las vistas que deben dibujar un FX situado en `(x, z)`.
   *
   * Un efecto usa la misma regla que un actor: entra en la vista si el punto
   * cae dentro del rango efectivo del observador (descontando la ocultación
   * del terreno) y no hay una montaña o un árbol entre medias. Así la niebla
   * tapa también proyectiles, haces, áreas e impactos, no solo los sprites.
   * Devuelve `[]` cuando ninguna vista lo ve: el efecto no se dibuja.
   */
  private fxLayersAt(
    x: number,
    z: number,
    ignoreTerrainConcealment = false
  ): number[] {
    if (this.mode !== 'match' || this.views.length === 0) {
      return [this.worldLayerId];
    }
    const colliders = this.world.colliders;
    // La ocultación del punto sale del terreno, pero si el ancla cae sobre un
    // Pokémon se usa la suya (terreno + tipos): así el FX se oculta exactamente
    // cuando se oculta su sprite, incluso en hierba alta o ciénaga. Los
    // proyectiles ignoran esa ocultación: deben verse mientras cruzan la
    // vegetación, aunque la línea de visión siga limitada por muros y montañas.
    let concealment = ignoreTerrainConcealment
      ? 0
      : terrainConcealment(terrainAt(x, z), NO_TYPES).value;
    if (!ignoreTerrainConcealment) {
      for (const player of this.matchPlayers) {
        if (!player.alive) continue;
        if (
          Math.hypot(player.x - x, player.z - z) >
          player.hitRadius + 0.1
        ) {
          continue;
        }
        concealment = Math.max(concealment, player.concealment.value);
      }
    }
    const layers: number[] = [];
    // La visión es de equipo: un FX se dibuja si lo ve cualquier Pokémon vivo
    // del equipo de esa vista, incluidos los bots. Los equipos suelen tener
    // varias vistas, así que el chequeo se hace una sola vez por equipo.
    const seenTeams = new Set<Team>();
    this.views.forEach((observer, index) => {
      const layer = this.viewLayers[index];
      if (!layer) return;
      if (!seenTeams.has(observer.team)) {
        if (this.teamSeesPoint(observer.team, x, z, concealment, colliders)) {
          seenTeams.add(observer.team);
        }
      }
      if (seenTeams.has(observer.team)) layers.push(layer.id);
    });
    return layers;
  }

  /** ¿Ve algún Pokémon vivo del equipo el punto `(x, z)`? */
  private teamSeesPoint(
    team: Team,
    x: number,
    z: number,
    concealment: number,
    colliders: readonly Collider[]
  ): boolean {
    const point = { x, z };
    for (const observer of this.matchPlayers) {
      if (!observer.alive || observer.team !== team) continue;
      if (isTargetVisible(observer, point, concealment, colliders)) return true;
    }
    return false;
  }

  /**
   * Visibilidad de un actor para un observador concreto. La primera puerta es
   * la máscara de niebla del equipo (círculos + sombras de separadores y
   * árboles); si el punto está tapado, el actor no se ve aunque esté cerca.
   * Después se aplica la ocultación del terreno del objetivo sobre el radio de
   * visión del observador.
   */
  private observerSeesActor(
    observer: MatchPlayerState,
    target: MatchPlayerState,
    alreadyVisible: boolean
  ): boolean {
    const mask = this.fogMasks.get(observer.team);
    if (mask && !mask.isVisibleAt(target.x, target.z)) return false;
    const distance = Math.hypot(target.x - observer.x, target.z - observer.z);
    const effective = effectiveVisionRange(
      observer.visionRange,
      target.concealment.value
    );
    const limit = alreadyVisible
      ? effective + CONFIG.vision.hysteresis
      : effective;
    return distance <= limit;
  }

  /**
   * ¿Ve el equipo el punto de un objeto? Los objetos no se esconden por la
   * ocultación del terreno (arena, veneno, hierba alta...), solo por el radio
   * de visión y por la línea de visión (separadores y árboles). Se usa el mismo
   * conjunto de observadores que dibuja la niebla: un humano KO conserva su
   * círculo porque su cámara sigue al cuerpo, así que los objetos de esa zona
   * deben seguir viéndose.
   */
  private teamSeesPickupPoint(
    team: Team,
    x: number,
    z: number,
    colliders: readonly Collider[]
  ): boolean {
    const point = { x, z };
    for (const observer of this.matchPlayers) {
      if (observer.team !== team) continue;
      if (!observer.alive && observer.isBot) continue;
      if (isTargetVisible(observer, point, 0, colliders)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Resuelve la niebla de cada vista: oculta las copias que no se ven y coloca
   * el degradado fuera de la unión de círculos del equipo. La visión es
   * compartida: cada vista revela lo que ven todos sus Pokémon vivos, humanos
   * y bots. La ocultación del objetivo se calcula con el terreno que pisa, no
   * con el del observador.
   */
  private updateVision(): void {
    const colliders = this.world.colliders;
    for (const player of this.matchPlayers) player.enemiesSeeing = 0;

    // Círculos de visión por equipo: se calculan una vez por frame y se
    // reutilizan en todas sus vistas. Un humano KO conserva su círculo porque
    // su cámara sigue al cuerpo hasta reaparecer; un bot KO no aporta visión.
    const circlesByTeam = new Map<Team, VisionCircle[]>();
    const localCircleBySlot = new Map<number, VisionCircle>();
    for (const player of this.matchPlayers) {
      if (!player.alive && player.isBot) continue;
      const circle: VisionCircle = {
        x: player.x,
        z: player.z,
        visionRange: player.visionRange
      };
      localCircleBySlot.set(player.slot, circle);
      let circles = circlesByTeam.get(player.team);
      if (!circles) {
        circles = [];
        circlesByTeam.set(player.team, circles);
      }
      circles.push(circle);
    }

    // La máscara world-space se compone una sola vez por equipo, aunque haya
    // varias vistas suyas en pantalla. Debe actualizarse antes de decidir la
    // visibilidad de los actores: la máscara es la primera puerta y la
    // ocultación del terreno se aplica después.
    const noCircles: readonly VisionCircle[] = [];
    for (const [team, mask] of this.fogMasks) {
      mask.update(circlesByTeam.get(team) ?? noCircles);
    }

    // Visibilidad compartida por equipo. Se resuelve una vez por frame y se
    // reutiliza en todas las vistas y en la histéresis, que ahora es de equipo.
    const previous = this.visibleByTeam;
    const current: Record<Team, Set<number>> = {
      blue: new Set(),
      red: new Set()
    };

    for (const observer of this.matchPlayers) {
      // Un humano KO conserva su cámara y su círculo de niebla; por tanto,
      // también puede revelar actores en esa zona. Un bot KO no aporta visión.
      if (!observer.alive && observer.isBot) continue;
      if (observer.alive) current[observer.team].add(observer.slot);
      for (const target of this.matchPlayers) {
        if (target === observer) continue;
        // Un aliado vivo ya está en el conjunto por su propio slot; solo hay
        // que comprobar rivales y aliados que acaban de caer.
        if (target.alive && target.team === observer.team) continue;
        // Un KO deja ver la animación de daño un instante; el cuerpo sigue
        // siendo visible para el equipo que lo vio caer.
        if (!target.alive && target.deathFade <= 0) continue;
        const alreadyVisible = previous[observer.team].has(target.slot);
        // El HUD "Descubierto" y la regeneración siguen contando la línea de
        // visión directa de cada rival vivo, no la visión compartida del equipo.
        if (
          observer.alive &&
          target.alive &&
          observer.team !== target.team &&
          isTargetVisible(
            observer,
            target,
            target.concealment.value,
            colliders,
            alreadyVisible
          )
        ) {
          target.enemiesSeeing += 1;
        }
        if (!this.observerSeesActor(observer, target, alreadyVisible)) continue;
        current[observer.team].add(target.slot);
      }
    }
    this.visibleByTeam = current;

    this.views.forEach((observer, viewIndex) => {
      const fog = this.fogViews[viewIndex];
      const camera = observer.camera.entity.camera;
      const circles = this.circlesForView(
        viewIndex,
        localCircleBySlot.get(observer.slot),
        circlesByTeam.get(observer.team) ?? noCircles
      );
      if (fog && camera) {
        fog.update(
          camera,
          observer.viewport,
          observer.camera.yaw,
          circles
        );
      }

      const decal = this.fogDecals[viewIndex];
      if (decal) {
        const screenFog = fog && camera ? fog.screenFog : null;
        decal.update(screenFog);
      }

      const visibleSlots = current[observer.team];
      for (const target of this.matchPlayers) {
        const copy = target.copies[viewIndex];
        if (!copy) continue;
        // Un KO deja ver la animación de daño un instante; después el cuerpo
        // desaparece hasta reaparecer.
        if (!target.alive && target.deathFade <= 0) {
          copy.setVisible(false);
          continue;
        }
        if (target === observer) {
          copy.setVisible(true);
          continue;
        }
        copy.setVisible(visibleSlots.has(target.slot));
      }
    });

    this.updatePickupKnowledge(colliders);
  }

  /**
   * Calcula qué objetos ve cada equipo y cuáles están disponibles. La
   * visibilidad se toma de la máscara de niebla del equipo: círculos de visión,
   * separadores y árboles (sin la ocultación del terreno). El estado de
   * disponibilidad solo se guarda para los puntos visibles: los bots no pueden
   * consultar el resto.
   *
   * Se calcula para los dos equipos, aunque uno no tenga ninguna vista humana
   * (por ejemplo, un equipo formado solo por bots).
   */
  private updatePickupKnowledge(colliders: readonly Collider[]): void {
    const pickups = this.pickups;
    if (!pickups) return;
    const knowledge: Record<Team, Map<string, boolean>> = {
      blue: new Map(),
      red: new Map()
    };
    const seenCache = new Map<string, boolean>();

    const sees = (team: Team, spawn: { x: number; z: number }): boolean => {
      const pointKey = `${spawn.x}:${spawn.z}`;
      const teamKey = `${team}:${pointKey}`;
      let visible = seenCache.get(teamKey);
      if (visible === undefined) {
        // La máscara de niebla es la fuente de verdad: si el decal pinta el
        // punto como visible, el objeto se muestra. Así no puede quedarse
        // oculto en una zona que el jugador ve despejada por unos píxeles de
        // diferencia entre la comprobación geométrica y el render.
        const mask = this.fogMasks.get(team);
        visible = mask
          ? mask.isVisibleAt(spawn.x, spawn.z)
          : this.teamSeesPickupPoint(team, spawn.x, spawn.z, colliders);
        seenCache.set(teamKey, visible);
        if (visible) {
          knowledge[team].set(pointKey, pickups.isAvailableAt(spawn.x, spawn.z));
        }
      }
      return visible;
    };

    pickups.forEachSpawn((spawn) => {
      sees('blue', spawn);
      sees('red', spawn);
    });

    this.pickupKnowledge = knowledge;
    pickups.updateVisibility((spawn, viewIndex) => {
      const observer = this.views[viewIndex];
      return observer ? sees(observer.team, spawn) : false;
    });
  }

  /**
   * Círculos de una vista con su propio observador primero: `FogView` muestrea
   * con más detalle el primer círculo de la unión. Reutiliza el buffer de la
   * vista para no asignar memoria en cada frame.
   */
  private circlesForView(
    viewIndex: number,
    local: VisionCircle | undefined,
    teamCircles: readonly VisionCircle[]
  ): readonly VisionCircle[] {
    let circles = this.viewCircles[viewIndex];
    if (!circles) {
      circles = [];
      this.viewCircles[viewIndex] = circles;
    }
    circles.length = 0;
    if (local) circles.push(local);
    for (const circle of teamCircles) {
      if (circle !== local) circles.push(circle);
    }
    return circles;
  }

  private resolvePosition(
    self: Pick<MatchPlayerState, 'types'>,
    x: number,
    z: number
  ): { x: number; z: number } {
    const radius = CONFIG.player.radius;
    const colliders: Collider[] = this.world.colliders;
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

      // Aguas profundas: solo los Pokémon de tipo Agua pueden entrar.
      if (!self.types.includes('Water')) {
        const resolved = resolveDeepWater(px, pz, radius);
        if (resolved[0] !== px || resolved[1] !== pz) {
          px = resolved[0];
          pz = resolved[1];
          pushed = true;
        }
      }

      // Colisión entre jugadores vivos; un KO no bloquea el paso.
      for (const other of this.matchPlayers) {
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
      x: clamp(px, -bounds.x, bounds.x),
      z: clamp(pz, -bounds.z, bounds.z)
    };
  }

  /**
   * Avanza un dash en pasos pequeños comprobando colisiones en cada tramo.
   *
   * Resolver solo el destino final permitiría que un dash de 4,5 u saltase al
   * otro lado de un separador fino. Aquí cada paso comprueba el segmento
   * recorrido: si un separador, árbol o muro lo bloquea, el dash se detiene en
   * el último punto seguro.
   */
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
      // También frena si el paso se queda atascado contra otro jugador, un
      // límite del mapa o un agua profunda.
      if (moved < stepSize * 0.35) break;
      x = next.x;
      z = next.z;
    }

    return { x, z };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.app.off('update', this.onUpdate);
    this.input.dispose();
    this.clearMatch();
    this.pickups?.dispose();
    this.pickups = null;
    disposeItemTextures(this.itemTextures);
    this.combatFx.destroy();
    this.damageNumbers.destroy();
    this.fogMesh?.destroy();
    this.fogMesh = null;
    this.fogDecalMesh?.destroy();
    this.fogDecalMesh = null;
    this.menuCamera?.dispose();
    for (const asset of this.assets.values()) disposeSpriteAsset(asset);
    this.assets.clear();
    this.world?.dispose();
    // El manager pertenece a la aplicación: se sueltan las referencias antes
    // de destruirla para que ningún sonido tardío toque un contexto cerrado.
    disposeAudio(this.app);
    this.app.destroy();
  }
}
