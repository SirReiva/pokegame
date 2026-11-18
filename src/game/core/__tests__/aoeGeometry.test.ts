import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AoeAbilityDef } from '../../abilities.ts';
import {
  aoeAreaFrom,
  aoeCirclesFrom,
  aoeContains,
  aoeDistance,
  aoeRadialFalloff,
  type AoeArea
} from '../../aoeGeometry.ts';

const circle: AoeArea = {
  shape: 'circle',
  x: 0,
  z: 0,
  radius: 5,
  dirX: 0,
  dirZ: 1,
  halfAngle: 0,
  circles: [{ x: 0, z: 0, radius: 5 }]
};

const cone: AoeArea = {
  shape: 'cone',
  x: 0,
  z: 0,
  radius: 5,
  dirX: 0,
  dirZ: 1,
  halfAngle: Math.PI / 4,
  circles: []
};

/** Dos discos separados: la unión deja un hueco en el centro. */
const pair: AoeArea = {
  shape: 'circle',
  x: 0,
  z: 0,
  radius: 1,
  dirX: 0,
  dirZ: 1,
  halfAngle: 0,
  circles: [
    { x: -3, z: 0, radius: 1 },
    { x: 3, z: 0, radius: 1 }
  ]
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

test('aoeContains golpea cualquiera de los círculos del patrón', () => {
  assert.equal(aoeContains(pair, -3, 0, 0), true);
  assert.equal(aoeContains(pair, 3, 0, 0), true);
  // El hueco entre ambos discos no golpea a un objetivo pequeño.
  assert.equal(aoeContains(pair, 0, 0, 0), false);
  // Un hurtbox ancho sí toca ambos discos desde el hueco.
  assert.equal(aoeContains(pair, 0, 0, 2), true);
});

test('aoeDistance y el daño radial usan el círculo más cercano', () => {
  assert.equal(aoeDistance(pair, -3, 4), 4);
  assert.equal(aoeDistance(pair, 0, 4), 5);
  assert.equal(aoeRadialFalloff(pair, -3, 0), 0);
  assert.ok(Math.abs(aoeRadialFalloff(pair, -3, 1) - 1) < 1e-9);
});

test('aoeCirclesFrom rota los desplazamientos con la dirección', () => {
  const def = {
    radius: 1,
    halfAngle: 0,
    aoeShape: 'circle',
    aoeCircles: [
      { offsetX: 2, offsetZ: 0 },
      { offsetX: 0, offsetZ: 3, radius: 2 }
    ]
  } as unknown as AoeAbilityDef;

  const forward = aoeCirclesFrom(def, 10, 10, 0, 1);
  assert.deepEqual(forward[0], { x: 12, z: 10, radius: 1 });
  assert.deepEqual(forward[1], { x: 10, z: 13, radius: 2 });

  // Con el lanzamiento hacia +X, la derecha pasa a ser -Z.
  const turned = aoeCirclesFrom(def, 10, 10, 1, 0);
  assert.deepEqual(turned[0], { x: 10, z: 8, radius: 1 });
  assert.deepEqual(turned[1], { x: 13, z: 10, radius: 2 });
});

test('aoeAreaFrom deja el círculo único cuando no hay patrón', () => {
  const def = {
    radius: 2,
    halfAngle: 30,
    aoeShape: 'circle',
    aoeCircles: []
  } as unknown as AoeAbilityDef;
  const area = aoeAreaFrom(def, 1, 2, 0, 1);
  assert.deepEqual(area.circles, [{ x: 1, z: 2, radius: 2 }]);
});
