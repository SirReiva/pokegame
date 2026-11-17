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

/**
 * Daño en el tiempo aplicado a los enemigos alcanzados.
 *
 * Quemadura y veneno son la misma mecánica: solo cambia `type`. El daño es
 * fijo por tick (no entra en la fórmula de combate) y se aplica una vez por
 * tipo de estado sobre cada objetivo.
 */
export interface DamageOverTimeSpec {
  /** Tipo del estado: `Fire` = quemadura, `Poison` = veneno, etc. */
  type: PokemonType;
  /** Daño fijo por tick, en PV. */
  damage: number;
  /** Duración total en segundos. */
  duration: number;
  /** Intervalo entre ticks en segundos. Por defecto, 1 s. */
  interval?: number;
}
