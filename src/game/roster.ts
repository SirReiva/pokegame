/**
 * Velocidad base de movimiento (u/s) de cada Pokémon jugable, por id de
 * Pokédex. Cada compañero se mueve a un ritmo propio: los ligeros corren más y
 * los pesados avanzan más despacio. Los valores están separados a propósito
 * para que el cambio se note al elegir Pokémon, sin que ninguno se sienta roto.
 *
 * Vive fuera del manifiesto (`public/sprites/manifest.json`) porque ese archivo
 * lo regenera `pnpm sprites` desde PMD Sprite Collab y perdería los ajustes.
 */

import { CONFIG } from './config';

export const POKEMON_SPEEDS: Record<string, number> = {
  '0001': 4.2, // Bulbasaur: el más lento del grupo
  '0004': 5.4, // Charmander: el ritmo de referencia
  '0007': 4.8, // Squirtle: algo más lento, pero constante
  '0025': 6.9, // Pikachu: muy rápido por sus sentidos eléctricos
  '0094': 7.6, // Gengar: flota y se desliza, rápido y escurridizo
  '0100': 8.2, // Voltorb: rueda y detona, el más rápido del roster
  '0133': 6.1, // Eevee: ágil y equilibrado
  '0448': 6.5, // Lucario: zancada larga, casi tan rápido como Pikachu
  '0658': 7.4, // Greninja: un ninja acuático, el más rápido hasta ahora
  '0150': 7.8, // Mewtwo: levita y se impulsa con poder psíquico, el más rápido
  '0151': 7.0, // Mew: pequeño y flotante, casi tan rápido como Greninja
  '0095': 4.6, // Onix: una serpiente de piedra enorme, avanza pesada
  '0123': 7.2, // Scyther: guadañas al viento, casi tan rápido como Greninja
  '0248': 4.5, // Tyranitar: mole de roca y piel dura, avanza con paso implacable
  '0144': 6.8, // Articuno: planea con calma gélida, sin prisa pero sin pausa
  '0145': 7.6, // Zapdos: alas de tormenta, el ave legendaria más veloz
  '0146': 7.0, // Moltres: vuelo ardiente y constante
  '0243': 7.7, // Raikou: corre como un rayo, el más veloz de las bestias
  '0244': 7.2, // Entei: zancada poderosa de león volcánico
  '0245': 7.0, // Suicune: se desliza ligero, con la elegancia del agua
  '0249': 7.5, // Lugia: guardián de los mares, se impulsa con poder psíquico
  '0250': 6.9, // Ho-Oh: envergadura inmensa, arranque pausado
  '0251': 7.1, // Celebi: viaja en el tiempo con un vuelo juguetón
  '0383': 5.6 // Groudon: coloso de tierra, avanza con peso sísmico
};

/** Velocidad de respaldo si aparece un Pokémon sin entrada en la tabla. */
export const DEFAULT_SPEED = 5.4;

export function speedForPokemon(id: string): number {
  return POKEMON_SPEEDS[id] ?? DEFAULT_SPEED;
}

/**
 * Radio de impacto (hurtbox) de cada especie, en unidades de mundo.
 *
 * No se deriva del tamaño del sprite: los frames incluyen colas, alas y huecos
 * de animación que exagerarían el cuerpo real. La tabla está curada a mano y
 * usa el 0.42 de `CONFIG.player.radius` como referencia.
 *
 * Un radio grande es una desventaja en un juego de skillshots, así que los
 * valores altos se reservan para especies con HP/defensas que lo compensan.
 * `CONFIG.player.perPokemonHitbox` permite volver al radio único.
 */
export const POKEMON_HIT_RADIUS: Record<string, number> = {
  '0001': 0.42, // Bulbasaur: cuadrúpedo ancho y bajo
  '0004': 0.38, // Charmander: bípedo estrecho; la llama no cuenta
  '0007': 0.40, // Squirtle: pequeño, pero el caparazón da volumen
  '0025': 0.36, // Pikachu: cuerpo pequeño; orejas y cola no cuentan
  '0094': 0.44, // Gengar: cuerpo redondo y ancho
  '0100': 0.34, // Voltorb: una esfera pequeña
  '0133': 0.36, // Eevee: cuadrúpedo pequeño
  '0448': 0.42, // Lucario: bípedo esbelto
  '0658': 0.42, // Greninja: esbelto y muy rápido
  '0150': 0.44, // Mewtwo: alto pero estrecho; la cola no cuenta
  '0151': 0.36, // Mew: flota y su cuerpo real es pequeño
  '0095': 0.58, // Onix: enorme; el arte incluye cola y anillos
  '0123': 0.42, // Scyther: alas finas, manda el cuerpo
  '0248': 0.52, // Tyranitar: mole compacta y pesada
  '0144': 0.56, // Articuno: cuerpo grande; las puntas de las alas no cuentan
  '0145': 0.52, // Zapdos: envergadura más estrecha que Articuno
  '0146': 0.56, // Moltres: alas amplias y cuerpo central grande
  '0243': 0.52, // Raikou: bestia alargada
  '0244': 0.50, // Entei: cuadrúpedo ancho y voluminoso
  '0245': 0.50, // Suicune: cuadrúpedo grande pero esbelto
  '0249': 0.58, // Lugia: planeador enorme
  '0250': 0.58, // Ho-Oh: alas y cola largas; círculo sobre el torso
  '0251': 0.34, // Celebi: pequeño y flotante
  '0383': 0.56 // Groudon: coloso bajo y ancho
};

/** Radio de respaldo si una especie no tiene entrada en la tabla. */
export const DEFAULT_HIT_RADIUS = CONFIG.player.radius;

/**
 * Mayor hurtbox posible. Las telegrafías compartidas y la comprobación de golpe
 * de melee, haz y área usan este mismo radio: así todo el interior del aviso es
 * golpeable y el borde dibujado coincide con el límite real.
 */
export const MAX_HIT_RADIUS = Math.max(
  DEFAULT_HIT_RADIUS,
  ...Object.values(POKEMON_HIT_RADIUS)
);

/** Hurtbox de la especie, o el radio global si el ajuste está desactivado. */
export function hitRadiusForPokemon(id: string): number {
  if (!CONFIG.player.perPokemonHitbox) return CONFIG.player.radius;
  return POKEMON_HIT_RADIUS[id] ?? DEFAULT_HIT_RADIUS;
}

/** Radio que cubre a cualquier especie; lo comparten telegrafía y golpe. */
export function maxHitRadius(): number {
  return CONFIG.player.perPokemonHitbox ? MAX_HIT_RADIUS : CONFIG.player.radius;
}
