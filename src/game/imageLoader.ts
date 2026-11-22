import { publicUrl } from './publicUrl';

/**
 * Imagen ya decodificada para retratos y arte 2D del HUD.
 *
 * Se usa `ImageBitmap` (y no `HTMLImageElement`) porque WebGPU solo sube a
 * textura bitmaps, canvas y vídeo, y porque la decodificación ocurre fuera del
 * hilo principal.
 */
export type LoadedImage = ImageBitmap;

export async function loadImage(url: string): Promise<LoadedImage> {
  // El manifiesto puede traer rutas absolutas (`/sprites/...`); se adaptan al
  // `base` para que funcionen también bajo el subdirectorio de GitHub Pages.
  const resolved = publicUrl(url);
  const response = await fetch(resolved);
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${resolved} (HTTP ${response.status})`);
  }
  return createImageBitmap(await response.blob());
}
