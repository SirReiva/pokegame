/**
 * Terrenos de la demo, cada uno asociado a un tipo Pokémon.
 *
 * El mapa tiene seis terrenos base (pradera, sendero, arena, aguas someras,
 * aguas profundas y plaza) y siete calveros repartidos por la isla, uno de
 * ellos de hierba alta.
 * Este módulo solo contiene datos y consultas puras: no depende de PlayCanvas
 * ni de React.
 */

export type TerrainId =
  | 'meadow'
  | 'path'
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
}

/** Caminos de tierra. `textures.ts` los pinta y `terrainAt` los consulta. */
export const TERRAIN_PATHS: TerrainPath[] = [
  {
    width: 3.6,
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

function onPath(x: number, z: number): boolean {
  for (const path of TERRAIN_PATHS) {
    for (let i = 0; i < path.points.length - 1; i++) {
      const [ax, az] = path.points[i];
      const [bx, bz] = path.points[i + 1];
      if (distanceToSegment(x, z, ax, az, bx, bz) <= path.width / 2 + 0.15) {
        return true;
      }
    }
  }
  return false;
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

  if (onPath(x, z)) return 'path';
  return 'meadow';
}
