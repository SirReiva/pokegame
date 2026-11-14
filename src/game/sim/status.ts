/**
 * Estado pasivo de los jugadores: regeneración y goteo de participación.
 *
 * No dependen del render ni de la cámara; solo del reloj de simulación y de las
 * acciones de XP/curación que aporta el host.
 */

import {
  REGENERATION_DELAY_SECONDS,
  REGENERATION_HP_PER_SECOND
} from '../abilities';
import type { MatchPlayerState } from '../matchState';
import { XP_REWARDS, XP_RULES, type XpSource } from '../xp';

export interface StatusSystemHost {
  isMatchOver(): boolean;
  awardXp(player: MatchPlayerState, source: XpSource, amount: number): void;
  showHeal(player: MatchPlayerState, amount: number): void;
}

/** Reinicia el estado de la regeneración pasiva. */
export function breakRegen(player: MatchPlayerState): void {
  player.hiddenTimer = 0;
  player.regenGraceTimer = 0;
  player.regenAccumulator = 0;
  player.regenerating = false;
}

/**
 * Regeneración: tras `REGENERATION_DELAY_SECONDS` sin ser visto, cura
 * `REGENERATION_HP_PER_SECOND` PV/s. Usa `enemiesSeeing` y una gracia de 0,2 s
 * para que un frame de visibilidad en el borde no reinicie el contador.
 */
export function stepRegeneration(
  players: readonly MatchPlayerState[],
  dt: number,
  host: StatusSystemHost
): void {
  for (const player of players) {
    if (!player.alive || player.commonAbilityId !== 'regeneracion') {
      breakRegen(player);
      continue;
    }

    if (player.enemiesSeeing > 0) {
      player.regenGraceTimer += dt;
      if (player.regenGraceTimer >= 0.2) {
        player.hiddenTimer = 0;
        player.regenAccumulator = 0;
        player.regenerating = false;
      }
      continue;
    }

    player.regenGraceTimer = 0;
    player.hiddenTimer += dt;
    if (
      player.hiddenTimer < REGENERATION_DELAY_SECONDS ||
      player.hp >= player.maxHp
    ) {
      player.regenerating = false;
      continue;
    }

    player.regenerating = true;
    player.regenAccumulator += dt * REGENERATION_HP_PER_SECOND;
    const whole = Math.floor(player.regenAccumulator);
    if (whole <= 0) continue;
    player.regenAccumulator -= whole;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + whole);
    const healed = player.hp - before;
    if (healed > 0) {
      player.abilityHealing += healed;
      host.awardXp(player, 'healing', healed * XP_REWARDS.healingPerHp);
      host.showHeal(player, healed);
    }
    if (player.hp >= player.maxHp) player.regenerating = false;
  }
}

/**
 * Goteo de participación: 1 XP cada 10 s vivos, con un tope de 30 y solo si el
 * jugador ha hecho algo de combate en los últimos 30 s.
 */
export function stepParticipation(
  players: readonly MatchPlayerState[],
  dt: number,
  matchElapsed: number,
  host: StatusSystemHost
): void {
  if (host.isMatchOver()) return;
  for (const player of players) {
    if (!player.alive) continue;
    if (player.participationAwarded >= XP_REWARDS.participationCap) {
      player.participationTimer = 0;
      continue;
    }
    if (
      matchElapsed - player.lastActionAt >
      XP_RULES.participationIdleSeconds
    ) {
      continue;
    }
    player.participationTimer += dt;
    while (
      player.participationTimer >= XP_RULES.participationTickSeconds &&
      player.participationAwarded < XP_REWARDS.participationCap
    ) {
      player.participationTimer -= XP_RULES.participationTickSeconds;
      player.participationAwarded += XP_REWARDS.participationPerTick;
      host.awardXp(player, 'participation', XP_REWARDS.participationPerTick);
    }
  }
}
