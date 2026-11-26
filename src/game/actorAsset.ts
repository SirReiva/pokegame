import * as pc from 'playcanvas';
import { resolveAnimationName } from './animationTimeline';
import { CONFIG } from './config';
import {
  normalizeMarkers,
  usesActionLayer,
  type ClipInfo,
  type ClipLibrary,
  type ResolvedClip
} from './core/clipLibrary';
import { loadImage, type LoadedImage } from './imageLoader';
import {
  loadModelAsset,
  type ModelAsset,
  type ModelClip
} from './model';
import type {
  AnimationName,
  PokemonEntry
} from './types';

/**
 * Datos compartidos de un Pokémon jugable: manifiesto, retrato y modelo GLB.
 *
 * El manifiesto sigue siendo la fuente de verdad para el retrato y para la
 * escala de referencia. Los tiempos de gameplay salen de la `ClipLibrary` del
 * modelo 3D, que ya no depende de las duraciones de los sprites.
 */

export type LoadedPortrait = LoadedImage;

export interface ActorAsset {
  readonly entry: PokemonEntry;
  /** Clips 3D resueltos de la especie, con duración y marcadores. */
  readonly clips: ClipLibrary;
  /** Retrato 2D para la marca de KO; `null` si no se pudo cargar. */
  readonly portrait: LoadedPortrait | null;
  /** Modelo 3D de la especie. */
  readonly model: ModelAsset;
  /** Altura real del cuerpo 3D; la usan HUD, escudo y agua. */
  readonly height: number;
  /** Huella horizontal del cuerpo 3D (sombra de contacto). */
  readonly width: number;
}

/** Altura del frame `idle` en unidades de mundo (referencia de escala). */
function referenceWorldHeight(reference: PokemonEntry['reference']): number {
  return (
    reference.anchorY * CONFIG.sprite.pixelScale * CONFIG.sprite.verticalStretch
  );
}

/** Ancho del frame `idle` en unidades de mundo (referencia de escala). */
function referenceWorldWidth(reference: PokemonEntry['reference']): number {
  return reference.frameWidth * CONFIG.sprite.pixelScale;
}

/** Altura real del cuerpo 3D ya escalado, en unidades de mundo. */
export function actorWorldHeight(asset: Pick<ActorAsset, 'height'>): number {
  return asset.height;
}

/**
 * Orden de calentamiento de las animaciones: las básicas primero para que el
 * cuerpo aparezca cuanto antes durante la cuenta atrás.
 */
export const ACTOR_ANIMATION_ORDER: AnimationName[] = [
  'idle',
  'walk',
  'run',
  'attack',
  'hurt',
  'faint',
  'quickstrike',
  'shock',
  'shoot',
  'charge',
  'strike',
  'twirl',
  'shake',
  'punch',
  'hop'
];

/** `false` si el clip de casteo se reproduce con reloj manual. */
export function animationUsesLoop(name: AnimationName): boolean {
  return !usesActionLayer(name);
}

/**
 * Construye la biblioteca de clips de una especie a partir de los tracks del
 * GLB y de los marcadores del modelo.
 */
function buildClipLibrary(model: ModelAsset): ClipLibrary {
  const library: ClipLibrary = {};
  for (const [animation, clip] of Object.entries(model.clips) as Array<
    [AnimationName, ModelClip | undefined]
  >) {
    if (!clip) continue;
    const override =
      model.markers[animation] ?? model.markers[clip.name];
    library[animation] = {
      animation,
      duration: Math.max(0.0001, clip.track.duration),
      loop: override?.loop ?? clip.loop,
      markers: normalizeMarkers(override),
      rootMotion: override?.rootMotion ?? 'ignore'
    } satisfies ClipInfo;
  }
  return library;
}

/**
 * Clip de la biblioteca que se usa como reloj de gameplay para `name`. Es la
 * pieza que comparten los actores y el plan de casteo para leer las marcas del
 * clip resuelto, no del nombre pedido.
 */
export function resolveAnimationClip(
  asset: ActorAsset | null,
  name: AnimationName
): ResolvedClip | null {
  if (!asset) return null;
  const resolved = resolveAnimationName(name, (candidate) =>
    Boolean(asset.clips[candidate])
  );
  const clip = asset.clips[resolved];
  return clip ? { name: resolved, clip } : null;
}

async function loadPortrait(url: string): Promise<LoadedPortrait | null> {
  try {
    return await loadImage(url);
  } catch (error) {
    console.warn(`[modelo] No se pudo cargar el retrato ${url}`, error);
    return null;
  }
}

/**
 * Prepara una especie. El GLB y el retrato se comparten por especie.
 */
export async function loadActorAsset(
  app: pc.AppBase,
  entry: PokemonEntry,
  onProgress?: (fraction: number) => void
): Promise<ActorAsset> {
  const targetHeight = referenceWorldHeight(entry.reference);
  const targetWidth = referenceWorldWidth(entry.reference);

  const model = await loadModelAsset(
    app,
    entry,
    { height: targetHeight, width: targetWidth },
    onProgress
  );

  if (!model) {
    throw new Error(
      `No hay modelo 3D registrado para ${entry.name} (${entry.id}). ` +
        'Añádelo a public/models y a src/game/modelCatalog.ts.'
    );
  }

  const portrait = await loadPortrait(entry.portrait);

  return {
    entry,
    clips: buildClipLibrary(model),
    portrait,
    model,
    height: model.bounds.height * model.scale,
    width:
      Math.max(model.bounds.width, model.bounds.depth) * model.scale
  };
}

export function disposeActorAsset(asset: ActorAsset): void {
  asset.portrait?.close();
}
