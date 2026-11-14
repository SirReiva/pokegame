import * as pc from 'playcanvas';
import { CONFIG } from '../../config';
import { type GameMap, type TerrainZone } from '../../terrain';
import {
  createDustCanvas,
  createEmberCanvas,
  createFrostCanvas,
  createGroundCanvas,
  createMistCanvas,
  createPollenCanvas,
  createShadowCanvas,
  createSmokeCanvas,
  createSoilCanvas,
  createSparkCanvas,
  createWaterCanvas,
  createWispCanvas,
  groundTextureSize,
  textureFromCanvas
} from '../../textures';

/** Texturas procedurales creadas al principio de `buildWorldSteps`. */
export interface WorldTextures {
  ground: pc.Texture;
  soil: pc.Texture;
  shadow: pc.Texture;
  water: pc.Texture;
  waterGlint: pc.Texture;
  dust: pc.Texture;
  frost: pc.Texture;
  smoke: pc.Texture;
  mist: pc.Texture;
  ember: pc.Texture;
  wisp: pc.Texture;
  pollen: pc.Texture;
  spark: pc.Texture;
}

/**
 * Genera las texturas base del mundo cediendo el hilo entre cada una, con la
 * misma granularidad que tenía el bloque original de `buildWorldSteps`.
 */
export function* createWorldTextures(
  device: pc.GraphicsDevice,
  map: GameMap,
  zones: readonly TerrainZone[],
  groundCanvas: HTMLCanvasElement | undefined
): Generator<number, WorldTextures, void> {
  const ground = textureFromCanvas(
    device,
    groundCanvas ??
      createGroundCanvas(
        groundTextureSize(map, {
          maxTexels: CONFIG.performance.groundTexturePixels,
          maxSize: Math.min(device.maxTextureSize, 8192)
        }),
        {
          map,
          zones: [...zones]
        }
      ),
    { name: 'ground', mipmaps: true, magFilter: pc.FILTER_NEAREST, anisotropy: CONFIG.performance.anisotropy }
  );
  yield 1;
  const soil = textureFromCanvas(device, createSoilCanvas(), {
    name: 'soil',
    repeat: true,
    mipmaps: true,
    magFilter: pc.FILTER_NEAREST,
    anisotropy: CONFIG.performance.anisotropy
  });
  yield 1;
  const shadow = textureFromCanvas(device, createShadowCanvas(), {
    name: 'blob-shadow',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  yield 1;
  const water = textureFromCanvas(device, createWaterCanvas(), {
    name: 'water-surface',
    repeat: true,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    anisotropy: CONFIG.performance.anisotropy
  });
  yield 1;
  const waterGlint = textureFromCanvas(device, createWaterCanvas(96, 1), {
    name: 'water-glint',
    repeat: true,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    anisotropy: CONFIG.performance.anisotropy
  });
  yield 1;
  const dust = textureFromCanvas(device, createDustCanvas(), {
    name: 'desert-dust',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  yield 1;
  const frost = textureFromCanvas(device, createFrostCanvas(), {
    name: 'frost-flake',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  yield 1;
  const smoke = textureFromCanvas(device, createSmokeCanvas(), {
    name: 'swamp-smoke',
    repeat: true,
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  yield 1;
  const mist = textureFromCanvas(device, createMistCanvas(), {
    name: 'swamp-mist',
    repeat: true,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  yield 1;
  const ember = textureFromCanvas(device, createEmberCanvas(), {
    name: 'lava-ember',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  yield 1;
  const wisp = textureFromCanvas(device, createWispCanvas(), {
    name: 'ghost-wisp',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  yield 1;
  const pollen = textureFromCanvas(device, createPollenCanvas(), {
    name: 'fairy-pollen',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  yield 1;
  const spark = textureFromCanvas(device, createSparkCanvas(), {
    name: 'paramo-spark',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  yield 1;

  return { ground, soil, shadow, water, waterGlint, dust, frost, smoke, mist, ember, wisp, pollen, spark };
}
