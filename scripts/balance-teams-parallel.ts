#!/usr/bin/env node
/**
 * Balance 4v4 en paralelo con Piscina.
 *
 * Misma metodología que `scripts/balance-teams.ts` (emparejamientos
 * deterministas, dos orientaciones, semillas reproducibles, rating
 * Bradley-Terry), pero reparte los emparejamientos entre workers.
 *
 * Uso:
 *   node --import tsx scripts/balance-teams-parallel.ts \
 *     --pairs 80 --seeds 2 --workers 4 \
 *     --out .cache/teams.md --json .cache/teams.json
 *
 *   node --import tsx scripts/balance-teams-parallel.ts \
 *     --patch .cache/teams-patch.json --pairs 40 --seeds 2 --workers 4
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { Piscina } from 'piscina';

import { MOVESETS, type CommonAbilityId } from '../src/game/abilities';
import { baseStatsFor, combatStatsFor } from '../src/game/pokedex';
import { hitRadiusForPokemon, speedForPokemon } from '../src/game/roster';
import { loadManifest, loadMapFile, mulberry32, type Options } from './sim-headless';
import { applyTeamsPatch, type TeamsPatch } from './teams-patch';
import { fitRating, type RatingSample } from './teams-rating';
import type {
  WorkerMatchResult,
  WorkerTask
} from './teams-parallel-worker';

const FIXED_STEP = 1 / 60;

interface OptionsCli {
  map: string;
  mode: Options['mode'];
  seconds: number;
  kos: number;
  seeds: number;
  difficulty: Options['difficulty'];
  common: CommonAbilityId;
  design: 'random' | 'robin';
  pairs: number;
  teams: string[][] | null;
  size: number;
  pool: string[] | null;
  workers: number;
  patch: string | null;
  out: string;
  json: string | null;
  quiet: boolean;
}

function parseArgs(argv: readonly string[]): OptionsCli {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Argumento no reconocido: ${arg}`);
    const key = arg.slice(2);
    if (key === 'quiet' || key === 'help' || key === 'h') {
      values.set(key, 'true');
      continue;
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Falta el valor de --${key}`);
    }
    values.set(key, value);
  }
  if (values.has('help') || values.has('h')) {
    console.log(
      'Uso: balance-teams-parallel --pairs 40 --seeds 2 --workers 4 [--patch file]'
    );
    process.exit(0);
  }
  const positive = (key: string, fallback: number) => {
    const value = Number(values.get(key) ?? fallback);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`--${key} inválido`);
    return value;
  };
  const size = positive('size', 4);
  if (size > 4) throw new Error('--size máximo 4');
  const difficulty = (values.get('difficulty') ?? 'expert') as Options['difficulty'];
  if (!['easy', 'normal', 'hard', 'expert', 'adaptive'].includes(difficulty)) {
    throw new Error('--difficulty debe ser easy, normal, hard, expert o adaptive');
  }
  const common = (values.get('common') ?? 'proteccion') as CommonAbilityId;
  if (!['proteccion', 'impulso', 'regeneracion'].includes(common)) {
    throw new Error('--common debe ser proteccion, impulso o regeneracion');
  }
  const mode = (values.get('mode') ?? 'tdm') as Options['mode'];
  if (mode !== 'tdm' && mode !== 'koth') throw new Error('--mode debe ser tdm o koth');
  const design = (values.get('design') ?? 'random') as 'random' | 'robin';
  if (design !== 'random' && design !== 'robin') {
    throw new Error('--design debe ser random o robin');
  }
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
  return {
    map: values.get('map') ?? 'arena',
    mode,
    seconds: positive('seconds', 300),
    kos: positive('kos', 15),
    seeds: positive('seeds', 2),
    difficulty,
    common,
    design,
    pairs: positive('pairs', 80),
    teams,
    size,
    pool: values.get('pool')
      ? values
          .get('pool')!
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : null,
    workers: positive('workers', os.availableParallelism()),
    patch: values.get('patch') ?? null,
    out: values.get('out') ?? '.cache/balance-teams-parallel.md',
    json: values.get('json') ?? null,
    quiet: values.has('quiet')
  };
}

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

function commitHash(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8'
    }).trim();
  } catch {
    return 'desconocido';
  }
}

interface Aggregate {
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

function applyTeam(
  aggregates: Map<string, Aggregate>,
  players: WorkerMatchResult['playersA'],
  outcome: 'win' | 'loss' | 'draw'
): void {
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
    aggregate.damageShareSum += teamDamage > 0 ? player.damageDealt / teamDamage : 0;
    if (outcome === 'win' && player.maxHp > 0) {
      aggregate.hpLeftOnWin += player.hp / player.maxHp;
    }
    if (player.damageDealt <= 0) aggregate.zeroDamage += 1;
    if (player.kills <= 0) aggregate.zeroKills += 1;
  }
}

function main(): void {
  const cli = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(path.resolve('public/sprites/manifest.json'));
  const map = loadMapFile(cli.map);
  if (map.teams.length !== 2) {
    throw new Error(`El mapa "${cli.map}" necesita exactamente dos equipos`);
  }
  const teamAId = map.teams[0];
  const teamBId = map.teams[1];
  const available = [...manifest.keys()].filter((id) => MOVESETS[id]);
  const pool = [...new Set(cli.pool ?? available)];
  if (pool.length < cli.size * 2) {
    throw new Error(`El pool necesita al menos ${cli.size * 2} especies`);
  }
  const missing = pool.filter((id) => !MOVESETS[id] || !manifest.has(id));
  if (missing.length > 0) {
    throw new Error(`Especies sin moveset o manifiesto: ${missing.join(', ')}`);
  }

  const patch = cli.patch
    ? (JSON.parse(readFileSync(path.resolve(cli.patch), 'utf8')) as TeamsPatch)
    : null;
  applyTeamsPatch(patch);

  const aggregates = new Map<string, Aggregate>();
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

  const pairings: Array<{ pairIndex: number; a: string[]; b: string[] }> = [];
  if (cli.design === 'robin') {
    const comps = cli.teams ?? [];
    if (comps.length < 2) throw new Error('--design robin necesita --teams');
    let pairIndex = 0;
    for (let left = 0; left < comps.length; left++) {
      for (let right = left + 1; right < comps.length; right++) {
        pairings.push({ pairIndex: pairIndex++, a: comps[left], b: comps[right] });
      }
    }
  } else {
    for (let pair = 0; pair < cli.pairs; pair++) {
      const rng = mulberry32(hashSeed(0x5eed, pair));
      const shuffled = shuffle([...pool], rng);
      pairings.push({
        pairIndex: pair,
        a: shuffled.slice(0, cli.size),
        b: shuffled.slice(cli.size, cli.size * 2)
      });
    }
  }

  const base: Options = {
    map: cli.map,
    bots: cli.size * 2,
    seconds: cli.seconds,
    difficulty: cli.difficulty,
    seed: 0,
    trace: null,
    every: 1,
    json: null,
    mode: cli.mode,
    timeLimit: cli.seconds,
    maxKos: cli.kos,
    pokemon: [],
    common: cli.common,
    duel: false,
    quiet: true
  };
  const maxSteps = Math.round(cli.seconds / FIXED_STEP) + 2;

  const poolThreads = new Piscina({
    filename: new URL('./teams-parallel-worker.ts', import.meta.url).href,
    maxThreads: Math.min(cli.workers, pairings.length),
    execArgv: ['--import', 'tsx']
  });

  const started = performance.now();
  const total = pairings.length * 2 * cli.seeds;
  let played = 0;
  const progress = () => {
    if (cli.quiet) return;
    const elapsed = (performance.now() - started) / 1000;
    const rate = played / Math.max(0.001, elapsed);
    process.stdout.write(
      `\rPartidas ${played}/${total} · ${elapsed.toFixed(0)} s · quedan ~${(
        (total - played) / Math.max(0.001, rate)
      ).toFixed(0)} s   `
    );
  };

  const tasks = pairings.map((pairing) => {
    const task: WorkerTask = {
      patch,
      map: cli.map,
      options: base,
      maxSteps,
      teamAId,
      teamBId,
      pairings: [pairing],
      seeds: cli.seeds
    };
    return (poolThreads.run(task) as Promise<WorkerMatchResult[]>).then((results) => {
      played += results.length;
      progress();
      return results;
    });
  });

  void Promise.all(tasks).then((chunks) => {
    const matches = chunks.flat();
    const samples: RatingSample[] = [];
    for (const result of matches) {
      const outcomeA = result.winner === 'a' ? 'win' : result.winner === 'b' ? 'loss' : 'draw';
      const outcomeB = result.winner === 'b' ? 'win' : result.winner === 'a' ? 'loss' : 'draw';
      applyTeam(aggregates, result.playersA, outcomeA);
      applyTeam(aggregates, result.playersB, outcomeB);
      if (result.winner !== 'draw') {
        samples.push({
          red: result.a,
          blue: result.b,
          y: result.winner === 'a' ? 1 : 0
        });
      }
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

    const species = [...aggregates.values()]
      .filter((aggregate) => aggregate.appearances > 0)
      .map((aggregate) => ({
        ...aggregate,
        winrate:
          aggregate.appearances > 0 ? aggregate.wins / aggregate.appearances : 0,
        damageShare:
          aggregate.appearances > 0
            ? aggregate.damageShareSum / aggregate.appearances
            : 0,
        rating: rating.rating.get(aggregate.id) ?? null,
        ratingError: rating.error.get(aggregate.id) ?? null,
        ratingError95: (rating.error.get(aggregate.id) ?? 0) * 1.96 || null
      }))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

    const avgDuration =
      matches.reduce((sum, match) => sum + match.duration, 0) / matches.length;
    const avgKills =
      matches.reduce((sum, match) => sum + match.kills, 0) / matches.length;

    const lines: string[] = [];
    lines.push('# Balance 4v4 en paralelo (Piscina)');
    lines.push('');
    lines.push(
      `> ${matches.length} partidas · ${cli.pairs} emparejamientos × 2 orientaciones ` +
        `× ${cli.seeds} semillas · ${cli.workers} workers · commit \`${commitHash()}\``
    );
    lines.push('');
    lines.push(
      `Duración media **${avgDuration.toFixed(1)} s** · KOs/partida **${avgKills.toFixed(
        1
      )}** · **${(avgDuration / Math.max(0.001, avgKills)).toFixed(1)} s/KO** · ` +
        `sesgo de lado ${(sideWinRate.red * 100).toFixed(0)} % (${sideWinRate.wins}/${sideWinRate.total}).`
    );
    lines.push('');
    lines.push('| # | Pokémon | Rating | ±95 | Winrate | Partidas | K/D | Daño/part. | % daño | Curación/part. |');
    lines.push('| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    species.forEach((entry, index) => {
      lines.push(
        `| ${index + 1} | ${entry.name} | ${Math.round(entry.rating ?? 1500)} | ` +
          `${Math.round(entry.ratingError95 ?? 0)} | ${(
            entry.winrate * 100
          ).toFixed(0)} % | ${entry.appearances} | ` +
          `${
            entry.deaths > 0 ? (entry.kills / entry.deaths).toFixed(2) : '—'
          } | ${Math.round(entry.damageDealt / Math.max(1, entry.appearances))} | ` +
          `${Math.round(entry.damageShare * 100)} % | ` +
          `${Math.round(entry.healing / Math.max(1, entry.appearances))} |`
      );
    });
    lines.push('');

    mkdirSync(path.dirname(path.resolve(cli.out)), { recursive: true });
    writeFileSync(path.resolve(cli.out), lines.join('\n'));
    if (cli.json) {
      mkdirSync(path.dirname(path.resolve(cli.json)), { recursive: true });
      writeFileSync(
        path.resolve(cli.json),
        `${JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            commit: commitHash(),
            config: { ...cli, patch },
            wallSeconds: Number(wallSeconds.toFixed(2)),
            sideWinRate,
            species,
            matches
          },
          null,
          2
        )}\n`
      );
    }
    if (!cli.quiet) {
      process.stdout.write(
        `\rListo: ${matches.length} partidas 4v4 en ${wallSeconds.toFixed(
          1
        )} s · ${matches.filter((match) => match.winner !== 'draw').length} decididas\n`
      );
      console.log(`Informe: ${path.resolve(cli.out)}`);
      if (cli.json) console.log(`Datos: ${path.resolve(cli.json)}`);
    }
    void poolThreads.destroy();
  });
}

main();
