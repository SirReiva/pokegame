/**
 * Velocidad base de movimiento (u/s) de cada Pokémon jugable, por id de
 * Pokédex. Cada compañero se mueve a un ritmo propio: los ligeros corren más y
 * los pesados avanzan más despacio. Los valores están separados a propósito
 * para que el cambio se note al elegir Pokémon, sin que ninguno se sienta roto.
 *
 * Vive fuera del manifiesto (`public/sprites/manifest.json`) porque ese archivo
 * lo regenera `npm run sprites` desde PMD Sprite Collab y perdería los ajustes.
 */
export const POKEMON_SPEEDS: Record<string, number> = {
  '0001': 4.2, // Bulbasaur: el más lento del grupo
  '0004': 5.4, // Charmander: el ritmo de referencia
  '0007': 4.8, // Squirtle: algo más lento, pero constante
  '0025': 6.9, // Pikachu: muy rápido por sus sentidos eléctricos
  '0133': 6.1, // Eevee: ágil y equilibrado
  '0448': 6.5, // Lucario: zancada larga, casi tan rápido como Pikachu
  '0658': 7.4, // Greninja: un ninja acuático, el más rápido hasta ahora
  '0150': 7.8, // Mewtwo: levita y se impulsa con poder psíquico, el más rápido
  '0151': 7.0, // Mew: pequeño y flotante, casi tan rápido como Greninja
  '0095': 4.6, // Onix: una serpiente de piedra enorme, avanza pesada
  '0123': 7.2 // Scyther: guadañas al viento, casi tan rápido como Greninja
};

/** Velocidad de respaldo si aparece un Pokémon sin entrada en la tabla. */
export const DEFAULT_SPEED = 5.4;

export function speedForPokemon(id: string): number {
  return POKEMON_SPEEDS[id] ?? DEFAULT_SPEED;
}
