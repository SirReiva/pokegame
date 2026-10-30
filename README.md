# NewPoke · demo técnica de sprites, cámara y multijugador local

Demo jugable en navegador que mezcla un **mapa 3D** con **Pokémon dibujados como sprites 2D de 8 direcciones** y **multijugador local de 1 a 8 jugadores en splitscreen**. Cada personaje es un billboard vertical con ancla de suelo, sombra de contacto y colisión, y la cámara orbital a **45°** hace que el sprite elija la vista correcta en cada momento.

El objetivo no es un juego completo, sino validar la técnica: motor 3D imperativo con PlayCanvas, UI en React y un pipeline de assets reproducible.

## Stack

- **React 19** + **TypeScript 7** + **Vite**: HUD, menús y pantallas.
- **wouter**: router mínimo para el flujo entre menú, configuración y partida.
- **Tailwind CSS 4** (plugin de Vite): utilidades en los componentes y tokens de diseño en `src/index.css`.
- **PlayCanvas 2.23**: render 3D, cámara, luces, sombras y mundo.
- **PMD Sprite Collab**: hojas de animación de 8 direcciones (Idle, Walk, Attack, Hurt, Faint, QuickStrike, Shock, Shoot, Charge y Strike cuando existen).
- Sin framework de UI 3D: React nunca toca la escena; habla con `Game` mediante callbacks.

## Arranque

```bash
pnpm install
pnpm dev           # servidor de desarrollo
pnpm build         # comprobación de tipos + build de producción
pnpm preview       # servir el build
```

Los sprites ya están incluidos en `public/sprites/`. Para volver a descargarlos y regenerar el manifiesto:

```bash
pnpm sprites            # usa la caché local
pnpm sprites --force    # fuerza la descarga
```

Requiere Node 18+ (el importador usa `fetch` y `zlib`).

## Flujo de pantallas

La navegación usa **wouter**. El estado compartido (manifiesto, mapas y jugadores) vive en `SessionProvider`; PlayCanvas solo se monta al entrar en `/play`. Las rutas de partida y del editor se cargan con `lazy`/`Suspense`, así que el menú no descarga el motor 3D.

| Ruta | Pantalla |
| --- | --- |
| `/` | Menú principal: **Jugar**, **Editor** y **Opciones**. |
| `/opciones` | Controles, créditos y licencia. Vuelve a la pantalla desde la que se abrió. |
| `/editor` | Editor de mapas a pantalla completa. |
| `/lobby` | Paso 1: unirse con cada mando, elegir equipo y mapa. |
| `/roster` | Paso 2: cada jugador elige su Pokémon y marca listo. |
| `/play` | Partida: se crea el canvas y el motor de PlayCanvas. |

`Jugar` empieza una sesión limpia. Al salir de la partida se puede volver a `/roster`, a `/lobby` o al menú. Las rutas de configuración redirigen a `/lobby` si no hay jugadores (por ejemplo, al recargar la página).

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
| Correr | `L3` | `Shift` |
| Habilidad básica | `X` | `J` |
| Habilidad 1 | `Y` | `K` |
| Habilidad 2 | `RB` | `L` |
| Habilidad 3 | `LB` | `U` |
| Pausa | `Start` / `B` | `Esc` |
| Ocultar HUD | — | `H` |

La configuración tiene dos rutas:

1. **`/lobby` · Equipos**: cada mando pulsa `A` para unirse y elige lado azul o rojo. Hasta cuatro jugadores por equipo y ocho en total. Cuando todos marcan listo, se continúa con `A`.
2. **`/roster` · Pokémon**: cada jugador mueve su cursor por las veinte especies y confirma con `A`. Se permiten repetidos. Cuando todos están listos, `A` inicia la partida en `/play`.

Cada equipo aparece en su base (azul o roja). La pantalla se reparte en una vista por jugador con su propia cámara y su propio anillo de equipo.

## Combate

La partida es un **team deathmatch a 15 KO**: cada baja suma un punto al equipo que la consigue y gana el primero que llegue al objetivo. Al morir se reaparece en la base a los 5 s, con 2 s de invulnerabilidad. El HUD muestra el marcador, la vida, los KO/muertes y los enfriamientos de las cuatro habilidades de cada jugador.

Las habilidades se lanzan **en la dirección en la que mira el Pokémon** (`facing`), sin ayuda de apuntado: el jugador apunta colocándose y girando con el movimiento. Cada habilidad puede ser un golpe cuerpo a cuerpo en cono, un proyectil, un haz instantáneo, un área delante del lanzador, un dash o una habilidad centrada en uno mismo. Las que no necesitan dirección (buffs, escudos) se resuelven sobre el lanzador.

Los haces (como `Rayo`) se detienen en el primer separador, muro o roca: ni el visual ni el daño atraviesan obstáculos. Su efecto son **dos rayos zigzagueantes que giran en sentidos opuestos** y se cruzan mientras el haz avanza desde el lanzador.

Los **dashes** avanzan en pasos pequeños y comprueban la colisión de cada tramo, así que se detienen en separadores, árboles, muros y límites del mapa en lugar de atravesarlos. El desplazamiento se reparte durante la animación (por ejemplo, `QuickStrike` en Ataque Rápido), con rastro progresivo y daño a lo largo del recorrido, en vez de teletransportar al Pokémon. La duración se escala con la distancia real: si un obstáculo acorta el dash, la animación también termina antes. Además, la animación se reproduce a la velocidad necesaria para durar exactamente lo mismo que el desplazamiento (más lenta en el dash completo, más rápida si un obstáculo lo acorta).

Las hojas de animación con mucho espacio vacío se recortan al cargar a una **hoja tight por dirección** usando `contentRows`: cada frame se ajusta al arte real alrededor del ancla de los pies. Así el plano deja de ser un cuadrado gigante y el personaje queda centrado sobre el Pokémon. `Charge` y `Strike` son la excepción: conservan el frame completo para que su movimiento horizontal no se cancele, y su desplazamiento vertical se convierte en un avance sobre el suelo (hacia o desde la cámara), de modo que el sprite no se entierra bajo el terreno.

El daño usa la **fórmula oficial de Pokémon a nivel 50** con stats base reales, IV 31 y EV 0:

```
base = floor(floor((2 × 50 / 5 + 2) × potencia × ataque / defensa) / 50) + 2
daño = base × crítico × aleatorio × STAB × efectividad de tipos
```

Incluye separación físico/especial, STAB, tabla de tipos completa, precisión, crítico 1/24 y factor aleatorio 0,85–1,00. No hay fuego amigo: las habilidades solo dañan al equipo rival. Los stats de cada especie viven en `src/game/pokedex.ts`, la tabla de tipos en `src/game/typeChart.ts` y la fórmula en `src/game/combat.ts`.

Cada impacto muestra la **cantidad de daño en rojo** sobre la cabeza del objetivo, en todas las vistas donde se le vea. El texto se genera en un canvas, se sube como textura y se dibuja con un quad de PlayCanvas en la capa de cada viewport; el propio motor anima la subida, el pequeño “pop” y el fadeout. Los críticos salen más grandes y con un `!`.

Los golpes aplican **0,15 s de hitstun** y algunas habilidades empujan al objetivo (Placaje, 0,6 u). Si dos golpes melee rivales conectan en el mismo frame, se resuelve un **choque**: ninguno recibe daño, ambos reciben 0,25 s de stun y retroceden 1 u. Así dos Placajes simultáneos no se intercambian gratis y se evita el stun-lock con el enfriamiento corto de Placaje.

El catálogo de habilidades está en `src/game/abilities.ts`. Cada habilidad se registra en `ABILITIES` y se asigna a un Pokémon en `MOVESETS` con el orden `[básica, habilidad 1, habilidad 2, habilidad 3]`. Mientras un hueco sea `null`, el HUD lo muestra como «Sin asignar». Las animaciones `Attack` y `Hurt` se importan para todo el roster y se reproducen al atacar y al recibir daño. Al morir se reproduce `Faint` si la especie la tiene; si no, se usa `Hurt` como respaldo.

El primer set definido es el de **Pikachu**: `Placaje` (básica melee), `Ataque Rápido` (dash con la animación `QuickStrike` de PMD), `Rayo` (haz con **0,5 s de preparación** y la animación `Shock` de PMD) e `Impactrueno` (proyectil con la animación `Shock` de PMD y **0,22 s de preparación** antes de lanzarlo, habilidad 3). Con él ya se puede probar el combate en cuanto haya un Pikachu en cada equipo.

**Charmander** tiene el segundo set: `Arañazo` (básica melee rápida con la animación `Strike` de PMD), `Giro Fuego` (remolino de fuego persistente delante, 3,6 u de alcance y 1,7 u de radio, 35 de daño por segundo durante 2,4 s), `Lanzallamas` (haz de fuego de 9,5 u que atraviesa a todos los rivales en línea) y `Anillo Ígneo` (definitiva: gran área de 3,1 u de radio con 110 de potencia). Sus tres habilidades de fuego usan `impactStyle: 'fire'`, y el haz y las áreas tienen visual propio (`beamStyle: 'fire'` y `aoeStyle: 'fire'`).

**Bulbasaur** tiene el tercer set: `Placaje` (básica melee), `Paralizador` (golpe melee de estado que lanza una nube de partículas verdes y ralentiza un 45 % durante 3 s), `Hoja Afilada` (golpe melee de 2,6 u con 60 de potencia y empuje) y `Lluevehojas` (definitiva: área instantánea de 3,2 u de radio y 120 de potencia). `Paralizador` usa `impactStyle: 'spore'`, `Lluevehojas` `aoeStyle: 'grass'` y `Hoja Afilada` `impactStyle: 'grass'`.

**Mewtwo** tiene un set de bruiser móvil: `Telequinesis` (básica melee de 2,5 u y 55 de potencia con empuje fuerte de 1,4 u), `Teletransporte` (dash de estado de 5 u para entrar o salir, sin daño), `Psíquico` (haz de 10 u que atraviesa a todos los rivales en línea) y `Psicoataque` (definitiva: implosión de 3,2 u de radio con 125 de potencia y daño radial, 35 % en el borde). El haz y el área usan `beamStyle: 'psychic'` y `aoeStyle: 'psychic'`; la básica y los impactos, `impactStyle: 'psychic'`. La definitiva prepara `0,8 s` y muestra la marca de área en el suelo.

**Mew** tiene un set de comodín psíquico: `Golpe Psíquico` (básica melee de 2,1 u y 45 de potencia), `Agilidad` (dash de 4,4 u que además da un 30 % de velocidad durante 3 s), `Premonición` (área retardada: marca un punto a 6 u y tras 0,9 s cae una explosión de 2,4 u con 85 de potencia, daño radial 100 %→50 % y ralentización del 30 % durante 2 s) y `Recuperación` (se concentra 0,75 s y cura el 25 % de la vida máxima, con 14 s de enfriamiento, cancelable si la golpean). Usa `impactStyle: 'psychic'`, `aoeStyle: 'psychic'` y el nuevo estallido rosa de curación.

Las habilidades de estado pueden declarar una `slow` (`{ multiplier, duration }`), que se aplica a los enemigos alcanzados aunque la habilidad no haga daño. La velocidad se multiplica por ese valor mientras dure el efecto; al reaparecer o morir se limpia. `Paralizador` es el primer caso: `slow: { multiplier: 0.55, duration: 3 }`.

También pueden curar al lanzador con `healSelf`, una fracción de la vida máxima (`0.25` = 25 %; `0` por defecto). La curación se aplica al ejecutar la habilidad, nunca supera la vida máxima y muestra un número flotante rosa con prefijo `+`. `Recuperación` de Mew usa `healSelf: 0.25`, se concentra `0,75 s` y se cancela si le golpean antes de completarla.

### Arquitectura y patrones

El combate está separado por responsabilidades para que `game.ts` solo orqueste:

- **Builder** (`abilities.ts`): cada habilidad se declara con `ability(...).power(...).cooldown(...).build()`; `registerAbility` la valida y la mete en `ABILITIES`. Los valores por defecto siguen viviendo en `DEFAULT_ABILITY`.
- **Strategy + Registry** (`abilityExecutors.ts`): `ABILITY_EXECUTORS[shape]` resuelve `melee`, `projectile`, `beam`, `aoe`, `dash` y `self`. Añadir una forma nueva es registrar una estrategia, no añadir otro `case` a `executeAbility`.
- **Compose** (`effects.ts`): `CAST_EFFECTS` encadena buffs y curación al lanzar. `compose(...)` permite añadir pasos sin tocar el orden de los existentes.
- **Decorator** (`combat.ts`): `DAMAGE_MODIFIERS` aplica crítico → aleatorio → STAB → efectividad en cadena; cada decorador redondea con `floor` y conserva la fórmula oficial.
- **Factory** (`combatFx.ts`): `projectileFactories`, `beamFactories`, `aoeFactories` e `impactEffects` eligen el VFX por estilo sin cadenas de `if`. `spawnImpact` es el punto de entrada para los impactos.
- **Strategy de colisión** (`combat.ts`): cada tipo de collider declara su distancia a un punto y a un segmento; el raycast y el bloqueo de línea de visión comparten esas estrategias.
- **Command/Registry del editor** (`MapEditorScreen.tsx` y `mapEditor.ts`): las herramientas de pintado son comandos por id y la validación del mapa es una lista ordenada de reglas, así que añadir una regla no toca las demás.

`Game` conserva el estado mutable de la partida (`matchState.ts`) y delega el resto. `matchState.ts` define jugadores, proyectiles, áreas, dash y lanzamientos pendientes sin depender de la clase `Game`.

El fuego tiene efectos dedicados: el proyectil es una bola con núcleo blanco-amarillo y estela de llamas; el haz es un chorro de lenguas de fuego solapadas con núcleo brillante y llama en la punta; las áreas usan dos estilos (`aoeStyle`): `whirl` levanta tres brazos espirales de llamas que giran como un remolino, y `fire` reparte tres anillos concéntricos de llamas por todo el disco; cada impacto genera además una explosión con núcleo, halo, llamas ascendentes, chispas y anillo en el suelo. Las llamas combinan quads cruzados con una textura procedural (`createFlameCanvas` en `textures.ts`) y partículas orientadas a cámara con esa misma textura, de modo que el fuego tiene volumen y movimiento en todas las vistas del splitscreen. Cada efecto de fuego añade además una luz omni cálida de corto alcance que tiñe el suelo y los sprites cercanos. El visual eléctrico de `Impactrueno`/`Rayo` sigue disponible con `projectileStyle`, `beamStyle` e `impactStyle` a `'electric'`.

Planta y Veneno tienen estilos propios: `aoeStyle: 'grass'` levanta un torbellino bajo y ancho de hojas que gira en espiral y ocupa todo el radio del área, con partículas de hoja y un anillo verde; `aoeStyle: 'poison'` levanta una nube de esporas con puffs y motas aditivas, disponible para futuras áreas. Los golpes melee usan `impactStyle: 'grass'` (hojas despedidas) o `'spore'` (rocío de partículas pequeñas de verde oscuro que nace en el vértice y se abre hacia todos los ángulos del borde, como `Paralizador`, manteniendo el cono visible como guía), y hay proyectiles `projectileStyle: 'grass'`/`'poison'` para futuras habilidades. La silueta de hoja se genera en `createLeafParticleCanvas` y las esporas reutilizan `createPollenCanvas`.

Psíquico tiene un estilo propio: la básica `Telequinesis` marca un arco tenue y lanza orbes violetas hacia todos los ángulos del cono (`impactStyle: 'psychic'`); `Psíquico` dibuja un haz con núcleo luminoso, anillos de energía que recorren la línea y una punta pulsante (`beamStyle: 'psychic'`); y `Psicoataque` implosiona en el centro y estalla en tres ondas de choque y 54 esquirlas radiales (`aoeStyle: 'psychic'`). Cada impacto psíquico genera un núcleo blanco, un anillo violeta y 16 esquirlas que salen despedidas. Los colores van del violeta (`#AA68FF`) al malva claro (`#F2BEFF`).

El proyectil de `Impactrueno` tiene un visual eléctrico propio: núcleo brillante, halo, tres arcos zigzagueantes que giran y parpadean, y una estela orientada hacia la dirección de vuelo. Al impactar genera una pequeña explosión eléctrica con núcleo, halo, arcos cortos y anillo en el suelo. Se configura con `projectileStyle: 'electric'` e `impactStyle: 'electric'`; el resto usa el orbe y el impacto estándar. `Rayo` usa también `impactStyle: 'electric'`, así que cada enemigo alcanzado por el haz recibe su propia explosión eléctrica.

Cada habilidad puede declarar un `windup`: durante ese tiempo el Pokémon se queda quieto, reproduce su animación y no puede moverse ni lanzar otra habilidad. Al terminar, se ejecuta el efecto (proyectil, haz, golpe, dash...). Si recibe un golpe durante la preparación, la habilidad se cancela. La preparación puede usar una animación distinta de la de lanzamiento con `windupAnimation`; si no se indica, se reutiliza `animation`.

Las habilidades con `shape: 'aoe'` y `windup > 0` muestran una **marca en el suelo** desde el inicio del retardo: anillo discontinuo del radio real, relleno tenue y un disco que se llena hasta el momento del impacto. El centro se fija al empezar el lanzamiento y la marca desaparece justo antes de aplicar el daño; si el lanzamiento se cancela (golpe, KO o choque), también se retira. `Giro Fuego` prepara `0,5 s`, `Anillo Ígneo` `0,75 s` y `Lluevehojas` `0,75 s`; `Paralizador` es melee y prepara `0,2 s`.

El flag `moveWhileWindup` decide si el Pokémon puede moverse durante la preparación. Por defecto es `false` (queda clavado). Si es `true`, el movimiento y el giro siguen funcionando, pero el centro del área y su marca permanecen fijados donde se lanzó: el Pokémon puede salir de la zona mientras el ataque sigue cargándose. `Giro Fuego` lo tiene activo; `Anillo Ígneo` lo mantiene desactivado para que la definitiva arraigue al lanzador.

Las áreas reparten su daño de dos formas con `aoeDamageMode`:

- `instant`: un único golpe al completar el `windup`, como hasta ahora.
- `overTime`: el área permanece `aoeDuration` segundos y golpea cada `aoeTickInterval` a los enemigos que sigan dentro. En este modo `power` se interpreta como **daño por segundo**, así que cada tick usa `power × aoeTickInterval`. Los ticks no aplican hitstun, knockback ni cancelan lanzamientos: solo restan vida, muestran número de daño e impacto.

En ambos modos el área visible dura `aoeDuration`: el anillo y las llamas que salen del suelo se mantienen hasta el final y se apagan en los últimos 0,35 s. En `instant` el daño se aplica una sola vez al inicio y las llamas quedan como residuo visual; si quieres que sigan dañando, cambia la habilidad a `overTime`.

Las áreas pueden usar **daño radial** con `radialDamage: true`. El centro siempre hace el 100 % de la potencia y el borde hace `radialMinDamage`, con interpolación lineal según la distancia. Por defecto `radialMinDamage` vale `0`, así que el borde no hace daño; con `0.35` el borde hace el 35 %. Funciona igual en `instant` y en `overTime` (el multiplicador se aplica a cada tick). `Psicoataque` es el primer caso: 100 % en el centro y 35 % en el borde. El resto de áreas siguen haciendo daño completo porque `radialDamage` es `false` por defecto.

`Giro Fuego` usa `overTime` (35/s durante 2,4 s, ticks de 0,4 s). `Anillo Ígneo` usa `instant` con `aoeDuration: 0,5`, así que su explosión golpea una vez y el estallido de llamas dura medio segundo.

La animación de preparación se controla con `windupAnimation` y `windupAnimationMode`:

- `windupAnimation`: animación propia del `windup`. Si es `null` (por defecto), se usa la animación de lanzamiento (`animation`).
- `once` (por defecto): la velocidad se ajusta para que el clip dure exactamente lo que el `windup`. Se reproduce una sola vez y se queda en su último frame hasta que termina la acción.
- `loop`: se usa la velocidad fija de `windupAnimationSpeed` (1 = normal) y el clip se repite hasta que termina la preparación.

Por ejemplo, `Rayo` prepara `0.5 s` con `Shock` en modo `once`, así que el clip se ralentiza para encajar justo en la preparación. `Psíquico` de Mewtwo usa `windupAnimation: 'shoot'` durante sus `0.4 s` de preparación y después vuelve a `attack` para el lanzamiento. `Psicoataque` usa `windupAnimation: 'charge'` durante sus `0.8 s` de carga.

## Mapas definidos por JSON

Cada mapa vive en `public/maps/` y se carga con `fetch` al arrancar, así que se puede editar sin recompilar. `public/maps/index.json` lista los mapas disponibles: la ruta `/lobby` permite cambiar entre ellos y `?map=<id>` conserva la elección al recargar.

Un mapa es una **rejilla rectangular de tipos de terreno** más sus respawns, separadores (cordilleras y muros) y ajustes de cámara:

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
    { "kind": "mountain", "width": 2.2, "points": [[-2, 0], [0, 1], [2, 0]] },
    { "kind": "wall", "width": 1.2, "points": [[-3, -3], [3, -3]] }
  ],
  "tiles": [
    ["jungle", "jungle", "lane", "jungle"],
    ["jungle", "waterLow", "waterLow", "jungle"],
    ["jungle", "waterHigh", "waterLow", "jungle"],
    ["jungle", "jungle", "lane", "jungle"]
  ]
}
```

- La fila 0 es el **norte** (Z negativa) y la columna 0 el **oeste** (X negativa). Todas las filas de `tiles` deben tener el mismo número de columnas; el ancho y el alto pueden ser distintos.
- `tileSize` es el lado de cada celda en unidades de mundo. `waterHeight` es la altura de la lámina de agua.
- Los `TerrainId` disponibles son `jungle`, `lane`, `road`, `sand`, `waterLow`, `waterHigh`, `base`, `tallGrass`, `fire`, `electric`, `ice`, `poison`, `ghost`, `fairy` y `desert`. Sus nombres y tipos Pokémon están en `src/game/terrain.ts` (`TERRAINS`).
- `respawns` define la base y los puntos de aparición de cada equipo. `radius` es el radio de la plataforma y del anillo; si un equipo tiene varios respawns, los jugadores se reparten entre ellos.
- `mountains` son polilíneas con ancho; bloquean el paso y la línea de visión, y proyectan su cuña de sombra. `kind` elige el aspecto: `mountain` (picos de piedra, por defecto) o `wall` (sillería con almenas). La colisión y la visión son idénticas en ambos.
- `spawn` es el punto al que mira la cámara mientras se carga la partida. Si falta, se usa el respawn azul.
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

## Editor de mapas

El menú principal (`/`) y la sala de equipos (`/lobby`) enlazan a **Editor**, que también se abre directo en `/editor`. Permite crear un mapa jugable sin editar el JSON a mano:

1. **Dimensiones**: al entrar sin borrador pide id, nombre, ancho y alto de la rejilla (8–128 cada uno), `tileSize`, `waterHeight` y terreno de fondo. También puede cargar un mapa existente de `public/maps/` o importar un archivo `.json`.
2. **Dibujo**: rejilla 2D con los quince terrenos. Herramientas de lápiz (interpola al arrastrar para no dejar huecos), relleno, rectángulo y borrador. El clic derecho borra. `Ctrl+Z` / `Ctrl+Y` deshacen y rehacen.
3. **Bases**: las herramientas de base azul y roja (teclas `1` y `2`) colocan cada respawn en el centro de una celda. El radio se ajusta en el panel derecho y se aplica a ambas bases.
4. **Separadores**: la herramienta Separador (`M`) traza una polilínea haciendo clic en las celdas. En el panel derecho eliges si es cordillera o muro, y también puedes cambiar el tipo de uno ya existente. El doble clic o `Enter` cierra el trazado y el clic derecho quita el último punto. Los puntos se pueden arrastrar y las líneas admiten nuevos vértices con doble clic; el clic derecho sobre un punto lo elimina. El ancho se ajusta por separador en el panel derecho y `Supr` borra el seleccionado.
5. **Exportación**: `Exportar JSON` descarga `<id>.json` y `Copiar JSON` lo pone en el portapapeles. La validación impide exportar sin id válido, sin nombre, sin las dos bases o con separadores incompletos.

El borrador se guarda en `localStorage` (`newpoke.map-editor.draft.v1`) y se recupera al volver a abrir el editor. Para jugar el mapa, guarda el archivo en `public/maps/<id>.json` y añade su entrada a `public/maps/index.json`.

El editor dibuja y edita separadores (`mountains`), pero no cambia el `spawn` de cámara, que conserva al importar y exportar. El ancho y el alto de la rejilla pueden ser distintos; al redimensionar, los separadores se desplazan con el terreno. Si un mapa importado declara varios respawns por equipo, el editor conserva el primero de cada uno.

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
- **Rumbos independientes**: cada jugador empieza mirando al centro desde su base y solo cambia de rumbo al moverse.
- **Movimiento y cámara independientes**: el stick izquierdo mueve en cualquier ángulo relativo a la cámara; el derecho orbita 360°. La cámara mantiene una inclinación fija de 45°.
- **Velocidad propia por Pokémon**: cada compañero tiene su velocidad punta en `src/game/roster.ts` (Mewtwo 7,8 u/s, Raikou 7,7, Zapdos 7,6, Lugia 7,5, Greninja 7,4, Entei 7,2, Scyther 7,2, Celebi 7,1, Moltres 7,0, Mew 7,0, Suicune 7,0, Ho-Oh 6,9, Pikachu 6,9, Articuno 6,8, Lucario 6,5, Eevee 6,1, Charmander 5,4, Squirtle 4,8, Onix 4,6, Bulbasaur 4,2). La animación de andar escala con la velocidad real, así que el más rápido también mueve las patas más deprisa. El HUD de cada vista muestra la velocidad actual y el multiplicador del terreno, y la tarjeta de selección indica la velocidad base.
- **Velocidad modulada por el terreno**: cada terreno aplica un multiplicador según sus tipos frente a los del Pokémon (detalle más abajo). Combinado con la velocidad propia, el mismo Pokémon se mueve distinto en cada zona del mapa.
- **Niebla de guerra por jugador**: cada vista sombrea el mundo fuera de su radio de visión y oculta a los Pokémon que no se ven. Cada especie tiene un rango propio; el terreno bajo el objetivo aporta una ocultación base que sus tipos mejoran o empeoran, y los separadores (cordilleras y muros) y los árboles bloquean la línea de visión. El sombreado exterior es un quad con `ShaderMaterial` por cámara, dentro de PlayCanvas, y los separadores añaden un decal de sombra fijo en el mundo que oscurece lo que queda detrás; el HUD de cada vista resume el rango, la ocultación y el radio de detección.
- **Anclas de suelo por frame**: el píxel blanco de `*-Shadow.png` marca el centro del personaje a nivel del suelo. El importador lo extrae para cada frame y el motor desplaza el pivote, evitando que el sprite “flote” o tiemble al cambiar de animación. También guarda el píxel inferior visible de cada frame para que el terreno no recorte el arte que baja del ancla.
- **Anillo de rumbo**: cada jugador lleva un anillo pixel art en el suelo con una flecha que sigue su `facing` real, tintado con el color de su equipo. Es geometría plana, no un billboard: gira solo en Y y permanece por encima de la sombra de contacto.
- **Profundidad real**: los sprites escriben profundidad con `alphaTest`, reciben la niebla de la escena y tienen sombra de contacto; los props del mapa proyectan sombras direccionales.
- **Silueta de oclusión**: cuando un árbol (o cualquier obstáculo) tapa al Pokémon que manejas, aparece una silueta plana de color cálido a través de él, para que no pierdas de vista a tu personaje. Se resuelve por píxel: la silueta es la misma malla del sprite con la prueba de profundidad invertida (`depthFunc = FUNC_GREATER`), así que solo se pinta donde ya hay algo más cerca que el Pokémon. Donde el sprite se ve, la profundidad coincide y la silueta se descarta, de modo que nunca tapa al propio personaje; no hay raycasts ni comprobaciones por frame. En splitscreen solo la lleva la copia de tu propio avatar en tu vista; los demás jugadores no la proyectan. El **anillo de rumbo y su flecha** usan la misma técnica: una segunda pasada invertida los deja ver a través de los obstáculos, para que también conserves la referencia de orientación.
- **Pixel art configurable**: `CONFIG.sprite.filter` elige el muestreo. `'nearest'` deja los bloques duros; `'smooth'` precarga la hoja con NEAREST a `smoothScale` y luego filtra con LINEAR, de modo que el contorno se antialiasea 1-2 px sin emborronar el interior; `'linear'` interpola directamente sobre la hoja original (el más suave y borroso). `CONFIG.sprite.alphaToCoverage` delega el recorte alfa en las muestras del MSAA, y las UVs mantienen medio téxel de margen y compensación vertical (`1 / cos 45°`) para que los píxeles se vean cuadrados a pesar de la perspectiva.
- **Mapas definidos por JSON**: la arena es una rejilla de tipos de terreno cargada desde `public/maps/*.json`, con respawns y separadores declarados en el mismo archivo. La vegetación, el agua y los detalles se generan por código a partir de esa rejilla; no hay assets de escenario externos.
- **Vegetación con volumen**: la hierba alta, la hierba oscura de la ciénaga, el claro feérico y el páramo generan matas 3D con geometría y color por vértice (briznas, flores con tallo, hojas y pétalos, frailejones con tronco y roseta, y hierba seca pajiza), sin texturas ni recortes alfa. El desierto añade cactus 3D con tronco y brazos, la escarcha racimos de cristales de hielo con nieve, la colada volcánica placas de basalto con coronas de lava, brasas y columnas de humo, el bosque umbrío árboles secos, fuegos fatuos y niebla rastrera, y el claro feérico polen dorado flotante y mariposas revoloteando. El páramo añade rayos con luz azul y chispas crepitando entre la hierba seca.
- **Terrenos tipados**: la arena tiene quince terrenos asociados a tipos Pokémon, desde la jungla base hasta calveros de Fuego, Hielo, Fantasma o Desierto, pasando por el carril central asfaltado de tipo Normal. El HUD muestra el terreno bajo los pies y su tipo; las aguas profundas solo admiten Pokémon de tipo Agua.
- **Multijugador local real**: hasta ocho vistas simultáneas de la misma arena, cada una con su cámara, su jugador y sus copias de billboard. Dos equipos con base, anillo y nombre propios y un team deathmatch a 15 KO con reaparición.
- **Combate direccional**: habilidades en cono, proyectiles, haces, áreas y dashes que salen hacia el `facing` del Pokémon, con daño oficial de Pokémon, tipos, STAB, precisión, críticos, vida, enfriamientos y pantalla de victoria.
- **UI en español** con menú principal, pantalla de opciones, selector de equipos, selector de Pokémon por jugador, HUD de telemetría y combate por vista (terreno, tipo, velocidad, multiplicador, vida y habilidades), controles y créditos.

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
| Hierba alta | Bicho | dos manchas, una en cada jungla |

`terrainAt` consulta directamente la celda de la rejilla que contiene la posición. Las celdas se pintan con bloques de 4 px en la textura del suelo y cada terreno tiene una paleta propia; los calveros reciben encima el detalle procedural de su tipo. El lecho del agua también está pintado en el suelo, sin cilindros elevados; encima se coloca una lámina plana y translúcida.

Los calveros ya no se declaran a mano: al cargar el mapa, cada **grupo conexo de celdas** de un terreno decorativo se convierte en una región poligonal (`TERRAIN_ZONES`). Esa misma forma se usa para pintar el detalle, repartir la decoración 3D y colocar el agua de la ciénaga, así que el borde visible y el terreno jugable coinciden. El agua se agrupa por cuerpos (someras + profundas juntas) y se triangula para construir su malla.

Los **carriles** y la **carretera** son celdas de tipo `lane` y `road` en la rejilla: el carril de tierra se pinta con su paleta y la calzada con asfalto, grano y tono más oscuro. En el mapa por defecto el superior rodea la jungla noroeste, el inferior la sureste y el central cruza en diagonal de base a base. Todo carril es de tipo **Normal**, así que la velocidad cambia al pisar exactamente sus celdas.

La **colada volcánica** (`fire`, tipo Fuego) sustituye el antiguo calvero de brasas por un campo de basalto. El suelo se pinta con nueve placas oscuras de tonos azul-gris generadas con un Voronoi aproximado por bloques, separadas por surcos negros: el suelo no lleva naranja ni amarillo, solo roca fría. Encima hay **placas de basalto 3D**: cinco racimos por zona, cada uno con tres o cuatro bloques facetados de base irregular y corona inclinada. El color va por vértice: la base y los laterales caen a un gris azulado casi negro, mientras la cara superior y los vértices de la corona se encienden en naranja, amarillo y rojo, como lava solidificada. Son bajos y no colisionan. De las grietas suben **44 brasas aditivas** que se encienden, derivan y se apagan, y una luz omni naranja de corto alcance tiñe las rocas con un parpadeo lento. Además, **cada racimo de basalto emite su propia columna de humo**: cinco por calvero, con 24 bocanadas cada una que nacen del centro de la roca, suben en vertical, se ensanchan y se desvanecen, con un tono cálido en la base que pasa a gris. El tipo sigue siendo Fuego: Charmander corre por ella, Squirtle la resiste y Bulbasaur y Lucario se frenan.

La **ciénaga** (`poison`) conserva la hierba oscura pintada en el suelo, con briznas de 1–2 px entre el lodo, y añade encima una lámina de agua turbia recortada por el contorno de sus celdas, más opaca, más lenta y **mate**: sin brillo especular, para que se lea como agua estancada y no como un espejo. También genera matas 3D de hierba oscura, ahora **dispersas**: 11 briznas por mata, más bajas y repartidas con poca densidad para que la ciénaga parezca un lodazal y no un prado frondoso. Son casi negras en la base y verde apagado en la punta, sobresalen del agua y se mecen despacio. Del suelo sube además un **humo bajo y verdoso**: 65 bocanadas suaves que nacen a ras del agua, ascienden lentamente, se ensanchan y se desvanecen, con textura de jirones y opacidad baja. Se comporta como **aguas someras**: cualquier Pokémon puede cruzarla y el sprite se hunde hasta `submergeShallow`, con el anillo de rumbo flotando sobre la superficie. No tiene zona profunda ni collider, y el terreno sigue siendo de tipo Veneno para la velocidad.

El **desierto** (`desert`, tipo Tierra) es una mancha de arena en la jungla norte, pintada con bandas de dunas, rizos, grietas y piedras sueltas. Dentro del calvero crecen cuatro cactus 3D por zona: tronco y brazos de cilindros con un verde apagado, alturas y giros variados, sin collider (son puramente decorativos y no frenan el paso). Sobre la zona flota una capa de **polvo en suspensión**: 90 partículas suaves repartidas en una caja amplia que derivan con el viento, crecen y se desvanecen, con textura de manchas difusas para que se lean como polvo y no como chispas. El terreno es de tipo Tierra, así que frena a Pikachu, Charmander y Lucario, mientras Bulbasaur queda neutro porque su tipo Planta resiste Tierra pero su tipo Veneno la recibe.

La **escarcha** (`ice`, tipo Hielo) suma al suelo helado un efecto 3D propio. El calvero se llena de **racimos de cristales**: cada racimo es una malla de 5–7 esquirlas facetadas de 4–5 caras, con una base poligonal, una cintura estrechada y una punta inclinada hacia fuera. El color va por vértice, de azul profundo en la base a blanco casi puro en la punta, con el tono variando por faceta y un material de brillo alto para que el hielo destelle al girar la cámara. Se reparten de forma determinista por el calvero con cuatro variantes de malla, escala y giro aleatorios, y no colisionan. Encima cae **nieve fina**: 70 copos suaves con textura de cristal de cuatro brazos que descienden despacio, derivan con el viento y se desvanecen al final de su vida, con `preWarm` para que la nevada ya esté en el aire al cargar.

El **bosque umbrío** (`ghost`, tipo Fantasma) pasa de ser solo suelo pintado a tener volumen propio. En cada calvero se levantan **cinco árboles secos y retorcidos** con tres variantes de malla: raíces cortas, tronco en dos tramos inclinados y tres o cuatro ramas quebradas en dos segmentos, todo con prismas facetados y color por vértice, del casi negro de la base al gris violeta de las puntas. Son los únicos árboles del mapa que proyectan sombra real y tienen collider circular. Entre ellos flotan **18 fuegos fatuos** aditivos: orbes pequeños que nacen en una caja baja, derivan muy despacio y parpadean con una textura neutra teñida de violeta por el `colorGraph`. Una luz omni violeta de corto alcance respira con un pulso lento y tiñe troncos y suelo. Por último, una **niebla rastrera** de 130 partículas cubre el calvero con una capa continua: caja ancha y casi plana, vida larga, opacidad media-alta y deriva horizontal, para que se lea como un bosque húmedo y no como el humo vertical de la ciénaga. Los árboles se mecen muy poco y muy despacio en `world.update`.

Las **bases** son plataformas de piedra pintadas en el suelo con un anillo y cuatro losanges del color del equipo (azul o rojo). En el centro hay un nexo 3D: pedestal de dos tambores de piedra, cristal emisivo del color del equipo y una luz omni corta que tiñe la plataforma. El cristal y el pedestal son colliders circulares. Cada base es el punto de aparición de su equipo.

La **hierba alta**, la **hierba oscura de la ciénaga**, el **claro feérico** y el **páramo** son los calveros con volumen propio. La hierba alta, además de pintarse en el suelo con briznas de 2 px y punta clara, genera matas 3D hechas con geometría real. Cada mata es una malla de 18 briznas (dos tramos y punta, con curvatura y alturas variadas) coloreadas por vértice con verdes profundos, de tono oscuro en la base a más claro en la punta; no usa texturas ni recortes alfa, así que tiene volumen desde cualquier ángulo y se resuelve en una sola llamada de dibujo por mata. Las matas se colocan de forma determinista dentro de las regiones derivadas de las celdas `tallGrass` (`TERRAIN_ZONES`), con densidad alta para que el calvero se lea frondoso, no colisionan y se mecen con el viento en `world.update` inclinándose sobre su base con una fase ligada a la posición.

El **claro feérico** usa la misma técnica con flores en vez de briznas. Cada mata 3D es una malla de siete flores con tallo de dos cintas cruzadas, tres hojas a media altura y una corola de cinco o seis pétalos alrededor de un corazón amarillo. Los pétalos salen en rosa, lila, blanco, amarillo pálido y azul cielo, con una ligera variación de tono por pétalo, y todo el color va por vértice: sin texturas ni recortes, con volumen desde cualquier ángulo. Las matas se reparten de forma determinista por el calvero (tipo `fairy`) con densidad alta, no colisionan y se mecen con el viento algo más despacio que la hierba, porque el tallo es más rígido que una brizna. Sobre las flores flota **polen dorado**: 64 motas aditivas diminutas con un núcleo brillante y cuatro destellos que derivan despacio, titilan y se apagan, para que el calvero se lea como un lugar encantado y no como un prado cualquiera. Y entre el polen revolotean **ocho mariposas 3D**: un cuerpo fino y dos alas horizontales con color por vértice (más oscuras junto al cuerpo y casi blancas en la punta) que aletean rápido y vuelan hacia objetivos aleatorios dentro del calvero, eligiendo otro al llegar.

El **páramo** cambia las briznas verdes por frailejones y hierba seca. Cada mata de frailejón es uno o dos ejemplares de 0,3–0,64 u: un tronco leñoso oscuro de siete caras y tres bandas con sombreado plano y ligera inclinación, rematado por una roseta de hojas lanceoladas. La roseta lleva una corona exterior casi horizontal, otra interior más erguida, un brote central y un faldón de hojas secas hacia abajo; las hojas van de verde grisáceo en la base a blanco plateado en la punta, todo por color de vértice y sin texturas, así que la planta se lee como frailejón desde cualquier ángulo. Entre los frailejones crece hierba seca: matas de 14 briznas con la misma geometría y volumen que la hierba alta, pero más cortas y en tonos pajizos, de marrón oscuro en la base a ocre claro en la punta. Todo se reparte de forma determinista por el calvero (tipo `electric`), no colisiona y se mece con el viento: apenas los frailejones y algo más la hierba seca. Sobre el calvero descargan **rayos** a intervalos irregulares: una polilínea quebrada de 4,2 u de alto, con una rama lateral, cae sobre un punto aleatorio del páramo y parpadea durante medio segundo. El rayo se construye con malla y color por vértice —un núcleo blanco azulado en cintas cruzadas, sin halo—, así que tiene volumen desde cualquier giro de cámara y no usa texturas. En el impacto, una luz omni azul de corto alcance ilumina frailejones y hierba con el mismo parpadeo. Entre descarga y descarga, **34 chispas** aditivas por calvero asoman entre la hierba seca y se apagan enseguida, de modo que la zona nunca queda del todo quieta.

Las **aguas profundas** (`waterHigh`) bloquean el paso solo a los Pokémon que no sean de tipo Agua: el resto puede entrar en las someras y rodear el centro, pero no cruzar las celdas profundas. La colisión se resuelve empujando el círculo del jugador fuera de cada celda profunda. El HUD lo avisa cuando estás en aguas someras con un Pokémon no acuático. El HUD de telemetría muestra el nombre del terreno y una insignia con su tipo.

### Velocidad según el terreno

Cada terreno modula la velocidad del Pokémon que lo atraviesa. La relación se resuelve en `src/game/terrainSpeed.ts` con la tabla de tipos de Pokémon, usando el tipo del terreno como atacante:

| Relación | Multiplicador |
| --- | --- |
| Terreno propio (el Pokémon comparte el tipo del terreno) | ×1,18 |
| Terreno hostil (el tipo del terreno es súper eficaz contra el Pokémon) | ×0,82 |
| Terreno cómodo (lo resiste o es inmune a él) | ×1,08 |
| Neutro | ×1,00 |

Algunos ejemplos con el roster actual: Squirtle nada más rápido en aguas someras (×1,18) pero se frena en la jungla (×0,82); Pikachu sufre en la Arena y el Desierto porque el tipo Tierra es súper eficaz contra Eléctrico (×0,82) y va neutro por los carriles; Charmander corre por la Colada volcánica (×1,18) y se frena en las bases y el Desierto (×0,82); Bulbasaur agradece la Ciénaga y la jungla (×1,18); Eevee va más rápido por los carriles y la Carretera porque comparte el tipo Normal (×1,18) y nota una leve ventaja en el Bosque umbrío (×1,08); Lucario también agradece los carriles y el asfalto, ya que el Acero resiste el tipo Normal (×1,08), pero el Desierto le cuesta (×0,82). Greninja se mueve como pez en el agua (×1,18 en aguas someras y profundas), resiste la Colada volcánica y la Escarcha (×1,08) y el Bosque umbrío (×1,08 por su tipo Siniestro), pero la jungla y la hierba alta lo frenan (×0,82) y el Páramo eléctrico y el Claro feérico lo castigan (×0,82). Mewtwo y Mew, Psíquicos puros, se mueven neutros por casi toda la arena (×1,00); solo el Bosque umbrío y la hierba alta los frenan (×0,82, porque Fantasma y Bicho son súper eficaces contra Psíquico). Onix, de tipo Roca/Tierra, corre por la Arena, el Desierto y las bases (×1,18) y se atasca en el agua, la jungla y la Escarcha (×0,82). Scyther, Bicho/Volador, corre por la hierba alta (×1,18, comparte Bicho) y agradece la jungla, la Arena y el Desierto (×1,08), pero las bases, la Colada volcánica, la Escarcha y el Páramo lo frenan (×0,82). Los legendarios también tienen sus zonas: Articuno corre por la Escarcha (×1,18) y sufre en las bases, la Colada y el Páramo (×0,82); Zapdos domina el Páramo (×1,18) y va cómodo por la jungla, la hierba alta, la Arena y el Desierto (×1,08), pero las bases y la Escarcha lo frenan (×0,82); Moltres y Ho-Oh campan a sus anchas por la Colada (×1,18), agradecen la jungla, la hierba alta, la Arena y el Claro feérico (×1,08) y se atascan en el agua y las bases (×0,82); Lugia planea cómodo sobre la Arena y el Desierto (×1,08), pero el Bosque umbrío, la Escarcha, el Páramo y las bases lo castigan (×0,82); y Celebi florece en la jungla (×1,18), agradece la Arena, el agua y el Páramo (×1,08), y se frena en la hierba alta, la Colada, la Escarcha, la Ciénaga y el Bosque umbrío (×0,82). Las tres bestias legendarias tienen su propio circuito: Raikou domina el Páramo (×1,18) y sufre en la Arena y el Desierto (×0,82); Entei corre por la Colada (×1,18), agradece la jungla, la hierba alta, la Escarcha y el Claro feérico (×1,08) y se atasca en el agua, las bases, la Arena y el Desierto (×0,82); y Suicune nada a sus anchas por el agua (×1,18), resiste la Colada y la Escarcha (×1,08) y se frena en la jungla y el Páramo (×0,82). El HUD muestra el multiplicador activo junto al terreno, con una nota explicando el motivo, y la velocidad punta final combina la del Pokémon con la del terreno.

### Niebla de guerra y visión

Cada vista del splitscreen tiene su propia niebla. No es un estado global del mapa: es lo que ve el Pokémon de ese jugador. Dentro de su radio de visión el mundo se dibuja normal; fuera, un degradado oscurece el terreno y los Pokémon que no se ven se ocultan. La visibilidad de cada Pokémon es binaria (visible u oculto); el degradado es solo la lectura visual del borde, no una tercera transición de juego.

Los rangos base viven en `POKEMON_VISION` (`src/game/vision.ts`):

| Pokémon | Rango | Motivo |
| --- | --- | --- |
| Bulbasaur | 8,0 u | Bajo, pesado y con poca altura de ojos |
| Squirtle | 8,5 u | Vista corta pero constante |
| Onix | 8,8 u | Vive bajo tierra: poca luz y vista corta |
| Charmander | 9,5 u | La llama de la cola ilumina el entorno cercano |
| Eevee | 9,5 u | Olfato y oído finos |
| Lucario | 10,5 u | Percibe el aura |
| Scyther | 10,8 u | Ojos de depredador y reflejos de mantis |
| Pikachu | 11,0 u | El más alerta por sus sentidos eléctricos |
| Mew | 11,0 u | Sentidos psíquicos y curiosidad infinita |
| Entei | 11,4 u | Su fuego ilumina y atemoriza a distancia |
| Moltres | 11,5 u | La luz de sus llamas le abre el horizonte |
| Greninja | 11,5 u | Instinto de ninja, alcance notable |
| Articuno | 11,6 u | Ojo de ave rapaz sobre el hielo |
| Suicune | 11,6 u | Vigila y purifica las aguas a su paso |
| Celebi | 11,7 u | Siente el bosque y el tiempo a su alrededor |
| Zapdos | 11,8 u | Percibe la electricidad del aire a distancia |
| Ho-Oh | 11,9 u | Vista larga desde las alturas |
| Raikou | 11,9 u | Percibe las tormentas antes de que lleguen |
| Mewtwo | 12,0 u | Poder psíquico: percibe a distancia |
| Lugia | 12,4 u | Guardián de los mares: el que más lejos percibe |

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

Ejemplos con el roster actual: en la hierba alta (tipo Bicho) Bulbasaur y Squirtle conservan el 45% base (Bicho es neutro contra sus combinaciones de Planta/Veneno y Agua), Scyther sube al 67,5% (45% × 1,5 por compartir Bicho) y Charmander, Lucario y Moltres se quedan en el 51,75% (45% × 1,15 porque resisten Bicho). Pikachu pasa del 45% de la hierba alta al 7% del desierto, donde Ground lo delata. Greninja, Mewtwo y Mew se esconden mal en la hierba alta (22,5%, porque Bicho es súper eficaz contra Siniestro o Psíquico), pero Greninja en el Bosque umbrío sube al 46% (40% × 1,15 porque su tipo Siniestro resiste Fantasma). Lugia conserva el 45% base en la hierba alta (Bicho es súper eficaz contra Psíquico pero Volador lo resiste), pero en el Bosque umbrío baja al 20% (40% × 0,5, porque Fantasma es súper eficaz contra Psíquico).

La fórmula de visibilidad es:

```
visible = distancia ≤ rangoVisión × (1 − ocultación)  &&  línea de visión libre
```

La ocultación se evalúa en el terreno del **objetivo**, no en el del observador. El jugador siempre se ve a sí mismo. La **histéresis** de 0,2 u evita que un Pokémon parpadee justo en el borde del radio. La visión es **individual**: cada jugador ve solo con su Pokémon, así que un aliado que sale de su radio también se oculta.

La línea de visión la bloquean los **separadores** (cordilleras y muros) y los **árboles** (incluidos los árboles secos del bosque umbrío). Para ello, sus colliders llevan un `sightRadius` mayor que el radio de colisión de los árboles, de modo que la copa tapa aunque el tronco sea fino. Los cactus y los adornos de las bases no bloquean. El chequeo es una distancia segmento-segmento/círculo en `vision.ts`, sin raycasts contra mallas.

El HUD de cada vista muestra el rango base de la especie, la ocultación actual y el radio al que te detectaría un observador con tu mismo rango; el motivo y el desglose (base × multiplicador) aparecen en el `title` del bloque de visión. Además, el panel inferior de cada vista resume tu estado frente al otro equipo: **Oculto** si ningún rival vivo te ve y **Descubierto** (con el número de rivales que te ven) en cuanto alguno te detecta; se recalcula cada frame con la misma visibilidad que oculta las copias de los actores. Ese mismo panel reúne la identidad del jugador, la vida, la visión, el terreno y las cuatro habilidades, dejando el resto de la pantalla libre para el mundo 3D. El sombreado se resuelve en el motor: cada vista monta un quad pegado a su cámara, en su propia capa de render, con un `ShaderMaterial` que recibe por uniformes el centro y los radios del círculo de visión (`src/game/fog.ts`). Se dibuja al final de las transparencias y sin `depthTest`, así que cubre el mundo de esa vista pero no el HUD de React. No hay capa HTML de niebla.

Los **separadores** proyectan además una cuña de sombra como **decal en el suelo**. La máscara se dibuja en coordenadas XZ del mapa y el plano vive en la capa de esa vista; la cámara solo lo mira, no lo deforma. Se dibuja **sin test de profundidad** para que la cuña tiña también la vegetación y el resto de decoraciones que sobresalen del suelo, no solo la losa del terreno. El mundo escribe una **máscara de esténcil** (1 para terreno, decoraciones y props; 0 para los separadores) y el decal solo se dibuja donde vale 1: así la cara visible del propio separador nunca queda sombreada, aunque la cámara la alinee con la cuña. El shader del decal recibe también el óvalo de pantalla de la niebla circular y calcula el alfa necesario para que las dos capas se fundan exactamente por **máximo**: dentro del radio de visión la cuña oscurece el terreno, y al acercarse al borde la niebla la absorbe hasta que ambas valen lo mismo, de modo que no hay costura, ni hueco claro, ni borde sumado. Los árboles siguen bloqueando la línea de visión de los actores, pero de momento solo los separadores sombrean el terreno.

### Sumergirse en el agua

Cada cuerpo de agua combina el lecho pintado en el suelo con dos láminas planas y translúcidas a `waterHeight` (0,3 u por defecto), sin paredes ni grosor: una capa base y una capa de brillos que se desplazan en sentidos opuestos con sus UVs animadas, más un latido de opacidad en la capa de brillos para que la corriente se lea de un vistazo. La malla se construye triangulando el contorno de las celdas de agua y las UVs se escalan por el tamaño del cuerpo, así que el oleaje se lee igual en lagos grandes y pequeños. El desplazamiento de UVs se aplica con `diffuseMapOffset` seguido de `material.update()` en cada frame: sin esa llamada, PlayCanvas no sube las transformadas de textura al uniform buffer y el agua queda congelada. Al entrar en el agua, el sprite se hunde de forma progresiva (`submergeShallow` en aguas someras y `submergeDeep` en profundas): la parte del cuerpo que queda bajo la superficie la tapa la lámina, la sombra de contacto se oculta y el anillo de rumbo flota sobre el agua. La inmersión se mide como fracción de la altura de cada sprite, así que Pokémon altos y bajos se mojan de forma parecida. Al salir, el sprite emerge con la misma interpolación.

## Cómo funciona el pipeline de sprites

`scripts/import-sprites.mjs`:

1. Descarga `AnimData.xml`, `credits.txt`, `{Idle,Walk,Attack,Hurt}-Anim.png` y `{Idle,Walk,Attack,Hurt}-Shadow.png` desde el repositorio de PMD Sprite Collab. `Faint`, `QuickStrike`, `Shock`, `Shoot`, `Charge` y `Strike` se descargan también cuando la especie los incluye; si faltan, se omiten sin romper el importador.
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
  arena.json                 mapa por defecto en rejilla + respawns + separadores
  lago.json                  segundo mapa de ejemplo
src/game/
  config.ts                  escala de píxel, cámara, jugador, niebla y visión
  types.ts                   tipos del manifiesto y del estado del juego
  map.ts                     carga y validación de los mapas JSON
  mapEditor.ts               rejilla del editor, pintura, historial y serialización
  multiplayer.ts             equipos, spawns, reparto de viewports y tipos compartidos
  terrain.ts                 rejilla, consultas, regiones derivadas y agua
  textures.ts                texturas procedurales (suelo por celdas, calveros, agua, cielo, sombra, props)
  world.ts                   mundo, bases, nexo, árboles, luces y colisiones
  camera.ts                  rig orbital a 45° con viewport y capas por jugador
  input.ts                   1 teclado + mandos, snapshots por dispositivo y acciones de menú
  roster.ts                  velocidad punta de cada Pokémon
  pokedex.ts                 stats base y stats finales a nivel 50
  typeChart.ts               tabla de tipos completa y STAB
  abilities.ts               builder, catálogo de habilidades y movesets por Pokémon
  abilityExecutors.ts        estrategias de ejecución por forma de habilidad
  matchState.ts              estado mutable de jugadores, proyectiles, áreas y dash
  effects.ts                 composición de efectos al lanzar (buffs, curación)
  combat.ts                  fórmula de daño, decoradores, precisión y geometría
  combatFx.ts                fábricas de proyectiles, arcos, haces, áreas, dashes y auras
  damageNumbers.ts           texto de daño en PlayCanvas: textura, quad y fadeout
  terrainSpeed.ts            multiplicadores de velocidad por terreno y tipo
  vision.ts                  rangos de visión, ocultación, tipos y línea de visión
  fog.ts                     quad de visión, decal de sombra y shaders
  sprite.ts                  texturas, material, UVs, animación y billboard
  marker.ts                  anillo de jugador con flecha de rumbo y color de equipo
  actor.ts                   sprite + sombra de contacto + posición + capa de render
  game.ts                    orquestador: mapa, cámaras, actores, combate y colisiones
src/session/
  sessionContext.ts          contexto y contrato del estado compartido
  SessionProvider.tsx        manifiesto, mapas y jugadores que sobreviven a la ruta
  useSession.ts              hook de acceso al estado compartido
src/screens/
  HomeScreen.tsx             menú principal con Jugar, Editor y Opciones
  OptionsScreen.tsx          controles y créditos a pantalla completa
  EditorRoute.tsx            entrada a `/editor`
  LobbyRoute.tsx             entrada a `/lobby`, entrada de mandos y equipos
  RosterRoute.tsx            entrada a `/roster`, selección de Pokémon
  PlayScreen.tsx             entrada a `/play`, monta PlayCanvas y la partida
  SessionGate.tsx            espera de manifiesto/mapas antes de una pantalla
src/ui/
  PokemonPortrait.tsx        retrato normal para las interfaces HTML
  Brand.tsx                  logotipo compartido (versión normal y compacta)
  KeyPill.tsx                tecla/botón de los textos de ayuda
  BootScreen.tsx             pantallas de carga y error compartidas
  InfoPanels.tsx             contenido de controles y créditos
  InfoDialog.tsx             modal de controles/créditos durante la pausa
  LobbyScreen.tsx            sala de equipos y detección de mandos
  MapEditorScreen.tsx        editor de mapas: dimensiones, dibujo y exportación
  RosterScreen.tsx           selección simultánea de Pokémon
  MatchHud.tsx               etiquetas, telemetría y bordes del splitscreen
  TypeBadge.tsx              insignia de tipo
  typeInfo.ts                colores y etiquetas de tipos
  buttonStyles.ts            variantes y tamaños de los botones en Tailwind
  styles.ts                  clases compartidas (eyebrow, pasos del asistente)
  rosterGrid.ts              columnas de la rejilla según el viewport
  useMenuInput.ts            teclado/mandos para pantallas HTML sin PlayCanvas
  useReturnPath.ts           vuelta a la pantalla de origen de `/opciones` y `/editor`
src/App.tsx                  rutas de wouter y composición de pantallas
src/index.css                Tailwind: tokens del tema y estilos base
```

## Ajustes rápidos

Casi todo lo “mágico” está en `src/game/config.ts`:

- `PIXEL_SCALE` (0.045): unidades de mundo por píxel de sprite. Es común a todo el roster para conservar tamaños relativos.
- `CONFIG.sprite.filter` (`'nearest'` | `'smooth'` | `'linear'`), `CONFIG.sprite.smoothScale` y `CONFIG.sprite.alphaToCoverage`: suavizado del sprite. `'smooth'` es el equilibrio entre nitidez y borde suave; `smoothScale` (2-4) controla cuánto se afila (`4` = casi nítido, `3` = equilibrado, `2` = más suave).
- `PITCH_DEG` (45) y `VERTICAL_STRETCH`: inclinación y corrección de píxeles.
- `camera.distance`, `fov`, `followLerp`: encuadre y suavidad. En partidas de 3-8 jugadores cada cámara arranca un 12 % más lejos para compensar el viewport estrecho.
- `player.speed`, `acceleration`, `deceleration`, `turnRate`, `turnLerp`, `radius`: sensación de movimiento y colisión. `turnRate` (rad/s) controla con cuánta rapidez el rumbo de avance gira hacia la entrada; subirlo elimina el derrape al cambiar de dirección. `turnSnapAngle` (grados) marca a partir de qué giro (por defecto 135°) la velocidad se invierte en seco, para que un cambio a la dirección opuesta no trace un arco lateral. La velocidad final de cada Pokémon sale de `src/game/roster.ts`; `player.speed` queda como respaldo. Los multiplicadores por terreno están en `TERRAIN_SPEED_FACTOR` (`src/game/terrainSpeed.ts`).
- `CONFIG.combat`: KO necesarios para ganar (15), segundos de reaparición (5), invulnerabilidad (2), hitstun (0,15 s), stun/empuje del choque melee (0,25 s / 1 u), probabilidad y multiplicador de crítico y rango del factor aleatorio de daño.
- `POKEDEX_STATS` y `COMBAT_LEVEL` en `src/game/pokedex.ts`: stats base reales de cada especie y nivel de combate. `ABILITIES` y `MOVESETS` en `src/game/abilities.ts` deciden qué habilidades existen y quién las tiene.
- `POKEMON_VISION`, `TERRAIN_CONCEALMENT` y `CONCEALMENT_TYPE_FACTOR` en `src/game/vision.ts`: rango base por especie, ocultación de cada terreno y cuánto la modulan los tipos. La fórmula y la oclusión están en el mismo módulo.
- `CONFIG.vision` (`src/game/config.ts`): histéresis de visibilidad, tope de ocultación, opacidad, color y suavizado del borde del sombreado. El `sightRadius` de árboles y separadores se define al crear sus colliders en `src/game/world.ts`.
- `MASK_SIZE`, `SHADOW_LENGTH` e `INSIDE_EDGE_EXTENSION` en `src/game/fog.ts`: resolución de la máscara del decal de sombra, alcance de cada cuña y extensión del caso pegado a la cresta. Proyectan todos los tramos de separador que caen dentro del radio de visión. `MOUNTAIN_SHADOW_RADIUS` en `src/game/game.ts` controla el ancho de las cuñas respecto al radio de colisión del tramo.
- `player.markerDiameter`, `markerHeight` y `markerOpacity`: tamaño del anillo de rumbo, su altura sobre el suelo y su transparencia.
- `player.submergeShallow`, `submergeDeep` y `submergeLerp`: fracción de la altura del sprite que se sumerge en cada tipo de agua y con qué suavidad lo hace.
- `public/maps/*.json`: rejilla de terrenos, `tileSize`, `waterHeight`, respawns de cada equipo, separadores y punto de cámara del menú. `public/maps/index.json` decide qué mapas aparecen en el selector. `TERRAINS` en `src/game/terrain.ts` mantiene los nombres y tipos Pokémon de cada `TerrainId`.
- `MAX_PLAYERS`, `MAX_TEAM_SIZE`, `TEAM_INFO`, `spawnForTeam` y `computeSplitLayout` en `src/game/multiplayer.ts`: límite de jugadores, tope por equipo, colores/coordenadas de base y rejilla del splitscreen.

Los colores de acento, tipos y créditos vienen del manifiesto.

## Limitaciones conocidas

- El catálogo de habilidades arranca vacío: cada habilidad se define en `src/game/abilities.ts` y se asigna por Pokémon en `MOVESETS`. No hay captura, objetos ni estados alterados.
- El multijugador local es un **team deathmatch a 15 KO**; no hay súbditos, torretas ni otros objetivos MOBA.
- No hay bots: para que haya combate hace falta al menos un jugador en cada equipo.
- La selección de Pokémon permite repetir especie aunque hay 20 especies para hasta 8 jugadores.
- La niebla exterior es un círculo de pantalla por vista; los separadores añaden un decal de sombra fijo en el mundo. No es un polígono de visibilidad exacto y los árboles ocultan actores, pero de momento no sombrean el terreno.
- No hay audio, guardado ni soporte táctil específico (la demo está pensada para escritorio con mandos o teclado).
- La arena es una demostración visual de estilo MOBA: no hay oleadas de súbditos, torretas ni objetivos.
- En splitscreen, el mundo se dibuja una vez por vista. Con 7-8 jugadores el rendimiento baja de forma notable, sobre todo en equipos modestos.
- El editor de mapas edita celdas, bases, separadores y metadatos; el `spawn` de cámara sigue siendo manual en el JSON.

## Créditos y licencia

Los sprites pertenecen a la comunidad de **[PMD Sprite Collab](https://sprites.pmdcollab.org/)** y se distribuyen bajo **[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)**. Esta demo es **no comercial** y muestra la atribución en la interfaz y en `public/sprites/CREDITS.md`.

Cada Pokémon conserva su `credits.txt` original en `public/sprites/<id>/`. El código del proyecto es una demo técnica y no reclama propiedad sobre esos sprites.
