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
import { POKEDEX_PROFILES } from './core/pokedex';
import type { TerrainId } from './terrain';
import { terrainTypeRelation, type TerrainRelationReason } from './terrainSpeed';
import type { Collider } from './world';

/**
 * Rango de visión base de cada especie, en unidades de mundo. La fuente es
 * `POKEDEX_PROFILES.vision`; VIS forma parte de las siete estadísticas del
 * rediseño y no se duplica aquí.
 */
export const DEFAULT_VISION = 9.5;

export function visionForPokemon(id: string): number {
  return POKEDEX_PROFILES[id]?.vision ?? DEFAULT_VISION;
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
  desert: 0.14,
  park: 0.05,
  // Los santuarios de equipo son suelo abierto: no ocultan.
  teamRed: 0,
  teamBlue: 0,
  teamYellow: 0,
  teamGreen: 0
};

/** Cuánto mejora o empeora la ocultación según la relación tipo-terreno. */
export const CONCEALMENT_TYPE_FACTOR: Record<TerrainRelationReason, number> = {
  home: 1.5,
  hostile: 0.5,
  comfortable: 1.15,
  neutral: 1
};

import type { Concealment } from './core/vision';

export type { Concealment } from './core/vision';

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
 * Comprueba un único oclusor. Está separado para que tanto el recorrido lineal
 * como el indexado por rejilla compartan exactamente la misma geometría.
 */
function blocksSight(
  collider: Collider,
  ax: number,
  az: number,
  bx: number,
  bz: number
): boolean {
  const sightRadius = collider.sightRadius;
  if (sightRadius === undefined) return false;
  const radiusSq = sightRadius * sightRadius;

  if (collider.type === 'circle') {
    // Si el observador o el objetivo están dentro de la copa, el árbol no
    // queda entre ellos: no se deja cegar al que lo tiene encima ni se oculta
    // al que está de pie bajo sus hojas. Se compara al cuadrado para no pagar
    // una raíz por cada extremo y cada oclusor.
    const axOff = ax - collider.x;
    const azOff = az - collider.z;
    if (axOff * axOff + azOff * azOff < radiusSq) return false;
    const bxOff = bx - collider.x;
    const bzOff = bz - collider.z;
    if (bxOff * bxOff + bzOff * bzOff < radiusSq) return false;
    return pointSegmentDistanceSq(collider.x, collider.z, ax, az, bx, bz) <= radiusSq;
  }

  // Mismo caso para una cordillera: si cualquiera de los extremos está pegado
  // a su radio de visión, la cresta no tapa el horizonte entre ellos.
  if (
    pointSegmentDistanceSq(ax, az, collider.ax, collider.az, collider.bx, collider.bz) <
    radiusSq
  ) {
    return false;
  }
  if (
    pointSegmentDistanceSq(bx, bz, collider.ax, collider.az, collider.bx, collider.bz) <
    radiusSq
  ) {
    return false;
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
  if (sideA * sideB > 0) return false;
  return (
    segmentSegmentDistanceSq(
      ax,
      az,
      bx,
      bz,
      collider.ax,
      collider.az,
      collider.bx,
      collider.bz
    ) <= radiusSq
  );
}

/**
 * Rejilla uniforme de oclusores de visión. Las cordilleras se muestrean en
 * tramos de 0,8 u, así que un mapa grande puede acumular cientos de colliders
 * con `sightRadius`; recorrerlos todos en cada par observador-objetivo cada
 * frame era el principal coste de la visión. La rejilla inserta cada oclusor
 * en las celdas que cubre su volumen y la consulta solo toca las celdas que
 * atraviesa el segmento.
 */
class SightIndex {
  readonly sourceLength: number;
  private readonly occluders: readonly Collider[];
  private readonly cellSize: number;
  private readonly minX: number;
  private readonly minZ: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: number[][];
  private readonly seen: Uint32Array;
  private stamp = 0;

  constructor(colliders: readonly Collider[]) {
    this.sourceLength = colliders.length;
    const occluders: Collider[] = [];
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;

    for (const collider of colliders) {
      const sightRadius = collider.sightRadius;
      if (sightRadius === undefined) continue;
      occluders.push(collider);
      if (collider.type === 'circle') {
        minX = Math.min(minX, collider.x - sightRadius);
        maxX = Math.max(maxX, collider.x + sightRadius);
        minZ = Math.min(minZ, collider.z - sightRadius);
        maxZ = Math.max(maxZ, collider.z + sightRadius);
      } else {
        minX = Math.min(minX, collider.ax, collider.bx) - sightRadius;
        maxX = Math.max(maxX, collider.ax, collider.bx) + sightRadius;
        minZ = Math.min(minZ, collider.az, collider.bz) - sightRadius;
        maxZ = Math.max(maxZ, collider.az, collider.bz) + sightRadius;
      }
    }

    this.occluders = occluders;
    this.cellSize = Math.max(4, CONFIG.vision.mask.gridCellSize);
    this.minX = minX;
    this.minZ = minZ;
    this.cols = Math.max(1, Math.ceil((maxX - minX) / this.cellSize));
    this.rows = Math.max(1, Math.ceil((maxZ - minZ) / this.cellSize));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.seen = new Uint32Array(occluders.length);

    for (let index = 0; index < occluders.length; index++) {
      const collider = occluders[index];
      const sightRadius = collider.sightRadius as number;
      let x0: number;
      let x1: number;
      let z0: number;
      let z1: number;
      if (collider.type === 'circle') {
        x0 = collider.x - sightRadius;
        x1 = collider.x + sightRadius;
        z0 = collider.z - sightRadius;
        z1 = collider.z + sightRadius;
      } else {
        x0 = Math.min(collider.ax, collider.bx) - sightRadius;
        x1 = Math.max(collider.ax, collider.bx) + sightRadius;
        z0 = Math.min(collider.az, collider.bz) - sightRadius;
        z1 = Math.max(collider.az, collider.bz) + sightRadius;
      }
      const col0 = this.column(x0);
      const col1 = this.column(x1);
      const row0 = this.row(z0);
      const row1 = this.row(z1);
      for (let row = row0; row <= row1; row++) {
        const base = row * this.cols;
        for (let col = col0; col <= col1; col++) {
          this.cells[base + col].push(index);
        }
      }
    }
  }

  private column(x: number): number {
    const column = Math.floor((x - this.minX) / this.cellSize);
    if (column < 0) return 0;
    if (column >= this.cols) return this.cols - 1;
    return column;
  }

  private row(z: number): number {
    const row = Math.floor((z - this.minZ) / this.cellSize);
    if (row < 0) return 0;
    if (row >= this.rows) return this.rows - 1;
    return row;
  }

  blocked(ax: number, az: number, bx: number, bz: number): boolean {
    if (this.occluders.length === 0) return false;
    if (this.stamp >= 0xfffffff0) {
      this.seen.fill(0);
      this.stamp = 0;
    }
    const stamp = ++this.stamp;
    const col0 = this.column(Math.min(ax, bx));
    const col1 = this.column(Math.max(ax, bx));
    const row0 = this.row(Math.min(az, bz));
    const row1 = this.row(Math.max(az, bz));
    for (let row = row0; row <= row1; row++) {
      const base = row * this.cols;
      for (let col = col0; col <= col1; col++) {
        for (const index of this.cells[base + col]) {
          if (this.seen[index] === stamp) continue;
          this.seen[index] = stamp;
          if (blocksSight(this.occluders[index], ax, az, bx, bz)) return true;
        }
      }
    }
    return false;
  }
}

/**
 * La rejilla se construye una vez por lista de colliders. El mundo entrega la
 * misma instancia durante toda la partida, así que la clave débil evita atarla
 * a la vida de `Game` y se invalida sola al cambiar de mapa.
 */
const sightIndexCache = new WeakMap<readonly Collider[], SightIndex>();

function sightIndexOf(colliders: readonly Collider[]): SightIndex | null {
  if (colliders.length === 0) return null;
  const cached = sightIndexCache.get(colliders);
  if (cached && cached.sourceLength === colliders.length) return cached;
  const index = new SightIndex(colliders);
  sightIndexCache.set(colliders, index);
  return index;
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
  const index = sightIndexOf(colliders);
  if (index) return index.blocked(ax, az, bx, bz);
  for (const collider of colliders) {
    if (blocksSight(collider, ax, az, bx, bz)) return true;
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
