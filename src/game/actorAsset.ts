import * as pc from 'playcanvas';
import { resolveAnimationName } from './animationTimeline';
import { CONFIG } from './config';
import { loadImage, type LoadedImage } from './imageLoader';
import { loadModelAsset, type ModelAsset } from './model';
import type {
  AnimationName,
  PokemonEntry,
  PokemonSkin,
  ResolvedAnimation
} from './types';

/**
 * Datos compartidos de un Pokémon jugable: manifiesto, retrato y modelo GLB.
 *
 * El manifiesto sigue siendo la fuente de verdad para los tiempos de gameplay
 * (duración de cada clip y marcadores `Rush`/`Hit`/`Return`) y para la altura de
 * referencia. Las texturas de las hojas de sprite ya no se cargan: el cuerpo se
 * dibuja con el modelo 3D.
 */

export type LoadedPortrait = LoadedImage;

export interface ActorAsset {
  readonly entry: PokemonEntry;
  readonly skin: PokemonSkin;
  /** Retrato 2D para la marca de KO; `null` si no se pudo cargar. */
  readonly portrait: LoadedPortrait | null;
  /** Modelo 3D de la especie. */
  readonly model: ModelAsset;
  /** Altura real del cuerpo 3D; la usan HUD, escudo y agua. */
  readonly height: number;
  /** Huella horizontal del cuerpo 3D (sombra de contacto). */
  readonly width: number;
}

/** Altura del sprite `idle` en unidades de mundo (referencia de escala). */
function referenceWorldHeight(skin: PokemonSkin): number {
  const idle = skin.animations.idle;
  const anchorY = idle.anchors[0]?.y ?? idle.frameHeight * 0.75;
  return anchorY * CONFIG.sprite.pixelScale * CONFIG.sprite.verticalStretch;
}

/** Ancho del frame `idle` en unidades de mundo (referencia de escala). */
function referenceWorldWidth(skin: PokemonSkin): number {
  return skin.animations.idle.frameWidth * CONFIG.sprite.pixelScale;
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

/**
 * Clip del manifiesto que se usa como reloj de gameplay para `name`. Es la
 * pieza que comparten los actores y el plan de casteo para leer los `HitFrame`
 * del clip resuelto, no del nombre pedido.
 */
export function resolveAnimationClip(
  asset: ActorAsset | null,
  name: AnimationName
): ResolvedAnimation | null {
  if (!asset) return null;
  const resolved = resolveAnimationName(name, (candidate) =>
    Boolean(asset.skin.animations[candidate])
  );
  const animation = asset.skin.animations[resolved];
  return animation ? { name: resolved, animation } : null;
}

async function loadPortrait(url: string): Promise<LoadedImage | null> {
  try {
    return await loadImage(url);
  } catch (error) {
    console.warn(`[modelo] No se pudo cargar el retrato ${url}`, error);
    return null;
  }
}

/**
 * Prepara el aspecto de una especie. El GLB se comparte por especie: los
 * aspectos alternativos de los sprites ya no se ofrecen porque solo existe un
 * modelo por Pokémon.
 */
export async function loadActorAsset(
  app: pc.AppBase,
  entry: PokemonEntry,
  skin: PokemonSkin,
  onProgress?: (fraction: number) => void
): Promise<ActorAsset> {
  const targetHeight = referenceWorldHeight(skin);
  const targetWidth = referenceWorldWidth(skin);

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

  const portrait = await loadPortrait(skin.portrait);

  return {
    entry,
    skin,
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
