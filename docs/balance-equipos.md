# Balance 4v4 simulado

> Generado el 2026-11-19 a partir de `9d26666`. Se regenera con `pnpm balance:teams`. Motor real de `scripts/sim-headless.ts`, sin PlayCanvas, GPU ni audio.

## Metodología

- **4v4 real**: 8 bots, mismos spawns, colisiones, cooldowns, respawn, curación, control y límite de tiempo que `Game`.
- Partidas completas de hasta **300 s** en modo **tdm** con 15 KOs por equipo.
- **Muestreo aleatorio**: cada emparejamiento sortea 4 especies distintas por equipo, así cada especie aparece con compañeros variados y se puede aislar su aporte.
- Cada emparejamiento se juega en las **dos orientaciones de spawn** y con **2 semillas** reproducibles.
- Bots **expert** e instinto común **proteccion** para todos. El instinto es un eje aparte: repetir con `--common impulso` y `--common regeneracion`.
- **Rating**: regresión logística con efecto de lado. θ es la contribución marginal de la especie en log-odds; el rating la escala a Elo (1500 + θ · 173.7). 100 puntos ≈ 64 % en un intercambio equilibrado.
- Limitaciones: los bots no juegan como humanos; el arnés no genera los colliders de árboles/rocas ni simula objetos recogibles, así que el valor de áreas, escondites y pociones está subestimado. Las partidas acaban por límite de tiempo o por 15 KOs, no por una partida de lobby completa.

Partidas jugadas: **320** (320 decididas, 0 empates) · Duración media: **117.9 s** · KOs por partida: **25.6** · Marcador medio por equipo: **12.8** · Tiempo de pared: **1521.7 s**.

Finalizadas por KO: **320** · por tiempo: **0**. Si la mayoría acaba por tiempo, el resultado depende del límite elegido y conviene repetir la tanda con 180/300/480 s.

Sesgo de lado: el primer equipo del mapa (`red`) gana **53%** de 320 partidas (171 victorias). Al jugar las dos orientaciones, el sesgo se cancela en las comparaciones, pero una desviación grande avisa de un problema de mapa o de spawns.

## Contribución por especie en 4v4

Ordenado por rating. `±95%` es el margen del intervalo del 95 % del rating (1,96 × error estándar), no del winrate. `Winrate` es el resultado bruto del equipo cuando la especie está presente; está confundido por los compañeros, así que la columna que decide es `Rating`. `% daño` es la cuota media del daño total de su equipo. `Sin daño` cuenta partidas en las que no hizo ningún daño.

| # | Pokémon | Tipos | PV | Vel | Rating | ±95% | Winrate (IC95) | Partidas | Gana | Pierde | Empata | KOs | Muertes | K/D | Daño/partida | % daño | Curación/partida | Sin daño |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Gyarados | Water / Flying | 165 | 6.0 | 1653 | ±82 | 64% ±8 | 124 | 79 | 45 | 0 | 530 | 361 | 1.47 | 750 | 31% | 0 | 0 |
| 2 | Greninja | Water / Dark | 153 | 7.4 | 1638 | ±102 | 65% ±10 | 84 | 55 | 29 | 0 | 404 | 232 | 1.74 | 842 | 35% | 0 | 0 |
| 3 | Ho-Oh | Fire / Flying | 169 | 6.7 | 1614 | ±86 | 63% ±9 | 112 | 71 | 41 | 0 | 326 | 337 | 0.97 | 569 | 23% | 451 | 0 |
| 4 | Rayquaza | Dragon / Flying | 173 | 7.3 | 1609 | ±94 | 54% ±10 | 84 | 45 | 39 | 0 | 333 | 256 | 1.30 | 741 | 31% | 0 | 0 |
| 5 | Lugia | Psychic / Flying | 181 | 7.5 | 1600 | ±77 | 68% ±8 | 136 | 93 | 43 | 0 | 426 | 323 | 1.32 | 522 | 22% | 0 | 0 |
| 6 | Articuno | Ice / Flying | 165 | 6.8 | 1577 | ±98 | 65% ±10 | 88 | 57 | 31 | 0 | 269 | 223 | 1.21 | 569 | 24% | 0 | 0 |
| 7 | Gengar | Ghost / Poison | 131 | 7.4 | 1576 | ±85 | 48% ±10 | 92 | 44 | 48 | 0 | 328 | 319 | 1.03 | 638 | 28% | 47 | 0 |
| 8 | Kyogre | Water | 147 | 5.5 | 1526 | ±86 | 58% ±9 | 108 | 63 | 45 | 0 | 320 | 384 | 0.83 | 533 | 23% | 236 | 0 |
| 9 | Moltres | Fire / Flying | 165 | 6.9 | 1521 | ±74 | 53% ±8 | 140 | 74 | 66 | 0 | 423 | 428 | 0.99 | 591 | 25% | 0 | 0 |
| 10 | Mewtwo | Psychic | 181 | 7.8 | 1511 | ±85 | 47% ±9 | 116 | 55 | 61 | 0 | 485 | 388 | 1.25 | 655 | 30% | 0 | 0 |
| 11 | Groudon | Ground | 175 | 5.6 | 1503 | ±83 | 55% ±9 | 104 | 57 | 47 | 0 | 349 | 277 | 1.26 | 635 | 26% | 0 | 0 |
| 12 | Onix | Rock / Ground | 135 | 5.6 | 1489 | ±82 | 48% ±9 | 120 | 58 | 62 | 0 | 329 | 471 | 0.70 | 533 | 23% | 0 | 0 |
| 13 | Suicune | Water | 157 | 6.6 | 1478 | ±99 | 59% ±11 | 76 | 45 | 31 | 0 | 327 | 211 | 1.55 | 728 | 30% | 0 | 0 |
| 14 | Tyranitar | Rock / Dark | 175 | 4.5 | 1475 | ±84 | 43% ±9 | 120 | 52 | 68 | 0 | 366 | 335 | 1.09 | 637 | 28% | 0 | 0 |
| 15 | Zapdos | Electric / Flying | 165 | 7.6 | 1461 | ±81 | 51% ±10 | 96 | 49 | 47 | 0 | 240 | 267 | 0.90 | 512 | 22% | 0 | 0 |
| 16 | Scyther | Bug / Flying | 145 | 7.2 | 1459 | ±99 | 44% ±10 | 88 | 39 | 49 | 0 | 247 | 324 | 0.76 | 487 | 21% | 0 | 0 |
| 17 | Mew | Psychic | 169 | 6.9 | 1454 | ±88 | 41% ±9 | 108 | 44 | 64 | 0 | 262 | 350 | 0.75 | 400 | 18% | 407 | 0 |
| 18 | Lucario | Fighting / Steel | 152 | 6.8 | 1447 | ±83 | 46% ±9 | 112 | 52 | 60 | 0 | 402 | 362 | 1.11 | 606 | 26% | 0 | 0 |
| 19 | Charmander | Fire | 121 | 6.2 | 1442 | ±76 | 43% ±9 | 120 | 51 | 69 | 0 | 348 | 482 | 0.72 | 559 | 25% | 0 | 0 |
| 20 | Celebi | Psychic / Grass | 191 | 7.4 | 1434 | ±78 | 44% ±8 | 132 | 58 | 74 | 0 | 426 | 352 | 1.21 | 558 | 24% | 0 | 0 |
| 21 | Pikachu | Electric | 125 | 7.2 | 1429 | ±92 | 41% ±10 | 92 | 38 | 54 | 0 | 295 | 333 | 0.89 | 515 | 24% | 0 | 0 |
| 22 | Squirtle | Water | 126 | 5.6 | 1390 | ±87 | 40% ±9 | 120 | 48 | 72 | 0 | 337 | 466 | 0.72 | 491 | 23% | 0 | 0 |
| 23 | Voltorb | Electric | 137 | 8.2 | 1368 | ±96 | 32% ±10 | 84 | 27 | 57 | 0 | 167 | 279 | 0.60 | 401 | 19% | 0 | 0 |
| 24 | Bulbasaur | Grass / Poison | 133 | 5.3 | 1346 | ±90 | 25% ±8 | 104 | 26 | 78 | 0 | 240 | 419 | 0.57 | 444 | 21% | 0 | 0 |

### Lectura rápida

- Mejor contribución: **Gyarados** (1653). Peor: **Bulbasaur** (1346).
- Cobertura: cada especie apareció entre **76** y **140** partidas. Por debajo de ~50 apariciones el rating es provisional; sube `--pairs` o `--seeds` antes de nerfear o buffar.
- **Por encima de la media con significación**: Gyarados, Greninja, Ho-Oh, Rayquaza, Lugia.
- **Por debajo de la media con significación**: Squirtle, Voltorb, Bulbasaur.
- **Daño sin impacto**: Suicune (30% del daño, 1478 rating). Revisar si su daño es disperso, tarde o no convierte en KOs.
- **Soporte**: Ho-Oh (451 PV/partida, 1614 rating), Mew (407 PV/partida, 1454 rating), Kyogre (236 PV/partida, 1526 rating), Gengar (47 PV/partida, 1576 rating).
- **Más muertes por partida**: Bulbasaur (4.0), Charmander (4.0), Onix (3.9), Squirtle (3.9), Scyther (3.7).

## Sinergias por pareja

Parejas que aparecieron al menos **8** veces. `Lift` es la diferencia entre el winrate de la pareja y la media de los winrates brutos de sus dos miembros; positivo sugiere sinergia, negativo solapamiento o anti-sinergia. Es una señal exploratoria, no una prueba causal.

| Pareja | Winrate | Partidas | Lift |
| --- | ---: | ---: | ---: |
| Kyogre + Articuno | 94% | 16 | +32 pts |
| Gyarados + Kyogre | 92% | 12 | +31 pts |
| Gyarados + Greninja | 92% | 12 | +27 pts |
| Ho-Oh + Articuno | 90% | 20 | +26 pts |
| Greninja + Celebi | 88% | 8 | +33 pts |
| Suicune + Groudon | 88% | 8 | +30 pts |
| Scyther + Lugia | 83% | 12 | +27 pts |
| Lugia + Gyarados | 83% | 24 | +17 pts |
| Ho-Oh + Onix | 83% | 24 | +27 pts |
| Tyranitar + Greninja | 81% | 16 | +27 pts |
| Tyranitar + Scyther | 0% | 12 | -44 pts |
| Scyther + Celebi | 0% | 8 | -44 pts |
| Celebi + Pikachu | 6% | 16 | -36 pts |
| Pikachu + Charmander | 8% | 12 | -34 pts |
| Tyranitar + Pikachu | 8% | 12 | -34 pts |
| Squirtle + Mewtwo | 8% | 12 | -35 pts |
| Voltorb + Mew | 8% | 12 | -28 pts |
| Bulbasaur + Charmander | 10% | 20 | -24 pts |
| Zapdos + Gengar | 13% | 8 | -37 pts |
| Bulbasaur + Voltorb | 13% | 8 | -16 pts |

## Cómo tomar decisiones con esto

1. **Nerf/buff de especie**: ordena por rating y mira el ±95 %. Si el intervalo no cruza 1500, la señal es consistente; si lo cruza, sube `--pairs`/`--seeds` antes de tocar números.
2. **Composición**: en `--design robin` compara las composiciones con más partidas. En `--design random` usa las parejas con lift positivo como hipótesis para una segunda tanda cerrada.
3. **Rol**: `% daño` alto con rating bajo sugiere daño disperso o tardío; curación alta con rating alto confirma soporte; muertes altas apuntan a problemas de supervivencia o de posicionamiento del bot.
4. **Validación**: cualquier cambio de números debe repetir la misma semilla y comparar ratings, no solo winrates. El `pnpm balance` 1v1 sigue siendo útil para medir fuerza de duelo; esta prueba mide el valor en el modo principal.

## Cómo regenerar

```bash
pnpm balance:teams
pnpm balance:teams --pairs 250 --seeds 3 --seconds 300
pnpm balance:teams --pairs 20 --seeds 1 --seconds 120
pnpm balance:teams --design robin --teams "0025,0094,0658,0007;0130,0245,0382,0384"
```

Datos crudos en `.cache/balance-teams.json` (partidas, agregados, ratings y configuración).
