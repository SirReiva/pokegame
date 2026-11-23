# Instrumentación GPU (`gpuTrace`)

Implementada en `src/game/render/gpuTrace.ts` y activada desde la construcción
de `Game`. Sirve para responder a la pregunta que dejó abierta la traza de
v0.29.14: **¿qué comando de GPU provoca los stalls de 100–300 ms?**

Primer análisis con esta instrumentación:
`docs/performance/gpu-trace-2026-11-23T021646.md`.

## Qué registra

- `createShaderModule`, `createRenderPipeline`, `createRenderPipelineAsync` y
  `createComputePipeline` del `GPUDevice`.
- Creación, subida y destrucción de texturas de PlayCanvas
  (`WebgpuTexture.create`, `uploadExternalImage`, `uploadTypedArrayData`,
  `uploadElementImage`, `destroy`).
- `queue.submit`, con el número de command buffers.
- `destroyDeferredResources`, con cuántos recursos GPU se destruyen.
- `getShaderVariant` de los materiales. No toda llamada crea código: PlayCanvas
  también la usa para recuperar una variante cacheada. Cada evento lleva una
  **firma** (propiedades del material + formato de vértice + pase); si la firma
  ya apareció durante la precarga, el detalle dice `variante ya compilada en
  precarga`. Solo las firmas nuevas se marcan como `variante nueva en partida`.
- Los pipelines se marcan igual: `NUEVO` si su firma (material de los shaders,
  formato de vértices, targets, blend, profundidad, esténcil, cull y muestras)
  no se vio en la precarga; `visto-en-precarga` si ya existía.
- **En WebGL2**, hook de `WebglShader.finalize`: cada enlace real de programa se
  registra como `link` y, si ocurre después de `markGpuTraceReady`, en
  `newLinks` con el material y los ms que bloqueó el frame. Es la señal que
  provoca el tirón; `getShaderVariant` por sí solo no lo detecta porque una
  variante puede crearse en la precarga y no dibujarse hasta la partida.
- Identidad del objeto `Shader` (`seenShaders`): un programa nuevo con la misma
  firma de material (por ejemplo, un `ShaderMaterial` con otro `uniqueName`)
  también se marca. Antes se quedaba oculto como "variante ya compilada".
- Nombres de los lotes de FX: `fx-tint:<motion>:<tex|plain>`,
  `fx-effect-particles`, `fx-world-trail` y `fx:<kind>|instanced:m<hash>`. El
  `uniqueName` de un `ShaderMaterial` entra en la clave del programa: **nunca**
  debe llevar un contador por instancia.
- En el bench: `node scripts/bench-frame.mjs --gpu --backend webgl2 --views 8
  --seconds 60 --save` imprime variantes, enlaces y stalls, y guarda el volcado
  completo en `performance/`.
- `long-animation-frame`/`longtask`, con los scripts implicados cuando el
  navegador los expone.
- Huecos de frame: si pasan más de `CONFIG.performance.gpuTraceStallMs`
  (50 ms por defecto), guarda los eventos GPU de los 1,5 s anteriores, el coste
  del frame anterior (`frameMs`, de `update` a `frameend`) y el
  `long-animation-frame` que cubre el hueco, si existe.
- Las subidas de menos de 16 KB solo se registran si tardan ≥0,75 ms; así el
  anillo no se llena de `skin` de 3–6 KB y conserva pipelines y texturas.

Cada pipeline se etiqueta con el material que lo creó. Ejemplo real de la
instrumentación en el bench:

```text
pipeline#167  vs:shader#333 (atlas-lit) fs:shader#334 (atlas-lit)
              triangle-list targets:bgra8unorm depth:depth24plus-stencil8 samples:4
variant       atlas-lit (forward)  2,5 ms
submit x2
... hueco de 105 ms ...
```

Eso ya permite distinguir si el stall viene de un material concreto
(`atlas-lit`, `fx:water`, `fog-of-war`…) o de una subida de textura
(`fog-mask-red`, `skin`, `player-marker`…).

Las variantes y pipelines nuevos **no se pierden** cuando el anillo de 500
eventos los expulsa: se guardan en listas aparte (`newVariants`,
`newPipelines`, hasta 200 entradas), que son las que hay que mirar para saber si
la precarga cubrió todo.

## Cómo activarla

- Por defecto se instala sola (`CONFIG.performance.gpuTrace: true`) y no escribe
  por consola; deja medidas `newpoke:gpu:*` en el panel Performance.
- Para ver los stalls por consola, añadir `?gpuTrace=1` a la URL:
  `https://sirreiva.github.io/pokegame/?gpuTrace=1`
- Para desactivar el registro: `?gpuTrace=0` (los envoltorios siguen
  instalados, pero no guardan eventos; se puede reactivar con
  `__newpokeGpuTrace.enable()`).
- En cualquier momento desde la consola del navegador:

```js
__newpokeGpuTrace.report()         // resumen + variantes/pipelines nuevos + stalls
__newpokeGpuTrace.snapshot()       // JSON con eventos, firmas de precarga y stalls
__newpokeGpuTrace.download()       // descarga el JSON
__newpokeGpuTrace.newVariants      // variantes con firma nueva tras la precarga
__newpokeGpuTrace.newPipelines     // pipelines con firma nueva tras la precarga
__newpokeGpuTrace.newPipelineDiffs // campo a campo: firma nueva vs. precarga
__newpokeGpuTrace.enable()
__newpokeGpuTrace.disable()
__newpokeGpuTrace.verbose(true)
```

`report()` también imprime las tablas de variantes y pipelines nuevos (con su
firma) y la de diferencias, que es la forma rápida de ver qué se escapó de la
precarga y por qué. `newPipelineDiffs` compara la firma completa (buffers de
vértices, blend, esténcil, frontFace) con la firma de precarga más parecida del
mismo material; `detalle` solo muestra un resumen.

## Cómo leer un stall

Con `?gpuTrace=1`, cada hueco > 50 ms imprime una tabla con:

En la cabecera del grupo aparecen `gap` (hueco total), `frame` (coste del frame
anterior) y `LoAF` (long animation frame, si el navegador lo reporta). Si
`frame` es pequeño y el hueco es grande, el coste está **entre frames** (GPU,
presentación o scheduling); si `frame` es grande, el coste está dentro del
frame.

| Columna | Significado |
| --- | --- |
| `ms rel` | Milisegundos respecto al inicio del frame anterior. Negativo = ocurrió justo antes del hueco. |
| `tipo` | `shader`, `pipeline`, `variant`, `texture`, `upload-image`, `upload-data`, `submit`, `destroy-resources`, `loaf`… |
| `etiqueta` | Nombre del material, textura, `pipeline#N` o `shader#N`. |
| `ms op` | Duración de la llamada JS (no incluye el trabajo asíncrono de la GPU). |
| `bytes` | Tamaño de la textura/subida, cuando aplica. |
| `detalle` | Material del pipeline, formato, mip, primeros `#define` del shader… |

Protocolo recomendado para el stall de 310 ms de v0.29.14:

1. Grabar una partida de 60 s con `?gpuTrace=1` y DevTools abierto.
2. En el panel Performance, buscar la medida `newpoke:gpu-stall` de ~300 ms.
3. Abrir la consola: el `console.groupCollapsed` del stall muestra la tabla.
4. Buscar en las filas con `ms rel` entre −200 y 0: el último `pipeline`,
   `variant` o `upload-*` antes del `submit` suele ser el disparador.
5. Contrastar con el `detalle` del pipeline: material, vertex/fragment shader y
   formato. Si el pipeline es de un material que no debería estrenarse en
   partida, el problema es la precarga; si es una subida de textura, el
   problema es el camino canvas → GPU.

## Marcas de precarga

`Game` deja eventos `warmup` en el anillo con lo que se dibujó y cuántos draw
calls añadió:

```text
warmup  efectos en precarga    N llamadas
warmup  modelos en precarga    8 entidades, 9 renders
warmup  modelos tras frames    8 cuerpos, draws 144 -> 165
```

El evento `ready` incluye cuántas firmas de shader y pipelines se compilaron
antes de `markGpuTraceReady`. Con el calentamiento de la vista real, la
comprobación de aceptación es que `newVariants` y `newPipelines` estén **vacíos**
(o solo contengan material del mundo que no se dibuja en la carga) durante una
partida normal. Resultado actual: 0 variantes y 1 pipeline (`fx:shield` normal)
en una captura de 10 s; el pipeline se crea en los frames congelados de la cuenta
atrás y el máximo es 16,9 ms. `swamp-surface`, `basalt`, `ice`, `fx:shield` y
`fx:basic` normal se compilan en la carga desde que `warmUpWorldView` dibuja el
mapa completo y `warmUpBlendStates` dibuja esos blends en la capa real de cada
vista. Antes de nombrar los materiales del mundo el recuento salía 0 porque todos
compartían la firma `Untitled`. Detalle:
`docs/performance/warmup-2026-11-23.md`.

## Coste y seguridad

- El anillo guarda 500 eventos y 50 stalls; no crece sin límite.
- Se envuelven llamadas que ocurren decenas de veces por segundo, no por frame
  en cada draw. El coste es despreciable frente al tick.
- Si una llamada de instrumentación falla, se captura y el juego sigue. Las
  medidas `performance.measure` también están protegidas.
- En producción no escribe nada por consola salvo que se use `?gpuTrace=1`; las
  medidas `newpoke:gpu:*` sí aparecen en la traza de DevTools.

## Limitaciones

- La duración de `createRenderPipeline` es la del lado JS; la compilación real
  ocurre después en el proceso GPU. Por eso el evento se correlaciona con el
  hueco, no se mide directamente.
- No sustituye a una traza de WebGPU/Dawn: si el driver tarda 300 ms en
  compilar, aquí se ve *qué pipeline* lo disparó, no el stack nativo.
- El anillo es de eventos recientes: si un stall ocurre y después hay una
  ráfaga de subidas, los eventos viejos se van. Los stalls ya guardan su propia
  copia de los 1,5 s anteriores.
- La firma de variante es una **aproximación**: no incluye la clave interna de
  generación del shader ni la lista de luces. Una misma firma puede producir
  módulos de shader nuevos para otra instancia del material. Esos casos aparecen
  como `ya compilada` pero siguen creando shaders; para verlos hay que mirar los
  eventos `shader` del stall.
- La firma del pipeline usa el nombre del material. Por eso los materiales sin
  nombre compartían firma y ocultaban pipelines nuevos (`basalt`, `ice`); desde
  que `standard()` exige nombre ya no ocurre.
- PlayCanvas **comparte la variante de shader** entre materiales con las mismas
  opciones y etiqueta el módulo con el material que lo pidió en último lugar.
  Por eso un mismo estado puede aparecer como `fx:water` o `fx:shield` según el
  orden de dibujo, y `newPipelineDiffs` puede responder «sin firma de precarga
  para el material» aunque el estado sí se calentó. Los `shader#id` de los
  eventos `shader` y del `detalle` del pipeline permiten distinguirlo: si el
  pipeline nuevo usa módulos que no se crearon en la precarga, la variante se
  compiló de verdad.
- `markGpuTraceReady` se marca al terminar la carga, antes de `startMatch`, así
  que los 3 frames de calentamiento de la vista real cuentan como «partida».
  Un pipeline que se estrene ahí aparece en `newPipelines` aunque su stall quede
  detrás de la cuenta atrás.
- En el backend WebGL2 solo se instrumentan las variantes de material y los
  frames largos; las etiquetas de pipelines/texturas son específicas de WebGPU.
