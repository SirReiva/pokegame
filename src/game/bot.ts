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
 *    fuerte, desconfían de los que son eficaces contra ellos y evitan pelear
 *    contra rivales inmunes a todo su daño.
 * 4. Movimiento: mantiene la distancia, se acerca para apuntar y se separa de
 *    sus aliados.
 *
 * El apuntado es fiel al juego: `facing` solo cambia al moverse, así que el bot
 * gira hacia el objetivo avanzando en esa dirección antes de lanzar.
 */

import { ABILITIES, type AbilityDef, type BuffStat } from './abilities';
import {
  aoeAreaFrom,
  aoeContains,
  aoeDistance,
  type AoeArea
} from './aoeGeometry';
import { BotNavGrid, type NavHazard, type NavPoint } from './botNav';
import {
  computeDamage,
  pointSegmentDistance,
  raycastColliderDistance,
  sectorOverlapsCircle,
  segmentBlockedByColliders
} from './combat';
import { CONFIG, DEG } from './config';
import { IDLE_INPUT, type DeviceInputSnapshot } from './input';
import { ITEM_DEFINITIONS, type PickupSpawn } from './items';
import type { MatchPlayerState } from './matchState';
import { createTeamRecord, otherTeams, type BotDifficulty } from './multiplayer';
import { maxHitRadius } from './roster';
import { respawnsForTeam, terrainAt, type Team } from './terrain';
import { typeEffectiveness } from './typeChart';
import { isTargetVisible, lineOfSightBlocked, terrainConcealment } from './vision';
import type { Collider } from './world';

interface BotTuning {
  /** Tiempo que debe ver a un objetivo antes de atacarlo. */
  reaction: number;
  /** Cada cuánto reevalúa objetivo y habilidad. */
  decision: number;
  /**
   * Probabilidad de elegir una acción viable peor que la mejor puntuada. Un
   * experto falla poco, pero no tiene una evaluación perfecta.
   */
  decisionError: number;
  /** Error angular máximo para considerar que está encarado. */
  aimTolerance: number;
  /**
   * Error angular máximo de apuntado (radianes). Se mantiene estable durante
   * unos frames para que el bot no tiemble, pero le hace fallar tiros que con
   * puntería perfecta entrarían.
   */
  aimError: number;
  /** Multiplicador sobre el rango de visión de la especie. */
  visionFactor: number;
  /** Peso de las ventajas y desventajas de tipo al elegir objetivo. */
  matchupWeight: number;
  /** Vida por debajo de la cual huye. */
  retreatHp: number;
  /** Segundos que recuerda la última posición vista. */
  memory: number;
  /** Cuánto adelanta el disparo a un objetivo en movimiento (0-1). */
  lead: number;
  /** Probabilidad de usar el instinto común cuando toca. */
  commonChance: number;
  /** Cada cuánto recalcula la ruta. */
  pathInterval: number;
  /** Antelación con la que reacciona a un windup rival. */
  evadeWindow: number;
  /** Cuánto prioriza a un rival que está preparando una habilidad. */
  punishBonus: number;
  /** Probabilidad de darse cuenta y castigar un windup rival. */
  punishChance: number;
  /** Error al estimar cuánto le queda al windup rival (segundos). */
  punishTimingError: number;
  /** Reacción media antes de intentar interrumpir un windup (segundos). */
  punishReaction: number;
}

/**
 * La dificultad se expresa sobre todo con predicción (`lead`), castigo de
 * windups, memoria, coordinación y evaluación de daño. Visión y reacción se
 * mantienen en rangos humanos: difícil y experto no ven más lejos que un
 * jugador ni reaccionan en milisegundos.
 */
const TUNING: Record<BotDifficulty, BotTuning> = {
  easy: {
    reaction: 0.55,
    decision: 0.45,
    decisionError: 0.3,
    aimTolerance: 0.34,
    aimError: 0.2,
    visionFactor: 0.82,
    matchupWeight: 0.55,
    retreatHp: 0.22,
    memory: 2.2,
    lead: 0.1,
    commonChance: 0.35,
    pathInterval: 0.9,
    evadeWindow: 0.28,
    punishBonus: 1.5,
    punishChance: 0.25,
    punishTimingError: 0.4,
    punishReaction: 0.24
  },
  normal: {
    reaction: 0.3,
    decision: 0.26,
    decisionError: 0.18,
    aimTolerance: 0.2,
    aimError: 0.1,
    visionFactor: 0.96,
    matchupWeight: 1,
    retreatHp: 0.3,
    memory: 3.6,
    lead: 0.65,
    commonChance: 0.65,
    pathInterval: 0.65,
    evadeWindow: 0.44,
    punishBonus: 3,
    punishChance: 0.5,
    punishTimingError: 0.22,
    punishReaction: 0.15
  },
  hard: {
    reaction: 0.2,
    decision: 0.15,
    decisionError: 0.1,
    aimTolerance: 0.1,
    aimError: 0.05,
    visionFactor: 1,
    matchupWeight: 1.35,
    retreatHp: 0.36,
    memory: 5,
    lead: 0.95,
    commonChance: 0.9,
    pathInterval: 0.45,
    evadeWindow: 0.62,
    punishBonus: 4.5,
    punishChance: 0.72,
    punishTimingError: 0.1,
    punishReaction: 0.08
  },
  expert: {
    reaction: 0.16,
    decision: 0.09,
    decisionError: 0.05,
    aimTolerance: 0.06,
    aimError: 0.025,
    visionFactor: 1,
    matchupWeight: 1.6,
    retreatHp: 0.4,
    memory: 6,
    lead: 0.98,
    commonChance: 1,
    pathInterval: 0.3,
    evadeWindow: 0.78,
    punishBonus: 6,
    punishChance: 0.9,
    punishTimingError: 0.04,
    punishReaction: 0.03
  }
};

/** Factor de visión que la dificultad aplica a su propio observador. */
export function botVisionFactor(difficulty: BotDifficulty): number {
  return TUNING[difficulty].visionFactor;
}

interface Vec2 {
  x: number;
  z: number;
}

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

/** Distancia a la que dos aliados empiezan a empujarse para no solaparse. */
const ALLY_SEPARATION_RADIUS = 1.15;
/** Distancia a la que un aliado en frente empieza a desviar el rumbo. */
const ALLY_AVOID_RADIUS = 1.7;
/** Fuerza del desvío lateral al rodear a un aliado. */
const ALLY_AVOID_STRENGTH = 1.1;
/** Distancia a la que el bot con menos prioridad cede el paso de frente. */
const ALLY_YIELD_RADIUS = 1.25;
/** Tiempo que se mantiene la cesión aunque el aliado se aleje un poco. */
const ALLY_YIELD_HOLD = 0.6;
/** Distancia a la que se deja de ceder el paso. */
const ALLY_YIELD_RELEASE = 2.6;
/** Segundos de retroceso cuando el desvío lateral no basta. */
const BACK_OFF_SECONDS = 0.9;
/** Distancia que se retrocede por el rastro para salir de un bloqueo. */
const BACK_OFF_DISTANCE = 1.6;

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
 * Penalización para un rival inmune a todo el daño del bot. No lo convierte en
 * objetivo mientras haya cualquier otra pelea posible.
 */
const IMMUNE_TARGET_PENALTY = 60;
/** Vida por debajo de la cual una pelea con desventaja de tipo justifica huir. */
const MATCHUP_RETREAT_HP = 0.6;

/**
 * Penalización al elegir objetivo por el daño que puede evitar ahora mismo.
 * Un rival invulnerable suma el máximo, y uno con escudo o buffs defensivos
 * solo la fracción mitigada: sigue siendo atacable si no hay otra opción.
 */
const MITIGATED_TARGET_PENALTY = 40;

/** Potencia a partir de la cual una habilidad se considera "grande". */
const BIG_ABILITY_POWER = 100;

/**
 * Mitigación a partir de la cual no compensa gastar una habilidad grande. El
 * golpe entra muy reducido y su cooldown es demasiado caro para malgastarlo.
 */
const BIG_ABILITY_MITIGATION_THRESHOLD = 0.4;

/**
 * Enfriamiento de referencia para valorar el daño por segundo. Una habilidad
 * con 4 s de cooldown conserva su daño esperado; las más lentas se penalizan y
 * las muy rápidas se valoran algo más, sin llegar a spamear la definitiva.
 */
const COOLDOWN_REFERENCE = 4;
const COOLDOWN_WEIGHT_MIN = 0.45;
const COOLDOWN_WEIGHT_MAX = 1.25;

/** Bonus por un golpe que se espera letal, y por dejar al rival a remate. */
const LETHAL_BONUS = 60;
const FINISH_BONUS = 18;
/** Fracción de vida máxima que cuenta como "a remate". */
const FINISH_HP_FRACTION = 0.18;

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

/** Bonus por romper el casteo de una curación o reanimación enemiga. */
const SUPPORT_DENY_BONUS = 35;

/**
 * Puntuación mínima para gastar una habilidad. Por debajo de este umbral no
 * compensa el cooldown: curas a vida casi llena o ataques que el rival va a
 * castigar puntúan negativo, y elegir "la menos mala" solo desperdicia el
 * recurso.
 */
const MIN_ABILITY_SCORE = 0;

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

interface SupportProfile {
  /** Devuelve al combate a los aliados caídos dentro del área. */
  revive?: boolean;
  /** Reparte curación entre los aliados vivos dentro del área. */
  healAllies?: boolean;
}

/**
 * Áreas cuyo `aoeEffect` beneficia a los aliados. Son habilidades con
 * `power: 0` que el filtro de efectos ofensivos descarta, así que el bot
 * necesita una vía propia para valorarlas y lanzarlas.
 */
const SUPPORT_PROFILES: Partial<Record<string, SupportProfile>> = {
  deseo: { revive: true },
  recuperacion: { healAllies: true },
  recuperacionHoOh: { healAllies: true }
};

/** Radio en el que un rival cercano justifica huir con poca vida. */
const RETREAT_DANGER_RADIUS = 9;
/** Mínimo de tiempo que dura una huida, aunque la base esté cerca. */
const RETREAT_MIN_SECONDS = 2.5;
/** Margen sobre el tiempo de trayecto para no cortar la huida antes de llegar. */
const RETREAT_TIME_MARGIN = 2;
/** Tope de seguridad para una huida; no es una duración fija. */
const RETREAT_MAX_SECONDS = 18;
/** Extensión cuando el perseguidor sigue dentro de este radio. */
const RETREAT_PURSUER_RADIUS = 8;
const RETREAT_PURSUIT_EXTENSION = 2.5;
/** Radio en el que se busca cobertura al iniciar una huida. */
const RETREAT_COVER_RADIUS = 6;
/** Vigencia del punto de cobertura elegido durante la huida. */
const RETREAT_COVER_SECONDS = 3;
/** Distancia al punto de aparición que cuenta como "ya en la base". */
const RETREAT_ARRIVE_DISTANCE = 2.5;
/** Espera antes de poder volver a huir tras llegar a la base sin curación. */
const RETREAT_COOLDOWN_SECONDS = 4;

/** Umbrales dinámicos de retirada según el intercambio y el número de vivos. */
const RETREAT_EXCHANGE_LOSS = 0.8;
const RETREAT_EXCHANGE_EDGE = 1.2;
const RETREAT_LOSING_HP = 0.6;
const RETREAT_OUTNUMBERED_HP = 0.65;
const RETREAT_THRESHOLD_MIN = 0.12;
const RETREAT_THRESHOLD_MAX = 0.68;

/** Vida por debajo de la cual un bot con Regeneración busca curarse oculto. */
const REGEN_START_HP = 0.55;
/** Vida a la que un bot con Regeneración empieza a retirarse de la pelea. */
const REGEN_RETREAT_HP = 0.5;
/** Vida a la que deja de esperar oculto. */
const REGEN_STOP_HP = 0.8;
/** Tiempo máximo que se queda oculto regenerando de una vez. */
const REGEN_MAX_SECONDS = 7;
/** Enfriamiento tras salir del modo de regeneración. */
const REGEN_COOLDOWN_SECONDS = 4;
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

/**
 * Vida por debajo de la cual el bot busca una poción conocida. Los bots solo
 * consideran objetos que su equipo ve ahora o que ha visto hace poco.
 */
const PICKUP_SEEK_HP = 0.7;
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
const NO_PICKUP_KNOWLEDGE: ReadonlyMap<string, boolean> = new Map();

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

/** Foco compartido por los bots de un mismo equipo. */
export interface BotFocus {
  slot: number | null;
  /** Reloj del bot en el que caduca el foco. */
  until: number;
}

/** Reclamación temporal de una poción por parte de un bot. */
export interface BotPickupClaim {
  slot: number;
  until: number;
  /** Puntuación con la que se reclamó; sirve para arbitrar reclamaciones. */
  priority: number;
}

/** Petición de ayuda de un aliado bajo de vida y perseguido. */
export interface BotHelpCall {
  slot: number;
  x: number;
  z: number;
  hpFraction: number;
  until: number;
}

/** Reclamación de un aliado caído que otro bot va a revivir. */
export interface BotReviveClaim {
  slot: number;
  until: number;
}

/** Zona de patrulla reservada por un bot para repartir el mapa. */
export interface BotPatrolClaim {
  x: number;
  z: number;
  until: number;
}

/** Daño que otro bot ya prevé aplicar a un objetivo, para no sobrematar. */
export interface BotDamageCommitment {
  attackerSlot: number;
  targetSlot: number;
  amount: number;
  until: number;
}

export type BotEngageCall = 'engage' | 'retreat' | 'group';

/** Pizarra compartida por los bots de un equipo. */
export interface TeamBlackboard {
  focus: BotFocus;
  /** Última posición vista de cada rival, compartida por el equipo. */
  lastSeen: Map<number, { x: number; z: number; at: number }>;
  aliveAllies: number;
  aliveEnemies: number;
  pickupClaims: Map<string, BotPickupClaim>;
  reviveClaims: Map<number, BotReviveClaim>;
  patrolClaims: Map<number, BotPatrolClaim>;
  engageCall: BotEngageCall;
  committedDamage: Map<string, BotDamageCommitment>;
  help: BotHelpCall | null;
}

export type BotSquad = Record<Team, TeamBlackboard>;

function createTeamBlackboard(): TeamBlackboard {
  return {
    focus: { slot: null, until: 0 },
    lastSeen: new Map(),
    aliveAllies: 0,
    aliveEnemies: 0,
    pickupClaims: new Map(),
    reviveClaims: new Map(),
    patrolClaims: new Map(),
    engageCall: 'engage',
    committedDamage: new Map(),
    help: null
  };
}

export function createBotSquad(): BotSquad {
  return createTeamRecord(createTeamBlackboard);
}

/** Peligro ya lanzado que el bot debe esquivar aunque no haya windup rival. */
export interface BotHazard {
  kind: 'projectile' | 'aoe';
  x: number;
  z: number;
  /** Radio propio del peligro; el bot suma después su propio `hitRadius`. */
  radius: number;
  /** Geometría del área: `circle` o `cone`. */
  shape?: AbilityDef['aoeShape'];
  /** Dirección unitaria del cono. */
  dirX?: number;
  dirZ?: number;
  /** Semiángulo del cono en radianes. */
  halfAngle?: number;
  vx?: number;
  vz?: number;
  /** Segundos que el peligro seguirá activo. */
  remaining?: number;
  ownerTeam: MatchPlayerState['team'];
}

/** Sin peligros externos (partidas sin bots o primer frame). */
const NO_HAZARDS: readonly BotHazard[] = [];

/**
 * Vista táctica del equipo que el motor calcula una sola vez por frame. Los
 * bots no recalculan visibilidad por su cuenta: comparten el mismo conjunto que
 * alimenta la niebla y la histéresis de equipo.
 */
export interface BotWorldView {
  /** Slots de actores visibles para el equipo en este frame. */
  readonly visibleSlots: ReadonlySet<number>;
}

const EMPTY_BOT_WORLD_VIEW: BotWorldView = { visibleSlots: new Set() };

/** Amenaza inmediata creada por el windup visible de un rival. */
interface IncomingThreat {
  source: MatchPlayerState;
  /** Segundos que faltan para que la habilidad rival se ejecute. */
  remaining: number;
  /** Dirección recomendada para salir del área/línea de peligro. */
  evade: Vec2;
  /** Cuanto más alto, más urgente es responder. */
  severity: number;
}

/** Habilidad elegida para cortar el windup rival y dónde hay que apuntar. */
interface InterruptPlan {
  slot: number;
  /** Posición proyectada del rival cuando el golpe llegue. */
  aim: Vec2;
}

/** Dirección para salir del peligro ya lanzado más urgente. */
interface HazardEvasion {
  direction: Vec2;
  /** Cuanto más alto, más prioridad tiene frente a otros peligros. */
  severity: number;
}

/** Posición prevista del rival cuando la habilidad pueda impactar. */
interface TargetPrediction {
  x: number;
  z: number;
  /** Tiempo total previsto: windup más vuelo del proyectil. */
  time: number;
  /** Distancia desde el bot hasta la posición prevista. */
  distance: number;
}

/** Amenazas listas del rival, usadas para ajustar la distancia de combate. */
interface EnemyThreatProfile {
  /** Alcance del melee peligroso listo, o 0. */
  meleeReach: number;
  /** Hay un haz listo y su alcance. */
  beamReady: boolean;
  beamRange: number;
  /** Alguna habilidad ofensiva lista. */
  anyReady: boolean;
  /** Una habilidad grande o de control está lista. */
  keyReady: boolean;
}

/** Resultado de evaluar la pelea actual como un intercambio de daño. */
interface FightAssessment {
  /** Segundos estimados para matar al objetivo. */
  timeToKill: number;
  /** Segundos estimados para que el objetivo mate al bot. */
  timeToDie: number;
  /** `timeToDie / timeToKill`: por encima de 1 la pelea favorece al bot. */
  exchange: number;
  /** Aliados vivos menos rivales vivos. */
  allyDiff: number;
  /** Umbral de vida dinámico para decidir la retirada. */
  retreatHp: number;
}

type PendingCastState = NonNullable<MatchPlayerState['activeCast']>;

/**
 * Lo que el bot cree saber de un windup rival. Se fija una sola vez por
 * lanzamiento: si falla la tirada, no lo castiga; y el error de tiempo puede
 * hacerle elegir una habilidad que llega tarde.
 */
interface PunishRead {
  cast: PendingCastState;
  commit: boolean;
  remainingError: number;
  /** Momento a partir del cual reacciona y puede intentar la interrupción. */
  readyAt: number;
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function directionTo(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.0001) return { x: 0, z: 0 };
  return { x: dx / length, z: dz / length };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class BotController {
  readonly slot: number;
  readonly difficulty: BotDifficulty;

  private readonly tuning: BotTuning;
  private readonly nav: BotNavGrid;
  private readonly squad: BotSquad;

  private clock = 0;
  private target: MatchPlayerState | null = null;
  private targetVisible = false;
  /**
   * Mejor multiplicador de tipo del bot contra el objetivo y del objetivo
   * contra el bot. Se calcula al elegir objetivo y guía tanto el ataque como
   * la cautela al moverse.
   */
  private targetMatchupOffense = 1;
  private targetMatchupDefense = 1;
  /** `false` si el objetivo visible es inmune a todo el daño del bot. */
  private engageTarget = true;
  private visibleTimer = 0;
  private visibleEnemies: MatchPlayerState[] = [];
  private threat: IncomingThreat | null = null;
  /** Peligros ya lanzados (proyectiles y áreas persistentes) de este frame. */
  private hazards: readonly BotHazard[] = NO_HAZARDS;
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
  /** `true` mientras espera oculto para curarse con Regeneración. */
  private recovering = false;
  private regenUntil = 0;
  private regenCooldownUntil = 0;
  /** Punto cercano al que se desplaza con cautela mientras regenera. */
  private regenGoal: Vec2 | null = null;
  private regenGoalTimer = 0;
  private regenCheckTimer = 0;
  private goal: Vec2 = { x: 0, z: 0 };
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
   * Estado de los objetos que el equipo ve en este frame (`true` disponible,
   * `false` usado). Los objetos fuera de visión no aparecen en el mapa.
   */
  private pickupKnowledge: ReadonlyMap<string, boolean> = NO_PICKUP_KNOWLEDGE;
  /**
   * Último estado visto de cada objeto, con el reloj en que se comprobó. Evita
   * olvidar que un objeto está usado en cuanto sale de visión.
   */
  private readonly pickupMemory = new Map<string, { available: boolean; at: number }>();
  /** Objetos descartados temporalmente tras un atasco camino de ellos. */
  private readonly pickupAvoidUntil = new Map<string, number>();
  /** Puntuación del objeto elegido en la última llamada a `pickupTarget`. */
  private pickupCandidatePriority = 0;

  private path: NavPoint[] = [];
  private pathGoal: Vec2 = { x: 0, z: 0 };
  private pathTimer = 0;

  private patrolTimer = 0;
  private orbitSide = 1;
  private orbitTimer = 0;

  private lastX = 0;
  private lastZ = 0;
  private stuckTimer = 0;
  private detourTimer = 0;
  private detour: Vec2 = { x: 0, z: 0 };
  /** Lado que se prueba al desatascarse; se alterna en cada intento. */
  private detourSide = 1;
  /** Intentos de desvío seguidos sin progreso; a partir del segundo se retrocede. */
  private stuckCount = 0;
  private lastStuckAt = -Infinity;
  /** Posiciones recientes para poder deshacer el camino si queda bloqueado. */
  private readonly trail: Vec2[] = [];
  private trailTimer = 0;
  private backOffTimer = 0;
  private backOffGoal: Vec2 = { x: 0, z: 0 };
  /** Aliado al que se le está cediendo el paso y hasta cuándo. */
  private yieldSource: MatchPlayerState | null = null;
  private yieldUntil = 0;
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
    this.orbitSide = slot % 2 === 0 ? 1 : -1;
  }

  update(
    dt: number,
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    colliders: readonly Collider[],
    knownPickups: ReadonlyMap<string, boolean> = NO_PICKUP_KNOWLEDGE,
    hazards: readonly BotHazard[] = NO_HAZARDS,
    view: BotWorldView = EMPTY_BOT_WORLD_VIEW
  ): DeviceInputSnapshot {
    this.clock += dt;
    this.pickupKnowledge = knownPickups;
    this.rememberPickups(self, knownPickups);
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
    this.updateThreat(self, colliders);
    this.updateHazardEvasion(self, colliders);

    // Un dash, hitstun o una preparación que clava al lanzador consumen el
    // frame: el snapshot idle evita pulsar habilidades que el motor rechaza.
    // Las preparaciones con `moveWhileStartup` sí llegan a `drive`, que deja
    // mover al bot pero no dispara otra habilidad mientras canaliza.
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

    this.decisionTimer -= dt;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = this.tuning.decision;
      this.decide(self, players, colliders);
    }

    return this.drive(dt, self, players, colliders);
  }

  /** Guarda el estado visible de los objetos y descarta recuerdos caducados. */
  private rememberPickups(
    self: MatchPlayerState,
    knownPickups: ReadonlyMap<string, boolean>
  ): void {
    const team = this.squad[self.team];
    for (const [key, available] of knownPickups) {
      this.pickupMemory.set(key, { available, at: this.clock });
      // Si el equipo ve que ya se usó, la reclamación deja de tener sentido.
      if (!available) team.pickupClaims.delete(key);
    }
    for (const [key, entry] of this.pickupMemory) {
      if (this.clock - entry.at > PICKUP_MEMORY_SECONDS) {
        this.pickupMemory.delete(key);
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
        `${pickup.x}:${pickup.z}`,
        this.clock + PICKUP_AVOID_SECONDS
      );
    }
  }

  private resetCombatState(): void {
    this.target = null;
    this.targetVisible = false;
    this.targetMatchupOffense = 1;
    this.targetMatchupDefense = 1;
    this.engageTarget = true;
    this.visibleTimer = 0;
    this.visibleEnemies = [];
    this.threat = null;
    this.hazards = NO_HAZARDS;
    this.hazardEvasion = null;
    this.aimBias = 0;
    this.aimBiasUntil = 0;
    this.aimBiasTarget = null;
    this.lastSeen = null;
    this.punishReads.clear();
    this.abilitySlot = null;
    this.supportCast = false;
    this.useCommon = false;
    this.retreat = false;
    this.retreatUntil = 0;
    this.retreatCooldownUntil = 0;
    this.retreatCover = null;
    this.retreatCoverUntil = 0;
    this.recovering = false;
    this.regenUntil = 0;
    this.regenCooldownUntil = 0;
    this.regenGoal = null;
    this.regenGoalTimer = 0;
    this.regenCheckTimer = 0;
    this.path = [];
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
      !this.nav.lineClear(self.x, self.z, this.goal.x, this.goal.z)
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
    // `best` agrupa a los rivales a los que el bot puede dañar; `immuneBest`
    // queda como último recurso para no quedarse sin objetivo si todos los
    // rivales visibles son inmunes a su daño.
    let best: MatchPlayerState | null = null;
    let bestScore = Infinity;
    let bestOffense = 1;
    let bestDefense = 1;
    let immuneBest: MatchPlayerState | null = null;
    let immuneScore = Infinity;
    let immuneDefense = 1;
    this.visibleEnemies = [];
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
      const offense = this.bestTypeMultiplier(self, enemy);
      const defense = this.bestTypeMultiplier(enemy, self);
      const typeWeight = this.tuning.matchupWeight;
      // Los remates valen más que perseguir al tanque lleno. El pequeño sesgo
      // por distancia evita que dos bots crucen el mapa por el mismo herido.
      let score = distance + hpFraction * 7 - (1 - hpFraction) * 4;
      if (this.target === enemy) score -= 1.5;
      // Foco de equipo: varios bots eligen al mismo objetivo mientras siga
      // visible, en vez de repartirse al azar por el mapa. Un rival inmune a
      // este bot no recibe el bonus: el foco no debe arrastrarlo a una pelea
      // que no puede ganar.
      if (focus.slot === enemy.slot && offense > 0) score -= 3.5;

      // Preferencia ofensiva: buscar al rival al que nuestros ataques le hacen
      // más daño y evitar a los que resisten. La inmunidad se trata aparte.
      if (offense >= 2) {
        score -= (4 + (offense - 2) * 3) * typeWeight;
      } else if (offense < 1) {
        score += (1 - offense) * 4 * typeWeight;
      }
      // Cautela defensiva: un rival que nos pega súper eficaz es peligroso
      // aunque esté herido. Si somos inmunes a su daño, es una pelea cómoda.
      if (defense >= 2) {
        score += (3 + (defense - 2) * 2) * typeWeight;
      } else if (defense === 0) {
        score -= 2.5 * typeWeight;
      }
      // Protección temporal: un rival invulnerable no recibe ningún golpe y
      // uno con escudo o buffs defensivos recibe menos. Sin esta penalización
      // el bot podía gastar la definitiva en alguien que acaba de reaparecer.
      // Solo se mira si la protección está activa, no cuántos segundos exactos
      // le quedan: ese dato no está a la vista del jugador.
      const protection =
        enemy.invulnerableTimer > 0 ? 1 : 1 - this.damageTakenFactor(enemy, null);
      if (protection > 0) score += protection * MITIGATED_TARGET_PENALTY;
      // Inmune a todo nuestro daño: mucho cuidado, solo se acepta si no hay
      // ningún otro rival visible.
      if (offense === 0) score += IMMUNE_TARGET_PENALTY;

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

      if (offense === 0) {
        if (score < immuneScore) {
          immuneScore = score;
          immuneBest = enemy;
          immuneDefense = defense;
        }
        continue;
      }

      if (score < bestScore) {
        bestScore = score;
        best = enemy;
        bestOffense = offense;
        bestDefense = defense;
      }
    }

    const chosen = best ?? immuneBest;
    const chosenOffense = best ? bestOffense : 0;
    const chosenDefense = best ? bestDefense : immuneDefense;
    this.targetMatchupOffense = chosen ? chosenOffense : 1;
    this.targetMatchupDefense = chosen ? chosenDefense : 1;

    if (chosen !== this.target) {
      this.visibleTimer = 0;
      this.abilitySlot = null;
    }
    this.target = chosen;
    this.targetVisible = chosen !== null;

    if (chosen) {
      // Solo el líder del equipo cambia el foco, y lo mantiene varios segundos.
      // Así dos bots no se pasan el objetivo el uno al otro cada frame.
      if (isLeader && chosenOffense > 0) {
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
          this.visibleEnemies.includes(focusEnemy) &&
          this.bestTypeMultiplier(self, focusEnemy) > 0;
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
    if (def.power <= 0 && def.slow === null && def.selfDamage <= 0) return null;

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
        !aoeContains(area, self.x, self.z, selfRadius, maxHitRadius())
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
        escapeDistance / Math.max(2.5, self.maxSpeed) + 0.08;
      if (remaining > Math.max(this.tuning.evadeWindow, escapeTime)) return null;

      const evade = this.aoeEvadeDirection(area, self);
      const dangerRadius = area.radius + maxHitRadius();
      const fromCenter = aoeDistance(area, self.x, self.z);
      return {
        source: enemy,
        remaining,
        evade,
        severity:
          def.power + 20 + (1 - fromCenter / Math.max(0.001, dangerRadius)) * 30
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
        severity: def.power + 15
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
        severity: def.power + 18 + (1 - toSweep / dashReach) * 22
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
        severity: def.power + (1 - perpendicular / width) * 18
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
      return Math.max(0, area.radius - aoeDistance(area, x, z));
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
      const length = Math.hypot(toX, toZ);
      if (length < 0.15) {
        return { x: -area.dirX, z: -area.dirZ };
      }
      return { x: toX / length, z: toZ / length };
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

  /** Geometría de un peligro de área ya lanzado. */
  private hazardArea(hazard: BotHazard): AoeArea {
    return {
      shape: hazard.shape ?? 'circle',
      x: hazard.x,
      z: hazard.z,
      radius: hazard.radius,
      dirX: hazard.dirX ?? 0,
      dirZ: hazard.dirZ ?? 1,
      halfAngle: hazard.halfAngle ?? 0
    };
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
    return {
      direction: this.pickHazardEscape(self, direction, colliders),
      severity: 140 + (1 - distance / Math.max(0.001, dangerRadius)) * 80
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
        const distance = pointSegmentDistance(
          area.x,
          area.z,
          self.x,
          self.z,
          point.x,
          point.z
        );
        if (
          distance <= hazard.radius + self.hitRadius + HAZARD_AOE_MARGIN
        ) {
          return true;
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
  private navHazards(self: MatchPlayerState): NavHazard[] | undefined {
    const hazards: NavHazard[] = [];
    for (const hazard of this.hazards) {
      if (hazard.ownerTeam === self.team) continue;
      if (hazard.kind === 'projectile') continue;
      if ((hazard.remaining ?? Infinity) <= 0) continue;
      const padding = self.hitRadius + HAZARD_AOE_MARGIN;
      const area = this.hazardArea(hazard);
      if (area.shape === 'circle') {
        hazards.push({
          x: area.x,
          z: area.z,
          radius: area.radius + padding
        });
        continue;
      }
      // La navegación solo entiende círculos: un cono se aproxima con varios
      // discos a lo largo de su eje, más anchos cuanto más lejos del vértice.
      const segments = 4;
      for (let index = 0; index < segments; index++) {
        const t = (index + 0.5) / segments;
        const width = area.radius * t * Math.tan(area.halfAngle);
        hazards.push({
          x: area.x + area.dirX * area.radius * t,
          z: area.z + area.dirZ * area.radius * t,
          radius: Math.max(0.35, width) + padding
        });
      }
    }
    return hazards.length > 0 ? hazards : undefined;
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
      if (def.shape === 'dash' && def.power <= 0) continue;

      // Un golpe inmune no interrumpe: el motor anula el impacto entero.
      const effectiveness = typeEffectiveness(def.type, source.types);
      if (effectiveness === 0) continue;

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
      const weightedPower = def.power * effectiveness;
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
    const target = this.target;
    const targetIsVisible = target !== null && this.targetVisible && target.alive;
    const distance = target ? Math.hypot(target.x - self.x, target.z - self.z) : Infinity;
    const hpFraction = self.hp / Math.max(1, self.maxHp);
    this.abilitySlot = null;
    this.supportCast = false;
    this.useCommon = false;
    this.releasePickupClaim(self);
    this.releaseReviveClaims(self);
    // Cualquier decisión nueva invalida el daño comprometido en la anterior,
    // incluso si acaba eligiendo una habilidad de apoyo o ninguna.
    this.clearPlannedDamage(self);
    // Con un peligro ya encima, Impulso es una salida válida aunque no haya un
    // rival cerca: la rama de huida de `drive` solo necesita saber si toca
    // intentarlo.
    if (this.hazardEvasion && self.commonAbilityId === 'impulso') {
      this.useCommon = Math.random() < this.tuning.commonChance;
    }

    // Lectura de tipos del objetivo: atacar solo si podemos dañarlo, y huir
    // antes si nos supera claramente en efectividad.
    const targetOffense = target ? this.targetMatchupOffense : 1;
    const targetDefense = target ? this.targetMatchupDefense : 1;
    const hopelessFight =
      targetIsVisible && targetOffense === 0 && targetDefense > 0;
    const outmatchedFight =
      targetIsVisible && targetDefense >= 2 && targetDefense > targetOffense;
    const badFight =
      hopelessFight || (outmatchedFight && hpFraction < MATCHUP_RETREAT_HP);
    // Un rival inmune a todo el daño del bot no merece perseguirlo: se patrulla
    // por otra zona mientras no haya una pelea mejor.
    this.engageTarget = !targetIsVisible || targetOffense > 0;

    // La visión es compartida: un rival al otro lado del mapa visto por un
    // aliado no debe mantener al bot huyendo. Solo cuenta una amenaza cercana.
    const nearestEnemy = this.nearestVisibleEnemyDistance(self);
    const regenBot = self.commonAbilityId === 'regeneracion';
    const atBase =
      Math.hypot(self.x - self.spawn.x, self.z - self.spawn.z) <=
      RETREAT_ARRIVE_DISTANCE;
    const hidden = self.enemiesSeeing === 0;
    // Regeneración solo funciona si ningún rival le ve. Un windup visible que
    // todavía puede alcanzarle también hace peligroso quedarse quieto.
    const regenSafe =
      hidden &&
      nearestEnemy > REGEN_DANGER_RADIUS &&
      this.threat === null &&
      this.hazardEvasion === null;
    const canRecover =
      (regenBot && regenSafe) || this.findHealSlot(self) !== null;
    // Los objetos se conocen por posición desde el principio. Si el equipo ya
    // ve uno usado, `pickupTarget` lo descarta sin necesidad de ir hasta él.
    const pickup = hpFraction < PICKUP_SEEK_HP ? this.pickupTarget(self) : null;

    // La retirada ya no usa solo la vida: compara el intercambio de daño,
    // cuenta los vivos de cada equipo, los recursos disponibles y la facilidad
    // de escapar. El umbral resultante es mayor para cristales y menor para
    // tanques o bots con escudo/curación.
    const fight =
      targetIsVisible && target
        ? this.assessFight(self, target, pickup, colliders)
        : null;
    const retreatHp = regenBot
      ? Math.max(fight?.retreatHp ?? this.tuning.retreatHp, REGEN_RETREAT_HP)
      : fight?.retreatHp ?? this.tuning.retreatHp;
    const lowHp = hpFraction < retreatHp;
    const losingFight =
      fight !== null &&
      fight.exchange < RETREAT_EXCHANGE_LOSS &&
      hpFraction < RETREAT_LOSING_HP;
    const outnumbered =
      fight !== null &&
      fight.allyDiff <= -1 &&
      hpFraction < RETREAT_OUTNUMBERED_HP;
    const wantsRetreat = lowHp || badFight || losingFight || outnumbered;

    if (this.recovering) {
      // Deja de esperar si le ven, se acerca un rival, hay una amenaza en curso
      // o ya ha recuperado suficiente vida. El tope de tiempo evita que un bot
      // se quede escondido indefinidamente si la pelea está en otro sitio.
      const done =
        !regenBot ||
        !regenSafe ||
        hpFraction >= REGEN_STOP_HP ||
        this.clock >= this.regenUntil;
      if (done) {
        this.recovering = false;
        this.regenCooldownUntil = this.clock + REGEN_COOLDOWN_SECONDS;
        this.regenGoal = null;
        this.regenGoalTimer = 0;
        this.regenCheckTimer = 0;
        this.lastSeen = null;
        this.patrolTimer = 0;
      }
    }

    if (this.retreat) {
      if (!wantsRetreat || nearestEnemy > RETREAT_DANGER_RADIUS) {
        // El peligro ya pasó: vuelve a la acción sin esperar.
        this.stopRetreat(false);
      } else if (regenBot && regenSafe && hpFraction < REGEN_STOP_HP) {
        // Ya está oculto: mejor curarse aquí que seguir corriendo a la base.
        this.stopRetreat(false);
      } else if (atBase && !canRecover) {
        // La base no cura por sí sola. Quedarse plantado allí solo regala una
        // baja; es mejor volver a patrullar y buscar una pelea favorable.
        this.stopRetreat(true);
      } else if (this.clock >= this.retreatUntil) {
        if (!atBase && nearestEnemy <= RETREAT_PURSUER_RADIUS) {
          // La huida calculada terminó, pero el perseguidor sigue encima: no
          // se da por segura hasta romper la distancia.
          this.retreatUntil = this.clock + RETREAT_PURSUIT_EXTENSION;
        } else {
          this.stopRetreat(true);
        }
      }
    }

    if (
      !this.recovering &&
      regenBot &&
      regenSafe &&
      self.activeCast === null &&
      hpFraction < REGEN_START_HP &&
      this.clock >= this.regenCooldownUntil
    ) {
      this.recovering = true;
      this.regenUntil = this.clock + REGEN_MAX_SECONDS;
      this.regenGoal = null;
      this.regenGoalTimer = 0;
      this.regenCheckTimer = 0;
      this.retreat = false;
      this.lastSeen = null;
      this.path = [];
      this.pathTimer = 0;
    }

    if (this.recovering) {
      // Cualquier ataque o habilidad cortaría la regeneración: el bot se mueve
      // despacio por cobertura y no dispara hasta que termine o lo descubran.
      this.abilitySlot = null;
      this.useCommon = false;
      return;
    }

    if (
      !this.retreat &&
      wantsRetreat &&
      nearestEnemy <= RETREAT_DANGER_RADIUS &&
      this.clock >= this.retreatCooldownUntil &&
      !(atBase && !canRecover)
    ) {
      this.retreat = true;
      this.retreatUntil = this.clock + this.retreatTime(self, pickup);
      this.retreatCover = this.pickRetreatCover(self, colliders);
      this.retreatCoverUntil = this.clock + RETREAT_COVER_SECONDS;
    }

    // Huida: se planta a curarse si tiene una curación fiable lista y el rival
    // no está encima. Si no, corre hacia su base.
    if (this.retreat) {
      const healSlot = this.findHealSlot(self);
      if (healSlot !== null && distance > 3.2) this.abilitySlot = healSlot;
      this.useCommon = this.shouldUseCommon(self, distance, true, hpFraction);
      let cover = this.retreatCover;
      if (cover) {
        const coverEnemies = this.visibleEnemies.filter(
          (enemy) => enemy.alive && enemy.team !== self.team
        );
        const stale =
          this.clock >= this.retreatCoverUntil ||
          Math.hypot(cover.x - self.x, cover.z - self.z) < 0.9 ||
          coverEnemies.length === 0 ||
          !this.regenSegmentHidden(self, cover, colliders, coverEnemies);
        if (stale) {
          cover = null;
          this.retreatCover = null;
        }
      }
      if (pickup) {
        this.claimPickup(self, pickup);
        this.setGoal(pickup, pickup);
      } else if (cover) {
        this.setGoal(cover);
      } else {
        this.setGoal(self.spawn);
      }
      return;
    }

    // Las áreas de apoyo (revivir o curar aliados) se pueden lanzar sin un
    // rival a la vista. Si hay una pelea útil, `chooseAbility` ya suma su valor
    // y decide si compensa; fuera de combate el apoyo manda sobre patrullar o
    // recoger un objeto.
    const supportSlot = this.chooseSupportAbility(self, players, colliders);
    if (supportSlot !== null && (!targetIsVisible || targetOffense === 0)) {
      this.abilitySlot = supportSlot;
      this.supportCast = true;
      return;
    }

    // Sin rival útil a la vista, un bot dañado prefiere acercarse a un objeto
    // conocido antes que perseguir una posición recordada o patrullar.
    if (pickup && (!targetIsVisible || targetOffense === 0)) {
      this.claimPickup(self, pickup);
      this.setGoal(pickup, pickup);
      return;
    }

    if (targetIsVisible && targetOffense === 0) {
      // Todos sus ataques son inmunes al objetivo: mejor buscar otra pelea.
      this.lastSeen = null;
      this.updatePatrol(self);
      return;
    }

    if (targetIsVisible && this.visibleTimer >= this.tuning.reaction) {
      this.abilitySlot = this.chooseAbility(
        self,
        target,
        players,
        colliders
      );
      this.supportCast =
        this.abilitySlot !== null && this.isSupportSlot(self, this.abilitySlot);
      this.useCommon = this.shouldUseCommon(self, distance, false, hpFraction);
      return;
    }

    // Sin objetivo visible, acudir a la llamada de ayuda de un aliado herido
    // tiene prioridad sobre perseguir una posición recordada.
    const help = this.squad[self.team].help;
    if (
      help &&
      help.slot !== self.slot &&
      help.until > this.clock &&
      hpFraction > HELP_CALL_HP
    ) {
      this.setGoal({ x: help.x, z: help.z });
      return;
    }

    const ownMemory =
      this.lastSeen && this.clock - this.lastSeen.at <= this.tuning.memory
        ? this.lastSeen
        : null;
    const memory = ownMemory ?? this.squadLastSeen(self);
    if (memory) {
      this.setGoal({ x: memory.x, z: memory.z });
      return;
    }

    this.updatePatrol(self);
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

  /** Velocidad efectiva actual, con terreno, buffs, ralentización y escudo. */
  private effectiveSpeed(player: MatchPlayerState): number {
    const shieldSpeed =
      player.damageReductionTimer > 0 ? player.shieldSpeedMultiplier : 1;
    return Math.max(
      0.5,
      player.maxSpeed *
        player.terrainMultiplier *
        this.statMultiplier(player, 'speed') *
        player.slowMultiplier *
        shieldSpeed
    );
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
      if (!def || def.healSelf <= 0 || def.healOnHit) continue;
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
      if (!def || def.power <= 0 || def.category === 'status') continue;
      if (typeEffectiveness(def.type, defender.types) === 0) continue;
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
      // El windup también forma parte del ciclo: las habilidades lentas no se
      // pueden repetir tan rápido como sugiere el cooldown solo.
      const cycle = Math.max(0.75, def.cooldown + remaining) + def.startup;
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
    const selfDps = this.bestDamagePerSecond(self, target, true, colliders);
    const enemyDps = this.bestDamagePerSecond(target, self, false, colliders);
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
   * Duración de la huida según el trayecto real hasta la base o la poción. La
   * base no cura sola, pero el tiempo se calcula igual: si no hay recursos, el
   * bot dejará de huir al llegar y volverá a buscar una pelea favorable.
   */
  private retreatTime(
    self: MatchPlayerState,
    pickup: PickupSpawn | null
  ): number {
    const goal = pickup ?? self.spawn;
    let distance = Math.hypot(goal.x - self.x, goal.z - self.z);
    const route = this.nav.findPath(self.x, self.z, goal.x, goal.z, {
      types: self.types,
      preferConcealment: true,
      hazards: this.navHazards(self)
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
   * Punto cercano con cobertura que rompe la línea de visión sin alejarse de la
   * base. Solo se usa al empezar a huir y si los rivales todavía ven al bot.
   */
  private pickRetreatCover(
    self: MatchPlayerState,
    colliders: readonly Collider[]
  ): Vec2 | null {
    if (self.enemiesSeeing === 0) return null;
    const enemies = this.visibleEnemies.filter(
      (enemy) => enemy.alive && enemy.team !== self.team
    );
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
      if (!this.nav.isWalkable(cell.row, cell.col)) continue;

      const point = this.nav.cellCenter(cell.row, cell.col);
      const realDistance = Math.hypot(point.x - self.x, point.z - self.z);
      if (realDistance < 1 || realDistance > RETREAT_COVER_RADIUS) continue;
      if (!this.nav.lineClear(self.x, self.z, point.x, point.z)) continue;
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
   * Mejor multiplicador de tipo que `attacker` puede aplicar a `defender` con
   * sus habilidades dañinas. Si no tiene ninguna registrada, usa sus propios
   * tipos como aproximación. Devuelve 0 cuando todo su daño es inmune.
   */
  private bestTypeMultiplier(
    attacker: MatchPlayerState,
    defender: MatchPlayerState
  ): number {
    let best = -1;
    for (let slot = 0; slot < 4; slot++) {
      const id = attacker.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (!def || def.power <= 0) continue;
      best = Math.max(best, typeEffectiveness(def.type, defender.types));
    }
    if (best < 0) {
      for (const type of attacker.types) {
        best = Math.max(best, typeEffectiveness(type, defender.types));
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
    const enemies = this.visibleEnemies.filter(
      (enemy) => enemy.alive && enemy.team !== self.team
    );
    let best: Vec2 | null = null;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 1.2 + Math.random() * (REGEN_ROAM_RADIUS - 1.2);
      const x = self.x + Math.cos(angle) * distance;
      const z = self.z + Math.sin(angle) * distance;
      const cell = this.nav.worldToCell(x, z);
      if (!this.nav.isWalkable(cell.row, cell.col)) continue;

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

      // Preferir cobertura, no alejarse demasiado y mantener distancia.
      let score = concealment * 3 - realDistance * 0.12 + Math.random() * 0.35;
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
    if (!this.nav.isWalkable(cell.row, cell.col)) return false;
    if (!this.nav.lineClear(self.x, self.z, point.x, point.z)) return false;
    // Tampoco vale esconderse dentro de un charco o cruzar uno camino del
    // punto: los ticks del área seguirían haciendo daño aunque no hubiera nadie
    // a la vista.
    if (this.hazardPathBlocked(self, point)) return false;

    const enemies = this.visibleEnemies.filter(
      (enemy) => enemy.alive && enemy.team !== self.team
    );
    const concealment = terrainConcealment(
      terrainAt(point.x, point.z),
      self.types
    ).value;

    // Sin rivales conocidos, exige algo de cobertura para no pasearse por una
    // zona completamente abierta.
    if (enemies.length === 0 && concealment < REGEN_MIN_CONCEALMENT) {
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
      for (const enemy of enemies) {
        if (isTargetVisible(enemy, { x, z }, concealment, colliders, false)) {
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
      const key = `${pickup.x}:${pickup.z}`;
      const avoidUntil = this.pickupAvoidUntil.get(key);
      if (avoidUntil !== undefined) {
        if (this.clock < avoidUntil) continue;
        this.pickupAvoidUntil.delete(key);
      }
      const knownAvailable = this.pickupKnowledge.get(key);
      const remembered = this.pickupMemory.get(key);
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
      const claim = team.pickupClaims.get(key);
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
    const key = `${pickup.x}:${pickup.z}`;
    const team = this.squad[self.team];
    for (const [otherKey, claim] of team.pickupClaims) {
      if (claim.slot === self.slot) team.pickupClaims.delete(otherKey);
    }
    team.pickupClaims.set(key, {
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
      if (!this.nav.isWalkable(row, col)) continue;

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
      target !== null && this.targetVisible && target.alive && this.engageTarget;
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
      }

      if (!channeling && this.useCommon) {
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
    const yaw = self.camera.yaw;
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
    return def.healSelf > 0 && !def.healOnHit;
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

  private chooseAbility(
    self: MatchPlayerState,
    target: MatchPlayerState,
    players: readonly MatchPlayerState[],
    colliders: readonly Collider[]
  ): number | null {
    let bestSlot: number | null = null;
    let bestScore = -Infinity;
    const candidates: { slot: number; score: number }[] = [];

    for (let slot = 0; slot < 4; slot++) {
      if (self.cooldowns[slot] > 0.001) continue;
      const id = self.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (!def) continue;
      const support = this.supportScore(self, players, def, colliders);
      // Las áreas de apoyo se centran en el bot: no necesitan que haya un
      // rival dentro de su alcance para ser útiles.
      const prediction = this.predictTarget(self, target, def);
      const inRange = this.canHitPrediction(
        self,
        target,
        def,
        prediction,
        colliders
      );
      if (!inRange && support <= 0) continue;
      if (def.selfDamage > 0 && self.hp / Math.max(1, self.maxHp) < 0.52) {
        continue;
      }

      let score = inRange
        ? this.scoreAbility(
            self,
            target,
            def,
            slot,
            prediction,
            support,
            colliders
          )
        : -Infinity;
      if (support > 0) {
        score = score === -Infinity ? support : score + support;
      }
      candidates.push({ slot, score });
      if (score > bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    }

    // Ninguna opción aporta lo suficiente: es mejor no gastar el cooldown y
    // seguir moviéndose que lanzar una cura o un buff inútil.
    const chosenSlot = this.pickWithDecisionError(
      candidates,
      bestSlot,
      bestScore,
      MIN_ABILITY_SCORE
    );
    if (chosenSlot === null) return null;
    const bestId = self.abilityIds[chosenSlot];
    const bestDef = bestId ? ABILITIES[bestId] : null;
    if (bestDef) {
      this.claimSupportRevives(self, players, bestDef, colliders);
    }
    this.commitPlannedDamage(self, target, chosenSlot);
    return chosenSlot;
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
    const profile = SUPPORT_PROFILES[def.id];
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
    const profile = SUPPORT_PROFILES[def.id];
    // Las áreas de apoyo conocidas nacen en la posición del lanzador.
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
    return def !== null && Object.hasOwn(SUPPORT_PROFILES, def.id);
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
    if (!def || def.power <= 0) return;
    if (slot !== 3 && def.power < BIG_ABILITY_POWER) return;

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
    if (def.power <= 0 || def.category === 'status') return 0;
    const category: 'physical' | 'special' =
      def.category === 'physical' ? 'physical' : 'special';
    const physical = category === 'physical';
    const randomFactor =
      (CONFIG.combat.randomMin + CONFIG.combat.randomMax) / 2;

    // El bot apunta hacia la posición prevista, así que el centro del área (o el
    // vértice del cono) cae en esa dirección a `range` del lanzador.
    const aimX = prediction.x - self.x;
    const aimZ = prediction.z - self.z;
    const aimLength = Math.hypot(aimX, aimZ);
    const aimDirX = aimLength > 0.0001 ? aimX / aimLength : Math.sin(self.facing);
    const aimDirZ = aimLength > 0.0001 ? aimZ / aimLength : Math.cos(self.facing);
    const centerReach = def.range > 0.1 ? def.range : 0;
    const area = aoeAreaFrom(
      def,
      self.x + aimDirX * centerReach,
      self.z + aimDirZ * centerReach,
      aimDirX,
      aimDirZ
    );

    // Las áreas con daño radial pegan menos en el borde. La distancia relevante
    // es la que separa al rival del centro del círculo o del vértice del cono.
    let power = def.power;
    if (def.shape === 'aoe' && def.radialDamage) {
      const offset = aoeDistance(area, prediction.x, prediction.z);
      const t = clamp(offset / Math.max(0.1, def.radius), 0, 1);
      power *= 1 - (1 - def.radialMinDamage) * t;
    }
    // En las áreas `overTime`, `power` es daño por segundo. No se asume que el
    // rival se quede toda la duración: se estiman los ticks que llegará a
    // recibir según lo cerca que esté del borde y lo rápido que pueda salir.
    if (
      def.shape === 'aoe' &&
      def.aoeDamageMode === 'overTime' &&
      def.aoeDuration > 0
    ) {
      const tickInterval = Math.max(0.1, def.aoeTickInterval);
      const maxTicks = Math.max(1, Math.floor(def.aoeDuration / tickInterval));
      const escapeDistance = this.aoeEscapeDistance(
        area,
        prediction.x,
        prediction.z
      );
      const escapeTime = escapeDistance / Math.max(1, this.effectiveSpeed(target));
      const expectedTime = Math.min(
        def.aoeDuration,
        escapeTime + tickInterval
      );
      const ticks = Math.max(
        1,
        Math.min(maxTicks, Math.ceil(expectedTime / tickInterval))
      );
      power *= ticks * tickInterval;
    }
    if (power <= 0) return 0;

    const input = {
      moveType: def.type,
      category,
      power,
      attacker: self.combat,
      defender: target.combat,
      attackerTypes: self.types,
      defenderTypes: target.types,
      attackMultiplier: this.statMultiplier(
        self,
        physical ? 'attack' : 'spAttack'
      ),
      defenseMultiplier: this.statMultiplier(
        target,
        physical ? 'defense' : 'spDefense'
      ),
      randomFactor
    };
    const normal = computeDamage({ ...input, critical: false }).damage;
    const critical = computeDamage({ ...input, critical: true }).damage;
    const expected =
      normal * (1 - CONFIG.combat.critChance) +
      critical * CONFIG.combat.critChance;
    const reduction =
      target.damageReductionTimer > 0 ? target.damageReduction : 0;
    return Math.max(1, Math.round(expected * (1 - reduction)));
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
      if (def.shape === 'dash' && def.power <= 0) continue;
      if (typeEffectiveness(def.type, target.types) === 0) continue;
      if (def.category === 'status') return true;
      if (def.power <= 0) continue;
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
      if (!poke || poke.power <= 0 || poke.category === 'status') continue;
      if (typeEffectiveness(poke.type, self.types) === 0) continue;
      // Solo cuenta si el poke puede alcanzar al bot desde donde está.
      const reach =
        poke.shape === 'melee'
          ? poke.range + maxHitRadius() + self.hitRadius
          : poke.shape === 'dash'
            ? poke.dashDistance + Math.max(0.5, poke.radius) + self.hitRadius
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
    if (def.shape === 'self') return 1;

    const targetRadius = target.hitRadius;
    let lateralTolerance: number;
    let aimDistance = Math.max(0.5, prediction.distance);
    switch (def.shape) {
      case 'melee':
        lateralTolerance =
          prediction.distance * Math.tan(def.halfAngle * DEG) +
          maxHitRadius() +
          targetRadius;
        break;
      case 'projectile':
        lateralTolerance = def.radius + targetRadius;
        break;
      case 'beam':
        lateralTolerance = def.radius + maxHitRadius() + targetRadius;
        break;
      case 'dash':
        lateralTolerance = Math.max(0.5, def.radius) + targetRadius;
        break;
      case 'aoe':
        if (def.aoeShape === 'cone') {
          // En un cono el error de apuntado es angular: basta con que el rival
          // quede dentro de `halfAngle` respecto al eje del lanzamiento.
          aimDistance = Math.max(0.5, prediction.distance);
          lateralTolerance =
            aimDistance * Math.tan(def.halfAngle * DEG) + targetRadius;
        } else {
          lateralTolerance = def.radius + maxHitRadius() + targetRadius;
          aimDistance = def.range > 0.1 ? def.range : 0.5;
        }
        break;
    }

    const maxAngle = Math.atan2(
      Math.max(0.05, lateralTolerance),
      aimDistance
    );
    const aimChance =
      this.tuning.aimError > 0
        ? clamp(maxAngle / this.tuning.aimError, 0, 1)
        : 1;

    // El adelanto usa solo una fracción de la velocidad (`lead`). La parte que
    // falta se nota sobre todo en la velocidad lateral al disparo.
    const direction = directionTo(self, prediction);
    const lateralSpeed = Math.abs(
      target.vx * direction.z - target.vz * direction.x
    );
    const residual = lateralSpeed * prediction.time * (1 - this.tuning.lead);
    const motionChance = clamp(
      1 - residual / Math.max(0.25, lateralTolerance * 2),
      0.5,
      1
    );
    return clamp(aimChance * motionChance, 0, 1);
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

  private scoreAbility(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    slot: number,
    prediction: TargetPrediction,
    support: number,
    colliders: readonly Collider[]
  ): number {
    const hpFraction = self.hp / Math.max(1, self.maxHp);
    const hasEffect =
      def.power > 0 ||
      def.healSelf > 0 ||
      def.slow !== null ||
      def.knockback > 0 ||
      def.buffs.length > 0 ||
      def.shield ||
      def.shape === 'dash';
    if (!hasEffect) return -Infinity;

    // Una habilidad inmune no hace daño ni aplica control: nunca es una buena
    // elección contra ese objetivo.
    if (def.power > 0 && typeEffectiveness(def.type, target.types) === 0) {
      return -Infinity;
    }
    if (
      def.power <= 0 &&
      def.slow !== null &&
      typeEffectiveness(def.type, target.types) === 0
    ) {
      return -Infinity;
    }

    const hitChance = this.hitChance(self, target, def, prediction);
    const expectedDamage = this.expectedDamage(
      self,
      target,
      def,
      prediction
    );
    const expectedHit = expectedDamage * hitChance;
    // La armadura del casteo rival absorbe el control de este golpe: el daño
    // entra, pero no hay hitstun, empuje ni cancelación.
    const armorAbsorbed = this.castArmorAbsorbs(target, def, expectedDamage);

    const offensive = def.power > 0 || def.slow !== null;
    // La gracia de reaparición se ve como estado, pero no su tiempo restante:
    // mientras esté activa no se gasta una habilidad ofensiva en ese rival.
    if (offensive && target.invulnerableTimer > 0) return -Infinity;

    const cooldownWeight = clamp(
      COOLDOWN_REFERENCE / Math.max(0.5, def.cooldown),
      COOLDOWN_WEIGHT_MIN,
      COOLDOWN_WEIGHT_MAX
    );
    let score = 0;

    if (def.power > 0) {
      const bigAbility = slot === 3 || def.power >= BIG_ABILITY_POWER;
      // Si un compañero ya ha comprometido daño suficiente para tumbarlo, no
      // se gasta otra definitiva en el mismo objetivo.
      if (bigAbility && this.committedDamageOn(self, target) >= target.hp) {
        return -Infinity;
      }
      const mitigation = 1 - this.damageTakenFactor(target, def);
      // El escudo ya rebaja el daño esperado, pero una habilidad grande cuyo
      // golpe entra muy reducido no compensa su cooldown.
      if (
        mitigation >= BIG_ABILITY_MITIGATION_THRESHOLD &&
        bigAbility
      ) {
        return -Infinity;
      }
      score += expectedHit * cooldownWeight;
      // Un impacto también aplica hitstun y cancela dash/preparaciones, salvo
      // que la armadura del casteo lo absorba.
      if (!armorAbsorbed) score += 8 * hitChance;
      if (expectedHit >= target.hp) {
        score += LETHAL_BONUS;
      } else if (
        target.hp - expectedHit <=
        target.maxHp * FINISH_HP_FRACTION
      ) {
        score += FINISH_BONUS;
      }
    }

    if (def.healSelf > 0) {
      let healScore = 70 + (1 - hpFraction) * 130;
      // `healOnHit` solo cura si el golpe conecta.
      if (def.healOnHit) healScore *= hitChance;
      score += healScore;
      // No gastar la curación a vida casi llena, salvo que también cure a
      // aliados heridos: entonces el lanzamiento sí aporta.
      if (hpFraction > 0.8 && support <= 0) score -= 220;
    }
    if (def.shield) score += 55 + (1 - hpFraction) * 70;
    if (def.buffs.length > 0) {
      score += this.buffValue(self, def, hpFraction);
    }
    if (def.slow) {
      const slowStrength = clamp(1 - def.slow.multiplier, 0, 1);
      const durationFactor = clamp(def.slow.duration / 2.5, 0.4, 1.5);
      score +=
        (15 + slowStrength * 70) * durationFactor * hitChance;
    }
    if (def.knockback > 0 && !armorAbsorbed) {
      score += Math.min(20, def.knockback * 12) * hitChance;
    }

    switch (def.shape) {
      case 'melee':
        score += 12;
        break;
      case 'projectile':
      case 'beam':
        score += prediction.distance > 2.5 ? 16 : 0;
        break;
      case 'dash':
        score += 10;
        if (def.power === 0) score += 35; // reposicionamiento / huida
        break;
      case 'aoe':
        score += 12;
        break;
      case 'self':
        score += 28;
        break;
    }

    // Un cono, un haz que atraviesa, un proyectil con `pierce` o un área pueden
    // golpear a más de un rival. El daño principal ya está en `score`, pero el
    // impacto extra también vale parte del cooldown.
    const extraTargets = this.countExtraAbilityTargets(
      self,
      target,
      def,
      prediction,
      colliders
    );
    if (extraTargets > 0) {
      const weight = def.shape === 'aoe' ? 32 : 24;
      score += extraTargets * weight * hitChance;
    }

    // Autodaño y windup son riesgos reales: cuanto más largo el segundo y más
    // caro el primero, menos compensa lanzarlo.
    if (def.selfDamage > 0) {
      const selfDamage = self.maxHp * def.selfDamage;
      score -= 15 + (selfDamage / Math.max(1, self.hp)) * 70;
    }
    // La armadura reduce el riesgo del startup: la habilidad puede completarse
    // aunque el rival esté haciendo pokes. Si el daño acumulado de los pokes
    // listos se queda por debajo del pozo, el riesgo baja mucho; si no, solo se
    // descuenta algo por la armadura intrínseca.
    const armorBonus = this.armorCastBonus(self, def);
    const startupRisk =
      def.armorPool > 0 ? (armorBonus > 0 ? 0.35 : 0.7) : 1;
    score -= Math.min(16, def.startup * 14) * startupRisk;
    score += armorBonus;

    // Aprovechar el windup rival: las habilidades instantáneas pueden cancelar
    // su preparación; las que tardan más que el rival llegan tarde y además
    // dejan al bot plantado. Si la armadura del casteo absorbe el golpe, no
    // hay interrupción y no se cobran los bonus de castigo.
    const pending = target.activeCast;
    if (pending) {
      const remaining = pending.effectAt - pending.elapsed;
      if (
        remaining > 0 &&
        this.breaksCastArmor(target, def, expectedDamage)
      ) {
        if (def.startup <= remaining) score += 18;
        else score -= 22;
        // Cortar una curación o reanimación enemiga vale más que castigar un
        // ataque: esos PV (o ese aliado) vuelven a la pelea si se completa.
        const supportCast = SUPPORT_PROFILES[pending.def.id];
        if (
          pending.def.healSelf > 0 ||
          supportCast?.revive ||
          supportCast?.healAllies
        ) {
          score += SUPPORT_DENY_BONUS;
        }
        if (def.shape === 'melee' || def.shape === 'projectile' || def.shape === 'beam') {
          score += 10;
        }
        if (
          !pending.def.moveWhileStartup ||
          pending.def.blockMovementDuringCast ||
          pending.def.blockMovementUntilEndAnimation
        ) {
          score += 8;
        }
      }
    }

    // La definitiva se guarda para cuando el objetivo ya está tocado o hay
    // varios rivales en el área; si no, se usa la rotación corta.
    const targetHp = target.hp / Math.max(1, target.maxHp);
    if (slot === 3 && targetHp > 0.65) score -= 14;
    if (slot === 0) score += 8;
    return score;
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
    if (def.power <= 0 || def.shape === 'self') return 0;
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
            !aoeContains(aoeArea, enemy.x, enemy.z, enemy.hitRadius, maxHitRadius())
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
            maxHitRadius()
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

  private shouldUseCommon(
    self: MatchPlayerState,
    distance: number,
    retreating: boolean,
    hpFraction: number
  ): boolean {
    if (self.commonAbilityId === 'regeneracion') return false;
    if (self.cooldowns[4] > 0.001 || self.damageReductionTimer > 0) return false;
    if (Math.random() > this.tuning.commonChance) return false;

    if (self.commonAbilityId === 'proteccion') {
      return hpFraction < 0.58 && distance < 5.5;
    }
    if (self.commonAbilityId === 'impulso') {
      if (retreating) return distance < 4.2;
      return distance > 2.2 && distance < 5.2;
    }
    return false;
  }

  private combatMove(
    self: MatchPlayerState,
    target: MatchPlayerState,
    distance: number,
    def: AbilityDef | null,
    facingError: number,
    dt: number
  ): Vec2 {
    const threat = this.enemyThreatProfile(target);
    let preferred = this.adjustPreferredRange(
      self,
      target,
      def,
      this.preferredRange(self, def),
      threat
    );

    // Cautela de tipos: contra un rival que nos pega súper eficaz se mantiene
    // algo más de distancia; contra uno al que somos inmunes, se acorta. El
    // ajuste nunca saca la distancia preferida del alcance de la habilidad.
    const caution = this.targetMatchupDefense;
    if (caution !== 1) {
      const maxPreferred = this.maxUsefulRange(def, target);
      const adjust =
        caution === 0 ? -0.7 : Math.min(1.8, (caution - 1) * 0.7);
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
    if (!ready) {
      ready = new Float32Array(5);
      this.enemyReadyAt.set(enemy.slot, ready);
    }
    if (!seen) {
      seen = new Float32Array(5);
      seen.fill(-1);
      this.enemyCooldownSeen.set(enemy.slot, seen);
    }

    for (let slot = 0; slot < 5; slot++) {
      const current = enemy.cooldowns[slot] ?? 0;
      const previous = seen[slot];
      if (previous >= 0 && current > previous + 0.05) {
        const id = enemy.abilityIds[slot];
        const def = id ? ABILITIES[id] : null;
        const duration = Math.max(current, def?.cooldown ?? 0);
        ready[slot] = this.clock + duration;
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

  /** Perfil de habilidades ofensivas del rival que ya puede usar. */
  private enemyThreatProfile(target: MatchPlayerState): EnemyThreatProfile {
    let meleeReach = 0;
    let beamReady = false;
    let beamRange = 0;
    let anyReady = false;
    let keyReady = false;

    const consider = (def: AbilityDef | null, ready: boolean): void => {
      if (!def || !ready) return;
      if (def.power <= 0 && def.slow === null) return;
      anyReady = true;
      if (def.power >= BIG_ABILITY_POWER || def.slow !== null) keyReady = true;
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
    const distance = Math.hypot(goal.x - self.x, goal.z - self.z);
    if (distance < 0.12) return { x: 0, z: 0 };
    // Si el atajo cruza un área persistente, se usa A* con coste de peligro
    // aunque la línea esté despejada.
    const directBlockedByHazard = this.hazardPathBlocked(self, goal);
    if (distance < 1.6) {
      // El último tramo hacia una poción se hace en línea recta si los
      // colliders reales lo permiten. La rejilla de navegación infla los
      // obstáculos con el radio del cuerpo y puede marcar como bloqueada la
      // celda del objeto aunque se alcance a pie; A* entonces nunca cierra la
      // distancia y el bot se queda empujando al lado hasta descartarlo.
      const directPickup =
        this.goalPickup !== null &&
        goal.x === this.goalPickup.x &&
        goal.z === this.goalPickup.z &&
        (colliders === undefined ||
          !segmentBlockedByColliders(
            self.x,
            self.z,
            goal.x,
            goal.z,
            colliders
          ));
      // El steering local solo vale si no hay un obstáculo entre medias. Si lo
      // hay, se rodea con la navegación: atajar en línea recta dejaría al bot
      // empujando contra un muro fino.
      if (
        !directBlockedByHazard &&
        (directPickup ||
          this.nav.lineClear(self.x, self.z, goal.x, goal.z))
      ) {
        this.path = [];
        this.pathTimer = 0;
        return directionTo(self, goal);
      }
      return this.followPath(self, goal, dt);
    }
    if (
      !directBlockedByHazard &&
      this.nav.lineClear(self.x, self.z, goal.x, goal.z)
    ) {
      this.path = [];
      this.pathTimer = 0;
      return directionTo(self, goal);
    }
    return this.followPath(self, goal, dt);
  }

  private followPath(self: MatchPlayerState, goal: Vec2, dt: number): Vec2 {
    this.pathTimer += dt;
    const goalMoved = Math.hypot(goal.x - this.pathGoal.x, goal.z - this.pathGoal.z);
    if (goalMoved > 1.2 || this.pathTimer > this.tuning.pathInterval) {
      const result = this.nav.findPath(self.x, self.z, goal.x, goal.z, {
        types: self.types,
        preferConcealment: this.retreat || this.recovering,
        hazards: this.navHazards(self)
      });
      this.path = result.points;
      this.pathGoal = { ...goal };
      this.pathTimer = 0;
      if (result.status === 'unreachable') {
        if (this.retreat) {
          // En plena huida no se cambia a patrulla: si el destino era una
          // poción inalcanzable, se descarta, y se sigue la ruta parcial.
          if (this.goalPickup !== null) {
            this.avoidCurrentPickupGoal(self);
            this.goalPickup = null;
          }
        } else {
          // Destino inalcanzable: se descarta la poción si era el objetivo, se
          // libera su reclamación y se vuelve a patrullar en vez de empujar
          // contra la pared hasta el siguiente recálculo.
          this.abandonGoal(self);
          return directionTo(self, this.goal);
        }
      }
    } else if (this.path.length === 0) {
      // Ruta vacía reciente: se avanza en línea recta hasta el siguiente
      // intento para no recalcular A* cada frame.
      return directionTo(self, goal);
    }

    while (this.path.length > 0) {
      const waypoint = this.path[0];
      if (Math.hypot(waypoint.x - self.x, waypoint.z - self.z) > 0.55) break;
      this.path.shift();
    }

    if (this.path.length === 0) return directionTo(self, goal);
    return directionTo(self, this.path[0]);
  }

  /**
   * Evita que los aliados se bloqueen entre ellos. Hay tres capas:
   * 1. Empuje radial para no solaparse.
   * 2. Desvío lateral hacia el lado libre cuando un aliado va delante.
   * 3. Cesión de paso si van de frente: el bot con la plaza más alta retrocede
   *    hasta que el otro pase. Sin esto, la colisión física los deja apoyados
   *    el uno contra el otro sin que ninguno pueda avanzar.
   */
  private addSeparation(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    direction: Vec2
  ): Vec2 {
    let x = direction.x;
    let z = direction.z;
    const length = Math.hypot(x, z);
    if (length < 0.0001) return { x, z };
    const dirX = x / length;
    const dirZ = z / length;

    let yieldSource: MatchPlayerState | null = null;

    for (const other of players) {
      if (other === self || !other.alive || other.team !== self.team) continue;
      const dx = self.x - other.x;
      const dz = self.z - other.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= 0.001) continue;

      if (distance < ALLY_SEPARATION_RADIUS) {
        const push = (ALLY_SEPARATION_RADIUS - distance) * 0.9;
        x += (dx / distance) * push;
        z += (dz / distance) * push;
      }

      const toX = -dx;
      const toZ = -dz;
      const ahead = toX * dirX + toZ * dirZ;
      if (ahead <= 0.05 || distance > ALLY_AVOID_RADIUS) continue;

      // Choque frontal contra un aliado con prioridad: se aparta hacia atrás
      // en diagonal para abrirle el paso en vez de empujarse mutuamente. Solo
      // cuenta si el aliado se mueve de verdad: uno atascado conserva `vx`/`vz`
      // altas y, si no se comprueba el avance real, provoca una cesión infinita.
      const still = this.isAllyStill(other);
      const otherSpeed = Math.hypot(other.vx, other.vz);
      const approaching =
        !still &&
        otherSpeed > 0.2 &&
        (other.vx * dirX + other.vz * dirZ) / otherSpeed < -0.35;
      if (
        !this.targetVisible &&
        approaching &&
        self.slot > other.slot &&
        distance < ALLY_YIELD_RADIUS
      ) {
        yieldSource = other;
        continue;
      }

      // Desviarse al lado contrario al que ocupa el aliado. En un choque
      // frontal exacto ambos usan su misma perpendicular relativa, que en
      // coordenadas absolutas apunta a lados opuestos, así que se cruzan.
      let perpX = -dirZ;
      let perpZ = dirX;
      const side = toX * perpX + toZ * perpZ;
      if (side > 0.12) {
        perpX = -perpX;
        perpZ = -perpZ;
      }
      const proximity = 1 - distance / ALLY_AVOID_RADIUS;
      const strength = proximity * ALLY_AVOID_STRENGTH;
      x += perpX * strength;
      z += perpZ * strength;
    }

    if (yieldSource) {
      this.yieldSource = yieldSource;
      this.yieldUntil = this.clock + ALLY_YIELD_HOLD;
    }

    const active = this.yieldSource;
    if (
      active &&
      active.alive &&
      !this.isAllyStill(active) &&
      this.clock < this.yieldUntil
    ) {
      const dx = self.x - active.x;
      const dz = self.z - active.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.001 && distance < ALLY_YIELD_RELEASE) {
        const awayX = dx / distance;
        const awayZ = dz / distance;
        let sideX = -awayZ * this.orbitSide;
        let sideZ = awayX * this.orbitSide;
        if (!this.sideOpen(self, sideX, sideZ)) {
          sideX = -sideX;
          sideZ = -sideZ;
        }
        return { x: awayX + sideX * 0.55, z: awayZ + sideZ * 0.55 };
      }
    }

    return { x, z };
  }

  /** Dirección perpendicular libre para intentar salir de un bloqueo. */
  private pickDetour(self: MatchPlayerState, desired: Vec2): Vec2 {
    const length = Math.hypot(desired.x, desired.z);
    if (length < 0.0001) return { x: -this.orbitSide, z: 0 };
    const dx = desired.x / length;
    const dz = desired.z / length;
    const side = this.detourSide;
    const first = { x: -dz * side, z: dx * side };
    const second = { x: dz * side, z: -dx * side };
    if (this.sideOpen(self, first.x, first.z)) return first;
    if (this.sideOpen(self, second.x, second.z)) return second;
    return first;
  }

  /**
   * Dirección de paso lateral para rodear a un aliado que bloquea el camino.
   * Se elige el sentido de la tangente que más acerca al destino y se añade un
   * poco de separación para no rozar el cuerpo. A diferencia del desvío normal,
   * este vector se mantiene fijo durante `ALLY_DETOUR_SECONDS`: si se recalcula
   * cada frame, el bot gira en círculo alrededor del aliado en vez de pasarlo.
   */
  private allySideStep(
    self: MatchPlayerState,
    ally: MatchPlayerState,
    goal: Vec2
  ): Vec2 {
    const toX = ally.x - self.x;
    const toZ = ally.z - self.z;
    const distance = Math.hypot(toX, toZ);
    if (distance < 0.001) return { x: -this.detourSide, z: 0 };
    const nx = toX / distance;
    const nz = toZ / distance;
    let sideX = -nz;
    let sideZ = nx;
    const goalX = goal.x - self.x;
    const goalZ = goal.z - self.z;
    const towardGoal = sideX * goalX + sideZ * goalZ;
    if (Math.abs(towardGoal) < 0.05) {
      if (this.detourSide < 0) {
        sideX = -sideX;
        sideZ = -sideZ;
      }
    } else if (towardGoal < 0) {
      sideX = -sideX;
      sideZ = -sideZ;
    }
    // 90 % tangente + 45 % alejándose del aliado: pasa de largo sin quedar
    // pegado a su cuerpo.
    const x = sideX * 0.9 - nx * 0.45;
    const z = sideZ * 0.9 - nz * 0.45;
    const length = Math.hypot(x, z) || 1;
    const step = { x: x / length, z: z / length };
    // Si ese lado da contra una pared, se prueba el contrario.
    if (!this.sideOpen(self, step.x, step.z)) {
      return { x: -step.x, z: -step.z };
    }
    return step;
  }

  /** ¿Hay sitio transitable para desplazarse un poco en esta dirección? */
  private sideOpen(self: MatchPlayerState, x: number, z: number): boolean {
    const length = Math.hypot(x, z);
    if (length < 0.0001) return false;
    const dx = x / length;
    const dz = z / length;
    return this.nav.lineClear(
      self.x,
      self.z,
      self.x + dx * 1.4,
      self.z + dz * 1.4
    );
  }

  /**
   * Punto del rastro reciente a unos 1,6 unidades por detrás. Retroceder por
   * el camino ya recorrido es la salida más fiable cuando dos aliados se
   * encuentran de frente en un paso estrecho.
   */
  private trailBackOff(self: MatchPlayerState): Vec2 {
    let previousX = self.x;
    let previousZ = self.z;
    let travelled = 0;
    for (let index = this.trail.length - 1; index >= 0; index--) {
      const point = this.trail[index];
      travelled += Math.hypot(point.x - previousX, point.z - previousZ);
      previousX = point.x;
      previousZ = point.z;
      if (travelled >= BACK_OFF_DISTANCE) {
        return { x: point.x, z: point.z };
      }
    }
    const away = directionTo(this.goal, { x: self.x, z: self.z });
    return {
      x: self.x + away.x * BACK_OFF_DISTANCE,
      z: self.z + away.z * BACK_OFF_DISTANCE
    };
  }
}
