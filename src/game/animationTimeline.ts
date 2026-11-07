/**
 * Tiempos de un clip de sprite y ventanas de reproducción.
 *
 * Todo se calcula a partir de `durations` (ticks de 1/60 s) y de los
 * marcadores `rushFrame` / `hitFrame` / `returnFrame` del `AnimData.xml` de
 * PMD. El motor no guarda tiempos precalculados en el manifiesto: así una
 * edición de sprites basta con volver a parchear los índices.
 *
 * Este módulo es puro (sin PlayCanvas) para poder usarlo también desde los
 * scripts de validación con Node.
 */

import type { AnimationName, SpriteAnimation } from './types';

/** Animaciones de ataque que caen a `attack` (y luego a `idle`) si faltan. */
const ATTACK_FALLBACKS: ReadonlySet<AnimationName> = new Set([
  'quickstrike',
  'shock',
  'shoot',
  'charge',
  'strike',
  'twirl',
  'shake',
  'punch'
]);

/** Resuelve la animación disponible más cercana usando el mismo orden en todo el motor. */
export function resolveAnimationName(
  name: AnimationName,
  has: (candidate: AnimationName) => boolean
): AnimationName {
  if (has(name)) return name;
  const fallbacks: AnimationName[] =
    name === 'faint'
      ? ['hurt', 'idle']
      : ATTACK_FALLBACKS.has(name)
        ? ['attack', 'idle']
        : ['idle'];
  for (const fallback of fallbacks) {
    if (has(fallback)) return fallback;
  }
  return 'idle';
}

/**
 * Límites de velocidad del clip cuando el efecto va por código. Si el clip
 * necesita salirse de este rango para cuadrar el `HitFrame`, el plan recorta
 * frames o retrasa el segmento en vez de deformar la animación.
 */
export const MIN_PLAYBACK = 0.6;
export const MAX_PLAYBACK = 1.8;

/** Ticks por segundo del formato de PMD. */
export const TICKS_PER_SECOND = 60;

/** Tiempo (s) al que empieza `frame` dentro del clip, a velocidad 1. */
export function frameStart(animation: SpriteAnimation, frame: number): number {
  const frames = animation.durations.length;
  if (frames === 0) return 0;
  const index = Math.max(0, Math.min(frame, frames - 1));
  let ticks = 0;
  for (let i = 0; i < index; i++) ticks += animation.durations[i] ?? 0;
  return ticks / TICKS_PER_SECOND;
}

/** Duración natural del clip a velocidad 1. */
export function clipDuration(animation: SpriteAnimation): number {
  const ticks = animation.durations.reduce((total, value) => total + value, 0);
  return ticks / TICKS_PER_SECOND;
}

export interface ClipTiming {
  /** Duración natural del clip a 1x. */
  duration: number;
  /** Instante del clip en el que empieza el envite. */
  rushAt: number;
  /** Instante del clip en el que ocurre el impacto/lanzamiento. */
  hitAt: number;
  /** Instante del clip en el que empieza la vuelta al reposo. */
  returnAt: number;
  rushFrame: number;
  hitFrame: number;
  returnFrame: number;
}

/**
 * Resuelve los marcadores con los valores por defecto del formato PMD:
 * `RushFrame = 0`, `HitFrame = ReturnFrame`, `ReturnFrame = último frame`.
 */
export function clipTiming(animation: SpriteAnimation): ClipTiming {
  const frames = animation.durations.length;
  const last = Math.max(0, frames - 1);
  const clampFrame = (value: number | undefined, fallback: number): number =>
    value === undefined ? fallback : Math.max(0, Math.min(last, Math.round(value)));

  const returnFrame = clampFrame(animation.returnFrame, last);
  const hitFrame = clampFrame(animation.hitFrame, returnFrame);
  const rushFrame = clampFrame(animation.rushFrame, 0);
  return {
    duration: clipDuration(animation),
    rushAt: frameStart(animation, Math.min(rushFrame, hitFrame)),
    hitAt: frameStart(animation, hitFrame),
    returnAt: frameStart(animation, Math.max(hitFrame, returnFrame)),
    rushFrame: Math.min(rushFrame, hitFrame),
    hitFrame,
    returnFrame: Math.max(hitFrame, returnFrame)
  };
}

/** Frame cuyo intervalo [inicio, fin) contiene `seconds` dentro del clip. */
export function frameAtTime(
  animation: SpriteAnimation,
  seconds: number
): number {
  const frames = animation.durations.length;
  if (frames === 0) return 0;
  // Un instante exactamente en el borde de dos frames pertenece al siguiente.
  // Sin la tolerancia, la resta en coma flotante puede devolver el frame
  // anterior y desalinear el HitFrame justo en el instante del efecto.
  const boundary = 1e-9;
  let elapsed = Math.max(0, seconds);
  for (let frame = 0; frame < frames; frame++) {
    const duration = Math.max(1 / 120, (animation.durations[frame] ?? 6) / TICKS_PER_SECOND);
    if (elapsed < duration - boundary) return frame;
    elapsed -= duration;
  }
  return frames - 1;
}

/** Limita un playback al rango seguro sin dejar valores no finitos. */
export function clampPlayback(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(MIN_PLAYBACK, Math.min(MAX_PLAYBACK, value));
}
