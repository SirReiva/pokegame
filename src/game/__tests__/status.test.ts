import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addShield,
  createCombatStatus,
  resistControl,
  shieldTotal,
  SHIELD_CAP_FRACTION
} from '../core/combat/status.ts';
import { POKEDEX_PROFILES } from '../core/pokedex.ts';
import { ABILITIES, MOVESETS } from '../abilities.ts';
import { MimicLog, scaleCopiedAbility } from '../sim/mimic.ts';
import {
  EEVEE_AGILITY,
  EEVEE_POWER,
  EEVEE_RESILIENCE,
  adjustEeveeAbility,
  cycleEeveeStance,
  scheduleEeveeShield,
  stepEeveeStance
} from '../sim/stances.ts';
import { resolveEchoBeam } from '../sim/echo.ts';
import {
  PASSIVES,
  adjustRayquazaCurrent,
  applyPassiveIncomingDamage,
  passiveBlocksKnockback
} from '../passives.ts';
import {
  applyDot,
  applyMark,
  applyRoot,
  controlDurationMultiplier,
  stepStatusEffects,
  type StatusEffectHost
} from '../statusEffects.ts';
import type { MatchPlayerState } from '../matchState.ts';
import type { CombatFxPort } from '../core/ports/fx.ts';
import type { World } from '../world.ts';

function makePlayer(overrides: Partial<MatchPlayerState> = {}): MatchPlayerState {
  return {
    slot: 0,
    team: 'red',
    pokemonId: '0001',
    alive: true,
    hp: 1000,
    maxHp: 1000,
    x: 0,
    z: 0,
    facing: 0,
    buffs: [],
    slowEffects: [],
    damageReduction: 0,
    damageReductionTimer: 0,
    shieldSpeedMultiplier: 1,
    abilityHealing: 0,
    status: createCombatStatus(),
    ...overrides
  } as unknown as MatchPlayerState;
}

test('los escudos se suman y respetan el tope global', () => {
  const player = makePlayer();
  const first = addShield(player.status, 200, 5, 0, player.maxHp);
  const second = addShield(player.status, 400, 5, 0, player.maxHp);
  assert.equal(first, 200);
  assert.equal(second, player.maxHp * SHIELD_CAP_FRACTION - 200);
  assert.equal(
    shieldTotal(player.status),
    player.maxHp * SHIELD_CAP_FRACTION
  );
});

test('la resistencia progresiva reduce cada control consecutivo', () => {
  const status = createCombatStatus();
  const first = resistControl(status, 1);
  const second = resistControl(status, 1);
  const third = resistControl(status, 1);
  assert.equal(first, 1);
  assert.ok(second < first);
  assert.ok(third < second);
  assert.ok(third >= 0.4);
});

test('una marca detona al llegar al máximo y deja inmunidad', () => {
  const target = makePlayer({ pokemonId: '0025' });
  const source = makePlayer({ slot: 1, team: 'blue' });
  const spec = {
    id: 'prueba',
    maxStacks: 2,
    duration: 4,
    immunityAfter: 5,
    burst: { damage: 30 }
  };

  applyMark(target, spec, source, 10);
  assert.equal(target.status.marks.length, 1);
  assert.equal(target.status.pendingBursts.length, 0);

  applyMark(target, spec, source, 10.5);
  assert.equal(target.status.marks.length, 0);
  assert.equal(target.status.pendingBursts.length, 1);
  assert.equal(target.status.markImmunity.get('prueba'), 15.5);

  // Durante la inmunidad no se vuelve a aplicar.
  applyMark(target, spec, source, 12);
  assert.equal(target.status.marks.length, 0);
});

test('el DoT se renueva en vez de acumular instancias', () => {
  const target = makePlayer();
  const source = makePlayer({ slot: 1, team: 'blue' });
  const dot = { id: 'quemadura', power: 10, duration: 3 };

  applyDot(target, dot, source);
  applyDot(target, { ...dot, power: 20, duration: 5 }, source);

  assert.equal(target.status.dots.length, 1);
  assert.equal(target.status.dots[0].powerPerSecond, 20);
  assert.equal(target.status.dots[0].remaining, 5);
});

function makeHost(
  players: readonly MatchPlayerState[],
  fireCloneShot: StatusEffectHost['fireCloneShot'] = () => {}
): StatusEffectHost {
  return {
    isMatchOver: () => false,
    now: () => 1,
    players: () => players,
    playerBySlot: (slot) => players.find((player) => player.slot === slot) ?? null,
    damage: () => {},
    heal: () => {},
    applySlow: () => {},
    applyBuff: () => {},
    fireCloneShot,
    spawnCloneVisual: () => {},
    resolveEchoBeam: () => {}
  };
}

test('el clon de Greninja dispara una réplica y desaparece', () => {
  const greninja = makePlayer({ pokemonId: '0658', facing: 0 });
  const enemy = makePlayer({
    slot: 1,
    team: 'blue',
    pokemonId: '0025',
    x: 4,
    z: 0
  });
  const def = ABILITIES.sombraVil;

  PASSIVES['0658'].onAbilityCast?.({
    player: greninja,
    def,
    time: 0,
    players: [greninja, enemy],
    host: makeHost([greninja, enemy]),
    dirX: 1,
    dirZ: 0
  });
  assert.equal(greninja.status.clones.length, 1);

  let fired = 0;
  stepStatusEffects([greninja], 0.5, makeHost([greninja, enemy], (clone) => {
    fired += 1;
    // El clon apunta al rival cercano y dispara desde el origen.
    assert.ok(clone.dirX > 0.9);
    assert.equal(clone.x, 0);
  }));
  assert.equal(fired, 1);
  assert.equal(greninja.status.clones[0]?.fired, true);

  stepStatusEffects([greninja], 0.3, makeHost([greninja, enemy]));
  assert.equal(greninja.status.clones.length, 0);
});

test('Sincronía devuelve el 50 % del control y respeta su enfriamiento', () => {
  const mew = makePlayer({ pokemonId: '0151' });
  const attacker = makePlayer({ slot: 1, team: 'blue' });

  applyRoot(mew, 2, attacker, 10);
  assert.equal(mew.status.rootTimer, 2);
  assert.equal(attacker.status.rootTimer, 1);

  // Dentro de los 8 s no vuelve a reflejar; el atacante conserva su raíz.
  applyRoot(mew, 2, attacker, 12);
  assert.equal(attacker.status.rootTimer, 1);

  // Pasado el enfriamiento y ya sin la raíz anterior, vuelve a reflejar.
  attacker.status.rootTimer = 0;
  attacker.status.controlStacks = 0;
  applyRoot(mew, 2, attacker, 19);
  assert.ok(attacker.status.rootTimer > 0);
});

test('Arcanine intimida en aura con enfriamiento por rival', () => {
  const arcanine = makePlayer({ pokemonId: '0059' });
  const near = makePlayer({ slot: 1, team: 'blue', x: 2, z: 0 });
  const far = makePlayer({ slot: 2, team: 'blue', x: 10, z: 0 });
  const context = {
    player: arcanine,
    other: near,
    damage: 20,
    def: ABILITIES.mordisco,
    players: [arcanine, near, far]
  };

  PASSIVES['0059'].onDirectHit?.({ ...context, time: 0 });
  assert.ok(
    near.buffs.some(
      (buff) => buff.stat === 'attack' && buff.source === 'intimidacion:0'
    )
  );
  assert.equal(far.buffs.length, 0);

  near.buffs = [];
  PASSIVES['0059'].onDirectHit?.({ ...context, time: 2 });
  assert.equal(near.buffs.length, 0);

  PASSIVES['0059'].onDirectHit?.({ ...context, time: 20 });
  assert.ok(
    near.buffs.some((buff) => buff.source === 'intimidacion:0')
  );
});

test('Moltres deja estela en el dash y en el impacto de la definitiva', () => {
  const moltres = makePlayer({ pokemonId: '0146' });
  PASSIVES['0146'].onAbilityCast?.({
    player: moltres,
    def: ABILITIES.tajoAereo,
    time: 0,
    players: [moltres],
    host: makeHost([moltres]),
    dirX: 1,
    dirZ: 0
  });
  assert.equal(moltres.status.zones.length, 3);
  assert.ok(moltres.status.zones.every((zone) => zone.damagePerSecond === 15));
  assert.ok(moltres.status.zones.every((zone) => zone.x > 0));

  const celeste = makePlayer({ pokemonId: '0146', slot: 1 });
  PASSIVES['0146'].onAbilityCast?.({
    player: celeste,
    def: ABILITIES.ataqueCeleste,
    time: 0,
    players: [celeste],
    host: makeHost([celeste]),
    targetX: 5,
    targetZ: -2
  });
  assert.equal(celeste.status.zones.length, 1);
  assert.equal(celeste.status.zones[0].x, 5);
  assert.equal(celeste.status.zones[0].z, -2);
});

test('Kyogre crea el charco en el punto de la habilidad', () => {
  const kyogre = makePlayer({ pokemonId: '0382' });
  PASSIVES['0382'].onAbilityCast?.({
    player: kyogre,
    def: ABILITIES.remolinoMarino,
    time: 0,
    players: [kyogre],
    host: makeHost([kyogre]),
    targetX: 4,
    targetZ: -2
  });
  assert.equal(kyogre.status.zones.length, 1);
  assert.equal(kyogre.status.zones[0].x, 4);
  assert.equal(kyogre.status.zones[0].z, -2);
});

test('Ceniza Viva también se activa al asistir', () => {
  const hoOh = makePlayer({ pokemonId: '0250', hp: 500 });
  const victim = makePlayer({ slot: 1, team: 'blue' });
  PASSIVES['0250'].onAssist?.({ player: hoOh, victim, time: 3 });
  assert.equal(hoOh.hp, 620);
  assert.ok(hoOh.damageReductionTimer > 0);
});

test('la detonación de una marca se resuelve en el paso de estados', () => {
  const target = makePlayer({ pokemonId: '0025' });
  const source = makePlayer({ slot: 1, team: 'blue' });
  const spec = {
    id: 'detonacion',
    maxStacks: 1,
    duration: 4,
    burst: { damage: 30 }
  };
  applyMark(target, spec, source, 1);

  const damage: number[] = [];
  stepStatusEffects([target], 0.016, {
    isMatchOver: () => false,
    now: () => 1,
    players: () => [target, source],
    playerBySlot: (slot) => (slot === 1 ? source : target),
    damage: (_target, amount) => damage.push(amount),
    heal: () => {},
    applySlow: () => {},
    applyBuff: () => {},
    fireCloneShot: () => {},
    spawnCloneVisual: () => {},
    resolveEchoBeam: () => {}
  });

  assert.deepEqual(damage, [30]);
  assert.equal(target.status.pendingBursts.length, 0);
});

test('las 28 especies tienen pasiva', () => {
  assert.equal(Object.keys(PASSIVES).length, 28);
  for (const pokemonId of Object.keys(POKEDEX_PROFILES)) {
    assert.ok(PASSIVES[pokemonId], `${pokemonId} sin pasiva`);
  }
});

test('las placas de Onix absorben daño y Groudon ignora empujes', () => {
  const onix = makePlayer({ pokemonId: '0095' });
  const attacker = makePlayer({ slot: 1, team: 'blue' });
  const damage = applyPassiveIncomingDamage(
    onix,
    attacker,
    220,
    null,
    1,
    [onix, attacker]
  );
  assert.equal(damage, 40);
  assert.equal(onix.status.passive.stacks, 0);

  const groudon = makePlayer({ pokemonId: '0383' });
  assert.equal(passiveBlocksKnockback(groudon), true);
  assert.equal(passiveBlocksKnockback(onix), false);
});

test('Mímica guarda solo habilidades rivales copiables y las escala al 70 %', () => {
  const log = new MimicLog();
  const mew = makePlayer({ pokemonId: '0151' });
  const enemy = makePlayer({
    slot: 1,
    team: 'blue',
    pokemonId: '0025',
    x: 5,
    z: 0
  });
  const ally = makePlayer({ slot: 2, team: 'red', pokemonId: '0001', x: 1 });

  log.record(ABILITIES.impactrueno, 0, enemy, 10, [mew, enemy, ally]);
  assert.equal(mew.status.copiedAbility?.id, ABILITIES.impactrueno.id);
  assert.equal(ally.status.copiedAbility, null);

  // Mímica no se copia a sí misma ni registra una definitiva.
  log.record(ABILITIES.mimica, 1, enemy, 11, [mew]);
  log.record(ABILITIES.rayoSolar, 3, enemy, 11, [mew]);
  assert.equal(mew.status.copiedAbility?.id, ABILITIES.impactrueno.id);

  // Un rival fuera de 12 u no actualiza la copia.
  const far = makePlayer({
    slot: 3,
    team: 'blue',
    pokemonId: '0025',
    x: 30,
    z: 0
  });
  log.record(ABILITIES.rayoSolar, 1, far, 12, [mew, far]);
  assert.equal(mew.status.copiedAbility?.id, ABILITIES.impactrueno.id);

  const scaled = scaleCopiedAbility(ABILITIES.rayoSolar);
  assert.equal(scaled.range, ABILITIES.rayoSolar.range);
  assert.ok(scaled.power < ABILITIES.rayoSolar.power);
  assert.equal(scaled.slow, null);
  assert.equal(scaled.startup < ABILITIES.rayoSolar.startup, true);
});

test('Adaptabilidad cambia de estado y ajusta las habilidades de Eevee', () => {
  const eevee = makePlayer({ pokemonId: '0133' });
  const moveset = MOVESETS['0133'];
  const rapid = ABILITIES[moveset[2] as string];
  const ultimate = ABILITIES[moveset[3] as string];

  assert.equal(cycleEeveeStance(eevee), EEVEE_AGILITY);
  assert.equal(cycleEeveeStance(eevee), EEVEE_RESILIENCE);
  assert.equal(cycleEeveeStance(eevee), EEVEE_POWER);

  eevee.status.passive.value = EEVEE_AGILITY;
  const agileRapid = adjustEeveeAbility(eevee, rapid);
  assert.ok(agileRapid.dashDistance > rapid.dashDistance);
  const agileUlt = adjustEeveeAbility(eevee, ultimate);
  assert.equal(agileUlt.hitCount, 3);
  assert.equal(agileUlt.power, ultimate.power);

  eevee.status.passive.value = EEVEE_POWER;
  const powerRapid = adjustEeveeAbility(eevee, rapid);
  assert.ok(powerRapid.power > rapid.power);
  const powerUlt = adjustEeveeAbility(eevee, ultimate);
  assert.ok(powerUlt.power > ultimate.power);

  // Resistencia deja un escudo al terminar Ataque Rápido.
  eevee.status.passive.value = EEVEE_RESILIENCE;
  scheduleEeveeShield(eevee, rapid, 0.06);
  stepEeveeStance(eevee, 5);
  assert.ok(shieldTotal(eevee.status) > 0);
  assert.ok(
    eevee.buffs.some((buff) => buff.stat === 'defense')
  );
});

test('Agua Purificadora reduce el control de Suicune y sus aliados cercanos', () => {
  const suicune = makePlayer({ pokemonId: '0245', x: 0, z: 0 });
  const ally = makePlayer({
    slot: 1,
    team: 'red',
    pokemonId: '0001',
    x: 3,
    z: 0
  });
  const farAlly = makePlayer({
    slot: 2,
    team: 'red',
    pokemonId: '0001',
    x: 10,
    z: 0
  });
  const enemy = makePlayer({ slot: 3, team: 'blue' });
  const players = [suicune, ally, farAlly, enemy];

  assert.equal(controlDurationMultiplier(ally, players), 0.75);
  assert.equal(controlDurationMultiplier(farAlly, players), 1);
  assert.equal(controlDurationMultiplier(suicune, players), 0.75);

  applyRoot(ally, 2, enemy, 1, players);
  assert.equal(ally.status.rootTimer, 1.5);
  applyRoot(farAlly, 2, enemy, 1, players);
  assert.equal(farAlly.status.rootTimer, 2);
});

test('el eco de Rayo Solar repite la línea sin control ni marcas', () => {
  const celebi = makePlayer({ pokemonId: '0251', x: 0, z: 0 });
  const enemy = makePlayer({
    slot: 1,
    team: 'blue',
    pokemonId: '0001',
    x: 5,
    z: 0
  });
  const host = makeHost([celebi, enemy]);

  PASSIVES['0251'].onAbilityCast?.({
    player: celebi,
    def: ABILITIES.rayoSolar,
    time: 0,
    players: [celebi, enemy],
    host,
    targetX: 9.5,
    targetZ: 0,
    dirX: 1,
    dirZ: 0
  });

  assert.equal(celebi.status.echoBeams.length, 1);
  const echo = celebi.status.echoBeams[0];
  assert.ok(echo.damage > 0);
  assert.equal(echo.def.slow, null);
  assert.equal(echo.def.marks.length, 0);

  let hits = 0;
  const fx = { spawnBeam: () => {} } as unknown as CombatFxPort;
  resolveEchoBeam(echo, {
    combatFx: fx,
    world: { colliders: [] } as unknown as World,
    players: () => [celebi, enemy],
    playerBySlot: (slot) => (slot === 0 ? celebi : enemy),
    canHit: (attacker, target) => attacker.team !== target.team,
    applyAbilityDamage: (_attacker, _target, def, options) => {
      hits += 1;
      assert.equal(options.control, false);
      assert.equal(def.slow, null);
    }
  });
  assert.equal(hits, 1);
});

test('Corriente Celeste solo potencia la siguiente habilidad Dragón no básica', () => {
  const rayquaza = makePlayer({ pokemonId: '0384' });
  const moveset = MOVESETS['0384'];
  const basic = ABILITIES[moveset[0] as string];
  const dash = ABILITIES[moveset[1] as string];
  const dragon = ABILITIES[moveset[2] as string];
  const host = makeHost([rayquaza]);

  PASSIVES['0384'].onAbilityCast?.({
    player: rayquaza,
    def: dash,
    time: 0,
    players: [rayquaza],
    host
  });
  assert.equal(rayquaza.status.passive.flag, true);
  assert.equal(rayquaza.status.passive.stacks, 1);
  assert.equal(rayquaza.status.passive.readyAt, 4);

  // El básico Dragón ni consume ni recibe el bonus.
  const basicAdjusted = adjustRayquazaCurrent(rayquaza, basic);
  assert.equal(basicAdjusted.power, basic.power);
  assert.equal(rayquaza.status.passive.stacks, 1);

  // La siguiente habilidad Dragón no básica consume la carga y escala.
  const dragonAdjusted = adjustRayquazaCurrent(rayquaza, dragon);
  assert.equal(dragonAdjusted.power, dragon.power * 1.25);
  assert.equal(rayquaza.status.passive.stacks, 0);
  assert.equal(rayquaza.status.passive.magnitude, 1);

  // Una habilidad no Dragón no consume ni recibe nada.
  const dashAdjusted = adjustRayquazaCurrent(rayquaza, dash);
  assert.equal(dashAdjusted.power, dash.power);

  // Si la habilidad potenciada impacta, Corriente se renueva.
  PASSIVES['0384'].onDirectHit?.({
    player: rayquaza,
    other: makePlayer({ slot: 1, team: 'blue' }),
    damage: 100,
    def: dragon,
    time: 1,
    players: [rayquaza]
  });
  assert.equal(rayquaza.status.passive.flag, true);
  assert.equal(rayquaza.status.passive.stacks, 1);
  assert.equal(rayquaza.status.passive.readyAt, 5);

  PASSIVES['0384'].onTick?.({
    player: rayquaza,
    time: 10,
    dt: 0.016,
    host
  });
  assert.equal(rayquaza.status.passive.flag, false);
  assert.equal(rayquaza.status.passive.stacks, 0);
});
