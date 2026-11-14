/**
 * Sistemas de áreas persistentes.
 *
 * Mantiene el ciclo de vida de las áreas `overTime` y de los `onEnd` diferidos
 * de las áreas instantáneas. El host aporta el estado y las acciones de combate.
 */

import type { AoeHitInput } from '../aoeEffect';
import type { AbilityDef } from '../abilities';
import type { ActiveAoe, MatchPlayerState } from '../matchState';

/** `onEnd` de un área instantánea que espera a terminar su duración visual. */
export interface PendingAoeEnd {
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

export interface AoeSystemHost {
  readonly activeAoes: ActiveAoe[];
  readonly pendingAoeEnds: PendingAoeEnd[];
  isMatchOver(): boolean;
  resolveAoeHit(hit: AoeHitInput<MatchPlayerState, AbilityDef>): void;
  emitAoeEvent(
    phase: 'start' | 'cast' | 'end',
    player: MatchPlayerState,
    def: AbilityDef,
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    elapsed: number
  ): void;
}

/** Avanza las áreas persistentes y golpea en cada tick. */
export function stepActiveAoes(host: AoeSystemHost, dt: number): void {
  // Si un tick de un área cierra la partida, las áreas restantes no siguen
  // repartiendo daño hasta el siguiente frame (que ya no se simula).
  if (host.isMatchOver()) return;
  // Orden de creación, como los proyectiles: el área más antigua hace su tick
  // antes y, si dos ticks son letales en el mismo frame, el KO no cambia según
  // cuál se creó después. Se recorre una copia porque las áreas terminadas se
  // retiran durante el recorrido.
  for (const aoe of host.activeAoes.slice()) {
    // Otra área del mismo frame pudo cortar la canalización que creó esta: si
    // ya se retiró, no debe seguir haciendo ticks.
    if (!host.activeAoes.includes(aoe)) continue;
    aoe.elapsed += dt;
    // Las áreas móviles recalculan su centro antes del tick para que el daño de
    // este frame y el aro visual se resuelvan en la misma posición. En el frame
    // en que el área caduca ya no se mueve: su efecto visual puede haberse
    // retirado antes.
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
      tickAoe(host, aoe);
      aoe.tickTimer += aoe.tickInterval;
    }
    if (aoe.elapsed >= aoe.duration) {
      host.emitAoeEvent(
        'end',
        aoe.owner,
        aoe.def,
        aoe.x,
        aoe.z,
        aoe.dirX,
        aoe.dirZ,
        aoe.elapsed
      );
      const index = host.activeAoes.indexOf(aoe);
      if (index >= 0) host.activeAoes.splice(index, 1);
      if (host.isMatchOver()) return;
    }
  }
}

/** Dispara los `onEnd` de áreas instantáneas al agotar su duración visual. */
export function stepPendingAoeEnds(host: AoeSystemHost, dt: number): void {
  if (host.pendingAoeEnds.length === 0) return;
  for (let index = host.pendingAoeEnds.length - 1; index >= 0; index--) {
    const pending = host.pendingAoeEnds[index];
    pending.remaining -= dt;
    pending.elapsed += dt;
    if (pending.remaining > 0) continue;
    host.pendingAoeEnds.splice(index, 1);
    host.emitAoeEvent(
      'end',
      pending.caster,
      pending.def,
      pending.x,
      pending.z,
      pending.dirX,
      pending.dirZ,
      pending.elapsed
    );
    if (host.isMatchOver()) return;
  }
}

function tickAoe(host: AoeSystemHost, aoe: ActiveAoe): void {
  const basePower = aoe.def.power * aoe.tickInterval;
  // `flatBonusApplied` viaja con el tick para que `applyAbilityDamage` cobre el
  // `+2` de la fórmula una sola vez por objetivo y lanzamiento. El callback de
  // la habilidad decide qué se aplica en cada tick. El efecto por defecto
  // conserva el comportamiento histórico: si no hay daño ni slow, el tick no
  // hace nada, pero un callback propio puede seguir repartiendo buffs o debuffs.
  const hit: AoeHitInput<MatchPlayerState, AbilityDef> = {
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
  };
  host.resolveAoeHit(hit);
  aoe.tick += 1;
}
