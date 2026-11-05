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
 * separados a propósito: las aves y bestias legendarias, Mewtwo, Mew, Greninja,
 * Pikachu, Scyther y Lucario detectan antes por sus sentidos, mientras que
 * Bulbasaur, Onix y Squirtle ven menos. Se ajustan aquí
 * y no en el manifiesto, porque `pnpm sprites` lo regenera.
 */
export const POKEMON_VISION: Record<string, number> = {
  '0001': 8.8, // Bulbasaur: bajo, pesado, poca altura de ojos
  '0004': 9.5, // Charmander: la llama de la cola ilumina algo el entorno
  '0007': 9.2, // Squirtle: vista corta pero constante
  '0025': 11.0, // Pikachu: el más alerta, sentidos eléctricos
  '0094': 10.8, // Gengar: ve en la oscuridad y siente el miedo cercano
  '0100': 9.5, // Voltorb: rueda sin ojos, pero detecta la electricidad cercana
  '0133': 9.5, // Eevee: olfato y oído finos
  '0448': 10.5, // Lucario: percibe el aura
  '0658': 11.5, // Greninja: instinto de ninja, alcance notable
  '0150': 12.0, // Mewtwo: poder psíquico, alcance excepcional
  '0151': 11.0, // Mew: sentidos psíquicos y curiosidad infinita
  '0095': 8.8, // Onix: vive bajo tierra, poca luz y vista corta
  '0123': 10.8, // Scyther: ojos de depredador y reflejos de mantis
  '0248': 9.6, // Tyranitar: vista de depredador nocturno, pero poca altura de ojos
  '0144': 11.6, // Articuno: ojo de ave rapaz sobre el hielo
  '0145': 11.8, // Zapdos: percibe la electricidad del aire a distancia
  '0146': 11.5, // Moltres: la luz de sus llamas le abre el horizonte
  '0243': 11.9, // Raikou: percibe las tormentas antes de que lleguen
  '0244': 11.4, // Entei: su fuego ilumina y atemoriza a distancia
  '0245': 11.6, // Suicune: vigila y purifica las aguas a su paso
  '0249': 12.4, // Lugia: guardián de los mares, el que más lejos percibe
  '0250': 11.9, // Ho-Oh: vista larga desde las alturas
  '0251': 11.7, // Celebi: siente el bosque y el tiempo a su alrededor
  '0383': 10.6 // Groudon: siente las vibraciones del suelo, pero su altura le limita
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
 *
 * Un oclusor solo tapa si está realmente *entre* los dos puntos. Si cualquiera
 * de los extremos está dentro del volumen del oclusor (debajo de una copa, pegado
 * a una cresta), el segmento lo atraviesa en su extremo, no por el medio: el
 * Pokémon está delante del obstáculo, no detrás. Sin esta comprobación, dos
 * Pokémon que se refugian junto a un árbol o una cordillera se volvían
 * invisibles entre sí aunque la niebla pintara su zona como despejada.
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
    const radiusSq = sightRadius * sightRadius;

    if (collider.type === 'circle') {
      // Si el observador o el objetivo están dentro de la copa, el árbol no
      // queda entre ellos: no se deja cegar al que lo tiene encima ni se oculta
      // al que está de pie bajo sus hojas.
      if (Math.hypot(ax - collider.x, az - collider.z) < sightRadius) continue;
      if (Math.hypot(bx - collider.x, bz - collider.z) < sightRadius) continue;
      if (
        pointSegmentDistanceSq(collider.x, collider.z, ax, az, bx, bz) <= radiusSq
      ) {
        return true;
      }
    } else {
      // Mismo caso para una cordillera: si cualquiera de los extremos está
      // pegado a su radio de visión, la cresta no tapa el horizonte entre ellos.
      if (
        pointSegmentDistanceSq(ax, az, collider.ax, collider.az, collider.bx, collider.bz) <
        radiusSq
      ) {
        continue;
      }
      if (
        pointSegmentDistanceSq(bx, bz, collider.ax, collider.az, collider.bx, collider.bz) <
        radiusSq
      ) {
        continue;
      }
      // Si ambos puntos están del mismo lado de la cresta, la cresta no queda
      // entre ellos: puede pasar cerca de su volumen de visión (por ejemplo, al
      // correr junto a un muro) sin taparlos. Solo bloquea cuando los separa.
      const sideA = orientation(
        collider.ax,
        collider.az,
        collider.bx,
        collider.bz,
        ax,
        az
      );
      const sideB = orientation(
        collider.ax,
        collider.az,
        collider.bx,
        collider.bz,
        bx,
        bz
      );
      if (sideA * sideB > 0) continue;
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
        radiusSq
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
