import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ABILITIES } from '../abilities.ts';
import { resolveAnimationName } from '../animationTimeline.ts';
import { buildCastPlan } from '../castPlan.ts';
import type { AbilityDef } from '../core/abilities/def.ts';
import type { CastSegment, ClipResolver } from '../core/castPlan.ts';
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

/** Habilidades con un script a medida (o sin animación) y su clip clásico. */
const EXPLICIT: ReadonlyArray<{ id: string; clip?: AnimationName }> = [
  { id: 'chispazo', clip: 'attack' },
  { id: 'impactrueno', clip: 'shock' },
  { id: 'ataqueRapido', clip: 'quickstrike' },
  { id: 'rayo', clip: 'shock' },
  { id: 'placaje', clip: 'attack' },
  { id: 'proteccion' },
  { id: 'premonicion' },
  { id: 'giroFuego' }
];

/**
 * Todas las habilidades con `presentation`. El clip clásico es `animation` o,
 * cuando el builder usaba la carga como lanzamiento, `startupAnimation`.
 */
const AUTO: ReadonlyArray<{ id: string; clip: AnimationName }> = Object.entries(
  ABILITIES
).flatMap(([id, def]) => {
  if (!def.presentation) return [];
  const clip = def.animation ?? def.startupAnimation;
  return clip ? [{ id, clip }] : [];
});

const MIGRATED: ReadonlyArray<{ id: string; clip?: AnimationName }> = [
  ...new Map(
    [...EXPLICIT, ...AUTO].map((entry) => [entry.id, entry])
  ).values()
];

function resolverFor(
  animations: Record<string, SpriteAnimation>
): ClipResolver {
  return (name) => {
    const resolved = resolveAnimationName(
      name,
      (candidate) => !!animations[candidate]
    );
    const animation = animations[resolved];
    return animation ? { name: resolved, animation } : null;
  };
}

function assertSameNumber(actual: number, expected: number, label: string): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `${label}: ${actual} != ${expected}`
  );
}

function assertSameSegment(
  actual: CastSegment,
  expected: CastSegment,
  label: string
): void {
  assert.equal(actual.animation, expected.animation, `${label}.animation`);
  assert.equal(actual.startFrame, expected.startFrame, `${label}.startFrame`);
  assert.equal(actual.endFrame, expected.endFrame, `${label}.endFrame`);
  assert.equal(actual.loop, expected.loop, `${label}.loop`);
  assertSameNumber(actual.startAt, expected.startAt, `${label}.startAt`);
  assertSameNumber(actual.endAt, expected.endAt, `${label}.endAt`);
  assertSameNumber(actual.clipStartAt, expected.clipStartAt, `${label}.clipStartAt`);
  assertSameNumber(actual.playback, expected.playback, `${label}.playback`);
}

test('las habilidades migradas compilan igual que el builder clásico', () => {
  assert.equal(
    MIGRATED.length,
    Object.keys(ABILITIES).length,
    'faltan habilidades por cubrir en el test de migración'
  );
  for (const { id, clip } of MIGRATED) {
    const def = ABILITIES[id] as AbilityDef | undefined;
    assert.ok(def, `Falta la habilidad ${id}`);

    for (const pokemon of MANIFEST.pokemon) {
      const resolve = resolverFor(pokemon.animations);
      const legacy: AbilityDef = {
        ...def,
        presentation: null,
        presentationBySpecies: null,
        ...(clip ? { animation: clip } : {})
      };
      const scripted = buildCastPlan(def, resolve, pokemon.id);
      const classic = buildCastPlan(legacy, resolve);
      const label = `${id} / ${pokemon.id}`;

      assert.equal(
        scripted.segments.length,
        classic.segments.length,
        `${label}: número de segmentos`
      );
      for (let index = 0; index < classic.segments.length; index++) {
        assertSameSegment(
          scripted.segments[index],
          classic.segments[index],
          `${label} #${index}`
        );
      }
      assertSameNumber(scripted.effectAt, classic.effectAt, `${label}.effectAt`);
      assertSameNumber(
        scripted.activeEnd,
        classic.activeEnd,
        `${label}.activeEnd`
      );
      assertSameNumber(scripted.endAt, classic.endAt, `${label}.endAt`);
      assertSameNumber(
        scripted.animationEndAt,
        classic.animationEndAt,
        `${label}.animationEndAt`
      );
      assert.equal(scripted.hitClip, classic.hitClip, `${label}.hitClip`);
      if (classic.hitFrame === null) {
        assert.equal(scripted.hitFrame, null, `${label}.hitFrame`);
      } else {
        assertSameNumber(
          scripted.hitFrame ?? Number.NaN,
          classic.hitFrame,
          `${label}.hitFrame`
        );
      }
    }
  }
});
