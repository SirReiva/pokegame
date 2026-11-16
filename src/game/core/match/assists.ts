/**
 * Reglas de asistencia de una baja.
 *
 * Una asistencia es la aportación de un compañero del killer que ayudó a
 * conseguir la baja. Hay cuatro fuentes, todas medidas contra la misma ventana
 * temporal:
 *
 * - `damage`: daño suficiente sobre la víctima (20 % de su vida máxima).
 * - `slow`: haber ralentizado a la víctima.
 * - `heal`: haber curado al killer lo suficiente (10 % de su vida máxima).
 * - `revive`: haber devuelto al killer a la vida con una habilidad.
 *
 * El killer nunca se autoasiste, solo cuenta su propio equipo y una baja entre
 * compañeros no reparte asistencias. Cada jugador recibe como máximo una
 * asistencia por baja, aunque acumule varios tipos; la XP usa el peso mayor de
 * los tipos aplicables para no premiar dos veces el mismo evento.
 */

import { XP_REWARDS, XP_RULES } from '../xp';
import type { MatchPlayerState } from './playerState';

export type AssistKind = 'damage' | 'slow' | 'heal' | 'revive';

/** Etiquetas legibles para tooltips y documentación. */
export const ASSIST_KIND_LABELS: Record<AssistKind, string> = {
  damage: 'daño',
  slow: 'control',
  heal: 'curación',
  revive: 'revive'
};

/** Una asistencia confirmada: quién ayudó y de qué forma. */
export interface AssistCredit {
  /** Plaza del asistente. */
  slot: number;
  /** Tipos de aportación, sin repetir. */
  kinds: AssistKind[];
}

/** Peso de XP de cada tipo de asistencia. */
const ASSIST_XP: Record<AssistKind, number> = {
  damage: XP_REWARDS.assist,
  slow: XP_REWARDS.assistSlow,
  heal: XP_REWARDS.assistHeal,
  revive: XP_REWARDS.assistRevive
};

/** XP de una asistencia: el peso mayor de los tipos que aportó. */
export function assistXpFor(kinds: readonly AssistKind[]): number {
  let best = 0;
  for (const kind of kinds) best = Math.max(best, ASSIST_XP[kind]);
  return best;
}

/**
 * Calcula las asistencias de una baja. No muta el estado: `Game` decide cuándo
 * confirmarlas y limpiar los mapas de aportación.
 */
export function collectKillAssists(
  killer: MatchPlayerState,
  victim: MatchPlayerState,
  playersBySlot: ReadonlyMap<number, MatchPlayerState>,
  now: number
): AssistCredit[] {
  // Sin baja entre equipos no hay asistencia que repartir.
  if (killer.team === victim.team) return [];

  const credits = new Map<number, AssistCredit>();
  const add = (slot: number, kind: AssistKind): void => {
    if (slot === killer.slot) return;
    const assistant = playersBySlot.get(slot);
    if (!assistant || assistant.team !== killer.team) return;
    const existing = credits.get(slot);
    if (existing) {
      if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
    } else {
      credits.set(slot, { slot, kinds: [kind] });
    }
  };
  const recent = (at: number): boolean =>
    now - at <= XP_RULES.assistWindowSeconds;

  const damageThreshold =
    victim.maxHp * XP_RULES.assistMinDamageFraction;
  for (const [slot, contribution] of victim.damageContributors) {
    if (contribution.amount >= damageThreshold && recent(contribution.at)) {
      add(slot, 'damage');
    }
  }

  for (const [slot, at] of victim.slowContributors) {
    if (recent(at)) add(slot, 'slow');
  }

  const healThreshold = killer.maxHp * XP_RULES.assistMinHealingFraction;
  for (const [slot, contribution] of killer.supportContributors) {
    if (contribution.heal >= healThreshold && recent(contribution.healAt)) {
      add(slot, 'heal');
    }
    if (contribution.revives > 0 && recent(contribution.reviveAt)) {
      add(slot, 'revive');
    }
  }

  return [...credits.values()];
}
