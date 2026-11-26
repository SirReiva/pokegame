/**
 * Biblioteca de clips 3D por especie.
 *
 * Es la fuente de verdad temporal del sistema de animación de habilidades: cada
 * clip del GLB aporta su duración real y unos marcadores semánticos
 * (`impact`, `followThrough`...). El gameplay sigue mandando en segundos; esta
 * biblioteca solo traduce esos segundos al interior del clip.
 *
 * No depende de PlayCanvas ni del manifiesto de sprites.
 */

import type { AnimationName } from './types';

/** Marcas semánticas dentro de un clip, en orden temporal. */
export type ClipMark = 'start' | 'impact' | 'followThrough' | 'end';

/**
 * Referencia a un instante del clip:
 * - una marca semántica (`impact`, `end`...),
 * - una fase normalizada 0..1,
 * - o un tiempo absoluto en segundos.
 */
export type ClipRef = ClipMark | { phase: number } | { seconds: number };

/** Posiciones normalizadas (0..1) de los hitos del clip. */
export interface ClipMarkers {
  /** Momento de contacto/lanzamiento. */
  readonly impact: number;
  /** Inicio de la vuelta al reposo. */
  readonly followThrough: number;
  /** Fin de una carga, si el clip la tiene. */
  readonly release?: number;
}

export interface ClipInfo {
  readonly animation: AnimationName;
  /** Duración real del clip 3D en segundos. */
  readonly duration: number;
  /** El clip está pensado para repetirse. */
  readonly loop: boolean;
  readonly markers: ClipMarkers;
  /** El clip trae root motion que la simulación decide conservar o no. */
  readonly rootMotion: 'ignore' | 'keep';
}

/** Clips disponibles para una especie, ya con los fallbacks resueltos. */
export type ClipLibrary = Partial<Record<AnimationName, ClipInfo>>;

/** Clip resuelto tras aplicar los fallbacks de la especie. */
export interface ResolvedClip {
  readonly name: AnimationName;
  readonly clip: ClipInfo;
}

/** Metadatos editables por modelo (extras del GLB o `clips.json`). */
export interface ClipMarkerOverride {
  impact?: number;
  followThrough?: number;
  release?: number;
  loop?: boolean;
  rootMotion?: 'ignore' | 'keep';
}

export type ClipMarkerTable = Record<string, ClipMarkerOverride>;

/**
 * Clips de casteo que se reproducen con reloj manual (la simulación fija el
 * tiempo). El resto (idle, walk, hurt, faint) usa el reloj automático del
 * `AnimComponent`.
 */
export const ACTION_ANIMATIONS: ReadonlySet<AnimationName> = new Set([
  'run',
  'attack',
  'quickstrike',
  'shock',
  'shoot',
  'charge',
  'strike',
  'twirl',
  'shake',
  'punch',
  'hop'
]);

export function usesActionLayer(name: AnimationName): boolean {
  return ACTION_ANIMATIONS.has(name);
}

export const DEFAULT_IMPACT = 0.5;

function clamp01(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/** Completa y ordena los marcadores de un clip. */
export function normalizeMarkers(
  override?: ClipMarkerOverride
): ClipMarkers {
  const impact = clamp01(override?.impact ?? DEFAULT_IMPACT, DEFAULT_IMPACT);
  const followThrough = Math.max(
    impact,
    clamp01(override?.followThrough ?? 1, 1)
  );
  if (override?.release === undefined) {
    return { impact, followThrough };
  }
  return {
    impact,
    followThrough,
    release: Math.max(impact, clamp01(override.release, followThrough))
  };
}

/** Fase normalizada de una marca dentro del clip. */
export function markPhase(mark: ClipMark, clip: ClipInfo): number {
  switch (mark) {
    case 'start':
      return 0;
    case 'impact':
      return clip.markers.impact;
    case 'followThrough':
      return clip.markers.followThrough;
    case 'end':
      return 1;
  }
}

/** Tiempo, en segundos, de una referencia dentro del clip. */
export function clipRefTime(
  ref: ClipRef | undefined,
  clip: ClipInfo,
  fallbackPhase = 0
): number {
  const duration = Math.max(0.0001, clip.duration);
  if (ref === undefined) {
    return clamp01(fallbackPhase, 0) * duration;
  }
  if (typeof ref === 'string') {
    return clamp01(markPhase(ref, clip), 0) * duration;
  }
  if ('phase' in ref) {
    return clamp01(ref.phase, 0) * duration;
  }
  return Math.min(duration, Math.max(0, ref.seconds));
}
