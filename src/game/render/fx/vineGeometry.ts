import * as pc from 'playcanvas';

/**
 * Zarcillo de Látigo Cepa con geometría deformable. El tubo nace en el origen
 * (la base en el bulbo del lanzador) y se reconstruye cada frame para que una
 * onda recorra la curva de la base a la punta y esta chasquee de lado.
 *
 * `side` (-1 izquierda, 1 derecha) crea la pareja simétrica y el espacio local
 * usa +Z como dirección del golpe. El sombreado va horneado en los vértices con
 * una luz fija, así que actualizar la forma solo reescribe las posiciones.
 */
export interface VineWhipMesh {
  readonly mesh: pc.Mesh;
  /** Deforma el zarcillo para un tiempo normalizado 0..1. */
  update(time: number): void;
}

type Vec3 = [number, number, number];

const STEPS = 26;
const RADIAL_SEGMENTS = 10;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function createVineWhipMesh(
  device: pc.GraphicsDevice,
  range: number,
  side: number
): VineWhipMesh {
  const reach = Math.max(1.2, range);
  const ringStride = RADIAL_SEGMENTS + 1;
  const ringCount = STEPS + 1;
  const ringVertexCount = ringCount * ringStride;
  const baseCenterIndex = ringVertexCount;
  const tipCenterIndex = ringVertexCount + 1;
  const totalVertices = ringVertexCount + 2;

  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const colors = new Uint8Array(totalVertices * 4);
  const indices: number[] = [];

  // La malla nace en el origen (la base del zarcillo en el bulbo): al girar o
  // escalar no se despega del cuerpo del lanzador. Los puntos de control se
  // guardan ya relativos a ese origen y la punta se coloca un poco más allá de
  // `reach` (el largo del cono) para que el golpe siempre quede cubierto.
  const p1: Vec3 = [side * (0.32 + reach * 0.2), 0.65, reach * 0.15];
  const p2: Vec3 = [
    side * (0.02 + reach * 0.02) - side * 0.18,
    0.7,
    reach * 0.66
  ];
  const p3: Vec3 = [
    side * (0.3 + reach * 0.04) - side * 0.18,
    0.12,
    reach * 0.99
  ];

  const normalize = (vector: Vec3): Vec3 => {
    const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
    return [vector[0] / length, vector[1] / length, vector[2] / length];
  };
  const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
  const clamp255 = (value: number): number =>
    Math.max(0, Math.min(255, Math.round(value)));
  // `setColors32` guarda el color tal cual y el shader lo trata como lineal:
  // convertir el sRGB de autor conserva los verdes profundos del zarcillo.
  const toLinear = (value: number): number => {
    const channel = clamp255(value) / 255;
    const linear =
      channel <= 0.04045
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
    return Math.round(linear * 255);
  };

  const thickness = 0.14 + reach * 0.008;
  const radiusAt = (t: number, time: number): number => {
    const taper = Math.pow(1 - t, 0.9);
    // Vaina del extremo: un abultamiento suave antes de cerrar en punta.
    const pod = Math.exp(-Math.pow((t - 0.88) / 0.07, 2));
    const socket = Math.exp(-Math.pow(t / 0.05, 2));
    // Una onda de grosor recorre el tubo junto con la curva.
    const pulse =
      1 +
      0.07 *
        Math.sin(t * 8.2 - time * 11 + side * 0.8) *
        Math.sin(Math.PI * t);
    return (
      (thickness * (0.12 + 0.88 * taper) +
        thickness * 0.62 * pod +
        thickness * 0.12 * socket) *
      pulse
    );
  };

  const deep: Vec3 = [44, 112, 52];
  const mid: Vec3 = [82, 170, 72];
  const tipColor: Vec3 = [130, 210, 104];
  const podColor: Vec3 = [158, 226, 124];
  const glow: Vec3 = [208, 248, 176];
  // Luz propia del efecto, simétrica para la pareja de zarcillos y orientada
  // hacia la cámara de juego (detrás y arriba) para que el tubo conserve volumen.
  const light = normalize([side * -0.4, 0.86, -0.22]);

  /**
   * Centro del tubo en `u` (0 base, 1 punta), escrito en `out` para no
   * asignar arrays en cada frame. La curva base es una S amplia y encima
   * viajan una onda lateral, otra vertical y el chasquido de la punta.
   */
  const pointInto = (out: Vec3, u: number, time: number): void => {
    const s = 1 - u;
    // p0 está en el origen, así que su término no hace falta en la suma.
    const b = 3 * s * s * u;
    const c = 3 * s * u * u;
    const d = u * u * u;
    const baseX = p1[0] * b + p2[0] * c + p3[0] * d;
    const baseY = p1[1] * b + p2[1] * c + p3[1] * d;
    const baseZ = p1[2] * b + p2[2] * c + p3[2] * d;
    const envelope = Math.sin(Math.PI * u);
    // Las dos cepas no van en fase: la derecha entra un poco después, así el
    // cruce no forma un anillo cerrado y se lee como dos latigazos seguidos.
    const phase = time * 10.4 + (side < 0 ? 0 : 1.7);

    // Onda suave que recorre el zarcillo de la base a la punta. Es de baja
    // frecuencia a propósito: el latigazo lo da la punta, no un tubo ondulado.
    const wave =
      Math.sin(u * 5.6 - phase + side * 0.9) * 0.07 * reach * envelope;
    const verticalWave = Math.sin(u * 5.0 - phase * 0.8) * 0.04 * envelope;

    // Chasquido: la punta se cruza hacia dentro, baja y luego rebota hacia
    // fuera. Solo afecta al último tercio para que el cuerpo conserve la S.
    const tipWeight = smoothstep(0.55, 1, u);
    const tip = tipWeight * tipWeight;
    const lashDelay = side < 0 ? 0.02 : 0.11;
    const lashPhase = clamp01((time - lashDelay) / 0.72);
    const lash = Math.sin(lashPhase * Math.PI * 2);
    const lashAmp = 0.78 * (reach / 2.9) * (side < 0 ? 0.95 : 1.1);

    out[0] = baseX + wave - side * lash * lashAmp * tip;
    out[1] = baseY + verticalWave - Math.abs(lash) * 0.34 * tip;
    // La punta avanza al chasquear para que el golpe llegue al borde del cono.
    out[2] = baseZ + Math.abs(lash) * 0.14 * tip;
  };

  // Scratch reutilizado: la tangente se calcula por diferencias finitas.
  const tangentBefore: Vec3 = [0, 0, 0];
  const tangentAfter: Vec3 = [0, 0, 0];
  const tangentInto = (out: Vec3, u: number, time: number): void => {
    const epsilon = 0.004;
    pointInto(tangentBefore, Math.max(0, u - epsilon), time);
    pointInto(tangentAfter, Math.min(1, u + epsilon), time);
    const dx = tangentAfter[0] - tangentBefore[0];
    const dy = tangentAfter[1] - tangentBefore[1];
    const dz = tangentAfter[2] - tangentBefore[2];
    const length = Math.hypot(dx, dy, dz) || 1;
    out[0] = dx / length;
    out[1] = dy / length;
    out[2] = dz / length;
  };

  const colorAt = (t: number, angle: number, normal: Vec3): Vec3 => {
    const lambert = Math.max(
      0,
      normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2]
    );
    const shade = 0.62 + 0.48 * lambert;
    let color = mix(deep, mid, smoothstep(0, 0.52, t));
    color = mix(color, tipColor, smoothstep(0.58, 1, t) * 0.85);
    const pod = Math.exp(-Math.pow((t - 0.88) / 0.09, 2));
    color = mix(color, podColor, pod * 0.7);
    // Brillo satinado en la cara que mira a la luz.
    color = mix(color, glow, Math.pow(lambert, 8) * 0.55);
    // Vetas y manchas tenues: rompen la superficie lisa del tubo.
    const markings =
      0.92 +
      0.08 * Math.sin(t * 17 + Math.sin(angle * 3 + side) * 1.2) +
      0.04 * Math.sin(t * 7 - angle * 2.2 + 1.3);
    return [
      clamp255(color[0] * shade * markings),
      clamp255(color[1] * shade * markings),
      clamp255(color[2] * shade * markings)
    ];
  };

  const framePoint: Vec3 = [0, 0, 0];
  const frameTangent: Vec3 = [0, 0, 0];
  const writePositions = (time: number, writeNormals: boolean): void => {
    for (let ring = 0; ring <= STEPS; ring++) {
      const u = ring / STEPS;
      pointInto(framePoint, u, time);
      tangentInto(frameTangent, u, time);
      const tx = frameTangent[0];
      const ty = frameTangent[1];
      const tz = frameTangent[2];
      // Marco estable: `right` horizontal y `up` perpendicular a la tangente.
      // Si la tangente apunta casi en vertical, se usa +Z como referencia.
      const vertical = Math.abs(ty) > 0.94;
      const refY = vertical ? 0 : 1;
      const refZ = vertical ? 1 : 0;
      let rx = refY * tz - refZ * ty;
      let ry = refZ * tx;
      let rz = -refY * tx;
      let length = Math.hypot(rx, ry, rz) || 1;
      rx /= length;
      ry /= length;
      rz /= length;
      let ux = ty * rz - tz * ry;
      let uy = tz * rx - tx * rz;
      let uz = tx * ry - ty * rx;
      length = Math.hypot(ux, uy, uz) || 1;
      ux /= length;
      uy /= length;
      uz /= length;
      const radius = radiusAt(u, time);
      for (let slice = 0; slice <= RADIAL_SEGMENTS; slice++) {
        const angle = (slice / RADIAL_SEGMENTS) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        let nx = rx * cos + ux * sin;
        let ny = ry * cos + uy * sin;
        let nz = rz * cos + uz * sin;
        length = Math.hypot(nx, ny, nz) || 1;
        nx /= length;
        ny /= length;
        nz /= length;
        const vertex = ring * ringStride + slice;
        const offset = vertex * 3;
        positions[offset] = framePoint[0] + nx * radius;
        positions[offset + 1] = framePoint[1] + ny * radius;
        positions[offset + 2] = framePoint[2] + nz * radius;
        if (writeNormals) {
          normals[offset] = nx;
          normals[offset + 1] = ny;
          normals[offset + 2] = nz;
        }
      }
    }

    // Tapa la base para que no se vea hueca al girar la cámara.
    pointInto(framePoint, 0, time);
    tangentInto(frameTangent, 0, time);
    const baseOffset = baseCenterIndex * 3;
    positions[baseOffset] = framePoint[0];
    positions[baseOffset + 1] = framePoint[1];
    positions[baseOffset + 2] = framePoint[2];
    if (writeNormals) {
      normals[baseOffset] = -frameTangent[0];
      normals[baseOffset + 1] = -frameTangent[1];
      normals[baseOffset + 2] = -frameTangent[2];
    }

    // Punta redondeada tras la vaina.
    pointInto(framePoint, 1, time);
    tangentInto(frameTangent, 1, time);
    const tipOffset = tipCenterIndex * 3;
    positions[tipOffset] = framePoint[0] + frameTangent[0] * 0.02;
    positions[tipOffset + 1] = framePoint[1] + frameTangent[1] * 0.02;
    positions[tipOffset + 2] = framePoint[2] + frameTangent[2] * 0.02;
    if (writeNormals) {
      normals[tipOffset] = frameTangent[0];
      normals[tipOffset + 1] = frameTangent[1];
      normals[tipOffset + 2] = frameTangent[2];
    }
  };

  for (let ring = 0; ring < STEPS; ring++) {
    for (let slice = 0; slice < RADIAL_SEGMENTS; slice++) {
      const a = ring * ringStride + slice;
      const b = a + 1;
      const c = a + ringStride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  for (let slice = 0; slice < RADIAL_SEGMENTS; slice++) {
    indices.push(baseCenterIndex, slice, slice + 1);
    indices.push(
      tipCenterIndex,
      STEPS * ringStride + slice,
      STEPS * ringStride + slice + 1
    );
  }

  // Forma y colores de referencia. La luz se hornea con esta pose; en los
  // frames siguientes solo cambian las posiciones, no el color.
  const initialTime = 0.24;
  writePositions(initialTime, true);
  for (let ring = 0; ring <= STEPS; ring++) {
    const u = ring / STEPS;
    for (let slice = 0; slice <= RADIAL_SEGMENTS; slice++) {
      const vertex = ring * ringStride + slice;
      const normal: Vec3 = [
        normals[vertex * 3],
        normals[vertex * 3 + 1],
        normals[vertex * 3 + 2]
      ];
      const angle = (slice / RADIAL_SEGMENTS) * Math.PI * 2;
      const color = colorAt(u, angle, normal);
      const offset = vertex * 4;
      colors[offset] = toLinear(color[0]);
      colors[offset + 1] = toLinear(color[1]);
      colors[offset + 2] = toLinear(color[2]);
      colors[offset + 3] = 255;
    }
  }
  const baseColor = mix(deep, mid, 0.35);
  const baseColorOffset = baseCenterIndex * 4;
  colors[baseColorOffset] = toLinear(baseColor[0]);
  colors[baseColorOffset + 1] = toLinear(baseColor[1]);
  colors[baseColorOffset + 2] = toLinear(baseColor[2]);
  colors[baseColorOffset + 3] = 255;
  const tipColorOffset = tipCenterIndex * 4;
  colors[tipColorOffset] = toLinear(podColor[0]);
  colors[tipColorOffset + 1] = toLinear(podColor[1]);
  colors[tipColorOffset + 2] = toLinear(podColor[2]);
  colors[tipColorOffset + 3] = 255;

  const mesh = new pc.Mesh(device);
  // Buffer dinámico: las posiciones se reescriben en cada frame.
  mesh.clear(true, false, totalVertices, indices.length);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setColors32(colors);
  mesh.setIndices(indices);
  mesh.update();

  return {
    mesh,
    update(time: number): void {
      writePositions(time, false);
      mesh.setPositions(positions);
      mesh.update();
    }
  };
}
