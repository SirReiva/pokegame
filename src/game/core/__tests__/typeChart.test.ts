import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStab, typeEffectiveness } from '../typeChart.ts';

test('typeEffectiveness usa la escala del juego y multiplica por tipo', () => {
  // Neutro.
  assert.equal(typeEffectiveness('Normal', ['Normal']), 1);
  // Resiste.
  assert.equal(typeEffectiveness('Fire', ['Water']), 0.95);
  // Doble resistencia: los valores se multiplican.
  assert.equal(typeEffectiveness('Fire', ['Water', 'Rock']), 0.9025);
  // Débil.
  assert.equal(typeEffectiveness('Fire', ['Grass']), 1.05);
  // Doble debilidad.
  assert.equal(typeEffectiveness('Fire', ['Grass', 'Bug']), 1.1025);
  // Inmune: ya no anula el golpe, solo aplica la mayor reducción.
  assert.equal(typeEffectiveness('Electric', ['Ground']), 0.85);
  // Inmunidad combinada con resistencia.
  assert.equal(typeEffectiveness('Electric', ['Ground', 'Grass']), 0.8075);
});

test('isStab compara el tipo del movimiento con los del atacante', () => {
  assert.equal(isStab('Fire', ['Fire']), true);
  assert.equal(isStab('Fire', ['Water', 'Flying']), false);
});
