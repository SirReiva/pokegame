# Gráficos: WebGL2 y WebGPU

El juego puede renderizar con **WebGL2** y con **WebGPU**. Ambos backends están
soportados a la vez: el motor elige uno al crear la partida y todo el código de
escena, texturas y efectos funciona igual en los dos.

## Elegir backend

En **Opciones → Gráficos → Motor de render** hay tres opciones, guardadas en
`localStorage` (`newpoke.graphics.v1`):

| Opción | Comportamiento |
| --- | --- |
| **Automático** (por defecto) | Intenta WebGPU y cae a WebGL2 si el navegador o el driver no lo permiten. |
| **WebGPU** | Fuerza WebGPU. Si no está disponible, la partida muestra un error y hay que volver a Opciones para cambiarlo. |
| **WebGL2** | Fuerza el backend clásico. Útil si WebGPU da artefactos o problemas de driver. |

El cambio se aplica al iniciar la siguiente partida: la aplicación de PlayCanvas
se crea una vez por partida en `Game.create`. La etiqueta de la cabecera
(`Activo: WebGPU` / `Activo: WebGL2`) muestra el backend real que usó la última
partida.

Un WebGPU explícito que acabe en WebGL2 se considera fallo: `appBootstrap.ts`
destruye el dispositivo y lanza un error en vez de mentir al jugador.

## Cómo está montado

- `src/game/appBootstrap.ts` crea el dispositivo con `pc.createGraphicsDevice`
  y la aplicación con `pc.AppBase` + `pc.AppOptions`. Declara solo los
  componentes y handlers que usa el juego.
- `src/game/graphicsSettings.ts` guarda la preferencia y publica el backend
  activo. No importa PlayCanvas.
- `src/screens/OptionsScreen.tsx` pinta el selector.

## Shaders: GLSL y WGSL

En WebGPU, `StandardMaterial` se genera con los chunks **WGSL**; inyectar solo
chunks GLSL no da error, pero la personalización se ignora (los efectos se
quedarían quietos). Por eso cada shader propio tiene las dos versiones:

| Shader | Dónde | Cómo se aplica |
| --- | --- | --- |
| Niebla de guerra | `src/game/fog.ts` | `ShaderMaterial` con `vertexGLSL`/`fragmentGLSL` y `vertexWGSL`/`fragmentWGSL`. |
| Viento del follaje | `src/game/windShader.ts` | `applyWindShader()` inyecta `transformCoreVS` en los dos idiomas. |
| Efectos instanciados | `src/game/effectBatch.ts` + `src/game/effectMotionsWGSL.ts` | `applyInstancedEffectShader()` / `applyVertexEffectShader()` inyectan el chunk GLSL y su gemelo WGSL. |

Convenciones WGSL del motor (importante si se añade un shader):

- `attribute nombre: vec4f;`, `uniform nombre: f32;`, `varying nombre: vec2f;`
  se traducen a `@location`/uniform buffer automáticamente.
- Los uniforms propios se leen como `uniform.miUniforme`.
- Un array de `vec2f` se declara `uniform nombre: array<vec2f, N>;` y se lee
  `uniform.nombre[i].element` (el motor envuelve el elemento para respetar la
  alineación).
- Las texturas se declaran `var nombre: texture_2d<f32>;` y su sampler
  `var nombre_sampler: sampler;`, en ese orden.
- El vertex shader escribe `output.position` y los `varying` en el struct de
  salida; el fragment shader escribe `output.color`.
- `textureSample` no se permite en flujo no uniforme; usar
  `textureSampleLevel(..., 0.0)`.

### Añadir un movimiento de efecto

1. Añade `MOTION_MI_EFECTO` en `src/game/effectBatch.ts` (GLSL).
2. Añade `MOTION_MI_EFECTO_WGSL` en `src/game/effectMotionsWGSL.ts` con las
   mismas funciones (`effectModel` y `effectLocalPosition`).
3. Añade el par a `getMotionWgslSources()` en `effectBatch.ts`.
4. Si falta el WGSL, la consola avisa y en WebGPU el efecto no se anima.

## Imágenes y texturas

WebGPU solo sube a textura `ImageBitmap`, canvas y vídeo; un
`HTMLImageElement` se ignora. Los sprites y los objetos se cargan con
`loadImage()` (`fetch` + `createImageBitmap`) y se suben con
`setTextureSource()`.

Ese helper también resuelve el `flipY`: el motor fuerza `flipY: false` al subir
imágenes externas en WebGPU, así que la imagen se voltea antes de subirla para
que WebGL2 y WebGPU se vean igual.

## Diferencias conocidas

- **Normales con instancing no uniforme**: en WebGPU el motor deriva la matriz
  de normales de la matriz de instancia; en WebGL2 usa la matriz de normales
  clásica. Con escalas muy no uniformes (por ejemplo el anillo de área) el
  sombreado puede variar unos pocos niveles de color. La geometría y la
  cobertura coinciden.
- `createSphere`/`createBox`/… están deprecados en PlayCanvas 2.x (avisan por
  consola), pero funcionan en ambos backends.
- En Linux, WebKitGTK puede no ofrecer WebGPU; con **Automático** cae a WebGL2
  sin intervención.

## Checklist manual (8 jugadores, bots en ambos equipos)

Repite la partida una vez con **WebGPU** y otra con **WebGL2**:

1. En Opciones, cambia el backend y comprueba que la etiqueta pasa a
   `Activo: WebGPU` / `Activo: WebGL2` al entrar en la siguiente partida.
2. Sprites: los Pokémon no deben verse invertidos ni con colores cambiados.
   Comprueba idle, caminar, ataque y KO.
3. Niebla: los círculos de visión revelan el mapa y las sombras de árboles y
   cordilleras se recortan igual; los Pokémon no se tiñen.
4. Hierba y mariposas: el viento mueve las matas y las alas sin tirones.
5. Efectos instanciados: usa la lista de `docs/pruebas-efectos-gpu.md`
   (Lluevehojas, Ciclón, Ventisca, Fisura, Bomba Lodo, Terremoto, Ataque
   Celeste, Viento Gélido, Onda Ígnea, Torbellino Ígneo…).
6. Partículas de mapa, objetos recogibles y marcas de KO.
7. Si algo falla con WebGPU, cambia a WebGL2 y comprueba que desaparece; anota
   GPU, navegador y versión de driver.
