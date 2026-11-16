# Balance 4v4 simulado

> Generado el 2026-11-16 a partir de `80384e1`. Se regenera con `pnpm balance:teams`. Motor real de `scripts/sim-headless.ts`, sin PlayCanvas, GPU ni audio.

## Metodología

- **4v4 real**: 8 bots, mismos spawns, colisiones, cooldowns, respawn, curación, control y límite de tiempo que `Game`.
- Partidas completas de hasta **300 s** en modo **tdm** con 15 KOs por equipo.
- **Muestreo aleatorio**: cada emparejamiento sortea 4 especies distintas por equipo, así cada especie aparece con compañeros variados y se puede aislar su aporte.
- Cada emparejamiento se juega en las **dos orientaciones de spawn** y con **1 semilla** reproducibles.
- Bots **expert** e instinto común **proteccion** para todos. El instinto es un eje aparte: repetir con `--common impulso` y `--common regeneracion`.
- **Rating**: regresión logística con efecto de lado. θ es la contribución marginal de la especie en log-odds; el rating la escala a Elo (1500 + θ · 173.7). 100 puntos ≈ 64 % en un intercambio equilibrado.
- Limitaciones: los bots no juegan como humanos; el arnés no genera los colliders de árboles/rocas ni simula objetos recogibles, así que el valor de áreas, escondites y pociones está subestimado. Las partidas acaban por límite de tiempo o por 15 KOs, no por una partida de lobby completa.

Partidas jugadas: **2000** (2000 decididas, 0 empates) · Duración media: **80.6 s** · KOs por partida: **23.8** · Marcador medio por equipo: **11.9** · Tiempo de pared: **4610.8 s**.

Finalizadas por KO: **2000** · por tiempo: **0**. Si la mayoría acaba por tiempo, el resultado depende del límite elegido y conviene repetir la tanda con 180/300/480 s.

Sesgo de lado: el primer equipo del mapa (`red`) gana **50%** de 2000 partidas (994 victorias). Al jugar las dos orientaciones, el sesgo se cancela en las comparaciones, pero una desviación grande avisa de un problema de mapa o de spawns.

## Contribución por especie en 4v4

Ordenado por rating. `±95%` es el margen del intervalo del 95 % del rating (1,96 × error estándar), no del winrate. `Winrate` es el resultado bruto del equipo cuando la especie está presente; está confundido por los compañeros, así que la columna que decide es `Rating`. `% daño` es la cuota media del daño total de su equipo. `Sin daño` cuenta partidas en las que no hizo ningún daño.

| # | Pokémon | Tipos | PV | Vel | Rating | ±95% | Winrate (IC95) | Partidas | Gana | Pierde | Empata | KOs | Muertes | K/D | Daño/partida | % daño | Curación/partida | Sin daño |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Greninja | Water / Dark | 147 | 7.4 | 1700 | ±36 | 71% ±4 | 626 | 446 | 180 | 0 | 3381 | 1567 | 2.16 | 933 | 41% | 0 | 0 |
| 2 | Suicune | Water | 175 | 7.0 | 1676 | ±35 | 68% ±4 | 656 | 445 | 211 | 0 | 2811 | 1319 | 2.13 | 715 | 32% | 0 | 0 |
| 3 | Kyogre | Water | 175 | 5.9 | 1674 | ±35 | 70% ±3 | 662 | 461 | 201 | 0 | 3036 | 1542 | 1.97 | 703 | 32% | 194 | 0 |
| 4 | Rayquaza | Dragon / Flying | 180 | 7.6 | 1626 | ±36 | 62% ±4 | 616 | 384 | 232 | 0 | 2564 | 1537 | 1.67 | 691 | 32% | 0 | 0 |
| 5 | Gyarados | Water / Flying | 170 | 6.2 | 1593 | ±34 | 56% ±4 | 652 | 367 | 285 | 0 | 2311 | 1732 | 1.33 | 639 | 30% | 0 | 2 |
| 6 | Articuno | Ice / Flying | 165 | 6.8 | 1585 | ±33 | 61% ±4 | 692 | 422 | 270 | 0 | 2426 | 1681 | 1.44 | 629 | 29% | 0 | 0 |
| 7 | Moltres | Fire / Flying | 165 | 7.0 | 1581 | ±33 | 58% ±4 | 692 | 399 | 293 | 0 | 2270 | 1941 | 1.17 | 605 | 29% | 0 | 0 |
| 8 | Zapdos | Electric / Flying | 165 | 7.6 | 1578 | ±33 | 58% ±4 | 678 | 390 | 288 | 0 | 2152 | 1589 | 1.35 | 572 | 27% | 0 | 1 |
| 9 | Tyranitar | Rock / Dark | 175 | 4.5 | 1573 | ±33 | 54% ±4 | 672 | 361 | 311 | 0 | 2642 | 1620 | 1.63 | 666 | 31% | 0 | 6 |
| 10 | Ho-Oh | Fire / Flying | 181 | 6.9 | 1548 | ±31 | 53% ±4 | 704 | 376 | 328 | 0 | 1948 | 2096 | 0.93 | 481 | 23% | 239 | 2 |
| 11 | Gengar | Ghost / Poison | 135 | 7.6 | 1543 | ±33 | 52% ±4 | 664 | 347 | 317 | 0 | 2205 | 1922 | 1.15 | 588 | 28% | 27 | 0 |
| 12 | Mewtwo | Psychic | 181 | 7.8 | 1537 | ±34 | 52% ±4 | 634 | 329 | 305 | 0 | 2153 | 1793 | 1.20 | 531 | 27% | 0 | 2 |
| 13 | Lugia | Psychic / Flying | 181 | 7.5 | 1526 | ±31 | 53% ±4 | 724 | 381 | 343 | 0 | 1682 | 1681 | 1.00 | 399 | 19% | 0 | 6 |
| 14 | Mew | Psychic | 175 | 7.0 | 1511 | ±33 | 53% ±4 | 650 | 344 | 306 | 0 | 1421 | 1787 | 0.80 | 361 | 18% | 292 | 2 |
| 15 | Groudon | Ground | 175 | 5.6 | 1448 | ±32 | 46% ±4 | 710 | 324 | 386 | 0 | 1657 | 1906 | 0.87 | 406 | 21% | 0 | 1 |
| 16 | Lucario | Fighting / Steel | 145 | 6.5 | 1419 | ±33 | 43% ±4 | 644 | 277 | 367 | 0 | 1504 | 1935 | 0.78 | 412 | 21% | 0 | 1 |
| 17 | Pikachu | Electric | 110 | 6.9 | 1419 | ±34 | 46% ±4 | 662 | 306 | 356 | 0 | 2078 | 2289 | 0.91 | 508 | 26% | 0 | 0 |
| 18 | Scyther | Bug / Flying | 145 | 7.2 | 1406 | ±33 | 38% ±4 | 686 | 264 | 422 | 0 | 1666 | 2549 | 0.65 | 394 | 21% | 0 | 12 |
| 19 | Celebi | Psychic / Grass | 175 | 7.1 | 1392 | ±33 | 40% ±4 | 672 | 268 | 404 | 0 | 1584 | 2076 | 0.76 | 363 | 19% | 0 | 10 |
| 20 | Voltorb | Electric | 115 | 8.2 | 1380 | ±35 | 34% ±4 | 630 | 214 | 416 | 0 | 1203 | 2212 | 0.54 | 354 | 20% | 0 | 11 |
| 21 | Squirtle | Water | 119 | 5.2 | 1354 | ±34 | 37% ±4 | 680 | 250 | 430 | 0 | 1331 | 2528 | 0.53 | 339 | 19% | 0 | 1 |
| 22 | Charmander | Fire | 114 | 5.8 | 1341 | ±35 | 36% ±4 | 670 | 242 | 428 | 0 | 1077 | 2667 | 0.40 | 311 | 17% | 0 | 8 |
| 23 | Onix | Rock / Ground | 110 | 4.6 | 1333 | ±34 | 33% ±4 | 668 | 222 | 446 | 0 | 1424 | 2973 | 0.48 | 421 | 22% | 0 | 5 |
| 24 | Bulbasaur | Grass / Poison | 120 | 4.6 | 1258 | ±38 | 28% ±3 | 656 | 181 | 475 | 0 | 1104 | 2688 | 0.41 | 277 | 16% | 0 | 11 |

### Lectura rápida

- Mejor contribución: **Greninja** (1700). Peor: **Bulbasaur** (1258).
- Cobertura: cada especie apareció entre **616** y **724** partidas. Por debajo de ~50 apariciones el rating es provisional; sube `--pairs` o `--seeds` antes de nerfear o buffar.
- **Por encima de la media con significación**: Greninja, Suicune, Kyogre, Rayquaza, Gyarados, Articuno, Moltres, Zapdos, Tyranitar, Ho-Oh, Gengar, Mewtwo.
- **Por debajo de la media con significación**: Groudon, Lucario, Pikachu, Scyther, Celebi, Voltorb, Squirtle, Charmander, Onix, Bulbasaur.
- **Soporte**: Mew (292 PV/partida, 1511 rating), Ho-Oh (239 PV/partida, 1548 rating), Kyogre (194 PV/partida, 1674 rating), Gengar (27 PV/partida, 1543 rating).
- **Más muertes por partida**: Onix (4.5), Bulbasaur (4.1), Charmander (4.0), Squirtle (3.7), Scyther (3.7).

## Sinergias por pareja

Parejas que aparecieron al menos **8** veces. `Lift` es la diferencia entre el winrate de la pareja y la media de los winrates brutos de sus dos miembros; positivo sugiere sinergia, negativo solapamiento o anti-sinergia. Es una señal exploratoria, no una prueba causal.

| Pareja | Winrate | Partidas | Lift |
| --- | ---: | ---: | ---: |
| Zapdos + Greninja | 89% | 76 | +25 pts |
| Kyogre + Articuno | 89% | 90 | +24 pts |
| Suicune + Kyogre | 89% | 98 | +20 pts |
| Greninja + Rayquaza | 88% | 76 | +21 pts |
| Lugia + Greninja | 84% | 94 | +22 pts |
| Kyogre + Rayquaza | 83% | 90 | +17 pts |
| Mew + Greninja | 83% | 94 | +21 pts |
| Gyarados + Suicune | 82% | 66 | +20 pts |
| Suicune + Greninja | 81% | 86 | +12 pts |
| Suicune + Articuno | 81% | 90 | +17 pts |
| Bulbasaur + Charmander | 11% | 66 | -21 pts |
| Onix + Bulbasaur | 11% | 84 | -20 pts |
| Voltorb + Charmander | 12% | 98 | -23 pts |
| Bulbasaur + Voltorb | 14% | 90 | -16 pts |
| Celebi + Bulbasaur | 15% | 74 | -19 pts |
| Bulbasaur + Groudon | 17% | 76 | -20 pts |
| Lucario + Bulbasaur | 18% | 80 | -18 pts |
| Voltorb + Onix | 18% | 76 | -15 pts |
| Onix + Scyther | 19% | 112 | -17 pts |
| Celebi + Onix | 19% | 74 | -18 pts |

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
