/** Ajustes de la demo. Todo lo "mágico" vive aquí para poder iterar rápido. */

export const PITCH_DEG = 45;

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/**
 * Un píxel de sprite mide esto en unidades de mundo. Igual para todo el roster
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
    /**
     * Muestreo de la textura del sprite:
     * - 'nearest': píxel art original, cada téxel se ve como un bloque.
     * - 'smooth': precarga la hoja con NEAREST a `smoothScale` y la muestrea
     *   con LINEAR. Antialiasa el contorno 1-2 px sin emborronar el interior.
     * - 'linear': bilineal directo sobre la hoja original; el más borroso.
     */
    filter: 'smooth' as 'nearest' | 'smooth' | 'linear',
    /**
     * Factor de precarga del modo 'smooth'. Más alto = contorno más nítido
     * (menos radio de suavizado) y más memoria de textura.
     * 2 = suave, 3 = equilibrado, 4 = casi nítido.
     */
    smoothScale: 3,
    /**
     * Suaviza el recorte alfa usando las muestras del MSAA (`antialias`). En
     * modo 'smooth' el borde ya tiene alfa parcial, así que redondea el
     * contorno; en 'nearest' apenas se nota (alfa de 1 bit).
     */
    alphaToCoverage: true,
    /** Escala de reproducción de la animación de andar según la velocidad. */
    walkRateMin: 0.75,
    walkRateMax: 1.5,
    /** Velocidad (u/s) a la que la animación de andar va a ritmo 1. */
    walkRateRefSpeed: 5,
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
    attractSpeed: 0.16,
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
    markerOpacity: 0.55,
    /**
     * Fracción de la altura visible del sprite que queda bajo la superficie al
     * entrar en el agua. En someras moja las piernas; en profundas llega a la
     * cintura. Así el efecto se mantiene en Pokémon de distintos tamaños.
     */
    submergeShallow: 0.34,
    submergeDeep: 0.58,
    /** Velocidad (1/s) con la que el sprite se hunde o emerge. */
    submergeLerp: 7,
  },
  sun: {
    /**
     * Sombras direccionales que proyecta el sol sobre el mapa. Desactivadas
     * por defecto: el mundo ya tiene las sombras de contacto de los actores y
     * el decal de sombra de la niebla.
     */
    shadows: false,
    /** Resolución del shadow map; más alto = bordes más finos y más coste. */
    shadowResolution: 2048,
    /** Distancia (u) a la cámara hasta la que se dibujan sombras del sol. */
    shadowDistance: 48,
    normalOffsetBias: 0.04,
    shadowBias: 0.25,
  },
  fog: {
    color: [0.73, 0.87, 0.96] as [number, number, number],
    near: 34,
    far: 96,
  },
  vision: {
    /**
     * Margen extra (u) al pasar de oculto a visible. Evita el parpadeo justo en
     * el borde del radio sin introducir un tercer estado de render.
     */
    hysteresis: 0.2,
    /** Tope de ocultación: nunca se vuelve imposible ver a alguien pegado. */
    maxConcealment: 0.85,
    /**
     * Opacidad del sombreado fuera de la visión, por vista. Se aplica como
     * uniforme del material de niebla.
     */
    fogOpacity: 0.64,
    /** Color del sombreado, en 0-1 (sRGB). */
    fogColor: [0.016, 0.039, 0.086] as [number, number, number],
    /** Ancho del borde suave, como fracción del radio de visión. */
    fogFeather: 0.06,
  },
} as const;
