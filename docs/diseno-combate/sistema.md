# Sistema de combate — Documento canónico

> Estado: **v0.2 cerrada en concepto; números cerrados en balance v1.1**.
>
> Fuente: conversación de diseño del 2026-11 y fichas de `pokemon/`.
> Implementación en curso: ver [implementacion.md](implementacion.md).

## 1. Principios

1. **Determinismo total.** Sin golpes críticos, sin daño aleatorio, sin
   porcentajes de probabilidad para aplicar efectos. Una habilidad hace siempre
   lo que dice.
2. **Nada decisivo por tabla.** Las efectividades dan ventaja, no ganan peleas.
   Ningún ataque hace cero daño por tipo.
3. **Cada Pokémon se siente distinto.** La identidad está en la pasiva, el
   ataque básico y las tres habilidades, no en las estadísticas.
4. **El control no debe impedir jugar.** Duraciones cortas, resistencia
   progresiva y contrajuego visible.
5. **Peleas de 6-9 s** entre personajes sanos, sin eliminaciones de una sola
   rotación.

## 2. Estadísticas

| Estadística | Abreviatura | Función |
|---|---|---|
| Puntos de vida | PV | Vida máxima |
| Ataque físico | AF | Potencia de ataques físicos |
| Defensa física | DF | Reduce daño físico |
| Ataque especial | AE | Potencia de ataques especiales |
| Defensa especial | DE | Reduce daño especial |
| Velocidad | VEL | Desplazamiento, en u/s |
| Visión | VIS | Radio circular de detección de enemigos, en u |

**Visión ≠ alcance.** La visión es del Pokémon; el alcance es propiedad de cada
habilidad.

**Escala cerrada (balance v1):** media del roster en 100 y PV de referencia
1.000. Con 100 de ataque y 100 de defensa, `D ≈ B`: los poderes equivalen casi a
daño final contra un objetivo medio. Rangos usados: 60-155 en AF/AE y 70-140 en
defensas.

## 3. Daño

### 3.1 Fórmula

```
D = B × (1 + A/100) × 100/(100 + DEF) × E
```

- `D`: daño final.
- `B`: poder base de la habilidad.
- `A`: AF o AE del atacante.
- `DEF`: DF o DE del objetivo.
- `E`: multiplicador de efectividad.

Ejemplo: Mordisco de Arcanine (B 55, AF 120) contra DF 100 → 55 × 2,2 × 0,5 = 60,5.

### 3.2 Categorías

| Categoría | Usa | Reduce con |
|---|---|---|
| Físico | AF | DF |
| Especial | AE | DE |
| Verdadero | — | — (solo casos excepcionales) |

Una habilidad puede tener varias partes con categorías distintas (impacto
físico + explosión especial, por ejemplo).

### 3.3 Efectividades

| Relación | Multiplicador |
|---|---:|
| Supereficaz | ×1,15 |
| Poco eficaz | ×0,90 |
| Inmunidad clásica | ×0,85 |
| Neutral | ×1,00 |

**Ningún ataque hace cero daño por tipo.** La "inmunidad" clásica es una
resistencia extrema.

**Tipos dobles:** se multiplican las relaciones clásicas y **se limita el
resultado a [0,85, 1,15]**. Esto evita los ×4 y respeta las inmunidades
(Ej.: Zapdos vs Tierra = 0,85; Gyarados vs Planta = 1,00; Bulbasaur vs Fuego =
1,15).

**STAB: no se aplica.** El código actual usa ×1,5; hay que retirarlo. El tipo ya
influye en el daño mediante la efectividad, y un ×1,5 oculto rompería el ancla
`D ≈ B` y la lectura de las fichas.

**Daño mínimo:** 1 PV por impacto válido.

### 3.4 Objetivo de tiempo de muerte

| Rol | TTK vs 1.000 PV |
|---|---:|
| Asesino | 7-9 s |
| Luchador | 7-9 s |
| Mago | 7,5-9,5 s |
| Hostigador | 8-10 s |
| Tanque | 9,5-12,5 s |
| Apoyo | 9,5-12,5 s |

Ho-Oh (Apoyo/Luchador) se evalúa en 8,5-10,5 s por su rol secundario. La
metodología y las tablas finales están en [balance.md](balance.md).

## 4. Roles

Seis roles. Cada Pokémon tiene uno principal y uno secundario; los roles
describen identidad, no limitan el kit.

| Rol | Función |
|---|---|
| Tanque | Proteger y resistir |
| Luchador | Combatir en primera línea |
| Asesino | Eliminar objetivos |
| Mago | Controlar zonas |
| Hostigador | Presionar y reposicionarse |
| Apoyo | Curar, escudar y dar utilidad |

## 5. Habilidades

### 5.1 Tipos de ejecución

Melee · Proyectil · Haz · AoE · Dash · Self · Deployable · Invocación.

### 5.2 Propiedades universales

Potencia · categoría · tipo · alcance · radio · apertura · velocidad de
proyectil · startup · activo · recovery · enfriamiento · armadura de casteo ·
ventana de armadura (Startup/Cast) · empuje · efectos · persistencia tras el
lanzamiento.

Cada Pokémon dispone de **un ataque básico y tres habilidades** (dos normales y
una definitiva).

## 6. Interrupción y armadura de casteo

1. Un impacto válido puede interrumpir una preparación o una canalización.
2. La armadura de casteo protege la ejecución, **no absorbe daño de los PV**.
3. Los controles forzados y los golpes letales atraviesan la armadura.
4. Si una habilidad se interrumpe antes de producir su efecto, el enfriamiento
   restante no puede superar el **50 %** del original (salvo interrupción letal).
5. La armadura se consume cuando el impacto habría interrumpido. Si el daño
   iguala o supera la reserva, se rompe.
6. **Persistencia:** proyectiles ya lanzados, zonas desplegadas e invocaciones
   siguen funcionando aunque el lanzador reciba daño después.

## 7. Efectos

### 7.1 Familias

1. Vida y daño: daño directo, daño periódico, curación, escudo, robo de vida,
   reducción de curación.
2. Modificadores: buffs, debuffs, amplificación y reducción de daño.
3. Control: slow, root, stun, silence, disarm, desplazamiento forzado,
   interrupción.
4. Visión: revelación, ocultación, camuflaje, reducción de visión.
5. Marcas y acumulaciones.
6. Terreno: zonas peligrosas, barreras, zonas beneficiosas, alteración.

### 7.2 Reglas cerradas

- **Daño periódico:** reaplicar **renueva** la duración; no acumula instancias.
- **Control repetido:** **resistencia progresiva** (cada control fuerte
  consecutivo dura menos; la resistencia decae con el tiempo).
- **Escudos:** se suman en una reserva común con límite global del **35 % de PV
  máximos**; cada uno conserva su duración.
- **Curación:** nunca supera PV máximos. El anti-heal reduce la curación recibida
  (Bomba Lodo de Gengar: −40 % durante 3 s).
- **Limpieza:** básica (quemadura, veneno, slow) · avanzada (también root y
  debuffs) · excepcional (también stun y controles fuertes).
- **Marcas:** cada marca define máximo, caducidad e inmunidad posterior. La
  detonación se resuelve en el paso de estados, no dentro del golpe.
- **Zonas:** máximo 3 instancias por personaje; la más antigua se elimina.

### 7.3 Duraciones iniciales de control

| Efecto | Duración |
|---|---:|
| Ralentización | 1,5-2,5 s |
| Enraizamiento | 0,35-0,60 s |
| Aturdimiento | 0,35-0,75 s |
| Silencio | 0,5-0,9 s |
| Desarme | 0,5-0,9 s |
| Interrupción | Instantánea |

## 8. Zonas

| Tipo | Comportamiento | Ejemplos |
|---|---|---|
| Persistente | Queda en el punto de casteo | Remolino, Caldera, Veneno |
| Trayectoria | Sigue el recorrido de un dash o picado | Estela de Moltres |
| Retardada | Aviso y explosión tras un tiempo | Foco de Entei, Estallido |
| Aura móvil | Se mueve con el lanzador | Tormenta de Tyranitar |
| Barrera dinámica | Collider temporal que bloquea movimiento | Pilares de Groudon |
| Dual | Daña a enemigos y cura/escuda aliados | Fuego Sagrado, Aurora Boreal |

Las zonas que reaplican un efecto lo hacen con una **cadencia fija** (p. ej. 1
vez por segundo), no por frame.

## 9. Estados especiales

- **Invulnerabilidad:** máximo **1,2 s**, no encadenable, con aviso visible. Los
  daños periódicos ya aplicados siguen haciendo daño.
- **Inmunidad a desplazamiento:** ignora empujes, atracciones y lanzamientos
  (Groudon). No afecta a raíces, stuns ni silencios.
- **Autodaño:** nunca puede matar al lanzador; deja siempre 1 PV.
- **Anti-heal:** reduce la curación recibida; afecta a curas propias y ajenas.
- **Escudos a aliados:** confirmados (Squirtle, Suicune, Lugia).
- **Curación diferida:** la curación llega tras un aviso; solo cura a quien
  esté dentro en el momento del efecto (Deseo).
- **Reducción de una instancia:** reduce un solo golpe con enfriamiento propio
  (Multiescamas de Lugia). No es un escudo.
- **Eco:** repite un porcentaje de un efecto ya resuelto, sin control (Celebi).

## 10. Marcas y medidores

### 10.1 Marcas sobre el enemigo

| Marca | Dueño | Efecto |
|---|---|---|
| Presión | Mewtwo | 3 → silencio 0,5 s + slow 20 % |
| Frío | Articuno | 3 → root 0,6 s + slow; luego inmunidad 8 s |
| Carga | Zapdos | Detona en área al golpear con habilidad |
| Presa | Raikou | Revelación + velocidad para Raikou |
| Fractura | Onix | −8 % DF, máx. 2 |

### 10.2 Medidores propios

| Medidor | Dueño | Se gana con | Payoff |
|---|---|---|---|
| Calor | Charmander | Impactos directos | Siguiente habilidad de Fuego potenciada |
| Aura | Lucario | Impactos (bonus por alternar físico/especial) | Siguiente habilidad potenciada |
| Furia | Gyarados | Dar/recibir daño | 5 cargas → Enfurecido 4 s |
| Corriente | Rayquaza | Dash o ult | +25 % a la siguiente habilidad Dragón no básica; se renueva al impactar |

Regla común pendiente: ganancia, tope, decaimiento, HUD y qué pasa al morir.

## 11. Recursos

- **Solo enfriamientos** (balance v1). La carga por daño/tiempo queda como
  variante futura.
- Presupuesto aplicado: básico 0,5-0,85 s · H1 6-9 s (Greninja 1,4 s) ·
  H2 8-12 s · definitiva 14-18 s.

## 12. Nivel y XP

Los niveles 1-10 de partida siguen siendo **decorativos**: no modifican vida,
daño ni estadísticas. El rediseño asume estadísticas fijas y esta pasada no
introduce escalado por nivel.

## 13. Reglas de diseño de pasivas

- No deben ser bonificaciones planas de estadísticas.
- Deben reforzar la identidad, premiar la forma de jugar y diferenciar del rol.
- Pueden ser auras, medidores, marcas, reglas de criatura o estados
  condicionales.
- Toda pasiva con acumulaciones debe indicar si el control fuerte las borra.

## 14. Decisiones cerradas (registro)

| Fecha | Decisión |
|---|---|
| 2026-11 | Sin críticos ni daño aleatorio |
| 2026-11 | Efectividades ×1,15 / ×0,90 / ×0,85; sin inmunidades |
| 2026-11 | 7 estadísticas; visión separada del alcance |
| 2026-11 | Tipos dobles: producto con tope [0,85, 1,15] |
| 2026-11 | DoT renueva; control con resistencia progresiva; escudos suman con tope |
| 2026-11 | Interrupción + armadura Startup/Cast + reembolso 50 % |
| 2026-11 | Autodaño nunca mata |
| 2026-11 | Invulnerabilidad máx. 1,2 s, no encadenable |
| 2026-11 | Resurrección fuera del juego |
| 2026-11 | Zonas: máx. 3 por personaje |
| 2026-11 | Arcanine se añade como Pokémon 28 |
| 2026-11 | Balance v1: escala 100, PV 1.000, STAB eliminado, ultimates por enfriamiento |
| 2026-11 | Bandas de TTK por rol cerradas (ver §3.4 y balance.md) |
| 2026-11 | Balance v1.1: básicas especiales corregidas; Mewtwo, Zapdos, Lugia y Celebi reajustados |
| 2026-11 | Fase 2: DoT, marcas, raíz, silencio, escudos, anti-heal, zonas y pasivas implementados |
| 2026-11 | Resistencia progresiva: −30 % por control, máx. 3, decae a los 6 s |
| 2026-11 | Tope global de escudos: 35 % de PV máximos |
| 2026-11 | Anti-heal: Bomba Lodo de Gengar, −40 % durante 3 s |
| 2026-11 | Mímica copia la última habilidad rival vista, al 70 % y con un solo uso |
| 2026-11 | Adaptabilidad de Eevee: tres estados manuales con efectos en H2 y definitiva |
| 2026-11 | Agua Purificadora: −25 % de slows, raíces y silencios para Suicune y aliados en 4,5 u |
| 2026-11 | Eco Temporal: Rayo Solar repite su línea a 0,8 s sin control ni marcas |
| 2026-11 | Corriente Celeste: el +25 % se limita a la siguiente habilidad Dragón no básica y se renueva al impactar |
| 2026-11 | HUD de detalle con iconos, nombres y tiempo de cada estado |
| 2026-11 | Balance v1.2: ajustes de Voltorb, Onix y Squirtle con pasivas activas |

## 15. Pendientes

1. Playtest dirigido del balance v1.1/v1.2 con pasivas, escudos y anti-heal.
2. Objetos y pociones: las pociones ya escalan; falta decidir el resto.
3. Modos y tamaño de equipo.
4. Revisar la lectura de estados de los bots en partidas 4v4; marcas, medidores
   y armaduras ya se consultan en la decisión.
5. Medir el roster completo y añadir una lectura de equipos 4v4.
