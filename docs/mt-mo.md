# MT y MO · catálogo de movimientos para NewPoke

Este documento propone el catálogo completo de **Máquinas Técnicas (MT)** y
**Movimientos Ocultos (MO)** adaptado al combate de NewPoke. No es una lista de
lore: cada ficha define forma, potencia, enfriamiento, alcance, estado y VFX para
que se pueda implementar directamente con el builder de `abilities.ts`.

> **Se escribe desde cero.** Aunque varios de estos nombres ya existan en
> `ABILITIES` o en los sets actuales, aquí se tratan como si no existieran: cada
> ficha propone valores y efectos nuevos. Si una MT coincide con una habilidad ya
> implementada, al integrarla manda esta ficha y se sustituye la definición
> anterior.

## Cómo leer este documento

- **Base**: las 92 MT y las 8 MO de la cuarta generación, el set clásico más
  completo y el último con ocho MO. Es el catálogo de referencia y está detallado
  ficha a ficha.
- **Anexo A**: MT exclusivas de las generaciones V a IX que no existen en el set
  base, en formato compacto, con una selección de las familias nuevas de Gen IX.
- **Anexo B**: MT retiradas de las generaciones I a III que tampoco están en el
  set base.
- **Implementación**: modelo de datos, estados nuevos, campos, trampas, pantallas
  y los enganches que necesita el motor.
- **Hoja de ruta**: en qué orden conviene implementarlo para no romper el
  equilibrio actual.

Abreviaturas de las tablas:

| Abreviatura | Significado |
| --- | --- |
| `B` | Básica: ataque de spam, enfriamiento bajo |
| `1` | Habilidad 1: herramienta principal del set |
| `2` | Habilidad 2: control, cobertura o sostén |
| `3` | Habilidad 3: definitiva o herramienta de equipo |
| `Melee` | Cono cuerpo a cuerpo en la dirección en la que mira el Pokémon |
| `Proyectil` | Proyectil que avanza en la dirección en la que mira |
| `Haz` | Haz instantáneo que se detiene en el primer obstáculo |
| `Área` | Área circular o cono sobre el suelo |
| `Dash` | Desplazamiento con o sin daño al paso |
| `Self` | Habilidad centrada en el lanzador |
| `PV/s` | Daño por segundo |
| `u` | Unidades de mundo (1 u ≈ un Pokémon mediano) |

---

## 1. El sistema de MT y MO

### 1.1. Loadout

La propuesta es que las MT entren por el **roster**, no por el mapa:

- Cada Pokémon conserva su **básica** y dos de sus habilidades nativas.
- Un solo hueco (la habilidad 2 o la 3) se puede sustituir por **una MT**.
- La MT debe ser compatible con la especie (ver 1.2).
- Las **MO** no ocupan un hueco de habilidad: sustituyen el **instinto común**
  (`I` / `RT`). Así se conserva el botón, el HUD y el bloqueo global de casteo.
- Máximo **una MO por Pokémon** y **ninguna MO repetida dentro del mismo
  equipo**. Si dos jugadores quieren Vuelo, solo uno puede llevarlo: las MO son
  roles de equipo.

Esto mantiene la identidad de cada especie (nadie pierde su básica ni su
definitiva) y evita que las MT homogenicen el roster.

### 1.2. Compatibilidad

Una MT es equipable si se cumple **una** de estas condiciones:

1. El movimiento comparte tipo con el Pokémon.
2. El movimiento es de tipo Normal.
3. El Pokémon tiene ese movimiento en su learnset canónico.
4. La MT está marcada como **universal** (solo las de utilidad pura: Descanso,
   Protección, Sustituto, Aguante, Reciclaje, Sonámbulo).

Las MO son universales, pero cada una tiene un requisito de mapa: no se pueden
equipar en mapas sin agua, sin árboles o sin montañas. El editor marca qué
rasgos tiene cada mapa y el roster filtra la lista.

### 1.3. MT frente a MO

| | MT | MO |
| --- | --- | --- |
| Qué aporta | Una habilidad de combate | Una acción de mapa y una herramienta de combate |
| Dónde se equipa | Hueco 2 o 3 | Instinto común |
| Cuántas por Pokémon | 1 | 1 |
| Límite por equipo | Sin límite | Una de cada |
| Se ve en el HUD | Sí, como habilidad | Sí, como instinto |
| Coste de diseño | Cobertura y daño | Movilidad, visión y control del mapa |

### 1.4. Modo alternativo: MT como objeto

Para una variante más caótica, una MT puede aparecer como **objeto recogible**
(ver `docs/items.md`): al recogerla, el equipo entero puede usar ese movimiento
durante 30 s en el hueco 3. Las MO no entran en este modo. Es una idea para un
modo de fiesta, no para el modo principal: premiaría demasiado al equipo que ya
controla la zona.

---

## 2. Reglas de conversión

### 2.1. Formas y rangos

| Forma | Uso | Alcance típico | Notas |
| --- | --- | --- | --- |
| Melee | Básicas y golpes de compromiso | 1,8–2,8 u, 40–70° | Bloquea movimiento durante `startup` y ventana activa |
| Proyectil | Presión a media distancia | 7–10 u, 14–20 u/s | Impacta por el primer evento del tramo |
| Haz | Castigo en línea | 8–12 u | Se corta en muro, roca, árbol o separador |
| Área | Zona, control y definitivas | 2,4–4,2 u de radio; centro a 0–6,5 u | Puede ser instantánea o persistente |
| Dash | Entrada, salida y persecución | 3,5–7 u | Comprueba colisión por tramos |
| Self | Buffs, escudos, curas | — | Se resuelve sobre el lanzador |

### 2.2. Potencia y enfriamiento

| Ranura | Potencia | Enfriamiento | Ejemplos |
| --- | --- | --- | --- |
| B | 40–80 | 0,3–1,0 s | Garra Dragón, Poder Oculto |
| 1 | 50–90 | 3–6 s | Rayo Hielo, Bola Sombra |
| 2 | 60–110 | 6–11 s | Lanzallamas, Trampa Rocas |
| 3 | 110–150 | 12–18 s | Hiperrayo, Ventisca |

Reglas duras:

- Ningún movimiento de daño fijo o porcentual quita más del 35 % de la vida
  máxima de un objetivo salvo que tenga una telegrafía de 0,8 s o un coste de
  autodaño.
- Ningún golpe de este catálogo puede llevar a un rival del 100 % al 0 % de
  vida. Falsotortazo va un paso más allá: **no puede matar nunca** y deja un
  mínimo de 1 PV.
- Los estados duros (sueño, congelación, parálisis) no se acumulan: refrescan
  duración. La inmunidad posterior a la congelación es de 3 s.

### 2.3. Estados propuestos

El motor actual solo tiene ralentizaciones, buffs, escudos y curas. Las MT
necesitan un módulo de estados (`status.ts`) con estas reglas:

| Estado | Duración | Efecto | Se rompe o limpia |
| --- | --- | --- | --- |
| Quemadura | 6 s | 6 PV/s y −15 % ataque físico | Caduca al terminar; se limpia al morir. Salvaguarda impide aplicarla |
| Veneno | 8 s | 5 PV/s | Igual que la quemadura |
| Veneno grave | 8 s | 4 / 7 / 10 / 13 PV/s cada 2 s | Igual que el veneno |
| Parálisis | 4 s | ×0,55 velocidad y 20 % de fallo al iniciar una habilidad | No consume el enfriamiento si falla |
| Congelación | 1,5 s | Inmoviliza; se rompe al recibir daño | Inmunidad de 3 s tras romperse |
| Sueño | 2,5 s | Inmoviliza; se rompe al recibir daño | Descanso lo aplica a sí mismo |
| Confusión | 3 s | Las habilidades salen con ±25° de desvío y 15 % de autogolpe de 40 | Caduca al terminar o al morir; Salvaguarda impide aplicarla |
| Provocación | 4 s | No puede usar estados, curas, escudos ni MO | Solo afecta a habilidades de estado |
| Fascinación | 3 s | No puede dañar al lanzador y va un 20 % más lento | Se rompe si el lanzador le golpea |
| Miedo | 1,2 s | Huye sin atacar; corta casteos | Inmune si ya sufrió miedo en los últimos 8 s |
| Atrapado | 2 s | No puede alejarse más de 3 u del punto de anclaje | Se rompe con dash o al morir |
| Interrupción | 0,35 s | Corta el casteo y bloquea el ataque | No afecta a instintos |

Interacciones que hay que respetar:

- **Salvaguarda** impide aplicar estados nuevos, pero no limpia los existentes.
- **Descanso** se aplica sueño a sí mismo; **Sonámbulo** solo se puede usar
  mientras se duerme; **Come Sueños** y **Pesadilla** solo castigan a dormidos.
- **Imagen** dobla potencia con cualquier estado negativo; **Hex** dobla contra
  cualquier estado; **Aliento Gélido** siempre critica.
- Los estados no afectan a la invulnerabilidad de spawn ni al escudo de
  Protección; sí afectan a la velocidad y al casteo.

### 2.4. Campos, pantallas y trampas

Además de los estados, el catálogo usa tres familias de efectos de zona:

- **Campos** (`fields.ts`): sol, lluvia, arena, granizo y los cuatro terrenos.
  Son zonas de 8–10 s que modifican el tipo, la velocidad, la visión o el daño.
  Se consultan desde `terrainSpeed.ts` y `vision.ts` como una capa extra sobre
  el terreno real, sin tocar el mapa.
- **Pantallas**: Pantalla Luz, Reflejo y Velo Aurora. Son auras que siguen al
  lanzador 6 s y reducen un 30 % (o un 25 % las dos categorías) el daño de los
  aliados dentro. No se acumulan: se aplica la reducción más fuerte.
- **Trampas**: Trampa Rocas. Es una zona persistente 20 s que solo daña al
  equipo rival al entrar. Se revela con la niebla y se limpia con Despejar o
  Demolición.

### 2.5. Criterios de diseño

1. **Toda MT tiene contrajuego.** Las de 100+ de potencia se telegrafían al
   menos 0,35 s y tienen un lateral claro (casteo, recarga, autodaño o
   inmovilidad).
2. **El estado no sustituye al daño.** Una MT de estado puro debe aportar algo
   que el equipo note: visión, trampa, pantalla, robo de buff o movilidad.
3. **La niebla manda.** Las MT de área se dibujan antes de golpear, pero un
   rival oculto por niebla no ve la telegrafía. Es una ventaja legítima de la
   información, no un bug.
4. **Nada de duplicar el instinto.** Protección (MT) y Protección (instinto)
   comparten nombre, así que no pueden convivir en el mismo Pokémon: el roster
   lo impide.
5. **Las MO cambian el mapa, no solo el combate.** Cada MO debe abrir o cerrar
   una ruta real del mapa. Si no cambia una decisión de rotación, no es una MO.

---

## 3. MT · catálogo completo (92)

### MT01–MT25

| MT | Movimiento | Tipo | Cat. | Forma (uso) | Pot. | CD | Alcance | Efecto en NewPoke |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | Puño Certero | Lucha | Físico | Melee (3) | 150 | 12 s | 2,6 u · 55° | Puñetazo cargado 1,1 s. Si recibes daño antes de soltarlo se cancela y el CD baja a 3 s. Al impactar: empuje 2 u y rompe escudos. |
| 02 | Garra Dragón | Dragón | Físico | Melee (1) | 80 | 4 s | 2,2 u · 50° | Dos zarpazos; el segundo aplica −20 % defensa 3 s. Estrena `impactStyle: 'dragon'`. |
| 03 | Pulso Agua | Agua | Especial | Proyectil (1) | 60 | 4 s | 8 u | Burbuja que ralentiza 25 % durante 2 s; 20 % de confusión 2 s. |
| 04 | Meditación | Psíquico | Estado | Self (2) | — | 10 s | — | Canaliza 0,5 s: +25 % ataque especial y defensa especial 6 s. Se cancela si te golpean. |
| 05 | Rugido | Normal | Estado | Área cono (2) | — | 10 s | 3,5 u · 45° | Miedo 1,2 s: los rivales huyen sin atacar. Empuje 1,5 u y corta casteos. |
| 06 | Tóxico | Veneno | Estado | Proyectil (2) | — | 9 s | 8,5 u | Veneno grave 8 s: 4, 7, 10 y 13 PV/s cada 2 s. |
| 07 | Granizo | Hielo | Estado | Área (3) | — | 14 s | 4,5 u de radio a 4 u | Zona 10 s: 3 PV/s a los que no son Hielo, Hielo +10 % velocidad y el resto −10 %. Convierte el suelo en hielo. |
| 08 | Corpulencia | Lucha | Estado | Self (2) | — | 10 s | — | +25 % ataque y defensa 6 s. Permite moverse durante los 0,35 s de casteo. |
| 09 | Semilladora | Planta | Físico | Proyectil (1) | 25×3 | 3,5 s | 7,5 u | Tres semillas en abanico de 12°; cada una golpea por separado. |
| 10 | Poder Oculto | Normal | Especial | Proyectil (1) | 60 | 4 s | 8,5 u | Adopta el tipo secundario del usuario (o el primario si es mono-tipo), con su VFX y STAB garantizado. |
| 11 | Día Soleado | Fuego | Estado | Área (3) | — | 14 s | 4,5 u de radio a 4 u | Zona 10 s: +20 % Fuego, −20 % Agua, la quemadura pega un 50 % más y la ocultación baja 0,1 por brillo. |
| 12 | Mofa | Siniestro | Estado | Proyectil (2) | — | 10 s | 8 u | Provocación 4 s: el rival no puede usar estados, curas, escudos ni MOs. |
| 13 | Rayo Hielo | Hielo | Especial | Haz (2) | 90 | 7 s | 9,5 u | Haz instantáneo; 15 % de congelación 1,5 s. `beamStyle: 'ice'`. |
| 14 | Ventisca | Hielo | Especial | Área (3) | 110 | 14 s | 3,6 u de radio a 3 u | Ventisca circular; 20 % de congelación y −35 % velocidad 2 s. Telegrafía 0,5 s. |
| 15 | Hiperrayo | Normal | Especial | Haz (3) | 150 | 16 s | 11 u | Atraviesa a todos los rivales en línea. Tras disparar quedas 1,2 s sin moverte ni atacar. |
| 16 | Pantalla Luz | Psíquico | Estado | Self aura (2) | — | 14 s | 4 u | 6 s: los aliados dentro reciben −30 % daño especial. El aura te sigue. |
| 17 | Protección | Normal | Estado | Self (3) | — | 12 s | — | Bloqueo perfecto 0,8 s: inmune a todo, pero no puedes moverte ni atacar. No convive con el instinto Protección. |
| 18 | Danza Lluvia | Agua | Estado | Área (3) | — | 14 s | 4,5 u de radio a 4 u | Zona 10 s: +20 % Agua, −20 % Fuego, Trueno cae al instante y la quemadura pega la mitad. |
| 19 | Gigadrenado | Planta | Especial | Haz (2) | 60 | 6 s | 8 u | Drena vida: cura el 50 % del daño hecho, con un máximo de 60 PV. `beamStyle: 'grass'`. |
| 20 | Salvaguarda | Normal | Estado | Self aura (2) | — | 12 s | 3 u | 6 s: inmunidad a estados nuevos para ti y los aliados del radio. No limpia los ya activos. |
| 21 | Frustración | Normal | Físico | Melee (1) | 40–102 | 4 s | 2 u · 50° | Potencia = 40 + 62 × (1 − vida restante). Cuanto más débil estás, más pega. |
| 22 | Rayo Solar | Planta | Especial | Haz (3) | 120 | 11 s | 9,5 u | Carga 0,65 s; bajo sol se dispara al instante. Atraviesa rivales. `beamStyle: 'grass'`. |
| 23 | Cola Férrea | Acero | Físico | Melee (1) | 100 | 6 s | 2,4 u · 70° | Golpe amplio que aplica −20 % defensa 4 s. Preparación 0,3 s para que se lea. |
| 24 | Rayo | Eléctrico | Especial | Proyectil (1) | 85 | 5 s | 9 u | Cadena: salta a 2 rivales a 3 u del impacto con el 50 % del daño. 15 % de parálisis. |
| 25 | Trueno | Eléctrico | Especial | Área (3) | 120 | 13 s | 3,2 u de radio a 6 u | Marca el punto y cae tras 0,6 s; 30 % de parálisis. Bajo lluvia cae al instante y el radio sube a 3,8 u. |

### MT26–MT50

| MT | Movimiento | Tipo | Cat. | Forma (uso) | Pot. | CD | Alcance | Efecto en NewPoke |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 26 | Terremoto | Tierra | Físico | Área self (3) | 110 | 12 s | 3,6 u | Sacudida instantánea alrededor; −25 % velocidad 1,5 s. Los voladores son inmunes por tabla de tipos. |
| 27 | Retribución | Normal | Físico | Dash (1) | 50–102 | 5 s | 4,5 u | Potencia = 40 + 62 × vida restante. Entra o sale golpeando; al 100 % de vida pega 102. |
| 28 | Excavar | Tierra | Físico | Dash (2) | 80 | 8 s | 5 u | Te sumerges 0,5 s (no te pueden targetear) y emerges con un área de 2 u y empuje 1 u. `aoeStyle: 'burrow'`. |
| 29 | Psíquico | Psíquico | Especial | Haz (2) | 90 | 7 s | 9,5 u | Haz mental; −20 % defensa especial 4 s y levanta ligeramente al objetivo. |
| 30 | Bola Sombra | Fantasma | Especial | Proyectil (1) | 80 | 5 s | 9 u | Orbe fantasma; 20 % de −20 % defensa especial 4 s. `projectileStyle: 'ghost'`. |
| 31 | Demolición | Lucha | Físico | Melee (1) | 75 | 5 s | 2,2 u · 55° | Rompe pantallas, escudos y sustitutos del cono; +50 % contra objetivos protegidos. |
| 32 | Doble Equipo | Normal | Estado | Self (3) | — | 14 s | — | Crea 3 señuelos 5 s que copian tus movimientos. Los proyectiles pueden golpearlos; cada señuelo absorbe un golpe antes de desaparecer. |
| 33 | Reflejo | Psíquico | Estado | Self aura (2) | — | 14 s | 4 u | 6 s: −30 % daño físico a los aliados del aura. Se cancela con Demolición. |
| 34 | Onda Choque | Eléctrico | Especial | Proyectil (1) | 60 | 3,5 s | 8 u | Proyectil teledirigido que persigue al objetivo 1,5 s; solo se evita con obstáculo, dash o escudo. |
| 35 | Lanzallamas | Fuego | Especial | Haz (2) | 90 | 5,5 s | 9 u | Chorro de fuego; 10 % de quemadura 6 s. `beamStyle: 'fire'`. |
| 36 | Bomba Lodo | Veneno | Especial | Proyectil (1) | 90 | 5,5 s | 8,5 u | 30 % de veneno; al impactar deja un charco de 1,5 u durante 3 s con 10 PV/s. |
| 37 | Tormenta Arena | Roca | Estado | Área (3) | — | 14 s | 4,5 u de radio a 4 u | Zona 10 s: 4 PV/s a los que no son Roca, Tierra o Acero, −20 % visión y +0,2 ocultación dentro. |
| 38 | Llamarada | Fuego | Especial | Proyectil (3) | 110 | 12 s | 9 u | Proyectil lento que estalla en 2 u al impactar o chocar; 20 % de quemadura. |
| 39 | Tumba Rocas | Roca | Físico | Proyectil (1) | 60 | 4,5 s | 8 u | −30 % velocidad 3 s y deja una roca de 1 u que bloquea movimiento y proyectiles 8 s. |
| 40 | Aéreo | Volador | Físico | Dash (1) | 60 | 3,5 s | 5 u | Tajo aéreo que no puede fallar y salta obstáculos bajos; golpea una vez al paso. |
| 41 | Tormento | Siniestro | Estado | Proyectil (2) | — | 10 s | 8 u | 4 s: el rival no puede repetir la última habilidad usada; si lo intenta, el casteo falla y el CD se consume. |
| 42 | Imagen | Normal | Físico | Melee (1) | 70 (140) | 4 s | 2,2 u · 50° | Potencia ×2 si estás quemado, envenenado o paralizado. No limpia el estado. |
| 43 | Poder Secreto | Normal | Físico | Melee (1) | 70 | 4 s | 2,2 u · 50° | Efecto secundario según el terreno del objetivo: jungla y ciénaga ralentizan, arena ciega, agua empuja, fuego quema, eléctrico paraliza, hielo congela, fantasmal asusta y feérico baja el ataque especial. |
| 44 | Descanso | Psíquico | Estado | Self (3) | — | 18 s | — | Duermes 2 s y recuperas el 60 % de la vida máxima. El sueño se puede romper con daño. |
| 45 | Atracción | Normal | Estado | Proyectil (2) | — | 14 s | 7 u | Fascinación 3 s: el objetivo no puede dañarte y se mueve un 20 % más lento; se rompe si le golpeas. |
| 46 | Ladrón | Siniestro | Físico | Melee (1) | 45 | 6 s | 2 u · 50° | Roba un buff, escudo o velocidad positiva del rival y te lo aplicas. |
| 47 | Ala de Acero | Acero | Físico | Melee (1) | 70 | 5 s | 2,2 u · 55° | +20 % defensa 3 s. `impactStyle: 'steel'`. |
| 48 | Cambia Almas | Psíquico | Estado | Proyectil (3) | — | 16 s | 7 u | Intercambia tu instinto común con el del rival durante 8 s; después vuelven. Si alguno lleva MO, el intercambio falla y el CD queda en 4 s. |
| 49 | Arrebato | Siniestro | Estado | Self (2) | — | 12 s | 4 u | Ventana de 2,5 s: roba el siguiente buff, cura o escudo que lance un rival dentro del radio. |
| 50 | Sofoco | Fuego | Especial | Área cono (3) | 140 | 12 s | 4 u · 50° | Explosión de calor en cono; −25 % ataque especial 6 s. Telegrafía 0,45 s. |

### MT51–MT75

| MT | Movimiento | Tipo | Cat. | Forma (uso) | Pot. | CD | Alcance | Efecto en NewPoke |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 51 | Respiro | Volador | Estado | Self (2) | — | 12 s | — | Recupera 35 % de la vida máxima durante 2 s y pierdes el tipo Volador mientras dure: el suelo te golpea. |
| 52 | Onda Certera | Lucha | Especial | Proyectil (3) | 120 | 10 s | 9 u | Orbe lento con 0,35 s de carga; 20 % de −20 % defensa especial. Se puede esquivar. |
| 53 | Bola Energía | Planta | Especial | Proyectil (1) | 90 | 5,5 s | 9 u | 20 % de −20 % defensa especial 4 s. `projectileStyle: 'grass'`. |
| 54 | Falsotortazo | Normal | Físico | Melee (1) | 40 | 3 s | 2 u · 45° | No puede matar: deja al rival a 1 PV como mínimo. Lo marca 3 s y recibe +20 % de daño. |
| 55 | Salmuera | Agua | Especial | Proyectil (1) | 65 (130) | 4 s | 8,5 u | Dobla la potencia contra objetivos por debajo del 50 % de vida. |
| 56 | Lanzamiento | Siniestro | Físico | Proyectil (2) | 60 | 8 s | 7 u | Lanza el objeto que lleves: daña y aplica su efecto al impactar. Sin objeto, lanza una piedra de 40. |
| 57 | Rayo Carga | Eléctrico | Especial | Proyectil (1) | 50 | 3 s | 8 u | 70 % de +15 % ataque especial 5 s, con un máximo de 2 acumulaciones. |
| 58 | Aguante | Normal | Estado | Self (3) | — | 15 s | — | 1,5 s: sobrevives a cualquier golpe con 1 PV, pero no puedes moverte ni atacar. |
| 59 | Pulso Dragón | Dragón | Especial | Haz (2) | 90 | 6 s | 9,5 u | Haz de dragón con 0,3 s de carga. Estrena `beamStyle: 'dragon'`. |
| 60 | Puño Drenaje | Lucha | Físico | Melee (1) | 60 | 5 s | 2 u · 50° | Cura el 50 % del daño infligido, con un máximo de 50 PV. |
| 61 | Fuego Fatuo | Fuego | Estado | Proyectil (2) | — | 9 s | 8 u | Quemadura 6 s: 6 PV/s y −15 % ataque físico. |
| 62 | Viento Plata | Bicho | Especial | Área cono (2) | 60 | 6 s | 3,2 u · 55° | 10 % de +10 % a todas las stats 5 s, acumulable 3 veces. Estrena `aoeStyle: 'bug'`. |
| 63 | Embargo | Siniestro | Estado | Proyectil (2) | — | 10 s | 8 u | 5 s: el rival no puede recoger objetos y pierde los buffs de objeto activos. |
| 64 | Explosión | Normal | Físico | Área self (3) | 175 | 18 s | 4,2 u | Deflagración normal de 175 con 35 % de autodaño; nunca te deja por debajo de 1 PV. `aoeStyle: 'explosion'`. |
| 65 | Garra Sombra | Fantasma | Físico | Melee (1) | 70 | 3,5 s | 2 u · 50° | Alta probabilidad de crítico (1/8). `impactStyle: 'ghost'`. |
| 66 | Adeudo | Siniestro | Físico | Melee (1) | 50 (100) | 4 s | 2 u · 50° | Dobla la potencia si recibiste daño en los últimos 1,5 s. |
| 67 | Reciclaje | Normal | Estado | Self (2) | — | 12 s | — | Recupera el último objeto consumido del mapa y reinicia su cooldown personal. No funciona con MT. |
| 68 | Gigaimpacto | Normal | Físico | Dash (3) | 150 | 14 s | 5 u | Embestida; tras el golpe quedas 1 s sin moverte ni atacar. Empuje 1,2 u. |
| 69 | Pulimento | Roca | Estado | Self (2) | — | 10 s | — | +40 % velocidad 6 s. Se puede lanzar mientras te mueves. |
| 70 | Destello | Normal | Estado | Área (2) | — | 10 s | 3 u de radio a 4 u | Ciega a los rivales 1,5 s (±30° de puntería) y revela la niebla de la zona para tu equipo 3 s. |
| 71 | Roca Afilada | Roca | Físico | Haz (3) | 100 | 8 s | 8 u | Estalagmitas en línea; crítico 1/8 y empuje 0,4 u. `beamStyle: 'rock'`. |
| 72 | Avalancha | Hielo | Físico | Área cono (1) | 60 (120) | 5 s | 3,5 u · 60° | Dobla si te golpearon en los últimos 2 s; −30 % velocidad 2 s. |
| 73 | Onda Trueno | Eléctrico | Estado | Proyectil (2) | — | 8 s | 8,5 u | Parálisis 4 s: ×0,55 velocidad y 20 % de fallo al iniciar una habilidad. |
| 74 | Giro Bola | Acero | Físico | Dash (1) | 40–120 | 6 s | 4 u | Potencia = 40 + 80 × (velocidad del rival − la tuya) / 3, con mínimo 40 y tope 120. Castiga a los rápidos. |
| 75 | Danza Espada | Normal | Estado | Self (2) | — | 12 s | — | Canaliza 0,45 s: +35 % ataque físico 5 s. Se cancela si te golpean. |

### MT76–MT92

| MT | Movimiento | Tipo | Cat. | Forma (uso) | Pot. | CD | Alcance | Efecto en NewPoke |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 76 | Trampa Rocas | Roca | Estado | Área (3) | — | 14 s | 4 u de radio a 5 u | Trampa 20 s: al entrar, 8 % de vida máxima y −20 % velocidad 1 s. Solo daña al equipo rival. |
| 77 | Autosugestión | Normal | Estado | Self (2) | — | 12 s | 6 u | Copia todos los buffs positivos del rival más cercano a 6 u. |
| 78 | Seducción | Normal | Estado | Área cono (2) | — | 12 s | 3 u · 50° | −30 % ataque especial 5 s a los rivales del cono. Sin género: baja la guardia mágica. |
| 79 | Pulso Umbrío | Siniestro | Especial | Haz (2) | 80 | 5 s | 9 u | 20 % de interrupción 0,4 s. `beamStyle: 'dark'`. |
| 80 | Roca Deslizante | Roca | Físico | Área cono (2) | 75 | 6 s | 4,5 u · 50° | Lluvia de piedras; 30 % de interrupción 0,3 s y empuje 0,6 u. |
| 81 | Tijera X | Bicho | Físico | Melee (1) | 80 | 4 s | 2,2 u · 55° | Dos tajos cruzados; +25 % contra objetivos ralentizados. Estrena `impactStyle: 'bug'`. |
| 82 | Sonámbulo | Normal | Estado | Self (2) | — | 5 s | — | Solo usable mientras duermes: lanza al instante una habilidad aleatoria de tu set con el 70 % de potencia y sin gastar su CD. |
| 83 | Don Natural | Normal | Físico | Proyectil (1) | 60 | 5 s | 8 u | El tipo y la potencia dependen de la baya que lleves: Aranja → Planta 80 y cura 20; Zidra → Agua 90; Ziuela → Hada 70 y elimina ralentizaciones. |
| 84 | Puya Nociva | Veneno | Físico | Melee (1) | 80 | 4 s | 2 u · 50° | 30 % de veneno 8 s. |
| 85 | Come Sueños | Psíquico | Especial | Haz (3) | 100 | 9 s | 8 u | Contra dormidos: 100 de potencia y cura el 50 %. Contra despiertos: 50 y sin curación. |
| 86 | Hierba Lazo | Planta | Especial | Área (2) | 40–120 | 6 s | 2 u de radio a 6 u | Potencia según el tamaño del objetivo (hurtbox): 40 en pequeños y 120 en grandes; −30 % velocidad 2 s. |
| 87 | Contoneo | Normal | Estado | Proyectil (2) | — | 10 s | 8 u | +25 % ataque al rival pero confusión 3 s: ±25° de desvío y 15 % de autogolpe. |
| 88 | Picoteo | Volador | Físico | Dash (1) | 60 | 4 s | 4 u | Golpea y roba el buff de objeto o baya activo del objetivo. Si no tiene, roba un buff positivo. |
| 89 | Ida y Vuelta | Bicho | Físico | Dash (1) | 70 | 6 s | 4 u | Golpea y retrocede 4 u en el mismo casteo; sirve para entrar, pegar y salir. |
| 90 | Sustituto | Normal | Estado | Self (3) | — | 16 s | — | Gasta el 20 % de tu vida máxima para crear un muñeco con esa vida que absorbe el daño dirigido a ti mientras estés a menos de 3 u. No se puede lanzar por debajo del 25 % de vida. |
| 91 | Cañón Flash | Acero | Especial | Haz (2) | 80 | 5 s | 9 u | 20 % de −20 % defensa especial 4 s. Estrena `beamStyle: 'steel'`. |
| 92 | Espacio Raro | Psíquico | Estado | Área (3) | — | 18 s | 5 u de radio a 4 u | 8 s: dentro de la zona la velocidad se invierte (los rápidos van lentos y al revés). Afecta a ambos equipos. |

---

## 4. MO · los ocho movimientos de exploración

Las MO sustituyen el instinto común y comparten su botón (`I` / `RT`). Todas
tienen dos lecturas: una **acción de mapa** que cambia la ruta y una **herramienta
de combate** que justifica llevarlas en la partida. El HUD muestra su icono en el
mismo sitio que Protección, Impulso o Regeneración.

Resumen:

| MO | Tipo | Forma | Pot. | CD | Acción de mapa | Papel en combate |
| --- | --- | --- | --- | --- | --- | --- |
| Corte | Normal | Melee | 55 | 4 s | Tala árboles y abre líneas de visión | Corta proyectiles |
| Vuelo | Volador | Dash | 90 | 12 s | Cruza montañas, agua y obstáculos | Entrada con aterrizaje en área |
| Surf | Agua | Dash | 80 | 10 s | Atraviesa agua a velocidad normal | Ola que empuja y deja rastro lento |
| Fuerza | Normal | Melee | 85 | 8 s | Empuja rocas y bloques | Empuja rivales contra muros |
| Despejar | Volador | Área | — | 14 s | Disipa niebla y sombras de árboles | Limpia trampas y da visión |
| Demolición | Lucha | Melee | 60 | 5 s | Rompe rocas y revela objetos | Rompe escudos y baja defensa |
| Cascada | Agua | Dash | 90 | 11 s | Sube cascadas y aguas profundas | Embestida que ignora terreno lento |
| Treparrocas | Normal | Dash | 90 | 12 s | Escala montañas | Salto con golpe en área |

### MO01 · Corte

- **Ficha**: Normal, físico, `melee`, 55 de potencia, 4 s de CD, 2,2 u y 55°.
- **Combate**: tajo rápido con 0,2 s de ventana activa que **destruye los
  proyectiles enemigos** dentro del cono (no los refleja). Es la respuesta barata
  a Shuriken de Agua, Impactrueno y Bola Sombra, pero exige encarar el proyectil
  y comprometer el casteo.
- **Mapa**: corta los árboles marcados como `cuttable`. El árbol desaparece
  durante 45 s: quita su collider y su sombra de visión, así que abre una línea
  de tiro y una ruta lateral. Cortar el árbol que cubre un carril es una
  decisión de equipo, no un adorno.
- **Implementación**: `Collider` necesita una etiqueta (`tree`, `rock`,
  `mountain`) y un flag `cuttable`; `world.ts` expone `cutTree(id)` y reconstruye
  la máscara de niebla del equipo. En la sesión local el corte se aplica al mundo
  compartido, no a la vista de un jugador concreto.
- **Contrajuego**: el casteo te ancla 0,3 s; el árbol vuelve a crecer; cortar
  cerca del rival revela tu posición.

### MO02 · Vuelo

- **Ficha**: Volador, físico, `dash`, 90 de potencia, 12 s de CD, 7 u.
- **Combate**: 0,5 s de ascenso en el que no te pueden targetear pero tampoco
  puedes actuar. Después te lanzas a un punto marcado y aterrizas con un área de
  2 u, 90 de potencia y empuje de 1 u. La marca de aterrizaje es visible para
  todos 0,35 s antes del golpe.
- **Mapa**: ignora montañas, agua, separadores y obstáculos durante el vuelo.
  Solo se puede aterrizar en suelo caminable: la UI marca en rojo los puntos
  inválidos. Es la MO de rotación por excelencia.
- **Implementación**: reutiliza el `dash` con `ignoreCollidersDuring` y una
  validación de punto final. El ascenso usa el mismo estado de invulnerabilidad
  que Excavar, pero sin daño al emerger si el punto es inválido.
- **Contrajuego**: la marca de aterrizaje permite esquivar o castigar con un área;
  si el vuelo se cancela, el CD queda en 4 s.

### MO03 · Surf

- **Ficha**: Agua, especial, `dash`, 80 de potencia, 10 s de CD, 6 u.
- **Combate**: montas una ola de 2,4 u de ancho que avanza 6 u, empuja 1,2 u y
  deja un rastro de agua 3 s que ralentiza un 25 %. La ola se detiene en muros y
  separadores, pero no en agua.
- **Mapa**: ignora la penalización de `waterLow` y `waterHigh` y permite cruzar
  aguas profundas. Si el mapa tiene corrientes, Surf navega a favor y frena a
  contracorriente.
- **Implementación**: el `dash` consulta un override de terreno mientras dura y
  genera una entidad de rastro con la misma colisión que `slowEffects`.
- **Contrajuego**: la ola es lenta (12 u/s) y se puede cruzar por el lateral; el
  rastro afecta también a los aliados, así que no se puede pintar el mapa sin
  pensar.

### MO04 · Fuerza

- **Ficha**: Normal, físico, `melee`, 85 de potencia, 8 s de CD, 2,4 u y 60°.
- **Combate**: empuja 2,2 u. Si el rival choca con un muro, separador o roca,
  recibe un 15 % extra y 0,5 s de aturdimiento. No empuja a través de dashes.
- **Mapa**: empuja rocas y bloques marcados como `pushable`. Cada roca avanza
  hasta 2 u y se queda en la nueva posición: puede abrir un paso, tapar un
  carril o crear cobertura. Las rocas no se pueden empujar sobre una base.
- **Implementación**: nuevo collider `pushable` con resolución por pasos y
  validación de destino. Los bots necesitan recalcular la ruta cuando una roca
  cambia de sitio.
- **Contrajuego**: 0,4 s de preparación; el empuje no afecta a objetivos en dash
  o invulnerables; mover una roca puede beneficiar al rival.

### MO05 · Despejar

- **Ficha**: Volador, estado, `aoe`, sin potencia, 14 s de CD, 6 u de radio
  centrada en el lanzador.
- **Combate**: limpia trampas enemigas (Trampa Rocas), charcos, zonas de
  ralentización y pantallas del área. Durante 5 s sube un 15 % la visión del
  equipo y durante 4 s elimina el bonus de ocultación del terreno a los rivales
  dentro del radio. No quita estados.
- **Mapa**: disipa temporalmente las sombras de niebla de árboles y montañas en
  el radio, y revela objetos ocultos. Es la MO que convierte una zona opaca en
  información.
- **Implementación**: se engancha a `fogMask` y a `vision.ts` como un modificador
  temporal por equipo; las trampas y los charcos viven en listas de
  `matchState`. El efecto se dibuja con un anillo de viento bajo y jirones que
  salen del centro.
- **Contrajuego**: 0,6 s de casteo muy visible; el CD es el más largo de las MO;
  no limpia estados ni daños.

### MO06 · Demolición

- **Ficha**: Lucha, físico, `melee`, 60 de potencia, 5 s de CD, 2 u y 55°.
- **Combate**: golpe seco que aplica −25 % defensa 5 s y rompe escudos,
  pantallas y sustitutos. También destruye las rocas creadas por Tumba Rocas.
- **Mapa**: rompe rocas `breakable` y revela los objetos enterrados que haya
  debajo. Las rocas reaparecen a los 60 s. Es la MO que convierte un mapa cerrado
  en uno con atajos, pero obliga a gastar el hueco de instinto.
- **Implementación**: comparte el sistema de colliders con Corte y Fuerza; el
  objeto enterrado se guarda en el mapa y solo se hace visible al romper la roca.
- **Contrajuego**: alcance corto; si la roca estaba tapando una línea de tiro
  enemiga, la abres para los dos equipos.

### MO07 · Cascada

- **Ficha**: Agua, físico, `dash`, 90 de potencia, 11 s de CD, 5 u.
- **Combate**: oleada que ignora el terreno lento, arrastra 1 u a los rivales que
  pilla y los empuja 1,2 u al final. Se puede usar sobre agua sin penalización.
- **Mapa**: sube cascadas y desniveles de agua. Si el mapa tiene una cascada que
  corta una ruta, Cascada la convierte en carril transitable en ambos sentidos.
- **Implementación**: `dash` con override de terreno y un pequeño desplazamiento
  vertical si el mapa define altura de cascada; la cámara acompaña sin romper el
  ángulo de 45°.
- **Contrajuego**: 0,5 s de preparación y termina siempre en el punto más
  expuesto; un dash lateral la esquiva.

### MO08 · Treparrocas

- **Ficha**: Normal, físico, `dash`, 90 de potencia, 12 s de CD, 6 u.
- **Combate**: 0,4 s de escalada en la que no te pueden targetear; al llegar
  arriba golpeas un área de 1,5 u con 90 de potencia y 20 % de confusión. Si no
  hay una superficie válida, el movimiento se cancela sin gastar CD.
- **Mapa**: escala montañas y paredes marcadas como `climbable`. Abre rutas
  altas que hoy son intransitables y permite flanquear por donde el equipo rival
  no mira.
- **Implementación**: los colliders de montaña necesitan una altura y un flag de
  escalada; la validación del punto superior usa la misma comprobación de suelo
  caminable que Vuelo. La cámara no debe atravesar la montaña al subir.
- **Contrajuego**: el punto de escalada se ve; el aterrizaje se telegrafía 0,3 s;
  mientras escalas no puedes atacar y eres vulnerable al daño de área.

---

## 5. Anexo A · MT de otras generaciones

Estas MT no existen en el set base de 92. Se listan para que el catálogo sea
completo respecto a la historia de las MT. Los nombres siguen la localización
española habitual; conviene revisarlos contra la traducción oficial antes de
tocarlos en la UI.

### Generación V

| MT | Movimiento | Tipo | Cat. | Forma (uso) | Pot. | CD | Efecto en NewPoke |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G5 · 01 | Afilagarras | Siniestro | Estado | Self (2) | — | 9 s | +20 % ataque y −15 % de dispersión de las habilidades direccionales 6 s. |
| G5 · 03 | Psicocarga | Psíquico | Especial | Proyectil (2) | 80 | 5 s | Categoría especial, pero usa la **defensa** del objetivo en la fórmula. |
| G5 · 09 | Carga Tóxica | Veneno | Especial | Proyectil (1) | 65 (130) | 4 s | Dobla la potencia contra objetivos envenenados. |
| G5 · 19 | Telequinesis | Psíquico | Estado | Proyectil (2) | — | 11 s | Eleva al rival 1,5 s: no puede moverse y pierde la inmunidad de tipo Tierra. |
| G5 · 23 | Antiaéreo | Roca | Físico | Proyectil (1) | 50 | 4 s | Derriba al objetivo 4 s: pierde la inmunidad de Volador y no puede usar Vuelo. |
| G5 · 34 | Onda Tóxica | Veneno | Especial | Área self (3) | 95 | 8 s | Onda de lodo alrededor del lanzador; 20 % de veneno. |
| G5 · 43 | Nitrocarga | Fuego | Físico | Dash (1) | 50 | 4 s | Embestida en llamas; +25 % velocidad 4 s. |
| G5 · 47 | Puntapié | Lucha | Físico | Melee (1) | 60 | 3,5 s | Barrido bajo; −35 % velocidad 2,5 s. |
| G5 · 48 | Canon | Normal | Especial | Proyectil (1) | 60 | 3 s | +50 % de potencia si un aliado usó Canon en el último 1,5 s. |
| G5 · 49 | Eco Voz | Normal | Especial | Proyectil (1) | 40 | 1,5 s | +20 de potencia por uso consecutivo, con tope en 120; se reinicia al usar otra habilidad. |
| G5 · 51 | Cambio de Bando | Psíquico | Estado | Self (3) | — | 12 s | Intercambia tu posición con el aliado más cercano a 6 u y da 0,4 s de invulnerabilidad a ambos. |
| G5 · 55 | Escaldar | Agua | Especial | Proyectil (1) | 80 | 5 s | 30 % de quemadura; el agua caliente también cura la congelación del objetivo. |
| G5 · 58 | Caída Libre | Volador | Físico | Dash (2) | 60 | 10 s | Agarra a un rival, lo eleva 0,6 s y lo deja caer con 0,6 s de aturdimiento. |
| G5 · 59 | Calcinación | Fuego | Especial | Proyectil (1) | 50 | 3,5 s | Quema el objeto o baya que lleve el objetivo y lo deja sin buff de objeto 5 s. |
| G5 · 60 | Postergar | Siniestro | Estado | Proyectil (2) | — | 10 s | La siguiente habilidad del rival tarda 0,6 s más en arrancar. |
| G5 · 62 | Acrobacia | Volador | Físico | Dash (1) | 55 (110) | 4 s | Dobla la potencia si no llevas objeto equipado. |
| G5 · 67 | Represalia | Normal | Físico | Melee (1) | 70 (140) | 5 s | Dobla la potencia si un aliado murió en los últimos 15 s. |
| G5 · 72 | Voltiocambio | Eléctrico | Especial | Proyectil (2) | 70 | 6 s | Tras impactar, retrocedes 3,5 u en el mismo casteo. |
| G5 · 76 | Golpe Bicho | Bicho | Especial | Área cono (1) | 50 | 4 s | −20 % ataque especial 3 s. Estrena `aoeStyle: 'bug'`. |
| G5 · 78 | Terratemblor | Tierra | Físico | Área self (2) | 60 | 6 s | Sacudida baja; −25 % velocidad 2 s. |
| G5 · 79 | Aliento Gélido | Hielo | Especial | Haz (1) | 40 | 4 s | Siempre crítico. Ideal para castigar objetivos con defensa especial alta. |
| G5 · 82 | Cola Dragón | Dragón | Físico | Melee (2) | 60 | 5 s | Empuje 2,5 u y corta casteos. |
| G5 · 83 | Avivar | Normal | Estado | Self (2) | — | 8 s | +15 % ataque y ataque especial 6 s. |
| G5 · 93 | Voltio Cruel | Eléctrico | Físico | Dash (2) | 90 | 6 s | Embestida eléctrica con 20 % de autodaño. |
| G5 · 95 | Alarido | Siniestro | Especial | Área cono (1) | 55 | 4 s | −20 % ataque especial 3 s a los rivales del cono. |

### Generación VI

| MT | Movimiento | Tipo | Cat. | Forma (uso) | Pot. | CD | Efecto en NewPoke |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G6 · 96 | Poder Natural | Normal | Estado | Self (2) | — | 6 s | Lanza el movimiento del terreno: jungla → Hierba Lazo, arena → Tierra Viva, agua → Agua Lodosa, fuego → Humareda, eléctrico → Rayo, hielo → Rayo Hielo, ciénaga → Bomba Lodo, bosque umbrío → Bola Sombra, claro feérico → Brillo Mágico, parque → A Bocajarro. |
| G6 · 98 | Puño Incremento | Lucha | Físico | Melee (1) | 40 | 3 s | +15 % ataque 5 s, acumulable 3 veces. |
| G6 · 99 | Brillo Mágico | Hada | Especial | Área cono (2) | 80 | 6 s | Estrella de luz en cono; reduce un 20 % el ataque especial 3 s. |
| G6 · 100 | Confidencia | Normal | Estado | Proyectil (2) | — | 8 s | −25 % ataque especial 5 s; no se puede esquivar. |

### Generación VII

| MT | Movimiento | Tipo | Cat. | Forma (uso) | Pot. | CD | Efecto en NewPoke |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G7 · 28 | Chupavidas | Bicho | Físico | Melee (1) | 80 | 5 s | Cura el 50 % del daño infligido. |
| G7 · 59 | Giro Vil | Siniestro | Físico | Área self (2) | 60 | 5 s | Golpe circular que alcanza a todos los rivales alrededor. |
| G7 · 67 | Puntería | Acero | Físico | Dash (1) | 70 | 4 s | No puede fallar y tiene crítico 1/8. |
| G7 · 70 | Velo Aurora | Hielo | Estado | Self aura (3) | — | 15 s | −25 % a todo el daño recibido 6 s. Solo usable bajo granizo o en terreno de hielo; consume la zona. |
| G7 · 83 | Acoso | Bicho | Especial | Proyectil (2) | 20 | 7 s | Atrapa 2,5 s y hace 10 PV/s mientras el objetivo siga en 3 u. |

### Generación VIII

| MT | Movimiento | Tipo | Cat. | Forma (uso) | Pot. | CD | Efecto en NewPoke |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G8 · 00 | Megapuño | Normal | Físico | Melee (1) | 80 | 4 s | Empuje 0,8 u. |
| G8 · 01 | Megapatada | Normal | Físico | Melee (3) | 120 | 8 s | 0,4 s de preparación; empuje 1,5 u. |
| G8 · 02 | Día de Pago | Normal | Físico | Proyectil (B) | 40 | 3 s | Esparce monedas decorativas; recogerlas da 5 XP cada una. |
| G8 · 03 | Puño Fuego | Fuego | Físico | Melee (1) | 75 | 4 s | 10 % de quemadura. |
| G8 · 04 | Puño Hielo | Hielo | Físico | Melee (1) | 75 | 4 s | 10 % de congelación. |
| G8 · 05 | Puño Trueno | Eléctrico | Físico | Melee (1) | 75 | 4 s | 10 % de parálisis. |
| G8 · 07 | Misil Aguja | Bicho | Físico | Proyectil (1) | 25×3 | 4 s | Tres aguijones en abanico. |
| G8 · 10 | Hoja Mágica | Planta | Especial | Proyectil (1) | 60 | 4 s | Teledirigida; no se puede esquivar con dash lateral. |
| G8 · 12 | Hoja Solar | Planta | Físico | Melee (3) | 125 | 11 s | 0,8 s de carga; tajo amplio que atraviesa escudos. |
| G8 · 13 | Giro Fuego | Fuego | Especial | Área (2) | 35 + 15/s | 8 s | Remolino de 2 u a 5 u que dura 3 s y atrapa 1,5 s. |
| G8 · 16 | Chirrido | Normal | Estado | Área cono (2) | — | 9 s | −40 % defensa 5 s. |
| G8 · 26 | Cara Susto | Normal | Estado | Proyectil (2) | — | 8 s | −40 % velocidad 3 s. |
| G8 · 29 | Encanto | Hada | Estado | Área cono (2) | — | 9 s | −30 % ataque físico 5 s. |
| G8 · 36 | Torbellino | Agua | Especial | Área (2) | 35 + 12/s | 8 s | Remolino de 2,2 u a 5 u que dura 3 s y atrapa 2 s. |
| G8 · 37 | Paliza | Siniestro | Físico | Melee (2) | 20×aliados | 6 s | Un golpe por aliado vivo, con tope de 100 de potencia. |
| G8 · 41 | Refuerzo | Normal | Estado | Self aura (2) | — | 10 s | La siguiente habilidad del aliado más cercano pega un 30 % más. |
| G8 · 42 | Desquite | Lucha | Físico | Melee (1) | 60 (120) | 5 s | Dobla si recibiste daño en los últimos 2 s. |
| G8 · 44 | Sello | Psíquico | Estado | Self aura (3) | — | 14 s | 5 s: los rivales en 4 u no pueden usar las habilidades que lleve el lanzador. |
| G8 · 46 | Meteorobola | Normal | Especial | Proyectil (2) | 50 (100) | 5 s | Adopta el tipo del campo activo y dobla potencia dentro de él. |
| G8 · 49 | Bucle Arena | Tierra | Físico | Área (2) | 35 + 10/s | 7 s | Arena de 2 u a 5 u que atrapa 2 s. |
| G8 · 51 | Carámbano | Hielo | Físico | Proyectil (1) | 25×3 | 4 s | Tres carámbanos en abanico. |
| G8 · 52 | Rebote | Volador | Físico | Dash (2) | 85 | 8 s | Salto con aterrizaje; 30 % de parálisis. |
| G8 · 53 | Disparo Lodo | Tierra | Especial | Proyectil (1) | 55 | 4 s | −30 % velocidad 2 s. |
| G8 · 54 | Pedrada | Roca | Físico | Proyectil (1) | 25×3 | 4 s | Tres rocas en abanico. |
| G8 · 58 | Buena Baza | Siniestro | Físico | Melee (1) | 60 (120) | 5 s | Dobla si el objetivo recibió daño en el último segundo. |
| G8 · 60 | Cambiapoder | Psíquico | Estado | Self (3) | — | 12 s | Intercambia los buffs de ataque y ataque especial con el rival 6 s. |
| G8 · 61 | Cambiadefensa | Psíquico | Estado | Self (3) | — | 12 s | Intercambia los buffs de defensa y defensa especial 6 s. |
| G8 · 62 | Cambiavelocidad | Psíquico | Estado | Self (3) | — | 12 s | Intercambia la velocidad con el rival 6 s. |
| G8 · 64 | A Bocajarro | Lucha | Físico | Melee (3) | 120 | 10 s | −25 % defensa y defensa especial 6 s. |
| G8 · 66 | Colmillo Ígneo | Fuego | Físico | Melee (1) | 65 | 3,5 s | 10 % de quemadura y 10 % de interrupción. |
| G8 · 67 | Colmillo Hielo | Hielo | Físico | Melee (1) | 65 | 3,5 s | 10 % de congelación y 10 % de interrupción. |
| G8 · 68 | Colmillo Rayo | Eléctrico | Físico | Melee (1) | 65 | 3,5 s | 10 % de parálisis y 10 % de interrupción. |
| G8 · 69 | Psicocorte | Psíquico | Físico | Melee (1) | 70 | 4 s | Crítico 1/8. |
| G8 · 71 | Zona Extraña | Psíquico | Estado | Área (3) | — | 16 s | 6 s: dentro de la zona se intercambian defensa y defensa especial. |
| G8 · 72 | Zona Mágica | Psíquico | Estado | Área (3) | — | 16 s | 6 s: los objetos y bayas no funcionan dentro de la zona. |
| G8 · 73 | Veneno X | Veneno | Físico | Melee (1) | 70 | 4 s | 20 % de veneno y crítico 1/8. |
| G8 · 77 | Hex | Fantasma | Especial | Proyectil (1) | 65 (130) | 4 s | Dobla la potencia contra cualquier objetivo con estado. |
| G8 · 82 | Bola Voltio | Eléctrico | Especial | Proyectil (2) | 40–120 | 5 s | Potencia según la diferencia de velocidad a favor del lanzador. |
| G8 · 83 | Concha Filo | Agua | Físico | Melee (1) | 75 | 4 s | 50 % de −20 % defensa. |
| G8 · 84 | Plumerazo | Normal | Físico | Melee (1) | 25×3 | 3 s | Tres golpes rápidos de cola. |
| G8 · 86 | Golpe Fantasma | Fantasma | Físico | Dash (3) | 90 | 9 s | Desaparece 0,6 s y reaparece detrás del objetivo; no se puede targetear mientras desaparece. |
| G8 · 87 | Beso Drenaje | Hada | Especial | Melee (1) | 50 | 4 s | Cura el 75 % del daño infligido. |
| G8 · 88 | Campo de Hierba | Planta | Estado | Área (3) | — | 14 s | 10 s: los aliados dentro curan 3 PV/s y los de tipo Planta ganan un 15 % de velocidad. |
| G8 · 89 | Campo de Niebla | Hada | Estado | Área (3) | — | 14 s | 10 s: inmunidad a estados dentro y +15 % velocidad para los de tipo Hada. |
| G8 · 90 | Campo Eléctrico | Eléctrico | Estado | Área (3) | — | 14 s | 10 s: +15 % velocidad para los de tipo Eléctrico e inmunidad a la parálisis. |
| G8 · 91 | Campo Psíquico | Psíquico | Estado | Área (3) | — | 14 s | 10 s: +20 % daño Psíquico e inmunidad a la interrupción. |
| G8 · 92 | Llama Embrujada | Fuego | Especial | Proyectil (2) | 75 | 5 s | −25 % ataque especial 4 s. |
| G8 · 93 | Onda Anómala | Eléctrico | Estado | Proyectil (2) | — | 8 s | −40 % ataque especial 5 s. |
| G8 · 95 | Tajo Aéreo | Volador | Especial | Proyectil (1) | 75 | 4 s | 30 % de interrupción 0,3 s. |
| G8 · 98 | Hidroariete | Agua | Físico | Melee (2) | 85 | 5 s | 20 % de −20 % defensa. |
| G8 · 99 | Plancha Corporal | Lucha | Físico | Melee (2) | 80 | 5 s | Usa la **defensa** del usuario como stat de ataque. |

> **Nota sobre los TR.** La generación VIII sustituye parte del catálogo por
> 100 TR de un solo uso. No se catalogan aquí porque casi todos repiten
> movimientos ya presentes en el set base o en este anexo; si se quisiera un
> sistema de consumibles, bastaría marcar esas MT como `singleUse`.

### Generación IX

El set de Gen IX sube a 171 MT y reutiliza casi todo lo anterior. Las familias
mecánicamente nuevas que merece la pena incorporar son:

| Movimiento (EN) | Tipo | Cat. | Forma | Pot. | CD | Efecto en NewPoke |
| --- | --- | --- | --- | --- | --- | --- |
| Trailblaze | Planta | Físico | Dash (1) | 50 | 4 s | +25 % velocidad 4 s. |
| Pounce | Bicho | Físico | Melee (1) | 50 | 4 s | −30 % velocidad 2 s. |
| Chilling Water | Agua | Especial | Proyectil (1) | 50 | 4 s | −20 % ataque físico 4 s. |
| Snowscape | Hielo | Estado | Área (3) | — | 14 s | Campo de nieve 10 s: +30 % defensa para Hielo y suelo resbaladizo. |
| Tera Blast | Normal | Especial | Proyectil (2) | 80 | 5 s | Adopta el tipo primario del usuario y su VFX; si el usuario cambia de tipo, cambia con él. |
| Ruination | Siniestro | Estado | Proyectil (3) | — | 20 s | Deja al objetivo al 50 % de su vida actual. Telegrafía 0,8 s; no puede matar. |
| Ice Spinner | Hielo | Físico | Dash (2) | 80 | 6 s | Gira y elimina el campo o terreno activo al pasar. |
| Temper Flare | Fuego | Físico | Melee (2) | 75 (150) | 6 s | Dobla si tu última habilidad falló. |
| Dragon Cheer | Dragón | Estado | Self aura (3) | — | 14 s | El aliado más cercano gana crítico 1/8 durante 6 s. |
| Alluring Voice | Hada | Especial | Proyectil (2) | 80 | 5 s | Confunde 2 s si el objetivo tiene algún buff activo. |
| Hard Press | Acero | Físico | Melee (2) | 40–120 | 5 s | Más potencia cuanto más vida le queda al objetivo. |
| Supercell Slam | Eléctrico | Físico | Dash (3) | 100 | 9 s | Si falla el impacto, recibe un 15 % de autodaño. |
| Flip Turn | Agua | Físico | Dash (1) | 60 | 6 s | Igual que Ida y Vuelta: golpea y retrocede 3,5 u. |
| Scorching Sands | Tierra | Especial | Proyectil (2) | 70 | 5 s | 30 % de quemadura. |

> El resto del set de Gen IX reutiliza movimientos ya cubiertos en el set base o
> en este anexo, o añade variantes menores que se pueden ampliar con la misma
> plantilla cuando se aborde esa generación. No se duplican aquí para no engordar
> el catálogo.

---

## 6. Anexo B · MT retiradas (Gen I–III)

Movimientos que fueron MT en las primeras generaciones y desaparecieron del set
base. Se adaptan con las mismas reglas. Los números de MT cambian entre juegos,
así que se etiquetan solo por generación.

| Gen | Movimiento | Tipo | Cat. | Forma (uso) | Pot. | CD | Efecto en NewPoke |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G1 | Viento Cortante | Normal | Especial | Área cono (3) | 80 | 6 s | Carga 1 s y lanza un tajo de viento de 3,2 u; crítico 1/8. |
| G1 | Remolino | Normal | Estado | Área cono (2) | — | 10 s | Empuje 3 u y corta casteos. No cambia de posición al rival como en los juegos principales. |
| G1 | Perforador | Normal | Físico | Melee (3) | 20 % PV | 14 s | Golpe perforante que quita un 20 % de la vida máxima actual; telegrafía 0,7 s. No puede matar. |
| G1 | Golpe Cuerpo | Normal | Físico | Melee (1) | 85 | 4,5 s | 30 % de parálisis. |
| G1 | Derribo | Normal | Físico | Dash (1) | 90 | 6 s | 25 % de autodaño. |
| G1 | Doble Filo | Normal | Físico | Dash (3) | 120 | 8 s | 33 % de autodaño; nunca te deja por debajo de 1 PV. |
| G1 | Rayo Burbuja | Agua | Especial | Proyectil (1) | 65 | 4 s | −30 % velocidad 2 s. |
| G1 | Pistola Agua | Agua | Especial | Proyectil (B) | 40 | 2 s | Presión barata a distancia. |
| G1 | Sumisión | Lucha | Físico | Melee (2) | 80 | 6 s | Agarra y derriba; 25 % de autodaño. |
| G1 | Contraataque | Lucha | Estado | Self (3) | — | 12 s | 2 s de ventana: devuelve el 150 % del daño melee recibido. |
| G1 | Movimiento Sísmico | Lucha | Físico | Melee (2) | 12 % PV | 8 s | Daño fijo del 12 % de la vida máxima del objetivo; ignora defensas. |
| G1 | Furia | Normal | Estado | Self (2) | — | 10 s | +10 % ataque cada vez que te golpean, hasta 5 acumulaciones durante 6 s. |
| G1 | Megaagotar | Planta | Especial | Haz (1) | 40 | 4 s | Cura el 50 % del daño infligido. |
| G1 | Furia Dragón | Dragón | Especial | Proyectil (1) | 40 fijo | 5 s | Daño fijo de 40 que ignora stats y STAB. |
| G1 | Fisura | Tierra | Físico | Área cono (3) | 30 % PV | 16 s | Abre una grieta de 7 u y 50°; quita el 30 % de la vida actual tras 1,5 s de telegrafía. No puede matar. |
| G1 | Teletransporte | Psíquico | Estado | Dash (2) | — | 8 s | Salto instantáneo de 5 u en la dirección de la mirada; atraviesa obstáculos bajos, no muros. |
| G1 | Mímico | Normal | Estado | Self (3) | — | 14 s | Copia la última habilidad enemiga que hayas visto y la lanza gratis una vez. |
| G1 | Venganza | Normal | Estado | Self (3) | — | 12 s | Almacena el daño recibido 2 s y lo devuelve en un área de 3 u con un 150 %. |
| G1 | Metrónomo | Normal | Estado | Self (3) | — | 12 s | Lanza una habilidad aleatoria del catálogo completo, incluidas definitivas. Riesgo alto, diversión alta. |
| G1 | Bomba Huevo | Normal | Físico | Proyectil (2) | 100 | 6 s | Estalla en 1,5 u al impactar. |
| G1 | Golpe Cabeza | Normal | Físico | Dash (3) | 100 | 8 s | 1 s de carga con +30 % defensa; embiste y empuja 1 u. |
| G1 | Huevo Duro | Normal | Estado | Self (3) | — | 20 s | Cura el 50 % de la vida máxima. Se puede interrumpir. |
| G1 | Ataque Aéreo | Volador | Físico | Área (3) | 140 | 12 s | Carga 1,2 s y cae sobre un punto a 6 u con 3 u de radio; interrupción 0,5 s. |
| G1 | Psicoonda | Psíquico | Especial | Proyectil (1) | 10–50 | 4 s | Daño aleatorio entre 10 y 50; ignora defensas. |
| G1 | Triataque | Normal | Especial | Proyectil (2) | 80 | 5 s | 20 % de quemadura, congelación o parálisis, elegido al azar. |
| G2 | Puño Dinámico | Lucha | Físico | Melee (3) | 100 | 9 s | Confusión 3 s garantizada; 0,5 s de preparación. |
| G2 | Cabezazo | Normal | Físico | Dash (1) | 70 | 4 s | 30 % de interrupción 0,35 s. |
| G2 | Maldición | Fantasma | Estado | Self (2) | — | 12 s | +40 % ataque y defensa pero −30 % velocidad 8 s. Si el usuario es Fantasma, maldice a un rival: 10 PV/s durante 6 s. |
| G2 | Electrocañón | Eléctrico | Especial | Proyectil (3) | 120 | 10 s | Proyectil lento; 100 % de parálisis. Se puede esquivar. |
| G2 | Dulce Aroma | Normal | Estado | Área (2) | — | 10 s | −30 % ocultación y +15 % visión para tu equipo dentro del radio 6 s. |
| G2 | Ronquido | Normal | Especial | Self aura (2) | 60 | 5 s | Solo mientras duermes: onda de 3 u cada segundo durante 3 s. |
| G2 | Viento Hielo | Hielo | Especial | Área cono (1) | 55 | 4 s | −30 % velocidad 2,5 s. |
| G2 | Aliento Dragón | Dragón | Especial | Haz (1) | 60 | 4 s | 30 % de parálisis. |
| G2 | Bofetón Lodo | Tierra | Especial | Proyectil (B) | 40 | 3 s | −25 % precisión 3 s: las habilidades direccionales salen con ±20° de desvío. |
| G2 | Rapidez | Normal | Especial | Proyectil (1) | 60 | 3 s | Teledirigido; no se puede esquivar con dash lateral. |
| G2 | Rizo Defensa | Normal | Estado | Self (1) | — | 8 s | +30 % defensa 5 s; la siguiente Rollout o Giro Bola pega un 50 % más. |
| G2 | Detección | Lucha | Estado | Self (3) | — | 12 s | Bloqueo perfecto 0,8 s. Comparte límite con Protección: solo una por Pokémon. |
| G2 | Corte Furia | Bicho | Físico | Melee (B) | 40 | 2 s | +20 de potencia por golpe consecutivo, con tope en 100; se reinicia al fallar o cambiar de objetivo. |
| G2 | Pesadilla | Fantasma | Estado | Proyectil (2) | — | 12 s | Solo contra dormidos: 15 PV/s durante 4 s. |
| G3 | Buceo | Agua | Físico | Dash (2) | 80 | 8 s | Te sumerges 0,5 s y emerges con área de 2 u; atraviesa agua sin penalización. |

---

## 7. Implementación

### 7.1. Modelo de datos

Las MT y MO no deberían vivir en `abilities.ts` mezcladas con los sets: son una
capa de **loadout** por encima del catálogo de habilidades. Propuesta:

```ts
export type MachineKind = 'mt' | 'mo';
export type MapTag = 'trees' | 'water' | 'rocks' | 'mountains';

export interface MachineDefinition {
  id: string;
  kind: MachineKind;
  /** 1..92 para MT; 1..8 para MO. */
  number: number;
  /** Id de la habilidad real en ABILITIES. */
  moveId: string;
  name: string;
  short: string;
  description: string;
  /** true = cualquier especie puede equiparla. */
  universal: boolean;
  /** Solo para MO: rasgos de mapa que necesita. */
  mapTags?: MapTag[];
}

export interface MachineLoadout {
  pokemonId: string;
  /** Una MT como máximo. */
  mtId: string | null;
  /** Una MO como máximo; ocupa el instinto común. */
  moId: string | null;
}
```

Reglas de validación en el roster:

1. `mtId` solo puede sustituir el hueco 2 o 3 del `MOVESETS` de la especie.
2. Si `moId` no es `null`, `commonAbilityId` se ignora y el HUD muestra la MO.
3. No se puede repetir `moId` dentro del mismo equipo.
4. El filtro de compatibilidad usa los tipos de `pokedex.ts` y la lista
   `learnset` de la especie.
5. En partida, morir reinicia los enfriamientos de la MT y de la MO, igual que
   el instinto activo. Sin esto, un jugador que muere vuelve con ventaja o con
   el hueco inservible.

### 7.2. Estados

Módulo puro nuevo, `src/game/status.ts`:

```ts
export type StatusId =
  | 'burn' | 'poison' | 'badPoison' | 'paralysis' | 'freeze' | 'sleep'
  | 'confusion' | 'taunt' | 'attract' | 'fear' | 'trapped' | 'flinch';

export interface StatusInstance {
  id: StatusId;
  /** Segundos restantes. */
  remaining: number;
  /** Quién lo aplicó, para atribuir el KO. */
  sourceId: string;
  /** Acumulaciones o fase (veneno grave). */
  stacks: number;
}

export interface StatusHost {
  statuses: StatusInstance[];
  speedMultiplier: number;
  incomingDamageMultiplier: number;
}
```

Orden de resolución por frame:

1. Enfriamientos y ventanas de casteo.
2. Tics de estado (quemadura, veneno, veneno grave, pesadilla).
3. Regeneración pasiva y curas pendientes.
4. Campos activos (duración y efectos de zona).
5. Trampas: solo se comprueban al entrar, no cada frame.
6. Limpieza de estados caducados y de inmunidades.

Puntos finos:

- El daño de estado **no** aplica STAB, crítico ni efectividad: es daño fijo.
  Así una quemadura no mata a un Charmander de tres ticks por casualidad.
- La parálisis no debe cancelar el casteo a mitad: se comprueba al iniciar. Si
  falla, no se gasta el CD (si no, es un estado que castiga dos veces).
- La congelación se rompe con cualquier daño, incluido el de un aliado. Tras
  romperse, el objetivo es inmune 3 s para que no se re-congele en cadena.
- El sueño de Descanso es voluntario: ignora Salvaguarda, no se rompe con el
  daño de estado y solo se corta con un golpe directo.
- La interrupción corta el casteo y deja el CD a la mitad; no puede interrumpir
  instintos ni MOs.

**Tipos temporales.** Respiro, Antiaéreo y Poder Oculto necesitan un override de
tipos por instancia. La solución limpia es un helper `effectiveTypes(player)` que
devuelva los tipos del Pokémon más los modificadores activos, y usarlo en
`combat.ts`, `terrainSpeed.ts` y `vision.ts`. Así Respiro pierde Volador y
Antiaéreo lo quita al rival sin tocar `pokedex.ts` ni el manifiesto.

### 7.3. Campos

```ts
export type FieldId =
  | 'sun' | 'rain' | 'sand' | 'hail'
  | 'grassy' | 'misty' | 'electric' | 'psychic';

export interface ActiveField {
  id: FieldId;
  x: number;
  z: number;
  radius: number;
  remaining: number;
  sourceTeam: number;
}

export function fieldSpeedFactor(
  player: MatchPlayerState,
  fields: readonly ActiveField[]
): number;

export function fieldConcealment(
  player: MatchPlayerState,
  fields: readonly ActiveField[]
): number;
```

Reglas de convivencia:

- Un solo **clima global** a la vez (sol, lluvia, arena o granizo). El último
  lanzado reemplaza al anterior y muestra un aviso en el HUD.
- Como máximo **dos terrenos** activos (uno por equipo). Si un equipo lanza otro,
  el suyo se reemplaza.
- Los campos no cambian el `terrainAt` del mapa: se suman como capa. Así la
  niebla, la velocidad y las habilidades de terreno pueden consultarlos sin
  reescribir el mapa.
- El granizo convierte visualmente el suelo en hielo, pero no crea colliders.
- La lluvia hace que Trueno caiga al instante y que la quemadura pegue la mitad;
  no apaga la quemadura existente.

### 7.4. Pantallas, trampas y señuelos

**Pantallas** (`ActiveScreen`):

```ts
export interface ActiveScreen {
  kind: 'light' | 'reflect' | 'aurora';
  x: number;
  z: number;
  radius: number;
  remaining: number;
  sourceTeam: number;
}
```

Se aplican en el pipeline de daño, después de crítico y antes de la efectividad.
No se acumulan: si hay dos, se usa la reducción mayor. Demolición las rompe si
el golpe entra en el cono.

**Trampas** (`HazardZone`):

- `ownerTeam`, `remaining` y `charges`.
- Solo disparan contra el equipo rival.
- Se ven con la niebla del equipo que las ve; el equipo dueño siempre las ve.
- Despejar las limpia; Demolición destruye las rocas visibles de la trampa si
  golpea su centro.

**Señuelos y sustituto** (`Decoy`):

```ts
export interface Decoy {
  id: string;
  ownerId: string;
  x: number;
  z: number;
  hp: number;
  remaining: number;
  kind: 'afterimage' | 'substitute';
}
```

- Los señuelos de Doble Equipo no tienen vida: absorben un golpe y desaparecen.
  Los proyectiles los eligen si están a menos de 0,8 u de su trayectoria.
- El sustituto se coloca en la posición del lanzador y tiene la vida que pagó el
  jugador. Mientras esté a menos de 3 u, redirige hacia sí mismo el daño de
  proyectiles y melee dirigido al jugador. El jugador puede seguir moviéndose; si
  se aleja más de 3 u, el muñeco se rompe.
- El muñeco no se mueve ni ataca. Su barra es visible para los dos equipos, así
  que el rival sabe cuánto le queda para romperlo.

### 7.5. MOs y el mapa

Los mapas actuales solo distinguen colliders de círculo y de segmento. Para las
MO hacen falta **etiquetas** y **flags**:

```ts
export interface ColliderFlags {
  tag?: 'tree' | 'rock' | 'mountain' | 'wall' | 'separator';
  cuttable?: boolean;   // Corte
  breakable?: boolean;  // Demolición
  pushable?: boolean;   // Fuerza
  climbable?: boolean;  // Treparrocas
}
```

Cambios necesarios:

1. `world.ts` debe exponer operaciones de mutación (`cut`, `break`, `push`) y
   reconstruir la máscara de niebla del equipo cuando cambie una sombra.
2. El editor de mapas necesita una paleta de rasgos por mapa (`features`), no
   solo objetos: árboles talables, rocas rompibles, rocas empujables y montañas
   escalables.
3. `botNav.ts` debe invalidar la ruta cuando una roca se mueve o un árbol cae.
   Los bots no deben seguir caminando hacia un collider que ya no existe.
4. La partida es local, así que no hay sincronización de red: el estado de los
   colliders mutados vive en el host de la sesión y se replica a las vistas como
   parte del mundo. Aun así, conviene separar `worldStatic` de `worldDynamic`
   para no reconstruir toda la niebla en cada corte.
5. Límites por mapa: máximo 6 árboles talables, 4 rocas rompibles, 4 empujables
   y 3 puntos de escalada. Más de eso convierte el mapa en un rompecabezas.

### 7.6. Código de ejemplo

Rayo Hielo necesita un hook de estado al impactar:

```ts
registerAbility(
  ability('mt13RayoHielo', 'Rayo Hielo', 'Ice', 'special', 'beam')
    .power(90)
    .cooldown(7)
    .range(9.5)
    .radius(0.32)
    .beam('ice')
    .impact('ice')
    .statusOnHit('freeze', 0.15, 1.5)
    .recovery(0.45)
    .animation('shoot')
    .description('MT13. Haz de hielo con 15 % de congelación durante 1,5 s.')
);
```

Trampa Rocas necesita una entidad de peligro, no un `aoe` normal:

```ts
registerAbility(
  ability('mt76TrampaRocas', 'Trampa Rocas', 'Rock', 'status', 'aoe')
    .cooldown(14)
    .range(5)
    .radius(4)
    .hazard({
      id: 'stealthRock',
      duration: 20,
      triggerDamage: 0.08,
      slow: { multiplier: 0.8, duration: 1 }
    })
    .recovery(0.6)
    .animation('shoot')
    .description('MT76. Trampa de rocas que castiga al equipo rival al entrar.')
);
```

Ida y Vuelta necesita un retroceso dentro del mismo casteo:

```ts
registerAbility(
  ability('mt89IdaYVuelta', 'Ida y Vuelta', 'Bug', 'physical', 'dash')
    .power(70)
    .cooldown(6)
    .radius(0.9)
    .dash(4)
    .backdash(4)
    .active(0.25)
    .recovery(0)
    .animation('quickstrike')
    .impact('bug')
    .description('MT89. Golpea y retrocede 4 u en el mismo movimiento.')
);
```

Espacio Raro necesita un campo con inversión de velocidad:

```ts
registerAbility(
  ability('mt92EspacioRaro', 'Espacio Raro', 'Psychic', 'status', 'aoe')
    .cooldown(18)
    .range(4)
    .radius(5)
    .field({ id: 'trickRoom', duration: 8, invertSpeed: true })
    .recovery(0.7)
    .animation('twirl')
    .description('MT92. Invierte la velocidad dentro de la zona durante 8 s.')
);
```

Estos tres métodos (`statusOnHit`, `hazard`, `backdash`) y el campo
`invertSpeed` no existen hoy: son las extensiones mínimas del builder. Se pueden
añadir sin tocar los ejecutores existentes, como decoradores del resultado de la
habilidad.

### 7.7. VFX nuevos

Estilos que hay que añadir a los tipos de `abilities.ts` y a `combatFx.ts`:

| Tipo | Estilos nuevos | Reutiliza |
| --- | --- | --- |
| `ProjectileStyle` | `dragon`, `fairy`, `bug` | Orbe, esquirlas y motas |
| `ImpactStyle` | `dragon`, `fairy`, `bug` | Filos, destellos y polvo |
| `BeamStyle` | `dragon`, `steel`, `fairy` | Columnas y anillos existentes |
| `AoeStyle` | `bug`, `fairy`, `dragon`, `steel`, `sand`, `hail`, `trickRoom` | Hojas, polvo, cristales y anillos |

Notas de arte:

- **Dragón**: escamas y arcos de energía azul-violeta; reutiliza la geometría de
  los tajos de Siniestro y cámbiale el color y la textura.
- **Hada**: motas rosas, estrellas y ondas suaves; usa mezcla normal para que el
  rosa se lea sobre hierba y arena.
- **Bicho**: élitros, aguijones y zumbido visual; reutiliza las partículas de
  polen de Planta con otra textura.
- **Acero**: esquirlas y destellos fríos; ya existe `impactStyle: 'steel'`, solo
  faltan haz y área.
- **Arena y granizo**: no son VFX de golpe, son capas de campo. Se dibujan como
  partículas persistentes de bajo coste y se desactivan fuera del radio.
- **Espacio Raro**: distorsión de anillos concéntricos y motas que se mueven al
  revés. Debe ser legible sin tapar la telegrafía de las habilidades.

Cada estilo nuevo multiplica los draw calls del splitscreen. Antes de añadir uno,
medir con 8 jugadores y el mismo mapa de referencia que usa
`docs/rendimiento-carga-mapas.md`.

### 7.8. Bots

Los bots necesitan tres cosas para no quedar tontos con este sistema:

1. **Puntuación de estados**: quemadura y veneno valen más contra tanques;
   parálisis vale más contra asesinos; sueño y congelación se reservan para
   objetivos aislados.
2. **Conocimiento de trampas y pantallas**: no entrar en Trampa Rocas si hay
   ruta alternativa; valorar pantallas en peleas de equipo; usar Demolición
   contra escudos.
3. **Uso de MOs**: cortar el árbol que tapa el carril, volar para rotar, surfear
   el agua y escalar la montaña. Si un bot lleva una MO y no la usa en toda la
   partida, el sistema ha fallado.

Los bots también deben **no elegir** MT que no sepan usar: Trick Room, Skill
Swap, Snatch y Sonámbulo requieren evaluación de contexto. Mejor excluirlas del
pool de bots en la primera versión que dejarlas al azar.

---

## 8. Balance

Reglas transversales:

- **Una MT y una MO por Pokémon.** Nada de acumular cobertura.
- **Ninguna MO repetida por equipo.** Si dos jugadores quieren Vuelo, uno cambia.
- **Máximo dos estados por objetivo.** El tercero reemplaza al más antiguo.
- **Los estados no se acumulan del mismo origen.** Refrescan duración.
- **Las pantallas no se acumulan.** Se aplica la reducción mayor.
- **Un clima global y dos terrenos como máximo.**
- **Nada de OHKO.** Los movimientos de daño fijo o porcentual tienen telegrafía
  y tope: Perforador, Fisura, Movimiento Sísmico y Ruination no pueden matar.
- **El autodaño nunca baja de 1 PV.** Vale para Explosión, Doble Filo,
  Voltio Cruel, Pájaro Osado y Supercell Slam.
- **Los 150+ son definitivas.** Hiperrayo, Gigaimpacto, Explosión y
  Megapatada pagan recarga, autodaño o preparación larga.
- **La información también es poder.** Destello, Despejar y Dulce Aroma deben
  tener un coste real: ocupan hueco y tienen CD alto.

Interacciones peligrosas que hay que probar primero:

| Combinación | Riesgo | Ajuste |
| --- | --- | --- |
| Espacio Raro + Vuelo/Surf | Un Pokémon rápido se vuelve inalcanzable o inútil | La inversión solo afecta a la velocidad de movimiento, no a los dashes |
| Doble Equipo + Sustituto | El rival no sabe a qué disparar | Los señuelos se disipan con un golpe y el sustituto se ve distinto |
| Trampa Rocas + Tormenta Arena | Daño pasivo acumulado sin interactuar | La trampa dispara una vez por entrada y la arena no apila con la trampa |
| Salvaguarda + Descanso | Inmunidad a estados con curación enorme | Salvaguarda no impide el sueño autoimpuesto de Descanso |
| Cambia Almas + Protección | Un equipo pierde su instinto y el otro gana uno mejor | El intercambio dura 8 s y se muestra en el HUD |
| Mofa + MO | Bloquea movilidad de mapa | Mofa dura 4 s y no afecta al movimiento normal |

---

## 9. Hoja de ruta

### Fase 0 · datos y UI

- [ ] `machines.ts` con las 92 MT y las 8 MO.
- [ ] Filtro de compatibilidad en el roster.
- [ ] Una MT y una MO por Pokémon; ninguna MO repetida por equipo.
- [ ] HUD de estado con iconos y duración.

**Criterio de salida**: se puede montar una partida con MT y MO sin que el
motor de combate sepa todavía qué hacen (solo se ven en la card y el HUD).

### Fase 1 · MT con sistemas existentes

Empezar por las que solo usan daño, ralentización, buffs, curas y dashes:

- Garra Dragón, Meditación, Corpulencia, Semilladora, Poder Oculto, Gigadrenado,
  Bola Sombra, Ala de Acero, Bola Energía, Salmuera, Puño Drenaje, Garra Sombra,
  Adeudo, Pulimento, Roca Afilada, Avalancha, Giro Bola, Tijera X, Cañón Flash,
  Aéreo, Cola Férrea.

**Criterio de salida**: una veintena de MT jugables, sin estados nuevos, con bots
que las usen. Los secundarios de debuff se dejan para la fase 3 si no hay tiempo
de ampliar los buffs negativos ahora.

### Fase 2 · estados

Implementar `status.ts` y las MT que dependen de él:

- Tóxico, Fuego Fatuo, Onda Trueno, Rayo Hielo, Ventisca, Rayo, Lanzallamas,
  Pulso Agua, Bomba Lodo, Puya Nociva, Descanso, Sonámbulo, Come Sueños,
  Imagen, Contoneo, Atracción, Mofa, Tormento, Poder Secreto.

**Criterio de salida**: los estados se aplican, se limpian y se ven; los bots
los puntúan.

### Fase 3 · campos y zonas

- Sol, lluvia, arena, granizo y los cuatro terrenos.
- Trampa Rocas y charcos.
- Poder Natural y Meteorobola.

**Criterio de salida**: un clima y dos terrenos conviven sin romper la niebla ni
la velocidad.

### Fase 4 · pantallas, trampas y señuelos

- Pantalla Luz, Reflejo, Velo Aurora.
- Doble Equipo, Sustituto.
- Cambia Almas, Arrebato, Reciclaje, Lanzamiento, Don Natural.
- Espacio Raro.

**Criterio de salida**: las combinaciones de la tabla de riesgos están probadas.

### Fase 5 · MOs y mapa

- Flags de collider y paleta del editor.
- Corte, Fuerza, Demolición, Vuelo, Surf, Cascada, Treparrocas, Despejar.
- Navegación de bots con mundo mutado.

**Criterio de salida**: cada MO abre una ruta real y los bots la usan.

### Fase 6 · anexos y legado

- Anexo A y B por orden de valor mecánico, no por número.
- Empezar por las que aportan algo distinto: Afilagarras, Psicocarga, Antiaéreo,
  Escaldar, Voltiocambio, Poder Natural, Velo Aurora, Zona Extraña, Campo de
  Hierba, Plancha Corporal, Buceo, Metrónomo.

---

## 10. Checklist de pruebas

- [ ] Las 92 MT y las 8 MO están en `machines.ts` y compilan.
- [ ] Ningún daño fijo o porcentual supera el 35 % de la vida máxima sin telegrafía o coste.
- [ ] Ningún movimiento puede matar desde el 100 % sin interacción.
- [ ] Los estados duros no se pueden encadenar (inmunidad tras congelación).
- [ ] Los estados no se aplican a rivales invulnerables de spawn.
- [ ] La niebla oculta telegrafías y estados como oculta el resto del combate.
- [ ] Las pantallas no se apilan y Demolición las rompe.
- [ ] Las trampas solo dañan al equipo rival y se limpian con Despejar.
- [ ] Los señuelos se distinguen del original y desaparecen con un golpe.
- [ ] El sustituto absorbe daño antes que el jugador y rompe al alejarse.
- [ ] Espacio Raro no afecta a dashes ni a la cámara.
- [ ] Las MO cambian el mapa de forma visible y reversible.
- [ ] Los árboles talados reconstruyen la máscara de niebla.
- [ ] Las rocas empujadas invalidan la ruta de los bots.
- [ ] Morir reinicia MT y MO, y no deja enfriamientos congelados.
- [ ] Ocho jugadores en splitscreen mantienen el rendimiento con los VFX nuevos.
- [ ] Los bots usan al menos una MT y una MO por partida.
- [ ] `docs/combat-balance.md` y `docs/items.md` quedan actualizados.

