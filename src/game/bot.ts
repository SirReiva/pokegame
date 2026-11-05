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

import { ABILITIES, type AbilityDef } from './abilities';
import { BotNavGrid, type NavPoint } from './botNav';
import { pointSegmentDistance, segmentBlockedByColliders } from './combat';
import { CONFIG, DEG } from './config';
import { IDLE_INPUT, type DeviceInputSnapshot } from './input';
import { ITEM_DEFINITIONS, type PickupSpawn } from './items';
import type { MatchPlayerState } from './matchState';
import { otherTeam, type BotDifficulty } from './multiplayer';
import { maxHitRadius } from './roster';
import { respawnsForTeam, terrainAt } from './terrain';
import { typeEffectiveness } from './typeChart';
import { isTargetVisible, lineOfSightBlocked, terrainConcealment } from './vision';
import type { Collider } from './world';

interface BotTuning {
  /** Tiempo que debe ver a un objetivo antes de atacarlo. */
  reaction: number;
  /** Cada cuánto reevalúa objetivo y habilidad. */
  decision: number;
  /** Error angular máximo para considerar que está encarado. */
  aimTolerance: number;
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

const TUNING: Record<BotDifficulty, BotTuning> = {
  easy: {
    reaction: 0.55,
    decision: 0.45,
    aimTolerance: 0.34,
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
    aimTolerance: 0.2,
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
    reaction: 0.14,
    decision: 0.15,
    aimTolerance: 0.1,
    visionFactor: 1.04,
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
    reaction: 0.08,
    decision: 0.09,
    aimTolerance: 0.06,
    visionFactor: 1.08,
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
 * Diferencia de retardo que se considera empate al interrumpir. Por debajo de
 * este margen el orden depende del frame, así que vale más la precisión de la
 * habilidad que unos milisegundos de diferencia.
 */
const INTERRUPT_DELAY_TOLERANCE = 0.05;

/**
 * Puntuación mínima para gastar una habilidad. Por debajo de este umbral no
 * compensa el cooldown: curas a vida casi llena o ataques que el rival va a
 * castigar puntúan negativo, y elegir "la menos mala" solo desperdicia el
 * recurso.
 */
const MIN_ABILITY_SCORE = 0;

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
  recuperacion: { healAllies: true }
};

/** Radio en el que un rival cercano justifica huir con poca vida. */
const RETREAT_DANGER_RADIUS = 9;
/** Tiempo máximo de una huida antes de volver a la acción. */
const RETREAT_MAX_SECONDS = 6;
/** Distancia al punto de aparición que cuenta como "ya en la base". */
const RETREAT_ARRIVE_DISTANCE = 2.5;
/** Espera antes de poder volver a huir tras llegar a la base sin curación. */
const RETREAT_COOLDOWN_SECONDS = 4;

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

/** Foco compartido por los bots de un mismo equipo. */
export interface BotFocus {
  slot: number | null;
  /** Reloj del bot en el que caduca el foco. */
  until: number;
}

export interface BotSquad {
  blue: BotFocus;
  red: BotFocus;
}

export function createBotSquad(): BotSquad {
  return {
    blue: { slot: null, until: 0 },
    red: { slot: null, until: 0 }
  };
}

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

type PendingCastState = NonNullable<MatchPlayerState['pendingCast']>;

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
  private lastSeen: { x: number; z: number; at: number } | null = null;
  /** Lecturas por rival de su windup actual, para no volver a tirar cada frame. */
  private punishReads = new Map<number, PunishRead>();

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
    knownPickups: ReadonlyMap<string, boolean> = NO_PICKUP_KNOWLEDGE
  ): DeviceInputSnapshot {
    this.clock += dt;
    this.pickupKnowledge = knownPickups;
    this.rememberPickups(knownPickups);
    if (!self.alive) {
      this.resetCombatState();
      return { ...IDLE_INPUT };
    }

    this.updateAllyMotion(dt, self, players);
    this.recordTrail(dt, self);
    this.updateTarget(dt, self, players, colliders);
    this.updateThreat(self);

    // Un dash, hitstun o una preparación que clava al lanzador consumen el
    // frame: el snapshot idle evita pulsar habilidades que el motor rechaza.
    // Las preparaciones con `moveWhileWindup` sí llegan a `drive`, que deja
    // mover al bot pero no dispara otra habilidad mientras canaliza.
    if (
      self.dash !== null ||
      self.stunTimer > 0 ||
      self.hurtTimer > 0 ||
      (self.pendingCast !== null && !self.pendingCast.def.moveWhileWindup)
    ) {
      return { ...IDLE_INPUT };
    }

    this.decisionTimer -= dt;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = this.tuning.decision;
      this.decide(self, players);
    }

    return this.drive(dt, self, players, colliders);
  }

  /** Guarda el estado visible de los objetos y descarta recuerdos caducados. */
  private rememberPickups(knownPickups: ReadonlyMap<string, boolean>): void {
    for (const [key, available] of knownPickups) {
      this.pickupMemory.set(key, { available, at: this.clock });
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
  private avoidCurrentPickupGoal(): void {
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
    this.lastSeen = null;
    this.punishReads.clear();
    this.abilitySlot = null;
    this.supportCast = false;
    this.useCommon = false;
    this.retreat = false;
    this.retreatUntil = 0;
    this.retreatCooldownUntil = 0;
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
   * Devuelve la lectura del windup actual del rival. La tirada se hace una vez
   * por lanzamiento: el bot decide si lo castiga, con cuánto error calcula el
   * tiempo restante y cuánto tarda en reaccionar. Un error positivo le hace
   * creer que tiene más margen y puede lanzar una habilidad demasiado lenta;
   * uno negativo puede hacerle descartar una interrupción que sí habría
   * llegado. La reacción variable hace que una preparación corta le pille
   * todavía empezando a reaccionar.
   */
  private readPunish(enemy: MatchPlayerState): PunishRead | null {
    const pending = enemy.pendingCast;
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
    this.avoidCurrentPickupGoal();
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
    colliders: readonly Collider[]
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
    const focus = this.squad[self.team];
    if (focus.until <= this.clock) focus.slot = null;

    for (const enemy of players) {
      if (enemy === self || enemy.team === self.team || !enemy.alive) continue;
      const wasVisible = this.target === enemy && this.targetVisible;
      // La visión es compartida por equipo: el bot también explota lo que ve
      // cualquier aliado vivo. Su propio observador conserva el factor de
      // visión de la dificultad; los aliados usan su rango real.
      const visible = players.some((ally) => {
        if (!ally.alive || ally.team !== self.team) return false;
        const observer =
          ally === self
            ? {
                x: self.x,
                z: self.z,
                visionRange: self.visionRange * this.tuning.visionFactor
              }
            : ally;
        return isTargetVisible(
          observer,
          enemy,
          enemy.concealment.value,
          colliders,
          wasVisible
        );
      });
      if (!visible) continue;
      this.visibleEnemies.push(enemy);

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
      // visible, en vez de repartirse al azar por el mapa.
      if (focus.slot === enemy.slot) score -= 3.5;

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
      // La gracia de reaparición se pondera por el tiempo que le queda: si está
      // a punto de caducar, apenas merece la pena evitar a ese rival.
      const protection =
        enemy.invulnerableTimer > 0
          ? Math.min(
              1,
              enemy.invulnerableTimer / CONFIG.combat.invulnerabilitySeconds
            )
          : 1 - this.damageTakenFactor(enemy, null);
      if (protection > 0) score += protection * MITIGATED_TARGET_PENALTY;
      // Inmune a todo nuestro daño: mucho cuidado, solo se acepta si no hay
      // ningún otro rival visible.
      if (offense === 0) score += IMMUNE_TARGET_PENALTY;

      const pending = enemy.pendingCast;
      if (pending) {
        const remaining = pending.windup - pending.elapsed;
        const read = this.readPunish(enemy);
        if (remaining > 0 && read?.commit) {
          // Un rival preparando una habilidad es una ventana: si está clavado,
          // se convierte en el objetivo prioritario. La amenaza concreta se
          // resuelve aparte en `updateThreat`. La tirada de `readPunish` hace
          // que no todos los bots detecten o aprovechen cada windup.
          score -= this.tuning.punishBonus;
          if (!pending.def.moveWhileWindup) score -= 1.5;
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
      if (focus.slot === chosen.slot) {
        focus.until = this.clock + 2;
      } else {
        focus.slot = chosen.slot;
        focus.until = this.clock + 2;
      }
      this.visibleTimer += dt;
      this.lastSeen = { x: chosen.x, z: chosen.z, at: this.clock };
    } else if (
      this.lastSeen &&
      this.clock - this.lastSeen.at > this.tuning.memory
    ) {
      this.lastSeen = null;
    }
  }

  /**
   * Detecta el windup visible más urgente. Solo cuenta como amenaza si el bot
   * está dentro del área, cono o línea que va a golpear; si está fuera, el
   * rival queda como objetivo para castigarlo.
   */
  private updateThreat(self: MatchPlayerState): void {
    let best: IncomingThreat | null = null;
    for (const enemy of this.visibleEnemies) {
      const threat = this.threatFrom(self, enemy);
      if (threat && (!best || threat.severity > best.severity)) best = threat;
    }
    this.threat = best;
  }

  private threatFrom(self: MatchPlayerState, enemy: MatchPlayerState): IncomingThreat | null {
    const pending = enemy.pendingCast;
    if (!pending) return null;
    const remaining = pending.windup - pending.elapsed;
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
      const dx = self.x - pending.targetX;
      const dz = self.z - pending.targetZ;
      const fromCenter = Math.hypot(dx, dz);
      const dangerRadius = def.radius + selfRadius + 0.1;
      if (fromCenter > dangerRadius) return null;

      // Cuánto se tarda en salir del círculo; los bots difíciles reaccionan
      // antes y los fáciles esperan demasiado.
      const escapeTime =
        (dangerRadius - fromCenter) / Math.max(2.5, self.maxSpeed) + 0.08;
      if (remaining > Math.max(this.tuning.evadeWindow, escapeTime)) return null;

      let evadeX = dx;
      let evadeZ = dz;
      if (fromCenter < 0.15) {
        evadeX = -dirX;
        evadeZ = -dirZ;
      }
      const length = Math.hypot(evadeX, evadeZ) || 1;
      return {
        source: enemy,
        remaining,
        evade: { x: evadeX / length, z: evadeZ / length },
        severity: def.power + 20 + (1 - fromCenter / dangerRadius) * 30
      };
    }

    if (remaining > this.tuning.evadeWindow) return null;

    if (def.shape === 'melee') {
      const angle = Math.abs(
        normalizeAngle(Math.atan2(toSelfX, toSelfZ) - enemy.facing)
      );
      const reach = def.range + selfRadius + 0.2;
      if (distance > reach) return null;
      if (angle > def.halfAngle * DEG + 0.12) return null;

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

    if (def.shape === 'projectile' || def.shape === 'beam' || def.shape === 'dash') {
      // Un haz con `moveWhileWindup` deja mover al lanzador durante la carga y
      // `executeBeam` recalcula la dirección desde su posición actual hasta el
      // extremo fijado en `pendingCast`. La amenaza debe usar ese mismo vector:
      // con el `facing` actual se esquivaría un carril que ya no es el real.
      let aimX = dirX;
      let aimZ = dirZ;
      let reach = def.shape === 'dash' ? def.dashDistance : def.range;
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
      if (projection < 0 || projection > reach + 0.3) return null;

      const perpX = toSelfX - aimX * projection;
      const perpZ = toSelfZ - aimZ * projection;
      const perpendicular = Math.hypot(perpX, perpZ);
      const width = selfRadius + (def.shape === 'projectile' ? 0.5 : 0.25);
      if (perpendicular > width) return null;

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
      let delay = def.windup;
      for (let pass = 0; pass < 2; pass++) {
        const travel =
          def.shape === 'projectile'
            ? distance / Math.max(1, def.projectileSpeed)
            : 0;
        delay = def.windup + travel;
        const lead = delay * this.tuning.lead;
        aim = {
          x: source.x + source.vx * lead,
          z: source.z + source.vz * lead
        };
        distance = Math.hypot(aim.x - self.x, aim.z - self.z);
      }

      const reach =
        def.shape === 'melee'
          ? def.range + source.hitRadius
          : def.shape === 'dash'
            ? def.dashDistance + Math.max(0.5, def.radius) + source.hitRadius
            : def.range;
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

      // La precisión pondera el valor del corte: un golpe que falla no
      // cancela nada. El retardo manda, pero dentro del mismo frame vale más
      // la habilidad más fiable.
      const accuracy = def.accuracy > 0 ? def.accuracy / 100 : 1;
      const weightedPower = def.power * effectiveness * accuracy;
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
    players: readonly MatchPlayerState[]
  ): void {
    const target = this.target;
    const targetIsVisible = target !== null && this.targetVisible && target.alive;
    const distance = target ? Math.hypot(target.x - self.x, target.z - self.z) : Infinity;
    const hpFraction = self.hp / Math.max(1, self.maxHp);
    this.abilitySlot = null;
    this.supportCast = false;
    this.useCommon = false;

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
    const lowHp =
      hpFraction <
      (regenBot
        ? Math.max(this.tuning.retreatHp, REGEN_RETREAT_HP)
        : this.tuning.retreatHp);
    const atBase =
      Math.hypot(self.x - self.spawn.x, self.z - self.spawn.z) <=
      RETREAT_ARRIVE_DISTANCE;
    const hidden = self.enemiesSeeing === 0;
    // Regeneración solo funciona si ningún rival le ve. Un windup visible que
    // todavía puede alcanzarle también hace peligroso quedarse quieto.
    const regenSafe =
      hidden && nearestEnemy > REGEN_DANGER_RADIUS && this.threat === null;
    const canRecover =
      (regenBot && regenSafe) || this.findHealSlot(self) !== null;
    // Los objetos se conocen por posición desde el principio. Si el equipo ya
    // ve uno usado, `pickupTarget` lo descarta sin necesidad de ir hasta él.
    const pickup = hpFraction < PICKUP_SEEK_HP ? this.pickupTarget(self) : null;

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
      if (!(lowHp || badFight) || nearestEnemy > RETREAT_DANGER_RADIUS) {
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
        // Una huida eterna deja al equipo en inferioridad.
        this.stopRetreat(true);
      }
    }

    if (
      !this.recovering &&
      regenBot &&
      regenSafe &&
      self.pendingCast === null &&
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
      (lowHp || badFight) &&
      nearestEnemy <= RETREAT_DANGER_RADIUS &&
      this.clock >= this.retreatCooldownUntil &&
      !(atBase && !canRecover)
    ) {
      this.retreat = true;
      this.retreatUntil = this.clock + RETREAT_MAX_SECONDS;
    }

    // Huida: se planta a curarse si tiene una curación fiable lista y el rival
    // no está encima. Si no, corre hacia su base.
    if (this.retreat) {
      const healSlot = this.findHealSlot(self);
      if (healSlot !== null && distance > 3.2) this.abilitySlot = healSlot;
      this.useCommon = this.shouldUseCommon(self, distance, true, hpFraction);
      if (pickup) this.setGoal(pickup, pickup);
      else this.setGoal(self.spawn);
      return;
    }

    // Las áreas de apoyo (revivir o curar aliados) se pueden lanzar sin un
    // rival a la vista. Si hay una pelea útil, `chooseAbility` ya suma su valor
    // y decide si compensa; fuera de combate el apoyo manda sobre patrullar o
    // recoger un objeto.
    const supportSlot = this.chooseSupportAbility(self, players);
    if (supportSlot !== null && (!targetIsVisible || targetOffense === 0)) {
      this.abilitySlot = supportSlot;
      this.supportCast = true;
      return;
    }

    // Sin rival útil a la vista, un bot dañado prefiere acercarse a un objeto
    // conocido antes que perseguir una posición recordada o patrullar.
    if (pickup && (!targetIsVisible || targetOffense === 0)) {
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
      this.abilitySlot = this.chooseAbility(self, target, distance, players);
      this.supportCast =
        this.abilitySlot !== null && this.isSupportSlot(self, this.abilitySlot);
      this.useCommon = this.shouldUseCommon(self, distance, false, hpFraction);
      return;
    }

    if (this.lastSeen && this.clock - this.lastSeen.at <= this.tuning.memory) {
      this.setGoal({ x: this.lastSeen.x, z: this.lastSeen.z });
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
    const wantsPhysical = def !== null && def.category === 'physical';
    const wantsSpecial = def !== null && def.category === 'special';
    let defense = 1;
    for (const buff of target.buffs) {
      if (buff.stat !== 'defense' && buff.stat !== 'spDefense') continue;
      if (wantsPhysical && buff.stat !== 'defense') continue;
      if (wantsSpecial && buff.stat !== 'spDefense') continue;
      // Con una habilidad concreta solo cuenta la defensa que usa. Sin ella se
      // aplican ambas para no sobrevalorar a un rival con la defensa buffeada.
      defense *= buff.multiplier;
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
    const enemyBases = respawnsForTeam(otherTeam(self.team));
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

      if (score > bestScore) {
        bestScore = score;
        best = pickup;
      }
    }

    return best;
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
    const enemyBases = respawnsForTeam(otherTeam(self.team));
    const bases = [...ownBases, ...enemyBases];
    const ownBase = ownBases[0] ?? self.spawn;
    const enemyBase = enemyBases[0];

    let best: Vec2 | null = null;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < 40; attempt++) {
      const row = Math.floor(Math.random() * this.nav.rows);
      const col = Math.floor(Math.random() * this.nav.cols);
      if (!this.nav.isWalkable(row, col)) continue;

      const point = this.nav.cellCenter(row, col);
      const distanceFromSelf = Math.hypot(point.x - self.x, point.z - self.z);
      if (distanceFromSelf < SEARCH_MIN_DISTANCE) continue;

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

      if (score > bestScore) {
        bestScore = score;
        best = point;
      }
    }

    if (best) return best;

    // Sin candidatos válidos (mapa minúsculo o muy bloqueado): ir al centro
    // transitable en vez de volver a una base.
    const centerCell = this.nav.nearestWalkable(
      Math.floor(this.nav.rows / 2),
      Math.floor(this.nav.cols / 2)
    );
    return centerCell
      ? this.nav.cellCenter(centerCell.row, centerCell.col)
      : { ...self.spawn };
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
      const regenDirection = this.regenMove(self, colliders, dt);
      this.applyMovement(snapshot, self, regenDirection, REGEN_MOVE_SCALE);
      return snapshot;
    }
    const target = this.target;
    const targetIsVisible =
      target !== null && this.targetVisible && target.alive && this.engageTarget;
    const channeling = self.pendingCast !== null;
    // El destino solo guía el movimiento cuando no hay combate ni amenaza:
    // en esos casos el bot orbita al rival a propósito y no debe considerarse
    // un atasco.
    const steeringToGoal = this.threat === null && (this.retreat || !targetIsVisible);
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
      const aim = this.aimPoint(target, distance, def);
      const facingError = Math.abs(
        normalizeAngle(
          Math.atan2(aim.x - self.x, aim.z - self.z) - self.facing
        )
      );

      const inRange = def ? this.inRange(def, distance, target) : false;
      const ready =
        this.abilitySlot !== null &&
        self.cooldowns[this.abilitySlot] <= 0.001;
      const hasLine =
        !lineOfSightBlocked(self.x, self.z, target.x, target.z, colliders);
      if (
        !channeling &&
        this.abilitySlot !== null &&
        ready &&
        def &&
        inRange &&
        hasLine &&
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
          this.avoidCurrentPickupGoal();
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
      self.castLockTimer <= 0.001 &&
      // Las melee bloquean el casteo hasta que termina su clip.
      self.moveLockTimer <= 0.001 &&
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
    distance: number,
    players: readonly MatchPlayerState[]
  ): number | null {
    let bestSlot: number | null = null;
    let bestScore = -Infinity;

    for (let slot = 0; slot < 4; slot++) {
      if (self.cooldowns[slot] > 0.001) continue;
      const id = self.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (!def) continue;
      const support = this.supportScore(self, players, def);
      // Las áreas de apoyo se centran en el bot: no necesitan que haya un
      // rival dentro de su alcance para ser útiles.
      const inRange = this.inRange(def, distance, target);
      if (!inRange && support <= 0) continue;
      if (def.selfDamage > 0 && self.hp / Math.max(1, self.maxHp) < 0.52) {
        continue;
      }

      let score = inRange
        ? this.scoreAbility(self, target, def, slot, distance, support)
        : -Infinity;
      if (support > 0) {
        score = score === -Infinity ? support : score + support;
      }
      if (score > bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    }

    // Ninguna opción aporta lo suficiente: es mejor no gastar el cooldown y
    // seguir moviéndose que lanzar una cura o un buff inútil.
    return bestScore > MIN_ABILITY_SCORE ? bestSlot : null;
  }

  /**
   * Valor de un área de apoyo según los aliados a los que beneficia ahora
   * mismo. `Deseo` revive a los caídos y `Recuperación` reparte curación; el
   * filtro ofensivo de `scoreAbility` no puede valorar ninguna de las dos.
   */
  private supportScore(
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    def: AbilityDef
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
        if (!profile.revive || ally.respawnTimer <= 1) continue;
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
    players: readonly MatchPlayerState[]
  ): number | null {
    let bestSlot: number | null = null;
    let bestScore = 0;
    for (let slot = 0; slot < 4; slot++) {
      if (self.cooldowns[slot] > 0.001) continue;
      const id = self.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (!def) continue;
      const score = this.supportScore(self, players, def);
      if (score > bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    }
    return bestSlot;
  }

  private isSupportSlot(self: MatchPlayerState, slot: number): boolean {
    const id = self.abilityIds[slot];
    const def = id ? ABILITIES[id] : null;
    return def !== null && Object.hasOwn(SUPPORT_PROFILES, def.id);
  }

  private scoreAbility(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    slot: number,
    distance: number,
    support = 0
  ): number {
    const hpFraction = self.hp / Math.max(1, self.maxHp);
    const hasEffect =
      def.power > 0 ||
      def.healSelf > 0 ||
      def.slow !== null ||
      def.buffs.length > 0 ||
      def.shield ||
      def.shape === 'dash';
    if (!hasEffect) return -Infinity;

    // La efectividad multiplica el daño real, así que pesa directamente en la
    // puntuación. Una habilidad inmune no hace daño ni aplica control: nunca es
    // una buena elección contra ese objetivo.
    let effectiveness = 1;
    if (def.power > 0) {
      effectiveness = typeEffectiveness(def.type, target.types);
      if (effectiveness === 0) return -Infinity;
    } else if (def.slow !== null) {
      if (typeEffectiveness(def.type, target.types) === 0) return -Infinity;
    }
    let score = def.power * effectiveness;

    const offensive = def.power > 0 || def.slow !== null;
    if (offensive && target.invulnerableTimer > 0) {
      // Si la invulnerabilidad termina antes del impacto, el golpe sí cuenta.
      // Se estima el retardo con el windup y, en proyectiles, con el vuelo.
      const travel =
        def.shape === 'projectile' && def.projectileSpeed > 0
          ? distance / def.projectileSpeed
          : 0;
      if (target.invulnerableTimer > def.windup + travel) return -Infinity;
    }

    if (def.power > 0) {
      const mitigation = 1 - this.damageTakenFactor(target, def);
      if (mitigation > 0) {
        // El escudo reduce el daño esperado, así que las habilidades grandes
        // pierden más puntos. Una habilidad grande se descarta si la
        // mitigación es alta: su cooldown no compensa un golpe muy reducido.
        if (
          mitigation >= BIG_ABILITY_MITIGATION_THRESHOLD &&
          (slot === 3 || def.power >= BIG_ABILITY_POWER)
        ) {
          return -Infinity;
        }
        score -= def.power * effectiveness * mitigation;
      }
    }

    if (def.healSelf > 0) {
      score += 70 + (1 - hpFraction) * 130;
      // No gastar la curación a vida casi llena, salvo que también cure a
      // aliados heridos: entonces el lanzamiento sí aporta.
      if (hpFraction > 0.8 && support <= 0) score -= 220;
    }
    if (def.shield) score += 55 + (1 - hpFraction) * 70;
    if (def.buffs.length > 0) score += 35;
    if (def.slow) score += 22;

    switch (def.shape) {
      case 'melee':
        score += 12;
        break;
      case 'projectile':
      case 'beam':
        score += distance > 2.5 ? 16 : 0;
        break;
      case 'dash':
        score += 10;
        if (def.power === 0) score += 35; // reposicionamiento / huida
        break;
      case 'aoe': {
        const extra = this.countEnemiesNear(target.x, target.z, def.radius);
        score += 12 + Math.max(0, extra - 1) * 32;
        break;
      }
      case 'self':
        score += 28;
        break;
    }

    // Aprovechar el windup rival: las habilidades instantáneas pueden cancelar
    // su preparación; las que tardan más que el rival llegan tarde y además
    // dejan al bot plantado.
    const pending = target.pendingCast;
    if (pending) {
      const remaining = pending.windup - pending.elapsed;
      if (remaining > 0) {
        if (def.windup <= remaining) score += 18;
        else score -= 22;
        if (def.shape === 'melee' || def.shape === 'projectile' || def.shape === 'beam') {
          score += 10;
        }
        if (!pending.def.moveWhileWindup) score += 8;
      }
    }

    // La definitiva se guarda para cuando el objetivo ya está tocado o hay
    // varios rivales en el área; si no, se usa la rotación corta.
    const targetHp = target.hp / Math.max(1, target.maxHp);
    if (slot === 3 && targetHp > 0.65) score -= 14;
    if (slot === 0) score += 8;
    return score;
  }

  private countEnemiesNear(x: number, z: number, radius: number): number {
    let count = 0;
    // Solo enemigos visibles para el equipo: contar rivales ocultos dentro del
    // radio hacía que el bot sobrevalorase los AoE por información que no tenía.
    for (const enemy of this.visibleEnemies) {
      if (!enemy.alive) continue;
      if (Math.hypot(enemy.x - x, enemy.z - z) <= radius + enemy.hitRadius) {
        count++;
      }
    }
    return count;
  }

  private inRange(
    def: AbilityDef,
    distance: number,
    target: MatchPlayerState
  ): boolean {
    // El alcance real suma el hurtbox del objetivo: un Groudon (0,56 u) recibe
    // antes que un Voltorb (0,34 u). Un radio fijo hacía que el bot llegase
    // tarde contra los cuerpos grandes y pronto contra los pequeños.
    const targetRadius = target.hitRadius;
    switch (def.shape) {
      case 'melee':
        return distance <= def.range + targetRadius;
      case 'projectile':
        // El motor mide el impacto contra el hurtbox del objetivo, así que el
        // alcance útil también lo suma. Sin esto el bot se acercaba de más
        // contra los cuerpos grandes en vez de aprovechar el alcance real.
        return distance <= def.range + targetRadius;
      case 'beam':
        return distance <= def.range;
      case 'dash':
        // El barrido del dash alcanza `distancia + max(0.5, radio del dash) +
        // hurtbox del objetivo`; el 0,4 es solo el mínimo para no dashear pegado.
        return (
          distance >= 0.4 &&
          distance <=
            def.dashDistance + Math.max(0.5, def.radius) + targetRadius
        );
      case 'aoe':
        // El centro del área se fija a `range` por delante del lanzador.
        if (def.range <= 0.1) return distance <= def.radius + targetRadius;
        return Math.abs(distance - def.range) <= def.radius + targetRadius;
      case 'self':
        return distance <= Math.max(2.5, def.radius + 2) && distance <= 8;
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
    let preferred = this.preferredRange(self, def);

    // Cautela de tipos: contra un rival que nos pega súper eficaz se mantiene
    // algo más de distancia; contra uno al que somos inmunes, se acorta. El
    // ajuste nunca saca la distancia preferida del alcance de la habilidad.
    const caution = this.targetMatchupDefense;
    if (caution !== 1) {
      const reach =
        def === null
          ? Infinity
          : def.shape === 'dash'
            ? def.dashDistance + Math.max(0.5, def.radius)
            : def.shape === 'aoe'
              ? def.range + def.radius
              : def.range;
      const maxPreferred =
        def === null
          ? Infinity
          : Math.max(1, reach - target.hitRadius - 0.35);
      const adjust =
        caution === 0 ? -0.7 : Math.min(1.8, (caution - 1) * 0.7);
      preferred = clamp(preferred + adjust, 0.9, maxPreferred);
    }

    // Si hay una habilidad elegida pero aún no está encarado, avanzar hacia el
    // objetivo es la forma de girar: el juego deriva `facing` de la velocidad.
    if (def && facingError > this.tuning.aimTolerance) {
      return this.moveTowards(self, target, dt);
    }

    if (!def) {
      if (distance > preferred + 0.8) return this.moveTowards(self, target, dt);
      if (distance < preferred - 1.2) return directionTo(target, self);
      return this.orbit(target, self);
    }

    if (distance > preferred + 0.6) return this.moveTowards(self, target, dt);
    if (distance < preferred - 1.5) {
      // Alejarse del objetivo sin perderlo de vista: el movimiento de huida
      // cambia el rumbo, así que se alterna con el acercamiento al apuntar.
      return directionTo(target, self);
    }
    return this.orbit(target, self);
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
          return def.range > 0.1 ? def.range : Math.max(1, def.radius * 0.6);
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

  private aimPoint(
    target: MatchPlayerState,
    distance: number,
    def: AbilityDef | null
  ): Vec2 {
    const travel =
      def && def.shape === 'projectile' && def.projectileSpeed > 0
        ? distance / def.projectileSpeed
        : 0;
    const lead = travel * this.tuning.lead;
    return {
      x: target.x + target.vx * lead,
      z: target.z + target.vz * lead
    };
  }

  private moveTowards(
    self: MatchPlayerState,
    goal: Vec2,
    dt: number,
    colliders?: readonly Collider[]
  ): Vec2 {
    const distance = Math.hypot(goal.x - self.x, goal.z - self.z);
    if (distance < 0.12) return { x: 0, z: 0 };
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
        directPickup ||
        this.nav.lineClear(self.x, self.z, goal.x, goal.z)
      ) {
        this.path = [];
        this.pathTimer = 0;
        return directionTo(self, goal);
      }
      return this.followPath(self, goal, dt);
    }
    if (this.nav.lineClear(self.x, self.z, goal.x, goal.z)) {
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
      this.path = this.nav.findPath(self.x, self.z, goal.x, goal.z);
      this.pathGoal = { ...goal };
      this.pathTimer = 0;
    } else if (this.path.length === 0) {
      // Ruta vacía reciente: el destino es inalcanzable. Se avanza en línea
      // recta hasta el siguiente intento para no recalcular A* cada frame.
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
