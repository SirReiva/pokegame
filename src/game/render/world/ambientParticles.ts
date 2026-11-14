/**
 * Definición de los lotes de partículas ambientales.
 *
 * Cada tipo comparte malla y material; el movimiento se calcula en el vertex
 * shader. Los colores, tamaños y tiempos reproducen las curvas de los antiguos
 * `ParticleSystem` por foco.
 */

import type * as pc from 'playcanvas';
import { BatchedParticles } from '../../batchedParticles';

export interface AmbientParticleTextures {
  dust: pc.Texture;
  frost: pc.Texture;
  ember: pc.Texture;
  smoke: pc.Texture;
  pollen: pc.Texture;
  spark: pc.Texture;
  wisp: pc.Texture;
}

export function createAmbientParticles(
  textures: AmbientParticleTextures
): BatchedParticles {
  const particles = new BatchedParticles();
  particles.define('dust', {
    texture: textures.dust,
    colorStart: [1, 0.96, 0.84],
    colorEnd: [1, 0.84, 0.7],
    opacity: 0.4,
    sizeStart: 0.26,
    sizeMid: 0.7,
    sizeEnd: 0.95,
    lifetime: 5.5,
    fadeIn: 0.2,
    fadeOut: 0.65,
    drift: [0.11, 0.06, 0.055],
    sway: 0.12,
    swaySpeed: 0.35
  });
  particles.define('snow', {
    texture: textures.frost,
    colorStart: [0.86, 0.94, 1],
    colorEnd: [1, 1, 1],
    opacity: 0.7,
    sizeStart: 0.06,
    sizeMid: 0.1,
    sizeEnd: 0.08,
    lifetime: 5.2,
    fadeIn: 0.12,
    fadeOut: 0.72,
    drift: [0.05, -0.39, 0.03],
    sway: 0.05,
    swaySpeed: 0.6
  });
  particles.define('embers', {
    texture: textures.ember,
    additive: true,
    colorStart: [1, 0.86, 0.38],
    colorEnd: [0.85, 0.42, 0.1],
    opacity: 0.9,
    sizeStart: 0.05,
    sizeMid: 0.1,
    sizeEnd: 0.04,
    lifetime: 3.4,
    fadeIn: 0.08,
    fadeOut: 0.62,
    drift: [0.07, 0.37, 0.045],
    sway: 0.06,
    swaySpeed: 1.4,
    drawOrder: 2
  });
  particles.define('fireSmoke', {
    texture: textures.smoke,
    colorStart: [0.62, 0.5, 0.44],
    colorEnd: [0.5, 0.44, 0.4],
    opacity: 0.42,
    sizeStart: 0.22,
    sizeMid: 0.48,
    sizeEnd: 1.05,
    lifetime: 5.2,
    fadeIn: 0.1,
    fadeOut: 0.7,
    drift: [0.05, 0.5, 0.035],
    sway: 0.04,
    swaySpeed: 0.4,
    drawOrder: 1
  });
  particles.define('pollen', {
    texture: textures.pollen,
    additive: true,
    colorStart: [1, 0.92, 0.66],
    colorEnd: [0.96, 0.78, 0.44],
    opacity: 0.8,
    sizeStart: 0.03,
    sizeMid: 0.06,
    sizeEnd: 0.02,
    lifetime: 6.2,
    fadeIn: 0.14,
    fadeOut: 0.55,
    drift: [0.08, 0.065, 0.085],
    sway: 0.1,
    swaySpeed: 1,
    drawOrder: 2
  });
  particles.define('sparks', {
    texture: textures.spark,
    additive: true,
    colorStart: [0.78, 0.96, 1],
    colorEnd: [0.44, 0.8, 1],
    opacity: 0.9,
    sizeStart: 0.018,
    sizeMid: 0.045,
    sizeEnd: 0.008,
    lifetime: 2.4,
    fadeIn: 0.18,
    fadeOut: 0.55,
    drift: [0.09, 0.145, 0.09],
    sway: 0.04,
    swaySpeed: 1.8,
    drawOrder: 2
  });
  particles.define('swampSmoke', {
    texture: textures.smoke,
    colorStart: [0.72, 0.78, 0.68],
    colorEnd: [0.55, 0.62, 0.5],
    opacity: 0.46,
    sizeStart: 0.38,
    sizeMid: 0.76,
    sizeEnd: 1.28,
    lifetime: 7,
    fadeIn: 0.2,
    fadeOut: 0.7,
    drift: [0.06, 0.14, 0.03],
    sway: 0.05,
    swaySpeed: 0.3,
    drawOrder: 2
  });
  particles.define('wisps', {
    texture: textures.wisp,
    additive: true,
    colorStart: [0.74, 0.96, 1],
    colorEnd: [0.4, 0.27, 0.86],
    opacity: 0.9,
    sizeStart: 0.04,
    sizeMid: 0.11,
    sizeEnd: 0.02,
    lifetime: 6.4,
    fadeIn: 0.16,
    fadeOut: 0.68,
    drift: [0.1, 0.075, 0.1],
    sway: 0.15,
    swaySpeed: 0.8,
    drawOrder: 2
  });
  particles.define('mist', {
    texture: textures.smoke,
    colorStart: [0.66, 0.6, 0.7],
    colorEnd: [0.8, 0.7, 0.86],
    opacity: 0.52,
    sizeStart: 0.38,
    sizeMid: 0.95,
    sizeEnd: 1.28,
    lifetime: 10.5,
    fadeIn: 0.2,
    fadeOut: 0.7,
    drift: [0.045, 0.02, 0.04],
    sway: 0.08,
    swaySpeed: 0.2,
    drawOrder: 1
  });
  return particles;
}
