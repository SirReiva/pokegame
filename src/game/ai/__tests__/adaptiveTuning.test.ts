import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADAPTIVE_INITIAL_STRENGTH,
  adaptiveTargetStrength,
  applyAdaptiveTuning,
  createAdaptiveTuning,
  smoothAdaptiveStrength
} from '../adaptiveTuning.ts';
import { TUNING } from '../tuning.ts';
import type { MatchPlayerState } from '../../matchState.ts';
import type { Team } from '../../core/team.ts';
import { xpForLevel } from '../../core/xp.ts';

/** Jugador mínimo: la adaptación solo lee equipo, XP, bajas y muertes. */
function player(
  team: Team,
  level: number,
  kills = 0,
  deaths = 0
): MatchPlayerState {
  return {
    team,
    xp: xpForLevel(level),
    kills,
    deaths
  } as unknown as MatchPlayerState;
}

function scores(red: number, blue: number): Record<Team, number> {
  return { red, blue, yellow: 0, green: 0 };
}

test('el perfil adaptativo es propio y queda dentro de fácil y experto', () => {
  const tuning = createAdaptiveTuning();

  assert.notEqual(tuning, TUNING.adaptive);
  for (const key of Object.keys(tuning) as (keyof typeof tuning)[]) {
    const low = Math.min(TUNING.easy[key], TUNING.expert[key]);
    const high = Math.max(TUNING.easy[key], TUNING.expert[key]);
    assert.ok(tuning[key] >= low && tuning[key] <= high, `${key} fuera de rango`);
  }
  assert.equal(tuning.visionFactor, 1);
});

test('la fuerza sube con el nivel de los rivales', () => {
  const self = player('red', 1);
  const weakEnemies = adaptiveTargetStrength(self, [
    self,
    player('blue', 1)
  ]);
  const strongEnemies = adaptiveTargetStrength(self, [
    self,
    player('blue', 10)
  ]);

  assert.ok(strongEnemies > weakEnemies);
});

test('la fuerza sube si los rivales van por delante en bajas', () => {
  const self = player('red', 5);
  const even = adaptiveTargetStrength(self, [
    self,
    player('blue', 5, 2)
  ]);
  const behind = adaptiveTargetStrength(self, [
    self,
    player('blue', 5, 6)
  ]);

  assert.ok(behind > even);
});

test('el equipo que domina juega más suave', () => {
  const leadingSelf = player('red', 8, 8);
  const leading = adaptiveTargetStrength(leadingSelf, [
    leadingSelf,
    player('blue', 8, 1)
  ]);
  const tiedSelf = player('red', 8, 4);
  const tied = adaptiveTargetStrength(tiedSelf, [
    tiedSelf,
    player('blue', 8, 4)
  ]);

  assert.ok(leading < tied);
});

test('en KOTH la puntuación manda aunque las bajas estén igualadas', () => {
  const self = player('red', 5);
  const players = [self, player('blue', 5)];
  const even = adaptiveTargetStrength(self, players, scores(10, 10), 100);
  const behind = adaptiveTargetStrength(self, players, scores(10, 40), 100);

  assert.ok(behind > even);
});

test('en Deathmatch también se usa el marcador del modo', () => {
  const self = player('red', 5);
  const players = [self, player('blue', 5)];
  const even = adaptiveTargetStrength(self, players, scores(5, 5), 15);
  const behind = adaptiveTargetStrength(self, players, scores(2, 8), 15);

  assert.ok(behind > even);
});

test('un K/D bajo da un empujón al bot', () => {
  const struggling = player('red', 5, 1, 7);
  const dominating = player('red', 5, 7, 1);
  const enemy = player('blue', 5);

  const strugglingStrength = adaptiveTargetStrength(
    struggling,
    [struggling, enemy],
    scores(5, 5),
    15
  );
  const dominatingStrength = adaptiveTargetStrength(
    dominating,
    [dominating, enemy],
    scores(5, 5),
    15
  );

  assert.ok(strugglingStrength > dominatingStrength);
});

test('el suavizado avanza hacia el objetivo sin saltar', () => {
  const partial = smoothAdaptiveStrength(0, 1, 1);
  assert.ok(partial > 0 && partial < 1);

  const later = smoothAdaptiveStrength(partial, 1, 10);
  assert.ok(later > partial && later <= 1);
  assert.equal(smoothAdaptiveStrength(0.5, 1, 0), 0.5);
});

test('aplicar la fuerza fija los extremos de fácil y experto', () => {
  const tuning = createAdaptiveTuning();

  applyAdaptiveTuning(tuning, 0);
  for (const key of Object.keys(tuning) as (keyof typeof tuning)[]) {
    if (key === 'visionFactor') continue;
    assert.ok(Math.abs(tuning[key] - TUNING.easy[key]) < 1e-9, `${key} no es fácil`);
  }

  applyAdaptiveTuning(tuning, 1);
  for (const key of Object.keys(tuning) as (keyof typeof tuning)[]) {
    if (key === 'visionFactor') continue;
    assert.ok(
      Math.abs(tuning[key] - TUNING.expert[key]) < 1e-9,
      `${key} no es experto`
    );
  }
});

test('la fuerza inicial deja el perfil cerca de fácil', () => {
  const tuning = createAdaptiveTuning();
  const low = TUNING.easy.reaction;
  const high = TUNING.expert.reaction;

  assert.ok(
    Math.abs(
      tuning.reaction - (low + (high - low) * ADAPTIVE_INITIAL_STRENGTH)
    ) < 1e-6
  );
});
