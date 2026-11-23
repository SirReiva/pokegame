/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import {
  randomPointInZone,
  zoneArea,
  zoneBounds,
  zoneCenter
} from '../../../terrain';
import type { WorldBuildContext } from '../context';
import { random } from '../random';
import { MAX_ICE_CLUSTERS_PER_ZONE } from '../tuning';
import { standard, zoneEmitterExtents } from '../worldParts';

export function* buildIce(ctx: WorldBuildContext): Generator<number, void, void> {
  const {
    device,
    terrainZones,
    worldRoot,
    created,
    materials,
    instancedFoliageBuffers,
    particles
  } = ctx;
  yield 1;
  // --- Escarcha: cristales de hielo 3D --------------------------------------
  // El calvero helado se llena de racimos de esquirlas: prismas facetados que
  // nacen del suelo, se estrechan y se inclinan hacia fuera. El color va por
  // vértice, de azul profundo en la base a blanco casi puro en la punta, así
  // que cada cristal tiene volumen y brillo desde cualquier ángulo.
  const iceMaterial = standard({
    name: 'ice',
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

  const iceZones = terrainZones.filter((zone) => zone.terrain === 'ice');
  const iceInstanceFormat = pc.VertexFormat.getDefaultInstancingFormat(device);
  for (let zoneIndex = 0; zoneIndex < iceZones.length; zoneIndex++) {
    const zone = iceZones[zoneIndex];
    const rand = random(0x71f3 + zoneIndex * 6701);
    const count = Math.min(
      MAX_ICE_CLUSTERS_PER_ZONE,
      Math.round(zoneArea(zone) * 1.5)
    );
    if (count <= 0) continue;

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
      if ((i & 63) === 63) yield 1;
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
      instance.castShadows = false;
      instance.receiveShadows = false;
      instance.setInstancing(buffer, true);
      instancedFoliageBuffers.push(buffer);

      const entity = new pc.Entity(`ice-crystal-${zoneIndex}-${variant}`);
      entity.addComponent('render');
      entity.render!.castShadows = false;
      entity.render!.receiveShadows = false;
      entity.render!.meshInstances = [instance];
      entity.render!.customAabb = aabb;
      worldRoot.addChild(entity);
      created.push(entity);
    }
  }

  // Nieve fina sobre la escarcha: copos pequeños que caen despacio y derivan
  // con el viento. La caja de emisión es alta, así que hay copos a distintas
  // alturas y el efecto se lee desde la cámara a 45º sin tapar el suelo.
  iceZones.forEach((zone, zoneIndex) => {
    const [snowX, snowZ] = zoneCenter(zone);
    particles.emit(
      'snow',
      [snowX, 1.5, snowZ],
      zoneEmitterExtents(zone, 1.9, 1.6),
      70,
      0x5e21 + zoneIndex * 977
    );
  });
  ctx.iceClusterMeshes = iceClusterMeshes;
}
