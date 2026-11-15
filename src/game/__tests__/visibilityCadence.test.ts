import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VisibilityCadence } from '../sim/visibilityCadence.ts';
import type { MatchPlayerState } from '../matchState.ts';

function player(
  slot: number,
  team: 'red' | 'blue',
  x: number,
  z: number
): MatchPlayerState {
  return {
    slot,
    team,
    x,
    z,
    alive: true,
    hidden: false,
    damageTaken: 0,
    deathFade: 0,
    activeCast: null,
    visionRange: 18,
    visionFactor: 1,
    concealment: { value: 0 }
  } as unknown as MatchPlayerState;
}

const cadence = () => new VisibilityCadence(3, 0.12);

test('el primer paso y la nueva partida siempre recalculan', () => {
  const players = [player(0, 'red', 0, 0), player(1, 'blue', 5, 0)];
  const schedule = cadence();

  assert.equal(schedule.shouldRefresh(players, 0, 1), true);
  schedule.markComputed(players, 10, 1);
  assert.equal(schedule.shouldRefresh(players, 11, 1), false);

  // Al reiniciar la partida el contador vuelve atrás: no puede esperar al
  // intervalo con una foto de la partida anterior.
  assert.equal(schedule.shouldRefresh(players, 0, 1), true);
});

test('el movimiento espera al intervalo de 3 pasos (20 Hz)', () => {
  const players = [player(0, 'red', 0, 0), player(1, 'blue', 5, 0)];
  const schedule = cadence();
  schedule.markComputed(players, 0, 1);

  players[1].x = 6;
  assert.equal(schedule.shouldRefresh(players, 1, 1), false);
  assert.equal(schedule.shouldRefresh(players, 2, 1), false);
  assert.equal(schedule.shouldRefresh(players, 3, 1), true);

  schedule.markComputed(players, 3, 1);
  assert.equal(schedule.shouldRefresh(players, 4, 1), false);
  assert.equal(schedule.shouldRefresh(players, 6, 1), false);
});

test('un movimiento menor que epsilon no gasta cálculos', () => {
  const players = [player(0, 'red', 0, 0)];
  const schedule = cadence();
  schedule.markComputed(players, 0, 1);

  players[0].x = 0.05;
  players[0].z = 0.05;
  assert.equal(schedule.shouldRefresh(players, 3, 1), false);
  assert.equal(schedule.shouldRefresh(players, 6, 1), false);
});

test('el daño recibido fuerza el cálculo en el mismo paso', () => {
  const players = [player(0, 'red', 0, 0), player(1, 'blue', 5, 0)];
  const schedule = cadence();
  schedule.markComputed(players, 10, 1);

  players[1].damageTaken += 12;
  assert.equal(schedule.shouldRefresh(players, 11, 1), true);
});

test('ocultación, casteo, muerte y respawn fuerzan el cálculo', () => {
  const players = [player(0, 'red', 0, 0), player(1, 'blue', 5, 0)];
  const schedule = cadence();
  schedule.markComputed(players, 10, 1);

  players[0].hidden = true;
  assert.equal(schedule.shouldRefresh(players, 11, 1), true);
  schedule.markComputed(players, 11, 1);

  players[0].hidden = false;
  players[0].activeCast = {} as MatchPlayerState['activeCast'];
  assert.equal(schedule.shouldRefresh(players, 12, 1), true);
  schedule.markComputed(players, 12, 1);

  players[0].activeCast = null;
  players[1].alive = false;
  assert.equal(schedule.shouldRefresh(players, 13, 1), true);
  schedule.markComputed(players, 13, 1);

  // El cadáver sigue visible mientras dura la animación; cuando termina, el
  // render debe ocultarlo sin esperar 3 pasos.
  players[1].deathFade = 0.6;
  assert.equal(schedule.shouldRefresh(players, 14, 1), true);
  schedule.markComputed(players, 14, 1);

  players[1].deathFade = 0;
  assert.equal(schedule.shouldRefresh(players, 15, 1), true);
  schedule.markComputed(players, 15, 1);

  players[1].alive = true;
  assert.equal(schedule.shouldRefresh(players, 16, 1), true);
});

test('un cambio de atmósfera o de visión fuerza el cálculo', () => {
  const players = [player(0, 'red', 0, 0)];
  const schedule = cadence();
  schedule.markComputed(players, 10, 1);

  assert.equal(schedule.shouldRefresh(players, 11, 0.8), true);
  schedule.markComputed(players, 11, 0.8);

  players[0].visionRange = 22;
  assert.equal(schedule.shouldRefresh(players, 12, 0.8), true);
});

test('un actor nuevo fuerza el cálculo aunque no se haya movido nadie', () => {
  const players = [player(0, 'red', 0, 0)];
  const schedule = cadence();
  schedule.markComputed(players, 10, 1);

  players.push(player(1, 'blue', 3, 3));
  assert.equal(schedule.shouldRefresh(players, 11, 1), true);
});
