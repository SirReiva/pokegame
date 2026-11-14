/**
 * Utilidades matemáticas de la IA.
 *
 * Sin estado ni dependencias de PlayCanvas: solo vectores, ángulos y
 * acotaciones que comparten la navegación y el combate.
 */

/** Vector horizontal usado por la navegación y el apuntado. */
export interface Vec2 {
  x: number;
  z: number;
}

export function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function directionTo(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.0001) return { x: 0, z: 0 };
  return { x: dx / length, z: dz / length };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
