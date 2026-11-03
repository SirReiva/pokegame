/**
 * Catálogo de objetos recogibles.
 *
 * Un objeto se define aquí (imágenes, cooldown, radio y acción de resolución) y
 * cada mapa solo declara dónde aparece (`pickups` con `type`, `x` y `z`). Así se
 * pueden añadir mapas nuevos sin duplicar la definición del objeto.
 *
 * La acción de resolución recibe al jugador que lo recoge y la entrada del
 * Pokémon que controla (`PokemonEntry`), tal y como se acordó para poder añadir
 * objetos con efectos distintos a la curación.
 */

import type { MatchPlayerState } from './matchState';
import type { PokemonEntry } from './types';

export const ITEM_IDS = ['potion', 'superPotion'] as const;
export type ItemId = (typeof ITEM_IDS)[number];

/** Objeto colocado en un mapa, en coordenadas de mundo. */
export interface PickupSpawn {
  type: ItemId;
  x: number;
  z: number;
}

/** Datos que recibe `canPickup`. */
export interface ItemPickupContext {
  player: MatchPlayerState;
  pokemon: PokemonEntry;
}

/** Datos y utilidades que recibe la acción de resolución del objeto. */
export interface ItemResolveContext extends ItemPickupContext {
  /** Cura PV sin pasarse del máximo. Devuelve la cantidad realmente curada. */
  heal(amount: number): number;
  /** Muestra el número de curación sobre el jugador. */
  showHeal(amount: number): void;
}

export interface ItemDefinition {
  id: ItemId;
  name: string;
  description: string;
  /** Etiqueta corta para el editor y las listas compactas. */
  shortLabel: string;
  /** PNG del objeto disponible. */
  unusedImage: string;
  /** PNG que se muestra durante el cooldown. */
  usedImage: string;
  /** Segundos que el objeto permanece usado tras recogerse. */
  cooldownSeconds: number;
  /** Distancia (u) desde la que se puede recoger, sin contar el hurtbox del jugador. */
  pickupRadius: number;
  /** Altura del billboard en unidades de mundo. */
  height: number;
  /** PV que cura; 0 si el objeto no cura. */
  healHp: number;
  /** Color de referencia para el editor. */
  color: string;
  canPickup(context: ItemPickupContext): boolean;
  resolve(context: ItemResolveContext): void;
}

interface HealingItemOptions {
  id: ItemId;
  name: string;
  description: string;
  shortLabel: string;
  unusedImage: string;
  usedImage: string;
  cooldownSeconds: number;
  pickupRadius?: number;
  height: number;
  healHp: number;
  color: string;
}

/**
 * Objetos de curación. La comprobación de vida se hace antes de consumir: si el
 * Pokémon está al máximo, el objeto no se gasta y sigue disponible para otro.
 */
function healingItem(options: HealingItemOptions): ItemDefinition {
  return {
    ...options,
    pickupRadius: options.pickupRadius ?? 0.85,
    canPickup: ({ player }) =>
      player.alive && player.hp > 0 && player.hp < player.maxHp,
    resolve: (context) => {
      const healed = context.heal(options.healHp);
      if (healed > 0) context.showHeal(healed);
    }
  };
}

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
  potion: healingItem({
    id: 'potion',
    name: 'Poción',
    description: 'Restaura 50 PV al Pokémon que la recoge.',
    shortLabel: 'P',
    unusedImage: 'items/potion-unused.png',
    usedImage: 'items/potion-used.png',
    cooldownSeconds: 20,
    height: 0.85,
    healHp: 50,
    color: '#e63b4f'
  }),
  superPotion: healingItem({
    id: 'superPotion',
    name: 'Poción grande',
    description: 'Restaura 120 PV al Pokémon que la recoge.',
    shortLabel: 'P+',
    unusedImage: 'items/super-potion-unused.png',
    usedImage: 'items/super-potion-used.png',
    cooldownSeconds: 45,
    height: 1.1,
    healHp: 120,
    color: '#8a4dff'
  })
};

export function isItemId(value: unknown): value is ItemId {
  return typeof value === 'string' && (ITEM_IDS as readonly string[]).includes(value);
}

export function itemDefinition(id: string): ItemDefinition | null {
  return isItemId(id) ? ITEM_DEFINITIONS[id] : null;
}
