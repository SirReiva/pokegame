# Diagrama de arquitectura

> Vista completa del monolito modular de NewPoke: capas, composition root,
> estado compartido, bucle de juego, simulación, render, IA, mundo, UI y
> guardarraíles. Los diagramas están en Mermaid y se renderizan en GitHub, en
> VS Code (extensión Markdown/Mermaid) y en la mayoría de visores de Markdown.

## Leyenda

- **Flecha continua:** dependencia o llamada en tiempo de ejecución.
- **Flecha discontinua:** contrato de tipos o suscripción.
- `core` es el único dominio sin PlayCanvas ni React.
- `sim` avanza el estado con paso fijo y no conoce la cámara ni el DOM.
- `render` adapta el estado a PlayCanvas; `app` compone todo.

Resumen en una línea:

```text
React ──► Game (fachada) ──► RuntimeHosts ──► sim ──► core
                │                 ▲
                ├──► render/fx ───┘
                ├──► render/world ──► PlayCanvas (WebGL2/WebGPU)
                └──► input / audio / assets / ai
```

## 1. Vista general por capas

```mermaid
flowchart TB
  subgraph uiLayer["UI · React"]
    router["App.tsx · router hash (wouter)"]
    screens["Pantallas · Home · Lobby · Roster · Options · Play · Editor"]
    components["Componentes · HUD · countdown · diálogos · editor"]
    session["SessionProvider · boot · preferencias · sesión"]
    statsStore["matchStatsStore · external store"]
    playHooks["screens/play · useGameEngine · useMatchLifecycle · useMatchHud"]
  end

  subgraph appLayer["Composición · src/game/app + game.ts"]
    game["Game · fachada estable para React"]
    bootstrap["appBootstrap · dispositivo gráfico + AppBase + audio"]
    matchSession["matchSession · startMatch · endMatch · clearMatch"]
    mapRuntime["mapRuntime · applyMap"]
    runtimeHosts["runtimeHosts · RuntimeState + 12 hosts"]
  end

  subgraph simLayer["Simulación determinista · paso fijo"]
    simPlayer["player · cast · dash"]
    simCombat["hits · damage · projectiles · aoes · aoeResolution"]
    simState["status · knockout · atmosphere · visibility"]
  end

  subgraph coreLayer["Núcleo puro · sin PlayCanvas ni React"]
    coreMatch["match · playerState · config"]
    coreAbilities["abilities · def · aoe · specs · styles · common"]
    coreRules["combat · xp · modes · terrain · vision · typeChart · pokedex"]
    corePorts["ports · fx · team · world"]
  end

  subgraph renderLayer["Adaptadores de render"]
    fx["CombatFx · fachada + familias + pools"]
    world["world.ts · pipeline + 19 secciones"]
    matchView["matchView · playerView · visionView"]
    sceneAdapters["Actor · CameraRig · Fog · HealthBar · DamageNumbers"]
  end

  subgraph platformLayer["Plataforma y contenido"]
    input["input · inputBuffer"]
    audio["audio · efectos y música"]
    assets["sprite · textures · skins · pokedex"]
    ai["bot.ts · coordinador + ai/*"]
  end

  browser["Navegador · DOM + WebGL2 / WebGPU"]

  router --> screens
  screens --> components
  screens --> session
  screens --> playHooks
  playHooks --> game
  components -.->|"useSyncExternalStore"| statsStore
  game -.->|"callbacks 2–4 Hz"| statsStore

  game --> bootstrap
  game --> matchSession
  game --> mapRuntime
  game --> runtimeHosts
  runtimeHosts --> simPlayer
  runtimeHosts --> simCombat
  runtimeHosts --> simState
  simPlayer --> coreMatch
  simCombat --> coreAbilities
  simState --> coreRules
  simCombat -.->|"puertos"| corePorts

  game --> fx
  game --> matchView
  game --> world
  matchSession --> sceneAdapters
  mapRuntime --> world
  world --> sceneAdapters
  matchView --> sceneAdapters
  fx --> browser
  sceneAdapters --> browser

  game --> input
  game --> audio
  game --> assets
  game --> ai
  ai --> coreMatch
  ai --> simState
```

### Qué hace cada bloque

| Bloque | Responsabilidad | Por qué está separado |
| --- | --- | --- |
| **UI React** | Rutas, pantallas, HUD, editor y store de estadísticas. | No simula ni toca el estado mutable; recibe snapshots. |
| **`Game`** | Fachada pública, bucle de frame y orquestación. | React mantiene una API estable aunque cambie el interior. |
| **`app/`** | Bootstrap, sesión de partida, mapa y hosts. | Es el único composition root; el grafo se construye una vez. |
| **`sim/`** | Avance determinista con paso fijo. | Testeable sin DOM, cámara ni PlayCanvas. |
| **`core/`** | Tipos, reglas y contratos puros. | Cero dependencias del motor; rompe el acoplamiento dominio-render. |
| **`render/`** | VFX, mundo, actores, niebla y cámaras. | Los cambios visuales no arrastran reglas de combate. |
| **Plataforma** | Input, audio, sprites, texturas y bots. | Adaptadores reemplazables y con estado propio. |

## 2. Regla de dependencias

```mermaid
flowchart LR
  UI["UI · ui · screens · session"]
  APP["app · Game · composition root"]
  SIM["sim · sistemas de paso fijo"]
  CORE["core · dominio puro"]
  RENDER["render · adaptadores PlayCanvas"]
  PLATFORM["input · audio · assets · ai"]
  PORTS["core/ports · contratos"]
  PC["PlayCanvas · WebGL2 / WebGPU"]

  UI --> APP
  APP --> SIM
  APP --> RENDER
  APP --> PLATFORM
  SIM --> CORE
  SIM -.->|"usa"| PORTS
  RENDER -.->|"implementa"| PORTS
  RENDER --> PC
  PLATFORM --> PC
```

| Capa | Puede importar | No puede importar |
| --- | --- | --- |
| `core/**` | Solo `core/**` y tipos estándar. | `playcanvas`, `react`, `sim/**`, `render/**`, `app/**`, `ui/**`. |
| `sim/**` | `core/**`, contratos y utilidades puras. | `render/**`, `ui/**`, `screens/**`, `react`. |
| `render/**` | `core/**`, `core/ports`, PlayCanvas y utilidades visuales. | `ui/**`, `screens/**`, `session/**`. |
| `app/**` | Todas las capas: es el composition root. | Nada prohibido por diseño, pero mantiene la fachada delgada. |
| `ui/**`, `screens/**` | `Game`, view-models y stores públicos. | `sim/**` y detalles internos de `core/**`. |

`node scripts/check-architecture.mjs` verifica dirección de capas, ciclos de
runtime, ciclos de tipos y tamaño máximo de archivo. Hoy termina con
`Arquitectura OK` y sin ciclos.

## 3. Composition root: `Game`, `RuntimeState` y hosts

```mermaid
classDiagram
  class Game {
    +create(canvas, callbacks, options)
    +init()
    +startMatch(configs)
    +endMatch()
    +setPaused(paused)
    +dispose()
    -runtimeState
    -hosts
    -updateMatch(dt, frame)
    -simulateStep(dt, frame, firstStep)
  }

  class RuntimeState {
    <<interface>>
    +projectiles
    +matchPlayers
    +world
    +activeAoes
    +pendingAoeEnds
    +combatFx
    +visibleByTeam
    +isMatchOver()
    +canHit()
    +applyAbilityDamage()
    +updateCamera()
  }

  class RuntimeHosts {
    +projectile
    +aoe
    +hit
    +player
    +status
    +cast
    +dash
    +atmosphere
    +damage
    +knockout
    +vision
    +aoeResolution
  }

  Game --> RuntimeState : construye una vez
  RuntimeState --> RuntimeHosts : createRuntimeHosts()
  Game --> RuntimeHosts : delega
```

`Game` crea **un único** `RuntimeState` con getters y callbacks y, a partir de
él, **un único** `RuntimeHosts`. Los sistemas reciben su host, no la clase
completa: no hay `this.game` dentro de `sim/**`. Los getters existen porque el
estado se reemplaza en bloque al empezar o limpiar una partida (arrays nuevos),
y así los hosts siguen siendo estables.

| Host | Sistema | Responsabilidad |
| --- | --- | --- |
| `projectile` | `sim/projectiles` | Avance, colisión e impacto de proyectiles. |
| `aoe` | `sim/aoes` | Áreas `overTime` y `onEnd` diferidos. |
| `hit` | `sim/hits` | Golpes instantáneos, dash y melé diferidos. |
| `player` | `sim/player` | Movimiento, timers, cámara, respawn y casteo. |
| `status` | `sim/status` | Regeneración y goteo de participación. |
| `cast` | `sim/cast` | Reloj del casteo, pose de impacto y animación. |
| `dash` | `sim/dash` | Desplazamiento y sincronización del dash. |
| `atmosphere` | `sim/atmosphere` | Daño residual del clima. |
| `damage` | `sim/damage` | Inmunidad, fórmula, slow, daño en el tiempo, buffs, escudo, XP y KO. |
| `knockout` | `sim/knockout` | KO, respawn, marcador y evento al modo. |
| `vision` | `render/visionView` | Niebla, copias visibles y máscara por equipo. |
| `aoeResolution` | `sim/aoeResolution` | Contexto de área, callbacks y eventos. |

## 4. Bucle de frame

El render corre a la tasa del navegador; la simulación avanza en pasos fijos de
`1/60 s`, con un máximo de pasos por frame para no entrar en espiral.

```mermaid
flowchart TD
  raf["requestAnimationFrame(dt)"] --> active{"¿Partida activa?"}
  active -->|no| menu["updateMenu · cámara de atracción · world.update · pickups"]
  menu --> raf

  active -->|sí| prewarm["prewarmBillboards · presupuesto 3 ms"]
  prewarm --> clearCache["fxVisibilityCache.clear()"]
  clearCache --> pause{"¿Start o Escape?"}
  pause -->|sí| requestPause["setPaused(true) · onPauseRequest()"]
  requestPause --> raf

  pause -->|no| buffer["inputBuffer.buffer(frame, views)"]
  buffer --> acc["simAccumulator += dt · tope MAX_FIXED_STEPS"]
  acc --> enough{"¿acumulador ≥ FIXED_STEP?"}
  enough -->|sí| step["simulateStep(FIXED_STEP)"]
  step --> enough

  enough -->|no| vision["updateVision · niebla y copias por viewport"]
  vision --> sync["syncMatchView · billboards y cielo"]
  sync --> bars["HealthBarOverlay · una barra por jugador"]
  bars --> passive["stepRegeneration · stepParticipation"]
  passive --> worldUpdate["world.update · updateAmbient · pickups.update"]
  worldUpdate --> fxUpdate["combatFx.update · popups · damageNumbers"]
  fxUpdate --> stats{"¿statsTimer ≥ 0,5 s?"}
  stats -->|sí| emit["emitMatchStats · matchStatsStore"]
  stats -->|no| raf
  emit --> raf
```

Puntos clave:

- `dt` del render no entra en las reglas: la simulación siempre ve `1/60`.
- Las acciones de borde (habilidades, rueda, giro) se acumulan en
  `inputBuffer` para no perderse en frames sin paso.
- La niebla se resuelve **antes** de sincronizar copias, así las copias ocultas
  no pagan posición, animación ni billboard.
- Las estadísticas del HUD salen a 2 Hz; React nunca lee estado mutable por
  frame.

## 5. Orden del paso fijo

El orden es parte del comportamiento: si cambia, cambian los intercambios y los
empates de daño.

```mermaid
flowchart TD
  s0["simulationStep++ · limpiar caché de visibilidad FX · matchElapsed += dt"] --> s1["advanceGameMode(dt) · ¿fin de partida?"]
  s1 -->|sí| stop["return · no se simula un frame extra"]
  s1 -->|no| s2["botNav.beginFrame() · buildBotHazards()"]
  s2 --> s3["Por jugador · bot.update() o inputBuffer.resolve()"]
  s3 --> s4["stepPlayer · movimiento, timers, casteo, dash, colisión"]
  s4 --> s5["stepAtmosphere · daño residual del clima"]
  s5 --> s6["resolveQueuedCasts · haces y áreas instantáneas"]
  s6 --> s7["stepInstantHits · golpes instantáneos y de dash"]
  s7 --> s8["stepMeleeHits · melé diferida"]
  s8 --> s9["stepProjectiles · avance e impactos"]
  s9 --> s10["stepActiveAoes · ticks de áreas overTime"]
  s10 --> s11["stepPendingAoeEnds · onEnd diferido"]
  s11 --> s12["pickups.collect()"]
  s12 --> s13["refreshCombatVisibility · foto final para render y siguiente paso"]
```

Cada fase comprueba `matchOver` antes de ejecutarse: un KO en un paso no deja
que las fases siguientes sigan aplicando daño en el mismo instante.

## 6. Ciclo de vida de una partida

```mermaid
sequenceDiagram
  autonumber
  participant UI as PlayScreen
  participant G as Game
  participant MS as app/matchSession
  participant MR as app/mapRuntime
  participant W as World
  participant S as sim
  participant ST as matchStatsStore

  UI->>G: Game.create(canvas, callbacks, options)
  G->>G: appBootstrap · dispositivo, AppBase, audio, FX
  G-->>UI: instancia

  UI->>G: init()
  G->>MR: applyMap(map, onProgress)
  MR->>W: buildWorldAsync · secciones con yield
  W-->>MR: World listo
  MR-->>G: mundo aplicado
  G-->>UI: onReady(manifest, maps, activeMapId)

  UI->>G: startMatch(configs)
  G->>MS: startMatch(host, configs)
  MS->>S: jugadores, bots, modo, cámaras, niebla
  MS-->>G: true
  G-->>UI: onCountdown(3, 2, 1, 0)

  loop Cada frame
    G->>S: simulateStep(1/60)
    G->>ST: emitMatchStats cada 0,5 s
    ST-->>UI: snapshot inmutable
  end

  G->>MS: endMatch() o finishMatch(outcome)
  MS-->>UI: onMatchEnd(result)
  UI->>G: dispose()
  G->>MS: clearMatch(host)
  MS->>W: dispose del mundo y liberar recursos
```

`Game` conserva la superficie pública que usa React:

```ts
Game.create(canvas, callbacks, options): Promise<Game>
game.init(): Promise<void>
game.startMatch(configs): boolean
game.endMatch(): void
game.setPaused(paused: boolean): void
game.dispose(): void
```

## 7. Ciclo de una habilidad

```mermaid
flowchart LR
  input["InputFrame o bot.update"] --> player["stepPlayer · castAbility(slot)"]
  player --> cast["ActiveCast · plan de animación y hit frame"]
  cast --> registry["ABILITY_EXECUTORS[shape]"]

  registry --> melee["melee"]
  registry --> projectile["projectile"]
  registry --> beam["beam"]
  registry --> aoe["aoe"]
  registry --> dash["dash"]
  registry --> selfSkill["self"]

  melee --> pending["PendingMeleeHit"]
  dash --> pending
  projectile --> flying["Projectile · stepProjectiles"]
  beam --> instant["PendingInstantHit"]
  aoe --> area["ActiveAoe · stepActiveAoes"]

  pending --> damage["damage.ts"]
  flying --> damage
  instant --> damage
  area --> damage

  damage --> effects["slow · buffs · escudo · curación · empuje"]
  damage --> xp["XP y estadísticas"]
  damage --> ko["knockout.ts · respawn y feed"]
  ko --> mode["modes.ts · marcador y fin"]
  damage --> fx["CombatFxPort · VFX y audio"]
```

- `abilities.ts` es un catálogo **data-driven**: añadir una habilidad no toca el
  motor.
- `abilityExecutors.ts` es un **Strategy + Registry** por forma; añadir una
  forma nueva es registrar una función.
- `modes.ts` es un **Strategy** por modo (`tdm`, `koth`): `Game` solo reparte
  eventos y aplica el resultado.

## 8. IA de bots

```mermaid
flowchart LR
  world["World.colliders"]
  state["MatchPlayerState"]
  teamVision["visibleByTeam"]
  pickups["pickupKnowledge"]
  nav["BotNavGrid · botNav.ts"]

  subgraph ai["src/game/ai"]
    types["types · contratos"]
    tuning["tuning · constantes"]
    math["math · vectores y ángulos"]
    blackboard["blackboard · memoria y claims"]
    movement["movement · pathfinding y huida"]
    decision["decision · decide · chooseAbility · scoreAbility"]
    hazards["hazards · proyectiles y áreas peligrosas"]
  end

  bot["BotController · bot.ts"]

  world --> nav
  world --> movement
  state --> hazards
  teamVision --> bot
  pickups --> bot
  nav --> movement
  hazards --> decision
  blackboard --> decision
  decision --> bot
  movement --> bot
  bot --> out["DeviceInputSnapshot → stepPlayer"]

  types -.-> decision
  types -.-> movement
  tuning -.-> decision
  math -.-> decision
  math -.-> movement
```

`BotController.update()` devuelve la misma instantánea de entrada que un humano.
Así la simulación tiene una sola ruta de entrada y los bots no reciben trato
especial dentro de `stepPlayer`.

## 9. Generación de mundo

```mermaid
flowchart LR
  start["buildWorldSteps(app, options)"] --> ctx["createWorldContext · WorldBuildContext"]
  ctx --> sections["19 secciones · yield 1 · presupuesto 8 ms"]
  sections --> finish["finishWorld"]
  finish --> world["World · colliders · entidades · update · dispose"]
```

Secciones, en el orden real de ejecución:

| Grupo | Secciones |
| --- | --- |
| Base | `scene`, `lights`, `ground`, `water` |
| Biomas y decoración | `trees`, `barriers`, `desertDust`, `ice`, `fire`, `grass`, `flowers`, `butterflies`, `paramo`, `lightning`, `ghost` |
| Cierre | `bases`, `sky`, `weather`, `contactShadow` |

Módulos compartidos del generador:

| Módulo | Papel |
| --- | --- |
| `render/world/context.ts` | Estado compartido, salidas y disposables. |
| `render/world/random.ts` | RNG determinista. |
| `render/world/tuning.ts` | Constantes de generación. |
| `render/world/surfaces.ts` | Mallas de superficie reutilizables. |
| `render/world/foliage.ts` | Follaje instanciado, viento y paletas. |
| `render/world/butterfly.ts` / `lightning.ts` | Estado y animación de mariposas y rayos. |
| `render/world/worldTextures.ts` / `worldDetailTextures.ts` | Texturas procedurales troceadas. |
| `render/world/ambientParticles.ts` | Lotes ambientales. |
| `render/world/options.ts` / `types.ts` | Opciones, hooks y tipo `World`. |
| `render/world/pickupPlacement.ts` | Validación de posición de objetos. |

Se conservan los 26 `yield 1`, el consumo de azar, el orden de creación y la
limpieza determinista.

## 10. VFX

```mermaid
flowchart LR
  callers["Game · sim · spawnProjectile · spawnAoe · spawnImpact · spawnBuff"]
  facade["CombatFx · fachada"]
  dispatchers["dispatchers · búsqueda por estilo"]
  families["projectiles · beams · aoe* · impacts · melee · bursts · support · telegraphs"]
  runtime["FxRuntime · pools · materiales · geometría · capas"]
  pc["Entidades PlayCanvas"]
  ports["core/ports/fx · EffectHandle · TelegraphHandle"]

  callers --> facade
  facade --> dispatchers
  dispatchers --> families
  families --> runtime
  runtime --> pc
  ports -.->|"contrato"| facade
```

La fachada mantiene la API histórica. Las fábricas se eligen **al lanzar** el
efecto, no por frame. Los pools, materiales y la resolución de capas viven en
`FxRuntime`.

## 11. UI, HUD y editor

```mermaid
flowchart TB
  app["App.tsx"] --> hash["router/hashLocation · wouter"]
  hash --> home["HomeScreen"]
  hash --> lobby["LobbyRoute · LobbyScreen"]
  hash --> roster["RosterRoute · RosterScreen"]
  hash --> play["PlayScreen · lazy"]
  hash --> editor["EditorRoute · MapEditorScreen · lazy"]
  hash --> options["OptionsScreen"]

  play --> engine["useGameEngine · create/dispose de Game"]
  play --> lifecycle["useMatchLifecycle · start · pausa · fin · revancha"]
  play --> hud["useMatchHud · statsStore · atmósfera · FPS"]
  engine --> game["Game"]
  lifecycle --> game
  hud --> store["matchStatsStore"]
  game -.->|"onMatchStats"| store
  store -.->|"useSyncExternalStore por plaza"| panels["MatchHud · PlayerHud · marcador"]

  editor --> model["editorModel · reducer puro + undo/redo"]
  editor --> geometry["editorGeometry · hit-testing"]
  editor --> canvas["editorCanvas · dibujo"]
  editor --> io["editorIo · draft e import/export"]
```

`PlayCanvas` y el editor se cargan con `lazy()`: el bundle principal no incluye
el motor 3D. `PlayScreen` compone hooks; no simula ni guarda estado del motor en
`useState`.

## 12. Mapa de carpetas

```text
src/
├─ main.tsx · App.tsx          # arranque y rutas
├─ router/                     # hash location
├─ session/                    # contexto, boot, preferencias
├─ screens/                    # pantallas y hooks de play
│  └─ play/                    # engine, lifecycle, HUD, stage, diálogos
├─ ui/                         # HUD, componentes y editor
│  └─ editor/                  # modelo, geometría, canvas, IO, toolbar
├─ performance/                # entrada del benchmark de frame
└─ game/
   ├─ game.ts                  # fachada Game
   ├─ app/                     # bootstrap, sesión, mapa, hosts
   ├─ core/                    # dominio puro y puertos
   │  ├─ abilities/            # def, aoe, specs, styles, common
   │  ├─ match/                # playerState y configuración
   │  ├─ ports/                # contratos de FX
   │  └─ __tests__/            # tests puros
   ├─ sim/                     # sistemas de paso fijo
   ├─ render/
   │  ├─ fx/                   # CombatFx y familias
   │  └─ world/                # pipeline, contexto y secciones
   ├─ ai/                      # módulos de decisión y navegación
   ├─ abilities.ts             # catálogo data-driven
   ├─ abilityExecutors.ts      # Strategy + Registry por forma
   ├─ modes.ts                 # Strategy por modo de juego
   ├─ matchState.ts            # estado mutable de la partida
   └─ world.ts                 # pipeline del generador de mundo
```

Tamaños actuales (sin tests):

| Zona | Líneas | Archivos |
| --- | ---: | ---: |
| `src/game/core` | 2.007 | 18 |
| `src/game/sim` | 2.202 | 12 |
| `src/game/app` | 1.108 | 3 |
| `src/game/ai` | 1.811 | 7 |
| `src/game/render` | 17.939 | 62 |
| `src/game` (total) | 56.494 | 166 |
| `src/ui` | 7.470 | 32 |
| `src/screens` | 2.074 | 12 |
| `src/session` | 954 | 3 |

Archivos que antes concentraban la arquitectura:

| Archivo | Antes | Ahora |
| --- | ---: | ---: |
| `game/combatFx.ts` | 13.069 | 15 (puente) |
| `game/game.ts` | 5.871 | 3.657 |
| `game/bot.ts` | 5.525 | 4.499 |
| `game/world.ts` | 4.046 | 361 |
| `ui/MapEditorScreen.tsx` | 2.189 | 1.191 |
| `screens/PlayScreen.tsx` | 954 | 322 |

## 13. Propiedad del estado

| Estado | Dueño | Consumidores |
| --- | --- | --- |
| `MatchPlayerState[]` | `game.ts` + `core/match/playerState` | `sim/**`, `render/**`, bots. |
| `PlayerView` (cámara, copias, barra, viewport) | `render/playerView` | `matchView`, `visionView`, overlay de barras. |
| `World` (colliders, entidades, update) | `world.ts` | Simulación, render, bots y objetos. |
| `RuntimeState` + `RuntimeHosts` | `app/runtimeHosts.ts` | Todos los sistemas. |
| `ActiveCast`, `Projectile`, `ActiveAoe` | `matchState.ts` | Sistemas de simulación y FX. |
| `visibleByTeam` | `sim/visibility` | Bots, regeneración y render. |
| `matchStatsStore` | `ui/matchStatsStore.ts` | Componentes del HUD. |
| Sesión y preferencias | `session/SessionProvider.tsx` | Pantallas y ajustes. |
| `EditorMap` e historial | `ui/editor/editorModel.ts` | Editor y tests. |

Regla: **el estado de simulación no contiene objetos de render**. La cámara,
las copias y las barras viven en el sidecar `PlayerView`; la simulación solo
guarda `cameraYaw` como número para la IA.

## 14. Guardarraíles y verificación

```mermaid
flowchart LR
  dev["Cambio de código"] --> tsc["pnpm check · tsc + capas y ciclos"]
  tsc --> tests["pnpm test · 19 tests puros"]
  tests --> build["pnpm build · producción"]
  build --> bench["pnpm bench · CPU pura"]
  bench --> frame["pnpm bench:frame --gpu · frame real"]
  frame --> ok{"¿p95 dentro de ±3 %?"}
  ok -->|sí| merge["Merge"]
  ok -->|no| revert["Revertir la fase"]
```

| Comando | Qué comprueba |
| --- | --- |
| `pnpm check` | TypeScript, dirección de capas, ciclos de runtime/tipos y tamaño máximo. |
| `pnpm test` | Daño, geometría de áreas, XP, modos, peligros de IA y modelo del editor. |
| `pnpm build` | Build de producción con `tsc -b` y Vite. |
| `pnpm bench` | Bucle de simulación puro en Node. |
| `pnpm bench:frame --all --seconds 5 --gpu` | FPS, p50/p95 y máximos reales en Chrome headless. |

Criterio de aceptación: mismos draw calls, ninguna tarea larga nueva, memoria
estable y p95 dentro del ±3 %. Las referencias están en
`docs/performance/baseline.md` y `docs/performance/frame-baseline.md`.

## 15. Decisiones que explica el diagrama

1. **Monolito modular, no microservicios ni ECS.** El estado caliente sigue
   siendo plano y reutilizado; los patrones ordenan el código sin añadir
   indirección por frame.
2. **Un composition root.** `Game.create` construye el grafo una vez; no hay
   contenedor DI ni service locator.
3. **Puertos solo donde hacían falta.** `core/ports/fx.ts` rompe la dependencia
   dominio-render y se borra al compilar.
4. **Hosts explícitos.** Cada sistema declara lo que necesita; `Game` no se pasa
   a sí mismo como dios.
5. **Registros en el evento.** Habilidades, VFX, modos y secciones de mundo se
   resuelven al lanzar o al cargar, no en el bucle interno.
6. **React no simula.** El HUD recibe snapshots inmutables a 2 Hz y se suscribe
   por plaza con `useSyncExternalStore`.
7. **Todo se mide.** La arquitectura no es un fin: el p95 y los draw calls son
   criterios de aceptación.
