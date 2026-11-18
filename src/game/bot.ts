/**
 * Controlador de un jugador bot.
 *
 * El bot no mueve actores directamente: produce el mismo `DeviceInputSnapshot`
 * que un mando o el teclado. Así pasa por `stepPlayer`, comparte cooldowns,
 * colisiones, tiempos de casteo y reglas de combate con los humanos.
 *
 * La IA se divide en cuatro capas:
 * 1. Percepción: visión, ocultación, línea de visión, memoria de la última
 *    posición conocida y posiciones de los objetos del mapa. El estado de un
 *    objeto (disponible/usado) solo se conoce cuando el equipo lo ve.
 * 2. Navegación: A* sobre `BotNavGrid` y seguimiento de waypoints.
 * 3. Combate: elección de objetivo y de habilidad por rango, cooldown, estado y
 *    ventaja de tipos. Los bots prefieren rivales a los que pueden golpear
 *    fuerte y desconfían de los que son eficaces contra ellos.
 * 4. Movimiento: mantiene la distancia, se acerca para apuntar y se separa de
 *    sus aliados.
 *
 * El apuntado es fiel al juego: `facing` solo cambia al moverse, así que el bot
 * gira hacia el objetivo avanzando en esa dirección antes de lanzar.
 */

import { ABILITIES, type AbilityDef, type BuffStat } from './abilities';
import {
  atmosphereIncomingMultiplier,
  atmosphereMoveMultiplier,
  atmosphereResidual,
  atmosphereShapeMultiplier,
  atmosphereSpeedMultiplier,
  atmosphereVisionMultiplier,
  type AtmosphereId
} from './atmosphere';
import {
  aoeAreaFrom,
  aoeContains,
  aoeDistance,
  aoeHitPadding,
  type AoeArea
} from './aoeGeometry';
import { BotNavGrid, type NavHazard, type NavPoint } from './botNav';
import {
  pointSegmentDistance,
  raycastColliderDistance,
  sectorOverlapsCircle,
  segmentBlockedByColliders
} from './combat';
import { CONFIG, DEG } from './config';
import { isOvertimeMode } from './core/abilities/styles';
import { IDLE_INPUT, type DeviceInputSnapshot } from './input';
import { ITEM_DEFINITIONS, type PickupSpawn } from './items';
import { PICKUP_AVAILABLE, PICKUP_UNKNOWN } from './pickupKnowledge';
import type { MatchPlayerState } from './matchState';
import { otherTeams, type BotDifficulty } from './multiplayer';
import { maxHitRadius } from './roster';
import {
  respawnsForTeam,
  terrainAt,
  terrainAtCell,
  terrainTeam
} from './terrain';
import { typeEffectiveness } from './typeChart';
import { isTargetVisible, lineOfSightBlocked, terrainConcealment } from './vision';
import type { Collider } from './world';
import type {
  BotHazard,
  BotSquad,
  BotWorldView,
  EnemyThreatProfile,
  FightAssessment,
  HazardEvasion,
  IncomingThreat,
  InterruptPlan,
  PunishRead,
  TargetPrediction,
  Vec2
} from './ai/types';
import { EMPTY_BOT_WORLD_VIEW, NO_HAZARDS } from './ai/blackboard';
import { BotDecision, type BotDecisionContext } from './ai/decision';
import { clamp, directionTo, normalizeAngle } from './ai/math';
import { MatchupCache, type MatchupValues } from './ai/matchups';
import { BotMovement } from './ai/movement';
import { TUNING, type BotTuning } from './ai/tuning';

export { botVisionFactor } from './ai/tuning';
export { createBotSquad } from './ai/blackboard';

export type {
  BotDamageCommitment,
  BotEngageCall,
  BotFocus,
  BotHazard,
  BotHelpCall,
  BotPatrolClaim,
  BotPickupClaim,
  BotReviveClaim,
  BotSquad,
  BotWorldView,
  TeamBlackboard
} from './ai/types';

/**
 * Radio extra alrededor de cualquier base que los bots evitan al buscar
 * enemigos. Si patrullan dentro del respawn rival se quedan esperando a que
 * aparezca alguien; buscando por el mapa encuentran la pelea antes.
 */
const SEARCH_BASE_MARGIN = 6;
/** Distancia a la que se considera alcanzado un punto de búsqueda. */
const SEARCH_ARRIVE_DISTANCE = 2.2;
/** Separación mínima entre el bot y su siguiente punto de búsqueda. */
const SEARCH_MIN_DISTANCE = 7;

/** Segundos de retroceso cuando el desvío lateral no basta. */
const BACK_OFF_SECONDS = 0.9;

/**
 * Desplazamiento neto máximo para seguir considerando parado a un aliado. Un
 * bot empujado por otros puede moverse unos centímetros cada frame sin ir a
 * ningún sitio; medir la posición desde un ancla evita confundirlo con uno que
 * avanza de verdad.
 */
const ALLY_STILL_RADIUS = 0.35;
/** Tiempo que un aliado debe permanecer casi inmóvil para considerarlo parado. */
const ALLY_STILL_SECONDS = 0.35;
/** Radio alrededor del destino en el que un aliado detenido lo ocupa. */
const GOAL_OCCUPIED_RADIUS = 0.9;
/** Distancia al destino por debajo de la cual ya se considera alcanzado. */
const GOAL_ARRIVE_EPSILON = 0.5;
/** Radio en el que un aliado cercano puede estar bloqueando el avance. */
const ORBIT_ALLY_RADIUS = 2.2;
/** Tiempo sin acercarse al destino que delata un giro alrededor de un aliado. */
const ORBIT_PROGRESS_SECONDS = 1.5;
/** Mejora neta de distancia que cuenta como progreso real hacia el destino. */
const ORBIT_PROGRESS_GAIN = 0.35;
/** Segundos que se mantiene el paso lateral al rodear a un aliado parado. */
const ALLY_DETOUR_SECONDS = 0.75;

/**
 * Penalización al elegir objetivo por el daño que puede evitar ahora mismo.
 * Un rival invulnerable suma el máximo, y uno con escudo o buffs defensivos
 * solo la fracción mitigada: sigue siendo atacable si no hay otra opción.
 */
const MITIGATED_TARGET_PENALTY = 40;

/** Potencia a partir de la cual una habilidad se considera "grande". */
const BIG_ABILITY_POWER = 100;

/**
 * Diferencia de retardo que se considera empate al interrumpir. Por debajo de
 * este margen el orden depende del frame, así que vale más la precisión de la
 * habilidad que unos milisegundos de diferencia.
 */
const INTERRUPT_DELAY_TOLERANCE = 0.05;

/**
 * Radio en el que el poke rival se considera una amenaza para el startup. Solo
 * importa para valorar si la armadura de casteo aguanta el golpe más probable.
 */
const ARMOR_PRESSURE_RADIUS = 5.5;
/** Tope del bonus de armadura, para no convertirla en la única razón de lanzar. */
const ARMOR_BONUS_MAX = 16;

/**
 * Margen alrededor de un peligro ya lanzado. Se suma al radio propio y al
 * `hitRadius` del bot para decidir cuándo empieza a apartarse.
 */
const HAZARD_SAFETY_MARGIN = 0.12;
/** Margen extra para no quedarse justo en el borde de un área persistente. */
const HAZARD_AOE_MARGIN = 0.18;
/** Distancia que se comprueba al elegir una dirección de huida. */
const HAZARD_ESCAPE_STEP = 1.4;
/** Por debajo de esta velocidad un proyectil se trata como estático. */
const HAZARD_MIN_PROJECTILE_SPEED = 0.05;

/** Puntuación de revivir a un aliado caído con un área de apoyo. */
const SUPPORT_REVIVE_SCORE = 180;
/** Puntuación por cada fracción de vida que un área de apoyo cura a un aliado. */
const SUPPORT_ALLY_HEAL_SCORE = 110;
/** Fracción de vida que debe faltar a un aliado para que merezca la pena curarlo. */
const SUPPORT_MIN_MISSING_HP = 0.2;
/** Radio de rivales que penaliza revivir, porque el windup se puede cancelar. */
const SUPPORT_REVIVE_DANGER_RADIUS = 5;
/** Penalización por cada unidad de rival dentro de ese radio. */
const SUPPORT_REVIVE_DANGER_PENALTY = 30;

/**
 * Áreas cuyo `resolve` beneficia a los aliados. La habilidad lo declara con
 * `.bot({ healAllies: true })` o `.bot({ revive: true })`; así una resolución
 * propia no queda opaca para la IA.
 */

/** Mínimo de tiempo que dura una huida, aunque la base esté cerca. */
const RETREAT_MIN_SECONDS = 2.5;
/** Margen sobre el tiempo de trayecto para no cortar la huida antes de llegar. */
const RETREAT_TIME_MARGIN = 2;
/** Tope de seguridad para una huida; no es una duración fija. */
const RETREAT_MAX_SECONDS = 18;
/** Radio en el que se busca cobertura al iniciar una huida. */
const RETREAT_COVER_RADIUS = 6;
/** Espera antes de poder volver a huir tras llegar a la base sin curación. */
const RETREAT_COOLDOWN_SECONDS = 4;
/**
 * Radio de mundo en el que se busca un santuario propio al iniciar una huida.
 * Si no hay ninguno cerca, se mantiene la base como destino de siempre.
 */
const SANCTUARY_SEARCH_RADIUS = 32;
/** Bono al elegir un punto de regeneración dentro del propio santuario. */
const SANCTUARY_REGEN_BONUS = 5;
/**
 * Penalización al elegir como objetivo a un rival refugiado en su santuario.
 * Se aplica cuando está fuera del alcance útil: perseguirlo solo lleva al bot
 * a empujar contra el borde sin poder golpearlo.
 */
const SANCTUARY_TARGET_PENALTY = 6;

/**
 * En Rey de la colina la zona es el objetivo real. Un rival que se aleja más
 * que este margen del borde deja de disputarla: perseguirlo solo regala el
 * punto al equipo rival. Los bots vuelven a la colina en vez de seguirlo.
 */
const KOTH_CHASE_LEASH = 4;
/**
 * Margen sobre el alcance útil para seguir considerando peligroso a un rival
 * alejado de la zona. Si está a tiro, se le puede golpear sin abandonarla.
 */
const KOTH_HOLD_ATTACK_MARGIN = 2;
/** Bono de puntuación al elegir un rival que está dentro de la zona. */
const KOTH_ZONE_TARGET_BONUS = 7;
/** Peso del alejamiento de la zona al puntuar rivales fuera de ella. */
const KOTH_OFFZONE_TARGET_WEIGHT = 0.45;
/** Tope de la penalización por perseguir a un rival fuera del objetivo. */
const KOTH_OFFZONE_TARGET_MAX = 18;
/** Fracción del radio de la zona en la que se reparten los defensores. */
const KOTH_HOLD_RADIUS_FACTOR = 0.45;

/** Umbrales dinámicos de retirada según el intercambio y el número de vivos. */
const RETREAT_EXCHANGE_LOSS = 0.8;
const RETREAT_EXCHANGE_EDGE = 1.2;
const RETREAT_THRESHOLD_MIN = 0.12;
const RETREAT_THRESHOLD_MAX = 0.68;

/** Distancia a la que un rival visible impide esperar oculto. */
const REGEN_DANGER_RADIUS = 4.5;
/** Radio máximo al que se mueve un bot mientras regenera oculto. */
const REGEN_ROAM_RADIUS = 4.5;
/** Velocidad relativa al desplazarse en modo regeneración. */
const REGEN_MOVE_SCALE = 0.45;
/** Cada cuánto elige un nuevo punto oculto cercano. */
const REGEN_ROAM_INTERVAL = 1.6;
/** Cada cuánto comprueba que el punto elegido sigue siendo seguro. */
const REGEN_CHECK_INTERVAL = 0.3;
/** Espera antes de volver a buscar un punto oculto si no había ninguno. */
const REGEN_RETRY_SECONDS = 0.7;
/** Paso de muestreo al comprobar que el trayecto sigue oculto. */
const REGEN_SEGMENT_STEP = 0.4;
/** Ocultación mínima del destino cuando no hay rivales conocidos cerca. */
const REGEN_MIN_CONCEALMENT = 0.12;

/** Radio en el que un enemigo visible contamina el trayecto a un objeto. */
const PICKUP_PATH_THREAT_RADIUS = 4;
/** Distancia más allá del radio de la base enemiga que ya no se penaliza. */
const PICKUP_BASE_THREAT_RANGE = 10;
/**
 * Segundos que se recuerda el último estado visto de un objeto. Pasado ese
 * tiempo, si el equipo no vuelve a verlo, deja de ser candidato.
 */
const PICKUP_MEMORY_SECONDS = 10;
/** Tiempo que se descarta un objeto tras quedarse atascado yendo hacia él. */
const PICKUP_AVOID_SECONDS = 12;
/** Sin información de visión, ningún objeto tiene estado conocido. */
const NO_PICKUP_KNOWLEDGE = new Int8Array(0);

/** Tiempo mínimo que se mantiene un foco de equipo antes de cambiarlo. */
const FOCUS_HOLD_SECONDS = 3.5;
/** Duración de la reclamación de una poción. */
const PICKUP_CLAIM_SECONDS = 4;
/** Duración de la reclamación de un aliado caído para revivirlo. */
const REVIVE_CLAIM_SECONDS = 2.5;
/** Duración de la zona de patrulla reservada por un bot. */
const PATROL_CLAIM_SECONDS = 7;
/** Antigüedad máxima de las posiciones compartidas por el equipo. */
const SQUAD_LAST_SEEN_SECONDS = 8;
/** Ventana en la que se descuenta el daño ya comprometido por otros bots. */
const COMMITTED_DAMAGE_SECONDS = 1;
/** Vida por debajo de la cual un bot pide ayuda si le ven. */
const HELP_CALL_HP = 0.5;
const HELP_CALL_SECONDS = 3;

export class BotController {
  readonly slot: number;
  readonly difficulty: BotDifficulty;

  private readonly tuning: BotTuning;
  private readonly nav: BotNavGrid;
  private readonly squad: BotSquad;
  /** Movimiento táctico; su estado se comparte mediante accesores. */
  private readonly movement: BotMovement;
  /** Decisión de alto nivel; comparte el estado del controlador. */
  private readonly decision: BotDecision;
  /**
   * Ventajas de tipo por rival. Solo cambian con el clima o si el rival de esa
   * plaza es otro, así que `updateTarget` reutiliza el cálculo entre pasos.
   */
  private readonly matchups = new MatchupCache();

  private clock = 0;
  private atmosphere: AtmosphereId = 'clear';
  private target: MatchPlayerState | null = null;
  private targetVisible = false;
  /**
   * Mejor multiplicador de daño del bot contra el objetivo y del objetivo
   * contra el bot, con tipo y clima. Se calcula al elegir objetivo y guía tanto
   * el ataque como la cautela al moverse.
   */
  private targetMatchupOffense = 1;
  private targetMatchupDefense = 1;
  private visibleTimer = 0;
  /**
   * Rivales vivos del equipo contrario vistos por el bot. `updateTarget` lo
   * reconstruye en cada paso con ese filtro, así que sus consumidores pueden
   * recorrerlo sin hacer una copia.
   */
  private visibleEnemies: MatchPlayerState[] = [];
  private threat: IncomingThreat | null = null;
  /** Peligros ya lanzados (proyectiles y áreas persistentes) de este frame. */
  private hazards: readonly BotHazard[] = NO_HAZARDS;
  /** Buffer de peligros para A*; se reescribe en cada consulta. */
  private readonly navHazardScratch: NavHazard[] = [];
  /** Objetos del buffer anterior, conservados aunque la vista se recorte. */
  private readonly navHazardPool: NavHazard[] = [];
  /** Área de peligro compartida; no debe conservarse entre llamadas. */
  private readonly hazardAreaScratch: AoeArea = {
    shape: 'circle',
    x: 0,
    z: 0,
    radius: 0,
    dirX: 0,
    dirZ: 1,
    halfAngle: 0,
    circles: []
  };
  /** Observador y objetivo compartidos por las pruebas de cobertura. */
  private readonly sightObserver = { x: 0, z: 0, visionRange: 0 };
  private readonly sightTarget = { x: 0, z: 0 };
  /** Salida del peligro ya lanzado más urgente, o `null` si no hay ninguno. */
  private hazardEvasion: HazardEvasion | null = null;
  /** Error angular de apuntado vigente; cambia cada pocas decisiones. */
  private aimBias = 0;
  private aimBiasUntil = 0;
  private aimBiasTarget: MatchPlayerState | null = null;
  private lastSeen: {
    x: number;
    z: number;
    at: number;
    slot: number;
  } | null = null;
  /** Lecturas por rival de su windup actual, para no volver a tirar cada frame. */
  private punishReads = new Map<number, PunishRead>();
  /**
   * Momento estimado en el que cada habilidad rival vuelve a estar lista,
   * calculado desde que se le ve lanzarla. Evita consultar su cooldown exacto,
   * que un humano no puede leer.
   */
  private readonly enemyReadyAt = new Map<number, Float32Array>();
  /** Último cooldown observado de cada rival, para detectar lanzamientos. */
  private readonly enemyCooldownSeen = new Map<number, Float32Array>();
  /**
   * Duración total del último lanzamiento observado de cada rival. Incluye la
   * rampa de repetición, así que el DPS estimado no asume siempre el base.
   */
  private readonly enemyCooldownTotals = new Map<number, Float32Array>();

  private decisionTimer = 0;
  private abilitySlot: number | null = null;
  /**
   * `true` cuando la habilidad elegida es un área de apoyo centrada en el bot.
   * Esas habilidades no necesitan objetivo rival ni línea de visión, así que
   * `drive` las lanza por su cuenta en vez de esperar a ver un enemigo.
   */
  private supportCast = false;
  private useCommon = false;
  private retreat = false;
  /** Momento en el que una huida larga se da por terminada. */
  private retreatUntil = 0;
  /** Tras una huida infructuosa, espera antes de volver a intentarlo. */
  private retreatCooldownUntil = 0;
  /** Punto de cobertura intermedio elegido para romper la línea de visión. */
  private retreatCover: Vec2 | null = null;
  private retreatCoverUntil = 0;
  /** Celda propia de santuario a la que se retira, o `null` si no hay cerca. */
  private retreatSanctuary: Vec2 | null = null;
  /** `true` mientras espera oculto para curarse con Regeneración. */
  private recovering = false;
  private regenUntil = 0;
  private regenCooldownUntil = 0;
  /** Punto cercano al que se desplaza con cautela mientras regenera. */
  private regenGoal: Vec2 | null = null;
  private regenGoalTimer = 0;
  private regenCheckTimer = 0;
  private goal: Vec2 = { x: 0, z: 0 };
  /** Zona de control del modo actual, si existe. */
  private objective: { x: number; z: number; radius: number } | null = null;
  /**
   * `true` cuando el combate se interrumpe para volver a la colina. Evita que
   * un instinto como Impulso empuje al bot hacia un rival que ya no disputa el
   * objetivo.
   */
  private holdingObjective = false;
  /**
   * Objeto que ocupa el destino actual, o `null` si el destino es una patrulla,
   * una posición recordada o la base. Sirve para dar el último tramo en línea
   * recta: la rejilla infla los colliders con el radio del cuerpo y puede marcar
   * como bloqueada la celda de una poción que sí se alcanza a pie.
   */
  private goalPickup: PickupSpawn | null = null;

  /** Posiciones de objetos conocidas de antemano; nunca su estado. */
  private readonly pickups: readonly PickupSpawn[];
  /**
   * Estado de los objetos que el equipo ve en este frame (`PICKUP_AVAILABLE`,
   * `PICKUP_USED` o `PICKUP_UNKNOWN`), indexado por `PickupSpawn.id`.
   */
  private pickupKnowledge: Int8Array = NO_PICKUP_KNOWLEDGE;
  /**
   * Último estado visto de cada objeto, con el reloj en que se comprobó. Evita
   * olvidar que un objeto está usado en cuanto sale de visión.
   */
  private readonly pickupMemory = new Map<
    number,
    { available: boolean; at: number }
  >();
  /** Objetos descartados temporalmente tras un atasco camino de ellos. */
  private readonly pickupAvoidUntil = new Map<number, number>();
  /** Índice de respaldo para spawns sin `id` (tests o mapas antiguos). */
  private readonly pickupIndices = new Map<PickupSpawn, number>();
  /** Puntuación del objeto elegido en la última llamada a `pickupTarget`. */
  private pickupCandidatePriority = 0;

  private get path(): NavPoint[] {
    return this.movement.path;
  }
  private set path(value: NavPoint[]) {
    this.movement.path = value;
  }
  private get pathTimer(): number {
    return this.movement.pathTimer;
  }
  private set pathTimer(value: number) {
    this.movement.pathTimer = value;
  }

  private patrolTimer = 0;
  private get orbitSide(): number {
    return this.movement.orbitSide;
  }
  private set orbitSide(value: number) {
    this.movement.orbitSide = value;
  }
  private orbitTimer = 0;

  private lastX = 0;
  private lastZ = 0;
  private stuckTimer = 0;
  private detourTimer = 0;
  private detour: Vec2 = { x: 0, z: 0 };
  /** Lado que se prueba al desatascarse; se alterna en cada intento. */
  private get detourSide(): number {
    return this.movement.detourSide;
  }
  private set detourSide(value: number) {
    this.movement.detourSide = value;
  }
  /** Intentos de desvío seguidos sin progreso; a partir del segundo se retrocede. */
  private stuckCount = 0;
  private lastStuckAt = -Infinity;
  /** Posiciones recientes para poder deshacer el camino si queda bloqueado. */
  private get trail(): Vec2[] {
    return this.movement.trail;
  }
  private trailTimer = 0;
  private backOffTimer = 0;
  private backOffGoal: Vec2 = { x: 0, z: 0 };
  /** Aliado al que se le está cediendo el paso y hasta cuándo. */
  private get yieldSource(): MatchPlayerState | null {
    return this.movement.yieldSource;
  }
  private set yieldSource(value: MatchPlayerState | null) {
    this.movement.yieldSource = value;
  }
  private get yieldUntil(): number {
    return this.movement.yieldUntil;
  }
  private set yieldUntil(value: number) {
    this.movement.yieldUntil = value;
  }
  /** Ancla de posición de cada aliado para distinguir avance real de intención. */
  private readonly allyMotion = new Map<
    number,
    { anchorX: number; anchorZ: number; stillFor: number }
  >();
  /** Destino con el que se está midiendo el progreso y mejor distancia vista. */
  private progressGoal: Vec2 = { x: Infinity, z: Infinity };
  private progressDistance = Infinity;
  private progressTimer = 0;

  constructor(
    slot: number,
    difficulty: BotDifficulty,
    nav: BotNavGrid,
    squad: BotSquad,
    pickups: readonly PickupSpawn[] = []
  ) {
    this.slot = slot;
    this.difficulty = difficulty;
    this.tuning = TUNING[difficulty];
    this.nav = nav;
    this.squad = squad;
    this.pickups = pickups;
    pickups.forEach((pickup, index) => {
      if (pickup.id === undefined) this.pickupIndices.set(pickup, index);
    });
    this.movement = new BotMovement({
      nav,
      tuning: this.tuning,
      slot,
      currentGoal: () => this.goal,
      currentPickupGoal: () => this.goalPickup,
      clearPickupGoal: () => {
        this.goalPickup = null;
      },
      isRetreating: () => this.retreat,
      isRecovering: () => this.recovering,
      isTargetVisible: () => this.targetVisible,
      now: () => this.clock,
      hazardPathBlocked: (self, point) => this.hazardPathBlocked(self, point),
      navHazards: (self) => this.navHazards(self),
      avoidCurrentPickupGoal: (self) => this.avoidCurrentPickupGoal(self),
      abandonGoal: (self) => this.abandonGoal(self),
      isAllyStill: (other) => this.isAllyStill(other)
    });
    this.decision = new BotDecision(this.createDecisionContext());
    this.orbitSide = slot % 2 === 0 ? 1 : -1;
  }

  /** Fachada con el estado y los helpers que necesita `BotDecision`. */
  private createDecisionContext(): BotDecisionContext {
    const controller = this;
    return {
      tuning: this.tuning,
      state: {
        get clock() {
          return controller.clock;
        },
        get atmosphere() {
          return controller.atmosphere;
        },
        get target() {
          return controller.target;
        },
        set target(value) {
          controller.target = value;
        },
        get targetVisible() {
          return controller.targetVisible;
        },
        set targetVisible(value) {
          controller.targetVisible = value;
        },
        get targetMatchupOffense() {
          return controller.targetMatchupOffense;
        },
        set targetMatchupOffense(value) {
          controller.targetMatchupOffense = value;
        },
        get targetMatchupDefense() {
          return controller.targetMatchupDefense;
        },
        set targetMatchupDefense(value) {
          controller.targetMatchupDefense = value;
        },
        get hazardEvasion() {
          return controller.hazardEvasion;
        },
        set hazardEvasion(value) {
          controller.hazardEvasion = value;
        },
        get threat() {
          return controller.threat;
        },
        set threat(value) {
          controller.threat = value;
        },
        get visibleEnemies() {
          return controller.visibleEnemies;
        },
        set visibleEnemies(value) {
          controller.visibleEnemies = value;
        },
        get visibleTimer() {
          return controller.visibleTimer;
        },
        set visibleTimer(value) {
          controller.visibleTimer = value;
        },
        get abilitySlot() {
          return controller.abilitySlot;
        },
        set abilitySlot(value) {
          controller.abilitySlot = value;
        },
        get supportCast() {
          return controller.supportCast;
        },
        set supportCast(value) {
          controller.supportCast = value;
        },
        get useCommon() {
          return controller.useCommon;
        },
        set useCommon(value) {
          controller.useCommon = value;
        },
        get recovering() {
          return controller.recovering;
        },
        set recovering(value) {
          controller.recovering = value;
        },
        get regenUntil() {
          return controller.regenUntil;
        },
        set regenUntil(value) {
          controller.regenUntil = value;
        },
        get regenCooldownUntil() {
          return controller.regenCooldownUntil;
        },
        set regenCooldownUntil(value) {
          controller.regenCooldownUntil = value;
        },
        get regenGoal() {
          return controller.regenGoal;
        },
        set regenGoal(value) {
          controller.regenGoal = value;
        },
        get regenGoalTimer() {
          return controller.regenGoalTimer;
        },
        set regenGoalTimer(value) {
          controller.regenGoalTimer = value;
        },
        get regenCheckTimer() {
          return controller.regenCheckTimer;
        },
        set regenCheckTimer(value) {
          controller.regenCheckTimer = value;
        },
        get retreat() {
          return controller.retreat;
        },
        set retreat(value) {
          controller.retreat = value;
        },
        get retreatUntil() {
          return controller.retreatUntil;
        },
        set retreatUntil(value) {
          controller.retreatUntil = value;
        },
        get retreatCooldownUntil() {
          return controller.retreatCooldownUntil;
        },
        set retreatCooldownUntil(value) {
          controller.retreatCooldownUntil = value;
        },
        get retreatCover() {
          return controller.retreatCover;
        },
        set retreatCover(value) {
          controller.retreatCover = value;
        },
        get retreatCoverUntil() {
          return controller.retreatCoverUntil;
        },
        set retreatCoverUntil(value) {
          controller.retreatCoverUntil = value;
        },
        get retreatSanctuary() {
          return controller.retreatSanctuary;
        },
        set retreatSanctuary(value) {
          controller.retreatSanctuary = value;
        },
        get lastSeen() {
          return controller.lastSeen;
        },
        set lastSeen(value) {
          controller.lastSeen = value;
        },
        get patrolTimer() {
          return controller.patrolTimer;
        },
        set patrolTimer(value) {
          controller.patrolTimer = value;
        },
        get objective() {
          return controller.objective;
        },
        set objective(value) {
          controller.objective = value;
        },
        get path() {
          return controller.path;
        },
        set path(value) {
          controller.path = value;
        },
        get pathTimer() {
          return controller.pathTimer;
        },
        set pathTimer(value) {
          controller.pathTimer = value;
        }
      },
      retreatExchangeLoss: RETREAT_EXCHANGE_LOSS,
      regenDangerRadius: REGEN_DANGER_RADIUS,
      helpCallHp: HELP_CALL_HP,
      bigAbilityPower: BIG_ABILITY_POWER,
      releasePickupClaim: (self) => this.releasePickupClaim(self),
      releaseReviveClaims: (self) => this.releaseReviveClaims(self),
      clearPlannedDamage: (self) => this.clearPlannedDamage(self),
      nearestVisibleEnemyDistance: (self) =>
        this.nearestVisibleEnemyDistance(self),
      findHealSlot: (self) => this.findHealSlot(self),
      pickupTarget: (self) => this.pickupTarget(self),
      assessFight: (self, target, pickup, colliders) =>
        this.assessFight(self, target, pickup, colliders),
      stopRetreat: (cooldown) => this.stopRetreat(cooldown),
      nearestOwnSanctuaryPoint: (self) => this.nearestOwnSanctuaryPoint(self),
      retreatTime: (self, pickup) => this.retreatTime(self, pickup),
      pickRetreatCover: (self, colliders) =>
        this.pickRetreatCover(self, colliders),
      regenSegmentHidden: (self, point, colliders, enemies) =>
        this.regenSegmentHidden(self, point, colliders, enemies),
      claimPickup: (self, pickup) => this.claimPickup(self, pickup),
      setGoal: (goal, pickup) => this.setGoal(goal, pickup),
      chooseSupportAbility: (self, players, colliders) =>
        this.chooseSupportAbility(self, players, colliders),
      seekObjective: (self) => this.seekObjective(self),
      updatePatrol: (self) => this.updatePatrol(self),
      teamHelp: (self) => this.squad[self.team].help,
      squadLastSeen: (self) => this.squadLastSeen(self),
      isSupportSlot: (self, slot) => this.isSupportSlot(self, slot),
      supportScore: (self, players, def, colliders) =>
        this.supportScore(self, players, def, colliders),
      predictTarget: (self, target, def) =>
        this.predictTarget(self, target, def),
      canHitPrediction: (self, target, def, prediction, colliders) =>
        this.canHitPrediction(self, target, def, prediction, colliders),
      pickWithDecisionError: (candidates, bestSlot, bestScore, minScore) =>
        this.pickWithDecisionError(candidates, bestSlot, bestScore, minScore),
      claimSupportRevives: (self, players, def, colliders) =>
        this.claimSupportRevives(self, players, def, colliders),
      commitPlannedDamage: (self, target, slot) =>
        this.commitPlannedDamage(self, target, slot),
      castArmorAbsorbs: (target, def, damage) =>
        this.castArmorAbsorbs(target, def, damage),
      breaksCastArmor: (target, def, damage) =>
        this.breaksCastArmor(target, def, damage),
      committedDamageOn: (self, target) =>
        this.committedDamageOn(self, target),
      damageTakenFactor: (target, def) => this.damageTakenFactor(target, def),
      nextCastCooldown: (self, slot) => this.nextCastCooldown(self, slot),
      buffValue: (self, def, hpFraction) =>
        this.buffValue(self, def, hpFraction),
      countExtraAbilityTargets: (self, target, def, prediction, colliders) =>
        this.countExtraAbilityTargets(
          self,
          target,
          def,
          prediction,
          colliders
        ),
      armorCastBonus: (self, def) => this.armorCastBonus(self, def),
      repeatCooldownExtra: (self, slot) =>
        this.repeatCooldownExtra(self, slot),
      isSupportRecovery: (def) =>
        def.bot?.healAllies === true || def.bot?.revive === true,
      aoeEscapeDistance: (area, x, z) =>
        this.aoeEscapeDistance(area, x, z),
      effectiveSpeed: (player) => this.effectiveSpeed(player),
      statMultiplier: (player, stat) => this.statMultiplier(player, stat)
    };
  }

  update(
    dt: number,
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    colliders: readonly Collider[],
    knownPickups: Int8Array = NO_PICKUP_KNOWLEDGE,
    hazards: readonly BotHazard[] = NO_HAZARDS,
    view: BotWorldView = EMPTY_BOT_WORLD_VIEW
  ): DeviceInputSnapshot {
    this.clock += dt;
    this.atmosphere = view.atmosphere;
    this.objective = view.objective ?? null;
    this.holdingObjective = false;
    this.pickupKnowledge = knownPickups;
    this.rememberPickups(self);
    if (!self.alive) {
      const team = this.squad[self.team];
      if (team.help?.slot === self.slot) team.help = null;
      for (const [key, claim] of team.pickupClaims) {
        if (claim.slot === self.slot) team.pickupClaims.delete(key);
      }
      for (const [slot, claim] of team.reviveClaims) {
        if (claim.slot === self.slot) team.reviveClaims.delete(slot);
      }
      team.patrolClaims.delete(self.slot);
      this.resetCombatState();
      return { ...IDLE_INPUT };
    }

    this.hazards = hazards;
    this.updateTeamBlackboard(self, players);
    this.updateAllyMotion(dt, self, players);
    this.recordTrail(dt, self);
    this.updateTarget(dt, self, players, view);

    // Un dash, hitstun o una preparación que clava al lanzador consumen el
    // frame: el snapshot idle evita pulsar habilidades que el motor rechaza.
    // Las preparaciones con `moveWhileStartup` sí llegan a `drive`, que deja
    // mover al bot pero no dispara otra habilidad mientras canaliza.
    //
    // `threat` y `hazardEvasion` solo los consume `drive` (y `decide`, que
    // tampoco se ejecuta aquí), así que en un paso bloqueado no hace falta
    // recalcular su geometría: se refrescan en el primer paso que vuelva a
    // actuar, antes de usarlos. El resto del estado sí se mantiene al día.
    if (
      self.dash !== null ||
      self.stunTimer > 0 ||
      self.hurtTimer > 0 ||
      (self.activeCast !== null &&
        (!self.activeCast.def.moveWhileStartup ||
          self.activeCast.def.blockMovementDuringCast ||
          (self.activeCast.def.blockMovementUntilEndAnimation &&
            self.activeCast.elapsed < self.activeCast.plan.animationEndAt)))
    ) {
      return { ...IDLE_INPUT };
    }

    this.updateThreat(self, colliders);
    this.updateHazardEvasion(self, colliders);

    this.decisionTimer -= dt;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = this.tuning.decision;
      this.decide(self, players, colliders);
    }

    return this.drive(dt, self, players, colliders);
  }

  /**
   * Índice estable del objeto. `mapRuntime` asigna `id` al cargar el mapa; el
   * respaldo cubre spawns de tests o mapas antiguos sin id.
   */
  private pickupId(pickup: PickupSpawn): number {
    return pickup.id ?? this.pickupIndices.get(pickup) ?? -1;
  }

  /** Estado conocido del objeto, o `undefined` si el equipo no lo ve. */
  private knownPickupState(pickup: PickupSpawn): boolean | undefined {
    const id = this.pickupId(pickup);
    if (id < 0 || id >= this.pickupKnowledge.length) return undefined;
    const state = this.pickupKnowledge[id];
    if (state === PICKUP_UNKNOWN) return undefined;
    return state === PICKUP_AVAILABLE;
  }

  /** Guarda el estado visible de los objetos y descarta recuerdos caducados. */
  private rememberPickups(self: MatchPlayerState): void {
    const team = this.squad[self.team];
    for (const pickup of this.pickups) {
      const available = this.knownPickupState(pickup);
      if (available === undefined) continue;
      const id = this.pickupId(pickup);
      this.pickupMemory.set(id, { available, at: this.clock });
      // Si el equipo ve que ya se usó, la reclamación deja de tener sentido.
      if (!available) team.pickupClaims.delete(id);
    }
    for (const [id, entry] of this.pickupMemory) {
      if (this.clock - entry.at > PICKUP_MEMORY_SECONDS) {
        this.pickupMemory.delete(id);
      }
    }
  }

  /**
   * Tras varios atascos seguidos, descarta temporalmente el objeto que coincide
   * con el destino actual. Así `pickupTarget` no vuelve a fijarlo y el bot
   * regresa a patrullar en vez de empujar contra el obstáculo sin fin.
   */
  private avoidCurrentPickupGoal(self: MatchPlayerState): void {
    this.releasePickupClaim(self);
    for (const pickup of this.pickups) {
      if (Math.hypot(pickup.x - this.goal.x, pickup.z - this.goal.z) > 1.2) {
        continue;
      }
      this.pickupAvoidUntil.set(
        this.pickupId(pickup),
        this.clock + PICKUP_AVOID_SECONDS
      );
    }
  }

  private resetCombatState(): void {
    this.target = null;
    this.targetVisible = false;
    this.targetMatchupOffense = 1;
    this.targetMatchupDefense = 1;
    this.visibleTimer = 0;
    this.visibleEnemies.length = 0;
    this.threat = null;
    this.hazards = NO_HAZARDS;
    this.hazardEvasion = null;
    this.aimBias = 0;
    this.aimBiasUntil = 0;
    this.aimBiasTarget = null;
    this.lastSeen = null;
    this.punishReads.clear();
    this.matchups.clear();
    this.abilitySlot = null;
    this.supportCast = false;
    this.useCommon = false;
    this.retreat = false;
    this.retreatUntil = 0;
    this.retreatCooldownUntil = 0;
    this.retreatCover = null;
    this.retreatCoverUntil = 0;
    this.retreatSanctuary = null;
    this.recovering = false;
    this.regenUntil = 0;
    this.regenCooldownUntil = 0;
    this.regenGoal = null;
    this.regenGoalTimer = 0;
    this.regenCheckTimer = 0;
    this.holdingObjective = false;
    this.path = [];
    this.movement.invalidateStraightLine();
    this.stuckTimer = 0;
    this.detourTimer = 0;
    this.stuckCount = 0;
    this.lastStuckAt = -Infinity;
    this.trail.length = 0;
    this.trailTimer = 0;
    this.backOffTimer = 0;
    this.yieldSource = null;
    this.yieldUntil = 0;
    this.allyMotion.clear();
    this.progressGoal = { x: Infinity, z: Infinity };
    this.progressDistance = Infinity;
    this.progressTimer = 0;
  }

  /**
   * Actualiza la pizarra común: vivos de cada bando, llamada de equipo, ayuda
   * del aliado más urgente y caducidad de posiciones, reclamaciones y daño
   * comprometido.
   */
  private updateTeamBlackboard(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[]
  ): void {
    const team = this.squad[self.team];
    let allies = 0;
    let enemies = 0;
    for (const player of players) {
      if (!player.alive) {
        // Un cadáver no es una posición que merezca investigarse.
        team.lastSeen.delete(player.slot);
        if (this.lastSeen?.slot === player.slot) this.lastSeen = null;
        continue;
      }
      if (player.team === self.team) allies++;
      else enemies++;
    }
    team.aliveAllies = allies;
    team.aliveEnemies = enemies;
    team.engageCall =
      enemies > allies + 1 ? 'retreat' : enemies > allies ? 'group' : 'engage';

    const hpFraction = self.hp / Math.max(1, self.maxHp);
    if (hpFraction < HELP_CALL_HP && self.enemiesSeeing > 0) {
      if (
        !team.help ||
        team.help.slot === self.slot ||
        team.help.until <= this.clock ||
        hpFraction <= team.help.hpFraction
      ) {
        team.help = {
          slot: self.slot,
          x: self.x,
          z: self.z,
          hpFraction,
          until: this.clock + HELP_CALL_SECONDS
        };
      }
    } else if (team.help?.slot === self.slot) {
      team.help = null;
    }

    for (const [slot, seen] of team.lastSeen) {
      if (this.clock - seen.at > SQUAD_LAST_SEEN_SECONDS) {
        team.lastSeen.delete(slot);
      }
    }
    for (const [key, claim] of team.pickupClaims) {
      if (claim.until <= this.clock) team.pickupClaims.delete(key);
    }
    for (const [slot, claim] of team.reviveClaims) {
      if (claim.until <= this.clock) team.reviveClaims.delete(slot);
    }
    for (const [slot, claim] of team.patrolClaims) {
      if (claim.until <= this.clock) team.patrolClaims.delete(slot);
    }
    for (const [key, commitment] of team.committedDamage) {
      if (commitment.until <= this.clock) team.committedDamage.delete(key);
    }
    if (team.help && team.help.until <= this.clock) team.help = null;
  }

  /**
   * Devuelve la lectura del windup actual del rival. La tirada se hace una vez
   * por lanzamiento: el bot decide si lo castiga, con cuánto error calcula el
   * tiempo restante y cuánto tarda en reaccionar. Un error positivo le hace
   * creer que tiene más margen y puede lanzar una habilidad demasiado lenta;
   * uno negativo puede hacerle descartar una interrupción que sí habría
   * llegado. La reacción variable hace que una preparación corta le pille
   * todavía empezando a reaccionar.
   */
  private readPunish(enemy: MatchPlayerState): PunishRead | null {
    const pending = enemy.activeCast;
    if (!pending) return null;
    const known = this.punishReads.get(enemy.slot);
    if (known && known.cast === pending) return known;

    const read: PunishRead = {
      cast: pending,
      commit: Math.random() < this.tuning.punishChance,
      remainingError:
        (Math.random() * 2 - 1) * this.tuning.punishTimingError,
      readyAt:
        this.clock +
        this.tuning.punishReaction * (0.6 + Math.random() * 0.8)
    };
    this.punishReads.set(enemy.slot, read);
    return read;
  }

  /**
   * Guarda posiciones recientes. Si el bot se queda bloqueado, retroceder por
   * este rastro le permite salir de un pasillo o de un choque de frente sin
   * quedarse empujando contra el obstáculo.
   */
  private recordTrail(dt: number, self: MatchPlayerState): void {
    this.trailTimer -= dt;
    if (this.trailTimer > 0) return;
    this.trailTimer = 0.15;
    this.trail.push({ x: self.x, z: self.z });
    if (this.trail.length > 24) this.trail.shift();
  }

  /**
   * Guarda cuánto se ha movido de verdad cada aliado. `vx`/`vz` es la
   * intención de movimiento: un bot atascado contra una pared o contra otro
   * cuerpo puede tenerlas altas sin desplazarse. Sin esta distinción, sus
   * compañeros creen que se les echa encima y ceden el paso en bucle.
   *
   * Se compara con un ancla y no con el frame anterior: el cuerpo de un bot
   * parado puede ser empujado unos milímetros por sus compañeros y, aun así,
   * no está avanzando hacia ningún sitio.
   */
  private updateAllyMotion(
    dt: number,
    self: MatchPlayerState,
    players: readonly MatchPlayerState[]
  ): void {
    for (const other of players) {
      if (other === self || other.team !== self.team) continue;
      if (!other.alive) {
        this.allyMotion.delete(other.slot);
        continue;
      }
      const previous = this.allyMotion.get(other.slot);
      if (!previous) {
        this.allyMotion.set(other.slot, {
          anchorX: other.x,
          anchorZ: other.z,
          stillFor: 0
        });
        continue;
      }
      const drift = Math.hypot(
        other.x - previous.anchorX,
        other.z - previous.anchorZ
      );
      if (drift > ALLY_STILL_RADIUS) {
        previous.anchorX = other.x;
        previous.anchorZ = other.z;
        previous.stillFor = 0;
      } else {
        previous.stillFor += dt;
      }
    }
  }

  /** `true` si el aliado lleva un rato sin desplazarse realmente. */
  private isAllyStill(other: MatchPlayerState): boolean {
    const motion = this.allyMotion.get(other.slot);
    return motion !== undefined && motion.stillFor >= ALLY_STILL_SECONDS;
  }

  /** Aliado vivo más cercano, o `null` si no hay ninguno. */
  private nearestAlly(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[]
  ): MatchPlayerState | null {
    let nearest: MatchPlayerState | null = null;
    let best = Infinity;
    for (const other of players) {
      if (other === self || !other.alive || other.team !== self.team) continue;
      const distance = Math.hypot(other.x - self.x, other.z - self.z);
      if (distance < best) {
        best = distance;
        nearest = other;
      }
    }
    return nearest;
  }

  /** Distancia al aliado vivo más cercano, o `Infinity` si no hay ninguno. */
  private nearestAllyDistance(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[]
  ): number {
    const nearest = this.nearestAlly(self, players);
    return nearest
      ? Math.hypot(nearest.x - self.x, nearest.z - self.z)
      : Infinity;
  }

  /**
   * ¿Otro aliado ya llegó y se quedó parado en el destino de este bot? Varios
   * bots que persiguen la misma última posición vista acaban apilados; el que
   * llega último debe buscar otro objetivo, no orbitar al primero.
   */
  private goalTakenByAlly(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[]
  ): boolean {
    const selfDistance = Math.hypot(
      this.goal.x - self.x,
      this.goal.z - self.z
    );
    if (selfDistance <= GOAL_ARRIVE_EPSILON) return false;

    for (const other of players) {
      if (other === self || !other.alive || other.team !== self.team) continue;
      if (!this.isAllyStill(other)) continue;
      const distance = Math.hypot(
        other.x - this.goal.x,
        other.z - this.goal.z
      );
      if (distance <= GOAL_OCCUPIED_RADIUS && distance < selfDistance - 0.15) {
        return true;
      }
    }
    return false;
  }

  /** Descarta el destino ocupado y vuelve a patrullar por otra zona. */
  private abandonGoal(self: MatchPlayerState): void {
    this.avoidCurrentPickupGoal(self);
    this.lastSeen = null;
    this.patrolTimer = 0;
    this.path = [];
    this.pathTimer = 0;
    this.resetProgress();
    this.updatePatrol(self);
  }

  /**
   * Detecta que el bot avanza en círculo alrededor de un aliado sin acercarse
   * a su destino. Solo cuenta si la línea hasta el destino está despejada y
   * hay un aliado cerca: así no confunde una ruta larga que rodea una pared
   * con una órbita.
   */
  private orbitStalled(
    dt: number,
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    steeringToGoal: boolean,
    casting: boolean
  ): boolean {
    if (!steeringToGoal || casting) {
      this.resetProgress();
      return false;
    }

    const goalDistance = Math.hypot(
      this.goal.x - self.x,
      this.goal.z - self.z
    );
    if (goalDistance <= GOAL_ARRIVE_EPSILON) {
      this.resetProgress();
      return false;
    }

    const nearAlly = this.nearestAllyDistance(self, players) <= ORBIT_ALLY_RADIUS;
    if (
      !nearAlly ||
      !this.nav.lineClear(
        self.x,
        self.z,
        this.goal.x,
        this.goal.z,
        undefined,
        self.team
      )
    ) {
      this.resetProgress();
      return false;
    }

    const goalMoved = Math.hypot(
      this.goal.x - this.progressGoal.x,
      this.goal.z - this.progressGoal.z
    );
    if (goalMoved > 0.5) {
      this.progressGoal = { ...this.goal };
      this.progressDistance = goalDistance;
      this.progressTimer = 0;
      return false;
    }

    // Se mide el progreso neto de una ventana completa, no el mejor acercamiento
    // visto. Al girar alrededor de un aliado la distancia al destino oscila: el
    // punto más cercano de cada vuelta daba «progreso» y reiniciaba el contador
    // antes de que la órbita se detectara.
    this.progressTimer += dt;
    if (this.progressTimer < ORBIT_PROGRESS_SECONDS) return false;

    const gained = this.progressDistance - goalDistance;
    this.progressDistance = goalDistance;
    this.progressTimer = 0;
    if (gained > ORBIT_PROGRESS_GAIN) return false;

    this.resetProgress();
    return true;
  }

  private resetProgress(): void {
    this.progressGoal = { x: Infinity, z: Infinity };
    this.progressDistance = Infinity;
    this.progressTimer = 0;
  }

  private updateTarget(
    dt: number,
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    view: BotWorldView
  ): void {
    let best: MatchPlayerState | null = null;
    let bestScore = Infinity;
    let bestOffense = 1;
    let bestDefense = 1;
    // El array se reutiliza entre pasos: los consumidores lo leen durante este
    // mismo `update` y no guardan la lista.
    this.visibleEnemies.length = 0;
    const team = this.squad[self.team];
    const focus = team.focus;
    if (focus.until <= this.clock) focus.slot = null;
    const isLeader = this.teamLeaderSlot(self, players) === self.slot;

    for (const enemy of players) {
      if (enemy === self || enemy.team === self.team || !enemy.alive) continue;
      // La visibilidad y su histéresis se calculan una sola vez por frame para
      // todo el equipo en `game.ts`; aquí solo se consulta el conjunto.
      const visible = view.visibleSlots.has(enemy.slot);
      if (!visible) continue;
      this.visibleEnemies.push(enemy);
      this.observeEnemyCooldowns(enemy);
      // Memoria compartida: cualquier rival que vea el equipo deja su última
      // posición para que los demás puedan investigar cuando se oculte.
      team.lastSeen.set(enemy.slot, {
        x: enemy.x,
        z: enemy.z,
        at: this.clock
      });

      const distance = Math.hypot(enemy.x - self.x, enemy.z - self.z);
      const hpFraction = enemy.hp / Math.max(1, enemy.maxHp);
      const matchup = this.matchupFor(self, enemy);
      const offense = matchup.offense;
      const defense = matchup.defense;
      const typeWeight = this.tuning.matchupWeight;
      const sheltered =
        terrainTeam(terrainAt(enemy.x, enemy.z)) === enemy.team;
      // Los remates valen más que perseguir al tanque lleno. El pequeño sesgo
      // por distancia evita que dos bots crucen el mapa por el mismo herido.
      let score = distance + hpFraction * 7 - (1 - hpFraction) * 4;
      // Un rival dentro de su propio santuario no se puede perseguir cuerpo a
      // cuerpo. Si está fuera del alcance útil, se le resta prioridad: el bot
      // busca otra pelea en vez de empujar contra el borde del santuario.
      if (sheltered) {
        const reach = this.maxUsefulRange(this.selectedDef(self), enemy);
        if (distance > reach + 0.5) score += SANCTUARY_TARGET_PENALTY;
      }
      // En Rey de la colina el rival que disputa la zona vale más que uno que
      // huye lejos de ella. El bono por estar dentro inclina el foco hacia la
      // pelea que da puntos; la penalización exterior evita que un rival
      // corriendo al otro lado del mapa arrastre al bot fuera de la colina.
      if (this.objective) {
        const offObjective =
          Math.hypot(
            enemy.x - this.objective.x,
            enemy.z - this.objective.z
          ) - this.objective.radius;
        if (offObjective <= 0) {
          score -= KOTH_ZONE_TARGET_BONUS;
        } else {
          score += Math.min(
            KOTH_OFFZONE_TARGET_MAX,
            offObjective * KOTH_OFFZONE_TARGET_WEIGHT
          );
        }
      }
      if (this.target === enemy) score -= 1.5;
      // Foco de equipo: varios bots eligen al mismo objetivo mientras siga
      // visible, en vez de repartirse al azar por el mapa.
      if (focus.slot === enemy.slot) score -= 3.5;

      // Preferencia ofensiva: buscar al rival al que nuestros ataques le hacen
      // más daño y evitar a los que resisten. La escala plana mueve el daño un
      // 5-15 %, así que se traduce a puntos con una pendiente fuerte pero
      // acotada: una ventaja leve pesa como unos metros y una doble ventaja no
      // domina por sí sola la decisión (el clima también entra aquí).
      const offenseEdge = offense - 1;
      if (offenseEdge > 0) {
        score -= Math.min(10, offenseEdge * 90) * typeWeight;
      } else if (offenseEdge < 0) {
        score += Math.min(4, -offenseEdge * 30) * typeWeight;
      }
      // Cautela defensiva: un rival que nos pega súper eficaz es peligroso
      // aunque esté herido. Si su daño nos resulta poco eficaz, es una pelea
      // cómoda. Misma escala acotada que la preferencia ofensiva.
      const defenseEdge = defense - 1;
      if (defenseEdge > 0) {
        score += Math.min(8, defenseEdge * 70) * typeWeight;
      } else if (defenseEdge < 0) {
        score -= Math.min(4, -defenseEdge * 40) * typeWeight;
      }
      // Protección temporal: un rival invulnerable no recibe ningún golpe y
      // uno con escudo o buffs defensivos recibe menos. Sin esta penalización
      // el bot podía gastar la definitiva en alguien que acaba de reaparecer.
      // Solo se mira si la protección está activa, no cuántos segundos exactos
      // le quedan: ese dato no está a la vista del jugador.
      const protection =
        enemy.invulnerableTimer > 0 ? 1 : 1 - this.damageTakenFactor(enemy, null);
      if (protection > 0) score += protection * MITIGATED_TARGET_PENALTY;

      const pending = enemy.activeCast;
      if (pending) {
        const remaining = pending.effectAt - pending.elapsed;
        const read = this.readPunish(enemy);
        // Si su armadura absorbe todos los golpes que el bot tiene listos, el
        // windup no es una ventana de castigo: solo un rival que sigue siendo
        // un objetivo normal.
        if (
          remaining > 0 &&
          read?.commit &&
          this.canBreakCast(self, enemy)
        ) {
          // Un rival preparando una habilidad es una ventana: si está clavado,
          // se convierte en el objetivo prioritario. La amenaza concreta se
          // resuelve aparte en `updateThreat`. La tirada de `readPunish` hace
          // que no todos los bots detecten o aprovechen cada windup.
          score -= this.tuning.punishBonus;
          if (
            !pending.def.moveWhileStartup ||
            pending.def.blockMovementDuringCast ||
            pending.def.blockMovementUntilEndAnimation
          ) {
            score -= 1.5;
          }
        }
      }

      if (score < bestScore) {
        bestScore = score;
        best = enemy;
        bestOffense = offense;
        bestDefense = defense;
      }
    }

    const chosen = best;
    const chosenOffense = chosen ? bestOffense : 1;
    const chosenDefense = chosen ? bestDefense : 1;
    this.targetMatchupOffense = chosenOffense;
    this.targetMatchupDefense = chosenDefense;

    if (chosen !== this.target) {
      this.visibleTimer = 0;
      this.abilitySlot = null;
    }
    this.target = chosen;
    this.targetVisible = chosen !== null;

    if (chosen) {
      // Solo el líder del equipo cambia el foco, y lo mantiene varios segundos.
      // Así dos bots no se pasan el objetivo el uno al otro cada frame.
      if (isLeader) {
        const focusEnemy =
          focus.slot === null
            ? null
            : players.find(
                (player) =>
                  player.team !== self.team && player.slot === focus.slot
              ) ?? null;
        const focusUsable =
          focusEnemy !== null &&
          focusEnemy.alive &&
          this.visibleEnemies.includes(focusEnemy);
        if (focus.slot === null || !focusUsable) {
          focus.slot = chosen.slot;
          focus.until = this.clock + FOCUS_HOLD_SECONDS;
        } else if (focus.slot === chosen.slot) {
          focus.until = this.clock + FOCUS_HOLD_SECONDS;
        }
      }
      this.visibleTimer += dt;
      this.lastSeen = {
        x: chosen.x,
        z: chosen.z,
        at: this.clock,
        slot: chosen.slot
      };
    } else if (
      this.lastSeen &&
      this.clock - this.lastSeen.at > this.tuning.memory
    ) {
      this.lastSeen = null;
    }
  }

  /** El bot vivo con el slot más bajo del equipo fija el foco compartido. */
  private teamLeaderSlot(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[]
  ): number {
    let leader = self.slot;
    for (const player of players) {
      if (!player.alive || player.team !== self.team || !player.isBot) continue;
      leader = Math.min(leader, player.slot);
    }
    return leader;
  }

  /** Posición compartida más reciente todavía dentro de la memoria del bot. */
  private squadLastSeen(self: MatchPlayerState): { x: number; z: number } | null {
    let best: { x: number; z: number; at: number } | null = null;
    for (const seen of this.squad[self.team].lastSeen.values()) {
      if (this.clock - seen.at > this.tuning.memory) continue;
      if (!best || seen.at > best.at) best = seen;
    }
    return best ? { x: best.x, z: best.z } : null;
  }

  /**
   * Detecta el windup visible más urgente. Solo cuenta como amenaza si el bot
   * está dentro del área, cono o línea que va a golpear; si está fuera, el
   * rival queda como objetivo para castigarlo.
   */
  private updateThreat(
    self: MatchPlayerState,
    colliders: readonly Collider[]
  ): void {
    let best: IncomingThreat | null = null;
    for (const enemy of this.visibleEnemies) {
      const threat = this.threatFrom(self, enemy, colliders);
      if (threat && (!best || threat.severity > best.severity)) best = threat;
    }
    this.threat = best;
  }

  private threatFrom(
    self: MatchPlayerState,
    enemy: MatchPlayerState,
    colliders: readonly Collider[]
  ): IncomingThreat | null {
    const pending = enemy.activeCast;
    if (!pending) return null;
    const remaining = pending.effectAt - pending.elapsed;
    if (remaining <= 0.02) return null;
    const def = pending.def;
    if (
      def.props.power <= 0 &&
      def.props.slow === null &&
      def.props.dot === null &&
      def.selfDamage <= 0 &&
      def.bot?.customDamage !== true &&
      def.bot?.customControl !== true
    ) {
      return null;
    }

    const selfRadius = self.hitRadius;
    const toSelfX = self.x - enemy.x;
    const toSelfZ = self.z - enemy.z;
    const distance = Math.hypot(toSelfX, toSelfZ);
    const dirX = Math.sin(enemy.facing);
    const dirZ = Math.cos(enemy.facing);

    if (def.shape === 'aoe') {
      const area = aoeAreaFrom(
        def,
        pending.targetX,
        pending.targetZ,
        pending.dirX,
        pending.dirZ
      );
      // La geometría debe coincidir con `resolveAoeHit`: el cuerpo del rival
      // cuenta desde el borde del radio o del cono, no desde su centro.
      if (
        !aoeContains(area, self.x, self.z, selfRadius, aoeHitPadding(def))
      ) {
        return null;
      }
      // El área tampoco golpea a través de un muro.
      if (
        segmentBlockedByColliders(
          area.x,
          area.z,
          self.x,
          self.z,
          colliders
        )
      ) {
        return null;
      }

      // Cuánto se tarda en salir del área; los bots difíciles reaccionan
      // antes y los fáciles esperan demasiado.
      const escapeDistance = this.aoeEscapeDistance(
        area,
        self.x,
        self.z
      );
      const escapeTime =
        escapeDistance / Math.max(2.5, this.effectiveSpeed(self)) + 0.08;
      if (remaining > Math.max(this.tuning.evadeWindow, escapeTime)) return null;

      const evade = this.aoeEvadeDirection(area, self);
      const dangerRadius = area.radius + maxHitRadius();
      const fromCenter = aoeDistance(area, self.x, self.z);
      // En un área con ticks, la amenaza es la potencia total expuesta, no el
      // daño por segundo. Se limita la exposición para no disparar la prioridad
      // de áreas muy largas.
      const exposure = isOvertimeMode(def.aoeDamageMode)
        ? Math.min(def.aoeDuration, 3)
        : 1;
      return {
        source: enemy,
        remaining,
        evade,
        severity:
          def.props.power * exposure +
          20 +
          (1 - fromCenter / Math.max(0.001, dangerRadius)) * 30
      };
    }

    if (remaining > this.tuning.evadeWindow) return null;

    if (def.shape === 'melee') {
      // Misma comprobación que `executeMelee`: el cono dibuja
      // `range + maxHitRadius()` y el cuerpo del objetivo se cuenta desde el
      // borde, con el radio angular que aporta su hurtbox.
      if (
        !sectorOverlapsCircle(
          enemy.x,
          enemy.z,
          enemy.facing,
          def.halfAngle * DEG,
          def.range + maxHitRadius(),
          self.x,
          self.z,
          selfRadius
        )
      ) {
        return null;
      }
      if (
        segmentBlockedByColliders(
          enemy.x,
          enemy.z,
          self.x,
          self.z,
          colliders,
          CONFIG.combat.meleeSightPadding
        )
      ) {
        return null;
      }

      const away =
        distance > 0.001
          ? { x: toSelfX / distance, z: toSelfZ / distance }
          : { x: -dirX, z: -dirZ };
      const side = { x: -dirZ * this.orbitSide, z: dirX * this.orbitSide };
      const evadeX = away.x + side.x * 0.8;
      const evadeZ = away.z + side.z * 0.8;
      const length = Math.hypot(evadeX, evadeZ) || 1;
      return {
        source: enemy,
        remaining,
        evade: { x: evadeX / length, z: evadeZ / length },
        severity: def.props.power + 15
      };
    }

    if (def.shape === 'dash') {
      // `stepDash` recorta el desplazamiento al primer collider y golpea con
      // `max(0.5, radius) + hitRadius` desde el barrido real.
      const stop = Math.max(
        0.1,
        raycastColliderDistance(
          enemy.x,
          enemy.z,
          dirX,
          dirZ,
          def.dashDistance,
          colliders,
          CONFIG.player.radius
        )
      );
      const endX = enemy.x + dirX * stop;
      const endZ = enemy.z + dirZ * stop;
      const dashReach = Math.max(0.5, def.radius) + selfRadius;
      const toSweep = pointSegmentDistance(
        self.x,
        self.z,
        enemy.x,
        enemy.z,
        endX,
        endZ
      );
      if (toSweep > dashReach) return null;
      if (toSelfX * dirX + toSelfZ * dirZ < -selfRadius) return null;

      const away =
        distance > 0.001
          ? { x: toSelfX / distance, z: toSelfZ / distance }
          : { x: -dirX, z: -dirZ };
      const side = { x: -dirZ * this.orbitSide, z: dirX * this.orbitSide };
      const evadeX = away.x + side.x * 0.8;
      const evadeZ = away.z + side.z * 0.8;
      const length = Math.hypot(evadeX, evadeZ) || 1;
      return {
        source: enemy,
        remaining,
        evade: { x: evadeX / length, z: evadeZ / length },
        severity: def.props.power + 18 + (1 - toSweep / dashReach) * 22
      };
    }

    if (def.shape === 'projectile' || def.shape === 'beam') {
      // Un haz con `moveWhileStartup` deja mover al lanzador durante la carga y
      // `executeBeam` recalcula la dirección desde su posición actual hasta el
      // extremo fijado en `activeCast`. La amenaza debe usar ese mismo vector:
      // con el `facing` actual se esquivaría un carril que ya no es el real.
      let aimX = dirX;
      let aimZ = dirZ;
      let reach = def.range;
      if (def.shape === 'beam') {
        const toTargetX = pending.targetX - enemy.x;
        const toTargetZ = pending.targetZ - enemy.z;
        const targetDistance = Math.hypot(toTargetX, toTargetZ);
        if (targetDistance > 0.001) {
          aimX = toTargetX / targetDistance;
          aimZ = toTargetZ / targetDistance;
          // El haz termina en el extremo fijado, así que ese es su alcance real.
          reach = targetDistance;
        }
      }

      const projection = toSelfX * aimX + toSelfZ * aimZ;
      const alongLimit =
        def.shape === 'beam'
          ? reach + selfRadius
          : reach + def.radius + selfRadius;
      if (projection < -selfRadius || projection > alongLimit) return null;

      const perpX = toSelfX - aimX * projection;
      const perpZ = toSelfZ - aimZ * projection;
      const perpendicular = Math.hypot(perpX, perpZ);
      // El haz y el proyectil usan el cuerpo del objetivo desde el borde.
      const width =
        def.shape === 'beam'
          ? def.radius + maxHitRadius() + selfRadius
          : def.radius + selfRadius;
      if (perpendicular > width) return null;

      // Ni el haz ni el proyectil atraviesan un obstáculo antes de llegar.
      const hitAlong = Math.max(0, Math.min(projection, reach));
      if (def.shape === 'beam') {
        if (
          segmentBlockedByColliders(
            enemy.x,
            enemy.z,
            self.x,
            self.z,
            colliders
          )
        ) {
          return null;
        }
      } else if (
        segmentBlockedByColliders(
          enemy.x,
          enemy.z,
          enemy.x + aimX * hitAlong,
          enemy.z + aimZ * hitAlong,
          colliders,
          Math.max(0.05, def.radius)
        )
      ) {
        return null;
      }

      let evadeX = perpX;
      let evadeZ = perpZ;
      if (perpendicular < 0.05) {
        evadeX = -aimZ * this.orbitSide;
        evadeZ = aimX * this.orbitSide;
      }
      const length = Math.hypot(evadeX, evadeZ) || 1;
      return {
        source: enemy,
        remaining,
        evade: { x: evadeX / length, z: evadeZ / length },
        severity: def.props.power + (1 - perpendicular / width) * 18
      };
    }

    return null;
  }

  /**
   * Distancia hasta el borde del área más cercano al bot. En un círculo es la
   * diferencia con el radio; en un cono se elige el menor entre salir por la
   * punta y salir por uno de los lados.
   */
  private aoeEscapeDistance(
    area: AoeArea,
    x: number,
    z: number
  ): number {
    if (area.shape === 'circle') {
      // La unión de círculos se escapa por el borde más cercano: se toma el
      // círculo con mayor penetración (el que obliga a recorrer más distancia).
      if (area.circles.length === 0) {
        return Math.max(0, area.radius - aoeDistance(area, x, z));
      }
      let depth = 0;
      for (const circle of area.circles) {
        depth = Math.max(
          depth,
          circle.radius - Math.hypot(x - circle.x, z - circle.z)
        );
      }
      return Math.max(0, depth);
    }
    const toX = x - area.x;
    const toZ = z - area.z;
    const along = toX * area.dirX + toZ * area.dirZ;
    const lateral = Math.abs(toX * area.dirZ - toZ * area.dirX);
    const radial = Math.max(0, area.radius - along);
    const angular = Math.max(
      0,
      along * Math.tan(area.halfAngle) - lateral
    );
    return Math.min(radial, angular);
  }

  /**
   * Dirección de huida de un área. En los círculos es radial; en los conos se
   * escapa por el lado más cercano o hacia atrás si el bot está sobre el eje.
   */
  private aoeEvadeDirection(area: AoeArea, self: MatchPlayerState): Vec2 {
    const toX = self.x - area.x;
    const toZ = self.z - area.z;
    if (area.shape === 'circle') {
      // El patrón puede tener varios círculos: se huye del centro más cercano.
      let originX = area.x;
      let originZ = area.z;
      if (area.circles.length > 0) {
        let best = Infinity;
        for (const circle of area.circles) {
          const distance = Math.hypot(
            self.x - circle.x,
            self.z - circle.z
          );
          if (distance < best) {
            best = distance;
            originX = circle.x;
            originZ = circle.z;
          }
        }
      }
      const awayX = self.x - originX;
      const awayZ = self.z - originZ;
      const length = Math.hypot(awayX, awayZ);
      if (length < 0.15) {
        return { x: -area.dirX, z: -area.dirZ };
      }
      return { x: awayX / length, z: awayZ / length };
    }

    const along = toX * area.dirX + toZ * area.dirZ;
    const lateral = toX * area.dirZ - toZ * area.dirX;
    if (Math.abs(lateral) > 0.15) {
      const sign = lateral >= 0 ? 1 : -1;
      return { x: area.dirZ * sign, z: -area.dirX * sign };
    }
    if (along > 0.2) {
      return { x: -area.dirX, z: -area.dirZ };
    }
    return {
      x: area.dirZ * this.orbitSide,
      z: -area.dirX * this.orbitSide
    };
  }

  /**
   * Geometría de un peligro de área ya lanzado. Devuelve un objeto compartido
   * por el bot: hay que usarlo en el acto y no guardarlo entre llamadas.
   */
  private hazardArea(hazard: BotHazard): Readonly<AoeArea> {
    const area = this.hazardAreaScratch;
    area.shape = hazard.shape ?? 'circle';
    area.x = hazard.x;
    area.z = hazard.z;
    area.radius = hazard.radius;
    area.dirX = hazard.dirX ?? 0;
    area.dirZ = hazard.dirZ ?? 1;
    area.halfAngle = hazard.halfAngle ?? 0;
    area.circles = hazard.circles ?? [];
    return area;
  }

  /**
   * Elige el peligro ya lanzado que más urge esquivar. A diferencia de
   * `updateThreat`, aquí no hay windup: el proyectil o el área ya existen y el
   * bot debe salir de su trayectoria sin esperar a que el rival vuelva a actuar.
   */
  private updateHazardEvasion(
    self: MatchPlayerState,
    colliders: readonly Collider[]
  ): void {
    let best: HazardEvasion | null = null;
    for (const hazard of this.hazards) {
      if (hazard.ownerTeam === self.team) continue;
      const evasion = this.hazardEvasionFrom(self, hazard, colliders);
      if (evasion && (!best || evasion.severity > best.severity)) {
        best = evasion;
      }
    }
    this.hazardEvasion = best;
  }

  private hazardEvasionFrom(
    self: MatchPlayerState,
    hazard: BotHazard,
    colliders: readonly Collider[]
  ): HazardEvasion | null {
    const remaining = hazard.remaining ?? Infinity;
    if (remaining <= 0) return null;

    if (hazard.kind === 'projectile') {
      const vx = hazard.vx ?? 0;
      const vz = hazard.vz ?? 0;
      const speed = Math.hypot(vx, vz);
      if (speed < HAZARD_MIN_PROJECTILE_SPEED) return null;

      const toSelfX = self.x - hazard.x;
      const toSelfZ = self.z - hazard.z;
      const along = toSelfX * vx + toSelfZ * vz;
      // Un proyectil que ya pasó de largo solo importa si el bot está encima
      // de su radio en este instante.
      const timeToClosest =
        along > 0 ? Math.min(along / (speed * speed), remaining) : 0;
      const closestX = hazard.x + vx * timeToClosest;
      const closestZ = hazard.z + vz * timeToClosest;
      const distance = Math.hypot(self.x - closestX, self.z - closestZ);
      const dangerRadius =
        hazard.radius + self.hitRadius + HAZARD_SAFETY_MARGIN;
      if (distance > dangerRadius) return null;

      // La reacción depende de la dificultad: los bots fáciles reaccionan más
      // tarde y los expertos empiezan a apartarse antes.
      const horizon = Math.max(
        0.2,
        0.3 + this.tuning.evadeWindow * 0.6
      );
      if (timeToClosest > horizon) return null;

      // Un obstáculo entre el proyectil y el bot lo detendría antes.
      if (
        segmentBlockedByColliders(
          hazard.x,
          hazard.z,
          closestX,
          closestZ,
          colliders,
          Math.max(0.05, hazard.radius)
        )
      ) {
        return null;
      }

      let direction = { x: self.x - closestX, z: self.z - closestZ };
      let length = Math.hypot(direction.x, direction.z);
      if (length < 0.05) {
        // Justo sobre la línea de tiro: apartarse en perpendicular.
        direction = {
          x: (-vz / speed) * this.orbitSide,
          z: (vx / speed) * this.orbitSide
        };
        length = 1;
      }
      direction = {
        x: direction.x / length,
        z: direction.z / length
      };
      return {
        direction: this.pickHazardEscape(self, direction, colliders),
        severity:
          100 +
          (1 - timeToClosest / horizon) * 80 +
          (1 - distance / dangerRadius) * 40
      };
    }

    const area = this.hazardArea(hazard);
    if (
      !aoeContains(area, self.x, self.z, self.hitRadius, HAZARD_AOE_MARGIN)
    ) {
      return null;
    }

    // Las áreas tampoco atraviesan un muro: si el centro del círculo o el
    // vértice del cono no tiene línea hasta el bot, sus ticks no le alcanzan.
    if (
      segmentBlockedByColliders(area.x, area.z, self.x, self.z, colliders)
    ) {
      return null;
    }

    const distance = aoeDistance(area, self.x, self.z);
    const dangerRadius =
      hazard.radius + self.hitRadius + HAZARD_AOE_MARGIN;
    const direction = this.aoeEvadeDirection(area, self);
    // En `overtime-target` el próximo tick es propio de cada objetivo. Si está
    // lejos, la huida puede compartir prioridad con otras amenazas; si es
    // inminente, sube por delante de ellas.
    const nextTick =
      hazard.mode === 'overtime-target'
        ? hazard.targetTimers?.get(self.slot)?.tickTimer
        : undefined;
    const tickPressure =
      nextTick === undefined
        ? 1
        : 1 - clamp(nextTick / 0.6, 0, 1);
    return {
      direction: this.pickHazardEscape(self, direction, colliders),
      severity:
        (140 + (1 - distance / Math.max(0.001, dangerRadius)) * 80) *
        (0.85 + 0.15 * tickPressure)
    };
  }

  /**
   * Si la huida directa choca con un obstáculo, prueba los laterales antes de
   * quedarse empujando contra una pared.
   */
  private pickHazardEscape(
    self: MatchPlayerState,
    direction: Vec2,
    colliders: readonly Collider[]
  ): Vec2 {
    const left = {
      x: -direction.z * this.orbitSide,
      z: direction.x * this.orbitSide
    };
    const right = { x: -left.x, z: -left.z };
    const candidates: Vec2[] = [
      direction,
      left,
      right,
      { x: -direction.x, z: -direction.z }
    ];
    for (const candidate of candidates) {
      const endX = self.x + candidate.x * HAZARD_ESCAPE_STEP;
      const endZ = self.z + candidate.z * HAZARD_ESCAPE_STEP;
      if (!segmentBlockedByColliders(self.x, self.z, endX, endZ, colliders)) {
        return candidate;
      }
    }
    return direction;
  }

  /** ¿El trayecto hasta `point` cruza un área persistente enemiga? */
  private hazardPathBlocked(self: MatchPlayerState, point: Vec2): boolean {
    for (const hazard of this.hazards) {
      if (hazard.ownerTeam === self.team) continue;
      if (hazard.kind === 'projectile') continue;
      if ((hazard.remaining ?? Infinity) <= 0) continue;
      const area = this.hazardArea(hazard);
      if (area.shape === 'circle') {
        // Un patrón puede tener varios lóbulos: se comprueba el trayecto
        // contra cada círculo, no contra un único disco en el centro.
        const circles =
          area.circles.length > 0
            ? area.circles
            : [{ x: area.x, z: area.z, radius: area.radius }];
        const padding = self.hitRadius + HAZARD_AOE_MARGIN;
        for (const circle of circles) {
          const distance = pointSegmentDistance(
            circle.x,
            circle.z,
            self.x,
            self.z,
            point.x,
            point.z
          );
          if (distance <= circle.radius + padding) return true;
        }
        continue;
      }
      // Un cono no es convexo respecto al trayecto: se muestrea el segmento
      // para no atravesar el abanico por un punto intermedio.
      const length = Math.hypot(point.x - self.x, point.z - self.z);
      const steps = Math.max(1, Math.ceil(length / 0.5));
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const sampleX = self.x + (point.x - self.x) * t;
        const sampleZ = self.z + (point.z - self.z) * t;
        if (
          aoeContains(
            area,
            sampleX,
            sampleZ,
            self.hitRadius,
            HAZARD_AOE_MARGIN
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Peligros persistentes que A* debe rodear. Los proyectiles se excluyen
   * porque se mueven y la ruta se recalcula con poca frecuencia.
   */
  private navHazards(
    self: MatchPlayerState
  ): readonly NavHazard[] | undefined {
    // El array y sus objetos se reutilizan entre consultas: `findPath` los
    // consume de forma síncrona y no guarda la referencia.
    const hazards = this.navHazardScratch;
    hazards.length = 0;
    let count = 0;
    for (const hazard of this.hazards) {
      if (hazard.ownerTeam === self.team) continue;
      if (hazard.kind === 'projectile') continue;
      if ((hazard.remaining ?? Infinity) <= 0) continue;
      const padding = self.hitRadius + HAZARD_AOE_MARGIN;
      const area = this.hazardArea(hazard);
      if (area.shape === 'circle') {
        // Cada círculo del patrón es un disco que la ruta debe rodear.
        const circles =
          area.circles.length > 0
            ? area.circles
            : [{ x: area.x, z: area.z, radius: area.radius }];
        for (const circle of circles) {
          const navHazard = this.acquireNavHazard(count);
          navHazard.x = circle.x;
          navHazard.z = circle.z;
          navHazard.radius = circle.radius + padding;
          hazards[count] = navHazard;
          count += 1;
        }
        continue;
      }
      // La navegación solo entiende círculos: un cono se aproxima con varios
      // discos a lo largo de su eje, más anchos cuanto más lejos del vértice.
      const segments = 4;
      for (let index = 0; index < segments; index++) {
        const t = (index + 0.5) / segments;
        const width = area.radius * t * Math.tan(area.halfAngle);
        const navHazard = this.acquireNavHazard(count);
        navHazard.x = area.x + area.dirX * area.radius * t;
        navHazard.z = area.z + area.dirZ * area.radius * t;
        navHazard.radius = Math.max(0.35, width) + padding;
        hazards[count] = navHazard;
        count += 1;
      }
    }
    hazards.length = count;
    return count > 0 ? hazards : undefined;
  }

  /**
   * Devuelve el hueco `index` del pool de peligros de navegación, creándolo
   * solo la primera vez. Los valores de relleno se sobrescriben antes de
   * publicar el array.
   */
  private acquireNavHazard(index: number): NavHazard {
    const pool = this.navHazardPool;
    const existing = pool[index];
    if (existing !== undefined) return existing;
    const hazard: NavHazard = { x: 0, z: 0, radius: 0 };
    pool[index] = hazard;
    return hazard;
  }

  /**
   * Habilidad que puede golpear al lanzador rival antes de que termine su
   * windup. Un impacto cancela la preparación en `game.ts`.
   */
  private findInterruptSlot(
    self: MatchPlayerState,
    source: MatchPlayerState,
    remaining: number,
    colliders: readonly Collider[]
  ): InterruptPlan | null {
    if (!this.canCast(self)) return null;
    let bestPlan: InterruptPlan | null = null;
    let bestDelay = Infinity;
    let bestPower = -Infinity;

    for (let slot = 0; slot < 4; slot++) {
      if (self.cooldowns[slot] > 0.001) continue;
      const id = self.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (!def) continue;
      if (def.shape === 'aoe' || def.shape === 'self') continue;
      if (def.shape === 'dash' && def.props.power <= 0) continue;

      // El golpe no llega en el instante actual: se adelanta el rival al
      // momento del impacto. En proyectiles el tiempo de vuelo depende de la
      // distancia, así que se recalcula una vez con el punto ya corregido. El
      // adelanto usa el mismo factor por dificultad que el resto de disparos.
      let distance = Math.hypot(source.x - self.x, source.z - self.z);
      let aim: Vec2 = { x: source.x, z: source.z };
      let delay = def.startup;
      for (let pass = 0; pass < 2; pass++) {
        const travel =
          def.shape === 'projectile'
            ? distance / Math.max(1, def.projectileSpeed)
            : 0;
        delay = def.startup + travel;
        const lead = delay * this.tuning.lead;
        aim = {
          x: source.x + source.vx * lead,
          z: source.z + source.vz * lead
        };
        distance = Math.hypot(aim.x - self.x, aim.z - self.z);
      }

      // El interrupt también falla por apuntado: usa el mismo sesgo angular que
      // un ataque normal en vez de tener puntería perfecta.
      const aimBias = this.aimBiasFor(source);
      if (aimBias !== 0) {
        const relX = aim.x - source.x;
        const relZ = aim.z - source.z;
        const cos = Math.cos(aimBias);
        const sin = Math.sin(aimBias);
        aim = {
          x: source.x + relX * cos - relZ * sin,
          z: source.z + relX * sin + relZ * cos
        };
        distance = Math.hypot(aim.x - self.x, aim.z - self.z);
      }

      const reach =
        def.shape === 'melee'
          ? def.range + maxHitRadius() + source.hitRadius
          : def.shape === 'dash'
            ? def.dashDistance + Math.max(0.5, def.radius) + source.hitRadius
            : def.range + source.hitRadius;
      if (distance > reach) continue;

      if (delay > remaining + 0.03) continue;

      // Ni el haz ni el proyectil atraviesan un obstáculo: si la línea hasta
      // la posición proyectada está tapada, gastar el cooldown no interrumpe.
      // El padding imita al motor para cada forma.
      if (lineOfSightBlocked(self.x, self.z, aim.x, aim.z, colliders)) {
        continue;
      }
      const padding =
        def.shape === 'melee'
          ? CONFIG.combat.meleeSightPadding
          : def.shape === 'projectile'
            ? Math.max(0.05, def.radius)
            : 0;
      if (
        segmentBlockedByColliders(
          self.x,
          self.z,
          aim.x,
          aim.z,
          colliders,
          padding
        )
      ) {
        continue;
      }

      // La armadura del casteo rival solo se rompe si el golpe llega a su
      // umbral; si no, hace daño pero no cancela y no sirve como interrupt.
      const prediction: TargetPrediction = {
        x: aim.x,
        z: aim.z,
        time: delay,
        distance
      };
      const damage = this.expectedDamage(self, source, def, prediction);
      if (!this.breaksCastArmor(source, def, damage)) continue;

      // El retardo manda, pero dentro del mismo frame vale más la habilidad
      // con más potencia efectiva.
      const weightedPower =
        def.props.power * typeEffectiveness(def.type, source.types);
      if (
        bestPlan === null ||
        delay < bestDelay - INTERRUPT_DELAY_TOLERANCE ||
        (delay <= bestDelay + INTERRUPT_DELAY_TOLERANCE &&
          weightedPower > bestPower)
      ) {
        bestPlan = { slot, aim };
        bestDelay = delay;
        bestPower = weightedPower;
      }
    }

    return bestPlan;
  }

  private decide(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    colliders: readonly Collider[]
  ): void {
    this.decision.decide(self, players, colliders);
  }

  /**
   * Lleva al bot a un punto dentro de la zona de control. Cada plaza usa un
   * ángulo distinto para no apilarse en el centro exacto; una vez dentro,
   * `moveTowards` lo mantiene en posición.
   */
  private seekObjective(self: MatchPlayerState): boolean {
    if (!this.objective) return false;
    this.setGoal(this.objectiveHoldPoint(self.slot));
    return true;
  }

  /**
   * Punto de espera dentro de la zona. El ángulo depende de la plaza y el
   * radio de un porcentaje del objetivo, así varios defensores se reparten el
   * círculo sin quedar todos en el centro ni en el borde.
   */
  private objectiveHoldPoint(slot: number): Vec2 {
    const objective = this.objective;
    if (!objective) return { x: 0, z: 0 };
    const angle = slot * 2.399963229728653;
    const holdRadius = objective.radius * KOTH_HOLD_RADIUS_FACTOR;
    return {
      x: objective.x + Math.cos(angle) * holdRadius,
      z: objective.z + Math.sin(angle) * holdRadius
    };
  }

  /**
   * Cierra la huida. Si fue por llegar a la base sin curación o por agotarse el
   * tiempo, deja un enfriamiento para no volver a plantarse allí enseguida.
   * También olvida la última posición vista para no lanzarse a perseguir justo
   * después de retroceder.
   */
  private stopRetreat(cooldown: boolean): void {
    this.retreat = false;
    this.retreatCover = null;
    this.retreatCoverUntil = 0;
    this.retreatSanctuary = null;
    if (cooldown) this.retreatCooldownUntil = this.clock + RETREAT_COOLDOWN_SECONDS;
    this.lastSeen = null;
    this.patrolTimer = 0;
    this.path = [];
    this.pathTimer = 0;
  }

  /** Distancia al rival visible más cercano, o `Infinity` si no hay ninguno. */
  private nearestVisibleEnemyDistance(self: MatchPlayerState): number {
    let nearest = Infinity;
    for (const enemy of this.visibleEnemies) {
      if (!enemy.alive || enemy.team === self.team) continue;
      const distance = Math.hypot(enemy.x - self.x, enemy.z - self.z);
      if (distance < nearest) nearest = distance;
    }
    return nearest;
  }

  /**
   * Velocidad efectiva actual, con terreno, clima, buffs, ralentización y
   * escudo.
   */
  private effectiveSpeed(player: MatchPlayerState): number {
    const shieldSpeed =
      player.damageReductionTimer > 0 ? player.shieldSpeedMultiplier : 1;
    return Math.max(
      0.5,
      player.maxSpeed *
        player.terrainMultiplier *
        atmosphereSpeedMultiplier(this.atmosphere, player.types) *
        this.statMultiplier(player, 'speed') *
        player.slowMultiplier *
        shieldSpeed
    );
  }

  /** Daño residual del clima que recibe `player`, en PV por segundo. */
  private residualDps(player: MatchPlayerState): number {
    const residual = atmosphereResidual(this.atmosphere);
    if (!residual) return 0;
    if (player.types.some((type) => residual.immuneTypes.includes(type))) {
      return 0;
    }
    return (player.maxHp * residual.fraction) / residual.interval;
  }

  /**
   * Vida efectiva para el intercambio: PV actuales más la mejor cura fiable
   * disponible, el escudo común listo y la poción conocida más cercana.
   */
  private effectiveHp(
    player: MatchPlayerState,
    pickup: PickupSpawn | null
  ): number {
    const missing = Math.max(0, player.maxHp - player.hp);
    let reserve = 0;
    for (let slot = 0; slot < 4; slot++) {
      if (this.abilityCooldown(player, slot) > 0.5) continue;
      const id = player.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (!def || def.healSelf <= 0 || def.props.healOnHit) continue;
      reserve = Math.max(
        reserve,
        Math.min(missing, player.maxHp * def.healSelf) * 0.8
      );
    }
    if (
      player.commonAbilityId === 'proteccion' &&
      this.abilityCooldown(player, 4) <= 0.5
    ) {
      // Dos segundos de reducción del 60 % valen aproximadamente un quinto de
      // la vida actual como colchón, sin contar el daño que se evita al curar.
      reserve += player.hp * 0.2;
    }
    if (pickup) {
      const item = ITEM_DEFINITIONS[pickup.type];
      if (item) reserve += Math.min(missing, item.healHp) * 0.6;
    }
    return player.hp + reserve;
  }

  /**
   * DPS esperado del mejor ataque disponible. El cooldown restante retrasa el
   * primer uso, así que una habilidad clave ya gastada pesa menos ahora.
   * Para el daño entrante no se hereda el error de apuntado de este bot: se
   * asume que el rival puede apuntar.
   */
  private bestDamagePerSecond(
    attacker: MatchPlayerState,
    defender: MatchPlayerState,
    useAimEstimate: boolean,
    colliders: readonly Collider[]
  ): number {
    let best = 0;
    for (let slot = 0; slot < 4; slot++) {
      const id = attacker.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (
        !def ||
        def.shape === 'self' ||
        (def.props.power <= 0 && def.props.dot === null)
      ) {
        continue;
      }
      // El DPS entrante no hereda el adelanto imperfecto de este bot: se asume
      // que el rival apunta bien.
      const prediction = this.predictTarget(
        attacker,
        defender,
        def,
        useAimEstimate ? this.tuning.lead : 1
      );
      // Una habilidad fuera de alcance o tapada no cuenta como daño inmediato.
      if (
        !this.canHitPrediction(attacker, defender, def, prediction, colliders)
      ) {
        continue;
      }
      const hitChance = useAimEstimate
        ? this.hitChance(attacker, defender, def, prediction)
        : 1;
      const damage = this.expectedDamage(attacker, defender, def, prediction);
      const remaining = this.abilityCooldown(attacker, slot);
      // El ciclo usa el cooldown que tendría el próximo lanzamiento, no solo el
      // base: si la habilidad arrastra una racha de repetición, repetirla sale
      // más caro y el DPS esperado baja.
      const cycle =
        Math.max(
          0.75,
          this.plannedCooldown(attacker, slot, remaining) + remaining
        ) + def.startup;
      best = Math.max(best, (damage * hitChance) / cycle);
    }
    return best;
  }

  /**
   * Compara el tiempo estimado de matar con el de morir. El cociente incorpora
   * de forma natural la resistencia del Pokémon (tanques aguantan más) y el
   * daño real de ambos. Después ajusta el umbral de huida por número de vivos,
   * recursos disponibles, cooldowns, velocidad de escape y distancia a la base.
   */
  private assessFight(
    self: MatchPlayerState,
    target: MatchPlayerState,
    pickup: PickupSpawn | null,
    colliders: readonly Collider[]
  ): FightAssessment {
    const selfDps =
      this.bestDamagePerSecond(self, target, true, colliders) +
      this.residualDps(target);
    const enemyDps =
      this.bestDamagePerSecond(target, self, false, colliders) +
      this.residualDps(self);
    const selfEffectiveHp = this.effectiveHp(self, pickup);
    const targetEffectiveHp = this.effectiveHp(target, null);

    // Del rival solo se sabe si su gracia está activa, no cuánto le queda: se
    // suma una estimación fija en vez de leer su temporizador exacto.
    const targetGrace = target.invulnerableTimer > 0 ? 1 : 0;
    const timeToKill =
      targetEffectiveHp / Math.max(1, selfDps) + targetGrace;
    const timeToDie =
      selfEffectiveHp / Math.max(1, enemyDps) +
      Math.max(0, self.invulnerableTimer);
    const exchange = timeToDie / Math.max(0.1, timeToKill);

    const team = this.squad[self.team];
    const allyDiff = team.aliveAllies - team.aliveEnemies;
    const hpFraction = self.hp / Math.max(1, self.maxHp);
    let retreatHp = this.tuning.retreatHp;

    // Perder el intercambio sube el umbral; dominarlo lo baja. Los tanques
    // suelen tener `timeToDie` alto y por tanto retirarse más tarde.
    if (exchange < RETREAT_EXCHANGE_LOSS) retreatHp += 0.1;
    else if (exchange > RETREAT_EXCHANGE_EDGE) retreatHp -= 0.08;
    if (timeToDie < 1.5) retreatHp += 0.08;
    if (timeToKill < 2 && exchange > 1) retreatHp -= 0.05;

    if (allyDiff <= -1) retreatHp += 0.1;
    else if (allyDiff >= 1) retreatHp -= 0.06;
    // La llamada compartida refuerza la lectura numérica: retirarse cuando el
    // equipo está en inferioridad o aceptar pelea cuando domina el marcador.
    if (team.engageCall === 'retreat') retreatHp += 0.04;
    else if (team.engageCall === 'group') retreatHp += 0.02;
    else if (allyDiff >= 0) retreatHp -= 0.02;

    const resourceReserve =
      Math.max(0, selfEffectiveHp - self.hp) / Math.max(1, self.maxHp);
    if (resourceReserve > 0.15) retreatHp -= 0.05;
    else if (hpFraction < 0.6) retreatHp += 0.03;

    if (this.effectiveSpeed(self) < this.effectiveSpeed(target) * 0.95) {
      retreatHp += 0.04;
    }
    const distanceToBase = Math.hypot(
      self.x - self.spawn.x,
      self.z - self.spawn.z
    );
    if (distanceToBase > 18) retreatHp += 0.04;
    else if (distanceToBase < 8) retreatHp -= 0.03;

    return {
      timeToKill,
      timeToDie,
      exchange,
      allyDiff,
      retreatHp: clamp(
        retreatHp,
        RETREAT_THRESHOLD_MIN,
        RETREAT_THRESHOLD_MAX
      )
    };
  }

  /**
   * Duración de la huida según el trayecto real hasta la poción, el santuario
   * propio o la base. La base no cura sola, pero el tiempo se calcula igual: si
   * no hay recursos, el bot dejará de huir al llegar y volverá a buscar una
   * pelea favorable.
   */
  private retreatTime(
    self: MatchPlayerState,
    pickup: PickupSpawn | null
  ): number {
    const goal = pickup ?? this.retreatSanctuary ?? self.spawn;
    let distance = Math.hypot(goal.x - self.x, goal.z - self.z);
    const route = this.nav.findPath(self.x, self.z, goal.x, goal.z, {
      types: self.types,
      preferConcealment: true,
      hazards: this.navHazards(self),
      team: self.team
    });
    if (route.status === 'ok' && route.points.length > 0) {
      let length = 0;
      let previous = { x: self.x, z: self.z };
      for (const point of route.points) {
        length += Math.hypot(point.x - previous.x, point.z - previous.z);
        previous = point;
      }
      distance = length;
    }
    return clamp(
      distance / this.effectiveSpeed(self) + RETREAT_TIME_MARGIN,
      RETREAT_MIN_SECONDS,
      RETREAT_MAX_SECONDS
    );
  }

  /**
   * Celda transitable del santuario propio más cercana a la posición actual.
   * Devuelve `null` si el bot ya está dentro o si no hay ningún santuario a
   * menos de `SANCTUARY_SEARCH_RADIUS` unidades de mundo. La búsqueda va por
   * anillos para no recorrer el mapa entero en cada huida.
   */
  private nearestOwnSanctuaryPoint(self: MatchPlayerState): Vec2 | null {
    if (terrainTeam(terrainAt(self.x, self.z)) === self.team) return null;
    const start = this.nav.worldToCell(self.x, self.z);
    const maxRing = Math.min(
      Math.max(this.nav.rows, this.nav.cols),
      Math.max(1, Math.ceil(SANCTUARY_SEARCH_RADIUS / this.nav.tileSize))
    );

    for (let ring = 1; ring <= maxRing; ring++) {
      let best: Vec2 | null = null;
      let bestDistance = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.abs(dr) !== ring && Math.abs(dc) !== ring) continue;
          const row = start.row + dr;
          const col = start.col + dc;
          if (
            row < 0 ||
            col < 0 ||
            row >= this.nav.rows ||
            col >= this.nav.cols
          ) {
            continue;
          }
          if (terrainTeam(terrainAtCell(row, col)) !== self.team) continue;
          if (!this.nav.isWalkable(row, col, self.team)) continue;
          const point = this.nav.cellCenter(row, col);
          const distance = Math.hypot(point.x - self.x, point.z - self.z);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = point;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * Punto cercano con cobertura que rompe la línea de visión sin alejarse de la
   * base. Solo se usa al empezar a huir y si los rivales todavía ven al bot.
   */
  private pickRetreatCover(
    self: MatchPlayerState,
    colliders: readonly Collider[]
  ): Vec2 | null {
    if (self.enemiesSeeing === 0) return null;
    // `visibleEnemies` ya contiene solo rivales vivos y del otro equipo.
    const enemies = this.visibleEnemies;
    if (enemies.length === 0) return null;

    const currentBaseDistance = Math.hypot(
      self.x - self.spawn.x,
      self.z - self.spawn.z
    );
    let best: Vec2 | null = null;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 2 + Math.random() * (RETREAT_COVER_RADIUS - 2);
      const x = self.x + Math.cos(angle) * distance;
      const z = self.z + Math.sin(angle) * distance;
      const cell = this.nav.worldToCell(x, z);
      if (!this.nav.isWalkable(cell.row, cell.col, self.team)) continue;

      const point = this.nav.cellCenter(cell.row, cell.col);
      const realDistance = Math.hypot(point.x - self.x, point.z - self.z);
      if (realDistance < 1 || realDistance > RETREAT_COVER_RADIUS) continue;
      if (
        !this.nav.lineClear(
          self.x,
          self.z,
          point.x,
          point.z,
          undefined,
          self.team
        )
      ) {
        continue;
      }
      if (this.hazardPathBlocked(self, point)) continue;

      const concealment = terrainConcealment(
        terrainAt(point.x, point.z),
        self.types
      ).value;
      if (concealment < 0.08) continue;
      if (!this.regenSegmentHidden(self, point, colliders, enemies)) continue;

      const baseDistance = Math.hypot(
        point.x - self.spawn.x,
        point.z - self.spawn.z
      );
      if (baseDistance > currentBaseDistance + 2) continue;

      const score =
        concealment * 6 -
        realDistance * 0.18 -
        baseDistance * 0.02 +
        Math.random() * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = point;
      }
    }

    return best;
  }

  /**
   * Ventaja de tipo en ambos sentidos contra `enemy`, reutilizando el cálculo
   * mientras sigan vigentes clima, rival y sus tipos/habilidades. Es lo que
   * evita recorrer la tabla de tipos dos veces por rival y paso.
   */
  private matchupFor(
    self: MatchPlayerState,
    enemy: MatchPlayerState
  ): MatchupValues {
    const cached = this.matchups.lookup(self, enemy, this.atmosphere);
    if (cached) return cached;
    return this.matchups.store(
      self,
      enemy,
      this.atmosphere,
      this.bestDamageMultiplier(self, enemy),
      this.bestDamageMultiplier(enemy, self)
    );
  }

  /**
   * Mejor multiplicador de daño que `attacker` puede aplicar a `defender` con
   * sus habilidades dañinas, incluyendo tipo y clima. Si no tiene ninguna
   * registrada, usa sus propios tipos como aproximación.
   */
  private bestDamageMultiplier(
    attacker: MatchPlayerState,
    defender: MatchPlayerState
  ): number {
    const incoming = atmosphereIncomingMultiplier(
      this.atmosphere,
      defender.types
    );
    let best = -1;
    for (let slot = 0; slot < 4; slot++) {
      const id = attacker.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (!def || def.props.power <= 0) continue;
      const multiplier =
        typeEffectiveness(def.type, defender.types) *
        atmosphereMoveMultiplier(this.atmosphere, def.type) *
        atmosphereShapeMultiplier(this.atmosphere, def.shape) *
        incoming;
      best = Math.max(best, multiplier);
    }
    if (best < 0) {
      for (const type of attacker.types) {
        const multiplier =
          typeEffectiveness(type, defender.types) *
          atmosphereMoveMultiplier(this.atmosphere, type) *
          incoming;
        best = Math.max(best, multiplier);
      }
      if (best < 0) best = 1;
    }
    return best;
  }

  /** Multiplicador acumulado de un stat por los buffs activos. */
  private statMultiplier(player: MatchPlayerState, stat: BuffStat): number {
    let multiplier = 1;
    for (const buff of player.buffs) {
      if (buff.stat === stat) multiplier *= buff.multiplier;
    }
    return multiplier;
  }

  /**
   * Fracción de daño que el objetivo recibe con su escudo y sus buffs
   * defensivos activos (0-1). No mira la invulnerabilidad: esa caduca y quien
   * decide si el golpe llega a tiempo es `scoreAbility`.
   */
  private damageTakenFactor(
    target: MatchPlayerState,
    def: AbilityDef | null
  ): number {
    const reduction =
      target.damageReductionTimer > 0 ? target.damageReduction : 0;
    let defense: number;
    if (def !== null && def.category !== 'status') {
      defense = this.statMultiplier(
        target,
        def.category === 'physical' ? 'defense' : 'spDefense'
      );
    } else {
      // Sin una habilidad concreta (o con una de estado) se aplican ambas
      // defensas para no sobrevalorar a un rival con una sola buffeada.
      defense =
        this.statMultiplier(target, 'defense') *
        this.statMultiplier(target, 'spDefense');
    }
    const factor = (1 - reduction) / Math.max(1, defense);
    return Math.min(1, Math.max(0, factor));
  }

  /**
   * Movimiento durante la regeneración: elige puntos cercanos que sigan ocultos
   * para los rivales conocidos y avanza hacia ellos a media velocidad. Si no
   * encuentra ninguno seguro, se queda quieto en vez de cruzar una zona vista.
   */
  private regenMove(
    self: MatchPlayerState,
    colliders: readonly Collider[],
    dt: number
  ): Vec2 {
    this.regenGoalTimer -= dt;
    this.regenCheckTimer -= dt;

    if (this.regenGoal) {
      const distance = Math.hypot(
        this.regenGoal.x - self.x,
        this.regenGoal.z - self.z
      );
      let unsafe = false;
      if (this.regenCheckTimer <= 0) {
        this.regenCheckTimer = REGEN_CHECK_INTERVAL;
        unsafe = !this.regenPointSafe(self, this.regenGoal, colliders);
      }
      if (distance > 0.45 && !unsafe && this.regenGoalTimer > 0) {
        return directionTo(self, this.regenGoal);
      }
    } else if (this.regenGoalTimer > 0) {
      // Espera antes de volver a buscar; evita recalcular cada frame cuando no
      // hay ningún punto oculto cerca.
      return { x: 0, z: 0 };
    }

    this.regenGoal = this.pickRegenPoint(self, colliders);
    this.regenGoalTimer = this.regenGoal
      ? REGEN_ROAM_INTERVAL
      : REGEN_RETRY_SECONDS;
    this.regenCheckTimer = REGEN_CHECK_INTERVAL;
    return this.regenGoal
      ? directionTo(self, this.regenGoal)
      : { x: 0, z: 0 };
  }

  /** Punto cercano y transitable que mantiene al bot oculto. */
  private pickRegenPoint(
    self: MatchPlayerState,
    colliders: readonly Collider[]
  ): Vec2 | null {
    // Sin copia: la lista de visibles ya está filtrada por `updateTarget`.
    const enemies = this.visibleEnemies;
    let best: Vec2 | null = null;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 1.2 + Math.random() * (REGEN_ROAM_RADIUS - 1.2);
      const x = self.x + Math.cos(angle) * distance;
      const z = self.z + Math.sin(angle) * distance;
      const cell = this.nav.worldToCell(x, z);
      if (!this.nav.isWalkable(cell.row, cell.col, self.team)) continue;

      const point = this.nav.cellCenter(cell.row, cell.col);
      const realDistance = Math.hypot(point.x - self.x, point.z - self.z);
      if (realDistance < 0.7 || realDistance > REGEN_ROAM_RADIUS) continue;
      if (!this.regenPointSafe(self, point, colliders)) continue;

      const concealment = terrainConcealment(
        terrainAt(point.x, point.z),
        self.types
      ).value;
      let nearestEnemy = Infinity;
      for (const enemy of enemies) {
        nearestEnemy = Math.min(
          nearestEnemy,
          Math.hypot(enemy.x - point.x, enemy.z - point.z)
        );
      }

      // Preferir cobertura, no alejarse demasiado y mantener distancia. Un
      // punto dentro del santuario propio recibe un bono: aunque no oculte,
      // los rivales cuerpo a cuerpo no pueden alcanzarlo mientras regenera.
      const ownSanctuary =
        terrainTeam(terrainAt(point.x, point.z)) === self.team;
      let score = concealment * 3 - realDistance * 0.12 + Math.random() * 0.35;
      if (ownSanctuary) score += SANCTUARY_REGEN_BONUS;
      if (nearestEnemy < Infinity) score += Math.min(nearestEnemy, 10) * 0.08;
      if (score > bestScore) {
        bestScore = score;
        best = point;
      }
    }

    return best;
  }

  /** ¿El punto y el trayecto hasta él siguen ocultos para los rivales vistos? */
  private regenPointSafe(
    self: MatchPlayerState,
    point: Vec2,
    colliders: readonly Collider[]
  ): boolean {
    const cell = this.nav.worldToCell(point.x, point.z);
    if (!this.nav.isWalkable(cell.row, cell.col, self.team)) return false;
    if (
      !this.nav.lineClear(
        self.x,
        self.z,
        point.x,
        point.z,
        undefined,
        self.team
      )
    ) {
      return false;
    }
    // Tampoco vale esconderse dentro de un charco o cruzar uno camino del
    // punto: los ticks del área seguirían haciendo daño aunque no hubiera nadie
    // a la vista.
    if (this.hazardPathBlocked(self, point)) return false;

    const enemies = this.visibleEnemies;
    const concealment = terrainConcealment(
      terrainAt(point.x, point.z),
      self.types
    ).value;

    // Sin rivales conocidos, exige algo de cobertura para no pasearse por una
    // zona completamente abierta. El santuario propio es la excepción: es un
    // refugio seguro aunque su suelo no oculte.
    const ownSanctuary =
      terrainTeam(terrainAt(point.x, point.z)) === self.team;
    if (
      enemies.length === 0 &&
      !ownSanctuary &&
      concealment < REGEN_MIN_CONCEALMENT
    ) {
      return false;
    }

    for (const enemy of enemies) {
      if (
        Math.hypot(enemy.x - point.x, enemy.z - point.z) <
        REGEN_DANGER_RADIUS
      ) {
        return false;
      }
    }

    return this.regenSegmentHidden(self, point, colliders, enemies);
  }

  /** Comprueba el trayecto muestreando puntos intermedios. */
  private regenSegmentHidden(
    self: MatchPlayerState,
    point: Vec2,
    colliders: readonly Collider[],
    enemies: readonly MatchPlayerState[]
  ): boolean {
    if (enemies.length === 0) return true;

    const distance = Math.hypot(point.x - self.x, point.z - self.z);
    const steps = Math.max(1, Math.ceil(distance / REGEN_SEGMENT_STEP));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = self.x + (point.x - self.x) * t;
      const z = self.z + (point.z - self.z) * t;
      const concealment = terrainConcealment(terrainAt(x, z), self.types).value;
      const observer = this.sightObserver;
      const target = this.sightTarget;
      target.x = x;
      target.z = z;
      for (const enemy of enemies) {
        observer.x = enemy.x;
        observer.z = enemy.z;
        observer.visionRange =
          enemy.visionRange * atmosphereVisionMultiplier(this.atmosphere);
        if (isTargetVisible(observer, target, concealment, colliders, false)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Elige el objeto conocido que más conviene. Puntúa la curación que aporta
   * (según la vida que falta), la distancia, el peligro de acercarse a la base
   * enemiga y los enemigos visibles cerca del trayecto.
   *
   * Solo se consideran objetos que el equipo ve ahora o que ha visto hace poco.
   * Si el último estado conocido es «usado», se descarta sin caminar hasta él;
   * así no persigue posiciones que nunca ha visto ni vuelve a por un objeto
   * gastado que ya salió de visión.
   */
  private pickupTarget(self: MatchPlayerState): PickupSpawn | null {
    const hpFraction = self.hp / Math.max(1, self.maxHp);
    const missingHp = self.maxHp - self.hp;
    const enemyBases = otherTeams(self.team).flatMap((team) =>
      respawnsForTeam(team)
    );
    const team = this.squad[self.team];
    let best: PickupSpawn | null = null;
    let bestScore = -Infinity;

    for (const pickup of this.pickups) {
      const id = this.pickupId(pickup);
      if (id < 0) continue;
      const avoidUntil = this.pickupAvoidUntil.get(id);
      if (avoidUntil !== undefined) {
        if (this.clock < avoidUntil) continue;
        this.pickupAvoidUntil.delete(id);
      }
      const knownAvailable = this.knownPickupState(pickup);
      const remembered = this.pickupMemory.get(id);
      const rememberedAvailable =
        remembered && this.clock - remembered.at <= PICKUP_MEMORY_SECONDS
          ? remembered.available
          : undefined;
      // Lo que ve el equipo manda sobre el recuerdo; sin ninguno de los dos, el
      // objeto no es un destino válido.
      const available = knownAvailable ?? rememberedAvailable;
      if (available === undefined || !available) continue;
      // No cruzar un charco persistente solo por una poción.
      if (this.hazardPathBlocked(self, pickup)) continue;

      const definition = ITEM_DEFINITIONS[pickup.type];
      const heal = definition?.healHp ?? 0;
      if (heal <= 0) continue;

      const distance = Math.hypot(pickup.x - self.x, pickup.z - self.z);
      // Con poca vida, cada unidad de distancia pesa más: llegar pronto importa.
      const distanceCost = distance * (0.35 + (1 - hpFraction) * 0.65);

      // Los objetos junto a la base enemiga son más peligrosos. Cuanto menos
      // vida queda, más caro resulta asomarse allí.
      let baseDanger = 0;
      for (const base of enemyBases) {
        const baseDistance = Math.hypot(pickup.x - base.x, pickup.z - base.z);
        const danger = clamp(
          1 - (baseDistance - base.radius) / PICKUP_BASE_THREAT_RANGE,
          0,
          1
        );
        if (danger > baseDanger) baseDanger = danger;
      }
      const baseCost = baseDanger * (3 + (1 - hpFraction) * 5);

      // Enemigos visibles cuya posición queda cerca del trayecto recto. Es una
      // aproximación barata: basta para evitar cruzar delante de un rival.
      let pathDanger = 0;
      for (const enemy of this.visibleEnemies) {
        if (!enemy.alive) continue;
        const pathDistance = pointSegmentDistance(
          enemy.x,
          enemy.z,
          self.x,
          self.z,
          pickup.x,
          pickup.z
        );
        if (pathDistance >= PICKUP_PATH_THREAT_RADIUS) continue;
        const threat = 0.6 + 0.6 * (enemy.hp / Math.max(1, enemy.maxHp));
        pathDanger +=
          (1 - pathDistance / PICKUP_PATH_THREAT_RADIUS) *
          threat *
          (0.7 + (1 - hpFraction) * 0.8);
      }

      // La curación se mide por la fracción de vida que recupera: así una
      // Poción grande vale más cuando falta mucha vida y menos cuando casi
      // está lleno. Ver un objeto disponible garantiza que no está usado.
      const healFraction = Math.min(heal, missingHp) / Math.max(1, self.maxHp);
      const knownBonus = knownAvailable === true ? 2.5 : 0;
      const score =
        healFraction * 6 + knownBonus - distanceCost - baseCost - pathDanger;

      // Otra bot ya puede estar yendo a por esta poción. Solo se le discute si
      // esta elección puntúa mejor (más vida que recuperar, menos distancia o
      // menos peligro); si no, se busca otra.
      const claim = team.pickupClaims.get(id);
      if (
        claim &&
        claim.until > this.clock &&
        claim.slot !== self.slot &&
        claim.priority >= score
      ) {
        continue;
      }

      if (score > bestScore) {
        bestScore = score;
        best = pickup;
      }
    }

    this.pickupCandidatePriority = best ? bestScore : 0;
    return best;
  }

  /** Reclama ante el equipo la poción que este bot va a perseguir. */
  private claimPickup(self: MatchPlayerState, pickup: PickupSpawn): void {
    const id = this.pickupId(pickup);
    if (id < 0) return;
    const team = this.squad[self.team];
    for (const [otherId, claim] of team.pickupClaims) {
      if (claim.slot === self.slot) team.pickupClaims.delete(otherId);
    }
    team.pickupClaims.set(id, {
      slot: self.slot,
      until: this.clock + PICKUP_CLAIM_SECONDS,
      priority: this.pickupCandidatePriority
    });
  }

  /** Retira la reclamación propia al dejar de perseguir un objeto. */
  private releasePickupClaim(self: MatchPlayerState): void {
    const team = this.squad[self.team];
    for (const [key, claim] of team.pickupClaims) {
      if (claim.slot === self.slot) team.pickupClaims.delete(key);
    }
  }

  /** Retira las reclamaciones de revivir que ya no está ejecutando. */
  private releaseReviveClaims(self: MatchPlayerState): void {
    const team = this.squad[self.team];
    for (const [slot, claim] of team.reviveClaims) {
      if (claim.slot === self.slot) team.reviveClaims.delete(slot);
    }
  }

  private setGoal(goal: Vec2, pickup: PickupSpawn | null = null): void {
    if (Math.hypot(goal.x - this.goal.x, goal.z - this.goal.z) > 1.2) {
      this.path = [];
      this.pathTimer = 0;
    }
    this.goal = goal;
    this.goalPickup = pickup;
  }

  private updatePatrol(self: MatchPlayerState): void {
    const goalDistance = Math.hypot(this.goal.x - self.x, this.goal.z - self.z);
    // Al llegar al punto no se queda plantado esperando: en cuanto lo pisa
    // elige otro y sigue barriendo el mapa. El temporizador solo evita que un
    // destino inalcanzable lo deje bloqueado para siempre.
    if (goalDistance > SEARCH_ARRIVE_DISTANCE && this.clock < this.patrolTimer) {
      return;
    }
    this.patrolTimer = this.clock + 4.5 + Math.random() * 3.5;
    this.setGoal(this.pickSearchPoint(self));
  }

  /**
   * Elige una celda transitable para buscar rivales. Se descartan las
   * inmediaciones de ambas bases (allí solo se esperaría un respawn) y se
   * favorece la mitad rival, para que los bots crucen el mapa en busca de
   * pelea en vez de quedarse orbitando su propia zona.
   */
  private pickSearchPoint(self: MatchPlayerState): Vec2 {
    const ownBases = respawnsForTeam(self.team);
    const enemyBases = otherTeams(self.team).flatMap((team) =>
      respawnsForTeam(team)
    );
    const bases = [...ownBases, ...enemyBases];
    const ownBase = ownBases[0] ?? self.spawn;
    const enemyBase = enemyBases.reduce<(typeof enemyBases)[number] | undefined>(
      (best, base) => {
        if (!best) return base;
        const bestDistance = Math.hypot(ownBase.x - best.x, ownBase.z - best.z);
        const distance = Math.hypot(ownBase.x - base.x, ownBase.z - base.z);
        return distance < bestDistance ? base : best;
      },
      undefined
    );
    const team = this.squad[self.team];

    let best: Vec2 | null = null;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < 40; attempt++) {
      const row = Math.floor(Math.random() * this.nav.rows);
      const col = Math.floor(Math.random() * this.nav.cols);
      if (!this.nav.isWalkable(row, col, self.team)) continue;

      const point = this.nav.cellCenter(row, col);
      const distanceFromSelf = Math.hypot(point.x - self.x, point.z - self.z);
      if (distanceFromSelf < SEARCH_MIN_DISTANCE) continue;
      if (this.hazardPathBlocked(self, point)) continue;

      let nearBase = false;
      for (const base of bases) {
        const distanceToBase = Math.hypot(point.x - base.x, point.z - base.z);
        if (distanceToBase < base.radius + SEARCH_BASE_MARGIN) {
          nearBase = true;
          break;
        }
      }
      if (nearBase) continue;

      let score = Math.random() * 3;
      if (enemyBase) {
        const ownDistance = Math.hypot(point.x - ownBase.x, point.z - ownBase.z);
        const enemyDistance = Math.hypot(
          point.x - enemyBase.x,
          point.z - enemyBase.z
        );
        if (enemyDistance < ownDistance) score += 4;
        // Evita los extremos del mapa: los mejores cruces están entre ambas
        // bases, no pegados a una esquina.
        score -= Math.abs(enemyDistance - ownDistance) * 0.015;
      }

      // Reparto de zonas: no repetir la patrulla de otro bot ni amontonarse
      // alrededor de donde están los aliados.
      for (const [slot, claim] of team.patrolClaims) {
        if (slot === self.slot || claim.until <= this.clock) continue;
        const away = Math.hypot(point.x - claim.x, point.z - claim.z);
        if (away < 12) score -= (12 - away) * 0.45;
      }
      for (const motion of this.allyMotion.values()) {
        const away = Math.hypot(point.x - motion.anchorX, point.z - motion.anchorZ);
        if (away < 8) score -= (8 - away) * 0.18;
      }

      if (score > bestScore) {
        bestScore = score;
        best = point;
      }
    }

    if (!best) {
      // Sin candidatos válidos (mapa minúsculo o muy bloqueado): ir al centro
      // transitable en vez de volver a una base.
      const centerCell = this.nav.nearestWalkable(
        Math.floor(this.nav.rows / 2),
        Math.floor(this.nav.cols / 2)
      );
      best = centerCell
        ? this.nav.cellCenter(centerCell.row, centerCell.col)
        : { ...self.spawn };
    }

    team.patrolClaims.set(self.slot, {
      x: best.x,
      z: best.z,
      until: this.clock + PATROL_CLAIM_SECONDS
    });
    return best;
  }

  private drive(
    dt: number,
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    colliders: readonly Collider[]
  ): DeviceInputSnapshot {
    const snapshot: DeviceInputSnapshot = { ...IDLE_INPUT };
    if (this.recovering) {
      // Movimiento cauteloso: sigue oculto, no ataca y va a media velocidad.
      // Si aparece un peligro ya lanzado, salir manda sobre mantener la
      // cobertura: quedarse regenerando dentro de un charco regala vida.
      const escape = this.hazardEvasion?.direction ?? null;
      const regenDirection = escape ?? this.regenMove(self, colliders, dt);
      this.applyMovement(
        snapshot,
        self,
        regenDirection,
        escape ? 1 : REGEN_MOVE_SCALE
      );
      return snapshot;
    }
    const target = this.target;
    const targetIsVisible =
      target !== null && this.targetVisible && target.alive;
    const channeling = self.activeCast !== null;
    // El destino solo guía el movimiento cuando no hay combate ni amenaza:
    // en esos casos el bot orbita al rival a propósito y no debe considerarse
    // un atasco. Esquivar un peligro ya lanzado tampoco es un atasco.
    const steeringToGoal =
      this.threat === null &&
      this.hazardEvasion === null &&
      (this.retreat || !targetIsVisible);
    let desired: Vec2 = { x: 0, z: 0 };
    let casting = false;

    if (this.threat) {
      // La amenaza manda: una habilidad de apoyo elegida antes de verla no debe
      // colarse como si fuera un ataque preparado.
      this.supportCast = false;
      const threat = this.threat;
      const read = this.readPunish(threat.source);
      const interrupt =
        channeling || !read || !read.commit || this.clock < read.readyAt
          ? null
          : this.findInterruptSlot(
              self,
              threat.source,
              Math.max(0.02, threat.remaining + read.remainingError),
              colliders
            );
      if (interrupt !== null) {
        // Interrumpir el windup rival es la mejor jugada: un golpe cancela la
        // habilidad y evita el daño. Se prioriza sobre la huida.
        const aim = interrupt.aim;
        const error = Math.abs(
          normalizeAngle(Math.atan2(aim.x - self.x, aim.z - self.z) - self.facing)
        );
        this.abilitySlot = interrupt.slot;
        if (error <= this.tuning.aimTolerance && this.canCast(self)) {
          casting = this.pulseAbility(snapshot, interrupt.slot);
        }
        desired = directionTo(self, aim);
      } else {
        // Sin interrupción posible, salir del área/línea. Protección reduce el
        // daño si el bot la tiene disponible.
        desired = threat.evade;
        if (!channeling && this.useCommon && self.commonAbilityId === 'proteccion') {
          this.pulseCommon(snapshot, self, true);
        }
      }
    } else if (this.hazardEvasion) {
      // Un peligro ya lanzado tiene prioridad sobre atacar o mantener la
      // posición: el bot sale de la trayectoria del proyectil o del área.
      this.supportCast = false;
      desired = this.hazardEvasion.direction;
      if (
        !channeling &&
        this.useCommon &&
        self.commonAbilityId === 'impulso' &&
        self.cooldowns[4] <= 0.001 &&
        self.damageReductionTimer <= 0
      ) {
        const error = Math.abs(
          normalizeAngle(
            Math.atan2(desired.x, desired.z) - self.facing
          )
        );
        if (error <= this.tuning.aimTolerance + 0.08) {
          // Impulso recorre varios metros en la dirección de `facing`: además
          // de esquivar, saca al bot de un área persistente antes del tick.
          this.pulseCommon(snapshot, self, true);
        }
      }
    } else if (this.retreat) {
      desired = this.moveTowards(self, this.goal, dt, colliders);
      if (
        !channeling &&
        this.abilitySlot !== null &&
        self.cooldowns[this.abilitySlot] <= 0.001 &&
        this.canCast(self)
      ) {
        casting = this.pulseAbility(snapshot, this.abilitySlot);
      }
      if (!channeling && this.useCommon) {
        if (self.commonAbilityId === 'impulso' && target) {
          // Para huir con Impulso hay que estar mirando en la dirección
          // contraria; si no, el dash metería al bot todavía más en la pelea.
          const away = directionTo(target, self);
          const error = Math.abs(
            normalizeAngle(Math.atan2(away.x, away.z) - self.facing)
          );
          if (error <= this.tuning.aimTolerance + 0.08) {
            this.pulseCommon(snapshot, self, true);
            desired = away;
          } else {
            desired = away;
          }
        } else {
          this.pulseCommon(snapshot, self, true);
        }
      }
    } else if (this.supportCast && this.abilitySlot !== null) {
      // Las áreas de apoyo nacen en la posición del bot, así que no hace falta
      // encarar al rival ni tener línea de visión. Se queda quieto para no
      // salir del radio de los aliados durante la preparación.
      if (self.cooldowns[this.abilitySlot] > 0.001) {
        // Ya se lanzó mientras el temporizador de decisión seguía activo.
        this.supportCast = false;
      } else if (!channeling && this.canCast(self)) {
        casting = this.pulseAbility(snapshot, this.abilitySlot);
      }
    } else if (targetIsVisible && target) {
      const distance = Math.hypot(target.x - self.x, target.z - self.z);
      const def = this.selectedDef(self);
      // El disparo no sale hasta terminar el windup. Se apunta a donde estará
      // el rival en ese momento (y, en proyectiles, también al terminar el
      // vuelo), no a su posición actual.
      const prediction = this.predictTarget(self, target, def);
      const aim = this.aimPoint(self, target, prediction, def);
      const facingError = Math.abs(
        normalizeAngle(
          Math.atan2(aim.x - self.x, aim.z - self.z) - self.facing
        )
      );

      const inRange = def
        ? this.canHitPrediction(self, target, def, prediction, colliders)
        : false;
      const ready =
        this.abilitySlot !== null &&
        self.cooldowns[this.abilitySlot] <= 0.001;
      if (
        !channeling &&
        this.abilitySlot !== null &&
        ready &&
        def &&
        inRange &&
        facingError <= this.tuning.aimTolerance &&
        this.canCast(self)
      ) {
        casting = this.pulseAbility(snapshot, this.abilitySlot);
        // Avanzar un frame hacia el objetivo fija el `facing` antes de que
        // `stepPlayer` ejecute la habilidad: el bot apunta moviéndose.
        desired = directionTo(self, aim);
      } else {
        desired = this.combatMove(self, target, distance, def, facingError, dt);
        // Al defender la colina, orbitar alrededor de un rival pegado al borde
        // no debe sacar al bot de la zona y regalar el punto. Solo se corrige
        // cuando el rival también está dentro: perseguir a uno que asoma por
        // fuera exige poder encararlo y dispararle.
        desired = this.keepInsideObjective(self, target, desired, dt);
      }

      if (!channeling && this.useCommon && !this.holdingObjective) {
        const commonId = self.commonAbilityId;
        if (commonId === 'proteccion') {
          this.pulseCommon(snapshot, self, false);
        } else if (commonId === 'impulso') {
          const dashDir = this.retreat
            ? directionTo(target, self)
            : directionTo(self, target);
          const dashError = Math.abs(
            normalizeAngle(
              Math.atan2(dashDir.x, dashDir.z) - self.facing
            )
          );
          if (dashError <= this.tuning.aimTolerance + 0.08) {
            this.pulseCommon(snapshot, self, false);
            desired = dashDir;
          } else {
            desired = dashDir;
          }
        }
      }
    } else {
      // Sin objetivo visible: ir a la última posición conocida o patrullar.
      // Si un aliado detenido ya ocupa ese destino (por ejemplo, llegó antes
      // a la última posición vista), se descarta en vez de girar a su
      // alrededor empujándolo. Los objetos no cuentan: su recogida es
      // automática y compartida, y abandonar la poción solo porque un aliado
      // pasó cerca dejaba al bot marcharse justo antes de cogerla.
      if (
        !this.retreat &&
        this.goalPickup === null &&
        this.goalTakenByAlly(self, players)
      ) {
        this.abandonGoal(self);
      }
      desired = this.moveTowards(self, this.goal, dt, colliders);
      if (!channeling && this.useCommon) this.pulseCommon(snapshot, self, true);
    }

    const steeringOverride = this.backOffTimer > 0 || this.detourTimer > 0;
    desired = this.addSeparation(self, players, desired);
    if (this.backOffTimer > 0) {
      this.backOffTimer = Math.max(0, this.backOffTimer - dt);
      desired = directionTo(self, this.backOffGoal);
    } else if (this.detourTimer > 0) {
      this.detourTimer = Math.max(0, this.detourTimer - dt);
      desired = this.detour;
    }

    const speed = Math.hypot(self.vx, self.vz);
    const moved = Math.hypot(self.x - this.lastX, self.z - this.lastZ);
    this.lastX = self.x;
    this.lastZ = self.z;
    const wantsToMove = Math.hypot(desired.x, desired.z) > 0.05;
    // La velocidad (`vx`/`vz`) es la intención de movimiento, no el avance real:
    // contra otro jugador o una pared sigue siendo alta aunque el cuerpo no se
    // mueva. Por eso el atasco se mide comparando lo recorrido con lo esperado.
    const expected = speed * dt;
    const blocked = wantsToMove && !casting && expected > 0.002 && moved < expected * 0.3;
    if (blocked) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.4) {
        this.stuckTimer = 0;
        this.stuckCount = this.clock - this.lastStuckAt < 2 ? this.stuckCount + 1 : 1;
        this.lastStuckAt = this.clock;
        this.path = [];
        this.pathTimer = 0;
        if (this.stuckCount >= 2) {
          // Dos desvíos seguidos sin avanzar: volver por donde vino. Es lo
          // único que funciona en un pasillo donde dos aliados no caben.
          this.stuckCount = 0;
          this.avoidCurrentPickupGoal(self);
          this.backOffGoal = this.trailBackOff(self);
          this.backOffTimer = BACK_OFF_SECONDS;
        } else {
          this.detourSide *= -1;
          this.detour = this.pickDetour(self, desired);
          this.detourTimer = 0.5;
        }
      }
    } else if (moved > Math.max(0.004, expected * 0.5) || casting || !wantsToMove) {
      this.stuckTimer = 0;
    }

    // Un aliado puede dejar al bot girando a su alrededor a toda velocidad: se
    // mueve, así que no cuenta como bloqueo físico, pero no se acerca al
    // destino. En ese caso se da un paso lateral comprometido (o se cambia de
    // destino si el aliado lo ocupa) para romper la órbita.
    if (
      !steeringOverride &&
      !blocked &&
      this.orbitStalled(
        dt,
        self,
        players,
        steeringToGoal,
        casting
      )
    ) {
      this.stuckCount = 0;
      this.path = [];
      this.pathTimer = 0;
      const blocker = this.nearestAlly(self, players);
      if (
        this.goalPickup === null &&
        blocker &&
        Math.hypot(blocker.x - this.goal.x, blocker.z - this.goal.z) <=
          GOAL_OCCUPIED_RADIUS
      ) {
        // El destino es el propio aliado parado: no tiene sentido rodearlo
        // para volver a él. Se elige otro punto de patrulla.
        this.abandonGoal(self);
      }
      if (blocker) {
        // Paso lateral comprometido: un vector fijo durante unas décimas evita
        // que el desvío vuelva a curvarse en círculos alrededor del aliado.
        this.detour = this.allySideStep(self, blocker, this.goal);
        this.detourTimer = ALLY_DETOUR_SECONDS;
        desired = this.detour;
      } else {
        this.backOffGoal = this.trailBackOff(self);
        this.backOffTimer = BACK_OFF_SECONDS;
        desired = directionTo(self, this.backOffGoal);
      }
    }

    this.applyMovement(snapshot, self, desired);

    this.orbitTimer += dt;
    if (this.orbitTimer > 2.4) {
      this.orbitTimer = 0;
      this.orbitSide *= -1;
    }

    return snapshot;
  }

  private applyMovement(
    snapshot: DeviceInputSnapshot,
    self: MatchPlayerState,
    direction: Vec2,
    scale = 1
  ): void {
    const length = Math.hypot(direction.x, direction.z);
    if (length < 0.0001) return;

    const dx = direction.x / length;
    const dz = direction.z / length;
    // La entrada es relativa a la cámara del jugador, igual que un stick.
    const yaw = self.cameraYaw;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    snapshot.moveX = clamp((dx * rightX + dz * rightZ) * scale, -1, 1);
    snapshot.moveY = clamp((dx * forwardX + dz * forwardZ) * scale, -1, 1);
  }

  private pulseAbility(snapshot: DeviceInputSnapshot, slot: number): boolean {
    switch (slot) {
      case 0:
        snapshot.ability1 = true;
        return true;
      case 1:
        snapshot.ability2 = true;
        return true;
      case 2:
        snapshot.ability3 = true;
        return true;
      case 3:
        snapshot.ability4 = true;
        return true;
      default:
        return false;
    }
  }

  private pulseCommon(
    snapshot: DeviceInputSnapshot,
    self: MatchPlayerState,
    clearRequest: boolean
  ): void {
    if (self.commonAbilityId === 'regeneracion') return;
    if (self.cooldowns[4] > 0.001 || self.damageReductionTimer > 0) return;
    snapshot.commonAbility = true;
    if (clearRequest) this.useCommon = false;
  }

  private canCast(self: MatchPlayerState): boolean {
    return (
      // Un casteo en curso (startup + active + recovery) bloquea el siguiente.
      self.activeCast === null &&
      self.damageReductionTimer <= 0 &&
      // No gastar la invulnerabilidad de spawn en un ataque inmediato.
      self.invulnerableTimer <= 0.35
    );
  }

  private selectedDef(self: MatchPlayerState): AbilityDef | null {
    if (this.abilitySlot === null) return null;
    const id = self.abilityIds[this.abilitySlot];
    return id ? ABILITIES[id] ?? null : null;
  }

  /**
   * Curación que no depende de acertar un golpe. Las habilidades con
   * `healOnHit` (Come Sueños) solo curan si el haz impacta, así que no sirven
   * para retirarse a recuperar vida: pueden gastar la definitiva sin curar
   * nada.
   */
  private isReliableHeal(def: AbilityDef): boolean {
    return def.healSelf > 0 && !def.props.healOnHit;
  }

  private findHealSlot(self: MatchPlayerState): number | null {
    for (let slot = 0; slot < 4; slot++) {
      if (self.cooldowns[slot] > 0.001) continue;
      const id = self.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (def && this.isReliableHeal(def)) return slot;
    }
    return null;
  }

  /**
   * Aplica el error de decisión: con cierta probabilidad el bot elige una
   * acción viable distinta de la mejor. El ruido escala con la puntuación para
   * que un experto siga prefiriendo claramente la opción correcta.
   */
  private pickWithDecisionError(
    candidates: readonly { slot: number; score: number }[],
    bestSlot: number | null,
    bestScore: number,
    minScore: number
  ): number | null {
    if (bestSlot === null || bestScore <= minScore) return null;
    const error = this.tuning.decisionError;
    const viable = candidates.filter((candidate) => candidate.score > minScore);
    if (error <= 0 || viable.length < 2) return bestSlot;

    const spread = Math.max(4, Math.abs(bestScore) * 0.35);
    let chosen = bestSlot;
    let chosenScore = -Infinity;
    for (const candidate of viable) {
      const noisy =
        candidate.score + (Math.random() * 2 - 1) * error * spread;
      if (noisy > chosenScore) {
        chosenScore = noisy;
        chosen = candidate.slot;
      }
    }
    return chosen;
  }

  /** Marca los aliados caídos que este bot va a intentar revivir. */
  private claimSupportRevives(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    def: AbilityDef,
    colliders: readonly Collider[]
  ): void {
    const profile = def.bot;
    if (def.shape !== 'aoe') return;
    if (!profile?.revive || def.range > 0.1) return;
    const reach = def.radius + maxHitRadius();
    const team = this.squad[self.team];
    for (const ally of players) {
      if (ally.team !== self.team || ally.alive) continue;
      if (ally.respawnTimer <= def.startup + 0.15) continue;
      if (Math.hypot(ally.x - self.x, ally.z - self.z) > reach + ally.hitRadius) {
        continue;
      }
      if (segmentBlockedByColliders(self.x, self.z, ally.x, ally.z, colliders)) {
        continue;
      }
      team.reviveClaims.set(ally.slot, {
        slot: self.slot,
        until: this.clock + REVIVE_CLAIM_SECONDS
      });
    }
  }

  /**
   * Valor de un área de apoyo según los aliados a los que beneficia ahora
   * mismo. `Deseo` revive a los caídos y `Recuperación` reparte curación; el
   * filtro ofensivo de `scoreAbility` no puede valorar ninguna de las dos.
   */
  private supportScore(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    def: AbilityDef,
    colliders: readonly Collider[]
  ): number {
    const profile = def.bot;
    // Las áreas de apoyo conocidas nacen en la posición del lanzador.
    if (def.shape !== 'aoe') return 0;
    if (!profile || def.range > 0.1) return 0;

    const reach = def.radius + maxHitRadius();
    let score = 0;
    for (const ally of players) {
      if (ally === self || ally.team !== self.team) continue;
      const distance = Math.hypot(ally.x - self.x, ally.z - self.z);
      if (distance > reach + ally.hitRadius) continue;

      if (!ally.alive) {
        // Si va a reaparecer igualmente, el área no aporta nada.
        if (!profile.revive || ally.respawnTimer <= def.startup + 0.15) continue;
        // Otro bot ya se ha comprometido a revivirlo: no se apilan dos Deseos.
        const claim = this.squad[self.team].reviveClaims.get(ally.slot);
        if (
          claim &&
          claim.until > this.clock &&
          claim.slot !== self.slot
        ) {
          continue;
        }
        // El marcador debe estar en línea con el centro del área; si hay un
        // obstáculo de por medio, el motor no lo revive.
        if (segmentBlockedByColliders(self.x, self.z, ally.x, ally.z, colliders)) {
          continue;
        }
        score += SUPPORT_REVIVE_SCORE;
        continue;
      }

      if (!profile.healAllies) continue;
      const missing = 1 - ally.hp / Math.max(1, ally.maxHp);
      if (missing < SUPPORT_MIN_MISSING_HP) continue;
      score += missing * SUPPORT_ALLY_HEAL_SCORE;
    }

    if (score <= 0) return 0;
    // Revivir tarda más de un segundo y se cancela al recibir un golpe: con
    // rivales encima sigue siendo útil, pero no a cualquier precio.
    if (profile.revive) {
      const danger = this.nearestVisibleEnemyDistance(self);
      if (danger < SUPPORT_REVIVE_DANGER_RADIUS) {
        score -=
          (SUPPORT_REVIVE_DANGER_RADIUS - danger) * SUPPORT_REVIVE_DANGER_PENALTY;
      }
    }
    return Math.max(0, score);
  }

  private chooseSupportAbility(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    colliders: readonly Collider[]
  ): number | null {
    let bestSlot: number | null = null;
    let bestScore = 0;
    const candidates: { slot: number; score: number }[] = [];
    for (let slot = 0; slot < 4; slot++) {
      if (self.cooldowns[slot] > 0.001) continue;
      const id = self.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (!def) continue;
      const score = this.supportScore(self, players, def, colliders);
      candidates.push({ slot, score });
      if (score > bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    }
    const chosenSlot = this.pickWithDecisionError(
      candidates,
      bestSlot,
      bestScore,
      0
    );
    if (chosenSlot !== null) {
      // Una habilidad de apoyo no compromete daño: el compromiso anterior deja
      // de ser válido en cuanto se toma esta decisión.
      this.clearPlannedDamage(self);
      const id = self.abilityIds[chosenSlot];
      const def = id ? ABILITIES[id] : null;
      if (def) this.claimSupportRevives(self, players, def, colliders);
    }
    return chosenSlot;
  }

  private isSupportSlot(self: MatchPlayerState, slot: number): boolean {
    const id = self.abilityIds[slot];
    const def = id ? ABILITIES[id] : null;
    return (
      def !== null &&
      (def.bot?.healAllies === true || def.bot?.revive === true)
    );
  }

  /** Daño letal que otros aliados ya han comprometido sobre el objetivo. */
  private committedDamageOn(
    self: MatchPlayerState,
    target: MatchPlayerState
  ): number {
    let total = 0;
    for (const commitment of this.squad[self.team].committedDamage.values()) {
      if (commitment.targetSlot !== target.slot) continue;
      if (commitment.attackerSlot === self.slot) continue;
      if (commitment.until <= this.clock) continue;
      total += commitment.amount;
    }
    return total;
  }

  /** Retira el daño que este bot había comprometido sobre cualquier rival. */
  private clearPlannedDamage(self: MatchPlayerState): void {
    const team = this.squad[self.team];
    for (const [key, commitment] of team.committedDamage) {
      if (commitment.attackerSlot === self.slot) {
        team.committedDamage.delete(key);
      }
    }
  }

  /**
   * Registra el daño que este bot piensa aplicar con una habilidad grande. Los
   * compañeros lo descuentan durante una ventana corta para no apilar dos o
   * tres definitivas sobre un rival que ya va a caer.
   */
  private commitPlannedDamage(
    self: MatchPlayerState,
    target: MatchPlayerState,
    slot: number
  ): void {
    this.clearPlannedDamage(self);
    const team = this.squad[self.team];
    const id = self.abilityIds[slot];
    const def = id ? ABILITIES[id] : null;
    if (!def || def.props.power <= 0) return;
    if (slot !== 3 && def.props.power < BIG_ABILITY_POWER) return;

    const prediction = this.predictTarget(self, target, def);
    const hitChance = this.hitChance(self, target, def, prediction);
    const amount =
      this.expectedDamage(self, target, def, prediction) * hitChance;
    team.committedDamage.set(`${target.slot}:${self.slot}`, {
      attackerSlot: self.slot,
      targetSlot: target.slot,
      amount,
      until: this.clock + COMMITTED_DAMAGE_SECONDS
    });
  }

  /**
   * Daño final esperado de un golpe, con stats reales, STAB, efectividad,
   * buffs, escudo, crítico medio y factor aleatorio medio. La probabilidad de
   * conectar se aplica aparte en `hitChance`.
   */
  private expectedDamage(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    prediction: TargetPrediction
  ): number {
    return this.decision.expectedDamage(self, target, def, prediction);
  }

  /**
   * Armadura de casteo restante en `target`; 0 si no está casteando con
   * armadura o su ventana ya cerró. Réplica de `activeCastArmor` del motor.
   */
  private castArmorRemaining(target: MatchPlayerState): number {
    const cast = target.activeCast;
    if (!cast || cast.def.armorPool <= 0) return 0;
    if (cast.def.armorWindow === 'startup' && cast.fired) return 0;
    return cast.armorRemaining;
  }

  /**
   * ¿Absorbe la armadura del casteo de `target` este golpe? Mientras quede
   * pozo, el golpe resta daño sin interrumpir. Los estados, los golpes letales
   * y el control explícito la ignoran.
   */
  private castArmorAbsorbs(
    target: MatchPlayerState,
    def: AbilityDef,
    damage: number
  ): boolean {
    if (def.category === 'status') return false;
    if (damage >= target.hp) return false;
    const armor = this.castArmorRemaining(target);
    return armor > 0 && damage < armor;
  }

  /**
   * ¿Rompe `def` la armadura del casteo de `target`? Sin armadura, o si su
   * ventana ya cerró, cualquier golpe válido interrumpe.
   */
  private breaksCastArmor(
    target: MatchPlayerState,
    def: AbilityDef,
    damage: number
  ): boolean {
    return !this.castArmorAbsorbs(target, def, damage);
  }

  /**
   * ¿Tiene el bot alguna habilidad lista que rompa el casteo actual del rival?
   * Evita que la selección de objetivo trate un windup protegido como una
   * ventana de castigo cuando ningún golpe disponible puede cortarlo.
   */
  private canBreakCast(
    self: MatchPlayerState,
    target: MatchPlayerState
  ): boolean {
    const armor = this.castArmorRemaining(target);
    if (armor <= 0) return true;

    const distance = Math.hypot(target.x - self.x, target.z - self.z);
    const prediction: TargetPrediction = {
      x: target.x,
      z: target.z,
      time: 0,
      distance
    };
    for (let slot = 0; slot < 4; slot++) {
      if (self.cooldowns[slot] > 0.001) continue;
      const id = self.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (!def) continue;
      // Mismo filtro de formas que `findInterruptSlot`: lo que no puede
      // alcanzar a tiempo no cuenta como herramienta.
      if (def.shape === 'aoe' || def.shape === 'self') continue;
      if (def.shape === 'dash' && def.props.power <= 0) continue;
      if (def.category === 'status') return true;
      if (def.props.power <= 0) continue;
      const damage = this.expectedDamage(self, target, def, prediction);
      if (damage >= target.hp) return true;
      if (damage >= armor) return true;
    }
    return false;
  }

  /**
   * Valor de la armadura de casteo para el propio bot. Suma el daño de las
   * básicas rivales listas y al alcance: si entre todas no agotan el pozo, la
   * carga se completa bajo fuego ligero. Es un bonus pequeño: la armadura no
   * reduce el daño, solo evita que el casteo se corte.
   */
  private armorCastBonus(self: MatchPlayerState, def: AbilityDef): number {
    if (def.armorPool <= 0) return 0;
    let pressure = 0;
    for (const enemy of this.visibleEnemies) {
      if (!enemy.alive || enemy.team === self.team) continue;
      const distance = Math.hypot(enemy.x - self.x, enemy.z - self.z);
      if (distance > ARMOR_PRESSURE_RADIUS) continue;
      // La básica es el poke que suele cortar los casteos. Si el bot no la ha
      // visto lanzarse, se asume lista, como haría un jugador sin la cuenta.
      if (this.abilityCooldown(enemy, 0) > 0.5) continue;
      const id = enemy.abilityIds[0];
      const poke = id ? ABILITIES[id] : null;
      if (!poke || poke.props.power <= 0 || poke.category === 'status') continue;
      // Solo cuenta si el poke puede alcanzar al bot desde donde está.
      const reach =
        poke.shape === 'melee'
          ? poke.range + maxHitRadius() + self.hitRadius
          : poke.shape === 'dash'
            ? poke.dashDistance + Math.max(0.5, poke.radius) + self.hitRadius
            : poke.shape === 'self'
              ? 0
              : poke.range + self.hitRadius;
      if (distance > reach) continue;
      const prediction = this.predictTarget(enemy, self, poke);
      pressure += this.expectedDamage(enemy, self, poke, prediction);
    }
    // Sin presión lista o con presión suficiente para agotar el pozo, la
    // armadura no aporta una ventana segura.
    if (pressure <= 0 || pressure >= def.armorPool) return 0;
    const margin = 1 - pressure / def.armorPool;
    return ARMOR_BONUS_MAX * (0.5 + margin * 0.5);
  }

  /**
   * Probabilidad estimada de que el golpe conecte. Combina el error angular
   * de la dificultad, la distancia y el adelanto imperfecto contra la velocidad
   * lateral del rival.
   */
  private hitChance(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    prediction: TargetPrediction
  ): number {
    return this.decision.hitChance(self, target, def, prediction);
  }

  /**
   * Valor de los buffs del lanzador según su magnitud, duración, stat y estado
   * actual. Un buff de ataque vale más con vida alta; uno defensivo, con vida
   * baja. Tener ya ese stat buffeado reduce el valor de repetirlo.
   */
  private buffValue(
    self: MatchPlayerState,
    def: AbilityDef,
    hpFraction: number
  ): number {
    let value = 0;
    for (const buff of def.buffs) {
      const magnitude = Math.abs(buff.multiplier - 1);
      if (magnitude < 0.001) continue;
      let base =
        (10 + magnitude * 100) * clamp(buff.duration / 6, 0.35, 1.5);
      if (this.statMultiplier(self, buff.stat) !== 1) base *= 0.5;
      switch (buff.stat) {
        case 'attack':
        case 'spAttack':
          base *= 0.6 + hpFraction * 0.4;
          break;
        case 'defense':
        case 'spDefense':
          base *= 0.7 + (1 - hpFraction) * 0.7;
          break;
        case 'speed':
          base *= 0.85;
          break;
      }
      value += base;
    }
    return value;
  }

  /**
   * Nº de rivales adicionales al objetivo que caerían en la misma habilidad si
   * el bot apuntara al objetivo. Usa la geometría del motor para conos, haces,
   * proyectiles con `pierce`, dash y áreas.
   */
  private countExtraAbilityTargets(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    prediction: TargetPrediction,
    colliders: readonly Collider[]
  ): number {
    if (def.props.power <= 0 || def.shape === 'self') return 0;
    const direction = directionTo(self, prediction);
    if (direction.x === 0 && direction.z === 0) return 0;
    const facing = Math.atan2(direction.x, direction.z);
    const beamReach =
      def.shape === 'beam'
        ? Math.max(
            0.1,
            raycastColliderDistance(
              self.x,
              self.z,
              direction.x,
              direction.z,
              def.range,
              colliders
            )
          )
        : 0;
    const dashReach =
      def.shape === 'dash'
        ? Math.max(
            0.1,
            raycastColliderDistance(
              self.x,
              self.z,
              direction.x,
              direction.z,
              def.dashDistance,
              colliders,
              CONFIG.player.radius
            )
          )
        : 0;
    const aoeCenterReach =
      def.shape === 'aoe' && def.range > 0.1
        ? Math.min(
            def.range,
            raycastColliderDistance(
              self.x,
              self.z,
              direction.x,
              direction.z,
              def.range,
              colliders,
              CONFIG.combat.aoeSightPadding
            )
          )
        : 0;
    const aoeArea =
      def.shape === 'aoe'
        ? aoeAreaFrom(
            def,
            self.x + direction.x * aoeCenterReach,
            self.z + direction.z * aoeCenterReach,
            direction.x,
            direction.z
          )
        : null;

    let count = 0;
    for (const enemy of this.visibleEnemies) {
      if (enemy === target || !enemy.alive) continue;
      const dx = enemy.x - self.x;
      const dz = enemy.z - self.z;
      switch (def.shape) {
        case 'melee': {
          if (
            !sectorOverlapsCircle(
              self.x,
              self.z,
              facing,
              def.halfAngle * DEG,
              def.range + maxHitRadius(),
              enemy.x,
              enemy.z,
              enemy.hitRadius
            )
          ) {
            break;
          }
          if (
            segmentBlockedByColliders(
              self.x,
              self.z,
              enemy.x,
              enemy.z,
              colliders,
              CONFIG.combat.meleeSightPadding
            )
          ) {
            break;
          }
          count++;
          break;
        }
        case 'projectile': {
          if (def.pierce <= 0) break;
          const along = dx * direction.x + dz * direction.z;
          if (
            along < -enemy.hitRadius ||
            along > def.range + def.radius + enemy.hitRadius
          ) {
            break;
          }
          const lateral = Math.abs(dx * direction.z - dz * direction.x);
          if (lateral > def.radius + enemy.hitRadius) break;
          if (
            segmentBlockedByColliders(
              self.x,
              self.z,
              enemy.x,
              enemy.z,
              colliders,
              Math.max(0.05, def.radius)
            )
          ) {
            break;
          }
          count++;
          break;
        }
        case 'beam': {
          const along = dx * direction.x + dz * direction.z;
          if (along < 0 || along > beamReach + enemy.hitRadius) break;
          const lateral = Math.abs(dx * direction.z - dz * direction.x);
          if (lateral > def.radius + maxHitRadius() + enemy.hitRadius) break;
          if (
            segmentBlockedByColliders(
              self.x,
              self.z,
              enemy.x,
              enemy.z,
              colliders
            )
          ) {
            break;
          }
          count++;
          break;
        }
        case 'dash': {
          const reach = Math.max(0.5, def.radius) + enemy.hitRadius;
          if (
            dx * direction.x + dz * direction.z < -enemy.hitRadius ||
            pointSegmentDistance(
              enemy.x,
              enemy.z,
              self.x,
              self.z,
              self.x + direction.x * dashReach,
              self.z + direction.z * dashReach
            ) > reach
          ) {
            break;
          }
          count++;
          break;
        }
        case 'aoe': {
          if (
            !aoeArea ||
            !aoeContains(
              aoeArea,
              enemy.x,
              enemy.z,
              enemy.hitRadius,
              aoeHitPadding(def)
            )
          ) {
            break;
          }
          if (
            segmentBlockedByColliders(
              aoeArea.x,
              aoeArea.z,
              enemy.x,
              enemy.z,
              colliders
            )
          ) {
            break;
          }
          count++;
          break;
        }
      }
    }
    // Un proyectil con `pierce` solo atraviesa ese número de rivales extra.
    if (def.shape === 'projectile') {
      return Math.min(count, Math.max(0, def.pierce));
    }
    return count;
  }

  /**
   * ¿La habilidad alcanzaría al rival en su posición prevista si el bot
   * apuntara perfectamente? Para áreas se compara contra el centro real que el
   * motor fijará al empezar el windup, incluyendo el recorte por obstáculos.
   * La validación usa la puntería ideal: el error de `aimBias` se aplica solo
   * al `facing` real para que el fallo sea natural, no para bloquear el disparo.
   */
  private canHitPrediction(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    prediction: TargetPrediction,
    colliders: readonly Collider[]
  ): boolean {
    // El alcance real suma el hurtbox del objetivo: un Groudon (0,56 u) recibe
    // antes que un Voltorb (0,34 u). Un radio fijo hacía que el bot llegase
    // tarde contra los cuerpos grandes y pronto contra los pequeños.
    const targetRadius = target.hitRadius;
    switch (def.shape) {
      case 'melee': {
        // El sector del motor amplía el alcance con el hurtbox mayor del
        // roster; el borde dibujado coincide con ese primer contacto.
        if (prediction.distance > def.range + maxHitRadius() + targetRadius) {
          return false;
        }
        const facing = Math.atan2(
          prediction.x - self.x,
          prediction.z - self.z
        );
        if (
          !sectorOverlapsCircle(
            self.x,
            self.z,
            facing,
            def.halfAngle * DEG,
            def.range + maxHitRadius(),
            prediction.x,
            prediction.z,
            targetRadius
          )
        ) {
          return false;
        }
        return !segmentBlockedByColliders(
          self.x,
          self.z,
          prediction.x,
          prediction.z,
          colliders,
          CONFIG.combat.meleeSightPadding
        );
      }
      case 'projectile':
        // El motor mide el impacto contra el hurtbox del objetivo, así que el
        // alcance útil también lo suma.
        if (prediction.distance > def.range + targetRadius) return false;
        return !segmentBlockedByColliders(
          self.x,
          self.z,
          prediction.x,
          prediction.z,
          colliders,
          Math.max(0.05, def.radius)
        );
      case 'beam': {
        // El haz nunca llega más allá de `range`; si el objetivo ya está fuera,
        // no hace falta lanzar el raycast contra todos los colliders.
        if (prediction.distance > def.range + targetRadius) return false;
        const direction = directionTo(self, prediction);
        if (direction.x === 0 && direction.z === 0) return false;
        const reach = Math.max(
          0.1,
          raycastColliderDistance(
            self.x,
            self.z,
            direction.x,
            direction.z,
            def.range,
            colliders
          )
        );
        if (prediction.distance > reach + targetRadius) return false;
        return !segmentBlockedByColliders(
          self.x,
          self.z,
          prediction.x,
          prediction.z,
          colliders
        );
      }
      case 'dash': {
        // El barrido del dash alcanza `distancia + max(0.5, radio del dash) +
        // hurtbox del objetivo`; el 0,4 es solo el mínimo para no dashear
        // pegado. El desplazamiento se recorta en el primer collider.
        if (prediction.distance < 0.4) return false;
        const direction = directionTo(self, prediction);
        if (direction.x === 0 && direction.z === 0) return false;
        const stop = Math.max(
          0.1,
          raycastColliderDistance(
            self.x,
            self.z,
            direction.x,
            direction.z,
            def.dashDistance,
            colliders,
            CONFIG.player.radius
          )
        );
        const reach = Math.max(0.5, def.radius) + targetRadius;
        return (
          prediction.distance <= stop + reach &&
          pointSegmentDistance(
            prediction.x,
            prediction.z,
            self.x,
            self.z,
            self.x + direction.x * stop,
            self.z + direction.z * stop
          ) <= reach
        );
      }
      case 'aoe': {
        const effectiveRadius = def.radius + maxHitRadius() + targetRadius;
        // El centro (o vértice) cae como mucho a `range` del lanzador, así que
        // un objetivo más lejos que eso sumado al radio efectivo no puede
        // quedar dentro.
        if (prediction.distance > def.range + effectiveRadius) return false;
        const direction = directionTo(self, prediction);
        // Sin dirección útil el centro cae sobre el propio lanzador.
        const reach =
          def.range <= 0.1
            ? 0
            : direction.x === 0 && direction.z === 0
              ? 0
              : Math.min(
                  def.range,
                  raycastColliderDistance(
                    self.x,
                    self.z,
                    direction.x,
                    direction.z,
                    def.range,
                    colliders,
                    CONFIG.combat.aoeSightPadding
                  )
                );
        const centerX = self.x + direction.x * reach;
        const centerZ = self.z + direction.z * reach;
        const area = aoeAreaFrom(
          def,
          centerX,
          centerZ,
          direction.x,
          direction.z
        );
        if (
          !aoeContains(
            area,
            prediction.x,
            prediction.z,
            targetRadius,
            aoeHitPadding(def)
          )
        ) {
          return false;
        }
        return !segmentBlockedByColliders(
          centerX,
          centerZ,
          prediction.x,
          prediction.z,
          colliders
        );
      }
      case 'self':
        // Los buffs propios no necesitan un rival cerca: el bot puede
        // prepararse antes de acercarse.
        return true;
    }
  }

  private combatMove(
    self: MatchPlayerState,
    target: MatchPlayerState,
    distance: number,
    def: AbilityDef | null,
    facingError: number,
    dt: number
  ): Vec2 {
    // En Rey de la colina el objetivo manda sobre la persecución: si el rival
    // se aleja de la zona y ya no está a tiro, el bot vuelve a la colina en vez
    // de abandonarla. La comprobación va antes que el resto para que también
    // mande sobre el giro de apuntado cuando el rival ya no es alcanzable.
    const objectiveHold = this.objectiveHoldDirection(self, target, def, dt);
    if (objectiveHold) return objectiveHold;

    // Un rival refugiado en su santuario no se puede perseguir: el bot se
    // acerca al borde exterior y, si no llega con su alcance, orbita desde
    // fuera en vez de empujar contra la barrera. Así sigue amenazando sin
    // regalar el cuerpo a cuerpo y sin quedarse atascado.
    if (terrainTeam(terrainAt(target.x, target.z)) === target.team) {
      const cell = this.nav.worldToCell(target.x, target.z);
      const standCell = this.nav.nearestWalkable(
        cell.row,
        cell.col,
        self.team
      );
      if (standCell) {
        const stand = this.nav.cellCenter(standCell.row, standCell.col);
        const standDistance = Math.hypot(stand.x - self.x, stand.z - self.z);
        const reach = this.maxUsefulRange(def, target);
        if (standDistance > 0.65) return this.moveTowards(self, stand, dt);
        if (distance > reach + 0.5) return this.orbit(target, self);
      }
    }

    const threat = this.enemyThreatProfile(target);
    let preferred = this.adjustPreferredRange(
      self,
      target,
      def,
      this.preferredRange(self, def),
      threat
    );

    // Cautela de tipos: contra un rival que nos pega súper eficaz se mantiene
    // algo más de distancia; si su daño es poco eficaz contra nosotros, se
    // acorta. El ajuste nunca saca la distancia del alcance de la habilidad.
    const caution = this.targetMatchupDefense;
    if (caution !== 1) {
      const maxPreferred = this.maxUsefulRange(def, target);
      const adjust =
        caution < 1
          ? -Math.min(0.7, (1 - caution) * 5)
          : Math.min(1.8, (caution - 1) * 7);
      preferred = clamp(preferred + adjust, 0.9, maxPreferred);
    }

    // Con un haz listo, quedarse sobre la línea de tiro es regalar el impacto.
    // El órbita lateral saca al bot del carril sin dejar de apuntar.
    if (
      threat.beamReady &&
      this.onEnemyBeamLine(self, target, threat.beamRange)
    ) {
      return this.orbit(target, self);
    }

    // Si hay una habilidad elegida pero aún no está encarado, avanzar hacia el
    // objetivo es la forma de girar: el juego deriva `facing` de la velocidad.
    if (def && facingError > this.tuning.aimTolerance) {
      return this.moveTowards(self, target, dt);
    }

    const canKite =
      this.effectiveSpeed(self) >= this.effectiveSpeed(target) * 0.92;
    if (!def) {
      if (distance > preferred + 0.8) return this.moveTowards(self, target, dt);
      if (distance < preferred - 1.2) {
        return canKite ? directionTo(target, self) : this.orbit(target, self);
      }
      return this.orbit(target, self);
    }

    if (distance > preferred + 0.6) return this.moveTowards(self, target, dt);
    if (distance < preferred - 1.5) {
      // Alejarse del objetivo sin perderlo de vista: el movimiento de huida
      // cambia el rumbo, así que se alterna con el acercamiento al apuntar.
      return canKite ? directionTo(target, self) : this.orbit(target, self);
    }
    return this.orbit(target, self);
  }

  /**
   * Decide si el bot debe dejar de perseguir para volver a la colina. Devuelve
   * la dirección hacia el punto de espera, o `null` si el combate sigue
   * disputando el objetivo o el rival está a tiro.
   */
  private objectiveHoldDirection(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef | null,
    dt: number
  ): Vec2 | null {
    const objective = this.objective;
    if (!objective) return null;
    const offObjective =
      Math.hypot(target.x - objective.x, target.z - objective.z) -
      objective.radius;
    if (offObjective <= KOTH_CHASE_LEASH) return null;

    // A tiro aunque esté fuera de la zona: se le puede seguir golpeando sin
    // abandonar la colina, así que no compensa renunciar al daño.
    const distance = Math.hypot(target.x - self.x, target.z - self.z);
    if (distance <= this.maxUsefulRange(def, target) + KOTH_HOLD_ATTACK_MARGIN) {
      return null;
    }

    this.holdingObjective = true;
    return this.moveTowards(self, this.objectiveHoldPoint(self.slot), dt);
  }

  /**
   * Corrige un movimiento de combate que sacaría al bot de la zona cuando ya
   * la está defendiendo. Solo elimina el componente radial hacia fuera: el
   * avance lateral se conserva para seguir orbitando y apuntando. Si el rival
   * está fuera del círculo, no se limita el movimiento: el bot necesita poder
   * encararlo y dispararle aunque asome por el borde.
   */
  private keepInsideObjective(
    self: MatchPlayerState,
    target: MatchPlayerState,
    direction: Vec2,
    dt: number
  ): Vec2 {
    const objective = this.objective;
    if (!objective) return direction;
    if (
      Math.hypot(target.x - objective.x, target.z - objective.z) >
      objective.radius
    ) {
      return direction;
    }
    const length = Math.hypot(direction.x, direction.z);
    if (length < 0.001) return direction;
    const offsetX = self.x - objective.x;
    const offsetZ = self.z - objective.z;
    const offset = Math.hypot(offsetX, offsetZ);
    if (offset < 0.001 || offset >= objective.radius) return direction;

    const step = Math.max(0.2, this.effectiveSpeed(self) * dt);
    const nextX = self.x + direction.x * step;
    const nextZ = self.z + direction.z * step;
    if (Math.hypot(nextX - objective.x, nextZ - objective.z) <= objective.radius) {
      return direction;
    }

    const outwardX = offsetX / offset;
    const outwardZ = offsetZ / offset;
    const outward = direction.x * outwardX + direction.z * outwardZ;
    if (outward <= 0) return direction;
    // Se anula la salida y se añade un pequeño empuje hacia el centro para que
    // el bot se aparte del borde en el siguiente frame.
    const correctedX = direction.x - outwardX * outward - outwardX * 0.2;
    const correctedZ = direction.z - outwardZ * outward - outwardZ * 0.2;
    return { x: correctedX, z: correctedZ };
  }

  /** Alcance máximo útil de la habilidad seleccionada contra este rival. */
  private maxUsefulRange(
    def: AbilityDef | null,
    target: MatchPlayerState
  ): number {
    if (!def) return 6.5;
    if (def.shape === 'self') return 8;
    const reach =
      def.shape === 'dash'
        ? def.dashDistance + Math.max(0.5, def.radius) + target.hitRadius
        : def.shape === 'melee' || def.shape === 'projectile'
          ? def.range + target.hitRadius
          : def.shape === 'aoe'
            ? def.range + def.radius + target.hitRadius
            : def.range;
    return Math.max(1, reach - target.hitRadius - 0.35);
  }

  /**
   * Ajusta la distancia según las amenazas listas del rival. Si tiene melee
   * peligroso se mantiene fuera de su alcance; si sus habilidades clave están
   * en cooldown o está ralentizado, se acerca. Un bot ralentizado no intenta
   * kite imposible: acepta el cuerpo a cuerpo y orbita.
   */
  private adjustPreferredRange(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef | null,
    base: number,
    threat: EnemyThreatProfile
  ): number {
    let preferred = base;
    if (threat.meleeReach > 0) {
      preferred = Math.max(preferred, threat.meleeReach);
    }
    if (!threat.anyReady) preferred -= 0.6;
    else if (!threat.keyReady) preferred -= 0.25;
    if (target.slowMultiplier < 0.9) preferred -= 0.6;

    const canKite =
      this.effectiveSpeed(self) >= this.effectiveSpeed(target) * 0.92;
    if (self.slowMultiplier < 0.9 && !canKite) {
      preferred = Math.min(preferred, Math.max(1.2, base - 0.5));
    }

    return clamp(preferred, 0.9, this.maxUsefulRange(def, target));
  }

  /**
   * Actualiza el enfriamiento estimado de un rival visible. Solo se marca una
   * habilidad como gastada cuando se ve el salto de su cooldown; el valor exacto
   * restante no se lee. Si el bot no ha visto el lanzamiento, asume que está
   * lista, igual que haría un jugador que no lleva la cuenta.
   */
  private observeEnemyCooldowns(enemy: MatchPlayerState): void {
    let ready = this.enemyReadyAt.get(enemy.slot);
    let seen = this.enemyCooldownSeen.get(enemy.slot);
    let totals = this.enemyCooldownTotals.get(enemy.slot);
    if (!ready) {
      ready = new Float32Array(5);
      this.enemyReadyAt.set(enemy.slot, ready);
    }
    if (!seen) {
      seen = new Float32Array(5);
      seen.fill(-1);
      this.enemyCooldownSeen.set(enemy.slot, seen);
    }
    if (!totals) {
      totals = new Float32Array(5);
      this.enemyCooldownTotals.set(enemy.slot, totals);
    }

    for (let slot = 0; slot < 5; slot++) {
      const current = enemy.cooldowns[slot] ?? 0;
      const previous = seen[slot];
      if (previous >= 0 && current > previous + 0.05) {
        const id = enemy.abilityIds[slot];
        const def = id ? ABILITIES[id] : null;
        const duration = Math.max(current, def?.cooldown ?? 0);
        ready[slot] = this.clock + duration;
        totals[slot] = duration;
      }
      seen[slot] = current;
    }
  }

  /**
   * Cooldown que el bot puede conocer: el propio es exacto; el de un rival se
   * estima desde el último lanzamiento observado.
   */
  private abilityCooldown(player: MatchPlayerState, slot: number): number {
    if (player.slot === this.slot) return player.cooldowns[slot] ?? 0;
    const ready = this.enemyReadyAt.get(player.slot);
    if (!ready) return 0;
    return Math.max(0, ready[slot] - this.clock);
  }

  /**
   * Fracción extra que acumularía el próximo lanzamiento propio por repetir la
   * misma habilidad. Devuelve 0 si la habilidad no tiene rampa o la racha ya
   * expiró.
   */
  private repeatCooldownExtra(
    player: MatchPlayerState,
    slot: number,
    delaySeconds = 0
  ): number {
    const id = player.abilityIds[slot];
    const def = id ? ABILITIES[id] : null;
    const repeat = def?.repeatCooldown;
    if (!repeat || repeat.step <= 0 || repeat.max <= 0) return 0;
    const continues =
      player.repeatAbilityId === id &&
      this.clock + delaySeconds - player.repeatAbilityAt <= repeat.resetAfter;
    const count = continues ? player.repeatAbilityCount + 1 : 0;
    return Math.min(count * repeat.step, repeat.max);
  }

  /** Cooldown que tendría el próximo lanzamiento propio de ese slot. */
  private nextCastCooldown(
    player: MatchPlayerState,
    slot: number,
    delaySeconds = 0
  ): number {
    const id = player.abilityIds[slot];
    const def = id ? ABILITIES[id] : null;
    if (!def) return 0;
    return (
      def.cooldown * (1 + this.repeatCooldownExtra(player, slot, delaySeconds))
    );
  }

  /**
   * Cooldown para planificar el DPS. El propio es exacto; el del rival usa la
   * última duración observada, que ya incluye su rampa de repetición.
   */
  private plannedCooldown(
    player: MatchPlayerState,
    slot: number,
    delaySeconds = 0
  ): number {
    if (player.slot === this.slot) {
      return this.nextCastCooldown(player, slot, delaySeconds);
    }
    const id = player.abilityIds[slot];
    const def = id ? ABILITIES[id] : null;
    const base = def?.cooldown ?? 0;
    const observed = this.enemyCooldownTotals.get(player.slot)?.[slot] ?? 0;
    const repeat = def?.repeatCooldown;
    if (observed <= base || !repeat) return base;
    // La rampa caduca: si el último lanzamiento observado queda fuera de la
    // ventana de reinicio, el próximo vuelve al cooldown base.
    const readyAt = this.enemyReadyAt.get(player.slot)?.[slot] ?? 0;
    const castAt = readyAt - observed;
    return this.clock + delaySeconds - castAt <= repeat.resetAfter
      ? observed
      : base;
  }

  /** Perfil de habilidades ofensivas del rival que ya puede usar. */
  private enemyThreatProfile(target: MatchPlayerState): EnemyThreatProfile {
    let meleeReach = 0;
    let beamReady = false;
    let beamRange = 0;
    let anyReady = false;
    let keyReady = false;

    const consider = (def: AbilityDef | null, ready: boolean): void => {
      if (!def || !ready) return;
      if (def.shape === 'self') return;
      if (
        def.props.power <= 0 &&
        def.props.slow === null &&
        def.props.dot === null &&
        def.bot?.customDamage !== true
      ) {
        return;
      }
      anyReady = true;
      if (
        def.props.power >= BIG_ABILITY_POWER ||
        def.props.slow !== null ||
        def.props.dot !== null ||
        def.bot?.customDamage === true
      ) {
        keyReady = true;
      }
      if (def.shape === 'melee') {
        // El alcance real del melee suma el hurtbox mayor del roster; se usa
        // como cota conservadora para no quedarse dentro del cono.
        meleeReach = Math.max(meleeReach, def.range + maxHitRadius() + 0.4);
      } else if (def.shape === 'beam') {
        beamReady = true;
        beamRange = Math.max(beamRange, def.range);
      }
    };

    for (let slot = 0; slot < 4; slot++) {
      const id = target.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      consider(def, this.abilityCooldown(target, slot) <= 0.5);
    }
    if (target.activeCast) consider(target.activeCast.def, true);

    return { meleeReach, beamReady, beamRange, anyReady, keyReady };
  }

  /** ¿El bot está casi sobre la línea de tiro de un haz rival? */
  private onEnemyBeamLine(
    self: MatchPlayerState,
    target: MatchPlayerState,
    range: number
  ): boolean {
    const distance = Math.hypot(self.x - target.x, self.z - target.z);
    if (distance > range + self.hitRadius) return false;
    const angle = Math.abs(
      normalizeAngle(Math.atan2(self.x - target.x, self.z - target.z) - target.facing)
    );
    return angle < 0.18;
  }

  /** Dirección perpendicular alrededor del objetivo para no quedarse quieto. */
  private orbit(target: Vec2, self: Vec2): Vec2 {
    const dir = directionTo(self, target);
    if (Math.hypot(dir.x, dir.z) < 0.001) return { x: 0, z: 0 };
    return {
      x: -dir.z * this.orbitSide * 0.85 + dir.x * 0.15,
      z: dir.x * this.orbitSide * 0.85 + dir.z * 0.15
    };
  }

  private preferredRange(self: MatchPlayerState, def: AbilityDef | null): number {
    if (def) {
      switch (def.shape) {
        case 'melee':
          return Math.max(1.1, def.range * 0.7);
        case 'projectile':
        case 'beam':
          return Math.max(2, def.range * 0.72);
        case 'dash':
          return Math.max(2, def.dashDistance * 0.55);
        case 'aoe':
          // El círculo se centra a `range`; el cono nace ahí y avanza `radius`,
          // así que la distancia cómoda es el punto medio de su longitud.
          return def.aoeShape === 'cone'
            ? def.range + def.radius * 0.5
            : def.range > 0.1
              ? def.range
              : Math.max(1, def.radius * 0.6);
        case 'self':
          return 2;
      }
    }

    let longest = 0;
    for (let slot = 0; slot < 4; slot++) {
      const id = self.abilityIds[slot];
      const ability = id ? ABILITIES[id] : null;
      if (!ability) continue;
      const reach =
        ability.shape === 'dash'
          ? ability.dashDistance
          : ability.shape === 'aoe'
            ? ability.range + ability.radius
            : ability.shape === 'self'
              ? 0
              : ability.range;
      longest = Math.max(longest, reach);
    }
    return clamp(longest * 0.6, 1.4, 6.5);
  }

  /**
   * Posición prevista del rival en el momento del impacto. El proyectil no
   * existe hasta terminar el `windup`, así que el adelanto incluye tanto la
   * preparación como el vuelo. El segundo pase corrige el tiempo de vuelo con
   * la distancia ya adelantada.
   */
  private predictTarget(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef | null,
    leadFactor = this.tuning.lead
  ): TargetPrediction {
    const windup = def?.startup ?? 0;
    const projectileSpeed =
      def && def.shape === 'projectile' && def.projectileSpeed > 0
        ? def.projectileSpeed
        : 0;
    let predictedX = target.x;
    let predictedZ = target.z;
    let time = windup;
    let distance = Math.hypot(predictedX - self.x, predictedZ - self.z);

    for (let pass = 0; pass < 2; pass++) {
      const travel = projectileSpeed > 0 ? distance / projectileSpeed : 0;
      time = windup + travel;
      const lead = time * leadFactor;
      predictedX = target.x + target.vx * lead;
      predictedZ = target.z + target.vz * lead;
      distance = Math.hypot(predictedX - self.x, predictedZ - self.z);
    }

    return { x: predictedX, z: predictedZ, time, distance };
  }

  /**
   * Punto al que debe mirar el bot para que el `facing` real coincida con la
   * predicción. El error angular se mantiene estable unos frames para que la
   * puntería sea imperfecta sin que el bot tiemble.
   */
  private aimPoint(
    self: MatchPlayerState,
    target: MatchPlayerState,
    prediction: TargetPrediction,
    def: AbilityDef | null
  ): Vec2 {
    const dx = prediction.x - self.x;
    const dz = prediction.z - self.z;
    if (Math.hypot(dx, dz) < 0.0001) {
      return { x: prediction.x, z: prediction.z };
    }
    let angle = Math.atan2(dx, dz);
    if (def && def.shape !== 'self') angle += this.aimBiasFor(target);
    return {
      x: self.x + Math.sin(angle) * prediction.distance,
      z: self.z + Math.cos(angle) * prediction.distance
    };
  }

  private aimBiasFor(target: MatchPlayerState): number {
    if (this.aimBiasTarget !== target || this.clock >= this.aimBiasUntil) {
      this.aimBiasTarget = target;
      this.aimBiasUntil =
        this.clock + this.tuning.decision * (1.5 + Math.random());
      this.aimBias = (Math.random() * 2 - 1) * this.tuning.aimError;
    }
    return this.aimBias;
  }

  private moveTowards(
    self: MatchPlayerState,
    goal: Vec2,
    dt: number,
    colliders?: readonly Collider[]
  ): Vec2 {
    return this.movement.moveTowards(self, goal, dt, colliders);
  }

  private addSeparation(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    direction: Vec2
  ): Vec2 {
    return this.movement.addSeparation(self, players, direction);
  }

  private pickDetour(self: MatchPlayerState, desired: Vec2): Vec2 {
    return this.movement.pickDetour(self, desired);
  }

  private allySideStep(
    self: MatchPlayerState,
    ally: MatchPlayerState,
    goal: Vec2
  ): Vec2 {
    return this.movement.allySideStep(self, ally, goal);
  }

  private trailBackOff(self: MatchPlayerState): Vec2 {
    return this.movement.trailBackOff(self);
  }
}
