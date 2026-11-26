# Animaciones y tiempos de habilidad

Este documento describe el sistema de animación de habilidades. La regla de oro:

> **La simulación define los tiempos en segundos; el clip 3D se adapta para que
> su marcador de impacto caiga exactamente en el instante del efecto.**

Así el balance no depende de cómo esté animada una especie ni de la duración de
su GLB. Bots, telegrafías y HUD pueden predecir el golpe con un único número.

## 1. Fases de una habilidad

Toda habilidad se describe con tres tiempos en `AbilityDef`:

| Campo | Significado |
| --- | --- |
| `startup` | Desde que se pulsa hasta que ocurre el efecto (golpe, proyectil, haz, área…). |
| `active` | Ventana que empieza con el efecto: compromiso del melee, desplazamiento del dash o duración de un haz. Puede ser `0`. |
| `recovery` | Desde el fin del efecto hasta que el lanzador vuelve a estar libre. |

El casteo completo dura `startup + active + recovery`. Durante ese tiempo no se
puede lanzar otra habilidad. El movimiento se bloquea:

- durante el `startup`, salvo que `moveWhileStartup` permita moverse;
- durante la ventana `active` de las melee;
- durante todo el casteo (`startup + active + recovery`) si
  `movementDuringCast` se declara como `false` o `0`, aunque `moveWhileStartup`
  también permita moverse;
- hasta que termina de reproducirse la animación de lanzamiento si
  `movementUntilEndAnimation` se declara como `false` o `0`; después la
  recuperación restante ya permite moverse;
- en un dash, lo controla el propio desplazamiento.

El rumbo del cuerpo también se fija al lanzar: el casteo no gira al Pokémon
aunque se desplace. Solo las habilidades que declaran `facingDuringCast`
reactivan el giro hacia la dirección de avance durante el casteo.

`moveWhileStartup`, `movementDuringCast` y `movementUntilEndAnimation` aceptan
`boolean | number`: `true` usa la velocidad normal, `false` bloquea y un número
es un multiplicador de velocidad (`0` bloquea). Los dos últimos solo intervienen
cuando se declaran; sin declararlos se mantienen las reglas por fase.

## 2. Marcadores del clip 3D

Cada clip del GLB aporta su duración real y tres marcas normalizadas (0..1):

| Marca | Significado | Por defecto |
| --- | --- | --- |
| `impact` | Instante de contacto o lanzamiento. | `0.5` |
| `followThrough` | Inicio de la vuelta al reposo. | `1` |
| `release` | Fin de una carga, si el clip la tiene. | `followThrough` |

Los marcadores viven en dos sitios, con esta prioridad:

1. `public/models/<especie>/clips.json` (ajuste fino, no requiere reexportar).
2. `extras.newpoke.clips` dentro del GLB (fuente final del asset).
3. Valores por defecto.

Ejemplo de `clips.json`:

```json
{
  "attack":   { "impact": 0.42, "followThrough": 0.78 },
  "shoot":    { "impact": 0.55 },
  "charge":   { "release": 0.9 },
  "walk":     { "loop": true, "rootMotion": "ignore" }
}
```

Las claves pueden ser el nombre de animación del juego (`attack`) o el nombre
exacto del clip del GLB. La duración **no** se escribe: sale de
`AnimTrack.duration` al cargar el modelo.

Los valores iniciales se generan analizando el movimiento real de cada clip 3D:

```bash
pnpm seed:clip-markers
pnpm seed:clip-markers -- --force   # sobrescribe los clips.json existentes
```

El script recorre los GLB, mide la energía angular de los huesos por intervalos
y usa el pico como `impact`; `followThrough` es el primer valle después del
pico. Es mucho más fiable que copiar el porcentaje del `HitFrame` del sprite,
porque el GLB puede tener otra anticipación y el porcentaje del sprite caer en
la recuperación. A partir de ahí se ajusta a mano. El manifiesto de sprites
sigue existiendo para retrato, escala de referencia y herramientas, pero el
runtime de habilidad ya no lee `durations` ni `hitFrame`.

Las claves de `clips.json` son el nombre real del clip del GLB (por ejemplo,
`00400_attack01`), no el nombre de la animación del juego. Así el ajuste es
específico del asset y no depende de los fallbacks de especie.

## 3. Plan de casteo

`src/game/castPlan.ts` convierte `startup/active/recovery` y el `presentation`
de la habilidad en `CastSegment[]`. Cada segmento es un tramo **temporal** del
clip 3D:

```ts
interface CastSegment {
  animation: AnimationName;
  clipStart: number;   // segundos dentro del clip, a velocidad 1
  clipEnd: number;
  startAt: number;     // ventana de casteo
  endAt: number;
  speed: number;       // 1 = natural
  loop: boolean;
  blendIn: number;
  blendOut: number;
}
```

En runtime, `clipTimeAt(segment, elapsed)` interpola linealmente (o aplica el
módulo si el segmento es un bucle). No hay frames en ningún punto del camino.

### 3.1 Anticipación e impacto

`fit: 'alignImpact'` es el modo por defecto de los presets de ataque. Resuelve la
velocidad para que el marcador `impact` caiga en `effect`:

```
speed = tiempoDeImpacto / startup
```

- Si la velocidad queda por encima de `MAX_PLAYBACK`, se recorta el inicio del
  clip (se pierde anticipación) hasta que quepa.
- Si queda por debajo de `MIN_PLAYBACK`, se retrasa la entrada y el hueco se
  rellena con la primera pose o con la carga.
- Con `startup = 0` no hay anticipación: el clip empieza directamente en el
  marcador de impacto.

### 3.2 Ventana activa

- En melee, el tramo `impact → followThrough` se estira o recorta para durar
  `active`. Si el clip es más corto, se mantiene la pose de contacto.
- En proyectiles, haces y áreas instantáneas, `active` suele ser `0` y el tramo
  `impact → end` se reproduce durante `recovery`.
- En dash, el clip completo acompaña al desplazamiento `active`; no se ancla al
  impacto porque el golpe es un barrido continuo.

### 3.3 Recuperación

El tramo `followThrough → end` se reproduce durante `recovery`. Si el clip se
acaba antes, el cuerpo vuelve a su locomoción y el bloqueo de casteo sigue
contando hasta `endAt`. Si es más largo, se recorta el final.

### 3.4 Límites de velocidad

`MIN_PLAYBACK = 0.6` y `MAX_PLAYBACK = 2.5` en
`src/game/animationTimeline.ts`. El objetivo es que la animación no se vea a
cámara lenta ni como un borrón. Cuando el clip no cabe, se prefiere recortar el
tramo o mantener una pose antes que salirse del rango.

### 3.5 Hit-stop

Cuando el reloj del casteo cruza el impacto, `beginImpactHold` congela la capa de
acción en `impactTime` durante `CONFIG.animation.hitStopSeconds` (55 ms por
defecto). Sustituye al antiguo `forcedFrame`: en 3D no hay frames que forzar,
solo tiempo. El reloj de gameplay no se detiene; solo se congela la pose visible.

## 4. Runtime: reloj manual en la capa base

`ModelBillboard` reproduce todo en la capa base del `AnimComponent`:

| Momento | Contenido | Reloj |
| --- | --- | --- |
| Sin casteo | `idle`, `walk`, `hurt`, `faint` | Automático del `AnimComponent` |
| Con casteo | `attack`, `shoot`, `charge`, dash… | Lo escribe la simulación cada tick |

Se probó una capa `action` separada para mezclar locomoción y casteo, pero la
mezcla entre capas de PlayCanvas no era fiable en todas las copias: en la
práctica la acción podía quedarse con peso 0. Ahora el casteo usa la misma capa
base, que ya estaba enlazada y se ve siempre. Los huecos del plan simplemente
devuelven el control a `idle`/`walk`.

La simulación sigue siendo dueña del tiempo: `player.clipTime` se escribe cada
paso fijo, así todas las vistas y los replays ven la misma pose.

El estado del jugador ya no guarda `animationFrame`:

```ts
interface MatchPlayerState {
  animation: AnimationName;          // locomoción
  actionAnimation: AnimationName | null; // casteo
  clipTime: number | null;           // segundos dentro del clip
  clipSpeed: number;
}
```

## 5. API de `AbilityDef`

```ts
projectileAbility(
  'bolaSombra',
  'Bola Sombra',
  'Ghost',
  'special',
  defaultProjectileResolve
)
  .power(80)
  .startup(0)
  .active(0)
  .recovery(0.45)
  .presentation(releaseScript('shoot'))
```

Builder:

- `startup(seconds, { move })`
  - `move: true` → `moveWhileStartup`. También acepta un número como
    multiplicador de velocidad; `false` o `0` bloquea.
- `active(seconds)`
- `recovery(seconds)`
- `presentation(script)` → timeline de animación de la habilidad.
- `presentationFor(speciesId, script)` → variante para una especie concreta.
- `movementDuringCast(value)` → controla el movimiento durante todo el casteo,
  recuperación incluida.
- `movementUntilEndAnimation(value)` → controla el movimiento hasta que termina
  de reproducirse la animación de lanzamiento.
- `facingDuringCast(value)` → permite que el cuerpo siga girando hacia su
  dirección de avance durante el casteo.

El builder solo expone `startup`, `active` y `recovery`. `cast()` y `windup()`
se eliminaron para que ninguna definición nueva pueda recuperar la semántica
antigua.

## 6. Timeline declarativo (`presentation`)

```ts
type ClipRef =
  | 'start' | 'impact' | 'followThrough' | 'end'
  | { phase: number }   // 0..1
  | { seconds: number };

interface AnimationStep {
  clip: AnimationName;
  frames?: { from?: ClipRef; to?: ClipRef };
  at?: 'start' | 'effect' | 'castEnd' | 'end'
    | { at: number } | { after: number };
  duration?: number;
  until?: 'start' | 'effect' | 'castEnd' | 'end' | { at: number };
  fit?: 'alignImpact' | 'stretch' | 'trimStart' | 'trimEnd' | 'natural';
  hold?: boolean | 'end' | 'impact';
  fill?: boolean;
  mode?: 'once' | 'loop';
  speed?: number;
  blendIn?: number;
  blendOut?: number;
}
```

`frames` es un tramo temporal del clip. `impact` y `followThrough` son marcas
semánticas; `{ phase }` y `{ seconds }` permiten overrides finos por especie.

| `fit` | Clip más largo que la ventana | Clip más corto |
| --- | --- | --- |
| `stretch` (defecto) | Recorta el final. | Mantiene la última pose solo con `hold`. |
| `alignImpact` | Recorta la anticipación. | Retrasa la entrada y rellena con la primera pose o la carga. |
| `trimStart` | Descarta anticipación. | Retrasa el tramo y rellena con la primera pose. |
| `trimEnd` | Recorta el final. | Mantiene la última pose solo con `hold`. |
| `natural` | Corta al acabar la ventana. | Deja hueco salvo `hold`. |

`mode: 'loop'` repite el tramo a `speed` durante toda la ventana. Un `loop` sin
`until` ni `duration` dura hasta el final del casteo.

`fill: true` hace que el paso ocupe solo el hueco que deja la anticipación del
siguiente paso. Si el siguiente empieza a la vez, el relleno no se dibuja. Es lo
que usan las cargas: solo se ven cuando el impacto del lanzamiento no cabe en el
`startup` y hay que retrasarlo.

### 6.1 Declaración

```ts
meleeAbility('golpe', 'Golpe', 'normal', 'physical', resolve)
  .startup(0.2)
  .active(0.1)
  .recovery(0.3)
  .presentation(attackScript('attack'))
```

`src/game/animationPresets.ts` incluye:

- `attackScript`: melee con ventana activa.
- `releaseScript`: proyectiles/haces con `active: 0`.
- `dashScript`: clip completo durante el desplazamiento.
- `channelFillScript`: carga que solo rellena el hueco de la anticipación.
- `channelScript`: canalización que reproduce la carga entera.

Para una especie concreta:

```ts
.presentationFor('0025', attackScript('quickstrike'))
```

El override reemplaza el script común entero; no se fusiona paso a paso.

### 6.2 Compilación

`compileAnimationScript()` (`src/game/animationScript.ts`) resuelve cada clip y
sus marcadores por especie, calcula las ventanas absolutas, aplica `fit` y los
límites `0.6-2.5x`, y emite los `CastSegment[]`.

Reglas:

- Los pasos se encadenan si no declaran `at`.
- `until` tiene prioridad sobre `duration`.
- Un `loop` sin fin explícito dura hasta el final del casteo.
- Un `fill` se recorta al inicio real del siguiente paso.
- Nada se sale de `[0, endAt]`.
- Los solapamientos los gana el paso que empieza después.

`animationEndAt` es el final del último paso. `impactClip`/`impactTime` guardan
el clip y el instante exactos del impacto para el hit-stop y la depuración.

## 7. Fallbacks

`strike`, `shoot`, `shock`, `charge`, etc. caen a `attack` y luego a `idle` si la
especie no tiene ese clip. El plan lee los marcadores del clip **resuelto**, no
del nombre pedido. Por eso un `strike` que en realidad usa `attack` se retima
con el `impact` del `attack`.

## 8. Casteo interrumpido

Un golpe de control, un choque de melee, un KO o un respawn cancelan el
`ActiveCast`: se destruyen las marcas de área/haz y se limpia la capa de acción.
Si el efecto ya había salido, también se retira. El casteo nunca deja bloqueos
residuales.

Las habilidades con `armorPool > 0` tienen armadura de casteo: cada golpe resta
su daño final a un pozo sin mitigarlo y, mientras quede, no cancela el casteo ni
aplica hitstun, empuje o `hurtTimer`. Cuando el daño acumulado agota el pozo, el
casteo se rompe. La ventana es el `startup`, salvo en las canalizaciones con
`movementDuringCast` bloqueado, donde cubre todo el casteo.

## 9. Paso fijo de simulación

La simulación autoritativa corre a **60 Hz** con un acumulador:

- `FIXED_STEP = 1/60`; cada render acumula su `dt` real y ejecuta los pasos que
  quepan (máximo 2).
- El render y la presentación se actualizan una vez por render con su `dt` real.
- El daño flotante se crea con presupuesto por render.
- Efectos, cooldowns, proyectiles, áreas, bots y regeneración avanzan en pasos
  fijos. El error del instante del efecto queda en ≤ 1/60 s.
- La niebla y la visibilidad se resuelven una vez por render.
- Las pulsaciones de borde se acumulan hasta el siguiente paso.

## 10. Validación

```bash
pnpm validate:anims
```

Comprueba, para cada habilidad × especie:

- el efecto cae en `startup`;
- el plan termina en `startup + active + recovery`;
- en el impacto se ve el marcador `impact` del clip resuelto (salvo dash);
- la velocidad queda en `[0.6, 2.5]`;
- los segmentos no se solapan ni se salen del casteo;
- avisa de las cargas (`fill`) que no tienen hueco antes del impacto.

La validación usa una biblioteca derivada del manifiesto de sprites como semilla.
El runtime real usa los marcadores de `clips.json`/GLB. Si ajustas un marcador en
`clips.json`, vuelve a pasar el validador para comprobar que el plan sigue
cuadrando.

## 11. Depuración en partida

Pon `CONFIG.debug.showCastTimings = true` en `src/game/config.ts`. El overlay
muestra:

- fase actual (`startup`/`active`/`recovery`) y tiempo;
- clip, tramo temporal (`clipStart..clipEnd`) y velocidad del segmento;
- tiempo de clip que se está dibujando;
- `impact clip@tiempo`, instante del efecto, si ya se disparó y si hay hit-stop.

## 12. Cómo añadir una habilidad

1. Elige la forma y los clips (`attack`, `shoot`, `strike`, `quickstrike`…).
2. Define `startup`, `active` y `recovery` pensando en el balance, no en el
   sprite.
3. Escribe el `presentation` con los helpers (`attackScript`, `releaseScript`,
   `dashScript`, `channelFillScript`) o a mano si necesitas encadenar clips.
4. Ejecuta `pnpm validate:anims` y, si hace falta, activa el overlay.
5. Si el impacto visual no cae donde quieres, ajusta `impact` en el
   `clips.json` de la especie, no el `startup` de la habilidad.

## 13. Migración desde el sistema de frames

| Antes (sprite) | Ahora (clip 3D) |
| --- | --- |
| `SpriteAnimation.durations` | `ClipInfo.duration` (del `AnimTrack`) |
| `HitFrame` | marca `impact` (0..1) |
| `ReturnFrame` | marca `followThrough` (0..1) |
| `frames: 'hit'` | `frames: 'impact'` |
| `frames: 'return'` | `frames: 'followThrough'` |
| `beforeHit` / `beforeReturn` | `alignImpact` + `trimEnd` |
| `startFrame` / `endFrame` | `clipStart` / `clipEnd` (segundos) |
| `player.animationFrame` | `player.clipTime` |
| `setManualFrame` | `playActionAt` |
| `forcedFrame` / `forcedFrames` | `hitStopRemaining` |
| `fit: 'trimStart'` en la anticipación | `fit: 'alignImpact'` |

El golden master `animationPlans.test.ts` sigue guardando un hash de los planes
de todas las habilidades contra todas las especies. Si un script o el compilador
cambia, el hash cambia y el diff se revisa a propósito.

## 14. Limitaciones conocidas

- Con `startup = 0` se pierde la anticipación del clip: empieza en el marcador de
  impacto. Si una habilidad necesita anticipación visible, súbele el `startup`.
- En cargas `once`, la primera pose puede mantenerse durante el hueco antes de la
  anticipación. Para cargas que deban vibrar o repetirse, usa `mode: 'loop'`.
- El playback extremo cambia la sensación de peso. El rango `0.6-2.5` está
  pensado para que ninguna especie se vea absurda.
- El dash reproduce su clip durante la ventana `active` real. Si un obstáculo
  acorta el desplazamiento, `syncDashCast` reconstruye el plan para que el clip
  dure lo mismo que el movimiento; sigue sin anclarse al impacto.
- Los marcadores de `idle`/`walk`/`hurt`/`faint` existen en `clips.json` por la
  semilla, pero solo los clips de ataque y carga los usan.
