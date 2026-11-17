/**
 * Velocidad base de movimiento (u/s) y hurtbox de cada Pokémon jugable, por id
 * de Pokédex. Cada compañero se mueve a un ritmo propio: los ligeros corren más
 * y los pesados avanzan más despacio.
 *
 * La velocidad se lee de `POKEDEX_PROFILES` (es la estadística VEL de la ficha).
 * El hurtbox se cura aquí a mano porque no forma parte de las siete
 * estadísticas del rediseño.
 *
 * Vive fuera del manifiesto (`public/sprites/manifest.json`) porque ese archivo
 * lo regenera `pnpm sprites` desde PMD Sprite Collab y perdería los ajustes.
 */

import { CONFIG } from './config';
import { POKEDEX_PROFILES } from './core/pokedex';

/**
 * Velocidad de movimiento: se lee de `POKEDEX_PROFILES.stats.speed`. La tabla
 * antigua vivía aquí y se duplicaba con las estadísticas; ahora VEL tiene una
 * sola fuente en el núcleo.
 */

/** Velocidad de respaldo si aparece un Pokémon sin entrada en la tabla. */
export const DEFAULT_SPEED = 5.4;

export function speedForPokemon(id: string): number {
  return POKEDEX_PROFILES[id]?.stats.speed ?? DEFAULT_SPEED;
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
  '0059': 0.50, // Arcanine: cuadrúpedo grande; melena y cola no cuentan
  '0094': 0.44, // Gengar: cuerpo redondo y ancho
  '0100': 0.34, // Voltorb: una esfera pequeña
  '0133': 0.36, // Eevee: cuadrúpedo pequeño
  '0448': 0.42, // Lucario: bípedo esbelto
  '0658': 0.42, // Greninja: esbelto y muy rápido
  '0150': 0.44, // Mewtwo: alto pero estrecho; la cola no cuenta
  '0151': 0.36, // Mew: flota y su cuerpo real es pequeño
  '0095': 0.58, // Onix: enorme; el arte incluye cola y anillos
  '0123': 0.42, // Scyther: alas finas, manda el cuerpo
  '0130': 0.56, // Gyarados: cuerpo largo y ancho; la cola no cuenta
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
  '0382': 0.60, // Kyogre: cuerpo enorme, aunque la aleta caudal no cuenta
  '0383': 0.56, // Groudon: coloso bajo y ancho
  '0384': 0.58 // Rayquaza: serpiente alada; el círculo cubre el torso
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
