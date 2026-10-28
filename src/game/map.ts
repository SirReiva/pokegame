/**
 * Carga y validación de mapas definidos en JSON.
 *
 * `public/maps/index.json` lista los mapas disponibles y cada archivo declara
 * una rejilla de terrenos, los respawns de los equipos y las cordilleras. Los
 * mapas se cargan por `fetch`, así que se pueden editar sin recompilar la demo.
 */

import {
  TERRAIN_IDS,
  isTerrainId,
  type GameMap,
  type MountainRange,
  type RespawnPoint,
  type Team,
  type TerrainId
} from './terrain';

export interface MapIndexEntry {
  id: string;
  name: string;
  file: string;
  description?: string;
}

interface MapIndexFile {
  maps?: unknown;
}

const BASE_URL = import.meta.env.BASE_URL;

function mapsUrl(file: string): string {
  return `${BASE_URL}maps/${file.replace(/^\/+/, '')}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${url} (HTTP ${response.status})`);
  }
  return response.json();
}

export async function loadMapIndex(): Promise<MapIndexEntry[]> {
  const data = (await fetchJson(mapsUrl('index.json'))) as MapIndexFile | unknown[] | null;
  if (!data || typeof data !== 'object') {
    throw new Error('public/maps/index.json no contiene un objeto válido');
  }
  const rawMaps = Array.isArray(data) ? data : data.maps;
  if (!Array.isArray(rawMaps) || rawMaps.length === 0) {
    throw new Error('public/maps/index.json debe contener una lista "maps" no vacía');
  }

  return rawMaps.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Entrada ${index + 1} de maps/index.json no válida`);
    }
    const entry = raw as Record<string, unknown>;
    const id = typeof entry.id === 'string' ? entry.id : '';
    const name = typeof entry.name === 'string' ? entry.name : id;
    const file = typeof entry.file === 'string' ? entry.file : `${id}.json`;
    if (!id) throw new Error(`La entrada ${index + 1} del índice no tiene "id"`);
    if (!file) throw new Error(`El mapa "${id}" no tiene "file"`);
    return {
      id,
      name: name || id,
      file,
      description: typeof entry.description === 'string' ? entry.description : undefined
    };
  });
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`El campo "${label}" debe ser un número`);
  }
  return value;
}

function parseRespawns(raw: unknown): RespawnPoint[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('El mapa debe declarar al menos un respawn');
  }

  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`El respawn ${index + 1} no es un objeto`);
    }
    const value = entry as Record<string, unknown>;
    const team = value.team;
    if (team !== 'blue' && team !== 'red') {
      throw new Error(`El respawn ${index + 1} debe tener team "blue" o "red"`);
    }
    return {
      team: team as Team,
      x: number(value.x, `respawns[${index}].x`),
      z: number(value.z, `respawns[${index}].z`),
      radius:
        value.radius === undefined ? 3.6 : number(value.radius, `respawns[${index}].radius`)
    };
  });
}

function parseMountains(raw: unknown): MountainRange[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('"mountains" debe ser un array');

  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`La cordillera ${index + 1} no es un objeto`);
    }
    const value = entry as Record<string, unknown>;
    const points = value.points;
    if (!Array.isArray(points) || points.length < 2) {
      throw new Error(`La cordillera ${index + 1} necesita al menos dos puntos`);
    }
    const parsedPoints = points.map((point, pointIndex): [number, number] => {
      if (!Array.isArray(point) || point.length < 2) {
        throw new Error(
          `El punto ${pointIndex + 1} de la cordillera ${index + 1} debe ser [x, z]`
        );
      }
      return [
        number(point[0], `mountains[${index}].points[${pointIndex}][0]`),
        number(point[1], `mountains[${index}].points[${pointIndex}][1]`)
      ];
    });
    return {
      width: number(value.width, `mountains[${index}].width`),
      points: parsedPoints
    };
  });
}

function parseTiles(raw: unknown): TerrainId[][] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('El mapa necesita "tiles": un array de filas');
  }

  const rows = raw.length;
  const cols = Array.isArray(raw[0]) ? raw[0].length : 0;
  if (cols === 0) throw new Error('La primera fila de "tiles" está vacía');

  const tiles: TerrainId[][] = [];
  for (let row = 0; row < rows; row++) {
    const rawRow = raw[row];
    if (!Array.isArray(rawRow) || rawRow.length !== cols) {
      throw new Error(`La fila ${row} de "tiles" debe tener ${cols} celdas`);
    }
    const parsedRow: TerrainId[] = [];
    for (let col = 0; col < cols; col++) {
      const terrain = rawRow[col];
      if (!isTerrainId(terrain)) {
        throw new Error(
          `Tipo de terreno desconocido en tiles[${row}][${col}]: "${String(terrain)}". ` +
            `Disponibles: ${TERRAIN_IDS.join(', ')}`
        );
      }
      parsedRow.push(terrain);
    }
    tiles.push(parsedRow);
  }

  return tiles;
}

/** Convierte el JSON del mapa en un `GameMap` validado y con valores por defecto. */
export function parseMap(raw: unknown, entry: MapIndexEntry): GameMap {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`El mapa "${entry.id}" no es un objeto JSON`);
  }
  const value = raw as Record<string, unknown>;
  const tiles = parseTiles(value.tiles ?? value.terrain);
  const respawns = parseRespawns(value.respawns ?? value.spawns);
  const mountains = parseMountains(value.mountains);

  const blue = respawns.find((respawn) => respawn.team === 'blue');
  const red = respawns.find((respawn) => respawn.team === 'red');
  if (!blue || !red) {
    throw new Error('El mapa debe tener al menos un respawn azul y uno rojo');
  }

  const rawSpawn = value.spawn;
  let spawn = { x: blue.x, z: blue.z };
  if (rawSpawn !== undefined) {
    if (!rawSpawn || typeof rawSpawn !== 'object') {
      throw new Error('"spawn" debe ser un objeto { x, z }');
    }
    const point = rawSpawn as Record<string, unknown>;
    spawn = { x: number(point.x, 'spawn.x'), z: number(point.z, 'spawn.z') };
  }

  const tileSize = value.tileSize === undefined ? 1 : number(value.tileSize, 'tileSize');
  if (tileSize <= 0) throw new Error('"tileSize" debe ser mayor que cero');

  return {
    // El índice es la identidad canónica: así el selector y `?map=` siempre
    // coinciden aunque el archivo cambie su `id` interno.
    id: entry.id,
    name: typeof value.name === 'string' ? value.name : entry.name,
    tileSize,
    tiles,
    respawns,
    mountains,
    spawn,
    waterHeight:
      value.waterHeight === undefined ? 0.3 : number(value.waterHeight, 'waterHeight')
  };
}

export async function loadMap(entry: MapIndexEntry): Promise<GameMap> {
  const raw = await fetchJson(mapsUrl(entry.file));
  return parseMap(raw, entry);
}
