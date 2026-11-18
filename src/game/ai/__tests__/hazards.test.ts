import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBotHazards, createBotHazardBuffer } from '../hazards.ts';
import { maxHitRadius } from '../../roster.ts';
import type { SlowSpec } from '../../abilities.ts';
import type { ActiveAoe, Projectile } from '../../matchState.ts';

const projectile = (
  power: number,
  slow: SlowSpec | null = null,
  dot = null as { type: string; damage: number; duration: number } | null,
  customDamage = false
) =>
  ({
    x: 3,
    z: 4,
    vx: 6,
    vz: 8,
    traveled: 2,
    owner: { team: 'red' },
    def: {
      props: { power, slow, dot },
      bot: customDamage ? { customDamage: true } : undefined,
      range: 12,
      radius: 0.4
    }
  }) as unknown as Projectile;

const aoe = (
  power: number,
  slow: SlowSpec | null = null,
  dot = null as { type: string; damage: number; duration: number } | null,
  customDamage = false
) =>
  ({
    x: 1,
    z: 2,
    radius: 3,
    elapsed: 1,
    duration: 4,
    shape: 'circle',
    dirX: 0,
    dirZ: 1,
    halfAngle: 0,
    owner: { team: 'blue' },
    def: {
      props: { power, slow, dot },
      bot: customDamage ? { customDamage: true } : undefined,
      aoeDamageMode: 'once',
      radius: 3,
      aoeCircles: []
    },
    targetTimers: new Map([[1, { tickTimer: 0.25 }]])
  }) as unknown as ActiveAoe;

/** Área de dos círculos separados, para comprobar la geometría del patrón. */
const patternAoe = () =>
  ({
    x: 1,
    z: 2,
    radius: 1,
    elapsed: 0,
    duration: 2,
    shape: 'circle',
    dirX: 0,
    dirZ: 1,
    originX: 1,
    originZ: 2,
    originDirX: 0,
    originDirZ: 1,
    halfAngle: 0,
    owner: { team: 'blue' },
    def: {
      props: { power: 10, slow: null, dot: null },
      aoeDamageMode: 'once',
      radius: 1,
      aoeCircles: [
        { offsetX: 0, offsetZ: 1, radius: 1 },
        { offsetX: 0, offsetZ: -1, radius: 1 }
      ]
    }
  }) as unknown as ActiveAoe;

test('buildBotHazards ignora efectos sin daño ni ralentización', () => {
  assert.deepEqual(buildBotHazards([projectile(0)], [aoe(0)]), []);
});

test('buildBotHazards calcula vida restante y radio del área', () => {
  const [proj, area] = buildBotHazards(
    [projectile(40)],
    [aoe(0, { multiplier: 0.5, duration: 2 })]
  );

  assert.equal(proj.kind, 'projectile');
  assert.equal(proj.ownerTeam, 'red');
  assert.equal(proj.radius, 0.4);
  // 10 unidades restantes a 10 u/s = 1 s.
  assert.equal(proj.remaining, 1);

  assert.equal(area.kind, 'aoe');
  assert.equal(area.ownerTeam, 'blue');
  assert.equal(area.radius, 3 + maxHitRadius());
  assert.equal(area.remaining, 3);
});

test('buildBotHazards reutiliza el array y los objetos del buffer', () => {
  const buffer = createBotHazardBuffer();
  const projectiles = [projectile(40)];
  const first = buildBotHazards(projectiles, [], buffer);
  const hazard = first[0];

  assert.equal(first, buffer.hazards);

  projectiles[0].x = 9;
  const second = buildBotHazards(projectiles, [], buffer);

  // Mismo array y mismo objeto: solo cambian los valores.
  assert.equal(second, buffer.hazards);
  assert.equal(second[0], hazard);
  assert.equal(second[0].x, 9);
});

test('el pool conserva los objetos aunque el paso tenga menos peligros', () => {
  const buffer = createBotHazardBuffer();
  buildBotHazards([projectile(40)], [aoe(40)], buffer);
  const [first, second] = buffer.hazards;
  assert.equal(buffer.pool.length, 2);

  buildBotHazards([], [], buffer);
  assert.equal(buffer.hazards.length, 0);
  // El pool sigue vivo para el siguiente pico de proyectiles.
  assert.equal(buffer.pool.length, 2);

  const rebuilt = buildBotHazards([projectile(40), projectile(40)], [], buffer);
  assert.equal(rebuilt.length, 2);
  assert.equal(rebuilt[0], first);
  assert.equal(rebuilt[1], second);
});

test('un objeto reciclado cambia de tipo sin arrastrar datos activos', () => {
  const buffer = createBotHazardBuffer();
  buildBotHazards([], [aoe(40)], buffer);
  const reused = buffer.hazards[0];

  const [hazard] = buildBotHazards([projectile(40)], [], buffer);

  assert.equal(hazard, reused);
  assert.equal(hazard.kind, 'projectile');
  assert.equal(hazard.vx, 6);
  assert.equal(hazard.remaining, 1);
});

test('sin buffer cada llamada crea su propio array', () => {
  const first = buildBotHazards([projectile(40)], []);
  const second = buildBotHazards([projectile(40)], []);

  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
});

test('incluye DoT sin potencia y daño declarado como custom', () => {
  const hazards = buildBotHazards(
    [
      projectile(0, null, { type: 'Fire', damage: 5, duration: 3 }),
      projectile(0, null, null, true)
    ],
    [aoe(0, null, { type: 'Poison', damage: 4, duration: 2 })]
  );

  assert.equal(hazards.length, 3);
  assert.equal(hazards[0].kind, 'projectile');
  assert.equal(hazards[1].kind, 'projectile');
  assert.equal(hazards[2].kind, 'aoe');
});

test('copia el modo y los temporizadores por objetivo del área', () => {
  const [area] = buildBotHazards([], [aoe(40)]);

  assert.equal(area.mode, 'once');
  assert.equal(area.targetTimers?.get(1)?.tickTimer, 0.25);
});

test('resuelve los círculos del patrón y reutiliza el array', () => {
  const buffer = createBotHazardBuffer();
  const [hazard] = buildBotHazards([], [patternAoe()], buffer);

  assert.equal(hazard.circles?.length, 2);
  assert.deepEqual(hazard.circles?.[0], { x: 1, z: 3, radius: 1 });
  assert.deepEqual(hazard.circles?.[1], { x: 1, z: 1, radius: 1 });

  // El buffer del peligro se reescribe en el siguiente paso, sin asignar otro.
  const circles = hazard.circles;
  buildBotHazards([], [patternAoe()], buffer);
  assert.equal(hazard.circles, circles);
});

test('el barrido añade las posiciones futuras de aoeMovement', () => {
  const buffer = createBotHazardBuffer();
  const area = patternAoe();
  area.elapsed = 0;
  (area.def as { aoeMovement?: unknown }).aoeMovement = (ctx: {
    originX: number;
    originZ: number;
    dirZ: number;
    elapsed: number;
  }) => ({
    x: ctx.originX,
    z: ctx.originZ + ctx.dirZ * ctx.elapsed
  });

  const [hazard] = buildBotHazards([], [area], buffer);

  // 2 círculos actuales + 3 muestras (0,15/0,30/0,45 s) × 2 círculos.
  assert.equal(hazard.circles?.length, 8);
  // La primera muestra avanza 0,15 u: el círculo delantero pasa de z=3 a 3,15.
  assert.ok(Math.abs((hazard.circles?.[2]?.z ?? 0) - 3.15) < 1e-9);
});
