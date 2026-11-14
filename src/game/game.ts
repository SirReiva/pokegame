import * as pc from 'playcanvas';
import {
  ABILITIES,
  COMMON_ABILITIES,
  MOVESETS,
  abilityTotalTime,
  commonAnimationFor,
  type AbilityDef,
  type BuffStat,
  type SlowSpec
} from './abilities';
import {
  ABILITY_EXECUTORS,
  type AbilityExecutorDeps
} from './abilityExecutors';
import { assistAimDirection, type AimAssistTarget } from './aimAssist';
import { isAimAssistEnabled } from './aimAssistSettings';
import type { AoeFallenAlly } from './aoeEffect';
import { Actor } from './actor';
import {
  clearMatch as clearMatchSession,
  endMatch as endMatchSession,
  hexToRgb,
  startMatch as startMatchSession,
  type MatchSessionHost,
  type PendingPopup
} from './app/matchSession';
import { applyMap as applyMapRuntime, type MapRuntimeHost } from './app/mapRuntime';
import { createGameApp } from './appBootstrap';
import { CastDebugOverlay } from './castDebug';
import { buildCastPlan } from './castPlan';
import {
  configureAudio,
  disposeAudio,
  pauseMatchMusic,
  playAbilityCast,
  playAbilityImpact,
  playArmorBlock,
  resumeMatchMusic,
  stopMatchMusic
} from './audio';
import {
  BotController,
  type BotWorldView
} from './bot';
import { BotNavGrid } from './botNav';
import { CameraRig } from './camera';
import {
  atmosphereFogFar,
  atmosphereState,
  atmosphereVisionMultiplier,
  type AtmosphereId,
  type AtmosphereState
} from './atmosphere';
import {
  closestPointOnCollider,
  closestPointOnSegment,
  pointSegmentDistance,
  raycastColliderDistance,
  segmentBlockedByColliders
} from './combat';
import { CombatFx } from './combatFx';
import type { TelegraphHandle, TelegraphOwner } from './core/ports/fx';
import { CONFIG } from './config';
import { DamageNumbers, type DamageNumberView } from './damageNumbers';
import { DeathMarker } from './deathMarker';
import { CAST_EFFECTS } from './effects';
import { FogMask, FogView, createFogMesh, type SightOccluder } from './fog';
import { DynamicResolution } from './render/dynamicResolution';
import { buildMatchStats } from './render/matchStats';
import { VisionView } from './render/visionView';
import {
  stepActiveAoes,
  stepPendingAoeEnds,
  type PendingAoeEnd
} from './sim/aoes';
import {
  applyCastPresentation,
  armHitFrame,
  stepActiveCast as stepActiveCastSystem
} from './sim/cast';
import {
  createRuntimeHosts,
  type RuntimeHosts,
  type RuntimeState
} from './app/runtimeHosts';
import {
  emitAoeEvent as emitAoeEventSystem,
  resolveAoeHit as resolveAoeHitSystem
} from './sim/aoeResolution';
import { stepAtmosphere } from './sim/atmosphere';
import { applyAbilityDamage as applyAbilityDamageSystem } from './sim/damage';
import { stepDash as stepDashSystem } from './sim/dash';
import { knockOut as knockOutSystem } from './sim/knockout';
import { stepInstantHits, stepMeleeHits } from './sim/hits';
import { stepPlayer as stepPlayerSystem } from './sim/player';
import { stepProjectiles } from './sim/projectiles';
import {
  observerSeesActor,
  refreshCombatVisibility as refreshVisibility,
  teamSeesPickupPoint,
  teamSeesPoint
} from './sim/visibility';
import {
  breakRegen,
  stepParticipation,
  stepRegeneration
} from './sim/status';
import { syncMatchView } from './render/matchView';
import { updatePlayerCamera } from './render/playerCamera';
import type { PlayerView } from './render/playerView';
import { buildBotHazards } from './ai/hazards';
import { HealthBarOverlay } from './healthBarOverlay';
import {
  IDLE_INPUT,
  Input,
  type DeviceInputSnapshot,
  type InputDeviceInfo,
  type InputFrame,
  type MenuAction
} from './input';
import { HumanInputBuffer } from './inputBuffer';
import type { PickupSpawn } from './items';
import { loadMap, loadMapIndex, type MapIndexEntry } from './map';
import type {
  ActiveAoe,
  ActiveCast,
  HealOnHitToken,
  MatchPlayerState,
  PendingInstantHit,
  PendingMeleeHit,
  Projectile,
  QueuedCast,
  SlowEffect
} from './matchState';
import {
  DEFAULT_TIME_LIMIT_SECONDS,
  normalizeModeSettings,
  type GameModeId,
  type GameModeRuntime,
  type MatchOutcome,
  type ModeContext,
  type ModeSettings,
  type ModeXpAward,
  type ObjectiveZone
} from './modes';
import {
  PickupField,
  disposeItemTextures,
  loadItemTextures,
  type ItemTextureMap,
  type PickupHandlers
} from './pickups';
import {
  TEAM_INFO,
  createTeamRecord,
  facingToCenter,
  type MatchEndResult,
  type MatchPlayerConfig,
  type KillFeedEntry,
  type PlayerMatchStats
} from './multiplayer';
import { maxHitRadius } from './roster';
import { rumbleOnDamage } from './rumble';
import {
  disposeSpriteAsset,
  loadSpriteAsset,
  resolveAnimationClip,
  type SpriteAsset
} from './sprite';
import { detectSpriteBudget } from './spriteBudget';
import { clearGroundCanvasCache } from './textures';
import {
  XP_REWARDS,
  XP_RULES,
  xpStatus,
  type XpSource
} from './xp';
import {
  ACTIVE_TEAMS,
  getActiveMap,
  resolveDeepWater,
  resolveTeamTerrain,
  terrainAt,
  type Team
} from './terrain';
import { terrainSpeedEffect } from './terrainSpeed';
import { DEFAULT_SKIN_ID, skinFor } from './skins';
import type { AnimationName, LoadingProgress, SpriteManifest } from './types';
import { terrainConcealment } from './vision';
import type { Collider, World } from './world';

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
  /** Clima de la partida; `null` al volver al menú o terminar. */
  onAtmosphere(state: AtmosphereState | null): void;
}

/** Combinación especie + aspecto que hay que cargar para una partida. */
export interface PokemonSkinSelection {
  pokemonId: string;
  skinId: string;
}

export interface GameOptions {
  /** Mapa que se carga al montar `/play`. */
  mapId?: string;
  /** Manifiesto ya descargado por la sesión, para no pedirlo dos veces. */
  manifest?: SpriteManifest;
  /**
   * Especies que jugarán la partida. Solo se cargan sus hojas de sprite: el
   * resto del manifiesto se queda como datos ligeros para el roster y el HUD.
   * Si no se indica, se cargan todas (comportamiento anterior).
   */
  pokemonIds?: readonly string[];
  /**
   * Aspectos concretos que usa cada jugador. Si se indica, sustituye a la
   * carga por especie: dos jugadores pueden compartir Pokémon con skins
   * distintas y cada combinación se descarga una sola vez.
   */
  pokemonSkins?: readonly PokemonSkinSelection[];
  /** KOs de equipo para el deathmatch; se conserva como atajo compatible. */
  koTarget?: number;
  /** Modo de juego activo; por defecto, deathmatch por equipos. */
  modeId?: GameModeId;
  /** Ajustes específicos del modo elegido en el lobby. */
  modeSettings?: Readonly<ModeSettings>;
  /** Tiempo máximo de partida en segundos; `0` desactiva el límite. */
  timeLimitSeconds?: number;
  /**
   * Si es `true`, cada partida sortea un clima; si es `false` o falta, todas
   * las partidas se juegan en despejado.
   */
  atmosphereEnabled?: boolean;
  /**
   * Canvas 2D para las barras de vida. Lo aporta la pantalla de juego para
   * quedar encima del canvas WebGL y debajo del HUD.
   */
  overlayCanvas?: HTMLCanvasElement | null;
}

/** Clave del caché de sprites: la especie y el aspecto son independientes. */
function assetKey(pokemonId: string, skinId?: string): string {
  return `${pokemonId}\u0000${skinId ?? DEFAULT_SKIN_ID}`;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Tipos vacíos: la ocultación de un punto usa solo el terreno, sin especie. */
const NO_TYPES: readonly string[] = [];

/** Segundos que cada KO permanece en el feed antes de desaparecer. */
const KILL_FEED_TTL_SECONDS = 6;
/** Tope de entradas del feed; al llenarse se descarta la más antigua. */
const KILL_FEED_MAX_ENTRIES = 4;
/** Tiempo que se mantiene el cartel de salida después de la cuenta atrás. */
const MATCH_COUNTDOWN_GO_SECONDS = 0.8;
/**
 * Frecuencia de las estadísticas periódicas del HUD. Los eventos discretos
 * (daño, KO, reaparición) siguen emitiendo al momento; este temporizador solo
 * refresca timers y cooldowns, que se pintan con precisión de 0,1 s.
 */
const MATCH_STATS_INTERVAL_SECONDS = 0.5;
/** Altura del decal de KO sobre el suelo. */
const DEATH_MARKER_GROUND_Y = 0.06;
/** Separación de la marca sobre la superficie cuando el KO ocurre en el agua. */
const DEATH_MARKER_WATER_LIFT = 0.02;
/** Color neutro de la zona de control cuando no la domina ningún equipo. */
const OBJECTIVE_NEUTRAL_COLOR: readonly [number, number, number] = [150, 158, 170];

/**
 * Paso fijo de la simulación autoritativa: 60 Hz, el mismo tick que los
 * sprites. El render puede ir a otra frecuencia; la presentación se actualiza
 * una vez por render con su `dt` real.
 */
const FIXED_STEP = 1 / 60;
/**
 * Tope de pasos por render. Recuperar todo el tiempo perdido en un solo render
 * encadenaba simulaciones y el siguiente render llegaba aún más tarde: con 4 el
 * acumulador entraba en espiral. Dos pasos cubren caídas hasta 30 fps; por
 * debajo se pierde tiempo de simulación a cambio de no bloquear el frame.
 */
const MAX_FIXED_STEPS = 2;

/**
 * Presupuesto por render para crear números de daño. Componer un número cuesta
 * poco, pero varios impactos en el mismo frame se notaban en el p99. Los que no
 * caben salen en el render siguiente, no se pierden.
 */
const POPUP_RENDER_BUDGET_MS = 2;
/** Cola máxima de números pendientes; si se desborda se descarta el más viejo. */
const MAX_PENDING_POPUPS = 24;

/**
 * Área instantánea cuyo `onEnd` se retrasa hasta agotar su duración visual.
 * Las áreas `overTime` no lo necesitan: su final coincide con su retirada.
 */
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
  private readonly app: pc.AppBase;
  private readonly input: Input;

  /**
   * El mundo y la cámara de menú se crean en `init`, después de cargar el JSON
   * del mapa, y se reconstruyen al cambiar de mapa.
   */
  private world!: World;
  private menuCamera!: CameraRig;
  /** Punto al que orbita la cámara de menú (el `spawn` del mundo visible). */
  private menuFocus = { x: 0, z: 0 };
  private mapIndex: MapIndexEntry[] = [];
  private activeMapId = '';
  /**
   * Identificador de la carga de mapa en curso. Si el jugador cambia de mapa
   * mientras se pinta el anterior, el resultado viejo se descarta.
   */
  private mapLoadToken = 0;
  /** Último porcentaje de carga emitido, en una escala única de 0 a 100. */
  private loadPercent = 0;
  private loadLabel = '';
  /** Clima de la partida; se sortea en `startMatch`. */
  private atmosphere: AtmosphereId = 'clear';
  /** Factor de visión del clima, cacheado para no recalcularlo por observador. */
  private atmosphereVision = 1;
  /** Acumulador del daño residual (arena, granizo). */
  private atmosphereTick = 0;

  private readonly baseCameraLayers: number[];
  /** Capa del mundo: respaldo de los FX fuera de partida. */
  private readonly worldLayerId: number;

  private manifest: SpriteManifest | null = null;
  /** Caché por `especie + aspecto`; ver `assetKey`. */
  private readonly assets = new Map<string, SpriteAsset>();

  /** Sprite del aspecto elegido por un jugador (o el normal si no hay). */
  private assetFor(
    pokemonId: string,
    skinId?: string
  ): SpriteAsset | undefined {
    return this.assets.get(assetKey(pokemonId, skinId));
  }
  /** Texturas de los objetos recogibles, cargadas una vez por partida. */
  private readonly itemTextures: ItemTextureMap = new Map();
  /** Objetos del mapa activo; se reconstruyen al cambiar de mapa. */
  private pickups: PickupField | null = null;
  /** Objetos que superaron la validación de posición y se ofrecen a los bots. */
  private pickupSpawns: readonly PickupSpawn[] = [];
  private readonly pickupHandlers: PickupHandlers = {
    pokemonFor: (player) =>
      this.assetFor(player.pokemonId, player.skinId)?.entry ?? null,
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
    showHeal: (player, amount) => this.showHealPopup(player, amount, player),
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
      // consume. La visibilidad se resuelve con la misma geometría que los
      // actores (círculos de visión y línea de visión), sin leer la máscara.
      return teamSeesPoint(
        this.matchPlayers,
        player.team,
        spawn.x,
        spawn.z,
        0,
        colliders,
        this.atmosphereVision
      );
    }
  };

  private matchPlayers: MatchPlayerState[] = [];
  /**
   * Vistas locales (cámaras/paneles). Los bots juegan en `matchPlayers` pero no
   * consumen una vista: así un humano contra tres bots no parte la pantalla en
   * cuatro ni renderiza el mundo cuatro veces.
   */
  private views: MatchPlayerState[] = [];
  /**
   * Tareas de calentamiento de los billboards, ordenadas por animación para que
   * todos los cuerpos aparezcan antes de crear los clips secundarios.
   */
  private prewarmTasks: Array<{ actor: Actor; animation: AnimationName }> = [];
  private prewarmIndex = 0;
  /** Reutilizada cada frame para las consultas por cámara de los objetos. */
  private readonly viewCameraPositions: pc.Vec3[] = [];
  /** Diagnóstico (Ctrl+Alt+…): oculta capas para localizar artefactos. */
  private debugHideActors = false;
  private debugHideBars = false;
  /** Números de daño que aún no se han dibujado (ver `flushPendingPopups`). */
  private pendingPopups: PendingPopup[] = [];
  private bots = new Map<number, BotController>();
  /** Rejilla compartida por los bots; también gestiona su presupuesto por frame. */
  private botNav: BotNavGrid | null = null;
  private viewLayers: pc.Layer[] = [];
  /** Barras de vida en una capa 2D, compartidas por todos los viewports. */
  private readonly healthBars: HealthBarOverlay;
  /** Escala de resolución interna según el FPS (no afecta a la simulación). */
  private readonly dynamicResolution: DynamicResolution;
  /** Cielo propio de cada vista, pegado a su cámara para el recorte lejano. */
  private readonly viewSkyLayers: pc.Layer[] = [];
  private readonly viewSkies = new Map<CameraRig, pc.Entity>();
  /** Marca de KO en el suelo, una copia por vista. Solo la ve su equipo. */
  private deathMarkers = new Map<number, Array<DeathMarker | null>>();
  /**
   * Jugadores por slot. El bucle de marcas de KO y otras consultas puntuales lo
   * usan para no recorrer `matchPlayers` con un `find` por marca y por vista.
   */
  private readonly playerBySlot = new Map<number, MatchPlayerState>();
  /**
   * Sidecar de presentación por jugador. La simulación nunca lee estos datos;
   * solo `MatchView` los sincroniza con cámaras, copias y barras.
   */
  private readonly playerViews = new Map<MatchPlayerState, PlayerView>();
  private viewOf(player: MatchPlayerState): PlayerView {
    const view = this.playerViews.get(player);
    if (!view) {
      throw new Error(`No hay vista de render para la plaza ${player.slot}`);
    }
    return view;
  }
  /** Proyectiles activos de todas las vistas. */
  private projectiles: Projectile[] = [];
  /** Áreas persistentes con daño periódico. */
  private activeAoes: ActiveAoe[] = [];
  /** `onEnd` pendientes de áreas instantáneas. */
  private pendingAoeEnds: PendingAoeEnd[] = [];
  /** Golpes melee del frame actual, resueltos después de mover a todos. */
  private pendingMeleeHits: PendingMeleeHit[] = [];
  /** Habilidades instantáneas que esperan al final del frame para ejecutarse. */
  private queuedCasts: QueuedCast[] = [];
  /** Golpes de dash detectados al moverse, resueltos con el resto del frame. */
  private pendingInstantHits: PendingInstantHit[] = [];
  /** Marcador de la partida; gana el primero que lleve al objetivo del modo. */
  private teamScores: Record<Team, number> = createTeamRecord(() => 0);
  /** Modo elegido en el lobby. */
  private readonly gameModeId: GameModeId;
  /** Ajustes validados del modo. */
  private readonly modeSettings: ModeSettings;
  /** Tiempo máximo de partida; `0` desactiva el cierre por tiempo. */
  private readonly timeLimitSeconds: number;
  /** Runtime del modo activo: decide victoria, HUD y objetivo de bots. */
  private gameMode: GameModeRuntime | null = null;
  /** Zona que disputan los modos de control, resuelta al empezar la partida. */
  private objectiveZone: ObjectiveZone | null = null;
  /** Aro de la zona de control; solo existe durante una partida de KOTH. */
  private objectiveMarker: TelegraphHandle | null = null;
  /** Último equipo dueño del aro, para recolorearlo solo cuando cambia. */
  private objectiveMarkerTeam: Team | null | undefined = undefined;
  /** El lobby decide si cada partida sortea clima o se juega en despejado. */
  private readonly atmosphereEnabled: boolean;
  /** Últimos KOs globales; cada vista pinta su propio feed con esta lista. */
  private killFeed: KillFeedEntry[] = [];
  private killFeedSeq = 0;
  /** Tiempo de simulación de la partida, usado para caducar el feed. */
  private matchElapsed = 0;
  private matchOver = false;
  private winner: Team | null = null;
  private readonly combatFx: CombatFx;
  /** Adaptador entre el ciclo de partida y el estado de `Game`. */
  private readonly matchSessionHost: MatchSessionHost;
  /** Adaptador entre el ciclo del mapa y el estado de `Game`. */
  private readonly mapRuntimeHost: MapRuntimeHost;
  /** Estado mutable compartido por los hosts de los sistemas. */
  private readonly runtimeState: RuntimeState;
  /** Hosts de simulación/render, construidos una sola vez. */
  private readonly hosts: RuntimeHosts;
  /** Niebla y copias por vista. */
  private readonly visionView = new VisionView();
  private readonly damageNumbers: DamageNumbers;
  /** Overlay opcional con las fases de casteo. */
  private readonly castDebug: CastDebugOverlay | null = null;
  /** Quads de niebla, uno por vista. */
  private fogViews: FogView[] = [];
  /** Malla compartida por todas las vistas; se crea en la primera partida. */
  private fogMesh: pc.Mesh | null = null;
  /**
   * Máscara de visibilidad world-space por equipo. Es independiente de la
   * cámara, así que todas las vistas del mismo equipo comparten la suya. La
   * misma textura la muestrea el quad de niebla de cada vista.
   */
  private readonly fogMasks = new Map<Team, FogMask>();
  /** Tramos de cordillera y árboles que proyectan sombra dentro de la niebla. */
  private sightOccluders: SightOccluder[] = [];
  /**
   * Slots visibles para cada equipo en el paso de simulación anterior. La
   * visión es compartida, así que la histéresis también se guarda por equipo.
   */
  private visibleByTeam: Record<Team, Set<number>> = createTeamRecord(
    () => new Set<number>()
  );
  /** Segundo juego de conjuntos para alternar sin asignar cada frame. */
  private visibleByTeamScratch: Record<Team, Set<number>> = createTeamRecord(
    () => new Set<number>()
  );
  /**
   * Paso de simulación actual. La visibilidad de combate se resuelve una vez
   * por paso, no una vez por render: así el segundo paso fijo de un render no
   * reutiliza la visibilidad del render anterior.
   */
  private simulationStep = 0;
  /**
   * Memo de capas de FX dentro del frame actual. Varios efectos de una misma
   * habilidad comparten anclas; sin esta caché cada uno repetía la prueba de
   * visión del equipo. Se vacía al empezar cada frame.
   */
  private readonly fxVisibilityCache = new Map<string, number[]>();
  /**
   * Objetos que cada equipo ve y si están disponibles. Solo contiene puntos
   * visibles: los bots no pueden consultar el estado del resto.
   */
  private pickupKnowledge: Record<Team, Map<string, boolean>> = createTeamRecord(
    () => new Map<string, boolean>()
  );
  /** Mapas reutilizados para no reconstruir el conocimiento de objetos. */
  private pickupKnowledgeScratch: Record<Team, Map<string, boolean>> =
    createTeamRecord(() => new Map<string, boolean>());
  private readonly pickupSeenScratch = new Map<string, boolean>();

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
  /** Resto de tiempo real pendiente de simular (acumulador de paso fijo). */
  private simAccumulator = 0;
  /** Entradas de flanco acumuladas hasta el próximo paso de simulación. */
  private readonly inputBuffer = new HumanInputBuffer();

  /**
   * Crea el dispositivo gráfico y construye el juego.
   *
   * `createGraphicsDevice` es asíncrono, así que la instancia se obtiene con
   * esta factoría en vez de con `new Game(...)`.
   */
  static async create(
    canvas: HTMLCanvasElement,
    callbacks: GameCallbacks,
    options: GameOptions = {}
  ): Promise<Game> {
    const app = await createGameApp(canvas);
    return new Game(canvas, app, callbacks, options);
  }

  private constructor(
    canvas: HTMLCanvasElement,
    app: pc.AppBase,
    callbacks: GameCallbacks,
    options: GameOptions = {}
  ) {
    this.callbacks = callbacks;
    this.options = options;
    this.gameModeId = options.modeId ?? 'tdm';
    const inputSettings =
      options.modeSettings ??
      (options.koTarget !== undefined ? { koTarget: options.koTarget } : {});
    this.modeSettings = normalizeModeSettings(this.gameModeId, inputSettings);
    this.timeLimitSeconds = Math.max(
      0,
      Math.floor(options.timeLimitSeconds ?? DEFAULT_TIME_LIMIT_SECONDS)
    );
    this.atmosphereEnabled = options.atmosphereEnabled === true;

    this.app = app;
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.dynamicResolution = new DynamicResolution(app);
    this.setResolutionBaseline(Math.min(window.devicePixelRatio || 1, 1.75));

    this.input = new Input(canvas);
    this.healthBars = new HealthBarOverlay(options.overlayCanvas ?? null);

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
      (x, z, ignoreTerrainConcealment, owner) =>
        this.fxLayersAt(x, z, ignoreTerrainConcealment, owner)
    );
    this.damageNumbers = new DamageNumbers(this.app);
    const self = this;
    this.runtimeState = {
      get projectiles() {
        return self.projectiles;
      },
      get matchPlayers() {
        return self.matchPlayers;
      },
      get world() {
        return self.world;
      },
      get activeAoes() {
        return self.activeAoes;
      },
      get pendingAoeEnds() {
        return self.pendingAoeEnds;
      },
      get pendingInstantHits() {
        return self.pendingInstantHits;
      },
      get pendingMeleeHits() {
        return self.pendingMeleeHits;
      },
      get views() {
        return self.views;
      },
      get visibleByTeam() {
        return self.visibleByTeam;
      },
      get fogMasks() {
        return self.fogMasks;
      },
      get fogViews() {
        return self.fogViews;
      },
      get simulationStep() {
        return self.simulationStep;
      },
      get atmosphereVision() {
        return self.atmosphereVision;
      },
      get atmosphere() {
        return self.atmosphere;
      },
      combatFx: this.combatFx,
      isMatchOver: () => self.matchOver,
      canHit: (attacker, target) => self.canHit(attacker, target),
      applyAbilityDamage: (attacker, target, def, options) =>
        applyAbilityDamageSystem(self.hosts.damage, attacker, target, def, options),
      removeProjectile: (projectile) => self.removeProjectile(projectile),
      playImpactSound: (effectiveness = 1) => playAbilityImpact(effectiveness),
      resolveAoeHit: (hit) => resolveAoeHitSystem(self.hosts.aoeResolution, hit),
      emitAoeEvent: (phase, player, def, x, z, dirX, dirZ, elapsed) =>
        emitAoeEventSystem(
          self.hosts.aoeResolution,
          phase,
          player,
          def,
          x,
          z,
          dirX,
          dirZ,
          elapsed
        ),
      takeInstantHits: () => {
        const hits = self.pendingInstantHits;
        self.pendingInstantHits = [];
        return hits;
      },
      takeMeleeHits: () => {
        const hits = self.pendingMeleeHits;
        self.pendingMeleeHits = [];
        return hits;
      },
      dashSweepHits: (target, ax, az, bx, bz, dirX, dirZ, reach) =>
        self.dashSweepHits(target, ax, az, bx, bz, dirX, dirZ, reach),
      applyKnockback: (target, fromX, fromZ, distance) =>
        self.applyKnockback(target, fromX, fromZ, distance),
      cancelCast: (player) => self.cancelCast(player),
      refreshSlowMultiplier: (player) => self.refreshSlowMultiplier(player),
      respawnPlayer: (player) => self.respawnPlayer(player),
      updateCamera: (player, input, dt) => self.updateCamera(player, input, dt),
      stepActiveCast: (player, input, dt) =>
        stepActiveCastSystem(self.hosts.cast, player, input, dt),
      stepDash: (player, input, dt) =>
        stepDashSystem(self.hosts.dash, player, input, dt),
      buffMultiplier: (player, stat) => self.buffMultiplier(player, stat),
      resolvePosition: (player, x, z) => self.resolvePosition(player, x, z),
      castAbility: (player, slotIndex) => self.castAbility(player, slotIndex),
      awardXp: (player, source, amount) => self.awardXp(player, source, amount),
      showHeal: (player, amount) => self.showHealPopup(player, amount, player),
      assetFor: (pokemonId, skinId) => self.assetFor(pokemonId, skinId),
      queueCast: (player, def, targetX, targetZ, marker, dirX, dirZ, cast) =>
        self.queueCast(player, def, targetX, targetZ, marker, dirX, dirZ, cast),
      dashPosition: (player, x, z, dirX, dirZ, distance) =>
        self.dashPosition(player, x, z, dirX, dirZ, distance),
      syncDashCast: (player, duration) => self.syncDashCast(player, duration),
      showDamage: (player, amount) =>
        self.showDamagePopup(player, amount, false, 1, false, null),
      vibrate: (player, amount) => self.vibrateOnDamage(player, amount),
      emitStats: () => self.emitMatchStats(),
      activeCastArmor: (target) => self.activeCastArmor(target),
      spawnArmorFeedback: (target, broke) => self.spawnArmorFeedback(target, broke),
      interruptWithRefund: (target, lethal) => self.interruptWithRefund(target, lethal),
      showImmunePopup: (target, source) => self.showImmunePopup(target, source),
      showDamagePopup: (target, amount, critical, effectiveness, lethal, source) =>
        self.showDamagePopup(target, amount, critical, effectiveness, lethal, source),
      showHealPopup: (target, amount, source) => self.showHealPopup(target, amount, source),
      awardCombatXp: (attacker, target, applied, raw, final) =>
        self.awardCombatXp(attacker, target, applied, raw, final),
      vibrateOnDamage: (target, amount) => self.vibrateOnDamage(target, amount),
      knockOut: (target, killer, abilityName) =>
        knockOutSystem(self.hosts.knockout, target, killer, abilityName),
      clearRepeatCooldown: (player) => self.clearRepeatCooldown(player),
      playDeathCopies: (target, animation) => {
        for (const copy of self.viewOf(target).copies) {
          copy.play(animation, true);
        }
      },
      spawnDeathMarker: (target) => self.spawnDeathMarker(target),
      pushKillFeed: (killer, victim, abilityName) =>
        self.pushKillFeed(killer, victim, abilityName),
      awardKillXp: (killer, victim) => self.awardKillXp(killer, victim),
      handleModeKnockout: (killer, victim) => {
        const result = self.gameMode?.onEvent(self.modeContext(), {
          type: 'knockout',
          killerSlot: killer.slot,
          victimSlot: victim.slot,
          killerTeam: killer.team,
          victimTeam: victim.team
        });
        if (result) {
          self.applyModeXp(result.xp);
          if (result.outcome) self.finishMatch(result.outcome);
        }
      },
      viewOf: (player) => self.viewOf(player),
      refreshCombatVisibility: () => self.refreshCombatVisibility(),
      updatePickupKnowledge: (colliders) => self.updatePickupKnowledge(colliders),
      applySlow: (attacker, target, def, slow, color) =>
        self.applySlow(attacker, target, def, slow, color),
      reviveAoeAlly: (target, fraction, def, caster) =>
        self.reviveAoeAlly(target, fraction, def, caster)
    };
    this.hosts = createRuntimeHosts(this.runtimeState);
    this.matchSessionHost = {
      app: this.app,
      callbacks: this.callbacks,
      get ready() {
        return self.ready;
      },
      get world() {
        return self.world;
      },
      get pickups() {
        return self.pickups;
      },
      get menuCamera() {
        return self.menuCamera;
      },
      get pickupSpawns() {
        return self.pickupSpawns;
      },
      assetFor: (pokemonId, skinId) => self.assetFor(pokemonId, skinId),
      get mode() {
        return self.mode;
      },
      set mode(value) {
        self.mode = value;
      },
      get paused() {
        return self.paused;
      },
      set paused(value) {
        self.paused = value;
      },
      get statsTimer() {
        return self.statsTimer;
      },
      set statsTimer(value) {
        self.statsTimer = value;
      },
      get fps() {
        return self.fps;
      },
      set fps(value) {
        self.fps = value;
      },
      get countdown() {
        return self.countdown;
      },
      set countdown(value) {
        self.countdown = value;
      },
      get countdownGo() {
        return self.countdownGo;
      },
      set countdownGo(value) {
        self.countdownGo = value;
      },
      get countdownShown() {
        return self.countdownShown;
      },
      set countdownShown(value) {
        self.countdownShown = value;
      },
      get matchElapsed() {
        return self.matchElapsed;
      },
      set matchElapsed(value) {
        self.matchElapsed = value;
      },
      get simAccumulator() {
        return self.simAccumulator;
      },
      set simAccumulator(value) {
        self.simAccumulator = value;
      },
      get matchOver() {
        return self.matchOver;
      },
      set matchOver(value) {
        self.matchOver = value;
      },
      get winner() {
        return self.winner;
      },
      set winner(value) {
        self.winner = value;
      },
      gameModeId: this.gameModeId,
      modeSettings: this.modeSettings,
      atmosphereEnabled: this.atmosphereEnabled,
      get gameMode() {
        return self.gameMode;
      },
      set gameMode(value) {
        self.gameMode = value;
      },
      get objectiveZone() {
        return self.objectiveZone;
      },
      set objectiveZone(value) {
        self.objectiveZone = value;
      },
      get objectiveMarker() {
        return self.objectiveMarker;
      },
      set objectiveMarker(value) {
        self.objectiveMarker = value;
      },
      get objectiveMarkerTeam() {
        return self.objectiveMarkerTeam;
      },
      set objectiveMarkerTeam(value) {
        self.objectiveMarkerTeam = value;
      },
      get teamScores() {
        return self.teamScores;
      },
      set teamScores(value) {
        self.teamScores = value;
      },
      get killFeed() {
        return self.killFeed;
      },
      set killFeed(value) {
        self.killFeed = value;
      },
      get killFeedSeq() {
        return self.killFeedSeq;
      },
      set killFeedSeq(value) {
        self.killFeedSeq = value;
      },
      get projectiles() {
        return self.projectiles;
      },
      set projectiles(value) {
        self.projectiles = value;
      },
      get activeAoes() {
        return self.activeAoes;
      },
      set activeAoes(value) {
        self.activeAoes = value;
      },
      get pendingAoeEnds() {
        return self.pendingAoeEnds;
      },
      set pendingAoeEnds(value) {
        self.pendingAoeEnds = value;
      },
      get pendingMeleeHits() {
        return self.pendingMeleeHits;
      },
      set pendingMeleeHits(value) {
        self.pendingMeleeHits = value;
      },
      get queuedCasts() {
        return self.queuedCasts;
      },
      set queuedCasts(value) {
        self.queuedCasts = value;
      },
      get pendingInstantHits() {
        return self.pendingInstantHits;
      },
      set pendingInstantHits(value) {
        self.pendingInstantHits = value;
      },
      get pendingPopups() {
        return self.pendingPopups;
      },
      set pendingPopups(value) {
        self.pendingPopups = value;
      },
      baseCameraLayers: this.baseCameraLayers,
      combatFx: this.combatFx,
      damageNumbers: this.damageNumbers,
      healthBars: this.healthBars,
      inputBuffer: this.inputBuffer,
      visionView: this.visionView,
      get fogViews() {
        return self.fogViews;
      },
      set fogViews(value) {
        self.fogViews = value;
      },
      get fogMesh() {
        return self.fogMesh;
      },
      set fogMesh(value) {
        self.fogMesh = value;
      },
      fogMasks: this.fogMasks,
      deathMarkers: this.deathMarkers,
      viewSkies: this.viewSkies,
      viewSkyLayers: this.viewSkyLayers,
      get viewLayers() {
        return self.viewLayers;
      },
      set viewLayers(value) {
        self.viewLayers = value;
      },
      viewOf: (player) => self.viewOf(player),
      createViewSky: (layerId, index, camera) =>
        self.createViewSky(layerId, index, camera),
      ensureFogMask: (team) => self.ensureFogMask(team),
      ensureFogMesh: () => self.ensureFogMesh(),
      get matchPlayers() {
        return self.matchPlayers;
      },
      set matchPlayers(value) {
        self.matchPlayers = value;
      },
      playerBySlot: this.playerBySlot,
      playerViews: this.playerViews,
      get views() {
        return self.views;
      },
      set views(value) {
        self.views = value;
      },
      bots: this.bots,
      get botNav() {
        return self.botNav;
      },
      set botNav(value) {
        self.botNav = value;
      },
      get prewarmTasks() {
        return self.prewarmTasks;
      },
      set prewarmTasks(value) {
        self.prewarmTasks = value;
      },
      get prewarmIndex() {
        return self.prewarmIndex;
      },
      set prewarmIndex(value) {
        self.prewarmIndex = value;
      },
      get visibleByTeam() {
        return self.visibleByTeam;
      },
      set visibleByTeam(value) {
        self.visibleByTeam = value;
      },
      get visibleByTeamScratch() {
        return self.visibleByTeamScratch;
      },
      set visibleByTeamScratch(value) {
        self.visibleByTeamScratch = value;
      },
      get simulationStep() {
        return self.simulationStep;
      },
      set simulationStep(value) {
        self.simulationStep = value;
      },
      get pickupKnowledge() {
        return self.pickupKnowledge;
      },
      set pickupKnowledge(value) {
        self.pickupKnowledge = value;
      },
      get pickupKnowledgeScratch() {
        return self.pickupKnowledgeScratch;
      },
      set pickupKnowledgeScratch(value) {
        self.pickupKnowledgeScratch = value;
      },
      pickupSeenScratch: this.pickupSeenScratch,
      resolveObjectiveZones: () => self.resolveObjectiveZones(),
      resolvePosition: (player, x, z) => self.resolvePosition(player, x, z),
      updateViewFarClip: () => self.updateViewFarClip(),
      refreshSunShadows: () => self.refreshSunShadows(),
      refreshCombatVisibility: () => self.refreshCombatVisibility(),
      spawnObjectiveMarker: () => self.spawnObjectiveMarker(),
      setAtmosphere: (id) => self.setAtmosphere(id),
      clearAtmosphere: () => self.clearAtmosphere(),
      setResolutionBaseline: (baseline) => self.setResolutionBaseline(baseline)
    };
    this.mapRuntimeHost = {
      app: this.app,
      get disposed() {
        return self.disposed;
      },
      itemTextures: this.itemTextures,
      get mapLoadToken() {
        return self.mapLoadToken;
      },
      set mapLoadToken(value) {
        self.mapLoadToken = value;
      },
      get world() {
        return self.world;
      },
      set world(value) {
        self.world = value;
      },
      get pickups() {
        return self.pickups;
      },
      set pickups(value) {
        self.pickups = value;
      },
      get menuCamera() {
        return self.menuCamera;
      },
      set menuCamera(value) {
        self.menuCamera = value;
      },
      get menuFocus() {
        return self.menuFocus;
      },
      set menuFocus(value) {
        self.menuFocus = value;
      },
      get pickupSpawns() {
        return self.pickupSpawns;
      },
      set pickupSpawns(value) {
        self.pickupSpawns = value;
      },
      get activeMapId() {
        return self.activeMapId;
      },
      set activeMapId(value) {
        self.activeMapId = value;
      },
      get atmosphere() {
        return self.atmosphere;
      },
      set atmosphere(value) {
        self.atmosphere = value;
      },
      get atmosphereVision() {
        return self.atmosphereVision;
      },
      set atmosphereVision(value) {
        self.atmosphereVision = value;
      },
      get atmosphereTick() {
        return self.atmosphereTick;
      },
      set atmosphereTick(value) {
        self.atmosphereTick = value;
      },
      clearMatch: () => self.clearMatch(),
      rebuildSightOccluders: () => self.rebuildSightOccluders(),
      refreshSunShadows: () => self.refreshSunShadows(),
      render: () => self.app.render()
    };
    if (CONFIG.debug.showCastTimings) {
      this.castDebug = new CastDebugOverlay();
    }

    this.app.on('update', this.onUpdate);
    if (import.meta.env.DEV) this.installDebugToggles();
    this.app.start();
  }

  /**
   * Atajos de diagnóstico, **solo en desarrollo**: Ctrl+Alt+1..5 ocultan una
   * capa cada vez para localizar un artefacto visual. Cada pulsación escribe en
   * la consola qué se ha ocultado.
   */
  private installDebugToggles(): void {
    const toggleEntity = (entity: pc.Entity, on: boolean) => {
      entity.enabled = on;
    };
    let vegetation: pc.Entity[] | null = null;
    const layers: Array<{ label: string; set: (on: boolean) => boolean }> = [
      {
        label: 'actores (sprites, sombras y anillos)',
        set: (on) => {
          this.debugHideActors = !on;
          return on;
        }
      },
      {
        label: 'niebla de guerra',
        set: (on) => {
          for (const view of this.fogViews) {
            if (view.entity.enabled !== on) toggleEntity(view.entity, on);
          }
          return on;
        }
      },
      {
        label: 'partículas',
        set: (on) => {
          for (const component of this.app.root.findComponents('particlesystem')) {
            component.enabled = on;
          }
          return on;
        }
      },
      {
        label: 'barras de vida 2D',
        set: (on) => {
          this.debugHideBars = !on;
          if (!on) this.healthBars.clear();
          return on;
        }
      },
      {
        label: 'vegetación instanciada',
        set: (on) => {
          vegetation ??= this.app.root
            .findComponents('render')
            .map((component) => component.entity)
            .filter((entity) =>
              /^(tall-grass|fairy-flowers|paramo-frailejon|paramo-dry-grass|swamp-grass)-/.test(
                entity.name
              )
            );
          for (const entity of vegetation) entity.enabled = on;
          return on;
        }
      }
    ];

    const state = layers.map(() => true);
    window.addEventListener('keydown', (event) => {
      if (!event.ctrlKey || !event.altKey) return;
      const index = Number(event.key) - 1;
      const layer = layers[index];
      if (!layer) return;
      event.preventDefault();
      state[index] = !state[index];
      const on = layer.set(state[index]);
      console.info(`[debug] ${layer.label}: ${on ? 'visibles' : 'ocultos'}`);
    });
  }

  async init(): Promise<void> {
    try {
      this.emitLoad(0, 'Cargando mapas');
      this.mapIndex = await loadMapIndex();
      const entry =
        this.mapIndex.find((candidate) => candidate.id === this.options.mapId) ??
        this.mapIndex[0];
      const map = await loadMap(entry);

      this.emitLoad(2, 'Cargando objetos');
      const itemTextures = await loadItemTextures(this.app);
      for (const [id, textures] of itemTextures) this.itemTextures.set(id, textures);

      // El suelo se pinta troceado: la pantalla de carga sigue animándose y
      // muestra el progreso en vez de congelarse durante la generación. La
      // generación ocupa del 5 % al 60 % de la barra.
      const applied = await applyMapRuntime(
        this.mapRuntimeHost,
        map,
        (fraction, label) => this.emitLoad(5 + fraction * 55, label)
      );
      if (!applied) return;

      // El mundo ya configuró la niebla y la iluminación de la escena, así que
      // los shaders se compilan con las mismas variantes que usará la partida.
      // Se hace antes de cargar sprites para que el GC de la precarga quede
      // detrás de la pantalla de carga.
      await this.warmUpShaders();
      if (this.disposed) return;

      let manifest = this.options.manifest ?? null;
      if (!manifest) {
        this.emitLoad(76, 'Leyendo el manifiesto de sprites');
        const response = await fetch(
          `${import.meta.env.BASE_URL}sprites/manifest.json?v=${Date.now()}`
        );
        if (!response.ok) {
          throw new Error(`No se pudo cargar el manifiesto (HTTP ${response.status})`);
        }
        manifest = (await response.json()) as SpriteManifest;
      }
      this.manifest = manifest;

      // Solo se descargan las hojas que van a aparecer en la partida. Cargar
      // todo el manifiesto retrasaba el inicio y subía a la GPU texturas que
      // ningún jugador ni bot iba a usar. Cada combinación especie + aspecto se
      // deduplica, porque dos jugadores pueden compartir exactamente la misma.
      const requestedSkins = this.options.pokemonSkins;
      let selections: PokemonSkinSelection[];
      if (requestedSkins && requestedSkins.length > 0) {
        const unique = new Map<string, PokemonSkinSelection>();
        for (const selection of requestedSkins) {
          unique.set(assetKey(selection.pokemonId, selection.skinId), selection);
        }
        selections = [...unique.values()];
      } else {
        const requiredIds = this.options.pokemonIds
          ? new Set(this.options.pokemonIds)
          : null;
        const entries = requiredIds
          ? manifest.pokemon.filter((entry) => requiredIds.has(entry.id))
          : manifest.pokemon;
        selections = entries.map((entry) => ({
          pokemonId: entry.id,
          skinId: DEFAULT_SKIN_ID
        }));
      }

      const spriteBudget = detectSpriteBudget(
        this.app.graphicsDevice.maxTextureSize,
        selections.length,
        CONFIG.sprite.textureBudgetMB
      );
      console.info(
        `[sprite] ${spriteBudget.perAssetMB} MB por aspecto` +
          ` (${selections.length} aspectos, ${spriteBudget.tier}` +
          `${spriteBudget.renderer ? `: ${spriteBudget.renderer}` : ''})`
      );

      const total = selections.length * 4;
      let loaded = 0;
      this.emitLoad(76, 'Cargando sprites');

      await Promise.all(
        selections.map(async (selection) => {
          const entry = manifest.pokemon.find(
            (candidate) => candidate.id === selection.pokemonId
          );
          if (!entry) return;
          const skin = skinFor(entry, selection.skinId);
          const asset = await loadSpriteAsset(
            this.app.graphicsDevice,
            entry,
            skin,
            spriteBudget.perAssetMB
          );
          this.assets.set(assetKey(entry.id, selection.skinId), asset);
          loaded += 4;
          this.emitLoad(
            76 + (loaded / Math.max(1, total)) * 24,
            skin.id === DEFAULT_SKIN_ID
              ? `${entry.name} listo`
              : `${entry.name} · ${skin.name} listo`
          );
        })
      );

      if (this.disposed) return;

      this.emitLoad(100, 'Preparando el combate');
      this.ready = true;
      this.mode = 'menu';
      this.menuCamera.setEnabled(true);
      this.callbacks.onReady(manifest, this.mapIndex, this.activeMapId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido al cargar';
      this.callbacks.onError(message);
    }
  }

  /**
   * Precarga los shaders de los efectos en una capa y cámara temporales. Las
   * compilaciones se hacen con la pantalla de carga visible, no en el primer
   * casteo de cada habilidad.
   */
  private async warmUpShaders(): Promise<void> {
    if (!CONFIG.performance.warmUpShaders || this.disposed) return;

    const layer = new pc.Layer({ name: 'shader-warmup' });
    this.app.scene.layers.pushTransparent(layer);

    const camera = new pc.Entity('shader-warmup-camera');
    camera.addComponent('camera', {
      nearClip: 0.1,
      farClip: 120,
      fov: 70
    });
    const cameraComponent = camera.camera;
    if (!cameraComponent) {
      this.app.scene.layers.remove(layer);
      return;
    }
    cameraComponent.layers = [layer.id];
    cameraComponent.clearColorBuffer = false;
    // Viewport mínimo: el coste de relleno es irrelevante, pero el shader se
    // compila igual al enviar la draw call.
    cameraComponent.rect = new pc.Vec4(0, 0, 0.01, 0.01);
    cameraComponent.scissorRect = new pc.Vec4(0, 0, 0.01, 0.01);
    camera.setPosition(0, 12, 12);
    camera.lookAt(new pc.Vec3(0, 0, 0));
    this.app.root.addChild(camera);

    this.combatFx.setWarmupLayer(layer.id);

    // La marca de KO no pasa por `combatFx`: tiene su propio material (sin
    // niebla, con `emissiveMap`/`opacityMap` y `alphaTest`), una variante que
    // ningún efecto de combate usa. Se crea en la capa de precarga para que se
    // dibuje junto al resto y su shader quede compilado antes del primer KO.
    const deathMarker = new DeathMarker(this.app, 0, 0, 0, null);
    deathMarker.setLayer(layer.id);

    // El atlas de números de daño también estrena material con el primer
    // impacto: se dibuja un número de muestra en la misma capa de precarga.
    this.damageNumbers.warmUp(cameraComponent, layer.id);

    const calls = this.buildWarmupCalls(this.collectWarmupAbilities());
    const batchSize = Math.max(1, CONFIG.performance.warmUpBatchSize);
    const batches = Math.ceil(calls.length / batchSize);

    try {
      for (
        let start = 0, batch = 0;
        start < calls.length;
        start += batchSize, batch++
      ) {
        const end = Math.min(start + batchSize, calls.length);
        for (let index = start; index < end; index++) calls[index]();
        // Un paso mínimo para que los materiales queden con opacidad/tiempo
        // iniciales y la draw call no se descarte por un estado transitorio.
        this.combatFx.update(1 / 60);

        // Dos frames: uno para enviar materiales y otro para que la
        // compilación/uso del shader quede resuelto antes de limpiar.
        await this.waitFrames(2);
        this.combatFx.clear();
        this.emitLoad(
          60 + ((batch + 1) / Math.max(1, batches)) * 15,
          'Precompilando efectos'
        );
        if (this.disposed) break;
      }
    } catch (error) {
      console.warn('[shaders] No se pudieron precargar todos los efectos', error);
    } finally {
      deathMarker.destroy();
      // Desactiva el número de muestra; la ranura queda en el pool.
      this.damageNumbers.clear();
      this.combatFx.clear();
      this.combatFx.setWarmupLayer(null);
      camera.destroy();
      this.app.scene.layers.remove(layer);
    }
  }

  /**
   * Habilidades que pueden lanzarse en esta partida. Se deduplican por id y se
   * calientan con sus valores reales (radio, ángulo y color) para que las
   * mallas y los emisores queden cacheados antes del primer casteo.
   */
  private collectWarmupAbilities(): AbilityDef[] {
    const abilities = new Map<string, AbilityDef>();
    const add = (def: AbilityDef | null | undefined) => {
      if (def) abilities.set(def.id, def);
    };

    const ids = this.options.pokemonIds;
    if (ids && ids.length > 0) {
      for (const id of ids) {
        for (const abilityId of MOVESETS[id] ?? []) {
          if (abilityId) add(ABILITIES[abilityId]);
        }
      }
    } else {
      for (const moveset of Object.values(MOVESETS)) {
        for (const abilityId of moveset) {
          if (abilityId) add(ABILITIES[abilityId]);
        }
      }
    }
    for (const def of Object.values(COMMON_ABILITIES)) add(def);

    return [...abilities.values()];
  }

  private buildWarmupCalls(abilities: AbilityDef[]): Array<() => void> {
    const calls: Array<() => void> = [];
    const white: [number, number, number] = [255, 255, 255];
    const x = 0;
    const z = 0;
    const seen = new Set<string>();
    const push = (key: string, call: () => void) => {
      if (seen.has(key)) return;
      seen.add(key);
      calls.push(call);
    };

    for (const def of abilities) {
      const radius = Math.max(0.08, def.radius);
      const padding = maxHitRadius();
      const colorKey = `${def.color[0]},${def.color[1]},${def.color[2]}`;

      push(`impact:${def.impactStyle}:${colorKey}`, () =>
        this.combatFx.spawnImpact(x, z, def.color, 1, def.impactStyle)
      );

      if (def.shape === 'projectile') {
        push(
          `projectile:${def.projectileStyle}:${radius.toFixed(3)}:${colorKey}`,
          () =>
            this.combatFx.spawnProjectile(
              x,
              z,
              def.color,
              radius,
              def.projectileStyle,
              1,
              0
            )
        );
      } else if (def.shape === 'beam') {
        push(`beam:${def.beamStyle}:${radius.toFixed(3)}:${colorKey}`, () =>
          this.combatFx.spawnBeam(-1, 0, 1, 0, def.color, radius, def.beamStyle)
        );
      } else if (def.shape === 'aoe') {
        const length = radius + padding;
        if (def.aoeShape === 'cone') {
          push(
            `aoe-cone:${def.aoeStyle}:${length.toFixed(3)}:${def.halfAngle}:${colorKey}`,
            () => {
              this.combatFx.spawnAoeCone(
                x,
                z,
                0,
                1,
                length,
                def.halfAngle,
                def.color,
                def.aoeStyle,
                Math.max(0.1, def.aoeDuration)
              );
              this.combatFx.spawnAoeConeTelegraph(
                x,
                z,
                0,
                1,
                length,
                def.halfAngle,
                def.color,
                0.4,
                0.4
              );
            }
          );
        } else {
          push(`aoe:${def.aoeStyle}:${length.toFixed(3)}:${colorKey}`, () =>
            this.combatFx.spawnAoe(
              x,
              z,
              length,
              def.color,
              def.aoeStyle,
              Math.max(0.1, def.aoeDuration)
            )
          );
        }
      } else if (def.shape === 'melee') {
        push(
          `melee:${def.impactStyle}:${(def.range + padding).toFixed(3)}:${def.halfAngle}:${colorKey}`,
          () =>
            this.combatFx.spawnMelee(
              x,
              z,
              0,
              def.range + padding,
              def.halfAngle,
              def.color,
              def.impactStyle
            )
        );
      } else if (def.shape === 'dash') {
        push(`dash:${colorKey}`, () =>
          this.combatFx.spawnDash(-1, 0, 1, 0, def.color)
        );
      } else if (!def.shield && def.healSelf <= 0) {
        push(`buff:${colorKey}`, () =>
          this.combatFx.spawnBuff(x, z, def.color, Math.max(0.8, def.radius))
        );
      }
    }

    // Efectos compartidos que no dependen de una habilidad concreta.
    push('lane', () =>
      this.combatFx.spawnBeamLane(-1, 0, 1, 0, 0.3, white, 0, 'electric')
    );
    push('telegraph', () =>
      this.combatFx.spawnAoeTelegraph(x, z, 1.5, white, 0.6, 0.6)
    );
    push('dash', () => this.combatFx.spawnDash(-1, 0, 1, 0, white));
    push('buff', () => this.combatFx.spawnBuff(x, z, white, 1));
    push('shield', () =>
      this.combatFx.spawnProtectionShield({ x, z }, white, 1, 1, 0.5)
    );
    push('heal', () => this.combatFx.spawnHeal(x, z, white, 1));

    // Feedback de la armadura de casteo. No depende de una habilidad concreta
    // (usa el `accent` del Pokémon que la lleva), así que no entra en el bucle
    // de `abilities`. El color es un uniform, no una variante de shader, así
    // que basta con calentar las mallas y los materiales una vez: sin esto, el
    // primer golpe absorbido compilaba a mitad de combate.
    push('armor-aura', () =>
      this.combatFx.spawnArmorAura({ x, z }, white, 1, 0.3)
    );
    push('armor-pulse', () => this.combatFx.spawnArmorPulse(x, z, white, 1));
    push('armor-break', () => this.combatFx.spawnArmorBreak(x, z, white, 1));

    return calls;
  }

  private waitFrames(count: number, timeoutMs = 2000): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      let remaining = count;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) {
          finish();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      // Compilar/rasterizar una textura grande puede bloquear el compositor y
      // dejar de entregar rAF. La precarga es best-effort: si eso pasa, se
      // continúa para que la pantalla de carga no se quede clavada.
      setTimeout(() => {
        if (settled) return;
        console.warn('[shaders] rAF bloqueado durante la precarga; se continúa');
        finish();
      }, timeoutMs);
    });
  }

  /**
   * Emite progreso de carga en una escala única de 0 a 100.
   *
   * La pantalla de versus dibuja `loaded / total`. Antes cada fase usaba su
   * propio total (17 objetos, N sprites, M lotes de shaders) y la barra
   * retrocedía al empezar la siguiente. Ahora todas comparten total y el
   * porcentaje nunca baja; si el porcentaje no cambia, solo se actualiza la
   * etiqueta cuando cambia de verdad, para no re-renderizar React de más.
   */
  private emitLoad(percent: number, label: string): void {
    const rounded = Math.max(0, Math.min(100, Math.round(percent)));
    if (rounded < this.loadPercent) return;
    if (rounded === this.loadPercent && label === this.loadLabel) return;
    this.loadPercent = rounded;
    this.loadLabel = label;
    this.callbacks.onProgress({ loaded: rounded, total: 100, label });
  }

  /** Aplica un clima a la escena y avisa al HUD. */
  private setAtmosphere(id: AtmosphereId): void {
    this.atmosphere = id;
    this.atmosphereVision = atmosphereVisionMultiplier(id);
    this.atmosphereTick = 0;
    this.world.setAtmosphere(id);
    this.updateViewFarClip();
    this.callbacks.onAtmosphere(atmosphereState(id));
  }

  /** Vuelve al aspecto despejado y retira el aviso del HUD. */
  private clearAtmosphere(): void {
    this.atmosphere = 'clear';
    this.atmosphereVision = 1;
    this.atmosphereTick = 0;
    this.world?.setAtmosphere('clear');
    this.updateViewFarClip();
    this.callbacks.onAtmosphere(null);
  }

  /**
   * Ajusta el plano lejano de cada vista al final de la niebla. Con `far` en
   * 260 se cullaban y enviaban props que la niebla ya ocultaba por completo;
   * en partidas de 8 vistas ese trabajo se multiplica por ocho.
   */
  private updateViewFarClip(): void {
    const far = Math.min(
      CONFIG.camera.far,
      Math.max(60, atmosphereFogFar(this.atmosphere) + CONFIG.camera.fogMargin)
    );
    for (const view of this.views) this.viewOf(view).camera.setFarClip(far);
  }

  /**
   * Cielo de una vista. Es una copia pequeña y pegada a la cámara: así cabe
   * dentro del plano lejano recortado por la niebla y no aparece el hueco que
   * dejaría la esfera grande del menú.
   */
  private createViewSky(
    layerId: number,
    index: number,
    camera: CameraRig
  ): pc.Entity {
    const sky = new pc.Entity(`match-sky-${index + 1}`);
    sky.addComponent('render');
    const render = sky.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    render.layers = [layerId];
    render.meshInstances = [
      new pc.MeshInstance(this.world.skyMesh, this.world.skyMaterial)
    ];
    // Radio 40: cabe incluso en el recorte mínimo de 60 u (niebla densa).
    sky.setLocalScale(80, 80, 80);
    const position = camera.entity.getPosition();
    sky.setPosition(position.x, position.y, position.z);
    this.app.root.addChild(sky);
    return sky;
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
    return startMatchSession(this.matchSessionHost, configs);
  }

  /** Vuelve al menú de selección y destruye la partida actual. */
  endMatch(): void {
    endMatchSession(this.matchSessionHost);
  }

  /** Destruye la partida actual sin tocar el mundo ni los objetos del mapa. */
  private clearMatch(): void {
    clearMatchSession(this.matchSessionHost);
  }

  /** Zonas declaradas por el mapa, para los modos de control. */
  private resolveObjectiveZones(): ObjectiveZone[] {
    return getActiveMap().objectives
      .filter((objective) => objective.kind === 'zone')
      .map((objective) => ({
        id: objective.id,
        x: objective.x,
        z: objective.z,
        radius: objective.radius
      }));
  }

  /** Aro permanente de la zona de control para que el objetivo sea legible. */
  private spawnObjectiveMarker(): void {
    if (this.gameModeId !== 'koth' || !this.objectiveZone) return;
    const zone = this.gameMode?.getBotObjective() ?? this.objectiveZone;
    const duration = this.timeLimitSeconds > 0 ? this.timeLimitSeconds : 3600;
    this.objectiveMarker = this.combatFx.spawnAoeTelegraph(
      zone.x,
      zone.z,
      zone.radius,
      OBJECTIVE_NEUTRAL_COLOR,
      0.1,
      duration
    );
    this.objectiveMarkerTeam = null;
  }

  /** Mantiene el aro encima de la colina y con el color de su dueño. */
  private syncObjectiveMarker(): void {
    if (!this.objectiveMarker) return;
    const objective = this.gameMode?.getHud(this.modeContext()).objective;
    if (!objective) return;
    this.objectiveMarker.setCenter?.(objective.x, objective.z);
    if (this.objectiveMarkerTeam !== objective.owner) {
      this.objectiveMarker.setColor?.(
        objective.owner
          ? TEAM_INFO[objective.owner].accent
          : OBJECTIVE_NEUTRAL_COLOR
      );
      this.objectiveMarkerTeam = objective.owner;
    }
  }

  /** Contexto compacto que comparten todos los modos. */
  private modeContext(): ModeContext {
    return {
      elapsed: this.matchElapsed,
      timeLimitSeconds: this.timeLimitSeconds,
      scores: this.teamScores,
      players: this.matchPlayers,
      objective: this.objectiveZone
    };
  }

  /**
   * Reparte el evento de tick al modo, actualiza el marcador de objetivo y
   * cierra la partida si se alcanza la meta o se agota el tiempo máximo.
   */
  private advanceGameMode(dt: number): void {
    if (!this.gameMode || this.matchOver) return;
    const ctx = this.modeContext();
    const result = this.gameMode.onEvent(ctx, { type: 'tick', dt });
    this.applyModeXp(result.xp);
    this.syncObjectiveMarker();
    if (result.outcome) {
      this.finishMatch(result.outcome);
      return;
    }
    if (this.timeLimitSeconds <= 0) return;
    if (this.matchElapsed < this.timeLimitSeconds) return;
    // El modo decide cómo se resuelve el empate a tiempo: por marcador, por
    // daño o declarando empate técnico.
    this.finishMatch(this.gameMode.resolveTimeout(ctx));
  }

  /** Aplica la XP extra que el modo concede al procesar un evento. */
  private applyModeXp(awards: readonly ModeXpAward[]): void {
    for (const award of awards) {
      if (!Number.isFinite(award.amount) || award.amount <= 0) continue;
      const player = this.matchPlayers.find(
        (candidate) => candidate.slot === award.slot
      );
      if (!player) continue;
      this.awardXp(player, award.source, award.amount);
    }
  }

  /**
   * Cierre único de partida. Todos los modos pasan por aquí, así la XP de
   * resultado, la música y el evento a React se aplican una sola vez.
   */
  private finishMatch(outcome: MatchOutcome): void {
    if (this.matchOver) return;
    this.matchOver = true;
    this.winner = outcome.winner;
    this.objectiveMarker?.destroy();
    this.objectiveMarker = null;
    this.objectiveMarkerTeam = undefined;
    this.awardMatchResult(outcome.winner);
    stopMatchMusic();
    const hud = this.gameMode?.getHud(this.modeContext());
    const result: MatchEndResult = {
      winner: outcome.winner,
      scores: { ...this.teamScores },
      modeId: this.gameModeId,
      scoreUnit: hud?.scoreUnit ?? 'KO',
      reason: outcome.reason,
      detail: outcome.detail
    };
    this.callbacks.onMatchEnd(result);
    this.emitMatchStats();
  }

  /**
   * Quad unitario compartido por todas las vistas. Cada `FogView` crea su
   * propia instancia y su propio material; lo único compartido es la malla.
   */
  private ensureFogMesh(): pc.Mesh {
    if (!this.fogMesh) this.fogMesh = createFogMesh(this.app.graphicsDevice);
    return this.fogMesh;
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
    // No arrastrar tiempo ni pulsaciones de antes de la pausa.
    this.simAccumulator = 0;
    this.inputBuffer.clear();
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
        player.activeCast !== null ||
        player.stunTimer > 0 ||
        player.hurtTimer > 0
      ) {
        continue;
      }
      player.animation = 'idle';
      player.playback = 1;
      player.animationFrame = null;
      for (const copy of this.viewOf(player).copies) copy.play('idle');
    }
  }

  /**
   * Fija el presupuesto de píxeles del modo actual y reinicia la escala
   * dinámica. El menú usa más resolución que una partida de 5-8 vistas.
   */
  private setResolutionBaseline(baseline: number): void {
    this.dynamicResolution.setBaseline(baseline);
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

    // Solo se adapta durante una partida jugable: en menús y pausa el coste no
    // representa el rendimiento real y no queremos que la resolución oscile.
    if (
      this.mode === 'match' &&
      !this.paused &&
      !this.matchOver &&
      this.countdown === 0
    ) {
      this.dynamicResolution.update(frameDt, this.fps);
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
      this.world.updateAmbient(frameDt);
      this.fxVisibilityCache.clear();
      this.combatFx.update(frameDt);
      this.flushPendingPopups();
      this.damageNumbers.update(frameDt);
      return;
    }

    if (this.paused) {
      this.world.update(frameDt);
      // La ambientación sigue respirando con la pausa, como hacían los
      // ParticleSystem de PlayCanvas, que se actualizaban por su cuenta.
      this.world.updateAmbient(frameDt);
      return;
    }

    // Si se acaba de reanudar con B/Esc, el mismo frame conserva el borde de
    // cancelar y volvería a pausar. Saltamos un frame de simulación.
    if (wasPaused) {
      this.world.update(frameDt);
      this.world.updateAmbient(frameDt);
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
    // Se usa el foco guardado y no `getActiveMap().spawn`: mientras un mapa
    // nuevo se construye en segundo plano, el mundo visible sigue siendo el
    // anterior y la cámara no debe saltar a las coordenadas del que viene.
    this.menuCamera.update(dt, this.menuFocus, 0, 0);
    this.world.update(dt);
    // En el menú la cámara de atracción sirve de observador para los objetos.
    this.viewCameraPositions.length = 0;
    this.viewCameraPositions.push(this.menuCamera.position);
    this.world.updateAmbient(dt);
    this.pickups?.update(dt, this.viewCameraPositions);
  }

  private updateMatch(dt: number, frame: InputFrame, frozen = false): void {
    // Reparte la creación de capas pendientes antes de simular. La cuenta
    // atrás da margen suficiente para que todos los actores estén completos al
    // empezar a jugarse.
    this.prewarmBillboards();
    // La visibilidad de los FX se consulta muchas veces por frame con las
    // mismas anclas; la memoización solo es válida dentro de este frame.
    this.fxVisibilityCache.clear();
    // Start/Escape pausan la partida. En mando, B (cancel) solo vuelve en los
    // menús: no pausa, para no provocar pausas accidentales al desmarcar. El
    // coste de comprobarlo antes de mover es despreciable y evita un frame de
    // movimiento fantasma.
    for (const player of this.views) {
      const snapshot = frame.snapshots.get(player.deviceId) ?? IDLE_INPUT;
      if (snapshot.startPressed || (snapshot.cancel && !snapshot.gamepad)) {
        this.setPaused(true);
        this.callbacks.onPauseRequest();
        return;
      }
    }

    // La pose de impacto forzada se consume una vez por render, no por paso:
    // si un render ejecuta varios pasos fijos, el frame debe seguir viéndose.
    for (const player of this.matchPlayers) {
      const cast = player.activeCast;
      if (cast && cast.forcedFrames > 0) cast.forcedFrames--;
    }

    let simulated = 0;
    if (!frozen) {
      // A 144 Hz hay renders sin paso de simulación. Las pulsaciones de borde
      // se acumulan hasta el siguiente paso para no perderlas.
      this.inputBuffer.buffer(frame, this.views);
      this.simAccumulator = Math.min(
        this.simAccumulator + dt,
        FIXED_STEP * MAX_FIXED_STEPS
      );
      let steps = 0;
      while (
        this.simAccumulator >= FIXED_STEP - 1e-9 &&
        steps < MAX_FIXED_STEPS &&
        !this.matchOver
      ) {
        this.simulateStep(FIXED_STEP, frame, steps === 0);
        this.simAccumulator -= FIXED_STEP;
        simulated += FIXED_STEP;
        steps++;
      }
      if (this.simAccumulator < 0) this.simAccumulator = 0;
    }

    // La niebla se resuelve antes de sincronizar las copias: además de pintar
    // los círculos de visión, decide qué copia se ve en cada vista. Así el
    // bucle siguiente puede saltarse las ocultas, que no se dibujan pero sí
    // costaban posición, animación, vida y billboard cada frame.
    this.castDebug?.update(this.matchPlayers);
    this.updateVision(dt);

    // Las copias visibles se sincronizan en un módulo aparte: `Game` conserva
    // la simulación y la niebla, y `matchView` solo mueve billboards.
    syncMatchView({
      views: this.views,
      players: this.matchPlayers,
      viewsByPlayer: this.playerViews,
      viewSkies: this.viewSkies,
      deathMarkers: this.deathMarkers,
      playerBySlot: this.playerBySlot,
      waterHeight: this.world.waterHeight,
      debugHideActors: this.debugHideActors,
      dt
    });

    // La barra es única por jugador: se actualiza una vez por frame, no una vez
    // por copia, y el overlay la proyecta después en cada viewport.
    for (const player of this.matchPlayers) {
      const xp = xpStatus(player.xp);
      const bar = this.viewOf(player).bar;
      bar.setFraction(player.alive ? player.hp / player.maxHp : 0);
      bar.setLevel(xp.level);
      bar.setXpFraction(xp.progress);
      bar.setArmorFraction(
        this.activeCastArmor(player) / Math.max(1, player.maxHp)
      );
    }
    if (!this.debugHideBars) {
      this.healthBars.render(this.views, this.matchPlayers, this.playerViews);
    }
    if (!frozen && simulated > 0) {
      stepRegeneration(this.matchPlayers, simulated, this.hosts.status);
      stepParticipation(
        this.matchPlayers,
        simulated,
        this.matchElapsed,
        this.hosts.status
      );
    }

    this.world.update(dt);
    // Una sola lista de posiciones de cámara por frame: la usan los objetos.
    this.viewCameraPositions.length = 0;
    for (const view of this.views) {
      this.viewCameraPositions.push(this.viewOf(view).camera.position);
    }
    this.world.updateAmbient(dt);
    this.pickups?.update(
      // En partida los cooldowns de objetos siguen a la simulación; durante la
      // cuenta atrás se usa el reloj del render para no congelar las animaciones.
      frozen ? dt : simulated,
      this.viewCameraPositions
    );
    this.combatFx.update(dt);
    this.flushPendingPopups();
    this.damageNumbers.update(dt);

    if (simulated > 0) {
      this.statsTimer += simulated;
      if (this.statsTimer >= MATCH_STATS_INTERVAL_SECONDS) {
        this.statsTimer = 0;
        this.emitMatchStats();
      }
    }
  }

  /**
   * Crea por tandas las capas de animación que faltan en las copias. El
   * presupuesto es de 3 ms por frame: el resto del tiempo sigue disponible para
   * la simulación y la cuenta atrás se dibuja con normalidad.
   */
  private prewarmBillboards(): void {
    if (this.prewarmIndex >= this.prewarmTasks.length) return;
    const deadline = performance.now() + 3;
    while (this.prewarmIndex < this.prewarmTasks.length) {
      const task = this.prewarmTasks[this.prewarmIndex];
      task.actor.prewarmStep(task.animation);
      this.prewarmIndex++;
      if (performance.now() >= deadline) break;
    }
  }

  /**
   * Un paso fijo de la simulación autoritativa. Todo lo que ocurre aquí es
   * independiente del framerate del render.
   */
  private simulateStep(
    stepDt: number,
    frame: InputFrame,
    firstStep: boolean
  ): void {
    // Cada paso tiene su propia foto de visibilidad. El render reutiliza la
    // última; el siguiente paso usa la que dejó el paso anterior.
    this.simulationStep += 1;
    // La caché de visibilidad de FX es válida solo con las posiciones actuales.
    this.fxVisibilityCache.clear();
    this.matchElapsed += stepDt;
    // El modo consume el tick antes de mover a nadie: si se agota el tiempo,
    // la partida se cierra en el mismo instante y no se simula un frame extra.
    this.advanceGameMode(stepDt);
    if (this.matchOver) return;
    // El presupuesto de A* se reparte por paso de simulación.
    this.botNav?.beginFrame();
    // Vista compacta de lo que ya está en el aire. Se construye por paso y
    // todos los bots de ambos equipos la comparten: cada uno filtra por equipo.
    const hazards =
      this.bots.size > 0
        ? buildBotHazards(this.projectiles, this.activeAoes)
        : [];
    // La visión de equipo viene de la última foto de `refreshCombatVisibility`
    // (final del paso anterior); es la que corresponde a estas posiciones.
    const botViews: Record<Team, BotWorldView> = {
      red: {
        visibleSlots: this.visibleByTeam.red,
        atmosphere: this.atmosphere,
        objective: this.gameMode?.getBotObjective() ?? undefined
      },
      blue: {
        visibleSlots: this.visibleByTeam.blue,
        atmosphere: this.atmosphere,
        objective: this.gameMode?.getBotObjective() ?? undefined
      },
      yellow: {
        visibleSlots: this.visibleByTeam.yellow,
        atmosphere: this.atmosphere,
        objective: this.gameMode?.getBotObjective() ?? undefined
      },
      green: {
        visibleSlots: this.visibleByTeam.green,
        atmosphere: this.atmosphere,
        objective: this.gameMode?.getBotObjective() ?? undefined
      }
    };

    for (const player of this.matchPlayers) {
      const bot = player.isBot ? this.bots.get(player.slot) : null;
      const input = bot
        ? bot.update(
            stepDt,
            player,
            this.matchPlayers,
            this.world.colliders,
            this.pickupKnowledge[player.team],
            hazards,
            botViews[player.team]
          )
        : this.inputBuffer.resolve(player, frame, firstStep);
      stepPlayerSystem(this.hosts.player, player, input, stepDt);
      // Defensivo: si alguna fase de `stepPlayer` llegara a cerrar la partida,
      // el resto de jugadores no debería seguir actuando.
      if (this.matchOver) break;
    }

    // Los observadores ya no se moverán hasta el siguiente paso. Se tira la
    // caché que pudieran haber llenado efectos creados durante `stepPlayer`
    // para que las fases de resolución usen las posiciones finales.
    this.fxVisibilityCache.clear();

    // El daño residual del clima se cobra una vez por tick y antes de resolver
    // golpes: así un Pokémon que ya estaba a 1 PV no muere por arena o granizo.
    if (!this.matchOver) {
      this.atmosphereTick = stepAtmosphere(
        this.matchPlayers,
        stepDt,
        this.atmosphere,
        this.atmosphereTick,
        this.hosts.atmosphere
      );
    }

    // Cada fase puede cerrar la partida; el resto no debe ejecutarse en el
    // mismo paso. El orden es fijo y reproducible: casts instantáneos (haces y
    // áreas sin retardo) → golpes de dash → melee → proyectiles → áreas.
    if (!this.matchOver) {
      this.resolveQueuedCasts();
      if (!this.matchOver) stepInstantHits(this.hosts.hit);
      if (!this.matchOver) stepMeleeHits(this.hosts.hit);
      if (!this.matchOver) stepProjectiles(this.hosts.projectile, stepDt);
      if (!this.matchOver) stepActiveAoes(this.hosts.aoe, stepDt);
      if (!this.matchOver) stepPendingAoeEnds(this.hosts.aoe, stepDt);
      if (!this.matchOver) this.pickups?.collect(this.matchPlayers, this.pickupHandlers);
    }

    // La visibilidad del siguiente paso debe reflejar las posiciones finales
    // de este, no las del render anterior. El render reutilizará esta foto.
    this.refreshCombatVisibility();
  }


  private updateCamera(
    player: MatchPlayerState,
    input: DeviceInputSnapshot,
    dt: number
  ): void {
    updatePlayerCamera(this.viewOf(player).camera, player, input, dt);
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
    player.animationFrame = null;
    player.dash = null;
    this.cancelCast(player);
    this.clearRepeatCooldown(player);
    player.deathFade = 0;
    // Los enfriamientos del kit siguen corriendo durante los 5 s de muerte: no
    // se reinician al reaparecer. El instinto activo sí se resetea, como pide
    // `docs/common-abilities.md` (sección Respawn).
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
    target: AoeFallenAlly<MatchPlayerState>,
    fraction: number,
    def: AbilityDef,
    caster: MatchPlayerState
  ): boolean {
    const player = target.player;
    if (player.alive) return false;
    // El marcador debe estar en línea con el centro del área: un muro, una roca
    // o una cordillera entre ambos impide revivir, igual que impide el daño.
    if (!target.lineOfSight) return false;
    this.revivePlayer(player, player.x, player.z, fraction);
    this.showHealPopup(player, player.hp, caster);
    this.combatFx.spawnBuff(player.x, player.z, def.color, 1.1);
    // La XP de revivir premia al lanzador, igual que la de curación: el
    // aliado recupera su vida, pero el logro de devolverlo al combate es suyo.
    this.awardXp(caster, 'revive', XP_REWARDS.revive);
    return true;
  }

  /**
   * Deja una marca en el punto del KO, con una copia por vista aliada. La marca
   * es información de equipo: solo se crea en las vistas del equipo del Pokémon
   * caído, aunque el cuerpo esté fuera de la niebla.
   */
  private spawnDeathMarker(target: MatchPlayerState): void {
    const asset = this.assetFor(target.pokemonId, target.skinId);
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
      marker.setRespawnCountdown(target.respawnTimer);
      marker.setLayer(layer.id);
      marker.faceCamera(this.viewOf(viewer).camera.position);
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

  
  
  /** Cancela el casteo activo y retira sus marcas del suelo. */
  private cancelCast(player: MatchPlayerState): void {
    const cast = player.activeCast;
    if (!cast) return;
    // Marca el casteo como cancelado antes de soltarlo: si su efecto ya estaba
    // en `queuedCasts`, la fase de resolución lo descartará.
    cast.canceled = true;
    // Una canalización cortada también acorta su efecto: el área persistente
    // deja de hacer ticks y su efecto 3D se retira en el acto.
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

  /** Retira las áreas persistentes que creó un casteo interrumpido. */
  private cutCastAoes(cast: ActiveCast): void {
    for (let index = this.activeAoes.length - 1; index >= 0; index--) {
      const aoe = this.activeAoes[index];
      if (aoe.cast !== cast) continue;
      aoe.fx?.destroy();
      this.activeAoes.splice(index, 1);
    }
  }

  private clearRepeatCooldown(player: MatchPlayerState): void {
    player.repeatAbilityId = null;
    player.repeatAbilityCount = 0;
    player.repeatAbilityAt = 0;
  }

  /**
   * Calcula el enfriamiento real de un lanzamiento. Las habilidades con
   * `repeatCooldown` acumulan una racha mientras se repitan sin cambiar de
   * habilidad ni dejar pasar la ventana de reinicio.
   */
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

  private castAbility(player: MatchPlayerState, slotIndex: number): void {
    if (!player.alive || this.matchOver) return;
    if (player.activeCast || player.dash) return;
    // Las habilidades instantáneas de este frame aún no se han ejecutado: sin
    // esta comprobación se podrían encolar dos (p. ej. dash + haz) pulsando
    // dos botones a la vez, y se gastarían ambos enfriamientos.
    if (this.hasQueuedCast(player)) return;
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
    breakRegen(player);
    // Atacar desde la protección de spawn la retira: la invulnerabilidad
    // defensiva no debe servir para lanzar gratis una rotación ofensiva. Los
    // buffs y dash de estado (Protección, Impulso, Agilidad) no la rompen.
    if (player.invulnerableTimer > 0 && (def.power > 0 || def.slow !== null)) {
      player.invulnerableTimer = 0;
    }
    const cooldown = this.cooldownForCast(player, abilityId, def);
    player.cooldowns[slotIndex] = cooldown;
    player.cooldownTotals[slotIndex] = cooldown;
    // Las habilidades pensadas para usarse en movimiento conservan la inercia:
    // poner la velocidad a cero producía un frenazo brusco y luego el jugador
    // volvía a acelerar, justo el efecto que no queremos en Protección.
    if (!def.preserveMomentum) {
      player.vx = 0;
      player.vz = 0;
    }

    const asset = this.assetFor(player.pokemonId, player.skinId) ?? null;
    const plan = buildCastPlan(def, (name) =>
      resolveAnimationClip(asset, name)
    );
    let dirX = Math.sin(player.facing);
    let dirZ = Math.cos(player.facing);
    // Los haces fijan su carril al empezar la carga, así que la ayuda de
    // apuntado se resuelve aquí. Los proyectiles la consultan al salir, cuando
    // la dirección real ya no puede cambiar (ver `executeProjectile`).
    if (def.shape === 'beam') {
      const assisted = this.aimAssistDirection(player, def, dirX, dirZ);
      if (assisted) {
        dirX = assisted.dirX;
        dirZ = assisted.dirZ;
        // En modo táctico el cuerpo sigue a la cámara: la ayuda solo corrige
        // la trayectoria y no debe girar el sprite contra el control.
        if (player.movementMode !== 'tactical') {
          player.facing = Math.atan2(dirX, dirZ);
        }
      }
    }
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
    const teamAccent = TEAM_INFO[player.team].accent;
    // Las marcas propias se pueden ocultar a los aliados: la vista del lanzador
    // las dibuja, pero las demás vistas de su mismo equipo no (ver
    // `CONFIG.telegraphs.hideAllied`).
    const owner: TelegraphOwner = { slot: player.slot, team: player.team };
    // Las marcas solo existen si hay preparación visible. Las habilidades
    // instantáneas crean su propio aviso en el ejecutor.
    const marker =
      def.startup > 0 && def.shape === 'aoe'
        ? def.aoeShape === 'cone'
          ? this.combatFx.spawnAoeConeTelegraph(
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
          : this.combatFx.spawnAoeTelegraph(
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
        ? this.combatFx.spawnBeamLane(
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

    // Aura tenue mientras la armadura está activa. La ventana corta dura el
    // startup; la de canalización dura todo el casteo. Se destruye al cancelar
    // o terminar el casteo para no dejarla pegada al cuerpo.
    if (def.armorPool > 0) {
      const armorDuration =
        def.armorWindow === 'cast' ? abilityTotalTime(def) : def.startup;
      cast.armorFx = this.combatFx.spawnArmorAura(
        player,
        player.accent,
        Math.max(0.7, player.hitRadius * 1.8),
        armorDuration
      );
    }

    // Las áreas avisan de que empieza el lanzamiento antes de cualquier
    // preparación. El centro todavía es el fijado al pulsar la habilidad.
    if (def.shape === 'aoe') {
      emitAoeEventSystem(
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

    // Startup cero: el efecto se resuelve en la fase común de este mismo frame.
    if (plan.effectAt <= 0) {
      cast.fired = true;
      this.queueCast(player, def, targetX, targetZ, marker, dirX, dirZ, cast);
      armHitFrame(this.hosts.cast, player, cast);
    }

    applyCastPresentation(this.hosts.cast, player, cast);
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

  /** Ejecuta las habilidades instantáneas encoladas en orden de lanzamiento. */
  private resolveQueuedCasts(): void {
    if (this.queuedCasts.length === 0) return;
    const casts = this.queuedCasts;
    this.queuedCasts = [];
    for (const cast of casts) {
      // Un golpe anterior de esta misma tanda pudo cerrar la partida.
      if (this.matchOver) break;
      // El casteo pudo cancelarse (control, KO, choque, respawn) entre el
      // encolado y esta fase. En ese caso su efecto ya no debe salir.
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

  /**
   * Ejecuta el efecto de una habilidad cuando su presentación llega al
   * `HitFrame` (`plan.effectAt`). Los bloqueos y la animación ya los lleva el
   * `ActiveCast`; aquí solo se aplica el efecto de gameplay.
   */
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
    // El sonido va con el efecto real, no con el inicio del startup: en
    // habilidades cargadas el golpe suena cuando sale, no cuando se prepara.
    playAbilityCast(def);

    CAST_EFFECTS({
      player,
      def,
      combatFx: this.combatFx,
      showHealPopup: (target, amount) => {
        this.showHealPopup(target, amount, player);
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
        applyAbilityDamageSystem(this.hosts.damage, attacker, target, ability, options),
      dashPosition: (source, x, z, dirX, dirZ, distance) =>
        this.dashPosition(source, x, z, dirX, dirZ, distance),
      addProjectile: (projectile) => this.projectiles.push(projectile),
      addActiveAoe: (aoe) => this.activeAoes.push(aoe),
      activeCast,
      addPendingMeleeHit: (hit) => this.pendingMeleeHits.push(hit),
      marker,
      castDirX: dirX,
      castDirZ: dirZ,
      aimAssist: (source, ability, sourceDirX, sourceDirZ) =>
        this.aimAssistDirection(source, ability, sourceDirX, sourceDirZ),
      resolveAoeHit: (hit) => resolveAoeHitSystem(this.hosts.aoeResolution, hit),
      emitAoeEvent: (
        phase,
        source,
        ability,
        x,
        z,
        eventDirX,
        eventDirZ,
        elapsed
      ) =>
        emitAoeEventSystem(
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
    // Si un enemigo o un obstáculo acortó el dash al lanzarlo, la animación
    // debe durar lo mismo que el desplazamiento real, no la ventana completa.
    if (def.shape === 'dash' && player.dash) {
      this.syncDashCast(player, player.dash.duration);
    }
    this.applySelfDamage(player, def);
  }

  /**
   * Reajusta el plan de presentación de un dash a la duración real del
   * desplazamiento. Se llama al lanzarlo (distancia ya recortada) y cuando
   * `stepDash` lo detiene antes de tiempo por un obstáculo dinámico.
   */
  private syncDashCast(player: MatchPlayerState, duration: number): void {
    const cast = player.activeCast;
    if (!cast || cast.def.shape !== 'dash') return;
    const active = Math.max(0, Math.min(cast.def.active, duration));
    if (active <= 1e-4) {
      this.cancelCast(player);
      return;
    }
    if (Math.abs(cast.plan.activeEnd - (cast.plan.effectAt + active)) < 0.001) {
      return;
    }
    const asset = this.assetFor(player.pokemonId, player.skinId) ?? null;
    cast.plan = buildCastPlan(
      { ...cast.def, active },
      (name) => resolveAnimationClip(asset, name)
    );
    applyCastPresentation(this.hosts.cast, player, cast);
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
    breakRegen(player);
    player.hurtTimer = Math.max(player.hurtTimer, 0.25);
    this.vibrateOnDamage(player, amount);
    this.showDamagePopup(player, amount, false, 1, false, player);
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
    const asset = this.assetFor(player.pokemonId, player.skinId);
    const idle = asset?.skin.animations.idle;
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
   * Aplica la ayuda de apuntado de un proyectil o haz. Solo existe para
   * jugadores humanos con el ajuste activo: los bots conservan el error de su
   * dificultad. Se descartan rivales no golpeables, ocultos o sin línea de
   * visión directa en el instante del disparo; no reutiliza el conjunto de
   * visibilidad del paso para no asistir a través de una pared que acaba de
   * aparecer.
   */
  private aimAssistDirection(
    player: MatchPlayerState,
    def: AbilityDef,
    dirX: number,
    dirZ: number
  ): { dirX: number; dirZ: number } | null {
    if (player.isBot || !isAimAssistEnabled()) return null;
    if (def.shape !== 'projectile' && def.shape !== 'beam') return null;

    const colliders = this.world.colliders;
    const targets: AimAssistTarget[] = [];
    for (const target of this.matchPlayers) {
      if (target.hidden) continue;
      if (!this.canHit(player, target)) continue;
      // `alreadyVisible = false`: la ayuda exige visibilidad real en este
      // instante, sin la histéresis de render.
      if (
        !observerSeesActor(
          player,
          target,
          false,
          colliders,
          this.atmosphereVision
        )
      ) {
        continue;
      }
      targets.push({
        x: target.x,
        z: target.z,
        hitRadius: target.hitRadius
      });
    }
    if (targets.length === 0) return null;

    const assisted = assistAimDirection({
      x: player.x,
      z: player.z,
      facing: Math.atan2(dirX, dirZ),
      range: def.range,
      shotRadius: Math.max(0, def.radius),
      targets,
      blocked: (target) =>
        segmentBlockedByColliders(
          player.x,
          player.z,
          target.x,
          target.z,
          colliders,
          CONFIG.combat.aimAssist.sightPadding
        )
    });
    return assisted ? { dirX: assisted.dirX, dirZ: assisted.dirZ } : null;
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

  /** Cancela dash, casteo y animación manual de un objetivo. */
  private interruptPlayer(target: MatchPlayerState): void {
    target.dash = null;
    this.cancelCast(target);
  }

  /**
   * Interrumpe por un impacto válido. Si el efecto del casteo aún no había
   * salido y el golpe no es letal, el enfriamiento de esa habilidad se queda
   * como máximo a la mitad: un casteo cortado no debe costar la habilidad
   * entera. No se aplica a muerte, respawn ni cancelaciones internas, que no
   * pasan por aquí.
   */
  private interruptWithRefund(
    target: MatchPlayerState,
    lethal: boolean
  ): void {
    const cast = target.activeCast;
    const beforeEffect = cast != null && !cast.fired;
    this.interruptPlayer(target);
    if (!cast || !beforeEffect || lethal) return;
    const remaining = target.cooldowns[cast.slotIndex] ?? 0;
    const total =
      target.cooldownTotals[cast.slotIndex] ?? cast.def.cooldown;
    target.cooldowns[cast.slotIndex] = Math.min(remaining, total * 0.5);
  }

  /**
   * Armadura de casteo restante en este instante; 0 si el lanzador no está
   * casteando con armadura, ya la agotó o su ventana se cerró. Lo comparten la
   * resolución del golpe, el HUD y la barra flotante para que todos lean
   * exactamente el mismo estado.
   */
  private activeCastArmor(target: MatchPlayerState): number {
    const cast = target.activeCast;
    if (!cast || cast.def.armorPool <= 0) return 0;
    if (cast.def.armorWindow === 'startup' && cast.fired) return 0;
    return cast.armorRemaining;
  }

  /**
   * Feedback visual y sonoro de la armadura de casteo: pulso si absorbe el
   * golpe, fractura si se rompe. Ayuda a que el rival entienda por qué su
   * impacto no canceló la habilidad.
   */
  private spawnArmorFeedback(
    target: MatchPlayerState,
    broke: boolean
  ): void {
    const radius = Math.max(0.7, target.hitRadius * 1.8);
    if (broke) {
      this.combatFx.spawnArmorBreak(target.x, target.z, target.accent, radius);
      return;
    }
    this.combatFx.spawnArmorPulse(target.x, target.z, target.accent, radius);
    playArmorBlock();
  }

  
  
  
  
  
  
  
  

  /**
   * Crea un número de daño en cada viewport donde se ve al objetivo. El texto,
   * el quad y la animación los gestiona `DamageNumbers` dentro de PlayCanvas.
   *
   * `source` es el atacante (o el propio jugador en el autodaño) y `null` para
   * el daño del entorno; el filtro de `CONFIG.damageNumbers.onlyOwn` lo usa para
   * decidir qué vistas muestran el número.
   */
  private showDamagePopup(
    target: MatchPlayerState,
    amount: number,
    critical: boolean,
    effectiveness: number,
    lethal: boolean,
    source: MatchPlayerState | null
  ): void {
    this.spawnNumberPopup(target, {
      source,
      amount,
      critical,
      effectiveness,
      heal: false,
      lethal
    });
  }

  /** Número de curación flotante, con el mismo sistema que el daño. */
  private showHealPopup(
    target: MatchPlayerState,
    amount: number,
    source: MatchPlayerState | null
  ): void {
    this.spawnNumberPopup(target, {
      source,
      amount,
      critical: false,
      effectiveness: 1,
      heal: true,
      lethal: false
    });
  }

  /** Marca de inmunidad cuando la habilidad conecta pero el tipo la anula. */
  private showImmunePopup(
    target: MatchPlayerState,
    source: MatchPlayerState | null
  ): void {
    this.spawnNumberPopup(target, {
      source,
      amount: 0,
      critical: false,
      effectiveness: 1,
      heal: false,
      lethal: false,
      immune: true
    });
  }

  /**
   * Encola el número de daño. Componer un número cuesta poco, pero varios
   * impactos en el mismo render se acumulaban en el p99: el render los dibuja
   * con presupuesto y los que sobran salen en el siguiente.
   */
  private spawnNumberPopup(
    target: MatchPlayerState,
    options: {
      /** Atacante o lanzador; `null` si la fuente es el entorno. */
      source: MatchPlayerState | null;
      amount: number;
      critical: boolean;
      effectiveness: number;
      heal: boolean;
      lethal: boolean;
      immune?: boolean;
    }
  ): void {
    if (this.pendingPopups.length >= MAX_PENDING_POPUPS) this.pendingPopups.shift();
    this.pendingPopups.push({
      target,
      source: options.source,
      amount: options.amount,
      critical: options.critical,
      effectiveness: options.effectiveness,
      heal: options.heal,
      lethal: options.lethal,
      immune: options.immune ?? false
    });
  }

  /** Dibuja números pendientes hasta agotar el presupuesto de este render. */
  private flushPendingPopups(): void {
    if (this.pendingPopups.length === 0) return;
    const start = performance.now();
    while (this.pendingPopups.length > 0) {
      const popup = this.pendingPopups.shift();
      if (!popup) break;
      this.drawNumberPopup(popup);
      if (performance.now() - start >= POPUP_RENDER_BUDGET_MS) break;
    }
  }

  private drawNumberPopup(popup: PendingPopup): void {
    const target = popup.target;
    const asset = this.assetFor(target.pokemonId, target.skinId);
    if (!asset) return;

    const idle = asset.skin.animations.idle;
    const anchorY = idle.anchors[0]?.y ?? idle.frameHeight * 0.75;
    const worldY =
      0.04 +
      anchorY * CONFIG.sprite.pixelScale * CONFIG.sprite.verticalStretch +
      0.2;

    const views: DamageNumberView[] = [];
    this.views.forEach((viewer, viewIndex) => {
      // «Solo los míos»: cada vista muestra lo que hace o recibe su jugador.
      // El autodaño y las pociones cumplen ambas condiciones a la vez.
      if (
        CONFIG.damageNumbers.onlyOwn &&
        viewer !== target &&
        viewer !== popup.source
      ) {
        return;
      }
      const copy = this.viewOf(target).copies[viewIndex];
      const camera = this.viewOf(viewer).camera.entity.camera;
      const layer = this.viewLayers[viewIndex];
      if (!copy?.isVisible || !camera || !layer) return;
      views.push({ camera, layerId: layer.id });
    });

    if (views.length === 0) return;
    this.damageNumbers.spawn({
      x: target.x,
      y: worldY,
      z: target.z,
      amount: popup.amount,
      critical: popup.critical,
      effectiveness: popup.effectiveness,
      heal: popup.heal,
      lethal: popup.lethal,
      immune: popup.immune,
      views
    });
  }


  /**
   * Guarda el KO para el feed de las vistas. Se conservan los últimos
   * `KILL_FEED_MAX_ENTRIES`; al entrar uno nuevo se descarta el más antiguo.
   */
  private pushKillFeed(
    killer: MatchPlayerState,
    victim: MatchPlayerState,
    abilityName: string
  ): void {
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
      victimPokemonId: victim.pokemonId,
      abilityName
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
  private awardMatchResult(winner: Team | null): void {
    for (const player of this.matchPlayers) {
      this.awardXp(
        player,
        'result',
        winner !== null && player.team === winner
          ? XP_REWARDS.win
          : XP_REWARDS.loss
      );
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
    const stats = buildMatchStats({
      players: this.matchPlayers,
      views: this.views,
      viewsByPlayer: this.playerViews,
      manifest: this.manifest,
      fps: this.fps,
      atmosphereVision: this.atmosphereVision,
      killFeed: this.killFeed,
      teamScores: this.teamScores,
      mode: this.gameMode?.getHud(this.modeContext()) ?? null,
      winner: this.winner,
      activeCastArmor: (player) => this.activeCastArmor(player)
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
   *
   * `owner` solo lo pasan las marcas de área y de haz. Si
   * `CONFIG.telegraphs.hideAllied` está activo, las vistas aliadas del
   * lanzador (mismo equipo y otra plaza) no dibujan su marca; su propia vista
   * y las rivales sí.
   */
  private fxLayersAt(
    x: number,
    z: number,
    ignoreTerrainConcealment = false,
    owner?: TelegraphOwner
  ): number[] {
    if (this.mode !== 'match' || this.views.length === 0) {
      return [this.worldLayerId];
    }
    const hideAllied = owner !== undefined && CONFIG.telegraphs.hideAllied;
    const ownerKey = hideAllied ? `${owner.team}#${owner.slot}` : '-';
    const cacheKey = `${ignoreTerrainConcealment ? 1 : 0}:${x}:${z}:${ownerKey}`;
    const cached = this.fxVisibilityCache.get(cacheKey);
    if (cached) return cached;
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
      // Marca aliada: solo la dibuja la vista de su lanzador. El resto de su
      // equipo no necesita el aviso, pero los rivales sí para poder esquivar.
      if (
        owner !== undefined &&
        CONFIG.telegraphs.hideAllied &&
        observer.team === owner.team &&
        observer.slot !== owner.slot
      ) {
        return;
      }
      if (!seenTeams.has(observer.team)) {
        if (
          teamSeesPoint(
            this.matchPlayers,
            observer.team,
            x,
            z,
            concealment,
            colliders,
            this.atmosphereVision
          )
        ) {
          seenTeams.add(observer.team);
        }
      }
      if (seenTeams.has(observer.team)) layers.push(layer.id);
    });
    this.fxVisibilityCache.set(cacheKey, layers);
    return layers;
  }

  
  
  
  /**
   * Resuelve la visibilidad compartida por equipo para el paso de simulación
   * actual y actualiza `enemiesSeeing` (HUD y Regeneración). No toca niebla,
   * cámaras ni copias: eso se hace una vez por render en `updateVision`.
   *
   * Se llama al terminar cada paso fijo. Así el siguiente paso y el render
   * reutilizan una foto tomada con las posiciones finales del paso anterior,
   * en vez de la del render anterior. La histéresis se conserva porque los
   * conjuntos se alternan entre `visibleByTeam` y `visibleByTeamScratch`.
   */
  private refreshCombatVisibility(): void {
    const previous = this.visibleByTeam;
    const current = this.visibleByTeamScratch;
    refreshVisibility(
      this.matchPlayers,
      previous,
      current,
      this.world.colliders,
      this.atmosphereVision
    );
    this.visibleByTeam = current;
    this.visibleByTeamScratch = previous;
    this.visionView.markRefreshed(this.simulationStep);
  }

  /**
   * Resuelve la niebla de cada vista: oculta las copias que no se ven y coloca
   * el degradado fuera de la unión de círculos del equipo. La visibilidad de
   * actores ya viene resuelta por paso; aquí solo se pinta y se sincronizan las
   * copias. La ocultación del objetivo se calcula con el terreno que pisa, no
   * con el del observador.
   */
  private updateVision(dt: number): void {
    this.visionView.update(this.hosts.vision, dt);
  }

  /**
   * Calcula qué objetos ve cada equipo y cuáles están disponibles. La
   * visibilidad se resuelve con la misma geometría que los actores (círculos de
   * visión y línea de visión, sin la ocultación del terreno). El estado de
   * disponibilidad solo se guarda para los puntos visibles: los bots no pueden
   * consultar el resto.
   *
   * Se calcula para los dos equipos, aunque uno no tenga ninguna vista humana
   * (por ejemplo, un equipo formado solo por bots).
   */
  private updatePickupKnowledge(colliders: readonly Collider[]): void {
    const pickups = this.pickups;
    if (!pickups) return;
    const previousKnowledge = this.pickupKnowledge;
    const knowledge = this.pickupKnowledgeScratch;
    for (const team of ACTIVE_TEAMS) knowledge[team].clear();
    const seenCache = this.pickupSeenScratch;
    seenCache.clear();

    const sees = (team: Team, spawn: { x: number; z: number }): boolean => {
      const pointKey = `${spawn.x}:${spawn.z}`;
      const teamKey = `${team}:${pointKey}`;
      let visible = seenCache.get(teamKey);
      if (visible === undefined) {
        // Misma regla geométrica que los actores: círculo de visión y línea de
        // visión. Los objetos no aplican la ocultación del terreno.
        visible = teamSeesPickupPoint(
          this.matchPlayers,
          team,
          spawn.x,
          spawn.z,
          colliders,
          this.atmosphereVision
        );
        seenCache.set(teamKey, visible);
        if (visible) {
          knowledge[team].set(pointKey, pickups.isAvailableAt(spawn.x, spawn.z));
        }
      }
      return visible;
    };

    pickups.forEachSpawn((spawn) => {
      for (const team of ACTIVE_TEAMS) sees(team, spawn);
    });

    this.pickupKnowledge = knowledge;
    this.pickupKnowledgeScratch = previousKnowledge;
    pickups.updateVisibility((spawn, viewIndex) => {
      const observer = this.views[viewIndex];
      return observer ? sees(observer.team, spawn) : false;
    });
  }

  
  private resolvePosition(
    self: Pick<MatchPlayerState, 'types' | 'team'>,
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

      // Santuarios de equipo: solo los Pokémon del equipo propietario pueden
      // pisarlos. El resto los trata como un muro infranqueable.
      const resolvedTeam = resolveTeamTerrain(px, pz, radius, self.team);
      if (resolvedTeam[0] !== px || resolvedTeam[1] !== pz) {
        px = resolvedTeam[0];
        pz = resolvedTeam[1];
        pushed = true;
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
    this.castDebug?.destroy();
    this.fogMesh?.destroy();
    this.fogMesh = null;
    this.menuCamera?.dispose();
    for (const asset of this.assets.values()) disposeSpriteAsset(asset);
    this.assets.clear();
    this.world?.dispose();
    clearGroundCanvasCache();
    // El manager pertenece a la aplicación: se sueltan las referencias antes
    // de destruirla para que ningún sonido tardío toque un contexto cerrado.
    disposeAudio(this.app);
    this.app.destroy();
  }
}

