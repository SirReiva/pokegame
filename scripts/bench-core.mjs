#!/usr/bin/env node
/**
 * Benchmark de CPU de los módulos puros.
 *
 * No mide GPU ni draw calls: para eso está la metodología de
 * `docs/rendimiento-carga-mapas.md` en Chrome headless. Este script sirve para
 * detectar regresiones de lógica/asignación en cada refactor sin abrir el juego.
 */

import { performance } from 'node:perf_hooks';
import { decorateDamage } from '../src/game/combat.ts';
import { aoeContains } from '../src/game/aoeGeometry.ts';
import { buildBotHazards } from '../src/game/ai/hazards.ts';
import { normalizeModeSettings } from '../src/game/modes.ts';

const results = [];

function bench(name, iterations, run) {
  // Calentamiento para que el JIT no contamine la primera medición.
  for (let i = 0; i < Math.min(1000, iterations); i++) run(i);
  const started = performance.now();
  for (let i = 0; i < iterations; i++) run(i);
  const elapsed = performance.now() - started;
  results.push({ name, iterations, ms: elapsed, ops: (iterations / elapsed) * 1000 });
}

const area = {
  shape: 'cone',
  x: 0,
  z: 0,
  radius: 6,
  dirX: 0,
  dirZ: 1,
  halfAngle: Math.PI / 4
};

bench('decorateDamage', 2_000_000, () =>
  decorateDamage(120, {
    critical: false,
    randomFactor: 0.92,
    stab: true,
    effectiveness: 1.5
  })
);

bench('aoeContains (cono)', 2_000_000, (i) =>
  aoeContains(area, (i % 10) - 5, (i % 7) + 1, 0.5)
);

const projectiles = Array.from({ length: 100 }, (_, i) => ({
  x: i * 0.1,
  z: i * 0.2,
  vx: 6,
  vz: 8,
  traveled: 2,
  owner: { team: 'red' },
  def: { power: 40, slow: null, range: 12, radius: 0.4 }
}));
const aoes = Array.from({ length: 20 }, (_, i) => ({
  x: i,
  z: i,
  radius: 3,
  elapsed: 1,
  duration: 4,
  shape: 'circle',
  dirX: 0,
  dirZ: 1,
  halfAngle: 0,
  owner: { team: 'blue' },
  def: { power: 20, slow: null }
}));

bench('buildBotHazards (100+20)', 20_000, () =>
  buildBotHazards(projectiles, aoes)
);

bench('normalizeModeSettings', 200_000, () =>
  normalizeModeSettings('koth', {
    scoreTarget: 150,
    zoneRadius: 6,
    zoneMovement: 'mobile'
  })
);

console.log('Benchmark de CPU (Node, sin GPU)\n');
for (const result of results) {
  console.log(
    `${result.name.padEnd(30)} ${result.ms.toFixed(1).padStart(8)} ms  ` +
      `${Math.round(result.ops).toLocaleString('es-ES').padStart(12)} ops/s`
  );
}
