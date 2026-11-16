import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore
} from 'react';
import { Redirect, useLocation } from 'wouter';
import { modeScoreTarget, type GameModeId, type ModeSettings } from '../game/modes';
import type { LobbyPlayer, MatchPlayerConfig } from '../game/multiplayer';
import type { LoadingProgress, SpriteManifest } from '../game/types';
import type { Team } from '../game/terrain';
import { useSession } from '../session/useSession';
import { ErrorScreen, LoadingScreen } from '../ui/BootScreen';
import { btnClass } from '../ui/buttonStyles';
import { InfoDialog } from '../ui/InfoDialog';
import { MatchCountdown } from '../ui/MatchCountdown';
import { MatchHudHost } from '../ui/MatchHudHost';
import type { MatchStatsStore } from '../ui/matchStatsStore';
import { VirtualMouseLayer } from '../ui/VirtualMouse';
import { GameStage } from './play/GameStage';
import { MatchResultDialog, PauseDialog } from './play/MatchDialogs';
import { useGameEngine } from './play/useGameEngine';
import { useMatchHud } from './play/useMatchHud';
import { useMatchLifecycle } from './play/useMatchLifecycle';
import { SessionGate } from './SessionGate';

const DEFAULT_PROGRESS: LoadingProgress = {
  loaded: 0,
  total: 12,
  label: 'Iniciando el motor'
};

interface PlayScreenProps {
  manifest: SpriteManifest;
  mapId: string;
  configs: MatchPlayerConfig[];
  players: LobbyPlayer[];
  teams: Team[];
  modeId: GameModeId;
  modeSettings: ModeSettings;
  timeLimitSeconds: number;
  /** Si es `false`, la partida se juega siempre en despejado. */
  atmosphereEnabled: boolean;
  /** Oculta la carga interna cuando una intro muestra el progreso encima. */
  hideLoadingOverlay?: boolean;
  /** Permite arrancar la partida; la intro lo activa al terminar. */
  start?: boolean;
  onProgress?: (progress: LoadingProgress) => void;
  onEngineReady?: () => void;
  onEngineError?: (message: string) => void;
}

/** Props que la intro pasa a través de la ruta para controlar la carga. */
type PlayRouteProps = Pick<
  PlayScreenProps,
  'hideLoadingOverlay' | 'start' | 'onProgress' | 'onEngineReady' | 'onEngineError'
>;

/** Contador de FPS aislado para no re-renderizar `PlayScreen` a 2 Hz. */
function MatchFpsBadge({ statsStore }: { statsStore: MatchStatsStore }) {
  const stats = useSyncExternalStore(
    statsStore.subscribe,
    statsStore.getSnapshot,
    statsStore.getSnapshot
  );
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
    <span
      className="flex items-baseline gap-1 rounded-xl border border-line bg-night-850/80 px-2.5 py-1.75 font-mono text-11.2 tabular-nums text-steel-450 backdrop-blur-sm"
      title="Fotogramas por segundo"
    >
      <strong className={`font-semibold transition-colors duration-300 ${fpsTone}`}>
        {fps > 0 ? fps : '—'}
      </strong>{' '}
      FPS
    </span>
  );
}

function PlayScreen({
  manifest,
  mapId,
  configs,
  players,
  teams,
  modeId,
  modeSettings,
  timeLimitSeconds,
  atmosphereEnabled,
  hideLoadingOverlay = false,
  start = true,
  onProgress,
  onEngineReady,
  onEngineError
}: PlayScreenProps) {
  const [, navigate] = useLocation();
  const { resetPlayers, resetRosterReady } = useSession();

  const [progress, setProgress] = useState<LoadingProgress>(DEFAULT_PROGRESS);
  const [engineReady, setEngineReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { canvasRef, barCanvasRef, gameRef, handlersRef, configsRef } = useGameEngine({
    manifest,
    mapId,
    configs,
    modeId,
    modeSettings,
    timeLimitSeconds,
    atmosphereEnabled
  });
  const { statsStore, atmosphere, setAtmosphere, hudVisible, setHudVisible } = useMatchHud();
  const {
    playing,
    paused,
    modal,
    matchResult,
    countdown,
    setModal,
    setMatchResult,
    setCountdown,
    setPaused,
    pausedRef,
    modalRef,
    requestPause,
    resumeGame,
    rematch
  } = useMatchLifecycle({
    start,
    engineReady,
    gameRef,
    configsRef,
    statsStore
  });

  // El HUD se recalcula cada 500 ms. Mantener estables la lista de vistas y el
  // callback evita invalidar los componentes memorizados sin motivo.
  const hudPlayers = useMemo(
    () => players.filter((player) => !player.isBot),
    [players]
  );

  useEffect(() => {
    handlersRef.current = {
      onReady: () => {
        setEngineReady(true);
        onEngineReady?.();
      },
      onProgress: (next) => {
        setProgress(next);
        onProgress?.(next);
      },
      onError: (message) => {
        setError(message);
        onEngineError?.(message);
      },
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
      onPauseRequest: requestPause,
      onMatchStats: (next) => statsStore.setSnapshot(next),
      onMatchEnd: (result) => setMatchResult(result),
      onCountdown: (remaining) => setCountdown(remaining),
      onAtmosphere: (state) => setAtmosphere(state)
    };
  });

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

  const scoreTarget = modeScoreTarget(modeId, modeSettings);

  return (
    <div className="relative size-full">
      <GameStage canvasRef={canvasRef} barCanvasRef={barCanvasRef} />

      {!hideLoadingOverlay && !error && !playing && (
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
            <MatchHudHost
              statsStore={statsStore}
              manifest={manifest}
              players={hudPlayers}
              teams={teams}
              modeId={modeId}
              scoreTarget={scoreTarget}
              timeLimitSeconds={timeLimitSeconds}
              atmosphere={atmosphere}
              onPause={requestPause}
            />
          )}

          <div className="fixed top-2.5 right-2.5 z-7 flex animate-fade-in flex-wrap justify-end gap-1.5">
            <button type="button" className={btnClass('ghost', 'small')} onClick={requestPause}>
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
            <MatchFpsBadge statsStore={statsStore} />
          </div>
        </>
      )}

      {!error && playing && countdown !== null && !paused && !matchResult && (
        <MatchCountdown remaining={countdown} />
      )}

      {!error && playing && paused && !modal && (
        <PauseDialog
          manifest={manifest}
          players={players}
          teams={teams}
          onResume={resumeGame}
          onBackToRoster={backToRoster}
          onBackToTeams={backToTeams}
          onExit={exitToMenu}
          onControls={() => setModal('controls')}
          onCredits={() => setModal('credits')}
        />
      )}

      {!error && playing && matchResult && (
        <MatchResultDialog
          manifest={manifest}
          players={players}
          statsStore={statsStore}
          teams={teams}
          result={matchResult}
          onRematch={rematch}
          onBackToTeams={backToTeams}
          onExit={exitToMenu}
        />
      )}

      {modal && (
        <InfoDialog kind={modal} manifest={manifest} onClose={() => setModal(null)} />
      )}

      <VirtualMouseLayer
        enabled={!playing || paused || modal !== null || matchResult !== null}
      />
    </div>
  );
}

function PlayGuard(props: PlayRouteProps) {
  const {
    manifest,
    mapId,
    matchConfigs,
    players,
    teams,
    modeId,
    modeSettings,
    timeLimitSeconds,
    atmosphereEnabled
  } = useSession();

  if (!manifest || !mapId) return <Redirect to="/lobby" />;
  if (!matchConfigs) return <Redirect to={players.length > 0 ? '/roster' : '/lobby'} />;

  return (
    <PlayScreen
      {...props}
      manifest={manifest}
      mapId={mapId}
      configs={matchConfigs}
      players={players}
      teams={teams}
      modeId={modeId}
      modeSettings={modeSettings}
      timeLimitSeconds={timeLimitSeconds}
      atmosphereEnabled={atmosphereEnabled}
    />
  );
}

export function PlayRoute(props: PlayRouteProps) {
  return (
    <SessionGate
      label="Preparando la partida"
      detail="Iniciando PlayCanvas y cargando el mapa elegido."
    >
      <PlayGuard {...props} />
    </SessionGate>
  );
}
