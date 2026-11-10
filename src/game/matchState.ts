/**
 * Estado mutable de una partida: jugadores, proyectiles, áreas y golpes
 * pendientes. Se separa de `Game` para que los ejecutores de habilidades y los
 * subsistemas de combate compartan tipos sin importar el orquestador.
 */

import type { AbilityDef, AoeShape, BuffStat } from './abilities';
import type { AoeMovement } from './aoeEffect';
import type { Actor } from './actor';
import type { CameraRig } from './camera';
import type { CastPlan } from './castPlan';
import type { EffectHandle, FxHandle, TelegraphHandle } from './combatFx';
import type { MatchPlayerConfig, SplitRect } from './multiplayer';
import type { CombatStats } from './pokedex';
import type { TerrainId } from './terrain';
import type { TerrainSpeedReason } from './terrainSpeed';
import type { AnimationName } from './types';
import type { Concealment } from './vision';
import type { XpBreakdown } from './xp';

export interface ActiveBuff {
  stat: BuffStat;
  multiplier: number;
  duration: number;
}

/**
 * Seguimiento de la curación por impacto de un mismo lanzamiento. Lo comparten
 * todos los golpes de la habilidad (varios objetivos, varios ticks o impactos
 * de un dash) para que `healOnHit` cure una sola vez aunque alcance a más de un
 * rival.
 */
export interface HealOnHitToken {
  healed: boolean;
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

/** Aportación de un rival al daño recibido en la vida actual, para asistencias. */
export interface DamageContribution {
  /** Daño real aplicado a la vida del objetivo. */
  amount: number;
  /** Último instante en el que aportó daño. */
  at: number;
  /** XP de daño ya concedida por este rival en esta vida. */
  xp: number;
}

/** Bajas repetidas contra un mismo rival, para reducir la XP por farmeo. */
export interface KillFarmRecord {
  count: number;
  at: number;
}

export interface Projectile {
  owner: MatchPlayerState;
  def: AbilityDef;
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
  def: AbilityDef;
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
  def: AbilityDef;
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
  def: AbilityDef;
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
  def: AbilityDef;
  /**
   * Casteo que creó el área. Las canalizaciones con
   * `blockMovementDuringCast` se cortan por completo al ser interrumpidas:
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
   * Función opcional que recoloca el centro en cada frame durante la duración.
   * Solo existe en las áreas `overTime` que declaran `aoeMovement`.
   */
  movement?: AoeMovement;
  /** Centro donde apareció el área; base para `movement`. */
  originX: number;
  originZ: number;
  /** Dirección horizontal unitaria del lanzamiento. */
  dirX: number;
  dirZ: number;
  /** Recoloca el aro del equipo y el efecto visual al mover el centro. */
  moveVisual?: (x: number, z: number) => void;
  /** Curación por impacto del lanzamiento; `undefined` si no la tiene. */
  healToken?: HealOnHitToken;
  /**
   * Slots que ya mostraron la marca de inmunidad en este lanzamiento. Evita
   * apilar una marca por cada tick de un área persistente sobre el mismo rival.
   */
  immuneMarked: Set<number>;
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
  camera: CameraRig;
  /** Una copia del actor por viewport, indexada por jugador/vista. */
  copies: Actor[];
  /** Rectángulo normalizado de esta vista, para proyectar la niebla. */
  viewport: SplitRect;

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
  /** Bajas seguidas sin morir; alimenta el shutdown y el multiplicador. */
  killStreak: number;
  /** Instantes de las últimas bajas, para detectar multibajas. */
  recentKills: number[];
  /** Daño real de cada rival en la vida actual, para repartir asistencias. */
  damageContributors: Map<number, DamageContribution>;
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
  buffs: ActiveBuff[];
  /** Ralentizaciones activas, cada una con su propio tiempo restante. */
  slowEffects: SlowEffect[];
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
