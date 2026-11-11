import { createContext } from 'react';
import type { CommonAbilityId } from '../game/abilities';
import type { InputDeviceInfo, MenuAction } from '../game/input';
import type { MapIndexEntry } from '../game/map';
import type {
  BotDifficulty,
  LobbyPlayer,
  MatchPlayerConfig,
  MovementMode
} from '../game/multiplayer';
import type { Team } from '../game/terrain';
import type { SpriteManifest } from '../game/types';

export type BootStatus = 'loading' | 'ready' | 'error';

export interface SessionValue {
  bootStatus: BootStatus;
  bootError: string | null;
  retryBoot: () => void;
  manifest: SpriteManifest | null;
  maps: MapIndexEntry[];
  mapId: string;
  /** Equipos activos del mapa seleccionado (2-4). */
  teams: Team[];
  /** Aviso al intentar cambiar a un mapa que no admite los jugadores actuales. */
  mapNotice: string | null;
  setMapId: (id: string) => void;
  /** KOs de equipo necesarios para ganar; por defecto, `CONFIG.combat.koTarget`. */
  koTarget: number;
  setKoTarget: (value: number) => void;
  /** Si está desactivado, todas las partidas se juegan en despejado. */
  atmosphereEnabled: boolean;
  setAtmosphereEnabled: (enabled: boolean) => void;
  players: LobbyPlayer[];
  matchConfigs: MatchPlayerConfig[] | null;
  joinDevice: (device: InputDeviceInfo) => void;
  addBot: (team: Team) => void;
  fillBots: () => void;
  botDifficulty: BotDifficulty;
  setBotDifficulty: (difficulty: BotDifficulty) => void;
  setPlayerName: (slot: number, name: string) => void;
  setPlayerTeam: (slot: number, team: Team) => void;
  /** Modo de control de un jugador humano; se elige en el lobby. */
  setPlayerMovementMode: (slot: number, mode: MovementMode) => void;
  cyclePlayerMovementMode: (slot: number) => void;
  toggleTeamReady: (slot: number) => void;
  leavePlayer: (slot: number) => void;
  continueToRoster: () => boolean;
  moveCursor: (slot: number, action: MenuAction) => void;
  selectPokemon: (slot: number, pokemonId: string) => void;
  selectSkin: (slot: number, skinId: string) => void;
  cycleSkin: (slot: number, delta: number) => void;
  selectCommonAbility: (slot: number, abilityId: CommonAbilityId) => void;
  cycleCommonAbility: (slot: number, delta: number) => void;
  setRosterReady: (slot: number, ready: boolean) => void;
  toggleRosterReady: (slot: number) => void;
  resetRosterReady: () => void;
  resetPlayers: () => void;
  syncDevices: (devices: InputDeviceInfo[]) => void;
}

export const SessionContext = createContext<SessionValue | null>(null);
