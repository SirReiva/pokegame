import { publicUrl } from '../game/publicUrl';
import type { PokemonEntry } from '../game/types';

interface PokemonPortraitProps {
  entry: PokemonEntry;
  height?: number;
  className?: string;
  /** Deja que las clases de Tailwind controlen el tamaño (layouts fluidos). */
  fluid?: boolean;
}

/**
 * Retrato normal de PMD Sprite Collab para las interfaces HTML.
 * El mundo 3D sigue usando las hojas animadas desde `entry.animations`.
 */
export function PokemonPortrait({
  entry,
  height = 64,
  className = '',
  fluid = false
}: PokemonPortraitProps) {
  return (
    <img
      src={publicUrl(entry.portrait)}
      alt={entry.name}
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
