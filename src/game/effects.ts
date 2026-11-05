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
 * Cura a un Pokémon una fracción de su vida máxima y devuelve los PV
 * recuperados. Nunca supera el máximo y muestra un número flotante para que el
 * cambio de vida sea legible.
 */
export function applyHealFraction(
  player: MatchPlayerState,
  fraction: number,
  def: AbilityDef,
  combatFx: CombatFx,
  showHealPopup: (player: MatchPlayerState, amount: number) => void,
  /** Quién recibe la estadística de curación; por defecto, el curado. */
  credit: MatchPlayerState = player
): number {
  if (fraction <= 0 || !player.alive) return 0;

  const missing = Math.max(0, player.maxHp - player.hp);
  const amount = Math.min(missing, Math.round(player.maxHp * fraction));
  if (amount > 0) {
    player.hp += amount;
    credit.abilityHealing += amount;
    showHealPopup(player, amount);
  }
  // Las áreas de curación ya dibujan su propio efecto en todo el radio; un
  // estallido por objetivo duplicaría el VFX y taparía la lectura del área.
  if (def.shape !== 'aoe') {
    combatFx.spawnHeal(
      player.x,
      player.z,
      def.color,
      Math.max(0.8, Math.min(def.radius, 1.2))
    );
  }
  return amount;
}

/** Cura al lanzador la fracción indicada por `healSelf`. */
export function applyHealSelf(
  player: MatchPlayerState,
  def: AbilityDef,
  combatFx: CombatFx,
  showHealPopup: (player: MatchPlayerState, amount: number) => void
): void {
  applyHealFraction(player, def.healSelf, def, combatFx, showHealPopup);
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
