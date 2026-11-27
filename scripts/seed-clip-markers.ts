#!/usr/bin/env node
/**
 * Genera el `clips.json` inicial de cada modelo analizando el movimiento real
 * de sus clips 3D.
 *
 * Los marcadores de sprite (`HitFrame`/`ReturnFrame`) no sirven directamente:
 * un GLB puede tener una anticipación distinta y el porcentaje del sprite cae
 * en la recuperación. Aquí se mide la velocidad angular de los huesos y se usa
 * su pico como `impact`; `followThrough` es el primer valle después del pico.
 *
 * Uso:
 *   pnpm seed:clip-markers
 *   pnpm seed:clip-markers -- --force   (sobrescribe los existentes)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { POKEMON_MODELS } from '../src/game/modelCatalog.ts';

interface GlbJson {
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
    min?: number[];
    max?: number[];
  }>;
  bufferViews?: Array<{
    buffer?: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
  }>;
  nodes?: Array<{ name?: string }>;
  animations?: Array<{
    name?: string;
    channels: Array<{
      sampler: number;
      target: { node?: number; path: string };
    }>;
    samplers: Array<{ input: number; output: number }>;
  }>;
}

interface GlbData {
  json: GlbJson;
  bin: DataView;
  binStart: number;
}

const COMPONENT_SIZE: Record<number, number> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4
};
const TYPE_COUNT: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16
};
/** Resolución del perfil de movimiento. */
const BIN_SECONDS = 1 / 30;
/** Por debajo de esta energía el clip se considera sin golpe claro. */
const MIN_MOTION = 0.25;

function readGlb(file: string): GlbData | null {
  const buffer = readFileSync(file);
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );
  if (buffer.byteLength < 12 || view.getUint32(0, true) !== 0x46546c67) {
    return null;
  }

  let json: GlbJson | null = null;
  let binStart = 0;
  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (type === 0x4e4f534a) {
      json = JSON.parse(
        new TextDecoder().decode(
          new Uint8Array(buffer.buffer, buffer.byteOffset + offset + 8, length)
        )
      ) as GlbJson;
    } else if (type === 0x004e4942) {
      binStart = offset + 8;
    }
    offset += 8 + length;
  }
  return json ? { json, bin: view, binStart } : null;
}

/** Lee un accessor como filas de componentes. */
function readAccessor(glb: GlbData, index: number): number[][] {
  const accessor = glb.json.accessors?.[index];
  if (!accessor || accessor.bufferView === undefined) return [];
  const bufferView = glb.json.bufferViews?.[accessor.bufferView];
  if (!bufferView) return [];
  const components = TYPE_COUNT[accessor.type] ?? 1;
  const size = COMPONENT_SIZE[accessor.componentType] ?? 4;
  const start =
    glb.binStart +
    (bufferView.byteOffset ?? 0) +
    (accessor.byteOffset ?? 0);
  const stride = bufferView.byteStride ?? components * size;
  const rows: number[][] = [];
  for (let row = 0; row < accessor.count; row++) {
    const values: number[] = [];
    for (let component = 0; component < components; component++) {
      const at = start + row * stride + component * size;
      switch (accessor.componentType) {
        case 5126:
          values.push(glb.bin.getFloat32(at, true));
          break;
        case 5123:
          values.push(glb.bin.getUint16(at, true));
          break;
        case 5125:
          values.push(glb.bin.getUint32(at, true));
          break;
        case 5121:
          values.push(glb.bin.getUint8(at));
          break;
        case 5122:
          values.push(glb.bin.getInt16(at, true));
          break;
        default:
          values.push(glb.bin.getInt8(at));
      }
    }
    rows.push(values);
  }
  return rows;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function quatAngle(a: number[], b: number[]): number {
  const dot = Math.min(
    1,
    Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
  );
  return Number.isFinite(dot) ? 2 * Math.acos(dot) : 0;
}

/**
 * Perfil de energía: suma de los ángulos recorridos por todos los huesos en
 * cada intervalo. El pico marca el golpe/gesto principal del clip.
 */
function motionProfile(
  glb: GlbData,
  animation: NonNullable<GlbJson['animations']>[number],
  duration: number
): Array<{ time: number; energy: number }> {
  const raw = new Map<number, number>();
  for (const channel of animation.channels) {
    if (channel.target.path !== 'rotation') continue;
    // Un parpadeo mueve los párpados mucho más que un golpe a cualquier hueso
    // del cuerpo, así que puede ganar el pico y marcar el impacto en un blink.
    const bone = glb.json.nodes?.[channel.target.node ?? -1]?.name ?? '';
    if (/eyelid|eye/i.test(bone)) continue;
    const sampler = animation.samplers[channel.sampler];
    if (!sampler) continue;
    const times = readAccessor(glb, sampler.input).map((row) => row[0]);
    const values = readAccessor(glb, sampler.output);
    for (let index = 1; index < values.length; index++) {
      const time = times[index];
      if (time < duration * 0.03 || time > duration * 0.97) continue;
      const angle = quatAngle(values[index - 1], values[index]);
      if (angle <= 0) continue;
      const bin = Math.round(time / BIN_SECONDS) * BIN_SECONDS;
      raw.set(bin, (raw.get(bin) ?? 0) + angle);
    }
  }

  const keys = [...raw.keys()].sort((a, b) => a - b);
  return keys.map((time, index) => {
    let total = 0;
    let weight = 0;
    for (let offset = -1; offset <= 1; offset++) {
      const value = raw.get(keys[index + offset]);
      if (value === undefined) continue;
      const w = offset === 0 ? 2 : 1;
      total += value * w;
      weight += w;
    }
    return { time, energy: weight > 0 ? total / weight : 0 };
  });
}

function analyzeClip(
  glb: GlbData,
  animation: NonNullable<GlbJson['animations']>[number]
): { impact: number; followThrough: number } {
  const duration =
    glb.json.accessors?.[animation.samplers[0]?.input ?? -1]?.max?.[0] ?? 0;
  if (!(duration > 0)) {
    return { impact: 0.5, followThrough: 1 };
  }
  const profile = motionProfile(glb, animation, duration);
  if (profile.length === 0) {
    return { impact: 0.5, followThrough: 1 };
  }

  let peak = profile[0];
  for (const sample of profile) {
    if (sample.energy > peak.energy) peak = sample;
  }
  if (peak.energy < MIN_MOTION) {
    return { impact: 0.5, followThrough: 1 };
  }

  const threshold = peak.energy * 0.3;
  let followThrough: number | null = null;
  for (const sample of profile) {
    if (sample.time <= peak.time + BIN_SECONDS) continue;
    if (sample.energy <= threshold) {
      followThrough = sample.time;
      break;
    }
  }
  if (followThrough === null) {
    followThrough = peak.time + Math.max(0.15, duration * 0.15);
  }

  const impact = clamp(peak.time / duration, 0.05, 0.95);
  return {
    impact: round(impact),
    followThrough: round(
      clamp(
        Math.max(impact + 0.05, followThrough / duration),
        0,
        1
      )
    )
  };
}

/** Quita el prefijo de exportador que también limpia `model.ts`. */
function clipKey(name: string): string {
  return name
    .replace(/\.\d{3}$/, '')
    .replace(/^pm\d{4}(?:_\d{1,3})*_/i, '');
}

const ROOT = process.cwd();
const force = process.argv.includes('--force');
let written = 0;
let skipped = 0;
let clips = 0;

for (const model of Object.values(POKEMON_MODELS)) {
  const slash = model.file.lastIndexOf('/');
  if (slash < 0) continue;
  const directory = path.join(
    ROOT,
    'public',
    'models',
    model.file.slice(0, slash)
  );
  const output = path.join(directory, 'clips.json');
  if (existsSync(output) && !force) {
    skipped++;
    continue;
  }

  const glb = readGlb(path.join(directory, path.basename(model.file)));
  const animations = glb?.json.animations ?? [];
  if (!glb || animations.length === 0) {
    skipped++;
    continue;
  }

  const markers: Record<
    string,
    { impact: number; followThrough: number }
  > = {};
  for (const animation of animations) {
    const name = animation.name ?? '';
    if (!name) continue;
    const key = clipKey(name);
    if (!key) continue;
    markers[key] = analyzeClip(glb, animation);
    clips++;
  }

  mkdirSync(directory, { recursive: true });
  writeFileSync(output, `${JSON.stringify(markers, null, 2)}\n`, 'utf8');
  written++;
}

console.log(
  `clips.json: ${written} escritos, ${skipped} conservados, ${clips} clips analizados (usa --force para sobrescribir).`
);
