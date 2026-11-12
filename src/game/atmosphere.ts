/**
 * Estado atmosférico de la partida.
 *
 * Cada partida sortea uno de los once climas al arrancar. El mismo módulo es
 * puro (sin PlayCanvas ni React): define el nombre para el HUD, los efectos de
 * combate y los parámetros visuales que `atmosphereVisuals.ts` aplica a la
 * escena. Así el motor y la interfaz comparten una única fuente de verdad.
 */

export type AtmosphereId =
  | 'clear'
  | 'sun'
  | 'harshSun'
  | 'rain'
  | 'downpour'
  | 'sandstorm'
  | 'hail'
  | 'fog'
  | 'turbulence'
  | 'storm'
  | 'snow';

/** Daño residual que aplica un clima cada cierto intervalo. */
export interface AtmosphereResidual {
  /** Segundos entre golpes. */
  interval: number;
  /** Fracción de la vida máxima que se resta en cada golpe. */
  fraction: number;
  /** Tipos que ignoran el daño residual. */
  immuneTypes: readonly string[];
}

/** Reglas de combate del clima. */
export interface AtmosphereGameplay {
  /** Multiplicadores de daño por tipo de movimiento. */
  moveDamage: Readonly<Record<string, number>>;
  /** Multiplicador de daño de proyectiles y haces. */
  projectileDamage: number;
  /** Multiplicador de velocidad normal para todos. */
  speedDefault: number;
  /** Multiplicadores de velocidad por tipo del Pokémon. */
  speedByType: Readonly<Record<string, number>>;
  /** Multiplicador del rango de visión de todos los Pokémon. */
  vision: number;
  /** Multiplicadores al daño recibido según el tipo del defensor. */
  incomingByDefenderType: Readonly<Record<string, number>>;
  /** Daño residual del clima, o `null` si no tiene. */
  residual: AtmosphereResidual | null;
}

/** Parámetros que la capa visual aplica a la escena. */
export interface AtmosphereVisual {
  /** Tinte multiplicativo del cielo (0-1+, se recorta al aplicarlo). */
  skyTint: readonly [number, number, number];
  /** Color de la luz ambiental. */
  ambient: readonly [number, number, number];
  /** Color e intensidad de la luz principal. */
  sunColor: readonly [number, number, number];
  sunIntensity: number;
  /** Color e intensidad de la luz de relleno. */
  fillColor: readonly [number, number, number];
  fillIntensity: number;
  /** Niebla lineal de la escena. */
  fogColor: readonly [number, number, number];
  fogNear: number;
  fogFar: number;
  /** Sistema de partículas y efectos ambientales. */
  effect?:
    | 'sunMotes'
    | 'rain'
    | 'downpour'
    | 'sand'
    | 'hail'
    | 'fog'
    | 'wind'
    | 'storm'
    | 'snow';
}

export interface AtmosphereDef {
  id: AtmosphereId;
  /** Nombre completo para el HUD y los avisos. */
  name: string;
  /** Nombre corto para paneles compactos. */
  short: string;
  icon: string;
  /** Color de acento del estado, en formato CSS. */
  color: string;
  /** Resumen legible de sus efectos de combate. */
  description: string;
  gameplay: AtmosphereGameplay;
  visual: AtmosphereVisual;
}

/** Subconjunto que viaja al HUD de React. */
export type AtmosphereState = Pick<
  AtmosphereDef,
  'id' | 'name' | 'short' | 'icon' | 'color' | 'description'
>;

const NO_EFFECTS: AtmosphereGameplay = {
  moveDamage: {},
  projectileDamage: 1,
  speedDefault: 1,
  speedByType: {},
  vision: 1,
  incomingByDefenderType: {},
  residual: null
};

function gameplay(overrides: Partial<AtmosphereGameplay> = {}): AtmosphereGameplay {
  return {
    ...NO_EFFECTS,
    ...overrides,
    moveDamage: overrides.moveDamage ?? NO_EFFECTS.moveDamage,
    speedByType: overrides.speedByType ?? NO_EFFECTS.speedByType,
    incomingByDefenderType:
      overrides.incomingByDefenderType ?? NO_EFFECTS.incomingByDefenderType
  };
}

const CLEAR_VISUAL: AtmosphereVisual = {
  skyTint: [1, 1, 1],
  ambient: [0.46, 0.5, 0.55],
  sunColor: [1, 0.945, 0.84],
  sunIntensity: 1.65,
  fillColor: [0.616, 0.78, 1],
  fillIntensity: 0.35,
  fogColor: [0.73, 0.87, 0.96],
  fogNear: 34,
  fogFar: 96
};

export const ATMOSPHERES: Record<AtmosphereId, AtmosphereDef> = {
  clear: {
    id: 'clear',
    name: 'Despejado',
    short: 'Despejado',
    icon: '☀️',
    color: '#9fd8ff',
    description: 'Sin efectos sobre el combate.',
    gameplay: gameplay(),
    visual: CLEAR_VISUAL
  },
  sun: {
    id: 'sun',
    name: 'Sol',
    short: 'Sol',
    icon: '☀️',
    color: '#ffd76a',
    description: 'Fuego +25% · Agua -25%.',
    gameplay: gameplay({
      moveDamage: { Fire: 1.25, Water: 0.75 }
    }),
    visual: {
      skyTint: [1, 0.93, 0.72],
      ambient: [0.55, 0.49, 0.38],
      sunColor: [1, 0.88, 0.6],
      sunIntensity: 1.95,
      fillColor: [0.55, 0.68, 0.9],
      fillIntensity: 0.25,
      fogColor: [0.82, 0.84, 0.74],
      fogNear: 38,
      fogFar: 110,
      effect: 'sunMotes'
    }
  },
  harshSun: {
    id: 'harshSun',
    name: 'Sol abrasador',
    short: 'Abrasador',
    icon: '🔥',
    color: '#ff9f43',
    description: 'Fuego +50% · Agua -50%.',
    gameplay: gameplay({
      moveDamage: { Fire: 1.5, Water: 0.5 }
    }),
    visual: {
      skyTint: [1, 0.82, 0.55],
      ambient: [0.62, 0.48, 0.3],
      sunColor: [1, 0.78, 0.42],
      sunIntensity: 2.2,
      fillColor: [0.5, 0.6, 0.85],
      fillIntensity: 0.18,
      fogColor: [0.9, 0.76, 0.54],
      fogNear: 30,
      fogFar: 100,
      effect: 'sunMotes'
    }
  },
  rain: {
    id: 'rain',
    name: 'Lluvia',
    short: 'Lluvia',
    icon: '🌧️',
    color: '#74b9ff',
    description: 'Agua +25% · Fuego -25%.',
    gameplay: gameplay({
      moveDamage: { Water: 1.25, Fire: 0.75 }
    }),
    visual: {
      skyTint: [0.55, 0.67, 0.8],
      ambient: [0.32, 0.38, 0.45],
      sunColor: [0.72, 0.82, 0.95],
      sunIntensity: 0.85,
      fillColor: [0.5, 0.66, 0.9],
      fillIntensity: 0.22,
      fogColor: [0.52, 0.61, 0.7],
      fogNear: 24,
      fogFar: 78,
      effect: 'rain'
    }
  },
  downpour: {
    id: 'downpour',
    name: 'Diluvio',
    short: 'Diluvio',
    icon: '🌊',
    color: '#3d8bfd',
    description: 'Agua +50% · Fuego -50%.',
    gameplay: gameplay({
      moveDamage: { Water: 1.5, Fire: 0.5 }
    }),
    visual: {
      skyTint: [0.38, 0.48, 0.6],
      ambient: [0.24, 0.3, 0.38],
      sunColor: [0.55, 0.65, 0.8],
      sunIntensity: 0.55,
      fillColor: [0.4, 0.5, 0.7],
      fillIntensity: 0.18,
      fogColor: [0.38, 0.46, 0.55],
      fogNear: 16,
      fogFar: 60,
      effect: 'downpour'
    }
  },
  sandstorm: {
    id: 'sandstorm',
    name: 'Tormenta de arena',
    short: 'Arena',
    icon: '🌪️',
    color: '#e0a24a',
    description: 'Cada 3 s, 2% de PV a quien no sea Tierra, Roca o Acero · Visión -10%.',
    gameplay: gameplay({
      vision: 0.9,
      residual: {
        interval: 3,
        fraction: 0.02,
        immuneTypes: ['Ground', 'Rock', 'Steel']
      }
    }),
    visual: {
      skyTint: [0.92, 0.64, 0.32],
      ambient: [0.55, 0.42, 0.24],
      sunColor: [1, 0.82, 0.55],
      sunIntensity: 1.25,
      fillColor: [0.6, 0.5, 0.35],
      fillIntensity: 0.2,
      fogColor: [0.78, 0.6, 0.34],
      fogNear: 10,
      fogFar: 48,
      effect: 'sand'
    }
  },
  hail: {
    id: 'hail',
    name: 'Granizo',
    short: 'Granizo',
    icon: '🧊',
    color: '#a8d8ff',
    description: 'Cada 3 s, 2% de PV a quien no sea Hielo.',
    gameplay: gameplay({
      residual: {
        interval: 3,
        fraction: 0.02,
        immuneTypes: ['Ice']
      }
    }),
    visual: {
      skyTint: [0.7, 0.8, 0.9],
      ambient: [0.42, 0.5, 0.58],
      sunColor: [0.82, 0.9, 1],
      sunIntensity: 1.1,
      fillColor: [0.65, 0.78, 1],
      fillIntensity: 0.3,
      fogColor: [0.72, 0.8, 0.88],
      fogNear: 20,
      fogFar: 72,
      effect: 'hail'
    }
  },
  fog: {
    id: 'fog',
    name: 'Niebla',
    short: 'Niebla',
    icon: '🌫️',
    color: '#c7d2d6',
    description: 'Visión -25%.',
    gameplay: gameplay({
      vision: 0.75
    }),
    visual: {
      skyTint: [0.72, 0.76, 0.78],
      ambient: [0.5, 0.53, 0.55],
      sunColor: [0.86, 0.9, 0.9],
      sunIntensity: 0.8,
      fillColor: [0.7, 0.76, 0.8],
      fillIntensity: 0.25,
      fogColor: [0.76, 0.8, 0.82],
      fogNear: 6,
      fogFar: 34,
      effect: 'fog'
    }
  },
  turbulence: {
    id: 'turbulence',
    name: 'Turbulencias',
    short: 'Turbulencias',
    icon: '💨',
    color: '#9be7c4',
    description: 'Proyectiles y haces -20% · Movimiento -10%, Volador +10%.',
    gameplay: gameplay({
      projectileDamage: 0.8,
      speedDefault: 0.9,
      speedByType: { Flying: 1.1 }
    }),
    visual: {
      skyTint: [0.78, 0.88, 0.84],
      ambient: [0.42, 0.48, 0.46],
      sunColor: [0.9, 0.95, 0.9],
      sunIntensity: 1.3,
      fillColor: [0.7, 0.8, 0.85],
      fillIntensity: 0.35,
      fogColor: [0.68, 0.76, 0.74],
      fogNear: 30,
      fogFar: 92,
      effect: 'wind'
    }
  },
  storm: {
    id: 'storm',
    name: 'Tormenta',
    short: 'Tormenta',
    icon: '⛈️',
    color: '#ffd43b',
    description: 'Eléctrico +30% · Agua +15% · Fuego -25% · Rayos.',
    gameplay: gameplay({
      moveDamage: { Electric: 1.3, Water: 1.15, Fire: 0.75 }
    }),
    visual: {
      skyTint: [0.3, 0.36, 0.46],
      ambient: [0.22, 0.26, 0.33],
      sunColor: [0.5, 0.6, 0.78],
      sunIntensity: 0.5,
      fillColor: [0.45, 0.55, 0.75],
      fillIntensity: 0.2,
      fogColor: [0.28, 0.34, 0.42],
      fogNear: 12,
      fogFar: 52,
      effect: 'storm'
    }
  },
  snow: {
    id: 'snow',
    name: 'Nieve',
    short: 'Nieve',
    icon: '❄️',
    color: '#d8ecff',
    description: 'Los Pokémon de tipo Hielo reciben 25% menos daño.',
    gameplay: gameplay({
      incomingByDefenderType: { Ice: 0.75 }
    }),
    visual: {
      skyTint: [0.85, 0.92, 1],
      ambient: [0.52, 0.58, 0.65],
      sunColor: [0.88, 0.94, 1],
      sunIntensity: 1.25,
      fillColor: [0.7, 0.8, 1],
      fillIntensity: 0.3,
      fogColor: [0.8, 0.87, 0.95],
      fogNear: 18,
      fogFar: 68,
      effect: 'snow'
    }
  }
};

/** Orden estable para el sorteo y las pruebas. */
export const ATMOSPHERE_IDS: readonly AtmosphereId[] = [
  'clear',
  'sun',
  'harshSun',
  'rain',
  'downpour',
  'sandstorm',
  'hail',
  'fog',
  'turbulence',
  'storm',
  'snow'
];

/** Sortea el clima de la partida. El generador es inyectable en pruebas. */
export function rollAtmosphere(random: () => number = Math.random): AtmosphereId {
  const value = Math.min(0.999999, Math.max(0, random()));
  return ATMOSPHERE_IDS[Math.floor(value * ATMOSPHERE_IDS.length)];
}

/** Datos que consume el HUD de React. */
export function atmosphereState(id: AtmosphereId): AtmosphereState {
  const def = ATMOSPHERES[id];
  return {
    id: def.id,
    name: def.name,
    short: def.short,
    icon: def.icon,
    color: def.color,
    description: def.description
  };
}

/**
 * Final de la niebla del clima. La cámara de juego no necesita dibujar más
 * allá: el terreno y los props quedan completamente ocultos.
 */
export function atmosphereFogFar(id: AtmosphereId): number {
  return ATMOSPHERES[id].visual.fogFar;
}

/** Multiplicador de daño de un movimiento según su tipo. */
export function atmosphereMoveMultiplier(
  id: AtmosphereId,
  moveType: string
): number {
  return ATMOSPHERES[id].gameplay.moveDamage[moveType] ?? 1;
}

/** Multiplicador para proyectiles y haces; el resto de formas no cambia. */
export function atmosphereShapeMultiplier(
  id: AtmosphereId,
  shape: 'melee' | 'projectile' | 'beam' | 'aoe' | 'dash' | 'self'
): number {
  const gameplay = ATMOSPHERES[id].gameplay;
  if (gameplay.projectileDamage === 1) return 1;
  return shape === 'projectile' || shape === 'beam'
    ? gameplay.projectileDamage
    : 1;
}

/** Multiplicador de velocidad de movimiento según los tipos del Pokémon. */
export function atmosphereSpeedMultiplier(
  id: AtmosphereId,
  types: readonly string[]
): number {
  const gameplay = ATMOSPHERES[id].gameplay;
  for (const type of types) {
    const multiplier = gameplay.speedByType[type];
    if (multiplier !== undefined) return multiplier;
  }
  return gameplay.speedDefault;
}

/** Multiplicador de visión del clima. */
export function atmosphereVisionMultiplier(id: AtmosphereId): number {
  return ATMOSPHERES[id].gameplay.vision;
}

/** Multiplicador al daño recibido según los tipos del defensor. */
export function atmosphereIncomingMultiplier(
  id: AtmosphereId,
  defenderTypes: readonly string[]
): number {
  const multipliers = ATMOSPHERES[id].gameplay.incomingByDefenderType;
  let total = 1;
  for (const type of defenderTypes) {
    total *= multipliers[type] ?? 1;
  }
  return total;
}

/** Daño residual del clima, si lo tiene. */
export function atmosphereResidual(id: AtmosphereId): AtmosphereResidual | null {
  return ATMOSPHERES[id].gameplay.residual;
}
