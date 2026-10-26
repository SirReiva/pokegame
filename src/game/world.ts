import * as pc from 'playcanvas';
import { CONFIG } from './config';
import {
  createBarkCanvas,
  createGroundCanvas,
  createLeafCanvas,
  createRockCanvas,
  createShadowCanvas,
  createSkyCanvas,
  createSoilCanvas,
  createWaterCanvas,
  textureFromCanvas
} from './textures';

export type Collider =
  | { type: 'circle'; x: number; z: number; radius: number }
  | { type: 'segment'; ax: number; az: number; bx: number; bz: number; radius: number };

export interface World {
  colliders: Collider[];
  bounds: number;
  pond: { x: number; z: number; radius: number };
  shadowMaterial: pc.StandardMaterial;
  update(dt: number): void;
  dispose(): void;
}

const HALF = CONFIG.world.groundSize / 2;
const PLAZA = { x: 0, z: 0, radius: 4.8 };
const POND = { x: 9.6, z: -8.4, radius: 3.3 };

function hex(value: string): pc.Color {
  const n = Number.parseInt(value.replace('#', ''), 16);
  return new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

interface StandardOptions {
  diffuse?: string;
  diffuseMap?: pc.Texture;
  emissive?: string;
  specular?: string;
  gloss?: number;
  opacity?: number;
  blend?: number;
  depthWrite?: boolean;
  tiling?: [number, number];
  cull?: number;
  useFog?: boolean;
  useLighting?: boolean;
}

function standard(options: StandardOptions): pc.StandardMaterial {
  const material = new pc.StandardMaterial();
  material.useMetalness = false;
  material.diffuse = hex(options.diffuse ?? '#ffffff');
  material.specular = hex(options.specular ?? '#1a1a1a');
  material.gloss = options.gloss ?? 0.2;
  material.emissive = hex(options.emissive ?? '#000000');
  material.opacity = options.opacity ?? 1;
  material.blendType = options.blend ?? pc.BLEND_NONE;
  material.depthWrite = options.depthWrite ?? true;
  material.useFog = options.useFog ?? true;
  material.useLighting = options.useLighting ?? true;
  material.useSkybox = false;
  material.cull = options.cull ?? pc.CULLFACE_BACK;
  if (options.diffuseMap) {
    material.diffuseMap = options.diffuseMap;
    if (options.tiling) {
      material.diffuseMapTiling = new pc.Vec2(options.tiling[0], options.tiling[1]);
    }
  }
  material.update();
  return material;
}

interface PartOptions {
  position?: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
}

type PrimitiveType = 'box' | 'capsule' | 'cone' | 'cylinder' | 'plane' | 'sphere' | 'torus';

function part(
  parent: pc.Entity,
  type: PrimitiveType,
  material: pc.Material,
  options: PartOptions = {}
): pc.Entity {
  const entity = new pc.Entity(`${type}-part`);
  entity.addComponent('render', { type });
  const render = entity.render!;
  render.material = material;
  render.castShadows = true;
  render.receiveShadows = true;
  if (options.position) entity.setLocalPosition(...options.position);
  if (options.scale) entity.setLocalScale(...options.scale);
  if (options.rotation) entity.setLocalEulerAngles(...options.rotation);
  parent.addChild(entity);
  return entity;
}

export function buildWorld(app: pc.Application): World {
  const device = app.graphicsDevice;
  const colliders: Collider[] = [];
  const created: pc.Entity[] = [];
  const materials: pc.StandardMaterial[] = [];

  // --- Texturas procedurales -------------------------------------------------
  const groundTexture = textureFromCanvas(
    device,
    createGroundCanvas(1024, { half: HALF, plaza: PLAZA, pond: POND }),
    { name: 'ground', mipmaps: true, magFilter: pc.FILTER_NEAREST }
  );
  const soilTexture = textureFromCanvas(device, createSoilCanvas(), {
    name: 'soil',
    repeat: true,
    mipmaps: true,
    magFilter: pc.FILTER_NEAREST
  });
  const waterTexture = textureFromCanvas(device, createWaterCanvas(), {
    name: 'water',
    repeat: true,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  const shadowTexture = textureFromCanvas(device, createShadowCanvas(), {
    name: 'blob-shadow',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  const skyTexture = textureFromCanvas(device, createSkyCanvas(), {
    name: 'sky',
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
  const barkTexture = textureFromCanvas(device, createBarkCanvas(), {
    ...pixelOptions,
    name: 'bark-pixel'
  });
  const leafTextures = [0, 1, 2].map((variant) =>
    textureFromCanvas(device, createLeafCanvas(variant), {
      ...pixelOptions,
      name: `leaf-pixel-${variant}`
    })
  );
  const rockTextures = [0, 1].map((variant) =>
    textureFromCanvas(device, createRockCanvas(variant), {
      ...pixelOptions,
      name: `rock-pixel-${variant}`
    })
  );

  // --- Ajustes de escena -----------------------------------------------------
  app.scene.ambientLight = new pc.Color(0.46, 0.5, 0.55);
  const fog = app.scene.fog;
  fog.type = pc.FOG_LINEAR;
  fog.color = new pc.Color(...CONFIG.fog.color);
  fog.start = CONFIG.fog.near;
  fog.end = CONFIG.fog.far;

  // --- Luces ---------------------------------------------------------------
  const sun = new pc.Entity('sun');
  sun.addComponent('light', {
    type: 'directional',
    color: hex('#fff1d6'),
    intensity: 1.65,
    castShadows: true,
    shadowResolution: 2048,
    shadowDistance: 48,
    normalOffsetBias: 0.04,
    shadowBias: 0.25
  });
  sun.setLocalEulerAngles(52, -34, 0);
  app.root.addChild(sun);
  created.push(sun);

  const fill = new pc.Entity('fill');
  fill.addComponent('light', {
    type: 'directional',
    color: hex('#9dc7ff'),
    intensity: 0.35,
    castShadows: false
  });
  fill.setLocalEulerAngles(30, 150, 0);
  app.root.addChild(fill);
  created.push(fill);

  // --- Suelo ---------------------------------------------------------------
  const grassMaterial = standard({
    diffuseMap: groundTexture,
    specular: '#000000',
    gloss: 0.05
  });
  const soilMaterial = standard({
    diffuse: '#a9855e',
    diffuseMap: soilTexture,
    tiling: [6, 6],
    specular: '#000000',
    gloss: 0.02
  });
  materials.push(grassMaterial, soilMaterial);

  const slab = part(app.root, 'box', soilMaterial, {
    position: [0, -0.55, 0],
    scale: [HALF * 2, 1.1, HALF * 2]
  });
  slab.render!.castShadows = false;
  created.push(slab);

  const ground = part(app.root, 'plane', grassMaterial, {
    position: [0, 0.001, 0],
    scale: [HALF * 2, 1, HALF * 2]
  });
  ground.render!.castShadows = false;
  ground.render!.receiveShadows = true;
  created.push(ground);

  // --- Estanque ------------------------------------------------------------
  const waterMaterial = standard({
    diffuseMap: waterTexture,
    diffuse: '#e8f8ff',
    tiling: [2.5, 2.5],
    specular: '#cfefff',
    gloss: 0.9,
    opacity: 0.9,
    blend: pc.BLEND_NORMAL,
    depthWrite: false,
    emissive: '#123a4d'
  });
  const pondBedMaterial = standard({ diffuse: '#2c6c8f', specular: '#000000', gloss: 0.1 });
  const lilyMaterial = standard({ diffuse: '#4f9a49', specular: '#000000', gloss: 0.3 });
  materials.push(waterMaterial, pondBedMaterial, lilyMaterial);

  const pondBed = part(app.root, 'cylinder', pondBedMaterial, {
    position: [POND.x, 0.012, POND.z],
    scale: [POND.radius * 2, 0.02, POND.radius * 2]
  });
  pondBed.render!.castShadows = false;
  created.push(pondBed);

  const water = part(app.root, 'cylinder', waterMaterial, {
    position: [POND.x, 0.055, POND.z],
    scale: [POND.radius * 2, 0.05, POND.radius * 2]
  });
  water.render!.castShadows = false;
  created.push(water);

  const lilySpots: Array<[number, number, number]> = [
    [POND.x - 1.4, POND.z + 0.7, 0.55],
    [POND.x + 1.5, POND.z - 0.9, 0.42],
    [POND.x + 0.4, POND.z + 1.8, 0.34]
  ];
  for (const [x, z, size] of lilySpots) {
    const pad = part(app.root, 'cylinder', lilyMaterial, {
      position: [x, 0.085, z],
      scale: [size * 2, 0.02, size * 2]
    });
    pad.render!.castShadows = false;
    created.push(pad);
  }
  colliders.push({ type: 'circle', x: POND.x, z: POND.z, radius: POND.radius + 0.25 });

  // --- Vegetación ----------------------------------------------------------
  const trunkMaterial = standard({
    diffuseMap: barkTexture,
    specular: '#000000',
    gloss: 0.05
  });
  const leafMaterials = leafTextures.map((texture) =>
    standard({
      diffuseMap: texture,
      specular: '#0d1a0d',
      gloss: 0.12
    })
  );
  materials.push(trunkMaterial, ...leafMaterials);

  const trees: Array<[number, number, number]> = [
    [-15.6, -13.4, 1.05],
    [-11.6, -16.4, 0.85],
    [-17.2, -7.4, 0.95],
    [15.8, -13.6, 1.0],
    [12.0, -16.6, 0.8],
    [17.0, -5.2, 0.9],
    [-16.2, 10.2, 0.95],
    [-12.4, 15.4, 1.1],
    [-17.4, 3.6, 0.85],
    [16.4, 9.6, 1.0],
    [12.6, 14.8, 0.9],
    [17.2, 3.0, 0.85],
    [-7.6, -15.0, 0.9],
    [7.6, 16.6, 0.78],
    [3.2, -17.0, 0.95],
    [-3.6, 17.0, 0.72],
    // Bosquetes interiores: rellenan el mapa sin invadir la plaza, el
    // estanque, los caminos ni las rocas.
    [-9.4, -8.8, 0.92],
    [-11.2, -3.2, 0.86],
    [-7.4, 3.2, 0.78],
    [-10.2, 8.4, 0.88],
    [-6.0, 12.4, 0.82],
    [-3.0, 9.4, 0.76],
    [-15.0, 6.4, 0.72],
    [-13.2, -8.2, 0.82],
    [-8.2, -12.0, 0.9],
    [-2.4, -10.6, 0.84],
    [-4.4, -7.8, 0.76],
    [6.4, 9.6, 0.9],
    [10.2, 8.6, 0.84],
    [13.4, 6.4, 0.78],
    [4.8, 12.6, 0.8],
    [8.4, 13.2, 0.86],
    [15.0, 12.4, 0.9],
    [7.8, -1.0, 0.7],
    [15.2, -9.6, 0.76],
    [9.4, -14.0, 0.8],
    [3.0, -8.6, 0.78],
    [6.0, -16.0, 0.8]
  ];

  const random = (seed: number) => {
    let a = seed;
    return () => {
      a = (a * 1664525 + 1013904223) % 4294967296;
      return a / 4294967296;
    };
  };

  trees.forEach(([x, z, scale], index) => {
    const tree = new pc.Entity(`tree-${index}`);
    tree.setPosition(x, 0, z);
    tree.setLocalScale(scale, scale, scale);
    tree.setLocalEulerAngles(0, (index * 47) % 360, 0);
    app.root.addChild(tree);
    created.push(tree);

    part(tree, 'cylinder', trunkMaterial, {
      position: [0, 1.35, 0],
      scale: [0.42, 2.7, 0.42]
    });

    const rand = random(index * 977 + 13);
    const blobs: Array<[number, number, number, number]> = [
      [0, 3.1, 0, 1.42],
      [0.85, 3.7, 0.35, 1.0],
      [-0.8, 3.55, -0.3, 0.92],
      [0.1, 4.3, -0.1, 0.78]
    ];
    blobs.forEach(([bx, by, bz, radius], blobIndex) => {
      part(tree, 'sphere', leafMaterials[(index + blobIndex) % leafMaterials.length], {
        position: [bx + (rand() - 0.5) * 0.2, by, bz + (rand() - 0.5) * 0.2],
        scale: [radius * 2, radius * 1.8, radius * 2],
        rotation: [0, rand() * 180, 0]
      });
    });

    colliders.push({ type: 'circle', x, z, radius: 0.55 * scale });
  });

  // Rocas.
  const rockMaterials = rockTextures.map((texture) =>
    standard({
      diffuseMap: texture,
      specular: '#20242a',
      gloss: 0.18
    })
  );
  materials.push(...rockMaterials);
  const rocks: Array<[number, number, number]> = [
    [4.8, 6.9, 0.72],
    [-5.9, -4.4, 0.6],
    [13.4, -2.2, 0.85],
    [-8.6, 7.8, 0.55],
    [6.6, -12.0, 0.62],
    [-13.6, -2.6, 0.8],
    [10.4, 3.4, 0.5]
  ];
  rocks.forEach(([x, z, size], index) => {
    const rock = part(app.root, 'sphere', rockMaterials[index % rockMaterials.length], {
      position: [x, size * 0.35, z],
      scale: [size * 2.1, size * 1.25, size * 1.9],
      rotation: [0, index * 61, 0]
    });
    created.push(rock);
    colliders.push({ type: 'circle', x, z, radius: size * 0.8 });
  });

  // --- Valla al sur (deja un hueco para el camino) -------------------------
  const woodMaterial = standard({ diffuse: '#a97a4d', specular: '#2b1c10', gloss: 0.2 });
  materials.push(woodMaterial);
  const fenceZ = 17.1;
  for (let x = -11; x <= 11; x += 2.2) {
    if (Math.abs(x) < 2.4) continue;
    const post = part(app.root, 'box', woodMaterial, {
      position: [x, 0.55, fenceZ],
      scale: [0.18, 1.1, 0.18]
    });
    post.render!.castShadows = true;
    created.push(post);

    if (x + 2.2 <= 11 && Math.abs(x + 2.2) >= 2.4) {
      part(app.root, 'box', woodMaterial, {
        position: [x + 1.1, 0.82, fenceZ],
        scale: [2.2, 0.12, 0.09]
      });
      part(app.root, 'box', woodMaterial, {
        position: [x + 1.1, 0.45, fenceZ],
        scale: [2.2, 0.1, 0.09]
      });
    }
  }
  colliders.push(
    { type: 'segment', ax: -11.9, az: fenceZ, bx: -2.4, bz: fenceZ, radius: 0.25 },
    { type: 'segment', ax: 2.4, az: fenceZ, bx: 11.9, bz: fenceZ, radius: 0.25 }
  );

  // Cartel junto a la plaza.
  const sign = new pc.Entity('sign');
  sign.setPosition(3.9, 0, 5.4);
  sign.setLocalEulerAngles(0, -32, 0);
  app.root.addChild(sign);
  created.push(sign);
  part(sign, 'box', woodMaterial, { position: [0, 0.65, 0], scale: [0.14, 1.3, 0.14] });
  part(sign, 'box', woodMaterial, {
    position: [0, 1.32, 0],
    scale: [1.15, 0.62, 0.12],
    rotation: [0, 0, 2]
  });
  colliders.push({ type: 'circle', x: 3.9, z: 5.4, radius: 0.35 });

  // --- Cielo ---------------------------------------------------------------
  const skyMaterial = new pc.StandardMaterial();
  skyMaterial.useLighting = false;
  skyMaterial.useSkybox = false;
  skyMaterial.useFog = false;
  skyMaterial.diffuse = new pc.Color(0, 0, 0);
  skyMaterial.emissive = new pc.Color(1, 1, 1);
  skyMaterial.emissiveMap = skyTexture;
  skyMaterial.cull = pc.CULLFACE_FRONT;
  skyMaterial.depthWrite = false;
  skyMaterial.update();
  materials.push(skyMaterial);

  const sky = new pc.Entity('sky');
  sky.addComponent('render', { type: 'sphere' });
  sky.render!.material = skyMaterial;
  sky.render!.castShadows = false;
  sky.render!.receiveShadows = false;
  sky.setLocalScale(460, 460, 460);
  app.root.addChild(sky);
  created.push(sky);

  // --- Sombra de contacto --------------------------------------------------
  const shadowMaterial = new pc.StandardMaterial();
  shadowMaterial.useLighting = false;
  shadowMaterial.useSkybox = false;
  shadowMaterial.useFog = false;
  shadowMaterial.diffuse = new pc.Color(0, 0, 0);
  shadowMaterial.emissive = new pc.Color(0, 0, 0);
  shadowMaterial.opacityMap = shadowTexture;
  shadowMaterial.opacityMapChannel = 'a';
  shadowMaterial.opacity = 1;
  shadowMaterial.blendType = pc.BLEND_NORMAL;
  shadowMaterial.depthWrite = false;
  shadowMaterial.depthTest = true;
  shadowMaterial.cull = pc.CULLFACE_NONE;
  shadowMaterial.update();
  materials.push(shadowMaterial);

  let waterTime = 0;

  return {
    colliders,
    bounds: CONFIG.world.halfSize,
    pond: POND,
    shadowMaterial,
    update(dt: number) {
      waterTime += dt;
      waterMaterial.diffuseMapOffset = new pc.Vec2(waterTime * 0.012, waterTime * 0.02);
    },
    dispose() {
      for (const entity of created) entity.destroy();
      for (const material of materials) material.destroy();
      groundTexture.destroy();
      soilTexture.destroy();
      waterTexture.destroy();
      shadowTexture.destroy();
      skyTexture.destroy();
      barkTexture.destroy();
      for (const texture of leafTextures) texture.destroy();
      for (const texture of rockTextures) texture.destroy();
    }
  };
}
