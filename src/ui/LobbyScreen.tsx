import type { CSSProperties } from 'react';
import { commonAbilityOption } from '../game/abilities';
import type { InputDeviceInfo } from '../game/input';
import type { MapIndexEntry } from '../game/map';
import { publicUrl } from '../game/publicUrl';
import {
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_LABEL,
  KO_TARGET_OPTIONS,
  PLAYER_NAME_MAX_LENGTH,
  TEAM_INFO,
  countTeams,
  defaultPlayerName,
  maxPlayersFor,
  maxTeamSizeFor,
  type BotDifficulty,
  type LobbyPlayer
} from '../game/multiplayer';
import type { Team } from '../game/terrain';
import { Brand } from './Brand';
import { btnClass } from './buttonStyles';
import { confirmHint } from './deviceInfo';
import { DeviceIcon } from './DeviceIcon';
import { KeyPill } from './KeyPill';
import { eyebrow, stepActive, stepIdle } from './styles';

interface LobbyScreenProps {
  players: LobbyPlayer[];
  devices: InputDeviceInfo[];
  maps: MapIndexEntry[];
  mapId: string;
  teams: Team[];
  mapNotice: string | null;
  botDifficulty: BotDifficulty;
  koTarget: number;
  onChangeMap: (mapId: string) => void;
  onChangeBotDifficulty: (difficulty: BotDifficulty) => void;
  onChangeKoTarget: (value: number) => void;
  onAddBot: (team: Team) => void;
  onFillBots: () => void;
  onJoin: (device: InputDeviceInfo) => void;
  onRename: (slot: number, name: string) => void;
  onReady: (slot: number) => void;
  onLeave: (slot: number) => void;
  onContinue: () => void;
  onBack: () => void;
  onOptions: () => void;
  onEditor: () => void;
}

const overlay =
  'fixed inset-0 z-10 flex animate-fade-in items-start justify-center overflow-y-auto bg-[radial-gradient(circle_at_16%_10%,rgb(22_48_78/0.9),transparent_55%),linear-gradient(112deg,rgb(4_8_14/0.96),rgb(4_8_14/0.84)_55%,rgb(4_8_14/0.55))] p-[clamp(16px,2.4vw,32px)] backdrop-blur-[3px]';
const shell =
  'm-auto flex w-[min(1360px,100%)] animate-rise-in flex-col gap-[clamp(14px,2vh,24px)]';
const emptyTeam =
  'rounded-[14px] border border-dashed border-[color-mix(in_srgb,var(--team,#4b9cff)_28%,var(--color-line))] px-3 py-[18px] text-center text-12.48 leading-[1.45] text-steel-800';

function TeamColumn({
  team,
  players,
  maxTeamSize,
  onRename,
  onReady,
  onLeave
}: {
  team: Team;
  players: LobbyPlayer[];
  maxTeamSize: number;
  onRename: (slot: number, name: string) => void;
  onReady: (slot: number) => void;
  onLeave: (slot: number) => void;
}) {
  const info = TEAM_INFO[team];
  const roster = players.filter((player) => player.team === team);
  const style = { '--team': info.color } as CSSProperties;

  return (
    <section
      className="rounded-[20px] border border-[color-mix(in_srgb,var(--team)_34%,var(--color-line))] bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--team)_16%,transparent),transparent_60%),linear-gradient(170deg,rgb(17_26_40/0.92),rgb(8_13_21/0.92))] p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]"
      style={style}
    >
      <header className="flex items-start justify-between gap-2.5">
        <div>
          <span className={eyebrow}>Equipo</span>
          <h3 className="mt-0.5 text-xl text-(--team)">{info.label}</h3>
        </div>
        <span
          key={roster.length}
          className="animate-pop-in rounded-full border border-line px-2 py-1 font-mono text-10.88 text-steel-550"
        >
          {roster.length} / {maxTeamSize}
        </span>
      </header>

      <div className="mt-3.5 flex flex-col gap-2.5">
        {roster.length === 0 && <p className={emptyTeam}>Nadie en este equipo todavía.</p>}
        {roster.map((player) => (
          <article
            key={player.slot}
            className={`relative animate-pop-in rounded-[14px] border border-[color-mix(in_srgb,var(--team)_34%,var(--color-line))] border-l-[3px] border-l-(--team) px-3 py-2.5 transition-colors duration-200 ${
              player.teamReady
                ? 'border-[color-mix(in_srgb,var(--team)_58%,white_6%)] bg-[linear-gradient(100deg,color-mix(in_srgb,var(--team)_14%,rgb(7_12_19/0.8)),rgb(7_12_19/0.7))]'
                : 'bg-night-820/65'
            }`}
          >
            <div className="flex items-center gap-2">
              {player.isBot ? (
                <span className="min-w-0 flex-1 truncate font-display text-16.8 font-extrabold text-(--team)">
                  {player.name}
                </span>
              ) : (
                <input
                  type="text"
                  value={player.name}
                  maxLength={PLAYER_NAME_MAX_LENGTH}
                  aria-label={`Nombre del jugador ${player.slot}`}
                  title="Escribe el nombre que verás en el HUD y en el kill feed"
                  placeholder={defaultPlayerName(player.slot)}
                  spellCheck={false}
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-px font-display text-16.8 font-extrabold text-(--team) outline-none transition-colors placeholder:text-steel-700 focus:border-(--team) focus:bg-night-950/40"
                  onChange={(event) => onRename(player.slot, event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === 'Escape') {
                      event.currentTarget.blur();
                    }
                  }}
                />
              )}
              {player.isBot && (
                <span className="rounded-full border border-line px-1.5 py-px font-mono text-8 tracking-[0.08em] uppercase text-steel-400">
                  BOT
                </span>
              )}
              <span
                className={`ml-auto shrink-0 font-mono text-8.96 tracking-[0.08em] uppercase ${
                  player.teamReady ? 'text-accent-soft' : 'text-steel-650'
                }`}
              >
                {player.teamReady ? 'Listo' : 'Eligiendo'}
              </span>
            </div>

            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-11.2 text-steel-500">
              <DeviceIcon
                kind={player.deviceKind}
                family={player.deviceFamily}
                className="size-3.5 flex-none"
              />
              <span className="truncate">{player.deviceLabel}</span>
            </div>

            <div className="mt-1 font-mono text-8.96 text-steel-650">
              Instinto:{' '}
              <span className="text-steel-350">
                {commonAbilityOption(player.commonAbilityId)?.name ?? '—'}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                className={btnClass(player.teamReady ? 'accent' : 'neutral', 'tiny')}
                disabled={player.isBot}
                onClick={() => onReady(player.slot)}
              >
                {player.isBot ? '✓ Bot listo' : player.teamReady ? '✓ Listo' : 'Marcar listo'}
              </button>
              <button
                type="button"
                className={btnClass('ghost', 'tiny')}
                onClick={() => onLeave(player.slot)}
              >
                {player.isBot ? 'Quitar' : 'Salir'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function LobbyScreen({
  players,
  devices,
  maps,
  mapId,
  teams,
  mapNotice,
  botDifficulty,
  koTarget,
  onChangeMap,
  onChangeBotDifficulty,
  onChangeKoTarget,
  onAddBot,
  onFillBots,
  onJoin,
  onRename,
  onReady,
  onLeave,
  onContinue,
  onBack,
  onOptions,
  onEditor
}: LobbyScreenProps) {
  const counts = countTeams(players);
  const maxTeamSize = maxTeamSizeFor(teams.length);
  const maxPlayers = maxPlayersFor(teams);
  const hasHuman = players.some((player) => !player.isBot);
  const allReady = hasHuman && players.every((player) => player.teamReady);
  const joined = new Set(players.map((player) => player.deviceId));
  const available = devices.filter((device) => !joined.has(device.id));
  const full = players.length >= maxPlayers;
  const bots = players.filter((player) => player.isBot).length;
  const canFill = !full && teams.some((team) => counts[team] < maxTeamSize);
  const mapIndex = Math.max(
    0,
    maps.findIndex((map) => map.id === mapId)
  );
  const activeMap = maps[mapIndex];

  const stepMap = (direction: number) => {
    if (maps.length < 2) return;
    const next = (mapIndex + direction + maps.length) % maps.length;
    onChangeMap(maps[next].id);
  };

  return (
    <div className={overlay}>
      <div className={shell}>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Brand compact />

          <div className="flex flex-wrap items-center gap-3">
            <ol className="m-0 flex list-none gap-1.5 p-0" aria-label="Pasos de la configuración">
              <li className={stepActive}>1 · Equipos</li>
              <li className={stepIdle}>2 · Pokémon</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnClass('ghost', 'small')} onClick={onBack}>
                ← Menú
              </button>
              <button type="button" className={btnClass('ghost', 'small')} onClick={onEditor}>
                Editor de mapas
              </button>
              <button type="button" className={btnClass('ghost', 'small')} onClick={onOptions}>
                Opciones
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-end justify-between gap-4.5">
          <div>
            <span className={eyebrow}>Paso 1 de 2</span>
            <h2 className="mt-1 text-[clamp(1.6rem,3vw,2.4rem)]">Elige los equipos</h2>
            <p className="mt-2 max-w-[46ch] text-14.4 leading-[1.55] text-muted">
              Cada mando es un jugador. Pulsa <strong>A</strong> en un mando (o{' '}
              <strong>Espacio</strong> en el teclado) para unirte. Después cambia de lado con{' '}
              <strong>← →</strong> y marca listo. Puedes escribir el nombre de cada jugador en su
              tarjeta con el teclado. También puedes añadir bots para completar los equipos: hasta 4
              jugadores por equipo con dos equipos, y hasta 2 con tres o cuatro. El mapa elegido
              decide cuántos equipos hay (de 2 a 4).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-night-750/72 px-4 py-2.5 max-[760px]:hidden">
            {teams.map((team, index) => (
              <span key={team} className="flex items-center gap-3">
                {index > 0 && <span className="font-mono text-11.2 text-steel-950">vs</span>}
                <span className="flex items-baseline gap-1.5 font-mono text-11.2 tracking-[0.08em] uppercase">
                  <strong
                    key={counts[team]}
                    className="animate-pop-in font-display text-2xl leading-none"
                    style={{ color: TEAM_INFO[team].color }}
                  >
                    {counts[team]}
                  </strong>{' '}
                  {TEAM_INFO[team].short.toLowerCase()}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(280px,340px)] items-start gap-4.5 max-[1050px]:grid-cols-1">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4">
            {teams.map((team) => (
              <TeamColumn
                key={team}
                team={team}
                players={players}
                maxTeamSize={maxTeamSize}
                onRename={onRename}
                onReady={onReady}
                onLeave={onLeave}
              />
            ))}
          </div>

          <aside className="rounded-[20px] border border-line bg-[linear-gradient(170deg,rgb(16_25_38/0.9),rgb(7_12_19/0.92))] p-4 max-[1050px]:order-first">
            {maps.length > 0 && activeMap && (
              <div className="mb-4 border-b border-dashed border-line pb-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={eyebrow}>Mapa</span>
                  <span className="font-mono text-9.6 text-steel-500">
                    {mapIndex + 1} / {maps.length}
                  </span>
                </div>

                <div className="group relative mt-2 overflow-hidden rounded-[14px] border border-line bg-[radial-gradient(circle_at_50%_40%,rgb(22_48_78/0.45),transparent_65%),linear-gradient(160deg,rgb(10_17_26/0.95),rgb(4_8_14/0.95))]">
                  <div className="relative aspect-4/3">
                    {activeMap.preview ? (
                      <img
                        key={activeMap.id}
                        src={publicUrl(activeMap.preview)}
                        alt={`Vista previa de ${activeMap.name}`}
                        className="size-full animate-fade-in object-contain"
                        draggable={false}
                      />
                    ) : (
                      <div className="grid size-full place-items-center font-mono text-10.56 tracking-[0.08em] uppercase text-steel-600">
                        Sin vista previa
                      </div>
                    )}

                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgb(4_8_14/0.94),transparent_52%)]" />

                    {maps.length > 1 && (
                      <>
                        <button
                          type="button"
                          aria-label="Mapa anterior"
                          className="absolute top-1/2 left-2 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-night-900/85 pb-0.5 text-19.2 leading-none text-ink backdrop-blur-sm transition-[background-color,border-color,transform] duration-200 hover:scale-105 hover:border-accent/60 hover:bg-night-800"
                          onClick={() => stepMap(-1)}
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          aria-label="Mapa siguiente"
                          className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-night-900/85 pb-0.5 text-19.2 leading-none text-ink backdrop-blur-sm transition-[background-color,border-color,transform] duration-200 hover:scale-105 hover:border-accent/60 hover:bg-night-800"
                          onClick={() => stepMap(1)}
                        >
                          ›
                        </button>
                      </>
                    )}

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
                      <strong className="block font-display text-16.8/tight text-ink">
                        {activeMap.name}
                      </strong>
                      <p className="mt-1 line-clamp-2 text-11.52 leading-[1.45] text-steel-400">
                        {activeMap.description ?? 'Mapa listo para la partida.'}
                      </p>
                      <p className="mt-1 font-mono text-9.6 tracking-[0.06em] uppercase text-steel-500">
                        {(activeMap.teams ?? teams).length} equipos ·{' '}
                        {(activeMap.teams ?? teams)
                          .map((team) => TEAM_INFO[team].short)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>

                  {maps.length > 1 && (
                    <div className="flex items-center justify-center gap-1.5 border-t border-line bg-night-900/70 px-2 py-1.5">
                      {maps.map((map) => (
                        <button
                          key={map.id}
                          type="button"
                          aria-label={`Ver ${map.name}`}
                          aria-current={map.id === mapId ? 'true' : undefined}
                          className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${
                            map.id === mapId
                              ? 'w-6 bg-accent'
                              : 'w-1.5 bg-steel-900 hover:bg-steel-700'
                          }`}
                          onClick={() => onChangeMap(map.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <p className="mt-2 font-mono text-9.92 tracking-[0.04em] text-steel-500">
                  El mapa se carga al empezar la partida.
                </p>
                {mapNotice && (
                  <p className="mt-2 rounded-lg border border-danger/40 bg-danger-deep/50 px-2.5 py-2 text-10.88/normal text-danger-100">
                    {mapNotice}
                  </p>
                )}
              </div>
            )}

            <div className="mb-4 border-b border-dashed border-line pb-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className={eyebrow}>Puntuación</span>
                <span className="font-mono text-9.6 text-steel-500">
                  {koTarget} KO
                </span>
              </div>
              <h3 className="mt-0.5 text-19.2">Límite de KOs</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {KO_TARGET_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={btnClass(value === koTarget ? 'accent' : 'ghost', 'tiny')}
                    disabled={value === koTarget}
                    onClick={() => onChangeKoTarget(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <p className="mt-2 font-mono text-9.92 tracking-[0.04em] text-steel-500">
                Gana el primer equipo que alcance el límite.
              </p>
            </div>

            <div className="mb-4 border-b border-dashed border-line pb-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className={eyebrow}>Bots</span>
                {bots > 0 && (
                  <span className="font-mono text-9.6 text-steel-500">
                    {bots} en partida
                  </span>
                )}
              </div>
              <h3 className="mt-0.5 text-19.2">Añadir IA</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {BOT_DIFFICULTIES.map((difficulty) => (
                  <button
                    key={difficulty}
                    type="button"
                    className={btnClass(
                      difficulty === botDifficulty ? 'accent' : 'ghost',
                      'tiny'
                    )}
                    disabled={difficulty === botDifficulty}
                    onClick={() => onChangeBotDifficulty(difficulty)}
                  >
                    {BOT_DIFFICULTY_LABEL[difficulty]}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {teams.map((team) => (
                  <button
                    key={team}
                    type="button"
                    className={btnClass('ghost', 'tiny')}
                    disabled={counts[team] >= maxTeamSize || full}
                    onClick={() => onAddBot(team)}
                  >
                    + {TEAM_INFO[team].short}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`${btnClass('neutral', 'tiny')} mt-1.5 w-full`}
                disabled={!canFill}
                onClick={onFillBots}
              >
                Rellenar equipos
              </button>
              <p className="mt-2 font-mono text-9.92 tracking-[0.04em] text-steel-500">
                Los bots eligen Pokémon solos y no ocupan panel de pantalla.
              </p>
            </div>

            <span className={eyebrow}>Dispositivos detectados</span>
            <h3 className="mt-0.5 text-19.2">Unirse</h3>
            {full ? (
              <p className={emptyTeam}>La partida está completa ({maxPlayers} jugadores).</p>
            ) : available.length === 0 ? (
              <p className={emptyTeam}>Todos los dispositivos ya están jugando.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {available.map((device) => (
                  <div
                    className="flex items-center gap-2.5 rounded-xl border border-line bg-white/2.5 px-2.5 py-2.25"
                    key={device.id}
                  >
                    <DeviceIcon
                      kind={device.kind}
                      family={device.family}
                      className="size-4.5 flex-none"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <strong className="text-12.8">{device.label}</strong>
                      <span className="truncate font-mono text-9.28 tracking-[0.06em] uppercase text-steel-650">
                        {confirmHint(device.kind, device.family)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={btnClass('accent', 'tiny')}
                      onClick={() => onJoin(device)}
                    >
                      Unirse
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3.5 flex flex-col gap-1.5 border-t border-dashed border-line pt-3 text-11.84 text-steel-500">
              <p className="flex items-center gap-2">
                <KeyPill>A</KeyPill> unirse / confirmar
              </p>
              <p className="flex items-center gap-2">
                <KeyPill>← →</KeyPill> cambiar de equipo
              </p>
              <p className="flex items-center gap-2">
                <KeyPill>B</KeyPill> salir del equipo
              </p>
              <p className="flex items-center gap-2">
                <KeyPill>1 teclado</KeyPill> + hasta 8 mandos
              </p>
            </div>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3.5 border-t border-line px-0 pt-3.5 pb-1">
          <div className="text-13.12 text-steel-400">
            <strong>{players.length}</strong> / {maxPlayers} jugadores
            {players.length > 0 && !allReady && (
              <span className="text-muted"> · marca listo a todos para continuar</span>
            )}
            {allReady && (
              <span className="animate-fade-in font-semibold text-accent-soft">
                {' '}
                · todos listos, pulsa A
              </span>
            )}
          </div>
          <button
            type="button"
            className={btnClass('primary', 'play')}
            disabled={!allReady}
            onClick={onContinue}
          >
            Elegir Pokémon →
          </button>
        </footer>
      </div>
    </div>
  );
}
