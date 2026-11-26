/**
 * Contratos del timeline de animación de una habilidad.
 *
 * Solo tipos: el compilador que los convierte en `CastSegment[]` vive en
 * `animationScript.ts`. La habilidad sigue mandando en el tiempo: `startup`,
 * `active` y `recovery` definen el presupuesto máximo y el script solo coloca
 * clips dentro de esa ventana. Los huecos son válidos y dejan cuerpo en su
 * locomoción normal (`hurt`/`walk`/`idle`).
 *
 * Las referencias son al **clip 3D**, no a frames de sprite: marcas semánticas
 * (`impact`, `followThrough`), fases normalizadas o segundos.
 */

import type { ClipRef } from './clipLibrary';
import type { AnimationName } from './types';

/** Referencia a un instante del clip (alias histórico de `ClipRef`). */
export type AnimationFrameRef = ClipRef;

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
 * Cómo encajar el tramo del clip en la ventana:
 * - `alignImpact`: resuelve la velocidad (y recorta anticipación si hace falta)
 *   para que la marca `impact` del clip caiga exactamente en `effect`.
 * - `stretch`: estira dentro de `[MIN_PLAYBACK, MAX_PLAYBACK]`; si sobra clip
 *   recorta el final y si falta mantiene la última pose (solo con `hold`).
 * - `trimStart`: recorta el inicio del clip; si falta ventana, retrasa el tramo
 *   y rellena el hueco con la primera pose (anticipación).
 * - `trimEnd`: recorta el final del clip; si falta ventana, mantiene la última
 *   pose solo con `hold`.
 * - `natural`: no estira; reproduce a `speed` y recorta o deja hueco.
 */
export type AnimationFit =
  | 'alignImpact'
  | 'stretch'
  | 'trimStart'
  | 'trimEnd'
  | 'natural';

/** Repetición del tramo durante la ventana. */
export type AnimationStepMode = 'once' | 'loop';

/** Tramo del clip, ambos extremos dentro del clip. */
export interface AnimationFrameSpan {
  from?: AnimationFrameRef;
  to?: AnimationFrameRef;
}

export interface AnimationStep {
  /** Clip que se dibuja. */
  clip: AnimationName;
  /** Tramo del clip. Por defecto: `start`..`end`. */
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
  /**
   * Congela una pose si la ventana dura más que el tramo:
   * - `'end'` (o `true`): la última pose del tramo.
   * - `'impact'`: la pose de impacto.
   */
  hold?: boolean | 'end' | 'impact';
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
  /** Mezcla de entrada de la capa de acción, en segundos. */
  blendIn?: number;
  /** Mezcla de salida de la capa de acción, en segundos. */
  blendOut?: number;
}

/**
 * Secuencia declarativa de animación de una habilidad.
 *
 * Los pasos se encadenan por defecto. Los que se solapan se recortan a favor
 * del que empieza después; los huecos se dejan sin animación de acción.
 */
export type AnimationScript = readonly AnimationStep[];

/** Tiempos de gameplay que acotan el timeline. */
export interface AnimationCastTiming {
  startup: number;
  active: number;
  recovery: number;
}
