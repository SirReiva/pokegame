/**
 * Contratos del plan de presentación de un casteo.
 *
 * Solo tipos: la lógica que los construye vive en `castPlan.ts`. El plan ya no
 * habla de frames de sprite: cada segmento es un tramo temporal del clip 3D
 * (`clipStart`..`clipEnd`) colocado dentro de la ventana de casteo.
 */

import type { ResolvedClip } from './clipLibrary';
import type { AnimationName } from './types';

/** Resuelve el clip real de este aspecto para un nombre de animación. */
export type ClipResolver = (name: AnimationName) => ResolvedClip | null;

export interface CastSegment {
  /** Clip que se dibuja. */
  animation: AnimationName;
  /** Inicio del tramo dentro del clip, en segundos a velocidad 1. */
  clipStart: number;
  /** Fin del tramo dentro del clip, en segundos a velocidad 1. */
  clipEnd: number;
  /** Ventana de casteo en la que se reproduce. */
  startAt: number;
  endAt: number;
  /** Velocidad del clip (1 = natural). */
  speed: number;
  /** `true` para repetir el tramo mientras dure la ventana (cargas). */
  loop: boolean;
  /** Mezcla de entrada de la capa de acción, en segundos. */
  blendIn: number;
  /** Mezcla de salida de la capa de acción, en segundos. */
  blendOut: number;
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
  /** Clip cuyo marcador de impacto cae en `effectAt`, si lo hay. */
  impactClip: AnimationName | null;
  /** Tiempo dentro del clip del impacto, en segundos. */
  impactTime: number | null;
}
