import * as pc from 'playcanvas';
import { resolveAnimationName } from './animationTimeline';
import { DEG } from './config';
import type {
  ClipMarkerOverride,
  ClipMarkerTable
} from './core/clipLibrary';
import { modelEntryFor, type PokemonModelEntry } from './modelCatalog';
import { publicUrl } from './publicUrl';
import type { AnimationName, PokemonEntry } from './types';

/**
 * Carga de los GLB de Pokémon y traducción de sus clips a los nombres de
 * animación que usa el juego.
 *
 * Cada clip 3D aporta su duración real y unos marcadores semánticos. Los
 * marcadores pueden venir horneados en el GLB (`extras.newpoke.clips`) o en un
 * `clips.json` junto al modelo, que tiene prioridad para poder ajustarlos sin
 * reexportar.
 */

export interface ModelClip {
  /** Nombre original del clip en el GLB, para depurar. */
  name: string;
  track: pc.AnimTrack;
  /** Pista de si el clip está pensado para repetirse (sufijo `_loop`). */
  loop: boolean;
}

export interface ModelBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  width: number;
  height: number;
  depth: number;
}

/**
 * Caja de la pose de espera horneada en el GLB (`extras.newpoke.grounding`).
 *
 * Se mide al generar el atlas, con el clip `idle` en t = 0. El runtime solo
 * aplica estos valores: ninguna copia mide el apoyo por su cuenta, así que un
 * bot revelado tarde no puede quedarse con otra altura.
 */
export interface ModelGrounding {
  /** Punto más bajo de la pose, en unidades del GLB. */
  readonly minY: number;
  /** Punto más alto de la pose, en unidades del GLB. */
  readonly maxY: number;
}

export interface ModelAsset {
  readonly entryId: string;
  readonly asset: pc.Asset;
  readonly container: pc.ContainerResource;
  readonly clips: Partial<Record<AnimationName, ModelClip>>;
  /** Escala que hay que aplicar a la entidad instanciada. */
  readonly scale: number;
  /** Desplazamiento vertical para que la base del modelo apoye en y = 0. */
  readonly offsetY: number;
  /** Corrección de orientación, en radianes. */
  readonly yawOffset: number;
  readonly bounds: ModelBounds;
  /** Apoyo de la pose de espera; `null` en GLB sin hornear. */
  readonly grounding: ModelGrounding | null;
  /**
   * Marcadores por animación o por nombre de clip. El `clips.json` del modelo
   * sobrescribe los `extras` del GLB.
   */
  readonly markers: ClipMarkerTable;
}

export interface ModelTargetSize {
  /** Altura de referencia en unidades de mundo. */
  height: number;
  /** Ancho de referencia (frame del sprite `idle`). */
  width: number;
}

/**
 * Sufijos de clip por animación del juego, en orden de preferencia.
 *
 * Los GLB mezclan tres esquemas de nombres:
 * - rutinas de PMD con prefijo (`00030_walk01_loop`, `20030_walk01_loop`...);
 * - PMD sin prefijo (`fi20_walk01`, `ba20_buturi01`...);
 * - clips con hash (Onix) que no se pueden mapear y se ignoran.
 *
 * Algunos exportadores (Sketchfab) anteponen el nombre del armature y la
 * variante (`pm0725_11_00_00030_walk01_loop`); `stripSourcePrefix` los deja en
 * el esquema de rutina antes de mapearlos.
 */
const CLIP_PATTERNS: Readonly<Record<AnimationName, readonly string[]>> = {
  idle: [
    'defaultwait01_loop',
    'battlewait01_loop',
    'ba10_waitA01',
    'ba10_waitB01',
    'kw01_wait01',
    'fi01_wait01',
    'defaultidle01'
  ],
  // `walk` es el nombre interno del estado "en movimiento" en la simulación.
  // El cuerpo usa el trote (o la pose de vuelo en los pájaros, ver `mapClips`).
  walk: ['run01_loop', 'fi21_run01', 'walk01_loop', 'fi20_walk01'],
  // Clip de carrera reservado para habilidades concretas (Rodada). Si la
  // especie no lo trae, `resolveAnimationName` cae al clip de caminar.
  run: ['run01_loop', 'fi21_run01'],
  attack: ['attack01', 'ba20_buturi01'],
  hurt: ['damage01', 'ba30_damageS01', 'damage02'],
  faint: ['down01_start', 'ba41_down01', 'down01_loop'],
  quickstrike: ['attack02', 'attack01', 'ba20_buturi01'],
  shock: ['rangeattack01', 'ba21_tokusyu01', 'rangeattack02_loop', 'ba21_tokusyu02'],
  shoot: ['rangeattack01', 'ba21_tokusyu01', 'rangeattack02_start'],
  charge: ['rangeattack02_loop', 'rangeattack02_start', 'ba21_tokusyu02', 'ba21_tokusyu01'],
  strike: ['attack02', 'attack01', 'ba20_buturi01'],
  twirl: ['attack02', 'ba20_buturi01', 'attack01'],
  shake: ['stun01_loop', 'stun01_start', 'ba30_damageS01', 'damage01'],
  punch: ['attack01', 'ba20_buturi01', 'attack02'],
  hop: ['jumpup01_start', 'land02', 'ba01_landA01', 'landA01'],
  // Paso de desplazamiento completo (`00145` → `00146` → `00147`). Se usa como
  // animación compuesta en habilidades que giran o se desplazan en el sitio.
  stepoutStart: ['stepout01_start'],
  stepout: ['stepout01'],
  stepoutEnd: ['stepout01_end']
};

/** Quita el sufijo de duplicado de Blender (`.001`). */
function withoutDuplicate(name: string): string {
  return name.replace(/\.\d{3}$/, '');
}

/**
 * Quita el prefijo de exportador tipo `pm0725_11_00_` que añaden algunos GLB
 * (Sketchfab). Los segmentos numéricos se limitan a 1-3 dígitos para no comerse
 * el prefijo de rutina de cinco dígitos (`00030_walk01_loop`).
 */
function stripSourcePrefix(name: string): string {
  return withoutDuplicate(name).replace(/^pm\d{4}(?:_\d{1,3})*_/i, '');
}

/** Quita el prefijo de rutina (`00000_`, `10000_`, `20000_`) si existe. */
function clipSuffix(name: string): string {
  return withoutDuplicate(name).replace(/^\d{5}_/, '');
}

/** Rango de la rutina: sin prefijo (PMD) va primero, luego 00000, 10000... */
function routineRank(name: string): number {
  const match = /^(\d{5})_/.exec(withoutDuplicate(name));
  return match ? Number(match[1]) : -1;
}

function clipVariants(
  tracks: ReadonlyArray<{ name: string; track: pc.AnimTrack }>,
  suffix: string
): Array<{ name: string; track: pc.AnimTrack }> {
  return tracks
    .filter((candidate) => clipSuffix(candidate.name) === suffix)
    .sort((a, b) => {
      const rank = routineRank(a.name) - routineRank(b.name);
      return rank !== 0 ? rank : a.name.localeCompare(b.name);
    });
}

function mapClips(
  tracks: ReadonlyArray<{ name: string; track: pc.AnimTrack }>,
  entry: PokemonModelEntry
): Partial<Record<AnimationName, ModelClip>> {
  const clips: Partial<Record<AnimationName, ModelClip>> = {};
  for (const [animation, patterns] of Object.entries(CLIP_PATTERNS) as Array<
    [AnimationName, readonly string[]]
  >) {
    for (const suffix of patterns) {
      const candidate = clipVariants(tracks, suffix)[0];
      if (!candidate) continue;
      clips[animation] = {
        name: candidate.name,
        track: candidate.track,
        loop: /_loop$/.test(candidate.name)
      };
      break;
    }
  }

  // Los pájaros no trotan: se desplazan con su pose de vuelo (`defaultidle01`).
  // Se conserva el estado `walk` para no tocar la simulación; solo cambia el
  // clip que reproduce el cuerpo.
  if (entry.moveClip) {
    const exact = tracks.find(
      (candidate) => withoutDuplicate(candidate.name) === entry.moveClip
    );
    if (exact) {
      clips.walk = {
        name: exact.name,
        track: exact.track,
        loop: true
      };
    }
  } else if (entry.moveAnimation === 'idle1') {
    const hover = clipVariants(tracks, 'defaultidle01')[0];
    if (hover) {
      clips.walk = {
        name: hover.name,
        track: hover.track,
        loop: true
      };
    }
  }

  // Último recurso: si el GLB no tiene ninguno de los nombres esperados, se usa
  // el primer clip válido como idle para no dejar al actor en T-pose.
  if (!clips.idle) {
    const first = tracks.find((track) => track.track?.duration > 0);
    if (first) {
      clips.idle = {
        name: first.name,
        track: first.track,
        loop: /_loop$/.test(first.name)
      };
    }
  }
  return clips;
}

interface GlbAnimationInfo {
  animationNames: string[];
  bounds: ModelBounds | null;
  grounding: ModelGrounding | null;
  markers: ClipMarkerTable;
}

function readMarkerNumber(value: unknown): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(1, Math.max(0, number));
}

/**
 * Normaliza una tabla de marcadores. Acepta tanto `{ attack: { impact } }`
 * como `{ clips: { attack: { impact } } }`.
 */
function readMarkerTable(raw: unknown): ClipMarkerTable {
  if (!raw || typeof raw !== 'object') return {};
  const record = raw as Record<string, unknown>;
  const source =
    record.clips && typeof record.clips === 'object'
      ? (record.clips as Record<string, unknown>)
      : record;

  const table: ClipMarkerTable = {};
  for (const [key, value] of Object.entries(source)) {
    if (!value || typeof value !== 'object') continue;
    const data = value as Record<string, unknown>;
    const marker: ClipMarkerOverride = {};
    const impact = readMarkerNumber(data.impact);
    const followThrough = readMarkerNumber(data.followThrough);
    const release = readMarkerNumber(data.release);
    if (impact !== undefined) marker.impact = impact;
    if (followThrough !== undefined) marker.followThrough = followThrough;
    if (release !== undefined) marker.release = release;
    if (data.loop === true || data.loop === false) marker.loop = data.loop;
    if (data.rootMotion === 'ignore' || data.rootMotion === 'keep') {
      marker.rootMotion = data.rootMotion;
    }
    if (Object.keys(marker).length > 0) table[key] = marker;
  }
  return table;
}

function mergeMarkerTables(
  base: ClipMarkerTable,
  override: ClipMarkerTable
): ClipMarkerTable {
  const result: ClipMarkerTable = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = { ...result[key], ...value };
  }
  return result;
}

/** Caja de apoyo horneada por `tools/models/atlas-glb.mjs`. */
function readGrounding(json: {
  extras?: {
    newpoke?: {
      grounding?: {
        minY?: unknown;
        maxY?: unknown;
      };
    };
  };
}): ModelGrounding | null {
  const raw = json.extras?.newpoke?.grounding;
  if (!raw) return null;
  const minY = Number(raw.minY);
  const maxY = Number(raw.maxY);
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY < minY) {
    return null;
  }
  return { minY, maxY };
}

/** Lee el JSON embebido del GLB sin depender de la implementación del motor. */
function readGlbInfo(buffer: ArrayBuffer): GlbAnimationInfo {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12 || view.getUint32(0, true) !== 0x46546c67) {
    return { animationNames: [], bounds: null, grounding: null, markers: {} };
  }

  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (type === 0x4e4f534a) {
      try {
        const json = JSON.parse(
          new TextDecoder().decode(new Uint8Array(buffer, offset + 8, length))
        ) as {
          animations?: Array<{ name?: string }>;
          accessors?: Array<{
            min?: number[];
            max?: number[];
          }>;
          meshes?: Array<{
            primitives?: Array<{ attributes?: Record<string, number> }>;
          }>;
          extras?: {
            newpoke?: {
              grounding?: {
                minY?: unknown;
                maxY?: unknown;
              };
              clips?: unknown;
            };
          };
        };
        return {
          animationNames: (json.animations ?? []).map(
            (animation) => animation.name ?? ''
          ),
          bounds: readBounds(json),
          grounding: readGrounding(json),
          markers: readMarkerTable(json.extras?.newpoke?.clips)
        };
      } catch {
        return { animationNames: [], bounds: null, grounding: null, markers: {} };
      }
    }
    offset += 8 + length;
  }
  return { animationNames: [], bounds: null, grounding: null, markers: {} };
}

/**
 * Caja de la pose base a partir de los accessors de posición del glTF.
 *
 * Se ignoran las transformaciones de nodo: el atlas hornea la escala de bind en
 * `POSITION` cuando no es 1 (ver `tools/models/atlas-glb.mjs`), así que en los
 * GLB publicados el accessor ya está en unidades de mundo. Es solo una
 * referencia para escalar.
 */
function readBounds(json: {
  accessors?: Array<{ min?: number[]; max?: number[] }>;
  meshes?: Array<{ primitives?: Array<{ attributes?: Record<string, number> }> }>;
}): ModelBounds | null {
  const accessors = json.accessors ?? [];
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const index = primitive.attributes?.POSITION;
      if (index === undefined) continue;
      const accessor = accessors[index];
      if (!accessor?.min || !accessor.max) continue;
      minX = Math.min(minX, accessor.min[0]);
      minY = Math.min(minY, accessor.min[1]);
      minZ = Math.min(minZ, accessor.min[2]);
      maxX = Math.max(maxX, accessor.max[0]);
      maxY = Math.max(maxY, accessor.max[1]);
      maxZ = Math.max(maxZ, accessor.max[2]);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    width: Math.max(0.001, maxX - minX),
    height: Math.max(0.001, maxY - minY),
    depth: Math.max(0.001, maxZ - minZ)
  };
}

/**
 * Escala que conserva el tamaño relativo del sprite sin deformar modelos largos
 * (Onix, Gyarados, Rayquaza). Se combina la escala por altura con la escala por
 * huella horizontal mediante una media geométrica: los modelos compactos mandan
 * por altura y las serpientes no se convierten en rascacielos.
 */
function computeScale(
  bounds: ModelBounds,
  target: ModelTargetSize,
  entry: { scale?: number }
): number {
  const footprint = Math.max(bounds.width, bounds.depth);
  const byHeight = target.height / bounds.height;
  const byWidth = target.width / Math.max(0.001, footprint);
  const scale = Math.sqrt(byHeight * byWidth) * (entry.scale ?? 1);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** Descarga el GLB con progreso real y lo entrega como blob local. */
async function fetchModelBlob(
  url: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${url} (HTTP ${response.status})`);
  }

  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) {
    return new Blob([await response.arrayBuffer()], {
      type: 'model/gltf-binary'
    });
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.(received, total);
  }
  return new Blob(chunks as BlobPart[], { type: 'model/gltf-binary' });
}

/** Ruta del `clips.json` que acompaña al GLB. */
function clipMarkerUrl(file: string): string {
  const slash = file.lastIndexOf('/');
  const directory = slash >= 0 ? file.slice(0, slash) : '';
  return publicUrl(`models/${directory ? `${directory}/` : ''}clips.json`);
}

/** Lee los marcadores del sidecar; un 404 significa "sin overrides". */
async function loadClipMarkerSidecar(url: string): Promise<ClipMarkerTable> {
  try {
    const response = await fetch(url);
    if (!response.ok) return {};
    return readMarkerTable(await response.json());
  } catch {
    return {};
  }
}

function loadContainerAsset(
  app: pc.AppBase,
  blob: Blob
): Promise<pc.Asset> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    app.assets.loadFromUrl(url, 'container', (error, asset) => {
      URL.revokeObjectURL(url);
      if (error || !asset) {
        reject(
          new Error(
            `PlayCanvas no pudo procesar el GLB. ${error ?? 'Asset vacío'}`
          )
        );
        return;
      }
      resolve(asset);
    });
  });
}

/**
 * Carga el modelo de una especie y prepara su tabla de clips.
 *
 * Devuelve `null` si la especie no está registrada en el catálogo. Los fallos
 * de red o de parseo se propagan para que la pantalla de carga avise en vez de
 * empezar una partida sin cuerpos.
 */
export async function loadModelAsset(
  app: pc.AppBase,
  entry: PokemonEntry,
  target: ModelTargetSize,
  onProgress?: (fraction: number) => void
): Promise<ModelAsset | null> {
  const modelEntry = modelEntryFor(entry.id);
  if (!modelEntry) return null;

  const url = publicUrl(`models/${modelEntry.file}`);
  const [blob, sidecarMarkers] = await Promise.all([
    fetchModelBlob(url, (loaded, total) => {
      if (total > 0) onProgress?.(Math.min(1, loaded / total));
    }),
    loadClipMarkerSidecar(clipMarkerUrl(modelEntry.file))
  ]);
  const buffer = await blob.arrayBuffer();
  const info = readGlbInfo(buffer);

  const asset = await loadContainerAsset(app, blob);
  const container = asset.resource as pc.ContainerResource;
  const animationAssets = container.animations ?? [];
  const tracks = animationAssets.map((animationAsset, index) => ({
    name: stripSourcePrefix(
      info.animationNames[index] ?? animationAsset.name ?? `clip-${index}`
    ),
    track: animationAsset.resource as pc.AnimTrack
  }));
  const validTracks = tracks.filter(
    (candidate) => candidate.track && candidate.track.duration > 0
  );

  if (validTracks.length === 0) {
    disposeLoadedAsset(app, asset);
    throw new Error(`El modelo de ${entry.name} no contiene animaciones.`);
  }

  const clips = mapClips(validTracks, modelEntry);
  const bounds = info.bounds ?? {
    minX: -0.5,
    minY: 0,
    minZ: -0.5,
    maxX: 0.5,
    maxY: 1,
    maxZ: 0.5,
    width: 1,
    height: 1,
    depth: 1
  };
  const scale = computeScale(bounds, target, modelEntry);

  return {
    entryId: entry.id,
    asset,
    container,
    clips,
    scale,
    offsetY: -bounds.minY * scale,
    yawOffset: (modelEntry.yawOffsetDeg ?? 0) * DEG,
    bounds,
    grounding: info.grounding,
    markers: mergeMarkerTables(info.markers, sidecarMarkers)
  };
}

function disposeLoadedAsset(app: pc.AppBase, asset: pc.Asset): void {
  const resource = asset.resource as unknown as {
    animations?: pc.Asset[];
    materials?: pc.Asset[];
    renders?: pc.Asset[];
    textures?: pc.Asset[];
  } | null;
  if (resource) {
    for (const subAsset of [
      ...(resource.animations ?? []),
      ...(resource.materials ?? []),
      ...(resource.renders ?? []),
      ...(resource.textures ?? [])
    ]) {
      subAsset.unload();
      app.assets.remove(subAsset);
    }
  }
  asset.unload();
  app.assets.remove(asset);
}

export function disposeModelAsset(app: pc.AppBase, model: ModelAsset): void {
  disposeLoadedAsset(app, model.asset);
}

/** Clip resuelto del modelo, aplicando los mismos fallbacks que el billboard. */
export function resolveModelClip(
  model: ModelAsset,
  name: AnimationName
): { animation: AnimationName; clip: ModelClip } | null {
  const resolved = resolveAnimationName(name, (candidate) =>
    Boolean(model.clips[candidate])
  );
  const clip = model.clips[resolved];
  return clip ? { animation: resolved, clip } : null;
}
