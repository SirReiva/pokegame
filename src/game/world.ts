import * as pc from 'playcanvas';
import { CONFIG } from './config';
import { POND, PLAZA, TERRAIN_PATHS, TERRAIN_ZONES } from './terrain';
import {
  createBarkCanvas,
  createGroundCanvas,
  createLeafCanvas,
  createRockCanvas,
  createShadowCanvas,
  createSkyCanvas,
  createSoilCanvas,
  createWaterCanvas,
  createWaterMaskCanvas,
  textureFromCanvas
} from './textures';

export type Collider =
  | { type: 'circle'; x: number; z: number; radius: number }
  | { type: 'segment'; ax: number; az: number; bx: number; bz: number; radius: number };

export interface World {
  colliders: Collider[];
  bounds: number;
  pond: typeof POND;
  shadowMaterial: pc.StandardMaterial;
  update(dt: number): void;
  dispose(): void;
}

const HALF = CONFIG.world.groundSize / 2;

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

  // Orden transparente manual: primero las láminas de agua, después las
  // sombras de contacto y al final el anillo del jugador. Así el anillo nunca
  // queda teñido por el agua según desde donde mire la cámara.
  const worldLayer = app.scene.layers.getLayerById(pc.LAYERID_WORLD);
  if (worldLayer) worldLayer.transparentSortMode = pc.SORTMODE_MANUAL;

  // --- Texturas procedurales -------------------------------------------------
  const groundTexture = textureFromCanvas(
    device,
    createGroundCanvas(1024, {
      half: HALF,
      plaza: PLAZA,
      pond: POND,
      paths: TERRAIN_PATHS,
      zones: TERRAIN_ZONES
    }),
    { name: 'ground', mipmaps: true, magFilter: pc.FILTER_NEAREST }
  );
  const soilTexture = textureFromCanvas(device, createSoilCanvas(), {
    name: 'soil',
    repeat: true,
    mipmaps: true,
    magFilter: pc.FILTER_NEAREST
  });
  const shadowTexture = textureFromCanvas(device, createShadowCanvas(), {
    name: 'blob-shadow',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  const waterTexture = textureFromCanvas(device, createWaterCanvas(), {
    name: 'water-surface',
    repeat: true,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  const waterGlintTexture = textureFromCanvas(device, createWaterCanvas(96, 1), {
    name: 'water-glint',
    repeat: true,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  const waterMaskTexture = textureFromCanvas(device, createWaterMaskCanvas(), {
    name: 'water-mask',
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
  // El lecho está pintado en el suelo. Encima van dos láminas planas de agua
  // translúcida, sin grosor ni paredes: una base y una capa de brillos que se
  // desplazan en direcciones distintas. Juntas se leen como una superficie
  // viva, no como una bandeja elevada. La máscara radial disuelve el borde.
  const makeWaterMaterial = (
    map: pc.Texture,
    tiling: [number, number],
    opacity: number
  ): pc.StandardMaterial => {
    const material = standard({
      diffuse: '#d9f6ff',
      diffuseMap: map,
      tiling,
      specular: '#ffffff',
      gloss: 0.9,
      opacity,
      blend: pc.BLEND_NORMAL,
      depthWrite: false,
      cull: pc.CULLFACE_NONE
    });
    material.opacityMap = waterMaskTexture;
    material.opacityMapChannel = 'a';
    material.emissive = hex('#0f3b4d');
    material.update();
    materials.push(material);
    return material;
  };

  const waterSurfaceMaterial = makeWaterMaterial(waterTexture, [1.5, 1.5], 0.38);
  const waterGlintMaterial = makeWaterMaterial(waterGlintTexture, [1.9, 1.7], 0.32);

  const waterRadius = POND.radius + 0.35;
  const waterSurface = part(app.root, 'plane', waterSurfaceMaterial, {
    position: [POND.x, POND.surfaceHeight, POND.z],
    scale: [waterRadius * 2, 1, waterRadius * 2]
  });
  const waterGlints = part(app.root, 'plane', waterGlintMaterial, {
    position: [POND.x, POND.surfaceHeight + 0.004, POND.z],
    scale: [waterRadius * 2, 1, waterRadius * 2],
    rotation: [0, 62, 0]
  });
  for (const [index, surface] of [waterSurface, waterGlints].entries()) {
    surface.render!.castShadows = false;
    surface.render!.receiveShadows = false;
    const instance = surface.render!.meshInstances[0];
    if (instance) instance.drawOrder = index;
    created.push(surface);
  }

  // El agua profunda no es un collider fijo: depende del tipo del jugador y
  // se resuelve en `Game.resolvePosition`.

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
    [16.0, -10.2, 0.76],
    [9.2, -15.2, 0.8],
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
    [5.6, -12.2, 0.62],
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

  // --- Hierba alta ----------------------------------------------------------
  // Matas 3D de verdad: cada mata es una malla con varias briznas geométricas
  // (dos tramos y punta) y color por vértice de la base a la punta. Sin
  // texturas ni recortes: la hierba tiene volumen desde cualquier ángulo.
  const tallGrassMaterial = standard({
    diffuse: '#ffffff',
    specular: '#0a1a0a',
    gloss: 0.06,
    cull: pc.CULLFACE_NONE
  });
  tallGrassMaterial.diffuseVertexColor = true;
  tallGrassMaterial.update();
  materials.push(tallGrassMaterial);

  const buildGrassCluster = (seed: number, bladeCount: number): pc.Mesh => {
    const rand = random(seed);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const base: [number, number, number] = [0.08, 0.2, 0.07];
    const mid: [number, number, number] = [0.14, 0.33, 0.11];
    const tip: [number, number, number] = [0.31, 0.55, 0.2];

    for (let b = 0; b < bladeCount; b++) {
      const bx = (rand() - 0.5) * 0.58;
      const bz = (rand() - 0.5) * 0.58;
      const yaw = rand() * Math.PI * 2;
      let height = 0.34 + rand() * 0.62;
      if (rand() < 0.3) height += 0.18;
      const halfWidth = 0.035 + rand() * 0.04;
      const bend = (0.1 + rand() * 0.3) * (rand() < 0.5 ? -1 : 1);
      const tint = 0.85 + rand() * 0.24;

      const dx = Math.cos(yaw);
      const dz = Math.sin(yaw);
      // Normal casi vertical con algo de costado: se ilumina como el suelo
      // pero mantiene un volumen sutil.
      const nx = -dz * 0.45;
      const nz = dx * 0.45;
      const inv = 1 / Math.hypot(nx, 1, nz);
      const n0 = nx * inv;
      const n1 = inv;
      const n2 = nz * inv;

      const start = positions.length / 3;
      const push = (x: number, y: number, z: number, color: [number, number, number]) => {
        positions.push(x, y, z);
        normals.push(n0, n1, n2);
        // RGBA: `setColors` usa 4 componentes por vértice por defecto.
        colors.push(color[0] * tint, color[1] * tint, color[2] * tint, 1);
      };

      push(bx - dx * halfWidth, 0, bz - dz * halfWidth, base);
      push(bx + dx * halfWidth, 0, bz + dz * halfWidth, base);
      push(
        bx + dx * (bend * 0.4 - halfWidth * 0.78),
        height * 0.55,
        bz + dz * (bend * 0.4 - halfWidth * 0.78),
        mid
      );
      push(
        bx + dx * (bend * 0.4 + halfWidth * 0.78),
        height * 0.55,
        bz + dz * (bend * 0.4 + halfWidth * 0.78),
        mid
      );
      push(bx + dx * bend, height, bz + dz * bend, tip);

      indices.push(
        start,
        start + 1,
        start + 2,
        start + 1,
        start + 3,
        start + 2,
        start + 2,
        start + 3,
        start + 4
      );
    }

    const mesh = new pc.Mesh(device);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setColors(colors);
    mesh.setIndices(indices);
    mesh.update();
    return mesh;
  };

  const grassClusterMeshes = [0, 1, 2, 3, 4].map((variant) =>
    buildGrassCluster(0x51a7 + variant * 3571, 18)
  );

  const grassTufts: Array<{
    entity: pc.Entity;
    yaw: number;
    phase: number;
    strength: number;
  }> = [];

  const tallGrassZones = TERRAIN_ZONES.filter((zone) => zone.terrain === 'tallGrass');
  tallGrassZones.forEach((zone, zoneIndex) => {
    const rand = random(0x9a11 + zoneIndex * 7919);
    const count = Math.round(Math.PI * zone.radius * zone.radius * 3.6);
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = Math.sqrt(rand()) * (zone.radius - 0.3);
      const x = zone.x + Math.cos(angle) * distance;
      const z = zone.z + Math.sin(angle) * distance;
      const yaw = rand() * 360;
      const tuftScale = 0.9 + rand() * 0.55;

      const tuft = new pc.Entity(`tall-grass-${zoneIndex}-${i}`);
      tuft.setLocalPosition(x, 0.002, z);
      tuft.setLocalEulerAngles(0, yaw, 0);
      tuft.addComponent('render');
      tuft.render!.castShadows = false;
      tuft.render!.receiveShadows = false;
      const instance = new pc.MeshInstance(
        grassClusterMeshes[(i + zoneIndex) % grassClusterMeshes.length],
        tallGrassMaterial
      );
      // Las banderas hay que fijarlas en la instancia: el componente las aplica
      // a las instancias que ya existen al asignarlas, y aquí las creamos antes.
      instance.castShadow = false;
      instance.receiveShadow = false;
      tuft.render!.meshInstances = [instance];
      tuft.setLocalScale(tuftScale, tuftScale, tuftScale);
      app.root.addChild(tuft);
      created.push(tuft);

      grassTufts.push({
        entity: tuft,
        yaw,
        phase: x * 0.55 + z * 0.3 + rand() * 1.4,
        strength: 0.7 + rand() * 0.6
      });
    }
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

  let time = 0;

  return {
    colliders,
    bounds: CONFIG.world.halfSize,
    pond: POND,
    shadowMaterial,
    update(dt: number) {
      time += dt;

      // Dos capas de ondas en sentidos opuestos: los brillos cambian de sitio
      // y la superficie parece moverse sin desplazar la silueta del estanque.
      // Hay que llamar a `update()` después de tocar los offsets: si no,
      // PlayCanvas no sube las transformadas de UV al uniform buffer y el
      // agua se queda congelada aunque los valores cambien en JS.
      // Las velocidades están en unidades de UV: con el tiling actual la capa
      // base recorre ~0,75 u/s y los brillos ~1 u/s, suficiente para que la
      // corriente se lea sin parecer un río.
      waterSurfaceMaterial.diffuseMapOffset = new pc.Vec2(time * 0.15, time * 0.22);
      waterSurfaceMaterial.update();

      waterGlintMaterial.diffuseMapOffset = new pc.Vec2(
        -time * 0.26 + Math.sin(time * 0.6) * 0.05,
        time * 0.11 + Math.cos(time * 0.45) * 0.03
      );
      // Los destellos laten un poco de opacidad y giran despacio: dos pistas de
      // movimiento más, legibles incluso de reojo.
      waterGlintMaterial.opacity = 0.32 + Math.sin(time * 1.15) * 0.05;
      waterGlintMaterial.update();
      waterGlints.setLocalEulerAngles(0, 62 + time * 5.5, 0);

      // Viento sobre la hierba alta: cada mata se inclina sobre su base con
      // una fase ligada a su posición, de modo que la onda recorre el calvero.
      for (const tuft of grassTufts) {
        const sway = Math.sin(time * 1.15 + tuft.phase) * 8 * tuft.strength;
        tuft.entity.setLocalEulerAngles(0, tuft.yaw, sway);
      }
    },
    dispose() {
      for (const entity of created) entity.destroy();
      for (const material of materials) material.destroy();
      groundTexture.destroy();
      soilTexture.destroy();
      shadowTexture.destroy();
      waterTexture.destroy();
      waterGlintTexture.destroy();
      waterMaskTexture.destroy();
      skyTexture.destroy();
      barkTexture.destroy();
      for (const texture of leafTextures) texture.destroy();
      for (const texture of rockTextures) texture.destroy();
      for (const mesh of grassClusterMeshes) mesh.destroy();
    }
  };
}
