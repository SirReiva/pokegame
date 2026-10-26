import * as pc from 'playcanvas';
import { CONFIG } from './config';
import { BASES, LANES, POND, TERRAIN_ZONES, terrainAt } from './terrain';
import {
  createBarkCanvas,
  createDustCanvas,
  createEmberCanvas,
  createFrostCanvas,
  createGroundCanvas,
  createLeafCanvas,
  createPollenCanvas,
  createRockCanvas,
  createShadowCanvas,
  createSkyCanvas,
  createSmokeCanvas,
  createSoilCanvas,
  createWaterCanvas,
  createWaterMaskCanvas,
  createWispCanvas,
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

/** Cartel de la base azul. Se reserva su hueco al repartir la vegetación. */
const SIGN_POSITION = { x: -8.6, z: 11.8 };

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
      bases: BASES,
      pond: POND,
      lanes: LANES,
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
  const dustTexture = textureFromCanvas(device, createDustCanvas(), {
    name: 'desert-dust',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  const frostTexture = textureFromCanvas(device, createFrostCanvas(), {
    name: 'frost-flake',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  const smokeTexture = textureFromCanvas(device, createSmokeCanvas(), {
    name: 'swamp-smoke',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  const emberTexture = textureFromCanvas(device, createEmberCanvas(), {
    name: 'lava-ember',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  const wispTexture = textureFromCanvas(device, createWispCanvas(), {
    name: 'ghost-wisp',
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  const pollenTexture = textureFromCanvas(device, createPollenCanvas(), {
    name: 'fairy-pollen',
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
    opacity: number,
    tint = '#d9f6ff',
    glow = '#0f3b4d'
  ): pc.StandardMaterial => {
    const material = standard({
      diffuse: tint,
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
    material.emissive = hex(glow);
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

  // --- Ciénaga -------------------------------------------------------------
  // El calvero venenoso se comporta como agua somera: la hierba oscura queda
  // dentro y encima va una lámina de agua turbia con la misma máscara radial
  // que el lago. Es mate, sin brillo especular, para que se lea como agua
  // estancada y no como un espejo. No hay agua profunda: cualquier Pokémon
  // puede cruzar.
  const swampZones = TERRAIN_ZONES.filter((zone) => zone.terrain === 'poison');
  const swampSurfaceMaterial = standard({
    diffuse: '#4c5a3c',
    diffuseMap: waterTexture,
    tiling: [1.15, 1.05],
    specular: '#000000',
    gloss: 0,
    opacity: 0.42,
    blend: pc.BLEND_NORMAL,
    depthWrite: false,
    cull: pc.CULLFACE_NONE
  });
  swampSurfaceMaterial.opacityMap = waterMaskTexture;
  swampSurfaceMaterial.opacityMapChannel = 'a';
  swampSurfaceMaterial.emissive = hex('#0a1007');
  swampSurfaceMaterial.update();
  materials.push(swampSurfaceMaterial);

  swampZones.forEach((zone) => {
    const radius = zone.radius + 0.2;
    const surface = part(app.root, 'plane', swampSurfaceMaterial, {
      position: [zone.x, POND.surfaceHeight, zone.z],
      scale: [radius * 2, 1, radius * 2]
    });
    surface.render!.castShadows = false;
    surface.render!.receiveShadows = false;
    const instance = surface.render!.meshInstances[0];
    if (instance) instance.drawOrder = 0;
    created.push(surface);
  });

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

  // Jungla: los árboles se reparten de forma determinista y se descartan los
  // que caen sobre carriles, bases, lago o calveros, para no tapar el mapa.
  const random = (seed: number) => {
    let a = seed;
    return () => {
      a = (a * 1664525 + 1013904223) % 4294967296;
      return a / 4294967296;
    };
  };

  const scatter = (count: number, seed: number, minGap: number) => {
    const rand = random(seed);
    const spots: Array<[number, number]> = [];
    for (let attempt = 0; attempt < count * 24 && spots.length < count; attempt++) {
      const x = (rand() * 2 - 1) * (HALF - 1.4);
      const z = (rand() * 2 - 1) * (HALF - 1.4);
      if (terrainAt(x, z) !== 'jungle') continue;
      if (
        TERRAIN_ZONES.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius + 1.1)
      ) {
        continue;
      }
      if (Math.hypot(x - SIGN_POSITION.x, z - SIGN_POSITION.z) < 2.4) continue;
      if (spots.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < minGap)) continue;
      spots.push([x, z]);
    }
    return spots;
  };

  const trees: Array<[number, number, number]> = scatter(46, 0x7a11, 1.9).map(
    ([x, z], index) => {
      const rand = random(index * 977 + 13);
      return [x, z, 0.72 + rand() * 0.38];
    }
  );

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
  const rocks: Array<[number, number, number]> = scatter(7, 0x2b19, 2.6).map(
    ([x, z], index) => [x, z, 0.5 + random(index * 613 + 29)() * 0.34]
  );
  rocks.forEach(([x, z, size], index) => {
    const rock = part(app.root, 'sphere', rockMaterials[index % rockMaterials.length], {
      position: [x, size * 0.35, z],
      scale: [size * 2.1, size * 1.25, size * 1.9],
      rotation: [0, index * 61, 0]
    });
    created.push(rock);
    colliders.push({ type: 'circle', x, z, radius: size * 0.8 });
  });

  // Cactus del desierto: tronco y brazos con primitivas, repartidos dentro del
  // calvero. Son obstáculos sólidos, como los árboles y las rocas.
  const cactusMaterial = standard({
    diffuse: '#4f8b47',
    specular: '#1d2b16',
    gloss: 0.18
  });
  materials.push(cactusMaterial);

  const desertZones = TERRAIN_ZONES.filter((zone) => zone.terrain === 'desert');
  desertZones.forEach((zone, zoneIndex) => {
    const rand = random(0x3c7d + zoneIndex * 4211);
    const count = 4;
    const spots: Array<[number, number]> = [];
    for (let i = 0; i < count; i++) {
      let x = zone.x;
      let z = zone.z;
      for (let attempt = 0; attempt < 20; attempt++) {
        const angle = rand() * Math.PI * 2;
        const distance = 0.7 + Math.sqrt(rand()) * (zone.radius - 1.0);
        x = zone.x + Math.cos(angle) * distance;
        z = zone.z + Math.sin(angle) * distance;
        if (spots.every(([sx, sz]) => Math.hypot(x - sx, z - sz) > 1.1)) break;
      }
      spots.push([x, z]);

      const scale = 0.8 + rand() * 0.35;
      const cactus = new pc.Entity(`desert-cactus-${zoneIndex}-${i}`);
      cactus.setPosition(x, 0, z);
      cactus.setLocalScale(scale, scale, scale);
      cactus.setLocalEulerAngles(0, rand() * 360, 0);
      app.root.addChild(cactus);
      created.push(cactus);

      part(cactus, 'cylinder', cactusMaterial, {
        position: [0, 0.8, 0],
        scale: [0.18, 1.6, 0.18]
      });
      part(cactus, 'cylinder', cactusMaterial, {
        position: [-0.18, 0.85, 0],
        scale: [0.1, 0.38, 0.1],
        rotation: [0, 0, 68]
      });
      part(cactus, 'cylinder', cactusMaterial, {
        position: [-0.34, 1.1, 0],
        scale: [0.09, 0.5, 0.09]
      });
      part(cactus, 'cylinder', cactusMaterial, {
        position: [0.18, 1.08, 0],
        scale: [0.1, 0.32, 0.1],
        rotation: [0, 0, -68]
      });
      part(cactus, 'cylinder', cactusMaterial, {
        position: [0.32, 1.3, 0],
        scale: [0.085, 0.44, 0.085]
      });
      colliders.push({ type: 'circle', x, z, radius: 0.3 * scale });
    }
  });

  // --- Polvo del desierto --------------------------------------------------
  // Partículas suaves en suspensión sobre toda la zona: nacen repartidas en una
  // caja baja, derivan despacio con el viento y crecen y se desvanecen. Usan
  // una textura de manchas difusas y blending normal, así que se leen como
  // polvo y no como chispas. La densidad y el tamaño son altos para que la
  // bruma se note desde la cámara a 45º.
  desertZones.forEach((zone, zoneIndex) => {
    const dust = new pc.Entity(`desert-dust-${zoneIndex}`);
    dust.setPosition(zone.x, 0.8, zone.z);
    dust.addComponent('particlesystem', {
      numParticles: 90,
      lifetime: 5.5,
      rate: 0.045,
      rate2: 0.075,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: new pc.Vec3(zone.radius * 2.0, 1.5, zone.radius * 2.0),
      colorMap: dustTexture,
      colorGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 1, 1, 1],
          [0, 0.96, 1, 0.9],
          [0, 0.84, 1, 0.7]
        ]
      },
      alphaGraph: { type: pc.CURVE_LINEAR, keys: [0, 0, 0.2, 0.4, 0.65, 0.29, 1, 0] },
      scaleGraph: {
        type: pc.CURVE_LINEAR,
        keys: [0, 0.26, 0.4, 0.52, 0.75, 0.8, 1, 0.95]
      },
      velocityGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 0.07, 1, 0.16],
          [0, 0.02, 1, 0.1],
          [0, 0.03, 1, 0.08]
        ]
      },
      blendType: pc.BLEND_NORMAL,
      depthWrite: false,
      useFog: true,
      lighting: false,
      intensity: 1,
      orientation: pc.PARTICLEORIENTATION_SCREEN
    });
    app.root.addChild(dust);
    created.push(dust);
  });

  // --- Escarcha: cristales de hielo 3D --------------------------------------
  // El calvero helado se llena de racimos de esquirlas: prismas facetados que
  // nacen del suelo, se estrechan y se inclinan hacia fuera. El color va por
  // vértice, de azul profundo en la base a blanco casi puro en la punta, así
  // que cada cristal tiene volumen y brillo desde cualquier ángulo.
  const iceMaterial = standard({
    diffuse: '#ffffff',
    specular: '#e8fbff',
    gloss: 0.75,
    cull: pc.CULLFACE_NONE
  });
  iceMaterial.diffuseVertexColor = true;
  iceMaterial.update();
  materials.push(iceMaterial);

  const ICE_BASE: [number, number, number] = [0.31, 0.56, 0.74];
  const ICE_MID: [number, number, number] = [0.58, 0.83, 0.94];
  const ICE_TIP: [number, number, number] = [0.94, 0.99, 1];

  const buildIceCluster = (seed: number, shardCount: number): pc.Mesh => {
    const rand = random(seed);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const push = (
      x: number,
      y: number,
      z: number,
      nx: number,
      ny: number,
      nz: number,
      color: [number, number, number]
    ) => {
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      colors.push(color[0], color[1], color[2], 1);
    };

    /** Normal plana, orientada hacia fuera desde el eje de la esquirla. */
    const faceNormal = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
      cx: number,
      cy: number,
      cz: number,
      axisX: number,
      axisZ: number
    ): [number, number, number] => {
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const vx = cx - ax;
      const vy = cy - ay;
      const vz = cz - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;

      const mx = (ax + bx + cx) / 3 - axisX;
      const mz = (az + bz + cz) / 3 - axisZ;
      if (nx * mx + nz * mz < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }

      const length = Math.hypot(nx, ny, nz) || 1;
      return [nx / length, ny / length, nz / length];
    };

    /** Esquirla: base poligonal, cintura estrechada y punta inclinada. */
    const shard = (
      baseX: number,
      baseZ: number,
      height: number,
      radius: number,
      leanX: number,
      leanZ: number,
      sides: number
    ) => {
      const phase = rand() * Math.PI * 2;
      const waistT = 0.52 + rand() * 0.12;
      const waistY = height * waistT;
      const waistRadius = radius * (0.42 + rand() * 0.18);
      const waistX = baseX + leanX * waistT;
      const waistZ = baseZ + leanZ * waistT;
      const tipX = baseX + leanX;
      const tipZ = baseZ + leanZ;

      const baseRing: Array<[number, number]> = [];
      const waistRing: Array<[number, number]> = [];
      for (let s = 0; s < sides; s++) {
        const angle = phase + (s / sides) * Math.PI * 2;
        const wobble = 0.9 + rand() * 0.2;
        baseRing.push([
          baseX + Math.cos(angle) * radius * wobble,
          baseZ + Math.sin(angle) * radius * wobble
        ]);
        waistRing.push([
          waistX + Math.cos(angle) * waistRadius * wobble,
          waistZ + Math.sin(angle) * waistRadius * wobble
        ]);
      }

      for (let s = 0; s < sides; s++) {
        const next = (s + 1) % sides;
        const a = baseRing[s];
        const b = baseRing[next];
        const c = waistRing[next];
        const d = waistRing[s];
        const normal = faceNormal(
          a[0],
          0,
          a[1],
          b[0],
          0,
          b[1],
          c[0],
          waistY,
          c[1],
          (baseX + waistX) / 2,
          (baseZ + waistZ) / 2
        );
        const tint = 0.88 + rand() * 0.18;
        const baseColor: [number, number, number] = [
          ICE_BASE[0] * tint,
          ICE_BASE[1] * tint,
          ICE_BASE[2] * tint
        ];
        const midColor: [number, number, number] = [
          ICE_MID[0] * tint,
          ICE_MID[1] * tint,
          ICE_MID[2] * tint
        ];

        const start = positions.length / 3;
        push(a[0], 0, a[1], ...normal, baseColor);
        push(b[0], 0, b[1], ...normal, baseColor);
        push(c[0], waistY, c[1], ...normal, midColor);
        push(d[0], waistY, d[1], ...normal, midColor);
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      }

      for (let s = 0; s < sides; s++) {
        const next = (s + 1) % sides;
        const a = waistRing[s];
        const b = waistRing[next];
        const normal = faceNormal(
          a[0],
          waistY,
          a[1],
          b[0],
          waistY,
          b[1],
          tipX,
          height,
          tipZ,
          (waistX + tipX) / 2,
          (waistZ + tipZ) / 2
        );
        const tint = 0.94 + rand() * 0.06;
        const midColor: [number, number, number] = [
          ICE_MID[0] * tint,
          ICE_MID[1] * tint,
          ICE_MID[2] * tint
        ];
        const tipColor: [number, number, number] = [
          ICE_TIP[0] * tint,
          ICE_TIP[1] * tint,
          ICE_TIP[2] * tint
        ];

        const start = positions.length / 3;
        push(a[0], waistY, a[1], ...normal, midColor);
        push(b[0], waistY, b[1], ...normal, midColor);
        push(tipX, height, tipZ, ...normal, tipColor);
        indices.push(start, start + 1, start + 2);
      }
    };

    // La esquirla central es la más alta; el resto se reparte alrededor con
    // alturas y grosores variados, como un racimo de cristales.
    for (let i = 0; i < shardCount; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = i === 0 ? 0 : Math.sqrt(rand()) * 0.34;
      const baseX = Math.cos(angle) * distance;
      const baseZ = Math.sin(angle) * distance;
      const height = i === 0 ? 0.5 + rand() * 0.45 : 0.16 + rand() * 0.42;
      const radius = 0.045 + rand() * 0.055 + height * 0.035;
      const leanAngle = angle + (rand() - 0.5) * 0.9;
      const lean = (0.04 + rand() * 0.16) * (0.4 + height);
      shard(
        baseX,
        baseZ,
        height,
        radius,
        Math.cos(leanAngle) * lean,
        Math.sin(leanAngle) * lean,
        4 + (rand() < 0.5 ? 0 : 1)
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

  const iceClusterMeshes = [0, 1, 2, 3].map((variant) =>
    buildIceCluster(0x1ce7 + variant * 2753, 5 + (variant % 3))
  );

  const iceZones = TERRAIN_ZONES.filter((zone) => zone.terrain === 'ice');
  iceZones.forEach((zone, zoneIndex) => {
    const rand = random(0x71f3 + zoneIndex * 6701);
    const count = Math.round(Math.PI * zone.radius * zone.radius * 1.5);
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = Math.sqrt(rand()) * (zone.radius - 0.35);
      const x = zone.x + Math.cos(angle) * distance;
      const z = zone.z + Math.sin(angle) * distance;
      const scale = 0.75 + rand() * 0.5;

      const cluster = new pc.Entity(`ice-crystal-${zoneIndex}-${i}`);
      cluster.setLocalPosition(x, 0.002, z);
      cluster.setLocalEulerAngles(0, rand() * 360, 0);
      cluster.addComponent('render');
      cluster.render!.castShadows = false;
      cluster.render!.receiveShadows = false;
      const instance = new pc.MeshInstance(
        iceClusterMeshes[(i + zoneIndex) % iceClusterMeshes.length],
        iceMaterial
      );
      instance.castShadow = false;
      instance.receiveShadow = false;
      cluster.render!.meshInstances = [instance];
      cluster.setLocalScale(scale, scale, scale);
      app.root.addChild(cluster);
      created.push(cluster);
    }
  });

  // Nieve fina sobre la escarcha: copos pequeños que caen despacio y derivan
  // con el viento. La caja de emisión es alta, así que hay copos a distintas
  // alturas y el efecto se lee desde la cámara a 45º sin tapar el suelo.
  iceZones.forEach((zone, zoneIndex) => {
    const snow = new pc.Entity(`ice-snow-${zoneIndex}`);
    snow.setPosition(zone.x, 1.5, zone.z);
    snow.addComponent('particlesystem', {
      numParticles: 70,
      lifetime: 5.2,
      rate: 0.07,
      rate2: 0.11,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: new pc.Vec3(zone.radius * 1.9, 1.6, zone.radius * 1.9),
      colorMap: frostTexture,
      colorGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 0.86, 1, 1],
          [0, 0.94, 1, 1],
          [0, 1, 1, 1]
        ]
      },
      alphaGraph: { type: pc.CURVE_LINEAR, keys: [0, 0, 0.12, 0.7, 0.72, 0.55, 1, 0] },
      scaleGraph: {
        type: pc.CURVE_LINEAR,
        keys: [0, 0.06, 0.35, 0.1, 0.7, 0.14, 1, 0.08]
      },
      velocityGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 0.05, 1, 0.11],
          [0, -0.3, 1, -0.48],
          [0, 0.015, 1, 0.05]
        ]
      },
      blendType: pc.BLEND_NORMAL,
      depthWrite: false,
      useFog: true,
      lighting: false,
      intensity: 1,
      orientation: pc.PARTICLEORIENTATION_SCREEN
    });
    app.root.addChild(snow);
    created.push(snow);
  });

  // --- Colada volcánica: basalto 3D y brasas --------------------------------
  // Placas rotas de basalto que sobresalen del suelo y chispas de lava que
  // suben desde las grietas. Las rocas son bajas y no colisionan: se leen como
  // costra levantada, no como obstáculos.
  const fireZones = TERRAIN_ZONES.filter((zone) => zone.terrain === 'fire');

  const basaltMaterial = standard({
    diffuse: '#ffffff',
    specular: '#2b1e17',
    gloss: 0.28,
    cull: pc.CULLFACE_NONE
  });
  basaltMaterial.diffuseVertexColor = true;
  basaltMaterial.update();
  materials.push(basaltMaterial);

  const BASALT_BASE: [number, number, number] = [0.075, 0.08, 0.095];
  const BASALT_TOP: [number, number, number] = [0.9, 0.3, 0.05];
  const BASALT_HOT: [number, number, number] = [1, 0.8, 0.18];
  const BASALT_RED: [number, number, number] = [0.62, 0.12, 0.03];

  const buildBasaltCluster = (seed: number, chunkCount: number): pc.Mesh => {
    const rand = random(seed);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const push = (
      x: number,
      y: number,
      z: number,
      nx: number,
      ny: number,
      nz: number,
      color: [number, number, number]
    ) => {
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      colors.push(color[0], color[1], color[2], 1);
    };

    /** Normal plana, orientada hacia fuera desde el eje del bloque. */
    const faceNormal = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
      cx: number,
      cy: number,
      cz: number,
      axisX: number,
      axisZ: number
    ): [number, number, number] => {
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const vx = cx - ax;
      const vy = cy - ay;
      const vz = cz - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;

      const mx = (ax + bx + cx) / 3 - axisX;
      const mz = (az + bz + cz) / 3 - axisZ;
      if (nx * mx + nz * mz < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }

      const length = Math.hypot(nx, ny, nz) || 1;
      return [nx / length, ny / length, nz / length];
    };

    /** Bloque de basalto: base irregular y corona facetada, algo inclinada. */
    const chunk = (
      baseX: number,
      baseZ: number,
      height: number,
      radius: number,
      sides: number,
      leanX: number,
      leanZ: number
    ) => {
      const phase = rand() * Math.PI * 2;
      const topRadius = radius * (0.55 + rand() * 0.25);
      const baseRing: Array<[number, number, number]> = [];
      const topRing: Array<[number, number, number]> = [];
      for (let s = 0; s < sides; s++) {
        const angle = phase + (s / sides) * Math.PI * 2;
        const baseWobble = 0.82 + rand() * 0.36;
        baseRing.push([
          baseX + Math.cos(angle) * radius * baseWobble,
          0,
          baseZ + Math.sin(angle) * radius * baseWobble
        ]);
        const topWobble = 0.82 + rand() * 0.36;
        topRing.push([
          baseX + leanX + Math.cos(angle) * topRadius * topWobble,
          height * (0.86 + rand() * 0.26),
          baseZ + leanZ + Math.sin(angle) * topRadius * topWobble
        ]);
      }

      const axisX = baseX + leanX * 0.5;
      const axisZ = baseZ + leanZ * 0.5;

      // Cada vértice de la corona recibe un tono de lava: naranja, amarillo o
      // rojo. Así el calor queda en la cara superior y en los bordes de la
      // roca, nunca en el suelo.
      const topColors: Array<[number, number, number]> = topRing.map(() => {
        const roll = rand();
        if (roll < 0.24) return BASALT_HOT;
        if (roll < 0.72) return BASALT_TOP;
        return BASALT_RED;
      });

      for (let s = 0; s < sides; s++) {
        const next = (s + 1) % sides;
        const a = baseRing[s];
        const b = baseRing[next];
        const c = topRing[next];
        const d = topRing[s];
        const normal = faceNormal(
          a[0],
          a[1],
          a[2],
          b[0],
          b[1],
          b[2],
          c[0],
          c[1],
          c[2],
          axisX,
          axisZ
        );
        const tint = 0.85 + rand() * 0.3;
        const baseColor: [number, number, number] = [
          BASALT_BASE[0] * tint,
          BASALT_BASE[1] * tint,
          BASALT_BASE[2] * tint
        ];
        const topA: [number, number, number] = [
          Math.min(1, topColors[s][0] * tint),
          Math.min(1, topColors[s][1] * tint),
          Math.min(1, topColors[s][2] * tint)
        ];
        const topB: [number, number, number] = [
          Math.min(1, topColors[next][0] * tint),
          Math.min(1, topColors[next][1] * tint),
          Math.min(1, topColors[next][2] * tint)
        ];

        const start = positions.length / 3;
        push(a[0], a[1], a[2], ...normal, baseColor);
        push(b[0], b[1], b[2], ...normal, baseColor);
        push(c[0], c[1], c[2], ...normal, topB);
        push(d[0], d[1], d[2], ...normal, topA);
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      }

      // Tapa superior: abanico hacia una corona irregular. El centro va al
      // amarillo y los bordes alternan naranja, amarillo y rojo, de modo que
      // la cara superior se lee como lava solidificada.
      const topX = baseX + leanX;
      const topZ = baseZ + leanZ;
      for (let s = 0; s < sides; s++) {
        const next = (s + 1) % sides;
        const a = topRing[s];
        const b = topRing[next];
        const start = positions.length / 3;
        push(topX, height * 0.98, topZ, 0, 1, 0, BASALT_HOT);
        push(a[0], a[1], a[2], 0, 1, 0, topColors[s]);
        push(b[0], b[1], b[2], 0, 1, 0, topColors[next]);
        indices.push(start, start + 1, start + 2);
      }
    };

    for (let i = 0; i < chunkCount; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = i === 0 ? 0 : Math.sqrt(rand()) * 0.48;
      const baseX = Math.cos(angle) * distance;
      const baseZ = Math.sin(angle) * distance;
      const height = 0.1 + rand() * 0.24;
      const radius = 0.12 + rand() * 0.12;
      const leanAngle = rand() * Math.PI * 2;
      const lean = 0.02 + rand() * 0.1;
      chunk(
        baseX,
        baseZ,
        height,
        radius,
        4 + Math.floor(rand() * 3),
        Math.cos(leanAngle) * lean,
        Math.sin(leanAngle) * lean
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

  const basaltMeshes = [0, 1, 2, 3].map((variant) =>
    buildBasaltCluster(0x6b17 + variant * 2311, 3 + (variant % 2))
  );

  const basaltVents: Array<Array<[number, number]>> = [];

  fireZones.forEach((zone, zoneIndex) => {
    const rand = random(0x2f5b + zoneIndex * 4517);
    const count = 5;
    const spots: Array<[number, number]> = [];
    for (let i = 0; i < count; i++) {
      let x = zone.x;
      let z = zone.z;
      for (let attempt = 0; attempt < 16; attempt++) {
        const angle = rand() * Math.PI * 2;
        const distance = 0.55 + Math.sqrt(rand()) * (zone.radius - 1.0);
        x = zone.x + Math.cos(angle) * distance;
        z = zone.z + Math.sin(angle) * distance;
        if (spots.every(([sx, sz]) => Math.hypot(x - sx, z - sz) > 1.0)) break;
      }
      spots.push([x, z]);

      const scale = 0.8 + rand() * 0.4;
      const cluster = new pc.Entity(`basalt-${zoneIndex}-${i}`);
      cluster.setLocalPosition(x, 0.002, z);
      cluster.setLocalEulerAngles(0, rand() * 360, 0);
      cluster.addComponent('render');
      cluster.render!.castShadows = true;
      cluster.render!.receiveShadows = true;
      const instance = new pc.MeshInstance(
        basaltMeshes[(i + zoneIndex) % basaltMeshes.length],
        basaltMaterial
      );
      instance.castShadow = true;
      instance.receiveShadow = true;
      cluster.render!.meshInstances = [instance];
      cluster.setLocalScale(scale, scale, scale);
      app.root.addChild(cluster);
      created.push(cluster);
    }
    basaltVents.push(spots);
  });

  const emberLights: Array<{ entity: pc.Entity; phase: number }> = [];

  fireZones.forEach((zone, zoneIndex) => {
    // Brasas que suben de la costra: pequeñas, aditivas y con deriva corta.
    const embers = new pc.Entity(`fire-embers-${zoneIndex}`);
    embers.setPosition(zone.x, 0.22, zone.z);
    embers.addComponent('particlesystem', {
      numParticles: 44,
      lifetime: 3.4,
      rate: 0.055,
      rate2: 0.09,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: new pc.Vec3(zone.radius * 1.55, 0.35, zone.radius * 1.55),
      colorMap: emberTexture,
      colorGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 1, 1, 0.85],
          [0, 0.86, 1, 0.42],
          [0, 0.38, 1, 0.1]
        ]
      },
      alphaGraph: { type: pc.CURVE_LINEAR, keys: [0, 0, 0.08, 0.9, 0.62, 0.5, 1, 0] },
      scaleGraph: {
        type: pc.CURVE_LINEAR,
        keys: [0, 0.05, 0.3, 0.1, 0.75, 0.13, 1, 0.04]
      },
      velocityGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 0.04, 1, 0.1],
          [0, 0.24, 1, 0.5],
          [0, 0.02, 1, 0.07]
        ]
      },
      blendType: pc.BLEND_ADDITIVE,
      depthWrite: false,
      useFog: true,
      lighting: false,
      intensity: 1,
      orientation: pc.PARTICLEORIENTATION_SCREEN
    });
    app.root.addChild(embers);
    if (embers.particlesystem) embers.particlesystem.drawOrder = 2;
    created.push(embers);

    // Luz corta de lava: tiñe de naranja las placas y parpadea despacio.
    const glow = new pc.Entity(`fire-glow-${zoneIndex}`);
    glow.addComponent('light', {
      type: 'omni',
      color: hex('#ff5a1a'),
      intensity: 0.6,
      range: 3.6,
      castShadows: false
    });
    glow.setPosition(zone.x, 0.75, zone.z);
    app.root.addChild(glow);
    created.push(glow);
    emberLights.push({ entity: glow, phase: zoneIndex * 2.1 + zone.x * 0.3 });
  });

  // Columnas de humo: una por cada racimo de basalto. La emisión es estrecha y
  // con impulsión vertical, así que el humo sale de la roca y sube en columna
  // en vez de quedarse como una bruma repartida por toda la zona.
  basaltVents.forEach((vents, zoneIndex) => {
    vents.forEach(([x, z], i) => {
      const smoke = new pc.Entity(`fire-smoke-${zoneIndex}-${i}`);
      smoke.setPosition(x, 0.16, z);
      smoke.addComponent('particlesystem', {
        numParticles: 24,
        lifetime: 5.2,
        rate: 0.16,
        rate2: 0.22,
        loop: true,
        preWarm: true,
        autoPlay: true,
        emitterShape: pc.EMITTERSHAPE_BOX,
        emitterExtents: new pc.Vec3(0.24, 0.12, 0.24),
        colorMap: smokeTexture,
        colorGraph: {
          type: pc.CURVE_LINEAR,
          keys: [
            [0, 0.62, 1, 0.5],
            [0, 0.5, 1, 0.44],
            [0, 0.44, 1, 0.4]
          ]
        },
        alphaGraph: { type: pc.CURVE_LINEAR, keys: [0, 0, 0.1, 0.42, 0.7, 0.24, 1, 0] },
        scaleGraph: {
          type: pc.CURVE_LINEAR,
          keys: [0, 0.22, 0.35, 0.48, 0.75, 0.84, 1, 1.05]
        },
        velocityGraph: {
          type: pc.CURVE_LINEAR,
          keys: [
            [0, 0.02, 1, 0.09],
            [0, 0.38, 1, 0.62],
            [0, 0.01, 1, 0.06]
          ]
        },
        blendType: pc.BLEND_NORMAL,
        depthWrite: false,
        useFog: true,
        lighting: false,
        intensity: 1,
        orientation: pc.PARTICLEORIENTATION_SCREEN
      });
      app.root.addChild(smoke);
      if (smoke.particlesystem) smoke.particlesystem.drawOrder = 1;
      created.push(smoke);
    });
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

  const GRASS_PALETTE: Array<[number, number, number]> = [
    [0.08, 0.2, 0.07],
    [0.14, 0.33, 0.11],
    [0.31, 0.55, 0.2]
  ];
  const DRY_GRASS_PALETTE: Array<[number, number, number]> = [
    [0.24, 0.19, 0.09],
    [0.45, 0.37, 0.17],
    [0.72, 0.62, 0.38]
  ];
  const DARK_GRASS_PALETTE: Array<[number, number, number]> = [
    [0.07, 0.09, 0.05],
    [0.13, 0.19, 0.09],
    [0.27, 0.36, 0.17]
  ];

  const buildGrassCluster = (
    seed: number,
    bladeCount: number,
    palette: Array<[number, number, number]> = GRASS_PALETTE,
    heightScale = 1
  ): pc.Mesh => {
    const rand = random(seed);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const [base, mid, tip] = palette;

    for (let b = 0; b < bladeCount; b++) {
      const bx = (rand() - 0.5) * 0.58;
      const bz = (rand() - 0.5) * 0.58;
      const yaw = rand() * Math.PI * 2;
      let height = (0.34 + rand() * 0.62) * heightScale;
      if (rand() < 0.3) height += 0.18 * heightScale;
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

  // --- Claro feérico: flores 3D ---------------------------------------------
  // Misma técnica que la hierba alta, pero con flores: cada mata es una malla
  // de tallos, hojas y corolas de 5-6 pétalos con el corazón amarillo. Todo va
  // por color de vértice, sin texturas ni recortes alfa, así que las flores
  // tienen volumen desde cualquier ángulo.
  const flowerMaterial = standard({
    diffuse: '#ffffff',
    specular: '#3a2a33',
    gloss: 0.18,
    cull: pc.CULLFACE_NONE
  });
  flowerMaterial.diffuseVertexColor = true;
  flowerMaterial.update();
  materials.push(flowerMaterial);

  /** Corolas: rosa, lila, blanco, amarillo pálido, rosa fuerte y azul cielo. */
  const BLOOM_COLORS: Array<[number, number, number]> = [
    [0.96, 0.62, 0.77],
    [0.87, 0.76, 0.97],
    [0.99, 0.97, 1],
    [1, 0.89, 0.55],
    [0.93, 0.47, 0.64],
    [0.68, 0.82, 0.99]
  ];
  const STEM_BASE: [number, number, number] = [0.09, 0.2, 0.08];
  const STEM_TOP: [number, number, number] = [0.23, 0.44, 0.16];
  const LEAF_COLOR: [number, number, number] = [0.2, 0.4, 0.14];
  const HEART_COLOR: [number, number, number] = [1, 0.82, 0.36];

  const buildFlowerCluster = (seed: number, flowerCount: number): pc.Mesh => {
    const rand = random(seed);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const push = (
      x: number,
      y: number,
      z: number,
      nx: number,
      ny: number,
      nz: number,
      color: [number, number, number]
    ) => {
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      colors.push(color[0], color[1], color[2], 1);
    };

    /** Dos triángulos por cuadrilátero, en el orden en que se empujaron. */
    const quad = (start: number) => {
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    };

    for (let f = 0; f < flowerCount; f++) {
      const fx = (rand() - 0.5) * 0.62;
      const fz = (rand() - 0.5) * 0.62;
      const height = 0.26 + rand() * 0.34;
      const leanAngle = rand() * Math.PI * 2;
      const lean = 0.02 + rand() * 0.08;
      const tipX = fx + Math.cos(leanAngle) * lean;
      const tipZ = fz + Math.sin(leanAngle) * lean;

      // Tallo: dos cintas verticales cruzadas para que tenga volumen.
      const stemWidth = 0.013 + rand() * 0.008;
      for (let cross = 0; cross < 2; cross++) {
        const across = leanAngle + cross * (Math.PI / 2);
        const wx = Math.cos(across) * stemWidth;
        const wz = Math.sin(across) * stemWidth;
        const nx = -Math.sin(across);
        const nz = Math.cos(across);
        const start = positions.length / 3;
        push(fx - wx, 0, fz - wz, nx, 0, nz, STEM_BASE);
        push(fx + wx, 0, fz + wz, nx, 0, nz, STEM_BASE);
        push(tipX - wx * 0.7, height, tipZ - wz * 0.7, nx, 0, nz, STEM_TOP);
        push(tipX + wx * 0.7, height, tipZ + wz * 0.7, nx, 0, nz, STEM_TOP);
        quad(start);
      }

      // Tres hojas a media altura, casi horizontales y con la punta levantada.
      for (let leaf = 0; leaf < 3; leaf++) {
        const leafAngle = rand() * Math.PI * 2;
        const leafHeight = height * (0.28 + leaf * 0.18 + rand() * 0.1);
        const cx = fx + (tipX - fx) * (leafHeight / height);
        const cz = fz + (tipZ - fz) * (leafHeight / height);
        const dx = Math.cos(leafAngle);
        const dz = Math.sin(leafAngle);
        const px = -dz;
        const pz = dx;
        const reach = 0.05 + rand() * 0.05;
        const lift = 0.02 + rand() * 0.025;
        const start = positions.length / 3;
        push(cx - px * 0.006, leafHeight, cz - pz * 0.006, 0, 1, 0, LEAF_COLOR);
        push(cx + px * 0.006, leafHeight, cz + pz * 0.006, 0, 1, 0, LEAF_COLOR);
        push(
          cx + dx * reach + px * 0.022,
          leafHeight + lift,
          cz + dz * reach + pz * 0.022,
          0,
          1,
          0,
          LEAF_COLOR
        );
        push(
          cx + dx * reach - px * 0.022,
          leafHeight + lift,
          cz + dz * reach - pz * 0.022,
          0,
          1,
          0,
          LEAF_COLOR
        );
        quad(start);
      }

      // Corola: pétalos repartidos en abanico alrededor del extremo del tallo.
      const bloom = BLOOM_COLORS[Math.floor(rand() * BLOOM_COLORS.length)];
      const petals = 5 + Math.floor(rand() * 2);
      const petalLength = 0.07 + rand() * 0.04;
      const rotation = rand() * Math.PI * 2;
      for (let p = 0; p < petals; p++) {
        const angle = rotation + (p / petals) * Math.PI * 2;
        const dx = Math.cos(angle);
        const dz = Math.sin(angle);
        const px = -dz;
        const pz = dx;
        const tint = 0.88 + rand() * 0.18;
        const color: [number, number, number] = [
          bloom[0] * tint,
          bloom[1] * tint,
          bloom[2] * tint
        ];
        const ix = tipX + dx * 0.018;
        const iz = tipZ + dz * 0.018;
        const ox = tipX + dx * (0.018 + petalLength);
        const oz = tipZ + dz * (0.018 + petalLength);
        const innerWidth = 0.007;
        const outerWidth = 0.02 + rand() * 0.012;
        const lift = 0.01 + rand() * 0.012;
        const start = positions.length / 3;
        push(ix - px * innerWidth, height, iz - pz * innerWidth, 0, 1, 0, color);
        push(ix + px * innerWidth, height, iz + pz * innerWidth, 0, 1, 0, color);
        push(
          ox + px * outerWidth,
          height + lift,
          oz + pz * outerWidth,
          0,
          1,
          0,
          color
        );
        push(
          ox - px * outerWidth,
          height + lift,
          oz - pz * outerWidth,
          0,
          1,
          0,
          color
        );
        quad(start);
      }

      // Corazón de la flor, un rombo plano por encima de los pétalos.
      const heartY = height + 0.016;
      const heart = 0.026;
      const start = positions.length / 3;
      push(tipX - heart, heartY, tipZ, 0, 1, 0, HEART_COLOR);
      push(tipX, heartY, tipZ - heart, 0, 1, 0, HEART_COLOR);
      push(tipX + heart, heartY, tipZ, 0, 1, 0, HEART_COLOR);
      push(tipX, heartY, tipZ + heart, 0, 1, 0, HEART_COLOR);
      quad(start);
    }

    const mesh = new pc.Mesh(device);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setColors(colors);
    mesh.setIndices(indices);
    mesh.update();
    return mesh;
  };

  const flowerClusterMeshes = [0, 1, 2, 3, 4].map((variant) =>
    buildFlowerCluster(0x2f7a + variant * 4129, 7)
  );

  const fairyFlowers: Array<{
    entity: pc.Entity;
    yaw: number;
    phase: number;
    strength: number;
  }> = [];

  const fairyZones = TERRAIN_ZONES.filter((zone) => zone.terrain === 'fairy');
  fairyZones.forEach((zone, zoneIndex) => {
    const rand = random(0x4f1e + zoneIndex * 8117);
    const count = Math.round(Math.PI * zone.radius * zone.radius * 2.6);
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = Math.sqrt(rand()) * (zone.radius - 0.3);
      const x = zone.x + Math.cos(angle) * distance;
      const z = zone.z + Math.sin(angle) * distance;
      const yaw = rand() * 360;
      const clusterScale = 0.95 + rand() * 0.55;

      const flowers = new pc.Entity(`fairy-flowers-${zoneIndex}-${i}`);
      flowers.setLocalPosition(x, 0.002, z);
      flowers.setLocalEulerAngles(0, yaw, 0);
      flowers.addComponent('render');
      flowers.render!.castShadows = false;
      flowers.render!.receiveShadows = false;
      const instance = new pc.MeshInstance(
        flowerClusterMeshes[(i + zoneIndex) % flowerClusterMeshes.length],
        flowerMaterial
      );
      instance.castShadow = false;
      instance.receiveShadow = false;
      flowers.render!.meshInstances = [instance];
      flowers.setLocalScale(clusterScale, clusterScale, clusterScale);
      app.root.addChild(flowers);
      created.push(flowers);

      fairyFlowers.push({
        entity: flowers,
        yaw,
        phase: x * 0.5 + z * 0.35 + rand() * 1.6,
        strength: 0.45 + rand() * 0.35
      });
    }
  });

  // Polen del claro feérico: motas doradas diminutas que flotan entre las
  // flores, derivan despacio y titilan. Aditivas y pequeñas, para que se lean
  // como polen mágico y no como chispas ni como polvo.
  fairyZones.forEach((zone, zoneIndex) => {
    const pollen = new pc.Entity(`fairy-pollen-${zoneIndex}`);
    pollen.setPosition(zone.x, 0.65, zone.z);
    pollen.addComponent('particlesystem', {
      numParticles: 64,
      lifetime: 6.2,
      rate: 0.09,
      rate2: 0.15,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: new pc.Vec3(zone.radius * 1.7, 1.1, zone.radius * 1.7),
      colorMap: pollenTexture,
      colorGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 1, 0.92, 0.66],
          [0, 1, 0.85, 0.55],
          [0, 0.96, 0.78, 0.44]
        ]
      },
      alphaGraph: { type: pc.CURVE_LINEAR, keys: [0, 0, 0.14, 0.8, 0.55, 0.42, 1, 0] },
      scaleGraph: {
        type: pc.CURVE_LINEAR,
        keys: [0, 0.03, 0.3, 0.06, 0.7, 0.045, 1, 0.02]
      },
      velocityGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 0.05, 1, 0.12],
          [0, 0.04, 1, 0.09],
          [0, 0.05, 1, 0.12]
        ]
      },
      blendType: pc.BLEND_ADDITIVE,
      depthWrite: false,
      useFog: true,
      lighting: false,
      intensity: 1,
      orientation: pc.PARTICLEORIENTATION_SCREEN
    });
    app.root.addChild(pollen);
    if (pollen.particlesystem) pollen.particlesystem.drawOrder = 2;
    created.push(pollen);
  });

  // --- Mariposas del claro feérico ------------------------------------------
  // Pequeñas mariposas 3D: un cuerpo fino y dos alas horizontales con color por
  // vértice (más oscuras junto al cuerpo, casi blancas en la punta). Cada una
  // vuela hacia un objetivo dentro del calvero y, al llegar, elige otro, de
  // modo que revolotean sobre las flores sin salirse de la zona.
  const butterflyBodyMaterial = standard({
    diffuse: '#4a2f3c',
    specular: '#0a0a0a',
    gloss: 0.12
  });
  materials.push(butterflyBodyMaterial);

  const butterflyWingMaterial = standard({
    diffuse: '#f4b6cf',
    specular: '#3a1f2e',
    gloss: 0.3,
    cull: pc.CULLFACE_NONE
  });
  butterflyWingMaterial.diffuseVertexColor = true;
  butterflyWingMaterial.update();
  materials.push(butterflyWingMaterial);

  const buildButterflyWing = (side: number): pc.Mesh => {
    const mesh = new pc.Mesh(device);
    mesh.setPositions([
      0, 0, -0.13,
      side * 0.36, 0, -0.15,
      side * 0.3, 0, 0.16,
      0, 0, 0.13
    ]);
    mesh.setNormals([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
    mesh.setColors([
      0.72, 0.42, 0.55, 1,
      1, 0.86, 0.95, 1,
      1, 0.86, 0.95, 1,
      0.72, 0.42, 0.55, 1
    ]);
    mesh.setIndices([0, 1, 2, 0, 2, 3]);
    mesh.update();
    return mesh;
  };
  const butterflyWingRight = buildButterflyWing(1);
  const butterflyWingLeft = buildButterflyWing(-1);

  const butterflies: Array<{
    root: pc.Entity;
    right: pc.Entity;
    left: pc.Entity;
    target: pc.Vec3;
    rand: () => number;
    cx: number;
    cz: number;
    radius: number;
    speed: number;
    flapSpeed: number;
    phase: number;
    yaw: number;
  }> = [];

  fairyZones.forEach((zone, zoneIndex) => {
    const rand = random(0x7e3a + zoneIndex * 3559);
    const count = 8;
    for (let i = 0; i < count; i++) {
      const x = zone.x + (rand() * 2 - 1) * zone.radius * 0.8;
      const z = zone.z + (rand() * 2 - 1) * zone.radius * 0.8;
      const y = 0.5 + rand() * 1.0;

      const root = new pc.Entity(`fairy-butterfly-${zoneIndex}-${i}`);
      root.setLocalPosition(x, y, z);
      // Pequeñas: la escala baja el cuerpo y las alas a la vez, sin tocar la
      // amplitud del aleteo ni la velocidad de vuelo.
      const butterflyScale = 0.5 + rand() * 0.2;
      root.setLocalScale(butterflyScale, butterflyScale, butterflyScale);
      app.root.addChild(root);
      created.push(root);

      const body = part(root, 'box', butterflyBodyMaterial, {
        position: [0, 0, 0],
        scale: [0.05, 0.05, 0.16]
      });
      body.render!.castShadows = false;
      body.render!.receiveShadows = false;

      const right = new pc.Entity('butterfly-wing-right');
      right.addComponent('render');
      right.render!.castShadows = false;
      right.render!.receiveShadows = false;
      right.render!.meshInstances = [
        new pc.MeshInstance(butterflyWingRight, butterflyWingMaterial)
      ];
      root.addChild(right);

      const left = new pc.Entity('butterfly-wing-left');
      left.addComponent('render');
      left.render!.castShadows = false;
      left.render!.receiveShadows = false;
      left.render!.meshInstances = [
        new pc.MeshInstance(butterflyWingLeft, butterflyWingMaterial)
      ];
      root.addChild(left);

      butterflies.push({
        root,
        right,
        left,
        target: new pc.Vec3(x, y, z),
        rand: random(0x9c51 + zoneIndex * 4813 + i * 197),
        cx: zone.x,
        cz: zone.z,
        radius: zone.radius,
        speed: 0.5 + rand() * 0.5,
        flapSpeed: 9 + rand() * 5,
        phase: rand() * Math.PI * 2,
        yaw: rand() * 360
      });
    }
  });

  // --- Páramo: frailejones y hierba seca 3D --------------------------------
  // Misma idea que la hierba y las flores, pero con la silueta del frailejón
  // (tronco leñoso corto y roseta de hojas lanceoladas plateadas) y matas de
  // hierba seca entre ellos. El color va por vértice, sin texturas ni recortes,
  // así que las plantas tienen volumen desde cualquier ángulo.
  const paramoMaterial = standard({
    diffuse: '#ffffff',
    specular: '#1c1408',
    gloss: 0.1,
    cull: pc.CULLFACE_NONE
  });
  paramoMaterial.diffuseVertexColor = true;
  paramoMaterial.update();
  materials.push(paramoMaterial);

  const TRUNK_BASE: [number, number, number] = [0.14, 0.11, 0.08];
  const TRUNK_TOP: [number, number, number] = [0.22, 0.18, 0.12];
  const LEAF_BASE: [number, number, number] = [0.4, 0.46, 0.34];
  const LEAF_INNER: [number, number, number] = [0.47, 0.53, 0.4];
  const LEAF_TIP: [number, number, number] = [0.85, 0.9, 0.8];
  const LEAF_BUD: [number, number, number] = [0.58, 0.66, 0.48];
  const SKIRT_BASE: [number, number, number] = [0.33, 0.27, 0.16];
  const SKIRT_TIP: [number, number, number] = [0.52, 0.44, 0.27];

  const buildShrubCluster = (seed: number, plants: number): pc.Mesh => {
    const rand = random(seed);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const push = (
      x: number,
      y: number,
      z: number,
      nx: number,
      ny: number,
      nz: number,
      color: [number, number, number]
    ) => {
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      colors.push(color[0], color[1], color[2], 1);
    };

    const quad = (start: number) => {
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    };

    /** Tronco leñoso: columna facetada, irregular y de color oscuro. */
    const trunk = (
      baseX: number,
      baseZ: number,
      height: number,
      radius: number,
      leanX: number,
      leanZ: number
    ) => {
      const sides = 7;
      const bands = 3;
      const rings: Array<Array<[number, number, number]>> = [];
      for (let b = 0; b <= bands; b++) {
        const t = b / bands;
        const cx = baseX + leanX * t;
        const cz = baseZ + leanZ * t;
        const ringRadius = radius * (1 - 0.3 * t);
        const ring: Array<[number, number, number]> = [];
        for (let s = 0; s < sides; s++) {
          const angle = (s / sides) * Math.PI * 2;
          const wobble = 0.9 + rand() * 0.2;
          ring.push([
            cx + Math.cos(angle) * ringRadius * wobble,
            height * t,
            cz + Math.sin(angle) * ringRadius * wobble
          ]);
        }
        rings.push(ring);
      }

      for (let b = 0; b < bands; b++) {
        for (let s = 0; s < sides; s++) {
          const next = (s + 1) % sides;
          const a = rings[b][s];
          const bPoint = rings[b][next];
          const c = rings[b + 1][next];
          const d = rings[b + 1][s];
          const ux = bPoint[0] - a[0];
          const uy = bPoint[1] - a[1];
          const uz = bPoint[2] - a[2];
          const vx = d[0] - a[0];
          const vy = d[1] - a[1];
          const vz = d[2] - a[2];
          let nx = uy * vz - uz * vy;
          let ny = uz * vx - ux * vz;
          let nz = ux * vy - uy * vx;
          const normalLength = Math.hypot(nx, ny, nz) || 1;
          nx /= normalLength;
          ny /= normalLength;
          nz /= normalLength;

          const t = (b + 0.5) / bands;
          const tint = 0.85 + rand() * 0.3;
          const color: [number, number, number] = [
            (TRUNK_BASE[0] + (TRUNK_TOP[0] - TRUNK_BASE[0]) * t) * tint,
            (TRUNK_BASE[1] + (TRUNK_TOP[1] - TRUNK_BASE[1]) * t) * tint,
            (TRUNK_BASE[2] + (TRUNK_TOP[2] - TRUNK_BASE[2]) * t) * tint
          ];

          const start = positions.length / 3;
          push(a[0], a[1], a[2], nx, ny, nz, color);
          push(bPoint[0], bPoint[1], bPoint[2], nx, ny, nz, color);
          push(c[0], c[1], c[2], nx, ny, nz, color);
          push(d[0], d[1], d[2], nx, ny, nz, color);
          quad(start);
        }
      }

      // Tapa superior, casi siempre tapada por la roseta.
      const topX = baseX + leanX;
      const topZ = baseZ + leanZ;
      for (let s = 0; s < sides; s++) {
        const next = (s + 1) % sides;
        const start = positions.length / 3;
        push(topX, height, topZ, 0, 1, 0, TRUNK_TOP);
        push(rings[bands][s][0], rings[bands][s][1], rings[bands][s][2], 0, 1, 0, TRUNK_TOP);
        push(
          rings[bands][next][0],
          rings[bands][next][1],
          rings[bands][next][2],
          0,
          1,
          0,
          TRUNK_TOP
        );
        indices.push(start, start + 1, start + 2);
      }
    };

    /** Hoja de la roseta: lanceolada, con codo y punta afilada. */
    const rosetteLeaf = (
      x: number,
      y: number,
      z: number,
      angle: number,
      elevation: number,
      length: number,
      width: number,
      colorIn: [number, number, number],
      colorTip: [number, number, number]
    ) => {
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const sx = -dz;
      const sz = dx;
      const cosE = Math.cos(elevation);
      const dirX = dx * cosE;
      const dirY = Math.sin(elevation);
      const dirZ = dz * cosE;

      // Normal mixta: la del plano de la hoja, sesgada hacia arriba para que
      // la roseta blanca reciba luz de cielo.
      let nx = -sz * dirY;
      let ny = sz * dirX - sx * dirZ;
      let nz = sx * dirY;
      const normalLength = Math.hypot(nx, ny, nz) || 1;
      nx = (nx / normalLength) * 0.45;
      ny = (ny / normalLength) * 0.45 + 0.8;
      nz = (nz / normalLength) * 0.45;
      const blend = Math.hypot(nx, ny, nz) || 1;
      nx /= blend;
      ny /= blend;
      nz /= blend;

      const tint = 0.94 + rand() * 0.1;
      const inner: [number, number, number] = [
        colorIn[0] * tint,
        colorIn[1] * tint,
        colorIn[2] * tint
      ];
      const tip: [number, number, number] = [
        colorTip[0] * tint,
        colorTip[1] * tint,
        colorTip[2] * tint
      ];

      const midX = x + dirX * length * 0.55;
      const midY = y + dirY * length * 0.55;
      const midZ = z + dirZ * length * 0.55;
      const tipX = x + dirX * length;
      const tipY = y + dirY * length;
      const tipZ = z + dirZ * length;

      const start = positions.length / 3;
      push(x - sx * width, y, z - sz * width, nx, ny, nz, inner);
      push(x + sx * width, y, z + sz * width, nx, ny, nz, inner);
      push(midX - sx * width * 0.85, midY, midZ - sz * width * 0.85, nx, ny, nz, tip);
      push(midX + sx * width * 0.85, midY, midZ + sz * width * 0.85, nx, ny, nz, tip);
      push(tipX, tipY, tipZ, nx, ny, nz, tip);
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
    };

    /** Roseta de frailejón: dos coronas, brote central y faldón seco. */
    const rosette = (x: number, y: number, z: number, scale: number) => {
      const outer = 11 + Math.floor(rand() * 3);
      for (let i = 0; i < outer; i++) {
        const angle = (i / outer) * Math.PI * 2 + rand() * 0.12;
        const reach = 0.03;
        rosetteLeaf(
          x + Math.cos(angle) * reach,
          y,
          z + Math.sin(angle) * reach,
          angle,
          0.12 + rand() * 0.35,
          (0.19 + rand() * 0.1) * scale,
          0.024 + rand() * 0.008,
          LEAF_BASE,
          LEAF_TIP
        );
      }

      const inner = 8 + Math.floor(rand() * 2);
      for (let i = 0; i < inner; i++) {
        const angle = (i / inner) * Math.PI * 2 + 0.35 + rand() * 0.15;
        rosetteLeaf(
          x,
          y,
          z,
          angle,
          0.5 + rand() * 0.45,
          (0.15 + rand() * 0.07) * scale,
          0.022 + rand() * 0.007,
          LEAF_INNER,
          LEAF_TIP
        );
      }

      const bud = 5;
      for (let i = 0; i < bud; i++) {
        const angle = (i / bud) * Math.PI * 2 + rand() * 0.3;
        rosetteLeaf(
          x,
          y + 0.005,
          z,
          angle,
          1.05 + rand() * 0.35,
          (0.07 + rand() * 0.05) * scale,
          0.014,
          LEAF_BUD,
          LEAF_TIP
        );
      }

      const skirt = 6 + Math.floor(rand() * 3);
      for (let i = 0; i < skirt; i++) {
        const angle = (i / skirt) * Math.PI * 2 + rand() * 0.2;
        rosetteLeaf(
          x,
          y - 0.02,
          z,
          angle,
          -0.2 - rand() * 0.5,
          (0.11 + rand() * 0.08) * scale,
          0.018,
          SKIRT_BASE,
          SKIRT_TIP
        );
      }
    };

    // Plantas del páramo: uno o dos frailejones por mata. Tronco leñoso corto
    // y roseta de hojas plateadas: la silueta es vertical, de frailejón, no de
    // arbusto redondeado ni de manojo de briznas.
    for (let p = 0; p < plants; p++) {
      const angle = rand() * Math.PI * 2;
      const offset = p === 0 ? 0 : 0.1 + rand() * 0.12;
      const x = Math.cos(angle) * offset;
      const z = Math.sin(angle) * offset;
      const height = 0.3 + rand() * 0.34;
      const radius = 0.055 + rand() * 0.028;
      const leanAngle = rand() * Math.PI * 2;
      const lean = 0.02 + rand() * 0.06;
      const leanX = Math.cos(leanAngle) * lean;
      const leanZ = Math.sin(leanAngle) * lean;
      trunk(x, z, height, radius, leanX, leanZ);
      rosette(x + leanX, height + 0.005, z + leanZ, 0.9 + rand() * 0.25);
    }

    const mesh = new pc.Mesh(device);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setColors(colors);
    mesh.setIndices(indices);
    mesh.update();
    return mesh;
  };

  const shrubClusterMeshes = [0, 1, 2, 3, 4].map((variant) =>
    buildShrubCluster(0x63c1 + variant * 3301, 1 + (variant % 2))
  );

  const paramoPlants: Array<{
    entity: pc.Entity;
    yaw: number;
    phase: number;
    strength: number;
  }> = [];

  const paramoZones = TERRAIN_ZONES.filter((zone) => zone.terrain === 'electric');
  paramoZones.forEach((zone, zoneIndex) => {
    const rand = random(0xd0b5 + zoneIndex * 6421);
    const count = Math.round(Math.PI * zone.radius * zone.radius * 1.2);
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = Math.sqrt(rand()) * (zone.radius - 0.3);
      const x = zone.x + Math.cos(angle) * distance;
      const z = zone.z + Math.sin(angle) * distance;
      const yaw = rand() * 360;
      const clusterScale = 0.9 + rand() * 0.25;

      const plant = new pc.Entity(`paramo-frailejon-${zoneIndex}-${i}`);
      plant.setLocalPosition(x, 0.002, z);
      plant.setLocalEulerAngles(0, yaw, 0);
      plant.addComponent('render');
      plant.render!.castShadows = false;
      plant.render!.receiveShadows = false;
      const instance = new pc.MeshInstance(
        shrubClusterMeshes[(i + zoneIndex) % shrubClusterMeshes.length],
        paramoMaterial
      );
      instance.castShadow = false;
      instance.receiveShadow = false;
      plant.render!.meshInstances = [instance];
      plant.setLocalScale(clusterScale, clusterScale, clusterScale);
      app.root.addChild(plant);
      created.push(plant);

      paramoPlants.push({
        entity: plant,
        yaw,
        phase: x * 0.42 + z * 0.31 + rand() * 1.5,
        strength: 0.5 + rand() * 0.4
      });
    }
  });

  // Hierba seca del páramo: briznas cortas y pajizas que llenan los huecos
  // entre los frailejones. Reutiliza la malla de la hierba alta con otra paleta
  // y menos altura, así que tiene el mismo volumen y la misma técnica.
  const dryGrassMeshes = [0, 1, 2, 3].map((variant) =>
    buildGrassCluster(0x8c3f + variant * 2749, 14, DRY_GRASS_PALETTE, 0.55)
  );

  const dryGrassTufts: Array<{
    entity: pc.Entity;
    yaw: number;
    phase: number;
    strength: number;
  }> = [];

  paramoZones.forEach((zone, zoneIndex) => {
    const rand = random(0xb17c + zoneIndex * 4391);
    const count = Math.round(Math.PI * zone.radius * zone.radius * 2.6);
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = Math.sqrt(rand()) * (zone.radius - 0.3);
      const x = zone.x + Math.cos(angle) * distance;
      const z = zone.z + Math.sin(angle) * distance;
      const yaw = rand() * 360;
      const tuftScale = 0.85 + rand() * 0.45;

      const tuft = new pc.Entity(`paramo-dry-grass-${zoneIndex}-${i}`);
      tuft.setLocalPosition(x, 0.002, z);
      tuft.setLocalEulerAngles(0, yaw, 0);
      tuft.addComponent('render');
      tuft.render!.castShadows = false;
      tuft.render!.receiveShadows = false;
      const instance = new pc.MeshInstance(
        dryGrassMeshes[(i + zoneIndex) % dryGrassMeshes.length],
        paramoMaterial
      );
      instance.castShadow = false;
      instance.receiveShadow = false;
      tuft.render!.meshInstances = [instance];
      tuft.setLocalScale(tuftScale, tuftScale, tuftScale);
      app.root.addChild(tuft);
      created.push(tuft);

      dryGrassTufts.push({
        entity: tuft,
        yaw,
        phase: x * 0.55 + z * 0.4 + rand() * 1.6,
        strength: 0.55 + rand() * 0.45
      });
    }
  });

  // Hierba oscura de la ciénaga: briznas casi negras que sobresalen del agua
  // turbia. Usa la misma malla que la hierba alta con una paleta apagada,
  // menos briznas y menos altura: la ciénaga debe leerse como un lodazal con
  // matas dispersas, no como un prado frondoso.
  const darkGrassMeshes = [0, 1, 2, 3].map((variant) =>
    buildGrassCluster(0x4d17 + variant * 1993, 11, DARK_GRASS_PALETTE, 0.6)
  );

  const darkGrassTufts: Array<{
    entity: pc.Entity;
    yaw: number;
    phase: number;
    strength: number;
  }> = [];

  swampZones.forEach((zone, zoneIndex) => {
    const rand = random(0x7a31 + zoneIndex * 6203);
    const count = Math.round(Math.PI * zone.radius * zone.radius * 1.8);
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const distance = Math.sqrt(rand()) * (zone.radius - 0.3);
      const x = zone.x + Math.cos(angle) * distance;
      const z = zone.z + Math.sin(angle) * distance;
      const yaw = rand() * 360;
      const tuftScale = 0.85 + rand() * 0.4;

      const tuft = new pc.Entity(`swamp-grass-${zoneIndex}-${i}`);
      tuft.setLocalPosition(x, 0.002, z);
      tuft.setLocalEulerAngles(0, yaw, 0);
      tuft.addComponent('render');
      tuft.render!.castShadows = false;
      tuft.render!.receiveShadows = false;
      const instance = new pc.MeshInstance(
        darkGrassMeshes[(i + zoneIndex) % darkGrassMeshes.length],
        paramoMaterial
      );
      instance.castShadow = false;
      instance.receiveShadow = false;
      tuft.render!.meshInstances = [instance];
      tuft.setLocalScale(tuftScale, tuftScale, tuftScale);
      app.root.addChild(tuft);
      created.push(tuft);

      darkGrassTufts.push({
        entity: tuft,
        yaw,
        phase: x * 0.6 + z * 0.45 + rand() * 1.7,
        strength: 0.5 + rand() * 0.45
      });
    }
  });

  // Humo bajo de la ciénaga: bocanadas que nacen casi a ras del agua, suben
  // despacio y se ensanchan hasta deshacerse. El tono verdoso y la opacidad
  // baja lo separan del polvo del desierto: aquí interesa que parezca vapor
  // estancado, no una nube.
  swampZones.forEach((zone, zoneIndex) => {
    const smoke = new pc.Entity(`swamp-smoke-${zoneIndex}`);
    smoke.setPosition(zone.x, 0.3, zone.z);
    smoke.addComponent('particlesystem', {
      numParticles: 65,
      lifetime: 7,
      rate: 0.09,
      rate2: 0.14,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: new pc.Vec3(zone.radius * 1.75, 0.5, zone.radius * 1.75),
      colorMap: smokeTexture,
      colorGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 0.72, 1, 0.55],
          [0, 0.78, 1, 0.62],
          [0, 0.68, 1, 0.5]
        ]
      },
      alphaGraph: { type: pc.CURVE_LINEAR, keys: [0, 0, 0.2, 0.46, 0.7, 0.28, 1, 0] },
      scaleGraph: { type: pc.CURVE_LINEAR, keys: [0, 0.38, 0.45, 0.76, 1, 1.28] },
      velocityGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 0.03, 1, 0.09],
          [0, 0.08, 1, 0.2],
          [0, 0.015, 1, 0.05]
        ]
      },
      blendType: pc.BLEND_NORMAL,
      depthWrite: false,
      useFog: true,
      lighting: false,
      intensity: 1,
      orientation: pc.PARTICLEORIENTATION_SCREEN
    });
    app.root.addChild(smoke);
    if (smoke.particlesystem) smoke.particlesystem.drawOrder = 2;
    created.push(smoke);
  });

  // --- Bosque umbrío: árboles secos, fuegos fatuos y niebla ------------------
  // El calvero fantasmal no se queda en el suelo pintado: levanta cinco árboles
  // retorcidos sin hojas, enciende luces flotantes y arrastra una niebla baja.
  // La madera va con color por vértice, del casi negro de la base al gris
  // violeta de las puntas, así que tiene volumen desde la cámara a 45º.
  const ghostZones = TERRAIN_ZONES.filter((zone) => zone.terrain === 'ghost');

  const ghostMaterial = standard({
    diffuse: '#ffffff',
    specular: '#0b0910',
    gloss: 0.05,
    cull: pc.CULLFACE_NONE
  });
  ghostMaterial.diffuseVertexColor = true;
  ghostMaterial.update();
  materials.push(ghostMaterial);

  const GHOST_BARK_BASE: [number, number, number] = [0.075, 0.065, 0.095];
  const GHOST_BARK_MID: [number, number, number] = [0.135, 0.12, 0.165];
  const GHOST_BARK_TIP: [number, number, number] = [0.24, 0.22, 0.3];

  const buildDeadTree = (seed: number): pc.Mesh => {
    const rand = random(seed);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const push = (
      x: number,
      y: number,
      z: number,
      nx: number,
      ny: number,
      nz: number,
      color: [number, number, number]
    ) => {
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      colors.push(color[0], color[1], color[2], 1);
    };

    /** Ramal: prisma facetado que se estrecha de `r0` a `r1`. */
    const limb = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
      r0: number,
      r1: number,
      c0: [number, number, number],
      c1: [number, number, number]
    ) => {
      const sides = 5;
      let dx = bx - ax;
      let dy = by - ay;
      let dz = bz - az;
      const length = Math.hypot(dx, dy, dz) || 1;
      dx /= length;
      dy /= length;
      dz /= length;

      // Dos ejes perpendiculares al ramal para construir los anillos.
      const refX = Math.abs(dy) > 0.92 ? 1 : 0;
      const refY = Math.abs(dy) > 0.92 ? 0 : 1;
      let sx = -dz * refY;
      let sy = dz * refX;
      let sz = dx * refY - dy * refX;
      const sideLength = Math.hypot(sx, sy, sz) || 1;
      sx /= sideLength;
      sy /= sideLength;
      sz /= sideLength;
      const ux = dy * sz - dz * sy;
      const uy = dz * sx - dx * sz;
      const uz = dx * sy - dy * sx;

      const ring = (
        cx: number,
        cy: number,
        cz: number,
        radius: number
      ): Array<[number, number, number]> => {
        const points: Array<[number, number, number]> = [];
        for (let s = 0; s < sides; s++) {
          const angle = (s / sides) * Math.PI * 2;
          const wobble = 0.85 + rand() * 0.3;
          points.push([
            cx + (sx * Math.cos(angle) + ux * Math.sin(angle)) * radius * wobble,
            cy + (sy * Math.cos(angle) + uy * Math.sin(angle)) * radius * wobble,
            cz + (sz * Math.cos(angle) + uz * Math.sin(angle)) * radius * wobble
          ]);
        }
        return points;
      };

      const startRing = ring(ax, ay, az, r0);
      const endRing = ring(bx, by, bz, r1);
      const axisX = (ax + bx) / 2;
      const axisY = (ay + by) / 2;
      const axisZ = (az + bz) / 2;

      for (let s = 0; s < sides; s++) {
        const next = (s + 1) % sides;
        const a = startRing[s];
        const b = startRing[next];
        const c = endRing[next];
        const d = endRing[s];
        const e1x = b[0] - a[0];
        const e1y = b[1] - a[1];
        const e1z = b[2] - a[2];
        const e2x = d[0] - a[0];
        const e2y = d[1] - a[1];
        const e2z = d[2] - a[2];
        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        const faceX = (a[0] + b[0] + c[0] + d[0]) / 4 - axisX;
        const faceY = (a[1] + b[1] + c[1] + d[1]) / 4 - axisY;
        const faceZ = (a[2] + b[2] + c[2] + d[2]) / 4 - axisZ;
        if (nx * faceX + ny * faceY + nz * faceZ < 0) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
        const normalLength = Math.hypot(nx, ny, nz) || 1;
        nx /= normalLength;
        ny /= normalLength;
        nz /= normalLength;

        const start = positions.length / 3;
        push(a[0], a[1], a[2], nx, ny, nz, c0);
        push(b[0], b[1], b[2], nx, ny, nz, c0);
        push(c[0], c[1], c[2], nx, ny, nz, c1);
        push(d[0], d[1], d[2], nx, ny, nz, c1);
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      }

      // Punta cerrada por un abanico: evita ver el interior del tronco.
      const tip = positions.length / 3;
      const tipX = bx + dx * r1 * 1.4;
      const tipY = by + dy * r1 * 1.4;
      const tipZ = bz + dz * r1 * 1.4;
      push(tipX, tipY, tipZ, dx, dy, dz, c1);
      for (let s = 0; s < sides; s++) {
        const next = (s + 1) % sides;
        push(endRing[s][0], endRing[s][1], endRing[s][2], dx, dy, dz, c1);
        push(endRing[next][0], endRing[next][1], endRing[next][2], dx, dy, dz, c1);
        indices.push(tip, tip + s * 2 + 1, tip + s * 2 + 2);
      }
    };

    // Raíces cortas que agarran el suelo.
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + rand() * 0.6;
      limb(
        0,
        0.06,
        0,
        Math.cos(angle) * 0.24,
        0.02,
        Math.sin(angle) * 0.24,
        0.075,
        0.028,
        GHOST_BARK_BASE,
        GHOST_BARK_MID
      );
    }

    // Tronco en dos tramos con inclinación progresiva.
    const leanX = (rand() - 0.5) * 0.24;
    const leanZ = (rand() - 0.5) * 0.24;
    const midX = leanX * 0.45;
    const midZ = leanZ * 0.45;
    limb(0, 0, 0, midX, 0.95, midZ, 0.115, 0.075, GHOST_BARK_BASE, GHOST_BARK_MID);
    limb(midX, 0.95, midZ, leanX, 1.72, leanZ, 0.075, 0.026, GHOST_BARK_MID, GHOST_BARK_TIP);

    // Ramas secas en dos tramos con un quiebro, para que no parezcan conos.
    const branchCount = 3 + Math.floor(rand() * 2);
    for (let i = 0; i < branchCount; i++) {
      const baseY = 0.85 + rand() * 0.72;
      const u = baseY > 0.95 ? (baseY - 0.95) / 0.77 : baseY / 0.95;
      const baseX = baseY > 0.95 ? midX + (leanX - midX) * u : midX * u;
      const baseZ = baseY > 0.95 ? midZ + (leanZ - midZ) * u : midZ * u;

      const sideAngle = rand() * Math.PI * 2;
      const reach = 0.3 + rand() * 0.34;
      const rise = 0.16 + rand() * 0.26;
      const dirX = Math.cos(sideAngle) * reach;
      const dirZ = Math.sin(sideAngle) * reach;
      const kneeX = baseX + dirX * 0.58;
      const kneeY = baseY + rise * 0.78;
      const kneeZ = baseZ + dirZ * 0.58;
      const tipX = kneeX + dirX * 0.46;
      const tipY = kneeY + rise * 0.6;
      const tipZ = kneeZ + dirZ * 0.46;

      limb(
        baseX,
        baseY,
        baseZ,
        kneeX,
        kneeY,
        kneeZ,
        0.043,
        0.024,
        GHOST_BARK_MID,
        GHOST_BARK_MID
      );
      limb(
        kneeX,
        kneeY,
        kneeZ,
        tipX,
        tipY,
        tipZ,
        0.024,
        0.007,
        GHOST_BARK_MID,
        GHOST_BARK_TIP
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

  const ghostTreeMeshes = [0, 1, 2].map((variant) =>
    buildDeadTree(0x5e21 + variant * 3571)
  );

  const ghostTrees: Array<{
    entity: pc.Entity;
    yaw: number;
    phase: number;
    strength: number;
  }> = [];

  ghostZones.forEach((zone, zoneIndex) => {
    const rand = random(0x3a47 + zoneIndex * 5309);
    const count = 5;
    const spots: Array<[number, number]> = [];
    for (let i = 0; i < count; i++) {
      let x = zone.x;
      let z = zone.z;
      for (let attempt = 0; attempt < 20; attempt++) {
        const angle = rand() * Math.PI * 2;
        const distance = 0.6 + Math.sqrt(rand()) * (zone.radius - 0.8);
        x = zone.x + Math.cos(angle) * distance;
        z = zone.z + Math.sin(angle) * distance;
        if (spots.every(([sx, sz]) => Math.hypot(x - sx, z - sz) > 0.95)) break;
      }
      spots.push([x, z]);

      const scale = 0.95 + rand() * 0.3;
      const yaw = rand() * 360;
      const tree = new pc.Entity(`ghost-tree-${zoneIndex}-${i}`);
      tree.setLocalPosition(x, 0.002, z);
      tree.setLocalEulerAngles(0, yaw, 0);
      tree.addComponent('render');
      tree.render!.castShadows = true;
      tree.render!.receiveShadows = true;
      const instance = new pc.MeshInstance(
        ghostTreeMeshes[(i + zoneIndex) % ghostTreeMeshes.length],
        ghostMaterial
      );
      instance.castShadow = true;
      instance.receiveShadow = true;
      tree.render!.meshInstances = [instance];
      tree.setLocalScale(scale, scale, scale);
      app.root.addChild(tree);
      created.push(tree);

      colliders.push({ type: 'circle', x, z, radius: 0.22 * scale });
      ghostTrees.push({
        entity: tree,
        yaw,
        phase: x * 0.37 + z * 0.29 + rand() * 1.4,
        strength: 0.5 + rand() * 0.5
      });
    }
  });

  const ghostLights: Array<{ entity: pc.Entity; phase: number }> = [];

  ghostZones.forEach((zone, zoneIndex) => {
    // Fuegos fatuos: orbes aditivos que flotan entre 0,4 y 1,3 m, derivan muy
    // despacio y parpadean. El violeta lo pone el colorGraph sobre una textura
    // neutra, así que no arrastran el naranja de las brasas.
    const wisps = new pc.Entity(`ghost-wisps-${zoneIndex}`);
    wisps.setPosition(zone.x, 0.85, zone.z);
    wisps.addComponent('particlesystem', {
      numParticles: 18,
      lifetime: 6.4,
      rate: 0.26,
      rate2: 0.4,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: new pc.Vec3(zone.radius * 1.5, 0.9, zone.radius * 1.5),
      colorMap: wispTexture,
      colorGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 0.74, 0.96, 1],
          [0, 0.63, 0.5, 1],
          [0, 0.4, 0.27, 0.86]
        ]
      },
      alphaGraph: { type: pc.CURVE_LINEAR, keys: [0, 0, 0.16, 0.9, 0.68, 0.48, 1, 0] },
      scaleGraph: {
        type: pc.CURVE_LINEAR,
        keys: [0, 0.04, 0.32, 0.11, 0.74, 0.085, 1, 0.02]
      },
      velocityGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 0.07, 1, 0.13],
          [0, 0.05, 1, 0.1],
          [0, 0.07, 1, 0.13]
        ]
      },
      blendType: pc.BLEND_ADDITIVE,
      depthWrite: false,
      useFog: true,
      lighting: false,
      intensity: 1,
      orientation: pc.PARTICLEORIENTATION_SCREEN
    });
    app.root.addChild(wisps);
    if (wisps.particlesystem) wisps.particlesystem.drawOrder = 2;
    created.push(wisps);

    // Niebla rastrera: caja ancha y baja, casi sin impulso vertical, para que
    // se arrastre entre los troncos en vez de subir como el humo de la ciénaga.
    // La densidad la marca `numParticles`: con 130 bocanadas y una vida larga
    // el calvero queda cubierto por una capa continua, no por jirones sueltos.
    const mist = new pc.Entity(`ghost-mist-${zoneIndex}`);
    mist.setPosition(zone.x, 0.45, zone.z);
    mist.addComponent('particlesystem', {
      numParticles: 130,
      lifetime: 10.5,
      rate: 0.05,
      rate2: 0.08,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: new pc.Vec3(zone.radius * 1.9, 0.6, zone.radius * 1.9),
      colorMap: smokeTexture,
      colorGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 0.66, 1, 0.8],
          [0, 0.6, 1, 0.7],
          [0, 0.7, 1, 0.86]
        ]
      },
      alphaGraph: { type: pc.CURVE_LINEAR, keys: [0, 0, 0.2, 0.52, 0.7, 0.32, 1, 0] },
      scaleGraph: { type: pc.CURVE_LINEAR, keys: [0, 0.38, 0.5, 0.95, 1, 1.28] },
      velocityGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 0.06, 1, 0.03],
          [0, 0.012, 1, 0.03],
          [0, 0.06, 1, 0.025]
        ]
      },
      blendType: pc.BLEND_NORMAL,
      depthWrite: false,
      useFog: true,
      lighting: false,
      intensity: 1,
      orientation: pc.PARTICLEORIENTATION_SCREEN
    });
    app.root.addChild(mist);
    if (mist.particlesystem) mist.particlesystem.drawOrder = 1;
    created.push(mist);

    // Luz violeta corta: tiñe los troncos y el suelo sin lavar el calvero.
    const glow = new pc.Entity(`ghost-glow-${zoneIndex}`);
    glow.addComponent('light', {
      type: 'omni',
      color: hex('#6d5fd0'),
      intensity: 0.45,
      range: 5.4,
      castShadows: false
    });
    glow.setPosition(zone.x, 1.15, zone.z);
    app.root.addChild(glow);
    created.push(glow);
    ghostLights.push({ entity: glow, phase: zoneIndex * 1.9 + zone.z * 0.27 });
  });

  // --- Cartel y nexo de la base azul ---------------------------------------
  const woodMaterial = standard({ diffuse: '#a97a4d', specular: '#2b1c10', gloss: 0.2 });
  materials.push(woodMaterial);

  const sign = new pc.Entity('sign');
  sign.setPosition(SIGN_POSITION.x, 0, SIGN_POSITION.z);
  sign.setLocalEulerAngles(0, -48, 0);
  app.root.addChild(sign);
  created.push(sign);
  part(sign, 'box', woodMaterial, { position: [0, 0.65, 0], scale: [0.14, 1.3, 0.14] });
  part(sign, 'box', woodMaterial, {
    position: [0, 1.32, 0],
    scale: [1.15, 0.62, 0.12],
    rotation: [0, 0, 2]
  });
  colliders.push({ type: 'circle', x: SIGN_POSITION.x, z: SIGN_POSITION.z, radius: 0.35 });

  // --- Nexos de las bases ---------------------------------------------------
  // Pedestal de piedra con un cristal emisivo del color del equipo y una luz
  // corta que tiñe la plataforma. Marcan el centro de cada base.
  const stoneMaterial = standard({ diffuse: '#8b8375', specular: '#1a1a1a', gloss: 0.14 });
  materials.push(stoneMaterial);
  for (const base of BASES) {
    const color = base.team === 'blue' ? '#5b8fd9' : '#d96b5b';
    const crystalMaterial = standard({
      diffuse: '#22303f',
      emissive: color,
      specular: '#ffffff',
      gloss: 0.8
    });
    materials.push(crystalMaterial);

    const nexus = new pc.Entity(`nexus-${base.team}`);
    nexus.setPosition(base.x, 0, base.z);
    app.root.addChild(nexus);
    created.push(nexus);

    part(nexus, 'cylinder', stoneMaterial, {
      position: [0, 0.24, 0],
      scale: [1.6, 0.48, 1.6]
    });
    part(nexus, 'cylinder', stoneMaterial, {
      position: [0, 0.62, 0],
      scale: [1.05, 0.3, 1.05]
    });
    const crystal = part(nexus, 'sphere', crystalMaterial, {
      position: [0, 1.35, 0],
      scale: [0.62, 0.92, 0.62]
    });
    crystal.render!.castShadows = false;

    const glow = new pc.Entity(`nexus-light-${base.team}`);
    glow.addComponent('light', {
      type: 'omni',
      color: hex(color),
      intensity: 0.9,
      range: 7,
      castShadows: false
    });
    glow.setPosition(base.x, 1.7, base.z);
    app.root.addChild(glow);
    created.push(glow);

    colliders.push({ type: 'circle', x: base.x, z: base.z, radius: 0.85 });
  }

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

      // Parpadeo de la luz de lava: dos senos desfasados, uno lento y otro
      // rápido, para que el resplandor no parezca una bombilla fija.
      for (const ember of emberLights) {
        const light = ember.entity.light;
        if (!light) continue;
        light.intensity =
          0.58 +
          Math.sin(time * 2.6 + ember.phase) * 0.07 +
          Math.sin(time * 6.3 + ember.phase * 1.7) * 0.035;
      }

      // La luz del bosque umbrío respira más despacio: un pulso largo con un
      // temblor corto, como una llama fría que se aviva y se apaga.
      for (const glow of ghostLights) {
        const light = glow.entity.light;
        if (!light) continue;
        light.intensity =
          0.42 +
          Math.sin(time * 1.6 + glow.phase) * 0.09 +
          Math.sin(time * 4.3 + glow.phase * 0.7) * 0.03;
      }

      // Dos capas de ondas en sentidos opuestos: los brillos cambian de sitio
      // y la superficie parece moverse sin desplazar la silueta del lago.
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

      // La ciénaga se mueve aún más despacio: el agua estancada no corre y su
      // superficie es mate, así que solo cambia el dibujo de las ondas.
      swampSurfaceMaterial.diffuseMapOffset = new pc.Vec2(-time * 0.07, time * 0.11);
      swampSurfaceMaterial.update();

      // Viento sobre la hierba alta: cada mata se inclina sobre su base con
      // una fase ligada a su posición, de modo que la onda recorre el calvero.
      for (const tuft of grassTufts) {
        const sway = Math.sin(time * 1.15 + tuft.phase) * 8 * tuft.strength;
        tuft.entity.setLocalEulerAngles(0, tuft.yaw, sway);
      }

      // Las flores del claro feérico se mecen con la misma onda, algo más
      // suave: los tallos son más rígidos que las briznas.
      for (const flower of fairyFlowers) {
        const sway = Math.sin(time * 1.05 + flower.phase) * 5 * flower.strength;
        flower.entity.setLocalEulerAngles(0, flower.yaw, sway);
      }

      // Los frailejones apenas se mueven: el tronco es leñoso y el viento del
      // páramo solo balancea un poco la roseta.
      for (const plant of paramoPlants) {
        const sway = Math.sin(time * 0.85 + plant.phase) * 2 * plant.strength;
        plant.entity.setLocalEulerAngles(0, plant.yaw, sway);
      }

      // La hierba seca se mece más que los frailejones, pero con una onda más
      // lenta y corta que la hierba alta: son briznas rígidas y pajizas.
      for (const tuft of dryGrassTufts) {
        const sway = Math.sin(time * 0.95 + tuft.phase) * 6 * tuft.strength;
        tuft.entity.setLocalEulerAngles(0, tuft.yaw, sway);
      }

      // Los árboles muertos se balancean muy poco y muy despacio: son troncos
      // secos, no copas frondosas, pero el movimiento los separa del decorado.
      for (const tree of ghostTrees) {
        const sway = Math.sin(time * 0.6 + tree.phase) * 1.6 * tree.strength;
        tree.entity.setLocalEulerAngles(0, tree.yaw, sway);
      }

      // Mariposas: vuelan hacia su objetivo y aletean rápido. Cuando llegan,
      // eligen otra mota del calvero, de modo que revolotean sin patrón fijo.
      for (const butterfly of butterflies) {
        const pos = butterfly.root.getPosition();
        let dx = butterfly.target.x - pos.x;
        let dy = butterfly.target.y - pos.y;
        let dz = butterfly.target.z - pos.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance < 0.25) {
          const angle = butterfly.rand() * Math.PI * 2;
          const radius = Math.sqrt(butterfly.rand()) * butterfly.radius * 0.72;
          butterfly.target.set(
            butterfly.cx + Math.cos(angle) * radius,
            0.5 + butterfly.rand() * 1.0,
            butterfly.cz + Math.sin(angle) * radius
          );
        } else if (distance > 0.0001) {
          const step = butterfly.speed * dt;
          dx /= distance;
          dy /= distance;
          dz /= distance;
          butterfly.root.setPosition(
            pos.x + dx * step,
            pos.y + dy * step,
            pos.z + dz * step
          );

          const targetYaw = Math.atan2(dx, dz) * (180 / Math.PI);
          let delta = targetYaw - butterfly.yaw;
          while (delta > 180) delta -= 360;
          while (delta < -180) delta += 360;
          butterfly.yaw += delta * Math.min(1, dt * 6);
        }
        butterfly.phase += dt * butterfly.flapSpeed;
        const flap = Math.sin(butterfly.phase) * 30;
        butterfly.root.setLocalEulerAngles(0, butterfly.yaw, 0);
        butterfly.right.setLocalEulerAngles(0, 0, flap);
        butterfly.left.setLocalEulerAngles(0, 0, -flap);
      }

      // La hierba de la ciénaga está medio sumergida: se mece despacio, como
      // si el agua frenara cada brizna.
      for (const tuft of darkGrassTufts) {
        const sway = Math.sin(time * 0.75 + tuft.phase) * 4.5 * tuft.strength;
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
      dustTexture.destroy();
      frostTexture.destroy();
      smokeTexture.destroy();
      emberTexture.destroy();
      wispTexture.destroy();
      pollenTexture.destroy();
      skyTexture.destroy();
      barkTexture.destroy();
      for (const texture of leafTextures) texture.destroy();
      for (const texture of rockTextures) texture.destroy();
      for (const mesh of grassClusterMeshes) mesh.destroy();
      for (const mesh of flowerClusterMeshes) mesh.destroy();
      for (const mesh of shrubClusterMeshes) mesh.destroy();
      for (const mesh of dryGrassMeshes) mesh.destroy();
      for (const mesh of darkGrassMeshes) mesh.destroy();
      for (const mesh of iceClusterMeshes) mesh.destroy();
      for (const mesh of basaltMeshes) mesh.destroy();
      for (const mesh of ghostTreeMeshes) mesh.destroy();
      butterflyWingRight.destroy();
      butterflyWingLeft.destroy();
    }
  };
}
