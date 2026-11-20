import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../config';
import { parseMap } from '../map';
import { mountainRangeContains, volcanoColliders } from '../terrain';
import { lineOfSightBlocked } from '../vision';

test('un volcán usa una huella cuadrada centrada en su punto', () => {
  const volcano = {
    kind: 'volcano' as const,
    width: 4,
    points: [[2, -1] as [number, number]]
  };

  assert.equal(mountainRangeContains(volcano, 2, -1), true);
  assert.equal(mountainRangeContains(volcano, 3.9, -1), true);
  assert.equal(mountainRangeContains(volcano, 4.1, -1), false);
  // La esquina entra en el cuadrado aunque quede fuera del círculo inscrito:
  // la huella del separador es cuadrada, no redonda.
  assert.equal(mountainRangeContains(volcano, 3.8, 0.8), true);
});

test('parseMap acepta un volcán con un único punto central', () => {
  const entry = { id: 'test', name: 'Mapa de prueba', file: 'test.json' };
  const base = {
    tiles: [['jungle']],
    respawns: [
      { team: 'blue' as const, x: -1, z: -1 },
      { team: 'red' as const, x: 1, z: 1 }
    ]
  };

  const map = parseMap(
    {
      ...base,
      mountains: [{ kind: 'volcano', width: 3, points: [[0, 0]] }]
    },
    entry
  );
  assert.deepEqual(map.mountains, [
    { kind: 'volcano', width: 3, points: [[0, 0]] }
  ]);

  assert.throws(
    () =>
      parseMap(
        {
          ...base,
          mountains: [{ kind: 'volcano', width: 3, points: [] }]
        },
        entry
      ),
    /necesita un punto central/
  );
});

test('el volcán bloquea la visión con el mismo radio que su base', () => {
  const width = 4;
  const colliders = volcanoColliders({
    kind: 'volcano',
    width,
    points: [[0, 0]]
  });

  assert.equal(colliders.length, 1);
  const collider = colliders[0];
  assert.equal(collider.type, 'circle');
  if (collider.type !== 'circle') return;
  // La visión coincide con la base del cono: ni más ancha (dejaría al jugador
  // pegado dentro del oclusor y vería a través) ni más estrecha que la malla.
  assert.equal(collider.sightRadius, width / 2);

  // Detrás del volcán, en cualquier eje, la línea de visión se corta.
  assert.equal(lineOfSightBlocked(-5, 0, 5, 0, colliders), true);
  assert.equal(lineOfSightBlocked(0, -5, 0, 5, colliders), true);
  assert.equal(lineOfSightBlocked(-5, -5, 5, 5, colliders), true);
  // Al lado, sin cruzarlo, se sigue viendo.
  assert.equal(lineOfSightBlocked(-5, 4, 5, 4, colliders), false);
  assert.equal(lineOfSightBlocked(-5, -4, -5, 4, colliders), false);

  // Pegado a la base: la resolución deja al jugador a `radius + 0,42` del
  // centro, siempre fuera del radio de visión, así que el cono sí tapa.
  const touching = width / 2 + CONFIG.player.radius;
  assert.equal(lineOfSightBlocked(touching, 0, -6, 0, colliders), true);
  assert.equal(lineOfSightBlocked(-touching, 0, 6, 0, colliders), true);
  assert.equal(lineOfSightBlocked(0, touching, 0, -6, colliders), true);
  const diagonal = touching / Math.SQRT2;
  assert.equal(lineOfSightBlocked(diagonal, diagonal, -5, -5, colliders), true);
  // Y rodeándolo por fuera se sigue viendo.
  assert.equal(lineOfSightBlocked(touching, 1, touching, -1, colliders), false);
});
