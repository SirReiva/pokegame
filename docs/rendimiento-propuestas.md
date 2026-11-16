# Propuestas de rendimiento para NewPoke

> Revisión técnica · noviembre de 2026
>
> Base de partida: `docs/performance/frame-baseline.md` (60 FPS estables en las 9
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

> **Estado (noviembre de 2026): implementado.** `configureAudio()` ya no
> precarga nada; `prepareMatchAudio()` carga solo las rutas del roster y
> `releaseMatchAudio()` las libera al terminar. La música se reproduce con un
> `<audio loop>` en streaming. Queda pendiente el reencodeo opcional a Opus.

### Qué pasaba antes

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

### Qué se cambió

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

### Impacto

Se pasa de hasta ~200 MB de PCM residentes a unos 50–55 MB en el peor caso
(unas 30 habilidades únicas de 8 especies, más impactos e instintos) y la música
deja de ocupar ~67 MB. La carga del mapa ya no compite por red y memoria con 73
MP3, y cambiar de roster no acumula buffers.

### Cómo verificarlo

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

> **Estado (noviembre de 2026): implementado.** `VisibilityCadence`
> (`src/game/sim/visibilityCadence.ts`) recalcula la visibilidad de actores a
> 20 Hz mientras alguien se mueve y la fuerza en el mismo paso ante daño
> recibido, ocultación, casteo, muerte/respawn o cambio de equipo/atmósfera. El
> conocimiento de objetos pasa a 7,5 Hz, se indexa por `PickupSpawn.id` y usa un
> `Int8Array` por equipo. Quedan contadores en `app.stats.user` y un benchmark
> sintético en `bench-core`.

### Qué pasaba antes

- `refreshCombatVisibility()` se ejecutaba al final de **cada paso fijo de 60 Hz**
  (`src/game/game.ts`). Es O(n²): recorría observadores × objetivos y hacía una
  comprobación de línea de visión (`src/game/sim/visibility.ts`). Con 8 actores
  eran 56 comprobaciones por paso, ~3 360/s.
- `updatePickupKnowledge()` se ejecutaba en **cada frame de render**
  (`src/game/render/visionView.ts`). Iteraba objetos × equipos, creaba strings
  `"team:x:z"` y closures (`src/game/game.ts`) y hacía LOS por cada objeto
  visible. La visibilidad de cada copia de viewport repetía además la misma LOS
  que el equipo ya había resuelto.

### Por qué costaba

La línea de visión usa una rejilla espacial (`SightIndex`), pero sigue recorriendo
celdas y colliders. Los objetos del mapa no se mueven: recalcular su visibilidad
60 veces por segundo es trabajo repetido. Además, las claves string y los
closures generaban basura constante.

### Qué se cambió

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

### Impacto

El coste O(n²) pasa de 60 a 20 cálculos por segundo (3× menos) y desaparece
cuando la partida está quieta; el conocimiento de objetos baja de 60 a 7,5 Hz
(8× menos) y deja de repetir LOS por viewport. También se eliminan las
allocations de strings/closures por frame. No cambia el gameplay porque
`enemiesSeeing` solo alimenta el HUD y la regeneración (que exige 2 s sin ser
visto) y los bots ya toleraban la latencia de su decisión.

### Cómo verificarlo

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

## 2.2 Draw calls del splitscreen: contornos, siluetas y sombras

> **Estado (noviembre de 2026): implementado.** El contorno de equipo pasó al
> material del sprite (`alphaTestPS` + `emissivePS`, GLSL y WGSL), las sombras de
> contacto se dibujan con una instancia por viewport (`ActorShadowBatch`) y la
> silueta se omite en viewports diminutos (`spriteDetail.ts`). El contorno se
> mantiene en todos los tamaños: es información de equipo, no decoración.

### Qué pasaba antes

Cada copia creaba un `render` con 2–3 `MeshInstance`:

- sprite,
- silueta (`depthFunc = GREATER`, visible en la copia del dueño),
- contorno de equipo (solo copias ajenas).

Además, cada copia añadía una entidad y un componente de render solo para su
sombra de contacto, y los dueños un anillo. Con 8 vistas eran 64 copias, 64
sombras y 16 anillos: cada copia visible costaba hasta 4 draw calls (sprite,
silueta, contorno y sombra) más el anillo del dueño.

### Qué se cambió

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

### Impacto

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

### Cómo verificarlo

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

> **Estado (noviembre de 2026): implementado.** `updateMaterialIfChanged()`
> (`src/game/render/fx/materialUpdates.ts`) guarda en un `WeakMap` la última
> opacidad, tinte e intensidad emisiva aplicados a cada material y solo llama a
> `update()` cuando alguno cambia. Se usa en el bucle central de efectos y marcas
> de área, en los avances por frame de proyectiles y haces y en los números de
> daño. El seguimiento reutiliza el mismo objeto por material, así que no añade
> basura. Cubierto por `src/game/__tests__/materialUpdates.test.ts`. Queda
> pendiente mover la animación a shaders por estilo y el presupuesto de efectos
> por vista.

### Qué pasaba antes

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

### Por qué cuesta

`material.update()` no es un setter: convierte las propiedades modificadas al
uniform buffer, recalcula los transforms de texturas (`_mapTransforms`) y sube
el buffer completo en el siguiente render. Llamarlo 60 veces por segundo por
material cuando el valor es idéntico es trabajo de CPU y ancho de banda de
uniformes que no cambia un solo píxel. Con varios materiales por efecto y varias
vistas, el coste se multiplica en los picos de combate.

### Qué se cambió

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

### Impacto

Menos subidas de uniform buffer en combates con muchas áreas simultáneas, sin
cambios visuales. Los materiales estáticos de un efecto (aros, halos, piezas que
solo rotan) dejan de pagar `update()` cada frame, y los números de daño ahorran
la mitad de sus actualizaciones.

### Qué queda pendiente

- Mover la animación de opacidad de los efectos puramente temporales a un shader
  con `uEffectTime`, para actualizar un material por estilo en vez de uno por
  entidad. Ya hay precedente en `MOTION_PRIMORDIAL_*` y en las partículas
  ambientales.
- Presupuesto de efectos simultáneos por vista, descartando o simplificando los
  que caen en viewports pequeños.

### Cómo verificarlo

Contar efectos/materiales activos en `app.stats.user` junto a
`app.stats.cpuUpdateTime` en un escenario de estrés (8 bots spameando áreas), y
comparar el perfil con y sin el dirty-check. El test unitario cubre la lógica de
decisión; la medición real queda para el HUD de rendimiento (3.4).

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

### Qué pasaba antes

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

### Por qué cuesta

A 60 Hz con 7 bots son cientos de objetos pequeños por segundo: el array y los
peligros de cada paso, la lista de enemigos visibles de cada bot y las cuatro
vistas de equipo. Las búsquedas de refugio son peores: con 10 intentos, 13
muestras de trayecto y 3 rivales se creaban hasta ~780 objetos por llamada
(observador + objetivo por muestra), y hasta ~1 500 al buscar cobertura de
retirada. No es el cuello de botella, pero alimenta el GC y produce picos de
frame en partidas largas, sobre todo cuando coinciden con ráfagas de proyectiles
y regeneración.

### Qué se cambió

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

### Impacto

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

### Qué queda pendiente

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

### Cómo verificarlo

Los tests de `hazards.test.ts` comprueban identidad de array y de objetos,
recorte del array visible, conservación del pool y cambio de `kind` sin datos
activos. La segunda pasada mantiene verdes `pnpm check`, `pnpm test` y
`node --import tsx scripts/sim-headless.ts --map arena --bots 4 --seconds 60`,
que ejercita movimiento, dash, colisiones y casteos sin GPU. Para el resto,
Chrome DevTools → Memory → Allocation instrumentation con 8 bots y una lluvia de
proyectiles: el número de objetos por paso debe caer sin mover
`app.stats.cpuUpdateTime`.

---

# 3. Medición e infraestructura

## 3.1 Ampliar el benchmark para medir lo que de verdad importa

### Qué pasa hoy

`src/performance/bench.ts:87-114` solo mide intervalos de `requestAnimationFrame`
(FPS, p50, p95, max). `scripts/bench-frame.mjs:222-229` imprime esa tabla. No se
registran draw calls, tiempo de CPU del motor, compilación de shaders, tareas
largas ni memoria, aunque `docs/performance/baseline.md` los pide como criterio.

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
5. Comparar contra `docs/performance/frame-baseline.md` en CI con umbrales relativos
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
