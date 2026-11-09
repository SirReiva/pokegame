#!/usr/bin/env node
/**
 * Preprocesa los sprites de PMD Sprite Collab para que el filtrado lineal no
 * ensucie el contorno.
 *
 * El arte original usa alfa de 1 bit y deja los píxeles transparentes en
 * RGB(0,0,0). Al muestrear con LINEAR, el borde mezcla el color del Pokémon con
 * negro y aparece una franja oscura de ~1 px de pantalla. Este script rellena
 * el RGB de los píxeles transparentes con el color visible más cercano (alpha
 * bleed) sin tocar el canal alfa ni las dimensiones.
 *
 * Uso:
 *   node scripts/preprocess-sprites.mjs            # procesa public/sprites
 *   node scripts/preprocess-sprites.mjs --depth 4  # más margen de color
 *   node scripts/preprocess-sprites.mjs --verbose  # lista cada hoja cambiada
 *
 * Es idempotente: volver a ejecutarlo no cambia los archivos ya procesados.
 * No añade dependencias; incluye un decodificador y un codificador PNG propios.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = process.cwd();
const SPRITES_DIR = path.join(ROOT, 'public', 'sprites');
const MANIFEST_PATH = path.join(SPRITES_DIR, 'manifest.json');

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const depth = readOption('--depth', 3);
const verbose = process.argv.includes('--verbose');

/** Decodificador PNG mínimo: 8 bits, sin entrelazado, RGB/RGBA/escala de grises. */
function decodePng(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('no es un PNG válido');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const chunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('PNG entrelazado no soportado');
    } else if (type === 'IDAT') {
      chunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8) throw new Error(`PNG con profundidad ${bitDepth} no soportada`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`PNG con tipo de color ${colorType} no soportado`);

  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  let cursor = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++];
    const line = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      let value = line[x];
      switch (filter) {
        case 0: break;
        case 1: value = (value + a) & 0xff; break;
        case 2: value = (value + b) & 0xff; break;
        case 3: value = (value + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          value = (value + predictor) & 0xff;
          break;
        }
        default:
          throw new Error(`filtro PNG ${filter} no soportado`);
      }
      line[x] = value;
    }

    for (let x = 0; x < width; x++) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      if (channels === 4) {
        pixels[dst] = line[src];
        pixels[dst + 1] = line[src + 1];
        pixels[dst + 2] = line[src + 2];
        pixels[dst + 3] = line[src + 3];
      } else if (channels === 3) {
        pixels[dst] = line[src];
        pixels[dst + 1] = line[src + 1];
        pixels[dst + 2] = line[src + 2];
        pixels[dst + 3] = 255;
      } else if (channels === 1) {
        pixels[dst] = pixels[dst + 1] = pixels[dst + 2] = line[src];
        pixels[dst + 3] = 255;
      } else {
        pixels[dst] = pixels[dst + 1] = pixels[dst + 2] = line[src];
        pixels[dst + 3] = line[src + 1];
      }
    }

    previous = line;
  }

  return { width, height, pixels };
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

/** Codificador PNG RGBA8 con filtro adaptativo por fila (como hacen los editores). */
function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  let previous = Buffer.alloc(stride);
  const candidates = [
    Buffer.alloc(stride),
    Buffer.alloc(stride),
    Buffer.alloc(stride),
    Buffer.alloc(stride),
    Buffer.alloc(stride)
  ];

  for (let y = 0; y < height; y++) {
    const current = pixels.subarray(y * stride, (y + 1) * stride);
    let bestFilter = 0;
    let bestScore = Infinity;
    let bestRow = candidates[0];

    for (let filter = 0; filter < 5; filter++) {
      const row = candidates[filter];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? current[i - 4] : 0;
        const b = previous[i];
        const c = i >= 4 ? previous[i - 4] : 0;
        let predictor = 0;
        if (filter === 1) {
          predictor = a;
        } else if (filter === 2) {
          predictor = b;
        } else if (filter === 3) {
          predictor = (a + b) >> 1;
        } else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const value = (current[i] - predictor) & 0xff;
        row[i] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) {
        bestScore = score;
        bestFilter = filter;
        bestRow = row;
      }
    }

    raw[y * (stride + 1)] = bestFilter;
    bestRow.copy(raw, y * (stride + 1) + 1);
    previous = current;
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits por canal
  header[9] = 6; // RGBA
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

const NEIGHBORS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1]
];

/**
 * Rellena el RGB de los píxeles totalmente transparentes de una región con el
 * color visible más cercano, hasta `depth` pasos. No modifica el alfa.
 */
function bleedRegion(pixels, width, x0, y0, x1, y1, steps) {
  const regionWidth = x1 - x0;
  const regionHeight = y1 - y0;
  if (regionWidth <= 0 || regionHeight <= 0 || steps <= 0) return 0;

  const visited = new Uint8Array(regionWidth * regionHeight);
  let frontier = [];

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const index = (y * width + x) * 4;
      if (pixels[index + 3] > 0) {
        visited[(y - y0) * regionWidth + (x - x0)] = 1;
        frontier.push(y * width + x);
      }
    }
  }

  let changed = 0;
  for (let step = 0; step < steps && frontier.length > 0; step++) {
    const next = [];
    for (const index of frontier) {
      const x = index % width;
      const y = (index / width) | 0;
      const source = index * 4;
      const r = pixels[source];
      const g = pixels[source + 1];
      const b = pixels[source + 2];

      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
        const regionIndex = (ny - y0) * regionWidth + (nx - x0);
        if (visited[regionIndex]) continue;
        visited[regionIndex] = 1;

        const target = (ny * width + nx) * 4;
        if (pixels[target + 3] === 0) {
          pixels[target] = r;
          pixels[target + 1] = g;
          pixels[target + 2] = b;
          changed++;
        }
        next.push(ny * width + nx);
      }
    }
    frontier = next;
  }

  return changed;
}

/** Procesa una hoja por celdas, para que el color no cruce de un frame a otro. */
function bleedSheet(image, grid, steps) {
  const { frameWidth, frameHeight, columns, rows } = grid;
  if (
    frameWidth * columns !== image.width ||
    frameHeight * rows !== image.height
  ) {
    return null;
  }

  let changed = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x0 = column * frameWidth;
      const y0 = row * frameHeight;
      changed += bleedRegion(
        image.pixels,
        image.width,
        x0,
        y0,
        x0 + frameWidth,
        y0 + frameHeight,
        steps
      );
    }
  }
  return changed;
}

function addAnimations(map, animations) {
  for (const animation of Object.values(animations ?? {})) {
    if (!animation?.sheet) continue;
    if (
      !animation.frameWidth ||
      !animation.frameHeight ||
      !animation.columns ||
      !animation.rows
    ) {
      continue;
    }
    const file = path.resolve(ROOT, 'public', animation.sheet);
    map.set(file, {
      frameWidth: animation.frameWidth,
      frameHeight: animation.frameHeight,
      columns: animation.columns,
      rows: animation.rows
    });
  }
}

async function collectPngs(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

export async function preprocessSprites() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const grids = new Map();
  for (const pokemon of manifest.pokemon ?? []) {
    addAnimations(grids, pokemon.animations);
    for (const skin of pokemon.skins ?? []) addAnimations(grids, skin.animations);
  }

  const files = await collectPngs(SPRITES_DIR);
  let changedFiles = 0;
  let changedPixels = 0;
  let skipped = 0;
  let fallbackSheets = 0;
  const unsupported = [];

  for (const file of files) {
    const original = await readFile(file);
    let image;
    try {
      image = decodePng(original);
    } catch (error) {
      unsupported.push({ file, message: error.message });
      continue;
    }
    const grid = grids.get(file);

    let changed;
    if (grid) {
      changed = bleedSheet(image, grid, depth);
      if (changed === null) {
        fallbackSheets++;
        console.warn(
          `  ${path.relative(ROOT, file)}: la cuadrícula del manifiesto no encaja; se procesa entera`
        );
        changed = bleedRegion(
          image.pixels,
          image.width,
          0,
          0,
          image.width,
          image.height,
          depth
        );
      }
    } else {
      changed = bleedRegion(
        image.pixels,
        image.width,
        0,
        0,
        image.width,
        image.height,
        depth
      );
    }

    if (changed === 0) {
      skipped++;
      continue;
    }

    const encoded = encodePng(image.width, image.height, image.pixels);
    if (encoded.equals(original)) {
      skipped++;
      continue;
    }

    await writeFile(file, encoded);
    changedFiles++;
    changedPixels += changed;
    if (verbose) {
      console.log(
        `  ${path.relative(ROOT, file)}: ${changed} px de color rellenados`
      );
    }
  }

  console.log(
    `\nAlpha bleed: ${changedFiles} archivos, ${changedPixels} píxeles, ` +
      `profundidad ${depth}. Sin cambios: ${skipped}.`
  );
  if (fallbackSheets > 0) {
    console.log(`Hojas con fallback a imagen completa: ${fallbackSheets}`);
  }
  if (unsupported.length > 0) {
    console.log(
      `Omitidos ${unsupported.length} PNG no RGBA8 (no necesitan alpha bleed).`
    );
    if (verbose) {
      for (const { file, message } of unsupported) {
        console.log(`  ${path.relative(ROOT, file)}: ${message}`);
      }
    }
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  preprocessSprites().catch((error) => {
    console.error(`\nError: ${error.message}`);
    process.exitCode = 1;
  });
}
