import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sfxPathsForRoster } from '../audioRoster.ts';

test('incluye los impactos genéricos y los instintos comunes', () => {
  const paths = sfxPathsForRoster([]);
  assert.deepEqual(
    [...paths].sort(),
    [
      'abilities/impulso.mp3',
      'abilities/proteccion.mp3',
      'hit/normal.mp3',
      'hit/super.mp3',
      'hit/weak.mp3'
    ].sort()
  );
});

test('añade las cuatro habilidades del moveset y el instinto elegido', () => {
  const paths = sfxPathsForRoster([
    { pokemonId: '0025', commonAbilityId: 'proteccion' }
  ]);
  for (const path of [
    'abilities/chispa.mp3',
    'abilities/ataqueRapido.mp3',
    'abilities/impactrueno.mp3',
    'abilities/rayo.mp3'
  ]) {
    assert.ok(paths.includes(path), `falta ${path}`);
  }
  // No se cuela el repertorio de una especie que no juega.
  assert.ok(!paths.includes('abilities/explosion.mp3'));
  assert.ok(!paths.includes('abilities/ventisca.mp3'));
});

test('deduplica rutas compartidas entre especies del roster', () => {
  const paths = sfxPathsForRoster([
    { pokemonId: '0383', commonAbilityId: 'impulso' },
    { pokemonId: '0248', commonAbilityId: 'impulso' }
  ]);
  assert.equal(
    paths.filter((path) => path === 'abilities/terremoto.mp3').length,
    1
  );
  assert.equal(
    paths.filter((path) => path === 'abilities/avalancha.mp3').length,
    1
  );
});

test('ignora especies sin moveset y habilidades sin sonido', () => {
  const paths = sfxPathsForRoster([
    { pokemonId: '9999' },
    { pokemonId: '0025', commonAbilityId: 'regeneracion' }
  ]);
  assert.ok(!paths.some((path) => path.includes('regeneracion')));
  assert.ok(paths.length > 0);
});
