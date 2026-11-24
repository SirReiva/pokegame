/**
 * Dificultad adaptativa.
 *
 * A diferencia del resto de perfiles, este no es fijo: se recalcula mientras
 * avanza la partida a partir de dos señales:
 *
 * - el **nivel de XP** de los equipos, que resume cuánto ha progresado cada
 *   plantilla durante la partida;
 * - la **situación del marcador de bajas**, para que el bot apriete si va por
 *   detrás y afloje si va sobrado.
 *
 * La fuerza resultante (0-1) interpola todos los parámetros del perfil entre
 * `easy` y `expert`. Se suaviza en el tiempo para que el bot no cambie de
 * comportamiento de un frame a otro. La visión queda fija en rango humano: la
 * adaptación se expresa con reacción, puntería, predicción y decisión.
 */

import type { MatchPlayerState } from '../core/match/playerState';
import { levelFromXp, XP_MAX_LEVEL } from '../core/xp';
import type { Team } from '../core/team';
import { TEAM_ORDER } from '../multiplayer';
import { TUNING, type BotTuning } from './tuning';

/** Fuerza inicial: arranca cerca de `easy`, antes de conocer a los rivales. */
export const ADAPTIVE_INITIAL_STRENGTH = 0.3;

/** Peso del nivel medio de los rivales dentro de la fuerza objetivo. */
const ENEMY_SKILL_WEIGHT = 0.4;
/** Peso de la diferencia de nivel entre el equipo propio y los rivales. */
const LEVEL_GAP_WEIGHT = 0.15;
/** Peso del marcador de bajas. */
const SCORE_GAP_WEIGHT = 0.15;
/** Fuerza base sobre la que suman los pesos anteriores. */
const BASE_STRENGTH = 0.3;
/** Suavizado exponencial: segundos que tarda en cubrir ~63 % de un cambio. */
const SMOOTHING_SECONDS = 20;
/** Bajas mínimas para que un marcador igualado no amplifique el arranque. */
const SCORE_SOFTENING = 4;

/**
 * Parámetros que la adaptación interpola. Se excluye `visionFactor` a
 * propósito: cambiarlo cada paso invalidaría la caché de visibilidad.
 */
const INTERPOLATED_KEYS: readonly (keyof BotTuning)[] = [
  'reaction',
  'decision',
  'decisionError',
  'aimTolerance',
  'aimError',
  'matchupWeight',
  'retreatHp',
  'memory',
  'lead',
  'commonChance',
  'pathInterval',
  'evadeWindow',
  'punishBonus',
  'punishChance',
  'punishTimingError',
  'punishReaction'
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Fuerza objetivo (0-1) para el equipo del bot.
 *
 * Sube cuando los rivales tienen más nivel, cuando van por delante en XP o en
 * bajas, y baja en el caso contrario. El marcador compara al equipo rival
 * líder, no a la suma de todos: en partidas de tres o cuatro equipos el bot
 * debe responder al que manda, no a una mayoría artificial.
 */
export function adaptiveTargetStrength(
  selfTeam: Team,
  players: readonly MatchPlayerState[]
): number {
  let allyKills = 0;
  let allyLevelSum = 0;
  let allyPlayers = 0;
  let enemyKills = 0;
  let enemyLevelSum = 0;
  let enemyPlayers = 0;

  for (const player of players) {
    const level = levelFromXp(player.xp);
    if (player.team === selfTeam) {
      allyKills += player.kills;
      allyLevelSum += level;
      allyPlayers += 1;
    } else {
      enemyKills += player.kills;
      enemyLevelSum += level;
      enemyPlayers += 1;
    }
  }
  if (allyPlayers === 0 || enemyPlayers === 0) return ADAPTIVE_INITIAL_STRENGTH;

  // El rival líder se busca por equipo para no sumar a todos los rivales en
  // partidas de tres o cuatro bandos.
  let leadingEnemyKills = 0;
  for (const team of TEAM_ORDER) {
    if (team === selfTeam) continue;
    let teamKills = 0;
    for (const player of players) {
      if (player.team === team) teamKills += player.kills;
    }
    if (teamKills > leadingEnemyKills) leadingEnemyKills = teamKills;
  }

  const enemyLevel = enemyLevelSum / enemyPlayers;
  const allyLevel = allyLevelSum / allyPlayers;
  const levelRange = XP_MAX_LEVEL - 1;

  // Nivel absoluto de los rivales: 0 en el nivel 1, 1 en el nivel 10.
  const enemySkill = clamp01((enemyLevel - 1) / levelRange);
  // Ventaja de nivel rival sobre el equipo del bot, de -1 a 1.
  const levelGap = Math.max(
    -1,
    Math.min(1, (enemyLevel - allyLevel) / levelRange)
  );
  // Ventaja del rival líder en bajas, normalizada. `enemyKills` solo se usa
  // para repartir el peso cuando hay pocas bajas todavía.
  const scoreGap = Math.max(
    -1,
    Math.min(
      1,
      (leadingEnemyKills - allyKills) /
        Math.max(SCORE_SOFTENING, enemyKills + allyKills)
    )
  );

  return clamp01(
    BASE_STRENGTH +
      ENEMY_SKILL_WEIGHT * enemySkill +
      LEVEL_GAP_WEIGHT * levelGap +
      SCORE_GAP_WEIGHT * scoreGap
  );
}

/** Acerca `current` a `target` con un suavizado exponencial estable. */
export function smoothAdaptiveStrength(
  current: number,
  target: number,
  dt: number
): number {
  if (dt <= 0) return current;
  const alpha = 1 - Math.exp(-dt / SMOOTHING_SECONDS);
  return current + (target - current) * alpha;
}

/** Escribe en `tuning` la interpolación fácil → experto para `strength`. */
export function applyAdaptiveTuning(tuning: BotTuning, strength: number): void {
  const t = clamp01(strength);
  const weak = TUNING.easy;
  const strong = TUNING.expert;
  for (const key of INTERPOLATED_KEYS) {
    tuning[key] = weak[key] + (strong[key] - weak[key]) * t;
  }
}

/**
 * Perfil mutable propio de un bot adaptativo. No se comparte: cada bot tiene
 * el suyo y lo reescribe en cada paso.
 */
export function createAdaptiveTuning(): BotTuning {
  const tuning: BotTuning = { ...TUNING.adaptive };
  applyAdaptiveTuning(tuning, ADAPTIVE_INITIAL_STRENGTH);
  return tuning;
}
