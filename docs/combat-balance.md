# Estudio del sistema de combate y del balance

> Análisis estático del código + simulación numérica con las fórmulas reales del
> juego. No se ha modificado ningún archivo de jugabilidad.
>
> Fecha: 2026-10-31 · Nivel de combate: 50 · IV 31 / EV 0 · naturaleza neutra.

## Resumen ejecutivo

El motor de combate está bien separado y la fórmula de daño, la tabla de tipos y
el cálculo de stats son correctos. Los problemas graves están en **la cobertura
de movesets, la resurrección, el control de los golpes inmunes y el reparto de
poder entre especies**.

Los cinco hallazgos más importantes:

1. **9 de las 22 especies seleccionables no tienen ninguna habilidad.** Eevee,
   Onix, Zapdos, Raikou, Entei, Suicune, Lugia, Ho-Oh y Celebi se pueden elegir
   en `/roster`, pero entran a la partida con los cuatro huecos vacíos.
2. **Al reaparecer se reinician todos los enfriamientos** y además se tienen 2 s
   de invulnerabilidad. Morir es una forma de resetear la definitiva; un
   Pokémon invulnerable puede atacar sin riesgo durante esos 2 s.
3. **Un golpe inmune (0 de daño) también interrumpe.** El bloqueo de control se
   aplica antes de comprobar si el daño es 0, así que un Placaje Normal cancela
   el dash o el windup de Gengar aunque Ghost sea inmune a Normal.
4. **El cuerpo a cuerpo y las áreas ignoran muros, rocas y separadores**,
   mientras que haces, proyectiles y dashes sí los respetan. Se puede golpear a
   través de una montaña con una melee o una definitiva de área.
5. **Hay una diferencia de poder de 3,5× entre el mejor y el peor combo**. Seis
   personajes superan el 100 % de la vida media con una rotación, y Moltres y
   Gengar pueden matar de 100-0 a los 12 rivales. Mewtwo, Moltres y Gengar son
   los casos más extremos; Pikachu, Bulbasaur, Squirtle y Voltorb están muy por
   debajo.

Además, **Mewtwo y Mew no pueden hacer daño a Greninja**: todo su kit ofensivo
es Psíquico y Greninja es Agua/Siniestro (inmune a Psíquico). No hay movimientos
de cobertura, así que la inmunidad es total.

---

## 1. Cómo funciona el combate

### Flujo de una habilidad

```
input (edge) → castAbility()
  ├─ comprueba alive, pendingCast, dash y cooldown
  ├─ inicia cooldown
  ├─ fija actionTimer / animación
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
          ├─ slow
          ├─ computeDamage (stats, STAB, tipos, crítico, random)
          ├─ impacto + número flotante
          ├─ control (cancela dash/windup) — ⚠️ antes del chequeo de daño
          ├─ resta HP
          ├─ hitstun + knockback
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

`src/game/pokedex.ts:73-87` calcula HP y stats finales con IV 31 / EV 0. Los
valores base son los reales de la especie. Esto hace que las especies con base
stats legendarios sean intrínsecamente más fuertes antes de mirar habilidades.

### Formas y reglas

- **melee**: cono con `range` y `halfAngle`. Bloquea movimiento `moveLock` = 0,5
  × `castTime` por defecto.
- **projectile**: avanza a `projectileSpeed`, se detiene en colliders y a
  `range`.
- **beam**: instantáneo, se corta en el primer collider y atraviesa a todos los
  rivales en línea.
- **aoe**: círculo centrado a `range` del lanzador. `instant` o `overTime`;
  `radialDamage` interpola del 100 % en el centro a `radialMinDamage` en el
  borde.
- **dash**: se reparte en pasos y comprueba colliders por tramo.
- **self**: buffs, curación o utilidad centrada en el lanzador.

**Estados**: ralentización (`slow`) y buffs (`speed`, `attack`, etc.). No hay
quemadura, veneno, sueño ni parálisis completa; la «parálisis» de este juego es
una ralentización.

**Reaparición**: 5 s, 2 s de invulnerabilidad, vida al máximo y **cooldowns a 0**
(`src/game/game.ts:1081-1110`).

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

## 3. Fallos de implementación

### 3.1. Cobertura: 9 especies sin moveset (crítico)

`MOVESETS` solo define 13 ids (`src/game/abilities.ts:1491-1523`). El roster
muestra las 22 especies de `public/sprites/manifest.json` y
`src/ui/RosterScreen.tsx:116-183` no filtra ni avisa.

`src/game/game.ts:357` hace:

```ts
const moveset = MOVESETS[config.pokemonId] ?? [null, null, null, null];
```

y `game.ts:424` guarda `abilityIds: [...moveset]`. El HUD muestra cuatro veces
«Sin asignar». Esas especies no pueden atacar, defenderse ni usar ninguna
habilidad; solo caminan.

**Especies afectadas**: Eevee (0133), Onix (0095), Zapdos (0145), Raikou (0243),
Entei (0244), Suicune (0245), Lugia (0249), Ho-Oh (0250), Celebi (0251).

**Impacto**: partidas perdidas por elección, frustración y una parte importante
del roster inutilizable.

**Arreglo mínimo**: filtrar el roster a las especies con moveset (o marcarlas
como «no disponible») hasta que tengan habilidades.
**Arreglo completo**: añadir movesets. Todas ellas ya tienen animaciones
`attack`, `hurt`, `shoot` y `charge` en el manifiesto, así que no hace falta
volver a importar sprites para empezar.

### 3.2. Los cooldowns se reinician al reaparecer (crítico)

`src/game/game.ts:1100` hace `player.cooldowns = [0, 0, 0, 0]` dentro de
`respawnPlayer()`. Los cooldowns ya corren mientras el jugador está KO porque
`stepPlayer()` los decrementa antes del `if (!player.alive)` (`game.ts:676-707`).

Consecuencias:

- Una definitiva de 15-18 s se puede usar, morir y volver a tenerla lista a los
  5 s. Morir «cuesta» un punto, pero regala un reset de ult.
- Al reaparecer se tienen 2 s de invulnerabilidad **y** todas las habilidades
  listas. Un jugador puede lanzar la rotación completa desde la protección de
  spawn sin poder ser interrumpido.
- `canHit` solo comprueba la invulnerabilidad del objetivo (`game.ts:1259-1266`);
  no impide atacar mientras se es invulnerable. La protección de spawn es
  ofensiva.

**Arreglo**: quitar el reset de cooldowns (dejar que sigan corriendo durante los
5 s de muerte) y, opcionalmente, retirar la invulnerabilidad al atacar o
impedir lanzar habilidades durante el primer segundo.

### 3.3. Un golpe inmune interrumpe igualmente (alto)

`applyAbilityDamage()` aplica el bloqueo de control **antes** de comprobar el
daño (`src/game/game.ts:1337-1347`):

```ts
const control = options.control ?? true;
if (control) {
  target.actionTimer = 0;
  target.moveLockTimer = 0;
  target.dash = null;
  this.cancelPendingCast(target);
}
if (result.damage <= 0) return;
```

Por tanto, un Placaje/Arañazo Normal contra Gengar (inmune a Normal) hace 0 de
daño, pero **igualmente cancela el dash y el windup de Gengar**, muestra un
impacto y un número «0». Lo mismo ocurre con cualquier inmunidad de tipo.

**Impacto**: las inmunidades no protegen del control; los starters pueden
interrumpir a Gengar con su básica inútil. Además, el feedback visual miente
(impacto + «0»).

**Arreglo**: mover el bloqueo de control después de `if (result.damage <= 0)
return;`, o condicionarlo a `result.effectiveness > 0`. Para habilidades de
estado con `slow`, mantener el efecto de estado aparte.

### 3.4. Melee y áreas atraviesan muros (alto)

- `executeMelee` (`abilityExecutors.ts:81-106`) comprueba distancia y cono, pero
  no `deps.world.colliders`.
- `executeAoe` (`abilityExecutors.ts:194-233`) no comprueba colliders ni línea
  de visión: el centro del área puede estar detrás de una montaña y el daño
  pasa igual.
- En cambio, `executeBeam` usa `raycastColliderDistance` y
  `segmentBlockedByColliders`; los proyectiles usan `pointBlockedByColliders`; y
  `dashPosition` usa `segmentBlockedByColliders` (`game.ts:1875-1918`).

**Impacto**: se puede golpear a través de muros, rocas y separadores con melee y
con definitivas de área (Psicoataque, Anillo Ígneo, Lluevehojas, Ventisca,
Ataque Celeste, etc.). Es inconsistente con el resto del sistema y explotable.

**Arreglo**: reutilizar `segmentBlockedByColliders` para la melee (del lanzador
al objetivo) y comprobar que el centro/área no está dentro de un collider (o que
la línea hasta el centro está libre) antes de aplicar el daño.

### 3.5. El radio real del área es mayor que la marca del suelo (alto)

- El telegraph se dibuja con `def.radius` (`game.ts:1162-1171`).
- El daño se aplica si `distance <= def.radius + CONFIG.player.radius`
  (`abilityExecutors.ts:225-226`), y el radio del jugador es 0,42 u.
- Los proyectiles y la melee hacen lo mismo, pero en el área es más visible
  porque el jugador lee el círculo del suelo como el límite exacto.

**Impacto**: te pueden golpear con una definitiva estando claramente fuera del
círculo dibujado (hasta 0,42 u fuera; en un área de 3,2 u es un ~13 % más de
radio). En un juego con ultimates telegrafiadas es un problema de justicia.

**Arreglo**: dibujar el telegraph con `def.radius + CONFIG.player.radius`, o
aplicar el daño dentro de `def.radius` y dejar el radio del jugador solo para
proyectiles/melee.

### 3.6. DoT: precisión por tick y +2 plano por tick (medio)

`tickAoe` llama a `applyAbilityDamage` por cada tick
(`src/game/game.ts:1542-1558`). Eso implica:

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

### 3.7. La ralentización se refresca en cada tick y se apila mal (medio)

`applySlow` usa `slowTimer = max(...)` y `slowMultiplier = min(...)`
(`game.ts:1269-1277`). Los ticks de un área vuelven a llamar a `applySlow` cada
`aoeTickInterval`.

- Bomba Lodo: slow de 1,5 s, área de 2,5 s, ticks cada 0,5 s → un rival que se
  queda dentro está ralentizado **2,5 s + 1,5 s = 4 s**, no 1,5 s.
- Si se aplica un slow débil (×0,70, 2 s) cuando aún queda un slow fuerte
  (×0,55, 0,1 s), el temporizador se extiende a 2 s y el multiplicador se queda
  en ×0,55: el slow fuerte dura más de lo que debería.

**Arreglo**: guardar el slow dominante con su propio tiempo restante, o
recalcular el multiplicador a partir de una lista de efectos activos.

### 3.8. Proyectiles y áreas de jugadores muertos siguen dañando y puntuando (bajo-medio)

`canHit` no comprueba `attacker.alive` (`game.ts:1259-1266`). `updateProjectiles`
y `updateActiveAoes` tampoco. Un proyectil lanzado antes de morir puede matar
después y sumar el KO al jugador muerto.

Puede ser intencionado (proyectiles en vuelo), pero conviene decidirlo y
documentarlo; si no, un área persistente de un jugador muerto sigue presionando
una zona durante 2,5 s.

### 3.9. Posible túnel de proyectiles a pocos FPS (bajo, condicional)

`updateProjectiles` comprueba colisión solo en la posición final del frame
(`game.ts:1472-1512`). A 20 FPS (dt tope 0,05) y 20 u/s (shuriken de Greninja)
el proyectil avanza 1 u por frame. Contra colliders finos (árboles de radio
~0,22) la zona de colisión es de ~0,92 u de diámetro, así que puede atravesarlos.

**Arreglo**: comprobar el segmento recorrido con `segmentBlockedByColliders`, no
solo el punto final.

### 3.10. `healOnHit` cura aunque el golpe haga 0 (bajo)

En `executeBeam`, `hitAny` se pone a `true` tras llamar a `applyAbilityDamage`
aunque el objetivo sea inmune o el daño sea 0
(`abilityExecutors.ts:184-191`). Hoy ningún haz tiene una inmunidad relevante,
pero si se añade un Pokémon Normal, `Come Sueños` curaría sin hacer daño.
**Arreglo**: que `applyAbilityDamage` devuelva si aplicó daño real y usar eso
para `hitAny`.

### 3.11. La visión no interviene en el combate (alto, diseño)

`canHit` no consulta `isTargetVisible`. Las habilidades se lanzan por `facing` y
pueden impactar a objetivos que el atacante no ve, y viceversa. La niebla es solo
de render.

Esto crea ventajas difíciles de leer:

- Mewtwo tiene 12 u de visión y Psíquico 10 u; Bulbasaur tiene 8 u de visión. En
  hierba alta, Scyther (que comparte tipo Bicho con el terreno) pasa de 10,8 u a
  ~3,5 u efectivos (0,45 × 1,5 de ocultación), mientras Mewtwo le dispara desde
  10 u. Bulbasaur, en la misma hierba alta, baja a ~4,4 u.
- No hay «me han visto al atacar» ni indicador de dirección del daño. El
  atacante puede matar desde fuera de la pantalla del rival.

**Arreglo**: revelar al atacante unos segundos al hacer daño, o añadir un
indicador de dirección de impacto, o limitar el alcance ofensivo al rango de
visión efectivo.

### 3.12. La Explosión de Voltorb es gratis a 1 PV (bajo)

`applySelfDamage` calcula `amount = min(raw, max(0, hp - 1))` y no resta nada si
estás a 1 PV (`game.ts:1246-1257`). Como el autodaño nunca mata, un Voltorb a
1 PV puede usar Explosión sin coste. No es un exploit enorme, pero sí una
inconsistencia: el coste desaparece justo cuando más debería importar.

**Arreglo**: añadir un autodaño mínimo (p. ej., 5 PV), un autostun de 0,5 s tras
Explosión, o aceptar que el 1 PV es una excepción documentada.

---

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
- Los combos son una **cota superior** y una medida relativa, no una promesa de
  daño real: en la práctica hay rangos, windups, dashes y esquivas.

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
(sin GCD compartido; es una cota). `Combo neutro` = daño de las 4 habilidades
contra el objetivo neutro. `% vida media` = combo medio contra las 12 especies
jugables, dividido por su HP. `100-0` = número de rivales a los que el combo
completo les quita toda la vida.

| Pokémon | DPS básica | DPS sostenido | Combo neutro | % vida media | 100-0 | Sin daño |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Mewtwo | 102 | 126 | 294 | 249 % | 10/12 | 1 |
| Moltres | 78 | 108 | 247 | 222 % | 12/12 | 0 |
| Gengar | 35 | 61 | 244 | 197 % | 12/12 | 0 |
| Greninja | 57 | 106 | 201 | 184 % | 10/12 | 0 |
| Articuno | 67 | 86 | 212 | 173 % | 10/12 | 0 |
| Scyther | 92 | 107 | 194 | 156 % | 8/12 | 0 |
| Lucario | 74 | 97 | 222 | 148 % | 7/12 | 0 |
| Charmander | 41 | 57 | 143 | 127 % | 7/12 | 0 |
| Voltorb | 36 | 43 | 122 | 113 % | 5/12 | 0 |
| Squirtle | 49 | 67 | 109 | 89 % | 4/12 | 0 |
| Mew | 116 | 122 | 99 | 84 % | 5/12 | 1 |
| Pikachu | 53 | 82 | 85 | 74 % | 3/12 | 0 |
| Bulbasaur | 49 | 59 | 101 | 70 % | 4/12 | 0 |

**Lectura**:

- La diferencia entre el mejor combo medio (Mewtwo 249 %) y el peor (Bulbasaur
  70 %) es de **3,5×**.
- Moltres y Gengar pueden **matar de 100-0 a los 12 rivales** con una rotación.
- Mewtwo, Greninja y Articuno pueden hacerlo contra 10 de 12.
- Pikachu, Bulbasaur y Squirtle no llegan al 100 % de la vida media; necesitan
  más de una rotación para matar a un rival medio.
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

Dos observaciones:

1. **Las básicas de los starters hacen 12-13 de daño neutro**, mientras Mewtwo
   hace 61, Scyther 37, Greninja 37, Mew 35. El ataque básico más débil hace
   ~5× menos daño por golpe que el más fuerte. La cadencia de Placaje (0,25 s)
   compensa en DPS, pero no en burst, hitstun ni presión.
2. **Las definitivas varían entre 48 (Anillo Ígneo) y 129 (Psicoataque)** contra
   el mismo objetivo neutro. La de Voltorb (83) cuesta 40 PV y 18 s; la de
   Mewtwo (129) no cuesta nada y dura 15 s.

### 4.5. Matriz de combos (% de la vida del objetivo)

Cada celda es el daño de las 4 habilidades del atacante (fila) contra el rival
(columna), como porcentaje de la vida máxima del rival. `—` es el mirror.

```
Atacante     Pika Vol Geng Bulb Char Squi Luca Gren Arti Molt Mew2 Mew  Scyt
Pikachu       —   66%  45%  60% 107% 144%  54% 107%  66%  83%  44%  43%  99%
Voltorb      95%   —   83%  73% 156% 223%  86% 172%  99% 130%  61%  59% 156%
Gengar      316% 287%   —  241% 302% 240% 136% 118% 104% 139% 212% 200% 168%
Bulbasaur   139% 119%  36%   —   73% 187%  38% 143%  26%  20%  51%  49%  23%
Charmander  197% 170% 108% 278%   —   77% 214%  58% 122%  44%  74%  72% 188%
Squirtle    146% 126%  78%  63% 259%   —   77%  45%  49% 117%  55%  52%  75%
Lucario     294% 248%  35% 168% 274% 202%   —  275% 128%  70%  73%  69%  73%
Greninja    275% 236% 306% 196% 302% 178%  89%   —   92% 134% 183% 173% 138%
Articuno    254% 228% 171% 430% 159% 124%  95%  95%   —  122% 108% 103% 292%
Moltres     211% 181% 211% 544% 292% 217% 236% 168% 139%   —  125% 119% 340%
Mewtwo      381% 340% 461% 577% 368% 295% 224%   0% 125% 171%   —   70% 203%
Mew         129% 114% 156% 191% 124%  99%  75%   0%  41%  58%  24%   —   68%
Scyther     252% 209%  78% 293% 168% 191%  65% 263%  61%  47% 170% 161%   —
```

**Casos extremos**:

- **Mewtwo → Bulbasaur 577 %**, → Gengar 461 %, → Pikachu 381 %. Una rotación
  mata a casi todo el roster.
- **Moltres → Bulbasaur 544 %**, → Scyther 340 %, → Charmander 292 %.
- **Gengar → Pikachu 316 %**, → Greninja 306 %, → Charmander 302 %. Gengar
  mata de 100-0 a los 12 rivales.
- **Greninja → Gengar 306 %**, → Charmander 302 %, → Pikachu 275 %.
- **Scyther → Bulbasaur 293 %**, → Greninja 263 %, → Pikachu 252 %; pero solo
  78 % a Gengar, 61 % a Articuno y 47 % a Moltres. Es muy polarizado.
- **Pikachu → Squirtle 144 %** y → Charmander 107 % / Greninja 107 %, pero solo
  44-45 % a Mewtwo/Gengar. Es un counter de Agua/frágiles, no un personaje
  generalista.
- **Bulbasaur → Squirtle 187 %**, → Greninja 143 %, pero 20-36 % a Moltres/Gengar.
- **Squirtle → Charmander 259 %**, pero 45-78 % a Greninja/Gengar/Bulbasaur.
- **Voltorb → Squirtle 223 %**, → Greninja 172 %, pero 61-83 % a Mewtwo/Gengar.

**Inmunidades totales**:

- **Mewtwo y Mew no pueden dañar a Greninja** (todo su kit ofensivo es Psíquico
  y Greninja es Agua/Siniestro; Psíquico → Siniestro = 0).
- **Las básicas Normal de Pikachu, Bulbasaur, Squirtle y Charmander hacen 0 a
  Gengar** (Ghost inmune a Normal). Sus otras habilidades siguen funcionando,
  pero pierden su ataque de relleno.
- **Lucario solo puede dañar a Gengar con Garra Metal** (Fighting → Ghost = 0;
  su Esfera Aura y Combate Cercano son Fighting). Su combo contra Gengar es del
  35 %.
- **Bomba Lodo (Veneno) hace 0 a Lucario (Acero)**, pero **la ralentización sí
  se aplica** porque el slow se resuelve antes del daño.
- **Scyther contra Gengar/Moltres/Articuno** hace 0,25×-0,5× con su básica; es
  uno de sus peores matchups.

### 4.6. El problema de los windups

Cualquier golpe cancela el `PendingCast` (`game.ts:1337-1345`). Las básicas más
rápidas tienen cadencias de 0,25-0,4 s. Las definitivas con windup son:

| Habilidad | Windup | Quién |
| --- | ---: | --- |
| Rayo | 0,50 s | Pikachu |
| Giro Fuego | 0,50 s | Charmander |
| Explosión | 0,60 s | Voltorb |
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

- Los personajes con más alcance también tienen más visión y, salvo Gengar,
  buena velocidad. La combinación «te veo antes + te pego desde más lejos +
  puedo escapar» no tiene contrapeso.
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
- Con 1 PV el autodaño es 0 (ver 3.12).
- Su combo medio es 113 % de la vida media, pero gran parte viene de los
  matchups 2× contra Agua/Volador (Squirtle, Greninja, Moltres, Scyther). Contra
  un objetivo neutro su DPS sostenido es el más bajo del roster (43).

Como definitiva de una rotación de 18 s, 83 de daño y 40 de autodaño no
compensa; como herramienta de teamfight de 4,2 u sí puede ser útil, pero el
autodaño la convierte en una mala elección en 1v1.

---

## 5. Prioridades de arreglo

### P0 — rompe la partida

1. **Cobertura de movesets**: o se añaden los 9 movesets que faltan, o se
   filtran/marcan esas especies en el roster. Mientras no tengan habilidades, no
   deberían poder seleccionarse.
2. **Respawn**: quitar `player.cooldowns = [0, 0, 0, 0]` de `respawnPlayer()`;
   los cooldowns ya corren durante la muerte. Y decidir si la invulnerabilidad
   debe romperse al atacar (recomendado: sí).
3. **Inmunidad + control**: mover el bloqueo de control después del chequeo de
   daño; un golpe de 0 no debe cancelar dash/windup ni mostrar impacto.

### P1 — exploits y justicia

4. **Línea de visión en melee y AoE**: reutilizar
   `segmentBlockedByColliders`/`raycastColliderDistance` para que muros, rocas y
   separadores bloqueen también estos golpes.
5. **Radio del telegraph**: que el círculo dibujado incluya el radio del jugador
   o que el daño use exactamente el radio dibujado.
6. **DoT**: una tirada de precisión por área/entrada y el +2 de la fórmula una
   vez por área; o compensar la potencia por tick.
7. **Slow**: resolver el apilamiento con el efecto dominante y su tiempo
   restante, no con `max(timer)` + `min(multiplier)`.
8. **Visión/alcance**: revelar al atacante al hacer daño o añadir un indicador de
   dirección; si no, los personajes de largo alcance pueden matar desde fuera de
   la vista del rival.
9. **Cobertura de tipos**: dar al menos un movimiento de cobertura a cada
   Pokémon, o suavizar las inmunidades en PvP. Sin cobertura, Mewtwo/Mew vs
   Greninja es un 0 % literal.

### P2 — ajuste de balance

10. **Presupuesto común de daño**: fijar objetivos, por ejemplo:
    - Básica: 40-75 DPS contra objetivo neutro, con las de rango/velocidad en la
      parte baja y las melee lentas en la alta.
    - Combo completo: 90-140 % de la vida media (hoy hay 70-249 %).
    - Definitiva: 60-110 de daño neutro, 12-18 s de cooldown, con el daño extra
      compensado por utilidad/alcance/autodaño.
11. **Básicas de los starters**: dar STAB a Pikachu/Bulbasaur/Squirtle/Charmander
    (por ejemplo, cambiar Placaje/Arañazo por un golpe elemental) o subir su
    potencia a 55-60. Hoy son 12-13 de daño neutro frente a 35-61 de los
    personajes con STAB.
12. **Mewtwo**: bajar Telequinesis de 55 a 45 de potencia, cooldown de 0,6 a
    0,8 s, knockback de 1,4 a 0,6-0,7 u y alcance de 2,5 a 2,2 u; Psíquico de 95
    a 85; Psicoataque de 125 a 110; velocidad de 7,8 a 7,2 y visión de 12 a 10,5.
13. **Gengar**: Bola Sombra 70 → 60; Come Sueños 90 → 80, curación 15 % → 10 %,
    cooldown 11 → 12; Bomba Lodo 25 → 20/s o cooldown 9 → 10.
14. **Greninja**: Shuriken 45 → 40, cooldown 0,65 → 0,75; Tajo Umbrío 70 → 60;
    Pulso Umbrío 95 → 85, cooldown 10 → 11.
15. **Moltres/Articuno**: Ataque Celeste 130 → 115; Ventisca 110 → 100; Onda
    Ígnea 65 → 55; Viento Gélido 55 → 50; cooldowns de las definitivas 15 → 16.
16. **Scyther**: Golpe Furia 45 → 38 o cooldown 0,4 → 0,5; Tijera X 130 → 115;
    Danza Espada 1,35 → 1,30.
17. **Lucario**: Combate Cercano 125 → 115; Esfera Aura 60 → 55.
18. **Pikachu**: Rayo 90 → 100 y cooldown 8 → 7; Impactrueno 40 → 50 y cooldown
    0,9 → 0,8; básica elemental de ~45 de potencia.
19. **Bulbasaur**: Hoja Afilada 60 → 70 y cooldown 5 → 4,5; Lluevehojas 120 →
    130; Paralizador 10 → 8; valorar velocidad 4,2 → 4,6 o darle un dash corto.
20. **Squirtle**: Hidrobomba 115 → 125 y precisión 90 → 95; Rayo Burbuja 65 → 70;
    Acua Jet 45 → 55; valorar velocidad 4,8 → 5,1.
21. **Charmander**: Arañazo elemental de ~48 o subir la básica a 50; Anillo Ígneo
    110 → 120; Giro Fuego 35 → 40; valorar un dash corto o más velocidad.
22. **Voltorb**: Explosión 175 → 220, autodaño 0,35 → 0,25, cooldown 18 → 16;
    Chispa 65 → 70; añadir un autostun corto tras Explosión para que no sea un
    escape gratis.
23. **Burst global (opcional)**: si se quiere alargar el TTK, aplicar un
    multiplicador global de daño de 0,85-0,90 en PvP o subir la vida un 10-15 %.
    Con los combos actuales, una rotación completa puede matar en ~1 s.

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
- **Respawn**: un test de integración que compruebe que los cooldowns no se
  reinician al reaparecer.
- **DoT**: que el daño total de un área `overTime` con precisión 100 sea igual a
  `power × duration` (con la tolerancia de la fórmula), y que la precisión se
  tire una vez, no por tick.

Un script de balance como el usado para este informe se puede añadir a
`scripts/balance-report.mjs` para regenerar las tablas tras cada cambio.

---

## 7. Lo que está bien

- La separación por responsabilidades (builder, estrategias, efectos, FX,
  estado) es clara y facilita el ajuste.
- La fórmula oficial, el STAB, la tabla de tipos, el crítico, la precisión y el
  mínimo de 1 están correctamente implementados.
- La lógica de dash por tramos, el choque de melees, la cancelación de windup,
  la invulnerabilidad de respawn y la no-letalidad del autodaño son mecánicas
  coherentes y bien encapsuladas.
- La variedad de formas y VFX es amplia; el problema no es la arquitectura, sino
  los números y unos pocos chequeos de orden.
