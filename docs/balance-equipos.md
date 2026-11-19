# Balance 4v4 simulado

> Generado el 2026-11-19 a partir de `18244f4`. Se regenera con `pnpm balance:teams`. Motor real de `scripts/sim-headless.ts`, sin PlayCanvas, GPU ni audio.

## Metodología

- **4v4 real**: 8 bots, mismos spawns, colisiones, cooldowns, respawn, curación, control y límite de tiempo que `Game`.
- Partidas completas de hasta **300 s** en modo **tdm** con 15 KOs por equipo.
- **Muestreo aleatorio**: cada emparejamiento sortea 4 especies distintas por equipo, así cada especie aparece con compañeros variados y se puede aislar su aporte.
- Cada emparejamiento se juega en las **dos orientaciones de spawn** y con **2 semillas** reproducibles.
- Bots **expert** e instinto común **proteccion** para todos. El instinto es un eje aparte: repetir con `--common impulso` y `--common regeneracion`.
- **Rating**: regresión logística con efecto de lado. θ es la contribución marginal de la especie en log-odds; el rating la escala a Elo (1500 + θ · 173.7). 100 puntos ≈ 64 % en un intercambio equilibrado.
- Limitaciones: los bots no juegan como humanos; el arnés no genera los colliders de árboles/rocas ni simula objetos recogibles, así que el valor de áreas, escondites y pociones está subestimado. Las partidas acaban por límite de tiempo o por 15 KOs, no por una partida de lobby completa.

Partidas jugadas: **320** (320 decididas, 0 empates) · Duración media: **113.9 s** · KOs por partida: **25.1** · Marcador medio por equipo: **12.6** · Tiempo de pared: **1108.5 s**.

Finalizadas por KO: **320** · por tiempo: **0**. Si la mayoría acaba por tiempo, el resultado depende del límite elegido y conviene repetir la tanda con 180/300/480 s.

Sesgo de lado: el primer equipo del mapa (`red`) gana **50%** de 320 partidas (161 victorias). Al jugar las dos orientaciones, el sesgo se cancela en las comparaciones, pero una desviación grande avisa de un problema de mapa o de spawns.

## Contribución por especie en 4v4

Ordenado por rating. `±95%` es el margen del intervalo del 95 % del rating (1,96 × error estándar), no del winrate. `Winrate` es el resultado bruto del equipo cuando la especie está presente; está confundido por los compañeros, así que la columna que decide es `Rating`. `% daño` es la cuota media del daño total de su equipo. `Sin daño` cuenta partidas en las que no hizo ningún daño.

| # | Pokémon | Tipos | PV | Vel | Rating | ±95% | Winrate (IC95) | Partidas | Gana | Pierde | Empata | KOs | Muertes | K/D | Daño/partida | % daño | Curación/partida | Sin daño |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Kyogre | Water | 153 | 5.7 | 1684 | ±92 | 72% ±8 | 108 | 78 | 30 | 0 | 437 | 344 | 1.27 | 644 | 27% | 226 | 0 |
| 2 | Suicune | Water | 161 | 6.8 | 1641 | ±110 | 72% ±10 | 76 | 55 | 21 | 0 | 363 | 180 | 2.02 | 782 | 32% | 0 | 0 |
| 3 | Mew | Psychic | 175 | 7.0 | 1614 | ±96 | 68% ±9 | 108 | 73 | 35 | 0 | 313 | 298 | 1.05 | 455 | 19% | 513 | 0 |
| 4 | Moltres | Fire / Flying | 165 | 7.0 | 1609 | ±80 | 51% ±8 | 140 | 72 | 68 | 0 | 469 | 426 | 1.10 | 651 | 29% | 0 | 0 |
| 5 | Gengar | Ghost / Poison | 135 | 7.6 | 1605 | ±87 | 52% ±10 | 92 | 48 | 44 | 0 | 382 | 337 | 1.13 | 706 | 31% | 49 | 0 |
| 6 | Greninja | Water / Dark | 153 | 7.4 | 1573 | ±106 | 58% ±10 | 84 | 49 | 35 | 0 | 360 | 241 | 1.49 | 802 | 35% | 0 | 0 |
| 7 | Tyranitar | Rock / Dark | 175 | 4.5 | 1548 | ±86 | 53% ±9 | 120 | 63 | 57 | 0 | 419 | 286 | 1.47 | 640 | 27% | 0 | 0 |
| 8 | Mewtwo | Psychic | 181 | 7.8 | 1547 | ±90 | 56% ±9 | 116 | 65 | 51 | 0 | 470 | 363 | 1.29 | 631 | 28% | 0 | 0 |
| 9 | Lugia | Psychic / Flying | 181 | 7.5 | 1541 | ±79 | 63% ±8 | 136 | 86 | 50 | 0 | 406 | 302 | 1.34 | 499 | 22% | 0 | 0 |
| 10 | Gyarados | Water / Flying | 165 | 6.0 | 1536 | ±81 | 53% ±9 | 124 | 66 | 58 | 0 | 437 | 341 | 1.28 | 693 | 29% | 0 | 0 |
| 11 | Ho-Oh | Fire / Flying | 169 | 6.7 | 1533 | ±86 | 53% ±9 | 112 | 59 | 53 | 0 | 307 | 344 | 0.89 | 573 | 24% | 429 | 0 |
| 12 | Rayquaza | Dragon / Flying | 173 | 7.3 | 1532 | ±95 | 46% ±10 | 84 | 39 | 45 | 0 | 294 | 238 | 1.24 | 691 | 30% | 0 | 0 |
| 13 | Groudon | Ground | 175 | 5.6 | 1505 | ±85 | 51% ±9 | 104 | 53 | 51 | 0 | 357 | 295 | 1.21 | 671 | 28% | 0 | 0 |
| 14 | Articuno | Ice / Flying | 165 | 6.8 | 1489 | ±100 | 64% ±10 | 88 | 56 | 32 | 0 | 261 | 239 | 1.09 | 553 | 24% | 0 | 0 |
| 15 | Charmander | Fire | 121 | 6.2 | 1489 | ±76 | 48% ±9 | 120 | 58 | 62 | 0 | 319 | 465 | 0.69 | 521 | 24% | 0 | 0 |
| 16 | Zapdos | Electric / Flying | 165 | 7.6 | 1465 | ±83 | 46% ±10 | 96 | 44 | 52 | 0 | 245 | 264 | 0.93 | 479 | 21% | 0 | 0 |
| 17 | Scyther | Bug / Flying | 145 | 7.2 | 1456 | ±101 | 38% ±10 | 88 | 33 | 55 | 0 | 244 | 319 | 0.76 | 457 | 21% | 0 | 0 |
| 18 | Lucario | Fighting / Steel | 152 | 6.8 | 1424 | ±89 | 34% ±9 | 112 | 38 | 74 | 0 | 316 | 372 | 0.85 | 526 | 24% | 0 | 0 |
| 19 | Squirtle | Water | 126 | 5.6 | 1410 | ±88 | 47% ±9 | 120 | 56 | 64 | 0 | 327 | 443 | 0.74 | 482 | 22% | 0 | 0 |
| 20 | Bulbasaur | Grass / Poison | 133 | 5.3 | 1403 | ±96 | 36% ±9 | 104 | 37 | 67 | 0 | 237 | 389 | 0.61 | 400 | 20% | 0 | 0 |
| 21 | Pikachu | Electric | 116 | 7.2 | 1361 | ±98 | 35% ±10 | 92 | 32 | 60 | 0 | 264 | 357 | 0.74 | 517 | 25% | 0 | 0 |
| 22 | Onix | Rock / Ground | 127 | 5.4 | 1361 | ±86 | 38% ±9 | 120 | 45 | 75 | 0 | 255 | 506 | 0.50 | 465 | 21% | 0 | 0 |
| 23 | Voltorb | Electric | 129 | 8.2 | 1357 | ±100 | 38% ±10 | 84 | 32 | 52 | 0 | 169 | 307 | 0.55 | 365 | 18% | 0 | 0 |
| 24 | Celebi | Psychic / Grass | 181 | 7.3 | 1315 | ±86 | 33% ±8 | 132 | 43 | 89 | 0 | 385 | 380 | 1.01 | 490 | 22% | 0 | 0 |

### Lectura rápida

- Mejor contribución: **Kyogre** (1684). Peor: **Celebi** (1315).
- Cobertura: cada especie apareció entre **76** y **140** partidas. Por debajo de ~50 apariciones el rating es provisional; sube `--pairs` o `--seeds` antes de nerfear o buffar.
- **Por encima de la media con significación**: Kyogre, Suicune, Mew, Moltres, Gengar.
- **Por debajo de la media con significación**: Squirtle, Bulbasaur, Pikachu, Onix, Voltorb, Celebi.
- **Soporte**: Mew (513 PV/partida, 1614 rating), Ho-Oh (429 PV/partida, 1533 rating), Kyogre (226 PV/partida, 1684 rating), Gengar (49 PV/partida, 1605 rating).
- **Más muertes por partida**: Onix (4.2), Pikachu (3.9), Charmander (3.9), Bulbasaur (3.7), Squirtle (3.7).

## Sinergias por pareja

Parejas que aparecieron al menos **8** veces. `Lift` es la diferencia entre el winrate de la pareja y la media de los winrates brutos de sus dos miembros; positivo sugiere sinergia, negativo solapamiento o anti-sinergia. Es una señal exploratoria, no una prueba causal.

| Pareja | Winrate | Partidas | Lift |
| --- | ---: | ---: | ---: |
| Tyranitar + Kyogre | 100% | 16 | +38 pts |
| Groudon + Greninja | 100% | 8 | +45 pts |
| Moltres + Kyogre | 100% | 8 | +38 pts |
| Moltres + Mewtwo | 100% | 8 | +46 pts |
| Mew + Suicune | 100% | 8 | +30 pts |
| Lugia + Suicune | 94% | 16 | +26 pts |
| Gyarados + Kyogre | 92% | 12 | +29 pts |
| Mew + Articuno | 90% | 20 | +24 pts |
| Mew + Ho-Oh | 88% | 8 | +27 pts |
| Greninja + Mewtwo | 88% | 8 | +30 pts |
| Lucario + Scyther | 0% | 8 | -36 pts |
| Onix + Bulbasaur | 6% | 16 | -30 pts |
| Lucario + Charmander | 8% | 12 | -33 pts |
| Celebi + Zapdos | 8% | 12 | -31 pts |
| Onix + Pikachu | 13% | 8 | -24 pts |
| Greninja + Voltorb | 13% | 16 | -36 pts |
| Bulbasaur + Voltorb | 13% | 8 | -24 pts |
| Lucario + Pikachu | 13% | 16 | -22 pts |
| Bulbasaur + Pikachu | 13% | 16 | -23 pts |
| Celebi + Pikachu | 13% | 16 | -21 pts |

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
