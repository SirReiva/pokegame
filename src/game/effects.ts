/**
 * Composición de efectos reutilizables.
 *
 * `compose` encadena pasos independientes sobre un mismo contexto. Así una
 * habilidad no necesita saber si además cura, aplica buffs o lanza un VFX:
 * solo ejecuta una lista ordenada de efectos.
 */

import type { AbilityDef } from './abilities';
import type { CombatFx } from './combatFx';
import type { MatchPlayerState } from './matchState';

export type Effect<Context> = (context: Context) => void;

/**
 * Compone efectos de izquierda a derecha. El contexto se pasa a cada paso y
 * ninguno devuelve valor: el estado mutable vive en el propio contexto.
 */
export function compose<Context>(
  ...effects: readonly Effect<Context>[]
): Effect<Context> {
  return (context) => {
    for (const effect of effects) effect(context);
  };
}

export interface CastEffectContext {
  player: MatchPlayerState;
  def: AbilityDef;
  combatFx: CombatFx;
  showHealPopup(player: MatchPlayerState, amount: number): void;
}

/** Aplica al lanzador todos los buffs declarados por la habilidad. */
export const applyBuffs: Effect<CastEffectContext> = ({ player, def }) => {
  for (const buff of def.buffs) {
    player.buffs.push({ ...buff, duration: buff.duration });
  }
};

/**
 * Cura al lanzador una fracción de su vida máxima. Nunca supera el máximo y
 * muestra un número flotante para que el cambio de vida sea legible.
 */
export function applyHealSelf(
  player: MatchPlayerState,
  def: AbilityDef,
  combatFx: CombatFx,
  showHealPopup: (player: MatchPlayerState, amount: number) => void
): void {
  if (def.healSelf <= 0 || !player.alive) return;

  const missing = Math.max(0, player.maxHp - player.hp);
  const amount = Math.min(missing, Math.round(player.maxHp * def.healSelf));
  if (amount > 0) {
    player.hp += amount;
    showHealPopup(player, amount);
  }
  combatFx.spawnHeal(
    player.x,
    player.z,
    def.color,
    Math.max(0.8, def.radius)
  );
}

/**
 * Efecto de curación al lanzar. Las habilidades con `healOnHit` esperan a que
 * el haz impacte, así que este paso las ignora.
 */
export const healSelf: Effect<CastEffectContext> = ({
  player,
  def,
  combatFx,
  showHealPopup
}) => {
  if (def.healOnHit) return;
  applyHealSelf(player, def, combatFx, showHealPopup);
};

/** Efectos que se resuelven al completar el lanzamiento de cualquier habilidad. */
export const CAST_EFFECTS = compose(applyBuffs, healSelf);
