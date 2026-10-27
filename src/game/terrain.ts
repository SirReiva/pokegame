/**
 * Mapa de la demo con aire de MOBA: arena cuadrada, dos bases en esquinas
 * opuestas y tres carriles que las conectan (superior, central e inferior).
 * El resto del mapa es jungla, con calveros temáticos y un lago.
 * Este módulo solo contiene datos y consultas puras: no depende de PlayCanvas
 * ni de React.
 */

export type TerrainId =
  | 'jungle'
  | 'lane'
  | 'road'
  | 'sand'
  | 'waterLow'
  | 'waterHigh'
  | 'base'
  | 'tallGrass'
  | 'fire'
  | 'electric'
  | 'ice'
  | 'poison'
  | 'ghost'
  | 'fairy'
  | 'desert';

export interface TerrainDefinition {
  /** Nombre visible del terreno. */
  name: string;
  /** Tipo Pokémon asociado (misma clave que el manifiesto de sprites). */
  type: string;
}

export const TERRAINS: Record<TerrainId, TerrainDefinition> = {
  jungle: { name: 'Jungla', type: 'Grass' },
  lane: { name: 'Carril', type: 'Normal' },
  road: { name: 'Carretera', type: 'Normal' },
  sand: { name: 'Arena', type: 'Ground' },
  waterLow: { name: 'Aguas someras', type: 'Water' },
  waterHigh: { name: 'Aguas profundas', type: 'Water' },
  base: { name: 'Base', type: 'Rock' },
  tallGrass: { name: 'Hierba alta', type: 'Grass' },
  fire: { name: 'Colada volcánica', type: 'Fire' },
  electric: { name: 'Páramo', type: 'Electric' },
  ice: { name: 'Escarcha', type: 'Ice' },
  poison: { name: 'Ciénaga', type: 'Poison' },
  ghost: { name: 'Bosque umbrío', type: 'Ghost' },
  fairy: { name: 'Claro feérico', type: 'Fairy' },
  desert: { name: 'Desierto', type: 'Ground' }
};

export type Team = 'blue' | 'red';

export interface BaseZone {
  team: Team;
  x: number;
  z: number;
  radius: number;
}

/** Las dos bases, en esquinas opuestas de la diagonal suroeste-noreste. */
export const BASES: BaseZone[] = [
  { team: 'blue', x: -13.2, z: 13.2, radius: 3.6 },
  { team: 'red', x: 13.2, z: -13.2, radius: 3.6 }
];

/** Lago de la jungla sureste: única zona de aguas profundas del mapa. */
export const POND = {
  x: 7.5,
  z: 7.5,
  /** Radio total del agua (aguas someras). */
  radius: 2.4,
  /** Radio del pozo profundo: solo Pokémon de tipo Agua pueden entrar. */
  deepRadius: 1.4,
  /** Radio de la orilla de arena. */
  shoreRadius: 3.1,
  /** Altura de la lámina de agua sobre el suelo; sumerge las piernas. */
  surfaceHeight: 0.3
};

export interface Lane {
  width: number;
  points: Array<[number, number]>;
  /**
   * Ancho del asfalto. Si falta, el carril es de tierra. La carretera se pinta
   * encima del carril, así que el ancho del carril queda como arcén.
   */
  asphalt?: number;
  /** Pinta el eje discontinuo del centro de la calzada. */
  centerLine?: boolean;
}

/**
 * Los tres carriles. El superior rodea la jungla noroeste, el inferior la
 * sureste y el central cruza en diagonal de base a base. Ambos extremos quedan
 * dentro de las bases, que se pintan encima.
 */
export const LANES: Lane[] = [
  {
    width: 3.4,
    points: [
      [-11.8, 10.8],
      [-15.8, 6.0],
      [-15.8, -6.0],
      [-11.5, -15.0],
      [-6.0, -15.8],
      [2.0, -15.8],
      [9.0, -15.0],
      [12.6, -14.2]
    ]
  },
  {
    width: 3.4,
    asphalt: 2.4,
    centerLine: true,
    points: [
      [-10.8, 10.8],
      [-5.4, 5.4],
      [0, 0],
      [5.4, -5.4],
      [10.8, -10.8]
    ]
  },
  {
    width: 3.4,
    points: [
      [11.8, -10.8],
      [15.8, -6.0],
      [15.8, 6.0],
      [11.5, 15.0],
      [6.0, 15.8],
      [-2.0, 15.8],
      [-9.0, 15.0],
      [-12.6, 14.2]
    ]
  }
];

export interface MountainRange {
  /** Ancho total de la cresta; el jugador no puede cruzarla. */
  width: number;
  points: Array<[number, number]>;
}

/**
 * Cordilleras: barreras intransitables que separan regiones del mapa. Cada una
 * es una polilínea (igual que los carriles); el trazado suavizado coincide con
 * el que pinta el suelo y con la fila de picos 3D. No son terrenos: no tienen
 * tipo ni modifican la velocidad, solo bloquean el paso (vía colliders).
 *
 * Se mantienen apartadas de carriles, bases, lago, calveros y del spawn para no
 * cortar el recorrido del mapa; los huecos en sus extremos permiten rodearlas.
 */
export const MOUNTAINS: MountainRange[] = [
  {
    // Sierra suroeste: separa el carril central de la jungla interior.
    width: 2.2,
    points: [
      [-9.5, 3.5],
      [-7.5, 1.5],
      [-5.5, -0.5]
    ]
  },
  {
    // Sierra este: separa la jungla del lago de la colada volcánica.
    width: 2.2,
    points: [
      [6.0, 2.0],
      [8.5, 2.0],
      [11.0, 2.0]
    ]
  },
  {
    // Sierra norte: rompe la llanura del norte, entre la base azul y el claro
    // feérico.
    width: 2.2,
    points: [
      [-6.0, 11.0],
      [-3.5, 11.0],
      [-1.0, 11.0]
    ]
  }
];

export type Point2 = [number, number];

/** Forma circular: centro y radio. */
export interface CircleZoneShape {
  x: number;
  z: number;
  radius: number;
}

/** Forma poligonal: vértices en orden, sin repetir el primero al final. */
export interface PolygonZoneShape {
  points: Point2[];
}

/** Forma que ocupa una zona del mapa. */
export type ZoneShape = CircleZoneShape | PolygonZoneShape;

/**
 * Calvero temático. Acepta las dos formas:
 * - Círculo: `{ terrain: 'ice', x: -4, z: -11, radius: 2.2 }`.
 * - Polígono: `{ terrain: 'ice', points: [[x, z], [x, z], ...] }`.
 * Los vértices pueden ir en cualquier sentido; el interior se resuelve con la
 * regla par-impar, así que también se admiten polígonos cóncavos.
 */
export type TerrainZone = { terrain: TerrainId } & ZoneShape;

/**
 * Calveros temáticos repartidos por las dos junglas. Se mantienen apartados de
 * carriles, bases y lago para no tapar la lectura del mapa.
 * La hierba alta se pinta distinto: además del lecho verde, genera matas 3D.
 */
export const TERRAIN_ZONES: TerrainZone[] = [
  // Jungla noroeste.
  { terrain: 'electric', x: -9.0, z: -8.5, radius: 2.4 },
  { terrain: 'ice', x: -4.0, z: -11.0, radius: 2.2 },
  { terrain: 'poison', x: -11.0, z: -4.0, radius: 2.2 },
  { terrain: 'tallGrass', x: -5.5, z: -4.5, radius: 2.0 },
  // Jungla norte.
  { terrain: 'desert', x: 1.0, z: -8.5, radius: 2.4 },
  // Jungla sureste.
  { terrain: 'fire', x: 10.5, z: -2.5, radius: 2.5 },
  { terrain: 'ghost', x: 0.5, z: 7.5, radius: 2.3 },
  { terrain: 'fairy', x: 3.5, z: 11.5, radius: 2.4 },
  { terrain: 'tallGrass', x: 2.5, z: 3.5, radius: 2.0 }
];

export function isPolygonZone(shape: ZoneShape): shape is PolygonZoneShape {
  return 'points' in shape;
}

/** Verdadero si el punto cae dentro del polígono (regla par-impar). */
export function pointInPolygon(points: Point2[], x: number, z: number): boolean {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Centro de la zona: el del círculo o el centroide del polígono. */
export function zoneCenter(zone: ZoneShape): Point2 {
  if (!isPolygonZone(zone)) return [zone.x, zone.z];

  // Centroide por área; si el polígono es degenerado, media de los vértices.
  let twiceArea = 0;
  let cx = 0;
  let cz = 0;
  const points = zone.points;
  for (let i = 0; i < points.length; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[(i + 1) % points.length];
    const cross = x0 * z1 - x1 * z0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cz += (z0 + z1) * cross;
  }
  if (Math.abs(twiceArea) > 1e-6) {
    return [cx / (3 * twiceArea), cz / (3 * twiceArea)];
  }
  if (points.length === 0) return [0, 0];
  let sx = 0;
  let sz = 0;
  for (const [x, z] of points) {
    sx += x;
    sz += z;
  }
  return [sx / points.length, sz / points.length];
}

export interface ZoneBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  /** Centro del rectángulo que envuelve la forma. */
  cx: number;
  cz: number;
}

/** Rectángulo mínimo que contiene la zona. */
export function zoneBounds(zone: ZoneShape): ZoneBounds {
  let minX: number;
  let maxX: number;
  let minZ: number;
  let maxZ: number;
  if (isPolygonZone(zone)) {
    minX = Infinity;
    maxX = -Infinity;
    minZ = Infinity;
    maxZ = -Infinity;
    for (const [x, z] of zone.points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      maxX = 0;
      minZ = 0;
      maxZ = 0;
    }
  } else {
    minX = zone.x - zone.radius;
    maxX = zone.x + zone.radius;
    minZ = zone.z - zone.radius;
    maxZ = zone.z + zone.radius;
  }
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2
  };
}

/**
 * Distancia firmada al borde de la zona: positiva dentro, negativa fuera.
 * Sirve tanto para consultar pertenencia como para muestrear con margen.
 */
export function zoneSignedDistance(zone: ZoneShape, x: number, z: number): number {
  if (!isPolygonZone(zone)) {
    return zone.radius - Math.hypot(x - zone.x, z - zone.z);
  }
  const points = zone.points;
  if (points.length < 3) return -Infinity;
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[(i + 1) % points.length];
    best = Math.min(best, distanceToSegment(x, z, ax, az, bx, bz));
  }
  return pointInPolygon(points, x, z) ? best : -best;
}

/** Verdadero si el punto cae dentro de la zona. */
export function zoneContains(zone: ZoneShape, x: number, z: number): boolean {
  return zoneSignedDistance(zone, x, z) >= 0;
}

/**
 * Verdadero si el punto cae dentro de la zona dejando `inset` unidades hasta
 * el borde. Un `inset` negativo expande la forma, útil para exclusiones.
 */
export function zoneContainsInset(
  zone: ZoneShape,
  x: number,
  z: number,
  inset: number
): boolean {
  return zoneSignedDistance(zone, x, z) >= inset;
}

/** Área de la zona, para escalar densidades de decoración. */
export function zoneArea(zone: ZoneShape): number {
  if (!isPolygonZone(zone)) return Math.PI * zone.radius * zone.radius;
  const points = zone.points;
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[(i + 1) % points.length];
    twiceArea += x0 * z1 - x1 * z0;
  }
  return Math.abs(twiceArea) / 2;
}

/**
 * Punto aleatorio uniforme dentro de la zona. `inset` deja margen respecto al
 * borde y `minCenterDistance` evita el centro (útil para rocas y árboles).
 * En círculos consume los mismos números aleatorios que el muestreo radial de
 * siempre, así que las posiciones del mapa actual no cambian.
 */
export function randomPointInZone(
  zone: ZoneShape,
  random: () => number,
  inset = 0,
  minCenterDistance = 0
): Point2 {
  if (!isPolygonZone(zone)) {
    const angle = random() * Math.PI * 2;
    const maxDistance = Math.max(0, zone.radius - inset);
    const inner = Math.min(minCenterDistance, maxDistance);
    const distance = inner + Math.sqrt(random()) * (maxDistance - inner);
    return [zone.x + Math.cos(angle) * distance, zone.z + Math.sin(angle) * distance];
  }

  const [centerX, centerZ] = zoneCenter(zone);
  const bounds = zoneBounds(zone);
  const margin = Math.max(0, inset);
  const usableWidth = Math.max(0, bounds.width - margin * 2);
  const usableDepth = Math.max(0, bounds.depth - margin * 2);
  for (let attempt = 0; attempt < 64; attempt++) {
    const x = bounds.minX + margin + random() * usableWidth;
    const z = bounds.minZ + margin + random() * usableDepth;
    if (!zoneContainsInset(zone, x, z, margin)) continue;
    if (minCenterDistance > 0 && Math.hypot(x - centerX, z - centerZ) < minCenterDistance) {
      continue;
    }
    return [x, z];
  }
  if (zoneContainsInset(zone, centerX, centerZ, margin)) return [centerX, centerZ];
  return zone.points[0] ?? [centerX, centerZ];
}

/** Área firmada del polígono: positiva si los vértices van en sentido antihorario. */
function signedPolygonArea(points: Point2[]): number {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[(i + 1) % points.length];
    twiceArea += x0 * z1 - x1 * z0;
  }
  return twiceArea / 2;
}

function pointInTriangle(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number
): boolean {
  const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
  const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz);
  const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

/**
 * Triangula un polígono simple por recorte de orejas. Devuelve índices en
 * grupos de tres, en sentido antihorario. Sirve para construir mallas planas
 * (por ejemplo, la lámina de agua de una ciénaga poligonal).
 */
export function triangulatePolygon(points: Point2[]): number[] {
  // Se toleran vértices repetidos (incluido el primero al final).
  const cleaned: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const previous = cleaned[cleaned.length - 1];
    if (previous !== undefined) {
      const [px, pz] = points[previous];
      const [x, z] = points[i];
      if (Math.hypot(x - px, z - pz) < 1e-9) continue;
    }
    cleaned.push(i);
  }
  while (cleaned.length > 1) {
    const [fx, fz] = points[cleaned[0]];
    const [lx, lz] = points[cleaned[cleaned.length - 1]];
    if (Math.hypot(fx - lx, fz - lz) < 1e-9) cleaned.pop();
    else break;
  }
  if (cleaned.length < 3) return [];

  const indices = [...cleaned];
  const ordered = cleaned.map((index) => points[index]);
  if (signedPolygonArea(ordered) < 0) indices.reverse();

  const triangles: number[] = [];
  let guard = points.length * points.length;
  while (indices.length > 3 && guard-- > 0) {
    let earFound = false;
    for (let i = 0; i < indices.length; i++) {
      const ia = indices[(i - 1 + indices.length) % indices.length];
      const ib = indices[i];
      const ic = indices[(i + 1) % indices.length];
      const [ax, az] = points[ia];
      const [bx, bz] = points[ib];
      const [cx, cz] = points[ic];

      // Un vértice reflex o colineal no puede formar oreja.
      if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) <= 0) continue;

      let containsVertex = false;
      for (const j of indices) {
        if (j === ia || j === ib || j === ic) continue;
        const [px, pz] = points[j];
        if (pointInTriangle(px, pz, ax, az, bx, bz, cx, cz)) {
          containsVertex = true;
          break;
        }
      }
      if (containsVertex) continue;

      triangles.push(ia, ib, ic);
      indices.splice(i, 1);
      earFound = true;
      break;
    }
    if (!earFound) break;
  }
  if (indices.length === 3) triangles.push(indices[0], indices[1], indices[2]);
  return triangles;
}

function distanceToSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSq)) : 0;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/**
 * Distancia al trazado suavizado que pinta `textures.ts`: Bézier cuadráticas
 * entre cada punto y el punto medio del siguiente, igual que en el canvas. Así
 * el terreno coincide con el borde visible del carril y del asfalto.
 */
function distanceToPath(x: number, z: number, points: Array<[number, number]>): number {
  if (points.length === 1) return Math.hypot(x - points[0][0], z - points[0][1]);
  const steps = 8;
  let best = Infinity;
  let previous = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const control = points[i];
    const next = points[i + 1];
    const end: [number, number] = [(control[0] + next[0]) / 2, (control[1] + next[1]) / 2];
    let ax = previous[0];
    let az = previous[1];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const inv = 1 - t;
      const bx = inv * inv * previous[0] + 2 * inv * t * control[0] + t * t * end[0];
      const bz = inv * inv * previous[1] + 2 * inv * t * control[1] + t * t * end[1];
      best = Math.min(best, distanceToSegment(x, z, ax, az, bx, bz));
      ax = bx;
      az = bz;
    }
    previous = end;
  }
  const last = points[points.length - 1];
  return Math.min(best, distanceToSegment(x, z, previous[0], previous[1], last[0], last[1]));
}

function onLane(x: number, z: number): boolean {
  return LANES.some((lane) => distanceToPath(x, z, lane.points) <= lane.width / 2 + 0.15);
}

/**
 * Asfalto del carril central. Se consulta antes que el carril porque la calzada
 * está pintada encima: los arcenes de tierra siguen siendo `lane`.
 */
function onAsphalt(x: number, z: number): boolean {
  return LANES.some(
    (lane) => lane.asphalt !== undefined && distanceToPath(x, z, lane.points) <= lane.asphalt / 2
  );
}

/** Verdadero si la posición cae dentro de una cordillera intransitable. */
export function onMountain(x: number, z: number): boolean {
  return MOUNTAINS.some((range) => distanceToPath(x, z, range.points) <= range.width / 2);
}

/** Terreno bajo una posición del mundo. */
export function terrainAt(x: number, z: number): TerrainId {
  for (const zone of TERRAIN_ZONES) {
    if (zoneContains(zone, x, z)) return zone.terrain;
  }
  for (const base of BASES) {
    if (Math.hypot(x - base.x, z - base.z) <= base.radius) return 'base';
  }

  const pondDistance = Math.hypot(x - POND.x, z - POND.z);
  if (pondDistance <= POND.deepRadius) return 'waterHigh';
  if (pondDistance <= POND.radius) return 'waterLow';
  if (pondDistance <= POND.shoreRadius) return 'sand';

  if (onAsphalt(x, z)) return 'road';
  if (onLane(x, z)) return 'lane';
  return 'jungle';
}
