import { useEffect, useRef, type CSSProperties } from 'react';
import {
  ABILITY_SLOTS,
  ABILITY_SLOT_LABEL,
  abilityForSlot,
  type DamageCategory
} from '../game/abilities';
import { baseStatsFor, combatStatsFor } from '../game/pokedex';
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
  /** deviceId -> id del Pokémon cuya cara trasera está visible. */
  flipped: Record<string, string>;
  onPick: (slot: number, pokemonId: string) => void;
  onFlip: (slot: number) => void;
  onToggleReady: (slot: number) => void;
  onStart: () => void;
  onBack: () => void;
  onOptions: () => void;
}

interface PlayerPanelProps {
  player: LobbyPlayer;
  entry: PokemonEntry;
  players: LobbyPlayer[];
  manifest: SpriteManifest;
  flipped: boolean;
  onPick: (slot: number, pokemonId: string) => void;
  onFlip: (slot: number) => void;
  onToggleReady: (slot: number) => void;
}

const CATEGORY_LABEL: Record<DamageCategory, string> = {
  physical: 'Físico',
  special: 'Especial',
  status: 'Estado'
};

const STAT_LABEL: Record<string, string> = {
  hp: 'PV',
  attack: 'Ata',
  defense: 'Def',
  spAttack: 'A. Esp',
  spDefense: 'D. Esp',
  speed: 'Vel'
};

const overlay =
  'fixed inset-0 z-10 flex animate-fade-in items-start justify-center overflow-y-auto bg-[radial-gradient(circle_at_16%_10%,rgb(22_48_78/0.9),transparent_55%),linear-gradient(112deg,rgb(4_8_14/0.96),rgb(4_8_14/0.84)_55%,rgb(4_8_14/0.55))] p-[clamp(16px,2.4vw,32px)] backdrop-blur-[3px]';
const shell =
  'm-auto flex w-[min(1400px,100%)] animate-rise-in flex-col gap-4';
const panel =
  'relative flex min-w-0 animate-pop-in flex-col gap-3 rounded-[20px] border border-line bg-[linear-gradient(170deg,rgb(16_25_38/0.92),rgb(7_12_19/0.94))] p-3.5 transition-colors duration-200';
const teamCard =
  'border-[color-mix(in_srgb,var(--team)_34%,var(--color-line))] border-l-[3px] border-l-(--team)';
const teamCardReady =
  'border-[color-mix(in_srgb,var(--team)_60%,white_8%)] bg-[linear-gradient(100deg,color-mix(in_srgb,var(--team)_13%,rgb(8_13_21/0.8)),rgb(8_13_21/0.72))]';

export function RosterScreen({
  manifest,
  players,
  flipped,
  onPick,
  onFlip,
  onToggleReady,
  onStart,
  onBack,
  onOptions
}: RosterScreenProps) {
  const counts = countTeams(players);
  const allReady = players.length > 0 && players.every((player) => player.rosterReady);
  const entryFor = (id: string): PokemonEntry | null =>
    manifest.pokemon.find((entry) => entry.id === id) ?? null;

  return (
    <div className={overlay}>
      <div className={shell}>
        <header className="flex flex-wrap items-center justify-between gap-4">
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

        <div className="flex flex-wrap items-end justify-between gap-4.5">
          <div>
            <span className={eyebrow}>Paso 2 de 2</span>
            <h2 className="mt-1 text-[clamp(1.6rem,3vw,2.4rem)]">Elige tu Pokémon</h2>
            <p className="mt-2 max-w-[78ch] text-14.4 leading-[1.55] text-muted">
              Cada jugador tiene su propio carrusel: muévete con el stick o las flechas y
              confirma con <strong>A / Espacio</strong>. Pulsa <strong>X / Y / Tab</strong> (o el
              botón de la card) para girarla y ver sus habilidades y estadísticas. Se permiten
              repetidos: hay {manifest.pokemon.length} especies para hasta 8 jugadores.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-night-750/72 px-4 py-2.5">
            <span className="flex items-baseline gap-1.5 font-mono text-11.2 tracking-[0.08em] uppercase">
              <strong
                key={counts.blue}
                className="animate-pop-in font-display text-2xl leading-none text-team-blue"
              >
                {counts.blue}
              </strong>{' '}
              azul
            </span>
            <span className="font-mono text-11.2 text-steel-950">vs</span>
            <span className="flex items-baseline gap-1.5 font-mono text-11.2 tracking-[0.08em] uppercase">
              <strong
                key={counts.red}
                className="animate-pop-in font-display text-2xl leading-none text-team-red"
              >
                {counts.red}
              </strong>{' '}
              rojo
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 min-[1051px]:grid-cols-2">
          {players.map((player, index) => {
            const entry = entryFor(player.pokemonId);
            if (!entry) return null;
            return (
              <PlayerPanel
                key={player.slot}
                player={player}
                entry={entry}
                players={players}
                manifest={manifest}
                flipped={flipped[player.deviceId] === player.pokemonId}
                onPick={onPick}
                onFlip={onFlip}
                onToggleReady={onToggleReady}
                index={index}
              />
            );
          })}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3.5 border-t border-line px-0 pt-3.5 pb-1">
          <div className="flex flex-wrap items-center gap-3 text-11.84 text-steel-500">
            <span className="flex items-center gap-2">
              <KeyPill>Stick / WASD</KeyPill> mover carrusel
            </span>
            <span className="flex items-center gap-2">
              <KeyPill>A / Espacio</KeyPill> listo
            </span>
            <span className="flex items-center gap-2">
              <KeyPill>X / Y / Tab</KeyPill> girar card
            </span>
            <span className="flex items-center gap-2">
              <KeyPill>B / Esc</KeyPill> volver
            </span>
          </div>
          <div className="flex items-center gap-3.5">
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
          </div>
        </footer>
      </div>
    </div>
  );
}

function PlayerPanel({
  player,
  entry,
  players,
  manifest,
  flipped,
  onPick,
  onFlip,
  onToggleReady,
  index
}: PlayerPanelProps & { index: number }) {
  const team = TEAM_INFO[player.team];
  const choices = players.filter((entryPlayer) => entryPlayer.pokemonId === entry.id);
  const stats = combatStatsFor(baseStatsFor(entry.id));
  const speed = speedForPokemon(entry.id);

  return (
    <article
      className={`${panel} ${teamCard} ${player.rosterReady ? teamCardReady : ''}`}
      style={
        {
          '--team': team.color,
          '--accent': entry.accent,
          animationDelay: `${index * 45}ms`
        } as CSSProperties
      }
    >
      <header className="flex items-center gap-2.5">
        <span className="grid size-10 flex-none place-items-center overflow-hidden rounded-[10px] bg-[radial-gradient(circle,color-mix(in_srgb,var(--team)_22%,transparent),transparent_70%)]">
          <PokemonPortrait entry={entry} height={32} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <strong className="truncate text-14.4">{player.name}</strong>
            <span className="font-mono text-8.8 tracking-[0.06em] uppercase text-(--team)">
              {team.short}
            </span>
            {player.rosterReady && (
              <span className="rounded-full border border-accent/50 px-1.5 py-px font-mono text-8 tracking-[0.08em] uppercase text-accent-soft">
                Listo
              </span>
            )}
          </span>
          <span className="truncate font-mono text-9.28 text-steel-650">
            {player.deviceLabel}
          </span>
        </div>
        <button
          type="button"
          className={btnClass(player.rosterReady ? 'accent' : 'neutral', 'tiny')}
          onClick={() => onToggleReady(player.slot)}
        >
          {player.rosterReady ? '✓ Listo' : 'Listo'}
        </button>
      </header>

      <div className="relative h-[clamp(330px,46vh,430px)] perspective-[1400px]">
        <div
          className={`relative h-full w-full transition-transform duration-500 ease-out transform-3d ${
            flipped ? 'transform-[rotateY(180deg)]' : ''
          }`}
        >
          <div
            onClick={() => onFlip(player.slot)}
            className={`absolute inset-0 flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--accent)_45%,var(--color-line))] bg-[linear-gradient(168deg,color-mix(in_srgb,var(--accent)_14%,rgb(23_33_48/0.97)),rgb(10_16_25/0.96))] p-3 text-center shadow-[0_18px_40px_rgb(0_0_0/0.36)] backface-hidden ${
              flipped ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,color-mix(in_srgb,var(--accent)_24%,transparent),transparent_62%)]" />

            <div className="relative z-1 flex items-center justify-between gap-2">
              <span className="font-mono text-10.08 tracking-[0.08em] text-steel-600">
                #{String(entry.dex).padStart(3, '0')}
              </span>
              <span className="flex flex-wrap justify-end gap-0.75">
                {choices.map((choice) => (
                  <span
                    key={choice.slot}
                    className={`grid size-5.5 animate-pop-in place-items-center rounded-full border-2 border-night-725 bg-(--choice-team) font-mono text-9.92 font-extrabold text-ink-dark-strong ${
                      choice.rosterReady
                        ? 'shadow-[0_0_0_2px_#bff39d]'
                        : 'shadow-[0_0_0_1px_var(--choice-team)]'
                    }`}
                    style={
                      {
                        '--choice-team': TEAM_INFO[choice.team].color
                      } as CSSProperties
                    }
                    title={`${choice.name} · ${TEAM_INFO[choice.team].short}`}
                  >
                    {choice.slot}
                  </span>
                ))}
              </span>
            </div>

            <div className="relative z-1 flex flex-1 items-center justify-center">
              <PokemonPortrait
                entry={entry}
                height={150}
                fluid
                className="size-[clamp(104px,15vh,156px)]"
              />
            </div>

            <div className="relative z-1 flex flex-col items-center gap-1">
              <h3 className="text-[clamp(1.2rem,2vw,1.6rem)] leading-tight">{entry.name}</h3>
              <span className="flex flex-wrap justify-center gap-1">
                {entry.types.map((type) => (
                  <TypeBadge key={type} type={type} />
                ))}
              </span>
              <span className="font-mono text-9.92 tracking-wider uppercase text-steel-600">
                Vel. {speed.toFixed(1)} u/s
              </span>
            </div>

            <button
              type="button"
              className={`${btnClass('ghost', 'tiny')} relative z-1 mt-2.5 w-full`}
              onClick={(event) => {
                event.stopPropagation();
                onFlip(player.slot);
              }}
            >
              Ver habilidades y stats <span className="text-steel-650">· X / Y</span>
            </button>
          </div>

          <div className={`absolute inset-0 flex flex-col gap-1.5 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--accent)_32%,var(--color-line))] bg-[linear-gradient(168deg,rgb(18_27_40/0.98),rgb(7_12_19/0.98))] p-2.5 text-left shadow-[0_18px_40px_rgb(0_0_0/0.36)] backface-hidden transform-[rotateY(180deg)] ${flipped ? 'pointer-events-auto' : 'pointer-events-none'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-mono text-8.96 tracking-[0.08em] text-steel-650">
                  #{String(entry.dex).padStart(3, '0')}
                </span>
                <h3 className="truncate text-16.8/tight">{entry.name}</h3>
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {entry.types.map((type) => (
                    <TypeBadge key={type} type={type} size="sm" />
                  ))}
                </span>
              </div>
              <button
                type="button"
                className={btnClass('ghost', 'tiny')}
                onClick={() => onFlip(player.slot)}
              >
                Volver · X
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {ABILITY_SLOTS.map((slot, slotIndex) => {
                  const ability = abilityForSlot(entry.id, slotIndex);
                  return (
                    <li
                      key={slot}
                      className="rounded-lg border border-line/70 bg-night-820/70 px-1.5 py-1"
                    >
                      {ability ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span className="flex-none font-mono text-8 tracking-[0.08em] uppercase text-steel-700">
                              {ABILITY_SLOT_LABEL[slot]}
                            </span>
                            <strong className="min-w-0 flex-1 truncate font-display text-11.52 text-ink">
                              {ability.name}
                            </strong>
                            <TypeBadge
                              type={ability.type}
                              size="sm"
                              className="flex-none"
                            />
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-mono text-8.32 tracking-wider uppercase text-steel-550">
                            <span>{CATEGORY_LABEL[ability.category]}</span>
                            {ability.power > 0 && <span>Pot. {ability.power}</span>}
                            <span>{ability.cooldown.toFixed(1)} s</span>
                          </div>
                          <p className="mt-0.5 text-9.6 leading-[1.35] text-steel-450">
                            {ability.description}
                          </p>
                        </>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-8 tracking-[0.08em] uppercase text-steel-700">
                            {ABILITY_SLOT_LABEL[slot]}
                          </span>
                          <span className="text-9.6 text-steel-650">Sin asignar</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="shrink-0 rounded-lg border border-line bg-night-800/70 p-1.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-mono text-8 tracking-[0.12em] uppercase text-steel-600">
                  Estadísticas · Nv. 50
                </span>
                <span className="font-mono text-8 tracking-[0.08em] uppercase text-steel-700">
                  {speed.toFixed(1)} u/s
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(Object.keys(STAT_LABEL) as Array<keyof typeof stats>).map((stat) => (
                  <div
                    key={stat}
                    className="rounded-sm bg-white/3 px-1 py-0.5 text-center"
                  >
                    <span className="block font-mono text-7.36 tracking-[0.06em] uppercase text-steel-650">
                      {STAT_LABEL[stat]}
                    </span>
                    <strong className="block font-display text-11.52 leading-none text-ink">
                      {stats[stat]}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <PokemonRail
        entries={manifest.pokemon}
        currentId={entry.id}
        onPick={(pokemonId) => onPick(player.slot, pokemonId)}
      />
    </article>
  );
}

function PokemonRail({
  entries,
  currentId,
  onPick
}: {
  entries: PokemonEntry[];
  currentId: string;
  onPick: (pokemonId: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const current = rail.querySelector<HTMLElement>('[data-current="true"]');
    if (!current) return;
    const left = current.offsetLeft - rail.clientWidth / 2 + current.clientWidth / 2;
    rail.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [currentId]);

  return (
    <div
      ref={railRef}
      className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-color:var(--color-line-strong)_transparent] scrollbar-thin"
    >
      {entries.map((entry) => {
        const selected = entry.id === currentId;
        return (
          <button
            key={entry.id}
            type="button"
            data-current={selected}
            aria-pressed={selected}
            onClick={() => onPick(entry.id)}
            className={`flex w-16.5 flex-none snap-center flex-col items-center gap-0.5 rounded-lg border px-1 py-1 transition-colors duration-150 ${
              selected
                ? 'border-[color-mix(in_srgb,var(--accent)_60%,var(--color-line))] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]'
                : 'border-line bg-white/2.5 hover:border-line-strong hover:bg-white/6'
            }`}
          >
            <PokemonPortrait entry={entry} height={30} />
            <span
              className={`w-full truncate text-center font-mono text-8 leading-tight ${
                selected ? 'text-ink' : 'text-steel-600'
              }`}
            >
              {entry.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
