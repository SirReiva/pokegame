/**
 * Movimiento táctico de los bots.
 *
 * Mantiene el estado de navegación (ruta, rastro, lado de órbita y cesión de
 * paso) y decide la dirección de avance. No conoce la toma de decisiones, el
 * combate ni la percepción: el controlador le entrega esos datos y las
 * operaciones que dependen de esas capas mediante `BotMovementContext`.
 */

import type { BotNavGrid, NavHazard, NavPoint } from '../botNav';
import { segmentBlockedByColliders } from '../combat';
import type { MatchPlayerState } from '../matchState';
import type { Collider } from '../world';
import { directionTo, type Vec2 } from './math';
import type { BotTuning } from './tuning';

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
/** Distancia que se retrocede por el rastro para salir de un bloqueo. */
const BACK_OFF_DISTANCE = 1.6;

/** Estado de navegación que comparte con el controlador. */
export interface BotMovementState {
  path: NavPoint[];
  pathGoal: Vec2;
  pathTimer: number;
  orbitSide: number;
  detourSide: number;
  trail: Vec2[];
  yieldSource: MatchPlayerState | null;
  yieldUntil: number;
}

/**
 * Datos y operaciones del controlador que necesita el movimiento.
 *
 * Solo incluye lo que usan estos métodos; la decisión, el combate y la
 * percepción siguen viviendo en `BotController`.
 */
export interface BotMovementContext {
  readonly nav: BotNavGrid;
  readonly tuning: BotTuning;
  readonly slot: number;
  /** Destino actual de las decisiones (patrulla, poción, retirada...). */
  currentGoal(): Vec2;
  /** Poción que ocupa el destino, o `null` si el destino no es una poción. */
  currentPickupGoal(): Vec2 | null;
  /** El destino ya no es una poción (ruta inalcanzable durante una huida). */
  clearPickupGoal(): void;
  isRetreating(): boolean;
  isRecovering(): boolean;
  isTargetVisible(): boolean;
  now(): number;
  hazardPathBlocked(self: MatchPlayerState, point: Vec2): boolean;
  navHazards(self: MatchPlayerState): NavHazard[] | undefined;
  avoidCurrentPickupGoal(self: MatchPlayerState): void;
  abandonGoal(self: MatchPlayerState): void;
  isAllyStill(other: MatchPlayerState): boolean;
}

export class BotMovement implements BotMovementState {
  path: NavPoint[] = [];
  pathGoal: Vec2 = { x: 0, z: 0 };
  pathTimer = 0;
  orbitSide: number;
  detourSide = 1;
  readonly trail: Vec2[] = [];
  yieldSource: MatchPlayerState | null = null;
  yieldUntil = 0;

  private readonly ctx: BotMovementContext;

  constructor(context: BotMovementContext) {
    this.ctx = context;
    this.orbitSide = context.slot % 2 === 0 ? 1 : -1;
  }

  moveTowards(
    self: MatchPlayerState,
    goal: Vec2,
    dt: number,
    colliders?: readonly Collider[]
  ): Vec2 {
    const distance = Math.hypot(goal.x - self.x, goal.z - self.z);
    if (distance < 0.12) return { x: 0, z: 0 };
    // Si el atajo cruza un área persistente, se usa A* con coste de peligro
    // aunque la línea esté despejada.
    const directBlockedByHazard = this.ctx.hazardPathBlocked(self, goal);
    if (distance < 1.6) {
      // El último tramo hacia una poción se hace en línea recta si los
      // colliders reales lo permiten. La rejilla de navegación infla los
      // obstáculos con el radio del cuerpo y puede marcar como bloqueada la
      // celda del objeto aunque se alcance a pie; A* entonces nunca cierra la
      // distancia y el bot se queda empujando al lado hasta descartarlo.
      const pickupGoal = this.ctx.currentPickupGoal();
      const directPickup =
        pickupGoal !== null &&
        goal.x === pickupGoal.x &&
        goal.z === pickupGoal.z &&
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
          this.ctx.nav.lineClear(
            self.x,
            self.z,
            goal.x,
            goal.z,
            undefined,
            self.team
          ))
      ) {
        this.path = [];
        this.pathTimer = 0;
        return directionTo(self, goal);
      }
      return this.followPath(self, goal, dt);
    }
    if (
      !directBlockedByHazard &&
      this.ctx.nav.lineClear(
        self.x,
        self.z,
        goal.x,
        goal.z,
        undefined,
        self.team
      )
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
    if (goalMoved > 1.2 || this.pathTimer > this.ctx.tuning.pathInterval) {
      const result = this.ctx.nav.findPath(self.x, self.z, goal.x, goal.z, {
        types: self.types,
        preferConcealment: this.ctx.isRetreating() || this.ctx.isRecovering(),
        hazards: this.ctx.navHazards(self),
        team: self.team
      });
      this.path = result.points;
      this.pathGoal = { ...goal };
      this.pathTimer = 0;
      if (result.status === 'unreachable') {
        if (this.ctx.isRetreating()) {
          // En plena huida no se cambia a patrulla: si el destino era una
          // poción inalcanzable, se descarta, y se sigue la ruta parcial.
          if (this.ctx.currentPickupGoal() !== null) {
            this.ctx.avoidCurrentPickupGoal(self);
            this.ctx.clearPickupGoal();
          }
        } else {
          // Destino inalcanzable: se descarta la poción si era el objetivo, se
          // libera su reclamación y se vuelve a patrullar en vez de empujar
          // contra la pared hasta el siguiente recálculo.
          this.ctx.abandonGoal(self);
          return directionTo(self, this.ctx.currentGoal());
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
  addSeparation(
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
      const still = this.ctx.isAllyStill(other);
      const otherSpeed = Math.hypot(other.vx, other.vz);
      const approaching =
        !still &&
        otherSpeed > 0.2 &&
        (other.vx * dirX + other.vz * dirZ) / otherSpeed < -0.35;
      if (
        !this.ctx.isTargetVisible() &&
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
      this.yieldUntil = this.ctx.now() + ALLY_YIELD_HOLD;
    }

    const active = this.yieldSource;
    if (
      active &&
      active.alive &&
      !this.ctx.isAllyStill(active) &&
      this.ctx.now() < this.yieldUntil
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
  pickDetour(self: MatchPlayerState, desired: Vec2): Vec2 {
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
  allySideStep(
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
    return this.ctx.nav.lineClear(
      self.x,
      self.z,
      self.x + dx * 1.4,
      self.z + dz * 1.4,
      undefined,
      self.team
    );
  }

  /**
   * Punto del rastro reciente a unos 1,6 unidades por detrás. Retroceder por
   * el camino ya recorrido es la salida más fiable cuando dos aliados se
   * encuentran de frente en un paso estrecho.
   */
  trailBackOff(self: MatchPlayerState): Vec2 {
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
    const away = directionTo(this.ctx.currentGoal(), { x: self.x, z: self.z });
    return {
      x: self.x + away.x * BACK_OFF_DISTANCE,
      z: self.z + away.z * BACK_OFF_DISTANCE
    };
  }
}
