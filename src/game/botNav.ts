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

/**
 * Resultado de una búsqueda de ruta. `unreachable` significa que A* agotó el
 * mapa sin llegar al destino; `budget` que se quedó sin presupuesto y conviene
 * reintentar en otro frame. En ambos casos `points` puede contener una ruta
 * parcial hacia el punto explorado más cercano.
 */
export type NavPathStatus = 'ok' | 'unreachable' | 'budget';

export interface NavPathResult {
  points: NavPoint[];
  status: NavPathStatus;
}

/** Zona de peligro persistente que la ruta debe evitar si puede. */
export interface NavHazard {
  x: number;
  z: number;
  radius: number;
}

/** Preferencias de coste para una ruta concreta. */
export interface NavPathOptions {
  /** Tipos del Pokémon: el terreno cómodo cuesta menos y el hostil más. */
  types?: readonly string[];
  /** Penaliza más las celdas abiertas para buscar cobertura al huir. */
  preferConcealment?: boolean;
  /** Áreas enemigas que conviene rodear. */
  hazards?: readonly NavHazard[];
}

/** Tope de expansiones de una sola búsqueda de A*. */
const PATHFINDING_MAX_ITERATIONS = 6000;
/**
 * Presupuesto de expansiones por frame compartido por todos los bots. Varias
 * búsquedas completas caben de sobra; si coinciden muchas, las últimas reciben
 * una ruta parcial en vez de bloquear el frame.
 */
const PATHFINDING_BUDGET_PER_FRAME = 24000;

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

  // Buffers reutilizados por cada búsqueda de A*. Se reservan una sola vez y se
  // invalidan con `visitStamp`, así que no generan basura en cada ruta.
  private readonly gScore: Float32Array;
  private readonly cameFrom: Int32Array;
  private readonly closed: Uint8Array;
  private readonly stepCostCache: Float32Array;
  private readonly visitStamp: Uint32Array;
  private searchId = 0;

  // Heap indexado con decrease-key: un nodo vive como mucho una vez en la cola.
  private readonly heap: Int32Array;
  private readonly heapPosition: Int32Array;
  private readonly heapScore: Float32Array;
  private heapSize = 0;

  private frameBudget = PATHFINDING_BUDGET_PER_FRAME;
  private cacheStart = -1;
  private cacheGoal = -1;
  private cacheTypeHash = 0;
  private cacheHazardHash = 0;
  private cachePreferConcealment = false;
  private cachePath: NavPoint[] | null = null;
  private cacheStatus: NavPathStatus = 'ok';

  constructor(colliders: readonly Collider[]) {
    this.rows = mapRows();
    this.cols = mapCols();
    this.tileSize = mapTileSize();
    this.halfX = mapHalfWidth();
    this.halfZ = mapHalfDepth();
    this.radius = CONFIG.player.radius + 0.08;
    const total = this.rows * this.cols;
    this.blocked = new Uint8Array(total);

    this.gScore = new Float32Array(total);
    this.cameFrom = new Int32Array(total);
    this.closed = new Uint8Array(total);
    this.stepCostCache = new Float32Array(total);
    this.visitStamp = new Uint32Array(total);
    this.heap = new Int32Array(total);
    this.heapPosition = new Int32Array(total);
    this.heapScore = new Float32Array(total);

    this.markDeepWater();
    for (const collider of colliders) this.markCollider(collider);
  }

  /** Reinicia el presupuesto y la caché de rutas al empezar un frame. */
  beginFrame(): void {
    this.frameBudget = PATHFINDING_BUDGET_PER_FRAME;
    this.cachePath = null;
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
   * Ruta de centros de celda desde `(sx, sz)` hasta `(gx, gz)`. El resultado
   * incluye un estado: si el destino es inalcanzable devuelve la ruta al punto
   * explorado más cercano para que el bot pueda decidir si abandona el objetivo
   * en vez de quedarse empujando un muro.
   */
  findPath(
    sx: number,
    sz: number,
    gx: number,
    gz: number,
    options: NavPathOptions = {}
  ): NavPathResult {
    const startCell = this.worldToCell(sx, sz);
    const goalCell = this.worldToCell(gx, gz);
    const start = this.nearestWalkable(startCell.row, startCell.col);
    const goal = this.nearestWalkable(goalCell.row, goalCell.col);
    if (!start || !goal) return { points: [], status: 'unreachable' };

    const startIndex = this.index(start.row, start.col);
    const goalIndex = this.index(goal.row, goal.col);
    if (startIndex === goalIndex) {
      return {
        points: [this.cellCenter(goal.row, goal.col)],
        status: 'ok'
      };
    }

    const preferConcealment = options.preferConcealment === true;
    const typeHash = this.hashTypes(options.types);
    const hazardHash = this.hashHazards(options.hazards);
    // Varios bots pueden pedir la misma ruta dentro del mismo frame (por
    // ejemplo, dos rezagados hacia la misma base). Se devuelve una copia porque
    // `followPath` consume la ruta con `shift`.
    if (
      this.cachePath !== null &&
      this.cacheStart === startIndex &&
      this.cacheGoal === goalIndex &&
      this.cacheTypeHash === typeHash &&
      this.cacheHazardHash === hazardHash &&
      this.cachePreferConcealment === preferConcealment
    ) {
      return {
        points: this.cachePath.slice(),
        status: this.cacheStatus
      };
    }

    if (this.frameBudget <= 0) return { points: [], status: 'budget' };
    // El presupuesto del frame puede dejar la búsqueda a medias aunque el
    // destino sí tenga ruta. Solo se declara inalcanzable cuando la búsqueda
    // tuvo su tope completo y aun así no llegó.
    const budgetLimited = this.frameBudget < PATHFINDING_MAX_ITERATIONS;

    this.beginSearch();
    this.ensureVisited(startIndex);
    this.gScore[startIndex] = 0;
    const startHeuristic = this.heuristic(startIndex, goal.row, goal.col);
    this.heapPush(startIndex, startHeuristic);
    let bestIndex = startIndex;
    let bestScore = startHeuristic;
    const maxIterations = Math.min(
      PATHFINDING_MAX_ITERATIONS,
      this.frameBudget
    );
    let iterations = 0;
    let reachedGoal = false;

    while (this.heapSize > 0 && iterations < maxIterations) {
      iterations++;
      const index = this.heapPop();
      if (index < 0) break;
      if (this.closed[index]) continue;
      this.closed[index] = 1;
      if (index === goalIndex) {
        bestIndex = index;
        reachedGoal = true;
        break;
      }

      const score = this.heuristic(index, goal.row, goal.col);
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
        this.ensureVisited(nextIndex);
        if (this.closed[nextIndex]) continue;
        const tentative =
          this.gScore[index] + cost * this.stepCostFor(nr, nc, options);
        if (tentative >= this.gScore[nextIndex]) continue;
        this.gScore[nextIndex] = tentative;
        this.cameFrom[nextIndex] = index;
        this.heapPush(
          nextIndex,
          tentative + this.heuristic(nextIndex, goal.row, goal.col)
        );
      }
    }
    this.frameBudget -= iterations;
    const status: NavPathStatus = reachedGoal
      ? 'ok'
      : budgetLimited
        ? 'budget'
        : 'unreachable';

    const cells: NavPoint[] = [];
    let cursor = bestIndex;
    while (cursor !== -1) {
      const row = Math.floor(cursor / this.cols);
      const col = cursor % this.cols;
      cells.push(this.cellCenter(row, col));
      if (cursor === startIndex) break;
      cursor = this.cameFrom[cursor];
    }
    cells.reverse();
    const result = this.simplify(cells, options);
    this.cacheStart = startIndex;
    this.cacheGoal = goalIndex;
    this.cacheTypeHash = typeHash;
    this.cacheHazardHash = hazardHash;
    this.cachePreferConcealment = preferConcealment;
    this.cachePath = result.slice();
    this.cacheStatus = status;
    return { points: result, status };
  }

  /** Prepara una búsqueda nueva invalidando los buffers sin recorrerlos. */
  private beginSearch(): void {
    this.searchId = (this.searchId + 1) >>> 0;
    if (this.searchId === 0) {
      this.visitStamp.fill(0);
      this.searchId = 1;
    }
    this.heapSize = 0;
  }

  /**
   * Marca un nodo como perteneciente a la búsqueda actual e inicializa sus
   * valores. La marca evita limpiar los cuatro buffers completos en cada ruta.
   */
  private ensureVisited(index: number): void {
    if (this.visitStamp[index] === this.searchId) return;
    this.visitStamp[index] = this.searchId;
    this.gScore[index] = Infinity;
    this.cameFrom[index] = -1;
    this.closed[index] = 0;
    this.stepCostCache[index] = 0;
    this.heapPosition[index] = -1;
    this.heapScore[index] = Infinity;
  }

  private stepCostFor(
    row: number,
    col: number,
    options: NavPathOptions
  ): number {
    const index = this.index(row, col);
    let value = this.stepCostCache[index];
    if (value === 0) {
      value = this.terrainStepCost(row, col, options);
      this.stepCostCache[index] = value;
    }
    return value;
  }

  private heuristic(index: number, goalRow: number, goalCol: number): number {
    const row = Math.floor(index / this.cols);
    const col = index % this.cols;
    const dr = Math.abs(row - goalRow);
    const dc = Math.abs(col - goalCol);
    return Math.max(dr, dc) + (Math.SQRT2 - 1) * Math.min(dr, dc);
  }

  private hashHazards(hazards?: readonly NavHazard[]): number {
    if (!hazards || hazards.length === 0) return 0;
    let hash = 23;
    for (const hazard of hazards) {
      hash = (hash * 31 + Math.round(hazard.x * 100)) | 0;
      hash = (hash * 31 + Math.round(hazard.z * 100)) | 0;
      hash = (hash * 31 + Math.round(hazard.radius * 100)) | 0;
    }
    return hash;
  }

  private hashTypes(types?: readonly string[]): number {
    if (!types) return 0;
    let hash = 17;
    for (const type of types) {
      hash = (hash * 31 + type.length) | 0;
      for (let i = 0; i < type.length; i++) {
        hash = (hash * 31 + type.charCodeAt(i)) | 0;
      }
    }
    return hash;
  }

  private heapPush(index: number, f: number): void {
    const position = this.heapPosition[index];
    if (position >= 0) {
      if (f >= this.heapScore[index]) return;
      this.heapScore[index] = f;
      this.heapSiftUp(position);
      return;
    }
    const slot = this.heapSize++;
    this.heap[slot] = index;
    this.heapPosition[index] = slot;
    this.heapScore[index] = f;
    this.heapSiftUp(slot);
  }

  private heapPop(): number {
    if (this.heapSize === 0) return -1;
    const top = this.heap[0];
    const lastSlot = --this.heapSize;
    this.heapPosition[top] = -1;
    if (lastSlot > 0) {
      const last = this.heap[lastSlot];
      this.heap[0] = last;
      this.heapPosition[last] = 0;
      this.heapSiftDown(0);
    }
    return top;
  }

  private heapSiftUp(start: number): void {
    let position = start;
    const index = this.heap[position];
    const f = this.heapScore[index];
    while (position > 0) {
      const parentPosition = (position - 1) >> 1;
      const parent = this.heap[parentPosition];
      if (this.heapScore[parent] <= f) break;
      this.heap[position] = parent;
      this.heapPosition[parent] = position;
      position = parentPosition;
    }
    this.heap[position] = index;
    this.heapPosition[index] = position;
  }

  private heapSiftDown(start: number): void {
    let position = start;
    for (;;) {
      const left = position * 2 + 1;
      if (left >= this.heapSize) break;
      const right = left + 1;
      let smallest = left;
      if (
        right < this.heapSize &&
        this.heapScore[this.heap[right]] < this.heapScore[this.heap[left]]
      ) {
        smallest = right;
      }
      if (this.heapScore[this.heap[smallest]] >= this.heapScore[this.heap[position]]) {
        break;
      }
      const swap = this.heap[smallest];
      this.heap[smallest] = this.heap[position];
      this.heapPosition[this.heap[position]] = smallest;
      this.heap[position] = swap;
      this.heapPosition[swap] = position;
      position = smallest;
    }
  }

  /**
   * ¿Se puede ir en línea recta sin pisar una celda bloqueada? Si se pasan
   * peligros, tampoco vale la línea si cruza su radio.
   */
  lineClear(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    hazards?: readonly NavHazard[]
  ): boolean {
    const distance = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(distance / 0.28));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      // Se calcula la celda directamente para no crear un objeto por paso:
      // `simplify` llama a `lineClear` muchas veces por ruta.
      const col = Math.max(
        0,
        Math.min(this.cols - 1, Math.floor((x + this.halfX) / this.tileSize))
      );
      const row = Math.max(
        0,
        Math.min(this.rows - 1, Math.floor((z + this.halfZ) / this.tileSize))
      );
      if (this.blocked[this.index(row, col)] !== 0) return false;
      if (hazards && hazards.length > 0) {
        for (const hazard of hazards) {
          if (Math.hypot(x - hazard.x, z - hazard.z) <= hazard.radius) {
            return false;
          }
        }
      }
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
    let cost = 1;
    const types = options.types;
    if (types && types.length > 0) {
      const terrain = terrainAtCell(row, col);
      const speed = terrainSpeedEffect(terrain, types).multiplier;
      const concealment = terrainConcealment(terrain, types).value;
      cost = Math.max(1, 1 / Math.max(0.5, speed));
      if (speed < 0.9) cost += 0.18;
      cost += (1 - concealment) * (options.preferConcealment ? 0.28 : 0.06);
    }

    const hazards = options.hazards;
    if (hazards && hazards.length > 0) {
      const x = (col + 0.5) * this.tileSize - this.halfX;
      const z = (row + 0.5) * this.tileSize - this.halfZ;
      for (const hazard of hazards) {
        if (Math.hypot(x - hazard.x, z - hazard.z) <= hazard.radius) {
          // Penalización alta pero finita: si no hay ruta alternativa, cruzará
          // el área en vez de quedarse sin camino.
          cost += 8;
          break;
        }
      }
    }
    return cost;
  }

  private simplify(
    points: NavPoint[],
    options: NavPathOptions
  ): NavPoint[] {
    if (points.length <= 2) return points;
    const result: NavPoint[] = [];
    let anchor = points[0];
    let cursor = 0;
    while (cursor < points.length - 1) {
      let next = points.length - 1;
      while (
        next > cursor + 1 &&
        !this.lineClear(
          anchor.x,
          anchor.z,
          points[next].x,
          points[next].z,
          options.hazards
        )
      ) {
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
