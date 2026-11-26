/**
 * Compilador de timelines de animación de habilidades.
 *
 * Traduce un `AnimationScript` declarativo a los `CastSegment[]` absolutos que
 * consume el runtime. El gameplay manda: `startup`, `active` y `recovery` son
 * el presupuesto máximo y el script solo coloca clips dentro. Lo que no cubre
 * un paso queda como hueco y el cuerpo vuelve a su locomoción normal.
 *
 * Los clips son 3D: cada segmento guarda un tramo temporal
 * (`clipStart`..`clipEnd`) y una velocidad. `alignImpact` resuelve la velocidad
 * para que el marcador `impact` del clip caiga exactamente en el `effect` del
 * gameplay, sin depender de frames de sprite.
 *
 * El compilador es puro (sin PlayCanvas) para poder probarlo y para que la
 * simulación siga siendo determinista: el plan se calcula una vez por casteo.
 */

import { MAX_PLAYBACK, MIN_PLAYBACK } from './animationTimeline';
import type { CastPlan, CastSegment, ClipResolver } from './core/castPlan';
import type {
  AnimationCastMark,
  AnimationCastTiming,
  AnimationEndRef,
  AnimationScript,
  AnimationStep,
  AnimationTimeRef
} from './core/animationScript';
import type { ClipInfo, ClipRef, ResolvedClip } from './core/clipLibrary';
import type { AnimationName } from './types';

const EPSILON = 1e-6;
const MIN_SPEED = 0.05;

interface CastMarks {
  effectAt: number;
  castEnd: number;
  endAt: number;
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

function isHold(step: AnimationStep): boolean {
  return step.hold !== false && step.hold !== undefined;
}

function holdTime(step: AnimationStep, clip: ClipInfo, fallback: number): number {
  if (step.hold === 'impact') {
    return clamp(
      clip.markers.impact * clip.duration,
      0,
      clip.duration
    );
  }
  return fallback;
}

/** Tramo del clip resuelto, o `null` si queda vacío. */
function clipRange(
  step: AnimationStep,
  clip: ClipInfo
): { from: number; to: number } | null {
  const duration = Math.max(0.0001, clip.duration);
  const from =
    step.frames?.from === undefined
      ? 0
      : clipRefTime(step.frames.from, clip);
  const to =
    step.frames?.to === undefined
      ? duration
      : clipRefTime(step.frames.to, clip);
  if (to < from - EPSILON) return null;
  return { from, to };
}

function clipRefTime(
  ref: ClipRef,
  clip: ClipInfo
): number {
  const duration = Math.max(0.0001, clip.duration);
  if (typeof ref === 'string') {
    const phase =
      ref === 'start'
        ? 0
        : ref === 'impact'
          ? clip.markers.impact
          : ref === 'followThrough'
            ? clip.markers.followThrough
            : 1;
    return clamp(phase, 0, 1) * duration;
  }
  if ('phase' in ref) {
    return clamp(ref.phase, 0, 1) * duration;
  }
  return clamp(ref.seconds, 0, duration);
}

function pushHold(
  segments: CastSegment[],
  clip: ClipInfo,
  time: number,
  startAt: number,
  endAt: number,
  step?: AnimationStep
): void {
  if (endAt - startAt <= EPSILON) return;
  const at = clamp(time, 0, clip.duration);
  segments.push({
    animation: clip.animation,
    clipStart: at,
    clipEnd: at,
    startAt,
    endAt,
    speed: 1,
    loop: false,
    blendIn: step?.blendIn ?? 0,
    blendOut: step?.blendOut ?? 0
  });
}

function pushOnce(
  segments: CastSegment[],
  clip: ClipInfo,
  from: number,
  to: number,
  startAt: number,
  endAt: number,
  speed: number,
  step: AnimationStep
): void {
  if (endAt - startAt <= EPSILON || to < from - EPSILON) return;
  segments.push({
    animation: clip.animation,
    clipStart: from,
    clipEnd: to,
    startAt,
    endAt,
    speed,
    loop: false,
    blendIn: step.blendIn ?? 0,
    blendOut: step.blendOut ?? 0
  });
}

/**
 * Convierte un paso ya acotado a una ventana `[startAt, endAt]`.
 *
 * `effectAt` se usa para `alignImpact`: la velocidad se resuelve para que el
 * marcador de impacto del clip caiga en el instante del efecto.
 */
function compileStep(
  segments: CastSegment[],
  step: AnimationStep,
  clip: ClipInfo,
  startAt: number,
  endAt: number,
  effectAt: number,
  suppressLeadingHold = false
): void {
  const range = clipRange(step, clip);
  if (!range) {
    // Un tramo vacío puede congelar su pose inicial (por ejemplo, una ventana
    // activa sin `return` propio). Sin `hold`, se deja el hueco.
    if (isHold(step) && endAt - startAt > EPSILON) {
      const time = step.frames?.from
        ? clipRefTime(step.frames.from, clip)
        : 0;
      pushHold(
        segments,
        clip,
        holdTime(step, clip, time),
        startAt,
        endAt,
        step
      );
    }
    return;
  }
  let { from, to } = range;

  const window = endAt - startAt;
  if (window <= EPSILON) return;

  const speed = Math.max(MIN_SPEED, step.speed ?? 1);

  if (step.mode === 'loop') {
    segments.push({
      animation: clip.animation,
      clipStart: from,
      clipEnd: to,
      startAt,
      endAt,
      speed,
      loop: true,
      blendIn: step.blendIn ?? 0,
      blendOut: step.blendOut ?? 0
    });
    return;
  }

  const natural = to - from;
  if (natural <= EPSILON) return;

  const fit = step.fit ?? 'stretch';

  if (fit === 'natural') {
    const played = natural / speed;
    if (played <= window + EPSILON) {
      const segmentEnd = Math.min(endAt, startAt + played);
      pushOnce(segments, clip, from, to, startAt, segmentEnd, speed, step);
      if (isHold(step) && segmentEnd < endAt - EPSILON) {
        pushHold(
          segments,
          clip,
          holdTime(step, clip, to),
          segmentEnd,
          endAt,
          step
        );
      }
    } else {
      // La ventana corta el clip antes de su final natural.
      const cut = clamp(from + window * speed, from, to);
      pushOnce(segments, clip, from, cut, startAt, endAt, speed, step);
    }
    return;
  }

  if (fit === 'alignImpact') {
    const impactTime = clamp(
      clip.markers.impact * clip.duration,
      0,
      clip.duration
    );
    const lead = effectAt - startAt;
    const impactInRange =
      impactTime >= from - EPSILON && impactTime <= to + EPSILON;

    if (lead > EPSILON && impactInRange) {
      let segmentStart = from;
      let playback = (impactTime - segmentStart) / lead;

      if (playback > MAX_PLAYBACK) {
        // Se descarta la anticipación del clip hasta que quepa en la ventana.
        segmentStart = Math.max(from, impactTime - lead * MAX_PLAYBACK);
        playback = (impactTime - segmentStart) / lead;
      }

      if (playback < MIN_PLAYBACK) {
        // El clip es más corto que la ventana: se retrasa la entrada y se
        // mantiene la primera pose para que el impacto siga cayendo en `effect`.
        const played = (impactTime - segmentStart) / MIN_PLAYBACK;
        const delayed = Math.max(startAt, endAt - played);
        if (delayed > startAt + EPSILON && !suppressLeadingHold) {
          pushHold(
            segments,
            clip,
            holdTime(step, clip, segmentStart),
            startAt,
            delayed,
            step
          );
        }
        startAt = delayed;
        playback = MIN_PLAYBACK;
      }

      playback = Math.max(MIN_SPEED, Math.min(MAX_PLAYBACK, playback));
      const segmentEnd = Math.min(
        to,
        segmentStart + (endAt - startAt) * playback
      );
      pushOnce(
        segments,
        clip,
        segmentStart,
        segmentEnd,
        startAt,
        endAt,
        playback,
        step
      );
      return;
    }
    // Si el impacto no cae en este tramo, se comporta como un estiramiento.
  }

  let playback = natural / window;

  if (playback > MAX_PLAYBACK) {
    if (fit === 'trimStart') {
      // Se descarta anticipación hasta que el tramo restante quepa a MAX.
      from = Math.max(from, to - window * MAX_PLAYBACK);
      const remaining = to - from;
      if (remaining <= EPSILON) return;
      const trimmedPlayback = remaining / window;
      if (trimmedPlayback < MIN_PLAYBACK) {
        const segmentEnd = Math.min(
          endAt,
          startAt + remaining / MIN_PLAYBACK
        );
        pushOnce(
          segments,
          clip,
          from,
          to,
          startAt,
          segmentEnd,
          MIN_PLAYBACK,
          step
        );
        if (isHold(step) && segmentEnd < endAt - EPSILON) {
          pushHold(
            segments,
            clip,
            holdTime(step, clip, to),
            segmentEnd,
            endAt,
            step
          );
        }
        return;
      }
      playback = Math.min(MAX_PLAYBACK, trimmedPlayback);
    } else {
      // Se recorta el final del tramo.
      playback = MAX_PLAYBACK;
      to = clamp(from + window * MAX_PLAYBACK, from, to);
    }
  } else if (playback < MIN_PLAYBACK) {
    playback = MIN_PLAYBACK;
    if (fit === 'trimStart') {
      // Anticipación: se retrasa el tramo y se rellena el hueco con la primera
      // pose. Si un paso `fill` anterior ya cubre el hueco, no se duplica.
      const played = natural / MIN_PLAYBACK;
      const delayedStart = Math.max(startAt, endAt - played);
      if (!suppressLeadingHold) {
        pushHold(
          segments,
          clip,
          holdTime(step, clip, from),
          startAt,
          delayedStart,
          step
        );
      }
      pushOnce(
        segments,
        clip,
        from,
        to,
        delayedStart,
        endAt,
        MIN_PLAYBACK,
        step
      );
      return;
    }
    const segmentEnd = Math.min(endAt, startAt + natural / MIN_PLAYBACK);
    pushOnce(
      segments,
      clip,
      from,
      to,
      startAt,
      segmentEnd,
      MIN_PLAYBACK,
      step
    );
    if (isHold(step) && segmentEnd < endAt - EPSILON) {
      pushHold(
        segments,
        clip,
        holdTime(step, clip, to),
        segmentEnd,
        endAt,
        step
      );
    }
    return;
  }

  pushOnce(segments, clip, from, to, startAt, endAt, playback, step);
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
      const newEnd = Math.max(previous.startAt, segment.startAt);
      if (!previous.loop && previous.speed > EPSILON) {
        previous.clipEnd = Math.min(
          previous.clipEnd,
          previous.clipStart + (newEnd - previous.startAt) * previous.speed
        );
      }
      previous.endAt = newEnd;
      if (previous.endAt - previous.startAt <= EPSILON) result.pop();
    }
    if (segment.endAt - segment.startAt > EPSILON) result.push(segment);
  }
  return result;
}

/**
 * Clip cuyo marcador de impacto cae en `effectAt`, si el segmento visible en
 * ese instante lo contiene.
 */
function findImpact(
  segments: readonly CastSegment[],
  effectAt: number,
  resolve: ClipResolver
): { clip: AnimationName; time: number } | null {
  for (let index = segments.length - 1; index >= 0; index--) {
    const segment = segments[index];
    if (segment.loop) continue;
    const covers =
      effectAt >= segment.startAt - EPSILON &&
      effectAt < segment.endAt - EPSILON;
    // Un casteo sin ventana activa puede terminar justo en el impacto: el
    // último segmento acaba en `effectAt` y sigue siendo la pose visible.
    const endsAt =
      Math.abs(effectAt - segment.endAt) <= EPSILON &&
      segment.endAt > segment.startAt;
    if (!covers && !endsAt) continue;
    const resolved: ResolvedClip | null = resolve(segment.animation);
    if (!resolved) continue;
    const impactTime = clamp(
      resolved.clip.markers.impact * resolved.clip.duration,
      0,
      resolved.clip.duration
    );
    if (
      impactTime < segment.clipStart - EPSILON ||
      impactTime > segment.clipEnd + EPSILON
    ) {
      continue;
    }
    return { clip: segment.animation, time: impactTime };
  }
  return null;
}

/** Fin natural de un paso antes de recortarlo al final del casteo. */
function stepEndAt(
  step: AnimationStep,
  clip: ClipInfo | null,
  startAt: number,
  marks: CastMarks
): number {
  if (step.until !== undefined) {
    return clamp(endTime(step.until, marks), startAt, marks.endAt);
  }
  if (step.duration !== undefined) {
    return clamp(startAt + Math.max(0, step.duration), startAt, marks.endAt);
  }
  if (!clip) return startAt;
  if (step.mode === 'loop') return marks.endAt;
  const range = clipRange(step, clip);
  if (!range) return startAt;
  return clamp(
    startAt +
      (range.to - range.from) / Math.max(MIN_SPEED, step.speed ?? 1),
    startAt,
    marks.endAt
  );
}

/**
 * Final del hueco que debe cubrir un paso `fill`: el instante en el que el
 * siguiente paso empieza a dibujar de verdad. Si el siguiente paso no tiene
 * anticipación, la carga ocupa toda su ventana.
 */
function fillEndForNext(
  step: AnimationStep,
  clip: ClipInfo | null,
  startAt: number,
  endAt: number
): number {
  if (!clip || endAt - startAt <= EPSILON) return startAt;
  if (step.mode === 'loop') return startAt;
  if (step.fit !== 'trimStart' && step.fit !== 'alignImpact') return startAt;
  const range = clipRange(step, clip);
  if (!range) return endAt;
  const natural = range.to - range.from;
  if (natural <= EPSILON) return endAt;

  let naturalSpeed = natural / (endAt - startAt);
  if (step.fit === 'alignImpact') {
    const impactTime = clamp(
      clip.markers.impact * clip.duration,
      0,
      clip.duration
    );
    if (impactTime < range.from || impactTime > range.to) {
      naturalSpeed = natural / (endAt - startAt);
    } else {
      naturalSpeed = (impactTime - range.from) / (endAt - startAt);
    }
  }
  if (naturalSpeed >= MIN_PLAYBACK) return startAt;

  const played =
    step.fit === 'alignImpact'
      ? (clamp(clip.markers.impact * clip.duration, 0, clip.duration) -
          range.from) /
        MIN_PLAYBACK
      : natural / MIN_PLAYBACK;
  return Math.max(startAt, endAt - played);
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
    const resolved = resolve(step.clip);
    const clip = resolved?.clip ?? null;
    const startAt = clamp(startTime(step.at, cursor, marks), 0, marks.endAt);

    if (step.fill) {
      const next = script[index + 1];
      const nextResolved = next ? resolve(next.clip) : null;
      const nextClip = nextResolved?.clip ?? null;
      let fillEnd = startAt;
      let filled = false;
      if (
        next &&
        clip &&
        nextClip &&
        clip.animation !== nextClip.animation
      ) {
        const nextStart = fillTargetStart(next, cursor, startAt, marks);
        if (nextStart !== null) {
          const nextEnd = stepEndAt(next, nextClip, nextStart, marks);
          fillEnd = fillEndForNext(next, nextClip, nextStart, nextEnd);
        }
      }
      fillEnd = clamp(fillEnd, startAt, marks.endAt);
      if (clip && fillEnd > startAt) {
        const before = segments.length;
        compileStep(
          segments,
          step,
          clip,
          startAt,
          fillEnd,
          marks.effectAt
        );
        filled = segments.length > before;
      }
      suppressLeadingHold = filled;
      cursor = fillEnd;
      continue;
    }

    const endAt = stepEndAt(step, clip, startAt, marks);
    if (clip) {
      compileStep(
        segments,
        step,
        clip,
        startAt,
        endAt,
        marks.effectAt,
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
    impactClip: impact?.clip ?? null,
    impactTime: impact?.time ?? null
  };
}
