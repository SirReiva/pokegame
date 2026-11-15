/**
 * Cadencia de la visibilidad de actores.
 *
 * La línea de visión es O(observadores × objetivos) y se ejecutaba en cada paso
 * fijo de 60 Hz. Mientras los actores se mueven basta con 20 Hz: la foto
 * anterior sigue siendo válida entre medias y la histéresis ya toleraba ese
 * retardo. En cambio, hay cambios que no pueden esperar al siguiente turno
 * (daño recibido, ocultación, casteo, muerte, respawn o cambio de equipo): esos
 * fuerzan un cálculo inmediato en el mismo paso.
 *
 * La clase es pura (no conoce PlayCanvas ni el render) para poder medirla y
 * probarla en Node.
 */

import type { Team } from '../core/team';
import type { MatchPlayerState } from '../matchState';

interface ActorVisibilityState {
  x: number;
  z: number;
  alive: boolean;
  hidden: boolean;
  team: Team;
  damageTaken: number;
  /** `true` mientras el cadáver todavía debe verse. */
  corpseVisible: boolean;
  /** `true` mientras hay un casteo en curso (puede ocultar al lanzador). */
  casting: boolean;
  visionRange: number;
  visionFactor: number;
  concealment: number;
}

function sameVisibilityState(
  previous: ActorVisibilityState,
  player: MatchPlayerState
): boolean {
  return (
    previous.alive === player.alive &&
    previous.hidden === player.hidden &&
    previous.team === player.team &&
    previous.damageTaken === player.damageTaken &&
    previous.corpseVisible === (!player.alive && player.deathFade > 0) &&
    previous.casting === (player.activeCast !== null) &&
    previous.visionRange === player.visionRange &&
    previous.visionFactor === player.visionFactor &&
    previous.concealment === player.concealment.value
  );
}

function storeVisibilityState(
  target: ActorVisibilityState,
  player: MatchPlayerState
): void {
  target.x = player.x;
  target.z = player.z;
  target.alive = player.alive;
  target.hidden = player.hidden;
  target.team = player.team;
  target.damageTaken = player.damageTaken;
  target.corpseVisible = !player.alive && player.deathFade > 0;
  target.casting = player.activeCast !== null;
  target.visionRange = player.visionRange;
  target.visionFactor = player.visionFactor;
  target.concealment = player.concealment.value;
}

export class VisibilityCadence {
  private readonly previous = new Map<number, ActorVisibilityState>();
  private atmosphereVision = Number.NaN;
  private lastComputedStep = -1;
  private forced = true;
  /** Pasos fijos entre cálculos ordinarios por movimiento (3 = 20 Hz). */
  private readonly intervalSteps: number;
  /** Movimiento mínimo (u) para considerar que un actor se movió. */
  private readonly moveEpsilon: number;

  constructor(intervalSteps: number, moveEpsilon: number) {
    this.intervalSteps = intervalSteps;
    this.moveEpsilon = moveEpsilon;
  }

  /** Fuerza el próximo cálculo (nueva partida, cambio de mapa...). */
  reset(): void {
    this.previous.clear();
    this.atmosphereVision = Number.NaN;
    this.lastComputedStep = -1;
    this.forced = true;
  }

  /**
   * ¿Hay que recalcular la visibilidad en este paso? Devuelve `true` si cambió
   * algo que debe verse al instante o si toca por intervalo y algún actor se
   * movió desde la última foto.
   */
  shouldRefresh(
    players: readonly MatchPlayerState[],
    step: number,
    atmosphereVision: number
  ): boolean {
    if (this.forced) return true;
    // La partida se reinició: el contador de pasos vuelve atrás.
    if (step < this.lastComputedStep) return true;
    if (atmosphereVision !== this.atmosphereVision) return true;
    if (this.previous.size !== players.length) return true;

    const epsilonSq = this.moveEpsilon * this.moveEpsilon;
    let moved = false;
    for (const player of players) {
      const previous = this.previous.get(player.slot);
      if (!previous) return true;
      if (!sameVisibilityState(previous, player)) return true;
      if (!moved) {
        const dx = player.x - previous.x;
        const dz = player.z - previous.z;
        moved = dx * dx + dz * dz > epsilonSq;
      }
    }
    if (!moved) return false;
    return step - this.lastComputedStep >= this.intervalSteps;
  }

  /** Guarda la foto con la que se acaba de calcular la visibilidad. */
  markComputed(
    players: readonly MatchPlayerState[],
    step: number,
    atmosphereVision: number
  ): void {
    const seen = new Set<number>();
    for (const player of players) {
      seen.add(player.slot);
      const previous = this.previous.get(player.slot);
      if (!previous) {
        const created: ActorVisibilityState = {
          x: 0,
          z: 0,
          alive: true,
          hidden: false,
          team: player.team,
          damageTaken: 0,
          corpseVisible: false,
          casting: false,
          visionRange: 0,
          visionFactor: 1,
          concealment: 0
        };
        storeVisibilityState(created, player);
        this.previous.set(player.slot, created);
        continue;
      }
      storeVisibilityState(previous, player);
    }
    for (const slot of this.previous.keys()) {
      if (!seen.has(slot)) this.previous.delete(slot);
    }
    this.atmosphereVision = atmosphereVision;
    this.lastComputedStep = step;
    this.forced = false;
  }
}
