# Habilidades comunes («Instintos»)

> Documento de diseño. Los valores son puntos de partida, no cifras cerradas.

## Objetivo

Dar a todos los Pokémon un **recurso universal de utilidad** que se elige una sola vez y que cubre huecos que el kit de cuatro habilidades no cubre: sustain, escape, anti-control, anti-dive o apoyo.

La idea es que el jugador no elija «más daño», sino **una respuesta** a lo que espera enfrentar. Las habilidades comunes no deben competir con las habilidades propias del Pokémon ni convertirse en obligatorias para un rol.

## Decisiones de diseño

### Nombre del slot

En el código, `'basic'` ya significa el ataque básico de cada Pokémon (`placaje`, `chispa`, `aranazo`...). Para evitar confusiones, el slot nuevo se llamará:

- En código: `'common'` o `'instinct'`.
- En la interfaz: **Instinto** o **Común**.

No reutilizar `'basic'`.

### Una elección por Pokémon

Cada Pokémon lleva exactamente **un instinto**. La elección se hace en el roster/loadout, antes de la partida, y se guarda por Pokémon, no por jugador. Así cada Pokémon tiene una «build» distinta y el equipo puede repartir respuestas.

Alternativa a valorar: permitir cambiarlo en el lobby de cada partida. Es más flexible, pero reduce el valor de planificar el roster.

### Principios

1. **Utilidad, no daño.** Ningún instinto debe hacer daño relevante; si lo hace, se vuelve obligatorio para los DPS.
2. **Cooldowns largos.** Entre 20 y 40 s. Son recursos de partida, no habilidades de spam.
3. **Contrajuego visible.** El rival debe ver o escuchar el instinto y poder reaccionar.
4. **Nada estrictamente mejor.** Cada opción debe tener un caso en el que brilla y otro en el que no.
5. **Sin duplicar identidad.** El dash común es peor que los dash de kit; la curación común es peor que la de Mew; la purga no es inmunidad total.
6. **Topes duros.** Reducción de daño ≤ 60-65 %, stealth ≤ 1,5 s, CC duro ≤ 0,5 s, inmunidad a slow ≤ 2 s.
7. **No bloquear control con la barrera.** Reducir daño está bien; anular slow, empuje o stun haría que fuese la única elección.

## Set propuesto

| Habilidad | Efecto base | CD | Cubre |
|---|---|---|---|
| **Protección** | 2 s: −55 % daño recibido y −20 % velocidad mientras dure | 30 s | Burst, iniciar pelea |
| **Impulso** | Dash de 3,5 u, sin daño, se detiene en muros | 18 s | Reposicionarse, esquivar |
| **Recuperación** | +18 % de vida al instante; +10 % en 3 s si no recibes daño | 35 s | Sustain, sobrevivir al poke |
| **Purga** | Quita slows y efectos de daño; 1,5 s inmune a slow | 30 s | Counter al control |
| **Onda de Choque** | Empuja 1,8 u en 360° y ralentiza 30 % durante 1 s | 25 s | Anti-dive, salir del melee |
| **Parada** | 0,6 s: anula el próximo golpe melee y aturde 0,5 s al atacante | 18 s | Duelo, expresión de habilidad |
| **Manto de Humo** | 1,2 s oculto; +15 % velocidad; se rompe al atacar | 35 s | Escape, emboscada |
| **Detección** | Revela enemigos en 7 u durante 2,5 s | 25 s | Niebla, coordinación |
| **Trampa** | Mina que ralentiza 50 % durante 1,5 s y hace poco daño | 20 s | Control de zona, retirada |
| **Ánimo** | Aura: +12 % velocidad y +10 % defensa a aliados durante 3 s | 40 s | Teamfight, apoyo |

### Lista corta para la primera versión

Empezar solo con estas cinco:

1. **Protección**
2. **Impulso**
3. **Recuperación**
4. **Purga**
5. **Onda de Choque**

Cubren las carencias reales del roster actual —sustain, escape, anti-slow y anti-melee— y casi todas se pueden montar con mecánicas que ya existen. **Parada** y **Manto de Humo** se añaden después, cuando el sistema base esté validado.

## Detalle de cada habilidad

### Protección

**Efecto:** escudo de absorción de hasta el 30 % de la vida máxima durante 3 s. Lo que no se consuma desaparece al terminar. Mientras está activo, el Pokémon se mueve un 20 % más lento.

**Por qué absorción y no solo reducción:** se lee mejor visualmente, premia el timing contra burst y no convierte al Pokémon en un tanque permanente. La reducción porcentual pura es más binaria: el rival espera dos segundos y sigue.

**Contrajuego:** el escudo no impide slow, empuje ni stun. El rival puede esperar a que caduque, usar control o rodearlo. El VFX debe ser muy claro.

**Números iniciales:**

- Absorción: 30 % de la vida máxima.
- Duración: 3 s.
- Penalización de velocidad: −20 %.
- Cooldown: 30 s.

### Impulso

**Efecto:** dash de 3,5 u en la dirección en la que mira el Pokémon. Sin daño. Se detiene en muros y obstáculos.

**Por qué es más corto que los dash de kit:** muchos Pokémon ya tienen dash de 4-5 u con 4-8 s de cooldown. Si el común fuera igual, habría doble movilidad y las identidades se difuminarían. Este es un «segundo escape», no un segundo inicio.

**Reglas:**

- Sin i-frames, o como máximo 0,1 s al inicio.
- No cancela animaciones de ataque, `windup` ni recuperación.
- Distancia fija; no escala con la velocidad.
- No atraviesa paredes.

**Números iniciales:**

- Distancia: 3,5 u.
- Duración del desplazamiento: ~0,2 s.
- Cooldown: 18 s.

**Variante Retroceso:** salto de 2,5-2,8 u hacia atrás, 14-16 s de cooldown, solo para salir. Es menos flexible, pero preserva mejor la agresividad de los dash de kit. Elegir una de las dos variantes, no ambas.

### Recuperación

**Efecto:** cura el 18 % de la vida máxima al instante y otros 10 % durante 3 s si el Pokémon no recibe daño.

**Por qué la segunda parte es condicional:** evita que sea una curación pasiva gratis en medio de la pelea y premia retirarse un momento. También deja contrajuego: si te alcanzan, pierdes la curación diferida.

**Números iniciales:**

- Curación instantánea: 18 %.
- Curación diferida: 10 % en 3 s.
- Cooldown: 35 s.

### Purga

**Efecto:** elimina todas las ralentizaciones y efectos de daño activos y concede 1,5 s de inmunidad a slow.

**Por qué es necesaria:** el juego tiene muchos slows (Onda Trueno, Bomba Lodo, Rayo Burbuja, Ventisca, Ventarrón, etc.). Sin una respuesta, los Pokémon lentos o sin dash quedan atrapados.

**Contrajuego:** la inmunidad es corta y solo cubre slow. No limpia stun, empuje ni hitstun. El rival puede baitear la purga y volver a ralentizar después.

**Números iniciales:**

- Inmunidad a slow: 1,5 s.
- Cooldown: 30 s.

### Onda de Choque

**Efecto:** empuja 1,8 u a todos los enemigos alrededor del lanzador y les aplica un slow del 30 % durante 1 s.

**Por qué existe:** es la respuesta universal al melee y a los dash de iniciación. No hace daño, así que no sustituye una habilidad ofensiva.

**Contrajuego:** alcance corto; los ataques a distancia y los proyectiles no se ven afectados. Si el rival está lejos, no sirve.

**Números iniciales:**

- Radio: 2,2 u.
- Empuje: 1,8 u.
- Slow: 30 % durante 1 s.
- Cooldown: 25 s.

### Parada

**Efecto:** durante 0,6 s, el Pokémon adopta una postura defensiva. Si recibe un golpe melee, lo anula y aturde al atacante 0,5 s.

**Por qué es interesante:** es la opción de mayor habilidad. Castiga la iniciación predecible y premia el timing, sin ser una barrera pasiva.

**Contrajuego:** un ataque a distancia o un área no la activan. Si se usa tarde, no hace nada y se va al cooldown.

**Números iniciales:**

- Ventana: 0,6 s.
- Stun al atacante: 0,5 s.
- Cooldown: 18 s.

### Manto de Humo

**Efecto:** el Pokémon se oculta durante 1,2 s y gana un 15 % de velocidad. Se rompe si ataca o usa una habilidad.

**Por qué encaja:** el juego ya tiene niebla de guerra y ocultación por terreno. Este instinto explota ese sistema sin añadir una mecánica completamente nueva.

**Contrajuego:** dura poco, se rompe al atacar y los ataques en área o la detección lo castigan. No debe permitir atacar desde el anonimato.

**Números iniciales:**

- Duración: 1,2 s.
- Bonus de velocidad: +15 %.
- Cooldown: 35 s.

### Detección

**Efecto:** revela a los enemigos en un radio de 7 u durante 2,5 s, incluso a través de la niebla.

**Por qué existe:** es una opción de coordinación y de información, útil contra emboscadas y contra Manto de Humo. En solo queue será más débil, y eso está bien.

**Números iniciales:**

- Radio: 7 u.
- Duración: 2,5 s.
- Cooldown: 25 s.

### Trampa

**Efecto:** coloca una mina en el suelo. Se arma a los 0,5 s y, cuando un enemigo entra en 1,2 u, explota: ralentiza un 50 % durante 1,5 s y hace un daño bajo fijo.

**Por qué existe:** da control de zona a Pokémon sin herramientas de zona. Solo puede haber una trampa activa por Pokémon.

**Contrajuego:** es visible, se puede esquivar y no funciona si el rival no pisa la zona. No debe usarse para bloquear pasillos enteros.

**Números iniciales:**

- Radio de activación: 1,2 u.
- Slow: 50 % durante 1,5 s.
- Daño: bajo y fijo (por ejemplo, 40).
- Cooldown: 20 s.

### Ánimo

**Efecto:** emite un aura que da +12 % de velocidad y +10 % de defensa a los aliados en 3 u durante 3 s.

**Por qué existe:** el juego es team deathmatch y no hay ninguna habilidad de apoyo de equipo. Es una opción de coordinación, no de duelo.

**Contrajuego:** exige estar cerca de los aliados; si el equipo está disperso, no vale nada. No se acumula con otro Ánimo.

**Números iniciales:**

- Radio: 3 u.
- Buff: +12 % velocidad, +10 % defensa.
- Duración: 3 s.
- Cooldown: 40 s.

## Barrera: variantes descartadas o avanzadas

### Reducción de daño temporal

−50/60 % durante 2 s. Es la más simple de implementar, pero es binaria y puede frustrar. Si se usa, que sea con duración corta y penalización de velocidad.

### Barrera direccional

−70 % de daño frontal, 0 % por la espalda. Encaja mucho con el sistema de `facing`, pero es dura de usar retrocediendo porque el Pokémon gira hacia donde se mueve. Dejarla como variante avanzada o habilidad de un Pokémon concreto, no como instinto común inicial.

### Reglas comunes a cualquier barrera

- No bloquea control.
- No se apila con buffs de defensa hasta volverse invulnerabilidad.
- Cap de reducción del 60-65 %.
- VFX visible y sonido claro.

## Dash: variantes y errores a evitar

- **No dar i-frames largos.** Como máximo 0,1 s al inicio.
- **No permitir cancelar `windup` o recuperación.** Si no, se convierte en animation-cancel obligatorio.
- **No escalar la distancia con la velocidad.** Puede romper el mapa.
- **No atravesar paredes.** El dash de kit tampoco lo hace.
- **No hacerlo mejor que los dash existentes.** Si el común es más largo o más rápido, las habilidades de movilidad del kit pierden sentido.

## Topes y reglas de balance

| Regla | Límite |
|---|---|
| Reducción de daño | ≤ 60-65 % |
| Duración de stealth | ≤ 1,5 s |
| CC duro | ≤ 0,5 s |
| Inmunidad a slow | ≤ 2 s |
| Cooldown mínimo | 18 s |
| Cooldown máximo | 40-45 s |
| Daño relevante | 0 (salvo Trampa, daño bajo fijo) |

## Matriz de contrajuego

| Instinto | Le gana a | Pierde contra |
|---|---|---|
| Protección | Burst, iniciaciones | Control, esperar, ataques sostenidos |
| Impulso | Proyectiles lentos, melee | Control, paredes, daño en área |
| Recuperación | Poke, desgaste | Burst, anti-curación, presión constante |
| Purga | Slows, zonas | Stun, empuje, volver a ralentizar |
| Onda de Choque | Melee, dash de inicio | Rango, proyectiles, área |
| Parada | Melee predecible | Rango, áreas, baitear |
| Manto de Humo | Foco a distancia | Áreas, Detección, atacar lo rompe |
| Detección | Emboscadas, stealth | No aporta en duelo directo |
| Trampa | Zonas, retiradas | Rivales atentos, rangos largos |
| Ánimo | Teamfight | Equipo disperso, duelos |

## Implementación en el proyecto

### Modelo de datos

- Añadir `'common'` a `AbilitySlot` y a `ABILITY_SLOTS` en `src/game/abilities.ts`, o crear un tipo separado `CommonAbilityId`.
- **No meter los instintos en `MOVESETS`.** `MOVESETS` define la identidad del Pokémon; el instinto es una elección de loadout.
- Añadir `commonAbilityId` al loadout o al estado del jugador, con validación de que solo haya uno.
- Reutilizar `AbilityDef` para las que encajen: dash, curación, buff, slow, knockback y área.

### Motor

- **Protección:** añadir `shieldAmount` o `damageReductionTimer` al estado del jugador (`src/game/matchState.ts`) y aplicarlo justo antes de restar vida en `src/game/game.ts` (zona de `target.hp = Math.max(0, target.hp - result.damage)`).
- **Purga:** vaciar `slowEffects` y añadir un `slowImmunityTimer`; recalcular `slowMultiplier`.
- **Parada:** añadir `parryTimer` y comprobarlo al resolver un golpe melee antes de aplicar daño.
- **Manto de Humo:** enganchar `stealthTimer` al sistema de visión/fog (`src/game/vision.ts`); mientras esté activo, el Pokémon no se revela salvo por Detección o daño en área.
- **Detección:** reutilizar la lógica de visión para marcar enemigos visibles durante el tiempo del efecto.
- **Ánimo:** iterar aliados dentro del radio y aplicar buffs temporales.
- **Trampa:** reutilizar el patrón de áreas persistentes (`aoe`) con una entidad propia o un `pendingCast` temporal.

### HUD e input

- Añadir un quinto slot al HUD (`src/ui/MatchHud.tsx`) con su propia tecla y su cooldown.
- Mostrarlo con un color o marco distinto para que no se confunda con las cuatro habilidades del Pokémon.
- En el roster (`src/ui/RosterScreen.tsx`), añadir un selector de instinto por Pokémon con descripción corta y cooldown.

### Respawn

El código actual resetea los cooldowns al reaparecer. Decidir si el instinto también se resetea:

- **Sí:** coherente con el resto y evita ventajas por morir.
- **No:** evita que el instinto defensivo esté siempre disponible al volver a la pelea.

Recomendación inicial: **sí, resetear también**, para que la muerte no sea una forma de «guardar» el instinto.

## Plan de iteración

1. Implementar el slot y las cinco de la lista corta.
2. Medir pick rate y win rate por instinto.
3. Detectar si alguna es obligatoria; si lo es, subir cooldown o bajar potencia.
4. Añadir Parada y Manto de Humo.
5. Valorar Detección, Trampa y Ánimo cuando el equipo juegue coordinado.
6. Revisar si el dash común sigue siendo redundante con los kits.

## Preguntas abiertas

- ¿La elección es por Pokémon o por jugador/partida?
- ¿El instinto se ve en el lobby para el equipo rival?
- ¿Debe resetearse al reaparecer?
- ¿Se permite cambiarlo durante la partida en la base?
- ¿La Trampa puede convivir con las áreas persistentes actuales sin saturar el mapa?

## Resumen

El set debe ser **utilidad pura, cooldowns largos y contrajuego claro**. La primera versión se queda en **Protección, Impulso, Recuperación, Purga y Onda de Choque**. Todo lo demás es ampliación, no requisito. La regla más importante: si un instinto se elige siempre, no es una elección; es un impuesto.
