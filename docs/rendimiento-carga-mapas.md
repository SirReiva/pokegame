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

### 3. Limitar resolución y trabajo — aplicada

- El presupuesto de téxeles es ahora `CONFIG.performance.groundTexturePixels`
  (`src/game/config.ts`), aplicado en `groundTextureSize()`
  (`src/game/textures.ts`). Por defecto 4 M: en `perf-256` la textura pasa de
  2828 a 2000 px (8 M → 4 M píxeles), mientras que los mapas pequeños no cambian
  porque ya van topados por su tamaño o por `maxPixelsPerUnit`.
- Efecto medido: el pintado baja ~20 % (515 → ~460 ms) y la memoria de la
  textura y su subida a la GPU se reducen a la mitad. No elimina el coste de las
  zonas, que depende de sus detalles más que de los píxeles.
- `maxSize` sigue limitado a `min(device.maxTextureSize, 8192)`. Si hiciera
  falta más margen, bajar `groundTexturePixels` a 2 M deja `perf-256` en
  1414 px.

### 4. Mover la generación fuera del hilo principal — aplicada (troceada)

La generación se hace con generadores que ceden el control cada
`GROUND_PAINT_BUDGET_MS` / `BUILD_WORLD_BUDGET_MS` (8 ms) mediante
`yieldToBrowser()` (`src/game/frameYield.ts`). Se trocea:

- el suelo por filas de la rejilla, zonas decorativas (incluido el barrido del
  fuego) y tandas de flores (`createGroundCanvasAsync`);
- la construcción del mundo por secciones, y dentro de las secciones pesadas
  (follaje instanciado, cristales de hielo, mariposas) cada 64 elementos
  (`buildWorldAsync`).

`yieldToBrowser()` usa `scheduler.yield()` cuando existe (Chrome) y cae a
`requestAnimationFrame` en el resto. La tarea más larga pasa de más de un
segundo a menos de 50 ms y la barra de carga puede mostrar progreso real. Las
versiones síncrona y asíncrona comparten los mismos pasos (`groundCanvasSteps`,
`buildWorldSteps`), así que el resultado es idéntico.

El mapa anterior sigue visible hasta que el nuevo está listo: `applyMap()`
genera el suelo y construye el mundo en una raíz aparte, y solo después destruye
el mundo anterior y engancha el nuevo. El mundo se construye con su mapa
explícito (`BuildWorldOptions.map`), sin tocar el estado global: `setActiveMap()`
se llama al final, cuando ya no queda ningún frame intermedio, así que el terreno
del mapa nuevo nunca se mezcla con la geometría del anterior. La cámara de menú
orbita el foco guardado (`menuFocus`) hasta el intercambio.

El mapa nuevo se construye con su mapa explícito aunque haya otro activo, así
que la base ya está preparada si algún día se quiere cambiar de mapa sin recrear
el motor. Comprobado en headless: mismos 140 colliders, mismos límites y misma
altura de agua que usando el estado global.

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
- `BotNavGrid` marca el agua profunda y los santuarios en un único barrido de la
  rejilla (`src/game/botNav.ts`); antes eran dos pasadas y dos consultas de
  terreno por celda.
- `warmUpShaders()` ya cede entre lotes de efectos. La construcción de
  entidades también está troceada con `buildWorldAsync()`; lo que queda síncrono
  son las operaciones cortas de escena (fog, luz ambiental) y la subida inicial
  de la textura del suelo a la GPU.

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

Con el pintado troceado (Chrome headless, `perf-256`, textura de 2828 px):

| Medición | Suelo | Mundo |
| --- | --- | --- |
| Versión síncrona | ~515 ms en una tarea | ~1142 ms en una tarea |
| Versión troceada | ~620 ms en tandas | ~1332 ms en tandas |
| Tarea más larga | **< 50 ms** | **< 50 ms** (sin `longtask`) |
| Píxeles distintos | **0** | — |

El coste total sube entre un 17 % y un 20 % por ceder el hilo, pero desaparecen
los bloqueos de medio segundo a casi dos segundos. La derivación de regiones
(`mapRegions`) tarda ~44 ms la primera vez y queda cacheada por mapa: el segundo
cambio al mismo mapa no la recalcula.

Con el presupuesto por defecto (4 M téxeles, 2000 px en `perf-256`) el pintado
baja a ~460-550 ms y la textura ocupa la mitad. Los mapas pequeños conservan su
resolución.

### Primer frame del mando nuevo — aplicada

El primer render de un mundo nuevo compila los shaders de todos sus materiales y
sube sus texturas. Medido en Chrome headless con WebGL por software: **~312 ms**
el primer render de un mundo pequeño y ~14 ms los siguientes; la textura del
suelo de 8 M px aporta unos 14 ms de esa primera subida.

Por eso `applyMap()` termina con `app.render()`: el coste se paga mientras la
pantalla de carga sigue visible, no en el primer frame de la partida si la intro
ya ha terminado. La subida en sí es una operación de GPU no troceable; baja a la
mitad con el presupuesto de 4 M.

`warmUpShaders()` cubre también los efectos que no salen de una habilidad:
calienta el aura, el pulso y la fractura de la armadura de casteo
(`buildWarmupCalls`), crea una marca de KO vacía en la capa de precarga, porque
su material (sin niebla, con `emissiveMap`/`opacityMap` y `alphaTest`) es una
variante que ningún efecto de combate compila, y dibuja un número de daño de
muestra para estrenar el material del atlas (`useFog = false`, texturado y con
`depthTest = false`). La recogida de objetos, el respawn y el revivir reutilizan
`spawnBuff`, que ya estaba en el warmup.

## Cómo reproducir la medición

El benchmark se hizo con una página temporal que:

1. carga el JSON del mapa;
2. calcula las regiones con `mapRegions(map)` (sin activar el mapa);
3. calcula el tamaño con `groundTextureSize(map, { maxTexels, maxSize: 8192 })`;
4. mide `createGroundCanvas(size, { map, zones })` (síncrono) y
   `createGroundCanvasAsync(size, { map, zones })` (troceado).
5. crea una app de PlayCanvas con WebGL por software y mide `buildWorld` frente
   a `buildWorldAsync` con la misma textura de suelo, incluyendo el primer
   `app.render()` para cuantificar la compilación de shaders y la subida.

Se ejecutó en Chrome headless con CDP para obtener tiempos reales (sin
`--virtual-time-budget`, que falsea `performance.now`). Para aislar el coste de
las zonas se repitió la medición con `zones: []`. La tarea más larga se midió con
`PerformanceObserver` (`entryTypes: ['longtask']`).

## Coste por frame

Con la carga ya resuelta, los cambios que reducen trabajo de cada frame son:

- **Resolución dinámica**: `dynamicResolution` ajusta `device.maxPixelRatio`
  con histéresis según el FPS. Solo se activa durante una partida jugable y no
  toca la simulación.
- **Copias ocultas**: `updateVision()` se resuelve antes de sincronizar las
  copias del splitscreen, así que las copias que la niebla oculta se saltan
  posición, animación, vida, XP y billboard. Antes se actualizaban todas.
- **Marcas de KO**: se busca al jugador con `playerBySlot` en vez de recorrer
  `matchPlayers` por marca y por vista.
- **Basura por frame**: se reutilizan los `Vec2`/`Quat`, los conjuntos de
  visibilidad y los mapas de conocimiento de objetos descritos en el README.
- **Filtrado anisotrópico** (`CONFIG.performance.anisotropy`, 8 por defecto) en
  el suelo, la tierra y el agua. Sin él, las líneas finas del terreno (grietas,
  losetas, guijarros) se ven como un peine vertical en los planos vistos en
  ángulo y **centellean** al caminar, porque cada frame muestrea un texel
  distinto. El coste medido es indistinguible (render p50 2,5 → 2,2 ms en una
  GTX 1060 a 1920×1080). El anillo del jugador pasó a filtrado lineal con
  mipmaps: con `NEAREST` sus bordes eran un punteado que también parpadeaba.

## Partículas ambientales: 82 emisores → 6 draw calls por vista — aplicada

Una grabación de perfil del navegador durante una partida real mostró que el
mayor coste de CPU no era el juego, sino los **emisores de partículas del mapa**
(polvo del desierto, brasas, humo, niebla, polen, chispas…).

Datos de la grabación (Chrome DevTools, servidor de desarrollo, 1 vista y 8
jugadores, 32 s):

- 1290 frames en 32 s → **~40 fps**; el callback de `requestAnimationFrame`
  tardaba **14,8 ms de media** (p95 26 ms).
- De ese tiempo, **16,5 s (94 %)** estaban dentro del tick de PlayCanvas y
  **~1,2 s (3,7 %)** en código del juego: `game.ts`, `bot.ts`, `botNav.ts`…
- El mapa tenía **82 emisores ambientales**. Cada `ParticleSystem` de PlayCanvas
  cuesta una **pasada `ParticleUpdate`** por paso de simulación (ping-pong de
  texturas en GPU), un **draw call por vista** y el mantenimiento de su emisor en
  CPU (`addTime`/`finishFrame`), aunque esté fuera de pantalla.

Primero se aplicó un presupuesto por distancia (60/20/8 Hz) que recortó la
simulación, pero **no los draw calls**: seguía habiendo uno por emisor y vista.
La solución final (`src/game/batchedParticles.ts`) agrupa las motas **por
tipo**: una malla y un material por tipo (9 posibles en total; 6 en `caldera`).
La deriva, el vaivén, el tamaño, el color y el alfa se calculan en el vertex
shader a partir de un único `uTime`; no hay simulación por emisor ni una pasada
de GPU por foco. El shader descarta las motas que quedan más allá del final de
la niebla, así que tampoco se paga su relleno.

Medido con la cámara fija en el spawn de `caldera` (Chrome, 1280×720, build de
desarrollo; los draw calls no dependen de la instrumentación del motor):

| Vistas | Draw calls con partículas | Sin partículas | Partículas antes | Partículas ahora |
| --- | --- | --- | --- | --- |
| 1 | 49 | 43 | 72 | **6** |
| 4 | 250 | 226 | ~253 | **24** |

El `renderTime` de desarrollo con 4 vistas baja a **5,9 ms** con partículas
encendidas (4,7 ms con los lotes ocultos); antes, apagar los 82 emisores ahorraba
253 draw calls y bajaba el `render` de 9,4 a 5,1 ms. El `update` de CPU ya no
recorre emisores: solo avanza un contador y actualiza la niebla de los materiales.

Decisiones de la implementación:

- La caja de emisión usa el mismo tamaño completo que `emitterExtents` de
  PlayCanvas, y las posiciones se sortean con un generador determinista sembrado
  por zona, así que el mapa se ve igual en cada carga.
- El vaivén sustituye a la turbulencia que aportaban las velocidades aleatorias
  de PlayCanvas; la vida se reparte con una fase aleatoria por mota (equivalente
  al `preWarm`).
- Los tipos aditivos (brasas, polen, chispas, fuegos fatuos) premultiplican el
  color por el alfa y usan `BLEND_ADDITIVE`, como el shader de partículas del
  motor; los normales usan alfa recto. La salida se codifica a sRGB igual que
  los materiales estándar.
- Un `MeshInstance.drawOrder` por tipo conserva el orden que tenían el humo y
  la niebla respecto a brasas y chispas.


### El servidor de desarrollo no sirve para medir FPS

La misma grabación exageraba el coste del motor porque `pnpm dev` carga la build
**de desarrollo** de PlayCanvas (`exports.development` del paquete), que añade
`Debug.call`, marcadores de GPU y los *scopes* de validación de WebGPU
(`pushErrorScope`/`popErrorScope`) **por cada pasada de render**. La build de
producción los elimina por completo (se puede comprobar con
`grep pushErrorScope dist/assets/*.js`).

Medido con la misma escena y resolución:

| | Tick de PlayCanvas (update + render) |
| --- | --- |
| Servidor de desarrollo (`pnpm dev`) | ~9,5 ms |
| Build de producción (`pnpm build`) | ~4,6 ms |

Por eso, para valorar los FPS hay que usar `pnpm build` + `pnpm preview` o la
app empaquetada; grabar el perfil sobre el servidor de desarrollo mide, en
buena parte, instrumentación que ningún jugador tiene.

## Splitscreen: coste por vista

El splitscreen no renderiza una escena distinta por jugador, pero sí **redibuja
el mundo entero con cada cámara** y duplica cada actor visible en cada viewport.
Con 8 jugadores eso convierte cualquier coste unitario en el peor caso.

Medición con el juego real en `perf-256`, 8 jugadores y Chrome headless con
WebGL por software (los milisegundos absolutos no son representativos de una
GPU real; los draw calls y las proporciones sí):

| Vistas | Copias | Draw calls antes | Draw calls ahora | Arranque antes | Arranque ahora |
| --- | --- | --- | --- | --- | --- |
| 1 | 8 | 50 | **32** | ~1,3 s | ~0,4-1,0 s |
| 2 | 16 | 103 | **67** | ~0,9 s | ~0,1-0,4 s |
| 4 | 32 | 210 | **138** | ~3,8 s | ~0,6-1,0 s |
| 8 | 64 | 413 | **269** | ~4,6 s | **~0,45 s** |

El frame de 8 vistas baja un **35 %** y el arranque síncrono un **90 %**. El
desglose de draw calls con 8 vistas queda así: **157** del mundo (redibujado por
cada cámara) + **64** cuerpos + **32** sombras + **16** anillos (dos pasadas de
los 8 dueños) = **269**. Antes eran 157 + 64 + 32 + 64 anillos + 96 barras = 413;
las barras ya no aportan draw calls porque se pintan en 2D. Lo aplicado:

- **Anillo de rumbo solo en la copia del dueño** (`game.ts`): antes cada copia
  creaba textura, dos materiales y un draw call de anillo. Ahorra 56 draw calls
  y 56 texturas en 8 vistas. Es un cambio visual deliberado: los demás Pokémon
  ya no muestran su flecha de rumbo; conservan el contorno de equipo y la
  silueta.
- **Barras de vida en una capa 2D** (`healthBar.ts`, `healthBarOverlay.ts`):
  antes cada copia tenía tres quads 3D con su textura, material y canvas. Ahora
  hay **un canvas por jugador** y un overlay 2D que lo proyecta en cada viewport
  con `camera.worldToScreen`. Se eliminan ~96 draw calls, 192 materiales y 192
  texturas en 8 vistas. El dibujo (vida, XP, nivel, armadura) es el mismo código
  de canvas que antes, así que el aspecto no cambia.
- **Recursos de anillo compartidos por color de equipo** (`marker.ts`): malla,
  textura y materiales se cachean por aplicación y color. La caché mantiene una
  referencia a la malla para que PlayCanvas no la libere al destruir los anillos
  de una partida.
- **Geometría de billboard compartida** (`sprite.ts`): las mallas de cada
  animación solo dependen del sprite, no de la cámara. Antes cada copia creaba
  una malla por animación; ahora se comparten por aspecto y animación y se
  liberan con `disposeSpriteAsset`.
- **Capas de animación perezosas y calentadas por tandas** (`sprite.ts`,
  `game.ts`): un actor nace solo con la capa que necesita y `prewarmBillboards`
  crea el resto con un presupuesto de 3 ms por frame, empezando por el `idle` de
  todas las copias. Así los cuerpos aparecen durante la cuenta atrás y el primer
  ataque no paga la creación de materiales de golpe.

### Descartado tras medir

- **Billboards instanciados (punto 5)**: solo reduce draw calls si varias copias
  comparten textura. Cada especie tiene su propia hoja y cada vista puede usar
  una fila de dirección distinta, así que haría falta un atlas por partida y un
  shader con UV por instancia. La ganancia máxima serían ~56 draw calls de 269;
  el coste y el riesgo no compensan frente a compartir geometría y materiales,
  que ya está hecho.
- **Render target por vista (punto 6)**: con N vistas el total de píxeles sigue
  siendo el de la pantalla completa. Renderizar cada vista a una textura no
  reduce relleno salvo que se baje la resolución de unas vistas y no de otras, y
  eso ya lo cubre `dynamicResolution` a nivel global. El cuello medido es de draw
  calls y CPU, no de fill rate.
- **Multijugador en red (punto 8)**: elimina el problema de raíz, pero no es una
  optimización: requiere autoridad de simulación, transporte, sincronización y
  un servidor. Es un proyecto aparte; el trabajo de esta ronda es compatible con
  él (el mundo ya se construye con un mapa explícito y el render está separado
  de la simulación por pasos fijos).

## Cactus instanciados: 240 draw calls del mundo — aplicada

La decoración repetida también se puede dibujar con una sola llamada. Los
cactus del desierto ya usaban instancing en los desiertos grandes, pero los
calveros pequeños seguían creando un cactus con **cinco primitivas** cada uno.
En `caldera` hay 48 de esos calveros, así que solo los cactus suponían **240
draw calls** del mundo: más de la mitad del total de la escena.

Ahora todos los cactus del mapa se acumulan en una única malla instanciada (una
matriz de mundo por cactus, mismo consumo de azar para que las posiciones no
cambien). Medido con la cámara fija en el centro del mapa y los bots detenidos
(Chrome, 1280×720, build de desarrollo; los draw calls no dependen de la
instrumentación del motor):

| Vistas | Draw calls antes | Draw calls ahora | Forward antes | Forward ahora |
| --- | --- | --- | --- | --- |
| 1 | 312 | **202** (−35 %) | 255 | **143** (−44 %) |
| 4 | 1193 | **650** (−46 %) | 1112 | **566** (−49 %) |

La medición con cámara fija importa: el mapa reparte los respawns al azar y cada
posición descarta una parte distinta del mundo, así que dos ejecuciones sin
anclar la cámara pueden diferir en decenas de draw calls.

### Descartado tras medir

- **Instanciar picos y muros**: se probó con lotes por cordillera y por variante
  de malla. En `caldera` no cambiaba el total y en `perf-256` **empeoraba**
  (116 picos y 26 muros): el descarte por cámara de cada pieza ya era muy
  efectivo y un lote con la caja de toda la cordillera se dibuja en cuanto un
  solo pico asoma. Se mantienen como piezas sueltas. Los cactus, en cambio, se
  reparten por todo el mapa y casi siempre hay varios en pantalla, así que el
  lote único sí compensa.

## Emisores de combate: `ParticleSystem` → lotes analíticos — aplicada

Los emisores de las áreas, impactos, haces y melee seguían usando
`ParticleSystem`. Cada uno costaba una pasada `ParticleUpdate` por frame y hasta
**32 pasadas de `preWarm`** al crearse o reutilizarse desde el pool, además de
su material, sus texturas float y un draw call por vista.

`EffectParticleBatch` (`src/game/render/fx/effectParticleBatch.ts`) genera una
malla de billboards y calcula en el vertex shader la posición, la deriva, el
tamaño y el color con un único `uTime`. `WorldTrailBatch`
(`worldTrailBatch.ts`) hace lo mismo para las estelas de proyectiles, pero
emitiendo en la posición mundial del proyectil para que las motas se queden
atrás. Entre los dos ya no queda ningún `ParticleSystem` de combate.

Detalle importante: el número de partículas vivas no es `numParticles`, sino
`lifetime / rate` (PlayCanvas escalona los nacimientos cada `rate` segundos).
Usar `numParticles` hacía que un Anillo Ígneo pasara de ~1 mota a 130 y se viera
como una bola de fuego.

Medido con la cámara fija y una vista:

| Efecto | Draw calls antes | Ahora | Pasadas de simulación |
| --- | ---: | ---: | --- |
| Haz de Roca | 11 | **5** | 1 → 0 |
| Haz fantasma | 18 | **7** | 1 → 0 |
| Haz oscuro | 16 | **6** | 1 → 0 |
| Anillo Ígneo | 8 | **6** | 1 → 0 |

En las áreas el draw call baja poco (el emisor ya era uno), pero desaparecen la
simulación por frame y el `preWarm` de cada casteo, que era el pico que se
notaba al encadenar habilidades.

### Impactos, melee y proyectiles

Los impactos con más elementos también usan lotes para sus aros, motas, gotas y
jirones. Medido con una vista:

| Efecto | Antes | Ahora |
| --- | ---: | ---: |
| Impacto de aura | 11 | **4** |
| Impacto fantasma | 13 | **6** |
| Impacto oscuro | 17 | **11** |
| Impacto de acero | 20 | **12** |
| Impacto de lucha | 23 | **4** |
| Impacto de fuego | ~17 | **7** |
| Impacto eléctrico | 6 | **4** |
| Impacto shuriken | 13 | **5** |
| Impacto de mandíbula | 10 | **4** |
| Melee de Planta | 10 | **2** |
| Melee de Veneno | 10 | **4** |
| Melee psíquico | 6 | **2** |
| Melee de arco | 4 | **2** |
| Melee de garra | 4 | **2** |
| Mordida de mandíbula | ~22 | **3** |
| Proyectil eléctrico | 6 | **3** |
| Proyectil de hojas | 7 | **2** |
| Proyectil de fuego | 6 | **3** |
| Proyectil de veneno | 3 | **2** |
| Proyectil de roca | 5 | **2** |
| Proyectil de sombra | 8 | **3** |
| Proyectil shuriken | 7 | **5** |
| Área psíquica | 7 | **6** |
| Área de hielo / Ventisca | 7 | **6** |
| Área de Excavar | ~56 | **10** |

El proyectil eléctrico reutiliza una única malla de rayo cacheada y dibuja sus
tres arcos en un lote, así que tampoco genera geometría nueva por casteo.

### Lote con tinte por instancia

`EffectBatch` comparte el material del efecto, así que todas sus instancias
tienen el mismo color y la misma opacidad. Eso dejaba fuera las capas que mezclan
tonos en un mismo efecto. `EffectTintBatch`
(`src/game/render/fx/effectTintBatch.ts`) usa un `ShaderMaterial` propio sin
iluminación y guarda en el buffer de instancias el **color, el alfa y una
ventana de desvanecido por instancia**. La animación sigue saliendo del mismo
banco de `MOTION_*` y de su gemelo WGSL.

Con él se funden:

- las tres esferas del proyectil de fuego (núcleo, halo interior y halo
  exterior) y sus dos colas de llama texturizada;
- el núcleo y el halo de los proyectiles de veneno, eléctrico y de hojas;
- el cuerpo, la estela y los jirones del proyectil de sombra;
- las cinco ondas psíquicas, los tres o cuatro frentes del arco de golpe y las
  tres zarpas del melee (estas últimas, además, en una sola malla fundida);
- el cuerpo, los bultos, las vetas, la espuma, las gotas y la punta del chorro
  de agua; las lenguas del haz de fuego; las hélices, anillos y plumas de los
  haces de aire y Planta; y los cristales, anillos y neblina del haz de hielo.

### Haces por lotes

| Haz | Antes | Ahora |
| --- | ---: | ---: |
| Chorro de agua | ~50 | **10** |
| Haz de fuego | 12 | **5** |
| Haz de aire | ~54 | **5** |
| Haz de Planta | ~48 | **3** |
| Haz de hielo | 26 | **5** |

Los haces de aire, Planta y hielo siguen creando su cilindro base con
`CylinderGeometry` una vez por casteo; el resto de capas ya no instancia
entidades.

### Áreas con escombros

`Excavar` era el efecto más fragmentado: el cráter, dos anillos, once grietas,
nueve losas, veinte rocas y once puffs eran entidades independientes. Ahora las
grietas, losas, rocas, puffs y anillos se dibujan en siete lotes instanciados
con la animación en el vertex shader. La malla del cráter y su borde siguen
siendo dos entidades porque usan geometría propia. Las áreas de hielo también
dibujan sus dos aros de escarcha en un único lote.

En melee, las ondas psíquicas, los arcos de golpe y las zarpas comparten la
geometría de casteos anteriores mediante `cachedArcBand` y `cachedMesh`: ya no
se reconstruyen cinco mallas de onda, cuatro de arco y tres de zarpa en cada
golpe. Las tres zarpas se funden además en una sola malla.

El proyectil de roca se reconstruyó como un único boulder: cuatro fragmentos de
la misma roca, solapados y con un solo material iluminado, giran en un lote. Su
estela de polvo nace pegada a la parte trasera y usa una entrada de alfa corta
para no leerse como un segundo proyectil.

Quedan como entidades sueltas las marcas de área persistentes, la grieta y la
cresta del haz de roca, y las cuatro piezas del shuriken, que usan mallas y
materiales distintos.

## Clima del mundo: `ParticleSystem` → lote analítico — aplicada

La capa de clima (`atmosphereVisuals.ts`) era el último `ParticleSystem` del
juego. La lluvia, la nieve, la arena, el granizo y la niebla se simulaban en una
pasada de GPU por emisor y se dibujaban con un material propio.

Ahora usan el mismo `BatchedParticles` que las motas ambientales del mapa: un
lote por tipo de partícula, posición, caída y desvanecido en el vertex shader.
Una tormenta pasa de dos emisores con simulación por frame a **2 draw calls**
(lluvia y niebla) sin `preWarm` ni buffers float de simulación. El AABB del lote
se calcula a partir del recorrido real de las motas, así que la lluvia que cae
desde y ≈ 9 no se recorta por cámara.

## Prioridad recomendada

1. ~~Reescribir `paintTerrainZone` con relleno/trazo de Canvas (solución 1).~~
   Hecho.
2. ~~Usar la rejilla como base de las zonas decorativas (solución 2).~~ Hecho.
3. ~~Trocear la generación con `await`/`requestAnimationFrame` entre tandas.~~
   Hecho.
4. ~~Arreglar `regionsForMask` y capar las instancias de hielo como limpieza
   preventiva.~~ Hecho.
5. ~~Bajar el presupuesto de textura solo si hace falta más margen.~~ Hecho:
   `CONFIG.performance.groundTexturePixels` (4 M por defecto).
6. ~~Reducir el coste del splitscreen: anillo solo del dueño, barras en 2D,
   geometría compartida y capas perezosas.~~ Hecho: 413 → 269 draw calls y
   arranque de ~4,6 s → ~0,45 s con 8 vistas.
7. ~~Repartir la simulación de las partículas ambientales por distancia.~~
   Hecho primero con un presupuesto por distancia y después **sustituido por
   lotes por tipo** (`batchedParticles.ts`): en `caldera`, las partículas pasan
   de 72 a 6 draw calls por vista y desaparece la simulación por emisor.
8. ~~Instanciar la decoración repetida que no se descarta bien por cámara.~~
   Hecho para los cactus del desierto: en `caldera`, 312 → 202 draw calls con
   una vista y 1193 → 650 con cuatro. Picos y muros se dejaron sueltos porque el
   instancing medido empeoraba `perf-256`.
9. **Multijugador en red** si 8 jugadores locales siguen siendo un requisito
   importante: es la única forma de dejar de multiplicar la escena por vista.
10. **Medir siempre sobre la build de producción**: el servidor de desarrollo
    añade la instrumentación de PlayCanvas y duplica el coste del tick.
