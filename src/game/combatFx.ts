/**
 * Efectos visuales procedurales del combate.
 *
 * No usan hojas de ataque externas: son mallas simples de PlayCanvas con
 * materiales aditivos. Cada habilidad nueva puede elegir su color y su forma,
 * y el motor reutiliza estas primitivas (proyectil, arco, haz, área, dash y
 * aura). Cada efecto se dibuja solo en las capas de las vistas que pueden
 * verlo: el resolvedor de capas lo decide con la misma niebla que oculta a los
 * actores, así que un proyectil o un haz no delata a un rival fuera de visión.
 */

import * as pc from 'playcanvas';
import type { AoeStyle, BeamStyle, ImpactStyle, ProjectileStyle } from './abilities';
import { DEG } from './config';
import { createDustCanvas, createFlameCanvas, createFrostCanvas, createLeafParticleCanvas, createPollenCanvas, textureFromCanvas } from './textures';

/** Opacidad base del arco melee según el estilo de impacto. */
const MELEE_ARC_OPACITY: Partial<Record<ImpactStyle, number>> = {
  poison: 0.38,
  spore: 0.28,
  psychic: 0.1,
  slash: 0.16,
  arc: 0.18,
  steel: 0.12,
  fighting: 0.2,
  dark: 0.1,
  shuriken: 0.14,
  ghost: 0.12,
  air: 0.16,
  rock: 0.14,
  ground: 0.18
};

export interface EffectHandle {
  setPosition(x: number, z: number): void;
  update(dt: number): void;
  destroy(): void;
}

/**
 * Capas de render de las vistas que deben dibujar un efecto en `(x, z)`.
 * Devuelve un array vacío si ninguna vista lo ve.
 */
export type FxLayerResolver = (x: number, z: number) => readonly number[];

/** Puntos que anclan un efecto para decidir en qué vistas se dibuja. */
type FxAnchors = ReadonlyArray<readonly [number, number]>;

/**
 * Anclas de un área: el centro y cuatro puntos del borde. Así el círculo se ve
 * en una vista que solo alcanza su borde, no únicamente si ve el centro.
 */
function areaAnchors(x: number, z: number, radius: number): FxAnchors {
  return [
    [x, z],
    [x + radius, z],
    [x - radius, z],
    [x, z + radius],
    [x, z - radius]
  ];
}

function sameLayers(current: readonly number[], next: readonly number[]): boolean {
  if (current.length !== next.length) return false;
  for (let index = 0; index < current.length; index++) {
    if (current[index] !== next[index]) return false;
  }
  return true;
}

interface ActiveEffect {
  entity: pc.Entity;
  materials: pc.StandardMaterial[];
  duration: number;
  elapsed: number;
  anchors: FxAnchors;
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
  anchors: FxAnchors;
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
 * Banda curva en el plano XZ entre dos radios. Se usa para las ondas psíquicas
 * que avanzan por el cono como un frente de sonido.
 */
function createArcBandMesh(
  device: pc.GraphicsDevice,
  innerRadius: number,
  outerRadius: number,
  halfAngle: number,
  segments: number
): { mesh: pc.Mesh; positions: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const angle = -halfAngle + (2 * halfAngle * i) / segments;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    positions.push(sin * innerRadius, 0, cos * innerRadius);
    positions.push(sin * outerRadius, 0, cos * outerRadius);
    normals.push(0, 1, 0, 0, 1, 0);
  }

  for (let i = 0; i < segments; i++) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setIndices(indices);
  mesh.update();
  return { mesh, positions };
}

/**
 * Estrella plana de cuatro puntas en el plano XY. Se usa como shuriken: gira
 * sobre el eje Z, que es la dirección de vuelo del proyectil.
 */
function createShurikenMesh(
  device: pc.GraphicsDevice,
  outerRadius: number,
  innerRadius: number
): pc.Mesh {
  const points = 4;
  const positions: number[] = [0, 0, 0];
  const normals: number[] = [0, 0, 1];
  const indices: number[] = [];

  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    normals.push(0, 0, 1);
  }
  const count = points * 2;
  for (let i = 0; i < count; i++) {
    indices.push(0, 1 + i, 1 + ((i + 1) % count));
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/**
 * Garra de un zarpazo: cinta blanca larga y afilada que cruza el cono en
 * diagonal. El radio crece a lo largo del arco (de cerca a lejos), así la curva
 * acompaña al cono, y el borde exterior va serrado como una zarpa.
 *
 * `tStart`/`tEnd` permiten generar solo un tramo del tajo; el dibujo de derecha
 * a izquierda usa varios tramos estáticos en vez de deformar el mesh por frame.
 */
function createSlashStreakMesh(
  device: pc.GraphicsDevice,
  innerRadius: number,
  outerRadius: number,
  halfThickness: number,
  angleStart: number,
  angleSweep: number,
  segments: number,
  liftStart: number,
  liftEnd: number,
  bow: number,
  phase: number,
  tStart = 0,
  tEnd = 1
): pc.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const t = tStart + (tEnd - tStart) * u;
    const angle = angleStart + angleSweep * t;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const radius = innerRadius + (outerRadius - innerRadius) * t;
    // Punta afilada en ambos extremos del tajo completo.
    const taper = Math.pow(Math.sin(Math.PI * t), 0.35);
    const thickness = halfThickness * taper;
    // Borde exterior ligeramente serrado: picos suaves a lo largo del filo.
    const serration =
      0.82 + 0.18 * Math.abs(Math.sin(t * Math.PI * 7 + phase));
    const outerEdge = radius + thickness * serration;
    const innerEdge = radius - thickness * 0.6;
    const y =
      liftStart + (liftEnd - liftStart) * t + Math.sin(Math.PI * t) * bow;
    positions.push(sin * innerEdge, y, cos * innerEdge);
    positions.push(sin * outerEdge, y, cos * outerEdge);
    normals.push(0, 1, 0, 0, 1, 0);
  }

  for (let i = 0; i < segments; i++) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/**
 * Hoja de viento: medialuna plana en el plano XY con las puntas afiladas. Los
 * proyectiles y las áreas de aire la giran alrededor del eje de vuelo o del
 * suelo, y el degradado de radios hace que parezca una ráfaga curvada.
 */
function createWindBladeMesh(
  device: pc.GraphicsDevice,
  radius: number,
  halfAngle: number,
  thickness: number,
  segments: number
): pc.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = -halfAngle + 2 * halfAngle * t;
    // Las puntas se afinan hasta desaparecer: la medialuna no acaba en un
    // corte recto, sino en un filo.
    const taper = Math.pow(Math.sin(Math.PI * t), 0.55);
    const half = Math.max(0.001, thickness * taper);
    const inner = radius - half;
    const outer = radius + half;
    positions.push(
      Math.cos(angle) * inner,
      Math.sin(angle) * inner,
      0,
      Math.cos(angle) * outer,
      Math.sin(angle) * outer,
      0
    );
    normals.push(0, 0, 1, 0, 0, 1);
  }

  for (let i = 0; i < segments; i++) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/**
 * Cristal de hielo unitario: prisma hexagonal irregular con punta inferior,
 * punta superior desplazada y caras de distinto tono. Cada triángulo lleva su
 * propia normal y su propio color de vértice, así que las facetas se sombrean
 * y además tienen el contraste claro/oscuro de un cristal tallado.
 */
function createIceCrystalMesh(device: pc.GraphicsDevice): pc.Mesh {
  type Vec3 = [number, number, number];
  const sides = 6;
  const bottom: Vec3 = [0, -0.55, 0];
  const top: Vec3 = [0.07, 0.52, -0.02];
  const lowerRadii = [0.3, 0.36, 0.4, 0.34, 0.28, 0.24];
  const middleRadii = [0.44, 0.5, 0.47, 0.4, 0.36, 0.42];
  const upperRadii = [0.24, 0.3, 0.28, 0.22, 0.2, 0.25];

  const ring = (y: number, radii: number[], offset: number): Vec3[] =>
    radii.map((radius, index) => {
      const angle = offset + (index / sides) * Math.PI * 2;
      return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
    });
  const lower = ring(-0.3, lowerRadii, 0);
  const middle = ring(0.02, middleRadii, Math.PI / sides);
  const upper = ring(0.3, upperRadii, 0);

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const shade = (color: Vec3, factor: number): Vec3 => [
    Math.min(255, color[0] * factor),
    Math.min(255, color[1] * factor),
    Math.min(255, color[2] * factor)
  ];
  const pushTriangle = (
    a: Vec3,
    b: Vec3,
    c: Vec3,
    color: Vec3
  ): void => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    const cz = (a[2] + b[2] + c[2]) / 3;
    if (nx * cx + ny * cy + nz * cz < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    positions.push(...a, ...b, ...c);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    colors.push(
      color[0], color[1], color[2], 255,
      color[0], color[1], color[2], 255,
      color[0], color[1], color[2], 255
    );
  };

  // Tonos de la referencia: blanco hielo, cian claro, azul medio, azul oscuro
  // y azul profundo. El degradado recorre las seis caras del prisma.
  const bright: Vec3 = [238, 255, 255];
  const light: Vec3 = [174, 235, 250];
  const mid: Vec3 = [92, 190, 236];
  const dark: Vec3 = [42, 132, 198];
  const deep: Vec3 = [24, 92, 158];
  const sideColors: Vec3[] = [light, bright, mid, dark, deep, mid];

  for (let index = 0; index < sides; index++) {
    const next = (index + 1) % sides;
    const color = sideColors[index];
    pushTriangle(bottom, lower[index], lower[next], shade(deep, 0.9));
    pushTriangle(lower[index], middle[index], lower[next], color);
    pushTriangle(lower[next], middle[index], middle[next], color);
    pushTriangle(
      middle[index],
      upper[index],
      middle[next],
      shade(color, 1.18)
    );
    pushTriangle(
      middle[next],
      upper[index],
      upper[next],
      shade(color, 1.18)
    );
    pushTriangle(upper[index], top, upper[next], bright);
  }

  for (let index = 0; index < positions.length / 3; index++) {
    indices.push(index);
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setColors(colors, 4);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/**
 * Cinta zigzagueante en forma de cruz, para que el rayo se vea desde cualquier
 * ángulo de cámara. Se construye a lo largo de Z y se centra en 0.
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
  /** Resuelve las capas de las vistas que pueden ver un efecto. */
  private readonly resolveLayers: FxLayerResolver;
  /** Anclas del efecto que se está construyendo, si las define su `spawn`. */
  private pendingAnchors: FxAnchors | null = null;
  /** Acumulador para no repetir el cálculo de niebla de todos los FX por frame. */
  private visibilityTimer = 0;
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
  /** Rocío azulado para las partículas de agua. */
  private readonly waterTexture: pc.Texture;
  private readonly leafMesh: pc.Mesh;
  /** Mallas de la marca de área y marcas activas. */
  private readonly discMesh: pc.Mesh;
  private readonly dashRingMesh: pc.Mesh;
  /** Bipirámide compartida por proyectiles, impactos, haces y áreas de hielo. */
  private readonly iceCrystalMesh: pc.Mesh;
  /** Cono facetado compartido por los efectos de Roca y Tierra. */
  private readonly rockSpikeMesh: pc.Mesh;
  /** Roca baja y facetada para las lluvias de piedras. */
  private readonly rockChunkMesh: pc.Mesh;
  /** Textura de polvo para las partículas de roca y tierra. */
  private readonly dustTexture: pc.Texture;
  private readonly telegraphs = new Set<AoeTelegraph>();

  /** Fábricas de VFX por estilo: evitan cadenas de `if` en cada spawn. */
  private readonly impactEffects: Record<
    ImpactStyle,
    (x: number, z: number, color: readonly [number, number, number], effectiveness: number) => void
  >;
  private readonly projectileFactories: Record<
    ProjectileStyle,
    (
      x: number,
      z: number,
      color: readonly [number, number, number],
      radius: number,
      dirX: number,
      dirZ: number
    ) => EffectHandle
  >;
  private readonly beamFactories: Record<
    BeamStyle,
    (
      x1: number,
      z1: number,
      x2: number,
      z2: number,
      color: readonly [number, number, number],
      width: number
    ) => void
  >;
  private readonly aoeFactories: Record<
    AoeStyle,
    (
      x: number,
      z: number,
      radius: number,
      color: readonly [number, number, number],
      duration: number
    ) => void
  >;

  constructor(
    app: pc.Application,
    layerId: number,
    resolveLayers: FxLayerResolver = () => [layerId]
  ) {
    this.app = app;
    this.layerId = layerId;
    this.resolveLayers = resolveLayers;
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
    this.waterTexture = textureFromCanvas(this.device, createFrostCanvas(48), {
      name: 'combat-water',
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
    this.iceCrystalMesh = createIceCrystalMesh(this.device);
    this.rockSpikeMesh = pc.createCone(this.device, {
      baseRadius: 0.5,
      peakRadius: 0.04,
      height: 1,
      heightSegments: 1,
      capSegments: 5
    });
    this.rockChunkMesh = pc.createSphere(this.device, {
      radius: 0.5,
      latitudeBands: 3,
      longitudeBands: 4
    });
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

    this.impactEffects = {
      hit: (x, z, color, effectiveness) =>
        this.spawnHit(x, z, color, effectiveness),
      electric: (x, z, color, effectiveness) =>
        this.spawnElectricBurst(x, z, color, effectiveness),
      fire: (x, z, color, effectiveness) =>
        this.spawnFireBurst(x, z, color, effectiveness),
      grass: (x, z, color, effectiveness) =>
        this.spawnGrassBurst(x, z, color, effectiveness),
      poison: (x, z, color, effectiveness) =>
        this.spawnPoisonBurst(x, z, color, effectiveness),
      spore: (x, z, color, effectiveness) =>
        this.spawnHit(x, z, color, effectiveness),
      slash: (x, z, color, effectiveness) =>
        this.spawnHit(x, z, color, effectiveness),
      arc: (x, z, color, effectiveness) =>
        this.spawnHit(x, z, color, effectiveness),
      psychic: (x, z, color, effectiveness) =>
        this.spawnPsychicBurst(x, z, color, effectiveness),
      water: (x, z, color, effectiveness) =>
        this.spawnWaterBurst(x, z, color, effectiveness),
      aura: (x, z, color, effectiveness) =>
        this.spawnAuraBurst(x, z, color, effectiveness),
      steel: (x, z, color, effectiveness) =>
        this.spawnSteelBurst(x, z, color, effectiveness),
      fighting: (x, z, color, effectiveness) =>
        this.spawnFightingBurst(x, z, color, effectiveness),
      dark: (x, z, color, effectiveness) =>
        this.spawnDarkBurst(x, z, color, effectiveness),
      shuriken: (x, z, color, effectiveness) =>
        this.spawnShurikenBurst(x, z, color, effectiveness),
      ghost: (x, z, color, effectiveness) =>
        this.spawnGhostBurst(x, z, color, effectiveness),
      air: (x, z, color, effectiveness) =>
        this.spawnAirBurst(x, z, color, effectiveness),
      ice: (x, z, color, effectiveness) =>
        this.spawnIceBurst(x, z, color, effectiveness),
      rock: (x, z, color, effectiveness) =>
        this.spawnRockBurst(x, z, color, effectiveness),
      ground: (x, z, color, effectiveness) =>
        this.spawnGroundBurst(x, z, color, effectiveness)
    };

    this.projectileFactories = {
      orb: (x, z, color, radius) =>
        this.spawnOrbProjectile(x, z, color, radius),
      electric: (x, z, _color, radius, dirX, dirZ) =>
        this.spawnElectricProjectile(x, z, radius, dirX, dirZ),
      fire: (x, z, _color, radius, dirX, dirZ) =>
        this.spawnFireProjectile(x, z, radius, dirX, dirZ),
      grass: (x, z, color, radius, dirX, dirZ) =>
        this.spawnGrassProjectile(x, z, radius, dirX, dirZ, color),
      poison: (x, z, color, radius, dirX, dirZ) =>
        this.spawnPoisonProjectile(x, z, radius, dirX, dirZ, color),
      psychic: (x, z, color, radius) =>
        this.spawnOrbProjectile(x, z, color, radius),
      water: (x, z, color, radius, dirX, dirZ) =>
        this.spawnWaterProjectile(x, z, radius, dirX, dirZ, color),
      aura: (x, z, color, radius, dirX, dirZ) =>
        this.spawnAuraProjectile(x, z, color, radius, dirX, dirZ),
      shuriken: (x, z, color, radius, dirX, dirZ) =>
        this.spawnShurikenProjectile(x, z, color, radius, dirX, dirZ),
      shadow: (x, z, color, radius, dirX, dirZ) =>
        this.spawnShadowProjectile(x, z, color, radius, dirX, dirZ),
      ghost: (x, z, color, radius, dirX, dirZ) =>
        this.spawnGhostProjectile(x, z, color, radius, dirX, dirZ),
      air: (x, z, color, radius, dirX, dirZ) =>
        this.spawnAirProjectile(x, z, radius, dirX, dirZ, color),
      ice: (x, z, color, radius, dirX, dirZ) =>
        this.spawnIceProjectile(x, z, radius, dirX, dirZ, color),
      rock: (x, z, color, radius, dirX, dirZ) =>
        this.spawnRockProjectile(x, z, radius, dirX, dirZ, color)
    };

    this.beamFactories = {
      electric: (x1, z1, x2, z2, color, width) =>
        this.spawnElectricBeam(x1, z1, x2, z2, color, width),
      fire: (x1, z1, x2, z2, color, width) =>
        this.spawnFireBeam(x1, z1, x2, z2, color, width),
      psychic: (x1, z1, x2, z2, color, width) =>
        this.spawnPsychicBeam(x1, z1, x2, z2, color, width),
      water: (x1, z1, x2, z2, color, width) =>
        this.spawnWaterBeam(x1, z1, x2, z2, color, width),
      dark: (x1, z1, x2, z2, color, width) =>
        this.spawnDarkBeam(x1, z1, x2, z2, color, width),
      ghost: (x1, z1, x2, z2, color, width) =>
        this.spawnGhostBeam(x1, z1, x2, z2, color, width),
      air: (x1, z1, x2, z2, color, width) =>
        this.spawnAirBeam(x1, z1, x2, z2, color, width),
      ice: (x1, z1, x2, z2, color, width) =>
        this.spawnIceBeam(x1, z1, x2, z2, color, width),
      rock: (x1, z1, x2, z2, color, width) =>
        this.spawnRockBeam(x1, z1, x2, z2, color, width)
    };

    this.aoeFactories = {
      ring: (x, z, radius, color, duration) =>
        this.spawnRingAoe(x, z, radius, color, duration),
      fire: (x, z, radius, color, duration) =>
        this.spawnFireAoe(x, z, radius, color, duration),
      whirl: (x, z, radius, color, duration) =>
        this.spawnFireWhirl(x, z, radius, color, duration),
      grass: (x, z, radius, color, duration) =>
        this.spawnGrassAoe(x, z, radius, color, duration),
      poison: (x, z, radius, color, duration) =>
        this.spawnPoisonAoe(x, z, radius, color, duration),
      psychic: (x, z, radius, color, duration) =>
        this.spawnPsychicAoe(x, z, radius, color, duration),
      water: (x, z, radius, color, duration) =>
        this.spawnWaterAoe(x, z, radius, color, duration),
      explosion: (x, z, radius, color, duration) =>
        this.spawnExplosionAoe(x, z, radius, color, duration),
      ghost: (x, z, radius, color, duration) =>
        this.spawnGhostAoe(x, z, radius, color, duration),
      air: (x, z, radius, color, duration) =>
        this.spawnAirAoe(x, z, radius, color, duration),
      heat: (x, z, radius, color, duration) =>
        this.spawnHeatAoe(x, z, radius, color, duration),
      ice: (x, z, radius, color, duration) =>
        this.spawnIceAoe(x, z, radius, color, duration),
      blizzard: (x, z, radius, color, duration) =>
        this.spawnBlizzardAoe(x, z, radius, color, duration),
      ground: (x, z, radius, color, duration) =>
        this.spawnGroundAoe(x, z, radius, color, duration)
    };
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

  /**
   * Material de agua: mezcla normal para que el azul se lea sobre cualquier
   * terreno (el aditivo se blanquea con el suelo claro). Sin texturas: la
   * silueta la dan las esferas y anillos.
   */
  private createWaterMaterial(
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
   * Material de aura: reutiliza la mezcla normal del agua para que el azul no
   * se lave sobre arena o hierba clara. La silueta la dan las esferas, los
   * anillos y los destellos.
   */
  private createAuraMaterial(
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
  private createIceCrystalMaterial(
    tint: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = new pc.StandardMaterial();
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
  private createRockMaterial(
    tint: readonly [number, number, number],
    opacity: number
  ): pc.StandardMaterial {
    const material = new pc.StandardMaterial();
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

  /**
   * Motas de espora: aditivas, pequeñas y con tinte del tipo de la habilidad.
   * El agua reutiliza el emisor con su propia textura de rocío y mezcla normal.
   */
  private spawnSporeParticles(
    parent: pc.Entity,
    options: FlameParticleOptions,
    tint: readonly [number, number, number],
    texture: pc.Texture = this.sporeTexture
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
      colorMap: texture,
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
    update: (t: number, dt: number) => void,
    anchors?: FxAnchors
  ): void {
    // Solo las vistas que ven el origen (o el destino) del efecto lo dibujan.
    const points =
      anchors ??
      this.pendingAnchors ??
      ([[entity.getPosition().x, entity.getPosition().z]] as FxAnchors);
    this.applyVisibility(entity, points);
    this.effects.push({
      entity,
      materials,
      duration,
      elapsed: 0,
      anchors: points,
      update
    });
  }

  /**
   * Ejecuta `run` con las anclas indicadas: todos los efectos que cree dentro
   * (incluidas las fábricas de haces, áreas e impactos) se dibujarán solo en
   * las vistas que vean alguno de esos puntos.
   */
  private withAnchors<T>(anchors: FxAnchors, run: () => T): T {
    const previous = this.pendingAnchors;
    this.pendingAnchors = anchors;
    try {
      return run();
    } finally {
      this.pendingAnchors = previous;
    }
  }

  /**
   * Ajusta las capas del árbol de un efecto a las vistas que lo ven. PlayCanvas
   * guarda las capas por componente (`render` y `particlesystem`), así que hay
   * que recorrer los hijos además del nodo raíz.
   */
  private applyVisibility(entity: pc.Entity, anchors: FxAnchors): void {
    const layers: number[] = [];
    for (const [x, z] of anchors) {
      for (const id of this.resolveLayers(x, z)) {
        if (!layers.includes(id)) layers.push(id);
      }
    }
    this.setEntityLayers(entity, layers);
  }

  private setEntityLayers(entity: pc.Entity, layers: readonly number[]): void {
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
    const factory =
      this.projectileFactories[style] ?? this.projectileFactories.orb;
    // Las fábricas registran su `ProjectileVisual`; se compara el conjunto para
    // recuperar el nodo recién creado sin cambiar la firma de cada una.
    const known = new Set(this.projectiles);
    const handle = factory(x, z, color, radius, dirX, dirZ);
    let visual: ProjectileVisual | undefined;
    for (const candidate of this.projectiles) {
      if (!known.has(candidate)) {
        visual = candidate;
        break;
      }
    }
    if (!visual) return handle;

    this.applyVisibility(visual.entity, [[x, z]]);

    // El proyectil se mueve: al alejarse lo suficiente se recalculan las capas
    // para que entre o salga de la niebla de cada vista sin quedarse pegado a
    // la visibilidad del punto de lanzamiento.
    let lastX = x;
    let lastZ = z;
    const setPosition = handle.setPosition;
    handle.setPosition = (nextX, nextZ) => {
      setPosition(nextX, nextZ);
      if (Math.hypot(nextX - lastX, nextZ - lastZ) < 0.4) return;
      lastX = nextX;
      lastZ = nextZ;
      this.applyVisibility(visual.entity, [[nextX, nextZ]]);
    };
    return handle;
  }

  /** Proyectil genérico: esfera emisiva del color de la habilidad. */
  private spawnOrbProjectile(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number
  ): EffectHandle {
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

  /**
   * Proyectil de aura: núcleo blanco, cuerpo azul translúcido, dos anillos
   * girados que envuelven la esfera y cuatro motas que orbitan. Una estela corta
   * de esferas que se apagan detrás transmite el avance. Todo son
   * transformaciones sobre geometría estática.
   */
  private spawnAuraProjectile(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    dirX: number,
    dirZ: number
  ): EffectHandle {
    const root = new pc.Entity('aura-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([238, 250, 255], 0.95);
    const bodyMaterial = this.createAuraMaterial(color, 0.55);
    const haloMaterial = this.createMaterial(color, 0.16);
    const ringMaterial = this.createAuraMaterial([194, 226, 255], 0.7);
    const moteMaterial = this.createAuraMaterial([220, 240, 255], 0.85);
    const trailMaterial = this.createAuraMaterial(color, 0.3);
    const materials = [
      coreMaterial,
      bodyMaterial,
      haloMaterial,
      ringMaterial,
      moteMaterial,
      trailMaterial
    ];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.5, radius * 1.5, radius * 1.5);

    const body = this.createEntity(this.sphereMesh, [bodyMaterial], root);
    body.setLocalScale(radius * 2.7, radius * 2.7, radius * 2.7);

    const halo = this.createEntity(this.sphereMesh, [haloMaterial], root);
    halo.setLocalScale(radius * 5.2, radius * 5.2, radius * 5.2);

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalEulerAngles(70 + index * 40, index * 90, 0);
      const scale = radius * (3.6 + index * 0.5);
      ring.setLocalScale(scale, scale, scale);
      rings.push(ring);
    }

    const motes: { entity: pc.Entity; phase: number; orbit: number; bob: number }[] =
      [];
    for (let index = 0; index < 4; index++) {
      const mote = this.createEntity(this.sphereMesh, [moteMaterial], root);
      const size = radius * (0.28 + (index % 2) * 0.1);
      mote.setLocalScale(size, size, size);
      motes.push({
        entity: mote,
        phase: (index / 4) * Math.PI * 2,
        orbit: radius * (2.6 + (index % 3) * 0.35),
        bob: index * 1.6
      });
    }

    const trail: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const puff = this.createEntity(this.sphereMesh, [trailMaterial], root);
      puff.setLocalPosition(0, 0, -radius * (2.4 + index * 2.1));
      const scale = radius * (1.9 - index * 0.45);
      puff.setLocalScale(scale, scale, scale);
      trail.push(puff);
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        const corePulse = 1 + Math.sin(time * 24) * 0.1;
        const bodyPulse = 1 + Math.sin(time * 16) * 0.07;
        core.setLocalScale(
          radius * 1.5 * corePulse,
          radius * 1.5 * corePulse,
          radius * 1.5 * corePulse
        );
        body.setLocalScale(
          radius * 2.7 * bodyPulse,
          radius * 2.7 * bodyPulse,
          radius * 2.7 * bodyPulse
        );
        const haloPulse = 1 + Math.sin(time * 11) * 0.12;
        halo.setLocalScale(
          radius * 5.2 * haloPulse,
          radius * 5.2 * haloPulse,
          radius * 5.2 * haloPulse
        );

        rings[0].setLocalEulerAngles(70, time * 210, time * 120);
        rings[1].setLocalEulerAngles(-60, 90 + time * 260, time * 90);

        for (const mote of motes) {
          const angle = mote.phase + time * 4.6;
          mote.entity.setLocalPosition(
            Math.cos(angle) * mote.orbit,
            Math.sin(angle * 1.6 + mote.bob) * radius * 0.9,
            Math.sin(angle) * mote.orbit
          );
        }

        coreMaterial.opacity = 0.9 + Math.sin(time * 30) * 0.08;
        bodyMaterial.opacity = 0.48 + Math.sin(time * 14) * 0.08;
        haloMaterial.opacity = 0.12 + Math.sin(time * 9) * 0.05;
        ringMaterial.opacity = 0.58 + Math.sin(time * 18) * 0.12;
        trailMaterial.opacity = 0.22 + Math.sin(time * 12) * 0.06;
        for (const material of materials) material.update();
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

  /**
   * Proyectil shuriken: una estrella de cuatro hojas que gira sobre su eje de
   * vuelo. Las hojas y el núcleo son geometría estática; solo giran y laten.
   * Una estela corta de agua marca la trayectoria.
   */
  private spawnShurikenProjectile(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    dirX: number,
    dirZ: number
  ): EffectHandle {
    const root = new pc.Entity('shuriken-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    this.app.root.addChild(root);

    const bladeMaterial = this.createWaterMaterial([196, 240, 255], 0.95);
    const edgeMaterial = this.createMaterial([236, 252, 255], 0.9);
    const coreMaterial = this.createMaterial([255, 255, 255], 0.95);
    const glowMaterial = this.createWaterMaterial(color, 0.22);
    const trailMaterial = this.createWaterMaterial(color, 0.32);
    const materials = [
      bladeMaterial,
      edgeMaterial,
      coreMaterial,
      glowMaterial,
      trailMaterial
    ];

    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 3, radius * 3, radius * 3);

    const star = this.createEntity(
      createShurikenMesh(this.device, radius * 2.1, radius * 0.56),
      [bladeMaterial],
      root
    );
    const starEdge = this.createEntity(
      createShurikenMesh(this.device, radius * 1.62, radius * 0.42),
      [edgeMaterial],
      star
    );
    starEdge.setLocalScale(0.94, 0.94, 0.94);
    starEdge.setLocalEulerAngles(0, 0, 16);

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 0.9, radius * 0.9, radius * 0.9);

    const trail: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const puff = this.createEntity(this.sphereMesh, [trailMaterial], root);
      puff.setLocalPosition(0, 0, -radius * (1.8 + index * 1.35));
      const scale = radius * (0.75 - index * 0.16);
      puff.setLocalScale(scale, scale, scale);
      trail.push(puff);
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        star.setLocalEulerAngles(0, 0, time * 900);
        const pulse = 1 + Math.sin(time * 22) * 0.08;
        core.setLocalScale(
          radius * 0.9 * pulse,
          radius * 0.9 * pulse,
          radius * 0.9 * pulse
        );
        const glowPulse = 1 + Math.sin(time * 14) * 0.12;
        glow.setLocalScale(
          radius * 3 * glowPulse,
          radius * 3 * glowPulse,
          radius * 3 * glowPulse
        );

        bladeMaterial.opacity = 0.9 + Math.sin(time * 26) * 0.05;
        edgeMaterial.opacity = 0.7 + Math.sin(time * 31) * 0.12;
        coreMaterial.opacity = 0.9 + Math.sin(time * 24) * 0.08;
        glowMaterial.opacity = 0.18 + Math.sin(time * 12) * 0.05;
        trailMaterial.opacity = 0.18 + Math.sin(time * 16) * 0.05;
        for (let index = 0; index < trail.length; index++) {
          const puff = trail[index];
          const scale =
            radius * (0.75 - index * 0.16) * (1 + Math.sin(time * 18 + index) * 0.12);
          puff.setLocalScale(scale, scale, scale);
        }
        for (const material of materials) material.update();
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

  /**
   * Proyectil de sombra: orbe violeta con un borde oscuro, tres jirones que
   * orbitan y una estela de esferas que se apagan. Disponible para futuros
   * ataques a distancia de tipo Sombra.
   */
  private spawnShadowProjectile(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    dirX: number,
    dirZ: number
  ): EffectHandle {
    const root = new pc.Entity('shadow-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([226, 208, 255], 0.95);
    const bodyMaterial = this.createWaterMaterial(color, 0.6);
    const wispMaterial = this.createWaterMaterial([176, 142, 240], 0.55);
    const trailMaterial = this.createWaterMaterial(color, 0.28);
    const materials = [
      coreMaterial,
      bodyMaterial,
      wispMaterial,
      trailMaterial
    ];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.5, radius * 1.5, radius * 1.5);
    const body = this.createEntity(this.sphereMesh, [bodyMaterial], root);
    body.setLocalScale(radius * 3, radius * 3, radius * 3);

    const wisps: { entity: pc.Entity; phase: number; orbit: number }[] = [];
    for (let index = 0; index < 3; index++) {
      const wisp = this.createEntity(this.boxMesh, [wispMaterial], root);
      wisp.setLocalScale(radius * 0.35, radius * 0.35, radius * 1.6);
      wisps.push({
        entity: wisp,
        phase: (index / 3) * Math.PI * 2,
        orbit: radius * (2.2 + index * 0.4)
      });
    }

    const trail: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const puff = this.createEntity(this.sphereMesh, [trailMaterial], root);
      puff.setLocalPosition(0, 0, -radius * (2.6 + index * 2.2));
      const scale = radius * (1.7 - index * 0.4);
      puff.setLocalScale(scale, scale, scale);
      trail.push(puff);
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        const pulse = 1 + Math.sin(time * 20) * 0.09;
        core.setLocalScale(
          radius * 1.5 * pulse,
          radius * 1.5 * pulse,
          radius * 1.5 * pulse
        );
        const bodyPulse = 1 + Math.sin(time * 13) * 0.08;
        body.setLocalScale(
          radius * 3 * bodyPulse,
          radius * 3 * bodyPulse,
          radius * 3 * bodyPulse
        );
        for (const wisp of wisps) {
          const angle = wisp.phase + time * 5.2;
          wisp.entity.setLocalPosition(
            Math.cos(angle) * wisp.orbit,
            Math.sin(angle * 1.4) * radius * 0.8,
            Math.sin(angle) * wisp.orbit
          );
          wisp.entity.setLocalEulerAngles(
            0,
            -angle / DEG,
            Math.sin(angle * 2) * 40
          );
        }
        coreMaterial.opacity = 0.9 + Math.sin(time * 28) * 0.08;
        bodyMaterial.opacity = 0.5 + Math.sin(time * 15) * 0.08;
        wispMaterial.opacity = 0.45 + Math.sin(time * 19) * 0.12;
        trailMaterial.opacity = 0.22 + Math.sin(time * 11) * 0.06;
        for (const material of materials) material.update();
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

  /**
   * Proyectil fantasma: orbe morado oscuro con núcleo claro, tres jirones que
   * ondulan detrás, dos ojos que parpadean en la parte delantera y una estela
   * de esferas que se apagan. La mezcla normal mantiene legible el morado.
   */
  private spawnGhostProjectile(
    x: number,
    z: number,
    color: readonly [number, number, number],
    radius: number,
    dirX: number,
    dirZ: number
  ): EffectHandle {
    const root = new pc.Entity('ghost-projectile');
    root.setPosition(x, 0.75, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([238, 226, 255], 0.95);
    const bodyMaterial = this.createWaterMaterial(color, 0.6);
    const wispMaterial = this.createWaterMaterial([168, 128, 238], 0.5);
    const eyeMaterial = this.createMaterial([255, 244, 198], 0.95);
    const trailMaterial = this.createWaterMaterial([104, 70, 156], 0.28);
    const materials = [
      coreMaterial,
      bodyMaterial,
      wispMaterial,
      eyeMaterial,
      trailMaterial
    ];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.35, radius * 1.35, radius * 1.35);

    const body = this.createEntity(this.sphereMesh, [bodyMaterial], root);
    body.setLocalScale(radius * 3, radius * 3, radius * 3);

    const wisps: {
      entity: pc.Entity;
      phase: number;
      baseZ: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const wisp = this.createEntity(this.boxMesh, [wispMaterial], root);
      wisp.setLocalScale(radius * 0.5, radius * 0.5, radius * 1.7);
      wisps.push({
        entity: wisp,
        phase: index * 1.7,
        baseZ: -radius * (1.7 + index * 1.25),
        size: radius * (0.55 - index * 0.08)
      });
    }

    const eyes: { entity: pc.Entity; side: number }[] = [];
    for (let index = 0; index < 2; index++) {
      const eye = this.createEntity(this.sphereMesh, [eyeMaterial], root);
      const side = index === 0 ? -1 : 1;
      eye.setLocalPosition(side * radius * 0.65, radius * 0.35, radius * 2.1);
      eye.setLocalScale(radius * 0.5, radius * 0.5, radius * 0.35);
      eyes.push({ entity: eye, side });
    }

    const trail: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const puff = this.createEntity(this.sphereMesh, [trailMaterial], root);
      puff.setLocalPosition(0, 0, -radius * (2.8 + index * 1.7));
      const scale = radius * (1.4 - index * 0.35);
      puff.setLocalScale(scale, scale, scale);
      trail.push(puff);
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        const pulse = 1 + Math.sin(time * 19) * 0.08;
        core.setLocalScale(
          radius * 1.35 * pulse,
          radius * 1.35 * pulse,
          radius * 1.35 * pulse
        );
        const bodyPulse = 1 + Math.sin(time * 12) * 0.07;
        body.setLocalScale(
          radius * 3 * bodyPulse,
          radius * 3 * bodyPulse,
          radius * 3 * bodyPulse
        );

        for (const wisp of wisps) {
          const wave = Math.sin(time * 8 + wisp.phase);
          wisp.entity.setLocalPosition(
            wave * radius * 0.55,
            Math.sin(time * 5 + wisp.phase) * radius * 0.45,
            wisp.baseZ
          );
          wisp.entity.setLocalEulerAngles(
            0,
            wave * 22,
            Math.sin(time * 7 + wisp.phase) * 18
          );
          const scale = wisp.size * (0.85 + Math.sin(time * 13 + wisp.phase) * 0.15);
          wisp.entity.setLocalScale(scale, scale, scale * 2.4);
        }

        const blink = Math.sin(time * 4.2) > 0.965 ? 0.08 : 1;
        for (const eye of eyes) {
          eye.entity.setLocalScale(
            radius * 0.5,
            radius * 0.5 * blink,
            radius * 0.35
          );
          eye.entity.setLocalPosition(
            eye.side * radius * 0.65,
            radius * 0.35,
            radius * 2.1
          );
        }

        coreMaterial.opacity = 0.9 + Math.sin(time * 27) * 0.08;
        bodyMaterial.opacity = 0.52 + Math.sin(time * 14) * 0.08;
        wispMaterial.opacity = 0.42 + Math.sin(time * 17) * 0.1;
        eyeMaterial.opacity = 0.95;
        trailMaterial.opacity = 0.2 + Math.sin(time * 11) * 0.05;
        for (const material of materials) material.update();
      }
    };
    visual.update(0);
    this.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.75, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!this.projectiles.delete(visual)) return;
        root.destroy();
        for (const material of materials) material.destroy();
      }
    };
  }

  /**
   * Proyectil de agua: tres burbujas pequeñas que giran entre sí alrededor de
   * un centro común mientras avanzan, con destellos que patinan por su
   * superficie. Sin núcleo ni estela: el grupo de burbujas es todo el efecto.
   */
  private spawnWaterProjectile(
    x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]
  ): EffectHandle {
    const root = new pc.Entity('water-projectile');
    root.setPosition(x, 0.7, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    this.app.root.addChild(root);

    const bubbleMaterial = this.createWaterMaterial(color, 0.5);
    const shineMaterial = this.createWaterMaterial([246, 255, 255], 0.92);
    const materials = [bubbleMaterial, shineMaterial];

    const orbit = radius * 1.5;
    const sizes = [1, 0.8, 0.9];
    const bubbles: {
      entity: pc.Entity;
      body: pc.Entity;
      phase: number;
      size: number;
      orbit: number;
      bob: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const group = new pc.Entity('water-bubble');
      root.addChild(group);

      const size = radius * 1.5 * sizes[index];
      const body = this.createEntity(this.sphereMesh, [bubbleMaterial], group);
      body.setLocalScale(size, size, size);

      // Dos brillos pequeños: uno grande arriba a la izquierda y otro mínimo
      // abajo a la derecha. Al girar el grupo, recorren la burbuja como reflejos.
      const highlight = this.createEntity(
        this.sphereMesh,
        [shineMaterial],
        group
      );
      highlight.setLocalPosition(-size * 0.22, size * 0.3, -size * 0.18);
      highlight.setLocalScale(size * 0.3, size * 0.3, size * 0.3);

      const spark = this.createEntity(this.sphereMesh, [shineMaterial], group);
      spark.setLocalPosition(size * 0.2, -size * 0.16, -size * 0.22);
      spark.setLocalScale(size * 0.14, size * 0.14, size * 0.14);

      bubbles.push({
        entity: group,
        body,
        phase: (index / 3) * Math.PI * 2,
        size,
        orbit: orbit * (0.94 + index * 0.08),
        bob: Math.random() * Math.PI * 2
      });
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        for (const bubble of bubbles) {
          // Las tres burbujas se persiguen en círculo en el plano perpendicular
          // a la dirección de vuelo, así que el grupo rueda mientras avanza.
          const angle = bubble.phase + time * 5.4;
          bubble.entity.setLocalPosition(
            Math.cos(angle) * bubble.orbit,
            Math.sin(angle) * bubble.orbit +
              Math.sin(time * 6 + bubble.bob) * radius * 0.12,
            Math.sin(angle * 2 + bubble.phase) * radius * 0.3
          );
          // El grupo gira sobre sí mismo para que los brillos patinen.
          bubble.entity.setLocalEulerAngles(
            time * 150 + bubble.phase * 40,
            time * 210 + bubble.phase * 30,
            0
          );
          const pulse = 1 + Math.sin(time * 14 + bubble.phase) * 0.09;
          const size = bubble.size * pulse;
          bubble.body.setLocalScale(size, size, size);
        }
        bubbleMaterial.opacity = 0.44 + Math.sin(time * 16) * 0.07;
        shineMaterial.opacity = 0.86 + Math.sin(time * 24) * 0.1;
        for (const material of materials) material.update();
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

    const psychicWaves: {
      entity: pc.Entity;
      mesh: pc.Mesh;
      positions: number[];
      material: pc.StandardMaterial;
      segments: number;
      halfAngle: number;
      delay: number;
      travel: number;
      opacity: number;
      lift: number;
      phase: number;
      amplitude: number;
      ripple: number;
    }[] = [];
    if (style === 'psychic') {
      // Onda sonora psíquica: frentes curvos que nacen en el lanzador y
      // recorren el cono hasta su borde. Cada frente se deforma en Y como una
      // cinta ondulada. Se usan dos tonos del color de la habilidad y mezcla
      // normal: con aditivo el violeta se lavaba a blanco sobre terrenos claros.
      effectDuration = 0.75;
      material.opacity = 0.14;
      const highlightTint: [number, number, number] = [
        Math.round(color[0] + (255 - color[0]) * 0.32),
        Math.round(color[1] + (255 - color[1]) * 0.32),
        Math.round(color[2] + (255 - color[2]) * 0.32)
      ];
      const waveCount = 5;
      const segments = 30;
      for (let index = 0; index < waveCount; index++) {
        const highlight = index % 2 === 0;
        const waveMaterial = this.createMaterial(
          highlight ? highlightTint : color,
          highlight ? 0.9 : 0.75
        );
        waveMaterial.blendType = pc.BLEND_NORMAL;
        waveMaterial.opacity = 0;
        waveMaterial.update();
        materials.push(waveMaterial);
        const { mesh: waveMesh, positions: wavePositions } = createArcBandMesh(
          this.device,
          0.94,
          1,
          halfAngle,
          segments
        );
        const wave = this.createEntity(waveMesh, [waveMaterial], entity);
        const lift = 0.12 + index * 0.012;
        wave.setLocalPosition(0, lift, 0);
        wave.setLocalScale(0.001, 1, 0.001);
        psychicWaves.push({
          entity: wave,
          mesh: waveMesh,
          positions: wavePositions,
          material: waveMaterial,
          segments,
          halfAngle,
          delay: index * 0.07,
          travel: 0.42,
          opacity: highlight ? 0.9 : 0.75,
          lift,
          phase: index * 1.7,
          amplitude: 0.14 + index * 0.012,
          ripple: 4 + (index % 3)
        });
      }
    }

    const slashSlices: {
      material: pc.StandardMaterial;
      revealAt: number;
      peak: number;
    }[] = [];
    if (
      style === 'slash' ||
      style === 'steel' ||
      style === 'dark' ||
      style === 'ghost'
    ) {
      // Tres zarpas blancas paralelas tumbadas sobre el cono: cubren su
      // superficie desde el lanzador hasta el borde y comparten apertura, así
      // que se leen como un único tajo de tres filos dentro del área de golpe.
      // Cada garra se parte en tramos estáticos que se encienden de derecha a
      // izquierda, de modo que el trazo parece dibujarse sobre el cono. La Garra
      // Metal usa dos filos de acero, el Tajo Umbrío dos violetas y el
      // Lengüetazo tres trazos fantasmales.
      const steel = style === 'steel';
      const dark = style === 'dark';
      const ghost = style === 'ghost';
      effectDuration = steel ? 0.3 : dark ? 0.32 : ghost ? 0.34 : 0.38;
      material.opacity = steel ? 0.08 : dark ? 0.09 : ghost ? 0.08 : 0.1;
      const span = halfAngle * 1.9;
      const start = -span * 0.5;
      const slices = 10;
      const drawTime = steel ? 0.08 : dark ? 0.07 : ghost ? 0.08 : 0.1;
      const clawTint: [number, number, number] = steel
        ? [214, 232, 255]
        : dark
          ? [210, 180, 255]
          : ghost
            ? [206, 178, 255]
            : [255, 255, 255];
      const claws: {
        inner: number;
        outer: number;
        delay: number;
        peak: number;
      }[] =
        steel || dark
          ? [
              { inner: 0.66, outer: 0.99, delay: 0, peak: 1 },
              { inner: 0.2, outer: 0.58, delay: 0.04, peak: 0.9 }
            ]
          : [
              { inner: 0.74, outer: 0.99, delay: 0, peak: 1 },
              { inner: 0.42, outer: 0.68, delay: 0.03, peak: 0.95 },
              { inner: 0.1, outer: 0.36, delay: 0.06, peak: 0.9 }
            ];
      for (let index = 0; index < claws.length; index++) {
        const claw = claws[index];
        for (let slice = 0; slice < slices; slice++) {
          const tStart = slice / slices;
          const tEnd = (slice + 1) / slices;
          const sliceMaterial = this.createMaterial(clawTint, 0);
          sliceMaterial.blendType = pc.BLEND_NORMAL;
          sliceMaterial.opacity = 0;
          sliceMaterial.update();
          materials.push(sliceMaterial);
          this.createEntity(
            createSlashStreakMesh(
              this.device,
              range * claw.inner,
              range * claw.outer,
              range * 0.07,
              start,
              span,
              4,
              0.1,
              0.2,
              0.04,
              index * 1.9,
              tStart,
              tEnd
            ),
            [sliceMaterial],
            entity
          );
          slashSlices.push({
            material: sliceMaterial,
            // De derecha (t = 1) a izquierda (t = 0).
            revealAt:
              claw.delay + ((slices - 1 - slice) / slices) * drawTime,
            peak: claw.peak
          });
        }
      }
    }

    const attackArcs: {
      entity: pc.Entity;
      material: pc.StandardMaterial;
      delay: number;
      travel: number;
      peak: number;
    }[] = [];
    if (style === 'arc' || style === 'fighting' || style === 'air') {
      // Arco de ataque: tres frentes curvos que salen del lanzador y recorren
      // el cono hasta su borde, marcando la dirección y el alcance del golpe.
      // La geometría es estática (radio 1) y solo se escala, así el trazo es
      // barato y se ve desde cualquier cámara. Combate Cercano añade un cuarto
      // frente y los acelera para que se lea como una ráfaga. Ataque Aéreo usa
      // los mismos frentes con el blanco cálido del viento.
      const fighting = style === 'fighting';
      effectDuration = fighting ? 0.4 : 0.34;
      material.opacity = 0.16;
      const frontCount = fighting ? 4 : 3;
      for (let index = 0; index < frontCount; index++) {
        const arcMaterial = this.createMaterial(color, 0);
        arcMaterial.blendType = pc.BLEND_NORMAL;
        arcMaterial.opacity = 0;
        arcMaterial.update();
        materials.push(arcMaterial);
        const { mesh: arcMesh } = createArcBandMesh(
          this.device,
          0.84,
          1,
          halfAngle,
          26
        );
        const arc = this.createEntity(arcMesh, [arcMaterial], entity);
        arc.setLocalPosition(0, 0.12 + index * 0.035, 0);
        arc.setLocalScale(0.001, 1, 0.001);
        attackArcs.push({
          entity: arc,
          material: arcMaterial,
          delay: index * (fighting ? 0.035 : 0.05),
          travel: fighting ? 0.17 : 0.2,
          peak: 1 - index * (fighting ? 0.14 : 0.15)
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
    const arcOpacity = MELEE_ARC_OPACITY[style] ?? 0.85;
    let time = 0;
    this.addEffect(entity, materials, effectDuration, (t, dt) => {
      time += dt;
      material.opacity = arcOpacity * (1 - t);
      if (
        style !== 'psychic' &&
        style !== 'slash' &&
        style !== 'steel' &&
        style !== 'arc' &&
        style !== 'fighting' &&
        style !== 'dark' &&
        style !== 'ghost' &&
        style !== 'air'
      ) {
        const scale = 0.92 + 0.12 * t;
        entity.setLocalScale(scale, 1, scale);
      }
      for (const arc of attackArcs) {
        const local = Math.min(
          1,
          Math.max(0, (time - arc.delay) / arc.travel)
        );
        const ease = 1 - Math.pow(1 - local, 3);
        const radius = range * (0.28 + 0.72 * ease);
        arc.entity.setLocalScale(radius, 1, radius);
        const fade = Math.min(1, local / 0.18) * (1 - local);
        arc.material.opacity = arc.peak * Math.max(0, fade);
      }
      const now = t * effectDuration;
      for (const slice of slashSlices) {
        const appear = Math.min(
          1,
          Math.max(0, (now - slice.revealAt) / 0.012)
        );
        const fadeOut =
          1 - Math.min(1, Math.max(0, (now - 0.2) / (effectDuration - 0.2)));
        slice.material.opacity = slice.peak * appear * Math.max(0, fadeOut);
      }
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

      for (const wave of psychicWaves) {
        const local = Math.min(
          1,
          Math.max(0, (time - wave.delay) / wave.travel)
        );
        const ease = 1 - (1 - local) * (1 - local);
        const radius = range * (0.1 + 0.95 * ease);
        wave.entity.setLocalScale(radius, 1, radius);
        const fade =
          local <= 0
            ? 0
            : Math.min(1, local / 0.12) * Math.min(1, (1 - local) / 0.3);
        wave.material.opacity = wave.opacity * Math.max(0, fade);

        if (local > 0) {
          // Cinta tridimensional: cada vértice sube y baja en Y según su
          // ángulo dentro del arco, con un desfase entre borde interior y
          // exterior para que la onda se retuerza.
          const positions = wave.positions;
          const vertices = positions.length / 3;
          for (let vertex = 0; vertex < vertices; vertex++) {
            const angleIndex = Math.floor(vertex / 2);
            const angle =
              -wave.halfAngle +
              (2 * wave.halfAngle * angleIndex) / wave.segments;
            const edgePhase = vertex % 2 === 0 ? 0 : 0.9;
            positions[vertex * 3 + 1] =
              Math.sin(
                angle * wave.ripple +
                  time * 11 +
                  wave.phase +
                  edgePhase
              ) * wave.amplitude;
          }
          wave.mesh.setPositions(positions);
          wave.mesh.update();
        }

        wave.entity.setLocalPosition(
          0,
          wave.lift + Math.sin(time * 8 + wave.phase) * 0.025,
          0
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
    }, [
      [x, z],
      [x + Math.sin(yaw) * range, z + Math.cos(yaw) * range]
    ]);
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
    const factory = this.beamFactories[style] ?? this.beamFactories.electric;
    // Origen y destino: el haz se ve si cualquiera de los dos extremos (o su
    // punto medio) cae dentro de la visión del observador.
    this.withAnchors(
      [
        [x1, z1],
        [(x1 + x2) / 2, (z1 + z2) / 2],
        [x2, z2]
      ],
      () => factory(x1, z1, x2, z2, color, width)
    );
  }

  /**
   * Haz eléctrico: dos rayos zigzagueantes que giran en sentidos opuestos,
   * cruzándose mientras el haz se extiende desde el lanzador hacia delante.
   */
  private spawnElectricBeam(
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
   * Haz de sombra: columna violeta con un núcleo claro, jirones de oscuridad
   * que orbitan la línea y anillos que viajan hacia la punta. La mezcla normal
   * mantiene el violeta legible sobre terreno claro.
   */
  private spawnDarkBeam(
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
    const root = new pc.Entity('dark-beam');
    root.setPosition(x1, 0.7, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    this.app.root.addChild(root);

    const mistMaterial = this.createWaterMaterial(
      [
        Math.round(color[0] * 0.55),
        Math.round(color[1] * 0.55),
        Math.round(color[2] * 0.7)
      ],
      0.26
    );
    const bodyMaterial = this.createWaterMaterial(color, 0.55);
    const coreMaterial = this.createWaterMaterial([218, 200, 255], 0.95);
    const wispMaterial = this.createWaterMaterial([178, 144, 244], 0.55);
    const ringMaterial = this.createWaterMaterial([202, 172, 255], 0.65);
    const materials = [
      mistMaterial,
      bodyMaterial,
      coreMaterial,
      wispMaterial,
      ringMaterial
    ];

    const mistWidth = Math.max(0.12, width * 2.4);
    const bodyWidth = Math.max(0.08, width * 1.25);
    const coreWidth = Math.max(0.04, width * 0.45);

    const beamMesh = pc.createCylinder(this.device, {
      radius: 0.5,
      height: 1,
      heightSegments: 1,
      capSegments: 14
    });
    const sheath = this.createEntity(beamMesh, [mistMaterial], root);
    const body = this.createEntity(beamMesh, [bodyMaterial], root);
    const core = this.createEntity(beamMesh, [coreMaterial], root);
    sheath.setLocalEulerAngles(90, 0, 0);
    body.setLocalEulerAngles(90, 0, 0);
    core.setLocalEulerAngles(90, 0, 0);

    const wisps: {
      entity: pc.Entity;
      phase: number;
      speed: number;
      orbit: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 6; index++) {
      const wisp = this.createEntity(this.boxMesh, [wispMaterial], root);
      const size = bodyWidth * (0.18 + Math.random() * 0.1);
      wisp.setLocalScale(size, size * 0.4, size * 4.6);
      wisps.push({
        entity: wisp,
        phase: Math.random(),
        speed: 1.8 + Math.random() * 1.4,
        orbit: bodyWidth * (0.45 + Math.random() * 0.35),
        size
      });
    }

    const rings: pc.Entity[] = [];
    const ringCount = 6;
    for (let index = 0; index < ringCount; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalEulerAngles(90, 0, 0);
      rings.push(ring);
    }

    const tip = this.createEntity(this.sphereMesh, [coreMaterial], root);

    let time = 0;
    this.addEffect(root, materials, 0.48, (_t, dt) => {
      time += dt;
      const advance = Math.min(1, time / 0.1);
      const reveal = 1 - (1 - advance) * (1 - advance);
      const pulse = 0.84 + Math.random() * 0.16;
      const fade = 1 - Math.max(0, (time - 0.28) / 0.2);

      sheath.setLocalPosition(0, 0, (length * reveal) / 2);
      sheath.setLocalScale(
        mistWidth * pulse,
        Math.max(0.02, length * reveal),
        mistWidth * pulse
      );
      body.setLocalPosition(0, 0, (length * reveal) / 2);
      body.setLocalScale(
        bodyWidth * pulse,
        Math.max(0.02, length * reveal),
        bodyWidth * pulse
      );
      core.setLocalPosition(0, 0, (length * reveal) / 2);
      core.setLocalScale(
        coreWidth,
        Math.max(0.02, length * reveal),
        coreWidth
      );

      for (const wisp of wisps) {
        const path = (time * wisp.speed + wisp.phase) % 1;
        const angle = time * 4.2 + wisp.phase * Math.PI * 2;
        wisp.entity.setLocalPosition(
          Math.cos(angle) * wisp.orbit,
          Math.sin(angle) * wisp.orbit,
          length * reveal * path
        );
        wisp.entity.setLocalEulerAngles(
          0,
          angle / DEG,
          Math.sin(angle * 1.5) * 35
        );
      }

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const path = (time * 1.9 + index / ringCount) % 1;
        ring.setLocalPosition(0, 0, length * reveal * (0.1 + path * 0.9));
        const ringScale =
          width * 0.85 * (1.3 + pulse * 0.8) * (0.6 + Math.sin(path * Math.PI) * 0.8);
        ring.setLocalScale(ringScale, ringScale, ringScale);
        ring.setLocalEulerAngles(90, 0, time * 260 + index * 48);
      }

      tip.setLocalPosition(0, 0, length * reveal);
      const tipScale = width * (1.4 + Math.sin(time * 34) * 0.25);
      tip.setLocalScale(tipScale, tipScale, tipScale);

      mistMaterial.opacity = 0.22 * pulse * fade;
      bodyMaterial.opacity = 0.42 * pulse * fade;
      coreMaterial.opacity = 0.9 * pulse * fade;
      wispMaterial.opacity = 0.5 * fade;
      ringMaterial.opacity = 0.65 * fade;
    });
  }

  /**
   * Haz fantasma: columna morada con núcleo claro, jirones que orbitan la
   * línea, anillos que viajan hacia la punta y un par de ojos en la boca del
   * haz. Disponible para futuras habilidades de haz de tipo Fantasma.
   */
  private spawnGhostBeam(
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
    const root = new pc.Entity('ghost-beam');
    root.setPosition(x1, 0.75, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    this.app.root.addChild(root);

    const mistMaterial = this.createWaterMaterial([76, 50, 118], 0.26);
    const bodyMaterial = this.createWaterMaterial(color, 0.55);
    const coreMaterial = this.createWaterMaterial([228, 216, 255], 0.92);
    const wispMaterial = this.createWaterMaterial([172, 132, 240], 0.5);
    const ringMaterial = this.createWaterMaterial([204, 176, 255], 0.6);
    const eyeMaterial = this.createMaterial([255, 246, 206], 0.95);
    const materials = [
      mistMaterial,
      bodyMaterial,
      coreMaterial,
      wispMaterial,
      ringMaterial,
      eyeMaterial
    ];

    const mistWidth = Math.max(0.12, width * 2.4);
    const bodyWidth = Math.max(0.08, width * 1.25);
    const coreWidth = Math.max(0.04, width * 0.45);

    const beamMesh = pc.createCylinder(this.device, {
      radius: 0.5,
      height: 1,
      heightSegments: 1,
      capSegments: 14
    });
    const sheath = this.createEntity(beamMesh, [mistMaterial], root);
    const body = this.createEntity(beamMesh, [bodyMaterial], root);
    const core = this.createEntity(beamMesh, [coreMaterial], root);
    sheath.setLocalEulerAngles(90, 0, 0);
    body.setLocalEulerAngles(90, 0, 0);
    core.setLocalEulerAngles(90, 0, 0);

    const wisps: {
      entity: pc.Entity;
      phase: number;
      speed: number;
      orbit: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const wisp = this.createEntity(this.boxMesh, [wispMaterial], root);
      const size = bodyWidth * (0.18 + Math.random() * 0.1);
      wisp.setLocalScale(size, size * 0.4, size * 4.6);
      wisps.push({
        entity: wisp,
        phase: Math.random(),
        speed: 1.6 + Math.random() * 1.4,
        orbit: bodyWidth * (0.45 + Math.random() * 0.35),
        size
      });
    }

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 5; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalEulerAngles(90, 0, 0);
      rings.push(ring);
    }

    const tip = this.createEntity(this.sphereMesh, [coreMaterial], root);
    const eyes: { entity: pc.Entity; side: number }[] = [];
    for (let index = 0; index < 2; index++) {
      const eye = this.createEntity(this.sphereMesh, [eyeMaterial], root);
      eyes.push({ entity: eye, side: index === 0 ? -1 : 1 });
    }

    let time = 0;
    this.addEffect(root, materials, 0.48, (_t, dt) => {
      time += dt;
      const advance = Math.min(1, time / 0.1);
      const reveal = 1 - (1 - advance) * (1 - advance);
      const pulse = 0.84 + Math.random() * 0.16;
      const fade = 1 - Math.max(0, (time - 0.28) / 0.2);

      const sheathLength = Math.max(0.02, length * reveal);
      sheath.setLocalPosition(0, 0, sheathLength / 2);
      sheath.setLocalScale(
        mistWidth * pulse,
        sheathLength,
        mistWidth * pulse
      );
      body.setLocalPosition(0, 0, sheathLength / 2);
      body.setLocalScale(
        bodyWidth * pulse,
        sheathLength,
        bodyWidth * pulse
      );
      core.setLocalPosition(0, 0, sheathLength / 2);
      core.setLocalScale(coreWidth, sheathLength, coreWidth);

      for (const wisp of wisps) {
        const path = (time * wisp.speed + wisp.phase) % 1;
        const angle = time * 4.6 + wisp.phase * Math.PI * 2;
        wisp.entity.setLocalPosition(
          Math.cos(angle) * wisp.orbit,
          Math.sin(angle) * wisp.orbit,
          length * reveal * path
        );
        wisp.entity.setLocalEulerAngles(
          0,
          angle / DEG,
          Math.sin(angle * 1.6) * 38
        );
      }

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const path = (time * 2 + index / rings.length) % 1;
        ring.setLocalPosition(0, 0, length * reveal * (0.1 + path * 0.9));
        const ringScale =
          width * 0.9 * (1.3 + pulse * 0.8) * (0.55 + Math.sin(path * Math.PI) * 0.85);
        ring.setLocalScale(ringScale, ringScale, ringScale);
        ring.setLocalEulerAngles(90, 0, time * 220 + index * 42);
      }

      tip.setLocalPosition(0, 0, length * reveal);
      const tipScale = width * (1.6 + Math.sin(time * 30) * 0.25);
      tip.setLocalScale(tipScale, tipScale, tipScale);
      for (const eye of eyes) {
        const blink = Math.sin(time * 9 + eye.side) > 0.9 ? 0.15 : 1;
        eye.entity.setLocalPosition(
          eye.side * width * 0.45,
          width * 0.3,
          length * reveal
        );
        eye.entity.setLocalScale(
          width * 0.3 * blink,
          width * 0.3 * blink,
          width * 0.2 * blink
        );
      }

      mistMaterial.opacity = 0.22 * pulse * fade;
      bodyMaterial.opacity = 0.5 * pulse * fade;
      coreMaterial.opacity = 0.9 * pulse * fade;
      wispMaterial.opacity = 0.46 * fade;
      ringMaterial.opacity = 0.6 * fade;
      eyeMaterial.opacity = 0.95 * fade;
    });
  }

  /**
   * Chorro de agua a presión: un cañón de agua grueso y turbulento, no un tubo
   * limpio. Mezcla una neblina exterior, un cuerpo azul con bultos que recorren
   * la línea, un núcleo blanco con vetas rápidas, espuma en la boca y una
   * salpicadura en la punta. Todo son transformaciones y opacidad sobre
   * geometría estática.
   */
  private spawnWaterBeam(
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
    const root = new pc.Entity('water-beam');
    root.setPosition(x1, 0.7, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    this.app.root.addChild(root);

    const mistMaterial = this.createWaterMaterial(color, 0.18);
    const bodyMaterial = this.createWaterMaterial(color, 0.42);
    const coreMaterial = this.createWaterMaterial([236, 252, 255], 0.95);
    const foamMaterial = this.createWaterMaterial([216, 245, 255], 0.55);
    const streakMaterial = this.createWaterMaterial([250, 255, 255], 0.9);
    const ringMaterial = this.createWaterMaterial([200, 240, 255], 0.7);
    const materials = [
      mistMaterial,
      bodyMaterial,
      coreMaterial,
      foamMaterial,
      streakMaterial,
      ringMaterial
    ];

    const mistWidth = Math.max(0.14, width * 3.2);
    const bodyWidth = Math.max(0.1, width * 1.8);
    const coreWidth = Math.max(0.06, width * 0.9);

    const sheath = this.createEntity(this.sphereMesh, [mistMaterial], root);
    const body = this.createEntity(this.sphereMesh, [bodyMaterial], root);
    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);

    // Bultos que viajan por el chorro: rompen la silueta del tubo y transmiten
    // la presión del agua.
    const bulges: {
      entity: pc.Entity;
      phase: number;
      speed: number;
      wobble: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 12; index++) {
      const bulge = this.createEntity(this.sphereMesh, [bodyMaterial], root);
      const size = bodyWidth * (0.55 + Math.random() * 0.3);
      bulge.setLocalScale(size, size, size * 1.6);
      bulges.push({
        entity: bulge,
        phase: Math.random(),
        speed: 2.1 + Math.random() * 1.1,
        wobble: 14 + Math.random() * 10,
        size
      });
    }

    // Vetas blancas rápidas dentro del núcleo, como agua a toda velocidad.
    const streaks: {
      entity: pc.Entity;
      phase: number;
      speed: number;
      x: number;
      y: number;
      length: number;
    }[] = [];
    for (let index = 0; index < 14; index++) {
      const streak = this.createEntity(this.boxMesh, [streakMaterial], root);
      streaks.push({
        entity: streak,
        phase: Math.random(),
        speed: 4.2 + Math.random() * 2.2,
        x: (Math.random() - 0.5) * coreWidth * 0.9,
        y: (Math.random() - 0.5) * coreWidth * 0.7,
        length: length * (0.06 + Math.random() * 0.06)
      });
    }

    // Espuma en la boca del lanzador.
    const foam: {
      entity: pc.Entity;
      size: number;
      phase: number;
      z: number;
    }[] = [];
    for (let index = 0; index < 4; index++) {
      const bubble = this.createEntity(this.sphereMesh, [foamMaterial], root);
      const size = bodyWidth * (0.5 + Math.random() * 0.45);
      bubble.setLocalScale(size, size, size);
      foam.push({
        entity: bubble,
        size,
        phase: Math.random() * Math.PI * 2,
        z: 0.02 + Math.random() * 0.35
      });
    }

    // Salpicadura en la punta: casquete, dos ondas y gotas.
    const cap = this.createEntity(this.sphereMesh, [coreMaterial], root);
    cap.setLocalPosition(0, 0, length);
    const capScale = Math.max(0.12, width * 1.7);
    cap.setLocalScale(capScale, capScale, capScale);

    const splashRings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalEulerAngles(90, 0, 0);
      splashRings.push(ring);
    }

    const drops: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
      phase: number;
      speed: number;
    }[] = [];
    for (let index = 0; index < 12; index++) {
      const drop = this.createEntity(this.sphereMesh, [foamMaterial], root);
      const size = width * (0.12 + Math.random() * 0.14);
      drop.setLocalScale(size, size, size);
      drops.push({
        entity: drop,
        angle: Math.random() * Math.PI * 2,
        distance: width * (1.4 + Math.random() * 2.6),
        rise: width * (1 + Math.random() * 2),
        size,
        phase: Math.random(),
        speed: 1.8 + Math.random() * 1.6
      });
    }

    // Rocío localizado en la boca y en la punta: el chorro no lleva una niebla
    // continua en medio, solo salpicadura donde nace y donde impacta.
    this.spawnSporeParticles(
      root,
      {
        x: 0,
        y: 0,
        z: width * 0.6,
        extents: [width * 1.6, width * 1.4, width * 0.8],
        velocity: [0, 0.2, 1.5],
        velocityEnd: [0, 0.8, 3.4],
        radialSpeed: 0.6,
        radialSpeedEnd: 1.8,
        sizeStart: width * 0.8,
        sizeMid: width * 1.2,
        sizeEnd: width * 0.4,
        lifetime: 0.18,
        rate: 0.01,
        numParticles: 26,
        stretch: 0.3,
        localSpace: true,
        blendType: pc.BLEND_NORMAL
      },
      color,
      this.waterTexture
    );
    this.spawnSporeParticles(
      root,
      {
        x: 0,
        y: 0,
        z: length,
        extents: [width * 1.4, width * 1.2, width * 1.2],
        velocity: [0, 0.4, 0.6],
        velocityEnd: [0, 0.9, 1.2],
        radialSpeed: 1.4,
        radialSpeedEnd: 3.2,
        sizeStart: width * 0.9,
        sizeMid: width * 1.4,
        sizeEnd: width * 0.4,
        lifetime: 0.22,
        rate: 0.012,
        numParticles: 30,
        localSpace: true,
        blendType: pc.BLEND_NORMAL
      },
      color,
      this.waterTexture
    );

    let time = 0;
    this.addEffect(root, materials, 0.55, (_t, dt) => {
      time += dt;
      // El chorro sale del lanzador en el primer tramo del efecto.
      const advance = Math.min(1, time / 0.09);
      const reveal = 1 - (1 - advance) * (1 - advance);
      const visibleLength = Math.max(0.04, length * reveal);

      sheath.setLocalPosition(0, 0, visibleLength / 2);
      sheath.setLocalScale(mistWidth, mistWidth, visibleLength);
      body.setLocalPosition(0, 0, visibleLength / 2);
      body.setLocalScale(bodyWidth, bodyWidth, visibleLength);
      core.setLocalPosition(0, 0, visibleLength / 2);
      core.setLocalScale(coreWidth, coreWidth, visibleLength);

      for (const bulge of bulges) {
        const phase = (bulge.phase + time * bulge.speed) % 1;
        const wobble = Math.sin(time * bulge.wobble + bulge.phase * 6.28);
        const size = bulge.size * (0.82 + wobble * 0.22);
        bulge.entity.setLocalPosition(
          Math.sin(time * 13 + bulge.phase * 6.28) * coreWidth * 0.7,
          Math.cos(time * 11 + bulge.phase * 6.28) * coreWidth * 0.5,
          phase * visibleLength
        );
        bulge.entity.setLocalScale(size, size, size * 1.6);
      }

      for (const streak of streaks) {
        const phase = (streak.phase + time * streak.speed) % 1;
        streak.entity.setLocalPosition(
          streak.x,
          streak.y,
          phase * visibleLength
        );
        streak.entity.setLocalScale(
          Math.max(0.02, width * 0.09),
          Math.max(0.02, width * 0.09),
          Math.max(0.04, streak.length)
        );
      }

      for (const bubble of foam) {
        const pulse = 0.8 + Math.sin(time * 34 + bubble.phase) * 0.28;
        const size = bubble.size * pulse;
        bubble.entity.setLocalPosition(
          Math.sin(time * 18 + bubble.phase) * bodyWidth * 0.28,
          Math.cos(time * 16 + bubble.phase) * bodyWidth * 0.22,
          bubble.z * reveal
        );
        bubble.entity.setLocalScale(size, size, size);
      }

      const tipZ = visibleLength;
      const capPulse = 0.9 + Math.sin(time * 46) * 0.18;
      cap.setLocalPosition(0, 0, tipZ);
      cap.setLocalScale(
        capScale * capPulse,
        capScale * capPulse,
        capScale * capPulse
      );

      splashRings.forEach((ring, index) => {
        const phase = (time * 2.6 + index * 0.5) % 1;
        const scale = Math.max(0.08, width * (1.6 + phase * 5));
        ring.setLocalPosition(0, 0, tipZ);
        ring.setLocalScale(scale, scale, scale);
      });

      for (const drop of drops) {
        const phase = (drop.phase + time * drop.speed) % 1;
        const distance = drop.distance * phase;
        drop.entity.setLocalPosition(
          Math.cos(drop.angle) * distance,
          Math.sin(phase * Math.PI) * drop.rise,
          tipZ + Math.sin(drop.angle) * distance * 0.55
        );
        const fade = Math.max(0, 1 - phase);
        drop.entity.setLocalScale(
          drop.size * fade,
          drop.size * fade,
          drop.size * fade
        );
      }

      const fade = 1 - Math.max(0, (time - 0.3) / 0.25);
      mistMaterial.opacity = 0.16 * fade;
      bodyMaterial.opacity = 0.4 * fade;
      coreMaterial.opacity = 0.92 * fade;
      foamMaterial.opacity = 0.5 * fade;
      streakMaterial.opacity = 0.82 * fade;
      ringMaterial.opacity =
        0.62 * fade * Math.max(0, 1 - ((time * 2.6) % 1));
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
    const factory = this.aoeFactories[style] ?? this.aoeFactories.ring;
    this.withAnchors(areaAnchors(x, z, radius), () =>
      factory(x, z, radius, color, life)
    );
  }

  /** Anillo de área genérico: crece y se desvanece en el suelo. */
  private spawnRingAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.2, duration);
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
   * Área de agua: olas concéntricas que se abren desde el centro y gotas que
   * salpican. Se apoya en el suelo para leerse como una extensión de líquido.
   */
  private spawnWaterAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.3, duration);
    const root = new pc.Entity('water-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const fillMaterial = this.createWaterMaterial(color, 0.08);
    const ringMaterial = this.createWaterMaterial([206, 241, 255], 0.55);
    const dropMaterial = this.createWaterMaterial([226, 248, 255], 0.8);
    const materials = [fillMaterial, ringMaterial, dropMaterial];

    const fill = this.createEntity(this.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.02, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    const rings: pc.Entity[] = [];
    const ringCount = 3;
    for (let index = 0; index < ringCount; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.09, 0);
      ring.setLocalScale(0.2, 1, 0.2);
      rings.push(ring);
    }

    const drops: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      height: number;
      size: number;
      phase: number;
      speed: number;
    }[] = [];
    for (let index = 0; index < 16; index++) {
      const drop = this.createEntity(this.sphereMesh, [dropMaterial], root);
      const size = 0.07 + Math.random() * 0.07;
      drop.setLocalScale(size, size, size);
      drops.push({
        entity: drop,
        angle: Math.random() * Math.PI * 2,
        distance: radius * (0.35 + Math.random() * 0.6),
        height: 0.35 + Math.random() * 0.7,
        size,
        phase: Math.random(),
        speed: 1.4 + Math.random() * 0.9
      });
    }

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.12);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.25));
      const envelope = Math.min(fadeIn, fadeOut);

      fillMaterial.opacity = 0.07 * envelope;
      const fillScale = radius * 2 * (0.96 + Math.sin(time * 6) * 0.03);
      fill.setLocalScale(fillScale, 1, fillScale);

      rings.forEach((ring, index) => {
        const ringTime = time - index * 0.14;
        const phase =
          ringTime <= 0 ? 0 : (ringTime * 0.75) % 1;
        const scale = radius * 2 * (0.14 + phase * 0.86);
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalPosition(0, 0.09 + phase * 0.05, 0);
      });
      ringMaterial.opacity = 0.5 * envelope;

      for (const drop of drops) {
        const p = (drop.phase + time * drop.speed) % 1;
        const distance = drop.distance * (0.2 + p * 0.8);
        const rise = Math.sin(p * Math.PI) * drop.height;
        drop.entity.setLocalPosition(
          Math.cos(drop.angle) * distance,
          0.1 + rise,
          Math.sin(drop.angle) * distance
        );
        const fade = Math.max(0, 1 - p * 1.1);
        drop.entity.setLocalScale(
          drop.size * fade,
          drop.size * fade,
          drop.size * fade
        );
      }
      dropMaterial.opacity = 0.75 * envelope;
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

    const ringMaterial = this.createWaterMaterial(color, 0.45);
    const fillMaterial = this.createWaterMaterial(color, 0.1);
    const puffColor: [number, number, number] = [
      Math.min(255, color[0] + 46),
      Math.min(255, color[1] + 46),
      Math.min(255, color[2] + 46)
    ];
    const puffMaterial = this.createWaterMaterial(puffColor, 0.18);
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

      ringMaterial.opacity = (0.35 + pulse * 0.15) * envelope;
      fillMaterial.opacity = (0.08 + pulse * 0.04) * envelope;
      puffMaterial.opacity = (0.12 + pulse * 0.06) * envelope;

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
   * Explosión eléctrica: destello central, cúpula de energía, tres ondas de
   * choque en el suelo, arcos que cruzan el área, escombros que salen
   * despedidos y humo que se eleva. Todo son transformaciones sobre geometría
   * estática; la silueta la marcan las ondas y los escombros.
   */
  private spawnExplosionAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.3, duration);
    const root = new pc.Entity('explosion-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([255, 255, 236], 0.95);
    const hotMaterial = this.createMaterial([255, 232, 128], 0.5);
    const arcMaterial = this.createMaterial([170, 232, 255], 0.95);
    const debrisMaterial = this.createWaterMaterial([255, 186, 64], 0.95);
    const smokeMaterial = this.createWaterMaterial([92, 80, 72], 0.4);
    const materials = [
      coreMaterial,
      hotMaterial,
      arcMaterial,
      debrisMaterial,
      smokeMaterial
    ];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.55, 0);

    const dome = this.createEntity(this.sphereMesh, [hotMaterial], root);
    dome.setLocalPosition(0, 0.5, 0);

    const rings: {
      entity: pc.Entity;
      material: pc.StandardMaterial;
      delay: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const material = this.createWaterMaterial(color, 0.8);
      materials.push(material);
      const ring = this.createEntity(this.torusMesh, [material], root);
      ring.setLocalPosition(0, 0.08 + index * 0.05, 0);
      rings.push({ entity: ring, material, delay: index * 0.11 });
    }

    const arcs: { entity: pc.Entity; yaw: number; speed: number }[] = [];
    for (let index = 0; index < 4; index++) {
      const mesh = createLightningMesh(
        this.device,
        radius * 1.15,
        Math.max(0.018, radius * 0.02),
        8,
        7000 + index * 6151
      );
      const arc = this.createEntity(mesh, [arcMaterial], root);
      arc.setLocalPosition(0, 0.45 + index * 0.05, 0);
      arcs.push({
        entity: arc,
        yaw: (index / 4) * 360 + 22,
        speed: 40 + index * 35
      });
    }

    const debris: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
      yaw: number;
      roll: number;
    }[] = [];
    for (let index = 0; index < 14; index++) {
      const chunk = this.createEntity(this.boxMesh, [debrisMaterial], root);
      const size = radius * (0.035 + Math.random() * 0.045);
      chunk.setLocalScale(size * 2, size * 1.2, size * 2.6);
      debris.push({
        entity: chunk,
        angle: (index / 14) * Math.PI * 2 + Math.random() * 0.4,
        distance: radius * (0.55 + Math.random() * 0.6),
        rise: 0.35 + Math.random() * 0.85,
        size,
        yaw: Math.random() * 360,
        roll: (Math.random() - 0.5) * 160
      });
    }

    const smoke: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 8; index++) {
      const puff = this.createEntity(this.sphereMesh, [smokeMaterial], root);
      const size = radius * (0.18 + Math.random() * 0.16);
      puff.setLocalScale(size, size * 0.7, size);
      smoke.push({
        entity: puff,
        angle: (index / 8) * Math.PI * 2 + Math.random() * 0.5,
        distance: radius * (0.25 + Math.random() * 0.5),
        rise: 0.5 + Math.random() * 0.8,
        size
      });
    }

    this.addEffect(root, materials, life, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const flash = Math.max(0, 1 - t / 0.22);
      const coreScale = radius * (0.32 + ease * 0.58);
      core.setLocalScale(coreScale, coreScale, coreScale);
      const domeScale = radius * (0.4 + ease * 1);
      dome.setLocalScale(domeScale, domeScale * 0.72, domeScale);

      for (const ring of rings) {
        const local = Math.min(
          1,
          Math.max(0, (t - ring.delay) / 0.42)
        );
        const scale = radius * 2 * (0.14 + local * 0.86);
        ring.entity.setLocalScale(scale, 1, scale);
        ring.material.opacity =
          0.85 * Math.pow(Math.max(0, 1 - local), 1.4) * (1 - t * 0.4);
      }

      const arcReveal = Math.min(1, t / 0.14);
      const arcFade = Math.max(0, 1 - t / 0.42);
      for (const arc of arcs) {
        arc.entity.setLocalEulerAngles(
          0,
          arc.yaw + t * arc.speed,
          Math.sin(t * 22 + arc.speed) * 12
        );
        arc.entity.setLocalScale(
          0.35 + arcReveal * 0.65,
          0.4 + arcReveal * 0.6,
          0.35 + arcReveal * 0.65
        );
      }

      for (const chunk of debris) {
        const local = Math.min(1, Math.max(0, (t - 0.04) / 0.7));
        const distance = chunk.distance * local;
        chunk.entity.setLocalPosition(
          Math.cos(chunk.angle) * distance,
          0.25 + Math.sin(local * Math.PI) * chunk.rise,
          Math.sin(chunk.angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        chunk.entity.setLocalScale(
          chunk.size * 2 * fade,
          chunk.size * 1.2 * fade,
          chunk.size * 2.6 * fade
        );
        chunk.entity.setLocalEulerAngles(
          chunk.yaw + t * 260,
          chunk.yaw + t * 190,
          chunk.roll + t * 140
        );
      }

      for (const puff of smoke) {
        const local = Math.min(1, t / 0.9);
        const distance = puff.distance * (0.35 + local * 1.2);
        puff.entity.setLocalPosition(
          Math.cos(puff.angle) * distance,
          0.35 + local * puff.rise,
          Math.sin(puff.angle) * distance
        );
        const grow = 0.85 + local * 1.1;
        const fade = Math.max(0, 1 - local);
        puff.entity.setLocalScale(
          puff.size * grow * fade,
          puff.size * 0.7 * grow * fade,
          puff.size * grow * fade
        );
      }

      coreMaterial.opacity = 0.95 * flash;
      hotMaterial.opacity = 0.45 * (1 - t) * (1 - t);
      arcMaterial.opacity = 0.95 * arcFade;
      debrisMaterial.opacity = 0.95 * (1 - t);
      smokeMaterial.opacity = 0.4 * (1 - t);
    });
  }

  /**
   * Área fantasma: disco tenue, anillo morado, jirones que suben del suelo y
   * ojos que se encienden y se apagan alrededor del borde. Disponible para
   * futuras habilidades de área de tipo Fantasma.
   */
  private spawnGhostAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.2, duration);
    const root = new pc.Entity('ghost-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const ringMaterial = this.createWaterMaterial([190, 150, 255], 0.55);
    const fillMaterial = this.createWaterMaterial(color, 0.1);
    const wispMaterial = this.createWaterMaterial([158, 118, 226], 0.45);
    const eyeMaterial = this.createMaterial([255, 244, 198], 0.9);
    const materials = [
      ringMaterial,
      fillMaterial,
      wispMaterial,
      eyeMaterial
    ];

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.1, 0);
    ring.setLocalScale(radius * 2, 1, radius * 2);

    const fill = this.createEntity(this.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.03, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    const wisps: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      delay: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 10; index++) {
      const wisp = this.createEntity(this.boxMesh, [wispMaterial], root);
      const size = radius * (0.05 + Math.random() * 0.05);
      wisp.setLocalScale(size, size, size * 3.4);
      wisps.push({
        entity: wisp,
        angle: (index / 10) * Math.PI * 2 + Math.random() * 0.4,
        distance: radius * (0.25 + Math.random() * 0.6),
        delay: Math.random() * 0.5,
        rise: radius * (0.35 + Math.random() * 0.4),
        size
      });
    }

    const eyes: { entity: pc.Entity; phase: number }[] = [];
    for (let index = 0; index < 4; index++) {
      const angle = (index / 4) * Math.PI * 2 + 0.6;
      const eye = this.createEntity(this.sphereMesh, [eyeMaterial], root);
      eye.setLocalPosition(
        Math.cos(angle) * radius * 0.72,
        0.45,
        Math.sin(angle) * radius * 0.72
      );
      eyes.push({ entity: eye, phase: index * 1.4 });
    }

    let time = 0;
    this.addEffect(root, materials, life, (_t, dt) => {
      time += dt;
      const pulse = 0.5 + Math.sin(time * 6) * 0.2;
      ringMaterial.opacity = (0.35 + pulse * 0.2) * (1 - time / life);
      fillMaterial.opacity = (0.06 + pulse * 0.04) * (1 - time / life);

      for (const wisp of wisps) {
        const local = Math.max(0, Math.min(1, (time - wisp.delay) / 1.2));
        wisp.entity.setLocalPosition(
          Math.cos(wisp.angle) * wisp.distance,
          0.1 + local * wisp.rise,
          Math.sin(wisp.angle) * wisp.distance
        );
        const fade = Math.max(0, 1 - local);
        wisp.entity.setLocalScale(
          wisp.size * fade,
          wisp.size * fade,
          wisp.size * 3.4 * fade
        );
        wisp.entity.setLocalEulerAngles(
          local * 60,
          wisp.angle / DEG,
          local * 35
        );
      }

      for (const eye of eyes) {
        const blink =
          Math.sin(time * 3.2 + eye.phase) > 0.2
            ? 0.09
            : 0.02;
        eye.entity.setLocalScale(blink, blink, blink * 0.6);
      }
      eyeMaterial.opacity = 0.85 * (1 - time / life);
    });
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
      anchors: areaAnchors(x, z, radius),
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

    this.applyVisibility(root, areaAnchors(x, z, radius));
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

    this.addEffect(
      entity,
      [material],
      0.35,
      (t) => {
        material.opacity = 0.7 * (1 - t);
      },
      [
        [x1, z1],
        [x2, z2]
      ]
    );
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

    this.addEffect(
      entity,
      [material],
      0.65,
      (t) => {
        const scale = Math.max(0.3, radius * 2) * (0.35 + 0.85 * t);
        entity.setLocalScale(scale, 1, scale);
        entity.setPosition(x, 0.15 + t * 0.8, z);
        material.opacity = 0.8 * (1 - t);
      },
      [[x, z]]
    );
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
    }, [[x, z]]);
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

  /** Impacto de agua: salpicadura con núcleo, ondas y gotas radiales. */
  spawnWaterBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    _effectiveness: number
  ): void {
    const root = new pc.Entity('water-burst');
    root.setPosition(x, 0.04, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createWaterMaterial([234, 251, 255], 0.95);
    const bodyMaterial = this.createWaterMaterial(color, 0.6);
    const ringMaterial = this.createWaterMaterial([205, 240, 255], 0.75);
    const dropMaterial = this.createWaterMaterial([224, 248, 255], 0.85);
    const materials = [coreMaterial, bodyMaterial, ringMaterial, dropMaterial];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.62, 0);
    core.setLocalScale(0.24, 0.24, 0.24);

    const body = this.createEntity(this.sphereMesh, [bodyMaterial], root);
    body.setLocalPosition(0, 0.55, 0);
    body.setLocalScale(0.4, 0.34, 0.4);

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.1 + index * 0.06, 0);
      ring.setLocalScale(0.4, 1, 0.4);
      rings.push(ring);
    }

    const drops: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      height: number;
      size: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 12; index++) {
      const drop = this.createEntity(this.sphereMesh, [dropMaterial], root);
      const size = 0.07 + Math.random() * 0.06;
      drop.setLocalScale(size, size, size);
      drops.push({
        entity: drop,
        angle: Math.random() * Math.PI * 2,
        distance: 0.55 + Math.random() * 0.7,
        height: 0.45 + Math.random() * 0.55,
        size,
        delay: Math.random() * 0.08
      });
    }

    this.addEffect(root, materials, 0.5, (t) => {
      const local = Math.min(1, Math.max(0, t));
      const ease = 1 - Math.pow(1 - local, 3);
      const coreScale = 0.24 + ease * 0.55;
      core.setLocalScale(coreScale, coreScale, coreScale);
      core.setLocalPosition(0, 0.62 + ease * 0.12, 0);
      coreMaterial.opacity = 0.95 * (1 - local);

      body.setLocalScale(
        0.4 + ease * 0.5,
        0.34 + ease * 0.4,
        0.4 + ease * 0.5
      );
      bodyMaterial.opacity = 0.55 * (1 - local);

      rings.forEach((ring, index) => {
        const ringT = Math.min(1, Math.max(0, (t - index * 0.06) / 0.32));
        const ringEase = 1 - Math.pow(1 - ringT, 2);
        const scale = 0.35 + ringEase * 1.5;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalPosition(0, 0.1 + ringEase * 0.18, 0);
      });
      ringMaterial.opacity = 0.7 * (1 - local);

      for (const drop of drops) {
        const dropT = Math.min(
          1,
          Math.max(0, (t - drop.delay) / 0.38)
        );
        const distance = drop.distance * (0.15 + dropT);
        const rise = Math.sin(dropT * Math.PI) * drop.height;
        drop.entity.setLocalPosition(
          Math.cos(drop.angle) * distance,
          0.28 + rise,
          Math.sin(drop.angle) * distance
        );
        const fade = Math.max(0, 1 - dropT);
        const size = drop.size * fade;
        drop.entity.setLocalScale(size, size, size);
      }
      dropMaterial.opacity = 0.85 * (1 - local);
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

  /** Elige la fábrica de impacto según el estilo de la habilidad. */
  spawnImpact(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number,
    style: ImpactStyle = 'hit'
  ): void {
    const effect = this.impactEffects[style] ?? this.impactEffects.hit;
    this.withAnchors([[x, z]] as FxAnchors, () =>
      effect(x, z, color, effectiveness)
    );
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

    this.addEffect(
      entity,
      [material],
      0.3,
      (t) => {
        const scale = 0.25 + t * (effectiveness > 1 ? 1.35 : 0.85);
        entity.setLocalScale(scale, scale, scale);
        entity.setPosition(x, 0.65 + t * 0.15, z);
        material.opacity = 0.95 * (1 - t);
      },
      [[x, z]]
    );
  }

  /**
   * Explosión de aura: núcleo claro, cuerpo azul que se expande, dos ondas y
   * motas que salen despedidas. La mezcla normal mantiene el azul legible.
   */
  private spawnAuraBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const root = new pc.Entity('aura-burst');
    root.setPosition(x, 0, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([240, 250, 255], 0.95);
    const bodyMaterial = this.createAuraMaterial(color, 0.5);
    const ringMaterial = this.createAuraMaterial([196, 228, 255], 0.72);
    const moteMaterial = this.createAuraMaterial([220, 242, 255], 0.9);
    const materials = [coreMaterial, bodyMaterial, ringMaterial, moteMaterial];
    const power =
      effectiveness > 1 ? 1.25 : effectiveness < 1 ? 0.85 : 1;

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.65, 0);
    const body = this.createEntity(this.sphereMesh, [bodyMaterial], root);
    body.setLocalPosition(0, 0.65, 0);
    body.setLocalScale(0.2, 0.2, 0.2);

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.08 + index * 0.5, 0);
      rings.push(ring);
    }

    const motes: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const mote = this.createEntity(this.sphereMesh, [moteMaterial], root);
      const size = 0.07 + (index % 3) * 0.025;
      mote.setLocalScale(size, size, size);
      motes.push({
        entity: mote,
        angle: (index / 7) * Math.PI * 2 + Math.random() * 0.3,
        distance: (0.55 + Math.random() * 0.55) * power,
        rise: 0.25 + Math.random() * 0.55,
        size
      });
    }

    this.addEffect(root, materials, 0.42, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const coreScale = (0.2 + ease * 1.15) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      const bodyScale = (0.2 + ease * 1.9) * power;
      body.setLocalScale(bodyScale, bodyScale, bodyScale);

      rings.forEach((ring, index) => {
        const scale = (0.25 + ease * (2.1 + index * 0.45)) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(90, t * (index === 0 ? 180 : -140), 0);
      });

      for (const mote of motes) {
        const local = Math.min(1, Math.max(0, (t - 0.04) / 0.8));
        const distance = mote.distance * local;
        mote.entity.setLocalPosition(
          Math.cos(mote.angle) * distance,
          0.65 + Math.sin(local * Math.PI) * mote.rise,
          Math.sin(mote.angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        mote.entity.setLocalScale(
          mote.size * fade,
          mote.size * fade,
          mote.size * fade
        );
      }

      coreMaterial.opacity = 0.95 * (1 - t);
      bodyMaterial.opacity = 0.5 * (1 - t);
      ringMaterial.opacity = 0.72 * (1 - t);
      moteMaterial.opacity = 0.9 * (1 - t);
    });
  }

  /**
   * Impacto fantasma: destello violáceo, cuerpo oscuro, dos ondas, jirones que
   * suben y un par de ojos que aparecen un instante antes de desvanecerse.
   */
  private spawnGhostBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const root = new pc.Entity('ghost-burst');
    root.setPosition(x, 0, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([240, 230, 255], 0.95);
    const bodyMaterial = this.createWaterMaterial(color, 0.55);
    const ringMaterial = this.createWaterMaterial([198, 170, 255], 0.6);
    const wispMaterial = this.createWaterMaterial([158, 118, 226], 0.5);
    const eyeMaterial = this.createMaterial([255, 244, 198], 0.95);
    const materials = [
      coreMaterial,
      bodyMaterial,
      ringMaterial,
      wispMaterial,
      eyeMaterial
    ];
    const power =
      effectiveness > 1 ? 1.24 : effectiveness < 1 ? 0.86 : 1;

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.7, 0);
    const body = this.createEntity(this.sphereMesh, [bodyMaterial], root);
    body.setLocalPosition(0, 0.7, 0);

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.08 + index * 0.5, 0);
      rings.push(ring);
    }

    const wisps: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const wisp = this.createEntity(this.boxMesh, [wispMaterial], root);
      const size = 0.12 + Math.random() * 0.12;
      wisp.setLocalScale(size, size, size * 3);
      wisps.push({
        entity: wisp,
        angle: (index / 7) * Math.PI * 2 + Math.random() * 0.4,
        distance: (0.4 + Math.random() * 0.55) * power,
        rise: 0.5 + Math.random() * 0.5,
        size
      });
    }

    const eyes: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const eye = this.createEntity(this.sphereMesh, [eyeMaterial], root);
      eye.setLocalPosition((index === 0 ? -1 : 1) * 0.18, 0.9, 0.12);
      eyes.push(eye);
    }

    this.addEffect(root, materials, 0.45, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const coreScale = (0.16 + ease * 0.62) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      const bodyScale = (0.2 + ease * 1.15) * power;
      body.setLocalScale(bodyScale, bodyScale, bodyScale);

      for (const ring of rings) {
        const scale = (0.2 + ease * 1.7) * power;
        ring.setLocalScale(scale, 1, scale);
      }

      for (const wisp of wisps) {
        const local = Math.min(1, Math.max(0, (t - 0.04) / 0.8));
        const distance = wisp.distance * local;
        const angle = wisp.angle + local * 1.4;
        wisp.entity.setLocalPosition(
          Math.cos(angle) * distance,
          0.35 + Math.sin(local * Math.PI) * wisp.rise,
          Math.sin(angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        wisp.entity.setLocalScale(
          wisp.size * fade,
          wisp.size * fade,
          wisp.size * 3.2 * fade
        );
        wisp.entity.setLocalEulerAngles(
          local * 70,
          angle / DEG,
          local * 45
        );
      }

      const eyeFade = Math.max(0, 1 - Math.max(0, (t - 0.18) / 0.28));
      const eyeScale = 0.1 * power * eyeFade;
      for (const eye of eyes) {
        eye.setLocalScale(eyeScale, eyeScale, eyeScale * 0.7);
      }

      coreMaterial.opacity = 0.95 * (1 - t);
      bodyMaterial.opacity = 0.5 * (1 - t);
      ringMaterial.opacity = 0.6 * (1 - t);
      wispMaterial.opacity = 0.5 * (1 - t);
      eyeMaterial.opacity = 0.95 * eyeFade;
    });
  }

  /**
   * Impacto de sombra: núcleo claro, cuerpo violeta, tres tajos que se cruzan
   * y jirones que suben. La mezcla normal evita que el violeta se lave.
   */
  private spawnDarkBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const root = new pc.Entity('dark-burst');
    root.setPosition(x, 0, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([232, 216, 255], 0.95);
    const bodyMaterial = this.createWaterMaterial(color, 0.55);
    const slashMaterial = this.createWaterMaterial([210, 180, 255], 0.85);
    const ringMaterial = this.createWaterMaterial([196, 164, 255], 0.6);
    const wispMaterial = this.createWaterMaterial([160, 124, 226], 0.45);
    const smokeMaterial = this.createWaterMaterial([74, 46, 126], 0.4);
    const materials = [
      coreMaterial,
      bodyMaterial,
      slashMaterial,
      ringMaterial,
      wispMaterial,
      smokeMaterial
    ];
    const power =
      effectiveness > 1 ? 1.24 : effectiveness < 1 ? 0.86 : 1;

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.65, 0);
    const body = this.createEntity(this.sphereMesh, [bodyMaterial], root);
    body.setLocalPosition(0, 0.65, 0);

    const slashes: { entity: pc.Entity; yaw: number; roll: number; delay: number }[] =
      [];
    for (let index = 0; index < 3; index++) {
      const slash = this.createEntity(this.boxMesh, [slashMaterial], root);
      slash.setLocalPosition(0, 0.65, 0);
      slashes.push({
        entity: slash,
        yaw: index * 60 + 30,
        roll: (index - 1) * 26,
        delay: index * 0.03
      });
    }

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.08 + index * 0.5, 0);
      rings.push(ring);
    }

    const wisps: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const wisp = this.createEntity(this.sphereMesh, [wispMaterial], root);
      const size = 0.16 + Math.random() * 0.16;
      wisp.setLocalScale(size, size * 0.7, size);
      wisps.push({
        entity: wisp,
        angle: (index / 7) * Math.PI * 2 + Math.random() * 0.35,
        distance: (0.5 + Math.random() * 0.55) * power,
        rise: 0.35 + Math.random() * 0.5,
        size
      });
    }

    const smoke: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 4; index++) {
      const puff = this.createEntity(this.sphereMesh, [smokeMaterial], root);
      const size = 0.35 + Math.random() * 0.25;
      puff.setLocalScale(size, size * 0.7, size);
      smoke.push({
        entity: puff,
        angle: (index / 4) * Math.PI * 2 + Math.random() * 0.5,
        distance: (0.25 + Math.random() * 0.35) * power,
        rise: 0.25 + Math.random() * 0.35,
        size
      });
    }

    this.addEffect(root, materials, 0.4, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const coreScale = (0.16 + ease * 0.62) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      const bodyScale = (0.18 + ease * 1.1) * power;
      body.setLocalScale(bodyScale, bodyScale, bodyScale);

      slashes.forEach((slash) => {
        const local = Math.min(
          1,
          Math.max(0, (t - slash.delay) / 0.38)
        );
        const length = (0.45 + local * 1.35) * power;
        const thickness = 0.09 * (1 - local * 0.35);
        slash.entity.setLocalScale(thickness, thickness, length);
        slash.entity.setLocalEulerAngles(
          0,
          slash.yaw + local * 20,
          slash.roll + local * 32
        );
      });

      for (const ring of rings) {
        const scale = (0.2 + ease * 1.8) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(90, t * 220, 0);
      }

      for (const wisp of wisps) {
        const local = Math.min(1, Math.max(0, (t - 0.04) / 0.8));
        const distance = wisp.distance * local;
        wisp.entity.setLocalPosition(
          Math.cos(wisp.angle) * distance,
          0.4 + Math.sin(local * Math.PI) * wisp.rise,
          Math.sin(wisp.angle) * distance
        );
        const grow = 0.7 + local * 0.8;
        const fade = Math.max(0, 1 - local);
        wisp.entity.setLocalScale(
          wisp.size * grow * fade,
          wisp.size * 0.7 * grow * fade,
          wisp.size * grow * fade
        );
      }

      for (const puff of smoke) {
        const local = Math.min(1, Math.max(0, t / 0.9));
        const distance = puff.distance * (0.4 + local * 1.2);
        puff.entity.setLocalPosition(
          Math.cos(puff.angle) * distance,
          0.4 + local * puff.rise,
          Math.sin(puff.angle) * distance
        );
        const grow = 0.8 + local * 0.9;
        const fade = Math.max(0, 1 - local);
        puff.entity.setLocalScale(
          puff.size * grow * fade,
          puff.size * 0.7 * grow * fade,
          puff.size * grow * fade
        );
      }

      coreMaterial.opacity = 0.95 * (1 - t);
      bodyMaterial.opacity = 0.32 * (1 - t);
      slashMaterial.opacity = 0.9 * (1 - t);
      ringMaterial.opacity = 0.6 * (1 - t);
      wispMaterial.opacity = 0.45 * (1 - t);
      smokeMaterial.opacity = 0.4 * (1 - t);
    });
  }

  /**
   * Impacto de shuriken: cuatro hojas de agua que salen girando desde el punto
   * de golpe, con un destello central, dos ondas y gotas pequeñas.
   */
  private spawnShurikenBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const root = new pc.Entity('shuriken-burst');
    root.setPosition(x, 0, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([255, 255, 255], 0.95);
    const bladeMaterial = this.createWaterMaterial([196, 240, 255], 0.95);
    const ringMaterial = this.createWaterMaterial(color, 0.6);
    const dropMaterial = this.createWaterMaterial([220, 246, 255], 0.8);
    const materials = [
      coreMaterial,
      bladeMaterial,
      ringMaterial,
      dropMaterial
    ];
    const power =
      effectiveness > 1 ? 1.24 : effectiveness < 1 ? 0.86 : 1;

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.62, 0);

    const starPivot = new pc.Entity('shuriken-impact-pivot');
    starPivot.setLocalPosition(0, 0.62, 0);
    root.addChild(starPivot);
    const star = this.createEntity(
      createShurikenMesh(this.device, 0.95, 0.26),
      [bladeMaterial],
      starPivot
    );
    star.setLocalEulerAngles(90, 0, 0);
    const innerStar = this.createEntity(
      createShurikenMesh(this.device, 0.58, 0.16),
      [coreMaterial],
      star
    );
    innerStar.setLocalEulerAngles(0, 0, 22);

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.06 + index * 0.45, 0);
      rings.push(ring);
    }

    const drops: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 8; index++) {
      const drop = this.createEntity(this.sphereMesh, [dropMaterial], root);
      const size = 0.06 + Math.random() * 0.05;
      drop.setLocalScale(size, size, size);
      drops.push({
        entity: drop,
        angle: (index / 8) * Math.PI * 2 + Math.random() * 0.4,
        distance: (0.55 + Math.random() * 0.6) * power,
        rise: 0.25 + Math.random() * 0.45,
        size
      });
    }

    this.addEffect(root, materials, 0.34, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const coreScale = (0.14 + ease * 0.5) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);

      const starScale = (0.22 + ease * 1.25) * power;
      starPivot.setLocalScale(starScale, starScale, starScale);
      starPivot.setLocalEulerAngles(0, t * 300, 0);

      for (const ring of rings) {
        const scale = (0.18 + ease * 1.7) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(90, t * 200, 0);
      }

      for (const drop of drops) {
        const local = Math.min(1, Math.max(0, (t - 0.02) / 0.8));
        const distance = drop.distance * local;
        drop.entity.setLocalPosition(
          Math.cos(drop.angle) * distance,
          0.4 + Math.sin(local * Math.PI) * drop.rise,
          Math.sin(drop.angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        drop.entity.setLocalScale(
          drop.size * fade,
          drop.size * fade,
          drop.size * fade
        );
      }

      coreMaterial.opacity = 0.95 * (1 - t);
      bladeMaterial.opacity = 0.95 * (1 - t);
      ringMaterial.opacity = 0.6 * (1 - t);
      dropMaterial.opacity = 0.8 * (1 - t);
    });
  }

  /**
   * Impacto de acero: tres tajos largos que se cruzan, esquirlas metálicas y
   * chispas. El destello es pequeño para que la silueta la den los filos.
   */
  private spawnSteelBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const root = new pc.Entity('steel-burst');
    root.setPosition(x, 0, z);
    this.app.root.addChild(root);

    const flashMaterial = this.createMaterial([246, 251, 255], 0.9);
    const slashMaterial = this.createMaterial([224, 242, 255], 0.9);
    const steelMaterial = this.createAuraMaterial(color, 0.8);
    const ringMaterial = this.createAuraMaterial(color, 0.55);
    const sparkMaterial = this.createMaterial([255, 250, 218], 0.95);
    const materials = [
      flashMaterial,
      slashMaterial,
      steelMaterial,
      ringMaterial,
      sparkMaterial
    ];
    const power =
      effectiveness > 1 ? 1.22 : effectiveness < 1 ? 0.86 : 1;

    const flash = this.createEntity(this.sphereMesh, [flashMaterial], root);
    flash.setLocalPosition(0, 0.65, 0);

    const slashes: {
      entity: pc.Entity;
      yaw: number;
      roll: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const slash = this.createEntity(this.boxMesh, [slashMaterial], root);
      slashes.push({
        entity: slash,
        yaw: index * 60 + 15,
        roll: (index - 1) * 24,
        delay: index * 0.025
      });
    }

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.08 + index * 0.5, 0);
      rings.push(ring);
    }

    const shards: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      length: number;
      yaw: number;
      roll: number;
    }[] = [];
    for (let index = 0; index < 6; index++) {
      const shard = this.createEntity(this.boxMesh, [steelMaterial], root);
      shards.push({
        entity: shard,
        angle: (index / 6) * Math.PI * 2 + 0.35,
        distance: (0.45 + Math.random() * 0.5) * power,
        rise: 0.12 + Math.random() * 0.35,
        length: 0.28 + Math.random() * 0.26,
        yaw: Math.random() * 360,
        roll: (Math.random() - 0.5) * 120
      });
    }

    const sparks: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 8; index++) {
      const spark = this.createEntity(this.sphereMesh, [sparkMaterial], root);
      const size = 0.05 + Math.random() * 0.04;
      spark.setLocalScale(size, size, size);
      sparks.push({
        entity: spark,
        angle: Math.random() * Math.PI * 2,
        distance: (0.55 + Math.random() * 0.8) * power,
        rise: 0.25 + Math.random() * 0.55,
        size
      });
    }

    this.addEffect(root, materials, 0.34, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const flashScale = (0.14 + ease * 0.42) * power;
      flash.setLocalScale(flashScale, flashScale, flashScale);

      slashes.forEach((slash) => {
        const local = Math.min(
          1,
          Math.max(0, (t - slash.delay) / 0.42)
        );
        const length = (0.3 + local * 1.05) * power;
        const thickness = 0.05 * (1 - local * 0.45);
        slash.entity.setLocalScale(thickness, thickness, length);
        slash.entity.setLocalEulerAngles(
          0,
          slash.yaw + local * 18,
          slash.roll + local * 30
        );
      });

      for (const ring of rings) {
        const scale = (0.2 + ease * 1.7) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(90, t * 240, 0);
      }

      for (const shard of shards) {
        const local = Math.min(1, Math.max(0, (t - 0.03) / 0.75));
        const distance = shard.distance * local;
        shard.entity.setLocalPosition(
          Math.cos(shard.angle) * distance,
          0.65 + Math.sin(local * Math.PI) * shard.rise,
          Math.sin(shard.angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        shard.entity.setLocalScale(
          0.07 * fade,
          0.07 * fade,
          shard.length * fade
        );
        shard.entity.setLocalEulerAngles(
          shard.yaw + t * 180,
          shard.yaw + t * 240,
          shard.roll
        );
      }

      for (const spark of sparks) {
        const local = Math.min(1, Math.max(0, (t - 0.02) / 0.82));
        const distance = spark.distance * local;
        spark.entity.setLocalPosition(
          Math.cos(spark.angle) * distance,
          0.65 + Math.sin(local * Math.PI) * spark.rise,
          Math.sin(spark.angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        spark.entity.setLocalScale(
          spark.size * fade,
          spark.size * fade,
          spark.size * fade
        );
      }

      flashMaterial.opacity = 0.9 * (1 - t);
      slashMaterial.opacity = 0.9 * (1 - t);
      steelMaterial.opacity = 0.8 * (1 - t);
      ringMaterial.opacity = 0.55 * (1 - t);
      sparkMaterial.opacity = 0.95 * (1 - t);
    });
  }

  /**
   * Impacto de lucha: tres focos de golpe escalonados con líneas de impacto
   * cruzadas, una onda en el suelo y polvo de aura. Se lee como una ráfaga de
   * puñetazos, no como una única explosión.
   */
  private spawnFightingBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const root = new pc.Entity('fighting-burst');
    root.setPosition(x, 0, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([255, 246, 224], 0.9);
    const lineMaterial = this.createMaterial([236, 248, 255], 0.9);
    const ringMaterial = this.createAuraMaterial(color, 0.65);
    const puffMaterial = this.createAuraMaterial([196, 226, 255], 0.34);
    const materials = [coreMaterial, lineMaterial, ringMaterial, puffMaterial];
    const power =
      effectiveness > 1 ? 1.25 : effectiveness < 1 ? 0.85 : 1;

    const clusters: {
      core: pc.Entity;
      lines: { entity: pc.Entity; angle: number }[];
      delay: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const angle = (index / 3) * Math.PI * 2 + 0.4;
      const offset = (0.12 + index * 0.06) * power;
      const cluster = new pc.Entity('fighting-cluster');
      cluster.setLocalPosition(
        Math.cos(angle) * offset,
        0.68 + index * 0.04,
        Math.sin(angle) * offset
      );
      root.addChild(cluster);

      const core = this.createEntity(this.sphereMesh, [coreMaterial], cluster);
      const lines: { entity: pc.Entity; angle: number }[] = [];
      for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
        const line = this.createEntity(this.boxMesh, [lineMaterial], cluster);
        lines.push({
          entity: line,
          angle: (lineIndex / 4) * Math.PI * 2 + index * 0.5
        });
      }
      clusters.push({ core, lines, delay: index * 0.05 });
    }

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.08, 0);

    const puffs: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const puff = this.createEntity(this.sphereMesh, [puffMaterial], root);
      const size = 0.2 + Math.random() * 0.18;
      puff.setLocalScale(size, size * 0.8, size);
      puffs.push({
        entity: puff,
        angle: (index / 7) * Math.PI * 2 + Math.random() * 0.35,
        distance: (0.55 + Math.random() * 0.55) * power,
        rise: 0.25 + Math.random() * 0.45,
        size
      });
    }

    this.addEffect(root, materials, 0.42, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const ringScale = (0.22 + ease * 2.1) * power;
      ring.setLocalScale(ringScale, 1, ringScale);
      ring.setLocalEulerAngles(90, t * 160, 0);

      for (const cluster of clusters) {
        const local = Math.min(
          1,
          Math.max(0, (t - cluster.delay) / 0.32)
        );
        const appear = local <= 0 ? 0 : 1;
        const fade = Math.max(0, 1 - local);
        const coreScale = (0.08 + local * 0.42) * appear;
        cluster.core.setLocalScale(coreScale, coreScale, coreScale);

        for (const line of cluster.lines) {
          const distance = (0.1 + local * 0.45) * power;
          line.entity.setLocalPosition(
            Math.sin(line.angle) * distance,
            0,
            Math.cos(line.angle) * distance
          );
          line.entity.setLocalScale(
            0.035 * fade,
            0.035 * fade,
            (0.16 + local * 0.42) * fade
          );
          line.entity.setLocalEulerAngles(0, line.angle / DEG, 0);
        }
      }

      for (const puff of puffs) {
        const local = Math.min(1, Math.max(0, (t - 0.03) / 0.78));
        const distance = puff.distance * local;
        puff.entity.setLocalPosition(
          Math.cos(puff.angle) * distance,
          0.35 + Math.sin(local * Math.PI) * puff.rise,
          Math.sin(puff.angle) * distance
        );
        const grow = 0.7 + local * 0.6;
        const fade = Math.max(0, 1 - local);
        puff.entity.setLocalScale(
          puff.size * grow * fade,
          puff.size * 0.8 * grow * fade,
          puff.size * grow * fade
        );
      }

      coreMaterial.opacity = 0.9 * (1 - t);
      lineMaterial.opacity = 0.9 * (1 - t);
      ringMaterial.opacity = 0.65 * (1 - t);
      puffMaterial.opacity = 0.34 * (1 - t);
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

  /**
   * Proyectil de aire: dos ruedas de aspas de viento cruzadas giran alrededor
   * del eje de vuelo, con núcleo blanco, halo cálido y una estela de plumas. La
   * mezcla normal mantiene el blanco legible sobre el cielo y la hierba.
   */
  private spawnAirProjectile(
    x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]
  ): EffectHandle {
    const root = new pc.Entity('air-projectile');
    root.setPosition(x, 0.82, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    this.app.root.addChild(root);

    const coreMaterial = this.createWaterMaterial([255, 252, 240], 0.9);
    const glowMaterial = this.createWaterMaterial(color, 0.16);
    const bladeMaterial = this.createWaterMaterial([255, 240, 210], 0.62);
    const hotMaterial = this.createMaterial(color, 0.5);
    const featherMaterial = this.createLeafMaterial([255, 228, 176], 0.85);
    const materials = [
      coreMaterial,
      glowMaterial,
      bladeMaterial,
      hotMaterial,
      featherMaterial
    ];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.15, radius * 1.15, radius * 1.15);
    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 4, radius * 4, radius * 4);

    // Dos ruedas perpendiculares: una sola medialuna se vería de canto desde
    // media cámara; la cruz mantiene el aspa con volumen en el splitscreen.
    const wheel = new pc.Entity('air-wheel');
    root.addChild(wheel);
    const crossWheel = new pc.Entity('air-wheel-cross');
    crossWheel.setLocalEulerAngles(0, 90, 0);
    root.addChild(crossWheel);
    for (let index = 0; index < 3; index++) {
      const blade = this.createEntity(
        createWindBladeMesh(this.device, radius * 5, 1.08, radius * 1.35, 10),
        [index === 1 ? hotMaterial : bladeMaterial],
        wheel
      );
      blade.setLocalEulerAngles(0, 0, index * 120);
      const cross = this.createEntity(
        createWindBladeMesh(this.device, radius * 3.9, 0.98, radius * 1.05, 10),
        [index === 2 ? hotMaterial : bladeMaterial],
        crossWheel
      );
      cross.setLocalEulerAngles(0, 0, index * 120 + 60);
    }

    const feathers: {
      entity: pc.Entity;
      phase: number;
      baseY: number;
      baseZ: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const baseZ = -radius * (2.4 + index * 1.2);
      const feather = this.createLeaf(root, featherMaterial, {
        x: (index - 1) * radius * 1.1,
        y: (index % 2 === 0 ? 1 : -1) * radius * 0.35,
        z: baseZ,
        width: radius * 0.9,
        height: radius * 2.2,
        yaw: index * 55,
        roll: 25 + index * 20
      });
      feathers.push({
        entity: feather,
        phase: index * 1.7,
        baseY: feather.getLocalPosition().y,
        baseZ
      });
    }

    const trails: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const trail = this.createEntity(this.boxMesh, [hotMaterial], root);
      trail.setLocalPosition(0, (index === 0 ? -1 : 1) * radius * 0.45, -radius * 2.2);
      trail.setLocalScale(radius * 0.35, radius * 0.16, radius * 4.6);
      trails.push(trail);
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        const spin = time * 720;
        wheel.setLocalEulerAngles(0, 0, spin);
        crossWheel.setLocalEulerAngles(0, 90, -spin * 0.82);

        const pulse = 1 + Math.sin(time * 24) * 0.08;
        const coreScale = radius * 1.15 * pulse;
        core.setLocalScale(coreScale, coreScale, coreScale);
        const glowScale = radius * 4 * (1 + Math.sin(time * 16) * 0.1);
        glow.setLocalScale(glowScale, glowScale, glowScale);

        coreMaterial.opacity = 0.78 + Math.sin(time * 20) * 0.12;
        glowMaterial.opacity = 0.12 + Math.sin(time * 13) * 0.04;
        bladeMaterial.opacity = 0.5 + Math.sin(time * 17) * 0.11;
        hotMaterial.opacity = 0.34 + Math.sin(time * 21 + 1) * 0.09;
        featherMaterial.opacity = 0.62 + Math.sin(time * 12) * 0.14;
        for (const material of materials) material.update();

        for (const feather of feathers) {
          feather.entity.setLocalPosition(
            Math.sin(time * 9 + feather.phase) * radius * 0.9,
            feather.baseY + Math.sin(time * 7 + feather.phase) * radius * 0.25,
            feather.baseZ
          );
          feather.entity.setLocalEulerAngles(
            Math.sin(time * 8 + feather.phase) * 25,
            time * 120 + feather.phase * 40,
            Math.cos(time * 7 + feather.phase) * 30
          );
        }
        for (let index = 0; index < trails.length; index++) {
          trails[index].setLocalEulerAngles(
            0,
            Math.sin(time * 10 + index * 2) * 14,
            index === 0 ? 18 : -18
          );
        }
      }
    };
    visual.update(0);
    this.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.82, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!this.projectiles.delete(visual)) return;
        root.destroy();
        for (const material of materials) material.destroy();
      }
    };
  }

  /**
   * Impacto de aire: destello blanco, tres ondas que se abren, seis ráfagas de
   * viento que salen en círculo y plumas que suben y caen. El cuerpo cálido usa
   * mezcla normal para no lavarse sobre el terreno claro.
   */
  private spawnAirBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const root = new pc.Entity('air-burst');
    root.setPosition(x, 0, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([255, 255, 244], 0.92);
    const glowMaterial = this.createWaterMaterial(color, 0.3);
    const ringMaterial = this.createMaterial([255, 244, 214], 0.55);
    const bladeMaterial = this.createWaterMaterial([255, 236, 198], 0.66);
    const featherMaterial = this.createLeafMaterial([255, 224, 168], 0.85);
    const materials = [
      coreMaterial,
      glowMaterial,
      ringMaterial,
      bladeMaterial,
      featherMaterial
    ];
    const power = effectiveness > 1 ? 1.24 : effectiveness < 1 ? 0.86 : 1;

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.62, 0);
    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.62, 0);

    const rings: pc.Entity[] = [];
    const ringMesh = createArcBandMesh(this.device, 0.955, 1, Math.PI, 64).mesh;
    for (let index = 0; index < 3; index++) {
      const ring = this.createEntity(ringMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.1 + index * 0.02, 0);
      rings.push(ring);
    }

    const blades: {
      entity: pc.Entity;
      angle: number;
      size: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2 + 0.3;
      const blade = this.createEntity(
        createWindBladeMesh(this.device, 0.55, 1.15, 0.16, 10),
        [bladeMaterial],
        root
      );
      blade.setLocalEulerAngles(90, angle / DEG, 0);
      blades.push({
        entity: blade,
        angle,
        size: 0.9 + ((index * 7) % 10) / 10 * 0.3,
        delay: index * 0.012
      });
    }

    const feathers: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      lift: number;
      size: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2 + Math.random() * 0.4;
      const size = 0.12 + Math.random() * 0.09;
      const feather = this.createLeaf(root, featherMaterial, {
        x: Math.cos(angle) * 0.22,
        y: 0.45,
        z: Math.sin(angle) * 0.22,
        width: size,
        height: size * 2.2,
        yaw: angle / DEG
      });
      feathers.push({
        entity: feather,
        angle,
        distance: (0.5 + Math.random() * 0.6) * power,
        lift: 0.5 + Math.random() * 0.55,
        size,
        phase: Math.random() * Math.PI * 2
      });
    }

    this.addEffect(root, materials, 0.52, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const flash = Math.max(0, 1 - t / 0.35);
      const coreScale = (0.14 + ease * 0.85) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      coreMaterial.opacity = 0.92 * flash;
      const glowScale = (0.18 + ease * 1.85) * power;
      glow.setLocalScale(glowScale, glowScale, glowScale);
      glowMaterial.opacity = 0.28 * (1 - t);

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const scale = (0.3 + ease * (2.2 + index * 0.45)) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(0, index * 40 + t * 30, 0);
      }
      ringMaterial.opacity = 0.44 * (1 - t);

      for (const blade of blades) {
        const local = Math.max(0, Math.min(1, (t - blade.delay) / 0.8));
        const distance = (0.1 + local * 1.85) * power;
        blade.entity.setLocalPosition(
          Math.cos(blade.angle) * distance,
          0.18 + local * 0.55,
          Math.sin(blade.angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        const scale = blade.size * fade * (0.7 + local * 0.8);
        blade.entity.setLocalScale(scale, scale, scale);
        blade.entity.setLocalEulerAngles(
          90,
          blade.angle / DEG + local * 210,
          Math.sin(local * 9 + blade.angle) * 22
        );
      }

      for (const feather of feathers) {
        const local = Math.min(1, Math.max(0, (t - 0.03) / 0.85));
        const easeFeather = 1 - Math.pow(1 - local, 2);
        const distance = feather.distance * easeFeather;
        const angle = feather.angle + local * 1.5;
        const y =
          0.45 + feather.lift * Math.sin(local * Math.PI) - local * local * 0.5;
        feather.entity.setLocalPosition(
          Math.cos(angle) * distance,
          Math.max(0.05, y),
          Math.sin(angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        feather.entity.setLocalScale(
          feather.size * fade,
          feather.size * 2.2 * fade,
          feather.size * fade
        );
        feather.entity.setLocalEulerAngles(
          local * 80,
          angle / DEG + local * 180,
          Math.sin(local * 7 + feather.phase) * 55
        );
      }

      bladeMaterial.opacity = 0.66 * (1 - t);
      featherMaterial.opacity = 0.8 * (1 - t);
    });
  }

  /**
   * Área de aire: ondas concéntricas en el suelo, aspas que giran dentro del
   * radio y plumas que suben en espiral. Es la base visual de Onda Ígnea y
   * Ataque Celeste, con el naranja de la habilidad como cuerpo y blanco cálido
   * en los filos.
   */
  private spawnAirAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.2, duration);
    const root = new pc.Entity('air-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const ringMaterial = this.createMaterial([255, 226, 178], 0.32);
    const bladeMaterial = this.createWaterMaterial([255, 240, 208], 0.58);
    const hotMaterial = this.createMaterial(color, 0.4);
    const featherMaterial = this.createLeafMaterial([255, 220, 160], 0.8);
    const materials = [
      ringMaterial,
      bladeMaterial,
      hotMaterial,
      featherMaterial
    ];

    const rings: pc.Entity[] = [];
    const ringMesh = createArcBandMesh(this.device, 0.955, 1, Math.PI, 64).mesh;
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(ringMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.1 + index * 0.02, 0);
      rings.push(ring);
    }

    const blades: {
      entity: pc.Entity;
      angle: number;
      speed: number;
      distance: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2 + Math.random() * 0.35;
      const blade = this.createEntity(
        createWindBladeMesh(
          this.device,
          radius * (0.42 + Math.random() * 0.2),
          1.25,
          radius * 0.12,
          10
        ),
        [index % 3 === 0 ? hotMaterial : bladeMaterial],
        root
      );
      blade.setLocalEulerAngles(90, angle / DEG, 0);
      blades.push({
        entity: blade,
        angle,
        speed: (index % 2 === 0 ? 1 : -1) * (0.8 + Math.random() * 0.7),
        distance: radius * (0.18 + Math.random() * 0.45),
        size: 0.75 + Math.random() * 0.4
      });
    }

    const feathers: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      delay: number;
      size: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2 + Math.random() * 0.5;
      const size = radius * (0.035 + Math.random() * 0.03);
      const feather = this.createLeaf(root, featherMaterial, {
        x: Math.cos(angle) * radius * 0.2,
        y: 0.15,
        z: Math.sin(angle) * radius * 0.2,
        width: size,
        height: size * 2.4,
        yaw: angle / DEG
      });
      feathers.push({
        entity: feather,
        angle,
        distance: radius * (0.25 + Math.random() * 0.68),
        rise: radius * (0.4 + Math.random() * 0.55),
        delay: Math.random() * 0.45,
        size,
        phase: Math.random() * Math.PI * 2
      });
    }

    const embers: { entity: pc.Entity; angle: number; distance: number; phase: number }[] = [];
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2 + 0.5;
      const ember = this.createEntity(this.sphereMesh, [hotMaterial], root);
      const size = radius * 0.05;
      ember.setLocalScale(size, size, size);
      embers.push({
        entity: ember,
        angle,
        distance: radius * (0.35 + Math.random() * 0.4),
        phase: index * 1.4
      });
    }

    let time = 0;
    this.addEffect(root, materials, life, (_t, dt) => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.16);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const envelope = Math.min(fadeIn, fadeOut);
      const grow = 1 - Math.pow(1 - Math.min(1, time / 0.35), 2);
      const pulse = 0.55 + Math.sin(time * 8) * 0.2;

      ringMaterial.opacity = (0.2 + pulse * 0.14) * envelope;
      bladeMaterial.opacity = (0.4 + pulse * 0.2) * envelope;
      hotMaterial.opacity = (0.3 + pulse * 0.16) * envelope;
      featherMaterial.opacity = (0.52 + pulse * 0.2) * envelope;

      const ringScale = radius * (0.55 + grow * 0.5);
      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        ring.setLocalScale(ringScale, 1, ringScale);
        ring.setLocalEulerAngles(0, time * (index === 0 ? 90 : -70), 0);
      }

      for (const blade of blades) {
        const angle = blade.angle + time * blade.speed;
        const distance = blade.distance * (0.7 + grow * 0.6);
        blade.entity.setLocalPosition(
          Math.cos(angle) * distance,
          0.18 + Math.sin(time * 2.2 + blade.angle) * 0.06,
          Math.sin(angle) * distance
        );
        const scale = blade.size * (0.7 + grow * 0.5);
        blade.entity.setLocalScale(scale, scale, scale);
        blade.entity.setLocalEulerAngles(
          90,
          angle / DEG + 90,
          Math.sin(time * 3 + blade.angle) * 18
        );
      }

      for (const feather of feathers) {
        const local = Math.max(0, Math.min(1, (time - feather.delay) / 1.15));
        const distance = feather.distance * (0.4 + local * 0.8);
        const angle = feather.angle + time * 1.4 + feather.phase * 0.2;
        const fade = Math.max(0, 1 - local) * envelope;
        feather.entity.setLocalPosition(
          Math.cos(angle) * distance,
          0.12 + local * feather.rise,
          Math.sin(angle) * distance
        );
        feather.entity.setLocalScale(
          feather.size * fade,
          feather.size * 2.4 * fade,
          feather.size * fade
        );
        feather.entity.setLocalEulerAngles(
          Math.sin(time * 4 + feather.phase) * 35,
          angle / DEG + time * 120,
          Math.cos(time * 3.5 + feather.phase) * 40
        );
      }

      for (const ember of embers) {
        const angle = ember.angle + time * 2.4;
        ember.entity.setLocalPosition(
          Math.cos(angle) * ember.distance,
          0.14 + Math.min(1, time / life) * radius * 0.55,
          Math.sin(angle) * ember.distance
        );
        const scale = radius * 0.05 * (1 - Math.min(1, time / life) * 0.7);
        ember.entity.setLocalScale(scale, scale, scale);
      }
    });
  }

  /**
   * Onda de calor: fuego real repartido por el disco (tres anillos de llamas y
   * una columna central) con un vórtice de viento que gira por encima. Es el
   * estilo de `Onda Ígnea`: manda el naranja de la habilidad y el blanco del
   * aire solo marca el frente de la onda.
   */
  private spawnHeatAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.2, duration);
    const root = new pc.Entity('heat-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const ringMaterial = this.createMaterial(color, 0.42);
    const glowMaterial = this.createMaterial([255, 112, 34], 0.16);
    const flameMaterial = this.createFlameMaterial([255, 204, 148], 0.5);
    const hotMaterial = this.createFlameMaterial([255, 240, 202], 0.58);
    const windMaterial = this.createWaterMaterial([255, 232, 190], 0.42);
    const emberMaterial = this.createMaterial([255, 176, 76], 0.85);
    const materials = [
      ringMaterial,
      glowMaterial,
      flameMaterial,
      hotMaterial,
      windMaterial,
      emberMaterial
    ];

    this.spawnFlameParticles(root, {
      x: 0,
      y: 0.14,
      z: 0,
      extents: [radius * 0.9, 0.18, radius * 0.9],
      velocity: [0, 1, 0],
      velocityEnd: [0, 2.8, 0],
      radialSpeed: 0.3,
      radialSpeedEnd: 1.2,
      sizeStart: radius * 0.2,
      sizeMid: radius * 0.5,
      sizeEnd: radius * 0.14,
      lifetime: 0.55,
      rate: 1.8,
      numParticles: 140,
      localSpace: false
    });
    const aoeLight = this.createFireLight(
      root,
      0,
      1,
      0,
      1.7,
      radius * 2.6
    );

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.12, 0);

    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalPosition(0, 0.14, 0);

    const flames: {
      entity: pc.Entity;
      phase: number;
      angle: number;
      dist: number;
      baseWidth: number;
      baseHeight: number;
      yaw: number;
    }[] = [];
    const flameRings = [
      { count: 10, dist: 0.2, width: 0.18, height: 0.42 },
      { count: 14, dist: 0.45, width: 0.22, height: 0.56 },
      { count: 20, dist: 0.7, width: 0.26, height: 0.66 }
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

    const centerWidth = radius * 0.58;
    const centerHeight = radius * 1.05;
    const centerFlame = this.createFlame(root, hotMaterial, {
      x: 0,
      y: 0,
      z: 0,
      width: centerWidth,
      height: centerHeight,
      yaw: 15
    });

    // Vórtice de aire sobre las llamas: da el "frente de onda" sin quitarles
    // protagonismo al fuego.
    const swirl = new pc.Entity('heat-swirl');
    swirl.setLocalPosition(0, radius * 0.34, 0);
    root.addChild(swirl);
    const windBlades: { entity: pc.Entity; size: number; phase: number }[] = [];
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2;
      const size = radius * (0.32 + (index % 3) * 0.07);
      const blade = this.createEntity(
        createWindBladeMesh(this.device, radius * 0.52, 1.25, radius * 0.1, 10),
        [windMaterial],
        swirl
      );
      blade.setLocalPosition(
        Math.cos(angle) * radius * 0.45,
        Math.sin(angle * 2) * radius * 0.05,
        Math.sin(angle) * radius * 0.45
      );
      blade.setLocalEulerAngles(90, angle / DEG, 0);
      windBlades.push({ entity: blade, size, phase: index * 1.2 });
    }

    const embers: {
      entity: pc.Entity;
      angle: number;
      dist: number;
      rise: number;
      size: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2 + Math.random() * 0.5;
      const size = radius * (0.035 + Math.random() * 0.03);
      const ember = this.createEntity(this.sphereMesh, [emberMaterial], root);
      ember.setLocalScale(size, size, size);
      embers.push({
        entity: ember,
        angle,
        dist: radius * (0.2 + Math.random() * 0.65),
        rise: radius * (0.5 + Math.random() * 0.6),
        size,
        phase: Math.random() * Math.PI * 2
      });
    }

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.16);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const envelope = Math.min(fadeIn, fadeOut);
      const grow = 1 - Math.pow(1 - Math.min(1, time / 0.32), 2);
      const pulse = 0.5 + Math.sin(time * 8) * 0.2;

      const ringScale = Math.max(0.2, radius * 2) * (0.38 + 0.8 * grow);
      ring.setLocalScale(ringScale, 1, ringScale);
      ringMaterial.opacity = (0.3 + pulse * 0.2) * envelope;

      const glowScale = radius * 1.1 * (0.7 + 0.5 * grow);
      glow.setLocalScale(
        glowScale,
        radius * 0.22 * (0.7 + 0.7 * grow),
        glowScale
      );
      glowMaterial.opacity = (0.1 + pulse * 0.08) * envelope;

      swirl.setLocalEulerAngles(0, time * 90, 0);
      for (const blade of windBlades) {
        const scale =
          blade.size * (0.7 + grow * 0.45) * (0.85 + Math.sin(time * 7 + blade.phase) * 0.12) * envelope;
        blade.entity.setLocalScale(scale, scale, scale);
        blade.entity.setLocalEulerAngles(
          90,
          time * 40 + blade.phase * 60,
          Math.sin(time * 4 + blade.phase) * 18
        );
      }

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

      for (const ember of embers) {
        const progress = Math.min(1, time / Math.max(0.2, life * 0.8));
        const angle = ember.angle + time * 1.6;
        const dist = ember.dist * (0.5 + progress * 0.7);
        ember.entity.setLocalPosition(
          Math.cos(angle) * dist,
          0.18 + progress * ember.rise,
          Math.sin(angle) * dist
        );
        const fade = Math.max(0, 1 - progress);
        ember.entity.setLocalScale(
          ember.size * fade,
          ember.size * fade,
          ember.size * fade
        );
      }

      flameMaterial.opacity =
        0.42 * envelope * (0.85 + Math.random() * 0.15);
      hotMaterial.opacity =
        0.46 * envelope * (0.85 + Math.random() * 0.15);
      windMaterial.opacity = 0.3 * envelope;
      emberMaterial.opacity = 0.78 * envelope;
      aoeLight.light!.intensity =
        1.5 * envelope * (0.7 + Math.random() * 0.3);
    };
    this.addEffect(root, materials, life, animate);
    animate(0, 0);
  }

  /**
   * Haz de aire: columna blanca-cálida con tres hélices de viento que giran en
   * espiral, anillos que viajan hacia la punta y plumas arrastradas. El cuerpo
   * usa mezcla normal para conservar el blanco sobre el cielo.
   */
  private spawnAirBeam(
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
    const root = new pc.Entity('air-beam');
    root.setPosition(x1, 0.8, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    this.app.root.addChild(root);

    const bodyMaterial = this.createWaterMaterial(color, 0.24);
    const coreMaterial = this.createWaterMaterial([255, 250, 232], 0.52);
    const ribbonMaterial = this.createWaterMaterial([255, 236, 196], 0.48);
    const hotMaterial = this.createMaterial(color, 0.42);
    const ringMaterial = this.createMaterial([255, 242, 206], 0.42);
    const featherMaterial = this.createLeafMaterial([255, 222, 164], 0.78);
    const materials = [
      bodyMaterial,
      coreMaterial,
      ribbonMaterial,
      hotMaterial,
      ringMaterial,
      featherMaterial
    ];

    const beamMesh = pc.createCylinder(this.device, {
      radius: 0.5,
      height: 1,
      heightSegments: 1,
      capSegments: 14
    });
    const body = this.createEntity(beamMesh, [bodyMaterial], root);
    const core = this.createEntity(beamMesh, [coreMaterial], root);
    body.setLocalEulerAngles(90, 0, 0);
    core.setLocalEulerAngles(90, 0, 0);

    const ribbons: {
      entity: pc.Entity;
      baseAngle: number;
      offset: number;
      radius: number;
    }[] = [];
    const segments = 14;
    for (let helix = 0; helix < 3; helix++) {
      for (let index = 0; index < segments; index++) {
        const ribbon = this.createEntity(
          this.boxMesh,
          [helix === 1 ? hotMaterial : ribbonMaterial],
          root
        );
        const t = (index + 1) / segments;
        ribbon.setLocalScale(width * 0.13, width * 0.13, width * 0.82);
        ribbons.push({
          entity: ribbon,
          baseAngle: (helix / 3) * Math.PI * 2,
          offset: t,
          radius: width * (1.05 + 0.12 * Math.sin(t * Math.PI))
        });
      }
    }

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 4; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalEulerAngles(90, 0, 0);
      rings.push(ring);
    }

    const feathers: {
      entity: pc.Entity;
      angle: number;
      offset: number;
      size: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 6; index++) {
      const size = width * (0.5 + Math.random() * 0.25);
      const feather = this.createLeaf(root, featherMaterial, {
        x: 0,
        y: 0,
        z: length * 0.5,
        width: size,
        height: size * 2.1,
        yaw: Math.random() * 360
      });
      feathers.push({
        entity: feather,
        angle: (index / 6) * Math.PI * 2,
        offset: Math.random(),
        size,
        phase: Math.random() * Math.PI * 2
      });
    }

    let time = 0;
    this.addEffect(root, materials, 0.46, (_t, dt) => {
      time += dt;
      const reveal = 1 - Math.pow(1 - Math.min(1, time / 0.1), 2);
      const fade = 1 - Math.max(0, (time - 0.28) / 0.18);
      const pulse = 0.86 + Math.random() * 0.14;
      const visibleLength = Math.max(0.02, length * reveal);

      body.setLocalPosition(0, 0, visibleLength / 2);
      body.setLocalScale(
        width * 2 * pulse,
        visibleLength,
        width * 2 * pulse
      );
      core.setLocalPosition(0, 0, visibleLength / 2);
      core.setLocalScale(
        width * 0.58 * pulse,
        visibleLength,
        width * 0.58 * pulse
      );

      for (const ribbon of ribbons) {
        const z = ribbon.offset * visibleLength;
        const angle =
          ribbon.baseAngle + time * 7 + ribbon.offset * Math.PI * 5;
        ribbon.entity.setLocalPosition(
          Math.cos(angle) * ribbon.radius * (0.85 + pulse * 0.2),
          Math.sin(angle) * ribbon.radius * (0.85 + pulse * 0.2),
          z
        );
        ribbon.entity.setLocalEulerAngles(0, -angle / DEG, angle / DEG + 20);
      }

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const path = (time * 2.4 + index / rings.length) % 1;
        ring.setLocalPosition(0, 0, visibleLength * (0.08 + path * 0.92));
        const ringScale =
          width * (1.4 + Math.sin(path * Math.PI) * 1.1) * pulse;
        ring.setLocalScale(ringScale, ringScale, ringScale);
        ring.setLocalEulerAngles(90, 0, time * 180 + index * 40);
      }

      for (const feather of feathers) {
        const local = Math.min(1, time / 0.4);
        const angle = feather.angle + time * 3.2;
        feather.entity.setLocalPosition(
          Math.cos(angle) * width * (1.2 + local * 0.7),
          Math.sin(angle) * width * (1.2 + local * 0.7),
          feather.offset * visibleLength
        );
        feather.entity.setLocalEulerAngles(
          Math.sin(time * 9 + feather.phase) * 35,
          angle / DEG + time * 160,
          Math.cos(time * 8 + feather.phase) * 45
        );
        const scale = feather.size * Math.max(0, 1 - local * 0.7);
        feather.entity.setLocalScale(scale, scale * 2.1, scale);
      }

      bodyMaterial.opacity = 0.2 * pulse * fade;
      coreMaterial.opacity = 0.48 * pulse * fade;
      ribbonMaterial.opacity = 0.42 * fade;
      hotMaterial.opacity = 0.34 * fade;
      ringMaterial.opacity = 0.4 * fade;
      featherMaterial.opacity = 0.7 * fade;
    });
  }

  /**
   * Proyectil de hielo: grupo de cristales que gira alrededor de un núcleo
   * blanco, con halo azul y estela de esquirlas. Disponible para futuros
   * ataques a distancia de tipo Hielo.
   */
  private spawnIceProjectile(
    x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]
  ): EffectHandle {
    const root = new pc.Entity('ice-projectile');
    root.setPosition(x, 0.8, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    this.app.root.addChild(root);

    const coreMaterial = this.createWaterMaterial([242, 252, 255], 0.92);
    const glowMaterial = this.createWaterMaterial(color, 0.2);
    const crystalMaterial = this.createIceCrystalMaterial(
      [200, 240, 255],
      0.88
    );
    const deepMaterial = this.createIceCrystalMaterial([86, 168, 226], 0.72);
    const trailMaterial = this.createIceCrystalMaterial(
      [220, 248, 255],
      0.56
    );
    const materials = [
      coreMaterial,
      glowMaterial,
      crystalMaterial,
      deepMaterial,
      trailMaterial
    ];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalScale(radius * 1.35, radius * 1.35, radius * 1.35);
    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    glow.setLocalScale(radius * 3.6, radius * 3.6, radius * 3.6);

    const wheel = new pc.Entity('ice-wheel');
    root.addChild(wheel);
    const shards: {
      entity: pc.Entity;
      phase: number;
      baseAngle: number;
      baseWidth: number;
      baseHeight: number;
    }[] = [];
    for (let index = 0; index < 5; index++) {
      const angle = (index / 5) * Math.PI * 2;
      const baseWidth = radius * 0.75;
      const baseHeight = radius * 2.1;
      const shard = this.createEntity(
        this.iceCrystalMesh,
        [index % 2 === 0 ? crystalMaterial : deepMaterial],
        wheel
      );
      shard.setLocalPosition(
        Math.cos(angle) * radius * 1.4,
        Math.sin(angle) * radius,
        0
      );
      shard.setLocalEulerAngles(0, 0, angle / DEG);
      shard.setLocalScale(baseWidth, baseHeight, baseWidth);
      shards.push({
        entity: shard,
        phase: index * 1.3,
        baseAngle: angle,
        baseWidth,
        baseHeight
      });
    }

    const trailShards: { entity: pc.Entity; phase: number; baseZ: number }[] = [];
    for (let index = 0; index < 3; index++) {
      const baseZ = -radius * (2 + index * 1.1);
      const shard = this.createEntity(
        this.iceCrystalMesh,
        [trailMaterial],
        root
      );
      shard.setLocalPosition(
        (index - 1) * radius * 0.35,
        (index % 2 === 0 ? 1 : -1) * radius * 0.3,
        baseZ
      );
      shard.setLocalScale(radius * 0.5, radius * 1.2, radius * 0.5);
      shard.setLocalEulerAngles(70 + index * 25, index * 60, 20);
      trailShards.push({ entity: shard, phase: index * 1.7, baseZ });
    }

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        wheel.setLocalEulerAngles(0, 0, time * 520);

        const pulse = 1 + Math.sin(time * 22) * 0.08;
        const coreScale = radius * 1.35 * pulse;
        core.setLocalScale(coreScale, coreScale, coreScale);
        const glowScale = radius * 3.6 * (1 + Math.sin(time * 15) * 0.1);
        glow.setLocalScale(glowScale, glowScale, glowScale);

        coreMaterial.opacity = 0.78 + Math.sin(time * 19) * 0.12;
        glowMaterial.opacity = 0.14 + Math.sin(time * 12) * 0.05;
        crystalMaterial.opacity = 0.62 + Math.sin(time * 16) * 0.12;
        deepMaterial.opacity = 0.38 + Math.sin(time * 18 + 1) * 0.1;
        trailMaterial.opacity = 0.26 + Math.sin(time * 10) * 0.08;
        for (const material of materials) material.update();

        for (const shard of shards) {
          const flicker = 0.9 + Math.sin(time * 13 + shard.phase) * 0.12;
          shard.entity.setLocalScale(
            shard.baseWidth * flicker,
            shard.baseHeight * flicker,
            shard.baseWidth * flicker
          );
          shard.entity.setLocalEulerAngles(
            0,
            0,
            shard.baseAngle / DEG + time * 55 + Math.sin(time * 6 + shard.phase) * 8
          );
        }
        for (const shard of trailShards) {
          shard.entity.setLocalPosition(
            Math.sin(time * 8 + shard.phase) * radius * 0.25,
            Math.sin(time * 7 + shard.phase) * radius * 0.2,
            shard.baseZ
          );
          shard.entity.setLocalEulerAngles(
            70 + Math.sin(time * 6 + shard.phase) * 15,
            time * 90 + shard.phase * 40,
            20
          );
        }
      }
    };
    visual.update(0);
    this.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.8, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!this.projectiles.delete(visual)) return;
        root.destroy();
        for (const material of materials) material.destroy();
      }
    };
  }

  /**
   * Impacto de hielo: destello blanco, cuerpo azul, dos ondas de escarcha,
   * esquirlas que salen despedidas y copos que flotan. El azul usa mezcla
   * normal para leerse sobre cualquier terreno.
   */
  private spawnIceBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const root = new pc.Entity('ice-burst');
    root.setPosition(x, 0, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([240, 252, 255], 0.92);
    const bodyMaterial = this.createWaterMaterial(color, 0.4);
    const ringMaterial = this.createMaterial([180, 238, 255], 0.5);
    const shardMaterial = this.createIceCrystalMaterial(
      [210, 245, 255],
      0.88
    );
    const deepMaterial = this.createIceCrystalMaterial([92, 172, 228], 0.74);
    const snowMaterial = this.createWaterMaterial([226, 248, 255], 0.32);
    const materials = [
      coreMaterial,
      bodyMaterial,
      ringMaterial,
      shardMaterial,
      deepMaterial,
      snowMaterial
    ];
    const power = effectiveness > 1 ? 1.24 : effectiveness < 1 ? 0.86 : 1;

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.6, 0);
    const body = this.createEntity(this.sphereMesh, [bodyMaterial], root);
    body.setLocalPosition(0, 0.6, 0);

    const rings: pc.Entity[] = [];
    const ringMesh = createArcBandMesh(this.device, 0.955, 1, Math.PI, 64).mesh;
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(ringMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.1 + index * 0.03, 0);
      rings.push(ring);
    }

    const shards: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      lift: number;
      size: number;
      delay: number;
      spin: number;
    }[] = [];
    for (let index = 0; index < 9; index++) {
      const angle = (index / 9) * Math.PI * 2 + Math.random() * 0.4;
      const size = 0.12 + Math.random() * 0.12;
      const shard = this.createEntity(
        this.iceCrystalMesh,
        [index % 3 === 0 ? deepMaterial : shardMaterial],
        root
      );
      shard.setLocalPosition(0, 0.55, 0);
      shard.setLocalScale(size * 0.7, size * 1.8, size * 0.7);
      shards.push({
        entity: shard,
        angle,
        distance: (0.5 + Math.random() * 0.8) * power,
        lift: 0.5 + Math.random() * 0.7,
        size,
        delay: index * 0.012,
        spin: (Math.random() - 0.5) * 540
      });
    }

    const snow: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2 + Math.random() * 0.5;
      const size = 0.14 + Math.random() * 0.12;
      const puff = this.createEntity(this.sphereMesh, [snowMaterial], root);
      puff.setLocalPosition(0, 0.45, 0);
      puff.setLocalScale(size, size, size);
      snow.push({
        entity: puff,
        angle,
        distance: (0.35 + Math.random() * 0.55) * power,
        rise: 0.35 + Math.random() * 0.45,
        size,
        delay: Math.random() * 0.08
      });
    }

    this.addEffect(root, materials, 0.54, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const flash = Math.max(0, 1 - t / 0.32);
      const coreScale = (0.12 + ease * 0.72) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      coreMaterial.opacity = 0.92 * flash;
      const bodyScale = (0.18 + ease * 1.25) * power;
      body.setLocalScale(bodyScale, bodyScale, bodyScale);
      bodyMaterial.opacity = 0.36 * (1 - t);

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const scale = (0.3 + ease * (2 + index * 0.4)) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(0, t * 40 + index * 30, 0);
      }
      ringMaterial.opacity = 0.48 * (1 - t);

      for (const shard of shards) {
        const local = Math.max(0, Math.min(1, (t - shard.delay) / 0.82));
        const distance = shard.distance * local;
        const angle = shard.angle + local * 0.7;
        const y =
          0.55 + shard.lift * Math.sin(local * Math.PI) - local * local * 0.7;
        shard.entity.setLocalPosition(
          Math.cos(angle) * distance,
          Math.max(0.05, y),
          Math.sin(angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        shard.entity.setLocalScale(
          shard.size * 0.7 * fade,
          shard.size * 1.8 * fade,
          shard.size * 0.7 * fade
        );
        shard.entity.setLocalEulerAngles(
          local * 120,
          angle / DEG + local * 240,
          local * shard.spin
        );
      }

      for (const puff of snow) {
        const local = Math.max(0, Math.min(1, (t - puff.delay) / 0.9));
        const angle = puff.angle + local * 1.1;
        const distance = puff.distance * local;
        puff.entity.setLocalPosition(
          Math.cos(angle) * distance,
          0.35 + local * puff.rise,
          Math.sin(angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        const scale = puff.size * (0.7 + local * 0.9) * fade;
        puff.entity.setLocalScale(scale, scale, scale);
      }

      shardMaterial.opacity = 0.72 * (1 - t);
      deepMaterial.opacity = 0.5 * (1 - t);
      snowMaterial.opacity = 0.28 * (1 - t);
    });
  }

  /**
   * Haz de hielo: columna azul con núcleo blanco, cristales incrustados que
   * giran, anillos de escarcha que viajan y una punta de cristales.
   */
  private spawnIceBeam(
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
    const root = new pc.Entity('ice-beam');
    root.setPosition(x1, 0.8, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    this.app.root.addChild(root);

    const bodyMaterial = this.createWaterMaterial(color, 0.3);
    const coreMaterial = this.createWaterMaterial([242, 252, 255], 0.56);
    const crystalMaterial = this.createIceCrystalMaterial(
      [205, 242, 255],
      0.86
    );
    const deepMaterial = this.createIceCrystalMaterial([96, 176, 230], 0.7);
    const mistMaterial = this.createWaterMaterial([225, 247, 255], 0.24);
    const materials = [
      bodyMaterial,
      coreMaterial,
      crystalMaterial,
      deepMaterial,
      mistMaterial
    ];

    const beamMesh = pc.createCylinder(this.device, {
      radius: 0.5,
      height: 1,
      heightSegments: 1,
      capSegments: 14
    });
    const body = this.createEntity(beamMesh, [bodyMaterial], root);
    const core = this.createEntity(beamMesh, [coreMaterial], root);
    body.setLocalEulerAngles(90, 0, 0);
    core.setLocalEulerAngles(90, 0, 0);

    const crystals: {
      entity: pc.Entity;
      offset: number;
      angle: number;
      radius: number;
      size: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 12; index++) {
      const crystal = this.createEntity(
        this.iceCrystalMesh,
        [index % 3 === 0 ? deepMaterial : crystalMaterial],
        root
      );
      const size = width * (0.5 + Math.random() * 0.35);
      crystal.setLocalScale(size * 0.7, size * 1.9, size * 0.7);
      crystals.push({
        entity: crystal,
        offset: (index + 0.5) / 12,
        angle: (index / 12) * Math.PI * 2 + Math.random() * 0.4,
        radius: width * (0.7 + Math.random() * 0.6),
        size,
        phase: Math.random() * Math.PI * 2
      });
    }

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 4; index++) {
      const ring = this.createEntity(this.torusMesh, [crystalMaterial], root);
      ring.setLocalEulerAngles(90, 0, 0);
      rings.push(ring);
    }

    const tipCrystals: { entity: pc.Entity; angle: number; size: number }[] = [];
    for (let index = 0; index < 3; index++) {
      const size = width * (0.7 + index * 0.15);
      const crystal = this.createEntity(
        this.iceCrystalMesh,
        [index === 0 ? crystalMaterial : deepMaterial],
        root
      );
      crystal.setLocalScale(size * 0.65, size * 2, size * 0.65);
      tipCrystals.push({
        entity: crystal,
        angle: (index / 3) * Math.PI * 2,
        size
      });
    }

    const mist: { entity: pc.Entity; offset: number; angle: number; size: number }[] = [];
    for (let index = 0; index < 5; index++) {
      const size = width * (0.8 + Math.random() * 0.5);
      const puff = this.createEntity(this.sphereMesh, [mistMaterial], root);
      puff.setLocalScale(size, size * 0.7, size);
      mist.push({
        entity: puff,
        offset: (index + 0.5) / 5,
        angle: Math.random() * Math.PI * 2,
        size
      });
    }

    let time = 0;
    this.addEffect(root, materials, 0.48, (_t, dt) => {
      time += dt;
      const reveal = 1 - Math.pow(1 - Math.min(1, time / 0.1), 2);
      const fade = 1 - Math.max(0, (time - 0.28) / 0.2);
      const pulse = 0.86 + Math.random() * 0.14;
      const visibleLength = Math.max(0.02, length * reveal);

      body.setLocalPosition(0, 0, visibleLength / 2);
      body.setLocalScale(
        width * 2.1 * pulse,
        visibleLength,
        width * 2.1 * pulse
      );
      core.setLocalPosition(0, 0, visibleLength / 2);
      core.setLocalScale(
        width * 0.62 * pulse,
        visibleLength,
        width * 0.62 * pulse
      );

      for (const crystal of crystals) {
        const angle = crystal.angle + time * 4.5 + crystal.phase;
        const radius = crystal.radius * (0.85 + pulse * 0.25);
        crystal.entity.setLocalPosition(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          crystal.offset * visibleLength
        );
        crystal.entity.setLocalEulerAngles(
          time * 120 + crystal.phase * 40,
          angle / DEG,
          time * 80
        );
        const scale = crystal.size * (0.75 + Math.sin(time * 8 + crystal.phase) * 0.2);
        crystal.entity.setLocalScale(scale * 0.7, scale * 1.9, scale * 0.7);
      }

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const path = (time * 2.2 + index / rings.length) % 1;
        ring.setLocalPosition(0, 0, visibleLength * (0.08 + path * 0.92));
        const ringScale =
          width * (1.3 + Math.sin(path * Math.PI) * 1.1) * pulse;
        ring.setLocalScale(ringScale, ringScale, ringScale);
        ring.setLocalEulerAngles(90, 0, time * 160 + index * 45);
      }

      for (const tip of tipCrystals) {
        const angle = tip.angle + time * 3;
        tip.entity.setLocalPosition(
          Math.cos(angle) * width * 0.5,
          Math.sin(angle) * width * 0.5,
          visibleLength
        );
        tip.entity.setLocalEulerAngles(time * 160, angle / DEG, time * 90);
      }

      for (const puff of mist) {
        const angle = puff.angle + time * 2.4;
        puff.entity.setLocalPosition(
          Math.cos(angle) * width * 1.2,
          Math.sin(angle) * width * 0.8,
          puff.offset * visibleLength
        );
        const scale = puff.size * (0.7 + Math.sin(time * 5 + puff.angle) * 0.2) * fade;
        puff.entity.setLocalScale(scale, scale * 0.7, scale);
      }

      bodyMaterial.opacity = 0.26 * pulse * fade;
      coreMaterial.opacity = 0.52 * pulse * fade;
      crystalMaterial.opacity = 0.66 * fade;
      deepMaterial.opacity = 0.44 * fade;
      mistMaterial.opacity = 0.2 * fade;
    });
  }

  /**
   * Área de hielo: anillos de escarcha, púas de cristal que brotan del suelo,
   * niebla fría y destellos. Es el visual de Viento Gélido y Ventisca.
   */
  private spawnIceAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.2, duration);
    const root = new pc.Entity('ice-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const ringMaterial = this.createWaterMaterial([150, 220, 255], 0.55);
    const floorMaterial = this.createWaterMaterial([120, 200, 250], 0.12);
    const spikeMaterial = this.createIceCrystalMaterial(
      [205, 242, 255],
      0.9
    );
    const deepMaterial = this.createIceCrystalMaterial(color, 0.74);
    const mistMaterial = this.createWaterMaterial([225, 248, 255], 0.26);
    const sparkMaterial = this.createMaterial([235, 250, 255], 0.8);
    const materials = [
      ringMaterial,
      floorMaterial,
      spikeMaterial,
      deepMaterial,
      mistMaterial,
      sparkMaterial
    ];

    const floor = this.createEntity(this.discMesh, [floorMaterial], root);
    floor.setLocalPosition(0, 0.02, 0);
    floor.setLocalScale(radius * 2, 1, radius * 2);

    const rings: pc.Entity[] = [];
    const ringMesh = createArcBandMesh(this.device, 0.955, 1, Math.PI, 64).mesh;
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(ringMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.1 + index * 0.03, 0);
      rings.push(ring);
    }

    const spikes: {
      entity: pc.Entity;
      height: number;
      width: number;
      delay: number;
      tiltX: number;
      tiltZ: number;
      yaw: number;
    }[] = [];
    for (let index = 0; index < 26; index++) {
      // Ángulo áureo + raíz del índice: cubre el disco de forma uniforme en
      // vez de amontonar las púas cerca del centro.
      const angle = index * 2.399963 + Math.random() * 0.35;
      const distance =
        Math.sqrt((index + 0.5) / 26) * radius * 0.92;
      const height = radius * (0.24 + Math.random() * 0.36);
      const width = radius * (0.1 + Math.random() * 0.06);
      const spike = this.createEntity(
        this.iceCrystalMesh,
        [index % 4 === 0 ? deepMaterial : spikeMaterial],
        root
      );
      spike.setLocalPosition(
        Math.cos(angle) * distance,
        height * 0.5,
        Math.sin(angle) * distance
      );
      spike.setLocalScale(width, height, width);
      const tiltX = (Math.random() - 0.5) * 24;
      const tiltZ = (Math.random() - 0.5) * 24;
      const yaw = Math.random() * 360;
      spike.setLocalEulerAngles(tiltX, yaw, tiltZ);
      spikes.push({
        entity: spike,
        height,
        width,
        delay: Math.random() * 0.2,
        tiltX,
        tiltZ,
        yaw
      });
    }

    const mist: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2 + Math.random() * 0.4;
      const size = radius * (0.1 + Math.random() * 0.09);
      const puff = this.createEntity(this.sphereMesh, [mistMaterial], root);
      puff.setLocalScale(size, size * 0.7, size);
      mist.push({
        entity: puff,
        angle,
        distance: radius * (0.2 + Math.random() * 0.65),
        rise: radius * (0.25 + Math.random() * 0.4),
        size,
        phase: Math.random() * Math.PI * 2
      });
    }

    const sparks: { entity: pc.Entity; angle: number; distance: number; rise: number; size: number }[] = [];
    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2 + Math.random() * 0.4;
      const size = radius * (0.018 + Math.random() * 0.018);
      const spark = this.createEntity(this.sphereMesh, [sparkMaterial], root);
      spark.setLocalScale(size, size, size);
      sparks.push({
        entity: spark,
        angle,
        distance: radius * (0.15 + Math.random() * 0.7),
        rise: radius * (0.4 + Math.random() * 0.5),
        size
      });
    }

    let time = 0;
    this.addEffect(root, materials, life, (_t, dt) => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.16);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const envelope = Math.min(fadeIn, fadeOut);
      const grow = 1 - Math.pow(1 - Math.min(1, time / 0.3), 2);
      const pulse = 0.55 + Math.sin(time * 8) * 0.2;

      ringMaterial.opacity = (0.3 + pulse * 0.15) * envelope;
      floorMaterial.opacity = 0.1 * envelope;
      const ringScale = radius * (0.5 + grow * 0.5);
      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        ring.setLocalScale(ringScale, 1, ringScale);
        ring.setLocalEulerAngles(0, time * (index === 0 ? 80 : -60), 0);
      }

      for (const spike of spikes) {
        const local = Math.max(0, Math.min(1, (time - spike.delay) / 0.22));
        const ease = 1 - Math.pow(1 - local, 3);
        const height = spike.height * ease;
        spike.entity.setLocalScale(spike.width, Math.max(0.001, height), spike.width);
        spike.entity.setLocalPosition(
          spike.entity.getLocalPosition().x,
          height * 0.5,
          spike.entity.getLocalPosition().z
        );
        spike.entity.setLocalEulerAngles(
          spike.tiltX,
          spike.yaw,
          spike.tiltZ
        );
      }

      for (const puff of mist) {
        const local = Math.min(1, time / Math.max(0.2, life * 0.8));
        const angle = puff.angle + time * 1.3;
        const distance = puff.distance * (0.5 + local * 0.7);
        puff.entity.setLocalPosition(
          Math.cos(angle) * distance,
          0.15 + local * puff.rise,
          Math.sin(angle) * distance
        );
        const scale =
          puff.size * (0.7 + local * 0.8) * Math.max(0, 1 - local);
        puff.entity.setLocalScale(scale, scale * 0.7, scale);
      }

      for (const spark of sparks) {
        const local = Math.min(1, time / Math.max(0.2, life * 0.8));
        const angle = spark.angle + time * 1.8;
        spark.entity.setLocalPosition(
          Math.cos(angle) * spark.distance,
          0.15 + local * spark.rise,
          Math.sin(angle) * spark.distance
        );
        const fade = Math.max(0, 1 - local);
        spark.entity.setLocalScale(
          spark.size * fade,
          spark.size * fade,
          spark.size * fade
        );
      }

      spikeMaterial.opacity = 0.68 * envelope;
      deepMaterial.opacity = 0.46 * envelope;
      mistMaterial.opacity = 0.22 * envelope;
      sparkMaterial.opacity = 0.72 * envelope;
    });
  }

  /**
   * Ventisca: los cristales caen desde arriba, se clavan en el suelo y quedan
   * sobresaliendo mientras el área se enfría. La marca previa ya avisa del
   * radio; este efecto empieza con el impacto.
   */
  private spawnBlizzardAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.3, duration);
    const root = new pc.Entity('blizzard-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const ringMaterial = this.createWaterMaterial(color, 0.5);
    const floorMaterial = this.createWaterMaterial([120, 200, 250], 0.1);
    const crystalMaterial = this.createIceCrystalMaterial(
      [215, 245, 255],
      0.9
    );
    const deepMaterial = this.createIceCrystalMaterial([96, 176, 230], 0.76);
    const snowMaterial = this.createWaterMaterial([235, 250, 255], 0.34);
    const flashMaterial = this.createMaterial([200, 240, 255], 0.55);
    const materials = [
      ringMaterial,
      floorMaterial,
      crystalMaterial,
      deepMaterial,
      snowMaterial,
      flashMaterial
    ];

    const floor = this.createEntity(this.discMesh, [floorMaterial], root);
    floor.setLocalPosition(0, 0.02, 0);
    floor.setLocalScale(radius * 2, 1, radius * 2);

    const rings: pc.Entity[] = [];
    const ringMesh = createArcBandMesh(this.device, 0.955, 1, Math.PI, 64).mesh;
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(ringMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.1 + index * 0.03, 0);
      rings.push(ring);
    }

    const flash = this.createEntity(this.sphereMesh, [flashMaterial], root);
    flash.setLocalPosition(0, 0.75, 0);

    const shards: {
      entity: pc.Entity;
      puff: pc.Entity;
      targetX: number;
      targetZ: number;
      startY: number;
      landY: number;
      delay: number;
      fall: number;
      width: number;
      height: number;
      puffSize: number;
      tiltX: number;
      tiltZ: number;
      yaw: number;
    }[] = [];
    for (let index = 0; index < 26; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius * 0.9;
      const targetX = Math.cos(angle) * distance;
      const targetZ = Math.sin(angle) * distance;
      const height = radius * (0.24 + Math.random() * 0.34);
      const width = radius * (0.09 + Math.random() * 0.055);
      // El centro queda por debajo de la superficie: la punta inferior se
      // entierra y la superior sobresale, como un cristal clavado.
      const landY = height * 0.28;
      const startY = radius * (1.3 + Math.random() * 1.2) + height;
      const tiltX = (Math.random() - 0.5) * 18;
      const tiltZ = (Math.random() - 0.5) * 18;
      const yaw = Math.random() * 360;
      const crystal = this.createEntity(
        this.iceCrystalMesh,
        [index % 4 === 0 ? deepMaterial : crystalMaterial],
        root
      );
      crystal.setLocalPosition(targetX, startY, targetZ);
      crystal.setLocalScale(0.001, 0.001, 0.001);
      crystal.setLocalEulerAngles(tiltX, yaw, tiltZ);

      const puffSize = radius * (0.045 + Math.random() * 0.04);
      const puff = this.createEntity(this.sphereMesh, [snowMaterial], root);
      puff.setLocalPosition(targetX, 0.12, targetZ);
      puff.setLocalScale(0.001, 0.001, 0.001);

      shards.push({
        entity: crystal,
        puff,
        targetX,
        targetZ,
        startY,
        landY,
        delay: Math.random() * 0.06,
        fall: 0.1 + Math.random() * 0.06,
        width,
        height,
        puffSize,
        tiltX,
        tiltZ,
        yaw
      });
    }

    const snowflakes: {
      entity: pc.Entity;
      x: number;
      z: number;
      startY: number;
      fall: number;
      size: number;
      phase: number;
    }[] = [];
    for (let index = 0; index < 24; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius * 0.95;
      const size = radius * (0.014 + Math.random() * 0.016);
      const flake = this.createEntity(this.sphereMesh, [snowMaterial], root);
      flake.setLocalScale(size, size, size);
      snowflakes.push({
        entity: flake,
        x: Math.cos(angle) * distance,
        z: Math.sin(angle) * distance,
        startY: radius * (1.4 + Math.random() * 1.6),
        fall: 0.65 + Math.random() * 0.35,
        size,
        phase: Math.random() * Math.PI * 2
      });
    }

    let time = 0;
    this.addEffect(root, materials, life, (_t, dt) => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.12);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.24));
      const envelope = Math.min(fadeIn, fadeOut);
      const grow = 1 - Math.pow(1 - Math.min(1, time / 0.4), 2);
      const pulse = 0.55 + Math.sin(time * 8) * 0.18;

      ringMaterial.opacity = (0.28 + pulse * 0.15) * envelope;
      floorMaterial.opacity = 0.09 * envelope;
      const ringScale = radius * (0.55 + grow * 0.55);
      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        ring.setLocalScale(ringScale, 1, ringScale);
        ring.setLocalEulerAngles(0, time * (index === 0 ? 70 : -50), 0);
      }

      const flashIn = Math.min(1, time / 0.14);
      const flashScale = radius * (0.1 + flashIn * 0.28);
      flash.setLocalScale(flashScale, flashScale, flashScale);
      flashMaterial.opacity = 0.5 * Math.max(0, 1 - time / 0.2);

      for (const shard of shards) {
        const local = (time - shard.delay) / shard.fall;
        if (local <= 0) {
          shard.entity.setLocalScale(0.001, 0.001, 0.001);
          shard.puff.setLocalScale(0.001, 0.001, 0.001);
          continue;
        }
        const fall = Math.min(1, local);
        const eased = fall * fall * fall;
        const y = shard.startY + (shard.landY - shard.startY) * eased;
        const landed = fall >= 1;
        const settle = landed
          ? Math.min(1, (time - (shard.delay + shard.fall)) / 0.16)
          : 0;
        const endFade = Math.min(1, Math.max(0, (life - time) / 0.22));
        const appear = Math.min(1, local * 6);
        const scale = appear * endFade;

        shard.entity.setLocalPosition(shard.targetX, y, shard.targetZ);
        shard.entity.setLocalScale(
          Math.max(0.001, shard.width * scale),
          Math.max(0.001, shard.height * scale),
          Math.max(0.001, shard.width * scale)
        );
        shard.entity.setLocalEulerAngles(
          shard.tiltX + (landed ? Math.sin(settle * Math.PI) * 4 : 0),
          shard.yaw,
          shard.tiltZ
        );

        const puffLocal = Math.min(
          1,
          Math.max(0, (time - (shard.delay + shard.fall)) / 0.3)
        );
        const puffScale =
          shard.puffSize *
          (0.3 + puffLocal * 1.1) *
          Math.max(0, 1 - puffLocal) *
          envelope;
        shard.puff.setLocalScale(
          Math.max(0.001, puffScale),
          Math.max(0.001, puffScale * 0.7),
          Math.max(0.001, puffScale)
        );
      }

      for (const flake of snowflakes) {
        const fall = Math.min(1, time / flake.fall);
        const drift = Math.sin(time * 1.7 + flake.phase) * radius * 0.07;
        flake.entity.setLocalPosition(
          flake.x + drift,
          0.1 + flake.startY * (1 - fall),
          flake.z + Math.cos(time * 1.4 + flake.phase) * radius * 0.07
        );
        const scale =
          flake.size * (1 - fall * 0.5) * Math.max(0, 1 - fall);
        flake.entity.setLocalScale(
          Math.max(0.001, scale),
          Math.max(0.001, scale),
          Math.max(0.001, scale)
        );
      }

      crystalMaterial.opacity = 0.86 * envelope;
      deepMaterial.opacity = 0.72 * envelope;
      snowMaterial.opacity = 0.3 * envelope;
    });
  }

  /* ----------------------------------------------------------------------- */
  /* Roca y Tierra                                                           */
  /* ----------------------------------------------------------------------- */

  /**
   * Proyectil de roca: un pedrusco facetado que gira en el aire, con dos
   * esquirlas en órbita y una estela de polvo. La piedra usa materiales
   * iluminados para conservar volumen en todas las vistas.
   */
  private spawnRockProjectile(
    x: number,
    z: number,
    radius: number,
    dirX: number,
    dirZ: number,
    color: readonly [number, number, number]
  ): EffectHandle {
    const root = new pc.Entity('rock-projectile');
    root.setPosition(x, 0.8, z);
    root.setEulerAngles(0, Math.atan2(dirX, dirZ) / DEG, 0);
    this.app.root.addChild(root);

    const coreMaterial = this.createRockMaterial(color, 1);
    const darkMaterial = this.createRockMaterial([112, 96, 76], 1);
    const lightMaterial = this.createRockMaterial([214, 194, 158], 1);
    const spikeMaterial = this.createRockMaterial([236, 218, 184], 0.95);
    const materials = [coreMaterial, darkMaterial, lightMaterial, spikeMaterial];

    const core = this.createEntity(this.boxMesh, [coreMaterial], root);
    core.setLocalScale(radius * 2.2, radius * 1.8, radius * 2.4);
    core.setLocalEulerAngles(18, 0, 10);

    const chunkA = this.createEntity(this.boxMesh, [darkMaterial], root);
    chunkA.setLocalPosition(radius * 0.95, radius * 0.4, -radius * 0.25);
    chunkA.setLocalScale(radius * 1.3, radius * 1.1, radius * 1.2);

    const chunkB = this.createEntity(this.boxMesh, [lightMaterial], root);
    chunkB.setLocalPosition(-radius * 0.85, -radius * 0.3, radius * 0.2);
    chunkB.setLocalScale(radius * 1.05, radius * 0.85, radius * 1.1);

    const spike = this.createEntity(this.rockSpikeMesh, [spikeMaterial], root);
    spike.setLocalPosition(0, 0, radius * 1.1);
    spike.setLocalScale(radius * 0.9, radius * 1.5, radius * 0.9);
    spike.setLocalEulerAngles(90, 0, 0);

    this.spawnSporeParticles(
      root,
      {
        extents: [radius * 0.8, radius * 0.8, radius * 0.4],
        velocity: [-dirX * 1.8, 0.2, -dirZ * 1.8],
        velocityEnd: [-dirX * 3.4, 0.7, -dirZ * 3.4],
        sizeStart: radius * 1.1,
        sizeMid: radius * 1.9,
        sizeEnd: radius * 0.5,
        lifetime: 0.45,
        rate: 0.04,
        numParticles: 40,
        blendType: pc.BLEND_NORMAL
      },
      [176, 158, 130],
      this.dustTexture
    );

    let time = 0;
    const visual: ProjectileVisual = {
      entity: root,
      materials,
      update: (dt) => {
        time += dt;
        core.setLocalEulerAngles(18 + time * 150, time * 190, 10 + time * 230);
        chunkA.setLocalEulerAngles(time * 260, 24 + time * 180, time * 140);
        chunkB.setLocalEulerAngles(64 - time * 220, time * 150, time * 300);
        const pulse = 0.92 + Math.sin(time * 18) * 0.08;
        core.setLocalScale(
          radius * 2.2 * pulse,
          radius * 1.8 * pulse,
          radius * 2.4 * pulse
        );
        spike.setLocalEulerAngles(90, 0, Math.sin(time * 12) * 18);
        coreMaterial.opacity = 0.96;
        darkMaterial.opacity = 0.94;
        lightMaterial.opacity = 0.92;
        spikeMaterial.opacity = 0.8 + Math.sin(time * 15) * 0.1;
      }
    };
    visual.update(0);
    this.projectiles.add(visual);

    return {
      setPosition: (nextX, nextZ) => root.setPosition(nextX, 0.8, nextZ),
      update: (dt) => visual.update(dt),
      destroy: () => {
        if (!this.projectiles.delete(visual)) return;
        root.destroy();
        for (const material of materials) material.destroy();
      }
    };
  }

  /**
   * Impacto de roca: núcleo claro, dos ondas de polvo, esquirlas que salen
   * despedidas y grietas radiales en el suelo. La mezcla normal mantiene el
   * marrón legible sobre hierba, arena o asfalto.
   */
  private spawnRockBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const root = new pc.Entity('rock-burst');
    root.setPosition(x, 0, z);
    this.app.root.addChild(root);

    const coreMaterial = this.createMaterial([244, 232, 208], 0.78);
    const dustMaterial = this.createWaterMaterial([178, 158, 128], 0.33);
    const ringMaterial = this.createWaterMaterial(color, 0.48);
    const crackMaterial = this.createWaterMaterial([116, 100, 80], 0.55);
    const lightMaterial = this.createRockMaterial([206, 186, 150], 1);
    const darkMaterial = this.createRockMaterial([122, 106, 86], 1);
    const materials = [
      coreMaterial,
      dustMaterial,
      ringMaterial,
      crackMaterial,
      lightMaterial,
      darkMaterial
    ];
    const power = effectiveness > 1 ? 1.24 : effectiveness < 1 ? 0.86 : 1;

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.5, 0);

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.08 + index * 0.03, 0);
      rings.push(ring);
    }

    const cracks: pc.Entity[] = [];
    for (let index = 0; index < 7; index++) {
      const angle = (index / 7) * Math.PI * 2 + Math.random() * 0.4;
      const length = (0.55 + Math.random() * 0.75) * power;
      const crack = this.createEntity(this.boxMesh, [crackMaterial], root);
      crack.setLocalPosition(
        Math.sin(angle) * length * 0.5,
        0.035,
        Math.cos(angle) * length * 0.5
      );
      crack.setLocalEulerAngles(0, angle / DEG, 0);
      crack.setLocalScale(0.05 + Math.random() * 0.05, 0.02, length);
      cracks.push(crack);
    }

    const shards: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      lift: number;
      size: number;
      delay: number;
      spin: number;
    }[] = [];
    for (let index = 0; index < 9; index++) {
      const angle = (index / 9) * Math.PI * 2 + Math.random() * 0.4;
      const size = 0.16 + Math.random() * 0.16;
      const shard = this.createEntity(
        this.rockSpikeMesh,
        [index % 3 === 0 ? darkMaterial : lightMaterial],
        root
      );
      shard.setLocalPosition(0, 0.5, 0);
      shard.setLocalScale(size * 0.8, size * 1.7, size * 0.8);
      shards.push({
        entity: shard,
        angle,
        distance: (0.55 + Math.random() * 0.9) * power,
        lift: 0.55 + Math.random() * 0.8,
        size,
        delay: index * 0.012,
        spin: (Math.random() - 0.5) * 620
      });
    }

    const puffs: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 7; index++) {
      const angle = (index / 7) * Math.PI * 2 + Math.random() * 0.5;
      const size = 0.18 + Math.random() * 0.16;
      const puff = this.createEntity(this.sphereMesh, [dustMaterial], root);
      puff.setLocalPosition(0, 0.35, 0);
      puff.setLocalScale(size, size * 0.7, size);
      puffs.push({
        entity: puff,
        angle,
        distance: (0.35 + Math.random() * 0.7) * power,
        rise: 0.35 + Math.random() * 0.55,
        size,
        delay: Math.random() * 0.08
      });
    }

    this.spawnSporeParticles(
      root,
      {
        y: 0.12,
        extents: [0.35, 0.08, 0.35],
        velocity: [0, 0.45, 0],
        velocityEnd: [0, 1.6, 0],
        radialSpeed: 1.1,
        radialSpeedEnd: 2.4,
        sizeStart: 0.12,
        sizeMid: 0.2,
        sizeEnd: 0.06,
        lifetime: 0.6,
        rate: 0.03,
        numParticles: 50,
        blendType: pc.BLEND_NORMAL
      },
      [176, 158, 130],
      this.dustTexture
    );

    this.addEffect(root, materials, 0.54, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const flash = Math.max(0, 1 - t / 0.3);
      const coreScale = (0.14 + ease * 0.7) * power;
      core.setLocalScale(coreScale, coreScale, coreScale);
      coreMaterial.opacity = 0.7 * flash;

      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const scale = (0.3 + ease * (1.9 + index * 0.5)) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(0, t * 55 + index * 25, 0);
      }
      ringMaterial.opacity = 0.42 * (1 - t);
      crackMaterial.opacity = 0.5 * (1 - t * 0.85);

      for (const shard of shards) {
        const local = Math.max(0, Math.min(1, (t - shard.delay) / 0.8));
        const distance = shard.distance * local;
        const angle = shard.angle + local * 0.55;
        const y =
          0.5 + shard.lift * Math.sin(local * Math.PI) - local * local * 0.75;
        shard.entity.setLocalPosition(
          Math.sin(angle) * distance,
          Math.max(0.05, y),
          Math.cos(angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        shard.entity.setLocalScale(
          shard.size * 0.8 * fade,
          shard.size * 1.7 * fade,
          shard.size * 0.8 * fade
        );
        shard.entity.setLocalEulerAngles(
          local * 160,
          angle / DEG + local * 300,
          local * shard.spin
        );
      }

      for (const puff of puffs) {
        const local = Math.max(0, Math.min(1, (t - puff.delay) / 0.9));
        const angle = puff.angle + local * 1.2;
        const distance = puff.distance * local;
        puff.entity.setLocalPosition(
          Math.sin(angle) * distance,
          0.35 + local * puff.rise,
          Math.cos(angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        const scale = puff.size * (0.7 + local * 1.1) * fade;
        puff.entity.setLocalScale(scale, scale * 0.7, scale);
      }

      lightMaterial.opacity = 0.82 * (1 - t);
      darkMaterial.opacity = 0.68 * (1 - t);
      dustMaterial.opacity = 0.26 * (1 - t);
    });
  }

  /**
   * Impacto de tierra: rocas pequeñas que caen sobre el punto, losas de suelo
   * que se levantan y un anillo marrón. Es el golpe por objetivo de Terremoto.
   */
  private spawnGroundBurst(
    x: number,
    z: number,
    color: readonly [number, number, number],
    effectiveness: number
  ): void {
    const root = new pc.Entity('ground-burst');
    root.setPosition(x, 0, z);
    this.app.root.addChild(root);

    const dustMaterial = this.createWaterMaterial([186, 166, 136], 0.42);
    const ringMaterial = this.createWaterMaterial(color, 0.5);
    const crackMaterial = this.createWaterMaterial([108, 92, 72], 0.6);
    const lightMaterial = this.createRockMaterial([198, 176, 140], 1);
    const darkMaterial = this.createRockMaterial([126, 108, 86], 1);
    const materials = [
      dustMaterial,
      ringMaterial,
      crackMaterial,
      lightMaterial,
      darkMaterial
    ];
    const power = effectiveness > 1 ? 1.22 : effectiveness < 1 ? 0.88 : 1;

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.07 + index * 0.04, 0);
      rings.push(ring);
    }

    const cracks: pc.Entity[] = [];
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2 + Math.random() * 0.35;
      const length = (0.7 + Math.random() * 0.9) * power;
      const crack = this.createEntity(this.boxMesh, [crackMaterial], root);
      crack.setLocalPosition(
        Math.sin(angle) * length * 0.5,
        0.035,
        Math.cos(angle) * length * 0.5
      );
      crack.setLocalEulerAngles(0, angle / DEG, 0);
      crack.setLocalScale(0.06 + Math.random() * 0.06, 0.02, length);
      cracks.push(crack);
    }

    const slabs: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      lift: number;
      tilt: number;
      delay: number;
      size: number;
    }[] = [];
    for (let index = 0; index < 5; index++) {
      const angle = (index / 5) * Math.PI * 2 + Math.random() * 0.5;
      const slab = this.createEntity(
        this.boxMesh,
        [index % 2 === 0 ? lightMaterial : darkMaterial],
        root
      );
      const size = 0.28 + Math.random() * 0.22;
      slab.setLocalScale(size, 0.12, size * 0.8);
      slab.setLocalPosition(0, 0.02, 0);
      slabs.push({
        entity: slab,
        angle,
        distance: (0.35 + Math.random() * 0.65) * power,
        lift: 0.2 + Math.random() * 0.35,
        tilt: (Math.random() - 0.5) * 70,
        delay: index * 0.03,
        size
      });
    }

    const rocks: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      size: number;
      startHeight: number;
      delay: number;
      fall: number;
      spin: number;
    }[] = [];
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2 + Math.random() * 0.6;
      const size = 0.09 + Math.random() * 0.09;
      const rock = this.createEntity(
        this.rockChunkMesh,
        [index % 2 === 0 ? lightMaterial : darkMaterial],
        root
      );
      rock.setLocalScale(0.001, 0.001, 0.001);
      rocks.push({
        entity: rock,
        angle,
        distance: (0.3 + Math.random() * 0.65) * power,
        size,
        startHeight: 0.7 + Math.random() * 0.8,
        delay: Math.random() * 0.14,
        fall: 0.28 + Math.random() * 0.16,
        spin: (Math.random() - 0.5) * 720
      });
    }

    const puffs: {
      entity: pc.Entity;
      angle: number;
      distance: number;
      rise: number;
      size: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2 + Math.random() * 0.5;
      const size = 0.2 + Math.random() * 0.2;
      const puff = this.createEntity(this.sphereMesh, [dustMaterial], root);
      puff.setLocalPosition(0, 0.25, 0);
      puff.setLocalScale(size, size * 0.65, size);
      puffs.push({
        entity: puff,
        angle,
        distance: (0.4 + Math.random() * 0.8) * power,
        rise: 0.3 + Math.random() * 0.5,
        size,
        delay: Math.random() * 0.1
      });
    }

    this.spawnSporeParticles(
      root,
      {
        y: 0.1,
        extents: [0.45, 0.06, 0.45],
        velocity: [0, 0.4, 0],
        velocityEnd: [0, 1.5, 0],
        radialSpeed: 1.3,
        radialSpeedEnd: 2.8,
        sizeStart: 0.14,
        sizeMid: 0.24,
        sizeEnd: 0.07,
        lifetime: 0.65,
        rate: 0.025,
        numParticles: 60,
        blendType: pc.BLEND_NORMAL
      },
      [180, 160, 132],
      this.dustTexture
    );

    this.addEffect(root, materials, 0.62, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      ringMaterial.opacity = 0.44 * (1 - t);
      for (let index = 0; index < rings.length; index++) {
        const ring = rings[index];
        const scale = (0.25 + ease * (2.2 + index * 0.6)) * power;
        ring.setLocalScale(scale, 1, scale);
        ring.setLocalEulerAngles(0, t * 45 + index * 35, 0);
      }
      crackMaterial.opacity = 0.55 * (1 - t * 0.8);
      dustMaterial.opacity = 0.3 * (1 - t);

      for (const slab of slabs) {
        const local = Math.max(0, Math.min(1, (t - slab.delay) / 0.55));
        const distance = slab.distance * local;
        slab.entity.setLocalPosition(
          Math.sin(slab.angle) * distance,
          0.02 + local * slab.lift,
          Math.cos(slab.angle) * distance
        );
        slab.entity.setLocalEulerAngles(
          slab.tilt * local,
          slab.angle / DEG + local * 40,
          slab.tilt * 0.6 * local
        );
        const fade = Math.max(0, 1 - local * 0.8) * (1 - t * 0.5);
        slab.entity.setLocalScale(
          slab.size * fade,
          0.12 * (0.6 + local),
          slab.size * 0.8 * fade
        );
      }

      for (const rock of rocks) {
        const local = Math.max(0, Math.min(1, (t - rock.delay) / rock.fall));
        if (local <= 0) {
          rock.entity.setLocalScale(0.001, 0.001, 0.001);
          continue;
        }
        const drop = local * local;
        const scale = rock.size * (0.85 + local * 0.15) * (1 - t * 0.35);
        rock.entity.setLocalPosition(
          Math.sin(rock.angle) * rock.distance,
          rock.startHeight * (1 - drop) + rock.size * 0.45,
          Math.cos(rock.angle) * rock.distance
        );
        rock.entity.setLocalScale(
          Math.max(0.001, scale),
          Math.max(0.001, scale * 0.78),
          Math.max(0.001, scale * 0.92)
        );
        rock.entity.setLocalEulerAngles(
          local * 320,
          rock.angle / DEG + local * rock.spin,
          local * 210
        );
      }

      for (const puff of puffs) {
        const local = Math.max(0, Math.min(1, (t - puff.delay) / 0.9));
        const angle = puff.angle + local * 1.1;
        const distance = puff.distance * local;
        puff.entity.setLocalPosition(
          Math.sin(angle) * distance,
          0.25 + local * puff.rise,
          Math.cos(angle) * distance
        );
        const fade = Math.max(0, 1 - local);
        const scale = puff.size * (0.8 + local * 1.2) * fade;
        puff.entity.setLocalScale(scale, scale * 0.65, scale);
      }

      lightMaterial.opacity = 0.8 * (1 - t);
      darkMaterial.opacity = 0.66 * (1 - t);
    });
  }

  /**
   * Área de tierra: disco agrietado, anillos de polvo y una lluvia de rocas
   * pequeñas que cae en oleadas y levanta polvo al impactar. Es el visual de
   * Terremoto.
   */
  private spawnGroundAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.3, duration);
    const root = new pc.Entity('ground-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const fillMaterial = this.createWaterMaterial([118, 98, 76], 0.16);
    const ringMaterial = this.createWaterMaterial(color, 0.5);
    const crackMaterial = this.createWaterMaterial([244, 206, 136], 0.62);
    const dustMaterial = this.createWaterMaterial([182, 162, 134], 0.34);
    const lightMaterial = this.createRockMaterial([198, 176, 140], 1);
    const darkMaterial = this.createRockMaterial([122, 104, 82], 1);
    const materials = [
      fillMaterial,
      ringMaterial,
      crackMaterial,
      dustMaterial,
      lightMaterial,
      darkMaterial
    ];

    const fill = this.createEntity(this.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.01, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.1, 0);
    ring.setLocalScale(radius * 2, 1, radius * 2);

    const cracks: { entity: pc.Entity; angle: number; phase: number }[] = [];
    for (let index = 0; index < 14; index++) {
      const angle = (index / 14) * Math.PI * 2 + Math.random() * 0.4;
      const length = radius * (0.35 + Math.random() * 0.55);
      const crack = this.createEntity(this.boxMesh, [crackMaterial], root);
      crack.setLocalPosition(
        Math.sin(angle) * length * 0.5,
        0.035,
        Math.cos(angle) * length * 0.5
      );
      crack.setLocalEulerAngles(0, angle / DEG, 0);
      crack.setLocalScale(
        radius * (0.012 + Math.random() * 0.012),
        0.02,
        length
      );
      cracks.push({
        entity: crack,
        angle: angle / DEG,
        phase: Math.random() * Math.PI * 2
      });
    }

    const rocks: {
      entity: pc.Entity;
      puff: pc.Entity;
      angle: number;
      distance: number;
      size: number;
      startHeight: number;
      delay: number;
      fall: number;
      spin: number;
      puffSize: number;
    }[] = [];
    const rockCount = 28;
    for (let index = 0; index < rockCount; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * (0.12 + Math.sqrt(Math.random()) * 0.82);
      const size = radius * (0.04 + Math.random() * 0.04);
      const fall = 0.3 + Math.random() * 0.2;
      const rock = this.createEntity(
        this.rockChunkMesh,
        [index % 3 === 0 ? darkMaterial : lightMaterial],
        root
      );
      rock.setLocalScale(0.001, 0.001, 0.001);
      const puff = this.createEntity(this.sphereMesh, [dustMaterial], root);
      puff.setLocalScale(0.001, 0.001, 0.001);
      rocks.push({
        entity: rock,
        puff,
        angle,
        distance,
        size,
        startHeight: radius * (0.9 + Math.random() * 1.1),
        delay: Math.random() * Math.max(0.2, life - fall - 0.25),
        fall,
        spin: (Math.random() - 0.5) * 720,
        puffSize: size * (2.2 + Math.random() * 1.6)
      });
    }

    this.spawnSporeParticles(
      root,
      {
        y: 0.1,
        extents: [radius * 0.7, 0.08, radius * 0.7],
        velocity: [0, 0.45, 0],
        velocityEnd: [0, 1.8, 0],
        radialSpeed: 0.8,
        radialSpeedEnd: 2.3,
        sizeStart: radius * 0.07,
        sizeMid: radius * 0.14,
        sizeEnd: radius * 0.04,
        lifetime: 0.85,
        rate: 0.014,
        numParticles: 110,
        blendType: pc.BLEND_NORMAL
      },
      [178, 158, 130],
      this.dustTexture
    );

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.16);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const envelope = Math.min(fadeIn, fadeOut);
      const pulse = 0.5 + Math.sin(time * 8) * 0.18;

      fillMaterial.opacity = 0.14 * envelope;
      const fillScale = radius * 2 * (0.97 + pulse * 0.02);
      fill.setLocalScale(fillScale, 1, fillScale);

      ringMaterial.opacity = (0.28 + pulse * 0.2) * envelope;
      const ringScale = radius * 2 * (0.96 + pulse * 0.04);
      ring.setLocalScale(ringScale, 1, ringScale);
      ring.setLocalEulerAngles(0, time * 22, 0);
      crackMaterial.opacity = (0.38 + pulse * 0.26) * envelope;

      for (const crack of cracks) {
        crack.entity.setLocalEulerAngles(
          0,
          crack.angle + Math.sin(time * 2 + crack.phase) * 1.4,
          0
        );
      }

      for (const rock of rocks) {
        const local = Math.max(0, Math.min(1, (time - rock.delay) / rock.fall));
        if (local <= 0) {
          rock.entity.setLocalScale(0.001, 0.001, 0.001);
          rock.puff.setLocalScale(0.001, 0.001, 0.001);
          continue;
        }
        const endFade = Math.min(1, Math.max(0, (life - time) / 0.3));
        const drop = local * local;
        const scale = rock.size * (0.85 + local * 0.15) * endFade;
        rock.entity.setLocalPosition(
          Math.sin(rock.angle) * rock.distance,
          rock.startHeight * (1 - drop) + rock.size * 0.45,
          Math.cos(rock.angle) * rock.distance
        );
        rock.entity.setLocalScale(
          Math.max(0.001, scale),
          Math.max(0.001, scale * 0.78),
          Math.max(0.001, scale * 0.92)
        );
        rock.entity.setLocalEulerAngles(
          local * 320,
          rock.angle / DEG + local * rock.spin,
          local * 210
        );

        // El polvo nace justo cuando la piedra toca el suelo.
        const puffLocal = Math.max(
          0,
          Math.min(1, (time - (rock.delay + rock.fall)) / 0.35)
        );
        if (puffLocal <= 0) {
          rock.puff.setLocalScale(0.001, 0.001, 0.001);
          continue;
        }
        const puffFade = Math.max(0, 1 - puffLocal);
        const puffScale =
          rock.puffSize * (0.5 + puffLocal * 1.2) * puffFade * envelope;
        rock.puff.setLocalPosition(
          Math.sin(rock.angle) * rock.distance,
          0.07 + puffLocal * 0.08,
          Math.cos(rock.angle) * rock.distance
        );
        rock.puff.setLocalScale(
          Math.max(0.001, puffScale),
          Math.max(0.001, puffScale * 0.55),
          Math.max(0.001, puffScale)
        );
      }

      lightMaterial.opacity = 0.86 * envelope;
      darkMaterial.opacity = 0.72 * envelope;
      dustMaterial.opacity = 0.3 * envelope;
    };
    this.addEffect(
      root,
      materials,
      life,
      animate,
      areaAnchors(x, z, radius)
    );
    animate(0, 0);
  }

  /**
   * Haz de roca: una línea de estalagmitas que brota del suelo desde el
   * lanzador hasta el objetivo, con una grieta luminosa y polvo a lo largo del
   * recorrido. El daño lo resuelve la forma `beam` como cualquier haz.
   */
  private spawnRockBeam(
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
    const root = new pc.Entity('rock-beam');
    root.setPosition(x1, 0.02, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    this.app.root.addChild(root);

    const ridgeMaterial = this.createWaterMaterial([92, 76, 58], 0.5);
    const crackMaterial = this.createWaterMaterial(color, 0.68);
    const lightMaterial = this.createRockMaterial([206, 184, 148], 1);
    const darkMaterial = this.createRockMaterial([126, 108, 86], 1);
    const materials = [ridgeMaterial, crackMaterial, lightMaterial, darkMaterial];

    const ridge = this.createEntity(this.boxMesh, [ridgeMaterial], root);
    ridge.setLocalPosition(0, 0.02, length / 2);
    ridge.setLocalScale(width * 3.4, 0.04, length);

    const glow = this.createEntity(this.boxMesh, [crackMaterial], root);
    glow.setLocalPosition(0, 0.06, length / 2);
    glow.setLocalScale(width * 1.4, 0.025, length);

    const spikeCount = Math.max(7, Math.round(length * 1.5));
    const spikes: {
      entity: pc.Entity;
      z: number;
      offset: number;
      height: number;
      width: number;
      delay: number;
      tilt: number;
    }[] = [];
    for (let index = 0; index < spikeCount; index++) {
      const t = (index + 0.5) / spikeCount;
      const height = width * (1.6 + Math.random() * 1.4);
      const spikeWidth = width * (0.7 + Math.random() * 0.5);
      const spike = this.createEntity(
        this.rockSpikeMesh,
        [index % 3 === 0 ? darkMaterial : lightMaterial],
        root
      );
      spike.setLocalScale(Math.max(0.001, spikeWidth), 0.001, Math.max(0.001, spikeWidth));
      spikes.push({
        entity: spike,
        z: t * length,
        offset: (index % 2 === 0 ? 1 : -1) * width * (0.25 + Math.random() * 0.8),
        height,
        width: spikeWidth,
        delay: t * 0.14,
        tilt: (Math.random() - 0.5) * 18
      });
    }

    this.spawnSporeParticles(
      root,
      {
        z: length / 2,
        y: 0.12,
        extents: [width * 1.8, 0.1, length * 0.5],
        velocity: [0, 0.45, 0],
        velocityEnd: [0, 1.5, 0],
        radialSpeed: 0.5,
        radialSpeedEnd: 1.6,
        sizeStart: width * 0.8,
        sizeMid: width * 1.5,
        sizeEnd: width * 0.4,
        lifetime: 0.7,
        rate: 0.02,
        numParticles: 100,
        blendType: pc.BLEND_NORMAL,
        localSpace: true
      },
      [178, 160, 134],
      this.dustTexture
    );

    let time = 0;
    this.addEffect(root, materials, 0.62, (_t, dt) => {
      time += dt;
      const fade = Math.max(0, 1 - Math.max(0, time - 0.34) / 0.24);
      ridgeMaterial.opacity = 0.4 * fade;
      crackMaterial.opacity = (0.4 + Math.sin(time * 26) * 0.18) * fade;

      for (const spike of spikes) {
        const local = Math.max(0, Math.min(1, (time - spike.delay) / 0.16));
        const pop = 1 - Math.pow(1 - local, 3);
        const height = spike.height * pop * fade;
        const spikeWidth = spike.width * (0.45 + pop * 0.55) * fade;
        spike.entity.setLocalScale(
          Math.max(0.001, spikeWidth),
          Math.max(0.001, height),
          Math.max(0.001, spikeWidth)
        );
        spike.entity.setLocalPosition(
          spike.offset,
          height * (pop - 0.5),
          spike.z
        );
        spike.entity.setLocalEulerAngles(
          spike.tilt * pop,
          Math.sin(spike.delay * 20) * 30,
          spike.tilt * 0.4 * pop
        );
      }

      lightMaterial.opacity = 0.9 * fade;
      darkMaterial.opacity = 0.76 * fade;
    });
  }

  update(dt: number): void {
    // Recalcular la niebla cuesta una prueba de línea de visión por vista; con
    // 0,1 s de margen basta para que los efectos entren y salgan de la niebla
    // sin repetir el cálculo en cada frame.
    this.visibilityTimer += dt;
    const refreshVisibility = this.visibilityTimer >= 0.1;
    if (refreshVisibility) this.visibilityTimer = 0;

    // Marcas de área: se animan y se autodestruyen al llenarse.
    for (const telegraph of [...this.telegraphs]) {
      telegraph.elapsed += dt;
      const progress = Math.min(1, telegraph.elapsed / telegraph.duration);
      telegraph.update(progress, telegraph.elapsed);
      // La visibilidad se recalcula a intervalos: una marca creada en la niebla
      // aparece en cuanto el jugador se acerca lo suficiente a verla.
      if (refreshVisibility) {
        this.applyVisibility(telegraph.entity, telegraph.anchors);
      }
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
      // Las vistas se mueven: un efecto estático también puede entrar o salir
      // de la niebla mientras dura.
      if (refreshVisibility) {
        this.applyVisibility(effect.entity, effect.anchors);
      }
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
    this.iceCrystalMesh.destroy();
    this.rockSpikeMesh.destroy();
    this.rockChunkMesh.destroy();
    this.dustTexture.destroy();
  }
}
