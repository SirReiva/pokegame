#!/usr/bin/env node
/**
 * Valida los planes de casteo de todas las habilidades del roster contra los
 * marcadores reales de los sprites.
 *
 * Uso:
 *   node scripts/validate-anim-timings.ts
 *
 * Comprueba:
 * - El efecto cae exactamente en `startup`.
 * - El frame visible en ese instante es el `HitFrame` del clip resuelto.
 * - El playback queda dentro de [MIN_PLAYBACK, MAX_PLAYBACK].
 * - Los segmentos no se solapan ni se salen del casteo.
 * - `hitFrame <= returnFrame < frames`.
 *
 * Sale con código 1 si hay errores duros.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { ABILITIES, MOVESETS, commonAnimationFor } from '../src/game/abilities.ts';
import {
  segmentAt,
  buildCastPlan,
  frameForSegment
} from '../src/game/castPlan.ts';
import {
  MAX_PLAYBACK,
  MIN_PLAYBACK,
  clipTiming,
  resolveAnimationName
} from '../src/game/animationTimeline.ts';
import type { ResolvedAnimation, SpriteAnimation } from '../src/game/types.ts';

interface ManifestAnimation extends SpriteAnimation {
  sheet: string;
}
interface ManifestSkin {
  id: string;
  animations: Record<string, ManifestAnimation>;
}
interface ManifestPokemon {
  id: string;
  animations: Record<string, ManifestAnimation>;
  skins: ManifestSkin[];
}
interface Manifest {
  pokemon: ManifestPokemon[];
}

const EPSILON = 1e-5;
const ROOT = process.cwd();
const manifest: Manifest = JSON.parse(
  readFileSync(path.join(ROOT, 'public', 'sprites', 'manifest.json'), 'utf8')
);

const byId = new Map(manifest.pokemon.map((entry) => [entry.id, entry]));

function resolverFor(
  animations: Record<string, ManifestAnimation>
): (name: Parameters<typeof resolveAnimationName>[0]) => ResolvedAnimation | null {
  return (name) => {
    const resolved = resolveAnimationName(
      name,
      (candidate) => animations[candidate] !== undefined
    );
    const animation = animations[resolved];
    return animation ? { name: resolved, animation } : null;
  };
}

function frameAtEffect(
  plan: ReturnType<typeof buildCastPlan>,
  resolve: (name: Parameters<typeof resolveAnimationName>[0]) => ResolvedAnimation | null
): number | null {
  const segment = segmentAt(plan, plan.effectAt);
  if (segment) {
    const clip = resolve(segment.animation);
    if (!clip) return null;
    return frameForSegment(segment, clip.animation, plan.effectAt);
  }
  // Sin segmento que empiece en el efecto: usa el último que termina ahí.
  const ending = plan.segments
    .filter((candidate) => Math.abs(candidate.endAt - plan.effectAt) < EPSILON)
    .at(-1);
  return ending ? ending.endFrame : null;
}

interface Issue {
  kind: 'error' | 'warn';
  pokemon: string;
  ability: string;
  message: string;
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
const playbackByAbility = new Map<string, { min: number; max: number }>();
const trimmed = new Set<string>();

function check(
  pokemonId: string,
  abilityId: string,
  animations: Record<string, ManifestAnimation>,
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
  checked++;
  const resolve = resolverFor(animations);
  const plan = buildCastPlan(def, resolve);

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
        segment.playback < MIN_PLAYBACK - EPSILON ||
        segment.playback > MAX_PLAYBACK + EPSILON
      ) {
        report({
          kind: 'error',
          pokemon: pokemonId,
          ability: abilityId,
          message: `${segment.animation} playback ${segment.playback.toFixed(2)} fuera de rango`
        });
      }
      const stats = playbackByAbility.get(`${abilityId}:${segment.animation}`) ?? {
        min: Infinity,
        max: -Infinity
      };
      stats.min = Math.min(stats.min, segment.playback);
      stats.max = Math.max(stats.max, segment.playback);
      playbackByAbility.set(`${abilityId}:${segment.animation}`, stats);
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
    if (segment.startAt === 0 && segment.startFrame > 0) {
      trimmed.add(`${abilityId}:${segment.animation}`);
    }
  }

  // El dash recorre el clip completo durante la ventana activa: no tiene un
  // instante de golpe único que anclar al HitFrame.
  if (def.shape !== 'dash' && plan.hitClip !== null && plan.hitFrame !== null) {
    const clip = resolve(plan.hitClip);
    if (!clip) {
      report({
        kind: 'error',
        pokemon: pokemonId,
        ability: abilityId,
        message: `no se pudo resolver el clip ${plan.hitClip}`
      });
    } else {
      const timing = clipTiming(clip.animation);
      if (timing.hitFrame > timing.returnFrame) {
        report({
          kind: 'error',
          pokemon: pokemonId,
          ability: abilityId,
          message: `HitFrame ${timing.hitFrame} > ReturnFrame ${timing.returnFrame}`
        });
      }
      if (timing.returnFrame >= clip.animation.durations.length) {
        report({
          kind: 'error',
          pokemon: pokemonId,
          ability: abilityId,
          message: 'ReturnFrame fuera del clip'
        });
      }
      const visible = frameAtEffect(plan, resolve);
      if (visible === null) {
        report({
          kind: 'error',
          pokemon: pokemonId,
          ability: abilityId,
          message: 'el efecto cae en un hueco sin frame'
        });
      } else if (Math.abs(visible - plan.hitFrame) > 1) {
        report({
          kind: 'error',
          pokemon: pokemonId,
          ability: abilityId,
          message: `en el efecto se ve el frame ${visible}, se esperaba ${plan.hitFrame} (${plan.hitClip})`
        });
      }
    }
  }

  // Aviso si hay una carga propia que el plan no llega a mostrar.
  if (def.startupAnimation && def.startup > EPSILON) {
    const charge = resolve(def.startupAnimation);
    const shown =
      charge !== null &&
      plan.segments.some(
        (segment) =>
          segment.animation === charge.name && segment.startAt < plan.effectAt
      );
    if (charge && !shown) {
      report({
        kind: 'warn',
        pokemon: pokemonId,
        ability: abilityId,
        message: `carga ${def.startupAnimation} omitida (no hay hueco antes del HitFrame)`
      });
    }
  }

  // Aviso si el clip necesita recortar anticipación.
  if (def.animation) {
    const release = resolve(def.animation);
    if (release) {
      const timing = clipTiming(release.animation);
      const lead = plan.segments.find(
        (segment) =>
          segment.animation === release.name &&
          segment.endAt <= plan.effectAt + EPSILON &&
          segment.startFrame < timing.hitFrame
      );
      if (!lead && def.startup > 0 && timing.hitAt > 0) {
        report({
          kind: 'warn',
          pokemon: pokemonId,
          ability: abilityId,
          message: `sin anticipación visible (startup ${def.startup.toFixed(2)}s < hit ${timing.hitAt.toFixed(2)}s)`
        });
      }
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
    for (const skin of entry.skins) check(pokemonId, abilityId, skin.animations);
  }
}

// Instintos comunes: se validan contra todos los Pokémon con su override.
for (const abilityId of ['impulso', 'proteccion'] as const) {
  const base = ABILITIES[abilityId];
  if (!base) continue;
  for (const entry of manifest.pokemon) {
    const def = {
      ...base,
      animation: commonAnimationFor(
        entry.id,
        abilityId as 'impulso' | 'proteccion',
        base
      )
    };
    check(entry.id, abilityId, entry.animations, def);
  }
}

const errors = issues.filter((issue) => issue.kind === 'error');
const warnings = issues.filter((issue) => issue.kind === 'warn');

console.log(`Habilidades x especie comprobadas: ${checked}`);
if (trimmed.size > 0) {
  console.log(`Clips con anticipación recortada: ${[...trimmed].sort().join(', ')}`);
}

const playbacks = [...playbackByAbility.entries()]
  .filter(([, stats]) => Number.isFinite(stats.min))
  .sort((a, b) => a[0].localeCompare(b[0]))
  .slice(0, 12);
if (playbacks.length > 0) {
  console.log('\nRango de playback por habilidad/clip (primeros 12):');
  for (const [key, stats] of playbacks) {
    console.log(
      `  ${key.padEnd(38)} ${stats.min.toFixed(2)}x .. ${stats.max.toFixed(2)}x`
    );
  }
}

if (warnings.length > 0) {
  console.log(`\nAvisos: ${warnings.length}`);
  for (const warning of warnings.slice(0, 20)) {
    console.log(`  [warn] ${warning.ability} @ ${warning.pokemon}: ${warning.message}`);
  }
  if (warnings.length > 20) console.log(`  ... ${warnings.length - 20} más`);
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
