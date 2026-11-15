/**
 * Densidad de téxeles de las hojas de sprite según lo que ocupan en pantalla.
 *
 * La escala de las hojas se decidía solo por memoria (`smoothScale` como
 * objetivo y un presupuesto como tope). En splitscreen eso sube detalle que el
 * jugador no puede ver: con 8 vistas cada sprite ocupa una fracción pequeña del
 * canvas y una hoja a ×4 sigue gastando los mismos MB.
 *
 * Este módulo estima cuántos téxeles hacen falta por píxel de pantalla en la
 * vista más pequeña de la partida y devuelve el techo de escala que conviene
 * cargar. Es una heurística deliberadamente conservadora con el rendimiento:
 * redondea al entero más cercano y nunca supera el techo del modo de filtrado.
 */

import { CONFIG, DEG } from './config';
import { computeSplitLayout, matchPixelRatio } from './multiplayer';

/** Escala mínima: por debajo de ×1 no hay nada que recortar. */
const MIN_SCALE = 1;

export interface SpriteDensityInput {
  /** Jugadores humanos de la partida; cada uno recibe su propio viewport. */
  humanCount: number;
  /** Alto del canvas en píxeles CSS (la ventana, con `FILLMODE_FILL_WINDOW`). */
  cssHeight: number;
  /** `window.devicePixelRatio`. */
  devicePixelRatio: number;
  /**
   * Techo del modo de filtrado: `SPRITE_TEXTURE_SCALE`. En 'nearest' y
   * 'linear' vale 1 y la densidad no puede subirlo.
   */
  maxScale: number;
}

/**
 * Escala de textura que iguala (o se queda justo por debajo de) un tétexel por
 * píxel de pantalla en la vista más pequeña.
 *
 * El tamaño en pantalla de un sprite es
 * `altoDelArte × PIXEL_SCALE × píxelesPorUnidad`. El estiramiento vertical del
 * billboard (`1 / cos(pitch)`) y el escorzo de la cámara (`cos(pitch)`) se
 * cancelan, así que no aparecen en la cuenta.
 */
export function spriteDensityScale(input: SpriteDensityInput): number {
  const maxScale = Math.max(MIN_SCALE, input.maxScale);
  // Sin una altura fiable (SSR, canvas oculto) no hay nada que estimar: se
  // mantiene el techo del modo de filtrado.
  if (!(input.cssHeight > 0) || !Number.isFinite(input.cssHeight)) {
    return maxScale;
  }
  const views = Math.max(1, Math.min(8, Math.round(input.humanCount) || 1));
  const rowHeight = computeSplitLayout(views)[0]?.h ?? 1;
  const ratio = matchPixelRatio(input.devicePixelRatio, views);
  const viewportPx = Math.max(1, input.cssHeight * ratio * rowHeight);
  const distance =
    CONFIG.camera.distance * (views > 2 ? CONFIG.camera.splitDistanceScale : 1);

  const halfFov = (CONFIG.camera.fov * DEG) / 2;
  const pxPerUnit = viewportPx / (2 * distance * Math.tan(halfFov));
  const texelsPerPixel = CONFIG.sprite.pixelScale * pxPerUnit;

  return Math.min(maxScale, Math.max(MIN_SCALE, Math.round(texelsPerPixel)));
}
