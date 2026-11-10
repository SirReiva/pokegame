#!/usr/bin/env node
/**
 * Genera las cinco arenas nuevas de NewPoke.
 *
 * Uso:
 *   node scripts/generate-arena-designs.mjs
 *
 * Cada arena se construye con primitivas geometricas sobre la rejilla
 * (discos, anillos, rectangulos y trazos) para que sea facil retocarlas. Al
 * terminar se valida que las bases y los objetos sean alcanzables y se
 * escriben los JSON en `public/maps/`. Despues hay que ejecutar
 * `pnpm maps:previews` para regenerar las vistas previas.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const MAPS_DIR = path.join(ROOT, "public", "maps");
const INDEX_FILE = path.join(MAPS_DIR, "index.json");

const TILE_SIZE = 0.5;
const WATER_HEIGHT = 0.3;
const BASE_RADIUS = 3.6;
const BASE_COLLIDER_RADIUS = 0.85;

// --- Rejilla y geometria ----------------------------------------------------

function makeGrid(cols, rows, fill) {
  return Array.from({ length: rows }, () => Array(cols).fill(fill));
}

function setCell(grid, col, row, terrain) {
  if (row < 0 || row >= grid.length) return;
  if (col < 0 || col >= grid[0].length) return;
  grid[row][col] = terrain;
}

/** Hash determinista para bordes irregulares y variacion de terreno. */
function hash01(col, row, seed = 0) {
  let value =
    Math.imul(col, 374761393) ^
    Math.imul(row, 668265263) ^
    Math.imul(seed, 2246822519);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

function geometry(cols, rows) {
  const halfX = (cols * TILE_SIZE) / 2;
  const halfZ = (rows * TILE_SIZE) / 2;
  return {
    cols,
    rows,
    halfX,
    halfZ,
    centerX: (col) => (col + 0.5) * TILE_SIZE - halfX,
    centerZ: (row) => (row + 0.5) * TILE_SIZE - halfZ,
    cellX: (x) => (x + halfX) / TILE_SIZE,
    cellZ: (z) => (z + halfZ) / TILE_SIZE
  };
}

function cellCenter(geo, col, row) {
  return { x: geo.centerX(col), z: geo.centerZ(row) };
}

function paintDisc(grid, geo, x, z, radius, terrain, options = {}) {
  const { rough = 0, seed = 1 } = options;
  const minCol = Math.max(0, Math.floor(geo.cellX(x - radius - rough)));
  const maxCol = Math.min(grid[0].length - 1, Math.ceil(geo.cellX(x + radius + rough)));
  const minRow = Math.max(0, Math.floor(geo.cellZ(z - radius - rough)));
  const maxRow = Math.min(grid.length - 1, Math.ceil(geo.cellZ(z + radius + rough)));

  for (let row = minRow; row <= maxRow; row++) {
    const wz = geo.centerZ(row);
    for (let col = minCol; col <= maxCol; col++) {
      const wx = geo.centerX(col);
      const jitter = rough ? (hash01(col, row, seed) - 0.5) * rough : 0;
      if (Math.hypot(wx - x, wz - z) <= radius + jitter) {
        setCell(grid, col, row, terrain);
      }
    }
  }
}

function paintRing(grid, geo, x, z, inner, outer, terrain, options = {}) {
  const { rough = 0, seed = 2 } = options;
  const minCol = Math.max(0, Math.floor(geo.cellX(x - outer - rough)));
  const maxCol = Math.min(grid[0].length - 1, Math.ceil(geo.cellX(x + outer + rough)));
  const minRow = Math.max(0, Math.floor(geo.cellZ(z - outer - rough)));
  const maxRow = Math.min(grid.length - 1, Math.ceil(geo.cellZ(z + outer + rough)));

  for (let row = minRow; row <= maxRow; row++) {
    const wz = geo.centerZ(row);
    for (let col = minCol; col <= maxCol; col++) {
      const wx = geo.centerX(col);
      const jitter = rough ? (hash01(col, row, seed) - 0.5) * rough : 0;
      const distance = Math.hypot(wx - x, wz - z);
      if (distance >= inner && distance <= outer + jitter) {
        setCell(grid, col, row, terrain);
      }
    }
  }
}

function paintRect(grid, geo, x0, z0, x1, z1, terrain) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minZ = Math.min(z0, z1);
  const maxZ = Math.max(z0, z1);
  const minCol = Math.max(0, Math.floor(geo.cellX(minX)));
  const maxCol = Math.min(grid[0].length - 1, Math.ceil(geo.cellX(maxX)));
  const minRow = Math.max(0, Math.floor(geo.cellZ(minZ)));
  const maxRow = Math.min(grid.length - 1, Math.ceil(geo.cellZ(maxZ)));

  for (let row = minRow; row <= maxRow; row++) {
    const wz = geo.centerZ(row);
    for (let col = minCol; col <= maxCol; col++) {
      const wx = geo.centerX(col);
      if (wx >= minX && wx <= maxX && wz >= minZ && wz <= maxZ) {
        setCell(grid, col, row, terrain);
      }
    }
  }
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const t =
    lengthSquared > 0
      ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / lengthSquared))
      : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function paintStroke(grid, geo, points, width, terrain) {
  if (points.length === 0) return;
  const half = width / 2;
  const minX = Math.min(...points.map(([x]) => x)) - half;
  const maxX = Math.max(...points.map(([x]) => x)) + half;
  const minZ = Math.min(...points.map(([, z]) => z)) - half;
  const maxZ = Math.max(...points.map(([, z]) => z)) + half;
  const minCol = Math.max(0, Math.floor(geo.cellX(minX)));
  const maxCol = Math.min(grid[0].length - 1, Math.ceil(geo.cellX(maxX)));
  const minRow = Math.max(0, Math.floor(geo.cellZ(minZ)));
  const maxRow = Math.min(grid.length - 1, Math.ceil(geo.cellZ(maxZ)));

  for (let row = minRow; row <= maxRow; row++) {
    const wz = geo.centerZ(row);
    for (let col = minCol; col <= maxCol; col++) {
      const wx = geo.centerX(col);
      let inside = false;
      for (let index = 1; index < points.length && !inside; index++) {
        const [ax, az] = points[index - 1];
        const [bx, bz] = points[index];
        inside = distanceToSegment(wx, wz, ax, az, bx, bz) <= half;
      }
      if (inside) setCell(grid, col, row, terrain);
    }
  }
}

function pointInPolygon(x, z, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const [xi, zi] = points[index];
    const [xj, zj] = points[previous];
    const intersects =
      zi > z !== zj > z &&
      x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function paintPolygon(grid, geo, points, terrain) {
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minZ = Math.min(...points.map(([, z]) => z));
  const maxZ = Math.max(...points.map(([, z]) => z));
  const minCol = Math.max(0, Math.floor(geo.cellX(minX)));
  const maxCol = Math.min(grid[0].length - 1, Math.ceil(geo.cellX(maxX)));
  const minRow = Math.max(0, Math.floor(geo.cellZ(minZ)));
  const maxRow = Math.min(grid.length - 1, Math.ceil(geo.cellZ(maxZ)));

  for (let row = minRow; row <= maxRow; row++) {
    const wz = geo.centerZ(row);
    for (let col = minCol; col <= maxCol; col++) {
      const wx = geo.centerX(col);
      if (pointInPolygon(wx, wz, points)) setCell(grid, col, row, terrain);
    }
  }
}

// --- Mapa ------------------------------------------------------------------

function createContext({ id, name, description, cols, rows, background = "jungle" }) {
  const geo = geometry(cols, rows);
  return {
    id,
    name,
    description,
    cols,
    rows,
    geo,
    tiles: makeGrid(cols, rows, background),
    respawns: [],
    mountains: [],
    pickups: []
  };
}

function addMountain(ctx, kind, width, points) {
  ctx.mountains.push({
    kind,
    width,
    points: points.map(([x, z]) => [Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000])
  });
}

function mountainHit(ctx, x, z, margin = 0) {
  return ctx.mountains.some((range) => {
    const half = range.width / 2 + margin;
    for (let index = 1; index < range.points.length; index++) {
      const [ax, az] = range.points[index - 1];
      const [bx, bz] = range.points[index];
      if (distanceToSegment(x, z, ax, az, bx, bz) <= half) return true;
    }
    return false;
  });
}

function baseHit(ctx, x, z, margin = 0) {
  return ctx.respawns.some(
    (base) => Math.hypot(x - base.x, z - base.z) < BASE_COLLIDER_RADIUS + margin
  );
}

function pointIssue(ctx, x, z, margin = 0.4, ignoreBases = false) {
  const { geo } = ctx;
  if (
    x < -geo.halfX + 0.5 ||
    x > geo.halfX - 0.5 ||
    z < -geo.halfZ + 0.5 ||
    z > geo.halfZ - 0.5
  ) {
    return "fuera de los limites";
  }
  const col = Math.floor(geo.cellX(x));
  const row = Math.floor(geo.cellZ(z));
  if (ctx.tiles[row]?.[col] === "waterHigh") return "en aguas profundas";
  if (mountainHit(ctx, x, z, margin)) return "dentro de un separador";
  if (!ignoreBases && baseHit(ctx, x, z, margin)) return "dentro de una base";
  return null;
}

/** Coloca un objeto en la celda libre mas cercana (prefiere terreno seco). */
function addPickup(ctx, type, x, z) {
  const { geo, tiles } = ctx;
  const centerCol = Math.floor(geo.cellX(x));
  const centerRow = Math.floor(geo.cellZ(z));

  for (const allowWet of [false, true]) {
    for (let radius = 0; radius <= 18; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
          const col = centerCol + dc;
          const row = centerRow + dr;
          if (row < 0 || row >= ctx.rows || col < 0 || col >= ctx.cols) continue;
          const terrain = tiles[row][col];
          if (terrain === "waterHigh") continue;
          if (!allowWet && (terrain === "waterLow" || terrain === "poison")) continue;
          const point = cellCenter(geo, col, row);
          if (!pointIssue(ctx, point.x, point.z, 0.45)) {
            ctx.pickups.push({
              type,
              x: Math.round(point.x * 1000) / 1000,
              z: Math.round(point.z * 1000) / 1000
            });
            return;
          }
        }
      }
    }
  }
  throw new Error(`No hay hueco para ${type} en (${x}, ${z}) del mapa ${ctx.id}`);
}

function addBase(ctx, team, x, z) {
  ctx.respawns.push({
    team,
    x: Math.round(x * 1000) / 1000,
    z: Math.round(z * 1000) / 1000,
    radius: BASE_RADIUS
  });
}

function paintBaseClearing(ctx, x, z, options = {}) {
  const { panel = "lane", plaza = "road", panelRadius = 6.6, plazaRadius = 8.6 } = options;
  paintDisc(ctx.tiles, ctx.geo, x, z, 4.4, "base", { rough: 0.4, seed: 31 });
  paintRing(ctx.tiles, ctx.geo, x, z, 4.4, panelRadius, panel);
  paintRing(ctx.tiles, ctx.geo, x, z, panelRadius, plazaRadius, plaza);
}

// --- Validacion ------------------------------------------------------------

function cellKey(col, row) {
  return `${col},${row}`;
}

function isWalkableCell(ctx, col, row, options = {}) {
  const { margin = 0.4, ignoreBases = false } = options;
  if (row < 0 || row >= ctx.rows || col < 0 || col >= ctx.cols) return false;
  if (ctx.tiles[row][col] === "waterHigh") return false;
  const point = cellCenter(ctx.geo, col, row);
  if (mountainHit(ctx, point.x, point.z, margin)) return false;
  if (!ignoreBases && baseHit(ctx, point.x, point.z, margin)) return false;
  return true;
}

function baseStarts(ctx, base) {
  const { geo } = ctx;
  const centerCol = Math.floor(geo.cellX(base.x));
  const centerRow = Math.floor(geo.cellZ(base.z));
  const starts = [];
  for (let dr = -8; dr <= 8; dr++) {
    for (let dc = -8; dc <= 8; dc++) {
      const col = centerCol + dc;
      const row = centerRow + dr;
      if (!isWalkableCell(ctx, col, row, { margin: 0.3, ignoreBases: true })) continue;
      const point = cellCenter(geo, col, row);
      const distance = Math.hypot(point.x - base.x, point.z - base.z);
      if (distance >= 1.2 && distance <= 3.4) starts.push([col, row]);
    }
  }
  return starts;
}

function validate(ctx) {
  const { geo } = ctx;
  if (ctx.respawns.length < 2 || ctx.respawns.length > 4) {
    throw new Error(`${ctx.id}: se necesitan entre 2 y 4 bases`);
  }
  for (const base of ctx.respawns) {
    const issue = pointIssue(ctx, base.x, base.z, 0.5, true);
    if (issue) throw new Error(`${ctx.id}: la base ${base.team} esta ${issue}`);
  }

  const first = ctx.respawns[0];
  const seeds = baseStarts(ctx, first);
  if (seeds.length === 0) throw new Error(`${ctx.id}: la base ${first.team} no tiene salida`);

  const queue = seeds.map(([col, row]) => ({ col, row }));
  const seen = new Set(seeds.map(([col, row]) => cellKey(col, row)));

  for (let index = 0; index < queue.length; index++) {
    const { col, row } = queue[index];
    const neighbours = [
      [col + 1, row],
      [col - 1, row],
      [col, row + 1],
      [col, row - 1]
    ];
    for (const [nextCol, nextRow] of neighbours) {
      const key = cellKey(nextCol, nextRow);
      if (seen.has(key)) continue;
      if (!isWalkableCell(ctx, nextCol, nextRow)) continue;
      seen.add(key);
      queue.push({ col: nextCol, row: nextRow });
    }
  }

  for (const base of ctx.respawns.slice(1)) {
    const reaches = baseStarts(ctx, base).some(([col, row]) => seen.has(cellKey(col, row)));
    if (!reaches) throw new Error(`${ctx.id}: la base ${base.team} no es alcanzable`);
  }

  for (const pickup of ctx.pickups) {
    const col = Math.floor(geo.cellX(pickup.x));
    const row = Math.floor(geo.cellZ(pickup.z));
    if (!isWalkableCell(ctx, col, row, { margin: 0.45 })) {
      throw new Error(`${ctx.id}: el objeto ${pickup.type} esta en una celda bloqueada`);
    }
    if (!seen.has(cellKey(col, row))) {
      throw new Error(
        `${ctx.id}: el objeto ${pickup.type} de (${pickup.x}, ${pickup.z}) no es alcanzable`
      );
    }
  }
}

function toMapFile(ctx) {
  return {
    $schema: "./map.schema.json",
    id: ctx.id,
    name: ctx.name,
    description: ctx.description,
    tileSize: TILE_SIZE,
    waterHeight: WATER_HEIGHT,
    spawn: { x: 0, z: 0 },
    respawns: ctx.respawns,
    mountains: ctx.mountains,
    pickups: ctx.pickups,
    tiles: ctx.tiles
  };
}

// --- Arena 1: Delta de las Mareas ------------------------------------------

function buildDelta() {
  const cols = 112;
  const rows = 112;
  const ctx = createContext({
    id: "delta",
    name: "Delta de las Mareas",
    description:
      "Arena de 112 × 112 celdas para dos equipos: un delta cruza el mapa en diagonal, con tres puentes, una isla central disputada y distritos de jungla, arena y pantano.",
    cols,
    rows
  });
  const { geo, tiles } = ctx;

  // Biomas en pares de 180 grados para que ambas orillas sean justas.
  paintDisc(tiles, geo, -14, -10, 6, "tallGrass", { rough: 2, seed: 3 });
  paintDisc(tiles, geo, 14, 10, 6, "tallGrass", { rough: 2, seed: 4 });
  paintDisc(tiles, geo, -10, -22, 5, "fairy", { rough: 1.6, seed: 5 });
  paintDisc(tiles, geo, 10, 22, 5, "fairy", { rough: 1.6, seed: 6 });
  paintDisc(tiles, geo, -24, 4, 5, "park", { rough: 1.6, seed: 7 });
  paintDisc(tiles, geo, 24, -4, 5, "park", { rough: 1.6, seed: 8 });
  paintDisc(tiles, geo, -20, 12, 4, "poison", { rough: 1.6, seed: 9 });
  paintDisc(tiles, geo, 20, -12, 4, "poison", { rough: 1.6, seed: 10 });
  paintDisc(tiles, geo, -24, -6, 4.5, "ghost", { rough: 1.6, seed: 11 });
  paintDisc(tiles, geo, 24, 6, 4.5, "ghost", { rough: 1.6, seed: 12 });
  paintDisc(tiles, geo, -4, -26, 4, "desert", { rough: 1.6, seed: 13 });
  paintDisc(tiles, geo, 4, 26, 4, "desert", { rough: 1.6, seed: 14 });
  paintDisc(tiles, geo, 6, -22, 3, "tallGrass", { rough: 1.2, seed: 15 });
  paintDisc(tiles, geo, -6, 22, 3, "tallGrass", { rough: 1.2, seed: 16 });
  paintDisc(tiles, geo, -26, 18, 3.5, "electric", { rough: 1.2, seed: 17 });
  paintDisc(tiles, geo, 26, -18, 3.5, "electric", { rough: 1.2, seed: 18 });

  // Rio diagonal con meandro. La coordenada u recorre el rio y v es la
  // distancia perpendicular; el meandro es impar para conservar la simetria.
  const meander = (u) => 1.8 * Math.sin(u * 0.16);
  const toUv = (x, z) => {
    const u = (x - z) / Math.SQRT2;
    const v = (x + z) / Math.SQRT2;
    return { u, v };
  };

  for (let row = 0; row < rows; row++) {
    const wz = geo.centerZ(row);
    for (let col = 0; col < cols; col++) {
      const wx = geo.centerX(col);
      const { u, v } = toUv(wx, wz);
      const jitter = (hash01(col, row, 23) - 0.5) * 0.8;
      const distance = Math.abs(v + meander(u)) + jitter;
      if (distance <= 3.2) tiles[row][col] = "waterHigh";
      else if (distance <= 6) tiles[row][col] = "waterLow";
      else if (distance <= 7.2) tiles[row][col] = "sand";
    }
  }

  // Isla central dentro del cauce profundo.
  paintDisc(tiles, geo, 0, 0, 3, "sand", { rough: 0.5, seed: 24 });
  paintDisc(tiles, geo, 0, 0, 2.1, "tallGrass", { rough: 0.35, seed: 25 });

  // Puentes: el central comunica las dos bases y los laterales abren rutas.
  // Se pintan en coordenadas (u, v) para que queden perpendiculares al cauce.
  const paintUvBridge = (u0, halfWidth, vFrom, vTo) => {
    for (let row = 0; row < rows; row++) {
      const wz = geo.centerZ(row);
      for (let col = 0; col < cols; col++) {
        const wx = geo.centerX(col);
        const { u, v } = toUv(wx, wz);
        if (Math.abs(u - u0) <= halfWidth && v >= vFrom && v <= vTo) {
          tiles[row][col] = "lane";
        }
      }
    }
  };
  // El puente central se parte en dos para dejar visible la isla.
  paintUvBridge(0, 1.4, -9.5, -2.6);
  paintUvBridge(0, 1.4, 2.6, 9.5);
  paintUvBridge(16, 1.6, -meander(16) - 9.5, -meander(16) + 9.5);
  paintUvBridge(-16, 1.6, -meander(-16) - 9.5, -meander(-16) + 9.5);

  // Bases: noroeste y sureste, enfrentadas a traves del puente central.
  const red = { x: geo.centerX(18), z: geo.centerZ(18) };
  const blue = { x: geo.centerX(93), z: geo.centerZ(93) };
  paintBaseClearing(ctx, red.x, red.z, { panel: "lane", plaza: "road" });
  paintBaseClearing(ctx, blue.x, blue.z, { panel: "lane", plaza: "road" });
  addBase(ctx, "red", red.x, red.z);
  addBase(ctx, "blue", blue.x, blue.z);

  // Cordilleras paralelas al rio, con huecos para no cerrar las rutas.
  const uvPoint = (u, v) => [(u + v) / Math.SQRT2, (v - u) / Math.SQRT2];
  addMountain(ctx, "mountain", 1.7, [uvPoint(-22, -10.5), uvPoint(-13, -10.5)]);
  addMountain(ctx, "mountain", 1.7, [uvPoint(-8, -10.5), uvPoint(-2, -10.5)]);
  addMountain(ctx, "mountain", 1.7, [uvPoint(13, 10.5), uvPoint(22, 10.5)]);
  addMountain(ctx, "mountain", 1.7, [uvPoint(2, 10.5), uvPoint(8, 10.5)]);
  addMountain(ctx, "mountain", 1.6, [uvPoint(14, -20), uvPoint(22, -20)]);
  addMountain(ctx, "mountain", 1.6, [uvPoint(-22, 20), uvPoint(-14, 20)]);

  // Objetos.
  addPickup(ctx, "superPotion", 0, 0);
  addPickup(ctx, "potion", -6.7, -6.7);
  addPickup(ctx, "potion", 6.7, 6.7);
  const sidePickupA = uvPoint(16, -0.99 - 8.6);
  const sidePickupB = uvPoint(-16, 0.99 + 8.6);
  addPickup(ctx, "potion", sidePickupA[0], sidePickupA[1]);
  addPickup(ctx, "potion", sidePickupB[0], sidePickupB[1]);

  validate(ctx);
  return ctx;
}

// --- Arena 2: Cuatro Estaciones --------------------------------------------

function rotate(x, z, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos - z * sin, x * sin + z * cos];
}

function buildEstaciones() {
  const cols = 128;
  const rows = 128;
  const ctx = createContext({
    id: "estaciones",
    name: "Cuatro Estaciones",
    description:
      "Arena de 128 × 128 celdas para cuatro equipos: bases cardinales, plaza central con fuente, anillo de circulación, avenidas en cruz y cuatro distritos elementales.",
    cols,
    rows
  });
  const { geo, tiles } = ctx;
  const half = geo.halfX;

  // Distritos en las esquinas: hada, hielo, fuego y desierto.
  const districts = [
    { x: -half + 14, z: -half + 14, terrain: "fairy" },
    { x: half - 14, z: -half + 14, terrain: "ice" },
    { x: half - 14, z: half - 14, terrain: "fire" },
    { x: -half + 14, z: half - 14, terrain: "desert" }
  ];
  for (const district of districts) {
    paintDisc(tiles, geo, district.x, district.z, 12, district.terrain, {
      rough: 2.2,
      seed: 40
    });
  }
  paintDisc(tiles, geo, -half + 13, -half + 13, 5, "park", { rough: 1.4, seed: 41 });
  paintDisc(tiles, geo, half - 13, -half + 13, 4, "waterLow", { rough: 0.8, seed: 42 });
  paintDisc(tiles, geo, half - 13, half - 13, 4.5, "sand", { rough: 1.2, seed: 43 });
  paintDisc(tiles, geo, -half + 13, half - 13, 3.5, "tallGrass", { rough: 1, seed: 44 });

  // Avenidas en cruz y anillo de circulacion.
  paintRect(tiles, geo, -2, -half, 2, half, "road");
  paintRect(tiles, geo, -half, -2, half, 2, "road");
  paintRing(tiles, geo, 0, 0, 16.5, 20.5, "road");

  // Plaza central: jardin, arena y fuente.
  paintDisc(tiles, geo, 0, 0, 10, "fairy", { rough: 0.6, seed: 45 });
  paintDisc(tiles, geo, 0, 0, 6.5, "sand", { rough: 0.4, seed: 46 });
  paintDisc(tiles, geo, 0, 0, 2.4, "waterLow", { rough: 0.2, seed: 47 });

  // Bases en los cuatro puntos cardinales.
  const baseCells = [
    ["red", 64, 12],
    ["blue", 116, 64],
    ["yellow", 64, 116],
    ["green", 12, 64]
  ];
  for (const [team, col, row] of baseCells) {
    const x = geo.centerX(col);
    const z = geo.centerZ(row);
    paintBaseClearing(ctx, x, z, { panel: "lane", plaza: "road" });
    addBase(ctx, team, x, z);
  }

  // Muros diagonales en cada esquina y flancos de las avenidas.
  for (let index = 0; index < 4; index++) {
    const angle = index * (Math.PI / 2);
    const outerA = rotate(11, -28, angle);
    const outerB = rotate(28, -11, angle);
    addMountain(ctx, "wall", 1.6, [outerA, outerB]);
    const innerA = rotate(14, -23, angle);
    const innerB = rotate(23, -14, angle);
    addMountain(ctx, "wall", 1.4, [innerA, innerB]);

    const flankA = rotate(-5.5, -15.5, angle);
    const flankB = rotate(-5.5, -10, angle);
    addMountain(ctx, "wall", 1.3, [flankA, flankB]);
    const flankC = rotate(5.5, -15.5, angle);
    const flankD = rotate(5.5, -10, angle);
    addMountain(ctx, "wall", 1.3, [flankC, flankD]);
  }

  // Objetos: la grande en la plaza y una poción en cada diagonal del anillo.
  addPickup(ctx, "superPotion", 0, 0);
  for (const [x, z] of [
    [14, 14],
    [-14, 14],
    [14, -14],
    [-14, -14]
  ]) {
    addPickup(ctx, "potion", x, z);
  }

  validate(ctx);
  return ctx;
}

// --- Arena 3: Laberinto de Raices ------------------------------------------

function splitLine(fixed, axis, doors, halfGap, min, max) {
  const segments = [];
  let start = min;
  for (const door of [...doors].sort((a, b) => a - b)) {
    const end = door - halfGap;
    if (end > start + 0.1) {
      segments.push(
        axis === "x"
          ? [
              [fixed, start],
              [fixed, end]
            ]
          : [
              [start, fixed],
              [end, fixed]
            ]
      );
    }
    start = door + halfGap;
  }
  if (max > start + 0.1) {
    segments.push(
      axis === "x"
        ? [
            [fixed, start],
            [fixed, max]
          ]
        : [
            [start, fixed],
            [max, fixed]
          ]
    );
  }
  return segments;
}

function buildRaices() {
  const cols = 96;
  const rows = 96;
  const ctx = createContext({
    id: "raices",
    name: "Laberinto de Raíces",
    description:
      "Laberinto de 96 × 96 celdas para dos equipos: raíces que dividen el bosque en nueve claros, varias puertas por muro para evitar callejones sin salida y un claro central de hadas.",
    cols,
    rows
  });
  const { geo, tiles } = ctx;

  // Nueve claros de 32 x 32 celdas con biomas emparejados por simetria.
  const canonical = (col, row) => {
    const pair = [
      [col, row],
      [2 - col, 2 - row]
    ]
      .map(([a, b]) => `${a}-${b}`)
      .sort()
      .join("|");
    const table = {
      "0-0|2-2": "tallGrass",
      "0-1|2-1": "poison",
      "0-2|2-0": "ghost",
      "1-0|1-2": "jungle",
      "1-1|1-1": "fairy"
    };
    return table[pair] ?? "jungle";
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const chamberCol = Math.min(2, Math.floor(col / 32));
      const chamberRow = Math.min(2, Math.floor(row / 32));
      tiles[row][col] = canonical(chamberCol, chamberRow);
    }
  }

  // Claro central y pequenos detalles dentro de cada camara.
  paintDisc(tiles, geo, 0, 0, 6, "sand", { rough: 0.8, seed: 50 });
  paintDisc(tiles, geo, 0, -2.5, 2.4, "waterLow", { rough: 0.3, seed: 51 });
  paintDisc(tiles, geo, -16, -16, 3, "fairy", { rough: 1, seed: 52 });
  paintDisc(tiles, geo, 16, 16, 3, "fairy", { rough: 1, seed: 53 });
  paintDisc(tiles, geo, 16, -16, 3, "ghost", { rough: 1, seed: 54 });
  paintDisc(tiles, geo, -16, 16, 3, "ghost", { rough: 1, seed: 55 });

  // Puertas de cada linea de raices (coinciden con los cruces del centro).
  const doors = [-16, 0, 16];
  for (const fixed of [-8, 8]) {
    for (const segment of splitLine(fixed, "x", doors, 2.4, -24, 24)) {
      addMountain(ctx, "mountain", 2.2, segment);
    }
  }
  for (const fixed of [-8, 8]) {
    for (const segment of splitLine(fixed, "y", doors, 2.4, -24, 24)) {
      addMountain(ctx, "mountain", 2.2, segment);
    }
  }

  // Raices secundarias dentro de las camaras, tambien en pares.
  addMountain(ctx, "mountain", 1.6, [
    [-13, -18],
    [-6, -11]
  ]);
  addMountain(ctx, "mountain", 1.6, [
    [13, 18],
    [6, 11]
  ]);
  addMountain(ctx, "mountain", 1.6, [
    [13, -18],
    [6, -11]
  ]);
  addMountain(ctx, "mountain", 1.6, [
    [-13, 18],
    [-6, 11]
  ]);

  // Caminos de tierra en las puertas para que se lean los pasos.
  for (const fixed of [-8, 8]) {
    for (const door of doors) {
      paintRect(tiles, geo, fixed - 1.4, door - 2.6, fixed + 1.4, door + 2.6, "lane");
      paintRect(tiles, geo, door - 2.6, fixed - 1.4, door + 2.6, fixed + 1.4, "lane");
    }
  }

  // Bases en las esquinas noroeste y sureste.
  const red = { x: geo.centerX(10), z: geo.centerZ(10) };
  const blue = { x: geo.centerX(85), z: geo.centerZ(85) };
  paintBaseClearing(ctx, red.x, red.z, { panel: "lane", plaza: "jungle" });
  paintBaseClearing(ctx, blue.x, blue.z, { panel: "lane", plaza: "jungle" });
  addBase(ctx, "red", red.x, red.z);
  addBase(ctx, "blue", blue.x, blue.z);

  // Objetos: la grande en el claro y una poción en cada puerta central.
  addPickup(ctx, "superPotion", 0, 0);
  addPickup(ctx, "potion", -8, 0);
  addPickup(ctx, "potion", 8, 0);
  addPickup(ctx, "potion", 0, -8);
  addPickup(ctx, "potion", 0, 8);

  validate(ctx);
  return ctx;
}

// --- Arena 4: Ciudad Plasma ------------------------------------------------

function addBuilding(ctx, centerX, centerZ, halfRadial, halfTangential, angle, interior = "road") {
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  const tx = -Math.sin(angle);
  const tz = Math.cos(angle);
  const corner = (radial, tangential) => [
    centerX + ux * halfRadial * radial + tx * halfTangential * tangential,
    centerZ + uz * halfRadial * radial + tz * halfTangential * tangential
  ];
  const points = [
    corner(-1, -1),
    corner(1, -1),
    corner(1, 1),
    corner(-1, 1)
  ];
  paintPolygon(ctx.tiles, ctx.geo, points, interior);
  ctx.mountains.push({
    kind: "wall",
    width: 1.2,
    points: [...points, points[0]].map(([x, z]) => [
      Math.round(x * 1000) / 1000,
      Math.round(z * 1000) / 1000
    ])
  });
}

function buildPlasma() {
  const cols = 100;
  const rows = 100;
  const ctx = createContext({
    id: "plasma",
    name: "Ciudad Plasma",
    description:
      "Ciudad de 100 × 100 celdas para tres equipos: avenidas radiales, anillo perimetral, manzanas amuralladas y una plaza central con fuente.",
    cols,
    rows,
    background: "lane"
  });
  const { geo, tiles } = ctx;
  const baseAngles = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];

  // Distritos de parque y paramo repartidos con simetria de 120 grados.
  for (const angle of baseAngles) {
    const sector = angle + Math.PI / 3;
    paintDisc(tiles, geo, Math.cos(sector) * 9, Math.sin(sector) * 9, 6.5, "fairy", {
      rough: 1.2,
      seed: 60
    });
    paintDisc(tiles, geo, Math.cos(sector) * 17.4, Math.sin(sector) * 17.4, 5, "electric", {
      rough: 1.2,
      seed: 61
    });
  }

  // Avenidas desde el centro hasta el borde y anillo de circunvalacion.
  for (const angle of baseAngles) {
    const end = 25;
    paintStroke(
      tiles,
      geo,
      [
        [Math.cos(angle) * 5, Math.sin(angle) * 5],
        [Math.cos(angle) * end, Math.sin(angle) * end]
      ],
      4,
      "road"
    );
  }
  paintRing(tiles, geo, 0, 0, 12, 15.5, "road");

  // Plaza central.
  paintDisc(tiles, geo, 0, 0, 6, "sand", { rough: 0.4, seed: 62 });
  paintDisc(tiles, geo, 0, 0, 2, "waterLow", { rough: 0.2, seed: 63 });

  // Bases.
  for (const [index, team] of ["red", "blue", "yellow"].entries()) {
    const angle = baseAngles[index];
    const x = Math.cos(angle) * 20;
    const z = Math.sin(angle) * 20;
    paintBaseClearing(ctx, x, z, { panel: "lane", plaza: "road" });
    addBase(ctx, team, x, z);
  }

  // Manzanas amuralladas: dos por sector, alineadas con la avenida.
  for (const angle of baseAngles) {
    const sector = angle + Math.PI / 3;
    addBuilding(ctx, Math.cos(sector) * 9, Math.sin(sector) * 9, 2.2, 2.5, sector);
    addBuilding(ctx, Math.cos(sector) * 17.4, Math.sin(sector) * 17.4, 1.7, 2, sector);
  }

  // Objetos sobre el anillo, a medio camino entre avenida y manzana.
  addPickup(ctx, "superPotion", 0, 0);
  for (const angle of baseAngles) {
    const ringAngle = angle + Math.PI / 3;
    addPickup(
      ctx,
      "potion",
      Math.cos(ringAngle) * 13.75,
      Math.sin(ringAngle) * 13.75
    );
  }

  validate(ctx);
  return ctx;
}

// --- Arena 5: Caldera de Ceniza --------------------------------------------

function buildCaldera() {
  const cols = 96;
  const rows = 96;
  const ctx = createContext({
    id: "caldera",
    name: "Caldera de Ceniza",
    description:
      "Arena de 96 × 96 celdas para dos equipos: caldera volcánica con lago profundo, dos puentes, anillo de ceniza y una isla central con la poción grande.",
    cols,
    rows,
    background: "desert"
  });
  const { geo, tiles } = ctx;

  // Campos de ceniza y fumarolas, emparejados por simetria.
  paintDisc(tiles, geo, 0, 13, 4, "sand", { rough: 1.4, seed: 70 });
  paintDisc(tiles, geo, 0, -13, 4, "sand", { rough: 1.4, seed: 71 });
  paintDisc(tiles, geo, 12, 12, 3, "poison", { rough: 1.2, seed: 72 });
  paintDisc(tiles, geo, -12, -12, 3, "poison", { rough: 1.2, seed: 73 });
  paintDisc(tiles, geo, 10, -17, 3.5, "ghost", { rough: 1.2, seed: 74 });
  paintDisc(tiles, geo, -10, 17, 3.5, "ghost", { rough: 1.2, seed: 75 });

  // Caldera: isla, lago profundo, borde de lava y anillo exterior.
  paintDisc(tiles, geo, 0, 0, 5, "sand", { rough: 0.4, seed: 76 });
  paintDisc(tiles, geo, 0, 0, 2.8, "park", { rough: 0.3, seed: 77 });
  paintRing(tiles, geo, 0, 0, 5, 10, "waterHigh", { rough: 0.7, seed: 78 });
  paintRing(tiles, geo, 0, 0, 10, 14, "fire", { rough: 0.7, seed: 79 });
  paintRing(tiles, geo, 0, 0, 17, 20, "road", { rough: 0.4, seed: 80 });

  // Puentes norte y sur sobre el lago.
  paintRect(tiles, geo, -1.4, -10.5, 1.4, -4.4, "road");
  paintRect(tiles, geo, -1.4, 4.4, 1.4, 10.5, "road");

  // Corredores de lava hacia cada base.
  paintRect(tiles, geo, -20, -1.4, -10, 1.4, "fire");
  paintRect(tiles, geo, 10, -1.4, 20, 1.4, "fire");

  // Bases al oeste y al este.
  const red = { x: geo.centerX(8), z: geo.centerZ(48) };
  const blue = { x: geo.centerX(88), z: geo.centerZ(48) };
  paintBaseClearing(ctx, red.x, red.z, { panel: "lane", plaza: "road" });
  paintBaseClearing(ctx, blue.x, blue.z, { panel: "lane", plaza: "road" });
  addBase(ctx, "red", red.x, red.z);
  addBase(ctx, "blue", blue.x, blue.z);

  // Crestas de basalto en las esquinas.
  addMountain(ctx, "mountain", 1.6, [
    [10, -21],
    [16, -15]
  ]);
  addMountain(ctx, "mountain", 1.6, [
    [-10, 21],
    [-16, 15]
  ]);
  addMountain(ctx, "mountain", 1.6, [
    [12, 20],
    [18, 14]
  ]);
  addMountain(ctx, "mountain", 1.6, [
    [-12, -20],
    [-18, -14]
  ]);

  // Objetos: la grande en la isla y pociones en el anillo.
  addPickup(ctx, "superPotion", 0, 0);
  addPickup(ctx, "potion", 0, -18);
  addPickup(ctx, "potion", 0, 18);
  addPickup(ctx, "potion", 12.7, 12.7);
  addPickup(ctx, "potion", -12.7, -12.7);

  validate(ctx);
  return ctx;
}

// --- Escritura -------------------------------------------------------------

const BUILDERS = [buildDelta, buildEstaciones, buildRaices, buildPlasma, buildCaldera];

const INDEX_ENTRIES = {
  delta: {
    name: "Delta de las Mareas",
    description:
      "Arena de 112 × 112 celdas para dos equipos: un delta cruza el mapa en diagonal, con tres puentes, una isla central disputada y distritos de jungla, arena y pantano.",
    teams: ["red", "blue"]
  },
  estaciones: {
    name: "Cuatro Estaciones",
    description:
      "Arena de 128 × 128 celdas para cuatro equipos: bases cardinales, plaza central con fuente, anillo de circulación, avenidas en cruz y cuatro distritos elementales.",
    teams: ["red", "blue", "yellow", "green"]
  },
  raices: {
    name: "Laberinto de Raíces",
    description:
      "Laberinto de 96 × 96 celdas para dos equipos: raíces que dividen el bosque en nueve claros, varias puertas por muro para evitar callejones sin salida y un claro central de hadas.",
    teams: ["red", "blue"]
  },
  plasma: {
    name: "Ciudad Plasma",
    description:
      "Ciudad de 100 × 100 celdas para tres equipos: avenidas radiales, anillo perimetral, manzanas amuralladas y una plaza central con fuente.",
    teams: ["red", "blue", "yellow"]
  },
  caldera: {
    name: "Caldera de Ceniza",
    description:
      "Arena de 96 × 96 celdas para dos equipos: caldera volcánica con lago profundo, dos puentes, anillo de ceniza y una isla central con la poción grande.",
    teams: ["red", "blue"]
  }
};

async function main() {
  const built = BUILDERS.map((builder) => builder());

  for (const ctx of built) {
    const file = path.join(MAPS_DIR, `${ctx.id}.json`);
    await writeFile(file, `${JSON.stringify(toMapFile(ctx), null, 2)}\n`, "utf8");
    const teams = ctx.respawns.map((base) => base.team).join(", ");
    console.log(
      `${ctx.id.padEnd(11)} ${String(ctx.cols).padStart(3)}x${String(ctx.rows).padEnd(3)} ` +
        `equipos: ${teams.padEnd(28)} objetos: ${ctx.pickups.length}  ` +
        `muros: ${ctx.mountains.length}`
    );
  }

  const indexData = JSON.parse(await readFile(INDEX_FILE, "utf8"));
  const maps = Array.isArray(indexData) ? indexData : indexData.maps;
  if (!Array.isArray(maps)) throw new Error("public/maps/index.json no tiene una lista maps");

  const byId = new Map(maps.map((entry) => [entry.id, entry]));
  for (const ctx of built) {
    const extra = INDEX_ENTRIES[ctx.id];
    const entry = byId.get(ctx.id) ?? { id: ctx.id, file: `${ctx.id}.json` };
    entry.name = extra.name;
    entry.description = extra.description;
    entry.teams = extra.teams;
    if (!byId.has(ctx.id)) {
      maps.push(entry);
      byId.set(ctx.id, entry);
    }
  }

  const output = Array.isArray(indexData) ? maps : { ...indexData, maps };
  await writeFile(INDEX_FILE, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`\n${built.length} mapas escritos y registrados en public/maps/index.json`);
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
});
