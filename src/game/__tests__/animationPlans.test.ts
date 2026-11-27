import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { ABILITIES } from '../abilities.ts';
import {
  clipDuration,
  clipTiming,
  frameBoundary,
  frameStart,
  resolveAnimationName
} from '../animationTimeline.ts';
import { buildCastPlan } from '../castPlan.ts';
import type { AbilityDef } from '../core/abilities/def.ts';
import type { CastSegment, ClipResolver } from '../core/castPlan.ts';
import type { ClipLibrary } from '../core/clipLibrary.ts';
import type { AnimationName, SpriteAnimation } from '../core/types.ts';

interface ManifestPokemon {
  id: string;
  animations: Record<string, SpriteAnimation>;
}

const MANIFEST = JSON.parse(
  readFileSync(
    new URL('../../../public/sprites/manifest.json', import.meta.url),
    'utf8'
  )
) as { pokemon: ManifestPokemon[] };

/**
 * Golden master de los planes de animación.
 *
 * Usa una biblioteca de clips derivada del manifiesto (duración y marcadores)
 * para no depender de cargar GLB en los tests. Si un script o el compilador
 * cambia, el hash cambia: revisa el diff de los planes y actualízalo a
 * propósito.
 */
const EXPECTED_HASH =
  'bb3f05d41d421dfaf15d3bf98b2c2e538d86712eab49c43da070e062a9af1c09';

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
  // El runtime añade un alias `run` sobre `walk` (ver loadActorAsset).
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
): ClipResolver {
  const library = libraryFor(animations);
  return (name) => {
    const resolved = resolveAnimationName(
      name,
      (candidate) => !!library[candidate]
    );
    const clip = library[resolved];
    return clip ? { name: resolved, clip } : null;
  };
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function segmentSnapshot(segment: CastSegment): Record<string, unknown> {
  return {
    animation: segment.animation,
    clipStart: round(segment.clipStart),
    clipEnd: round(segment.clipEnd),
    startAt: round(segment.startAt),
    endAt: round(segment.endAt),
    speed: round(segment.speed),
    loop: segment.loop,
    blendIn: round(segment.blendIn),
    blendOut: round(segment.blendOut)
  };
}

function planHash(): string {
  const pokemon = [...MANIFEST.pokemon].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  const abilities = Object.entries(ABILITIES).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const snapshot = abilities.map(([id, def]) => ({
    id,
    // El tipo se estrecha al leer `presentation`, pero el objeto real es un
    // `AbilityDef` completo.
    plans: pokemon.map((entry) => {
      const plan = buildCastPlan(
        def as AbilityDef,
        resolverFor(entry.animations),
        entry.id
      );
      return {
        species: entry.id,
        effectAt: round(plan.effectAt),
        activeEnd: round(plan.activeEnd),
        endAt: round(plan.endAt),
        animationEndAt: round(plan.animationEndAt),
        impactClip: plan.impactClip,
        impactTime:
          plan.impactTime === null ? null : round(plan.impactTime),
        segments: plan.segments.map(segmentSnapshot)
      };
    })
  }));
  return createHash('sha256')
    .update(JSON.stringify(snapshot))
    .digest('hex');
}

test('los planes de animación no cambian sin querer', () => {
  assert.equal(planHash(), EXPECTED_HASH);
});
