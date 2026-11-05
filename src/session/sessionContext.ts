import { createContext } from 'react';
import type { CommonAbilityId } from '../game/abilities';
import type { InputDeviceInfo, MenuAction } from '../game/input';
import type { MapIndexEntry } from '../game/map';
import type { LobbyPlayer, BotDifficulty, MatchPlayerConfig } from '../game/multiplayer';
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
  setMapId: (id: string) => void;
  /** KOs de equipo necesarios para ganar; por defecto, `CONFIG.combat.koTarget`. */
  koTarget: number;
  setKoTarget: (value: number) => void;
  players: LobbyPlayer[];
  matchConfigs: MatchPlayerConfig[] | null;
  joinDevice: (device: InputDeviceInfo) => void;
  addBot: (team: Team) => void;
  fillBots: () => void;
  botDifficulty: BotDifficulty;
  setBotDifficulty: (difficulty: BotDifficulty) => void;
  setPlayerName: (slot: number, name: string) => void;
  setPlayerTeam: (slot: number, team: Team) => void;
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
