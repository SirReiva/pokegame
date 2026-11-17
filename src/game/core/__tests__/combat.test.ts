import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  angleDelta,
  closestPointOnSegment,
  computeDamage,
  pointSegmentDistance,
  sectorOverlapsCircle
} from '../../combat.ts';

const attacker = {
  hp: 1000,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 5
};
const defender = { ...attacker };

test('la fórmula determinista ancla D ≈ B con 100 de ataque y defensa', () => {
  assert.equal(
    computeDamage({
      moveType: 'Normal',
      category: 'physical',
      power: 100,
      attacker,
      defender,
      defenderTypes: ['Normal']
    }).damage,
    100
  );
});

test('el ataque y la defensa escalan el daño sin críticos ni aleatoriedad', () => {
  const strong = computeDamage({
    moveType: 'Normal',
    category: 'physical',
    power: 50,
    attacker: { ...attacker, attack: 200 },
    defender,
    defenderTypes: ['Normal']
  });
  assert.equal(strong.damage, 75);

  const armored = computeDamage({
    moveType: 'Normal',
    category: 'physical',
    power: 50,
    attacker,
    defender: { ...defender, defense: 200 },
    defenderTypes: ['Normal']
  });
  assert.equal(armored.damage, 33);
});

test('la efectividad suavizada se aplica entre 0,85 y 1,15', () => {
  const weak = computeDamage({
    moveType: 'Normal',
    category: 'physical',
    power: 100,
    attacker,
    defender,
    defenderTypes: ['Rock']
  });
  assert.equal(weak.effectiveness, 0.9);
  assert.equal(weak.damage, 90);

  const strong = computeDamage({
    moveType: 'Fire',
    category: 'physical',
    power: 100,
    attacker,
    defender,
    defenderTypes: ['Grass', 'Poison']
  });
  assert.equal(strong.effectiveness, 1.15);
  assert.equal(strong.damage, 115);

  const immune = computeDamage({
    moveType: 'Normal',
    category: 'physical',
    power: 100,
    attacker,
    defender,
    defenderTypes: ['Ghost']
  });
  assert.equal(immune.effectiveness, 0.85);
  assert.equal(immune.damage, 85);
});

test('los tipos dobles multiplican lo clásico y se limitan a la banda', () => {
  // Ground ×2 a Electric y ×0 a Flying: la inmunidad clásica manda.
  const clampedDown = computeDamage({
    moveType: 'Ground',
    category: 'physical',
    power: 100,
    attacker,
    defender,
    defenderTypes: ['Electric', 'Flying']
  });
  assert.equal(clampedDown.effectiveness, 0.85);

  // Grass ×2 a Water y ×0,5 a Flying: el producto es neutro.
  const neutral = computeDamage({
    moveType: 'Grass',
    category: 'special',
    power: 100,
    attacker,
    defender,
    defenderTypes: ['Water', 'Flying']
  });
  assert.equal(neutral.effectiveness, 1);

  // Fire ×2 a Grass y ×1 a Poison: tope superior.
  const clampedUp = computeDamage({
    moveType: 'Fire',
    category: 'special',
    power: 100,
    attacker,
    defender,
    defenderTypes: ['Grass', 'Poison']
  });
  assert.equal(clampedUp.effectiveness, 1.15);
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
