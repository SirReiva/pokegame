import * as pc from 'playcanvas';

/** Utilidades para generar las texturas de la demo (sin assets externos). */

export interface GroundPaintOptions {
  half: number;
  plaza: { x: number; z: number; radius: number };
  pond: { x: number; z: number; radius: number };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas2d(width: number, height = width): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el contexto 2D');
  return ctx;
}

export interface TextureOptions {
  srgb?: boolean;
  repeat?: boolean;
  mipmaps?: boolean;
  /** Filtro de minificación. Por defecto, lineal con mipmaps si hay mipmaps. */
  minFilter?: number;
  magFilter?: number;
  flipY?: boolean;
  name?: string;
}

export function textureFromCanvas(
  device: pc.GraphicsDevice,
  canvas: HTMLCanvasElement,
  options: TextureOptions = {}
): pc.Texture {
  const {
    srgb = true,
    repeat = false,
    mipmaps = true,
    magFilter = pc.FILTER_NEAREST,
    minFilter = mipmaps ? pc.FILTER_LINEAR_MIPMAP_LINEAR : pc.FILTER_NEAREST,
    flipY = false,
    name = 'procedural'
  } = options;

  const texture = new pc.Texture(device, {
    name,
    width: canvas.width,
    height: canvas.height,
    format: pc.PIXELFORMAT_RGBA8,
    srgb,
    mipmaps,
    minFilter,
    magFilter,
    addressU: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
    flipY
  });
  texture.setSource(canvas);
  return texture;
}

/** Césped del mapa con plaza, camino y flores pintados de forma procedural. */
export function createGroundCanvas(size: number, options: GroundPaintOptions): HTMLCanvasElement {
  const { half, plaza, pond } = options;
  const random = mulberry32(0x5eed);
  const ctx = canvas2d(size);
  const toPx = (world: number) => ((world + half) / (half * 2)) * size;
  const scale = size / (half * 2);

  ctx.fillStyle = '#699f4b';
  ctx.fillRect(0, 0, size, size);

  // Parches grandes de tono para romper la uniformidad.
  const patchColors = ['#5d9442', '#74ab55', '#639a46', '#7fb35e', '#578c3e'];
  for (let i = 0; i < 46; i++) {
    ctx.fillStyle = patchColors[Math.floor(random() * patchColors.length)];
    ctx.globalAlpha = 0.35 + random() * 0.3;
    const x = random() * size;
    const y = random() * size;
    const rx = (1.5 + random() * 4.5) * scale;
    const ry = (1 + random() * 3.5) * scale;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Grano fino tipo pixel art: bloques de 4 px.
  const grain = ['#5e9642', '#70a851', '#78b058', '#548c3b', '#6ba34d'];
  const step = 4;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      if (random() < 0.55) continue;
      ctx.fillStyle = grain[Math.floor(random() * grain.length)];
      ctx.globalAlpha = 0.35 + random() * 0.4;
      ctx.fillRect(x, y, step, step);
    }
  }
  ctx.globalAlpha = 1;

  // Matujos: pequeñas briznas.
  for (let i = 0; i < 2400; i++) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    ctx.fillStyle = random() > 0.5 ? '#4f8a39' : '#86bd64';
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x, y, 2, random() > 0.6 ? 4 : 2);
    if (random() > 0.5) ctx.fillRect(x + 2, y + 1, 2, 2);
  }
  ctx.globalAlpha = 1;

  const strokeWorldPath = (
    points: Array<[number, number]>,
    width: number,
    color: string
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(toPx(points[0][0]), toPx(points[0][1]));
    for (let i = 1; i < points.length - 1; i++) {
      const [cx, cy] = points[i];
      const [nx, ny] = points[i + 1];
      ctx.quadraticCurveTo(toPx(cx), toPx(cy), toPx((cx + nx) / 2), toPx((cy + ny) / 2));
    }
    const last = points[points.length - 1];
    ctx.lineTo(toPx(last[0]), toPx(last[1]));
    ctx.stroke();
  };

  // Camino principal desde el borde sur hasta la plaza.
  strokeWorldPath(
    [
      [-0.6, half + 1],
      [0.4, 16],
      [-0.8, 12.5],
      [0.5, 8.5],
      [plaza.x, plaza.z + plaza.radius - 0.6]
    ],
    3.6,
    '#c2a377'
  );
  // Sendero hacia el estanque.
  strokeWorldPath(
    [
      [plaza.x + 2.2, plaza.z - 1.6],
      [5.2, -2.6],
      [6.4, -5.4],
      [pond.x - 2.4, pond.z + 2.4]
    ],
    2.5,
    '#c2a377'
  );

  // Plaza central.
  const plazaPx = { x: toPx(plaza.x), y: toPx(plaza.z) };
  ctx.fillStyle = '#cbb083';
  ctx.beginPath();
  ctx.arc(plazaPx.x, plazaPx.y, plaza.radius * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d6bd93';
  ctx.beginPath();
  ctx.arc(plazaPx.x, plazaPx.y, (plaza.radius - 0.9) * scale, 0, Math.PI * 2);
  ctx.fill();

  // Arena alrededor del estanque.
  ctx.fillStyle = '#d8c79a';
  ctx.beginPath();
  ctx.arc(toPx(pond.x), toPx(pond.z), (pond.radius + 0.9) * scale, 0, Math.PI * 2);
  ctx.fill();

  // Piedrecillas y motas de tierra en plaza y caminos.
  for (let i = 0; i < 900; i++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * plaza.radius;
    const x = toPx(plaza.x + Math.cos(angle) * radius);
    const y = toPx(plaza.z + Math.sin(angle) * radius);
    ctx.fillStyle = random() > 0.5 ? '#b7986c' : '#e2cda6';
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x, y, 3, 3);
  }
  ctx.globalAlpha = 1;

  // Flores: ramilletes de puntos de color.
  const petals = ['#f5f0df', '#f7d75c', '#ef7fa1', '#f2a65a', '#c9a0dc'];
  const nearPaths = (x: number, z: number) => {
    if (Math.hypot(x, z) < plaza.radius + 1.2) return true;
    if (Math.hypot(x - pond.x, z - pond.z) < pond.radius + 1.6) return true;
    if (Math.abs(x) < 2.6 && z > 0) return true;
    return false;
  };
  for (let i = 0; i < 140; i++) {
    const x = (random() * 2 - 1) * (half - 1.5);
    const z = (random() * 2 - 1) * (half - 1.5);
    if (nearPaths(x, z)) continue;
    const color = petals[Math.floor(random() * petals.length)];
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(toPx(x) + (random() * 6 - 3), toPx(z) + (random() * 6 - 3), 3, 3);
    }
  }
  ctx.globalAlpha = 1;

  return ctx.canvas;
}

/** Tile de agua con ondas suaves; se anima desplazando el offset del material. */
export function createWaterCanvas(size = 96): HTMLCanvasElement {
  const random = mulberry32(1234);
  const ctx = canvas2d(size);
  ctx.fillStyle = '#4d9fd0';
  ctx.fillRect(0, 0, size, size);

  const bands = ['#63b3de', '#3f8dc0', '#74c3e8', '#357fae'];
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = bands[Math.floor(random() * bands.length)];
    ctx.globalAlpha = 0.45 + random() * 0.35;
    ctx.lineWidth = 3;
    const y = random() * size;
    const x = random() * size;
    const w = 12 + random() * 28;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w / 2, y - 4, x + w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return ctx.canvas;
}

export function createShadowCanvas(size = 128): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.38)');
  gradient.addColorStop(0.85, 'rgba(0, 0, 0, 0.12)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return ctx.canvas;
}

/** Resolución de la textura del anillo de jugador. */
export const MARKER_TEXTURE_SIZE = 64;
/** Radio exterior del anillo en píxeles de la textura; lo usa `marker.ts`. */
export const MARKER_RING_OUTER = 18;

/**
 * Anillo de jugador con flecha de rumbo. Se dibuja píxel a píxel (sin
 * antialiasing) para que combine con el resto del arte. La flecha apunta hacia
 * arriba en la imagen, que es el eje +Z del mundo, y su base nace dentro del
 * borde exterior del anillo para que ambos formen una sola silueta.
 */
export function createMarkerCanvas(size = MARKER_TEXTURE_SIZE): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const scale = size / 64;
  const cx = size / 2;
  const cy = size / 2;

  // Un solo color: sin borde oscuro.
  const accent = [255, 224, 102, 255];

  const put = (x: number, y: number, color: number[]) => {
    const index = (y * size + x) * 4;
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = color[3];
  };

  const inTriangle = (
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    tx: number,
    ty: number
  ): boolean => {
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - tx) * (by - ty) - (bx - tx) * (py - ty);
    const d3 = (px - ax) * (ty - ay) - (tx - ax) * (py - ay);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };

  // Base de la flecha apoyada en el anillo: el triángulo arranca desde dentro
  // del borde exterior y sale hacia arriba, sin quedar separado del círculo.
  const arrow = {
    tip: [32, 1] as const,
    left: [23.5, 16.5] as const,
    right: [40.5, 16.5] as const
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5 - cx) / scale;
      const py = (y + 0.5 - cy) / scale;
      const radius = Math.hypot(px, py);

      const inRing = radius >= 14 && radius < MARKER_RING_OUTER;
      const inArrow = inTriangle(
        x + 0.5,
        y + 0.5,
        arrow.tip[0] * scale,
        arrow.tip[1] * scale,
        arrow.left[0] * scale,
        arrow.left[1] * scale,
        arrow.right[0] * scale,
        arrow.right[1] * scale
      );

      if (inRing || inArrow) put(x, y, accent);
    }
  }

  ctx.putImageData(image, 0, 0);
  return ctx.canvas;
}

export function createSkyCanvas(width = 8, height = 256): HTMLCanvasElement {
  const ctx = canvas2d(width, height);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#4f9ad4');
  gradient.addColorStop(0.45, '#8cc4e8');
  gradient.addColorStop(0.72, '#cfe8f6');
  gradient.addColorStop(1, '#f2f7ec');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  return ctx.canvas;
}

/**
 * Textura de corteza para los troncos. La hoja es 16x32 para que, con el
 * aspect ratio del cilindro, los téxeles queden aproximadamente cuadrados.
 * Todo se dibuja a píxel completo, sin antialiasing.
 */
export function createBarkCanvas(width = 16, height = 32): HTMLCanvasElement {
  const random = mulberry32(0xba4c);
  const ctx = canvas2d(width, height);
  const palette = ['#3b2819', '#4d3420', '#5f4228', '#725031', '#89643d'];

  const plot = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(((x % width) + width) % width, ((y % height) + height) % height, 1, 1);
  };

  ctx.fillStyle = palette[2];
  ctx.fillRect(0, 0, width, height);

  // Vetas verticales de un píxel.
  for (let x = 0; x < width; x++) {
    ctx.fillStyle = palette[1 + Math.floor(random() * 3)];
    ctx.fillRect(x, 0, 1, height);
  }

  // Grietas y brillos cortos. Se dibujan con envoltura para que la costura
  // horizontal del cilindro no quede marcada.
  for (let i = 0; i < 24; i++) {
    const x = Math.floor(random() * width);
    const y = Math.floor(random() * height);
    const length = 2 + Math.floor(random() * 7);
    const dark = random() < 0.58;
    for (let k = 0; k < length; k++) {
      plot(x, y + k, dark ? palette[0] : palette[4]);
    }
  }

  // Nudo de corteza.
  const kx = 3;
  const ky = 8;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (Math.abs(dx) + Math.abs(dy) <= 2) plot(kx + dx, ky + dy, palette[0]);
    }
  }
  for (let dy = -1; dy <= 1; dy++) plot(kx + 2, ky + dy, palette[3]);

  return ctx.canvas;
}

const LEAF_PALETTES = [
  ['#24491f', '#2f5f2c', '#3f7d3f', '#4d8f45', '#68a95a'],
  ['#244d28', '#356b38', '#4d8f45', '#5aa04e', '#79b86b'],
  ['#1f4527', '#2a5c30', '#3f7d3f', '#4a8a42', '#63a256']
];

/**
 * Follaje pixel art para las bolas de las copas. La textura es 64x32 (2:1)
 * porque es el aspect ratio de las coordenadas UV de una esfera.
 */
export function createLeafCanvas(variant = 0, width = 64, height = 32): HTMLCanvasElement {
  const palette = LEAF_PALETTES[variant % LEAF_PALETTES.length];
  const random = mulberry32(0x1eaf + variant * 977);
  const ctx = canvas2d(width, height);

  const plot = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(((x % width) + width) % width, ((y % height) + height) % height, 1, 1);
  };

  const clumps = (
    count: number,
    rxMin: number,
    rxMax: number,
    ryMin: number,
    ryMax: number,
    color: string
  ) => {
    for (let i = 0; i < count; i++) {
      const cx = Math.floor(random() * width);
      const cy = Math.floor(random() * height);
      const rx = rxMin + Math.floor(random() * (rxMax - rxMin + 1));
      const ry = ryMin + Math.floor(random() * (ryMax - ryMin + 1));
      for (let dy = -ry; dy <= ry; dy++) {
        for (let dx = -rx; dx <= rx; dx++) {
          const nx = dx / (rx + 0.35);
          const ny = dy / (ry + 0.35);
          if (nx * nx + ny * ny <= 1 && random() > 0.12) {
            plot(cx + dx, cy + dy, color);
          }
        }
      }
    }
  };

  ctx.fillStyle = palette[1];
  ctx.fillRect(0, 0, width, height);

  // Huecos oscuros entre hojas.
  clumps(12, 1, 3, 1, 2, palette[0]);
  // Manchas medias y luces.
  clumps(20, 2, 4, 1, 2, palette[2]);
  clumps(15, 1, 3, 1, 2, palette[3]);
  clumps(8, 1, 2, 1, 1, palette[4]);

  // Píxeles sueltos que rompen los grupos.
  for (let i = 0; i < 24; i++) {
    plot(
      Math.floor(random() * width),
      Math.floor(random() * height),
      palette[1 + Math.floor(random() * 4)]
    );
  }

  return ctx.canvas;
}

const ROCK_PALETTES = [
  ['#3f454d', '#535a63', '#69717b', '#858d97', '#a2aab4'],
  ['#4a474f', '#5e5b64', '#74717c', '#8e8b96', '#a8a5b0']
];

/** Piedra pixel art: parches angulosos, grietas y motas. Hoja 32x16. */
export function createRockCanvas(variant = 0, width = 32, height = 16): HTMLCanvasElement {
  const palette = ROCK_PALETTES[variant % ROCK_PALETTES.length];
  const random = mulberry32(0x70c4 + variant * 613);
  const ctx = canvas2d(width, height);

  const plot = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(((x % width) + width) % width, ((y % height) + height) % height, 1, 1);
  };

  ctx.fillStyle = palette[2];
  ctx.fillRect(0, 0, width, height);

  // Parches de piedra con bordes rectos.
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(random() * width);
    const y = Math.floor(random() * height);
    const w = 1 + Math.floor(random() * 4);
    const h = 1 + Math.floor(random() * 3);
    const color = palette[random() < 0.55 ? 1 : 3];
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (random() > 0.12) plot(x + dx, y + dy, color);
      }
    }
  }

  // Grietas: recorridos de un píxel con alguna luz al lado.
  for (let i = 0; i < 4; i++) {
    let x = Math.floor(random() * width);
    let y = Math.floor(random() * height);
    const length = 4 + Math.floor(random() * 7);
    for (let k = 0; k < length; k++) {
      plot(x, y, palette[0]);
      if (random() < 0.3) plot(x + 1, y, palette[4]);
      x += random() < 0.72 ? 1 : -1;
      if (random() < 0.35) y += 1;
    }
  }

  // Motas y pequeños pozos.
  for (let i = 0; i < 22; i++) {
    plot(
      Math.floor(random() * width),
      Math.floor(random() * height),
      palette[random() < 0.6 ? 1 : random() < 0.7 ? 3 : 4]
    );
  }

  return ctx.canvas;
}

export function createSoilCanvas(size = 128): HTMLCanvasElement {
  const random = mulberry32(99);
  const ctx = canvas2d(size);
  ctx.fillStyle = '#8a6644';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = random() * size;
    const y = random() * size;
    ctx.fillStyle = random() > 0.5 ? '#7a5a3b' : '#9c7852';
    ctx.globalAlpha = 0.5 + random() * 0.5;
    ctx.fillRect(x, y, 1 + random() * 3, 1 + random() * 3);
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = '#6b4e33';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 1 + random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return ctx.canvas;
}
