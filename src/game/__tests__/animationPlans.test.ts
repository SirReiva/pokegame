import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { ABILITIES } from '../abilities.ts';
import { resolveAnimationName } from '../animationTimeline.ts';
import { buildCastPlan } from '../castPlan.ts';
import type { AbilityDef } from '../core/abilities/def.ts';
import type { CastSegment, ClipResolver } from '../core/castPlan.ts';
import type { SpriteAnimation } from '../core/types.ts';

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
 * Cubre todas las habilidades contra todas las especies del manifiesto. Si un
 * script o el compilador cambia, el hash cambia: revisa el diff de los planes
 * y actualiza la constante a propósito.
 */
const EXPECTED_HASH =
  '9a4410deb25ddf9934012a255ad5955a34204c6539d275bb23399bcff28e99b0';

function resolverFor(
  animations: Record<string, SpriteAnimation>
): ClipResolver {
  // El runtime añade un alias `run` sobre `walk` (ver loadActorAsset); el
  // snapshot debe ver el mismo repertorio para no divergir de la partida.
  const withRun: Record<string, SpriteAnimation> = animations.run
    ? animations
    : { ...animations, run: animations.walk };
  return (name) => {
    const resolved = resolveAnimationName(
      name,
      (candidate) => !!withRun[candidate]
    );
    const animation = withRun[resolved];
    return animation ? { name: resolved, animation } : null;
  };
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function segmentSnapshot(segment: CastSegment): Record<string, unknown> {
  return {
    animation: segment.animation,
    startFrame: segment.startFrame,
    endFrame: segment.endFrame,
    startAt: round(segment.startAt),
    endAt: round(segment.endAt),
    playback: round(segment.playback),
    clipStartAt: round(segment.clipStartAt),
    loop: segment.loop
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
        hitFrame: plan.hitFrame,
        hitClip: plan.hitClip,
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
