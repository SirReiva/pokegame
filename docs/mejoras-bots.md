# Mejoras para los bots

Documento de revisión y hoja de ruta para la IA de `src/game/bot.ts` y
`src/game/botNav.ts`. No describe cambios implementados: recoge mejoras
recomendadas, ordenadas por impacto y esfuerzo.

## Diagnóstico

La base de la IA es sólida:

- El bot produce el mismo `DeviceInputSnapshot` que un mando y pasa por
  `stepPlayer`, así que comparte reglas, cooldowns, colisiones y daño con los
  humanos.
- Usa visión compartida por equipo, lectura de tipos, memoria de la última
  posición vista, castigo de `windup` y memoria de objetos.
- Tiene navegación A* sobre una rejilla que rasteriza colliders y agua profunda.
- Separa objetivo, habilidad, movimiento, retirada, regeneración y recogida de
  objetos.

El punto débil no es la arquitectura, sino que **la IA reacciona bien a lo que
ve, pero anticipa poco, no evita peligros ya lanzados y coordina poco**. Las
mejoras con mejor relación impacto/esfuerzo están en darle mejor información
táctica y evaluar mejor las consecuencias de cada decisión.

## Resumen priorizado

| Prioridad | Mejora | Impacto | Esfuerzo |
| --- | --- | --- | --- |
| 1 | Anticipar disparos, haces y áreas | Alto | Bajo |
| 2 | Evitar proyectiles y AoE ya activas | Alto | Medio |
| 3 | Puntuar habilidades con daño real | Alto | Medio |
| 4 | Corregir fugas de información y bugs concretos | Medio | Bajo |
| 5 | Coordinación de equipo | Alto | Medio |
| 6 | Evaluar retirada/agresión con recursos y número de jugadores | Alto | Medio |
| 7 | Movimiento táctico y uso del terreno | Medio | Medio |
| 8 | Dificultad, personalidad y composición de bots | Medio | Bajo |
| 9 | Tests, simulación, debug y rendimiento | Alto a largo plazo | Medio |

---

## 1. Anticipación de disparos y habilidades

### Problema

`aimPoint` (`src/game/bot.ts:2250`) solo adelanta el proyectil por el tiempo de
vuelo:

```ts
const travel =
  def && def.shape === 'projectile' && def.projectileSpeed > 0
    ? distance / def.projectileSpeed
    : 0;
const lead = travel * this.tuning.lead;
```

Pero el proyectil no sale hasta que termina el `windup`. El bot apunta a donde
está el rival ahora, no a donde estará cuando el proyectil exista y llegue.

En las habilidades de área el centro queda fijado al empezar el casteo
(`src/game/game.ts:2258-2288`), así que el bot también debería comprobar la
posición proyectada del rival contra el centro real del área.

### Mejora propuesta

- Para proyectiles, adelantar por `def.windup + distancia / velocidad`.
- Para haces y áreas, adelantar al menos por `def.windup`.
- Para áreas, validar el impacto contra la posición proyectada del objetivo y
  el centro real `caster + facing * range`.
- Añadir error de apuntado por dificultad. Es más natural que un bot falle un
  poco a que tenga visión o reflejos sobrehumanos.
- Tener en cuenta la velocidad actual del objetivo, y opcionalmente una
  estimación sencilla de aceleración.

### Pseudocódigo

```ts
function predictAimPoint(
  self: MatchPlayerState,
  target: MatchPlayerState,
  def: AbilityDef,
  distance: number,
  leadFactor: number
): Vec2 {
  const travel =
    def.shape === 'projectile'
      ? distance / Math.max(1, def.projectileSpeed)
      : 0;
  const totalTime = def.windup + travel;
  return {
    x: target.x + target.vx * totalTime * leadFactor,
    z: target.z + target.vz * totalTime * leadFactor
  };
}
```

Para el área, además:

```ts
// El centro se fija al empezar el windup.
const centerX = self.x + Math.sin(self.facing) * def.range;
const centerZ = self.z + Math.cos(self.facing) * def.range;
const hit = Math.hypot(predicted.x - centerX, predicted.z - centerZ)
  <= def.radius + target.hitRadius;
```

### Criterio de aceptación

- Aumenta la tasa de impactos de proyectiles y áreas contra objetivos en
  movimiento.
- Los bots difíciles no se sienten infalibles: siguen fallando por error de
  apuntado y por reacción.

---

## 2. Bugs y fugas de información concretas

### 2.1 `countEnemiesNear` cuenta enemigos invisibles — ✅ Arreglado

> **Estado: arreglado.** `countEnemiesNear` ahora itera `this.visibleEnemies`
> (visión compartida del equipo) en lugar de todos los `players`, y se
> eliminaron los parámetros `players` que ya no se usaban.

`src/game/bot.ts:2081` iteraba todo `players` sin filtrar por visión:

```ts
for (const player of players) {
  if (!player.alive || player.team === team) continue;
  if (Math.hypot(player.x - x, player.z - z) <= radius + player.hitRadius) {
    count++;
  }
}
```

Eso permitía que un bot valorara mejor un AoE porque había rivales ocultos dentro
del radio. Corregido usando `this.visibleEnemies`, el conjunto de enemigos
visibles del equipo.

### 2.2 `Deseo` no se usa nunca — ✅ Arreglado

> **Estado: arreglado.** El bot ahora tiene una vía de apoyo independiente de
> los ataques: valora las áreas que reviven o curan aliados y las lanza aunque
> no haya un rival a la vista. `Recuperación` suma la curación que reparte a los
> aliados, y su penalización por vida casi llena solo se aplica cuando no cura a
> nadie más.

`scoreAbility` (`src/game/bot.ts:1999`) descartaba habilidades sin `power`,
`healSelf`, `slow`, `buffs`, `shield` ni `dash`:

```ts
const hasEffect =
  def.power > 0 ||
  def.healSelf > 0 ||
  def.slow !== null ||
  def.buffs.length > 0 ||
  def.shield ||
  def.shape === 'dash';
if (!hasEffect) return -Infinity;
```

`Deseo` es un área de soporte que revive aliados caídos y solo tiene
`aoeEffect` (`src/game/abilities.ts:1934`), así que la IA lo ignoraba siempre.
`Recuperación` sí se usaba por su `healSelf`, pero no se valoraba la curación
que repartía a los aliados. Ahora ambas se puntúan por el beneficio real que
aportan a los aliados dentro de su radio.

### 2.3 `findHealSlot` trata `healOnHit` como cura fiable — ✅ Arreglado

> **Estado: arreglado.** `findHealSlot` solo devuelve habilidades cuya curación
> no depende de acertar. `Come Sueños` sigue usándose como ataque, pero ya no se
> elige como cura de huida ni cuenta como recurso para quedarse a recuperar.

`findHealSlot` (`src/game/bot.ts:1951`) devolvía cualquier habilidad con
`healSelf > 0`. `Come Sueños` solo cura si el haz impacta. Usarla para huir
podía gastar la definitiva sin curar nada. Ahora `isReliableHeal` exige
`healSelf > 0` y `!healOnHit`.

### 2.4 `chooseAbility` puede elegir una habilidad con puntuación negativa — ✅ Arreglado

> **Estado: arreglado.** `chooseAbility` devuelve `null` cuando la mejor
> puntuación no supera `MIN_ABILITY_SCORE` (0), así que el bot prefiere seguir
> moviéndose antes que gastar un cooldown en una cura o un buff que no aporta.

`chooseAbility` (`src/game/bot.ts:1961`) se quedaba con la mejor habilidad en
rango aunque todas tuvieran puntuación negativa. Ahora solo elige una opción si
su puntuación es estrictamente positiva.

### 2.5 Los interrupts se lanzan a través de paredes — ✅ Arreglado

> **Estado: arreglado.** `findInterruptSlot` descarta el corte si no hay línea
> de visión hasta el rival, si el trayecto del proyectil/haz/melee queda tapado
> por un collider, o si el golpe no llega antes de que termine el `windup`.
> También pondera `def.accuracy` y devuelve el punto al que hay que apuntar,
> adelantado con el factor de dificultad del bot.

`findInterruptSlot` (`src/game/bot.ts:1091`) comprobaba distancia y tipo, pero no
colliders ni precisión. Ahora añade:

- línea de visión hasta el lanzador rival,
- `def.accuracy`,
- que el proyectil/haz no vaya a quedar bloqueado,
- posición proyectada del rival al terminar el `windup`.

### 2.6 Enemigos invulnerables o con escudo no penalizan — ✅ Arreglado

> **Estado: arreglado.** `updateTarget` penaliza a los rivales protegidos según
> la fracción de daño que pueden evitar: la invulnerabilidad suma la
> penalización máxima mientras dure la gracia y el escudo o los buffs
> defensivos, solo la parte mitigada. En `scoreAbility`, un objetivo invulnerable
> descarta las habilidades ofensivas que llegarían antes de que caduque su
> gracia, se descuenta el daño mitigado y no se gasta la definitiva ni otra
> habilidad grande cuando la mitigación supera el umbral.

`updateTarget` (`src/game/bot.ts:851`) no miraba `invulnerableTimer`,
`damageReductionTimer` ni `buffs`. Un bot podía gastar la definitiva en alguien
que acaba de reaparecer o que está protegido. Ahora añade:

- una penalización al elegir objetivo, proporcional al daño mitigado,
- la invulnerabilidad ponderada por el tiempo de gracia que le queda,
- el descarte de habilidades ofensivas que impactarían durante la gracia,
- el descarte de habilidades grandes si el escudo reduce demasiado el golpe.

### 2.7 Dirección de amenaza de haces — ✅ Arreglado

> **Estado: arreglado.** En `threatFrom`, la rama de haz calcula la dirección y
> el alcance desde la posición actual del lanzador hasta el extremo fijado en
> `pendingCast`, igual que `executeBeam`. Así un haz con `moveWhileWindup`
> esquiva el carril real aunque el lanzador se haya movido durante la carga; en
> los haces estáticos el resultado coincide con el `facing` de siempre.

En `threatFrom`, las ramas de proyectil/haz/dash usaban `enemy.facing`
(`src/game/bot.ts:1017`). Para un haz con `moveWhileWindup`, la dirección
real se recalcula desde la posición actual del lanzador hasta `pending.targetX`
/ `pending.targetZ` (`src/game/abilityExecutors.ts:204-217`). Ahora la amenaza
usa el objetivo fijado del `pendingCast` en lugar del `facing` actual y toma la
distancia hasta ese extremo como alcance real del haz. Los proyectiles y los
dash siguen usando `facing`, porque sus ejecutores no leen `targetX`/`targetZ`.

---

## 3. Evitar peligros ya lanzados — ✅ Arreglado

> **Estado: arreglado.** `game.ts` construye una vez por frame una vista
> compacta de proyectiles en vuelo y áreas persistentes enemigas y se la pasa a
> cada bot. El bot predice el punto de máxima aproximación de cada proyectil,
> sale de las áreas que ya le cubren y no elige puntos de regeneración ni
> trayectos que crucen un charco. Si tiene `Impulso` disponible, puede usarlo
> para completar la huida. El peligro ya lanzado tiene prioridad sobre atacar o
> mantener la posición de combate, pero no sobre interrumpir un windup rival.

### Problema

`updateThreat` (`src/game/bot.ts:921`) solo mira `pendingCast`. No ve:

- proyectiles ya creados,
- áreas persistentes ya activas,
- zonas de daño en el suelo,
- proyectiles que van a impactar en los próximos frames.

El motor ya tiene esa información (`projectiles` y `activeAoes` en
`src/game/game.ts:314-316`); ahora `buildBotHazards` la resume y se la pasa a
cada bot junto con los objetos conocidos.

### Mejora propuesta

Pasar al bot una vista táctica compacta de peligros:

```ts
interface BotHazard {
  kind: 'projectile' | 'aoe' | 'zone';
  x: number;
  z: number;
  radius: number;
  vx?: number;
  vz?: number;
  remaining?: number;
  ownerTeam: Team;
}
```

Con eso, el bot puede:

- salir del área antes del siguiente tick,
- esquivar proyectiles en vuelo,
- usar `Impulso` para escapar,
- no quedarse quieto regenerando dentro de una zona de peligro,
- no mantener la posición de combate dentro de un charco.

### Prioridad

Es probablemente la mejora que más hará que los bots parezcan más listos,
porque hoy pueden comer daño evitable que un humano esquivaría sin pensar.

---

## 4. Evaluar habilidades con daño real

### Problema

`scoreAbility` (`src/game/bot.ts:1990`) usa `def.power` y el multiplicador de
tipo, pero ignora:

- ataque/defensa reales,
- STAB,
- precisión,
- crítico,
- escudos y reducción de daño,
- buffs activos,
- cooldown,
- vida real del objetivo,
- si el golpe es letal.

Ya existe `computeDamage` en `src/game/combat.ts:105`.

### Mejora propuesta

Calcular un daño esperado por habilidad y puntuar:

- daño esperado / cooldown,
- probabilidad de impacto según precisión, distancia y movimiento,
- si es letal o deja al objetivo en rango de remate,
- riesgo del `windup` y del `selfDamage`,
- valor de curar/revivir aliados,
- valor de aplicar control (slow, stun, knockback),
- valor de los buffs según duración y estado actual.

### Ejemplo de criterios

```ts
const expected = computeDamage({
  moveType: def.type,
  category: def.category,
  power: def.power,
  attacker: self.combat,
  defender: target.combat,
  attackerTypes: self.types,
  defenderTypes: target.types,
  attackMultiplier: buffMultiplier(self, 'attack'),
  defenseMultiplier: buffMultiplier(target, 'defense'),
  critical: false,
  randomFactor: 0.925
});

const accuracy = def.accuracy > 0 ? def.accuracy / 100 : 1;
const expectedDamage = expected.damage * accuracy;
const lethal = expectedDamage >= target.hp;
```

### Efectos esperados

- Los bots rematan mejor.
- No desperdician la definitiva en un objetivo con escudo.
- Eligen habilidades de estado cuando aportan algo real.
- Dejan de valorar una habilidad de 4× solo por el multiplicador si su potencia
  o precisión son malas.

---

## 5. Coordinación de equipo

### Estado actual

`BotSquad` (`src/game/bot.ts:259`) solo guarda un foco compartido:

```ts
export interface BotFocus {
  slot: number | null;
  until: number;
}

export interface BotSquad {
  blue: BotFocus;
  red: BotFocus;
}
```

Es un buen inicio, pero se queda corto.

### Problemas

- Cualquier bot puede sobrescribir el foco cada 2 s.
- El foco puede apuntar a un enemigo inmune para ese bot.
- No hay memoria compartida de última posición vista.
- No hay llamada de “retirarse” o “atacar”.
- Todos los bots con poca vida pueden perseguir la misma poción.
- Varios bots pueden gastar la definitiva en el mismo rival de 10 PV.

### Mejora propuesta

Extender `BotSquad` con:

- posiciones vistas por el equipo y su antigüedad,
- contador de aliados/rivales vivos,
- objetivos reclamados (foco, pociones, aliado a revivir),
- una votación o un líder que fije el foco,
- compromiso de daño por objetivo para no sobrematar,
- llamada de retirada cuando el equipo está en inferioridad,
- llamada de ayuda si un aliado está bajo de vida o siendo perseguido.

### Diseño sugerido

```ts
interface BotSquad {
  blue: TeamBlackboard;
  red: TeamBlackboard;
}

interface TeamBlackboard {
  focus: BotFocus;
  lastSeen: Map<number, { x: number; z: number; at: number }>;
  aliveAllies: number;
  aliveEnemies: number;
  pickupClaims: Map<string, { slot: number; until: number }>;
  engageCall: 'engage' | 'retreat' | 'group';
  committedDamage: Map<number, number>;
}
```

### Criterio de aceptación

- Dos bots no persiguen la misma poción si otro está más cerca o tiene más vida
  que recuperar.
- El foco no cambia cada frame.
- Los bots no apilan tres definitivas sobre el mismo objetivo.

---

## 6. Retirada y evaluación de peleas

### Problema

La retirada actual usa umbrales fijos de vida y un temporizador de 6 s
(`src/game/bot.ts:70-139`, `src/game/bot.ts:1150`). No tiene en cuenta:

- si el bot está en inferioridad numérica,
- si el rival tiene habilidades clave en cooldown,
- si el bot tiene escudo, curación o poción,
- si puede escapar o si le van a perseguir,
- la distancia real a la base,
- el daño esperado del rival.

### Mejora propuesta

Evaluar la pelea como un intercambio:

- tiempo estimado para matar al rival,
- tiempo estimado para que el rival mate al bot,
- vida efectiva con escudos, curas y pociones,
- ventaja numérica,
- cooldowns clave del rival,
- distancia a cobertura/base,
- probabilidad de escape.

### Umbrales dinámicos

- Tanques: retirarse más tarde.
- Cristales: retirarse antes.
- Bots con escudo/curación: aceptar peleas algo peores.
- Bots sin recursos: evitar peleas parejas.
- Si el equipo tiene ventaja numérica: ser más agresivo.
- Si el equipo está en inferioridad: agruparse o retirarse.

### Temporizador de huida

En vez de un `retreatUntil` fijo de 6 s, calcular:

```ts
const timeToBase = distanceToBase / effectiveSpeed;
const retreatTime = timeToBase + margen;
```

Y no dar la huida por terminada si el perseguidor sigue cerca.

---

## 7. Movimiento táctico y uso del terreno

### 7.1 Distancia de combate

`preferredRange` (`src/game/bot.ts:2217`) solo mira la habilidad seleccionada.
Añadir las amenazas del rival:

- si el enemigo tiene un melee peligroso, mantener distancia,
- si tiene un haz, no quedarse en la línea,
- si está ralentizado, ser más agresivo,
- si tiene habilidades clave en cooldown, acercarse,
- si el bot está ralentizado, no intentar kite imposible.

### 7.2 Terreno

`BotNavGrid` trata todas las celdas transitables igual. Añadir coste por celda:

- velocidad según tipo del bot,
- ocultación para romper línea de visión,
- evitar agua profunda o terreno hostil,
- preferir hierba alta para emboscar o retirarse.

### 7.3 Patrulla

`pickSearchPoint` (`src/game/bot.ts:1568`) elige puntos aleatorios del mapa.
Puede provocar que varios bots se junten o que cubran mal el mapa. Una influencia
de equipo o un reparto de zonas daría una patrulla más creíble.

### 7.4 Cobertura

Durante la huida, el bot va a la base o a una poción. Podría usar la cobertura
más cercana para romper línea de visión, igual que ya hace al regenerar.

---

## 8. Dificultad, personalidad y composición

### 8.1 Dificultad

Difícil y experto tienen `visionFactor > 1` y reacciones de 0,08 y 0,03 s
(`src/game/bot.ts:105-138`). Eso se siente más “tramposo” que “inteligente”.

Mejor:

- mantener visión y reacción en rangos humanos,
- subir dificultad con predicción, coordinación, uso de coberturas y evaluación
  de daño,
- añadir un pequeño error de apuntado y de decisión incluso en experto.

### 8.2 Personalidad

Dar a cada bot un perfil:

- agresivo,
- cauto,
- tirador,
- zonificador,
- soporte,
- cazador de heridos.

Variar:

- umbral de retirada,
- avaricia por cooldowns,
- distancia preferida,
- probabilidad de perseguir,
- uso de habilidades de control.

### 8.3 Composición

`makeBotPlayer` (`src/session/SessionProvider.tsx:70`) elige Pokémon al azar
uniforme. Eso permite duplicados y equipos sin roles.

Mejor:

- elegir por arquetipo,
- evitar especies repetidas,
- hacer counterpick contra los tipos rivales,
- escoger el instinto común según el kit:
  - tanque → Protección,
  - asesino → Impulso,
  - sustain → Regeneración.

También se pueden aleatorizar skins y nombres para dar variedad visual.

---

## 9. Ingeniería, tests y rendimiento

### 9.1 Simulación headless

No hay script de test en `package.json`. Antes de seguir ajustando la IA,
montaría una simulación con bots enfrentándose y métricas:

- tiempo atascado,
- habilidades lanzadas/impactadas,
- cooldowns desperdiciados,
- KOs y muertes,
- eficiencia de pociones,
- errores de ruta,
- tiempo en rango de objetivo,
- daño evitable recibido.

### 9.2 Overlay de debug

Añadir una vista de depuración con:

- objetivo actual,
- destino,
- ruta,
- amenaza,
- estado (`retreat`, `recovering`, `patrol`),
- habilidad elegida y motivo,
- última posición vista.

Esto vale más que cualquier ajuste a ciegas.

### 9.3 Refactor

`src/game/bot.ts` tiene ~2.500 líneas. No haría una reescritura grande; extraería
módulos de forma incremental:

- percepción,
- navegación,
- combate,
- objetos,
- retirada/regeneración,
- tuning.

Cada módulo con funciones puras y tests.

### 9.4 Rendimiento de navegación

`BotNavGrid.findPath` (`src/game/botNav.ts:162`) asigna arrays y un heap en cada
llamada:

```ts
const gScore = new Float32Array(total);
const cameFrom = new Int32Array(total);
const closed = new Uint8Array(total);
const open = new MinHeap();
```

Con 8 bots hay bastante presión de GC. Conviene:

- reutilizar buffers,
- cachear rutas por frame,
- usar un heap indexado sin objetos,
- limitar el presupuesto de pathfinding por frame.

### 9.5 Visibilidad compartida

`updateTarget` (`src/game/bot.ts:803`) recalcula visibilidad para cada
bot × enemigo × aliado. `src/game/game.ts` ya calcula la visión del equipo.

Opciones:

- calcular una vez por frame y pasar una vista táctica,
- cachear líneas de visión por par de jugadores,
- mantener el factor de visión por dificultad solo para el propio bot.

### 9.6 Rutas inalcanzables

Si A* no llega, `followPath` acaba yendo en línea recta al destino
(`src/game/bot.ts:2320`), lo que produce el clásico bot empujando una pared.

Mejor devolver un estado “inalcanzable” y:

- cambiar de objetivo,
- buscar un punto alternativo,
- descartar la poción,
- volver a patrullar.

### 9.7 Fachada de percepción

Ahora el bot recibe todos los `matchPlayers` y podría leer estado no visible.
Una interfaz `BotWorldView` con solo lo visible/recordado:

- evita trampas accidentales,
- facilita los tests,
- documenta qué información tiene la IA.

### 9.8 RNG reproducible

Los bots usan `Math.random()` en muchas decisiones. Inyectar un RNG con semilla:

- permite reproducir bugs,
- permite comparar tuning,
- permite tests deterministas.

---

## 10. Plan de trabajo recomendado

### Fase 1 — Instrumentación

- Overlay de debug.
- Simulación headless.
- Métricas básicas.
- RNG con semilla.

### Fase 2 — Percepción y puntería

- Predicción de proyectiles/haces/áreas.
- Evitación de proyectiles y AoE activas.
- Corrección de `countEnemiesNear`.
- Memoria por enemigo.
- Penalización de invulnerables/escudos.

### Fase 3 — Evaluación de combate

- Daño esperado con `computeDamage`.
- Puntuación por cooldown y precisión.
- Remates.
- Habilidades de soporte y revive.
- `findHealSlot` con `healOnHit`.

### Fase 4 — Equipo

- Blackboard de equipo.
- Foco estable.
- Reclamo de pociones.
- Llamadas de engage/retreat.
- Evitar sobrematar.

### Fase 5 — Movimiento y personalidad

- Rangos basados en amenazas.
- Coste de terreno.
- Patrulla distribuida.
- Perfiles de personalidad.
- Composición de bots por rol.

### Fase 6 — Rendimiento y limpieza

- Buffers de A*.
- Visibilidad cacheada.
- Rutas inalcanzables.
- Refactor incremental de `bot.ts`.

---

## 11. Criterios de aceptación globales

- Los bots esquivan al menos una parte de los proyectiles y áreas evidentes.
- La tasa de impactos de proyectiles y áreas sube sin volverlos infalibles.
- No gastan la definitiva en objetivos invulnerables o con escudo alto.
- No se quedan empujando paredes para llegar a objetos inalcanzables.
- No se apilan varios bots en el mismo destino ni persiguiendo la misma poción.
- Las retiradas terminan cuando el peligro desaparece, no por un temporizador
  ciego.
- Los bots difíciles se sienten más listos, no más tramposos.
- La simulación permite comparar dos versiones de tuning con métricas.

---

## 12. Lo que ya está bien

- El input virtual compartido con humanos es una decisión excelente.
- La visión compartida por equipo y la memoria de objetos están bien separadas.
- El uso de la tabla de tipos y de los `windup` rivales da profundidad.
- La navegación con rejilla rasterizada evita depender de raycasts contra mallas.
- La separación de estados (`retreat`, `recovering`, `patrol`) es clara.
- El código está muy comentado y las intenciones de diseño se entienden.

---

## Nota

Este documento es una propuesta. No se ha modificado ningún archivo de lógica de
juego. Si se empieza a implementar, conviene hacerlo en el orden del apartado 10
y mantener cada fase detrás de métricas de la simulación.
