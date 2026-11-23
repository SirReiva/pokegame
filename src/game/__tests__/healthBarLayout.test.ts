import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthBarLayoutFor } from '../healthBar.ts';

test('los Pokémon pequeños conservan una barra de ancho legible', () => {
  // Squirtle mide ~1,3 u; antes caía en el mínimo de 0,6 u.
  assert.ok(healthBarLayoutFor(1.27).width >= 0.95);
});

test('la barra de vida no crece sin límite en los Pokémon grandes', () => {
  assert.equal(healthBarLayoutFor(4.4).width, 1.7);
});

test('el alto de vida y XP mantiene el aspecto de sus texturas', () => {
  const layout = healthBarLayoutFor(2);
  assert.ok(Math.abs(layout.height / layout.width - 32 / 256) < 1e-9);
  assert.ok(Math.abs(layout.xpHeight / layout.xpWidth - 12 / 256) < 1e-9);
});
