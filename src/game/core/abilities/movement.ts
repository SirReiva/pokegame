/**
 * Reglas de movimiento durante un casteo.
 *
 * Los campos aceptan `boolean | number`:
 * - `true`: velocidad normal (multiplicador 1).
 * - `false`: movimiento bloqueado (multiplicador 0).
 * - número: multiplicador de velocidad (`0` bloquea).
 *
 * `movementDuringCast` y `movementUntilEndAnimation` solo intervienen cuando se
 * declaran. Sin declararlos se mantienen las reglas por fase: el `startup` usa
 * `moveWhileStartup`, la ventana activa de las melee bloquea y la recuperación
 * permite moverse.
 */

import type { AbilityDef } from './def';

export type MovementValue = boolean | number;

/** Traduce la declaración a un multiplicador de velocidad. */
export function movementMultiplier(
  value: MovementValue | undefined,
  fallback = 1
): number {
  if (value === undefined) return fallback;
  if (value === true) return 1;
  if (value === false) return 0;
  return Math.max(0, value);
}

/**
 * `true` si la habilidad clava al lanzador durante todo el casteo. Eso la
 * convierte en una canalización: la armadura cubre el casteo completo y
 * cualquier impacto la corta.
 */
export function isChannelingCast(
  def: Pick<AbilityDef, 'movementDuringCast'>
): boolean {
  return (
    def.movementDuringCast !== undefined &&
    movementMultiplier(def.movementDuringCast) <= 0
  );
}

/**
 * `true` si la habilidad declara alguna opción que permita moverse durante el
 * casteo. Sirve a los bots para distinguir las preparaciones que clavan al
 * lanzador de las que lo dejan desplazarse.
 */
export function hasCastMovementOption(
  def: Pick<
    AbilityDef,
    'moveWhileStartup' | 'movementDuringCast' | 'movementUntilEndAnimation'
  >
): boolean {
  return (
    def.movementDuringCast !== undefined ||
    def.movementUntilEndAnimation !== undefined ||
    movementMultiplier(def.moveWhileStartup, 0) > 0
  );
}

/**
 * `true` si el lanzador puede girar el cuerpo durante el casteo. Por defecto el
 * rumbo queda fijado al lanzar; las habilidades que se desplazan mientras se
 * preparan pueden reactivar el giro con `facingDuringCast`.
 */
export function allowsFacingDuringCast(
  def: Pick<AbilityDef, 'facingDuringCast'>
): boolean {
  return def.facingDuringCast === true;
}

export interface CastMovementWindow {
  def: Pick<
    AbilityDef,
    | 'shape'
    | 'startup'
    | 'moveWhileStartup'
    | 'movementDuringCast'
    | 'movementUntilEndAnimation'
  >;
  elapsed: number;
  activeEnd: number;
  animationEndAt: number;
}

/**
 * Multiplicador de velocidad del casteo en el instante actual. `0` significa
 * que el lanzador está clavado. El dash queda fuera de
 * `movementUntilEndAnimation` porque su desplazamiento lo controla el propio
 * dash.
 */
export function castMovementMultiplier(cast: CastMovementWindow): number {
  const { def } = cast;
  if (
    def.shape !== 'dash' &&
    def.movementUntilEndAnimation !== undefined &&
    cast.elapsed < cast.animationEndAt
  ) {
    return movementMultiplier(def.movementUntilEndAnimation);
  }
  if (def.movementDuringCast !== undefined) {
    return movementMultiplier(def.movementDuringCast);
  }
  if (cast.elapsed < def.startup) {
    return movementMultiplier(def.moveWhileStartup);
  }
  if (def.shape === 'melee' && cast.elapsed < cast.activeEnd) return 0;
  return 1;
}
