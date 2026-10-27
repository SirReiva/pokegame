import type { CSSProperties } from 'react';
import { speedForPokemon } from '../game/roster';
import {
  TEAM_INFO,
  countTeams,
  type LobbyPlayer
} from '../game/multiplayer';
import type { PokemonEntry, SpriteManifest } from '../game/types';
import { SpritePreview } from './SpritePreview';
import { TypeBadge } from './TypeBadge';

interface RosterScreenProps {
  manifest: SpriteManifest;
  players: LobbyPlayer[];
  onPick: (slot: number, pokemonId: string) => void;
  onToggleReady: (slot: number) => void;
  onStart: () => void;
  onBack: () => void;
  onControls: () => void;
  onCredits: () => void;
}

export function RosterScreen({
  manifest,
  players,
  onPick,
  onToggleReady,
  onStart,
  onBack,
  onControls,
  onCredits
}: RosterScreenProps) {
  const counts = countTeams(players);
  const allReady = players.length > 0 && players.every((player) => player.rosterReady);
  const entryFor = (id: string | null): PokemonEntry | null =>
    manifest.pokemon.find((entry) => entry.id === id) ?? null;
  const singlePlayer = players.length === 1;

  return (
    <div className="overlay mp-overlay">
      <div className="mp-shell">
        <header className="mp-head">
          <div className="brand brand-compact">
            <span className="brand-mark" aria-hidden="true">
              <span className="brand-pixel" />
            </span>
            <div>
              <h1>
                New<span>Poke</span>
              </h1>
              <p>Multijugador local · 1-8 jugadores</p>
            </div>
          </div>

          <div className="mp-head-right">
            <ol className="mp-steps" aria-label="Pasos de la configuración">
              <li className="is-done">1 · Equipos</li>
              <li className="is-active">2 · Pokémon</li>
            </ol>
            <div className="head-actions">
              <button type="button" className="btn btn-ghost btn-small" onClick={onControls}>
                Controles
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={onCredits}>
                Créditos
              </button>
            </div>
          </div>
        </header>

        <div className="mp-intro">
          <div>
            <span className="eyebrow">Paso 2 de 2</span>
            <h2>Elige tu Pokémon</h2>
            <p className="lead">
              Muévete por la rejilla con el stick o las flechas y confirma con{' '}
              <strong>A / Espacio</strong>. Se permiten repetidos: hay 7 especies para hasta 8
              jugadores.
            </p>
          </div>
          <div className="mp-score">
            <span className="mp-score-item mp-score-blue">
              <strong>{counts.blue}</strong> azul
            </span>
            <span className="mp-score-vs">vs</span>
            <span className="mp-score-item mp-score-red">
              <strong>{counts.red}</strong> rojo
            </span>
          </div>
        </div>

        <div className="roster-layout">
          <section className="roster-left">
            <div className="mp-cards" role="listbox" aria-label="Pokémon disponibles">
              {manifest.pokemon.map((entry) => {
                const cursors = players.filter((player) => player.pokemonId === entry.id);
                const isSelected = cursors.length > 0;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`poke-card mp-poke${isSelected ? ' is-selected' : ''}`}
                    style={{ '--accent': entry.accent } as CSSProperties}
                    onClick={() => {
                      if (singlePlayer) onPick(players[0].slot, entry.id);
                    }}
                  >
                    <span className="poke-card-top">
                      <span className="poke-dex">#{String(entry.dex).padStart(3, '0')}</span>
                      <span className="cursor-stack">
                        {cursors.map((player) => (
                          <span
                            key={player.slot}
                            className={`cursor-chip${player.rosterReady ? ' is-ready' : ''}`}
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
                    <SpritePreview entry={entry} height={68} className="poke-card-sprite" />
                    <span className="poke-name">{entry.name}</span>
                    <span className="poke-types">
                      {entry.types.map((type) => (
                        <TypeBadge key={type} type={type} />
                      ))}
                    </span>
                    <span className="poke-speed">
                      Vel. {speedForPokemon(entry.id).toFixed(1)} u/s
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="asset-note">
              <span className="asset-dot" />
              Sprites de <strong>PMD Sprite Collab</strong> · CC BY-NC 4.0 · uso no comercial
            </div>
          </section>

          <aside className="roster-right">
            <span className="eyebrow">Jugadores</span>
            <h3>Selección actual</h3>

            <div className="roster-players">
              {players.map((player) => {
                const entry = entryFor(player.pokemonId);
                const team = TEAM_INFO[player.team];
                return (
                  <article
                    key={player.slot}
                    className={`roster-player${player.rosterReady ? ' is-ready' : ''}`}
                    style={
                      {
                        '--team': team.color,
                        '--team-dark': team.dark
                      } as CSSProperties
                    }
                  >
                    <span className="roster-avatar">
                      {entry ? <SpritePreview entry={entry} height={38} /> : '—'}
                    </span>
                    <div className="roster-player-copy">
                      <span className="roster-player-top">
                        <strong>{player.name}</strong>
                        <span className="roster-team">{team.short}</span>
                      </span>
                      <span className="roster-pick">{entry?.name ?? 'Sin elegir'}</span>
                    </div>
                    <button
                      type="button"
                      className={`btn btn-tiny${player.rosterReady ? ' btn-accent' : ''}`}
                      onClick={() => onToggleReady(player.slot)}
                    >
                      {player.rosterReady ? '✓ Listo' : 'Listo'}
                    </button>
                  </article>
                );
              })}
            </div>

            <div className="mp-tips">
              <p>
                <span className="key-pill">Stick / WASD</span> mover cursor
              </p>
              <p>
                <span className="key-pill">A / Espacio</span> confirmar
              </p>
              <p>
                <span className="key-pill">B / Esc</span> volver o desmarcar
              </p>
            </div>
          </aside>
        </div>

        <footer className="mp-footer">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            ← Volver a equipos
          </button>
          <div className="mp-footer-copy">
            {allReady ? (
              <span className="mp-ready-msg">Todos listos · pulsa A para empezar</span>
            ) : (
              <span className="muted">
                {players.filter((player) => player.rosterReady).length} / {players.length} listos
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-play"
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
