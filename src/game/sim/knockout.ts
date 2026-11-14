/**
 * KO de un jugador.
 *
 * Cierra la vida del objetivo, retira sus estados, programa el respawn, marca
 * el cadáver, actualiza el feed y deja que el modo decida marcador/XP/cierre.
 */

import { CONFIG } from '../config';
import type { MatchPlayerState } from '../matchState';
import type { SpriteAsset } from '../sprite';
import { breakRegen } from './status';

export interface KnockoutHost {
  isMatchOver(): boolean;
  assetFor(pokemonId: string, skinId?: string): SpriteAsset | undefined;
  cancelCast(player: MatchPlayerState): void;
  clearRepeatCooldown(player: MatchPlayerState): void;
  playDeathCopies(target: MatchPlayerState, animation: 'faint' | 'hurt'): void;
  spawnDeathMarker(target: MatchPlayerState): void;
  pushKillFeed(
    killer: MatchPlayerState,
    victim: MatchPlayerState,
    abilityName: string
  ): void;
  awardKillXp(killer: MatchPlayerState, victim: MatchPlayerState): void;
  /** Marcador, XP de objetivo y cierre de partida, si el modo lo decide. */
  handleModeKnockout(killer: MatchPlayerState, victim: MatchPlayerState): void;
  emitStats(): void;
}

export function knockOut(
  host: KnockoutHost,
  target: MatchPlayerState,
  killer: MatchPlayerState,
  abilityName: string
): void {
  // El fin de partida es idempotente: el primer evento de modo que cierra la
  // partida decide el ganador y los KO posteriores del mismo frame no suman.
  if (host.isMatchOver()) return;
  if (!target.alive) return;
  const animations = host.assetFor(
    target.pokemonId,
    target.skinId
  )?.skin.animations;
  const deathAnimation = animations?.faint ?? animations?.hurt;
  const deathDuration = deathAnimation
    ? deathAnimation.durations.reduce((total, ticks) => total + ticks, 0) / 60
    : 0.7;

  target.alive = false;
  target.hp = 0;
  target.deaths += 1;
  target.respawnTimer = CONFIG.combat.respawnSeconds;
  target.deathFade = Math.max(0.45, deathDuration);
  target.hurtTimer = 0;
  target.animationFrame = null;
  target.dash = null;
  host.cancelCast(target);
  host.clearRepeatCooldown(target);
  target.vx = 0;
  target.vz = 0;
  target.buffs = [];
  target.slowEffects = [];
  target.slowMultiplier = 1;
  target.damageReductionTimer = 0;
  target.damageReduction = 0;
  target.shieldSpeedMultiplier = 1;
  target.shieldFx?.destroy();
  target.shieldFx = null;
  breakRegen(target);
  const animation = animations?.faint ? 'faint' : 'hurt';
  target.animation = animation;
  target.playback = 1;
  host.playDeathCopies(target, animation);
  host.spawnDeathMarker(target);

  host.pushKillFeed(killer, target, abilityName);

  if (killer.team !== target.team) {
    killer.kills += 1;
    host.awardKillXp(killer, target);
    host.handleModeKnockout(killer, target);
  }

  // La víctima pierde la racha y las aportaciones de esta vida. Sus propias
  // bajas repetidas se conservan: el castigo por farmeo es contra quien muere.
  target.killStreak = 0;
  target.recentKills = [];
  target.damageContributors.clear();
  host.emitStats();
}
