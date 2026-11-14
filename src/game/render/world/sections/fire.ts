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
import { hex, standard, zoneEmitterExtents } from '../worldParts';

export function* buildFire(ctx: WorldBuildContext): Generator<number, void, void> {
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
  // --- Colada volcánica: basalto 3D y brasas --------------------------------
  // Placas rotas de basalto que sobresalen del suelo y chispas de lava que
  // suben desde las grietas. Las rocas son bajas y no colisionan: se leen como
  // costra levantada, no como obstáculos.
  const fireZones = terrainZones.filter((zone) => zone.terrain === 'fire');

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
      instance.castShadows = true;
      instance.receiveShadows = true;
      instance.setInstancing(buffer, true);
      instancedFoliageBuffers.push(buffer);

      const entity = new pc.Entity(`basalt-${zoneIndex}-${variant}`);
      entity.addComponent('render');
      entity.render!.castShadows = true;
      entity.render!.receiveShadows = true;
      entity.render!.meshInstances = [instance];
      entity.render!.customAabb = aabb;
      worldRoot.addChild(entity);
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
    particles.emit(
      'embers',
      [fireX, 0.22, fireZ],
      zoneEmitterExtents(zone, 1.55, 0.35),
      44,
      0x71a3 + zoneIndex * 6131
    );

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
    worldRoot.addChild(glow);
    created.push(glow);
    emberLights.push({ entity: glow, phase: zoneIndex * 2.1 + fireX * 0.3 });
  });

  // Columnas de humo: una por cada racimo de basalto. La emisión es estrecha y
  // con impulsión vertical, así que el humo sale de la roca y sube en columna
  // en vez de quedarse como una bruma repartida por toda la zona.
  basaltVents.forEach((vents, zoneIndex) => {
    vents.forEach(([x, z], i) => {
      particles.emit(
        'fireSmoke',
        [x, 0.16, z],
        new pc.Vec3(0.24, 0.12, 0.24),
        24,
        0x2b17 + zoneIndex * 3313 + i * 97
      );
    });
  });
  ctx.basaltMeshes = basaltMeshes;
  ctx.emberLights = emberLights;
}
