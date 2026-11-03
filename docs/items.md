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

- La recogida es automática al entrar en `pickupRadius + player.hitRadius` (el
  hurtbox de la especie, no el radio de movimiento global).
- `canPickup` se evalúa antes de consumir. Las pociones no se gastan con la vida
  completa.
- La recogida no atraviesa colliders (muros, rocas, árboles ni bases) y exige
  que el equipo vea el punto: un objeto oculto por la niebla o al otro lado de un
  obstáculo no se consume.
- Cada coordenada del mapa solo puede tener un objeto; `parsePickups` rechaza
  duplicados exactos. Si varios jugadores tocan el mismo objeto en el mismo
  frame, gana el vivo más cercano (empate: orden estable de la partida).
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
  si el equipo ve el objeto; si lo ve usado, lo descarta sin ir hasta él. La
  elección no comprueba línea de visión ni alcanzabilidad: un objeto oculto o
  inalcanzable puede hacerles perder tiempo.
- Cada partida reinicia los cooldowns (`PickupField.reset()`).

## Arte

`pnpm items:art` genera los PNG de Poción y Poción grande con
`scripts/generate-item-art.mjs`. El script dibuja en una rejilla lógica de píxel
art y codifica el PNG RGBA sin dependencias externas. Se pueden sustituir los
PNG por otro arte manteniendo los mismos nombres y transparencia. Los objetos
nuevos necesitan su propio arte: amplía el script o dibuja los dos PNG a mano.

## Hoja de ruta propuesta

Nada de esta sección está implementado: es el catálogo que se propone para
futuras versiones. Antes de añadir objetos conviene tener en cuenta el contrato
actual:

- `ItemResolveContext` solo expone `heal()` y `showHeal()`, así que cualquier
  efecto que no cure exige ampliarlo, junto con `PickupHandlers` en
  `pickups.ts` y los handlers que registra `game.ts`.
- El estado es global por objeto, no por equipo.
- `bot.ts` puntúa los objetos solo por curación (`pickupTarget`, umbral del 70%
  de vida): un buff sin puntuación propia será ignorado por la IA.
- El editor recorre `ITEM_IDS`, así que un objeto nuevo aparece solo en la
  paleta de objetos.
- Los objetos de esta lista usan `healHp: 0` salvo los de la fase 1.

### Fase 1 · solo catálogo

Se resuelven con `healingItem` y no requieren tocar nada más que `items.ts`, dos
PNG y el array `pickups` de los mapas.

| Objeto | Efecto | Cooldown | Nota de diseño |
| --- | --- | --- | --- |
| Baya Aranja | 30 PV | 12 s | Sustain barato y frecuente en los carriles. |
| Baya Zidra | 25% de la vida máxima | 35 s | Escala con los tanques; usa `player.maxHp` en `resolve`. |
| Poción Máxima | 200 PV, solo por debajo del 50% de vida | 60 s | El umbral va en `canPickup`; objeto de remontada. |

### Fase 2 · contrato ampliado

Reutilizan `ActiveBuff`, `BuffStat` y `slowEffects`, que ya existen para las
habilidades. La ampliación mínima del contexto sería:

```ts
buff(stat: BuffStat, multiplier: number, duration: number): void;
cleanseSlows(): void;
reduceCooldowns(fraction: number): void;
showText(text: string, color: string): void;
```

| Objeto | Efecto | Cooldown | Nota de diseño |
| --- | --- | --- | --- |
| Pañuelo Elegido | +30% de velocidad durante 20 s | 30 s | Cuidado con Greninja y Voltorb; tope recomendado +30%. |
| Cinta Fuerte | +25% de ataque físico durante 20 s | 30 s | Sesgado a físicos; alternativa: +20% a ambos ataques. |
| Gafas Especiales | +25% de ataque especial durante 20 s | 30 s | Equivalente para especiales. |
| Chaleco Asalto | +30% de defensa especial durante 20 s | 30 s | Buen contra Mewtwo, Gengar y Articuno. |
| Baya Ziuela | Limpia todas las ralentizaciones | 20 s | Solo útil contra el control; muy legible. |
| Éter | Reduce un 50% los enfriamientos actuales | 45 s | Evita el doble definitiva de un reinicio completo. |
| Proteína / Hierro | +10% permanente a un stat hasta morir | Una vez por partida | Requiere recalcular stats y resetearlos al morir. |

### Fase 3 · hooks de daño y muerte

| Objeto | Efecto | Cooldown | Dificultad |
| --- | --- | --- | --- |
| Banda Focus | Sobrevives a un golpe letal con 1 PV (una vez) | 60 s | Media: bandera en `MatchPlayerState` y chequeo en la fase de daño. |
| Casco Dentado | Devuelve un 15% del daño melee recibido durante 20 s | 40 s | Media: buff `reflect` y hook en el daño. |
| Pluma Fénix | Al morir, reapareces en 1 s (una vez por partida) | — | Media: hook en el flujo de KO y respawn. |
| Revivir | Reduce un 50% el respawn del aliado caído más cercano | 60 s | Media: necesita acceso a la lista de jugadores, no solo al que recoge. |

### Fase 4 · cambios de diseño mayores

- **Mochila**: recoger guarda el objeto (un slot) y se usa con un botón. Resuelve
  el desperdicio de pociones y habilita objetos tácticos. Toca input, HUD, bots
  y `pickups.ts`.
- **Objetos de equipo**: altar o tótem que da un buff a todo el equipo al
  capturarlo. Hoy el estado es global; habría que hacerlo por equipo.
- **Trampas**: red invisible que ralentiza un 60% durante 1,5 s. Requiere estado
  y visibilidad por equipo.
- **Objetivo de mapa**: huevo o bandera que se transporta a la base; es más un
  modo de juego que un objeto.
- **Objetos con cargas compartidas**: tres usos por equipo para convertir las
  zonas en disputadas sin inundar el mapa.

### Orden recomendado

1. Baya Aranja, Baya Zidra y Poción Máxima, con el umbral de vida en
   `canPickup`.
2. Pañuelo Elegido y Baya Ziuela, que obligan a exponer `buff()` y
   `cleanseSlows()` y son los de mayor impacto táctico.
3. Banda Focus, como primer objeto con hook de daño.
4. Mochila, solo si se quiere que los objetos dejen de ser automáticos.

### Reglas de balance

- Máximo dos o tres objetos por mitad del mapa.
- Las curas deben seguir siendo contestables por la niebla.
- Los buffs de velocidad llevan tope para no romper a las especies más rápidas.
- Actualizar `pickupTarget` en `bot.ts` para que la IA no camine hacia un buff
  que no sabe usar.
