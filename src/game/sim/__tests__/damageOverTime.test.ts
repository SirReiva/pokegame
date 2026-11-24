import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MatchPlayerState } from '../../matchState';
import type { PokemonType } from '../../core/typeChart';
import {
  applyStatus,
  stepStatuses,
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
    abilityHealing: 0,
    invulnerableTimer: 0,
    damageReductionTimer: 0,
    damageReduction: 0,
    hiddenTimer: 0,
    regenGraceTimer: 0,
    regenAccumulator: 0,
    regenerating: false,
    x: 0,
    z: 0,
    statuses: [],
    cooldowns: [0, 0, 0, 0, 0],
    cooldownPenalties: [0, 0, 0, 0, 0],
    ...overrides
  } as unknown as MatchPlayerState;
}

function makeHost() {
  const popups: Array<{ amount: number; dotType?: PokemonType | null }> = [];
  const healPopups: Array<{
    target: MatchPlayerState;
    amount: number;
    source: MatchPlayerState;
  }> = [];
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
    refreshSlowMultiplier() {},
    activeCastArmor: () => 0,
    spawnArmorFeedback() {},
    interruptWithRefund() {},
    applyKnockback() {},
    playImpactSound() {},
    showDamagePopup: (
      _target: MatchPlayerState,
      amount: number,
      _critical?: boolean,
      _effectiveness?: number,
      _lethal?: boolean,
      _source?: MatchPlayerState | null,
      dotType?: PokemonType | null
    ) => {
      popups.push({ amount, dotType });
    },
    showHealPopup: (
      target: MatchPlayerState,
      amount: number,
      source: MatchPlayerState
    ) => {
      healPopups.push({ target, amount, source });
    },
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
  return { host, popups, healPopups, knockouts };
}

test('solo hay un estado por tipo y reaplicarlo reemplaza al anterior', () => {
  const { host } = makeHost();
  const first = makePlayer({ slot: 0, team: 'blue' });
  const second = makePlayer({ slot: 2, team: 'green' });
  const target = makePlayer();

  applyStatus(
    host,
    target,
    first,
    { kind: 'burned', damage: 6, duration: 6 },
    'Lanzallamas',
    [255, 138, 42]
  );
  applyStatus(
    host,
    target,
    second,
    { kind: 'burned', damage: 4, duration: 8 },
    'Otra llama',
    [255, 138, 42]
  );

  assert.equal(target.statuses.length, 1);
  const status = target.statuses[0];
  assert.ok(status.kind === 'burned');
  assert.equal(status.damage, 4);
  assert.equal(status.remaining, 8);
  assert.equal(status.source, second);
  assert.equal(status.abilityName, 'Otra llama');
});

test('quemadura de 6 PV/s durante 6 s hace seis ticks y caduca', () => {
  const { host } = makeHost();
  const source = makePlayer({ slot: 0, team: 'blue' });
  const target = makePlayer();

  applyStatus(
    host,
    target,
    source,
    { kind: 'burned', damage: 6, duration: 6 },
    'Lanzallamas',
    [255, 138, 42]
  );

  for (let step = 0; step < 7; step++) {
    stepStatuses([target], 1, host, () => false);
  }

  assert.equal(target.hp, 64);
  assert.equal(target.damageTaken, 36);
  assert.equal(source.damageDealt, 36);
  assert.equal(target.statuses.length, 0);
});

test('Protección reduce cada tick de daño en el tiempo', () => {
  const { host, popups } = makeHost();
  const source = makePlayer({ slot: 0, team: 'blue' });
  const target = makePlayer({
    damageReductionTimer: 2,
    damageReduction: 0.6
  });

  applyStatus(
    host,
    target,
    source,
    { kind: 'poisoned', damage: 10, duration: 1 },
    'Bomba Lodo',
    [150, 90, 180]
  );
  stepStatuses([target], 1, host, () => false);

  assert.equal(popups[0].amount, 4);
  assert.equal(popups[0].dotType, 'Poison');
  assert.equal(target.hp, 96);
  assert.equal(target.statuses.length, 0);
});

test('la semilla hace daño por tick y cura al lanzador una fracción', () => {
  const { host, popups, healPopups } = makeHost();
  const source = makePlayer({ slot: 0, team: 'blue', hp: 50 });
  const target = makePlayer();

  applyStatus(
    host,
    target,
    source,
    { kind: 'seeded', damage: 10, duration: 3, healRatio: 0.5 },
    'Drenadoras',
    [126, 214, 88]
  );

  for (let step = 0; step < 4; step++) {
    stepStatuses([target], 1, host, () => false);
  }

  assert.equal(target.hp, 70);
  assert.equal(target.damageTaken, 30);
  assert.equal(source.damageDealt, 30);
  assert.equal(source.hp, 65);
  assert.equal(source.abilityHealing, 15);
  assert.equal(healPopups.length, 3);
  assert.ok(healPopups.every((popup) => popup.target === source));
  assert.ok(healPopups.every((popup) => popup.amount === 5));
  assert.ok(popups.every((popup) => popup.dotType === 'Grass'));
  assert.equal(target.statuses.length, 0);
});

test('la curación de la semilla nunca supera la vida máxima del lanzador', () => {
  const { host, healPopups } = makeHost();
  const source = makePlayer({ slot: 0, team: 'blue', hp: 98 });
  const target = makePlayer();

  applyStatus(
    host,
    target,
    source,
    { kind: 'seeded', damage: 10, duration: 3, healRatio: 0.5 },
    'Drenadoras',
    [126, 214, 88]
  );
  stepStatuses([target], 1, host, () => false);

  assert.equal(source.hp, 100);
  assert.equal(source.abilityHealing, 2);
  assert.equal(healPopups.length, 1);
  assert.equal(healPopups[0].amount, 2);
});

test('el tick letal atribuye el KO al lanzador del estado', () => {
  const { host, knockouts } = makeHost();
  const source = makePlayer({ slot: 0, team: 'blue' });
  const target = makePlayer({ hp: 4 });

  applyStatus(
    host,
    target,
    source,
    { kind: 'poisoned', damage: 5, duration: 8 },
    'Bomba Lodo',
    [150, 90, 180]
  );
  stepStatuses([target], 1, host, () => false);

  assert.equal(knockouts.length, 1);
  assert.equal(knockouts[0].killer, source);
  assert.equal(knockouts[0].abilityName, 'Bomba Lodo');
  assert.equal(target.statuses.length, 0);
});

test('parálisis suma tiempo a las habilidades que ya están enfriando', () => {
  const { host } = makeHost();
  const source = makePlayer({ slot: 0, team: 'blue' });
  const target = makePlayer({
    cooldowns: [2, 0, 5, 0, 1],
    cooldownPenalties: [0, 0, 0, 0, 0]
  });

  applyStatus(
    host,
    target,
    source,
    { kind: 'paralyzed', extraCooldown: 2, duration: 3, mode: 'once' },
    'Onda Trueno',
    [247, 208, 44]
  );

  assert.deepEqual(target.cooldowns, [4, 0, 7, 0, 3]);
  assert.deepEqual(target.cooldownPenalties, [2, 0, 2, 0, 2]);
});

test('parálisis overtime vuelve a sumar tiempo cada intervalo', () => {
  const { host } = makeHost();
  const source = makePlayer({ slot: 0, team: 'blue' });
  const target = makePlayer({ cooldowns: [5, 0, 0, 0, 0] });

  applyStatus(
    host,
    target,
    source,
    {
      kind: 'paralyzed',
      extraCooldown: 2,
      duration: 3,
      mode: 'overtime',
      interval: 1
    },
    'Onda Trueno',
    [247, 208, 44]
  );

  // `overtime` no cobra al entrar: el primer tick cae en el paso siguiente.
  assert.equal(target.cooldowns[0], 5);
  stepStatuses([target], 1, host, () => false);
  assert.equal(target.cooldowns[0], 7);
  stepStatuses([target], 1, host, () => false);
  assert.equal(target.cooldowns[0], 9);
});
