/**
 * Trigonometría cacheada para los efectos que se animan desde JavaScript.
 *
 * Muchas partículas (hojas, gotas, esquirlas, chispas) tienen un ángulo fijo
 * que solo sirve para repartirlas en círculo. Calcular `Math.cos` y
 * `Math.sin` de ese mismo ángulo en cada frame es trabajo repetido: en una
 * escena con varios impactos y proyectiles a la vez se acumulan cientos de
 * llamadas idénticas. El par se calcula una sola vez al crear el efecto y el
 * bucle de animación solo multiplica.
 */

/** Coseno y seno de un ángulo que no cambia durante la vida del efecto. */
export interface Polar {
  /** Coseno del ángulo, en el intervalo [-1, 1]. */
  readonly cos: number;
  /** Seno del ángulo, en el intervalo [-1, 1]. */
  readonly sin: number;
}

/**
 * Devuelve el par coseno/seno de un ángulo fijo para reutilizarlo en cada
 * frame. Se llama en el `spawn` del efecto, nunca dentro del `update`.
 */
export function polar(angle: number): Polar {
  return { cos: Math.cos(angle), sin: Math.sin(angle) };
}
