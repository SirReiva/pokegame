/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import { randomPointInZone, volcanoColliders, zoneArea } from '../../../terrain';
import type { WorldBuildContext } from '../context';
import { random } from '../random';
import { MOUNTAIN_HEIGHT_SCALE, WALL_HEIGHT } from '../tuning';
import { hex, standard } from '../worldParts';

export function* buildBarriers(ctx: WorldBuildContext): Generator<number, void, void> {
  const {
    device,
    mountains,
    terrainZones,
    HALF_X,
    HALF_Z,
    colliders,
    created,
    materials,
    worldRoot,
    barrierMeshInstances,
    instancedFoliageBuffers,
    particles
  } = ctx;
  const {
    mountainRock: mountainRockTexture,
    wallStone: wallStoneTexture,
    volcanoRock: volcanoRockTexture,
    volcanoGlow: volcanoGlowTexture
  } = ctx.detailTextures;
  yield 1;
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

  yield 1;
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

  yield 1;
  // --- Volcanes -------------------------------------------------------------
  // Cono truncado de huella cuadrada. La base mide exactamente el ancho del
  // separador y la altura crece con él, así que el volcán nunca se estira como
  // una cordillera. La roca y las vetas salen del tile de basalto; el mapa de
  // emisión solo enciende las vetas y el cráter.
  const volcanoMaterial = standard({
    diffuse: '#ffffff',
    diffuseMap: volcanoRockTexture,
    tiling: [2, 1],
    specular: '#1d0f0a',
    gloss: 0.1,
    cull: pc.CULLFACE_NONE
  });
  volcanoMaterial.diffuseVertexColor = true;
  volcanoMaterial.emissive = new pc.Color(1, 1, 1);
  volcanoMaterial.emissiveMap = volcanoGlowTexture;
  volcanoMaterial.emissiveMapTiling = new pc.Vec2(2, 1);
  volcanoMaterial.emissiveIntensity = 1.15;
  volcanoMaterial.update();
  materials.push(volcanoMaterial);

  const VOLCANO_DARK: [number, number, number] = [0.5, 0.48, 0.48];
  const VOLCANO_LIGHT: [number, number, number] = [1, 0.86, 0.76];

  const buildVolcano = (seed: number): pc.Mesh => {
    const rand = random(seed);
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const sides = 12 + Math.floor(rand() * 5);
    const bands = 4;
    const topRadius = 0.17 + rand() * 0.05;
    const baseRadius = 0.5;
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

    const shade = (t: number): [number, number, number] => {
      const jitter = (rand() - 0.5) * 0.08;
      const s = Math.min(1, Math.max(0, t + jitter));
      return [
        VOLCANO_DARK[0] + (VOLCANO_LIGHT[0] - VOLCANO_DARK[0]) * s,
        VOLCANO_DARK[1] + (VOLCANO_LIGHT[1] - VOLCANO_DARK[1]) * s,
        VOLCANO_DARK[2] + (VOLCANO_LIGHT[2] - VOLCANO_DARK[2]) * s
      ];
    };

    // Anillos del cono: la base es ancha y el radio se cierra hacia la punta
    // truncada. Las ondulaciones son pequeñas para que la silueta siga siendo
    // un cono, no una sierra.
    const rings: Array<Array<[number, number, number]>> = [];
    for (let band = 0; band <= bands; band++) {
      const t = band / bands;
      const radius = topRadius + (baseRadius - topRadius) * Math.pow(1 - t, 0.8);
      const ring: Array<[number, number, number]> = [];
      for (let s = 0; s < sides; s++) {
        const angle = phase + (s / sides) * Math.PI * 2;
        const wobble = band === 0 ? 0.92 + rand() * 0.08 : 0.9 + rand() * 0.14;
        ring.push([
          Math.cos(angle) * radius * wobble,
          t,
          Math.sin(angle) * radius * wobble
        ]);
      }
      rings.push(ring);
    }

    for (let band = 0; band < bands; band++) {
      for (let s = 0; s < sides; s++) {
        const next = (s + 1) % sides;
        const a = rings[band][s];
        const b = rings[band][next];
        const c = rings[band + 1][next];
        const d = rings[band + 1][s];

        const ux = b[0] - a[0];
        const uy = b[1] - a[1];
        const uz = b[2] - a[2];
        const vx = d[0] - a[0];
        const vy = d[1] - a[1];
        const vz = d[2] - a[2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const cx = (a[0] + b[0] + c[0] + d[0]) / 4;
        const cz = (a[2] + b[2] + c[2] + d[2]) / 4;
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
        const u1 = (s + 1) / sides;
        const v0 = (band / bands) * 0.999;
        const v1 = ((band + 1) / bands) * 0.999;
        push(a[0], a[1], a[2], nx, ny, nz, shade(band / bands), u0, v0);
        push(b[0], b[1], b[2], nx, ny, nz, shade(band / bands), u1, v0);
        push(c[0], c[1], c[2], nx, ny, nz, shade((band + 1) / bands), u1, v1);
        push(d[0], d[1], d[2], nx, ny, nz, shade((band + 1) / bands), u0, v1);
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      }
    }

    // Punta truncada: un anillo interior ligeramente hundido y una tapa plana.
    // Todas las UVs de esta zona apuntan a la banda de lava del tile, de modo
    // que el cráter se lee incandescente desde la cámara.
    const topRing = rings[bands];
    const innerRadius = topRadius * (0.52 + rand() * 0.1);
    const innerRing: Array<[number, number, number]> = [];
    for (let s = 0; s < sides; s++) {
      const angle = phase + (s / sides) * Math.PI * 2;
      innerRing.push([
        Math.cos(angle) * innerRadius,
        0.962 + rand() * 0.012,
        Math.sin(angle) * innerRadius
      ]);
    }
    const craterColor: [number, number, number] = [1, 0.78, 0.5];
    for (let s = 0; s < sides; s++) {
      const next = (s + 1) % sides;
      const a = topRing[s];
      const b = topRing[next];
      const c = innerRing[next];
      const d = innerRing[s];
      const start = positions.length / 3;
      const u0 = s / sides;
      const u1 = (s + 1) / sides;
      push(a[0], a[1], a[2], 0, 1, 0, craterColor, u0, 0.992);
      push(b[0], b[1], b[2], 0, 1, 0, craterColor, u1, 0.992);
      push(c[0], c[1], c[2], 0, 1, 0, craterColor, u1, 0.998);
      push(d[0], d[1], d[2], 0, 1, 0, craterColor, u0, 0.998);
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    const center: [number, number, number] = [0, 0.945, 0];
    for (let s = 0; s < sides; s++) {
      const next = (s + 1) % sides;
      const a = innerRing[s];
      const b = innerRing[next];
      const start = positions.length / 3;
      push(center[0], center[1], center[2], 0, 1, 0, craterColor, 0.5, 0.996);
      push(a[0], a[1], a[2], 0, 1, 0, craterColor, s / sides, 0.998);
      push(b[0], b[1], b[2], 0, 1, 0, craterColor, (s + 1) / sides, 0.998);
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

  const volcanoMeshes = [0, 1, 2, 3].map((variant) =>
    buildVolcano(0x9f3d + variant * 5231)
  );

  const volcanoLights: Array<{ entity: pc.Entity; phase: number }> = [];

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

  mountains.forEach((range, rangeIndex) => {
    const rand = random(0x7d31 + rangeIndex * 7919);

    if (range.kind === 'volcano') {
      const center = range.points[0];
      if (!center) return;
      const [x, z] = center;
      const width = Math.max(0.2, range.width);
      const height = width * (0.82 + rand() * 0.14);

      // Un solo cono por volcán: nunca se estira con el trazado. La huella es
      // el cuadrado de lado `width`, y la base circular del cono queda inscrita
      // en él.
      const volcano = new pc.Entity(`volcano-${rangeIndex}`);
      volcano.setLocalPosition(x, 0.02, z);
      volcano.setLocalEulerAngles(0, rand() * 360, 0);
      volcano.setLocalScale(width, height, width);
      volcano.addComponent('render');
      volcano.render!.castShadows = true;
      volcano.render!.receiveShadows = true;
      const mesh = volcanoMeshes[rangeIndex % volcanoMeshes.length];
      const instance = new pc.MeshInstance(mesh, volcanoMaterial);
      instance.castShadows = true;
      instance.receiveShadows = true;
      volcano.render!.meshInstances = [instance];
      barrierMeshInstances.push(instance);
      worldRoot.addChild(volcano);
      created.push(volcano);

      // Visión y colisión como una cordillera: el círculo de la base tapa la
      // línea de visión en todo el volumen del cono y la niebla proyecta su
      // cuña detrás. El radio de visión es el de la base, no el de una cresta:
      // si fuera mayor, un jugador pegado quedaría dentro del oclusor y vería
      // a través (ver `volcanoColliders`).
      colliders.push(...volcanoColliders(range));

      // Erupción: chispas que brotan del cráter y una columna corta de humo.
      // El foco luminoso tiñe la falda y parpadea en el bucle de `world.ts`.
      const seed = 0x4c11 + rangeIndex * 6197;
      particles.emit(
        'embers',
        [x, height * 0.95, z],
        new pc.Vec3(width * 0.3, width * 0.55, width * 0.3),
        Math.max(14, Math.round(width * 16)),
        seed
      );
      particles.emit(
        'fireSmoke',
        [x, height * 0.98, z],
        new pc.Vec3(width * 0.28, width * 0.35, width * 0.28),
        Math.max(5, Math.round(width * 4)),
        seed + 1
      );

      const glow = new pc.Entity(`volcano-glow-${rangeIndex}`);
      glow.addComponent('light', {
        type: 'omni',
        color: hex('#ff5a1a'),
        intensity: 0.9,
        range: width * 2.4,
        castShadows: false
      });
      glow.setPosition(x, height * 0.9, z);
      worldRoot.addChild(glow);
      created.push(glow);
      volcanoLights.push({ entity: glow, phase: rangeIndex * 2.3 + x * 0.2 });
      return;
    }

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

        // Los muros se dejan como piezas sueltas: son pocos por cordillera y el
        // descarte por cámara de cada tramo ya evita dibujar los que quedan
        // fuera. Un lote instanciado por malla obligaría a dibujar la variante
        // entera en cuanto un solo tramo asoma, que en `perf-256` sale peor.
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
        instance.castShadows = true;
        instance.receiveShadows = true;
        wall.render!.meshInstances = [instance];
        barrierMeshInstances.push(instance);
        worldRoot.addChild(wall);
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
      instance.castShadows = true;
      instance.receiveShadows = true;
      peak.render!.meshInstances = [instance];
      barrierMeshInstances.push(instance);
      worldRoot.addChild(peak);
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
  // 90 partículas llenan bien un claro de DESERT_LARGE_AREA; por debajo la
  // cantidad se reduce con el área y nunca baja del mínimo.
  const desertZones = terrainZones.filter((zone) => zone.terrain === 'desert');

  // Todos los cactus del mapa se acumulan en una única malla instanciada: un
  // draw call por vista en lugar de cinco por cactus. Antes los calveros
  // pequeños creaban un cactus con cinco primitivas y en `caldera` eso eran
  // 240 draw calls (más de la mitad del mundo) para unos pocos arbustos.
  const cactusTransforms: number[] = [];
  const addCactus = (x: number, z: number, scale: number, yaw: number): void => {
    const yawRadians = (yaw * Math.PI) / 180;
    const cos = Math.cos(yawRadians) * scale;
    const sin = Math.sin(yawRadians) * scale;
    // Matriz de mundo en columnas: giro en Y, escala uniforme y traslación.
    cactusTransforms.push(
      cos, 0, -sin, 0,
      0, scale, 0, 0,
      sin, 0, cos, 0,
      x, 0, z, 1
    );
  };

  desertZones.forEach((zone, zoneIndex) => {
    const area = zoneArea(zone);
    const rand = random(0x3c7d + zoneIndex * 4211);

    // Un desierto enorme con cuatro cactus solo se ve vacío. En zonas grandes
    // se reparten por área.
    if (area > DESERT_LARGE_AREA) {
      const count = Math.max(1, Math.min(400, Math.round(area * 0.004)));
      for (let i = 0; i < count; i++) {
        const [x, z] = randomPointInZone(zone, rand, 1.0, 0.7);
        addCactus(x, z, 0.8 + rand() * 0.35, rand() * 360);
      }
      return;
    }

    // Claro pequeño: un único cactus. El sorteo original pedía un segundo
    // punto para separarlo de los demás, pero al no haber ninguno siempre
    // aceptaba el primero; se conserva el mismo consumo de azar para que la
    // posición sea idéntica a la de antes.
    randomPointInZone(zone, rand, 1.0, 0.7);
    const [x, z] = randomPointInZone(zone, rand, 1.0, 0.7);
    addCactus(x, z, 0.8 + rand() * 0.35, rand() * 360);
  });

  if (cactusTransforms.length > 0) {
    const buffer = new pc.VertexBuffer(
      device,
      cactusInstanceFormat,
      cactusTransforms.length / 16,
      { data: new Float32Array(cactusTransforms), usage: pc.BUFFER_STATIC }
    );
    const instance = new pc.MeshInstance(cactusMesh, cactusMaterial);
    instance.castShadows = false;
    instance.receiveShadows = false;
    instance.setInstancing(buffer, true);
    instancedFoliageBuffers.push(buffer);

    const entity = new pc.Entity('desert-cactus');
    entity.addComponent('render');
    entity.render!.castShadows = false;
    entity.render!.receiveShadows = false;
    entity.render!.meshInstances = [instance];
    // La caja abarca el mapa entero: así el lote nunca se descarta por error
    // cuando una cámara mira justo al borde de un desierto.
    entity.render!.customAabb = new pc.BoundingBox(
      new pc.Vec3(0, 1, 0),
      new pc.Vec3(HALF_X + 1, 1.5, HALF_Z + 1)
    );
    worldRoot.addChild(entity);
    created.push(entity);
  }
  ctx.mountainPeakMeshes = mountainPeakMeshes;
  ctx.wallSegmentMeshes = wallSegmentMeshes;
  ctx.volcanoMeshes = volcanoMeshes;
  ctx.volcanoLights = volcanoLights;
  ctx.cactusMesh = cactusMesh;
  ctx.desertZones = desertZones;
}
