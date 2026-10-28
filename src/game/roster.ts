/**
 * Velocidad base de movimiento (u/s) de cada Pokémon jugable, por id de
 * Pokédex. Cada compañero se mueve a un ritmo propio: los ligeros corren más y
 * los pesados avanzan más despacio. Los valores están separados a propósito
 * para que el cambio se note al elegir Pokémon, sin que ninguno se sienta roto.
 *
 * Vive fuera del manifiesto (`public/sprites/manifest.json`) porque ese archivo
 * lo regenera `pnpm sprites` desde PMD Sprite Collab y perdería los ajustes.
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
  '0123': 7.2, // Scyther: guadañas al viento, casi tan rápido como Greninja
  '0144': 6.8, // Articuno: planea con calma gélida, sin prisa pero sin pausa
  '0145': 7.6, // Zapdos: alas de tormenta, el ave legendaria más veloz
  '0146': 7.0, // Moltres: vuelo ardiente y constante
  '0243': 7.7, // Raikou: corre como un rayo, el más veloz de las bestias
  '0244': 7.2, // Entei: zancada poderosa de león volcánico
  '0245': 7.0, // Suicune: se desliza ligero, con la elegancia del agua
  '0249': 7.5, // Lugia: guardián de los mares, se impulsa con poder psíquico
  '0250': 6.9, // Ho-Oh: envergadura inmensa, arranque pausado
  '0251': 7.1 // Celebi: viaja en el tiempo con un vuelo juguetón
};

/** Velocidad de respaldo si aparece un Pokémon sin entrada en la tabla. */
export const DEFAULT_SPEED = 5.4;

export function speedForPokemon(id: string): number {
  return POKEMON_SPEEDS[id] ?? DEFAULT_SPEED;
}
