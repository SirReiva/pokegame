/**
 * Modelo compartido del multijugador local: equipos, puntos de aparición,
 * reparto de la pantalla y tipos que viajan entre el motor y React.
 *
 * Es un módulo puro (sin PlayCanvas ni React) para poder probar el reparto de
 * viewports y las cuentas de equipo sin levantar el motor.
 */

import type { AbilitySlot, BuffStat, CommonAbilityId } from './abilities';
import type { InputDeviceInfo } from './input';
import { respawnsForTeam, type Team, type TerrainId } from './terrain';
import type { TerrainRelationReason, TerrainSpeedReason } from './terrainSpeed';
import type { AnimationName, DirectionName } from './types';
import type { XpBreakdown, XpRank } from './xp';

/** 1 teclado + 7 mandos, u 8 mandos. */
export const MAX_PLAYERS = 8;
/** Tope por equipo cuando solo juegan dos equipos. */
export const MAX_TEAM_SIZE = 4;
/** Tope por equipo cuando hay tres o cuatro equipos en la partida. */
export const MAX_TEAM_SIZE_MULTI = 2;

/** Tamaño máximo de cada equipo según cuántos equipos tenga el mapa. */
export function maxTeamSizeFor(teamCount: number): number {
  return teamCount >= 3 ? MAX_TEAM_SIZE_MULTI : MAX_TEAM_SIZE;
}

/** Aforo total de la partida: equipos activos × tope de cada equipo. */
export function maxPlayersFor(teams: readonly Team[]): number {
  return teams.length * maxTeamSizeFor(teams.length);
}
/** Longitud máxima del nombre visible de un jugador. */
export const PLAYER_NAME_MAX_LENGTH = 16;

/** Nombre por defecto de una plaza humana cuando no se escribe ninguno. */
export function defaultPlayerName(slot: number): string {
  return `J${slot}`;
}

/**
 * Limpia el nombre antes de llevarlo al motor: colapsa espacios, recorta y cae
 * al nombre por defecto si el campo se quedó vacío.
 */
export function normalizePlayerName(name: string, slot: number): string {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, PLAYER_NAME_MAX_LENGTH);
  return clean || defaultPlayerName(slot);
}

/**
 * Modo de movimiento de un jugador humano.
 *
 * `normal`: el Pokémon mira hacia donde camina y el stick se orienta respecto
 * a la cámara. `tactical`: mira siempre hacia donde apunta la cámara, el eje Y
 * avanza o retrocede y el eje X desplaza lateralmente sin girar el cuerpo.
 */
export type MovementMode = 'normal' | 'tactical';

export const MOVEMENT_MODES: readonly MovementMode[] = ['normal', 'tactical'];

export const DEFAULT_MOVEMENT_MODE: MovementMode = 'normal';

export const MOVEMENT_MODE_LABEL: Record<MovementMode, string> = {
  normal: 'Normal',
  tactical: 'Táctico'
};

/** Nivel de la IA. Compartido entre el lobby, el motor y el controlador. */
export type BotDifficulty = 'easy' | 'normal' | 'hard' | 'expert';

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = [
  'easy',
  'normal',
  'hard',
  'expert'
];

export const BOT_DIFFICULTY_LABEL: Record<BotDifficulty, string> = {
  easy: 'Fácil',
  normal: 'Normal',
  hard: 'Difícil',
  expert: 'Experto'
};

/** Límites de KOs que se pueden elegir en el lobby. */
export const KO_TARGET_OPTIONS: readonly number[] = [15, 30, 50];

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
  red: {
    label: 'Equipo rojo',
    short: 'Rojo',
    color: '#ff5f63',
    dark: '#3a1116',
    accent: [255, 103, 108],
    x: 13.2,
    z: -13.2,
    radius: 3.6
  },
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
  yellow: {
    label: 'Equipo amarillo',
    short: 'Amarillo',
    color: '#ffd24a',
    dark: '#3a2d0b',
    accent: [255, 210, 74],
    x: 13.2,
    z: 13.2,
    radius: 3.6
  },
  green: {
    label: 'Equipo verde',
    short: 'Verde',
    color: '#5ed37a',
    dark: '#12341c',
    accent: [94, 211, 122],
    x: -13.2,
    z: -13.2,
    radius: 3.6
  }
};

/** Orden de presentación de los equipos, de rojo a verde. */
export const TEAM_ORDER: Team[] = ['red', 'blue', 'yellow', 'green'];

/** Crea un registro con una entrada por cada equipo posible. */
export function createTeamRecord<T>(factory: () => T): Record<Team, T> {
  return {
    red: factory(),
    blue: factory(),
    yellow: factory(),
    green: factory()
  };
}

/** Equipos activos del mapa actual (2-4), en el orden de presentación. */
export function teamsForMap(map: { teams?: readonly Team[] } | null | undefined): Team[] {
  const declared = map?.teams ?? [];
  const teams = TEAM_ORDER.filter(
    (team) => declared.includes(team)
  );
  return teams.length >= 2 ? teams : TEAM_ORDER.slice(0, 2);
}

/**
 * Copia al `TEAM_INFO` compartido la base del equipo en el mapa activo. La UI
 * usa estas coordenadas antes de que exista una partida, así que se sincroniza
 * al cargar o cambiar de mapa.
 */
export function syncTeamsWithMap(): void {
  for (const team of TEAM_ORDER) {
    const base = respawnsForTeam(team)[0];
    if (!base) continue;
    TEAM_INFO[team].x = base.x;
    TEAM_INFO[team].z = base.z;
    TEAM_INFO[team].radius = base.radius;
  }
}

/** Huecos alrededor del nexo: cuatro por equipo, separados del pedestal. */
const SPAWN_OFFSETS: ReadonlyArray<{ x: number; z: number }> = [
  { x: 0, z: 2.05 },
  { x: 2.05, z: 0 },
  { x: 0, z: -2.05 },
  { x: -2.05, z: 0 }
];

/**
 * Posición de aparición de un jugador dentro de las bases de su equipo. Si un
 * equipo declara varios respawns, los jugadores se reparten entre ellos y
 * después rotan por los cuatro huecos de cada base.
 */
export function spawnForTeam(team: Team, indexInTeam: number): { x: number; z: number } {
  const bases = respawnsForTeam(team);
  if (bases.length === 0) {
    const info = TEAM_INFO[team];
    const offset = SPAWN_OFFSETS[indexInTeam % SPAWN_OFFSETS.length];
    return { x: info.x + offset.x, z: info.z + offset.z };
  }
  const base = bases[indexInTeam % bases.length];
  const slot = Math.floor(indexInTeam / bases.length) % SPAWN_OFFSETS.length;
  const offset = SPAWN_OFFSETS[slot];
  return { x: base.x + offset.x, z: base.z + offset.z };
}

/**
 * Rumbo inicial hacia el centro del mapa (0 = sur, 90° = este). Si se indica
 * una posición, se usa esa; si no, la primera base del equipo. En mapas con
 * varios respawns hay que pasar el spawn real del jugador para que mire al
 * centro desde su propia base.
 */
export function facingToCenter(team: Team, x?: number, z?: number): number {
  const base = respawnsForTeam(team)[0];
  const originX = x ?? base?.x ?? TEAM_INFO[team].x;
  const originZ = z ?? base?.z ?? TEAM_INFO[team].z;
  return Math.atan2(-originX, -originZ);
}

/** Cámara detrás del jugador, mirando hacia el centro. */
export function cameraYawForTeam(team: Team, x?: number, z?: number): number {
  return facingToCenter(team, x, z) + Math.PI;
}

export function otherTeams(team: Team): Team[] {
  return TEAM_ORDER.filter((candidate) => candidate !== team);
}

export function areEnemies(a: Team, b: Team): boolean {
  return a !== b;
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
  deviceFamily: InputDeviceInfo['family'];
  deviceLabel: string;
  team: Team;
  teamReady: boolean;
  pokemonId: string;
  /** Aspecto alternativo elegido; ausente o `default` significa el normal. */
  skinId?: string;
  commonAbilityId: CommonAbilityId;
  /** Modo de control elegido por este jugador en el lobby. */
  movementMode: MovementMode;
  rosterReady: boolean;
  /** `true` si la plaza la controla la IA en vez de un dispositivo. */
  isBot?: boolean;
  /** Nivel de la IA; solo tiene sentido con `isBot`. */
  botDifficulty?: BotDifficulty;
}

export interface MatchPlayerConfig {
  slot: number;
  name: string;
  deviceId: string;
  deviceKind: InputDeviceInfo['kind'];
  team: Team;
  pokemonId: string;
  /** Aspecto alternativo elegido; ausente o `default` significa el normal. */
  skinId?: string;
  commonAbilityId: CommonAbilityId;
  /** Modo de control elegido por el jugador; los bots usan `normal`. */
  movementMode: MovementMode;
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
}

/** Estado de una habilidad para el HUD de cada vista. */
export interface AbilityHud {
  slot: AbilitySlot;
  id: string;
  name: string;
  type: string;
  category: 'physical' | 'special' | 'status';
  /** Enfriamiento restante, en segundos. */
  cooldown: number;
  /** Enfriamiento total, en segundos. */
  duration: number;
}

/** Buff activo tal y como lo pinta el HUD. */
export interface ActiveBuffHud {
  stat: BuffStat;
  multiplier: number;
  /** Segundos restantes. */
  remaining: number;
}

/** Ralentización (debuff) activa tal y como la pinta el HUD. */
export interface ActiveSlowHud {
  /** Multiplicador de velocidad: 0,55 = 45 % más lento. */
  multiplier: number;
  /** Segundos restantes. */
  remaining: number;
}

/** Estado del instinto común para el HUD. */
export interface CommonAbilityHud {
  id: CommonAbilityId;
  name: string;
  short: string;
  passive: boolean;
  /** Cooldown restante (0 en pasivas). */
  cooldown: number;
  /** Cooldown total (0 en pasivas). */
  duration: number;
  /** Segundos que faltan para que empiece la regeneración pasiva. */
  readyIn: number;
  /** `true` si la regeneración pasiva está curando ahora mismo. */
  active: boolean;
  /** `true` si el icono pasivo debe ocultarse (KO, visto o vida máxima). */
  hidden: boolean;
  description: string;
}

export interface PlayerMatchStats {
  slot: number;
  name: string;
  team: Team;
  pokemonId: string;
  /** Aspecto alternativo usado en la partida. */
  skinId?: string;
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
  /** Rango de visión base de la especie (u). */
  visionRange: number;
  /** Radio al que otros jugadores con el mismo rango base te detectan (u). */
  detectionRange: number;
  /** Ocultación final que ofrece el terreno bajo los pies (0-1). */
  concealment: number;
  /** Ocultación base del terreno, antes de aplicar los tipos (0-1). */
  concealmentBase: number;
  /** Multiplicador de ocultación por la relación tipo-terreno. */
  concealmentMultiplier: number;
  concealmentReason: TerrainRelationReason;
  /** Nº de rivales vivos que te ven en este instante. */
  enemiesSeeing: number;
  /** `true` si al menos un rival te ve (estás descubierto). */
  discovered: boolean;

  /** Vida actual y máxima. */
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Segundos restantes hasta reaparecer; 0 si está vivo. */
  respawnIn: number;
  /** Invulnerabilidad temporal tras reaparecer. */
  invulnerable: boolean;
  kills: number;
  deaths: number;
  /** Daño real infligido a rivales en toda la partida. */
  damageDealt: number;
  /** Daño real recibido de rivales y autodaño en toda la partida. */
  damageTaken: number;
  /** PV reales curados por habilidades propias y Regeneración. */
  abilityHealing: number;
  /** PV reales curados por objetos recogibles. */
  pickupHealing: number;
  /** XP acumulada en la partida. Solo decorativa: no altera el combate. */
  xp: number;
  /** Nivel 1-10 derivado de la XP. */
  level: number;
  /** Rango del nivel actual. */
  rank: XpRank;
  /** XP dentro del nivel actual. */
  xpIntoLevel: number;
  /** Coste del siguiente nivel; 0 en el nivel máximo. */
  xpToNext: number;
  /** Progreso 0-1 hacia el siguiente nivel; 1 en el máximo. */
  xpProgress: number;
  /** Desglose de la XP por fuente. */
  xpBreakdown: XpBreakdown;
  /** Buffs de estadísticas activos. */
  buffs: ActiveBuffHud[];
  /** Ralentizaciones activas que afectan al jugador. */
  slows: ActiveSlowHud[];
  abilities: AbilityHud[];
  /** `true` mientras Protección bloquea el uso de otras habilidades. */
  shieldActive: boolean;
  /**
   * Armadura de casteo restante; 0 si no hay armadura activa. Los golpes
   * consumen este pozo sin mitigar daño y solo interrumpen el lanzamiento
   * cuando lo agotan.
   */
  armorRemaining: number;
  /** Pozo máximo de la armadura del casteo activo; 0 si no hay armadura. */
  armorMax: number;
  /** Instinto común elegido por este Pokémon. */
  commonAbility: CommonAbilityHud | null;
  /** Últimos KOs de la partida, el más reciente primero. */
  feed: KillFeedEntry[];
  /** Marcador por equipo, repetido en cada entrada para pintar el HUD. */
  scores: Record<Team, number>;
  winner: Team | null;
}

/** Un KO reciente para el feed de cada vista. */
export interface KillFeedEntry {
  /** Identificador creciente para animar solo las entradas nuevas. */
  id: number;
  /** Momento de la partida (s) en el que se registró el KO. */
  at: number;
  killerName: string;
  killerTeam: Team;
  killerSlot: number;
  killerPokemonId: string;
  victimName: string;
  victimTeam: Team;
  victimSlot: number;
  victimPokemonId: string;
}

/** Resultado final que React usa para mostrar la pantalla de victoria. */
export interface MatchEndResult {
  winner: Team;
  scores: Record<Team, number>;
}

export function countTeams(players: ReadonlyArray<Pick<LobbyPlayer, 'team'>>): Record<Team, number> {
  const counts = createTeamRecord(() => 0);
  for (const player of players) counts[player.team] += 1;
  return counts;
}

/**
 * Especies ya ocupadas por un equipo. La selección del roster es única dentro
 * de cada equipo (los rivales sí pueden repetir), así que las plazas y los
 * bots del mismo bando no pueden compartir `pokemonId`.
 */
export function teamPokemonIds(
  players: ReadonlyArray<Pick<LobbyPlayer, 'slot' | 'team' | 'pokemonId'>>,
  team: Team,
  exceptSlot?: number
): Set<string> {
  const ids = new Set<string>();
  for (const player of players) {
    if (player.team !== team || player.slot === exceptSlot) continue;
    if (player.pokemonId) ids.add(player.pokemonId);
  }
  return ids;
}

/** Recuenta los jugadores de una lista concreta de equipos activos. */
export function countActiveTeams(
  players: ReadonlyArray<Pick<LobbyPlayer, 'team'>>,
  teams: readonly Team[]
): Record<Team, number> {
  const counts = countTeams(players);
  for (const team of teams) {
    counts[team] = players.filter((player) => player.team === team).length;
  }
  return counts;
}

/** Primera plaza libre de 1 a 8. */
export function nextFreeSlot(players: ReadonlyArray<Pick<LobbyPlayer, 'slot'>>): number | null {
  for (let slot = 1; slot <= MAX_PLAYERS; slot++) {
    if (!players.some((player) => player.slot === slot)) return slot;
  }
  return null;
}
