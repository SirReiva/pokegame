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
  endAt: number,
  suppressLeadingHold = false
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
      const trimmedPlayback = remaining / window;
      if (trimmedPlayback < MIN_PLAYBACK) {
        // Al recortar queda un tramo más corto que la ventana: se reproduce a
        // MIN y se deja hueco (o se mantiene la pose si el paso lo pide).
        const segmentEnd = Math.min(
          endAt,
          startAt + remaining / MIN_PLAYBACK
        );
        pushOnce(
          segments,
          animation,
          from,
          to,
          startAt,
          segmentEnd,
          MIN_PLAYBACK
        );
        if (step.hold && segmentEnd < endAt - EPSILON) {
          pushHold(segments, animation, to, segmentEnd, endAt);
        }
        return;
      }
      playback = Math.min(MAX_PLAYBACK, trimmedPlayback);
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
      // pose, igual que hacía `planLead` en el builder clásico. Si un paso
      // `fill` anterior ya cubre el hueco, no se duplica la pose.
      const played = natural / MIN_PLAYBACK;
      const delayedStart = Math.max(startAt, endAt - played);
      if (!suppressLeadingHold) {
        pushHold(segments, animation, from, startAt, delayedStart);
      }
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
 * Fin natural de un paso antes de recortarlo al final del casteo.
 */
function stepEndAt(
  step: AnimationStep,
  animation: ResolvedAnimation | null,
  startAt: number,
  marks: CastMarks
): number {
  if (step.until !== undefined) {
    return clamp(endTime(step.until, marks), startAt, marks.endAt);
  }
  if (step.duration !== undefined) {
    return clamp(startAt + Math.max(0, step.duration), startAt, marks.endAt);
  }
  if (!animation) return startAt;
  if (step.mode === 'loop') return marks.endAt;
  const range = frameRange(step, animation);
  if (!range) return startAt;
  return clamp(
    startAt +
      frameSpanDuration(animation.animation, range.from, range.to) /
        Math.max(MIN_SPEED, step.speed ?? 1),
    startAt,
    marks.endAt
  );
}

/**
 * Final del hueco que debe cubrir un paso `fill`: el instante en el que el
 * siguiente paso empieza a dibujar de verdad. Si el siguiente paso no tiene
 * anticipación (`hitFrame` en el primer frame), la carga ocupa toda su ventana.
 */
function fillEndForNext(
  step: AnimationStep,
  animation: ResolvedAnimation | null,
  startAt: number,
  endAt: number
): number {
  if (!animation || endAt - startAt <= EPSILON) return startAt;
  if (step.mode === 'loop' || step.fit !== 'trimStart') return startAt;
  const range = frameRange(step, animation);
  if (!range) return endAt;
  const natural = frameSpanDuration(animation.animation, range.from, range.to);
  if (natural <= EPSILON) return endAt;
  const playback = natural / (endAt - startAt);
  if (playback >= MIN_PLAYBACK) return startAt;
  return Math.max(startAt, endAt - natural / MIN_PLAYBACK);
}

/**
 * Inicio de la ventana del siguiente paso para un `fill`. Los pasos relativos
 * (`after`) no se pueden rellenar: el relleno depende de ellos y ellos del
 * relleno.
 */
function fillTargetStart(
  step: AnimationStep,
  cursor: number,
  fillerStart: number,
  marks: CastMarks
): number | null {
  const at = step.at;
  if (at === undefined) return null;
  if (typeof at === 'object' && 'after' in at) return null;
  return clamp(startTime(at, cursor, marks), fillerStart, marks.endAt);
}

/**
 * Compila el script de una habilidad dentro de sus tiempos de gameplay.
 *
 * Reglas:
 * - Los pasos se encadenan si no declaran `at`.
 * - `until` tiene prioridad sobre `duration`.
 * - Un `loop` sin fin explícito dura hasta el final del casteo.
 * - Un paso `fill` ocupa solo el hueco que deja la anticipación del siguiente.
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
  let suppressLeadingHold = false;

  for (let index = 0; index < script.length; index++) {
    const step = script[index];
    const animation = resolve(step.clip);
    const startAt = clamp(startTime(step.at, cursor, marks), 0, marks.endAt);

    if (step.fill) {
      const next = script[index + 1];
      const nextAnimation = next ? resolve(next.clip) : null;
      let fillEnd = startAt;
      let filled = false;
      if (
        next &&
        animation &&
        nextAnimation &&
        animation.name !== nextAnimation.name
      ) {
        const nextStart = fillTargetStart(next, cursor, startAt, marks);
        if (nextStart !== null) {
          const nextEnd = stepEndAt(next, nextAnimation, nextStart, marks);
          fillEnd = fillEndForNext(next, nextAnimation, nextStart, nextEnd);
        }
      }
      fillEnd = clamp(fillEnd, startAt, marks.endAt);
      if (animation && fillEnd > startAt) {
        const before = segments.length;
        compileStep(segments, step, animation, startAt, fillEnd);
        filled = segments.length > before;
      }
      suppressLeadingHold = filled;
      cursor = fillEnd;
      continue;
    }

    const endAt = stepEndAt(step, animation, startAt, marks);
    if (animation) {
      compileStep(
        segments,
        step,
        animation,
        startAt,
        endAt,
        suppressLeadingHold
      );
    }
    suppressLeadingHold = false;
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
