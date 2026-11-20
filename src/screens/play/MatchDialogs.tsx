/**
 * Diálogos de partida: pausa, resultado final y marcador por equipos con las
 * estadísticas de cada Pokémon.
 */

import {
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode
} from 'react';
import { commonAbilityOption } from '../../game/abilities';
import {
  TEAM_INFO,
  type LobbyPlayer,
  type MatchEndResult,
  type PlayerMatchStats
} from '../../game/multiplayer';
import { DEFAULT_SKIN_ID, skinFor } from '../../game/skins';
import type { Team } from '../../game/terrain';
import type { SpriteManifest } from '../../game/types';
import { btnClass } from '../../ui/buttonStyles';
import { KeyPill } from '../../ui/KeyPill';
import type { MatchStatsStore } from '../../ui/matchStatsStore';
import { PokemonPortrait } from '../../ui/PokemonPortrait';
import { eyebrow } from '../../ui/styles';

const panel =
  'rounded-[20px] border border-line bg-panel-strong shadow-[0_34px_80px_rgb(0_0_0/0.55)]';
const modalHead = 'flex items-center justify-between gap-4 border-b border-line px-6 py-[18px]';
const modalClose =
  'size-[34px] cursor-pointer rounded-[9px] border border-transparent bg-transparent text-27.2 leading-none text-muted transition-colors duration-[120ms] hover:bg-white/[0.07] hover:text-ink';

/** Formatea el daño con separador de miles para el marcador final. */
function formatDamage(value: number): string {
  return Math.round(value).toLocaleString('es-ES');
}

/** Marcador del modo: los puntos de zona se muestran sin decimales. */
function formatScore(value: number): string {
  return Math.floor(value).toLocaleString('es-ES');
}

/** Cifra del marcador con su etiqueta pequeña debajo. */
function ScoreStat({
  value,
  label,
  title,
  valueClassName
}: {
  value: ReactNode;
  label: string;
  title?: string;
  valueClassName: string;
}) {
  return (
    <span className="flex flex-col items-end leading-none" title={title}>
      <strong className={`text-13.6 ${valueClassName}`}>{value}</strong>
      <span className="text-7.36 tracking-[0.08em] text-steel-500 uppercase">
        {label}
      </span>
    </span>
  );
}

/**
 * Columna del marcador con dos estadísticas apiladas. Todas las columnas de un
 * mismo grupo comparten ancho fijo para que las cifras queden alineadas entre
 * Pokémon y con la fila de totales.
 */
function ScoreStatColumn({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`flex shrink-0 flex-col items-end justify-center gap-1 font-mono tabular-nums ${className}`}
    >
      {children}
    </span>
  );
}

interface PauseDialogProps {
  manifest: SpriteManifest;
  players: LobbyPlayer[];
  teams: Team[];
  onResume: () => void;
  onBackToRoster: () => void;
  onBackToTeams: () => void;
  onExit: () => void;
  onControls: () => void;
  onCredits: () => void;
}

export function PauseDialog({
  manifest,
  players,
  teams,
  onResume,
  onBackToRoster,
  onBackToTeams,
  onExit,
  onControls,
  onCredits
}: PauseDialogProps) {
  const selectedEntryFor = (pokemonId: string) =>
    manifest.pokemon.find((entry) => entry.id === pokemonId) ?? null;
  // Solo se pintan los equipos con jugadores para no dejar huecos vacíos.
  const activeTeams = teams.filter((team) =>
    players.some((player) => player.team === team)
  );

  return (
    <div className="fixed inset-0 z-12 flex animate-fade-in items-center justify-center bg-night-950/72 backdrop-blur-[7px]">
      <div className={`${panel} w-[min(620px,100%)] animate-rise-in p-[clamp(18px,3vw,28px)]`}>
        <header className={modalHead}>
          <div>
            <span className={eyebrow}>Partida en pausa</span>
            <h2 className="mt-0.75 text-[clamp(1.7rem,3vw,2.3rem)]">Pausa</h2>
          </div>
          <button type="button" className={modalClose} onClick={onResume} aria-label="Continuar">
            ×
          </button>
        </header>

        <div className="flex flex-col gap-4">
          <div
            className={`grid gap-2 ${
              activeTeams.length > 1 ? 'grid-cols-2 max-[760px]:grid-cols-1' : 'grid-cols-1'
            }`}
          >
            {activeTeams.map((team) => {
              const info = TEAM_INFO[team];
              const members = players
                .filter((player) => player.team === team)
                .sort((a, b) => a.slot - b.slot);
              return (
                <section
                  key={team}
                  className="overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--team)_38%,var(--color-line))] bg-[linear-gradient(100deg,color-mix(in_srgb,var(--team)_8%,rgb(8_13_21/0.9)),rgb(8_13_21/0.9))]"
                  style={
                    {
                      '--team': info.color
                    } as CSSProperties
                  }
                >
                  <header className="flex items-center justify-between gap-2 border-b border-line/60 px-2.25 py-1.5">
                    <span className="flex items-center gap-1.5 font-mono text-9.28 font-semibold tracking-widest text-(--team) uppercase">
                      <span className="size-2 rounded-full bg-(--team)" />
                      {info.label}
                    </span>
                    <span className="font-mono text-8.32 text-steel-500 uppercase">
                      {members.length} jug.
                    </span>
                  </header>
                  <ul className="divide-y divide-line/50">
                    {members.map((player) => {
                      const entry = selectedEntryFor(player.pokemonId);
                      const skin = entry ? skinFor(entry, player.skinId) : null;
                      return (
                        <li
                          key={player.slot}
                          className="flex items-center gap-2 px-2.25 py-1.75"
                        >
                          <span className="grid size-9 shrink-0 place-items-center">
                            {entry ? (
                              <PokemonPortrait entry={entry} skin={skin} height={36} />
                            ) : (
                              '—'
                            )}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <strong className="truncate font-mono text-9.92 tracking-[0.06em]">
                              {player.name}
                            </strong>
                            <span className="truncate text-11.2 text-steel-400">
                              {entry?.name ?? '—'}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`${btnClass('primary', 'play')} col-span-2`}
              onClick={onResume}
            >
              Continuar
            </button>
            <button type="button" className={btnClass('ghost')} onClick={onBackToRoster}>
              Cambiar Pokémon
            </button>
            <button type="button" className={btnClass('ghost')} onClick={onBackToTeams}>
              Cambiar equipos
            </button>
            <button type="button" className={btnClass('ghost')} onClick={onExit}>
              Menú principal
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className={`${btnClass('ghost', 'small')} flex-1`}
                onClick={onControls}
              >
                Controles
              </button>
              <button
                type="button"
                className={`${btnClass('ghost', 'small')} flex-1`}
                onClick={onCredits}
              >
                Créditos
              </button>
            </div>
          </div>

          <p className="text-center font-mono text-10.24 text-steel-650">
            <KeyPill>A</KeyPill> continuar · <KeyPill>B</KeyPill> continuar ·{' '}
            <KeyPill>Start / Esc</KeyPill> pausa
          </p>
        </div>
      </div>
    </div>
  );
}

interface MatchResultDialogProps {
  manifest: SpriteManifest;
  players: LobbyPlayer[];
  statsStore: MatchStatsStore;
  teams: Team[];
  result: MatchEndResult;
  onRematch: () => void;
  onBackToTeams: () => void;
  onExit: () => void;
}

export function MatchResultDialog({
  manifest,
  players,
  statsStore,
  teams,
  result,
  onRematch,
  onBackToTeams,
  onExit
}: MatchResultDialogProps) {
  return (
    <div className="fixed inset-0 z-14 flex animate-fade-in items-center justify-center bg-night-950/78 backdrop-blur-sm">
      <div
        className={`${panel} max-h-[92vh] w-[min(900px,100%)] animate-rise-in overflow-y-auto p-[clamp(20px,3vw,30px)]`}
      >
        <div className="text-center">
          <span className={eyebrow}>Fin de la partida</span>
          <h2
            className="mt-1 text-[clamp(2rem,5vw,3rem)]"
            style={{
              color:
                result.winner !== null
                  ? TEAM_INFO[result.winner].color
                  : 'var(--color-ink)'
            }}
          >
            {result.winner !== null
              ? `Gana el ${TEAM_INFO[result.winner].label.toLowerCase()}`
              : 'Empate'}
          </h2>
          <p className="mt-2 font-mono text-11.2 text-steel-400">
            {result.detail}
          </p>
          <p className="mt-2 font-mono text-12.8 text-steel-400">
            {teams
              .map(
                (team) =>
                  `${formatScore(result.scores[team])} ${result.scoreUnit} ${TEAM_INFO[team].short.toLowerCase()}`
              )
              .join(' · ')}
          </p>
        </div>

        <MatchScoreboard
          manifest={manifest}
          players={players}
          statsStore={statsStore}
          teams={teams}
          result={result}
        />

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`${btnClass('primary', 'play')} col-span-2`}
            onClick={onRematch}
          >
            Revancha
          </button>
          <button type="button" className={btnClass('ghost')} onClick={onBackToTeams}>
            Cambiar equipos
          </button>
          <button type="button" className={btnClass('ghost')} onClick={onExit}>
            Menú principal
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Marcador final con las estadísticas de cada Pokémon. Se agrupa por equipo y
 * ordena por KOs para que la aportación de cada jugador se lea de un vistazo.
 */
function MatchScoreboard({
  manifest,
  players,
  statsStore,
  teams,
  result
}: {
  manifest: SpriteManifest;
  players: LobbyPlayer[];
  statsStore: MatchStatsStore;
  teams: Team[];
  result: MatchEndResult;
}) {
  const stats = useSyncExternalStore(
    statsStore.subscribe,
    statsStore.getSnapshot,
    statsStore.getSnapshot
  );
  const entriesById = new Map(
    manifest.pokemon.map((pokemon) => [pokemon.id, pokemon])
  );
  const scoreFor = (team: Team) => Math.floor(result.scores[team] ?? 0);
  // Al terminar la partida los stats llegan en el mismo frame que el
  // resultado. Si por cualquier motivo aún no están, se muestra la plantilla
  // con cero KOs para no dejar el marcador vacío.
  type ScoreboardRow = Pick<
    PlayerMatchStats,
    | 'slot'
    | 'name'
    | 'team'
    | 'pokemonId'
    | 'skinId'
    | 'kills'
    | 'deaths'
    | 'assists'
    | 'damageDealt'
    | 'damageTaken'
    | 'abilityHealing'
    | 'pickupHealing'
    | 'xp'
    | 'level'
    | 'rank'
  > & {
    /** Nombre del instinto común elegido, o `null` si no se conoce. */
    commonAbilityName: string | null;
    commonAbilityDescription: string;
  };
  const rowsSource: ScoreboardRow[] =
    stats.length > 0
      ? stats.map((row) => ({
          ...row,
          commonAbilityName: row.commonAbility?.name ?? null,
          commonAbilityDescription: row.commonAbility?.description ?? ''
        }))
      : players.map((player) => {
          const option = commonAbilityOption(player.commonAbilityId);
          return {
            slot: player.slot,
            name: player.name,
            team: player.team,
            pokemonId: player.pokemonId,
            skinId: player.skinId ?? DEFAULT_SKIN_ID,
            kills: 0,
            deaths: 0,
            assists: 0,
            damageDealt: 0,
            damageTaken: 0,
            abilityHealing: 0,
            pickupHealing: 0,
            xp: 0,
            level: 1,
            rank: 'Novato',
            commonAbilityName: option?.name ?? null,
            commonAbilityDescription: option?.description ?? ''
          };
        });

  return (
    <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
      {teams.map((team) => {
        const info = TEAM_INFO[team];
        const rows = rowsSource
          .filter((entry) => entry.team === team)
          .sort(
            (a, b) =>
              b.kills - a.kills ||
              b.assists - a.assists ||
              a.deaths - b.deaths ||
              a.slot - b.slot
          );
        // Sumatorio del equipo: se calcula con las mismas filas que se pintan
        // para que los totales cuadren siempre con la lista de arriba.
        const totals = rows.reduce(
          (acc, row) => ({
            kills: acc.kills + row.kills,
            deaths: acc.deaths + row.deaths,
            assists: acc.assists + row.assists,
            damageDealt: acc.damageDealt + row.damageDealt,
            damageTaken: acc.damageTaken + row.damageTaken,
            abilityHealing: acc.abilityHealing + row.abilityHealing,
            pickupHealing: acc.pickupHealing + row.pickupHealing
          }),
          {
            kills: 0,
            deaths: 0,
            assists: 0,
            damageDealt: 0,
            damageTaken: 0,
            abilityHealing: 0,
            pickupHealing: 0
          }
        );
        return (
          <section
            key={team}
            className="overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--team)_34%,var(--color-line))] bg-night-900/55"
            style={{ '--team': info.color } as CSSProperties}
          >
            <header className="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-2">
              <span className="flex items-center gap-1.5 font-mono text-10.24 font-semibold tracking-widest text-(--team) uppercase">
                <span className="size-2 rounded-full bg-(--team)" />
                {info.label}
              </span>
              <span className="font-display text-16.8 font-extrabold tabular-nums text-(--team)">
                {scoreFor(team)}{' '}
                <span className="font-mono text-9.6 text-steel-450">
                  {result.scoreUnit}
                </span>
              </span>
            </header>

            <ol className="divide-y divide-line/60">
              {rows.map((row) => {
                const entry = entriesById.get(row.pokemonId);
                const skin = entry ? skinFor(entry, row.skinId) : null;
                return (
                  <li
                    key={row.slot}
                    className="flex items-center gap-2 px-2.5 py-1.75"
                  >
                    <span className="relative grid size-8 shrink-0 place-items-center">
                      {entry ? (
                        <PokemonPortrait entry={entry} skin={skin} height={30} />
                      ) : (
                        <span className="text-11.2 text-steel-600">—</span>
                      )}
                      <span
                        className="absolute -right-1.5 -bottom-2 rounded-full border border-night-950/80 bg-(--team) px-1.25 py-0.5 font-mono text-8 font-black leading-none text-ink-dark-strong shadow-[0_2px_6px_rgb(0_0_0/0.45)]"
                        title={`Nivel ${row.level} · ${row.rank}`}
                      >
                        NV {row.level}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-[1.08]">
                      <strong className="truncate font-mono text-9.6 tracking-[0.06em] uppercase">
                        {row.name}
                      </strong>
                      <span className="truncate text-10.24 text-steel-400">
                        {entry?.name ?? row.pokemonId}
                      </span>
                      <span
                        className="truncate text-9.28 text-steel-500"
                        title={`${row.rank} · Nivel ${row.level} · ${formatDamage(row.xp)} XP acumulada`}
                      >
                        <span className="text-(--team)">{row.rank}</span>
                        {row.xp > 0 ? ` · ${formatDamage(row.xp)} XP` : ''}
                      </span>
                      {row.commonAbilityName && (
                        <span
                          className="truncate text-9.28 text-steel-500"
                          title={row.commonAbilityDescription}
                        >
                          Instinto:{' '}
                          <span className="text-accent-soft">
                            {row.commonAbilityName}
                          </span>
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-stretch gap-1.5">
                      <ScoreStatColumn className="w-18">
                        <ScoreStat
                          value={
                            <>
                              {row.kills}
                              <span className="text-9.6 text-steel-500">
                                /{row.assists}
                              </span>
                            </>
                          }
                          label="KO / Asist."
                          title={`${row.kills} KO · ${row.assists} asistencias`}
                          valueClassName="text-steel-150"
                        />
                        <ScoreStat
                          value={row.deaths}
                          label="Muertes"
                          valueClassName="text-steel-300"
                        />
                      </ScoreStatColumn>
                      <ScoreStatColumn className="w-18 border-l border-line/45 pl-2">
                        <ScoreStat
                          value={formatDamage(row.damageDealt)}
                          label="Daño"
                          title="Daño hecho a rivales"
                          valueClassName="text-accent-soft"
                        />
                        <ScoreStat
                          value={formatDamage(row.damageTaken)}
                          label="Recibido"
                          title="Daño recibido de rivales y autodaño"
                          valueClassName="text-danger-100"
                        />
                      </ScoreStatColumn>
                      <ScoreStatColumn className="w-18 border-l border-line/45 pl-2">
                        <ScoreStat
                          value={formatDamage(row.abilityHealing)}
                          label="Cur. hab."
                          title="PV curados con habilidades propias y Regeneración"
                          valueClassName="text-success"
                        />
                        <ScoreStat
                          value={formatDamage(row.pickupHealing)}
                          label="Cur. obj."
                          title="PV curados con objetos recogibles"
                          valueClassName="text-success"
                        />
                      </ScoreStatColumn>
                    </span>
                  </li>
                );
              })}
              {rows.length === 0 && (
                <li className="p-3 text-center font-mono text-9.6 text-steel-600">
                  Sin Pokémon
                </li>
              )}
            </ol>

            {rows.length > 0 && (
              <footer className="flex items-center gap-2 border-t border-[color-mix(in_srgb,var(--team)_32%,var(--color-line))] bg-[color-mix(in_srgb,var(--team)_7%,transparent)] px-2.5 py-2">
                <span className="flex min-w-0 flex-1 flex-col leading-[1.08]">
                  <strong className="truncate font-mono text-9.6 tracking-[0.06em] text-(--team) uppercase">
                    Total equipo
                  </strong>
                  <span className="truncate text-10.24 text-steel-400">
                    {rows.length} Pokémon
                  </span>
                </span>
                <span className="flex shrink-0 items-stretch gap-1.5">
                  <ScoreStatColumn className="w-18">
                    <ScoreStat
                      value={
                        <>
                          {totals.kills}
                          <span className="text-9.6 text-steel-500">
                            /{totals.assists}
                          </span>
                        </>
                      }
                      label="KO / Asist."
                      title={`${totals.kills} KO · ${totals.assists} asistencias`}
                      valueClassName="text-(--team)"
                    />
                    <ScoreStat
                      value={totals.deaths}
                      label="Muertes"
                      valueClassName="text-steel-300"
                    />
                  </ScoreStatColumn>
                  <ScoreStatColumn className="w-18 border-l border-line/45 pl-2">
                    <ScoreStat
                      value={formatDamage(totals.damageDealt)}
                      label="Daño"
                      title="Daño hecho a rivales"
                      valueClassName="text-accent-soft"
                    />
                    <ScoreStat
                      value={formatDamage(totals.damageTaken)}
                      label="Recibido"
                      title="Daño recibido de rivales y autodaño"
                      valueClassName="text-danger-100"
                    />
                  </ScoreStatColumn>
                  <ScoreStatColumn className="w-18 border-l border-line/45 pl-2">
                    <ScoreStat
                      value={formatDamage(totals.abilityHealing)}
                      label="Cur. hab."
                      title="PV curados con habilidades propias y Regeneración"
                      valueClassName="text-success"
                    />
                    <ScoreStat
                      value={formatDamage(totals.pickupHealing)}
                      label="Cur. obj."
                      title="PV curados con objetos recogibles"
                      valueClassName="text-success"
                    />
                  </ScoreStatColumn>
                </span>
              </footer>
            )}
          </section>
        );
      })}
    </div>
  );
}
