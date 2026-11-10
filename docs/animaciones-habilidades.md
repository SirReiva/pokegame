# Animaciones y tiempos de habilidad

Este documento describe el sistema de fases de casteo que sustituye al antiguo
par `windup` / `castTime`. La regla de oro:

> **La simulación define los tiempos; el sprite se adapta para que su `HitFrame`
> caiga exactamente en el instante del efecto.**

Así el balance no depende de cómo esté dibujada una especie o una skin, y los
bots, las telegrafías y el HUD pueden predecir el golpe con un único número.

## 1. Fases de una habilidad

Toda habilidad se describe con tres tiempos en `AbilityDef`:

| Campo | Significado |
| --- | --- |
| `startup` | Desde que se pulsa hasta que ocurre el efecto (golpe, proyectil, haz, área…). |
| `active` | Ventana que empieza con el efecto: compromiso del melee, desplazamiento del dash o duración de un haz. Puede ser `0`. |
| `recovery` | Desde el fin del efecto hasta que el lanzador vuelve a estar libre. |

El casteo completo dura `startup + active + recovery`. Durante ese tiempo no se
puede lanzar otra habilidad. El movimiento se bloquea:

- durante el `startup`, salvo que `moveWhileStartup` sea `true`;
- durante la ventana `active` de las melee;
- durante todo el casteo (`startup + active + recovery`) si
  `blockMovementDuringCast` es `true`, aunque `moveWhileStartup` también lo sea;
- en un dash, lo controla el propio desplazamiento.

## 2. Marcadores del sprite

Los `animdata.xml` de PMD incluyen tres marcadores por animación de ataque, en
índice de frame (0-based):

| Tag | Significado | Si falta |
| --- | --- | --- |
| `RushFrame` | Fin del retroceso e inicio del envite. | Frame 0. |
| `HitFrame` | Frame en el que el golpe conecta o sale el proyectil. | `ReturnFrame`. |
| `ReturnFrame` | Frame en el que empieza la vuelta al reposo. | Último frame. |

`RushFrame` se guarda en el manifiesto para futuras animaciones de envite, pero
el plan actual no desplaza al personaje con él: solo usa `HitFrame` y
`ReturnFrame` para el efecto y la recuperación.

Se guardan en el manifiesto como `rushFrame`, `hitFrame` y `returnFrame` junto a
`durations` (ticks de 1/60 s). El tiempo de un marcador es:

```
frameStart(frame) = suma(durations[0..frame-1]) / 60
```

`scripts/import-sprites.mjs` los lee al descargar sprites. Para actualizar el
manifiesto sin volver a descargar nada:

```bash
pnpm sprites:metadata
```

También se puede reimportar todo con `pnpm sprites`; el importador guarda los
tres marcadores en el manifiesto.

## 3. Plan de casteo

`src/game/castPlan.ts` convierte `startup/active/recovery` en segmentos de clip.
Cada segmento indica qué frames se dibujan, en qué ventana de tiempo y a qué
velocidad.

### 3.1 Anticipación y `HitFrame`

El tramo desde el inicio del clip hasta el `HitFrame` se reproduce para que
termine exactamente en `startup`. El playback se calcula como
`tiempoNaturalHastaHit / startup`.

- Si el playback queda por encima de `MAX_PLAYBACK`, se recortan los primeros
  frames (se pierde anticipación) hasta que quepa.
- Si queda por debajo de `MIN_PLAYBACK`, se retrasa el inicio y el hueco se
  rellena con la animación de carga o con la primera pose.
- Con `startup = 0` no hay anticipación: el clip empieza directamente en el
  `HitFrame`. Es la consecuencia de conservar el timing de combate actual.

### 3.2 Ventana activa

- En melee, el tramo `HitFrame → ReturnFrame` se estira o recorta para durar
  `active`. Si el clip es más corto, se mantiene la pose de contacto.
- En proyectiles, haces y áreas instantáneas, `active` suele ser `0` y el tramo
  `HitFrame → final` se reproduce durante `recovery`.
- En dash, el clip completo acompaña al desplazamiento `active`; no se ancla al
  `HitFrame` porque el golpe es un barrido continuo.

### 3.3 Recuperación

El tramo `ReturnFrame → final` se reproduce durante `recovery`. Si el clip se
acaba antes, el motor vuelve a `idle`/`walk` y el bloqueo de casteo sigue
contando hasta `endAt`. Si es más largo, se recorta el final.

### 3.4 Límites de playback

`MIN_PLAYBACK = 0.6` y `MAX_PLAYBACK = 1.8` en
`src/game/animationTimeline.ts`. El objetivo es que la animación no se vea a
cámara lenta ni como un borrón. Cuando el clip no cabe, se prefiere recortar
frames o mantener una pose antes que salirse del rango.

## 4. API de `AbilityDef`

```ts
ability('bolaSombra', 'Bola Sombra', 'Ghost', 'special', 'projectile')
  .startup(0)          // sale en el acto
  .active(0)
  .recovery(0.45)      // bloqueo después del disparo
  .animation('shoot')
```

Builder:

- `startup(seconds, { mode, speed, move, animation })`
  - `mode: 'once'` (por defecto): ancla el `HitFrame` del clip de carga al efecto.
  - `mode: 'loop'`: repite la carga a `speed` hasta el efecto.
  - `move: true` → `moveWhileStartup`.
  - `animation: 'charge'` → animación de carga distinta de la de lanzamiento.
- `active(seconds)`
- `recovery(seconds)`
- `blockMovementDuringCast()` → `blockMovementDuringCast`. Clava al lanzador
  durante todo el casteo, recuperación incluida, y tiene prioridad sobre
  `move: true`. Útil para áreas canalizadas.

El builder solo expone la API nueva: `startup`, `active` y `recovery`. Los
métodos `cast()` y `windup()` se eliminaron para que ninguna definición nueva
pueda recuperar la semántica antigua.

## 5. Migración desde el sistema anterior

| Antes | Ahora |
| --- | --- |
| `windup` | `startup` |
| `castTime` (no melee) | `recovery` |
| `castTime` (dash) | `active` |
| `castTime` / 2 (melee) | `active` |
| `animationTime` | eliminado: lo calcula el plan |
| `moveLock` | eliminado: se deriva de las fases |
| `windupAnimation` | `startupAnimation` |
| `windupAnimationMode` | `startupAnimationMode` |
| `windupAnimationSpeed` | `startupAnimationSpeed` |
| `moveWhileWindup` | `moveWhileStartup` |

El catálogo completo se migró con el mismo reparto para conservar el timing de
combate actual.

## 6. Casos especiales

### Sin animación de lanzamiento

Si `animation` es `null` y hay `startupAnimation`:

- `mode: 'once'` → la carga se trata como clip de lanzamiento y su `HitFrame` se
  ancla al efecto (por ejemplo, Bomba Lodo).
- `mode: 'loop'` → la carga se repite durante todo el `startup` y el efecto no
  tiene animación propia (por ejemplo, una carga circular).

Si no hay ninguna animación, el efecto sale en `startup` y el Pokémon mantiene
su reposo o caminar.

### Fallbacks

`strike`, `shoot`, `shock`, `charge`, etc. caen a `attack` y luego a `idle` si la
especie no tiene la hoja. El plan lee los marcadores del clip **resuelto**, no
del nombre pedido. Por eso un `strike` que en realidad usa `attack` se retima
con el `HitFrame` del `attack`.

### Skins

Todas las skins de una especie deben compartir los mismos tiempos clave. Si una
skin cambia las duraciones, el gameplay no cambia (el efecto va por `startup`),
pero la sincronía visual puede resentirse. El script de validación comprueba
cada skin por separado.

### Dash

El dash no tiene un instante de golpe único: el clip completo se reproduce
durante la ventana `active` y el barrido comprueba daño cada frame. Por eso el
`HitFrame` del `QuickStrike` no se usa como ancla. Si un obstáculo o un enemigo
acorta el desplazamiento, `syncDashCast` reconstruye el plan con la duración
real, así que el clip termina cuando termina el dash.

### Casteo interrumpido

Un golpe de control, un choque de melee, un KO o un respawn cancelan el
`ActiveCast`: se destruyen las marcas de área/haz y se limpia el frame manual.
El casteo nunca deja bloqueos residuales.

Las habilidades con `blockMovementDuringCast` son canalizaciones: cualquier
impacto las corta, incluso el tick de un área persistente. Esos ticks no aplican
hitstun ni empuje, pero sí interrumpen al lanzador que está clavado. Si el
efecto 3D ya había salido, también se acorta: el área persistente deja de hacer
ticks y se retira en el acto.

Si el efecto ya estaba en `queuedCasts` cuando llega la cancelación, el casteo
se marca como `canceled` y la fase de resolución lo descarta. Así un cambio
futuro del orden de fases no puede ejecutar el efecto de una habilidad que ya
había sido interrumpida.

## 7. Paso fijo de simulación

La simulación autoritativa corre a **60 Hz** con un acumulador:

- `FIXED_STEP = 1/60`; cada render acumula su `dt` real y ejecuta los pasos que
  quepan (máximo 4 para no entrar en espiral).
- El render y la presentación (billboards, FX, daño flotante, mundo y objetos)
  se actualizan **una vez por render** con su `dt` real.
- Efectos, cooldowns, proyectiles, áreas, bots y regeneración avanzan en pasos
  fijos. El error del instante del efecto queda en **≤ 1/60 s**,
  independientemente del framerate.
- La niebla y la visibilidad (`updateVision`) se resuelven **una vez por
  render**, no por paso; los bots usan la visibilidad del render anterior.
- Las pulsaciones de borde (habilidades, rueda, desplazamiento de ratón) se
  acumulan hasta el siguiente paso: a 144 Hz hay renders sin paso y no se
  pierden.
- Los ejes mantenidos (movimiento, cámara y zoom) se repiten en cada paso.
- La cámara se actualiza con la simulación (60 Hz); no hay interpolación de
  posición entre pasos.

## 8. Reloj autoritativo

La simulación guarda `player.animationFrame`. Las copias del billboard de cada
viewport solo dibujan ese frame (`setManualFrame`) mientras hay casteo. Fuera
del casteo, el billboard vuelve a su reloj automático para idle, walk y hurt.
Esto evita que dos vistas muestren frames distintos y permite garantizar que el
`HitFrame` se dibuja en el instante del efecto.

Si un paso de simulación cruza el `HitFrame` de golpe, la simulación fuerza esa
pose durante uno o dos frames de render (`forcedFrame`/`forcedFrames`). Así el
efecto se resuelve en el paso en el que el reloj cruza el impacto, pero su frame
nunca se pierde visualmente. El dash queda excluido porque su golpe es un
barrido continuo, no un frame único.

## 9. Validación

```bash
pnpm validate:anims
```

Requiere Node 22.18+ (o 23+) porque ejecuta un `.ts` con el *type stripping*
nativo de Node.

Comprueba, para cada habilidad × especie × skin:

- el efecto cae en `startup`;
- el frame visible en ese instante es el `HitFrame` (salvo dash);
- el playback queda en `[0.6, 1.8]`;
- los segmentos no se solapan ni se salen del casteo;
- `HitFrame <= ReturnFrame < número de frames`;
- avisa de los clips que han tenido que recortar anticipación y de las cargas
  (`startupAnimation`) que no tienen hueco antes del `HitFrame`.

## 10. Depuración en partida

Pon `CONFIG.debug.showCastTimings = true` en `src/game/config.ts`. Aparece un
overlay con:

- fase actual (`startup`/`active`/`recovery`) y tiempo;
- clip, rango de frames y playback del segmento;
- frame manual que se está dibujando;
- `hit #frame @ tiempo` y si el efecto ya se disparó.

## 11. Cómo añadir una habilidad

1. Elige la forma y la animación (`attack`, `shoot`, `strike`, `quickstrike`…).
2. Define `startup`, `active` y `recovery` pensando en el balance, no en el
   sprite.
3. Deja que el plan retime el clip. Si el resultado se ve forzado, ajusta el
   `startup` o elige otra animación; no metas tiempos específicos de una
   especie.
4. Ejecuta la validación y, si hace falta, activa el overlay para ver el frame
   exacto.

## 12. Limitaciones conocidas

- Con `startup = 0` se pierde la anticipación del clip: empieza en el
  `HitFrame`. Es el precio de conservar el timing de combate actual. Si una
  habilidad necesita anticipación visible, súbele el `startup` y ajusta el
  balance.
- En cargas `once`, la primera pose puede mantenerse durante el hueco antes de
  la anticipación. Para cargas que deban vibrar o repetirse, usa
  `mode: 'loop'`.
- El playback extremo cambia la sensación de peso. El rango `0.6–1.8` está
  pensado para que ninguna especie se vea absurda; si una habilidad lo necesita,
  es señal de que el `startup` no encaja con el clip.
- El dash reproduce su clip durante la ventana `active` real. Si un obstáculo
  acorta el desplazamiento, `syncDashCast` reconstruye el plan para que el clip
  dure lo mismo que el movimiento; sigue sin anclarse al `HitFrame` porque su
  golpe es un barrido continuo.
