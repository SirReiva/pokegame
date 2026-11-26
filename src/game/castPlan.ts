/**
 * Presentación de un casteo.
 *
 * Cada `AbilityDef` declara un `presentation` (un `AnimationScript`).
 * `buildCastPlan` selecciona el script común o el override de la especie y lo
 * compila a segmentos absolutos con `compileAnimationScript`. El gameplay manda:
 * `startup + active + recovery` es el presupuesto máximo y el script solo
 * coloca clips dentro. Los huecos dejan al cuerpo en su locomoción normal.
 */

import type { AbilityDef } from './abilities';
import { compileAnimationScript } from './animationScript';
import type { AnimationScript } from './core/animationScript';
import type { CastPlan, CastSegment, ClipResolver } from './core/castPlan';

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

/**
 * Tiempo dentro del clip 3D que debe mostrarse en `elapsed` para el segmento.
 *
 * El compilador ya ha resuelto la velocidad y el tramo; aquí solo queda una
 * interpolación lineal (o el módulo del bucle).
 */
export function clipTimeAt(
  segment: CastSegment,
  elapsed: number
): number {
  const local = Math.max(0, elapsed - segment.startAt);
  let clipTime = segment.clipStart + local * segment.speed;
  if (segment.loop) {
    const span = segment.clipEnd - segment.clipStart;
    if (span > EPSILON) {
      clipTime =
        segment.clipStart +
        (((clipTime - segment.clipStart) % span) + span) % span;
    }
  }
  return Math.max(
    segment.clipStart,
    Math.min(segment.clipEnd, clipTime)
  );
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
