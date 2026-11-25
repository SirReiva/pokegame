/** Ajustes de generación que solo afectan a la decoración del mundo. */

/**
 * Tope de cristales por región de escarcha. Sin él, una zona grande generaba
 * miles de instancias sin aportar más detalle visible; el resto de decoraciones
 * ya tienen un límite equivalente.
 */
export const MAX_ICE_CLUSTERS_PER_ZONE = 900;

/**
 * Interruptor temporal de árboles: con `false` no se genera ninguno (ni los de
 * la jungla ni los secos del bosque umbrío) y tampoco sus colliders, así que
 * dejan de tapar la visión. Ponlo a `true` para recuperar el bosque tal cual.
 */
export const SPAWN_TREES = false;

/**
 * Escala vertical de los picos de cordillera. 1 = altura original; 0.7 deja las
 * crestas un 30% más bajas sin tocar su huella en el suelo (colliders, visión y
 * anchura del trazado siguen igual).
 */
export const MOUNTAIN_HEIGHT_SCALE = 0.7;

/**
 * Altura de los muros. La colisión y la visión usan el mismo ancho que en las
 * cordilleras; solo cambia la malla, así que esta altura es puramente visual.
 */
export const WALL_HEIGHT = 2.3;

/**
 * Láminas continuas de niebla/polvo en regiones grandes. Desactivadas por
 * ahora: las regiones grandes se quedan sin efecto hasta que se ajuste el
 * diseño. Los charcos pequeños conservan sus partículas de siempre.
 */
export const LARGE_REGION_WEATHER = false;

/** Lado máximo de cada foco de niebla antes de dividir la ciénaga. */
export const SWAMP_MIST_TILE = 40;

/** Altura del plano de suelo del mapa. */
export const GROUND_LEVEL = 0.001;

/**
 * Separación de la lámina de agua sobre el suelo. Es solo lo justo para que no
 * parpadee contra el plano del suelo (z-fighting); visualmente queda a ras.
 */
export const WATER_SURFACE_LIFT = 0.003;
