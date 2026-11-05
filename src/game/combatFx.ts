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
import { CONFIG, DEG } from './config';
import { attachProjectileHitbox } from './hitboxDebug';
import {
  applyVertexEffectShader,
  EffectBatch,
  type EffectBatchInstance,
  MOTION_AIR_BLADES,
  MOTION_AIR_EMBERS,
  MOTION_AIR_FEATHERS,
  MOTION_BLIZZARD_CRYSTALS,
  MOTION_BLIZZARD_PUFFS,
  MOTION_CYCLONE_PUFFS,
  MOTION_EXPLOSION_DEBRIS,
  MOTION_EXPLOSION_SMOKE,
  MOTION_FIRE_WHIRL_FLAMES,
  MOTION_FISSURE_BRANCHES,
  MOTION_FISSURE_PEBBLES,
  MOTION_FISSURE_SLABS,
  MOTION_FISSURE_SPIKES,
  MOTION_GHOST_EYES,
  MOTION_GHOST_WISPS,
  MOTION_GRASS_LEAVES,
  MOTION_GROUND_CRACKS,
  MOTION_GROUND_PUFFS,
  MOTION_GROUND_ROCKS,
  MOTION_HEAT_BLADES,
  MOTION_HEAT_EMBERS,
  MOTION_HEAT_FLAMES,
  MOTION_ICE_MIST,
  MOTION_ICE_SPARKS,
  MOTION_ICE_SPIKES,
  MOTION_POISON_BUBBLES,
  MOTION_POISON_DROPS,
  MOTION_POISON_POP_RINGS,
  MOTION_PSYCHIC_SHARDS,
  MOTION_PSYCHIC_WAVE,
  MOTION_RECOVERY_MOTES,
  MOTION_RING,
  MOTION_SNOWFLAKES,
  MOTION_SPORE_SWARM,
  MOTION_STATIC,
  MOTION_WATER_JETS
} from './effectBatch';
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
  jaw: 0.3,
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

/** Handle mínimo de un efecto activo: solo permite cancelarlo antes de tiempo. */
export interface FxHandle {
  destroy(): void;
}

/**
 * Capas de render de las vistas que deben dibujar un efecto en `(x, z)`.
 * Devuelve un array vacío si ninguna vista lo ve.
 */
export type FxLayerResolver = (
  x: number,
  z: number,
  ignoreTerrainConcealment?: boolean
) => readonly number[];

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

/**
 * Aclara un color hacia el blanco (`amount` 0-1). Los efectos de viento lo usan
 * para derivar sus tintes del color de la habilidad: el mismo estilo se lee
 * naranja en Moltres y azul plateado en Lugia sin duplicar la fábrica.
 */
function tintColor(
  color: readonly [number, number, number],
  amount: number
): [number, number, number] {
  const mix = Math.max(0, Math.min(1, amount));
  return [
    Math.round(color[0] + (255 - color[0]) * mix),
    Math.round(color[1] + (255 - color[1]) * mix),
    Math.round(color[2] + (255 - color[2]) * mix)
  ];
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

interface GroundTelegraph {
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
 * +Y. Al no ser un billboard, el efecto tiene volumen desde cualquier cámara del
 * splitscreen; el material decide cómo se funden las intersecciones.
 */
function createCrossQuadMesh(device: pc.GraphicsDevice): pc.Mesh {
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

/**
 * Chorro de agua 3D: superficie de revolución con cuello estrecho que se abre
 * en una corona ondulada, labio interior, charco bajo y tres gotas facetadas.
 * El color va por vértice (azul medio → cian → blanco) y `seed` cambia la fase
 * de las ondas para generar varias siluetas sin duplicar la geometría a mano.
 */
function createWaterJetMesh(device: pc.GraphicsDevice, seed: number): pc.Mesh {
  type Vec3 = [number, number, number];
  const radialSegments = 28;
  const heightRings = 14;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const clamp255 = (value: number): number =>
    Math.max(0, Math.min(255, Math.round(value)));
  const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];

  const baseColor: Vec3 = [47, 159, 230];
  const midColor: Vec3 = [63, 184, 244];
  const topColor: Vec3 = [116, 211, 255];
  const lightColor: Vec3 = [184, 238, 255];
  const rimColor: Vec3 = [240, 253, 255];

  const splashLobes: { center: number; radius: number; height: number }[] = [
    { center: 0.6, radius: 0.08, height: 0.06 },
    { center: 2.5, radius: 0.11, height: 0.08 },
    { center: 4.7, radius: 0.06, height: 0.05 }
  ];
  const lobeAt = (angle: number, t: number): number => {
    let value = 0;
    for (const lobe of splashLobes) {
      const delta = Math.atan2(
        Math.sin(angle - lobe.center),
        Math.cos(angle - lobe.center)
      );
      value +=
        Math.exp(-(delta * delta) / 0.035) *
        Math.pow(t, 3) *
        lobe.radius;
    }
    return value;
  };

  const radiusAt = (t: number, angle: number): number => {
    const neck = 0.075;
    const toe = Math.max(0, 1 - t / 0.16);
    const flare = Math.pow(Math.max(0, (t - 0.16) / 0.84), 4.2);
    let radius = neck + 0.035 * toe * toe + 0.5 * flare;
    radius *= 1 + 0.035 * Math.sin(angle * 5 + seed) * Math.pow(t, 1.5);
    radius += 0.02 * Math.sin(angle * 9 + seed * 2.3) * Math.pow(t, 2);
    radius += 0.035 * Math.sin(angle * 6 + seed * 1.1) * Math.pow(t, 4);
    return radius + lobeAt(angle, t);
  };

  const heightAt = (t: number, angle: number): number => {
    let y = t;
    y += 0.06 * Math.sin(angle * 3 + seed * 1.7) * Math.pow(t, 4);
    y += 0.05 * Math.sin(angle * 6 + seed * 2.1) * Math.pow(t, 4);
    for (const lobe of splashLobes) {
      const delta = Math.atan2(
        Math.sin(angle - lobe.center),
        Math.cos(angle - lobe.center)
      );
      y +=
        Math.exp(-(delta * delta) / 0.035) *
        Math.pow(t, 3) *
        lobe.height;
    }
    return y;
  };

  const colorAt = (t: number, angle: number): Vec3 => {
    let color: Vec3;
    if (t < 0.45) color = mix(baseColor, midColor, t / 0.45);
    else if (t < 0.82) color = mix(midColor, topColor, (t - 0.45) / 0.37);
    else color = mix(topColor, lightColor, (t - 0.82) / 0.18);

    const band = Math.exp(-Math.pow((t - 0.86) / 0.07, 2));
    color = mix(color, lightColor, band * 0.55);
    const rim = Math.max(0, (t - 0.93) / 0.07);
    color = mix(color, rimColor, Math.min(1, rim));

    const shade = 0.84 + 0.16 * Math.cos(angle - 0.8 + seed * 0.7);
    const stripe = 0.5 + 0.5 * Math.sin(angle * 7 + t * 6 + seed);
    color = mix(color, lightColor, stripe * 0.06);
    return [
      clamp255(color[0] * shade),
      clamp255(color[1] * shade),
      clamp255(color[2] * shade)
    ];
  };

  const pushVertex = (position: Vec3, normal: Vec3, color: Vec3): void => {
    positions.push(...position);
    normals.push(...normal);
    colors.push(color[0], color[1], color[2], 255);
  };

  const ringStride = radialSegments + 1;
  for (let ring = 0; ring <= heightRings; ring++) {
    const t = ring / heightRings;
    for (let side = 0; side <= radialSegments; side++) {
      const angle = (side / radialSegments) * Math.PI * 2;
      const radius = radiusAt(t, angle);
      const normalLength = Math.hypot(
        Math.cos(angle),
        0.35,
        Math.sin(angle)
      );
      pushVertex(
        [Math.cos(angle) * radius, heightAt(t, angle), Math.sin(angle) * radius],
        [
          Math.cos(angle) / normalLength,
          0.35 / normalLength,
          Math.sin(angle) / normalLength
        ],
        colorAt(t, angle)
      );
    }
  }

  for (let ring = 0; ring < heightRings; ring++) {
    for (let side = 0; side < radialSegments; side++) {
      const a = ring * ringStride + side;
      const b = a + 1;
      const c = a + ringStride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Labio interior: da grosor al borde de la corona.
  const topRingStart = heightRings * ringStride;
  const lipStart = positions.length / 3;
  for (let side = 0; side <= radialSegments; side++) {
    const angle = (side / radialSegments) * Math.PI * 2;
    const radius = radiusAt(1, angle) * 0.94;
    const normalLength = Math.hypot(Math.cos(angle), 0.2, Math.sin(angle));
    pushVertex(
      [Math.cos(angle) * radius, heightAt(1, angle) - 0.035, Math.sin(angle) * radius],
      [
        Math.cos(angle) / normalLength,
        0.2 / normalLength,
        Math.sin(angle) / normalLength
      ],
      mix(rimColor, lightColor, 0.35)
    );
  }
  const innerStart = positions.length / 3;
  for (let side = 0; side <= radialSegments; side++) {
    const angle = (side / radialSegments) * Math.PI * 2;
    const radius = radiusAt(1, angle) * 0.84;
    const normalLength = Math.hypot(Math.cos(angle), 0.2, Math.sin(angle));
    pushVertex(
      [Math.cos(angle) * radius, heightAt(1, angle) - 0.1, Math.sin(angle) * radius],
      [
        -Math.cos(angle) / normalLength,
        0.2 / normalLength,
        -Math.sin(angle) / normalLength
      ],
      mix(topColor, lightColor, 0.5)
    );
  }
  for (let side = 0; side < radialSegments; side++) {
    const a = topRingStart + side;
    const b = a + 1;
    const c = lipStart + side;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
    const e = innerStart + side;
    const f = e + 1;
    indices.push(c, e, d, d, e, f);
  }

  // Cierre interior: evita que el chorro se vea hueco desde arriba.
  const capCenter = positions.length / 3;
  pushVertex(
    [0, heightAt(1, 0) - 0.12, 0],
    [0, 1, 0],
    mix(topColor, rimColor, 0.5)
  );
  for (let side = 0; side < radialSegments; side++) {
    const a = innerStart + side;
    const b = a + 1;
    indices.push(a, capCenter, b);
  }

  // Charco bajo y ondulado alrededor de la base.
  const puddleSegments = 24;
  const puddleInnerStart = positions.length / 3;
  for (let side = 0; side <= puddleSegments; side++) {
    const angle = (side / puddleSegments) * Math.PI * 2;
    const radius = 0.11 + 0.01 * Math.sin(angle * 5 + seed);
    pushVertex(
      [Math.cos(angle) * radius, 0.015, Math.sin(angle) * radius],
      [0, 1, 0],
      mix(midColor, lightColor, 0.2)
    );
  }
  const puddleOuterStart = positions.length / 3;
  for (let side = 0; side <= puddleSegments; side++) {
    const angle = (side / puddleSegments) * Math.PI * 2;
    const radius =
      0.28 +
      0.04 * Math.sin(angle * 4 + seed * 1.3) +
      0.02 * Math.sin(angle * 7 + seed);
    pushVertex(
      [Math.cos(angle) * radius, 0.012, Math.sin(angle) * radius],
      [0, 1, 0],
      mix(lightColor, rimColor, 0.5)
    );
  }
  for (let side = 0; side < puddleSegments; side++) {
    const a = puddleInnerStart + side;
    const b = a + 1;
    const c = puddleOuterStart + side;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
  }

  // Gotas facetadas desprendidas de la corona.
  const droplets: { angle: number; radius: number; y: number; size: number }[] = [
    { angle: 0.9 + seed * 0.1, radius: 0.72, y: 1.15, size: 0.06 },
    { angle: 2.7 + seed * 0.07, radius: 0.8, y: 1.28, size: 0.052 },
    { angle: 4.9 + seed * 0.05, radius: 0.64, y: 1.12, size: 0.046 }
  ];
  const dropSides = 6;
  const dropProfile: [number, number][] = [
    [-1, 0.12],
    [-0.65, 0.55],
    [0, 0.66],
    [0.55, 0.38],
    [1, 0]
  ];
  for (const drop of droplets) {
    const centerX = Math.cos(drop.angle) * drop.radius;
    const centerZ = Math.sin(drop.angle) * drop.radius;
    const start = positions.length / 3;
    for (let ring = 0; ring < dropProfile.length; ring++) {
      const [dropY, dropRadius] = dropProfile[ring];
      const color = mix(lightColor, rimColor, ring / (dropProfile.length - 1));
      for (let side = 0; side <= dropSides; side++) {
        const angle = (side / dropSides) * Math.PI * 2;
        pushVertex(
          [
            centerX + Math.cos(angle) * dropRadius * drop.size,
            drop.y + dropY * drop.size,
            centerZ + Math.sin(angle) * dropRadius * drop.size
          ],
          [Math.cos(angle), 0, Math.sin(angle)],
          color
        );
      }
    }
    for (let ring = 0; ring < dropProfile.length - 1; ring++) {
      for (let side = 0; side < dropSides; side++) {
        const a = start + ring * (dropSides + 1) + side;
        const b = a + 1;
        const c = a + (dropSides + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  // `setColors` espera floats 0-1; `setColors32` normaliza los 0-255.
  mesh.setColors32(colors);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/**
 * Brazo de huracán 3D: cinta espiral con sección abombada y borde ondulado.
 * Se instancia varias veces con giros distintos para formar el vórtice; las
 * nubes volumétricas se añaden aparte con esferas.
 */
function createCycloneArmMesh(device: pc.GraphicsDevice, seed: number): pc.Mesh {
  type Vec3 = [number, number, number];
  const steps = 30;
  const turns = 1.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const cloudInner: Vec3 = [198, 230, 255];
  const cloudMid: Vec3 = [248, 253, 255];
  const cloudOuter: Vec3 = [170, 210, 245];

  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const angle = t * turns * Math.PI * 2;
    const radius = 0.17 + 0.76 * t;
    const half = 0.025 + 0.055 * t;
    const y = 0.18 + 0.12 * t + 0.04 * Math.sin(t * Math.PI * 3 + seed);
    const wobble = 0.018 * Math.sin(t * 9 + seed * 2.1);
    const shade = 0.9 + 0.1 * Math.sin(t * 6 + seed);
    const tint = (base: Vec3): Vec3 => [
      Math.min(255, base[0] * shade),
      Math.min(255, base[1] * shade),
      Math.min(255, base[2] * shade)
    ];
    const cos = Math.cos(angle + wobble);
    const sin = Math.sin(angle + wobble);
    positions.push(cos * (radius - half), y, sin * (radius - half));
    positions.push(cos * radius, y + 0.07, sin * radius);
    positions.push(cos * (radius + half), y, sin * (radius + half));
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    const innerColor = tint(cloudInner);
    const midColor = tint(cloudMid);
    const outerColor = tint(cloudOuter);
    colors.push(
      ...innerColor,
      255,
      ...midColor,
      255,
      ...outerColor,
      255
    );
  }

  for (let step = 0; step < steps; step++) {
    const base = step * 3;
    const next = base + 3;
    indices.push(
      base,
      next,
      base + 1,
      base + 1,
      next,
      next + 1,
      base + 1,
      next + 1,
      base + 2,
      base + 2,
      next + 1,
      next + 2
    );
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setColors32(colors);
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
  /** Variantes 3D del chorro de agua: cambian la fase de la corona ondulada. */
  private readonly waterJetMeshes: pc.Mesh[];
  /** Variantes 3D de los brazos espirales del huracán de `Ciclón`. */
  private readonly cycloneArmMeshes: pc.Mesh[];
  /** Bipirámide compartida por proyectiles, impactos, haces y áreas de hielo. */
  private readonly iceCrystalMesh: pc.Mesh;
  /** Cono facetado compartido por los efectos de Roca y Tierra. */
  private readonly rockSpikeMesh: pc.Mesh;
  /** Roca baja y facetada para las lluvias de piedras. */
  private readonly rockChunkMesh: pc.Mesh;
  /** Textura de polvo para las partículas de roca y tierra. */
  private readonly dustTexture: pc.Texture;
  private readonly telegraphs = new Set<GroundTelegraph>();
  /**
   * Mallas unitarias reutilizables (rayos, aspas). Se crean una vez y se
   * escalan por entidad, así un casteo no genera geometría ni sube buffers.
   */
  private readonly meshCache = new Map<string, pc.Mesh>();
  /**
   * Duración del efecto visual de cada haz. El carril del suelo se mantiene
   * vivo lo que dura el propio haz para que ambos desaparezcan a la vez.
   */
  private readonly beamDurations: Record<BeamStyle, number> = {
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
    this.flameMesh.incRefCount();
    for (const mesh of this.waterJetMeshes) mesh.incRefCount();
    for (const mesh of this.cycloneArmMeshes) mesh.incRefCount();
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
      jaw: (x, z, _color, effectiveness) =>
        this.spawnJawBurst(x, z, effectiveness),
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
      grass: (x1, z1, x2, z2, color, width) =>
        this.spawnGrassBeam(x1, z1, x2, z2, color, width),
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
      cyclone: (x, z, radius, color, duration) =>
        this.spawnCycloneAoe(x, z, radius, color, duration),
      heat: (x, z, radius, color, duration) =>
        this.spawnHeatAoe(x, z, radius, color, duration),
      ice: (x, z, radius, color, duration) =>
        this.spawnIceAoe(x, z, radius, color, duration),
      blizzard: (x, z, radius, color, duration) =>
        this.spawnBlizzardAoe(x, z, radius, color, duration),
      ground: (x, z, radius, color, duration) =>
        this.spawnGroundAoe(x, z, radius, color, duration),
      fissure: (x, z, radius, color, duration) =>
        this.spawnFissureAoe(x, z, radius, color, duration),
      recovery: (x, z, radius, color, duration) =>
        this.spawnRecoveryAoe(x, z, radius, color, duration)
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
   * Material translúcido para el escudo esférico. Usa mezcla normal para el
   * volumen y aditiva para el halo exterior.
   */
  private createShieldMaterial(
    color: readonly [number, number, number],
    opacity: number,
    blendType: number
  ): pc.StandardMaterial {
    const material = new pc.StandardMaterial();
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
   * Material con color por vértice y mezcla normal. Lo usan las mallas 3D de
   * agua (chorros de `Marea`) y de nubes (brazos del huracán de `Ciclón`); la
   * malla ya trae el degradado y el material solo controla la opacidad.
   */
  private createVertexColorMaterial(opacity: number): pc.StandardMaterial {
    const material = new pc.StandardMaterial();
    material.useLighting = false;
    material.useSkybox = false;
    material.useFog = true;
    material.diffuse = new pc.Color(0, 0, 0);
    material.emissive = new pc.Color(1, 1, 1);
    material.emissiveIntensity = 1.05;
    material.diffuseVertexColor = true;
    material.emissiveVertexColor = true;
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

  /** Devuelve una malla compartida y la crea solo la primera vez. */
  private cachedMesh(key: string, create: () => pc.Mesh): pc.Mesh {
    const cached = this.meshCache.get(key);
    if (cached) return cached;
    const mesh = create();
    // La caché mantiene una referencia propia para que el MeshInstance no la
    // destruya al terminar el efecto.
    mesh.incRefCount();
    this.meshCache.set(key, mesh);
    return mesh;
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
  private disposeEffect(effect: ActiveEffect): void {
    const index = this.effects.indexOf(effect);
    if (index < 0) return;
    this.effects.splice(index, 1);
    effect.entity.destroy();
    for (const material of effect.materials) material.destroy();
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
  private applyVisibility(
    entity: pc.Entity,
    anchors: FxAnchors,
    ignoreTerrainConcealment = false
  ): void {
    const layers: number[] = [];
    for (const [x, z] of anchors) {
      for (const id of this.resolveLayers(x, z, ignoreTerrainConcealment)) {
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

    if (CONFIG.debug.showHitboxes) {
      const cleanup = attachProjectileHitbox(this.app, visual.entity, radius);
      const destroy = handle.destroy;
      let disposed = false;
      handle.destroy = () => {
        if (!disposed) {
          disposed = true;
          cleanup();
        }
        destroy();
      };
    }

    this.applyVisibility(visual.entity, [[x, z]], true);

    // Capas recalculadas en cada paso: así el proyectil se oculta en cuanto un
    // separador corta la línea de visión, sin esperar a recorrer 0,4 u. La
    // ocultación por terreno (hierba alta) sí se ignora a propósito.
    const setPosition = handle.setPosition;
    handle.setPosition = (nextX, nextZ) => {
      setPosition(nextX, nextZ);
      this.applyVisibility(visual.entity, [[nextX, nextZ]], true);
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

  /**
   * Arco de golpe cuerpo a cuerpo, orientado hacia el `facing` del actor.
   * `markerColor` tiñe solo la guía del área (el cono); el resto del efecto
   * conserva el color de la habilidad.
   */
  spawnMelee(
    x: number,
    z: number,
    yaw: number,
    range: number,
    halfAngleDeg: number,
    color: readonly [number, number, number],
    style: ImpactStyle = 'hit',
    markerColor?: readonly [number, number, number]
  ): void {
    // La mordida materializa una mandíbula 3D en el centro del cono, pero
    // mantiene el arco melee como guía del área de golpe.
    if (style === 'jaw') {
      const forward = range * 0.3;
      const centerX = x + Math.sin(yaw) * forward;
      const centerZ = z + Math.cos(yaw) * forward;
      this.withAnchors(
        [
          [x, z],
          [centerX, centerZ]
        ],
        () => {
          this.spawnJawBite(centerX, centerZ, yaw, range * 0.56, 1);
        }
      );
    }

    const mesh = createArcMesh(
      this.device,
      range,
      Math.max(8, halfAngleDeg) * DEG,
      18
    );
    // La mordida mantiene el cono como guía, pero en blanco como los colmillos.
    // Si llega el color del equipo, manda sobre ambos: la guía del área debe
    // identificar al lanzador.
    const arcColor: readonly [number, number, number] =
      markerColor ?? (style === 'jaw' ? [255, 255, 255] : color);
    const material = this.createMaterial(arcColor, 0.85);
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
      material: pc.StandardMaterial;
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
        applyVertexEffectShader(waveMaterial, MOTION_PSYCHIC_WAVE);
        materials.push(waveMaterial);
        const { mesh: waveMesh } = createArcBandMesh(
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
          material: waveMaterial,
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
    let sporeBatch: EffectBatch | null = null;
    if (style === 'spore') {
      // Rocío en abanico: cada partícula nace en el vértice del cono y viaja
      // hacia un ángulo distinto del borde, cubriendo toda la abertura. El
      // enjambre entero se resuelve en un solo lote instanciado.
      effectDuration = 1;
      material.opacity = 0.28;
      const sporeMaterial = this.createSporeMaterial([92, 158, 70], 0.92);
      materials.push(sporeMaterial);
      const sporeInstances: EffectBatchInstance[] = [];
      const sporeCount = 104;
      for (let index = 0; index < sporeCount; index++) {
        const angle =
          -halfAngle * 0.95 +
          (index / (sporeCount - 1)) * halfAngle * 1.9 +
          (Math.random() - 0.5) * 0.03;
        const size = 0.055 + Math.random() * 0.07;
        sporeInstances.push({
          anim0: [
            angle,
            range * (0.6 + Math.random() * 0.4),
            0.18 + Math.random() * 0.62,
            Math.random() * 0.16
          ],
          anim1: [
            0.42 + Math.random() * 0.28,
            size,
            Math.random() * Math.PI * 2,
            0
          ]
        });
      }
      sporeBatch = new EffectBatch({
        app: this.app,
        parent: entity,
        mesh: this.leafMesh,
        material: sporeMaterial,
        instances: sporeInstances,
        motion: MOTION_SPORE_SWARM
      });
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

      sporeBatch?.setTime(time);

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

        // La ondulación de la cinta vive en el vertex shader: solo se suben
        // tres uniformes por onda en vez de reescribir la malla cada frame.
        wave.material.setParameter('uEffectTime', time);
        wave.material.setParameter('uEffectParam0', wave.phase);
        wave.material.setParameter('uEffectParam1', wave.amplitude);
        wave.material.setParameter('uEffectParam2', wave.ripple);

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
      // Malla unitaria cacheada: el largo se aplica con la escala Z.
      const mesh = this.cachedMesh(
        `lightning:${strandWidth.toFixed(3)}:${segments}:${index}`,
        () =>
          createLightningMesh(
            this.device,
            1,
            strandWidth,
            segments,
            3000 + index * 7919
          )
      );
      const strand = this.createEntity(mesh, [strandMaterial], root);
      strand.setLocalPosition(0, 0, length / 2);
      strand.setLocalScale(1, 1, length);
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
        strand.setLocalScale(1, 1, Math.max(0.02, length * reveal));
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
    const batch = new EffectBatch({
      app: this.app,
      parent: this.app.root,
      mesh: this.torusMesh,
      material,
      instances: [{ x, y: 0.12, z }],
      motion: MOTION_RING,
      radius,
      life
    });

    let time = 0;
    this.addEffect(
      batch.entity,
      [material],
      life,
      (_t, dt) => {
        time += dt;
        batch.setTime(time);
        const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
        material.opacity =
          0.75 * fadeOut * (0.82 + Math.sin(time * 7) * 0.18);
      },
      [[x, z]]
    );
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

    // El enjambre entero se dibuja con dos lotes instanciados (hojas normales y
    // hojas calientes). La posición, el giro y el fundido se calculan en el
    // vertex shader: la CPU no recorre 120 entidades por frame.
    const leafInstances: EffectBatchInstance[] = [];
    const hotLeafInstances: EffectBatchInstance[] = [];
    const leafCount = 120;
    for (let index = 0; index < leafCount; index++) {
      // Todas las hojas entran en el giro: se reparten por todo el radio y
      // ninguna forma una columna fija en el centro.
      const angle = Math.random() * Math.PI * 2;
      const radiusFactor = 0.32 + Math.sqrt(Math.random()) * 0.68;
      const size = radius * (0.045 + Math.random() * 0.05);
      const yaw = Math.random() * 360;
      const instance: EffectBatchInstance = {
        anim0: [
          angle,
          radiusFactor,
          Math.random(),
          0.7 + Math.random() * 0.55
        ],
        anim1: [0.8 + Math.random() * 0.5, size, yaw, 0]
      };
      if (index % 5 === 0) hotLeafInstances.push(instance);
      else leafInstances.push(instance);
    }
    const leafBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.leafMesh,
      material: leafMaterial,
      instances: leafInstances,
      motion: MOTION_GRASS_LEAVES,
      radius,
      life
    });
    const hotLeafBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.leafMesh,
      material: hotLeafMaterial,
      instances: hotLeafInstances,
      motion: MOTION_GRASS_LEAVES,
      radius,
      life
    });

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

      leafBatch.setTime(time);
      hotLeafBatch.setTime(time);
      leafMaterial.opacity = 0.82 * envelope;
      hotLeafMaterial.opacity = 0.9 * envelope;
    };
    this.addEffect(root, materials, life, animate);
    animate(0, 0);
  }

  /**
   * Área de agua: un disco tenue y un aro de borde marcan el radio, mientras
   * varios chorros con silueta de salpicadura brotan repartidos por toda la
   * superficie. La textura procedural dibuja la base estrecha, la corona
   * ondulada, los brillos y las gotas; los quads cruzados mantienen el volumen
   * desde cualquier cámara. Los chorros oscilan en altura y grosor con fases
   * distintas para que el área nunca parezca estática.
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

    const fillMaterial = this.createWaterMaterial(color, 0.07);
    const ringMaterial = this.createWaterMaterial(tintColor(color, 0.55), 0.4);
    const jetMaterial = this.createVertexColorMaterial(0.92);
    const materials = [fillMaterial, ringMaterial, jetMaterial];

    const fill = this.createEntity(this.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.01, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    const border = this.createEntity(this.torusMesh, [ringMaterial], root);
    border.setLocalPosition(0, 0.08, 0);
    border.setLocalScale(radius * 2, 1, radius * 2);

    // Los 18 chorros se reparten en cuatro lotes, uno por variante de malla.
    // Así se conservan las siluetas distintas con cuatro draw calls en vez de
    // dieciocho entidades animadas desde JavaScript.
    const jetInstances: EffectBatchInstance[][] = this.waterJetMeshes.map(
      () => []
    );
    const jetCount = 18;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < jetCount; index++) {
      // Reparto por área (sqrt) para que los chorros no se apelotonen en el centro.
      const angle = index * goldenAngle + (Math.random() - 0.5) * 0.18;
      const distance =
        radius * (0.12 + Math.sqrt((index + 0.5) / jetCount) * 0.8);
      const px = Math.cos(angle) * distance;
      const pz = Math.sin(angle) * distance;
      const width = radius * (0.19 + Math.random() * 0.06);
      const height = radius * (0.35 + Math.random() * 0.18);
      const phase = (index / jetCount) * Math.PI * 2 + Math.random() * 0.5;
      // 2-3,2 ciclos/s: un sube y baja claramente más rápido que el respiradero
      // lento original, pero sin parpadear.
      const speed = 2 + Math.random() * 1.2;
      const spin = Math.random() * Math.PI;
      jetInstances[index % this.waterJetMeshes.length].push({
        anim0: [px, pz, phase, speed],
        anim1: [width, height, spin, 0]
      });
    }
    const jetBatches = jetInstances.map(
      (instances, index) =>
        new EffectBatch({
          app: this.app,
          parent: root,
          mesh: this.waterJetMeshes[index],
          material: jetMaterial,
          instances,
          motion: MOTION_WATER_JETS,
          radius,
          life
        })
    );

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.12);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.25));
      const envelope = Math.min(fadeIn, fadeOut);

      fillMaterial.opacity = 0.06 * envelope;
      const fillScale = radius * 2 * (0.97 + Math.sin(time * 5) * 0.02);
      fill.setLocalScale(fillScale, 1, fillScale);

      const borderScale = radius * 2 * (1 + Math.sin(time * 4) * 0.012);
      border.setLocalScale(borderScale, 1, borderScale);
      ringMaterial.opacity = (0.28 + Math.sin(time * 6) * 0.07) * envelope;

      for (const batch of jetBatches) batch.setTime(time);
      jetMaterial.opacity = 0.92 * envelope;
    };
    this.addEffect(root, materials, life, animate);
    animate(0, 0);
  }

  /**
   * Charco de lodo: anillo y disco tenue de veneno en el suelo, y burbujas 3D
   * que nacen del charco, suben y revientan durante toda la duración del área.
   * Cada burbuja es una esfera translúcida con dos brillos que giran sobre su
   * superficie (así se lee el volumen) y al reventar deja un aro y gotas del
   * color del veneno.
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
    // Las burbujas aclaran el color del veneno para que el volumen se lea
    // sobre el charco oscuro; los brillos casi blancos marcan el reflejo.
    const bubbleColor: [number, number, number] = [
      Math.min(255, color[0] + 52),
      Math.min(255, color[1] + 44),
      Math.min(255, color[2] + 48)
    ];
    const popColor: [number, number, number] = [
      Math.min(255, color[0] + 88),
      Math.min(255, color[1] + 76),
      Math.min(255, color[2] + 72)
    ];
    const bubbleMaterial = this.createWaterMaterial(bubbleColor, 0.42);
    const shineMaterial = this.createWaterMaterial([244, 224, 255], 0.9);
    const dropMaterial = this.createWaterMaterial(popColor, 0.85);
    // Un único material para todos los aros de pop: el desvanecido por
    // burbuja se sustituye por escala y por el fundido global del área.
    const popRingMaterial = this.createWaterMaterial(popColor, 0.8);
    const materials = [
      ringMaterial,
      fillMaterial,
      bubbleMaterial,
      shineMaterial,
      dropMaterial,
      popRingMaterial
    ];

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.1, 0);
    ring.setLocalScale(radius * 2, 1, radius * 2);

    const fill = this.createEntity(this.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.03, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    const bubbleInstances: EffectBatchInstance[] = [];
    const highlightInstances: EffectBatchInstance[] = [];
    const popRingInstances: EffectBatchInstance[] = [];
    const dropInstances: EffectBatchInstance[] = [];
    const bubbleCount = Math.max(10, Math.round(radius * 8));
    // Los nacimientos se reparten por toda la duración para que el charco
    // burbujee sin pausas hasta el final.
    const latestBirth = Math.max(0, life - 0.6);
    for (let index = 0; index < bubbleCount; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * Math.sqrt(Math.random()) * 0.82;
      const baseX = Math.cos(angle) * distance;
      const baseZ = Math.sin(angle) * distance;
      const size = radius * (0.06 + Math.random() * 0.1);
      const phase = Math.random() * Math.PI * 2;
      const birth = (index / bubbleCount) * latestBirth + Math.random() * 0.1;
      const rise = 0.62 + Math.random() * 0.4;
      const height = size * (1.8 + Math.random() * 2);
      const wobble = radius * (0.03 + Math.random() * 0.03);
      const anim0: [number, number, number, number] = [
        baseX,
        baseZ,
        size,
        birth
      ];
      const anim1: [number, number, number, number] = [
        rise,
        height,
        wobble,
        phase
      ];

      bubbleInstances.push({ anim0, anim1 });
      // Los dos brillos giran con la burbuja: la matriz base guarda su
      // desplazamiento y su escala relativa.
      highlightInstances.push({
        x: -0.22,
        y: 0.3,
        z: -0.18,
        sx: 0.3,
        sy: 0.3,
        sz: 0.3,
        anim0,
        anim1
      });
      highlightInstances.push({
        x: 0.2,
        y: -0.16,
        z: -0.22,
        sx: 0.13,
        sy: 0.13,
        sz: 0.13,
        anim0,
        anim1
      });
      popRingInstances.push({ anim0, anim1 });
      for (let dropIndex = 0; dropIndex < 3; dropIndex++) {
        dropInstances.push({
          anim0,
          anim1,
          anim2: [dropIndex, 0, 0, 0]
        });
      }
    }

    const bubbleBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: bubbleMaterial,
      instances: bubbleInstances,
      motion: MOTION_POISON_BUBBLES,
      radius,
      life
    });
    const highlightBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: shineMaterial,
      instances: highlightInstances,
      motion: MOTION_POISON_BUBBLES,
      radius,
      life
    });
    const popRingBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.torusMesh,
      material: popRingMaterial,
      instances: popRingInstances,
      motion: MOTION_POISON_POP_RINGS,
      radius,
      life
    });
    const dropBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: dropMaterial,
      instances: dropInstances,
      motion: MOTION_POISON_DROPS,
      radius,
      life
    });

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.16);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const envelope = Math.min(fadeIn, fadeOut);
      const pulse = 0.5 + Math.sin(time * 7) * 0.2;

      ringMaterial.opacity = (0.35 + pulse * 0.15) * envelope;
      fillMaterial.opacity = (0.08 + pulse * 0.04) * envelope;
      bubbleMaterial.opacity = (0.34 + pulse * 0.1) * envelope;
      shineMaterial.opacity = 0.9 * envelope;
      dropMaterial.opacity = 0.85 * envelope;

      const ringScale = radius * 2 * (0.96 + pulse * 0.05);
      ring.setLocalScale(ringScale, 1, ringScale);

      bubbleBatch.setTime(time);
      highlightBatch.setTime(time);
      popRingBatch.setTime(time);
      dropBatch.setTime(time);
      popRingMaterial.opacity = 0.8 * envelope;
    };
    this.addEffect(root, materials, life, animate);
    animate(0, 0);
  }

  /**
   * Explosión eléctrica: destello central, cúpula de energía, tres ondas de
   * choque en el suelo, arcos que cruzan el diámetro, escombros que salen
   * despedidos y humo que se eleva. El relleno del suelo y la cúpula crecen
   * hasta el radio completo para que la deflagración ocupe toda el área
   * afectada, no solo el núcleo. Todo son transformaciones sobre geometría
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
    const fillMaterial = this.createWaterMaterial([255, 214, 92], 0.16);
    const flashMaterial = this.createMaterial([255, 250, 220], 0.32);
    const debrisMaterial = this.createWaterMaterial([255, 186, 64], 0.95);
    const smokeMaterial = this.createWaterMaterial([92, 80, 72], 0.4);
    const materials = [
      coreMaterial,
      hotMaterial,
      arcMaterial,
      fillMaterial,
      flashMaterial,
      debrisMaterial,
      smokeMaterial
    ];

    const core = this.createEntity(this.sphereMesh, [coreMaterial], root);
    core.setLocalPosition(0, 0.55, 0);

    const dome = this.createEntity(this.sphereMesh, [hotMaterial], root);
    dome.setLocalPosition(0, 0.5, 0);

    // Dos discos de suelo: el relleno tiñe todo el círculo de daño y el
    // destello barre el área en el primer instante. Sin ellos la deflagración
    // se quedaba concentrada en el centro y el borde del aro salía vacío.
    const fill = this.createEntity(this.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.02, 0);
    const flashDisc = this.createEntity(this.discMesh, [flashMaterial], root);
    flashDisc.setLocalPosition(0, 0.03, 0);

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
    const arcWidth = Math.max(0.018, radius * 0.02);
    for (let index = 0; index < 4; index++) {
      // Cada arco cruza el diámetro completo: al girar barren todo el
      // círculo, no solo el núcleo central. La malla es unitaria y se estira
      // en Z; así no se genera geometría nueva por casteo.
      const mesh = this.cachedMesh(
        `explosion-arc:${arcWidth.toFixed(3)}:${index}`,
        () =>
          createLightningMesh(
            this.device,
            1,
            arcWidth,
            8,
            7000 + index * 6151
          )
      );
      const arc = this.createEntity(mesh, [arcMaterial], root);
      arc.setLocalPosition(0, 0.45 + index * 0.05, 0);
      arc.setLocalScale(1, 1, radius * 2);
      arcs.push({
        entity: arc,
        yaw: (index / 4) * 360 + 22,
        speed: 40 + index * 35
      });
    }

    const debrisInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 14; index++) {
      const size = radius * (0.035 + Math.random() * 0.045);
      debrisInstances.push({
        anim0: [
          (index / 14) * Math.PI * 2 + Math.random() * 0.4,
          radius * (0.68 + Math.random() * 0.55),
          0.35 + Math.random() * 0.85,
          size
        ],
        anim1: [
          Math.random() * 360,
          (Math.random() - 0.5) * 160,
          0,
          0
        ]
      });
    }
    const debrisBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.boxMesh,
      material: debrisMaterial,
      instances: debrisInstances,
      motion: MOTION_EXPLOSION_DEBRIS,
      radius,
      life
    });

    const smokeInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 8; index++) {
      smokeInstances.push({
        anim0: [
          (index / 8) * Math.PI * 2 + Math.random() * 0.5,
          radius * (0.25 + Math.random() * 0.5),
          0.5 + Math.random() * 0.8,
          radius * (0.18 + Math.random() * 0.16)
        ]
      });
    }
    const smokeBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: smokeMaterial,
      instances: smokeInstances,
      motion: MOTION_EXPLOSION_SMOKE,
      radius,
      life
    });

    this.addEffect(root, materials, life, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      const flash = Math.max(0, 1 - t / 0.22);

      // El relleno nace casi a tamaño completo para que el área afectada se
      // lea entera desde el primer frame; el destello la recorre aún más
      // rápido antes de apagarse.
      const fillGrow = Math.min(1, t / 0.12);
      const fillScale =
        radius * 2 * (0.2 + (1 - Math.pow(1 - fillGrow, 3)) * 0.8);
      fill.setLocalScale(fillScale, 1, fillScale);
      const flashGrow = Math.min(1, t / 0.08);
      const flashScale =
        radius * 2 * (0.3 + (1 - Math.pow(1 - flashGrow, 2)) * 0.7);
      flashDisc.setLocalScale(flashScale, 1, flashScale);

      const coreScale = radius * (0.32 + ease * 0.58);
      core.setLocalScale(coreScale, coreScale, coreScale);
      // La cúpula se abre hasta el borde del área y sigue visible mientras
      // crece, no solo durante el fogonazo inicial.
      const domeGrow = 1 - Math.pow(1 - Math.min(1, t / 0.45), 3);
      const domeScale = radius * (0.4 + domeGrow * 1.6);
      dome.setLocalScale(domeScale, domeScale * 0.6, domeScale);

      for (const ring of rings) {
        const local = Math.min(
          1,
          Math.max(0, (t - ring.delay) / 0.5)
        );
        const scale = radius * 2 * (0.14 + local * 0.86);
        ring.entity.setLocalScale(scale, 1, scale);
        // La onda mantiene brillo casi hasta el borde y se apaga justo al
        // cruzar el límite del área, para que el aro nunca quede vacío.
        const ringFade = Math.min(1, Math.max(0, 1 - local) * 3.2);
        ring.material.opacity =
          0.8 * ringFade * Math.max(0, 1 - t * 0.35);
      }

      const arcReveal = Math.min(1, t / 0.14);
      const arcFade = Math.max(0, 1 - t / 0.55);
      for (const arc of arcs) {
        arc.entity.setLocalEulerAngles(
          0,
          arc.yaw + t * arc.speed,
          Math.sin(t * 22 + arc.speed) * 12
        );
        arc.entity.setLocalScale(
          0.35 + arcReveal * 0.65,
          0.4 + arcReveal * 0.6,
          radius * 2 * (0.35 + arcReveal * 0.65)
        );
      }

      debrisBatch.setTime(t * life);
      smokeBatch.setTime(t * life);

      coreMaterial.opacity = 0.95 * flash;
      hotMaterial.opacity = 0.35 * Math.pow(1 - t, 1.2);
      arcMaterial.opacity = 0.95 * arcFade;
      fillMaterial.opacity = 0.16 * (1 - t);
      flashMaterial.opacity = 0.32 * flash * flash;
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

    const wispInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 10; index++) {
      wispInstances.push({
        anim0: [
          (index / 10) * Math.PI * 2 + Math.random() * 0.4,
          radius * (0.25 + Math.random() * 0.6),
          Math.random() * 0.5,
          radius * (0.35 + Math.random() * 0.4)
        ],
        anim1: [radius * (0.05 + Math.random() * 0.05), 0, 0, 0]
      });
    }
    const wispBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.boxMesh,
      material: wispMaterial,
      instances: wispInstances,
      motion: MOTION_GHOST_WISPS,
      radius,
      life
    });

    const eyeInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 4; index++) {
      const angle = (index / 4) * Math.PI * 2 + 0.6;
      eyeInstances.push({
        x: Math.cos(angle) * radius * 0.72,
        y: 0.45,
        z: Math.sin(angle) * radius * 0.72,
        anim0: [index * 1.4, 0, 0, 0]
      });
    }
    const eyeBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: eyeMaterial,
      instances: eyeInstances,
      motion: MOTION_GHOST_EYES,
      radius,
      life
    });

    let time = 0;
    this.addEffect(root, materials, life, (_t, dt) => {
      time += dt;
      const pulse = 0.5 + Math.sin(time * 6) * 0.2;
      ringMaterial.opacity = (0.35 + pulse * 0.2) * (1 - time / life);
      fillMaterial.opacity = (0.06 + pulse * 0.04) * (1 - time / life);

      wispBatch.setTime(time);
      eyeBatch.setTime(time);
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

    const shardInstances: EffectBatchInstance[] = [];
    const shardCount = 54;
    for (let index = 0; index < shardCount; index++) {
      shardInstances.push({
        anim0: [
          Math.random() * Math.PI * 2,
          0.15 + Math.random() * 0.8,
          radius * (0.45 + Math.random() * 0.55),
          Math.random() * 0.1
        ],
        anim1: [
          0.38 + Math.random() * 0.24,
          0.08 + Math.random() * 0.1,
          Math.random() * Math.PI * 2,
          0
        ]
      });
    }
    const shardBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: shardMaterial,
      instances: shardInstances,
      motion: MOTION_PSYCHIC_SHARDS,
      radius,
      life
    });

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

      shardBatch.setTime(time);
    });
  }

  /**
   * Marca de área para las habilidades con retardo. El aro del borde (color
   * del equipo) es la parte persistente: se mantiene desde el inicio de la
   * preparación hasta que termina el efecto o se cancela el lanzamiento. El
   * relleno, el disco de carga y el destello final solo acompañan al `windup`
   * y desaparecen al impactar. Con `windup` 0 (áreas instantáneas) la marca
   * nace directamente como aro.
   */
  spawnAoeTelegraph(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number,
    effectDuration = 0
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

    const charge = Math.max(0, duration);
    const effect = Math.max(0, effectDuration);
    const total = Math.max(0.05, charge + effect);

    const record: GroundTelegraph = {
      entity: root,
      materials,
      elapsed: 0,
      duration: total,
      active: true,
      anchors: areaAnchors(x, z, radius),
      update: (_progress, elapsed) => {
        const pulse = 0.5 + Math.sin(elapsed * 14) * 0.18;
        // El aro se apaga en el último tramo del efecto, a la vez que el
        // residuo visual del área, para que no desaparezca de golpe.
        const fade = Math.max(0, Math.min(1, (total - elapsed) / 0.3));
        ringMaterial.opacity = (0.3 + pulse * 0.35) * fade;
        dashMaterial.opacity = (0.55 + pulse * 0.35) * fade;
        fillMaterial.opacity = (0.06 + pulse * 0.05) * fade;
        dash.setLocalEulerAngles(0, -elapsed * 32, 0);

        const chargeProgress =
          charge > 0 ? Math.min(1, elapsed / charge) : 1;
        if (charge > 0 && elapsed < charge) {
          // Durante la preparación el disco crece hasta el radio real.
          const sweepScale = Math.max(0.01, radius * 2 * chargeProgress);
          sweep.setLocalScale(sweepScale, 1, sweepScale);
          sweepMaterial.opacity = 0.34 * (1 - chargeProgress * 0.55);

          // Destello final: avisa del impacto inminente.
          if (chargeProgress > 0.82) {
            const flash = (chargeProgress - 0.82) / 0.18;
            ringMaterial.opacity += flash * 0.45 * fade;
            dashMaterial.opacity += flash * 0.35 * fade;
            sweepMaterial.opacity += flash * 0.3;
          }
        } else {
          // Ya impactó: el aro queda solo como límite del área mientras dura
          // el efecto, sin relleno de carga ni destello.
          sweep.setLocalScale(0.01, 1, 0.01);
          sweepMaterial.opacity = 0;
        }
      }
    };

    this.applyVisibility(root, areaAnchors(x, z, radius));
    this.telegraphs.add(record);
    return { destroy: () => this.disposeTelegraph(record) };
  }

  private disposeTelegraph(telegraph: GroundTelegraph): void {
    if (!telegraph.active) return;
    telegraph.active = false;
    this.telegraphs.delete(telegraph);
    telegraph.entity.destroy();
    for (const material of telegraph.materials) material.destroy();
  }

  /**
   * Carril de un haz en el suelo. Los raíles muestran el ancho real de impacto
   * desde el primer frame del `windup`; el relleno crece desde el lanzador y se
   * completa al disparar. Después permanece encendido hasta que termina el
   * efecto visual del haz, de modo que el aviso y el golpe se solapan.
   */
  spawnBeamLane(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    halfWidth: number,
    color: readonly [number, number, number],
    windup: number,
    style: BeamStyle
  ): TelegraphHandle {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.max(0.1, Math.hypot(dx, dz));
    const width = Math.max(0.12, halfWidth * 2);
    const beamDuration = this.beamDurations[style] ?? 0.5;
    const total = Math.max(0.05, windup) + beamDuration;

    const root = new pc.Entity('beam-lane');
    // Mismo plano que la marca de área para no pelearse con el terreno.
    root.setPosition(x1, 0.07, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    this.app.root.addChild(root);

    const hot: [number, number, number] = [
      Math.round(color[0] + (255 - color[0]) * 0.62),
      Math.round(color[1] + (255 - color[1]) * 0.62),
      Math.round(color[2] + (255 - color[2]) * 0.62)
    ];
    const fillMaterial = this.createMaterial(color, 0.08);
    const railMaterial = this.createMaterial(color, 0.45);
    const edgeMaterial = this.createMaterial(hot, 0.8);
    const materials = [fillMaterial, railMaterial, edgeMaterial];

    // Relleno que avanza desde el lanzador: marca el carril y su dirección.
    const fill = this.createEntity(this.boxMesh, [fillMaterial], root);
    fill.setLocalScale(width, 0.01, 0.01);
    fill.setLocalPosition(0, 0.002, 0.005);

    // Raíles completos desde el primer frame: el rival ve el ancho real.
    const railWidth = Math.max(0.04, width * 0.06);
    const railOffset = Math.max(0, width / 2 - railWidth / 2);
    for (const side of [-1, 1]) {
      const rail = this.createEntity(this.boxMesh, [railMaterial], root);
      rail.setLocalScale(railWidth, 0.012, length);
      rail.setLocalPosition(side * railOffset, 0.006, length / 2);
    }

    // Remate del extremo para leer hasta dónde llega el haz.
    const cap = this.createEntity(this.boxMesh, [edgeMaterial], root);
    cap.setLocalScale(width, 0.014, Math.max(0.05, railWidth * 1.4));
    cap.setLocalPosition(0, 0.008, length);

    const perpX = -dz / length;
    const perpZ = dx / length;
    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    const anchors: FxAnchors = [
      [x1, z1],
      [midX + perpX * halfWidth, midZ + perpZ * halfWidth],
      [midX, midZ],
      [midX - perpX * halfWidth, midZ - perpZ * halfWidth],
      [x2, z2]
    ];

    const record: GroundTelegraph = {
      entity: root,
      materials,
      elapsed: 0,
      duration: total,
      active: true,
      anchors,
      update: (_progress, elapsed) => {
        const firing = elapsed >= windup;
        const sinceFire = firing ? elapsed - windup : 0;
        const charge = Math.min(1, elapsed / Math.max(0.001, windup));
        const visibleLength = Math.max(0.02, length * (firing ? 1 : charge));
        fill.setLocalScale(width, 0.01, visibleLength);
        fill.setLocalPosition(0, 0.002, visibleLength / 2);

        const pulse = 0.5 + Math.sin(elapsed * 14) * 0.2;
        // Destello al disparar y permanencia hasta el final del haz.
        const flash = firing ? Math.max(0, 1 - sinceFire / 0.14) : 0;
        const fadeStart = beamDuration * 0.5;
        const fade = firing
          ? 1 -
            Math.max(
              0,
              Math.min(1, (sinceFire - fadeStart) / (beamDuration - fadeStart))
            )
          : 1;
        fillMaterial.opacity =
          (firing ? 0.2 + flash * 0.18 : 0.06 + charge * 0.1) * fade;
        railMaterial.opacity = (0.35 + pulse * 0.2 + flash * 0.4) * fade;
        edgeMaterial.opacity = (0.6 + pulse * 0.22 + flash * 0.4) * fade;
      }
    };

    this.applyVisibility(root, anchors);
    this.telegraphs.add(record);
    return { destroy: () => this.disposeTelegraph(record) };
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

    const flameInstances: EffectBatchInstance[] = [];
    const hotFlameInstances: EffectBatchInstance[] = [];
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
        const instance: EffectBatchInstance = {
          anim0: [index * 1.3 + ringIndex * 2.1, angle, dist, yaw],
          anim1: [baseWidth, baseHeight, 0, 0]
        };
        if ((index + ringIndex) % 4 === 0) hotFlameInstances.push(instance);
        else flameInstances.push(instance);
      }
    }
    const flameParams: [number, number, number, number] = [
      Math.min(0.22, life * 0.3),
      Math.min(0.35, life * 0.35),
      Math.min(0.25, life * 0.3),
      0
    ];
    const flameBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.flameMesh,
      material: flameMaterial,
      instances: flameInstances,
      motion: MOTION_HEAT_FLAMES,
      radius,
      life,
      params: flameParams
    });
    const hotFlameBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.flameMesh,
      material: hotMaterial,
      instances: hotFlameInstances,
      motion: MOTION_HEAT_FLAMES,
      radius,
      life,
      params: flameParams
    });

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

      flameBatch.setTime(time);
      hotFlameBatch.setTime(time);

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

    const flameInstances: EffectBatchInstance[] = [];
    const hotFlameInstances: EffectBatchInstance[] = [];

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
        const instance: EffectBatchInstance = {
          anim0: [baseAngle, dist, 4 + f * 8, arm * 2.3 + index * 1.1],
          anim1: [baseWidth, baseHeight, 0, 0]
        };
        if ((index + arm) % 4 === 0) hotFlameInstances.push(instance);
        else flameInstances.push(instance);
      }
    }
    const flameParams: [number, number, number, number] = [
      Math.min(0.22, life * 0.3),
      Math.min(0.4, life * 0.35),
      Math.min(0.24, life * 0.3),
      0
    ];
    const flameBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.flameMesh,
      material: flameMaterial,
      instances: flameInstances,
      motion: MOTION_FIRE_WHIRL_FLAMES,
      radius,
      life,
      params: flameParams
    });
    const hotFlameBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.flameMesh,
      material: hotMaterial,
      instances: hotFlameInstances,
      motion: MOTION_FIRE_WHIRL_FLAMES,
      radius,
      life,
      params: flameParams
    });

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
      const pulse = 0.5 + Math.sin(time * 8) * 0.2;

      ringMaterial.opacity = (0.16 + pulse * 0.12) * envelope;
      glowMaterial.opacity = (0.08 + pulse * 0.05) * envelope;
      light.light!.intensity = 1.4 * envelope * (0.7 + Math.random() * 0.3);

      flameBatch.setTime(time);
      hotFlameBatch.setTime(time);

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

  /**
   * Escudo esférico de Protección. Sigue al Pokémon, usa su color accent y
   * mantiene la esfera centrada en el cuerpo durante toda la duración. No
   * dibuja anillo horizontal: solo la esfera y su halo.
   */
  spawnProtectionShield(
    position: { x: number; z: number },
    color: readonly [number, number, number],
    radius: number,
    centerY: number,
    duration: number
  ): FxHandle {
    const root = new pc.Entity('protection-shield');
    root.setPosition(position.x, centerY, position.z);
    this.app.root.addChild(root);

    const baseMaterial = this.createShieldMaterial(color, 0.12, pc.BLEND_NORMAL);
    const glowMaterial = this.createShieldMaterial(
      color,
      0.1,
      pc.BLEND_ADDITIVEALPHA
    );

    const base = this.createEntity(this.sphereMesh, [baseMaterial], root);
    const glow = this.createEntity(this.sphereMesh, [glowMaterial], root);
    const baseScale = radius * 2;
    base.setLocalScale(baseScale, baseScale, baseScale);
    glow.setLocalScale(baseScale * 1.06, baseScale * 1.06, baseScale * 1.06);

    const anchor: [number, number] = [position.x, position.z];
    return this.addEffect(
      root,
      [baseMaterial, glowMaterial],
      duration,
      (t) => {
        anchor[0] = position.x;
        anchor[1] = position.z;
        root.setPosition(position.x, centerY, position.z);
        const fadeIn = Math.min(1, t * 10);
        const fadeOut = t > 0.8 ? Math.max(0, (1 - t) / 0.2) : 1;
        const fade = fadeIn * fadeOut;
        const pulse = 1 + Math.sin(t * Math.PI * 8) * 0.015;
        baseMaterial.opacity = 0.12 * fade;
        glowMaterial.opacity = 0.1 * fade;
        base.setLocalScale(baseScale * pulse, baseScale * pulse, baseScale * pulse);
        glow.setLocalScale(
          baseScale * 1.06 * pulse,
          baseScale * 1.06 * pulse,
          baseScale * 1.06 * pulse
        );
      },
      [anchor]
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

  /**
   * Área de curación: disco y aro rosas que marcan todo el radio, ondas que
   * recorren el área y motas que ascienden desde cualquier punto curado.
   */
  private spawnRecoveryAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.2, duration);
    const root = new pc.Entity('recovery-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    // Los tintes claros salen del color de la habilidad para que el área de
    // curación acompañe a cada Pokémon: rosa en Mew, verde en Celebi.
    const lighten = (
      amount: number
    ): readonly [number, number, number] => [
      Math.round(color[0] + (255 - color[0]) * amount),
      Math.round(color[1] + (255 - color[1]) * amount),
      Math.round(color[2] + (255 - color[2]) * amount)
    ];

    const ringMaterial = this.createMaterial(color, 0.55);
    const fillMaterial = this.createMaterial(lighten(0.55), 0.12);
    const waveMaterial = this.createMaterial(lighten(0.35), 0.7);
    const moteMaterial = this.createMaterial(lighten(0.75), 0.95);
    const materials = [ringMaterial, fillMaterial, waveMaterial, moteMaterial];

    const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
    ring.setLocalPosition(0, 0.1, 0);
    ring.setLocalScale(radius * 2, 1, radius * 2);

    const fill = this.createEntity(this.discMesh, [fillMaterial], root);
    fill.setLocalPosition(0, 0.03, 0);
    fill.setLocalScale(radius * 2, 1, radius * 2);

    const waves: pc.Entity[] = [];
    for (let index = 0; index < 3; index++) {
      const wave = this.createEntity(this.torusMesh, [waveMaterial], root);
      wave.setLocalPosition(0, 0.12 + index * 0.06, 0);
      waves.push(wave);
    }

    const moteInstances: EffectBatchInstance[] = [];
    const moteCount = 56;
    for (let index = 0; index < moteCount; index++) {
      moteInstances.push({
        anim0: [
          Math.random() * Math.PI * 2,
          // Reparto uniforme por la superficie del círculo, no concentrado en
          // el centro, para que toda el área se lea como zona curada.
          Math.sqrt(Math.random()) * radius * 0.95,
          Math.random() * 0.28,
          radius * (0.3 + Math.random() * 0.45)
        ],
        anim1: [0.05 + Math.random() * 0.07, 0, 0, 0]
      });
    }
    const moteBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: moteMaterial,
      instances: moteInstances,
      motion: MOTION_RECOVERY_MOTES,
      radius,
      life
    });

    let time = 0;
    this.addEffect(root, materials, life, (_t, dt) => {
      time += dt;
      const fadeOut = Math.max(0, 1 - time / life);
      const pulse = 0.5 + Math.sin(time * 18) * 0.25;

      ringMaterial.opacity = (0.35 + pulse * 0.25) * fadeOut;
      fillMaterial.opacity = (0.07 + pulse * 0.05) * fadeOut;
      waveMaterial.opacity = 0.65 * fadeOut;
      const groundScale = radius * 2 * (0.98 + pulse * 0.04);
      ring.setLocalScale(groundScale, 1, groundScale);

      for (let index = 0; index < waves.length; index++) {
        const progress = Math.min(
          1,
          Math.max(0, (time - index * 0.1) / 0.55)
        );
        const ease = 1 - (1 - progress) * (1 - progress);
        const scale = Math.max(0.01, radius * 2 * ease);
        waves[index].setLocalScale(scale, 1, scale);
      }

      moteBatch.setTime(time);
      moteMaterial.opacity = 0.95 * fadeOut;
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
   * Mandíbula espectral: dos filas de colmillos 3D que giran sobre una bisagra
   * en la garganta, así que la boca se abre y se cierra como una mordida de
   * verdad. Los dientes reutilizan el cono compartido de roca y el efecto es
   * barato.
   */
  private spawnJawBite(
    x: number,
    z: number,
    yaw: number,
    radius: number,
    effectiveness: number
  ): void {
    const root = new pc.Entity('jaw-bite');
    root.setPosition(x, 0, z);
    root.setEulerAngles(0, yaw / DEG, 0);
    this.app.root.addChild(root);

    const power = effectiveness > 1 ? 1.16 : effectiveness < 1 ? 0.9 : 1;
    const size = Math.max(0.5, radius * power);
    const arcRadius = size * 0.72;
    const arcCenterZ = size * 0.12;
    const halfAngle = 0.95;
    const hinge = size * 0.16;

    // Colmillos blancos con facetas: emisión alta para que no se apaguen a gris
    // en las caras en sombra.
    const toothMaterial = this.createRockMaterial([255, 255, 255], 1);
    toothMaterial.emissive = new pc.Color(0.88, 0.88, 0.92);
    toothMaterial.emissiveIntensity = 1;
    toothMaterial.update();
    const materials = [toothMaterial];

    const mouth = new pc.Entity('jaw-mouth');
    root.addChild(mouth);
    mouth.setLocalPosition(0, 1.02, 0);
    // La abertura se inclina un poco hacia la cámara para que las dos filas de
    // colmillos se lean como una boca abierta y no solo su canto superior.
    mouth.setLocalEulerAngles(-18, 0, 0);

    const upper = new pc.Entity('jaw-upper');
    const lower = new pc.Entity('jaw-lower');
    // Las filas se separan un poco en profundidad: así los colmillos se
    // intercalan al cerrarse en vez de atravesarse.
    upper.setLocalPosition(0, hinge, size * 0.03);
    lower.setLocalPosition(0, -hinge, -size * 0.03);
    mouth.addChild(upper);
    mouth.addChild(lower);

    const addToothRow = (row: pc.Entity, facingUp: boolean): void => {
      // La fila inferior va desfasada media pieza para que los colmillos se
      // intercalen al cerrarse, como una cremallera.
      const count = facingUp ? 10 : 11;
      const step = (2 * halfAngle) / 10;
      const start = facingUp ? -halfAngle + step * 0.5 : -halfAngle;
      for (let index = 0; index < count; index++) {
        const angle = start + step * index;
        if (Math.abs(angle) > halfAngle + 0.001) continue;
        const center = 1 - Math.abs(angle) / halfAngle;
        const length = size * (0.25 + center * 0.1 + (index % 2) * 0.02);
        const width = size * (0.095 + center * 0.04);
        const tooth = this.createEntity(
          this.rockSpikeMesh,
          [toothMaterial],
          row
        );
        tooth.setLocalPosition(
          Math.sin(angle) * arcRadius,
          (facingUp ? 1 : -1) * length * 0.5,
          arcCenterZ + Math.cos(angle) * arcRadius
        );
        tooth.setLocalScale(width, length, width);
        // Los colmillos se abren en abanico hacia fuera de la boca.
        const fan = (angle / DEG) * 0.35;
        tooth.setLocalEulerAngles(facingUp ? 0 : 180, 0, -fan);
      }
    };
    addToothRow(upper, false);
    addToothRow(lower, true);

    this.addEffect(root, materials, 0.5, (t) => {
      const grow = Math.min(1, t / 0.14);
      const scale = 0.5 + grow * 0.5;
      mouth.setLocalScale(scale, scale, scale);

      // Se abre del todo y se cierra de golpe al tercio del efecto. Después
      // rebota un poco, como una mandíbula que acaba de triturar.
      let open: number;
      if (t < 0.18) open = 0.55 + (0.45 * t) / 0.18;
      else if (t < 0.3) {
        const close = (t - 0.18) / 0.12;
        open = 1 - close * close;
      } else if (t < 0.38) {
        open = -0.05 * Math.sin(((t - 0.3) / 0.08) * Math.PI);
      } else {
        open = 0;
      }
      upper.setLocalEulerAngles((-0.66 * open) / DEG, 0, 0);
      lower.setLocalEulerAngles((0.6 * open) / DEG, 0, 0);

      const shake = t > 0.3 && t < 0.42 ? Math.sin(t * 260) * 0.012 : 0;
      mouth.setLocalPosition(
        shake,
        1.02 + Math.sin(t * 46) * 0.008,
        Math.sin(t * 37) * 0.006
      );

      const fade = t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38;
      // Blanco ligeramente translúcido: conserva el volumen sin verse macizo.
      toothMaterial.opacity = 0.8 * fade;
    });
  }

  /**
   * Impacto de mordida: tres marcas de colmillos cruzadas y esquirlas blancas.
   * Sin núcleos, aros ni destellos, para conservar la paleta limpia.
   */
  private spawnJawBurst(
    x: number,
    z: number,
    effectiveness: number
  ): void {
    const root = new pc.Entity('jaw-impact');
    root.setPosition(x, 0.65, z);
    this.app.root.addChild(root);

    const power = effectiveness > 1 ? 1.2 : effectiveness < 1 ? 0.9 : 1;
    const shardMaterial = this.createRockMaterial([255, 255, 255], 1);
    shardMaterial.emissive = new pc.Color(0.88, 0.88, 0.92);
    shardMaterial.emissiveIntensity = 1;
    shardMaterial.update();
    const streakMaterial = this.createWaterMaterial([255, 255, 255], 0.9);
    const materials = [shardMaterial, streakMaterial];

    const streaks: {
      entity: pc.Entity;
      yaw: number;
      roll: number;
      delay: number;
    }[] = [];
    for (let index = 0; index < 3; index++) {
      const streak = this.createEntity(this.boxMesh, [streakMaterial], root);
      streaks.push({
        entity: streak,
        yaw: index * 60 + 30,
        roll: (index - 1) * 26,
        delay: index * 0.03
      });
    }

    const shards: {
      entity: pc.Entity;
      angle: number;
      rise: number;
      distance: number;
      length: number;
      spin: number;
      delay: number;
    }[] = [];
    const count = 7;
    for (let index = 0; index < count; index++) {
      const shard = this.createEntity(
        this.rockSpikeMesh,
        [shardMaterial],
        root
      );
      const length = (0.2 + (index % 3) * 0.06) * power;
      shard.setLocalScale(0.09 * power, length, 0.09 * power);
      shards.push({
        entity: shard,
        angle: (index / count) * Math.PI * 2 + 0.35,
        rise: 0.5 + (index % 2) * 0.35,
        distance: 0.55 + (index % 3) * 0.16,
        length,
        spin: (index % 2 === 0 ? 1 : -1) * (260 + index * 40),
        delay: index * 0.02
      });
    }

    this.addEffect(root, materials, 0.38, (t) => {
      const fade = Math.max(0, 1 - t);

      for (const streak of streaks) {
        const local = Math.min(
          1,
          Math.max(0, (t - streak.delay) / 0.35)
        );
        const length = (0.45 + local * 1.35) * power;
        const thickness = 0.09 * (1 - local * 0.35);
        streak.entity.setLocalScale(thickness, thickness, length);
        streak.entity.setLocalEulerAngles(
          0,
          streak.yaw + local * 20,
          streak.roll + local * 32
        );
      }
      streakMaterial.opacity = 0.62 * fade;

      for (const shard of shards) {
        const shardT = Math.min(
          1,
          Math.max(0, (t - shard.delay) / 0.7)
        );
        const travel = 1 - (1 - shardT) * (1 - shardT);
        shard.entity.setLocalPosition(
          Math.cos(shard.angle) * shard.distance * travel,
          0.1 + shard.rise * travel,
          Math.sin(shard.angle) * shard.distance * travel
        );
        shard.entity.setLocalEulerAngles(
          (shardT * 320) % 360,
          (shardT * shard.spin) % 360,
          (shardT * 180) % 360
        );
        const grow = 1 - shardT * 0.6;
        shard.entity.setLocalScale(
          0.09 * power * grow,
          shard.length * grow,
          0.09 * power * grow
        );
      }
      shardMaterial.opacity = fade;
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

    const coreMaterial = this.createWaterMaterial(tintColor(color, 0.9), 0.9);
    const glowMaterial = this.createWaterMaterial(color, 0.16);
    const bladeMaterial = this.createWaterMaterial(tintColor(color, 0.72), 0.62);
    const hotMaterial = this.createMaterial(color, 0.5);
    const featherMaterial = this.createLeafMaterial(tintColor(color, 0.52), 0.85);
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

    const coreMaterial = this.createMaterial(tintColor(color, 0.92), 0.92);
    const glowMaterial = this.createWaterMaterial(color, 0.3);
    const ringMaterial = this.createMaterial(tintColor(color, 0.78), 0.55);
    const bladeMaterial = this.createWaterMaterial(tintColor(color, 0.68), 0.66);
    const featherMaterial = this.createLeafMaterial(tintColor(color, 0.52), 0.85);
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

    const ringMaterial = this.createMaterial(tintColor(color, 0.6), 0.32);
    const bladeMaterial = this.createWaterMaterial(tintColor(color, 0.78), 0.58);
    const hotMaterial = this.createMaterial(color, 0.4);
    // Las brasas comparten color con las aspas calientes, pero necesitan otro
    // shader de animación; un material propio evita pisar el chunk.
    const emberMaterial = this.createMaterial(color, 0.4);
    const featherMaterial = this.createLeafMaterial(tintColor(color, 0.5), 0.8);
    const materials = [
      ringMaterial,
      bladeMaterial,
      hotMaterial,
      emberMaterial,
      featherMaterial
    ];

    const rings: pc.Entity[] = [];
    const ringMesh = createArcBandMesh(this.device, 0.955, 1, Math.PI, 64).mesh;
    for (let index = 0; index < 2; index++) {
      const ring = this.createEntity(ringMesh, [ringMaterial], root);
      ring.setLocalPosition(0, 0.1 + index * 0.02, 0);
      rings.push(ring);
    }

    const bladeInstances: EffectBatchInstance[] = [];
    const hotBladeInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2 + Math.random() * 0.35;
      const instance: EffectBatchInstance = {
        anim0: [
          angle,
          (index % 2 === 0 ? 1 : -1) * (0.8 + Math.random() * 0.7),
          radius * (0.18 + Math.random() * 0.45),
          radius *
            (0.42 + Math.random() * 0.2) *
            (0.75 + Math.random() * 0.4)
        ]
      };
      if (index % 3 === 0) hotBladeInstances.push(instance);
      else bladeInstances.push(instance);
    }
    const bladeBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.cachedMesh('wind-blade:air', () =>
        createWindBladeMesh(this.device, 1, 1.25, 0.24, 10)
      ),
      material: bladeMaterial,
      instances: bladeInstances,
      motion: MOTION_AIR_BLADES,
      radius,
      life
    });
    const hotBladeBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.cachedMesh('wind-blade:air', () =>
        createWindBladeMesh(this.device, 1, 1.25, 0.24, 10)
      ),
      material: hotMaterial,
      instances: hotBladeInstances,
      motion: MOTION_AIR_BLADES,
      radius,
      life
    });

    const featherInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2 + Math.random() * 0.5;
      featherInstances.push({
        anim0: [
          angle,
          radius * (0.25 + Math.random() * 0.68),
          radius * (0.4 + Math.random() * 0.55),
          Math.random() * 0.45
        ],
        anim1: [
          radius * (0.035 + Math.random() * 0.03),
          Math.random() * Math.PI * 2,
          0,
          0
        ]
      });
    }
    const featherBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.leafMesh,
      material: featherMaterial,
      instances: featherInstances,
      motion: MOTION_AIR_FEATHERS,
      radius,
      life
    });

    const emberInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 6; index++) {
      emberInstances.push({
        anim0: [
          (index / 6) * Math.PI * 2 + 0.5,
          radius * (0.35 + Math.random() * 0.4),
          0,
          0
        ]
      });
    }
    const emberBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: emberMaterial,
      instances: emberInstances,
      motion: MOTION_AIR_EMBERS,
      radius,
      life
    });

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

      bladeBatch.setTime(time);
      hotBladeBatch.setTime(time);
      featherBatch.setTime(time);
      emberBatch.setTime(time);
    });
  }

  /**
   * Huracán de `Ciclón`: un vórtice de nubes 3D con ojo oscuro. Tres brazos
   * espirales de cinta abombada giran alrededor del centro, reforzados por
   * nubes volumétricas y una banda exterior. El ojo queda libre y se marca con
   * un disco azul oscuro.
   */
  private spawnCycloneAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.2, duration);
    const root = new pc.Entity('cyclone-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const vortex = new pc.Entity('cyclone-vortex');
    root.addChild(vortex);

    // Capas de cintas a distintas alturas: el vórtice tiene volumen en Y.
    const ribbonMaterials = [
      this.createVertexColorMaterial(0.28),
      this.createVertexColorMaterial(0.24),
      this.createVertexColorMaterial(0.2),
      this.createVertexColorMaterial(0.16)
    ];
    const puffMaterial = this.createWaterMaterial(tintColor(color, 0.84), 0.2);
    const puffShadeMaterial = this.createWaterMaterial(
      tintColor(color, 0.58),
      0.16
    );
    const eyeMaterial = this.createWaterMaterial([18, 55, 92], 0.55);
    const eyeRingMaterial = this.createMaterial(tintColor(color, 0.55), 0.32);
    const outerRingMaterial = this.createWaterMaterial(
      tintColor(color, 0.6),
      0.16
    );
    const materials = [
      ...ribbonMaterials,
      puffMaterial,
      puffShadeMaterial,
      eyeMaterial,
      eyeRingMaterial,
      outerRingMaterial
    ];

    // Ojo del huracán.
    const eye = this.createEntity(this.discMesh, [eyeMaterial], root);
    eye.setLocalPosition(0, 0.06, 0);
    eye.setLocalScale(radius * 0.3, 1, radius * 0.3);
    const eyeRing = this.createEntity(this.torusMesh, [eyeRingMaterial], root);
    eyeRing.setLocalPosition(0, 0.07, 0);
    eyeRing.setLocalScale(radius * 0.3, 1, radius * 0.3);

    // Aro tenue para leer el radio del área.
    const outerRing = this.createEntity(
      this.torusMesh,
      [outerRingMaterial],
      root
    );
    outerRing.setLocalPosition(0, 0.06, 0);
    outerRing.setLocalScale(radius * 2, 1, radius * 2);

    const arms = 3;
    const ribbonLayers = [
      { y: 0.02, scale: 0.86, twist: 0 },
      { y: 0.32, scale: 0.94, twist: 14 },
      { y: 0.64, scale: 1, twist: 28 },
      { y: 0.94, scale: 1.02, twist: 42 }
    ];
    const armInstances: EffectBatchInstance[][] = ribbonLayers.map(() => []);
    for (let layerIndex = 0; layerIndex < ribbonLayers.length; layerIndex++) {
      const layer = ribbonLayers[layerIndex];
      for (let armIndex = 0; armIndex < arms; armIndex++) {
        armInstances[layerIndex].push({
          x: 0,
          y: layer.y,
          z: 0,
          sx: radius * layer.scale,
          sy: 1,
          sz: radius * layer.scale,
          ry: (armIndex / arms) * 360 + layer.twist
        });
      }
    }
    for (let layerIndex = 0; layerIndex < armInstances.length; layerIndex++) {
      new EffectBatch({
        app: this.app,
        parent: vortex,
        mesh: this.cycloneArmMeshes[layerIndex % this.cycloneArmMeshes.length],
        material: ribbonMaterials[layerIndex],
        instances: armInstances[layerIndex],
        motion: MOTION_STATIC,
        radius,
        life
      });
    }

    // Nubes volumétricas a lo largo de los brazos y en la banda exterior.
    const puffInstances: EffectBatchInstance[] = [];
    const puffShadeInstances: EffectBatchInstance[] = [];
    const addPuff = (
      angle: number,
      distance: number,
      y: number,
      size: number,
      shade: boolean,
      tall: boolean
    ): void => {
      const sx = size * (1.35 + Math.random() * 0.35);
      const sy = size * (tall ? 1.4 + Math.random() * 0.7 : 0.55 + Math.random() * 0.3);
      const sz = size * (1.35 + Math.random() * 0.35);
      const instance: EffectBatchInstance = {
        x: Math.cos(angle) * distance,
        y,
        z: Math.sin(angle) * distance,
        sx,
        sy,
        sz,
        anim0: [Math.random() * Math.PI * 2, y, 0, 0]
      };
      if (shade) puffShadeInstances.push(instance);
      else puffInstances.push(instance);
    };

    const turns = 1.5;
    for (let armIndex = 0; armIndex < arms; armIndex++) {
      const baseAngle = (armIndex / arms) * Math.PI * 2;
      for (let puffIndex = 0; puffIndex < 10; puffIndex++) {
        const t =
          0.16 + (puffIndex / 9) * 0.84 + (Math.random() - 0.5) * 0.03;
        const angle = baseAngle + t * turns * Math.PI * 2;
        const distance = (0.17 + 0.76 * t) * radius;
        const y =
          0.14 + Math.random() * 0.98 + 0.12 * (puffIndex / 9);
        const size = radius * (0.05 + Math.random() * 0.05);
        addPuff(
          angle,
          distance,
          y,
          size,
          puffIndex % 3 === 0,
          puffIndex % 2 === 0
        );
      }
    }
    for (let index = 0; index < 16; index++) {
      const angle = (index / 16) * Math.PI * 2 + Math.random() * 0.3;
      const distance = radius * (0.8 + Math.random() * 0.2);
      const y = 0.1 + Math.random() * 0.28;
      const size = radius * (0.06 + Math.random() * 0.06);
      addPuff(angle, distance, y, size, index % 2 === 0, false);
    }
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2 + Math.random() * 0.4;
      const distance = radius * (0.62 + Math.random() * 0.25);
      const y = 0.55 + Math.random() * 0.45;
      const size = radius * (0.06 + Math.random() * 0.05);
      addPuff(angle, distance, y, size, index % 2 === 0, true);
    }
    // Muro del ojo: dos anillos de nubes altas alrededor del centro.
    for (let ring = 0; ring < 2; ring++) {
      const wallRadius = radius * (0.28 + ring * 0.04);
      const wallY = 0.28 + ring * 0.5;
      for (let index = 0; index < 9; index++) {
        const angle = (index / 9) * Math.PI * 2 + ring * 0.35;
        const size = radius * (0.045 + Math.random() * 0.03);
        addPuff(
          angle,
          wallRadius,
          wallY + Math.random() * 0.08,
          size,
          false,
          true
        );
      }
    }

    const puffBatch = new EffectBatch({
      app: this.app,
      parent: vortex,
      mesh: this.sphereMesh,
      material: puffMaterial,
      instances: puffInstances,
      motion: MOTION_CYCLONE_PUFFS,
      radius,
      life
    });
    const puffShadeBatch = new EffectBatch({
      app: this.app,
      parent: vortex,
      mesh: this.sphereMesh,
      material: puffShadeMaterial,
      instances: puffShadeInstances,
      motion: MOTION_CYCLONE_PUFFS,
      radius,
      life
    });

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.18);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.3));
      const envelope = Math.min(fadeIn, fadeOut);
      const grow = 0.86 + 0.14 * Math.min(1, time / 0.35);
      const verticalBreath = 0.92 + 0.08 * Math.sin(time * 2.2);

      // El vórtice gira, crece y respira en vertical.
      vortex.setLocalEulerAngles(0, time * 300, 0);
      vortex.setLocalScale(grow, verticalBreath, grow);

      const ribbonOpacity = [0.26, 0.22, 0.18, 0.14];
      for (let index = 0; index < ribbonMaterials.length; index++) {
        ribbonMaterials[index].opacity = ribbonOpacity[index] * envelope;
      }
      puffMaterial.opacity = (0.18 + Math.sin(time * 4) * 0.03) * envelope;
      puffShadeMaterial.opacity =
        (0.14 + Math.sin(time * 3.4 + 1) * 0.025) * envelope;
      eyeMaterial.opacity = 0.5 * envelope;
      eyeRingMaterial.opacity = (0.24 + Math.sin(time * 6) * 0.06) * envelope;
      outerRingMaterial.opacity = 0.13 * envelope;

      const ringScale = radius * 2 * (0.94 + Math.sin(time * 3) * 0.02);
      outerRing.setLocalScale(ringScale, 1, ringScale);

      puffBatch.setTime(time);
      puffShadeBatch.setTime(time);
    };
    this.addEffect(root, materials, life, animate);
    animate(0, 0);
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

    const flameInstances: EffectBatchInstance[] = [];
    const hotFlameInstances: EffectBatchInstance[] = [];
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
        const instance: EffectBatchInstance = {
          anim0: [index * 1.3 + ringIndex * 2.1, angle, dist, yaw],
          anim1: [baseWidth, baseHeight, 0, 0]
        };
        if ((index + ringIndex) % 4 === 0) hotFlameInstances.push(instance);
        else flameInstances.push(instance);
      }
    }
    const flameParams: [number, number, number, number] = [
      0.16,
      0.3,
      Math.min(0.25, life * 0.3),
      0
    ];
    const flameBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.flameMesh,
      material: flameMaterial,
      instances: flameInstances,
      motion: MOTION_HEAT_FLAMES,
      radius,
      life,
      params: flameParams
    });
    const hotFlameBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.flameMesh,
      material: hotMaterial,
      instances: hotFlameInstances,
      motion: MOTION_HEAT_FLAMES,
      radius,
      life,
      params: flameParams
    });

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
    const bladeInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2;
      const size = radius * (0.32 + (index % 3) * 0.07);
      bladeInstances.push({
        x: Math.cos(angle) * radius * 0.45,
        y: Math.sin(angle * 2) * radius * 0.05,
        z: Math.sin(angle) * radius * 0.45,
        anim0: [size, index * 1.2, 0, 0]
      });
    }
    const bladeBatch = new EffectBatch({
      app: this.app,
      parent: swirl,
      mesh: this.cachedMesh('wind-blade:unit', () =>
        createWindBladeMesh(this.device, 0.52, 1.25, 0.1, 10)
      ),
      material: windMaterial,
      instances: bladeInstances,
      motion: MOTION_HEAT_BLADES,
      radius,
      life,
      params: [0.16, 0.3, 0.32, 0]
    });

    const emberInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2 + Math.random() * 0.5;
      const size = radius * (0.035 + Math.random() * 0.03);
      emberInstances.push({
        anim0: [
          angle,
          radius * (0.2 + Math.random() * 0.65),
          radius * (0.5 + Math.random() * 0.6),
          Math.random() * Math.PI * 2
        ],
        anim1: [size, 0, 0, 0]
      });
    }
    const emberBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: emberMaterial,
      instances: emberInstances,
      motion: MOTION_HEAT_EMBERS,
      radius,
      life
    });

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
      bladeBatch.setTime(time);
      flameBatch.setTime(time);
      hotFlameBatch.setTime(time);
      emberBatch.setTime(time);

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
    const coreMaterial = this.createWaterMaterial(tintColor(color, 0.9), 0.52);
    const ribbonMaterial = this.createWaterMaterial(tintColor(color, 0.68), 0.48);
    const hotMaterial = this.createMaterial(color, 0.42);
    const ringMaterial = this.createMaterial(tintColor(color, 0.78), 0.42);
    const featherMaterial = this.createLeafMaterial(tintColor(color, 0.52), 0.78);
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
   * Haz de Planta: columna verde con un núcleo claro y tres hélices de hojas
   * que giran en espiral alrededor de la línea, con anillos de polen que viajan
   * hasta la punta. La mezcla normal mantiene el verde legible sobre hierba o
   * arena clara.
   */
  private spawnGrassBeam(
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
    const root = new pc.Entity('grass-beam');
    root.setPosition(x1, 0.75, z1);
    root.setEulerAngles(0, Math.atan2(dx, dz) / DEG, 0);
    this.app.root.addChild(root);

    const bodyMaterial = this.createWaterMaterial(color, 0.22);
    const coreMaterial = this.createWaterMaterial([244, 255, 206], 0.5);
    const ringMaterial = this.createMaterial([214, 248, 160], 0.4);
    const leafMaterial = this.createLeafMaterial([226, 250, 184], 0.9);
    const hotLeafMaterial = this.createLeafMaterial([248, 255, 222], 0.9);
    const materials = [
      bodyMaterial,
      coreMaterial,
      ringMaterial,
      leafMaterial,
      hotLeafMaterial
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

    // Tres hélices de hojas: cada una gira alrededor del eje del haz mientras
    // avanza a lo largo de la línea.
    const leaves: {
      entity: pc.Entity;
      angle: number;
      offset: number;
      size: number;
      phase: number;
    }[] = [];
    const segments = 14;
    for (let helix = 0; helix < 3; helix++) {
      for (let index = 0; index < segments; index++) {
        const size = width * (0.32 + Math.random() * 0.14);
        const leaf = this.createLeaf(
          root,
          helix === 1 ? hotLeafMaterial : leafMaterial,
          {
            x: 0,
            y: 0,
            z: 0,
            width: size,
            height: size * 1.8,
            yaw: Math.random() * 360
          }
        );
        leaves.push({
          entity: leaf,
          angle: (helix / 3) * Math.PI * 2,
          offset: (index + 1) / segments,
          size,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    const rings: pc.Entity[] = [];
    for (let index = 0; index < 4; index++) {
      const ring = this.createEntity(this.torusMesh, [ringMaterial], root);
      ring.setLocalEulerAngles(90, 0, 0);
      rings.push(ring);
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

      for (const leaf of leaves) {
        const z = leaf.offset * visibleLength;
        const angle = leaf.angle + time * 8 + leaf.offset * Math.PI * 6;
        const radius = width * (1.05 + Math.sin(leaf.offset * Math.PI) * 0.18);
        leaf.entity.setLocalPosition(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          z
        );
        leaf.entity.setLocalEulerAngles(
          Math.sin(time * 10 + leaf.phase) * 35,
          angle / DEG + time * 220,
          Math.cos(time * 8 + leaf.phase) * 45
        );
        const scale = leaf.size * (0.8 + pulse * 0.2);
        leaf.entity.setLocalScale(scale, scale * 1.8, scale);
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

      bodyMaterial.opacity = 0.2 * pulse * fade;
      coreMaterial.opacity = 0.48 * pulse * fade;
      ringMaterial.opacity = 0.4 * fade;
      leafMaterial.opacity = 0.82 * fade;
      hotLeafMaterial.opacity = 0.82 * fade;
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

    const spikeInstances: EffectBatchInstance[] = [];
    const deepSpikeInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 26; index++) {
      // Ángulo áureo + raíz del índice: cubre el disco de forma uniforme en
      // vez de amontonar las púas cerca del centro.
      const angle = index * 2.399963 + Math.random() * 0.35;
      const distance =
        Math.sqrt((index + 0.5) / 26) * radius * 0.92;
      const height = radius * (0.24 + Math.random() * 0.36);
      const width = radius * (0.1 + Math.random() * 0.06);
      const instance: EffectBatchInstance = {
        anim0: [
          Math.cos(angle) * distance,
          Math.sin(angle) * distance,
          width,
          Math.random() * 0.2
        ],
        anim1: [
          height,
          (Math.random() - 0.5) * 24,
          Math.random() * 360,
          (Math.random() - 0.5) * 24
        ]
      };
      if (index % 4 === 0) deepSpikeInstances.push(instance);
      else spikeInstances.push(instance);
    }
    const spikeBatches = [
      new EffectBatch({
        app: this.app,
        parent: root,
        mesh: this.iceCrystalMesh,
        material: spikeMaterial,
        instances: spikeInstances,
        motion: MOTION_ICE_SPIKES,
        radius,
        life
      }),
      new EffectBatch({
        app: this.app,
        parent: root,
        mesh: this.iceCrystalMesh,
        material: deepMaterial,
        instances: deepSpikeInstances,
        motion: MOTION_ICE_SPIKES,
        radius,
        life
      })
    ];

    const mistInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2 + Math.random() * 0.4;
      const size = radius * (0.1 + Math.random() * 0.09);
      mistInstances.push({
        anim0: [
          angle,
          radius * (0.2 + Math.random() * 0.65),
          radius * (0.25 + Math.random() * 0.4),
          size
        ]
      });
    }
    const mistBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: mistMaterial,
      instances: mistInstances,
      motion: MOTION_ICE_MIST,
      radius,
      life
    });

    const sparkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2 + Math.random() * 0.4;
      sparkInstances.push({
        anim0: [
          angle,
          radius * (0.15 + Math.random() * 0.7),
          radius * (0.4 + Math.random() * 0.5),
          radius * (0.018 + Math.random() * 0.018)
        ]
      });
    }
    const sparkBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: sparkMaterial,
      instances: sparkInstances,
      motion: MOTION_ICE_SPARKS,
      radius,
      life
    });

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

      for (const batch of spikeBatches) batch.setTime(time);
      mistBatch.setTime(time);
      sparkBatch.setTime(time);

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
    // Copos y puffs comparten aspecto, pero necesitan shaders de animación
    // distintos; un material por lote evita que el último chunk pise al otro.
    const flakeMaterial = this.createWaterMaterial([235, 250, 255], 0.34);
    const flashMaterial = this.createMaterial([200, 240, 255], 0.55);
    const materials = [
      ringMaterial,
      floorMaterial,
      crystalMaterial,
      deepMaterial,
      snowMaterial,
      flakeMaterial,
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

    const crystalInstances: EffectBatchInstance[] = [];
    const deepCrystalInstances: EffectBatchInstance[] = [];
    const puffInstances: EffectBatchInstance[] = [];
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
      const delay = Math.random() * 0.06;
      const fall = 0.1 + Math.random() * 0.06;
      const crystal: EffectBatchInstance = {
        x: targetX,
        z: targetZ,
        rx: tiltX,
        ry: yaw,
        rz: tiltZ,
        anim0: [startY, landY, delay, fall],
        anim1: [width, height, 0, 0]
      };
      if (index % 4 === 0) deepCrystalInstances.push(crystal);
      else crystalInstances.push(crystal);

      const puffSize = radius * (0.045 + Math.random() * 0.04);
      puffInstances.push({
        x: targetX,
        y: 0.12,
        z: targetZ,
        anim0: [puffSize, delay, fall, 0]
      });
    }

    const flakeInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 24; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius * 0.95;
      const size = radius * (0.014 + Math.random() * 0.016);
      flakeInstances.push({
        x: Math.cos(angle) * distance,
        z: Math.sin(angle) * distance,
        anim0: [
          radius * (1.4 + Math.random() * 1.6),
          0.65 + Math.random() * 0.35,
          Math.random() * Math.PI * 2,
          size
        ]
      });
    }
    const crystalBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.iceCrystalMesh,
      material: crystalMaterial,
      instances: crystalInstances,
      motion: MOTION_BLIZZARD_CRYSTALS,
      radius,
      life
    });
    const deepCrystalBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.iceCrystalMesh,
      material: deepMaterial,
      instances: deepCrystalInstances,
      motion: MOTION_BLIZZARD_CRYSTALS,
      radius,
      life
    });
    const puffBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: snowMaterial,
      instances: puffInstances,
      motion: MOTION_BLIZZARD_PUFFS,
      radius,
      life
    });
    const flakeBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: flakeMaterial,
      instances: flakeInstances,
      motion: MOTION_SNOWFLAKES,
      radius,
      life
    });

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

      crystalBatch.setTime(time);
      deepCrystalBatch.setTime(time);
      puffBatch.setTime(time);
      flakeBatch.setTime(time);

      crystalMaterial.opacity = 0.86 * envelope;
      deepMaterial.opacity = 0.72 * envelope;
      snowMaterial.opacity = 0.3 * envelope;
      flakeMaterial.opacity = 0.3 * envelope;
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

    const crackInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 14; index++) {
      const angle = (index / 14) * Math.PI * 2 + Math.random() * 0.4;
      const length = radius * (0.35 + Math.random() * 0.55);
      crackInstances.push({
        anim0: [
          Math.sin(angle) * length * 0.5,
          0.035,
          Math.cos(angle) * length * 0.5,
          radius * (0.012 + Math.random() * 0.012)
        ],
        anim1: [
          length,
          angle / DEG,
          Math.random() * Math.PI * 2,
          0
        ]
      });
    }
    const crackBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.boxMesh,
      material: crackMaterial,
      instances: crackInstances,
      motion: MOTION_GROUND_CRACKS,
      radius,
      life
    });

    const rockLightInstances: EffectBatchInstance[] = [];
    const rockDarkInstances: EffectBatchInstance[] = [];
    const puffInstances: EffectBatchInstance[] = [];
    const rockCount = 28;
    for (let index = 0; index < rockCount; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * (0.12 + Math.sqrt(Math.random()) * 0.82);
      const size = radius * (0.04 + Math.random() * 0.04);
      const fall = 0.3 + Math.random() * 0.2;
      const delay = Math.random() * Math.max(0.2, life - fall - 0.25);
      const startHeight = radius * (0.9 + Math.random() * 1.1);
      const puffSize = size * (2.2 + Math.random() * 1.6);
      const instance: EffectBatchInstance = {
        anim0: [angle, distance, size, delay],
        anim1: [startHeight, fall, (Math.random() - 0.5) * 720, 0]
      };
      if (index % 3 === 0) rockDarkInstances.push(instance);
      else rockLightInstances.push(instance);
      puffInstances.push({
        anim0: [angle, distance, puffSize, delay],
        anim1: [fall, 0, 0, 0]
      });
    }
    const rockBatches = [
      new EffectBatch({
        app: this.app,
        parent: root,
        mesh: this.rockChunkMesh,
        material: lightMaterial,
        instances: rockLightInstances,
        motion: MOTION_GROUND_ROCKS,
        radius,
        life
      }),
      new EffectBatch({
        app: this.app,
        parent: root,
        mesh: this.rockChunkMesh,
        material: darkMaterial,
        instances: rockDarkInstances,
        motion: MOTION_GROUND_ROCKS,
        radius,
        life
      })
    ];
    const puffBatch = new EffectBatch({
      app: this.app,
      parent: root,
      mesh: this.sphereMesh,
      material: dustMaterial,
      instances: puffInstances,
      motion: MOTION_GROUND_PUFFS,
      radius,
      life
    });

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

      crackBatch.setTime(time);
      for (const batch of rockBatches) batch.setTime(time);
      puffBatch.setTime(time);

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
   * Área de fisura: el suelo se parte desde el centro y se hunde. Varias ramas
   * de grieta se abren hacia el borde con magma en el fondo, seguidas de
   * estalagmitas, polvo y esquirlas. Es el visual de Fisura; a diferencia de
   * Terremoto, no cae ninguna roca del cielo.
   */
  private spawnFissureAoe(
    x: number,
    z: number,
    radius: number,
    color: readonly [number, number, number],
    duration: number
  ): void {
    const life = Math.max(0.3, duration);
    const root = new pc.Entity('fissure-aoe');
    root.setPosition(x, 0.03, z);
    this.app.root.addChild(root);

    const pitMaterial = this.createWaterMaterial([34, 27, 22], 0.62);
    const pitDeepMaterial = this.createWaterMaterial([18, 14, 12], 0.55);
    const rimMaterial = this.createWaterMaterial(color, 0.45);
    const magmaMaterial = this.createMaterial([255, 166, 62], 0.8);
    const slabLight = this.createRockMaterial([116, 98, 74], 1);
    const slabDark = this.createRockMaterial([74, 61, 46], 1);
    const dustMaterial = this.createWaterMaterial([190, 170, 138], 0.32);
    const pebbleLight = this.createRockMaterial([176, 156, 122], 1);
    const pebbleDark = this.createRockMaterial([110, 92, 70], 1);
    // Cada familia de instancias necesita su propio material: el chunk de
    // animación es distinto para grietas, losas, estalagmitas y piedras.
    const branchLight = this.createRockMaterial([116, 98, 74], 1);
    const branchDark = this.createRockMaterial([74, 61, 46], 1);
    const spikeLight = this.createRockMaterial([116, 98, 74], 1);
    const spikeDark = this.createRockMaterial([74, 61, 46], 1);
    const materials = [
      pitMaterial,
      pitDeepMaterial,
      rimMaterial,
      magmaMaterial,
      slabLight,
      slabDark,
      dustMaterial,
      pebbleLight,
      pebbleDark,
      branchLight,
      branchDark,
      spikeLight,
      spikeDark
    ];

    const pit = this.createEntity(this.discMesh, [pitMaterial], root);
    pit.setLocalPosition(0, 0.005, 0);
    pit.setLocalScale(radius * 2, 1, radius * 2);

    const pitDeep = this.createEntity(this.discMesh, [pitDeepMaterial], root);
    pitDeep.setLocalPosition(0, 0.006, 0);
    pitDeep.setLocalScale(radius * 1.15, 1, radius * 1.15);

    const rim = this.createEntity(this.torusMesh, [rimMaterial], root);
    rim.setLocalPosition(0, 0.07, 0);
    rim.setLocalScale(radius * 2, 1, radius * 2);

    const branchLightInstances: EffectBatchInstance[] = [];
    const branchDarkInstances: EffectBatchInstance[] = [];
    const branchGlowInstances: EffectBatchInstance[] = [];
    let branchCount = 0;
    const addBranch = (
      angle: number,
      distance: number,
      length: number,
      width: number,
      delay: number
    ): void => {
      const tilt = (Math.random() - 0.5) * 16;
      const x = Math.sin(angle) * distance;
      const z = Math.cos(angle) * distance;
      const instance: EffectBatchInstance = {
        x,
        y: 0.05,
        z,
        sx: width,
        sy: 0.035,
        sz: length,
        ry: angle / DEG,
        anim0: [delay, tilt, 0, 0]
      };
      if (branchCount % 4 === 0) branchLightInstances.push(instance);
      else branchDarkInstances.push(instance);
      branchGlowInstances.push({
        x,
        y: 0.078,
        z,
        sx: width * 0.38,
        sy: 0.012,
        sz: length * 0.8,
        ry: angle / DEG,
        anim0: [delay, tilt, 0, 0]
      });
      branchCount++;
    };

    const mainBranches = 5;
    for (let branch = 0; branch < mainBranches; branch++) {
      const baseAngle =
        (branch / mainBranches) * Math.PI * 2 + Math.random() * 0.55;
      const segments = 3 + (branch % 2);
      for (let index = 0; index < segments; index++) {
        const t = (index + 0.5) / segments;
        const angle = baseAngle + (Math.random() - 0.5) * 0.5;
        addBranch(
          angle,
          radius * t * (0.82 + Math.random() * 0.14),
          radius * (0.24 + Math.random() * 0.16),
          radius * (0.035 + Math.random() * 0.035),
          t * 0.2 + Math.random() * 0.02
        );
      }
      // Bifurcación corta para que la grieta no parezca una estrella regular.
      if (branch % 2 === 0) {
        addBranch(
          baseAngle + 0.5 + Math.random() * 0.4,
          radius * (0.36 + Math.random() * 0.22),
          radius * (0.18 + Math.random() * 0.12),
          radius * (0.024 + Math.random() * 0.024),
          0.14 + Math.random() * 0.08
        );
      }
    }

    const slabLightInstances: EffectBatchInstance[] = [];
    const slabDarkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 7; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * (0.28 + Math.random() * 0.5);
      const width = radius * (0.12 + Math.random() * 0.08);
      const length = radius * (0.16 + Math.random() * 0.1);
      const instance: EffectBatchInstance = {
        x: Math.sin(angle) * distance,
        y: 0.05,
        z: Math.cos(angle) * distance,
        sx: width,
        sy: 0.07,
        sz: length,
        ry: angle / DEG,
        anim0: [
          0.03 + Math.random() * 0.12,
          (8 + Math.random() * 10) * (index % 2 === 0 ? 1 : -1),
          0,
          0
        ]
      };
      if (index % 2 === 0) slabLightInstances.push(instance);
      else slabDarkInstances.push(instance);
    }

    const spikeLightInstances: EffectBatchInstance[] = [];
    const spikeDarkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 8; index++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * (0.12 + Math.sqrt(Math.random()) * 0.62);
      const height = radius * (0.18 + Math.random() * 0.2);
      const width = radius * (0.045 + Math.random() * 0.035);
      const instance: EffectBatchInstance = {
        x: Math.sin(angle) * distance,
        z: Math.cos(angle) * distance,
        ry: Math.random() * 360,
        anim0: [
          height,
          width,
          0.06 + Math.random() * 0.16,
          (Math.random() - 0.5) * 22
        ]
      };
      if (index % 3 === 0) spikeDarkInstances.push(instance);
      else spikeLightInstances.push(instance);
    }

    const pebbleLightInstances: EffectBatchInstance[] = [];
    const pebbleDarkInstances: EffectBatchInstance[] = [];
    for (let index = 0; index < 18; index++) {
      const angle = Math.random() * Math.PI * 2;
      const size = radius * (0.018 + Math.random() * 0.022);
      const instance: EffectBatchInstance = {
        anim0: [
          angle,
          radius * (0.2 + Math.random() * 0.8),
          radius * (0.12 + Math.random() * 0.22),
          0.04 + Math.random() * 0.12
        ],
        anim1: [size, (Math.random() - 0.5) * 540, 0, 0]
      };
      if (index % 3 === 0) pebbleDarkInstances.push(instance);
      else pebbleLightInstances.push(instance);
    }

    const branchBatches = [
      new EffectBatch({
        app: this.app,
        parent: root,
        mesh: this.boxMesh,
        material: branchLight,
        instances: branchLightInstances,
        motion: MOTION_FISSURE_BRANCHES,
        radius,
        life
      }),
      new EffectBatch({
        app: this.app,
        parent: root,
        mesh: this.boxMesh,
        material: branchDark,
        instances: branchDarkInstances,
        motion: MOTION_FISSURE_BRANCHES,
        radius,
        life
      }),
      new EffectBatch({
        app: this.app,
        parent: root,
        mesh: this.boxMesh,
        material: magmaMaterial,
        instances: branchGlowInstances,
        motion: MOTION_FISSURE_BRANCHES,
        radius,
        life
      })
    ];
    const slabBatches = [
      new EffectBatch({
        app: this.app,
        parent: root,
        mesh: this.boxMesh,
        material: slabLight,
        instances: slabLightInstances,
        motion: MOTION_FISSURE_SLABS,
        radius,
        life
      }),
      new EffectBatch({
        app: this.app,
        parent: root,
        mesh: this.boxMesh,
        material: slabDark,
        instances: slabDarkInstances,
        motion: MOTION_FISSURE_SLABS,
        radius,
        life
      })
    ];
    const spikeBatches = [
      new EffectBatch({
        app: this.app,
        parent: root,
        mesh: this.rockSpikeMesh,
        material: spikeLight,
        instances: spikeLightInstances,
        motion: MOTION_FISSURE_SPIKES,
        radius,
        life
      }),
      new EffectBatch({
        app: this.app,
        parent: root,
        mesh: this.rockSpikeMesh,
        material: spikeDark,
        instances: spikeDarkInstances,
        motion: MOTION_FISSURE_SPIKES,
        radius,
        life
      })
    ];
    const pebbleBatches = [
      new EffectBatch({
        app: this.app,
        parent: root,
        mesh: this.rockChunkMesh,
        material: pebbleLight,
        instances: pebbleLightInstances,
        motion: MOTION_FISSURE_PEBBLES,
        radius,
        life
      }),
      new EffectBatch({
        app: this.app,
        parent: root,
        mesh: this.rockChunkMesh,
        material: pebbleDark,
        instances: pebbleDarkInstances,
        motion: MOTION_FISSURE_PEBBLES,
        radius,
        life
      })
    ];

    this.spawnSporeParticles(
      root,
      {
        y: 0.1,
        extents: [radius * 0.7, 0.08, radius * 0.7],
        velocity: [0, 0.35, 0],
        velocityEnd: [0, 1.5, 0],
        radialSpeed: 1.1,
        radialSpeedEnd: 2.8,
        sizeStart: radius * 0.08,
        sizeMid: radius * 0.16,
        sizeEnd: radius * 0.035,
        lifetime: 0.55,
        rate: 0.011,
        numParticles: 120,
        blendType: pc.BLEND_NORMAL,
        preWarm: false
      },
      [190, 170, 138],
      this.dustTexture
    );

    const light = this.createFireLight(root, 0, 0.7, 0, 1.1, radius * 2.1);

    let time = 0;
    const animate = (_t: number, dt: number): void => {
      time += dt;
      const fadeIn = Math.min(1, time / 0.06);
      const fadeOut = Math.min(1, Math.max(0, (life - time) / 0.2));
      const envelope = Math.min(fadeIn, fadeOut);
      const pulse = 0.5 + Math.sin(time * 28) * 0.22;

      pitMaterial.opacity = 0.58 * envelope;
      pitDeepMaterial.opacity = 0.5 * envelope;
      const pitScale = radius * 2 * (0.9 + Math.min(1, time / 0.14) * 0.1);
      pit.setLocalScale(pitScale, 1, pitScale);
      const deepScale = radius * 1.15 * (0.86 + Math.min(1, time / 0.16) * 0.14);
      pitDeep.setLocalScale(deepScale, 1, deepScale);

      rimMaterial.opacity = (0.22 + pulse * 0.18) * envelope;
      rim.setLocalEulerAngles(0, time * 10, 0);
      magmaMaterial.opacity = (0.5 + pulse * 0.3) * envelope;
      light.light!.intensity = 1.1 * envelope * (0.65 + Math.random() * 0.35);

      for (const batch of branchBatches) batch.setTime(time);
      for (const batch of slabBatches) batch.setTime(time);
      for (const batch of spikeBatches) batch.setTime(time);
      for (const batch of pebbleBatches) batch.setTime(time);

      slabLight.opacity = 0.92 * envelope;
      slabDark.opacity = 0.82 * envelope;
      dustMaterial.opacity = 0.3 * envelope;
      pebbleLight.opacity = 0.9 * envelope;
      pebbleDark.opacity = 0.78 * envelope;
      branchLight.opacity = 0.92 * envelope;
      branchDark.opacity = 0.82 * envelope;
      spikeLight.opacity = 0.92 * envelope;
      spikeDark.opacity = 0.82 * envelope;
    };
    this.addEffect(root, materials, life, animate, areaAnchors(x, z, radius));
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
    // Recalcular la niebla cuesta una prueba de línea de visión por cada
    // Pokémon vivo del equipo; con 0,1 s de margen basta para que los efectos
    // entren y salgan de la niebla sin repetir el cálculo en cada frame.
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
    for (const mesh of this.meshCache.values()) mesh.destroy();
    this.meshCache.clear();
    this.dustTexture.destroy();
  }
}
