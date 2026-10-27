import type { CSSProperties } from 'react';
import type { InputDeviceInfo } from '../game/input';
import type { MapIndexEntry } from '../game/map';
import {
  MAX_PLAYERS,
  MAX_TEAM_SIZE,
  TEAM_INFO,
  TEAM_ORDER,
  countTeams,
  type LobbyPlayer
} from '../game/multiplayer';
import type { Team } from '../game/terrain';

interface LobbyScreenProps {
  players: LobbyPlayer[];
  devices: InputDeviceInfo[];
  maps: MapIndexEntry[];
  mapId: string;
  mapLoading: boolean;
  mapError: string | null;
  onChangeMap: (mapId: string) => void;
  onJoin: (deviceId: string) => void;
  onTeam: (slot: number, team: Team) => void;
  onReady: (slot: number) => void;
  onLeave: (slot: number) => void;
  onContinue: () => void;
  onControls: () => void;
  onCredits: () => void;
}

function TeamColumn({
  team,
  players,
  counts,
  onTeam,
  onReady,
  onLeave
}: {
  team: Team;
  players: LobbyPlayer[];
  counts: Record<Team, number>;
  onTeam: (slot: number, team: Team) => void;
  onReady: (slot: number) => void;
  onLeave: (slot: number) => void;
}) {
  const info = TEAM_INFO[team];
  const roster = players.filter((player) => player.team === team);
  const style = {
    '--team': info.color,
    '--team-dark': info.dark
  } as CSSProperties;

  return (
    <section className="team-column" style={style}>
      <header className="team-column-head">
        <div>
          <span className="eyebrow">Equipo</span>
          <h3>{info.label}</h3>
        </div>
        <span className="team-count">
          {roster.length} / {MAX_TEAM_SIZE}
        </span>
      </header>

      <div className="team-players">
        {roster.length === 0 && <p className="team-empty">Nadie en este equipo todavía.</p>}
        {roster.map((player) => {
          const switchBlocked = (target: Team) =>
            target !== player.team && counts[target] >= MAX_TEAM_SIZE;

          return (
            <article
              key={player.slot}
              className={`lobby-player${player.teamReady ? ' is-ready' : ''}`}
            >
              <div className="lobby-player-head">
                <span className="lobby-slot">{player.name}</span>
                <span className="lobby-device">{player.deviceLabel}</span>
                <span className="lobby-state">{player.teamReady ? 'Listo' : 'Eligiendo'}</span>
              </div>

              <div className="team-switch" role="group" aria-label={`Equipo de ${player.name}`}>
                {TEAM_ORDER.map((target) => (
                  <button
                    key={target}
                    type="button"
                    className={target === player.team ? 'is-active' : ''}
                    style={{ '--team': TEAM_INFO[target].color } as CSSProperties}
                    disabled={switchBlocked(target)}
                    onClick={() => onTeam(player.slot, target)}
                  >
                    {TEAM_INFO[target].short}
                  </button>
                ))}
              </div>

              <div className="lobby-player-actions">
                <button
                  type="button"
                  className={`btn btn-tiny${player.teamReady ? ' btn-accent' : ''}`}
                  onClick={() => onReady(player.slot)}
                >
                  {player.teamReady ? '✓ Listo' : 'Marcar listo'}
                </button>
                <button type="button" className="btn btn-tiny btn-ghost" onClick={() => onLeave(player.slot)}>
                  Salir
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function LobbyScreen({
  players,
  devices,
  maps,
  mapId,
  mapLoading,
  mapError,
  onChangeMap,
  onJoin,
  onTeam,
  onReady,
  onLeave,
  onContinue,
  onControls,
  onCredits
}: LobbyScreenProps) {
  const counts = countTeams(players);
  const allReady = players.length > 0 && players.every((player) => player.teamReady);
  const joined = new Set(players.map((player) => player.deviceId));
  const available = devices.filter((device) => !joined.has(device.id));
  const full = players.length >= MAX_PLAYERS;

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
              <li className="is-active">1 · Equipos</li>
              <li>2 · Pokémon</li>
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
            <span className="eyebrow">Paso 1 de 2</span>
            <h2>Elige los equipos</h2>
            <p className="lead">
              Cada mando es un jugador. Pulsa <strong>A</strong> en un mando (o{' '}
              <strong>Espacio</strong> en el teclado) para unirte. Después elige lado y marca
              listo. Hasta 4 jugadores por equipo.
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

        <div className="mp-grid">
          <div className="team-board">
            {TEAM_ORDER.map((team) => (
              <TeamColumn
                key={team}
                team={team}
                players={players}
                counts={counts}
                onTeam={onTeam}
                onReady={onReady}
                onLeave={onLeave}
              />
            ))}
          </div>

          <aside className="join-panel">
            {maps.length > 0 && (
              <div className="map-picker">
                <span className="eyebrow">Mapa</span>
                <div className="map-options">
                  {maps.map((map) => (
                    <button
                      key={map.id}
                      type="button"
                      className={`btn btn-tiny${map.id === mapId ? ' btn-accent' : ' btn-ghost'}`}
                      disabled={mapLoading || map.id === mapId}
                      title={map.description}
                      onClick={() => onChangeMap(map.id)}
                    >
                      {map.name}
                    </button>
                  ))}
                </div>
                {mapLoading && <p className="map-note">Cargando mapa…</p>}
                {mapError && <p className="map-note map-error">{mapError}</p>}
              </div>
            )}

            <span className="eyebrow">Dispositivos detectados</span>
            <h3>Unirse</h3>
            {full ? (
              <p className="team-empty">La partida está completa (8 jugadores).</p>
            ) : available.length === 0 ? (
              <p className="team-empty">Todos los dispositivos ya están jugando.</p>
            ) : (
              <div className="device-list">
                {available.map((device) => (
                  <div className="device-row" key={device.id}>
                    <span className={`device-dot device-${device.kind}`} />
                    <div className="device-copy">
                      <strong>{device.label}</strong>
                      <span>{device.kind === 'keyboard' ? 'Espacio / Enter' : 'Botón A'}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-tiny btn-accent"
                      onClick={() => onJoin(device.id)}
                    >
                      Unirse
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mp-tips">
              <p>
                <span className="key-pill">A</span> unirse / confirmar
              </p>
              <p>
                <span className="key-pill">← →</span> cambiar de equipo
              </p>
              <p>
                <span className="key-pill">B</span> salir del equipo
              </p>
              <p>
                <span className="key-pill">1 teclado</span> + hasta 8 mandos
              </p>
            </div>
          </aside>
        </div>

        <footer className="mp-footer">
          <div className="mp-footer-copy">
            <strong>{players.length}</strong> / {MAX_PLAYERS} jugadores
            {players.length > 0 && !allReady && (
              <span className="muted"> · marca listo a todos para continuar</span>
            )}
            {allReady && <span className="mp-ready-msg"> · todos listos, pulsa A</span>}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-play"
            disabled={!allReady}
            onClick={onContinue}
          >
            Elegir Pokémon →
          </button>
        </footer>
      </div>
    </div>
  );
}
