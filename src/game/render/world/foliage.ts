/**
 * Follaje instanciado con viento compartido por las secciones del mundo:
 * hierba, flores, frailejones y matas de la ciénaga.
 */

import * as pc from 'playcanvas';
import {
  randomPointInZone,
  zoneArea,
  zoneBounds,
  type TerrainZone
} from '../../terrain';
import { applyWindShader } from '../../windShader';
import type { WorldBuildContext } from './context';
import { random } from './random';
import { standard } from './worldParts';

export interface InstancedFoliageOptions {
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

export const GRASS_PALETTE: Array<[number, number, number]> = [
  [0.08, 0.2, 0.07],
  [0.14, 0.33, 0.11],
  [0.31, 0.55, 0.2]
];

export const DRY_GRASS_PALETTE: Array<[number, number, number]> = [
  [0.24, 0.19, 0.09],
  [0.45, 0.37, 0.17],
  [0.72, 0.62, 0.38]
];

export const DARK_GRASS_PALETTE: Array<[number, number, number]> = [
  [0.07, 0.09, 0.05],
  [0.13, 0.19, 0.09],
  [0.27, 0.36, 0.17]
];

/**
 * Material de follaje instanciado con viento. `instance_wind` (atributo de
 * instancia) guarda la fase y la fuerza; el chunk `transformCoreVS` inclina
 * cada vértice alrededor de la base de la mata.
 */
export function createWindMaterial(
  ctx: WorldBuildContext,
  specular: string,
  gloss: number,
  speed: number,
  amplitudeDegrees: number
): pc.StandardMaterial {
  const material = standard({
    diffuse: '#ffffff',
    specular,
    gloss,
    cull: pc.CULLFACE_NONE
  });
  material.diffuseVertexColor = true;
  applyWindShader(material);
  material.setParameter('uWindTime', 0);
  material.setParameter('uWindSpeed', speed);
  material.setParameter('uWindAmplitude', (amplitudeDegrees * Math.PI) / 180);
  material.update();
  ctx.materials.push(material);
  ctx.windMaterials.push(material);
  return material;
}

export function buildGrassCluster(
  device: pc.GraphicsDevice,
  seed: number,
  bladeCount: number,
  palette: Array<[number, number, number]> = GRASS_PALETTE,
  heightScale = 1
): pc.Mesh {
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
}

/**
 * Convierte las matas de una lista de regiones en lotes instanciados: un
 * draw call por región y variante de malla. La posición, el giro y la escala
 * van en la matriz de instancia; la fase y la fuerza del viento, en
 * `instance_wind`.
 */
export function* buildInstancedFoliage(
  ctx: WorldBuildContext,
  options: InstancedFoliageOptions
): Generator<number, void, void> {
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
  const instanceFormat = ctx.foliageInstanceFormat!;

  for (let zoneIndex = 0; zoneIndex < zones.length; zoneIndex++) {
    const zone = zones[zoneIndex];
    const rand = random(seed + zoneIndex * 7919);
    const count = Math.round(zoneArea(zone) * density);
    if (count <= 0) continue;

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
      // Cada mata puede costar bastante si la región es un polígono grande
      // (`randomPointInZone` recorre sus vértices): se cede cada 64 para que
      // una tanda no se convierta en tarea larga.
      if ((i & 63) === 63) yield 1;
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
        ctx.device,
        instanceFormat,
        data.length / 20,
        { data, usage: pc.BUFFER_STATIC }
      );
      const instance = new pc.MeshInstance(meshes[variant], material);
      instance.castShadows = false;
      instance.receiveShadows = false;
      instance.setInstancing(vertexBuffer, true);
      ctx.instancedFoliageBuffers.push(vertexBuffer);

      const batch = new pc.Entity(`${label}-${zoneIndex}-${variant}`);
      batch.addComponent('render');
      batch.render!.castShadows = false;
      batch.render!.receiveShadows = false;
      batch.render!.meshInstances = [instance];
      // El componente aplica su propio AABB al asignar las instancias, así
      // que se fija después para conservar la caja de toda la región.
      batch.render!.customAabb = aabb;
      ctx.worldRoot.addChild(batch);
      ctx.created.push(batch);
    }
  }
}
