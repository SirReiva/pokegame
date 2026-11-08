/**
 * Geometría compartida de las áreas (`shape: 'aoe'`).
 *
 * Un área puede ser un círculo o un cono. En ambos casos el punto `x/z` es el
 * centro de colocación que ya calcula el lanzador (a `range` por delante) y
 * `radius` es:
 * - círculo: radio alrededor de `x/z`.
 * - cono: longitud desde `x/z` hacia delante.
 *
 * El cono usa la misma prueba de sector que el melee, de modo que su borde
 * dibujado coincide con el primer punto de contacto del hurtbox del objetivo.
 * El motor, los bots y los ejecutores comparten estas funciones para que las
 * tres vistas de la geometría no se desincronicen.
 */

import type { AoeShape, AbilityDef } from './abilities';
import { sectorOverlapsCircle } from './combat';
import { DEG } from './config';

/** Área ya resuelta en coordenadas de mundo. */
export interface AoeArea {
  shape: AoeShape;
  /** Centro del círculo o vértice del cono. */
  x: number;
  z: number;
  /** Radio del círculo o longitud del cono. */
  radius: number;
  /** Dirección unitaria del cono (en el círculo no se usa). */
  dirX: number;
  dirZ: number;
  /** Semiángulo del cono en radianes. */
  halfAngle: number;
}

/** Normaliza un vector horizontal; si es nulo devuelve `(0, 1)`. */
function normalize(
  x: number,
  z: number
): { x: number; z: number } {
  const length = Math.hypot(x, z);
  if (length < 0.0001) return { x: 0, z: 1 };
  return { x: x / length, z: z / length };
}

/** Construye la geometría de un área a partir de la definición y su centro. */
export function aoeAreaFrom(
  def: AbilityDef,
  x: number,
  z: number,
  dirX: number,
  dirZ: number
): AoeArea {
  const dir = normalize(dirX, dirZ);
  return {
    shape: def.aoeShape,
    x,
    z,
    radius: def.radius,
    dirX: dir.x,
    dirZ: dir.z,
    halfAngle: def.halfAngle * DEG
  };
}

/**
 * `true` si el hurtbox circular de un objetivo solapa el área.
 *
 * `extra` permite añadir el radio máximo del roster (el mismo padding que usa
 * la telegrafía) sin repetir la suma en cada llamada.
 */
export function aoeContains(
  area: AoeArea,
  targetX: number,
  targetZ: number,
  targetRadius: number,
  extra = 0
): boolean {
  const reach = area.radius + extra;
  if (area.shape === 'circle') {
    return Math.hypot(targetX - area.x, targetZ - area.z) <= reach + targetRadius;
  }
  return sectorOverlapsCircle(
    area.x,
    area.z,
    Math.atan2(area.dirX, area.dirZ),
    area.halfAngle,
    reach,
    targetX,
    targetZ,
    targetRadius
  );
}

/**
 * Distancia desde el centro del círculo o el vértice del cono hasta el punto.
 * Es la distancia que usa el daño radial y la estimación de la IA.
 */
export function aoeDistance(
  area: AoeArea,
  targetX: number,
  targetZ: number
): number {
  return Math.hypot(targetX - area.x, targetZ - area.z);
}
