import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  angleDelta,
  closestPointOnSegment,
  decorateDamage,
  pointSegmentDistance,
  sectorOverlapsCircle
} from '../../combat.ts';

test('decorateDamage aplica crítico, aleatorio, STAB y efectividad en orden', () => {
  assert.equal(
    decorateDamage(100, {
      critical: false,
      randomFactor: 1,
      stab: false,
      effectiveness: 1
    }),
    100
  );
  assert.equal(
    decorateDamage(100, {
      critical: true,
      randomFactor: 1,
      stab: false,
      effectiveness: 1
    }),
    105
  );
  assert.equal(
    decorateDamage(100, {
      critical: false,
      randomFactor: 1,
      stab: true,
      effectiveness: 2
    }),
    210
  );
  assert.equal(
    decorateDamage(101, {
      critical: false,
      randomFactor: 0.5,
      stab: false,
      effectiveness: 1
    }),
    50
  );
});

test('angleDelta se normaliza a [-π, π]', () => {
  assert.ok(Math.abs(angleDelta(0, 0)) < 1e-12);
  assert.ok(Math.abs(angleDelta(Math.PI * 2, 0)) < 1e-12);
  assert.ok(Math.abs(Math.abs(angleDelta(0, Math.PI)) - Math.PI) < 1e-12);
});

test('sectorOverlapsCircle cubre delante, bordes y cuerpo en el vértice', () => {
  const half = Math.PI / 4;
  assert.equal(sectorOverlapsCircle(0, 0, 0, half, 5, 0, 2, 0.5), true);
  assert.equal(sectorOverlapsCircle(0, 0, 0, half, 5, 0, -2, 0.5), false);
  assert.equal(sectorOverlapsCircle(0, 0, 0, half, 5, 0, 6, 0.5), false);
  // El cuerpo del objetivo toca el vértice aunque esté detrás.
  assert.equal(sectorOverlapsCircle(0, 0, 0, half, 5, 0, -0.3, 0.5), true);
  // Un objetivo al borde del alcance entra por su hurtbox.
  assert.equal(sectorOverlapsCircle(0, 0, 0, half, 5, 0, 5.4, 0.5), true);
});

test('closestPointOnSegment y pointSegmentDistance son coherentes', () => {
  assert.deepEqual(closestPointOnSegment(2, 2, 0, 0, 4, 0), { x: 2, z: 0 });
  assert.deepEqual(closestPointOnSegment(-2, 2, 0, 0, 4, 0), { x: 0, z: 0 });
  assert.deepEqual(closestPointOnSegment(6, 2, 0, 0, 4, 0), { x: 4, z: 0 });
  assert.equal(pointSegmentDistance(2, 2, 0, 0, 4, 0), 2);
  assert.equal(pointSegmentDistance(2, 0, 0, 0, 4, 0), 0);
});
