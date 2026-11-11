import type { CSSProperties } from 'react';
import type { BuffStat } from '../game/abilities';
import type { AtmosphereState } from '../game/atmosphere';
import {
  TEAM_INFO,
  computeSplitLayout,
  splitRectToStyle,
  type KillFeedEntry,
  type LobbyPlayer,
  type PlayerMatchStats
} from '../game/multiplayer';
import { skinFor } from '../game/skins';
import type { SpriteManifest } from '../game/types';
import type { Team } from '../game/terrain';
import { CONCEALMENT_REASON_LABEL } from '../game/vision';
import { XP_SOURCE_LABELS } from '../game/xp';
import { PokemonPortrait } from './PokemonPortrait';
import { TypeBadge } from './TypeBadge';
import { TYPE_LABELS, TYPE_SHORT_LABELS, typeStyle } from './typeInfo';

interface MatchHudProps {
  manifest: SpriteManifest;
  players: LobbyPlayer[];
  stats: PlayerMatchStats[];
  teams: Team[];
  koTarget: number;
  /** Clima sorteado para esta partida, si ya ha empezado. */
  atmosphere: AtmosphereState | null;
  onPause: () => void;
}

const splitPause =
  'pointer-events-auto fixed top-14 left-1/2 z-7 inline-flex -translate-x-1/2 animate-fade-in cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-strong bg-night-850/80 px-[13px] py-1.75 text-12.16 font-[650] text-ink backdrop-blur-sm transition-colors duration-[120ms] ease-out hover:bg-white/10';

/** Color del porcentaje de ocultación: verde si el tipo ayuda, rojo si delata. */
function concealmentClassFor(stats: PlayerMatchStats | undefined): string {
  if (!stats || stats.concealment <= 0) return '';
  if (stats.concealmentReason === 'hostile') return 'text-danger-100';
  if (stats.concealmentReason === 'home' || stats.concealmentReason === 'comfortable') {
    return 'text-accent-soft';
  }
  return '';
}

/** Barra de vida de verde (100%) a amarillo y rojo (0%). */
function hpColorFor(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  return `hsl(${(clamped * 1.2).toFixed(1)} 78% 52%)`;
}

/** Formatea contadores grandes con separador de miles. */
function formatCount(value: number): string {
  return Math.round(value).toLocaleString('es-ES');
}

/** Tooltip del nivel: rango, progreso y desglose de XP por fuente. */
function xpTitleFor(stats: PlayerMatchStats | undefined): string | undefined {
  if (!stats) return undefined;
  const breakdown = (
    Object.keys(stats.xpBreakdown) as (keyof PlayerMatchStats['xpBreakdown'])[]
  )
    .filter((source) => stats.xpBreakdown[source] >= 0.5)
    .map(
      (source) =>
        `${XP_SOURCE_LABELS[source]}: ${formatCount(stats.xpBreakdown[source])}`
    )
    .join(' · ');
  return (
    `${stats.rank} · Nivel ${stats.level}/10 · ${formatCount(stats.xp)} XP` +
    (stats.xpToNext > 0
      ? ` · ${formatCount(stats.xpToNext - stats.xpIntoLevel)} XP para el siguiente`
      : ' · Nivel máximo') +
    (breakdown ? ` · ${breakdown}` : '')
  );
}

/** Etiquetas cortas de las estadísticas que pueden llevar buff. */
const BUFF_LABEL: Record<BuffStat, string> = {
  speed: 'VEL',
  attack: 'ATQ',
  defense: 'DEF',
  spAttack: 'ATQ.ESP',
  spDefense: 'DEF.ESP'
};

/**
 * Feed de KOs de una vista. Cada jugador recibe la misma lista global de la
 * partida, pero la pinta dentro de su propio viewport para no compartir un
 * único panel entre todas las cámaras del splitscreen.
 */
function KillFeed({
  entries,
  compact,
  pokemonNames,
  ownSlot
}: {
  entries: readonly KillFeedEntry[];
  compact: boolean;
  pokemonNames: ReadonlyMap<string, string>;
  /** Plaza del jugador de esta vista: su nombre se pinta en blanco. */
  ownSlot: number;
}) {
  const visible = entries.slice(0, 4);
  if (visible.length === 0) return null;

  return (
    <ol
      className={`pointer-events-none absolute right-2 top-1/4 z-10 flex max-w-[72%] flex-col items-end gap-1.5`}
      aria-label="Últimos KOs"
    >
      {visible.map((entry) => {
        const killerColor = TEAM_INFO[entry.killerTeam].color;
        const victimColor = TEAM_INFO[entry.victimTeam].color;
        const killerPokemon =
          pokemonNames.get(entry.killerPokemonId) ?? entry.killerPokemonId;
        const victimPokemon =
          pokemonNames.get(entry.victimPokemonId) ?? entry.victimPokemonId;
        const killerIsOwn = entry.killerSlot === ownSlot;
        const victimIsOwn = entry.victimSlot === ownSlot;
        return (
          <li
            key={entry.id}
            className={`flex max-w-full animate-fade-in items-center gap-2 rounded-lg border border-line bg-night-850/80 px-2.5 py-1.5 leading-none shadow-[0_6px_16px_rgb(0_0_0/0.3)] backdrop-blur-[5px] ${
              compact ? 'text-9.6' : 'text-11.2'
            }`}
            title={`${entry.killerName} (${killerPokemon}) eliminó a ${entry.victimName} (${victimPokemon}) con ${entry.abilityName}`}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: killerColor }}
            />
            <span className="min-w-0 truncate font-mono">
              <span
                className="font-semibold"
                style={{ color: killerIsOwn ? '#ffffff' : killerColor }}
              >
                {entry.killerName}
              </span>{' '}
              <span className="text-steel-450">({killerPokemon})</span>
            </span>
            <span className="shrink-0 font-mono text-7.36 font-bold tracking-[0.08em] text-steel-450 uppercase">
              KO
            </span>
            <span className="max-w-28 shrink-0 truncate font-mono text-9.6 text-steel-450">
              ({entry.abilityName})
            </span>
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: victimColor }}
            />
            <span className="min-w-0 truncate font-mono">
              <span style={{ color: victimIsOwn ? '#ffffff' : victimColor }}>
                {entry.victimName}
              </span>{' '}
              <span className="text-steel-450">({victimPokemon})</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Capa HTML del splitscreen. Los viewports 3D los dibuja PlayCanvas debajo;
 * aquí solo van los bordes de equipo y las etiquetas de cada jugador, alineadas
 * con el mismo reparto normalizado que usan las cámaras.
 */
export function MatchHud({
  manifest,
  players,
  stats,
  teams,
  koTarget,
  atmosphere,
  onPause
}: MatchHudProps) {
  const layout = computeSplitLayout(players.length);
  const statsBySlot = new Map(stats.map((entry) => [entry.slot, entry]));
  const pokemonNames = new Map(
    manifest.pokemon.map((pokemon) => [pokemon.id, pokemon.name])
  );
  const scores = stats[0]?.scores;

  return (
    <div className="pointer-events-none fixed inset-0 z-6" aria-hidden="false">
      <div className="fixed top-2.5 left-1/2 z-8 flex max-w-[92vw] -translate-x-1/2 flex-wrap items-center justify-center gap-2.5 rounded-xl border border-line-strong bg-night-850/85 px-4 py-1.5 shadow-[0_10px_30px_rgb(0_0_0/0.35)] backdrop-blur-sm">
        {teams.map((team, index) => (
          <span key={team} className="flex items-center gap-2.5">
            {index > 0 && (
              <span className="font-mono text-8.8 tracking-[0.12em] text-steel-750 uppercase">
                vs
              </span>
            )}
            <span
              className="font-display text-14.72 font-extrabold tabular-nums"
              style={{ color: TEAM_INFO[team].color }}
              title={`${TEAM_INFO[team].label} · ${scores?.[team] ?? 0} KO`}
            >
              {scores?.[team] ?? 0}
            </span>
          </span>
        ))}
        <span className="font-mono text-9.28 tracking-[0.12em] text-steel-650 uppercase">
          a {koTarget}
        </span>
        {atmosphere && (
          <span
            className="flex items-center gap-1.5 border-l border-line-strong pl-2.5 font-mono text-9.28 tracking-[0.08em] uppercase"
            style={{ color: atmosphere.color }}
            title={`${atmosphere.name}: ${atmosphere.description}`}
          >
            <span aria-hidden="true" className="text-11.2 leading-none">
              {atmosphere.icon}
            </span>
            {atmosphere.short}
          </span>
        )}
      </div>

      {players.map((player, index) => {
        const rect = layout[index];
        if (!rect) return null;
        const info = TEAM_INFO[player.team];
        const playerStats = statsBySlot.get(player.slot);
        const entry = manifest.pokemon.find((pokemon) => pokemon.id === player.pokemonId);
        const skin = entry
          ? skinFor(entry, player.skinId ?? playerStats?.skinId)
          : null;
        const compact = players.length > 4;
        const common = playerStats?.commonAbility ?? null;
        const hpPct = playerStats
          ? Math.max(0, Math.min(100, (playerStats.hp / Math.max(1, playerStats.maxHp)) * 100))
          : 0;
        const isDead = playerStats ? !playerStats.alive : false;
        const armorRemaining = playerStats?.armorRemaining ?? 0;
        const armorMax = playerStats?.armorMax ?? 0;
        const armorPct = playerStats
          ? Math.max(
              0,
              Math.min(
                100,
                (armorRemaining / Math.max(1, playerStats.maxHp)) * 100
              )
            )
          : 0;
        // La franja se alinea a la derecha con el tramo verde de la vida actual
        // y se recorta contra su borde izquierdo si la armadura restante lo
        // supera.
        const armorVisiblePct = Math.max(0, Math.min(armorPct, hpPct));
        const armorLeftPct = Math.max(0, hpPct - armorVisiblePct);
        const hpTitle = playerStats
          ? `${Math.ceil(playerStats.hp)}/${playerStats.maxHp} PV` +
            (armorRemaining > 0
              ? ` · Armadura de casteo: ${Math.ceil(armorRemaining)}/${armorMax} PV; el daño acumulado la rompe`
              : '')
          : undefined;
        const concealmentPct = playerStats ? Math.round(playerStats.concealment * 100) : 0;
        const concealmentClass = concealmentClassFor(playerStats);
        const concealmentTitle = playerStats
          ? `Visión ${playerStats.visionRange.toFixed(1)} u. ` +
            `Ocultación ${concealmentPct}% (base ${Math.round(
              playerStats.concealmentBase * 100
            )}% ×${playerStats.concealmentMultiplier.toFixed(2)}, ` +
            `${CONCEALMENT_REASON_LABEL[playerStats.concealmentReason]}). ` +
            `Con el mismo rango base, te detectan a ${playerStats.detectionRange.toFixed(1)} u.`
          : undefined;
        const combatTitle = playerStats
          ? `Daño hecho ${formatCount(playerStats.damageDealt)} · ` +
            `Daño recibido ${formatCount(playerStats.damageTaken)} · ` +
            `Curación con habilidades ${formatCount(playerStats.abilityHealing)} · ` +
            `Curación con objetos ${formatCount(playerStats.pickupHealing)}`
          : undefined;
        const xpTitle = xpTitleFor(playerStats);

        return (
          <section
            key={player.slot}
            className="absolute animate-fade-in bg-[linear-gradient(180deg,color-mix(in_srgb,var(--team)_9%,transparent),transparent_16%)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--team)_58%,transparent)] after:pointer-events-none after:absolute after:inset-0 after:shadow-[inset_0_0_26px_rgb(0_0_0/0.22)]"
            style={
              {
                ...splitRectToStyle(rect),
                '--team': info.color,
                animationDelay: `${index * 40}ms`
              } as CSSProperties
            }
          >
            {playerStats &&
              (playerStats.buffs.length > 0 || playerStats.slows.length > 0) && (
                <div className="pointer-events-none absolute top-2 left-2 z-10 flex max-w-[72%] flex-wrap gap-1">
                  {playerStats.buffs.map((buff, buffIndex) => {
                    const delta = Math.round((buff.multiplier - 1) * 100);
                    const positive = delta >= 0;
                    return (
                      <span
                        key={`buff-${buff.stat}-${buffIndex}`}
                        className={`flex items-center gap-1 rounded-md border bg-night-850/82 px-2 py-1 font-mono leading-none backdrop-blur-[6px] ${
                          positive
                            ? 'border-[color-mix(in_srgb,#8ee08a_45%,var(--color-line))]'
                            : 'border-[color-mix(in_srgb,#ff5f63_45%,var(--color-line))]'
                        } ${compact ? 'text-8.32' : 'text-9.6'}`}
                        title={`${BUFF_LABEL[buff.stat]} ${positive ? '+' : ''}${delta}% durante ${buff.remaining.toFixed(1)} s`}
                      >
                        <span
                          className={
                            positive ? 'text-accent-soft' : 'text-danger-100'
                          }
                        >
                          {BUFF_LABEL[buff.stat]} {positive ? '+' : ''}
                          {delta}%
                        </span>
                        <span className="text-steel-500">
                          {buff.remaining.toFixed(1)}s
                        </span>
                      </span>
                    );
                  })}
                  {playerStats.slows.map((slow, slowIndex) => {
                    const delta = Math.round((1 - slow.multiplier) * 100);
                    return (
                      <span
                        key={`slow-${slow.multiplier}-${slowIndex}`}
                        className={`flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,#ff5f63_45%,var(--color-line))] bg-night-850/82 px-2 py-1 font-mono leading-none backdrop-blur-[6px] ${
                          compact ? 'text-8.32' : 'text-9.6'
                        }`}
                        title={`Ralentizado ${delta}% durante ${slow.remaining.toFixed(1)} s`}
                      >
                        <span className="text-danger-100">LENTO -{delta}%</span>
                        <span className="text-steel-500">
                          {slow.remaining.toFixed(1)}s
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            <div
              className={`pointer-events-none absolute flex flex-col rounded-[10px] border border-line bg-night-850/84 shadow-[0_10px_24px_rgb(0_0_0/0.4)] backdrop-blur-[7px] ${
                compact
                  ? 'inset-x-1 bottom-1 gap-1 px-1.5 py-1'
                  : 'inset-x-2 bottom-2 gap-1.25 px-2 py-1.5'
              }`}
            >
              {/* Fila 1: identidad y vida. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`grid shrink-0 place-items-center rounded-md bg-(--team) px-1 font-display font-extrabold leading-none text-ink-dark-strong ${
                      compact
                        ? 'h-5 min-w-7 text-8.32'
                        : 'h-6 min-w-8 text-9.6'
                    }`}
                    title={xpTitle}
                  >
                    NV {playerStats?.level ?? 1}
                  </span>
                  {entry && (
                    <PokemonPortrait
                      entry={entry}
                      skin={skin}
                      height={compact ? 22 : 28}
                    />
                  )}
                  <span className="flex flex-col leading-[1.05]">
                    <strong className="font-mono text-9.92 tracking-[0.08em] uppercase">
                      {player.name}
                    </strong>
                    <span
                      className={`flex items-center gap-1 text-steel-250 ${
                        compact ? 'text-9.6' : 'text-10.88'
                      }`}
                    >
                      {entry?.name ?? '—'}
                    </span>
                  </span>
                </div>

                {playerStats && (
                  <div className="grid min-w-30 flex-1 gap-0.5">
                    <div
                      className={`relative w-full overflow-hidden rounded-full bg-black/60 ${
                        compact ? 'h-3' : 'h-3.5'
                      }`}
                      title={hpTitle}
                    >
                      <div
                        className="h-full rounded-full transition-[width,background-color] duration-150"
                        style={{
                          width: `${hpPct}%`,
                          backgroundColor: isDead ? '#5b6675' : hpColorFor(hpPct)
                        }}
                      />
                      {/* Franja metálica de la armadura de casteo: alineada a
                          la derecha con el tramo verde de la vida actual,
                          comparte su altura y se recorta si la armadura
                          restante la supera. */}
                      {armorVisiblePct > 0 && (
                        <>
                          <div
                            className="pointer-events-none absolute inset-y-0 border-x border-white/60"
                            style={{
                              left: `${armorLeftPct}%`,
                              width: `${armorVisiblePct}%`,
                              backgroundImage:
                                'repeating-linear-gradient(115deg, rgb(20 30 40 / 0.28) 0 1px, transparent 1px 5px), linear-gradient(180deg, #eef6fd 0%, #a9bccd 45%, #5f7285 100%)'
                            }}
                            aria-hidden="true"
                          />
                          <svg
                            className="pointer-events-none absolute bottom-0.5 size-2 text-night-950/80"
                            style={{ left: `calc(${armorLeftPct}% + 2px)` }}
                            viewBox="0 0 12 14"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M6 .5 1.5 2.4v4c0 2.8 1.9 5.6 4.5 7 2.6-1.4 4.5-4.2 4.5-7v-4L6 .5Z" />
                          </svg>
                        </>
                      )}
                      <span
                        className={`absolute inset-0 grid place-items-center font-mono font-bold tabular-nums leading-none text-ink drop-shadow-[0_1px_1px_rgb(0_0_0/0.85)] ${
                          compact ? 'text-7.36' : 'text-8'
                        }`}
                      >
                        {Math.ceil(playerStats.hp)}/{playerStats.maxHp}
                      </span>
                    </div>
                    <div
                      className={`h-0.75 overflow-hidden rounded-full bg-black/60 ${
                        compact ? 'mx-1.5' : 'mx-1.75'
                      }`}
                      title={xpTitle}
                    >
                      <div
                        className="h-full rounded-full bg-(--team) transition-[width] duration-200"
                        style={{ width: `${playerStats.xpProgress * 100}%` }}
                      />
                    </div>
                  </div>
                )}

              </div>

              {playerStats && (
                <>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <div
                      className={`pointer-events-auto flex items-center whitespace-nowrap rounded-md border border-line bg-night-850/55 font-mono text-steel-375 ${
                        compact
                          ? 'gap-1 px-1.5 py-0.5 text-8'
                          : 'gap-2 px-2 py-0.75 text-8.8'
                      }`}
                      title={concealmentTitle}
                    >
                      <span className="text-steel-150">
                        {compact ? 'V' : 'Visión'} {playerStats.visionRange.toFixed(1)} u
                      </span>
                      <span className={concealmentClass || 'text-steel-340'}>
                        {compact ? 'O' : 'Ocultación'} {concealmentPct}%
                      </span>
                      {!compact && (
                        <span className="text-steel-650 max-[760px]:hidden">
                          te ven a {playerStats.detectionRange.toFixed(1)} u
                        </span>
                      )}
                    </div>

                    <div
                      className={`flex items-center gap-1.5 whitespace-nowrap font-mono text-steel-340 ${
                        compact ? 'text-8' : 'text-8.8'
                      }`}
                    >
                      {playerStats.terrainType && (
                        <TypeBadge type={playerStats.terrainType} />
                      )}
                      {!compact && <span>{playerStats.terrainName}</span>}
                      <span
                        className={`whitespace-nowrap ${
                          playerStats.terrainSpeedMultiplier > 1
                            ? 'text-accent-soft'
                            : playerStats.terrainSpeedMultiplier < 1
                              ? 'text-danger-100'
                              : 'text-steel-450'
                        }`}
                      >
                        {playerStats.speed.toFixed(1)} u/s · ×
                        {playerStats.terrainSpeedMultiplier.toFixed(2)}
                      </span>
                    </div>

                    <div
                      className={`ml-auto flex items-center whitespace-nowrap font-mono tabular-nums ${
                        compact ? 'gap-1.5 text-8' : 'gap-2 text-8.8'
                      }`}
                      title={combatTitle}
                    >
                      <span className="text-steel-650">
                        K{playerStats.kills} D{playerStats.deaths}
                      </span>
                      {!compact && (
                        <span className="text-steel-500">
                          DÑO {formatCount(playerStats.damageDealt)}
                        </span>
                      )}
                      {!compact && (
                        <span className="text-success">
                          CUR HAB {formatCount(playerStats.abilityHealing)}
                        </span>
                      )}
                      {!compact && (
                        <span className="text-success">
                          CUR OBJ {formatCount(playerStats.pickupHealing)}
                        </span>
                      )}
                      {playerStats.invulnerable && (
                        <span className="rounded bg-white/10 px-1 text-7.36 tracking-[0.06em] text-steel-150">
                          INV
                        </span>
                      )}
                    </div>

                    {playerStats.alive && (
                      <div
                        className={`pointer-events-auto flex items-center rounded-md border font-mono tracking-[0.08em] uppercase ${
                          compact
                            ? 'gap-1 px-1.5 py-0.5 text-7.36'
                            : 'gap-1.5 px-2 py-0.75 text-8.32'
                        } ${
                          playerStats.discovered
                            ? 'border-[color-mix(in_srgb,#ff5f63_50%,transparent)] bg-danger-deep/78 text-danger-100'
                            : 'border-[color-mix(in_srgb,#8ee08a_42%,transparent)] bg-success-deep/76 text-accent-soft'
                        }`}
                        title={
                          playerStats.discovered
                            ? `Te ve${playerStats.enemiesSeeing === 1 ? '' : 'n'} ${
                                playerStats.enemiesSeeing
                              } rival${playerStats.enemiesSeeing === 1 ? '' : 'es'} enemigo${playerStats.enemiesSeeing === 1 ? '' : 's'}. ` +
                              `Ocultación del terreno ${concealmentPct}%.`
                            : 'Ningún rival te ve ahora mismo: estás oculto para los demás equipos. ' +
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
                                playerStats.discovered ? 'bg-team-red' : 'bg-success'
                              }`}
                            />
                            {playerStats.discovered ? 'Descubierto' : 'Oculto'}
                            {playerStats.discovered && playerStats.enemiesSeeing > 1 && (
                              <span className="text-danger-300">×{playerStats.enemiesSeeing}</span>
                            )}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-stretch gap-1">
                    {playerStats.abilities.map((ability, abilityIndex) => {
                      const ready = ability.cooldown <= 0.001;
                      const pct =
                        ability.duration > 0
                          ? Math.min(100, (ability.cooldown / ability.duration) * 100)
                          : 0;
                      const keys = playerStats.gamepad
                        ? ['X', 'Y', 'RB', 'LB']
                        : ['J', 'K', 'L', 'U'];
                      const typeLabel = TYPE_LABELS[ability.type] ?? ability.type;
                      const typeBadge = compact
                        ? (TYPE_SHORT_LABELS[ability.type] ??
                          typeLabel.slice(0, 3).toUpperCase())
                        : typeLabel;
                      const categoryLabel =
                        ability.category === 'physical'
                          ? 'Físico'
                          : ability.category === 'special'
                            ? 'Especial'
                            : 'Estado';
                      return (
                        <div
                          key={ability.slot}
                          className={`relative flex min-w-0 flex-1 items-center overflow-hidden rounded-lg border bg-night-850/82 backdrop-blur-[6px] ${
                            compact
                              ? 'gap-1 py-0.5 pr-1 pl-1'
                              : 'gap-1.5 py-1 pr-1.5 pl-1'
                          } ${
                            playerStats.shieldActive
                              ? 'opacity-40'
                              : ready && ability.id
                                ? 'border-[color-mix(in_srgb,var(--team)_55%,var(--color-line))]'
                                : 'border-line opacity-75'
                          }`}
                          title={
                            playerStats.shieldActive
                              ? 'Protección activa: no puedes usar otras habilidades'
                              : `${ability.name}${ability.type ? ` · ${typeLabel} · ${categoryLabel}` : ''}`
                          }
                        >
                          <span
                            className={`grid shrink-0 place-items-center rounded-sm border border-white/15 bg-white/8 font-mono font-bold leading-none text-(--team) ${
                              compact
                                ? 'h-4 min-w-4 px-0.75 text-7.36'
                                : 'h-5 min-w-5 px-1 text-8.32'
                            }`}
                          >
                            {keys[abilityIndex]}
                          </span>
                          <span
                            className={`min-w-0 flex-1 truncate font-mono font-semibold tracking-[-0.01em] text-steel-100 ${
                              compact ? 'text-8.32' : 'text-9.6'
                            }`}
                          >
                            {ability.name}
                          </span>
                          {ability.type && (
                            <span
                              className={`shrink-0 rounded-full px-1 py-px font-mono font-bold uppercase leading-none tracking-[0.03em] ${
                                compact ? 'text-6.4' : 'text-8'
                              }`}
                              style={typeStyle(ability.type)}
                              title={typeLabel}
                            >
                              {typeBadge}
                            </span>
                          )}
                          {!ready && (
                            <span className="absolute inset-0 grid place-items-center bg-night-950/74 font-mono text-11.52 font-bold text-steel-50">
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
                    {common && !common.hidden && (
                      <div
                        className={`relative flex min-w-0 flex-1 items-center overflow-hidden rounded-lg border bg-night-850/82 backdrop-blur-[6px] ${
                          compact ? 'gap-1 py-0.5 pr-1 pl-1' : 'gap-1.5 py-1 pr-1.5 pl-1'
                        } ${
                          common.passive
                            ? common.active
                              ? 'border-[color-mix(in_srgb,#8ee08a_55%,var(--color-line))]'
                              : 'border-line opacity-80'
                            : common.cooldown <= 0.001
                              ? 'border-[color-mix(in_srgb,var(--team)_55%,var(--color-line))]'
                              : 'border-line opacity-75'
                        }`}
                        title={`${common.name} · Instinto común · ${common.description}`}
                      >
                        <span
                          className={`grid shrink-0 place-items-center rounded-sm border border-white/15 bg-white/8 font-mono font-bold leading-none text-(--team) ${
                            compact
                              ? 'h-4 min-w-4 px-0.75 text-7.36'
                              : 'h-5 min-w-5 px-1 text-8.32'
                          }`}
                        >
                          {common.passive ? 'PAS' : playerStats.gamepad ? 'RT' : 'I'}
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate font-mono font-semibold tracking-[-0.01em] text-steel-100 ${
                            compact ? 'text-8.32' : 'text-9.6'
                          }`}
                        >
                          {common.short}
                        </span>
                        {common.passive && common.active && (
                          <span className="shrink-0 rounded-full bg-success-deep/70 px-1 py-px font-mono text-6.4 font-bold uppercase leading-none text-accent-soft">
                            ACT
                          </span>
                        )}
                        {!common.passive && common.cooldown > 0.001 && (
                          <span className="absolute inset-0 grid place-items-center bg-night-950/74 font-mono text-11.52 font-bold text-steel-50">
                            {common.cooldown.toFixed(1)}
                          </span>
                        )}
                        {common.passive &&
                          playerStats &&
                          playerStats.hp < playerStats.maxHp && (
                            <span className="absolute inset-0 grid place-items-center bg-night-950/55 font-mono text-8.32 font-bold text-steel-100">
                              {common.active ? 'ACT' : `${common.readyIn.toFixed(1)}s`}
                            </span>
                          )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <KillFeed
              entries={playerStats?.feed ?? []}
              compact={compact}
              pokemonNames={pokemonNames}
              ownSlot={player.slot}
            />

            {playerStats && !playerStats.alive && (
              <div className="absolute inset-0 grid place-items-center bg-night-950/46">
                <div className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-night-850/86 px-6 py-4 text-center backdrop-blur-[6px]">
                  <span className="font-display text-25.6 font-extrabold tracking-[0.16em] text-danger-100">
                    KO
                  </span>
                  <span className="font-mono text-11.2 text-steel-250">
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
        <span className="ml-1.5 font-mono text-8.8 text-steel-650 max-[760px]:hidden">
          Start / Esc
        </span>
      </button>
    </div>
  );
}
