/**
 * Genera el arte pixel-art de los objetos recogibles.
 *
 * No usa dependencias externas: dibuja en una rejilla lógica y codifica el PNG
 * RGBA a mano con `zlib`, igual que `generate-map-previews.mjs`. Se ejecuta con
 * `pnpm items:art` y sobrescribe los PNG de `public/items/`.
 *
 * Cada objeto tiene dos imágenes: el frasco lleno (disponible) y el frasco
 * vacío (en cooldown). Ambas comparten silueta y encuadre para que el cambio
 * en el mapa no mueva el objeto.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'public', 'items');
/** Cada píxel lógico se dibuja como un bloque de 4×4. */
const SCALE = 4;

// --- Codificador PNG RGBA ---------------------------------------------------

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

function encodePng(canvas) {
  const { width, height, pixels } = canvas;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // Filtro None.
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits por canal
  header[9] = 6; // color type RGBA
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

// --- Lienzo y primitivas ----------------------------------------------------

function hexToRgb(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function createCanvas(width, height) {
  return { width, height, pixels: Buffer.alloc(width * height * 4, 0) };
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const offset = (y * canvas.width + x) * 4;
  canvas.pixels[offset] = color[0];
  canvas.pixels[offset + 1] = color[1];
  canvas.pixels[offset + 2] = color[2];
  canvas.pixels[offset + 3] = color[3] ?? 255;
}

function fillRect(canvas, x, y, width, height, color) {
  for (let py = Math.floor(y); py < Math.ceil(y + height); py++) {
    for (let px = Math.floor(x); px < Math.ceil(x + width); px++) {
      setPixel(canvas, px, py, color);
    }
  }
}

/** Pinta una elipse rellena; `inside` permite recortarla (líquido, sombras...). */
function fillEllipse(canvas, cx, cy, rx, ry, color, inside) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      if (inside && !inside(x, y)) continue;
      setPixel(canvas, x, y, color);
    }
  }
}

function line(canvas, x0, y0, x1, y1, color) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const targetX = Math.round(x1);
  const targetY = Math.round(y1);
  const dx = Math.abs(targetX - x);
  const dy = Math.abs(targetY - y);
  const sx = x < targetX ? 1 : -1;
  const sy = y < targetY ? 1 : -1;
  let error = dx - dy;
  for (;;) {
    setPixel(canvas, x, y, color);
    if (x === targetX && y === targetY) break;
    const doubled = error * 2;
    if (doubled > -dy) {
      error -= dy;
      x += sx;
    }
    if (doubled < dx) {
      error += dx;
      y += sy;
    }
  }
}

/** Estrella de cuatro puntas para los frascos grandes. */
function sparkle(canvas, x, y, size, color, shine) {
  fillRect(canvas, x, y - size, 1, size * 2 + 1, color);
  fillRect(canvas, x - size, y, size * 2 + 1, 1, color);
  if (size >= 2) {
    setPixel(canvas, x - 1, y - 1, shine);
    setPixel(canvas, x + 1, y - 1, shine);
    setPixel(canvas, x - 1, y + 1, shine);
    setPixel(canvas, x + 1, y + 1, shine);
  }
}

/** Reescala el lienzo lógico a bloques de `scale` píxeles. */
function upscale(canvas, scale) {
  const result = createCanvas(canvas.width * scale, canvas.height * scale);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      const color = [
        canvas.pixels[offset],
        canvas.pixels[offset + 1],
        canvas.pixels[offset + 2],
        canvas.pixels[offset + 3]
      ];
      fillRect(result, x * scale, y * scale, scale, scale, color);
    }
  }
  return result;
}

// --- Paletas ----------------------------------------------------------------

const OUTLINE = hexToRgb('#281a34');
const CORK_DARK = hexToRgb('#6d4425');
const CORK = hexToRgb('#b87a3f');
const CORK_LIGHT = hexToRgb('#e0aa69');
const GLASS_DARK = hexToRgb('#74a5b8');
const GLASS = hexToRgb('#d6eef5');
const GLASS_LIGHT = hexToRgb('#f5fdff');

const RED_DARK = hexToRgb('#8f122b');
const RED = hexToRgb('#e63b4f');
const RED_LIGHT = hexToRgb('#ff8b92');
const PINK_SHINE = hexToRgb('#ffd7da');

const VIOLET_DARK = hexToRgb('#3d177f');
const VIOLET = hexToRgb('#8a4dff');
const VIOLET_LIGHT = hexToRgb('#c79bff');
const VIOLET_SHINE = hexToRgb('#efe2ff');

const GOLD_DARK = hexToRgb('#7a5314');
const GOLD = hexToRgb('#e3b341');
const GOLD_LIGHT = hexToRgb('#ffe59a');

const EMPTY_DARK = hexToRgb('#879aa4');
const EMPTY = hexToRgb('#c3d4db');

// --- Frasco pequeño ---------------------------------------------------------

/** Dibuja la silueta común del frasco pequeño; devuelve el cuerpo interior. */
function drawSmallBottleShell(canvas) {
  const outline = OUTLINE;
  // Cuello.
  fillRect(canvas, 11, 7, 10, 12, outline);
  // Cuerpo.
  fillEllipse(canvas, 16, 25, 12, 11, outline);
  // Interior del cuerpo.
  fillEllipse(canvas, 16, 25, 11, 10, GLASS);
  // Interior del cuello.
  fillRect(canvas, 12, 8, 8, 10, GLASS);
  return { cx: 16, cy: 25, rx: 11, ry: 10 };
}

function drawSmallCork(canvas) {
  fillRect(canvas, 12, 3, 8, 6, OUTLINE);
  fillRect(canvas, 13, 4, 6, 4, CORK);
  fillRect(canvas, 13, 5, 6, 1, CORK_DARK);
  fillRect(canvas, 14, 4, 1, 3, CORK_LIGHT);
}

function drawSmallHighlights(canvas) {
  // Brillo vertical del cristal.
  fillRect(canvas, 8, 20, 2, 7, GLASS_LIGHT);
  fillRect(canvas, 7, 21, 1, 4, GLASS_LIGHT);
  // Reflejo del borde derecho.
  fillRect(canvas, 23, 22, 2, 6, GLASS_DARK);
  fillRect(canvas, 24, 23, 1, 3, GLASS_LIGHT);
}

function drawSmallPotion() {
  const canvas = createCanvas(32, 40);
  const body = drawSmallBottleShell(canvas);

  // Líquido rojo, recortado al interior del cuerpo.
  const surface = 21;
  fillEllipse(
    canvas,
    body.cx,
    body.cy,
    body.rx - 1,
    body.ry - 1,
    RED,
    (x, y) => y >= surface
  );
  // Volumen: sombra inferior y brillo de la superficie.
  fillEllipse(
    canvas,
    body.cx,
    body.cy,
    body.rx - 1,
    body.ry - 1,
    RED_DARK,
    (x, y) => y >= body.cy + 5
  );
  fillRect(canvas, 6, surface, 20, 1, RED_LIGHT);
  fillRect(canvas, 9, surface + 1, 2, 1, PINK_SHINE);
  // Burbujas.
  setPixel(canvas, 12, 29, RED_LIGHT);
  setPixel(canvas, 13, 29, RED_LIGHT);
  setPixel(canvas, 20, 31, RED_LIGHT);
  setPixel(canvas, 20, 32, PINK_SHINE);

  drawSmallHighlights(canvas);
  drawSmallCork(canvas);
  return canvas;
}

function drawSmallEmptyPotion() {
  const canvas = createCanvas(32, 40);
  const body = drawSmallBottleShell(canvas);

  // Cristal vacío: fondo apagado y sombra interior.
  fillEllipse(
    canvas,
    body.cx,
    body.cy,
    body.rx - 1,
    body.ry - 1,
    EMPTY,
    (x, y) => y >= 20
  );
  fillEllipse(
    canvas,
    body.cx,
    body.cy,
    body.rx - 1,
    body.ry - 1,
    EMPTY_DARK,
    (x, y) => y >= body.cy + 5
  );
  // Grietas.
  line(canvas, 18, 24, 21, 28, OUTLINE);
  line(canvas, 21, 28, 19, 31, OUTLINE);
  line(canvas, 21, 28, 23, 30, OUTLINE);
  // Restos de poción en el fondo.
  fillRect(canvas, 15, 33, 3, 1, RED_DARK);
  setPixel(canvas, 18, 33, RED);

  drawSmallHighlights(canvas);
  drawSmallCork(canvas);
  return canvas;
}

// --- Frasco grande ----------------------------------------------------------

function drawLargeBottleShell(canvas) {
  // Cuello y hombros.
  fillRect(canvas, 13, 10, 12, 13, OUTLINE);
  // Cuerpo más alto y voluminoso.
  fillEllipse(canvas, 18, 32, 14, 14, OUTLINE);
  fillEllipse(canvas, 18, 32, 13, 13, GLASS);
  fillRect(canvas, 14, 11, 10, 11, GLASS);
  return { cx: 18, cy: 32, rx: 13, ry: 13 };
}

function drawLargeCork(canvas) {
  fillRect(canvas, 14, 3, 10, 8, OUTLINE);
  fillRect(canvas, 15, 4, 8, 5, CORK);
  fillRect(canvas, 15, 6, 8, 1, CORK_DARK);
  fillRect(canvas, 16, 4, 1, 4, CORK_LIGHT);
  // Abrazadera dorada.
  fillRect(canvas, 13, 9, 12, 4, GOLD_DARK);
  fillRect(canvas, 14, 10, 10, 2, GOLD);
  fillRect(canvas, 14, 10, 10, 1, GOLD_LIGHT);
}

function drawLargeHighlights(canvas) {
  fillRect(canvas, 8, 26, 2, 9, GLASS_LIGHT);
  fillRect(canvas, 7, 27, 1, 6, GLASS_LIGHT);
  fillRect(canvas, 27, 28, 2, 8, GLASS_DARK);
  fillRect(canvas, 28, 29, 1, 5, GLASS_LIGHT);
}

function drawLargePotion() {
  const canvas = createCanvas(36, 48);
  const body = drawLargeBottleShell(canvas);

  const surface = 27;
  fillEllipse(
    canvas,
    body.cx,
    body.cy,
    body.rx - 1,
    body.ry - 1,
    VIOLET,
    (x, y) => y >= surface
  );
  fillEllipse(
    canvas,
    body.cx,
    body.cy,
    body.rx - 1,
    body.ry - 1,
    VIOLET_DARK,
    (x, y) => y >= body.cy + 6
  );
  fillRect(canvas, 6, surface, 24, 1, VIOLET_LIGHT);
  fillRect(canvas, 10, surface + 1, 3, 1, VIOLET_SHINE);
  // Burbujas.
  setPixel(canvas, 11, 36, VIOLET_LIGHT);
  setPixel(canvas, 12, 36, VIOLET_SHINE);
  setPixel(canvas, 23, 38, VIOLET_LIGHT);
  setPixel(canvas, 23, 39, VIOLET_SHINE);
  setPixel(canvas, 16, 34, VIOLET_SHINE);

  drawLargeHighlights(canvas);
  drawLargeCork(canvas);
  // Destellos alrededor del frasco.
  sparkle(canvas, 29, 18, 2, VIOLET_SHINE, GOLD_LIGHT);
  sparkle(canvas, 8, 22, 1, VIOLET_LIGHT, VIOLET_SHINE);
  sparkle(canvas, 29, 41, 1, VIOLET_LIGHT, VIOLET_SHINE);
  return canvas;
}

function drawLargeEmptyPotion() {
  const canvas = createCanvas(36, 48);
  const body = drawLargeBottleShell(canvas);

  fillEllipse(
    canvas,
    body.cx,
    body.cy,
    body.rx - 1,
    body.ry - 1,
    EMPTY,
    (x, y) => y >= 23
  );
  fillEllipse(
    canvas,
    body.cx,
    body.cy,
    body.rx - 1,
    body.ry - 1,
    EMPTY_DARK,
    (x, y) => y >= body.cy + 6
  );
  // Grietas y brillo del cristal vacío.
  line(canvas, 14, 27, 18, 32, OUTLINE);
  line(canvas, 18, 32, 16, 37, OUTLINE);
  line(canvas, 18, 32, 21, 35, OUTLINE);
  line(canvas, 22, 24, 24, 27, OUTLINE);
  // Residuo violeta en el fondo.
  fillRect(canvas, 16, 42, 5, 1, VIOLET_DARK);
  setPixel(canvas, 18, 42, VIOLET);
  setPixel(canvas, 21, 42, VIOLET_LIGHT);

  drawLargeHighlights(canvas);
  drawLargeCork(canvas);
  sparkle(canvas, 29, 46, 1, VIOLET_LIGHT, VIOLET_SHINE);
  return canvas;
}

// --- Escritura --------------------------------------------------------------

mkdirSync(OUTPUT, { recursive: true });

const files = [
  ['potion-unused.png', drawSmallPotion()],
  ['potion-used.png', drawSmallEmptyPotion()],
  ['super-potion-unused.png', drawLargePotion()],
  ['super-potion-used.png', drawLargeEmptyPotion()]
];

for (const [name, canvas] of files) {
  const target = join(OUTPUT, name);
  writeFileSync(target, encodePng(upscale(canvas, SCALE)));
  console.log(`[items] ${name} (${canvas.width * SCALE}×${canvas.height * SCALE})`);
}
