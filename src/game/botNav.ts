/**
 * Rejilla de navegación para los bots.
 *
 * El mapa ya define una rejilla de terreno, pero los árboles, rocas y
 * separadores son colliders sueltos. Aquí se rasterizan sobre esa rejilla y se
 * marca también el agua profunda, de modo que A* pueda trazar rutas que el
 * cuerpo del Pokémon puede seguir de verdad.
 *
 * Es un módulo puro (sin PlayCanvas): recibe los colliders y consulta el mapa
 * activo de `terrain.ts`.
 */

import { CONFIG } from './config';
import {
  mapCols,
  mapHalfDepth,
  mapHalfWidth,
  mapRows,
  mapTileSize,
  onMountain,
  terrainAtCell
} from './terrain';
import { terrainSpeedEffect } from './terrainSpeed';
import { terrainConcealment } from './vision';
import type { Collider } from './world';

export interface NavPoint {
  x: number;
  z: number;
  row: number;
  col: number;
}

/** Preferencias de coste para una ruta concreta. */
export interface NavPathOptions {
  /** Tipos del Pokémon: el terreno cómodo cuesta menos y el hostil más. */
  types?: readonly string[];
  /** Penaliza más las celdas abiertas para buscar cobertura al huir. */
  preferConcealment?: boolean;
}

interface OpenNode {
  index: number;
  f: number;
}

/** Montículo binario mínimo para la cola de abiertos de A*. */
class MinHeap {
  private data: OpenNode[] = [];

  get size(): number {
    return this.data.length;
  }

  push(node: OpenNode): void {
    const data = this.data;
    data.push(node);
    let index = data.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (data[parent].f <= data[index].f) break;
      [data[parent], data[index]] = [data[index], data[parent]];
      index = parent;
    }
  }

  pop(): OpenNode | null {
    const data = this.data;
    if (data.length === 0) return null;
    const top = data[0];
    const last = data.pop();
    if (data.length === 0 || !last) return top;
    data[0] = last;
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < data.length && data[left].f < data[smallest].f) smallest = left;
      if (right < data.length && data[right].f < data[smallest].f) smallest = right;
      if (smallest === index) break;
      [data[smallest], data[index]] = [data[index], data[smallest]];
      index = smallest;
    }
    return top;
  }
}

const NEIGHBOURS: ReadonlyArray<{ dr: number; dc: number; cost: number }> = [
  { dr: 1, dc: 0, cost: 1 },
  { dr: -1, dc: 0, cost: 1 },
  { dr: 0, dc: 1, cost: 1 },
  { dr: 0, dc: -1, cost: 1 },
  { dr: 1, dc: 1, cost: Math.SQRT2 },
  { dr: 1, dc: -1, cost: Math.SQRT2 },
  { dr: -1, dc: 1, cost: Math.SQRT2 },
  { dr: -1, dc: -1, cost: Math.SQRT2 }
];

export class BotNavGrid {
  readonly rows: number;
  readonly cols: number;
  readonly tileSize: number;
  readonly halfX: number;
  readonly halfZ: number;

  private readonly blocked: Uint8Array;
  private readonly radius: number;

  constructor(colliders: readonly Collider[]) {
    this.rows = mapRows();
    this.cols = mapCols();
    this.tileSize = mapTileSize();
    this.halfX = mapHalfWidth();
    this.halfZ = mapHalfDepth();
    this.radius = CONFIG.player.radius + 0.08;
    this.blocked = new Uint8Array(this.rows * this.cols);

    this.markDeepWater();
    for (const collider of colliders) this.markCollider(collider);
  }

  private index(row: number, col: number): number {
    return row * this.cols + col;
  }

  isWalkable(row: number, col: number): boolean {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return false;
    return this.blocked[this.index(row, col)] === 0;
  }

  worldToCell(x: number, z: number): { row: number; col: number } {
    const col = Math.floor((x + this.halfX) / this.tileSize);
    const row = Math.floor((z + this.halfZ) / this.tileSize);
    return {
      row: Math.max(0, Math.min(this.rows - 1, row)),
      col: Math.max(0, Math.min(this.cols - 1, col))
    };
  }

  cellCenter(row: number, col: number): NavPoint {
    return {
      row,
      col,
      x: (col + 0.5) * this.tileSize - this.halfX,
      z: (row + 0.5) * this.tileSize - this.halfZ
    };
  }

  /** Celda transitable más cercana; la propia si ya lo es. */
  nearestWalkable(row: number, col: number): { row: number; col: number } | null {
    if (this.isWalkable(row, col)) return { row, col };
    const maxRing = Math.max(this.rows, this.cols);
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.abs(dr) !== ring && Math.abs(dc) !== ring) continue;
          const r = row + dr;
          const c = col + dc;
          if (this.isWalkable(r, c)) return { row: r, col: c };
        }
      }
    }
    return null;
  }

  /**
   * Ruta de centros de celda desde `(sx, sz)` hasta `(gx, gz)`. Si el destino
   * es inalcanzable devuelve la ruta al punto explorado más cercano, para que
   * el bot no se quede parado contra un muro.
   */
  findPath(
    sx: number,
    sz: number,
    gx: number,
    gz: number,
    options: NavPathOptions = {}
  ): NavPoint[] {
    const startCell = this.worldToCell(sx, sz);
    const goalCell = this.worldToCell(gx, gz);
    const start = this.nearestWalkable(startCell.row, startCell.col);
    const goal = this.nearestWalkable(goalCell.row, goalCell.col);
    if (!start || !goal) return [];

    const startIndex = this.index(start.row, start.col);
    const goalIndex = this.index(goal.row, goal.col);
    if (startIndex === goalIndex) return [this.cellCenter(goal.row, goal.col)];

    const total = this.rows * this.cols;
    const gScore = new Float32Array(total);
    gScore.fill(Infinity);
    const cameFrom = new Int32Array(total);
    cameFrom.fill(-1);
    const closed = new Uint8Array(total);
    const stepCostCache = new Float32Array(total);
    const open = new MinHeap();
    const stepCost = (row: number, col: number): number => {
      const cacheIndex = this.index(row, col);
      let value = stepCostCache[cacheIndex];
      if (value === 0) {
        value = this.terrainStepCost(row, col, options);
        stepCostCache[cacheIndex] = value;
      }
      return value;
    };

    const heuristic = (index: number): number => {
      const row = Math.floor(index / this.cols);
      const col = index % this.cols;
      const dr = Math.abs(row - goal.row);
      const dc = Math.abs(col - goal.col);
      return Math.max(dr, dc) + (Math.SQRT2 - 1) * Math.min(dr, dc);
    };

    gScore[startIndex] = 0;
    open.push({ index: startIndex, f: heuristic(startIndex) });
    let bestIndex = startIndex;
    let bestScore = heuristic(startIndex);
    let iterations = 0;

    while (open.size > 0 && iterations < 6000) {
      iterations++;
      const current = open.pop();
      if (!current) break;
      const index = current.index;
      if (closed[index]) continue;
      closed[index] = 1;
      if (index === goalIndex) {
        bestIndex = index;
        break;
      }

      const score = heuristic(index);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }

      const row = Math.floor(index / this.cols);
      const col = index % this.cols;
      for (const { dr, dc, cost } of NEIGHBOURS) {
        const nr = row + dr;
        const nc = col + dc;
        if (!this.isWalkable(nr, nc)) continue;
        // Sin cortar esquinas en diagonal: ambos ortogonales deben ser libres.
        if (dr !== 0 && dc !== 0) {
          if (!this.isWalkable(row, nc) || !this.isWalkable(nr, col)) continue;
        }
        const nextIndex = this.index(nr, nc);
        if (closed[nextIndex]) continue;
        const tentative = gScore[index] + cost * stepCost(nr, nc);
        if (tentative >= gScore[nextIndex]) continue;
        gScore[nextIndex] = tentative;
        cameFrom[nextIndex] = index;
        open.push({ index: nextIndex, f: tentative + heuristic(nextIndex) });
      }
    }

    const cells: NavPoint[] = [];
    let cursor = bestIndex;
    while (cursor !== -1) {
      const row = Math.floor(cursor / this.cols);
      const col = cursor % this.cols;
      cells.push(this.cellCenter(row, col));
      if (cursor === startIndex) break;
      cursor = cameFrom[cursor];
    }
    cells.reverse();
    return this.simplify(cells);
  }

  /** ¿Se puede ir en línea recta sin pisar una celda bloqueada? */
  lineClear(ax: number, az: number, bx: number, bz: number): boolean {
    const distance = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(distance / 0.28));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const cell = this.worldToCell(x, z);
      if (!this.isWalkable(cell.row, cell.col)) return false;
    }
    return true;
  }

  /**
   * Coste de entrar en una celda. Nunca baja de 1 para que la heurística de A*
   * siga siendo admisible. El terreno hostil cuesta más, el propio algo menos,
   * y la cobertura abarata relativamente las celdas ocultas.
   */
  private terrainStepCost(
    row: number,
    col: number,
    options: NavPathOptions
  ): number {
    const types = options.types;
    if (!types || types.length === 0) return 1;
    const terrain = terrainAtCell(row, col);
    const speed = terrainSpeedEffect(terrain, types).multiplier;
    const concealment = terrainConcealment(terrain, types).value;
    let cost = Math.max(1, 1 / Math.max(0.5, speed));
    if (speed < 0.9) cost += 0.18;
    cost += (1 - concealment) * (options.preferConcealment ? 0.28 : 0.06);
    return cost;
  }

  private simplify(points: NavPoint[]): NavPoint[] {
    if (points.length <= 2) return points;
    const result: NavPoint[] = [];
    let anchor = points[0];
    let cursor = 0;
    while (cursor < points.length - 1) {
      let next = points.length - 1;
      while (next > cursor + 1 && !this.lineClear(anchor.x, anchor.z, points[next].x, points[next].z)) {
        next--;
      }
      result.push(points[next]);
      anchor = points[next];
      cursor = next;
    }
    return result;
  }

  private markDeepWater(): void {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (terrainAtCell(row, col) === 'waterHigh') {
          this.blocked[this.index(row, col)] = 1;
        }
      }
    }
  }

  private markCollider(collider: Collider): void {
    if (collider.type === 'circle') {
      this.markCircle(collider.x, collider.z, collider.radius + this.radius);
      return;
    }
    const distance = Math.hypot(collider.bx - collider.ax, collider.bz - collider.az);
    const steps = Math.max(1, Math.ceil(distance / (this.tileSize * 0.45)));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      this.markCircle(
        collider.ax + (collider.bx - collider.ax) * t,
        collider.az + (collider.bz - collider.az) * t,
        collider.radius + this.radius
      );
    }
  }

  private markCircle(x: number, z: number, radius: number): void {
    const minCol = Math.floor((x - radius + this.halfX) / this.tileSize);
    const maxCol = Math.floor((x + radius + this.halfX) / this.tileSize);
    const minRow = Math.floor((z - radius + this.halfZ) / this.tileSize);
    const maxRow = Math.floor((z + radius + this.halfZ) / this.tileSize);

    for (let row = Math.max(0, minRow); row <= Math.min(this.rows - 1, maxRow); row++) {
      for (let col = Math.max(0, minCol); col <= Math.min(this.cols - 1, maxCol); col++) {
        const cell = this.cellCenter(row, col);
        const half = this.tileSize * 0.5;
        const dx = Math.max(0, Math.abs(x - cell.x) - half);
        const dz = Math.max(0, Math.abs(z - cell.z) - half);
        if (dx * dx + dz * dz < radius * radius) {
          this.blocked[this.index(row, col)] = 1;
        }
        // Un separador que corta una celda por la mitad también la bloquea.
        if (onMountain(cell.x, cell.z)) {
          this.blocked[this.index(row, col)] = 1;
        }
      }
    }
  }
}
