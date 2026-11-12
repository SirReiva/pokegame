/**
 * Experiencia de partida (nivel 1-10).
 *
 * Es un sistema **solo decorativo**: la XP no modifica vida, stats, daño,
 * cooldowns ni ninguna otra regla de combate. Sirve para dar feedback y para
 * lucir rango en el HUD y en el marcador final.
 *
 * La escalada es aritmética: cada nivel cuesta 20 XP más que el anterior y el
 * primero cuesta 40. Así el nivel 2 se alcanza con un solo KO, el 7 queda a
 * mitad de tabla y el 10 exige una partida muy buena.
 */

/** Nivel máximo alcanzable. */
export const XP_MAX_LEVEL = 10;

/** Incremento de coste entre niveles consecutivos. */
export const XP_STEP = 20;

/** Nombres de rango para cada nivel (índice 0 = nivel 1). */
export const XP_RANKS = [
  'Novato',
  'Aprendiz',
  'Entrenador',
  'Combatiente',
  'Veterano',
  'Élite',
  'As',
  'Campeón',
  'Gran Maestro',
  'Leyenda'
] as const;

export type XpRank = (typeof XP_RANKS)[number];

/** Fuentes de XP que se acumulan en el desglose. */
export type XpSource =
  | 'ko'
  | 'assist'
  | 'damage'
  | 'taken'
  | 'healing'
  | 'revive'
  | 'blocked'
  | 'pickup'
  | 'shutdown'
  | 'multikill'
  | 'zoneCapture'
  | 'zoneKill'
  | 'zoneKillFrom'
  | 'result'
  | 'participation';

export type XpBreakdown = Record<XpSource, number>;

export const XP_SOURCE_LABELS: Record<XpSource, string> = {
  ko: 'KOs',
  assist: 'Asistencias',
  damage: 'Daño hecho',
  taken: 'Daño recibido',
  healing: 'Curación',
  revive: 'Revividos',
  blocked: 'Daño bloqueado',
  pickup: 'Objetos',
  shutdown: 'Cortar rachas',
  multikill: 'Multibajas',
  zoneCapture: 'Capturar zona',
  zoneKill: 'Bajas en zona',
  zoneKillFrom: 'Bajas desde zona',
  result: 'Resultado',
  participation: 'Participación'
};

/** Valores base de cada fuente. Se pueden ajustar sin tocar la curva. */
export const XP_REWARDS = {
  /** Baja confirmada. */
  ko: 40,
  /** Asistencia: daño suficiente en la ventana de asistencia. */
  assist: 15,
  /** XP por cada barra de vida (100 % de la vida máxima) infligida. */
  damagePerMaxHp: 25,
  /** Tope de XP de daño contra un mismo rival en una misma vida. */
  damageCapPerVictim: 35,
  /** XP por cada barra de vida recibida de rivales. */
  takenPerMaxHp: 10,
  /** XP por cada barra de vida absorbida con Protección. */
  blockedPerMaxHp: 10,
  /** XP por PV curado (habilidades, Regeneración y pociones). */
  healingPerHp: 1 / 15,
  /** Aliado caído devuelto a la vida por una habilidad de revivir. */
  revive: 20,
  /** Objeto recogido. */
  pickup: 8,
  /** Matar a alguien que venía en racha. */
  shutdown: 25,
  /** Multibajas dentro de la ventana: 2.ª, 3.ª y 4.ª o posterior. */
  multikill2: 10,
  multikill3: 15,
  multikill4: 25,
  /** XP de eventos de objetivo (modos de control de zona). */
  zoneCapture: 20,
  zoneKill: 10,
  zoneKillFrom: 10,
  /** Resultado de la partida. */
  win: 100,
  loss: 40,
  /** Participación: goteo por tiempo vivo con actividad reciente. */
  participationPerTick: 1,
  participationCap: 30
} as const;

/** Reglas de contexto (ventanas, umbrales y topes). */
export const XP_RULES = {
  /** Tiempo máximo desde el último daño para contar como asistencia. */
  assistWindowSeconds: 10,
  /** Fracción de la vida máxima que debe aportar un asistente. */
  assistMinDamageFraction: 0.2,
  /** Ventana para encadenar multibajas. */
  multikillWindowSeconds: 10,
  /** Bajas seguidas que convierten a la víctima en objetivo de shutdown. */
  shutdownStreak: 3,
  /** Tiempo tras el que se olvida el farmeo contra un mismo rival. */
  killFarmWindowSeconds: 180,
  /** Cada cuántos segundos vivos se concede participación. */
  participationTickSeconds: 10,
  /** Sin ninguna acción de combate durante este tiempo no hay participación. */
  participationIdleSeconds: 30
} as const;

/** Coste de pasar de `level` a `level + 1` (0 en el nivel máximo). */
export function xpToNext(level: number): number {
  if (level >= XP_MAX_LEVEL) return 0;
  return XP_STEP * (Math.max(1, level) + 1);
}

/** XP acumulada necesaria para estar en `level`. Nivel 1 = 0, nivel 10 = 1080. */
export function xpForLevel(level: number): number {
  const clamped = Math.max(1, Math.min(XP_MAX_LEVEL, Math.floor(level)));
  return 10 * clamped * (clamped + 1) - 20;
}

/** Nivel que corresponde a una XP acumulada. */
export function levelFromXp(xp: number): number {
  const total = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let level = 1;
  while (level < XP_MAX_LEVEL && total >= xpForLevel(level + 1)) level++;
  return level;
}

/** Nombre del rango de un nivel. */
export function rankForLevel(level: number): XpRank {
  const index = Math.max(0, Math.min(XP_RANKS.length - 1, Math.floor(level) - 1));
  return XP_RANKS[index];
}

export interface XpStatus {
  /** Nivel actual, de 1 a 10. */
  level: number;
  rank: XpRank;
  /** XP acumulada. */
  xp: number;
  /** XP dentro del nivel actual. */
  intoLevel: number;
  /** Coste del siguiente nivel; 0 en el máximo. */
  toNext: number;
  /** Progreso 0-1 hacia el siguiente nivel; 1 en el máximo. */
  progress: number;
  maxed: boolean;
}

/** Resumen listo para pintar en el HUD y en el marcador. */
export function xpStatus(xp: number): XpStatus {
  const total = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  const level = levelFromXp(total);
  const toNext = xpToNext(level);
  const intoLevel = total - xpForLevel(level);
  const maxed = level >= XP_MAX_LEVEL;
  return {
    level,
    rank: rankForLevel(level),
    xp: total,
    intoLevel: maxed ? 0 : intoLevel,
    toNext,
    progress: maxed ? 1 : Math.max(0, Math.min(1, intoLevel / toNext)),
    maxed
  };
}

/** Desglose vacío con todas las fuentes a cero. */
export function emptyXpBreakdown(): XpBreakdown {
  return {
    ko: 0,
    assist: 0,
    damage: 0,
    taken: 0,
    healing: 0,
    revive: 0,
    blocked: 0,
    pickup: 0,
    shutdown: 0,
    multikill: 0,
    zoneCapture: 0,
    zoneKill: 0,
    zoneKillFrom: 0,
    result: 0,
    participation: 0
  };
}
