/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import {
  randomPointInZone,
  zoneArea,
  zoneCenter
} from '../../../terrain';
import type { WorldBuildContext } from '../context';
import { random } from '../random';
import { SPAWN_TREES } from '../tuning';
import {
  hex,
  particleCountForArea,
  standard,
  zoneEmitterExtents
} from '../worldParts';

export function* buildGhost(ctx: WorldBuildContext): Generator<number, void, void> {
  const {
    device,
    terrainZones,
    worldRoot,
    created,
    materials,
    particles,
    colliders
  } = ctx;
  yield 1;
  // --- Bosque umbrío: árboles secos, fuegos fatuos y niebla ------------------
  // El calvero fantasmal no se queda en el suelo pintado: levanta cinco árboles
  // retorcidos sin hojas, enciende luces flotantes y arrastra una niebla baja.
  // La madera va con color por vértice, del casi negro de la base al gris
  // violeta de las puntas, así que tiene volumen desde la cámara a 45º.
  const ghostZones = terrainZones.filter((zone) => zone.terrain === 'ghost');
  // La densidad llena (130 bocanadas y 18 fuegos) está pensada para un claro
  // mediano. En zonas de un solo tile se amontonarían, así que la cantidad
  // escala con el área por debajo de GHOST_FULL_PARTICLE_AREA.
  const GHOST_FULL_PARTICLE_AREA = 60;
  const GHOST_MIST_MAX_PARTICLES = 130;
  const GHOST_MIST_MIN_PARTICLES = 4;
  const GHOST_WISP_MAX_PARTICLES = 18;
  const GHOST_WISP_MIN_PARTICLES = 1;

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
      instance.castShadows = true;
      instance.receiveShadows = true;
      tree.render!.meshInstances = [instance];
      tree.setLocalScale(scale, scale, scale);
      worldRoot.addChild(tree);
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
    const area = zoneArea(zone);
    const wispCount = particleCountForArea(
      area,
      GHOST_FULL_PARTICLE_AREA,
      GHOST_WISP_MAX_PARTICLES,
      GHOST_WISP_MIN_PARTICLES
    );
    const mistCount = particleCountForArea(
      area,
      GHOST_FULL_PARTICLE_AREA,
      GHOST_MIST_MAX_PARTICLES,
      GHOST_MIST_MIN_PARTICLES
    );
    const [ghostX, ghostZ] = zoneCenter(zone);
    // Fuegos fatuos: orbes aditivos que flotan entre 0,4 y 1,3 m, derivan muy
    // despacio y parpadean. El violeta lo pone la curva de color sobre una
    // textura neutra.
    particles.emit(
      'wisps',
      [ghostX, 0.85, ghostZ],
      zoneEmitterExtents(zone, 1.5, 0.9),
      wispCount,
      0x1d47 + zoneIndex * 4409
    );

    // Niebla rastrera: caja ancha y baja, casi sin impulso vertical, para que
    // se arrastre entre los troncos en vez de subir como el humo de la ciénaga.
    // La densidad la marca el número de motas: con hasta 130 bocanadas y una
    // vida larga el calvero queda cubierto por una capa continua.
    particles.emit(
      'mist',
      [ghostX, 0.45, ghostZ],
      zoneEmitterExtents(zone, 1.9, 0.6),
      mistCount,
      0x7c31 + zoneIndex * 8117
    );

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
    worldRoot.addChild(glow);
    created.push(glow);
    ghostLights.push({ entity: glow, phase: zoneIndex * 1.9 + ghostZ * 0.27 });
  });
  ctx.ghostTreeMeshes = ghostTreeMeshes;
  ctx.ghostTrees = ghostTrees;
  ctx.ghostLights = ghostLights;
}
