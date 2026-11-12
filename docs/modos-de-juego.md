# Propuesta de modos de juego

Documento de diseño para ampliar NewPoke más allá del **team deathmatch con límite de KOs** actual. No describe una implementación cerrada: ordena ideas, explica por qué encajan con lo que ya existe y marca un orden razonable de trabajo.

## Punto de partida

Lo que el motor ya resuelve y conviene reutilizar:

- **Combate por equipos** con 2–4 equipos, sin fuego amigo, KO, reaparición a los 5 s e invulnerabilidad de 2 s.
- **Hasta 8 jugadores locales** en splitscreen, con bots que no ocupan vista y usan el mismo `stepPlayer`.
- **Mapas JSON** con `respawns`, `mountains` y `pickups`; el editor ya permite dibujar terrenos, bases, muros y objetos.
- **Niebla de guerra compartida por equipo**, visión por especie, ocultación por terreno y línea de visión.
- **Clima**, terrenos tipados, objetos curativos y XP decorativa.
- **HUD por vista** con marcador, kill feed, vida, cooldowns y pantalla de resultados.

Lo que hoy está muy acoplado al deathmatch:

- `Game.knockOut()` suma un KO y comprueba `koTarget` directamente.
- `areEnemies()` reduce la relación de daño a “equipo distinto”.
- El marcador es siempre `Record<Team, number>` y el HUD pinta KOs.
- Los bots persiguen rivales y objetos, pero no tienen concepto de objetivo de mapa.
- No existe un reloj de partida ni un estado de ronda.

La propuesta parte de extraer esas piezas a un **registro de modos** y añadir datos opcionales al mapa. Así cada modo no toca el combate ni duplica lógica.

## Criterios de diseño

Un modo entra en la lista si cumple casi todo:

1. **Funciona en local**: 1–8 jugadores, con o sin bots, en la misma pantalla.
2. **No exige arte nuevo**: reutiliza sprites, efectos, terrenos y objetos.
3. **Se lee en el HUD**: una sola frase debe explicar qué hay que hacer.
4. **Los bots pueden jugarlo**: si la IA se queda mirando, el modo no sirve para partidas pequeñas.
5. **Aprovecha una mecánica existente**: niebla, dash, empuje, tipos, clima, curación o mapas.

## Resumen de la propuesta

| # | Modo | Bucle | Coste | Prioridad |
| --- | --- | --- | --- | --- |
| 1 | Contrarreloj | Más KOs en 4 minutos | Bajo | Ahora |
| 2 | Duelo por vidas | Último equipo con vidas | Bajo | Ahora |
| 3 | Recompensa | Cazar al jugador en racha | Bajo | Ahora |
| 4 | Entrenamiento | Campo de pruebas y dummies | Bajo | Ahora |
| 5 | Rey de la colina | Mantener una zona | Medio | Siguiente |
| 6 | Duelo por rondas | Ganar asaltos sin reaparición | Medio | Siguiente |
| 7 | Todos contra todos (4) | FFA usando los 4 equipos | Medio | Siguiente |
| 8 | Pilla-pilla | Un buscador contra escondidos | Medio | Siguiente |
| 9 | Rally de checkpoints | Carrera por el mapa | Medio | Siguiente |
| 10 | Dominio | Controlar 3 zonas | Alto | Apuesta |
| 11 | Captura de bandera | Robar y devolver el cristal | Alto | Apuesta |
| 12 | Horda | Oleadas cooperativas de bots | Alto | Apuesta |
| 13 | Asalto al jefe | Raid cooperativa contra un legendario | Alto | Apuesta |

Los cuatro primeros se pueden construir **sin cambiar el formato de los mapas** y con muy poca UI nueva. Los cinco siguientes necesitan un objetivo en el mundo y bots que lo entiendan. Los últimos son proyectos grandes, pero son los que más identidad le darían al juego.

---

## 1. Contrarreloj

**Idea.** El deathmatch de siempre, pero con reloj: 3–5 minutos y gana el equipo con más KOs. Si hay empate, desempata el daño hecho.

**Reglas.**

- Tiempo configurable: 3, 4 o 5 minutos.
- Sin límite de KOs.
- En el último minuto, el HUD avisa y la música sube de intensidad.
- Empate: gana el equipo con más daño infligido; si persiste, empate técnico.

**Por qué encaja.** Ya existe `matchElapsed` y el marcador por equipo. Es el modo más barato de todos y cambia mucho el ritmo: obliga a arriesgar al final.

**Implementación.**

- Añadir `timeLimitSeconds` a las opciones de partida.
- Extraer de `knockOut()` un `finishMatch(winner)` reutilizable.
- En `Game.step()`, comprobar el tiempo y cerrar la partida.
- HUD: reloj junto al marcador y aviso de “último minuto”.

**Bots.** No requiere cambios. Ya juegan a matar.

**Coste.** Bajo: 1–2 días.

---

## 2. Duelo por vidas

**Idea.** Cada jugador empieza con 3 vidas. Al morir pierde una y no reaparece hasta que se agota su reserva. Gana el último equipo con algún jugador vivo. Variante cooperativa: el equipo comparte un pozo de vidas.

**Reglas.**

- 3 vidas por jugador (o 5, 10).
- Sin reaparición infinita: cada muerte consume una vida.
- Al quedarse sin vidas, el jugador pasa a modo espectador de su equipo.
- Con equipo, puede ser “vidas individuales” o “pozo compartido”.

**Por qué encaja.** Convierte cada muerte en algo importante, reduce el kamikaze y produce remontadas. Es el formato competitivo natural para 1v1, 2v2 y 4v4 local.

**Implementación.**

- `stocks` por jugador en `MatchPlayerState`.
- `canRespawn()` consulta el modo antes de usar `CONFIG.combat.respawnSeconds`.
- El fin de partida deja de depender de `koTarget`: se comprueba si queda algún equipo con vidas.
- HUD: corazón o pipas de vida restantes por jugador y por equipo.

**Bots.** Ya valoran morir mal (huyen con poca vida), así que el modo les sienta bien. Conviene subir su aversión a morir cuando no quedan vidas.

**Coste.** Bajo–medio: 2–4 días.

---

## 3. Recompensa

**Idea.** Cada jugador acumula una recompensa que crece con su racha de KOs. Matar al más buscado da muchos puntos; morir reinicia tu recompensa, no tus puntos. Gana el primero que llega a X puntos de recompensa.

**Reglas.**

- Empezar con recompensa 1.
- Cada KO propio sube la recompensa del siguiente objetivo; la racha ya existe en `killStreak`.
- Al morir, la víctima entrega su recompensa al asesino y vuelve a 1.
- El HUD muestra el top 3 de recompensas y un icono sobre el jugador más buscado.

**Por qué encaja.** Ya se registra `killStreak` y el kill feed muestra las rachas. Es una capa de riesgo/recompensa muy barata y muy legible en local: todos quieren cazar al que va lanzado.

**Implementación.**

- Añadir `bounty` a `PlayerMatchStats`.
- Usar `killStreak` para calcular el valor.
- Cambiar el marcador de KOs por puntos de recompensa.
- Marcar visualmente al líder con un aura o un icono en la barra de vida.

**Bots.** Añadir un bonus de selección de objetivo para el jugador con más recompensa. Es un cambio pequeño en `pickTarget`.

**Coste.** Bajo: 2 días.

---

## 4. Entrenamiento

**Idea.** Un mapa de prácticas con dummies, cooldowns infinitos, daño desactivable y visualización de hitboxes. Sirve para aprender el roster y para probar cambios de balance.

**Reglas.**

- Sin marcador ni fin de partida.
- Dummies con vida infinita o regeneración.
- Opciones: cooldowns instantáneos, daño x0, mostrar hurtboxes y rangos.
- Cambio de Pokémon en caliente desde el menú de pausa.

**Por qué encaja.** El proyecto ya tiene `CONFIG.debug.showHitboxes`, `castDebug` y un roster grande. Es la mejor herramienta para que un jugador nuevo entienda habilidades y direcciones antes de entrar a una partida real.

**Implementación.**

- Un modo sin equipos enemigos reales y con un `TrainingDummy` que herede el estado de jugador pero no ataque.
- Reutilizar el mapa del editor o una arena pequeña.
- Panel de opciones de entrenamiento en pausa.

**Bots.** No aplica.

**Coste.** Bajo–medio: 3–5 días.

---

## 5. Rey de la colina

**Idea.** Una zona central (o móvil) que hay que mantener. Cada segundo dentro suma puntos al equipo; si hay rivales dentro, se contesta y nadie puntúa. Gana el primero que llega a 100 o el que más tenga al terminar el tiempo.

**Reglas.**

- Zona circular de 3–4 u en el centro del mapa, o marcada en el JSON.
- 1 punto por segundo al equipo que la controla en solitario.
- Contienda: si hay dos o más equipos dentro, se congela el marcador.
- Variante “colina móvil”: la zona se mueve cada 45 s a un punto prefijado.
- Victoria a 100 puntos o a los 4 minutos.

**Por qué encaja.** Es el modo de objetivo más fácil de leer y el que mejor convierte los cuatro equipos en un conflicto por un espacio. Ya existen áreas, anillos de telegrafía y efectos de suelo que se pueden reutilizar para pintar la zona.

**Implementación.**

- `objective` opcional en el mapa: `{ kind: 'zone', x, z, radius }`.
- Estado del modo con `owner`, `contested`, `progress`.
- Tick de puntuación en `Game.step()`.
- HUD: barra de progreso, indicador de “en disputa” y flecha hacia la zona.
- Bots: si no hay rival visible, navegar a la zona y quedarse dentro/orbitando.

**Coste.** Medio: 1 semana, la mayor parte en la IA y el HUD.

---

## 6. Duelo por rondas

**Idea.** Dos equipos, sin reaparición dentro de la ronda. Eliminar al equipo rival gana la ronda. Primero a 3 o 5 rondas. Entre rondas se reinician posiciones, vidas y cooldowns.

**Reglas.**

- Ronda de 60–90 s; si expira, gana el equipo con más jugadores vivos o más daño.
- Sin reaparición; los caídos esperan a la siguiente ronda.
- Al empezar cada ronda: spawn limpio, cooldowns a cero, instinto reiniciado.
- Best of 5 o best of 7.

**Por qué encaja.** Es el formato clásico de arena y encaja perfecto con 1v1/2v2 local. Aprovecha el combate existente y añade muy poca geometría nueva.

**Implementación.**

- Máquina de estados de ronda: `warmup → live → roundEnd → nextRound → matchEnd`.
- `respawnEnabled` por modo.
- Reset de estado de jugadores y limpieza de proyectiles/áreas entre rondas.
- HUD: rondas ganadas, temporizador y “último vivo”.

**Bots.** Funcionan bien, pero conviene que no se separarán demasiado del equipo en 2v2.

**Coste.** Medio: 1 semana.

---

## 7. Todos contra todos (4 jugadores)

**Idea.** Cada jugador es su propio equipo. Gana el primero que llega al límite de KOs. La forma más limpia de hacerlo sin reescribir el modelo de equipos es **usar los cuatro equipos existentes con un jugador cada uno**.

**Reglas.**

- 2–4 jugadores humanos, uno por equipo (`red`, `blue`, `yellow`, `green`).
- KOs individuales; sin aliados.
- Reaparición normal.
- Variante por parejas: dos equipos de dos.

**Por qué encaja.** El motor ya trata “equipo distinto” como enemigo. Con un jugador por equipo, el FFA sale casi gratis y usa las cuatro bases del mapa. Para 5–8 jugadores haría falta ampliar la paleta y el modelo de equipos, así que conviene dejar esa ampliación para más adelante.

**Implementación.**

- Validar en el lobby que el modo FFA exige un máximo de 4 humanos y un jugador por equipo.
- Ocultar la selección de equipo o asignarla automáticamente.
- HUD: marcador de cuatro colores en vez de dos.

**Coste.** Medio: 3–5 días para el modo de 4; alto si se quiere FFA de 8.

---

## 8. Pilla-pilla

**Idea.** Un jugador empieza como buscador y el resto se esconde. El buscador tiene 20 s de ventaja; los escondidos deben sobrevivir hasta el final. Al tocar a un escondido, este queda eliminado (o pasa a ser buscador en la variante “contagio”).

**Reglas.**

- Un buscador (equipo rojo) contra todos los demás (equipo azul).
- 20 s de cuenta atrás para esconderse.
- Sin daño: la captura es por contacto o por impacto de habilidad, a elección.
- Gana el último escondido o el buscador si caza a todos antes del tiempo.
- Variante “contagio”: cada capturado se convierte en buscador.

**Por qué encaja.** Es el modo que más partido saca a la **niebla de guerra**, la ocultación por terreno, la hierba alta, los santuarios y la pasiva de Regeneración. Ya existe todo lo necesario para esconderse; solo falta la regla de captura.

**Implementación.**

- Roles por jugador y condición de victoria por tiempo.
- Desactivar daño entre equipos o sustituirlo por “toque”.
- HUD: tiempo restante, escondidos vivos y aviso de “te ven”.
- Bots: el buscador patrulla puntos de interés; los escondidos huyen y usan coberturas.

**Coste.** Medio: 1 semana.

---

## 9. Rally de checkpoints

**Idea.** Una carrera por el mapa pasando por checkpoints en orden. Sin combate (o con habilidades de movimiento permitidas). Primero a 3 vueltas o a 5 checkpoints.

**Reglas.**

- Checkpoints numerados en el JSON del mapa.
- Hay que pasar por el siguiente de la secuencia; el HUD marca la dirección.
- Sin daño; dash y habilidades de movilidad permitidas, con cooldowns.
- Variante “con items”: pociones y objetos de velocidad en el recorrido.

**Por qué encaja.** Aprovecha la velocidad distinta de cada Pokémon, los multiplicadores de terreno y el dash. Es un modo party perfecto para 8 jugadores y para mapas del editor.

**Implementación.**

- `checkpoints` opcionales en el mapa, con orden y radio.
- Estado de carrera por jugador (`nextCheckpoint`, `lap`).
- HUD: posición, vuelta y flecha al checkpoint.
- Bots: navegar al siguiente checkpoint; no necesitan combate.

**Coste.** Medio: 1 semana.

---

## 10. Dominio

**Idea.** Tres zonas (A, B, C). Cada equipo captura una zona manteniéndose dentro; las zonas controladas suman puntos por segundo. Gana el primero que llega a 200.

**Reglas.**

- Captura por presencia continua; si hay varios equipos, se contesta.
- Cada zona controlada suma 1 punto/s; tener las tres acelera.
- Las zonas empiezan neutrales.
- 2–4 equipos.

**Por qué encaja.** Es la evolución natural del Rey de la colina y convierte el mapa en un tablero. Con cuatro equipos obliga a repartirse y a rotar.

**Implementación.**

- Varias zonas en el mapa.
- Estado por zona: `owner`, `captureProgress`, `contested`.
- HUD: tres indicadores y minimapa textual.
- Bots: asignar una zona por bot, priorizar la más cercana y defender la propia.

**Coste.** Alto: 2–3 semanas, sobre todo por la IA y el HUD.

---

## 11. Captura de bandera

**Idea.** Cada base tiene un cristal. Hay que entrar en la base rival, cogerlo y traerlo a la propia. Primero a 3 capturas.

**Reglas.**

- El portador se ve a través de la niebla enemiga y se mueve un 10–15 % más lento.
- Si muere, el cristal cae y vuelve a la base tras 15 s.
- No se puede capturar con el propio cristal en casa.
- Variante “una bandera”: ambos equipos compiten por el mismo objeto central.

**Por qué encaja.** Usa las bases y el movimiento, y crea persecuciones que lucen mucho en splitscreen. El objeto puede reutilizar el sistema de `pickups`.

**Implementación.**

- Entidad de bandera con estados `home`, `carried`, `dropped`.
- Interacción automática al pisar, como los objetos actuales.
- HUD: estado de las dos banderas y aviso de portador.
- Bots: portador vuelve a casa, perseguidores interceptan, defensores cubren la base.

**Coste.** Alto: 2–3 semanas.

---

## 12. Horda

**Idea.** Todos los humanos cooperan en un equipo contra oleadas de bots. Cada oleada es más dura; cada 5 aparece un mini-jefe. El equipo comparte un pozo de vidas o de reapariciones.

**Reglas.**

- Todos los humanos en azul; los bots en rojo.
- Oleadas de 6–12 bots con composición variada del roster.
- Vidas compartidas (por ejemplo, 10) o reaparición con tiempo creciente.
- Entre oleadas, curación y objetos.
- Gana el equipo que sobrevive a 10 oleadas.

**Por qué encaja.** La IA ya existe, comparte visión y usa habilidades. Solo hace falta un director de oleadas y un objetivo común. Es el modo cooperativo que más valor aporta a una pantalla compartida.

**Implementación.**

- `WaveDirector`: composición, puntos de spawn, escalado de vida/daño.
- Bots de oleada sin vista y sin HUD.
- Estado de vidas de equipo y pantalla de fin de oleada.
- Ajustar la IA para que persiga a los humanos en lugar de patrullar el mapa.

**Coste.** Alto: 2–4 semanas.

---

## 13. Asalto al jefe

**Idea.** 1–4 jugadores contra un legendario gigante con fases, ataques telegrafiados y puntos débiles. El jefe tiene mucha vida y cambia de patrón al bajar de ciertos umbrales.

**Reglas.**

- Un único enemigo con vida muy alta y varias fases.
- Ataques de área con telegrafía larga, proyectiles en abanico y una fase de “furia”.
- Los jugadores comparten vidas o reapariciones limitadas.
- Gana el equipo si derrota al jefe antes del tiempo.

**Por qué encaja.** Reutiliza el sistema de `aoe`, telegrafía, proyectiles y efectos, que es una de las partes más maduras del proyecto. Visualmente sería el modo más espectacular.

**Implementación.**

- Entidad de jefe con máquina de estados y patrones.
- Barra de vida global y fases.
- Ataques con los mismos ejecutores de habilidades, pero sin depender de un moveset de jugador.
- Cámara y HUD especiales.

**Coste.** Alto: 3–5 semanas.

---

## Mutadores: contenido barato que multiplica los modos

Independientes del modo principal, se pueden ofrecer como opciones del lobby:

| Mutador | Efecto | Coste |
| --- | --- | --- |
| Cristal | Todos a 1 PV | Bajo |
| Doble vida | Vida x2 | Bajo |
| Cooldowns rápidos | Cooldowns x0,5 | Bajo |
| Sin instinto | Desactiva el instinto común | Bajo |
| Solo básicas | Solo la habilidad básica | Bajo |
| Espejo | Todos con la misma especie | Bajo |
| Aleatorio | Pokémon sorteado al reaparecer | Medio |
| Fuego amigo | El daño también afecta a aliados | Medio |
| Clima extremo | Fuerza Sol abrasador, Diluvio o Tormenta | Bajo |
| Sin reaparición | Una vida por ronda | Bajo |

Los tres últimos son los únicos que tocan reglas de combate; el resto son configuración. “Aleatorio” exige precargar o intercambiar actores en caliente, así que conviene dejarlo para después de la primera tanda de modos.

---

## Arquitectura propuesta

Para que los modos no se conviertan en una cadena de `if` dentro de `Game`, propongo un **registro de modos** con un contrato pequeño. La idea es la misma que ya se usa en `ABILITY_EXECUTORS` y `DAMAGE_MODIFIERS`.

```ts
// src/game/modes/types.ts
export type GameModeId =
  | 'tdm'
  | 'timed'
  | 'stock'
  | 'bounty'
  | 'koth'
  | 'rounds'
  | 'ffa'
  | 'hide'
  | 'rally'
  | 'domination'
  | 'ctf'
  | 'horde';

export interface GameModeDefinition {
  id: GameModeId;
  name: string;
  description: string;
  /** Equipos que permite: los del mapa, uno por jugador o uno solo. */
  teamMode: 'map' | 'per-player' | 'single';
  /** Opciones que el lobby debe pintar. */
  settings: ModeSetting[];
  /** Estado inicial del modo. */
  createState(ctx: ModeContext): ModeState;
  /** Se llama en cada tick de simulación. */
  onTick(ctx: ModeContext, dt: number): void;
  /** Se llama cuando alguien cae. */
  onKnockOut(ctx: ModeContext, killer: MatchPlayerState, victim: MatchPlayerState): void;
  /** Decide si un jugador puede reaparecer. */
  canRespawn(ctx: ModeContext, player: MatchPlayerState): boolean;
  /** Devuelve el resultado si la partida debe terminar. */
  checkEnd(ctx: ModeContext): MatchEndResult | null;
  /** Datos para el HUD de objetivo. */
  getHud(ctx: ModeContext): ModeHud;
}
```

Puntos de integración concretos:

- **Sesión y lobby.** Añadir `modeId` y `modeSettings` a `SessionValue`, y una tarjeta “Modo de juego” en `/lobby` con nombre, descripción y opciones. El lobby ya tiene el patrón de las tarjetas de KOs y clima.
- **Motor.** `GameOptions` recibe `modeId` y `modeSettings`. `Game` instancia el modo desde `GAME_MODES` y delega en él el fin de partida, la reaparición y el tick de objetivo.
- **Fin de partida.** Extraer de `knockOut()` un `finishMatch(winner, detail)` que use `MatchEndResult` con un campo opcional `modeDetail` y estadísticas por jugador.
- **Marcador.** Mantener `teamScores` para los modos de equipo, pero añadir `objectiveScores` o `modeState` para vidas, rondas, zonas o banderas.
- **Mapa.** Añadir campos opcionales validados en `map.ts`:
  ```json
  {
    "objectives": [
      { "kind": "zone", "id": "centro", "x": 0, "z": 0, "radius": 3.5 },
      { "kind": "checkpoint", "id": "cp1", "x": -8, "z": 4, "radius": 1.5, "order": 1 }
    ]
  }
  ```
  El editor puede ignorarlos al principio: los mapas que no los declaren usan el centro del mapa como zona y no ofrecen rally.
- **Bots.** Es el coste oculto de casi todos los modos. `bot.ts` necesita un `modeGoal` que devuelva un punto de interés (zona, bandera, checkpoint, portador) y `botNav.ts` ya sabe navegar a un punto. Sin esto, el modo funciona entre humanos pero los bots se quedan patrullando.
- **HUD.** Un componente `ObjectiveHud` genérico en `MatchHud.tsx` que pinte como máximo una barra, un reloj y un texto. Los modos aportan los datos; el HUD no sabe qué es una bandera.
- **Resultados.** `PlayScreen` ya pinta una tabla por jugador. Añadir una columna de “objetivo” (capturas, puntos de zona, checkpoints) y un subtítulo con la condición de victoria.

### Orden de implementación recomendado

1. **Refactor mínimo**: extraer `finishMatch`, añadir `modeId` y `timeLimitSeconds`, y crear el registro con el modo `tdm` actual como primero. Esto no cambia el juego, pero deja la puerta abierta.
2. **Modos de reglas**: Contrarreloj, Duelo por vidas y Recompensa. No necesitan mapa nuevo ni IA nueva.
3. **Primer objetivo**: Rey de la colina. Obliga a resolver el HUD genérico, el estado de objetivo y el `modeGoal` de los bots.
4. **Modos de mapa**: Rally y Pilla-pilla, que reutilizan checkpoints y la niebla.
5. **Modos grandes**: Dominio, Captura de bandera, Horda y Jefe, cada uno con su propia iteración de IA.

## Recomendación

Si hay que elegir solo tres para la siguiente versión:

1. **Contrarreloj** — una tarde de trabajo y cambia el ritmo de todas las partidas.
2. **Duelo por vidas** — el formato competitivo que el juego necesita para 1v1/2v2.
3. **Rey de la colina** — el primer objetivo de mapa y la base técnica para Dominio y Captura de bandera.

Y si el objetivo es jugar con gente que no conoce el roster, añadiría **Pilla-pilla** o **Rally** antes que cualquier modo de combate nuevo: son los que mejor explotan la pantalla compartida y la niebla.

## Modos que no recomiendo ahora

- **Battle royale de 8 con zona que se cierra**: el mapa es pequeño y las partidas locales se alargan; además exige mucho estado nuevo.
- **MOBA con súbditos y torres**: duplica el alcance del proyecto y compite con el combate por habilidades, que es donde el juego ya brilla.
- **FFA de 8 colores**: el modelo actual de 4 equipos y la paleta de UI no lo soportan sin un rediseño; el FFA de 4 jugadores da el 80 % del valor con el 20 % del coste.
