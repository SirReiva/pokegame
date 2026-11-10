/**
 * Plan de presentación de un casteo.
 *
 * El gameplay define `startup`, `active` y `recovery` en `AbilityDef`. Este
 * módulo traduce esas ventanas a segmentos de clip: qué tramo de frames se
 * reproduce en cada fase y a qué velocidad. El `HitFrame` del clip se usa como
 * ancla para que el frame de impacto/lanzamiento caiga exactamente en
 * `startup`, sin importar cómo esté dibujada la especie.
 *
 * Reglas:
 * - Si el clip es demasiado largo para la ventana, se recortan frames (inicio
 *   en el lead, final en active/recovery) antes que deformar la animación.
 * - Si el clip es demasiado corto, el lead se retrasa y active/recovery
 *   mantienen la pose o vuelven a idle.
 * - El playback se limita a `[MIN_PLAYBACK, MAX_PLAYBACK]`.
 */

import type { AbilityDef } from './abilities';
import {
  MAX_PLAYBACK,
  MIN_PLAYBACK,
  clipDuration,
  clipTiming,
  frameAtTime,
  frameStart
} from './animationTimeline.ts';
import type {
  AnimationName,
  ResolvedAnimation,
  SpriteAnimation
} from './types';

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
   * `blockMovementUntilEndAnimation` lo usa como fin del bloqueo de movimiento.
   */
  animationEndAt: number;
  /** Frame de impacto del clip de lanzamiento, para depuración. */
  hitFrame: number | null;
  /** Clip de lanzamiento resuelto, para depuración. */
  hitClip: AnimationName | null;
}

const EPSILON = 1e-6;

function lastFrame(animation: ResolvedAnimation): number {
  return Math.max(0, animation.animation.durations.length - 1);
}

function holdSegment(
  segments: CastSegment[],
  animation: ResolvedAnimation,
  frame: number,
  startAt: number,
  endAt: number
): void {
  const from = Math.max(0, startAt);
  const to = Math.max(from, endAt);
  if (to - from <= EPSILON) return;
  segments.push({
    animation: animation.name,
    startFrame: frame,
    endFrame: frame,
    startAt: from,
    endAt: to,
    playback: 1,
    clipStartAt: frameStart(animation.animation, frame),
    loop: false
  });
}

/** Reproduce un clip completo dentro de una ventana, recortando o reteniendo. */
function addFixedClip(
  segments: CastSegment[],
  animation: ResolvedAnimation,
  startAt: number,
  endAt: number,
  options: { loop: boolean; speed?: number; holdEnd: boolean }
): void {
  const window = endAt - startAt;
  if (window <= EPSILON) return;
  const last = lastFrame(animation);
  if (options.loop) {
    segments.push({
      animation: animation.name,
      startFrame: 0,
      endFrame: last,
      startAt,
      endAt,
      playback: Math.max(0.05, options.speed ?? 1),
      clipStartAt: 0,
      loop: true
    });
    return;
  }

  const natural = clipDuration(animation.animation);
  if (natural <= EPSILON) return;
  let playback = natural / window;
  let endFrame = last;
  let segmentEnd = endAt;

  if (playback > MAX_PLAYBACK) {
    // El clip es más largo que la ventana: se recorta el final.
    playback = MAX_PLAYBACK;
    const visible = window * MAX_PLAYBACK;
    endFrame = frameAtTime(animation.animation, Math.max(0, visible - EPSILON));
  } else if (playback < MIN_PLAYBACK) {
    // El clip es más corto que la ventana: se reproduce y, si se pide, se
    // mantiene el último frame hasta el final.
    playback = MIN_PLAYBACK;
    segmentEnd = Math.min(endAt, startAt + natural / MIN_PLAYBACK);
    if (options.holdEnd && segmentEnd < endAt - EPSILON) {
      holdSegment(segments, animation, last, segmentEnd, endAt);
    }
  }

  segments.push({
    animation: animation.name,
    startFrame: 0,
    endFrame,
    startAt,
    endAt: segmentEnd,
    playback,
    clipStartAt: 0,
    loop: false
  });
}

interface LeadPlan {
  /** `false` cuando no queda tiempo para mostrar anticipación. */
  hasLead: boolean;
  startFrame: number;
  startAt: number;
  playback: number;
}

/**
 * Calcula el tramo del clip que va desde un frame inicial hasta el `HitFrame`,
 * de forma que el impacto caiga en `effectAt`.
 */
function planLead(
  animation: ResolvedAnimation,
  hitAt: number,
  hitFrame: number,
  effectAt: number
): LeadPlan {
  if (effectAt <= EPSILON || hitAt <= EPSILON) {
    return { hasLead: false, startFrame: hitFrame, startAt: effectAt, playback: 1 };
  }
  const natural = hitAt;
  const playback = natural / effectAt;

  if (playback > MAX_PLAYBACK) {
    // Se recorta el inicio: primer frame cuyo inicio deje un tramo que quepa
    // en `effectAt` a MAX_PLAYBACK.
    const minimumStart = natural - effectAt * MAX_PLAYBACK;
    let startFrame = 0;
    while (
      startFrame < hitFrame &&
      frameStart(animation.animation, startFrame) < minimumStart
    ) {
      startFrame++;
    }
    const remaining = natural - frameStart(animation.animation, startFrame);
    if (remaining <= EPSILON) {
      return { hasLead: false, startFrame: hitFrame, startAt: effectAt, playback: 1 };
    }
    return {
      hasLead: true,
      startFrame,
      startAt: 0,
      playback: Math.min(MAX_PLAYBACK, Math.max(MIN_PLAYBACK, remaining / effectAt))
    };
  }

  if (playback < MIN_PLAYBACK) {
    // Se retrasa el inicio y se rellena el hueco con la carga o una pose.
    return {
      hasLead: true,
      startFrame: 0,
      startAt: effectAt - natural / MIN_PLAYBACK,
      playback: MIN_PLAYBACK
    };
  }

  return { hasLead: true, startFrame: 0, startAt: 0, playback };
}

interface RangeOptions {
  /** Recorta frames del inicio (lead) en vez del final. */
  trimStart?: boolean;
  /** Recorta frames del final (active/recovery). */
  trimEnd?: boolean;
  /** Mantiene el último frame si el clip es más corto que la ventana. */
  holdEnd?: boolean;
}

/** Reproduce el tramo de clip `[clipFrom, clipTo]` dentro de `[startAt, endAt]`. */
function addRange(
  segments: CastSegment[],
  animation: ResolvedAnimation,
  clipFrom: number,
  clipTo: number,
  startAt: number,
  endAt: number,
  options: RangeOptions = {}
): void {
  const window = endAt - startAt;
  if (window <= EPSILON) return;
  const natural = clipTo - clipFrom;
  if (natural <= EPSILON) {
    if (options.holdEnd) {
      holdSegment(
        segments,
        animation,
        frameAtTime(animation.animation, clipFrom),
        startAt,
        endAt
      );
    }
    return;
  }

  let from = clipFrom;
  let to = clipTo;
  let playback = natural / window;

  if (playback > MAX_PLAYBACK) {
    if (options.trimStart) {
      const minimumStart = clipTo - window * MAX_PLAYBACK;
      let frame = frameAtTime(animation.animation, from);
      while (
        frame < lastFrame(animation) &&
        frameStart(animation.animation, frame) < minimumStart
      ) {
        frame++;
      }
      from = frameStart(animation.animation, frame);
      playback = (clipTo - from) / window;
    } else {
      playback = MAX_PLAYBACK;
      const visible = window * MAX_PLAYBACK;
      to = from + visible;
    }
  }

  let segmentEnd = endAt;
  if (playback < MIN_PLAYBACK) {
    playback = MIN_PLAYBACK;
    segmentEnd = Math.min(endAt, startAt + (to - from) / MIN_PLAYBACK);
    if (options.holdEnd && segmentEnd < endAt - EPSILON) {
      holdSegment(
        segments,
        animation,
        frameAtTime(animation.animation, Math.max(from, to - EPSILON)),
        segmentEnd,
        endAt
      );
    }
  }

  playback = Math.max(MIN_PLAYBACK, Math.min(MAX_PLAYBACK, playback));
  const startFrame = frameAtTime(animation.animation, from);
  const endFrame = frameAtTime(animation.animation, Math.max(from, to - EPSILON));
  if (endFrame < startFrame) return;
  segments.push({
    animation: animation.name,
    startFrame,
    endFrame,
    startAt,
    endAt: segmentEnd,
    playback,
    clipStartAt: frameStart(animation.animation, startFrame),
    loop: false
  });
}

function addStartupFill(
  segments: CastSegment[],
  def: AbilityDef,
  startup: ResolvedAnimation | null,
  release: ResolvedAnimation,
  lead: LeadPlan,
  effectAt: number
): void {
  if (!lead.hasLead) {
    // Sin anticipación: si hay una carga propia, ocupa todo el startup; si no,
    // se deja el reposo (no se congela la pose de impacto antes del efecto).
    if (startup && startup.name !== release.name && effectAt > EPSILON) {
      addFixedClip(segments, startup, 0, effectAt, {
        loop: def.startupAnimationMode === 'loop',
        speed: def.startupAnimationSpeed,
        holdEnd: true
      });
    }
    return;
  }
  if (lead.startAt <= EPSILON) return;
  if (startup && startup.name !== release.name) {
    addFixedClip(segments, startup, 0, lead.startAt, {
      loop: def.startupAnimationMode === 'loop',
      speed: def.startupAnimationSpeed,
      holdEnd: true
    });
    return;
  }
  // Mismo clip (o sin carga): se mantiene la primera pose del lead hasta que
  // arranca la anticipación. Evita repetir el clip dos veces.
  holdSegment(segments, release, lead.startFrame, 0, lead.startAt);
}

/**
 * Instante en el que termina de dibujarse el clip de lanzamiento. Se toma el
 * final del último segmento posterior al efecto que usa ese clip; si el plan lo
 * recorta, coincide con el final de la parte visible. Sin clip de lanzamiento
 * se devuelve el fin del casteo como respaldo.
 */
function planAnimationEndAt(
  segments: readonly CastSegment[],
  release: ResolvedAnimation,
  effectAt: number,
  fallback: number
): number {
  let end = -1;
  for (const segment of segments) {
    if (segment.animation !== release.name) continue;
    // La anticipación termina en el efecto: solo cuenta lo que se dibuja
    // después del golpe/lanzamiento.
    if (segment.endAt <= effectAt + EPSILON) continue;
    end = Math.max(end, segment.endAt);
  }
  return end >= 0 ? end : fallback;
}

export function buildCastPlan(
  def: AbilityDef,
  resolve: ClipResolver
): CastPlan {
  const effectAt = Math.max(0, def.startup);
  const activeEnd = effectAt + Math.max(0, def.active);
  const endAt = activeEnd + Math.max(0, def.recovery);
  const segments: CastSegment[] = [];

  const release = def.animation ? resolve(def.animation) : null;
  const startup = def.startupAnimation
    ? resolve(def.startupAnimation)
    : null;

  // Sin animación de lanzamiento: si la carga es de un solo uso, se trata como
  // clip de lanzamiento (su HitFrame se ancla al efecto). Si es en bucle, se
  // reproduce durante todo el startup y el efecto no tiene animación propia.
  if (!release) {
    if (startup && def.startupAnimationMode === 'loop') {
      if (effectAt > EPSILON) {
        addFixedClip(segments, startup, 0, effectAt, {
          loop: true,
          speed: def.startupAnimationSpeed,
          holdEnd: true
        });
      }
      return {
        segments,
        effectAt,
        activeEnd,
        endAt,
        animationEndAt: endAt,
        hitFrame: null,
        hitClip: null
      };
    }
    if (!startup) {
      return {
        segments,
        effectAt,
        activeEnd,
        endAt,
        animationEndAt: endAt,
        hitFrame: null,
        hitClip: null
      };
    }
  }

  // A partir de aquí siempre hay un clip de lanzamiento: el propio `animation`
  // o, si falta, la carga `once`.
  const releaseClip = (release ?? startup) as ResolvedAnimation;
  const timing = clipTiming(releaseClip.animation);

  // El dash no tiene un instante de golpe: el clip completo acompaña al
  // desplazamiento activo. El startup, si lo hay, se rellena aparte.
  if (def.shape === 'dash') {
    if (effectAt > EPSILON) {
      if (startup) {
        addFixedClip(segments, startup, 0, effectAt, {
          loop: def.startupAnimationMode === 'loop',
          speed: def.startupAnimationSpeed,
          holdEnd: true
        });
      }
    }
    addFixedClip(segments, releaseClip, effectAt, activeEnd, {
      loop: false,
      holdEnd: true
    });
    segments.sort((a, b) => a.startAt - b.startAt);
    return {
      segments,
      effectAt,
      activeEnd,
      endAt,
      animationEndAt: planAnimationEndAt(
        segments,
        releaseClip,
        effectAt,
        endAt
      ),
      hitFrame: timing.hitFrame,
      hitClip: releaseClip.name
    };
  }

  const lead = planLead(
    releaseClip,
    timing.hitAt,
    timing.hitFrame,
    effectAt
  );
  addStartupFill(segments, def, startup, releaseClip, lead, effectAt);

  // Anticipación: desde `startFrame` hasta el HitFrame.
  if (lead.startFrame < timing.hitFrame && effectAt - lead.startAt > EPSILON) {
    const from = frameStart(releaseClip.animation, lead.startFrame);
    addRange(
      segments,
      releaseClip,
      from,
      timing.hitAt,
      lead.startAt,
      effectAt,
      { trimStart: true }
    );
  }

  // Ventana activa: contacto → inicio de vuelta.
  if (activeEnd - effectAt > EPSILON) {
    if (timing.returnAt > timing.hitAt + EPSILON) {
      addRange(
        segments,
        releaseClip,
        timing.hitAt,
        timing.returnAt,
        effectAt,
        activeEnd,
        { trimEnd: true, holdEnd: true }
      );
    } else {
      holdSegment(
        segments,
        releaseClip,
        timing.hitFrame,
        effectAt,
        activeEnd
      );
    }
  }

  // Recuperación: inicio de vuelta → final del clip. Si el clip no llega, el
  // motor vuelve a idle al terminar el último segmento.
  if (endAt - activeEnd > EPSILON) {
    const recoveryFrom = activeEnd;
    const recoveryClipFrom =
      activeEnd - effectAt > EPSILON ? timing.returnAt : timing.hitAt;
    if (recoveryClipFrom < timing.duration - EPSILON) {
      addRange(
        segments,
        releaseClip,
        recoveryClipFrom,
        timing.duration,
        recoveryFrom,
        endAt,
        { trimEnd: true, holdEnd: false }
      );
    }
  }

  segments.sort((a, b) => a.startAt - b.startAt);
  return {
    segments,
    effectAt,
    activeEnd,
    endAt,
    animationEndAt: planAnimationEndAt(
      segments,
      releaseClip,
      effectAt,
      endAt
    ),
    hitFrame: timing.hitFrame,
    hitClip: releaseClip.name
  };
}

/** Frame del clip que debe mostrarse en `elapsed` para el plan. */
export function frameForSegment(
  segment: CastSegment,
  animation: SpriteAnimation,
  elapsed: number
): number {
  const local = Math.max(0, elapsed - segment.startAt);
  let clipTime = segment.clipStartAt + local * segment.playback;
  if (segment.loop) {
    const duration = clipDuration(animation);
    if (duration > EPSILON) clipTime %= duration;
  }
  const frame = frameAtTime(animation, clipTime);
  return Math.max(segment.startFrame, Math.min(segment.endFrame, frame));
}

/** Segmento que cubre `elapsed`, o `null` si el plan está en un hueco. */
export function segmentAt(plan: CastPlan, elapsed: number): CastSegment | null {
  for (const segment of plan.segments) {
    if (elapsed >= segment.startAt && elapsed < segment.endAt) return segment;
  }
  return null;
}
