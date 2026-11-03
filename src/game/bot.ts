/**
 * Controlador de un jugador bot.
 *
 * El bot no mueve actores directamente: produce el mismo `DeviceInputSnapshot`
 * que un mando o el teclado. Así pasa por `stepPlayer`, comparte cooldowns,
 * colisiones, tiempos de casteo y reglas de combate con los humanos.
 *
 * La IA se divide en cuatro capas:
 * 1. Percepción: visión, ocultación, línea de visión y memoria de la última
 *    posición conocida.
 * 2. Navegación: A* sobre `BotNavGrid` y seguimiento de waypoints.
 * 3. Combate: elección de objetivo y de habilidad por rango, cooldown y estado.
 * 4. Movimiento: mantiene la distancia, se acerca para apuntar y se separa de
 *    sus aliados.
 *
 * El apuntado es fiel al juego: `facing` solo cambia al moverse, así que el bot
 * gira hacia el objetivo avanzando en esa dirección antes de lanzar.
 */

import { ABILITIES, type AbilityDef } from './abilities';
import { BotNavGrid, type NavPoint } from './botNav';
import { DEG } from './config';
import { IDLE_INPUT, type DeviceInputSnapshot } from './input';
import type { MatchPlayerState } from './matchState';
import { otherTeam, type BotDifficulty } from './multiplayer';
import { respawnsForTeam } from './terrain';
import { isTargetVisible, lineOfSightBlocked } from './vision';
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

/** Radio en el que un rival cercano justifica huir con poca vida. */
const RETREAT_DANGER_RADIUS = 9;
/** Tiempo máximo de una huida antes de volver a la acción. */
const RETREAT_MAX_SECONDS = 6;
/** Distancia al punto de aparición que cuenta como "ya en la base". */
const RETREAT_ARRIVE_DISTANCE = 2.5;
/** Espera antes de poder volver a huir tras llegar a la base sin curación. */
const RETREAT_COOLDOWN_SECONDS = 4;

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
  private visibleTimer = 0;
  private visibleEnemies: MatchPlayerState[] = [];
  private threat: IncomingThreat | null = null;
  private lastSeen: { x: number; z: number; at: number } | null = null;
  /** Lecturas por rival de su windup actual, para no volver a tirar cada frame. */
  private punishReads = new Map<number, PunishRead>();

  private decisionTimer = 0;
  private abilitySlot: number | null = null;
  private useCommon = false;
  private retreat = false;
  /** Momento en el que una huida larga se da por terminada. */
  private retreatUntil = 0;
  /** Tras una huida infructuosa, espera antes de volver a intentarlo. */
  private retreatCooldownUntil = 0;
  private goal: Vec2 = { x: 0, z: 0 };

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

  constructor(
    slot: number,
    difficulty: BotDifficulty,
    nav: BotNavGrid,
    squad: BotSquad
  ) {
    this.slot = slot;
    this.difficulty = difficulty;
    this.tuning = TUNING[difficulty];
    this.nav = nav;
    this.squad = squad;
    this.orbitSide = slot % 2 === 0 ? 1 : -1;
  }

  update(
    dt: number,
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    colliders: readonly Collider[]
  ): DeviceInputSnapshot {
    this.clock += dt;
    if (!self.alive) {
      this.resetCombatState();
      return { ...IDLE_INPUT };
    }

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

  private resetCombatState(): void {
    this.target = null;
    this.targetVisible = false;
    this.visibleTimer = 0;
    this.visibleEnemies = [];
    this.threat = null;
    this.lastSeen = null;
    this.punishReads.clear();
    this.abilitySlot = null;
    this.useCommon = false;
    this.retreat = false;
    this.retreatUntil = 0;
    this.retreatCooldownUntil = 0;
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

  private updateTarget(
    dt: number,
    self: MatchPlayerState,
    players: readonly MatchPlayerState[],
    colliders: readonly Collider[]
  ): void {
    let best: MatchPlayerState | null = null;
    let bestScore = Infinity;
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
      // Los remates valen más que perseguir al tanque lleno. El pequeño sesgo
      // por distancia evita que dos bots crucen el mapa por el mismo herido.
      let score = distance + hpFraction * 7 - (1 - hpFraction) * 4;
      if (this.target === enemy) score -= 1.5;
      // Foco de equipo: varios bots eligen al mismo objetivo mientras siga
      // visible, en vez de repartirse al azar por el mapa.
      if (focus.slot === enemy.slot) score -= 3.5;

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

      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }

    if (best !== this.target) {
      this.visibleTimer = 0;
      this.abilitySlot = null;
    }
    this.target = best;
    this.targetVisible = best !== null;

    if (best) {
      if (focus.slot === best.slot) {
        focus.until = this.clock + 2;
      } else {
        focus.slot = best.slot;
        focus.until = this.clock + 2;
      }
      this.visibleTimer += dt;
      this.lastSeen = { x: best.x, z: best.z, at: this.clock };
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
      const reach =
        def.shape === 'dash' ? def.dashDistance : def.range;
      const projection = toSelfX * dirX + toSelfZ * dirZ;
      if (projection < 0 || projection > reach + 0.3) return null;

      const perpX = toSelfX - dirX * projection;
      const perpZ = toSelfZ - dirZ * projection;
      const perpendicular = Math.hypot(perpX, perpZ);
      const width = selfRadius + (def.shape === 'projectile' ? 0.5 : 0.25);
      if (perpendicular > width) return null;

      let evadeX = perpX;
      let evadeZ = perpZ;
      if (perpendicular < 0.05) {
        evadeX = -dirZ * this.orbitSide;
        evadeZ = dirX * this.orbitSide;
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
    remaining: number
  ): number | null {
    if (!this.canCast(self)) return null;
    const distance = Math.hypot(source.x - self.x, source.z - self.z);
    let bestSlot: number | null = null;
    let bestDelay = Infinity;
    let bestPower = -Infinity;

    for (let slot = 0; slot < 4; slot++) {
      if (self.cooldowns[slot] > 0.001) continue;
      const id = self.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (!def) continue;
      if (def.shape === 'aoe' || def.shape === 'self') continue;
      if (def.shape === 'dash' && def.power <= 0) continue;

      const reach =
        def.shape === 'melee'
          ? def.range + 0.35
          : def.shape === 'dash'
            ? def.dashDistance
            : def.range;
      if (distance > reach) continue;

      const travel =
        def.shape === 'projectile'
          ? distance / Math.max(1, def.projectileSpeed)
          : 0;
      const delay = def.windup + travel;
      if (delay > remaining + 0.03) continue;

      if (delay < bestDelay || (delay === bestDelay && def.power > bestPower)) {
        bestSlot = slot;
        bestDelay = delay;
        bestPower = def.power;
      }
    }

    return bestSlot;
  }

  private decide(self: MatchPlayerState, players: readonly MatchPlayerState[]): void {
    const target = this.target;
    const targetIsVisible = target !== null && this.targetVisible && target.alive;
    const distance = target ? Math.hypot(target.x - self.x, target.z - self.z) : Infinity;
    const hpFraction = self.hp / Math.max(1, self.maxHp);

    this.abilitySlot = null;
    this.useCommon = false;

    // La visión es compartida: un rival al otro lado del mapa visto por un
    // aliado no debe mantener al bot huyendo. Solo cuenta una amenaza cercana.
    const nearestEnemy = this.nearestVisibleEnemyDistance(self);
    const lowHp = hpFraction < this.tuning.retreatHp;
    const atBase =
      Math.hypot(self.x - self.spawn.x, self.z - self.spawn.z) <=
      RETREAT_ARRIVE_DISTANCE;
    const canRecover =
      self.commonAbilityId === 'regeneracion' || this.findHealSlot(self) !== null;

    if (this.retreat) {
      if (!lowHp || nearestEnemy > RETREAT_DANGER_RADIUS) {
        // El peligro ya pasó: vuelve a la acción sin esperar.
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
      !this.retreat &&
      lowHp &&
      nearestEnemy <= RETREAT_DANGER_RADIUS &&
      this.clock >= this.retreatCooldownUntil &&
      !(atBase && !canRecover)
    ) {
      this.retreat = true;
      this.retreatUntil = this.clock + RETREAT_MAX_SECONDS;
    }

    // Huida: se planta a curarse si tiene una habilidad de curación lista y el
    // rival no está encima. Si no, corre hacia su base.
    if (this.retreat) {
      const healSlot = this.findHealSlot(self);
      if (healSlot !== null && distance > 3.2) this.abilitySlot = healSlot;
      this.useCommon = this.shouldUseCommon(self, distance, true, hpFraction);
      this.setGoal(self.spawn);
      return;
    }

    if (targetIsVisible && this.visibleTimer >= this.tuning.reaction) {
      this.abilitySlot = this.chooseAbility(self, target, distance, players);
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

  private setGoal(goal: Vec2): void {
    if (Math.hypot(goal.x - this.goal.x, goal.z - this.goal.z) > 1.2) {
      this.path = [];
      this.pathTimer = 0;
    }
    this.goal = goal;
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
    const target = this.target;
    const targetIsVisible = target !== null && this.targetVisible && target.alive;
    const channeling = self.pendingCast !== null;
    let desired: Vec2 = { x: 0, z: 0 };
    let casting = false;

    if (this.threat) {
      const threat = this.threat;
      const read = this.readPunish(threat.source);
      const interrupt =
        channeling || !read || !read.commit || this.clock < read.readyAt
          ? null
          : this.findInterruptSlot(
              self,
              threat.source,
              Math.max(0.02, threat.remaining + read.remainingError)
            );
      if (interrupt !== null) {
        // Interrumpir el windup rival es la mejor jugada: un golpe cancela la
        // habilidad y evita el daño. Se prioriza sobre la huida.
        const aim = { x: threat.source.x, z: threat.source.z };
        const error = Math.abs(
          normalizeAngle(Math.atan2(aim.x - self.x, aim.z - self.z) - self.facing)
        );
        this.abilitySlot = interrupt;
        if (error <= this.tuning.aimTolerance && this.canCast(self)) {
          casting = this.pulseAbility(snapshot, interrupt);
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
      desired = this.moveTowards(self, this.goal, dt);
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
    } else if (targetIsVisible && target) {
      const distance = Math.hypot(target.x - self.x, target.z - self.z);
      const def = this.selectedDef(self);
      const aim = this.aimPoint(target, distance, def);
      const facingError = Math.abs(
        normalizeAngle(
          Math.atan2(aim.x - self.x, aim.z - self.z) - self.facing
        )
      );

      const inRange = def ? this.inRange(def, distance) : false;
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
      desired = this.moveTowards(self, this.goal, dt);
      if (!channeling && this.useCommon) this.pulseCommon(snapshot, self, true);
    }

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
    direction: Vec2
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
    snapshot.moveX = clamp(dx * rightX + dz * rightZ, -1, 1);
    snapshot.moveY = clamp(dx * forwardX + dz * forwardZ, -1, 1);
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

  private findHealSlot(self: MatchPlayerState): number | null {
    for (let slot = 0; slot < 4; slot++) {
      if (self.cooldowns[slot] > 0.001) continue;
      const id = self.abilityIds[slot];
      const def = id ? ABILITIES[id] : null;
      if (def && def.healSelf > 0) return slot;
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
      if (!this.inRange(def, distance)) continue;
      if (def.selfDamage > 0 && self.hp / Math.max(1, self.maxHp) < 0.52) {
        continue;
      }

      const score = this.scoreAbility(self, target, def, slot, distance, players);
      if (score > bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    }

    return bestSlot;
  }

  private scoreAbility(
    self: MatchPlayerState,
    target: MatchPlayerState,
    def: AbilityDef,
    slot: number,
    distance: number,
    players: readonly MatchPlayerState[]
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

    let score = def.power;

    if (def.healSelf > 0) {
      score += 70 + (1 - hpFraction) * 130;
      // No gastar la curación a vida casi llena.
      if (hpFraction > 0.8) score -= 220;
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
        const extra = this.countEnemiesNear(
          players,
          self.team,
          target.x,
          target.z,
          def.radius
        );
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

  private countEnemiesNear(
    players: readonly MatchPlayerState[],
    team: MatchPlayerState['team'],
    x: number,
    z: number,
    radius: number
  ): number {
    let count = 0;
    for (const player of players) {
      if (!player.alive || player.team === team) continue;
      if (Math.hypot(player.x - x, player.z - z) <= radius + player.hitRadius) {
        count++;
      }
    }
    return count;
  }

  private inRange(def: AbilityDef, distance: number): boolean {
    switch (def.shape) {
      case 'melee':
        return distance <= def.range + 0.35;
      case 'projectile':
      case 'beam':
        return distance <= def.range;
      case 'dash':
        return distance >= 0.4 && distance <= def.dashDistance + 0.4;
      case 'aoe':
        // El centro del área se fija a `range` por delante del lanzador.
        if (def.range <= 0.1) return distance <= def.radius + 0.35;
        return Math.abs(distance - def.range) <= def.radius + 0.4;
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
    const preferred = this.preferredRange(self, def);

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

  private moveTowards(self: MatchPlayerState, goal: Vec2, dt: number): Vec2 {
    const distance = Math.hypot(goal.x - self.x, goal.z - self.z);
    if (distance < 0.12) return { x: 0, z: 0 };
    // A corta distancia el steering local basta: el objetivo puede estar en
    // una celda marcada como bloqueada por un árbol cercano y A* nunca llegaría
    // a él. `resolvePosition` sigue impidiendo atravesar el collider real.
    if (distance < 1.6) return directionTo(self, goal);
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
      // en diagonal para abrirle el paso en vez de empujarse mutuamente.
      const otherSpeed = Math.hypot(other.vx, other.vz);
      const approaching =
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
    if (active && active.alive && this.clock < this.yieldUntil) {
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
