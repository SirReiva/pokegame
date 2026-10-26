/** Ajustes de la demo. Todo lo "mágico" vive aquí para poder iterar rápido. */

export const PITCH_DEG = 45;

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/**
 * Un píxel de sprite mide esto en unidades de mundo. Igual para los 6 Pokémon
 * para conservar sus tamaños relativos.
 */
export const PIXEL_SCALE = 0.045;

/**
 * Los billboards son verticales, así que la cámara a 45º los escorza. Para que
 * el pixel art se vea con píxeles cuadrados en pantalla estiramos la altura por
 * 1/cos(pitch). El contacto con el suelo se mantiene en el ancla.
 */
export const VERTICAL_STRETCH = 1 / Math.cos(PITCH_DEG * DEG);

export const CONFIG = {
  sprite: {
    pixelScale: PIXEL_SCALE,
    verticalStretch: VERTICAL_STRETCH,
    alphaTest: 0.5,
    /** Escala de reproducción de la animación de andar según la velocidad. */
    walkRateMin: 0.75,
    walkRateMax: 1.5,
    /** Velocidad (u/s) a la que la animación de andar va a ritmo 1. */
    walkRateRefSpeed: 5
  },
  camera: {
    fov: 42,
    near: 0.5,
    far: 260,
    pitch: PITCH_DEG,
    distance: 17,
    minDistance: 10,
    maxDistance: 27,
    /** Rad/s con el stick derecho a tope. */
    stickSpeed: 2.6,
    keyboardSpeed: 2.2,
    /** Rad por píxel de arrastre. */
    pointerSensitivity: 0.0055,
    /** Unidades de distancia por muesca de rueda. */
    wheelStep: 1.15,
    followLerp: 8,
    heightOffset: 0.9,
    attractSpeed: 0.16
  },
  player: {
    speed: 5.4,
    runMultiplier: 1.55,
    radius: 0.42,
    acceleration: 16,
    deceleration: 20,
    turnLerp: 16,
    /** Por debajo de esta velocidad no se cambia la dirección a la que mira. */
    minFacingSpeed: 0.25,
    /** Anillo de rumbo bajo los pies del jugador, en unidades de mundo. */
    markerDiameter: 1.18,
    /** Altura del anillo sobre el suelo (por encima de la sombra de contacto). */
    markerHeight: 0.075,
    /** Opacidad del anillo: 1 = opaco, 0 = invisible. */
    markerOpacity: 0.72
  },
  world: {
    /** Mitad del lado del mapa jugable. */
    halfSize: 18.4,
    groundSize: 38,
    spawn: { x: 0, z: 1.6 }
  },
  fog: {
    color: [0.73, 0.87, 0.96] as [number, number, number],
    near: 34,
    far: 96
  }
} as const;
