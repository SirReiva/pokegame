import type { CSSProperties } from 'react';
import { KO_TARGET } from '../game/combat';
import {
  TEAM_INFO,
  computeSplitLayout,
  splitRectToStyle,
  type LobbyPlayer,
  type PlayerMatchStats
} from '../game/multiplayer';
import type { SpriteManifest } from '../game/types';
import { CONCEALMENT_REASON_LABEL } from '../game/vision';
import { PokemonPortrait } from './PokemonPortrait';
import { TypeBadge } from './TypeBadge';

interface MatchHudProps {
  manifest: SpriteManifest;
  players: LobbyPlayer[];
  stats: PlayerMatchStats[];
  onPause: () => void;
}

const splitPause =
  'pointer-events-auto fixed top-14 left-1/2 z-[7] inline-flex -translate-x-1/2 animate-fade-in cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-strong bg-[#050a10]/80 px-[13px] py-[7px] text-[0.76rem] font-[650] text-ink backdrop-blur-[8px] transition-colors duration-[120ms] ease-out hover:bg-white/10';

/** Color del porcentaje de ocultación: verde si el tipo ayuda, rojo si delata. */
function concealmentClassFor(stats: PlayerMatchStats | undefined): string {
  if (!stats || stats.concealment <= 0) return '';
  if (stats.concealmentReason === 'hostile') return 'text-[#ffb2b5]';
  if (stats.concealmentReason === 'home' || stats.concealmentReason === 'comfortable') {
    return 'text-[#bff39d]';
  }
  return '';
}

/** Barra de vida de verde (100%) a amarillo y rojo (0%). */
function hpColorFor(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  return `hsl(${(clamped * 1.2).toFixed(1)} 78% 52%)`;
}

/**
 * Capa HTML del splitscreen. Los viewports 3D los dibuja PlayCanvas debajo;
 * aquí solo van los bordes de equipo y las etiquetas de cada jugador, alineadas
 * con el mismo reparto normalizado que usan las cámaras.
 */
export function MatchHud({ manifest, players, stats, onPause }: MatchHudProps) {
  const layout = computeSplitLayout(players.length);
  const statsBySlot = new Map(stats.map((entry) => [entry.slot, entry]));
  const scoreBlue = stats[0]?.blueScore ?? 0;
  const scoreRed = stats[0]?.redScore ?? 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-[6]" aria-hidden="false">
      <div className="fixed top-2.5 left-1/2 z-[8] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line-strong bg-[#050a10]/85 px-4 py-1.5 shadow-[0_10px_30px_rgb(0_0_0/0.35)] backdrop-blur-[8px]">
        <span
          className="font-display text-[0.92rem] font-extrabold tabular-nums"
          style={{ color: TEAM_INFO.blue.color }}
        >
          {scoreBlue}
        </span>
        <span className="font-mono text-[0.58rem] tracking-[0.12em] text-[#7f92a7] uppercase">
          a {KO_TARGET}
        </span>
        <span
          className="font-display text-[0.92rem] font-extrabold tabular-nums"
          style={{ color: TEAM_INFO.red.color }}
        >
          {scoreRed}
        </span>
      </div>

      {players.map((player, index) => {
        const rect = layout[index];
        if (!rect) return null;
        const info = TEAM_INFO[player.team];
        const playerStats = statsBySlot.get(player.slot);
        const entry = manifest.pokemon.find((pokemon) => pokemon.id === player.pokemonId);
        const compact = players.length > 4;
        const hpPct = playerStats
          ? Math.max(0, Math.min(100, (playerStats.hp / Math.max(1, playerStats.maxHp)) * 100))
          : 0;
        const isDead = playerStats ? !playerStats.alive : false;
        const concealmentPct = playerStats ? Math.round(playerStats.concealment * 100) : 0;
        const concealmentClass = concealmentClassFor(playerStats);
        const concealmentTitle = playerStats
          ? `Visión base ${playerStats.visionRange.toFixed(1)} u. ` +
            `Ocultación ${concealmentPct}% (base ${Math.round(
              playerStats.concealmentBase * 100
            )}% ×${playerStats.concealmentMultiplier.toFixed(2)}, ` +
            `${CONCEALMENT_REASON_LABEL[playerStats.concealmentReason]}). ` +
            `Con el mismo rango base, te detectan a ${playerStats.detectionRange.toFixed(1)} u.`
          : undefined;

        return (
          <section
            key={player.slot}
            className="absolute animate-fade-in bg-[image:linear-gradient(180deg,color-mix(in_srgb,var(--team)_9%,transparent),transparent_16%)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--team)_58%,transparent)] after:pointer-events-none after:absolute after:inset-0 after:shadow-[inset_0_0_26px_rgb(0_0_0/0.22)]"
            style={
              {
                ...splitRectToStyle(rect),
                '--team': info.color,
                animationDelay: `${index * 40}ms`
              } as CSSProperties
            }
          >
            <div
              className={`pointer-events-none absolute flex flex-col rounded-[10px] border border-line bg-[#050a10]/[0.84] shadow-[0_10px_24px_rgb(0_0_0/0.4)] backdrop-blur-[7px] ${
                compact
                  ? 'inset-x-1 bottom-1 gap-1 px-1.5 py-1'
                  : 'inset-x-2 bottom-2 gap-[5px] px-2 py-1.5'
              }`}
            >
              {/* Fila 1: identidad y vida. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`grid place-items-center rounded-[6px] bg-(--team) font-display font-extrabold text-[#06101a] ${
                      compact ? 'size-5 text-[0.68rem]' : 'size-6 text-[0.8rem]'
                    }`}
                  >
                    {player.slot}
                  </span>
                  {entry && <PokemonPortrait entry={entry} height={compact ? 22 : 28} />}
                  <span className="flex flex-col leading-[1.05]">
                    <strong className="font-mono text-[0.62rem] tracking-[0.08em] uppercase">
                      {player.name}
                    </strong>
                    <span
                      className={`flex items-center gap-1 text-[#c6d4e2] ${
                        compact ? 'text-[0.6rem]' : 'text-[0.68rem]'
                      }`}
                    >
                      {entry?.name ?? '—'}
                    </span>
                  </span>
                </div>

                {playerStats && (
                  <div className="flex min-w-[120px] flex-1 items-center gap-1.5">
                    <div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-black/60">
                      <div
                        className="h-full rounded-full transition-[width,background-color] duration-150"
                        style={{
                          width: `${hpPct}%`,
                          backgroundColor: isDead ? '#5b6675' : hpColorFor(hpPct)
                        }}
                      />
                    </div>
                    <span className="font-mono text-[0.5rem] tabular-nums text-[#c6d4e2]">
                      {Math.ceil(playerStats.hp)}/{playerStats.maxHp}
                    </span>
                    <span className="font-mono text-[0.5rem] tabular-nums text-[#7f92a7]">
                      K{playerStats.kills} D{playerStats.deaths}
                    </span>
                    {playerStats.invulnerable && (
                      <span className="rounded bg-white/10 px-1 font-mono text-[0.46rem] tracking-[0.06em] text-[#d7e6f4]">
                        INV
                      </span>
                    )}
                  </div>
                )}

                {playerStats && playerStats.alive && (
                  <div
                    className={`pointer-events-auto ml-auto flex items-center rounded-[6px] border font-mono tracking-[0.08em] uppercase ${
                      compact
                        ? 'gap-1 px-1.5 py-0.5 text-[0.46rem]'
                        : 'gap-1.5 px-2 py-[3px] text-[0.52rem]'
                    } ${
                      playerStats.discovered
                        ? 'border-[color:color-mix(in_srgb,#ff5f63_50%,transparent)] bg-[#2a0d11]/[0.78] text-[#ffb2b5]'
                        : 'border-[color:color-mix(in_srgb,#8ee08a_42%,transparent)] bg-[#08170f]/[0.76] text-[#bff39d]'
                    }`}
                    title={
                      playerStats.discovered
                        ? `Te ve${playerStats.enemiesSeeing === 1 ? '' : 'n'} ${
                            playerStats.enemiesSeeing
                          } rival${playerStats.enemiesSeeing === 1 ? '' : 'es'} del otro equipo. ` +
                          `Ocultación del terreno ${concealmentPct}%.`
                        : 'Ningún rival te ve ahora mismo: estás oculto para el otro equipo. ' +
                          `Ocultación del terreno ${concealmentPct}%.`
                    }
                  >
                    <span className="relative inline-flex items-center">
                      {/* Reserva el ancho máximo para que el estado no mueva el resto del HUD. */}
                      <span
                        className={`invisible flex items-center ${
                          compact ? 'gap-1' : 'gap-1.5'
                        }`}
                        aria-hidden="true"
                      >
                        <span className="size-1.5 shrink-0 rounded-full" />
                        Descubierto
                        <span>×4</span>
                      </span>
                      <span
                        className={`absolute inset-0 flex items-center justify-center ${
                          compact ? 'gap-1' : 'gap-1.5'
                        }`}
                      >
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${
                            playerStats.discovered ? 'bg-[#ff5f63]' : 'bg-[#8ee08a]'
                          }`}
                        />
                        {playerStats.discovered ? 'Descubierto' : 'Oculto'}
                        {playerStats.discovered && playerStats.enemiesSeeing > 1 && (
                          <span className="text-[#ff8f92]">×{playerStats.enemiesSeeing}</span>
                        )}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {playerStats && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <div
                    className={`pointer-events-auto flex items-center whitespace-nowrap rounded-[6px] border border-line bg-[#050a10]/[0.55] font-mono text-[#9fb1c4] ${
                      compact
                        ? 'gap-1 px-1.5 py-0.5 text-[0.5rem]'
                        : 'gap-2 px-2 py-[3px] text-[0.55rem]'
                    }`}
                    title={concealmentTitle}
                  >
                    <span className="text-[#d7e6f4]">
                      {compact ? 'V' : 'Visión'} {playerStats.visionRange.toFixed(1)} u
                    </span>
                    <span className={concealmentClass || 'text-[#aabccf]'}>
                      {compact ? 'O' : 'Ocultación'} {concealmentPct}%
                    </span>
                    {!compact && (
                      <span className="text-[#7f92a7] max-[760px]:hidden">
                        te ven a {playerStats.detectionRange.toFixed(1)} u
                      </span>
                    )}
                  </div>

                  <div
                    className={`flex items-center gap-1.5 whitespace-nowrap font-mono text-[#aabccf] ${
                      compact ? 'text-[0.5rem]' : 'text-[0.55rem]'
                    }`}
                  >
                    <TypeBadge type={playerStats.terrainType} />
                    {!compact && <span>{playerStats.terrainName}</span>}
                    <span
                      className={`whitespace-nowrap ${
                        playerStats.terrainSpeedMultiplier > 1
                          ? 'text-[#bff39d]'
                          : playerStats.terrainSpeedMultiplier < 1
                            ? 'text-[#ffb2b5]'
                            : 'text-[#8fa3b8]'
                      }`}
                    >
                      {playerStats.speed.toFixed(1)} u/s · ×
                      {playerStats.terrainSpeedMultiplier.toFixed(2)}
                    </span>
                  </div>

                  <div className="ml-auto flex flex-1 gap-1">
                    {playerStats.abilities.map((ability, abilityIndex) => {
                      const ready = ability.cooldown <= 0.001;
                      const pct =
                        ability.duration > 0
                          ? Math.min(100, (ability.cooldown / ability.duration) * 100)
                          : 0;
                      const keys = playerStats.gamepad
                        ? ['X', 'Y', 'RB', 'LB']
                        : ['J', 'K', 'L', 'U'];
                      return (
                        <div
                          key={ability.slot}
                          className={`relative flex min-w-10 flex-1 flex-col overflow-hidden rounded-[8px] border bg-[#050a10]/[0.82] px-1 py-0.5 backdrop-blur-[6px] ${
                            ready && ability.id
                              ? 'border-[color:color-mix(in_srgb,var(--team)_55%,var(--color-line))]'
                              : 'border-line opacity-75'
                          }`}
                          title={`${ability.name}${ability.type ? ` · ${ability.type}` : ''}`}
                        >
                          <span className="font-mono text-[0.44rem] tracking-[0.06em] text-(--team)">
                            {keys[abilityIndex]}
                          </span>
                          <span className="truncate font-mono text-[0.46rem] text-[#c6d4e2]">
                            {ability.name}
                          </span>
                          {!ready && (
                            <span className="absolute inset-0 grid place-items-center bg-[#03070c]/[0.74] font-mono text-[0.72rem] font-bold text-[#e6f0fa]">
                              {ability.cooldown.toFixed(1)}
                            </span>
                          )}
                          {!ready && (
                            <span
                              className="absolute bottom-0 left-0 h-0.5 bg-(--team)"
                              style={{ width: `${pct}%` }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {playerStats && !playerStats.alive && (
              <div className="absolute inset-0 grid place-items-center bg-[#03070c]/[0.46]">
                <div className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-[#050a10]/[0.86] px-6 py-4 text-center backdrop-blur-[6px]">
                  <span className="font-display text-[1.6rem] font-extrabold tracking-[0.16em] text-[#ffb2b5]">
                    KO
                  </span>
                  <span className="font-mono text-[0.7rem] text-[#c6d4e2]">
                    Reapareces en {Math.ceil(playerStats.respawnIn)} s
                  </span>
                </div>
              </div>
            )}
          </section>
        );
      })}

      <button type="button" className={splitPause} onClick={onPause}>
        Pausa{' '}
        <span className="ml-1.5 font-mono text-[0.55rem] text-[#7f92a7] max-[760px]:hidden">
          Start / Esc
        </span>
      </button>
    </div>
  );
}
