import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Game } from './game/game';
import type { InputDeviceInfo, MenuAction } from './game/input';
import {
  MAX_PLAYERS,
  MAX_TEAM_SIZE,
  TEAM_INFO,
  countTeams,
  nextFreeSlot,
  otherTeam,
  type LobbyPlayer,
  type MatchPlayerConfig,
  type PlayerMatchStats
} from './game/multiplayer';
import type { Team } from './game/terrain';
import type { GamePhase, LoadingProgress, SpriteManifest } from './game/types';
import { LobbyScreen } from './ui/LobbyScreen';
import { MatchHud } from './ui/MatchHud';
import { RosterScreen } from './ui/RosterScreen';
import { rosterColumns } from './ui/rosterGrid';
import { PokemonPortrait } from './ui/PokemonPortrait';

const DEFAULT_PROGRESS: LoadingProgress = {
  loaded: 0,
  total: 12,
  label: 'Iniciando el motor'
};

type ModalKind = 'controls' | 'credits' | null;

interface Handlers {
  onReady: (manifest: SpriteManifest) => void;
  onMenuInput: (event: { deviceId: string; action: MenuAction }) => void;
  onPauseRequest: () => void;
  onDevicesChanged: (devices: InputDeviceInfo[]) => void;
  onMatchStats: (stats: PlayerMatchStats[]) => void;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);

  const phaseRef = useRef<GamePhase>('loading');
  const playersRef = useRef<LobbyPlayer[]>([]);
  const devicesRef = useRef<InputDeviceInfo[]>([]);
  const manifestRef = useRef<SpriteManifest | null>(null);
  const pausedRef = useRef(false);
  const modalRef = useRef<ModalKind>(null);
  const handlersRef = useRef<Handlers | null>(null);

  const [phase, setPhase] = useState<GamePhase>('loading');
  const [manifest, setManifest] = useState<SpriteManifest | null>(null);
  const [progress, setProgress] = useState<LoadingProgress>(DEFAULT_PROGRESS);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<InputDeviceInfo[]>([]);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [matchStats, setMatchStats] = useState<PlayerMatchStats[]>([]);
  const [paused, setPaused] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [hudVisible, setHudVisible] = useState(true);

  // --- Helpers que mantienen estado y ref sincronizados ---------------------

  const commitPlayers = (next: LobbyPlayer[]) => {
    playersRef.current = next;
    setPlayers(next);
  };

  const goPhase = (next: GamePhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const setPausedSafe = (next: boolean) => {
    pausedRef.current = next;
    setPaused(next);
  };

  const updateDevices = (next: InputDeviceInfo[]) => {
    devicesRef.current = next;
    setDevices(next);
  };

  const deviceFor = (deviceId: string): InputDeviceInfo =>
    devicesRef.current.find((device) => device.id === deviceId) ?? {
      id: deviceId,
      kind: deviceId === 'kbd' ? 'keyboard' : 'gamepad',
      label: deviceId === 'kbd' ? 'Teclado' : 'Mando',
      index: null
    };

  // --- Acciones de la sala de espera ---------------------------------------

  const joinDevice = (deviceId: string) => {
    const current = playersRef.current;
    if (current.length >= MAX_PLAYERS) return;
    if (current.some((player) => player.deviceId === deviceId)) return;

    const device = deviceFor(deviceId);
    const counts = countTeams(current);
    let team: Team = 'blue';
    if (counts.blue <= counts.red && counts.blue < MAX_TEAM_SIZE) {
      team = 'blue';
    } else if (counts.red < MAX_TEAM_SIZE) {
      team = 'red';
    }

    const slot = nextFreeSlot(current);
    if (slot === null) return;

    const firstPokemon = manifestRef.current?.pokemon[0]?.id ?? '';
    commitPlayers([
      ...current,
      {
        slot,
        name: `J${slot}`,
        deviceId,
        deviceKind: device.kind,
        deviceLabel: device.label,
        team,
        teamReady: false,
        pokemonId: firstPokemon,
        rosterReady: false
      }
    ]);
  };

  const setPlayerTeam = (slot: number, team: Team) => {
    const current = playersRef.current;
    const player = current.find((entry) => entry.slot === slot);
    if (!player) return;
    const counts = countTeams(current);
    if (team !== player.team && counts[team] >= MAX_TEAM_SIZE) return;
    commitPlayers(
      current.map((entry) =>
        entry.slot === slot && entry.team !== team
          ? { ...entry, team, teamReady: false }
          : entry
      )
    );
  };

  const toggleTeamReady = (slot: number) => {
    commitPlayers(
      playersRef.current.map((entry) =>
        entry.slot === slot ? { ...entry, teamReady: !entry.teamReady } : entry
      )
    );
  };

  const leavePlayer = (slot: number) => {
    const next = playersRef.current.filter((entry) => entry.slot !== slot);
    commitPlayers(next);
    if (next.length === 0 && phaseRef.current === 'roster') goPhase('lobby');
  };

  const continueToRoster = () => {
    const current = playersRef.current;
    if (current.length === 0 || !current.every((player) => player.teamReady)) return;
    const firstPokemon = manifestRef.current?.pokemon[0]?.id ?? '';
    commitPlayers(
      current.map((player) => ({
        ...player,
        pokemonId: player.pokemonId || firstPokemon,
        rosterReady: false
      }))
    );
    goPhase('roster');
  };

  // --- Acciones de la selección de Pokémon ---------------------------------

  const moveCursor = (slot: number, action: MenuAction) => {
    const current = playersRef.current;
    const player = current.find((entry) => entry.slot === slot);
    const list = manifestRef.current?.pokemon ?? [];
    if (!player || player.rosterReady || list.length === 0) return;

    const columns = rosterColumns();
    const index = Math.max(
      0,
      list.findIndex((entry) => entry.id === player.pokemonId)
    );
    const column = index % columns;
    let nextIndex = index;

    if (action === 'left' && column > 0) nextIndex = index - 1;
    else if (action === 'right' && column < columns - 1 && index + 1 < list.length) {
      nextIndex = index + 1;
    } else if (action === 'up' && index - columns >= 0) {
      nextIndex = index - columns;
    } else if (action === 'down' && index + columns < list.length) {
      nextIndex = index + columns;
    }

    if (nextIndex === index) return;
    commitPlayers(
      current.map((entry) =>
        entry.slot === slot
          ? { ...entry, pokemonId: list[nextIndex].id, rosterReady: false }
          : entry
      )
    );
  };

  const setRosterReady = (slot: number, ready: boolean) => {
    commitPlayers(
      playersRef.current.map((entry) =>
        entry.slot === slot ? { ...entry, rosterReady: ready } : entry
      )
    );
  };

  const toggleRosterReady = (slot: number) => {
    const current = playersRef.current;
    const player = current.find((entry) => entry.slot === slot);
    if (!player) return;
    setRosterReady(slot, !player.rosterReady);
  };

  const startMatch = () => {
    const current = playersRef.current;
    if (current.length === 0) return;
    if (!current.every((player) => player.rosterReady && player.pokemonId)) return;

    const configs: MatchPlayerConfig[] = current.map((player) => ({
      slot: player.slot,
      name: player.name,
      deviceId: player.deviceId,
      deviceKind: player.deviceKind,
      team: player.team,
      pokemonId: player.pokemonId
    }));

    setModal(null);
    setPausedSafe(false);
    setMatchStats([]);
    setHudVisible(true);
    gameRef.current?.startMatch(configs);
    goPhase('playing');
  };

  const connectedPlayers = (): LobbyPlayer[] => {
    const connected = new Set(devicesRef.current.map((device) => device.id));
    return playersRef.current.filter((player) => connected.has(player.deviceId));
  };

  const backToTeams = () => {
    gameRef.current?.endMatch();
    const kept = connectedPlayers().map((player) => ({
      ...player,
      rosterReady: false
    }));
    commitPlayers(kept);
    setModal(null);
    setPausedSafe(false);
    setMatchStats([]);
    goPhase('lobby');
  };

  const backToRoster = () => {
    gameRef.current?.endMatch();
    const kept = connectedPlayers().map((player) => ({
      ...player,
      rosterReady: false
    }));
    commitPlayers(kept);
    setModal(null);
    setPausedSafe(false);
    setMatchStats([]);
    goPhase(kept.length > 0 ? 'roster' : 'lobby');
  };

  const pauseGame = () => {
    if (phaseRef.current !== 'playing' || modalRef.current !== null) return;
    setPausedSafe(true);
    gameRef.current?.setPaused(true);
  };

  const resumeGame = () => {
    setPausedSafe(false);
    gameRef.current?.setPaused(false);
  };

  // --- Entrada de menús -----------------------------------------------------

  const handleLobbyAction = (deviceId: string, action: MenuAction) => {
    const current = playersRef.current;
    const player = current.find((entry) => entry.deviceId === deviceId);

    if (!player) {
      if (action === 'confirm') joinDevice(deviceId);
      return;
    }

    if (!player.teamReady) {
      if (action === 'left' || action === 'right') {
        setPlayerTeam(player.slot, otherTeam(player.team));
      } else if (action === 'confirm') {
        toggleTeamReady(player.slot);
      } else if (action === 'cancel') {
        leavePlayer(player.slot);
      }
      return;
    }

    if (action === 'cancel') {
      toggleTeamReady(player.slot);
      return;
    }

    if (action === 'confirm') {
      const latest = playersRef.current;
      if (latest.length > 0 && latest.every((entry) => entry.teamReady)) {
        continueToRoster();
      }
    }
  };

  const handleRosterAction = (deviceId: string, action: MenuAction) => {
    const player = playersRef.current.find((entry) => entry.deviceId === deviceId);
    if (!player) return;

    if (action === 'cancel') {
      if (player.rosterReady) setRosterReady(player.slot, false);
      else backToTeams();
      return;
    }

    if (action === 'confirm') {
      if (!player.rosterReady) {
        setRosterReady(player.slot, true);
        return;
      }
      const latest = playersRef.current;
      if (latest.length > 0 && latest.every((entry) => entry.rosterReady)) {
        startMatch();
      }
      return;
    }

    moveCursor(player.slot, action);
  };

  const handleMenuInput = (event: { deviceId: string; action: MenuAction }) => {
    if (modalRef.current !== null) {
      if (event.action === 'cancel') setModal(null);
      return;
    }

    if (pausedRef.current) {
      if (event.action === 'confirm' || event.action === 'cancel') resumeGame();
      return;
    }

    if (phaseRef.current === 'lobby') {
      handleLobbyAction(event.deviceId, event.action);
    } else if (phaseRef.current === 'roster') {
      handleRosterAction(event.deviceId, event.action);
    }
  };

  const handleDevicesChanged = (next: InputDeviceInfo[]) => {
    updateDevices(next);
    if (phaseRef.current !== 'lobby' && phaseRef.current !== 'roster') return;
    const connected = new Set(next.map((device) => device.id));
    const kept = playersRef.current.filter((player) => connected.has(player.deviceId));
    if (kept.length === playersRef.current.length) return;
    commitPlayers(kept);
    if (phaseRef.current === 'roster' && kept.length === 0) goPhase('lobby');
  };

  const handlePauseRequest = () => {
    if (phaseRef.current !== 'playing' || modalRef.current !== null) return;
    setPausedSafe(true);
    gameRef.current?.setPaused(true);
  };

  const handleReady = (loaded: SpriteManifest) => {
    manifestRef.current = loaded;
    setManifest(loaded);
    goPhase('lobby');
  };

  // El motor se crea una sola vez; los handlers se refrescan en cada render
  // para que vean el estado más reciente de React.
  useEffect(() => {
    handlersRef.current = {
      onReady: handleReady,
      onMenuInput: handleMenuInput,
      onPauseRequest: handlePauseRequest,
      onDevicesChanged: handleDevicesChanged,
      onMatchStats: (next) => setMatchStats(next)
    };
  });

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    pausedRef.current = paused;
    modalRef.current = modal;
    gameRef.current?.setPaused(paused || modal !== null);
  }, [paused, modal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const game = new Game(canvas, {
      onReady: (loaded) => handlersRef.current?.onReady(loaded),
      onProgress: (next) => setProgress(next),
      onError: (message) => setError(message),
      onDevicesChanged: (next) => handlersRef.current?.onDevicesChanged(next),
      onMenuInput: (event) => handlersRef.current?.onMenuInput(event),
      onPauseRequest: () => handlersRef.current?.onPauseRequest(),
      onMatchStats: (next) => handlersRef.current?.onMatchStats(next)
    });

    gameRef.current = game;
    void game.init();

    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === 'h' &&
        !event.repeat &&
        phaseRef.current === 'playing' &&
        modalRef.current === null
      ) {
        setHudVisible((visible) => !visible);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const percent = Math.min(100, Math.round((progress.loaded / Math.max(progress.total, 1)) * 100));
  const selectedEntryFor = (pokemonId: string) =>
    manifest?.pokemon.find((entry) => entry.id === pokemonId) ?? null;

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" />

      {error && (
        <div className="overlay overlay-solid">
          <div className="panel error-panel">
            <span className="eyebrow">Error de carga</span>
            <h2>No se pudo preparar la demo</h2>
            <p className="error-message">{error}</p>
            <p className="muted">
              Comprueba que has ejecutado <code>npm run sprites</code> y que el servidor de
              desarrollo está activo.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </div>
        </div>
      )}

      {!error && phase === 'loading' && (
        <div className="overlay overlay-solid loading-screen">
          <div className="brand">
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

          <div className="loading-card">
            <div className="loading-copy">
              <span className="eyebrow">Cargando assets</span>
              <strong>{progress.label}</strong>
              <span className="loading-count">
                {progress.loaded} / {progress.total}
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <p className="muted small">
              Descargando hojas de animación y calculando las anclas de suelo de cada frame.
            </p>
          </div>

          <p className="boot-note">Sprites 2D · mundo 3D · splitscreen de 1 a 8 mandos</p>
        </div>
      )}

      {!error && phase === 'lobby' && manifest && (
        <LobbyScreen
          players={players}
          devices={devices}
          onJoin={joinDevice}
          onTeam={setPlayerTeam}
          onReady={toggleTeamReady}
          onLeave={leavePlayer}
          onContinue={continueToRoster}
          onControls={() => setModal('controls')}
          onCredits={() => setModal('credits')}
        />
      )}

      {!error && phase === 'roster' && manifest && (
        <RosterScreen
          manifest={manifest}
          players={players}
          onPick={(slot, pokemonId) => {
            if (players.length !== 1) return;
            commitPlayers(
              playersRef.current.map((player) =>
                player.slot === slot ? { ...player, pokemonId, rosterReady: false } : player
              )
            );
          }}
          onToggleReady={toggleRosterReady}
          onStart={startMatch}
          onBack={backToTeams}
          onControls={() => setModal('controls')}
          onCredits={() => setModal('credits')}
        />
      )}

      {!error && phase === 'playing' && manifest && (
        <>
          {hudVisible && (
            <MatchHud
              manifest={manifest}
              players={players}
              stats={matchStats}
              onPause={pauseGame}
            />
          )}

          <div className="match-actions">
            <button type="button" className="btn btn-ghost btn-small" onClick={pauseGame}>
              Pausa
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setModal('controls')}>
              Controles
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setModal('credits')}>
              Créditos
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => setHudVisible((visible) => !visible)}
            >
              {hudVisible ? 'Ocultar HUD (H)' : 'Mostrar HUD (H)'}
            </button>
          </div>
        </>
      )}

      {!error && phase === 'playing' && paused && !modal && (
        <div className="overlay pause-overlay">
          <div className="panel pause-panel">
            <header className="modal-head">
              <div>
                <span className="eyebrow">Partida en pausa</span>
                <h2>Pausa</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={resumeGame}
                aria-label="Continuar"
              >
                ×
              </button>
            </header>

            <div className="pause-body">
              <div className="pause-roster">
                {players.map((player) => {
                  const entry = selectedEntryFor(player.pokemonId);
                  const info = TEAM_INFO[player.team];
                  return (
                    <div
                      key={player.slot}
                      className="pause-player"
                      style={
                        {
                          '--team': info.color,
                          '--team-dark': info.dark
                        } as CSSProperties
                      }
                    >
                      <span className="pause-avatar">
                        {entry ? <PokemonPortrait entry={entry} height={36} /> : '—'}
                      </span>
                      <span className="pause-player-copy">
                        <strong>{player.name}</strong>
                        <span>{entry?.name ?? '—'}</span>
                      </span>
                      <span className="pause-team">{info.short}</span>
                    </div>
                  );
                })}
              </div>

              <div className="pause-actions">
                <button type="button" className="btn btn-primary btn-play" onClick={resumeGame}>
                  Continuar
                </button>
                <button type="button" className="btn btn-ghost" onClick={backToRoster}>
                  Cambiar Pokémon
                </button>
                <button type="button" className="btn btn-ghost" onClick={backToTeams}>
                  Cambiar equipos
                </button>
                <div className="pause-actions-row">
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setModal('controls')}>
                    Controles
                  </button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setModal('credits')}>
                    Créditos
                  </button>
                </div>
              </div>

              <p className="pause-hint">
                <span className="key-pill">A</span> continuar ·{' '}
                <span className="key-pill">B</span> continuar ·{' '}
                <span className="key-pill">Start / Esc</span> pausa
              </p>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="overlay modal-overlay" onClick={() => setModal(null)}>
          <div
            className="panel modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-head">
              <h2>{modal === 'controls' ? 'Controles' : 'Créditos y licencia'}</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setModal(null)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </header>

            {modal === 'controls' ? (
              <div className="modal-body controls-body">
                <section>
                  <h3>Mando (1-8 jugadores)</h3>
                  <ul className="control-list">
                    <li>
                      <span className="key-pill">A</span> unirse / confirmar
                    </li>
                    <li>
                      <span className="key-pill">B</span> volver / desmarcar
                    </li>
                    <li>
                      <span className="key-pill">Stick izquierdo</span> moverte y navegar por los menús
                    </li>
                    <li>
                      <span className="key-pill">Stick derecho</span> girar tu cámara
                    </li>
                    <li>
                      <span className="key-pill">L2 / R2</span> alejar / acercar
                    </li>
                    <li>
                      <span className="key-pill">Start</span> pausar la partida
                    </li>
                  </ul>
                </section>
                <section>
                  <h3>Teclado (1 jugador)</h3>
                  <ul className="control-list">
                    <li>
                      <span className="key-pill">Espacio / Enter</span> unirse / confirmar
                    </li>
                    <li>
                      <span className="key-pill">WASD / flechas</span> moverte y navegar por los menús
                    </li>
                    <li>
                      <span className="key-pill">Q / E</span> girar tu cámara
                    </li>
                    <li>
                      <span className="key-pill">Arrastrar</span> orbitar con el ratón
                    </li>
                    <li>
                      <span className="key-pill">Rueda</span> zoom
                    </li>
                    <li>
                      <span className="key-pill">Shift</span> correr
                    </li>
                    <li>
                      <span className="key-pill">Esc</span> pausa / volver
                    </li>
                    <li>
                      <span className="key-pill">H</span> ocultar o mostrar el HUD
                    </li>
                  </ul>
                </section>
                <p className="modal-note">
                  La pantalla se reparte en una vista por jugador. Cada equipo aparece en su base
                  (azul o roja) y se mueve libremente. Los mandos se detectan automáticamente al
                  pulsar un botón.
                </p>
              </div>
            ) : (
              <div className="modal-body credits-body">
                <p>
                  Los sprites proceden de{' '}
                  <a href={manifest?.source ?? 'https://sprites.pmdcollab.org/'} target="_blank" rel="noreferrer">
                    PMD Sprite Collab
                  </a>{' '}
                  y se distribuyen bajo licencia{' '}
                  <a
                    href={manifest?.licenseUrl ?? 'https://creativecommons.org/licenses/by-nc/4.0/'}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {manifest?.license ?? 'CC BY-NC 4.0'}
                  </a>
                  . Esta demo no tiene fines comerciales.
                </p>
                <div className="credit-list">
                  {manifest?.pokemon.map((entry) => {
                    const artists = [...new Set(entry.credits.map((credit) => credit.artist))];
                    const actions = entry.credits.flatMap((credit) => credit.actions);
                    return (
                      <div className="credit-row" key={entry.id}>
                        <div className="credit-name">
                          <strong>{entry.name}</strong>
                          <span>#{String(entry.dex).padStart(3, '0')}</span>
                        </div>
                        <div className="credit-meta">
                          <span>{artists.length > 0 ? artists.join(' · ') : 'Créditos no disponibles'}</span>
                          {actions.length > 0 && (
                            <span className="muted small">
                              Animaciones: {[...new Set(actions)].join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="modal-note">
                  Las hojas originales, sus ficheros <code>credits.txt</code> y el detalle completo
                  están en <code>public/sprites/CREDITS.md</code>.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
