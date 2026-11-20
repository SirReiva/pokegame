/**
 * Modelo del editor de mapas: tipos, catálogos y mutaciones puras.
 *
 * No depende de React. El estado de la pantalla (herramienta activa, zoom,
 * selección…) vive en `MapEditorScreen`; aquí solo se guarda lo que puede
 * serializarse y lo que necesita el historial de deshacer.
 */

import {
  EDITOR_DEFAULT_SIZE,
  EDITOR_DEFAULT_TILE_SIZE,
  EDITOR_DEFAULT_WATER_HEIGHT,
  EDITOR_HISTORY_LIMIT,
  applySnapshot,
  cloneBases,
  cloneMountains,
  clonePickups,
  cloneTiles,
  readEditorDraft,
  snapshotOf,
  validateEditorMap,
  type EditorMap,
  type EditorPickup,
  type EditorSnapshot
} from '../../game/mapEditor';
import { TEAM_INFO } from '../../game/multiplayer';
import type {
  BarrierKind,
  MountainRange,
  Team,
  TerrainId
} from '../../game/terrain';
import { DRAFT_KEY } from './editorIo';

export type Tool =
  | 'pencil'
  | 'fill'
  | 'rect'
  | 'eraser'
  | 'mountain'
  | 'pickup'
  | 'base-blue'
  | 'base-red'
  | 'base-yellow'
  | 'base-green';

export interface EditorState {
  map: EditorMap | null;
  undo: EditorSnapshot[];
  redo: EditorSnapshot[];
}

export interface SetupForm {
  id: string;
  name: string;
  cols: string;
  rows: string;
  tileSize: string;
  waterHeight: string;
  fill: TerrainId;
}

export interface Cell {
  row: number;
  col: number;
}

/** Rectángulo de previsualización mientras se arrastra la herramienta. */
export interface EditorRect {
  rowA: number;
  colA: number;
  rowB: number;
  colB: number;
}

export const SIZE_PRESETS = [16, 24, 32, 48, 64, 76, 128];
export const DEFAULT_MOUNTAIN_WIDTH = 2.2;

/** Etiqueta visible de un tipo de separador. */
export function barrierLabel(kind: BarrierKind | undefined): string {
  if (kind === 'wall') return 'Muro';
  if (kind === 'volcano') return 'Volcán';
  return 'Cordillera';
}

export const TOOLS: Array<{ id: Tool; label: string; key: string; title: string }> = [
  { id: 'pencil', label: 'Lápiz', key: 'B', title: 'Pinta celdas al arrastrar' },
  { id: 'fill', label: 'Relleno', key: 'G', title: 'Rellena la región conectada del mismo terreno' },
  { id: 'rect', label: 'Rectángulo', key: 'R', title: 'Arrastra para pintar un rectángulo' },
  { id: 'eraser', label: 'Borrador', key: 'E', title: 'Pinta con el terreno de fondo' },
  {
    id: 'mountain',
    label: 'Separador',
    key: 'M',
    title: 'Cordilleras, muros y volcanes: haz clic para añadir puntos; doble clic o Enter para cerrar'
  },
  {
    id: 'pickup',
    label: 'Objeto',
    key: 'P',
    title: 'Coloca pociones en la rejilla; clic derecho elimina el objeto de la celda'
  },
  { id: 'base-blue', label: 'Base azul', key: '1', title: 'Coloca o mueve la base del equipo azul' },
  { id: 'base-red', label: 'Base roja', key: '2', title: 'Coloca o mueve la base del equipo rojo' },
  { id: 'base-yellow', label: 'Base amarilla', key: '3', title: 'Coloca o mueve la base del equipo amarillo' },
  { id: 'base-green', label: 'Base verde', key: '4', title: 'Coloca o mueve la base del equipo verde' }
];

/** Herramienta asociada a una tecla, o `null` si la tecla no cambia de herramienta. */
export function toolForKey(key: string): Tool | null {
  return TOOLS.find((entry) => entry.key.toLowerCase() === key)?.id ?? null;
}

export function loadDraft(): EditorState {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      const draft = readEditorDraft(parsed);
      if (draft) {
        return {
          map: { ...draft, mountains: draft.mountains ?? [], pickups: draft.pickups ?? [] },
          undo: [],
          redo: []
        };
      }
    }
  } catch {
    // Borrador corrupto o localStorage no disponible: se empieza de cero.
  }
  return { map: null, undo: [], redo: [] };
}

export function saveDraft(map: EditorMap | null): void {
  try {
    if (map) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(map));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Sin espacio o en modo privado: el editor sigue funcionando en memoria.
  }
}

export function setupFormFrom(map: EditorMap | null): SetupForm {
  if (map) {
    return {
      id: map.meta.id,
      name: map.meta.name,
      cols: String(map.cols),
      rows: String(map.rows),
      tileSize: String(map.meta.tileSize),
      waterHeight: String(map.meta.waterHeight),
      fill: map.background
    };
  }
  return {
    id: 'mi-mapa',
    name: 'Mi mapa',
    cols: String(EDITOR_DEFAULT_SIZE),
    rows: String(EDITOR_DEFAULT_SIZE),
    tileSize: String(EDITOR_DEFAULT_TILE_SIZE),
    waterHeight: String(EDITOR_DEFAULT_WATER_HEIGHT),
    fill: 'jungle'
  };
}

export function teamColor(team: Team): string {
  return TEAM_INFO[team].color;
}

export function teamLabel(team: Team): string {
  return TEAM_INFO[team].short;
}

/** Añade una edición al historial y descarta la pila de rehacer. */
export function applyMapEdit(
  current: EditorState,
  nextMap: EditorMap,
  pushHistory = true
): EditorState {
  if (!current.map) return current;
  return pushHistory
    ? {
        map: nextMap,
        undo: [...current.undo, snapshotOf(current.map)].slice(-EDITOR_HISTORY_LIMIT),
        redo: []
      }
    : { map: nextMap, undo: current.undo, redo: current.redo };
}

/** Estado anterior del historial, o `null` si no hay nada que deshacer. */
export function undoEdit(current: EditorState): EditorState | null {
  if (!current.map || current.undo.length === 0) return null;
  const previous = current.undo[current.undo.length - 1];
  return {
    map: applySnapshot(current.map, previous),
    undo: current.undo.slice(0, -1),
    redo: [...current.redo, snapshotOf(current.map)].slice(-EDITOR_HISTORY_LIMIT)
  };
}

/** Estado siguiente del historial, o `null` si no hay nada que rehacer. */
export function redoEdit(current: EditorState): EditorState | null {
  if (!current.map || current.redo.length === 0) return null;
  const next = current.redo[current.redo.length - 1];
  return {
    map: applySnapshot(current.map, next),
    undo: [...current.undo, snapshotOf(current.map)].slice(-EDITOR_HISTORY_LIMIT),
    redo: current.redo.slice(0, -1)
  };
}

/** Avisos de validación del mapa; vacío si está listo para exportar. */
export function mapIssues(map: EditorMap | null): string[] {
  return map ? validateEditorMap(map) : [];
}

/** Copia las celdas, aplica la mutación y devuelve el mapa nuevo si cambió. */
export function mapWithTiles(
  map: EditorMap,
  mutate: (tiles: TerrainId[][]) => boolean
): EditorMap | null {
  const tiles = cloneTiles(map.tiles);
  if (!mutate(tiles)) return null;
  return { ...map, tiles };
}

export function mapWithBases(
  map: EditorMap,
  mutate: (bases: EditorMap['bases']) => boolean
): EditorMap | null {
  const bases = cloneBases(map.bases);
  if (!mutate(bases)) return null;
  return { ...map, bases };
}

export function mapWithMountains(
  map: EditorMap,
  mutate: (mountains: MountainRange[]) => boolean
): EditorMap | null {
  const mountains = cloneMountains(map.mountains);
  if (!mutate(mountains)) return null;
  return { ...map, mountains };
}

export function mapWithPickups(
  map: EditorMap,
  mutate: (pickups: EditorPickup[]) => boolean
): EditorMap | null {
  const pickups = clonePickups(map.pickups);
  if (!mutate(pickups)) return null;
  return { ...map, pickups };
}
