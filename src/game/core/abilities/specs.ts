/** Modificadores declarativos de una habilidad. */

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
