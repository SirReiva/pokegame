#!/usr/bin/env node
/**
 * Valida los planes de casteo de todas las habilidades del roster contra los
 * marcadores de los clips.
 *
 * Uso:
 *   pnpm validate:anims
 *
 * Comprueba:
 * - El efecto cae exactamente en `startup`.
 * - El plan termina exactamente en `startup + active + recovery`.
 * - El clip visible en el efecto está en su marcador de impacto.
 * - La velocidad queda dentro de [MIN_PLAYBACK, MAX_PLAYBACK].
 * - Los segmentos no se solapan ni se salen del casteo.
 *
 * Hace dos pasadas:
 * 1. Con el manifiesto de sprites (semilla de la migración).
 * 2. Con los assets reales de `public/models`: duración del GLB y marcadores
 *    del `clips.json` de cada modelo. Esta pasada avisa además del anticipo
 *    que se recorta antes del impacto, pero solo cuando el tramo descartado
 *    contiene movimiento real (no intro en reposo). Usa `--verbose` para ver
 *    todos los recortes en vez de solo los 15 peores.
 * La primera pasada usa el manifiesto de sprites como semilla; la segunda lee
 * las duraciones reales del GLB y los marcadores del `clips.json` de cada
 * modelo, que es lo que termina viendo el jugador.
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { ABILITIES, MOVESETS } from '../src/game/abilities.ts';
import {
  animationScriptFor,
  buildCastPlan,
  clipTimeAt,
  segmentAt
} from '../src/game/castPlan.ts';
import {
  MAX_PLAYBACK,
  MIN_PLAYBACK,
  clipDuration,
  clipTiming,
  frameBoundary,
  frameStart,
  resolveAnimationName
} from '../src/game/animationTimeline.ts';
import type { ClipInfo, ClipLibrary, ResolvedClip } from '../src/game/core/clipLibrary.ts';
import { normalizeMarkers } from '../src/game/core/clipLibrary.ts';
import type { AnimationName, SpriteAnimation } from '../src/game/types.ts';

interface ManifestPokemon {
  id: string;
  animations: Record<string, SpriteAnimation>;
}
interface Manifest {
  pokemon: ManifestPokemon[];
}

const EPSILON = 1e-5;
/** Umbrales del informe de anticipo recortado. */
const MIN_LOST_SECONDS = 0.15;
const MIN_LOST_MOTION = 0.2;
const IDLE_DENSITY_RATIO = 0.5;
const ROOT = process.cwd();
const MODEL_DIR = path.join(ROOT, 'public', 'models');
/** `--verbose` imprime todos los recortes de anticipo, no solo los peores. */
const VERBOSE = process.argv.includes('--verbose');
const manifest: Manifest = JSON.parse(
  readFileSync(path.join(ROOT, 'public', 'sprites', 'manifest.json'), 'utf8')
);

const byId = new Map(manifest.pokemon.map((entry) => [entry.id, entry]));

function phaseFor(sprite: SpriteAnimation, frame: number): number {
  const duration = clipDuration(sprite);
  if (duration <= 0) return 0;
  const start = frameStart(sprite, frame);
  const end = frameBoundary(sprite, frame + 1);
  return (start + end) / 2 / duration;
}

function libraryFor(
  animations: Record<string, SpriteAnimation>
): ClipLibrary {
  const withRun: Record<string, SpriteAnimation> = animations.run
    ? animations
    : { ...animations, run: animations.walk };
  const library: ClipLibrary = {};
  for (const [animation, sprite] of Object.entries(withRun)) {
    const duration = clipDuration(sprite);
    if (duration <= 0) continue;
    const timing = clipTiming(sprite);
    library[animation as AnimationName] = {
      animation: animation as AnimationName,
      duration,
      loop: true,
      markers: {
        impact: phaseFor(sprite, timing.hitFrame),
        followThrough: phaseFor(sprite, timing.returnFrame)
      },
      rootMotion: 'ignore'
    };
  }
  return library;
}

function resolverFor(
  animations: Record<string, SpriteAnimation>
): (name: AnimationName) => ResolvedClip | null {
  const library = libraryFor(animations);
  return (name) => {
    const resolved = resolveAnimationName(
      name,
      (candidate) => library[candidate] !== undefined
    );
    const clip = library[resolved];
    return clip ? { name: resolved, clip } : null;
  };
}

/*
 * Segunda pasada con los assets reales. El manifiesto de sprites es solo una
 * semilla: el runtime usa las duraciones del GLB y los marcadores del
 * `clips.json` de cada modelo, que pueden diferir mucho. Esta tabla es un
 * espejo de `CLIP_PATTERNS` en `src/game/model.ts`; no se importa porque ese
 * módulo depende de PlayCanvas.
 */
const CLIP_PATTERNS: Readonly<Record<AnimationName, readonly string[]>> = {
  idle: [
    'defaultwait01_loop',
    'battlewait01_loop',
    'ba10_waitA01',
    'ba10_waitB01',
    'kw01_wait01',
    'fi01_wait01',
    'defaultidle01'
  ],
  walk: ['run01_loop', 'fi21_run01', 'walk01_loop', 'fi20_walk01'],
  run: ['run01_loop', 'fi21_run01'],
  attack: ['attack01', 'ba20_buturi01'],
  hurt: ['damage01', 'ba30_damageS01', 'damage02'],
  faint: ['down01_start', 'ba41_down01', 'down01_loop'],
  quickstrike: ['attack02', 'attack01', 'ba20_buturi01'],
  shock: [
    'rangeattack01',
    'ba21_tokusyu01',
    'rangeattack02_loop',
    'ba21_tokusyu02'
  ],
  shoot: ['rangeattack01', 'ba21_tokusyu01', 'rangeattack02_start'],
  charge: [
    'rangeattack02_loop',
    'rangeattack02_start',
    'ba21_tokusyu02',
    'ba21_tokusyu01'
  ],
  strike: ['attack02', 'attack01', 'ba20_buturi01'],
  twirl: ['attack02', 'ba20_buturi01', 'attack01'],
  shake: ['stun01_loop', 'stun01_start', 'ba30_damageS01', 'damage01'],
  punch: ['attack01', 'ba20_buturi01', 'attack02'],
  hop: ['jumpup01_start', 'land02', 'ba01_landA01', 'landA01'],
  stepoutStart: ['stepout01_start'],
  stepout: ['stepout01'],
  stepoutEnd: ['stepout01_end']
};

const clipSuffix = (name: string): string =>
  name.replace(/\.\d{3}$/, '').replace(/^\d{5}_/, '');

const routineRank = (name: string): number =>
  Number((/^(\d{5})_/.exec(name.replace(/\.\d{3}$/, '')) ?? [])[1] ?? 1e9);

interface GlbData {
  // El JSON del glTF tiene forma variable según el exportador.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  bin: DataView;
  binStart: number;
}

function readGlb(file: string): GlbData | null {
  const buffer = readFileSync(file);
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  );
  let json: GlbData['json'] = null;
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
      );
    } else if (type === 0x004e4942) {
      binStart = offset + 8;
    }
    offset += 8 + length;
  }
  return json ? { json, bin: view, binStart } : null;
}

function readAccessor(glb: GlbData, index: number): number[][] {
  const accessor = glb.json.accessors?.[index];
  if (!accessor || accessor.bufferView === undefined) return [];
  const bufferView = glb.json.bufferViews?.[accessor.bufferView];
  if (!bufferView) return [];
  const components =
    { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type as string] ??
    1;
  const size = accessor.componentType === 5126 ? 4 : 2;
  const start =
    glb.binStart + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = bufferView.byteStride ?? components * size;
  const rows: number[][] = [];
  for (let row = 0; row < accessor.count; row++) {
    const values: number[] = [];
    for (let component = 0; component < components; component++) {
      const at = start + row * stride + component * size;
      values.push(
        accessor.componentType === 5126
          ? glb.bin.getFloat32(at, true)
          : glb.bin.getUint16(at, true)
      );
    }
    rows.push(values);
  }
  return rows;
}

const quatAngle = (a: number[], b: number[]): number => {
  const dot = Math.min(
    1,
    Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
  );
  return Number.isFinite(dot) ? 2 * Math.acos(dot) : 0;
};

interface MotionSample {
  time: number;
  energy: number;
}

/**
 * Energía angular por intervalo, igual que en `seed-clip-markers`: suma de los
 * ángulos recorridos por los huesos, ignorando párpados y ojos (un parpadeo no
 * es un golpe).
 */
function motionProfile(
  glb: GlbData,
  animation: { channels: Array<{ target: { node?: number; path: string }; sampler: number }>; samplers: Array<{ input: number; output: number }> },
  duration: number
): MotionSample[] {
  const raw = new Map<number, number>();
  for (const channel of animation.channels) {
    if (channel.target.path !== 'rotation') continue;
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
      const bin = Math.round(time * 30) / 30;
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

function motionBetween(
  profile: readonly MotionSample[],
  from: number,
  to: number
): number {
  let total = 0;
  for (const sample of profile) {
    if (sample.time >= from && sample.time < to) total += sample.energy;
  }
  return total;
}

interface RealModel {
  /** Nombre real del clip elegido para cada animación lógica. */
  clipNames: Partial<Record<AnimationName, string>>;
  /** Marcadores del `clips.json` (vacío si un clip no tiene entrada). */
  markedClips: Set<string>;
  library: ClipLibrary;
  resolver: (name: AnimationName) => ResolvedClip | null;
  /** Perfil de movimiento del clip, calculado bajo demanda. */
  profileFor: (clipName: string) => MotionSample[] | null;
}

function loadRealModel(directory: string): RealModel | null {
  if (!/^pm\d{4}$/.test(path.basename(directory))) return null;
  const glbFile = readdirSync(directory).find((file) =>
    file.toLowerCase().endsWith('.glb')
  );
  if (!glbFile) return null;
  const glb = readGlb(path.join(directory, glbFile));
  if (!glb) return null;

  const animations =
    (glb.json.animations ?? []) as Array<{
      name: string;
      channels: Array<{ target: { node?: number; path: string }; sampler: number }>;
      samplers: Array<{ input: number; output: number }>;
    }>;
  const durations = new Map<string, number>();
  for (const animation of animations) {
    let duration = 0;
    for (const sampler of animation.samplers) {
      const accessor = glb.json.accessors[sampler.input];
      if (accessor.max) duration = Math.max(duration, accessor.max[0]);
    }
    durations.set(animation.name, duration);
  }
  const animationsByName = new Map(
    animations.map((animation) => [animation.name, animation])
  );
  const profiles = new Map<string, MotionSample[]>();
  const profileFor = (clipName: string): MotionSample[] | null => {
    const cached = profiles.get(clipName);
    if (cached) return cached;
    const animation = animationsByName.get(clipName);
    const duration = durations.get(clipName) ?? 0;
    if (!animation || !(duration > 0)) return null;
    const profile = motionProfile(glb, animation, duration);
    profiles.set(clipName, profile);
    return profile;
  };

  const sidecar = path.join(directory, 'clips.json');
  const markers: Record<string, { impact?: number; followThrough?: number }> =
    existsSync(sidecar) ? JSON.parse(readFileSync(sidecar, 'utf8')) : {};

  const library: ClipLibrary = {};
  const clipNames: Partial<Record<AnimationName, string>> = {};
  for (const [animation, patterns] of Object.entries(CLIP_PATTERNS) as Array<
    [AnimationName, readonly string[]]
  >) {
    for (const pattern of patterns) {
      const candidate = [...durations.keys()]
        .filter((name) => clipSuffix(name) === pattern)
        .sort(
          (a, b) =>
            routineRank(a) - routineRank(b) || a.localeCompare(b)
        )[0];
      if (!candidate) continue;
      clipNames[animation] = candidate;
      library[animation] = {
        animation,
        duration: durations.get(candidate) ?? 0,
        loop: /_loop$/.test(candidate),
        markers: normalizeMarkers(markers[candidate]),
        rootMotion: 'ignore'
      } as ClipInfo;
      break;
    }
  }

  return {
    clipNames,
    markedClips: new Set(Object.keys(markers)),
    library,
    profileFor,
    resolver: (name) => {
      const resolved = resolveAnimationName(
        name,
        (candidate) => library[candidate] !== undefined
      );
      const clip = library[resolved];
      return clip ? { name: resolved, clip } : null;
    }
  };
}

interface Issue {
  kind: 'error' | 'warn' | 'info';
  pokemon: string;
  ability: string;
  message: string;
  /** Peso para ordenar avisos informativos (p. ej. segundos perdidos). */
  weight?: number;
}

const issues: Issue[] = [];
const seenIssues = new Set<string>();
let checked = 0;

function report(issue: Issue): void {
  const key = `${issue.kind}|${issue.pokemon}|${issue.ability}|${issue.message}`;
  if (seenIssues.has(key)) return;
  seenIssues.add(key);
  issues.push(issue);
}

function check(
  pokemonId: string,
  abilityId: string,
  animations: Record<string, SpriteAnimation>,
  override?: (typeof ABILITIES)[string]
): void {
  const def = override ?? ABILITIES[abilityId];
  if (!def) {
    report({
      kind: 'error',
      pokemon: pokemonId,
      ability: abilityId,
      message: 'La habilidad no existe en ABILITIES'
    });
    return;
  }
  checkPlan(pokemonId, abilityId, def, resolverFor(animations));
}

function checkPlan(
  pokemonId: string,
  abilityId: string,
  def: NonNullable<(typeof ABILITIES)[string]>,
  resolve: (name: AnimationName) => ResolvedClip | null
): void {
  checked++;
  const plan = buildCastPlan(def, resolve, pokemonId);

  if (Math.abs(plan.effectAt - def.startup) > EPSILON) {
    report({
      kind: 'error',
      pokemon: pokemonId,
      ability: abilityId,
      message: `effectAt ${plan.effectAt.toFixed(3)} != startup ${def.startup.toFixed(3)}`
    });
  }
  const expectedEnd = def.startup + def.active + def.recovery;
  if (Math.abs(plan.endAt - expectedEnd) > EPSILON) {
    report({
      kind: 'error',
      pokemon: pokemonId,
      ability: abilityId,
      message: `endAt ${plan.endAt.toFixed(3)} != total ${expectedEnd.toFixed(3)}`
    });
  }

  const sorted = [...plan.segments].sort((a, b) => a.startAt - b.startAt);
  for (let index = 0; index < sorted.length; index++) {
    const segment = sorted[index];
    if (segment.startAt < -EPSILON || segment.endAt > plan.endAt + EPSILON) {
      report({
        kind: 'error',
        pokemon: pokemonId,
        ability: abilityId,
        message: `segmento fuera del casteo [${segment.startAt.toFixed(3)}, ${segment.endAt.toFixed(3)}]`
      });
    }
    if (segment.endAt < segment.startAt - EPSILON) {
      report({
        kind: 'error',
        pokemon: pokemonId,
        ability: abilityId,
        message: 'segmento con fin anterior al inicio'
      });
    }
    if (!segment.loop) {
      if (
        segment.speed < MIN_PLAYBACK - EPSILON ||
        segment.speed > MAX_PLAYBACK + EPSILON
      ) {
        report({
          kind: 'error',
          pokemon: pokemonId,
          ability: abilityId,
          message: `${segment.animation} speed ${segment.speed.toFixed(2)} fuera de rango`
        });
      }
    }
    if (
      segment.clipStart < -EPSILON ||
      segment.clipEnd < segment.clipStart - EPSILON
    ) {
      report({
        kind: 'error',
        pokemon: pokemonId,
        ability: abilityId,
        message: `${segment.animation} tramo de clip inválido [${segment.clipStart.toFixed(3)}, ${segment.clipEnd.toFixed(3)}]`
      });
    }
    if (index > 0) {
      const previous = sorted[index - 1];
      if (segment.startAt < previous.endAt - EPSILON) {
        report({
          kind: 'error',
          pokemon: pokemonId,
          ability: abilityId,
          message: `segmentos solapados ${previous.animation} y ${segment.animation}`
        });
      }
    }
  }

  // El dash recorre el clip completo durante la ventana activa: no tiene un
  // instante de golpe único que anclar al marcador de impacto.
  if (def.shape !== 'dash' && plan.impactClip !== null) {
    const segment = segmentAt(plan, plan.effectAt);
    const expected = plan.impactTime;
    const visible = segment ? clipTimeAt(segment, plan.effectAt) : null;
    const matches =
      expected !== null &&
      visible !== null &&
      Math.abs(visible - expected) <= 1e-4;
    // Sin ventana activa, el segmento que empieza en el efecto ya es el de
    // recuperación; el runtime muestra el impacto con el hit-stop. Basta con
    // que un segmento acabe en el efecto en el tiempo de impacto.
    const endsAtImpact =
      expected !== null &&
      plan.segments.some(
        (candidate) =>
          Math.abs(candidate.endAt - plan.effectAt) <= 1e-4 &&
          candidate.clipEnd >= expected - 1e-4 &&
          candidate.clipStart <= expected + 1e-4
      );
    if (!matches && !endsAtImpact) {
      report({
        kind: 'error',
        pokemon: pokemonId,
        ability: abilityId,
        message:
          visible === null
            ? 'el efecto cae en un hueco sin clip'
            : `en el efecto se ve ${segment!.animation}@${visible.toFixed(3)}s, se esperaba ${plan.impactClip}@${(expected ?? 0).toFixed(3)}s`
      });
    }
  }

  const script = animationScriptFor(def, pokemonId);

  // Aviso si una carga `fill` no llega a mostrarse.
  if (def.startup > EPSILON) {
    for (const step of script) {
      if (!step.fill) continue;
      const charge = resolve(step.clip);
      if (!charge) continue;
      const shown = plan.segments.some(
        (segment) =>
          segment.animation === charge.name && segment.startAt < plan.effectAt
      );
      if (!shown) {
        report({
          kind: 'warn',
          pokemon: pokemonId,
          ability: abilityId,
          message: `carga ${step.clip} omitida (no hay hueco antes del impacto)`
        });
      }
    }
  }

  // Aviso si no hay anticipación visible.
  for (const step of script) {
    if (step.fit !== 'alignImpact') continue;
    const release = resolve(step.clip);
    if (!release) continue;
    const hasLead = plan.segments.some(
      (segment) =>
        segment.animation === release.name &&
        segment.endAt <= plan.effectAt + EPSILON &&
        !segment.loop
    );
    if (!hasLead && def.startup > 0) {
      report({
        kind: 'warn',
        pokemon: pokemonId,
        ability: abilityId,
        message: `sin anticipación visible para ${step.clip}`
      });
    }
  }
}

const usersByAbility = new Map<string, string[]>();
for (const [pokemonId, moveset] of Object.entries(MOVESETS)) {
  for (const abilityId of moveset) {
    if (!abilityId) continue;
    const list = usersByAbility.get(abilityId) ?? [];
    list.push(pokemonId);
    usersByAbility.set(abilityId, list);
  }
}

for (const [abilityId, users] of usersByAbility) {
  for (const pokemonId of users) {
    const entry = byId.get(pokemonId);
    if (!entry) continue;
    check(pokemonId, abilityId, entry.animations);
  }
}

// Instintos comunes: se validan contra todos los Pokémon.
for (const abilityId of ['impulso', 'proteccion'] as const) {
  const def = ABILITIES[abilityId];
  if (!def) continue;
  for (const entry of manifest.pokemon) {
    check(entry.id, abilityId, entry.animations, def);
  }
}

/*
 * Pasada con los assets reales: GLB + `clips.json` de cada modelo. Es la que
 * refleja lo que se ve en el juego; la anterior solo comprueba la semilla de
 * sprites.
 */
const realModels = new Map<string, RealModel>();
if (existsSync(MODEL_DIR)) {
  for (const name of readdirSync(MODEL_DIR)) {
    const directory = path.join(MODEL_DIR, name);
    if (!statSync(directory).isDirectory()) continue;
    const species = /^pm(\d{4})$/.exec(name)?.[1];
    if (!species) continue;
    const model = loadRealModel(directory);
    if (model) realModels.set(species, model);
  }
}

const checkedBeforeReal = checked;
for (const [pokemonId, moveset] of Object.entries(MOVESETS)) {
  const model = realModels.get(pokemonId);
  if (!model) continue;
  for (const abilityId of moveset) {
    if (!abilityId) continue;
    const def = ABILITIES[abilityId];
    if (!def) {
      report({
        kind: 'error',
        pokemon: pokemonId,
        ability: abilityId,
        message: 'La habilidad no existe en ABILITIES'
      });
      continue;
    }
    checkPlan(pokemonId, abilityId, def, model.resolver);

    const impact = buildCastPlan(def, model.resolver, pokemonId);
    if (
      impact.impactClip === null ||
      impact.impactTime === null ||
      def.shape === 'dash'
    ) {
      continue;
    }
    const script = animationScriptFor(def, pokemonId);
    if (!script.some((step) => step.fit === 'alignImpact')) continue;

    // Aviso si el clip no tiene marcadores propios: se usan 0.5 / 1.0.
    const realClip = model.clipNames[impact.impactClip];
    if (realClip && !model.markedClips.has(realClip)) {
      report({
        kind: 'warn',
        pokemon: pokemonId,
        ability: abilityId,
        message: `clip ${realClip} sin marcadores en clips.json (se usan 0.5 / 1.0)`
      });
    }

    // Anticipo visible antes del impacto: cuánto clip se ve de verdad.
    const lead = [...impact.segments]
      .filter((segment) => segment.endAt <= impact.effectAt + EPSILON)
      .sort((a, b) => b.endAt - a.endAt)[0];
    const shown = lead
      ? Math.max(0, impact.impactTime - lead.clipStart)
      : 0;
    const lost = Math.max(0, impact.impactTime - shown);

    // No todo el tiempo saltado importa: una intro en reposo no es una pérdida
    // visible. Se mide la energía angular del tramo descartado respecto al
    // anticipo total del clip.
    const profile = model.profileFor(realClip ?? '');
    let lostMotion = 1;
    let idleLead = false;
    if (profile) {
      const leadMotion = motionBetween(profile, 0, impact.impactTime);
      const skippedMotion = lead
        ? motionBetween(profile, 0, lead.clipStart)
        : leadMotion;
      lostMotion = leadMotion > 0 ? skippedMotion / leadMotion : 0;

      // Si el tramo descartado tiene mucha menos densidad de movimiento que el
      // que sí se ve, es intro en reposo (respiración, espera) y no una
      // pérdida real.
      if (lead) {
        const shownMotion = motionBetween(
          profile,
          lead.clipStart,
          impact.impactTime
        );
        const shownSeconds = Math.max(
          1e-6,
          impact.impactTime - lead.clipStart
        );
        const skippedSeconds = Math.max(1e-6, lead.clipStart);
        const shownDensity = shownMotion / shownSeconds;
        const skippedDensity = skippedMotion / skippedSeconds;
        idleLead =
          shownDensity > 0 &&
          skippedDensity < shownDensity * IDLE_DENSITY_RATIO;
      }
    }

    if (lost > MIN_LOST_SECONDS && lostMotion > MIN_LOST_MOTION && !idleLead) {
      const clipLabel = realClip ?? impact.impactClip;
      report({
        kind: 'info',
        pokemon: pokemonId,
        ability: abilityId,
        weight: lost * lostMotion,
        message:
          `${clipLabel}: anticipo ${shown.toFixed(2)} de ` +
          `${impact.impactTime.toFixed(2)} s · se pierden ${lost.toFixed(2)} s ` +
          `(${Math.round(lostMotion * 100)} % del movimiento; startup ` +
          `${def.startup.toFixed(2)} s, mínimo ` +
          `${(impact.impactTime / MAX_PLAYBACK).toFixed(2)} s)`
      });
    }
  }
}
const checkedReal = checked - checkedBeforeReal;

const errors = issues.filter((issue) => issue.kind === 'error');
const warnings = issues.filter((issue) => issue.kind === 'warn');
const infos = issues
  .filter((issue) => issue.kind === 'info')
  .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

console.log(
  `Habilidades x especie comprobadas: ${checkedBeforeReal} con sprites · ` +
    `${checkedReal} con GLB real (${realModels.size} modelos)`
);

if (warnings.length > 0) {
  console.log(`\nAvisos: ${warnings.length}`);
  for (const warning of warnings.slice(0, 20)) {
    console.log(`  [warn] ${warning.ability} @ ${warning.pokemon}: ${warning.message}`);
  }
  if (warnings.length > 20) console.log(`  ... ${warnings.length - 20} más`);
}

if (infos.length > 0) {
  console.log(
    `\nAnticipo con movimiento perdido (> 0.15 s y > 20 %): ${infos.length}`
  );
  const limit = VERBOSE ? infos.length : 15;
  for (const info of infos.slice(0, limit)) {
    console.log(`  [recorte] ${info.ability} @ ${info.pokemon}: ${info.message}`);
  }
  if (infos.length > limit) {
    console.log(`  ... ${infos.length - limit} más (usa --verbose para verlas)`);
  }
}

if (errors.length > 0) {
  console.log(`\nErrores: ${errors.length}`);
  for (const error of errors.slice(0, 40)) {
    console.log(`  [error] ${error.ability} @ ${error.pokemon}: ${error.message}`);
  }
  if (errors.length > 40) console.log(`  ... ${errors.length - 40} más`);
  process.exitCode = 1;
} else {
  console.log('\nOK: todos los planes cuadran.');
}
