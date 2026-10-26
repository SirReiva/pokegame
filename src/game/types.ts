/** Tipos compartidos entre el pipeline de assets y el motor. */

export type DirectionName = 'S' | 'SE' | 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW';
export type AnimationName = 'idle' | 'walk';

export interface SpriteAnchor {
  /** Columna del ancla de suelo dentro del frame (px). */
  x: number;
  /** Fila del ancla de suelo dentro del frame (px, desde arriba). */
  y: number;
}

export interface SpriteAnimation {
  sheet: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  /** Duración de cada frame en ticks de 1/60 s. */
  durations: number[];
  /** Un ancla por frame, en orden fila a fila (8 direcciones x columnas). */
  anchors: SpriteAnchor[];
  /**
   * Píxel inferior con contenido visible de cada frame (mismo orden que
   * `anchors`). Sirve para no enterrar bajo el suelo las partes del dibujo que
   * bajan del ancla. `-1` indica una celda vacía.
   */
  bottoms: number[];
}

export interface SpriteCredits {
  artist: string;
  contact: string;
  actions: string[];
}

export interface PokemonEntry {
  id: string;
  name: string;
  dex: number;
  types: string[];
  accent: string;
  shadowSize: number;
  source: string;
  credits: SpriteCredits[];
  animations: Record<AnimationName, SpriteAnimation>;
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

export type GamePhase = 'loading' | 'ready' | 'playing';

export interface GameStats {
  fps: number;
  yaw: number;
  distance: number;
  row: number;
  direction: DirectionName;
  /** Rumbo propio del personaje en grados (0 = sur, 90 = este). */
  facing: number;
  speed: number;
  x: number;
  z: number;
  gamepad: boolean;
  animation: AnimationName;
}

export interface LoadingProgress {
  loaded: number;
  total: number;
  label: string;
}
