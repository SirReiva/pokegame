# Tabla de daño por Pokémon y ataque

> Generado automáticamente por `node scripts/generate-damage-matrix.mjs` a partir de `abilities.ts`, `pokedex.ts`, `combat.ts`, `typeChart.ts` y el manifiesto de sprites. No editar a mano.

## Cómo leer las tablas

- **Agrupación**: una sección por Pokémon atacante y una fila por rival. Cada columna es uno de sus cuatro ataques.
- **Celda**: daño esperado de un lanzamiento completo y, al lado, la efectividad de ese tipo contra el rival.
- **Daño esperado**: nivel 50, IV 31, EV 0, naturaleza neutra, sin buffs, random medio 0,925, crítico 1/24 (×1,05). STAB ×1,05 incluido.
- **Áreas**: se valoran con el rival en el centro (100 %). En el borde el daño radial baja hasta `radialMinDamage`.
- **Áreas `overTime`**: el total suma todos los ticks (`ceil(duración / intervalo)`) con potencia por tick = `power × intervalo`. El `+2` de la fórmula se cobra una sola vez por objetivo y lanzamiento.
- **Estado**: la habilidad no hace daño. `Estado (×0)` indica que el tipo es inmune y el estado tampoco se aplica.
- **—**: el rival es el propio atacante (no se calcula el mirror).
- **Mediana**: valor central del daño esperado contra los 24 rivales (con un número par, media de los dos centrales). La fila de efectividad mediana resume el matchup típico del ataque.
- Son una **cota superior**: suponen que la habilidad conecta y que el rival no esquiva ni sale del área.

**Efectividades**: ×0 inmune · ×¼ doble resistencia · ×½ resiste · ×1 neutro · ×2 débil · ×4 doble debilidad.

## Índice

- [Pikachu](#pikachu)
- [Voltorb](#voltorb)
- [Gengar](#gengar)
- [Bulbasaur](#bulbasaur)
- [Charmander](#charmander)
- [Squirtle](#squirtle)
- [Lucario](#lucario)
- [Greninja](#greninja)
- [Articuno](#articuno)
- [Zapdos](#zapdos)
- [Moltres](#moltres)
- [Mewtwo](#mewtwo)
- [Mew](#mew)
- [Scyther](#scyther)
- [Tyranitar](#tyranitar)
- [Onix](#onix)
- [Groudon](#groudon)
- [Celebi](#celebi)
- [Lugia](#lugia)
- [Ho-Oh](#ho-oh)
- [Gyarados](#gyarados)
- [Suicune](#suicune)
- [Kyogre](#kyogre)
- [Rayquaza](#rayquaza)

## Pikachu

Tipos: **Electric** · HP 110 · Atk 75 · Def 60 · SpA 70 · SpD 70 · Vel 110

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 | Habilidad 1: Ataque Rápido<br>Normal · Fís · Pot 60 | Habilidad 2: Impactrueno<br>Electric · Esp · Pot 70 | Definitiva: Rayo<br>Electric · Esp · Pot 130 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 25 ×1 | 27 ×1 | 12 ×½ | 23 ×½ |
| Charmander | 27 ×1 | 30 ×1 | 30 ×1 | 56 ×1 |
| Squirtle | 21 ×1 | 23 ×1 | 50 ×2 | 94 ×2 |
| Gengar | 0 ×0 | 0 ×0 | 23 ×1 | 42 ×1 |
| Voltorb | 24 ×1 | 27 ×1 | 14 ×½ | 26 ×½ |
| Eevee | 24 ×1 | 27 ×1 | 25 ×1 | 47 ×1 |
| Lucario | 10 ×½ | 11 ×½ | 24 ×1 | 44 ×1 |
| Greninja | 20 ×1 | 22 ×1 | 48 ×2 | 88 ×2 |
| Mewtwo | 16 ×1 | 18 ×1 | 19 ×1 | 36 ×1 |
| Mew | 15 ×1 | 16 ×1 | 17 ×1 | 33 ×1 |
| Onix | 5 ×½ | 6 ×½ | 0 ×0 | 0 ×0 |
| Scyther | 18 ×1 | 19 ×1 | 44 ×2 | 78 ×2 |
| Gyarados | 18 ×1 | 20 ×1 | 68 ×4 | 132 ×4 |
| Tyranitar | 6 ×½ | 7 ×½ | 17 ×1 | 33 ×1 |
| Articuno | 15 ×1 | 16 ×1 | 28 ×2 | 54 ×2 |
| Zapdos | 17 ×1 | 18 ×1 | 19 ×1 | 36 ×1 |
| Moltres | 16 ×1 | 18 ×1 | 42 ×2 | 76 ×2 |
| Raikou | 19 ×1 | 20 ×1 | 8 ×½ | 16 ×½ |
| Entei | 17 ×1 | 18 ×1 | 23 ×1 | 42 ×1 |
| Suicune | 13 ×1 | 14 ×1 | 30 ×2 | 58 ×2 |
| Lugia | 12 ×1 | 13 ×1 | 24 ×2 | 48 ×2 |
| Ho-Oh | 16 ×1 | 18 ×1 | 24 ×2 | 48 ×2 |
| Celebi | 15 ×1 | 16 ×1 | 8 ×½ | 16 ×½ |
| Kyogre | 16 ×1 | 18 ×1 | 26 ×2 | 50 ×2 |
| Groudon | 12 ×1 | 12 ×1 | 0 ×0 | 0 ×0 |
| Rayquaza | 16 ×1 | 18 ×1 | 19 ×1 | 36 ×1 |
| **Mediana de daño** | 16 | 18 | 24 | 43 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Voltorb

Tipos: **Electric** · HP 115 · Atk 50 · Def 70 · SpA 75 · SpD 75 · Vel 120

| Rival | Básica: Chispa<br>Electric · Fís · Pot 80 | Habilidad 1: Rollout<br>Normal · Fís · Pot 100 | Habilidad 2: Onda Trueno<br>Electric · Estado · Pot — | Definitiva: Explosión<br>Electric · Esp · Pot 200 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 12 ×½ | 30 ×1 | Estado | 38 ×½ |
| Charmander | 27 ×1 | 33 ×1 | Estado | 92 ×1 |
| Squirtle | 42 ×2 | 24 ×1 | Estado | 154 ×2 |
| Pikachu | 14 ×½ | 35 ×1 | Estado | 46 ×½ |
| Gengar | 23 ×1 | 0 ×0 | Estado | 68 ×1 |
| Eevee | 25 ×1 | 30 ×1 | Estado | 76 ×1 |
| Lucario | 19 ×1 | 12 ×½ | Estado | 72 ×1 |
| Greninja | 42 ×2 | 24 ×1 | Estado | 142 ×2 |
| Mewtwo | 16 ×1 | 20 ×1 | Estado | 59 ×1 |
| Mew | 14 ×1 | 18 ×1 | Estado | 54 ×1 |
| Onix | 0 ×0 | 6 ×½ | Estado (×0) | 0 ×0 |
| Scyther | 34 ×2 | 22 ×1 | Estado | 130 ×2 |
| Gyarados | 68 ×4 | 22 ×1 | Estado | 216 ×4 |
| Tyranitar | 13 ×1 | 8 ×½ | Estado | 54 ×1 |
| Articuno | 28 ×2 | 18 ×1 | Estado | 90 ×2 |
| Zapdos | 16 ×1 | 20 ×1 | Estado | 59 ×1 |
| Moltres | 32 ×2 | 20 ×1 | Estado | 122 ×2 |
| Raikou | 9 ×½ | 23 ×1 | Estado | 27 ×½ |
| Entei | 16 ×1 | 20 ×1 | Estado | 68 ×1 |
| Suicune | 26 ×2 | 16 ×1 | Estado | 96 ×2 |
| Lugia | 24 ×2 | 14 ×1 | Estado | 74 ×2 |
| Ho-Oh | 32 ×2 | 20 ×1 | Estado | 74 ×2 |
| Celebi | 7 ×½ | 18 ×1 | Estado | 27 ×½ |
| Kyogre | 32 ×2 | 20 ×1 | Estado | 80 ×2 |
| Groudon | 0 ×0 | 13 ×1 | Estado (×0) | 0 ×0 |
| Rayquaza | 16 ×1 | 20 ×1 | Estado | 59 ×1 |
| **Mediana de daño** | 21 | 20 | — | 70 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Gengar

Tipos: **Ghost / Poison** · HP 135 · Atk 85 · Def 80 · SpA 150 · SpD 95 · Vel 130

| Rival | Básica: Lengüetazo<br>Ghost · Fís · Pot 42 | Habilidad 1: Bola Sombra<br>Ghost · Esp · Pot 62 | Habilidad 2: Bomba Lodo<br>Poison · Esp · Pot 20/s | Definitiva: Come Sueños<br>Ghost · Esp · Pot 80 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 23 ×1 | 48 ×1 | 32 ×1 | 61 ×1 |
| Charmander | 25 ×1 | 57 ×1 | 42 ×1 | 74 ×1 |
| Squirtle | 18 ×1 | 48 ×1 | 32 ×1 | 61 ×1 |
| Pikachu | 26 ×1 | 57 ×1 | 42 ×1 | 74 ×1 |
| Voltorb | 23 ×1 | 53 ×1 | 37 ×1 | 69 ×1 |
| Eevee | 0 ×0 | 0 ×0 | 32 ×1 | 0 ×0 |
| Lucario | 17 ×1 | 45 ×1 | 0 ×0 | 57 ×1 |
| Greninja | 9 ×½ | 22 ×½ | 32 ×1 | 28 ×½ |
| Mewtwo | 28 ×2 | 74 ×2 | 27 ×1 | 96 ×2 |
| Mew | 26 ×2 | 68 ×2 | 22 ×1 | 88 ×2 |
| Onix | 9 ×1 | 61 ×1 | 10 ×¼ | 79 ×1 |
| Scyther | 15 ×1 | 39 ×1 | 27 ×1 | 51 ×1 |
| Gyarados | 15 ×1 | 34 ×1 | 22 ×1 | 44 ×1 |
| Tyranitar | 6 ×½ | 17 ×½ | 11 ×½ | 22 ×½ |
| Articuno | 13 ×1 | 28 ×1 | 17 ×1 | 36 ×1 |
| Zapdos | 14 ×1 | 37 ×1 | 27 ×1 | 48 ×1 |
| Moltres | 14 ×1 | 38 ×1 | 27 ×1 | 50 ×1 |
| Raikou | 16 ×1 | 34 ×1 | 22 ×1 | 44 ×1 |
| Entei | 14 ×1 | 43 ×1 | 27 ×1 | 54 ×1 |
| Suicune | 12 ×1 | 30 ×1 | 17 ×1 | 38 ×1 |
| Lugia | 22 ×2 | 48 ×2 | 12 ×1 | 60 ×2 |
| Ho-Oh | 14 ×1 | 24 ×1 | 12 ×1 | 30 ×1 |
| Celebi | 26 ×2 | 68 ×2 | 44 ×2 | 88 ×2 |
| Kyogre | 14 ×1 | 25 ×1 | 17 ×1 | 33 ×1 |
| Groudon | 10 ×1 | 37 ×1 | 11 ×½ | 48 ×1 |
| Rayquaza | 14 ×1 | 37 ×1 | 27 ×1 | 48 ×1 |
| **Mediana de daño** | 15 | 39 | 27 | 51 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Bulbasaur

Tipos: **Grass / Poison** · HP 120 · Atk 69 · Def 69 · SpA 85 · SpD 85 · Vel 65

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 | Habilidad 1: Paralizador<br>Grass · Estado · Pot — | Habilidad 2: Hoja Afilada<br>Grass · Esp · Pot 100 | Definitiva: Lluevehojas<br>Grass · Esp · Pot 160 |
| --- | ---: | ---: | ---: | ---: |
| Charmander | 25 ×1 | Estado | 26 ×½ | 42 ×½ |
| Squirtle | 19 ×1 | Estado | 88 ×2 | 140 ×2 |
| Pikachu | 26 ×1 | Estado | 52 ×1 | 84 ×1 |
| Gengar | 0 ×0 | Estado | 19 ×½ | 30 ×½ |
| Voltorb | 23 ×1 | Estado | 49 ×1 | 77 ×1 |
| Eevee | 23 ×1 | Estado | 44 ×1 | 69 ×1 |
| Lucario | 9 ×½ | Estado | 20 ×½ | 32 ×½ |
| Greninja | 19 ×1 | Estado | 80 ×2 | 128 ×2 |
| Mewtwo | 15 ×1 | Estado | 34 ×1 | 53 ×1 |
| Mew | 13 ×1 | Estado | 31 ×1 | 49 ×1 |
| Onix | 5 ×½ | Estado | 224 ×4 | 361 ×4 |
| Scyther | 16 ×1 | Estado | 9 ×¼ | 14 ×¼ |
| Gyarados | 16 ×1 | Estado | 31 ×1 | 49 ×1 |
| Tyranitar | 6 ×½ | Estado | 62 ×2 | 98 ×2 |
| Articuno | 13 ×1 | Estado | 12 ×½ | 20 ×½ |
| Zapdos | 15 ×1 | Estado | 17 ×½ | 26 ×½ |
| Moltres | 15 ×1 | Estado | 8 ×¼ | 13 ×¼ |
| Raikou | 17 ×1 | Estado | 31 ×1 | 49 ×1 |
| Entei | 15 ×1 | Estado | 19 ×½ | 30 ×½ |
| Suicune | 12 ×1 | Estado | 54 ×2 | 88 ×2 |
| Lugia | 12 ×1 | Estado | 11 ×½ | 17 ×½ |
| Ho-Oh | 15 ×1 | Estado | 5 ×¼ | 8 ×¼ |
| Celebi | 13 ×1 | Estado | 15 ×½ | 24 ×½ |
| Kyogre | 15 ×1 | Estado | 48 ×2 | 74 ×2 |
| Groudon | 11 ×1 | Estado | 68 ×2 | 106 ×2 |
| Rayquaza | 15 ×1 | Estado | 8 ×¼ | 13 ×¼ |
| **Mediana de daño** | 15 | — | 31 | 49 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Charmander

Tipos: **Fire** · HP 114 · Atk 72 · Def 63 · SpA 80 · SpD 70 · Vel 85

| Rival | Básica: Arañazo<br>Normal · Fís · Pot 55 | Habilidad 1: Giro Fuego<br>Fire · Esp · Pot 40/s | Habilidad 2: Lanzallamas<br>Fire · Esp · Pot 100 | Definitiva: Anillo Ígneo<br>Fire · Esp · Pot 130 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 24 ×1 | 64 ×2 | 80 ×2 | 104 ×2 |
| Squirtle | 20 ×1 | 13 ×½ | 20 ×½ | 26 ×½ |
| Pikachu | 28 ×1 | 44 ×1 | 50 ×1 | 64 ×1 |
| Gengar | 0 ×0 | 26 ×1 | 37 ×1 | 48 ×1 |
| Voltorb | 24 ×1 | 38 ×1 | 46 ×1 | 60 ×1 |
| Eevee | 24 ×1 | 32 ×1 | 40 ×1 | 52 ×1 |
| Lucario | 9 ×½ | 64 ×2 | 76 ×2 | 100 ×2 |
| Greninja | 20 ×1 | 13 ×½ | 19 ×½ | 25 ×½ |
| Mewtwo | 15 ×1 | 26 ×1 | 32 ×1 | 40 ×1 |
| Mew | 14 ×1 | 20 ×1 | 29 ×1 | 38 ×1 |
| Onix | 5 ×½ | 19 ×½ | 26 ×½ | 34 ×½ |
| Scyther | 17 ×1 | 52 ×2 | 70 ×2 | 90 ×2 |
| Gyarados | 17 ×1 | 7 ×½ | 14 ×½ | 19 ×½ |
| Tyranitar | 6 ×½ | 7 ×½ | 14 ×½ | 19 ×½ |
| Articuno | 14 ×1 | 28 ×2 | 50 ×2 | 62 ×2 |
| Zapdos | 16 ×1 | 26 ×1 | 32 ×1 | 40 ×1 |
| Moltres | 15 ×1 | 13 ×½ | 16 ×½ | 21 ×½ |
| Raikou | 18 ×1 | 20 ×1 | 29 ×1 | 38 ×1 |
| Entei | 16 ×1 | 13 ×½ | 18 ×½ | 24 ×½ |
| Suicune | 12 ×1 | 7 ×½ | 13 ×½ | 16 ×½ |
| Lugia | 12 ×1 | 14 ×1 | 21 ×1 | 26 ×1 |
| Ho-Oh | 15 ×1 | 7 ×½ | 10 ×½ | 13 ×½ |
| Celebi | 14 ×1 | 40 ×2 | 58 ×2 | 76 ×2 |
| Kyogre | 15 ×1 | 7 ×½ | 11 ×½ | 14 ×½ |
| Groudon | 11 ×1 | 26 ×1 | 32 ×1 | 40 ×1 |
| Rayquaza | 15 ×1 | 13 ×½ | 16 ×½ | 20 ×½ |
| **Mediana de daño** | 15 | 20 | 29 | 38 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Squirtle

Tipos: **Water** · HP 119 · Atk 68 · Def 85 · SpA 70 · SpD 84 · Vel 63

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 | Habilidad 1: Acua Jet<br>Water · Fís · Pot 65 | Habilidad 2: Rayo Burbuja<br>Water · Esp · Pot 80 | Definitiva: Hidrobomba<br>Water · Esp · Pot 140 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 23 ×1 | 14 ×½ | 14 ×½ | 25 ×½ |
| Charmander | 25 ×1 | 60 ×2 | 70 ×2 | 120 ×2 |
| Pikachu | 26 ×1 | 32 ×1 | 35 ×1 | 60 ×1 |
| Gengar | 0 ×0 | 25 ×1 | 25 ×1 | 45 ×1 |
| Voltorb | 23 ×1 | 27 ×1 | 32 ×1 | 56 ×1 |
| Eevee | 23 ×1 | 27 ×1 | 28 ×1 | 50 ×1 |
| Lucario | 9 ×½ | 22 ×1 | 27 ×1 | 47 ×1 |
| Greninja | 18 ×1 | 11 ×½ | 13 ×½ | 23 ×½ |
| Mewtwo | 14 ×1 | 17 ×1 | 23 ×1 | 38 ×1 |
| Mew | 13 ×1 | 16 ×1 | 21 ×1 | 35 ×1 |
| Onix | 5 ×½ | 44 ×4 | 148 ×4 | 261 ×4 |
| Scyther | 16 ×1 | 19 ×1 | 25 ×1 | 43 ×1 |
| Gyarados | 16 ×1 | 9 ×½ | 10 ×½ | 17 ×½ |
| Tyranitar | 6 ×½ | 28 ×2 | 42 ×2 | 70 ×2 |
| Articuno | 13 ×1 | 16 ×1 | 16 ×1 | 29 ×1 |
| Zapdos | 15 ×1 | 18 ×1 | 23 ×1 | 38 ×1 |
| Moltres | 14 ×1 | 34 ×2 | 48 ×2 | 80 ×2 |
| Raikou | 17 ×1 | 21 ×1 | 21 ×1 | 35 ×1 |
| Entei | 15 ×1 | 36 ×2 | 50 ×2 | 90 ×2 |
| Suicune | 12 ×1 | 7 ×½ | 9 ×½ | 15 ×½ |
| Lugia | 11 ×1 | 12 ×1 | 14 ×1 | 25 ×1 |
| Ho-Oh | 14 ×1 | 34 ×2 | 28 ×2 | 50 ×2 |
| Celebi | 13 ×1 | 8 ×½ | 10 ×½ | 17 ×½ |
| Kyogre | 14 ×1 | 8 ×½ | 7 ×½ | 13 ×½ |
| Groudon | 11 ×1 | 24 ×2 | 46 ×2 | 76 ×2 |
| Rayquaza | 14 ×1 | 8 ×½ | 11 ×½ | 19 ×½ |
| **Mediana de daño** | 14 | 20 | 24 | 41 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Lucario

Tipos: **Fighting / Steel** · HP 145 · Atk 130 · Def 90 · SpA 135 · SpD 90 · Vel 110

| Rival | Básica: Garra Metal<br>Steel · Fís · Pot 45 | Habilidad 1: Velocidad Extrema<br>Normal · Fís · Pot 55 | Habilidad 2: Esfera Aura<br>Fighting · Esp · Pot 60 | Definitiva: Combate Cercano<br>Fighting · Fís · Pot 125 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 37 ×1 | 43 ×1 | 20 ×½ | 50 ×½ |
| Charmander | 19 ×½ | 47 ×1 | 50 ×1 | 111 ×1 |
| Squirtle | 15 ×½ | 36 ×1 | 42 ×1 | 82 ×1 |
| Pikachu | 21 ×½ | 49 ×1 | 50 ×1 | 116 ×1 |
| Gengar | 32 ×1 | 0 ×0 | 0 ×0 | 0 ×0 |
| Voltorb | 18 ×½ | 42 ×1 | 47 ×1 | 100 ×1 |
| Eevee | 36 ×1 | 42 ×1 | 80 ×2 | 200 ×2 |
| Greninja | 14 ×½ | 35 ×1 | 76 ×2 | 160 ×2 |
| Mewtwo | 24 ×1 | 27 ×1 | 16 ×½ | 32 ×½ |
| Mew | 22 ×1 | 25 ×1 | 14 ×½ | 29 ×½ |
| Onix | 28 ×2 | 8 ×½ | 106 ×2 | 76 ×2 |
| Scyther | 25 ×1 | 30 ×1 | 8 ×¼ | 17 ×¼ |
| Gyarados | 13 ×½ | 30 ×1 | 14 ×½ | 35 ×½ |
| Tyranitar | 38 ×2 | 12 ×½ | 116 ×4 | 216 ×4 |
| Articuno | 44 ×2 | 25 ×1 | 25 ×1 | 58 ×1 |
| Zapdos | 12 ×½ | 28 ×1 | 16 ×½ | 33 ×½ |
| Moltres | 12 ×½ | 27 ×1 | 16 ×½ | 32 ×½ |
| Raikou | 13 ×½ | 32 ×1 | 29 ×1 | 74 ×1 |
| Entei | 12 ×½ | 28 ×1 | 37 ×1 | 67 ×1 |
| Suicune | 9 ×½ | 23 ×1 | 26 ×1 | 51 ×1 |
| Lugia | 17 ×1 | 20 ×1 | 5 ×¼ | 11 ×¼ |
| Ho-Oh | 12 ×½ | 27 ×1 | 10 ×½ | 32 ×½ |
| Celebi | 22 ×1 | 25 ×1 | 14 ×½ | 29 ×½ |
| Kyogre | 12 ×½ | 27 ×1 | 23 ×1 | 64 ×1 |
| Groudon | 16 ×1 | 19 ×1 | 32 ×1 | 44 ×1 |
| Rayquaza | 24 ×1 | 27 ×1 | 16 ×½ | 32 ×½ |
| **Mediana de daño** | 19 | 27 | 24 | 51 |
| **Efectividad mediana** | ×0.75 | ×1 | ×1 | ×1 |

## Greninja

Tipos: **Water / Dark** · HP 147 · Atk 115 · Def 87 · SpA 123 · SpD 91 · Vel 142

| Rival | Básica: Shuriken de Agua<br>Water · Esp · Pot 42 | Habilidad 1: Tajo Umbrío<br>Dark · Fís · Pot 65 | Habilidad 2: Sombra Vil<br>Dark · Fís · Pot 50 | Definitiva: Pulso Umbrío<br>Dark · Esp · Pot 85 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 13 ×½ | 47 ×1 | 36 ×1 | 53 ×1 |
| Charmander | 64 ×2 | 51 ×1 | 39 ×1 | 64 ×1 |
| Squirtle | 13 ×½ | 38 ×1 | 29 ×1 | 53 ×1 |
| Pikachu | 32 ×1 | 53 ×1 | 42 ×1 | 64 ×1 |
| Gengar | 24 ×1 | 80 ×2 | 62 ×2 | 96 ×2 |
| Voltorb | 30 ×1 | 46 ×1 | 36 ×1 | 60 ×1 |
| Eevee | 26 ×1 | 46 ×1 | 36 ×1 | 53 ×1 |
| Lucario | 25 ×1 | 18 ×½ | 14 ×½ | 25 ×½ |
| Mewtwo | 21 ×1 | 58 ×2 | 48 ×2 | 80 ×2 |
| Mew | 18 ×1 | 54 ×2 | 44 ×2 | 76 ×2 |
| Onix | 136 ×4 | 18 ×1 | 14 ×1 | 69 ×1 |
| Scyther | 23 ×1 | 32 ×1 | 25 ×1 | 46 ×1 |
| Gyarados | 9 ×½ | 33 ×1 | 25 ×1 | 38 ×1 |
| Tyranitar | 36 ×2 | 12 ×½ | 9 ×½ | 19 ×½ |
| Articuno | 15 ×1 | 27 ×1 | 22 ×1 | 31 ×1 |
| Zapdos | 21 ×1 | 31 ×1 | 25 ×1 | 40 ×1 |
| Moltres | 44 ×2 | 29 ×1 | 24 ×1 | 43 ×1 |
| Raikou | 18 ×1 | 34 ×1 | 26 ×1 | 38 ×1 |
| Entei | 48 ×2 | 31 ×1 | 25 ×1 | 48 ×1 |
| Suicune | 8 ×½ | 25 ×1 | 18 ×1 | 34 ×1 |
| Lugia | 13 ×1 | 44 ×2 | 32 ×2 | 52 ×2 |
| Ho-Oh | 26 ×2 | 29 ×1 | 24 ×1 | 26 ×1 |
| Celebi | 9 ×½ | 54 ×2 | 44 ×2 | 76 ×2 |
| Kyogre | 7 ×½ | 29 ×1 | 24 ×1 | 28 ×1 |
| Groudon | 42 ×2 | 21 ×1 | 15 ×1 | 40 ×1 |
| Rayquaza | 10 ×½ | 29 ×1 | 24 ×1 | 40 ×1 |
| **Mediana de daño** | 22 | 33 | 25 | 47 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Articuno

Tipos: **Ice / Flying** · HP 165 · Atk 105 · Def 120 · SpA 115 · SpD 145 · Vel 105

| Rival | Básica: Golpe Ala<br>Flying · Fís · Pot 55 | Habilidad 1: Rayo Hielo<br>Ice · Esp · Pot 90 | Habilidad 2: Viento Gélido<br>Ice · Esp · Pot 55 | Definitiva: Ventisca<br>Ice · Esp · Pot 100 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 72 ×2 | 104 ×2 | 64 ×2 | 116 ×2 |
| Charmander | 39 ×1 | 32 ×½ | 19 ×½ | 35 ×½ |
| Squirtle | 29 ×1 | 26 ×½ | 16 ×½ | 29 ×½ |
| Pikachu | 21 ×½ | 64 ×1 | 38 ×1 | 71 ×1 |
| Gengar | 31 ×1 | 47 ×1 | 29 ×1 | 52 ×1 |
| Voltorb | 18 ×½ | 59 ×1 | 37 ×1 | 66 ×1 |
| Eevee | 36 ×1 | 52 ×1 | 32 ×1 | 58 ×1 |
| Lucario | 28 ×1 | 25 ×½ | 15 ×½ | 27 ×½ |
| Greninja | 29 ×1 | 25 ×½ | 15 ×½ | 27 ×½ |
| Mewtwo | 24 ×1 | 40 ×1 | 25 ×1 | 46 ×1 |
| Mew | 22 ×1 | 37 ×1 | 24 ×1 | 42 ×1 |
| Onix | 7 ×½ | 138 ×2 | 84 ×2 | 152 ×2 |
| Scyther | 50 ×2 | 90 ×2 | 54 ×2 | 100 ×2 |
| Gyarados | 25 ×1 | 37 ×1 | 24 ×1 | 42 ×1 |
| Tyranitar | 9 ×½ | 37 ×1 | 24 ×1 | 42 ×1 |
| Zapdos | 12 ×½ | 80 ×2 | 50 ×2 | 92 ×2 |
| Moltres | 24 ×1 | 43 ×1 | 26 ×1 | 48 ×1 |
| Raikou | 13 ×½ | 37 ×1 | 24 ×1 | 42 ×1 |
| Entei | 25 ×1 | 23 ×½ | 14 ×½ | 26 ×½ |
| Suicune | 18 ×1 | 16 ×½ | 10 ×½ | 18 ×½ |
| Lugia | 16 ×1 | 52 ×2 | 30 ×2 | 58 ×2 |
| Ho-Oh | 24 ×1 | 26 ×1 | 15 ×1 | 29 ×1 |
| Celebi | 44 ×2 | 74 ×2 | 48 ×2 | 84 ×2 |
| Kyogre | 24 ×1 | 14 ×½ | 8 ×½ | 15 ×½ |
| Groudon | 15 ×1 | 80 ×2 | 50 ×2 | 92 ×2 |
| Rayquaza | 24 ×1 | 161 ×4 | 100 ×4 | 184 ×4 |
| **Mediana de daño** | 24 | 42 | 26 | 47 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Zapdos

Tipos: **Electric / Flying** · HP 165 · Atk 110 · Def 105 · SpA 145 · SpD 110 · Vel 120

| Rival | Básica: Pico Taladro<br>Flying · Fís · Pot 60 | Habilidad 1: Onda Trueno<br>Electric · Estado · Pot — | Habilidad 2: Descarga<br>Electric · Esp · Pot 75 | Definitiva: Trueno<br>Electric · Esp · Pot 145 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 84 ×2 | Estado | 27 ×½ | 53 ×½ |
| Charmander | 46 ×1 | Estado | 67 ×1 | 129 ×1 |
| Squirtle | 34 ×1 | Estado | 110 ×2 | 216 ×2 |
| Pikachu | 24 ×½ | Estado | 33 ×½ | 64 ×½ |
| Gengar | 36 ×1 | Estado | 50 ×1 | 95 ×1 |
| Voltorb | 20 ×½ | Estado | 31 ×½ | 60 ×½ |
| Eevee | 40 ×1 | Estado | 55 ×1 | 106 ×1 |
| Lucario | 32 ×1 | Estado | 52 ×1 | 100 ×1 |
| Greninja | 33 ×1 | Estado | 102 ×2 | 198 ×2 |
| Mewtwo | 26 ×1 | Estado | 43 ×1 | 82 ×1 |
| Mew | 25 ×1 | Estado | 38 ×1 | 76 ×1 |
| Onix | 8 ×½ | Estado (×0) | 0 ×0 | 0 ×0 |
| Scyther | 58 ×2 | Estado | 94 ×2 | 180 ×2 |
| Gyarados | 29 ×1 | Estado | 152 ×4 | 304 ×4 |
| Tyranitar | 11 ×½ | Estado | 38 ×1 | 76 ×1 |
| Articuno | 25 ×1 | Estado | 66 ×2 | 126 ×2 |
| Moltres | 26 ×1 | Estado | 90 ×2 | 174 ×2 |
| Raikou | 15 ×½ | Estado | 19 ×½ | 38 ×½ |
| Entei | 27 ×1 | Estado | 50 ×1 | 95 ×1 |
| Suicune | 22 ×1 | Estado | 70 ×2 | 134 ×2 |
| Lugia | 19 ×1 | Estado | 54 ×2 | 104 ×2 |
| Ho-Oh | 26 ×1 | Estado | 54 ×2 | 104 ×2 |
| Celebi | 50 ×2 | Estado | 19 ×½ | 38 ×½ |
| Kyogre | 26 ×1 | Estado | 58 ×2 | 112 ×2 |
| Groudon | 18 ×1 | Estado (×0) | 0 ×0 | 0 ×0 |
| Rayquaza | 26 ×1 | Estado | 43 ×1 | 82 ×1 |
| **Mediana de daño** | 26 | — | 51 | 98 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Moltres

Tipos: **Fire / Flying** · HP 165 · Atk 120 · Def 110 · SpA 145 · SpD 105 · Vel 110

| Rival | Básica: Ataque Aéreo<br>Flying · Fís · Pot 55 | Habilidad 1: Tajo Aéreo<br>Flying · Esp · Pot 65 | Habilidad 2: Onda Ígnea<br>Fire · Esp · Pot 60 | Definitiva: Ataque Celeste<br>Flying · Fís · Pot 115 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 84 ×2 | 96 ×2 | 90 ×2 | 174 ×2 |
| Charmander | 46 ×1 | 58 ×1 | 26 ×½ | 94 ×1 |
| Squirtle | 34 ×1 | 49 ×1 | 22 ×½ | 70 ×1 |
| Pikachu | 24 ×½ | 29 ×½ | 53 ×1 | 49 ×½ |
| Gengar | 36 ×1 | 43 ×1 | 39 ×1 | 74 ×1 |
| Voltorb | 20 ×½ | 27 ×½ | 51 ×1 | 42 ×½ |
| Eevee | 40 ×1 | 48 ×1 | 45 ×1 | 85 ×1 |
| Lucario | 32 ×1 | 46 ×1 | 84 ×2 | 66 ×1 |
| Greninja | 33 ×1 | 45 ×1 | 21 ×½ | 68 ×1 |
| Mewtwo | 26 ×1 | 37 ×1 | 34 ×1 | 54 ×1 |
| Mew | 25 ×1 | 34 ×1 | 31 ×1 | 50 ×1 |
| Onix | 8 ×½ | 31 ×½ | 28 ×½ | 16 ×½ |
| Scyther | 58 ×2 | 80 ×2 | 76 ×2 | 118 ×2 |
| Gyarados | 29 ×1 | 34 ×1 | 15 ×½ | 60 ×1 |
| Tyranitar | 11 ×½ | 17 ×½ | 15 ×½ | 23 ×½ |
| Articuno | 25 ×1 | 28 ×1 | 52 ×2 | 50 ×1 |
| Zapdos | 13 ×½ | 18 ×½ | 34 ×1 | 28 ×½ |
| Raikou | 15 ×½ | 17 ×½ | 31 ×1 | 31 ×½ |
| Entei | 27 ×1 | 43 ×1 | 19 ×½ | 56 ×1 |
| Suicune | 22 ×1 | 30 ×1 | 14 ×½ | 44 ×1 |
| Lugia | 19 ×1 | 24 ×1 | 23 ×1 | 39 ×1 |
| Ho-Oh | 26 ×1 | 24 ×1 | 11 ×½ | 54 ×1 |
| Celebi | 50 ×2 | 68 ×2 | 62 ×2 | 100 ×2 |
| Kyogre | 26 ×1 | 25 ×1 | 12 ×½ | 54 ×1 |
| Groudon | 18 ×1 | 37 ×1 | 34 ×1 | 37 ×1 |
| Rayquaza | 26 ×1 | 37 ×1 | 17 ×½ | 54 ×1 |
| **Mediana de daño** | 26 | 36 | 31 | 54 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Mewtwo

Tipos: **Psychic** · HP 181 · Atk 130 · Def 110 · SpA 174 · SpD 110 · Vel 150

| Rival | Básica: Telequinesis<br>Psychic · Esp · Pot 45 | Habilidad 1: Teletransporte<br>Psychic · Estado · Pot — | Habilidad 2: Psíquico<br>Psychic · Esp · Pot 80 | Definitiva: Psicoataque<br>Psychic · Esp · Pot 100 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 78 ×2 | Estado | 142 ×2 | 178 ×2 |
| Charmander | 49 ×1 | Estado | 86 ×1 | 107 ×1 |
| Squirtle | 40 ×1 | Estado | 71 ×1 | 90 ×1 |
| Pikachu | 49 ×1 | Estado | 86 ×1 | 107 ×1 |
| Gengar | 72 ×2 | Estado | 128 ×2 | 156 ×2 |
| Voltorb | 45 ×1 | Estado | 79 ×1 | 100 ×1 |
| Eevee | 39 ×1 | Estado | 71 ×1 | 89 ×1 |
| Lucario | 38 ×1 | Estado | 67 ×1 | 84 ×1 |
| Greninja | 0 ×0 | Estado (×0) | 0 ×0 | 0 ×0 |
| Mew | 14 ×½ | Estado | 25 ×½ | 31 ×½ |
| Onix | 52 ×1 | Estado | 92 ×1 | 115 ×1 |
| Scyther | 34 ×1 | Estado | 60 ×1 | 75 ×1 |
| Gyarados | 28 ×1 | Estado | 51 ×1 | 63 ×1 |
| Tyranitar | 0 ×0 | Estado (×0) | 0 ×0 | 0 ×0 |
| Articuno | 24 ×1 | Estado | 42 ×1 | 51 ×1 |
| Zapdos | 31 ×1 | Estado | 54 ×1 | 68 ×1 |
| Moltres | 32 ×1 | Estado | 57 ×1 | 71 ×1 |
| Raikou | 28 ×1 | Estado | 51 ×1 | 63 ×1 |
| Entei | 36 ×1 | Estado | 64 ×1 | 78 ×1 |
| Suicune | 25 ×1 | Estado | 45 ×1 | 55 ×1 |
| Lugia | 9 ×½ | Estado | 17 ×½ | 22 ×½ |
| Ho-Oh | 19 ×1 | Estado | 35 ×1 | 44 ×1 |
| Celebi | 14 ×½ | Estado | 25 ×½ | 31 ×½ |
| Kyogre | 22 ×1 | Estado | 38 ×1 | 47 ×1 |
| Groudon | 31 ×1 | Estado | 54 ×1 | 68 ×1 |
| Rayquaza | 31 ×1 | Estado | 54 ×1 | 68 ×1 |
| **Mediana de daño** | 31 | — | 54 | 68 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Mew

Tipos: **Psychic** · HP 175 · Atk 120 · Def 120 · SpA 120 · SpD 120 · Vel 120

| Rival | Básica: Golpe Psíquico<br>Psychic · Esp · Pot 45 | Habilidad 1: Agilidad<br>Psychic · Estado · Pot — | Habilidad 2: Premonición<br>Psychic · Esp · Pot 85 | Definitiva: Recuperación<br>Psychic · Estado · Pot — |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 54 ×2 | Estado | 102 ×2 | Estado |
| Charmander | 33 ×1 | Estado | 64 ×1 | Estado |
| Squirtle | 28 ×1 | Estado | 52 ×1 | Estado |
| Pikachu | 33 ×1 | Estado | 64 ×1 | Estado |
| Gengar | 50 ×2 | Estado | 94 ×2 | Estado |
| Voltorb | 31 ×1 | Estado | 58 ×1 | Estado |
| Eevee | 27 ×1 | Estado | 51 ×1 | Estado |
| Lucario | 26 ×1 | Estado | 49 ×1 | Estado |
| Greninja | 0 ×0 | Estado (×0) | 0 ×0 | Estado (×0) |
| Mewtwo | 11 ×½ | Estado | 19 ×½ | Estado |
| Onix | 36 ×1 | Estado | 68 ×1 | Estado |
| Scyther | 24 ×1 | Estado | 44 ×1 | Estado |
| Gyarados | 19 ×1 | Estado | 37 ×1 | Estado |
| Tyranitar | 0 ×0 | Estado (×0) | 0 ×0 | Estado (×0) |
| Articuno | 16 ×1 | Estado | 30 ×1 | Estado |
| Zapdos | 22 ×1 | Estado | 39 ×1 | Estado |
| Moltres | 23 ×1 | Estado | 42 ×1 | Estado |
| Raikou | 19 ×1 | Estado | 37 ×1 | Estado |
| Entei | 25 ×1 | Estado | 47 ×1 | Estado |
| Suicune | 17 ×1 | Estado | 33 ×1 | Estado |
| Lugia | 6 ×½ | Estado | 12 ×½ | Estado |
| Ho-Oh | 13 ×1 | Estado | 25 ×1 | Estado |
| Celebi | 9 ×½ | Estado | 18 ×½ | Estado |
| Kyogre | 14 ×1 | Estado | 28 ×1 | Estado |
| Groudon | 22 ×1 | Estado | 39 ×1 | Estado |
| Rayquaza | 22 ×1 | Estado | 39 ×1 | Estado |
| **Mediana de daño** | 22 | — | 39 | — |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Scyther

Tipos: **Bug / Flying** · HP 145 · Atk 130 · Def 100 · SpA 75 · SpD 100 · Vel 125

| Rival | Básica: Golpe Furia<br>Bug · Fís · Pot 45 | Habilidad 1: Corte Aéreo<br>Flying · Fís · Pot 60 | Habilidad 2: Danza Espada<br>Normal · Estado · Pot — | Definitiva: Tijera X<br>Bug · Fís · Pot 130 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 37 ×1 | 98 ×2 | Estado | 105 ×1 |
| Charmander | 19 ×½ | 53 ×1 | Estado | 58 ×½ |
| Squirtle | 30 ×1 | 39 ×1 | Estado | 86 ×1 |
| Pikachu | 42 ×1 | 28 ×½ | Estado | 120 ×1 |
| Gengar | 8 ×¼ | 42 ×1 | Estado (×0) | 22 ×¼ |
| Voltorb | 36 ×1 | 24 ×½ | Estado | 103 ×1 |
| Eevee | 36 ×1 | 49 ×1 | Estado | 103 ×1 |
| Lucario | 7 ×¼ | 38 ×1 | Estado | 20 ×¼ |
| Greninja | 58 ×2 | 38 ×1 | Estado | 168 ×2 |
| Mewtwo | 48 ×2 | 31 ×1 | Estado | 132 ×2 |
| Mew | 44 ×2 | 28 ×1 | Estado | 120 ×2 |
| Onix | 14 ×1 | 9 ×½ | Estado | 40 ×1 |
| Gyarados | 13 ×½ | 34 ×1 | Estado | 37 ×½ |
| Tyranitar | 38 ×2 | 13 ×½ | Estado | 112 ×2 |
| Articuno | 11 ×½ | 28 ×1 | Estado | 30 ×½ |
| Zapdos | 12 ×½ | 16 ×½ | Estado | 34 ×½ |
| Moltres | 6 ×¼ | 31 ×1 | Estado | 16 ×¼ |
| Raikou | 27 ×1 | 18 ×½ | Estado | 77 ×1 |
| Entei | 12 ×½ | 32 ×1 | Estado | 34 ×½ |
| Suicune | 19 ×1 | 25 ×1 | Estado | 54 ×1 |
| Lugia | 17 ×1 | 23 ×1 | Estado | 49 ×1 |
| Ho-Oh | 6 ×¼ | 31 ×1 | Estado | 16 ×¼ |
| Celebi | 88 ×4 | 56 ×2 | Estado | 241 ×4 |
| Kyogre | 24 ×1 | 31 ×1 | Estado | 66 ×1 |
| Groudon | 16 ×1 | 22 ×1 | Estado | 46 ×1 |
| Rayquaza | 12 ×½ | 31 ×1 | Estado | 33 ×½ |
| **Mediana de daño** | 19 | 31 | — | 56 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Tyranitar

Tipos: **Rock / Dark** · HP 175 · Atk 154 · Def 130 · SpA 115 · SpD 120 · Vel 81

| Rival | Básica: Triturar<br>Dark · Fís · Pot 50 | Habilidad 1: Avalancha<br>Rock · Fís · Pot 55 | Habilidad 2: Terremoto<br>Ground · Fís · Pot 18/s | Definitiva: Roca Afilada<br>Rock · Fís · Pot 90 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 49 ×1 | 26 ×½ | 37 ×1 | 43 ×½ |
| Charmander | 52 ×1 | 116 ×2 | 84 ×2 | 188 ×2 |
| Squirtle | 38 ×1 | 43 ×1 | 32 ×1 | 70 ×1 |
| Pikachu | 55 ×1 | 61 ×1 | 94 ×2 | 99 ×1 |
| Gengar | 84 ×2 | 23 ×½ | 64 ×2 | 37 ×½ |
| Voltorb | 48 ×1 | 52 ×1 | 74 ×2 | 86 ×1 |
| Eevee | 48 ×1 | 52 ×1 | 37 ×1 | 86 ×1 |
| Lucario | 18 ×½ | 10 ×¼ | 54 ×2 | 16 ×¼ |
| Greninja | 19 ×½ | 42 ×1 | 32 ×1 | 69 ×1 |
| Mewtwo | 60 ×2 | 33 ×1 | 22 ×1 | 54 ×1 |
| Mew | 56 ×2 | 31 ×1 | 22 ×1 | 50 ×1 |
| Onix | 18 ×1 | 10 ×½ | 24 ×2 | 16 ×½ |
| Scyther | 33 ×1 | 148 ×4 | 0 ×0 | 237 ×4 |
| Gyarados | 34 ×1 | 74 ×2 | 0 ×0 | 120 ×2 |
| Articuno | 28 ×1 | 124 ×4 | 0 ×0 | 200 ×4 |
| Zapdos | 32 ×1 | 70 ×2 | 0 ×0 | 114 ×2 |
| Moltres | 30 ×1 | 132 ×4 | 0 ×0 | 216 ×4 |
| Raikou | 35 ×1 | 38 ×1 | 54 ×2 | 64 ×1 |
| Entei | 32 ×1 | 70 ×2 | 44 ×2 | 114 ×2 |
| Suicune | 25 ×1 | 27 ×1 | 17 ×1 | 45 ×1 |
| Lugia | 46 ×2 | 50 ×2 | 0 ×0 | 78 ×2 |
| Ho-Oh | 30 ×1 | 132 ×4 | 0 ×0 | 216 ×4 |
| Celebi | 56 ×2 | 31 ×1 | 11 ×½ | 50 ×1 |
| Kyogre | 30 ×1 | 33 ×1 | 22 ×1 | 54 ×1 |
| Groudon | 22 ×1 | 12 ×½ | 12 ×1 | 19 ×½ |
| Rayquaza | 30 ×1 | 66 ×2 | 0 ×0 | 108 ×2 |
| **Mediana de daño** | 34 | 47 | 22 | 74 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Onix

Tipos: **Rock / Ground** · HP 110 · Atk 65 · Def 180 · SpA 50 · SpD 65 · Vel 90

| Rival | Básica: Atadura<br>Rock · Fís · Pot 65 | Habilidad 1: Lanzarrocas<br>Rock · Fís · Pot 85 | Habilidad 2: Excavar<br>Ground · Fís · Pot 85 | Definitiva: Fisura<br>Ground · Fís · Pot 155 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 13 ×½ | 17 ×½ | 35 ×1 | 64 ×1 |
| Charmander | 58 ×2 | 76 ×2 | 76 ×2 | 138 ×2 |
| Squirtle | 22 ×1 | 28 ×1 | 28 ×1 | 51 ×1 |
| Pikachu | 30 ×1 | 39 ×1 | 78 ×2 | 144 ×2 |
| Gengar | 12 ×½ | 15 ×½ | 60 ×2 | 108 ×2 |
| Voltorb | 26 ×1 | 34 ×1 | 68 ×2 | 126 ×2 |
| Eevee | 26 ×1 | 34 ×1 | 34 ×1 | 63 ×1 |
| Lucario | 5 ×¼ | 6 ×¼ | 54 ×2 | 98 ×2 |
| Greninja | 22 ×1 | 27 ×1 | 27 ×1 | 50 ×1 |
| Mewtwo | 16 ×1 | 23 ×1 | 23 ×1 | 39 ×1 |
| Mew | 15 ×1 | 21 ×1 | 21 ×1 | 36 ×1 |
| Scyther | 72 ×4 | 100 ×4 | 0 ×0 | 0 ×0 |
| Gyarados | 36 ×2 | 50 ×2 | 0 ×0 | 0 ×0 |
| Tyranitar | 14 ×1 | 18 ×1 | 36 ×2 | 68 ×2 |
| Articuno | 60 ×4 | 84 ×4 | 0 ×0 | 0 ×0 |
| Zapdos | 34 ×2 | 48 ×2 | 0 ×0 | 0 ×0 |
| Moltres | 64 ×4 | 92 ×4 | 0 ×0 | 0 ×0 |
| Raikou | 19 ×1 | 25 ×1 | 50 ×2 | 92 ×2 |
| Entei | 34 ×2 | 48 ×2 | 48 ×2 | 84 ×2 |
| Suicune | 13 ×1 | 18 ×1 | 18 ×1 | 32 ×1 |
| Lugia | 24 ×2 | 32 ×2 | 0 ×0 | 0 ×0 |
| Ho-Oh | 64 ×4 | 92 ×4 | 0 ×0 | 0 ×0 |
| Celebi | 15 ×1 | 21 ×1 | 10 ×½ | 18 ×½ |
| Kyogre | 16 ×1 | 23 ×1 | 23 ×1 | 39 ×1 |
| Groudon | 6 ×½ | 7 ×½ | 15 ×1 | 27 ×1 |
| Rayquaza | 32 ×2 | 46 ×2 | 0 ×0 | 0 ×0 |
| **Mediana de daño** | 23 | 30 | 23 | 39 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Groudon

Tipos: **Ground** · HP 175 · Atk 170 · Def 160 · SpA 120 · SpD 110 · Vel 110

| Rival | Básica: Cuchillada<br>Normal · Fís · Pot 45 | Habilidad 1: Terremoto<br>Ground · Fís · Pot 18/s | Habilidad 2: Avalancha<br>Rock · Fís · Pot 55 | Definitiva: Filo del Abismo<br>Ground · Fís · Pot 100 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 46 ×1 | 42 ×1 | 28 ×½ | 106 ×1 |
| Charmander | 50 ×1 | 94 ×2 | 122 ×2 | 232 ×2 |
| Squirtle | 37 ×1 | 32 ×1 | 46 ×1 | 87 ×1 |
| Pikachu | 53 ×1 | 104 ×2 | 64 ×1 | 243 ×2 |
| Gengar | 0 ×0 | 74 ×2 | 24 ×½ | 182 ×2 |
| Voltorb | 46 ×1 | 84 ×2 | 55 ×1 | 207 ×2 |
| Eevee | 46 ×1 | 42 ×1 | 55 ×1 | 103 ×1 |
| Lucario | 18 ×½ | 64 ×2 | 10 ×¼ | 162 ×2 |
| Greninja | 37 ×1 | 32 ×1 | 45 ×1 | 84 ×1 |
| Mewtwo | 29 ×1 | 27 ×1 | 36 ×1 | 67 ×1 |
| Mew | 27 ×1 | 22 ×1 | 33 ×1 | 61 ×1 |
| Onix | 9 ×½ | 24 ×2 | 11 ×½ | 80 ×2 |
| Scyther | 32 ×1 | 0 ×0 | 156 ×4 | 0 ×0 |
| Gyarados | 33 ×1 | 0 ×0 | 78 ×2 | 0 ×0 |
| Tyranitar | 12 ×½ | 44 ×2 | 30 ×1 | 112 ×2 |
| Articuno | 27 ×1 | 0 ×0 | 132 ×4 | 0 ×0 |
| Zapdos | 31 ×1 | 0 ×0 | 74 ×2 | 0 ×0 |
| Moltres | 29 ×1 | 0 ×0 | 144 ×4 | 0 ×0 |
| Raikou | 34 ×1 | 64 ×2 | 41 ×1 | 154 ×2 |
| Entei | 31 ×1 | 54 ×2 | 74 ×2 | 140 ×2 |
| Suicune | 24 ×1 | 17 ×1 | 29 ×1 | 54 ×1 |
| Lugia | 22 ×1 | 0 ×0 | 52 ×2 | 0 ×0 |
| Ho-Oh | 29 ×1 | 0 ×0 | 144 ×4 | 0 ×0 |
| Celebi | 27 ×1 | 11 ×½ | 33 ×1 | 30 ×½ |
| Kyogre | 29 ×1 | 27 ×1 | 36 ×1 | 67 ×1 |
| Rayquaza | 29 ×1 | 0 ×0 | 72 ×2 | 0 ×0 |
| **Mediana de daño** | 29 | 27 | 49 | 74 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Celebi

Tipos: **Psychic / Grass** · HP 175 · Atk 120 · Def 120 · SpA 120 · SpD 120 · Vel 120

| Rival | Básica: Hoja Mágica<br>Grass · Esp · Pot 45 | Habilidad 1: Rayo Solar<br>Grass · Esp · Pot 85 | Habilidad 2: Deseo<br>Psychic · Estado · Pot — | Definitiva: Futuro Siniestro<br>Psychic · Esp · Pot 105 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 6 ×¼ | 12 ×¼ | Estado | 128 ×2 |
| Charmander | 16 ×½ | 32 ×½ | Estado | 77 ×1 |
| Squirtle | 56 ×2 | 104 ×2 | Estado | 65 ×1 |
| Pikachu | 33 ×1 | 64 ×1 | Estado | 77 ×1 |
| Gengar | 12 ×½ | 23 ×½ | Estado | 114 ×2 |
| Voltorb | 31 ×1 | 58 ×1 | Estado | 72 ×1 |
| Eevee | 27 ×1 | 51 ×1 | Estado | 64 ×1 |
| Lucario | 13 ×½ | 24 ×½ | Estado | 60 ×1 |
| Greninja | 52 ×2 | 98 ×2 | Estado (×0) | 0 ×0 |
| Mewtwo | 22 ×1 | 39 ×1 | Estado | 25 ×½ |
| Mew | 19 ×1 | 37 ×1 | Estado | 23 ×½ |
| Onix | 144 ×4 | 273 ×4 | Estado | 84 ×1 |
| Scyther | 6 ×¼ | 11 ×¼ | Estado | 54 ×1 |
| Gyarados | 19 ×1 | 37 ×1 | Estado | 46 ×1 |
| Tyranitar | 38 ×2 | 74 ×2 | Estado (×0) | 0 ×0 |
| Articuno | 8 ×½ | 15 ×½ | Estado | 38 ×1 |
| Zapdos | 11 ×½ | 19 ×½ | Estado | 50 ×1 |
| Moltres | 5 ×¼ | 10 ×¼ | Estado | 51 ×1 |
| Raikou | 19 ×1 | 37 ×1 | Estado | 46 ×1 |
| Entei | 12 ×½ | 23 ×½ | Estado | 57 ×1 |
| Suicune | 34 ×2 | 66 ×2 | Estado | 40 ×1 |
| Lugia | 6 ×½ | 12 ×½ | Estado | 15 ×½ |
| Ho-Oh | 3 ×¼ | 6 ×¼ | Estado | 31 ×1 |
| Kyogre | 28 ×2 | 56 ×2 | Estado | 34 ×1 |
| Groudon | 44 ×2 | 78 ×2 | Estado | 50 ×1 |
| Rayquaza | 5 ×¼ | 9 ×¼ | Estado | 50 ×1 |
| **Mediana de daño** | 19 | 37 | — | 50 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Lugia

Tipos: **Psychic / Flying** · HP 181 · Atk 110 · Def 150 · SpA 110 · SpD 174 · Vel 130

| Rival | Básica: Onda Mental<br>Psychic · Esp · Pot 50 | Habilidad 1: Marea<br>Water · Esp · Pot 30/s | Habilidad 2: Ciclón<br>Flying · Esp · Pot 45/s | Definitiva: Aerochorro<br>Flying · Esp · Pot 120 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 56 ×2 | 16 ×½ | 112 ×2 | 134 ×2 |
| Charmander | 34 ×1 | 94 ×2 | 67 ×1 | 80 ×1 |
| Squirtle | 28 ×1 | 16 ×½ | 56 ×1 | 68 ×1 |
| Pikachu | 34 ×1 | 47 ×1 | 31 ×½ | 40 ×½ |
| Gengar | 50 ×2 | 32 ×1 | 52 ×1 | 60 ×1 |
| Voltorb | 32 ×1 | 42 ×1 | 31 ×½ | 38 ×½ |
| Eevee | 28 ×1 | 37 ×1 | 56 ×1 | 67 ×1 |
| Lucario | 26 ×1 | 37 ×1 | 56 ×1 | 64 ×1 |
| Greninja | 0 ×0 | 16 ×½ | 52 ×1 | 63 ×1 |
| Mewtwo | 11 ×½ | 27 ×1 | 42 ×1 | 51 ×1 |
| Mew | 10 ×½ | 27 ×1 | 42 ×1 | 48 ×1 |
| Onix | 37 ×1 | 208 ×4 | 36 ×½ | 44 ×½ |
| Scyther | 25 ×1 | 32 ×1 | 94 ×2 | 114 ×2 |
| Gyarados | 21 ×1 | 11 ×½ | 42 ×1 | 48 ×1 |
| Tyranitar | 0 ×0 | 54 ×2 | 21 ×½ | 24 ×½ |
| Articuno | 16 ×1 | 22 ×1 | 32 ×1 | 39 ×1 |
| Zapdos | 23 ×1 | 27 ×1 | 21 ×½ | 25 ×½ |
| Moltres | 24 ×1 | 54 ×2 | 47 ×1 | 54 ×1 |
| Raikou | 21 ×1 | 27 ×1 | 21 ×½ | 24 ×½ |
| Entei | 25 ×1 | 64 ×2 | 52 ×1 | 60 ×1 |
| Suicune | 17 ×1 | 11 ×½ | 37 ×1 | 43 ×1 |
| Ho-Oh | 13 ×1 | 34 ×2 | 27 ×1 | 33 ×1 |
| Celebi | 10 ×½ | 11 ×½ | 84 ×2 | 96 ×2 |
| Kyogre | 15 ×1 | 6 ×½ | 27 ×1 | 36 ×1 |
| Groudon | 23 ×1 | 54 ×2 | 42 ×1 | 51 ×1 |
| Rayquaza | 23 ×1 | 11 ×½ | 42 ×1 | 51 ×1 |
| **Mediana de daño** | 23 | 30 | 42 | 51 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Ho-Oh

Tipos: **Fire / Flying** · HP 181 · Atk 150 · Def 110 · SpA 130 · SpD 174 · Vel 110

| Rival | Básica: Golpe Ala<br>Flying · Fís · Pot 55 | Habilidad 1: Pájaro Osado<br>Flying · Fís · Pot 100 | Habilidad 2: Recuperación<br>Fire · Estado · Pot — | Definitiva: Fuego Sagrado<br>Fire · Fís · Pot 50/s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 102 ×2 | 186 ×2 | Estado | 136 ×2 |
| Charmander | 56 ×1 | 102 ×1 | Estado | 37 ×½ |
| Squirtle | 42 ×1 | 76 ×1 | Estado | 25 ×½ |
| Pikachu | 29 ×½ | 54 ×½ | Estado | 77 ×1 |
| Gengar | 45 ×1 | 80 ×1 | Estado | 57 ×1 |
| Voltorb | 25 ×½ | 46 ×½ | Estado | 68 ×1 |
| Eevee | 51 ×1 | 92 ×1 | Estado | 68 ×1 |
| Lucario | 39 ×1 | 72 ×1 | Estado | 100 ×2 |
| Greninja | 40 ×1 | 74 ×1 | Estado | 25 ×½ |
| Mewtwo | 33 ×1 | 59 ×1 | Estado | 41 ×1 |
| Mew | 30 ×1 | 54 ×1 | Estado | 37 ×1 |
| Onix | 10 ×½ | 18 ×½ | Estado | 13 ×½ |
| Scyther | 72 ×2 | 130 ×2 | Estado | 88 ×2 |
| Gyarados | 36 ×1 | 65 ×1 | Estado | 22 ×½ |
| Tyranitar | 13 ×½ | 25 ×½ | Estado | 16 ×½ |
| Articuno | 30 ×1 | 54 ×1 | Estado | 74 ×2 |
| Zapdos | 17 ×½ | 30 ×½ | Estado | 41 ×1 |
| Moltres | 33 ×1 | 59 ×1 | Estado | 19 ×½ |
| Raikou | 19 ×½ | 34 ×½ | Estado | 47 ×1 |
| Entei | 34 ×1 | 61 ×1 | Estado | 19 ×½ |
| Suicune | 26 ×1 | 48 ×1 | Estado | 16 ×½ |
| Lugia | 25 ×1 | 44 ×1 | Estado | 32 ×1 |
| Celebi | 60 ×2 | 108 ×2 | Estado | 74 ×2 |
| Kyogre | 33 ×1 | 59 ×1 | Estado | 19 ×½ |
| Groudon | 23 ×1 | 40 ×1 | Estado | 29 ×1 |
| Rayquaza | 33 ×1 | 59 ×1 | Estado | 19 ×½ |
| **Mediana de daño** | 33 | 59 | — | 37 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Gyarados

Tipos: **Water / Flying** · HP 170 · Atk 145 · Def 99 · SpA 80 · SpD 120 · Vel 101

| Rival | Básica: Acua Cola<br>Water · Fís · Pot 55 | Habilidad 1: Cascada<br>Water · Fís · Pot 70 | Habilidad 2: Triturar<br>Dark · Fís · Pot 85 | Definitiva: Dragoaliento<br>Dragon · Fís · Pot 150 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 25 ×½ | 32 ×½ | 74 ×1 | 129 ×1 |
| Charmander | 108 ×2 | 138 ×2 | 81 ×1 | 141 ×1 |
| Squirtle | 20 ×½ | 25 ×½ | 60 ×1 | 105 ×1 |
| Pikachu | 57 ×1 | 73 ×1 | 85 ×1 | 148 ×1 |
| Gengar | 43 ×1 | 54 ×1 | 126 ×2 | 111 ×1 |
| Voltorb | 50 ×1 | 63 ×1 | 73 ×1 | 127 ×1 |
| Eevee | 50 ×1 | 63 ×1 | 73 ×1 | 127 ×1 |
| Lucario | 38 ×1 | 49 ×1 | 28 ×½ | 49 ×½ |
| Greninja | 19 ×½ | 25 ×½ | 29 ×½ | 103 ×1 |
| Mewtwo | 31 ×1 | 39 ×1 | 94 ×2 | 82 ×1 |
| Mew | 29 ×1 | 37 ×1 | 86 ×2 | 74 ×1 |
| Onix | 76 ×4 | 100 ×4 | 29 ×1 | 50 ×1 |
| Scyther | 35 ×1 | 44 ×1 | 51 ×1 | 89 ×1 |
| Tyranitar | 52 ×2 | 68 ×2 | 19 ×½ | 69 ×1 |
| Articuno | 29 ×1 | 37 ×1 | 43 ×1 | 74 ×1 |
| Zapdos | 33 ×1 | 42 ×1 | 49 ×1 | 86 ×1 |
| Moltres | 62 ×2 | 78 ×2 | 47 ×1 | 82 ×1 |
| Raikou | 36 ×1 | 47 ×1 | 54 ×1 | 94 ×1 |
| Entei | 66 ×2 | 84 ×2 | 49 ×1 | 86 ×1 |
| Suicune | 12 ×½ | 16 ×½ | 38 ×1 | 66 ×1 |
| Lugia | 24 ×1 | 29 ×1 | 70 ×2 | 60 ×1 |
| Ho-Oh | 62 ×2 | 78 ×2 | 47 ×1 | 82 ×1 |
| Celebi | 14 ×½ | 18 ×½ | 86 ×2 | 74 ×1 |
| Kyogre | 15 ×½ | 19 ×½ | 47 ×1 | 82 ×1 |
| Groudon | 44 ×2 | 54 ×2 | 32 ×1 | 56 ×1 |
| Rayquaza | 15 ×½ | 19 ×½ | 47 ×1 | 164 ×2 |
| **Mediana de daño** | 36 | 46 | 50 | 84 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Suicune

Tipos: **Water** · HP 175 · Atk 95 · Def 135 · SpA 110 · SpD 135 · Vel 105

| Rival | Básica: Golpe Cuerpo<br>Normal · Fís · Pot 80 | Habilidad 1: Chorro de Agua<br>Water · Esp · Pot 68 | Habilidad 2: Rayo Hielo<br>Ice · Esp · Pot 90 | Definitiva: Frío Polar<br>Ice · Esp · Pot 140 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 46 ×1 | 19 ×½ | 98 ×2 | 148 ×2 |
| Charmander | 50 ×1 | 94 ×2 | 29 ×½ | 45 ×½ |
| Squirtle | 37 ×1 | 19 ×½ | 24 ×½ | 37 ×½ |
| Pikachu | 52 ×1 | 47 ×1 | 59 ×1 | 90 ×1 |
| Gengar | 0 ×0 | 34 ×1 | 43 ×1 | 67 ×1 |
| Voltorb | 45 ×1 | 43 ×1 | 55 ×1 | 85 ×1 |
| Eevee | 45 ×1 | 38 ×1 | 49 ×1 | 74 ×1 |
| Lucario | 18 ×½ | 36 ×1 | 23 ×½ | 35 ×½ |
| Greninja | 37 ×1 | 18 ×½ | 22 ×½ | 35 ×½ |
| Mewtwo | 29 ×1 | 29 ×1 | 37 ×1 | 58 ×1 |
| Mew | 26 ×1 | 27 ×1 | 35 ×1 | 53 ×1 |
| Onix | 9 ×½ | 200 ×4 | 126 ×2 | 196 ×2 |
| Scyther | 32 ×1 | 32 ×1 | 82 ×2 | 126 ×2 |
| Gyarados | 32 ×1 | 13 ×½ | 35 ×1 | 53 ×1 |
| Tyranitar | 12 ×½ | 54 ×2 | 35 ×1 | 53 ×1 |
| Articuno | 26 ×1 | 23 ×1 | 29 ×1 | 44 ×1 |
| Zapdos | 30 ×1 | 29 ×1 | 74 ×2 | 116 ×2 |
| Moltres | 29 ×1 | 62 ×2 | 39 ×1 | 61 ×1 |
| Raikou | 34 ×1 | 27 ×1 | 35 ×1 | 53 ×1 |
| Entei | 30 ×1 | 68 ×2 | 21 ×½ | 33 ×½ |
| Lugia | 22 ×1 | 18 ×1 | 48 ×2 | 74 ×2 |
| Ho-Oh | 29 ×1 | 36 ×2 | 24 ×1 | 37 ×1 |
| Celebi | 26 ×1 | 13 ×½ | 70 ×2 | 106 ×2 |
| Kyogre | 29 ×1 | 10 ×½ | 13 ×½ | 20 ×½ |
| Groudon | 20 ×1 | 58 ×2 | 74 ×2 | 116 ×2 |
| Rayquaza | 29 ×1 | 14 ×½ | 148 ×4 | 233 ×4 |
| **Mediana de daño** | 29 | 31 | 38 | 60 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Kyogre

Tipos: **Water** · HP 175 · Atk 120 · Def 110 · SpA 170 · SpD 160 · Vel 110

| Rival | Básica: Ráfaga Marina<br>Water · Esp · Pot 46 | Habilidad 1: Remolino Marino<br>Water · Esp · Pot 34/s | Habilidad 2: Aguas Curativas<br>Water · Estado · Pot — | Definitiva: Pulso Primigenio<br>Water · Esp · Pot 160/s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 19 ×½ | 31 ×½ | Estado | 67 ×½ |
| Charmander | 98 ×2 | 164 ×2 | Estado | 331 ×2 |
| Squirtle | 19 ×½ | 31 ×½ | Estado | 69 ×½ |
| Pikachu | 49 ×1 | 82 ×1 | Estado | 165 ×1 |
| Gengar | 36 ×1 | 61 ×1 | Estado | 120 ×1 |
| Voltorb | 45 ×1 | 72 ×1 | Estado | 153 ×1 |
| Eevee | 39 ×1 | 62 ×1 | Estado | 136 ×1 |
| Lucario | 38 ×1 | 62 ×1 | Estado | 129 ×1 |
| Greninja | 18 ×½ | 30 ×½ | Estado | 63 ×½ |
| Mewtwo | 31 ×1 | 52 ×1 | Estado | 104 ×1 |
| Mew | 28 ×1 | 47 ×1 | Estado | 96 ×1 |
| Onix | 204 ×4 | 348 ×4 | Estado | 717 ×4 |
| Scyther | 34 ×1 | 56 ×1 | Estado | 114 ×1 |
| Gyarados | 14 ×½ | 21 ×½ | Estado | 47 ×½ |
| Tyranitar | 56 ×2 | 94 ×2 | Estado | 192 ×2 |
| Articuno | 24 ×1 | 37 ×1 | Estado | 78 ×1 |
| Zapdos | 31 ×1 | 52 ×1 | Estado | 104 ×1 |
| Moltres | 64 ×2 | 112 ×2 | Estado | 216 ×2 |
| Raikou | 28 ×1 | 47 ×1 | Estado | 96 ×1 |
| Entei | 72 ×2 | 122 ×2 | Estado | 241 ×2 |
| Suicune | 12 ×½ | 21 ×½ | Estado | 43 ×½ |
| Lugia | 19 ×1 | 32 ×1 | Estado | 66 ×1 |
| Ho-Oh | 38 ×2 | 64 ×2 | Estado | 132 ×2 |
| Celebi | 14 ×½ | 21 ×½ | Estado | 47 ×½ |
| Groudon | 62 ×2 | 104 ×2 | Estado | 208 ×2 |
| Rayquaza | 15 ×½ | 26 ×½ | Estado | 51 ×½ |
| **Mediana de daño** | 33 | 54 | — | 109 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Rayquaza

Tipos: **Dragon / Flying** · HP 180 · Atk 170 · Def 110 · SpA 170 · SpD 110 · Vel 115

| Rival | Básica: Garra Dragón<br>Dragon · Fís · Pot 50 | Habilidad 1: Vuelo Dragón<br>Flying · Fís · Pot 70 | Habilidad 2: Furia Dragón<br>Dragon · Esp · Pot 85 | Definitiva: Ascenso Draco<br>Flying · Fís · Pot 130 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 53 ×1 | 148 ×2 | 73 ×1 | 275 ×2 |
| Charmander | 58 ×1 | 81 ×1 | 89 ×1 | 151 ×1 |
| Squirtle | 44 ×1 | 60 ×1 | 74 ×1 | 112 ×1 |
| Pikachu | 61 ×1 | 43 ×½ | 89 ×1 | 79 ×½ |
| Gengar | 46 ×1 | 64 ×1 | 65 ×1 | 118 ×1 |
| Voltorb | 52 ×1 | 36 ×½ | 82 ×1 | 67 ×½ |
| Eevee | 52 ×1 | 73 ×1 | 73 ×1 | 135 ×1 |
| Lucario | 20 ×½ | 57 ×1 | 34 ×½ | 106 ×1 |
| Greninja | 42 ×1 | 59 ×1 | 68 ×1 | 109 ×1 |
| Mewtwo | 34 ×1 | 47 ×1 | 56 ×1 | 87 ×1 |
| Mew | 31 ×1 | 43 ×1 | 51 ×1 | 79 ×1 |
| Onix | 21 ×1 | 14 ×½ | 95 ×1 | 26 ×½ |
| Scyther | 37 ×1 | 102 ×2 | 63 ×1 | 190 ×2 |
| Gyarados | 37 ×1 | 51 ×1 | 51 ×1 | 96 ×1 |
| Tyranitar | 28 ×1 | 19 ×½ | 51 ×1 | 36 ×½ |
| Articuno | 31 ×1 | 43 ×1 | 43 ×1 | 79 ×1 |
| Zapdos | 35 ×1 | 24 ×½ | 56 ×1 | 45 ×½ |
| Moltres | 34 ×1 | 47 ×1 | 59 ×1 | 87 ×1 |
| Raikou | 38 ×1 | 27 ×½ | 51 ×1 | 50 ×½ |
| Entei | 35 ×1 | 49 ×1 | 65 ×1 | 90 ×1 |
| Suicune | 27 ×1 | 38 ×1 | 47 ×1 | 71 ×1 |
| Lugia | 25 ×1 | 34 ×1 | 36 ×1 | 64 ×1 |
| Ho-Oh | 34 ×1 | 47 ×1 | 36 ×1 | 87 ×1 |
| Celebi | 31 ×1 | 86 ×2 | 51 ×1 | 158 ×2 |
| Kyogre | 34 ×1 | 47 ×1 | 38 ×1 | 87 ×1 |
| Groudon | 24 ×1 | 32 ×1 | 56 ×1 | 59 ×1 |
| **Mediana de daño** | 35 | 47 | 56 | 87 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Medianas por Pokémon

Resumen de las medianas de cada sección. `Combo` es la mediana del daño de los cuatro ataques sumados contra cada rival; las habilidades de estado cuentan como 0 en esa columna.

| Pokémon | Básica | Habilidad 1 | Habilidad 2 | Definitiva | Combo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pikachu | 16 | 18 | 24 | 43 | 94 |
| Voltorb | 21 | 20 | — | 70 | 104 |
| Gengar | 15 | 39 | 27 | 51 | 128 |
| Bulbasaur | 15 | — | 31 | 49 | 95 |
| Charmander | 15 | 20 | 29 | 38 | 103 |
| Squirtle | 14 | 20 | 24 | 41 | 95 |
| Lucario | 19 | 27 | 24 | 51 | 119 |
| Greninja | 22 | 33 | 25 | 47 | 137 |
| Articuno | 24 | 42 | 26 | 47 | 138 |
| Zapdos | 26 | — | 51 | 98 | 179 |
| Moltres | 26 | 36 | 31 | 54 | 143 |
| Mewtwo | 31 | — | 54 | 68 | 153 |
| Mew | 22 | — | 39 | — | 61 |
| Scyther | 19 | 31 | — | 56 | 110 |
| Tyranitar | 34 | 47 | 22 | 74 | 198 |
| Onix | 23 | 30 | 23 | 39 | 133 |
| Groudon | 29 | 27 | 49 | 74 | 181 |
| Celebi | 19 | 37 | — | 50 | 107 |
| Lugia | 23 | 30 | 42 | 51 | 148 |
| Ho-Oh | 33 | 59 | — | 37 | 128 |
| Gyarados | 36 | 46 | 50 | 84 | 229 |
| Suicune | 29 | 31 | 38 | 60 | 158 |
| Kyogre | 33 | 54 | — | 109 | 196 |
| Rayquaza | 35 | 47 | 56 | 87 | 226 |

## Pokémon sin moveset

Estas especies del roster todavía no tienen ataques asignados en `MOVESETS`, así que no pueden usarse como atacantes. Sí aparecen como rivales en las tablas anteriores porque el daño recibido solo depende de sus tipos y estadísticas.

| Pokémon | Tipos |
| --- | --- |
| Eevee | Normal |
| Raikou | Electric |
| Entei | Fire |

## Cobertura

Atacantes con moveset asignado: **24** de 27 especies del roster. Los rivales incluyen las 27 especies, tengan o no moveset, porque el daño solo depende de sus tipos y estadísticas.
