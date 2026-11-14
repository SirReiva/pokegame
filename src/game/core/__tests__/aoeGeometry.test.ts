import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aoeContains, aoeDistance, type AoeArea } from '../../aoeGeometry.ts';

const circle: AoeArea = {
  shape: 'circle',
  x: 0,
  z: 0,
  radius: 5,
  dirX: 0,
  dirZ: 1,
  halfAngle: 0
};

const cone: AoeArea = {
  shape: 'cone',
  x: 0,
  z: 0,
  radius: 5,
  dirX: 0,
  dirZ: 1,
  halfAngle: Math.PI / 4
};

test('aoeContains resuelve círculos con hurtbox', () => {
  assert.equal(aoeContains(circle, 3, 0, 0), true);
  assert.equal(aoeContains(circle, 6, 0, 0), false);
  assert.equal(aoeContains(circle, 5.4, 0, 0.5), true);
  assert.equal(aoeContains(circle, 0, 4.9, 0.05), true);
});

test('aoeContains respeta la apertura del cono', () => {
  assert.equal(aoeContains(cone, 0, 3, 0), true);
  assert.equal(aoeContains(cone, 0, -3, 0), false);
  assert.equal(aoeContains(cone, 3, 3, 0), true);
  assert.equal(aoeContains(cone, 4, 3, 0), false);
  // El radio del objetivo puede entrar por el borde angular.
  assert.equal(aoeContains(cone, 3.8, 3.2, 0.6), true);
});

test('aoeDistance mide desde el centro o vértice', () => {
  assert.equal(aoeDistance(circle, 3, 4), 5);
  assert.equal(aoeDistance(cone, -3, 4), 5);
});
