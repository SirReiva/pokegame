# Rendimiento de carga de mapas grandes

Análisis del bloqueo de la pestaña al cargar una partida en mapas grandes.

## Resumen

El bloqueo no viene de PlayCanvas ni del render 3D, sino de la **generación
síncrona de la textura del suelo** en el hilo principal. En el mapa de estrés
`perf-256` (256×256 celdas) se han medido **~20 s** solo en `paintTerrainZone`.

El coste escala con:

```
píxeles del bounding box de la zona × vértices del polígono × número de zonas
```

Como todo ocurre en una única tarea síncrona, el navegador no puede repintar la
pantalla de carga y la pestaña parece colgada.

## Medición

Medido en Chrome headless sobre los mapas reales del proyecto:

| Mapa | Tamaño | Textura | `setActiveMap` | `createGroundCanvas` |
| --- | --- | --- | --- | --- |
| arena | 76×76 | 1216 px | 9 ms | ~300 ms |
| laberinto | 128×128 | 2048 px | 10 ms | ~180 ms |
| perf-256 | 256×256 | 2828 px | 38 ms | **~20 400 ms** |

Separando el coste de `perf-256`:

| Caso | Tiempo |
| --- | --- |
| Sin pintar zonas (`zones: []`) | ~400 ms |
| Completo | **~20 400 ms** |
| Completo con textura reducida a 1414 px | ~5000 ms |

Conclusiones:

- **~20 s de los 20.4 s se van en `paintTerrainZone`.**
- `paintGridTiles` y el resto del canvas cuestan ~400 ms.
- Reducir la textura ayuda de forma cuadrática, pero no elimina el problema:
  a 1414 px siguen siendo ~5 s.

## Causa

Cadena de llamadas durante la carga de la partida:

1. `Game.applyMap()` llama a `buildWorld()` (`src/game/game.ts:743`).
2. `buildWorld()` genera el suelo con `createGroundCanvas(...)` de forma
   síncrona (`src/game/world.ts:321-331`).
3. `createGroundCanvas()` pinta la rejilla y después recorre todas las zonas
   (`src/game/textures.ts:844-847`).
4. `paintTerrainZone()` recorre el **rectángulo envolvente completo de cada
   zona en pasos de 4 px** (`src/game/textures.ts:284-298`). Por cada muestra:
   - llama a `zoneContains()`, que internamente hace `zoneSignedDistance()`;
   - vuelve a llamar a `zoneSignedDistance()` para el borde.
5. `zoneSignedDistance()` recorre **todos los vértices del polígono**
   (`src/game/terrain.ts:649-661`).
6. Los detalles vuelven a llamar a `zoneContainsInset()`
   (`src/game/textures.ts:300-312`) y la zona de fuego hace otro barrido
   completo del bounding box (`src/game/textures.ts:337`).

En `perf-256` esto supone:

- 25 zonas (`TERRAIN_ZONES.length`).
- 3050 vértices de polígono en total.
- ~10.2 M de píxeles de bounding boxes.
- Cientos de millones de operaciones y cientos de miles de `fillRect()`.

Todo dentro de una sola tarea, por lo que la UI no puede actualizarse.

## Soluciones

Ordenadas de mayor a menor impacto.

### 1. Eliminar los tests de polígono por píxel — aplicada

Implementada en `src/game/textures.ts`. Ahora `paintTerrainZone()`:

- rellena la zona con `ctx.fillRect()` sobre el bounding box y deja que
  `ctx.clip()` recorte la silueta;
- pinta el borde oscuro con `ctx.stroke()` y `lineWidth = edgeWorld * scale * 2`,
  recortado a la forma (la mitad interior del trazo es el borde);
- mantiene el grano de 4 px y los detalles, pero ya no llama a `zoneContains`
  ni a `zoneSignedDistance` por píxel;
- conserva el patrón de placas del fuego, sin comprobar pertenencia por píxel.

El `ctx.clip()` ya existía para los detalles; el problema era el bucle manual de
pertenencia y distancia.

### 2. Aprovechar la rejilla de tiles — aplicada

`paintGridTiles()` ya pinta la paleta base de cada celda, incluidos los
terrenos decorativos. Por eso `paintTerrainZone()` ya no vuelve a rellenar ni a
granear la zona completa: solo dibuja el borde y los detalles propios de su
tipo. Así se evita rasterizar cada zona una segunda vez.

Como efecto secundario positivo, los huecos interiores de una zona (por
ejemplo, un lago dentro de una región de escarcha) muestran ahora el terreno
real de la rejilla en lugar de quedar tapados por el relleno de la zona.

### 3. Limitar resolución y trabajo

- Bajar `maxTexels` de 8M a ~2M y/o `maxSize` de 8192 a 2048 en
  `groundTextureSize()` (`src/game/textures.ts:777-812`).
- Escalar el `step` de 4 px con el tamaño de la textura.

Útil como mitigación, pero insuficiente por sí sola: a 1414 px sigue tardando
~5 s en `perf-256`.

### 4. Mover la generación fuera del hilo principal

- Generar el canvas en un `Web Worker` con `OffscreenCanvas` y transferir un
  `ImageBitmap`.
- O dividir la generación en trozos con `await`/`requestAnimationFrame` entre
  zonas para que la UI pueda mostrar progreso.

Lo ideal es combinarlo con la solución 1.

### 5. Cachear el suelo por mapa — aplicada

`cachedGroundCanvas()` guarda el canvas pintado por `map.id` y tamaño en un
caché LRU con presupuesto de píxeles (`src/game/textures.ts`). La primera carga
sigue costando, pero volver a un mapa ya visitado evita el repintado procedural.
La textura de GPU se recrea porque pertenece al `World` de cada mapa.

### 6. Arreglos secundarios — aplicados

- `regionsForMask()` ya no usa `edges.indexOf()` dentro del encadenado de
  aristas: cada arista guarda su índice y el encadenado es O(E). Tampoco crea un
  array de vecinos por celda (`src/game/terrain.ts`).
- El hielo tiene un tope de instancias por zona
  (`MAX_ICE_CLUSTERS_PER_ZONE`, `src/game/world.ts`) como el resto de
  decoraciones.
- `BotNavGrid` recorre toda la rejilla al empezar la partida
  (`src/game/botNav.ts:110-121`). No es el bloqueo actual, pero añade tiempo en
  mapas grandes.
- `warmUpShaders()` y la construcción del mundo también son síncronos; si se
  quiere una carga totalmente fluida, conviene partirlos en fases.

## Resultado tras la optimización

Medición con el mismo benchmark y el mismo Chrome headless:

| Mapa | Antes | Punto 1 | Punto 1 + 2 |
| --- | --- | --- | --- |
| arena | ~300 ms | ~87 ms | ~86 ms |
| laberinto | ~180 ms | ~146 ms | ~138 ms |
| perf-256 | **~20 400 ms** | ~687 ms | **~614 ms** |

`perf-256` pasa de ~20 s a ~0.6 s, unas 33 veces más rápido. El aspecto del
suelo se conserva: relleno por celda, grano, borde oscuro y patrones por tipo de
terreno.

## Cómo reproducir la medición

El benchmark se hizo con una página temporal que:

1. carga el JSON del mapa;
2. llama a `setActiveMap(map)`;
3. calcula el tamaño con `groundTextureSize(map, { maxSize: 8192 })`;
4. mide `createGroundCanvas(size, { map, zones: TERRAIN_ZONES })`.

Se ejecutó en Chrome headless con CDP para obtener tiempos reales (sin
`--virtual-time-budget`, que falsea `performance.now`). Para aislar el coste de
las zonas se repitió la medición con `zones: []`.

## Prioridad recomendada

1. ~~Reescribir `paintTerrainZone` con relleno/trazo de Canvas (solución 1).~~
   Hecho.
2. ~~Usar la rejilla como base de las zonas decorativas (solución 2).~~ Hecho.
3. Si se quiere evitar cualquier bloqueo residual en equipos lentos, mover la
   generación a un worker o trocearla con `await` entre zonas.
4. ~~Arreglar `regionsForMask` y capar las instancias de hielo como limpieza
   preventiva.~~ Hecho.
5. Bajar el presupuesto de textura solo si hace falta más margen.
