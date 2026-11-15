/**
 * Ciclo de vida de la partida: empezar, terminar y limpiar.
 *
 * `Game` conserva la API pública (`startMatch`/`endMatch`) y delega aquí. El
 * módulo no conoce la clase completa: recibe un host explícito con el estado
 * mutable de la sesión y las acciones de presentación que sí dependen del
 * motor (cámaras, niebla, atmósfera, resolución).
 */

import * as pc from 'playcanvas';
import { DEFAULT_COMMON_ABILITY, MOVESETS, isCommonAbilityId } from '../abilities';
import { Actor, actorSpriteHeight } from '../actor';
import { rollAtmosphere, type AtmosphereId } from '../atmosphere';
import {
  prepareMatchAudio,
  releaseMatchAudio,
  startMatchMusic,
  stopMatchMusic
} from '../audio';
import { BotController, botVisionFactor, createBotSquad } from '../bot';
import { BotNavGrid } from '../botNav';
import { CameraRig } from '../camera';
import { CONFIG } from '../config';
import type { TelegraphHandle } from '../core/ports/fx';
import { DamageNumbers } from '../damageNumbers';
import { DeathMarker } from '../deathMarker';
import { FogMask, FogView } from '../fog';
import { HealthBarArt, healthBarLayoutFor } from '../healthBar';
import type { HealthBarOverlay } from '../healthBarOverlay';
import type { HumanInputBuffer } from '../inputBuffer';
import type { PickupSpawn } from '../items';
import { createPickupKnowledge, type PickupKnowledge } from '../pickupKnowledge';
import type {
  ActiveAoe,
  MatchPlayerState,
  PendingInstantHit,
  PendingMeleeHit,
  Projectile,
  QueuedCast
} from '../matchState';
import {
  KOTH_DEFAULT_RADIUS,
  createGameMode,
  type GameModeId,
  type GameModeRuntime,
  type ModeSettings,
  type ObjectiveZone
} from '../modes';
import {
  MAX_PLAYERS,
  TEAM_INFO,
  cameraYawForTeam,
  computeSplitLayout,
  createTeamRecord,
  facingToCenter,
  matchPixelRatio,
  spawnForTeam,
  viewportHeightPx,
  type KillFeedEntry,
  type MatchPlayerConfig,
  type PlayerMatchStats
} from '../multiplayer';
import type { PickupField } from '../pickups';
import { baseStatsFor, combatStatsFor } from '../pokedex';
import { ActorShadowBatch } from '../render/actorShadows';
import { createPlayerView, type PlayerView } from '../render/playerView';
import type { CombatFx } from '../render/fx/CombatFx';
import type { VisionView } from '../render/visionView';
import { hitRadiusForPokemon, speedForPokemon } from '../roster';
import type { PendingAoeEnd } from '../sim/aoes';
import { DEFAULT_SKIN_ID } from '../skins';
import { BILLBOARD_ANIMATION_ORDER, type SpriteAsset } from '../sprite';
import { isSmallViewport, spriteOutlineWidth } from '../spriteDetail';
import { terrainAt, type Team } from '../terrain';
import { terrainSpeedEffect } from '../terrainSpeed';
import type { AnimationName } from '../types';
import { terrainConcealment, visionForPokemon } from '../vision';
import type { World } from '../world';
import { emptyXpBreakdown } from '../xp';

/** Callbacks de la sesión que consume la pantalla de juego. */
export interface MatchSessionCallbacks {
  onError(message: string): void;
  onCountdown(remaining: number | null): void;
  onMatchStats(stats: PlayerMatchStats[]): void;
}

/** Número de daño que espera a que el render tenga hueco. */
export interface PendingPopup {
  target: MatchPlayerState;
  /**
   * Quién provocó el número: el atacante o el lanzador de la curación. `null`
   * cuando la fuente es el entorno (por ejemplo, el clima). Se usa para el
   * filtro de «solo los míos»: cada vista muestra lo que hace o recibe su
   * jugador, incluido el autodaño y las pociones.
   */
  source: MatchPlayerState | null;
  amount: number;
  critical: boolean;
  effectiveness: number;
  heal: boolean;
  lethal: boolean;
  immune: boolean;
}

/**
 * Estado mutable de la sesión y acciones que dependen del motor. Los getters y
 * setters viven en `Game`; el host es el único contrato que ve este módulo.
 */
export interface MatchSessionHost {
  readonly app: pc.AppBase;
  readonly callbacks: MatchSessionCallbacks;

  /** Manifiesto y sprites listos: sin ellos no se puede empezar. */
  readonly ready: boolean;

  /** Mundo y objetos del mapa activo. */
  readonly world: World;
  readonly pickups: PickupField | null;
  /** Cámara del menú; se deshabilita durante la partida y se recupera al salir. */
  readonly menuCamera: CameraRig;
  /** Objetos que superaron la validación de posición del mapa. */
  readonly pickupSpawns: readonly PickupSpawn[];

  /** Sprite del aspecto elegido por un jugador (o el normal si no hay). */
  assetFor(pokemonId: string, skinId?: string): SpriteAsset | undefined;

  // --- Fase y contadores ---
  mode: 'menu' | 'match';
  paused: boolean;
  statsTimer: number;
  fps: number;
  countdown: number;
  countdownGo: number;
  countdownShown: number | null;
  matchElapsed: number;
  simAccumulator: number;
  matchOver: boolean;
  winner: Team | null;

  // --- Modo y objetivos ---
  readonly gameModeId: GameModeId;
  readonly modeSettings: ModeSettings;
  readonly atmosphereEnabled: boolean;
  gameMode: GameModeRuntime | null;
  objectiveZone: ObjectiveZone | null;
  objectiveMarker: TelegraphHandle | null;
  objectiveMarkerTeam: Team | null | undefined;
  teamScores: Record<Team, number>;
  killFeed: KillFeedEntry[];
  killFeedSeq: number;

  // --- Colecciones de simulación que se vacían en `clearMatch` ---
  projectiles: Projectile[];
  activeAoes: ActiveAoe[];
  pendingAoeEnds: PendingAoeEnd[];
  pendingMeleeHits: PendingMeleeHit[];
  queuedCasts: QueuedCast[];
  pendingInstantHits: PendingInstantHit[];
  pendingPopups: PendingPopup[];

  // --- Presentación y niebla ---
  /** Capas base de la cámara que comparten todas las vistas humanas. */
  readonly baseCameraLayers: number[];
  readonly combatFx: CombatFx;
  readonly damageNumbers: DamageNumbers;
  readonly healthBars: HealthBarOverlay;
  readonly inputBuffer: HumanInputBuffer;
  readonly visionView: VisionView;
  fogViews: FogView[];
  fogMesh: pc.Mesh | null;
  readonly fogMasks: Map<Team, FogMask>;
  deathMarkers: Map<number, Array<DeathMarker | null>>;
  readonly viewSkies: Map<CameraRig, pc.Entity>;
  readonly viewSkyLayers: pc.Layer[];
  viewLayers: pc.Layer[];
  viewOf(player: MatchPlayerState): PlayerView;
  createViewSky(layerId: number, index: number, camera: CameraRig): pc.Entity;
  ensureFogMask(team: Team): FogMask;
  ensureFogMesh(): pc.Mesh;

  // --- Jugadores y bots ---
  matchPlayers: MatchPlayerState[];
  playerBySlot: Map<number, MatchPlayerState>;
  playerViews: Map<MatchPlayerState, PlayerView>;
  views: MatchPlayerState[];
  bots: Map<number, BotController>;
  botNav: BotNavGrid | null;
  prewarmTasks: Array<{ actor: Actor; animation: AnimationName }>;
  prewarmIndex: number;

  // --- Visibilidad ---
  visibleByTeam: Record<Team, Set<number>>;
  visibleByTeamScratch: Record<Team, Set<number>>;
  simulationStep: number;
  pickupKnowledge: PickupKnowledge;

  // --- Acciones de `Game` ---
  /** Zonas declaradas por el mapa, para los modos de control. */
  resolveObjectiveZones(): ObjectiveZone[];
  /** Resuelve una posición contra colliders, límites y agua profunda. */
  resolvePosition(
    self: Pick<MatchPlayerState, 'types' | 'team'>,
    x: number,
    z: number
  ): { x: number; z: number };
  /** Ajusta el plano lejano de cada vista al final de la niebla. */
  updateViewFarClip(): void;
  /** Rehornea el shadow map del sol si hay sombras activas. */
  refreshSunShadows(): void;
  /** Deja una foto de visibilidad para la cuenta atrás y el primer paso. */
  refreshCombatVisibility(): void;
  /** Aro permanente de la zona de control para que el objetivo sea legible. */
  spawnObjectiveMarker(): void;
  /** Aplica un clima a la escena y avisa al HUD. */
  setAtmosphere(id: AtmosphereId): void;
  /** Vuelve al aspecto despejado y retira el aviso del HUD. */
  clearAtmosphere(): void;
  /** Fija el presupuesto de píxeles del modo actual. */
  setResolutionBaseline(baseline: number): void;
}

/** Convierte el `accent` hexadecimal del manifiesto a 0-255. */
export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  if (value.length !== 6) return [255, 255, 255];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

/** Cuenta atrás antes de que los jugadores puedan moverse al empezar. */
export const MATCH_COUNTDOWN_SECONDS = 5;

/** Vuelve al menú de selección y destruye la partida actual. */
export function endMatch(host: MatchSessionHost): void {
  clearMatch(host);
  stopMatchMusic();
  // Los efectos del roster dejan de ser útiles: se descargan para que una
  // partida con otras especies no acumule AudioBuffer.
  releaseMatchAudio();
  host.pickups?.reset();
  host.mode = 'menu';
  host.paused = false;
  host.statsTimer = 0;
  host.setResolutionBaseline(Math.min(window.devicePixelRatio || 1, 1.75));
  host.menuCamera.setEnabled(true);
  host.refreshSunShadows();
  host.clearAtmosphere();
  host.callbacks.onMatchStats([]);
  host.callbacks.onCountdown(null);
}

/** Destruye la partida actual sin tocar el mundo ni los objetos del mapa. */
export function clearMatch(host: MatchSessionHost): void {
  for (const projectile of host.projectiles) projectile.visual.destroy();
  host.projectiles = [];
  host.activeAoes = [];
  host.pendingAoeEnds = [];
  host.pendingMeleeHits = [];
  host.queuedCasts = [];
  host.pendingInstantHits = [];
  host.combatFx.clear();
  host.damageNumbers.clear();
  host.pendingPopups.length = 0;
  host.objectiveMarker?.destroy();
  host.objectiveMarker = null;
  host.objectiveMarkerTeam = undefined;
  host.gameMode = null;
  host.objectiveZone = null;
  host.teamScores = createTeamRecord(() => 0);
  host.killFeed = [];
  host.killFeedSeq = 0;
  host.matchElapsed = 0;
  host.simAccumulator = 0;
  host.inputBuffer.clear();
  host.matchOver = false;
  host.winner = null;
  host.countdown = 0;
  host.countdownGo = 0;
  host.countdownShown = null;

  host.pickups?.clearViewLayers();

  for (const fog of host.fogViews) fog.destroy();
  host.fogViews = [];
  // Las vistas comparten esta malla. Al destruir sus instancias, PlayCanvas
  // libera la malla cuando se queda sin referencias, así que no se puede
  // conservar para la revancha: se recrea al empezar la siguiente partida.
  host.fogMesh?.destroy();
  host.fogMesh = null;
  for (const mask of host.fogMasks.values()) mask.destroy();
  host.fogMasks.clear();
  host.visionView.clear();
  host.visibleByTeam = createTeamRecord(() => new Set<number>());
  host.visibleByTeamScratch = createTeamRecord(() => new Set<number>());
  host.simulationStep = 0;
  host.pickupKnowledge = createPickupKnowledge();

  for (const markers of host.deathMarkers.values()) {
    for (const marker of markers) marker?.destroy();
  }
  host.deathMarkers.clear();

  for (const sky of host.viewSkies.values()) sky.destroy();
  host.viewSkies.clear();
  for (const layer of host.viewSkyLayers) host.app.scene.layers.remove(layer);
  host.viewSkyLayers.length = 0;

  for (const player of host.matchPlayers) {
    const view = host.playerViews.get(player);
    if (view) {
      for (const copy of view.copies) copy.destroy();
      view.bar.dispose();
      view.camera.dispose();
    }
  }
  // Los lotes de sombras son de la vista, no de la copia: se destruyen una vez
  // liberadas todas las ranuras de sus actores.
  for (const view of host.playerViews.values()) view.shadowBatch?.destroy();
  host.playerViews.clear();
  for (const layer of host.viewLayers) host.app.scene.layers.remove(layer);
  host.matchPlayers = [];
  host.playerBySlot.clear();
  host.views = [];
  host.bots.clear();
  host.botNav = null;
  host.viewLayers = [];
  host.prewarmTasks = [];
  host.prewarmIndex = 0;
  host.healthBars.clear();
}

/** Empieza una partida con los jugadores ya elegidos en React. */
export function startMatch(
  host: MatchSessionHost,
  configs: MatchPlayerConfig[]
): boolean {
  if (!host.ready || configs.length === 0) return false;

  // Nunca se descarta a un jugador en silencio: un sprite que no llegó a
  // cargarse dejaría la partida en 1v0 y el HUD repartiría los paneles con
  // otro número de jugadores. Mejor abortar y avisar para volver al roster.
  const missing = configs.filter(
    (config) => !host.assetFor(config.pokemonId, config.skinId)
  );
  if (missing.length > 0) {
    const ids = [
      ...new Set(
        missing.map(
          (config) =>
            `${config.pokemonId}${
              config.skinId && config.skinId !== DEFAULT_SKIN_ID
                ? ` (${config.skinId})`
                : ''
            }`
        )
      )
    ];
    host.callbacks.onError(
      `No se pudo cargar el sprite de ${ids.join(', ')}. Vuelve al roster e inténtalo de nuevo.`
    );
    return false;
  }

  clearMatch(host);
  host.pickups?.reset();

  // El lobby ya limita el número de jugadores; se recorta por seguridad.
  const valid = configs.slice(0, MAX_PLAYERS);
  if (valid.length === 0) return false;

  // Una partida necesita al menos una vista humana. Los bots completan los
  // equipos, pero no sustituyen al jugador local.
  const humanConfigs = valid.filter((config) => !config.isBot);
  if (humanConfigs.length === 0) {
    host.callbacks.onError('Añade al menos un jugador humano antes de empezar.');
    return false;
  }

  host.mode = 'match';
  host.paused = false;
  const objectives = host.resolveObjectiveZones();
  host.objectiveZone = objectives[0] ?? {
    x: 0,
    z: 0,
    radius: KOTH_DEFAULT_RADIUS
  };
  host.gameMode = createGameMode({
    modeId: host.gameModeId,
    settings: host.modeSettings,
    objective: host.objectiveZone,
    objectives
  });
  // El clima se sortea una vez por partida y se mantiene hasta el final.
  // Si el lobby desactiva los cambios atmosféricos, siempre se juega en
  // despejado y no se aplica ningún efecto de combate.
  host.setAtmosphere(host.atmosphereEnabled ? rollAtmosphere() : 'clear');
  // Solo las habilidades del roster, los instintos comunes y los impactos.
  // La cuenta atrás da margen a que terminen de decodificar.
  prepareMatchAudio(valid);
  startMatchMusic();
  host.statsTimer = 0;
  host.fps = 0;
  host.countdown = MATCH_COUNTDOWN_SECONDS;
  host.countdownGo = 0;
  host.countdownShown = MATCH_COUNTDOWN_SECONDS;
  host.callbacks.onCountdown(MATCH_COUNTDOWN_SECONDS);
  host.menuCamera.setEnabled(false);
  host.setResolutionBaseline(
    matchPixelRatio(window.devicePixelRatio || 1, humanConfigs.length)
  );

  const layout = computeSplitLayout(humanConfigs.length);
  // Tamaño real de cada viewport: decide el grosor del contorno y si la
  // silueta de oclusión compensa. Ambas cosas se resuelven una vez por partida.
  const viewportPx = viewportHeightPx(
    window.innerHeight,
    window.devicePixelRatio || 1,
    humanConfigs.length
  );
  const smallViewport = isSmallViewport(viewportPx);
  const hasBots = valid.some((config) => config.isBot);
  const botNav = hasBots ? new BotNavGrid(host.world.colliders) : null;
  const botSquad = hasBots ? createBotSquad() : null;
  host.botNav = botNav;
  const teamIndex: Record<Team, number> = createTeamRecord(() => 0);
  let viewIndex = 0;

  valid.forEach((config) => {
    const asset = host.assetFor(config.pokemonId, config.skinId);
    if (!asset) return;

    const isBot = config.isBot === true;
    const currentView = isBot ? -1 : viewIndex++;
    const indexInTeam = teamIndex[config.team];
    const spawn = spawnForTeam(config.team, indexInTeam);
    teamIndex[config.team] += 1;
    // El punto de aparición se resuelve también aquí, no solo al reaparecer:
    // si un collider o el agua profunda invaden la base, la primera copia y
    // la cámara deben nacer ya en una posición válida.
    const resolvedSpawn = host.resolvePosition(
      { types: asset.entry.types, team: config.team },
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
    let skyLayer: pc.Layer | null = null;
    let shadowBatch: ActorShadowBatch | null = null;
    if (!isBot) {
      const layerComposition = host.app.scene.layers;
      layer = new pc.Layer({ name: `match-view-${currentView + 1}` });
      skyLayer = new pc.Layer({ name: `match-sky-${currentView + 1}` });
      // El cielo va primero: al no escribir profundidad, el mundo lo tapa sin
      // necesidad de ordenar por distancia.
      layerComposition.insertOpaque(skyLayer, 0);
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
      host.viewLayers.push(layer);
      host.viewSkyLayers.push(skyLayer);
      // Todas las sombras de esta vista comparten un draw call.
      shadowBatch = new ActorShadowBatch(
        host.app,
        host.world.shadowMaterial,
        layer.id,
        MAX_PLAYERS
      );
    }

    const camera = new CameraRig(host.app, spawnPoint);
    if (layer && skyLayer) {
      const skyboxId = host.app.scene.layers.getLayerByName('Skybox')?.id;
      const viewBaseLayers = host.baseCameraLayers.filter(
        (id) => id !== skyboxId
      );
      camera.setViewport(layout[currentView]);
      camera.setLayers([...viewBaseLayers, layer.id, skyLayer.id]);
      camera.setEnabled(true);
      host.viewSkies.set(
        camera,
        host.createViewSky(skyLayer.id, currentView, camera)
      );
    } else {
      // Los bots conservan una cámara deshabilitada porque `stepPlayer` usa
      // su yaw para convertir la entrada en movimiento relativo.
      camera.setEnabled(false);
    }
    camera.yaw = cameraYawForTeam(config.team, spawnPoint.x, spawnPoint.z);
    camera.distance =
      CONFIG.camera.distance *
      (humanConfigs.length > 2 ? CONFIG.camera.splitDistanceScale : 1);

    // Una sola barra por jugador: el estado es idéntico en todas las vistas,
    // así que no se duplican canvas, texturas ni redibujados por copia.
    const bar = new HealthBarArt(
      healthBarLayoutFor(actorSpriteHeight(asset)),
      TEAM_INFO[config.team].accent
    );

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
      cameraYaw: camera.yaw,
      vx: 0,
      vz: 0,
      submerge: 0,
      animation: 'idle',
      playback: 1,
      hidden: false,
      terrain,
      terrainMultiplier: spawnTerrainEffect.multiplier,
      terrainSpeedReason: spawnTerrainEffect.reason,
      visionRange: visionForPokemon(config.pokemonId),
      visionFactor: isBot ? botVisionFactor(config.botDifficulty ?? 'normal') : 1,
      concealment: terrainConcealment(terrain, asset.entry.types),
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
      cooldownTotals: [0, 0, 0, 0, 0],
      repeatAbilityId: null,
      repeatAbilityCount: 0,
      repeatAbilityAt: 0,
      buffs: [],
      slowEffects: [],
      slowMultiplier: 1,
      abilityIds: [...moveset, commonAbilityId]
    };
    host.matchPlayers.push(player);
    host.playerBySlot.set(player.slot, player);
    host.playerViews.set(
      player,
      createPlayerView(
        camera,
        bar,
        layer ? layout[currentView] : { x: 0, y: 0, w: 1, h: 1 },
        shadowBatch
      )
    );

    if (isBot) {
      if (botNav && botSquad) {
        host.bots.set(
          config.slot,
          new BotController(
            config.slot,
            config.botDifficulty ?? 'normal',
            botNav,
            botSquad,
            // Los bots conocen las posiciones de los objetos, pero no su
            // estado disponible/usado. Solo reciben los que superaron la
            // validación de posición del mapa.
            host.pickupSpawns
          )
        );
      }
    } else {
      host.views.push(player);
    }

    if (layer) {
      const mask = host.ensureFogMask(config.team);
      host.fogViews.push(
        new FogView(
          host.app.graphicsDevice,
          host.ensureFogMesh(),
          camera.entity,
          layer.id,
          currentView,
          mask.texture
        )
      );
    }
  });

  // Cada actor tiene una copia por vista (no por jugador): los bots se ven
  // en las pantallas humanas, pero no generan una vista propia.
  host.matchPlayers.forEach((player) => {
    const asset = host.assetFor(player.pokemonId, player.skinId);
    if (!asset) return;
    // El grosor del contorno depende del aspecto, no del viewport.
    const outlineWidth = spriteOutlineWidth(asset, viewportPx);
    host.views.forEach((viewer, viewIndex) => {
      const viewerView = host.viewOf(viewer);
      const copy = new Actor({
        app: host.app,
        asset,
        position: { x: player.x, z: player.z },
        facing: player.facing,
        // La sombra se dibuja en el lote del viewport: una instancia para todos.
        shadow: viewerView.shadowBatch?.allocate() ?? null,
        // Solo la copia del dueño lleva anillo de rumbo. Antes lo llevaban
        // todas (también los rivales), lo que añadía un draw call y una
        // textura por copia sin aportar información nueva.
        withMarker: viewer.slot === player.slot,
        // La silueta de oclusión solo la lleva el dueño y solo cuando el
        // viewport es lo bastante grande para que el detalle compense.
        silhouette: viewer.slot === player.slot && !smallViewport,
        accent: TEAM_INFO[player.team].accent,
        // Solo el Pokémon que controla este viewport va sin contorno.
        withOutline: viewer.slot !== player.slot,
        outlineWidth,
        hitRadius: player.hitRadius,
        // Las capas de animación se crean por tandas durante la cuenta atrás.
        deferLayers: true
      });
      const layer = host.viewLayers[viewIndex];
      if (layer) copy.setLayer(layer.id);
      copy.play('idle');
      host.viewOf(player).copies.push(copy);
    });
  });

  // Calienta primero el idle de todas las copias y después los clips
  // secundarios: así los cuerpos aparecen durante la cuenta atrás y los
  // materiales de ataque no provocan un tirón en el primer casteo.
  host.prewarmTasks = [];
  for (const animation of BILLBOARD_ANIMATION_ORDER) {
    for (const player of host.matchPlayers) {
      for (const copy of host.viewOf(player).copies) {
        host.prewarmTasks.push({ actor: copy, animation });
      }
    }
  }
  host.prewarmIndex = 0;

  // Cada vista humana ya ha creado la máscara de niebla de su equipo en el
  // bucle anterior. La visibilidad de actores y objetos no usa la máscara, así
  // que un equipo sin vistas humanas no necesita ninguna.

  // Copias de los objetos por viewport: cada una vive en la capa de su vista
  // y se muestra únicamente cuando el equipo de esa vista ve el objeto.
  host.pickups?.setViewLayers(host.viewLayers.map((layer) => layer.id));
  host.updateViewFarClip();

  // Con sombras del sol activas, el encuadre depende de la cámara: se
  // rehornean al empezar para cubrir las bases de ambos equipos.
  host.refreshSunShadows();

  // Deja una primera foto de visibilidad para la cuenta atrás y para el
  // primer paso de simulación, antes de que exista ningún render.
  host.refreshCombatVisibility();

  host.spawnObjectiveMarker();
  host.callbacks.onMatchStats([]);
  return true;
}
