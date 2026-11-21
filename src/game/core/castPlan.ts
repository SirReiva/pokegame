/**
 * Contratos del plan de presentación de un casteo.
 *
 * Solo tipos: la lógica que los construye vive en `castPlan.ts`. Se separan para
 * que el estado de la partida no dependa del módulo de animación.
 */

import type { AnimationName, ResolvedAnimation } from './types';

/** Resuelve el clip real de este aspecto para un nombre de animación. */
export type ClipResolver = (name: AnimationName) => ResolvedAnimation | null;

export interface CastSegment {
  /** Clip que se dibuja. */
  animation: AnimationName;
  /** Frame inicial (inclusive). */
  startFrame: number;
  /** Frame final (inclusive). */
  endFrame: number;
  /** Ventana de casteo en la que se reproduce. */
  startAt: number;
  endAt: number;
  /** Velocidad del clip (1 = natural). */
  playback: number;
  /** Tiempo dentro del clip al empezar `startAt`. */
  clipStartAt: number;
  /** `true` para repetir el clip mientras dure la ventana (cargas). */
  loop: boolean;
}

export interface CastPlan {
  segments: CastSegment[];
  /** Instante del efecto (= `def.startup`). */
  effectAt: number;
  /** Fin de la ventana activa (= `startup + active`). */
  activeEnd: number;
  /** Fin del casteo (= `startup + active + recovery`). */
  endAt: number;
  /**
   * Instante en el que termina de dibujarse el clip de lanzamiento. Si no hay
   * animación de lanzamiento, coincide con `endAt`.
   */
  animationEndAt: number;
  /** Frame de impacto del clip de lanzamiento, para depuración. */
  hitFrame: number | null;
  /** Clip de lanzamiento resuelto, para depuración. */
  hitClip: AnimationName | null;
}
