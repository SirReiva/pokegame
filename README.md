# NewPoke · demo técnica de sprites y cámara

Demo jugable en navegador que mezcla un **mapa 3D** con **Pokémon dibujados como sprites 2D de 8 direcciones**. Cada personaje es un billboard vertical con ancla de suelo, sombra de contacto y colisión, y la cámara orbital a **45°** hace que el sprite elija la vista correcta en cada momento.

El objetivo no es un juego completo, sino validar la técnica: motor 3D imperativo con PlayCanvas, UI en React y un pipeline de assets reproducible.

## Stack

- **React 19** + **TypeScript** + **Vite**: HUD, menús y pantallas.
- **PlayCanvas 2.23**: render 3D, cámara, luces, sombras y mundo.
- **PMD Sprite Collab**: hojas de animación de 8 direcciones (Idle y Walk).
- Sin framework de UI 3D: React nunca toca la escena; habla con `Game` mediante callbacks.

## Arranque

```bash
npm install
npm run dev        # servidor de desarrollo
npm run build      # comprobación de tipos + build de producción
npm run preview    # servir el build
```

Los sprites ya están incluidos en `public/sprites/`. Para volver a descargarlos y regenerar el manifiesto:

```bash
npm run sprites            # usa la caché local
npm run sprites -- --force # fuerza la descarga
```

Requiere Node 18+ (el importador usa `fetch` y `zlib`).

## Controles

| Acción | Mando | Teclado / ratón |
| --- | --- | --- |
| Mover | Stick izquierdo (analógico, relativo a la cámara) | `WASD` / flechas |
| Girar cámara | Stick derecho | `Q` / `E` o arrastrar con el ratón |
| Zoom | Gatillos `L2` / `R2` o stick derecho vertical | Rueda |
| Correr | — | `Shift` |
| Selector de Pokémon | `Start` | `Esc` |
| Ocultar HUD | — | `H` |
| Cerrar ventana | — | `Esc` |

La pantalla inicial permite elegir entre **Bulbasaur, Charmander, Squirtle, Pikachu, Eevee y Lucario**, ver una vista previa animada de las 8 direcciones y cambiar entre Idle y Walk antes de entrar al mapa.

## Qué demuestra

- **Billboard vertical**: el plano del sprite solo gira en Y para mirar a la cámara; no se inclina, así que el personaje permanece de pie sobre el terreno. El billboard no implica que el personaje “mire a cámara”: solo mantiene el plano visible.
- **8 direcciones según el rumbo**: cada actor conserva una dirección propia (`facing`). La fila visible se calcula con el ángulo entre ese rumbo y la cámara, usando el eje “derecha de pantalla”. Al orbitar, el sprite cambia de vista de forma continua sin dejar de mirar hacia donde mira de verdad.
- **Rumbos independientes**: el jugador empieza mirando al este y solo cambia de rumbo al moverse. Los NPC tienen una orientación de reposo propia y únicamente giran hacia el jugador cuando lo tienen cerca.
- **Movimiento y cámara independientes**: el stick izquierdo mueve en cualquier ángulo relativo a la cámara; el derecho orbita 360°. La cámara mantiene una inclinación fija de 45°.
- **Anclas de suelo por frame**: el píxel blanco de `*-Shadow.png` marca el centro del personaje a nivel del suelo. El importador lo extrae para cada frame y el motor desplaza el pivote, evitando que el sprite “flote” o tiemble al cambiar de animación. También guarda el píxel inferior visible de cada frame para que el terreno no recorte el arte que baja del ancla.
- **Profundidad real**: los sprites escriben profundidad con `alphaTest`, reciben la niebla de la escena y tienen sombra de contacto; los props del mapa proyectan sombras direccionales.
- **Pixel art nítido**: muestreo `NEAREST`, sin mipmaps en los sprites, UVs con medio téxel de margen y compensación vertical (`1 / cos 45°`) para que los píxeles se vean cuadrados a pesar de la perspectiva.
- **Mapa generado por código**: isla, plaza, estanque, árboles, rocas, valla y cartel se construyen con primitivas y texturas procedurales; no hay assets de escenario externos.
- **UI en español** con selector, HUD de telemetría (FPS, dirección visible, rumbo propio, fila, velocidad, ángulo de cámara, entrada activa), controles y créditos.

## Cómo funciona el pipeline de sprites

`scripts/import-sprites.mjs`:

1. Descarga `AnimData.xml`, `credits.txt`, `{Idle,Walk}-Anim.png` y `{Idle,Walk}-Shadow.png` desde el repositorio de PMD Sprite Collab.
2. Valida que la hoja encaje en la rejilla declarada: 8 filas (direcciones) y una columna por duración de animación.
3. Decodifica el PNG de la sombra sin dependencias externas y localiza el píxel blanco de cada frame; la media de esos píxeles es el **ancla de suelo**.
4. Decodifica también la hoja de animación para guardar el píxel inferior con contenido visible de cada frame (`bottoms`), que evita que el suelo recorte el dibujo.
5. Escribe `public/sprites/manifest.json` con frames, duraciones en ticks de 1/60 s, anclas y bordes inferiores por frame, créditos y metadatos de licencia.
5. Genera `public/sprites/CREDITS.md`.

Orden de las filas: `S, SE, E, NE, N, NW, W, SW` (0–7).

### Selección de dirección

Para cada actor:

```
toCam   = normalizar(cámara - actor) en el plano XZ
right   = (toCam.z, -toCam.x)          // derecha de pantalla
facing  = (sin(yaw), cos(yaw))
angle   = atan2(dot(facing, right), dot(facing, toCam))
row     = round(angle / 45°) mod 8
```

Así la fila 0 es la vista frontal, la 2 el perfil derecho de la pantalla y la 4 la espalda. La fila 0 solo aparece cuando el rumbo real del actor coincide con la dirección hacia la cámara; no es un estado permanente.

### Recorte de la celda

Cada actor tiene un material propio por animación. Para mostrar una celda concreta se ajustan las transformaciones UV del mapa emisivo y del mapa de opacidad:

```
u0 = (frame * frameWidth + 0.5) / sheetWidth
v0 = (row * frameHeight + 0.5) / sheetHeight   // offset V medido desde arriba
du = (frameWidth - 1) / sheetWidth
dv = (frameHeight - 1) / sheetHeight
```

PlayCanvas aplica internamente `v' = dv * v + 1 - dv - v0`, por eso el offset de fila se mide desde la parte superior de la hoja. Tras cambiar `*MapTiling` y `*MapOffset` hay que llamar a `material.update()`: si no, el sprite se queda congelado en la primera celda aplicada aunque cambien el frame, la fila y la cámara.

### Anclaje vertical

Cada frame se dibuja en un plano con el ancla de referencia en el origen. El offset por frame es:

```
offsetX = (frameWidth / 2 - anchor.x) * pixelScale
offsetY = (anchor.y - refAnchorY + lift) * pixelScale * verticalStretch
lift = max(0, bottom - anchor.y)
```

`refAnchorY` es el ancla del primer frame de esa animación. `bottom` es el píxel inferior con contenido visible de la celda, extraído por el importador. Como el suelo del mapa es opaco, los píxeles que el arte dibuja por debajo del ancla (una pata delantera, la cola o el borde del cuerpo) quedarían enterrados y el sprite se vería cortado. `lift` sube solo los frames afectados lo justo para que su borde inferior apoye en el ancla; los que ya quedan por encima no se mueven, así que el “bob” de Idle y Walk se conserva. El resultado es que ambas animaciones comparten el mismo punto de apoyo aunque sus frames tengan alturas, recortes o “bob” distintos.

## Estructura

```
scripts/import-sprites.mjs   descarga, validación, anclas y manifiesto
public/sprites/              hojas, XML/credits originales, manifiesto y CREDITS.md
src/game/
  config.ts                  escala de píxel, cámara, jugador, niebla
  types.ts                   tipos del manifiesto y del estado del juego
  textures.ts                texturas procedurales (césped, agua, cielo, sombra)
  world.ts                   isla, plaza, estanque, props, luces y colisiones
  camera.ts                  rig orbital a 45° con seguimiento suave
  input.ts                   mando, teclado y ratón (deadzone y ejes)
  sprite.ts                  texturas, material, UVs, animación y billboard
  actor.ts                   sprite + sombra de contacto + posición
  game.ts                    orquestador, roster, movimiento y colisiones
src/ui/SpritePreview.tsx     vista previa animada de las hojas con CSS
src/App.tsx                  pantallas, selector, HUD y modales
src/index.css                estilos de la interfaz
```

## Ajustes rápidos

Casi todo lo “mágico” está en `src/game/config.ts`:

- `PIXEL_SCALE` (0.045): unidades de mundo por píxel de sprite. Es común a todo el roster para conservar tamaños relativos.
- `PITCH_DEG` (45) y `VERTICAL_STRETCH`: inclinación y corrección de píxeles.
- `camera.distance`, `fov`, `followLerp`: encuadre y suavidad.
- `player.speed`, `acceleration`, `radius`: sensación de movimiento y colisión.

Los colores de acento, tipos y créditos vienen del manifiesto.

## Limitaciones conocidas

- Solo se importan **Idle** y **Walk**; no hay ataque, daño, captura ni combate.
- Los NPC son estáticos: giran hacia el jugador, pero no patrullan.
- No hay audio, guardado ni soporte táctil específico (la demo está pensada para escritorio con mando o teclado).
- El mapa es una isla de demostración, no un nivel de juego.

## Créditos y licencia

Los sprites pertenecen a la comunidad de **[PMD Sprite Collab](https://sprites.pmdcollab.org/)** y se distribuyen bajo **[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)**. Esta demo es **no comercial** y muestra la atribución en la interfaz y en `public/sprites/CREDITS.md`.

Cada Pokémon conserva su `credits.txt` original en `public/sprites/<id>/`. El código del proyecto es una demo técnica y no reclama propiedad sobre esos sprites.
