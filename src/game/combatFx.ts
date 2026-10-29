/**
 * Efectos visuales procedurales del combate.
 *
 * No usan hojas de ataque externas: son mallas simples de PlayCanvas con
 * materiales aditivos. Cada habilidad nueva puede elegir su color y su forma,
 * y el motor reutiliza estas primitivas (proyectil, arco, haz, área, dash y
 * aura). Todos los efectos se dibujan en la capa `World`, así que se ven en
 * todos los viewports del splitscreen.
 */

import * as pc from 'playcanvas';
import type { AoeStyle, BeamStyle, ImpactStyle, ProjectileStyle } from './abilities';
import { DEG } from './config';
import { createFlameCanvas, createLeafParticleCanvas, createPollenCanvas, textureFromCanvas } from './textures';

export interface EffectHandle {
  setPosition(x: number, z: number): void;
  update(dt: number): void;
  destroy(): void;
}

interface ActiveEffect {
  entity: pc.Entity;
  materials: pc.StandardMaterial[];
  duration: number;
  elapsed: number;
  update: (t: number, dt: number) => void;
}

interface ProjectileVisual {
  entity: pc.Entity;
  materials: pc.StandardMaterial[];
  update: (dt: number) => void;
}

/** Marca de área activa; se puede cancelar antes de que termine el retardo. */
export interface TelegraphHandle {
  destroy(): void;
}

interface AoeTelegraph {
  entity: pc.Entity;
  materials: pc.StandardMaterial[];
  elapsed: number;
  duration: number;
  active: boolean;
  update: (progress: number, elapsed: number) => void;
}

/** Configuración de un emisor de partículas de fuego. */
interface FlameParticleOptions {
  x?: number;
  y?: number;
  z?: number;
  yaw?: number;
  extents: [number, number, number];
  velocity: [number, number, number];
  velocityEnd: [number, number, number];
  radialSpeed?: number;
  radialSpeedEnd?: number;
  sizeStart: number;
  sizeMid: number;
  sizeEnd: number;
  lifetime: number;
  /** Intervalo mínimo entre partículas, en segundos (menor = más denso). */
  rate: number;
  numParticles: number;
  stretch?: number;
  alignToMotion?: boolean;
  localSpace?: boolean;
  /** Si es `false`, el emisor empieza vacío y se llena durante el efecto. */
  preWarm?: boolean;
  /** Mezcla de partículas; por defecto, aditiva. */
  blendType?: number;
}

function createArcMesh(
  device: pc.GraphicsDevice,
  radius: number,
  halfAngle: number,
  segments: number
): pc.Mesh {
  const positions: number[] = [0, 0, 0];
  const normals: number[] = [0, 1, 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const angle = -halfAngle + (2 * halfAngle * i) / segments;
    positions.push(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    normals.push(0, 1, 0);
    uvs.push(i / segments, 1);
  }
  for (let i = 1; i <= segments; i++) {
    indices.push(0, i, i + 1);
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/**
 * Cinta zigzagueante en forma de cruz, para que el rayo se vea desde
 * cualquier ángulo de cámara. Se construye a lo largo de Z y se centra en 0.
 */
function createLightningMesh(
  device: pc.GraphicsDevice,
  length: number,
  width: number,
  segments: number,
  seed: number
): pc.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const taper = Math.sin(Math.PI * t);
    const z = (t - 0.5) * length;
    const x =
      i === 0 || i === segments
        ? 0
        : (random() - 0.5) * width * 5 * taper;
    const y =
      i === 0 || i === segments
        ? 0
        : (random() - 0.5) * width * 5 * taper;

    positions.push(x - width, y, z, x + width, y, z, x, y - width, z, x, y + width, z);
    normals.push(0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0);
    uvs.push(0, t, 1, t, 0, t, 1, t);

    if (i > 0) {
      const a = (i - 1) * 4;
      const b = i * 4;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
      indices.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
    }
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/**
 * Tres quads verticales cruzados a 60°, con la base en el origen y la punta en
 * +Y. Al no ser un billboard, la llama tiene volumen desde cualquier cámara del
 * splitscreen; con blending aditivo las intersecciones no se notan.
 */
function createFlameCrossMesh(device: pc.GraphicsDevice): pc.Mesh {
  const planes = 3;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let plane = 0; plane < planes; plane++) {
    const angle = (plane / planes) * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const base = plane * 4;
    // Base izquierda, base derecha, punta derecha, punta izquierda.
    positions.push(
      -0.5 * cos, 0, -0.5 * sin,
      0.5 * cos, 0, 0.5 * sin,
      0.5 * cos, 1, 0.5 * sin,
      -0.5 * cos, 1, -0.5 * sin
    );
    normals.push(sin, 0, cos, sin, 0, cos, sin, 0, cos, sin, 0, cos);
    // v = 0 arriba (punta) y v = 1 abajo (base), como la textura.
    uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/** Disco horizontal unitario (radio 0,5) en el plano XZ. */
function createDiscMesh(device: pc.GraphicsDevice, segments = 48): pc.Mesh {
  const positions: number[] = [0, 0, 0];
  const normals: number[] = [0, 1, 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];

  for (let index = 0; index <= segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    const x = Math.sin(angle) * 0.5;
    const z = Math.cos(angle) * 0.5;
    positions.push(x, 0, z);
    normals.push(0, 1, 0);
    uvs.push(0.5 + x, 0.5 + z);
  }
  for (let index = 1; index <= segments; index++) {
    indices.push(0, index, index + 1);
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/**
 * Anillo discontinuo unitario (radio exterior 0,5) para la marca de área.
 * Los huecos entre segmentos lo distinguen de un simple círculo de efecto.
 */
function createDashRingMesh(
  device: pc.GraphicsDevice,
  dashes = 20,
  inner = 0.43,
  outer = 0.5,
  fill = 0.72
): pc.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const slot = (Math.PI * 2) / dashes;
  const span = slot * fill;

  for (let dash = 0; dash < dashes; dash++) {
    const start = dash * slot;
    const end = start + span;
    const base = dash * 4;
    const points: Array<[number, number, number, number]> = [
      [Math.sin(start) * inner, 0, Math.cos(start) * inner, 0],
      [Math.sin(start) * outer, 0, Math.cos(start) * outer, 0],
      [Math.sin(end) * outer, 0, Math.cos(end) * outer, 1],
      [Math.sin(end) * inner, 0, Math.cos(end) * inner, 1]
    ];
    for (const [x, y, z, u] of points) {
      positions.push(x, y, z);
      normals.push(0, 1, 0);
      uvs.push(u, 0);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

export class CombatFx {
  private readonly app: pc.Application;
  private readonly layerId: number;
  private readonly device: pc.GraphicsDevice;
  private readonly effects: ActiveEffect[] = [];
  private readonly projectiles = new Set<ProjectileVisual>();
  private readonly sphereMesh: pc.Mesh;
  private readonly boxMesh: pc.Mesh;
  private readonly torusMesh: pc.Mesh;
  /** Textura de lengua de fuego y malla de tres quads cruzados. */
  private readonly flameTexture: pc.Texture;
  private readonly flameMesh: pc.Mesh;
  /** Textura de hoja y de espora para los efectos de Planta/Veneno. */
  private readonly leafTexture: pc.Texture;
  private readonly sporeTexture: pc.Texture;
  private readonly leafMesh: pc.Mesh;
  /** Mallas de la marca de área y marcas activas. */
  private readonly discMesh: pc.Mesh;
  private readonly dashRingMesh: pc.Mesh;
  private readonly telegraphs = new Set<AoeTelegraph>();

  constructor(app: pc.Application, layerId: number) {
    this.app = app;
    this.layerId = layerId;
    this.device = app.graphicsDevice;
    this.sphereMesh = pc.createSphere(this.device, { radius: 0.5 });
    this.boxMesh = pc.createBox(this.device, {
      halfExtents: new pc.Vec3(0.5, 0.5, 0.5)
    });
    this.torusMesh = pc.createTorus(this.device, {
      ringRadius: 0.5,
      tubeRadius: 0.05
    });
    this.flameTexture = textureFromCanvas(
      this.device,
      createFlameCanvas(),
      {
        name: 'combat-flame',
        mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
        magFilter: pc.FILTER_LINEAR
      }
    );
    this.flameMesh = createFlameCrossMesh(this.device);
    this.leafTexture = textureFromCanvas(
      this.device,
      createLeafParticleCanvas(),
      {
        name: 'combat-leaf',
        mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
        magFilter: pc.FILTER_LINEAR
      }
    );
    this.sporeTexture = textureFromCanvas(this.device, createPollenCanvas(48), {
      name: 'combat-spore',
      mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
      magFilter: pc.FILTER_LINEAR
    });
    this.leafMesh = createFlameCrossMesh(this.device);

    // PlayCanvas destruye una malla cuando su último MeshInstance desaparece.
    // Estas mallas son compartidas por muchos efectos, así que reservamos una
    // referencia propia para que sigan vivas entre proyectiles y golpes.
    this.sphereMesh.incRefCount();
    this.boxMesh.incRefCount();
    this.torusMesh.incRefCount();
    this.flameMesh.incRefCount();
    this.leafMesh.incRefCount();
    this.discMesh = createDiscMesh(this.device);
    this.dashRingMesh = createDashRingMesh(this.device);
    this.discMesh.incRefCount();
    this.dashRingMesh.incRefCount();
  }

  private createMaterial(
    color: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = new pc.StandardMaterial();
    material.useLighting = false;
    material.useSkybox = false;
    material.useFog = true;
    material.diffuse = new pc.Color(0, 0, 0);
    material.emissive = new pc.Color(color[0] / 255, color[1] / 255, color[2] / 255);
    material.emissiveIntensity = 1;
    material.opacity = opacity;
    material.blendType = pc.BLEND_ADDITIVEALPHA;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = pc.CULLFACE_NONE;
    material.update();
    return material;
  }

  /**
   * Material de llama: la textura procedural ya trae el degradado de color y la
   * silueta; el tinte solo sirve para dar variantes más cálidas o más rojas.
   */
  private createFlameMaterial(
    tint: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = new pc.StandardMaterial();
    material.useLighting = false;
    material.useSkybox = false;
    material.useFog = true;
    material.diffuse = new pc.Color(0, 0, 0);
    material.emissive = new pc.Color(
      tint[0] / 255,
      tint[1] / 255,
      tint[2] / 255
    );
    material.emissiveMap = this.flameTexture;
    material.emissiveIntensity = 1.12;
    material.opacityMap = this.flameTexture;
    material.opacityMapChannel = 'a';
    material.opacity = opacity;
    material.blendType = pc.BLEND_ADDITIVEALPHA;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = pc.CULLFACE_NONE;
    material.update();
    return material;
  }

  /** Material de hoja: silueta recortada por alfa, con tinte verde. */
  private createLeafMaterial(
    tint: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = new pc.StandardMaterial();
    material.useLighting = false;
    material.useSkybox = false;
    material.useFog = true;
    material.diffuse = new pc.Color(0, 0, 0);
    material.emissive = new pc.Color(
      tint[0] / 255,
      tint[1] / 255,
      tint[2] / 255
    );
    material.emissiveMap = this.leafTexture;
    material.emissiveIntensity = 1;
    material.opacityMap = this.leafTexture;
    material.opacityMapChannel = 'a';
    material.opacity = opacity;
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = pc.CULLFACE_NONE;
    material.update();
    return material;
  }

  /** Crea una hoja cruzada con la base en `position`. */
  private createLeaf(
    parent: pc.Entity,
    material: pc.StandardMaterial,
    options: {
      x: number;
      y: number;
      z: number;
      width: number;
      height: number;
      yaw?: number;
      pitch?: number;
      roll?: number;
    }
  ): pc.Entity {
    const entity = this.createEntity(this.leafMesh, [material], parent);
    entity.setLocalPosition(options.x, options.y, options.z);
    entity.setLocalEulerAngles(
      options.pitch ?? 0,
      options.yaw ?? 0,
      options.roll ?? 0
    );
    entity.setLocalScale(options.width, options.height, options.width);
    return entity;
  }

  /** Material de espora: mota redonda con blending aditivo y tinte verde. */
  private createSporeMaterial(
    tint: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = new pc.StandardMaterial();
    material.useLighting = false;
    material.useSkybox = false;
    material.useFog = true;
    material.diffuse = new pc.Color(0, 0, 0);
    material.emissive = new pc.Color(
      tint[0] / 255,
      tint[1] / 255,
      tint[2] / 255
    );
    material.emissiveMap = this.sporeTexture;
    material.emissiveIntensity = 1.1;
    material.opacityMap = this.sporeTexture;
    material.opacityMapChannel = 'a';
    material.opacity = opacity;
    material.blendType = pc.BLEND_ADDITIVEALPHA;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = pc.CULLFACE_NONE;
    material.update();
    return material;
  }

  /** Crea una llama cruzada con la base en `position` (la punta crece en +Y). */
  private createFlame(
    parent: pc.Entity,
    material: pc.StandardMaterial,
    options: {
      x: number;
      y: number;
      z: number;
      width: number;
      height: number;
      yaw?: number;
      pitch?: number;
      roll?: number;
    }
  ): pc.Entity {
    const entity = this.createEntity(this.flameMesh, [material], parent);
    entity.setLocalPosition(options.x, options.y, options.z);
    entity.setLocalEulerAngles(
      options.pitch ?? 0,
      options.yaw ?? 0,
      options.roll ?? 0
    );
    entity.setLocalScale(options.width, options.height, options.width);
    return entity;
  }

  /**
   * Emisor de partículas con la textura de llama. PlayCanvas orienta cada
   * partícula hacia la cámara, así que en el splitscreen se ven de frente en
   * todas las vistas y el conjunto se lee como fuego en movimiento.
   */
  private spawnFlameParticles(
    parent: pc.Entity,
    options: FlameParticleOptions
  ): void {
    const entity = new pc.Entity('flame-particles');
    entity.setLocalPosition(options.x ?? 0, options.y ?? 0, options.z ?? 0);
    if (options.yaw) entity.setLocalEulerAngles(0, options.yaw, 0);
    parent.addChild(entity);

    const data: Record<string, unknown> = {
      numParticles: options.numParticles,
      lifetime: options.lifetime,
      rate: options.rate,
      rate2: options.rate,
      loop: true,
      preWarm: options.preWarm ?? true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: new pc.Vec3(...options.extents),
      colorMap: this.flameTexture,
      colorGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 1, 0.5, 1, 1, 1],
          [0, 0.92, 0.5, 0.6, 1, 0.3],
          [0, 0.55, 0.5, 0.24, 1, 0.07]
        ]
      },
      alphaGraph: {
        type: pc.CURVE_LINEAR,
        keys: [0, 0, 0.1, 0.9, 0.55, 0.7, 1, 0]
      },
      scaleGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          0,
          options.sizeStart,
          0.28,
          options.sizeMid,
          0.7,
          options.sizeMid,
          1,
          options.sizeEnd
        ]
      },
      velocityGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, options.velocity[0], 1, options.velocityEnd[0]],
          [0, options.velocity[1], 1, options.velocityEnd[1]],
          [0, options.velocity[2], 1, options.velocityEnd[2]]
        ]
      },
      blendType: pc.BLEND_ADDITIVE,
      depthWrite: false,
      useFog: true,
      lighting: false,
      orientation: pc.PARTICLEORIENTATION_SCREEN,
      localSpace: options.localSpace ?? false,
      layers: [this.layerId],
      stretch: options.stretch ?? 0,
      alignToMotion: options.alignToMotion ?? false
    };
    if (
      options.radialSpeed !== undefined &&
      options.radialSpeedEnd !== undefined
    ) {
      data.radialSpeedGraph = {
        type: pc.CURVE_LINEAR,
        keys: [0, options.radialSpeed, 1, options.radialSpeedEnd]
      };
    }
    entity.addComponent('particlesystem', data);
  }

  /**
   * Partículas de hojas: misma emisión que las llamas, pero con la silueta de
   * hoja y un tinte vegetal que se oscurece al final de la vida.
   */
  private spawnLeafParticles(
    parent: pc.Entity,
    options: FlameParticleOptions,
    tint: readonly [number, number, number]
  ): void {
    const entity = new pc.Entity('leaf-particles');
    entity.setLocalPosition(options.x ?? 0, options.y ?? 0, options.z ?? 0);
    parent.addChild(entity);

    const r = tint[0] / 255;
    const g = tint[1] / 255;
    const b = tint[2] / 255;
    const data: Record<string, unknown> = {
      numParticles: options.numParticles,
      lifetime: options.lifetime,
      rate: options.rate,
      rate2: options.rate,
      loop: true,
      preWarm: options.preWarm ?? true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: new pc.Vec3(...options.extents),
      colorMap: this.leafTexture,
      colorGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 1, 0.4, r, 1, r * 0.55],
          [0, 1, 0.4, g, 1, g * 0.5],
          [0, 1, 0.4, b, 1, b * 0.35]
        ]
      },
      alphaGraph: {
        type: pc.CURVE_LINEAR,
        keys: [0, 0, 0.12, 1, 0.7, 0.9, 1, 0]
      },
      scaleGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          0,
          options.sizeStart,
          0.3,
          options.sizeMid,
          0.7,
          options.sizeMid,
          1,
          options.sizeEnd
        ]
      },
      velocityGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, options.velocity[0], 1, options.velocityEnd[0]],
          [0, options.velocity[1], 1, options.velocityEnd[1]],
          [0, options.velocity[2], 1, options.velocityEnd[2]]
        ]
      },
      blendType: pc.BLEND_NORMAL,
      depthWrite: false,
      useFog: true,
      lighting: false,
      orientation: pc.PARTICLEORIENTATION_SCREEN,
      localSpace: options.localSpace ?? false,
      layers: [this.layerId],
      stretch: options.stretch ?? 0,
      alignToMotion: options.alignToMotion ?? false
    };
    if (
      options.radialSpeed !== undefined &&
      options.radialSpeedEnd !== undefined
    ) {
      data.radialSpeedGraph = {
        type: pc.CURVE_LINEAR,
        keys: [0, options.radialSpeed, 1, options.radialSpeedEnd]
      };
    }
    entity.addComponent('particlesystem', data);
  }

  /** Motas de espora: aditivas, pequeñas y con tinte del tipo de la habilidad. */
  private spawnSporeParticles(
    parent: pc.Entity,
    options: FlameParticleOptions,
    tint: readonly [number, number, number]
  ): void {
    const entity = new pc.Entity('spore-particles');
    entity.setLocalPosition(options.x ?? 0, options.y ?? 0, options.z ?? 0);
    parent.addChild(entity);

    const r = tint[0] / 255;
    const g = tint[1] / 255;
    const b = tint[2] / 255;
    const data: Record<string, unknown> = {
      numParticles: options.numParticles,
      lifetime: options.lifetime,
      rate: options.rate,
      rate2: options.rate,
      loop: true,
      preWarm: options.preWarm ?? true,
      autoPlay: true,
      emitterShape: pc.EMITTERSHAPE_BOX,
      emitterExtents: new pc.Vec3(...options.extents),
      colorMap: this.sporeTexture,
      colorGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, 1, 0.5, r, 1, r * 0.5],
          [0, 1, 0.5, g, 1, g * 0.45],
          [0, 1, 0.5, b, 1, b * 0.3]
        ]
      },
      alphaGraph: {
        type: pc.CURVE_LINEAR,
        keys: [0, 0, 0.15, 0.9, 0.65, 0.6, 1, 0]
      },
      scaleGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          0,
          options.sizeStart,
          0.3,
          options.sizeMid,
          0.7,
          options.sizeMid,
          1,
          options.sizeEnd
        ]
      },
      velocityGraph: {
        type: pc.CURVE_LINEAR,
        keys: [
          [0, options.velocity[0], 1, options.velocityEnd[0]],
          [0, options.velocity[1], 1, options.velocityEnd[1]],
          [0, options.velocity[2], 1, options.velocityEnd[2]]
        ]
      },
      blendType: options.blendType ?? pc.BLEND_ADDITIVE,
      depthWrite: false,
      useFog: true,
      lighting: false,
      orientation: pc.PARTICLEORIENTATION_SCREEN,
      localSpace: options.localSpace ?? false,
      layers: [this.layerId]
    };
    if (
      options.radialSpeed !== undefined &&
      options.radialSpeedEnd !== undefined
    ) {
      data.radialSpeedGraph = {
        type: pc.CURVE_LINEAR,
        keys: [0, options.radialSpeed, 1, options.radialSpeedEnd]
      };
    }
    entity.addComponent('particlesystem', data);
  }

  /** Luz omni corta y cálida: tiñe el suelo y los sprites alrededor del fuego. */
  private createFireLight(
    parent: pc.Entity,
    x: number,
    y: number,
    z: number,
    intensity: number,
    range: number
  ): pc.Entity {
    const entity = new pc.Entity('fire-light');
    entity.addComponent('light', {
      type: 'omni',
      color: new pc.Color(1, 0.45, 0.12),
      intensity,
      range,
      castShadows: false
    });
    entity.setLocalPosition(x, y, z);
    parent.addChild(entity);
    return entity;
  }

  private createEntity(
    mesh: pc.Mesh,
    materials: pc.StandardMaterial[],
    parent: pc.Entity = this.app.root
  ): pc.Entity {
    const entity = new pc.Entity('combat-fx');
    entity.addComponent('render');
    const render = entity.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    render.layers = [this.layerId];
    render.meshInstances = materials.map(
      (material) => new pc.MeshInstance(mesh, material)
    );
    parent.addChild(entity);
    return entity;
  }

  private addEffect(
    entity: pc.Entity,
    materials: pc.StandardMaterial[],
    duration: number,
    update: (t: number, dt: number) => void
  ): void {
    this.effects.push({
      entity,
      materials,
      duration,
      elapsed: 0,
      update
    });
  }

  /** Bola luminosa que avanza con un proyectil. */
  spawnProjectile(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    style: ProjectileStyle,
    dirX: number,
    dirZ: number
  ): EffectHandle {
    if (style === 'electric') {
      return this.spawnElectricProjectile(x, z, radius, dirX, dirZ);
    }
    if (style === 'fire') {
      return this.spawnFireProjectile(x, z, radius, dirX, dirZ);
    }
    if (style === 'grass') {
      return this.spawnGrassProjectile(x, z, radius, dirX, dirZ, color);
    }
    if (style === 'poison') {
      return this.spawnPoisonProjectile(x, z, radius, dirX, dirZ, color);
    }

    const material = this.createMaterial(color, 0.95);
    const entity = this.createEntity(this.sphereMesh, [material]);
    entity.setPosition(x, 0.7, z);
    const scale = Math.max(0.12, radius * 2);
    entity.setLocalScale(scale, scale, scale);
    const visual: ProjectileVisual = {
      entity,
      materials: [material],
      update: () => {}
    };
    this.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => entity.setPosition(nextX, 0.7, nextZ),
      update: () => {},
      destroy: () => {
        if (!this.projectiles.delete(visual)) return;
        entity.destroy();
        material.destroy();
      }
    };
  }

  /**
   * Proyectil eléctrico: núcleo, halo, tres arcos zigzagueantes y una estela
   * orientada hacia la dirección de vuelo. Los arcos giran y parpadean.
   */
  private spawnElectricProjectile(
    x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number
  ): EffectHandle {
    const root = new pc.Entity('electric-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([255, 255, 220], 0.95);
    const glowMaterial = this.createMaterial([255, 230, 90], 0.35);
    const arcMaterial = this.createMaterial([255, 245, 170], 0.9);
    const tailMaterial = this.createMaterial([255, 220, 80], 0.45);
    const materials = [coreMaterial, glowMaterial, arcMaterial, tailMaterial];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.9, radius * 1.9, radius * 1.9);

    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 4.2, radius * 4.2, radius * 4.2);

    const tail = this.createEntity(this.boxMesh, [tailMaterial], root);
    tail.setLocalPosition(0, 0, -radius * 2.8);
    tail.setLocalScale(radius * 1.1, radius * 1.1, radius * 5.5);

    const arcs: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const mesh = createLightningMesh(
        this.device,
        radius * 5,
        Math.max(0.012, radius * 0.13),
        5,
        1000 + index * 7919
      );
      const arc = this.createEntity(mesh, [arcMaterial], root);
      arc.setLocalEulerAngles(index * 60, index * 120, index * 45);
      arcs.push(arc);
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        coreMaterial.opacity = 0.85 + Math.random() * 0.15;
        glowMaterial.opacity = 0.16 + Math.random() * 0.14;
        arcMaterial.opacity = 0.45 + Math.random() * 0.3;
        tailMaterial.opacity = 0.18 + Math.random() * 0.14;

        const pulse = 1 + Math.sin(time * 35) * 0.06;
        const glowPulse = 1 + Math.sin(time * 22) * 0.08;
        core.setLocalScale(
          radius * 1.9 * pulse,
          radius * 1.9 * pulse,
          radius * 1.9 * pulse
        );
        glow.setLocalScale(
          radius * 4.2 * glowPulse,
          radius * 4.2 * glowPulse,
          radius * 4.2 * glowPulse
        );

        coreMaterial.update();
        glowMaterial.update();
        arcMaterial.update();
        tailMaterial.update();

        for (let index = 0; index < arcs.length; index++) {
          arcs[index].setLocalEulerAngles(
            (time * 420 + index * 70) % 360,
            (time * 560 + index * 130) % 360,
            (time * 300 + index * 110) % 360
          );
        }
      }
    };
    this.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.7, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!this.projectiles.delete(visual)) return;
        root.destroy();
        for (const material of materials) material.destroy();
      }
    };
  }

  /**
   * Proyectil de fuego: núcleo blanco-amarillo, dos halos naranjas y una cola
   * de llamas texturizadas que parpadea. La cola apunta hacia atrás (−Z local).
   */
  private spawnFireProjectile(
    x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number
  ): EffectHandle {
    const root = new pc.Entity('fire-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([255, 248, 216], 0.9);
    const innerMaterial = this.createMaterial([255, 176, 64], 0.45);
    const glowMaterial = this.createMaterial([255, 84, 24], 0.22);
    const flameMaterial = this.createFlameMaterial([255, 255, 255], 0.55);
    const innerFlameMaterial = this.createFlameMaterial([255, 244, 205], 0.6);
    const materials = [
      coreMaterial,
      innerMaterial,
      glowMaterial,
      flameMaterial,
      innerFlameMaterial
    ];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.5, radius * 1.5, radius * 1.5);

    const inner = this.createEntity(this.sphereMesh, [innerMaterial], root);
    inner.setLocalScale(radius * 2.6, radius * 2.6, radius * 2.6);

    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 4.5, radius * 4.5, radius * 4.5);

    // Dos lenguas tumbadas hacia atrás: la exterior ancha y la interior más
    // corta y clara, para que la estela tenga cuerpo y no sea un halo.
    const tailWidth = radius * 3.4;
    const tailLength = radius * 7.6;
    const tail = this.createFlame(root, flameMaterial, {
      x: 0,
      y: 0,
      z: radius * 0.35,
      width: tailWidth,
      height: tailLength,
      pitch: -90
    });
    const innerTail = this.createFlame(root, innerFlameMaterial, {
      x: 0,
      y: radius * 0.2,
      z: radius * 0.45,
      width: radius * 2,
      height: radius * 4.6,
      pitch: -90,
      roll: 35
    });

    this.spawnFlameParticles(root, {
      extents: [radius * 0.7, radius * 0.7, radius * 0.7],
      velocity: [-dirX * 1.6, 0.25, -dirZ * 1.6],
      velocityEnd: [-dirX * 3.2, 0.55, -dirZ * 3.2],
      sizeStart: radius * 2.2,
      sizeMid: radius * 3.2,
      sizeEnd: radius * 1.2,
      lifetime: 0.24,
      rate: 1.2,
      numParticles: 30,
      stretch: 0.5,
      localSpace: false
    });

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        coreMaterial.opacity = 0.78 + Math.random() * 0.15;
        innerMaterial.opacity = 0.3 + Math.random() * 0.18;
        glowMaterial.opacity = 0.12 + Math.random() * 0.1;
        flameMaterial.opacity = 0.3 + Math.random() * 0.15;
        innerFlameMaterial.opacity = 0.35 + Math.random() * 0.18;

        const pulse = 1 + Math.sin(time * 32) * 0.07;
        const innerPulse = 1 + Math.sin(time * 22) * 0.09;
        const glowPulse = 1 + Math.sin(time * 17) * 0.11;
        core.setLocalScale(
          radius * 1.5 * pulse,
          radius * 1.5 * pulse,
          radius * 1.5 * pulse
        );
        inner.setLocalScale(
          radius * 2.6 * innerPulse,
          radius * 2.6 * innerPulse,
          radius * 2.6 * innerPulse
        );
        glow.setLocalScale(
          radius * 4.5 * glowPulse,
          radius * 4.5 * glowPulse,
          radius * 4.5 * glowPulse
        );

        const tailStretch = 0.82 + Math.sin(time * 21) * 0.2;
        const tailSway = 1 + Math.sin(time * 27) * 0.14;
        tail.setLocalScale(
          tailWidth * tailSway,
          tailLength * tailStretch,
          tailWidth * tailSway
        );
        tail.setLocalEulerAngles(-90, 0, Math.sin(time * 13) * 12);

        const innerStretch = 0.78 + Math.sin(time * 29 + 1.2) * 0.26;
        const innerSway = 1 + Math.sin(time * 33 + 0.5) * 0.2;
        innerTail.setLocalScale(
          radius * 2 * innerSway,
          radius * 4.6 * innerStretch,
          radius * 2 * innerSway
        );
        innerTail.setLocalEulerAngles(
          -90,
          0,
          35 + Math.sin(time * 19) * 18
        );
      }
    };
    visual.update(0);
    this.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.7, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!this.projectiles.delete(visual)) return;
        root.destroy();
        for (const material of materials) material.destroy();
      }
    };
  }

  /** Proyectil de hojas: núcleo verde y un anillo de hojas que gira. */
  private spawnGrassProjectile(
    x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]
  ): EffectHandle {
    const root = new pc.Entity('grass-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([230, 255, 200], 0.95);
    const glowMaterial = this.createMaterial(color, 0.25);
    const leafMaterial = this.createLeafMaterial(color, 0.95);
    const materials = [coreMaterial, glowMaterial, leafMaterial];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.7, radius * 1.7, radius * 1.7);
    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 4, radius * 4, radius * 4);

    const leafRing = new pc.Entity('leaf-ring');
    root.addChild(leafRing);
    const leaves: pc.Entity[] = [];
    for (let index = 0; index < 5; index++) {
      const angle = (index / 5) * Math.PI * 2;
      const leaf = this.createLeaf(leafRing, leafMaterial, {
        x: Math.cos(angle) * radius * 1.7,
        y: 0,
        z: Math.sin(angle) * radius * 1.7,
        width: radius * 1.1,
        height: radius * 1.8,
        yaw: 90 - (angle * 180) / Math.PI,
        roll: 20
      });
      leaves.push(leaf);
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        const pulse = 1 + Math.sin(time * 26) * 0.08;
        core.setLocalScale(
          radius * 1.7 * pulse,
          radius * 1.7 * pulse,
          radius * 1.7 * pulse
        );
        glow.setLocalScale(
          radius * 4 * (1 + Math.sin(time * 15) * 0.1),
          radius * 4 * (1 + Math.sin(time * 15) * 0.1),
          radius * 4 * (1 + Math.sin(time * 15) * 0.1)
        );
        leafRing.setLocalEulerAngles(0, time * 420, 0);
        leafMaterial.opacity = 0.75 + Math.random() * 0.25;
      }
    };
    visual.update(0);
    this.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.7, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!this.projectiles.delete(visual)) return;
        root.destroy();
        for (const material of materials) material.destroy();
      }
    };
  }

  /** Proyectil de veneno: orbe turbio con una nube de esporas a su alrededor. */
  private spawnPoisonProjectile(
    x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]
  ): EffectHandle {
    const root = new pc.Entity('poison-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial(color, 0.9);
    const glowMaterial = this.createMaterial([196, 118, 214], 0.24);
    const materials = [coreMaterial, glowMaterial];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.9, radius * 1.9, radius * 1.9);
    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 4.4, radius * 4.4, radius * 4.4);

    this.spawnSporeParticles(
      root,
      {
        extents: [radius * 1.4, radius * 1.4, radius * 1.4],
        velocity: [0, 0.15, 0],
        velocityEnd: [0, 0.5, 0],
        sizeStart: radius * 0.5,
        sizeMid: radius * 0.9,
        sizeEnd: radius * 0.3,
        lifetime: 0.32,
        rate: 0.03,
        numParticles: 36,
        localSpace: false
      },
      color
    );

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        const pulse = 1 + Math.sin(time * 22) * 0.1;
        core.setLocalScale(
          radius * 1.9 * pulse,
          radius * 1.9 * pulse,
          radius * 1.9 * pulse
        );
        glowMaterial.opacity = 0.18 + Math.random() * 0.12;
      }
    };
    visual.update(0);
    this.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.7, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!this.projectiles.delete(visual)) return;
        root.destroy();
        for (const material of materials) material.destroy();
      }
    };
  }

  /** Arco de golpe cuerpo a cuerpo, orientado hacia el `facing` del actor. */
  spawnMelee(
    x: number,
    z: number,
    yaw: number,
    range: number,
    halfAngleDeg: number,
    color: readonly [number, number, number],
    style: ImpactStyle = 'hit'
  ): void {
    const mesh = createArcMesh(
      this.device,
      range,
      Math.max(8, halfAngleDeg) * DEG,
      18
    );
    const material = this.createMaterial(color, 0.85);
    const entity = this.createEntity(mesh, [material]);
    entity.setPosition(x, 0.35, z);
    entity.setEulerAngles(0, yaw / DEG, 0);

    const materials = [material];
    const halfAngle = Math.max(8, halfAngleDeg) * DEG;
    let effectDuration = 0.28;
    const leaves: {
      entity: pc.Entity;
      x: number;
      z: number;
      yaw: number;
      roll: number;
    }[] = [];
    if (style === 'grass') {
      // Hojas que salen despedidas dentro del arco para dar cuerpo al latigazo.
      const leafMaterial = this.createLeafMaterial(color, 0.95);
      materials.push(leafMaterial);
      for (let index = 0; index < 9; index++) {
        const angle = -halfAngle + (index / 8) * halfAngle * 2;
        const distance = range * (0.45 + ((index * 7) % 10) / 10 * 0.5);
        const leafYaw = (index * 47) % 360;
        const leaf = this.createLeaf(entity, leafMaterial, {
          x: Math.sin(angle) * distance,
          y: 0.05,
          z: Math.cos(angle) * distance,
          width: 0.24 + (index % 3) * 0.05,
          height: 0.42 + (index % 4) * 0.06,
          yaw: leafYaw,
          roll: -20 + (index % 5) * 10
        });
        leaves.push({
          entity: leaf,
          x: leaf.getLocalPosition().x,
          z: leaf.getLocalPosition().z,
          yaw: leafYaw,
          roll: -20 + (index % 5) * 10
        });
      }
    }

    const psychicOrbs: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      height: number;
      delay: number;
      travel: number;
      size: number;
      phase: number;
    }[] = [];
    if (style === 'psychic') {
      // Onda telequinética: el arco apenas se marca y una lluvia de orbes
      // psíquicos sale despedida hacia todos los ángulos del cono.
      effectDuration = 0.62;
      material.opacity = 0.3;
      const orbMaterial = this.createMaterial([242, 194, 255], 0.95);
      materials.push(orbMaterial);
      const orbCount = 24;
      for (let index = 0; index < orbCount; index++) {
        const angle =
          -halfAngle * 0.92 +
          (index / (orbCount - 1)) * halfAngle * 1.84 +
          (Math.random() - 0.5) * 0.06;
        const size = 0.09 + Math.random() * 0.1;
        const orb = this.createEntity(this.sphereMesh, [orbMaterial], entity);
        orb.setLocalScale(size, size, size);
        psychicOrbs.push({
          entity: orb,
          angle,
          distance: range * (0.55 + Math.random() * 0.45),
          height: 0.35 + Math.random() * 0.55,
          delay: Math.random() * 0.12,
          travel: 0.4 + Math.random() * 0.22,
          size,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    const puffs: {
      entity: pc.Entity;
      baseX: number;
      baseY: number;
      baseZ: number;
      size: number;
      yaw: number;
    }[] = [];
    let cloudMaterial: pc.StandardMaterial | null = null;
    let cloudHotMaterial: pc.StandardMaterial | null = null;
    const spores: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      height: number;
      delay: number;
      travel: number;
      size: number;
      phase: number;
    }[] = [];
    if (style === 'spore') {
      // Rocío en abanico: cada partícula nace en el vértice del cono y viaja
      // hacia un ángulo distinto del borde, cubriendo toda la abertura.
      effectDuration = 1;
      material.opacity = 0.28;
      const sporeMaterial = this.createSporeMaterial([92, 158, 70], 0.92);
      materials.push(sporeMaterial);
      const sporeCount = 104;
      for (let index = 0; index < sporeCount; index++) {
        const angle =
          -halfAngle * 0.95 +
          (index / (sporeCount - 1)) * halfAngle * 1.9 +
          (Math.random() - 0.5) * 0.03;
        const size = 0.055 + Math.random() * 0.07;
        const entitySpore = this.createLeaf(entity, sporeMaterial, {
          x: 0,
          y: 0.55,
          z: 0,
          width: size,
          height: size,
          yaw: Math.random() * 360
        });
        spores.push({
          entity: entitySpore,
          angle,
          distance: range * (0.6 + Math.random() * 0.4),
          height: 0.18 + Math.random() * 0.62,
          delay: Math.random() * 0.16,
          travel: 0.42 + Math.random() * 0.28,
          size,
          phase: Math.random() * Math.PI * 2
        });
      }
    }
    if (style === 'poison') {
      // Nube violeta: puffs esféricos que avanzan por el cono y motas aditivas
      // que se dispersan hacia delante y hacia arriba.
      effectDuration = 0.62;
      cloudMaterial = this.createMaterial([146, 78, 186], 0.26);
      cloudHotMaterial = this.createMaterial([214, 168, 236], 0.2);
      materials.push(cloudMaterial, cloudHotMaterial);

      this.spawnSporeParticles(
        entity,
        {
          x: 0,
          y: 0.5,
          z: range * 0.55,
          extents: [range * 0.42, 0.3, range * 0.35],
          velocity: [0, 0.35, 0.5],
          velocityEnd: [0, 0.9, 1.3],
          radialSpeed: 0.2,
          radialSpeedEnd: 0.95,
          sizeStart: 0.2,
          sizeMid: 0.44,
          sizeEnd: 0.18,
          lifetime: 0.5,
          rate: 0.03,
          numParticles: 44,
          localSpace: true
        },
        color
      );

      for (let index = 0; index < 7; index++) {
        const spread = (-1 + (index / 6) * 2) * halfAngle * 0.72;
        const distance = range * (0.32 + ((index * 3) % 10) / 10 * 0.42);
        const size = 0.3 + ((index * 7) % 10) / 10 * 0.28;
        const puff = this.createEntity(
          this.sphereMesh,
          [index % 3 === 0 ? cloudHotMaterial : cloudMaterial],
          entity
        );
        puff.setLocalPosition(
          Math.sin(spread) * distance,
          0.4 + ((index * 5) % 10) / 10 * 0.35,
          Math.cos(spread) * distance
        );
        puff.setLocalScale(size, size * 0.82, size);
        const yaw = Math.random() * 360;
        puff.setLocalEulerAngles(0, yaw, 0);
        puffs.push({
          entity: puff,
          baseX: puff.getLocalPosition().x,
          baseY: puff.getLocalPosition().y,
          baseZ: puff.getLocalPosition().z,
          size,
          yaw
        });
      }
    }

    // La malla del arco es exclusiva de este efecto: al destruir la entidad,
    // su MeshInstance la libera y PlayCanvas se encarga de destruirla.
    let time = 0;
    this.addEffect(entity, materials, effectDuration, (t, dt) => {
      time += dt;
      material.opacity =
        (style === 'poison'
          ? 0.38
          : style === 'spore'
            ? 0.28
            : style === 'psychic'
              ? 0.3
              : 0.85) *
        (1 - t);
      const scale = 0.92 + 0.12 * t;
      entity.setLocalScale(scale, 1, scale);
      for (const leaf of leaves) {
        leaf.entity.setLocalPosition(
          leaf.x * (1 + t * 0.35),
          0.05 + t * 0.9,
          leaf.z + t * 1.1
        );
        leaf.entity.setLocalEulerAngles(
          t * 80,
          leaf.yaw + t * 260,
          leaf.roll + t * 140
        );
      }

      for (const spore of spores) {
        const local = Math.min(
          1,
          Math.max(0, (time - spore.delay) / spore.travel)
        );
        const ease = 1 - (1 - local) * (1 - local);
        const distance = spore.distance * ease;
        const angle = spore.angle + Math.sin(time * 2.4 + spore.phase) * 0.035;
        const y =
          0.55 +
          (spore.height - 0.55) * ease +
          Math.sin(local * Math.PI) * 0.18;
        spore.entity.setLocalPosition(
          Math.sin(angle) * distance,
          y,
          Math.cos(angle) * distance
        );
        const fade =
          Math.min(1, local / 0.1) * Math.min(1, (1 - local) / 0.15);
        const sporeScale =
          spore.size * (0.7 + ease * 0.7) * Math.max(0, fade);
        spore.entity.setLocalScale(sporeScale, sporeScale, sporeScale);
        spore.entity.setLocalEulerAngles(
          Math.sin(time * 2.1 + spore.phase) * 18,
          time * 150 + spore.phase * 40,
          Math.cos(time * 1.8 + spore.phase) * 18
        );
      }

      for (const orb of psychicOrbs) {
        const local = Math.min(
          1,
          Math.max(0, (time - orb.delay) / orb.travel)
        );
        const ease = 1 - (1 - local) * (1 - local);
        const distance = orb.distance * ease;
        const angle = orb.angle + Math.sin(time * 3.1 + orb.phase) * 0.04;
        const y =
          0.55 +
          (orb.height - 0.55) * ease +
          Math.sin(local * Math.PI) * 0.14;
        orb.entity.setLocalPosition(
          Math.sin(angle) * distance,
          y,
          Math.cos(angle) * distance
        );
        const fade =
          Math.min(1, local / 0.12) * Math.min(1, (1 - local) / 0.2);
        const orbScale =
          orb.size * (0.55 + ease * 0.85) * Math.max(0, fade);
        orb.entity.setLocalScale(orbScale, orbScale, orbScale);
        orb.entity.setLocalEulerAngles(
          time * 140 + orb.phase * 30,
          time * 220 + orb.phase * 50,
          Math.sin(time * 4 + orb.phase) * 20
        );
      }

      if (cloudMaterial) cloudMaterial.opacity = 0.26 * (1 - t);
      if (cloudHotMaterial) cloudHotMaterial.opacity = 0.2 * (1 - t);
      for (const puff of puffs) {
        const grow = 0.65 + Math.min(1, t * 2.2) * 0.55;
        puff.entity.setLocalPosition(
          puff.baseX * (1 + t * 0.45),
          puff.baseY + t * 0.45,
          puff.baseZ + t * 0.85
        );
        puff.entity.setLocalScale(
          puff.size * grow,
          puff.size * 0.82 * grow,
          puff.size * grow
        );
        puff.entity.setLocalEulerAngles(
          0,
          puff.yaw + t * 40,
          Math.sin(t * 12 + puff.baseX) * 12
        );
      }
    });
  }

  /**
   * Haz instantáneo: dos rayos zigzagueantes que giran en sentidos opuestos,
   * cruzándose mientras el haz se extiende desde el lanzador hacia delante.
   */
  spawnBeam(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number,
    style: BeamStyle = 'electric'
  ): void {
    if (style === 'fire') {
      this.spawnFireBeam(x1, z1, x2, z2, color, width);
      return;
    }
    if (style === 'psychic') {
      this.spawnPsychicBeam(x1, z1, x2, z2, color, width);
      return;
    }
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('beam');
    root.setPosition(x1, 0.7, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    this.app.root.addChild(root);

    const strandMaterial = this.createMaterial(color, 0.95);
    const coreMaterial = this.createMaterial([255, 255, 255], 0.7);
    const materials = [strandMaterial, coreMaterial];

    const strandWidth = Math.max(0.02, width * 0.28);
    const segments = Math.max(10, Math.round(length * 2));
    const strands: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const mesh = createLightningMesh(
        this.device,
        length,
        strandWidth,
        segments,
        3000 + index * 7919
      );
      const strand = this.createEntity(mesh, [strandMaterial], root);
      strand.setLocalPosition(0, 0, length / 2);
      strands.push(strand);
    }

    const core = this.createEntity(this.boxMesh, [coreMaterial], root);
    const coreWidth = Math.max(0.015, width * 0.34);
    core.setLocalPosition(0, 0, length / 2);
    core.setLocalScale(coreWidth, coreWidth, length);

    this.addEffect(root, materials, 0.34, (t) => {
      // El haz avanza desde el lanzador durante el primer tercio del efecto.
      const advance = Math.min(1, t / 0.34);
      const reveal = 1 - (1 - advance) * (1 - advance);
      for (const strand of strands) {
        strand.setLocalPosition(0, 0, (length / 2) * reveal);
        strand.setLocalScale(1, 1, Math.max(0.02, reveal));
      }
      core.setLocalPosition(0, 0, (length / 2) * reveal);
      core.setLocalScale(coreWidth, coreWidth, length * Math.max(0.02, reveal));

      const spin = t * 900;
      strands[0].setLocalEulerAngles(0, 0, spin);
      strands[1].setLocalEulerAngles(0, 0, -spin);

      const flicker = 0.78 + Math.random() * 0.22;
      const fade = 1 - Math.max(0, (t - 0.4) / 0.6);
      strandMaterial.opacity = 0.95 * flicker * fade;
      coreMaterial.opacity = 0.55 * flicker * fade;
      strandMaterial.update();
      coreMaterial.update();
    });
  }

  /**
   * Haz psíquico: un núcleo luminoso estirado con anillos de energía que
   * recorren la línea de fuego y una punta pulsante al final.
   */
  private spawnPsychicBeam(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number
  ): void {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('psychic-beam');
    root.setPosition(x1, 0.7, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    this.app.root.addChild(root);

    const glowMaterial = this.createMaterial(color, 0.42);
    const coreMaterial = this.createMaterial([255, 240, 255], 0.9);
    const ringMaterial = this.createMaterial([238, 182, 255], 0.72);
    const materials = [glowMaterial, coreMaterial, ringMaterial];

    const glowWidth = Math.max(0.06, width * 2.4);
    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0, length / 2);
    glow.setLocalScale(glowWidth, glowWidth, length);

    const coreWidth = Math.max(0.04, width * 0.7);
    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0, length / 2);
    core.setLocalScale(coreWidth, coreWidth, length);

    // Anillos perpendiculares al haz que viajan hacia la punta.
    const rings: pc.Entity[] = [];
    const ringCount = 7;
    for (let index = 0; index < ringCount; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0, ((index + 1) / (ringCount + 1)) * length);
      ring.setLocalEulerAngles(90, 0, 0);
      rings.push(ring);
    }

    const tip = this.createEntity(this.sphereMesh, [coreMaterial], root);
    tip.setLocalPosition(0, 0, length);
    tip.setLocalScale(width * 3, width * 3, width * 3);

    let time = 0;
    this.addEffect(root, materials, 0.42, (_t, dt) => {
      time += dt;
      const advance = Math.min(1, time / 0.12);
      const reveal = 1 - (1 - advance) * (1 - advance);
      const pulse = 0.82 + Math.random() * 0.18;
      const fade = 1 - Math.max(0, (time - 0.24) / 0.18);

      glow.setLocalPosition(0, 0, (length * reveal) / 2);
      glow.setLocalScale(
        glowWidth * pulse,
        glowWidth * pulse,
        Math.max(0.02, length * reveal)
      );
      core.setLocalPosition(0, 0, (length * reveal) / 2);
      core.setLocalScale(
        coreWidth,
        coreWidth,
        Math.max(0.02, length * reveal)
      );

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const path = (time * 2.1 + index / ringCount) % 1;
        ring.setLocalPosition(0, 0, length * reveal * (0.12 + path * 0.88));
        const ringScale =
          width * (1.4 + pulse * 0.9) * (0.55 + Math.sin(path * Math.PI) * 0.9);
        ring.setLocalScale(ringScale, ringScale, ringScale);
        ring.setLocalEulerAngles(90, 0, time * 240 + index * 42);
      }

      tip.setLocalPosition(0, 0, length * reveal);
      const tipScale = width * 3 * (0.8 + Math.sin(time * 36) * 0.25);
      tip.setLocalScale(tipScale, tipScale, tipScale);

      glowMaterial.opacity = 0.42 * pulse * fade;
      coreMaterial.opacity = 0.9 * pulse * fade;
      ringMaterial.opacity = 0.72 * fade;
    });
  }

  /**
   * Chorro de fuego: partículas orientadas a cámara a lo largo del recorrido,
   * lenguas texturizadas que les dan silueta y un núcleo cálido. Avanza muy
   * rápido y se desvanece antes de desaparecer.
   */
  private spawnFireBeam(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number],
    width: number
  ): void {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const root = new pc.Entity('fire-beam');
    root.setPosition(x1, 0.7, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([255, 226, 170], 0.5);
    const flameMaterial = this.createFlameMaterial([255, 255, 255], 0.5);
    const hotMaterial = this.createFlameMaterial([255, 242, 200], 0.55);
    const glowMaterial = this.createMaterial(color, 0.16);
    const materials = [coreMaterial, flameMaterial, hotMaterial, glowMaterial];

    this.spawnFlameParticles(root, {
      x: 0,
      y: 0,
      z: length / 2,
      extents: [width * 2, width * 1.8, length * 0.5],
      velocity: [0, 0.25, 1.4],
      velocityEnd: [0, 0.9, 3.6],
      sizeStart: width * 1.6,
      sizeMid: width * 2.6,
      sizeEnd: width * 1.1,
      lifetime: 0.32,
      rate: 1.1,
      numParticles: 80,
      stretch: 0.55,
      localSpace: true
    });
    const beamLight = this.createFireLight(
      root,
      0,
      0.8,
      length / 2,
      1.3,
      6.5
    );

    const coreWidth = Math.max(0.04, width * 0.28);
    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);

    // Lenguas tumbadas que se solapan a lo largo del chorro: son las que dan
    // la silueta irregular de fuego; el núcleo brillante solo las une.
    const licks: {
      entity: pc.Entity;
      baseWidth: number;
      baseHeight: number;
      phase: number;
      offsetZ: number;
      offsetX: number;
      offsetY: number;
      pitch: number;
      yaw: number;
      roll: number;
      vertical: boolean;
    }[] = [];
    const horizontalCount = Math.min(
      22,
      Math.max(6, Math.round(length / 0.8))
    );
    for (let index = 0; index < horizontalCount; index++) {
      const spread = ((index * 37) % 10) / 10;
      const baseWidth = width * (2.2 + spread * 1.5);
      const baseHeight = width * (4.2 + spread * 3.2);
      const pitch = index % 2 === 0 ? -90 : -72;
      // Yaw pequeño: las lenguas deben alargarse a lo largo del chorro, no
      // cruzándose en cualquier dirección.
      const yaw = ((index * 53) % 30) - 15;
      const roll = ((index * 71) % 90) - 45;
      const entity = this.createFlame(root, index % 3 === 0 ? hotMaterial : flameMaterial, {
        x: 0,
        y: 0,
        z: 0,
        width: baseWidth,
        height: baseHeight,
        pitch,
        yaw,
        roll
      });
      licks.push({
        entity,
        baseWidth,
        baseHeight,
        phase: index * 1.7,
        offsetZ: ((index + 0.5) / horizontalCount) * length,
        offsetX: Math.cos(index * 1.7) * width * 0.7,
        offsetY: Math.sin(index * 2.3) * width * 0.55,
        pitch,
        yaw,
        roll,
        vertical: false
      });
    }

    // Algunas llamas verticales sobre el chorro rompen la línea recta.
    const verticalCount = Math.min(8, Math.max(3, Math.round(length / 2.2)));
    for (let index = 0; index < verticalCount; index++) {
      const spread = ((index * 29) % 10) / 10;
      const baseWidth = width * (1.8 + spread * 1.4);
      const baseHeight = width * (3.4 + spread * 2.6);
      const yaw = (index * 67) % 360;
      licks.push({
        entity: this.createFlame(root, flameMaterial, {
          x: 0,
          y: 0,
          z: 0,
          width: baseWidth,
          height: baseHeight,
          yaw
        }),
        baseWidth,
        baseHeight,
        phase: index * 2.3 + 0.8,
        offsetZ: ((index + 0.5) / verticalCount) * length,
        offsetX: Math.cos(index * 2.1) * width * 1.1,
        offsetY: 0,
        pitch: 0,
        yaw,
        roll: 0,
        vertical: true
      });
    }

    const tipWidth = width * 4;
    const tipHeight = width * 8;
    const tip = this.createFlame(root, hotMaterial, {
      x: 0,
      y: 0,
      z: 0,
      width: tipWidth,
      height: tipHeight,
      pitch: -90
    });

    let time = 0;
    const animate = (t: number, dt: number): void => {
      time += dt;
      // El chorro sale muy rápido: en el primer 18 % ya está casi entero.
      const reveal = Math.min(1, t / 0.18);
      const revealEase = 1 - (1 - reveal) * (1 - reveal);
      const visibleLength = length * revealEase;

      core.setLocalPosition(0, 0, visibleLength / 2);
      core.setLocalScale(
        coreWidth * 2,
        coreWidth * 2,
        Math.max(0.02, visibleLength)
      );

      for (const lick of licks) {
        if (lick.offsetZ > visibleLength) {
          lick.entity.setLocalScale(0, 0, 0);
          continue;
        }
        const pulse = 0.78 + Math.sin(time * 21 + lick.phase) * 0.24;
        const stretch = 0.86 + Math.sin(time * 17 + lick.phase * 1.3) * 0.22;
        const sway = Math.sin(time * 11 + lick.phase) * width * 0.55;
        const rise = Math.cos(time * 8 + lick.phase) * width * 0.55;
        const widthNow = lick.baseWidth * pulse;
        const heightNow = lick.baseHeight * stretch;
        lick.entity.setLocalPosition(
          lick.offsetX + sway,
          lick.offsetY + rise,
          lick.offsetZ
        );
        lick.entity.setLocalScale(widthNow, heightNow, widthNow);
        if (lick.vertical) {
          lick.entity.setLocalEulerAngles(
            0,
            lick.yaw + Math.sin(time * 6 + lick.phase) * 18,
            Math.sin(time * 13 + lick.phase) * 8
          );
        } else {
          lick.entity.setLocalEulerAngles(
            lick.pitch,
            lick.yaw + Math.sin(time * 9 + lick.phase) * 14,
            lick.roll + Math.sin(time * 15 + lick.phase) * 12
          );
        }
      }

      tip.setLocalPosition(0, 0, visibleLength);
      const tipStretch = 0.82 + Math.sin(time * 24) * 0.24;
      const tipSway = 1 + Math.sin(time * 30) * 0.16;
      const tipVisible = visibleLength > 0.12 ? 1 : 0;
      tip.setLocalScale(
        tipWidth * tipSway * tipVisible,
        tipHeight * tipStretch * tipVisible,
        tipWidth * tipSway * tipVisible
      );
      tip.setLocalEulerAngles(-90, 0, Math.sin(time * 18) * 14);

      const fade = 1 - Math.max(0, (t - 0.45) / 0.55);
      coreMaterial.opacity = 0.4 * fade * (0.85 + Math.random() * 0.15);
      flameMaterial.opacity = (0.28 + Math.random() * 0.16) * fade;
      hotMaterial.opacity = (0.34 + Math.random() * 0.18) * fade;
      glowMaterial.opacity = 0.14 * fade * (0.7 + Math.random() * 0.3);
      beamLight.light!.intensity =
        1.3 * fade * (0.68 + Math.random() * 0.32);
    };
    this.addEffect(root, materials, 0.45, animate);
    animate(0, 0);
  }

  /** Anillo de área en el suelo, centrado delante del lanzador. */
  spawnAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    style: AoeStyle = 'ring',
    duration = 0.65
  ): void {
    const life = Math.max(0.2, duration);
    if (style === 'fire') {
      this.spawnFireAoe(x, z, radius, color, life);
      return;
    }
    if (style === 'whirl') {
      this.spawnFireWhirl(x, z, radius, color, life);
      return;
    }
    if (style === 'grass') {
      this.spawnGrassAoe(x, z, radius, color, life);
      return;
    }
    if (style === 'poison') {
      this.spawnPoisonAoe(x, z, radius, color, life);
      return;
    }
    if (style === 'psychic') {
      this.spawnPsychicAoe(x, z, radius, color, life);
      return;
    }
    const material = this.createMaterial(color, 0.8);
    const entity = this.createEntity(this.torusMesh, [material]);
    entity.setPosition(x, 0.12, z);

    let time = 0;
    this.addEffect(entity, [material], life, (_t, dt) => {
      time += dt;
      const grow = 1 - Math.pow(1 - Math.min(1, time / 0.3), 2);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const scale = Math.max(0.2, radius * 2) * (0.4 + 0.6 * grow);
      entity.setLocalScale(scale, 1, scale);
      material.opacity = 0.75 * fadeOut * (0.82 + Math.sin(time * 7) * 0.18);
    });
  }

  /**
   * Área de Planta: torbellino de hojas. Las hojas giran en espiral baja y
   * ancha, ocupando todo el radio del área, mientras un anillo tenue marca
   * el borde.
   */
  private spawnGrassAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.2, duration);
    const root = new pc.Entity('grass-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const ringMaterial = this.createMaterial(color, 0.3);
    const fillMaterial = this.createMaterial([84, 148, 56], 0.1);
    const leafMaterial = this.createLeafMaterial([226, 248, 190], 0.95);
    const hotLeafMaterial = this.createLeafMaterial([248, 255, 220], 0.95);
    const materials = [
      ringMaterial,
      fillMaterial,
      leafMaterial,
      hotLeafMaterial
    ];

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.1, 0);
    ring.setLocalScale(radius * 2, 1, radius * 2);

    const fill = this.createEntity(this.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.03, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    this.spawnLeafParticles(
      root,
      {
        x: 0,
        y: 0.15,
        z: 0,
        extents: [radius * 0.7, 0.1, radius * 0.7],
        velocity: [0, 0.8, 0],
        velocityEnd: [0, 2, 0],
        radialSpeed: 0.9,
        radialSpeedEnd: 2.6,
        sizeStart: radius * 0.03,
        sizeMid: radius * 0.06,
        sizeEnd: radius * 0.025,
        lifetime: 0.8,
        rate: 0.012,
        numParticles: 120,
        localSpace: false
      },
      color
    );

    const leaves: {
      entity: pc.Entity;
      angle: number;
      radiusFactor: number;
      phase: number;
      rise: number;
      spin: number;
      size: number;
      yaw: number;
    }[] = [];
    const leafCount = 120;
    for (let index = 0; index < leafCount; index++) {
      // Todas las hojas entran en el giro: se reparten por todo el radio y
      // ninguna forma una columna fija en el centro.
      const angle = Math.random() * Math.PI * 2;
      const radiusFactor = 0.32 + Math.sqrt(Math.random()) * 0.68;
      const size = radius * (0.045 + Math.random() * 0.05);
      const yaw = Math.random() * 360;
      const entity = this.createLeaf(
        root,
        index % 5 === 0 ? hotLeafMaterial : leafMaterial,
        {
          x: Math.cos(angle) * radius * radiusFactor * 0.2,
          y: 0.05,
          z: Math.sin(angle) * radius * radiusFactor * 0.2,
          width: size,
          height: size * 1.75,
          yaw
        }
      );
      leaves.push({
        entity,
        angle,
        radiusFactor,
        phase: Math.random(),
        rise: 0.7 + Math.random() * 0.55,
        spin: 0.8 + Math.random() * 0.5,
        size,
        yaw
      });
    }

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.12);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.25));
      const envelope = Math.min(fadeIn, fadeOut);
      const pulse = 0.5 + Math.sin(time * 9) * 0.2;
      // Giro global del embudo, además del giro individual de cada hoja.
      root.setLocalEulerAngles(0, time * 1.4, 0);

      ringMaterial.opacity = (0.18 + pulse * 0.16) * envelope;
      fillMaterial.opacity = (0.05 + pulse * 0.04) * envelope;
      const ringScale = radius * 2 * (0.94 + pulse * 0.06);
      ring.setLocalScale(ringScale, 1, ringScale);

      for (const leaf of leaves) {
        // La hoja sube en espiral: el ángulo avanza con el tiempo y con la
        // altura, y el radio se abre en embudo hacia la parte alta.
        const p = (time * leaf.rise + leaf.phase) % 1;
        const angle =
          leaf.angle + time * 7.2 + p * Math.PI * 2.6;
        // Torbellino bajo y ancho: ya nace abierto y se ensancha hasta el
        // borde del área sin ganar apenas altura.
        const funnel = 0.45 + 0.55 * p;
        const dist = radius * leaf.radiusFactor * funnel;
        const y = 0.05 + p * radius * 0.45;
        leaf.entity.setLocalPosition(
          Math.cos(angle) * dist,
          y,
          Math.sin(angle) * dist
        );
        leaf.entity.setLocalEulerAngles(
          Math.sin(time * 2.4 + leaf.phase * 6.28) * 22,
          leaf.yaw + time * 900 * leaf.spin + p * 540,
          Math.cos(time * 2 + leaf.phase * 6.28) * 18
        );
        const leafFade =
          Math.min(1, p / 0.1) *
          Math.min(1, (1 - p) / 0.18) *
          envelope;
        const scale =
          leaf.size *
          leafFade *
          (0.8 + Math.sin(time * 6 + leaf.phase * 10) * 0.2);
        leaf.entity.setLocalScale(scale, scale * 1.75, scale);
      }

      leafMaterial.opacity = 0.82 * envelope;
      hotLeafMaterial.opacity = 0.9 * envelope;
    };
    this.addEffect(root, materials, life, animate);
    animate(0, 0);
  }

  /**
   * Área de esporas: nube baja que crece desde el suelo y se queda flotando.
   * Se usa para habilidades de estado, así que no necesita lenguas de fuego:
   * solo anillo, disco tenue, puffs y motas aditivas.
   */
  private spawnPoisonAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.2, duration);
    const root = new pc.Entity('poison-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const ringMaterial = this.createMaterial(color, 0.3);
    const fillMaterial = this.createMaterial([116, 176, 68], 0.08);
    const puffMaterial = this.createMaterial([226, 250, 186], 0.16);
    const materials = [ringMaterial, fillMaterial, puffMaterial];

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.1, 0);
    ring.setLocalScale(radius * 2, 1, radius * 2);

    const fill = this.createEntity(this.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.03, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    this.spawnSporeParticles(
      root,
      {
        x: 0,
        y: 0.14,
        z: 0,
        extents: [radius * 0.85, 0.12, radius * 0.85],
        velocity: [0, 0.35, 0],
        velocityEnd: [0, 1.15, 0],
        radialSpeed: 0.12,
        radialSpeedEnd: 0.55,
        sizeStart: radius * 0.14,
        sizeMid: radius * 0.3,
        sizeEnd: radius * 0.12,
        lifetime: 0.85,
        rate: 0.02,
        numParticles: 120,
        localSpace: false
      },
      color
    );

    const puffs: {
      entity: pc.Entity;
      baseX: number;
      baseZ: number;
      baseY: number;
      phase: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const angle = (index / 7) * Math.PI * 2 + Math.random() * 0.6;
      const dist = radius * (0.15 + Math.random() * 0.55);
      const size = radius * (0.34 + Math.random() * 0.28);
      const puff = this.createEntity(this.sphereMesh, [puffMaterial], root);
      puff.setLocalPosition(Math.cos(angle) * dist, 0.3, Math.sin(angle) * dist);
      puff.setLocalScale(size, size * 0.55, size);
      puffs.push({
        entity: puff,
        baseX: Math.cos(angle) * dist,
        baseZ: Math.sin(angle) * dist,
        baseY: 0.28 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
        size
      });
    }

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.16);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const envelope = Math.min(fadeIn, fadeOut);
      const pulse = 0.5 + Math.sin(time * 7) * 0.2;

      ringMaterial.opacity = (0.2 + pulse * 0.16) * envelope;
      fillMaterial.opacity = (0.05 + pulse * 0.035) * envelope;
      puffMaterial.opacity = (0.1 + pulse * 0.07) * envelope;

      const ringScale = radius * 2 * (0.96 + pulse * 0.05);
      ring.setLocalScale(ringScale, 1, ringScale);

      for (const puff of puffs) {
        const drift = Math.sin(time * 2.6 + puff.phase) * radius * 0.06;
        puff.entity.setLocalPosition(
          puff.baseX + drift,
          puff.baseY + time * 0.22 + Math.sin(time * 3 + puff.phase) * 0.05,
          puff.baseZ + Math.cos(time * 2.2 + puff.phase) * radius * 0.05
        );
        const scale = puff.size * (0.75 + 0.35 * Math.min(1, time / 0.4));
        puff.entity.setLocalScale(scale, scale * 0.55, scale);
        puff.entity.setLocalEulerAngles(0, time * 12 + puff.phase * 30, 0);
      }
    };
    this.addEffect(root, materials, life, animate);
    animate(0, 0);
  }

  /**
   * Área psíquica: implosión central y estallido de ondas y esquirlas de
   * energía que se abren hasta el borde del círculo. Marca el radio con un
   * anillo y un disco tenue.
   */
  private spawnPsychicAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.2, duration);
    const root = new pc.Entity('psychic-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const ringMaterial = this.createMaterial(color, 0.42);
    const fillMaterial = this.createMaterial([148, 88, 220], 0.12);
    const coreMaterial = this.createMaterial([255, 232, 255], 0.95);
    const shardMaterial = this.createMaterial([240, 186, 255], 0.9);
    const materials = [
      ringMaterial,
      fillMaterial,
      coreMaterial,
      shardMaterial
    ];

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.1, 0);
    ring.setLocalScale(radius * 2, 1, radius * 2);

    const fill = this.createEntity(this.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.03, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    // Tres ondas de choque que se expanden hacia el borde.
    const waves: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const wave = this.createEntity(this.torusMesh, [ringMaterial], root);
      wave.setLocalPosition(0, 0.14 + index * 0.06, 0);
      waves.push(wave);
    }

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.7, 0);
    core.setLocalScale(0.4, 0.4, 0.4);

    const shards: {
      entity: pc.Entity;
      angle: number;
      elevation: number;
      distance: number;
      delay: number;
      travel: number;
      size: number;
      phase: number;
    }[] = [];
    const shardCount = 54;
    for (let index = 0; index < shardCount; index++) {
      const angle = Math.random() * Math.PI * 2;
      const size = 0.08 + Math.random() * 0.1;
      const shard = this.createEntity(this.sphereMesh, [shardMaterial], root);
      shard.setLocalScale(size, size, size);
      shards.push({
        entity: shard,
        angle,
        elevation: 0.15 + Math.random() * 0.8,
        distance: radius * (0.45 + Math.random() * 0.55),
        delay: Math.random() * 0.1,
        travel: 0.38 + Math.random() * 0.24,
        size,
        phase: Math.random() * Math.PI * 2
      });
    }

    let time = 0;
    this.addEffect(root, materials, life, (_t, dt) => {
      time += dt;
      const fadeOut = Math.min(1, Math.max(0, (life - time) / (life * 0.45)));
      const pulse = 0.5 + Math.sin(time * 24) * 0.2;

      ringMaterial.opacity = (0.22 + pulse * 0.24) * fadeOut;
      fillMaterial.opacity = (0.06 + pulse * 0.06) * fadeOut;
      const groundScale = radius * 2 * (0.98 + pulse * 0.03);
      ring.setLocalScale(groundScale, 1, groundScale);

      for (let index = 0; index < waves.length; index++) {
        const wave = waves[index];
        const progress = Math.min(
          1,
          Math.max(0, (time - index * 0.09) / 0.42)
        );
        const ease = 1 - (1 - progress) * (1 - progress);
        const scale = Math.max(0.01, radius * 2 * ease);
        wave.setLocalScale(scale, 1, scale);
      }

      // El núcleo se contrae durante la implosión y luego estalla.
      const implosion = Math.min(1, time / 0.14);
      const burst = Math.max(0, Math.min(1, (time - 0.14) / 0.32));
      const coreScale =
        radius *
        (0.5 * (1 - implosion) + 0.34 * Math.sin(burst * Math.PI));
      core.setLocalScale(
        Math.max(0.01, coreScale),
        Math.max(0.01, coreScale),
        Math.max(0.01, coreScale)
      );
      core.setLocalPosition(0, 0.7 + Math.sin(burst * Math.PI) * 0.6, 0);
      coreMaterial.opacity =
        0.95 * (implosion < 1 ? 1 : Math.max(0, 1 - burst));

      for (const shard of shards) {
        const local = Math.min(
          1,
          Math.max(0, (time - shard.delay) / shard.travel)
        );
        const ease = 1 - (1 - local) * (1 - local);
        const distance = shard.distance * ease;
        const angle = shard.angle + Math.sin(time * 3 + shard.phase) * 0.06;
        const y = 0.4 + shard.elevation * ease * radius * 0.45;
        shard.entity.setLocalPosition(
          Math.cos(angle) * distance,
          y,
          Math.sin(angle) * distance
        );
        const fade =
          Math.min(1, local / 0.1) * Math.min(1, (1 - local) / 0.25);
        const scale =
          shard.size * (0.6 + ease * 0.9) * Math.max(0, fade) * fadeOut;
        shard.entity.setLocalScale(scale, scale, scale);
        shard.entity.setLocalEulerAngles(
          time * 160 + shard.phase * 30,
          time * 210 + shard.phase * 40,
          Math.sin(time * 5 + shard.phase) * 24
        );
      }
    });
  }

  /**
   * Marca de área para las habilidades con retardo: anillo discontinuo,
   * relleno tenue y un disco de carga que crece hasta el radio real. El
   * llamador la destruye justo antes de ejecutar el daño.
   */
  spawnAoeTelegraph(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): TelegraphHandle {
    const root = new pc.Entity('aoe-telegraph');
    root.setPosition(x, 0.08, z);
    this.app.root.addChild(root);

    const ringMaterial = this.createMaterial(color, 0.5);
    const hot: [number, number, number] = [
      Math.round(color[0] + (255 - color[0]) * 0.62),
      Math.round(color[1] + (255 - color[1]) * 0.62),
      Math.round(color[2] + (255 - color[2]) * 0.62)
    ];
    const dashMaterial = this.createMaterial(hot, 0.85);
    const fillMaterial = this.createMaterial(color, 0.08);
    const sweepMaterial = this.createMaterial(hot, 0.4);
    const materials = [ringMaterial, dashMaterial, fillMaterial, sweepMaterial];

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalScale(radius * 2, 1, radius * 2);

    const dash = this.createEntity(this.dashRingMesh, [dashMaterial], root);
    dash.setLocalScale(radius * 2, 1, radius * 2);

    const fill = this.createEntity(this.discMesh, [fillMaterial], root);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    const sweep = this.createEntity(this.discMesh, [sweepMaterial], root);
    sweep.setLocalScale(0.01, 1, 0.01);

    const record: AoeTelegraph = {
      entity: root,
      materials,
      elapsed: 0,
      duration: Math.max(0.05, duration),
      active: true,
      update: (progress, elapsed) => {
        const pulse = 0.5 + Math.sin(elapsed * 14) * 0.18;
        ringMaterial.opacity = 0.3 + pulse * 0.35;
        dashMaterial.opacity = 0.55 + pulse * 0.35;
        fillMaterial.opacity = 0.06 + pulse * 0.05;
        dash.setLocalEulerAngles(0, -elapsed * 32, 0);

        const sweepScale = Math.max(0.01, radius * 2 * progress);
        sweep.setLocalScale(sweepScale, 1, sweepScale);
        sweepMaterial.opacity = 0.34 * (1 - progress * 0.55);

        // Destello final: avisa del impacto inminente.
        if (progress > 0.82) {
          const flash = (progress - 0.82) / 0.18;
          ringMaterial.opacity += flash * 0.45;
          dashMaterial.opacity += flash * 0.35;
          sweepMaterial.opacity += flash * 0.3;
        }
      }
    };

    this.telegraphs.add(record);
    return { destroy: () => this.disposeTelegraph(record) };
  }

  private disposeTelegraph(telegraph: AoeTelegraph): void {
    if (!telegraph.active) return;
    telegraph.active = false;
    this.telegraphs.delete(telegraph);
    telegraph.entity.destroy();
    for (const material of telegraph.materials) material.destroy();
  }

  /**
   * Área de fuego: anillo en el suelo, resplandor central y lenguas de fuego
   * texturizadas que crecen, se mecen y se apagan. El conjunto gira lentamente
   * para dar la sensación de remolino.
   */
  private spawnFireAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.2, duration);
    const root = new pc.Entity('fire-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const ringMaterial = this.createMaterial(color, 0.4);
    const glowMaterial = this.createMaterial([255, 104, 30], 0.14);
    const flameMaterial = this.createFlameMaterial([255, 200, 140], 0.5);
    const hotMaterial = this.createFlameMaterial([255, 232, 185], 0.55);
    const materials = [ringMaterial, glowMaterial, flameMaterial, hotMaterial];

    const shortBurst = life < 1;
    this.spawnFlameParticles(root, {
      x: 0,
      y: 0.14,
      z: 0,
      extents: [radius * 0.9, 0.18, radius * 0.9],
      velocity: [0, 1, 0],
      velocityEnd: [0, 2.4, 0],
      radialSpeed: 0.25,
      radialSpeedEnd: 0.8,
      sizeStart: radius * 0.2,
      sizeMid: radius * 0.46,
      sizeEnd: radius * 0.14,
      lifetime: shortBurst ? 0.32 : 0.58,
      rate: shortBurst ? 2.4 : 1.5,
      numParticles: shortBurst ? 80 : 130,
      localSpace: false
    });
    const aoeLight = this.createFireLight(
      root,
      0,
      1,
      0,
      1.8,
      radius * 2.4
    );

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.12, 0);

    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.14, 0);
    glow.setLocalScale(radius * 1.15, radius * 0.22, radius * 1.15);

    const flames: {
      entity: pc.Entity;
      phase: number;
      angle: number;
      dist: number;
      baseWidth: number;
      baseHeight: number;
      yaw: number;
    }[] = [];
    // Tres anillos concéntricos con desfase: cubren todo el disco y evitan
    // el hueco que dejaba una sola corona de llamas.
    const flameRings = [
      { count: 8, dist: 0.18, width: 0.24, height: 0.5 },
      { count: 12, dist: 0.43, width: 0.28, height: 0.62 },
      { count: 16, dist: 0.68, width: 0.31, height: 0.72 }
    ];
    for (let ringIndex = 0; ringIndex < flameRings.length; ringIndex++) {
      const spec = flameRings[ringIndex];
      const offset = ringIndex * 0.5;
      for (let index = 0; index < spec.count; index++) {
        const angle = ((index + offset) / spec.count) * Math.PI * 2;
        const variation = ((index * 7 + ringIndex * 3) % 10) / 10;
        const dist = radius * spec.dist * (0.92 + variation * 0.16);
        const baseWidth =
          radius * spec.width * (0.9 + variation * 0.2);
        const baseHeight =
          radius * spec.height * (0.88 + variation * 0.24);
        const yaw = (index * 47 + ringIndex * 31) % 360;
        const entity = this.createFlame(
          root,
          (index + ringIndex) % 4 === 0 ? hotMaterial : flameMaterial,
          {
            x: Math.cos(angle) * dist,
            y: 0,
            z: Math.sin(angle) * dist,
            width: baseWidth,
            height: baseHeight,
            yaw
          }
        );
        flames.push({
          entity,
          phase: index * 1.3 + ringIndex * 2.1,
          angle,
          dist,
          baseWidth,
          baseHeight,
          yaw
        });
      }
    }

    // Llama central más alta: da el pico de calor en el centro del anillo.
    const centerWidth = radius * 0.6;
    const centerHeight = radius * 1.05;
    const centerFlame = this.createFlame(root, hotMaterial, {
      x: 0,
      y: 0,
      z: 0,
      width: centerWidth,
      height: centerHeight,
      yaw: 15
    });

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeInTime = Math.min(0.22, life * 0.3);
      const fadeOutTime = Math.min(0.35, life * 0.35);
      const growTime = Math.min(0.3, life * 0.5);
      const fadeIn = Math.min(1, time / fadeInTime);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / fadeOutTime));
      const envelope = Math.min(fadeIn, fadeOut);
      const grow = 1 - Math.pow(1 - Math.min(1, time / growTime), 2);
      const pulse = 0.5 + Math.sin(time * 7) * 0.2;

      const ringScale = Math.max(0.2, radius * 2) * (0.35 + 0.85 * grow);
      ring.setLocalScale(ringScale, 1, ringScale);
      ringMaterial.opacity = (0.24 + pulse * 0.2) * envelope;

      const glowScale = radius * 1.15 * (0.7 + 0.5 * grow);
      glow.setLocalScale(
        glowScale,
        radius * 0.22 * (0.7 + 0.7 * grow),
        glowScale
      );
      glow.setLocalPosition(0, 0.14 + grow * 0.2, 0);
      glowMaterial.opacity = (0.08 + pulse * 0.08) * envelope;

      root.setLocalEulerAngles(0, time * 6, 0);

      for (const flame of flames) {
        const growIn = Math.min(0.25, life * 0.3);
        const delay = (flame.phase % 1) * growIn * 0.3;
        const localIn = Math.min(1, Math.max(0, (time - delay) / growIn));
        const flicker = 0.88 + Math.sin(time * 11 + flame.phase * 1.7) * 0.12;
        const sway = Math.sin(time * 6.5 + flame.phase) * 0.2;
        const scale = Math.max(0.001, localIn * envelope);
        flame.entity.setLocalScale(
          flame.baseWidth * scale * flicker,
          flame.baseHeight * scale * (1.05 + sway),
          flame.baseWidth * scale * flicker
        );
        // Las llamas siguen brotando del suelo hasta el final; solo se mecen.
        flame.entity.setLocalPosition(
          Math.cos(flame.angle) * flame.dist,
          Math.max(0, sway * radius * 0.05),
          Math.sin(flame.angle) * flame.dist
        );
        flame.entity.setLocalEulerAngles(
          0,
          flame.yaw + time * 10 + Math.sin(time * 3 + flame.phase) * 10,
          Math.sin(time * 4 + flame.phase) * 7
        );
      }

      const centerIn = Math.min(1, time / Math.min(0.3, life * 0.4));
      const centerLife = centerIn * envelope;
      centerFlame.setLocalScale(
        centerWidth * centerLife * (1 + Math.sin(time * 9) * 0.1),
        centerHeight * centerLife * (1 + Math.sin(time * 7) * 0.12),
        centerWidth * centerLife * (1 + Math.sin(time * 9) * 0.1)
      );
      centerFlame.setLocalEulerAngles(
        0,
        15 + time * 14,
        Math.sin(time * 5) * 7
      );

      flameMaterial.opacity =
        0.4 * envelope * (0.85 + Math.random() * 0.15);
      hotMaterial.opacity =
        0.44 * envelope * (0.85 + Math.random() * 0.15);
      aoeLight.light!.intensity =
        1.4 * envelope * (0.7 + Math.random() * 0.3);
    };
    this.addEffect(root, materials, life, animate);
    animate(0, 0);
  }

  /**
   * Remolino de fuego: tres brazos espirales de llamas que giran alrededor del
   * centro. Las llamas exteriores son más altas y se inclinan ligeramente para
   * dar forma de embudo, mientras una columna central marca el eje.
   */
  private spawnFireWhirl(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.2, duration);
    const root = new pc.Entity('fire-whirl');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const ringMaterial = this.createMaterial(color, 0.3);
    const glowMaterial = this.createMaterial([255, 104, 30], 0.12);
    const flameMaterial = this.createFlameMaterial([255, 200, 140], 0.48);
    const hotMaterial = this.createFlameMaterial([255, 232, 185], 0.54);
    const materials = [ringMaterial, glowMaterial, flameMaterial, hotMaterial];

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.1, 0);
    ring.setLocalScale(radius * 2, 1, radius * 2);

    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.12, 0);
    glow.setLocalScale(radius * 0.7, radius * 0.16, radius * 0.7);

    this.spawnFlameParticles(root, {
      x: 0,
      y: 0.12,
      z: 0,
      extents: [radius * 0.6, 0.12, radius * 0.6],
      velocity: [0, 1.2, 0],
      velocityEnd: [0, 3, 0],
      radialSpeed: 0.15,
      radialSpeedEnd: 0.6,
      sizeStart: radius * 0.14,
      sizeMid: radius * 0.3,
      sizeEnd: radius * 0.1,
      lifetime: 0.5,
      rate: 1.4,
      numParticles: 110,
      localSpace: false
    });
    const light = this.createFireLight(root, 0, 1, 0, 1.4, radius * 2.3);

    const flames: {
      entity: pc.Entity;
      baseAngle: number;
      dist: number;
      baseWidth: number;
      baseHeight: number;
      phase: number;
      lean: number;
    }[] = [];

    const arms = 3;
    const perArm = 9;
    const spiralTurns = 1.35;
    for (let arm = 0; arm < arms; arm++) {
      for (let index = 0; index < perArm; index++) {
        const f = (index + 0.5) / perArm;
        const dist = radius * (0.1 + 0.8 * f);
        const baseAngle =
          (arm / arms) * Math.PI * 2 + f * spiralTurns * Math.PI * 2;
        const baseWidth = radius * (0.26 + 0.22 * f);
        const baseHeight = radius * (0.35 + 0.5 * f);
        const entity = this.createFlame(
          root,
          (index + arm) % 4 === 0 ? hotMaterial : flameMaterial,
          {
            x: Math.cos(baseAngle) * dist,
            y: 0,
            z: Math.sin(baseAngle) * dist,
            width: baseWidth,
            height: baseHeight,
            yaw: 90 - (baseAngle * 180) / Math.PI
          }
        );
        flames.push({
          entity,
          baseAngle,
          dist,
          baseWidth,
          baseHeight,
          phase: arm * 2.3 + index * 1.1,
          lean: 4 + f * 8
        });
      }
    }

    // Columna central más alta: marca el eje del remolino.
    const centerWidth = radius * 0.52;
    const centerHeight = radius * 0.95;
    const centerFlame = this.createFlame(root, hotMaterial, {
      x: 0,
      y: 0,
      z: 0,
      width: centerWidth,
      height: centerHeight,
      yaw: 0
    });

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeInTime = Math.min(0.22, life * 0.3);
      const fadeOutTime = Math.min(0.4, life * 0.35);
      const fadeIn = Math.min(1, time / fadeInTime);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / fadeOutTime));
      const envelope = Math.min(fadeIn, fadeOut);
      const spin = time * 2.8;
      const pulse = 0.5 + Math.sin(time * 8) * 0.2;

      ringMaterial.opacity = (0.16 + pulse * 0.12) * envelope;
      glowMaterial.opacity = (0.08 + pulse * 0.05) * envelope;
      light.light!.intensity = 1.4 * envelope * (0.7 + Math.random() * 0.3);

      const growIn = Math.min(0.24, life * 0.3);
      for (const flame of flames) {
        const delay = (flame.phase % 1) * growIn * 0.25;
        const localIn = Math.min(1, Math.max(0, (time - delay) / growIn));
        const scale = localIn * envelope;
        if (scale <= 0.001) {
          flame.entity.setLocalScale(0, 0, 0);
          continue;
        }
        // Cada llama avanza por su brazo espiral mientras el conjunto gira.
        const angle = flame.baseAngle + spin;
        const flicker = 0.85 + Math.sin(time * 9 + flame.phase) * 0.15;
        const sway = Math.sin(time * 6 + flame.phase) * 0.18;
        const widthNow = flame.baseWidth * scale * flicker;
        flame.entity.setLocalScale(
          widthNow,
          flame.baseHeight * scale * (1.05 + sway),
          widthNow
        );
        flame.entity.setLocalPosition(
          Math.cos(angle) * flame.dist,
          0,
          Math.sin(angle) * flame.dist
        );
        flame.entity.setLocalEulerAngles(
          flame.lean,
          90 - (angle * 180) / Math.PI,
          Math.sin(time * 4 + flame.phase) * 10
        );
      }

      const centerIn = Math.min(1, time / Math.min(0.3, life * 0.4));
      const centerScale = centerIn * envelope;
      centerFlame.setLocalScale(
        centerWidth * centerScale * (1 + Math.sin(time * 7) * 0.1),
        centerHeight * centerScale * (1 + Math.sin(time * 5) * 0.12),
        centerWidth * centerScale * (1 + Math.sin(time * 7) * 0.1)
      );
      centerFlame.setLocalEulerAngles(6, time * 60, Math.sin(time * 5) * 8);

      flameMaterial.opacity =
        0.44 * envelope * (0.85 + Math.random() * 0.15);
      hotMaterial.opacity =
        0.5 * envelope * (0.85 + Math.random() * 0.15);
    };
    this.addEffect(root, materials, life, animate);
    animate(0, 0);
  }

  /** Estela del desplazamiento de un dash. */
  spawnDash(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    color: readonly [number, number, number]
  ): void {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const material = this.createMaterial(color, 0.7);
    const entity = this.createEntity(this.boxMesh, [material]);
    entity.setPosition((x1 + x2) / 2, 0.18, (z1 + z2) / 2);
    entity.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    entity.setLocalScale(0.8, 0.12, length);

    this.addEffect(entity, [material], 0.35, (t) => {
      material.opacity = 0.7 * (1 - t);
    });
  }

  /** Aura circular para buffs, escudos y reapariciones. */
  spawnBuff(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number
  ): void {
    const material = this.createMaterial(color, 0.8);
    const entity = this.createEntity(this.torusMesh, [material]);
    entity.setPosition(x, 0.15, z);

    this.addEffect(entity, [material], 0.65, (t) => {
      const scale = Math.max(0.3, radius * 2) * (0.35 + 0.85 * t);
      entity.setLocalScale(scale, 1, scale);
      entity.setPosition(x, 0.15 + t * 0.8, z);
      material.opacity = 0.8 * (1 - t);
    });
  }

  /** Curación de Mew: anillos rosas que suben y motas que se elevan y se apagan. */
  spawnHeal(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number
  ): void {
    const root = new pc.Entity('heal-burst');
    root.setPosition(x, 0.04, z);
    this.app.root.addChild(root);

    const ringMaterial = this.createMaterial(color, 0.65);
    const coreMaterial = this.createMaterial([255, 232, 250], 0.85);
    const sparkMaterial = this.createMaterial([255, 190, 238], 0.95);
    const materials = [ringMaterial, coreMaterial, sparkMaterial];
    const sizeScale = Math.max(0.8, radius);

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.55, 0);
    core.setLocalScale(0.3, 0.3, 0.3);

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.08 + index * 0.32, 0);
      ring.setLocalScale(0.5, 1, 0.5);
      rings.push(ring);
    }

    const sparks: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      lift: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 14; index++) {
      const angle = (index / 14) * Math.PI * 2 + Math.random() * 0.4;
      const size = 0.06 + Math.random() * 0.06;
      const spark = this.createEntity(this.sphereMesh, [sparkMaterial], root);
      spark.setLocalScale(size, size, size);
      sparks.push({
        entity: spark,
        angle,
        distance: 0.15 + Math.random() * 0.35,
        lift: 0.7 + Math.random() * 0.8,
        size
      });
    }

    this.addEffect(root, materials, 0.85, (t) => {
      const coreScale = 0.3 + t * 0.35;
      core.setLocalScale(coreScale, coreScale, coreScale);
      core.setLocalPosition(0, 0.55 + t * 0.35, 0);
      coreMaterial.opacity = 0.85 * (1 - t);

      rings.forEach((ring, index) => {
        const scale = sizeScale * (0.5 + t * (1.55 + index * 0.35));
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalPosition(0, 0.08 + index * 0.32 + t * 0.5, 0);
        ringMaterial.opacity = 0.65 * (1 - t) * (index === 0 ? 1 : 0.7);
      });

      for (const spark of sparks) {
        const spread = (spark.distance + t * 0.55) * sizeScale;
        spark.entity.setLocalPosition(
          Math.cos(spark.angle) * spread,
          0.2 + t * spark.lift,
          Math.sin(spark.angle) * spread
        );
        const fade = Math.sin(Math.min(1, t * 1.15) * Math.PI);
        const size = spark.size * (0.6 + fade * 0.9);
        spark.entity.setLocalScale(size, size, size);
      }
      sparkMaterial.opacity = 0.95 * (1 - t * 0.9);
    });
  }

  /** Impacto de Planta: núcleo claro, hojas despedidas y anillo verde. */
  spawnGrassBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    _effectiveness: number
  ): void {
    const root = new pc.Entity('grass-burst');
    root.setPosition(x, 0.04, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([236, 255, 208], 0.95);
    const ringMaterial = this.createMaterial(color, 0.5);
    const leafMaterial = this.createLeafMaterial(color, 0.95);
    const hotMaterial = this.createLeafMaterial([242, 255, 214], 0.95);
    const materials = [coreMaterial, ringMaterial, leafMaterial, hotMaterial];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.68, 0);
    core.setLocalScale(0.28, 0.28, 0.28);

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.12, 0);
    ring.setLocalScale(0.5, 1, 0.5);

    this.spawnLeafParticles(
      root,
      {
        x: 0,
        y: 0.5,
        z: 0,
        extents: [0.16, 0.18, 0.16],
        velocity: [0, 1.4, 0],
        velocityEnd: [0, 2.2, 0],
        radialSpeed: 0.7,
        radialSpeedEnd: 1.7,
        sizeStart: 0.18,
        sizeMid: 0.3,
        sizeEnd: 0.16,
        lifetime: 0.42,
        rate: 0.02,
        numParticles: 26,
        localSpace: false
      },
      color
    );

    const leaves: {
      entity: pc.Entity;
      angle: number;
      dist: number;
      spin: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 11; index++) {
      const angle = Math.random() * Math.PI * 2;
      const size = 0.2 + Math.random() * 0.16;
      const entity = this.createLeaf(
        root,
        index % 3 === 0 ? hotMaterial : leafMaterial,
        {
          x: Math.cos(angle) * 0.16,
          y: 0.55,
          z: Math.sin(angle) * 0.16,
          width: size,
          height: size * 1.75,
          yaw: Math.random() * 360,
          roll: Math.random() * 360
        }
      );
      leaves.push({
        entity,
        angle,
        dist: 0.55 + Math.random() * 0.55,
        spin: 140 + Math.random() * 220,
        size
      });
    }

    this.addEffect(root, materials, 0.55, (t) => {
      const scale = 0.28 + t * 0.95;
      core.setLocalScale(scale, scale, scale);
      coreMaterial.opacity = 0.95 * (1 - t);

      const ringScale = 0.5 + t * 1.35;
      ring.setLocalScale(ringScale, 1, ringScale);
      ringMaterial.opacity = 0.5 * (1 - t);

      for (const leaf of leaves) {
        const distance = leaf.dist * (0.2 + t);
        leaf.entity.setLocalPosition(
          Math.cos(leaf.angle) * distance,
          0.55 + t * 0.9 - t * t * 1.1,
          Math.sin(leaf.angle) * distance
        );
        leaf.entity.setLocalEulerAngles(
          t * 180,
          leaf.spin * t,
          leaf.spin * 0.7 * t
        );
        const fade = Math.max(0, 1 - t * 1.15);
        leaf.entity.setLocalScale(
          leaf.size * fade,
          leaf.size * 1.75 * fade,
          leaf.size * fade
        );
      }
      leafMaterial.opacity = 0.95 * (1 - t);
      hotMaterial.opacity = 0.95 * (1 - t);
    });
  }

  /** Impacto psíquico: núcleo blanco, anillo violeta y esquirlas radiales. */
  spawnPsychicBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    _effectiveness: number
  ): void {
    const root = new pc.Entity('psychic-burst');
    root.setPosition(x, 0.04, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([255, 236, 255], 0.95);
    const ringMaterial = this.createMaterial(color, 0.55);
    const shardMaterial = this.createMaterial([242, 190, 255], 0.92);
    const materials = [coreMaterial, ringMaterial, shardMaterial];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.68, 0);
    core.setLocalScale(0.26, 0.26, 0.26);

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.12, 0);
    ring.setLocalScale(0.5, 1, 0.5);

    const shards: {
      entity: pc.Entity;
      angle: number;
      lift: number;
      size: number;
      spin: number;
    }[] = [];
    for (let index = 0; index < 16; index++) {
      const angle = (index / 16) * Math.PI * 2 + Math.random() * 0.25;
      const size = 0.09 + Math.random() * 0.09;
      const shard = this.createEntity(this.sphereMesh, [shardMaterial], root);
      shard.setLocalPosition(
        Math.cos(angle) * 0.2,
        0.6,
        Math.sin(angle) * 0.2
      );
      shard.setLocalScale(size, size, size);
      shards.push({
        entity: shard,
        angle,
        lift: 0.6 + Math.random() * 1.1,
        size,
        spin: 120 + Math.random() * 260
      });
    }

    this.addEffect(root, materials, 0.55, (t) => {
      const scale = 0.26 + t * 1.05;
      core.setLocalScale(scale, scale, scale);
      core.setLocalPosition(0, 0.68 + t * 0.3, 0);
      coreMaterial.opacity = 0.95 * (1 - t);

      const ringScale = 0.5 + t * 1.7;
      ring.setLocalScale(ringScale, 1, ringScale);
      ringMaterial.opacity = 0.55 * (1 - t);

      for (const shard of shards) {
        const distance = 0.2 + t * 1.5;
        shard.entity.setLocalPosition(
          Math.cos(shard.angle) * distance,
          0.6 + t * shard.lift - t * t * shard.lift * 1.15,
          Math.sin(shard.angle) * distance
        );
        shard.entity.setLocalEulerAngles(
          t * shard.spin,
          t * shard.spin * 0.7,
          t * shard.spin * 0.45
        );
        const fade = Math.max(0, 1 - t * 1.2);
        shard.entity.setLocalScale(
          shard.size * fade,
          shard.size * fade,
          shard.size * fade
        );
      }
      shardMaterial.opacity = 0.92 * (1 - t);
    });
  }

  /** Impacto de Veneno: orbe turbio con burbujas que suben y anillo violeta. */
  spawnPoisonBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    _effectiveness: number
  ): void {
    const root = new pc.Entity('poison-burst');
    root.setPosition(x, 0.04, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial(color, 0.9);
    const ringMaterial = this.createMaterial([190, 116, 206], 0.5);
    const puffMaterial = this.createMaterial([232, 186, 244], 0.24);
    const materials = [coreMaterial, ringMaterial, puffMaterial];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.68, 0);
    core.setLocalScale(0.34, 0.34, 0.34);

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.12, 0);
    ring.setLocalScale(0.5, 1, 0.5);

    this.spawnSporeParticles(
      root,
      {
        x: 0,
        y: 0.55,
        z: 0,
        extents: [0.22, 0.2, 0.22],
        velocity: [0, 0.9, 0],
        velocityEnd: [0, 1.8, 0],
        radialSpeed: 0.5,
        radialSpeedEnd: 1.3,
        sizeStart: 0.16,
        sizeMid: 0.28,
        sizeEnd: 0.12,
        lifetime: 0.45,
        rate: 0.02,
        numParticles: 28,
        localSpace: false
      },
      color
    );

    const bubbles: {
      entity: pc.Entity;
      baseX: number;
      baseZ: number;
      size: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2 + Math.random();
      const size = 0.16 + Math.random() * 0.14;
      const bubble = this.createEntity(this.sphereMesh, [puffMaterial], root);
      bubble.setLocalScale(size, size, size);
      bubbles.push({
        entity: bubble,
        baseX: Math.cos(angle) * 0.28,
        baseZ: Math.sin(angle) * 0.28,
        size,
        delay: Math.random() * 0.2
      });
    }

    this.addEffect(root, materials, 0.5, (t) => {
      const scale = 0.34 + t * 1.05;
      core.setLocalScale(scale, scale, scale);
      coreMaterial.opacity = 0.9 * (1 - t);

      const ringScale = 0.5 + t * 1.4;
      ring.setLocalScale(ringScale, 1, ringScale);
      ringMaterial.opacity = 0.5 * (1 - t);
      puffMaterial.opacity = 0.26 * (1 - t);

      for (const bubble of bubbles) {
        const local = Math.max(0, (t - bubble.delay) / (1 - bubble.delay));
        bubble.entity.setLocalPosition(
          bubble.baseX * (1 + local * 0.9),
          0.5 + local * 0.9,
          bubble.baseZ * (1 + local * 0.9)
        );
        const fade = Math.max(0, 1 - local);
        bubble.entity.setLocalScale(
          bubble.size * (0.7 + local * 0.6) * fade,
          bubble.size * (0.7 + local * 0.6) * fade,
          bubble.size * (0.7 + local * 0.6) * fade
        );
      }
    });
  }

  /** Impacto de un golpe. `effectiveness` tiñe el destello. */
  spawnHit(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const tint: [number, number, number] =
      effectiveness > 1
        ? [255, 244, 160]
        : effectiveness < 1
          ? [130, 148, 170]
          : [color[0], color[1], color[2]];
    const material = this.createMaterial(tint, 0.95);
    const entity = this.createEntity(this.sphereMesh, [material]);
    entity.setPosition(x, 0.65, z);

    this.addEffect(entity, [material], 0.3, (t) => {
      const scale = 0.25 + t * (effectiveness > 1 ? 1.35 : 0.85);
      entity.setLocalScale(scale, scale, scale);
      entity.setPosition(x, 0.65 + t * 0.15, z);
      material.opacity = 0.95 * (1 - t);
    });
  }

  /** Explosión eléctrica pequeña: núcleo, halo, arcos cortos y anillo. */
  spawnElectricBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const root = new pc.Entity('electric-burst');
    root.setPosition(x, 0, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([255, 255, 225], 0.95);
    const glowMaterial = this.createMaterial(color, 0.5);
    const arcMaterial = this.createMaterial([255, 245, 170], 0.9);
    const ringMaterial = this.createMaterial(color, 0.45);
    const materials = [coreMaterial, glowMaterial, arcMaterial, ringMaterial];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.65, 0);
    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.65, 0);

    const arcs: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const mesh = createLightningMesh(
        this.device,
        0.9,
        0.025,
        4,
        2000 + index * 3571
      );
      const arc = this.createEntity(mesh, [arcMaterial], root);
      arc.setLocalPosition(0, 0.65, 0);
      arc.setLocalEulerAngles(index * 70, index * 110, index * 45);
      arcs.push(arc);
    }

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.08, 0);

    this.addEffect(root, materials, 0.32, (t) => {
      const scale = 0.15 + t * (effectiveness > 1 ? 0.95 : 0.7);
      core.setLocalScale(scale, scale, scale);
      const glowScale = 0.4 + t * (effectiveness > 1 ? 1.6 : 1.2);
      glow.setLocalScale(glowScale, glowScale, glowScale);
      coreMaterial.opacity = 0.95 * (1 - t);
      glowMaterial.opacity = 0.5 * (1 - t);
      arcMaterial.opacity = 0.9 * (1 - t);
      const ringScale = 0.5 + t * 1.1;
      ring.setLocalScale(ringScale, 1, ringScale);
      ringMaterial.opacity = 0.45 * (1 - t);

      for (let index = 0; index < arcs.length; index++) {
        arcs[index].setLocalEulerAngles(
          (index * 70 + t * 220) % 360,
          (index * 110 + t * 300) % 360,
          (index * 45 + t * 180) % 360
        );
      }
    });
  }

  /** Explosión de fuego: núcleo, halo, llamas que suben y anillo en el suelo. */
  spawnFireBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const root = new pc.Entity('fire-burst');
    root.setPosition(x, 0, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([255, 250, 220], 0.9);
    const glowMaterial = this.createMaterial(color, 0.4);
    const flameMaterial = this.createFlameMaterial([255, 255, 255], 0.55);
    const hotMaterial = this.createFlameMaterial([255, 246, 214], 0.6);
    const sparkMaterial = this.createMaterial([255, 205, 120], 0.95);
    const ringMaterial = this.createMaterial(color, 0.4);
    const materials = [
      coreMaterial,
      glowMaterial,
      flameMaterial,
      hotMaterial,
      sparkMaterial,
      ringMaterial
    ];

    this.spawnFlameParticles(root, {
      x: 0,
      y: 0.3,
      z: 0,
      extents: [0.12, 0.12, 0.12],
      velocity: [0, 0.8, 0],
      velocityEnd: [0, 1.8, 0],
      radialSpeed: 1.4,
      radialSpeedEnd: 2.8,
      sizeStart: 0.16,
      sizeMid: 0.36,
      sizeEnd: 0.06,
      lifetime: 0.38,
      rate: 1.5,
      numParticles: 52,
      localSpace: false,
      preWarm: false
    });
    const burstLight = this.createFireLight(root, 0, 0.55, 0, 1.1, 4);

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.62, 0);
    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.62, 0);

    const flames: {
      entity: pc.Entity;
      offsetX: number;
      offsetZ: number;
      baseWidth: number;
      baseHeight: number;
      yaw: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 5; index++) {
      const angle = (index / 5) * Math.PI * 2 + 0.4;
      const dist = 0.1 + ((index * 13) % 10) / 10 * 0.16;
      const baseWidth = 0.28 + ((index * 17) % 10) / 10 * 0.16;
      const baseHeight = 0.55 + ((index * 29) % 10) / 10 * 0.35;
      const yaw = (index * 53) % 360;
      const entity = this.createFlame(
        root,
        index % 3 === 0 ? hotMaterial : flameMaterial,
        {
          x: Math.cos(angle) * dist,
          y: 0.08,
          z: Math.sin(angle) * dist,
          width: baseWidth,
          height: baseHeight,
          yaw
        }
      );
      flames.push({
        entity,
        offsetX: Math.cos(angle) * dist,
        offsetZ: Math.sin(angle) * dist,
        baseWidth,
        baseHeight,
        yaw,
        phase: index * 1.4
      });
    }

    const sparks: {
      entity: pc.Entity;
      dirX: number;
      dirZ: number;
      speed: number;
      lift: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const angle = (index / 7) * Math.PI * 2 + 0.9;
      const spark = this.createEntity(this.sphereMesh, [sparkMaterial], root);
      const size = 0.05 + ((index * 11) % 10) / 10 * 0.05;
      spark.setLocalScale(size, size, size);
      sparks.push({
        entity: spark,
        dirX: Math.cos(angle),
        dirZ: Math.sin(angle),
        speed: 0.8 + ((index * 7) % 10) / 10 * 1.1,
        lift: 1.4 + ((index * 3) % 10) / 10 * 1.2,
        phase: index * 1.9
      });
    }

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.08, 0);

    const animate = (t: number): void => {
      const boost = effectiveness > 1 ? 1.35 : 1;
      const scale = (0.18 + t * 0.95) * boost;
      core.setLocalScale(scale, scale, scale);
      const glowScale = (0.45 + t * 1.7) * boost;
      glow.setLocalScale(glowScale, glowScale, glowScale);
      coreMaterial.opacity = 0.9 * (1 - t);
      glowMaterial.opacity = 0.4 * (1 - t);

      for (const flame of flames) {
        const life =
          Math.min(1, t / 0.12) *
          (1 - Math.max(0, (t - 0.3) / 0.7));
        const sway = Math.sin(t * 21 + flame.phase) * 0.2;
        const scaleNow = Math.max(0.001, life);
        flame.entity.setLocalScale(
          flame.baseWidth * scaleNow * (1 + sway * 0.3),
          flame.baseHeight * scaleNow * (1.05 + sway),
          flame.baseWidth * scaleNow * (1 + sway * 0.3)
        );
        flame.entity.setLocalPosition(
          flame.offsetX * (1 + t * 0.4),
          0.08 + t * 1.05,
          flame.offsetZ * (1 + t * 0.4)
        );
        flame.entity.setLocalEulerAngles(
          0,
          flame.yaw + t * 70,
          Math.sin(t * 18 + flame.phase) * 10
        );
      }

      for (const spark of sparks) {
        const travel = t * 0.42;
        const y = spark.lift * travel - 4.2 * travel * travel;
        spark.entity.setLocalPosition(
          spark.dirX * spark.speed * travel,
          Math.max(0.03, 0.35 + y),
          spark.dirZ * spark.speed * travel
        );
        const sparkLife = Math.max(0, 1 - t) * (0.8 + Math.sin(t * 30 + spark.phase) * 0.2);
        spark.entity.setLocalScale(
          sparkLife * 0.1,
          sparkLife * 0.1,
          sparkLife * 0.1
        );
      }
      sparkMaterial.opacity = 0.9 * (1 - t);

      flameMaterial.opacity = 0.5 * (1 - t) * (0.85 + Math.random() * 0.15);
      hotMaterial.opacity = 0.55 * (1 - t) * (0.85 + Math.random() * 0.15);
      burstLight.light!.intensity =
        1.1 * (1 - t) * (0.65 + Math.random() * 0.35);

      const ringScale = (0.5 + t * 1.15) * boost;
      ring.setLocalScale(ringScale, 1, ringScale);
      ringMaterial.opacity = 0.4 * (1 - t);
    };
    this.addEffect(root, materials, 0.45, animate);
    animate(0);
  }

  update(dt: number): void {
    // Marcas de área: se animan y se autodestruyen al llenarse.
    for (const telegraph of [...this.telegraphs]) {
      telegraph.elapsed += dt;
      const progress = Math.min(1, telegraph.elapsed / telegraph.duration);
      telegraph.update(progress, telegraph.elapsed);
      for (const material of telegraph.materials) material.update();
      // Pequeña prórroga: el lanzamiento la retira explícitamente al impactar;
      // esto solo evita que se quede viva si algo lo interrumpe sin cancelar.
      if (telegraph.elapsed >= telegraph.duration + 0.1) {
        this.disposeTelegraph(telegraph);
      }
    }

    for (let index = this.effects.length - 1; index >= 0; index--) {
      const effect = this.effects[index];
      effect.elapsed += dt;
      const t = Math.min(1, effect.elapsed / effect.duration);
      effect.update(t, dt);
      // `opacity` es un uniforme del material: sin update() el fundido no
      // llega a la GPU igual que ocurre con los offsets de textura del sprite.
      for (const material of effect.materials) material.update();
      if (effect.elapsed < effect.duration) continue;

      effect.entity.destroy();
      for (const material of effect.materials) material.destroy();
      this.effects.splice(index, 1);
    }
  }

  /** Elimina todos los efectos activos. */
  clear(): void {
    for (const telegraph of [...this.telegraphs]) {
      this.disposeTelegraph(telegraph);
    }

    for (const effect of this.effects) {
      effect.entity.destroy();
      for (const material of effect.materials) material.destroy();
    }
    this.effects.length = 0;

    for (const visual of this.projectiles) {
      visual.entity.destroy();
      for (const material of visual.materials) material.destroy();
    }
    this.projectiles.clear();
  }

  destroy(): void {
    this.clear();
    this.sphereMesh.destroy();
    this.boxMesh.destroy();
    this.torusMesh.destroy();
    this.flameMesh.destroy();
    this.flameTexture.destroy();
    this.leafMesh.destroy();
    this.leafTexture.destroy();
    this.sporeTexture.destroy();
    this.discMesh.destroy();
    this.dashRingMesh.destroy();
  }
}
