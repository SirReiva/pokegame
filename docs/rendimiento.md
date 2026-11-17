# Rendimiento de NewPoke

> Documento único de rendimiento: referencias de CPU y frame, el análisis de la
> carga de mapas grandes y las propuestas de optimización.

## Contenido

1. [Parte 1: Baseline de rendimiento](#parte-1-baseline-de-rendimiento)
   - [CPU pura (`pnpm bench`)](#cpu-pura-pnpm-bench)
   - [Baseline de frame real](#baseline-de-frame-real)
2. [Parte 2: Carga de mapas grandes](#parte-2-carga-de-mapas-grandes)
3. [Parte 3: Propuestas de rendimiento](#parte-3-propuestas-de-rendimiento)

---

# Parte 1: Baseline de rendimiento

Fecha de referencia: noviembre de 2026 · build de producción.

## CPU pura (`pnpm bench`)

Node 26, sin GPU, sobre los módulos puros. Sirve para detectar regresiones de
lógica o asignaciones tras un refactor; **no sustituye** a la medición del
frame real.

| Benchmark | Iteraciones | Tiempo | Throughput |
| --- | ---: | ---: | ---: |
| `decorateDamage` | 2.000.000 | 133,9 ms | 14.931.312 ops/s |
| `aoeContains` (cono) | 2.000.000 | 253,6 ms | 7.886.687 ops/s |
| `buildBotHazards` (100 proyectiles + 20 áreas) | 20.000 | 113,1 ms | 176.904 ops/s |
| `normalizeModeSettings` | 200.000 | 40,8 ms | 4.903.716 ops/s |

Criterio de aceptación: una variación de ±5 % en estos números es ruido; por
encima de ese margen se investiga antes de mergear.

## Baseline de frame real

Medición con `pnpm build` + `vite preview` + Chrome headless (`--headless=new`,
`--use-angle=swiftshader`, 1280×720). **Los valores absolutos no representan una
GPU real**: SwiftShader renderiza por software y exagera el coste. Sirven como
referencia relativa y para detectar regresiones de CPU/draw calls en el mismo
entorno.

Comando:

```bash
pnpm build
pnpm bench:frame --all --seconds 5
```

| Mapa | Vistas | FPS | frame ms | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arena | 1 | 2,8 | 361,06 | 366,60 | 383,40 | 383,40 |
| arena | 4 | 2,5 | 397,22 | 416,60 | 483,40 | 483,40 |
| arena | 8 | 1,4 | 729,71 | 749,90 | 774,70 | 774,70 |
| caldera | 1 | 2,9 | 348,08 | 366,60 | 383,40 | 383,40 |
| caldera | 4 | 2,6 | 385,38 | 416,60 | 500,10 | 500,10 |
| caldera | 8 | 2,2 | 449,38 | 483,40 | 516,70 | 516,70 |
| perf-256 | 1 | 2,1 | 473,09 | 483,40 | 583,30 | 583,30 |
| perf-256 | 4 | 1,4 | 706,64 | 783,30 | 883,40 | 883,40 |
| perf-256 | 8 | 1,2 | 829,84 | 933,30 | 983,40 | 983,40 |

### Medición con GPU real

Mismo comando, añadiendo `--gpu` para no forzar SwiftShader:

```bash
pnpm bench:frame --all --seconds 5 --gpu
```

| Mapa | Vistas | FPS | frame ms | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arena | 1 | 58,0 | 17,23 | 16,70 | 16,80 | 150,00 |
| arena | 4 | 59,9 | 16,71 | 16,70 | 16,80 | 33,30 |
| arena | 8 | 60,1 | 16,64 | 16,70 | 16,80 | 17,00 |
| caldera | 1 | 59,8 | 16,73 | 16,70 | 16,80 | 49,90 |
| caldera | 4 | 60,0 | 16,66 | 16,70 | 16,80 | 16,90 |
| caldera | 8 | 60,1 | 16,64 | 16,70 | 16,80 | 16,90 |
| perf-256 | 1 | 59,2 | 16,88 | 16,70 | 16,80 | 66,50 |
| perf-256 | 4 | 59,9 | 16,69 | 16,70 | 16,80 | 33,30 |
| perf-256 | 8 | 60,0 | 16,65 | 16,70 | 16,80 | 16,90 |

Con aceleración por hardware el juego mantiene 60 FPS estables en las 9
combinaciones; los picos aislados de 33-150 ms son de arranque/compilación de
shaders, no del estado estacionario. **Esta es la tabla de referencia.**

### Segunda medición con SwiftShader (software)

Mismo entorno y comando:

| Mapa | Vistas | FPS | frame ms | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arena | 1 | 2,9 | 350,03 | 366,60 | 433,50 | 433,50 |
| arena | 4 | 2,7 | 366,80 | 400,00 | 433,40 | 433,40 |
| arena | 8 | 1,7 | 596,54 | 666,70 | 700,00 | 700,00 |
| caldera | 1 | 2,7 | 365,74 | 366,70 | 433,40 | 433,40 |
| caldera | 4 | 2,5 | 404,05 | 400,00 | 683,50 | 683,50 |
| caldera | 8 | 2,0 | 505,94 | 483,30 | 916,80 | 916,80 |
| perf-256 | 1 | 2,1 | 472,30 | 500,10 | 566,70 | 566,70 |
| perf-256 | 4 | 1,2 | 810,93 | 833,40 | 900,10 | 900,10 |
| perf-256 | 8 | 1,4 | 737,40 | 833,40 | 910,50 | 910,50 |

La variación entre ejecuciones de SwiftShader es alta (±15-20 %), sobre todo en
`caldera` y `perf-256`. No se usa esta tabla para declarar mejoras o regresiones
de GPU; solo confirma que el benchmark sigue funcionando y que el escalado por
vistas se mantiene.

### Lectura

- El escalado por vistas es el esperado: cada viewport redibuja el mundo.
- `perf-256` es el mapa más caro, seguido de `caldera` y `arena`.
- Para una medición válida de GPU hay que repetir el mismo comando en una
  máquina con aceleración por hardware, sin `--use-angle=swiftshader`, y usar
  Chrome DevTools para registrar draw calls y frame CPU.
- Criterio de aceptación de refactor: p95 dentro de ±3 % respecto a esta tabla
  en el mismo entorno, mismos draw calls y sin tareas largas nuevas.

---

# Parte 2: Carga de mapas grandes

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

---

# Parte 3: Propuestas de rendimiento

> Revisión técnica · noviembre de 2026
>
> Base de partida: la tabla de frame real de la Parte 1 (60 FPS estables en las
> 9 combinaciones mapa × vistas con GPU real) y las optimizaciones ya aplicadas
> de la Parte 2.
>
> APIs comprobadas sobre PlayCanvas 2.24 (`AppStats`, `Texture.releaseSources`,
> `MeshInstance.setInstancing`) y Vite 8 / Rolldown 1.2 (`output.codeSplitting`).

El proyecto ya está muy optimizado: partículas ambientales por lotes, instancing
de decoración, barras de vida en una capa 2D, geometría de billboard compartida,
capas de animación perezosas, resolución dinámica, carga de mapas troceada y
benchmarks de CPU. Las propuestas de este documento no buscan "arreglar" nada de
eso, sino **ganar margen en memoria, arranque, equipos débiles y splitscreen de
8 vistas**.

Cada punto explica: qué pasa hoy, por qué cuesta, qué cambiaría exactamente,
qué impacto espero y cómo lo verificaría.

---

## Índice

1. [Memoria y ancho de banda](#1-memoria-y-ancho-de-banda)
   - [1.1 Escala de texturas adaptativa al viewport](#11-escala-de-texturas-adaptativa-al-tamaño-real-del-viewport)
   - [1.2 Mipmaps en las hojas de sprite](#12-mipmaps-en-las-hojas-de-sprite)
   - [1.3 Audio por roster y música fuera del AudioBuffer](#13-audio-carga-por-roster-y-música-fuera-del-audiobuffer)
   - [1.4 Caché HTTP real para manifiesto y mapas](#14-caché-http-real-para-manifiesto-y-mapas)
   - [1.5 Menos canvas intermedios al subir texturas](#15-camino-de-subida-de-texturas-menos-canvas-intermedios-y-liberar-fuentes)
2. [CPU por frame y draw calls](#2-cpu-por-frame-y-draw-calls)
   - [2.1 Amortizar visibilidad y conocimiento de objetos](#21-amortizar-visibilidad-de-actores-y-conocimiento-de-objetos)
   - [2.2 Draw calls del splitscreen](#22-draw-calls-del-splitscreen-contornos-siluetas-y-sombras)
   - [2.3 Quitar backdrop-blur del HUD en partida](#23-quitar-backdrop-blur-del-hud-durante-la-partida)
   - [2.4 Evitar material.update() innecesarios](#24-evitar-materialupdate-innecesarios-en-efectos-y-números-de-daño)
   - [2.5 Presets de calidad por tier de GPU](#25-presets-de-calidad-automáticos-por-tier-de-gpu)
   - [2.6 Micro-GC en simulación](#26-micro-gc-en-simulación)
   - [2.7 Dirty flags en la IA](#27-dirty-flags-en-la-ia)
3. [Medición e infraestructura](#3-medición-e-infraestructura)
   - [3.1 Ampliar el benchmark](#31-ampliar-el-benchmark-para-medir-lo-que-de-verdad-importa)
   - [3.2 Pre-bake del suelo y caché persistente](#32-pre-bake-del-suelo-y-caché-que-sobreviva-a-la-partida)
   - [3.3 Bundle y caché de chunks](#33-bundle-y-caché-de-chunks)
   - [3.4 HUD de rendimiento interno](#34-hud-de-rendimiento-interno)
4. [Orden de implementación](#orden-de-implementación-recomendado)
5. [Criterios de aceptación](#criterios-de-aceptación)

---

## 1. Memoria y ancho de banda

### 1.1 Escala de texturas adaptativa al tamaño real del viewport

#### Qué pasa hoy

`CONFIG.sprite.smoothScale = 4` (`src/game/config.ts:106`) fija un objetivo de
×4 para todas las hojas. `planTextureScales()` (`src/game/sprite.ts:237-293`)
solo baja esa escala cuando la suma supera `budgetMB`, que se calcula con
`detectSpriteBudget()` y suele quedar en 64 MB por aspecto en GPUs integradas y
96 MB en dedicadas (`src/game/spriteBudget.ts:38-54`). El presupuesto es un
**tope**, no una estimación de lo que realmente se necesita.

#### Por qué cuesta

Números reales calculados desde el manifiesto con la escala ×4:

| Especie | VRAM a ×4 | Con presupuesto de 64 MB |
| --- | ---: | ---: |
| Pikachu | ~52 MB | 51,5 MB (todo ×4) |
| Lugia | ~152 MB | 56,4 MB (idle/hurt ×4, attack ×3…) |
| Moltres | ~292 MB | 59,2 MB |
| Rayquaza | ~381 MB | 56 MB (attack/quickstrike a ×1) |

Ocho aspectos en una partida dejan **450–770 MB de texturas**. En WebView y en
móvil eso es mucho, y no aporta nada en 8 vistas: con 8 viewports de ~320×180 px,
un sprite de 40 px de arte ocupa ~35–45 px en pantalla. Estamos subiendo detalle
que el jugador no puede ver.

#### Qué haría

1. Calcular la densidad de téxeles necesaria por partida:

   ```ts
   // píxeles de pantalla por unidad de mundo en la vista más pequeña
   const pxPerUnit =
     viewportHeightPx / (2 * cameraDistance * Math.tan(fov / 2));
   const screenHeight =
     artHeight * PIXEL_SCALE * VERTICAL_STRETCH * pxPerUnit;
   const desiredScale = clamp(Math.round(screenHeight / artHeight), 1, 4);
   ```

   Con 1 vista sale ~4; con 4 vistas ~3; con 8 vistas ~2 o incluso 1–2.

2. Pasar `maxScale` a `loadSpriteAsset()` y usarlo como techo en
   `planTextureScales()` en lugar del `SPRITE_TEXTURE_SCALE` global
   (`src/game/sprite.ts:152-153`).

3. Mantener el presupuesto como red de seguridad, no como objetivo.

#### Impacto

3–4× menos VRAM sin pérdida perceptible en splitscreen; en 1 vista se conserva
×4. Además reduce el tiempo de subida a GPU y el riesgo de desalojar texturas.

#### Cómo verificarlo

`app.stats.vram.tex` existe en PlayCanvas 2.24 y expone el contador de VRAM de
texturas. Añadirlo al HUD/bench y comparar 1/4/8 vistas. Medir también
`performance.memory.usedJSHeapSize`, porque los canvas temporales también
cuentan.

#### Riesgo

Es un cambio visual: validarlo con `--gpu` real en 1 y 8 vistas. Recomendación:
aplicarlo automáticamente según `humanConfigs.length` y permitir forzar "Calidad"
en Opciones.

---

### 1.2 Mipmaps en las hojas de sprite

#### Qué pasa hoy

`createSpriteTexture()` crea la textura con `mipmaps: false` y
`minFilter: filter` (`src/game/sprite.ts:467-480`).

#### Por qué cuesta

En splitscreen los sprites se dibujan **minificados** (su huella en pantalla es
menor que la textura). Sin mips, el hardware muestrea un nivel de detalle fijo:
aparecen parpadeos al mover la cámara, aliasing en el contorno y se pierde
localidad de caché de textura (más ancho de banda por frame). Es un problema de
calidad y de rendimiento de muestreo.

#### Qué haría

```ts
new pc.Texture(device, {
  mipmaps: true,
  minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
  magFilter: pc.FILTER_LINEAR,
  anisotropy: 4,
  // ...
});
```

PlayCanvas genera los mips de fuentes CPU con filtro box al subir la textura.
`texture.mipmaps` no se puede cambiar después sin recrear la textura en WebGPU
(está documentado en los tipos), así que hay que decidirlo al crearla.

#### Impacto

Más estabilidad visual y menos thrash de textura; +33 % de memoria, que el punto
1.1 compensa con creces.

#### Riesgo

Con `alphaTest = 0.5` y `alphaToCoverage`, los mips promedian alfa y pueden
erosionar el borde 1 px. Probar el contorno y, si se nota, generar mips con
cobertura alfa preservada o mantener `mipmaps: false` solo en `nearest`. En
`smooth` + ×2 debería ser aceptable.

---

### 1.3 Audio: carga por roster y música fuera del AudioBuffer

> **Estado (noviembre de 2026): implementado.** `configureAudio()` ya no
> precarga nada; `prepareMatchAudio()` carga solo las rutas del roster y
> `releaseMatchAudio()` las libera al terminar. La música se reproduce con un
> `<audio loop>` en streaming. Queda pendiente el reencodeo opcional a Opus.

#### Qué pasaba antes

`configureAudio()` precarga **todos** los SFX al crear la app
(`src/game/audio.ts:86-88`) y lanza la música (`loadSound(MATCH_MUSIC_PATH)`).
`preloadAudio()` recorre `ALL_SFX_PATHS` con 6 workers (`audio.ts:140-153`).
PlayCanvas carga cada audio con `fetch` + `decodeAudioData` (verificado en
`playcanvas.mjs:103845-103885`), y `Sound.buffer` retiene el `AudioBuffer`
decodificado.

#### Por qué cuesta

- `public/audio` son ~20 MB: 73 SFX (12,4 MB) y una música de 7,2 MB a 320 kbps.
- Los SFX rondan los 5 s a 320 kbps; 73 × 5 s a 44,1 kHz estéreo Float32 son
  **~130 MB de PCM**. La música de 3,2 min añade **~67 MB**. En total, del orden
  de **200 MB residentes** durante la partida, además del coste de decodificar y
  de competir por red con las hojas de sprite durante la carga.
- `disposeAudio()` hace `sounds.clear()` pero no descarga los assets
  (`Asset.unload()`); al destruir la app se libera, pero en un cambio de mapa con
  `Game` nuevo se vuelve a descargar y decodificar todo.

#### Qué se cambió

1. `audioRoster.ts` proyecta el roster sobre `MOVESETS`: devuelve las 4
   habilidades de cada especie, el instinto común de cada jugador, `HIT_SOUNDS`
   y `proteccion`/`impulso` (este último también suena al bloquear con
   armadura). El resto se sigue pidiendo bajo demanda en el primer casteo por el
   camino que ya tenía `playSound()`.
2. `prepareMatchAudio()` se llama en `startMatch()`: suelta los efectos de la
   partida anterior y precarga solo ese subconjunto durante la cuenta atrás.
3. Se guarda el `pc.Asset` de cada efecto y `releaseMatchAudio()` llama a
   `asset.unload()` al terminar la partida. Un contador de generación descarta
   las cargas que terminan tarde, para que no rellenen la caché con el roster
   anterior.
4. La música ya no pasa por `loadSound()`: se crea un `<audio loop>` al empezar
   la partida y se pausa, reanuda o suelta con el ciclo de la sesión. El volumen
   efectivo es `master × music`, actualizado desde `subscribeAudioSettings()`.
   Si el navegador bloquea el autoplay, se reintenta en el siguiente clic o
   tecla.
5. Queda pendiente el reencodeo opcional a Opus 96–128 kbps para bajar descarga
   (la memoria decodificada depende de la duración, no del bitrate).

#### Impacto

Se pasa de hasta ~200 MB de PCM residentes a unos 50–55 MB en el peor caso
(unas 30 habilidades únicas de 8 especies, más impactos e instintos) y la música
deja de ocupar ~67 MB. La carga del mapa ya no compite por red y memoria con 73
MP3, y cambiar de roster no acumula buffers.

#### Cómo verificarlo

- Tests: `src/game/__tests__/audioRoster.test.ts` cubre la selección de rutas,
  la deduplicación y las especies sin moveset.
- `pnpm test`, `pnpm check` y `pnpm build` en verde.
- Prueba manual: Chrome DevTools → Memory, comparar `AudioBuffers` y JS heap
  antes y después; Network debe mostrar solo los ~35 efectos del roster al
  empezar y ninguno durante la carga del mapa. Repetir con otro roster y
  comprobar que los anteriores se liberan.
- En el bench, `performance.measureUserAgentSpecificMemory()` si está
  disponible, o `performance.memory`.

---

### 1.4 Caché HTTP real para manifiesto y mapas

#### Qué pasa hoy

- `loadManifest()` en `src/session/SessionProvider.tsx:56-58` y el fallback de
  `src/game/game.ts:1252-1254` piden
  `sprites/manifest.json?v=${Date.now()}`.
- `fetchJson()` en `src/game/map.ts:47` usa `cache: 'no-store'`.

#### Por qué cuesta

`Date.now()` crea una URL distinta en cada carga: el navegador **no puede
reutilizar** la respuesta ni responder 304, aunque el archivo no haya cambiado.
En GitHub Pages o en Wails eso significa volver a descargar 3,5 MB de manifiesto
y hasta 560 KB de mapa en cada recarga o cambio de mapa. `no-store` hace lo mismo
con el índice de mapas y los JSON de mapa.

#### Qué haría

1. Generar en build un nombre con hash (`manifest.<hash>.json`,
   `maps/arena.<hash>.json`) y un `index.json` que los referencie; usar `fetch`
   normal con `Cache-Control`/`ETag`. GitHub Pages ya cachea estáticos, pero la
   URL debe ser estable.
2. Reservar el cache-busting solo para `pnpm dev` (`import.meta.env.DEV`).
3. Guardar en `Cache Storage` la respuesta del manifiesto y los mapas; aún
   mejor, guardar en IndexedDB el objeto ya parseado para evitar `JSON.parse` en
   cada arranque.
4. A medio plazo, **partir el manifiesto**: un "índice" ligero (id, nombre,
   tipos, retrato, lista de animaciones) y los metadatos pesados por especie
   (`anchors`, `bottoms`, `contentRows`) en archivos por Pokémon. Hoy son 3,5 MB
   con 16 000 celdas; en una partida solo se necesitan 8 especies.
5. Compactar los metadatos: `anchors` casi siempre es el mismo objeto repetido
   por frame; se puede guardar un ancla compartida por fila y solo las
   excepciones, o arrays planos de enteros. `JSON.parse` de 3,5 MB son ~8 ms en
   Node y probablemente 15–25 ms en Chrome, además de la memoria de objetos.

#### Impacto

Recargas mucho más rápidas, menos datos y menos pico de memoria de objetos. El
punto 4 elimina trabajo de parseo proporcional al roster, no al catálogo
completo.

#### Cómo verificarlo

DevTools → Network: la segunda carga debe ser "disk cache"/304, no 200. Medir el
tiempo de `bootStatus === 'loading'` a `'ready'` antes y después.

---

### 1.5 Camino de subida de texturas: menos canvas intermedios y liberar fuentes

#### Qué pasa hoy

Una hoja puede pasar por varios canvas completos:

1. `buildTightSheet()` crea un canvas y redibuja la hoja recortada
   (`src/game/sprite.ts:365-408`).
2. `upscaleSheet()` crea otro canvas y la escala ×4
   (`src/game/sprite.ts:442-454`).
3. `setTextureSource()` crea **otro** canvas para voltear verticalmente a mano
   (`src/game/textures.ts:135-159`).

Además, `loadSpriteAsset()` carga todas las hojas de una especie en paralelo
(`src/game/sprite.ts:517-527`) y `src/game/game.ts:1302-1324` carga todas las
especies a la vez con `Promise.all`. Los `ImageBitmap` no se cierran
explícitamente.

#### Por qué cuesta

Para una hoja de 4096² cada canvas intermedio son ~67 MB de RAM temporal; con 8
especies en paralelo el pico puede superar fácilmente el GB, provocar GC y jank
durante la pantalla de carga. En Wails/WebView es especialmente sensible.

#### Qué haría

1. Combinar tight + upscale + flip en **una sola pasada** de `drawImage` sobre un
   canvas scratch reutilizado.
2. Evitar el flip por canvas: usar
   `createImageBitmap(await response.blob(), { imageOrientation: 'flipY' })`
   (Chrome/Firefox/Safari modernos) y crear la textura con `flipY: false`.
   Alternativa robusta: voltear las V en la geometría del billboard (los UV ya se
   recalculan en `applyFrame()`).
3. Liberar la fuente CPU después de subir: PlayCanvas 2.24 tiene
   `texture.setReleaseSourceAfterUpload()` (marca de un solo uso) y
   `texture.releaseSources()` (libera `_levels`, cierra `ImageBitmap`). Es API
   marcada `@ignore`, pero existe justo para este caso.
4. Limitar la concurrencia: 2–3 especies o 4–6 hojas simultáneas, con
   `yieldToBrowser()` entre tandas (ya está el helper en
   `src/game/frameYield.ts`).
5. Cachear `detectSpriteBudget()`: hoy `readRendererString()` crea un canvas
   WebGL temporal y lo pierde en cada partida.

#### Impacto

Menos pico de RAM, menos GC y menos bloqueo de carga, con el mismo resultado
visual.

#### Cómo verificarlo

DevTools Performance durante la carga: "JS heap", "GC" y tareas largas.
`app.stats.vram.tex` y el tiempo de `loadSpriteAsset` por especie.

---

## 2. CPU por frame y draw calls

### 2.1 Amortizar visibilidad de actores y conocimiento de objetos

> **Estado (noviembre de 2026): implementado.** `VisibilityCadence`
> (`src/game/sim/visibilityCadence.ts`) recalcula la visibilidad de actores a
> 20 Hz mientras alguien se mueve y la fuerza en el mismo paso ante daño
> recibido, ocultación, casteo, muerte/respawn o cambio de equipo/atmósfera. El
> conocimiento de objetos pasa a 7,5 Hz, se indexa por `PickupSpawn.id` y usa un
> `Int8Array` por equipo. Quedan contadores en `app.stats.user` y un benchmark
> sintético en `bench-core`.

#### Qué pasaba antes

- `refreshCombatVisibility()` se ejecutaba al final de **cada paso fijo de 60 Hz**
  (`src/game/game.ts`). Es O(n²): recorría observadores × objetivos y hacía una
  comprobación de línea de visión (`src/game/sim/visibility.ts`). Con 8 actores
  eran 56 comprobaciones por paso, ~3 360/s.
- `updatePickupKnowledge()` se ejecutaba en **cada frame de render**
  (`src/game/render/visionView.ts`). Iteraba objetos × equipos, creaba strings
  `"team:x:z"` y closures (`src/game/game.ts`) y hacía LOS por cada objeto
  visible. La visibilidad de cada copia de viewport repetía además la misma LOS
  que el equipo ya había resuelto.

#### Por qué costaba

La línea de visión usa una rejilla espacial (`SightIndex`), pero sigue recorriendo
celdas y colliders. Los objetos del mapa no se mueven: recalcular su visibilidad
60 veces por segundo es trabajo repetido. Además, las claves string y los
closures generaban basura constante.

#### Qué se cambió

1. `VisibilityCadence` compara cada paso una foto de posiciones y estado
   (vida, daño recibido, `hidden`, casteo, equipo, visión, ocultación y cadáver).
   Si algo crítico cambió, recalcula en ese mismo paso; si solo hubo movimiento,
   espera a que pasen 3 pasos (`CONFIG.vision.actorRefreshSteps`). Si nadie se
   movió más de `CONFIG.vision.moveEpsilon`, no gasta ningún cálculo. La foto
   anterior se reutiliza entre medias y la histéresis la tolera.
2. El render sigue recibiendo una foto válida para cada paso: `refreshCombatVisibility()`
   marca el paso actual incluso cuando reutiliza la anterior, así que
   `VisionView` no entra en el camino de respaldo en cada frame.
3. `updatePickupKnowledge()` se calcula a 7,5 Hz
   (`CONFIG.vision.pickupRefreshSteps = 8`), o al instante si cambia la
   disponibilidad de un objeto (`PickupField.revision`), si aparece una vista
   nueva o si la partida/mapa se reinicia. La rejilla de observadores evita
   recalcular cuando nadie se ha movido.
4. El conocimiento de objetos es `Int8Array` por equipo, indexado por el `id`
   estable que asigna `mapRuntime` a cada spawn. Ya no hay `Map<string, boolean>`,
   strings ni closures por frame, y los bots guardan memoria/reclamaciones por
   índice numérico (`pickupClaims: Map<number, …>`).
5. La visibilidad de cada copia de objeto se deriva del conocimiento cacheado,
   así que una sola LOS por equipo y objeto sirve para todas sus vistas.
6. Se publican `losChecks`, `pickupLosChecks`, `visibilityMs` y
   `pickupKnowledgeMs` en `app.stats.user`, y `bench-core.mjs` incluye
   `refreshCombatVisibility (8)`.

#### Impacto

El coste O(n²) pasa de 60 a 20 cálculos por segundo (3× menos) y desaparece
cuando la partida está quieta; el conocimiento de objetos baja de 60 a 7,5 Hz
(8× menos) y deja de repetir LOS por viewport. También se eliminan las
allocations de strings/closures por frame. No cambia el gameplay porque
`enemiesSeeing` solo alimenta el HUD y la regeneración (que exige 2 s sin ser
visto) y los bots ya toleraban la latencia de su decisión.

#### Cómo verificarlo

- Tests: `src/game/__tests__/visibilityCadence.test.ts` cubre el intervalo de 3
  pasos, el épsilon de movimiento, los eventos que fuerzan cálculo y el reinicio
  de partida.
- `pnpm test`, `pnpm check` y `pnpm build` en verde.
- `pnpm bench` añade `refreshCombatVisibility (8)`: en esta máquina da
  ~180 000–280 000 cálculos/s (~3,5–5,5 µs por foto de 56 pares sin oclusores),
  frente a los ~3 360/s que se pagaban a 60 Hz.
- En el juego, `app.stats.user.get('losChecks')` y
  `app.stats.user.get('pickupLosChecks')` muestran el trabajo de la última foto;
  repetir con cámara fija y actores quietos debe dejar de actualizar
  `visibilityMs`.

---

### 2.2 Draw calls del splitscreen: contornos, siluetas y sombras

> **Estado (noviembre de 2026): implementado.** El contorno de equipo pasó al
> material del sprite (`alphaTestPS` + `emissivePS`, GLSL y WGSL), las sombras de
> contacto se dibujan con una instancia por viewport (`ActorShadowBatch`) y la
> silueta se omite en viewports diminutos (`spriteDetail.ts`). El contorno se
> mantiene en todos los tamaños: es información de equipo, no decoración.

#### Qué pasaba antes

Cada copia creaba un `render` con 2–3 `MeshInstance`:

- sprite,
- silueta (`depthFunc = GREATER`, visible en la copia del dueño),
- contorno de equipo (solo copias ajenas).

Además, cada copia añadía una entidad y un componente de render solo para su
sombra de contacto, y los dueños un anillo. Con 8 vistas eran 64 copias, 64
sombras y 16 anillos: cada copia visible costaba hasta 4 draw calls (sprite,
silueta, contorno y sombra) más el anillo del dueño.

#### Qué se cambió

1. **Sombras instanciadas por vista** (`src/game/render/actorShadows.ts`). Cada
   viewport tiene un `ActorShadowBatch` con un plano unitario, el material
   compartido de sombra y un `VertexBuffer` dinámico de 8 matrices. Los actores
   escriben su posición en una ranura; `syncMatchView` compacta las visibles y
   sube el buffer una vez por vista. `instancingCount` decide cuántas se dibujan
   y el lote recibe una `aabb` que envuelve sus instancias para que el orden de
   transparencias no las mande al origen del mapa. El nodo se queda en el origen
   porque PlayCanvas calcula `matrix_model * instancia`: moverlo desplazaría
   otra vez todas las sombras.
2. **Contorno dentro del material del sprite** (`src/game/spriteOutline.ts`). Se
   sustituyen los chunks `alphaTestPS` y `emissivePS` por versiones que dilatan
   el alfa con 8 muestras vecinas y tiñen solo los píxeles que el cuerpo habría
   descartado. Los taps se recortan a la celda de la hoja (`uOutlineMin` /
   `uOutlineMax`) para no leer frames vecinos, y `dAlpha` sube a 1 en el borde
   para que `alphaToCoverage` no lo recorte. El paso se mide en píxeles de arte
   (`uOutlineStep`) y se recalcula en cada frame desde el recorte real.
   - PlayCanvas aplica la transformación V como `1 - offset - tiling`, así que
     los límites se pasan ya invertidos; sin eso el recorte deja el contorno sin
     dilatar.
   - Hay versión GLSL y WGSL: en WebGPU el material compila con los chunks WGSL
     y el contorno desaparecería sin error si solo se inyectara GLSL.
3. **LOD por viewport** (`src/game/spriteDetail.ts`). Con un alto de viewport por
   debajo de `CONFIG.sprite.smallViewportPx` se omite la silueta de oclusión del
   dueño y el contorno se engorda un 25 % para seguir leyéndose. El umbral se
   calcula con el mismo reparto de filas y tope de DPR que la densidad de
   texturas (`viewportHeightPx` en `multiplayer.ts`), así que ambas cuentas no se
   desincronizan.

#### Impacto

Cada copia visible pasa de hasta 4 draw calls a 1 (el sprite, con su contorno
incluido); la sombra se comparte entre todas las copias de la vista. En el bench
estándar (arena, 8 vistas, SwiftShader, con la niebla ocultando parte de los
rivales) se mide **622 → 590** draw calls totales con la misma cámara inicial, y
**80 → 74** con una vista. El ahorro crece con el número de copias en pantalla:
en una refriega con los 8 Pokémon visibles en las 8 vistas son hasta 56
contornos y 56 sombras menos.

El coste nuevo es de 8 muestras de textura por fragmento de sprite con contorno;
los sprites ocupan una fracción pequeña de cada viewport, y el bench no muestra
regresión de frame time.

#### Cómo verificarlo

- Tests: `src/game/__tests__/spriteDetail.test.ts` cubre el reparto de filas, el
  tope de DPR, el umbral de detalle y el grosor del contorno.
- `pnpm test`, `pnpm check` y `pnpm build` en verde.
- Draw calls: leer `app.stats.drawCalls.total` con el mismo mapa, número de
  vistas y cámara inicial (los respawns y la niebla cambian el culling, así que
  hay que comparar la misma ventana de tiempo).
- Capturas 1 / 4 / 8 vistas para comprobar que el contorno conserva color y
  grosor y que no aparecen motas fuera de la silueta (síntoma de taps que leen
  el frame vecino).

---

### 2.3 Quitar `backdrop-blur` del HUD durante la partida

#### Qué pasa hoy

El HUD de partida usa `backdrop-blur` en muchos elementos: `MatchHud.tsx` (kill
feed, paneles de habilidades, cabecera), `src/screens/PlayScreen.tsx:78` (FPS) y
`MatchDialogs.tsx` al pausar. En ese momento debajo hay un canvas WebGL vivo y,
en partida, además un canvas 2D de barras (`HealthBarOverlay`).

#### Por qué cuesta

Un `backdrop-filter` obliga al compositor a crear una superficie de render aparte,
**leer el fondo ya compuesto** (canvas WebGL + canvas de barras), aplicar el
desenfoque y volver a mezclar. Con una docena de elementos desenfocados hay una
docena de superficies offscreen que se recalculan cuando cambia cualquier cosa
detrás (es decir, cada frame). En 8 vistas el compositor ya está haciendo un
trabajo considerable.

#### Qué haría

1. En partida, sustituir `backdrop-blur-*` por fondos semitransparentes opacos
   (`bg-night-850/85`), que se leen igual.
2. Dejar el blur solo en pausa, menús, lobby y editor, donde el canvas 3D está
   congelado o no existe.
3. Si se quiere conservar el efecto, activarlo solo cuando el FPS supera 55 y
   desactivarlo con `dynamicResolution`; o un preset "Rendimiento" que lo quite.

#### Impacto

Cada elemento con blur deja de crear una superficie de composición. En equipos
integrados y en WebView suele ser uno de los mayores ahorros fuera del propio
motor.

#### Cómo verificarlo

Chrome DevTools → Rendering → "Layer borders" y "Paint flashing"; grabar un
perfil con y sin blur en 8 vistas. El bench actual **no monta el HUD de React**,
así que este coste no aparece en `pnpm bench:frame`; hay que medirlo con la
pantalla real o un test E2E.

---

### 2.4 Evitar `material.update()` innecesarios en efectos y números de daño

> **Estado (noviembre de 2026): implementado.** `updateMaterialIfChanged()`
> (`src/game/render/fx/materialUpdates.ts`) guarda en un `WeakMap` la última
> opacidad, tinte e intensidad emisiva aplicados a cada material y solo llama a
> `update()` cuando alguno cambia. Se usa en el bucle central de efectos y marcas
> de área, en los avances por frame de proyectiles y haces y en los números de
> daño. El seguimiento reutiliza el mismo objeto por material, así que no añade
> basura. Cubierto por `src/game/__tests__/materialUpdates.test.ts`. Queda
> pendiente mover la animación a shaders por estilo y el presupuesto de efectos
> por vista.

#### Qué pasaba antes

- `fxRuntime.update()` llamaba `material.update()` por cada material de cada
  marca de área y por cada material de cada efecto activo, aunque el efecto solo
  hubiera movido entidades.
- Varias fábricas (`projectiles.ts`, `projectilesWater.ts`,
  `projectilesElemental.ts`, `beams.ts`) recorrían además su lista de materiales
  y llamaban a `update()` dentro del propio callback, justo antes de que el
  bucle central repitiera la misma llamada: dos subidas por material y frame.
- `damageNumbers.update()` hacía lo mismo por cada número activo en cada frame,
  incluido el tramo en el que la opacidad se queda fija en 1.
- Hay efectos con varios materiales (hasta 5–8 en un área compleja) y hasta 64
  números activos a la vez.

#### Por qué cuesta

`material.update()` no es un setter: convierte las propiedades modificadas al
uniform buffer, recalcula los transforms de texturas (`_mapTransforms`) y sube
el buffer completo en el siguiente render. Llamarlo 60 veces por segundo por
material cuando el valor es idéntico es trabajo de CPU y ancho de banda de
uniformes que no cambia un solo píxel. Con varios materiales por efecto y varias
vistas, el coste se multiplica en los picos de combate.

#### Qué se cambió

1. `updateMaterialIfChanged(material)` compara `opacity`, `emissive.r/g/b` y
   `emissiveIntensity` contra la última foto y solo entonces llama a `update()`.
   Los cambios estructurales (defines, mezcla, texturas) siguen usando `update()`
   explícito en las fábricas, como antes.
2. El bucle central de `FxRuntime` usa el helper tanto para marcas de área como
   para efectos. Los callbacks que ya subían sus materiales (`projectiles*`,
   `beams`) también lo usan, de modo que desaparece la doble subida por frame.
3. Los números de daño usan el mismo helper en `spawn()` y en `update()`. Como
   la opacidad se mantiene en 1 durante el 50 % de la vida
   (`FADE_START = 0.45` sobre `LIFETIME = 0.9`), ese tramo ya no sube el material:
   cada número pasa de ~55 subidas a ~28.
4. El número de actualizaciones reales se puede contar en un test sin GPU:
   `materialUpdates.test.ts` comprueba que valores repetidos no disparan
   `update()`, que sí lo hacen los cambios de opacidad, tinte e intensidad y que
   cada material lleva su propio seguimiento.

#### Impacto

Menos subidas de uniform buffer en combates con muchas áreas simultáneas, sin
cambios visuales. Los materiales estáticos de un efecto (aros, halos, piezas que
solo rotan) dejan de pagar `update()` cada frame, y los números de daño ahorran
la mitad de sus actualizaciones.

#### Qué queda pendiente

- Mover la animación de opacidad de los efectos puramente temporales a un shader
  con `uEffectTime`, para actualizar un material por estilo en vez de uno por
  entidad. Ya hay precedente en `MOTION_PRIMORDIAL_*` y en las partículas
  ambientales.
- Presupuesto de efectos simultáneos por vista, descartando o simplificando los
  que caen en viewports pequeños.

#### Cómo verificarlo

Contar efectos/materiales activos en `app.stats.user` junto a
`app.stats.cpuUpdateTime` en un escenario de estrés (8 bots spameando áreas), y
comparar el perfil con y sin el dirty-check. El test unitario cubre la lógica de
decisión; la medición real queda para el HUD de rendimiento (3.4).

---

### 2.5 Presets de calidad automáticos por tier de GPU

#### Qué pasa hoy

`src/game/graphicsSettings.ts` solo guarda el backend (`auto`/`webgpu`/`webgl2`).
El resto de parámetros son constantes en `CONFIG`: `antialias: true` siempre
(`src/game/appBootstrap.ts:37`), `smoothScale: 4`, `alphaToCoverage: true`,
`mipmaps: false`, densidad de efectos fija.

#### Por qué cuesta

Un equipo integrado y un portátil con GPU dedicada reciben exactamente la misma
configuración, salvo el `maxPixelRatio` que se limita a 1,2 cuando hay más de 4
humanos (`src/game/app/matchSession.ts:399-401`) y la resolución dinámica
(`src/game/render/dynamicResolution.ts`). Ya existe una clasificación de GPU
fiable en `src/game/spriteBudget.ts` (`software`/`integrated`/`discrete`), pero no
se usa para nada más.

#### Qué haría

Un preset `quality: 'performance' | 'balanced' | 'quality'`:

- MSAA on/off (`antialias` en `createGraphicsDevice`).
- `smoothScale` y mipmaps.
- `alphaToCoverage`.
- blur del HUD.
- densidad/máximo de efectos.
- cap de DPR.
- resolución de la máscara de niebla (hoy 128 px, `src/game/config.ts:315`).

Auto-seleccionar por `GpuTier` y por número de vistas, con override en Opciones.
Persistirlo junto al backend. La UI ya tiene la pantalla de Opciones, así que no
hay coste de diseño.

#### Impacto

Evita que un equipo `software` o `integrated` sufra una configuración pensada para
una dedicada, y da al usuario una palanca clara.

#### Cómo verificarlo

Ejecutar el bench en los 9 escenarios con cada preset, con `--gpu` y SwiftShader;
comparar FPS, draw calls y memoria.

---

### 2.6 Micro-GC en simulación

> **Estado (noviembre de 2026): implementado.** `visibleEnemies` se vacía con
> `length = 0` en vez de crear un array por paso; `buildBotHazards()` acepta un
> `BotHazardBuffer` que reescribe el array y recicla los objetos de peligro;
> `simulateStep()` reutiliza cuatro `MutableBotWorldView` y pide
> `getBotObjective()` una sola vez por paso; y las búsquedas de cobertura,
> refugio y navegación ya no copian enemigos ni crean objetos por muestra. Los
> tests de `src/game/ai/__tests__/hazards.test.ts` cubren el buffer de peligros.
>
> Una segunda pasada elimina el resto de allocations del camino de simulación:
> la resolución de posiciones (`resolvePosition`/`dashPosition`) devuelve
> objetos reutilizados y no asigna un punto por collider, la memo de capas de FX
> no crea claves string ni `Set`, los números de daño salen de un pool y las
> colas de golpes y casteos alternan dos buffers.

#### Qué pasaba antes

Aunque el bucle principal está muy limpio, quedaban allocations por paso:

- `updateTarget()` hacía `this.visibleEnemies = []` en cada paso de cada bot
  (`src/game/bot.ts`).
- `buildBotHazards()` devolvía un array nuevo y asignaba un objeto por
  proyectil y por área persistente, en cada paso (`src/game/ai/hazards.ts`).
- `simulateStep()` creaba el registro `botViews` y cuatro objetos
  `BotWorldView` por paso, y llamaba cuatro veces a `getBotObjective()`
  (`src/game/game.ts`).
- `pickRetreatCover()`, `pickRegenPoint()`, `regenPointSafe()` y la decisión de
  retirada copiaban `visibleEnemies` con `filter()` aunque la lista ya venía
  filtrada.
- `regenSegmentHidden()` creaba un observador y un objetivo por cada rival y
  cada muestra del trayecto; `hazardArea()` creaba un área por peligro y
  `navHazards()` un array y un objeto por disco de cono en cada consulta.

#### Por qué cuesta

A 60 Hz con 7 bots son cientos de objetos pequeños por segundo: el array y los
peligros de cada paso, la lista de enemigos visibles de cada bot y las cuatro
vistas de equipo. Las búsquedas de refugio son peores: con 10 intentos, 13
muestras de trayecto y 3 rivales se creaban hasta ~780 objetos por llamada
(observador + objetivo por muestra), y hasta ~1 500 al buscar cobertura de
retirada. No es el cuello de botella, pero alimenta el GC y produce picos de
frame en partidas largas, sobre todo cuando coinciden con ráfagas de proyectiles
y regeneración.

#### Qué se cambió

1. `this.visibleEnemies.length = 0` en `updateTarget()` y en
   `resetCombatState()`. Los consumidores (`decision.ts`, las búsquedas de
   cobertura y refugio) leen la lista durante el mismo `update` y no guardan la
   referencia, así que reutilizarla es seguro.
2. `BotHazardBuffer` (`src/game/ai/hazards.ts`) agrupa el array visible y un
   `pool` de objetos. `buildBotHazards(projectiles, activeAoes, buffer)`
   reescribe los mismos objetos y recorta solo el array visible, de modo que
   los peligros que sobran se reutilizan en el siguiente pico. Sin buffer, la
   función sigue creando un array nuevo, como antes.
3. `Game` guarda `botWorldViews` (cuatro objetos con campos reasignables,
   `MutableBotWorldView` en `src/game/ai/types.ts`) y `botHazards`. En cada
   paso solo actualiza `visibleSlots`, `atmosphere` y `objective`, y calcula la
   zona objetivo una vez para los cuatro equipos.
4. Las cuatro copias con `filter()` se sustituyen por la lista viva:
   `updateTarget()` ya solo guarda rivales vivos y del otro equipo, así que
   `pickRetreatCover()`, `pickRegenPoint()`, `regenPointSafe()` y
   `decision.ts` la recorren sin duplicarla. El contrato queda tipado como
   `readonly` en `BotDecisionState` para que nadie la mute desde la capa de
   decisión.
5. `regenSegmentHidden()` reutiliza un observador y un objetivo compartidos por
   bot; `hazardArea()` rellena un `AoeArea` compartido (devuelto como
   `Readonly<AoeArea>`); y `navHazards()` reutiliza array y objetos con un pool
   propio, igual que los peligros de combate. El buffer de navegación cruza a
   `movement.ts` como `readonly NavHazard[]`.
6. `resolvePosition()` y `dashPosition()` escriben en objetos reutilizados
   (`resolvedPosition`/`resolvedDash`) y leen el punto más cercano de cada
   collider con `closestPointOnColliderInto()`, sin asignar uno por collider y
   por iteración. Los empujes de agua profunda y santuarios escriben en tuplas
   compartidas (`resolveDeepWaterInto`, `resolveTeamTerrainInto`) y ya no crean
   el predicado ni el array de retorno. Era la ruta más caliente: cada jugador y
   cada tramo de dash la recorren una vez por paso, con una vuelta por collider
   y hasta cuatro iteraciones de empuje. Los contratos documentan que el
   resultado es compartido y hay que copiar `x/z` antes de volver a llamar.
7. La memo de capas de FX (`fxLayersAt`) deja de ser un `Map<string, number[]>`
   y de crear un `Set<Team>` por consulta: 64 entradas reutilizables comparadas
   por valor (sin claves string), un bitmask por equipo y arrays de capas
   reciclados. Los consumidores copian el resultado al aplicarlo a un efecto,
   así que reescribir las entradas en el siguiente paso es seguro.
8. `modeContext()` rellena un único objeto y el evento `tick` se reutiliza en
   cada paso; las recompensas de XP del modo y las asistencias resuelven la
   plaza con `playerBySlot` en vez de un `find()` con closure.
9. Los números de daño salen de un pool (`popupPool`) y vuelven a él al
   dibujarse; también se reutilizan el array de vistas y el objeto de opciones
   que recibe `DamageNumbers.spawn`.
10. `queuedCasts`, `pendingInstantHits` y `pendingMeleeHits` alternan dos
    buffers en vez de asignar `[]` en cada intercambio. El consumidor solo lee
    el array durante la llamada, así que el buffer viejo se vacía en el
    intercambio siguiente.
11. En los bucles de colisión (colliders, jugadores, celdas de terreno y anclas
    de FX) la distancia se compara al cuadrado y la raíz solo se calcula cuando
    hay solapamiento real; `buildBotHazards()` usa `Math.sqrt` porque ahí sí hace
    falta el valor para dividir. Las magnitudes de juego no desbordan y las
    comparaciones conservan la regla anterior para radios nulos o negativos.
12. `syncMatchView()` recibe un objeto de dependencias reutilizado que se
    reescribe en cada render, y el array de vistas y las opciones del número de
    daño también se reciclan. Con esto el bucle de render no asigna objetos de
    estado por frame salvo los que crea el propio motor.

#### Impacto

Bajo en ms, pero constante: desaparecen el array de enemigos por bot, el array
y los objetos de peligros, el registro de vistas y tres de las cuatro consultas
al modo, además de los cientos de objetos de las búsquedas de refugio. En una
partida de 5 minutos con 7 bots se evitan del orden de **cientos de miles de
objetos pequeños**, lo que reduce la frecuencia de GC y los picos que se notaban
en ráfagas de proyectiles. En el bench sintético (`pnpm bench`, 100 proyectiles
+ 20 áreas), construir los peligros con buffer pasa de ~140 000 a ~225 000
llamadas por segundo.

La segunda pasada ataca el allocator más grande: con 8 jugadores, 100 colliders
y dos pasos por render, `resolvePosition()` asignaba hasta ~6 400 objetos por
render solo en puntos de collider, y un dash corto multiplicaba esa cifra por
cada tramo de 0,15 u. Ahora esas rutas no asignan nada; un dash completo reutiliza
el mismo objeto y la misma tupla de terreno en todos sus tramos.

#### Qué queda pendiente

- Los `Vec2` pequeños que devuelven helpers de decisión (`pickHazardEscape()`,
  `aoeEvadeDirection()`), fuera del camino caliente y sin impacto medible.
- `xpStatus()` sigue creando un objeto por jugador y render en el HUD (8 como
  mucho). Es despreciable frente a los miles de objetos de la resolución de
  posiciones, pero se puede reutilizar si el HUD lo pide.
- El registro de dependencias de `executeAbility()` (objeto y closures por
  casteo) y el array de objetivos de `aimAssistDirection()`: no son por frame,
  pero sí por habilidad lanzada en una refriega.
- Confirmar con el HUD de rendimiento (3.4) que el GC baja en partidas reales de
  8 vistas; el cambio no altera ningún cálculo de gameplay.

#### Cómo verificarlo

Los tests de `hazards.test.ts` comprueban identidad de array y de objetos,
recorte del array visible, conservación del pool y cambio de `kind` sin datos
activos. La segunda pasada mantiene verdes `pnpm check`, `pnpm test` y
`node --import tsx scripts/sim-headless.ts --map arena --bots 4 --seconds 60`,
que ejercita movimiento, dash, colisiones y casteos sin GPU. Para el resto,
Chrome DevTools → Memory → Allocation instrumentation con 8 bots y una lluvia de
proyectiles: el número de objetos por paso debe caer sin mover
`app.stats.cpuUpdateTime`.

---

### 2.7 Dirty flags en la IA

> **Estado (noviembre de 2026): implementado.** La IA ya no paga tres trabajos
> que se repetían en cada paso aunque su entrada no hubiera cambiado: las
> ventajas de tipo por rival se cachean (`src/game/ai/matchups.ts`), la
> comprobación de línea recta del movimiento se reutiliza mientras el bot sigue
> sobre el mismo segmento (`src/game/ai/movement.ts`) y las fases de amenaza y
> esquiva no se recalculan en pasos en los que el bot no puede actuar
> (`src/game/bot.ts`). Cubierto por `src/game/ai/__tests__/matchups.test.ts` y
> `src/game/ai/__tests__/movementCache.test.ts`.

#### Qué pasaba antes

`BotController.update()` ejecuta varias fases por paso: pizarra de equipo,
movimiento de aliados, rastro, objetivo, amenazas y peligros ya lanzados.
Algunas de ellas repetían trabajo cuyo resultado no podía cambiar:

- `updateTarget()` pedía `bestDamageMultiplier()` dos veces por rival visible
  (una en cada sentido). Cada llamada recorre las cuatro habilidades, la tabla
  de tipos y el clima. Posición, vida, cooldowns y facing no intervienen: solo
  cambiaría si cambiara el rival, sus tipos/habilidades o el clima.
- `BotMovement.moveTowards()` llamaba a `nav.lineClear()` en cada paso mientras
  caminaba a un destino. La comprobación muestrea la recta cada 0,28 u, así que
  un trayecto de 20 u hace ~70 lecturas de rejilla por paso y por bot, aunque el
  bot siga exactamente la misma recta que ya validó.
- `updateThreat()` y `updateHazardEvasion()` se ejecutaban también en pasos
  bloqueados (dash, hitstun o casteo que clava al lanzador), justo antes de
  devolver el snapshot idle. Nadie consumía el resultado: `drive()` no se llama
  en esos pasos.

#### Por qué cuesta

Ninguna de las tres es el cuello de botella, pero las tres son trabajo puro de
CPU que se repite a 60 Hz por bot. Con 7 bots y 3 rivales visibles, la ventaja de
tipo son ~2 500 recorridos de tabla por segundo; la línea recta, decenas de
miles de lecturas de rejilla por segundo durante los desplazamientos largos; y
las fases de amenaza se pagan enteras durante cada casteo con `startup` largo o
cada aturdimiento, que es justo cuando hay más efectos en pantalla.

#### Qué se cambió

1. `MatchupCache` guarda por plaza la ventaja ofensiva y defensiva junto con
   clima, identidad del atacante y del rival y **referencias** a sus arrays de
   tipos y habilidades. `lookup()` devuelve `null` si cualquiera cambió y
   `store()` guarda el cálculo recién hecho. El objeto de resultado se reutiliza
   para no asignar uno por rival y paso. `resetCombatState()` lo vacía.
2. `BotMovement` recuerda la última recta validada (punto de origen, destino y
   resultado). Mientras el bot avance sobre ese mismo segmento —proyección
   dentro del tramo y desvío lateral ≤ 0,1 u— reutiliza el `true`; el tramo que
   queda es un subconjunto del ya comprobado. Un destino nuevo (> 0,05 u), un
   empujón lateral, retroceder por detrás del ancla o un peligro invalidan la
   caché. Los resultados bloqueados no se guardan para volver a probar en el
   siguiente paso. `invalidateStraightLine()` la limpia en muerte/respawn.
3. `updateThreat()` y `updateHazardEvasion()` se mueven detrás de la comprobación
   de paso bloqueado. El resto del estado (pizarra, aliados, rastro, objetivo)
   se sigue manteniendo al día; solo se evita la geometría que `drive()` no va a
   leer. En el primer paso que el bot vuelve a actuar se recalculan antes de
   decidir y mover.

#### Impacto

Se elimina casi todo el coste de ventaja de tipo en pasos repetidos, la
comprobación de línea recta pasa de una vez por paso a una vez por tramo recto
en los desplazamientos a destinos fijos, y los pasos bloqueados dejan de pagar
amenazas y esquivas. No cambia ningún cálculo de juego: la caché de tipos es una
función pura de entradas que se comparan, la recta reutilizada es un subconjunto
validado del mismo segmento y las fases omitidas solo las lee `drive()`, que no
se ejecuta mientras el bot está bloqueado.

#### Qué queda pendiente

- `canHitPrediction()` sigue haciendo una comprobación de colliders por paso y
  por objetivo visible en `drive()`. Se podría cachear con una tolerancia de
  posición del rival, pero ahí la ventana es más corta y conviene medir antes.
- La pizarra de equipo la mantiene cada bot de la misma escuadra. Mover el
  mantenimiento compartido a una llamada por equipo y paso ahorraría barridos
  duplicados, pero el estado es pequeño y el ahorro no compensa el cambio de
  contrato.

#### Cómo verificarlo

- Tests: `matchups.test.ts` comprueba reutilización, invalidación por clima,
  rival, tipos, habilidades y `clear()`; `movementCache.test.ts` cuenta las
  llamadas a `lineClear` y verifica que se reutiliza al avanzar en recta y se
  invalida con desvío, destino nuevo, retroceso o bloqueo.
- `pnpm test`, `pnpm check` y `pnpm build` en verde.
- En el juego, comparar `app.stats.cpuUpdateTime` en una partida con 7 bots con
  y sin estos cambios, y el perfil de `sim-headless` con bots patrullando
  (`node --import tsx scripts/sim-headless.ts --map arena --bots 7 --seconds 60`).

---

## 3. Medición e infraestructura

### 3.1 Ampliar el benchmark para medir lo que de verdad importa

#### Qué pasa hoy

`src/performance/bench.ts:87-114` solo mide intervalos de `requestAnimationFrame`
(FPS, p50, p95, max). `scripts/bench-frame.mjs:222-229` imprime esa tabla. No se
registran draw calls, tiempo de CPU del motor, compilación de shaders, tareas
largas ni memoria, aunque la Parte 1 los pide como criterio.

#### Qué haría

1. En `measure()`, leer las métricas de `AppStats` (existen en release según los
   tipos de 2.24):
   - `app.stats.drawCallCount`, `app.stats.drawCalls.forward/total`.
   - `app.stats.cpuUpdateTime`, `app.stats.cpuRenderTime`,
     `app.stats.frameTime`, `app.stats.fps`.
   - `app.stats.shaders.compileTime`, `app.stats.shaders.linked`.
   - `app.stats.vram.tex` (memoria de texturas).
2. Añadir `PerformanceObserver({ entryTypes: ['longtask'] })` y
   `performance.memory` (Chrome).
3. Emitir JSON con percentiles y desglose por fase, y guardarlo como artefacto del
   workflow.
4. Añadir escenarios con HUD real (Playwright) para capturar el coste de
   composición, que el bench actual no ve.
5. Comparar contra la tabla de frame real de la Parte 1 en CI con umbrales relativos
   (por ejemplo p95 +5 %, draw calls +2 %, ninguna tarea larga nueva). SwiftShader
   sirve para tendencias; la tabla de GPU real sigue siendo la referencia manual.

#### Impacto

Convierte "creo que esto es más rápido" en una decisión medible y evita
regresiones al tocar efectos, texturas o UI.

---

### 3.2 Pre-bake del suelo y caché que sobreviva a la partida

#### Qué pasa hoy

El suelo de un mapa se pinta proceduralmente en `createGroundCanvasAsync` y se
cachea en un LRU (`src/game/textures.ts:1236-1297`). Pero `Game.dispose()` llama
`clearGroundCanvasCache()` (`src/game/game.ts:3854`). Como `useGameEngine` recrea
`Game` al cambiar de mapa (`src/screens/play/useGameEngine.ts:168`), la caché se
vacía justo cuando podría reutilizarse. El documento dice "volver a un mapa ya
visitado evita el repintado", pero en el flujo real de la app eso no ocurre.

#### Por qué cuesta

`perf-256` tarda ~460–620 ms en pintar el suelo y ~1,3 s en construir el mundo,
troceado. Repetirlo en cada carga de mapa es tiempo de CPU y jank evitable.

#### Qué haría

1. **Pre-bake en build** para los mapas incluidos: un script que use las mismas
   funciones puras (`mapRegions`, `groundTextureSize`,
   `createGroundCanvasAsync`) y escriba `maps/<id>-ground.webp` (o PNG). En
   runtime, `createImageBitmap` desde la URL y crear la textura directamente. El
   generador de previews (`scripts/generate-map-previews.mjs`) ya tiene la
   infraestructura.
2. Mantener el camino procedural solo para el editor y mapas personalizados.
3. No vaciar el LRU en `dispose`; moverlo a nivel de sesión o dejar que su
   presupuesto de píxeles (`GROUND_CANVAS_CACHE_PIXELS = 16M`) haga la evacuación.
   Si se quiere liberar memoria, hacerlo al salir de la app, no al cambiar de
   mapa.
4. Opcional: mover el pintado procedural a un `OffscreenCanvas` en un Worker para
   eliminar por completo el bloqueo del hilo principal cuando el mapa no esté
   pre-horneado.
5. Cachear el PNG/WebP y los JSON en Cache Storage.

#### Impacto

Elimina ~0,5 s de CPU por mapa visitado en el caso normal y evita repetir la
generación al volver atrás. Reduce tareas largas de carga.

#### Cómo verificarlo

Medir `applyMapRuntime` y el tiempo de `createGroundCanvasAsync` en consola;
`PerformanceObserver` de longtasks con y sin pre-bake.

---

### 3.3 Bundle y caché de chunks

#### Qué pasa hoy

`dist/assets/game-*.js` pesa 1,8 MB (incluye PlayCanvas y todo el código de
juego) y `main-*.js` 342 KB + 109 KB de CSS. No hay `manualChunks` ni
`codeSplitting` ni precarga del chunk de `/play`.

#### Por qué cuesta

Cada deploy cambia el hash del chunk de 1,8 MB, así que el navegador lo vuelve a
descargar entero aunque solo haya cambiado una línea de UI. PlayCanvas es la mayor
parte y cambia poco.

#### Qué haría

1. Separar en chunks estables: `playcanvas`, `react`/`react-dom` y el código de
   juego. En Vite 8 el bundler es **Rolldown**: `manualChunks` está deprecado y ya
   no acepta objeto; hay que usar
   `build.rollupOptions.output.codeSplitting.groups` (o `advancedChunks.groups`,
   también deprecado) con grupos por `test`. Ejemplo conceptual:

   ```ts
   build: {
     rollupOptions: {
       output: {
         codeSplitting: {
           groups: [
             { name: 'playcanvas', test: /node_modules[\\/]playcanvas/ },
             {
               name: 'react',
               test: /node_modules[\\/](react|react-dom|wouter)/
             }
           ]
         }
       }
     }
   }
   ```

2. Precargar el chunk de `/play` al entrar en lobby/roster o al hacer hover sobre
   "Jugar", no en el menú inicial. Con `modulepreload` o un `import()` en idle.
3. Comprobar la compresión del hosting: GitHub Pages comprime; Wails sirve desde
   `embed.FS` y no comprime, así que para escritorio conviene generar `.gz`/`.br` y
   servirlos, o al menos usar Brotli en el empaquetado.
4. No partir en exceso: el objetivo es que `playcanvas` tenga hash estable, no
   llenar la red de requests.

#### Impacto

Segundas visitas y actualizaciones mucho más baratas; el usuario descarga el motor
una vez y luego solo el delta.

---

### 3.4 HUD de rendimiento interno

#### Qué pasa hoy

Solo hay un badge de FPS alimentado por `PlayerMatchStats`
(`src/screens/PlayScreen.tsx:59-87`), que se emite dos veces por segundo. No hay
forma de ver draw calls, tiempo de update/render, VRAM o número de efectos sin
abrir DevTools.

#### Qué haría

Un overlay opcional (tecla de debug o query `?perf`) que muestre:

- `app.stats.drawCallCount`, `drawCalls.forward`, `drawCalls.instanced`.
- `app.stats.cpuUpdateTime`, `cpuRenderTime`, `frameTime`, FPS real.
- `app.stats.vram.tex` y número de materiales/efectos activos.
- Por vista: píxeles de viewport, copias visibles, efectos visibles.

#### Impacto

Es la herramienta que permite validar cada uno de los cambios anteriores en la app
real, no solo en el bench sintético. También sirve para que los jugadores reporten
problemas con datos.

---

## Orden de implementación recomendado

1. **Caché HTTP y `clearGroundCanvasCache`** (bajo riesgo, efecto inmediato en
   recargas y cambios de mapa).
2. **Escala adaptativa + mipmaps** (mayor ahorro de VRAM; requiere validación
   visual en 1 y 8 vistas).
3. **Audio por roster + música en streaming** — **hecho** (mayor ahorro de
   memoria después de las texturas).
4. **Quitar blur del HUD en partida y medir composición**.
5. **Amortizar visibilidad y conocimiento de objetos** - **hecho** (20 Hz con
   eventos inmediatos y conocimiento de objetos por índice).
6. **Sombras instanciadas y LOD de contornos en viewports pequeños** -
   **hecho** (una instancia de sombra por vista y contorno dentro del material
   del sprite; la silueta se omite solo en pantallas diminutas).
7. **Bench con `AppStats` + longtasks + CI**.
8. **Pre-bake de suelos y `codeSplitting`**.

## Criterios de aceptación

- p95 de frame dentro de ±5 % en GPU real.
- Draw calls iguales o menores que la baseline (cámara y seed fijos).
- `vram.tex` claramente menor con 8 vistas.
- Ninguna tarea larga nueva durante la carga.
- Mismo aspecto en la comparación visual 1 / 4 / 8 vistas.
- Segunda carga del manifiesto y de los mapas desde caché (304 o disco).

---

### Notas

- Las cifras de VRAM y audio son estimaciones calculadas a partir del manifiesto
  y de los archivos de `public/audio` (bitrate, duración y canales). Sirven para
  comparar órdenes de magnitud, no como medición exacta del driver.
- Las APIs `Texture#releaseSources`, `Texture#setReleaseSourceAfterUpload` y
  `AppStats.user` están marcadas como internas en algunos casos; conviene
  aislarlas detrás de un helper con fallback.
- `manualChunks` y `advancedChunks` están deprecados en Rolldown 1.2; la opción
  vigente es `output.codeSplitting`.
