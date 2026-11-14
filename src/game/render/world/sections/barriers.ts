/** Sección del generador de mundo. */

import * as pc from 'playcanvas';
import { randomPointInZone, zoneArea } from '../../../terrain';
import type { WorldBuildContext } from '../context';
import { random } from '../random';
import { MOUNTAIN_HEIGHT_SCALE, WALL_HEIGHT } from '../tuning';
import { standard } from '../worldParts';

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
    instancedFoliageBuffers
  } = ctx;
  const {
    mountainRock: mountainRockTexture,
    wallStone: wallStoneTexture
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
  ctx.cactusMesh = cactusMesh;
  ctx.desertZones = desertZones;
}
