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
  debug: {
    /**
     * Dibuja bajo cada Pokémon un círculo con su hurtbox real (el radio que
     * usan los golpes). Solo para pruebas: no afecta al combate. Ponlo a `true`
     * para activarlo.
     */
    showHitboxes: false as boolean,
    /**
     * Overlay con las fases del casteo (startup/active/recovery), el frame
     * manual y los marcadores Hit/Return del clip. Solo para depuración.
     */
    showCastTimings: false as boolean,
  },
  performance: {
    /**
     * Precompila durante la carga los shaders de los efectos de las especies
     * que juegan la partida. Evita el tirón del primer casteo de cada estilo.
     */
    warmUpShaders: true as boolean,
    /**
     * Efectos creados por lote de precarga. Menos = menos pico de memoria y
     * menos bloqueo del hilo principal; el catálogo completo se calienta igual.
     */
    warmUpBatchSize: 2,
    /**
     * Presupuesto de téxeles de la textura del suelo (ancho × alto). El mapa de
     * estrés `perf-256` pedía 8 M de píxeles (2828 px de lado); con 4 M baja a
     * 2000 px, así que el pintado y, sobre todo, la subida inicial a la GPU se
     * reducen a la mitad. Los mapas pequeños no cambian porque ya van topados
     * por `maxPixelsPerUnit` o por su propio tamaño.
     *
     * Si hiciera falta más margen en equipos muy modestos, se puede bajar a
     * 2 M (1414 px en `perf-256`) a costa de perder detalle fino en el suelo.
     */
    groundTexturePixels: 4_000_000,
    /**
     * Resolución dinámica. Si la partida baja de `lowerFps` durante
     * `lowerDelay` segundos, se reduce `device.maxPixelRatio` un escalón; si
     * vuelve a ir por encima de `raiseFps` durante `raiseDelay`, se recupera.
     * Solo cambia la resolución interna: la jugabilidad y el aspecto de los
     * efectos se mantienen.
     */
    dynamicResolution: {
      enabled: true as boolean,
      /** Ventana de muestreo, en segundos. */
      sampleSeconds: 1,
      /** Por debajo de estos FPS se reduce la resolución. */
      lowerFps: 48,
      /** Por encima de estos FPS se intenta recuperar. */
      raiseFps: 58,
      /** Tiempo que debe mantenerse la caída antes de bajar un escalón. */
      lowerDelay: 2,
      /** Tiempo que debe mantenerse la mejora antes de subir un escalón. */
      raiseDelay: 6,
      /** Fracción mínima del presupuesto de píxeles inicial. */
      minScale: 0.6,
      /** Tamaño de cada escalón. */
      step: 0.1,
    },
    /**
     * Filtrado anisotrópico de las texturas del suelo y del agua. Sin él, las
     * líneas finas del terreno (grietas, losetas, guijarros) se ven como peines
     * verticales y **centellean** al caminar. Se recorta al máximo del
     * dispositivo; `1` lo desactiva.
     */
    anisotropy: 8,
    /**
     * Tope de `devicePixelRatio` durante una partida. Con muchas vistas se baja
     * más para repartir el mismo presupuesto de píxeles entre todos los
     * viewports. Lo usan `matchSession` (resolución) y la densidad de texturas,
     * para que ambas cuentas no se desincronicen.
     */
    matchPixelRatio: {
      default: 1.5,
      manyViews: 1.2,
      manyViewsThreshold: 4,
    },
    /**
     * Techo de píxeles internos de la partida (ancho × alto). En pantallas 4K
     * o con `devicePixelRatio` alto, el tope por DPR sigue pidiendo 6-8 M de
     * píxeles; los modelos 3D con texturas de 1024 y el contorno hacen que ese
     * relleno sea el cuello de botella. Con un presupuesto fijo la resolución
     * baja proporcionalmente en las pantallas grandes y se queda igual en
     * 1080p. La resolución dinámica sigue actuando por debajo de este valor.
     */
    matchPixelBudget: 3_200_000,
    /**
     * LOD de animación por distancia al foco de la cámara. Los cuerpos lejanos
     * siguen dibujándose (y con su contorno), pero el esqueleto se evalúa a
     * `interval` segundos en vez de cada frame. El jugador y los combatientes
     * cercanos mantienen la animación completa.
     */
    animationLod: {
      enabled: true as boolean,
      /** Distancia horizontal al foco de la cámara, en unidades de mundo. */
      distance: 20,
      /** Intervalo de actualización para los cuerpos lejanos. */
      interval: 0.05,
      /** Nunca bajar de este intervalo aunque se configure más bajo. */
      minInterval: 0.016,
    },
  },
  terrainTexture: {
    /**
     * Endereza las juntas entre terrenos distintos: cada esquina convexa de la
     * rejilla se sustituye por un chaflán recto para que los bordes diagonales
     * se lean como líneas continuas. Con `false` se conserva el borde ortogonal
     * original. Solo afecta al dibujo de la textura del suelo.
     */
    straightJoints: true as boolean,
    /**
     * Tamaño del chaflán, como fracción del lado menor de la celda (rango
     * 0-0,5). Más alto = cortes más largos y un borde más recto; más bajo =
     * esquinas más sutiles. `0` desactiva los chaflanes.
     */
    jointChamfer: 0.5,
    /**
     * Contorno oscuro alrededor de los calveros decorativos. Desactivado, el
     * terreno se lee solo por su color y su detalle superficial.
     */
    zoneBorders: false as boolean,
  },
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
    filter: "smooth" as "nearest" | "smooth" | "linear",
    /**
     * Factor de precarga del modo 'smooth'. Más alto = contorno más nítido
     * (menos radio de suavizado) y más memoria de textura.
     * 2 = suave, 3 = equilibrado, 4 = casi nítido.
     */
    smoothScale: 4,
    /**
     * Presupuesto de memoria de las hojas de un Pokémon, en MB.
     * `0` = automático: se estima la GPU (renderer + RAM + límite de textura) y
     * se reparte entre los aspectos de la partida. Un valor > 0 fija el
     * presupuesto por aspecto y desactiva la estimación.
     *
     * El motor reparte la escala entre las animaciones: las pequeñas suben a
     * `smoothScale` y las grandes (ataques de legendarios, QuickStrike) bajan
     * solo lo necesario, sin bajar de ×2 mientras haya margen.
     */
    textureBudgetMB: 0,
    /**
     * Suaviza el recorte alfa usando las muestras del MSAA (`antialias`). En
     * modo 'smooth' el borde ya tiene alfa parcial, así que redondea el
     * contorno; en 'nearest' apenas se nota (alfa de 1 bit).
     */
    alphaToCoverage: true,
    /**
     * Alto de viewport (píxeles de dispositivo) por debajo del cual se activan
     * los ajustes de detalle reducido: el contorno de equipo se engorda para
     * seguir leyéndose y la silueta de oclusión del dueño se desactiva, porque a
     * ese tamaño ocupa más de lo que ayuda. En escritorio con 1-4 vistas no se
     * activa nunca; sí en móvil, WebView o ventanas pequeñas con 8 vistas.
     */
    smallViewportPx: 300,
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
    /**
     * Margen más allá del final de la niebla antes de recortar la cámara de
     * juego. Todo lo que quede detrás ya es invisible, así que no hace falta
     * cullarlo ni enviarlo a la GPU.
     */
    fogMargin: 24,
    pitch: PITCH_DEG,
    distance: 17,
    /**
     * Con 3 o más vistas la cámara se aleja un poco para que quepa más mundo en
     * cada viewport. La densidad de texturas usa la misma distancia.
     */
    splitDistanceScale: 1.12,
    minDistance: 10,
    maxDistance: 27,
    /** Rad/s con la cámara girando a tope (`Q`/`E` o cruceta). */
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
    radius: 0.42,
    /**
     * Si es true, cada especie usa su radio de impacto de `POKEMON_HIT_RADIUS`
     * (`src/game/roster.ts`). Si es false, todo el roster comparte `radius`.
     *
     * Solo afecta a los golpes de habilidades (hurtbox). La colisión de
     * movimiento, la separación entre cuerpos y la navegación de los bots
     * siguen usando `radius` para todos.
     */
    perPokemonHitbox: true as boolean,
    acceleration: 16,
    deceleration: 20,
    /**
     * Rad/s con los que el vector de avance gira hacia la dirección de entrada.
     * Alto = giro casi instantáneo; bajo = el Pokémon traza curvas amplias y
     * parece derrapar.
     */
    turnRate: 24,
    /**
     * Cambio de rumbo (grados) a partir del cual la velocidad se invierte en
     * seco en vez de girar progresivamente. Sin esto, un cambio a la dirección
     * opuesta trazaba un pequeño arco lateral antes de volver.
     */
    turnSnapAngle: 135,
    /** Suavizado del sprite hacia el rumbo de avance (1/s). */
    turnLerp: 24,
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
     * la máscara de sombra de la niebla.
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
  combat: {
    /** KOs de equipo necesarios para ganar la partida. */
    koTarget: 15,
    /** Segundos que se tarda en reaparecer tras un KO. */
    respawnSeconds: 5,
    /** Segundos de invulnerabilidad al reaparecer. */
    invulnerabilitySeconds: 2,
    /** Bloqueo breve al recibir un golpe. Menor que el enfriamiento de Placaje. */
    hitstunSeconds: 0.15,
    /** Stun del choque cuando dos melee rivales conectan a la vez. */
    clashStunSeconds: 0.25,
    /** Separación aplicada a ambos luchadores en un choque. */
    clashKnockback: 1,
    /**
     * Margen (u) con el que la línea de visión de la melee se separa de los
     * obstáculos. Los dos extremos son centros de jugador, que ya quedan a
     * `player.radius` de cualquier collider, así que este margen solo descarta
     * golpes que pasan rozando un árbol o una roca.
     */
    meleeSightPadding: 0.15,
    /**
     * Margen (u) al que se detiene el centro de un área antes de un obstáculo.
     * Evita que el telegraph y el daño se coloquen detrás de un muro.
     */
    aoeSightPadding: 0.25,
    /** Probabilidad de crítico (1/24 en la generación VII+). */
    critChance: 1 / 24,
    /** Multiplicador de daño de un crítico: +5 %. */
    critMultiplier: 1.05,
    /** Multiplicador de daño por STAB: +5 %. */
    stabMultiplier: 1.05,
    /** Rango del factor aleatorio oficial de daño. */
    randomMin: 0.85,
    randomMax: 1,
    /**
     * Ayuda de apuntado de proyectiles y haces para jugadores humanos. Se puede
     * activar o desactivar en Opciones. Solo corrige el ángulo cuando el rival
     * ya está cerca de la mira; no cambia el alcance ni busca objetivos fuera
     * de la dirección a la que apunta el cuerpo.
     */
    aimAssist: {
      /** Semiángulo del cono de adquisición, en grados. */
      maxAngle: 7,
      /** Fracción del error angular que se corrige (0,7 = 70 %). */
      strength: 0.7,
      /** Margen de los obstáculos al comprobar la línea de visión. */
      sightPadding: 0.12,
    },
  },
  telegraphs: {
    /**
     * Si es `true`, cada jugador solo dibuja las marcas de área, cono y carril
     * de haz de su propio Pokémon. Las marcas aliadas (mismo equipo, otra
     * plaza) se ocultan en su vista; las rivales se siguen viendo siempre que
     * la visión las alcance.
     *
     * Con `false` se muestran todas las marcas visibles, aliadas incluidas.
     */
    hideAllied: true as boolean,
  },
  damageNumbers: {
    /**
     * Si es `true`, cada vista solo muestra los números que afectan a su
     * jugador: el daño que hace y el que recibe (incluido el autodaño de
     * habilidades como Explosión) y la curación que reparte (también con
     * pociones) y la que recibe. El daño del entorno, como el clima, cuenta
     * como recibido.
     *
     * Con `false` se muestran todos los números visibles, de cualquier
     * Pokémon.
     */
    onlyOwn: true as boolean,
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
     * Cadencia de la visibilidad de actores. Cada cuántos pasos fijos (60 Hz)
     * se recalcula mientras alguien se mueve. 3 = 20 Hz. El daño recibido, la
     * ocultación, el casteo, la muerte/respawn o un cambio de equipo fuerzan
     * el cálculo en el mismo paso.
     */
    actorRefreshSteps: 3,
    /** Cada cuántos pasos fijos se recalcula qué objetos ve cada equipo. 8 = 7,5 Hz. */
    pickupRefreshSteps: 8,
    /** Movimiento mínimo (u) para considerar que un observador se movió. */
    moveEpsilon: 0.12,
    /**
     * Opacidad del sombreado fuera de la visión, por vista. Se aplica como
     * uniforme del material de niebla.
     */
    fogOpacity: 0.64,
    /** Color del sombreado, en 0-1 (sRGB). */
    fogColor: [0.016, 0.039, 0.086] as [number, number, number],
    /** Ancho del borde suave, como fracción del radio de visión. */
    fogFeather: 0.06,
    /**
     * Máscara world-space de la niebla: sombras de cordilleras y árboles y
     * visibilidad de objetos. Es independiente del borde suave de pantalla,
     * que se sigue calculando cada frame en `FogView`.
     */
    mask: {
      /** Resolución del canvas y la textura: 192 = alta, 128 = equilibrada, 96 = rendimiento. */
      size: 128,
      /** Hz máximos de recompuesto. 0 = sin límite (cada frame con cambios). */
      updateHz: 15,
      /** Movimiento mínimo (u) de un observador para recomponer la máscara. */
      moveEpsilon: 0.12,
      /** Rejilla espacial para no recorrer todos los oclusores en cada observador. */
      spatialGrid: true,
      /** Lado (u) de la celda de la rejilla de oclusores. */
      gridCellSize: 10,
      /** Longitud (u) de las cuñas de sombra. Menos = menos relleno. */
      shadowLength: 40,
    },
  },
} as const;
