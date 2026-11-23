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
 *   4. Hornea la escala de bind en `POSITION` cuando no es 1, para que la caja
 *      que declaran los accessors sea la que se ve en pantalla.
 *
 * El resultado conserva esqueleto, skin, nodos y animaciones; solo se divide la
 * escala del nodo raíz por el factor horneado.
 *
 * Uso:
 *   pnpm models:atlas                         # informe, sin escribir
 *   pnpm models:atlas -- --write              # reescribe public/models
 *   pnpm models:atlas -- --only pm0001_00     # un modelo
 *   pnpm models:atlas -- --out .cache/atlas   # escribe en otra carpeta
 *   pnpm models:atlas -- --cell 1024          # fuerza el lado de celda
 *   pnpm models:atlas -- --refresh-grounding  # recalcula el apoyo horneado
 *
 * Además del atlas, cada GLB guarda en `extras.newpoke.grounding` la caja de
 * la pose de espera (clip `idle` en t = 0): `minY` y `maxY` en unidades del
 * modelo. El juego ya no mide el apoyo en runtime; coloca el cuerpo con esos
 * valores, así que todas las copias (dueño, aliados y bots enemigos) usan
 * exactamente la misma altura aunque una copia haya estado oculta.
 *
 * Opciones:
 *   --write           escribe sobre los GLB de entrada
 *   --out <dir>       escribe en otra carpeta conservando la estructura
 *   --input <dir>     carpeta de GLB de entrada (por defecto public/models)
 *   --cell <px>       lado de cada celda del atlas (por defecto 1024 con 1-2
 *                     materiales y 512 con 3 o más)
 *   --only <texto>    procesa solo los GLB cuya ruta contenga el texto
 *   --refresh-grounding  recalcula la caja de apoyo aunque ya exista
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
    refreshGrounding: false,
    quiet: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--write') options.write = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--refresh-grounding') options.refreshGrounding = true;
    else if (arg === '--out') options.out = resolve(ROOT, argv[++i] ?? '');
    else if (arg === '--input') options.input = resolve(ROOT, argv[++i] ?? '');
    else if (arg === '--cell') options.cell = Number(argv[++i]);
    else if (arg === '--only') options.only = (argv[++i] ?? '').toLowerCase();
    else if (arg === '--help' || arg === '-h') {
      console.log(
        'Uso: node tools/models/atlas-glb.mjs [--write] [--out <dir>] [--input <dir>] [--cell <px>] [--only <texto>] [--refresh-grounding] [--quiet]'
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
// Escala de bind
// ---------------------------------------------------------------------------

const IDENTITY_MAT4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiplyMat4(a, b) {
  const output = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let k = 0; k < 4; k += 1) {
        output[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
      }
    }
  }
  return output;
}

/** Matriz de una transformación `T·R·S` (columnas, como glTF). */
function matrixFromTRS(
  translation = [0, 0, 0],
  rotation = [0, 0, 0, 1],
  scale = [1, 1, 1]
) {
  const [tx, ty, tz] = translation;
  const [x, y, z, w] = rotation;
  const [sx, sy, sz] = scale;
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + w * z) * sx,
    2 * (x * z - w * y) * sx,
    0,
    2 * (x * y - w * z) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + w * x) * sy,
    0,
    2 * (x * z + w * y) * sz,
    2 * (y * z - w * x) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1
  ];
}

/** Matriz local de un nodo glTF: `matrix` o `T·R·S`. */
function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  return matrixFromTRS(node.translation, node.rotation, node.scale);
}

function nodeParents(json) {
  const parents = new Map();
  for (const [index, node] of (json.nodes ?? []).entries()) {
    for (const child of node.children ?? []) parents.set(child, index);
  }
  return parents;
}

/** Matriz de mundo de un nodo, desde la raíz de la escena. */
function worldMatrix(json, parents, index) {
  const chain = [];
  let current = index;
  while (current !== undefined) {
    chain.unshift(current);
    current = parents.get(current);
  }
  let matrix = IDENTITY_MAT4;
  for (const nodeIndex of chain) {
    matrix = multiplyMat4(matrix, nodeMatrix(json.nodes[nodeIndex]));
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// Apoyo horneado (pose de espera)
// ---------------------------------------------------------------------------

/**
 * Sufijos de clip de espera, en el mismo orden de preferencia que el juego
 * (`src/game/model.ts`). El apoyo se mide con el clip que de verdad se verá.
 */
const IDLE_CLIP_PATTERNS = [
  'defaultwait01_loop',
  'battlewait01_loop',
  'ba10_waitA01',
  'ba10_waitB01',
  'kw01_wait01',
  'fi01_wait01',
  'defaultidle01'
];

/** Nombre de clip sin prefijo de exportador ni prefijo de rutina. */
function normalizedClipName(name) {
  return name
    .replace(/\.\d{3}$/, '')
    .replace(/^pm\d{4}(?:_\d{1,3})*_/i, '')
    .replace(/^\d{5}_/, '');
}

/** Rango de rutina: sin prefijo va primero, luego 00000, 10000... */
function clipRoutineRank(name) {
  const match = /^(\d{5})_/.exec(name.replace(/\.\d{3}$/, ''));
  return match ? Number(match[1]) : -1;
}

/** Clip de espera que usa el juego, o el primero si no hay ninguno conocido. */
function idleClipIndex(json) {
  const animations = json.animations ?? [];
  const candidates = animations.map((animation, index) => ({
    animation,
    index,
    name: animation.name ?? ''
  }));
  for (const suffix of IDLE_CLIP_PATTERNS) {
    const matches = candidates.filter(
      (candidate) => normalizedClipName(candidate.name) === suffix
    );
    if (matches.length === 0) continue;
    matches.sort((a, b) => {
      const rank = clipRoutineRank(a.name) - clipRoutineRank(b.name);
      return rank !== 0 ? rank : a.name.localeCompare(b.name);
    });
    return matches[0].index;
  }
  return animations.length > 0 ? 0 : -1;
}

/** Valores de un accessor ya desempaquetados (sin stride) y normalizados. */
function accessorValues(json, bin, index) {
  const { accessor, componentSize, typeCount, count } = accessorLayout(
    json,
    index
  );
  const bytes = readAccessorBytes(json, bin, index);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const normalized = accessor.normalized === true;
  const divisor = normalized
    ? accessor.componentType === 5120
      ? 127
      : accessor.componentType === 5121
        ? 255
        : accessor.componentType === 5122
          ? 32767
          : accessor.componentType === 5123
            ? 65535
            : 1
    : 1;
  const values = new Array(count * typeCount);
  for (let i = 0; i < values.length; i += 1) {
    const offset = i * componentSize;
    let value;
    switch (accessor.componentType) {
      case 5120:
        value = view.getInt8(offset);
        break;
      case 5121:
        value = view.getUint8(offset);
        break;
      case 5122:
        value = view.getInt16(offset, true);
        break;
      case 5123:
        value = view.getUint16(offset, true);
        break;
      case 5125:
        value = view.getUint32(offset, true);
        break;
      case 5126:
        value = view.getFloat32(offset, true);
        break;
      default:
        throw new Error(
          `Accessor ${index} con componentType ${accessor.componentType}`
        );
    }
    values[i] = value / divisor;
  }
  return { accessor, values, count, typeCount };
}

function normalizeQuaternion(quaternion) {
  const length = Math.hypot(
    quaternion[0],
    quaternion[1],
    quaternion[2],
    quaternion[3]
  );
  if (length > 0) {
    for (let i = 0; i < 4; i += 1) quaternion[i] /= length;
  }
  return quaternion;
}

/**
 * Pose del clip en t = 0. Es la pose canónica que antes se forzaba en runtime
 * para que un bot revelado no midiera una fase cualquiera del idle.
 */
function animationPoseAtStart(json, bin, animationIndex) {
  const pose = new Map();
  const animation = json.animations?.[animationIndex];
  if (!animation) return pose;
  for (const channel of animation.channels) {
    const path = channel.target.path;
    if (path !== 'translation' && path !== 'rotation' && path !== 'scale') {
      continue;
    }
    const sampler = animation.samplers?.[channel.sampler];
    if (!sampler) continue;
    const output = accessorValues(json, bin, sampler.output);
    const components = output.typeCount;
    // En t = 0 la primera clave ya es el valor. CUBICSPLINE guarda por clave
    // tangente de entrada, valor y tangente de salida.
    const key = sampler.interpolation === 'CUBICSPLINE' ? 1 : 0;
    const value = output.values.slice(key * components, (key + 1) * components);
    if (path === 'rotation') normalizeQuaternion(value);
    const target = pose.get(channel.target.node) ?? {};
    target[path] = value;
    pose.set(channel.target.node, target);
  }
  return pose;
}

/** Nodo de root motion que el juego deja fijo en su posición de bind. */
function rootMotionNodeIndex(json) {
  return (json.nodes ?? []).findIndex((node) => {
    const name = node.name ?? '';
    return name === 'origin' || name === 'Origin' || /^origin_\d+$/i.test(name);
  });
}

function poseWorldMatrix(json, parents, pose, cache, index) {
  const cached = cache.get(index);
  if (cached) return cached;
  const node = json.nodes[index];
  const animated = pose.get(index);
  let local;
  if (animated && (animated.translation || animated.rotation || animated.scale)) {
    local = matrixFromTRS(
      animated.translation ?? node.translation ?? [0, 0, 0],
      animated.rotation ?? node.rotation ?? [0, 0, 0, 1],
      animated.scale ?? node.scale ?? [1, 1, 1]
    );
  } else {
    local = nodeMatrix(node);
  }
  const parent = parents.get(index);
  const result =
    parent === undefined
      ? local
      : multiplyMat4(
          poseWorldMatrix(json, parents, pose, cache, parent),
          local
        );
  cache.set(index, result);
  return result;
}

/** Caja que envuelve una caja local transformada por `matrix`. */
function transformBounds(matrix, min, max) {
  const outMin = [Infinity, Infinity, Infinity];
  const outMax = [-Infinity, -Infinity, -Infinity];
  for (let corner = 0; corner < 8; corner += 1) {
    const point = [
      corner & 1 ? max[0] : min[0],
      corner & 2 ? max[1] : min[1],
      corner & 4 ? max[2] : min[2]
    ];
    for (let axis = 0; axis < 3; axis += 1) {
      const value =
        matrix[axis] * point[0] +
        matrix[4 + axis] * point[1] +
        matrix[8 + axis] * point[2] +
        matrix[12 + axis];
      if (value < outMin[axis]) outMin[axis] = value;
      if (value > outMax[axis]) outMax[axis] = value;
    }
  }
  return [outMin, outMax];
}

function roundGrounding(value) {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Caja de la pose de espera en t = 0, en unidades del GLB.
 *
 * Reproduce la medición de PlayCanvas (`meshInstance.aabb`): caja local por
 * hueso —cada vértice entra en todos los huesos con peso— transformada por
 * `mundo(hueso) · inverseBind` y unida. Así el valor horneado coincide con el
 * que medía el juego con la copia visible, pero es idéntico para todas las
 * copias y no depende de cuándo aparezca un bot.
 */
function measureIdleGrounding(json, bin) {
  const clipIndex = idleClipIndex(json);
  if (clipIndex < 0) return null;
  const clip = json.animations[clipIndex];
  const pose = animationPoseAtStart(json, bin, clipIndex);

  // El juego nunca aplica el root motion del clip: el hueso `origin` se queda
  // en su posición de bind también al medir.
  const rootIndex = rootMotionNodeIndex(json);
  if (rootIndex >= 0) {
    const target = pose.get(rootIndex) ?? {};
    delete target.translation;
    pose.set(rootIndex, target);
  }

  const parents = nodeParents(json);
  const cache = new Map();
  let minY = Infinity;
  let maxY = -Infinity;
  const union = (bounds) => {
    if (bounds[0][1] < minY) minY = bounds[0][1];
    if (bounds[1][1] > maxY) maxY = bounds[1][1];
  };

  for (let nodeIndex = 0; nodeIndex < (json.nodes ?? []).length; nodeIndex += 1) {
    const node = json.nodes[nodeIndex];
    if (node.mesh === undefined) continue;
    const mesh = json.meshes?.[node.mesh];
    if (!mesh) continue;
    const skin =
      node.skin !== undefined ? json.skins?.[node.skin] : undefined;
    const inverseBinds =
      skin && skin.inverseBindMatrices !== undefined
        ? accessorValues(json, bin, skin.inverseBindMatrices).values
        : null;

    for (const primitive of mesh.primitives ?? []) {
      const positionIndex = primitive.attributes?.POSITION;
      if (positionIndex === undefined) continue;
      const position = accessorValues(json, bin, positionIndex);
      const jointsIndex = primitive.attributes?.JOINTS_0;
      const weightsIndex = primitive.attributes?.WEIGHTS_0;

      if (
        skin &&
        inverseBinds &&
        jointsIndex !== undefined &&
        weightsIndex !== undefined
      ) {
        const joints = accessorValues(json, bin, jointsIndex);
        const weights = accessorValues(json, bin, weightsIndex);
        const boneMin = skin.joints.map(() => [
          Infinity,
          Infinity,
          Infinity
        ]);
        const boneMax = skin.joints.map(() => [
          -Infinity,
          -Infinity,
          -Infinity
        ]);

        for (let vertex = 0; vertex < position.count; vertex += 1) {
          const point = [
            position.values[vertex * 3],
            position.values[vertex * 3 + 1],
            position.values[vertex * 3 + 2]
          ];
          for (let influence = 0; influence < 4; influence += 1) {
            const weight = weights.values[vertex * 4 + influence];
            if (weight <= 0) continue;
            const joint = joints.values[vertex * 4 + influence];
            if (!Number.isInteger(joint) || !boneMin[joint]) continue;
            for (let axis = 0; axis < 3; axis += 1) {
              if (point[axis] < boneMin[joint][axis]) {
                boneMin[joint][axis] = point[axis];
              }
              if (point[axis] > boneMax[joint][axis]) {
                boneMax[joint][axis] = point[axis];
              }
            }
          }
        }

        for (let joint = 0; joint < skin.joints.length; joint += 1) {
          if (!Number.isFinite(boneMin[joint][0])) continue;
          const inverseBind = Array.from(
            inverseBinds.slice(joint * 16, joint * 16 + 16)
          );
          const jointMatrix = multiplyMat4(
            poseWorldMatrix(
              json,
              parents,
              pose,
              cache,
              skin.joints[joint]
            ),
            inverseBind
          );
          union(transformBounds(jointMatrix, boneMin[joint], boneMax[joint]));
        }
        continue;
      }

      // Malla estática: su caja se transforma por el nodo, como PlayCanvas.
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        for (let axis = 0; axis < 3; axis += 1) {
          const value = position.values[vertex * 3 + axis];
          if (value < min[axis]) min[axis] = value;
          if (value > max[axis]) max[axis] = value;
        }
      }
      union(
        transformBounds(
          poseWorldMatrix(json, parents, pose, cache, nodeIndex),
          min,
          max
        )
      );
    }
  }

  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY < minY) {
    return null;
  }
  return {
    version: 1,
    clip: clip.name ?? '',
    minY: roundGrounding(minY),
    maxY: roundGrounding(maxY)
  };
}

/** Añade (o reemplaza) el apoyo horneado en los `extras` del glTF. */
function withGrounding(json, grounding) {
  const extras = { ...(json.extras ?? {}) };
  extras.newpoke = { ...(extras.newpoke ?? {}), grounding };
  return { ...json, extras };
}

/** Índices de joint que de verdad usan los `JOINTS_0` de las primitivas. */
function referencedJoints(json, bin) {
  const used = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const index = primitive.attributes?.JOINTS_0;
      if (index === undefined) continue;
      const { componentSize, count } = accessorLayout(json, index);
      const bytes = readAccessorBytes(json, bin, index);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const read =
        componentSize === 1
          ? (offset) => view.getUint8(offset)
          : (offset) => view.getUint16(offset, true);
      for (let i = 0; i < count * 4; i += 1) used.add(read(i * componentSize));
    }
  }
  return used;
}

/**
 * Escala uniforme que el skin aplica al espacio de los accessors en la pose de
 * bind: `B = mundo(joint) · inverseBindMatrix`.
 *
 * Cuando todas las `B` usadas valen `s·I`, el cuerpo se dibuja `s` veces más
 * grande de lo que dicen los accessors (Sketchfab hornea la escala en el nodo
 * raíz y PlayCanvas la aplica al esqueleto), así que `min`/`max` mienten y el
 * juego necesita un factor a mano. Hornear `s` en `POSITION` y dividir la raíz
 * por `s` deja `B = I`, sin cambiar ni un vértice en pantalla.
 *
 * Se mira el bind y no la escala del nodo raíz porque no siempre coinciden: en
 * Onix la raíz escala 0,01 pero las inversas de bind la compensan y el bind real
 * es 1.
 */
function bindScale(json, bin) {
  const scene = json.scenes?.[json.scene ?? 0];
  if (!scene || scene.nodes.length !== 1) return null;
  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  if (primitives.length === 0) return null;
  // Mezclar mallas skinneadas y estáticas haría que el factor no aplicara igual.
  if (primitives.some((primitive) => primitive.attributes?.JOINTS_0 === undefined)) {
    return null;
  }
  const rootIndex = scene.nodes[0];
  if (
    (json.animations ?? []).some((animation) =>
      animation.channels.some((channel) => channel.target.node === rootIndex)
    )
  ) {
    return null;
  }

  const parents = nodeParents(json);
  const skins = new Set(
    (json.nodes ?? [])
      .filter((node) => node.mesh !== undefined && node.skin !== undefined)
      .map((node) => node.skin)
  );
  if (skins.size !== 1) return null;
  const skin = json.skins?.[[...skins][0]];
  if (!skin || skin.inverseBindMatrices === undefined) return null;

  const joints = referencedJoints(json, bin);
  if (joints.size === 0) return null;

  const layout = accessorLayout(json, skin.inverseBindMatrices);
  if (layout.accessor.componentType !== 5126 || layout.accessor.type !== 'MAT4') {
    return null;
  }
  const inverseBinds = readAccessorBytes(json, bin, skin.inverseBindMatrices);
  const view = new DataView(
    inverseBinds.buffer,
    inverseBinds.byteOffset,
    inverseBinds.byteLength
  );

  let factor = null;
  for (const joint of joints) {
    if (joint >= skin.joints.length) return null;
    const inverseBind = Array.from({ length: 16 }, (_, i) =>
      view.getFloat32((joint * 16 + i) * 4, true)
    );
    const bind = multiplyMat4(
      worldMatrix(json, parents, skin.joints[joint]),
      inverseBind
    );
    const scale = bind[0];
    const tolerance = Math.abs(scale) * 1e-4 + 1e-6;
    // Sin rotación ni traslación: el bind solo debe escalar.
    if (Math.abs(bind[5] - scale) > tolerance) return null;
    if (Math.abs(bind[10] - scale) > tolerance) return null;
    for (const index of [1, 2, 4, 6, 8, 9, 12, 13, 14]) {
      if (Math.abs(bind[index]) > tolerance) return null;
    }
    if (!(scale > 0)) return null;
    if (factor === null) factor = scale;
    else if (Math.abs(factor - scale) > tolerance) return null;
  }

  if (factor === null || Math.abs(factor - 1) <= 1e-4) return null;
  return { factor, rootIndex };
}

/**
 * Divide la transformación del nodo raíz por `factor`, conservando su forma.
 * Así `mundo(joint)` también queda dividido y el bind pasa a ser identidad.
 */
function normalizeRootScale(node, factor) {
  if (node.matrix) {
    // Solo el bloque afín (columnas 0-3, filas 0-2): conservar [0,0,0,1].
    node.matrix = node.matrix.map((value, index) =>
      index % 4 === 3 ? value : value / factor
    );
    return;
  }
  if (node.translation) {
    node.translation = node.translation.map((value) => value / factor);
  }
  const scale = node.scale ?? [1, 1, 1];
  node.scale = scale.map((value) => value / factor);
}

/** Escala posiciones FLOAT empaquetadas (VEC3). */
function scalePositions(data, count, factor) {
  const output = Buffer.from(data);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  for (let i = 0; i < count * 3; i += 1) {
    view.setFloat32(i * 4, view.getFloat32(i * 4, true) * factor, true);
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
  let palette = null;
  let transparency = null;
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
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      transparency = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (interlace !== 0) throw new Error('PNG entrelazado: no soportado');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (channels === undefined) {
    throw new Error(`PNG con colorType ${colorType}: no soportado`);
  }
  const allowedDepths =
    colorType === 0
      ? [1, 2, 4, 8, 16]
      : colorType === 3
        ? [1, 2, 4, 8]
        : [8, 16];
  if (!allowedDepths.includes(bitDepth)) {
    throw new Error(
      `PNG con profundidad ${bitDepth} y colorType ${colorType}: no soportado`
    );
  }
  if (colorType === 3 && !palette) throw new Error('PNG indexado sin PLTE');

  const bitsPerPixel = channels * bitDepth;
  const bitsPerRow = width * bitsPerPixel;
  const bytesPerRow = Math.ceil(bitsPerRow / 8);
  const filterBytes = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const raw = inflateSync(Buffer.concat(idat));
  const stride = bytesPerRow + 1;
  if (raw.length < stride * height) throw new Error('PNG truncado');
  const rows = Buffer.alloc(bytesPerRow * height);
  let previous = Buffer.alloc(bytesPerRow);
  let line = Buffer.alloc(bytesPerRow);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    const filter = raw[rowStart];
    raw.copy(line, 0, rowStart + 1, rowStart + 1 + bytesPerRow);
    for (let x = 0; x < bytesPerRow; x += 1) {
      const left = x >= filterBytes ? line[x - filterBytes] : 0;
      const up = previous[x];
      const upLeft = x >= filterBytes ? previous[x - filterBytes] : 0;
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
    line.copy(rows, y * bytesPerRow);
    previous = Buffer.from(line);
  }

  const output = Buffer.alloc(width * height * 4);

  // Camino rápido para los PNG que ya genera el exportador de Blender.
  if (bitDepth === 8 && !transparency && (colorType === 2 || colorType === 6)) {
    if (colorType === 6) {
      rows.copy(output);
    } else {
      for (let i = 0, s = 0, d = 0; i < width * height; i += 1, s += 3, d += 4) {
        output[d] = rows[s];
        output[d + 1] = rows[s + 1];
        output[d + 2] = rows[s + 2];
        output[d + 3] = 255;
      }
    }
    return { width, height, data: output };
  }

  /** Lee el componente `index` de la fila `row`. En 16 bits devuelve el byte alto. */
  const sample = (row, index, depth) => {
    if (depth === 8) return rows[row * bytesPerRow + index];
    if (depth === 16) return rows[row * bytesPerRow + index * 2];
    const bit = index * depth;
    const byte = rows[row * bytesPerRow + (bit >> 3)];
    return (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };
  const scale = (value, depth) =>
    depth < 8 ? Math.round((value * 255) / ((1 << depth) - 1)) : value;

  const transparentGray =
    colorType === 0 && transparency ? transparency.readUInt16BE(0) : null;
  const transparentRgb =
    colorType === 2 && transparency
      ? [
          transparency.readUInt16BE(0),
          transparency.readUInt16BE(2),
          transparency.readUInt16BE(4)
        ]
      : null;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      let alpha = 255;
      if (colorType === 3) {
        const index =
          bitDepth === 8 ? rows[y * bytesPerRow + x] : sample(y, x, bitDepth);
        const p = index * 3;
        output[target] = palette[p] ?? 0;
        output[target + 1] = palette[p + 1] ?? 0;
        output[target + 2] = palette[p + 2] ?? 0;
        if (transparency && transparency[index] !== undefined) {
          alpha = transparency[index];
        }
      } else if (colorType === 0) {
        const value = sample(y, x, bitDepth);
        const gray = scale(value, bitDepth);
        output[target] = gray;
        output[target + 1] = gray;
        output[target + 2] = gray;
        if (transparentGray !== null) {
          const rawValue =
            bitDepth === 16
              ? rows.readUInt16BE(y * bytesPerRow + x * 2)
              : value;
          if (rawValue === transparentGray) alpha = 0;
        }
      } else if (colorType === 4) {
        const gray = scale(sample(y, x * 2, bitDepth), bitDepth);
        output[target] = gray;
        output[target + 1] = gray;
        output[target + 2] = gray;
        alpha = scale(sample(y, x * 2 + 1, bitDepth), bitDepth);
      } else if (colorType === 2) {
        const p = y * bytesPerRow + x * (bitDepth === 16 ? 6 : 3);
        if (bitDepth === 16) {
          const r = rows.readUInt16BE(p);
          const g = rows.readUInt16BE(p + 2);
          const b = rows.readUInt16BE(p + 4);
          output[target] = r >> 8;
          output[target + 1] = g >> 8;
          output[target + 2] = b >> 8;
          if (
            transparentRgb &&
            r === transparentRgb[0] &&
            g === transparentRgb[1] &&
            b === transparentRgb[2]
          ) {
            alpha = 0;
          }
        } else {
          output[target] = rows[p];
          output[target + 1] = rows[p + 1];
          output[target + 2] = rows[p + 2];
          if (
            transparentRgb &&
            rows[p] === transparentRgb[0] &&
            rows[p + 1] === transparentRgb[1] &&
            rows[p + 2] === transparentRgb[2]
          ) {
            alpha = 0;
          }
        }
      } else {
        const p = y * bytesPerRow + x * (bitDepth === 16 ? 8 : 4);
        if (bitDepth === 16) {
          output[target] = rows[p];
          output[target + 1] = rows[p + 2];
          output[target + 2] = rows[p + 4];
          alpha = rows[p + 6];
        } else {
          output[target] = rows[p];
          output[target + 1] = rows[p + 1];
          output[target + 2] = rows[p + 2];
          alpha = rows[p + 3];
        }
      }
      output[target + 3] = alpha;
    }
  }
  return { width, height, data: output };
}

function encodePng(width, height, rgba) {
  let hasAlpha = false;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 255) {
      hasAlpha = true;
      break;
    }
  }
  const channels = hasAlpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const target = row + 1 + x * channels;
      raw[target] = rgba[source];
      raw[target + 1] = rgba[source + 1];
      raw[target + 2] = rgba[source + 2];
      if (hasAlpha) raw[target + 3] = rgba[source + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = hasAlpha ? 6 : 2;
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
function drawScaled(
  destination,
  destinationWidth,
  destinationHeight,
  source,
  dx,
  dy,
  dw,
  dh,
  preserveAlpha = false
) {
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
      const a = preserveAlpha
        ? data[i00 + 3] * w00 +
          data[i10 + 3] * w10 +
          data[i01 + 3] * w01 +
          data[i11 + 3] * w11
        : 255;
      setPixel(
        destination,
        destinationWidth,
        dx + x,
        dy + y,
        Math.round(r),
        Math.round(g),
        Math.round(b),
        Math.round(a)
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
    pixels[target + 3] = pixels[source + 3];
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
 * Hornea `KHR_texture_transform` en una textura nueva: `nueva(uv) = vieja(T(uv))`.
 * El atlas puede así usar las UV originales y descartar la extensión, que
 * PlayCanvas aplica en el shader y el atlas no sabe conservar.
 */
function bakeTextureTransform(png, transform) {
  const source = decodePng(png);
  const { width, height, data } = source;
  const offset = transform.offset ?? [0, 0];
  const scale = transform.scale ?? [1, 1];
  const rotation = transform.rotation ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const output = Buffer.alloc(width * height * 4);

  const texel = (x, y) => {
    const wx = ((x % width) + width) % width;
    const wy = ((y % height) + height) % height;
    return (wy * width + wx) * 4;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      const tu = offset[0] + scale[0] * (u * cos + v * sin);
      const tv = offset[1] + scale[1] * (-u * sin + v * cos);
      const sx = tu * width - 0.5;
      const sy = tv * height - 0.5;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const p00 = texel(x0, y0);
      const p10 = texel(x0 + 1, y0);
      const p01 = texel(x0, y0 + 1);
      const p11 = texel(x0 + 1, y0 + 1);
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const target = (y * width + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        output[target + c] = Math.round(
          data[p00 + c] * w00 +
            data[p10 + c] * w10 +
            data[p01 + c] * w01 +
            data[p11 + c] * w11
        );
      }
    }
  }
  return encodePng(width, height, output);
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
      drawScaled(
        pixels,
        width,
        height,
        decoded,
        x + pad,
        y + pad,
        content,
        content,
        kind === 'base'
      );
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
  // Los GLB con sampler REPEAT pueden traer UVs fuera de 0..1 (los ojos de
  // Greninja, por ejemplo). El atlas usa CLAMP_TO_EDGE, así que se envuelven.
  const wrap = (value) =>
    value < 0 || value > 1 ? value - Math.floor(value) : value;
  for (let i = 0; i < count; i += 1) {
    const u = wrap(source.getFloat32(i * 8, true));
    const v = wrap(source.getFloat32(i * 8 + 4, true));
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
      // Los materiales con alfa o cara doble se agrupan aparte: comparten
      // material fusionado, pero no deben arrastrar al grupo opaco.
      const alphaMode = material.alphaMode ?? 'OPAQUE';
      const alphaCutoff = alphaMode === 'MASK' ? (material.alphaCutoff ?? 0.5) : 0;
      const doubleSided = material.doubleSided === true;
      const baseColorFactor = [
        ...(material.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1])
      ];
      // Alfa 0 y blending: el material no pinta ningún píxel. No gasta celda.
      if (alphaMode !== 'OPAQUE' && baseColorFactor[3] === 0) continue;
      const unlit = material.extensions?.KHR_materials_unlit !== undefined;
      const kind = hasBase ? 'lit' : 'emissive';
      const key = [
        kind,
        alphaMode,
        alphaCutoff,
        doubleSided,
        unlit,
        baseColorFactor.map((value) => Number(value).toFixed(4)).join(',')
      ].join('|');
      let group = byMaterial.get(key);
      if (!group) {
        group = {
          kind,
          alphaMode,
          alphaCutoff,
          doubleSided,
          unlit,
          baseColorFactor,
          materials: [],
          primitives: []
        };
        byMaterial.set(key, group);
        groups.push(group);
      }
      if (!group.materials.includes(materialIndex)) group.materials.push(materialIndex);
      group.primitives.push({ meshIndex, primitiveIndex, materialIndex });
    }
  }
  // El grupo opaco va primero para que su nodo sea el principal.
  const alphaRank = { OPAQUE: 0, MASK: 1, BLEND: 2 };
  groups.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'lit' ? -1 : 1;
    return alphaRank[a.alphaMode] - alphaRank[b.alphaMode];
  });
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
      } else if (name === 'POSITION' && context.bindScale !== 1) {
        bytes = scalePositions(bytes, count, context.bindScale);
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
  const bake = bindScale(json, bin);
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
    bindScale: bake?.factor ?? 1,
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

  const materialImage = (materialIndex, slot) => {
    const material = json.materials[materialIndex];
    const reference =
      slot === 'base'
        ? material.pbrMetallicRoughness?.baseColorTexture
        : slot === 'normal'
          ? material.normalTexture
          : material.emissiveTexture;
    const image = reference ? textureImage(json, bin, reference.index) : null;
    const transform = reference?.extensions?.KHR_texture_transform;
    if (!image || !transform) return image;
    if (transform.texCoord !== undefined && transform.texCoord !== 0) {
      throw new Error(
        `Material ${material.name ?? materialIndex}: KHR_texture_transform pide TEXCOORD_${transform.texCoord}`
      );
    }
    return bakeTextureTransform(image, transform);
  };

  for (const group of groups) {
    const entries = group.materials.map((materialIndex) => ({
      material: materialIndex,
      image: materialImage(
        materialIndex,
        group.kind === 'lit' ? 'base' : 'emissive'
      )
    }));
    const atlas = buildAtlas(entries, 'base', options.cell);
    for (const [material, rect] of atlas.rects) rectsByMaterial.set(material, rect);

    const normalEntries =
      group.kind === 'lit'
        ? group.materials.map((materialIndex) => ({
            material: materialIndex,
            image: materialImage(materialIndex, 'normal')
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
    let material;
    if (group.kind === 'lit') {
      materialIndex = materials.length;
      material = {
        name: 'atlas-lit',
        pbrMetallicRoughness: {
          baseColorTexture: { index: baseTexture },
          metallicFactor: 0,
          roughnessFactor: 0.72
        }
      };
      if (group.baseColorFactor.some((value) => value !== 1)) {
        material.pbrMetallicRoughness.baseColorFactor = [
          ...group.baseColorFactor
        ];
      }
      if (normalTexture !== null) material.normalTexture = { index: normalTexture };
    } else {
      materialIndex = materials.length;
      const alpha = group.alphaMode === 'OPAQUE' ? 1 : group.baseColorFactor[3];
      material = {
        name: 'atlas-emissive',
        emissiveFactor: [1, 1, 1],
        emissiveTexture: { index: baseTexture },
        pbrMetallicRoughness: {
          baseColorFactor: [0, 0, 0, alpha],
          metallicFactor: 0,
          roughnessFactor: 0.72
        }
      };
    }
    if (group.alphaMode !== 'OPAQUE') material.alphaMode = group.alphaMode;
    if (group.alphaMode === 'MASK') material.alphaCutoff = group.alphaCutoff;
    if (group.doubleSided) material.doubleSided = true;
    if (group.unlit) material.extensions = { KHR_materials_unlit: {} };
    materials.push(material);

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
  if (bake) normalizeRootScale(nodes[bake.rootIndex], bake.factor);
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
  // El rebuild hornea texture_transform en las texturas y solo conserva unlit
  // si todos los materiales del grupo lo eran.
  const hasUnlit = groups.some((group) => group.unlit);
  const usedExtensions = (json.extensionsUsed ?? []).filter(
    (name) => name !== 'KHR_texture_transform' && (name !== 'KHR_materials_unlit' || hasUnlit)
  );
  if (usedExtensions.length > 0) newJson.extensionsUsed = usedExtensions;
  const requiredExtensions = (json.extensionsRequired ?? []).filter(
    (name) => name !== 'KHR_texture_transform' && (name !== 'KHR_materials_unlit' || hasUnlit)
  );
  if (requiredExtensions.length > 0) {
    newJson.extensionsRequired = requiredExtensions;
  }

  const newBin = Buffer.concat(state.parts);
  // El apoyo se mide sobre el GLB ya reconstruido: así la caja usa la misma
  // escala de bind y la misma jerarquía que verá PlayCanvas.
  const grounding = measureIdleGrounding(newJson, newBin);
  const outputJson = grounding
    ? withGrounding({ ...newJson, extras: json.extras }, grounding)
    : { ...newJson, ...(json.extras ? { extras: json.extras } : {}) };
  return {
    json: outputJson,
    bin: newBin,
    groups,
    materials: materials.length,
    primitives: groups.length,
    textures: textures.length,
    images: images.length,
    bakedScale: bake?.factor ?? null,
    grounding
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
    const hasAtlas = json.asset?.generator?.includes('newpoke atlas') === true;
    const hasGrounding = json.extras?.newpoke?.grounding !== undefined;
    if (hasAtlas && hasGrounding && !options.refreshGrounding) {
      console.log(`${file.relativePath}\tya tiene atlas y apoyo, se omite`);
      skipped += 1;
      continue;
    }

    const inputMaterials = json.materials?.length ?? 0;
    const inputPrimitives = (json.meshes ?? []).reduce(
      (sum, mesh) => sum + mesh.primitives.length,
      0
    );
    let outputJson;
    let outputBin;
    let grounding;
    let outputMaterials;
    let outputPrimitives;
    let bakedScale = null;
    if (hasAtlas) {
      // Los GLB ya publicados solo necesitan el apoyo horneado: no se toca la
      // geometría ni las texturas.
      grounding = measureIdleGrounding(json, bin);
      outputJson = grounding ? withGrounding(json, grounding) : json;
      outputBin = bin;
      outputMaterials = inputMaterials;
      outputPrimitives = inputPrimitives;
    } else {
      const rebuilt = rebuildModel(json, bin, options);
      outputJson = rebuilt.json;
      outputBin = rebuilt.bin;
      grounding = rebuilt.grounding;
      outputMaterials = rebuilt.materials;
      outputPrimitives = rebuilt.primitives;
      bakedScale = rebuilt.bakedScale;
    }
    if (!grounding) {
      console.warn(
        `${file.relativePath}: no se pudo hornear el apoyo; el runtime usará su fallback`
      );
    }
    const output = buildGlb(outputJson, outputBin);
    reports.push({
      file: file.relativePath,
      inputBytes: original.length,
      outputBytes: output.length,
      inputMaterials,
      inputPrimitives,
      outputMaterials,
      outputPrimitives
    });
    if (!options.quiet) {
      const baked = bakedScale
        ? `\tescala ${bakedScale.toFixed(4)} horneada`
        : '';
      const support = grounding
        ? `\tapoyo ${grounding.minY.toFixed(3)}..${grounding.maxY.toFixed(3)}`
        : '';
      console.log(
        `${file.relativePath}\t${formatBytes(original.length)} -> ${formatBytes(output.length)}\t${inputMaterials} -> ${outputMaterials}\t${inputPrimitives} -> ${outputPrimitives}\t${outputJson.textures?.length ?? 0}${baked}${support}`
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
    console.log('Nada que hacer: todos los GLB ya tienen atlas y apoyo.');
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
