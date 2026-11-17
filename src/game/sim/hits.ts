/**
 * Resolución diferida de golpes.
 *
 * Los dash y la melee detectan impactos durante el movimiento, pero el daño se
 * aplica al final del paso para que el orden de `matchPlayers` no decida quién
 * gana un intercambio. Este módulo conserva esa regla y el choque mutuo.
 */

import type { CombatFxPort } from '../core/ports/fx';
import { CONFIG, DEG } from '../config';
import type {
  MatchPlayerState,
  PendingInstantHit,
  PendingMeleeHit
} from '../matchState';
import { attackYaw } from '../matchState';
import { maxHitRadius } from '../roster';
import {
  sectorOverlapsCircle,
  segmentBlockedByColliders
} from '../combat';
import type { World } from '../world';
import type { AbilityDamageOptions } from '../abilityExecutors';

export interface HitSystemHost {
  /** Devuelve los golpes pendientes y deja la cola vacía. */
  takeInstantHits(): PendingInstantHit[];
  /** Devuelve los golpes pendientes y deja la cola vacía. */
  takeMeleeHits(): PendingMeleeHit[];
  readonly world: World;
  readonly combatFx: CombatFxPort;
  isMatchOver(): boolean;
  canHit(attacker: MatchPlayerState, target: MatchPlayerState): boolean;
  dashSweepHits(
    target: MatchPlayerState,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    dirX: number,
    dirZ: number,
    reach: number
  ): boolean;
  applyAbilityDamage(
    attacker: MatchPlayerState,
    target: MatchPlayerState,
    def: PendingMeleeHit['def'],
    options?: AbilityDamageOptions
  ): boolean;
  applyKnockback(
    target: MatchPlayerState,
    fromX: number,
    fromZ: number,
    distance: number
  ): void;
  cancelCast(player: MatchPlayerState): void;
}

/**
 * Aplica los golpes de dash del frame. La detección ya ocurrió durante el
 * movimiento, pero el objetivo pudo moverse después o quedar tras un obstáculo:
 * se revalida el tramo guardado antes de aplicar el daño.
 */
export function stepInstantHits(host: HitSystemHost): void {
  const hits = host.takeInstantHits();
  if (hits.length === 0) return;
  // Los golpes se aplican en orden de lanzamiento. Si varios son letales en el
  // mismo frame, el KO se atribuye al primero.
  for (const hit of hits) {
    if (host.isMatchOver()) break;
    if (!host.canHit(hit.attacker, hit.target)) continue;
    if (
      !host.dashSweepHits(
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
    // la posición final del lanzador.
    host.applyAbilityDamage(hit.attacker, hit.target, hit.def, {
      healToken: hit.healToken,
      sourceX: hit.target.x - hit.dirX,
      sourceZ: hit.target.z - hit.dirZ
    });
  }
}

function meleePairKey(a: MatchPlayerState, b: MatchPlayerState): string {
  return a.slot < b.slot ? `${a.slot}-${b.slot}` : `${b.slot}-${a.slot}`;
}

/**
 * Un golpe melee pendiente sigue siendo válido si el atacante vive, el objetivo
 * se puede golpear, ambos siguen dentro del rango y del cono y no hay ningún
 * obstáculo entre ellos.
 */
function meleeHitValid(host: HitSystemHost, hit: PendingMeleeHit): boolean {
  const { attacker, target, def } = hit;
  if (!attacker.alive || !host.canHit(attacker, target)) return false;
  if (
    !sectorOverlapsCircle(
      attacker.x,
      attacker.z,
      attackYaw(attacker),
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
    host.world.colliders,
    CONFIG.combat.meleeSightPadding
  );
}

/**
 * Resuelve los golpes melee del frame. Si dos rivales se golpean mutuamente,
 * se produce un choque: ninguno recibe daño, ambos reciben un stun corto y
 * retroceden.
 */
export function stepMeleeHits(host: HitSystemHost): void {
  if (host.isMatchOver()) {
    host.takeMeleeHits();
    return;
  }
  const hits = host.takeMeleeHits();
  if (hits.length === 0) return;
  // Solo los golpes que siguen siendo válidos pueden emparejarse en un choque.
  const validHits = hits.filter((hit) => meleeHitValid(host, hit));
  const clashPairs = new Set<string>();

  for (const hit of validHits) {
    const key = meleePairKey(hit.attacker, hit.target);
    if (clashPairs.has(key)) continue;
    const reverse = validHits.some(
      (other) =>
        other.attacker === hit.target && other.target === hit.attacker
    );
    if (!reverse) continue;

    clashPairs.add(key);
    const midpointX = (hit.attacker.x + hit.target.x) / 2;
    const midpointZ = (hit.attacker.z + hit.target.z) / 2;
    host.combatFx.spawnHit(midpointX, midpointZ, [255, 240, 170], 2);

    for (const player of [hit.attacker, hit.target]) {
      player.stunTimer = Math.max(
        player.stunTimer,
        CONFIG.combat.clashStunSeconds
      );
      player.hurtTimer = Math.max(player.hurtTimer, 0.35);
      player.dash = null;
      host.cancelCast(player);
      player.vx = 0;
      player.vz = 0;
      player.animation = 'hurt';
      player.playback = 1;
    }

    host.applyKnockback(
      hit.attacker,
      hit.target.x,
      hit.target.z,
      CONFIG.combat.clashKnockback
    );
    host.applyKnockback(
      hit.target,
      hit.attacker.x,
      hit.attacker.z,
      CONFIG.combat.clashKnockback
    );
  }

  // Misma regla que en los golpes de dash: orden de lanzamiento y, si varios
  // son letales en el mismo frame, el KO queda para el primero.
  for (const hit of hits) {
    if (host.isMatchOver()) break;
    if (clashPairs.has(meleePairKey(hit.attacker, hit.target))) continue;
    if (!meleeHitValid(host, hit)) continue;
    host.applyAbilityDamage(hit.attacker, hit.target, hit.def, {
      healToken: hit.healToken
    });
  }
}
