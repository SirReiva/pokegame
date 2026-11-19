/**
 * Worker de Piscina para partidas 4v4. Cada tarea ejecuta un lote de
 * emparejamientos y devuelve los resultados crudos.
 */

import type { Team } from '../src/game/terrain';
import {
  HeadlessMatch,
  loadManifest,
  loadMapFile,
  mulberry32,
  type Options,
  type PokemonEntry
} from './sim-headless';
import { applyTeamsPatch, type TeamsPatch } from './teams-patch';

export interface WorkerPlayerLine {
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

export interface WorkerMatchResult {
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
  playersA: WorkerPlayerLine[];
  playersB: WorkerPlayerLine[];
  kills: number;
}

export interface WorkerTask {
  patch: TeamsPatch | null;
  map: string;
  options: Options;
  maxSteps: number;
  teamAId: string;
  teamBId: string;
  pairings: Array<{ pairIndex: number; a: string[]; b: string[] }>;
  seeds: number;
}

let manifestCache: Map<string, PokemonEntry> | null = null;
let mapCache: ReturnType<typeof loadMapFile> | null = null;
let mapIdCache: string | null = null;

function hashSeed(...parts: number[]): number {
  let hash = 2166136261;
  for (const part of parts) {
    hash ^= part + 0x9e3779b9;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function interleave(a: readonly string[], b: readonly string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < a.length; index++) {
    out.push(a[index], b[index]);
  }
  return out;
}

function linesFor(
  summary: ReturnType<HeadlessMatch['summary']>,
  team: string
): WorkerPlayerLine[] {
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

export default function runTask(task: WorkerTask): WorkerMatchResult[] {
  if (!manifestCache) manifestCache = loadManifest('public/sprites/manifest.json');
  if (!mapCache || mapIdCache !== task.map) {
    mapCache = loadMapFile(task.map);
    mapIdCache = task.map;
  }
  applyTeamsPatch(task.patch);

  const results: WorkerMatchResult[] = [];
  for (const pairing of task.pairings) {
    for (let orientation = 0; orientation < 2; orientation++) {
      const teamA = orientation === 0 ? pairing.a : pairing.b;
      const teamB = orientation === 0 ? pairing.b : pairing.a;
      for (let seedIndex = 0; seedIndex < task.seeds; seedIndex++) {
        const seed = hashSeed(pairing.pairIndex, orientation, seedIndex);
        Math.random = mulberry32(seed);
        const match = new HeadlessMatch(
          mapCache,
          { ...task.options, pokemon: interleave(teamA, teamB) },
          manifestCache
        );
        let steps = 0;
        while (steps < task.maxSteps && !match.matchOver) {
          match.step();
          steps += 1;
        }
        const summary = match.summary(0, steps, seed);
        const winnerTeam = summary.winner;
        const winner: WorkerMatchResult['winner'] =
          winnerTeam === null
            ? 'draw'
            : winnerTeam === task.teamAId
              ? 'a'
              : winnerTeam === task.teamBId
                ? 'b'
                : 'draw';
        results.push({
          a: [...teamA],
          b: [...teamB],
          seed,
          orientation: orientation as 0 | 1,
          winner,
          winnerTeam,
          duration: summary.simSeconds,
          endReason: summary.endReason,
          scoreA: summary.scores[task.teamAId as Team] ?? 0,
          scoreB: summary.scores[task.teamBId as Team] ?? 0,
          playersA: linesFor(summary, task.teamAId),
          playersB: linesFor(summary, task.teamBId),
          kills: summary.totals.kills
        });
      }
    }
  }
  return results;
}
