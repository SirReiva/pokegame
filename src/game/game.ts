import * as pc from 'playcanvas';
import {
  ABILITIES,
  ABILITY_SLOTS,
  COMMON_ABILITIES,
  DEFAULT_COMMON_ABILITY,
  MOVESETS,
  REGENERATION_DELAY_SECONDS,
  REGENERATION_HP_PER_SECOND,
  abilityTotalTime,
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
import { aoeAreaFrom, aoeContains, aoeDistance } from './aoeGeometry';
import { assistAimDirection, type AimAssistTarget } from './aimAssist';
import { isAimAssistEnabled } from './aimAssistSettings';
import {
  defaultAoeEffect,
  type AoeEffectContext,
  type AoeEventContext,
  type AoeFallenAlly,
  type AoeHitInput,
  type AoeHitOptions,
  type AoeTarget
} from './aoeEffect';
import { Actor, actorSpriteHeight } from './actor';
import { createGameApp } from './appBootstrap';
import { CastDebugOverlay } from './castDebug';
import { buildCastPlan, frameForSegment, segmentAt } from './castPlan';
import {
  configureAudio,
  disposeAudio,
  pauseMatchMusic,
  playAbilityCast,
  playAbilityImpact,
  playArmorBlock,
  resumeMatchMusic,
  startMatchMusic,
  stopMatchMusic
} from './audio';
import {
  BotController,
  botVisionFactor,
  createBotSquad,
  type BotHazard,
  type BotWorldView
} from './bot';
import { BotNavGrid } from './botNav';
import { CameraRig } from './camera';
import {
  atmosphereFogFar,
  atmosphereIncomingMultiplier,
  atmosphereMoveMultiplier,
  atmosphereResidual,
  atmosphereShapeMultiplier,
  atmosphereSpeedMultiplier,
  atmosphereState,
  atmosphereVisionMultiplier,
  rollAtmosphere,
  type AtmosphereId,
  type AtmosphereState
} from './atmosphere';
import {
  closestPointOnCollider,
  closestPointOnSegment,
  computeDamage,
  pointBlockedByColliders,
  pointSegmentDistance,
  raycastColliderDistance,
  rollCritical,
  rollRandomFactor,
  sectorOverlapsCircle,
  segmentBlockedByColliders
} from './combat';
import { CombatFx } from './combatFx';
import type { TelegraphHandle, TelegraphOwner } from './combatFx';
import { CONFIG, DEG, RAD } from './config';
import { DamageNumbers, type DamageNumberView } from './damageNumbers';
import { DeathMarker } from './deathMarker';
import { applyHealFraction, applyHealSelf, CAST_EFFECTS } from './effects';
import { FogMask, FogView, createFogMesh, type SightOccluder, type VisionCircle } from './fog';
import { HealthBarArt, healthBarLayoutFor } from './healthBar';
import { HealthBarOverlay } from './healthBarOverlay';
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
  createGameMode,
  DEFAULT_TIME_LIMIT_SECONDS,
  KOTH_DEFAULT_RADIUS,
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
  MAX_PLAYERS,
  TEAM_INFO,
  cameraYawForTeam,
  computeSplitLayout,
  createTeamRecord,
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
import {
  BILLBOARD_ANIMATION_ORDER,
  disposeSpriteAsset,
  loadSpriteAsset,
  resolveAnimationClip,
  type SpriteAsset
} from './sprite';
import { detectSpriteBudget } from './spriteBudget';
import {
  cachedGroundCanvasAsync,
  clearGroundCanvasCache,
  groundTextureSize
} from './textures';
import {
  XP_REWARDS,
  XP_RULES,
  emptyXpBreakdown,
  xpStatus,
  type XpSource
} from './xp';
import {
  ACTIVE_TEAMS,
  TERRAINS,
  getActiveMap,
  mapRegions,
  resolveDeepWater,
  resolveTeamTerrain,
  setActiveMap,
  terrainAt,
  type GameMap,
  type Team
} from './terrain';
import { terrainSpeedEffect } from './terrainSpeed';
import { typeEffectiveness } from './typeChart';
import { DEFAULT_SKIN_ID, skinFor } from './skins';
import type { AnimationName, LoadingProgress, SpriteManifest } from './types';
import {
  effectiveVisionRange,
  lineOfSightBlocked,
  terrainConcealment,
  visionForPokemon
} from './vision';
import { buildWorldAsync, type Collider, type World } from './world';

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

/** Entradas de flanco acumuladas entre pasos de simulación. */
interface BufferedInput {
  pointerYaw: number;
  wheel: number;
  ability1: boolean;
  ability2: boolean;
  ability3: boolean;
  ability4: boolean;
  commonAbility: boolean;
}

function emptyBufferedInput(): BufferedInput {
  return {
    pointerYaw: 0,
    wheel: 0,
    ability1: false,
    ability2: false,
    ability3: false,
    ability4: false,
    commonAbility: false
  };
}

/**
 * Snapshot sin acciones de borde. Se usa en los pasos fijos posteriores al
 * primero de cada render: mantener pulsado movimiento o cámara sí se repite,
 * pero una habilidad, una muesca de rueda o un desplazamiento de ratón no
 * deben aplicarse varias veces.
 */
function heldOnlyInput(snapshot: DeviceInputSnapshot): DeviceInputSnapshot {
  return {
    ...snapshot,
    wheel: 0,
    pointerYaw: 0,
    startPressed: false,
    confirm: false,
    cancel: false,
    ability1: false,
    ability2: false,
    ability3: false,
    ability4: false,
    commonAbility: false,
    navX: 0,
    navY: 0
  };
}

/**
 * Número de daño que espera a que el render tenga hueco. La vista donde se ve
 * al objetivo se resuelve al dibujarlo, no cuando se produce el impacto.
 */
interface PendingPopup {
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
 * Área instantánea cuyo `onEnd` se retrasa hasta agotar su duración visual.
 * Las áreas `overTime` no lo necesitan: su final coincide con su retirada.
 */
interface PendingAoeEnd {
  caster: MatchPlayerState;
  def: AbilityDef;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  /** Segundos que faltan para disparar el evento. */
  remaining: number;
  /** Tiempo transcurrido desde que apareció el área. */
  elapsed: number;
}

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
  /** Buffers de círculos por vista, para poner el observador local primero. */
  private readonly viewCircles: VisionCircle[][] = [];
  /**
   * Contenedores reutilizados por `updateVision()`: crear mapas, arrays y
   * objetos de círculo cada frame generaba basura constante con 8 vistas.
   */
  private readonly visionCirclePool = new Map<number, VisionCircle>();
  private readonly visionCirclesByTeam = new Map<Team, VisionCircle[]>();
  private readonly localVisionBySlot = new Map<number, VisionCircle>();
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
  /** Último paso en el que se refrescó `visibleByTeam`; -1 antes del primero. */
  private visibilityStep = -1;
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
  /**
   * Presupuesto de píxeles del modo actual. La resolución dinámica lo escala
   * con `resolutionScale` sin tocar la lógica del juego.
   */
  private resolutionBaseline = 1.75;
  private resolutionScale = 1;
  private resolutionTimer = 0;
  private resolutionLowTime = 0;
  private resolutionHighTime = 0;
  /** Resto de tiempo real pendiente de simular (acumulador de paso fijo). */
  private simAccumulator = 0;
  /** Entradas de flanco acumuladas hasta el próximo paso de simulación. */
  private readonly bufferedInputs = new Map<string, BufferedInput>();

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
      const applied = await this.applyMap(map, (fraction, label) =>
        this.emitLoad(5 + fraction * 55, label)
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

  /**
   * Reemplaza el mundo actual por el mapa indicado. Se usa al arrancar y
   * destruye la partida anterior para no dejar entidades ni materiales del mapa
   * anterior.
   *
   * El suelo se pinta antes de tocar el mundo actual y de forma troceada, así
   * que la pestaña responde durante la generación. El mundo se construye con su
   * mapa explícito, sin depender del estado global, así que la misma ruta sirve
   * para cambiar de mapa sin recrear el motor.
   *
   * `onProgress` recibe fracciones de 0 a 1 de la generación completa (suelo y
   * mundo). El llamador decide en qué tramo de la barra cae cada fase.
   */
  private async applyMap(
    map: GameMap,
    onProgress?: (fraction: number, label: string) => void
  ): Promise<boolean> {
    const token = ++this.mapLoadToken;
    const device = this.app.graphicsDevice;
    // `mapRegions` cachea por objeto de mapa: `setActiveMap` lo reutiliza abajo
    // en vez de volver a recorrer la rejilla.
    const zones = mapRegions(map).terrain;
    const isCancelled = () => this.disposed || token !== this.mapLoadToken;

    const groundCanvas = await cachedGroundCanvasAsync(
      groundTextureSize(map, {
        maxTexels: CONFIG.performance.groundTexturePixels,
        maxSize: Math.min(device.maxTextureSize, 8192)
      }),
      { map, zones },
      {
        onProgress: (fraction) =>
          onProgress?.(fraction * 0.8, 'Generando el suelo'),
        isCancelled
      }
    );
    // Otro cambio de mapa tomó el relevo (o se destruyó el juego).
    if (!groundCanvas || isCancelled()) return false;

    // El mundo nuevo se construye por secciones, con su mapa explícito y en una
    // raíz aparte: el mapa anterior sigue visible y respondiendo mientras tanto,
    // y el estado global del terreno todavía describe el mapa viejo.
    const world = await buildWorldAsync(
      this.app,
      { map, groundCanvas },
      {
        onProgress: (fraction) =>
          onProgress?.(0.8 + fraction * 0.2, 'Construyendo el escenario'),
        isCancelled
      }
    );
    if (!world || this.disposed || token !== this.mapLoadToken) {
      world?.dispose();
      return false;
    }

    this.clearMatch();
    this.pickups?.dispose();
    this.pickups = null;
    this.menuCamera?.dispose();
    this.world?.dispose();

    // Solo ahora, con el mundo nuevo ya construido, se activa el mapa. Así
    // ningún frame intermedio ve el terreno del mapa nuevo bajo la geometría
    // del anterior. `setActiveMap` reutiliza las regiones ya cacheadas.
    setActiveMap(map);
    syncTeamsWithMap();

    this.atmosphere = 'clear';
    this.atmosphereVision = 1;
    this.atmosphereTick = 0;
    this.world = world;
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
    this.menuFocus = { x: map.spawn.x, z: map.spawn.z };
    this.menuCamera = new CameraRig(this.app, map.spawn);
    this.refreshSunShadows();
    // Primer render del mundo mientras la pantalla de carga sigue visible. El
    // primer frame de un mundo nuevo compila los shaders de sus materiales y
    // sube sus texturas a la GPU; en software se ha medido ~300 ms, y si la
    // carga termina después de la intro, ese tirón caía al empezar la partida.
    // Hacerlo aquí lo deja detrás del overlay y deja el primer frame jugable
    // limpio. Es un render extra, no un cambio de lógica.
    if (!this.disposed) this.app.render();
    return true;
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
    for (const view of this.views) view.camera.setFarClip(far);
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
   * Daño residual de arena y granizo. Se aplica cada `interval` segundos a los
   * Pokémon vivos que no sean inmunes, nunca por debajo de 1 PV: el clima no
   * puede dar KOs ni robar la puntuación de una pelea.
   */
  private updateAtmosphere(dt: number): void {
    const residual = atmosphereResidual(this.atmosphere);
    if (!residual || this.matchOver) return;
    this.atmosphereTick += dt;
    if (this.atmosphereTick < residual.interval) return;
    this.atmosphereTick -= residual.interval;

    let changed = false;
    for (const player of this.matchPlayers) {
      if (!player.alive || player.invulnerableTimer > 0 || player.hp <= 1) continue;
      if (player.types.some((type) => residual.immuneTypes.includes(type))) continue;
      const amount = Math.min(
        player.hp - 1,
        Math.max(1, Math.round(player.maxHp * residual.fraction))
      );
      if (amount <= 0) continue;
      player.hp -= amount;
      player.damageTaken += amount;
      player.hurtTimer = Math.max(player.hurtTimer, 0.18);
      this.showDamagePopup(player, amount, false, 1, false, null);
      this.vibrateOnDamage(player, amount);
      changed = true;
    }
    if (changed) this.emitMatchStats();
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
      (config) => !this.assetFor(config.pokemonId, config.skinId)
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
    const objectives = this.resolveObjectiveZones();
    this.objectiveZone = objectives[0] ?? {
      x: 0,
      z: 0,
      radius: KOTH_DEFAULT_RADIUS
    };
    this.gameMode = createGameMode({
      modeId: this.gameModeId,
      settings: this.modeSettings,
      objective: this.objectiveZone,
      objectives
    });
    // El clima se sortea una vez por partida y se mantiene hasta el final.
    // Si el lobby desactiva los cambios atmosféricos, siempre se juega en
    // despejado y no se aplica ningún efecto de combate.
    this.setAtmosphere(this.atmosphereEnabled ? rollAtmosphere() : 'clear');
    startMatchMusic();
    this.statsTimer = 0;
    this.fps = 0;
    this.countdown = MATCH_COUNTDOWN_SECONDS;
    this.countdownGo = 0;
    this.countdownShown = MATCH_COUNTDOWN_SECONDS;
    this.callbacks.onCountdown(MATCH_COUNTDOWN_SECONDS);
    this.menuCamera.setEnabled(false);
    this.setResolutionBaseline(
      Math.min(window.devicePixelRatio || 1, humanConfigs.length > 4 ? 1.2 : 1.5)
    );

    const layout = computeSplitLayout(humanConfigs.length);
    const hasBots = valid.some((config) => config.isBot);
    const botNav = hasBots ? new BotNavGrid(this.world.colliders) : null;
    const botSquad = hasBots ? createBotSquad() : null;
    this.botNav = botNav;
    const teamIndex: Record<Team, number> = createTeamRecord(() => 0);
    let viewIndex = 0;

    valid.forEach((config) => {
      const asset = this.assetFor(config.pokemonId, config.skinId);
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
      if (!isBot) {
        const layerComposition = this.app.scene.layers;
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
        this.viewLayers.push(layer);
        this.viewSkyLayers.push(skyLayer);
      }

      const camera = new CameraRig(this.app, spawnPoint);
      if (layer && skyLayer) {
        const skyboxId = this.app.scene.layers.getLayerByName('Skybox')?.id;
        const viewBaseLayers = this.baseCameraLayers.filter(
          (id) => id !== skyboxId
        );
        camera.setViewport(layout[currentView]);
        camera.setLayers([...viewBaseLayers, layer.id, skyLayer.id]);
        camera.setEnabled(true);
        this.viewSkies.set(
          camera,
          this.createViewSky(skyLayer.id, currentView, camera)
        );
      } else {
        // Los bots conservan una cámara deshabilitada porque `stepPlayer` usa
        // su yaw para convertir la entrada en movimiento relativo.
        camera.setEnabled(false);
      }
      camera.yaw = cameraYawForTeam(config.team, spawnPoint.x, spawnPoint.z);
      camera.distance =
        CONFIG.camera.distance * (humanConfigs.length > 2 ? 1.12 : 1);

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
        camera,
        copies: [],
        bar,
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
      this.matchPlayers.push(player);
      this.playerBySlot.set(player.slot, player);

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
        const mask = this.ensureFogMask(config.team);
        this.fogViews.push(
          new FogView(
            this.app.graphicsDevice,
            this.ensureFogMesh(),
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
    this.matchPlayers.forEach((player) => {
      const asset = this.assetFor(player.pokemonId, player.skinId);
      if (!asset) return;
      this.views.forEach((viewer, viewIndex) => {
        const copy = new Actor(
          this.app,
          asset,
          this.world.shadowMaterial,
          { x: player.x, z: player.z },
          player.facing,
          // Solo la copia del dueño lleva anillo de rumbo. Antes lo llevaban
          // todas (también los rivales), lo que añadía un draw call y una
          // textura por copia sin aportar información nueva.
          viewer.slot === player.slot,
          viewer.slot === player.slot,
          TEAM_INFO[player.team].accent,
          // Solo el Pokémon que controla este viewport va sin contorno.
          viewer.slot !== player.slot,
          player.hitRadius,
          // Las capas de animación se crean por tandas durante la cuenta atrás.
          true
        );
        const layer = this.viewLayers[viewIndex];
        if (layer) copy.setLayer(layer.id);
        copy.play('idle');
        player.copies.push(copy);
      });
    });

    // Calienta primero el idle de todas las copias y después los clips
    // secundarios: así los cuerpos aparecen durante la cuenta atrás y los
    // materiales de ataque no provocan un tirón en el primer casteo.
    this.prewarmTasks = [];
    for (const animation of BILLBOARD_ANIMATION_ORDER) {
      for (const player of this.matchPlayers) {
        for (const copy of player.copies) {
          this.prewarmTasks.push({ actor: copy, animation });
        }
      }
    }
    this.prewarmIndex = 0;

    // Cada vista humana ya ha creado la máscara de niebla de su equipo en el
    // bucle anterior. La visibilidad de actores y objetos no usa la máscara, así
    // que un equipo sin vistas humanas no necesita ninguna.

    // Copias de los objetos por viewport: cada una vive en la capa de su vista
    // y se muestra únicamente cuando el equipo de esa vista ve el objeto.
    this.pickups?.setViewLayers(this.viewLayers.map((layer) => layer.id));
    this.updateViewFarClip();

    // Con sombras del sol activas, el encuadre depende de la cámara: se
    // rehornean al empezar para cubrir las bases de ambos equipos.
    this.refreshSunShadows();

    // Deja una primera foto de visibilidad para la cuenta atrás y para el
    // primer paso de simulación, antes de que exista ningún render.
    this.refreshCombatVisibility();

    this.spawnObjectiveMarker();
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
    this.setResolutionBaseline(Math.min(window.devicePixelRatio || 1, 1.75));
    this.menuCamera.setEnabled(true);
    this.refreshSunShadows();
    this.clearAtmosphere();
    this.callbacks.onMatchStats([]);
    this.callbacks.onCountdown(null);
  }

  private clearMatch(): void {
    for (const projectile of this.projectiles) projectile.visual.destroy();
    this.projectiles = [];
    this.activeAoes = [];
    this.pendingAoeEnds = [];
    this.pendingMeleeHits = [];
    this.queuedCasts = [];
    this.pendingInstantHits = [];
    this.combatFx.clear();
    this.damageNumbers.clear();
    this.pendingPopups.length = 0;
    this.objectiveMarker?.destroy();
    this.objectiveMarker = null;
    this.objectiveMarkerTeam = undefined;
    this.gameMode = null;
    this.objectiveZone = null;
    this.teamScores = createTeamRecord(() => 0);
    this.killFeed = [];
    this.killFeedSeq = 0;
    this.matchElapsed = 0;
    this.simAccumulator = 0;
    this.bufferedInputs.clear();
    this.matchOver = false;
    this.winner = null;
    this.countdown = 0;
    this.countdownGo = 0;
    this.countdownShown = null;

    this.pickups?.clearViewLayers();

    for (const fog of this.fogViews) fog.destroy();
    this.fogViews = [];
    // Las vistas comparten esta malla. Al destruir sus instancias, PlayCanvas
    // libera la malla cuando se queda sin referencias, así que no se puede
    // conservar para la revancha: se recrea al empezar la siguiente partida.
    this.fogMesh?.destroy();
    this.fogMesh = null;
    for (const mask of this.fogMasks.values()) mask.destroy();
    this.fogMasks.clear();
    this.viewCircles.length = 0;
    this.visionCirclePool.clear();
    for (const circles of this.visionCirclesByTeam.values()) circles.length = 0;
    this.localVisionBySlot.clear();
    this.visibleByTeam = createTeamRecord(() => new Set<number>());
    this.visibleByTeamScratch = createTeamRecord(() => new Set<number>());
    this.simulationStep = 0;
    this.visibilityStep = -1;
    this.pickupKnowledge = createTeamRecord(() => new Map<string, boolean>());
    this.pickupKnowledgeScratch = createTeamRecord(
      () => new Map<string, boolean>()
    );
    this.pickupSeenScratch.clear();

    for (const markers of this.deathMarkers.values()) {
      for (const marker of markers) marker?.destroy();
    }
    this.deathMarkers.clear();

    for (const sky of this.viewSkies.values()) sky.destroy();
    this.viewSkies.clear();
    for (const layer of this.viewSkyLayers) this.app.scene.layers.remove(layer);
    this.viewSkyLayers.length = 0;

    for (const player of this.matchPlayers) {
      for (const copy of player.copies) copy.destroy();
      player.copies = [];
      player.bar.dispose();
      player.camera.dispose();
    }
    for (const layer of this.viewLayers) this.app.scene.layers.remove(layer);
    this.matchPlayers = [];
    this.playerBySlot.clear();
    this.views = [];
    this.bots.clear();
    this.botNav = null;
    this.viewLayers = [];
    this.prewarmTasks = [];
    this.prewarmIndex = 0;
    this.healthBars.clear();
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
    this.bufferedInputs.clear();
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
      for (const copy of player.copies) copy.play('idle');
    }
  }

  /**
   * Fija el presupuesto de píxeles del modo actual y reinicia la escala
   * dinámica. El menú usa más resolución que una partida de 5-8 vistas.
   */
  private setResolutionBaseline(baseline: number): void {
    this.resolutionBaseline = baseline;
    this.resolutionScale = 1;
    this.resolutionTimer = 0;
    this.resolutionLowTime = 0;
    this.resolutionHighTime = 0;
    this.applyResolution();
  }

  /**
   * Aplica la escala actual. `maxPixelRatio` solo se usa en el próximo
   * `resizeCanvas`, así que hay que forzar el recálculo del canvas.
   */
  private applyResolution(): void {
    const device = this.app.graphicsDevice;
    const ratio = this.resolutionBaseline * this.resolutionScale;
    if (Math.abs(device.maxPixelRatio - ratio) < 0.001) return;
    device.maxPixelRatio = ratio;
    this.app.updateCanvasSize();
  }

  /**
   * Ajusta la resolución interna según el FPS con histéresis. No cambia nada
   * de la simulación ni de los efectos: solo el número de píxeles que dibuja
   * la GPU. Las subidas son más lentas que las bajadas para no oscilar.
   */
  private updateDynamicResolution(dt: number): void {
    const settings = CONFIG.performance.dynamicResolution;
    if (!settings.enabled) return;

    this.resolutionTimer += dt;
    if (this.resolutionTimer < settings.sampleSeconds) return;
    this.resolutionTimer = 0;

    if (this.fps < settings.lowerFps) {
      this.resolutionHighTime = 0;
      this.resolutionLowTime += settings.sampleSeconds;
      if (
        this.resolutionLowTime >= settings.lowerDelay &&
        this.resolutionScale > settings.minScale + 0.001
      ) {
        this.resolutionScale = Math.max(
          settings.minScale,
          this.resolutionScale - settings.step
        );
        this.applyResolution();
        this.resolutionLowTime = 0;
      }
      return;
    }

    if (this.fps > settings.raiseFps) {
      this.resolutionLowTime = 0;
      this.resolutionHighTime += settings.sampleSeconds;
      if (
        this.resolutionHighTime >= settings.raiseDelay &&
        this.resolutionScale < 1 - 0.001
      ) {
        this.resolutionScale = Math.min(1, this.resolutionScale + settings.step);
        this.applyResolution();
        this.resolutionHighTime = 0;
      }
      return;
    }

    this.resolutionLowTime = 0;
    this.resolutionHighTime = 0;
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
      this.updateDynamicResolution(frameDt);
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

  /**
   * Resume los peligros ya lanzados para la IA: proyectiles en vuelo y áreas
   * persistentes que siguen haciendo daño. El bot no necesita el `AbilityDef`
   * completo, solo su posición, radio y tiempo de vida para apartarse a tiempo.
   */
  private buildBotHazards(): BotHazard[] {
    const hazards: BotHazard[] = [];
    for (const projectile of this.projectiles) {
      if (projectile.def.power <= 0 && projectile.def.slow === null) continue;
      const speed = Math.hypot(projectile.vx, projectile.vz);
      const remainingDistance = Math.max(
        0,
        projectile.def.range - projectile.traveled
      );
      hazards.push({
        kind: 'projectile',
        x: projectile.x,
        z: projectile.z,
        radius: Math.max(0.05, projectile.def.radius),
        vx: projectile.vx,
        vz: projectile.vz,
        remaining: speed > 0.0001 ? remainingDistance / speed : 0,
        ownerTeam: projectile.owner.team
      });
    }
    for (const aoe of this.activeAoes) {
      if (aoe.def.power <= 0 && aoe.def.slow === null) continue;
      hazards.push({
        kind: 'aoe',
        x: aoe.x,
        z: aoe.z,
        // El motor compara contra el hurtbox mayor del roster, igual que el
        // aro visual; el bot suma después su propio `hitRadius`.
        radius: aoe.radius + maxHitRadius(),
        shape: aoe.shape,
        dirX: aoe.dirX,
        dirZ: aoe.dirZ,
        halfAngle: aoe.halfAngle,
        remaining: Math.max(0, aoe.duration - aoe.elapsed),
        ownerTeam: aoe.owner.team
      });
    }
    return hazards;
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
      this.bufferHumanInputs(frame);
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

    // Diagnóstico: con los actores ocultos se aísla si el artefacto viene de
    // los sprites o del mundo.
    if (this.debugHideActors) {
      for (const player of this.matchPlayers) {
        for (const copy of player.copies) copy.setVisible(false);
      }
    }

    // Primero las cámaras ya están actualizadas; cada copia se orienta hacia
    // la cámara del viewport que la va a dibujar.
    this.views.forEach((cameraOwner, viewIndex) => {
      const cameraPosition = cameraOwner.camera.position;
      this.viewSkies.get(cameraOwner.camera)?.setPosition(cameraPosition);
      this.matchPlayers.forEach((player) => {
        const copy = player.copies[viewIndex];
        // Una copia oculta no se renderiza; su estado se sincroniza en cuanto
        // `updateVision` vuelve a mostrarla.
        if (!copy || !copy.isVisible) return;
        copy.setPositionAndSubmerge(
          player.x,
          player.z,
          player.submerge,
          this.world.waterHeight
        );
        copy.setFacing(player.facing);
        if (player.animationFrame !== null) {
          // El plan de casteo fija el frame; todas las vistas dibujan el mismo.
          copy.setManualFrame(player.animation, player.animationFrame);
        } else {
          copy.clearManual();
          copy.play(player.animation);
          copy.setPlayback(player.playback);
          copy.setLoop(true);
        }
        copy.setHitboxDebug(CONFIG.debug.showHitboxes);
        copy.update(dt, cameraPosition);
      });
      // El retrato de la marca de KO se mantiene de pie en cada vista aunque
      // la cámara orbite alrededor del cuerpo. El centro muestra los segundos
      // que faltan para que el Pokémon vuelva a la vida.
      this.deathMarkers.forEach((markers, slot) => {
        const marker = markers[viewIndex];
        if (!marker) return;
        marker.faceCamera(cameraPosition);
        const target = this.playerBySlot.get(slot);
        if (target) marker.setRespawnCountdown(target.respawnTimer);
      });
    });

    // La barra es única por jugador: se actualiza una vez por frame, no una vez
    // por copia, y el overlay la proyecta después en cada viewport.
    for (const player of this.matchPlayers) {
      const xp = xpStatus(player.xp);
      player.bar.setFraction(player.alive ? player.hp / player.maxHp : 0);
      player.bar.setLevel(xp.level);
      player.bar.setXpFraction(xp.progress);
      player.bar.setArmorFraction(
        this.activeCastArmor(player) / Math.max(1, player.maxHp)
      );
    }
    if (!this.debugHideBars) {
      this.healthBars.render(this.views, this.matchPlayers);
    }
    if (!frozen && simulated > 0) {
      this.updateRegeneration(simulated);
      this.updateParticipation(simulated);
    }

    this.world.update(dt);
    // Una sola lista de posiciones de cámara por frame: la usan los objetos.
    this.viewCameraPositions.length = 0;
    for (const view of this.views) {
      this.viewCameraPositions.push(view.camera.position);
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
   * Acumula las pulsaciones de borde de los jugadores humanos hasta el próximo
   * paso de simulación. Se ejecuta una vez por render, no por paso.
   */
  private bufferHumanInputs(frame: InputFrame): void {
    for (const player of this.views) {
      const snapshot = frame.snapshots.get(player.deviceId) ?? IDLE_INPUT;
      const buffered =
        this.bufferedInputs.get(player.deviceId) ?? emptyBufferedInput();
      buffered.pointerYaw += snapshot.pointerYaw;
      buffered.wheel += snapshot.wheel;
      buffered.ability1 ||= snapshot.ability1;
      buffered.ability2 ||= snapshot.ability2;
      buffered.ability3 ||= snapshot.ability3;
      buffered.ability4 ||= snapshot.ability4;
      buffered.commonAbility ||= snapshot.commonAbility;
      this.bufferedInputs.set(player.deviceId, buffered);
    }
  }

  /**
   * Input efectivo de un humano en un paso fijo. El primer paso del render
   * consume los flancos acumulados; los siguientes solo repiten los ejes
   * mantenidos (movimiento, cámara y zoom).
   */
  private humanStepInput(
    player: MatchPlayerState,
    frame: InputFrame,
    firstStep: boolean
  ): DeviceInputSnapshot {
    const snapshot = frame.snapshots.get(player.deviceId) ?? IDLE_INPUT;
    if (!firstStep) return heldOnlyInput(snapshot);
    const buffered = this.bufferedInputs.get(player.deviceId);
    if (!buffered) return snapshot;
    const input: DeviceInputSnapshot = {
      ...snapshot,
      pointerYaw: buffered.pointerYaw,
      wheel: buffered.wheel,
      startPressed: false,
      confirm: false,
      cancel: false,
      ability1: buffered.ability1,
      ability2: buffered.ability2,
      ability3: buffered.ability3,
      ability4: buffered.ability4,
      commonAbility: buffered.commonAbility,
      navX: 0,
      navY: 0
    };
    this.bufferedInputs.set(player.deviceId, emptyBufferedInput());
    return input;
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
      this.bots.size > 0 ? this.buildBotHazards() : [];
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
        : this.humanStepInput(player, frame, firstStep);
      this.stepPlayer(player, input, stepDt);
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
    if (!this.matchOver) this.updateAtmosphere(stepDt);

    // Cada fase puede cerrar la partida; el resto no debe ejecutarse en el
    // mismo paso. El orden es fijo y reproducible: casts instantáneos (haces y
    // áreas sin retardo) → golpes de dash → melee → proyectiles → áreas.
    if (!this.matchOver) {
      this.resolveQueuedCasts();
      if (!this.matchOver) this.resolveInstantHits();
      if (!this.matchOver) this.resolveMeleeHits();
      if (!this.matchOver) this.updateProjectiles(stepDt);
      if (!this.matchOver) this.updateActiveAoes(stepDt);
      if (!this.matchOver) this.updatePendingAoeEnds(stepDt);
      if (!this.matchOver) this.pickups?.collect(this.matchPlayers, this.pickupHandlers);
    }

    // La visibilidad del siguiente paso debe reflejar las posiciones finales
    // de este, no las del render anterior. El render reutilizará esta foto.
    this.refreshCombatVisibility();
  }

  private stepPlayer(player: MatchPlayerState, input: DeviceInputSnapshot, dt: number): void {
    // Temporizadores de combate: corren también mientras el jugador está KO.
    for (let index = 0; index < player.cooldowns.length; index++) {
      player.cooldowns[index] = Math.max(0, player.cooldowns[index] - dt);
    }
    for (const buff of player.buffs) buff.duration -= dt;
    // Compactar en sitio: filtrar creaba un array nuevo por jugador y paso
    // (60 Hz × 8 jugadores) aunque no hubiera nada que expirar.
    let buffCount = 0;
    for (const buff of player.buffs) {
      if (buff.duration > 0) player.buffs[buffCount++] = buff;
    }
    player.buffs.length = buffCount;
    if (player.slowEffects.length > 0) {
      for (const effect of player.slowEffects) effect.remaining -= dt;
      let slowCount = 0;
      for (const effect of player.slowEffects) {
        if (effect.remaining > 0) player.slowEffects[slowCount++] = effect;
      }
      player.slowEffects.length = slowCount;
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
      player.animationFrame = null;
      const terrain = terrainAt(player.x, player.z);
      player.terrain = terrain;
      player.concealment = terrainConcealment(terrain, player.types);
      this.updateCamera(player, input, dt);
      return;
    }

    // Un casteo bloquea movimiento y otras habilidades mientras se reproduce.
    if (this.stepActiveCast(player, input, dt)) return;

    // Un dash consume el frame: no se mezcla con el movimiento normal.
    if (this.stepDash(player, input, dt)) return;

    const yaw = player.camera.yaw;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    // En el modo táctico el cuerpo no gira hacia la entrada: mira siempre hacia
    // donde apunta la cámara y el stick se interpreta como avance/retroceso
    // (eje Y) más desplazamiento lateral (eje X). Es una elección por jugador
    // hecha en el lobby. Los bots usan el modo normal porque su IA deriva el
    // apuntado del movimiento.
    const tactical = !player.isBot && player.movementMode === 'tactical';

    // El bloqueo de movimiento lo consume `stepActiveCast`: si el casteo está
    // en startup o en la ventana activa de una melee, este bloque no se ejecuta.
    const moveX = input.moveX;
    const moveY = input.moveY;
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
      atmosphereSpeedMultiplier(this.atmosphere, player.types) *
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
      // por un rumbo intermedio si hace falta girar poco a poco. El modo
      // táctico no interpola: el desplazamiento lateral debe ser inmediato y
      // no arrastrar el rumbo anterior, que es el de la cámara.
      let headingX = dirX;
      let headingZ = dirZ;

      if (!tactical && currentSpeed > 0.0001) {
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
    if (!tactical && speed > CONFIG.player.minFacingSpeed) {
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
      player.animationFrame = null;
    } else if (player.animationFrame !== null) {
      // El plan de casteo manda. Si el startup permite moverse y el Pokémon
      // anda, el caminar tiene prioridad para no deslizar.
      const cast = player.activeCast;
      if (
        cast?.def.moveWhileStartup &&
        cast.elapsed < cast.def.startup &&
        speed > CONFIG.player.minFacingSpeed
      ) {
        player.animation = 'walk';
        player.playback = clamp(
          speed / CONFIG.sprite.walkRateRefSpeed,
          CONFIG.sprite.walkRateMin,
          CONFIG.sprite.walkRateMax
        );
        player.animationFrame = null;
      }
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

    // Modo táctico: girar la cámara también gira al Pokémon. `camera.yaw`
    // coloca la cámara alrededor del objetivo, así que la mirada va del punto
    // de vista hacia el jugador: (-sin yaw, -cos yaw).
    if (!player.isBot && player.movementMode === 'tactical') {
      player.facing = Math.atan2(
        -Math.sin(player.camera.yaw),
        -Math.cos(player.camera.yaw)
      );
    }
  }

  /**
   * Avanza el casteo activo: reloj, disparo único del efecto y presentación.
   * El efecto ocurre en `startup`; la animación ya está en su `HitFrame` en ese
   * instante. Devuelve `true` si el casteo bloquea el movimiento este frame.
   */
  private stepActiveCast(
    player: MatchPlayerState,
    input: DeviceInputSnapshot,
    dt: number
  ): boolean {
    if (this.matchOver) return true;
    const cast = player.activeCast;
    if (!cast) return false;

    cast.elapsed += dt;

    // Las áreas que declaran `aoePrepareMovement` recalculan su centro durante la
    // preparación: el aviso del suelo sigue el punto que devuelve la función
    // (por ejemplo, el propio lanzador si se mueve con `moveWhileStartup`).
    if (!cast.fired && cast.def.aoePrepareMovement && cast.def.shape === 'aoe') {
      const next = cast.def.aoePrepareMovement({
        caster: player,
        def: cast.def,
        originX: cast.originX,
        originZ: cast.originZ,
        dirX: cast.dirX,
        dirZ: cast.dirZ,
        duration: cast.def.startup,
        elapsed: cast.elapsed
      });
      cast.targetX = next.x;
      cast.targetZ = next.z;
      cast.marker?.setCenter?.(next.x, next.z);
    }

    // Efecto: una sola vez, al llegar al instante de impacto/lanzamiento.
    if (!cast.fired && cast.elapsed >= cast.effectAt) {
      cast.fired = true;
      this.queueCast(
        player,
        cast.def,
        cast.targetX,
        cast.targetZ,
        cast.marker,
        cast.dirX,
        cast.dirZ,
        cast
      );
      this.armHitFrame(player, cast);
    }

    this.applyCastPresentation(player, cast);

    const terrain = terrainAt(player.x, player.z);
    player.terrain = terrain;
    const castTerrainEffect = terrainSpeedEffect(terrain, player.types);
    player.terrainMultiplier = castTerrainEffect.multiplier;
    player.terrainSpeedReason = castTerrainEffect.reason;
    player.concealment = terrainConcealment(terrain, player.types);

    if (cast.elapsed >= cast.plan.endAt) {
      // Si el impacto forzado aún tiene frames pendientes, se deja vivo un
      // frame más para que se dibuje. Se limpiará en la siguiente pasada.
      if (cast.forcedFrames > 0) {
        cast.elapsed = cast.plan.endAt - 1e-4;
      } else {
        // La marca y el carril se autodestruyen al terminar su propio efecto.
        if (cast.hiddenCaster) player.hidden = false;
        if (cast.invulnerableCaster) player.invulnerableTimer = 0;
        cast.armorFx?.destroy();
        cast.armorFx = null;
        player.activeCast = null;
        player.animationFrame = null;
        return false;
      }
    }

    // Movimiento: bloqueado durante el startup (salvo `moveWhileStartup`) y
    // durante la ventana activa de las melee. `blockMovementDuringCast` clava
    // al lanzador durante todo el casteo, recuperación incluida.
    // `blockMovementUntilEndAnimation` clava al lanzador hasta que termina de
    // reproducirse el clip de lanzamiento. El dash mueve por su cuenta.
    const animationLocked =
      cast.def.blockMovementUntilEndAnimation &&
      cast.def.shape !== 'dash' &&
      cast.elapsed < cast.plan.animationEndAt;
    const castLocked =
      cast.def.blockMovementDuringCast ||
      animationLocked ||
      (cast.elapsed < cast.def.startup && !cast.def.moveWhileStartup) ||
      (cast.def.shape === 'melee' && cast.elapsed < cast.plan.activeEnd);
    if (castLocked) {
      player.vx = 0;
      player.vz = 0;
      this.updateCamera(player, input, dt);
      return true;
    }
    return false;
  }

  /**
   * Fuerza la pose de impacto durante un par de frames de render. Evita que un
   * `dt` grande (un tirón) salte del frame anterior al posterior al `HitFrame`
   * sin dibujarlo. No se aplica al dash: allí el golpe es un barrido continuo.
   */
  private armHitFrame(player: MatchPlayerState, cast: ActiveCast): void {
    if (cast.def.shape === 'dash') return;
    if (cast.plan.hitClip === null || cast.plan.hitFrame === null) return;
    // Si la presentación normal ya cae en el HitFrame, no hace falta forzar:
    // el frame se dibuja igualmente. Solo se fuerza cuando el salto de `dt`
    // ya lo ha rebasado (o ha caído en un hueco).
    const asset = this.assetFor(player.pokemonId, player.skinId);
    const segment = segmentAt(cast.plan, cast.elapsed);
    const clip = segment ? asset?.skin.animations[segment.animation] : null;
    const normalFrame =
      segment && clip ? frameForSegment(segment, clip, cast.elapsed) : null;
    if (normalFrame === cast.plan.hitFrame) return;
    cast.forcedAnimation = cast.plan.hitClip;
    cast.forcedFrame = cast.plan.hitFrame;
    cast.forcedFrames = 2;
  }

  /** Selecciona el frame del plan de casteo para el instante actual. */
  private applyCastPresentation(
    player: MatchPlayerState,
    cast: ActiveCast
  ): void {
    const asset = this.assetFor(player.pokemonId, player.skinId);

    // Salto de `dt`: mantén la pose de impacto aunque el reloj ya la haya
    // rebasado. Sin esto, el efecto se dispara pero el frame nunca se ve.
    if (
      cast.forcedFrames > 0 &&
      cast.forcedAnimation !== null &&
      cast.forcedFrame !== null
    ) {
      const forcedClip = asset?.skin.animations[cast.forcedAnimation];
      if (forcedClip) {
        player.animation = cast.forcedAnimation;
        player.animationFrame = Math.max(
          0,
          Math.min(forcedClip.columns - 1, cast.forcedFrame)
        );
        player.playback = 1;
        return;
      }
    }

    const segment = segmentAt(cast.plan, cast.elapsed);
    if (!segment) {
      player.animationFrame = null;
      player.animation = 'idle';
      player.playback = 1;
      return;
    }
    const clip = asset?.skin.animations[segment.animation];
    if (!clip) {
      player.animationFrame = null;
      player.animation = 'idle';
      player.playback = 1;
      return;
    }
    player.animation = segment.animation;
    player.animationFrame = frameForSegment(segment, clip, cast.elapsed);
    player.playback = 1;
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

  /**
   * Avanza un dash activo. El desplazamiento se reparte durante la animación
   * (QuickStrike) para que se vea el salto, en vez de teletransportar al actor.
   * Devuelve `true` si este frame lo ha consumido el dash.
   */
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
      // El obstáculo cortó el desplazamiento: recorta también su animación.
      this.syncDashCast(player, dash.elapsed);
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
      this.syncDashCast(player, Math.min(dash.elapsed, dash.duration));
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
        this.showHealPopup(player, healed, player);
      }
      if (player.hp >= player.maxHp) player.regenerating = false;
    }
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
    this.breakRegen(player);
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
      this.emitAoeEvent('start', player, def, targetX, targetZ, dirX, dirZ, 0);
    }

    // Startup cero: el efecto se resuelve en la fase común de este mismo frame.
    if (plan.effectAt <= 0) {
      cast.fired = true;
      this.queueCast(player, def, targetX, targetZ, marker, dirX, dirZ, cast);
      this.armHitFrame(player, cast);
    }

    this.applyCastPresentation(player, cast);
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
        this.applyAbilityDamage(attacker, target, ability, options),
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
      resolveAoeHit: (hit) => this.resolveAoeHit(hit),
      emitAoeEvent: (phase, source, ability, x, z, eventDirX, eventDirZ, elapsed) =>
        this.emitAoeEvent(
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
    this.applyCastPresentation(player, cast);
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
      if (!this.observerSeesActor(player, target, false, colliders)) continue;
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
   * Control de un golpe que conecta: puede cancelar dash/preparación, aplicar
   * hitstun y empujar. Lo comparten las habilidades dañinas y las de estado: en
   * ambos casos el objetivo ha recibido un impacto válido. El empuje sale de
   * `sourceX/sourceZ` (punto de entrada del proyectil o centro del área); sin
   * origen explícito, del atacante.
   *
   * Devuelve `true` si la armadura del casteo absorbió el golpe: en ese caso no
   * hay cancelación, hitstun ni empuje, solo daño.
   */
  private applyHitControl(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    options: {
      cancel: boolean;
      hitstun: number;
      knockback: number;
      /** Daño final del golpe; decide si la armadura del casteo lo absorbe. */
      damage: number;
      /** El golpe mata al objetivo; interrumpir no debe reembolsar cooldown. */
      lethal?: boolean;
      /** Estado o control duro: ignora la armadura del casteo. */
      force?: boolean;
      sourceX?: number;
      sourceZ?: number;
    }
  ): boolean {
    const cast = target.activeCast;
    // `blockMovementDuringCast` convierte el casteo en una canalización: el
    // lanzador queda clavado y cualquier impacto la corta. Esto incluye los
    // ticks de áreas persistentes, que por lo demás no aplican control.
    const channeling = cast?.def.blockMovementDuringCast === true;
    const armor = this.activeCastArmor(target);
    const armorActive = armor > 0;
    const wouldInterrupt = options.cancel || channeling;
    // La armadura absorbe el golpe mientras le quede pozo. Los estados, el
    // control explícito y los golpes letales pasan por encima: son el contador
    // del setup. El daño no se mitiga, solo consume armadura.
    const absorbed =
      wouldInterrupt &&
      armorActive &&
      options.force !== true &&
      options.lethal !== true &&
      options.damage < armor;

    if (armorActive && wouldInterrupt) {
      if (absorbed && cast) {
        cast.armorRemaining = Math.max(0, armor - options.damage);
      }
      this.spawnArmorFeedback(target, !absorbed);
    }
    if (wouldInterrupt && !absorbed) {
      this.interruptWithRefund(target, options.lethal === true);
    }
    if (!absorbed) {
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
    return absorbed;
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
   * propio lanzador), los aliados caídos y los servicios de golpe. Lo usan
   * tanto los ticks de `aoeEffect` como los eventos `onStart`/`onCast`/`onEnd`.
   */
  private buildAoeContext(hit: AoeHitInput): AoeEffectContext {
    const targets: AoeTarget[] = [];
    const fallenAllies: AoeFallenAlly[] = [];
    // El círculo usa `radius` alrededor del centro; el cono usa la misma prueba
    // de sector que el melee desde ese centro hacia delante. La comprobación y
    // la telegrafía comparten `maxHitRadius()`, así que el borde dibujado es
    // siempre el primer punto de contacto real.
    const area = aoeAreaFrom(hit.def, hit.x, hit.z, hit.dirX, hit.dirZ);
    const hitPadding = maxHitRadius();
    for (const player of this.matchPlayers) {
      if (!player.alive) {
        // Los aliados caídos siguen en el punto del KO hasta reaparecer: son
        // los únicos revivibles por un área.
        if (player.team !== hit.owner.team) continue;
        if (!aoeContains(area, player.x, player.z, player.hitRadius, hitPadding)) {
          continue;
        }
        const distance = aoeDistance(area, player.x, player.z);
        fallenAllies.push({
          player,
          distance,
          lineOfSight: !segmentBlockedByColliders(
            area.x,
            area.z,
            player.x,
            player.z,
            this.world.colliders
          )
        });
        continue;
      }
      if (!aoeContains(area, player.x, player.z, player.hitRadius, hitPadding)) {
        continue;
      }
      const distance = aoeDistance(area, player.x, player.z);
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
          area.x,
          area.z,
          player.x,
          player.z,
          this.world.colliders
        ),
        hittable: this.canHit(hit.owner, player)
      });
    }

    return {
      caster: hit.owner,
      def: hit.def,
      x: hit.x,
      z: hit.z,
      radius: hit.radius,
      shape: hit.shape,
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
        this.reviveAoeAlly(target, fraction, hit.def, hit.owner),
      isMatchOver: () => this.matchOver
    };
  }

  /** Resuelve un golpe o tick del área con el `aoeEffect` de la habilidad. */
  private resolveAoeHit(hit: AoeHitInput): void {
    (hit.def.aoeEffect ?? defaultAoeEffect)(this.buildAoeContext(hit));
  }

  /**
   * Dispara un evento del ciclo de vida del área (`onStart`, `onCast` o
   * `onEnd`). El callback recibe el mismo contexto que `aoeEffect` —objetivos
   * dentro del área y servicios de golpe— más `combatFx`.
   */
  private emitAoeEvent(
    phase: 'start' | 'cast' | 'end',
    caster: MatchPlayerState,
    def: AbilityDef,
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    elapsed: number
  ): void {
    // Las áreas instantáneas no tienen `ActiveAoe` que se retire: su `onEnd` se
    // programa para cuando termine la duración visual del estallido.
    if (phase === 'cast' && def.aoeDamageMode === 'instant' && def.onEnd) {
      this.pendingAoeEnds.push({
        caster,
        def,
        x,
        z,
        dirX,
        dirZ,
        remaining: Math.max(0.1, def.aoeDuration),
        elapsed: 0
      });
    }
    const event =
      phase === 'start'
        ? def.onStart
        : phase === 'cast'
          ? def.onCast
          : def.onEnd;
    if (!event) return;
    const hit: AoeHitInput = {
      owner: caster,
      def,
      x,
      z,
      radius: def.radius,
      shape: def.aoeShape,
      dirX,
      dirZ,
      halfAngle: def.halfAngle * DEG,
      mode: def.aoeDamageMode,
      tick: 0,
      elapsed,
      power: def.power,
      immuneMarked: new Set()
    };
    const context: AoeEventContext = {
      ...this.buildAoeContext(hit),
      combatFx: this.combatFx,
      setCasterHidden: (hidden) => {
        caster.hidden = hidden;
        // El casteo recuerda que ocultó al lanzador para volver a mostrarlo
        // si se interrumpe antes de que llegue su `onCast`.
        if (hidden && caster.activeCast) caster.activeCast.hiddenCaster = true;
      },
      setCasterInvulnerable: (invulnerable) => {
        if (invulnerable) {
          // La preparación entera queda cubierta; `onCast` la retira antes de
          // que el margen extra pueda notarse.
          caster.invulnerableTimer = Math.max(
            caster.invulnerableTimer,
            def.startup + 0.1
          );
          if (caster.activeCast) caster.activeCast.invulnerableCaster = true;
        } else if (caster.activeCast?.invulnerableCaster) {
          caster.invulnerableTimer = 0;
        }
      }
    };
    event(context);
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
      immuneMarked: hit.immuneMarked,
      flatBonusApplied: hit.flatBonusApplied
    });
  }

  /** Hitstun y cancelación opcional solicitados por un callback de área. */
  private applyAoeHitstun(
    target: AoeTarget,
    seconds: number,
    cancel: boolean
  ): void {
    if (cancel) this.interruptWithRefund(target.player, false);
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
        this.showHealPopup(healedPlayer, amount, caster);
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
      /**
       * Objetivos que ya cobraron el `+2` de la fórmula en este lanzamiento.
       * Las áreas persistentes lo comparten entre ticks: el primero que
       * alcanza a un objetivo paga el término plano y los siguientes no.
       */
      flatBonusApplied?: Set<number>;
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
        this.showImmunePopup(target, attacker);
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
        // Los estados siempre rompen la armadura del casteo.
        damage: 0,
        force: true,
        sourceX: options.sourceX,
        sourceZ: options.sourceZ
      });
      return false;
    }

    // El `+2` de la fórmula es por golpe. En un área persistente cada tick es
    // una llamada, así que el primero que alcanza a cada objetivo paga el
    // término plano y los siguientes lo desactivan: el total no depende de
    // cuántos ticks reciba. Un objetivo inmune no lo consume porque el retorno
    // por inmunidad ocurre antes.
    let flatBonus = 2;
    if (options.flatBonusApplied) {
      const alreadyApplied = options.flatBonusApplied.has(target.slot);
      if (!alreadyApplied) options.flatBonusApplied.add(target.slot);
      flatBonus = alreadyApplied ? 0 : 2;
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
      flatBonus,
      critical,
      randomFactor: rollRandomFactor()
    });

    // La inmunidad ya se ha descartado arriba, así que un golpe dañino válido
    // siempre resta al menos 1 PV y puede mostrar su impacto y su número.
    const reduction =
      target.damageReductionTimer > 0 ? target.damageReduction : 0;
    // El clima se aplica al final del pipeline, junto a la reducción de
    // Protección. Los multiplicadores de tipo (sol, lluvia), la penalización a
    // proyectiles (turbulencias) y la defensa del Hielo bajo la nieve se
    // acumulan en un solo factor.
    const weatherMultiplier =
      atmosphereMoveMultiplier(this.atmosphere, def.type) *
      atmosphereShapeMultiplier(this.atmosphere, def.shape) *
      atmosphereIncomingMultiplier(this.atmosphere, target.types);
    const finalDamage = Math.max(
      1,
      Math.round(result.damage * (1 - reduction) * weatherMultiplier)
    );
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
      lethal,
      attacker
    );

    // El control puede venir del `control` estándar o de los ajustes propios
    // del callback de un área (cancel, hitstun y empuje por separado).
    const absorbed = this.applyHitControl(attacker, target, {
      cancel,
      hitstun,
      knockback,
      damage: finalDamage,
      lethal,
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
    // Un golpe absorbido por la armadura no debe reproducir el flinch: la
    // animación de daño tiene prioridad sobre el casteo y lo haría parecer
    // cancelado aunque siga vivo.
    if (!absorbed) {
      target.hurtTimer = Math.max(target.hurtTimer, control ? 0.35 : 0.2);
    }
    this.vibrateOnDamage(target, appliedDamage);
    if (target.hp <= 0) this.knockOut(target, attacker, def.name);

    // `healOnHit` se resuelve aquí, en el único punto donde un golpe resta vida
    // de verdad. Así funciona en todas las formas (melee, proyectil, haz, área
    // y dash) y una tirada fallida o un objetivo inmune no curan. El token hace
    // que un lanzamiento con varios impactos o ticks cure una sola vez.
    if (def.healOnHit && options.healToken && !options.healToken.healed) {
      options.healToken.healed = true;
      applyHealSelf(attacker, def, this.combatFx, (healed, amount) => {
        this.showHealPopup(healed, amount, attacker);
        this.awardXp(healed, 'healing', amount * XP_REWARDS.healingPerHp);
      });
    }
    return true;
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
      amount: popup.amount,
      critical: popup.critical,
      effectiveness: popup.effectiveness,
      heal: popup.heal,
      lethal: popup.lethal,
      immune: popup.immune,
      views
    });
  }

  private knockOut(
    target: MatchPlayerState,
    killer: MatchPlayerState,
    abilityName: string
  ): void {
    // El fin de partida es idempotente: el primer evento de modo que cierra la
    // partida decide el ganador y los KO posteriores del mismo frame no suman.
    if (this.matchOver) return;
    if (!target.alive) return;
    const animations = this.assetFor(
      target.pokemonId,
      target.skinId
    )?.skin.animations;
    const deathAnimation = animations?.faint ?? animations?.hurt;
    const deathDuration = deathAnimation
      ? deathAnimation.durations.reduce((total, ticks) => total + ticks, 0) / 60
      : 0.7;

    target.alive = false;
    target.hp = 0;
    target.deaths += 1;
    target.respawnTimer = CONFIG.combat.respawnSeconds;
    target.deathFade = Math.max(0.45, deathDuration);
    target.hurtTimer = 0;
    target.animationFrame = null;
    target.dash = null;
    this.cancelCast(target);
    this.clearRepeatCooldown(target);
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
    target.animation = animations?.faint ? 'faint' : 'hurt';
    target.playback = 1;
    for (const copy of target.copies) copy.play(target.animation, true);
    this.spawnDeathMarker(target);

    this.pushKillFeed(killer, target, abilityName);

    if (killer.team !== target.team) {
      killer.kills += 1;
      this.awardKillXp(killer, target);
      // El modo decide si el KO suma marcador, si concede XP de objetivo y si
      // cierra la partida. `finishMatch` centraliza el resultado para todos.
      const result = this.gameMode?.onEvent(this.modeContext(), {
        type: 'knockout',
        killerSlot: killer.slot,
        victimSlot: target.slot,
        killerTeam: killer.team,
        victimTeam: target.team
      });
      if (result) {
        this.applyModeXp(result.xp);
        if (result.outcome) this.finishMatch(result.outcome);
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
      // Otra área del mismo frame pudo cortar la canalización que creó esta:
      // si ya se retiró, no debe seguir haciendo ticks.
      if (!this.activeAoes.includes(aoe)) continue;
      aoe.elapsed += dt;
      // Las áreas móviles recalculan su centro antes del tick para que el daño
      // de este frame y el aro visual se resuelvan en la misma posición. En el
      // frame en que el área caduca ya no se mueve: su efecto visual puede
      // haberse retirado antes.
      if (aoe.movement && aoe.elapsed < aoe.duration) {
        const next = aoe.movement({
          caster: aoe.owner,
          def: aoe.def,
          originX: aoe.originX,
          originZ: aoe.originZ,
          dirX: aoe.dirX,
          dirZ: aoe.dirZ,
          duration: aoe.duration,
          elapsed: aoe.elapsed
        });
        aoe.x = next.x;
        aoe.z = next.z;
        aoe.moveVisual?.(aoe.x, aoe.z);
      }
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
        this.emitAoeEvent(
          'end',
          aoe.owner,
          aoe.def,
          aoe.x,
          aoe.z,
          aoe.dirX,
          aoe.dirZ,
          aoe.elapsed
        );
        const index = this.activeAoes.indexOf(aoe);
        if (index >= 0) this.activeAoes.splice(index, 1);
        if (this.matchOver) return;
      }
    }
  }

  /** Dispara los `onEnd` de áreas instantáneas al agotar su duración visual. */
  private updatePendingAoeEnds(dt: number): void {
    if (this.pendingAoeEnds.length === 0) return;
    for (let index = this.pendingAoeEnds.length - 1; index >= 0; index--) {
      const pending = this.pendingAoeEnds[index];
      pending.remaining -= dt;
      pending.elapsed += dt;
      if (pending.remaining > 0) continue;
      this.pendingAoeEnds.splice(index, 1);
      this.emitAoeEvent(
        'end',
        pending.caster,
        pending.def,
        pending.x,
        pending.z,
        pending.dirX,
        pending.dirZ,
        pending.elapsed
      );
      if (this.matchOver) return;
    }
  }

  private tickAoe(aoe: ActiveAoe): void {
    const basePower = aoe.def.power * aoe.tickInterval;
    // `flatBonusApplied` viaja con el tick para que `applyAbilityDamage` cobre
    // el `+2` de la fórmula una sola vez por objetivo y lanzamiento.
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
      shape: aoe.shape,
      dirX: aoe.dirX,
      dirZ: aoe.dirZ,
      halfAngle: aoe.halfAngle,
      mode: 'overTime',
      tick: aoe.tick,
      elapsed: aoe.elapsed,
      power: basePower,
      healToken: aoe.healToken,
      immuneMarked: aoe.immuneMarked,
      flatBonusApplied: aoe.flatBonusApplied
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
        player.dash = null;
        this.cancelCast(player);
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
    const mode = this.gameMode?.getHud(this.modeContext()) ?? null;
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
        skinId: player.skinId ?? DEFAULT_SKIN_ID,
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
        visionRange: player.visionRange * player.visionFactor * this.atmosphereVision,
        detectionRange: effectiveVisionRange(
          player.visionRange * player.visionFactor * this.atmosphereVision,
          player.concealment.value
        ),
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
            duration:
              player.cooldownTotals[abilityIndex] || (def?.cooldown ?? 0)
          };
        }),
        shieldActive: player.damageReductionTimer > 0,
        armorRemaining: this.activeCastArmor(player),
        armorMax: player.activeCast?.def.armorPool ?? 0,
        commonAbility: commonOption
          ? {
              id: commonOption.id,
              name: commonOption.name,
              short: commonOption.short,
              passive: commonOption.passive,
              cooldown: player.cooldowns[4] ?? 0,
              duration:
                player.cooldownTotals[4] || (commonDef?.cooldown ?? 0),
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
        scores: { ...this.teamScores },
        mode,
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
        if (this.teamSeesPoint(observer.team, x, z, concealment, colliders)) {
          seenTeams.add(observer.team);
        }
      }
      if (seenTeams.has(observer.team)) layers.push(layer.id);
    });
    this.fxVisibilityCache.set(cacheKey, layers);
    return layers;
  }

  /**
   * Visibilidad de un actor para un observador concreto.
   *
   * Se resuelve con geometría exacta en cada frame: radio efectivo según la
   * ocultación del terreno del objetivo y línea de visión contra los oclusores.
   * La máscara de niebla solo alimenta el sombreado, no decide si un actor
   * existe para el motor; así su recompuesto a 15 Hz no retrasa la visibilidad
   * de juego.
   */
  private observerSeesActor(
    observer: MatchPlayerState,
    target: MatchPlayerState,
    alreadyVisible: boolean,
    colliders: readonly Collider[]
  ): boolean {
    const distance = Math.hypot(target.x - observer.x, target.z - observer.z);
    const effective = effectiveVisionRange(
      observer.visionRange * observer.visionFactor * this.atmosphereVision,
      target.concealment.value
    );
    const limit = alreadyVisible ? effective + CONFIG.vision.hysteresis : effective;
    if (distance > limit) return false;
    return !lineOfSightBlocked(
      observer.x,
      observer.z,
      target.x,
      target.z,
      colliders
    );
  }

  /** ¿Ve algún Pokémon vivo del equipo el punto `(x, z)`? */
  private teamSeesPoint(
    team: Team,
    x: number,
    z: number,
    concealment: number,
    colliders: readonly Collider[]
  ): boolean {
    for (const observer of this.matchPlayers) {
      if (!observer.alive || observer.team !== team) continue;
      const distance = Math.hypot(x - observer.x, z - observer.z);
      const effective = effectiveVisionRange(
        observer.visionRange * observer.visionFactor * this.atmosphereVision,
        concealment
      );
      if (distance > effective) continue;
      if (!lineOfSightBlocked(observer.x, observer.z, x, z, colliders)) return true;
    }
    return false;
  }

  /**
   * ¿Ve el equipo el punto de un objeto? Los objetos no se esconden por la
   * ocultación del terreno (arena, veneno, hierba alta...), solo por el radio
   * de visión y por la línea de visión (separadores y árboles). Se usa el mismo
   * conjunto de observadores que dibuja la niebla: solo los Pokémon vivos,
   * humanos o bots, revelan objetos al equipo.
   */
  private teamSeesPickupPoint(
    team: Team,
    x: number,
    z: number,
    colliders: readonly Collider[]
  ): boolean {
    for (const observer of this.matchPlayers) {
      if (observer.team !== team) continue;
      if (!observer.alive) continue;
      const distance = Math.hypot(x - observer.x, z - observer.z);
      if (
        distance >
        effectiveVisionRange(observer.visionRange * observer.visionFactor * this.atmosphereVision, 0)
      ) {
        continue;
      }
      if (!lineOfSightBlocked(observer.x, observer.z, x, z, colliders)) return true;
    }
    return false;
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
    const colliders = this.world.colliders;
    for (const player of this.matchPlayers) player.enemiesSeeing = 0;

    const previous = this.visibleByTeam;
    const current = this.visibleByTeamScratch;
    for (const team of ACTIVE_TEAMS) current[team].clear();

    for (const observer of this.matchPlayers) {
      // Un KO no revela actores al equipo, sea humano o bot.
      if (!observer.alive) continue;
      if (!observer.hidden) {
        current[observer.team].add(observer.slot);
      }
      for (const target of this.matchPlayers) {
        if (target === observer) continue;
        // Una habilidad puede ocultar al lanzador (Excavar): ni los rivales ni
        // los aliados lo ven mientras dura la preparación.
        if (target.hidden) continue;
        // Un aliado vivo ya está en el conjunto por su propio slot; solo hay
        // que comprobar rivales y aliados que acaban de caer.
        if (target.alive && target.team === observer.team) continue;
        // Un KO deja ver la animación de daño un instante; el cuerpo sigue
        // siendo visible para el equipo que lo vio caer.
        if (!target.alive && target.deathFade <= 0) continue;
        const alreadyVisible = previous[observer.team].has(target.slot);
        // Geometría exacta en cada paso: radio efectivo según la ocultación
        // del terreno del objetivo y línea de visión contra los oclusores.
        const visible = this.observerSeesActor(
          observer,
          target,
          alreadyVisible,
          colliders
        );
        // El HUD "Descubierto" y la regeneración cuentan la línea de visión
        // directa de cada rival vivo, no la visión compartida del equipo.
        if (target.alive && observer.team !== target.team && visible) {
          target.enemiesSeeing += 1;
        }
        if (!visible) continue;
        current[observer.team].add(target.slot);
      }
    }
    this.visibleByTeam = current;
    this.visibleByTeamScratch = previous;
    this.visibilityStep = this.simulationStep;
  }

  /**
   * Resuelve la niebla de cada vista: oculta las copias que no se ven y coloca
   * el degradado fuera de la unión de círculos del equipo. La visibilidad de
   * actores ya viene resuelta por paso; aquí solo se pinta y se sincronizan las
   * copias. La ocultación del objetivo se calcula con el terreno que pisa, no
   * con el del observador.
   */
  private updateVision(dt: number): void {
    const colliders = this.world.colliders;
    // Fallback para la cuenta atrás, renders sin paso de simulación y pasos
    // que terminaron antes de refrescar (por ejemplo, al cerrar la partida).
    if (this.visibilityStep !== this.simulationStep) {
      this.refreshCombatVisibility();
    }

    // Círculos de visión por equipo: se calculan una vez por frame y se
    // reutilizan en todas sus vistas. Solo los Pokémon vivos, humanos o bots,
    // aportan visión; un KO no hace de vigía hasta reaparecer. Los arrays,
    // mapas y objetos se conservan entre frames para no asignar memoria.
    for (const circles of this.visionCirclesByTeam.values()) circles.length = 0;
    this.localVisionBySlot.clear();
    for (const player of this.matchPlayers) {
      if (!player.alive) continue;
      let circle = this.visionCirclePool.get(player.slot);
      if (!circle) {
        circle = { x: 0, z: 0, visionRange: 0 };
        this.visionCirclePool.set(player.slot, circle);
      }
      circle.x = player.x;
      circle.z = player.z;
      circle.visionRange =
        player.visionRange * player.visionFactor * this.atmosphereVision;
      this.localVisionBySlot.set(player.slot, circle);
      let circles = this.visionCirclesByTeam.get(player.team);
      if (!circles) {
        circles = [];
        this.visionCirclesByTeam.set(player.team, circles);
      }
      circles.push(circle);
    }
    const circlesByTeam = this.visionCirclesByTeam;
    const localCircleBySlot = this.localVisionBySlot;

    // La máscara world-space se compone una sola vez por equipo, aunque haya
    // varias vistas suyas en pantalla. Alimenta el quad de niebla; la
    // visibilidad de actores ya se resolvió una vez por paso de simulación.
    const noCircles: readonly VisionCircle[] = [];
    for (const [team, mask] of this.fogMasks) {
      mask.update(circlesByTeam.get(team) ?? noCircles, dt);
    }

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

      const visibleSlots = this.visibleByTeam[observer.team];
      for (const target of this.matchPlayers) {
        const copy = target.copies[viewIndex];
        if (!copy) continue;
        // Oculto por una habilidad: desaparece también en su propia vista.
        if (target.hidden) {
          copy.setVisible(false);
          continue;
        }
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
        visible = this.teamSeesPickupPoint(team, spawn.x, spawn.z, colliders);
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
