import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBotHazards } from '../hazards.ts';
import { maxHitRadius } from '../../roster.ts';
import type { SlowSpec } from '../../abilities.ts';
import type { ActiveAoe, Projectile } from '../../matchState.ts';

const projectile = (power: number, slow: SlowSpec | null = null) =>
  ({
    x: 3,
    z: 4,
    vx: 6,
    vz: 8,
    traveled: 2,
    owner: { team: 'red' },
    def: { power, slow, range: 12, radius: 0.4 }
  }) as unknown as Projectile;

const aoe = (power: number, slow: SlowSpec | null = null) =>
  ({
    x: 1,
    z: 2,
    radius: 3,
    elapsed: 1,
    duration: 4,
    shape: 'circle',
    dirX: 0,
    dirZ: 1,
    halfAngle: 0,
    owner: { team: 'blue' },
    def: { power, slow }
  }) as unknown as ActiveAoe;

test('buildBotHazards ignora efectos sin daño ni ralentización', () => {
  assert.deepEqual(buildBotHazards([projectile(0)], [aoe(0)]), []);
});

test('buildBotHazards calcula vida restante y radio del área', () => {
  const [proj, area] = buildBotHazards(
    [projectile(40)],
    [aoe(0, { multiplier: 0.5, duration: 2 })]
  );

  assert.equal(proj.kind, 'projectile');
  assert.equal(proj.ownerTeam, 'red');
  assert.equal(proj.radius, 0.4);
  // 10 unidades restantes a 10 u/s = 1 s.
  assert.equal(proj.remaining, 1);

  assert.equal(area.kind, 'aoe');
  assert.equal(area.ownerTeam, 'blue');
  assert.equal(area.radius, 3 + maxHitRadius());
  assert.equal(area.remaining, 3);
});
