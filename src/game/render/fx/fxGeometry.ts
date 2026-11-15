import * as pc from 'playcanvas';
import type { AoeFxHandle, TelegraphOwner } from '../../core/ports/fx';
import type { ImpactStyle } from '../../abilities';

export const TELEGRAPH_WALL_HEIGHT = 0.75;

/** Opacidad de la pared: suficiente para leerla sin bloquear la vista. */
export const TELEGRAPH_WALL_OPACITY = 0.42;

/**
 * Tope de recursos ociosos por pool. Sin límite, un pico de efectos (8 vistas,
 * varias habilidades a la vez) dejaría vivos para siempre cientos de materiales
 * y emisores. Al superar el tope se destruye el recurso sobrante.
 */
export const MATERIAL_POOL_LIMIT = 48;
export const PARTICLE_POOL_LIMIT = 8;

/** Opacidad base del arco melee según el estilo de impacto. */
export const MELEE_ARC_OPACITY: Partial<Record<ImpactStyle, number>> = {
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

/**
 * Fábrica de un estilo de área que necesita un efecto propio para el cono.
 * Los estilos que no registren una usan el disco inscrito genérico.
 */
export type AoeConeFactory = (
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  length: number,
  halfAngleDeg: number,
  color: readonly [number, number, number],
  duration: number
) => AoeFxHandle;

/** Puntos que anclan un efecto para decidir en qué vistas se dibuja. */
export type FxAnchors = ReadonlyArray<readonly [number, number]>;

/**
 * Anclas de un área: el centro y cuatro puntos del borde. Así el círculo se ve
 * en una vista que solo alcanza su borde, no únicamente si ve el centro.
 */
export function areaAnchors(x: number, z: number, radius: number): FxAnchors {
  return [
    [x, z],
    [x + radius, z],
    [x - radius, z],
    [x, z + radius],
    [x, z - radius]
  ];
}

/**
 * Anclas de un cono: vértice, punta, punto medio y las dos esquinas del arco.
 * La visibilidad se decide con estos puntos para que una vista que solo alcanza
 * el extremo del cono también lo dibuje.
 */
export function coneAnchors(
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  length: number,
  halfAngle: number
): FxAnchors {
  const yaw = Math.atan2(dirX, dirZ);
  const points: Array<readonly [number, number]> = [
    [x, z],
    [x + dirX * length, z + dirZ * length],
    [x + dirX * length * 0.5, z + dirZ * length * 0.5]
  ];
  for (const side of [-1, 1]) {
    const angle = yaw + side * halfAngle;
    points.push([
      x + Math.sin(angle) * length,
      z + Math.cos(angle) * length
    ]);
  }
  return points;
}

export function sameLayers(current: readonly number[], next: readonly number[]): boolean {
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
export function tintColor(
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

export interface ActiveEffect {
  entity: pc.Entity;
  materials: pc.StandardMaterial[];
  duration: number;
  elapsed: number;
  anchors: FxAnchors;
  update: (t: number, dt: number) => void;
}

export interface ProjectileVisual {
  entity: pc.Entity;
  materials: pc.StandardMaterial[];
  update: (dt: number) => void;
}

export interface GroundTelegraph {
  entity: pc.Entity;
  materials: pc.StandardMaterial[];
  elapsed: number;
  duration: number;
  active: boolean;
  anchors: FxAnchors;
  /** Lanzador de la marca; se usa para ocultarla a sus aliados. */
  owner?: TelegraphOwner;
  update: (progress: number, elapsed: number) => void;
}

/** Configuración de un emisor de partículas de fuego. */
export interface FlameParticleOptions {
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
  /** @deprecated Los emisores actuales trabajan en el espacio del efecto. */
  localSpace?: boolean;
  /**
   * Emite en espacio de mundo y deja las partículas atrás. Lo usan las estelas
   * de proyectiles que se desplazan.
   */
  worldSpaceTrail?: boolean;
  /** Si es `false`, el emisor empieza vacío y se llena durante el efecto. */
  preWarm?: boolean;
  /** Mezcla de partículas; por defecto, aditiva. */
  blendType?: number;
}

export function createArcMesh(
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
 * Cuerpo continuo de un chorro de fuego: cono abierto con el vértice en el
 * origen y el eje en +Z. La base está en `z = 1`; el llamador escala X/Y con
 * `longitud * tan(semiángulo)` y Z con la longitud. El UV recorre la longitud
 * en V, de modo que la textura de llama puede desplazarse hacia la base.
 */
export function createFlameConeMesh(
  device: pc.GraphicsDevice,
  startRadius: number,
  endRadius: number,
  radialSegments: number,
  lengthSegments: number
): pc.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= lengthSegments; i++) {
    const t = i / lengthSegments;
    const radius = startRadius + (endRadius - startRadius) * t;
    for (let j = 0; j <= radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      positions.push(cos * radius, sin * radius, t);
      normals.push(cos, sin, 0);
      // V invertida: la punta de la llama de la textura queda hacia la base del
      // cono, de modo que el fuego parece avanzar hacia delante.
      uvs.push(j / radialSegments, 1 - t);
    }
  }

  for (let i = 0; i < lengthSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const base = i * (radialSegments + 1) + j;
      const next = base + radialSegments + 1;
      indices.push(base, next, base + 1, base + 1, next, next + 1);
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
 * Banda curva en el plano XZ entre dos radios. Se usa para las ondas psíquicas
 * que avanzan por el cono como un frente de sonido.
 */
export function createArcBandMesh(
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
 * Pared vertical continua a partir de una polilínea en el plano XZ. La base
 * queda en `y = 0` y la malla se extiende hasta `y = 1`; el llamador escala la
 * altura con el eje Y. Se usa en los telegraphs de área y de haz para que el
 * aviso tenga volumen y se lea desde cualquier ángulo de cámara.
 */
export function createWallMesh(
  device: pc.GraphicsDevice,
  points: ReadonlyArray<readonly [number, number]>,
  closed: boolean
): pc.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = closed ? points.length : points.length - 1;

  for (let i = 0; i < segments; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[(i + 1) % points.length];
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (length < 0.0001) continue;

    // Normal horizontal del paño. La cara se dibuja por ambos lados
    // (`CULLFACE_NONE`), así que su signo no afecta al render.
    const nx = dz / length;
    const nz = -dx / length;
    const base = positions.length / 3;
    positions.push(ax, 0, az, bx, 0, bz, bx, 1, bz, ax, 1, az);
    for (let vertex = 0; vertex < 4; vertex++) normals.push(nx, 0, nz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
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
 * Estrella plana de cuatro puntas en el plano XY. Se usa como shuriken: gira
 * sobre el eje Z, que es la dirección de vuelo del proyectil.
 */
export function createShurikenMesh(
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
export function createSlashStreakMesh(
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
export function createWindBladeMesh(
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
export function createIceCrystalMesh(device: pc.GraphicsDevice): pc.Mesh {
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
export function createLightningMesh(
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
export function createCrossQuadMesh(device: pc.GraphicsDevice): pc.Mesh {
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
export function createWaterJetMesh(device: pc.GraphicsDevice, seed: number): pc.Mesh {
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
export function createCycloneArmMesh(device: pc.GraphicsDevice, seed: number): pc.Mesh {
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
export function createDiscMesh(device: pc.GraphicsDevice, segments = 48): pc.Mesh {
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
 * Semiesfera unitaria abierta por la base para la cúpula de `Pulso Primigenio`.
 * El vértice superior queda en y=1 y el borde en y=0, con radio 1. El color por
 * vértice dibuja un borde blanco-cyan, un centro azul profundo y una corona
 * clara, de modo que la cáscara translúcida conserve volumen desde cualquier
 * cámara sin necesitar texturas ni escrituras de material por frame.
 */
export function createPressureDomeMesh(
  device: pc.GraphicsDevice,
  longitudeSegments = 48,
  latitudeSegments = 18
): pc.Mesh {
  type Vec3 = [number, number, number];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const rim: Vec3 = [214, 250, 255];
  const mid: Vec3 = [44, 142, 212];
  const crown: Vec3 = [234, 253, 255];

  const smooth = (edge0: number, edge1: number, value: number): number => {
    const t = Math.max(
      0,
      Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0))
    );
    return t * t * (3 - 2 * t);
  };
  const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
  const sampleColor = (y: number): Vec3 =>
    y < 0.45
      ? mix(rim, mid, smooth(0, 0.45, y))
      : mix(mid, crown, smooth(0.45, 1, y));

  for (let lat = 0; lat <= latitudeSegments; lat++) {
    const phi = (lat / latitudeSegments) * (Math.PI / 2);
    const y = Math.cos(phi);
    const radius = Math.sin(phi);
    for (let lon = 0; lon <= longitudeSegments; lon++) {
      const theta = (lon / longitudeSegments) * Math.PI * 2;
      const x = Math.sin(theta) * radius;
      const z = Math.cos(theta) * radius;
      positions.push(x, y, z);
      // En una semiesfera centrada en el origen la normal es la posición.
      normals.push(x, y, z);
      uvs.push(lon / longitudeSegments, lat / latitudeSegments);
      const [r, g, b] = sampleColor(y);
      colors.push(r, g, b, 255);
    }
  }

  const stride = longitudeSegments + 1;
  for (let lat = 0; lat < latitudeSegments; lat++) {
    for (let lon = 0; lon < longitudeSegments; lon++) {
      const a = lat * stride + lon;
      const b = a + stride;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setColors(colors, 4);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/**
 * Anillo discontinuo unitario (radio exterior 0,5) para la marca de área.
 * Los huecos entre segmentos lo distinguen de un simple círculo de efecto.
 */
export function createDashRingMesh(
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
