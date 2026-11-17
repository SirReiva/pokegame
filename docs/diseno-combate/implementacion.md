# Implementación — estado actual

> Fases 1 y 2 implementadas y aproximaciones cerradas: **núcleo determinista +
> datos de las 28 fichas + motor de estados + 28 pasivas + Mímica, Adaptación,
> eco de haz y HUD de estados**. El diseño sigue mandando en `sistema.md` y
> `balance.md`; este documento explica qué vive ya en el código y qué queda.

## Fase 1 — base de combate

### Escala y estadísticas

- `core/pokedex.ts` contiene las 28 fichas de balance v1.1, con los ajustes de
  supervivencia v1.2 de Voltorb. Incluye PV, AF, DF, AE, DE, VEL, VIS y roles.
- `combatStatsFor` devuelve los valores de la ficha: no hay fórmula de nivel 50.
- VEL y VIS no se duplican: `roster.ts` y `vision.ts` las leen de la ficha.
- Arcanine (0059) está registrado en pokedex, roster, visión, habilidades,
  moveset y manifiesto de sprites. `pnpm sprites --only 0059` importa su arte
  sin regenerar el resto del roster.

### Daño determinista

- `computeDamage` aplica `D = B × (1 + A/100) × 100/(100 + DEF) × E`.
- Sin críticos, sin factor aleatorio y sin STAB.
- Efectividades ×1,15 / ×0,90 / ×0,85 / ×1,00; los tipos dobles multiplican la
  tabla clásica y se clasifican en esa banda. Ningún golpe hace 0.
- `typeEffectiveness` conserva los valores clásicos para terreno y ocultación.

### Kits

- Los 28 movesets están definidos y afinados.
- `KIT_BALANCE` crea una variante `<pokemon>/<habilidad>` por especie y slot:
  la geometría vive en la habilidad y los números finales en `balance.md`.
- Las básicas usan cadencia fija.
- `baseAbilityId` conserva el sonido y los assets de la habilidad original.
- El catálogo está dividido por módulos en `src/game/abilities/`:
  `base.ts` (builder y registro), `common.ts` (instintos) y `roster/`
  (`a`, `b`, `c` y `kits`). `abilities.ts` es solo el índice que construye
  `MOVESETS` y aplica `KIT_BALANCE`.

## Fase 2 — estados y pasivas

### Motor de estados

`core/combat/status.ts` guarda el estado por jugador y `statusEffects.ts` lo
muta. Cada sistema comparte la misma representación:

| Sistema | Implementación |
|---|---|
| Daño periódico | Renueva duración y potencia; no acumula instancias. El daño se cobra por acumulador fraccionario, sin perder PV por redondeo |
| Marcas | Acumulaciones con máximo, caducidad, detonación e inmunidad posterior por marca |
| Raíces | Bloquean movimiento y dash, pero no el lanzamiento |
| Silencios | Bloquean habilidades, no movimiento |
| Resistencia progresiva | −30 % de duración por control fuerte consecutivo, máximo 3 acumulaciones; decae a los 6 s |
| Escudos | Se suman por instancias con duración propia y tope global del 35 % de PV máximos |
| Anti-heal | Reduce curación propia, aliada, regeneración y curación de pasivas |
| Explosiones retardadas | Foco de Entei y eco de Celebi; no siguen al objetivo |
| Zonas | Máximo 3 por personaje; ralentizan rivales y aceleran aliados |
| Clones | Entidad inmóvil con disparo diferido; no recibe daño ni cuenta para visión |
| Reflejo de control | Sincronía devuelve el 50 % de slow, raíz y silencio, con 8 s de enfriamiento |
| Ecos de haz | Rayo Solar repite su línea a los 0,8 s con el 35 % de potencia, sin control ni marcas |
| Aura de control | Agua Purificadora reduce un 25 % la duración de slows, raíces y silencios de Suicune y sus aliados en 4,5 u |
| Autodaño | Sigue sin poder matar |

**Fuente de anti-heal:** Bomba Lodo de Gengar aplica −40 % de curación durante
3 s. Cierra el pendiente de `sistema.md`.

### Pasivas

Las 28 especies tienen pasiva en `src/game/passives.ts`. Los hooks son:

- `onIncomingDamage`: reducciones y absorciones antes de los escudos.
- `onDamageTaken`: reacciones al daño recibido.
- `onDirectHit`: marcas y medidores de impactos directos. Los ticks de áreas
  persistentes no cuentan como impacto directo.
- `onAbilityCast`: clones, estelas, charcos y corrientes.
- `onTick`: auras, placas y medidores que dependen del reloj.
- `onKill`: recompensas por baja.
- `onAssist`: recompensas por asistencia confirmada (Ceniza Viva).

Las marcas no aplican daño dentro del golpe: se encolan y se resuelven en el
paso de estados, que es el único punto con host para daño verdadero, KO y
popups. Esto mantiene el orden determinista y evita recursión.

### Habilidades con estado propio

- **Mímica (Mew):** `sim/mimic.ts` guarda la última habilidad no definitiva que
  cada Mew enemigo ve a 12 u durante 6 s. La copia dura 8 s, se lanza con su
  geometría original al 70 % de potencia y duración, y consume el enfriamiento
  de Mímica. No copia definitivas, Mímica, Adaptación, invocaciones ni clones.
- **Adaptabilidad (Eevee):** `sim/stances.ts` mantiene tres estados manuales
  (Agilidad, Resistencia, Potencia). Adaptación cicla entre ellos; Ataque Rápido
  gana alcance, escudo o daño según el estado, y Último Recurso reparte tres
  impactos o concentra el golpe. El estado se pierde al reaparecer.
- **Multi-impacto:** `AbilityDef.hitCount` permite repartir la potencia de un
  golpe melee en varios impactos. Solo lo usa la definitiva de Eevee en
  Agilidad; el control y el empuje se aplican una vez.
- **Corriente Celeste (Rayquaza):** dash y definitiva activan Corriente 4 s con
  +15 % VEL. La siguiente habilidad Dragón **no básica** consume la carga y ve
  su potencia multiplicada por 1,25 en todas sus instancias de daño. El básico
  no la consume ni la recibe; si la habilidad potenciada impacta, Corriente se
  renueva.

### HUD

- Chip de pasiva con nombre, descripción y contador de acumulaciones.
- Barra cian de escudo sobre la barra de vida.
- El título de vida muestra el escudo activo.
- La barra flotante pinta una tira de estados: DoT (naranja), marcas (violeta),
  anti-heal (rojo), raíz (verde) y silencio (cian). Solo se redibuja cuando
  cambia un valor visible.
- El HUD de detalle muestra esos estados con icono, nombre, acumulaciones y
  tiempo restante, además de los buffs y slows que ya existían.
- El chip de pasiva muestra la postura actual de Eevee (Agilidad, Resistencia o
  Potencia).
- Mímica enseña en el slot la habilidad copiada con su tipo y nombre mientras
  la copia está guardada.

### Bots

- La decisión de objetivo prioriza rivales con marcas activas y sigue
  penalizando escudos, invulnerabilidad y santuarios.
- La puntuación de habilidades lee los medidores ofensivos de pasiva
  (`castMeter`) y no gasta Mímica sin una copia válida.
- La armadura de casteo ya se consultaba para decidir si un golpe interrumpe;
  se mantiene como lectura explícita junto a marcas y pasivas.

## Aproximaciones conscientes

No queda ninguna aproximación de la tabla anterior. Mímica, Adaptación, Agua
Purificadora, Eco Temporal, Corriente Celeste, el clon de Greninja, la
Intimidación de Arcanine, la estela de Moltres, los charcos de Kyogre y Ceniza
Viva usan primitivas propias. La única limitación pendiente es de medida: el
arnés 1v1 no representa una partida 4v4.

## Verificación

```bash
pnpm check          # tipos + arquitectura
pnpm test           # 104 tests, incluidos estados, pasivas, ecos y los 28 movesets
pnpm sim            # partida headless
pnpm balance        # duelos bot contra bot
```

El modelo de rotación continua de `balance.md` no incluye pasivas, escudos ni
anti-heal: sirve para comparar kits, no para predecir una pelea completa. Las
partidas headless sí ejecutan todos los sistemas nuevos.

## Balance v1.2 — pasivas activas

La primera pasada con pasivas, escudos y anti-heal confirmó tres outliers en
duelos 1v1 de primer KO:

- **Voltorb:** 0 % de victorias y varios duelos sin daño. Sube a 1000 PV, 80 DF
  y 85 DE; Explosión baja al 20 % de autodaño; su pasiva pasa a marcar con
  cualquier golpe directo y detonar cada dos cargas. En la muestra de cinco
  especies sube al 17 %.
- **Onix:** las placas bajan de 70 a 60 PV (210 → 180 de absorción). Su
  winrate cae del 46 % al 42 % en la misma muestra, manteniendo su identidad de
  muro.
- **Squirtle:** el escudo de Caparazón Guardián baja del 10 % al 8 % y exige 4 s
  sin daño en vez de 3. Su winrate baja del 38 % al 25 % y sigue siendo el
  tanque de protección de equipo.

La muestra es pequeña y el arnés 1v1 termina en el primer KO, así que favorece
a los tanques y castiga a los hostigadores de área. Los números de `balance.md`
del modelo de rotación no cambian: la pasada v1.2 toca supervivencia y pasivas,
no la potencia de los kits salvo el autodaño de Explosión.

## Pendiente

1. Playtest dirigido con los sistemas activos; el arnés 1v1 no sustituye una
   partida 4v4 con humanos.
2. Revisar el sesgo del arnés 1v1 para outliers de área como Voltorb y añadir
   una lectura de equipos 4v4.
3. Medir el roster completo; la muestra de cinco especies es un pool cerrado y
   de cero suma.
