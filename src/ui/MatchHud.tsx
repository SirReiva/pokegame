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
import { SpritePreview } from './SpritePreview';
import { TypeBadge } from './TypeBadge';

interface MatchHudProps {
  manifest: SpriteManifest;
  players: LobbyPlayer[];
  stats: PlayerMatchStats[];
  onPause: () => void;
}

/** Color del porcentaje de ocultación: verde si el tipo ayuda, rojo si delata. */
function concealmentClassFor(stats: PlayerMatchStats | undefined): string {
  if (!stats || stats.concealment <= 0) return '';
  if (stats.concealmentReason === 'hostile') return ' is-bad';
  if (stats.concealmentReason === 'home' || stats.concealmentReason === 'comfortable') {
    return ' is-good';
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
    <div className="split-hud" aria-hidden="false">
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
            className={`split-panel${compact ? ' is-compact' : ''}`}
            style={
              {
                ...splitRectToStyle(rect),
                '--team': info.color
              } as CSSProperties
            }
          >
            <div className="split-tag">
              <span className="split-slot">{player.slot}</span>
              {entry && <SpritePreview entry={entry} height={compact ? 26 : 34} />}
              <span className="split-copy">
                <strong>{player.name}</strong>
                <span>{entry?.name ?? '—'}</span>
              </span>
              <span className="split-team">{info.short}</span>
            </div>

            {playerStats && (
              <div className="split-terrain">
                <TypeBadge type={playerStats.terrainType} />
                <span className="split-terrain-name">{playerStats.terrainName}</span>
                <span
                  className={`split-speed${
                    playerStats.terrainSpeedMultiplier > 1
                      ? ' is-fast'
                      : playerStats.terrainSpeedMultiplier < 1
                        ? ' is-slow'
                        : ''
                  }`}
                >
                  {playerStats.speed.toFixed(1)} u/s · ×
                  {playerStats.terrainSpeedMultiplier.toFixed(2)}
                </span>
              </div>
            )}

            {playerStats && (
              <div className="split-vision" title={concealmentTitle}>
                <span className="split-vision-range">
                  {compact ? 'V' : 'Visión'} {playerStats.visionRange.toFixed(1)} u
                </span>
                <span className={`split-conceal${concealmentClass}`}>
                  {compact ? 'O' : 'Oculto'} {concealmentPct}%
                </span>
                {!compact && (
                  <span className="split-vision-detect">
                    te ven a {playerStats.detectionRange.toFixed(1)} u
                  </span>
                )}
              </div>
            )}
          </section>
        );
      })}

      <button type="button" className="btn btn-ghost btn-small split-pause" onClick={onPause}>
        Pausa <span className="split-pause-key">Start / Esc</span>
      </button>
    </div>
  );
}
