# Estudio del sistema de combate y del balance

> Análisis estático del código + simulación numérica con las fórmulas reales del
> juego. Los apartados ya corregidos se han retirado: este documento solo
> enumera los fallos que siguen abiertos.
>
> Fecha base: 2026-10-31 · Nivel de combate: 50 · IV 31 / EV 0 · naturaleza neutra.
>
> **Actualización 2026-11-03**: revisado contra `86ec72c` (v0.5.0), que incluye
> `83d196c` (instintos comunes), `5b7720b` (HUD y cooldowns), `18aec2c`/
> `74ad8b1`/`9859936` (bots) y `8fba493` (carril de haz), además de `67b9f09`
> (`fix melee`), `f2a677b` (`fix inmune`), `fb3ee05` (`balance info`),
> `ce2ef22` (`fix many bugs`), `c11e13f` (`fix moves`) y `a8f2345`
> (`fix fog projectile`).
> Esta pasada conserva el fallo que sigue abierto: la colisión de los dashes
> con jugadores (§3.10). Se han corregido el bloqueo global durante el windup, la
> geometría de los golpes de dash, el origen del empuje, el nivel de combate
> duplicado y la matriz de balance, que ahora incluye a Tyranitar y Groudon (§4).
> Se han retirado los apartados de implementación ya corregidos (melee/áreas/LOS
> y cono de melee, túnel y alcance de los proyectiles, `healOnHit`, inmunidad,
> apilamiento de ralentizaciones, fin de partida, orden de las acciones
> instantáneas, áreas `overTime` de estado,
> distancia del dash, FX bajo la niebla, niebla con rango efectivo, animación de
> lanzamiento tras el windup, validación de assets al empezar, reinicio del
> estado al reaparecer, cooldowns que siguen corriendo durante la muerte,
> invulnerabilidad que se rompe al atacar, orden de impactos de los proyectiles
> y HUD/VFX de los instintos comunes) y se ha compactado la numeración.

## Resumen ejecutivo

El motor de combate está bien separado y la fórmula de daño, la tabla de tipos y
el cálculo de stats son correctos. Los problemas graves siguen estando en **la
cobertura de movesets, la validación de equipos y el reparto de poder entre
especies**; además quedan cabos sueltos en el daño de los jugadores muertos.

Los cinco hallazgos más importantes:

1. **9 de las 24 especies seleccionables no tienen ninguna habilidad.** Eevee,
   Onix, Zapdos, Raikou, Entei, Suicune, Lugia, Ho-Oh y Celebi se pueden elegir
   en `/roster`, pero entran a la partida con los cuatro huecos vacíos. Las
   otras 15, incluidos Tyranitar y Groudon, sí tienen moveset.
2. **No se valida que haya dos equipos.** Una partida 1v0 (o con todos los
   jugadores en el mismo equipo) no puede conseguir ningún KO y no termina
   nunca.
3. **Los proyectiles, las áreas y los golpes diferidos de un jugador muerto
   siguen dañando y puntuando.** `canHit` no mira `attacker.alive`: un caster
   muerto puede cerrar un KO, incluso con un lanzamiento encolado en el mismo
   frame, y sumar la baja a su marcador.
4. **Hay una diferencia de poder de 5,3× entre el mejor y el peor combo** en la
   matriz de §4.3 (15 especies, con Tyranitar y Groudon). Once personajes
   superan el 100 % de la vida media con una rotación: Groudon mata de 100-0 a
   los 14 rivales, y Tyranitar, Gengar y Moltres a 13. Groudon, Tyranitar y
   Mewtwo son los casos más extremos; Pikachu, Bulbasaur, Mew y Squirtle están
   por debajo del 100 %.
5. **La visión no interviene en el combate**: se puede atacar y matar a un
   rival que no se ve, y no hay revelado al recibir daño.

Esta pasada añade un fallo que no estaba documentado: todos los dashes se
detienen en cualquier jugador, aunque `dashBlocksOnEnemies` solo esté activo en
Impulso (§3.10). El bloqueo global durante el windup, la geometría de los golpes
de dash y el origen del empuje ya se han corregido.

Además, **Mewtwo y Mew no pueden hacer daño a Greninja ni a Tyranitar**: todo
su kit ofensivo es Psíquico y ambos son Siniestro (inmune a Psíquico). No hay
movimientos de cobertura, así que la inmunidad es total.

---

## 1. Cómo funciona el combate

### Flujo de una habilidad

```
input (edge) → castAbility()
  ├─ comprueba alive, pendingCast, dash, QueuedCast y castLockTimer
  ├─ inicia cooldown
  ├─ fija actionTimer / animación (el castLockTimer no melee se fija al
  │  ejecutar, no al iniciar el windup)
  └─ si windup > 0:
        crea PendingCast (+ marca de área si shape === 'aoe')
        stepPendingCast() espera el windup
     al terminar → executeAbility()
        ├─ CAST_EFFECTS (buffs + curación)
        ├─ ABILITY_EXECUTORS[shape] (melee/projectile/beam/aoe/dash/self)
        └─ applySelfDamage()
              ↓
        applyAbilityDamage() por cada objetivo
          ├─ rollAccuracy
          ├─ inmunidad de tipo → sin daño, estado ni control
          ├─ slow (si la habilidad lo define)
          ├─ si no hace daño (estado) → control y fin
          ├─ computeDamage (stats, STAB, tipos, crítico, random)
          ├─ impacto + número flotante
          ├─ control (cancela dash/windup y aplica hitstun)
          ├─ resta HP
          └─ knockOut si HP ≤ 0
```

El estado mutable vive en `src/game/matchState.ts`; la orquestación en
`src/game/game.ts`; las formas en `src/game/abilityExecutors.ts`; los efectos de
lanzamiento en `src/game/effects.ts`; la fórmula en `src/game/combat.ts`.

### Fórmula de daño

`src/game/combat.ts:102-140` implementa la fórmula oficial a nivel 50:

```
base = floor(floor((2 × 50 / 5 + 2) × potencia × ataque / defensa) / 50) + 2
daño = floor(base × crítico) → floor(× random) → floor(× STAB) → floor(× tipos)
```

- Físico usa Ataque/Defensa; especial usa Ataque Especial/Defensa Especial.
- STAB ×1,5 si el movimiento comparte tipo con el atacante.
- Crítico 1/24, ×1,5.
- Factor aleatorio 0,85-1,00.
- Precisión 0 significa «nunca falla».
- Inmunidad de tipo → 0; cualquier otro golpe válido hace al menos 1.

La tabla de tipos de `src/game/typeChart.ts` es correcta para la generación VI+
(incluye las inmunidades Normal↔Ghost, Fighting→Ghost, Psychic→Dark,
Poison→Steel, Ground→Flying, Electric→Ground y Dragon→Fairy).

### Stats

`src/game/pokedex.ts:73-88` calcula HP y stats finales con IV 31 / EV 0. Los
valores base son los reales de la especie. Esto hace que las especies con base
stats legendarios sean intrínsecamente más fuertes antes de mirar habilidades.

### Formas y reglas

- **melee**: cono con `range` y `halfAngle`. Bloquea movimiento `moveLock` = 0,5
  × `castTime` por defecto y también impide lanzar otra habilidad hasta que
  termina el clip (`moveLockTimer`).
- **projectile**: avanza a `projectileSpeed`, se detiene en colliders y a
  `range`.
- **beam**: instantáneo, se corta en el primer collider y atraviesa a todos los
  rivales en línea.
- **aoe**: círculo centrado a `range` del lanzador. `instant` o `overTime`;
  `radialDamage` interpola del 100 % en el centro a `radialMinDamage` en el
  borde.
- **dash**: se reparte en pasos y comprueba colliders por tramo. Hoy también
  choca con cualquier jugador vivo (aliado o rival); su golpe solo cuenta por
  delante del origen y revalida el tramo al resolverse, pero queda el cabo de
  colisión de §3.10.
- **self**: buffs, curación o utilidad centrada en el lanzador.

**Estados**: ralentización (`slow`) y buffs (`speed`, `attack`, etc.). No hay
quemadura, veneno, sueño ni parálisis completa; la «parálisis» de este juego es
una ralentización.

**Protección**: reduce un 40 % el daño durante 2 s. Se aplica sobre la fórmula
con mínimo de 1 PV, así que un golpe de 1 PV sigue quitando 1 y uno de 2 también
1 (50 % efectivo en ese caso).

**Reaparición**: 5 s, 2 s de invulnerabilidad y vida al máximo. Los cooldowns
del kit **siguen corriendo durante la muerte**; el del instinto activo se
reinicia al reaparecer. Atacar retira la invulnerabilidad
(`src/game/game.ts:1581-1588`).

**KO**: 15 por equipo (`CONFIG.combat.koTarget`).

---

## 2. Verificación de la fórmula

Se comprobó numéricamente contra los módulos reales (`pokedex.ts`, `combat.ts`,
`typeChart.ts`, `abilities.ts`). Resultados destacados:

- Pikachu nivel 50: **110 PV**, Atk 75, Def 60, SpA 70, SpD 70, Spe 110.
- Mewtwo nivel 50: **181 PV**, Atk 130, Def 110, SpA 174, SpD 110, Spe 150.
- Mewtwo con Telequinesis (55 potencia, Psíquico, STAB) contra Pikachu:
  ~93 de daño con random 1,00 y sin crítico; ~87 de media contando crítico y
  random. Dos golpes bastan para tumbar a Pikachu.
- La fórmula, el STAB, la efectividad, el crítico y el mínimo de 1 están bien
  implementados.

**Conclusión de la fórmula**: no hay un error de fórmula. El desequilibrio viene
de los stats reales, de la potencia/cooldown de las habilidades y de la falta de
cobertura de tipos.

---

## 3. Fallos de implementación abiertos

### 3.0. Estado de los fallos abiertos (revisión 2026-11-03)

| Apartado | Estado | Nota |
| --- | --- | --- |
| 3.1 Cobertura de movesets | **pendiente** | 9 de 24 especies siguen sin habilidades. |
| 3.2 DoT precisión/+2 por tick | **pendiente** | Sin cambios. |
| 3.3 Daño de jugadores muertos | **pendiente** | `canHit` no comprueba `attacker.alive`; afecta a proyectiles, áreas, casts encolados y golpes de dash. |
| 3.4 Visión en combate | **pendiente** | La niebla no interviene en `canHit`; decidir si los proyectiles deben ignorar la ocultación por terreno. |
| 3.5 Explosión gratis a 1 PV | **pendiente** | El autodaño nunca quita la última vida. |
| 3.6 Validación de dos equipos | **pendiente** | Una partida 1v0 no puede terminar. |
| 3.7 Desconexión de mando | **pendiente** | El jugador queda inmóvil y se le puede farmear. |
| 3.8 Stat Speed / dash | **pendiente** | Speed es decorativo y el dash ignora slow/terreno/buffs. |
| 3.9 Detalles menores | **pendiente** | Spawns con varios respawns, spawn inicial y terreno inicial. |
| 3.10 Colisión de dash | **nuevo** | Todos los dashes se detienen en cualquier jugador; `dashBlocksOnEnemies` es redundante. |

### 3.1. Cobertura: 9 especies sin moveset (crítico)

`MOVESETS` solo define 15 ids (`src/game/abilities.ts:1780-1819`). El roster
muestra las 24 especies de `public/sprites/manifest.json`; la card enseña
«Sin asignar» en los cuatro huecos (`src/ui/RosterScreen.tsx:416-455`), pero
`src/ui/RosterScreen.tsx:90` y el carrusel (`RosterScreen.tsx:491-493`) no
filtran, bloquean ni avisan de que esa especie no puede combatir.

`src/game/game.ts:473` hace:

```ts
const moveset = MOVESETS[config.pokemonId] ?? [null, null, null, null];
```

y `game.ts:567` guarda `abilityIds: [...moveset, commonAbilityId]`. El HUD
muestra cuatro veces «Sin asignar». Esas especies no pueden atacar, defenderse
ni usar ninguna habilidad; solo caminan.

**Especies afectadas**: Eevee (0133), Onix (0095), Zapdos (0145), Raikou (0243),
Entei (0244), Suicune (0245), Lugia (0249), Ho-Oh (0250), Celebi (0251).

**Impacto**: partidas perdidas por elección, frustración y una parte importante
del roster inutilizable.

**Arreglo mínimo**: filtrar el roster a las especies con moveset (o marcarlas
como «no disponible») hasta que tengan habilidades.
**Arreglo completo**: añadir movesets. Todas ellas ya tienen animaciones
`attack`, `hurt`, `shoot` y `charge` en el manifiesto, así que no hace falta
volver a importar sprites para empezar.

### 3.2. DoT: precisión por tick y +2 plano por tick (medio)

`tickAoe` llama a `applyAbilityDamage` por cada tick
(`src/game/game.ts:2460-2501`). Eso implica:

1. **La precisión se tira en cada tick**, no una vez por lanzamiento. Giro Fuego
   tiene 85 % de precisión nominal; con 6 ticks, el daño esperado es 6 × 0,85,
   no «85 % de acertar todo». La varianza es menor y la etiqueta «85 %» no
   describe el comportamiento real.
2. **La fórmula suma +2 por cada tick**, no una vez por área. Con pocos ticks y
   potencia baja, el DoT se infla de forma no lineal. Con los datos actuales:
   - Giro Fuego: 6 ticks × potencia 14 → ~73,5 de daño esperado; un solo golpe
     de potencia 84 haría ~61,3 (**+20 %**).
   - Bomba Lodo: 5 ticks × potencia 12,5 → ~91,5; un solo golpe de potencia 62,5
     haría ~83,8 (**+9 %**).

No es un error enorme, pero rompe la linealidad «potencia/s × duración» y
complica el ajuste fino.

**Arreglo**: tirar precisión una vez al crear el área (o al entrar el objetivo)
y aplicar el +2 de la fórmula una sola vez por área, o compensar la potencia por
tick para que el total coincida con el nominal.

### 3.3. Proyectiles, áreas y golpes diferidos de jugadores muertos siguen dañando y puntuando (medio)

`canHit` no comprueba `attacker.alive` (`game.ts:1861-1868`).
`updateProjectiles` (`game.ts:2213-2429`) y `updateActiveAoes`
(`game.ts:2435-2459`) tampoco, y `executeAbility` no valida que el lanzador siga
vivo (`game.ts:1741-1824`). Un proyectil o un área lanzados
antes de morir pueden matar después y sumar el KO al jugador muerto; lo mismo
ocurre con un lanzamiento instantáneo ya encolado si otro jugador mata al
lanzador en la misma tanda de resolución (`resolveQueuedCasts`,
`game.ts:1729-1740`), o con un golpe de dash pendiente (`resolveInstantHits`,
`game.ts:2506-2531`). Un área persistente puede seguir presionando una zona
durante 2,5 s.

La regla es además inconsistente: la melee sí revalida `attacker.alive`
(`meleeHitValid`, `game.ts:2544-2569`) y las demás formas no.

**Decisión pendiente**: si los proyectiles en vuelo deben sobrevivir al lanzador,
hay que documentarlo y limitarlo a esas formas; si no, añadir `attacker.alive` a
`canHit` (o comprobarlo en cada fase) y descartar los golpes encolados del
muerto.

### 3.4. La visión no interviene en el combate (alto, diseño)

`canHit` no consulta `isTargetVisible` (`game.ts:1861-1868`). Las habilidades se
lanzan por `facing` y pueden impactar a objetivos que el atacante no ve, y
viceversa. La niebla es solo de render.

Esto crea ventajas difíciles de leer:

- Mewtwo tiene 12 u de visión y Psíquico 10 u; Bulbasaur tiene 8 u de visión. En
  hierba alta, Scyther (que comparte tipo Bicho con el terreno) pasa de 10,8 u a
  ~3,5 u efectivos (0,45 × 1,5 de ocultación), mientras Mewtwo le dispara desde
  10 u. Bulbasaur, en la misma hierba alta, baja a ~4,4 u.
- No hay «me han visto al atacar» ni indicador de dirección del daño. El
  atacante puede matar desde fuera de la pantalla del rival.

**Decisión pendiente sobre los proyectiles**: desde `a8f2345`, los proyectiles
ignoran la ocultación por terreno al calcular sus capas
(`combatFx.ts:1631-1640`, `game.ts:2776-2820`). Esto evita que desaparezcan al
cruzar hierba alta, pero un
disparo originado en una zona oculta se ve a través de la vegetación y puede
delatar la dirección del tirador. Hay que decidir si es el comportamiento
buscado o si solo debe revelarse el proyectil, no la posición del lanzador.

**Arreglo**: revelar al atacante unos segundos al hacer daño, o añadir un
indicador de dirección de impacto, o limitar el alcance ofensivo al rango de
visión efectivo.

### 3.5. La Explosión de Voltorb es gratis a 1 PV (bajo)

`applySelfDamage` calcula `amount = min(raw, max(0, hp - 1))` y no resta nada si
estás a 1 PV (`game.ts:1825-1839`). Como el autodaño nunca mata, un Voltorb a
1 PV puede usar Explosión sin coste; a 2 PV solo paga 1. No es un exploit enorme,
pero sí una inconsistencia: el coste desaparece justo cuando más debería
importar.

**Arreglo**: añadir un autodaño mínimo (p. ej., 5 PV), un autostun de 0,5 s tras
Explosión, o aceptar que el 1 PV es una excepción documentada.

### 3.6. No se valida que haya dos equipos (alto)

`LobbyScreen` y `RosterScreen` solo comprueban que todos estén listos
(`allReady`), no que haya al menos un jugador en cada equipo
(`LobbyScreen.tsx:198-200`, `RosterScreen.tsx:90`). `continueToRoster` tampoco
lo comprueba (`SessionProvider.tsx:300-324`) y `startMatch` solo valida que haya
un humano y que los assets existan (`game.ts:409-640`).

Un jugador solo puede empezar una partida 1v0: no hay rivales, no se puede
conseguir ningún KO y la partida no termina nunca (no hay límite de tiempo ni
condición de victoria alternativa). Lo mismo ocurre si todos los jugadores
eligen el mismo equipo o si una desconexión vacía un equipo. `setPlayerTeam` y
`leavePlayer` tampoco impiden dejar un equipo vacío
(`SessionProvider.tsx:211-227, 293-298`).

**Arreglo**: bloquear el inicio si algún equipo está vacío (o añadir un modo
práctica explícito); añadir un límite de tiempo/condición de fin; validar
también `MAX_TEAM_SIZE` y los slots duplicados en `startMatch`.

### 3.7. La desconexión de un mando deja un jugador inmóvil en la partida (medio)

`SessionProvider.syncDevices` elimina al jugador de la sesión cuando su mando
desaparece (`src/session/SessionProvider.tsx:430-443`), pero `PlayScreen` registra
`onDevicesChanged: () => {}` (`src/screens/PlayScreen.tsx:93`) y `Game` no
elimina ni congela al jugador de `matchPlayers`. El jugador sigue vivo, con su
cámara y su vista, pero recibe `IDLE_INPUT` y se queda quieto; los rivales pueden
matarlo repetidamente y farmear KOs.

**Arreglo**: al detectar la desconexión, pausar la partida, eliminar al jugador
(o sustituirlo por una IA/auto-return), o al menos conceder invulnerabilidad
hasta que vuelva a conectarse. No dejarlo como objetivo estático.

### 3.8. El stat Speed no se usa y el dash ignora slow/terreno/buffs (medio, diseño)

`CombatStats.speed` se calcula (`pokedex.ts:75-88`) pero no se lee en ninguna
parte del combate; la velocidad de movimiento sale de `POKEMON_SPEEDS`
(`roster.ts:10-42`). El stat de Speed de la Pokédex es, por tanto, decorativo.

Además, `stepDash` usa `dash.speed` calculado en `executeDash` sin aplicar
`slowMultiplier`, `terrainMultiplier` ni `buffMultiplier('speed')`
(`abilityExecutors.ts:378-434`, `game.ts:1024-1031, 1308`): un Pokémon
ralentizado o en terreno hostil hace el dash a la misma velocidad. Es una
decisión de diseño, pero conviene documentarla o aplicar los modificadores al
dash.

También hay tipos sin terreno propio (`Psychic`, `Fighting`, `Steel`, `Dark`,
`Dragon`, `Flying`), así que Mewtwo, Mew, Lucario y Lugia nunca reciben el bonus
`home` de 1,18× de velocidad/ocultación (`terrain.ts:35-51`).

### 3.9. Varios detalles menores (bajo)

- **Spawn/facing en mapas con varios respawns**: `facingToCenter(team)` y
  `cameraYawForTeam(team)` usan el **primer** respawn del equipo, no el spawn
  real del jugador (`multiplayer.ts:128-138`). En mapas con varios respawns por
  equipo, los jugadores de las otras bases miran (y arrancan la cámara) hacia
  donde mira la primera base. `startMatch` y `respawnPlayer` usan la misma
  función (`game.ts:470, 508, 1440`), aunque `spawnForTeam` sí reparte entre
  varias bases (`multiplayer.ts:114-125`).
- **Spawn inicial sin resolver**: `startMatch` coloca al jugador directamente en
  `spawnForTeam` (`game.ts:468-470, 518-519`); `respawnPlayer` sí pasa por
  `resolvePosition` (`game.ts:1437`). El primer `stepPlayer` vuelve a resolver,
  pero la cámara y la primera copia se crean en la posición sin corregir, así
  que en un mapa con un collider pegado a la base puede verse un frame dentro
  del árbol o del muro.
- **Terreno inicial y multiplicador**: `startMatch` guarda
  `terrainMultiplier: 1` y `terrainSpeedReason: 'neutral'` aunque el spawn tenga
  bonus o penalización (`game.ts:526-530`). Como `stepPlayer` no corre durante
  la cuenta atrás, el HUD muestra ×1,00 neutro durante los 5 s. Además, el
  multiplicador se calcula antes de mover (`game.ts:1018-1031`) y no se
  refresca tras el desplazamiento, así que el HUD puede mezclar el terreno nuevo
  con el multiplicador anterior durante un frame.

### 3.10. Todos los dashes se detienen en cualquier jugador (medio, diseño)

`dashPosition` resuelve cada paso con `resolvePosition` (`game.ts:3055-3098`), y
`resolvePosition` incluye a todos los jugadores vivos, sin filtrar equipo
(`game.ts:3019-3035`). Además, el dash se corta cuando el paso avanza menos del
35 % (`game.ts:3088-3093`). Por eso cualquier dash de kit se detiene al chocar
con un rival o un aliado, aunque `dashBlocksOnEnemies` esté desactivado. El flag
solo precalcula `dashEnemyLimit` en `executeDash`
(`abilityExecutors.ts:356-434`), que acorta la distancia antes de empezar; en un
choque frontal el resultado práctico es el mismo que la colisión. Impulso no es
especial en esto:
la descripción de que «se detiene en enemigos» vale para todos los dashes.

`dashEnemyLimit` tampoco comprueba obstáculos ni línea de visión: un enemigo
detrás de un árbol o un muro puede acortar el dash aunque el camino esté libre.

**Arreglo**: decidir la regla. Si solo Impulso debe detenerse en enemigos,
`dashPosition` necesita un flag para ignorar jugadores (o al menos aliados) y
`dashEnemyLimit` debe comprobar LOS; si todos los dashes deben detenerse, quitar
o documentar `dashBlocksOnEnemies` y unificar la distancia.

## 4. Estudio cuantitativo del balance

### 4.1. Metodología

Se compilaron `abilities.ts`, `pokedex.ts`, `combat.ts`, `typeChart.ts` y
`config.ts` y se simularon los enfrentamientos con:

- Nivel 50, IV 31, EV 0.
- Daño esperado con crítico 1/24, ×1,5, random medio 0,925 y precisión aplicada
  (0 = nunca falla).
- DoT: `ticks = ceil(duración / intervalo)`, primer tick en t = 0, potencia por
  tick = `power × intervalo`.
- «Combo» = suma del daño esperado de las 4 habilidades contra el objetivo real,
  suponiendo que todas conectan y que el rival no esquiva.
- «Objetivo neutro» = defensor con 100 en todas las stats y sin tipos, para
  comparar habilidad contra habilidad sin que el tipo distorsione.
- Las áreas se valoran con el objetivo en el centro (100 %); el multiplicador
  radial reduce el daño según la distancia, así que el combo es una cota.
- Los combos son una **cota superior** y una medida relativa, no una promesa de
  daño real: en la práctica hay rangos, windups, dashes y esquivas.
- **Cobertura de esta simulación**: incluye las 15 especies con `MOVESETS`,
  Tyranitar (0248) y Groudon (0383) entre ellas. Los instintos comunes no están
  simulados: Protección reduce daño y Regeneración cura, pero no añaden potencia
  directa. Las tablas se regeneraron el 2026-11-03 con este modelo.

### 4.2. Cobertura y stats

| Pokémon | HP | Atk | Def | SpA | SpD | Spe | Moveset |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Bulbasaur | 120 | 69 | 69 | 85 | 85 | 65 | sí |
| Charmander | 114 | 72 | 63 | 80 | 70 | 85 | sí |
| Squirtle | 119 | 68 | 85 | 70 | 84 | 63 | sí |
| Pikachu | 110 | 75 | 60 | 70 | 70 | 110 | sí |
| Gengar | 135 | 85 | 80 | 150 | 95 | 130 | sí |
| Voltorb | 115 | 50 | 70 | 75 | 75 | 120 | sí |
| Lucario | 145 | 130 | 90 | 135 | 90 | 110 | sí |
| Greninja | 147 | 115 | 87 | 123 | 91 | 142 | sí |
| Tyranitar | 175 | 154 | 130 | 115 | 120 | 81 | sí |
| Groudon | 175 | 170 | 160 | 120 | 110 | 110 | sí |
| Mewtwo | 181 | 130 | 110 | 174 | 110 | 150 | sí |
| Mew | 175 | 120 | 120 | 120 | 120 | 120 | sí |
| Scyther | 145 | 130 | 100 | 75 | 100 | 125 | sí |
| Articuno | 165 | 105 | 120 | 115 | 145 | 105 | sí |
| Moltres | 165 | 120 | 110 | 145 | 105 | 110 | sí |
| Eevee | 130 | 75 | 70 | 65 | 85 | 75 | **NO** |
| Onix | 110 | 65 | 180 | 50 | 65 | 90 | **NO** |
| Zapdos | 165 | 110 | 105 | 145 | 110 | 120 | **NO** |
| Raikou | 165 | 105 | 95 | 135 | 120 | 135 | **NO** |
| Entei | 190 | 135 | 105 | 110 | 95 | 120 | **NO** |
| Suicune | 175 | 95 | 135 | 110 | 135 | 105 | **NO** |
| Lugia | 181 | 110 | 150 | 110 | 174 | 130 | **NO** |
| Ho-Oh | 181 | 150 | 110 | 130 | 174 | 110 | **NO** |
| Celebi | 175 | 120 | 120 | 120 | 120 | 120 | **NO** |

### 4.3. Poder por Pokémon

`DPS básica` = daño de la básica contra un objetivo neutro dividido por su
cooldown. `DPS sostenido` = suma de daño/cooldown de las cuatro habilidades
(sin contar el bloqueo global de casteo; es una cota). `Combo neutro` = daño de
las 4 habilidades contra el objetivo neutro. `% vida media` = combo medio contra
las otras 14 especies jugables, dividido por su HP. `100-0` = número de rivales
a los que el combo completo les quita toda la vida.

La matriz incluye las 15 especies con moveset (14 rivales por fila, sin contar
el mirror). Las áreas se valoran con el objetivo en el centro; en el borde el
daño radial es menor.

| Pokémon | DPS básica | DPS sostenido | Combo neutro | % vida media | 100-0 | Sin daño |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Groudon | 67 | 97 | 322 | 366 % | 14/14 | 0 |
| Tyranitar | 87 | 116 | 302 | 339 % | 13/14 | 0 |
| Mewtwo | 102 | 125 | 294 | 241 % | 11/14 | 2 |
| Moltres | 78 | 108 | 246 | 211 % | 13/14 | 0 |
| Gengar | 36 | 62 | 244 | 188 % | 13/14 | 0 |
| Greninja | 57 | 107 | 201 | 177 % | 11/14 | 0 |
| Articuno | 67 | 86 | 212 | 176 % | 11/14 | 0 |
| Lucario | 74 | 97 | 222 | 166 % | 8/14 | 0 |
| Scyther | 93 | 108 | 194 | 155 % | 9/14 | 0 |
| Charmander | 40 | 56 | 143 | 122 % | 7/14 | 0 |
| Voltorb | 37 | 44 | 122 | 104 % | 5/14 | 0 |
| Squirtle | 48 | 66 | 109 | 95 % | 5/14 | 0 |
| Mew | 117 | 123 | 99 | 81 % | 5/14 | 2 |
| Bulbasaur | 48 | 58 | 101 | 77 % | 4/14 | 0 |
| Pikachu | 52 | 80 | 84 | 69 % | 3/14 | 0 |

**Lectura**:

- La diferencia entre el mejor combo medio (Groudon 366 %) y el peor (Pikachu
  69 %) es de **5,3×**.
- Groudon puede **matar de 100-0 a los 14 rivales** con una rotación; Tyranitar,
  Gengar y Moltres lo hacen contra 13 de 14.
- Mewtwo, Greninja y Articuno llegan a 11 de 14.
- Pikachu, Bulbasaur, Mew y Squirtle no alcanzan el 100 % de la vida media;
  necesitan más de una rotación para matar a un rival medio.
- Groudon y Tyranitar combinan 175 PV, defensa alta y ataque alto con un combo
  de 302-322 de daño neutro. Groudon no tiene ningún matchup malo: su peor celda
  es 119 % (Articuno), porque sus dos ataques de Tierra se anulan contra
  Volador, pero Cuchillada y Avalancha siguen pegando.
- Mew es un caso distinto: su combo es bajo porque dos slots son utilidad
  (Agilidad y Recuperación), pero su básica es la de mayor DPS y tiene 175 PV +
  curación. Es un duelista de sostén, no un burst.

### 4.4. Comparación de habilidades contra un objetivo neutro

Daño esperado contra el defensor neutro (100 en todo, sin tipos; STAB incluido):

| Pokémon | Básica | Habilidad 1 | Habilidad 2 | Definitiva |
| --- | ---: | ---: | ---: | ---: |
| Pikachu | Placaje 13 | Ataque Rápido 13 | Rayo 40 | Impactrueno 18 |
| Voltorb | Chispa 22 | Rollout 17 | Onda Trueno (estado) | Explosión 83 |
| Gengar | Lengüetazo 25 | Bola Sombra 67 | Bomba Lodo 66 | Come Sueños 86 |
| Bulbasaur | Placaje 12 | Paralizador (estado) | Hoja Afilada 28 | Lluevehojas 61 |
| Charmander | Arañazo 12 | Giro Fuego 37 | Lanzallamas 46 | Anillo Ígneo 48 |
| Squirtle | Placaje 12 | Acua Jet 19 | Rayo Burbuja 31 | Hidrobomba 47 |
| Lucario | Garra Metal 37 | Velocidad Extrema 31 | Esfera Aura 52 | Combate Cercano 102 |
| Greninja | Shuriken 37 | Tajo Umbrío 52 | Sombra Vil 37 | Pulso Umbrío 75 |
| Articuno | Golpe Ala 37 | Rayo Hielo 65 | Viento Gélido 38 | Ventisca 72 |
| Moltres | Ataque Aéreo 43 | Tajo Aéreo 59 | Onda Ígnea 56 | Ataque Celeste 88 |
| Mewtwo | Telequinesis 61 | Teletransporte (estado) | Psíquico 104 | Psicoataque 129 |
| Mew | Golpe Psíquico 35 | Agilidad (estado) | Premonición 64 | Recuperación (estado) |
| Scyther | Golpe Furia 37 | Corte Aéreo 50 | Danza Espada (estado) | Tijera X 107 |
| Tyranitar | Triturar 74 | Avalancha 66 | Terremoto 66 | Roca Afilada 96 |
| Groudon | Cuchillada 40 | Terremoto 108 | Avalancha 49 | Filo del Abismo 125 |

Dos observaciones:

1. **Las básicas de los starters hacen 12-13 de daño neutro**, mientras Mewtwo
   hace 61, Scyther 37, Greninja 37, Mew 35, Groudon 40 y Tyranitar 74. El
   ataque básico más débil hace ~6× menos daño por golpe que el más fuerte. La
   cadencia de Placaje (0,25 s) compensa en DPS, pero no en burst, hitstun ni
   presión.
2. **Las definitivas varían entre 48 (Anillo Ígneo) y 129 (Psicoataque)** contra
   el mismo objetivo neutro. La de Voltorb (83) cuesta 40 PV y 18 s; la de
   Mewtwo (129) no cuesta nada y dura 15 s; la de Groudon (125) tiene 90 % de
   precisión y 15 s.

### 4.5. Matriz de combos (% de la vida del objetivo)

Cada celda es el daño de las 4 habilidades del atacante (fila) contra el rival
(columna), como porcentaje de la vida máxima del rival. `—` es el mirror.

```
Atacante     Pika  Vol Geng Bulb Char Squi Luca Gren Arti Molt Mew2  Mew Scyt  Tyr Grou
Pikachu         —  65%  45%  60% 107% 144%  53% 107%  65%  83%  44%  43%  99%  35%  10%
Voltorb       95%    —  84%  73% 156% 223%  86% 172%  99% 130%  61%  58% 155%  54%   7%
Gengar       316% 287%    — 242% 303% 240% 137% 118% 104% 139% 212% 199% 168%  57% 106%
Bulbasaur    138% 118%  36%    —  73% 187%  38% 143%  25%  20%  51%  49%  23%  87%  89%
Charmander   196% 169% 108% 278%    —  77% 214%  59% 121%  44%  74%  72% 188%  34%  74%
Squirtle     145% 127%  79%  63% 259%    —  78%  44%  48% 117%  55%  53%  75%  94% 100%
Lucario      295% 248%  35% 169% 275% 203%    — 275% 128%  70%  73%  70%  73% 320%  89%
Greninja     275% 237% 306% 196% 302% 177%  89%    —  92% 134% 183% 173% 139%  71% 109%
Articuno     254% 228% 170% 429% 159% 124%  94%  95%    — 122% 108% 103% 292%  93% 197%
Moltres      212% 182% 210% 544% 292% 217% 235% 168% 139%    — 125% 119% 341%  55% 109%
Mewtwo       381% 341% 461% 578% 368% 296% 224%   0% 125% 171%    —  70% 203%   0% 154%
Mew          129% 115% 156% 191% 125%  99%  75%   0%  42%  58%  24%    —  68%   0%  51%
Scyther      253% 209%  78% 293% 168% 192%  66% 263%  61%  47% 170% 161%    — 137%  71%
Tyranitar    560% 461% 332% 265% 737% 297% 164% 207% 367% 404% 191% 183% 500%    —  81%
Groudon      844% 692% 456% 358% 842% 318% 384% 254% 119% 132% 162% 155% 162% 245%    —
```

**Casos extremos**:

- **Groudon → Pikachu 844 %**, → Charmander 842 %, → Voltorb 692 %. Mata de
  100-0 a los 14 rivales; su celda más baja es 119 % (Articuno).
- **Tyranitar → Charmander 737 %**, → Pikachu 560 %, → Scyther 500 %. Solo
  Groudon (81 %) le aguanta una rotación entera.
- **Mewtwo → Bulbasaur 578 %**, → Gengar 461 %, → Pikachu 381 %.
- **Moltres → Bulbasaur 544 %**, → Scyther 341 %, → Charmander 292 %.
- **Gengar → Pikachu 316 %**, → Charmander 303 %, → Voltorb 287 %. Gengar mata
  de 100-0 a 13 de 14.
- **Greninja → Gengar 306 %**, → Charmander 302 %, → Pikachu 275 %.
- **Scyther → Bulbasaur 293 %**, → Greninja 263 %, → Pikachu 253 %; pero solo
  78 % a Gengar, 61 % a Articuno, 47 % a Moltres y 71 % a Groudon.
- **Pikachu → Squirtle 144 %** y → Charmander 107 % / Greninja 107 %, pero solo
  44-45 % a Mewtwo/Gengar, 35 % a Tyranitar y 10 % a Groudon. Es un counter de
  Agua/frágiles, no un personaje generalista.
- **Bulbasaur → Squirtle 187 %**, → Greninja 143 %, pero 20-36 % a
  Moltres/Gengar.
- **Squirtle → Charmander 259 %**, pero 44-79 % a Greninja/Gengar/Bulbasaur.
- **Voltorb → Squirtle 223 %**, → Greninja 172 %, pero 61-84 % a Mewtwo/Gengar y
  7 % a Groudon.

**Inmunidades totales**:

- **Mewtwo y Mew no pueden dañar a Greninja ni a Tyranitar** (todo su kit
  ofensivo es Psíquico; Greninja es Agua/Siniestro y Tyranitar Roca/Siniestro,
  así que Psíquico → Siniestro = 0).
- **Las básicas Normal de Pikachu, Bulbasaur, Squirtle y Charmander hacen 0 a
  Gengar** (Ghost inmune a Normal). Sus otras habilidades siguen funcionando,
  pero pierden su ataque de relleno.
- **Lucario solo puede dañar a Gengar con Garra Metal** (Fighting → Ghost = 0;
  su Esfera Aura y Combate Cercano son Fighting). Su combo contra Gengar es del
  35 %.
- **Bomba Lodo (Veneno) hace 0 a Lucario (Acero)**: la inmunidad anula también
  la ralentización. `Onda Trueno` tampoco ralentiza a Groudon (Tierra).
- **El kit Eléctrico de Pikachu y Voltorb hace 0 a Groudon** (Eléctrico →
  Tierra = 0): Pikachu solo le hace un 10 % con sus dos básicas Normal y Voltorb
  un 7 % con Rollout.
- **Los ataques de Tierra de Groudon hacen 0 a los Voladores** (Articuno,
  Moltres y Scyther); su combo allí depende de Cuchillada y Avalancha, y aun así
  queda en 119-197 %.
- **Scyther contra Gengar/Moltres/Articuno** hace 0,25×-0,5× con su básica; es
  uno de sus peores matchups.

### 4.6. El problema de los windups

Cualquier golpe que conecta (con daño o de estado) cancela el `PendingCast`
(`applyHitControl`, `game.ts:1911-1928`). Las básicas más rápidas tienen
cadencias de 0,25-0,4 s. Las definitivas con windup son:

| Habilidad | Windup | Quién |
| --- | ---: | --- |
| Rayo | 0,50 s | Pikachu |
| Giro Fuego | 0,50 s | Charmander |
| Roca Afilada | 0,50 s | Tyranitar |
| Explosión | 0,60 s | Voltorb |
| Filo del Abismo | 0,70 s | Groudon |
| Lluevehojas | 0,75 s | Bulbasaur |
| Anillo Ígneo | 0,75 s | Charmander |
| Ventisca | 0,75 s | Articuno |
| Recuperación | 0,75 s | Mew |
| Ataque Celeste | 0,80 s | Moltres |
| Psicoataque | 0,80 s | Mewtwo |
| Premonición | 0,90 s | Mew |

Con un Pikachu, Bulbasaur o Squirtle golpeando cada 0,25 s, un windup de 0,75 s
es prácticamente imposible de completar en rango cuerpo a cuerpo: el primer
golpe lo cancela. Esto favorece a las básicas rápidas y castiga a los personajes
lentos, justo los que más necesitan sus definitivas. La telegrafía es buena para
el rival, pero no hay «armadura de interrupción» ni un umbral de daño.

**Efecto colateral**: el choque (`clash`) solo ocurre cuando dos melee ya han
generado `PendingMeleeHit`; si una de las dos aún está en windup, no hay choque:
la rápida cancela a la lenta y le come el cooldown.

### 4.7. Movilidad, visión y alcance

La tabla de velocidades (`src/game/roster.ts`) y la de visión
(`src/game/vision.ts`) refuerzan la misma jerarquía:

| Pokémon | Velocidad | Visión | Dash | Alcance máximo |
| --- | ---: | ---: | --- | ---: |
| Mewtwo | 7,8 | 12,0 | Teletransporte 5 u | 10 u haz / 7,7 u área |
| Greninja | 7,4 | 11,5 | Sombra Vil 4,8 u | 9,5 u haz |
| Articuno | 6,8 | 11,6 | no | 9,5 u haz |
| Moltres | 7,0 | 11,5 | no | 9,1 u área |
| Gengar | 7,6 | 10,8 | no | 8,5 u proyectil / 8 u haz |
| Scyther | 7,2 | 10,8 | Corte Aéreo 5 u | 2,7 u melee |
| Pikachu | 6,9 | 11,0 | Ataque Rápido 4,5 u | 11 u haz |
| Bulbasaur | 4,2 | 8,0 | no | 7,4 u área |
| Squirtle | 4,8 | 8,5 | Acua Jet 4,2 u | 8,5 u haz |
| Charmander | 5,4 | 9,5 | no | 9,5 u haz |
| Tyranitar | 4,5 | 9,6 | no | 9 u haz / 8,5 u proyectil |
| Groudon | 5,6 | 10,6 | no | 8,5 u proyectil / 7,7 u área |

- Los personajes con más alcance también tienen más visión; la mayoría combina
  además buena velocidad, con Tyranitar y Groudon como excepción lenta. La
  combinación «te veo antes + te pego desde más lejos + puedo escapar» no tiene
  contrapeso en los rápidos.
- Bulbasaur es el más lento, tiene la visión más baja, no tiene dash y su
  definitiva tarda 0,75 s. Es el caso más desfavorecido.
- Charmander tampoco tiene dash y es frágil (114 PV, 63 Def).
- No hay ningún terreno Psíquico en `TERRAINS` (`src/game/terrain.ts:35-51`), así
  que Mewtwo y Mew nunca reciben el bonus «home» de 1,18× de velocidad; es una
  desventaja menor que no compensa su poder.

### 4.8. Explosión de Voltorb: el caso concreto

- 175 potencia especial, STAB Eléctrico, 4,2 u de radio, 18 s de cooldown.
- Contra el objetivo neutro: **~83 de daño esperado**.
- Autodaño: 35 % de 115 PV = **40 PV**.
- Con 1 PV el autodaño es 0 (ver §3.5).
- Su combo medio es 104 % de la vida media, pero gran parte viene de los
  matchups 2× contra Agua/Volador (Squirtle, Greninja, Moltres, Scyther). Contra
  un objetivo neutro su DPS sostenido es el más bajo del roster (44).

Como definitiva de una rotación de 18 s, 83 de daño y 40 de autodaño no
compensa; como herramienta de teamfight de 4,2 u sí puede ser útil, pero el
autodaño la convierte en una mala elección en 1v1.

---

## 5. Prioridades de arreglo

### P0 — rompe la partida

1. **Cobertura de movesets**: o se añaden los 9 movesets que faltan, o se
   filtran/marcan esas especies en el roster. Mientras no tengan habilidades, no
   deberían poder seleccionarse.
2. **Validar dos equipos**: bloquear el inicio si un equipo está vacío (o añadir
   un modo práctica explícito) y añadir un límite de tiempo/condición de fin.
   Sin esto, una partida 1v0 no termina nunca.

### P1 — exploits y justicia

3. **Daño de jugadores muertos**: añadir `attacker.alive` a `canHit` o
   comprobarlo en `updateProjectiles`, `updateActiveAoes`, `resolveQueuedCasts` y
   `resolveInstantHits`; descartar los golpes encolados del muerto. Documentar
   si algún proyectil debe sobrevivir.
4. **DoT**: una tirada de precisión por área/entrada y el +2 de la fórmula una
   vez por área; o compensar la potencia por tick.
5. **Visión/alcance**: revelar al atacante al hacer daño o añadir un
   indicador de dirección. Queda el indicador de daño; la niebla ya oculta los
   FX.
6. **Cobertura de tipos**: dar al menos un movimiento de cobertura a cada
    Pokémon, o suavizar las inmunidades en PvP. Sin cobertura, Mewtwo/Mew vs
    Greninja o Tyranitar es un 0 % literal.

### P2 — ajuste de balance

7. **Presupuesto común de daño**: fijar objetivos, por ejemplo:
    - Básica: 40-75 DPS contra objetivo neutro, con las de rango/velocidad en la
      parte baja y las melee lentas en la alta.
    - Combo completo: 90-140 % de la vida media (hoy hay 69-366 % en la matriz
      actual).
    - Definitiva: 60-110 de daño neutro, 12-18 s de cooldown, con el daño extra
      compensado por utilidad/alcance/autodaño.
8. **Básicas de los starters**: dar STAB a Pikachu/Bulbasaur/Squirtle/Charmander
    (por ejemplo, cambiar Placaje/Arañazo por un golpe elemental) o subir su
    potencia a 55-60. Hoy son 12-13 de daño neutro frente a 35-61 de los
    personajes con STAB.
9. **Mewtwo**: bajar Telequinesis de 55 a 45 de potencia, cooldown de 0,6 a
    0,8 s, knockback de 1,4 a 0,6-0,7 u y alcance de 2,5 a 2,2 u; Psíquico de 95
    a 85; Psicoataque de 125 a 110; velocidad de 7,8 a 7,2 y visión de 12 a 10,5.
10. **Gengar**: Bola Sombra 70 → 60; Come Sueños 90 → 80, curación 15 % → 10 %,
    cooldown 11 → 12; Bomba Lodo 25 → 20/s o cooldown 9 → 10.
11. **Greninja**: Shuriken 45 → 40, cooldown 0,65 → 0,75; Tajo Umbrío 70 → 60;
    Pulso Umbrío 95 → 85, cooldown 10 → 11.
12. **Moltres/Articuno**: Ataque Celeste 130 → 115; Ventisca 110 → 100; Onda
    Ígnea 65 → 55; Viento Gélido 55 → 50; cooldowns de las definitivas 15 → 16.
13. **Scyther**: Golpe Furia 45 → 38 o cooldown 0,4 → 0,5; Tijera X 130 → 115;
    Danza Espada 1,35 → 1,30.
14. **Lucario**: Combate Cercano 125 → 115; Esfera Aura 60 → 55.
15. **Pikachu**: Rayo 90 → 100 y cooldown 8 → 7; Impactrueno 40 → 50 y cooldown
    0,9 → 0,8; básica elemental de ~45 de potencia.
16. **Bulbasaur**: Hoja Afilada 60 → 70 y cooldown 5 → 4,5; Lluevehojas 120 →
    130; Paralizador 10 → 8; valorar velocidad 4,2 → 4,6 o darle un dash corto.
17. **Squirtle**: Hidrobomba 115 → 125 y precisión 90 → 95; Rayo Burbuja 65 → 70;
    Acua Jet 45 → 55; valorar velocidad 4,8 → 5,1.
18. **Charmander**: Arañazo elemental de ~48 o subir la básica a 50; Anillo Ígneo
    110 → 120; Giro Fuego 35 → 40; valorar un dash corto o más velocidad.
19. **Voltorb**: Explosión 175 → 220, autodaño 0,35 → 0,25, cooldown 18 → 16;
    Chispa 65 → 70; añadir un autostun corto tras Explosión para que no sea un
    escape gratis.
20. **Groudon y Tyranitar**: recortar Filo del Abismo 130 → 110 y Terremoto
    40 → 30/s; Roca Afilada 125 → 105 y Triturar 75 → 65; o alargar sus
    cooldowns. Con 175 PV, 130-160 de Def y un combo neutro de 302-322, sus
    medias (339-366 %) quedan por encima de todo el roster.
21. **Burst global (opcional)**: si se quiere alargar el TTK, aplicar un
    multiplicador global de daño de 0,85-0,90 en PvP o subir la vida un 10-15 %.
    Con los combos actuales, una rotación completa puede matar en ~1 s.
22. **Desconexión**: pausar/eliminar/auto-return al jugador cuyo mando
    desaparece; hoy queda inmóvil y se le puede farmear.
23. **Stat Speed**: usarlo o documentar que la velocidad de movimiento es solo
    `roster.ts`; valorar aplicar slow/terreno al dash.
24. **Detalles menores**: usar el spawn real para
    `facingToCenter`/`cameraYawForTeam`, resolver la posición y el
    `terrainMultiplier` del spawn inicial de `startMatch`.
25. **Colisión de los dashes**: decidir si los dashes de kit atraviesan jugadores
    o no; hacer que `dashBlocksOnEnemies` y `dashEnemyLimit` (con LOS) controlen
    la regla, en vez de que `resolvePosition` detenga todas las dashes.

> Los números son un punto de partida para una primera pasada, no una verdad
> absoluta. Conviene cambiarlos de pocos en pocos y volver a ejecutar la matriz.

---

## 6. Pruebas recomendadas

No hay tests en el proyecto. El sistema de combate es casi todo funciones puras,
así que se pueden añadir tests baratos:

- **Cobertura**: `MOVESETS` tiene entrada para todas las especies del manifiesto
  (o el roster filtra las que no la tienen).
- **Stats**: `combatStatsFor` devuelve 110 PV para Pikachu y 181 para Mewtwo.
- **Fórmula**: un caso conocido de `computeDamage` con random fijo y sin
  crítico; otro con STAB; otro con inmunidad (0); otro con efectividad 0,25.
- **Precisión**: `rollAccuracy(0) === true`; `rollAccuracy(100)` siempre acierta
  (el `Math.random()` es < 1).
- **Invariantes de balance** (script, no test unitario): cada especie debe poder
  hacer al menos X % de daño a al menos el 75 % del roster; ningún combo debe
  superar el 150 % de la vida media; ningún personaje debe tener 0 % contra más
  de un rival; todas las básicas deben estar en una banda de DPS.
- **Respawn**: un test de integración que compruebe que los cooldowns del kit
  siguen corriendo durante la muerte y no se reinician al reaparecer, mientras
  que el slot 4 sí vuelve a 0. Al reaparecer, el multiplicador y el motivo del
  terreno deben corresponder al spawn nuevo (no a la vida anterior) y
  `actionAnimation` debe ser `null` antes del primer frame de movimiento.
- **Invulnerabilidad de spawn**: lanzar una habilidad ofensiva con
  `invulnerableTimer > 0` debe ponerlo a 0; usar Protección o Impulso no debe
  retirarla. Durante esos 2 s el jugador sigue siendo invulnerable al daño.
- **DoT**: que el daño total de un área `overTime` con precisión 100 sea igual a
  `power × duration` (con la tolerancia de la fórmula), y que la precisión se
  tire una vez, no por tick.
- **Inmunidad**: un golpe con efectividad 0 no debe mostrar impacto ni «0», ni
  aplicar slow, ni cancelar dash/preparación; `Onda Trueno` no debe ralentizar
  a un Pokémon de tipo Tierra. Un golpe de estado válido sí debe interrumpir
  igual que uno dañino.
- **Jugador muerto**: matar al lanzador y comprobar que su proyectil, área, cast
  encolado o golpe de dash no sigue dañando ni suma KO (o documentar la
  excepción si los proyectiles en vuelo deben sobrevivir).
- **Proyectiles al borde**: a 20 u/s con `dt` 0,05 y con `dt` 1/60, un objetivo
  en el borde nominal (`range + 0,4` desde el lanzador) debe recibir el golpe, y
  un roce lateral a 0,55 u del recorrido también. El último tramo se recorta al
  alcance restante y los objetivos se comprueban contra el segmento recorrido.
- **Proyectiles y obstáculos**: un objetivo situado antes de un muro dentro del
  mismo paso debe recibir el golpe; otro detrás del muro no. Con dos objetivos en
  línea y `pierce = 0` debe recibir el más cercano, sin depender del orden de
  `matchPlayers`. Repetir a 20 FPS y a 60 FPS.
- **Instintos comunes**: Protección reduce un 40 % los golpes y cada tick de
  área durante 2 s, no impide slow/stun, no reduce el autodaño y bloquea el resto
  de habilidades mientras está activa; Impulso se detiene en enemigos y
  separadores (hoy también en aliados, §3.10) y no hace daño; Regeneración
  empieza a los 3 s oculto, cura 1 PV/s,
  se corta con daño/visibilidad/ataque/habilidad/muerte y no filtra el indicador
  al rival. Al morir con escudo, la esfera debe desaparecer.
- **HUD de Regeneración**: no debe mostrar la cuenta atrás cuando el jugador está
  siendo visto, ha muerto o está a vida máxima.
- **Equipos**: `startMatch` debe rechazar una partida con un equipo vacío; si se
  cae un asset, debe devolver `false`, avisar por `onError` y no iniciar la
  partida (ningún jugador debe desaparecer sin aviso ni desalinear el HUD).
- **Visión/combate**: si se implementa el revelado, un atacante que hace daño
  desde fuera de la vista debe aparecer o indicarse durante N segundos.
- **Proyectiles/niebla**: un disparo desde hierba alta debe verse al cruzar la
  vegetación; comprobar si el VFX revela la dirección del tirador y si eso es
  intencionado.
- **Slow**: un slow débil aplicado sobre uno fuerte no debe alargar el fuerte ni
  rebajar su multiplicador; los ticks de un área no deben renovar la duración
  más allá del slow nominal del lanzamiento; un slow de duración 0 no debe
  dejar `slowMultiplier` reducido.
- **Desconexión**: al desaparecer un mando, el jugador debe pausarse, eliminarse
  o volver, no quedar inmóvil como objetivo.
- **GCD**: dos habilidades no melee distintas en frames consecutivos: la segunda
  no debe ejecutarse hasta que termine el `castTime` de la primera. Las melee
  conservan su cadencia de cooldown/`moveLock` y bloquean cualquier otra
  habilidad mientras dura su `moveLock`.
- **GCD y windup**: con una habilidad de windup largo (Ataque Celeste, Ventisca,
  Psicoataque), el bloqueo global debe empezar al ejecutar y durar `castTime`
  después del impacto, no antes. Un casteo interrumpido no debe dejar un
  `castLockTimer` residual.
- **Dash y colisión**: comprobar si un dash de kit atraviesa enemigos/aliados, si
  `dashBlocksOnEnemies` cambia algo y si un enemigo detrás de un árbol acorta el
  dash de Impulso sin línea de visión.
- **Empuje**: un proyectil disparado y luego desplazado el tirador debe empujar
  en la dirección del proyectil, y un área radial debe empujar desde su centro,
  no desde el lanzador.
- **Speed/dash**: un dash con slow, terreno hostil o buff de velocidad debe
  respetar (o documentar) los modificadores.
- **Animación**: Ataque Celeste debe reproducir `charge` durante 0,8 s y
  `strike` después.
- **Spawns**: en un mapa con varios respawns, cada jugador debe mirar al centro
  desde su propio spawn. El spawn inicial debe pasar por `resolvePosition` y el
  HUD debe mostrar el `terrainMultiplier` y el motivo del terreno del spawn
  también durante la cuenta atrás.
- **Balance**: la tabla de §4.2 debe incluir las 24 especies y la matriz de §4.3
  debe seguir generándose con las 15 que tienen moveset, Tyranitar y Groudon
  incluidos.

Un script de balance como el usado para este informe se puede añadir a
`scripts/balance-report.mjs` para regenerar las tablas tras cada cambio.

---

## 7. Lo que está bien

- La separación por responsabilidades (builder, estrategias, efectos, FX,
  estado) es clara y facilita el ajuste.
- La fórmula oficial, el STAB, la tabla de tipos, el crítico, la precisión y el
  mínimo de 1 están correctamente implementados.
- La lógica de dash por tramos contra obstáculos, el choque de melees, la
  cancelación de windup, la invulnerabilidad de respawn y la no-letalidad del
  autodaño son mecánicas coherentes y bien encapsuladas; queda el cabo de
  colisión de §3.10.
- La variedad de formas y VFX es amplia; el problema no es la arquitectura, sino
  los números y unos pocos chequeos de orden.
- El frame separa el turno de cada jugador de la resolución del combate: las
  habilidades instantáneas se encolan y se aplican después de todos los
  `stepPlayer`, así que el slot no decide quién golpea primero. Los golpes de
  dash se encolan igual y revalidan el tramo guardado (distancia y línea de
  visión) antes de aplicarse.
- La curación por impacto está centralizada en `applyAbilityDamage` con un token
  por lanzamiento: funciona en todas las formas y no se multiplica por número de
  objetivos o de ticks.
- La visibilidad de la mayoría de los FX comparte el criterio de rango,
  ocultación y línea de visión, y los árboles proyectan sombra como oclusores.
  Excepción deliberada: los proyectiles ignoran la ocultación por terreno para
  verse al cruzar vegetación, pero siguen respetando muros, rocas y montañas
  (`a8f2345`).
- Los instintos comunes están bien separados del kit: la definición, el estado
  del jugador, la ejecución y el HUD tienen responsabilidades distintas, y
  Protección/Impulso comparten el `castLockTimer` existente en lugar de crear un
  sistema de bloqueo paralelo.
- Los commits `fix melee` y `fix inmune` van en la dirección correcta: la melee,
  las áreas, los dashes y los proyectiles comprueban todos los colliders, el
  proyectil barre también a los objetivos y el choque revalida los golpes. La inmunidad de tipo se comprueba antes de
  cualquier efecto: no hay daño, ni estado, ni impacto, ni control.
