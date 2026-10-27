# NewPoke · demo técnica de sprites, cámara y multijugador local

Demo jugable en navegador que mezcla un **mapa 3D** con **Pokémon dibujados como sprites 2D de 8 direcciones** y **multijugador local de 1 a 8 jugadores en splitscreen**. Cada personaje es un billboard vertical con ancla de suelo, sombra de contacto y colisión, y la cámara orbital a **45°** hace que el sprite elija la vista correcta en cada momento.

El objetivo no es un juego completo, sino validar la técnica: motor 3D imperativo con PlayCanvas, UI en React y un pipeline de assets reproducible.

## Stack

- **React 19** + **TypeScript 7** + **Vite**: HUD, menús y pantallas.
- **Tailwind CSS 4** (plugin de Vite): utilidades en los componentes y tokens de diseño en `src/index.css`.
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

El modo local admite **hasta ocho jugadores en total**: un teclado y mandos. Cada dispositivo que pulsa confirmar se convierte en un jugador independiente.

| Acción | Mando | Teclado |
| --- | --- | --- |
| Unirse / confirmar | `A` | `Espacio` / `Enter` |
| Volver / desmarcar | `B` | `Esc` / `Retroceso` |
| Elegir equipo | Cruceta izquierda / stick izquierdo | `A` / `D` o flechas |
| Navegar por la rejilla de Pokémon | Cruceta / stick izquierdo | `WASD` / flechas |
| Moverte en el mapa | Stick izquierdo | `WASD` / flechas |
| Girar tu cámara | Stick derecho | `Q` / `E` o arrastrar con el ratón |
| Zoom | Gatillos `L2` / `R2` o stick derecho vertical | Rueda |
| Correr | `L3` o `RB` | `Shift` |
| Pausa | `Start` / `B` | `Esc` |
| Ocultar HUD | — | `H` |

La configuración tiene dos pantallas:

1. **Equipos**: cada mando pulsa `A` para unirse y elige lado azul o rojo. Hasta cuatro jugadores por equipo y ocho en total. Cuando todos marcan listo, se continúa con `A`.
2. **Pokémon**: cada jugador mueve su cursor por las once especies y confirma con `A`. Se permiten repetidos. Cuando todos están listos, `A` inicia la partida.

Cada equipo aparece en su base (azul o roja) y explora el mapa libremente. La pantalla se reparte en una vista por jugador con su propia cámara y su propio anillo de equipo.

## Mapas definidos por JSON

Cada mapa vive en `public/maps/` y se carga con `fetch` al arrancar, así que se puede editar sin recompilar. `public/maps/index.json` lista los mapas disponibles: la pantalla de equipos permite cambiar entre ellos y `?map=<id>` conserva la elección al recargar.

Un mapa es una **rejilla cuadrada de tipos de terreno** más sus respawns, cordilleras y ajustes de cámara:

```json
{
  "id": "mi-mapa",
  "name": "Mi mapa",
  "tileSize": 1,
  "waterHeight": 0.3,
  "spawn": { "x": -4, "z": 4 },
  "respawns": [
    { "team": "blue", "x": -6, "z": 6, "radius": 3.2 },
    { "team": "red", "x": 6, "z": -6, "radius": 3.2 }
  ],
  "mountains": [
    { "width": 2.2, "points": [[-2, 0], [0, 1], [2, 0]] }
  ],
  "tiles": [
    ["jungle", "jungle", "lane", "jungle"],
    ["jungle", "waterLow", "waterLow", "jungle"],
    ["jungle", "waterHigh", "waterLow", "jungle"],
    ["jungle", "jungle", "lane", "jungle"]
  ]
}
```

- La fila 0 es el **norte** (Z negativa) y la columna 0 el **oeste** (X negativa). Cada fila de `tiles` debe tener el mismo número de columnas y la rejilla debe ser cuadrada.
- `tileSize` es el lado de cada celda en unidades de mundo. `waterHeight` es la altura de la lámina de agua.
- Los `TerrainId` disponibles son `jungle`, `lane`, `road`, `sand`, `waterLow`, `waterHigh`, `base`, `tallGrass`, `fire`, `electric`, `ice`, `poison`, `ghost`, `fairy` y `desert`. Sus nombres y tipos Pokémon están en `src/game/terrain.ts` (`TERRAINS`).
- `respawns` define la base y los puntos de aparición de cada equipo. `radius` es el radio de la plataforma y del anillo; si un equipo tiene varios respawns, los jugadores se reparten entre ellos.
- `mountains` son polilíneas con ancho; bloquean el paso y la línea de visión, y proyectan su cuña de sombra.
- `spawn` es el punto al que mira la cámara del menú. Si falta, se usa el respawn azul.
- Los calveros, el agua y su decoración 3D se derivan de las celdas: cada grupo conexo de un terreno decorativo se convierte en una región poligonal, y cada cuerpo de agua se triangula para colocar la lámina superficial.
- `public/maps/map.schema.json` describe el formato para que el editor valide los archivos. Los mapas existentes lo referencian con `"$schema": "./map.schema.json"`.

Para añadir un mapa, crea `public/maps/<id>.json` y añade su entrada a `public/maps/index.json`:

```json
{
  "maps": [
    { "id": "mi-mapa", "name": "Mi mapa", "file": "mi-mapa.json" }
  ]
}
```

## Multijugador local

- **Sala de equipos en la misma pantalla**: la lista de mandos se refresca con el Gamepad API. Cada dispositivo tiene identidad propia (`kbd`, `pad-0`, `pad-1`…), así que un jugador puede unirse, cambiar de equipo, marcar listo o salir sin afectar a los demás.
- **Auto-equilibrio al entrar**: el nuevo jugador cae en el equipo con menos gente; después puede cambiar de lado mientras queden huecos. El límite es 4 por equipo.
- **Selección simultánea de Pokémon**: cada jugador tiene su cursor y su propio estado de listo. Los cursores se dibujan como chapas del color del equipo sobre la tarjeta, de modo que varios jugadores pueden ver a la vez dónde está cada uno.
- **Una cámara por jugador**: `computeSplitLayout` reparte el canvas en rejillas de 1 a 8 vistas (1×1, 2×1, 2+1, 2×2, 3+2, 3×2, 4+3 y 4×2). Cada cámara usa su propio `rect`, su aspect ratio y su capa de render.
- **Actores duplicados por viewport**: un billboard solo puede orientarse hacia una cámara y elegir una fila de dirección cada vez. Por eso cada jugador tiene una copia de cada actor en la capa de cada vista (`match-view-N`); la cámara N solo dibuja el mundo y su propia capa. Así los sprites miran bien desde los ocho ángulos.
- **Identidad de equipo**: el anillo del suelo se genera con el color del equipo y cada vista lleva el nombre, el Pokémon y el terreno del jugador.
- **Aparición en bases**: el equipo azul sale alrededor de su nexo en la esquina suroeste y el rojo en la noreste, mirando al centro del mapa. La cámara arranca detrás de cada jugador para que `W`/stick arriba avance hacia el centro.
- **Pausa compartida**: `Start`, `B` o `Esc` congelan la partida. Desde la pausa se puede continuar, volver a elegir Pokémon, volver a elegir equipos o abrir controles y créditos.

> **Rendimiento**: cada vista vuelve a dibujar el mundo completo y sus actores. Con 7-8 jugadores el coste es alto; la demo baja el `maxPixelRatio` automáticamente a partir de 5 vistas. Si necesitas 8 vistas fluidas, reduce la calidad de sombras o el detalle de vegetación en `world.ts`.

## Qué demuestra

- **Billboard vertical**: el plano del sprite solo gira en Y para mirar a la cámara; no se inclina, así que el personaje permanece de pie sobre el terreno. El billboard no implica que el personaje “mire a cámara”: solo mantiene el plano visible.
- **8 direcciones según el rumbo**: cada actor conserva una dirección propia (`facing`). La fila visible se calcula con el ángulo entre ese rumbo y la cámara, usando el eje “derecha de pantalla”. Al orbitar, el sprite cambia de vista de forma continua sin dejar de mirar hacia donde mira de verdad.
- **Rumbos independientes**: cada jugador empieza mirando al centro desde su base y solo cambia de rumbo al moverse. Los Pokémon del menú tienen una orientación de reposo propia y únicamente giran hacia la cámara cuando esta se acerca.
- **Movimiento y cámara independientes**: el stick izquierdo mueve en cualquier ángulo relativo a la cámara; el derecho orbita 360°. La cámara mantiene una inclinación fija de 45°.
- **Velocidad propia por Pokémon**: cada compañero tiene su velocidad punta en `src/game/roster.ts` (Bulbasaur 4,2 u/s, Onix 4,6, Charmander 5,4, Squirtle 4,8, Pikachu 6,9, Eevee 6,1, Lucario 6,5, Scyther 7,2, Greninja 7,4, Mewtwo 7,8, Mew 7,0). La animación de andar escala con la velocidad real, así que el más rápido también mueve las patas más deprisa. El HUD de cada vista muestra la velocidad actual y el multiplicador del terreno, y la tarjeta de selección indica la velocidad base.
- **Velocidad modulada por el terreno**: cada terreno aplica un multiplicador según sus tipos frente a los del Pokémon (detalle más abajo). Combinado con la velocidad propia, el mismo Pokémon se mueve distinto en cada zona del mapa.
- **Niebla de guerra por jugador**: cada vista sombrea el mundo fuera de su radio de visión y oculta a los Pokémon que no se ven. Cada especie tiene un rango propio; el terreno bajo el objetivo aporta una ocultación base que sus tipos mejoran o empeoran, y las cordilleras y los árboles bloquean la línea de visión. El sombreado exterior es un quad con `ShaderMaterial` por cámara, dentro de PlayCanvas, y las cordilleras añaden un decal de sombra fijo en el mundo que oscurece lo que queda detrás; el HUD de cada vista resume el rango, la ocultación y el radio de detección.
- **Anclas de suelo por frame**: el píxel blanco de `*-Shadow.png` marca el centro del personaje a nivel del suelo. El importador lo extrae para cada frame y el motor desplaza el pivote, evitando que el sprite “flote” o tiemble al cambiar de animación. También guarda el píxel inferior visible de cada frame para que el terreno no recorte el arte que baja del ancla.
- **Anillo de rumbo**: cada jugador lleva un anillo pixel art en el suelo con una flecha que sigue su `facing` real, tintado con el color de su equipo. Es geometría plana, no un billboard: gira solo en Y y permanece por encima de la sombra de contacto.
- **Profundidad real**: los sprites escriben profundidad con `alphaTest`, reciben la niebla de la escena y tienen sombra de contacto; los props del mapa proyectan sombras direccionales.
- **Silueta de oclusión**: cuando un árbol (o cualquier obstáculo) tapa al Pokémon que manejas, aparece una silueta plana de color cálido a través de él, para que no pierdas de vista a tu personaje. Se resuelve por píxel: la silueta es la misma malla del sprite con la prueba de profundidad invertida (`depthFunc = FUNC_GREATER`), así que solo se pinta donde ya hay algo más cerca que el Pokémon. Donde el sprite se ve, la profundidad coincide y la silueta se descarta, de modo que nunca tapa al propio personaje; no hay raycasts ni comprobaciones por frame. En splitscreen solo la lleva la copia de tu propio avatar en tu vista; los demás jugadores y los Pokémon del menú no la proyectan. El **anillo de rumbo y su flecha** usan la misma técnica: una segunda pasada invertida los deja ver a través de los obstáculos, para que también conserves la referencia de orientación.
- **Pixel art configurable**: `CONFIG.sprite.filter` elige el muestreo. `'nearest'` deja los bloques duros; `'smooth'` precarga la hoja con NEAREST a `smoothScale` y luego filtra con LINEAR, de modo que el contorno se antialiasea 1-2 px sin emborronar el interior; `'linear'` interpola directamente sobre la hoja original (el más suave y borroso). `CONFIG.sprite.alphaToCoverage` delega el recorte alfa en las muestras del MSAA, y las UVs mantienen medio téxel de margen y compensación vertical (`1 / cos 45°`) para que los píxeles se vean cuadrados a pesar de la perspectiva.
- **Mapas definidos por JSON**: la arena es una rejilla de tipos de terreno cargada desde `public/maps/*.json`, con respawns y cordilleras declarados en el mismo archivo. La vegetación, el agua y los detalles se generan por código a partir de esa rejilla; no hay assets de escenario externos.
- **Vegetación con volumen**: la hierba alta, la hierba oscura de la ciénaga, el claro feérico y el páramo generan matas 3D con geometría y color por vértice (briznas, flores con tallo, hojas y pétalos, frailejones con tronco y roseta, y hierba seca pajiza), sin texturas ni recortes alfa. El desierto añade cactus 3D con tronco y brazos, la escarcha racimos de cristales de hielo con nieve, la colada volcánica placas de basalto con coronas de lava, brasas y columnas de humo, el bosque umbrío árboles secos, fuegos fatuos y niebla rastrera, y el claro feérico polen dorado flotante y mariposas revoloteando.
- **Terrenos tipados**: la arena tiene quince terrenos asociados a tipos Pokémon, desde la jungla base hasta calveros de Fuego, Hielo, Fantasma o Desierto, pasando por el carril central asfaltado de tipo Normal. El HUD muestra el terreno bajo los pies y su tipo; las aguas profundas solo admiten Pokémon de tipo Agua.
- **Multijugador local real**: hasta ocho vistas simultáneas de la misma arena, cada una con su cámara, su jugador y sus copias de billboard. Dos equipos con base, anillo y nombre propios; la partida es exploración libre, sin combate.
- **UI en español** con selector de equipos, selector de Pokémon por jugador, HUD de telemetría por vista (terreno, tipo, velocidad, multiplicador), controles y créditos.

## Terrenos y tipos Pokémon

El mapa por defecto (`public/maps/arena.json`) es una **arena cuadrada de estilo MOBA** de 76 × 76 celdas de 0,5 u (38 u de lado, con el doble de resolución de edición que antes). Dos bases ocupan esquinas opuestas de la diagonal suroeste-noreste: la azul en `(-13,2, 13,2)` y la roja en `(13,2, -13,2)`, ambas con radio 3,6 u. Tres carriles las conectan y el resto del terreno es jungla, con nueve calveros temáticos y un lago en la jungla sureste.

Los nombres y tipos Pokémon de cada terreno se definen en `src/game/terrain.ts` (`TERRAINS`) y la rejilla se consulta con `terrainAt(x, z)`. Los siete terrenos base cubren toda la arena y los nueve calveros añaden variedad temática:

| Terreno | Tipo | Dónde |
| --- | --- | --- |
| Jungla | Planta | césped base de la arena, entre carriles |
| Carril | Normal | carriles superior e inferior de tierra |
| Carretera | Normal | calzada asfaltada del carril central, con arcenes de tierra |
| Arena | Tierra | orilla del lago |
| Aguas someras | Agua | anillo exterior del lago, transitable por todos |
| Aguas profundas | Agua | centro del lago, solo Pokémon de tipo Agua |
| Base | Roca | plataformas de las bases azul y roja |
| Colada volcánica | Fuego | calvero de basalto con grietas de lava en la jungla sureste |
| Páramo | Eléctrico | calvero de frailejones y hierba seca en la jungla noroeste |
| Escarcha | Hielo | calvero de cristales de hielo y nieve en la jungla noroeste |
| Ciénaga | Veneno | ciénaga de hierba oscura y agua turbia en la jungla noroeste |
| Desierto | Tierra | calvero de arena y cactus en la jungla norte |
| Bosque umbrío | Fantasma | calvero de árboles secos, fuegos fatuos y niebla en la jungla sureste |
| Claro feérico | Hada | calvero de flores 3D en la jungla sureste |
| Hierba alta | Planta | dos manchas, una en cada jungla |

`terrainAt` consulta directamente la celda de la rejilla que contiene la posición. Las celdas se pintan con bloques de 4 px en la textura del suelo y cada terreno tiene una paleta propia; los calveros reciben encima el detalle procedural de su tipo. El lecho del agua también está pintado en el suelo, sin cilindros elevados; encima se coloca una lámina plana y translúcida.

Los calveros ya no se declaran a mano: al cargar el mapa, cada **grupo conexo de celdas** de un terreno decorativo se convierte en una región poligonal (`TERRAIN_ZONES`). Esa misma forma se usa para pintar el detalle, repartir la decoración 3D y colocar el agua de la ciénaga, así que el borde visible y el terreno jugable coinciden. El agua se agrupa por cuerpos (someras + profundas juntas) y se triangula para construir su malla.

Los **carriles** y la **carretera** son celdas de tipo `lane` y `road` en la rejilla: el carril de tierra se pinta con su paleta y la calzada con asfalto, grano y tono más oscuro. En el mapa por defecto el superior rodea la jungla noroeste, el inferior la sureste y el central cruza en diagonal de base a base. Todo carril es de tipo **Normal**, así que la velocidad cambia al pisar exactamente sus celdas.

La **colada volcánica** (`fire`, tipo Fuego) sustituye el antiguo calvero de brasas por un campo de basalto. El suelo se pinta con nueve placas oscuras de tonos azul-gris generadas con un Voronoi aproximado por bloques, separadas por surcos negros: el suelo no lleva naranja ni amarillo, solo roca fría. Encima hay **placas de basalto 3D**: cinco racimos por zona, cada uno con tres o cuatro bloques facetados de base irregular y corona inclinada. El color va por vértice: la base y los laterales caen a un gris azulado casi negro, mientras la cara superior y los vértices de la corona se encienden en naranja, amarillo y rojo, como lava solidificada. Son bajos y no colisionan. De las grietas suben **44 brasas aditivas** que se encienden, derivan y se apagan, y una luz omni naranja de corto alcance tiñe las rocas con un parpadeo lento. Además, **cada racimo de basalto emite su propia columna de humo**: cinco por calvero, con 24 bocanadas cada una que nacen del centro de la roca, suben en vertical, se ensanchan y se desvanecen, con un tono cálido en la base que pasa a gris. El tipo sigue siendo Fuego: Charmander corre por ella, Squirtle la resiste y Bulbasaur y Lucario se frenan.

La **ciénaga** (`poison`) conserva la hierba oscura pintada en el suelo, con briznas de 1–2 px entre el lodo, y añade encima una lámina de agua turbia recortada por el contorno de sus celdas, más opaca, más lenta y **mate**: sin brillo especular, para que se lea como agua estancada y no como un espejo. También genera matas 3D de hierba oscura, ahora **dispersas**: 11 briznas por mata, más bajas y repartidas con poca densidad para que la ciénaga parezca un lodazal y no un prado frondoso. Son casi negras en la base y verde apagado en la punta, sobresalen del agua y se mecen despacio. Del suelo sube además un **humo bajo y verdoso**: 65 bocanadas suaves que nacen a ras del agua, ascienden lentamente, se ensanchan y se desvanecen, con textura de jirones y opacidad baja. Se comporta como **aguas someras**: cualquier Pokémon puede cruzarla y el sprite se hunde hasta `submergeShallow`, con el anillo de rumbo flotando sobre la superficie. No tiene zona profunda ni collider, y el terreno sigue siendo de tipo Veneno para la velocidad.

El **desierto** (`desert`, tipo Tierra) es una mancha de arena en la jungla norte, pintada con bandas de dunas, rizos, grietas y piedras sueltas. Dentro del calvero crecen cuatro cactus 3D por zona: tronco y brazos de cilindros con un verde apagado, alturas y giros variados, y collider circular como los árboles. Sobre la zona flota una capa de **polvo en suspensión**: 90 partículas suaves repartidas en una caja amplia que derivan con el viento, crecen y se desvanecen, con textura de manchas difusas para que se lean como polvo y no como chispas. El terreno es de tipo Tierra, así que frena a Pikachu, Charmander y Lucario, mientras Bulbasaur queda neutro porque su tipo Planta resiste Tierra pero su tipo Veneno la recibe.

La **escarcha** (`ice`, tipo Hielo) suma al suelo helado un efecto 3D propio. El calvero se llena de **racimos de cristales**: cada racimo es una malla de 5–7 esquirlas facetadas de 4–5 caras, con una base poligonal, una cintura estrechada y una punta inclinada hacia fuera. El color va por vértice, de azul profundo en la base a blanco casi puro en la punta, con el tono variando por faceta y un material de brillo alto para que el hielo destelle al girar la cámara. Se reparten de forma determinista por el calvero con cuatro variantes de malla, escala y giro aleatorios, y no colisionan. Encima cae **nieve fina**: 70 copos suaves con textura de cristal de cuatro brazos que descienden despacio, derivan con el viento y se desvanecen al final de su vida, con `preWarm` para que la nevada ya esté en el aire al cargar.

El **bosque umbrío** (`ghost`, tipo Fantasma) pasa de ser solo suelo pintado a tener volumen propio. En cada calvero se levantan **cinco árboles secos y retorcidos** con tres variantes de malla: raíces cortas, tronco en dos tramos inclinados y tres o cuatro ramas quebradas en dos segmentos, todo con prismas facetados y color por vértice, del casi negro de la base al gris violeta de las puntas. Son los únicos árboles del mapa que proyectan sombra real y tienen collider circular. Entre ellos flotan **18 fuegos fatuos** aditivos: orbes pequeños que nacen en una caja baja, derivan muy despacio y parpadean con una textura neutra teñida de violeta por el `colorGraph`. Una luz omni violeta de corto alcance respira con un pulso lento y tiñe troncos y suelo. Por último, una **niebla rastrera** de 130 partículas cubre el calvero con una capa continua: caja ancha y casi plana, vida larga, opacidad media-alta y deriva horizontal, para que se lea como un bosque húmedo y no como el humo vertical de la ciénaga. Los árboles se mecen muy poco y muy despacio en `world.update`.

Las **bases** son plataformas de piedra pintadas en el suelo con un anillo y cuatro losanges del color del equipo (azul o rojo). En el centro hay un nexo 3D: pedestal de dos tambores de piedra, cristal emisivo del color del equipo y una luz omni corta que tiñe la plataforma. El cristal y el pedestal son colliders circulares. La base azul acoge al equipo azul y a los Pokémon de exposición del menú, colocados en un anillo derivado de su respawn; la roja es el punto de aparición del otro equipo.

La **hierba alta**, la **hierba oscura de la ciénaga**, el **claro feérico** y el **páramo** son los calveros con volumen propio. La hierba alta, además de pintarse en el suelo con briznas de 2 px y punta clara, genera matas 3D hechas con geometría real. Cada mata es una malla de 18 briznas (dos tramos y punta, con curvatura y alturas variadas) coloreadas por vértice con verdes profundos, de tono oscuro en la base a más claro en la punta; no usa texturas ni recortes alfa, así que tiene volumen desde cualquier ángulo y se resuelve en una sola llamada de dibujo por mata. Las matas se colocan de forma determinista dentro de las regiones derivadas de las celdas `tallGrass` (`TERRAIN_ZONES`), con densidad alta para que el calvero se lea frondoso, no colisionan y se mecen con el viento en `world.update` inclinándose sobre su base con una fase ligada a la posición.

El **claro feérico** usa la misma técnica con flores en vez de briznas. Cada mata 3D es una malla de siete flores con tallo de dos cintas cruzadas, tres hojas a media altura y una corola de cinco o seis pétalos alrededor de un corazón amarillo. Los pétalos salen en rosa, lila, blanco, amarillo pálido y azul cielo, con una ligera variación de tono por pétalo, y todo el color va por vértice: sin texturas ni recortes, con volumen desde cualquier ángulo. Las matas se reparten de forma determinista por el calvero (tipo `fairy`) con densidad alta, no colisionan y se mecen con el viento algo más despacio que la hierba, porque el tallo es más rígido que una brizna. Sobre las flores flota **polen dorado**: 64 motas aditivas diminutas con un núcleo brillante y cuatro destellos que derivan despacio, titilan y se apagan, para que el calvero se lea como un lugar encantado y no como un prado cualquiera. Y entre el polen revolotean **ocho mariposas 3D**: un cuerpo fino y dos alas horizontales con color por vértice (más oscuras junto al cuerpo y casi blancas en la punta) que aletean rápido y vuelan hacia objetivos aleatorios dentro del calvero, eligiendo otro al llegar.

El **páramo** cambia las briznas verdes por frailejones y hierba seca. Cada mata de frailejón es uno o dos ejemplares de 0,3–0,64 u: un tronco leñoso oscuro de siete caras y tres bandas con sombreado plano y ligera inclinación, rematado por una roseta de hojas lanceoladas. La roseta lleva una corona exterior casi horizontal, otra interior más erguida, un brote central y un faldón de hojas secas hacia abajo; las hojas van de verde grisáceo en la base a blanco plateado en la punta, todo por color de vértice y sin texturas, así que la planta se lee como frailejón desde cualquier ángulo. Entre los frailejones crece hierba seca: matas de 14 briznas con la misma geometría y volumen que la hierba alta, pero más cortas y en tonos pajizos, de marrón oscuro en la base a ocre claro en la punta. Todo se reparte de forma determinista por el calvero (tipo `electric`), no colisiona y se mece con el viento: apenas los frailejones y algo más la hierba seca.

Las **aguas profundas** (`waterHigh`) bloquean el paso solo a los Pokémon que no sean de tipo Agua: el resto puede entrar en las someras y rodear el centro, pero no cruzar las celdas profundas. La colisión se resuelve empujando el círculo del jugador fuera de cada celda profunda. El HUD lo avisa cuando estás en aguas someras con un Pokémon no acuático. El HUD de telemetría muestra el nombre del terreno y una insignia con su tipo.

### Velocidad según el terreno

Cada terreno modula la velocidad del Pokémon que lo atraviesa. La relación se resuelve en `src/game/terrainSpeed.ts` con la tabla de tipos de Pokémon, usando el tipo del terreno como atacante:

| Relación | Multiplicador |
| --- | --- |
| Terreno propio (el Pokémon comparte el tipo del terreno) | ×1,18 |
| Terreno hostil (el tipo del terreno es súper eficaz contra el Pokémon) | ×0,82 |
| Terreno cómodo (lo resiste o es inmune a él) | ×1,08 |
| Neutro | ×1,00 |

Algunos ejemplos con el roster actual: Squirtle nada más rápido en aguas someras (×1,18) pero se frena en la hierba alta (×0,82); Pikachu sufre en la Arena y el Desierto porque el tipo Tierra es súper eficaz contra Eléctrico (×0,82) y va neutro por los carriles; Charmander corre por la Colada volcánica (×1,18) y se frena en las bases y el Desierto (×0,82); Bulbasaur agradece la Ciénaga y la jungla (×1,18); Eevee va más rápido por los carriles y la Carretera porque comparte el tipo Normal (×1,18) y nota una leve ventaja en el Bosque umbrío (×1,08); Lucario también agradece los carriles y el asfalto, ya que el Acero resiste el tipo Normal (×1,08), pero el Desierto le cuesta (×0,82). Greninja se mueve como pez en el agua (×1,18 en aguas someras y profundas), resiste la Colada volcánica y la Escarcha (×1,08) y el Bosque umbrío (×1,08 por su tipo Siniestro), pero la jungla y la hierba alta lo frenan (×0,82) y el Páramo eléctrico y el Claro feérico lo castigan (×0,82). Mewtwo y Mew, Psíquicos puros, se mueven neutros por casi toda la arena (×1,00); solo el Bosque umbrío los frena (×0,82, porque Fantasma es súper eficaz contra Psíquico). Onix, de tipo Roca/Tierra, corre por la Arena, el Desierto y las bases (×1,18) y se atasca en el agua, la jungla, la hierba alta y la Escarcha (×0,82). Scyther, Bicho/Volador, agradece la jungla, la hierba alta, la Arena y el Desierto (×1,08) pero las bases, la Colada volcánica, la Escarcha y el Páramo lo frenan (×0,82). El HUD muestra el multiplicador activo junto al terreno, con una nota explicando el motivo, y la velocidad punta final combina la del Pokémon con la del terreno.

### Niebla de guerra y visión

Cada vista del splitscreen tiene su propia niebla. No es un estado global del mapa: es lo que ve el Pokémon de ese jugador. Dentro de su radio de visión el mundo se dibuja normal; fuera, un degradado oscurece el terreno y los Pokémon que no se ven se ocultan. La visibilidad de cada Pokémon es binaria (visible u oculto); el degradado es solo la lectura visual del borde, no una tercera transición de juego.

Los rangos base viven en `POKEMON_VISION` (`src/game/vision.ts`):

| Pokémon | Rango | Motivo |
| --- | --- | --- |
| Bulbasaur | 8,0 u | Bajo, pesado y con poca altura de ojos |
| Squirtle | 8,5 u | Vista corta pero constante |
| Charmander | 9,5 u | La llama de la cola ilumina el entorno cercano |
| Eevee | 9,5 u | Olfato y oído finos |
| Lucario | 10,5 u | Percibe el aura |
| Pikachu | 11,0 u | El más alerta por sus sentidos eléctricos |
| Mew | 11,0 u | Sentidos psíquicos y curiosidad infinita |
| Greninja | 11,5 u | Instinto de ninja, segundo alcance del grupo |
| Mewtwo | 12,0 u | Poder psíquico: percibe a distancia, el que más lejos ve |
| Onix | 8,8 u | Vive bajo tierra: poca luz y vista corta |
| Scyther | 10,8 u | Ojos de depredador y reflejos de mantis |

La **ocultación base** depende del terreno que pisa el Pokémon al que se intenta ver (`TERRAIN_CONCEALMENT`). Los tipos del Pokémon la mejoran o empeoran con la misma relación que la velocidad (`terrainSpeed.ts`): comparte tipo con el terreno ×1,5; el terreno es súper eficaz contra él ×0,5; lo resiste o es inmune ×1,15; neutro ×1. La ocultación final se limita al 85% para que nunca sea imposible ver a alguien pegado.

| Terreno | Ocultación base |
| --- | --- |
| Hierba alta | 45% |
| Bosque umbrío | 40% |
| Ciénaga | 30% |
| Claro feérico | 26% |
| Jungla / Páramo | 22% |
| Aguas profundas | 20% |
| Escarcha / Desierto | 14% |
| Colada volcánica | 12% |
| Aguas someras | 10% |
| Arena | 8% |
| Carril / Carretera / Base | 0% |

Ejemplos con el roster actual: Bulbasaur en hierba alta llega al 67,5% de ocultación (45% × 1,5 por compartir Planta), Squirtle baja al 22,5% (Grass es súper eficaz contra Water) y Charmander se queda en el 51,75% (Grass no es eficaz contra Fire). Pikachu pasa del 45% de la hierba alta al 7% del desierto, donde Ground lo delata. Greninja también se esconde mal en la hierba alta (22,5%, porque Grass es súper eficaz contra su tipo Agua), pero en el Bosque umbrío sube al 46% (40% × 1,15 porque su tipo Siniestro resiste Fantasma). Mewtwo y Mew no comparten tipo con ningún terreno, así que conservan la ocultación base (45% en la hierba alta), pero en el Bosque umbrío bajan al 20% (40% × 0,5, porque Fantasma es súper eficaz contra Psíquico).

La fórmula de visibilidad es:

```
visible = distancia ≤ rangoVisión × (1 − ocultación)  &&  línea de visión libre
```

La ocultación se evalúa en el terreno del **objetivo**, no en el del observador. El jugador siempre se ve a sí mismo. La **histéresis** de 0,2 u evita que un Pokémon parpadee justo en el borde del radio. La visión es **individual**: cada jugador ve solo con su Pokémon, así que un aliado que sale de su radio también se oculta.

La línea de visión la bloquean las **cordilleras** y los **árboles** (incluidos los árboles secos del bosque umbrío). Para ello, sus colliders llevan un `sightRadius` mayor que el radio de colisión de los árboles, de modo que la copa tapa aunque el tronco sea fino. Los cactus y los adornos de las bases no bloquean. El chequeo es una distancia segmento-segmento/círculo en `vision.ts`, sin raycasts contra mallas.

El HUD de cada vista muestra el rango base de la especie, la ocultación actual y el radio al que te detectaría un observador con tu mismo rango; el motivo y el desglose (base × multiplicador) aparecen en el `title` del bloque de visión. El sombreado se resuelve en el motor: cada vista monta un quad pegado a su cámara, en su propia capa de render, con un `ShaderMaterial` que recibe por uniformes el centro y los radios del círculo de visión (`src/game/fog.ts`). Se dibuja al final de las transparencias y sin `depthTest`, así que cubre el mundo de esa vista pero no el HUD de React. No hay capa HTML de niebla.

Las **cordilleras** proyectan además una cuña de sombra como **decal en el suelo**. La máscara se dibuja en coordenadas XZ del mapa y el plano vive en la capa de esa vista; la cámara solo lo mira, no lo deforma. Al estar sobre el suelo y usar `depthTest`, la propia montaña, los árboles y los actores lo tapan y conservan su iluminación. El shader del decal recibe también el óvalo de pantalla de la niebla circular y funde ambas capas por máximo (con `CONFIG.vision.mountainOverlap` de diferencia extra), de modo que donde coinciden no se suman dos veces ni dejan un borde casi negro, pero la cuña sigue leyéndose. Los árboles siguen bloqueando la línea de visión de los actores, pero de momento solo las cordilleras sombrean el terreno.

### Sumergirse en el agua

Cada cuerpo de agua combina el lecho pintado en el suelo con dos láminas planas y translúcidas a `waterHeight` (0,3 u por defecto), sin paredes ni grosor: una capa base y una capa de brillos que se desplazan en sentidos opuestos con sus UVs animadas, más un latido de opacidad en la capa de brillos para que la corriente se lea de un vistazo. La malla se construye triangulando el contorno de las celdas de agua y las UVs se escalan por el tamaño del cuerpo, así que el oleaje se lee igual en lagos grandes y pequeños. El desplazamiento de UVs se aplica con `diffuseMapOffset` seguido de `material.update()` en cada frame: sin esa llamada, PlayCanvas no sube las transformadas de textura al uniform buffer y el agua queda congelada. Al entrar en el agua, el sprite se hunde de forma progresiva (`submergeShallow` en aguas someras y `submergeDeep` en profundas): la parte del cuerpo que queda bajo la superficie la tapa la lámina, la sombra de contacto se oculta y el anillo de rumbo flota sobre el agua. La inmersión se mide como fracción de la altura de cada sprite, así que Pokémon altos y bajos se mojan de forma parecida. Al salir, el sprite emerge con la misma interpolación.

## Cómo funciona el pipeline de sprites

`scripts/import-sprites.mjs`:

1. Descarga `AnimData.xml`, `credits.txt`, `{Idle,Walk}-Anim.png` y `{Idle,Walk}-Shadow.png` desde el repositorio de PMD Sprite Collab.
2. Descarga el retrato `portrait/<id>/Normal.png` de cada Pokémon y lo guarda como `portrait.png`; las interfaces HTML usan ese retrato en lugar de las hojas animadas.
3. Valida que la hoja encaje en la rejilla declarada: 8 filas (direcciones) y una columna por duración de animación.
4. Decodifica el PNG de la sombra sin dependencias externas y localiza el píxel blanco de cada frame; la media de esos píxeles es el **ancla de suelo**.
5. Decodifica también la hoja de animación para guardar el píxel inferior con contenido visible de cada frame (`bottoms`), que evita que el suelo recorte el dibujo.
6. Escribe `public/sprites/manifest.json` con frames, duraciones en ticks de 1/60 s, anclas, bordes inferiores y ruta del retrato por Pokémon, créditos y metadatos de licencia.
7. Genera `public/sprites/CREDITS.md`.

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
public/maps/
  index.json                 lista de mapas disponibles
  map.schema.json            esquema JSON para validar los mapas
  arena.json                 mapa por defecto en rejilla + respawns + cordilleras
  lago.json                  segundo mapa de ejemplo
src/game/
  config.ts                  escala de píxel, cámara, jugador, niebla y visión
  types.ts                   tipos del manifiesto y del estado del juego
  map.ts                     carga y validación de los mapas JSON
  multiplayer.ts             equipos, spawns, reparto de viewports y tipos compartidos
  terrain.ts                 rejilla, consultas, regiones derivadas y agua
  textures.ts                texturas procedurales (suelo por celdas, calveros, agua, cielo, sombra, props)
  world.ts                   mundo, bases, nexo, árboles, luces y colisiones
  camera.ts                  rig orbital a 45° con viewport y capas por jugador
  input.ts                   1 teclado + mandos, snapshots por dispositivo y acciones de menú
  roster.ts                  velocidad punta de cada Pokémon
  terrainSpeed.ts            multiplicadores de velocidad por terreno y tipo
  vision.ts                  rangos de visión, ocultación, tipos y línea de visión
  fog.ts                     quad de visión, decal de sombra y shaders
  sprite.ts                  texturas, material, UVs, animación y billboard
  marker.ts                  anillo de jugador con flecha de rumbo y color de equipo
  actor.ts                   sprite + sombra de contacto + posición + capa de render
  game.ts                    orquestador: menú, equipos, partida, cámaras y colisiones
src/ui/
  PokemonPortrait.tsx        retrato normal para las interfaces HTML
  Brand.tsx                  logotipo compartido (versión normal y compacta)
  KeyPill.tsx                tecla/botón de los textos de ayuda
  LobbyScreen.tsx            sala de equipos y detección de mandos
  RosterScreen.tsx           selección simultánea de Pokémon
  MatchHud.tsx               etiquetas, telemetría y bordes del splitscreen
  TypeBadge.tsx              insignia de tipo
  typeInfo.ts                colores y etiquetas de tipos
  buttonStyles.ts            variantes y tamaños de los botones en Tailwind
  styles.ts                  clases compartidas (eyebrow, pasos del asistente)
  rosterGrid.ts              columnas de la rejilla según el viewport
src/App.tsx                  flujo de pantallas, estado de jugadores y modales
src/index.css                Tailwind: tokens del tema y estilos base
```

## Ajustes rápidos

Casi todo lo “mágico” está en `src/game/config.ts`:

- `PIXEL_SCALE` (0.045): unidades de mundo por píxel de sprite. Es común a todo el roster para conservar tamaños relativos.
- `CONFIG.sprite.filter` (`'nearest'` | `'smooth'` | `'linear'`), `CONFIG.sprite.smoothScale` y `CONFIG.sprite.alphaToCoverage`: suavizado del sprite. `'smooth'` es el equilibrio entre nitidez y borde suave; `smoothScale` (2-4) controla cuánto se afila (`4` = casi nítido, `3` = equilibrado, `2` = más suave).
- `PITCH_DEG` (45) y `VERTICAL_STRETCH`: inclinación y corrección de píxeles.
- `camera.distance`, `fov`, `followLerp`: encuadre y suavidad. En partidas de 3-8 jugadores cada cámara arranca un 12 % más lejos para compensar el viewport estrecho.
- `player.speed`, `acceleration`, `radius`: sensación de movimiento y colisión. La velocidad final de cada Pokémon sale de `src/game/roster.ts`; `player.speed` queda como respaldo. Los multiplicadores por terreno están en `TERRAIN_SPEED_FACTOR` (`src/game/terrainSpeed.ts`).
- `POKEMON_VISION`, `TERRAIN_CONCEALMENT` y `CONCEALMENT_TYPE_FACTOR` en `src/game/vision.ts`: rango base por especie, ocultación de cada terreno y cuánto la modulan los tipos. La fórmula y la oclusión están en el mismo módulo.
- `CONFIG.vision` (`src/game/config.ts`): histéresis de visibilidad, tope de ocultación, opacidad, color y suavizado del borde del sombreado. El `sightRadius` de árboles y cordilleras se define al crear sus colliders en `src/game/world.ts`.
- `MASK_SIZE`, `MAX_OCCLUDERS`, `SHADOW_LENGTH` e `INSIDE_EDGE_EXTENSION` en `src/game/fog.ts`: resolución de la máscara del decal de sombra, número máximo de tramos de cordillera que proyectan, alcance de cada cuña y extensión del caso pegado a la cresta. `MOUNTAIN_SHADOW_RADIUS` en `src/game/game.ts` controla el ancho de las cuñas respecto al radio de colisión del tramo; `mountainOverlap` en `CONFIG.vision` controla cuánto se oscurece la cuña donde coincide con la niebla circular (0 la oculta del todo).
- `player.markerDiameter`, `markerHeight` y `markerOpacity`: tamaño del anillo de rumbo, su altura sobre el suelo y su transparencia.
- `player.submergeShallow`, `submergeDeep` y `submergeLerp`: fracción de la altura del sprite que se sumerge en cada tipo de agua y con qué suavidad lo hace.
- `public/maps/*.json`: rejilla de terrenos, `tileSize`, `waterHeight`, respawns de cada equipo, cordilleras y punto de cámara del menú. `public/maps/index.json` decide qué mapas aparecen en el selector. `TERRAINS` en `src/game/terrain.ts` mantiene los nombres y tipos Pokémon de cada `TerrainId`.
- `MAX_PLAYERS`, `MAX_TEAM_SIZE`, `TEAM_INFO`, `spawnForTeam` y `computeSplitLayout` en `src/game/multiplayer.ts`: límite de jugadores, tope por equipo, colores/coordenadas de base y rejilla del splitscreen.
- `NPC_SLOTS` (`src/game/game.ts`): Pokémon de exposición que acompañan al menú de equipos en la base azul.

Los colores de acento, tipos y créditos vienen del manifiesto.

## Limitaciones conocidas

- Solo se importan **Idle** y **Walk**; no hay ataque, daño, captura ni combate.
- El multijugador local es **exploración libre por equipos**: no hay objetivo, marcador ni condición de victoria.
- La selección de Pokémon permite repetir especie aunque hay 11 especies para hasta 8 jugadores.
- Los NPC del menú son estáticos: giran hacia la cámara, pero no patrullan.
- La niebla exterior es un círculo de pantalla por vista; las cordilleras añaden un decal de sombra fijo en el mundo. No es un polígono de visibilidad exacto y los árboles ocultan actores, pero de momento no sombrean el terreno.
- No hay audio, guardado ni soporte táctil específico (la demo está pensada para escritorio con mandos o teclado).
- La arena es una demostración visual de estilo MOBA: no hay oleadas de súbditos, torretas ni objetivos.
- En splitscreen, el mundo se dibuja una vez por vista. Con 7-8 jugadores el rendimiento baja de forma notable, sobre todo en equipos modestos.

## Créditos y licencia

Los sprites pertenecen a la comunidad de **[PMD Sprite Collab](https://sprites.pmdcollab.org/)** y se distribuyen bajo **[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)**. Esta demo es **no comercial** y muestra la atribución en la interfaz y en `public/sprites/CREDITS.md`.

Cada Pokémon conserva su `credits.txt` original en `public/sprites/<id>/`. El código del proyecto es una demo técnica y no reclama propiedad sobre esos sprites.
