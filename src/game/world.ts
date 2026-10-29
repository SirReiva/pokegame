import * as pc from 'playcanvas';
import { CONFIG } from './config';
import {
  BASES,
  MOUNTAINS,
  TERRAIN_ZONES,
  WATER_ZONES,
  getActiveMap,
  mapHalfDepth,
  mapHalfWidth,
  onMountain,
  randomPointInZone,
  terrainAt,
  triangulatePolygon,
  zoneArea,
  zoneBounds,
  zoneCenter,
  zoneContainsInset,
  type TerrainZone
} from './terrain';
import {
  createBarkCanvas,
  createDustCanvas,
  createEmberCanvas,
  createFrostCanvas,
  createGroundCanvas,
  createLeafCanvas,
  createMistCanvas,
  createMountainRockCanvas,
  createPollenCanvas,
  createShadowCanvas,
  createSkyCanvas,
  createSmokeCanvas,
  createSparkCanvas,
  createSoilCanvas,
  createWallStoneCanvas,
  createWaterCanvas,
  createWispCanvas,
  groundTextureSize,
  textureFromCanvas
} from './textures';

export type Collider =
  | { type: 'circle'; x: number; z: number; radius: number; sightRadius?: number }
  | {
      type: 'segment';
      ax: number;
      az: number;
      bx: number;
      bz: number;
      radius: number;
      sightRadius?: number;
    };

export interface World {
  colliders: Collider[];
  /** Límites de movimiento: media anchura y media profundidad del mapa. */
  bounds: { x: number; z: number };
  waterHeight: number;
  shadowMaterial: pc.StandardMaterial;
  /**
   * Mallas de separadores (cordilleras y muros). Escriben esténcil 0 para que
   * el decal de sombra no tiña su cara visible; el resto del mundo escribe 1.
   */
  barrierMeshInstances: pc.MeshInstance[];
  update(dt: number): void;
  dispose(): void;
}

/** Extensión de una caja de emisión ajustada a la forma de la zona. */
function zoneEmitterExtents(
  zone: TerrainZone,
  factor: number,
  height: number
): pc.Vec3 {
  const bounds = zoneBounds(zone);
  return new pc.Vec3((bounds.width * factor) / 2, height, (bounds.depth * factor) / 2);
}

/**
 * Interruptor temporal de árboles: con `false` no se genera ninguno (ni los de
 * la jungla ni los secos del bosque umbrío) y tampoco sus colliders, así que
 * dejan de tapar la visión. Ponlo a `true` para recuperar el bosque tal cual.
 */
const SPAWN_TREES = false;

/**
 * Escala vertical de los picos de cordillera. 1 = altura original; 0.7 deja las
 * crestas un 30% más bajas sin tocar su huella en el suelo (colliders, visión y
 * anchura del trazado siguen igual).
 */
const MOUNTAIN_HEIGHT_SCALE = 0.7;

/**
 * Altura de los muros. La colisión y la visión usan el mismo ancho que en las
 * cordilleras; solo cambia la malla, así que esta altura es puramente visual.
 */
const WALL_HEIGHT = 2.3;

/**
 * Láminas continuas de niebla/polvo en regiones grandes. Desactivadas por
 * ahora: las regiones grandes se quedan sin efecto hasta que se ajuste el
 * diseño. Los charcos pequeños conservan sus partículas de siempre.
 */
const LARGE_REGION_WEATHER = false;

/**
 * Variante de `transformCoreVS` para follaje instanciado. Cada instancia lleva
 * en `instance_wind` su fase y su fuerza de viento; el vertex shader inclina la
 * mata sobre su base (y = 0) sin desplazarla. Así la animación de una región
 * entera cuesta un uniforme por material y ningún trabajo de CPU por mata.
 */
const WIND_TRANSFORM_CORE_VS = `
attribute vec4 vertex_position;
uniform mat4 matrix_viewProjection;
uniform mat4 matrix_model;
#ifdef INSTANCING
attribute vec4 instance_wind;
uniform float uWindTime;
uniform float uWindSpeed;
uniform float uWindAmplitude;
#endif
#ifdef MORPHING
	uniform vec2 morph_tex_params;
	attribute uint morph_vertex_id;
	ivec2 getTextureMorphCoords() {
		ivec2 textureSize = ivec2(morph_tex_params);
		int morphGridV = int(morph_vertex_id) / textureSize.x;
		int morphGridU = int(morph_vertex_id) - (morphGridV * textureSize.x);
		#ifdef WEBGPU
			morphGridV = textureSize.y - morphGridV - 1;
		#endif
		return ivec2(morphGridU, morphGridV);
	}
	#ifdef MORPHING_POSITION
		#ifdef MORPHING_INT
			uniform vec3 aabbSize;
			uniform vec3 aabbMin;
			uniform usampler2D morphPositionTex;
		#else
			uniform highp sampler2D morphPositionTex;
		#endif
	#endif
#endif
#ifdef defined(BATCH)
	#include "skinBatchVS"
	mat4 getModelMatrix() {
		return getBoneMatrix(vertex_boneIndices);
	}
#elif defined(SKIN)
	#include "skinVS"
	mat4 getModelMatrix() {
		return matrix_model * getSkinMatrix(vertex_boneIndices, vertex_boneWeights);
	}
#elif defined(INSTANCING)
	#include "transformInstancingVS"
#else
	mat4 getModelMatrix() {
		return matrix_model;
	}
#endif
vec3 getLocalPosition(vec3 vertexPosition) {
	vec3 localPos = vertexPosition;
	#ifdef INSTANCING
		// Giro sobre Z en el espacio local: la base queda fija y la punta se mece.
		float sway = sin(uWindTime * uWindSpeed + instance_wind.x) * uWindAmplitude * instance_wind.y;
		float swaySin = sin(sway);
		float swayCos = cos(sway);
		localPos = vec3(
			localPos.x * swayCos - localPos.y * swaySin,
			localPos.x * swaySin + localPos.y * swayCos,
			localPos.z
		);
	#endif
	#ifdef MORPHING_POSITION
		ivec2 morphUV = getTextureMorphCoords();
		#ifdef MORPHING_INT
			vec3 morphPos = vec3(texelFetch(morphPositionTex, ivec2(morphUV), 0).xyz) / 65535.0 * aabbSize + aabbMin;
		#else
			vec3 morphPos = texelFetch(morphPositionTex, ivec2(morphUV), 0).xyz;
		#endif
		localPos += morphPos;
	#endif
	return localPos;
}
`;

/** Lote instanciado de mariposas: cuerpo y las dos alas comparten índices. */
interface ButterflyBatch {
  body: Float32Array;
  right: Float32Array;
  left: Float32Array;
  bodyBuffer: pc.VertexBuffer;
  rightBuffer: pc.VertexBuffer;
  leftBuffer: pc.VertexBuffer;
}

interface Butterfly {
  batch: ButterflyBatch;
  /** Índice dentro de los buffers del lote. */
  index: number;
  zone: TerrainZone;
  rand: () => number;
  target: pc.Vec3;
  x: number;
  y: number;
  z: number;
  scale: number;
  speed: number;
  flapSpeed: number;
  phase: number;
  yaw: number;
}

interface InstancedFoliageOptions {
  label: string;
  zones: TerrainZone[];
  meshes: pc.Mesh[];
  material: pc.StandardMaterial;
  /** Matas por unidad cuadrada de la zona. */
  density: number;
  seed: number;
  scaleMin: number;
  scaleMax: number;
  strengthMin: number;
  strengthMax: number;
  /** Fase = x * phaseX + z * phaseZ + aleatorio * phaseJitter. */
  phaseX: number;
  phaseZ: number;
  phaseJitter: number;
}

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
  const map = getActiveMap();
  const HALF_X = mapHalfWidth();
  const HALF_Z = mapHalfDepth();
  const colliders: Collider[] = [];
  const created: pc.Entity[] = [];
  const materials: pc.StandardMaterial[] = [];
  const windMaterials: pc.StandardMaterial[] = [];
  const instancedFoliageBuffers: pc.VertexBuffer[] = [];
  const surfaceMeshes: pc.Mesh[] = [];
  const barrierMeshInstances: pc.MeshInstance[] = [];

  // Orden transparente manual: primero las láminas de agua, después las
  // sombras de contacto y al final el anillo del jugador. Así el anillo nunca
  // queda teñido por el agua según desde donde mire la cámara.
  const worldLayer = app.scene.layers.getLayerById(pc.LAYERID_WORLD);
  if (worldLayer) worldLayer.transparentSortMode = pc.SORTMODE_MANUAL;

  // --- Texturas procedurales -------------------------------------------------
  const groundTexture = textureFromCanvas(
    device,
    createGroundCanvas(
      groundTextureSize(map, { maxSize: Math.min(device.maxTextureSize, 8192) }),
      {
        map,
        zones: TERRAIN_ZONES
      }
    ),
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
    repeat: true,
    mipmaps: false,
    minFilter: pc.FILTER_LINEAR,
    magFilter: pc.FILTER_LINEAR
  });
  const mistTexture = textureFromCanvas(device, createMistCanvas(), {
    name: 'swamp-mist',
    repeat: true,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
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
  const sparkTexture = textureFromCanvas(device, createSparkCanvas(), {
    name: 'paramo-spark',
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

  // Piedra marrón de las cordilleras: tile repetible con facetas pixel art y
  // nieve en la cima. Se muestrea sin suavizado para conservar los píxeles.
  const mountainRockTexture = textureFromCanvas(device, createMountainRockCanvas(), {
    ...pixelOptions,
    name: 'mountain-rock',
    repeat: true,
    flipY: true
  });

  // Sillería gris de los muros: misma técnica de tile repetible.
  const wallStoneTexture = textureFromCanvas(device, createWallStoneCanvas(), {
    name: 'wall-stone',
    repeat: true,
    mipmaps: true
  });

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
    castShadows: CONFIG.sun.shadows,
    shadowResolution: CONFIG.sun.shadowResolution,
    shadowDistance: CONFIG.sun.shadowDistance,
    normalOffsetBias: CONFIG.sun.normalOffsetBias,
    shadowBias: CONFIG.sun.shadowBias
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
    scale: [HALF_X * 2, 1.1, HALF_Z * 2]
  });
  slab.render!.castShadows = false;
  created.push(slab);

  const ground = part(app.root, 'plane', grassMaterial, {
    position: [0, 0.001, 0],
    scale: [HALF_X * 2, 1, HALF_Z * 2]
  });
  ground.render!.castShadows = false;
  ground.render!.receiveShadows = true;
  created.push(ground);

  // Falda exterior: la cámara puede salir de los límites del mapa al mirar
  // desde una base. Un plano grande bajo el suelo evita que se vea el vacío y
  // deja que la niebla de la escena lo funda con el horizonte.
  const outerGroundMaterial = standard({
    diffuse: '#7fbf5b',
    specular: '#000000',
    gloss: 0.02
  });
  materials.push(outerGroundMaterial);
  const outerGround = part(app.root, 'plane', outerGroundMaterial, {
    position: [0, -0.04, 0],
    scale: [HALF_X * 2 + 140, 1, HALF_Z * 2 + 140]
  });
  outerGround.render!.castShadows = false;
  outerGround.render!.receiveShadows = false;
  created.push(outerGround);

  // --- Agua ----------------------------------------------------------------
  // Cada cuerpo de agua se construye con una malla plana triangulada a partir
  // de las celdas waterLow/waterHigh. Encima van dos capas translúcidas con
  // las UVs animadas en direcciones distintas.
  const makeWaterMaterial = (
    map: pc.Texture,
    opacity: number,
    tint = '#d9f6ff',
    glow = '#0f3b4d'
  ): pc.StandardMaterial => {
    const material = standard({
      diffuse: tint,
      diffuseMap: map,
      specular: '#ffffff',
      gloss: 0.9,
      opacity,
      blend: pc.BLEND_NORMAL,
      depthWrite: false,
      cull: pc.CULLFACE_NONE
    });
    material.emissive = hex(glow);
    material.update();
    materials.push(material);
    return material;
  };

  const waterSurfaceMaterial = makeWaterMaterial(waterTexture, 0.42);
  const waterGlintMaterial = makeWaterMaterial(waterGlintTexture, 0.3);
  const waterHeight = map.waterHeight;

  const buildSurfaceMesh = (
    points: Array<[number, number]>,
    y: number,
    uvScale: number
  ): pc.Mesh | null => {
    const indices = triangulatePolygon(points);
    if (indices.length === 0) return null;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    for (const [x, z] of points) {
      positions.push(x, y, z);
      normals.push(0, 1, 0);
      uvs.push(x / uvScale, z / uvScale);
    }

    const mesh = new pc.Mesh(device);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setUvs(0, uvs);
    mesh.setIndices(indices);
    mesh.update();
    surfaceMeshes.push(mesh);
    return mesh;
  };

  const addSurface = (
    mesh: pc.Mesh,
    material: pc.StandardMaterial,
    drawOrder: number,
    name: string
  ) => {
    const entity = new pc.Entity(name);
    entity.addComponent('render');
    entity.render!.castShadows = false;
    entity.render!.receiveShadows = false;
    const instance = new pc.MeshInstance(mesh, material);
    instance.castShadow = false;
    instance.receiveShadow = false;
    instance.drawOrder = drawOrder;
    entity.render!.meshInstances = [instance];
    app.root.addChild(entity);
    created.push(entity);
  };

  for (const zone of WATER_ZONES) {
    if (!('points' in zone)) continue;
    const base = buildSurfaceMesh(zone.points, waterHeight, 3.4);
    if (!base) continue;
    const glint = buildSurfaceMesh(zone.points, waterHeight + 0.004, 3.0);
    addSurface(base, waterSurfaceMaterial, 0, 'water-surface');
    if (glint) addSurface(glint, waterGlintMaterial, 1, 'water-glint');
  }

  // --- Ciénaga -------------------------------------------------------------
  // La ciénaga comparte la superficie plana, pero es mate y se mueve despacio.
  const swampZones = TERRAIN_ZONES.filter((zone) => zone.terrain === 'poison');
  /** Lado máximo de cada foco de niebla antes de dividir la ciénaga. */
  const SWAMP_MIST_TILE = 40;
  const swampSurfaceMaterial = standard({
    diffuse: '#4c5a3c',
    diffuseMap: waterTexture,
    tiling: [1.15, 1.05],
    specular: '#000000',
    gloss: 0,
    opacity: 0.42,
    blend: pc.BLEND_NORMAL,
    depthWrite: false,
    cull: pc.CULLFACE_NONE,
    emissive: '#0a1007'
  });
  materials.push(swampSurfaceMaterial);

  for (const zone of swampZones) {
    if (!('points' in zone)) continue;
    const mesh = buildSurfaceMesh(zone.points, waterHeight, 2.8);
    if (mesh) addSurface(mesh, swampSurfaceMaterial, 0, 'swamp-surface');
  }

  // Lámina de niebla baja para ciénagas grandes. De momento está desactivada
  // (`LARGE_REGION_WEATHER`): las zonas grandes se quedan sin efecto y los
  // charcos pequeños siguen usando sus bocanadas.
  const swampMistMaterial = LARGE_REGION_WEATHER
    ? standard({
        diffuse: '#e4f2dc',
        diffuseMap: mistTexture,
        specular: '#000000',
        gloss: 0,
        opacity: 0.55,
        blend: pc.BLEND_NORMAL,
        depthWrite: false,
        cull: pc.CULLFACE_NONE,
        useLighting: false
      })
    : null;
  if (swampMistMaterial) {
    materials.push(swampMistMaterial);
    for (const zone of swampZones) {
      if (!('points' in zone)) continue;
      const bounds = zoneBounds(zone);
      if (bounds.width <= SWAMP_MIST_TILE && bounds.depth <= SWAMP_MIST_TILE) continue;
      const mesh = buildSurfaceMesh(zone.points, waterHeight + 0.15, 16);
      if (mesh) addSurface(mesh, swampMistMaterial, 2, 'swamp-mist');
    }
  }

  // El agua profunda no es un collider fijo: depende del tipo del jugador y se
  // resuelve en `Game.resolvePosition` consultando las celdas de la rejilla.

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
      const x = (rand() * 2 - 1) * (HALF_X - 1.4);
      const z = (rand() * 2 - 1) * (HALF_Z - 1.4);
      if (terrainAt(x, z) !== 'jungle') continue;
      if (onMountain(x, z)) continue;
      if (
        TERRAIN_ZONES.some((zone) => zoneContainsInset(zone, x, z, -1.1))
      ) {
        continue;
      }
      if (spots.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < minGap)) continue;
      spots.push([x, z]);
    }
    return spots;
  };

  const trees: Array<[number, number, number]> = SPAWN_TREES
    ? scatter(46, 0x7a11, 1.9).map(([x, z], index) => {
        const rand = random(index * 977 + 13);
        return [x, z, 0.72 + rand() * 0.38];
      })
    : [];

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

    colliders.push({ type: 'circle', x, z, radius: 0.55 * scale, sightRadius: 1.25 * scale });
  });

  // --- Separadores: cordilleras ---------------------------------------------
  // Picos de piedra que se alzan a lo largo de cada cresta. Cada pico es una
  // malla facetada con color por vértice: gris rocoso en la base y nieve en la
  // cima. Se reparten a lo largo del trazado suavizado y se solapan para leerse
  // como una sierra continua. Cada tramo añade además un collider de tipo
  // `segment`, de modo que la cresta entera es intransitable.
  const mountainMaterial = standard({
    diffuse: '#ffffff',
    diffuseMap: mountainRockTexture,
    // Una sola repetición en vertical para que el casquete de nieve de la
    // textura quede siempre en la cima, y dos en horizontal para que las
    // facetas sigan siendo grandes al rodear el pico.
    tiling: [2, 1],
    specular: '#1a120c',
    gloss: 0.06,
    cull: pc.CULLFACE_NONE
  });
  mountainMaterial.diffuseVertexColor = true;
  mountainMaterial.update();
  materials.push(mountainMaterial);

  const MOUNTAIN_DARK: [number, number, number] = [0.6, 0.53, 0.45];
  const MOUNTAIN_LIGHT: [number, number, number] = [1, 0.97, 0.9];

  const buildMountainPeak = (seed: number): pc.Mesh => {
    const rand = random(seed);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const sides = 6 + Math.floor(rand() * 3);
    const bands = 4;
    const height = 1.8 + rand() * 0.7;
    const baseRadius = 0.7 + rand() * 0.3;
    const tipRadius = baseRadius * (0.12 + rand() * 0.08);
    const phase = rand() * Math.PI * 2;

    const push = (
      x: number,
      y: number,
      z: number,
      nx: number,
      ny: number,
      nz: number,
      color: [number, number, number],
      u: number,
      v: number
    ) => {
      positions.push(x, y, z);
      normals.push(nx, ny, nz);
      colors.push(color[0], color[1], color[2], 1);
      uvs.push(u, v);
    };

    const colorAt = (t: number): [number, number, number] => {
      // Sombreado suave de la base a la cima: más oscuro abajo y más claro
      // arriba. La textura de piedra aporta el detalle; el color por vértice
      // solo da volumen.
      const jitter = (rand() - 0.5) * 0.1;
      const s = Math.min(1, Math.max(0, t + jitter));
      return [
        MOUNTAIN_DARK[0] + (MOUNTAIN_LIGHT[0] - MOUNTAIN_DARK[0]) * s,
        MOUNTAIN_DARK[1] + (MOUNTAIN_LIGHT[1] - MOUNTAIN_DARK[1]) * s,
        MOUNTAIN_DARK[2] + (MOUNTAIN_LIGHT[2] - MOUNTAIN_DARK[2]) * s
      ];
    };

    // Anillos de base a cima: la cima se queda roma (nunca llega a cero) y se
    // tapa con un abanico, así que el pico no acaba en aguja.
    const rings: Array<Array<[number, number, number]>> = [];
    for (let b = 0; b <= bands; b++) {
      const t = b / bands;
      const radius = tipRadius + (baseRadius - tipRadius) * Math.pow(1 - t, 0.9);
      const ring: Array<[number, number, number]> = [];
      for (let s = 0; s < sides; s++) {
        const angle = phase + (s / sides) * Math.PI * 2;
        const wobble = 0.86 + rand() * 0.26;
        ring.push([
          Math.cos(angle) * radius * wobble,
          height * t,
          Math.sin(angle) * radius * wobble
        ]);
      }
      rings.push(ring);
    }

    for (let b = 0; b < bands; b++) {
      for (let s = 0; s < sides; s++) {
        const next = (s + 1) % sides;
        const a = rings[b][s];
        const bpt = rings[b][next];
        const c = rings[b + 1][next];
        const d = rings[b + 1][s];

        const ux = bpt[0] - a[0];
        const uy = bpt[1] - a[1];
        const uz = bpt[2] - a[2];
        const vx = d[0] - a[0];
        const vy = d[1] - a[1];
        const vz = d[2] - a[2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const cx = (a[0] + bpt[0] + c[0] + d[0]) / 4;
        const cz = (a[2] + bpt[2] + c[2] + d[2]) / 4;
        if (nx * cx + nz * cz < 0) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
        const normalLength = Math.hypot(nx, ny, nz) || 1;
        nx /= normalLength;
        ny /= normalLength;
        nz /= normalLength;

        const start = positions.length / 3;
        const u0 = s / sides;
        const u1 = next / sides;
        // La costura superior se queda justo por debajo de 1: con `repeat` el
        // valor exacto 1 envuelve a la fila inferior del tile y pinta una línea
        // oscura en el borde del pico.
        const v0 = (b / bands) * 0.999;
        const v1 = ((b + 1) / bands) * 0.999;
        push(a[0], a[1], a[2], nx, ny, nz, colorAt(b / bands), u0, v0);
        push(bpt[0], bpt[1], bpt[2], nx, ny, nz, colorAt(b / bands), u1, v0);
        push(c[0], c[1], c[2], nx, ny, nz, colorAt((b + 1) / bands), u1, v1);
        push(d[0], d[1], d[2], nx, ny, nz, colorAt((b + 1) / bands), u0, v1);
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      }
    }

    // Cima: un cono bajo que remata el pico en punta. Todas sus UVs apuntan al
    // mismo texel de nieve para que la tapa no muestree la textura en abanico
    // (eso producía el molinillo oscuro) y las caras solo se distingan por la
    // iluminación de su normal.
    const topRing = rings[bands];
    const topColor = colorAt(1);
    const apexLift = tipRadius * 0.9 + 0.12;
    const apex: [number, number, number] = [0, height + apexLift, 0];
    for (let s = 0; s < sides; s++) {
      const next = (s + 1) % sides;
      const a = topRing[s];
      const bpt = topRing[next];

      const ux = bpt[0] - a[0];
      const uy = bpt[1] - a[1];
      const uz = bpt[2] - a[2];
      const vx = apex[0] - a[0];
      const vy = apex[1] - a[1];
      const vz = apex[2] - a[2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      if (ny < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const normalLength = Math.hypot(nx, ny, nz) || 1;
      nx /= normalLength;
      ny /= normalLength;
      nz /= normalLength;

      const start = positions.length / 3;
      // u = 0.25 porque el material repite dos veces en horizontal: así el
      // texel elegido queda lejos de la costura donde u = 1 envuelve a 0.
      push(apex[0], apex[1], apex[2], nx, ny, nz, topColor, 0.25, 0.97);
      push(a[0], a[1], a[2], nx, ny, nz, topColor, 0.25, 0.97);
      push(bpt[0], bpt[1], bpt[2], nx, ny, nz, topColor, 0.25, 0.97);
      indices.push(start, start + 1, start + 2);
    }

    const mesh = new pc.Mesh(device);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setColors(colors);
    mesh.setUvs(0, uvs);
    mesh.setIndices(indices);
    mesh.update();
    return mesh;
  };

  const mountainPeakMeshes = [0, 1, 2, 3].map((variant) =>
    buildMountainPeak(0x3a91 + variant * 4133)
  );

  // --- Muros ----------------------------------------------------------------
  // La sillería comparte collider y visión con la cordillera; solo cambia la
  // malla. Cada tramo es un prisma alineado con el trazado, con almenas en los
  // dos bordes y el hueco central de paso superior.
  const wallMaterial = standard({
    diffuse: '#ffffff',
    diffuseMap: wallStoneTexture,
    // El doble de altura que antes, así que también el doble de hiladas para
    // que los bloques de sillería conserven su tamaño aparente.
    tiling: [2, 2],
    specular: '#2b3036',
    gloss: 0.16,
    cull: pc.CULLFACE_NONE
  });
  wallMaterial.diffuseVertexColor = true;
  wallMaterial.update();
  materials.push(wallMaterial);

  const WALL_DARK: [number, number, number] = [0.42, 0.44, 0.47];
  const WALL_LIGHT: [number, number, number] = [0.82, 0.84, 0.87];

  const buildWallSegment = (seed: number): pc.Mesh => {
    const rand = random(seed);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const addBox = (
      cx: number,
      cy: number,
      cz: number,
      sx: number,
      sy: number,
      sz: number,
      color: [number, number, number]
    ) => {
      const x0 = cx - sx / 2;
      const x1 = cx + sx / 2;
      const y0 = cy - sy / 2;
      const y1 = cy + sy / 2;
      const z0 = cz - sz / 2;
      const z1 = cz + sz / 2;

      const faces: Array<{
        normal: [number, number, number];
        corners: Array<[number, number, number]>;
      }> = [
        { normal: [0, 0, 1], corners: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
        { normal: [0, 0, -1], corners: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
        { normal: [1, 0, 0], corners: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
        { normal: [-1, 0, 0], corners: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
        { normal: [0, 1, 0], corners: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
        { normal: [0, -1, 0], corners: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] }
      ];
      const faceUvs: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];

      for (const face of faces) {
        const start = positions.length / 3;
        face.corners.forEach(([x, y, z], corner) => {
          positions.push(x, y, z);
          normals.push(face.normal[0], face.normal[1], face.normal[2]);
          colors.push(color[0], color[1], color[2], 1);
          uvs.push(faceUvs[corner][0], faceUvs[corner][1]);
        });
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      }
    };

    const shade = (t: number): [number, number, number] => [
      WALL_DARK[0] + (WALL_LIGHT[0] - WALL_DARK[0]) * t,
      WALL_DARK[1] + (WALL_LIGHT[1] - WALL_DARK[1]) * t,
      WALL_DARK[2] + (WALL_LIGHT[2] - WALL_DARK[2]) * t
    ];

    // Lienzo continuo de la base: el 78% inferior del muro.
    addBox(0, 0.39, 0, 1, 0.78, 1, shade(0.55));

    // Almenas en los dos bordes, con huecos entre ellas. Las de cada lado van
    // a distinta altura para que la silueta no parezca una valla perfecta.
    const merlons = 5;
    for (let i = 0; i < merlons; i++) {
      const x = -0.4 + (i / (merlons - 1)) * 0.8;
      for (const side of [-1, 1]) {
        const height = 0.18 + rand() * 0.07;
        addBox(
          x + (rand() - 0.5) * 0.03,
          0.78 + height / 2,
          side * 0.31,
          0.12,
          height,
          0.36,
          shade(0.7 + rand() * 0.3)
        );
      }
    }

    const mesh = new pc.Mesh(device);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setColors(colors);
    mesh.setUvs(0, uvs);
    mesh.setIndices(indices);
    mesh.update();
    return mesh;
  };

  const wallSegmentMeshes = [0, 1, 2, 3].map((variant) =>
    buildWallSegment(0x5c21 + variant * 3571)
  );

  /** Muestrea el trazado suavizado de una cresta (igual que `terrain.ts`). */
  const sampleRange = (
    points: Array<[number, number]>,
    step: number
  ): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    let previous = points[0];
    out.push([previous[0], previous[1]]);
    for (let i = 1; i < points.length - 1; i++) {
      const control = points[i];
      const next = points[i + 1];
      const end: [number, number] = [(control[0] + next[0]) / 2, (control[1] + next[1]) / 2];
      const span =
        Math.hypot(control[0] - previous[0], control[1] - previous[1]) +
        Math.hypot(end[0] - control[0], end[1] - control[1]);
      const steps = Math.max(2, Math.ceil(span / step));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const inv = 1 - t;
        out.push([
          inv * inv * previous[0] + 2 * inv * t * control[0] + t * t * end[0],
          inv * inv * previous[1] + 2 * inv * t * control[1] + t * t * end[1]
        ]);
      }
      previous = end;
    }
    const last = points[points.length - 1];
    const span = Math.hypot(last[0] - previous[0], last[1] - previous[1]);
    const steps = Math.max(2, Math.ceil(span / step));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push([
        previous[0] + (last[0] - previous[0]) * t,
        previous[1] + (last[1] - previous[1]) * t
      ]);
    }
    return out;
  };

  MOUNTAINS.forEach((range, rangeIndex) => {
    const rand = random(0x7d31 + rangeIndex * 7919);
    const samples = sampleRange(range.points, 0.8);

    // Colliders de segmento: sellan toda la cresta para que no se pueda cruzar.
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      colliders.push({
        type: 'segment',
        ax: a[0],
        az: a[1],
        bx: b[0],
        bz: b[1],
        radius: range.width / 2,
        sightRadius: range.width * 0.65
      });
    }

    if (range.kind === 'wall') {
      // Muros: un prisma por tramo, orientado con el trazado. Se alarga un poco
      // para que los codos no dejen rendijas entre segmentos. Además, la
      // colisión de cada tramo es una cápsula de radio `width / 2`, así que en
      // los dos extremos del trazado sobresale media anchura: el primer y el
      // último tramo se alargan lo mismo hacia fuera para tapar ese hueco.
      const capExtension = range.width / 2;
      const lastIndex = samples.length - 1;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const length = Math.hypot(dx, dz);
        if (length < 0.001) continue;

        const extendStart = i === 1 ? capExtension : 0;
        const extendEnd = i === lastIndex ? capExtension : 0;
        const centerShift = (extendEnd - extendStart) / 2;
        const unitX = dx / length;
        const unitZ = dz / length;

        const wall = new pc.Entity(`wall-${rangeIndex}-${i}`);
        wall.setLocalPosition(
          (a[0] + b[0]) / 2 + unitX * centerShift,
          0.02,
          (a[1] + b[1]) / 2 + unitZ * centerShift
        );
        wall.setLocalEulerAngles(0, (Math.atan2(-dz, dx) * 180) / Math.PI, 0);
        wall.setLocalScale(
          length + 0.3 + extendStart + extendEnd,
          WALL_HEIGHT,
          range.width
        );
        wall.addComponent('render');
        wall.render!.castShadows = true;
        wall.render!.receiveShadows = true;
        const instance = new pc.MeshInstance(
          wallSegmentMeshes[i % wallSegmentMeshes.length],
          wallMaterial
        );
        instance.castShadow = true;
        instance.receiveShadow = true;
        wall.render!.meshInstances = [instance];
        barrierMeshInstances.push(instance);
        app.root.addChild(wall);
        created.push(wall);
      }
      return;
    }

    // Picos: uno por muestra, con escalas y yaws variados. Se juntan lo
    // bastante para que sus bases se solapen y la sierra quede continua, sin
    // huecos que dejen ver la hierba entre picos.
    samples.forEach(([x, z], i) => {
      const jitterX = (rand() - 0.5) * 0.2;
      const jitterZ = (rand() - 0.5) * 0.2;
      const scale = 1.1 + rand() * 0.8;

      const peak = new pc.Entity(`mountain-${rangeIndex}-${i}`);
      peak.setLocalPosition(x + jitterX, 0.02, z + jitterZ);
      peak.setLocalEulerAngles(0, rand() * 360, 0);
      peak.setLocalScale(
        scale,
        scale * (0.9 + rand() * 0.45) * MOUNTAIN_HEIGHT_SCALE,
        scale
      );
      peak.addComponent('render');
      peak.render!.castShadows = true;
      peak.render!.receiveShadows = true;
      const instance = new pc.MeshInstance(
        mountainPeakMeshes[i % mountainPeakMeshes.length],
        mountainMaterial
      );
      instance.castShadow = true;
      instance.receiveShadow = true;
      peak.render!.meshInstances = [instance];
      barrierMeshInstances.push(instance);
      app.root.addChild(peak);
      created.push(peak);
    });
  });

  // Cactus del desierto: tronco y brazos con primitivas, repartidos dentro del
  // calvero. Son puramente decorativos: no llevan collider, así que no frenan
  // ni bloquean el paso.
  const cactusMaterial = standard({
    diffuse: '#4f8b47',
    specular: '#1d2b16',
    gloss: 0.18
  });
  materials.push(cactusMaterial);

  /** Cactus completo: los cinco cilindros originales fundidos en una malla. */
  const buildCactusMesh = (): pc.Mesh => {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const transform = new pc.Mat4();
    const rotation = new pc.Quat();

    const addCylinder = (
      position: [number, number, number],
      scale: [number, number, number],
      rotationZ: number
    ): void => {
      const geometry = new pc.CylinderGeometry({
        radius: 0.5,
        height: 1,
        heightSegments: 3,
        capSegments: 8
      });
      rotation.setFromEulerAngles(0, 0, rotationZ);
      transform.setTRS(
        new pc.Vec3(position[0], position[1], position[2]),
        rotation,
        new pc.Vec3(scale[0], scale[1], scale[2])
      );

      const base = positions.length / 3;
      const sourcePositions = geometry.positions;
      const sourceNormals = geometry.normals;
      for (let i = 0; i < sourcePositions.length; i += 3) {
        const point = new pc.Vec3(
          sourcePositions[i],
          sourcePositions[i + 1],
          sourcePositions[i + 2]
        );
        transform.transformPoint(point, point);
        positions.push(point.x, point.y, point.z);

        const normal = new pc.Vec3(
          sourceNormals[i],
          sourceNormals[i + 1],
          sourceNormals[i + 2]
        );
        transform.transformVector(normal, normal);
        normal.normalize();
        normals.push(normal.x, normal.y, normal.z);
      }
      for (const index of geometry.indices) indices.push(index + base);
    };

    // Mismas piezas y transformaciones que los cactus de siempre.
    addCylinder([0, 0.8, 0], [0.18, 1.6, 0.18], 0);
    addCylinder([-0.18, 0.85, 0], [0.1, 0.38, 0.1], 68);
    addCylinder([-0.34, 1.1, 0], [0.09, 0.5, 0.09], 0);
    addCylinder([0.18, 1.08, 0], [0.1, 0.32, 0.1], -68);
    addCylinder([0.32, 1.3, 0], [0.085, 0.44, 0.085], 0);

    const mesh = new pc.Mesh(device);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setIndices(indices);
    mesh.update();
    return mesh;
  };

  const cactusMesh = buildCactusMesh();
  const cactusInstanceFormat = pc.VertexFormat.getDefaultInstancingFormat(device);
  const DESERT_LARGE_AREA = 400;
  const desertZones = TERRAIN_ZONES.filter((zone) => zone.terrain === 'desert');

  desertZones.forEach((zone, zoneIndex) => {
    const area = zoneArea(zone);
    const rand = random(0x3c7d + zoneIndex * 4211);

    // Un desierto enorme con cuatro cactus solo se ve vacío. En zonas grandes
    // se reparten por área y se dibujan instanciados: una malla y un draw call.
    if (area > DESERT_LARGE_AREA) {
      const count = Math.max(4, Math.min(400, Math.round(area * 0.004)));
      const data = new Float32Array(count * 16);

      for (let i = 0; i < count; i++) {
        const [x, z] = randomPointInZone(zone, rand, 1.0, 0.7);
        const scale = 0.8 + rand() * 0.35;
        const yawRadians = (rand() * 360 * Math.PI) / 180;
        const cos = Math.cos(yawRadians) * scale;
        const sin = Math.sin(yawRadians) * scale;
        const offset = i * 16;
        data[offset] = cos;
        data[offset + 1] = 0;
        data[offset + 2] = -sin;
        data[offset + 3] = 0;
        data[offset + 4] = 0;
        data[offset + 5] = scale;
        data[offset + 6] = 0;
        data[offset + 7] = 0;
        data[offset + 8] = sin;
        data[offset + 9] = 0;
        data[offset + 10] = cos;
        data[offset + 11] = 0;
        data[offset + 12] = x;
        data[offset + 13] = 0;
        data[offset + 14] = z;
        data[offset + 15] = 1;
      }

      const buffer = new pc.VertexBuffer(device, cactusInstanceFormat, count, {
        data,
        usage: pc.BUFFER_STATIC
      });
      const instance = new pc.MeshInstance(cactusMesh, cactusMaterial);
      instance.castShadow = false;
      instance.receiveShadow = false;
      instance.setInstancing(buffer, true);
      instancedFoliageBuffers.push(buffer);

      const bounds = zoneBounds(zone);
      const entity = new pc.Entity(`desert-cactus-${zoneIndex}`);
      entity.addComponent('render');
      entity.render!.castShadows = false;
      entity.render!.receiveShadows = false;
      entity.render!.meshInstances = [instance];
      entity.render!.customAabb = new pc.BoundingBox(
        new pc.Vec3(bounds.cx, 1, bounds.cz),
        new pc.Vec3(bounds.width / 2 + 1, 1.2, bounds.depth / 2 + 1)
      );
      app.root.addChild(entity);
      created.push(entity);
      return;
    }

    // Zonas pequeñas: se conservan las cuatro entidades de siempre.
    const count = 4;
    const spots: Array<[number, number]> = [];
    for (let i = 0; i < count; i++) {
      let [x, z] = randomPointInZone(zone, rand, 1.0, 0.7);
      for (let attempt = 0; attempt < 20; attempt++) {
        const [nx, nz] = randomPointInZone(zone, rand, 1.0, 0.7);
        if (spots.every(([sx, sz]) => Math.hypot(nx - sx, nz - sz) > 1.1)) {
          x = nx;
          z = nz;
          break;
        }
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
    }
  });

  // --- Polvo del desierto --------------------------------------------------
  // Bruma continua para desiertos grandes: misma técnica que la niebla de la
  // ciénaga, teñida de arena. Un único emisor de partículas sobre un mapa
  // entero se pierde, así que en zonas grandes manda esta lámina y las
  // partículas quedan reservadas a los claros pequeños.
  const desertHazeMaterial = LARGE_REGION_WEATHER
    ? standard({
        diffuse: '#d8c08e',
        diffuseMap: mistTexture,
        specular: '#000000',
        gloss: 0,
        opacity: 0.5,
        blend: pc.BLEND_NORMAL,
        depthWrite: false,
        cull: pc.CULLFACE_NONE,
        useLighting: false
      })
    : null;
  if (desertHazeMaterial) {
    materials.push(desertHazeMaterial);
    for (const zone of desertZones) {
      if (!('points' in zone) || zoneArea(zone) <= DESERT_LARGE_AREA) continue;
      const mesh = buildSurfaceMesh(zone.points, 0.45, 18);
      if (mesh) addSurface(mesh, desertHazeMaterial, 2, 'desert-haze');
    }
  }

  // Partículas suaves en suspensión sobre toda la zona: nacen repartidas en una
  // caja baja, derivan despacio con el viento y crecen y se desvanecen. Usan
  // una textura de manchas difusas y blending normal, así que se leen como
  // polvo y no como chispas. La densidad y el tamaño son altos para que la
  // bruma se note desde la cámara a 45º.
  desertZones.forEach((zone, zoneIndex) => {
    if (zoneArea(zone) > DESERT_LARGE_AREA) return;

    const [dustX, dustZ] = zoneCenter(zone);
    const dust = new pc.Entity(`desert-dust-${zoneIndex}`);
    dust.setPosition(dustX, 0.8, dustZ);
    dust.addComponent('particlesystem', {
      numParticles: 90,
      lifetime: 5.5,
      rate: 0.045,
      rate2: 0.075,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: zoneEmitterExtents(zone, 2.0, 1.5),
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
  const iceInstanceFormat = pc.VertexFormat.getDefaultInstancingFormat(device);
  iceZones.forEach((zone, zoneIndex) => {
    const rand = random(0x71f3 + zoneIndex * 6701);
    const count = Math.round(zoneArea(zone) * 1.5);
    if (count <= 0) return;

    const variants = iceClusterMeshes.length;
    const counts = new Array<number>(variants).fill(0);
    for (let i = 0; i < count; i++) counts[(i + zoneIndex) % variants]++;

    const buffers = counts.map((size) => new Float32Array(size * 16));
    const cursors = new Array<number>(variants).fill(0);

    for (let i = 0; i < count; i++) {
      const [x, z] = randomPointInZone(zone, rand, 0.35);
      const scale = 0.75 + rand() * 0.5;
      const variant = (i + zoneIndex) % variants;
      const data = buffers[variant];
      const offset = cursors[variant]++ * 16;

      // Matriz de mundo en columnas: giro en Y, escala uniforme y traslación.
      const yawRadians = (rand() * 360 * Math.PI) / 180;
      const cos = Math.cos(yawRadians) * scale;
      const sin = Math.sin(yawRadians) * scale;
      data[offset] = cos;
      data[offset + 1] = 0;
      data[offset + 2] = -sin;
      data[offset + 3] = 0;
      data[offset + 4] = 0;
      data[offset + 5] = scale;
      data[offset + 6] = 0;
      data[offset + 7] = 0;
      data[offset + 8] = sin;
      data[offset + 9] = 0;
      data[offset + 10] = cos;
      data[offset + 11] = 0;
      data[offset + 12] = x;
      data[offset + 13] = 0.002;
      data[offset + 14] = z;
      data[offset + 15] = 1;
    }

    const bounds = zoneBounds(zone);
    const aabb = new pc.BoundingBox(
      new pc.Vec3(bounds.cx, 0.7, bounds.cz),
      new pc.Vec3(bounds.width / 2 + 1, 0.9, bounds.depth / 2 + 1)
    );

    for (let variant = 0; variant < variants; variant++) {
      const data = buffers[variant];
      if (data.length === 0) continue;

      const buffer = new pc.VertexBuffer(device, iceInstanceFormat, data.length / 16, {
        data,
        usage: pc.BUFFER_STATIC
      });
      const instance = new pc.MeshInstance(iceClusterMeshes[variant], iceMaterial);
      instance.castShadow = false;
      instance.receiveShadow = false;
      instance.setInstancing(buffer, true);
      instancedFoliageBuffers.push(buffer);

      const entity = new pc.Entity(`ice-crystal-${zoneIndex}-${variant}`);
      entity.addComponent('render');
      entity.render!.castShadows = false;
      entity.render!.receiveShadows = false;
      entity.render!.meshInstances = [instance];
      entity.render!.customAabb = aabb;
      app.root.addChild(entity);
      created.push(entity);
    }
  });

  // Nieve fina sobre la escarcha: copos pequeños que caen despacio y derivan
  // con el viento. La caja de emisión es alta, así que hay copos a distintas
  // alturas y el efecto se lee desde la cámara a 45º sin tapar el suelo.
  iceZones.forEach((zone, zoneIndex) => {
    const [snowX, snowZ] = zoneCenter(zone);
    const snow = new pc.Entity(`ice-snow-${zoneIndex}`);
    snow.setPosition(snowX, 1.5, snowZ);
    snow.addComponent('particlesystem', {
      numParticles: 70,
      lifetime: 5.2,
      rate: 0.07,
      rate2: 0.11,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: zoneEmitterExtents(zone, 1.9, 1.6),
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
  const basaltInstanceFormat = pc.VertexFormat.getDefaultInstancingFormat(device);
  const MAX_SMOKE_VENTS = 8;

  fireZones.forEach((zone, zoneIndex) => {
    const rand = random(0x2f5b + zoneIndex * 4517);
    // Antes eran 5 racimos fijos por zona: suficiente en una colada pequeña,
    // invisible en un mapa volcánico entero. La densidad escala con el área y
    // los racimos se dibujan instanciados (4 draw calls por zona).
    const count = Math.max(5, Math.min(2000, Math.round(zoneArea(zone) * 0.01)));
    const variants = basaltMeshes.length;
    const counts = new Array<number>(variants).fill(0);
    for (let i = 0; i < count; i++) counts[(i + zoneIndex) % variants]++;

    const buffers = counts.map((size) => new Float32Array(size * 16));
    const cursors = new Array<number>(variants).fill(0);
    const spots: Array<[number, number]> = [];
    // El espaciado se mantiene solo en zonas pequeñas; con cientos de racimos
    // el chequeo contra todos sería cuadrático e innecesario.
    const checkSpacing = count <= 24;

    for (let i = 0; i < count; i++) {
      let [x, z] = randomPointInZone(zone, rand, 1.0, 0.55);
      if (checkSpacing) {
        for (let attempt = 0; attempt < 16; attempt++) {
          const [nx, nz] = randomPointInZone(zone, rand, 1.0, 0.55);
          if (spots.every(([sx, sz]) => Math.hypot(nx - sx, nz - sz) > 1.0)) {
            x = nx;
            z = nz;
            break;
          }
        }
      }
      spots.push([x, z]);

      const scale = 0.8 + rand() * 0.4;
      const variant = (i + zoneIndex) % variants;
      const data = buffers[variant];
      const offset = cursors[variant]++ * 16;
      const yawRadians = (rand() * 360 * Math.PI) / 180;
      const cos = Math.cos(yawRadians) * scale;
      const sin = Math.sin(yawRadians) * scale;
      data[offset] = cos;
      data[offset + 1] = 0;
      data[offset + 2] = -sin;
      data[offset + 3] = 0;
      data[offset + 4] = 0;
      data[offset + 5] = scale;
      data[offset + 6] = 0;
      data[offset + 7] = 0;
      data[offset + 8] = sin;
      data[offset + 9] = 0;
      data[offset + 10] = cos;
      data[offset + 11] = 0;
      data[offset + 12] = x;
      data[offset + 13] = 0.002;
      data[offset + 14] = z;
      data[offset + 15] = 1;
    }

    const bounds = zoneBounds(zone);
    const aabb = new pc.BoundingBox(
      new pc.Vec3(bounds.cx, 0.6, bounds.cz),
      new pc.Vec3(bounds.width / 2 + 1, 0.9, bounds.depth / 2 + 1)
    );

    for (let variant = 0; variant < variants; variant++) {
      const data = buffers[variant];
      if (data.length === 0) continue;

      const buffer = new pc.VertexBuffer(device, basaltInstanceFormat, data.length / 16, {
        data,
        usage: pc.BUFFER_STATIC
      });
      const instance = new pc.MeshInstance(basaltMeshes[variant], basaltMaterial);
      instance.castShadow = true;
      instance.receiveShadow = true;
      instance.setInstancing(buffer, true);
      instancedFoliageBuffers.push(buffer);

      const entity = new pc.Entity(`basalt-${zoneIndex}-${variant}`);
      entity.addComponent('render');
      entity.render!.castShadows = true;
      entity.render!.receiveShadows = true;
      entity.render!.meshInstances = [instance];
      entity.render!.customAabb = aabb;
      app.root.addChild(entity);
      created.push(entity);
    }

    // El humo no puede tener una columna por cada roca en una zona enorme:
    // se conservan unos pocos focos repartidos entre los racimos.
    const ventCount = Math.min(MAX_SMOKE_VENTS, spots.length);
    const vents: Array<[number, number]> = [];
    for (let v = 0; v < ventCount; v++) {
      const index = Math.min(
        spots.length - 1,
        Math.floor(((v + 0.5) * spots.length) / ventCount)
      );
      vents.push(spots[index]);
    }
    basaltVents.push(vents);
  });

  const emberLights: Array<{ entity: pc.Entity; phase: number }> = [];

  fireZones.forEach((zone, zoneIndex) => {
    const [fireX, fireZ] = zoneCenter(zone);
    // Brasas que suben de la costra: pequeñas, aditivas y con deriva corta.
    const embers = new pc.Entity(`fire-embers-${zoneIndex}`);
    embers.setPosition(fireX, 0.22, fireZ);
    embers.addComponent('particlesystem', {
      numParticles: 44,
      lifetime: 3.4,
      rate: 0.055,
      rate2: 0.09,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: zoneEmitterExtents(zone, 1.55, 0.35),
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
    glow.setPosition(fireX, 0.75, fireZ);
    app.root.addChild(glow);
    created.push(glow);
    emberLights.push({ entity: glow, phase: zoneIndex * 2.1 + fireX * 0.3 });
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
  //
  // Las matas se dibujan con GPU Instancing: una sola malla y un solo draw call
  // por variante y región. El viento va en el vertex shader, así que animar
  // miles de matas no toca la CPU.

  /**
   * Material de follaje instanciado con viento. `instance_wind` (atributo de
   * instancia) guarda la fase y la fuerza; el chunk `transformCoreVS` inclina
   * cada vértice alrededor de la base de la mata.
   */
  const createWindMaterial = (
    specular: string,
    gloss: number,
    speed: number,
    amplitudeDegrees: number
  ): pc.StandardMaterial => {
    const material = standard({
      diffuse: '#ffffff',
      specular,
      gloss,
      cull: pc.CULLFACE_NONE
    });
    material.diffuseVertexColor = true;
    material.userAttributes.set(pc.SEMANTIC_ATTR13, 'instance_wind');
    material
      .getShaderChunks(pc.SHADERLANGUAGE_GLSL)
      .set('transformCoreVS', WIND_TRANSFORM_CORE_VS);
    material.setParameter('uWindTime', 0);
    material.setParameter('uWindSpeed', speed);
    material.setParameter('uWindAmplitude', (amplitudeDegrees * Math.PI) / 180);
    material.update();
    materials.push(material);
    windMaterials.push(material);
    return material;
  };

  const tallGrassMaterial = createWindMaterial('#0a1a0a', 0.06, 1.15, 8);

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

  // Formato de instancia compartido por todas las matas: cuatro columnas de la
  // matriz de mundo (los mismos semánticos que usa PlayCanvas para instancing)
  // y un vec4 con fase y fuerza del viento.
  const foliageInstanceFormat = new pc.VertexFormat(device, [
    { semantic: pc.SEMANTIC_ATTR11, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR12, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR14, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR15, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR13, components: 4, type: pc.TYPE_FLOAT32 }
  ]);

  /**
   * Convierte las matas de una lista de regiones en lotes instanciados: un
   * draw call por región y variante de malla. La posición, el giro y la escala
   * van en la matriz de instancia; la fase y la fuerza del viento, en
   * `instance_wind`.
   */
  const buildInstancedFoliage = (options: InstancedFoliageOptions): void => {
    const {
      label,
      zones,
      meshes,
      material,
      density,
      seed,
      scaleMin,
      scaleMax,
      strengthMin,
      strengthMax,
      phaseX,
      phaseZ,
      phaseJitter
    } = options;
    const variants = meshes.length;

    zones.forEach((zone, zoneIndex) => {
      const rand = random(seed + zoneIndex * 7919);
      const count = Math.round(zoneArea(zone) * density);
      if (count <= 0) return;

      // Reparte las matas entre variantes con el mismo criterio cíclico de
      // siempre, pero reservando un único Float32Array por variante.
      const counts = new Array<number>(variants).fill(0);
      for (let i = 0; i < count; i++) counts[(i + zoneIndex) % variants]++;

      const buffers = counts.map((size) => new Float32Array(size * 20));
      const cursors = new Array<number>(variants).fill(0);

      for (let i = 0; i < count; i++) {
        const [x, z] = randomPointInZone(zone, rand, 0.3);
        const yaw = rand() * 360;
        const tuftScale = scaleMin + rand() * (scaleMax - scaleMin);
        const variant = (i + zoneIndex) % variants;
        const data = buffers[variant];
        const offset = cursors[variant]++ * 20;

        // Matriz de mundo en columnas: giro en Y, escala uniforme y traslación.
        const yawRadians = (yaw * Math.PI) / 180;
        const cos = Math.cos(yawRadians) * tuftScale;
        const sin = Math.sin(yawRadians) * tuftScale;
        data[offset] = cos;
        data[offset + 1] = 0;
        data[offset + 2] = -sin;
        data[offset + 3] = 0;
        data[offset + 4] = 0;
        data[offset + 5] = tuftScale;
        data[offset + 6] = 0;
        data[offset + 7] = 0;
        data[offset + 8] = sin;
        data[offset + 9] = 0;
        data[offset + 10] = cos;
        data[offset + 11] = 0;
        data[offset + 12] = x;
        data[offset + 13] = 0.002;
        data[offset + 14] = z;
        data[offset + 15] = 1;
        // x = fase, y = fuerza; z/w quedan libres para futuras variaciones.
        data[offset + 16] = x * phaseX + z * phaseZ + rand() * phaseJitter;
        data[offset + 17] = strengthMin + rand() * (strengthMax - strengthMin);
        data[offset + 18] = 0;
        data[offset + 19] = 0;
      }

      // Caja que envuelve la región completa: permite descartar el lote entero
      // cuando la zona queda fuera de cámara sin recorrer sus matas.
      const bounds = zoneBounds(zone);
      const aabb = new pc.BoundingBox(
        new pc.Vec3(bounds.cx, 1.25, bounds.cz),
        new pc.Vec3(bounds.width / 2 + 1, 1.5, bounds.depth / 2 + 1)
      );

      for (let variant = 0; variant < variants; variant++) {
        const data = buffers[variant];
        if (data.length === 0) continue;

        const vertexBuffer = new pc.VertexBuffer(
          device,
          foliageInstanceFormat,
          data.length / 20,
          { data, usage: pc.BUFFER_STATIC }
        );
        const instance = new pc.MeshInstance(meshes[variant], material);
        instance.castShadow = false;
        instance.receiveShadow = false;
        instance.setInstancing(vertexBuffer, true);
        instancedFoliageBuffers.push(vertexBuffer);

        const batch = new pc.Entity(`${label}-${zoneIndex}-${variant}`);
        batch.addComponent('render');
        batch.render!.castShadows = false;
        batch.render!.receiveShadows = false;
        batch.render!.meshInstances = [instance];
        // El componente aplica su propio AABB al asignar las instancias, así
        // que se fija después para conservar la caja de toda la región.
        batch.render!.customAabb = aabb;
        app.root.addChild(batch);
        created.push(batch);
      }
    });
  };

  buildInstancedFoliage({
    label: 'tall-grass',
    zones: TERRAIN_ZONES.filter((zone) => zone.terrain === 'tallGrass'),
    meshes: grassClusterMeshes,
    material: tallGrassMaterial,
    density: 3.6,
    seed: 0x9a11,
    scaleMin: 0.9,
    scaleMax: 1.45,
    strengthMin: 0.7,
    strengthMax: 1.3,
    phaseX: 0.55,
    phaseZ: 0.3,
    phaseJitter: 1.4
  });

  // --- Claro feérico: flores 3D ---------------------------------------------
  // Misma técnica que la hierba alta, pero con flores: cada mata es una malla
  // de tallos, hojas y corolas de 5-6 pétalos con el corazón amarillo. Todo va
  // por color de vértice, sin texturas ni recortes alfa, así que las flores
  // tienen volumen desde cualquier ángulo. También van instanciadas y con el
  // viento resuelto en el vertex shader.
  const flowerMaterial = createWindMaterial('#3a2a33', 0.18, 1.05, 5);

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

  const fairyZones = TERRAIN_ZONES.filter((zone) => zone.terrain === 'fairy');
  buildInstancedFoliage({
    label: 'fairy-flowers',
    zones: fairyZones,
    meshes: flowerClusterMeshes,
    material: flowerMaterial,
    density: 2.6,
    seed: 0x4f1e,
    scaleMin: 0.95,
    scaleMax: 1.5,
    strengthMin: 0.45,
    strengthMax: 0.8,
    phaseX: 0.5,
    phaseZ: 0.35,
    phaseJitter: 1.6
  });

  // Polen del claro feérico: motas doradas diminutas que flotan entre las
  // flores, derivan despacio y titilan. Aditivas y pequeñas, para que se lean
  // como polen mágico y no como chispas ni como polvo.
  fairyZones.forEach((zone, zoneIndex) => {
    const [pollenX, pollenZ] = zoneCenter(zone);
    const pollen = new pc.Entity(`fairy-pollen-${zoneIndex}`);
    pollen.setPosition(pollenX, 0.65, pollenZ);
    pollen.addComponent('particlesystem', {
      numParticles: 64,
      lifetime: 6.2,
      rate: 0.09,
      rate2: 0.15,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: zoneEmitterExtents(zone, 1.7, 1.1),
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
  // Caja unitaria para el cuerpo; la escala real va en la matriz de instancia.
  const butterflyBodyMesh = pc.Mesh.fromGeometry(device, new pc.BoxGeometry());
  const butterflyInstanceFormat = pc.VertexFormat.getDefaultInstancingFormat(device);

  /** Matriz del cuerpo: traslación + giro en Y + escala no uniforme. */
  const writeButterflyBody = (
    data: Float32Array,
    offset: number,
    butterfly: Butterfly,
    yawRadians: number
  ): void => {
    const cos = Math.cos(yawRadians);
    const sin = Math.sin(yawRadians);
    const sx = 0.05 * butterfly.scale;
    const sy = 0.05 * butterfly.scale;
    const sz = 0.16 * butterfly.scale;
    // Columnas de Ry(yaw) * diag(sx, sy, sz).
    data[offset] = cos * sx;
    data[offset + 1] = 0;
    data[offset + 2] = -sin * sx;
    data[offset + 3] = 0;
    data[offset + 4] = 0;
    data[offset + 5] = sy;
    data[offset + 6] = 0;
    data[offset + 7] = 0;
    data[offset + 8] = sin * sz;
    data[offset + 9] = 0;
    data[offset + 10] = cos * sz;
    data[offset + 11] = 0;
    data[offset + 12] = butterfly.x;
    data[offset + 13] = butterfly.y;
    data[offset + 14] = butterfly.z;
    data[offset + 15] = 1;
  };

  /** Matriz del ala: traslación + giro en Y + aleteo en Z + escala uniforme. */
  const writeButterflyWing = (
    data: Float32Array,
    offset: number,
    butterfly: Butterfly,
    yawRadians: number,
    flapRadians: number
  ): void => {
    const cy = Math.cos(yawRadians);
    const sy = Math.sin(yawRadians);
    const cf = Math.cos(flapRadians);
    const sf = Math.sin(flapRadians);
    const scale = butterfly.scale;
    // Columnas de Ry(yaw) * Rz(flap) * scale.
    data[offset] = cy * cf * scale;
    data[offset + 1] = sf * scale;
    data[offset + 2] = -sy * cf * scale;
    data[offset + 3] = 0;
    data[offset + 4] = -cy * sf * scale;
    data[offset + 5] = cf * scale;
    data[offset + 6] = sy * sf * scale;
    data[offset + 7] = 0;
    data[offset + 8] = sy * scale;
    data[offset + 9] = 0;
    data[offset + 10] = cy * scale;
    data[offset + 11] = 0;
    data[offset + 12] = butterfly.x;
    data[offset + 13] = butterfly.y;
    data[offset + 14] = butterfly.z;
    data[offset + 15] = 1;
  };

  const butterflies: Butterfly[] = [];
  const butterflyBatches: ButterflyBatch[] = [];

  fairyZones.forEach((zone, zoneIndex) => {
    const rand = random(0x7e3a + zoneIndex * 3559);
    // Antes eran 8 fijas por zona: en un claro pequeño bastaba, pero en un
    // mapa entero de claro feérico se perdían. Ahora la densidad se escala con
    // el área (con un mínimo de 8 y un tope para no disparar la CPU).
    const count = Math.max(
      8,
      Math.min(2000, Math.round(zoneArea(zone) * 0.025))
    );

    const body = new Float32Array(count * 16);
    const right = new Float32Array(count * 16);
    const left = new Float32Array(count * 16);
    const bodyBuffer = new pc.VertexBuffer(device, butterflyInstanceFormat, count, {
      data: body,
      usage: pc.BUFFER_DYNAMIC
    });
    const rightBuffer = new pc.VertexBuffer(device, butterflyInstanceFormat, count, {
      data: right,
      usage: pc.BUFFER_DYNAMIC
    });
    const leftBuffer = new pc.VertexBuffer(device, butterflyInstanceFormat, count, {
      data: left,
      usage: pc.BUFFER_DYNAMIC
    });
    const batch: ButterflyBatch = { body, right, left, bodyBuffer, rightBuffer, leftBuffer };
    butterflyBatches.push(batch);

    const entity = new pc.Entity(`fairy-butterflies-${zoneIndex}`);
    entity.addComponent('render');
    entity.render!.castShadows = false;
    entity.render!.receiveShadows = false;

    const bodyInstance = new pc.MeshInstance(butterflyBodyMesh, butterflyBodyMaterial);
    bodyInstance.castShadow = false;
    bodyInstance.receiveShadow = false;
    bodyInstance.setInstancing(bodyBuffer, true);

    const rightInstance = new pc.MeshInstance(butterflyWingRight, butterflyWingMaterial);
    rightInstance.castShadow = false;
    rightInstance.receiveShadow = false;
    rightInstance.setInstancing(rightBuffer, true);

    const leftInstance = new pc.MeshInstance(butterflyWingLeft, butterflyWingMaterial);
    leftInstance.castShadow = false;
    leftInstance.receiveShadow = false;
    leftInstance.setInstancing(leftBuffer, true);

    entity.render!.meshInstances = [bodyInstance, rightInstance, leftInstance];
    const bounds = zoneBounds(zone);
    entity.render!.customAabb = new pc.BoundingBox(
      new pc.Vec3(bounds.cx, 1.0, bounds.cz),
      new pc.Vec3(bounds.width / 2 + 1, 1.25, bounds.depth / 2 + 1)
    );
    app.root.addChild(entity);
    created.push(entity);

    for (let i = 0; i < count; i++) {
      const [x, z] = randomPointInZone(zone, rand, 0.3);
      const y = 0.5 + rand() * 1.0;
      // Pequeñas: la escala baja el cuerpo y las alas a la vez, sin tocar la
      // amplitud del aleteo ni la velocidad de vuelo.
      const butterfly: Butterfly = {
        batch,
        index: i,
        zone,
        rand: random(0x9c51 + zoneIndex * 4813 + i * 197),
        target: new pc.Vec3(x, y, z),
        x,
        y,
        z,
        scale: 0.5 + rand() * 0.2,
        speed: 0.5 + rand() * 0.5,
        flapSpeed: 9 + rand() * 5,
        phase: rand() * Math.PI * 2,
        yaw: rand() * 360
      };
      butterflies.push(butterfly);

      // Matrices iniciales para que el primer frame también sea válido.
      const yawRadians = (butterfly.yaw * Math.PI) / 180;
      const flapRadians = (Math.sin(butterfly.phase) * 30 * Math.PI) / 180;
      const offset = butterfly.index * 16;
      writeButterflyBody(body, offset, butterfly, yawRadians);
      writeButterflyWing(right, offset, butterfly, yawRadians, flapRadians);
      writeButterflyWing(left, offset, butterfly, yawRadians, -flapRadians);
    }
  });

  // --- Páramo: frailejones y hierba seca 3D --------------------------------
  // Misma idea que la hierba y las flores, pero con la silueta del frailejón
  // (tronco leñoso corto y roseta de hojas lanceoladas plateadas) y matas de
  // hierba seca entre ellos. El color va por vértice, sin texturas ni recortes,
  // así que las plantas tienen volumen desde cualquier ángulo. También van
  // instanciadas y con el viento resuelto en el vertex shader.
  const paramoPlantMaterial = createWindMaterial('#1c1408', 0.1, 0.85, 2);

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

  const paramoZones = TERRAIN_ZONES.filter((zone) => zone.terrain === 'electric');
  buildInstancedFoliage({
    label: 'paramo-frailejon',
    zones: paramoZones,
    meshes: shrubClusterMeshes,
    material: paramoPlantMaterial,
    density: 1.2,
    seed: 0xd0b5,
    scaleMin: 0.9,
    scaleMax: 1.15,
    strengthMin: 0.5,
    strengthMax: 0.9,
    phaseX: 0.42,
    phaseZ: 0.31,
    phaseJitter: 1.5
  });

  // Hierba seca del páramo: briznas cortas y pajizas que llenan los huecos
  // entre los frailejones. Reutiliza la malla de la hierba alta con otra paleta
  // y menos altura, así que tiene el mismo volumen y la misma técnica.
  const dryGrassMeshes = [0, 1, 2, 3].map((variant) =>
    buildGrassCluster(0x8c3f + variant * 2749, 14, DRY_GRASS_PALETTE, 0.55)
  );
  const dryGrassMaterial = createWindMaterial('#1c1408', 0.1, 0.95, 6);

  buildInstancedFoliage({
    label: 'paramo-dry-grass',
    zones: paramoZones,
    meshes: dryGrassMeshes,
    material: dryGrassMaterial,
    density: 2.6,
    seed: 0xb17c,
    scaleMin: 0.85,
    scaleMax: 1.3,
    strengthMin: 0.55,
    strengthMax: 1,
    phaseX: 0.55,
    phaseZ: 0.4,
    phaseJitter: 1.6
  });

  // --- Páramo: rayos y chispas ----------------------------------------------
  // El calvero eléctrico descarga rayos a intervalos irregulares. Cada descarga
  // cae sobre un punto distinto del calvero e ilumina los frailejones con una
  // luz azul durante unas décimas. El rayo es
  // malla pura con color por vértice, sin texturas, y se extiende en cintas
  // cruzadas para tener volumen desde cualquier ángulo de cámara. Entre descarga
  // y descarga, unas chispas aditivas mantienen el calvero crepitando.
  const buildLightningMesh = (seed: number): pc.Mesh => {
    const rand = random(seed);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const height = 4.2;

    const push = (
      x: number,
      y: number,
      z: number,
      color: [number, number, number]
    ) => {
      positions.push(x, y, z);
      normals.push(0, 1, 0);
      colors.push(color[0], color[1], color[2], 1);
    };

    /** Convierte una polilínea en una cinta luminosa fina, sin halo. */
    const ribbon = (path: Array<[number, number, number]>, scale: number) => {
      const layers: Array<{ width: number; color: [number, number, number] }> = [
        { width: 0.014, color: [0.9, 0.96, 1] }
      ];

      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        let dx = b[0] - a[0];
        let dy = b[1] - a[1];
        let dz = b[2] - a[2];
        const length = Math.hypot(dx, dy, dz) || 1;
        dx /= length;
        dy /= length;
        dz /= length;

        // Perpendicular horizontal y su ortogonal en el plano del tramo: las
        // dos cintas se cruzan, así que el rayo se lee desde cualquier giro de
        // cámara sin convertirse en una línea de canto.
        const plen = Math.hypot(-dz, dx) || 1;
        const px = -dz / plen;
        const pz = dx / plen;
        const qx = dy * pz;
        const qy = dz * px - dx * pz;
        const qz = -dy * px;

        for (const layer of layers) {
          const w = layer.width * scale;
          for (const [ox, oy, oz] of [
            [px, 0, pz],
            [qx, qy, qz]
          ]) {
            const start = positions.length / 3;
            push(a[0] - ox * w, a[1] - oy * w, a[2] - oz * w, layer.color);
            push(a[0] + ox * w, a[1] + oy * w, a[2] + oz * w, layer.color);
            push(b[0] + ox * w, b[1] + oy * w, b[2] + oz * w, layer.color);
            push(b[0] - ox * w, b[1] - oy * w, b[2] - oz * w, layer.color);
            indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
          }
        }
      }
    };

    // Tronco principal: cae desde 4,2 u con quiebros horizontales y termina
    // exactamente en el punto de impacto, que es donde se coloca la entidad.
    const main: Array<[number, number, number]> = [];
    const steps = 12;
    let x = 0;
    let z = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (i > 0 && i < steps) {
        x += (rand() - 0.5) * 0.55;
        z += (rand() - 0.5) * 0.55;
      }
      main.push([x, height * (1 - t), z]);
    }
    main[0] = [x * 0.5, height, z * 0.5];
    main[steps] = [0, 0, 0];
    ribbon(main, 1);

    // Rama lateral: sale de un quiebro alto y muere antes de tocar el suelo, así
    // que se lee como una bifurcación del rayo y no como un segundo impacto.
    const branchRoot = main[3 + Math.floor(rand() * 4)];
    const branch: Array<[number, number, number]> = [branchRoot];
    const branchAngle = rand() * Math.PI * 2;
    let bx = branchRoot[0];
    let bz = branchRoot[2];
    const branchSteps = 4 + Math.floor(rand() * 3);
    for (let i = 1; i <= branchSteps; i++) {
      const t = i / branchSteps;
      const spread = 0.18 + rand() * 0.22;
      bx += Math.cos(branchAngle) * spread + (rand() - 0.5) * 0.18;
      bz += Math.sin(branchAngle) * spread + (rand() - 0.5) * 0.18;
      branch.push([
        bx,
        Math.max(0.35, branchRoot[1] - t * (0.9 + rand() * 0.9)),
        bz
      ]);
    }
    ribbon(branch, 0.55);

    const mesh = new pc.Mesh(device);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setColors(colors);
    mesh.setIndices(indices);
    mesh.update();
    return mesh;
  };

  const lightningMeshes = [0, 1, 2].map((variant) =>
    buildLightningMesh(0x3f27 + variant * 7919)
  );

  const lightningZones: Array<{
    zone: TerrainZone;
    rand: () => number;
    bolt: pc.Entity;
    material: pc.StandardMaterial;
    light: pc.Entity;
    next: number;
    flash: number;
    flashDuration: number;
    seed: number;
  }> = [];

  paramoZones.forEach((zone, zoneIndex) => {
    const rand = random(0x5e91 + zoneIndex * 8353);
    const [zoneX, zoneZ] = zoneCenter(zone);

    const material = standard({
      diffuse: '#ffffff',
      specular: '#000000',
      gloss: 0,
      blend: pc.BLEND_ADDITIVE,
      depthWrite: false,
      useLighting: false,
      cull: pc.CULLFACE_NONE
    });
    material.diffuseVertexColor = true;
    material.update();
    materials.push(material);

    const bolt = new pc.Entity(`paramo-lightning-${zoneIndex}`);
    bolt.addComponent('render');
    bolt.render!.castShadows = false;
    bolt.render!.receiveShadows = false;
    bolt.render!.meshInstances = [new pc.MeshInstance(lightningMeshes[0], material)];
    bolt.enabled = false;
    app.root.addChild(bolt);
    created.push(bolt);

    const light = new pc.Entity(`paramo-lightning-light-${zoneIndex}`);
    light.addComponent('light', {
      type: 'omni',
      color: hex('#bfe4ff'),
      intensity: 0,
      range: 8.5,
      castShadows: false
    });
    light.setPosition(zoneX, 1.7, zoneZ);
    app.root.addChild(light);
    created.push(light);

    // Chispas ambientales: motas azuladas que asoman entre la hierba seca y
    // suben muy poco antes de apagarse. La densidad es baja para que no compitan
    // con los rayos ni con el polen del claro feérico.
    const sparks = new pc.Entity(`paramo-sparks-${zoneIndex}`);
    sparks.setPosition(zoneX, 0.45, zoneZ);
    sparks.addComponent('particlesystem', {
      numParticles: 34,
      lifetime: 2.4,
      rate: 0.05,
      rate2: 0.1,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: zoneEmitterExtents(zone, 1.5, 0.7),
      colorMap: sparkTexture,
      colorGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 0.78, 0.96, 1],
          [0, 0.58, 0.88, 1],
          [0, 0.44, 0.8, 1]
        ]
      },
      alphaGraph: { type: pc.CURVE_LINEAR, keys: [0, 0, 0.18, 0.9, 0.55, 0.45, 1, 0] },
      scaleGraph: {
        type: pc.CURVE_LINEAR,
        keys: [0, 0.018, 0.3, 0.045, 0.75, 0.03, 1, 0.008]
      },
      velocityGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 0.04, 1, 0.15],
          [0, 0.07, 1, 0.22],
          [0, 0.04, 1, 0.15]
        ]
      },
      blendType: pc.BLEND_ADDITIVE,
      depthWrite: false,
      useFog: true,
      lighting: false,
      intensity: 1,
      orientation: pc.PARTICLEORIENTATION_SCREEN
    });
    app.root.addChild(sparks);
    if (sparks.particlesystem) sparks.particlesystem.drawOrder = 2;
    created.push(sparks);

    lightningZones.push({
      zone,
      rand,
      bolt,
      material,
      light,
      next: 1.4 + rand() * 2.6,
      flash: 0,
      flashDuration: 0.55,
      seed: rand() * Math.PI * 2
    });
  });

  // Hierba oscura de la ciénaga: briznas casi negras que sobresalen del agua
  // turbia. Usa la misma malla que la hierba alta con una paleta apagada,
  // menos briznas y menos altura: la ciénaga debe leerse como un lodazal con
  // matas dispersas, no como un prado frondoso.
  const darkGrassMeshes = [0, 1, 2, 3].map((variant) =>
    buildGrassCluster(0x4d17 + variant * 1993, 11, DARK_GRASS_PALETTE, 0.6)
  );
  const darkGrassMaterial = createWindMaterial('#1c1408', 0.1, 0.75, 4.5);

  buildInstancedFoliage({
    label: 'swamp-grass',
    zones: swampZones,
    meshes: darkGrassMeshes,
    material: darkGrassMaterial,
    density: 1.8,
    seed: 0x7a31,
    scaleMin: 0.85,
    scaleMax: 1.25,
    strengthMin: 0.5,
    strengthMax: 0.95,
    phaseX: 0.6,
    phaseZ: 0.45,
    phaseJitter: 1.7
  });

  // Humo bajo de la ciénaga: bocanadas que nacen casi a ras del agua, suben
  // despacio y se ensanchan hasta deshacerse. El tono verdoso y la opacidad
  // baja lo separan del polvo del desierto: aquí interesa que parezca vapor
  // estancado, no una nube.
  //
  // Solo se usa en charcos pequeños. En ciénagas grandes manda la lámina
  // continua de niebla: repetir focos de partículas por todo el mapa producía
  // una nube de bocanadas sueltas que no aportaba nada sobre el manto.
  swampZones.forEach((zone, zoneIndex) => {
    const bounds = zoneBounds(zone);
    if (bounds.width > SWAMP_MIST_TILE || bounds.depth > SWAMP_MIST_TILE) return;

    const [smokeX, smokeZ] = zoneCenter(zone);
    const smoke = new pc.Entity(`swamp-smoke-${zoneIndex}`);
    smoke.setPosition(smokeX, 0.3, smokeZ);
    smoke.addComponent('particlesystem', {
      numParticles: 65,
      lifetime: 7,
      rate: 0.09,
      rate2: 0.14,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: zoneEmitterExtents(zone, 1.75, 0.5),
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
    if (!SPAWN_TREES) return;
    const rand = random(0x3a47 + zoneIndex * 5309);
    const count = 5;
    const spots: Array<[number, number]> = [];
    for (let i = 0; i < count; i++) {
      let [x, z] = randomPointInZone(zone, rand, 0.8, 0.6);
      for (let attempt = 0; attempt < 20; attempt++) {
        const [nx, nz] = randomPointInZone(zone, rand, 0.8, 0.6);
        if (spots.every(([sx, sz]) => Math.hypot(nx - sx, nz - sz) > 0.95)) {
          x = nx;
          z = nz;
          break;
        }
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

      colliders.push({ type: 'circle', x, z, radius: 0.22 * scale, sightRadius: 0.7 * scale });
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
    const [ghostX, ghostZ] = zoneCenter(zone);
    // Fuegos fatuos: orbes aditivos que flotan entre 0,4 y 1,3 m, derivan muy
    // despacio y parpadean. El violeta lo pone el colorGraph sobre una textura
    // neutra, así que no arrastran el naranja de las brasas.
    const wisps = new pc.Entity(`ghost-wisps-${zoneIndex}`);
    wisps.setPosition(ghostX, 0.85, ghostZ);
    wisps.addComponent('particlesystem', {
      numParticles: 18,
      lifetime: 6.4,
      rate: 0.26,
      rate2: 0.4,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: zoneEmitterExtents(zone, 1.5, 0.9),
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
    mist.setPosition(ghostX, 0.45, ghostZ);
    mist.addComponent('particlesystem', {
      numParticles: 130,
      lifetime: 10.5,
      rate: 0.05,
      rate2: 0.08,
      loop: true,
      preWarm: true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: zoneEmitterExtents(zone, 1.9, 0.6),
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
    glow.setPosition(ghostX, 1.15, ghostZ);
    app.root.addChild(glow);
    created.push(glow);
    ghostLights.push({ entity: glow, phase: zoneIndex * 1.9 + ghostZ * 0.27 });
  });

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

  // Máscara de esténcil del decal de sombra: el terreno, las decoraciones y
  // los props escriben 1; los separadores escriben 0. El decal se dibuja sin
  // depth test (para teñir la vegetación) pero solo donde el esténcil vale 1,
  // así que su cara visible nunca queda sombreada. Si el dispositivo no tiene
  // esténcil, el decal simplemente se dibuja como antes.
  if (device.supportsStencil) {
    const receiverStencil = new pc.StencilParameters({
      func: pc.FUNC_ALWAYS,
      ref: 1,
      readMask: 0xff,
      writeMask: 0xff,
      fail: pc.STENCILOP_KEEP,
      zfail: pc.STENCILOP_KEEP,
      zpass: pc.STENCILOP_REPLACE
    });
    const barrierStencil = new pc.StencilParameters({
      func: pc.FUNC_ALWAYS,
      ref: 0,
      readMask: 0xff,
      writeMask: 0xff,
      fail: pc.STENCILOP_KEEP,
      zfail: pc.STENCILOP_KEEP,
      zpass: pc.STENCILOP_REPLACE
    });
    const barrierSet = new Set(barrierMeshInstances);
    for (const render of app.root.findComponents('render')) {
      for (const instance of render.meshInstances) {
        // Solo opacos: el agua, las partículas y las sombras de contacto no
        // deben tocar la máscara.
        if (instance.material?.blendType !== pc.BLEND_NONE) continue;
        const stencil = barrierSet.has(instance) ? barrierStencil : receiverStencil;
        instance.stencilFront = stencil;
        instance.stencilBack = stencil;
      }
    }
  }

  let time = 0;

  return {
    colliders,
    bounds: { x: HALF_X, z: HALF_Z },
    waterHeight,
    shadowMaterial,
    barrierMeshInstances,
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
      // Las velocidades están en unidades de UV y las UVs de cada cuerpo de
      // agua se escalan por su tamaño en el mundo, así que la corriente se lee
      // igual en lagos grandes y pequeños.
      waterSurfaceMaterial.diffuseMapOffset = new pc.Vec2(time * 0.15, time * 0.22);
      waterSurfaceMaterial.update();

      waterGlintMaterial.diffuseMapOffset = new pc.Vec2(
        -time * 0.26 + Math.sin(time * 0.6) * 0.05,
        time * 0.11 + Math.cos(time * 0.45) * 0.03
      );
      // Los destellos laten un poco de opacidad: una pista de movimiento más,
      // legible incluso de reojo.
      waterGlintMaterial.opacity = 0.3 + Math.sin(time * 1.15) * 0.05;
      waterGlintMaterial.update();

      // La ciénaga se mueve aún más despacio: el agua estancada no corre y su
      // superficie es mate, así que solo cambia el dibujo de las ondas.
      swampSurfaceMaterial.diffuseMapOffset = new pc.Vec2(-time * 0.07, time * 0.11);
      swampSurfaceMaterial.update();

      // Las láminas de niebla/polvo de regiones grandes están desactivadas
      // por ahora; si se reactivan, solo hay que avanzar sus UVs.
      if (swampMistMaterial) {
        swampMistMaterial.diffuseMapOffset = new pc.Vec2(time * 0.008, time * 0.005);
        swampMistMaterial.update();
      }
      if (desertHazeMaterial) {
        desertHazeMaterial.diffuseMapOffset = new pc.Vec2(time * 0.014, time * 0.006);
        desertHazeMaterial.update();
      }

      // Viento sobre la hierba instanciada: la inclinación se calcula en el
      // vertex shader con la fase de cada mata, así que solo hay que avanzar
      // el reloj de los materiales. No se recorre ninguna mata en CPU.
      for (const material of windMaterials) {
        material.setParameter('uWindTime', time);
      }

      // Rayos del páramo: cuenta atrás hasta la descarga y, mientras dura,
      // parpadeo rápido del rayo y pulso de la luz azul. Todo se apaga al
      // terminar el destello.
      for (const strike of lightningZones) {
        if (strike.flash > 0) {
          strike.flash = Math.max(0, strike.flash - dt);
          const progress = 1 - strike.flash / strike.flashDuration;
          const flicker = Math.sin(progress * 62 + strike.seed) > -0.25 ? 0.9 : 0.18;
          const strobe = progress < 0.12 ? 1 : flicker;
          const fade = (1 - progress) * (1 - progress);
          const power = fade * strobe;

          strike.material.opacity = power;
          strike.material.update();

          const light = strike.light.light;
          if (light) light.intensity = 2.6 * power;

          if (strike.flash === 0) {
            strike.bolt.enabled = false;
            if (light) light.intensity = 0;
          }
        } else {
          strike.next -= dt;
          if (strike.next > 0) continue;

          const [x, z] = randomPointInZone(strike.zone, strike.rand, 0.32);
          strike.bolt.setLocalPosition(x, 0, z);
          strike.bolt.setLocalEulerAngles(0, strike.rand() * 360, 0);
          const instance = strike.bolt.render!.meshInstances[0];
          if (instance) {
            instance.mesh =
              lightningMeshes[Math.floor(strike.rand() * lightningMeshes.length)];
          }
          strike.bolt.enabled = true;

          strike.flashDuration = 0.5 + strike.rand() * 0.18;
          strike.flash = strike.flashDuration;
          strike.seed = strike.rand() * Math.PI * 2;
          strike.material.opacity = 1;
          strike.material.update();

          strike.light.setPosition(x, 1.6, z);
          strike.next = 3.2 + strike.rand() * 5.5;
        }
      }

      // Los árboles muertos se balancean muy poco y muy despacio: son troncos
      // secos, no copas frondosas, pero el movimiento los separa del decorado.
      for (const tree of ghostTrees) {
        const sway = Math.sin(time * 0.6 + tree.phase) * 1.6 * tree.strength;
        tree.entity.setLocalEulerAngles(0, tree.yaw, sway);
      }

      // Mariposas: vuelan hacia su objetivo y aletean rápido. Cuando llegan,
      // eligen otra mota del calvero, de modo que revolotean sin patrón fijo.
      // El movimiento sigue en CPU, pero las tres mallas de todas las
      // mariposas se dibujan con instancing: solo se suben sus matrices.
      for (const butterfly of butterflies) {
        let dx = butterfly.target.x - butterfly.x;
        let dy = butterfly.target.y - butterfly.y;
        let dz = butterfly.target.z - butterfly.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance < 0.25) {
          const [tx, tz] = randomPointInZone(butterfly.zone, butterfly.rand, 0.4);
          butterfly.target.set(tx, 0.5 + butterfly.rand() * 1.0, tz);
        } else if (distance > 0.0001) {
          const step = butterfly.speed * dt;
          butterfly.x += (dx / distance) * step;
          butterfly.y += (dy / distance) * step;
          butterfly.z += (dz / distance) * step;

          const targetYaw = Math.atan2(dx, dz) * (180 / Math.PI);
          let delta = targetYaw - butterfly.yaw;
          while (delta > 180) delta -= 360;
          while (delta < -180) delta += 360;
          butterfly.yaw += delta * Math.min(1, dt * 6);
        }
        butterfly.phase += dt * butterfly.flapSpeed;
        const flap = Math.sin(butterfly.phase) * 30;
        const yawRadians = (butterfly.yaw * Math.PI) / 180;
        const flapRadians = (flap * Math.PI) / 180;
        const offset = butterfly.index * 16;
        writeButterflyBody(butterfly.batch.body, offset, butterfly, yawRadians);
        writeButterflyWing(butterfly.batch.right, offset, butterfly, yawRadians, flapRadians);
        writeButterflyWing(butterfly.batch.left, offset, butterfly, yawRadians, -flapRadians);
      }
      for (const batch of butterflyBatches) {
        batch.bodyBuffer.setData(batch.body);
        batch.rightBuffer.setData(batch.right);
        batch.leftBuffer.setData(batch.left);
      }

    },
    dispose() {
      for (const entity of created) entity.destroy();
      for (const buffer of instancedFoliageBuffers) buffer.destroy();
      for (const batch of butterflyBatches) {
        batch.bodyBuffer.destroy();
        batch.rightBuffer.destroy();
        batch.leftBuffer.destroy();
      }
      for (const material of materials) material.destroy();
      groundTexture.destroy();
      soilTexture.destroy();
      shadowTexture.destroy();
      waterTexture.destroy();
      waterGlintTexture.destroy();
      for (const mesh of surfaceMeshes) mesh.destroy();
      dustTexture.destroy();
      frostTexture.destroy();
      smokeTexture.destroy();
      mistTexture.destroy();
      emberTexture.destroy();
      wispTexture.destroy();
      pollenTexture.destroy();
      sparkTexture.destroy();
      skyTexture.destroy();
      barkTexture.destroy();
      mountainRockTexture.destroy();
      wallStoneTexture.destroy();
      for (const texture of leafTextures) texture.destroy();
      cactusMesh.destroy();
      for (const mesh of grassClusterMeshes) mesh.destroy();
      for (const mesh of flowerClusterMeshes) mesh.destroy();
      for (const mesh of shrubClusterMeshes) mesh.destroy();
      for (const mesh of dryGrassMeshes) mesh.destroy();
      for (const mesh of darkGrassMeshes) mesh.destroy();
      for (const mesh of iceClusterMeshes) mesh.destroy();
      for (const mesh of basaltMeshes) mesh.destroy();
      for (const mesh of ghostTreeMeshes) mesh.destroy();
      for (const mesh of mountainPeakMeshes) mesh.destroy();
      for (const mesh of wallSegmentMeshes) mesh.destroy();
      butterflyBodyMesh.destroy();
      butterflyWingRight.destroy();
      butterflyWingLeft.destroy();
      for (const mesh of lightningMeshes) mesh.destroy();
    }
  };
}
