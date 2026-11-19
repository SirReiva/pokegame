# Balance 4v4 — paquete v7

> Aplicado el 2026-11-19 sobre `master`. Medición con `scripts/balance-teams.ts`
> y el runner paralelo de Piscina (`scripts/balance-teams-parallel.ts`).
> 320 partidas por tanda: 80 emparejamientos × 2 orientaciones × 2 semillas,
> bots `expert`, mapa `arena`, instinto `proteccion`.

## Resultado

> Datos canónicos de `docs/balance-equipos.md` (320 partidas, `pnpm balance:teams`).
> La primera vista previa con el parche en runtime daba números más optimistas
> (sd 100); no era equivalente a tener los valores en el código. Los de abajo
> son los que cuenta el motor con la v7 aplicada en `src`.

| Métrica | Base 320 | v7 320 |
| --- | ---: | ---: |
| Spread del rating | 711 | **556** |
| sd del rating | 191 | **139** |
| En 1450-1550 | 3/24 | **9/24** |
| En 1450-1575 | — | **10/24** |
| En 1400-1600 | 6/24 | **11/24** |
| Duración media | 109,7 s | 109,8 s |
| KOs por partida | 23,9 | 24,8 |

| Grupo | Pokémon |
| --- | --- |
| Arriba (>1550) | Rayquaza 1723, Suicune 1680, Gyarados 1663, Tyranitar 1652, Kyogre 1651, Ho-Oh 1622, Mew 1619, Articuno 1562 |
| En banda (1450-1550) | Lugia 1534, Pikachu 1524, Scyther 1523, Groudon 1515, Moltres 1510, Lucario 1504, Mewtwo 1496, Gengar 1484, Zapdos 1466 |
| Abajo (<1450) | Greninja 1422, Celebi 1395, Squirtle 1386, Charmander 1370, Onix 1310, Bulbasaur 1222, Voltorb 1167 |

## Cambios aplicados

### Stats base (`src/game/core/pokedex.ts`)

| Pokémon | PV | Atk | Def | SpA | SpD |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bulbasaur | 52 | 53 | 55 | 75 | 65 |
| Charmander | 46 | 56 | 48 | 67 | 54 |
| Squirtle | 51 | 52 | 72 | 56 | 64 |
| Pikachu | 41 | 61 | 46 | 58 | 50 |
| Voltorb | 47 | 34 | 56 | 63 | 55 |
| Onix | 44 | 50 | 168 | 34 | 45 |
| Suicune | 92 | 75 | 115 | 90 | 105 |
| Ho-Oh | 94 | 130 | 85 | 110 | 145 |
| Celebi | 106 | 108 | 106 | 115 | 108 |
| Kyogre | 78 | 98 | 81 | 147 | 106 |
| Lucario | 77 | 121 | 76 | 127 | 70 |

### Velocidad y hurtbox (`src/game/roster.ts`)

| Pokémon | Velocidad | Hurtbox |
| --- | ---: | ---: |
| Bulbasaur | 5,1 | 0,37 |
| Charmander | 6,2 | 0,35 |
| Squirtle | 5,6 | 0,36 |
| Pikachu | 7,2 | 0,36 |
| Lucario | 6,8 | 0,38 |
| Onix | 5,1 | 0,55 |
| Celebi | 7,3 | 0,34 |
| Ho-Oh | 6,7 | 0,64 |
| Kyogre | 5,7 | 0,66 |

### Habilidades (`src/game/abilities.ts`)

Ningún cooldown sube. Los nerfs de Kyogre y Ho-Oh van por vida/defensas y
potencia.

| Habilidad | Cambio |
| --- | --- |
| `latigoCepa` (nueva) | Grass, 55 / 0,25 s, melee 2,0 u |
| `ascuas` (nueva) | Fire, 65 / 0,25 s, melee 1,9 u |
| `pistolaAgua` (nueva) | Water, 65 / 0,25 s, melee 1,9 u |
| `chispazo` (nueva) | Electric, 55 / 0,25 s, melee 1,9 u |
| `aguasCurativas` | `healSelf` 0,25 → 0,10 |
| `rafagaMarina` | 46 → 38 |
| `pulsoPrimigenio` | 160 → 120 |
| `frioPolar` | 140 → 125 |
| `rayoHielo` | 90 → 82 |
| `hojaAfilada` | 100 → 115; 5 → 4 s |
| `llueveHojas` | 160 → 180; 14 → 12 s |
| `paralizador` | 7 → 6 s |
| `rayoSolar` | 85 → 100; 8 → 7 s |
| `futuroSiniestro` | 105 → 120; 15 → 13 s |
| `hojaMagica` | 45 → 52; 0,8 → 0,7 s |
| `deseo` | 13 → 11 s |
| `lanzarrocas` | 85 → 95; 4,5 → 3,8 s |
| `fisura` | 155 → 170; 14 → 12 s |
| `atadura` | 65 → 72 |
| `lanzallamas` | 100 → 112; 6,5 → 5,8 s |
| `anilloIgneo` | 130 → 145; 14 → 12 s |
| `hidrobomba` | 140 → 150; 9 → 8 s |
| `rayoBurbuja` | 80 → 88; 3 → 2,7 s |
| `chispa` | 80 → 90; 0,6 → 0,52 s |
| `rollout` | 100 → 108; 6 → 5 s |
| `explosion` | 200 → 220; 18 → 15 s |
| `rayo` | 130 → 140; 8 → 7 s |
| `impactrueno` | 70 → 78; 0,9 → 0,82 s |
| `combateCercano` | 125 → 138; 13 → 11,5 s |
| `esferaAura` | 60 → 68; 5 → 4,3 s |
| `garraMetal` | 45 → 52 |

### Movesets

| Pokémon | Básica nueva |
| --- | --- |
| Bulbasaur | `latigoCepa` (antes `placaje`) |
| Charmander | `ascuas` (antes `aranazo`) |
| Squirtle | `pistolaAgua` (antes `placaje`) |
| Pikachu | `chispazo` (antes `placaje`) |

`placaje` y `aranazo` siguen existiendo; no se mutó su tipo.

## Post-v7: prueba v8 (no aplicada)

Se probó una v8 con cambios pequeños (Lugia -4 % PV/SpD, Gyarados -3 % PV,
Voltorb +8 % PV/Def, Onix/Bulbasaur +vida, Charmander/Squirtle +2 % daño) con
el runner paralelo y el parche en runtime. La comparación interna daba v8 peor
(sd 115 / spread 429 frente a 100 / 379 del mismo método), así que **no se
aplicó**. Esa comparación no es canónica: con los valores en `src` y el script
oficial, la v7 da sd 139 / spread 556. Si se retoma la v8, hay que aplicarla a
`src` y repetir `pnpm balance:teams` para comparar contra la foto canónica.

## Pendiente

- Arriba: Rayquaza 1723, Suicune 1680, Gyarados 1663, Tyranitar 1652, Kyogre
  1651, Ho-Oh 1622, Mew 1619, Articuno 1562.
- Abajo: Voltorb 1167, Bulbasaur 1222, Onix 1310, Charmander 1370, Squirtle
  1386, Celebi 1395, Greninja 1422.
- Greninja bajó a 1422 en 4v4 con la v7; conviene revisar su rol/kit antes de
  tocarlo con stats.

## Cómo repetir

```bash
pnpm balance:teams:parallel --pairs 80 --seeds 2 --workers 4 \
  --out .cache/teams-v7-320.md --json .cache/teams-v7-320.json
```
