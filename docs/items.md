# Objetos recogibles

Los objetos recogibles son billboards con dos estados (disponible y usado) que
reaparecen en el mismo sitio tras un cooldown. El catálogo vive en
`src/game/items.ts`; los mapas solo declaran dónde aparece cada uno.

## Formato del mapa

```json
"pickups": [
  { "type": "potion", "x": -9.5, "z": 9.5 },
  { "type": "superPotion", "x": 0, "z": 0 }
]
```

`type` debe existir en `ITEM_DEFINITIONS`. Las coordenadas son de mundo, como
las de `mountains` y `respawns`.

## Definición de un objeto

```ts
export interface ItemDefinition {
  id: ItemId;
  name: string;
  description: string;
  shortLabel: string;
  unusedImage: string; // PNG disponible
  usedImage: string;   // PNG durante el cooldown
  cooldownSeconds: number;
  pickupRadius: number;
  height: number;
  healHp: number;
  color: string;
  canPickup(context: ItemPickupContext): boolean;
  resolve(context: ItemResolveContext): void;
}
```

La acción de resolución recibe:

- `player`: `MatchPlayerState` (posición, vida, equipo, `pokemonId`...).
- `pokemon`: `PokemonEntry` del Pokémon que controla el jugador.
- `heal(amount)`: cura PV respetando el máximo y devuelve lo curado.
- `showHeal(amount)`: muestra el número de curación sobre el jugador.

Para crear un objeto nuevo:

1. Añade sus dos PNG a `public/items/`.
2. Añade su id a `ITEM_IDS` y su definición a `ITEM_DEFINITIONS`.
3. Usa ese id en el array `pickups` de los mapas o colócalo desde el editor.

## Comportamiento

- La recogida es automática al entrar en `pickupRadius + CONFIG.player.radius`.
- `canPickup` se evalúa antes de consumir. Las pociones no se gastan con la vida
  completa.
- El estado es global: un solo objeto compartido por todos los jugadores. Al
  recogerlo cambia a `usedImage`; al terminar `cooldownSeconds` vuelve a
  `unusedImage` en la misma posición.
- La niebla también los oculta. Cada viewport recibe una copia del billboard en
  su capa de render y solo se muestra si algún Pokémon vivo del equipo de esa
  vista ve el punto, con la ocultación del terreno y la línea de visión. Así en
  splitscreen un equipo puede verlo y el otro no.
- Los bots conocen las posiciones de todos los objetos desde el inicio de la
  partida, sin necesitar verlos, pero no su estado. Cuando bajan del 70% de vida
  eligen destino puntuando curación, distancia, peligro junto a la base enemiga
  y enemigos visibles en el trayecto. El estado usado/disponible solo se conoce
  si el equipo ve el objeto; si lo ve usado, lo descarta sin ir hasta él.
- Cada partida reinicia los cooldowns (`PickupField.reset()`).

## Arte

`pnpm items:art` genera los PNG de Poción y Poción grande con
`scripts/generate-item-art.mjs`. El script dibuja en una rejilla lógica de píxel
art y codifica el PNG RGBA sin dependencias externas. Se pueden sustituir los
PNG por otro arte manteniendo los mismos nombres y transparencia.
