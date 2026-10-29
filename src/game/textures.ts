import * as pc from "playcanvas";
import {
  onMountain,
  terrainAt,
  zoneBounds,
  zoneCenter,
  zoneContains,
  zoneContainsInset,
  zoneSignedDistance,
  type GameMap,
  type TerrainId,
  type TerrainZone,
  type ZoneShape,
} from "./terrain";

/** Utilidades para generar las texturas de la demo (sin assets externos). */

export interface GroundPaintOptions {
  map: GameMap;
  /** Regiones decorativas derivadas de la rejilla del mapa. */
  zones: TerrainZone[];
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

/**
 * Ruido determinista por coordenada. XOR de dos productos lineales (lo que
 * había antes) deja diagonales visibles en la rejilla; este hash mezcla los
 * bits para que el grano se lea como ruido y no como una trama.
 */
function blockNoise(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function canvas2d(
  width: number,
  height = width,
): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el contexto 2D");
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
  options: TextureOptions = {},
): pc.Texture {
  const {
    srgb = true,
    repeat = false,
    mipmaps = true,
    magFilter = pc.FILTER_NEAREST,
    minFilter = mipmaps ? pc.FILTER_LINEAR_MIPMAP_LINEAR : pc.FILTER_NEAREST,
    flipY = false,
    name = "procedural",
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
    flipY,
  });
  texture.setSource(canvas);
  return texture;
}

interface TerrainPalette {
  base: string;
  light: string;
  dark: string;
  accent: string;
  accent2: string;
}

const TERRAIN_PALETTES: Record<TerrainId, TerrainPalette> = {
  jungle: {
    base: "#699f4b",
    light: "#74ab55",
    dark: "#5d9442",
    accent: "#86bd64",
    accent2: "#4f8a39",
  },
  lane: {
    base: "#b99a70",
    light: "#c9ab82",
    dark: "#a58a63",
    accent: "#d7bd96",
    accent2: "#8f744f",
  },
  road: {
    base: "#4c525b",
    light: "#5a616b",
    dark: "#3d424a",
    accent: "#cfd6da",
    accent2: "#42474f",
  },
  sand: {
    base: "#d8c79a",
    light: "#e5d6ad",
    dark: "#c2ad7e",
    accent: "#f0e4c0",
    accent2: "#ab9468",
  },
  waterLow: {
    base: "#67bad8",
    light: "#7fd0e8",
    dark: "#58aecb",
    accent: "#b9edfa",
    accent2: "#4f9fbc",
  },
  waterHigh: {
    base: "#2f7fa8",
    light: "#3a8fb9",
    dark: "#276b92",
    accent: "#57b4d9",
    accent2: "#1f5e84",
  },
  base: {
    base: "#8d8577",
    light: "#a89f8e",
    dark: "#766e61",
    accent: "#c2b9a6",
    accent2: "#5f584d",
  },
  fire: {
    base: "#1f2329",
    light: "#2d323a",
    dark: "#0e1013",
    accent: "#3b4149",
    accent2: "#191c21",
  },
  electric: {
    base: "#a39344",
    light: "#b9a855",
    dark: "#7f7133",
    accent: "#fff3a6",
    accent2: "#e0c95a",
  },
  ice: {
    base: "#c3e2ea",
    light: "#dcf1f5",
    dark: "#93c5d3",
    accent: "#ffffff",
    accent2: "#7fb6c9",
  },
  poison: {
    base: "#5b3967",
    light: "#6f4a7c",
    dark: "#3c2548",
    accent: "#a6d96a",
    accent2: "#c07ad6",
  },
  ghost: {
    base: "#3d3a4c",
    light: "#4d4960",
    dark: "#282534",
    accent: "#8f84ad",
    accent2: "#6a5f86",
  },
  fairy: {
    base: "#8fbf6b",
    light: "#a3d07e",
    dark: "#6f9c52",
    accent: "#f2a7c3",
    accent2: "#e6d2f2",
  },
  desert: {
    base: "#d9b66c",
    light: "#eccf8d",
    dark: "#b9924d",
    accent: "#f6e3b0",
    accent2: "#8d6a36",
  },
  tallGrass: {
    base: "#2f6a2b",
    light: "#3f8234",
    dark: "#224f20",
    accent: "#5a9c3d",
    accent2: "#9ccf6f",
  },
};

/**
 * Pinta un calvero temático con bloques de 4 px, borde irregular y detalles
 * propios de su tipo Pokémon. La silueta y el ruido son deterministas.
 */
function paintTerrainZone(
  ctx: CanvasRenderingContext2D,
  zone: TerrainZone,
  toPxX: (world: number) => number,
  toPxY: (world: number) => number,
  scale: number,
): void {
  const palette = TERRAIN_PALETTES[zone.terrain];
  if (!palette) return;

  const bounds = zoneBounds(zone);
  const [centerX, centerZ] = zoneCenter(zone);
  const random = mulberry32(
    (Math.round(centerX * 811) * 73856093) ^
      (Math.round(centerZ * 613) * 19349663),
  );
  const cx = toPxX(centerX);
  const cy = toPxY(centerZ);
  // Radio del cuadrado que envuelve la forma: sirve para repartir detalles.
  const radius = (Math.max(bounds.width, bounds.depth) / 2) * scale;
  const seed = centerX * 1.31 + centerZ * 1.77;
  const step = 4;
  const shape: ZoneShape = zone;
  const edgeWorld = Math.min(
    0.42,
    Math.max(0.16, Math.max(bounds.width, bounds.depth) * 0.07),
  );
  const detailInset = edgeWorld * 0.75;

  const traceShape = () => {
    ctx.beginPath();
    if ("points" in zone) {
      const points = zone.points;
      if (points.length === 0) return;
      ctx.moveTo(toPxX(points[0][0]), toPxY(points[0][1]));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(toPxX(points[i][0]), toPxY(points[i][1]));
      }
      ctx.closePath();
    } else {
      ctx.arc(cx, cy, zone.radius * scale, 0, Math.PI * 2);
    }
  };

  // En círculos se conserva el borde irregular de siempre. En polígonos la
  // silueta se pinta tal cual para que coincida con la de `terrainAt`.
  const insideForPaint = (x: number, z: number): boolean => {
    if ("points" in zone) return zoneContains(shape, x, z);
    const distance = Math.hypot(x - zone.x, z - zone.z);
    const angle = Math.atan2(z - zone.z, x - zone.x);
    const wobble =
      1 +
      0.05 * Math.sin(angle * 3 + seed) +
      0.035 * Math.sin(angle * 7 - seed * 1.7);
    return distance <= zone.radius * wobble;
  };

  // Bloque de suelo: se recorre el rectángulo envolvente en coordenadas de
  // mundo para que círculos y polígonos compartan el mismo grano de 4 px.
  const worldPerPixel = 1 / scale;
  const startX = Math.floor(toPxX(bounds.minX) / step) * step;
  const startY = Math.floor(toPxY(bounds.minZ) / step) * step;
  const endX = Math.ceil(toPxX(bounds.maxX) / step) * step;
  const endY = Math.ceil(toPxY(bounds.maxZ) / step) * step;
  for (let py = startY; py <= endY; py += step) {
    for (let px = startX; px <= endX; px += step) {
      const wx = centerX + (px + step / 2 - cx) * worldPerPixel;
      const wz = centerZ + (py + step / 2 - cy) * worldPerPixel;
      if (!insideForPaint(wx, wz)) continue;

      const signed = zoneSignedDistance(shape, wx, wz);
      let color = palette.base;
      if (signed <= edgeWorld) color = palette.dark;
      else if (random() < 0.16) color = palette.light;
      else if (random() < 0.07) color = palette.dark;
      ctx.fillStyle = color;
      ctx.fillRect(px, py, step, step);
    }
  }

  const mark = (
    ox: number,
    oy: number,
    w: number,
    h: number,
    color: string,
  ) => {
    const wx = centerX + ox / scale;
    const wz = centerZ + oy / scale;
    if (!zoneContainsInset(shape, wx, wz, detailInset)) return;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(cx + ox), Math.round(cy + oy), w, h);
  };

  // Los detalles se recortan contra la silueta: un polígono puede ser
  // estrecho o cóncavo y ninguna marca debe salirse de su terreno.
  ctx.save();
  traceShape();
  ctx.clip();

  switch (zone.terrain) {
    case "fire": {
      // Basalto volcánico: placas oscuras separadas por una red de grietas.
      // El naranja y el amarillo no van en el suelo; viven en las coronas de
      // las rocas 3D. Aquí solo hay basalto, surcos negros y vetas frías.
      const plateCount = 9;
      const plates: Array<{ x: number; y: number; color: string }> = [];
      for (let i = 0; i < plateCount; i++) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random()) * radius * 0.82;
        plates.push({
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          color: random() < 0.55 ? palette.base : palette.light,
        });
      }

      for (let oy = -radius; oy <= radius; oy += step) {
        for (let ox = -radius; ox <= radius; ox += step) {
          const wx = centerX + ox / scale;
          const wz = centerZ + oy / scale;
          if (!insideForPaint(wx, wz)) continue;
          const signed = zoneSignedDistance(shape, wx, wz);

          let nearest = 0;
          let d1 = Infinity;
          let d2 = Infinity;
          for (let p = 0; p < plates.length; p++) {
            const dx = ox - plates[p].x;
            const dy = oy - plates[p].y;
            const d = Math.hypot(dx, dy);
            if (d < d1) {
              d2 = d1;
              d1 = d;
              nearest = p;
            } else if (d < d2) {
              d2 = d;
            }
          }

          const px = Math.floor(cx + ox);
          const py = Math.floor(cy + oy);

          if (signed <= edgeWorld) {
            ctx.fillStyle = palette.dark;
            ctx.fillRect(px, py, step, step);
            continue;
          }

          if (d2 - d1 < 5) {
            // Surco ancho y oscuro entre placas. La lava vive en las rocas 3D,
            // no en el suelo, así que las grietas se quedan en basalto negro.
            ctx.fillStyle = palette.dark;
            ctx.fillRect(px, py, step, step);
          } else {
            // Interior de la placa: basalto con vetas y poros.
            let color = plates[nearest].color;
            if (random() < 0.08) color = palette.dark;
            ctx.fillStyle = color;
            ctx.fillRect(px, py, step, step);
            if (random() < 0.14) {
              ctx.fillStyle = palette.light;
              ctx.fillRect(px + 1, py + 1, 2, 2);
            } else if (random() < 0.08) {
              ctx.fillStyle = palette.dark;
              ctx.fillRect(px, py + 2, step, 2);
            }
          }
        }
      }

      break;
    }
    case "electric": {
      // Hierba seca y pequeñas chispas.
      for (let i = 0; i < 34; i++) {
        mark(
          (random() * 2 - 1) * radius * 0.8,
          (random() * 2 - 1) * radius * 0.8,
          2,
          2 + Math.floor(random() * 3) * 2,
          random() < 0.5 ? palette.accent2 : palette.light,
        );
      }
      for (let i = 0; i < 12; i++) {
        let ox = (random() * 2 - 1) * radius * 0.7;
        let oy = (random() * 2 - 1) * radius * 0.7;
        for (let k = 0; k < 4; k++) {
          mark(ox, oy, 2, 2, palette.accent);
          ox += random() < 0.5 ? -2 : 2;
          oy += 2;
        }
      }
      break;
    }
    case "ice": {
      // Grietas heladas y destellos.
      for (let i = 0; i < 16; i++) {
        let ox = (random() * 2 - 1) * radius * 0.75;
        let oy = (random() * 2 - 1) * radius * 0.75;
        const length = 3 + Math.floor(random() * 5);
        const dir = random() < 0.5 ? -1 : 1;
        for (let k = 0; k < length; k++) {
          mark(ox, oy, 2, 2, palette.accent2);
          ox += dir * (2 + Math.floor(random() * 2));
          oy += (random() - 0.3) * 3;
        }
      }
      for (let i = 0; i < 30; i++) {
        mark(
          (random() * 2 - 1) * radius * 0.82,
          (random() * 2 - 1) * radius * 0.82,
          2,
          2,
          palette.accent,
        );
      }
      break;
    }
    case "poison": {
      // Charcones de lodo y burbujas.
      for (let i = 0; i < 12; i++) {
        const ox = (random() * 2 - 1) * radius * 0.7;
        const oy = (random() * 2 - 1) * radius * 0.7;
        const size = 4 + Math.floor(random() * 3) * 2;
        mark(ox, oy, size, size, palette.dark);
        mark(
          ox + 2,
          oy + 2,
          Math.max(2, size - 4),
          Math.max(2, size - 4),
          palette.accent2,
        );
      }
      // Hierba oscura: briznas cortas y dispersas que asoman entre el lodo.
      for (let i = 0; i < 22; i++) {
        const ox = (random() * 2 - 1) * radius * 0.8;
        const oy = (random() * 2 - 1) * radius * 0.8;
        const blade = 2 + Math.floor(random() * 3) * 2;
        mark(ox, oy, 1, blade, random() < 0.6 ? "#26301a" : "#3a4525");
        if (random() < 0.35) {
          mark(ox + 2, oy + 2, 1, Math.max(2, blade - 2), "#1d2614");
        }
      }
      for (let i = 0; i < 20; i++) {
        mark(
          (random() * 2 - 1) * radius * 0.78,
          (random() * 2 - 1) * radius * 0.78,
          2,
          2,
          palette.accent,
        );
      }
      break;
    }
    case "ghost": {
      // Motas y jirones de niebla.
      for (let i = 0; i < 26; i++) {
        mark(
          (random() * 2 - 1) * radius * 0.8,
          (random() * 2 - 1) * radius * 0.8,
          2,
          2,
          random() < 0.5 ? palette.accent : palette.accent2,
        );
      }
      for (let i = 0; i < 9; i++) {
        const ox = (random() * 2 - 1) * radius * 0.6;
        const oy = (random() * 2 - 1) * radius * 0.6;
        const length = 3 + Math.floor(random() * 4);
        mark(ox, oy, length * 2, 2, palette.accent2);
        mark(ox + 2, oy + 2, length * 2, 2, palette.accent);
      }
      break;
    }
    case "fairy": {
      // Ramilletes de flores y destellos.
      for (let i = 0; i < 42; i++) {
        const ox = (random() * 2 - 1) * radius * 0.8;
        const oy = (random() * 2 - 1) * radius * 0.8;
        const color = random() < 0.55 ? palette.accent : palette.accent2;
        mark(ox, oy, 2, 2, color);
        mark(ox + 2, oy, 2, 2, color);
        mark(ox, oy + 2, 2, 2, color);
        mark(ox + 2, oy + 2, 2, 2, palette.light);
      }
      break;
    }
    case "desert": {
      // Dunas onduladas, rizos de arena y piedras sueltas.
      for (let i = 0; i < 14; i++) {
        const oy = (random() * 2 - 1) * radius * 0.72;
        const length = 10 + Math.floor(random() * 16);
        let ox = -radius * 0.82 + random() * 6;
        for (let k = 0; k < length; k += 4) {
          const wave = Math.sin((ox / radius) * 3.1 + i * 0.9) * 3;
          mark(
            ox,
            oy + wave,
            4,
            2,
            random() < 0.5 ? palette.light : palette.base,
          );
          ox += 4;
        }
      }
      for (let i = 0; i < 90; i++) {
        mark(
          (random() * 2 - 1) * radius * 0.84,
          (random() * 2 - 1) * radius * 0.84,
          1,
          1,
          random() < 0.55 ? palette.accent : palette.dark,
        );
      }
      for (let i = 0; i < 10; i++) {
        let ox = (random() * 2 - 1) * radius * 0.7;
        let oy = (random() * 2 - 1) * radius * 0.7;
        const steps = 3 + Math.floor(random() * 3);
        for (let k = 0; k < steps; k++) {
          mark(ox, oy, 2, 2, palette.dark);
          ox += random() < 0.5 ? -2 : 2;
          oy += 2;
        }
      }
      for (let i = 0; i < 16; i++) {
        mark(
          (random() * 2 - 1) * radius * 0.8,
          (random() * 2 - 1) * radius * 0.8,
          2,
          2,
          palette.accent2,
        );
      }
      break;
    }
    case "tallGrass": {
      // Briznas verticales con punta clara, más densas que en el resto de
      // calveros: la mancha tiene que leerse como hierba crecida.
      for (let i = 0; i < 280; i++) {
        const ox = (random() * 2 - 1) * radius * 0.9;
        const oy = (random() * 2 - 1) * radius * 0.9;
        if (
          !zoneContainsInset(
            shape,
            centerX + ox / scale,
            centerZ + oy / scale,
            detailInset,
          )
        ) {
          continue;
        }
        const height = 6 + Math.floor(random() * 5) * 2;
        const lean = random() < 0.5 ? -2 : 2;
        const color =
          random() < 0.45
            ? palette.light
            : random() < 0.72
              ? palette.base
              : palette.dark;
        let bx = Math.round(cx + ox);
        const by = Math.round(cy + oy);
        for (let k = 0; k < height; k += 2) {
          ctx.fillStyle = k >= height - 2 ? palette.accent2 : color;
          ctx.fillRect(bx, by - k, 2, 2);
          if (k >= height * 0.5) bx += lean;
        }
      }
      break;
    }
    default:
      break;
  }

  ctx.restore();
}

/** Pinta la rejilla base del mapa, celda a celda. */
function paintGridTiles(ctx: CanvasRenderingContext2D, map: GameMap): void {
  const rows = map.tiles.length;
  const cols = map.tiles[0]?.length ?? 0;
  const cellPxX = ctx.canvas.width / cols;
  const cellPxY = ctx.canvas.height / rows;
  // El grano representa una franja de mundo parecida en todos los mapas: con
  // muchas celdas por téxel se reduce el bloque para que no se lea como una
  // trama enorme encima de cada celda.
  const pixelsPerUnit = map.tileSize > 0 ? cellPxX / map.tileSize : 0;
  const step = Math.max(1, Math.min(4, Math.round(pixelsPerUnit * 0.15)));
  // Cuando cada téxel ocupa mucho en pantalla, el grano se lee como una trama
  // regular al girar la cámara. Se baja el contraste en esos mapas sin perder
  // el detalle de los que ya iban sobrados de resolución.
  const grainStrength = Math.min(1, Math.max(0.35, pixelsPerUnit / 32));
  // Los detalles por celda (matas de hierba, marcas del suelo, ondas del agua)
  // estaban medidos en píxeles fijos. En un mapa grande la celda ocupa pocos
  // píxeles y esas marcas acababan siendo casi toda la celda, así que su
  // tamaño también se deriva de la escala del mundo.
  const detailSize = Math.max(1, Math.round(pixelsPerUnit * 0.075));
  const tuftWidth = Math.max(1, Math.round(pixelsPerUnit * 0.075));
  const tuftHeight = Math.max(1, Math.round(pixelsPerUnit * 0.112));
  const streakWidth = Math.max(1, Math.round(pixelsPerUnit * 0.15));
  const streakHeight = Math.max(1, Math.round(pixelsPerUnit * 0.075));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const terrain = map.tiles[row][col];
      const palette = TERRAIN_PALETTES[terrain];
      const x0 = Math.round(col * cellPxX);
      const y0 = Math.round(row * cellPxY);
      const x1 = Math.round((col + 1) * cellPxX);
      const y1 = Math.round((row + 1) * cellPxY);
      const random = mulberry32(
        (row * 73856093) ^ (col * 19349663) ^ 0x5eed,
      );

      ctx.fillStyle = palette.base;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

      // Grano con semilla por bloque de pantalla, no por celda: así dos celdas
      // vecinas del mismo terreno comparten el ruido y no aparece una costura
      // de tablero en cada borde.
      for (let py = y0; py < y1; py += step) {
        for (let px = x0; px < x1; px += step) {
          const gx = Math.floor(px / step) + 1;
          const gy = Math.floor(py / step) + 1;
          if (blockNoise(gx, gy) < 0.62) continue;
          const tone = blockNoise(gx + 1013, gy - 811);
          ctx.fillStyle =
            tone < 0.45
              ? palette.light
              : tone < 0.5
                ? palette.dark
                : palette.accent2;
          ctx.globalAlpha =
            (0.14 + blockNoise(gx - 733, gy + 457) * 0.22) * grainStrength;
          ctx.fillRect(px, py, Math.min(step, x1 - px), Math.min(step, y1 - py));
        }
      }
      ctx.globalAlpha = 1;

      switch (terrain) {
        case "waterLow":
        case "waterHigh": {
          const streaks = 2 + Math.floor(random() * 2);
          ctx.fillStyle =
            terrain === "waterHigh" ? palette.accent : "#c4f0fb";
          ctx.globalAlpha = 0.55;
          for (let i = 0; i < streaks; i++) {
            const sx = x0 + random() * Math.max(1, x1 - x0 - streakWidth);
            const sy = y0 + random() * Math.max(1, y1 - y0 - streakHeight);
            ctx.fillRect(
              Math.round(sx),
              Math.round(sy),
              streakWidth,
              streakHeight,
            );
          }
          ctx.globalAlpha = 1;
          break;
        }
        case "road": {
          ctx.fillStyle = palette.accent2;
          ctx.globalAlpha = 0.6;
          for (let i = 0; i < 5; i++) {
            ctx.fillRect(
              x0 + Math.floor(random() * Math.max(1, x1 - x0 - detailSize)),
              y0 + Math.floor(random() * Math.max(1, y1 - y0 - detailSize)),
              detailSize,
              detailSize,
            );
          }
          ctx.globalAlpha = 1;
          break;
        }
        case "lane":
        case "sand": {
          ctx.fillStyle = palette.accent;
          ctx.globalAlpha = 0.55;
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(
              x0 + Math.floor(random() * Math.max(1, x1 - x0 - detailSize)),
              y0 + Math.floor(random() * Math.max(1, y1 - y0 - detailSize)),
              detailSize,
              detailSize,
            );
          }
          ctx.globalAlpha = 1;
          break;
        }
        case "jungle": {
          ctx.fillStyle = palette.accent;
          ctx.globalAlpha = 0.5;
          for (let i = 0; i < 3; i++) {
            ctx.fillRect(
              x0 + Math.floor(random() * Math.max(1, x1 - x0 - tuftWidth)),
              y0 + Math.floor(random() * Math.max(1, y1 - y0 - tuftHeight)),
              tuftWidth,
              tuftHeight,
            );
          }
          ctx.globalAlpha = 1;
          break;
        }
        default:
          break;
      }
    }
  }
}

/** Plataforma de piedra de cada respawn, con el anillo y el emblema del equipo. */
function paintBases(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  toPxX: (world: number) => number,
  toPxY: (world: number) => number,
  scale: number,
): void {
  for (const base of map.respawns) {
    const bx = toPxX(base.x);
    const by = toPxY(base.z);
    const ring = base.team === "blue" ? "#5b8fd9" : "#d96b5b";
    ctx.fillStyle = "#8d8577";
    ctx.beginPath();
    ctx.arc(bx, by, base.radius * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a89f8e";
    ctx.beginPath();
    ctx.arc(bx, by, (base.radius - 0.55) * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ring;
    ctx.lineWidth = Math.max(2, 0.3 * scale);
    ctx.beginPath();
    ctx.arc(bx, by, (base.radius - 1.05) * scale, 0, Math.PI * 2);
    ctx.stroke();
    // Cuatro losanges del emblema.
    ctx.fillStyle = ring;
    for (let i = 0; i < 4; i++) {
      const angle = i * (Math.PI / 2) + Math.PI / 4;
      const ox = Math.cos(angle) * (base.radius - 1.75) * scale;
      const oy = Math.sin(angle) * (base.radius - 1.75) * scale;
      ctx.fillRect(Math.round(bx + ox) - 3, Math.round(by + oy) - 3, 6, 6);
    }
  }
}

/**
 * Resolución de la textura del suelo.
 *
 * La densidad se mantiene constante en el mundo (hasta `maxPixelsPerUnit`) para
 * que una celda no acabe con un solo téxel: eso convertía los mapas grandes en
 * manchas de color borrosas al acercar la cámara. El total se limita con un
 * presupuesto de téxeles y con el tamaño máximo que acepta la GPU.
 *
 * Devuelve el lado mayor de la textura; `createGroundCanvas` deriva el otro del
 * aspecto del mapa. `size` antiguo era siempre 1024, así que los mapas pequeños
 * conservan (o mejoran) su detalle.
 */
export function groundTextureSize(
  map: GameMap,
  options: {
    /** Presupuesto total de téxeles (ancho × alto). */
    maxTexels?: number;
    /** Densidad máxima, en píxeles por unidad de mundo. */
    maxPixelsPerUnit?: number;
    /** Lado máximo permitido por la GPU. */
    maxSize?: number;
    /** Lado mínimo, para no perder detalle en mapas pequeños. */
    minSize?: number;
  } = {},
): number {
  const {
    maxTexels = 8_000_000,
    maxPixelsPerUnit = 32,
    maxSize = 8192,
    minSize = 1024,
  } = options;

  const rows = map.tiles.length;
  const cols = map.tiles[0]?.length ?? 0;
  const worldWidth = cols * map.tileSize;
  const worldDepth = rows * map.tileSize;
  const longestWorld = Math.max(worldWidth, worldDepth);
  const area = worldWidth * worldDepth;
  if (longestWorld <= 0 || area <= 0) return minSize;

  const pixelsPerUnit = Math.min(
    maxPixelsPerUnit,
    Math.sqrt(maxTexels / area),
  );
  return Math.round(
    Math.min(maxSize, Math.max(minSize, longestWorld * pixelsPerUnit)),
  );
}

/**
 * Suelo del mapa: cada celda pinta su terreno y encima se añaden los detalles
 * de los calveros, las plataformas de las bases y las flores de la jungla.
 * `size` es el lado mayor de la textura; el otro se deriva del aspecto del
 * mapa para que un mapa rectangular no se deforme.
 */
export function createGroundCanvas(
  size: number,
  options: GroundPaintOptions,
): HTMLCanvasElement {
  const { map, zones } = options;
  const rows = map.tiles.length;
  const cols = map.tiles[0]?.length ?? 0;
  const worldWidth = cols * map.tileSize;
  const worldDepth = rows * map.tileSize;
  const scale = size / Math.max(worldWidth, worldDepth);
  const width = Math.max(1, Math.round(worldWidth * scale));
  const height = Math.max(1, Math.round(worldDepth * scale));
  const halfX = worldWidth / 2;
  const halfZ = worldDepth / 2;
  const toPxX = (world: number) => ((world + halfX) / worldWidth) * width;
  const toPxY = (world: number) => ((world + halfZ) / worldDepth) * height;
  const random = mulberry32(0x5eed);
  const ctx = canvas2d(width, height);

  ctx.fillStyle = TERRAIN_PALETTES.jungle.base;
  ctx.fillRect(0, 0, width, height);

  paintGridTiles(ctx, map);

  // Detalle procedural de los calveros temáticos.
  for (const zone of zones) {
    paintTerrainZone(ctx, zone, toPxX, toPxY, scale);
  }

  paintBases(ctx, map, toPxX, toPxY, scale);

  // Flores: ramilletes solo en la jungla, lejos de cordilleras. El tamaño se
  // deriva de la escala para que un mapa enorme no convierta cada flor en un
  // cuadrado de varios metros.
  const petals = ["#f5f0df", "#f7d75c", "#ef7fa1", "#f2a65a", "#c9a0dc"];
  const petalSize = Math.max(1, Math.round(scale * 0.11));
  const petalSpread = Math.max(1, Math.round(scale * 0.11));
  for (let i = 0; i < 220; i++) {
    const x = (random() * 2 - 1) * (halfX - 1.5);
    const z = (random() * 2 - 1) * (halfZ - 1.5);
    if (terrainAt(x, z) !== "jungle") continue;
    if (onMountain(x, z)) continue;
    const color = petals[Math.floor(random() * petals.length)];
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(
        toPxX(x) + (random() * 2 - 1) * petalSpread,
        toPxY(z) + (random() * 2 - 1) * petalSpread,
        petalSize,
        petalSize,
      );
    }
  }
  ctx.globalAlpha = 1;

  return ctx.canvas;
}

/**
 * Tile de ondas para la lámina de agua. `variant` cambia la semilla y la paleta
 * para poder superponer dos capas que se mueven en direcciones distintas. Las
 * ondas se dibujan repetidas en los bordes para que el tile sea continuo al
 * desplazar las UVs y no aparezcan costuras.
 */
export function createWaterCanvas(size = 96, variant = 0): HTMLCanvasElement {
  const random = mulberry32(variant === 0 ? 0x7e11 : 0x3ac5);
  const ctx = canvas2d(size);
  ctx.fillStyle = variant === 0 ? "#6ec5e2" : "#63bcd9";
  ctx.fillRect(0, 0, size, size);

  const bands =
    variant === 0
      ? ["#a6e7f6", "#4aa6ca", "#c4f0fb", "#3189ad"]
      : ["#d6f7ff", "#3f9dc1", "#eafcff", "#2b7fa2"];

  const stroke = (
    x: number,
    y: number,
    w: number,
    color: string,
    alpha: number,
    width = 2.6,
  ) => {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + w / 2, y - 3.4, x + w, y);
    ctx.stroke();
  };

  for (let i = 0; i < 62; i++) {
    const color = bands[Math.floor(random() * bands.length)];
    const alpha = 0.4 + random() * 0.36;
    const x = random() * size;
    const y = random() * size;
    const w = 10 + random() * 26;
    // Nueve copias: cualquier onda que cruce un borde reaparece por el lado
    // opuesto y el desplazamiento de UVs queda sin cortes.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        stroke(x + dx * size, y + dy * size, w, color, alpha);
      }
    }
  }

  // La capa de brillos lleva además destellos cortos y muy claros: son los que
  // hacen que el movimiento se lea de un vistazo sobre el agua.
  if (variant === 1) {
    for (let i = 0; i < 18; i++) {
      const alpha = 0.55 + random() * 0.35;
      const x = random() * size;
      const y = random() * size;
      const w = 6 + random() * 12;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          stroke(x + dx * size, y + dy * size, w, "#f4feff", alpha, 1.7);
        }
      }
    }
  }

  ctx.globalAlpha = 1;
  return ctx.canvas;
}

/**
 * Máscara de opacidad de la lámina de agua: opaca en el centro y difuminada en
 * el borde, con recortes irregulares. Así la superficie se funde con la orilla
 * de arena sin dejar un borde circular duro.
 */
export function createWaterMaskCanvas(size = 256): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const center = size / 2;
  const gradient = ctx.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    center,
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.72, "rgba(255, 255, 255, 0.96)");
  gradient.addColorStop(0.86, "rgba(255, 255, 255, 0.7)");
  gradient.addColorStop(0.95, "rgba(255, 255, 255, 0.24)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // La orilla no es un círculo perfecto: se come el borde con bloques
  // deterministas para que la máscara tenga el mismo aire pixelado que el mapa.
  const random = mulberry32(0x51a7);
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 260; i++) {
    const angle = random() * Math.PI * 2;
    const radius = center * (0.82 + random() * 0.18);
    const block = 3 + Math.floor(random() * 5);
    ctx.globalAlpha = 0.18 + random() * 0.45;
    ctx.fillRect(
      Math.floor(center + Math.cos(angle) * radius),
      Math.floor(center + Math.sin(angle) * radius),
      block,
      block,
    );
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  return ctx.canvas;
}

/**
 * Motas de polvo: varias manchas suaves superpuestas sobre fondo transparente.
 * Se usa como `colorMap` de las partículas del desierto, así que el color sale
 * blanco cálido y la forma queda difusa, sin un borde circular duro.
 */
export function createDustCanvas(size = 64): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const random = mulberry32(0xd057);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 16; i++) {
    const cx = size / 2 + (random() - 0.5) * size * 0.42;
    const cy = size / 2 + (random() - 0.5) * size * 0.42;
    const radius = size * (0.12 + random() * 0.2);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, "rgba(255, 248, 224, 0.55)");
    gradient.addColorStop(0.5, "rgba(255, 244, 210, 0.26)");
    gradient.addColorStop(1, "rgba(255, 240, 200, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.globalCompositeOperation = "source-over";
  return ctx.canvas;
}

/**
 * Copos de escarcha: un punto blanco azulado con núcleo brillante y cuatro
 * brazos tenues. Se usa como `colorMap` de la nieve del calvero helado; a
 * tamaño pequeño se lee como un copo y no como una mancha.
 */
export function createFrostCanvas(size = 64): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const center = size / 2;

  const gradient = ctx.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    center,
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.28, "rgba(238, 251, 255, 0.9)");
  gradient.addColorStop(0.62, "rgba(202, 238, 250, 0.35)");
  gradient.addColorStop(1, "rgba(180, 224, 245, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Cuatro brazos casi transparentes: sugieren un cristal de hielo sin
  // recargar el copo cuando se ve a tamaño de juego.
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = Math.max(1, size * 0.02);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(
      center + Math.cos(angle) * center * 0.7,
      center + Math.sin(angle) * center * 0.7,
    );
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  return ctx.canvas;
}

/**
 * Chispa eléctrica: núcleo blanco azulado, halo frío y cuatro brazos quebrados.
 * Está pensada para blending aditivo, así que el borde es alfa 0 y el azul lo
 * termina de fijar el `colorGraph` de las partículas del páramo.
 */
export function createSparkCanvas(size = 48): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const center = size / 2;

  const glow = ctx.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    center,
  );
  glow.addColorStop(0, "rgba(255, 255, 255, 1)");
  glow.addColorStop(0.2, "rgba(226, 247, 255, 0.95)");
  glow.addColorStop(0.52, "rgba(150, 214, 255, 0.42)");
  glow.addColorStop(1, "rgba(88, 158, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // Brazos cortos en zigzag: dan la silueta de chispa sin convertir la mota en
  // una estrella simétrica cuando se ve a tamaño de juego.
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(214, 241, 255, 0.7)";
  ctx.lineWidth = Math.max(1, size * 0.035);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const knee = center * 0.44;
    const tip = center * 0.84;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(
      center + Math.cos(angle + 0.22) * knee,
      center + Math.sin(angle + 0.22) * knee,
    );
    ctx.lineTo(center + Math.cos(angle) * tip, center + Math.sin(angle) * tip);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  return ctx.canvas;
}

/**
 * Humo de ciénaga: jirones suaves y redondeados, con más cuerpo y menos brillo
 * que el polvo. Se usa como `colorMap` de las partículas de humo; el tono
 * verdoso lo pone el `colorGraph` del sistema.
 */
export function createSmokeCanvas(size = 96): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const random = mulberry32(0x5a0c);
  for (let i = 0; i < 12; i++) {
    const cx = size / 2 + (random() - 0.5) * size * 0.34;
    const cy = size / 2 + (random() - 0.5) * size * 0.34;
    const radius = size * (0.18 + random() * 0.22);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.2)");
    gradient.addColorStop(0.55, "rgba(244, 250, 240, 0.11)");
    gradient.addColorStop(1, "rgba(232, 244, 228, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return ctx.canvas;
}

/**
 * Manto de niebla continuo y repetible para el suelo de la ciénaga.
 *
 * A diferencia de `createSmokeCanvas` (bocanadas sueltas), aquí interesa una
 * capa de nubosidad suave que tile sin costuras: varias octavas de ruido de
 * valor periódico, con alfa bajo y variaciones amplias. El material la estira
 * sobre toda la zona y la desplaza despacio para que parezca niebla viva.
 */
export function createMistCanvas(size = 128): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const random = mulberry32(0x2f4b);
  const octaves = [4, 8, 16, 32];
  const weights = [0.45, 0.27, 0.17, 0.11];
  const grids = octaves.map((cells) => {
    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = random();
    return { cells, grid };
  });

  const sample = (u: number, v: number): number => {
    let value = 0;
    for (let o = 0; o < grids.length; o++) {
      const { cells, grid } = grids[o];
      const gx = u * cells;
      const gy = v * cells;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const cx0 = ((x0 % cells) + cells) % cells;
      const cy0 = ((y0 % cells) + cells) % cells;
      const cx1 = (cx0 + 1) % cells;
      const cy1 = (cy0 + 1) % cells;
      const v00 = grid[cy0 * cells + cx0];
      const v10 = grid[cy0 * cells + cx1];
      const v01 = grid[cy1 * cells + cx0];
      const v11 = grid[cy1 * cells + cx1];
      const top = v00 * (1 - sx) + v10 * sx;
      const bottom = v01 * (1 - sx) + v11 * sx;
      value += (top * (1 - sy) + bottom * sy) * weights[o];
    }
    return value;
  };

  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const shaped = Math.min(1, Math.max(0, (sample(x / size, y / size) - 0.32) / 0.42));
      const alpha = 0.07 + shaped * 0.26;
      const index = (y * size + x) * 4;
      // Blanco neutro: el tinte lo pone cada material (verde en la ciénaga,
      // arena en el desierto) sin arrastrar una dominante de color.
      image.data[index] = 255;
      image.data[index + 1] = 255;
      image.data[index + 2] = 255;
      image.data[index + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return ctx.canvas;
}

/**
 * Chispa de lava: núcleo blanco-amarillo que cae a naranja y rojo. Está
 * pensada para blending aditivo, así que el borde es alfa 0 y el centro suma
 * luz sobre el basalto.
 */
export function createEmberCanvas(size = 48): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const center = size / 2;
  const gradient = ctx.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    center,
  );
  gradient.addColorStop(0, "rgba(255, 255, 230, 1)");
  gradient.addColorStop(0.22, "rgba(255, 220, 90, 0.95)");
  gradient.addColorStop(0.5, "rgba(255, 140, 30, 0.55)");
  gradient.addColorStop(0.78, "rgba(255, 70, 10, 0.18)");
  gradient.addColorStop(1, "rgba(255, 40, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return ctx.canvas;
}

/**
 * Lengua de fuego procedural para los efectos de combate.
 *
 * La silueta es un óvalo alargado que se afila hacia la punta y ondula en los
 * bordes; el color va de blanco-amarillo en el corazón a naranja y rojo en la
 * periferia. Se usa en quads cruzados con blending aditivo, así que el alfa 0
 * del contorno hace que las llamas se fundan entre sí sin dejar un rectángulo.
 */
export function createFlameCanvas(width = 96, height = 144): HTMLCanvasElement {
  const ctx = canvas2d(width, height);
  const image = ctx.createImageData(width, height);
  const smooth = (edge0: number, edge1: number, value: number): number => {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };

  for (let y = 0; y < height; y++) {
    // v = 0 en la base, 1 en la punta.
    const v = 1 - (y + 0.5) / height;
    const taper = Math.pow(1 - v, 0.62);
    const belly = 0.42 + 0.58 * Math.sin(Math.PI * Math.min(1, 0.1 + v * 1.05));
    const half = 0.5 * taper * belly + 0.02;
    // Serpenteo del eje y del borde: evita la simetría perfecta de un cono.
    const drift = 0.07 * Math.sin(v * 5.1 + 1.2) * v;
    const wander =
      0.075 * Math.sin(v * 9.3 + 0.6) * (0.3 + 0.7 * v) +
      0.03 * Math.sin(v * 23 + 2.4);

    for (let x = 0; x < width; x++) {
      const u = ((x + 0.5) / width) * 2 - 1;
      const distance = Math.abs(u - drift - wander) / half;
      if (distance >= 1) continue;

      const radial = 1 - distance;
      const grain =
        0.5 +
        0.5 * Math.sin(v * 41 + u * 9) * Math.sin(v * 17 - u * 5 + 1.3);
      const heat = Math.min(
        1,
        Math.max(0, 1 - v * 0.78 - (1 - radial) * 0.75)
      );

      let r: number;
      let g: number;
      let b: number;
      if (heat > 0.72) {
        const k = (heat - 0.72) / 0.28;
        r = 255;
        g = 225 + 30 * k;
        b = 120 + 110 * k;
      } else if (heat > 0.45) {
        const k = (heat - 0.45) / 0.27;
        r = 255;
        g = 145 + 80 * k;
        b = 35 + 85 * k;
      } else if (heat > 0.2) {
        const k = (heat - 0.2) / 0.25;
        r = 226 + 29 * k;
        g = 74 + 71 * k;
        b = 18 + 17 * k;
      } else {
        const k = heat / 0.2;
        r = 140 + 86 * k;
        g = 24 + 50 * k;
        b = 4 + 14 * k;
      }

      let alpha = 1 - smooth(0.7, 1, distance);
      alpha *= 0.55 + 0.45 * grain;
      alpha *= 1 - smooth(0.88, 1, v);
      alpha *= 0.6 + 0.4 * smooth(0, 0.06, v);
      // Alguna rasgadura cerca del borde para que no parezca una lámina.
      if (grain < 0.22 && distance > 0.55) alpha *= 0.35;

      const index = (y * width + x) * 4;
      image.data[index] = Math.round(r);
      image.data[index + 1] = Math.round(g);
      image.data[index + 2] = Math.round(b);
      image.data[index + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  }

  ctx.putImageData(image, 0, 0);
  return ctx.canvas;
}

/**
 * Hoja suelta para los efectos de Planta: silueta alargada con nervadura y
 * borde transparente. Se usa tanto en quads cruzados como en partículas; el
 * tono verde final lo pone el material o el `colorGraph`.
 */
export function createLeafParticleCanvas(size = 64): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const center = size / 2;
  const halfWidth = size * 0.3;
  const halfHeight = size * 0.46;

  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(-0.55);

  const fill = ctx.createLinearGradient(0, -halfHeight, 0, halfHeight);
  fill.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  fill.addColorStop(0.45, "rgba(244, 255, 232, 1)");
  fill.addColorStop(1, "rgba(206, 236, 178, 0.92)");
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, -halfHeight);
  ctx.bezierCurveTo(
    halfWidth,
    -halfHeight * 0.62,
    halfWidth,
    halfHeight * 0.62,
    0,
    halfHeight,
  );
  ctx.bezierCurveTo(
    -halfWidth,
    halfHeight * 0.62,
    -halfWidth,
    -halfHeight * 0.62,
    0,
    -halfHeight,
  );
  ctx.closePath();
  ctx.fill();

  // Nervadura central y laterales: dan lectura de hoja a tamaño pequeño.
  ctx.strokeStyle = "rgba(160, 210, 130, 0.55)";
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.beginPath();
  ctx.moveTo(0, -halfHeight * 0.82);
  ctx.lineTo(0, halfHeight * 0.82);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, size * 0.014);
  for (let index = 1; index <= 3; index++) {
    const y = -halfHeight * 0.55 + (index - 1) * halfHeight * 0.42;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(halfWidth * 0.62, y - halfHeight * 0.18);
    ctx.moveTo(0, y);
    ctx.lineTo(-halfWidth * 0.62, y - halfHeight * 0.18);
    ctx.stroke();
  }

  ctx.restore();
  return ctx.canvas;
}

/**
 * Fuego fatuo: orbe blanco con halo que se apaga y una pluma tenue hacia
 * arriba. Está pensado para blending aditivo y para que el violeta lo ponga el
 * `colorGraph`; la textura se queda neutra para no arrastrar naranjas.
 */
export function createWispCanvas(size = 64): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const center = size / 2;

  const glow = ctx.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    center * 0.92,
  );
  glow.addColorStop(0, "rgba(255, 255, 255, 1)");
  glow.addColorStop(0.18, "rgba(238, 242, 255, 0.92)");
  glow.addColorStop(0.46, "rgba(204, 212, 255, 0.42)");
  glow.addColorStop(1, "rgba(170, 180, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = "lighter";
  const plume = ctx.createLinearGradient(center, center, center, 0);
  plume.addColorStop(0, "rgba(224, 230, 255, 0.5)");
  plume.addColorStop(1, "rgba(198, 208, 255, 0)");
  ctx.fillStyle = plume;
  ctx.beginPath();
  ctx.ellipse(
    center,
    center * 0.5,
    size * 0.12,
    center * 0.5,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  return ctx.canvas;
}

/**
 * Polen del claro feérico: mota dorada diminuta con núcleo brillante y cuatro
 * destellos tenues. Se usa como `colorMap` de partículas aditivas, así que el
 * borde alfa 0 suma solo el centro y se lee como un grano de polen flotando.
 */
export function createPollenCanvas(size = 32): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const center = size / 2;

  const glow = ctx.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    center,
  );
  glow.addColorStop(0, "rgba(255, 252, 230, 1)");
  glow.addColorStop(0.28, "rgba(255, 236, 180, 0.85)");
  glow.addColorStop(0.62, "rgba(255, 214, 130, 0.32)");
  glow.addColorStop(1, "rgba(255, 196, 110, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // Cuatro brazos casi transparentes: sugieren un brillo de polen sin recargar
  // la mota cuando se ve a tamaño de juego.
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(255, 250, 230, 0.4)";
  ctx.lineWidth = Math.max(1, size * 0.03);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(
      center + Math.cos(angle) * center * 0.66,
      center + Math.sin(angle) * center * 0.66,
    );
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  return ctx.canvas;
}

export function createShadowCanvas(size = 128): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.05,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  gradient.addColorStop(0.55, "rgba(0, 0, 0, 0.38)");
  gradient.addColorStop(0.85, "rgba(0, 0, 0, 0.12)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return ctx.canvas;
}

/** Resolución de la textura del anillo de jugador. */
export const MARKER_TEXTURE_SIZE = 64;
/** Radio exterior del anillo en píxeles de la textura; lo usa `marker.ts`. */
export const MARKER_RING_OUTER = 16;

/**
 * Anillo de jugador con flecha de rumbo. Se dibuja píxel a píxel (sin
 * antialiasing) para que combine con el resto del arte. La flecha apunta hacia
 * arriba en la imagen, que es el eje +Z del mundo, y su base nace dentro del
 * borde exterior del anillo para que ambos formen una sola silueta.
 */
export function createMarkerCanvas(
  size = MARKER_TEXTURE_SIZE,
  accent: readonly [number, number, number] = [255, 224, 102]
): HTMLCanvasElement {
  const ctx = canvas2d(size);
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const scale = size / 64;
  const cx = size / 2;
  const cy = size / 2;

  // Un solo color: sin borde oscuro. El color llega del equipo del jugador.
  const color = [accent[0], accent[1], accent[2], 255];

  const put = (x: number, y: number, value: readonly number[]) => {
    const index = (y * size + x) * 4;
    data[index] = value[0];
    data[index + 1] = value[1];
    data[index + 2] = value[2];
    data[index + 3] = value[3];
  };

  const inTriangle = (
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    tx: number,
    ty: number,
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
  // La flecha es más estrecha que el anillo para que se lea fina y no una cuña.
  const arrow = {
    tip: [32, 1] as const,
    left: [27, 16.5] as const,
    right: [37, 16.5] as const,
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
        arrow.right[1] * scale,
      );

      if (inRing || inArrow) put(x, y, color);
    }
  }

  ctx.putImageData(image, 0, 0);
  return ctx.canvas;
}

export function createSkyCanvas(width = 8, height = 256): HTMLCanvasElement {
  const ctx = canvas2d(width, height);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#4f9ad4");
  gradient.addColorStop(0.45, "#8cc4e8");
  gradient.addColorStop(0.72, "#cfe8f6");
  gradient.addColorStop(1, "#f2f7ec");
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
  const palette = ["#3b2819", "#4d3420", "#5f4228", "#725031", "#89643d"];

  const plot = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(
      ((x % width) + width) % width,
      ((y % height) + height) % height,
      1,
      1,
    );
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
  ["#24491f", "#2f5f2c", "#3f7d3f", "#4d8f45", "#68a95a"],
  ["#244d28", "#356b38", "#4d8f45", "#5aa04e", "#79b86b"],
  ["#1f4527", "#2a5c30", "#3f7d3f", "#4a8a42", "#63a256"],
];

/**
 * Follaje pixel art para las bolas de las copas. La textura es 64x32 (2:1)
 * porque es el aspect ratio de las coordenadas UV de una esfera.
 */
export function createLeafCanvas(
  variant = 0,
  width = 64,
  height = 32,
): HTMLCanvasElement {
  const palette = LEAF_PALETTES[variant % LEAF_PALETTES.length];
  const random = mulberry32(0x1eaf + variant * 977);
  const ctx = canvas2d(width, height);

  const plot = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(
      ((x % width) + width) % width,
      ((y % height) + height) % height,
      1,
      1,
    );
  };

  const clumps = (
    count: number,
    rxMin: number,
    rxMax: number,
    ryMin: number,
    ryMax: number,
    color: string,
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
      palette[1 + Math.floor(random() * 4)],
    );
  }

  return ctx.canvas;
}

/**
 * Piedra marrón para las cordilleras: parches angulosos, grietas y motas, con
 * envoltura en los bordes para que el tile sea continuo al repetirse sobre los
 * picos. Misma técnica pixel art de parches y grietas, en tonos tierra.
 */
export function createMountainRockCanvas(size = 128): HTMLCanvasElement {
  const palette = ["#4a3424", "#5f452f", "#7a5a3e", "#997652", "#b89572"];
  const random = mulberry32(0x7b3a);
  const ctx = canvas2d(size);

  const plot = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(((x % size) + size) % size, ((y % size) + size) % size, 1, 1);
  };

  ctx.fillStyle = palette[1];
  ctx.fillRect(0, 0, size, size);

  // Parches angulosos de piedra, con bordes rectos y tonos variados.
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    const w = 4 + Math.floor(random() * 13);
    const h = 3 + Math.floor(random() * 9);
    const color =
      palette[random() < 0.4 ? 0 : random() < 0.5 ? 2 : random() < 0.5 ? 3 : 4];
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (random() > 0.32) plot(x + dx, y + dy, color);
      }
    }
  }

  // Grietas: recorridos de un píxel con alguna luz al lado.
  for (let i = 0; i < 12; i++) {
    let x = Math.floor(random() * size);
    let y = Math.floor(random() * size);
    const length = 14 + Math.floor(random() * 22);
    for (let k = 0; k < length; k++) {
      plot(x, y, palette[0]);
      if (random() < 0.35) plot(x + 1, y, palette[4]);
      x += random() < 0.7 ? 1 : -1;
      if (random() < 0.4) y += 1;
    }
  }

  // Motas y vetas claras.
  for (let i = 0; i < 900; i++) {
    plot(
      Math.floor(random() * size),
      Math.floor(random() * size),
      palette[random() < 0.55 ? 1 : random() < 0.7 ? 3 : 4],
    );
  }

  return ctx.canvas;
}

/**
 * Sillería gris para los muros: hiladas de bloques con junta oscura, tono
 * variable por bloque y un filo claro arriba. Las piezas que cruzan el borde se
 * dibujan también desplazadas un ancho para que el tile sea continuo.
 */
export function createWallStoneCanvas(size = 128): HTMLCanvasElement {
  const palette = ["#343940", "#474d55", "#5c636d", "#737b86", "#8f98a3"];
  const random = mulberry32(0x51a7);
  const ctx = canvas2d(size);

  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, size, size);

  const rowHeight = 16;
  const blockWidth = 32;
  const rows = Math.ceil(size / rowHeight);

  for (let row = 0; row < rows; row++) {
    const y = row * rowHeight;
    const offset = (row % 2) * (blockWidth / 2);
    for (let x = 0; x < size; x += blockWidth) {
      const bx = x + offset + 1;
      const by = y + 1;
      const bw = blockWidth - 2;
      const bh = rowHeight - 2;
      const color = palette[2 + Math.floor(random() * 3)];

      const drawBlock = (drawX: number) => {
        ctx.fillStyle = color;
        ctx.fillRect(drawX, by, bw, bh);
        ctx.fillStyle = palette[4];
        ctx.fillRect(drawX, by, bw, 1);
        ctx.fillStyle = palette[1];
        ctx.fillRect(drawX, by + bh - 1, bw, 1);
      };

      drawBlock(bx);
      // Repite la pieza al otro lado para que la textura envuelva sin costura.
      if (bx + bw > size) drawBlock(bx - size);
    }
  }

  // Motas y desgaste: pequeños puntos claros y oscuros sobre los bloques.
  for (let i = 0; i < 700; i++) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    ctx.fillStyle = palette[random() < 0.55 ? 1 : random() < 0.75 ? 4 : 0];
    ctx.fillRect(x, y, 1, 1);
  }

  return ctx.canvas;
}

export function createSoilCanvas(size = 128): HTMLCanvasElement {
  const random = mulberry32(99);
  const ctx = canvas2d(size);
  ctx.fillStyle = "#8a6644";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = random() * size;
    const y = random() * size;
    ctx.fillStyle = random() > 0.5 ? "#7a5a3b" : "#9c7852";
    ctx.globalAlpha = 0.5 + random() * 0.5;
    ctx.fillRect(x, y, 1 + random() * 3, 1 + random() * 3);
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = "#6b4e33";
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 1 + random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return ctx.canvas;
}
