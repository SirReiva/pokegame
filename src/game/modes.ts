/**
 * Registro de modos de juego.
 *
 * Cada modo recibe los mismos eventos del motor (`tick`, `knockout`) y decide
 * por sí mismo si la partida termina y qué XP extra repartir. Además, todos
 * exponen `resolveTimeout` para cerrar la partida cuando se agota el tiempo
 * máximo. Así `Game` no contiene reglas de victoria ni ajustes concretos de un
 * modo: solo reparte eventos y aplica lo que el modo devuelve.
 */

import { CONFIG } from './config';
import type { Team } from './terrain';
import { XP_REWARDS, type XpSource } from './xp';

export type GameModeId = 'tdm' | 'koth';

export const GAME_MODE_IDS: readonly GameModeId[] = ['tdm', 'koth'];

/** Motivo por el que se cierra la partida. */
export type MatchEndReason = 'koTarget' | 'scoreTarget' | 'timeLimit';

/** Valor que puede tomar un ajuste de modo. */
export type ModeSettingValue = string | number | boolean;

/** Ajustes resueltos de una partida, indexados por id de ajuste. */
export type ModeSettings = Record<string, ModeSettingValue>;

export interface ModeSettingOption {
  value: ModeSettingValue;
  label: string;
}

/**
 * Ajuste declarado por un modo. El lobby lo pinta sin conocer su significado:
 * solo necesita el título, las opciones y el valor actual.
 */
export interface ModeSettingDefinition {
  id: string;
  label: string;
  description?: string;
  options: readonly ModeSettingOption[];
  defaultValue: ModeSettingValue;
}

export interface GameModeInfo {
  id: GameModeId;
  name: string;
  short: string;
  description: string;
  /** Unidad del marcador (`KO`, `PTS`...). */
  scoreUnit: string;
  /** Objetivo del marcador, o `null` si el modo no tiene un tope fijo. */
  scoreTarget: number | null;
  /** Ajustes que el lobby debe pintar para este modo. */
  settings: readonly ModeSettingDefinition[];
}

const KO_TARGET_SETTING: ModeSettingDefinition = {
  id: 'koTarget',
  label: 'Límite de KOs',
  description: 'Gana el primer equipo que alcance el límite.',
  options: [15, 30, 50].map((value) => ({ value, label: String(value) })),
  defaultValue: CONFIG.combat.koTarget
};

const KOTH_TARGET_SETTING: ModeSettingDefinition = {
  id: 'scoreTarget',
  label: 'Puntos para ganar',
  description: 'El primer equipo que alcance este marcador se lleva la partida.',
  options: [50, 100, 150].map((value) => ({ value, label: String(value) })),
  defaultValue: 100
};

const KOTH_RADIUS_SETTING: ModeSettingDefinition = {
  id: 'zoneRadius',
  label: 'Radio de la zona',
  description: 'Tamaño del círculo que hay que controlar.',
  options: [
    { value: 3, label: '3 u' },
    { value: 4.5, label: '4,5 u' },
    { value: 6, label: '6 u' }
  ],
  defaultValue: 4.5
};

const KOTH_MOVEMENT_SETTING: ModeSettingDefinition = {
  id: 'zoneMovement',
  label: 'Colina móvil',
  description: 'La zona cambia de posición cada 45 segundos.',
  options: [
    { value: 'static', label: 'Fija' },
    { value: 'mobile', label: 'Móvil' }
  ],
  defaultValue: 'static'
};

export const GAME_MODE_INFO: Record<GameModeId, GameModeInfo> = {
  tdm: {
    id: 'tdm',
    name: 'Deathmatch por equipos',
    short: 'Deathmatch',
    description: 'Gana el primer equipo que alcanza el límite de KOs.',
    scoreUnit: 'KO',
    scoreTarget: null,
    settings: [KO_TARGET_SETTING]
  },
  koth: {
    id: 'koth',
    name: 'Rey de la colina',
    short: 'Rey de la colina',
    description:
      'Mantén la zona en solitario para sumar puntos. Si hay dos o más equipos dentro, la zona queda en disputa.',
    scoreUnit: 'PTS',
    scoreTarget: 100,
    settings: [KOTH_TARGET_SETTING, KOTH_RADIUS_SETTING, KOTH_MOVEMENT_SETTING]
  }
};

/** Duraciones máximas que ofrece el lobby, en segundos. */
export const TIME_LIMIT_OPTIONS: readonly number[] = [180, 300, 480];
export const DEFAULT_TIME_LIMIT_SECONDS = 300;
/** Puntos por segundo del equipo que controla la zona. */
export const KOTH_POINTS_PER_SECOND = 1;
/** Puntos necesarios para ganar Rey de la colina por defecto. */
export const KOTH_TARGET_POINTS = 100;
/** Radio de la zona cuando el mapa no declara un objetivo propio. */
export const KOTH_DEFAULT_RADIUS = 4.5;
/** Cada cuántos segundos cambia de sitio la colina móvil. */
export const KOTH_MOBILE_INTERVAL_SECONDS = 45;

/** XP que reparte un modo tras procesar un evento de partida. */
export interface ModeXpAward {
  slot: number;
  source: XpSource;
  amount: number;
}

/** Ajustes por defecto de un modo, listos para guardar en la sesión. */
export function defaultModeSettings(modeId: GameModeId): ModeSettings {
  const settings: ModeSettings = {};
  for (const definition of GAME_MODE_INFO[modeId].settings) {
    settings[definition.id] = definition.defaultValue;
  }
  return settings;
}

/**
 * Completa y valida los ajustes del lobby. Un valor que no existe entre las
 * opciones del modo vuelve a su valor por defecto, así una sesión antigua o un
 * ajuste retirado no rompe la partida.
 */
export function normalizeModeSettings(
  modeId: GameModeId,
  input: Readonly<ModeSettings> | undefined
): ModeSettings {
  const settings: ModeSettings = {};
  for (const definition of GAME_MODE_INFO[modeId].settings) {
    const value = input?.[definition.id];
    settings[definition.id] =
      value !== undefined &&
      definition.options.some((option) => option.value === value)
        ? value
        : definition.defaultValue;
  }
  return settings;
}

function numberSetting(
  settings: Readonly<ModeSettings>,
  id: string,
  fallback: number
): number {
  const value = settings[id];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringSetting(
  settings: Readonly<ModeSettings>,
  id: string,
  fallback: string
): string {
  const value = settings[id];
  return typeof value === 'string' ? value : fallback;
}

export interface ObjectiveZone {
  id?: string;
  x: number;
  z: number;
  radius: number;
}

/** Vista mínima de un combatiente que necesita un modo. */
export interface ModePlayerSnapshot {
  slot: number;
  team: Team;
  alive: boolean;
  x: number;
  z: number;
  damageDealt: number;
}

export interface ModeContext {
  /** Segundos de simulación desde el final de la cuenta atrás. */
  elapsed: number;
  /** `0` desactiva el cierre por tiempo. */
  timeLimitSeconds: number;
  /**
   * Marcador compartido; el modo lo modifica al procesar eventos. Los puntos
   * visibles son enteros: los modos de objetivo pueden acumular fracciones de
   * segundo en su propio estado, pero nunca las escriben aquí.
   */
  scores: Record<Team, number>;
  players: readonly ModePlayerSnapshot[];
  /** Zona de objetivo del mapa, o la zona central por defecto. */
  objective: ObjectiveZone | null;
}

export type GameModeEvent =
  | {
      type: 'knockout';
      killerSlot: number;
      victimSlot: number;
      killerTeam: Team;
      victimTeam: Team;
    }
  | { type: 'tick'; dt: number };

export interface MatchOutcome {
  /** `null` cuando la partida termina en empate. */
  winner: Team | null;
  reason: MatchEndReason;
  /** Texto corto para la pantalla de resultados. */
  detail: string;
}

export interface ModeEventResult {
  /** Resultado si el evento cierra la partida; `null` si sigue. */
  outcome: MatchOutcome | null;
  /** XP extra que el modo concede por este evento. */
  xp: readonly ModeXpAward[];
}

export interface ModeObjectiveSnapshot {
  x: number;
  z: number;
  radius: number;
  owner: Team | null;
  contested: boolean;
  /** Progreso 0-1 del equipo que más puntos tiene. */
  progress: number;
}

export interface ModeHudSnapshot {
  id: GameModeId;
  name: string;
  scoreUnit: string;
  scoreTarget: number | null;
  timeLimitSeconds: number;
  /** Segundos restantes; `Infinity` si no hay límite. */
  timeRemaining: number;
  objective: ModeObjectiveSnapshot | null;
}

export interface GameModeRuntime {
  /** Procesa un evento y devuelve el resultado y la XP que corresponda. */
  onEvent(ctx: ModeContext, event: GameModeEvent): ModeEventResult;
  /** Cierra la partida al agotarse el tiempo máximo. */
  resolveTimeout(ctx: ModeContext): MatchOutcome;
  /** Datos que el HUD pinta cada frame. */
  getHud(ctx: ModeContext): ModeHudSnapshot;
  /** Punto de interés actual que los bots deben disputar, si existe. */
  getBotObjective(): ObjectiveZone | null;
}

const TEAMS: readonly Team[] = ['red', 'blue', 'yellow', 'green'];
const NO_XP: readonly ModeXpAward[] = [];

function emptyScores(): Record<Team, number> {
  return { red: 0, blue: 0, yellow: 0, green: 0 };
}

/**
 * Puntos que muestra/compara el marcador. Los modos de objetivo acumulan
 * internamente fracciones de segundo, pero el marcador y la victoria usan
 * enteros: así el HUD, el resultado y `scoreLeader` nunca discrepan por una
 * fracción invisible.
 */
function scoreOf(ctx: ModeContext, team: Team): number {
  return Math.floor(ctx.scores[team] ?? 0);
}

function scoreLeader(ctx: ModeContext): Team | null {
  let bestScore = -Infinity;
  for (const team of TEAMS) {
    bestScore = Math.max(bestScore, scoreOf(ctx, team));
  }
  const leaders = TEAMS.filter((team) => scoreOf(ctx, team) === bestScore);
  if (leaders.length === 1) return leaders[0];

  // Desempate: daño real infligido por el equipo.
  const damage: Record<Team, number> = emptyScores();
  for (const player of ctx.players) {
    damage[player.team] += player.damageDealt;
  }
  let bestDamage = -Infinity;
  for (const team of leaders) bestDamage = Math.max(bestDamage, damage[team]);
  const damageLeaders = leaders.filter((team) => damage[team] === bestDamage);
  return damageLeaders.length === 1 ? damageLeaders[0] : null;
}

function timeRemaining(ctx: ModeContext): number {
  if (ctx.timeLimitSeconds <= 0) return Infinity;
  return Math.max(0, ctx.timeLimitSeconds - ctx.elapsed);
}

function timeoutOutcome(ctx: ModeContext): MatchOutcome {
  const winner = scoreLeader(ctx);
  if (!winner) {
    return {
      winner: null,
      reason: 'timeLimit',
      detail: 'Tiempo agotado: empate técnico.'
    };
  }
  return {
    winner,
    reason: 'timeLimit',
    detail: 'Tiempo agotado: gana el equipo con mejor marcador.'
  };
}

function createTdmMode(settings: Readonly<ModeSettings>): GameModeRuntime {
  const target = Math.max(
    1,
    Math.floor(numberSetting(settings, 'koTarget', CONFIG.combat.koTarget))
  );
  return {
    onEvent(ctx, event) {
      if (event.type !== 'knockout') return { outcome: null, xp: NO_XP };
      if (event.killerTeam === event.victimTeam) {
        return { outcome: null, xp: NO_XP };
      }
      ctx.scores[event.killerTeam] += 1;
      if (ctx.scores[event.killerTeam] < target) {
        return { outcome: null, xp: NO_XP };
      }
      return {
        outcome: {
          winner: event.killerTeam,
          reason: 'koTarget',
          detail: `El equipo alcanzó el límite de ${target} KOs.`
        },
        xp: NO_XP
      };
    },
    resolveTimeout: timeoutOutcome,
    getHud(ctx) {
      return {
        id: 'tdm',
        name: GAME_MODE_INFO.tdm.name,
        scoreUnit: GAME_MODE_INFO.tdm.scoreUnit,
        scoreTarget: target,
        timeLimitSeconds: ctx.timeLimitSeconds,
        timeRemaining: timeRemaining(ctx),
        objective: null
      };
    },
    getBotObjective() {
      return null;
    }
  };
}

/**
 * Ruta de la colina móvil. Si el mapa declara varias zonas, se recorren en
 * orden; si solo hay una (o ninguna), se generan cuatro puntos alrededor del
 * centro para que la zona no se quede siempre en el mismo sitio.
 */
function buildKothRoute(
  base: ObjectiveZone,
  declared: readonly ObjectiveZone[],
  radius: number
): ObjectiveZone[] {
  if (declared.length >= 2) {
    return declared.map((zone) => ({ ...zone, radius }));
  }
  const distance = Math.max(radius * 2, 6);
  return [
    { ...base, radius },
    { x: base.x + distance, z: base.z, radius },
    { x: base.x, z: base.z + distance, radius },
    { x: base.x - distance, z: base.z, radius },
    { x: base.x, z: base.z - distance, radius }
  ];
}

function createKothMode(
  baseObjective: ObjectiveZone,
  settings: Readonly<ModeSettings>,
  declaredObjectives: readonly ObjectiveZone[]
): GameModeRuntime {
  const target = Math.max(
    1,
    Math.floor(numberSetting(settings, 'scoreTarget', KOTH_TARGET_POINTS))
  );
  const radius = Math.max(
    0.5,
    numberSetting(settings, 'zoneRadius', baseObjective.radius)
  );
  const mobile = stringSetting(settings, 'zoneMovement', 'static') === 'mobile';
  const route = mobile
    ? buildKothRoute(baseObjective, declaredObjectives, radius)
    : null;

  let zone: ObjectiveZone = { ...baseObjective, radius };
  let waypoint = 0;
  let nextMoveAt = KOTH_MOBILE_INTERVAL_SECONDS;
  let owner: Team | null = null;
  let contested = false;
  /**
   * Último equipo al que se le pagó la captura. Evita que una disputa
   * (`owner = null`) y una recaptura del mismo equipo vuelvan a dar XP.
   */
  let lastCaptureOwner: Team | null = null;
  /** Resto de segundo de cada equipo; los puntos se suman enteros. */
  const scoreProgress: Record<Team, number> = emptyScores();

  const resetScoreProgress = (): void => {
    for (const team of TEAMS) scoreProgress[team] = 0;
  };

  const playersInside = (ctx: ModeContext): Set<Team> => {
    const inside = new Set<Team>();
    for (const player of ctx.players) {
      if (!player.alive) continue;
      if (
        Math.hypot(player.x - zone.x, player.z - zone.z) <= zone.radius
      ) {
        inside.add(player.team);
      }
    }
    return inside;
  };

  /** Recoloca la colina móvil cuando toca y devuelve la XP de captura. */
  const updateControl = (
    ctx: ModeContext,
    dt: number
  ): { xp: ModeXpAward[]; outcome: MatchOutcome | null } => {
    if (route && ctx.elapsed >= nextMoveAt) {
      waypoint = (waypoint + 1) % route.length;
      zone = { ...route[waypoint] };
      nextMoveAt += KOTH_MOBILE_INTERVAL_SECONDS;
      // La colina nueva es un objetivo nuevo: nadie la controla todavía y la
      // captura vuelve a premiarse. La fracción de segundo del objetivo
      // anterior no se arrastra.
      owner = null;
      contested = false;
      lastCaptureOwner = null;
      resetScoreProgress();
    }

    const inside = playersInside(ctx);
    const previousOwner = owner;
    contested = inside.size > 1;
    owner = inside.size === 1 ? [...inside][0] : null;

    // Un cambio de dueño (incluido el paso por disputa) reinicia el resto de
    // segundo: los puntos se ganan por segundos completos de control continuo.
    if (owner !== previousOwner) resetScoreProgress();

    const xp: ModeXpAward[] = [];
    // Captura: el equipo pasa a controlar la zona. Se premia a los miembros
    // que están dentro en ese momento, no a todo el equipo desde la base. Si
    // el mismo equipo recupera la zona tras una disputa no vuelve a cobrar:
    // `lastCaptureOwner` recuerda la última captura real.
    if (owner && owner !== previousOwner && owner !== lastCaptureOwner) {
      lastCaptureOwner = owner;
      for (const player of ctx.players) {
        if (!player.alive || player.team !== owner) continue;
        if (
          Math.hypot(player.x - zone.x, player.z - zone.z) <= zone.radius
        ) {
          xp.push({
            slot: player.slot,
            source: 'zoneCapture',
            amount: XP_REWARDS.zoneCapture
          });
        }
      }
    }

    if (owner) {
      const accumulated =
        scoreProgress[owner] + KOTH_POINTS_PER_SECOND * dt;
      // El epsilon evita que 60 pasos de 1/60 se queden en 0,999999999999.
      const gained = Math.floor(accumulated + 1e-9);
      scoreProgress[owner] = Math.max(0, accumulated - gained);
      if (gained > 0) ctx.scores[owner] += gained;
    }

    const leader = scoreLeader(ctx);
    if (leader && scoreOf(ctx, leader) >= target) {
      return {
        xp,
        outcome: {
          winner: leader,
          reason: 'scoreTarget',
          detail: `El equipo alcanzó los ${target} puntos de la colina.`
        }
      };
    }
    return { xp, outcome: null };
  };

  return {
    onEvent(ctx, event) {
      if (event.type === 'knockout') {
        const xp: ModeXpAward[] = [];
        const killer = ctx.players.find(
          (player) => player.slot === event.killerSlot
        );
        const victim = ctx.players.find(
          (player) => player.slot === event.victimSlot
        );
        if (killer && victim && killer.team !== victim.team) {
          const victimInside =
            Math.hypot(victim.x - zone.x, victim.z - zone.z) <= zone.radius;
          const killerInside =
            Math.hypot(killer.x - zone.x, killer.z - zone.z) <= zone.radius;
          if (victimInside) {
            xp.push({
              slot: killer.slot,
              source: 'zoneKill',
              amount: XP_REWARDS.zoneKill
            });
          }
          if (killerInside) {
            xp.push({
              slot: killer.slot,
              source: 'zoneKillFrom',
              amount: XP_REWARDS.zoneKillFrom
            });
          }
        }
        return { outcome: null, xp };
      }

      const control = updateControl(ctx, event.dt);
      return control;
    },
    resolveTimeout: timeoutOutcome,
    getHud(ctx) {
      const bestScore = Math.max(...TEAMS.map((team) => scoreOf(ctx, team)));
      const progress = Math.min(1, Math.max(0, bestScore / target));
      return {
        id: 'koth',
        name: GAME_MODE_INFO.koth.name,
        scoreUnit: GAME_MODE_INFO.koth.scoreUnit,
        scoreTarget: target,
        timeLimitSeconds: ctx.timeLimitSeconds,
        timeRemaining: timeRemaining(ctx),
        objective: {
          x: zone.x,
          z: zone.z,
          radius: zone.radius,
          owner,
          contested,
          progress
        }
      };
    },
    getBotObjective() {
      return zone;
    }
  };
}

export interface CreateGameModeOptions {
  modeId: GameModeId;
  settings: Readonly<ModeSettings>;
  /** Zona principal resuelta por el motor. */
  objective: ObjectiveZone | null;
  /** Todas las zonas declaradas por el mapa, para la colina móvil. */
  objectives?: readonly ObjectiveZone[];
}

/** Objetivo de marcador que el HUD puede mostrar antes del primer tick. */
export function modeScoreTarget(
  modeId: GameModeId,
  settings: Readonly<ModeSettings> | undefined
): number | null {
  if (modeId === 'tdm') {
    return Math.max(
      1,
      Math.floor(numberSetting(settings ?? {}, 'koTarget', CONFIG.combat.koTarget))
    );
  }
  if (modeId === 'koth') {
    return Math.max(
      1,
      Math.floor(
        numberSetting(settings ?? {}, 'scoreTarget', KOTH_TARGET_POINTS)
      )
    );
  }
  return null;
}

export function createGameMode(options: CreateGameModeOptions): GameModeRuntime {
  const settings = normalizeModeSettings(options.modeId, options.settings);
  if (options.modeId === 'koth') {
    const base = options.objective ?? {
      x: 0,
      z: 0,
      radius: KOTH_DEFAULT_RADIUS
    };
    return createKothMode(base, settings, options.objectives ?? []);
  }
  return createTdmMode(settings);
}
