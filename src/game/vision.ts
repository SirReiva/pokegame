/**
 * Niebla de guerra: rango de visión, ocultación por terreno y línea de visión.
 *
 * Reglas:
 * - Cada Pokémon tiene un rango de visión propio.
 * - El terreno bajo un Pokémon le da una ocultación base (0-1).
 * - El tipo del Pokémon modula esa base reutilizando la relación de
 *   `terrainSpeed.ts`: mismo tipo ×1,5, terreno súper eficaz ×0,5, terreno
 *   resistido o inmune ×1,15, neutro ×1.
 * - Un objetivo se ve si está dentro de `rango × (1 - ocultación)` y no hay una
 *   montaña o un árbol entre medias.
 *
 * El módulo es puro (solo importa tipos de `world.ts`), así que se puede probar
 * sin levantar PlayCanvas.
 */

import { CONFIG } from './config';
import type { TerrainId } from './terrain';
import { terrainTypeRelation, type TerrainRelationReason } from './terrainSpeed';
import type { Collider } from './world';

/**
 * Rango de visión base de cada especie, en unidades de mundo. Los valores están
 * separados a propósito: Mewtwo, Greninja, Mew, Pikachu y Lucario detectan antes
 * por sus sentidos, mientras que Bulbasaur, Onix y Squirtle ven menos. Se ajustan aquí
 * y no en el manifiesto, porque `npm run sprites` lo regenera.
 */
export const POKEMON_VISION: Record<string, number> = {
  '0001': 8.0, // Bulbasaur: bajo, pesado, poca altura de ojos
  '0004': 9.5, // Charmander: la llama de la cola ilumina algo el entorno
  '0007': 8.5, // Squirtle: vista corta pero constante
  '0025': 11.0, // Pikachu: el más alerta, sentidos eléctricos
  '0133': 9.5, // Eevee: olfato y oído finos
  '0448': 10.5, // Lucario: percibe el aura
  '0658': 11.5, // Greninja: instinto de ninja, segundo alcance del grupo
  '0150': 12.0, // Mewtwo: poder psíquico, el que más lejos percibe
  '0151': 11.0, // Mew: sentidos psíquicos y curiosidad infinita
  '0095': 8.8 // Onix: vive bajo tierra, poca luz y vista corta
};

export const DEFAULT_VISION = 9.5;

export function visionForPokemon(id: string): number {
  return POKEMON_VISION[id] ?? DEFAULT_VISION;
}

/**
 * Ocultación base de cada terreno, 0-1. Los carriles, la carretera y las bases
 * no esconden nada; la hierba alta, el bosque umbrío y la ciénaga son los
 * lugares donde más cuesta ver a un Pokémon.
 */
export const TERRAIN_CONCEALMENT: Record<TerrainId, number> = {
  jungle: 0.22,
  lane: 0,
  road: 0,
  sand: 0.08,
  waterLow: 0.1,
  waterHigh: 0.2,
  base: 0,
  tallGrass: 0.45,
  fire: 0.12,
  electric: 0.22,
  ice: 0.14,
  poison: 0.3,
  ghost: 0.4,
  fairy: 0.26,
  desert: 0.14
};

/** Cuánto mejora o empeora la ocultación según la relación tipo-terreno. */
export const CONCEALMENT_TYPE_FACTOR: Record<TerrainRelationReason, number> = {
  home: 1.5,
  hostile: 0.5,
  comfortable: 1.15,
  neutral: 1
};

export interface Concealment {
  /** Ocultación base del terreno (0-1). */
  base: number;
  /** Multiplicador aplicado por los tipos del Pokémon. */
  multiplier: number;
  /** Ocultación final, ya limitada por `CONFIG.vision.maxConcealment`. */
  value: number;
  reason: TerrainRelationReason;
  terrainType: string;
}

/** Ocultación que ofrece un terreno a un Pokémon concreto. */
export function terrainConcealment(
  terrain: TerrainId,
  pokemonTypes: readonly string[]
): Concealment {
  const base = TERRAIN_CONCEALMENT[terrain];
  const relation = terrainTypeRelation(terrain, pokemonTypes);
  const multiplier = CONCEALMENT_TYPE_FACTOR[relation.reason];
  return {
    base,
    multiplier,
    value: Math.min(CONFIG.vision.maxConcealment, Math.max(0, base * multiplier)),
    reason: relation.reason,
    terrainType: relation.terrainType
  };
}

/** Radio al que un observador detecta a un objetivo con esta ocultación. */
export function effectiveVisionRange(visionRange: number, concealment: number): number {
  return Math.max(0, visionRange * (1 - concealment));
}

function pointSegmentDistanceSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq > 0
      ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / lengthSq))
      : 0;
  const cx = ax + dx * t;
  const cz = az + dz * t;
  const ox = px - cx;
  const oz = pz - cz;
  return ox * ox + oz * oz;
}

function orientation(ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
}

function pointOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): boolean {
  return (
    px >= Math.min(ax, bx) &&
    px <= Math.max(ax, bx) &&
    pz >= Math.min(az, bz) &&
    pz <= Math.max(az, bz)
  );
}

function segmentsCross(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number
): boolean {
  const o1 = orientation(ax, az, bx, bz, cx, cz);
  const o2 = orientation(ax, az, bx, bz, dx, dz);
  const o3 = orientation(cx, cz, dx, dz, ax, az);
  const o4 = orientation(cx, cz, dx, dz, bx, bz);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  // Casos colineales: solo cuentan si los segmentos se solapan de verdad. Sin
  // esta comprobación, una mirada paralela a una cordillera lejana se tomaría
  // como bloqueada.
  if (o1 === 0 && pointOnSegment(cx, cz, ax, az, bx, bz)) return true;
  if (o2 === 0 && pointOnSegment(dx, dz, ax, az, bx, bz)) return true;
  if (o3 === 0 && pointOnSegment(ax, az, cx, cz, dx, dz)) return true;
  if (o4 === 0 && pointOnSegment(bx, bz, cx, cz, dx, dz)) return true;
  return false;
}

function segmentSegmentDistanceSq(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number
): number {
  if (segmentsCross(ax, az, bx, bz, cx, cz, dx, dz)) return 0;
  return Math.min(
    pointSegmentDistanceSq(ax, az, cx, cz, dx, dz),
    pointSegmentDistanceSq(bx, bz, cx, cz, dx, dz),
    pointSegmentDistanceSq(cx, cz, ax, az, bx, bz),
    pointSegmentDistanceSq(dx, dz, ax, az, bx, bz)
  );
}

/**
 * ¿Hay una montaña o un árbol entre `a` y `b`? Solo los colliders con
 * `sightRadius` bloquean la visión; las rocas bajas, los cactus y los adornos
 * de las bases no cuentan. El radio de visión de los árboles es mayor que el de
 * colisión para cubrir la copa, no solo el tronco.
 */
export function lineOfSightBlocked(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  colliders: readonly Collider[]
): boolean {
  for (const collider of colliders) {
    const sightRadius = collider.sightRadius;
    if (sightRadius === undefined) continue;

    if (collider.type === 'circle') {
      // Si el observador está dentro de la copa, no se deja cegar por el árbol
      // que tiene encima: debe poder ver hacia fuera.
      if (Math.hypot(ax - collider.x, az - collider.z) < sightRadius) continue;
      if (
        pointSegmentDistanceSq(collider.x, collider.z, ax, az, bx, bz) <=
        sightRadius * sightRadius
      ) {
        return true;
      }
    } else {
      // Mismo caso para una cordillera: si el observador está pegado a su
      // radio de visión, la cresta no le tapa todo el horizonte.
      if (
        pointSegmentDistanceSq(ax, az, collider.ax, collider.az, collider.bx, collider.bz) <
        sightRadius * sightRadius
      ) {
        continue;
      }
      if (
        segmentSegmentDistanceSq(
          ax,
          az,
          bx,
          bz,
          collider.ax,
          collider.az,
          collider.bx,
          collider.bz
        ) <=
        sightRadius * sightRadius
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Visibilidad binaria de un objetivo. La histéresis evita que un Pokémon
 * parpadee justo en el borde del radio cuando se mueve o cuando la cámara
 * redondea la distancia; sigue habiendo solo dos estados.
 */
export function isTargetVisible(
  observer: { x: number; z: number; visionRange: number },
  target: { x: number; z: number },
  targetConcealment: number,
  colliders: readonly Collider[],
  alreadyVisible = false
): boolean {
  const distance = Math.hypot(target.x - observer.x, target.z - observer.z);
  const effective = effectiveVisionRange(observer.visionRange, targetConcealment);
  const limit = alreadyVisible ? effective + CONFIG.vision.hysteresis : effective;
  if (distance > limit) return false;
  return !lineOfSightBlocked(observer.x, observer.z, target.x, target.z, colliders);
}

/** Etiqueta corta de la relación, para el HUD. */
export const CONCEALMENT_REASON_LABEL: Record<TerrainRelationReason, string> = {
  home: 'afín',
  hostile: 'expuesto',
  comfortable: 'cómodo',
  neutral: 'neutro'
};
