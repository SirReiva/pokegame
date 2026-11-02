#!/usr/bin/env node
/**
 * Genera una vista previa PNG por cada mapa de `public/maps/index.json`.
 *
 * Uso:
 *   pnpm maps:previews
 *
 * El script lee la rejilla de terrenos, los separadores y los respawns de cada
 * mapa y dibuja una imagen cenital con la misma paleta que el editor. Después
 * escribe la ruta del PNG en el propio índice (`preview`), que es lo que
 * consume el slider del lobby.
 *
 * No usa dependencias externas: el PNG se codifica a mano con `zlib`, igual
 * que el importador de sprites decodifica las hojas de PMD.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { deflateSync } from 'node:zlib';

const ROOT = process.cwd();
const MAPS_DIR = path.join(ROOT, 'public', 'maps');
const OUT_DIR = path.join(MAPS_DIR, 'previews');
const INDEX_FILE = path.join(MAPS_DIR, 'index.json');
const PREVIEW_MAX_SIDE = 720;

/** Misma paleta que `TERRAIN_SWATCHES` de `src/game/mapEditor.ts`. */
const TERRAIN_COLORS = {
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

const TEAM_COLORS = {
  blue: '#4b9cff',
  red: '#ff5f63'
};

const MOUNTAIN_BAND = '#c4b49e';
const MOUNTAIN_LINE = '#d8c7aa';
const WALL_BAND = '#8e9eb0';
const WALL_LINE = '#b8c4d2';

// --- Codificador PNG --------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index++) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type, 'ascii');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

/** Codifica un buffer RGB (3 canales, sin alfa) como PNG de 8 bits. */
function encodePng(canvas) {
  const { width, height, pixels } = canvas;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // Filtro None: los bloques planos comprimen bien.
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits por canal
  header[9] = 2; // color type RGB
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// --- Lienzo y dibujo --------------------------------------------------------

function hexToRgb(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function createCanvas(width, height, background) {
  const canvas = { width, height, pixels: Buffer.alloc(width * height * 3) };
  fillRect(canvas, 0, 0, width, height, hexToRgb(background));
  return canvas;
}

function blendPixel(canvas, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const offset = (y * canvas.width + x) * 3;
  if (alpha >= 1) {
    canvas.pixels[offset] = color[0];
    canvas.pixels[offset + 1] = color[1];
    canvas.pixels[offset + 2] = color[2];
    return;
  }
  const inverse = 1 - alpha;
  canvas.pixels[offset] = Math.round(canvas.pixels[offset] * inverse + color[0] * alpha);
  canvas.pixels[offset + 1] = Math.round(
    canvas.pixels[offset + 1] * inverse + color[1] * alpha
  );
  canvas.pixels[offset + 2] = Math.round(
    canvas.pixels[offset + 2] * inverse + color[2] * alpha
  );
}

function fillRect(canvas, x, y, width, height, color, alpha = 1) {
  const minX = Math.max(0, Math.floor(x));
  const minY = Math.max(0, Math.floor(y));
  const maxX = Math.min(canvas.width, Math.ceil(x + width));
  const maxY = Math.min(canvas.height, Math.ceil(y + height));
  for (let py = minY; py < maxY; py++) {
    for (let px = minX; px < maxX; px++) {
      blendPixel(canvas, px, py, color, alpha);
    }
  }
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared > 0
      ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
      : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Dibuja una polilínea con grosor y extremos redondeados, píxel a píxel. */
function strokePolyline(canvas, points, width, color, alpha) {
  if (points.length === 0 || width <= 0) return;
  const half = width / 2;
  const rgb = hexToRgb(color);

  if (points.length === 1) {
    drawDisc(canvas, points[0].x, points[0].y, half, rgb, alpha);
    return;
  }

  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x) - half));
    const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(a.x, b.x) + half));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y) - half));
    const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(a.y, b.y) + half));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (distanceToSegment(x + 0.5, y + 0.5, a.x, a.y, b.x, b.y) <= half) {
          blendPixel(canvas, x, y, rgb, alpha);
        }
      }
    }
  }
}

function drawDisc(canvas, cx, cy, radius, color, alpha) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(canvas.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(canvas.height - 1, Math.ceil(cy + radius));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (distance <= radius) {
        // Suaviza el borde para que las bases no parezcan recortadas.
        const edge = Math.min(1, Math.max(0, radius - distance));
        blendPixel(canvas, x, y, color, alpha * edge);
      }
    }
  }
}

function drawRing(canvas, cx, cy, radius, thickness, color, alpha) {
  const minX = Math.max(0, Math.floor(cx - radius - thickness));
  const maxX = Math.min(canvas.width - 1, Math.ceil(cx + radius + thickness));
  const minY = Math.max(0, Math.floor(cy - radius - thickness));
  const maxY = Math.min(canvas.height - 1, Math.ceil(cy + radius + thickness));
  const rgb = hexToRgb(color);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (Math.abs(distance - radius) <= thickness / 2) {
        blendPixel(canvas, x, y, rgb, alpha);
      }
    }
  }
}

// --- Render del mapa --------------------------------------------------------

function parseMapFile(raw, entry) {
  const tiles = raw.tiles ?? raw.terrain;
  if (!Array.isArray(tiles) || tiles.length === 0) {
    throw new Error(`El mapa "${entry.id}" no tiene "tiles"`);
  }
  const cols = Array.isArray(tiles[0]) ? tiles[0].length : 0;
  if (cols === 0) {
    throw new Error(`La primera fila de "tiles" del mapa "${entry.id}" está vacía`);
  }
  for (let row = 0; row < tiles.length; row++) {
    if (!Array.isArray(tiles[row]) || tiles[row].length !== cols) {
      throw new Error(`La fila ${row} del mapa "${entry.id}" no tiene ${cols} celdas`);
    }
  }

  const respawns = raw.respawns ?? raw.spawns;
  if (!Array.isArray(respawns) || respawns.length === 0) {
    throw new Error(`El mapa "${entry.id}" no tiene "respawns"`);
  }

  return {
    tiles,
    rows: tiles.length,
    cols,
    tileSize: typeof raw.tileSize === 'number' && raw.tileSize > 0 ? raw.tileSize : 1,
    respawns,
    mountains: Array.isArray(raw.mountains) ? raw.mountains : []
  };
}

function renderMapPreview(map) {
  const scale = PREVIEW_MAX_SIDE / Math.max(map.cols, map.rows);
  const width = Math.max(1, Math.round(map.cols * scale));
  const height = Math.max(1, Math.round(map.rows * scale));
  const canvas = createCanvas(width, height, '#0a1018');

  // Rejilla de terrenos. Se muestrea por píxel para que el resultado mida
  // siempre lo mismo aunque el mapa tenga 16 o 4096 celdas por lado.
  for (let y = 0; y < height; y++) {
    const row = Math.min(map.rows - 1, Math.floor((y * map.rows) / height));
    for (let x = 0; x < width; x++) {
      const col = Math.min(map.cols - 1, Math.floor((x * map.cols) / width));
      const terrain = map.tiles[row][col];
      const color = TERRAIN_COLORS[terrain];
      if (!color) {
        throw new Error(`Terreno desconocido "${String(terrain)}" en el mapa`);
      }
      blendPixel(canvas, x, y, hexToRgb(color), 1);
    }
  }

  // Coordenadas del mundo -> píxeles del lienzo.
  const halfX = (map.cols * map.tileSize) / 2;
  const halfZ = (map.rows * map.tileSize) / 2;
  const toCanvas = (x, z) => ({
    x: ((x + halfX) / (map.cols * map.tileSize)) * width,
    y: ((z + halfZ) / (map.rows * map.tileSize)) * height
  });

  // Separadores: banda ancha translúcida + línea central, igual que el editor.
  for (const range of map.mountains) {
    if (!range || !Array.isArray(range.points) || range.points.length === 0) continue;
    const points = range.points.map((point) => toCanvas(point[0], point[1]));
    const worldWidth = typeof range.width === 'number' ? range.width : 2;
    const bandWidth = Math.max(
      3,
      (worldWidth / (map.cols * map.tileSize)) * width
    );
    const isWall = range.kind === 'wall';
    strokePolyline(
      canvas,
      points,
      bandWidth,
      isWall ? WALL_BAND : MOUNTAIN_BAND,
      0.38
    );
    strokePolyline(
      canvas,
      points,
      Math.max(1.5, bandWidth * 0.08),
      isWall ? WALL_LINE : MOUNTAIN_LINE,
      0.92
    );
  }

  // Bases: el radio se convierte de unidades de mundo a píxeles.
  for (const respawn of map.respawns) {
    if (!respawn || (respawn.team !== 'blue' && respawn.team !== 'red')) continue;
    const point = toCanvas(respawn.x, respawn.z);
    const radiusWorld = typeof respawn.radius === 'number' ? respawn.radius : 3.6;
    const radius = Math.max(
      4,
      (radiusWorld / (map.cols * map.tileSize)) * width
    );
    const color = hexToRgb(TEAM_COLORS[respawn.team]);
    drawDisc(canvas, point.x, point.y, radius, color, 0.72);
    drawRing(canvas, point.x, point.y, radius, Math.max(1.5, radius * 0.09), '#ffffff', 0.9);
    drawDisc(canvas, point.x, point.y, Math.max(2, radius * 0.2), '#08101a', 0.65);
  }

  return { canvas, width, height };
}

// --- Entrada principal ------------------------------------------------------

function previewName(entry) {
  const base = entry.id || path.basename(entry.file, path.extname(entry.file));
  return `${String(base)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'mapa'}.png`;
}

function readIndex(data) {
  const maps = Array.isArray(data) ? data : data?.maps;
  if (!Array.isArray(maps) || maps.length === 0) {
    throw new Error('public/maps/index.json debe contener una lista "maps" no vacía');
  }
  return maps;
}

async function main() {
  const indexData = JSON.parse(await readFile(INDEX_FILE, 'utf8'));
  const maps = readIndex(indexData);
  await mkdir(OUT_DIR, { recursive: true });

  const names = new Set();
  const previews = [];

  for (const entry of maps) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') {
      throw new Error('Cada entrada de maps/index.json necesita un "id"');
    }
    const file = typeof entry.file === 'string' ? entry.file : `${entry.id}.json`;
    const mapPath = path.join(MAPS_DIR, file.replace(/^\/+/, ''));
    const raw = JSON.parse(await readFile(mapPath, 'utf8'));
    const map = parseMapFile(raw, entry);
    const { canvas, width, height } = renderMapPreview(map);

    const name = previewName(entry);
    if (names.has(name)) {
      throw new Error(`Dos mapas generan el mismo preview "${name}"`);
    }
    names.add(name);

    const destination = path.join(OUT_DIR, name);
    await writeFile(destination, encodePng(canvas));
    const preview = `maps/previews/${name}`;
    entry.preview = preview;
    previews.push({ id: entry.id, destination, width, height });
  }

  // El índice declara la ruta del preview para que el cliente no tenga que
  // adivinar nombres de archivo.
  const output = Array.isArray(indexData) ? maps : { ...indexData, maps };
  await writeFile(INDEX_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  for (const item of previews) {
    console.log(
      `${item.id.padEnd(12)} ${String(item.width).padStart(4)}x${String(item.height).padEnd(4)}  ` +
        `${path.relative(ROOT, item.destination)}`
    );
  }
  console.log(`\n${previews.length} previews generados en public/maps/previews/`);
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
});
