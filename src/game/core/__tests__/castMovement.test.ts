import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  castMovementMultiplier,
  hasCastMovementOption,
  isChannelingCast,
  movementMultiplier
} from '../abilities/movement.ts';

const BASE = {
  shape: 'aoe' as const,
  startup: 1,
  moveWhileStartup: false,
  movementDuringCast: undefined,
  movementUntilEndAnimation: undefined
};

test('movementMultiplier traduce booleanos y números', () => {
  assert.equal(movementMultiplier(true), 1);
  assert.equal(movementMultiplier(false), 0);
  assert.equal(movementMultiplier(0.5), 0.5);
  assert.equal(movementMultiplier(0), 0);
  assert.equal(movementMultiplier(undefined), 1);
  assert.equal(movementMultiplier(undefined, 0), 0);
});

test('moveWhileStartup bloquea, permite o escala solo durante el startup', () => {
  const blocked = { ...BASE, moveWhileStartup: false };
  assert.equal(
    castMovementMultiplier({
      def: blocked,
      elapsed: 0.5,
      activeEnd: 1,
      animationEndAt: 1.5
    }),
    0
  );
  assert.equal(
    castMovementMultiplier({
      def: blocked,
      elapsed: 1.2,
      activeEnd: 1,
      animationEndAt: 1.5
    }),
    1
  );

  const slow = { ...BASE, moveWhileStartup: 0.4 };
  assert.equal(
    castMovementMultiplier({
      def: slow,
      elapsed: 0.5,
      activeEnd: 1,
      animationEndAt: 1.5
    }),
    0.4
  );

  assert.equal(
    castMovementMultiplier({
      def: { ...BASE, moveWhileStartup: true },
      elapsed: 0.5,
      activeEnd: 1,
      animationEndAt: 1.5
    }),
    1
  );
});

test('movementDuringCast se aplica a todo el casteo', () => {
  const rooted = { ...BASE, movementDuringCast: false };
  assert.equal(
    castMovementMultiplier({
      def: rooted,
      elapsed: 0.5,
      activeEnd: 1,
      animationEndAt: 1.5
    }),
    0
  );
  assert.equal(
    castMovementMultiplier({
      def: rooted,
      elapsed: 0.9,
      activeEnd: 1,
      animationEndAt: 1.5
    }),
    0
  );

  const slow = { ...BASE, movementDuringCast: 0.25 };
  assert.equal(
    castMovementMultiplier({
      def: slow,
      elapsed: 0.2,
      activeEnd: 1,
      animationEndAt: 1.5
    }),
    0.25
  );
});

test('movementUntilEndAnimation manda hasta el fin de la animación', () => {
  const slow = {
    ...BASE,
    moveWhileStartup: false,
    movementUntilEndAnimation: 0.6
  };
  assert.equal(
    castMovementMultiplier({
      def: slow,
      elapsed: 0.5,
      activeEnd: 1,
      animationEndAt: 1.2
    }),
    0.6
  );
  assert.equal(
    castMovementMultiplier({
      def: slow,
      elapsed: 1.3,
      activeEnd: 1,
      animationEndAt: 1.2
    }),
    1
  );
});

test('la ventana activa de las melee bloquea salvo override', () => {
  const melee = { ...BASE, shape: 'melee' as const };
  assert.equal(
    castMovementMultiplier({
      def: melee,
      elapsed: 1.5,
      activeEnd: 2,
      animationEndAt: 2.5
    }),
    0
  );
  assert.equal(
    castMovementMultiplier({
      def: { ...melee, movementDuringCast: 0.5 },
      elapsed: 1.5,
      activeEnd: 2,
      animationEndAt: 2.5
    }),
    0.5
  );
});

test('isChannelingCast solo marca el bloqueo total declarado', () => {
  assert.equal(isChannelingCast({ movementDuringCast: false }), true);
  assert.equal(isChannelingCast({ movementDuringCast: 0 }), true);
  assert.equal(isChannelingCast({ movementDuringCast: 0.5 }), false);
  assert.equal(isChannelingCast({ movementDuringCast: true }), false);
  assert.equal(isChannelingCast({}), false);
});

test('hasCastMovementOption distingue preparaciones móviles', () => {
  assert.equal(hasCastMovementOption({ moveWhileStartup: false }), false);
  assert.equal(hasCastMovementOption({ moveWhileStartup: 0.5 }), true);
  assert.equal(
    hasCastMovementOption({ moveWhileStartup: false, movementDuringCast: 0.5 }),
    true
  );
  assert.equal(
    hasCastMovementOption({
      moveWhileStartup: false,
      movementUntilEndAnimation: false
    }),
    true
  );
});
