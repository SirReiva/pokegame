import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ABILITIES, baseAbilityId, MOVESETS } from '../abilities.ts';
import { POKEDEX_PROFILES } from '../core/pokedex.ts';
import { speedForPokemon } from '../roster.ts';
import { visionForPokemon } from '../vision.ts';

test('las 28 especies tienen un moveset completo y resuelto', () => {
  const species = Object.keys(POKEDEX_PROFILES);
  assert.equal(species.length, 28);

  for (const id of species) {
    const moveset = MOVESETS[id];
    assert.ok(moveset, `Falta el moveset de ${id}`);
    for (let slot = 0; slot < 4; slot++) {
      const abilityId = moveset[slot];
      assert.ok(abilityId, `${id} no tiene habilidad en el slot ${slot}`);
      assert.ok(
        ABILITIES[abilityId],
        `${id} apunta a una habilidad inexistente: ${abilityId}`
      );
    }
  }
});

test('cada slot usa una variante afinada y conserva su habilidad base', () => {
  for (const [pokemonId, moveset] of Object.entries(MOVESETS)) {
    for (const abilityId of moveset) {
      if (!abilityId) continue;
      assert.ok(
        abilityId.startsWith(`${pokemonId}/`),
        `${pokemonId} debería usar una variante propia, no ${abilityId}`
      );
      assert.ok(
        ABILITIES[baseAbilityId(abilityId)],
        `Falta la habilidad base de ${abilityId}`
      );
    }
  }
});

test('básicas y definitivas respetan el presupuesto de enfriamiento', () => {
  for (const [pokemonId, moveset] of Object.entries(MOVESETS)) {
    const basic = moveset[0] ? ABILITIES[moveset[0]] : null;
    const ultimate = moveset[3] ? ABILITIES[moveset[3]] : null;
    assert.ok(basic, `${pokemonId} sin básica`);
    assert.ok(ultimate, `${pokemonId} sin definitiva`);
    assert.ok(
      basic.cooldown >= 0.5 && basic.cooldown <= 0.85,
      `${pokemonId}: básica fuera de presupuesto (${basic.cooldown})`
    );
    assert.ok(
      ultimate.cooldown >= 14 && ultimate.cooldown <= 18,
      `${pokemonId}: definitiva fuera de presupuesto (${ultimate.cooldown})`
    );
  }
});

test('VEL y VIS salen de la ficha y no se duplican en otras tablas', () => {
  for (const [pokemonId, profile] of Object.entries(POKEDEX_PROFILES)) {
    assert.equal(
      speedForPokemon(pokemonId),
      profile.stats.speed,
      `${pokemonId}: VEL desincronizada`
    );
    assert.equal(
      visionForPokemon(pokemonId),
      profile.vision,
      `${pokemonId}: VIS desincronizada`
    );
  }
});
