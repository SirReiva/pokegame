import * as pc from 'playcanvas';

/**
 * Esténcil de las superficies que la niebla de guerra no debe teñir.
 *
 * El quad de niebla se dibuja sin test de profundidad y calcula su sombra con
 * el punto del suelo que queda detrás de cada píxel. Eso hacía que una
 * cordillera vista de frente —o la mitad superior de un Pokémon alto— se
 * oscureciera con la sombra que había detrás de su cabeza, aunque la línea de
 * visión fuera directa.
 *
 * Estas superficies escriben 1 en los píxeles visibles; la niebla solo pinta
 * donde el esténcil sigue a 0. El buffer se limpia por cámara (ver
 * `CameraRig`), así que cada viewport empieza en 0.
 */
export const FOG_EXCLUDED_STENCIL = new pc.StencilParameters({
  func: pc.FUNC_ALWAYS,
  ref: 1,
  readMask: 0xff,
  writeMask: 0xff,
  fail: pc.STENCILOP_KEEP,
  zfail: pc.STENCILOP_KEEP,
  zpass: pc.STENCILOP_REPLACE
});
