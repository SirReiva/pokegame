import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { InputDeviceInfo, MenuAction } from '../game/input';
import { loadMapIndex, type MapIndexEntry } from '../game/map';
import {
  MAX_PLAYERS,
  MAX_TEAM_SIZE,
  countTeams,
  nextFreeSlot,
  type LobbyPlayer,
  type MatchPlayerConfig
} from '../game/multiplayer';
import type { Team } from '../game/terrain';
import type { SpriteManifest } from '../game/types';
import { rosterColumns } from '../ui/rosterGrid';
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

function writeMapInUrl(id: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('map', id);
  window.history.replaceState(null, '', url);
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
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);

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

        const requested = new URLSearchParams(window.location.search).get('map');
        const active = mapList.find((entry) => entry.id === requested) ?? mapList[0];

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
    writeMapInUrl(next);
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

      const firstPokemon = manifestRef.current?.pokemon[0]?.id ?? '';
      commitPlayers([
        ...current,
        {
          slot,
          name: `J${slot}`,
          deviceId: device.id,
          deviceKind: device.kind,
          deviceFamily: device.family,
          deviceLabel: device.label,
          team,
          teamReady: false,
          pokemonId: firstPokemon,
          rosterReady: false
        }
      ]);
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
            ? { ...entry, team, teamReady: false }
            : entry
        )
      );
    },
    [commitPlayers]
  );

  const toggleTeamReady = useCallback(
    (slot: number) => {
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

    const firstPokemon = manifestRef.current?.pokemon[0]?.id ?? '';
    commitPlayers(
      current.map((player) => ({
        ...player,
        pokemonId: player.pokemonId || firstPokemon,
        rosterReady: false
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

      const columns = rosterColumns();
      const index = Math.max(
        0,
        list.findIndex((entry) => entry.id === player.pokemonId)
      );
      const column = index % columns;
      let nextIndex = index;

      if (action === 'left' && column > 0) nextIndex = index - 1;
      else if (action === 'right' && column < columns - 1 && index + 1 < list.length) {
        nextIndex = index + 1;
      } else if (action === 'up' && index - columns >= 0) {
        nextIndex = index - columns;
      } else if (action === 'down' && index + columns < list.length) {
        nextIndex = index + columns;
      }

      if (nextIndex === index) return;
      commitPlayers(
        current.map((entry) =>
          entry.slot === slot
            ? { ...entry, pokemonId: list[nextIndex].id, rosterReady: false }
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
            ? { ...entry, pokemonId, rosterReady: false }
            : entry
        )
      );
    },
    [commitPlayers]
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
      playersRef.current.map((player) => ({ ...player, rosterReady: false }))
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
      const kept = current.filter((player) => connected.has(player.deviceId));
      if (kept.length !== current.length) commitPlayers(kept);
    },
    [commitPlayers]
  );

  const matchConfigs = useMemo<MatchPlayerConfig[] | null>(() => {
    if (players.length === 0) return null;
    if (!players.every((player) => player.rosterReady && player.pokemonId)) return null;
    return players.map((player) => ({
      slot: player.slot,
      name: player.name,
      deviceId: player.deviceId,
      deviceKind: player.deviceKind,
      team: player.team,
      pokemonId: player.pokemonId
    }));
  }, [players]);

  const value = useMemo<SessionValue>(
    () => ({
      bootStatus,
      bootError,
      retryBoot,
      manifest,
      maps,
      mapId,
      setMapId,
      players,
      matchConfigs,
      joinDevice,
      setPlayerTeam,
      toggleTeamReady,
      leavePlayer,
      continueToRoster,
      moveCursor,
      selectPokemon,
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
      players,
      matchConfigs,
      joinDevice,
      setPlayerTeam,
      toggleTeamReady,
      leavePlayer,
      continueToRoster,
      moveCursor,
      selectPokemon,
      setRosterReady,
      toggleRosterReady,
      resetRosterReady,
      resetPlayers,
      syncDevices
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
