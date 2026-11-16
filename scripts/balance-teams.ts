#!/usr/bin/env node
/**
 * Informe de balance para el modo principal 4v4.
 *
 * El round-robin 1v1 de `scripts/balance-report.ts` mide fuerza de duelo, pero
 * el modo principal es 4 contra 4: el valor de una especie depende de su daño
 * en equipo, su curación, su control, su supervivencia y de con quién comparte
 * equipo. Este script reutiliza el mismo arnés headless (paso fijo de 60 Hz,
 * mismas fórmulas y bots reales) y juega partidas 4v4 completas.
 *
 * Diseño estadístico:
 *   - Cada partida sortea 8 especies distintas del pool (4 por equipo). Así
 *     cada especie aparece con compañeros aleatorios y se puede separar su
 *     aporte del de sus compañeros.
 *   - Cada emparejamiento se juega en las dos orientaciones de spawn, para
 *     cancelar el sesgo de lado del mapa.
 *   - Varias semillas reproducibles por orientación.
 *   - Se ajusta un modelo logístico (Bradley-Terry con intercepto de lado)
 *     sobre el resultado de las partidas: P(rojo) = sigmoid(Σθ_rojo − Σθ_azul
 *     + β). θ es la contribución marginal de cada especie en log-odds; se
 *     presenta como rating tipo Elo (1500 + θ · 173.7) con intervalo del 95 %.
 *
 * Uso:
 *   pnpm balance:teams
 *   pnpm balance:teams --pairs 250 --seeds 3
 *   pnpm balance:teams --pairs 40 --seeds 1 --seconds 120 --mode tdm
 *   pnpm balance:teams --design robin --teams "0025,0094,0658,0007;..."
 *
 * Salida:
 *   docs/balance-equipos.md   (metodología + tablas + lectura automática)
 *   .cache/balance-teams.json (datos crudos)
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  MOVESETS,
  type CommonAbilityId
} from '../src/game/abilities';
import { baseStatsFor, combatStatsFor } from '../src/game/pokedex';
import { hitRadiusForPokemon, speedForPokemon } from '../src/game/roster';
import type { Team } from '../src/game/terrain';
import {
  HeadlessMatch,
  loadManifest,
  loadMapFile,
  mulberry32,
  type Options,
  type PokemonEntry,
  type SimSummary
} from './sim-headless';

const FIXED_STEP = 1 / 60;
const COMMON_ABILITIES: readonly CommonAbilityId[] = [
  'proteccion',
  'impulso',
  'regeneracion'
];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

type Design = 'random' | 'robin';

interface TeamOptions {
  map: string;
  seeds: number;
  seconds: number;
  kos: number;
  difficulty: Options['difficulty'];
  common: CommonAbilityId;
  mode: Options['mode'];
  design: Design;
  pairs: number;
  size: number;
  pool: string[] | null;
  teams: string[][] | null;
  minDuo: number;
  out: string;
  json: string | null;
  quiet: boolean;
}

function parseArgs(argv: readonly string[]): TeamOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (!arg.startsWith('--')) {
      throw new Error(`Argumento no reconocido: ${arg}`);
    }
    const key = arg.slice(2);
    if (key === 'quiet') {
      values.set(key, 'true');
      continue;
    }
    const value = argv[++index];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Falta el valor de --${key}`);
    }
    values.set(key, value);
  }

  const difficulty = (values.get('difficulty') ?? 'expert') as Options['difficulty'];
  if (!['easy', 'normal', 'hard', 'expert'].includes(difficulty)) {
    throw new Error('--difficulty debe ser easy, normal, hard o expert');
  }

  const common = (values.get('common') ?? 'proteccion') as CommonAbilityId;
  if (!COMMON_ABILITIES.includes(common)) {
    throw new Error(
      '--common debe ser proteccion, impulso o regeneracion (corre una vez por instinto)'
    );
  }

  const mode = (values.get('mode') ?? 'tdm') as Options['mode'];
  if (mode !== 'tdm' && mode !== 'koth') {
    throw new Error('--mode debe ser tdm o koth');
  }

  const design = (values.get('design') ?? 'random') as Design;
  if (design !== 'random' && design !== 'robin') {
    throw new Error('--design debe ser random o robin');
  }

  const seeds = positiveInt(values.get('seeds') ?? '2', '--seeds');
  const seconds = Number(values.get('seconds') ?? 300);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('--seconds debe ser mayor que cero');
  }
  const kos = positiveInt(values.get('kos') ?? '15', '--kos');
  const pairs = positiveInt(values.get('pairs') ?? '80', '--pairs');
  const size = positiveInt(values.get('size') ?? '4', '--size');
  if (size > 4) {
    throw new Error('--size máximo 4: el motor admite hasta 8 jugadores');
  }
  const minDuo = positiveInt(values.get('min-duo') ?? '8', '--min-duo');

  const poolValue = values.get('pool');
  const pool = poolValue
    ? poolValue
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : null;

  const teamsValue = values.get('teams');
  const teams = teamsValue
    ? teamsValue
        .split(';')
        .map((group) =>
          group
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        )
        .filter((group) => group.length > 0)
    : null;
  if (teams) {
    for (const group of teams) {
      if (group.length !== size) {
        throw new Error(
          `Cada composición de --teams debe tener ${size} especies; ` +
            `"${group.join(',')}" tiene ${group.length}`
        );
      }
      if (new Set(group).size !== group.length) {
        throw new Error(
          `Cada composición debe tener especies distintas: "${group.join(',')}"`
        );
      }
    }
    if (teams.length < 2) {
      throw new Error('--teams necesita al menos dos composiciones');
    }
  }

  return {
    map: values.get('map') ?? 'arena',
    seeds,
    seconds,
    kos,
    difficulty,
    common,
    mode,
    design,
    pairs,
    size,
    pool,
    teams,
    minDuo,
    out: values.get('out') ?? 'docs/balance-equipos.md',
    json: values.get('json') ?? '.cache/balance-teams.json',
    quiet: values.get('quiet') === 'true'
  };
}

function positiveInt(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${flag} debe ser un entero positivo`);
  }
  return value;
}

function printHelp(): void {
  console.log(`Balance 4v4 con partidas completas entre bots

Opciones:
  --map <id>          Mapa de public/maps/index.json (por defecto: arena)
  --mode <tdm|koth>   Modo de juego (por defecto: tdm)
  --seconds <n>       Duración máxima y límite de tiempo de cada partida (300)
  --kos <n>           KOs para ganar en tdm (por defecto: 15)
  --seeds <n>         Semillas por emparejamiento y orientación (por defecto: 2)
  --difficulty <d>    easy | normal | hard | expert (por defecto: expert)
  --common <id>       proteccion | impulso | regeneracion (por defecto: proteccion)
  --design <modo>     random (sortea equipos) | robin (usa --teams) (random)
  --pairs <n>         Emparejamientos sorteados en --design random (80)
  --teams <lista>     Composiciones separadas por ';' y especies por ','
  --size <n>          Jugadores por equipo, 1-4 (por defecto: 4)
  --pool <ids>        Especies candidatas separadas por comas (todas con moveset)
  --min-duo <n>       Partidas mínimas para listar una pareja (por defecto: 8)
  --out <archivo>     Informe markdown (docs/balance-equipos.md)
  --json <archivo>    Datos crudos (por defecto: .cache/balance-teams.json)
  --quiet             No imprime el progreso
  --help              Muestra esta ayuda

Ejemplos:
  pnpm balance:teams --pairs 250 --seeds 3
  pnpm balance:teams --pairs 20 --seeds 1 --seconds 120
  pnpm balance:teams --design robin --teams "0025,0094,0658,0007;0130,0245,0382,0384"`);
}

// ---------------------------------------------------------------------------
// Tipos de resultados
// ---------------------------------------------------------------------------

interface PlayerLine {
  pokemonId: string;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  healing: number;
  casts: number;
  hits: number;
  hp: number;
  maxHp: number;
}

interface TeamMatchResult {
  a: string[];
  b: string[];
  seed: number;
  orientation: 0 | 1;
  winner: 'a' | 'b' | 'draw';
  winnerTeam: string | null;
  duration: number;
  endReason: string | null;
  scoreA: number;
  scoreB: number;
  playersA: PlayerLine[];
  playersB: PlayerLine[];
  kills: number;
}

interface SpeciesAggregate {
  id: string;
  name: string;
  types: string[];
  maxHp: number;
  speed: number;
  hitRadius: number;
  appearances: number;
  wins: number;
  losses: number;
  draws: number;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  healing: number;
  casts: number;
  hits: number;
  damageShareSum: number;
  hpLeftOnWin: number;
  zeroDamage: number;
  zeroKills: number;
}

interface CompositionAggregate {
  key: string;
  team: string[];
  appearances: number;
  wins: number;
  losses: number;
  draws: number;
  scoreFor: number;
  scoreAgainst: number;
  killsFor: number;
  killsAgainst: number;
  damageFor: number;
  duration: number;
}

interface DuoAggregate {
  key: string;
  a: string;
  b: string;
  appearances: number;
  wins: number;
  losses: number;
  draws: number;
}

interface RatingResult {
  rating: Map<string, number>;
  error: Map<string, number>;
  sideBias: number;
  sideError: number;
  logLoss: number;
  samples: number;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function hashSeed(...parts: number[]): number {
  let hash = 2166136261;
  for (const part of parts) {
    hash ^= part + 0x9e3779b9;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let index = items.length - 1; index > 0; index--) {
    const swap = Math.floor(rng() * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}

function interleave(a: readonly string[], b: readonly string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < a.length; index++) {
    out.push(a[index], b[index]);
  }
  return out;
}

function compositionKey(team: readonly string[]): string {
  return [...team].sort().join('+');
}

function duoKey(a: string, b: string): string {
  return a < b ? `${a}+${b}` : `${b}+${a}`;
}

function winRate(record: { wins: number; losses: number; draws: number }): number {
  const total = record.wins + record.losses + record.draws;
  return total === 0 ? 0 : record.wins / total;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function fmt(value: number, digits = 0): string {
  return value.toFixed(digits);
}

function fmtSeconds(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} s`;
}

function average(total: number, count: number): number | null {
  return count > 0 ? total / count : null;
}

function typesLabel(types: readonly string[]): string {
  return types.join(' / ');
}

function commitHash(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8'
    }).trim();
  } catch {
    return 'desconocido';
  }
}

/** Semiancho del intervalo de Wilson del 95 % para una proporción. */
function wilsonHalf(wins: number, total: number): number {
  if (total === 0) return 0;
  const z = 1.96;
  const p = wins / total;
  const denominator = 1 + (z * z) / total;
  return (
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
    denominator
  );
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

// ---------------------------------------------------------------------------
// Partida 4v4
// ---------------------------------------------------------------------------

function runTeamMatch(input: {
  map: ReturnType<typeof loadMapFile>;
  manifest: Map<string, PokemonEntry>;
  base: Options;
  teamA: readonly string[];
  teamB: readonly string[];
  seed: number;
  orientation: 0 | 1;
  maxSteps: number;
  teamAId: Team;
  teamBId: Team;
}): TeamMatchResult {
  const { map, manifest, base, teamA, teamB, seed, orientation } = input;
  Math.random = mulberry32(seed);
  const match = new HeadlessMatch(
    map,
    { ...base, pokemon: interleave(teamA, teamB) },
    manifest
  );
  let steps = 0;
  while (steps < input.maxSteps && !match.matchOver) {
    match.step();
    steps += 1;
  }
  const summary = match.summary(0, steps, seed);
  const winnerTeam = summary.winner;
  const winner: TeamMatchResult['winner'] =
    winnerTeam === null
      ? 'draw'
      : winnerTeam === input.teamAId
        ? 'a'
        : winnerTeam === input.teamBId
          ? 'b'
          : 'draw';

  const playersA = linesFor(summary, input.teamAId);
  const playersB = linesFor(summary, input.teamBId);
  return {
    a: [...teamA],
    b: [...teamB],
    seed,
    orientation,
    winner,
    winnerTeam,
    duration: summary.simSeconds,
    endReason: summary.endReason,
    scoreA: summary.scores[input.teamAId] ?? 0,
    scoreB: summary.scores[input.teamBId] ?? 0,
    playersA,
    playersB,
    kills: summary.totals.kills
  };
}

function linesFor(summary: SimSummary, team: string): PlayerLine[] {
  return summary.players
    .filter((player) => player.team === team)
    .map((player) => ({
      pokemonId: player.pokemonId,
      kills: player.kills,
      deaths: player.deaths,
      damageDealt: player.damageDealt,
      damageTaken: player.damageTaken,
      healing: player.healing,
      casts: player.casts,
      hits: player.hits,
      hp: player.hp,
      maxHp: player.maxHp
    }));
}

// ---------------------------------------------------------------------------
// Agregados
// ---------------------------------------------------------------------------

function createSpeciesAggregates(
  pool: readonly string[],
  manifest: Map<string, PokemonEntry>
): Map<string, SpeciesAggregate> {
  const aggregates = new Map<string, SpeciesAggregate>();
  for (const id of pool) {
    const entry = manifest.get(id);
    if (!entry) continue;
    const stats = combatStatsFor(baseStatsFor(id));
    aggregates.set(id, {
      id,
      name: entry.name,
      types: entry.types,
      maxHp: stats.hp,
      speed: speedForPokemon(id),
      hitRadius: hitRadiusForPokemon(id),
      appearances: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      damageTaken: 0,
      healing: 0,
      casts: 0,
      hits: 0,
      damageShareSum: 0,
      hpLeftOnWin: 0,
      zeroDamage: 0,
      zeroKills: 0
    });
  }
  return aggregates;
}

function applyTeam(
  aggregates: Map<string, SpeciesAggregate>,
  players: readonly PlayerLine[],
  outcome: 'win' | 'loss' | 'draw'
): number {
  const teamDamage = players.reduce((sum, player) => sum + player.damageDealt, 0);
  for (const player of players) {
    const aggregate = aggregates.get(player.pokemonId);
    if (!aggregate) continue;
    aggregate.appearances += 1;
    if (outcome === 'win') aggregate.wins += 1;
    else if (outcome === 'loss') aggregate.losses += 1;
    else aggregate.draws += 1;
    aggregate.kills += player.kills;
    aggregate.deaths += player.deaths;
    aggregate.damageDealt += player.damageDealt;
    aggregate.damageTaken += player.damageTaken;
    aggregate.healing += player.healing;
    aggregate.casts += player.casts;
    aggregate.hits += player.hits;
    aggregate.damageShareSum +=
      teamDamage > 0 ? player.damageDealt / teamDamage : 0;
    if (outcome === 'win' && player.maxHp > 0) {
      aggregate.hpLeftOnWin += player.hp / player.maxHp;
    }
    if (player.damageDealt <= 0) aggregate.zeroDamage += 1;
    if (player.kills <= 0) aggregate.zeroKills += 1;
  }
  return teamDamage;
}

function recordMatch(input: {
  result: TeamMatchResult;
  aggregates: Map<string, SpeciesAggregate>;
  compositions: Map<string, CompositionAggregate>;
  duos: Map<string, DuoAggregate>;
}): void {
  const { result, aggregates, compositions, duos } = input;
  const outcomeA =
    result.winner === 'a' ? 'win' : result.winner === 'b' ? 'loss' : 'draw';
  const outcomeB =
    result.winner === 'b' ? 'win' : result.winner === 'a' ? 'loss' : 'draw';

  applyTeam(aggregates, result.playersA, outcomeA);
  applyTeam(aggregates, result.playersB, outcomeB);

  recordComposition(compositions, result.a, result, 'a');
  recordComposition(compositions, result.b, result, 'b');
  recordDuos(duos, result.a, outcomeA);
  recordDuos(duos, result.b, outcomeB);
}

function recordComposition(
  compositions: Map<string, CompositionAggregate>,
  team: readonly string[],
  result: TeamMatchResult,
  side: 'a' | 'b'
): void {
  const key = compositionKey(team);
  let aggregate = compositions.get(key);
  if (!aggregate) {
    aggregate = {
      key,
      team: [...team],
      appearances: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      killsFor: 0,
      killsAgainst: 0,
      damageFor: 0,
      duration: 0
    };
    compositions.set(key, aggregate);
  }
  const players = side === 'a' ? result.playersA : result.playersB;
  const opponent = side === 'a' ? result.playersB : result.playersA;
  aggregate.appearances += 1;
  if (result.winner === side) aggregate.wins += 1;
  else if (result.winner === 'draw') aggregate.draws += 1;
  else aggregate.losses += 1;
  aggregate.scoreFor += side === 'a' ? result.scoreA : result.scoreB;
  aggregate.scoreAgainst += side === 'a' ? result.scoreB : result.scoreA;
  aggregate.killsFor += players.reduce((sum, player) => sum + player.kills, 0);
  aggregate.killsAgainst += opponent.reduce((sum, player) => sum + player.kills, 0);
  aggregate.damageFor += players.reduce(
    (sum, player) => sum + player.damageDealt,
    0
  );
  aggregate.duration += result.duration;
}

function recordDuos(
  duos: Map<string, DuoAggregate>,
  team: readonly string[],
  outcome: 'win' | 'loss' | 'draw'
): void {
  for (let left = 0; left < team.length; left++) {
    for (let right = left + 1; right < team.length; right++) {
      const a = team[left];
      const b = team[right];
      const key = duoKey(a, b);
      let aggregate = duos.get(key);
      if (!aggregate) {
        aggregate = {
          key,
          a,
          b,
          appearances: 0,
          wins: 0,
          losses: 0,
          draws: 0
        };
        duos.set(key, aggregate);
      }
      aggregate.appearances += 1;
      if (outcome === 'win') aggregate.wins += 1;
      else if (outcome === 'loss') aggregate.losses += 1;
      else aggregate.draws += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Modelo logístico (Bradley-Terry con intercepto de lado)
// ---------------------------------------------------------------------------

function fitRating(
  samples: ReadonlyArray<{ red: string[]; blue: string[]; y: 0 | 1 }>,
  pool: readonly string[]
): RatingResult {
  const rated = pool.filter((id) =>
    samples.some((sample) => sample.red.includes(id) || sample.blue.includes(id))
  );
  const index = new Map(rated.map((id, position) => [id, position]));
  const n = rated.length;
  const beta = n;
  const dim = n + 1;
  const ridge = 0.5;
  let weights = new Float64Array(dim);

  const hessian = (): Float64Array[] =>
    Array.from({ length: dim }, () => new Float64Array(dim));

  for (let iteration = 0; iteration < 40; iteration++) {
    const gradient = new Float64Array(dim);
    const H = hessian();
    for (const sample of samples) {
      const red = sample.red
        .map((id) => index.get(id))
        .filter((value): value is number => value !== undefined);
      const blue = sample.blue
        .map((id) => index.get(id))
        .filter((value): value is number => value !== undefined);
      let z = weights[beta];
      for (const position of red) z += weights[position];
      for (const position of blue) z -= weights[position];
      const p = sigmoid(z);
      const d = p - sample.y;
      const w = Math.max(1e-9, p * (1 - p));

      for (const position of red) gradient[position] += d;
      for (const position of blue) gradient[position] -= d;
      gradient[beta] += d;

      for (const left of red) {
        for (const right of red) H[left][right] += w;
        H[left][beta] += w;
        H[beta][left] += w;
      }
      for (const left of blue) {
        for (const right of blue) H[left][right] += w;
        H[left][beta] -= w;
        H[beta][left] -= w;
      }
      for (const left of red) {
        for (const right of blue) H[left][right] -= w;
      }
      for (const left of blue) {
        for (const right of red) H[left][right] -= w;
      }
      H[beta][beta] += w;
    }

    for (let position = 0; position < dim; position++) H[position][position] += ridge;
    for (let position = 0; position < n; position++) {
      gradient[position] += ridge * weights[position];
    }

    const delta = solveLinear(H, gradient, dim);
    let maxStep = 0;
    for (let position = 0; position < dim; position++) {
      if (!Number.isFinite(delta[position])) {
        maxStep = Infinity;
        break;
      }
      weights[position] -= delta[position];
      maxStep = Math.max(maxStep, Math.abs(delta[position]));
    }
    if (!Number.isFinite(maxStep)) {
      weights = new Float64Array(dim);
      break;
    }
    if (iteration === 39 || maxStep < 1e-8) break;
  }

  // Covarianza aproximada = inversa de la Hessiana final.
  const H = hessian();
  for (const sample of samples) {
    const red = sample.red
      .map((id) => index.get(id))
      .filter((value): value is number => value !== undefined);
    const blue = sample.blue
      .map((id) => index.get(id))
      .filter((value): value is number => value !== undefined);
    let z = weights[beta];
    for (const position of red) z += weights[position];
    for (const position of blue) z -= weights[position];
    const p = sigmoid(z);
    const w = Math.max(1e-9, p * (1 - p));
    for (const left of red) {
      for (const right of red) H[left][right] += w;
      H[left][beta] += w;
      H[beta][left] += w;
    }
    for (const left of blue) {
      for (const right of blue) H[left][right] += w;
      H[left][beta] -= w;
      H[beta][left] -= w;
    }
    for (const left of red) {
      for (const right of blue) H[left][right] -= w;
    }
    for (const left of blue) {
      for (const right of red) H[left][right] -= w;
    }
    H[beta][beta] += w;
  }
  for (let position = 0; position < dim; position++) H[position][position] += ridge;
  const covariance = invert(H, dim);

  // Centrar θ para que la media del pool sea el origen.
  let mean = 0;
  for (let position = 0; position < n; position++) mean += weights[position];
  mean = n > 0 ? mean / n : 0;
  for (let position = 0; position < n; position++) weights[position] -= mean;

  const rating = new Map<string, number>();
  const error = new Map<string, number>();
  const eloScale = 400 / Math.log(10);
  let covarianceMean = 0;
  for (let left = 0; left < n; left++) {
    for (let right = 0; right < n; right++) {
      covarianceMean += covariance[left][right];
    }
  }
  covarianceMean = n > 0 ? covarianceMean / (n * n) : 0;
  for (let position = 0; position < n; position++) {
    const id = rated[position];
    rating.set(id, 1500 + weights[position] * eloScale);
    let rowMean = 0;
    for (let right = 0; right < n; right++) {
      rowMean += covariance[position][right];
    }
    rowMean = n > 0 ? rowMean / n : 0;
    const variance = Math.max(
      0,
      covariance[position][position] - 2 * rowMean + covarianceMean
    );
    error.set(id, Math.sqrt(variance) * eloScale);
  }

  return {
    rating,
    error,
    sideBias: weights[beta],
    sideError: Math.sqrt(Math.max(0, covariance[beta][beta])),
    logLoss: samples.length > 0 ? logLossOf(samples, weights, index, beta) : 0,
    samples: samples.length
  };
}

function logLossOf(
  samples: ReadonlyArray<{ red: string[]; blue: string[]; y: 0 | 1 }>,
  weights: Float64Array,
  index: Map<string, number>,
  beta: number
): number {
  let total = 0;
  for (const sample of samples) {
    let z = weights[beta];
    for (const id of sample.red) z += weights[index.get(id) ?? 0] ?? 0;
    for (const id of sample.blue) z -= weights[index.get(id) ?? 0] ?? 0;
    const p = sigmoid(z);
    total -=
      sample.y * Math.log(Math.max(1e-12, p)) +
      (1 - sample.y) * Math.log(Math.max(1e-12, 1 - p));
  }
  return samples.length > 0 ? total / samples.length : 0;
}

/** Eliminación gaussiana con pivoteo parcial. */
function solveLinear(
  matrix: Float64Array[],
  vector: Float64Array,
  size: number
): Float64Array {
  const a = matrix.map((row) => Float64Array.from(row));
  const b = Float64Array.from(vector);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    }
    if (pivot !== column) {
      [a[column], a[pivot]] = [a[pivot], a[column]];
      [b[column], b[pivot]] = [b[pivot], b[column]];
    }
    const divisor = a[column][column];
    if (Math.abs(divisor) < 1e-12) continue;
    for (let row = column + 1; row < size; row++) {
      const factor = a[row][column] / divisor;
      if (factor === 0) continue;
      for (let inner = column; inner < size; inner++) {
        a[row][inner] -= factor * a[column][inner];
      }
      b[row] -= factor * b[column];
    }
  }
  const solution = new Float64Array(size);
  for (let row = size - 1; row >= 0; row--) {
    let sum = b[row];
    for (let column = row + 1; column < size; column++) {
      sum -= a[row][column] * solution[column];
    }
    solution[row] = Math.abs(a[row][row]) < 1e-12 ? 0 : sum / a[row][row];
  }
  return solution;
}

/** Inversa por Gauss-Jordan con pivoteo parcial. */
function invert(matrix: Float64Array[], size: number): Float64Array[] {
  const a = matrix.map((row) => Float64Array.from(row));
  const inverse = Array.from({ length: size }, (_, row) => {
    const unit = new Float64Array(size);
    unit[row] = 1;
    return unit;
  });
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    }
    if (pivot !== column) {
      [a[column], a[pivot]] = [a[pivot], a[column]];
      [inverse[column], inverse[pivot]] = [inverse[pivot], inverse[column]];
    }
    const divisor = a[column][column];
    if (Math.abs(divisor) < 1e-12) continue;
    for (let inner = 0; inner < size; inner++) {
      a[column][inner] /= divisor;
      inverse[column][inner] /= divisor;
    }
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = a[row][column];
      if (factor === 0) continue;
      for (let inner = 0; inner < size; inner++) {
        a[row][inner] -= factor * a[column][inner];
        inverse[row][inner] -= factor * inverse[column][inner];
      }
    }
  }
  return inverse;
}

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------

interface ReportInput {
  options: TeamOptions;
  species: SpeciesAggregate[];
  compositions: CompositionAggregate[];
  duos: DuoAggregate[];
  rating: RatingResult;
  matches: TeamMatchResult[];
  wallSeconds: number;
  commit: string;
  teamSize: number;
  teamAId: Team;
  sideWinRate: { red: number; total: number; wins: number };
}

function buildMarkdown(input: ReportInput): string {
  const {
    options,
    species,
    compositions,
    duos,
    rating,
    matches,
    wallSeconds,
    teamSize,
    teamAId,
    sideWinRate
  } = input;
  const lines: string[] = [];
  const decisive = matches.filter((match) => match.winner !== 'draw').length;
  const totalMatches = matches.length;
  const avgDuration =
    totalMatches > 0
      ? matches.reduce((sum, match) => sum + match.duration, 0) / totalMatches
      : 0;
  const avgKills =
    totalMatches > 0
      ? matches.reduce((sum, match) => sum + match.kills, 0) / totalMatches
      : 0;
  const avgScore =
    totalMatches > 0
      ? matches.reduce((sum, match) => sum + match.scoreA + match.scoreB, 0) /
        (2 * totalMatches)
      : 0;
  const byReason = {
    ko: matches.filter((match) => match.endReason === 'koTarget').length,
    time: matches.filter((match) => match.endReason === 'timeLimit').length,
    score: matches.filter((match) => match.endReason === 'scoreTarget').length
  };

  lines.push(`# Balance ${teamSize}v${teamSize} simulado`);
  lines.push('');
  lines.push(
    `> Generado el ${new Date().toISOString().slice(0, 10)} a partir de \`${input.commit}\`. ` +
      'Se regenera con `pnpm balance:teams`. Motor real de `scripts/sim-headless.ts`, ' +
      'sin PlayCanvas, GPU ni audio.'
  );
  lines.push('');
  lines.push('## Metodología');
  lines.push('');
  lines.push(
    `- **${teamSize}v${teamSize} real**: ${teamSize * 2} bots, mismos spawns, ` +
      'colisiones, cooldowns, respawn, curación, control y límite de tiempo que `Game`.'
  );
  lines.push(
    `- Partidas completas de hasta **${options.seconds} s** en modo **${options.mode}**` +
      (options.mode === 'tdm' ? ` con ${options.kos} KOs por equipo.` : '.')
  );
  lines.push(
    `- **${options.design === 'random' ? 'Muestreo aleatorio' : 'Round-robin de composiciones'}**: ` +
      (options.design === 'random'
        ? `cada emparejamiento sortea ${teamSize} especies distintas por equipo, ` +
          'así cada especie aparece con compañeros variados y se puede aislar su aporte.'
        : `se juegan todas las parejas de las ${options.teams?.length ?? 0} composiciones dadas. ` +
          'En este diseño las especies están anidadas en pocas composiciones: usa la ' +
          'tabla de composiciones, no el rating individual.')
  );
  lines.push(
    '- Cada emparejamiento se juega en las **dos orientaciones de spawn** y con ' +
      `**${options.seeds} ${options.seeds === 1 ? 'semilla' : 'semillas'}** reproducibles.`
  );
  lines.push(
    `- Bots **${options.difficulty}** e instinto común **${options.common}** para todos. ` +
      'El instinto es un eje aparte: repetir con `--common impulso` y `--common regeneracion`.'
  );
  lines.push(
    '- **Rating**: regresión logística con efecto de lado. θ es la contribución ' +
      'marginal de la especie en log-odds; el rating la escala a Elo ' +
      '(1500 + θ · 173.7). 100 puntos ≈ 64 % en un intercambio equilibrado.'
  );
  lines.push(
    '- Limitaciones: los bots no juegan como humanos; el arnés no genera los ' +
      'colliders de árboles/rocas ni simula objetos recogibles, así que el valor ' +
      'de áreas, escondites y pociones está subestimado. Las partidas acaban por ' +
      `límite de tiempo o por ${options.kos} KOs, no por una partida de lobby completa.`
  );
  lines.push('');
  lines.push(
    `Partidas jugadas: **${totalMatches.toLocaleString('es-ES')}** ` +
      `(${decisive.toLocaleString('es-ES')} decididas, ` +
      `${(totalMatches - decisive).toLocaleString('es-ES')} empates) · ` +
      `Duración media: **${fmtSeconds(avgDuration)}** · ` +
      `KOs por partida: **${fmt(avgKills, 1)}** · ` +
      `Marcador medio por equipo: **${fmt(avgScore, 1)}** · ` +
      `Tiempo de pared: **${wallSeconds.toFixed(1)} s**.`
  );
  lines.push('');
  lines.push(
    `Finalizadas por KO: **${byReason.ko}** · por tiempo: **${byReason.time}**` +
      (byReason.score > 0 ? ` · por objetivo: **${byReason.score}**` : '') +
      '. Si la mayoría acaba por tiempo, el resultado depende del límite elegido y ' +
      'conviene repetir la tanda con 180/300/480 s.'
  );
  lines.push('');
  lines.push(
    `Sesgo de lado: el primer equipo del mapa (\`${teamAId}\`) gana ` +
      `**${pct(sideWinRate.red)}** de ${sideWinRate.total} partidas ` +
      `(${sideWinRate.wins} victorias). Al jugar las dos orientaciones, ` +
      'el sesgo se cancela en las comparaciones, pero una desviación grande avisa ' +
      'de un problema de mapa o de spawns.'
  );
  lines.push('');

  const ranked = [...species].sort((left, right) => {
    const ratingLeft = rating.rating.get(left.id) ?? 1500;
    const ratingRight = rating.rating.get(right.id) ?? 1500;
    return ratingRight - ratingLeft || right.wins - left.wins;
  });

  lines.push('## Contribución por especie en 4v4');
  lines.push('');
  lines.push(
    'Ordenado por rating. `±95%` es el margen del intervalo del 95 % del rating ' +
      '(1,96 × error estándar), no del winrate. ' +
      '`Winrate` es el resultado bruto del equipo cuando la especie está presente; ' +
      'está confundido por los compañeros, así que la columna que decide es `Rating`. ' +
      '`% daño` es la cuota media del daño total de su equipo. `Sin daño` cuenta ' +
      'partidas en las que no hizo ningún daño.'
  );
  lines.push('');
  lines.push(
    '| # | Pokémon | Tipos | PV | Vel | Rating | ±95% | Winrate (IC95) | Partidas | Gana | Pierde | Empata | KOs | Muertes | K/D | Daño/partida | % daño | Curación/partida | Sin daño |'
  );
  lines.push(
    '| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
  );
  ranked.forEach((aggregate, position) => {
    const value = rating.rating.get(aggregate.id);
    const error = rating.error.get(aggregate.id);
    const kd =
      aggregate.deaths > 0
        ? aggregate.kills / aggregate.deaths
        : aggregate.kills > 0
          ? Infinity
          : 0;
    lines.push(
      `| ${position + 1} | ${aggregate.name} | ${typesLabel(aggregate.types)} | ` +
        `${aggregate.maxHp} | ${fmt(aggregate.speed, 1)} | ` +
        `${value === undefined ? '—' : fmt(value, 0)} | ` +
        `${error === undefined ? '—' : `±${fmt(error * 1.96, 0)}`} | ` +
        `${pct(winRate(aggregate))} ±${fmt(
          wilsonHalf(aggregate.wins, aggregate.appearances) * 100,
          0
        )} | ${aggregate.appearances} | ${aggregate.wins} | ` +
        `${aggregate.losses} | ${aggregate.draws} | ${aggregate.kills} | ` +
        `${aggregate.deaths} | ${kd === Infinity ? '∞' : fmt(kd, 2)} | ` +
        `${fmt(average(aggregate.damageDealt, aggregate.appearances) ?? 0)} | ` +
        `${pct(average(aggregate.damageShareSum, aggregate.appearances) ?? 0)} | ` +
        `${fmt(average(aggregate.healing, aggregate.appearances) ?? 0)} | ` +
        `${aggregate.zeroDamage} |`
    );
  });
  lines.push('');

  lines.push('### Lectura rápida');
  lines.push('');
  if (ranked.length > 0) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    lines.push(
      `- Mejor contribución: **${best.name}** ` +
        `(${fmt(rating.rating.get(best.id) ?? 1500, 0)}). ` +
        `Peor: **${worst.name}** ` +
        `(${fmt(rating.rating.get(worst.id) ?? 1500, 0)}).`
    );
    const appearances = ranked.map((aggregate) => aggregate.appearances);
    const minAppearances = Math.min(...appearances);
    const maxAppearances = Math.max(...appearances);
    lines.push(
      `- Cobertura: cada especie apareció entre **${minAppearances}** y ` +
        `**${maxAppearances}** partidas. Por debajo de ~50 apariciones el rating ` +
        'es provisional; sube `--pairs` o `--seeds` antes de nerfear o buffar.'
    );
    const above = ranked.filter((aggregate) => {
      const value = rating.rating.get(aggregate.id);
      const error = rating.error.get(aggregate.id);
      return value !== undefined && error !== undefined && value - 1.96 * error > 1500;
    });
    const below = ranked.filter((aggregate) => {
      const value = rating.rating.get(aggregate.id);
      const error = rating.error.get(aggregate.id);
      return value !== undefined && error !== undefined && value + 1.96 * error < 1500;
    });
    if (above.length > 0) {
      lines.push(
        `- **Por encima de la media con significación**: ${above
          .map((aggregate) => aggregate.name)
          .join(', ')}.`
      );
    } else {
      lines.push(
        '- Ninguna especie queda por encima de la media con significación del 95 %: ' +
          'hacen falta más partidas.'
      );
    }
    if (below.length > 0) {
      lines.push(
        `- **Por debajo de la media con significación**: ${below
          .map((aggregate) => aggregate.name)
          .join(', ')}.`
      );
    } else {
      lines.push(
        '- Ninguna especie queda por debajo de la media con significación del 95 %.'
      );
    }

    const highDamageLowRating = ranked
      .filter((aggregate) => {
        const share = average(aggregate.damageShareSum, aggregate.appearances) ?? 0;
        const value = rating.rating.get(aggregate.id) ?? 1500;
        return share >= 0.3 && value < 1500;
      })
      .slice(0, 5);
    if (highDamageLowRating.length > 0) {
      lines.push(
        '- **Daño sin impacto**: ' +
          highDamageLowRating
            .map(
              (aggregate) =>
                `${aggregate.name} (${pct(
                  average(aggregate.damageShareSum, aggregate.appearances) ?? 0
                )} del daño, ${fmt(rating.rating.get(aggregate.id) ?? 1500, 0)} rating)`
            )
            .join(', ') +
          '. Revisar si su daño es disperso, tarde o no convierte en KOs.'
      );
    }

    const supports = [...ranked]
      .filter(
        (aggregate) =>
          (average(aggregate.healing, aggregate.appearances) ?? 0) > 0
      )
      .sort(
        (left, right) =>
          (average(right.healing, right.appearances) ?? 0) -
          (average(left.healing, left.appearances) ?? 0)
      )
      .slice(0, 5);
    if (supports.length > 0) {
      lines.push(
        '- **Soporte**: ' +
          supports
            .map(
              (aggregate) =>
                `${aggregate.name} (${fmt(
                  average(aggregate.healing, aggregate.appearances) ?? 0
                )} PV/partida, ${fmt(
                  rating.rating.get(aggregate.id) ?? 1500,
                  0
                )} rating)`
            )
            .join(', ') +
          '.'
      );
    }

    const deaths = [...ranked]
      .sort(
        (left, right) =>
          (average(right.deaths, right.appearances) ?? 0) -
          (average(left.deaths, left.appearances) ?? 0)
      )
      .slice(0, 5);
    lines.push(
      '- **Más muertes por partida**: ' +
        deaths
          .map(
            (aggregate) =>
              `${aggregate.name} (${fmt(
                average(aggregate.deaths, aggregate.appearances) ?? 0,
                1
              )})`
          )
          .join(', ') +
        '.'
    );

    const zero = ranked.filter(
      (aggregate) => aggregate.zeroDamage / Math.max(1, aggregate.appearances) > 0.2
    );
    if (zero.length > 0) {
      lines.push(
        '- **Kits que no conectan**: ' +
          zero
            .slice(0, 8)
            .map(
              (aggregate) =>
                `${aggregate.name} (${aggregate.zeroDamage}/${aggregate.appearances} sin daño)`
            )
            .join(', ') +
          '. Revisar alcance, tiempos o inmunidades de tipo.'
      );
    }
  }
  lines.push('');

  if (options.design === 'robin') {
    lines.push('## Composiciones');
    lines.push('');
    lines.push(
      'Round-robin de las composiciones indicadas. `KOs` y `daño` son por partida; ' +
        '`marcador` es el del modo (KOs en tdm o puntos en koth).'
    );
    lines.push('');
    lines.push(
      '| # | Composición | Winrate | Partidas | Gana | Pierde | Empata | KOs | KOs rival | Daño | Marcador | Duración |'
    );
    lines.push(
      '| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
    );
    const sortedComps = [...compositions].sort(
      (left, right) => winRate(right) - winRate(left)
    );
    sortedComps.forEach((aggregate, position) => {
      const names = aggregate.team.map(
        (id) => input.species.find((entry) => entry.id === id)?.name ?? id
      );
      lines.push(
        `| ${position + 1} | ${names.join(' + ')} | **${pct(winRate(aggregate))}** | ` +
          `${aggregate.appearances} | ${aggregate.wins} | ${aggregate.losses} | ` +
          `${aggregate.draws} | ${fmt(
            average(aggregate.killsFor, aggregate.appearances) ?? 0,
            1
          )} | ${fmt(
            average(aggregate.killsAgainst, aggregate.appearances) ?? 0,
            1
          )} | ${fmt(
            average(aggregate.damageFor, aggregate.appearances) ?? 0
          )} | ${fmt(
            average(aggregate.scoreFor, aggregate.appearances) ?? 0,
            1
          )} | ${fmtSeconds(
            average(aggregate.duration, aggregate.appearances) ?? 0
          )} |`
      );
    });
  } else {
    lines.push('## Sinergias por pareja');
    lines.push('');
    lines.push(
      `Parejas que aparecieron al menos **${options.minDuo}** veces. ` +
        '`Lift` es la diferencia entre el winrate de la pareja y la media de los ' +
        'winrates brutos de sus dos miembros; positivo sugiere sinergia, negativo ' +
        'solapamiento o anti-sinergia. Es una señal exploratoria, no una prueba causal.'
    );
    lines.push('');
    const eligible = duos
      .filter((duo) => duo.appearances >= options.minDuo)
      .map((duo) => {
        const left = species.find((entry) => entry.id === duo.a);
        const right = species.find((entry) => entry.id === duo.b);
        const lift =
          winRate(duo) -
          ((left ? winRate(left) : 0) + (right ? winRate(right) : 0)) / 2;
        return {
          duo,
          left: left?.name ?? duo.a,
          right: right?.name ?? duo.b,
          lift,
          rate: winRate(duo)
        };
      })
      .sort((left, right) => right.rate - left.rate);
    if (eligible.length === 0) {
      lines.push(
        'No hay parejas con suficientes apariciones; sube `--pairs` o baja `--min-duo`.'
      );
    } else {
      lines.push(
        '| Pareja | Winrate | Partidas | Lift |'
      );
      lines.push('| --- | ---: | ---: | ---: |');
      const best = eligible.slice(0, 10);
      const shown = new Set(best.map((entry) => entry.duo.key));
      const worst = eligible
        .slice()
        .reverse()
        .filter((entry) => !shown.has(entry.duo.key))
        .slice(0, 10);
      for (const entry of [...best, ...worst]) {
        lines.push(
          `| ${entry.left} + ${entry.right} | ${pct(entry.rate)} | ` +
            `${entry.duo.appearances} | ${entry.lift >= 0 ? '+' : ''}${(
              entry.lift * 100
            ).toFixed(0)} pts |`
        );
      }
    }
  }
  lines.push('');

  lines.push('## Cómo tomar decisiones con esto');
  lines.push('');
  lines.push(
    '1. **Nerf/buff de especie**: ordena por rating y mira el ±95 %. Si el intervalo ' +
      'no cruza 1500, la señal es consistente; si lo cruza, sube `--pairs`/`--seeds` ' +
      'antes de tocar números.'
  );
  lines.push(
    '2. **Composición**: en `--design robin` compara las composiciones con más ' +
      'partidas. En `--design random` usa las parejas con lift positivo como ' +
      'hipótesis para una segunda tanda cerrada.'
  );
  lines.push(
    '3. **Rol**: `% daño` alto con rating bajo sugiere daño disperso o tardío; ' +
      'curación alta con rating alto confirma soporte; muertes altas apuntan a ' +
      'problemas de supervivencia o de posicionamiento del bot.'
  );
  lines.push(
    '4. **Validación**: cualquier cambio de números debe repetir la misma semilla y ' +
      'comparar ratings, no solo winrates. El `pnpm balance` 1v1 sigue siendo útil ' +
      'para medir fuerza de duelo; esta prueba mide el valor en el modo principal.'
  );
  lines.push('');
  lines.push('## Cómo regenerar');
  lines.push('');
  lines.push('```bash');
  lines.push('pnpm balance:teams');
  lines.push('pnpm balance:teams --pairs 250 --seeds 3 --seconds 300');
  lines.push('pnpm balance:teams --pairs 20 --seeds 1 --seconds 120');
  lines.push(
    'pnpm balance:teams --design robin --teams "0025,0094,0658,0007;0130,0245,0382,0384"'
  );
  lines.push('```');
  lines.push('');
  lines.push(
    'Datos crudos en `.cache/balance-teams.json` (partidas, agregados, ratings y ' +
      'configuración).'
  );
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(path.resolve('public/sprites/manifest.json'));
  const map = loadMapFile(options.map);
  if (map.teams.length !== 2) {
    throw new Error(
      `El mapa "${options.map}" tiene ${map.teams.length} equipos. ` +
        'Esta prueba es 2 equipos vs 2 equipos; usa un mapa de dos equipos.'
    );
  }
  const teamAId = map.teams[0];
  const teamBId = map.teams[1];

  const available = [...manifest.keys()].filter((id) => MOVESETS[id]);
  const pool = [...new Set(options.pool ?? available)];
  if (pool.length < options.size * 2) {
    throw new Error(
      `El pool tiene ${pool.length} especies y hacen falta ${options.size * 2} ` +
        'distintas por partida; añade especies o baja --size'
    );
  }
  const missingMoveset = pool.filter((id) => !MOVESETS[id]);
  if (missingMoveset.length > 0) {
    throw new Error(
      `Estas especies no tienen moveset: ${missingMoveset.join(', ')}`
    );
  }
  const unknown = pool.filter((id) => !manifest.has(id));
  if (unknown.length > 0) {
    throw new Error(`Especies fuera del manifiesto: ${unknown.join(', ')}`);
  }
  if (options.teams) {
    const teamSpecies = [...new Set(options.teams.flat())];
    const unavailable = teamSpecies.filter(
      (id) => !manifest.has(id) || !MOVESETS[id]
    );
    if (unavailable.length > 0) {
      throw new Error(
        `Especies de --teams sin manifiesto o sin moveset: ${unavailable.join(', ')}`
      );
    }
  }

  if (options.design === 'robin' && !options.teams) {
    throw new Error('--design robin necesita --teams con al menos dos composiciones');
  }

  const species = createSpeciesAggregates(pool, manifest);
  const compositions = new Map<string, CompositionAggregate>();
  const duos = new Map<string, DuoAggregate>();
  const matches: TeamMatchResult[] = [];
  const samples: Array<{ red: string[]; blue: string[]; y: 0 | 1 }> = [];

  const base: Options = {
    map: options.map,
    bots: options.size * 2,
    seconds: options.seconds,
    difficulty: options.difficulty,
    seed: 0,
    trace: null,
    every: 1,
    json: null,
    mode: options.mode,
    timeLimit: options.seconds,
    maxKos: options.kos,
    pokemon: [],
    common: options.common,
    duel: false,
    quiet: true
  };
  const maxSteps = Math.round(options.seconds / FIXED_STEP) + 2;

  const pairings: Array<{ a: string[]; b: string[] }> = [];
  if (options.design === 'robin') {
    const comps = options.teams ?? [];
    for (let left = 0; left < comps.length; left++) {
      for (let right = left + 1; right < comps.length; right++) {
        pairings.push({ a: comps[left], b: comps[right] });
      }
    }
  } else {
    for (let pair = 0; pair < options.pairs; pair++) {
      const rng = mulberry32(hashSeed(0x5eed, pair));
      const shuffled = shuffle([...pool], rng);
      pairings.push({
        a: shuffled.slice(0, options.size),
        b: shuffled.slice(options.size, options.size * 2)
      });
    }
  }

  const totalMatches = pairings.length * 2 * options.seeds;
  const started = performance.now();
  let played = 0;
  const progress = (): void => {
    if (options.quiet) return;
    const elapsed = (performance.now() - started) / 1000;
    const rate = played / Math.max(0.001, elapsed);
    const remaining = rate > 0 ? (totalMatches - played) / rate : 0;
    const percent =
      totalMatches > 0 ? (played / totalMatches) * 100 : 0;
    process.stdout.write(
      `\rPartidas ${played}/${totalMatches} (${percent.toFixed(1)}%) · ` +
        `${elapsed.toFixed(0)} s · quedan ~${remaining.toFixed(0)} s   `
    );
  };

  pairings.forEach((pairing, pairIndex) => {
    for (let orientation = 0; orientation < 2; orientation++) {
      const teamA = orientation === 0 ? pairing.a : pairing.b;
      const teamB = orientation === 0 ? pairing.b : pairing.a;
      for (let seedIndex = 0; seedIndex < options.seeds; seedIndex++) {
        const seed = hashSeed(pairIndex, orientation, seedIndex);
        const result = runTeamMatch({
          map,
          manifest,
          base,
          teamA,
          teamB,
          seed,
          orientation: orientation as 0 | 1,
          maxSteps,
          teamAId,
          teamBId
        });
        matches.push(result);
        recordMatch({
          result,
          aggregates: species,
          compositions,
          duos
        });
        if (result.winner !== 'draw') {
          samples.push({
            red: [...teamA],
            blue: [...teamB],
            y: result.winner === 'a' ? 1 : 0
          });
        }
        played += 1;
        progress();
      }
    }
  });

  if (!options.quiet) {
    const elapsed = (performance.now() - started) / 1000;
    process.stdout.write(
      `\rPartidas ${totalMatches}/${totalMatches} (100.0%) · ` +
        `${elapsed.toFixed(0)} s\n`
    );
  }

  const rating = fitRating(samples, pool);
  const wallSeconds = (performance.now() - started) / 1000;
  const redWins = matches.filter(
    (match) => match.winnerTeam === teamAId && match.winner !== 'draw'
  ).length;
  const sideWinRate = {
    red: matches.length > 0 ? redWins / matches.length : 0,
    total: matches.length,
    wins: redWins
  };

  const markdown = buildMarkdown({
    options,
    species: [...species.values()].filter(
      (aggregate) => aggregate.appearances > 0
    ),
    compositions: [...compositions.values()],
    duos: [...duos.values()],
    rating,
    matches,
    wallSeconds,
    commit: commitHash(),
    teamSize: options.size,
    teamAId,
    sideWinRate
  });

  mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
  writeFileSync(path.resolve(options.out), markdown);

  if (options.json) {
    mkdirSync(path.dirname(path.resolve(options.json)), { recursive: true });
    const payload = {
      generatedAt: new Date().toISOString(),
      commit: commitHash(),
      config: options,
      wallSeconds: Number(wallSeconds.toFixed(2)),
      sideWinRate,
      rating: {
        values: Object.fromEntries(rating.rating),
        errors: Object.fromEntries(rating.error),
        sideBias: rating.sideBias,
        sideError: rating.sideError,
        logLoss: rating.logLoss,
        samples: rating.samples
      },
      species: [...species.values()].map((aggregate) => ({
        ...aggregate,
        winrate: winRate(aggregate),
        damageShare:
          average(aggregate.damageShareSum, aggregate.appearances) ?? 0,
        rating: rating.rating.get(aggregate.id) ?? null,
        ratingError: rating.error.get(aggregate.id) ?? null,
        ratingError95:
          (rating.error.get(aggregate.id) ?? 0) * 1.96 || null
      })),
      compositions: [...compositions.values()],
      duos: [...duos.values()],
      matches
    };
    writeFileSync(
      path.resolve(options.json),
      `${JSON.stringify(payload, null, 2)}\n`
    );
  }

  if (!options.quiet) {
    console.log(
      `Listo: ${matches.length} partidas ${options.size}v${options.size} en ` +
        `${wallSeconds.toFixed(1)} s · ` +
        `${matches.filter((match) => match.winner !== 'draw').length} decididas`
    );
    console.log(`Informe: ${path.resolve(options.out)}`);
    if (options.json) console.log(`Datos: ${path.resolve(options.json)}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
