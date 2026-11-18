/**
 * Geometría compartida de las áreas (`shape: 'aoe'`).
 *
 * Un área puede ser un círculo, un patrón de varios círculos o un cono. En
 * todos los casos el punto `x/z` es el centro de colocación que ya calcula el
 * lanzador (a `range` por delante) y `radius` es:
 * - círculo: radio por defecto de los círculos.
 * - cono: longitud desde `x/z` hacia delante.
 *
 * Un área circular puede declarar `aoeCircles`: una lista de círculos con
 * desplazamiento relativo al centro. El motor los rota con la dirección del
 * lanzamiento, así que el patrón gira con el apuntado. `aoeContains` y
 * `aoeDistance` operan sobre la unión de círculos, de modo que el daño, los
 * bots y la navegación no necesitan saber cuántos hay.
 *
 * El cono usa la misma prueba de sector que el melee, de modo que su borde
 * dibujado coincide con el primer punto de contacto del hurtbox del objetivo.
 * El motor, los bots y los ejecutores comparten estas funciones para que las
 * tres vistas de la geometría no se desincronicen.
 */

import type { AoeAbilityDef, AoeShape } from './abilities';
import { sectorOverlapsCircle } from './combat';
import { DEG } from './config';
import { maxHitRadius } from './roster';

/** Círculo de un área, ya resuelto en coordenadas de mundo. */
export interface AoeCircle {
  x: number;
  z: number;
  radius: number;
}

/** Área ya resuelta en coordenadas de mundo. */
export interface AoeArea {
  shape: AoeShape;
  /** Centro de colocación del área o vértice del cono. */
  x: number;
  z: number;
  /** Radio por defecto de los círculos o longitud del cono. */
  radius: number;
  /** Dirección unitaria del cono o eje del patrón (en el círculo no se usa). */
  dirX: number;
  dirZ: number;
  /** Semiángulo del cono en radianes. */
  halfAngle: number;
  /**
   * Círculos que forman el área. En los conos queda vacío; en los círculos
   * siempre tiene al menos un elemento.
   */
  circles: readonly AoeCircle[];
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

/**
 * Rellena `out` con los círculos del área en coordenadas de mundo, reutilizando
 * los objetos del array. Los desplazamientos se rotan con la dirección:
 * `offsetX` va hacia la derecha del lanzamiento y `offsetZ` hacia delante. Sin
 * `aoeCircles` deja el círculo único centrado en el área.
 *
 * `offset` permite escribir un patrón detrás de otro en el mismo array; con
 * `offset: 0` recorta la longitud al número de círculos escritos.
 *
 * La variante con buffer la usan los bots: `buildBotHazards` recalcula el
 * patrón en cada paso y no debe asignar memoria por área.
 */
export function writeAoeCircles(
  def: AoeAbilityDef,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  out: AoeCircle[],
  offset = 0
): AoeCircle[] {
  const dir = normalize(dirX, dirZ);
  const specs = def.aoeCircles ?? [];
  const count = Math.max(1, specs.length);
  // Derecha del lanzamiento: (dirZ, -dirX).
  const rightX = dir.z;
  const rightZ = -dir.x;
  for (let index = 0; index < count; index++) {
    const slot = offset + index;
    const spec = specs[index];
    const circle = out[slot] ?? (out[slot] = { x: 0, z: 0, radius: 0 });
    if (spec) {
      circle.x = x + rightX * spec.offsetX + dir.x * spec.offsetZ;
      circle.z = z + rightZ * spec.offsetX + dir.z * spec.offsetZ;
      circle.radius = spec.radius ?? def.radius;
    } else {
      circle.x = x;
      circle.z = z;
      circle.radius = def.radius;
    }
  }
  if (offset === 0) out.length = count;
  return out;
}

/** Círculos del área en coordenadas de mundo (array nuevo). */
export function aoeCirclesFrom(
  def: AoeAbilityDef,
  x: number,
  z: number,
  dirX: number,
  dirZ: number
): AoeCircle[] {
  return writeAoeCircles(def, x, z, dirX, dirZ, []);
}

/** Construye la geometría de un área a partir de la definición y su centro. */
export function aoeAreaFrom(
  def: AoeAbilityDef,
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
    halfAngle: def.halfAngle * DEG,
    circles:
      def.aoeShape === 'circle' ? aoeCirclesFrom(def, x, z, dir.x, dir.z) : []
  };
}

/**
 * Padding de hurtbox que suma el golpe de un área. Los patrones de círculos se
 * dibujan a su radio exacto, así que no suman el mayor hurtbox del roster: solo
 * el cuerpo del objetivo puede entrar desde el borde. El resto de áreas sí lo
 * suman para que el aro marque el límite real de golpe.
 */
export function aoeHitPadding(def: AoeAbilityDef): number {
  return def.aoeCircles.length > 0 ? 0 : maxHitRadius();
}

/**
 * `true` si el hurtbox circular de un objetivo solapa el área.
 *
 * En los círculos comprueba la unión; en los conos, el sector.
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
  if (area.shape === 'circle') {
    if (area.circles.length === 0) {
      return (
        Math.hypot(targetX - area.x, targetZ - area.z) <=
        area.radius + extra + targetRadius
      );
    }
    for (const circle of area.circles) {
      const reach = circle.radius + extra + targetRadius;
      if (Math.hypot(targetX - circle.x, targetZ - circle.z) <= reach) {
        return true;
      }
    }
    return false;
  }
  return sectorOverlapsCircle(
    area.x,
    area.z,
    Math.atan2(area.dirX, area.dirZ),
    area.halfAngle,
    area.radius + extra,
    targetX,
    targetZ,
    targetRadius
  );
}

/**
 * Distancia al círculo más cercano (o al vértice del cono). Es la distancia que
 * usan el daño radial y la estimación de la IA.
 */
export function aoeDistance(
  area: AoeArea,
  targetX: number,
  targetZ: number
): number {
  if (area.shape === 'circle' && area.circles.length > 0) {
    let best = Infinity;
    for (const circle of area.circles) {
      const distance = Math.hypot(targetX - circle.x, targetZ - circle.z);
      if (distance < best) best = distance;
    }
    return best;
  }
  return Math.hypot(targetX - area.x, targetZ - area.z);
}

/**
 * Distancia normalizada (`0` en el centro, `1` en el borde) que usa el daño
 * radial. En un patrón se toma el círculo que deja al objetivo más cerca de su
 * centro en proporción a su radio: cada impacto tiene su propia caída. Sin
 * círculos (los conos) se mide desde el vértice y la longitud del área.
 */
export function aoeRadialFalloff(
  area: AoeArea,
  targetX: number,
  targetZ: number
): number {
  if (area.circles.length === 0) {
    return clamp01(
      Math.hypot(targetX - area.x, targetZ - area.z) /
        Math.max(0.001, area.radius)
    );
  }
  let best = Infinity;
  for (const circle of area.circles) {
    const t =
      Math.hypot(targetX - circle.x, targetZ - circle.z) /
      Math.max(0.001, circle.radius);
    if (t < best) best = t;
  }
  return clamp01(best);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
