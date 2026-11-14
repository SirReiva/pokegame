/** Opciones y hooks de construcción del mundo. */

import type { GameMap } from '../../terrain';

export interface BuildWorldOptions {
  /**
   * Mapa que se va a construir. Si falta, se usa el activo.
   *
   * Pasarlo explícitamente permite construir el mundo nuevo sin tocar el estado
   * global (`setActiveMap`), así que el mundo que sigue en pantalla no cambia de
   * terreno mientras el siguiente se genera.
   */
  map?: GameMap;
  /**
   * Suelo ya pintado. `Game` lo genera de forma asíncrona antes de construir el
   * mundo para que la pestaña no se congele; si falta, se pinta aquí mismo.
   */
  groundCanvas?: HTMLCanvasElement;
}

export interface BuildWorldHooks {
  /** Progreso de 0 a 1. */
  onProgress?: (fraction: number) => void;
  /** Si devuelve `true`, se abandona la construcción. */
  isCancelled?: () => boolean;
}
