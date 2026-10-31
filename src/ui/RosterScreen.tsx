import type { CSSProperties } from 'react';
import { speedForPokemon } from '../game/roster';
import { TEAM_INFO, countTeams, type LobbyPlayer } from '../game/multiplayer';
import type { PokemonEntry, SpriteManifest } from '../game/types';
import { Brand } from './Brand';
import { btnClass } from './buttonStyles';
import { KeyPill } from './KeyPill';
import { PokemonPortrait } from './PokemonPortrait';
import { eyebrow, stepActive, stepDone } from './styles';
import { TypeBadge } from './TypeBadge';

interface RosterScreenProps {
  manifest: SpriteManifest;
  players: LobbyPlayer[];
  onPick: (slot: number, pokemonId: string) => void;
  onToggleReady: (slot: number) => void;
  onStart: () => void;
  onBack: () => void;
  onOptions: () => void;
}

const overlay =
  'fixed inset-0 z-10 flex animate-fade-in items-start justify-center overflow-y-auto bg-[radial-gradient(circle_at_16%_10%,rgb(22_48_78/0.9),transparent_55%),linear-gradient(112deg,rgb(4_8_14/0.96),rgb(4_8_14/0.84)_55%,rgb(4_8_14/0.55))] p-[clamp(16px,2.4vw,32px)] backdrop-blur-[3px] min-[1051px]:items-stretch min-[1051px]:overflow-hidden min-[1051px]:p-[clamp(12px,1.8vh,22px)_clamp(16px,2.2vw,30px)]';
const shell =
  'm-auto flex w-[min(1360px,100%)] animate-rise-in flex-col gap-[clamp(14px,2vh,24px)] min-[1051px]:m-0 min-[1051px]:h-full min-[1051px]:min-h-0 min-[1051px]:gap-[clamp(8px,1.4vh,16px)]';
const teamCard =
  'border-[color-mix(in_srgb,var(--team)_34%,var(--color-line))] border-l-[3px] border-l-(--team)';
const teamCardReady =
  'border-[color-mix(in_srgb,var(--team)_60%,white_8%)] bg-[linear-gradient(100deg,color-mix(in_srgb,var(--team)_13%,rgb(8_13_21/0.8)),rgb(8_13_21/0.72))]';
const pokeCard =
  'group relative flex min-h-[166px] animate-pop-in cursor-pointer flex-col items-center gap-0.75 overflow-hidden rounded-2xl border p-[10px_8px_12px] text-center text-inherit transition-[transform,border-color,box-shadow,background] duration-[140ms] ease-out before:pointer-events-none before:absolute before:inset-x-[-20%] before:-top-[40%] before:h-[90px] before:bg-[radial-gradient(ellipse_at_50%_100%,color-mix(in_srgb,var(--accent)_26%,transparent),transparent_70%)] before:transition-opacity before:duration-[160ms] min-[1051px]:min-h-0 min-[1051px]:justify-center min-[1051px]:gap-0.5 min-[1051px]:rounded-[14px] min-[1051px]:p-[clamp(6px,0.9vh,8px)_8px]';
const pokeCardIdle =
  'border-line bg-[linear-gradient(168deg,rgb(23_33_48/0.92),rgb(10_16_25/0.9))] before:opacity-55 hover:-translate-y-[3px] hover:border-[color-mix(in_srgb,var(--accent)_48%,var(--color-line))] hover:shadow-[0_16px_34px_rgb(0_0_0/0.36)] hover:before:opacity-100';
const pokeCardSelected =
  'border-[color-mix(in_srgb,var(--accent)_70%,white_10%)] bg-[linear-gradient(168deg,color-mix(in_srgb,var(--accent)_16%,rgb(23_33_48/0.97)),rgb(10_16_25/0.94))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent),0_18px_40px_rgb(0_0_0/0.42)] before:opacity-100';

export function RosterScreen({
  manifest,
  players,
  onPick,
  onToggleReady,
  onStart,
  onBack,
  onOptions
}: RosterScreenProps) {
  const counts = countTeams(players);
  const allReady = players.length > 0 && players.every((player) => player.rosterReady);
  const entryFor = (id: string | null): PokemonEntry | null =>
    manifest.pokemon.find((entry) => entry.id === id) ?? null;
  const singlePlayer = players.length === 1;

  return (
    <div className={overlay}>
      <div className={shell}>
        <header className="flex flex-wrap items-center justify-between gap-4 min-[1051px]:shrink-0">
          <Brand compact />

          <div className="flex flex-wrap items-center gap-3">
            <ol className="m-0 flex list-none gap-1.5 p-0" aria-label="Pasos de la configuración">
              <li className={stepDone}>1 · Equipos</li>
              <li className={stepActive}>2 · Pokémon</li>
            </ol>
            <div className="flex gap-2">
              <button type="button" className={btnClass('ghost', 'small')} onClick={onBack}>
                ← Equipos
              </button>
              <button type="button" className={btnClass('ghost', 'small')} onClick={onOptions}>
                Opciones
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-end justify-between gap-4.5 min-[1051px]:shrink-0 min-[1051px]:items-center min-[1051px]:gap-3.5">
          <div>
            <span className={eyebrow}>Paso 2 de 2</span>
            <h2 className="mt-1 text-[clamp(1.6rem,3vw,2.4rem)] min-[1051px]:text-[clamp(1.3rem,2.2vw,1.9rem)]">
              Elige tu Pokémon
            </h2>
            <p className="mt-2 max-w-[46ch] text-14.4 leading-[1.55] text-muted min-[1051px]:mt-1 min-[1051px]:max-w-[92ch] min-[1051px]:text-13.12 min-[1051px]:leading-[1.45]">
              Muévete por la rejilla con el stick o las flechas y confirma con{' '}
              <strong>A / Espacio</strong>. Se permiten repetidos: hay {manifest.pokemon.length} especies
              para hasta 8 jugadores.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-night-750/72 px-4 py-2.5 max-[760px]:hidden min-[1051px]:px-3.5 min-[1051px]:py-1.5">
            <span className="flex items-baseline gap-1.5 font-mono text-11.2 tracking-[0.08em] uppercase">
              <strong
                key={counts.blue}
                className="animate-pop-in font-display text-2xl leading-none text-team-blue min-[1051px]:text-xl"
              >
                {counts.blue}
              </strong>{' '}
              azul
            </span>
            <span className="font-mono text-11.2 text-steel-950">vs</span>
            <span className="flex items-baseline gap-1.5 font-mono text-11.2 tracking-[0.08em] uppercase">
              <strong
                key={counts.red}
                className="animate-pop-in font-display text-2xl leading-none text-team-red min-[1051px]:text-xl"
              >
                {counts.red}
              </strong>{' '}
              rojo
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(300px,370px)] items-start gap-4.5 max-[1050px]:grid-cols-1 min-[1051px]:min-h-0 min-[1051px]:flex-1 min-[1051px]:grid-cols-[minmax(0,1fr)_minmax(270px,330px)] min-[1051px]:items-stretch min-[1051px]:gap-3.5">
          <section className="min-w-0 min-[1051px]:flex min-[1051px]:min-h-0 min-[1051px]:flex-col min-[1051px]:gap-2">
            <div
              className="grid grid-cols-3 gap-2.5 max-[760px]:grid-cols-2 min-[1051px]:min-h-0 min-[1051px]:flex-1 min-[1051px]:auto-rows-[minmax(min-content,1fr)] min-[1051px]:grid-cols-5 min-[1051px]:gap-2 min-[1051px]:overflow-y-auto min-[1051px]:pr-1"
              role="listbox"
              aria-label="Pokémon disponibles"
            >
              {manifest.pokemon.map((entry, index) => {
                const cursors = players.filter((player) => player.pokemonId === entry.id);
                const isSelected = cursors.length > 0;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`${pokeCard} ${isSelected ? pokeCardSelected : pokeCardIdle}`}
                    style={
                      {
                        '--accent': entry.accent,
                        animationDelay: `${index * 18}ms`
                      } as CSSProperties
                    }
                    onClick={() => {
                      if (singlePlayer) onPick(players[0].slot, entry.id);
                    }}
                  >
                    <span className="relative z-1 flex min-h-4.5 w-full items-center justify-between gap-1.5">
                      <span className="font-mono text-10.08 tracking-[0.08em] text-steel-700">
                        #{String(entry.dex).padStart(3, '0')}
                      </span>
                      <span className="flex flex-wrap justify-end gap-0.75">
                        {cursors.map((player) => (
                          <span
                            key={player.slot}
                            className={`grid size-5.5 animate-pop-in place-items-center rounded-full border-2 border-night-725 bg-(--team) font-mono text-9.92 font-extrabold text-ink-dark-strong ${
                              player.rosterReady
                                ? 'shadow-[0_0_0_2px_#bff39d]'
                                : 'shadow-[0_0_0_1px_var(--team)]'
                            }`}
                            style={
                              {
                                '--team': TEAM_INFO[player.team].color
                              } as CSSProperties
                            }
                            title={`${player.name} · ${TEAM_INFO[player.team].short}`}
                          >
                            {player.slot}
                          </span>
                        ))}
                      </span>
                    </span>
                    <PokemonPortrait
                      entry={entry}
                      height={52}
                      fluid
                      className="relative z-1 size-14 min-[1051px]:size-[clamp(44px,8vh,80px)]"
                    />
                    <span className="relative z-1 font-display text-15.68 font-bold min-[1051px]:text-[clamp(0.82rem,1.05vw,0.98rem)] min-[1051px]:leading-[1.15]">
                      {entry.name}
                    </span>
                    <span className="relative z-1 flex flex-wrap justify-center gap-1">
                      {entry.types.map((type) => (
                        <TypeBadge
                          key={type}
                          type={type}
                          className="min-[1051px]:px-1.25 min-[1051px]:py-px min-[1051px]:text-8"
                        />
                      ))}
                    </span>
                    <span className="relative z-1 font-mono text-8.96 tracking-wider uppercase text-steel-600 roster-tiny:hidden">
                      Vel. {speedForPokemon(entry.id).toFixed(1)} u/s
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-2 text-11.52 text-steel-800 min-[1051px]:mt-0 min-[1051px]:shrink-0 min-[1051px]:text-10.88 roster-short:hidden">
              <span className="size-1.5 flex-none animate-pulse rounded-full bg-accent shadow-[0_0_10px_var(--color-accent)]" />
              Retratos de <strong className="font-semibold text-steel-350">PMD Sprite Collab</strong>{' '}
              · CC BY-NC 4.0 · uso no comercial
            </div>
          </section>

          <aside className="rounded-[20px] border border-line bg-[linear-gradient(170deg,rgb(16_25_38/0.9),rgb(7_12_19/0.92))] p-4 min-[1051px]:flex min-[1051px]:min-h-0 min-[1051px]:flex-col min-[1051px]:p-3.5">
            <span className={eyebrow}>Jugadores</span>
            <h3 className="mt-0.5 text-19.2">Selección actual</h3>

            <div className="mt-2.5 flex flex-col gap-2 min-[1051px]:min-h-0 min-[1051px]:flex-1 min-[1051px]:gap-1.5 min-[1051px]:overflow-y-auto">
              {players.map((player) => {
                const entry = entryFor(player.pokemonId);
                const team = TEAM_INFO[player.team];
                return (
                  <article
                    key={player.slot}
                    className={`grid animate-pop-in grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border bg-night-800/65 px-2.5 py-2 transition-colors duration-200 min-[1051px]:grid-cols-[38px_minmax(0,1fr)_auto] min-[1051px]:px-2 min-[1051px]:py-1.5 ${teamCard} ${
                      player.rosterReady ? teamCardReady : ''
                    }`}
                    style={
                      {
                        '--team': team.color
                      } as CSSProperties
                    }
                  >
                    <span className="grid size-11 place-items-center overflow-hidden rounded-[10px] bg-[radial-gradient(circle,color-mix(in_srgb,var(--team)_22%,transparent),transparent_70%)] min-[1051px]:size-9.5">
                      {entry ? <PokemonPortrait entry={entry} height={38} /> : '—'}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5">
                        <strong>{player.name}</strong>
                        <span className="font-mono text-8.8 tracking-[0.06em] uppercase text-(--team)">
                          {team.short}
                        </span>
                      </span>
                      <span className="text-11.52 text-steel-400">
                        {entry?.name ?? 'Sin elegir'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={btnClass(player.rosterReady ? 'accent' : 'neutral', 'tiny')}
                      onClick={() => onToggleReady(player.slot)}
                    >
                      {player.rosterReady ? '✓ Listo' : 'Listo'}
                    </button>
                  </article>
                );
              })}
            </div>

            <div className="mt-3.5 flex flex-col gap-1.5 border-t border-dashed border-line pt-3 text-11.84 text-steel-500 min-[1051px]:mt-2 min-[1051px]:shrink-0 min-[1051px]:gap-1 min-[1051px]:pt-2 roster-short:hidden">
              <p className="flex items-center gap-2">
                <KeyPill>Stick / WASD</KeyPill> mover cursor
              </p>
              <p className="flex items-center gap-2">
                <KeyPill>A / Espacio</KeyPill> confirmar
              </p>
              <p className="flex items-center gap-2">
                <KeyPill>B / Esc</KeyPill> volver o desmarcar
              </p>
            </div>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3.5 border-t border-line px-0 pt-3.5 pb-1 min-[1051px]:shrink-0 min-[1051px]:pt-2">
          <button type="button" className={btnClass('ghost')} onClick={onBack}>
            ← Volver a equipos
          </button>
          <div className="text-13.12 text-steel-400">
            {allReady ? (
              <span className="animate-fade-in font-semibold text-accent-soft">
                Todos listos · pulsa A para empezar
              </span>
            ) : (
              <span className="text-muted">
                {players.filter((player) => player.rosterReady).length} / {players.length} listos
              </span>
            )}
          </div>
          <button
            type="button"
            className={btnClass('primary', 'play')}
            disabled={!allReady}
            onClick={onStart}
          >
            Empezar partida
          </button>
        </footer>
      </div>
    </div>
  );
}
