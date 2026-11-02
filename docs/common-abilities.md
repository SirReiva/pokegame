# Habilidades comunes («Instintos») — v9 (decisiones cerradas)

> Documento de diseño. Los valores son puntos de partida, no cifras cerradas.

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Qué es «oculto» | No visible para **ningún enemigo vivo**. Usa visión, niebla y línea de visión |
| Retardo | **3 s** oculto antes de empezar a curar |
| Regeneración | **1 PV fijo por segundo** (no porcentaje), con acumulador interno |
| Tope | **Sin tope** mientras siga oculto |
| Activación | **Pasiva**, sin botón ni cooldown |
| Cortes | Ser visto, **perder HP** (incluido cada tick de DoT), atacar o **usar cualquier habilidad**, morir o reaparecer. Un slow o empuje sin daño **no** corta |
| Gracia de visibilidad | **0,2 s** antes de reiniciar el contador si la visibilidad parpadea |
| Movimiento | **No corta** la regeneración mientras siga oculto |
| Base | **Misma regla**: si ningún enemigo te ve, cuenta como oculto. Al reaparecer la vida ya está al máximo |
| Icono | **Solo lo ve el jugador**. El rival nunca lo ve mientras regenera: si lo ve, la regeneración ya está cortada |
| Uso de activos | Solo si **no estás casteando, ni en dash, ni en hitstun** |
| Bloqueo de casteo | Comparten el mismo `castLockTimer` que una habilidad no melee |
| Protección | Reduce un 40 % **todo el daño recibido** durante 2 s, incluidos DoT y áreas; no el autodaño. Ralentiza un 20 % y bloquea otras habilidades mientras está activa |
| Animación de Protección | **Ninguna por defecto**; cada Pokémon puede definir una o no. El escudo esférico siempre aparece |
| Color del escudo | **`accent` del Pokémon** en el manifiesto de sprites, no el color del equipo |
| Impulso | Distancia fija; **no atraviesa enemigos ni separadores**; se detiene al chocar |
| Selección | **Por Pokémon**, cambiable en el roster y **visible para ambos equipos en el lobby** |
| Tecla | **I** en teclado y **RT** en mando |
| HUD | **Cuenta atrás de 3 s** y luego estado activo |

## Decisión

El set queda en **tres instintos**:

1. **Protección** — activo, defensa.
2. **Impulso** — activo, movilidad.
3. **Regeneración** — pasivo, sustain condicionado.

Cada Pokémon elige **uno**. Los dos primeros ocupan un botón; el tercero no: es una condición pasiva que premia jugar oculto.

Por ahora el set está cerrado en estos tres: no se añaden más instintos hasta validarlos.

## Por qué estos tres

- **Protección e Impulso** son universales, periódicos y fáciles de leer: aguantar el burst o reposicionarse.
- **Regeneración** cubre el sustain sin añadir otro botón y sin obligar a curarse en mitad de la pelea. Su condición —estar oculto— ya existe en el juego gracias a la visión, la niebla y la ocultación por terreno.
- El resto de la v2 seguía siendo situacional, débil o solapado con los kits.

La diferencia con la antigua «Recuperación» es importante: aquella era un botón de curarse un 6 % cada 9 s, y se notaba poco. **Regeneración no es un botón**: es una recompensa por romper la línea de visión y desaparecer un rato.

## Núcleo activo

### Protección

**Efecto:** durante 2 s, el Pokémon recibe un 40 % menos de daño y su velocidad normal se multiplica por 0,8 (−20 %). Se aplica a todo el daño recibido, incluidos DoT y áreas, pero no al autodaño.

**CD:** 8 s.

**Reglas:**

- No impide slow, empuje ni stun.
- No se acumula con otros buffs de defensa hasta volverse invulnerable; el tope total de reducción es del 65 %.
- **Mientras está activa no se puede usar ninguna otra habilidad**, incluida la básica.
- La reducción de velocidad se mantiene **todo el tiempo que el escudo está activo**, no solo al lanzarlo.
- Afecta a la velocidad de movimiento normal; los dash de kit conservan su distancia.
- Solo se puede usar si no estás casteando, ni en dash, ni en hitstun.
- Se puede usar mientras se mueve.
- Lanzarla **no frena al Pokémon**: conserva su inercia (`preserveMomentum`) y solo se ajusta al multiplicador 0,8× mientras dura el escudo.
- Comparte el mismo `castLockTimer` que una habilidad no melee.
- VFX muy visible: el rival debe saber que está activa.

**Contrajuego:** baitearla con un ataque débil, usar control para que no sirva o mantener daño sostenido.

**Palancas de ajuste:**

| Palanca | Rango |
|---|---|
| Reducción | 35-45 % |
| Duración | 1,5-2,5 s |
| Cooldown | 7-10 s |
| Velocidad mientras está activa | 0,7-0,9× |

**Implementación:** `damageReductionTimer` en el estado del jugador; aplicar el multiplicador a cada golpe y a cada tick de daño antes de restar vida en `src/game/game.ts`. Mientras el timer sea > 0, multiplicar la velocidad normal por `shieldSpeedMultiplier`.

**Escudo esférico:**

- Al usar Protección siempre aparece una **esfera de escudo** alrededor del Pokémon durante los 2 s que dura la reducción. Está centrada en el cuerpo, no en el suelo.
- El color es el **`accent` del Pokémon** en `public/sprites/manifest.json` (el mismo que usa el roster). No usa el color del equipo ni el de la habilidad.
- La esfera sigue al Pokémon y se desvanece suavemente. No lleva **anillo horizontal**: el brillo exterior lo aporta una capa aditiva envolvente.
- El centro es una esfera translúcida de baja opacidad para no tapar el sprite.
- Si absorbe daño, puede emitir una onda o pulso en el punto de impacto. Es opcional, pero ayuda a leer la mitigación.
- Debe ser visible para ambos equipos: es información de combate, no un efecto privado.

**Animación:**

- Por defecto, Protección **no reproduce ninguna animación** (`animation: null`).
- Cada Pokémon puede definir una animación propia o dejarla desactivada.
- La animación, si existe, se reproduce al inicio del uso y no condiciona la duración del escudo.
- Sin entrada en el mapa de overrides no hay animación; un override `null` también la desactiva.
- La resolución se hace al ejecutar la habilidad con `commonAnimationFor(pokemonId, 'proteccion', def)`.

Forma de datos propuesta:

```ts
export const COMMON_ANIMATION_OVERRIDES: Record<
  string,
  Partial<Record<CommonAbilityId, AnimationName | null>>
> = {
  // '0025': { proteccion: 'charge' },
  // '0004': { proteccion: null } // sin animación
};

export function commonAnimationFor(
  pokemonId: string,
  abilityId: CommonAbilityId,
  def: AbilityDef
): AnimationName | null {
  const override = COMMON_ANIMATION_OVERRIDES[pokemonId]?.[abilityId];
  return override === undefined ? def.animation : override;
}
```

El color del escudo no necesita tabla nueva: se toma de `SpriteAsset.entry.accent`. Si faltara, se usa el color del tipo primario y, como último recurso, blanco.

### Impulso

**Efecto:** dash de 2,2 u en la dirección en la que mira el Pokémon. Sin daño, sin i-frames. Se detiene al chocar con muros, separadores o enemigos.

**CD:** 7 s.

**Reglas:**

- Más corto y más débil que los dash de kit (4-5 u, 4-8 s).
- No cancela animaciones ni `windup`.
- No atraviesa enemigos ni separadores: se detiene en el primer choque.
- Distancia y duración fijas; no escalan con la velocidad ni con slows.
- Solo se puede usar si no estás casteando, ni en dash, ni en hitstun.
- Comparte el mismo `castLockTimer` que una habilidad no melee.
- Animación: `quickstrike`; si la especie no la tiene, el sprite cae a `attack`/`idle`.

**Contrajuego:** paredes, cuerpos enemigos, control, áreas y proyectiles predictivos. Si se usa para entrar, el Pokémon se queda sin escape.

**Palancas de ajuste:**

| Palanca | Rango |
|---|---|
| Distancia | 1,8-2,5 u |
| Cooldown | 6-9 s |
| i-frames | 0-0,1 s |

**Implementación:** reutiliza el sistema de dash existente, añadiendo colisión con enemigos.

## Regeneración

### Efecto

Si el Pokémon permanece **3 s oculto**, a partir de ese momento empieza a recuperar **1 PV por segundo** mientras siga oculto.

- Es un instinto **pasivo**: no tiene tecla ni cooldown.
- No cura durante los primeros 3 s; solo a partir de ahí.
- Se detiene al llegar a la vida máxima.
- No cura si el Pokémon está muerto.
- No tiene tope: mientras siga oculto, sigue curando 1 PV/s.
- Cada PV recuperado muestra un **número flotante verde `+1`**, igual que las curaciones de habilidad.

### Qué significa «oculto»

«Oculto» significa **no visible para ningún enemigo vivo**. Se usa el sistema de visión que ya existe:

- fuera del rango de visión enemigo;
- detrás de una montaña, árbol o muro que corte la línea de visión;
- en terreno de ocultación, si el enemigo no está lo bastante cerca para verlo.

No basta con estar en hierba alta si un enemigo está pegado y te ve. La comprobación debe ser la misma que usa la niebla de guerra.

### Condiciones y cortes

**Empieza a contar cuando:**

- el Pokémon está oculto para todos los enemigos vivos.

**Se reinicia el contador y se detiene la regeneración cuando:**

- un enemigo vuelve a verlo;
- **pierde HP**, incluido cada tick de un área o DoT;
- ataca;
- usa **cualquier habilidad**, incluida una defensiva, de movilidad, buff o curación;
- muere o reaparece.

**No la cortan:**

- un slow o empuje que no quite HP, salvo que también lo deje visible;
- moverse mientras sigue oculto;
- estar a vida máxima (simplemente no hace nada).

**Gracia de visibilidad:** si la visibilidad parpadea en el borde, se conceden **0,2 s** antes de reiniciar el contador. Así un frame visible no arruina la regeneración.

Regla cerrada: **cualquier pérdida de HP, ataque o habilidad corta la regeneración**. Si se permite atacar o usar habilidades desde la hierba y seguir curándose, el instinto deja de ser una recompensa por desaparecer y se convierte en sustain gratis dentro del combate.

### Números iniciales

- Retardo: **3 s**.
- Regeneración: **1 PV/s**.
- Sin tope mientras siga oculto.

Para ponerlo en contexto con la vida del juego:

| Pokémon | Vida aproximada | 1 PV/s equivale a | 10 s oculto |
|---|---:|---:|---:|
| Pikachu | ~110 PV | ~0,9 %/s | ~9 % de su vida |
| Greninja | ~145 PV | ~0,7 %/s | ~7 % |
| Mewtwo | ~181 PV | ~0,55 %/s | ~5,5 % |

No es una curación rápida: es un premio por desaparecer, reposicionarse y volver. Al no tener tope, el límite real es **el tiempo que el jugador acepta dejar de presionar el mapa**.

### Contrajuego

- **Revelar:** ataques en área, empujar hacia zonas visibles o perseguir hasta encontrar.
- **Cortar la ocultación:** entrar en la hierba, rodear la montaña o forzar al Pokémon a salir de la zona oculta.
- **Presión:** si se esconde, deja de presionar el mapa y de generar KO.
- **Burst:** si pierde HP antes de los 3 s, el contador se reinicia.
- **DoT:** un charco de Bomba Lodo, un Terremoto o un Giro Fuego reinician el contador en cada tick. No se puede regenerar dentro de un área dañina.

El coste real no es el cooldown: es **el tiempo que pasa sin participar**.

### Palancas de ajuste

| Palanca | Rango |
|---|---|
| Retardo | 2,5-4 s |
| Regeneración | 1-2 PV/s |
| Tope por ocultación | Sin tope por ahora; revisar si aparece stall |

### Implementación

- Añadir al estado del jugador `hiddenTimer` (segundos oculto), `regenerating` (booleano para HUD) y `regenAccumulator` (para curar 1 PV entero por segundo).
- En el bucle de actualización de `src/game/game.ts`:
  - comprobar si el jugador está oculto para todos los enemigos vivos;
  - si lo está, sumar `dt` a `hiddenTimer`; si la visibilidad parpadea, usar una gracia de `0,2 s` antes de resetear;
  - si `hiddenTimer >= 3`, sumar `dt` a `regenAccumulator`; cuando llegue a 1, curar 1 PV y restar 1 al acumulador;
  - si deja de estar oculto, poner `hiddenTimer = 0` y `regenAccumulator = 0`.
- Reutilizar `isTargetVisible` de `src/game/vision.ts` para la comprobación.
- Al perder HP, resetear `hiddenTimer` y `regenAccumulator` del objetivo. Esto cubre también los ticks de área y DoT.
- Al atacar o lanzar cualquier habilidad, resetear `hiddenTimer` del lanzador.
- Al morir o reaparecer, resetear `hiddenTimer`, `regenerating` y `regenAccumulator`.
- La base no necesita un caso especial: si ningún enemigo lo ve, cuenta como oculto.

### HUD

Al ser pasivo, no ocupa una tecla. Se muestra como **icono de estado** cerca de la barra de vida:

- **Cuenta atrás de 3 s** mientras se acumula la ocultación;
- `Regeneración` cuando está activa;
- se oculta cuando no está oculto o está a vida máxima.

**Solo lo ve el jugador.** El rival nunca ve el icono mientras regeneras: si tiene visión de ti, la regeneración ya está cortada. No se debe filtrar información de posición a través del HUD.

En el roster se elige como cualquier otro instinto, pero con la etiqueta «Pasivo».

## Por qué se descartaron las demás

| Habilidad | Motivo |
|---|---|
| Recuperación activa | 6 % cada 9 s apenas se notaba; Regeneración la sustituye con una condición más interesante |
| Purga | Solo sirve contra slows; muchos kits no la necesitan |
| Onda de Choque | Solo sirve contra melee; los equipos de rango la ignoran |
| Parada | Muy dependiente del timing, solo melee y frustrante de enfrentar |
| Trampa | Situacional y dependiente del mapa |
| Marca | Añade daño y corre el riesgo de volverse obligatoria para los DPS |
| Humo | Niche, compleja de implementar y poco útil sin coordinación |

## Balance entre los tres

- **Protección** compite contra el burst.
- **Impulso** compite contra la falta de movilidad.
- **Regeneración** compite contra el desgaste y el poke, pero exige desaparecer y no usar habilidades.

Riesgos:

- Si **Regeneración** se elige siempre, es que esconderse es demasiado seguro o el castigo por no participar es bajo. Subir el retardo.
- Si **Impulso** domina, bajar distancia o subir CD.
- Si **Protección** domina, bajar reducción o duración.
- Medir **pick rate**, **win rate**, **PV curados por partida** y **tiempo oculto por partida**. El último dato es clave: si es muy alto, el instinto está fomentando pasividad.

## Ritmo de combate

- Protección e Impulso se usan 2-3 veces por pelea de 20 s.
- Regeneración no se «usa»: se activa al romper la visión y desaparecer.
- Como cualquier pérdida de HP, ataque o habilidad corta la regeneración, el instinto es **puramente de desenganche**: no sirve para curarse mientras se lucha.
- El instinto pasivo no debe obligar a estar escondido toda la partida. Si el jugador pasa más de un tercio del tiempo oculto, hay que revisar el mapa, la visión o el valor de la regeneración.

## Implementación general

### Modelo de datos

- Añadir `'common'` a `AbilitySlot` y a `ABILITY_SLOTS` en `src/game/abilities.ts`, o crear un tipo separado `CommonAbilityId`.
- **No meter los instintos en `MOVESETS`.** `MOVESETS` define la identidad del Pokémon; el instinto es una elección de loadout.
- Añadir `commonAbilityId` al loadout o al estado del jugador, con validación de que solo haya uno.
- Ids iniciales: `proteccion`, `impulso`, `regeneracion`.

### Motor

- **Protección:** `damageReductionTimer` en `src/game/matchState.ts`; aplicar a cada golpe y tick de daño; no al autodaño.
- **Escudo de Protección:** `spawnProtectionShield(player, color)`; el color sale de `asset.entry.accent` y la esfera dura lo mismo que `damageReductionTimer`.
- **Animación de Protección:** `COMMON_ANIMATION_OVERRIDES` por `pokemonId` y helper `commonAnimationFor`; usar el helper en todos los puntos donde hoy se lee `def.animation`. Por defecto devuelve `null`.
- **Impulso:** reutilizar el dash actual con colisión contra enemigos y separadores.
- **Regeneración:** `hiddenTimer`, `regenerating` y `regenAccumulator`; comprobación de visibilidad con `isTargetVisible`; gracia de 0,2 s; tick de 1 PV/s en el bucle de `src/game/game.ts`.
- **Cortes de Regeneración:** un helper `breakRegen(player)` que ponga `hiddenTimer = 0`, `regenerating = false` y `regenAccumulator = 0`, llamado desde pérdida de HP, ataque, casteo de cualquier habilidad, muerte y respawn.
- **Activos:** Protección e Impulso comparten el `castLockTimer` de una habilidad no melee y solo se pueden usar si no estás casteando, ni en dash, ni en hitstun.

### Input y HUD

- Quinto slot en `src/ui/MatchHud.tsx` para los activos, con tecla **I** y botón **RT** del mando, y anillo de cooldown.
- Para Regeneración, icono pasivo sin tecla, visible solo para el jugador, con cuenta atrás de 3 s y estado activo.
- Selector de instinto por Pokémon en `src/ui/RosterScreen.tsx`, cambiable en el roster y visible para ambos equipos en el lobby; etiqueta «Activo» o «Pasivo».
- Los activos **sí** comparten el `castLockTimer` global de una habilidad no melee.

### Respawn

- Protección e Impulso: resetear cooldown al reaparecer.
- Regeneración: resetear `hiddenTimer`, `regenerating` y `regenAccumulator`; la vida ya vuelve al máximo.
- La base no es una excepción: si ningún enemigo lo ve, cuenta como oculto; si lo ven, no regenera.

## Plan de iteración

1. Implementar **Protección, Impulso y Regeneración**.
2. Medir pick rate, win rate, PV curados y tiempo oculto.
3. Ajustar primero el retardo de Regeneración; es la palanca que más cambia su feel.
4. Vigilar el «stall»: si la gente pasa demasiado tiempo escondida, subir el retardo o reconsiderar un tope.
5. No añadir más instintos hasta validar estos tres.

## Estado de implementación

Implementado:

- Slot `common` por Pokémon, selector en el roster, vista en el lobby y quinta casilla del HUD.
- Tecla `I` y botón `RT`, con el mismo `castLockTimer` que una habilidad no melee.
- **Protección:** reducción del 40 % durante 2 s, −20 % de velocidad, bloqueo de otras habilidades, tope del 65 %, escudo esférico con el `accent` del Pokémon y sin animación por defecto.
- **Impulso:** dash de 2,2 u sin daño, con colisión contra enemigos y separadores.
- **Regeneración:** 3 s oculto, 1 PV/s con acumulador entero, gracia de 0,2 s y cortes por daño, visibilidad, ataque o habilidad.
- Overrides de animación por Pokémon mediante `COMMON_ANIMATION_OVERRIDES`; el mapa está vacío por ahora.

Pendiente:

- Ajustar radio, opacidad y pulido del escudo, además de SFX.
- Validar el tope del 65 % cuando haya buffs de defensa.
- Añadir overrides de animación concretos si alguna especie los necesita.
- Sincronización en red si el juego deja de ser multijugador local.

## Resumen

El set queda en **Protección, Impulso y Regeneración**: dos botones activos y una recompensa pasiva por romper la línea de visión. Protección reduce un 40 % todo el daño recibido (salvo el autodaño), ralentiza un 20 % y bloquea otras habilidades durante 2 s; Impulso es un dash corto que se detiene en enemigos y separadores; Regeneración premia estar 3 s oculto con 1 PV/s. Los activos solo se usan si no estás casteando, ni en dash, ni en hitstun, y comparten el bloqueo global. Cualquier pérdida de HP, ataque o habilidad corta la regeneración, así que el jugador tiene que elegir entre participar o recuperarse. Protección no tiene animación por defecto: siempre muestra un escudo esférico con el `accent` del Pokémon, y la animación es opcional por Pokémon. La clave es que esconderse cueste algo: tiempo, mapa y presión.


