# Balance 4v4 — paquete v10

> Aplicado el 2026-11-19 sobre la v9 (`9d26666`). Medición canónica con
> `pnpm balance:teams --pairs 80 --seeds 2` (320 partidas), bots `expert`,
> mapa `arena`, modo `tdm`, instinto `proteccion`. Informe generado en
> [`balance-equipos.md`](balance-equipos.md).

## Resultado

| Métrica | v9 320 | v10 320 |
| --- | ---: | ---: |
| Spread del rating | 369 | **308** |
| sd del rating | 97 | **83** |
| En 1450-1550 | 11/24 | 10/24 |
| En 1450-1575 | 12/24 | 10/24 |
| En 1400-1600 | 15/24 | **16/24** |
| Duración media | 113,9 s | 117,9 s |
| KOs por partida | 25,1 | 25,6 |

La banda estricta baja de 11 a 10 por una especie, pero la distribución es
claramente más compacta: sd −14 y spread −61. Esa es la señal que importa;
el conteo por bandas es discreto y se mueve con el ruido.

La pasada paralela de 320 partidas dio exactamente los mismos ratings que la
secuencial oficial (Δ 0 en las 24 especies), así que el runner con Piscina
sigue siendo equivalente para iterar.

| Grupo | Pokémon |
| --- | --- |
| Arriba (>1550) | Gyarados 1653, Greninja 1638, Ho-Oh 1614, Rayquaza 1609, Lugia 1600, Articuno 1577, Gengar 1576 |
| En banda (1450-1550) | Kyogre 1526, Moltres 1521, Mewtwo 1511, Groudon 1503, Onix 1489, Suicune 1478, Tyranitar 1475, Zapdos 1461, Scyther 1459, Mew 1454 |
| Abajo (<1450) | Lucario 1447, Charmander 1442, Celebi 1434, Pikachu 1429, Squirtle 1390, Voltorb 1368, Bulbasaur 1346 |

## Cambios de la v10

Sin subir cooldowns. Se aplicaron sobre la v9:

### Kyogre (1684 → 1526)

- PV 78 → 72, Def 81 → 76, SpA 147 → 136, SpD 106 → 101.
- Velocidad 5,7 → 5,5; hurtbox 0,66 → 0,62.
- `Remolino Marino` 34 → 27; `Pulso Primigenio` 120 → 106.

### Suicune (1641 → 1478)

- PV 86 → 82, Def 112 → 107, SpD 100 → 95.
- Velocidad 6,8 → 6,6; hurtbox 0,56 → 0,58.
- `Chorro de Agua` 68 → 63; `Frío Polar` 115 → 108.

### Mew (1614 → 1454)

- PV 100 → 94, Def 100 → 95, SpD 100 → 95, Velocidad 7,0 → 6,9.
- `Premonición` 85 → 80.
- `Recuperación`: autocuración 35 % → 27 %, aliados 25 % → 20 % y radio
  3,5 → 3,2.

### Moltres (1609 → 1521)

- Def 90 → 86, SpA 125 → 117, Velocidad 7,0 → 6,9.
- `Onda Ígnea` 60 → 55; `Ataque Celeste` 115 → 105.

### Gengar (1605 → 1576)

- PV 60 → 56, SpA 130 → 122, Velocidad 7,6 → 7,4.
- `Bola Sombra` 62 → 56; `Come Sueños` 80 → 74.

### Celebi (1315 → 1434)

- PV 106 → 116, Def 106 → 110, SpD 108 → 112, Velocidad 7,3 → 7,4.
- `Rayo Solar` 100 → 105 y carga 0,65 → 0,55 s.
- `Futuro Siniestro` 120 → 125 y carga 1,0 → 0,85 s.
- `Deseo`: carga 1,2 → 1,05 s y radio 3,2 → 3,6.

### Onix (1361 → 1489)

- PV 52 → 60, SpD 50 → 60, Velocidad 5,4 → 5,6.
- `Atadura` 78 → 84; `Lanzarrocas` 105 → 112.

### Voltorb (1357 → 1368)

- PV 54 → 62, SpD 60 → 68.
- `Chispa` 96 → 102; `Explosión` autodaño 35 % → 27 %.

### Pikachu (1361 → 1429)

- PV 41 → 50, Def 46 → 52, SpD 50 → 56.
- `Rayo` 140 → 150.

## Intento v11 (rechazado)

Se probó una segunda pasada sobre los nuevos extremos (Gyarados, Greninja,
Ho-Oh, Rayquaza, Lugia, Articuno, Gengar, Bulbasaur, Voltorb, Squirtle).
Resultado: sd 88, spread 290, 8/24 en banda y 15/24 en 1400-1600. Empeoró
frente a la v10 en las tres métricas principales, así que se revirtió. La
lección: con 320 partidas, los cambios individuales ya están dominados por
efectos de matchup y ruido; seguir persiguiendo el ranking mueve el problema
de sitio en vez de comprimirlo.

## Pendiente

- **Gyarados 1653** es el único outlier claramente por encima (±82).
- **Bulbasaur 1346** es el único claramente por debajo (±90).
- El resto (Greninja, Ho-Oh, Rayquaza, Lugia, Articuno, Gengar arriba;
  Squirtle, Voltorb, Pikachu, Celebi, Charmander, Lucario abajo) está a menos
  de dos errores estándar de la banda.
- Para verificar una banda de ±50 hacen falta ~1.280 partidas; con 320 el
  error es ±75-105 y un roster perfectamente equilibrado ya dejaría ~7/24
  fuera de 1450-1550 solo por ruido.
- Ejes sin medir: instintos `impulso` y `regeneracion`, modo KOTH, otros mapas
  y recogibles/colliders de vegetación en el arnés.
