import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { TEAM_INFO, type LobbyPlayer } from '../game/multiplayer';
import { skinFor } from '../game/skins';
import type { Team } from '../game/terrain';
import type { LoadingProgress, PokemonEntry, SpriteManifest } from '../game/types';
import { PokemonPortrait } from './PokemonPortrait';

/** Cadencia de la entrada de cada fila y duración de la animación. */
const ROW_DELAY_MS = 130;
const ROW_DURATION_MS = 640;
/** El emblema VS entra después de las filas y se queda un momento en pantalla. */
const VS_DELAY_MS = 360;
const VS_DURATION_MS = 660;
const HOLD_MS = 1250;
const FADE_MS = 360;
/** Con movimiento reducido solo se muestra un fundido breve. */
const REDUCED_DURATION_MS = 320;

/** Chispas de ambiente que suben por el cartel mientras se carga. */
const SPARKS = [
  { x: 7, y: 68, size: 4, drift: 16, delay: 0 },
  { x: 16, y: 82, size: 3, drift: -14, delay: 1400 },
  { x: 24, y: 55, size: 5, drift: 22, delay: 2600 },
  { x: 33, y: 76, size: 3, drift: -18, delay: 700 },
  { x: 41, y: 44, size: 4, drift: 12, delay: 3300 },
  { x: 58, y: 58, size: 4, drift: -16, delay: 1900 },
  { x: 66, y: 79, size: 3, drift: 20, delay: 400 },
  { x: 74, y: 47, size: 5, drift: -22, delay: 3000 },
  { x: 83, y: 72, size: 3, drift: 14, delay: 1100 },
  { x: 92, y: 62, size: 4, drift: -12, delay: 2300 }
];

/** Chispas de roce que saltan del borde interior al aterrizar cada fila. */
const SCRAPE = [
  { top: 16, size: 3, dx: 26, dy: -18, delay: 0 },
  { top: 34, size: 2, dx: 34, dy: -8, delay: 60 },
  { top: 52, size: 4, dx: 20, dy: -26, delay: 30 },
  { top: 68, size: 2, dx: 30, dy: -12, delay: 90 },
  { top: 84, size: 3, dx: 16, dy: -22, delay: 120 },
  { top: 26, size: 2, dx: -14, dy: -20, delay: 50 },
  { top: 74, size: 2, dx: -20, dy: -10, delay: 100 }
];

const sideLabel =
  'font-mono text-[clamp(8px,1.1vh,11px)] tracking-[0.24em] uppercase';
const vsWord =
  'font-display text-[clamp(3.6rem,10vw,8rem)] leading-[0.72] font-black tracking-[-0.09em] italic';

interface VersusScreenProps {
  manifest: SpriteManifest;
  players: LobbyPlayer[];
  /** Equipos activos del mapa. */
  teams: Team[];
  /** Progreso real de la carga de assets que se pinta en el pie. */
  progress?: LoadingProgress | null;
  /** `true` cuando el motor ya tiene todo lo necesario para empezar. */
  ready?: boolean;
  /** Se llama cuando termina la animación de entrada. */
  onEntranceEnd?: () => void;
  /** Se llama cuando el cartel termina de desvanecerse. */
  onDone: () => void;
}

interface TeamRoster {
  team: Team;
  players: LobbyPlayer[];
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Cartel de versus de la partida. Mezcla las filas de retratos tipo KOF con el
 * corte diagonal neón rojo/azul del VS clásico. Además de la intro, es la
 * pantalla de carga real: el pie muestra el progreso de los assets y el cartel
 * no se desvanece hasta que el motor está listo.
 */
export function VersusScreen({
  manifest,
  players,
  teams,
  progress = null,
  ready = true,
  onEntranceEnd,
  onDone
}: VersusScreenProps) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  const onEntranceEndRef = useRef(onEntranceEnd);
  useEffect(() => {
    onEntranceEndRef.current = onEntranceEnd;
  }, [onEntranceEnd]);

  const finishedRef = useRef(false);
  const [exiting, setExiting] = useState(false);
  const [entranceDone, setEntranceDone] = useState(false);
  const reduced = prefersReducedMotion();

  const rosterFor = (team: Team): TeamRoster => ({
    team,
    players: players
      .filter((player) => player.team === team)
      .sort((a, b) => a.slot - b.slot)
  });
  const rosters = teams.map(rosterFor);
  const twoTeams = rosters.length === 2;
  const splitAt = Math.ceil(rosters.length / 2);
  const leftRosters = rosters.slice(0, splitAt);
  const rightRosters = rosters.slice(splitAt);
  const maxRows = Math.max(1, ...rosters.map((roster) => roster.players.length));
  const rowsEnd = (maxRows - 1) * ROW_DELAY_MS + ROW_DURATION_MS;
  const fullDuration =
    Math.max(rowsEnd, VS_DELAY_MS + VS_DURATION_MS) + HOLD_MS + FADE_MS;
  const duration = reduced ? REDUCED_DURATION_MS : fullDuration;
  const fadeDuration = reduced ? 0 : FADE_MS;
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
      : null;

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onDoneRef.current();
  }, []);

  // La entrada termina por sí sola, pero el fundido y `onDone` esperan a que
  // el motor haya cargado los assets: así el versus sustituye a la pantalla
  // de carga en lugar de dar paso a otra.
  useEffect(() => {
    const timeout = window.setTimeout(
      () => setEntranceDone(true),
      Math.max(0, duration - fadeDuration)
    );
    return () => window.clearTimeout(timeout);
  }, [duration, fadeDuration]);

  // Avisa una sola vez de que la animación de entrada terminó: entonces ya
  // se puede empezar a montar PlayCanvas sin tapar la intro.
  useEffect(() => {
    if (entranceDone) onEntranceEndRef.current?.();
  }, [entranceDone]);

  useEffect(() => {
    if (!entranceDone || !ready) return;
    const fadeTimeout = window.setTimeout(() => setExiting(true), 0);
    const doneTimeout = window.setTimeout(finish, fadeDuration);
    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(doneTimeout);
    };
  }, [entranceDone, ready, fadeDuration, finish]);

  // Enter, Espacio o Escape saltan la intro; si los assets aún no están
  // listos, el cartel se queda mostrando el progreso hasta que lo estén.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setEntranceDone(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const entryFor = (pokemonId: string): PokemonEntry | null =>
    manifest.pokemon.find((entry) => entry.id === pokemonId) ?? null;

  const leftTeam = rosters[0]?.team;
  const rightTeam = rosters[rosters.length - 1]?.team;
  const leftColor = leftTeam ? TEAM_INFO[leftTeam].color : '#4b9cff';
  const rightColor = rightTeam ? TEAM_INFO[rightTeam].color : '#ff5f63';
  const progressGradient = `linear-gradient(90deg,${teams
    .map((team) => TEAM_INFO[team].color)
    .join(',')})`;

  return (
    <div
      className={`fixed inset-0 z-60 flex select-none flex-col overflow-hidden bg-night-950 transition-opacity ${
        reduced ? '' : 'animate-versus-quake'
      } ${exiting ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      style={
        {
          animationDelay: `${reduced ? 0 : VS_DELAY_MS + VS_DURATION_MS * 0.55}ms`,
          transitionDuration: `${fadeDuration}ms`
        } as CSSProperties
      }
      role="region"
      aria-label="Presentación del combate"
    >
      {/* Mitades cromáticas del cartel. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[54%] animate-versus-side-left"
        style={{
          background: `radial-gradient(circle at 30% 38%, ${leftColor}b8, rgb(4 14 32 / 0.97) 66%)`
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-[54%] animate-versus-side-right"
        style={{
          background: `radial-gradient(circle at 70% 38%, ${rightColor}bc, rgb(30 4 12 / 0.97) 66%)`
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_12%,rgb(2_5_10/0.72)_78%),linear-gradient(180deg,rgb(2_5_10/0.7),transparent_22%,transparent_78%,rgb(2_5_10/0.8))]"
      />

      {/* Aura que respira sobre cada mitad, como un cartel de neón vivo. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[54%] animate-versus-aura mix-blend-screen"
        style={{
          background: `radial-gradient(circle at 30% 38%, ${leftColor}5c, transparent 64%)`
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-[54%] animate-versus-aura mix-blend-screen"
        style={{
          animationDelay: '1.4s',
          background: `radial-gradient(circle at 70% 38%, ${rightColor}5c, transparent 64%)`
        }}
      />

      {/* Flash de color de cada bando justo antes del golpe del VS. */}
      {twoTeams && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-[54%] animate-versus-impact mix-blend-screen"
            style={{
              animationDelay: `${reduced ? 0 : VS_DELAY_MS + VS_DURATION_MS * 0.42}ms`,
              background: `radial-gradient(circle at 30% 50%, ${leftColor}d9, transparent 70%)`
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-[54%] animate-versus-impact mix-blend-screen"
            style={{
              animationDelay: `${reduced ? 0 : VS_DELAY_MS + VS_DURATION_MS * 0.42}ms`,
              background: `radial-gradient(circle at 70% 50%, ${rightColor}d9, transparent 70%)`
            }}
          />
        </>
      )}

      {/* Rayado diagonal en movimiento, uno por bando. */}
      {twoTeams && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-[54%] overflow-hidden opacity-40"
          >
            <div className="absolute inset-[-30%] -rotate-24">
              <div className="size-full animate-versus-drift bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.16)_0_2px,transparent_2px_18px)]" />
            </div>
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-[54%] overflow-hidden opacity-40"
          >
            <div className="absolute inset-[-30%] rotate-24">
              <div className="size-full animate-versus-drift bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.16)_0_2px,transparent_2px_18px)] [animation-direction:reverse]" />
            </div>
          </div>
        </>
      )}

      {/* Chispas de energía que suben por el cartel. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {SPARKS.map((spark) => {
          const color = spark.x < 50 ? leftColor : rightColor;
          return (
            <span
              key={`${spark.x}-${spark.y}`}
              className="absolute animate-versus-spark rounded-full"
              style={
                {
                  left: `${spark.x}%`,
                  top: `${spark.y}%`,
                  width: spark.size,
                  height: spark.size,
                  background: color,
                  boxShadow: `0 0 10px ${color}`,
                  animationDelay: `${spark.delay}ms`,
                  '--spark-drift': `${spark.drift}px`
                } as CSSProperties
              }
            />
          );
        })}
      </div>

      {/* Marcos de neón, uno por equipo, como en el cartel de VS. */}
      {twoTeams && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[12%] bottom-[7%] left-[2.5%] w-[44%] animate-versus-frame rounded-[10px] border-2"
            style={{
              borderColor: `${leftColor}bf`,
              boxShadow: `0 0 26px ${leftColor}8c, inset 0 0 36px ${leftColor}2e`
            }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-versus-frame-pulse rounded-[10px] border-2"
              style={{
                borderColor: leftColor,
                boxShadow: `inset 0 0 22px ${leftColor}5c`
              }}
            />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[12%] right-[2.5%] bottom-[7%] w-[44%] animate-versus-frame rounded-[10px] border-2"
            style={{
              animationDelay: '90ms',
              borderColor: `${rightColor}bf`,
              boxShadow: `0 0 26px ${rightColor}8c, inset 0 0 36px ${rightColor}2e`
            }}
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 animate-versus-frame-pulse rounded-[10px] border-2"
              style={{
                animationDelay: '1.2s',
                borderColor: rightColor,
                boxShadow: `inset 0 0 22px ${rightColor}5c`
              }}
            />
          </div>
        </>
      )}

      {/* Rayo central que separa los dos bandos. */}
      {twoTeams && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-1/2 w-[clamp(120px,14vw,240px)] -translate-x-1/2"
          >
            <div className="size-full animate-versus-seam-pulse bg-[radial-gradient(ellipse_at_center,rgb(255_255_255/0.4),transparent_70%)] blur-2xl" />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-1/2 w-[clamp(70px,9vw,150px)] -translate-x-1/2"
          >
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="size-full animate-versus-seam drop-shadow-[0_0_18px_rgb(255_255_255/0.6)]"
            >
              <defs>
                <linearGradient id="versus-seam" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={leftColor} />
                  <stop offset="45%" stopColor="var(--color-steel-50)" />
                  <stop offset="55%" stopColor="var(--color-ink)" />
                  <stop offset="100%" stopColor={rightColor} />
                </linearGradient>
              </defs>
              <path
                d="M53 0 L46 17 L57 28 L44 45 L56 58 L45 76 L51 100 L59 82 L49 68 L62 51 L49 36 L59 20 L55 0 Z"
                fill="url(#versus-seam)"
              />
            </svg>
          </div>
        </>
      )}

      {/* Destello horizontal en el momento del impacto del VS. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[calc(50%-1px)] z-10 h-0.5 animate-versus-streak bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.9),transparent)] shadow-[0_0_26px_rgb(255_255_255/0.9)]"
        style={{
          animationDelay: `${reduced ? 0 : VS_DELAY_MS + VS_DURATION_MS * 0.55}ms`
        }}
      />

      {/* Ondas de energía que salen del centro hacia cada bando. */}
      {twoTeams && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[calc(50%-1px)] left-1/2 h-0.5 w-[44vw] origin-left animate-versus-wave bg-[linear-gradient(90deg,rgb(255_255_255/0.75),transparent)]"
            style={{
              animationDelay: `${reduced ? 0 : VS_DELAY_MS + 140}ms`
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[calc(50%-1px)] right-1/2 h-0.5 w-[44vw] origin-right animate-versus-wave bg-[linear-gradient(270deg,rgb(255_255_255/0.75),transparent)]"
            style={{
              animationDelay: `${reduced ? 0 : VS_DELAY_MS + 140}ms`
            }}
          />
        </>
      )}

      {/* Chispazos eléctricos que recorren la costura central. */}
      {twoTeams && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[31%] left-1/2 h-px w-[clamp(38px,6vw,110px)] -translate-x-1/2 animate-versus-flicker bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.85),transparent)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[67%] left-1/2 h-px w-[clamp(30px,5vw,90px)] -translate-x-1/2 animate-versus-flicker bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.8),transparent)]"
            style={{ animationDelay: '2.2s' }}
          />
        </>
      )}

      {/* Tramado sutil para que el fondo no se vea plano. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay bg-[repeating-linear-gradient(0deg,rgb(255_255_255/0.45)_0_1px,transparent_1px_4px)]"
      />

      {/* Barrido de luz descendente, como un monitor CRT encendido. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-[26%] animate-versus-scan bg-[linear-gradient(180deg,transparent,rgb(255_255_255/0.07)_45%,rgb(255_255_255/0.16)_50%,rgb(255_255_255/0.07)_55%,transparent)]" />
      </div>

      <header className="relative z-20 flex shrink-0 flex-wrap items-end justify-between gap-3 px-[clamp(14px,3vw,40px)] pt-[clamp(10px,2.2vh,24px)]">
        <div className="animate-versus-header">
          <span className={`${sideLabel} text-white/45`}>Combate de equipos</span>
          <h1 className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0 font-display text-[clamp(1.1rem,2.4vw,1.9rem)] leading-none font-black tracking-[0.08em] uppercase">
            {teams.map((team, index) => (
              <span key={team} className="flex items-center gap-2">
                {index > 0 && <span className="text-white/30">·</span>}
                <span style={{ color: TEAM_INFO[team].color }}>{TEAM_INFO[team].short}</span>
              </span>
            ))}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className={`${sideLabel} hidden text-white/40 sm:block`}>
            {players.length} {players.length === 1 ? 'luchador' : 'luchadores'}
          </span>
          <button
            type="button"
            onClick={() => setEntranceDone(true)}
            disabled={entranceDone && !ready}
            className={`rounded-md border border-white/20 bg-black/25 px-2.5 py-1.5 font-mono text-10.08 tracking-[0.16em] uppercase text-white/70 backdrop-blur-sm transition-colors ${
              entranceDone && !ready
                ? 'cursor-default opacity-50'
                : 'cursor-pointer hover:border-white/40 hover:bg-black/45 hover:text-white'
            }`}
          >
            {entranceDone && !ready ? 'Cargando…' : 'Saltar intro ▸'}
          </button>
        </div>
      </header>

      <div
        className={`relative z-10 flex min-h-0 flex-1 items-stretch gap-[clamp(4px,1.6vw,26px)] px-[clamp(10px,2.2vw,34px)] ${
          twoTeams ? '' : 'overflow-hidden'
        }`}
      >
        {twoTeams ? (
          <>
            <TeamPanel
              roster={rosters[0]}
              side="left"
              entryFor={entryFor}
              reduced={reduced}
            />
            <VersusCore
              reduced={reduced}
              leftColor={leftColor}
              rightColor={rightColor}
            />
            <TeamPanel
              roster={rosters[1]}
              side="right"
              entryFor={entryFor}
              reduced={reduced}
            />
          </>
        ) : (
          <div className="grid min-h-0 w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] grid-rows-2 gap-x-[clamp(4px,1.2vw,20px)] gap-y-[clamp(4px,1.2vh,14px)]">
            {leftRosters.map((roster, index) => (
              <div
                key={roster.team}
                className={`col-start-1 flex min-h-0 min-w-0 ${
                  leftRosters.length === 1
                    ? 'row-span-2 row-start-1'
                    : index === 0
                      ? 'row-start-1'
                      : 'row-start-2'
                }`}
              >
                <TeamPanel
                  roster={roster}
                  side="left"
                  entryFor={entryFor}
                  reduced={reduced}
                />
              </div>
            ))}

            <div className="col-start-2 row-span-2 row-start-1 flex min-h-0 items-stretch">
              <VersusCore
                reduced={reduced}
                leftColor={leftColor}
                rightColor={rightColor}
              />
            </div>

            {rightRosters.map((roster, index) => (
              <div
                key={roster.team}
                className={`col-start-3 flex min-h-0 min-w-0 ${
                  rightRosters.length === 1
                    ? 'row-span-2 row-start-1'
                    : index === 0
                      ? 'row-start-1'
                      : 'row-start-2'
                }`}
              >
                <TeamPanel
                  roster={roster}
                  side="right"
                  entryFor={entryFor}
                  reduced={reduced}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="relative z-20 flex shrink-0 items-center gap-3 px-[clamp(14px,3vw,40px)] pt-2 pb-[clamp(10px,2.2vh,22px)]">
        <span className={`${sideLabel} min-w-0 max-w-[45%] truncate text-white/40`}>
          {progress?.label ?? 'Preparando el combate'}
        </span>
        <div className="h-1 min-w-16 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className={`relative h-full origin-left overflow-hidden rounded-full shadow-[0_0_12px_rgb(255_255_255/0.45)] ${
              percent === null
                ? 'animate-versus-progress'
                : 'transition-[width] duration-300 ease-out'
            }`}
            style={{
              backgroundImage: progressGradient,
              ...(percent === null
                ? { animationDuration: `${duration}ms` }
                : { width: `${percent}%` })
            }}
          >
            <div
              aria-hidden="true"
              className="h-full w-1/3 animate-versus-bar-shimmer bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.55),transparent)]"
            />
            <span
              aria-hidden="true"
              className="absolute inset-y-0 right-0 w-1 animate-versus-tip rounded-full bg-white shadow-[0_0_12px_rgb(255_255_255/0.8)]"
            />
          </div>
        </div>
        <span className={`${sideLabel} hidden shrink-0 text-white/30 sm:block`}>
          {percent === null ? 'Cargando assets' : `${percent}%`}
        </span>
      </footer>
    </div>
  );
}

interface TeamPanelProps {
  roster: TeamRoster;
  side: 'left' | 'right';
  entryFor: (pokemonId: string) => PokemonEntry | null;
  reduced: boolean;
}

function TeamPanel({ roster, side, entryFor, reduced }: TeamPanelProps) {
  const info = TEAM_INFO[roster.team];
  const left = side === 'left';

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col justify-center"
      style={{ '--team': info.color } as CSSProperties}
      aria-label={info.label}
    >
      <header
        className={`mb-[clamp(4px,1vh,10px)] flex shrink-0 items-center gap-2 ${
          left ? 'justify-start' : 'justify-end'
        }`}
      >
        {left && <TeamDot />}
        <strong className="font-display text-[clamp(0.72rem,1.5vw,1.05rem)] leading-none font-black tracking-[0.14em] uppercase text-(--team)">
          {info.label}
        </strong>
        <span className="font-mono text-[clamp(8px,1vh,10px)] text-white/45">
          {roster.players.length}
        </span>
        {!left && <TeamDot />}
      </header>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-[clamp(4px,0.9vh,12px)]">
        {roster.players.map((player, index) => (
          <VersusRow
            key={player.slot}
            player={player}
            playerIndex={index}
            side={side}
            entry={entryFor(player.pokemonId)}
            reduced={reduced}
          />
        ))}

        {roster.players.length === 0 && (
          <div
            className={`flex min-h-[clamp(70px,12vh,120px)] items-center rounded-md border border-dashed border-white/15 bg-black/20 px-4 ${
              left ? 'justify-start' : 'justify-end'
            }`}
          >
            <span className="font-mono text-10.08 tracking-[0.18em] uppercase text-white/35">
              Sin retadores
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function TeamDot() {
  return (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full bg-(--team) shadow-[0_0_10px_var(--team)]"
    />
  );
}

/** Banda vertical "VERSUS" con el emblema VS montado encima. */
function VersusCore({
  reduced,
  leftColor,
  rightColor
}: {
  reduced: boolean;
  leftColor: string;
  rightColor: string;
}) {
  return (
    <div className="relative flex w-[clamp(58px,8vw,118px)] shrink-0 items-center justify-center">
      {/* Rayos de luz girando detrás del emblema. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 grid animate-versus-rays place-items-center opacity-40 mask-[radial-gradient(circle,black_8%,transparent_68%)]"
      >
        <div
          className="size-[clamp(260px,34vw,460px)] rounded-full"
          style={{
            backgroundImage: `conic-gradient(from 0deg, transparent 0deg, ${leftColor}88 8deg, transparent 22deg, transparent 160deg, ${rightColor}88 168deg, transparent 182deg, transparent 340deg, ${leftColor}55 348deg, transparent 360deg)`
          }}
        />
      </div>

      {/* Onda expansiva justo cuando el VS golpea el cartel. */}
      <div
        aria-hidden="true"
        className="absolute size-[clamp(120px,18vw,260px)] animate-versus-shock rounded-full border-2 border-white/80"
        style={{ animationDelay: `${reduced ? 0 : VS_DELAY_MS}ms` }}
      />

      <div className="absolute inset-y-[3%] left-1/2 w-[78%] -translate-x-1/2">
        <div className="relative flex h-full animate-versus-band flex-col items-center justify-between overflow-hidden rounded-md border-2 border-vs-gold/80 bg-[linear-gradient(180deg,#1a3475,#091433_48%,#1a3475)] px-1 py-[9%] shadow-[0_0_28px_rgb(75_156_255/0.4)]">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-25 bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.5)_0_1px,transparent_1px_9px)]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 animate-versus-band-glow bg-[radial-gradient(ellipse_at_center,rgb(255_210_74/0.35),transparent_72%)]"
          />
          <span
            aria-hidden="true"
            className="relative font-display text-[clamp(1rem,2.1vw,2rem)] leading-none font-black tracking-[0.32em] whitespace-nowrap text-vs-gold uppercase [text-shadow:0_1px_0_#7a4c00,0_0_12px_rgb(255_210_74/0.55)] [writing-mode:vertical-rl]"
          >
            VER
          </span>
          <span
            aria-hidden="true"
            className="relative font-display text-[clamp(1rem,2.1vw,2rem)] leading-none font-black tracking-[0.32em] whitespace-nowrap text-vs-gold uppercase [text-shadow:0_1px_0_#7a4c00,0_0_12px_rgb(255_210_74/0.55)] [writing-mode:vertical-rl]"
          >
            SUS
          </span>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="absolute size-[clamp(120px,18vw,260px)] animate-versus-flash rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.85),rgb(255_255_255/0)_68%)] blur-xl"
        style={{ animationDelay: `${reduced ? 0 : VS_DELAY_MS}ms` }}
      />

      <div
        className="relative z-20 animate-versus-slam"
        style={{ animationDelay: `${reduced ? 0 : VS_DELAY_MS}ms` }}
      >
        <div className="relative -rotate-6">
          <span
            aria-hidden="true"
            className={`${vsWord} absolute inset-0 animate-versus-pulse text-white blur-lg`}
          >
            VS
          </span>
          <span
            aria-hidden="true"
            className={`${vsWord} absolute inset-0 animate-versus-glitch text-team-red opacity-80 blur-[1px]`}
            style={{ '--glitch-x': '0.05em' } as CSSProperties}
          >
            VS
          </span>
          <span
            aria-hidden="true"
            className={`${vsWord} absolute inset-0 animate-versus-glitch text-team-blue opacity-80 blur-[1px]`}
            style={{ '--glitch-x': '-0.05em' } as CSSProperties}
          >
            VS
          </span>
          <span
            className={`${vsWord} relative text-white [text-shadow:0_0_22px_rgb(255_255_255/0.75),0_5px_0_#0b1a33,0_8px_18px_rgb(0_0_0/0.6)]`}
          >
            VS
          </span>
        </div>
      </div>
    </div>
  );
}

interface VersusRowProps {
  player: LobbyPlayer;
  playerIndex: number;
  side: 'left' | 'right';
  entry: PokemonEntry | null;
  reduced: boolean;
}

function VersusRow({ player, playerIndex, side, entry, reduced }: VersusRowProps) {
  const left = side === 'left';
  const info = TEAM_INFO[player.team];
  const skin = entry ? skinFor(entry, player.skinId) : null;
  const delay = reduced ? 0 : playerIndex * ROW_DELAY_MS;
  const sheenDelay = delay + ROW_DURATION_MS;
  const gradient = left
    ? 'bg-[linear-gradient(100deg,color-mix(in_srgb,var(--team)_62%,#06101c)_0%,color-mix(in_srgb,var(--team)_26%,#060b14)_52%,rgb(4_8_14/0.94)_100%)]'
    : 'bg-[linear-gradient(260deg,color-mix(in_srgb,var(--team)_62%,#06101c)_0%,color-mix(in_srgb,var(--team)_26%,#060b14)_52%,rgb(4_8_14/0.94)_100%)]';
  const clip = left
    ? '[clip-path:polygon(0_0,100%_0,calc(100%_-_20px)_100%,0_100%)]'
    : '[clip-path:polygon(0_0,100%_0,100%_100%,20px_100%)]';

  return (
    <article
      className={`relative isolate flex max-h-[clamp(96px,17vh,152px)] min-h-[clamp(66px,11vh,118px)] min-w-0 flex-1 items-center gap-[clamp(6px,1.3vw,18px)] overflow-hidden px-[clamp(8px,1.6vw,22px)] ${
        left
          ? 'animate-versus-row-left flex-row'
          : 'animate-versus-row-right flex-row-reverse'
      }`}
      style={
        {
          '--team': info.color,
          animationDelay: `${delay}ms`
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 ${gradient} ${clip}`}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 border-y border-white/12 mix-blend-screen"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-versus-sheen bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.3),transparent)]"
        style={{ animationDelay: `${sheenDelay}ms` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-versus-glint bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.22),transparent)]"
        style={{ animationDelay: `${sheenDelay + 900}ms` }}
      />

      {SCRAPE.map((spark) => (
        <span
          key={`${spark.top}-${spark.dx}`}
          aria-hidden="true"
          className={`pointer-events-none absolute animate-versus-scrape rounded-full ${
            left ? 'right-[4%]' : 'left-[4%]'
          }`}
          style={
            {
              top: `${spark.top}%`,
              width: spark.size,
              height: spark.size,
              background: info.color,
              boxShadow: `0 0 8px ${info.color}`,
              animationDelay: `${reduced ? 0 : delay + ROW_DURATION_MS * 0.62 + spark.delay}ms`,
              '--scrape-dx': `${left ? -Math.abs(spark.dx) : Math.abs(spark.dx)}px`,
              '--scrape-dy': `${spark.dy}px`
            } as CSSProperties
          }
        />
      ))}

      <span
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 font-display text-[clamp(1.8rem,5vh,4rem)] leading-none font-black text-white/8 ${
          left ? 'left-2' : 'right-2'
        }`}
      >
        {String(playerIndex + 1).padStart(2, '0')}
      </span>

      <div className="relative z-1 grid size-[clamp(50px,10vh,94px)] shrink-0 place-items-center">
        <span
          aria-hidden="true"
          className="absolute inset-[-16%] animate-versus-orbit rounded-full opacity-70 mask-[radial-gradient(circle,transparent_60%,black_62%,black_70%,transparent_72%)]"
          style={{
            animationDelay: `${delay}ms`,
            animationDirection: left ? 'normal' : 'reverse',
            backgroundImage: `conic-gradient(from 0deg, transparent 0deg, ${info.color} 34deg, transparent 68deg, transparent 168deg, transparent 212deg, ${info.color} 246deg, transparent 280deg)`
          }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-versus-avatar rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--team)_55%,transparent),transparent_70%)] blur-[6px]"
          style={{ animationDelay: `${delay}ms` }}
        />
        {entry ? (
          <PokemonPortrait
            entry={entry}
            skin={skin}
            fluid
            className="relative size-full drop-shadow-[0_8px_10px_rgb(0_0_0/0.55)]"
          />
        ) : (
          <span className="relative font-display text-2xl font-black text-white/40">
            {player.name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>

      <div
        className={`relative z-1 flex min-w-0 flex-1 flex-col ${
          left ? 'items-start text-left' : 'items-end text-right'
        }`}
      >
        <span className={`${sideLabel} text-white/55`}>
          P{player.slot} · {player.isBot ? 'Bot' : player.deviceLabel}
        </span>
        <strong className="w-full truncate font-display text-[clamp(1.15rem,3.6vw,3rem)] leading-[0.92] font-black tracking-[-0.045em] text-white uppercase italic drop-shadow-[0_2px_0_rgb(0_0_0/0.55),0_0_18px_rgb(255_255_255/0.22)]">
          {player.name}
        </strong>
        <span
          className={`flex max-w-full items-center gap-1.5 font-mono text-[clamp(8px,1.15vh,11px)] tracking-widest uppercase text-white/65 ${
            left ? 'flex-row' : 'flex-row-reverse'
          }`}
        >
          <span className="truncate">{entry?.name ?? 'Sin Pokémon'}</span>
          <span className="rounded-sm border border-white/25 bg-black/25 px-1 py-px text-9.6 text-(--team)">
            {info.short}
          </span>
        </span>
      </div>
    </article>
  );
}
