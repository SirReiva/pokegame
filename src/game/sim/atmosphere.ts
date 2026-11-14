/**
 * Daño residual del clima (arena, granizo...).
 *
 * Se cobra una vez por intervalo y nunca deja a un Pokémon a 0 PV: el último
 * punto solo lo puede quitar un golpe. El host aporta los avisos visuales.
 */

import { atmosphereResidual } from '../atmosphere';
import type { AtmosphereId } from '../atmosphere';
import type { MatchPlayerState } from '../matchState';

export interface AtmosphereSystemHost {
  isMatchOver(): boolean;
  showDamage(player: MatchPlayerState, amount: number): void;
  vibrate(player: MatchPlayerState, amount: number): void;
  emitStats(): void;
}

/**
 * Devuelve el nuevo acumulador de tick para que el llamador lo conserve.
 */
export function stepAtmosphere(
  players: readonly MatchPlayerState[],
  dt: number,
  atmosphere: AtmosphereId,
  tick: number,
  host: AtmosphereSystemHost
): number {
  const residual = atmosphereResidual(atmosphere);
  if (!residual || host.isMatchOver()) return tick;
  tick += dt;
  if (tick < residual.interval) return tick;
  tick -= residual.interval;

  let changed = false;
  for (const player of players) {
    if (!player.alive || player.invulnerableTimer > 0 || player.hp <= 1) continue;
    if (player.types.some((type) => residual.immuneTypes.includes(type))) continue;
    const amount = Math.min(
      player.hp - 1,
      Math.max(1, Math.round(player.maxHp * residual.fraction))
    );
    if (amount <= 0) continue;
    player.hp -= amount;
    player.damageTaken += amount;
    player.hurtTimer = Math.max(player.hurtTimer, 0.18);
    host.showDamage(player, amount);
    host.vibrate(player, amount);
    changed = true;
  }
  if (changed) host.emitStats();
  return tick;
}
