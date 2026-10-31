import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Redirect, useLocation } from 'wouter';
import { Game } from '../game/game';
import type { InputDeviceInfo, MenuAction } from '../game/input';
import {
  TEAM_INFO,
  type LobbyPlayer,
  type MatchEndResult,
  type MatchPlayerConfig,
  type PlayerMatchStats
} from '../game/multiplayer';
import type { LoadingProgress, SpriteManifest } from '../game/types';
import { useSession } from '../session/useSession';
import { ErrorScreen, LoadingScreen } from '../ui/BootScreen';
import { btnClass } from '../ui/buttonStyles';
import { InfoDialog, type InfoKind } from '../ui/InfoDialog';
import { KeyPill } from '../ui/KeyPill';
import { MatchHud } from '../ui/MatchHud';
import { PokemonPortrait } from '../ui/PokemonPortrait';
import { eyebrow } from '../ui/styles';
import { SessionGate } from './SessionGate';

const DEFAULT_PROGRESS: LoadingProgress = {
  loaded: 0,
  total: 12,
  label: 'Iniciando el motor'
};

const panel =
  'rounded-[20px] border border-line bg-panel-strong shadow-[0_34px_80px_rgb(0_0_0/0.55)]';
const modalHead = 'flex items-center justify-between gap-4 border-b border-line px-6 py-[18px]';
const modalClose =
  'size-[34px] cursor-pointer rounded-[9px] border border-transparent bg-transparent text-27.2 leading-none text-muted transition-colors duration-[120ms] hover:bg-white/[0.07] hover:text-ink';

interface PlayHandlers {
  onReady: () => void;
  onProgress: (progress: LoadingProgress) => void;
  onError: (message: string) => void;
  onDevicesChanged: (devices: InputDeviceInfo[]) => void;
  onMenuInput: (event: { deviceId: string; action: MenuAction }) => void;
  onPauseRequest: () => void;
  onMatchStats: (stats: PlayerMatchStats[]) => void;
  onMatchEnd: (result: MatchEndResult) => void;
}

interface PlayScreenProps {
  manifest: SpriteManifest;
  mapId: string;
  configs: MatchPlayerConfig[];
  players: LobbyPlayer[];
}

function PlayScreen({ manifest, mapId, configs, players }: PlayScreenProps) {
  const [, navigate] = useLocation();
  const { resetPlayers, resetRosterReady } = useSession();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const handlersRef = useRef<PlayHandlers | null>(null);
  const configsRef = useRef(configs);
  const pausedRef = useRef(false);
  const modalRef = useRef<InfoKind | null>(null);

  const [progress, setProgress] = useState<LoadingProgress>(DEFAULT_PROGRESS);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [modal, setModal] = useState<InfoKind | null>(null);
  const [hudVisible, setHudVisible] = useState(true);
  const [stats, setStats] = useState<PlayerMatchStats[]>([]);
  const [matchResult, setMatchResult] = useState<MatchEndResult | null>(null);

  useEffect(() => {
    configsRef.current = configs;
  }, [configs]);

  useEffect(() => {
    pausedRef.current = paused;
    modalRef.current = modal;
  }, [paused, modal]);

  useEffect(() => {
    handlersRef.current = {
      onReady: () => {
        gameRef.current?.startMatch(configsRef.current);
        setPlaying(true);
      },
      onProgress: (next) => setProgress(next),
      onError: (message) => setError(message),
      onDevicesChanged: () => {},
      onMenuInput: (event) => {
        if (modalRef.current !== null) {
          if (event.action === 'cancel') setModal(null);
          return;
        }
        if (pausedRef.current && (event.action === 'confirm' || event.action === 'cancel')) {
          setPaused(false);
        }
      },
      onPauseRequest: () => setPaused(true),
      onMatchStats: (next) => setStats(next),
      onMatchEnd: (result) => setMatchResult(result)
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;

    const game = new Game(
      canvas,
      {
        onReady: () => {
          if (!disposed) handlersRef.current?.onReady();
        },
        onProgress: (next) => {
          if (!disposed) handlersRef.current?.onProgress(next);
        },
        onError: (message) => {
          if (!disposed) handlersRef.current?.onError(message);
        },
        onDevicesChanged: (devices) => {
          if (!disposed) handlersRef.current?.onDevicesChanged(devices);
        },
        onMenuInput: (event) => {
          if (!disposed) handlersRef.current?.onMenuInput(event);
        },
        onPauseRequest: () => {
          if (!disposed) handlersRef.current?.onPauseRequest();
        },
        onMatchStats: (next) => {
          if (!disposed) handlersRef.current?.onMatchStats(next);
        },
        onMatchEnd: (result) => {
          if (!disposed) handlersRef.current?.onMatchEnd(result);
        }
      },
      { mapId, manifest }
    );

    gameRef.current = game;
    void game.init();

    return () => {
      disposed = true;
      gameRef.current = null;
      game.dispose();
    };
  }, [mapId, manifest]);

  useEffect(() => {
    gameRef.current?.setPaused(paused || modal !== null);
  }, [paused, modal]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'h' && !event.repeat) {
        setHudVisible((visible) => !visible);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const resumeGame = () => {
    setPaused(false);
    setModal(null);
  };

  const backToRoster = () => {
    resetRosterReady();
    navigate('/roster');
  };

  const backToTeams = () => {
    resetRosterReady();
    navigate('/lobby');
  };

  const exitToMenu = () => {
    resetPlayers();
    navigate('/');
  };

  const rematch = () => {
    setMatchResult(null);
    setStats([]);
    setPaused(false);
    gameRef.current?.startMatch(configsRef.current);
  };

  const selectedEntryFor = (pokemonId: string) =>
    manifest.pokemon.find((entry) => entry.id === pokemonId) ?? null;
  const fps = stats[0]?.fps ?? 0;
  const fpsTone =
    fps === 0
      ? 'text-steel-450'
      : fps >= 55
        ? 'text-accent-soft'
        : fps >= 30
          ? 'text-warning'
          : 'text-danger-100';

  return (
    <div className="relative size-full">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 block size-full cursor-grab touch-none outline-none active:cursor-grabbing"
      />

      {!error && !playing && (
        <LoadingScreen
          label={progress.label}
          detail="Descargando hojas de animación y preparando el mapa."
          progress={progress}
        />
      )}

      {error && (
        <ErrorScreen
          message={error}
          onRetry={() => window.location.reload()}
          onBack={() => navigate('/lobby')}
          backLabel="Volver al lobby"
        />
      )}

      {!error && playing && (
        <>
          {hudVisible && (
            <MatchHud
              manifest={manifest}
              players={players}
              stats={stats}
              onPause={() => setPaused(true)}
            />
          )}

          <div className="fixed top-2.5 right-2.5 z-7 flex animate-fade-in flex-wrap justify-end gap-1.5">
            <button type="button" className={btnClass('ghost', 'small')} onClick={() => setPaused(true)}>
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
              className="flex items-baseline gap-1 rounded-xl border border-line bg-night-850/80 px-2.5 py-1.75 font-mono text-11.2 tabular-nums text-steel-450 backdrop-blur-sm"
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

      {!error && playing && paused && !modal && (
        <div className="fixed inset-0 z-12 flex animate-fade-in items-center justify-center bg-night-950/72 backdrop-blur-[7px]">
          <div className={`${panel} w-[min(620px,100%)] animate-rise-in p-[clamp(18px,3vw,28px)]`}>
            <header className={modalHead}>
              <div>
                <span className={eyebrow}>Partida en pausa</span>
                <h2 className="mt-0.75 text-[clamp(1.7rem,3vw,2.3rem)]">Pausa</h2>
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
                      className="flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--team)_38%,var(--color-line))] border-l-[3px] border-l-(--team) bg-[linear-gradient(100deg,color-mix(in_srgb,var(--team)_10%,rgb(8_13_21/0.9)),rgb(8_13_21/0.9))] px-2.25 py-1.75"
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
                        <strong className="font-mono text-9.92 tracking-[0.06em]">
                          {player.name}
                        </strong>
                        <span className="text-11.2 text-steel-400">
                          {entry?.name ?? '—'}
                        </span>
                      </span>
                      <span className="font-mono text-8.32 uppercase text-(--team)">
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
                <button type="button" className={btnClass('ghost')} onClick={exitToMenu}>
                  Menú principal
                </button>
                <div className="flex gap-2">
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

              <p className="text-center font-mono text-10.24 text-steel-650">
                <KeyPill>A</KeyPill> continuar · <KeyPill>B</KeyPill> continuar ·{' '}
                <KeyPill>Start / Esc</KeyPill> pausa
              </p>
            </div>
          </div>
        </div>
      )}

      {!error && playing && matchResult && (
        <div className="fixed inset-0 z-14 flex animate-fade-in items-center justify-center bg-night-950/78 backdrop-blur-sm">
          <div className={`${panel} w-[min(560px,100%)] animate-rise-in p-[clamp(20px,3vw,30px)]`}>
            <div className="text-center">
              <span className={eyebrow}>Fin de la partida</span>
              <h2
                className="mt-1 text-[clamp(2rem,5vw,3rem)]"
                style={{ color: TEAM_INFO[matchResult.winner].color }}
              >
                Gana el {TEAM_INFO[matchResult.winner].label.toLowerCase()}
              </h2>
              <p className="mt-2 font-mono text-12.8 text-steel-400">
                {matchResult.blueScore} KO azules · {matchResult.redScore} KO rojos
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`${btnClass('primary', 'play')} col-span-2`}
                onClick={rematch}
              >
                Revancha
              </button>
              <button type="button" className={btnClass('ghost')} onClick={backToTeams}>
                Cambiar equipos
              </button>
              <button type="button" className={btnClass('ghost')} onClick={exitToMenu}>
                Menú principal
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <InfoDialog kind={modal} manifest={manifest} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function PlayGuard() {
  const { manifest, mapId, matchConfigs, players } = useSession();

  if (!manifest || !mapId) return <Redirect to="/lobby" />;
  if (!matchConfigs) return <Redirect to={players.length > 0 ? '/roster' : '/lobby'} />;

  return (
    <PlayScreen
      manifest={manifest}
      mapId={mapId}
      configs={matchConfigs}
      players={players}
    />
  );
}

export function PlayRoute() {
  return (
    <SessionGate
      label="Preparando la partida"
      detail="Iniciando PlayCanvas y cargando el mapa elegido."
    >
      <PlayGuard />
    </SessionGate>
  );
}
