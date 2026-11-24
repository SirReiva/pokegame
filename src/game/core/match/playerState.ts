/**
 * Estado mutable de una partida: jugadores, proyectiles, áreas y golpes
 * pendientes. Se separa de `Game` para que los ejecutores de habilidades y los
 * subsistemas de combate compartan tipos sin importar el orquestador.
 */

import type {
  AoeMovement,
  AoePlayer,
  HealOnHitToken
} from '../abilities/aoe';

export type { HealOnHitToken } from '../abilities/aoe';
import type {
  AbilityDef,
  AoeAbilityDef,
  DashAbilityDef,
  MeleeAbilityDef,
  ProjectileAbilityDef
} from '../abilities/def';
import type { AoeShape, BuffStat } from '../abilities/styles';
import type { CastPlan } from '../castPlan';
import type { EffectHandle, FxHandle, TelegraphHandle } from '../ports/fx';
import type { MatchPlayerConfig } from './config';
import type { CombatStats } from '../pokedex';
import type { TerrainId } from '../terrain';
import type { TerrainSpeedReason } from '../terrainSpeed';
import type { AnimationName } from '../types';
import type { Concealment } from '../vision';
import type { XpBreakdown, XpFeedEntry } from '../xp';

export interface ActiveBuff {
  stat: BuffStat;
  multiplier: number;
  duration: number;
}

/**
 * Ralentización activa con su propio tiempo restante. Se guardan por separado
 * para que un slow débil no alargue uno fuerte y para que los ticks de una
 * misma habilidad no renueven la duración una y otra vez.
 */
export interface SlowEffect {
  /** Lanzador y habilidad que la aplicaron; los ticks de un área comparten la clave. */
  source: string;
  multiplier: number;
  remaining: number;
}

/**
 * Base de un estado activo sobre un jugador.
 *
 * Solo hay una instancia por `kind`: reaplicar el mismo estado reemplaza la
 * anterior y actualiza el lanzador que se lleva el crédito del KO.
 */
interface ActiveStatusBase {
  /** Segundos restantes del estado. */
  remaining: number;
  /** Lanzador al que se atribuyen el daño, la XP y el KO. */
  source: MatchPlayerState;
  /** Nombre de la habilidad que lo aplicó, para el kill feed. */
  abilityName: string;
}

/** Veneno o quemadura: daño fijo por tick. */
export interface ActiveDamageStatus extends ActiveStatusBase {
  kind: 'poisoned' | 'burned';
  /** Daño fijo por tick, en PV. */
  damage: number;
  /** Segundos entre ticks. */
  interval: number;
  /** Segundos hasta el próximo tick. */
  nextTick: number;
}

/** Semilla: daño fijo por tick que cura al lanzador. */
export interface ActiveSeededStatus extends ActiveStatusBase {
  kind: 'seeded';
  /** Daño fijo por tick, en PV. */
  damage: number;
  /** Segundos entre ticks. */
  interval: number;
  /** Segundos hasta el próximo tick. */
  nextTick: number;
  /** Fracción del daño real del tick que cura al lanzador. */
  healRatio: number;
}

/** Estados que reparten daño en el tiempo. */
export type ActiveDamageOverTimeStatus =
  | ActiveDamageStatus
  | ActiveSeededStatus;

/** Congelación: ralentiza el movimiento. */
export interface ActiveFrozenStatus extends ActiveStatusBase {
  kind: 'frozen';
  /** Multiplicador de velocidad: 0,55 = 45 % más lento. */
  multiplier: number;
}

/** Sueño: bloquea movimiento y habilidades hasta despertar. */
export interface ActiveAsleepStatus extends ActiveStatusBase {
  kind: 'asleep';
}

/** Parálisis: alarga los enfriamientos que ya están corriendo. */
export interface ActiveParalyzedStatus extends ActiveStatusBase {
  kind: 'paralyzed';
  /** Segundos extra que se suman a cada habilidad en enfriamiento. */
  extraCooldown: number;
  /** `once` al entrar o `overtime` cada `interval` segundos. */
  mode: 'once' | 'overtime';
  /** Segundos entre aplicaciones en `overtime`. */
  interval: number;
  /** Segundos hasta la próxima aplicación en `overtime`. */
  nextTick: number;
}

/** Estado activo; se guarda como máximo uno por `kind`. */
export type ActiveStatus =
  | ActiveDamageOverTimeStatus
  | ActiveFrozenStatus
  | ActiveAsleepStatus
  | ActiveParalyzedStatus;

/** Aportación de un rival al daño recibido en la vida actual, para asistencias. */
export interface DamageContribution {
  /** Daño real aplicado a la vida del objetivo. */
  amount: number;
  /** Último instante en el que aportó daño. */
  at: number;
  /** XP de daño ya concedida por este rival en esta vida. */
  xp: number;
}

/**
 * Aportación de apoyo que un aliado hizo sobre otro jugador (curación o
 * revivir). Se guarda en el jugador ayudado para poder acreditar la asistencia
 * si este consigue una baja poco después.
 */
export interface SupportContribution {
  /** PV curados por el aliado dentro de la ventana reciente. */
  heal: number;
  /** Último instante en el que curó. */
  healAt: number;
  /** Veces que lo devolvió a la vida. */
  revives: number;
  /** Último instante en el que lo revivió. */
  reviveAt: number;
}

/** Bajas repetidas contra un mismo rival, para reducir la XP por farmeo. */
export interface KillFarmRecord {
  count: number;
  at: number;
}

export interface Projectile {
  owner: MatchPlayerState;
  def: ProjectileAbilityDef;
  x: number;
  z: number;
  vx: number;
  vz: number;
  traveled: number;
  pierce: number;
  hit: Set<MatchPlayerState>;
  visual: EffectHandle;
  /** Curación por impacto del lanzamiento; `undefined` si no la tiene. */
  healToken?: HealOnHitToken;
}

export interface PendingMeleeHit {
  attacker: MatchPlayerState;
  target: MatchPlayerState;
  def: MeleeAbilityDef;
  healToken?: HealOnHitToken;
}

/**
 * Habilidad instantánea cuya ejecución se difiere al final del frame, después
 * de que todos los jugadores hayan tenido su turno. Así el daño, el stun y la
 * cancelación de una habilidad no dependen del orden de `matchPlayers`.
 */
export interface QueuedCast {
  player: MatchPlayerState;
  def: AbilityDef;
  targetX?: number;
  targetZ?: number;
  /**
   * Marca de área creada durante el `windup`. Se conserva hasta la ejecución
   * para que un área móvil pueda seguir moviéndola durante el efecto.
   */
  marker?: TelegraphHandle | null;
  /** Dirección horizontal fijada al empezar la preparación. */
  dirX?: number;
  dirZ?: number;
  /**
   * Casteo que originó el efecto. Si se cancela entre el encolado y la
   * resolución, el efecto se descarta en vez de ejecutarse igualmente.
   */
  activeCast: ActiveCast;
}

/**
 * Golpe de dash detectado durante el desplazamiento. El daño se aplica en la
 * fase común de resolución para que un dash no tumbe al rival antes de que
 * este haya podido actuar.
 */
export interface PendingInstantHit {
  attacker: MatchPlayerState;
  target: MatchPlayerState;
  def: DashAbilityDef;
  healToken?: HealOnHitToken;
  /** Tramo del dash que produjo el golpe (`ax/az` -> `bx/bz`). */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Dirección del dash: el barrido no se extiende hacia atrás. */
  dirX: number;
  dirZ: number;
  /** Radio efectivo del golpe (radio del dash + radio del jugador). */
  reach: number;
}

export interface PlayerDash {
  def: DashAbilityDef;
  elapsed: number;
  duration: number;
  dirX: number;
  dirZ: number;
  speed: number;
  /** Distancia total del dash, ya recortada por obstáculos al lanzarlo. */
  distance: number;
  /** Distancia recorrida; nunca supera `distance`. */
  traveled: number;
  trailTimer: number;
  hit: Set<MatchPlayerState>;
  /** Curación por impacto del lanzamiento; `undefined` si no la tiene. */
  healToken?: HealOnHitToken;
}

/**
 * Casteo en curso: desde que se pulsa la habilidad hasta que termina su
 * `recovery`. El plan de presentación fija qué frame del clip se dibuja en cada
 * fase; el efecto se dispara una sola vez al llegar a `effectAt`.
 */
export interface ActiveCast {
  def: AbilityDef;
  slotIndex: number;
  /** Tiempo transcurrido desde el inicio del casteo. */
  elapsed: number;
  /** Plan de segmentos de animación y fases. */
  plan: CastPlan;
  /** Instante del efecto (`startup`). Lo usan bots y telegrafías. */
  effectAt: number;
  /** `true` cuando el efecto ya se encoló para resolverse en este frame. */
  fired: boolean;
  /** `true` si el casteo se interrumpió antes de resolver su efecto. */
  canceled: boolean;
  /**
   * Frame de impacto forzado para el render. Si un frame largo (`dt`) cruza el
   * `HitFrame` de golpe, se mantiene esta pose uno o dos frames para que no se
   * pierda visualmente.
   */
  forcedFrame: number | null;
  forcedAnimation: AnimationName | null;
  /** Frames de render que quedan mostrando `forcedFrame`. */
  forcedFrames: number;
  /**
   * Marca en el suelo de las habilidades de área; `null` en las demás. El aro
   * del equipo sobrevive al impacto y se autodestruye al terminar el efecto;
   * el relleno de carga solo dura el `startup`.
   */
  marker: TelegraphHandle | null;
  /**
   * Carril en el suelo de los haces. Sobrevive al disparo y se autodestruye
   * cuando termina el efecto del haz; `null` en las demás formas.
   */
  lane: TelegraphHandle | null;
  /** Aura tenue de la armadura de casteo; `null` si la habilidad no tiene. */
  armorFx: FxHandle | null;
  /**
   * Armadura de casteo restante. Empieza en `def.armorPool` y baja con el
   * daño de los golpes absorbidos; al llegar a 0 el casteo se rompe.
   */
  armorRemaining: number;
  /**
   * `true` si este casteo ocultó al lanzador (por ejemplo, `Excavar` bajo
   * tierra). Al terminar o cancelarse se vuelve a mostrar.
   */
  hiddenCaster: boolean;
  /**
   * `true` si este casteo hizo invulnerable al lanzador. Al terminar o
   * cancelarse se retira la invulnerabilidad.
   */
  invulnerableCaster: boolean;
  /** Centro del área o extremo del haz fijado al empezar el lanzamiento. */
  targetX: number;
  targetZ: number;
  /**
   * Centro inicial del área antes de aplicar `aoePrepareMovement`. Es la base que
   * recibe la función que mueve el aviso durante el `startup`.
   */
  originX: number;
  originZ: number;
  /** Dirección horizontal fijada al empezar la preparación. */
  dirX: number;
  dirZ: number;
}

/** Área persistente que aplica daño periódico mientras el rival siga dentro. */
export interface ActiveAoe {
  owner: MatchPlayerState;
  def: AoeAbilityDef;
  /**
   * Casteo que creó el área. Las canalizaciones con
   * `movementDuringCast` bloqueado se cortan por completo al ser interrumpidas:
   * el área deja de hacer ticks y su efecto 3D se retira.
   */
  cast?: ActiveCast;
  /** Handle del efecto 3D para poder retirarlo antes de que expire. */
  fx?: FxHandle;
  x: number;
  z: number;
  /** Radio del círculo o longitud del cono. */
  radius: number;
  /** Geometría del área persistente. */
  shape: AoeShape;
  /** Semiángulo del cono en radianes; 0 en los círculos. */
  halfAngle: number;
  elapsed: number;
  duration: number;
  tickInterval: number;
  /** Segundos restantes hasta el próximo golpe. */
  tickTimer: number;
  /** Índice del próximo golpe: 0 para el primer tick. */
  tick: number;
  /**
   * Estado de ticks por objetivo en `overtime-target`. La clave es el slot del
   * jugador; al salir del área se descarta y una reentrada empieza de cero.
   */
  targetTimers?: Map<
    number,
    {
      /** Segundos expuesto al área desde que entró. */
      elapsed: number;
      /** Segundos restantes hasta su próximo tick. */
      tickTimer: number;
      /** Índice de su próximo tick: 0 para el primero. */
      tick: number;
    }
  >;
  /**
   * Función opcional que recoloca el centro en cada frame durante la duración.
   * Solo existe en las áreas `overTime` que declaran `aoeMovement`.
   */
  movement?: AoeMovement<AoePlayer, AoeAbilityDef>;
  /** Centro donde apareció el área; base para `movement`. */
  originX: number;
  originZ: number;
  /** Dirección horizontal unitaria del lanzamiento. */
  dirX: number;
  dirZ: number;
  /**
   * Dirección del lanzamiento original. `aoeMovement` recibe siempre esta como
   * referencia para poder girar el cono de forma relativa.
   */
  originDirX: number;
  originDirZ: number;
  /**
   * Recoloca el aro del equipo y el efecto visual al mover el centro. En los
   * conos también recibe la dirección actual para rotarlos.
   */
  moveVisual?: (
    x: number,
    z: number,
    dirX: number,
    dirZ: number
  ) => void;
  /** Curación por impacto del lanzamiento; `undefined` si no la tiene. */
  healToken?: HealOnHitToken;
  /**
   * Slots que ya cobraron el `+2` de la fórmula en este lanzamiento. El área lo
   * comparte entre ticks para que el término plano no se multiplique por el
   * número de golpes.
   */
  flatBonusApplied: Set<number>;
}

export interface MatchPlayerState extends MatchPlayerConfig {
  types: string[];
  /**
   * Radio de impacto contra habilidades (hurtbox). Puede diferir del radio de
   * movimiento, que sigue siendo `CONFIG.player.radius` para todos.
   */
  hitRadius: number;
  maxSpeed: number;
  x: number;
  z: number;
  facing: number;
  /**
   * Dirección de apuntado del stick derecho, en radianes. `null` cuando el
   * stick está centrado: los ataques usan entonces `facing`.
   */
  aimYaw: number | null;
  /**
   * Yaw de la cámara de este jugador, copiado desde su `PlayerView` en cada
   * paso. La simulación lo usa para convertir la entrada en movimiento
   * relativo sin conocer `CameraRig`.
   */
  cameraYaw: number;
  vx: number;
  vz: number;
  submerge: number;
  animation: AnimationName;
  playback: number;
  /**
   * `true` mientras una habilidad lo oculta del render y de la vista de los
   * equipos (por ejemplo, `Excavar` durante la preparación).
   */
  hidden: boolean;
  terrain: TerrainId;
  terrainMultiplier: number;
  terrainSpeedReason: TerrainSpeedReason;
  visionRange: number;
  /** Multiplicador de visión de la dificultad del bot (1 para humanos). */
  visionFactor: number;
  concealment: Concealment;
  /** Color representativo del Pokémon (`accent` del manifiesto). */
  accent: [number, number, number];
  /** Nº de rivales vivos que te ven ahora mismo (se recalcula cada frame). */
  enemiesSeeing: number;

  /** Punto de reaparición del equipo. */
  spawn: { x: number; z: number };
  /** Stats finales a nivel 50 (HP, ataque, defensa...). */
  combat: CombatStats;
  hp: number;
  maxHp: number;
  /** Fracción de daño reducida por Protección (0-1). */
  damageReduction: number;
  /** Multiplicador de velocidad normal mientras Protección está activa. */
  shieldSpeedMultiplier: number;
  /** Segundos restantes de Protección. */
  damageReductionTimer: number;
  /** VFX del escudo de Protección, para retirarlo si el jugador muere. */
  shieldFx: FxHandle | null;
  /** Segundos seguidos oculto para Regeneración. */
  hiddenTimer: number;
  /** Gracia antes de resetear el contador al perder visibilidad. */
  regenGraceTimer: number;
  /** Acumulador de PV fraccionarios para Regeneración. */
  regenAccumulator: number;
  /** `true` cuando Regeneración está curando en este frame. */
  regenerating: boolean;
  alive: boolean;
  /** Segundos restantes hasta reaparecer. */
  respawnTimer: number;
  /** Segundos restantes de invulnerabilidad tras reaparecer. */
  invulnerableTimer: number;
  /** Bloqueo breve que impide moverse y atacar tras recibir un golpe. */
  stunTimer: number;
  /** Tiempo restante de la animación de daño. */
  hurtTimer: number;
  /**
   * Frame manual que debe dibujar el billboard durante un casteo. `null` deja
   * que idle/walk/hurt usen el reloj automático.
   */
  animationFrame: number | null;
  /** Desplazamiento activo (dash) o `null` si no se está desplazando. */
  dash: PlayerDash | null;
  /** Casteo en curso o `null`. */
  activeCast: ActiveCast | null;
  /** Tiempo que el cuerpo sigue visible tras un KO. */
  deathFade: number;
  kills: number;
  deaths: number;
  /** Asistencias confirmadas en toda la partida. */
  assists: number;
  /** Daño real infligido a rivales (sin contar el exceso sobre la vida restante). */
  damageDealt: number;
  /** Daño real recibido de rivales y autodaño. */
  damageTaken: number;
  /** PV reales curados por habilidades propias y Regeneración. */
  abilityHealing: number;
  /** PV reales curados por objetos recogibles (pociones). */
  pickupHealing: number;
  /** XP acumulada de la partida. Solo decorativa: no altera el combate. */
  xp: number;
  /** Desglose de la XP por fuente, para el HUD y el marcador final. */
  xpBreakdown: XpBreakdown;
  /** Últimos eventos de XP, el más reciente primero (máximo 3). */
  xpFeed: XpFeedEntry[];
  /** Bajas seguidas sin morir; alimenta el shutdown y el multiplicador. */
  killStreak: number;
  /** Instantes de las últimas bajas, para detectar multibajas. */
  recentKills: number[];
  /** Daño real de cada rival en la vida actual, para repartir asistencias. */
  damageContributors: Map<number, DamageContribution>;
  /** Último instante en que cada rival le aplicó una ralentización. */
  slowContributors: Map<number, number>;
  /** Curación y revividas que cada aliado le ha dado recientemente. */
  supportContributors: Map<number, SupportContribution>;
  /** Bajas repetidas contra cada víctima, para el XP decreciente. */
  killFarm: Map<number, KillFarmRecord>;
  /** Segundos vivos acumulados para la XP de participación. */
  participationTimer: number;
  /** XP de participación ya concedida (tope por partida). */
  participationAwarded: number;
  /** Último instante con una acción de combate (daño, curación, KO u objeto). */
  lastActionAt: number;
  /** Enfriamiento restante de cada habilidad, en segundos. */
  cooldowns: number[];
  /**
   * Cooldown total del último lanzamiento de cada habilidad. Puede superar el
   * base si la habilidad acumuló la rampa de repetición; el HUD lo usa para
   * que la barra no se llene antes de tiempo.
   */
  cooldownTotals: number[];
  /** Id de la última habilidad con rampa de repetición. */
  repeatAbilityId: string | null;
  /** Repeticiones consecutivas de `repeatAbilityId`. */
  repeatAbilityCount: number;
  /** Instante de la última repetición, para la ventana de reinicio. */
  repeatAbilityAt: number;
  buffs: ActiveBuff[];
  /** Ralentizaciones activas, cada una con su propio tiempo restante. */
  slowEffects: SlowEffect[];
  /** Estados activos, como máximo uno por `kind`. */
  statuses: ActiveStatus[];
  /**
   * Segundos extra de parálisis acumulados en cada enfriamiento. El HUD los
   * muestra aparte para explicar por qué un cooldown tarda más de lo normal.
   */
  cooldownPenalties: number[];
  /**
   * Multiplicador de velocidad de la ralentización dominante (1 = normal). Se
   * recalcula a partir de `slowEffects`; no se asigna a mano.
   */
  slowMultiplier: number;
  /**
   * Ids de las cuatro habilidades del Pokémon y, al final, el instinto común.
   * `null` deja un hueco vacío.
   */
  abilityIds: (string | null)[];
}

/**
 * Dirección a la que sale un ataque: el stick derecho mientras está desviado o,
 * si no, la mirada del cuerpo. Los bots nunca desvían el stick, así que siguen
 * apuntando con `facing`.
 */
export function attackYaw(player: MatchPlayerState): number {
  return player.aimYaw ?? player.facing;
}
