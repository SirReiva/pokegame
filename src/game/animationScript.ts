/**
 * Compilador de timelines de animación de habilidades.
 *
 * Traduce un `AnimationScript` declarativo a los `CastSegment[]` absolutos que
 * consume el runtime. El gameplay manda: `startup`, `active` y `recovery` son
 * el presupuesto máximo y el script solo coloca clips dentro. Lo que no cubre
 * un paso queda como hueco y el sprite vuelve a su estado normal.
 *
 * El compilador es puro (sin PlayCanvas) para poder probarlo y para que la
 * simulación siga siendo determinista: el plan se calcula una vez por casteo.
 */

import {
  MAX_PLAYBACK,
  MIN_PLAYBACK,
  clipTiming,
  frameAtTime,
  frameBoundary,
  frameSpanDuration,
  frameStart
} from './animationTimeline';
import type { CastPlan, CastSegment, ClipResolver } from './core/castPlan';
import type {
  AnimationCastMark,
  AnimationCastTiming,
  AnimationEndRef,
  AnimationFrameRef,
  AnimationScript,
  AnimationStep,
  AnimationTimeRef
} from './core/animationScript';
import type { AnimationName, ResolvedAnimation } from './types';

const EPSILON = 1e-6;
const MIN_SPEED = 0.05;

interface CastMarks {
  effectAt: number;
  castEnd: number;
  endAt: number;
}

function lastFrame(animation: ResolvedAnimation): number {
  return Math.max(0, animation.animation.durations.length - 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function timingMarks(timing: AnimationCastTiming): CastMarks {
  const effectAt = Math.max(0, timing.startup);
  const castEnd = effectAt + Math.max(0, timing.active);
  const endAt = castEnd + Math.max(0, timing.recovery);
  return { effectAt, castEnd, endAt };
}

function markTime(mark: AnimationCastMark, marks: CastMarks): number {
  switch (mark) {
    case 'start':
      return 0;
    case 'effect':
      return marks.effectAt;
    case 'castEnd':
      return marks.castEnd;
    case 'end':
      return marks.endAt;
  }
}

function startTime(
  ref: AnimationTimeRef | undefined,
  cursor: number,
  marks: CastMarks
): number {
  if (ref === undefined) return cursor;
  if (typeof ref === 'string') return markTime(ref, marks);
  if ('at' in ref) return ref.at;
  return cursor + ref.after;
}

function endTime(ref: AnimationEndRef, marks: CastMarks): number {
  return typeof ref === 'string' ? markTime(ref, marks) : ref.at;
}

/** Resuelve una referencia semántica o numérica a un índice de frame. */
function resolveFrame(
  ref: AnimationFrameRef | undefined,
  animation: ResolvedAnimation,
  fallback: number
): number {
  if (ref === undefined) return fallback;
  if (typeof ref === 'number') {
    return clamp(Math.round(ref), 0, lastFrame(animation));
  }
  if (ref === 'first') return 0;
  if (ref === 'last') return lastFrame(animation);
  const timing = clipTiming(animation.animation);
  if (ref === 'rush') return timing.rushFrame;
  if (ref === 'hit') return timing.hitFrame;
  if (ref === 'return') return timing.returnFrame;
  if (ref === 'beforeHit') return timing.hitFrame - 1;
  return timing.returnFrame - 1;
}

/** Tramo válido del paso, o `null` si queda vacío. */
function frameRange(
  step: AnimationStep,
  animation: ResolvedAnimation
): { from: number; to: number } | null {
  const from = resolveFrame(step.frames?.from, animation, 0);
  const to = resolveFrame(step.frames?.to, animation, lastFrame(animation));
  if (from < 0 || to < 0 || to < from) return null;
  const last = lastFrame(animation);
  return { from: clamp(from, 0, last), to: clamp(to, 0, last) };
}

function pushHold(
  segments: CastSegment[],
  animation: ResolvedAnimation,
  frame: number,
  startAt: number,
  endAt: number
): void {
  if (endAt - startAt <= EPSILON) return;
  segments.push({
    animation: animation.name,
    startFrame: frame,
    endFrame: frame,
    startAt,
    endAt,
    playback: 1,
    clipStartAt: frameStart(animation.animation, frame),
    loop: false
  });
}

function pushOnce(
  segments: CastSegment[],
  animation: ResolvedAnimation,
  from: number,
  to: number,
  startAt: number,
  endAt: number,
  playback: number
): void {
  if (endAt - startAt <= EPSILON || to < from) return;
  segments.push({
    animation: animation.name,
    startFrame: from,
    endFrame: to,
    startAt,
    endAt,
    playback,
    clipStartAt: frameBoundary(animation.animation, from),
    loop: false
  });
}

/** Convierte un paso ya acotado a una ventana `[startAt, endAt]`. */
function compileStep(
  segments: CastSegment[],
  step: AnimationStep,
  animation: ResolvedAnimation,
  startAt: number,
  endAt: number
): void {
  const range = frameRange(step, animation);
  if (!range) {
    // Un tramo vacío puede congelar su frame inicial (por ejemplo, una ventana
    // activa sin `return` propio). Sin `hold`, se deja el hueco.
    if (step.hold && endAt - startAt > EPSILON) {
      const frame = resolveFrame(step.frames?.from, animation, 0);
      if (frame >= 0) {
        pushHold(segments, animation, frame, startAt, endAt);
      }
    }
    return;
  }
  let { from, to } = range;

  const window = endAt - startAt;
  if (window <= EPSILON) return;

  const speed = Math.max(MIN_SPEED, step.speed ?? 1);

  if (step.mode === 'loop') {
    segments.push({
      animation: animation.name,
      startFrame: from,
      endFrame: to,
      startAt,
      endAt,
      playback: speed,
      clipStartAt: frameBoundary(animation.animation, from),
      loop: true
    });
    return;
  }

  const natural = frameSpanDuration(animation.animation, from, to);
  if (natural <= EPSILON) return;

  const fit = step.fit ?? 'stretch';

  if (fit === 'natural') {
    const played = natural / speed;
    if (played <= window + EPSILON) {
      const segmentEnd = Math.min(endAt, startAt + played);
      pushOnce(segments, animation, from, to, startAt, segmentEnd, speed);
      if (step.hold && segmentEnd < endAt - EPSILON) {
        pushHold(segments, animation, to, segmentEnd, endAt);
      }
    } else {
      // La ventana corta el clip antes de su final natural.
      const boundary = frameBoundary(animation.animation, from);
      const cut = frameAtTime(
        animation.animation,
        boundary + window * speed - EPSILON
      );
      pushOnce(
        segments,
        animation,
        from,
        clamp(cut, from, to),
        startAt,
        endAt,
        speed
      );
    }
    return;
  }

  let playback = natural / window;

  if (playback > MAX_PLAYBACK) {
    if (fit === 'trimStart') {
      // Se descarta anticipación hasta que el tramo restante quepa a MAX.
      const endBoundary = frameBoundary(animation.animation, to + 1);
      while (
        from < to &&
        endBoundary - frameBoundary(animation.animation, from) >
          window * MAX_PLAYBACK
      ) {
        from++;
      }
      const remaining =
        endBoundary - frameBoundary(animation.animation, from);
      if (remaining <= EPSILON) return;
      playback = Math.min(MAX_PLAYBACK, remaining / window);
    } else {
      // Se recorta el final del tramo.
      playback = MAX_PLAYBACK;
      const startBoundary = frameBoundary(animation.animation, from);
      const visibleEnd = Math.min(
        frameBoundary(animation.animation, to + 1),
        startBoundary + window * MAX_PLAYBACK
      );
      to = clamp(
        frameAtTime(
          animation.animation,
          Math.max(startBoundary, visibleEnd - EPSILON)
        ),
        from,
        to
      );
    }
  } else if (playback < MIN_PLAYBACK) {
    playback = MIN_PLAYBACK;
    if (fit === 'trimStart') {
      // Anticipación: se retrasa el tramo y se rellena el hueco con la primera
      // pose, igual que hacía `planLead` en el builder clásico.
      const played = natural / MIN_PLAYBACK;
      const delayedStart = Math.max(startAt, endAt - played);
      pushHold(segments, animation, from, startAt, delayedStart);
      pushOnce(
        segments,
        animation,
        from,
        to,
        delayedStart,
        endAt,
        MIN_PLAYBACK
      );
      return;
    }
    const segmentEnd = Math.min(endAt, startAt + natural / MIN_PLAYBACK);
    pushOnce(segments, animation, from, to, startAt, segmentEnd, MIN_PLAYBACK);
    if (step.hold && segmentEnd < endAt - EPSILON) {
      pushHold(segments, animation, to, segmentEnd, endAt);
    }
    return;
  }

  pushOnce(segments, animation, from, to, startAt, endAt, playback);
}

/**
 * Ordena y resuelve solapamientos. Si dos pasos comparten tiempo, el que
 * empieza después recorta al anterior; nunca se dibujan dos clips a la vez.
 */
function normalizeSegments(segments: CastSegment[]): CastSegment[] {
  const sorted = [...segments].sort(
    (a, b) => a.startAt - b.startAt || a.endAt - b.endAt
  );
  const result: CastSegment[] = [];
  for (const segment of sorted) {
    const previous = result[result.length - 1];
    if (previous && segment.startAt < previous.endAt - EPSILON) {
      previous.endAt = segment.startAt;
      if (previous.endAt - previous.startAt <= EPSILON) result.pop();
    }
    if (segment.endAt - segment.startAt > EPSILON) result.push(segment);
  }
  return result;
}

/**
 * Frame de impacto que debe forzar `armHitFrame`: el segmento que cubre el
 * efecto, si su tramo contiene el `HitFrame` del clip. Sin coincidencia no se
 * fuerza nada y el efecto sale igualmente a su tiempo.
 */
function findImpact(
  segments: readonly CastSegment[],
  effectAt: number,
  resolve: ClipResolver
): { clip: AnimationName; frame: number } | null {
  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index];
    if (segment.loop) continue;
    if (
      effectAt < segment.startAt - EPSILON ||
      effectAt >= segment.endAt - EPSILON
    ) {
      continue;
    }
    const animation = resolve(segment.animation);
    if (!animation) continue;
    const hitFrame = clipTiming(animation.animation).hitFrame;
    if (hitFrame < segment.startFrame || hitFrame > segment.endFrame) continue;
    return { clip: segment.animation, frame: hitFrame };
  }
  return null;
}

/**
 * Compila el script de una habilidad dentro de sus tiempos de gameplay.
 *
 * Reglas:
 * - Los pasos se encadenan si no declaran `at`.
 * - `until` tiene prioridad sobre `duration`.
 * - Un `loop` sin fin explícito dura hasta el final del casteo.
 * - Nada se sale de `[0, endAt]`.
 * - Los huecos se respetan; el runtime los resuelve como `hurt`/`walk`/`idle`.
 */
export function compileAnimationScript(
  script: AnimationScript,
  timing: AnimationCastTiming,
  resolve: ClipResolver
): CastPlan {
  const marks = timingMarks(timing);
  const segments: CastSegment[] = [];
  let cursor = 0;

  for (const step of script) {
    const animation = resolve(step.clip);
    const startAt = clamp(startTime(step.at, cursor, marks), 0, marks.endAt);

    let endAt: number;
    if (step.until !== undefined) {
      endAt = endTime(step.until, marks);
    } else if (step.duration !== undefined) {
      endAt = startAt + Math.max(0, step.duration);
    } else if (animation) {
      if (step.mode === 'loop') {
        endAt = marks.endAt;
      } else {
        const range = frameRange(step, animation);
        endAt = range
          ? startAt +
            frameSpanDuration(animation.animation, range.from, range.to) /
              Math.max(MIN_SPEED, step.speed ?? 1)
          : startAt;
      }
    } else {
      endAt = startAt;
    }

    endAt = clamp(endAt, startAt, marks.endAt);
    if (animation) {
      compileStep(segments, step, animation, startAt, endAt);
    }
    cursor = endAt;
  }

  const normalized = normalizeSegments(segments);
  const impact = findImpact(normalized, marks.effectAt, resolve);
  const animationEndAt =
    normalized.length > 0
      ? normalized.reduce(
          (latest, segment) => Math.max(latest, segment.endAt),
          0
        )
      : marks.endAt;

  return {
    segments: normalized,
    effectAt: marks.effectAt,
    activeEnd: marks.castEnd,
    endAt: marks.endAt,
    animationEndAt,
    hitFrame: impact?.frame ?? null,
    hitClip: impact?.clip ?? null
  };
}
