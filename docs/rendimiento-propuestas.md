# Propuestas de rendimiento para NewPoke

> Revisión técnica · noviembre de 2026
>
> Base de partida: `performance/frame-baseline.md` (60 FPS estables en las 9
> combinaciones mapa × vistas con GPU real) y las optimizaciones ya aplicadas en
> `docs/rendimiento-carga-mapas.md`.
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
3. [Medición e infraestructura](#3-medición-e-infraestructura)
   - [3.1 Ampliar el benchmark](#31-ampliar-el-benchmark-para-medir-lo-que-de-verdad-importa)
   - [3.2 Pre-bake del suelo y caché persistente](#32-pre-bake-del-suelo-y-caché-que-sobreviva-a-la-partida)
   - [3.3 Bundle y caché de chunks](#33-bundle-y-caché-de-chunks)
   - [3.4 HUD de rendimiento interno](#34-hud-de-rendimiento-interno)
4. [Orden de implementación](#orden-de-implementación-recomendado)
5. [Criterios de aceptación](#criterios-de-aceptación)

---

# 1. Memoria y ancho de banda

## 1.1 Escala de texturas adaptativa al tamaño real del viewport

### Qué pasa hoy

`CONFIG.sprite.smoothScale = 4` (`src/game/config.ts:106`) fija un objetivo de
×4 para todas las hojas. `planTextureScales()` (`src/game/sprite.ts:237-293`)
solo baja esa escala cuando la suma supera `budgetMB`, que se calcula con
`detectSpriteBudget()` y suele quedar en 64 MB por aspecto en GPUs integradas y
96 MB en dedicadas (`src/game/spriteBudget.ts:38-54`). El presupuesto es un
**tope**, no una estimación de lo que realmente se necesita.

### Por qué cuesta

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

### Qué haría

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

### Impacto

3–4× menos VRAM sin pérdida perceptible en splitscreen; en 1 vista se conserva
×4. Además reduce el tiempo de subida a GPU y el riesgo de desalojar texturas.

### Cómo verificarlo

`app.stats.vram.tex` existe en PlayCanvas 2.24 y expone el contador de VRAM de
texturas. Añadirlo al HUD/bench y comparar 1/4/8 vistas. Medir también
`performance.memory.usedJSHeapSize`, porque los canvas temporales también
cuentan.

### Riesgo

Es un cambio visual: validarlo con `--gpu` real en 1 y 8 vistas. Recomendación:
aplicarlo automáticamente según `humanConfigs.length` y permitir forzar "Calidad"
en Opciones.

---

## 1.2 Mipmaps en las hojas de sprite

### Qué pasa hoy

`createSpriteTexture()` crea la textura con `mipmaps: false` y
`minFilter: filter` (`src/game/sprite.ts:467-480`).

### Por qué cuesta

En splitscreen los sprites se dibujan **minificados** (su huella en pantalla es
menor que la textura). Sin mips, el hardware muestrea un nivel de detalle fijo:
aparecen parpadeos al mover la cámara, aliasing en el contorno y se pierde
localidad de caché de textura (más ancho de banda por frame). Es un problema de
calidad y de rendimiento de muestreo.

### Qué haría

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

### Impacto

Más estabilidad visual y menos thrash de textura; +33 % de memoria, que el punto
1.1 compensa con creces.

### Riesgo

Con `alphaTest = 0.5` y `alphaToCoverage`, los mips promedian alfa y pueden
erosionar el borde 1 px. Probar el contorno y, si se nota, generar mips con
cobertura alfa preservada o mantener `mipmaps: false` solo en `nearest`. En
`smooth` + ×2 debería ser aceptable.

---

## 1.3 Audio: carga por roster y música fuera del AudioBuffer

### Qué pasa hoy

`configureAudio()` precarga **todos** los SFX al crear la app
(`src/game/audio.ts:86-88`) y lanza la música (`loadSound(MATCH_MUSIC_PATH)`).
`preloadAudio()` recorre `ALL_SFX_PATHS` con 6 workers (`audio.ts:140-153`).
PlayCanvas carga cada audio con `fetch` + `decodeAudioData` (verificado en
`playcanvas.mjs:103845-103885`), y `Sound.buffer` retiene el `AudioBuffer`
decodificado.

### Por qué cuesta

- `public/audio` son ~20 MB: 73 SFX (12,4 MB) y una música de 7,2 MB a 320 kbps.
- Los SFX rondan los 5 s a 320 kbps; 73 × 5 s a 44,1 kHz estéreo Float32 son
  **~130 MB de PCM**. La música de 3,2 min añade **~67 MB**. En total, del orden
  de **200 MB residentes** durante la partida, además del coste de decodificar y
  de competir por red con las hojas de sprite durante la carga.
- `disposeAudio()` hace `sounds.clear()` pero no descarga los assets
  (`Asset.unload()`); al destruir la app se libera, pero en un cambio de mapa con
  `Game` nuevo se vuelve a descargar y decodificar todo.

### Qué haría

1. Precargar solo lo que va a sonar en esa partida: las 4 habilidades + instinto
   común de cada especie seleccionada, más `HIT_SOUNDS` y
   `proteccion`/`impulso`. El resto, bajo demanda al primer casteo (el camino ya
   existe en `playSound()` para "primera reproducción antes de la precarga").
2. Guardar una referencia al `Asset` para poder hacer `asset.unload()` al
   terminar la partida.
3. Música: al ser un loop largo, reproducirla con un `<audio loop>` /
   `MediaElementSource` en vez de decodificar 3,2 min en un `AudioBuffer`. Si se
   mantiene PlayCanvas, cargarla solo al empezar la partida y no en
   `configureAudio()`.
4. Reencodeo opcional a Opus 96–128 kbps para bajar descarga (la memoria
   decodificada depende de la duración, no del bitrate).

### Impacto

Reduce el pico de memoria en ~150–180 MB, acelera la carga y evita descargar
sonidos de Pokémon que no juegan.

### Cómo verificarlo

Chrome DevTools → Memory: comparar "AudioBuffers" y JS heap antes y después;
contar peticiones de red en la pantalla de carga. En el bench,
`performance.measureUserAgentSpecificMemory()` si está disponible, o
`performance.memory`.

---

## 1.4 Caché HTTP real para manifiesto y mapas

### Qué pasa hoy

- `loadManifest()` en `src/session/SessionProvider.tsx:56-58` y el fallback de
  `src/game/game.ts:1252-1254` piden
  `sprites/manifest.json?v=${Date.now()}`.
- `fetchJson()` en `src/game/map.ts:47` usa `cache: 'no-store'`.

### Por qué cuesta

`Date.now()` crea una URL distinta en cada carga: el navegador **no puede
reutilizar** la respuesta ni responder 304, aunque el archivo no haya cambiado.
En GitHub Pages o en Wails eso significa volver a descargar 3,5 MB de manifiesto
y hasta 560 KB de mapa en cada recarga o cambio de mapa. `no-store` hace lo mismo
con el índice de mapas y los JSON de mapa.

### Qué haría

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

### Impacto

Recargas mucho más rápidas, menos datos y menos pico de memoria de objetos. El
punto 4 elimina trabajo de parseo proporcional al roster, no al catálogo
completo.

### Cómo verificarlo

DevTools → Network: la segunda carga debe ser "disk cache"/304, no 200. Medir el
tiempo de `bootStatus === 'loading'` a `'ready'` antes y después.

---

## 1.5 Camino de subida de texturas: menos canvas intermedios y liberar fuentes

### Qué pasa hoy

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

### Por qué cuesta

Para una hoja de 4096² cada canvas intermedio son ~67 MB de RAM temporal; con 8
especies en paralelo el pico puede superar fácilmente el GB, provocar GC y jank
durante la pantalla de carga. En Wails/WebView es especialmente sensible.

### Qué haría

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

### Impacto

Menos pico de RAM, menos GC y menos bloqueo de carga, con el mismo resultado
visual.

### Cómo verificarlo

DevTools Performance durante la carga: "JS heap", "GC" y tareas largas.
`app.stats.vram.tex` y el tiempo de `loadSpriteAsset` por especie.

---

# 2. CPU por frame y draw calls

## 2.1 Amortizar visibilidad de actores y conocimiento de objetos

### Qué pasa hoy

- `refreshCombatVisibility()` se ejecuta al final de **cada paso fijo de 60 Hz**
  (`src/game/game.ts:2289`). Es O(n²): recorre observadores × objetivos y hace una
  comprobación de línea de visión (`src/game/sim/visibility.ts:96-138`). Con 8
  actores son 56 comprobaciones por paso, ~3 360/s.
- `updatePickupKnowledge()` se ejecuta en **cada frame de render**
  (`src/game/render/visionView.ts:127`). Itera objetos × equipos, crea strings
  `"team:x:z"` y closures (`src/game/game.ts:3670-3702`), y hace LOS por cada
  objeto visible.

### Por qué cuesta

La línea de visión usa una rejilla espacial (`SightIndex`), pero sigue recorriendo
celdas y colliders. Los objetos del mapa no se mueven: recalcular su visibilidad
60 veces por segundo es trabajo repetido. Además, las claves string y los
closures generan basura constante.

### Qué haría

1. Ejecutar la visibilidad de actores a 20 Hz (cada 3 pasos) y mantener la última
   foto entre medias. La histéresis de `CONFIG.vision.hysteresis` ya tolera ese
   retardo. Forzar un refresco inmediato en eventos: daño recibido, casteo,
   `hidden`, muerte/respawn o cambio de equipo.
2. Alternativa más fina: repartir los pares observador-objetivo entre pasos (la
   mitad en cada paso), de modo que cada objetivo se reevalúe a 30 Hz sin picos.
3. Saltar el cálculo si ningún actor se movió más de un épsilon (`moveEpsilon` ya
   existe para la máscara de niebla) o si no cambió el conjunto de vivos.
4. Bajar `updatePickupKnowledge` a 5–10 Hz o dispararlo solo cuando cambie el
   estado de un pickup (`collect`) o la posición de un observador. Cambiar las
   claves string por un índice numérico del spawn y arrays por equipo en vez de un
   `Map<string, boolean>`.

### Impacto

Reduce ~2/3 el coste de LOS en simulación y elimina la mayor parte de las
allocations por frame. No cambia el gameplay porque `enemiesSeeing` solo alimenta
el HUD y la regeneración (que exige 2 s sin ser visto).

### Cómo verificarlo

Añadir contadores `app.stats.user` con `set('losChecks', …)` y medir
`cpuUpdateTime`. En Node, ampliar `scripts/bench-core.mjs` con un benchmark de
`refreshCombatVisibility` sintético.

---

## 2.2 Draw calls del splitscreen: contornos, siluetas y sombras

### Qué pasa hoy

Cada copia crea un `render` con 2–3 `MeshInstance`:

- sprite,
- silueta (`depthFunc = GREATER`, visible en la copia del dueño),
- contorno de equipo (solo copias ajenas).

Está en `src/game/sprite.ts:956-984` y la creación de copias en
`src/game/app/matchSession.ts:615-637`. Cada copia añade además una sombra de
contacto (`src/game/actor.ts:107-116`) y los dueños un anillo. Con 8 vistas hay 64
copias, 64 sombras y 16 anillos. El documento de rendimiento cuenta 269 draw calls
totales en 8 vistas; el reparto exacto conviene re-medirlo porque los
contornos/siluetas añaden instancias que la tabla no desglosa.

### Qué haría, por orden de relación impacto/riesgo

1. **LOD por viewport:** si el área del viewport es pequeña (8 jugadores),
   desactivar contorno de equipo, silueta y quizá sombra de contacto en las
   copias ajenas. A 1/8 de pantalla no se perciben y ahorran decenas de draw
   calls. Es un `if` en la creación o en `syncMatchView`.
2. **Sombras instanciadas por vista:** las 8 sombras comparten malla, material y
   textura; solo cambia la matriz. El proyecto ya usa
   `MeshInstance.setInstancing(vb)` + `instancingCount` en
   `src/game/render/world/foliage.ts` (y cactus). Un `VertexBuffer` dinámico por
   vista con 8 matrices reduce 64 sombras a 8 draw calls (una por viewport).
3. **Fusionar contorno y sprite en un solo material:** dibujar el sprite con un
   shader que dilate el alfa (4–8 taps) para el borde de equipo. Pasa de 2 draw
   calls por copia a 1, a cambio de más muestras de textura en los píxeles
   visibles del sprite (pocos). Hay que medirlo: no siempre gana en GPUs
   integradas.

### Impacto

Los puntos 1 y 2 pueden quitar ~60–70 draw calls de los 269 de 8 vistas sin tocar
la simulación. El punto 3 es más agresivo pero localizado.

### Cómo verificarlo

`app.stats.drawCalls.forward`, `app.stats.drawCallCount` y
`removedByInstancing`. Hacer la medición con cámara fija como advierte el propio
documento (los respawns cambian el culling).

---

## 2.3 Quitar `backdrop-blur` del HUD durante la partida

### Qué pasa hoy

El HUD de partida usa `backdrop-blur` en muchos elementos: `MatchHud.tsx` (kill
feed, paneles de habilidades, cabecera), `src/screens/PlayScreen.tsx:78` (FPS) y
`MatchDialogs.tsx` al pausar. En ese momento debajo hay un canvas WebGL vivo y,
en partida, además un canvas 2D de barras (`HealthBarOverlay`).

### Por qué cuesta

Un `backdrop-filter` obliga al compositor a crear una superficie de render aparte,
**leer el fondo ya compuesto** (canvas WebGL + canvas de barras), aplicar el
desenfoque y volver a mezclar. Con una docena de elementos desenfocados hay una
docena de superficies offscreen que se recalculan cuando cambia cualquier cosa
detrás (es decir, cada frame). En 8 vistas el compositor ya está haciendo un
trabajo considerable.

### Qué haría

1. En partida, sustituir `backdrop-blur-*` por fondos semitransparentes opacos
   (`bg-night-850/85`), que se leen igual.
2. Dejar el blur solo en pausa, menús, lobby y editor, donde el canvas 3D está
   congelado o no existe.
3. Si se quiere conservar el efecto, activarlo solo cuando el FPS supera 55 y
   desactivarlo con `dynamicResolution`; o un preset "Rendimiento" que lo quite.

### Impacto

Cada elemento con blur deja de crear una superficie de composición. En equipos
integrados y en WebView suele ser uno de los mayores ahorros fuera del propio
motor.

### Cómo verificarlo

Chrome DevTools → Rendering → "Layer borders" y "Paint flashing"; grabar un
perfil con y sin blur en 8 vistas. El bench actual **no monta el HUD de React**,
así que este coste no aparece en `pnpm bench:frame`; hay que medirlo con la
pantalla real o un test E2E.

---

## 2.4 Evitar `material.update()` innecesarios en efectos y números de daño

### Qué pasa hoy

- `fxRuntime.update()` llama `material.update()` por cada material de cada marca
  de área (`src/game/render/fx/fxRuntime.ts:1302`) y por cada material de cada
  efecto activo (`:1322`).
- `damageNumbers.update()` hace lo mismo por cada número activo
  (`src/game/damageNumbers.ts:576`).
- Hay efectos con varios materiales (hasta 5–8 en un área compleja).

### Por qué cuesta

`material.update()` no es un simple setter: marca el material como dirty,
recalcula uniforms y, en algunos casos, puede provocar recompilación de variantes
si cambian defines. Hacerlo 60 veces por segundo por cada material activo,
aunque el valor no haya cambiado, es trabajo puro de CPU y presión sobre el
estado gráfico.

### Qué haría

1. Guardar el último valor de `opacity`, offsets UV, color, etc. y llamar a
   `update()` solo si cambia. Es un patrón de "dirty flag" por material.
2. Para efectos puramente temporales, mover la animación al vertex/fragment
   shader con un uniform de tiempo (`uEffectTime`) y actualizar **un material por
   estilo**, no uno por entidad. Esto ya se hace en `MOTION_PRIMORDIAL_*` y en las
   partículas ambientales (`batchedParticles.ts`), así que hay precedente en el
   proyecto.
3. Poner un presupuesto de efectos simultáneos por vista: descartar o simplificar
   efectos que caen en viewports de área pequeña (8 jugadores) o a mucha
   distancia. El `applyVisibility()` ya decide capas; ahí se puede añadir "si el
   viewport es pequeño, no dibujar este estilo".
4. Los números de daño ya usan atlas y pool de ranuras; conviene agrupar la
   opacidad en un solo material compartido o bajar la frecuencia de actualización
   a 30 Hz (el fade dura ~1 s y no se nota).

### Impacto

Menos ms de CPU en combates con muchas áreas simultáneas y menos picos al castear
definitivas.

### Cómo verificarlo

Contar efectos/materiales activos en `app.stats.user` y medir `cpuUpdateTime`.
Probar un escenario de estrés (8 bots spameando áreas) con y sin el dirty-check.

---

## 2.5 Presets de calidad automáticos por tier de GPU

### Qué pasa hoy

`src/game/graphicsSettings.ts` solo guarda el backend (`auto`/`webgpu`/`webgl2`).
El resto de parámetros son constantes en `CONFIG`: `antialias: true` siempre
(`src/game/appBootstrap.ts:37`), `smoothScale: 4`, `alphaToCoverage: true`,
`mipmaps: false`, densidad de efectos fija.

### Por qué cuesta

Un equipo integrado y un portátil con GPU dedicada reciben exactamente la misma
configuración, salvo el `maxPixelRatio` que se limita a 1,2 cuando hay más de 4
humanos (`src/game/app/matchSession.ts:399-401`) y la resolución dinámica
(`src/game/render/dynamicResolution.ts`). Ya existe una clasificación de GPU
fiable en `src/game/spriteBudget.ts` (`software`/`integrated`/`discrete`), pero no
se usa para nada más.

### Qué haría

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

### Impacto

Evita que un equipo `software` o `integrated` sufra una configuración pensada para
una dedicada, y da al usuario una palanca clara.

### Cómo verificarlo

Ejecutar el bench en los 9 escenarios con cada preset, con `--gpu` y SwiftShader;
comparar FPS, draw calls y memoria.

---

## 2.6 Micro-GC en simulación

### Qué pasa hoy

Aunque el bucle principal está muy limpio, quedan allocations por paso:

- `this.visibleEnemies = []` en `updateTarget` (`src/game/bot.ts:1251`).
- `buildBotHazards()` devuelve un array nuevo por paso
  (`src/game/ai/hazards.ts:13-51`).
- `src/game/game.ts:2215-2236` crea `botViews` con cuatro objetos por paso.

### Por qué cuesta

A 60 Hz con 7 bots son cientos de objetos pequeños por segundo. No es el cuello de
botella, pero contribuye a GC y a picos de frame en partidas largas.

### Qué haría

Reutilizar arrays/objetos con `length = 0` y buffers por equipo, como ya se hace
con `fxVisibilityCache` y `pickupSeenScratch`. También se puede cachear
`getBotObjective()` una vez por paso en lugar de llamarlo cuatro veces.

### Impacto

Bajo, pero barato y alineado con el resto del código. Lo dejaría para una limpieza
posterior a los puntos grandes.

---

# 3. Medición e infraestructura

## 3.1 Ampliar el benchmark para medir lo que de verdad importa

### Qué pasa hoy

`src/performance/bench.ts:87-114` solo mide intervalos de `requestAnimationFrame`
(FPS, p50, p95, max). `scripts/bench-frame.mjs:222-229` imprime esa tabla. No se
registran draw calls, tiempo de CPU del motor, compilación de shaders, tareas
largas ni memoria, aunque `performance/baseline.md` los pide como criterio.

### Qué haría

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
5. Comparar contra `performance/frame-baseline.md` en CI con umbrales relativos
   (por ejemplo p95 +5 %, draw calls +2 %, ninguna tarea larga nueva). SwiftShader
   sirve para tendencias; la tabla de GPU real sigue siendo la referencia manual.

### Impacto

Convierte "creo que esto es más rápido" en una decisión medible y evita
regresiones al tocar efectos, texturas o UI.

---

## 3.2 Pre-bake del suelo y caché que sobreviva a la partida

### Qué pasa hoy

El suelo de un mapa se pinta proceduralmente en `createGroundCanvasAsync` y se
cachea en un LRU (`src/game/textures.ts:1236-1297`). Pero `Game.dispose()` llama
`clearGroundCanvasCache()` (`src/game/game.ts:3854`). Como `useGameEngine` recrea
`Game` al cambiar de mapa (`src/screens/play/useGameEngine.ts:168`), la caché se
vacía justo cuando podría reutilizarse. El documento dice "volver a un mapa ya
visitado evita el repintado", pero en el flujo real de la app eso no ocurre.

### Por qué cuesta

`perf-256` tarda ~460–620 ms en pintar el suelo y ~1,3 s en construir el mundo,
troceado. Repetirlo en cada carga de mapa es tiempo de CPU y jank evitable.

### Qué haría

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

### Impacto

Elimina ~0,5 s de CPU por mapa visitado en el caso normal y evita repetir la
generación al volver atrás. Reduce tareas largas de carga.

### Cómo verificarlo

Medir `applyMapRuntime` y el tiempo de `createGroundCanvasAsync` en consola;
`PerformanceObserver` de longtasks con y sin pre-bake.

---

## 3.3 Bundle y caché de chunks

### Qué pasa hoy

`dist/assets/game-*.js` pesa 1,8 MB (incluye PlayCanvas y todo el código de
juego) y `main-*.js` 342 KB + 109 KB de CSS. No hay `manualChunks` ni
`codeSplitting` ni precarga del chunk de `/play`.

### Por qué cuesta

Cada deploy cambia el hash del chunk de 1,8 MB, así que el navegador lo vuelve a
descargar entero aunque solo haya cambiado una línea de UI. PlayCanvas es la mayor
parte y cambia poco.

### Qué haría

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

### Impacto

Segundas visitas y actualizaciones mucho más baratas; el usuario descarga el motor
una vez y luego solo el delta.

---

## 3.4 HUD de rendimiento interno

### Qué pasa hoy

Solo hay un badge de FPS alimentado por `PlayerMatchStats`
(`src/screens/PlayScreen.tsx:59-87`), que se emite dos veces por segundo. No hay
forma de ver draw calls, tiempo de update/render, VRAM o número de efectos sin
abrir DevTools.

### Qué haría

Un overlay opcional (tecla de debug o query `?perf`) que muestre:

- `app.stats.drawCallCount`, `drawCalls.forward`, `drawCalls.instanced`.
- `app.stats.cpuUpdateTime`, `cpuRenderTime`, `frameTime`, FPS real.
- `app.stats.vram.tex` y número de materiales/efectos activos.
- Por vista: píxeles de viewport, copias visibles, efectos visibles.

### Impacto

Es la herramienta que permite validar cada uno de los cambios anteriores en la app
real, no solo en el bench sintético. También sirve para que los jugadores reporten
problemas con datos.

---

# Orden de implementación recomendado

1. **Caché HTTP y `clearGroundCanvasCache`** (bajo riesgo, efecto inmediato en
   recargas y cambios de mapa).
2. **Escala adaptativa + mipmaps** (mayor ahorro de VRAM; requiere validación
   visual en 1 y 8 vistas).
3. **Audio por roster + música en streaming** (mayor ahorro de memoria después de
   las texturas).
4. **Quitar blur del HUD en partida y medir composición**.
5. **Amortizar visibilidad y conocimiento de objetos**.
6. **Sombras instanciadas y LOD de contornos en viewports pequeños**.
7. **Bench con `AppStats` + longtasks + CI**.
8. **Pre-bake de suelos y `codeSplitting`**.

# Criterios de aceptación

- p95 de frame dentro de ±5 % en GPU real.
- Draw calls iguales o menores que la baseline (cámara y seed fijos).
- `vram.tex` claramente menor con 8 vistas.
- Ninguna tarea larga nueva durante la carga.
- Mismo aspecto en la comparación visual 1 / 4 / 8 vistas.
- Segunda carga del manifiesto y de los mapas desde caché (304 o disco).

---

## Notas

- Las cifras de VRAM y audio son estimaciones calculadas a partir del manifiesto
  y de los archivos de `public/audio` (bitrate, duración y canales). Sirven para
  comparar órdenes de magnitud, no como medición exacta del driver.
- Las APIs `Texture#releaseSources`, `Texture#setReleaseSourceAfterUpload` y
  `AppStats.user` están marcadas como internas en algunos casos; conviene
  aislarlas detrás de un helper con fallback.
- `manualChunks` y `advancedChunks` están deprecados en Rolldown 1.2; la opción
  vigente es `output.codeSplitting`.
