/** Tipos compartidos entre el pipeline de assets y el motor. */

export type DirectionName = 'S' | 'SE' | 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW';
export type AnimationName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'attack'
  | 'hurt'
  | 'faint'
  | 'quickstrike'
  | 'shock'
  | 'shoot'
  | 'charge'
  | 'strike'
  | 'twirl'
  | 'shake'
  | 'punch'
  | 'hop';

/**
 * Animaciones que todo el roster debe tener. `faint`, `quickstrike`, `shock`,
 * `shoot`, `charge`, `strike`, `twirl`, `shake`, `punch` y `hop` son
 * opcionales porque no todas las especies de PMD Sprite Collab las incluyen.
 */
export type RequiredAnimationName = Exclude<
  AnimationName,
  | 'run'
  | 'faint'
  | 'quickstrike'
  | 'shock'
  | 'shoot'
  | 'charge'
  | 'strike'
  | 'twirl'
  | 'shake'
  | 'punch'
  | 'hop'
>;

export interface SpriteAnchor {
  /** Columna del ancla de suelo dentro del frame (px). */
  x: number;
  /** Fila del ancla de suelo dentro del frame (px, desde arriba). */
  y: number;
}

/**
 * Metadatos de una animación de PMD que siguen alimentando el gameplay: tamaño
 * de frame de referencia, duraciones y marcadores de fase. Las hojas de sprite
 * ya no existen; el cuerpo se dibuja con un modelo 3D.
 */
export interface SpriteAnimation {
  frameWidth: number;
  frameHeight: number;
  /** Duración de cada frame en ticks de 1/60 s. */
  durations: number[];
  /**
   * Marcadores de fase de la animación de ataque, en índice de frame (0-based).
   * `rushFrame`: inicio del envite; `hitFrame`: impacto/lanzamiento;
   * `returnFrame`: inicio de la vuelta al reposo. Solo existen en animaciones
   * de ataque (Attack, Strike, Shoot, etc.).
   */
  rushFrame?: number;
  hitFrame?: number;
  returnFrame?: number;
  /** Un ancla por frame, en orden fila a fila (8 direcciones x columnas). */
  anchors: SpriteAnchor[];
}

/** Animación resuelta tras aplicar los fallbacks de la especie. */
export interface ResolvedAnimation {
  /** Nombre final tras los fallbacks (`shoot` → `attack`, etc.). */
  name: AnimationName;
  animation: SpriteAnimation;
}

export interface SpriteCredits {
  artist: string;
  contact: string;
}

/**
 * Metadatos de animación de una especie.
 */
export type PokemonAnimations = Record<RequiredAnimationName, SpriteAnimation> & {
  run?: SpriteAnimation;
  faint?: SpriteAnimation;
  quickstrike?: SpriteAnimation;
  shock?: SpriteAnimation;
  shoot?: SpriteAnimation;
  charge?: SpriteAnimation;
  strike?: SpriteAnimation;
  twirl?: SpriteAnimation;
  shake?: SpriteAnimation;
  punch?: SpriteAnimation;
  hop?: SpriteAnimation;
};

export interface PokemonEntry {
  id: string;
  name: string;
  dex: number;
  types: string[];
  accent: string;
  shadowSize: number;
  source: string;
  credits: SpriteCredits[];
  /** Retrato de PMD Sprite Collab para las interfaces HTML. */
  portrait: string;
  animations: PokemonAnimations;
}

export interface SpriteManifest {
  generatedAt: string;
  source: string;
  license: string;
  licenseUrl: string;
  licenseFile: string;
  directions: DirectionName[];
  tickRate: number;
  pokemon: PokemonEntry[];
}

export interface LoadingProgress {
  loaded: number;
  total: number;
  label: string;
}
