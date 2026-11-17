/**
 * Adaptabilidad de Eevee.
 *
 * Tres estados mutuamente excluyentes que se cambian con Adaptación. El estado
 * es persistente (se refresca cada frame como un aura) y modifica las dos
 * habilidades que dependen de él:
 *
 * - Agilidad: +15 % VEL; Ataque Rápido llega más lejos y Último Recurso golpea
 *   tres veces.
 * - Resistencia: +15 % DF/DE; ambas habilidades dejan un escudo al terminar.
 * - Potencia: +15 % AF/AE; Ataque Rápido y Último Recurso pegan más.
 */

import { baseAbilityId, type AbilityDef } from '../abilities';
import type { MatchPlayerState } from '../matchState';
import { applyBuffStatus, grantShield } from '../statusEffects';

export const EEVEE_AGILITY = 0;
export const EEVEE_RESILIENCE = 1;
export const EEVEE_POWER = 2;

const STANCE_DURATION = 0.45;
const STANCE_SPEED = 1.15;
const STANCE_DEFENSE = 1.15;
const STANCE_OFFENSE = 1.15;

export function eeveeStance(player: MatchPlayerState): number {
  if (player.pokemonId !== '0133') return -1;
  const stance = player.status.passive.value;
  return stance < 0 ? EEVEE_AGILITY : stance;
}

/** Cambia al siguiente estado y cancela el escudo pendiente del anterior. */
export function cycleEeveeStance(player: MatchPlayerState): number {
  const state = player.status.passive;
  const current = state.value;
  const next = current < 0 ? EEVEE_AGILITY : (current + 1) % 3;
  state.value = next;
  state.flag = false;
  state.timer = 0;
  state.magnitude = 0;
  return next;
}

/** Aplica el buff del estado actual y resuelve el escudo diferido. */
export function stepEeveeStance(player: MatchPlayerState, dt: number): void {
  if (player.pokemonId !== '0133' || !player.alive) return;
  const state = player.status.passive;
  if (state.value < 0) state.value = EEVEE_AGILITY;

  if (state.flag) {
    state.timer -= dt;
    if (state.timer <= 0) {
      state.flag = false;
      grantShield(player, state.magnitude, 2.5, player.slot);
      state.magnitude = 0;
    }
  }

  if (state.value === EEVEE_AGILITY) {
    applyBuffStatus(
      player,
      'speed',
      STANCE_SPEED,
      STANCE_DURATION,
      'eevee-stance:speed'
    );
    return;
  }
  if (state.value === EEVEE_RESILIENCE) {
    applyBuffStatus(
      player,
      'defense',
      STANCE_DEFENSE,
      STANCE_DURATION,
      'eevee-stance:defense'
    );
    applyBuffStatus(
      player,
      'spDefense',
      STANCE_DEFENSE,
      STANCE_DURATION,
      'eevee-stance:spDefense'
    );
    return;
  }
  applyBuffStatus(
    player,
    'attack',
    STANCE_OFFENSE,
    STANCE_DURATION,
    'eevee-stance:attack'
  );
  applyBuffStatus(
    player,
    'spAttack',
    STANCE_OFFENSE,
    STANCE_DURATION,
    'eevee-stance:spAttack'
  );
}

/**
 * Ajusta la definición de Ataque Rápido y Último Recurso según el estado. Se
 * llama antes de construir el plan de casteo para que la animación y la
 * geometría usen la misma definición que el efecto.
 */
export function adjustEeveeAbility(
  player: MatchPlayerState,
  def: AbilityDef
): AbilityDef {
  if (player.pokemonId !== '0133') return def;
  const stance = eeveeStance(player);
  const base = baseAbilityId(def.id);

  if (base === 'ataqueRapidoEevee') {
    if (stance === EEVEE_AGILITY) {
      return { ...def, dashDistance: def.dashDistance * 1.35 };
    }
    if (stance === EEVEE_POWER) {
      return { ...def, power: def.power * 1.25 };
    }
    return def;
  }

  if (base === 'ultimoRecurso') {
    if (stance === EEVEE_AGILITY) {
      // Tres impactos que reparten la potencia total de la definitiva.
      return { ...def, hitCount: 3 };
    }
    if (stance === EEVEE_POWER) {
      return { ...def, power: def.power * 1.3 };
    }
  }

  return def;
}

/**
 * Marca el escudo diferido de Resistencia. El host lo resuelve en `onTick`
 * cuando termina el casteo de la habilidad.
 */
export function scheduleEeveeShield(
  player: MatchPlayerState,
  def: AbilityDef,
  fraction: number
): void {
  if (player.pokemonId !== '0133') return;
  const state = player.status.passive;
  if (eeveeStance(player) !== EEVEE_RESILIENCE) return;
  state.flag = true;
  state.timer = Math.max(0.12, def.active + def.recovery);
  state.magnitude = fraction;
}
