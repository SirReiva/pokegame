# Balance simulado con duelos 1v1

> Generado el 2026-11-16 a partir de `80384e1`. No editar a mano las secciones de datos: se regeneran con `pnpm balance`. La sección de propuestas se conserva entre ejecuciones.

## Metodología

- Motor real: `scripts/sim-headless.ts`, mismo paso fijo de 60 Hz que `Game`, sin PlayCanvas, GPU ni audio.
- Cada duelo enfrenta dos bots 1v1 y termina en el **primer KO**. Si no hay KO antes de 40 s, el duelo cuenta como empate.
- **Round-robin completo**: cada pareja se juega en las dos orientaciones de spawn (A rojo vs B azul y B rojo vs A azul), así el sesgo del mapa se reparte.
- Semillas reproducibles: 4 repeticiones por orientación. Instinto común fijo: **proteccion** para ambos lados.
- Dificultad de bots: **expert**. Mapa: `arena`. Especies: 24 (todas las que tienen moveset).
- Limitaciones: los bots no juegan como humanos (retiradas, dudas de ruta y errores de puntería forman parte del resultado), el arnés no genera los colliders de árboles/rocas ni simula objetos recogibles, y un duelo termina en el primer KO (mide el primer intercambio, no una partida completa).

Duelos jugados: **2208** (1953 decididos, 255 empates). TTK medio hasta el primer KO: **15.4 s**. Tiempo de pared: 479.0 s.

Las **propuestas de ajuste** curadas están al final del informe: [Propuestas de ajuste](#propuestas-de-ajuste).

### Sesgo de spawn (espejos)

Se jugaron 96 espejos (misma especie en ambos lados). Gana rojo 30 (31%), gana azul 37 (39%), empates 29. Una desviación grande indica que el mapa o los spawns favorecen un lado.

## Resultados globales

Ordenado por winrate. `Gana/Pierde/Empata` cuenta duelos, no KOs. `TTK victoria` es el tiempo medio hasta el KO cuando la especie gana; `Vida restante` es la fracción media de vida al ganar.

| # | Pokémon | Tipos | PV | Vel | Hurtbox | Winrate | Gana | Pierde | Empata | TTK victoria | Daño medio | Recibido medio | Vida restante | Duelos 0 daño | Mejor rival | Peor rival |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | Rayquaza | Dragon / Flying | 180 | 7.6 | 0.58 | **72%** | 132 | 39 | 13 | 15.2 s | 126 | 74 | 79% | 16 | Charmander (100%) | Moltres (13%) |
| 2 | Greninja | Water / Dark | 147 | 7.4 | 0.42 | **65%** | 120 | 50 | 14 | 14.7 s | 116 | 57 | 85% | 22 | Bulbasaur (100%) | Rayquaza (13%) |
| 3 | Moltres | Fire / Flying | 165 | 7.0 | 0.56 | **64%** | 118 | 45 | 21 | 14.0 s | 122 | 63 | 87% | 21 | Charmander (100%) | Kyogre (0%) |
| 4 | Kyogre | Water | 175 | 5.9 | 0.60 | **61%** | 112 | 50 | 22 | 17.2 s | 111 | 89 | 85% | 28 | Charmander (100%) | Bulbasaur (13%) |
| 5 | Tyranitar | Rock / Dark | 175 | 4.5 | 0.52 | **59%** | 109 | 49 | 26 | 14.8 s | 112 | 71 | 88% | 28 | Pikachu (100%) | Suicune (0%) |
| 6 | Gyarados | Water / Flying | 170 | 6.2 | 0.56 | **58%** | 106 | 49 | 29 | 15.0 s | 111 | 82 | 79% | 26 | Mew (100%) | Greninja (0%) |
| 7 | Mew | Psychic | 175 | 7.0 | 0.36 | **57%** | 105 | 62 | 17 | 17.1 s | 100 | 101 | 86% | 39 | Bulbasaur (100%) | Greninja (0%) |
| 8 | Gengar | Ghost / Poison | 135 | 7.6 | 0.44 | **55%** | 101 | 69 | 14 | 15.2 s | 99 | 66 | 93% | 33 | Bulbasaur (100%) | Lucario (0%) |
| 9 | Lucario | Fighting / Steel | 145 | 6.5 | 0.42 | **54%** | 100 | 63 | 21 | 14.3 s | 104 | 71 | 85% | 23 | Bulbasaur (100%) | Zapdos (0%) |
| 10 | Suicune | Water | 175 | 7.0 | 0.50 | **53%** | 98 | 55 | 31 | 16.5 s | 101 | 86 | 81% | 36 | Charmander (100%) | Gengar (0%) |
| 11 | Articuno | Ice / Flying | 165 | 6.8 | 0.56 | **51%** | 93 | 67 | 24 | 14.7 s | 98 | 87 | 81% | 37 | Bulbasaur (100%) | Lucario (0%) |
| 12 | Zapdos | Electric / Flying | 165 | 7.6 | 0.52 | **51%** | 93 | 58 | 33 | 13.4 s | 101 | 82 | 83% | 30 | Bulbasaur (100%) | Pikachu (0%) |
| 13 | Ho-Oh | Fire / Flying | 181 | 6.9 | 0.58 | **42%** | 78 | 85 | 21 | 17.2 s | 87 | 129 | 84% | 32 | Bulbasaur (100%) | Onix (0%) |
| 14 | Groudon | Ground | 175 | 5.6 | 0.56 | **40%** | 73 | 73 | 38 | 17.9 s | 85 | 93 | 82% | 46 | Onix (100%) | Zapdos (0%) |
| 15 | Onix | Rock / Ground | 110 | 4.6 | 0.58 | **38%** | 70 | 100 | 14 | 15.7 s | 74 | 65 | 92% | 58 | Pikachu (100%) | Bulbasaur (0%) |
| 16 | Lugia | Psychic / Flying | 181 | 7.5 | 0.58 | **35%** | 65 | 95 | 24 | 17.7 s | 73 | 120 | 77% | 53 | Bulbasaur (100%) | Greninja (0%) |
| 17 | Pikachu | Electric | 110 | 6.9 | 0.36 | **34%** | 62 | 105 | 17 | 15.7 s | 77 | 74 | 89% | 59 | Charmander (75%) | Gengar (0%) |
| 18 | Mewtwo | Psychic | 181 | 7.8 | 0.44 | **33%** | 61 | 89 | 34 | 15.5 s | 80 | 125 | 73% | 55 | Bulbasaur (100%) | Greninja (0%) |
| 19 | Scyther | Bug / Flying | 145 | 7.2 | 0.42 | **32%** | 59 | 121 | 4 | 13.5 s | 59 | 105 | 83% | 75 | Bulbasaur (100%) | Gengar (0%) |
| 20 | Celebi | Psychic / Grass | 175 | 7.1 | 0.34 | **29%** | 53 | 118 | 13 | 17.2 s | 59 | 129 | 81% | 65 | Squirtle (100%) | Bulbasaur (0%) |
| 21 | Bulbasaur | Grass / Poison | 120 | 4.6 | 0.42 | **26%** | 47 | 125 | 12 | 14.6 s | 53 | 86 | 92% | 71 | Onix (100%) | Gengar (0%) |
| 22 | Voltorb | Electric | 115 | 8.2 | 0.34 | **23%** | 43 | 121 | 20 | 11.0 s | 67 | 83 | 62% | 57 | Squirtle (88%) | Gengar (0%) |
| 23 | Squirtle | Water | 119 | 5.2 | 0.40 | **19%** | 35 | 123 | 26 | 16.2 s | 59 | 89 | 88% | 76 | Ho-Oh (63%) | Gengar (0%) |
| 24 | Charmander | Fire | 114 | 5.8 | 0.38 | **11%** | 20 | 142 | 22 | 17.5 s | 45 | 95 | 88% | 61 | Celebi (63%) | Gengar (0%) |

### Lectura rápida

- Mejor winrate: **Rayquaza** (72%). Peor: **Charmander** (11%). Diferencia: **61 puntos**.
- Por debajo del 25%: Voltorb (23%), Squirtle (19%), Charmander (11%).
- Más empates: **Groudon** (38/184, 21%).
- Duelos sin daño (posible inmunidad de tipo o kit inútil): Squirtle 76/184, Scyther 75/184, Bulbasaur 71/184, Celebi 65/184, Charmander 61/184, Pikachu 59/184, Onix 58/184, Voltorb 57/184.

## Matriz de enfrentamientos (winrate de la fila)

Cada celda es el winrate de la especie de la fila contra la de la columna, agregando las dos orientaciones, todas las semillas y todos los instintos seleccionados. `—` es el espejo.

| Pokémon | 0144 | 0001 | 0251 | 0004 | 0094 | 0658 | 0383 | 0130 | 0250 | 0382 | 0448 | 0249 | 0151 | 0150 | 0146 | 0095 | 0025 | 0384 | 0123 | 0007 | 0245 | 0248 | 0100 | 0145 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Articuno | — | 100% | 100% | 63% | 75% | 25% | 50% | 38% | 38% | 38% | 0% | 50% | 38% | 50% | 0% | 63% | 63% | 25% | 100% | 100% | 38% | 25% | 25% | 63% |
| Bulbasaur | 0% | — | 100% | 63% | 0% | 0% | 13% | 25% | 0% | 75% | 0% | 0% | 0% | 0% | 0% | 100% | 63% | 0% | 0% | 75% | 0% | 0% | 75% | 0% |
| Celebi | 0% | 0% | — | 25% | 0% | 63% | 75% | 0% | 0% | 63% | 0% | 0% | 25% | 25% | 0% | 100% | 25% | 0% | 0% | 100% | 38% | 25% | 100% | 0% |
| Charmander | 0% | 25% | 63% | — | 0% | 0% | 13% | 0% | 0% | 0% | 0% | 0% | 13% | 0% | 0% | 0% | 25% | 0% | 13% | 50% | 0% | 0% | 50% | 0% |
| Gengar | 25% | 100% | 100% | 88% | — | 13% | 50% | 38% | 25% | 50% | 0% | 50% | 13% | 88% | 25% | 75% | 100% | 13% | 100% | 100% | 88% | 0% | 100% | 25% |
| Greninja | 63% | 100% | 38% | 75% | 88% | — | 75% | 100% | 38% | 63% | 38% | 100% | 100% | 88% | 25% | 63% | 63% | 13% | 50% | 88% | 25% | 63% | 75% | 75% |
| Groudon | 25% | 75% | 0% | 75% | 25% | 25% | — | 13% | 63% | 0% | 50% | 75% | 13% | 13% | 13% | 100% | 75% | 25% | 100% | 25% | 13% | 25% | 88% | 0% |
| Gyarados | 13% | 50% | 100% | 88% | 38% | 0% | 75% | — | 75% | 25% | 88% | 88% | 100% | 63% | 63% | 88% | 25% | 0% | 100% | 63% | 50% | 75% | 13% | 50% |
| Ho-Oh | 50% | 100% | 100% | 75% | 75% | 63% | 13% | 13% | — | 0% | 75% | 50% | 25% | 25% | 13% | 0% | 63% | 0% | 100% | 25% | 25% | 0% | 75% | 13% |
| Kyogre | 50% | 13% | 13% | 100% | 38% | 25% | 88% | 50% | 100% | — | 88% | 100% | 38% | 88% | 75% | 100% | 75% | 13% | 63% | 25% | 13% | 75% | 100% | 75% |
| Lucario | 100% | 100% | 100% | 75% | 63% | 50% | 13% | 13% | 0% | 0% | — | 75% | 13% | 75% | 0% | 88% | 75% | 38% | 100% | 63% | 88% | 50% | 75% | 0% |
| Lugia | 25% | 100% | 88% | 100% | 25% | 0% | 25% | 0% | 38% | 0% | 25% | — | 0% | 63% | 13% | 88% | 63% | 0% | 50% | 63% | 0% | 0% | 25% | 25% |
| Mew | 25% | 100% | 50% | 88% | 88% | 0% | 88% | 0% | 63% | 63% | 63% | 38% | — | 38% | 38% | 88% | 50% | 63% | 63% | 88% | 75% | 0% | 100% | 50% |
| Mewtwo | 25% | 100% | 38% | 75% | 13% | 0% | 63% | 13% | 25% | 0% | 13% | 13% | 50% | — | 0% | 75% | 38% | 38% | 25% | 50% | 0% | 0% | 100% | 13% |
| Moltres | 63% | 75% | 100% | 100% | 63% | 75% | 75% | 25% | 75% | 0% | 100% | 88% | 63% | 50% | — | 25% | 75% | 75% | 100% | 63% | 75% | 63% | 38% | 13% |
| Onix | 38% | 0% | 0% | 75% | 25% | 38% | 0% | 0% | 100% | 0% | 13% | 13% | 0% | 13% | 75% | — | 100% | 50% | 100% | 50% | 0% | 38% | 100% | 50% |
| Pikachu | 38% | 38% | 75% | 75% | 0% | 13% | 25% | 50% | 38% | 13% | 25% | 25% | 50% | 50% | 25% | 0% | — | 25% | 38% | 38% | 25% | 0% | 50% | 63% |
| Rayquaza | 75% | 88% | 100% | 100% | 88% | 88% | 63% | 100% | 75% | 88% | 38% | 100% | 25% | 63% | 13% | 50% | 50% | — | 88% | 88% | 38% | 75% | 88% | 75% |
| Scyther | 0% | 100% | 100% | 88% | 0% | 50% | 0% | 0% | 0% | 25% | 0% | 50% | 38% | 75% | 0% | 0% | 50% | 13% | — | 50% | 25% | 25% | 50% | 0% |
| Squirtle | 0% | 13% | 0% | 25% | 0% | 0% | 38% | 0% | 63% | 25% | 25% | 25% | 13% | 50% | 25% | 25% | 50% | 13% | 38% | — | 13% | 0% | 0% | 0% |
| Suicune | 63% | 88% | 50% | 100% | 0% | 63% | 38% | 38% | 75% | 63% | 13% | 75% | 25% | 38% | 13% | 88% | 50% | 38% | 75% | 75% | — | 50% | 63% | 50% |
| Tyranitar | 75% | 75% | 63% | 75% | 100% | 13% | 38% | 25% | 88% | 25% | 13% | 100% | 100% | 100% | 25% | 38% | 100% | 25% | 75% | 75% | 0% | — | 63% | 75% |
| Voltorb | 75% | 25% | 0% | 50% | 0% | 0% | 0% | 50% | 13% | 0% | 25% | 50% | 0% | 0% | 50% | 0% | 38% | 0% | 38% | 88% | 13% | 13% | — | 13% |
| Zapdos | 13% | 100% | 100% | 100% | 63% | 25% | 0% | 25% | 75% | 13% | 100% | 25% | 38% | 63% | 75% | 0% | 0% | 25% | 100% | 100% | 50% | 13% | 63% | — |

Leyenda de ids: 0144 Articuno · 0001 Bulbasaur · 0251 Celebi · 0004 Charmander · 0094 Gengar · 0658 Greninja · 0383 Groudon · 0130 Gyarados · 0250 Ho-Oh · 0382 Kyogre · 0448 Lucario · 0249 Lugia · 0151 Mew · 0150 Mewtwo · 0146 Moltres · 0095 Onix · 0025 Pikachu · 0384 Rayquaza · 0123 Scyther · 0007 Squirtle · 0245 Suicune · 0248 Tyranitar · 0100 Voltorb · 0145 Zapdos.

## Duelos con cero daño

Parejas en las que el perdedor no hizo **ningún** daño en todos sus duelos (señal de inmunidad de tipo o de un kit que no conecta). Se excluyen las parejas con menos de dos duelos decididos.

Bulbasaur → Onix (8/8 duelos), Gengar → Celebi (8/8 duelos), Onix → Voltorb (8/8 duelos), Greninja → Mew (8/8 duelos), Tyranitar → Mewtwo (8/8 duelos), Tyranitar → Mew (8/8 duelos), Moltres → Scyther (8/8 duelos), Moltres → Celebi (8/8 duelos), Gengar → Charmander (7/7 duelos), Gengar → Mewtwo (7/7 duelos), Groudon → Voltorb (7/7 duelos), Greninja → Mewtwo (7/7 duelos), Voltorb → Articuno (6/6 duelos), Bulbasaur → Charmander (5/5 duelos), Bulbasaur → Pikachu (5/5 duelos), Articuno → Charmander (5/5 duelos), Moltres → Squirtle (5/5 duelos), Squirtle → Ho-Oh (5/5 duelos), Greninja → Pikachu (5/5 duelos), Lucario → Gengar (5/5 duelos), Moltres → Gengar (5/5 duelos), Celebi → Kyogre (5/5 duelos), Charmander → Squirtle (4/4 duelos), Squirtle → Pikachu (4/4 duelos), Onix → Squirtle (4/4 duelos), Pikachu → Mewtwo (4/4 duelos), Pikachu → Mew (4/4 duelos), Pikachu → Gyarados (4/4 duelos), Gengar → Lugia (4/4 duelos), Voltorb → Gyarados (4/4 duelos), Greninja → Scyther (4/4 duelos), Articuno → Groudon (4/4 duelos), Suicune → Zapdos (4/4 duelos), Zapdos → Suicune (4/4 duelos), Squirtle → Scyther (3/3 duelos), Pikachu → Scyther (3/3 duelos), Gengar → Gyarados (3/3 duelos), Moltres → Voltorb (3/3 duelos), Onix → Greninja (3/3 duelos), Greninja → Celebi (3/3 duelos), Onix → Articuno (3/3 duelos), Voltorb → Scyther (3/3 duelos), Rayquaza → Suicune (3/3 duelos), Charmander → Pikachu (2/2 duelos), Squirtle → Moltres (2/2 duelos), Gyarados → Pikachu (2/2 duelos), Pikachu → Moltres (2/2 duelos), Pikachu → Groudon (2/2 duelos), Pikachu → Rayquaza (2/2 duelos), Onix → Gengar (2/2 duelos), Gengar → Articuno (2/2 duelos), Lugia → Gengar (2/2 duelos), Voltorb → Lucario (2/2 duelos), Greninja → Moltres (2/2 duelos), Rayquaza → Mew (2/2 duelos), Moltres → Gyarados (2/2 duelos), Scyther → Tyranitar (2/2 duelos), Groudon → Articuno (2/2 duelos), Greninja → Suicune (2/2 duelos), Pikachu → Lugia (2/2 duelos).

## Cómo regenerar

```bash
pnpm balance
pnpm balance --seeds 6 --common regeneracion --difficulty expert --seconds 40
pnpm balance --species 0025,0094,0382 --seeds 2 --json .cache/balance.json
```

Los datos crudos (duelos, agregados y configuración) quedan en `.cache/balance-report.json`.

<!-- propuestas:inicio -->
## Propuestas de ajuste

> Revisión curada de la tanda del 2026-11-16: 2.208 duelos (1.953 decididos,
> 255 empates), 24 especies, 4 semillas por orientación, Protección, bots
> `expert`, mapa `arena`, primer KO. **No se ha aplicado ningún cambio**: esta
> sección es una propuesta para discutir y volver a medir.

### Diagnóstico

- **El problema principal es la polarización, no solo la media.** De las 552
  celdas de la matriz, **114 (21 %) acaban en 0 % exacto** y 68 (12 %) en 100 %.
  Otras 169 quedan en ≤12,5 %. La diferencia entre Rayquaza (72 %) y Charmander
  (11 %) es de **61 puntos**.
- **La media engaña en los psíquicos.** Mewtwo (33 %) y Mew (57 %) comparten el
  0 % literal contra Greninja y Tyranitar (todo su kit ofensivo es Psíquico y
  ambos son Siniestro), pero Mew gana por básica rápida (45 de potencia cada
  0,3 s) y `Recuperación`. Mewtwo depende de tres golpes de daño y un
  teletransporte.
- **Los tanques lentos no están rotos por stats.** Lugia (35 %), Onix (38 %) y
  Groudon (40 %) quedan por debajo de la media; Tyranitar (59 %) es la
  excepción. La diferencia está en tener una básica con alcance/cadencia y una
  habilidad de castigo fiable, no en los PV.
- **TTK medio hasta el primer KO: 15,4 s**, pero incluye el acercamiento; el
  intercambio real se resuelve en 3-6 s. No hay motivo para un multiplicador
  global de daño todavía.
- **Los 255 empates (11,5 %) son en buena parte retiradas mutuas de los bots**
  (Groudon, 38/184). No perseguir ese número con cambios de daño; primero hay
  que decidir si la IA debe aceptar más peleas a poca vida.

### P0 — Cobertura, inmunidades y básicas

Es el cambio con más impacto y el que menos depende de afinar potencias.

| Caso | Evidencia | Propuesta |
| --- | --- | --- |
| Mewtwo y Mew contra Siniestro | Greninja → Mewtwo 88 %, Greninja → Mew 100 %, Tyranitar → Mewtwo/Mew 100 %; Mewtwo 0 % y Mew 0 % en esos cruces | Cambiar un slot de utilidad por cobertura: `Teletransporte` (Mewtwo) y `Agilidad` (Mew) por `Esfera Aura` (Lucha, 60/5) o `Bola Sombra` (Fantasma, 62/6). Alternativa sistémica: bajar la inmunidad de tipo a **0,25×** en PvP. |
| Básicas Normales de varios kits | Bulbasaur, Squirtle y Charmander llevan `Placaje`/`Arañazo` (Normal 55); Pikachu lleva `Placaje` + `Ataque Rápido` (Normal). La básica hace 0 contra Fantasma y el resto del kit no basta para compensar ese hueco. | Básica elemental por especie: `Látigo Cepa` (Planta, 55/0,25), `Pistola Agua` (Agua, 55/0,30), `Ascuas` (Fuego, 55/0,30) y `Chispazo` (Eléctrico, 55/0,25), con la misma geometría que la básica actual. |
| Pikachu/Voltorb/Zapdos contra Tierra | Pikachu 0 % contra Onix; Voltorb 0 % contra Onix y Groudon; Zapdos 0 % contra Onix y Groudon | No tocar la inmunidad Eléctrico → Tierra: es una regla del juego. La cobertura debe venir de la básica o de un slot no eléctrico. `Pico Taladro` de Zapdos ya es Volador y pega a Onix; el problema es que el bot no llega a usarlo. |
| Fuego/Volador contra Agua/Eléctrico | Moltres 0 % contra Kyogre y 13 % contra Zapdos; Ho-Oh 0 % contra Kyogre | Es un counter de tipo legítimo. No compensarlo con potencia; si se quiere suavizar, dar a Ho-Oh/Moltres una cobertura neutral que no sea Lucha/Tierra/Roca resistida por sus víctimas habituales. |
| Scyther contra Acero/Roca/Fantasma | 0 % contra Gengar, Lucario, Onix, Gyarados, Articuno, Zapdos, Moltres, Ho-Oh y Groudon | Su kit es Bicho/Volador/Normal; Acero y Roca lo resisten y Gengar bloquea lo Normal. Cambiar `Danza Espada` por una cobertura (p. ej. `Tajo Umbrío`, Siniestro) o aceptar que es un personaje de nicho. |

### P1 — Recortes (winrate ≥ 58 %)

Cambios pensados para una primera pasada; aplicar uno por especie y volver a
simular. Tyranitar (59 %) y Gyarados (58 %) quedan en el borde: no tocarlos
hasta ver el efecto de los cuatro primeros.

| Pokémon | Winrate | Cambio propuesto | Motivo |
| --- | ---: | --- | --- |
| Rayquaza | 72 % | `Furia Dragón` 85 → 78; `Ascenso Draco` 130 → 115 y enfriamiento 16 → 17 s | Dos golpes de área/beam de largo alcance y un dash de 5,5 u; es el mejor kit de iniciación y castigo. |
| Greninja | 65 % | `Shuriken de Agua` 42 → 38 (o enfriamiento 0,65 → 0,75 s); `Pulso Umbrío` 85 → 78 y 10 → 11 s | La mejor cadencia a distancia del roster; el dash de 4,8 u le permite elegir todos los intercambios. |
| Moltres | 64 % | `Tajo Aéreo` 65 → 58 y 3,5 → 4 s; `Ataque Celeste` 115 → 105 y 15 → 16 s | Proyectil de 8,5 u cada 3,5 s más un área de 115 con startup de 0,8 s. |
| Kyogre | 61 % | `Pulso Primigenio` 160 → 145 y 16 → 17 s; `Remolino Marino` 34 → 30 y 8 → 9 s | 175 PV, 160 de Def. Especial y un área de 160 en dos pulsos; el hurtbox de 0,64 no compensa tanto. |

### P2 — Buffs (winrate ≤ 35 %)

| Pokémon | Winrate | Cambio propuesto | Motivo |
| --- | ---: | --- | --- |
| Charmander | 11 % | Básica de Fuego (ver P0); `Lanzallamas` 100 → 110; `Anillo Ígneo` 14 → 12 s; velocidad 5,8 → 6,1 | Pierde al 13 % o menos contra 18 especies, hace 0 % contra 15 y no supera el 63 % contra nadie: muere antes de entrar en rango. |
| Squirtle | 19 % | Básica de Agua (ver P0); `Rayo Burbuja` 80 → 90; `Hidrobomba` 9 → 8,5 s; velocidad 5,2 → 5,5 | 119 PV y 85 de Def.; su dash (`Acua Jet`, 65) no compensa que el golpe grande tarde 9 s. |
| Voltorb | 23 % | `Explosión`: autodaño 0,35 → 0,25 y 18 → 16 s; `Chispa` 80 → 88 | Es el más rápido (8,2) pero vive al filo: 62 % de vida media en sus victorias y 57/184 duelos sin daño. |
| Bulbasaur | 26 % | Básica de Planta (ver P0); `Hoja Afilada` 100 → 108 y 5 → 4,5 s; `Lluevehojas` 160 → 168 | 0 % contra 14 especies; su daño es casi todo Planta y muchos kits lo resisten. |
| Celebi | 29 % | `Rayo Solar` 85 → 95; `Futuro Siniestro` 105 → 118 y 15 → 14 s; `Hoja Mágica` 45 → 50 | 175 PV y buen kit de control, pero `Deseo` es casi inútil en 1v1 y su daño sostenido es bajo. |
| Scyther | 32 % | `Golpe Furia` 45 → 52; `Tijera X` 130 → 140 y 14 → 13 s; `Danza Espada` startup 0,45 → 0,35 | Depende de una definitiva cuerpo a cuerpo de 2,7 u; sin cobertura, Acero/Roca lo anulan. |
| Mewtwo | 33 % | Cobertura P0; además `Psíquico` 80 → 92 y 7 → 6,5 s; `Psicoataque` 100 → 112 y 15 → 14 s; `Telequinesis` 45 → 50 | Con 181 PV y 174 de SpA debería ser un duelista medio-alto; hoy pierde contra 10 especies al 13 % o menos. |
| Pikachu | 34 % | Básica Eléctrica (ver P0); `Impactrueno` 70 → 80; `Rayo` 8 → 7,5 s | Su único daño fiable es `Rayo`; la básica Normal es 0 contra Fantasma y no tiene STAB. |
| Lugia | 35 % | `Marea` 30 → 38 y 9 → 8 s; `Ciclón` 45 → 55; `Aerochorro` 16 → 15 s | Sus cuatro slots pegan poco salvo `Aerochorro` (50/8, 30/9, 45/4 y 120/16); su daño sostenido está por debajo de la mayoría de legendarios. |
| Onix | 38 % | `Atadura` 65 → 72; `Lanzarrocas` 85 → 92 y 4,5 → 4,2 s; `Excavar` startup 2,0 → 1,7 s | 110 PV y un startup de 2 s en su área; el tanque de Def. no compensa la vida tan baja. |
| Groudon | 40 % | `Cuchillada` 45 → 52 y 0,6 → 0,55 s; `Filo del Abismo` 100 → 112 y 15 → 14 s; `Terremoto` 18 → 22 | Su kit de Tierra se anula contra Voladores y su daño sostenido depende de `Avalancha`; el 40 % no corresponde a sus stats. |

> **No tocar todavía**: Articuno (51 %), Zapdos (51 %), Ho-Oh (42 %) y
> Suicune (53 %) están cerca de la banda. Ho-Oh y Lugia son tanques de control
> cuyo valor real se mide en equipo, no en 1v1; el informe de duelos los
> infravalora.

### P3 — Decisiones de sistema

1. **Inmunidades en PvP.** Bajar el 0× a 0,25× reduciría el daño nulo de 114
   celdas y daría salida a Mewtwo/Mew contra Siniestro, pero también borraría
   la identidad de los counters (Normal contra Fantasma, Tierra contra
   Eléctrico) y no garantiza que esas especies pasen a ganar. Es una decisión
   de diseño, no un ajuste numérico. Si se toma, hay que rehacer §4 y volver a
   simular.
2. **Básica elemental de los starters.** Es el cambio más rentable del informe:
   arregla el STAB, el 0 % contra Fantasma de las básicas Normales y la
   sensación de que los starters pegan con un ataque de relleno. Requiere crear
   cuatro `AbilityDef` nuevas (o variantes por especie), no retocar `placaje`
   globalmente, porque lo comparten tres Pokémon, ni `arañazo`, que define a
   Charmander.
3. **Daño global.** El TTK de 15,4 s (con acercamiento) no justifica un
   multiplicador de 0,85-0,90 todavía. Si tras P1/P2 el TTK baja de 10 s, sería
   el momento de aplicarlo.
4. **Sustain.** `Recuperación`, `Aguas Curativas`, `Deseo` y Regeneración
   pesan mucho en un duelo a primer KO. Antes de nerfearlas, repetir con
   `pnpm balance --common regeneracion` y comparar; el 1v1 no es el formato
   donde más se lucen.

### Criterios para validar la siguiente tanda

1. Aplicar un grupo (P0, P1 o P2) y ejecutar
   `pnpm balance --seeds 6 --common proteccion --seconds 40`.
2. Objetivos razonables:
   - todas las especies entre **35 % y 65 %** de winrate;
   - diferencia máxima entre la mejor y la peor **≤ 30 puntos**;
   - **≤ 8 %** de celdas en 0 % exacto y **≤ 8 %** en 100 %;
   - TTK medio entre **12 y 18 s**;
   - los empates no suben de forma sostenida.
3. Repetir con `--common regeneracion` y `--common impulso` para comprobar que
   la mejora no depende de un solo instinto.
4. Regenerar también `docs/combat-balance.md` (§4) y
   `node scripts/generate-damage-matrix.mjs`; las tres fotos deben contar la
   misma historia.

> Recordatorio metodológico: cada celda de la matriz son 8 duelos (4 semillas ×
> 2 orientaciones). Un 88 % es 7/8 y un 13 % es 1/8; no sobreajustar una sola
> celda. Los bots no juegan como humanos y el arnés no simula árboles/rocas ni
> objetos.

