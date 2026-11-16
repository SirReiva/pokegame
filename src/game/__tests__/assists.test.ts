import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assistXpFor,
  collectKillAssists
} from '../core/match/assists.ts';
import { XP_REWARDS, XP_RULES } from '../core/xp.ts';
import type { MatchPlayerState } from '../matchState.ts';

function player(
  slot: number,
  team: 'red' | 'blue',
  overrides: Partial<MatchPlayerState> = {}
): MatchPlayerState {
  return {
    slot,
    team,
    maxHp: 100,
    damageContributors: new Map(),
    slowContributors: new Map(),
    supportContributors: new Map(),
    ...overrides
  } as unknown as MatchPlayerState;
}

function bySlot(
  credits: ReturnType<typeof collectKillAssists>
): Map<number, string[]> {
  return new Map(credits.map((credit) => [credit.slot, credit.kinds]));
}

test('acredita daño por encima del umbral y dentro de la ventana', () => {
  const killer = player(0, 'red');
  const victim = player(1, 'blue');
  const helper = player(2, 'red');
  victim.damageContributors.set(2, { amount: 25, at: 95, xp: 0 });

  const credits = collectKillAssists(
    killer,
    victim,
    new Map([
      [0, killer],
      [1, victim],
      [2, helper]
    ]),
    100
  );

  assert.deepEqual(bySlot(credits).get(2), ['damage']);
});

test('descarta daño insuficiente o fuera de la ventana', () => {
  const killer = player(0, 'red');
  const victim = player(1, 'blue');
  const helper = player(2, 'red');
  const players = new Map([
    [0, killer],
    [1, victim],
    [2, helper]
  ]);

  victim.damageContributors.set(2, {
    amount: victim.maxHp * XP_RULES.assistMinDamageFraction - 1,
    at: 99,
    xp: 0
  });
  assert.deepEqual(collectKillAssists(killer, victim, players, 100), []);

  victim.damageContributors.set(2, {
    amount: 30,
    at: 100 - XP_RULES.assistWindowSeconds - 1,
    xp: 0
  });
  assert.deepEqual(collectKillAssists(killer, victim, players, 100), []);
});

test('acredita control y no repite tipos para un mismo asistente', () => {
  const killer = player(0, 'red');
  const victim = player(1, 'blue');
  const helper = player(2, 'red');
  victim.damageContributors.set(2, { amount: 40, at: 99, xp: 0 });
  victim.slowContributors.set(2, 98);

  const credits = collectKillAssists(
    killer,
    victim,
    new Map([
      [0, killer],
      [1, victim],
      [2, helper]
    ]),
    100
  );

  assert.equal(credits.length, 1);
  assert.deepEqual(credits[0].kinds, ['damage', 'slow']);
  assert.equal(assistXpFor(credits[0].kinds), XP_REWARDS.assist);
});

test('acredita curación y revive recientes del killer', () => {
  const killer = player(0, 'red');
  const victim = player(1, 'blue');
  const healer = player(2, 'red');
  const reviver = player(3, 'red');
  killer.supportContributors.set(2, {
    heal: killer.maxHp * XP_RULES.assistMinHealingFraction,
    healAt: 98,
    revives: 0,
    reviveAt: 0
  });
  killer.supportContributors.set(3, {
    heal: 0,
    healAt: 0,
    revives: 1,
    reviveAt: 97
  });

  const credits = collectKillAssists(
    killer,
    victim,
    new Map([
      [0, killer],
      [1, victim],
      [2, healer],
      [3, reviver]
    ]),
    100
  );
  const slots = bySlot(credits);

  assert.deepEqual(slots.get(2), ['heal']);
  assert.deepEqual(slots.get(3), ['revive']);
});

test('la curación por debajo del umbral no cuenta sin revive', () => {
  const killer = player(0, 'red');
  const victim = player(1, 'blue');
  const healer = player(2, 'red');
  killer.supportContributors.set(2, {
    heal: killer.maxHp * XP_RULES.assistMinHealingFraction - 1,
    healAt: 99,
    revives: 0,
    reviveAt: 0
  });

  const credits = collectKillAssists(
    killer,
    victim,
    new Map([
      [0, killer],
      [1, victim],
      [2, healer]
    ]),
    100
  );
  assert.deepEqual(credits, []);
});

test('excluye al killer, a los rivales y las bajas entre compañeros', () => {
  const killer = player(0, 'red');
  const victim = player(1, 'blue');
  const rival = player(2, 'blue');
  const helper = player(3, 'red');
  const players = new Map([
    [0, killer],
    [1, victim],
    [2, rival],
    [3, helper]
  ]);

  victim.damageContributors.set(0, { amount: 90, at: 99, xp: 0 });
  victim.damageContributors.set(2, { amount: 90, at: 99, xp: 0 });
  assert.deepEqual(collectKillAssists(killer, victim, players, 100), []);

  // Una baja entre compañeros no reparte asistencias.
  const allyVictim = player(4, 'red');
  allyVictim.damageContributors.set(3, { amount: 90, at: 99, xp: 0 });
  assert.deepEqual(
    collectKillAssists(
      killer,
      allyVictim,
      new Map([...players, [4, allyVictim]]),
      100
    ),
    []
  );
});

test('la XP de una asistencia usa el peso mayor de sus tipos', () => {
  assert.equal(assistXpFor(['slow']), XP_REWARDS.assistSlow);
  assert.equal(assistXpFor(['heal']), XP_REWARDS.assistHeal);
  assert.equal(assistXpFor(['revive']), XP_REWARDS.assistRevive);
  assert.equal(
    assistXpFor(['heal', 'damage']),
    Math.max(XP_REWARDS.assistHeal, XP_REWARDS.assist)
  );
});
