import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABILITIES,
  aoeAbility,
  meleeAbility,
  projectileAbility,
  type AbilityHitInput
} from '../../abilities.ts';
import {
  defaultAoeResolve,
  defaultMeleeResolve
} from '../../abilityResolve.ts';
import {
  resolveAbility,
  type AbilityResolveHost
} from '../abilityResolve.ts';
import { tickAoeTargets, type AoeResolutionHost } from '../aoeResolution.ts';
import type { AbilityResolveContext } from '../../core/abilities/resolve.ts';
import type { AnyAbilityDef, AoePlayer } from '../../abilities.ts';
import { CONFIG } from '../../config.ts';
import type { ActiveAoe, MatchPlayerState } from '../../matchState.ts';
import type { World } from '../../world.ts';

function player(
  slot: number,
  x: number,
  z: number,
  team: 'red' | 'blue' = 'blue'
): MatchPlayerState {
  return {
    slot,
    x,
    z,
    team,
    alive: true,
    hitRadius: 0.3,
    hp: 100,
    maxHp: 100,
    stunTimer: 0,
    buffs: []
  } as unknown as MatchPlayerState;
}

const world = { colliders: [] } as unknown as World;

test('el builder rellena props por defecto y exige resolución', () => {
  const def = meleeAbility(
    'prueba-melee',
    'Prueba',
    'Normal',
    'physical',
    defaultMeleeResolve
  )
    .power(40)
    .range(1.5)
    .halfAngle(60)
    .build();

  assert.equal(def.shape, 'melee');
  assert.equal(def.props.power, 40);
  assert.equal(def.props.hitstun, CONFIG.combat.hitstunSeconds);
  assert.equal(def.props.knockback, 0);
  assert.equal(typeof def.resolve, 'function');
});

test('las props extra fluyen tipadas a la resolución', () => {
  let charges = 0;
  const def = projectileAbility<{ charges: number }>(
    'prueba-props',
    'Prueba',
    'Normal',
    'special',
    ({ def: resolved }) => {
      charges = resolved.props.charges;
    }
  )
    .props({ charges: 3 })
    .range(4)
    .build();

  const target = player(1, 1, 0);
  const input: AbilityHitInput<MatchPlayerState, typeof def> = {
    owner: player(0, 0, 0, 'red'),
    def,
    x: 0,
    z: 0,
    radius: 0.2,
    shape: 'circle',
    dirX: 1,
    dirZ: 0,
    halfAngle: 0,
    mode: 'once',
    tick: 0,
    elapsed: 0,
    power: def.props.power,
    targets: [
      {
        player: target,
        distance: 1,
        radialMultiplier: 1,
        damagePower: def.props.power,
        isAlly: false,
        isEnemy: true,
        isSelf: false,
        lineOfSight: true,
        hittable: true
      }
    ]
  };
  const host = {
    matchPlayers: [input.owner, target],
    world,
    isMatchOver: () => false
  } as unknown as AbilityResolveHost;
  resolveAbility(host, input);
  assert.equal(charges, 3);
});

test('defaultAoeResolve deja control solo en los golpes únicos', () => {
  const controls: Array<boolean | undefined> = [];
  const context = {
    mode: 'once',
    power: 10,
    isMatchOver: () => false,
    def: { props: { slow: null, dot: null } },
    targets: [
      {
        hittable: true,
        lineOfSight: true
      }
    ],
    applyHit: (
      _target: unknown,
      options?: { control?: boolean }
    ) => {
      controls.push(options?.control);
      return true;
    }
  } as unknown as AbilityResolveContext<AoePlayer, AnyAbilityDef>;

  defaultAoeResolve(context);
  context.mode = 'overtime-global';
  defaultAoeResolve(context);
  context.mode = 'overtime-target';
  defaultAoeResolve(context);

  assert.deepEqual(controls, [true, false, false]);
});

test('overtime-target alinea el tick al entrar y lo reinicia al salir', () => {
  const owner = player(0, 0, 0, 'red');
  const enemy = player(1, 1, 0);
  const ticks: Array<{ slot: number; tick: number; elapsed: number }> = [];
  const def = aoeAbility(
    'prueba-target',
    'Prueba',
    'Normal',
    'special',
    ({ targets, applyHit }) => {
      for (const target of targets) {
        ticks.push({
          slot: (target.player as unknown as MatchPlayerState).slot,
          tick: target.tick ?? 0,
          elapsed: target.elapsed ?? 0
        });
        applyHit(target, { control: false });
      }
    }
  )
    .area('ring', 'overtime-target', 2, 0.5)
    .range(0)
    .radius(3)
    .build();

  const aoe: ActiveAoe = {
    owner,
    def,
    x: 0,
    z: 0,
    radius: 3,
    shape: 'circle',
    halfAngle: 0,
    elapsed: 0,
    duration: 2,
    tickInterval: 0.5,
    tickTimer: 0,
    tick: 0,
    flatBonusApplied: new Set(),
    originX: 0,
    originZ: 0,
    dirX: 0,
    dirZ: 1
  };

  const host = {
    combatFx: { spawnBuff: () => {}, spawnHeal: () => {} },
    matchPlayers: [owner, enemy],
    world,
    isMatchOver: () => false,
    canHit: (attacker: MatchPlayerState, target: MatchPlayerState) =>
      target !== attacker && target.alive && target.team !== attacker.team,
    applyAbilityDamage: () => true,
    interruptWithRefund: () => {},
    applyKnockback: () => {},
    applySlow: () => {},
    reviveAoeAlly: () => false,
    showHealPopup: () => {},
    awardXp: () => {},
    pendingAoeEnds: []
  } as unknown as AoeResolutionHost;

  const step = (dt: number) => {
    aoe.elapsed += dt;
    tickAoeTargets(host, aoe, dt);
  };

  // Primer tick inmediato al entrar, después cada 0,5 s.
  step(0.25);
  step(0.25);
  step(0.25);
  step(0.25);
  assert.deepEqual(
    ticks.filter((entry) => entry.slot === 1).map((entry) => entry.tick),
    [0, 1, 2]
  );

  // Al salir se descarta el estado y una reentrada empieza de cero.
  enemy.x = 10;
  step(0.25);
  enemy.x = 1;
  step(0.25);
  assert.equal(ticks.filter((entry) => entry.slot === 1).at(-1)?.tick, 0);
});

test('el golpe de proyectil agrupa los impactos del tramo en una lista', () => {
  const seen: number[] = [];
  const def = projectileAbility(
    'prueba-proyectil',
    'Prueba',
    'Normal',
    'special',
    ({ targets }) => {
      for (const target of targets) seen.push((target.player as unknown as MatchPlayerState).slot);
    }
  )
    .range(5)
    .build();
  const owner = player(0, 0, 0, 'red');
  const first = player(1, 1, 0);
  const second = player(2, 2, 0);
  const input: AbilityHitInput<MatchPlayerState, typeof def> = {
    owner,
    def,
    x: 0,
    z: 0,
    radius: 0.2,
    shape: 'circle',
    dirX: 1,
    dirZ: 0,
    halfAngle: 0,
    mode: 'once',
    tick: 0,
    elapsed: 0,
    power: def.props.power,
    targets: [first, second].map((target, index) => ({
      player: target,
      distance: index + 1,
      radialMultiplier: 1,
      damagePower: def.props.power,
      isAlly: false,
      isEnemy: true,
      isSelf: false,
      lineOfSight: true,
      hittable: true
    }))
  };
  const host = {
    matchPlayers: [owner, first, second],
    world,
    isMatchOver: () => false
  } as unknown as AbilityResolveHost;
  resolveAbility(host, input);
  assert.deepEqual(seen, [1, 2]);
});

test('defaultMeleeResolve ignora objetivos sin línea de visión', () => {
  const hits: number[] = [];
  const context = {
    targets: [
      { player: { slot: 1 }, hittable: true, lineOfSight: false },
      { player: { slot: 2 }, hittable: true, lineOfSight: true }
    ],
    isMatchOver: () => false,
    applyHit: (target: { player: { slot: number } }) => {
      hits.push((target.player as unknown as MatchPlayerState).slot);
      return true;
    }
  } as unknown as AbilityResolveContext<AoePlayer, AnyAbilityDef>;
  defaultMeleeResolve(context);
  assert.deepEqual(hits, [2]);
});

test('las áreas de apoyo declaran su perfil de bot', () => {
  assert.equal(ABILITIES['recuperacion'].bot?.healAllies, true);
  assert.equal(ABILITIES['recuperacionHoOh'].bot?.healAllies, true);
  assert.equal(ABILITIES['deseo'].bot?.revive, true);
});
