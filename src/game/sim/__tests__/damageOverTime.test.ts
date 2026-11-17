import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MatchPlayerState } from '../../matchState';
import {
  applyDamageOverTime,
  stepDamageOverTime,
  type DamageSystemHost
} from '../damage';

function makePlayer(
  overrides: Partial<MatchPlayerState> = {}
): MatchPlayerState {
  return {
    slot: 1,
    name: 'Prueba',
    team: 'red',
    alive: true,
    hp: 100,
    maxHp: 100,
    damageTaken: 0,
    damageDealt: 0,
    invulnerableTimer: 0,
    damageReductionTimer: 0,
    damageReduction: 0,
    hiddenTimer: 0,
    regenGraceTimer: 0,
    regenAccumulator: 0,
    regenerating: false,
    x: 0,
    z: 0,
    dots: [],
    ...overrides
  } as unknown as MatchPlayerState;
}

function makeHost() {
  const popups: number[] = [];
  const knockouts: {
    target: MatchPlayerState;
    killer: MatchPlayerState;
    abilityName: string;
  }[] = [];
  const host = {
    atmosphere: 'clear',
    combatFx: { spawnBuff() {} },
    buffMultiplier: () => 1,
    applySlow() {},
    activeCastArmor: () => 0,
    spawnArmorFeedback() {},
    interruptWithRefund() {},
    applyKnockback() {},
    playImpactSound() {},
    showDamagePopup: (_target: MatchPlayerState, amount: number) => {
      popups.push(amount);
    },
    showHealPopup() {},
    awardCombatXp() {},
    awardXp() {},
    vibrateOnDamage() {},
    knockOut: (
      target: MatchPlayerState,
      killer: MatchPlayerState,
      abilityName: string
    ) => {
      target.alive = false;
      target.hp = 0;
      knockouts.push({ target, killer, abilityName });
    }
  } as unknown as DamageSystemHost;
  return { host, popups, knockouts };
}

test('solo hay un DoT por tipo y reaplicarlo refresca sin acumular', () => {
  const { host } = makeHost();
  const first = makePlayer({ slot: 0, team: 'blue' });
  const second = makePlayer({ slot: 2, team: 'green' });
  const target = makePlayer();

  applyDamageOverTime(
    host,
    target,
    first,
    { type: 'Fire', damage: 6, duration: 6 },
    'Lanzallamas',
    [255, 138, 42]
  );
  applyDamageOverTime(
    host,
    target,
    second,
    { type: 'Fire', damage: 4, duration: 8 },
    'Otra llama',
    [255, 138, 42]
  );

  assert.equal(target.dots.length, 1);
  assert.equal(target.dots[0].damage, 6);
  assert.equal(target.dots[0].remaining, 8);
  assert.equal(target.dots[0].source, second);
  assert.equal(target.dots[0].abilityName, 'Otra llama');
});

test('quemadura de 6 PV/s durante 6 s hace seis ticks y caduca', () => {
  const { host } = makeHost();
  const source = makePlayer({ slot: 0, team: 'blue' });
  const target = makePlayer();

  applyDamageOverTime(
    host,
    target,
    source,
    { type: 'Fire', damage: 6, duration: 6 },
    'Lanzallamas',
    [255, 138, 42]
  );

  for (let step = 0; step < 7; step++) {
    stepDamageOverTime([target], 1, host, () => false);
  }

  assert.equal(target.hp, 64);
  assert.equal(target.damageTaken, 36);
  assert.equal(source.damageDealt, 36);
  assert.equal(target.dots.length, 0);
});

test('Protección reduce cada tick de daño en el tiempo', () => {
  const { host, popups } = makeHost();
  const source = makePlayer({ slot: 0, team: 'blue' });
  const target = makePlayer({
    damageReductionTimer: 2,
    damageReduction: 0.6
  });

  applyDamageOverTime(
    host,
    target,
    source,
    { type: 'Poison', damage: 10, duration: 1 },
    'Bomba Lodo',
    [150, 90, 180]
  );
  stepDamageOverTime([target], 1, host, () => false);

  assert.equal(popups[0], 4);
  assert.equal(target.hp, 96);
  assert.equal(target.dots.length, 0);
});

test('el tick letal atribuye el KO al lanzador del estado', () => {
  const { host, knockouts } = makeHost();
  const source = makePlayer({ slot: 0, team: 'blue' });
  const target = makePlayer({ hp: 4 });

  applyDamageOverTime(
    host,
    target,
    source,
    { type: 'Poison', damage: 5, duration: 8 },
    'Bomba Lodo',
    [150, 90, 180]
  );
  stepDamageOverTime([target], 1, host, () => false);

  assert.equal(knockouts.length, 1);
  assert.equal(knockouts[0].killer, source);
  assert.equal(knockouts[0].abilityName, 'Bomba Lodo');
  assert.equal(target.dots.length, 0);
});
