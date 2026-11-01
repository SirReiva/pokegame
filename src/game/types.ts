/** Tipos compartidos entre el pipeline de assets y el motor. */

export type DirectionName = 'S' | 'SE' | 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW';
export type AnimationName =
  | 'idle'
  | 'walk'
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

/** Extensión del contenido visible alrededor del ancla, en píxeles. */
export interface SpriteContent {
  left: number;
  right: number;
  top: number;
  bottom: number;
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
   * Recorte mínimo que contiene todo el arte de la animación alrededor del
   * ancla. Evita que hojas con mucho espacio vacío (como QuickStrike) dibujen
   * un plano gigante y descentren al personaje.
   */
  content?: SpriteContent;
  /** Recorte por dirección (8 filas); `null` si esa fila no se puede recortar. */
  contentRows?: Array<SpriteContent | null>;
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
  /** Retrato normal de PMD Sprite Collab para las interfaces HTML. */
  portrait: string;
  animations: Record<RequiredAnimationName, SpriteAnimation> & {
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
