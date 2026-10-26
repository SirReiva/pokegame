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
- **Velocidad propia por Pokémon**: cada compañero tiene su velocidad punta en `src/game/roster.ts` (Bulbasaur 4,2 u/s, Charmander 5,4, Squirtle 4,8, Pikachu 6,9, Eevee 6,1, Lucario 6,5). La animación de andar escala con la velocidad real, así que el más rápido también mueve las patas más deprisa. El HUD muestra la velocidad actual y la máxima sobre el terreno actual (ya con el multiplicador aplicado), y el selector indica la base en cada tarjeta.
- **Velocidad modulada por el terreno**: cada terreno aplica un multiplicador según sus tipos frente a los del Pokémon (detalle más abajo). Combinado con la velocidad propia, el mismo Pokémon se mueve distinto en cada zona del mapa.
- **Anclas de suelo por frame**: el píxel blanco de `*-Shadow.png` marca el centro del personaje a nivel del suelo. El importador lo extrae para cada frame y el motor desplaza el pivote, evitando que el sprite “flote” o tiemble al cambiar de animación. También guarda el píxel inferior visible de cada frame para que el terreno no recorte el arte que baja del ancla.
- **Anillo de rumbo**: el jugador lleva un anillo pixel art en el suelo con una flecha que sigue su `facing` real. Es geometría plana, no un billboard: gira solo en Y y permanece por encima de la sombra de contacto.
- **Profundidad real**: los sprites escriben profundidad con `alphaTest`, reciben la niebla de la escena y tienen sombra de contacto; los props del mapa proyectan sombras direccionales.
- **Pixel art nítido**: muestreo `NEAREST`, sin mipmaps en los sprites, UVs con medio téxel de margen y compensación vertical (`1 / cos 45°`) para que los píxeles se vean cuadrados a pesar de la perspectiva.
- **Mapa generado por código**: isla, plaza, estanque, árboles, rocas, valla y cartel se construyen con primitivas y texturas procedurales; no hay assets de escenario externos.
- **Terrenos tipados**: la isla tiene catorce terrenos asociados a tipos Pokémon, desde la pradera base hasta calveros de Fuego, Hielo o Fantasma, pasando por la carretera de tipo Normal. El HUD muestra el terreno bajo los pies y su tipo; las aguas profundas solo admiten Pokémon de tipo Agua.
- **UI en español** con selector, HUD de telemetría (FPS, dirección visible, rumbo propio, fila, velocidad, ángulo de cámara, entrada activa, terreno), controles y créditos.

## Terrenos y tipos Pokémon

Los terrenos se definen en `src/game/terrain.ts` (`TERRAINS`) y se consultan con `terrainAt(x, z)`. Los siete base cubren toda la isla y los ocho calveros añaden variedad temática:

| Terreno | Tipo | Dónde |
| --- | --- | --- |
| Pradera | Planta | césped base de la isla |
| Sendero | Tierra | caminos de tierra |
| Carretera | Normal | asfalto del camino principal, con arcenes de tierra |
| Arena | Tierra | orilla de arena del estanque |
| Aguas someras | Agua | anillo exterior del estanque, transitable por todos |
| Aguas profundas | Agua | centro del estanque, solo Pokémon de tipo Agua |
| Plaza | Roca | explanada central |
| Brasas | Fuego | calvero al este |
| Páramo | Eléctrico | calvero al norte |
| Escarcha | Hielo | calvero al oeste |
| Ciénaga | Veneno | calvero al sur |
| Bosque umbrío | Fantasma | calvero al suroeste |
| Claro feérico | Hada | calvero al noroeste |
| Hierba alta | Planta | dos manchas, al noreste y al oeste |

`terrainAt` resuelve primero los calveros, después la plaza, el estanque (profundo → somero → arena), la carretera, los caminos y, por defecto, la pradera. Los calveros se pintan con bloques de 4 px en la textura del suelo (borde irregular, grietas, chispas, flores…) y cada uno tiene una paleta propia. El lecho del estanque también está pintado en el suelo, sin cilindros elevados; encima se coloca una lámina de agua plana y translúcida.

La **carretera** es el camino principal asfaltado: entra desde el borde sur, cruza la valla y termina en la plaza. El asfalto (`TerrainPath.asphalt`, 2,5 u de ancho) se pinta encima del camino de tierra (3,6 u), que queda como arcén; lleva borde claro, rodadas, grano de 3 px y eje discontinuo. El trazado se muestrea con la misma curva que el camino, así que el terreno cambia justo en el borde visible del asfalto: pisar el arcén sigue siendo Sendero y pisar la calzada es Carretera. La plaza tapa el arranque de la calzada, igual que ocurre con el resto de caminos.

La **hierba alta** es el único calvero con volumen propio: además de pintarse en el suelo con briznas de 2 px y punta clara, genera matas 3D hechas con geometría real. Cada mata es una malla de 18 briznas (dos tramos y punta, con curvatura y alturas variadas) coloreadas por vértice con verdes profundos, de tono oscuro en la base a más claro en la punta; no usa texturas ni recortes alfa, así que tiene volumen desde cualquier ángulo y se resuelve en una sola llamada de dibujo por mata. Las matas se colocan de forma determinista dentro de `TERRAIN_ZONES` (los de tipo `tallGrass`), con densidad alta para que el calvero se lea frondoso, no colisionan y se mecen con el viento en `world.update` inclinándose sobre su base con una fase ligada a la posición.

Las **aguas profundas** (`POND.deepRadius`) actúan como collider circular solo para Pokémon que no sean de tipo Agua: el resto puede entrar en las someras y rodear el pozo, pero no cruzarlo. El HUD lo avisa cuando estás en aguas someras con un Pokémon no acuático. El HUD de telemetría muestra el nombre del terreno y una insignia con su tipo.

### Velocidad según el terreno

Cada terreno modula la velocidad del Pokémon que lo atraviesa. La relación se resuelve en `src/game/terrainSpeed.ts` con la tabla de tipos de Pokémon, usando el tipo del terreno como atacante:

| Relación | Multiplicador |
| --- | --- |
| Terreno propio (el Pokémon comparte el tipo del terreno) | ×1,18 |
| Terreno hostil (el tipo del terreno es súper eficaz contra el Pokémon) | ×0,82 |
| Terreno cómodo (lo resiste o es inmune a él) | ×1,08 |
| Neutro | ×1,00 |

Algunos ejemplos con el roster actual: Squirtle nada más rápido en aguas someras (×1,18) pero se frena en la hierba alta (×0,82); Pikachu sufre en Sendero y Arena porque el tipo Tierra es súper eficaz contra Eléctrico (×0,82); Charmander corre en Brasas (×1,18) y se frena en la Plaza y los caminos (×0,82); Bulbasaur agradece la Ciénaga (×1,18); Eevee va más rápido por la Carretera porque comparte el tipo Normal (×1,18) y nota una leve ventaja en el Bosque umbrío (×1,08); Lucario también agradece el asfalto, ya que el Acero resiste el tipo Normal (×1,08). El HUD muestra el multiplicador activo junto al terreno, con una nota explicando el motivo, y la velocidad punta final combina la del Pokémon con la del terreno.

### Sumergirse en el agua

El estanque combina el lecho pintado en el suelo con dos láminas planas y translúcidas a `POND.surfaceHeight` (0,3 u), sin paredes ni grosor: una capa base y una capa de brillos que se desplazan en sentidos opuestos con sus UVs animadas, más un giro lento y un latido de opacidad en la capa de brillos para que la corriente se lea de un vistazo. La máscara radial (`createWaterMaskCanvas`) disuelve el borde contra la arena y el tile de ondas se genera repetido en los bordes para que el desplazamiento no muestre costuras. El desplazamiento de UVs se aplica con `diffuseMapOffset` seguido de `material.update()` en cada frame: sin esa llamada, PlayCanvas no sube las transformadas de textura al uniform buffer y el agua queda congelada. Al entrar en el agua, el sprite se hunde de forma progresiva (`submergeShallow` en aguas someras y `submergeDeep` en profundas): la parte del cuerpo que queda bajo la superficie la tapa la lámina, la sombra de contacto se oculta y el anillo de rumbo flota sobre el agua. La inmersión se mide como fracción de la altura de cada sprite, así que Pokémon altos y bajos se mojan de forma parecida. Al salir, el sprite emerge con la misma interpolación.

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
  terrain.ts                 terrenos, zonas, caminos y consulta por posición
  textures.ts                texturas procedurales (césped, calveros, agua, cielo, sombra, props)
  world.ts                   isla, plaza, estanque, props, luces y colisiones
  camera.ts                  rig orbital a 45° con seguimiento suave
  input.ts                   mando, teclado y ratón (deadzone y ejes)
  roster.ts                  velocidad punta de cada Pokémon
  terrainSpeed.ts            multiplicadores de velocidad por terreno y tipo
  sprite.ts                  texturas, material, UVs, animación y billboard
  marker.ts                  anillo de jugador con flecha de rumbo
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
- `player.speed`, `acceleration`, `radius`: sensación de movimiento y colisión. La velocidad final de cada Pokémon sale de `src/game/roster.ts`; `player.speed` queda como respaldo. Los multiplicadores por terreno están en `TERRAIN_SPEED_FACTOR` (`src/game/terrainSpeed.ts`).
- `player.markerDiameter`, `markerHeight` y `markerOpacity`: tamaño del anillo de rumbo, su altura sobre el suelo y su transparencia.
- `player.submergeShallow`, `submergeDeep` y `submergeLerp`: fracción de la altura del sprite que se sumerge en cada tipo de agua y con qué suavidad lo hace.
- `TERRAINS`, `TERRAIN_ZONES` y `POND` en `src/game/terrain.ts`: nombres, tipos Pokémon, posición, radios del estanque y tamaño de cada terreno. El ancho del asfalto de la carretera se define con `asphalt` dentro de `TERRAIN_PATHS`.

Los colores de acento, tipos y créditos vienen del manifiesto.

## Limitaciones conocidas

- Solo se importan **Idle** y **Walk**; no hay ataque, daño, captura ni combate.
- Los NPC son estáticos: giran hacia el jugador, pero no patrullan.
- No hay audio, guardado ni soporte táctil específico (la demo está pensada para escritorio con mando o teclado).
- El mapa es una isla de demostración, no un nivel de juego.

## Créditos y licencia

Los sprites pertenecen a la comunidad de **[PMD Sprite Collab](https://sprites.pmdcollab.org/)** y se distribuyen bajo **[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)**. Esta demo es **no comercial** y muestra la atribución en la interfaz y en `public/sprites/CREDITS.md`.

Cada Pokémon conserva su `credits.txt` original en `public/sprites/<id>/`. El código del proyecto es una demo técnica y no reclama propiedad sobre esos sprites.
