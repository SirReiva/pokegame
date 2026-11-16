import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchupCache } from '../matchups.ts';
import type { MatchPlayerState } from '../../matchState.ts';

/** Jugador mínimo: la caché solo lee plaza, tipos y habilidades. */
function player(
  slot: number,
  types: string[],
  abilityIds: (string | null)[] = [null, null, null, null]
): MatchPlayerState {
  return { slot, types, abilityIds } as unknown as MatchPlayerState;
}

test('la ventaja de tipo se reutiliza mientras no cambie nada', () => {
  const cache = new MatchupCache();
  const self = player(0, ['fire']);
  const enemy = player(1, ['grass']);

  assert.equal(cache.lookup(self, enemy, 'clear'), null);

  const stored = cache.store(self, enemy, 'clear', 2, 0.5);
  assert.deepEqual({ ...stored }, { offense: 2, defense: 0.5 });

  const again = cache.lookup(self, enemy, 'clear');
  assert.ok(again);
  assert.equal(again.offense, 2);
  assert.equal(again.defense, 0.5);
  // El objeto de resultado también se reutiliza entre consultas.
  assert.equal(again, stored);
});

test('un cambio de clima invalida la entrada', () => {
  const cache = new MatchupCache();
  const self = player(0, ['water']);
  const enemy = player(1, ['fire']);

  cache.store(self, enemy, 'clear', 2, 0.5);

  assert.equal(cache.lookup(self, enemy, 'rain'), null);
});

test('un rival distinto en la misma plaza invalida la entrada', () => {
  const cache = new MatchupCache();
  const self = player(0, ['water']);
  const first = player(1, ['fire']);
  cache.store(self, first, 'clear', 2, 0.5);

  const replacement = player(1, ['electric']);

  assert.equal(cache.lookup(self, replacement, 'clear'), null);
  // El original sigue vigente: la entrada no se reescribe.
  assert.equal(cache.lookup(self, first, 'clear')?.offense, 2);
});

test('sustituir tipos u habilidades obliga a recalcular', () => {
  const cache = new MatchupCache();
  const self = player(0, ['water']);
  const enemy = player(1, ['fire']);
  cache.store(self, enemy, 'clear', 2, 0.5);

  enemy.types = ['grass'];
  assert.equal(cache.lookup(self, enemy, 'clear'), null);

  cache.store(self, enemy, 'clear', 0.5, 2);
  enemy.abilityIds = ['pistolaAgua', null, null, null];
  assert.equal(cache.lookup(self, enemy, 'clear'), null);
});

test('clear() olvida todas las plazas', () => {
  const cache = new MatchupCache();
  const self = player(0, ['water']);
  const enemy = player(1, ['fire']);
  cache.store(self, enemy, 'clear', 2, 0.5);

  cache.clear();

  assert.equal(cache.lookup(self, enemy, 'clear'), null);
});

test('un atacante distinto invalida la entrada', () => {
  const cache = new MatchupCache();
  const self = player(0, ['water']);
  const other = player(2, ['fire']);
  const enemy = player(1, ['grass']);
  cache.store(self, enemy, 'clear', 2, 0.5);

  assert.equal(cache.lookup(other, enemy, 'clear'), null);
});
