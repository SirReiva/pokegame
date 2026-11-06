import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { TEAM_INFO, TEAM_ORDER, type LobbyPlayer } from '../game/multiplayer';
import { skinFor } from '../game/skins';
import type { Team } from '../game/terrain';
import type { PokemonEntry, SpriteManifest } from '../game/types';
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

const sideLabel =
  'font-mono text-[clamp(8px,1.1vh,11px)] tracking-[0.24em] uppercase';
const vsWord =
  'font-display text-[clamp(3.6rem,10vw,8rem)] leading-[0.72] font-black tracking-[-0.09em] italic';

interface VersusScreenProps {
  manifest: SpriteManifest;
  players: LobbyPlayer[];
  /** Se llama cuando termina la entrada; entonces arranca la carga real. */
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
 * Cartel de versus previo a la carga de la partida. Mezcla las filas de
 * retratos tipo KOF con el corte diagonal neón rojo/azul del VS clásico.
 * La duración se calcula con las animaciones de las filas y del emblema para
 * que `onDone` se dispare justo cuando acaba la última.
 */
export function VersusScreen({ manifest, players, onDone }: VersusScreenProps) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const finishedRef = useRef(false);
  const [exiting, setExiting] = useState(false);
  const reduced = prefersReducedMotion();

  const rosterFor = (team: Team): TeamRoster => ({
    team,
    players: players
      .filter((player) => player.team === team)
      .sort((a, b) => a.slot - b.slot)
  });
  const leftRoster = rosterFor(TEAM_ORDER[0]);
  const rightRoster = rosterFor(TEAM_ORDER[1]);
  const maxRows = Math.max(
    1,
    leftRoster.players.length,
    rightRoster.players.length
  );
  const rowsEnd = (maxRows - 1) * ROW_DELAY_MS + ROW_DURATION_MS;
  const fullDuration =
    Math.max(rowsEnd, VS_DELAY_MS + VS_DURATION_MS) + HOLD_MS + FADE_MS;
  const duration = reduced ? REDUCED_DURATION_MS : fullDuration;
  const fadeDuration = reduced ? 0 : FADE_MS;

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onDoneRef.current();
  }, []);

  useEffect(() => {
    if (reduced) {
      const timeout = window.setTimeout(finish, duration);
      return () => window.clearTimeout(timeout);
    }

    const fadeTimeout = window.setTimeout(
      () => setExiting(true),
      Math.max(0, duration - fadeDuration)
    );
    const doneTimeout = window.setTimeout(finish, duration);
    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(doneTimeout);
    };
  }, [duration, fadeDuration, finish, reduced]);

  // Enter, Espacio o Escape saltan la intro; luego la partida ya captura sus
  // propias teclas y este componente se desmonta.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finish]);

  const entryFor = (pokemonId: string): PokemonEntry | null =>
    manifest.pokemon.find((entry) => entry.id === pokemonId) ?? null;

  return (
    <div
      className={`fixed inset-0 z-60 flex select-none flex-col overflow-hidden bg-night-950 transition-opacity ${
        exiting ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      style={
        {
          transitionDuration: `${fadeDuration}ms`
        } as CSSProperties
      }
      role="region"
      aria-label="Presentación del combate"
    >
      {/* Mitades cromáticas del cartel. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[54%] animate-versus-side-left bg-[radial-gradient(circle_at_30%_38%,rgb(35_111_214/0.72),rgb(4_14_32/0.97)_66%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-[54%] animate-versus-side-right bg-[radial-gradient(circle_at_70%_38%,rgb(228_48_60/0.74),rgb(30_4_12/0.97)_66%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_12%,rgb(2_5_10/0.72)_78%),linear-gradient(180deg,rgb(2_5_10/0.7),transparent_22%,transparent_78%,rgb(2_5_10/0.8))]"
      />

      {/* Marcos de neón, uno por equipo, como en el cartel de VS. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[12%] bottom-[7%] left-[2.5%] w-[44%] animate-versus-frame rounded-[10px] border-2 border-team-blue/75 shadow-[0_0_26px_rgb(75_156_255/0.55),inset_0_0_36px_rgb(75_156_255/0.18)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[12%] right-[2.5%] bottom-[7%] w-[44%] animate-versus-frame rounded-[10px] border-2 border-team-red/75 shadow-[0_0_26px_rgb(255_95_99/0.55),inset_0_0_36px_rgb(255_95_99/0.18)]"
        style={{ animationDelay: '90ms' }}
      />

      {/* Rayo central que separa los dos bandos. */}
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
              <stop offset="0%" stopColor="var(--color-team-blue)" />
              <stop offset="45%" stopColor="var(--color-steel-50)" />
              <stop offset="55%" stopColor="var(--color-ink)" />
              <stop offset="100%" stopColor="var(--color-team-red)" />
            </linearGradient>
          </defs>
          <path
            d="M53 0 L46 17 L57 28 L44 45 L56 58 L45 76 L51 100 L59 82 L49 68 L62 51 L49 36 L59 20 L55 0 Z"
            fill="url(#versus-seam)"
          />
        </svg>
      </div>

      {/* Tramado sutil para que el fondo no se vea plano. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay bg-[repeating-linear-gradient(0deg,rgb(255_255_255/0.45)_0_1px,transparent_1px_4px)]"
      />

      <header className="relative z-20 flex shrink-0 flex-wrap items-end justify-between gap-3 px-[clamp(14px,3vw,40px)] pt-[clamp(10px,2.2vh,24px)]">
        <div className="animate-versus-header">
          <span className={`${sideLabel} text-white/45`}>Combate de equipos</span>
          <h1 className="mt-1 font-display text-[clamp(1.3rem,2.6vw,2.1rem)] leading-none font-black tracking-[0.08em] uppercase">
            <span className="text-team-blue">Azul</span>
            <span className="mx-2 text-white/35">contra</span>
            <span className="text-team-red">Rojo</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className={`${sideLabel} hidden text-white/40 sm:block`}>
            {players.length} {players.length === 1 ? 'luchador' : 'luchadores'}
          </span>
          <button
            type="button"
            onClick={finish}
            className="cursor-pointer rounded-md border border-white/20 bg-black/25 px-2.5 py-1.5 font-mono text-10.08 tracking-[0.16em] uppercase text-white/70 backdrop-blur-sm transition-colors hover:border-white/40 hover:bg-black/45 hover:text-white"
          >
            Saltar intro ▸
          </button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 items-stretch gap-[clamp(4px,1.6vw,26px)] px-[clamp(10px,2.2vw,34px)]">
        <TeamPanel
          roster={leftRoster}
          side="left"
          entryFor={entryFor}
          reduced={reduced}
        />
        <VersusCore reduced={reduced} />
        <TeamPanel
          roster={rightRoster}
          side="right"
          entryFor={entryFor}
          reduced={reduced}
        />
      </div>

      <footer className="relative z-20 flex shrink-0 items-center gap-3 px-[clamp(14px,3vw,40px)] pt-2 pb-[clamp(10px,2.2vh,22px)]">
        <span className={`${sideLabel} shrink-0 text-white/40`}>
          Preparando el combate
        </span>
        <div className="h-1 min-w-16 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full origin-left animate-versus-progress rounded-full bg-[linear-gradient(90deg,var(--color-team-blue),#ffffff,var(--color-team-red))] shadow-[0_0_12px_rgb(255_255_255/0.45)]"
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
        <span className={`${sideLabel} hidden shrink-0 text-white/30 sm:block`}>
          Cargando assets
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
function VersusCore({ reduced }: { reduced: boolean }) {
  return (
    <div className="relative flex w-[clamp(58px,8vw,118px)] shrink-0 items-center justify-center">
      <div className="absolute inset-y-[3%] left-1/2 w-[78%] -translate-x-1/2">
        <div className="relative flex h-full animate-versus-band flex-col items-center justify-between overflow-hidden rounded-md border-2 border-vs-gold/80 bg-[linear-gradient(180deg,#1a3475,#091433_48%,#1a3475)] px-1 py-[9%] shadow-[0_0_28px_rgb(75_156_255/0.4)]">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-25 bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.5)_0_1px,transparent_1px_9px)]"
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
            className={`${vsWord} absolute inset-0 translate-x-[0.05em] text-team-red opacity-80 blur-[1px]`}
          >
            VS
          </span>
          <span
            aria-hidden="true"
            className={`${vsWord} absolute inset-0 translate-x-[-0.05em] text-team-blue opacity-80 blur-[1px]`}
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
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--team)_55%,transparent),transparent_70%)] blur-[6px]"
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
