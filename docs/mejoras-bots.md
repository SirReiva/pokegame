# Mejoras para los bots

Documento de revisión y hoja de ruta para la IA de `src/game/bot.ts` y
`src/game/botNav.ts`. Recoge las mejoras ya implementadas (marcadas como ✅) y
las que siguen pendientes, ordenadas por impacto y esfuerzo. La sección 13
conserva la revisión crítica que originó esta puesta al día.

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

El punto débil original no era la arquitectura, sino que **la IA reaccionaba
bien a lo que veía, pero anticipaba poco, no evitaba peligros ya lanzados y
coordinaba poco**. Las mejoras con mejor relación impacto/esfuerzo estaban en
darle mejor información táctica y evaluar mejor las consecuencias de cada
decisión; la mayoría ya están implementadas.

## Resumen priorizado

| Prioridad | Sección | Mejora | Estado | Impacto | Esfuerzo |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | Anticipar disparos, haces y áreas | ✅ Hecho | Alto | Bajo |
| 2 | 3 | Evitar proyectiles y AoE ya activas | ✅ Hecho | Alto | Medio |
| 3 | 4 | Puntuar habilidades con daño real | ✅ Hecho | Alto | Medio |
| 4 | 2 | Corregir fugas de información y bugs concretos | ✅ Hecho | Medio | Bajo |
| 5 | 5 | Coordinación de equipo | ✅ Hecho | Alto | Medio |
| 6 | 6 | Evaluar retirada/agresión con recursos y número de jugadores | ✅ Hecho | Alto | Medio |
| 7 | 7 | Movimiento táctico y uso del terreno | ✅ Hecho | Medio | Medio |
| 8 | 8 | Dificultad, personalidad y composición de bots | 🟡 Parcial | Medio | Bajo |
| 9 | 9 | Tests, simulación, debug y rendimiento | 🟡 Parcial | Alto a largo plazo | Medio |

La columna «Sección» enlaza cada mejora con su apartado; la prioridad conserva
el orden original de impacto y esfuerzo.

---

## 1. Anticipación de disparos y habilidades — ✅ Arreglado

> **Estado: arreglado.** `predictTarget` adelanta al rival por el `windup` más
> el tiempo de vuelo del proyectil, con una segunda pasada para corregir la
> distancia. Haces, áreas y melee usan al menos el `windup`. Las áreas validan
> el impacto contra la posición prevista y el centro real que fijará el motor,
> incluido el recorte por obstáculos. Cada dificultad tiene además un error
> angular de apuntado estable durante unos frames: los bots difíciles fallan
> poco, pero ya no tienen puntería perfecta.

### Problema

`aimPoint` (`src/game/bot.ts`) solo adelantaba el proyectil por el tiempo de
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
(`src/game/game.ts`), así que el bot también debía comprobar la
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

`countEnemiesNear` (`src/game/bot.ts`) iteraba todo `players` sin filtrar por
visión:

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

`scoreAbility` (`src/game/bot.ts`) descartaba habilidades sin `power`,
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
`aoeEffect` (`src/game/abilities.ts`), así que la IA lo ignoraba siempre.
`Recuperación` sí se usaba por su `healSelf`, pero no se valoraba la curación
que repartía a los aliados. Ahora ambas se puntúan por el beneficio real que
aportan a los aliados dentro de su radio.

### 2.3 `findHealSlot` trata `healOnHit` como cura fiable — ✅ Arreglado

> **Estado: arreglado.** `findHealSlot` solo devuelve habilidades cuya curación
> no depende de acertar. `Come Sueños` sigue usándose como ataque, pero ya no se
> elige como cura de huida ni cuenta como recurso para quedarse a recuperar.

`findHealSlot` (`src/game/bot.ts`) devolvía cualquier habilidad con
`healSelf > 0`. `Come Sueños` solo cura si el haz impacta. Usarla para huir
podía gastar la definitiva sin curar nada. Ahora `isReliableHeal` exige
`healSelf > 0` y `!healOnHit`.

### 2.4 `chooseAbility` puede elegir una habilidad con puntuación negativa — ✅ Arreglado

> **Estado: arreglado.** `chooseAbility` devuelve `null` cuando la mejor
> puntuación no supera `MIN_ABILITY_SCORE` (0), así que el bot prefiere seguir
> moviéndose antes que gastar un cooldown en una cura o un buff que no aporta.

`chooseAbility` (`src/game/bot.ts`) se quedaba con la mejor habilidad en
rango aunque todas tuvieran puntuación negativa. Ahora solo elige una opción si
su puntuación es estrictamente positiva.

### 2.5 Los interrupts se lanzan a través de paredes — ✅ Arreglado

> **Estado: arreglado.** `findInterruptSlot` descarta el corte si no hay línea
> de visión hasta el rival, si el trayecto del proyectil/haz/melee queda tapado
> por un collider, o si el golpe no llega antes de que termine el `windup`.
> También devuelve el punto al que hay que apuntar, adelantado con el factor
> de dificultad del bot.

`findInterruptSlot` (`src/game/bot.ts`) comprobaba distancia y tipo, pero no
colliders. Ahora añade:

- línea de visión hasta el lanzador rival,
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

`updateTarget` (`src/game/bot.ts`) no miraba `invulnerableTimer`,
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

En `threatFrom`, las ramas de proyectil/haz/dash usaban `enemy.facing`. Para un
haz con `moveWhileWindup`, la dirección real se recalcula desde la posición
actual del lanzador hasta `pending.targetX` / `pending.targetZ`
(`src/game/abilityExecutors.ts`). Ahora la amenaza
usa el objetivo fijado del `pendingCast` en lugar del `facing` actual y toma la
distancia hasta ese extremo como alcance real del haz. Los proyectiles y los
dash siguen usando `facing`, porque sus ejecutores no leen `targetX`/`targetZ`.

---

## 3. Evitar peligros ya lanzados — ✅ Arreglado

> **Estado: arreglado.** `game.ts` construye una vez por frame una vista
> compacta de proyectiles en vuelo y áreas persistentes enemigas y se la pasa a
> cada bot. El bot predice el punto de máxima aproximación de cada proyectil,
> sale de las áreas que ya le cubren y no elige puntos de regeneración que
> crucen un charco. Si tiene `Impulso` disponible, puede usarlo para completar
> la huida. El peligro ya lanzado tiene prioridad sobre atacar o mantener la
> posición de combate, pero no sobre interrumpir un windup rival.
>
> La comprobación de trayectos (`hazardPathBlocked`) solo se aplica a la
> regeneración: la retirada, las pociones, la patrulla y `followPath` aún no la
> consultan (ver 13.2, punto 3).

### Problema

`updateThreat` (`src/game/bot.ts`) solo miraba `pendingCast` y no veía:

- proyectiles ya creados,
- áreas persistentes ya activas,
- zonas de daño en el suelo,
- proyectiles que van a impactar en los próximos frames.

El motor ya tiene esa información (`projectiles` y `activeAoes` en
`src/game/game.ts`); ahora `buildBotHazards` la resume y se la pasa a cada bot
junto con los objetos conocidos.

### Solución implementada

Se pasa al bot una vista táctica compacta de peligros:

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

Fue probablemente la mejora que más hizo que los bots parecieran más listos,
porque antes podían comer daño evitable que un humano esquivaría sin pensar.

---

## 4. Evaluar habilidades con daño real — ✅ Arreglado

> **Estado: arreglado.** `scoreAbility` usa `computeDamage` con ataque, defensa,
> STAB, efectividad, buffs activos, escudo, crítico medio y factor aleatorio
> medio. Contempla el daño radial y el total de las áreas `overTime`. El daño se
> pondera por la probabilidad de impacto (error de apuntado, distancia
> y velocidad lateral), por la eficiencia de cooldown y por si el golpe es letal
> o deja al rival a remate. También valora control
> (slow/knockback/hitstun), buffs según duración y estado, el riesgo de
> autodaño/windup, la curación `healOnHit` según su probabilidad real y mantiene
> el descarte de habilidades grandes contra objetivos muy mitigados.

### Problema

`scoreAbility` (`src/game/bot.ts`) usa `def.power` y el multiplicador de tipo,
pero ignora:

- ataque/defensa reales,
- STAB,
- crítico,
- escudos y reducción de daño,
- buffs activos,
- cooldown,
- vida real del objetivo,
- si el golpe es letal.

Ya existe `computeDamage` en `src/game/combat.ts`.

### Mejora propuesta

Calcular un daño esperado por habilidad y puntuar:

- daño esperado / cooldown,
- probabilidad de impacto según error de apuntado, distancia y movimiento,
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

const expectedDamage = expected.damage;
const lethal = expectedDamage >= target.hp;
```

### Efectos esperados

- Los bots rematan mejor.
- No desperdician la definitiva en un objetivo con escudo.
- Eligen habilidades de estado cuando aportan algo real.
- Dejan de valorar una habilidad de 4× solo por el multiplicador si su potencia
  es mala.

---

## 5. Coordinación de equipo — ✅ Arreglado

> **Estado: arreglado.** `BotSquad` ahora contiene una pizarra por equipo con
> foco, últimas posiciones vistas, contadores de vivos, reclamaciones de
> pociones y revividos, llamada de retirada/agrupación, ayuda del aliado más
> urgente y daño comprometido. El foco lo fija solo el bot líder y se mantiene
> varios segundos. Las pociones se reclaman con una prioridad común para que no
> las persigan dos bots, y las habilidades grandes descuentan el daño que ya han
> comprometido otros compañeros para no apilar definitivas sobre un rival que ya
> va a caer.

### Estado anterior

`BotSquad` solo guardaba un foco compartido por equipo:

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

Era un buen inicio, pero se quedaba corto.

### Problemas que resolvía

- Cualquier bot puede sobrescribir el foco cada 2 s.
- El foco puede apuntar a un enemigo inmune para ese bot.
- No hay memoria compartida de última posición vista.
- No hay llamada de “retirarse” o “atacar”.
- Todos los bots con poca vida pueden perseguir la misma poción.
- Varios bots pueden gastar la definitiva en el mismo rival de 10 PV.

### Diseño implementado

La pizarra por equipo contiene:

- posiciones vistas por el equipo y su antigüedad (`lastSeen`),
- contador de aliados/rivales vivos (`aliveAllies`, `aliveEnemies`),
- objetivos reclamados: foco, pociones, aliados a revivir y zonas de patrulla,
- un líder que fija el foco durante varios segundos,
- compromiso de daño por objetivo para no sobrematar (`committedDamage`),
- llamada de retirada/agrupación cuando el equipo está en inferioridad
  (`engageCall`),
- llamada de ayuda si un aliado está bajo de vida o siendo perseguido (`help`).

```ts
interface TeamBlackboard {
  focus: BotFocus;
  lastSeen: Map<number, { x: number; z: number; at: number }>;
  aliveAllies: number;
  aliveEnemies: number;
  pickupClaims: Map<string, BotPickupClaim>;
  reviveClaims: Map<number, BotReviveClaim>;
  patrolClaims: Map<number, BotPatrolClaim>;
  engageCall: 'engage' | 'retreat' | 'group';
  committedDamage: Map<string, BotDamageCommitment>;
  help: BotHelpCall | null;
}

export type BotSquad = Record<Team, TeamBlackboard>;
```

### Criterio de aceptación

- Dos bots no persiguen la misma poción si otro está más cerca o tiene más vida
  que recuperar.
- El foco no cambia cada frame.
- Los bots no apilan tres definitivas sobre el mismo objetivo.

---

## 6. Retirada y evaluación de peleas — ✅ Arreglado

> **Estado: arreglado.** `assessFight` estima el tiempo para matar y para morir
> con el daño esperado de ambos, la vida efectiva con curas/escudo/poción, la
> ventaja numérica, los cooldowns pendientes, la velocidad de escape y la
> distancia a la base. El umbral de retirada es dinámico: los tanques aguantan
> más, los cristales huyen antes, los recursos permiten aceptar peleas peores y
> la inferioridad numérica vuelve al bot más prudente. El temporizador ya no es
> fijo: se calcula desde el trayecto hasta la base o la poción, con margen, y se
> extiende si el perseguidor sigue cerca.

### Problema

La retirada usaba umbrales fijos de vida y un temporizador de 6 s. No tenía en
cuenta:

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

## 7. Movimiento táctico y uso del terreno — ✅ Arreglado

> **Estado: arreglado.** `preferredRange` se ajusta con las amenazas listas del
> rival: mantiene distancia fuera del melee, se aparta de la línea de un haz,
> se vuelve más agresivo si el rival está ralentizado o sin habilidades clave,
> y no intenta kite cuando el bot está ralentizado y es más lento. La
> navegación A* ahora pondera el coste del terreno por tipo de Pokémon, evita
> terreno hostil y prefiere cobertura al huir. La patrulla reparte zonas entre
> aliados, y durante la retirada se busca un punto cercano de cobertura que
> rompa la línea de visión antes de seguir hacia la base.

### 7.1 Distancia de combate — ✅ Arreglado

`preferredRange` (`src/game/bot.ts`) solo miraba la habilidad seleccionada.
Añadir las amenazas del rival:

- si el enemigo tiene un melee peligroso, mantener distancia,
- si tiene un haz, no quedarse en la línea,
- si está ralentizado, ser más agresivo,
- si tiene habilidades clave en cooldown, acercarse,
- si el bot está ralentizado, no intentar kite imposible.

### 7.2 Terreno — ✅ Arreglado

`BotNavGrid` trata todas las celdas transitables igual. Añadir coste por celda:

- velocidad según tipo del bot,
- ocultación para romper línea de visión,
- evitar agua profunda o terreno hostil,
- preferir hierba alta para emboscar o retirarse.

### 7.3 Patrulla — ✅ Arreglado

`pickSearchPoint` (`src/game/bot.ts`) elegía puntos aleatorios del mapa.
Podía provocar que varios bots se juntaran o que cubrieran mal el mapa. Una influencia
de equipo o un reparto de zonas daría una patrulla más creíble.

### 7.4 Cobertura — ✅ Arreglado

Durante la huida, el bot va a la base o a una poción. Podría usar la cobertura
más cercana para romper línea de visión, igual que ya hace al regenerar.

---

## 8. Dificultad, personalidad y composición

### 8.1 Dificultad — ✅ Arreglado

> **Estado: arreglado.** Difícil y experto usan `visionFactor: 1` y reacciones
> de 0,2 y 0,16 s, en rango humano. La dificultad se expresa con predicción
> (`lead`), castigo de windups, memoria, coordinación y evaluación de daño.
> También hay error de apuntado (`aimError`) y error de decisión
> (`decisionError`): el bot puede elegir una acción viable peor que la mejor,
> con menos probabilidad en experto. Los cooldowns rivales se estiman desde los
> lanzamientos observados y la invulnerabilidad se trata como estado, sin leer
> cuántos segundos le quedan.

- visión y reacción en rangos humanos,
- error de apuntado y de decisión por dificultad,
- cooldowns rivales estimados e invulnerabilidad sin temporizador exacto,
- dificultad apoyada en predicción, castigo, memoria y evaluación de daño.

La fachada de percepción completa (`BotWorldView`) sigue pendiente en 9.5; lo
que quedaba de 8.1 ya está aplicado.

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

`ensureUniqueTeamPokemon` (`src/session/SessionProvider.tsx`) da prioridad a
los humanos: conserva sus especies y, después, asigna a los bots las que
quedan libres en cada equipo. Ya no hay duplicados y los humanos pueden
quitarle una especie a un bot en cualquier momento, pero los equipos siguen
sin roles.

Mejor:

- elegir por arquetipo,
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

`src/game/bot.ts` tiene ~4.400 líneas. No haría una reescritura grande; extraería
módulos de forma incremental:

- percepción,
- navegación,
- combate,
- objetos,
- retirada/regeneración,
- tuning.

Cada módulo con funciones puras y tests.

### 9.4 Rendimiento de navegación — ✅ Hecho

> **Estado: arreglado.** `BotNavGrid` reserva una sola vez los buffers de A*
> (`gScore`, `cameFrom`, `closed`, coste por celda y marcas de visita) y los
> invalida con `visitStamp` en lugar de reasignarlos o limpiarlos enteros en cada
> ruta. La cola es un heap indexado con decrease-key, sin objetos por nodo. Se
> cachea la última ruta del frame y se reparte un presupuesto de 24.000
> expansiones por frame, reiniciado desde `game.ts` antes de actualizar a los
> bots.

Antes cada `findPath` asignaba cuatro arrays y un heap nuevo:

```ts
const gScore = new Float32Array(total);
const cameFrom = new Int32Array(total);
const closed = new Uint8Array(total);
const open = new MinHeap();
```

Con 8 bots eso generaba bastante presión de GC. Ahora:

- se reutilizan buffers,
- se cachean rutas por frame,
- el heap es indexado y sin objetos,
- el pathfinding tiene un presupuesto por frame.

### 9.5 Visibilidad y fugas de información — ✅ Hecho

> **Estado: arreglado.** `game.ts` ya calculaba `visibleByTeam` una vez por
> frame para la niebla y la histéresis; ahora ese mismo conjunto se pasa a cada
> bot como `BotWorldView.visibleSlots`. `updateTarget` dejó de recorrer todos los
> aliados por cada rival, así que la visibilidad no se recalcula bot × enemigo ×
> aliado. El factor de visión por dificultad se guarda en el jugador
> (`visionFactor`) y se aplica solo en el observador que lo posee.
>
> Las fugas de estado se redujeron en 8.1: los cooldowns rivales se estiman
> desde lanzamientos observados y la invulnerabilidad se trata como estado
> activo/inactivo. Los buffs, el escudo y el respawn de aliados se leen como
> estados visibles en el HUD, no como temporizadores ocultos.

Antes `updateTarget` recalculaba visibilidad para cada
bot × enemigo × aliado, aunque `src/game/game.ts` ya resolvía la visión del
equipo. El bot también leía directamente cooldowns, timers y buffs del rival.
La vista táctica elimina el primer coste y las estimaciones de 8.1 reducen el
segundo.

### 9.6 Rutas inalcanzables — ✅ Hecho

> **Estado: arreglado.** `findPath` devuelve `NavPathResult` con estado
> `ok`, `unreachable` o `budget`. `followPath` distingue los tres: si A* agota
> el mapa sin llegar, abandona el destino, descarta la poción y su reclamación,
> limpia la última posición perseguida y vuelve a patrullar. Si solo se agotó el
> presupuesto del frame, conserva la ruta parcial y reintenta más tarde. Durante
> una huida no se cambia a patrulla: se descarta la poción inalcanzable y se
> sigue la ruta parcial hacia la base.

Antes, si A* no llegaba, `followPath` acababa yendo en línea recta al destino,
lo que producía el clásico bot empujando una pared.

### 9.7 Fachada de percepción — 🟡 Parcial

> **Estado: parcial.** `BotWorldView` ya existe para la visión compartida
> (9.5), pero el bot todavía recibe todos los `matchPlayers` para el resto del
> estado. Falta envolver cooldowns, buffs, timers y respawn en esa vista.

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

### Fase 1 — Instrumentación — ⏳ Pendiente

- Overlay de debug.
- Simulación headless.
- Métricas básicas.
- RNG con semilla.

### Fase 2 — Percepción y puntería — ✅ Hecho

- Predicción de proyectiles/haces/áreas.
- Evitación de proyectiles y AoE activas.
- Corrección de `countEnemiesNear`.
- Memoria por enemigo.
- Penalización de invulnerables/escudos.

### Fase 3 — Evaluación de combate — ✅ Hecho

- Daño esperado con `computeDamage`.
- Puntuación por cooldown y probabilidad de impacto.
- Remates.
- Habilidades de soporte y revive.
- `findHealSlot` con `healOnHit`.

### Fase 4 — Equipo — ✅ Hecho

- Blackboard de equipo.
- Foco estable.
- Reclamo de pociones.
- Llamadas de engage/retreat.
- Evitar sobrematar.

### Fase 5 — Movimiento y personalidad — 🟡 Parcial

- Rangos basados en amenazas. ✅
- Coste de terreno. ✅
- Patrulla distribuida. ✅
- Perfiles de personalidad. ⏳
- Composición de bots por rol. ⏳

### Fase 6 — Rendimiento y limpieza — 🟡 Parcial

- Buffers de A*. ✅
- Visibilidad cacheada. ✅
- Rutas inalcanzables. ✅
- Refactor incremental de `bot.ts`. ⏳

Las fases 1 y 6, y los puntos de personalidad y composición de la fase 5, siguen
abiertos. La sección 13.2 recoge además fallos detectados en la revisión
(geometría de amenazas, colisiones, peligros en pathfinding y fugas de
información) que conviene abordar antes de seguir con el tuning.

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

## 13. Revisión crítica del documento y del código

> Revisión realizada el 2026-11-07 sobre `src/game/bot.ts` (~4.400 líneas).
> Las referencias de línea de esta sección corresponden a esa revisión; el resto
> del documento usa nombres de función para no quedar obsoleto. No implica
> cambios de lógica de juego.

### 13.1 Problemas del propio documento

> **Estado: resuelto.** Se corrigieron la introducción, la tabla resumen y las
> referencias de línea; también se actualizaron las secciones 3, 5, 8.1, 9.5 y
> 10. La lista siguiente se conserva como registro de lo detectado.

- **Contradicción de estado**: la introducción decía que el documento “no
  describe cambios implementados”, pero las secciones 1–7 están marcadas como
  hechas.
- **Tabla resumen incoherente**: solo marcaba como hechas las mejoras 5 y 7,
  mientras las secciones 1, 2, 3, 4 y 6 también lo están. Además, la prioridad 4
  de la tabla (“bugs concretos”) corresponde a la sección 2, no a la 4.
- **Referencias de línea obsoletas** (ya sustituidas por nombres de función).
  Ejemplos:
  - `aimPoint`: documento 2250 → real ~4094.
  - `countEnemiesNear`: 2081 → ~3719.
  - `scoreAbility`: 1999 → ~3559.
  - `findHealSlot`: 1951 → ~3159.
  - `findInterruptSlot`: 1091 → ~1670.
  - `updateTarget`: 851 → ~1155.
  - `threatFrom`: 1017 → ~1371.
  - `pickSearchPoint`: 1568 → ~2676.
  - `followPath`: 2320 → ~4170.
- **La sección 5 describía un “estado actual” que ya no existía**: el blackboard
  con foco, posiciones compartidas, reclamaciones, llamada de ayuda y daño
  comprometido ya está implementado.
- **La sección 8.1 estaba desactualizada**: decía que a los difíciles les falta
  error de apuntado, pero `aimError` ya existe en `TUNING`.
- **La sección 3 sobrevendía la evitación de peligros**: afirmaba que el bot no
  elige trayectos que crucen un charco. En su momento `hazardPathBlocked` solo
  se usaba en `regenPointSafe`; ahora A* incorpora coste de peligros y la
  retirada, las pociones, la patrulla y `followPath` lo consultan.
- **La sección 9.5 se quedaba corta**: además de la visibilidad, el bot leía
  cooldowns exactos, buffs, timers de invulnerabilidad/escudo y
  `enemiesSeeing`. Era una fuga de información mayor que la que sugería el
  documento.
- **La sección 10 seguía planificando como pendientes cosas ya hechas**
  (`countEnemiesNear`, predicción, memoria por enemigo, etc.).

### 13.2 Fallos de la IA no recogidos — ✅ Resuelto

> **Estado: resuelto.** Se corrigieron la geometría de amenazas, las colisiones
> de línea de tiro, los peligros en pathfinding, los windups tras muros, las
> posiciones de enemigos muertos, el sesgo de `assessFight`, `retreatTime`,
> `Deseo` y los puntos de prioridad baja. La histéresis y las fugas de
> información ya quedaron cubiertas en 9.5 y 8.1. El texto siguiente se conserva
> como registro de los fallos detectados.

#### Prioridad alta

**1. La geometría de las amenazas no coincide con la del motor**

`threatFrom` (`bot.ts:1371`) usaba aproximaciones más estrechas que las
comprobaciones reales:

- **Melee**: usaba `def.range + selfRadius + 0.2` y `halfAngle + 0.12`. El motor
  usa `def.range + maxHitRadius() + target.hitRadius` y añade el radio angular
  del cuerpo (`abilityExecutors.ts:119-171`).
- **Haz**: usaba `selfRadius + 0.25`. El motor usa
  `def.radius + maxHitRadius() + target.hitRadius`
  (`abilityExecutors.ts:258-269`).
- **Área**: usaba `def.radius + selfRadius + 0.1`. El motor usa
  `def.radius + maxHitRadius() + target.hitRadius` (`game.ts:2687-2688`).
- **Dash**: usaba `selfRadius + 0.25` y `def.dashDistance`. El motor usa
  `max(0.5, def.radius) + target.hitRadius` y recorta la distancia por colliders
  (`game.ts:1897-1914`).
- **Proyectil**: usaba `selfRadius + 0.5`; el motor usa
  `def.radius + target.hitRadius` (`game.ts:3421`).

Consecuencia: los bots no reaccionaban hasta estar casi en el centro del
área/línea, y con haces o dashes podían recibir golpes en el borde que deberían
haber esquivado. Se cerró usando en `threatFrom` los mismos primitivos del motor
(`sectorOverlapsCircle`, `raycastColliderDistance`, `pointSegmentDistance` y
`segmentBlockedByColliders`).

**2. Los ataques pueden lanzarse contra colliders que sí bloquean el golpe**

En `drive` (`bot.ts:2918-2925`) la línea de tiro se comprobaba con
`lineOfSightBlocked`, que **solo mira colliders con `sightRadius`** (árboles,
montañas). El pedestal de base (`world.ts:4081-4086`) no tiene `sightRadius`,
pero sí bloquea proyectiles y melee.

Además, `canHitPrediction` (`bot.ts:3739`) no comprobaba colliders para
proyectiles, melee ni dash.

Resultado: el bot podía gastar una habilidad contra una base o un obstáculo bajo
y el motor la anulaba. Ahora `canHitPrediction` usa
`segmentBlockedByColliders` con el padding de cada forma y `drive` ya no acepta
solo la línea de visión.

**3. La evitación de peligros es reactiva, no de ruta**

`hazardPathBlocked` (`bot.ts:1644`) solo se usaba al elegir punto de
regeneración. No se usaba en:

- `pickRetreatCover` (`bot.ts:2233`),
- `pickupTarget` (`bot.ts:2517`),
- `pickSearchPoint` (`bot.ts:2676`),
- `followPath` (`bot.ts:4170`),
- la persecución de `lastSeen`.

Por eso un bot podía atravesar un charco de veneno o un área persistente para
llegar a una poción, una cobertura o una posición recordada. Ahora A* recibe los
peligros persistentes con coste adicional, la simplificación de ruta no corta a
través de ellos y los destinos directos se descartan si cruzan un área.

#### Prioridad media

**4. La histéresis de visión se aplica al objetivo actual, no por enemigo u
observador**

> **Corregido en 9.5.** Los bots consumen el `visibleByTeam` que `game.ts`
> calcula una vez por frame, con histéresis de equipo por observador.

En `updateTarget` (`bot.ts:1179`):

```ts
const wasVisible = this.target === enemy && this.targetVisible;
```

Ese `wasVisible` se pasa a `isTargetVisible` para **todos los aliados**
(`bot.ts:1183-1200`). Dos problemas:

- Un enemigo recién visto puede parpadear en el borde del radio porque no recibe
  histéresis.
- Si el bot está apuntando a un enemigo, ese enemigo recibe histéresis extra en
  la visión de todos los aliados, aunque ese aliado nunca lo haya visto.

Debería mantenerse un `Set` de enemigos visibles en el frame anterior, o calcular
la histéresis por observador.

**5. Se reacciona a windups que están detrás de una pared para el propio bot**

`updateThreat` (`bot.ts:1362`) recorría `visibleEnemies`, que es visión
compartida del equipo, y leía `enemy.pendingCast`. `threatFrom` no comprobaba si
había un collider entre el rival y el bot.

Así, un bot podía intentar esquivar o interrumpir una habilidad que, desde su
posición, estaba tapada por un muro. `findInterruptSlot` sí comprobaba colliders,
pero el movimiento de evasión no. Ahora `threatFrom` comprueba la geometría y los
colliders de cada forma antes de declarar la amenaza.

**6. Fugas de información más allá de la visibilidad**

> **Corregido (8.1 + 9.5).** Los cooldowns rivales se estiman desde los
> lanzamientos observados, la invulnerabilidad se trata como estado y la
> visibilidad compartida se calcula una vez por frame en `BotWorldView`. Las
> lecturas que quedan son estados visibles en el HUD (buffs, escudo, respawn de
> aliados), no temporizadores ocultos.

El documento habla de una futura `BotWorldView`; en el momento de la revisión
el bot leía directamente:

- `enemy.cooldowns` en `enemyThreatProfile`,
- cooldowns y habilidades de curación del rival en `effectiveHp`,
- `target.invulnerableTimer`, `damageReductionTimer`, `buffs`,
- `self.enemiesSeeing` en `regenSafe`,
- `ally.respawnTimer` exacto.

Eso hacía que los bots difíciles no solo fueran “más inteligentes”: sabían cosas
que un humano no puede consultar con precisión. Para la sección 8.1, esto era
tan importante como `visionFactor`.

**7. Los bots persiguen enemigos muertos**

`team.lastSeen` se actualizaba al ver enemigos (`bot.ts:1205`), pero solo se
borraba por antigüedad (`bot.ts:906-910`). Si un enemigo moría, su última
posición seguía hasta 8 segundos y `squadLastSeen` (`bot.ts:1348`) podía enviar a
un bot a investigar el cadáver. `this.lastSeen` del objetivo tampoco se limpiaba
al morir el rival. Ahora ambas memorias se borran en cuanto el rival cae.

**8. `assessFight` está sesgado por la dificultad del propio bot**

`bestDamagePerSecond` calculaba también el DPS del rival (`bot.ts:2106-2135`),
pero usaba `predictTarget`, que aplica `this.tuning.lead` (`bot.ts:4080`). Es
decir, un bot fácil creía que el rival también adelantaba mal, y uno experto creía
que el rival adelantaba perfectamente.

Además, el ciclo de daño (`bot.ts:2132`) ignoraba el `windup` de la habilidad. Un
bot con habilidades lentas sobreestimaba su DPS y podía aceptar peleas que no
debía. Ahora el DPS entrante usa adelanto pleno y el ciclo suma el `windup`.

**9. `retreatTime` mide en línea recta**

`retreatTime` (`bot.ts:2216`) usaba `Math.hypot` hasta la base o la poción. No
usaba la longitud de la ruta ni el coste del terreno, así que en mapas con
obstáculos la huida podía darse por terminada antes de llegar. Ahora mide la
longitud de la ruta que devuelve A* y solo cae al trayecto recto si no hay ruta
completa.

**10. `Deseo` tiene una inconsistencia bot/motor**

> **Corregido.** El motor ya comprueba `lineOfSight` en `reviveAoeAlly` y el bot
> usa la misma comprobación con `segmentBlockedByColliders`. Además, el bot
> descarta aliados que reaparecerán antes de terminar el `windup` de `Deseo`
> (`respawnTimer <= def.windup + 0.15`).

`supportScore` y `claimSupportRevives` (`bot.ts:3286`, `bot.ts:3240`) exigían
línea de visión para revivir. El callback de `Deseo`
(`abilities.ts:1945-1949`) revive a todos los `fallenAllies`; el motor pasó a
bloquear el revive si el marcador no tiene línea de visión, así que ambos lados
coinciden.

#### Prioridad baja — ✅ Resuelta

- **`BotHazard.kind: 'zone'` no se usa**: se eliminó del tipo; solo quedan
  `projectile` y `aoe`.
- **Los interrupts no usan el error de apuntado**: `findInterruptSlot` aplica el
  mismo `aimBiasFor` que un ataque normal.
- **Habilidades `self` solo se valoran si el rival está a ≤8 u**:
  `canHitPrediction` devuelve `true` para `shape === 'self'`, así que los buffs
  propios se usan para prepararse antes de acercarse.
- **No se valora el multi-impacto**: `countExtraAbilityTargets` cuenta conos,
  haces, proyectiles con `pierce`, dash y áreas con la geometría del motor.
- **`overTime` se valora como si el rival se quedara toda la duración dentro**:
  `expectedDamage` estima los ticks esperados según distancia al centro y
  velocidad de salida.
- **`commitPlannedDamage` deja compromisos obsoletos**: cada decisión limpia el
  compromiso propio y solo se vuelve a registrar si la habilidad elegida hace
  daño grande.

### 13.3 Cambios recomendados al documento

1. **Actualizar estados y referencias**: separar “hecho” de “pendiente”,
   corregir la tabla y sustituir los números de línea por nombres de función.
2. **Añadir una prioridad nueva por encima de la 1**: “Geometría compartida de
   amenazas y colisiones”, porque afecta a anticipación, evasión y puntuación.
3. **Añadir “Peligros en pathfinding”**: usar `hazardPathBlocked` también en
   retirada, pociones, patrulla y `followPath`, o incorporar un coste dinámico a
   `BotNavGrid`.
4. **Subir la fachada de percepción**: cooldowns, timers y `enemiesSeeing`
   exactos son una ventaja no humana; debería ser prioridad media-alta, no un
   detalle de la sección 9.7.
5. **Añadir tests de geometría y visión** antes de seguir con tuning:
   - amenaza melee/haz/área/dash contra los mismos cálculos del motor,
   - histéresis por observador,
   - colisiones en línea de tiro,
   - RNG con semilla para reproducir decisiones.
6. **Actualizar la sección 11**: varios criterios ya se cumplen parcialmente;
   otros, como “no se quedan empujando paredes” o “no gastan la definitiva en
   invulnerables”, siguen dependiendo de los casos anteriores.

---

## Nota

Las secciones marcadas como hechas ya están implementadas; el resto sigue siendo
una propuesta. Para lo pendiente conviene mantener el orden del apartado 10 y
cada fase detrás de métricas de la simulación.
