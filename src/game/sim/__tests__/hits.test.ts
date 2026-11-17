import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ABILITIES, MOVESETS } from '../../abilities';
import type { MatchPlayerState } from '../../matchState';
import { stepMeleeHits, type HitSystemHost } from '../hits';

function player(overrides: Partial<MatchPlayerState> = {}): MatchPlayerState {
  return {
    slot: 0,
    team: 'red',
    pokemonId: '0133',
    alive: true,
    hp: 1000,
    maxHp: 1000,
    x: 0,
    z: 0,
    facing: 0,
    hitRadius: 0.4,
    ...overrides
  } as unknown as MatchPlayerState;
}

test('un golpe con hitCount reparte la potencia y aplica control una vez', () => {
  const attacker = player();
  const target = player({ slot: 1, team: 'blue', z: 1 });
  const ultimate = ABILITIES[MOVESETS['0133'][3] as string];
  const def = { ...ultimate, hitCount: 3 };
  const hits = [{ attacker, target, def }];
  const powers: number[] = [];
  const controls: boolean[] = [];

  const host = {
    takeInstantHits: () => [],
    takeMeleeHits: () => hits,
    world: { colliders: [] },
    combatFx: { spawnHit: () => {} },
    isMatchOver: () => false,
    canHit: (a: MatchPlayerState, b: MatchPlayerState) => a.team !== b.team,
    dashSweepHits: () => true,
    applyAbilityDamage: (
      _a: MatchPlayerState,
      _b: MatchPlayerState,
      _def: typeof def,
      options?: { power?: number; control?: boolean }
    ) => {
      powers.push(options?.power ?? _def.power);
      controls.push(options?.control ?? true);
      return false;
    },
    applyKnockback: () => {},
    cancelCast: () => {}
  } as unknown as HitSystemHost;

  stepMeleeHits(host);

  assert.deepEqual(powers, [
    ultimate.power / 3,
    ultimate.power / 3,
    ultimate.power / 3
  ]);
  assert.deepEqual(controls, [true, false, false]);
});
