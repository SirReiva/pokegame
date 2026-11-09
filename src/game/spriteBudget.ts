/**
 * Estimación del presupuesto de VRAM para las hojas de sprite.
 *
 * No existe una API web fiable para preguntar cuánta VRAM tiene la GPU. Lo que
 * sí se puede leer es el nombre del renderer (vía `WEBGL_debug_renderer_info`),
 * la RAM aproximada del sistema (`navigator.deviceMemory`, solo en Chromium) y
 * el límite real de textura del dispositivo. Con eso se clasifica la GPU en
 * tres tiers y se reparte un presupuesto total entre los sprites de la partida.
 *
 * Es una heurística: `CONFIG.sprite.textureBudgetMB > 0` la desactiva y fija
 * un presupuesto por aspecto.
 */

export type GpuTier = 'software' | 'integrated' | 'discrete' | 'unknown';

export interface SpriteBudget {
  tier: GpuTier;
  /** Nombre del renderer detectado; vacío si el navegador lo oculta. */
  renderer: string;
  /** MB totales estimados para todas las hojas de la partida. */
  totalMB: number;
  /** MB que puede usar cada combinación especie + aspecto. */
  perAssetMB: number;
  /** `true` si viene de `textureBudgetMB` y no de la heurística. */
  fixed: boolean;
}

/**
 * Presupuesto conservador cuando no hay forma de detectar la GPU o el sprite
 * se carga fuera de una partida (por ejemplo, desde una herramienta).
 */
export const FALLBACK_SPRITE_BUDGET_MB = 64;

/**
 * Presupuesto total para todas las hojas. En GPUs dedicadas sobra margen; en
 * integradas se comparte con el sistema, así que se reserva menos.
 */
const TIER_TOTAL_MB: Record<GpuTier, number> = {
  software: 128,
  integrated: 512,
  discrete: 768,
  unknown: 512
};

/**
 * Mínimo por aspecto. Con 64 MB el reparto nunca deja una hoja en ×1 (la hoja
 * más grande a ×2 ocupa ~26 MB). En software se acepta bajar más.
 */
const MIN_PER_ASSET_MB: Record<GpuTier, number> = {
  software: 24,
  integrated: 64,
  discrete: 64,
  unknown: 64
};

/**
 * Tope por aspecto para que una partida de 2 jugadores no se lleve cientos de
 * MB solo porque hay pocos sprites que cargar.
 */
const MAX_PER_ASSET_MB = 160;

/** En equipos justos se permite bajar a ×1 antes que forzar 64 MB por aspecto. */
function minPerAssetFor(tier: GpuTier, lowEnd: boolean): number {
  if (tier === 'software') return lowEnd ? 16 : 24;
  return lowEnd ? 32 : MIN_PER_ASSET_MB[tier];
}

function readDeviceMemoryGB(): number | null {
  if (typeof navigator === 'undefined') return null;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof memory === 'number' && Number.isFinite(memory) ? memory : null;
}

/**
 * Crea un contexto WebGL temporal solo para leer el renderer y lo libera en el
 * acto. En un entorno sin WebGL2 (WebGPU puro) devuelve cadena vacía y se usa
 * el tier `unknown`.
 */
function readRendererString(): string {
  if (typeof document === 'undefined') return '';
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return '';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '')
      : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return renderer;
  } catch {
    return '';
  }
}

function classifyRenderer(renderer: string): GpuTier {
  if (!renderer) return 'unknown';
  const name = renderer.toLowerCase();

  // Software primero: SwiftShader/llvmpipe también contienen "intel" o "amd"
  // en algunos drivers y no queremos clasificarlos como GPU real.
  if (
    /(swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic)/.test(
      name
    )
  ) {
    return 'software';
  }
  // Las dedicadas se comprueban antes que "intel", porque Intel Arc es dedicada.
  if (
    /(nvidia|geforce|rtx|gtx|quadro|tesla|radeon rx|radeon pro|firepro|intel arc|arc a\d)/.test(
      name
    )
  ) {
    return 'discrete';
  }
  if (
    /(intel|uhd|iris|hd graphics|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|apple|mali|adreno|powervr|arm)/.test(
      name
    )
  ) {
    return 'integrated';
  }
  return 'unknown';
}

/**
 * Calcula el presupuesto que se pasa a `loadSpriteAsset`.
 *
 * @param maxTextureSize Límite real del dispositivo (`device.maxTextureSize`).
 * @param assets Número de combinaciones especie + aspecto que se van a cargar.
 * @param overrideMB Si es > 0, se usa tal cual y no se detecta nada.
 */
export function detectSpriteBudget(
  maxTextureSize: number,
  assets: number,
  overrideMB = 0
): SpriteBudget {
  const renderer = readRendererString();

  if (overrideMB > 0) {
    return {
      tier: 'unknown',
      renderer,
      totalMB: Math.round(overrideMB * Math.max(1, assets)),
      perAssetMB: Math.round(overrideMB),
      fixed: true
    };
  }

  const tier = classifyRenderer(renderer);
  let totalMB = TIER_TOTAL_MB[tier];
  let lowEnd = false;

  // La RAM del sistema es una pista tosca. Chromium la capa a 8 GB, así que
  // solo se usa para castigar equipos claramente pequeños.
  const memoryGB = readDeviceMemoryGB();
  if (memoryGB !== null) {
    if (memoryGB <= 2) {
      totalMB *= 0.5;
      lowEnd = true;
    } else if (memoryGB <= 4) {
      totalMB *= 0.7;
      lowEnd = true;
    } else if (memoryGB <= 6) {
      totalMB *= 0.85;
    }
  }

  // Una GPU limitada a texturas de 2048 es antigua aunque el nombre suene bien.
  if (maxTextureSize < 4096) {
    totalMB *= 0.5;
    lowEnd = true;
  } else if (maxTextureSize < 8192) {
    totalMB *= 0.8;
  }

  const count = Math.max(1, assets);
  // En equipos con margen el mínimo puede hacer que el total real supere
  // `totalMB`; es deliberado: preferimos no volver a ×1.
  const minPerAssetMB = minPerAssetFor(tier, lowEnd);
  const perAssetMB = Math.round(
    Math.min(MAX_PER_ASSET_MB, Math.max(minPerAssetMB, totalMB / count))
  );

  return {
    tier,
    renderer,
    totalMB: Math.round(totalMB),
    perAssetMB,
    fixed: false
  };
}
