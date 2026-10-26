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
