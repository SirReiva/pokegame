import type { CSSProperties } from 'react';
import type { InputDeviceInfo } from '../game/input';
import type { MapIndexEntry } from '../game/map';
import {
  MAX_PLAYERS,
  MAX_TEAM_SIZE,
  TEAM_INFO,
  TEAM_ORDER,
  countTeams,
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
  onChangeMap: (mapId: string) => void;
  onJoin: (device: InputDeviceInfo) => void;
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
  onReady,
  onLeave
}: {
  team: Team;
  players: LobbyPlayer[];
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
          {roster.length} / {MAX_TEAM_SIZE}
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
              <span className="font-display text-16.8 font-extrabold text-(--team)">
                {player.name}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-11.2 text-steel-500">
                <DeviceIcon
                  kind={player.deviceKind}
                  family={player.deviceFamily}
                  className="size-3.5 flex-none"
                />
                <span className="truncate">{player.deviceLabel}</span>
              </span>
              <span
                className={`font-mono text-8.96 tracking-[0.08em] uppercase ${
                  player.teamReady ? 'text-accent-soft' : 'text-steel-650'
                }`}
              >
                {player.teamReady ? 'Listo' : 'Eligiendo'}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                className={btnClass(player.teamReady ? 'accent' : 'neutral', 'tiny')}
                onClick={() => onReady(player.slot)}
              >
                {player.teamReady ? '✓ Listo' : 'Marcar listo'}
              </button>
              <button
                type="button"
                className={btnClass('ghost', 'tiny')}
                onClick={() => onLeave(player.slot)}
              >
                Salir
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
  onChangeMap,
  onJoin,
  onReady,
  onLeave,
  onContinue,
  onBack,
  onOptions,
  onEditor
}: LobbyScreenProps) {
  const counts = countTeams(players);
  const allReady = players.length > 0 && players.every((player) => player.teamReady);
  const joined = new Set(players.map((player) => player.deviceId));
  const available = devices.filter((device) => !joined.has(device.id));
  const full = players.length >= MAX_PLAYERS;

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
              <strong>← →</strong> y marca listo. Hasta 4 jugadores por equipo.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-night-750/72 px-4 py-2.5 max-[760px]:hidden">
            <span className="flex items-baseline gap-1.5 font-mono text-11.2 tracking-[0.08em] uppercase">
              <strong
                key={counts.blue}
                className="animate-pop-in font-display text-2xl leading-none text-team-blue"
              >
                {counts.blue}
              </strong>{' '}
              azul
            </span>
            <span className="font-mono text-11.2 text-steel-950">vs</span>
            <span className="flex items-baseline gap-1.5 font-mono text-11.2 tracking-[0.08em] uppercase">
              <strong
                key={counts.red}
                className="animate-pop-in font-display text-2xl leading-none text-team-red"
              >
                {counts.red}
              </strong>{' '}
              rojo
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(280px,340px)] items-start gap-4.5 max-[1050px]:grid-cols-1">
          <div className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
            {TEAM_ORDER.map((team) => (
              <TeamColumn
                key={team}
                team={team}
                players={players}
                onReady={onReady}
                onLeave={onLeave}
              />
            ))}
          </div>

          <aside className="rounded-[20px] border border-line bg-[linear-gradient(170deg,rgb(16_25_38/0.9),rgb(7_12_19/0.92))] p-4 max-[1050px]:order-first">
            {maps.length > 0 && (
              <div className="mb-4 border-b border-dashed border-line pb-3.5">
                <span className={eyebrow}>Mapa</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {maps.map((map) => (
                    <button
                      key={map.id}
                      type="button"
                      className={btnClass(map.id === mapId ? 'accent' : 'ghost', 'tiny')}
                      disabled={map.id === mapId}
                      title={map.description}
                      onClick={() => onChangeMap(map.id)}
                    >
                      {map.name}
                    </button>
                  ))}
                </div>
                <p className="mt-2 font-mono text-9.92 tracking-[0.04em] text-steel-500">
                  El mapa se carga al empezar la partida.
                </p>
              </div>
            )}

            <span className={eyebrow}>Dispositivos detectados</span>
            <h3 className="mt-0.5 text-19.2">Unirse</h3>
            {full ? (
              <p className={emptyTeam}>La partida está completa (8 jugadores).</p>
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
            <strong>{players.length}</strong> / {MAX_PLAYERS} jugadores
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
