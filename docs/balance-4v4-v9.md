# Balance 4v4 — paquete v9

> Aplicado el 2026-11-19 sobre la v7. Medición canónica con
> `pnpm balance:teams --pairs 80 --seeds 2` (320 partidas), bots `expert`,
> mapa `arena`, instinto `proteccion`. Informe generado en
> [`balance-equipos.md`](balance-equipos.md).

## Resultado

| Métrica | v7 320 | v9 320 |
| --- | ---: | ---: |
| Spread del rating | 556 | **369** |
| sd del rating | 139 | **97** |
| En 1450-1550 | 9/24 | **11/24** |
| En 1450-1575 | 10/24 | **12/24** |
| En 1400-1600 | 11/24 | **15/24** |
| Duración media | 109,8 s | 113,9 s |
| KOs por partida | 24,8 | 25,1 |

| Grupo | Pokémon |
| --- | --- |
| Arriba (>1550) | Kyogre 1684, Suicune 1641, Mew 1614, Moltres 1609, Gengar 1605, Greninja 1573 |
| En banda (1450-1550) | Mewtwo 1547, Tyranitar 1548, Lugia 1541, Gyarados 1536, Ho-Oh 1533, Rayquaza 1532, Groudon 1505, Articuno 1489, Charmander 1489, Zapdos 1465, Scyther 1456 |
| Abajo (<1450) | Lucario 1424, Squirtle 1410, Bulbasaur 1403, Onix 1361, Pikachu 1361, Voltorb 1357, Celebi 1315 |

## Cambios de la v9

Sin subir cooldowns. Se aplicaron sobre la v7:

### Rayquaza (1723 → 1532)

- PV 105 → 98, Atk 150 → 145, Def 90 → 85, SpA 150 → 145, SpD 90 → 85.
- Velocidad 7,6 → 7,3; hurtbox 0,62 → 0,64.
- `Ascenso Draco` 130 → 120; `Furia Dragón` 85 → 80.

### Suicune (1680 → 1641)

- PV 92 → 86, Def 115 → 112, SpD 105 → 100.
- Velocidad 7,0 → 6,8; hurtbox 0,54 → 0,56.
- `Frío Polar` 125 → 115; `Golpe Cuerpo` 80 → 76.

### Gyarados (1663 → 1536)

- PV 95 → 90, Def 79 → 76.
- Velocidad 6,2 → 6,0; hurtbox 0,60 → 0,62.
- `Dragoaliento` 150 → 140.

### Voltorb (1167 → 1357)

- PV 47 → 54, Atk 34 → 36, Def 56 → 62, SpA 63 → 65, SpD 55 → 60.
- `Chispa` 90 → 96; `Rollout` 108 → 115 y 5 → 4,5 s; `Explosión` 220 → 230
  y 15 → 13 s; `Onda Trueno` 5 → 4 s.

### Bulbasaur (1222 → 1403)

- PV 52 → 58, Def 55 → 60, SpA 75 → 78, SpD 65 → 70.
- Velocidad 5,1 → 5,3.
- `Hoja Afilada` 115 → 125 y 4 → 3,8 s; `Lluevehojas` 180 → 190 y 12 → 11 s;
  `Paralizador` 6 → 5 s.

### Onix (1310 → 1361)

- PV 44 → 52, Atk 50 → 55, Def 168 → 175, SpD 45 → 50.
- Velocidad 5,1 → 5,4; hurtbox 0,55 → 0,52.
- `Lanzarrocas` 95 → 105 y 3,8 → 3,5 s; `Fisura` 170 → 180 y 12 → 11 s;
  `Atadura` 72 → 78; `Excavar` 85 → 95 y 6 → 5,5 s.

### Greninja (1422 → 1573)

- PV 72 → 78, Def 67 → 72, SpD 71 → 76.
- Hurtbox 0,42 → 0,40.
- Sin cambios de habilidades.

## Pendiente

- Arriba: **Kyogre 1684**, Suicune 1641, Mew 1614, Moltres 1609, Gengar 1605,
  Greninja 1573.
- Abajo: **Celebi 1315**, Voltorb 1357, Pikachu 1361, Onix 1361, Bulbasaur
  1403, Squirtle 1410, Lucario 1424.
- La v9 deja 15/24 en 1400-1600. El siguiente paso razonable es Kyogre/Moltres
  por arriba y Celebi/Pikachu por abajo, no tocar el resto.
