import type { CSSProperties } from "react";
import type { InputDeviceInfo } from "../game/input";
import type { MapIndexEntry } from "../game/map";
import { publicUrl } from "../game/publicUrl";
import {
  GAME_MODE_IDS,
  GAME_MODE_INFO,
  TIME_LIMIT_OPTIONS,
  type GameModeId,
  type ModeSettingValue,
  type ModeSettings,
} from "../game/modes";
import {
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_LABEL,
  MOVEMENT_MODES,
  MOVEMENT_MODE_LABEL,
  PLAYER_NAME_MAX_LENGTH,
  TEAM_INFO,
  countTeams,
  defaultPlayerName,
  maxPlayersFor,
  maxTeamSizeFor,
  type BotDifficulty,
  type LobbyPlayer,
  type MovementMode,
} from "../game/multiplayer";
import type { Team } from "../game/terrain";
import { Brand } from "./Brand";
import { btnClass } from "./buttonStyles";
import { confirmHint } from "./deviceInfo";
import { DeviceIcon } from "./DeviceIcon";
import { KeyPill } from "./KeyPill";
import { OnScreenKeyboard, type NameEditorView } from "./OnScreenKeyboard";
import { eyebrow, stepActive, stepIdle } from "./styles";

interface LobbyScreenProps {
  players: LobbyPlayer[];
  devices: InputDeviceInfo[];
  maps: MapIndexEntry[];
  mapId: string;
  teams: Team[];
  mapNotice: string | null;
  botDifficulty: BotDifficulty;
  modeId: GameModeId;
  modeSettings: ModeSettings;
  timeLimitSeconds: number;
  atmosphereEnabled: boolean;
  onChangeMap: (mapId: string) => void;
  onChangeBotDifficulty: (difficulty: BotDifficulty) => void;
  onChangeModeId: (id: GameModeId) => void;
  onChangeModeSetting: (id: string, value: ModeSettingValue) => void;
  onChangeTimeLimitSeconds: (value: number) => void;
  onChangeAtmosphereEnabled: (enabled: boolean) => void;
  onAddBot: (team: Team) => void;
  onFillBots: () => void;
  onJoin: (device: InputDeviceInfo) => void;
  onRename: (slot: number, name: string) => void;
  onSetMovementMode: (slot: number, mode: MovementMode) => void;
  onReady: (slot: number) => void;
  onLeave: (slot: number) => void;
  onContinue: () => void;
  onBack: () => void;
  onOptions: () => void;
  onEditor: () => void;
  nameEditor: NameEditorView | null;
  onKeyboardPress: (row: number, col: number) => void;
  onKeyboardClose: () => void;
}

const overlay =
  "fixed inset-0 z-10 flex animate-fade-in items-start justify-center overflow-y-auto bg-[radial-gradient(circle_at_16%_10%,rgb(22_48_78/0.9),transparent_55%),linear-gradient(112deg,rgb(4_8_14/0.96),rgb(4_8_14/0.84)_55%,rgb(4_8_14/0.55))] p-[clamp(16px,2.4vw,32px)] backdrop-blur-[3px]";
const shell =
  "flex min-h-full w-[min(2360px,100%)] animate-rise-in flex-col gap-[clamp(12px,1.8vh,20px)]";
const card =
  "min-w-0 rounded-[18px] border border-line bg-[linear-gradient(170deg,rgb(16_25_38/0.9),rgb(7_12_19/0.92))] p-3.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]";
const note =
  "mt-2 font-mono text-9.92 tracking-[0.04em] text-steel-500";
const emptyTeam =
  "rounded-[14px] border border-dashed border-[color-mix(in_srgb,var(--team,#4b9cff)_28%,var(--color-line))] px-3 py-[18px] text-center text-12.48 leading-[1.45] text-steel-800";

function TeamColumn({
  team,
  players,
  maxTeamSize,
  nameEditor,
  onKeyboardPress,
  onKeyboardClose,
  onRename,
  onSetMovementMode,
  onReady,
  onLeave,
}: {
  team: Team;
  players: LobbyPlayer[];
  maxTeamSize: number;
  nameEditor: NameEditorView | null;
  onKeyboardPress: (row: number, col: number) => void;
  onKeyboardClose: () => void;
  onRename: (slot: number, name: string) => void;
  onSetMovementMode: (slot: number, mode: MovementMode) => void;
  onReady: (slot: number) => void;
  onLeave: (slot: number) => void;
}) {
  const info = TEAM_INFO[team];
  const roster = players.filter((player) => player.team === team);
  const style = { "--team": info.color } as CSSProperties;

  return (
    <section
      className="flex min-w-0 flex-1 basis-55 max-w-175 flex-col rounded-[20px] border border-[color-mix(in_srgb,var(--team)_34%,var(--color-line))] bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--team)_16%,transparent),transparent_60%),linear-gradient(170deg,rgb(17_26_40/0.92),rgb(8_13_21/0.92))] p-3.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]"
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

      <div className="mt-3 flex flex-1 flex-col gap-2.5">
        {roster.length === 0 && (
          <p className={emptyTeam}>Nadie en este equipo todavía.</p>
        )}
        {roster.map((player) => (
          <article
            key={player.slot}
            className={`relative animate-pop-in rounded-[14px] border border-[color-mix(in_srgb,var(--team)_34%,var(--color-line))] border-l-[3px] border-l-(--team) px-3 py-2.5 transition-colors duration-200 ${
              player.teamReady
                ? "border-[color-mix(in_srgb,var(--team)_58%,white_6%)] bg-[linear-gradient(100deg,color-mix(in_srgb,var(--team)_14%,rgb(7_12_19/0.8)),rgb(7_12_19/0.7))]"
                : "bg-night-820/65"
            } ${
              nameEditor?.slot === player.slot
                ? "ring-2 ring-accent/80 shadow-[0_0_24px_rgb(75_156_255/0.22)]"
                : ""
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
                  onChange={(event) =>
                    onRename(player.slot, event.target.value)
                  }
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") {
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
                  player.teamReady ? "text-accent-soft" : "text-steel-650"
                }`}
              >
                {player.teamReady ? "Listo" : "Eligiendo"}
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

            {nameEditor?.slot === player.slot && (
              <OnScreenKeyboard
                editor={nameEditor}
                onPress={onKeyboardPress}
                onClose={onKeyboardClose}
              />
            )}

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-8.96 text-steel-650">
                Movimiento:
              </span>
              {player.isBot ? (
                <span className="font-mono text-8.96 text-steel-350">
                  {MOVEMENT_MODE_LABEL.normal}
                </span>
              ) : (
                MOVEMENT_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={player.movementMode === mode}
                    title={
                      mode === "normal"
                        ? "El Pokémon gira hacia donde camina"
                        : "El Pokémon mira hacia la cámara; el eje Y avanza o retrocede y el eje X desplaza lateralmente"
                    }
                    className={btnClass(
                      player.movementMode === mode ? "accent" : "ghost",
                      "tiny",
                    )}
                    onClick={() => onSetMovementMode(player.slot, mode)}
                  >
                    {MOVEMENT_MODE_LABEL[mode]}
                  </button>
                ))
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                className={btnClass(
                  player.teamReady ? "accent" : "neutral",
                  "tiny",
                )}
                disabled={player.isBot}
                onClick={() => onReady(player.slot)}
              >
                {player.isBot
                  ? "✓ Bot listo"
                  : player.teamReady
                    ? "✓ Listo"
                    : "Marcar listo"}
              </button>
              <button
                type="button"
                className={btnClass("ghost", "tiny")}
                onClick={() => onLeave(player.slot)}
              >
                {player.isBot ? "Quitar" : "Salir"}
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
  modeId,
  modeSettings,
  timeLimitSeconds,
  atmosphereEnabled,
  onChangeMap,
  onChangeBotDifficulty,
  onChangeModeId,
  onChangeModeSetting,
  onChangeTimeLimitSeconds,
  onChangeAtmosphereEnabled,
  onAddBot,
  onFillBots,
  onJoin,
  onRename,
  onSetMovementMode,
  onReady,
  onLeave,
  onContinue,
  onBack,
  onOptions,
  onEditor,
  nameEditor,
  onKeyboardPress,
  onKeyboardClose,
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
    maps.findIndex((map) => map.id === mapId),
  );
  const activeMap = maps[mapIndex];
  const activeMode = GAME_MODE_INFO[modeId];

  const stepMap = (direction: number) => {
    if (maps.length < 2) return;
    const next = (mapIndex + direction + maps.length) % maps.length;
    onChangeMap(maps[next].id);
  };

  return (
    <div className={overlay}>
      <div className={shell}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Brand compact />

          <div className="flex flex-wrap items-center gap-3">
            <ol
              className="m-0 flex list-none gap-1.5 p-0"
              aria-label="Pasos de la configuración"
            >
              <li className={stepActive}>1 · Equipos</li>
              <li className={stepIdle}>2 · Pokémon</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnClass("ghost", "small")}
                onClick={onBack}
              >
                ← Menú
              </button>
              <button
                type="button"
                className={btnClass("ghost", "small")}
                onClick={onEditor}
              >
                Editor de mapas
              </button>
              <button
                type="button"
                className={btnClass("ghost", "small")}
                onClick={onOptions}
              >
                Opciones
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className={eyebrow}>Paso 1 de 2</span>
            <h2 className="mt-0.5 text-[clamp(1.5rem,2.4vw,2.2rem)]">
              Elige los equipos
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-night-750/72 px-4 py-2.5 max-[760px]:hidden">
              {teams.map((team, index) => (
                <span key={team} className="flex items-center gap-3">
                  {index > 0 && (
                    <span className="font-mono text-11.2 text-steel-950">vs</span>
                  )}
                  <span className="flex items-baseline gap-1.5 font-mono text-11.2 tracking-[0.08em] uppercase">
                    <strong
                      key={counts[team]}
                      className="animate-pop-in font-display text-2xl leading-none"
                      style={{ color: TEAM_INFO[team].color }}
                    >
                      {counts[team]}
                    </strong>{" "}
                    {TEAM_INFO[team].short.toLowerCase()}
                  </span>
                </span>
              ))}
            </div>
            <button
              type="button"
              className={btnClass("primary", "play")}
              disabled={!allReady}
              onClick={onContinue}
            >
              Elegir Pokémon →
            </button>
          </div>
        </div>

        <div className="grid flex-1 items-start gap-4 max-[1050px]:grid-cols-1 min-[1051px]:grid-cols-[minmax(0,1fr)_minmax(300px,340px)] min-[1900px]:grid-cols-[minmax(0,1fr)_minmax(680px,860px)] min-[1900px]:items-stretch">
          <div className="flex flex-wrap justify-center gap-3.5">
            {teams.map((team) => (
              <TeamColumn
                key={team}
                team={team}
                players={players}
                maxTeamSize={maxTeamSize}
                nameEditor={nameEditor}
                onKeyboardPress={onKeyboardPress}
                onKeyboardClose={onKeyboardClose}
                onRename={onRename}
                onSetMovementMode={onSetMovementMode}
                onReady={onReady}
                onLeave={onLeave}
              />
            ))}
          </div>

          <aside className="flex min-w-0 flex-col gap-3 max-[1050px]:order-first min-[1900px]:grid min-[1900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px] min-[1900px]:content-start min-[1900px]:items-start">
            {maps.length > 0 && activeMap && (
              <section
                className={`${card} min-[1900px]:col-span-2 min-[1900px]:col-start-1 min-[1900px]:row-start-1 min-[1900px]:flex min-[1900px]:min-w-0 min-[1900px]:gap-3.5`}
              >
                <div className="group relative overflow-hidden rounded-[14px] border border-line bg-[radial-gradient(circle_at_50%_40%,rgb(22_48_78/0.45),transparent_65%),linear-gradient(160deg,rgb(10_17_26/0.95),rgb(4_8_14/0.95))] min-[1900px]:w-65 min-[1900px]:flex-none">
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
                  </div>

                  {maps.length > 1 && (
                    <div className="flex items-center justify-center gap-1.5 border-t border-line bg-night-900/70 px-2 py-1.5">
                      {maps.map((map) => (
                        <button
                          key={map.id}
                          type="button"
                          aria-label={`Ver ${map.name}`}
                          aria-current={map.id === mapId ? "true" : undefined}
                          className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${
                            map.id === mapId
                              ? "w-6 bg-accent"
                              : "w-1.5 bg-steel-900 hover:bg-steel-700"
                          }`}
                          onClick={() => onChangeMap(map.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex min-w-0 flex-col min-[1900px]:mt-0 min-[1900px]:flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={eyebrow}>Mapa</span>
                    <span className="font-mono text-9.6 text-steel-500">
                      {mapIndex + 1} / {maps.length}
                    </span>
                  </div>
                  <h3 className="mt-0.5 text-19.2/tight">{activeMap.name}</h3>
                  <p className="mt-1 line-clamp-3 text-11.52 leading-[1.45] text-steel-400">
                    {activeMap.description ?? "Mapa listo para la partida."}
                  </p>
                  <p className="mt-1 font-mono text-9.6 tracking-[0.06em] uppercase text-steel-500">
                    {(activeMap.teams ?? teams).length} equipos ·{" "}
                    {(activeMap.teams ?? teams)
                      .map((team) => TEAM_INFO[team].short)
                      .join(" · ")}
                  </p>
                  <div className="min-[1900px]:mt-auto">
                    <p className={note}>El mapa se carga al empezar la partida.</p>
                    {mapNotice && (
                      <p className="mt-2 rounded-lg border border-danger/40 bg-danger-deep/50 px-2.5 py-2 text-10.88/normal text-danger-100">
                        {mapNotice}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            <div className="contents">
              <section
                className={`${card} min-[1900px]:col-start-1 min-[1900px]:row-start-2`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={eyebrow}>Modo de juego</span>
                  <span className="font-mono text-9.6 text-steel-500">
                    {activeMode.short}
                  </span>
                </div>
                <h3 className="mt-0.5 text-19.2">Reglas de la partida</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {GAME_MODE_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={btnClass(id === modeId ? "accent" : "ghost", "tiny")}
                      disabled={id === modeId}
                      onClick={() => onChangeModeId(id)}
                    >
                      {GAME_MODE_INFO[id].short}
                    </button>
                  ))}
                </div>
                <p className={note}>{activeMode.description}</p>

                <div className="mt-2.5 border-t border-line/70 pt-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={eyebrow}>Tiempo máximo</span>
                    <span className="font-mono text-9.6 text-steel-500">
                      {timeLimitSeconds > 0
                        ? `${timeLimitSeconds / 60} min`
                        : "Sin límite"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {TIME_LIMIT_OPTIONS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={btnClass(
                          value === timeLimitSeconds ? "accent" : "ghost",
                          "tiny",
                        )}
                        disabled={value === timeLimitSeconds}
                        onClick={() => onChangeTimeLimitSeconds(value)}
                      >
                        {value / 60} min
                      </button>
                    ))}
                  </div>
                  <p className={note}>
                    Al agotarse, cada modo decide la victoria con su marcador.
                  </p>
                </div>

                <div className="mt-2.5 border-t border-line/70 pt-2.5">
                  {activeMode.settings.map((setting, settingIndex) => {
                    const value =
                      modeSettings[setting.id] ?? setting.defaultValue;
                    const selected =
                      setting.options.find((option) => option.value === value) ??
                      setting.options[0];
                    return (
                      <div
                        key={setting.id}
                        className={
                          settingIndex === 0
                            ? ""
                            : "mt-2.5 border-t border-line/70 pt-2.5"
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={eyebrow}>{setting.label}</span>
                          <span className="font-mono text-9.6 text-steel-500">
                            {selected?.label ?? "—"}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {setting.options.map((option, optionIndex) => (
                            <button
                              key={`${setting.id}-${optionIndex}`}
                              type="button"
                              className={btnClass(
                                option.value === value ? "accent" : "ghost",
                                "tiny",
                              )}
                              disabled={option.value === value}
                              onClick={() =>
                                onChangeModeSetting(setting.id, option.value)
                              }
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        {setting.description && (
                          <p className={note}>{setting.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section
                className={`${card} min-[1900px]:col-start-2 min-[1900px]:row-start-2`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={eyebrow}>Clima</span>
                  <span className="font-mono text-9.6 text-steel-500">
                    {atmosphereEnabled ? "Aleatorio" : "Despejado"}
                  </span>
                </div>
                <h3 className="mt-0.5 text-19.2">Cambios atmosféricos</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={btnClass(
                      atmosphereEnabled ? "ghost" : "accent",
                      "tiny",
                    )}
                    disabled={!atmosphereEnabled}
                    onClick={() => onChangeAtmosphereEnabled(false)}
                  >
                    Desactivado
                  </button>
                  <button
                    type="button"
                    className={btnClass(
                      atmosphereEnabled ? "accent" : "ghost",
                      "tiny",
                    )}
                    disabled={atmosphereEnabled}
                    onClick={() => onChangeAtmosphereEnabled(true)}
                  >
                    Aleatorio
                  </button>
                </div>
                <p className={note}>
                  Desactivado: siempre despejado. Activado: cada partida sortea
                  un clima.
                </p>
              </section>
            </div>

            <div className="contents">
              <section
                className={`${card} min-[1900px]:col-start-3 min-[1900px]:row-start-1`}
              >
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
                        difficulty === botDifficulty ? "accent" : "ghost",
                        "tiny",
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
                      className={btnClass("ghost", "tiny")}
                      disabled={counts[team] >= maxTeamSize || full}
                      onClick={() => onAddBot(team)}
                    >
                      + {TEAM_INFO[team].short}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={`${btnClass("neutral", "tiny")} mt-1.5 w-full`}
                  disabled={!canFill}
                  onClick={onFillBots}
                >
                  Rellenar equipos
                </button>
                <p className={note}>
                  Los bots eligen Pokémon solos y no ocupan panel de pantalla.
                </p>
              </section>

              <section
                className={`${card} min-[1900px]:col-start-3 min-[1900px]:row-start-2`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={eyebrow}>Dispositivos detectados</span>
                  <span className="font-mono text-9.6 text-steel-500">
                    {available.length} libres
                  </span>
                </div>
                <h3 className="mt-0.5 text-19.2">Unirse</h3>
                {full ? (
                  <p className={`${emptyTeam} mt-2`}>
                    La partida está completa ({maxPlayers} jugadores).
                  </p>
                ) : available.length === 0 ? (
                  <p className={`${emptyTeam} mt-2`}>
                    Todos los dispositivos ya están jugando.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2">
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
                          className={btnClass("accent", "tiny")}
                          onClick={() => onJoin(device)}
                        >
                          Unirse
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-0 pt-3 pb-1">
          <span className="shrink-0 font-mono text-10.56 tracking-[0.19em] uppercase text-muted">
            Controles
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-11.84 text-steel-500">
            <span className="inline-flex items-center gap-1.5">
              <KeyPill>A</KeyPill> unirse / confirmar
            </span>
            <span className="inline-flex items-center gap-1.5">
              <KeyPill>← →</KeyPill> cambiar de equipo
            </span>
            <span className="inline-flex items-center gap-1.5">
              <KeyPill>RB / LB</KeyPill> cambiar de mapa
            </span>
            <span className="inline-flex items-center gap-1.5">
              <KeyPill>X</KeyPill> escribir el nombre
            </span>
            <span className="inline-flex items-center gap-1.5">
              <KeyPill>Y</KeyPill> modo de movimiento
              <span className="text-steel-700">(Tab / F)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <KeyPill>B</KeyPill> salir del equipo
            </span>
            <span className="inline-flex items-center gap-1.5">
              <KeyPill>1 teclado</KeyPill> + hasta 8 mandos
            </span>
          </div>
          <div className="ml-auto text-13.12 text-steel-400">
            <strong>{players.length}</strong> / {maxPlayers} jugadores
            {players.length > 0 && !allReady && (
              <span className="text-muted">
                {" "}
                · marca listo a todos para continuar
              </span>
            )}
            {allReady && (
              <span className="animate-fade-in font-semibold text-accent-soft">
                {" "}
                · todos listos, pulsa A
              </span>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
