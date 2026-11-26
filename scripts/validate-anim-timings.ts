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
 * La biblioteca de clips se deriva del manifiesto de sprites (duración y
 * marcadores). Es una semilla de migración: el runtime real usa los marcadores
 * del `clips.json` de cada modelo, que parten de estos valores.
 */
import { readFileSync } from 'node:fs';
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
import type { ClipLibrary, ResolvedClip } from '../src/game/core/clipLibrary.ts';
import type { AnimationName, SpriteAnimation } from '../src/game/types.ts';

interface ManifestPokemon {
  id: string;
  animations: Record<string, SpriteAnimation>;
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
  checked++;
  const resolve = resolverFor(animations);
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

const errors = issues.filter((issue) => issue.kind === 'error');
const warnings = issues.filter((issue) => issue.kind === 'warn');

console.log(`Habilidades x especie comprobadas: ${checked}`);

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
