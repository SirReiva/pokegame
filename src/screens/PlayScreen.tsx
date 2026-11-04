import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Redirect, useLocation } from 'wouter';
import { Game } from '../game/game';
import { commonAbilityOption } from '../game/abilities';
import type { InputDeviceInfo, MenuAction } from '../game/input';
import {
  TEAM_INFO,
  TEAM_ORDER,
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
import { MatchCountdown } from '../ui/MatchCountdown';
import { MatchHud } from '../ui/MatchHud';
import { PokemonPortrait } from '../ui/PokemonPortrait';
import { eyebrow } from '../ui/styles';
import { VirtualMouseLayer } from '../ui/VirtualMouse';
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

/** Formatea el daño con separador de miles para el marcador final. */
function formatDamage(value: number): string {
  return Math.round(value).toLocaleString('es-ES');
}

interface PlayHandlers {
  onReady: () => void;
  onProgress: (progress: LoadingProgress) => void;
  onError: (message: string) => void;
  onDevicesChanged: (devices: InputDeviceInfo[]) => void;
  onMenuInput: (event: { deviceId: string; action: MenuAction }) => void;
  onPauseRequest: () => void;
  onMatchStats: (stats: PlayerMatchStats[]) => void;
  onMatchEnd: (result: MatchEndResult) => void;
  onCountdown: (remaining: number | null) => void;
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
  const [countdown, setCountdown] = useState<number | null>(null);

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
        if (gameRef.current?.startMatch(configsRef.current)) setPlaying(true);
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
      onMatchEnd: (result) => setMatchResult(result),
      onCountdown: (remaining) => setCountdown(remaining)
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
        },
        onCountdown: (remaining) => {
          if (!disposed) handlersRef.current?.onCountdown(remaining);
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

  // Si la ventana pierde el foco (alt-tab, minimizar o cambiar de pestaña)
  // durante la partida, se pausa para no dejar la simulación corriendo a
  // ciegas. Si ya está pausada o hay un modal abierto no se toca nada.
  useEffect(() => {
    if (!playing || paused || modal !== null || matchResult !== null) return;
    const pauseOnFocusLoss = () => setPaused(true);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pauseOnFocusLoss();
    };
    window.addEventListener('blur', pauseOnFocusLoss);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', pauseOnFocusLoss);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [playing, paused, modal, matchResult]);

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
    if (!gameRef.current?.startMatch(configsRef.current)) return;
    setMatchResult(null);
    setStats([]);
    setPaused(false);
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
              players={players.filter((player) => !player.isBot)}
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

      {!error && playing && countdown !== null && !paused && !matchResult && (
        <MatchCountdown remaining={countdown} />
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
          <div
            className={`${panel} max-h-[92vh] w-[min(900px,100%)] animate-rise-in overflow-y-auto p-[clamp(20px,3vw,30px)]`}
          >
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

            <MatchScoreboard
              manifest={manifest}
              players={players}
              stats={stats}
              result={matchResult}
            />

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

      <VirtualMouseLayer
        enabled={!playing || paused || modal !== null || matchResult !== null}
      />
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
  stats,
  result
}: {
  manifest: SpriteManifest;
  players: LobbyPlayer[];
  stats: PlayerMatchStats[];
  result: MatchEndResult;
}) {
  const entriesById = new Map(
    manifest.pokemon.map((pokemon) => [pokemon.id, pokemon])
  );
  const scoreFor = (team: MatchEndResult['winner']) =>
    team === 'blue' ? result.blueScore : result.redScore;
  // Al terminar la partida los stats llegan en el mismo frame que el
  // resultado. Si por cualquier motivo aún no están, se muestra la plantilla
  // con cero KOs para no dejar el marcador vacío.
  type ScoreboardRow = Pick<
    PlayerMatchStats,
    | 'slot'
    | 'name'
    | 'team'
    | 'pokemonId'
    | 'kills'
    | 'deaths'
    | 'damageDealt'
    | 'damageTaken'
    | 'abilityHealing'
    | 'pickupHealing'
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
            kills: 0,
            deaths: 0,
            damageDealt: 0,
            damageTaken: 0,
            abilityHealing: 0,
            pickupHealing: 0,
            commonAbilityName: option?.name ?? null,
            commonAbilityDescription: option?.description ?? ''
          };
        });

  return (
    <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
      {TEAM_ORDER.map((team) => {
        const info = TEAM_INFO[team];
        const rows = rowsSource
          .filter((entry) => entry.team === team)
          .sort(
            (a, b) =>
              b.kills - a.kills || a.deaths - b.deaths || a.slot - b.slot
          );
        // Sumatorio del equipo: se calcula con las mismas filas que se pintan
        // para que los totales cuadren siempre con la lista de arriba.
        const totals = rows.reduce(
          (acc, row) => ({
            kills: acc.kills + row.kills,
            deaths: acc.deaths + row.deaths,
            damageDealt: acc.damageDealt + row.damageDealt,
            damageTaken: acc.damageTaken + row.damageTaken,
            abilityHealing: acc.abilityHealing + row.abilityHealing,
            pickupHealing: acc.pickupHealing + row.pickupHealing
          }),
          {
            kills: 0,
            deaths: 0,
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
                {scoreFor(team)}
              </span>
            </header>

            <ol className="divide-y divide-line/60">
              {rows.map((row) => {
                const entry = entriesById.get(row.pokemonId);
                return (
                  <li
                    key={row.slot}
                    className="flex items-center gap-2 px-2.5 py-1.75"
                  >
                    <span className="grid size-5 shrink-0 place-items-center rounded bg-(--team) font-display text-10.24 font-extrabold text-ink-dark-strong">
                      {row.slot}
                    </span>
                    <span className="grid size-8 shrink-0 place-items-center">
                      {entry ? (
                        <PokemonPortrait entry={entry} height={30} />
                      ) : (
                        <span className="text-11.2 text-steel-600">—</span>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-[1.08]">
                      <strong className="truncate font-mono text-9.6 tracking-[0.06em] uppercase">
                        {row.name}
                      </strong>
                      <span className="truncate text-10.24 text-steel-400">
                        {entry?.name ?? row.pokemonId}
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
                    <span className="flex shrink-0 items-baseline gap-2 font-mono tabular-nums">
                      <span className="flex flex-col items-end leading-none">
                        <strong className="text-13.6 text-steel-150">
                          {row.kills}
                        </strong>
                        <span className="text-7.36 tracking-[0.08em] text-steel-500 uppercase">
                          KO
                        </span>
                      </span>
                      <span className="flex flex-col items-end leading-none">
                        <strong className="text-13.6 text-steel-300">
                          {row.deaths}
                        </strong>
                        <span className="text-7.36 tracking-[0.08em] text-steel-500 uppercase">
                          Muertes
                        </span>
                      </span>
                      <span
                        className="flex flex-col items-end leading-none"
                        title="Daño hecho a rivales"
                      >
                        <strong className="text-13.6 text-accent-soft">
                          {formatDamage(row.damageDealt)}
                        </strong>
                        <span className="text-7.36 tracking-[0.08em] text-steel-500 uppercase">
                          Daño
                        </span>
                      </span>
                      <span
                        className="flex flex-col items-end leading-none"
                        title="Daño recibido de rivales y autodaño"
                      >
                        <strong className="text-13.6 text-danger-100">
                          {formatDamage(row.damageTaken)}
                        </strong>
                        <span className="text-7.36 tracking-[0.08em] text-steel-500 uppercase">
                          Recibido
                        </span>
                      </span>
                      <span
                        className="flex flex-col items-end leading-none"
                        title="PV curados con habilidades propias y Regeneración"
                      >
                        <strong className="text-13.6 text-success">
                          {formatDamage(row.abilityHealing)}
                        </strong>
                        <span className="text-7.36 tracking-[0.08em] text-steel-500 uppercase">
                          Cur. hab.
                        </span>
                      </span>
                      <span
                        className="flex flex-col items-end leading-none"
                        title="PV curados con objetos recogibles"
                      >
                        <strong className="text-13.6 text-success">
                          {formatDamage(row.pickupHealing)}
                        </strong>
                        <span className="text-7.36 tracking-[0.08em] text-steel-500 uppercase">
                          Cur. obj.
                        </span>
                      </span>
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
                <span className="flex shrink-0 items-baseline gap-2 font-mono tabular-nums">
                  <span className="flex flex-col items-end leading-none">
                    <strong className="text-13.6 text-(--team)">
                      {totals.kills}
                    </strong>
                    <span className="text-7.36 tracking-[0.08em] text-steel-500 uppercase">
                      KO
                    </span>
                  </span>
                  <span className="flex flex-col items-end leading-none">
                    <strong className="text-13.6 text-steel-300">
                      {totals.deaths}
                    </strong>
                    <span className="text-7.36 tracking-[0.08em] text-steel-500 uppercase">
                      Muertes
                    </span>
                  </span>
                  <span
                    className="flex flex-col items-end leading-none"
                    title="Daño hecho a rivales"
                  >
                    <strong className="text-13.6 text-accent-soft">
                      {formatDamage(totals.damageDealt)}
                    </strong>
                    <span className="text-7.36 tracking-[0.08em] text-steel-500 uppercase">
                      Daño
                    </span>
                  </span>
                  <span
                    className="flex flex-col items-end leading-none"
                    title="Daño recibido de rivales y autodaño"
                  >
                    <strong className="text-13.6 text-danger-100">
                      {formatDamage(totals.damageTaken)}
                    </strong>
                    <span className="text-7.36 tracking-[0.08em] text-steel-500 uppercase">
                      Recibido
                    </span>
                  </span>
                  <span
                    className="flex flex-col items-end leading-none"
                    title="PV curados con habilidades propias y Regeneración"
                  >
                    <strong className="text-13.6 text-success">
                      {formatDamage(totals.abilityHealing)}
                    </strong>
                    <span className="text-7.36 tracking-[0.08em] text-steel-500 uppercase">
                      Cur. hab.
                    </span>
                  </span>
                  <span
                    className="flex flex-col items-end leading-none"
                    title="PV curados con objetos recogibles"
                  >
                    <strong className="text-13.6 text-success">
                      {formatDamage(totals.pickupHealing)}
                    </strong>
                    <span className="text-7.36 tracking-[0.08em] text-steel-500 uppercase">
                      Cur. obj.
                    </span>
                  </span>
                </span>
              </footer>
            )}
          </section>
        );
      })}
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
