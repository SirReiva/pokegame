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

export interface TerrainZone {
  terrain: TerrainId;
  x: number;
  z: number;
  radius: number;
}

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
    if (Math.hypot(x - zone.x, z - zone.z) <= zone.radius) return zone.terrain;
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
