import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABILITIES,
  aoeAbility,
  meleeAbility,
  projectileAbility,
  type AbilityHitInput,
  type AoeAbilityDef
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
import { stepActiveAoes, type AoeSystemHost } from '../aoes.ts';
import { aoeAreaFrom, aoeContains } from '../../aoeGeometry.ts';
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
    def: { props: { slow: null, status: null } },
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
    dirZ: 1,
    originDirX: 0,
    originDirZ: 1
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

test('el cono de Fuego Sagrado gira con el apuntado y se limita a ±15°', () => {
  const def = ABILITIES['fuegoSagrado'];
  assert.equal(def.shape, 'aoe');
  if (def.shape !== 'aoe' || !def.aoeMovement) {
    assert.fail('Fuego Sagrado debe declarar aoeMovement');
  }

  const move = (aimYaw: number) =>
    def.aoeMovement!({
      caster: { x: 0, z: 0, facing: 0, aimYaw },
      def,
      originX: 0,
      originZ: 1,
      dirX: 0,
      dirZ: 1,
      duration: def.aoeDuration,
      elapsed: 0.5
    });

  const small = move(Math.PI / 36); // 5°
  assert.ok(Math.abs((small.dirX ?? 0) - Math.sin(Math.PI / 36)) < 1e-6);
  assert.ok(Math.abs((small.dirZ ?? 0) - Math.cos(Math.PI / 36)) < 1e-6);

  const clamped = move(Math.PI / 2); // 90° de apuntado
  assert.ok(Math.abs((clamped.dirX ?? 0) - Math.sin(15 * Math.PI / 180)) < 1e-6);
  assert.ok(Math.abs((clamped.dirZ ?? 0) - Math.cos(15 * Math.PI / 180)) < 1e-6);
  // El vértice sigue al lanzador: solo cambia el eje del abanico.
  assert.equal(clamped.x, 0);
  assert.equal(clamped.z, 0);
});

test('stepActiveAoes aplica la dirección devuelta por aoeMovement', () => {
  const owner = player(0, 0, 0, 'red');
  const def = aoeAbility('prueba-giro', 'Prueba', 'Normal', 'special', defaultAoeResolve)
    .area('ring', 'overtime-global', 2, 1)
    .range(0)
    .radius(2)
    .aoeMovement(() => ({ x: 0, z: 0, dirX: 3, dirZ: 0 }))
    .build();
  const seen: Array<{ x: number; z: number; dirX: number; dirZ: number }> = [];
  const aoe: ActiveAoe = {
    owner,
    def,
    x: 0,
    z: 0,
    radius: 2,
    shape: 'cone',
    halfAngle: 30 * (Math.PI / 180),
    elapsed: 0,
    duration: 2,
    tickInterval: 1,
    tickTimer: 0,
    tick: 0,
    flatBonusApplied: new Set(),
    movement: def.aoeMovement,
    originX: 0,
    originZ: 0,
    dirX: 0,
    dirZ: 1,
    originDirX: 0,
    originDirZ: 1,
    moveVisual: (x, z, dirX, dirZ) => seen.push({ x, z, dirX, dirZ })
  };
  const host = {
    activeAoes: [aoe],
    pendingAoeEnds: [],
    isMatchOver: () => false,
    resolveAoeHit: () => {},
    tickAoeTargets: () => {},
    emitAoeEvent: () => {}
  } as unknown as AoeSystemHost;

  stepActiveAoes(host, 0.1);

  // La dirección se normaliza antes de llegar a la geometría y a las vistas.
  assert.ok(Math.abs(aoe.dirX - 1) < 1e-9);
  assert.ok(Math.abs(aoe.dirZ) < 1e-9);
  const seenDir = seen.at(-1);
  assert.ok(seenDir);
  assert.equal(seenDir.x, 0);
  assert.equal(seenDir.z, 0);
  assert.ok(Math.abs(seenDir.dirX - 1) < 1e-9);
  assert.ok(Math.abs(seenDir.dirZ) < 1e-9);
});

test('aoeTurnRate interpola el giro en vez de saltar al objetivo', () => {
  const owner = player(0, 0, 0, 'red');
  const def = aoeAbility(
    'prueba-giro-suave',
    'Prueba',
    'Normal',
    'special',
    defaultAoeResolve
  )
    .area('ring', 'overtime-global', 2, 1)
    .range(0)
    .radius(2)
    .aoeMovement(() => ({ x: 0, z: 0, dirX: 1, dirZ: 0 }))
    .aoeTurnRate(90)
    .build();
  const aoe: ActiveAoe = {
    owner,
    def,
    x: 0,
    z: 0,
    radius: 2,
    shape: 'cone',
    halfAngle: 30 * (Math.PI / 180),
    elapsed: 0,
    duration: 2,
    tickInterval: 1,
    tickTimer: 0,
    tick: 0,
    flatBonusApplied: new Set(),
    movement: def.aoeMovement,
    originX: 0,
    originZ: 0,
    dirX: 0,
    dirZ: 1,
    originDirX: 0,
    originDirZ: 1
  };
  const host = {
    activeAoes: [aoe],
    pendingAoeEnds: [],
    isMatchOver: () => false,
    resolveAoeHit: () => {},
    tickAoeTargets: () => {},
    emitAoeEvent: () => {}
  } as unknown as AoeSystemHost;

  const degrees = () => (Math.atan2(aoe.dirX, aoe.dirZ) * 180) / Math.PI;

  // 90°/s durante 0,5 s: avanza 45°, no salta a los 90° del objetivo.
  stepActiveAoes(host, 0.5);
  assert.ok(Math.abs(degrees() - 45) < 1e-6);
  stepActiveAoes(host, 0.5);
  assert.ok(Math.abs(degrees() - 90) < 1e-6);
});

test('un área con varios círculos golpea la unión y respeta el hueco', () => {
  const owner = player(0, 0, 0, 'red');
  const left = player(1, -4, 0);
  const middle = player(2, 0, 0);
  const right = player(3, 4, 0);
  const hits: number[] = [];
  const def = aoeAbility(
    'prueba-multi',
    'Prueba',
    'Normal',
    'special',
    ({ targets }) => {
      for (const target of targets) {
        hits.push((target.player as unknown as MatchPlayerState).slot);
      }
    }
  )
    .area('ring', 'overtime-global', 1, 0.5)
    .range(0)
    .radius(1)
    .aoeCircles([
      { offsetX: -4, offsetZ: 0 },
      { offsetX: 4, offsetZ: 0 }
    ])
    .build();
  const aoe: ActiveAoe = {
    owner,
    def,
    x: 0,
    z: 0,
    radius: 1,
    shape: 'circle',
    halfAngle: 0,
    elapsed: 0,
    duration: 1,
    tickInterval: 0.5,
    tickTimer: 0,
    tick: 0,
    flatBonusApplied: new Set(),
    originX: 0,
    originZ: 0,
    dirX: 0,
    dirZ: 1,
    originDirX: 0,
    originDirZ: 1
  };
  const host = {
    matchPlayers: [owner, left, middle, right],
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

  tickAoeTargets(host, aoe, 0.1);

  // Los dos discos laterales golpean; el centro del patrón queda vacío.
  assert.deepEqual(hits.sort(), [1, 3]);
});

/** Los círculos de un patrón no deben solaparse entre sí. */
function assertCirclesSeparated(def: AoeAbilityDef): void {
  for (let a = 0; a < def.aoeCircles.length; a++) {
    for (let b = a + 1; b < def.aoeCircles.length; b++) {
      const first = def.aoeCircles[a];
      const second = def.aoeCircles[b];
      const distance = Math.hypot(
        first.offsetX - second.offsetX,
        first.offsetZ - second.offsetZ
      );
      assert.ok(
        distance > (first.radius ?? def.radius) + (second.radius ?? def.radius),
        `${def.id}: los círculos ${a} y ${b} se solapan`
      );
    }
  }
}

test('Ciclón separa sus vórtices y los gira mientras avanza', () => {
  const def = ABILITIES.ciclon;
  assert.equal(def.shape, 'aoe');
  if (def.shape !== 'aoe') return;

  // Los tres discos del patrón no se solapan entre sí.
  const circles = def.aoeCircles;
  assert.equal(circles.length, 3);
  assertCirclesSeparated(def);

  // El hueco central queda como ojo: no lo cubre ningún vórtice.
  const eye = aoeAreaFrom(def, 0, 0, 0, 1);
  assert.equal(aoeContains(eye, 0, 0, 0), false);
  assert.equal(
    aoeContains(eye, circles[0].offsetX, circles[0].offsetZ, 0),
    true
  );

  // El movimiento devuelve una dirección distinta en cada instante: el patrón
  // orbita mientras el centro avanza.
  const context = {
    caster: player(0, 0, 0, 'red'),
    def,
    originX: 0,
    originZ: 0,
    dirX: 0,
    dirZ: 1,
    duration: 2.5,
    elapsed: 0.5
  };
  assert.ok(def.aoeMovement);
  const first = def.aoeMovement(context);
  const second = def.aoeMovement({ ...context, elapsed: 1 });
  assert.ok(first.dirX !== undefined && first.dirZ !== undefined);
  assert.ok(second.dirX !== undefined && second.dirZ !== undefined);
  // 2 rad/s: entre 0,5 s y 1 s el eje gira 1 rad.
  const angleOf = (value: { dirX?: number; dirZ?: number }) =>
    Math.atan2(value.dirX ?? 0, value.dirZ ?? 1);
  assert.ok(Math.abs(angleOf(second) - angleOf(first) - 1) < 1e-9);
});

test('Trueno separa sus tres impactos y cubre el punto marcado', () => {
  const def = ABILITIES.trueno;
  assert.equal(def.shape, 'aoe');
  if (def.shape !== 'aoe') return;
  assert.equal(def.aoeCircles.length, 3);
  assertCirclesSeparated(def);
  // El impacto principal está centrado en el punto marcado, así que apuntar al
  // rival sigue golpeándolo al 100 %.
  const area = aoeAreaFrom(def, 0, 0, 0, 1);
  assert.equal(aoeContains(area, 0, 0, 0.42), true);
});
