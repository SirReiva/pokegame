import * as pc from 'playcanvas';
import type { BeamStyle } from '../../abilities';
import { createDustCanvas, createFlameCanvas, createFrostCanvas, createLeafParticleCanvas, createPollenCanvas, textureFromCanvas } from '../../textures';
import type { FxHandle, FxLayerResolver, TelegraphOwner } from '../../core/ports/fx';
import type { ActiveEffect, FlameParticleOptions, FxAnchors, GroundTelegraph, ProjectileVisual } from './fxGeometry';
import { MATERIAL_POOL_LIMIT, TELEGRAPH_WALL_OPACITY, createArcBandMesh, createCrossQuadMesh, createCycloneArmMesh, createDashRingMesh, createDiscMesh, createIceCrystalMesh, createShurikenMesh, createWaterJetMesh, createWindBladeMesh, sameLayers } from './fxGeometry';
import { EffectParticleBatch } from './effectParticleBatch';
import { updateMaterialIfChanged } from './materialUpdates';
import { WorldTrailBatch } from './worldTrailBatch';

export class FxRuntime {
public readonly app: pc.AppBase;
  public readonly layerId: number;
  /** Resuelve las capas de las vistas que pueden ver un efecto. */
  public readonly resolveLayers: FxLayerResolver;
  /** Capa temporal para la precarga de shaders; `null` en partida normal. */
  public warmupLayer: number | null = null;
  /** Anclas del efecto que se está construyendo, si las define su `spawn`. */
  public pendingAnchors: FxAnchors | null = null;
  /** Acumulador para no repetir el cálculo de niebla de todos los FX por frame. */
  public visibilityTimer = 0;
  public readonly device: pc.GraphicsDevice;
  public readonly effects: ActiveEffect[] = [];
  /**
   * Emisores de partículas analíticos de los efectos estáticos. Se actualizan
   * con un contador compartido, sin una pasada de simulación por emisor.
   */
  public readonly particleBatches = new Set<EffectParticleBatch | WorldTrailBatch>();
  public readonly projectiles = new Set<ProjectileVisual>();
  public readonly sphereMesh: pc.Mesh;
  public readonly boxMesh: pc.Mesh;
  public readonly torusMesh: pc.Mesh;
  /** Aro más fino para los bucles psíquicos, que necesitan leerse como cintas. */
  public readonly psychicRingMesh: pc.Mesh;
  /** Textura de lengua de fuego y malla de tres quads cruzados. */
  public readonly flameTexture: pc.Texture;
  public readonly flameMesh: pc.Mesh;
  /** Textura de hoja y de espora para los efectos de Planta/Veneno. */
  public readonly leafTexture: pc.Texture;
  public readonly sporeTexture: pc.Texture;
  /** Rocío azulado para las partículas de agua. */
  public readonly waterTexture: pc.Texture;
  public readonly leafMesh: pc.Mesh;
  /** Mallas de la marca de área y marcas activas. */
  public readonly discMesh: pc.Mesh;
  public readonly dashRingMesh: pc.Mesh;
  /** Variantes 3D del chorro de agua: cambian la fase de la corona ondulada. */
  public readonly waterJetMeshes: pc.Mesh[];
  /** Variantes 3D de los brazos espirales del huracán de `Ciclón`. */
  public readonly cycloneArmMeshes: pc.Mesh[];
  /** Bipirámide compartida por proyectiles, impactos, haces y áreas de hielo. */
  public readonly iceCrystalMesh: pc.Mesh;
  /** Cono facetado compartido por los efectos de Roca y Tierra. */
  public readonly rockSpikeMesh: pc.Mesh;
  /** Roca baja y facetada para las lluvias de piedras. */
  public readonly rockChunkMesh: pc.Mesh;
  /** Textura de polvo para las partículas de roca y tierra. */
  public readonly dustTexture: pc.Texture;
  public readonly telegraphs = new Set<GroundTelegraph>();
  /**
   * Mallas unitarias reutilizables (rayos, aspas). Se crean una vez y se
   * escalan por entidad, así un casteo no genera geometría ni sube buffers.
   */
  public readonly meshCache = new Map<string, pc.Mesh>();
  /**
   * Materiales liberados por efectos terminados, agrupados por fábrica. Evita
   * crear un `StandardMaterial` nuevo (y sus bind groups) en cada casteo.
   */
  public readonly materialPools = new Map<string, pc.StandardMaterial[]>();
  /** Fábrica de origen de cada material, para devolverlo a su pool. */
  public readonly materialKinds = new WeakMap<pc.StandardMaterial, string>();
  /**
   * Duración del efecto visual de cada haz. El carril del suelo se mantiene
   * vivo lo que dura el propio haz para que ambos desaparezcan a la vez.
   */
  public readonly beamDurations: Record<BeamStyle, number> = {
    electric: 0.34,
    fire: 0.45,
    grass: 0.46,
    psychic: 0.42,
    water: 0.55,
    dark: 0.48,
    ghost: 0.48,
    air: 0.46,
    ice: 0.48,
    rock: 0.62
  };

constructor(
    app: pc.AppBase,
    layerId: number,
    resolveLayers: FxLayerResolver = () => [layerId]
  ) {
    this.app = app;
    this.layerId = layerId;
    this.resolveLayers = resolveLayers;
    this.device = app.graphicsDevice;
    this.sphereMesh = pc.Mesh.fromGeometry(
      this.device,
      new pc.SphereGeometry({ radius: 0.5 })
    );
    this.boxMesh = pc.Mesh.fromGeometry(
      this.device,
      new pc.BoxGeometry({ halfExtents: new pc.Vec3(0.5, 0.5, 0.5) })
    );
    this.torusMesh = pc.Mesh.fromGeometry(
      this.device,
      new pc.TorusGeometry({ ringRadius: 0.5, tubeRadius: 0.05 })
    );
    this.psychicRingMesh = pc.Mesh.fromGeometry(
      this.device,
      new pc.TorusGeometry({ ringRadius: 0.5, tubeRadius: 0.022 })
    );
    this.waterJetMeshes = [0, 1, 2, 3].map((variant) =>
      createWaterJetMesh(this.device, variant * 1.7)
    );
    this.cycloneArmMeshes = [0, 1, 2].map((variant) =>
      createCycloneArmMesh(this.device, variant * 1.9)
    );
    this.flameTexture = textureFromCanvas(
      this.device,
      createFlameCanvas(),
      {
        name: 'combat-flame',
        repeat: true,
        mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
        magFilter: pc.FILTER_LINEAR
      }
    );
    this.flameMesh = createCrossQuadMesh(this.device);
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
    this.waterTexture = textureFromCanvas(this.device, createFrostCanvas(48), {
      name: 'combat-water',
      mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
      magFilter: pc.FILTER_LINEAR
    });
    this.leafMesh = createCrossQuadMesh(this.device);

    // PlayCanvas destruye una malla cuando su último MeshInstance desaparece.
    // Estas mallas son compartidas por muchos efectos, así que reservamos una
    // referencia propia para que sigan vivas entre proyectiles y golpes.
    this.sphereMesh.incRefCount();
    this.boxMesh.incRefCount();
    this.torusMesh.incRefCount();
    this.psychicRingMesh.incRefCount();
    this.flameMesh.incRefCount();
    for (const mesh of this.waterJetMeshes) mesh.incRefCount();
    for (const mesh of this.cycloneArmMeshes) mesh.incRefCount();
    this.leafMesh.incRefCount();
    this.discMesh = createDiscMesh(this.device);
    this.dashRingMesh = createDashRingMesh(this.device);
    this.iceCrystalMesh = createIceCrystalMesh(this.device);
    this.rockSpikeMesh = pc.Mesh.fromGeometry(
      this.device,
      new pc.ConeGeometry({
        baseRadius: 0.5,
        peakRadius: 0.04,
        height: 1,
        heightSegments: 1,
        capSegments: 5
      })
    );
    this.rockChunkMesh = pc.Mesh.fromGeometry(
      this.device,
      new pc.SphereGeometry({
        radius: 0.5,
        latitudeBands: 3,
        longitudeBands: 4
      })
    );
    this.dustTexture = textureFromCanvas(this.device, createDustCanvas(64), {
      name: 'combat-dust',
      mipmaps: true,
      minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
      magFilter: pc.FILTER_LINEAR
    });
    this.discMesh.incRefCount();
    this.dashRingMesh.incRefCount();
    this.iceCrystalMesh.incRefCount();
    this.rockSpikeMesh.incRefCount();
    this.rockChunkMesh.incRefCount();


  }


  public createMaterial(
    color: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = this.acquireMaterial('basic');
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

  /** Cambia el color emisivo de un material ya creado, sin tocar su opacidad. */
  public setMaterialColor(
    material: pc.StandardMaterial,
    color: readonly [number, number, number]
  ): void {
    material.emissive.set(
      color[0] / 255,
      color[1] / 255,
      color[2] / 255
    );
    material.update();
  }

  /**
   * Material de la pared de los telegraphs. Usa mezcla normal (no aditiva)
   * para que la pared tenga opacidad propia y se lea como un volumen; sin
   * escritura de profundidad para que no oculte lo que queda detrás.
   */
  public createTelegraphWallMaterial(
    color: readonly [number, number, number],
    opacity = TELEGRAPH_WALL_OPACITY
  ): pc.StandardMaterial {
    const material = this.acquireMaterial('telegraph-wall');
    material.useLighting = false;
    material.useSkybox = false;
    material.useFog = true;
    material.diffuse = new pc.Color(0, 0, 0);
    material.emissive = new pc.Color(
      color[0] / 255,
      color[1] / 255,
      color[2] / 255
    );
    material.emissiveIntensity = 0.85;
    material.opacity = opacity;
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = pc.CULLFACE_NONE;
    material.update();
    return material;
  }

  /**
   * Material translúcido para el escudo esférico. Usa mezcla normal para el
   * volumen y aditiva para el halo exterior.
   */
  public createShieldMaterial(
    color: readonly [number, number, number],
    opacity: number,
    blendType: number
  ): pc.StandardMaterial {
    const material = this.acquireMaterial('shield');
    material.useLighting = false;
    material.useSkybox = false;
    material.useFog = true;
    material.diffuse = new pc.Color(0, 0, 0);
    material.emissive = new pc.Color(
      color[0] / 255,
      color[1] / 255,
      color[2] / 255
    );
    material.emissiveIntensity = 1.05;
    material.opacity = opacity;
    material.blendType = blendType;
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
  public createFlameMaterial(
    tint: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = this.acquireMaterial('flame');
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
    material.emissiveMapTiling.set(1, 1);
    material.emissiveIntensity = 1.12;
    material.opacityMap = this.flameTexture;
    material.opacityMapChannel = 'a';
    material.opacityMapTiling.set(1, 1);
    material.opacity = opacity;
    material.blendType = pc.BLEND_ADDITIVEALPHA;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = pc.CULLFACE_NONE;
    material.update();
    return material;
  }

  /** Material de hoja: silueta recortada por alfa, con tinte verde. */
  public createLeafMaterial(
    tint: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = this.acquireMaterial('leaf');
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

  /**
   * Material de agua: mezcla normal para que el azul se lea sobre cualquier
   * terreno (el aditivo se blanquea con el suelo claro). Sin texturas: la
   * silueta la dan las esferas y anillos.
   */
  public createWaterMaterial(
    tint: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = this.acquireMaterial('water');
    material.useLighting = false;
    material.useSkybox = false;
    material.useFog = true;
    material.diffuse = new pc.Color(0, 0, 0);
    material.emissive = new pc.Color(
      tint[0] / 255,
      tint[1] / 255,
      tint[2] / 255
    );
    material.emissiveIntensity = 1.05;
    material.opacity = opacity;
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = pc.CULLFACE_NONE;
    material.update();
    return material;
  }

  /**
   * Material con color por vértice y mezcla normal. Lo usan las mallas 3D de
   * agua (chorros de `Marea`) y de nubes (brazos del huracán de `Ciclón`); la
   * malla ya trae el degradado y el material solo controla la opacidad.
   */
  public createVertexColorMaterial(
    opacity: number,
    blendType: number = pc.BLEND_NORMAL
  ): pc.StandardMaterial {
    const material = this.acquireMaterial('vertex-color');
    material.useLighting = false;
    material.useSkybox = false;
    material.useFog = true;
    material.diffuse = new pc.Color(0, 0, 0);
    material.emissive = new pc.Color(1, 1, 1);
    material.emissiveIntensity = 1.05;
    material.diffuseVertexColor = true;
    material.emissiveVertexColor = true;
    material.opacity = opacity;
    material.blendType = blendType;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = pc.CULLFACE_NONE;
    material.update();
    return material;
  }

  /**
   * Material de aura: reutiliza la mezcla normal del agua para que el azul no
   * se lave sobre arena o hierba clara. La silueta la dan las esferas, los
   * anillos y los destellos.
   */
  public createAuraMaterial(
    tint: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    return this.createWaterMaterial(tint, opacity);
  }

  /**
   * Material de cristal de hielo: iluminado para que cada faceta reciba una
   * luz distinta y el prisma se lea en 3D. La emisión azul evita que el cristal
   * desaparezca en zonas de sombra y la mezcla normal conserva el color sobre
   * terreno claro.
   */
  public createIceCrystalMaterial(
    tint: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = this.acquireMaterial('ice');
    material.useLighting = true;
    material.useSkybox = false;
    material.useFog = true;
    material.diffuse = new pc.Color(
      tint[0] / 255,
      tint[1] / 255,
      tint[2] / 255
    );
    material.emissive = new pc.Color(
      (tint[0] / 255) * 0.42,
      (tint[1] / 255) * 0.42,
      (tint[2] / 255) * 0.42
    );
    material.emissiveIntensity = 0.9;
    // El color de cada faceta viene de la malla: claro en un lado, azul
    // profundo en el otro, como un cristal tallado.
    material.diffuseVertexColor = true;
    material.emissiveVertexColor = true;
    material.opacity = opacity;
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = pc.CULLFACE_NONE;
    material.metalness = 0.1;
    material.gloss = 0.55;
    material.update();
    return material;
  }

  /**
   * Material de roca: iluminado para que las facetas del cono reciban luz
   * distinta y la piedra no se vea como una silueta plana. La emisión tenue
   * mantiene el volumen en zonas de sombra y la mezcla normal conserva el
   * marrón sobre hierba, arena o asfalto.
   */
  public createRockMaterial(
    tint: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = this.acquireMaterial('rock');
    material.useLighting = true;
    material.useSkybox = false;
    material.useFog = true;
    material.diffuse = new pc.Color(
      tint[0] / 255,
      tint[1] / 255,
      tint[2] / 255
    );
    material.emissive = new pc.Color(
      (tint[0] / 255) * 0.22,
      (tint[1] / 255) * 0.22,
      (tint[2] / 255) * 0.22
    );
    material.emissiveIntensity = 0.75;
    material.opacity = opacity;
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = pc.CULLFACE_NONE;
    material.metalness = 0;
    material.gloss = 0.12;
    material.update();
    return material;
  }

  /** Crea una hoja cruzada con la base en `position`. */
  public createLeaf(
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
  public createSporeMaterial(
    tint: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = this.acquireMaterial('spore');
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
  public createFlame(
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
   * Paleta de los tres tipos de emisor. Reproduce las curvas de color y alfa
   * del `ParticleSystem` original.
   */
  private particlePalette(
    kind: 'flame' | 'leaf' | 'spore',
    options: FlameParticleOptions,
    tint: readonly [number, number, number]
  ): {
    colorStart: readonly [number, number, number];
    colorMid: readonly [number, number, number];
    colorEnd: readonly [number, number, number];
    colorMidAt: number;
    opacity: number;
    fadeIn: number;
    fadeOut: number;
    additive: boolean;
    sizeMidAt: number;
  } {
    const r = tint[0] / 255;
    const g = tint[1] / 255;
    const b = tint[2] / 255;
    if (kind === 'flame') {
      return {
        colorStart: [1, 0.92, 0.55],
        colorMid: [1, 0.6, 0.24],
        colorEnd: [1, 0.3, 0.07],
        colorMidAt: 0.5,
        opacity: 0.9,
        fadeIn: 0.1,
        fadeOut: 0.55,
        additive: true,
        sizeMidAt: 0.28
      };
    }
    if (kind === 'leaf') {
      return {
        colorStart: [1, 1, 1],
        colorMid: [r, g, b],
        colorEnd: [r * 0.55, g * 0.5, b * 0.35],
        colorMidAt: 0.4,
        opacity: 1,
        fadeIn: 0.12,
        fadeOut: 0.7,
        additive: false,
        sizeMidAt: 0.3
      };
    }
    return {
      colorStart: [1, 1, 1],
      colorMid: [r, g, b],
      colorEnd: [r * 0.5, g * 0.45, b * 0.3],
      colorMidAt: 0.5,
      opacity: 0.9,
      fadeIn: 0.15,
      fadeOut: 0.65,
      additive: (options.blendType ?? pc.BLEND_ADDITIVE) !== pc.BLEND_NORMAL,
      sizeMidAt: 0.3
    };
  }

  /** Número de motas vivas en régimen: PlayCanvas nace una cada `rate` s. */
  private aliveParticles(options: FlameParticleOptions): number {
    return Math.min(
      options.numParticles,
      Math.max(
        1,
        Math.floor(options.lifetime / Math.max(options.rate, 1e-6)) + 1
      )
    );
  }

  /**
   * Crea un emisor analítico para un efecto que no se mueve. Sustituye al
   * `ParticleSystem` de PlayCanvas: sin pasada de simulación ni `preWarm`.
   */
  private spawnStaticParticles(
    parent: pc.Entity,
    options: FlameParticleOptions,
    kind: 'flame' | 'leaf' | 'spore',
    tint: readonly [number, number, number],
    texture: pc.Texture
  ): void {
    const palette = this.particlePalette(kind, options, tint);
    const batch = new EffectParticleBatch(this.app, parent, {
      position: [options.x ?? 0, options.y ?? 0, options.z ?? 0],
      extents: options.extents,
      count: this.aliveParticles(options),
      texture,
      additive: palette.additive,
      colorStart: palette.colorStart,
      colorMid: palette.colorMid,
      colorEnd: palette.colorEnd,
      colorMidAt: palette.colorMidAt,
      opacity: options.opacity ?? palette.opacity,
      sizeStart: options.sizeStart,
      sizeMid: options.sizeMid,
      sizeEnd: options.sizeEnd,
      sizeMidAt: palette.sizeMidAt,
      sizeEndAt: 0.7,
      lifetime: options.lifetime,
      fadeIn: options.fadeIn ?? palette.fadeIn,
      fadeOut: options.fadeOut ?? palette.fadeOut,
      velocity: options.velocity,
      velocityEnd: options.velocityEnd,
      radialSpeed: options.radialSpeed,
      radialSpeedEnd: options.radialSpeedEnd,
      stretch: options.stretch,
      yaw: options.yaw,
      preWarm: options.preWarm ?? true
    });
    this.particleBatches.add(batch);
    batch.entity.on('destroy', () => this.particleBatches.delete(batch));
  }

  /**
   * Estela en espacio de mundo para proyectiles: emite en la posición actual
   * del proyectil y deja las motas quietas, igual que `localSpace: false`.
   */
  private spawnWorldTrail(
    parent: pc.Entity,
    options: FlameParticleOptions,
    kind: 'flame' | 'leaf' | 'spore',
    tint: readonly [number, number, number],
    texture: pc.Texture
  ): void {
    const palette = this.particlePalette(kind, options, tint);
    const batch = new WorldTrailBatch(this.app, parent, {
      texture,
      additive: palette.additive,
      colorStart: palette.colorStart,
      colorMid: palette.colorMid,
      colorEnd: palette.colorEnd,
      colorMidAt: palette.colorMidAt,
      opacity: options.opacity ?? palette.opacity,
      sizeStart: options.sizeStart,
      sizeMid: options.sizeMid,
      sizeEnd: options.sizeEnd,
      sizeMidAt: palette.sizeMidAt,
      sizeEndAt: 0.7,
      lifetime: options.lifetime,
      fadeIn: options.fadeIn ?? palette.fadeIn,
      fadeOut: options.fadeOut ?? palette.fadeOut,
      velocity: options.velocity,
      velocityEnd: options.velocityEnd,
      radialSpeed: options.radialSpeed,
      radialSpeedEnd: options.radialSpeedEnd,
      stretch: options.stretch,
      rate: Math.max(options.rate, 1 / 120),
      maxParticles: this.aliveParticles(options) + 2,
      preWarm: options.preWarm ?? true
    });
    this.particleBatches.add(batch);
    batch.entity.on('destroy', () => this.particleBatches.delete(batch));
  }

  /**
   * Emisor de partículas con la textura de llama. PlayCanvas orienta cada
   * partícula hacia la cámara, así que en el splitscreen se ven de frente en
   * todas las vistas y el conjunto se lee como fuego en movimiento.
   */
  /**
   * Emisor de llamas. En un efecto fijo usa un lote analítico; en una estela
   * de proyectil emite en espacio de mundo para no arrastrar las motas.
   */
  public spawnFlameParticles(
    parent: pc.Entity,
    options: FlameParticleOptions
  ): void {
    if (options.worldSpaceTrail) {
      this.spawnWorldTrail(
        parent,
        options,
        'flame',
        [255, 255, 255],
        this.flameTexture
      );
    } else {
      this.spawnStaticParticles(
        parent,
        options,
        'flame',
        [255, 255, 255],
        this.flameTexture
      );
    }
  }

  /**
   * Partículas de hojas: misma emisión que las llamas, pero con la silueta de
   * hoja y un tinte vegetal que se oscurece al final de la vida.
   */
  public spawnLeafParticles(
    parent: pc.Entity,
    options: FlameParticleOptions,
    tint: readonly [number, number, number]
  ): void {
    if (options.worldSpaceTrail) {
      this.spawnWorldTrail(parent, options, 'leaf', tint, this.leafTexture);
    } else {
      this.spawnStaticParticles(parent, options, 'leaf', tint, this.leafTexture);
    }
  }

  /**
   * Motas de espora: aditivas, pequeñas y con tinte del tipo de la habilidad.
   * El agua reutiliza el emisor con su propia textura de rocío y mezcla normal.
   */
  public spawnSporeParticles(
    parent: pc.Entity,
    options: FlameParticleOptions,
    tint: readonly [number, number, number],
    texture: pc.Texture = this.sporeTexture
  ): void {
    if (options.worldSpaceTrail) {
      this.spawnWorldTrail(parent, options, 'spore', tint, texture);
    } else {
      this.spawnStaticParticles(parent, options, 'spore', tint, texture);
    }
  }

  /** Luz omni corta y cálida: tiñe el suelo y los sprites alrededor del fuego. */
  public createFireLight(
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

  /** Devuelve una malla compartida y la crea solo la primera vez. */
  public cachedMesh(key: string, create: () => pc.Mesh): pc.Mesh {
    const cached = this.meshCache.get(key);
    if (cached) return cached;
    const mesh = create();
    // La caché mantiene una referencia propia para que el MeshInstance no la
    // destruya al terminar el efecto.
    mesh.incRefCount();
    this.meshCache.set(key, mesh);
    return mesh;
  }

  /** Malla compartida del anillo de media luna que usan áreas e impactos. */
  public cachedArcBand(
    innerRadius: number,
    outerRadius: number,
    halfAngle: number,
    segments: number
  ): pc.Mesh {
    const key = `arc-band:${innerRadius.toFixed(3)}:${outerRadius.toFixed(3)}:${halfAngle.toFixed(3)}:${segments}`;
    return this.cachedMesh(key, () => createArcBandMesh(
      this.device,
      innerRadius,
      outerRadius,
      halfAngle,
      segments
    ).mesh);
  }

  /** Estrella de cuatro puntas compartida entre proyectiles e impactos. */
  public cachedShuriken(outerRadius: number, innerRadius: number): pc.Mesh {
    const key = `shuriken:${outerRadius.toFixed(3)}:${innerRadius.toFixed(3)}`;
    return this.cachedMesh(key, () =>
      createShurikenMesh(this.device, outerRadius, innerRadius)
    );
  }

  /** Aspa de viento compartida; sus dimensiones dependen del radio del efecto. */
  public cachedWindBlade(
    length: number,
    width: number,
    bend: number,
    segments: number
  ): pc.Mesh {
    const key = `wind-blade:${length.toFixed(3)}:${width.toFixed(3)}:${bend.toFixed(3)}:${segments}`;
    return this.cachedMesh(key, () =>
      createWindBladeMesh(this.device, length, width, bend, segments)
    );
  }


  public acquireMaterial(kind: string): pc.StandardMaterial {
    const material = this.materialPools.get(kind)?.pop();
    if (material) return material;
    const created = new pc.StandardMaterial();
    this.materialKinds.set(created, kind);
    return created;
  }


  public releaseMaterial(material: pc.StandardMaterial): void {
    const kind = this.materialKinds.get(material);
    if (!kind) {
      material.destroy();
      return;
    }
    let pool = this.materialPools.get(kind);
    if (!pool) {
      pool = [];
      this.materialPools.set(kind, pool);
    }
    if (pool.length >= MATERIAL_POOL_LIMIT) {
      material.destroy();
      return;
    }
    pool.push(material);
  }

  /**
   * Devuelve varios materiales al pool sin duplicarlos: algunos efectos
   * comparten el mismo material entre varias entidades.
   */
  public releaseMaterials(materials: readonly pc.StandardMaterial[]): void {
    for (const material of new Set(materials)) this.releaseMaterial(material);
  }

  /** Destruye la raíz de un efecto y todos sus hijos. */
  public destroyFxRoot(entity: pc.Entity): void {
    entity.destroy();
  }

  public createEntity(
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


  public addEffect(
    entity: pc.Entity,
    materials: pc.StandardMaterial[],
    duration: number,
    update: (t: number, dt: number) => void,
    anchors?: FxAnchors
  ): FxHandle {
    // Solo las vistas que ven el origen (o el destino) del efecto lo dibujan.
    const points =
      anchors ??
      this.pendingAnchors ??
      ([[entity.getPosition().x, entity.getPosition().z]] as FxAnchors);
    this.applyVisibility(entity, points);
    const effect: ActiveEffect = {
      entity,
      materials,
      duration,
      elapsed: 0,
      anchors: points,
      update
    };
    this.effects.push(effect);
    return { destroy: () => this.disposeEffect(effect) };
  }

  /** Cancela un efecto concreto y libera su entidad y materiales. */
  public disposeEffect(effect: ActiveEffect): void {
    const index = this.effects.indexOf(effect);
    if (index < 0) return;
    this.effects.splice(index, 1);
    this.destroyFxRoot(effect.entity);
    this.releaseMaterials(effect.materials);
  }

  /**
   * Ejecuta `run` con las anclas indicadas: todos los efectos que cree dentro
   * (incluidas las fábricas de haces, áreas e impactos) se dibujarán solo en
   * las vistas que vean alguno de esos puntos.
   */
  public withAnchors<T>(anchors: FxAnchors, run: () => T): T {
    const previous = this.pendingAnchors;
    this.pendingAnchors = anchors;
    try {
      return run();
    } finally {
      this.pendingAnchors = previous;
    }
  }

  /**
   * Fuerza una capa concreta para todos los efectos. Se usa durante la
   * precarga de shaders de la pantalla de carga. Con `null` se vuelve al
   * resolvedor normal de visibilidad.
   */
  setWarmupLayer(layerId: number | null): void {
    this.warmupLayer = layerId;
  }

  /**
   * Ajusta las capas del árbol de un efecto a las vistas que lo ven. PlayCanvas
   * guarda las capas por componente (`render` y `particlesystem`), así que hay
   * que recorrer los hijos además del nodo raíz.
   */
  public applyVisibility(
    entity: pc.Entity,
    anchors: FxAnchors,
    ignoreTerrainConcealment = false,
    owner?: TelegraphOwner
  ): void {
    if (this.warmupLayer !== null) {
      this.setEntityLayers(entity, [this.warmupLayer]);
      return;
    }

    const layers: number[] = [];
    for (const [x, z] of anchors) {
      for (const id of this.resolveLayers(x, z, ignoreTerrainConcealment, owner)) {
        if (!layers.includes(id)) layers.push(id);
      }
    }
    this.setEntityLayers(entity, layers);
  }


  public setEntityLayers(entity: pc.Entity, layers: readonly number[]): void {
    const render = entity.render;
    if (render && !sameLayers(render.layers, layers)) {
      render.layers = [...layers];
    }
    const particles = entity.particlesystem;
    if (particles && !sameLayers(particles.layers, layers)) {
      particles.layers = [...layers];
    }
    for (const child of entity.children as pc.Entity[]) this.setEntityLayers(child, layers);
  }


  public disposeTelegraph(telegraph: GroundTelegraph): void {
    if (!telegraph.active) return;
    telegraph.active = false;
    this.telegraphs.delete(telegraph);
    this.destroyFxRoot(telegraph.entity);
    this.releaseMaterials(telegraph.materials);
  }


  update(dt: number): void {
    for (const batch of this.particleBatches) batch.update(dt);
    // Recalcular la niebla cuesta una prueba de línea de visión por cada
    // Pokémon vivo del equipo; con 0,1 s de margen basta para que los efectos
    // entren y salgan de la niebla sin repetir el cálculo en cada frame.
    this.visibilityTimer += dt;
    const refreshVisibility = this.visibilityTimer >= 0.1;
    if (refreshVisibility) this.visibilityTimer = 0;

    // Marcas de área: se animan y se autodestruyen al llenarse. Recorrer el
    // `Set` directamente evita copiarlo cada frame; borrar el elemento actual
    // durante la iteración es seguro.
    for (const telegraph of this.telegraphs) {
      telegraph.elapsed += dt;
      const progress = Math.min(1, telegraph.elapsed / telegraph.duration);
      telegraph.update(progress, telegraph.elapsed);
      // La visibilidad se recalcula a intervalos: una marca creada en la niebla
      // aparece en cuanto el jugador se acerca lo suficiente a verla.
      if (refreshVisibility) {
        this.applyVisibility(
          telegraph.entity,
          telegraph.anchors,
          false,
          telegraph.owner
        );
      }
      for (const material of telegraph.materials) {
        updateMaterialIfChanged(material);
      }
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
      // Las vistas se mueven: un efecto estático también puede entrar o salir
      // de la niebla mientras dura.
      if (refreshVisibility) {
        this.applyVisibility(effect.entity, effect.anchors);
      }
      // `opacity` es un uniforme del material: sin update() el fundido no
      // llega a la GPU igual que ocurre con los offsets de textura del sprite.
      // Solo se sube el material si el efecto cambió algún valor animado: las
      // piezas estáticas y los tramos sin variación no pagan el coste.
      for (const material of effect.materials) {
        updateMaterialIfChanged(material);
      }
      if (effect.elapsed < effect.duration) continue;

      this.disposeEffect(effect);
    }
  }

  /** Elimina todos los efectos activos. */
  clear(): void {
    for (const telegraph of [...this.telegraphs]) {
      this.disposeTelegraph(telegraph);
    }

    for (const effect of [...this.effects]) {
      this.disposeEffect(effect);
    }

    for (const visual of this.projectiles) {
      this.destroyFxRoot(visual.entity);
      this.releaseMaterials(visual.materials);
    }
    this.projectiles.clear();
    this.particleBatches.clear();
  }


  destroy(): void {
    this.clear();
    this.particleBatches.clear();
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
    this.iceCrystalMesh.destroy();
    this.rockSpikeMesh.destroy();
    this.rockChunkMesh.destroy();
    for (const mesh of this.meshCache.values()) mesh.destroy();
    this.meshCache.clear();
    for (const pool of this.materialPools.values()) {
      for (const material of pool) material.destroy();
    }
    this.materialPools.clear();
    this.dustTexture.destroy();
  }
}
