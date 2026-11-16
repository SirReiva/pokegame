#!/usr/bin/env node
/**
 * Informe de balance a partir de duelos 1v1 bot contra bot.
 *
 * Reutiliza el arnés de `scripts/sim-headless.ts` (mismo paso fijo de 60 Hz,
 * mismas fórmulas y mismos sistemas que `Game`) y enfrenta todas las especies
 * con moveset en las dos orientaciones de spawn. Cada duelo termina en el
 * primer KO; si se agota el límite de tiempo, cuenta como empate.
 *
 * Uso:
 *   pnpm balance
 *   pnpm balance --seeds 5 --common regeneracion --seconds 40
 *   pnpm balance --species 0025,0094,0382 --seeds 2 --json .cache/balance.json
 *
 * Salida:
 *   docs/balance-simulacion.md  (tablas + lectura automática)
 *   .cache/balance-report.json  (datos crudos, con --json)
 *
 * La sección marcada con `<!-- propuestas:inicio -->` se conserva al regenerar
 * el informe: ahí vive el análisis curado y las propuestas de ajuste.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  MOVESETS,
  type CommonAbilityId
} from '../src/game/abilities';
import { baseStatsFor, combatStatsFor } from '../src/game/pokedex';
import { hitRadiusForPokemon, speedForPokemon } from '../src/game/roster';
import {
  HeadlessMatch,
  loadManifest,
  loadMapFile,
  mulberry32,
  type Options,
  type PokemonEntry
} from './sim-headless';

const PROPOSALS_MARKER = '<!-- propuestas:inicio -->';
const FIXED_STEP = 1 / 60;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const COMMON_ABILITIES: readonly CommonAbilityId[] = [
  'proteccion',
  'impulso',
  'regeneracion'
];

interface BalanceOptions {
  map: string;
  seeds: number;
  seconds: number;
  difficulty: Options['difficulty'];
  common: CommonAbilityId | 'all';
  species: string[] | null;
  out: string;
  json: string | null;
  quiet: boolean;
}

function parseArgs(argv: readonly string[]): BalanceOptions {
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

  const common = (values.get('common') ?? 'proteccion') as BalanceOptions['common'];
  if (common !== 'all' && !COMMON_ABILITIES.includes(common)) {
    throw new Error('--common debe ser proteccion, impulso, regeneracion o all');
  }

  const seeds = Number(values.get('seeds') ?? 4);
  if (!Number.isInteger(seeds) || seeds < 1) {
    throw new Error('--seeds debe ser un entero positivo');
  }
  const seconds = Number(values.get('seconds') ?? 40);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('--seconds debe ser mayor que cero');
  }

  const speciesValue = values.get('species');
  const species = speciesValue
    ? speciesValue
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : null;

  return {
    map: values.get('map') ?? 'arena',
    seeds,
    seconds,
    difficulty,
    common,
    species,
    out: values.get('out') ?? 'docs/balance-simulacion.md',
    json: values.get('json') ?? '.cache/balance-report.json',
    quiet: values.get('quiet') === 'true'
  };
}

function printHelp(): void {
  console.log(`Informe de balance con duelos 1v1 bot contra bot

Opciones:
  --map <id>          Mapa de public/maps/index.json (por defecto: arena)
  --seeds <n>         Repeticiones por enfrentamiento y orientación (por defecto: 4)
  --seconds <n>       Duración máxima de cada duelo (por defecto: 40)
  --difficulty <d>    easy | normal | hard | expert (por defecto: expert)
  --common <id|all>   Instinto común, igual para ambos (por defecto: proteccion)
  --species <ids>     Lista separada por comas (por defecto: todas con moveset)
  --out <archivo>     Informe markdown (por defecto: docs/balance-simulacion.md)
  --json <archivo>    Datos crudos en JSON (por defecto: .cache/balance-report.json)
  --quiet             No imprime el progreso
  --help              Muestra esta ayuda`);
}

// ---------------------------------------------------------------------------
// Duelos
// ---------------------------------------------------------------------------

interface DuelResult {
  a: string;
  b: string;
  common: CommonAbilityId;
  seed: number;
  winner: 'a' | 'b' | 'draw';
  /** Segundos hasta el primer KO; `null` si el duelo se agotó. */
  ttk: number | null;
  damageA: number;
  damageB: number;
  hpA: number;
  hpB: number;
  maxHpA: number;
  maxHpB: number;
  kills: number;
}

interface MatchupRecord {
  wins: number;
  losses: number;
  draws: number;
}

interface SpeciesAggregate {
  id: string;
  name: string;
  types: string[];
  maxHp: number;
  speed: number;
  hitRadius: number;
  duels: number;
  wins: number;
  losses: number;
  draws: number;
  damageDealt: number;
  damageTaken: number;
  hpLeftOnWin: number;
  ttkOnWin: number;
  zeroDamageDuels: number;
  matchups: Map<string, MatchupRecord>;
}

/** Hash estable para derivar la semilla de cada duelo. */
function hashSeed(...parts: number[]): number {
  let hash = 2166136261;
  for (const part of parts) {
    hash ^= part + 0x9e3779b9;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function runDuel(
  map: ReturnType<typeof loadMapFile>,
  manifest: Map<string, PokemonEntry>,
  base: Options,
  a: string,
  b: string,
  common: CommonAbilityId,
  seed: number,
  maxSteps: number
): DuelResult {
  Math.random = mulberry32(seed);
  const match = new HeadlessMatch(
    map,
    { ...base, pokemon: [a, b], common },
    manifest
  );
  let steps = 0;
  while (steps < maxSteps && !match.matchOver) {
    match.step();
    steps += 1;
  }
  const summary = match.summary(0, steps, seed);
  const firstKill = summary.kills[0];
  let winner: DuelResult['winner'] = 'draw';
  if (firstKill) {
    winner = firstKill.killer === 0 ? 'a' : 'b';
  }
  return {
    a,
    b,
    common,
    seed,
    winner,
    ttk: firstKill ? summary.simSeconds : null,
    damageA: summary.players[0]?.damageDealt ?? 0,
    damageB: summary.players[1]?.damageDealt ?? 0,
    hpA: summary.players[0]?.hp ?? 0,
    hpB: summary.players[1]?.hp ?? 0,
    maxHpA: summary.players[0]?.maxHp ?? 1,
    maxHpB: summary.players[1]?.maxHp ?? 1,
    kills: summary.totals.kills
  };
}

/** Aplica el resultado de un duelo a las dos especies implicadas. */
function recordDuel(
  aggregates: Map<string, SpeciesAggregate>,
  result: DuelResult
): void {
  if (result.a === result.b) return;
  const a = aggregates.get(result.a);
  const b = aggregates.get(result.b);
  if (!a || !b) return;

  const apply = (
    self: SpeciesAggregate,
    rival: SpeciesAggregate,
    outcome: 'win' | 'loss' | 'draw',
    damageDealt: number,
    damageTaken: number,
    hp: number,
    maxHp: number
  ): void => {
    self.duels += 1;
    self.damageDealt += damageDealt;
    self.damageTaken += damageTaken;
    if (damageDealt <= 0) self.zeroDamageDuels += 1;
    let matchup = self.matchups.get(rival.id);
    if (!matchup) {
      matchup = { wins: 0, losses: 0, draws: 0 };
      self.matchups.set(rival.id, matchup);
    }
    if (outcome === 'win') {
      self.wins += 1;
      matchup.wins += 1;
      self.hpLeftOnWin += maxHp > 0 ? hp / maxHp : 0;
      if (result.ttk !== null) self.ttkOnWin += result.ttk;
    } else if (outcome === 'loss') {
      self.losses += 1;
      matchup.losses += 1;
    } else {
      self.draws += 1;
      matchup.draws += 1;
    }
  };

  apply(
    a,
    b,
    result.winner === 'a' ? 'win' : result.winner === 'b' ? 'loss' : 'draw',
    result.damageA,
    result.damageB,
    result.hpA,
    result.maxHpA
  );
  apply(
    b,
    a,
    result.winner === 'b' ? 'win' : result.winner === 'a' ? 'loss' : 'draw',
    result.damageB,
    result.damageA,
    result.hpB,
    result.maxHpB
  );
}

// ---------------------------------------------------------------------------
// Formato y agregados
// ---------------------------------------------------------------------------

function winRate(record: { wins: number; losses: number; draws: number }): number {
  const total = record.wins + record.losses + record.draws;
  return total === 0 ? 0 : record.wins / total;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function average(total: number, count: number): number | null {
  return count > 0 ? total / count : null;
}

function fmtSeconds(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} s`;
}

function fmtNumber(value: number, digits = 0): string {
  return value.toFixed(digits);
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
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

function bestAndWorst(
  aggregate: SpeciesAggregate,
  nameById: Map<string, string>
): { best: string; worst: string } {
  let best: { id: string; rate: number } | null = null;
  let worst: { id: string; rate: number } | null = null;
  for (const [id, record] of aggregate.matchups) {
    if (record.wins + record.losses + record.draws === 0) continue;
    const rate = winRate(record);
    const name = nameById.get(id) ?? id;
    if (!best || rate > best.rate) best = { id: name, rate };
    if (!worst || rate < worst.rate) worst = { id: name, rate };
  }
  if (!best || !worst) return { best: '—', worst: '—' };
  return {
    best: `${best.id} (${pct(best.rate)})`,
    worst: `${worst.id} (${pct(worst.rate)})`
  };
}

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------

function buildMarkdown(input: {
  options: BalanceOptions;
  aggregates: SpeciesAggregate[];
  duels: DuelResult[];
  mirrors: DuelResult[];
  speciesCount: number;
  wallSeconds: number;
  commit: string;
  proposals: string | null;
}): string {
  const { options, aggregates, duels, mirrors, speciesCount, wallSeconds } =
    input;
  const lines: string[] = [];

  const sorted = [...aggregates].sort(
    (left, right) => winRate(right) - winRate(left) || right.wins - left.wins
  );
  const nameById = new Map(aggregates.map((aggregate) => [aggregate.id, aggregate.name]));
  const totalDuels = duels.length;
  const decisive = duels.filter((duel) => duel.winner !== 'draw').length;
  const ttkValues = duels
    .map((duel) => duel.ttk)
    .filter((value): value is number => value !== null);
  const avgTtk =
    ttkValues.length > 0
      ? ttkValues.reduce((sum, value) => sum + value, 0) / ttkValues.length
      : null;

  const naturalWinner = (duel: DuelResult): 'a' | 'b' | null =>
    duel.winner === 'draw' ? null : duel.winner;
  const redWinsMirror = mirrors.filter(
    (duel) => naturalWinner(duel) === 'a'
  ).length;
  const blueWinsMirror = mirrors.filter(
    (duel) => naturalWinner(duel) === 'b'
  ).length;
  const mirrorDraws = mirrors.length - redWinsMirror - blueWinsMirror;

  lines.push('# Balance simulado con duelos 1v1');
  lines.push('');
  lines.push(
    `> Generado el ${new Date().toISOString().slice(0, 10)} a partir de \`${input.commit}\`. ` +
      'No editar a mano las secciones de datos: se regeneran con `pnpm balance`. ' +
      'La sección de propuestas se conserva entre ejecuciones.'
  );
  lines.push('');
  lines.push('## Metodología');
  lines.push('');
  lines.push(
    '- Motor real: `scripts/sim-headless.ts`, mismo paso fijo de 60 Hz que `Game`, ' +
      'sin PlayCanvas, GPU ni audio.'
  );
  lines.push(
    '- Cada duelo enfrenta dos bots 1v1 y termina en el **primer KO**. Si no hay KO ' +
      `antes de ${options.seconds} s, el duelo cuenta como empate.`
  );
  lines.push(
    '- **Round-robin completo**: cada pareja se juega en las dos orientaciones de ' +
      'spawn (A rojo vs B azul y B rojo vs A azul), así el sesgo del mapa se reparte.'
  );
  lines.push(
    `- Semillas reproducibles: ${options.seeds} ` +
      `${plural(options.seeds, 'repetición', 'repeticiones')} por orientación. ` +
      (options.common === 'all'
        ? 'Se agregan los tres instintos comunes (Protección, Impulso y Regeneración).'
        : `Instinto común fijo: **${options.common}** para ambos lados.`)
  );
  lines.push(
    `- Dificultad de bots: **${options.difficulty}**. Mapa: \`${options.map}\`. ` +
      `Especies: ${speciesCount} (todas las que tienen moveset).`
  );
  lines.push(
    '- Limitaciones: los bots no juegan como humanos (retiradas, dudas de ruta y ' +
      'errores de puntería forman parte del resultado), el arnés no genera los ' +
      'colliders de árboles/rocas ni simula objetos recogibles, y un duelo termina ' +
      'en el primer KO (mide el primer intercambio, no una partida completa).'
  );
  lines.push('');
  lines.push(
    `Duelos jugados: **${totalDuels.toLocaleString('es-ES')}** ` +
      `(${decisive.toLocaleString('es-ES')} decididos, ` +
      `${(totalDuels - decisive).toLocaleString('es-ES')} empates). ` +
      `TTK medio hasta el primer KO: **${fmtSeconds(avgTtk)}**. ` +
      `Tiempo de pared: ${wallSeconds.toFixed(1)} s.`
  );
  lines.push('');
  lines.push(
    'Las **propuestas de ajuste** curadas están al final del informe: ' +
      '[Propuestas de ajuste](#propuestas-de-ajuste).'
  );
  lines.push('');
  lines.push('### Sesgo de spawn (espejos)');
  lines.push('');
  lines.push(
    `Se jugaron ${mirrors.length} espejos (misma especie en ambos lados). ` +
      `Gana rojo ${redWinsMirror} (${pct(
        mirrors.length ? redWinsMirror / mirrors.length : 0
      )}), gana azul ${blueWinsMirror} (${pct(
        mirrors.length ? blueWinsMirror / mirrors.length : 0
      )}), empates ${mirrorDraws}. ` +
      'Una desviación grande indica que el mapa o los spawns favorecen un lado.'
  );
  lines.push('');
  lines.push('## Resultados globales');
  lines.push('');
  lines.push(
    'Ordenado por winrate. `Gana/Pierde/Empata` cuenta duelos, no KOs. ' +
      '`TTK victoria` es el tiempo medio hasta el KO cuando la especie gana; ' +
      '`Vida restante` es la fracción media de vida al ganar.'
  );
  lines.push('');
  lines.push(
    '| # | Pokémon | Tipos | PV | Vel | Hurtbox | Winrate | Gana | Pierde | Empata | TTK victoria | Daño medio | Recibido medio | Vida restante | Duelos 0 daño | Mejor rival | Peor rival |'
  );
  lines.push(
    '| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |'
  );
  sorted.forEach((aggregate, index) => {
    const { best, worst } = bestAndWorst(aggregate, nameById);
    const ttk = average(aggregate.ttkOnWin, aggregate.wins);
    const hpLeft = average(aggregate.hpLeftOnWin, aggregate.wins);
    lines.push(
      `| ${index + 1} | ${aggregate.name} | ${typesLabel(aggregate.types)} | ` +
        `${aggregate.maxHp} | ${fmtNumber(aggregate.speed, 1)} | ` +
        `${aggregate.hitRadius.toFixed(2)} | **${pct(winRate(aggregate))}** | ` +
        `${aggregate.wins} | ${aggregate.losses} | ` +
        `${aggregate.draws} | ${fmtSeconds(ttk)} | ` +
        `${fmtNumber(average(aggregate.damageDealt, aggregate.duels) ?? 0)} | ` +
        `${fmtNumber(average(aggregate.damageTaken, aggregate.duels) ?? 0)} | ` +
        `${hpLeft === null ? '—' : pct(hpLeft)} | ${aggregate.zeroDamageDuels} | ` +
        `${best} | ${worst} |`
    );
  });
  lines.push('');

  const ordered = [...aggregates].sort((left, right) =>
    left.name.localeCompare(right.name, 'es')
  );
  const bestOverall = sorted[0];
  const worstOverall = sorted[sorted.length - 1];
  const spread = winRate(bestOverall) - winRate(worstOverall);  lines.push('### Lectura rápida');
  lines.push('');
  lines.push(
    `- Mejor winrate: **${bestOverall.name}** (${pct(winRate(bestOverall))}). ` +
      `Peor: **${worstOverall.name}** (${pct(winRate(worstOverall))}). ` +
      `Diferencia: **${(spread * 100).toFixed(0)} puntos**.`
  );
  const above75 = sorted.filter((aggregate) => winRate(aggregate) >= 0.75);
  const below25 = sorted.filter((aggregate) => winRate(aggregate) <= 0.25);
  if (above75.length > 0) {
    lines.push(
      `- Por encima del 75% de victorias: ${above75
        .map((aggregate) => `${aggregate.name} (${pct(winRate(aggregate))})`)
        .join(', ')}.`
    );
  }
  if (below25.length > 0) {
    lines.push(
      `- Por debajo del 25%: ${below25
        .map((aggregate) => `${aggregate.name} (${pct(winRate(aggregate))})`)
        .join(', ')}.`
    );
  }
  const mostDraws = [...aggregates].sort(
    (left, right) =>
      right.draws / Math.max(1, right.duels) -
      left.draws / Math.max(1, left.duels)
  )[0];
  if (mostDraws) {
    lines.push(
      `- Más empates: **${mostDraws.name}** (` +
        `${mostDraws.draws}/${mostDraws.duels}, ` +
        `${pct(mostDraws.draws / Math.max(1, mostDraws.duels))}).`
    );
  }
  const zeroDamage = aggregates
    .filter((aggregate) => aggregate.zeroDamageDuels > 0)
    .sort((left, right) => right.zeroDamageDuels - left.zeroDamageDuels);
  if (zeroDamage.length > 0) {
    lines.push(
      `- Duelos sin daño (posible inmunidad de tipo o kit inútil): ` +
        zeroDamage
          .slice(0, 8)
          .map(
            (aggregate) =>
              `${aggregate.name} ${aggregate.zeroDamageDuels}/${aggregate.duels}`
          )
          .join(', ') +
        '.'
    );
  }
  lines.push('');
  lines.push('## Matriz de enfrentamientos (winrate de la fila)');
  lines.push('');
  lines.push(
    'Cada celda es el winrate de la especie de la fila contra la de la columna, ' +
      'agregando las dos orientaciones, todas las semillas y todos los instintos ' +
      'seleccionados. `—` es el espejo.'
  );
  lines.push('');
  lines.push(
    `| Pokémon | ${ordered.map((aggregate) => aggregate.id).join(' | ')} |`
  );
  lines.push(`| --- | ${ordered.map(() => '---:').join(' | ')} |`);
  for (const aggregate of ordered) {
    const cells = ordered.map((rival) => {
      if (rival.id === aggregate.id) return '—';
      const record = aggregate.matchups.get(rival.id);
      if (!record || record.wins + record.losses + record.draws === 0) {
        return '·';
      }
      return pct(winRate(record));
    });
    lines.push(`| ${aggregate.name} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  lines.push(
    `Leyenda de ids: ${ordered
      .map((aggregate) => `${aggregate.id} ${aggregate.name}`)
      .join(' · ')}.`
  );
  lines.push('');
  lines.push('## Duelos con cero daño');
  lines.push('');
  lines.push(
    'Parejas en las que el perdedor no hizo **ningún** daño en todos sus duelos ' +
      '(señal de inmunidad de tipo o de un kit que no conecta). Se excluyen las ' +
      'parejas con menos de dos duelos decididos.'
  );
  lines.push('');
  const pairTotals = new Map<string, number>();
  const pairZeros = new Map<string, number>();
  for (const duel of duels) {
    if (duel.winner === 'draw') continue;
    const winner = duel.winner === 'a' ? duel.a : duel.b;
    const loser = duel.winner === 'a' ? duel.b : duel.a;
    const key = `${winner} → ${loser}`;
    pairTotals.set(key, (pairTotals.get(key) ?? 0) + 1);
    const loserDamage = duel.winner === 'a' ? duel.damageB : duel.damageA;
    if (loserDamage <= 0) {
      pairZeros.set(key, (pairZeros.get(key) ?? 0) + 1);
    }
  }
  const zeroPairs = [...pairZeros.entries()].filter(([key, count]) => {
    const total = pairTotals.get(key) ?? 0;
    return total >= 2 && count === total;
  });
  if (zeroPairs.length === 0) {
    lines.push('Ninguna pareja quedó a cero de daño en todos sus duelos.');
  } else {
    lines.push(
      zeroPairs
        .sort((left, right) => right[1] - left[1])
        .map(([key, count]) => {
          const [winner, loser] = key.split(' → ');
          return `${nameById.get(winner) ?? winner} → ${nameById.get(loser) ?? loser} ` +
            `(${count}/${pairTotals.get(key) ?? count} duelos)`;
        })
        .join(', ') + '.'
    );
  }
  lines.push('');
  lines.push('## Cómo regenerar');
  lines.push('');
  lines.push('```bash');
  lines.push('pnpm balance');
  lines.push(
    'pnpm balance --seeds 6 --common regeneracion --difficulty expert --seconds 40'
  );
  lines.push('pnpm balance --species 0025,0094,0382 --seeds 2 --json .cache/balance.json');
  lines.push('```');
  lines.push('');
  lines.push(
    'Los datos crudos (duelos, agregados y configuración) quedan en ' +
      '`.cache/balance-report.json`.'
  );
  lines.push('');

  lines.push(
    input.proposals ??
      [
        PROPOSALS_MARKER,
        '## Propuestas de ajuste',
        '',
        'Pendiente de redactar tras revisar la primera tanda.',
        ''
      ].join('\n')
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

  const available = [...manifest.keys()].filter((id) => MOVESETS[id]);
  const species = [...new Set(options.species ?? available)];
  if (species.length < 2) {
    throw new Error('Hacen falta al menos dos especies para jugar el round-robin');
  }
  const missing = species.filter((id) => !MOVESETS[id]);
  if (missing.length > 0) {
    throw new Error(
      `Estas especies no tienen moveset y no se pueden simular: ${missing.join(', ')}`
    );
  }
  const unknown = species.filter((id) => !manifest.has(id));
  if (unknown.length > 0) {
    throw new Error(`Especies fuera del manifiesto: ${unknown.join(', ')}`);
  }

  const commons: readonly CommonAbilityId[] =
    options.common === 'all' ? COMMON_ABILITIES : [options.common];

  const aggregates = new Map<string, SpeciesAggregate>();
  for (const id of available) {
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
      duels: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      damageDealt: 0,
      damageTaken: 0,
      hpLeftOnWin: 0,
      ttkOnWin: 0,
      zeroDamageDuels: 0,
      matchups: new Map()
    });
  }

  const base: Options = {
    map: options.map,
    bots: 2,
    seconds: options.seconds,
    difficulty: options.difficulty,
    seed: 0,
    trace: null,
    every: 1,
    json: null,
    mode: 'tdm',
    timeLimit: options.seconds,
    maxKos: 50,
    pokemon: [],
    common: 'proteccion',
    duel: true,
    quiet: true
  };
  const maxSteps = Math.round(options.seconds / FIXED_STEP);
  const duels: DuelResult[] = [];
  const mirrors: DuelResult[] = [];

  const started = performance.now();
  let played = 0;
  const total =
    species.length * (species.length - 1) * options.seeds * commons.length;
  const progress = (): void => {
    if (options.quiet) return;
    const elapsed = (performance.now() - started) / 1000;
    const rate = played / Math.max(0.001, elapsed);
    const remaining = rate > 0 ? (total - played) / rate : 0;
    process.stdout.write(
      `\rDuelos ${played}/${total} · ${elapsed.toFixed(0)} s · ` +
        `quedan ~${remaining.toFixed(0)} s   `
    );
  };

  for (let commonIndex = 0; commonIndex < commons.length; commonIndex++) {
    const common = commons[commonIndex];
    for (let aIndex = 0; aIndex < species.length; aIndex++) {
      for (let bIndex = 0; bIndex < species.length; bIndex++) {
        if (aIndex === bIndex) continue;
        const a = species[aIndex];
        const b = species[bIndex];
        for (let seedIndex = 0; seedIndex < options.seeds; seedIndex++) {
          const seed = hashSeed(aIndex, bIndex, seedIndex, commonIndex);
          const result = runDuel(
            map,
            manifest,
            base,
            a,
            b,
            common,
            seed,
            maxSteps
          );
          duels.push(result);
          recordDuel(aggregates, result);
          played += 1;
          if (played % 25 === 0) progress();
        }
      }
    }
  }

  for (const id of species) {
    for (const common of commons) {
      for (let seedIndex = 0; seedIndex < options.seeds; seedIndex++) {
        const seed = hashSeed(
          0xffff,
          species.indexOf(id),
          seedIndex,
          COMMON_ABILITIES.indexOf(common)
        );
        mirrors.push(
          runDuel(map, manifest, base, id, id, common, seed, maxSteps)
        );
      }
    }
  }

  const wallSeconds = (performance.now() - started) / 1000;
  if (!options.quiet) {
    process.stdout.write('\r');
    process.stdout.write(' '.repeat(80));
    process.stdout.write('\r');
  }

  const existingProposals = existsSync(path.resolve(options.out))
    ? extractProposals(readFileSync(path.resolve(options.out), 'utf8'))
    : null;
  const markdown = buildMarkdown({
    options,
    aggregates: [...aggregates.values()].filter(
      (aggregate) => aggregate.duels > 0
    ),
    duels,
    mirrors,
    speciesCount: species.length,
    wallSeconds,
    commit: commitHash(),
    proposals: existingProposals
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
      aggregates: [...aggregates.values()].map((aggregate) => ({
        ...aggregate,
        matchups: Object.fromEntries(aggregate.matchups)
      })),
      mirrors,
      duels
    };
    writeFileSync(
      path.resolve(options.json),
      `${JSON.stringify(payload, null, 2)}\n`
    );
  }

  const decisive = duels.filter((duel) => duel.winner !== 'draw').length;
  const ttkValues = duels
    .map((duel) => duel.ttk)
    .filter((value): value is number => value !== null);
  const avgTtk =
    ttkValues.length > 0
      ? ttkValues.reduce((sum, value) => sum + value, 0) / ttkValues.length
      : 0;
  if (!options.quiet) {
    console.log(
      `Listo: ${duels.length} duelos (${decisive} decididos) en ` +
        `${wallSeconds.toFixed(1)} s · TTK medio ${avgTtk.toFixed(1)} s`
    );
    console.log(`Informe: ${path.resolve(options.out)}`);
    if (options.json) console.log(`Datos: ${path.resolve(options.json)}`);
  }
}

/** Conserva la sección curada de propuestas si el informe ya existía. */
function extractProposals(text: string): string | null {
  const index = text.indexOf(PROPOSALS_MARKER);
  if (index < 0) return null;
  return text.slice(index).trimEnd();
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
