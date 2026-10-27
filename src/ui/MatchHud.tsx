import type { CSSProperties } from 'react';
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
  'pointer-events-auto fixed top-2.5 left-1/2 z-[7] inline-flex -translate-x-1/2 animate-fade-in cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-strong bg-[#050a10]/80 px-[13px] py-[7px] text-[0.76rem] font-[650] text-ink backdrop-blur-[8px] transition-colors duration-[120ms] ease-out hover:bg-white/10';

/** Color del porcentaje de ocultación: verde si el tipo ayuda, rojo si delata. */
function concealmentClassFor(stats: PlayerMatchStats | undefined): string {
  if (!stats || stats.concealment <= 0) return '';
  if (stats.concealmentReason === 'hostile') return 'text-[#ffb2b5]';
  if (stats.concealmentReason === 'home' || stats.concealmentReason === 'comfortable') {
    return 'text-[#bff39d]';
  }
  return '';
}

/**
 * Capa HTML del splitscreen. Los viewports 3D los dibuja PlayCanvas debajo;
 * aquí solo van los bordes de equipo y las etiquetas de cada jugador, alineadas
 * con el mismo reparto normalizado que usan las cámaras.
 */
export function MatchHud({ manifest, players, stats, onPause }: MatchHudProps) {
  const layout = computeSplitLayout(players.length);
  const statsBySlot = new Map(stats.map((entry) => [entry.slot, entry]));

  return (
    <div className="pointer-events-none fixed inset-0 z-[6]" aria-hidden="false">
      {players.map((player, index) => {
        const rect = layout[index];
        if (!rect) return null;
        const info = TEAM_INFO[player.team];
        const playerStats = statsBySlot.get(player.slot);
        const entry = manifest.pokemon.find((pokemon) => pokemon.id === player.pokemonId);
        const compact = players.length > 4;
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
              className={`absolute flex items-center rounded-[11px] border border-[color:color-mix(in_srgb,var(--team)_45%,var(--color-line))] bg-[#050a10]/[0.74] backdrop-blur-[6px] ${
                compact ? 'top-1.5 left-1.5 gap-[5px] py-[3px] pr-1.5 pl-1' : 'top-2.5 left-2.5 gap-2 py-[5px] pr-[9px] pl-1.5'
              }`}
            >
              <span
                className={`grid place-items-center rounded-[7px] bg-(--team) font-display font-extrabold text-[#06101a] ${
                  compact ? 'size-5 text-[0.72rem]' : 'size-6 text-[0.85rem]'
                }`}
              >
                {player.slot}
              </span>
              {entry && <PokemonPortrait entry={entry} height={compact ? 26 : 34} />}
              <span className="flex flex-col leading-[1.1]">
                <strong className="font-mono text-[0.62rem] tracking-[0.08em] uppercase">
                  {player.name}
                </strong>
                <span className={`text-[#c6d4e2] ${compact ? 'text-[0.64rem]' : 'text-[0.72rem]'}`}>
                  {entry?.name ?? '—'}
                </span>
              </span>
              <span className="border-l border-line pl-[7px] font-mono text-[0.52rem] tracking-[0.08em] uppercase text-(--team) max-[760px]:hidden">
                {info.short}
              </span>
            </div>

            {playerStats && (
              <div
                className={`absolute flex items-center rounded-[9px] border border-line bg-[#050a10]/[0.68] font-mono text-[#aabccf] ${
                  compact
                    ? 'bottom-1.5 left-1.5 gap-[7px] px-1.5 py-[3px] text-[0.52rem]'
                    : 'bottom-2.5 left-2.5 gap-[7px] px-2 py-1 text-[0.58rem]'
                }`}
              >
                <TypeBadge type={playerStats.terrainType} />
                <span className="whitespace-nowrap max-[760px]:hidden">
                  {playerStats.terrainName}
                </span>
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
            )}

            {playerStats && (
              <div
                className={`pointer-events-auto absolute flex items-center whitespace-nowrap rounded-[9px] border border-line bg-[#050a10]/[0.62] font-mono text-[#9fb1c4] ${
                  compact
                    ? 'bottom-[33px] left-1.5 gap-1 px-[5px] py-0.5 text-[0.5rem]'
                    : 'bottom-10 left-2.5 gap-[7px] px-2 py-[3px] text-[0.55rem]'
                }`}
                title={concealmentTitle}
              >
                <span className="text-[#d7e6f4]">
                  {compact ? 'V' : 'Visión'} {playerStats.visionRange.toFixed(1)} u
                </span>
                <span className={concealmentClass || 'text-[#aabccf]'}>
                  {compact ? 'O' : 'Oculto'} {concealmentPct}%
                </span>
                {!compact && (
                  <span className="text-[#7f92a7] max-[760px]:hidden">
                    te ven a {playerStats.detectionRange.toFixed(1)} u
                  </span>
                )}
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
