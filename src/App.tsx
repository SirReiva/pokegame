import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Game } from './game/game';
import type { InputDeviceInfo, MenuAction } from './game/input';
import type { MapIndexEntry } from './game/map';
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
import { Brand } from './ui/Brand';
import { btnClass } from './ui/buttonStyles';
import { KeyPill } from './ui/KeyPill';
import { LobbyScreen } from './ui/LobbyScreen';
import { MatchHud } from './ui/MatchHud';
import { RosterScreen } from './ui/RosterScreen';
import { rosterColumns } from './ui/rosterGrid';
import { PokemonPortrait } from './ui/PokemonPortrait';
import { eyebrow } from './ui/styles';

const DEFAULT_PROGRESS: LoadingProgress = {
  loaded: 0,
  total: 12,
  label: 'Iniciando el motor'
};

const code =
  'rounded-[5px] border border-[#92b2d6]/[0.16] bg-[#92b2d6]/[0.13] px-[5px] py-px font-mono text-[0.85em]';
const overlaySolid =
  'fixed inset-0 z-10 flex items-center justify-center bg-[image:radial-gradient(circle_at_22%_18%,#152436_0%,#0a1119_46%,#05080d_100%)]';
const panel =
  'rounded-[20px] border border-line bg-panel-strong shadow-[0_34px_80px_rgb(0_0_0/0.55)]';
const modalHead = 'flex items-center justify-between gap-4 border-b border-line px-6 py-[18px]';
const modalClose =
  'size-[34px] cursor-pointer rounded-[9px] border border-transparent bg-transparent text-[1.7rem] leading-none text-muted transition-colors duration-[120ms] hover:bg-white/[0.07] hover:text-ink';
const modalBody = 'overflow-y-auto px-6 pt-5 pb-6';
const modalNote = 'col-span-full border-t border-line pt-3.5 text-[0.77rem] leading-[1.6] text-muted';

type ModalKind = 'controls' | 'credits' | null;

interface Handlers {
  onReady: (manifest: SpriteManifest, maps: MapIndexEntry[], activeMapId: string) => void;
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
  const [maps, setMaps] = useState<MapIndexEntry[]>([]);
  const [mapId, setMapId] = useState('');
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
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

  const handleReady = (
    loaded: SpriteManifest,
    mapList: MapIndexEntry[],
    activeMapId: string
  ) => {
    manifestRef.current = loaded;
    setManifest(loaded);
    setMaps(mapList);
    setMapId(activeMapId);
    const url = new URL(window.location.href);
    url.searchParams.set('map', activeMapId);
    window.history.replaceState(null, '', url);
    goPhase('lobby');
  };

  const changeMap = async (nextId: string) => {
    if (nextId === mapId || mapLoading) return;
    const game = gameRef.current;
    if (!game) return;

    setMapLoading(true);
    setMapError(null);
    try {
      const changed = await game.selectMap(nextId);
      if (changed) {
        setMapId(nextId);
        const url = new URL(window.location.href);
        url.searchParams.set('map', nextId);
        window.history.replaceState(null, '', url);
      }
    } catch (cause) {
      setMapError(cause instanceof Error ? cause.message : 'No se pudo cargar el mapa');
    } finally {
      setMapLoading(false);
    }
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
      onReady: (loaded, mapList, activeMapId) =>
        handlersRef.current?.onReady(loaded, mapList, activeMapId),
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
  // El motor comparte el FPS global en cada entrada de `matchStats` (~4 Hz).
  const fps = matchStats[0]?.fps ?? 0;
  const fpsTone =
    fps === 0
      ? 'text-[#8fa3b8]'
      : fps >= 55
        ? 'text-[#bff39d]'
        : fps >= 30
          ? 'text-[#ffd479]'
          : 'text-[#ffb2b5]';
  const selectedEntryFor = (pokemonId: string) =>
    manifest?.pokemon.find((entry) => entry.id === pokemonId) ?? null;

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 block h-full w-full cursor-grab touch-none outline-none active:cursor-grabbing"
      />

      {error && (
        <div className={`${overlaySolid} animate-fade-in`}>
          <div className="flex w-[min(560px,92vw)] animate-rise-in flex-col gap-3 rounded-panel border border-line bg-panel-strong px-7 py-[26px]">
            <span className={eyebrow}>Error de carga</span>
            <h2 className="text-[1.6rem]">No se pudo preparar la demo</h2>
            <p className="break-words rounded-[10px] border border-[#ff5c5c]/25 bg-[#ff5c5c]/[0.09] px-3 py-2.5 font-mono text-[0.8rem] text-[#ff9b9b]">
              {error}
            </p>
            <p className="text-muted">
              Comprueba que has ejecutado <code className={code}>npm run sprites</code> y que el
              servidor de desarrollo está activo.
            </p>
            <button
              type="button"
              className={`${btnClass('primary')} mt-1 self-start`}
              onClick={() => window.location.reload()}
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {!error && phase === 'loading' && (
        <div className={`${overlaySolid} animate-fade-in flex-col gap-[clamp(24px,5vh,54px)] p-8`}>
          <Brand />

          <div className="w-[min(520px,92vw)] animate-rise-in rounded-panel border border-line bg-panel px-6 py-[22px] shadow-[0_24px_60px_rgb(0_0_0/0.45)] backdrop-blur-[12px]">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <span className={eyebrow}>Cargando assets</span>
              <strong className="text-[0.95rem]">{progress.label}</strong>
              <span className="ml-auto font-mono text-[0.72rem] text-muted">
                {progress.loaded} / {progress.total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.07]">
              <div
                className="h-full rounded-[inherit] bg-[image:linear-gradient(90deg,color-mix(in_srgb,var(--color-accent)_70%,#2bb3a3),var(--color-accent))] shadow-[0_0_18px_color-mix(in_srgb,var(--color-accent)_60%,transparent)] transition-[width] duration-[220ms] ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-3 text-[0.78rem] leading-[1.5] text-muted">
              Descargando hojas de animación y calculando las anclas de suelo de cada frame.
            </p>
          </div>

          <p className="font-mono text-[0.7rem] tracking-[0.14em] uppercase text-[#5f7288]">
            Sprites 2D · mundo 3D · splitscreen de 1 a 8 mandos
          </p>
        </div>
      )}

      {!error && phase === 'lobby' && manifest && (
        <LobbyScreen
          players={players}
          devices={devices}
          maps={maps}
          mapId={mapId}
          mapLoading={mapLoading}
          mapError={mapError}
          onChangeMap={changeMap}
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

          <div className="fixed top-2.5 right-2.5 z-[7] flex animate-fade-in flex-wrap justify-end gap-1.5">
            <button type="button" className={btnClass('ghost', 'small')} onClick={pauseGame}>
              Pausa
            </button>
            <button
              type="button"
              className={btnClass('ghost', 'small')}
              onClick={() => setModal('controls')}
            >
              Controles
            </button>
            <button
              type="button"
              className={btnClass('ghost', 'small')}
              onClick={() => setModal('credits')}
            >
              Créditos
            </button>
            <button
              type="button"
              className={btnClass('ghost', 'small')}
              onClick={() => setHudVisible((visible) => !visible)}
            >
              {hudVisible ? 'Ocultar HUD (H)' : 'Mostrar HUD (H)'}
            </button>
            <span
              className="flex items-baseline gap-1 rounded-xl border border-line bg-[#050a10]/80 px-2.5 py-[7px] font-mono text-[0.7rem] tabular-nums text-[#8fa3b8] backdrop-blur-[8px]"
              title="Fotogramas por segundo"
            >
              <strong className={`font-semibold transition-colors duration-300 ${fpsTone}`}>
                {fps > 0 ? fps : '—'}
              </strong>{' '}
              FPS
            </span>
          </div>
        </>
      )}

      {!error && phase === 'playing' && paused && !modal && (
        <div className="fixed inset-0 z-[12] flex animate-fade-in items-center justify-center bg-[#03070c]/[0.72] backdrop-blur-[7px]">
          <div className={`${panel} w-[min(620px,100%)] animate-rise-in p-[clamp(18px,3vw,28px)]`}>
            <header className={modalHead}>
              <div>
                <span className={eyebrow}>Partida en pausa</span>
                <h2 className="mt-[3px] text-[clamp(1.7rem,3vw,2.3rem)]">Pausa</h2>
              </div>
              <button type="button" className={modalClose} onClick={resumeGame} aria-label="Continuar">
                ×
              </button>
            </header>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2 max-[760px]:grid-cols-1">
                {players.map((player) => {
                  const entry = selectedEntryFor(player.pokemonId);
                  const info = TEAM_INFO[player.team];
                  return (
                    <div
                      key={player.slot}
                      className="flex items-center gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--team)_38%,var(--color-line))] border-l-[3px] border-l-(--team) bg-[image:linear-gradient(100deg,color-mix(in_srgb,var(--team)_10%,rgb(8_13_21/0.9)),rgb(8_13_21/0.9))] px-[9px] py-[7px]"
                      style={
                        {
                          '--team': info.color
                        } as CSSProperties
                      }
                    >
                      <span className="grid size-9 place-items-center">
                        {entry ? <PokemonPortrait entry={entry} height={36} /> : '—'}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <strong className="font-mono text-[0.62rem] tracking-[0.06em]">
                          {player.name}
                        </strong>
                        <span className="text-[0.7rem] text-[#9db0c4]">
                          {entry?.name ?? '—'}
                        </span>
                      </span>
                      <span className="font-mono text-[0.52rem] uppercase text-(--team)">
                        {info.short}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`${btnClass('primary', 'play')} col-span-2`}
                  onClick={resumeGame}
                >
                  Continuar
                </button>
                <button type="button" className={btnClass('ghost')} onClick={backToRoster}>
                  Cambiar Pokémon
                </button>
                <button type="button" className={btnClass('ghost')} onClick={backToTeams}>
                  Cambiar equipos
                </button>
                <div className="col-span-2 flex gap-2">
                  <button
                    type="button"
                    className={`${btnClass('ghost', 'small')} flex-1`}
                    onClick={() => setModal('controls')}
                  >
                    Controles
                  </button>
                  <button
                    type="button"
                    className={`${btnClass('ghost', 'small')} flex-1`}
                    onClick={() => setModal('credits')}
                  >
                    Créditos
                  </button>
                </div>
              </div>

              <p className="text-center font-mono text-[0.64rem] text-[#7f92a7]">
                <KeyPill>A</KeyPill> continuar · <KeyPill>B</KeyPill> continuar ·{' '}
                <KeyPill>Start / Esc</KeyPill> pausa
              </p>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div
          className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-[#04070c]/70 p-[22px] backdrop-blur-[6px]"
          onClick={() => setModal(null)}
        >
          <div
            className={`${panel} flex max-h-[min(84vh,780px)] w-[min(760px,100%)] animate-pop-in flex-col overflow-hidden`}
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={modalHead}>
              <h2 className="text-[1.35rem]">
                {modal === 'controls' ? 'Controles' : 'Créditos y licencia'}
              </h2>
              <button
                type="button"
                className={modalClose}
                onClick={() => setModal(null)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </header>

            {modal === 'controls' ? (
              <div
                className={`${modalBody} grid grid-cols-2 gap-x-8 gap-y-6 max-[640px]:grid-cols-1`}
              >
                <section>
                  <h3 className="mb-2.5 font-mono text-[0.78rem] tracking-[0.14em] uppercase text-muted">
                    Mando (1-8 jugadores)
                  </h3>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[0.83rem] text-[#c2d0de]">
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>A</KeyPill> unirse / confirmar
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>B</KeyPill> volver / desmarcar
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>Stick izquierdo</KeyPill> moverte y navegar por los menús
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>Stick derecho</KeyPill> girar tu cámara
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>L2 / R2</KeyPill> alejar / acercar
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>Start</KeyPill> pausar la partida
                    </li>
                  </ul>
                </section>
                <section>
                  <h3 className="mb-2.5 font-mono text-[0.78rem] tracking-[0.14em] uppercase text-muted">
                    Teclado (1 jugador)
                  </h3>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[0.83rem] text-[#c2d0de]">
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>Espacio / Enter</KeyPill> unirse / confirmar
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>WASD / flechas</KeyPill> moverte y navegar por los menús
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>Q / E</KeyPill> girar tu cámara
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>Arrastrar</KeyPill> orbitar con el ratón
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>Rueda</KeyPill> zoom
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>Shift</KeyPill> correr
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>Esc</KeyPill> pausa / volver
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                      <KeyPill>H</KeyPill> ocultar o mostrar el HUD
                    </li>
                  </ul>
                </section>
                <p className={modalNote}>
                  La pantalla se reparte en una vista por jugador. Cada equipo aparece en su base
                  (azul o roja) y se mueve libremente. Los mandos se detectan automáticamente al
                  pulsar un botón.
                </p>
              </div>
            ) : (
              <div className={modalBody}>
                <p className="text-[0.84rem] leading-[1.6] text-[#c2d0de]">
                  Los sprites proceden de{' '}
                  <a
                    className="text-[#8fd1ff] underline underline-offset-2"
                    href={manifest?.source ?? 'https://sprites.pmdcollab.org/'}
                    target="_blank"
                    rel="noreferrer"
                  >
                    PMD Sprite Collab
                  </a>{' '}
                  y se distribuyen bajo licencia{' '}
                  <a
                    className="text-[#8fd1ff] underline underline-offset-2"
                    href={manifest?.licenseUrl ?? 'https://creativecommons.org/licenses/by-nc/4.0/'}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {manifest?.license ?? 'CC BY-NC 4.0'}
                  </a>
                  . Esta demo no tiene fines comerciales.
                </p>
                <div className="my-4 flex flex-col gap-0.5">
                  {manifest?.pokemon.map((entry) => {
                    const artists = [...new Set(entry.credits.map((credit) => credit.artist))];
                    const actions = entry.credits.flatMap((credit) => credit.actions);
                    return (
                      <div
                        className="grid grid-cols-[150px_minmax(0,1fr)] gap-3.5 border-b border-[#9abee4]/[0.08] py-[9px] text-[0.8rem] last:border-b-0 max-[640px]:grid-cols-1 max-[640px]:gap-1"
                        key={entry.id}
                      >
                        <div className="flex items-baseline gap-[7px]">
                          <strong>{entry.name}</strong>
                          <span className="font-mono text-[0.62rem] text-[#71859b]">
                            #{String(entry.dex).padStart(3, '0')}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-col gap-0.5 break-words text-[#c2d0de]">
                          <span>
                            {artists.length > 0 ? artists.join(' · ') : 'Créditos no disponibles'}
                          </span>
                          {actions.length > 0 && (
                            <span className="text-[0.78rem] leading-[1.5] text-muted">
                              Animaciones: {[...new Set(actions)].join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="col-span-full text-[0.77rem] leading-[1.6] text-muted">
                  Las hojas originales, sus ficheros <code className={code}>credits.txt</code> y el
                  detalle completo están en <code className={code}>public/sprites/CREDITS.md</code>.
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
