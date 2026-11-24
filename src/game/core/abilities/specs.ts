/** Modificadores declarativos de una habilidad. */

import type { PokemonType } from '../typeChart';
import type { BuffStat } from './styles';

export interface BuffSpec {
  stat: BuffStat;
  /** Multiplicador: 1,25 = +25 %, 0,8 = −20 %. */
  multiplier: number;
  /** Duración en segundos. */
  duration: number;
}

/** Ralentización aplicada a los enemigos alcanzados. */
export interface SlowSpec {
  /** Multiplicador de velocidad: 0,55 = 45 % más lento. */
  multiplier: number;
  /** Duración en segundos. */
  duration: number;
}

interface StatusBase {
  /** Duración total en segundos. */
  duration: number;
}

/** Veneno: daño fijo por tick. */
export interface PoisonedStatus extends StatusBase {
  kind: 'poisoned';
  /** Daño fijo por tick, en PV. */
  damage: number;
  /** Intervalo entre ticks en segundos. Por defecto, 1 s. */
  interval?: number;
}

/** Quemadura: daño fijo por tick. */
export interface BurnedStatus extends StatusBase {
  kind: 'burned';
  /** Daño fijo por tick, en PV. */
  damage: number;
  /** Intervalo entre ticks en segundos. Por defecto, 1 s. */
  interval?: number;
}

/** Congelación: ralentiza el movimiento mientras dure. */
export interface FrozenStatus extends StatusBase {
  kind: 'frozen';
  /** Multiplicador de velocidad: 0,55 = 45 % más lento. */
  multiplier: number;
}

/** Sueño: no puede moverse ni usar habilidades. Despierta al recibir daño. */
export interface AsleepStatus extends StatusBase {
  kind: 'asleep';
}

/**
 * Parálisis: suma tiempo de enfriamiento a las habilidades que ya están
 * enfriándose. `mode: 'once'` lo aplica al entrar; `'overtime'` lo repite cada
 * `interval` segundos mientras dure.
 */
export interface ParalyzedStatus extends StatusBase {
  kind: 'paralyzed';
  /** Segundos extra que se suman a cada habilidad en enfriamiento. */
  extraCooldown: number;
  mode: 'once' | 'overtime';
  /** Intervalo entre aplicaciones en `overtime`. Por defecto, 1 s. */
  interval?: number;
}

/** Estado que una habilidad declara en `props.status`. */
export type StatusSpec =
  | PoisonedStatus
  | BurnedStatus
  | FrozenStatus
  | AsleepStatus
  | ParalyzedStatus;

/** Discriminante de `StatusSpec`: lo marca el `kind` de cada variante. */
export type StatusKind = StatusSpec['kind'];

/** Subconjunto de estados que hacen daño en el tiempo. */
export type DamageStatusSpec = Extract<
  StatusSpec,
  { kind: 'poisoned' | 'burned' }
>;

/** `true` si el estado hace daño en el tiempo. */
export function isDamageStatus(
  status: StatusSpec | null | undefined
): status is DamageStatusSpec {
  return status?.kind === 'poisoned' || status?.kind === 'burned';
}

/** Tipo Pokémon asociado a un estado de daño, para colores y popups. */
export function statusPokemonType(status: {
  kind: 'poisoned' | 'burned';
}): PokemonType {
  return status.kind === 'burned' ? 'Fire' : 'Poison';
}
