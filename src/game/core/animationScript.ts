/**
 * Contratos del timeline de animación de una habilidad.
 *
 * Solo tipos: el compilador que los convierte en `CastSegment[]` vive en
 * `animationScript.ts`. La habilidad sigue mandando en el tiempo: `startup`,
 * `active` y `recovery` definen el presupuesto máximo y el script solo coloca
 * clips dentro de esa ventana. Los huecos son válidos y dejan al sprite en su
 * estado normal (`hurt`/`walk`/`idle`).
 */

import type { AnimationName } from './types';

/**
 * Referencia a un frame del clip:
 * - `number`: índice 0-based, para overrides por especie.
 * - `first` / `last`: extremos del clip.
 * - `rush` / `hit` / `return`: marcadores del `AnimData.xml` (solo clips de ataque).
 * - `beforeHit` / `beforeReturn`: frame anterior al marcador; sirve para tramos
 *   que terminan justo antes del impacto o de la vuelta.
 */
export type AnimationFrameRef =
  | number
  | 'first'
  | 'last'
  | 'rush'
  | 'hit'
  | 'return'
  | 'beforeHit'
  | 'beforeReturn';

/** Instante del casteo al que se puede anclar un paso. */
export type AnimationCastMark = 'start' | 'effect' | 'castEnd' | 'end';

/** Inicio de un paso: un marcador, un tiempo absoluto o relativo al anterior. */
export type AnimationTimeRef =
  | AnimationCastMark
  | { at: number }
  | { after: number };

/** Fin explícito de un paso. */
export type AnimationEndRef = AnimationCastMark | { at: number };

/**
 * Cómo encajar el tramo de frames en la ventana:
 * - `stretch`: estira dentro de `[MIN_PLAYBACK, MAX_PLAYBACK]`; si sobra clip
 *   recorta el final y si falta mantiene el último frame (solo con `hold`).
 * - `trimStart`: recorta frames del inicio; si falta ventana, retrasa el tramo
 *   y rellena el hueco con el primer frame (anticipación).
 * - `trimEnd`: recorta frames del final; si falta ventana, mantiene el último
 *   frame solo con `hold`.
 * - `natural`: no estira; reproduce a `speed` y recorta o deja hueco.
 */
export type AnimationFit = 'stretch' | 'trimStart' | 'trimEnd' | 'natural';

/** Repetición del tramo durante la ventana. */
export type AnimationStepMode = 'once' | 'loop';

/** Tramo de frames del clip, ambos extremos inclusive. */
export interface AnimationFrameSpan {
  from?: AnimationFrameRef;
  to?: AnimationFrameRef;
}

export interface AnimationStep {
  /** Clip que se dibuja. */
  clip: AnimationName;
  /** Tramo del clip. Por defecto: `first`..`last`. */
  frames?: AnimationFrameSpan;
  /**
   * Inicio de la ventana. Si se omite, empieza donde acabó el paso anterior.
   */
  at?: AnimationTimeRef;
  /** Duración de la ventana en segundos. */
  duration?: number;
  /** Fin explícito; tiene prioridad sobre `duration`. */
  until?: AnimationEndRef;
  /** Estrategia de ajuste; por defecto `stretch`. */
  fit?: AnimationFit;
  /** Mantiene el último frame si la ventana es más larga que el tramo. */
  hold?: boolean;
  /**
   * Hace que este paso ocupe solo el hueco que deja la anticipación del
   * siguiente paso. Si el siguiente paso empieza a la vez que este, el relleno
   * no se dibuja. Es lo que usan las cargas: solo suenan cuando el lanzamiento
   * llega tarde.
   */
  fill?: boolean;
  /** Por defecto `once`. */
  mode?: AnimationStepMode;
  /** Velocidad fija para `natural` y `loop` (1 = natural). */
  speed?: number;
}

/**
 * Secuencia declarativa de animación de una habilidad.
 *
 * Los pasos se encadenan por defecto. Los que se solapan se recortan a favor
 * del que empieza después; los huecos se dejan sin animación.
 */
export type AnimationScript = readonly AnimationStep[];

/** Tiempos de gameplay que acotan el timeline. */
export interface AnimationCastTiming {
  startup: number;
  active: number;
  recovery: number;
}
