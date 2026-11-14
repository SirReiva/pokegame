/**
 * Texturas de detalle del mundo: cielo, lluvia, vegetación pixel art, roca de
 * cordillera y sillería de muros.
 *
 * Se generan después de las texturas base del suelo y del agua; el generador
 * conserva los mismos puntos de cesión que tenía `buildWorldSteps`.
 */

import * as pc from 'playcanvas';
import {
  createBarkCanvas,
  createLeafCanvas,
  createMountainRockCanvas,
  createRainCanvas,
  createSkyCanvas,
  createWallStoneCanvas,
  textureFromCanvas
} from '../../textures';

export interface WorldDetailTextures {
  sky: pc.Texture;
  rain: pc.Texture;
  bark: pc.Texture;
  leaves: pc.Texture[];
  mountainRock: pc.Texture;
  wallStone: pc.Texture;
}

export function* createWorldDetailTextures(
  device: pc.GraphicsDevice
): Generator<number, WorldDetailTextures, void> {
  yield 1;
  const skyTexture = textureFromCanvas(device, createSkyCanvas(), {
    name: 'sky',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  yield 1;
  const rainTexture = textureFromCanvas(device, createRainCanvas(), {
    name: 'rain-drop',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });

  // Texturas pixel art de la vegetación y las rocas. Se generan a baja
  // resolución y se muestrean con NEAREST para que los téxeles se vean como
  // píxeles, no como una foto borrosa.
  const pixelOptions = {
    mipmaps: true,
    minFilter: pc.FILTER_NEAREST_MIPMAP_NEAREST,
    magFilter: pc.FILTER_NEAREST
  } as const;
  yield 1;
  const barkTexture = textureFromCanvas(device, createBarkCanvas(), {
    ...pixelOptions,
    name: 'bark-pixel'
  });
  yield 1;
  const leafTextures = [0, 1, 2].map((variant) =>
    textureFromCanvas(device, createLeafCanvas(variant), {
      ...pixelOptions,
      name: `leaf-pixel-${variant}`
    })
  );

  // Piedra marrón de las cordilleras: tile repetible con facetas pixel art y
  // nieve en la cima. Se muestrea sin suavizado para conservar los píxeles.
  yield 1;
  const mountainRockTexture = textureFromCanvas(device, createMountainRockCanvas(), {
    ...pixelOptions,
    name: 'mountain-rock',
    repeat: true,
    flipY: true
  });

  // Sillería gris de los muros: misma técnica de tile repetible.
  yield 1;
  const wallStoneTexture = textureFromCanvas(device, createWallStoneCanvas(), {
    name: 'wall-stone',
    repeat: true,
    mipmaps: true
  });

  return {
    sky: skyTexture,
    rain: rainTexture,
    bark: barkTexture,
    leaves: leafTextures,
    mountainRock: mountainRockTexture,
    wallStone: wallStoneTexture
  };
}
