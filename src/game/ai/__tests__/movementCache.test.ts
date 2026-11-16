import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BotMovement, type BotMovementContext } from '../movement.ts';
import type { MatchPlayerState } from '../../matchState.ts';

/**
 * Contexto mínimo con una rejilla que cuenta cuántas veces se comprueba la
 * línea recta. A* no debe usarse en estas pruebas: la línea siempre es
 * transitable, así que `moveTowards` avanza en recta.
 */
function makeMovement(clear = true): {
  movement: BotMovement;
  checks: () => number;
  self: MatchPlayerState;
} {
  let checks = 0;
  const context = {
    nav: {
      lineClear: () => {
        checks++;
        return clear;
      },
      findPath: () => ({ points: [], status: 'ok' as const })
    },
    tuning: { pathInterval: 0.5 },
    slot: 0,
    currentGoal: () => ({ x: 10, z: 0 }),
    currentPickupGoal: () => null,
    clearPickupGoal: () => {},
    isRetreating: () => false,
    isRecovering: () => false,
    isTargetVisible: () => false,
    now: () => 0,
    hazardPathBlocked: () => false,
    navHazards: () => undefined,
    avoidCurrentPickupGoal: () => {},
    abandonGoal: () => {},
    isAllyStill: () => false
  } as unknown as BotMovementContext;

  const self = {
    x: 0,
    z: 0,
    team: 'red'
  } as unknown as MatchPlayerState;

  return { movement: new BotMovement(context), checks: () => checks, self };
}

test('avanzar por una recta ya validada no vuelve a muestrear la rejilla', () => {
  const { movement, checks, self } = makeMovement();
  const goal = { x: 10, z: 0 };

  for (let step = 0; step < 10; step++) {
    self.x = step * 0.2;
    movement.moveTowards(self, goal, 1 / 60);
  }

  assert.equal(checks(), 1);
});

test('un desvío lateral invalida la comprobación', () => {
  const { movement, checks, self } = makeMovement();
  const goal = { x: 10, z: 0 };

  movement.moveTowards(self, goal, 1 / 60);
  assert.equal(checks(), 1);

  // Empujado fuera de la recta: el tramo restante ya no es un subconjunto.
  self.x = 0.4;
  self.z = 0.5;
  movement.moveTowards(self, goal, 1 / 60);
  assert.equal(checks(), 2);

  // Desde la nueva posición, volver a avanzar en recta reutiliza el resultado.
  self.x = 0.8;
  movement.moveTowards(self, goal, 1 / 60);
  assert.equal(checks(), 2);
});

test('un destino nuevo obliga a comprobar otra vez', () => {
  const { movement, checks, self } = makeMovement();

  movement.moveTowards(self, { x: 10, z: 0 }, 1 / 60);
  self.x = 0.2;
  movement.moveTowards(self, { x: 10, z: 0 }, 1 / 60);
  assert.equal(checks(), 1);

  movement.moveTowards(self, { x: 10, z: 6 }, 1 / 60);
  assert.equal(checks(), 2);
});

test('retroceder por detrás del ancla invalida la comprobación', () => {
  const { movement, checks, self } = makeMovement();
  const goal = { x: 10, z: 0 };

  self.x = 1;
  movement.moveTowards(self, goal, 1 / 60);
  assert.equal(checks(), 1);

  self.x = 0.5;
  movement.moveTowards(self, goal, 1 / 60);
  assert.equal(checks(), 2);
});

test('una línea bloqueada se vuelve a comprobar en cada paso', () => {
  const { movement, checks, self } = makeMovement(false);
  const goal = { x: 10, z: 0 };

  movement.moveTowards(self, goal, 1 / 60);
  self.x = 0.2;
  movement.moveTowards(self, goal, 1 / 60);
  self.x = 0.4;
  movement.moveTowards(self, goal, 1 / 60);

  assert.equal(checks(), 3);
});

test('invalidateStraightLine() olvida la comprobación previa', () => {
  const { movement, checks, self } = makeMovement();
  const goal = { x: 10, z: 0 };

  movement.moveTowards(self, goal, 1 / 60);
  self.x = 0.2;
  movement.moveTowards(self, goal, 1 / 60);
  assert.equal(checks(), 1);

  movement.invalidateStraightLine();
  movement.moveTowards(self, goal, 1 / 60);
  assert.equal(checks(), 2);
});
