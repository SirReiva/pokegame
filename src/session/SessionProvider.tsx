import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import {
  COMMON_ABILITY_OPTIONS,
  DEFAULT_COMMON_ABILITY,
  hasAssignedAbilities,
  type CommonAbilityId
} from '../game/abilities';
import { CONFIG } from '../game/config';
import type { InputDeviceInfo, MenuAction } from '../game/input';
import { loadMapIndex, type MapIndexEntry } from '../game/map';
import {
  BOT_DIFFICULTY_LABEL,
  MAX_PLAYERS,
  MAX_TEAM_SIZE,
  PLAYER_NAME_MAX_LENGTH,
  countTeams,
  defaultPlayerName,
  nextFreeSlot,
  normalizePlayerName,
  type BotDifficulty,
  type LobbyPlayer,
  type MatchPlayerConfig
} from '../game/multiplayer';
import { DEFAULT_SKIN_ID, skinFor, skinsFor } from '../game/skins';
import type { Team } from '../game/terrain';
import type { SpriteManifest } from '../game/types';
import { SessionContext, type BootStatus, type SessionValue } from './sessionContext';

async function loadManifest(): Promise<SpriteManifest> {
  // El manifiesto cambia al ejecutar `pnpm sprites`; la marca evita que el
  // navegador reutilice una copia antigua sin QuickStrike u otras animaciones.
  const response = await fetch(
    `${import.meta.env.BASE_URL}sprites/manifest.json?v=${Date.now()}`
  );
  if (!response.ok) {
    throw new Error(`No se pudo cargar el manifiesto (HTTP ${response.status})`);
  }
  return (await response.json()) as SpriteManifest;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'No se pudo preparar la sesión';
}

/** Pokémon que pueden usar los bots: los que tienen un moveset real. */
function botPokemonPool(manifest: SpriteManifest) {
  const withKit = manifest.pokemon.filter((entry) =>
    hasAssignedAbilities(entry.id)
  );
  return withKit.length > 0 ? withKit : manifest.pokemon;
}

/** Primer Pokémon del manifiesto con habilidades definidas. */
function firstPlayablePokemonId(manifest: SpriteManifest | null): string {
  if (!manifest) return '';
  return (
    manifest.pokemon.find((entry) => hasAssignedAbilities(entry.id))?.id ??
    manifest.pokemon[0]?.id ??
    ''
  );
}

function makeBotPlayer(
  manifest: SpriteManifest,
  slot: number,
  team: Team,
  difficulty: BotDifficulty
): LobbyPlayer {
  const pool = botPokemonPool(manifest);
  const entry = pool[Math.floor(Math.random() * pool.length)];
  // Los bots reparten su instinto entre todas las opciones. Regeneración es
  // pasiva, pero la IA sabe buscar cobertura y esperar oculta para curarse.
  const commonAbilityId: CommonAbilityId =
    COMMON_ABILITY_OPTIONS[
      Math.floor(Math.random() * COMMON_ABILITY_OPTIONS.length)
    ].id;
  return {
    slot,
    name: `Bot ${slot}`,
    deviceId: `bot-${slot}`,
    deviceKind: 'gamepad',
    deviceFamily: null,
    deviceLabel: `Bot · ${BOT_DIFFICULTY_LABEL[difficulty]}`,
    team,
    teamReady: true,
    pokemonId: entry?.id ?? manifest.pokemon[0]?.id ?? '',
    skinId: DEFAULT_SKIN_ID,
    commonAbilityId,
    rosterReady: true,
    isBot: true,
    botDifficulty: difficulty
  };
}

/**
 * Estado que sobrevive al cambio de ruta: manifiesto, mapas y jugadores.
 * El motor de PlayCanvas no vive aquí; solo se crea al montar `/play`.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [bootStatus, setBootStatus] = useState<BootStatus>('loading');
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [manifest, setManifest] = useState<SpriteManifest | null>(null);
  const [maps, setMaps] = useState<MapIndexEntry[]>([]);
  const [mapId, setMapIdState] = useState('');
  const [koTarget, setKoTargetState] = useState<number>(CONFIG.combat.koTarget);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [botDifficulty, setBotDifficultyState] = useState<BotDifficulty>('normal');

  const manifestRef = useRef<SpriteManifest | null>(null);
  const mapsRef = useRef<MapIndexEntry[]>([]);
  const mapIdRef = useRef('');
  const playersRef = useRef<LobbyPlayer[]>([]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const mapList = await loadMapIndex();
        if (cancelled) return;

        const spriteManifest = await loadManifest();
        if (cancelled) return;

        const active = mapList[0];

        mapsRef.current = mapList;
        manifestRef.current = spriteManifest;
        mapIdRef.current = active.id;
        setMaps(mapList);
        setManifest(spriteManifest);
        setMapIdState(active.id);
        setBootStatus('ready');
      } catch (cause) {
        if (cancelled) return;
        setBootError(errorMessage(cause));
        setBootStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootAttempt]);

  const retryBoot = useCallback(() => {
    setBootStatus('loading');
    setBootError(null);
    setBootAttempt((attempt) => attempt + 1);
  }, []);

  const commitPlayers = useCallback((next: LobbyPlayer[]) => {
    playersRef.current = next;
    setPlayers(next);
  }, []);

  const setMapId = useCallback((next: string) => {
    if (next === mapIdRef.current) return;
    if (!mapsRef.current.some((entry) => entry.id === next)) return;
    mapIdRef.current = next;
    setMapIdState(next);
  }, []);

  const setKoTarget = useCallback((next: number) => {
    if (!Number.isFinite(next) || next <= 0) return;
    setKoTargetState(Math.floor(next));
  }, []);

  const joinDevice = useCallback(
    (device: InputDeviceInfo) => {
      const current = playersRef.current;
      if (current.length >= MAX_PLAYERS) return;
      if (current.some((player) => player.deviceId === device.id)) return;

      const counts = countTeams(current);
      let team: Team = 'blue';
      if (counts.blue <= counts.red && counts.blue < MAX_TEAM_SIZE) {
        team = 'blue';
      } else if (counts.red < MAX_TEAM_SIZE) {
        team = 'red';
      } else {
        return;
      }

      const slot = nextFreeSlot(current);
      if (slot === null) return;

      const firstPokemon = firstPlayablePokemonId(manifestRef.current);
      commitPlayers([
        ...current,
        {
          slot,
          name: defaultPlayerName(slot),
          deviceId: device.id,
          deviceKind: device.kind,
          deviceFamily: device.family,
          deviceLabel: device.label,
          team,
          teamReady: false,
          pokemonId: firstPokemon,
          skinId: DEFAULT_SKIN_ID,
          commonAbilityId: DEFAULT_COMMON_ABILITY,
          rosterReady: false
        }
      ]);
    },
    [commitPlayers]
  );

  const setPlayerName = useCallback(
    (slot: number, name: string) => {
      const current = playersRef.current;
      const player = current.find((entry) => entry.slot === slot);
      if (!player || player.isBot) return;
      const nextName = name.slice(0, PLAYER_NAME_MAX_LENGTH);
      if (player.name === nextName) return;
      commitPlayers(
        current.map((entry) =>
          entry.slot === slot ? { ...entry, name: nextName } : entry
        )
      );
    },
    [commitPlayers]
  );

  const setPlayerTeam = useCallback(
    (slot: number, team: Team) => {
      const current = playersRef.current;
      const player = current.find((entry) => entry.slot === slot);
      if (!player) return;
      const counts = countTeams(current);
      if (team !== player.team && counts[team] >= MAX_TEAM_SIZE) return;
      commitPlayers(
        current.map((entry) =>
          entry.slot === slot && entry.team !== team
            ? { ...entry, team, teamReady: entry.isBot ? true : false }
            : entry
        )
      );
    },
    [commitPlayers]
  );

  const addBot = useCallback(
    (team: Team) => {
      const current = playersRef.current;
      const manifest = manifestRef.current;
      if (!manifest || manifest.pokemon.length === 0) return;
      if (current.length >= MAX_PLAYERS) return;
      if (countTeams(current)[team] >= MAX_TEAM_SIZE) return;
      const slot = nextFreeSlot(current);
      if (slot === null) return;
      commitPlayers([
        ...current,
        makeBotPlayer(manifest, slot, team, botDifficulty)
      ]);
    },
    [botDifficulty, commitPlayers]
  );

  const fillBots = useCallback(() => {
    const current = playersRef.current;
    const manifest = manifestRef.current;
    if (!manifest || manifest.pokemon.length === 0) return;

    const next = [...current];
    for (const team of ['blue', 'red'] as const) {
      while (next.length < MAX_PLAYERS && countTeams(next)[team] < MAX_TEAM_SIZE) {
        const slot = nextFreeSlot(next);
        if (slot === null) break;
        next.push(makeBotPlayer(manifest, slot, team, botDifficulty));
      }
    }
    if (next.length !== current.length) commitPlayers(next);
  }, [botDifficulty, commitPlayers]);

  const setBotDifficulty = useCallback(
    (difficulty: BotDifficulty) => {
      setBotDifficultyState(difficulty);
      commitPlayers(
        playersRef.current.map((player) =>
          player.isBot
            ? {
                ...player,
                botDifficulty: difficulty,
                deviceLabel: `Bot · ${BOT_DIFFICULTY_LABEL[difficulty]}`
              }
            : player
        )
      );
    },
    [commitPlayers]
  );

  const toggleTeamReady = useCallback(
    (slot: number) => {
      const player = playersRef.current.find((entry) => entry.slot === slot);
      if (!player || player.isBot) return;
      commitPlayers(
        playersRef.current.map((entry) =>
          entry.slot === slot ? { ...entry, teamReady: !entry.teamReady } : entry
        )
      );
    },
    [commitPlayers]
  );

  const leavePlayer = useCallback(
    (slot: number) => {
      commitPlayers(playersRef.current.filter((entry) => entry.slot !== slot));
    },
    [commitPlayers]
  );

  const continueToRoster = useCallback(() => {
    const current = playersRef.current;
    if (current.length === 0 || !current.every((player) => player.teamReady)) {
      return false;
    }
    // Una partida siempre necesita al menos una vista humana.
    if (!current.some((player) => !player.isBot)) return false;

    const firstPokemon = firstPlayablePokemonId(manifestRef.current);
    commitPlayers(
      current.map((player) => ({
        ...player,
        name: player.isBot
          ? player.name
          : normalizePlayerName(player.name, player.slot),
        pokemonId: player.pokemonId || firstPokemon,
        skinId: player.skinId ?? DEFAULT_SKIN_ID,
        commonAbilityId: player.commonAbilityId ?? DEFAULT_COMMON_ABILITY,
        // Los bots ya están listos: no deben bloquear el paso al roster ni la
        // partida, y su selección no se toca al volver a elegir humanos.
        teamReady: player.isBot ? true : player.teamReady,
        rosterReady: player.isBot ? true : false
      }))
    );
    return true;
  }, [commitPlayers]);

  const moveCursor = useCallback(
    (slot: number, action: MenuAction) => {
      const current = playersRef.current;
      const player = current.find((entry) => entry.slot === slot);
      const list = manifestRef.current?.pokemon ?? [];
      if (!player || player.rosterReady || list.length === 0) return;

      const index = Math.max(
        0,
        list.findIndex((entry) => entry.id === player.pokemonId)
      );
      const delta =
        action === 'left' || action === 'up'
          ? -1
          : action === 'right' || action === 'down'
            ? 1
            : 0;
      if (delta === 0) return;

      // El carrusel es circular: al pasar del último vuelve al primero y al
      // retroceder desde el primero salta al último. Se saltan los Pokémon sin
      // habilidades asignadas, que aparecen deshabilitados en el selector.
      const step = delta > 0 ? 1 : -1;
      let nextIndex = index;
      for (let attempt = 0; attempt < list.length; attempt++) {
        nextIndex = (nextIndex + step + list.length) % list.length;
        if (hasAssignedAbilities(list[nextIndex].id)) break;
      }
      if (
        nextIndex === index ||
        !hasAssignedAbilities(list[nextIndex].id)
      ) {
        return;
      }
      commitPlayers(
        current.map((entry) =>
          entry.slot === slot
            ? {
                ...entry,
                pokemonId: list[nextIndex].id,
                // Los aspectos son propios de cada especie: al cambiar de
                // Pokémon se vuelve al normal para no heredar un shiny ajeno.
                skinId: DEFAULT_SKIN_ID,
                rosterReady: false
              }
            : entry
        )
      );
    },
    [commitPlayers]
  );

  const selectPokemon = useCallback(
    (slot: number, pokemonId: string) => {
      commitPlayers(
        playersRef.current.map((entry) =>
          entry.slot === slot && entry.pokemonId !== pokemonId
            ? { ...entry, pokemonId, skinId: DEFAULT_SKIN_ID, rosterReady: false }
            : entry
        )
      );
    },
    [commitPlayers]
  );

  const selectSkin = useCallback(
    (slot: number, skinId: string) => {
      commitPlayers(
        playersRef.current.map((entry) =>
          entry.slot === slot && entry.skinId !== skinId
            ? { ...entry, skinId, rosterReady: false }
            : entry
        )
      );
    },
    [commitPlayers]
  );

  const cycleSkin = useCallback(
    (slot: number, delta: number) => {
      const player = playersRef.current.find((entry) => entry.slot === slot);
      const entry = manifestRef.current?.pokemon.find(
        (candidate) => candidate.id === player?.pokemonId
      );
      if (!player || !entry || delta === 0) return;

      const skins = skinsFor(entry);
      if (skins.length < 2) return;
      const currentId = skinFor(entry, player.skinId).id;
      const index = Math.max(
        0,
        skins.findIndex((skin) => skin.id === currentId)
      );
      const next = (index + delta + skins.length) % skins.length;
      selectSkin(slot, skins[next].id);
    },
    [selectSkin]
  );

  const selectCommonAbility = useCallback(
    (slot: number, abilityId: CommonAbilityId) => {
      commitPlayers(
        playersRef.current.map((entry) =>
          entry.slot === slot && entry.commonAbilityId !== abilityId
            ? { ...entry, commonAbilityId: abilityId, rosterReady: false }
            : entry
        )
      );
    },
    [commitPlayers]
  );

  const cycleCommonAbility = useCallback(
    (slot: number, delta: number) => {
      const player = playersRef.current.find((entry) => entry.slot === slot);
      if (!player || delta === 0) return;
      const index = Math.max(
        0,
        COMMON_ABILITY_OPTIONS.findIndex((option) => option.id === player.commonAbilityId)
      );
      const next = (index + delta + COMMON_ABILITY_OPTIONS.length) % COMMON_ABILITY_OPTIONS.length;
      selectCommonAbility(slot, COMMON_ABILITY_OPTIONS[next].id);
    },
    [selectCommonAbility]
  );

  const setRosterReady = useCallback(
    (slot: number, ready: boolean) => {
      commitPlayers(
        playersRef.current.map((entry) =>
          entry.slot === slot ? { ...entry, rosterReady: ready } : entry
        )
      );
    },
    [commitPlayers]
  );

  const toggleRosterReady = useCallback(
    (slot: number) => {
      const player = playersRef.current.find((entry) => entry.slot === slot);
      if (!player) return;
      setRosterReady(slot, !player.rosterReady);
    },
    [setRosterReady]
  );

  const resetRosterReady = useCallback(() => {
    commitPlayers(
      playersRef.current.map((player) =>
        player.isBot ? player : { ...player, rosterReady: false }
      )
    );
  }, [commitPlayers]);

  const resetPlayers = useCallback(() => commitPlayers([]), [commitPlayers]);

  const syncDevices = useCallback(
    (devices: InputDeviceInfo[]) => {
      // La lista siempre incluye el teclado, así que está vacía solo antes del
      // primer poll. No se debe interpretar como "todos desconectados".
      if (devices.length === 0) return;
      const connected = new Set(devices.map((device) => device.id));
      const current = playersRef.current;
      const kept = current.filter(
        (player) => player.isBot || connected.has(player.deviceId)
      );
      if (kept.length !== current.length) commitPlayers(kept);
    },
    [commitPlayers]
  );

  const matchConfigs = useMemo<MatchPlayerConfig[] | null>(() => {
    if (players.length === 0) return null;
    if (!players.some((player) => !player.isBot)) return null;
    if (!players.every((player) => player.rosterReady && player.pokemonId)) return null;
    return players.map((player) => {
      const entry = manifest?.pokemon.find(
        (candidate) => candidate.id === player.pokemonId
      );
      return {
        slot: player.slot,
        name: normalizePlayerName(player.name, player.slot),
        deviceId: player.deviceId,
        deviceKind: player.deviceKind,
        team: player.team,
        pokemonId: player.pokemonId,
        // Se normaliza contra el manifiesto para que una skin retirada en una
        // regeneración de sprites no impida cargar la partida.
        skinId: entry
          ? skinFor(entry, player.skinId).id
          : (player.skinId ?? DEFAULT_SKIN_ID),
        commonAbilityId: player.commonAbilityId,
        isBot: player.isBot,
        botDifficulty: player.botDifficulty
      };
    });
  }, [manifest, players]);

  const value = useMemo<SessionValue>(
    () => ({
      bootStatus,
      bootError,
      retryBoot,
      manifest,
      maps,
      mapId,
      setMapId,
      koTarget,
      setKoTarget,
      players,
      matchConfigs,
      joinDevice,
      addBot,
      fillBots,
      botDifficulty,
      setBotDifficulty,
      setPlayerName,
      setPlayerTeam,
      toggleTeamReady,
      leavePlayer,
      continueToRoster,
      moveCursor,
      selectPokemon,
      selectSkin,
      cycleSkin,
      selectCommonAbility,
      cycleCommonAbility,
      setRosterReady,
      toggleRosterReady,
      resetRosterReady,
      resetPlayers,
      syncDevices
    }),
    [
      bootStatus,
      bootError,
      retryBoot,
      manifest,
      maps,
      mapId,
      setMapId,
      koTarget,
      setKoTarget,
      players,
      matchConfigs,
      joinDevice,
      addBot,
      fillBots,
      botDifficulty,
      setBotDifficulty,
      setPlayerName,
      setPlayerTeam,
      toggleTeamReady,
      leavePlayer,
      continueToRoster,
      moveCursor,
      selectPokemon,
      selectSkin,
      cycleSkin,
      selectCommonAbility,
      cycleCommonAbility,
      setRosterReady,
      toggleRosterReady,
      resetRosterReady,
      resetPlayers,
      syncDevices
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
