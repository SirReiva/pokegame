/**
 * Presentación de un casteo.
 *
 * Cada `AbilityDef` declara un `presentation` (un `AnimationScript`).
 * `buildCastPlan` selecciona el script común o el override de la especie y lo
 * compila a segmentos absolutos con `compileAnimationScript`. El gameplay manda:
 * `startup + active + recovery` es el presupuesto máximo y el script solo
 * coloca clips dentro. Los huecos dejan al sprite en su estado normal.
 */

import type { AbilityDef } from './abilities';
import { frameAtTime, frameBoundary, frameStart } from './animationTimeline.ts';
import { compileAnimationScript } from './animationScript';
import type { AnimationScript } from './core/animationScript';
import type { CastPlan, CastSegment, ClipResolver } from './core/castPlan';
import type { SpriteAnimation } from './types';

export type { CastPlan, CastSegment, ClipResolver } from './core/castPlan';

const EPSILON = 1e-6;

/** Script por especie para una habilidad; el override reemplaza al común. */
export function animationScriptFor(
  def: Pick<AbilityDef, 'presentation' | 'presentationBySpecies'>,
  speciesId?: string
): AnimationScript {
  if (speciesId) {
    const override = def.presentationBySpecies?.[speciesId];
    if (override) return override;
  }
  return def.presentation;
}

/**
 * Compila el timeline de la habilidad dentro de sus tiempos de gameplay.
 */
export function buildCastPlan(
  def: AbilityDef,
  resolve: ClipResolver,
  speciesId?: string
): CastPlan {
  return compileAnimationScript(
    animationScriptFor(def, speciesId),
    def,
    resolve
  );
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
    // El bucle respeta el tramo del segmento. Antes solo se usaba el clip
    // completo, así que un `charge` con `from`/`to` recortados se quedaba
    // clavado en los bordes.
    const from = frameStart(animation, segment.startFrame);
    const to = frameBoundary(animation, segment.endFrame + 1);
    const span = to - from;
    if (span > EPSILON) {
      clipTime = from + (((clipTime - from) % span) + span) % span;
    }
  }
  const frame = frameAtTime(animation, clipTime);
  return Math.max(segment.startFrame, Math.min(segment.endFrame, frame));
}

/** Segmento que cubre `elapsed`, o `null` si el plan está en un hueco. */
export function segmentAt(
  plan: CastPlan,
  elapsed: number
): CastSegment | null {
  for (const segment of plan.segments) {
    if (elapsed >= segment.startAt && elapsed < segment.endAt) return segment;
  }
  return null;
}
