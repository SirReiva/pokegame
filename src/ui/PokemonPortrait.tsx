import { publicUrl } from '../game/publicUrl';
import type { PokemonEntry, PokemonSkin } from '../game/types';

interface PokemonPortraitProps {
  entry: PokemonEntry;
  /** Aspecto alternativo; si se omite, se usa el retrato normal. */
  skin?: PokemonSkin | null;
  height?: number;
  className?: string;
  /** Deja que las clases de Tailwind controlen el tamaño (layouts fluidos). */
  fluid?: boolean;
}

/**
 * Retrato de PMD Sprite Collab para las interfaces HTML, opcionalmente con el
 * aspecto elegido. El mundo 3D sigue usando las hojas animadas del aspecto.
 */
export function PokemonPortrait({
  entry,
  skin = null,
  height = 64,
  className = '',
  fluid = false
}: PokemonPortraitProps) {
  return (
    <img
      src={publicUrl(skin?.portrait ?? entry.portrait)}
      alt={skin ? `${entry.name} · ${skin.name}` : entry.name}
      width={height}
      height={height}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`block object-contain select-none [image-rendering:pixelated] drop-shadow-[0_10px_14px_rgb(0_0_0/0.45)] ${className}`}
      style={fluid ? undefined : { width: height, height }}
    />
  );
}
