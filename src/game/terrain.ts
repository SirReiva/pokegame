/**
 * Terreno del mapa.
 *
 * La forma del mapa vive en `public/maps/*.json` como una rejilla: cada celda
 * declara su `TerrainId`. Este módulo carga esa rejilla en memoria, responde
 * consultas puras (`terrainAt`, `onMountain`…) y deriva de ella las zonas
 * poligonales que usan la decoración y el agua. No depende de PlayCanvas ni de
 * React.
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
  tallGrass: { name: 'Hierba alta', type: 'Bug' },
  fire: { name: 'Colada volcánica', type: 'Fire' },
  electric: { name: 'Páramo', type: 'Electric' },
  ice: { name: 'Escarcha', type: 'Ice' },
  poison: { name: 'Ciénaga', type: 'Poison' },
  ghost: { name: 'Bosque umbrío', type: 'Ghost' },
  fairy: { name: 'Claro feérico', type: 'Fairy' },
  desert: { name: 'Desierto', type: 'Ground' }
};

export const TERRAIN_IDS = Object.keys(TERRAINS) as TerrainId[];

const TERRAIN_INDEX = new Map<TerrainId, number>(
  TERRAIN_IDS.map((terrain, index) => [terrain, index])
);

export function isTerrainId(value: unknown): value is TerrainId {
  return typeof value === 'string' && TERRAIN_INDEX.has(value as TerrainId);
}

export type Team = 'blue' | 'red';

export interface BaseZone {
  team: Team;
  x: number;
  z: number;
  radius: number;
}

/** Punto de aparición de un equipo. También marca el centro de su base. */
export interface RespawnPoint extends BaseZone {}

/** Aspecto de un separador. La colisión y la visión son idénticas en ambos. */
export type BarrierKind = 'mountain' | 'wall';

export interface MountainRange {
  /**
   * Tipo de separador. Si falta se asume `mountain`, para que los mapas y
   * borradores antiguos sigan funcionando sin cambios.
   */
  kind?: BarrierKind;
  /** Ancho total de la cresta; el jugador no puede cruzarla. */
  width: number;
  points: Array<[number, number]>;
}

/**
 * Mapa ya normalizado. `tiles[0][0]` es la esquina noroeste: las filas avanzan
 * de norte a sur (eje Z) y las columnas de oeste a este (eje X).
 */
export interface GameMap {
  id: string;
  name: string;
  /** Lado de cada celda en unidades de mundo. */
  tileSize: number;
  /** Rejilla de tipos de terreno: filas (Z) × columnas (X). */
  tiles: TerrainId[][];
  respawns: RespawnPoint[];
  mountains: MountainRange[];
  /** Punto al que mira la cámara del menú. */
  spawn: { x: number; z: number };
  /** Altura de la lámina de agua sobre el suelo. */
  waterHeight: number;
}

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

/** Calvero temático derivado de la rejilla. */
export type TerrainZone = { terrain: TerrainId } & ZoneShape;

/** Terrenos que generan decoración 3D propia. */
const DECORATIVE_TERRAINS: TerrainId[] = [
  'tallGrass',
  'fire',
  'electric',
  'ice',
  'poison',
  'ghost',
  'fairy',
  'desert'
];

// --- Estado del mapa activo -------------------------------------------------

let activeMap: GameMap | null = null;
let activeRows = 0;
let activeCols = 0;
let activeTileSize = 1;
let activeHalfX = 0;
let activeHalfZ = 0;
let flatTerrain = new Uint8Array(0);

/** Bases del mapa activo, derivadas de sus respawns. */
export const BASES: BaseZone[] = [];
/** Separadores del mapa activo (cordilleras y muros). */
export const MOUNTAINS: MountainRange[] = [];
/** Regiones de terrenos decorativos, para colocar props y pintar detalles. */
export const TERRAIN_ZONES: TerrainZone[] = [];
/** Regiones de agua (someras + profundas) unidas por cuerpo de agua. */
export const WATER_ZONES: TerrainZone[] = [];

export function setActiveMap(map: GameMap): void {
  activeMap = map;
  activeRows = map.tiles.length;
  activeCols = map.tiles[0]?.length ?? 0;
  activeTileSize = map.tileSize;
  activeHalfX = (activeCols * activeTileSize) / 2;
  activeHalfZ = (activeRows * activeTileSize) / 2;

  flatTerrain = new Uint8Array(activeRows * activeCols);
  for (let row = 0; row < activeRows; row++) {
    for (let col = 0; col < activeCols; col++) {
      flatTerrain[row * activeCols + col] = TERRAIN_INDEX.get(map.tiles[row][col]) ?? 0;
    }
  }

  BASES.length = 0;
  for (const respawn of map.respawns) {
    BASES.push({
      team: respawn.team,
      x: respawn.x,
      z: respawn.z,
      radius: respawn.radius
    });
  }

  MOUNTAINS.length = 0;
  MOUNTAINS.push(...map.mountains);

  TERRAIN_ZONES.length = 0;
  for (const terrain of DECORATIVE_TERRAINS) {
    for (const points of regionsForTerrain(terrain)) {
      TERRAIN_ZONES.push({ terrain, points });
    }
  }

  WATER_ZONES.length = 0;
  for (const points of regionsForMask((index) => {
    const terrain = TERRAIN_IDS[index];
    return terrain === 'waterLow' || terrain === 'waterHigh';
  })) {
    WATER_ZONES.push({ terrain: 'waterLow', points });
  }
}

export function getActiveMap(): GameMap {
  if (!activeMap) throw new Error('Todavía no hay ningún mapa activo');
  return activeMap;
}

export function mapHalfWidth(): number {
  return activeHalfX;
}

export function mapHalfDepth(): number {
  return activeHalfZ;
}

export function mapWorldWidth(): number {
  return activeHalfX * 2;
}

export function mapWorldDepth(): number {
  return activeHalfZ * 2;
}

export function mapTileSize(): number {
  return activeTileSize;
}

export function mapRows(): number {
  return activeRows;
}

export function mapCols(): number {
  return activeCols;
}

export function respawnsForTeam(team: Team): RespawnPoint[] {
  return activeMap?.respawns.filter((respawn) => respawn.team === team) ?? [];
}

/** Primera base de un equipo; sirve para cámara, orientación y decoración. */
export function firstRespawnForTeam(team: Team): RespawnPoint {
  return respawnsForTeam(team)[0] ?? { team, x: 0, z: 0, radius: 3.6 };
}

// --- Consultas de la rejilla -------------------------------------------------

function clampCell(value: number, max: number): number {
  if (value < 0) return 0;
  if (value >= max) return max - 1;
  return value;
}

/** Terreno bajo una posición del mundo. */
export function terrainAt(x: number, z: number): TerrainId {
  if (!activeMap || activeCols === 0 || activeRows === 0) return 'jungle';
  const col = clampCell(Math.floor((x + activeHalfX) / activeTileSize), activeCols);
  const row = clampCell(Math.floor((z + activeHalfZ) / activeTileSize), activeRows);
  return TERRAIN_IDS[flatTerrain[row * activeCols + col]] ?? 'jungle';
}

/** Índice de la celda que contiene la posición, o null fuera del mapa. */
export function cellAt(x: number, z: number): { row: number; col: number } | null {
  if (!activeMap) return null;
  const col = Math.floor((x + activeHalfX) / activeTileSize);
  const row = Math.floor((z + activeHalfZ) / activeTileSize);
  if (col < 0 || col >= activeCols || row < 0 || row >= activeRows) return null;
  return { row, col };
}

/** Verdadero si la posición cae dentro de un separador intransitable. */
export function onMountain(x: number, z: number): boolean {
  return MOUNTAINS.some((range) => distanceToPath(x, z, range.points) <= range.width / 2);
}

/**
 * Empuja un círculo fuera de las celdas de agua profunda. Devuelve la posición
 * corregida; el llamador decide si el Pokémon puede cruzarla según su tipo.
 */
export function resolveDeepWater(x: number, z: number, radius: number): Point2 {
  if (!activeMap) return [x, z];
  let px = x;
  let pz = z;

  for (let iteration = 0; iteration < 4; iteration++) {
    let pushed = false;
    const minCol = clampCell(
      Math.floor((px - radius + activeHalfX) / activeTileSize),
      activeCols
    );
    const maxCol = clampCell(
      Math.floor((px + radius + activeHalfX) / activeTileSize),
      activeCols
    );
    const minRow = clampCell(
      Math.floor((pz - radius + activeHalfZ) / activeTileSize),
      activeRows
    );
    const maxRow = clampCell(
      Math.floor((pz + radius + activeHalfZ) / activeTileSize),
      activeRows
    );

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (terrainAtCell(row, col) !== 'waterHigh') continue;

        const cellMinX = col * activeTileSize - activeHalfX;
        const cellMaxX = cellMinX + activeTileSize;
        const cellMinZ = row * activeTileSize - activeHalfZ;
        const cellMaxZ = cellMinZ + activeTileSize;
        const closestX = Math.min(cellMaxX, Math.max(cellMinX, px));
        const closestZ = Math.min(cellMaxZ, Math.max(cellMinZ, pz));
        const dx = px - closestX;
        const dz = pz - closestZ;
        const distance = Math.hypot(dx, dz);
        if (distance >= radius) continue;

        if (distance < 0.0001) {
          // Centro dentro de la celda: sale por la cara más cercana.
          const toLeft = px - cellMinX;
          const toRight = cellMaxX - px;
          const toTop = pz - cellMinZ;
          const toBottom = cellMaxZ - pz;
          const nearest = Math.min(toLeft, toRight, toTop, toBottom);
          if (nearest === toLeft) px = cellMinX - radius;
          else if (nearest === toRight) px = cellMaxX + radius;
          else if (nearest === toTop) pz = cellMinZ - radius;
          else pz = cellMaxZ + radius;
        } else {
          px = closestX + (dx / distance) * radius;
          pz = closestZ + (dz / distance) * radius;
        }
        pushed = true;
      }
    }

    if (!pushed) break;
  }

  return [px, pz];
}

export function terrainAtCell(row: number, col: number): TerrainId {
  if (row < 0 || row >= activeRows || col < 0 || col >= activeCols) return 'jungle';
  return TERRAIN_IDS[flatTerrain[row * activeCols + col]] ?? 'jungle';
}

// --- Regiones derivadas de la rejilla ---------------------------------------

interface BoundaryEdge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

function regionsForTerrain(terrain: TerrainId): Point2[][] {
  return regionsForMask((index) => TERRAIN_IDS[index] === terrain);
}

/**
 * Convierte cada componente conexa de una máscara (4 vecinos) en un polígono
 * con los bordes de sus celdas. Si el componente tuviera huecos se conserva el
 * contorno exterior; las regiones decorativas no los usan y el agua ya se
 * agrupa como un único cuerpo.
 */
function regionsForMask(predicate: (index: number) => boolean): Point2[][] {
  if (activeRows === 0 || activeCols === 0) return [];
  const mask = new Uint8Array(activeRows * activeCols);
  for (let row = 0; row < activeRows; row++) {
    for (let col = 0; col < activeCols; col++) {
      const index = flatTerrain[row * activeCols + col];
      if (predicate(index)) mask[row * activeCols + col] = 1;
    }
  }

  const visited = new Uint8Array(mask.length);
  const stack: number[] = [];
  const polygons: Point2[][] = [];

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || visited[start] === 1) continue;

    // 1. Recolectar la componente conexa.
    visited[start] = 1;
    stack.length = 0;
    stack.push(start);
    const cells: number[] = [];
    while (stack.length > 0) {
      const cell = stack.pop()!;
      cells.push(cell);
      const row = Math.floor(cell / activeCols);
      const col = cell - row * activeCols;
      const neighbours: Array<[number, number]> = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1]
      ];
      for (const [nr, nc] of neighbours) {
        if (nr < 0 || nr >= activeRows || nc < 0 || nc >= activeCols) continue;
        const next = nr * activeCols + nc;
        if (mask[next] === 0 || visited[next] === 1) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }

    // 2. Bordes dirigidos de sus celdas (interior a la derecha).
    const inside = (row: number, col: number) =>
      row >= 0 &&
      row < activeRows &&
      col >= 0 &&
      col < activeCols &&
      mask[row * activeCols + col] === 1;

    const edges: BoundaryEdge[] = [];
    const outgoing = new Map<number, BoundaryEdge[]>();
    const vertexKey = (ax: number, ay: number) => ay * (activeCols + 1) + ax;
    const addEdge = (ax: number, ay: number, bx: number, by: number) => {
      const edge = { ax, ay, bx, by };
      edges.push(edge);
      const key = vertexKey(ax, ay);
      const list = outgoing.get(key);
      if (list) list.push(edge);
      else outgoing.set(key, [edge]);
    };

    for (const cell of cells) {
      const row = Math.floor(cell / activeCols);
      const col = cell - row * activeCols;
      if (!inside(row - 1, col)) addEdge(col, row, col + 1, row);
      if (!inside(row, col + 1)) addEdge(col + 1, row, col + 1, row + 1);
      if (!inside(row + 1, col)) addEdge(col + 1, row + 1, col, row + 1);
      if (!inside(row, col - 1)) addEdge(col, row + 1, col, row);
    }

    // 3. Encadenar los bordes en uno o varios bucles y quedarse con el mayor.
    const used = new Uint8Array(edges.length);
    let best: Array<[number, number]> = [];
    let bestArea = 0;

    for (let first = 0; first < edges.length; first++) {
      if (used[first] === 1) continue;
      const edge = edges[first];
      used[first] = 1;
      const loop: Array<[number, number]> = [[edge.ax, edge.ay]];
      let endX = edge.bx;
      let endY = edge.by;
      let dirX = edge.bx - edge.ax;
      let dirZ = edge.by - edge.ay;

      // Guarda de seguridad: un bucle no puede tener más aristas que el doble
      // del perímetro posible de la componente.
      let guard = cells.length * 8 + 8;
      while ((endX !== edge.ax || endY !== edge.ay) && guard-- > 0) {
        loop.push([endX, endY]);
        const candidates = outgoing.get(vertexKey(endX, endY));
        if (!candidates) break;

        let next: BoundaryEdge | null = null;
        let bestScore = -Infinity;
        for (const candidate of candidates) {
          const index = edges.indexOf(candidate);
          if (index < 0 || used[index] === 1) continue;
          const cdx = candidate.bx - candidate.ax;
          const cdz = candidate.by - candidate.ay;
          const cross = dirX * cdz - dirZ * cdx;
          const dot = dirX * cdx + dirZ * cdz;
          const score = Math.atan2(cross, dot);
          if (score > bestScore) {
            bestScore = score;
            next = candidate;
          }
        }
        if (!next) break;
        used[edges.indexOf(next)] = 1;
        dirX = next.bx - next.ax;
        dirZ = next.by - next.ay;
        endX = next.bx;
        endY = next.by;
      }

      // 4. Quitar vértices colineales.
      const simplified: Array<[number, number]> = [];
      for (let i = 0; i < loop.length; i++) {
        const prev = simplified[simplified.length - 1];
        const current = loop[i];
        const next = loop[(i + 1) % loop.length];
        if (!prev) {
          simplified.push(current);
          continue;
        }
        const cross =
          (current[0] - prev[0]) * (next[1] - current[1]) -
          (current[1] - prev[1]) * (next[0] - current[0]);
        if (cross !== 0) simplified.push(current);
      }

      let area = 0;
      for (let i = 0; i < simplified.length; i++) {
        const [x0, z0] = simplified[i];
        const [x1, z1] = simplified[(i + 1) % simplified.length];
        area += x0 * z1 - x1 * z0;
      }
      area = Math.abs(area) / 2;
      if (area > bestArea) {
        bestArea = area;
        best = simplified;
      }
    }

    if (best.length >= 3) {
      polygons.push(
        best.map(([cx, cz]) => [
          cx * activeTileSize - activeHalfX,
          cz * activeTileSize - activeHalfZ
        ])
      );
    }
  }

  return polygons;
}

// --- Geometría compartida ---------------------------------------------------

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
  for (let attempt = 0; attempt < 96; attempt++) {
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
 * Distancia al trazado suavizado que usan las cordilleras: Bézier cuadráticas
 * entre cada punto y el punto medio del siguiente.
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
