#!/usr/bin/env node
/**
 * Empaqueta los GLB de `public/models` en un atlas por modelo.
 *
 * El exportador de Blender hornea una textura de color y otra de normales por
 * material. Un Pokémon normal acaba con 4-7 materiales, 8-14 texturas y 5-7
 * primitivas, y cada primitiva es un draw call. Este script, sin necesitar
 * Blender ni los .blend:
 *
 *   1. Empaqueta las texturas de color en un atlas y las de normales en otro.
 *   2. Remapea las UV de cada primitiva a su celda del atlas.
 *   3. Fusiona todas las primitivas de un mismo grupo (opaco / emisivo) en una
 *      sola malla y un solo material.
 *
 * El resultado conserva esqueleto, skin, nodos y animaciones tal cual. El
 * contorno de equipo sigue funcionando porque solo depende de las mallas.
 *
 * Uso:
 *   pnpm models:atlas                         # informe, sin escribir
 *   pnpm models:atlas -- --write              # reescribe public/models
 *   pnpm models:atlas -- --only pm0001_00     # un modelo
 *   pnpm models:atlas -- --out .cache/atlas   # escribe en otra carpeta
 *   pnpm models:atlas -- --cell 1024          # fuerza el lado de celda
 *
 * Opciones:
 *   --write           escribe sobre los GLB de entrada
 *   --out <dir>       escribe en otra carpeta conservando la estructura
 *   --input <dir>     carpeta de GLB de entrada (por defecto public/models)
 *   --cell <px>       lado de cada celda del atlas (por defecto 1024 con 1-2
 *                     materiales y 512 con 3 o más)
 *   --only <texto>    procesa solo los GLB cuya ruta contenga el texto
 *   --quiet           no imprime la tabla por modelo
 */

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_MODELS = join(ROOT, 'public', 'models');

const COMPONENT_SIZE = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4 // FLOAT
};
const TYPE_COUNT = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16
};
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

function parseArgs(argv) {
  const options = {
    write: false,
    out: null,
    input: DEFAULT_MODELS,
    cell: null,
    only: null,
    quiet: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--write') options.write = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--out') options.out = resolve(ROOT, argv[++i] ?? '');
    else if (arg === '--input') options.input = resolve(ROOT, argv[++i] ?? '');
    else if (arg === '--cell') options.cell = Number(argv[++i]);
    else if (arg === '--only') options.only = (argv[++i] ?? '').toLowerCase();
    else if (arg === '--help' || arg === '-h') {
      console.log(
        'Uso: node tools/models/atlas-glb.mjs [--write] [--out <dir>] [--input <dir>] [--cell <px>] [--only <texto>] [--quiet]'
      );
      process.exit(0);
    } else {
      throw new Error(`Opción desconocida: ${arg}`);
    }
  }
  if (options.cell !== null && (!Number.isFinite(options.cell) || options.cell < 64)) {
    throw new Error('--cell debe ser un número mayor o igual que 64');
  }
  if (options.write && options.out) {
    throw new Error('Usa --write o --out, no ambos');
  }
  return options;
}

// ---------------------------------------------------------------------------
// GLB lectura/escritura
// ---------------------------------------------------------------------------

function parseGlb(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (buffer.byteLength < 12 || view.getUint32(0, true) !== 0x46546c67) {
    throw new Error('No es un GLB');
  }
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      json = JSON.parse(buffer.subarray(start, start + length).toString('utf8'));
    } else if (type === 0x004e4942) {
      bin = buffer.subarray(start, start + length);
    }
    offset = start + length;
  }
  if (!json) throw new Error('El GLB no tiene chunk JSON');
  if (!bin) bin = Buffer.alloc(0);
  return { json, bin };
}

function buildGlb(json, bin) {
  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);
  const binPadding = (4 - (bin.length % 4)) % 4;
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPadding, 0)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

function accessorLayout(json, index) {
  const accessor = json.accessors?.[index];
  if (!accessor) throw new Error(`Accessor ${index} inexistente`);
  const componentSize = COMPONENT_SIZE[accessor.componentType];
  const typeCount = TYPE_COUNT[accessor.type];
  if (!componentSize || !typeCount) {
    throw new Error(`Accessor ${index} con formato ${accessor.componentType}/${accessor.type}`);
  }
  return {
    accessor,
    componentSize,
    typeCount,
    elementSize: componentSize * typeCount,
    count: accessor.count
  };
}

/** Devuelve los bytes de un accessor empaquetados (sin stride). */
function readAccessorBytes(json, bin, index) {
  const { accessor, elementSize, count } = accessorLayout(json, index);
  if (accessor.sparse) throw new Error(`Accessor ${index} sparse: no soportado`);
  if (accessor.bufferView === undefined) {
    return Buffer.alloc(elementSize * count);
  }
  const bufferView = json.bufferViews[accessor.bufferView];
  if (!bufferView) throw new Error(`BufferView ${accessor.bufferView} inexistente`);
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = bufferView.byteStride ?? elementSize;
  const available = (bufferView.byteOffset ?? 0) + bufferView.byteLength;
  if (start + stride * (count - 1) + elementSize > available) {
    throw new Error(`Accessor ${index} se sale del bufferView`);
  }
  if (stride === elementSize) {
    return Buffer.from(bin.subarray(start, start + elementSize * count));
  }
  const output = Buffer.alloc(elementSize * count);
  for (let i = 0; i < count; i += 1) {
    bin.copy(output, i * elementSize, start + i * stride, start + i * stride + elementSize);
  }
  return output;
}

// ---------------------------------------------------------------------------
// PNG: lectura y escritura sin dependencias (8 bits, RGB/RGBA, sin interlace)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function decodePng(buffer) {
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) {
    throw new Error('No es un PNG');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8) throw new Error(`PNG con profundidad ${bitDepth}: no soportado`);
  if (interlace !== 0) throw new Error('PNG entrelazado: no soportado');
  if (colorType !== 2 && colorType !== 6) {
    throw new Error(`PNG con colorType ${colorType}: no soportado`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const output = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  let line = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    raw.copy(line, 0, rowStart + 1, rowStart + 1 + stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) {
        throw new Error(`Filtro PNG ${filter} desconocido`);
      }
      line[x] = value & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      output[target] = line[source];
      output[target + 1] = line[source + 1];
      output[target + 2] = line[source + 2];
      output[target + 3] = channels === 4 ? line[source + 3] : 255;
    }
    previous = Buffer.from(line);
  }
  return { width, height, data: output };
}

function encodePng(width, height, rgba) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const target = row + 1 + x * 3;
      raw[target] = rgba[source];
      raw[target + 1] = rgba[source + 1];
      raw[target + 2] = rgba[source + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function setPixel(pixels, width, x, y, r, g, b, a = 255) {
  const index = (y * width + x) * 4;
  pixels[index] = r;
  pixels[index + 1] = g;
  pixels[index + 2] = b;
  pixels[index + 3] = a;
}

function fillRect(pixels, width, height, x, y, w, h, r, g, b, a = 255) {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(width, x + w);
  const y1 = Math.min(height, y + h);
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      setPixel(pixels, width, px, py, r, g, b, a);
    }
  }
}

/** Dibuja una imagen RGBA escalada con interpolación bilineal. */
function drawScaled(destination, destinationWidth, destinationHeight, source, dx, dy, dw, dh) {
  const { width: sw, height: sh, data } = source;
  for (let y = 0; y < dh; y += 1) {
    const sy = Math.max(0, Math.min(sh - 1, ((y + 0.5) / dh) * sh - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < dw; x += 1) {
      const sx = Math.max(0, Math.min(sw - 1, ((x + 0.5) / dw) * sw - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = sx - x0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const r =
        data[i00] * w00 + data[i10] * w10 + data[i01] * w01 + data[i11] * w11;
      const g =
        data[i00 + 1] * w00 +
        data[i10 + 1] * w10 +
        data[i01 + 1] * w01 +
        data[i11 + 1] * w11;
      const b =
        data[i00 + 2] * w00 +
        data[i10 + 2] * w10 +
        data[i01 + 2] * w01 +
        data[i11 + 2] * w11;
      setPixel(
        destination,
        destinationWidth,
        dx + x,
        dy + y,
        Math.round(r),
        Math.round(g),
        Math.round(b),
        255
      );
    }
  }
}

/**
 * Repite los bordes de un tile hacia el margen del atlas. Sin esto, los mips
 * mezclan celdas vecinas y el borde del modelo se mancha.
 */
function extrudeTile(pixels, width, height, x, y, w, h, pad) {
  const copy = (sx, sy, tx, ty) => {
    if (sx < 0 || sx >= width || sy < 0 || sy >= height) return;
    if (tx < 0 || tx >= width || ty < 0 || ty >= height) return;
    const source = (sy * width + sx) * 4;
    const target = (ty * width + tx) * 4;
    pixels[target] = pixels[source];
    pixels[target + 1] = pixels[source + 1];
    pixels[target + 2] = pixels[source + 2];
  };
  for (let step = 1; step <= pad; step += 1) {
    for (let column = 0; column < w; column += 1) {
      copy(x + column, y, x + column, y - step);
      copy(x + column, y + h - 1, x + column, y + h - 1 + step);
    }
    for (let row = -pad; row < h + pad; row += 1) {
      const sourceY = Math.max(y, Math.min(y + h - 1, y + row));
      copy(x, sourceY, x - step, y + row);
      copy(x + w - 1, sourceY, x + w - 1 + step, y + row);
    }
  }
}

function nextPowerOfTwo(value) {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function gridFor(count) {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  return { cols: 4, rows: Math.ceil(count / 4) };
}

/**
 * Construye un atlas con una celda por entrada. Devuelve el PNG y el rectángulo
 * UV de cada material dentro del atlas.
 */
function buildAtlas(entries, kind, cellOverride) {
  const count = entries.length;
  const cell = cellOverride ?? (count <= 2 ? 1024 : 512);
  const pad = Math.max(2, Math.round(cell / 64));
  const content = cell - pad * 2;
  const { cols, rows } = gridFor(count);
  const width = nextPowerOfTwo(cols * cell);
  const height = nextPowerOfTwo(rows * cell);
  const pixels = Buffer.alloc(width * height * 4);

  if (kind === 'normal') {
    fillRect(pixels, width, height, 0, 0, width, height, 128, 128, 255, 255);
  } else {
    fillRect(pixels, width, height, 0, 0, width, height, 0, 0, 0, 255);
  }

  const rects = new Map();
  const tiles = [];
  entries.forEach((entry, index) => {
    const column = index % cols;
    const row = Math.floor(index / cols);
    const x = column * cell;
    const y = row * cell;
    const image = entry.image;
    if (image) {
      const decoded = decodePng(image);
      drawScaled(pixels, width, height, decoded, x + pad, y + pad, content, content);
    }
    tiles.push({ x: x + pad, y: y + pad, w: content, h: content });
    rects.set(entry.material, {
      u0: (x + pad) / width,
      v0: (y + pad) / height,
      u1: (x + pad + content) / width,
      v1: (y + pad + content) / height
    });
  });
  for (const tile of tiles) {
    extrudeTile(pixels, width, height, tile.x, tile.y, tile.w, tile.h, pad);
  }

  return {
    png: encodePng(width, height, pixels),
    width,
    height,
    rects
  };
}

// ---------------------------------------------------------------------------
// Construcción del GLB con atlas
// ---------------------------------------------------------------------------

function addBufferView(state, data, target) {
  const offset = state.binLength;
  state.parts.push(data);
  state.binLength += data.length;
  const padding = (4 - (state.binLength % 4)) % 4;
  if (padding > 0) {
    state.parts.push(Buffer.alloc(padding, 0));
    state.binLength += padding;
  }
  const bufferView = {
    buffer: 0,
    byteOffset: offset,
    byteLength: data.length
  };
  if (target !== undefined) bufferView.target = target;
  state.bufferViews.push(bufferView);
  return state.bufferViews.length - 1;
}

function addAccessor(state, data, componentType, type, count, normalized, min, max, target) {
  const expected = COMPONENT_SIZE[componentType] * TYPE_COUNT[type] * count;
  if (data.length !== expected) {
    throw new Error(
      `Accessor ${type}/${componentType}: ${data.length} bytes, se esperaban ${expected}`
    );
  }
  const bufferView = addBufferView(state, data, target);
  const accessor = {
    bufferView,
    componentType,
    count,
    type
  };
  if (normalized) accessor.normalized = true;
  if (min) accessor.min = min;
  if (max) accessor.max = max;
  state.accessors.push(accessor);
  return state.accessors.length - 1;
}

function transformUvs(data, count, rect) {
  const output = Buffer.alloc(data.length);
  const source = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const target = new DataView(output.buffer, output.byteOffset, output.byteLength);
  const du = rect.u1 - rect.u0;
  const dv = rect.v1 - rect.v0;
  for (let i = 0; i < count; i += 1) {
    const u = source.getFloat32(i * 8, true);
    const v = source.getFloat32(i * 8 + 4, true);
    target.setFloat32(i * 8, rect.u0 + u * du, true);
    target.setFloat32(i * 8 + 4, rect.v0 + v * dv, true);
  }
  return output;
}

function positionBounds(data, count) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = view.getFloat32(i * 12 + axis * 4, true);
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return { min, max };
}

function readIndices(json, bin, accessorIndex) {
  const layout = accessorLayout(json, accessorIndex);
  const bytes = readAccessorBytes(json, bin, accessorIndex);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const indices = new Uint32Array(layout.count);
  for (let i = 0; i < layout.count; i += 1) {
    if (layout.accessor.componentType === 5121) indices[i] = bytes[i];
    else if (layout.accessor.componentType === 5123) indices[i] = view.getUint16(i * 2, true);
    else if (layout.accessor.componentType === 5125) indices[i] = view.getUint32(i * 4, true);
    else throw new Error(`Índices con componentType ${layout.accessor.componentType}`);
  }
  return indices;
}

function materialGroups(json) {
  const groups = [];
  const byMaterial = new Map();
  for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      const materialIndex = primitive.material;
      if (materialIndex === undefined) {
        throw new Error(`Malla ${meshIndex} primitiva ${primitiveIndex} sin material`);
      }
      const material = json.materials[materialIndex];
      const hasBase = material.pbrMetallicRoughness?.baseColorTexture !== undefined;
      const hasEmissive = material.emissiveTexture !== undefined;
      if (!hasBase && !hasEmissive) {
        throw new Error(`Material ${material.name ?? materialIndex} sin textura base ni emisiva`);
      }
      if (hasBase && hasEmissive) {
        throw new Error(`Material ${material.name ?? materialIndex} mezcla base y emisión`);
      }
      if (!hasBase && material.normalTexture !== undefined) {
        throw new Error(`Material emisivo ${material.name ?? materialIndex} con normales`);
      }
      if (
        material.occlusionTexture !== undefined ||
        material.pbrMetallicRoughness?.metallicRoughnessTexture !== undefined
      ) {
        throw new Error(`Material ${material.name ?? materialIndex}: texturas AO/metal no soportadas`);
      }
      if ((material.alphaMode ?? 'OPAQUE') !== 'OPAQUE' || material.doubleSided) {
        throw new Error(`Material ${material.name ?? materialIndex}: transparencia/cara doble no soportada`);
      }
      for (const reference of [
        material.pbrMetallicRoughness?.baseColorTexture,
        material.normalTexture,
        material.emissiveTexture
      ]) {
        if (reference && (reference.texCoord ?? 0) !== 0) {
          throw new Error(`Material ${material.name ?? materialIndex}: usa TEXCOORD_${reference.texCoord}`);
        }
      }
      if ((primitive.targets?.length ?? 0) > 0) {
        throw new Error(`Malla ${meshIndex} primitiva ${primitiveIndex}: morph targets no soportados`);
      }
      if (primitive.mode !== undefined && primitive.mode !== 4) {
        throw new Error(`Malla ${meshIndex} primitiva ${primitiveIndex}: modo ${primitive.mode} no soportado`);
      }
      const kind = hasBase ? 'lit' : 'emissive';
      let group = byMaterial.get(kind);
      if (!group) {
        group = { kind, materials: [], primitives: [] };
        byMaterial.set(kind, group);
        groups.push(group);
      }
      if (!group.materials.includes(materialIndex)) group.materials.push(materialIndex);
      group.primitives.push({ meshIndex, primitiveIndex, materialIndex });
    }
  }
  // El grupo opaco va primero para que su nodo sea el principal.
  groups.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'lit' ? -1 : 1));
  return groups;
}

function imageBytes(json, bin, imageIndex) {
  const image = json.images?.[imageIndex];
  if (!image || image.bufferView === undefined) return null;
  const bufferView = json.bufferViews[image.bufferView];
  const start = bufferView.byteOffset ?? 0;
  return bin.subarray(start, start + bufferView.byteLength);
}

function textureImage(json, bin, textureIndex) {
  const texture = json.textures?.[textureIndex];
  if (!texture) return null;
  return imageBytes(json, bin, texture.source);
}

function readTextureForMaterial(json, bin, materialIndex, slot) {
  const material = json.materials[materialIndex];
  const reference =
    slot === 'base'
      ? material.pbrMetallicRoughness?.baseColorTexture
      : slot === 'normal'
        ? material.normalTexture
        : material.emissiveTexture;
  if (!reference) return null;
  return textureImage(json, bin, reference.index);
}

function mergePrimitives(group, context, rects) {
  const attributes = new Map();
  let vertexCount = 0;
  const allIndices = [];
  let colorMeta = null;

  // Si alguna primitiva tiene COLOR_0, el resto se rellena en blanco para que
  // todas las vertices del grupo mantengan el mismo formato.
  for (const entry of group.primitives) {
    const primitive = context.json.meshes[entry.meshIndex].primitives[entry.primitiveIndex];
    const colorIndex = primitive.attributes.COLOR_0;
    if (colorIndex === undefined) continue;
    const layout = context.accessor(colorIndex);
    colorMeta = {
      componentType: layout.accessor.componentType,
      type: layout.accessor.type,
      normalized: layout.accessor.normalized ?? false,
      chunks: []
    };
    break;
  }

  const attribute = (name) => {
    const meta = attributes.get(name);
    if (!meta) {
      throw new Error(`Falta el atributo ${name} en el grupo ${group.kind}`);
    }
    return meta;
  };

  for (const entry of group.primitives) {
    const mesh = context.json.meshes[entry.meshIndex];
    const primitive = mesh.primitives[entry.primitiveIndex];
    const positionIndex = primitive.attributes.POSITION;
    if (positionIndex === undefined) throw new Error('Primitiva sin POSITION');
    const position = context.accessor(positionIndex);
    const count = position.count;
    const rect = rects.get(entry.materialIndex);
    if (!rect) throw new Error(`Sin rectángulo de atlas para el material ${entry.materialIndex}`);

    for (const name of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
      const accessorIndex = primitive.attributes[name];
      if (accessorIndex === undefined) {
        throw new Error(`Primitiva sin ${name}`);
      }
      const layout = context.accessor(accessorIndex);
      if (layout.count !== count) {
        throw new Error(`Atributo ${name} con ${layout.count} vértices y POSITION con ${count}`);
      }
      if (!attributes.has(name)) {
        attributes.set(name, {
          componentType: layout.accessor.componentType,
          type: layout.accessor.type,
          normalized: layout.accessor.normalized ?? false,
          chunks: []
        });
      }
      const meta = attributes.get(name);
      if (
        meta.componentType !== layout.accessor.componentType ||
        meta.type !== layout.accessor.type
      ) {
        throw new Error(`Atributo ${name} con formato distinto entre primitivas`);
      }
      let bytes = context.bytes(accessorIndex);
      if (name === 'TEXCOORD_0') {
        bytes = transformUvs(bytes, count, rect);
      }
      meta.chunks.push(bytes);
    }

    const colorIndex = primitive.attributes.COLOR_0;
    if (colorMeta) {
      if (colorIndex !== undefined) {
        const layout = context.accessor(colorIndex);
        if (
          layout.accessor.componentType !== colorMeta.componentType ||
          layout.accessor.type !== colorMeta.type
        ) {
          throw new Error('COLOR_0 con formato distinto entre primitivas');
        }
        colorMeta.chunks.push(context.bytes(colorIndex));
      } else {
        const size = COMPONENT_SIZE[colorMeta.componentType] * TYPE_COUNT[colorMeta.type];
        colorMeta.chunks.push(Buffer.alloc(size * count, 0xff));
      }
    }

    if (primitive.indices === undefined) {
      for (let i = 0; i < count; i += 1) allIndices.push(vertexCount + i);
    } else {
      const indices = readIndices(context.json, context.bin, primitive.indices);
      for (const index of indices) allIndices.push(vertexCount + index);
    }
    vertexCount += count;
  }

  if (colorMeta) {
    attributes.set('COLOR_0', colorMeta);
  }

  const bufferFor = (meta) => Buffer.concat(meta.chunks);
  const positionData = bufferFor(attribute('POSITION'));
  const bounds = positionBounds(positionData, vertexCount);
  const newAttributes = {};
  newAttributes.POSITION = addAccessor(
    context.state,
    positionData,
    5126,
    'VEC3',
    vertexCount,
    false,
    bounds.min,
    bounds.max,
    ARRAY_BUFFER
  );
  for (const name of ['NORMAL', 'TEXCOORD_0']) {
    const meta = attribute(name);
    newAttributes[name] = addAccessor(
      context.state,
      bufferFor(meta),
      meta.componentType,
      meta.type,
      vertexCount,
      meta.normalized,
      undefined,
      undefined,
      ARRAY_BUFFER
    );
  }
  if (colorMeta) {
    newAttributes.COLOR_0 = addAccessor(
      context.state,
      bufferFor(colorMeta),
      colorMeta.componentType,
      colorMeta.type,
      vertexCount,
      colorMeta.normalized,
      undefined,
      undefined,
      ARRAY_BUFFER
    );
  }
  for (const name of ['JOINTS_0', 'WEIGHTS_0']) {
    const meta = attribute(name);
    newAttributes[name] = addAccessor(
      context.state,
      bufferFor(meta),
      meta.componentType,
      meta.type,
      vertexCount,
      meta.normalized,
      undefined,
      undefined,
      ARRAY_BUFFER
    );
  }

  const useUint32 = vertexCount > 65535;
  const indexData = Buffer.alloc(allIndices.length * (useUint32 ? 4 : 2));
  const indexView = new DataView(indexData.buffer, indexData.byteOffset, indexData.byteLength);
  allIndices.forEach((value, index) => {
    if (useUint32) indexView.setUint32(index * 4, value, true);
    else indexView.setUint16(index * 2, value, true);
  });
  const indicesAccessor = addAccessor(
    context.state,
    indexData,
    useUint32 ? 5125 : 5123,
    'SCALAR',
    allIndices.length,
    false,
    undefined,
    undefined,
    ELEMENT_ARRAY_BUFFER
  );

  return {
    attributes: newAttributes,
    indices: indicesAccessor,
    vertexCount,
    triangleCount: allIndices.length / 3
  };
}

function rebuildModel(json, bin, options) {
  const groups = materialGroups(json);
  const state = {
    parts: [],
    binLength: 0,
    bufferViews: [],
    accessors: []
  };
  const oldAccessorCache = new Map();

  const context = {
    json,
    bin,
    state,
    accessor(index) {
      return accessorLayout(json, index);
    },
    bytes(index) {
      return readAccessorBytes(json, bin, index);
    }
  };

  const mapOldAccessor = (index) => {
    if (oldAccessorCache.has(index)) return oldAccessorCache.get(index);
    const layout = accessorLayout(json, index);
    const bytes = readAccessorBytes(json, bin, index);
    const newIndex = addAccessor(
      state,
      bytes,
      layout.accessor.componentType,
      layout.accessor.type,
      layout.count,
      layout.accessor.normalized ?? false,
      layout.accessor.min,
      layout.accessor.max,
      undefined
    );
    oldAccessorCache.set(index, newIndex);
    return newIndex;
  };

  const images = [];
  const textures = [];
  const samplers = [
    {
      magFilter: 9729,
      minFilter: 9987,
      wrapS: 33071,
      wrapT: 33071
    }
  ];

  const addTexture = (name, png) => {
    const bufferView = addBufferView(state, png, undefined);
    images.push({ name, mimeType: 'image/png', bufferView });
    textures.push({ sampler: 0, source: images.length - 1 });
    return textures.length - 1;
  };

  const materials = [];
  const meshes = [];
  const rectsByMaterial = new Map();

  for (const group of groups) {
    const entries = group.materials.map((materialIndex) => ({
      material: materialIndex,
      image:
        group.kind === 'lit'
          ? readTextureForMaterial(json, bin, materialIndex, 'base')
          : readTextureForMaterial(json, bin, materialIndex, 'emissive')
    }));
    const atlas = buildAtlas(entries, 'base', options.cell);
    for (const [material, rect] of atlas.rects) rectsByMaterial.set(material, rect);

    const normalEntries =
      group.kind === 'lit'
        ? group.materials.map((materialIndex) => ({
            material: materialIndex,
            image: readTextureForMaterial(json, bin, materialIndex, 'normal')
          }))
        : [];
    const hasNormals = normalEntries.some((entry) => entry.image !== null);
    let normalAtlas = null;
    if (hasNormals) {
      normalAtlas = buildAtlas(normalEntries, 'normal', options.cell);
    }

    const baseTexture = addTexture(`${group.kind}_basecolor`, atlas.png);
    const normalTexture = normalAtlas
      ? addTexture(`${group.kind}_normal`, normalAtlas.png)
      : null;

    let materialIndex;
    if (group.kind === 'lit') {
      materialIndex = materials.length;
      const material = {
        name: 'atlas-lit',
        pbrMetallicRoughness: {
          baseColorTexture: { index: baseTexture },
          metallicFactor: 0,
          roughnessFactor: 0.72
        }
      };
      if (normalTexture !== null) material.normalTexture = { index: normalTexture };
      materials.push(material);
    } else {
      materialIndex = materials.length;
      materials.push({
        name: 'atlas-emissive',
        emissiveFactor: [1, 1, 1],
        emissiveTexture: { index: baseTexture },
        pbrMetallicRoughness: {
          baseColorFactor: [0, 0, 0, 1],
          metallicFactor: 0,
          roughnessFactor: 0.72
        }
      });
    }

    const merged = mergePrimitives(group, context, rectsByMaterial);
    meshes.push({
      name: `${group.kind}_atlas`,
      primitives: [
        {
          attributes: merged.attributes,
          indices: merged.indices,
          material: materialIndex,
          mode: 4
        }
      ]
    });
    group.meshIndex = meshes.length - 1;
    group.vertexCount = merged.vertexCount;
    group.triangleCount = merged.triangleCount;
  }

  // Nodos: se conservan todos para no romper animaciones ni skins. Se vacían
  // los nodos de malla antiguos y se reutilizan para las mallas fusionadas.
  const nodes = json.nodes.map((node) => ({ ...node }));
  const meshNodeIndices = [];
  const skinIndices = new Set();
  nodes.forEach((node, index) => {
    if (node.mesh === undefined) return;
    if (node.translation || node.rotation || node.scale || node.matrix) {
      throw new Error(`Nodo ${node.name ?? index}: la malla tiene transformación propia`);
    }
    meshNodeIndices.push(index);
    if (node.skin !== undefined) skinIndices.add(node.skin);
    delete node.mesh;
    delete node.skin;
  });
  if (skinIndices.size > 1) {
    throw new Error('Las mallas fusionadas usan skins distintos');
  }
  if (meshNodeIndices.length < groups.length) {
    throw new Error('No hay suficientes nodos de malla para las mallas fusionadas');
  }
  const meshSkin = skinIndices.size > 0 ? [...skinIndices][0] : null;
  groups.forEach((group, index) => {
    const node = nodes[meshNodeIndices[index]];
    node.mesh = group.meshIndex;
    if (meshSkin !== null) node.skin = meshSkin;
    else delete node.skin;
  });

  const skins = (json.skins ?? []).map((skin) => {
    const next = { ...skin };
    if (skin.inverseBindMatrices !== undefined) {
      next.inverseBindMatrices = mapOldAccessor(skin.inverseBindMatrices);
    }
    return next;
  });

  const animations = (json.animations ?? []).map((animation) => ({
    name: animation.name,
    channels: animation.channels.map((channel) => ({ ...channel })),
    samplers: animation.samplers.map((sampler) => ({
      input: mapOldAccessor(sampler.input),
      output: mapOldAccessor(sampler.output),
      interpolation: sampler.interpolation
    }))
  }));

  const newJson = {
    asset: {
      ...json.asset,
      generator: `${json.asset?.generator ?? 'glTF'} + newpoke atlas`
    },
    scene: json.scene,
    scenes: json.scenes,
    nodes,
    meshes,
    materials,
    textures,
    images,
    samplers,
    accessors: state.accessors,
    bufferViews: state.bufferViews,
    buffers: [{ byteLength: state.binLength }]
  };
  if (skins.length > 0) newJson.skins = skins;
  if (animations.length > 0) newJson.animations = animations;
  if (json.extensionsUsed) newJson.extensionsUsed = json.extensionsUsed;
  if (json.extensionsRequired) newJson.extensionsRequired = json.extensionsRequired;

  const newBin = Buffer.concat(state.parts);
  return {
    json: newJson,
    bin: newBin,
    groups,
    materials: materials.length,
    primitives: groups.length,
    textures: textures.length,
    images: images.length
  };
}

// ---------------------------------------------------------------------------
// Informe y ejecución
// ---------------------------------------------------------------------------

function collectFiles(directory, only) {
  const files = [];
  for (const directoryEntry of readdirSync(directory)) {
    const full = join(directory, directoryEntry);
    if (!statSync(full).isDirectory()) continue;
    for (const file of readdirSync(full)) {
      if (!file.endsWith('.glb')) continue;
      const relativePath = relative(directory, join(full, file));
      if (only && !relativePath.toLowerCase().includes(only)) continue;
      files.push({ path: join(full, file), relativePath });
    }
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = collectFiles(options.input, options.only);
  if (files.length === 0) throw new Error('No hay GLB que procesar');

  console.log(`Modelos: ${files.length}`);
  console.log('modelo\tGLB\tmateriales\tprims\ttexturas\tdraws');
  const reports = [];
  let skipped = 0;
  for (const file of files) {
    const original = readFileSync(file.path);
    const { json, bin } = parseGlb(original);
    if (json.asset?.generator?.includes('newpoke atlas')) {
      console.log(`${file.relativePath}\tya tiene atlas, se omite`);
      skipped += 1;
      continue;
    }
    const rebuilt = rebuildModel(json, bin, options);
    const output = buildGlb(rebuilt.json, rebuilt.bin);
    const inputMaterials = json.materials?.length ?? 0;
    const inputPrimitives = (json.meshes ?? []).reduce(
      (sum, mesh) => sum + mesh.primitives.length,
      0
    );
    reports.push({
      file: file.relativePath,
      inputBytes: original.length,
      outputBytes: output.length,
      inputMaterials,
      inputPrimitives,
      outputMaterials: rebuilt.materials,
      outputPrimitives: rebuilt.primitives
    });
    if (!options.quiet) {
      console.log(
        `${file.relativePath}\t${formatBytes(original.length)} -> ${formatBytes(output.length)}\t${inputMaterials} -> ${rebuilt.materials}\t${inputPrimitives} -> ${rebuilt.primitives}\t${rebuilt.textures}`
      );
    }
    if (options.out) {
      const destination = join(options.out, file.relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, output);
    } else if (options.write) {
      // Escritura atómica: si el proceso se corta, el GLB original sigue entero.
      const temporary = `${file.path}.tmp`;
      writeFileSync(temporary, output);
      renameSync(temporary, file.path);
    }
  }

  const totalIn = reports.reduce((sum, report) => sum + report.inputBytes, 0);
  const totalOut = reports.reduce((sum, report) => sum + report.outputBytes, 0);
  const primsIn = reports.reduce((sum, report) => sum + report.inputPrimitives, 0);
  const primsOut = reports.reduce((sum, report) => sum + report.outputPrimitives, 0);
  console.log(
    `\nProcesados: ${reports.length}${skipped > 0 ? ` · omitidos: ${skipped}` : ''}`
  );
  console.log(
    `Total: ${formatBytes(totalIn)} -> ${formatBytes(totalOut)} · primitivas ${primsIn} -> ${primsOut}`
  );
  if (reports.length === 0) {
    console.log('Nada que hacer: todos los GLB ya tienen atlas.');
    return;
  }
  if (!options.write && !options.out) {
    console.log('Modo informe: no se ha escrito nada. Usa --write o --out.');
  } else {
    console.log(
      options.write
        ? 'GLB reescritos en public/models.'
        : `GLB escritos en ${relative(ROOT, options.out)}.`
    );
  }
}

main();
