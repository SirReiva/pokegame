/**
 * Lógica pura del editor de mapas.
 *
 * El editor trabaja sobre una rejilla rectangular de `TerrainId` (`cols` ×
 * `rows`) y guarda las bases por celda (fila/columna) para que redimensionar
 * el mapa no las mueva de sitio. Al exportar se convierten a coordenadas de
 * mundo, que es lo que entiende `src/game/map.ts`.
 */

import { parseMap } from './map';
import {
  TERRAIN_IDS,
  isTerrainId,
  type MountainRange,
  type RespawnPoint,
  type Team,
  type TerrainId
} from './terrain';

export const EDITOR_MIN_SIZE = 8;
export const EDITOR_MAX_SIZE = 128;
export const EDITOR_DEFAULT_SIZE = 32;
export const EDITOR_DEFAULT_TILE_SIZE = 0.5;
export const EDITOR_DEFAULT_WATER_HEIGHT = 0.3;
export const EDITOR_DEFAULT_BASE_RADIUS = 3.6;
export const EDITOR_HISTORY_LIMIT = 60;

/** Color de cada terreno en la rejilla. Copia la paleta base de `textures.ts`. */
export const TERRAIN_SWATCHES: Record<TerrainId, string> = {
  jungle: '#699f4b',
  lane: '#b99a70',
  road: '#4c525b',
  sand: '#d8c79a',
  waterLow: '#67bad8',
  waterHigh: '#2f7fa8',
  base: '#8d8577',
  tallGrass: '#2f6a2b',
  fire: '#1f2329',
  electric: '#a39344',
  ice: '#c3e2ea',
  poison: '#5b3967',
  ghost: '#3d3a4c',
  fairy: '#8fbf6b',
  desert: '#d9b66c'
};

export interface EditorBase {
  team: Team;
  /** Fila de la rejilla (0 = norte). */
  row: number;
  /** Columna de la rejilla (0 = oeste). */
  col: number;
  radius: number;
}

export type EditorBases = Partial<Record<Team, EditorBase>>;

export interface EditorMeta {
  id: string;
  name: string;
  tileSize: number;
  waterHeight: number;
  baseRadius: number;
}

export interface EditorMap {
  meta: EditorMeta;
  /** Número de columnas (eje X). */
  cols: number;
  /** Número de filas (eje Z). */
  rows: number;
  /** Terreno que pinta el borrador y rellena las celdas nuevas. */
  background: TerrainId;
  tiles: TerrainId[][];
  bases: EditorBases;
  /** Cordilleras del mapa, en coordenadas de mundo. */
  mountains: MountainRange[];
  /** Punto de cámara del menú importado. Si falta, se exporta la base azul. */
  spawn?: { x: number; z: number };
}

/** Parte del mapa que entra en el historial de deshacer. */
export interface EditorSnapshot {
  cols: number;
  rows: number;
  tiles: TerrainId[][];
  bases: EditorBases;
  mountains: MountainRange[];
}

export interface EditorMapJson {
  $schema: string;
  id: string;
  name: string;
  tileSize: number;
  waterHeight: number;
  spawn: { x: number; z: number };
  respawns: RespawnPoint[];
  mountains?: MountainRange[];
  tiles: TerrainId[][];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function cloneTiles(tiles: TerrainId[][]): TerrainId[][] {
  return tiles.map((row) => row.slice());
}

export function cloneBases(bases: EditorBases): EditorBases {
  const next: EditorBases = {};
  if (bases.blue) next.blue = { ...bases.blue };
  if (bases.red) next.red = { ...bases.red };
  return next;
}

export function cloneMountains(mountains: MountainRange[] | undefined): MountainRange[] {
  return (mountains ?? []).map((range) => ({
    width: range.width,
    points: range.points.map(([x, z]) => [x, z] as [number, number])
  }));
}

export function cloneEditorMap(map: EditorMap): EditorMap {
  return {
    meta: { ...map.meta },
    cols: map.cols,
    rows: map.rows,
    background: map.background,
    tiles: cloneTiles(map.tiles),
    bases: cloneBases(map.bases),
    mountains: cloneMountains(map.mountains),
    spawn: map.spawn ? { ...map.spawn } : undefined
  };
}

export function snapshotOf(map: EditorMap): EditorSnapshot {
  return {
    cols: map.cols,
    rows: map.rows,
    tiles: cloneTiles(map.tiles),
    bases: cloneBases(map.bases),
    mountains: cloneMountains(map.mountains)
  };
}

export function applySnapshot(map: EditorMap, snapshot: EditorSnapshot): EditorMap {
  return {
    ...map,
    cols: snapshot.cols,
    rows: snapshot.rows,
    tiles: cloneTiles(snapshot.tiles),
    bases: cloneBases(snapshot.bases),
    mountains: cloneMountains(snapshot.mountains)
  };
}

export function createEditorMap(options: {
  id: string;
  name: string;
  cols: number;
  rows: number;
  tileSize?: number;
  waterHeight?: number;
  fill?: TerrainId;
}): EditorMap {
  const cols = clamp(Math.round(options.cols), EDITOR_MIN_SIZE, EDITOR_MAX_SIZE);
  const rows = clamp(Math.round(options.rows), EDITOR_MIN_SIZE, EDITOR_MAX_SIZE);
  const fill = options.fill ?? 'jungle';
  const tiles = Array.from({ length: rows }, () => Array<TerrainId>(cols).fill(fill));
  const blueRow = clamp(Math.floor(rows * 0.75), 0, rows - 1);
  const blueCol = clamp(Math.floor(cols * 0.25), 0, cols - 1);
  const redRow = clamp(Math.floor(rows * 0.25), 0, rows - 1);
  const redCol = clamp(Math.floor(cols * 0.75), 0, cols - 1);
  const baseRadius = EDITOR_DEFAULT_BASE_RADIUS;

  return {
    meta: {
      id: options.id,
      name: options.name,
      tileSize: options.tileSize ?? EDITOR_DEFAULT_TILE_SIZE,
      waterHeight: options.waterHeight ?? EDITOR_DEFAULT_WATER_HEIGHT,
      baseRadius
    },
    cols,
    rows,
    background: fill,
    tiles,
    bases: {
      blue: { team: 'blue', row: blueRow, col: blueCol, radius: baseRadius },
      red: { team: 'red', row: redRow, col: redCol, radius: baseRadius }
    },
    mountains: []
  };
}

/** Redimensiona conservando la esquina noroeste. Devuelve `null` si no cambia. */
export function resizeEditorMap(map: EditorMap, cols: number, rows: number): EditorMap | null {
  const nextCols = clamp(Math.round(cols), EDITOR_MIN_SIZE, EDITOR_MAX_SIZE);
  const nextRows = clamp(Math.round(rows), EDITOR_MIN_SIZE, EDITOR_MAX_SIZE);
  if (nextCols === map.cols && nextRows === map.rows) return null;

  const tiles = Array.from({ length: nextRows }, (_, row) =>
    Array.from({ length: nextCols }, (_, col) => map.tiles[row]?.[col] ?? map.background)
  );

  const bases: EditorBases = {};
  if (map.bases.blue) {
    bases.blue = {
      ...map.bases.blue,
      row: clamp(map.bases.blue.row, 0, nextRows - 1),
      col: clamp(map.bases.blue.col, 0, nextCols - 1)
    };
  }
  if (map.bases.red) {
    bases.red = {
      ...map.bases.red,
      row: clamp(map.bases.red.row, 0, nextRows - 1),
      col: clamp(map.bases.red.col, 0, nextCols - 1)
    };
  }

  // Las cordilleras viven en coordenadas de mundo y el origen del mapa está en
  // su centro, así que al cambiar el tamaño hay que desplazarlas lo mismo que
  // se desplazan las celdas para que sigan alineadas con el terreno.
  const shiftX = ((nextCols - map.cols) * map.meta.tileSize) / 2;
  const shiftZ = ((nextRows - map.rows) * map.meta.tileSize) / 2;
  const mountains: MountainRange[] = map.mountains.map((range) => ({
    width: range.width,
    points: range.points.map(
      ([x, z]) => [round(x - shiftX), round(z - shiftZ)] as [number, number]
    )
  }));

  return { ...map, cols: nextCols, rows: nextRows, tiles, bases, mountains };
}

export function paintCellInPlace(
  tiles: TerrainId[][],
  row: number,
  col: number,
  terrain: TerrainId
): boolean {
  if (row < 0 || col < 0 || row >= tiles.length || col >= (tiles[row]?.length ?? 0)) return false;
  if (tiles[row][col] === terrain) return false;
  tiles[row][col] = terrain;
  return true;
}

/** Pinta una línea de Bresenham para que el lápiz no deje huecos al arrastrar. */
export function paintLineInPlace(
  tiles: TerrainId[][],
  rowA: number,
  colA: number,
  rowB: number,
  colB: number,
  terrain: TerrainId
): boolean {
  let x0 = colA;
  let y0 = rowA;
  const x1 = colB;
  const y1 = rowB;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const stepX = x0 < x1 ? 1 : -1;
  const stepY = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  let changed = false;

  for (;;) {
    if (paintCellInPlace(tiles, y0, x0, terrain)) changed = true;
    if (x0 === x1 && y0 === y1) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x0 += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y0 += stepY;
    }
  }

  return changed;
}

export function floodFillInPlace(
  tiles: TerrainId[][],
  row: number,
  col: number,
  terrain: TerrainId
): boolean {
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  if (row < 0 || col < 0 || row >= rows || col >= cols) return false;
  const target = tiles[row][col];
  if (target === terrain) return false;

  const stack: Array<[number, number]> = [[row, col]];
  let changed = false;
  while (stack.length > 0) {
    const [r, c] = stack.pop() as [number, number];
    if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
    if (tiles[r][c] !== target) continue;
    tiles[r][c] = terrain;
    changed = true;
    stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
  }
  return changed;
}

export function paintRectInPlace(
  tiles: TerrainId[][],
  rowA: number,
  colA: number,
  rowB: number,
  colB: number,
  terrain: TerrainId
): boolean {
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  const r0 = clamp(Math.min(rowA, rowB), 0, rows - 1);
  const r1 = clamp(Math.max(rowA, rowB), 0, rows - 1);
  const c0 = clamp(Math.min(colA, colB), 0, cols - 1);
  const c1 = clamp(Math.max(colA, colB), 0, cols - 1);
  let changed = false;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (tiles[r][c] !== terrain) {
        tiles[r][c] = terrain;
        changed = true;
      }
    }
  }
  return changed;
}

export function setBaseInPlace(
  bases: EditorBases,
  team: Team,
  row: number,
  col: number,
  radius: number
): boolean {
  const current = bases[team];
  if (current && current.row === row && current.col === col && current.radius === radius) {
    return false;
  }
  bases[team] = { team, row, col, radius };
  return true;
}

/** Centro de la celda en coordenadas de mundo. */
export function cellCenter(
  cols: number,
  rows: number,
  tileSize: number,
  row: number,
  col: number
): { x: number; z: number } {
  const halfX = (cols * tileSize) / 2;
  const halfZ = (rows * tileSize) / 2;
  return {
    x: round((col + 0.5) * tileSize - halfX),
    z: round((row + 0.5) * tileSize - halfZ)
  };
}

export function editorMapToJson(map: EditorMap): EditorMapJson {
  const respawns: RespawnPoint[] = [];
  for (const team of ['blue', 'red'] as const) {
    const base = map.bases[team];
    if (!base) continue;
    const center = cellCenter(map.cols, map.rows, map.meta.tileSize, base.row, base.col);
    respawns.push({
      team,
      x: center.x,
      z: center.z,
      radius: round(base.radius)
    });
  }

  const blue = respawns.find((respawn) => respawn.team === 'blue');
  const spawn = map.spawn
    ? { x: round(map.spawn.x), z: round(map.spawn.z) }
    : { x: blue?.x ?? 0, z: blue?.z ?? 0 };

  const json: EditorMapJson = {
    $schema: './map.schema.json',
    id: map.meta.id.trim(),
    name: map.meta.name.trim(),
    tileSize: round(map.meta.tileSize),
    waterHeight: round(map.meta.waterHeight),
    spawn,
    respawns,
    tiles: cloneTiles(map.tiles)
  };
  const mountains = cloneMountains(map.mountains);
  if (mountains.length > 0) json.mountains = mountains;
  return json;
}

/** Importa un mapa del juego (o exportado por el editor) y lo adapta al editor. */
export function editorMapFromJson(raw: unknown): EditorMap {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : 'mapa-importado';
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : id;
  const parsed = parseMap(raw, { id, name, file: `${id}.json` });

  const cols = parsed.tiles[0]?.length ?? 0;
  const rows = parsed.tiles.length;
  const halfX = (cols * parsed.tileSize) / 2;
  const halfZ = (rows * parsed.tileSize) / 2;
  const toCol = (coordinate: number): number =>
    clamp(Math.floor((coordinate + halfX) / parsed.tileSize), 0, cols - 1);
  const toRow = (coordinate: number): number =>
    clamp(Math.floor((coordinate + halfZ) / parsed.tileSize), 0, rows - 1);

  const bases: EditorBases = {};
  for (const respawn of parsed.respawns) {
    if (bases[respawn.team]) continue;
    bases[respawn.team] = {
      team: respawn.team,
      row: toRow(respawn.z),
      col: toCol(respawn.x),
      radius: respawn.radius
    };
  }

  // El borrador rellena con el terreno más común, para que al ampliar el mapa
  // el borde nuevo se parezca al resto.
  const counts = new Map<TerrainId, number>();
  for (const row of parsed.tiles) {
    for (const terrain of row) counts.set(terrain, (counts.get(terrain) ?? 0) + 1);
  }
  let background: TerrainId = 'jungle';
  let best = -1;
  for (const terrain of TERRAIN_IDS) {
    const count = counts.get(terrain) ?? 0;
    if (count > best) {
      best = count;
      background = terrain;
    }
  }

  return {
    meta: {
      id,
      name,
      tileSize: parsed.tileSize,
      waterHeight: parsed.waterHeight,
      baseRadius: bases.blue?.radius ?? bases.red?.radius ?? EDITOR_DEFAULT_BASE_RADIUS
    },
    cols,
    rows,
    background,
    tiles: cloneTiles(parsed.tiles),
    bases,
    mountains: cloneMountains(parsed.mountains),
    spawn: { ...parsed.spawn }
  };
}

export function validateEditorMap(map: EditorMap): string[] {
  const issues: string[] = [];
  const id = map.meta.id.trim();
  if (!id) {
    issues.push('El id no puede estar vacío.');
  } else if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
    issues.push('El id solo puede usar letras, números, guiones y guiones bajos.');
  }
  if (!map.meta.name.trim()) issues.push('El nombre no puede estar vacío.');
  if (!(map.meta.tileSize > 0)) issues.push('El tamaño de celda debe ser mayor que cero.');
  if (!Number.isFinite(map.meta.waterHeight)) {
    issues.push('La altura del agua debe ser un número.');
  }
  if (!(map.meta.baseRadius > 0)) {
    issues.push('El radio de base debe ser mayor que cero.');
  }
  for (const base of [map.bases.blue, map.bases.red]) {
    if (base && !(base.radius > 0)) {
      issues.push(`El radio de la base ${base.team === 'blue' ? 'azul' : 'roja'} debe ser mayor que cero.`);
    }
  }
  if (map.cols < EDITOR_MIN_SIZE || map.cols > EDITOR_MAX_SIZE) {
    issues.push(`El ancho de la rejilla debe estar entre ${EDITOR_MIN_SIZE} y ${EDITOR_MAX_SIZE}.`);
  }
  if (map.rows < EDITOR_MIN_SIZE || map.rows > EDITOR_MAX_SIZE) {
    issues.push(`El alto de la rejilla debe estar entre ${EDITOR_MIN_SIZE} y ${EDITOR_MAX_SIZE}.`);
  }
  if (!map.bases.blue) issues.push('Falta la base azul.');
  if (!map.bases.red) issues.push('Falta la base roja.');
  map.mountains.forEach((range, index) => {
    if (!(range.width > 0)) {
      issues.push(`El ancho de la cordillera ${index + 1} debe ser mayor que cero.`);
    }
    if (range.points.length < 2) {
      issues.push(`La cordillera ${index + 1} necesita al menos dos puntos.`);
    }
    if (range.points.some(([x, z]) => !Number.isFinite(x) || !Number.isFinite(z))) {
      issues.push(`La cordillera ${index + 1} tiene un punto no válido.`);
    }
  });
  if (
    map.tiles.length !== map.rows ||
    map.tiles.some(
      (row) => row.length !== map.cols || row.some((terrain) => !isTerrainId(terrain))
    )
  ) {
    issues.push('La rejilla no coincide con el ancho y el alto, o contiene un terreno desconocido.');
  }
  return issues;
}

/** Comprueba la forma mínima de un borrador guardado en localStorage. */
export function isEditorMap(value: unknown): value is EditorMap {
  if (!value || typeof value !== 'object') return false;
  const map = value as Partial<EditorMap>;
  if (!map.meta || typeof map.meta !== 'object') return false;
  if (typeof map.meta.id !== 'string' || typeof map.meta.name !== 'string') return false;
  if (typeof map.meta.tileSize !== 'number' || typeof map.meta.waterHeight !== 'number') return false;
  if (typeof map.meta.baseRadius !== 'number') return false;
  if (
    typeof map.cols !== 'number' ||
    typeof map.rows !== 'number' ||
    typeof map.background !== 'string'
  ) {
    return false;
  }
  if (!isTerrainId(map.background)) return false;
  if (!Array.isArray(map.tiles) || map.tiles.length !== map.rows) return false;
  if (!map.tiles.every((row) => Array.isArray(row) && row.length === map.cols)) return false;
  if (!map.tiles.every((row) => row.every((terrain) => isTerrainId(terrain)))) return false;
  if (!map.bases || typeof map.bases !== 'object') return false;
  if (map.mountains !== undefined) {
    if (!Array.isArray(map.mountains)) return false;
    const validMountains = map.mountains.every(
      (range) =>
        range &&
        typeof range.width === 'number' &&
        Array.isArray(range.points) &&
        range.points.length >= 2 &&
        range.points.every(
          (point) =>
            Array.isArray(point) &&
            typeof point[0] === 'number' &&
            typeof point[1] === 'number'
        )
    );
    if (!validMountains) return false;
  }
  if (
    map.spawn !== undefined &&
    (!map.spawn ||
      typeof map.spawn !== 'object' ||
      typeof map.spawn.x !== 'number' ||
      typeof map.spawn.z !== 'number')
  ) {
    return false;
  }
  return true;
}

/**
 * Normaliza un borrador guardado en localStorage. Los borradores antiguos
 * guardaban un único `size` cuadrado; ahora se usan `cols` y `rows`.
 */
export function readEditorDraft(value: unknown): EditorMap | null {
  if (isEditorMap(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.size !== 'number') return null;
  const migrated = { ...raw, cols: raw.size, rows: raw.size };
  return isEditorMap(migrated) ? migrated : null;
}
