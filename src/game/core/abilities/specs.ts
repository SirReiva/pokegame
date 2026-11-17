/** Modificadores declarativos de una habilidad. */

import type { BuffStat } from './styles';
import type { PokemonType } from '../typeChart';

export interface BuffSpec {
  stat: BuffStat;
  /** Multiplicador: 1,25 = +25 %, 0,8 = −20 %. */
  multiplier: number;
  /** Duración en segundos. */
  duration: number;
}

/** Efecto que se dispara al completar las acumulaciones de una marca. */
export interface MarkBurstSpec {
  damage?: number;
  slow?: { multiplier: number; duration: number };
  root?: number;
  silence?: number;
  healSelf?: number;
  antiHeal?: { fraction: number; duration: number };
  buff?: { stat: BuffStat; multiplier: number; duration: number };
}

/** Ralentización aplicada a los enemigos alcanzados. */
export interface SlowSpec {
  /** Multiplicador de velocidad: 0,55 = 45 % más lento. */
  multiplier: number;
  /** Duración en segundos. */
  duration: number;
}

/** Daño periódico declarado por una habilidad. */
export interface DotSpec {
  /** Clave estable para renovar en vez de acumular. */
  id: string;
  /** Daño por segundo. */
  power: number;
  duration: number;
  interval?: number;
  /** `null` o ausente = daño verdadero. */
  type?: PokemonType | null;
}

/** Marca acumulable aplicada por una habilidad. */
export interface MarkSpec {
  id: string;
  maxStacks: number;
  duration: number;
  burst: MarkBurstSpec;
  /** Segundos de inmunidad a la misma marca tras detonar. */
  immunityAfter?: number;
}

/** Reducción de curación aplicada por una habilidad. */
export interface AntiHealSpec {
  /** Fracción de curación anulada: 0,4 = −40 %. */
  fraction: number;
  duration: number;
}
