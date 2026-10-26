/**
 * Terrenos de la demo, cada uno asociado a un tipo Pokémon.
 *
 * El mapa tiene siete terrenos base (pradera, sendero, carretera, arena, aguas
 * someras, aguas profundas y plaza) y ocho calveros repartidos por la isla, uno
 * de ellos repetido de hierba alta.
 * Este módulo solo contiene datos y consultas puras: no depende de PlayCanvas
 * ni de React.
 */

export type TerrainId =
  | 'meadow'
  | 'path'
  | 'road'
  | 'sand'
  | 'waterLow'
  | 'waterHigh'
  | 'plaza'
  | 'tallGrass'
  | 'fire'
  | 'electric'
  | 'ice'
  | 'poison'
  | 'ghost'
  | 'fairy';

export interface TerrainDefinition {
  /** Nombre visible del terreno. */
  name: string;
  /** Tipo Pokémon asociado (misma clave que el manifiesto de sprites). */
  type: string;
}

export const TERRAINS: Record<TerrainId, TerrainDefinition> = {
  meadow: { name: 'Pradera', type: 'Grass' },
  path: { name: 'Sendero', type: 'Ground' },
  road: { name: 'Carretera', type: 'Normal' },
  sand: { name: 'Arena', type: 'Ground' },
  waterLow: { name: 'Aguas someras', type: 'Water' },
  waterHigh: { name: 'Aguas profundas', type: 'Water' },
  plaza: { name: 'Plaza', type: 'Rock' },
  tallGrass: { name: 'Hierba alta', type: 'Grass' },
  fire: { name: 'Brasas', type: 'Fire' },
  electric: { name: 'Páramo', type: 'Electric' },
  ice: { name: 'Escarcha', type: 'Ice' },
  poison: { name: 'Ciénaga', type: 'Poison' },
  ghost: { name: 'Bosque umbrío', type: 'Ghost' },
  fairy: { name: 'Claro feérico', type: 'Fairy' }
};

export const PLAZA = { x: 0, z: 0, radius: 4.8 };
export const POND = {
  x: 9.6,
  z: -8.4,
  /** Radio total del agua (aguas someras). */
  radius: 4.6,
  /** Radio del pozo profundo: solo Pokémon de tipo Agua pueden entrar. */
  deepRadius: 2.9,
  /** Radio de la orilla de arena. */
  shoreRadius: 5.6,
  /** Altura de la lámina de agua sobre el suelo; sumerge las piernas. */
  surfaceHeight: 0.3
};

export interface TerrainPath {
  width: number;
  points: Array<[number, number]>;
  /**
   * Ancho del asfalto. Si falta, el camino es de tierra. La carretera se pinta
   * encima del camino, así que el ancho del camino queda como arcén.
   */
  asphalt?: number;
  /** Pinta el eje discontinuo del centro de la calzada. */
  centerLine?: boolean;
}

/** Caminos de tierra. `textures.ts` los pinta y `terrainAt` los consulta. */
export const TERRAIN_PATHS: TerrainPath[] = [
  {
    width: 3.6,
    asphalt: 2.5,
    centerLine: true,
    points: [
      [-0.6, 20.4],
      [0.4, 16],
      [-0.8, 12.5],
      [0.5, 8.5],
      [PLAZA.x, PLAZA.z + PLAZA.radius - 0.6]
    ]
  },
  {
    width: 2.5,
    points: [
      [PLAZA.x + 2.2, PLAZA.z - 1.6],
      [5.2, -2.6],
      [5.4, -4.4],
      [POND.x - 3.7, POND.z + 3.4]
    ]
  }
];

export interface TerrainZone {
  terrain: TerrainId;
  x: number;
  z: number;
  radius: number;
}

/**
 * Calveros temáticos. Están lejos de la plaza, los caminos, el estanque y el
 * punto de aparición, pero pueden compartir sitio con rocas o árboles.
 * La hierba alta se pinta distinto: además del lecho verde, genera matas 3D.
 */
export const TERRAIN_ZONES: TerrainZone[] = [
  { terrain: 'fire', x: 12.6, z: 1.6, radius: 2.5 },
  { terrain: 'electric', x: -8.8, z: 12.2, radius: 2.5 },
  { terrain: 'ice', x: -8.5, z: -0.6, radius: 2.5 },
  { terrain: 'poison', x: 1.8, z: -13.0, radius: 2.4 },
  { terrain: 'ghost', x: -13.8, z: -11.8, radius: 2.3 },
  { terrain: 'fairy', x: -13.0, z: 12.3, radius: 2.4 },
  { terrain: 'tallGrass', x: 13.8, z: 8.0, radius: 2.3 },
  { terrain: 'tallGrass', x: -6.6, z: 6.2, radius: 2.0 }
];

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
 * el terreno coincide con el borde visible del camino y del asfalto.
 */
function distanceToTrail(x: number, z: number, points: Array<[number, number]>): number {
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

function onPath(x: number, z: number): boolean {
  return TERRAIN_PATHS.some(
    (path) => distanceToTrail(x, z, path.points) <= path.width / 2 + 0.15
  );
}

/**
 * Asfalto de la carretera. Se consulta antes que el camino porque la calzada
 * está pintada encima: los arcenes de tierra siguen siendo `path`.
 */
function onAsphalt(x: number, z: number): boolean {
  return TERRAIN_PATHS.some(
    (path) => path.asphalt !== undefined && distanceToTrail(x, z, path.points) <= path.asphalt / 2
  );
}

/** Terreno bajo una posición del mundo. */
export function terrainAt(x: number, z: number): TerrainId {
  for (const zone of TERRAIN_ZONES) {
    if (Math.hypot(x - zone.x, z - zone.z) <= zone.radius) return zone.terrain;
  }
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) <= PLAZA.radius) return 'plaza';

  const pondDistance = Math.hypot(x - POND.x, z - POND.z);
  if (pondDistance <= POND.deepRadius) return 'waterHigh';
  if (pondDistance <= POND.radius) return 'waterLow';
  if (pondDistance <= POND.shoreRadius) return 'sand';

  if (onAsphalt(x, z)) return 'road';
  if (onPath(x, z)) return 'path';
  return 'meadow';
}
