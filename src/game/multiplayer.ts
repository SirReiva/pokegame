/**
 * Modelo compartido del multijugador local: equipos, puntos de aparición,
 * reparto de la pantalla y tipos que viajan entre el motor y React.
 *
 * Es un módulo puro (sin PlayCanvas ni React) para poder probar el reparto de
 * viewports y las cuentas de equipo sin levantar el motor.
 */

import type { InputDeviceInfo } from './input';
import type { Team, TerrainId } from './terrain';
import type { TerrainSpeedReason } from './terrainSpeed';
import type { AnimationName, DirectionName } from './types';

/** 1 teclado + 7 mandos, u 8 mandos. */
export const MAX_PLAYERS = 8;
/** Tope por equipo para que las dos mitades quepan en la pantalla. */
export const MAX_TEAM_SIZE = 4;

export interface TeamInfo {
  label: string;
  short: string;
  /** Color principal del equipo (anillo, badges, bordes). */
  color: string;
  /** Color oscuro para degradados y fondos. */
  dark: string;
  /** Color del anillo del jugador en el mundo, en 0-255. */
  accent: readonly [number, number, number];
  x: number;
  z: number;
  radius: number;
}

export const TEAM_INFO: Record<Team, TeamInfo> = {
  blue: {
    label: 'Equipo azul',
    short: 'Azul',
    color: '#4b9cff',
    dark: '#0d2440',
    accent: [86, 170, 255],
    x: -13.2,
    z: 13.2,
    radius: 3.6
  },
  red: {
    label: 'Equipo rojo',
    short: 'Rojo',
    color: '#ff5f63',
    dark: '#3a1116',
    accent: [255, 103, 108],
    x: 13.2,
    z: -13.2,
    radius: 3.6
  }
};

export const TEAM_ORDER: Team[] = ['blue', 'red'];

/** Huecos alrededor del nexo: cuatro por equipo, separados del pedestal. */
const SPAWN_OFFSETS: ReadonlyArray<{ x: number; z: number }> = [
  { x: 0, z: 2.05 },
  { x: 2.05, z: 0 },
  { x: 0, z: -2.05 },
  { x: -2.05, z: 0 }
];

/** Posición de aparición de un jugador dentro de la base de su equipo. */
export function spawnForTeam(team: Team, indexInTeam: number): { x: number; z: number } {
  const info = TEAM_INFO[team];
  const offset = SPAWN_OFFSETS[indexInTeam % SPAWN_OFFSETS.length];
  return { x: info.x + offset.x, z: info.z + offset.z };
}

/** Rumbo inicial hacia el centro del mapa (0 = sur, 90° = este). */
export function facingToCenter(team: Team): number {
  const info = TEAM_INFO[team];
  return Math.atan2(-info.x, -info.z);
}

/** Cámara detrás del jugador, mirando hacia el centro. */
export function cameraYawForTeam(team: Team): number {
  return facingToCenter(team) + Math.PI;
}

export function otherTeam(team: Team): Team {
  return team === 'blue' ? 'red' : 'blue';
}

export interface SplitRect {
  /** Origen X normalizado (0 = borde izquierdo). */
  x: number;
  /** Origen Y normalizado desde abajo (como el rect de PlayCanvas). */
  y: number;
  w: number;
  h: number;
}

/**
 * Rejilla de viewports para 1-8 jugadores. Se reparte por filas; la primera
 * fila de la lista es la de arriba. Con 3, 5 o 7 jugadores la última fila
 * reparte el ancho entre los que queden, para no dejar huecos muertos.
 */
export function computeSplitLayout(count: number): SplitRect[] {
  const rowsByCount: Record<number, number[]> = {
    1: [1],
    2: [2],
    3: [2, 1],
    4: [2, 2],
    5: [3, 2],
    6: [3, 3],
    7: [4, 3],
    8: [4, 4]
  };
  const rows = rowsByCount[Math.max(1, Math.min(MAX_PLAYERS, count))] ?? [1];
  const height = 1 / rows.length;
  const rects: SplitRect[] = [];
  rows.forEach((cells, rowIndex) => {
    const width = 1 / cells;
    const y = 1 - (rowIndex + 1) * height;
    for (let cell = 0; cell < cells; cell++) {
      rects.push({ x: cell * width, y, w: width, h: height });
    }
  });
  return rects.slice(0, count);
}

/** Estilo CSS de un viewport (origen arriba-izquierda). */
export function splitRectToStyle(rect: SplitRect): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: `${rect.x * 100}%`,
    top: `${(1 - rect.y - rect.h) * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`
  };
}

export interface LobbyPlayer {
  /** Plaza 1-8. No se reutiliza mientras el jugador siga en la partida. */
  slot: number;
  name: string;
  deviceId: string;
  deviceKind: InputDeviceInfo['kind'];
  deviceLabel: string;
  team: Team;
  teamReady: boolean;
  pokemonId: string;
  rosterReady: boolean;
}

export interface MatchPlayerConfig {
  slot: number;
  name: string;
  deviceId: string;
  deviceKind: InputDeviceInfo['kind'];
  team: Team;
  pokemonId: string;
}

export interface PlayerMatchStats {
  slot: number;
  name: string;
  team: Team;
  pokemonId: string;
  fps: number;
  yaw: number;
  row: number;
  direction: DirectionName;
  facing: number;
  speed: number;
  x: number;
  z: number;
  gamepad: boolean;
  animation: AnimationName;
  terrain: TerrainId;
  terrainName: string;
  terrainType: string;
  terrainSpeedMultiplier: number;
  terrainSpeedReason: TerrainSpeedReason;
}

export function countTeams(players: ReadonlyArray<Pick<LobbyPlayer, 'team'>>): Record<Team, number> {
  return {
    blue: players.filter((player) => player.team === 'blue').length,
    red: players.filter((player) => player.team === 'red').length
  };
}

/** Primera plaza libre de 1 a 8. */
export function nextFreeSlot(players: ReadonlyArray<Pick<LobbyPlayer, 'slot'>>): number | null {
  for (let slot = 1; slot <= MAX_PLAYERS; slot++) {
    if (!players.some((player) => player.slot === slot)) return slot;
  }
  return null;
}
