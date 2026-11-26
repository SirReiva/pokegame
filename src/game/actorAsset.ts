import * as pc from 'playcanvas';
import { resolveAnimationName } from './animationTimeline';
import { CONFIG } from './config';
import { loadImage, type LoadedImage } from './imageLoader';
import { loadModelAsset, type ModelAsset } from './model';
import type {
  AnimationName,
  PokemonAnimations,
  PokemonEntry,
  PokemonReference,
  ResolvedAnimation
} from './types';

/**
 * Datos compartidos de un Pokémon jugable: manifiesto, retrato y modelo GLB.
 *
 * El manifiesto sigue siendo la fuente de verdad para los tiempos de gameplay
 * (duración de cada clip y marcadores `Rush`/`Hit`/`Return`) y para la altura de
 * referencia. Solo se carga el retrato: el cuerpo se dibuja con el modelo 3D.
 */

export type LoadedPortrait = LoadedImage;

export interface ActorAsset {
  readonly entry: PokemonEntry;
  /** Clips resueltos de la especie, con el fallback de `run`. */
  readonly animations: PokemonAnimations;
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
function referenceWorldHeight(reference: PokemonReference): number {
  return (
    reference.anchorY * CONFIG.sprite.pixelScale * CONFIG.sprite.verticalStretch
  );
}

/** Ancho del frame `idle` en unidades de mundo (referencia de escala). */
function referenceWorldWidth(reference: PokemonReference): number {
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

/**
 * Clips que el plan de casteo fija con `setManualFrame`: avanzan con el reloj
 * de la simulación y no con el `AnimComponent`, así que su estado se asigna sin
 * loop. Precargarlos con el modo correcto evita que el primer casteo reasigne
 * el estado (y pague otro `rebind`).
 */
const MANUAL_ANIMATIONS: ReadonlySet<AnimationName> = new Set([
  'run',
  'attack',
  'quickstrike',
  'shock',
  'shoot',
  'charge',
  'strike',
  'twirl',
  'shake',
  'punch',
  'hop'
]);

/** `false` si el clip se reproduce con reloj manual durante un casteo. */
export function animationUsesLoop(name: AnimationName): boolean {
  return !MANUAL_ANIMATIONS.has(name);
}

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
    Boolean(asset.animations[candidate])
  );
  const animation = asset.animations[resolved];
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
 * El manifiesto de PMD no trae un clip `run` propio: usa la caminata también
 * para correr. Las habilidades que piden `run` (por ejemplo, Rodada) reutilizan
 * la caminata como reloj de gameplay, mientras el cuerpo 3D usa su clip de
 * carrera real cuando el GLB lo tiene.
 */
function withRunAnimation(animations: PokemonAnimations): PokemonAnimations {
  if (animations.run || !animations.walk) return animations;
  return { ...animations, run: animations.walk };
}

/**
 * Prepara una especie. El GLB y el retrato se comparten por especie.
 */
export async function loadActorAsset(
  app: pc.AppBase,
  entry: PokemonEntry,
  onProgress?: (fraction: number) => void
): Promise<ActorAsset> {
  const animations = withRunAnimation(entry.animations);
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
    animations,
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
