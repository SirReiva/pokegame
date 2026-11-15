/**
 * Detalle de los sprites según el tamaño del viewport.
 *
 * La densidad de las hojas ya se decide por lo que ocupa un sprite en pantalla
 * (`spriteDensity.ts`). Este módulo resuelve el otro extremo: qué adornos
 * siguen compensando cuando cada viewport es diminuto (móvil, WebView o una
 * ventana pequeña partida en 8).
 *
 * Se mantiene aparte de `sprite.ts` para poder probarlo sin PlayCanvas: aquí
 * solo hay aritmética sobre el manifiesto.
 */

import { CONFIG } from './config';

/**
 * Lo mínimo que necesita este módulo de un aspecto: el alto del arte de `idle`
 * en píxeles originales. Se declara aquí (y no importando `SpriteAsset`) para
 * que el módulo no dependa de `sprite.ts`, que a su vez lo usa a él.
 */
export interface SpriteOutlineSource {
  skin: {
    animations: {
      idle: {
        frameHeight: number;
        content?: { top: number; bottom: number } | null;
      };
    };
  };
}

/**
 * Contorno de equipo de los Pokémon ajenos, en proporción al alto del arte.
 *
 * Lo dibuja el propio material del sprite dilatando el alfa (`spriteOutline.ts`),
 * así que el grosor se mide en píxeles del arte original y se traduce a UV en
 * cada frame.
 */
const OUTLINE_HEIGHT_RATIO = 0.045;
/** Mínimo para las especies pequeñas, en píxeles de arte. */
const OUTLINE_MIN_ART_PIXELS = 0.75;
/** En pantallas muy pequeñas se engorda: el borde quedaría bajo el píxel. */
const OUTLINE_SMALL_VIEW_BOOST = 1.25;

/** Alto del arte de `idle` en píxeles originales. */
function outlineArtHeight(asset: SpriteOutlineSource): number {
  const idle = asset.skin.animations.idle;
  return idle.content
    ? idle.content.top + idle.content.bottom + 1
    : idle.frameHeight;
}

/** `true` si el viewport es tan pequeño que conviene recortar detalle. */
export function isSmallViewport(viewportHeightPx: number): boolean {
  return viewportHeightPx > 0 && viewportHeightPx < CONFIG.sprite.smallViewportPx;
}

/**
 * Grosor del contorno de un sprite concreto, en píxeles de arte, para un
 * viewport de `viewportHeightPx` píxeles de dispositivo.
 */
export function spriteOutlineWidth(
  asset: SpriteOutlineSource,
  viewportHeightPx: number
): number {
  const base = Math.max(
    OUTLINE_MIN_ART_PIXELS,
    outlineArtHeight(asset) * OUTLINE_HEIGHT_RATIO
  );
  return base * (isSmallViewport(viewportHeightPx) ? OUTLINE_SMALL_VIEW_BOOST : 1);
}
