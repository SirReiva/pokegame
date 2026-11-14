/**
 * Geometría del editor: conversión entre píxeles, celdas y coordenadas de
 * mundo, y búsqueda del separador o del punto más cercano al puntero.
 */

import type { EditorMap } from '../../game/mapEditor';
import type { Cell } from './editorModel';

/** Zona del canvas que ocupa la rejilla en pantalla. */
export interface PointerBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Puntero en coordenadas fraccionarias de celda. */
export interface PointerCellFloat {
  map: EditorMap;
  col: number;
  row: number;
  threshold: number;
}

export interface MountainPointHit {
  rangeIndex: number;
  pointIndex: number;
}

export interface MountainSegmentHit {
  rangeIndex: number;
  insertIndex: number;
  point: [number, number];
}

/** Celda bajo el puntero, o `null` si queda fuera de la rejilla. */
export function cellFromPointer(
  map: EditorMap,
  bounds: PointerBounds,
  clientX: number,
  clientY: number
): Cell | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const col = Math.floor(((clientX - bounds.left) / bounds.width) * map.cols);
  const row = Math.floor(((clientY - bounds.top) / bounds.height) * map.rows);
  if (row < 0 || col < 0 || row >= map.rows || col >= map.cols) return null;
  return { row, col };
}

/** Posición del puntero en coordenadas fraccionarias de celda. */
export function pointerCellFloat(
  map: EditorMap,
  bounds: PointerBounds,
  clientX: number,
  clientY: number
): PointerCellFloat | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  return {
    map,
    col: ((clientX - bounds.left) / bounds.width) * map.cols,
    row: ((clientY - bounds.top) / bounds.height) * map.rows,
    threshold: Math.min(1.5, Math.max(0.35, (10 / bounds.width) * map.cols))
  };
}

/** Punto de mundo a coordenadas fraccionarias de celda. */
export function worldToCellFloat(
  map: EditorMap,
  x: number,
  z: number
): { col: number; row: number } {
  const halfX = (map.cols * map.meta.tileSize) / 2;
  const halfZ = (map.rows * map.meta.tileSize) / 2;
  return {
    col: (x + halfX) / map.meta.tileSize,
    row: (z + halfZ) / map.meta.tileSize
  };
}

export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Punto de un separador bajo el puntero. */
export function findMountainPoint(pointer: PointerCellFloat): MountainPointHit | null {
  let best: MountainPointHit | null = null;
  let bestDistance = pointer.threshold;
  pointer.map.mountains.forEach((range, rangeIndex) => {
    range.points.forEach(([x, z], pointIndex) => {
      const point = worldToCellFloat(pointer.map, x, z);
      const distance = Math.hypot(point.col - pointer.col, point.row - pointer.row);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = { rangeIndex, pointIndex };
      }
    });
  });
  return best;
}

/** Separador cuya línea pasa cerca del puntero. */
export function findMountainLine(pointer: PointerCellFloat): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  pointer.map.mountains.forEach((range, rangeIndex) => {
    if (range.points.length < 2) return;
    const limit = Math.max(0.5, range.width / pointer.map.meta.tileSize / 2) + 0.25;
    for (let index = 1; index < range.points.length; index++) {
      const a = worldToCellFloat(pointer.map, ...range.points[index - 1]);
      const b = worldToCellFloat(pointer.map, ...range.points[index]);
      const distance = distanceToSegment(pointer.col, pointer.row, a.col, a.row, b.col, b.row);
      if (distance <= limit && distance < bestDistance) {
        bestDistance = distance;
        best = rangeIndex;
      }
    }
  });
  return best;
}

/** Tramo más cercano y punto de inserción para añadir un vértice. */
export function findMountainSegment(pointer: PointerCellFloat): MountainSegmentHit | null {
  let best: MountainSegmentHit | null = null;
  let bestDistance = Infinity;
  const halfX = (pointer.map.cols * pointer.map.meta.tileSize) / 2;
  const halfZ = (pointer.map.rows * pointer.map.meta.tileSize) / 2;

  pointer.map.mountains.forEach((range, rangeIndex) => {
    if (range.points.length < 2) return;
    const limit = Math.max(0.5, range.width / pointer.map.meta.tileSize / 2) + 0.25;
    for (let index = 1; index < range.points.length; index++) {
      const a = worldToCellFloat(pointer.map, ...range.points[index - 1]);
      const b = worldToCellFloat(pointer.map, ...range.points[index]);
      const dx = b.col - a.col;
      const dy = b.row - a.row;
      const lengthSquared = dx * dx + dy * dy;
      const t =
        lengthSquared === 0
          ? 0
          : Math.max(
              0,
              Math.min(1, ((pointer.col - a.col) * dx + (pointer.row - a.row) * dy) / lengthSquared)
            );
      const closestCol = a.col + t * dx;
      const closestRow = a.row + t * dy;
      const distance = Math.hypot(pointer.col - closestCol, pointer.row - closestRow);
      if (distance <= limit && distance < bestDistance) {
        bestDistance = distance;
        best = {
          rangeIndex,
          insertIndex: index,
          point: [
            closestCol * pointer.map.meta.tileSize - halfX,
            closestRow * pointer.map.meta.tileSize - halfZ
          ]
        };
      }
    }
  });
  return best;
}
