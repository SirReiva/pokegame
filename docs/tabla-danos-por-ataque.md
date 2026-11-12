# Tabla de daño por Pokémon y ataque

> Generado automáticamente por `node scripts/generate-damage-matrix.mjs` a partir de `abilities.ts`, `pokedex.ts`, `combat.ts`, `typeChart.ts` y el manifiesto de sprites. No editar a mano.

## Cómo leer las tablas

- **Agrupación**: una sección por Pokémon atacante y una fila por rival. Cada columna es uno de sus cuatro ataques.
- **Celda**: daño esperado de un lanzamiento completo y, al lado, la efectividad de ese tipo contra el rival.
- **Daño esperado**: nivel 50, IV 31, EV 0, naturaleza neutra, sin buffs, random medio 0,925, crítico 1/24 (×1,5). STAB incluido.
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
| Bulbasaur | 26 ×1 | 28 ×1 | 18 ×½ | 34 ×½ |
| Charmander | 28 ×1 | 31 ×1 | 44 ×1 | 83 ×1 |
| Squirtle | 21 ×1 | 23 ×1 | 74 ×2 | 137 ×2 |
| Gengar | 0 ×0 | 0 ×0 | 34 ×1 | 61 ×1 |
| Voltorb | 25 ×1 | 28 ×1 | 20 ×½ | 38 ×½ |
| Eevee | 25 ×1 | 28 ×1 | 37 ×1 | 68 ×1 |
| Lucario | 10 ×½ | 11 ×½ | 35 ×1 | 64 ×1 |
| Greninja | 20 ×1 | 22 ×1 | 69 ×2 | 129 ×2 |
| Mewtwo | 16 ×1 | 18 ×1 | 29 ×1 | 53 ×1 |
| Mew | 15 ×1 | 16 ×1 | 26 ×1 | 49 ×1 |
| Onix | 5 ×½ | 6 ×½ | 0 ×0 | 0 ×0 |
| Scyther | 18 ×1 | 19 ×1 | 63 ×2 | 117 ×2 |
| Gyarados | 18 ×1 | 20 ×1 | 102 ×4 | 196 ×4 |
| Tyranitar | 6 ×½ | 7 ×½ | 26 ×1 | 49 ×1 |
| Articuno | 15 ×1 | 16 ×1 | 43 ×2 | 80 ×2 |
| Zapdos | 17 ×1 | 18 ×1 | 29 ×1 | 53 ×1 |
| Moltres | 16 ×1 | 18 ×1 | 61 ×2 | 112 ×2 |
| Raikou | 19 ×1 | 20 ×1 | 12 ×½ | 25 ×½ |
| Entei | 17 ×1 | 18 ×1 | 34 ×1 | 61 ×1 |
| Suicune | 13 ×1 | 14 ×1 | 45 ×2 | 86 ×2 |
| Lugia | 12 ×1 | 13 ×1 | 37 ×2 | 69 ×2 |
| Ho-Oh | 16 ×1 | 18 ×1 | 37 ×2 | 69 ×2 |
| Celebi | 15 ×1 | 16 ×1 | 12 ×½ | 25 ×½ |
| Kyogre | 16 ×1 | 18 ×1 | 39 ×2 | 74 ×2 |
| Groudon | 12 ×1 | 12 ×1 | 0 ×0 | 0 ×0 |
| Rayquaza | 16 ×1 | 18 ×1 | 29 ×1 | 53 ×1 |
| **Mediana de daño** | 16 | 18 | 34 | 63 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Voltorb

Tipos: **Electric** · HP 115 · Atk 50 · Def 70 · SpA 75 · SpD 75 · Vel 120

| Rival | Básica: Chispa<br>Electric · Fís · Pot 80 | Habilidad 1: Rollout<br>Normal · Fís · Pot 100 | Habilidad 2: Onda Trueno<br>Electric · Estado · Pot — | Definitiva: Explosión<br>Electric · Esp · Pot 200 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 18 ×½ | 31 ×1 | Estado | 55 ×½ |
| Charmander | 40 ×1 | 34 ×1 | Estado | 135 ×1 |
| Squirtle | 61 ×2 | 25 ×1 | Estado | 227 ×2 |
| Pikachu | 21 ×½ | 36 ×1 | Estado | 67 ×½ |
| Gengar | 34 ×1 | 0 ×0 | Estado | 99 ×1 |
| Eevee | 37 ×1 | 31 ×1 | Estado | 111 ×1 |
| Lucario | 29 ×1 | 12 ×½ | Estado | 105 ×1 |
| Greninja | 61 ×2 | 25 ×1 | Estado | 208 ×2 |
| Mewtwo | 25 ×1 | 20 ×1 | Estado | 87 ×1 |
| Mew | 22 ×1 | 18 ×1 | Estado | 80 ×1 |
| Onix | 0 ×0 | 6 ×½ | Estado (×0) | 0 ×0 |
| Scyther | 51 ×2 | 22 ×1 | Estado | 190 ×2 |
| Gyarados | 102 ×4 | 22 ×1 | Estado | 319 ×4 |
| Tyranitar | 19 ×1 | 8 ×½ | Estado | 80 ×1 |
| Articuno | 43 ×2 | 18 ×1 | Estado | 131 ×2 |
| Zapdos | 25 ×1 | 20 ×1 | Estado | 87 ×1 |
| Moltres | 49 ×2 | 20 ×1 | Estado | 180 ×2 |
| Raikou | 13 ×½ | 23 ×1 | Estado | 40 ×½ |
| Entei | 25 ×1 | 20 ×1 | Estado | 99 ×1 |
| Suicune | 39 ×2 | 16 ×1 | Estado | 141 ×2 |
| Lugia | 37 ×2 | 14 ×1 | Estado | 110 ×2 |
| Ho-Oh | 49 ×2 | 20 ×1 | Estado | 110 ×2 |
| Celebi | 10 ×½ | 18 ×1 | Estado | 40 ×½ |
| Kyogre | 49 ×2 | 20 ×1 | Estado | 119 ×2 |
| Groudon | 0 ×0 | 13 ×1 | Estado (×0) | 0 ×0 |
| Rayquaza | 25 ×1 | 20 ×1 | Estado | 87 ×1 |
| **Mediana de daño** | 31 | 20 | — | 102 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Gengar

Tipos: **Ghost / Poison** · HP 135 · Atk 85 · Def 80 · SpA 150 · SpD 95 · Vel 130

| Rival | Básica: Lengüetazo<br>Ghost · Fís · Pot 42 | Habilidad 1: Bola Sombra<br>Ghost · Esp · Pot 62 | Habilidad 2: Bomba Lodo<br>Poison · Esp · Pot 20/s | Definitiva: Come Sueños<br>Ghost · Esp · Pot 80 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 34 ×1 | 70 ×1 | 49 ×1 | 90 ×1 |
| Charmander | 37 ×1 | 84 ×1 | 64 ×1 | 108 ×1 |
| Squirtle | 28 ×1 | 70 ×1 | 49 ×1 | 90 ×1 |
| Pikachu | 38 ×1 | 84 ×1 | 64 ×1 | 108 ×1 |
| Voltorb | 34 ×1 | 78 ×1 | 54 ×1 | 101 ×1 |
| Eevee | 0 ×0 | 0 ×0 | 49 ×1 | 0 ×0 |
| Lucario | 26 ×1 | 65 ×1 | 0 ×0 | 84 ×1 |
| Greninja | 13 ×½ | 32 ×½ | 49 ×1 | 42 ×½ |
| Mewtwo | 43 ×2 | 110 ×2 | 39 ×1 | 141 ×2 |
| Mew | 39 ×2 | 100 ×2 | 34 ×1 | 129 ×2 |
| Onix | 13 ×1 | 90 ×1 | 16 ×¼ | 116 ×1 |
| Scyther | 23 ×1 | 58 ×1 | 39 ×1 | 75 ×1 |
| Gyarados | 23 ×1 | 50 ×1 | 34 ×1 | 64 ×1 |
| Tyranitar | 9 ×½ | 25 ×½ | 16 ×½ | 32 ×½ |
| Articuno | 19 ×1 | 41 ×1 | 24 ×1 | 53 ×1 |
| Zapdos | 22 ×1 | 55 ×1 | 39 ×1 | 70 ×1 |
| Moltres | 22 ×1 | 56 ×1 | 39 ×1 | 74 ×1 |
| Raikou | 25 ×1 | 50 ×1 | 34 ×1 | 64 ×1 |
| Entei | 22 ×1 | 62 ×1 | 39 ×1 | 80 ×1 |
| Suicune | 18 ×1 | 44 ×1 | 24 ×1 | 56 ×1 |
| Lugia | 33 ×2 | 69 ×2 | 18 ×1 | 88 ×2 |
| Ho-Oh | 22 ×1 | 35 ×1 | 18 ×1 | 44 ×1 |
| Celebi | 39 ×2 | 100 ×2 | 67 ×2 | 129 ×2 |
| Kyogre | 22 ×1 | 37 ×1 | 24 ×1 | 49 ×1 |
| Groudon | 15 ×1 | 55 ×1 | 18 ×½ | 70 ×1 |
| Rayquaza | 22 ×1 | 55 ×1 | 39 ×1 | 70 ×1 |
| **Mediana de daño** | 22 | 57 | 39 | 74 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Bulbasaur

Tipos: **Grass / Poison** · HP 120 · Atk 69 · Def 69 · SpA 85 · SpD 85 · Vel 65

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 | Habilidad 1: Paralizador<br>Grass · Estado · Pot — | Habilidad 2: Hoja Afilada<br>Grass · Esp · Pot 100 | Definitiva: Lluevehojas<br>Grass · Esp · Pot 160 |
| --- | ---: | ---: | ---: | ---: |
| Charmander | 26 ×1 | Estado | 38 ×½ | 61 ×½ |
| Squirtle | 19 ×1 | Estado | 129 ×2 | 204 ×2 |
| Pikachu | 27 ×1 | Estado | 77 ×1 | 123 ×1 |
| Gengar | 0 ×0 | Estado | 28 ×½ | 45 ×½ |
| Voltorb | 23 ×1 | Estado | 71 ×1 | 113 ×1 |
| Eevee | 23 ×1 | Estado | 64 ×1 | 101 ×1 |
| Lucario | 9 ×½ | Estado | 30 ×½ | 47 ×½ |
| Greninja | 19 ×1 | Estado | 119 ×2 | 186 ×2 |
| Mewtwo | 15 ×1 | Estado | 50 ×1 | 78 ×1 |
| Mew | 13 ×1 | Estado | 46 ×1 | 71 ×1 |
| Onix | 5 ×½ | Estado | 331 ×4 | 527 ×4 |
| Scyther | 16 ×1 | Estado | 13 ×¼ | 21 ×¼ |
| Gyarados | 16 ×1 | Estado | 46 ×1 | 71 ×1 |
| Tyranitar | 6 ×½ | Estado | 92 ×2 | 143 ×2 |
| Articuno | 13 ×1 | Estado | 18 ×½ | 30 ×½ |
| Zapdos | 15 ×1 | Estado | 25 ×½ | 39 ×½ |
| Moltres | 15 ×1 | Estado | 12 ×¼ | 19 ×¼ |
| Raikou | 17 ×1 | Estado | 46 ×1 | 71 ×1 |
| Entei | 15 ×1 | Estado | 28 ×½ | 45 ×½ |
| Suicune | 12 ×1 | Estado | 80 ×2 | 129 ×2 |
| Lugia | 12 ×1 | Estado | 15 ×½ | 25 ×½ |
| Ho-Oh | 15 ×1 | Estado | 7 ×¼ | 12 ×¼ |
| Celebi | 13 ×1 | Estado | 22 ×½ | 36 ×½ |
| Kyogre | 15 ×1 | Estado | 69 ×2 | 110 ×2 |
| Groudon | 11 ×1 | Estado | 100 ×2 | 155 ×2 |
| Rayquaza | 15 ×1 | Estado | 12 ×¼ | 19 ×¼ |
| **Mediana de daño** | 15 | — | 46 | 71 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Charmander

Tipos: **Fire** · HP 114 · Atk 72 · Def 63 · SpA 80 · SpD 70 · Vel 85

| Rival | Básica: Arañazo<br>Normal · Fís · Pot 55 | Habilidad 1: Giro Fuego<br>Fire · Esp · Pot 40/s | Habilidad 2: Lanzallamas<br>Fire · Esp · Pot 100 | Definitiva: Anillo Ígneo<br>Fire · Esp · Pot 130 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 25 ×1 | 93 ×2 | 119 ×2 | 153 ×2 |
| Squirtle | 20 ×1 | 21 ×½ | 30 ×½ | 39 ×½ |
| Pikachu | 29 ×1 | 65 ×1 | 74 ×1 | 93 ×1 |
| Gengar | 0 ×0 | 40 ×1 | 55 ×1 | 70 ×1 |
| Voltorb | 25 ×1 | 58 ×1 | 67 ×1 | 89 ×1 |
| Eevee | 25 ×1 | 46 ×1 | 59 ×1 | 77 ×1 |
| Lucario | 9 ×½ | 93 ×2 | 112 ×2 | 147 ×2 |
| Greninja | 20 ×1 | 21 ×½ | 28 ×½ | 37 ×½ |
| Mewtwo | 15 ×1 | 40 ×1 | 47 ×1 | 59 ×1 |
| Mew | 14 ×1 | 28 ×1 | 43 ×1 | 56 ×1 |
| Onix | 5 ×½ | 32 ×½ | 39 ×½ | 50 ×½ |
| Scyther | 17 ×1 | 80 ×2 | 104 ×2 | 131 ×2 |
| Gyarados | 17 ×1 | 13 ×½ | 21 ×½ | 28 ×½ |
| Tyranitar | 6 ×½ | 13 ×½ | 21 ×½ | 28 ×½ |
| Articuno | 14 ×1 | 43 ×2 | 74 ×2 | 92 ×2 |
| Zapdos | 16 ×1 | 40 ×1 | 47 ×1 | 59 ×1 |
| Moltres | 15 ×1 | 19 ×½ | 25 ×½ | 31 ×½ |
| Raikou | 18 ×1 | 28 ×1 | 43 ×1 | 56 ×1 |
| Entei | 16 ×1 | 19 ×½ | 28 ×½ | 35 ×½ |
| Suicune | 12 ×1 | 13 ×½ | 18 ×½ | 25 ×½ |
| Lugia | 12 ×1 | 21 ×1 | 31 ×1 | 38 ×1 |
| Ho-Oh | 15 ×1 | 8 ×½ | 15 ×½ | 18 ×½ |
| Celebi | 14 ×1 | 56 ×2 | 86 ×2 | 112 ×2 |
| Kyogre | 15 ×1 | 8 ×½ | 16 ×½ | 20 ×½ |
| Groudon | 11 ×1 | 40 ×1 | 47 ×1 | 59 ×1 |
| Rayquaza | 15 ×1 | 19 ×½ | 24 ×½ | 30 ×½ |
| **Mediana de daño** | 15 | 30 | 43 | 56 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Squirtle

Tipos: **Water** · HP 119 · Atk 68 · Def 85 · SpA 70 · SpD 84 · Vel 63

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 | Habilidad 1: Acua Jet<br>Water · Fís · Pot 65 | Habilidad 2: Rayo Burbuja<br>Water · Esp · Pot 80 | Definitiva: Hidrobomba<br>Water · Esp · Pot 140 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 23 ×1 | 20 ×½ | 20 ×½ | 37 ×½ |
| Charmander | 26 ×1 | 88 ×2 | 104 ×2 | 178 ×2 |
| Pikachu | 27 ×1 | 47 ×1 | 52 ×1 | 89 ×1 |
| Gengar | 0 ×0 | 37 ×1 | 37 ×1 | 65 ×1 |
| Voltorb | 23 ×1 | 40 ×1 | 47 ×1 | 83 ×1 |
| Eevee | 23 ×1 | 40 ×1 | 41 ×1 | 74 ×1 |
| Lucario | 9 ×½ | 32 ×1 | 40 ×1 | 68 ×1 |
| Greninja | 18 ×1 | 16 ×½ | 19 ×½ | 34 ×½ |
| Mewtwo | 14 ×1 | 26 ×1 | 34 ×1 | 56 ×1 |
| Mew | 13 ×1 | 25 ×1 | 31 ×1 | 52 ×1 |
| Onix | 5 ×½ | 65 ×4 | 220 ×4 | 380 ×4 |
| Scyther | 16 ×1 | 29 ×1 | 37 ×1 | 62 ×1 |
| Gyarados | 16 ×1 | 14 ×½ | 15 ×½ | 26 ×½ |
| Tyranitar | 6 ×½ | 43 ×2 | 61 ×2 | 104 ×2 |
| Articuno | 13 ×1 | 25 ×1 | 25 ×1 | 43 ×1 |
| Zapdos | 15 ×1 | 28 ×1 | 34 ×1 | 56 ×1 |
| Moltres | 14 ×1 | 51 ×2 | 69 ×2 | 119 ×2 |
| Raikou | 17 ×1 | 31 ×1 | 31 ×1 | 52 ×1 |
| Entei | 15 ×1 | 55 ×2 | 74 ×2 | 131 ×2 |
| Suicune | 12 ×1 | 10 ×½ | 13 ×½ | 22 ×½ |
| Lugia | 11 ×1 | 18 ×1 | 22 ×1 | 37 ×1 |
| Ho-Oh | 14 ×1 | 51 ×2 | 43 ×2 | 74 ×2 |
| Celebi | 13 ×1 | 12 ×½ | 15 ×½ | 26 ×½ |
| Kyogre | 14 ×1 | 12 ×½ | 11 ×½ | 18 ×½ |
| Groudon | 11 ×1 | 37 ×2 | 67 ×2 | 112 ×2 |
| Rayquaza | 14 ×1 | 12 ×½ | 16 ×½ | 28 ×½ |
| **Mediana de daño** | 14 | 30 | 35 | 59 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Lucario

Tipos: **Fighting / Steel** · HP 145 · Atk 130 · Def 90 · SpA 135 · SpD 90 · Vel 110

| Rival | Básica: Garra Metal<br>Steel · Fís · Pot 45 | Habilidad 1: Velocidad Extrema<br>Normal · Fís · Pot 55 | Habilidad 2: Esfera Aura<br>Fighting · Esp · Pot 60 | Definitiva: Combate Cercano<br>Fighting · Fís · Pot 125 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 55 ×1 | 44 ×1 | 30 ×½ | 74 ×½ |
| Charmander | 29 ×½ | 48 ×1 | 74 ×1 | 162 ×1 |
| Squirtle | 22 ×½ | 37 ×1 | 61 ×1 | 121 ×1 |
| Pikachu | 31 ×½ | 50 ×1 | 74 ×1 | 170 ×1 |
| Gengar | 47 ×1 | 0 ×0 | 0 ×0 | 0 ×0 |
| Voltorb | 27 ×½ | 43 ×1 | 68 ×1 | 147 ×1 |
| Eevee | 53 ×1 | 43 ×1 | 119 ×2 | 294 ×2 |
| Greninja | 21 ×½ | 36 ×1 | 112 ×2 | 235 ×2 |
| Mewtwo | 35 ×1 | 28 ×1 | 24 ×½ | 46 ×½ |
| Mew | 32 ×1 | 26 ×1 | 21 ×½ | 43 ×½ |
| Onix | 43 ×2 | 8 ×½ | 155 ×2 | 112 ×2 |
| Scyther | 37 ×1 | 31 ×1 | 12 ×¼ | 26 ×¼ |
| Gyarados | 18 ×½ | 31 ×1 | 21 ×½ | 52 ×½ |
| Tyranitar | 57 ×2 | 12 ×½ | 172 ×4 | 319 ×4 |
| Articuno | 63 ×2 | 26 ×1 | 37 ×1 | 86 ×1 |
| Zapdos | 18 ×½ | 29 ×1 | 24 ×½ | 49 ×½ |
| Moltres | 17 ×½ | 28 ×1 | 25 ×½ | 46 ×½ |
| Raikou | 19 ×½ | 33 ×1 | 43 ×1 | 108 ×1 |
| Entei | 18 ×½ | 29 ×1 | 55 ×1 | 98 ×1 |
| Suicune | 14 ×½ | 23 ×1 | 38 ×1 | 75 ×1 |
| Lugia | 26 ×1 | 20 ×1 | 7 ×¼ | 16 ×¼ |
| Ho-Oh | 17 ×½ | 28 ×1 | 15 ×½ | 46 ×½ |
| Celebi | 32 ×1 | 26 ×1 | 21 ×½ | 43 ×½ |
| Kyogre | 17 ×½ | 28 ×1 | 34 ×1 | 93 ×1 |
| Groudon | 25 ×1 | 19 ×1 | 47 ×1 | 64 ×1 |
| Rayquaza | 35 ×1 | 28 ×1 | 24 ×½ | 46 ×½ |
| **Mediana de daño** | 28 | 28 | 35 | 74 |
| **Efectividad mediana** | ×0.75 | ×1 | ×1 | ×1 |

## Greninja

Tipos: **Water / Dark** · HP 147 · Atk 115 · Def 87 · SpA 123 · SpD 91 · Vel 142

| Rival | Básica: Shuriken de Agua<br>Water · Esp · Pot 42 | Habilidad 1: Tajo Umbrío<br>Dark · Fís · Pot 65 | Habilidad 2: Sombra Vil<br>Dark · Fís · Pot 50 | Definitiva: Pulso Umbrío<br>Dark · Esp · Pot 85 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 18 ×½ | 68 ×1 | 53 ×1 | 78 ×1 |
| Charmander | 94 ×2 | 75 ×1 | 58 ×1 | 93 ×1 |
| Squirtle | 19 ×½ | 56 ×1 | 43 ×1 | 78 ×1 |
| Pikachu | 47 ×1 | 78 ×1 | 61 ×1 | 93 ×1 |
| Gengar | 35 ×1 | 119 ×2 | 92 ×2 | 141 ×2 |
| Voltorb | 44 ×1 | 67 ×1 | 53 ×1 | 89 ×1 |
| Eevee | 38 ×1 | 67 ×1 | 53 ×1 | 78 ×1 |
| Lucario | 37 ×1 | 27 ×½ | 20 ×½ | 37 ×½ |
| Mewtwo | 31 ×1 | 86 ×2 | 69 ×2 | 119 ×2 |
| Mew | 28 ×1 | 80 ×2 | 63 ×2 | 112 ×2 |
| Onix | 200 ×4 | 28 ×1 | 22 ×1 | 101 ×1 |
| Scyther | 34 ×1 | 47 ×1 | 37 ×1 | 67 ×1 |
| Gyarados | 13 ×½ | 49 ×1 | 37 ×1 | 56 ×1 |
| Tyranitar | 55 ×2 | 18 ×½ | 14 ×½ | 28 ×½ |
| Articuno | 23 ×1 | 40 ×1 | 32 ×1 | 46 ×1 |
| Zapdos | 31 ×1 | 46 ×1 | 37 ×1 | 59 ×1 |
| Moltres | 63 ×2 | 43 ×1 | 35 ×1 | 62 ×1 |
| Raikou | 28 ×1 | 50 ×1 | 38 ×1 | 56 ×1 |
| Entei | 69 ×2 | 46 ×1 | 37 ×1 | 70 ×1 |
| Suicune | 12 ×½ | 37 ×1 | 28 ×1 | 50 ×1 |
| Lugia | 19 ×1 | 63 ×2 | 49 ×2 | 76 ×2 |
| Ho-Oh | 39 ×2 | 43 ×1 | 35 ×1 | 38 ×1 |
| Celebi | 13 ×½ | 80 ×2 | 63 ×2 | 112 ×2 |
| Kyogre | 10 ×½ | 43 ×1 | 35 ×1 | 41 ×1 |
| Groudon | 61 ×2 | 31 ×1 | 23 ×1 | 59 ×1 |
| Rayquaza | 15 ×½ | 43 ×1 | 35 ×1 | 59 ×1 |
| **Mediana de daño** | 32 | 48 | 37 | 69 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Articuno

Tipos: **Ice / Flying** · HP 165 · Atk 105 · Def 120 · SpA 115 · SpD 145 · Vel 105

| Rival | Básica: Golpe Ala<br>Flying · Fís · Pot 55 | Habilidad 1: Rayo Hielo<br>Ice · Esp · Pot 90 | Habilidad 2: Viento Gélido<br>Ice · Esp · Pot 55 | Definitiva: Ventisca<br>Ice · Esp · Pot 100 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 106 ×2 | 153 ×2 | 94 ×2 | 172 ×2 |
| Charmander | 58 ×1 | 46 ×½ | 28 ×½ | 52 ×½ |
| Squirtle | 43 ×1 | 39 ×½ | 25 ×½ | 43 ×½ |
| Pikachu | 31 ×½ | 93 ×1 | 56 ×1 | 104 ×1 |
| Gengar | 46 ×1 | 68 ×1 | 43 ×1 | 77 ×1 |
| Voltorb | 27 ×½ | 87 ×1 | 55 ×1 | 96 ×1 |
| Eevee | 53 ×1 | 77 ×1 | 47 ×1 | 86 ×1 |
| Lucario | 41 ×1 | 37 ×½ | 22 ×½ | 40 ×½ |
| Greninja | 43 ×1 | 37 ×½ | 22 ×½ | 40 ×½ |
| Mewtwo | 35 ×1 | 59 ×1 | 37 ×1 | 67 ×1 |
| Mew | 32 ×1 | 55 ×1 | 35 ×1 | 61 ×1 |
| Onix | 10 ×½ | 202 ×2 | 123 ×2 | 223 ×2 |
| Scyther | 74 ×2 | 131 ×2 | 80 ×2 | 147 ×2 |
| Gyarados | 37 ×1 | 55 ×1 | 35 ×1 | 61 ×1 |
| Tyranitar | 14 ×½ | 55 ×1 | 35 ×1 | 61 ×1 |
| Zapdos | 18 ×½ | 119 ×2 | 74 ×2 | 135 ×2 |
| Moltres | 35 ×1 | 62 ×1 | 38 ×1 | 70 ×1 |
| Raikou | 18 ×½ | 55 ×1 | 35 ×1 | 61 ×1 |
| Entei | 37 ×1 | 34 ×½ | 21 ×½ | 38 ×½ |
| Suicune | 28 ×1 | 25 ×½ | 15 ×½ | 28 ×½ |
| Lugia | 25 ×1 | 76 ×2 | 45 ×2 | 86 ×2 |
| Ho-Oh | 35 ×1 | 38 ×1 | 23 ×1 | 43 ×1 |
| Celebi | 63 ×2 | 110 ×2 | 69 ×2 | 123 ×2 |
| Kyogre | 35 ×1 | 20 ×½ | 12 ×½ | 22 ×½ |
| Groudon | 23 ×1 | 119 ×2 | 74 ×2 | 135 ×2 |
| Rayquaza | 35 ×1 | 237 ×4 | 147 ×4 | 270 ×4 |
| **Mediana de daño** | 35 | 61 | 37 | 69 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Zapdos

Tipos: **Electric / Flying** · HP 165 · Atk 110 · Def 105 · SpA 145 · SpD 110 · Vel 120

| Rival | Básica: Pico Taladro<br>Flying · Fís · Pot 60 | Habilidad 1: Onda Trueno<br>Electric · Estado · Pot — | Habilidad 2: Descarga<br>Electric · Esp · Pot 75 | Definitiva: Trueno<br>Electric · Esp · Pot 145 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 123 ×2 | Estado | 40 ×½ | 77 ×½ |
| Charmander | 67 ×1 | Estado | 98 ×1 | 188 ×1 |
| Squirtle | 50 ×1 | Estado | 161 ×2 | 315 ×2 |
| Pikachu | 35 ×½ | Estado | 49 ×½ | 94 ×½ |
| Gengar | 53 ×1 | Estado | 74 ×1 | 139 ×1 |
| Voltorb | 30 ×½ | Estado | 46 ×½ | 88 ×½ |
| Eevee | 59 ×1 | Estado | 81 ×1 | 154 ×1 |
| Lucario | 47 ×1 | Estado | 77 ×1 | 147 ×1 |
| Greninja | 49 ×1 | Estado | 149 ×2 | 290 ×2 |
| Mewtwo | 38 ×1 | Estado | 62 ×1 | 121 ×1 |
| Mew | 37 ×1 | Estado | 56 ×1 | 111 ×1 |
| Onix | 12 ×½ | Estado (×0) | 0 ×0 | 0 ×0 |
| Scyther | 86 ×2 | Estado | 137 ×2 | 264 ×2 |
| Gyarados | 43 ×1 | Estado | 225 ×4 | 445 ×4 |
| Tyranitar | 16 ×½ | Estado | 56 ×1 | 111 ×1 |
| Articuno | 37 ×1 | Estado | 98 ×2 | 184 ×2 |
| Moltres | 38 ×1 | Estado | 131 ×2 | 253 ×2 |
| Raikou | 22 ×½ | Estado | 28 ×½ | 55 ×½ |
| Entei | 40 ×1 | Estado | 74 ×1 | 139 ×1 |
| Suicune | 32 ×1 | Estado | 104 ×2 | 196 ×2 |
| Lugia | 29 ×1 | Estado | 80 ×2 | 153 ×2 |
| Ho-Oh | 38 ×1 | Estado | 80 ×2 | 153 ×2 |
| Celebi | 74 ×2 | Estado | 28 ×½ | 55 ×½ |
| Kyogre | 38 ×1 | Estado | 86 ×2 | 165 ×2 |
| Groudon | 28 ×1 | Estado (×0) | 0 ×0 | 0 ×0 |
| Rayquaza | 38 ×1 | Estado | 62 ×1 | 121 ×1 |
| **Mediana de daño** | 38 | — | 75 | 143 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Moltres

Tipos: **Fire / Flying** · HP 165 · Atk 120 · Def 110 · SpA 145 · SpD 105 · Vel 110

| Rival | Básica: Ataque Aéreo<br>Flying · Fís · Pot 55 | Habilidad 1: Tajo Aéreo<br>Flying · Esp · Pot 65 | Habilidad 2: Onda Ígnea<br>Fire · Esp · Pot 60 | Definitiva: Ataque Celeste<br>Flying · Fís · Pot 115 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 123 ×2 | 141 ×2 | 131 ×2 | 253 ×2 |
| Charmander | 67 ×1 | 86 ×1 | 39 ×½ | 138 ×1 |
| Squirtle | 50 ×1 | 71 ×1 | 33 ×½ | 102 ×1 |
| Pikachu | 35 ×½ | 43 ×½ | 78 ×1 | 72 ×½ |
| Gengar | 53 ×1 | 62 ×1 | 58 ×1 | 108 ×1 |
| Voltorb | 30 ×½ | 40 ×½ | 75 ×1 | 61 ×½ |
| Eevee | 59 ×1 | 70 ×1 | 65 ×1 | 124 ×1 |
| Lucario | 47 ×1 | 67 ×1 | 123 ×2 | 96 ×1 |
| Greninja | 49 ×1 | 65 ×1 | 31 ×½ | 99 ×1 |
| Mewtwo | 38 ×1 | 55 ×1 | 50 ×1 | 80 ×1 |
| Mew | 37 ×1 | 50 ×1 | 46 ×1 | 74 ×1 |
| Onix | 12 ×½ | 46 ×½ | 42 ×½ | 25 ×½ |
| Scyther | 86 ×2 | 119 ×2 | 112 ×2 | 174 ×2 |
| Gyarados | 43 ×1 | 50 ×1 | 22 ×½ | 89 ×1 |
| Tyranitar | 16 ×½ | 25 ×½ | 22 ×½ | 34 ×½ |
| Articuno | 37 ×1 | 41 ×1 | 76 ×2 | 74 ×1 |
| Zapdos | 19 ×½ | 28 ×½ | 50 ×1 | 41 ×½ |
| Raikou | 22 ×½ | 25 ×½ | 46 ×1 | 46 ×½ |
| Entei | 40 ×1 | 62 ×1 | 29 ×½ | 83 ×1 |
| Suicune | 32 ×1 | 44 ×1 | 20 ×½ | 64 ×1 |
| Lugia | 29 ×1 | 35 ×1 | 34 ×1 | 58 ×1 |
| Ho-Oh | 38 ×1 | 35 ×1 | 16 ×½ | 80 ×1 |
| Celebi | 74 ×2 | 100 ×2 | 92 ×2 | 147 ×2 |
| Kyogre | 38 ×1 | 37 ×1 | 17 ×½ | 80 ×1 |
| Groudon | 28 ×1 | 55 ×1 | 50 ×1 | 55 ×1 |
| Rayquaza | 38 ×1 | 55 ×1 | 25 ×½ | 80 ×1 |
| **Mediana de daño** | 38 | 53 | 46 | 80 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Mewtwo

Tipos: **Psychic** · HP 181 · Atk 130 · Def 110 · SpA 174 · SpD 110 · Vel 150

| Rival | Básica: Telequinesis<br>Psychic · Esp · Pot 45 | Habilidad 1: Teletransporte<br>Psychic · Estado · Pot — | Habilidad 2: Psíquico<br>Psychic · Esp · Pot 80 | Definitiva: Psicoataque<br>Psychic · Esp · Pot 100 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 117 ×2 | Estado | 208 ×2 | 259 ×2 |
| Charmander | 71 ×1 | Estado | 126 ×1 | 156 ×1 |
| Squirtle | 59 ×1 | Estado | 104 ×1 | 132 ×1 |
| Pikachu | 71 ×1 | Estado | 126 ×1 | 156 ×1 |
| Gengar | 106 ×2 | Estado | 186 ×2 | 229 ×2 |
| Voltorb | 65 ×1 | Estado | 116 ×1 | 147 ×1 |
| Eevee | 58 ×1 | Estado | 104 ×1 | 130 ×1 |
| Lucario | 56 ×1 | Estado | 98 ×1 | 123 ×1 |
| Greninja | 0 ×0 | Estado (×0) | 0 ×0 | 0 ×0 |
| Mew | 20 ×½ | Estado | 37 ×½ | 46 ×½ |
| Onix | 77 ×1 | Estado | 135 ×1 | 168 ×1 |
| Scyther | 50 ×1 | Estado | 89 ×1 | 110 ×1 |
| Gyarados | 41 ×1 | Estado | 75 ×1 | 92 ×1 |
| Tyranitar | 0 ×0 | Estado (×0) | 0 ×0 | 0 ×0 |
| Articuno | 35 ×1 | Estado | 61 ×1 | 75 ×1 |
| Zapdos | 46 ×1 | Estado | 80 ×1 | 99 ×1 |
| Moltres | 47 ×1 | Estado | 84 ×1 | 104 ×1 |
| Raikou | 41 ×1 | Estado | 75 ×1 | 92 ×1 |
| Entei | 53 ×1 | Estado | 93 ×1 | 114 ×1 |
| Suicune | 37 ×1 | Estado | 65 ×1 | 81 ×1 |
| Lugia | 14 ×½ | Estado | 26 ×½ | 32 ×½ |
| Ho-Oh | 29 ×1 | Estado | 52 ×1 | 64 ×1 |
| Celebi | 20 ×½ | Estado | 37 ×½ | 46 ×½ |
| Kyogre | 32 ×1 | Estado | 56 ×1 | 68 ×1 |
| Groudon | 46 ×1 | Estado | 80 ×1 | 99 ×1 |
| Rayquaza | 46 ×1 | Estado | 80 ×1 | 99 ×1 |
| **Mediana de daño** | 46 | — | 80 | 99 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Mew

Tipos: **Psychic** · HP 175 · Atk 120 · Def 120 · SpA 120 · SpD 120 · Vel 120

| Rival | Básica: Golpe Psíquico<br>Psychic · Esp · Pot 45 | Habilidad 1: Agilidad<br>Psychic · Estado · Pot — | Habilidad 2: Premonición<br>Psychic · Esp · Pot 85 | Definitiva: Recuperación<br>Psychic · Estado · Pot — |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 80 ×2 | Estado | 149 ×2 | Estado |
| Charmander | 49 ×1 | Estado | 93 ×1 | Estado |
| Squirtle | 41 ×1 | Estado | 77 ×1 | Estado |
| Pikachu | 49 ×1 | Estado | 93 ×1 | Estado |
| Gengar | 74 ×2 | Estado | 137 ×2 | Estado |
| Voltorb | 46 ×1 | Estado | 86 ×1 | Estado |
| Eevee | 40 ×1 | Estado | 75 ×1 | Estado |
| Lucario | 38 ×1 | Estado | 71 ×1 | Estado |
| Greninja | 0 ×0 | Estado (×0) | 0 ×0 | Estado (×0) |
| Mewtwo | 15 ×½ | Estado | 29 ×½ | Estado |
| Onix | 53 ×1 | Estado | 99 ×1 | Estado |
| Scyther | 35 ×1 | Estado | 64 ×1 | Estado |
| Gyarados | 29 ×1 | Estado | 55 ×1 | Estado |
| Tyranitar | 0 ×0 | Estado (×0) | 0 ×0 | Estado (×0) |
| Articuno | 25 ×1 | Estado | 44 ×1 | Estado |
| Zapdos | 32 ×1 | Estado | 58 ×1 | Estado |
| Moltres | 34 ×1 | Estado | 61 ×1 | Estado |
| Raikou | 29 ×1 | Estado | 55 ×1 | Estado |
| Entei | 37 ×1 | Estado | 68 ×1 | Estado |
| Suicune | 26 ×1 | Estado | 49 ×1 | Estado |
| Lugia | 9 ×½ | Estado | 18 ×½ | Estado |
| Ho-Oh | 19 ×1 | Estado | 37 ×1 | Estado |
| Celebi | 14 ×½ | Estado | 28 ×½ | Estado |
| Kyogre | 22 ×1 | Estado | 41 ×1 | Estado |
| Groudon | 32 ×1 | Estado | 58 ×1 | Estado |
| Rayquaza | 32 ×1 | Estado | 58 ×1 | Estado |
| **Mediana de daño** | 32 | — | 58 | — |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Scyther

Tipos: **Bug / Flying** · HP 145 · Atk 130 · Def 100 · SpA 75 · SpD 100 · Vel 125

| Rival | Básica: Golpe Furia<br>Bug · Fís · Pot 45 | Habilidad 1: Corte Aéreo<br>Flying · Fís · Pot 60 | Habilidad 2: Danza Espada<br>Normal · Estado · Pot — | Definitiva: Tijera X<br>Bug · Fís · Pot 130 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 55 ×1 | 143 ×2 | Estado | 153 ×1 |
| Charmander | 29 ×½ | 78 ×1 | Estado | 85 ×½ |
| Squirtle | 44 ×1 | 58 ×1 | Estado | 126 ×1 |
| Pikachu | 61 ×1 | 41 ×½ | Estado | 176 ×1 |
| Gengar | 11 ×¼ | 61 ×1 | Estado (×0) | 33 ×¼ |
| Voltorb | 53 ×1 | 36 ×½ | Estado | 151 ×1 |
| Eevee | 53 ×1 | 71 ×1 | Estado | 151 ×1 |
| Lucario | 10 ×¼ | 56 ×1 | Estado | 29 ×¼ |
| Greninja | 86 ×2 | 56 ×1 | Estado | 245 ×2 |
| Mewtwo | 69 ×2 | 46 ×1 | Estado | 192 ×2 |
| Mew | 63 ×2 | 41 ×1 | Estado | 178 ×2 |
| Onix | 22 ×1 | 14 ×½ | Estado | 59 ×1 |
| Gyarados | 18 ×½ | 50 ×1 | Estado | 54 ×½ |
| Tyranitar | 57 ×2 | 18 ×½ | Estado | 165 ×2 |
| Articuno | 15 ×½ | 41 ×1 | Estado | 44 ×½ |
| Zapdos | 18 ×½ | 24 ×½ | Estado | 50 ×½ |
| Moltres | 8 ×¼ | 46 ×1 | Estado | 24 ×¼ |
| Raikou | 40 ×1 | 27 ×½ | Estado | 113 ×1 |
| Entei | 18 ×½ | 47 ×1 | Estado | 50 ×½ |
| Suicune | 29 ×1 | 37 ×1 | Estado | 80 ×1 |
| Lugia | 26 ×1 | 34 ×1 | Estado | 71 ×1 |
| Ho-Oh | 8 ×¼ | 46 ×1 | Estado | 24 ×¼ |
| Celebi | 127 ×4 | 82 ×2 | Estado | 355 ×4 |
| Kyogre | 35 ×1 | 46 ×1 | Estado | 96 ×1 |
| Groudon | 25 ×1 | 32 ×1 | Estado | 67 ×1 |
| Rayquaza | 17 ×½ | 46 ×1 | Estado | 48 ×½ |
| **Mediana de daño** | 29 | 46 | — | 82 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Tyranitar

Tipos: **Rock / Dark** · HP 175 · Atk 154 · Def 130 · SpA 115 · SpD 120 · Vel 81

| Rival | Básica: Triturar<br>Dark · Fís · Pot 50 | Habilidad 1: Avalancha<br>Rock · Fís · Pot 55 | Habilidad 2: Terremoto<br>Ground · Fís · Pot 18/s | Definitiva: Roca Afilada<br>Rock · Fís · Pot 90 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 71 ×1 | 39 ×½ | 38 ×1 | 63 ×½ |
| Charmander | 77 ×1 | 172 ×2 | 86 ×2 | 276 ×2 |
| Squirtle | 56 ×1 | 62 ×1 | 33 ×1 | 102 ×1 |
| Pikachu | 81 ×1 | 90 ×1 | 96 ×2 | 145 ×1 |
| Gengar | 123 ×2 | 34 ×½ | 65 ×2 | 55 ×½ |
| Voltorb | 70 ×1 | 77 ×1 | 76 ×2 | 126 ×1 |
| Eevee | 70 ×1 | 77 ×1 | 38 ×1 | 126 ×1 |
| Lucario | 28 ×½ | 14 ×¼ | 55 ×2 | 24 ×¼ |
| Greninja | 28 ×½ | 61 ×1 | 33 ×1 | 101 ×1 |
| Mewtwo | 88 ×2 | 49 ×1 | 22 ×1 | 80 ×1 |
| Mew | 82 ×2 | 46 ×1 | 22 ×1 | 74 ×1 |
| Onix | 28 ×1 | 15 ×½ | 25 ×2 | 25 ×½ |
| Scyther | 49 ×1 | 220 ×4 | 0 ×0 | 347 ×4 |
| Gyarados | 50 ×1 | 110 ×2 | 0 ×0 | 178 ×2 |
| Articuno | 41 ×1 | 184 ×4 | 0 ×0 | 294 ×4 |
| Zapdos | 47 ×1 | 104 ×2 | 0 ×0 | 168 ×2 |
| Moltres | 44 ×1 | 196 ×4 | 0 ×0 | 319 ×4 |
| Raikou | 52 ×1 | 56 ×1 | 55 ×2 | 93 ×1 |
| Entei | 47 ×1 | 104 ×2 | 45 ×2 | 168 ×2 |
| Suicune | 37 ×1 | 40 ×1 | 17 ×1 | 65 ×1 |
| Lugia | 67 ×2 | 74 ×2 | 0 ×0 | 117 ×2 |
| Ho-Oh | 44 ×1 | 196 ×4 | 0 ×0 | 319 ×4 |
| Celebi | 82 ×2 | 46 ×1 | 11 ×½ | 74 ×1 |
| Kyogre | 44 ×1 | 49 ×1 | 22 ×1 | 80 ×1 |
| Groudon | 32 ×1 | 17 ×½ | 12 ×1 | 28 ×½ |
| Rayquaza | 44 ×1 | 98 ×2 | 0 ×0 | 159 ×2 |
| **Mediana de daño** | 50 | 68 | 22 | 109 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Onix

Tipos: **Rock / Ground** · HP 110 · Atk 65 · Def 180 · SpA 50 · SpD 65 · Vel 90

| Rival | Básica: Atadura<br>Rock · Fís · Pot 65 | Habilidad 1: Lanzarrocas<br>Rock · Fís · Pot 85 | Habilidad 2: Excavar<br>Ground · Fís · Pot 85 | Definitiva: Fisura<br>Ground · Fís · Pot 155 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 18 ×½ | 26 ×½ | 52 ×1 | 93 ×1 |
| Charmander | 86 ×2 | 112 ×2 | 112 ×2 | 202 ×2 |
| Squirtle | 32 ×1 | 41 ×1 | 41 ×1 | 75 ×1 |
| Pikachu | 44 ×1 | 58 ×1 | 117 ×2 | 210 ×2 |
| Gengar | 17 ×½ | 22 ×½ | 88 ×2 | 159 ×2 |
| Voltorb | 38 ×1 | 50 ×1 | 100 ×2 | 184 ×2 |
| Eevee | 38 ×1 | 50 ×1 | 50 ×1 | 92 ×1 |
| Lucario | 7 ×¼ | 9 ×¼ | 80 ×2 | 143 ×2 |
| Greninja | 32 ×1 | 40 ×1 | 40 ×1 | 74 ×1 |
| Mewtwo | 25 ×1 | 34 ×1 | 34 ×1 | 58 ×1 |
| Mew | 23 ×1 | 31 ×1 | 31 ×1 | 53 ×1 |
| Scyther | 110 ×4 | 147 ×4 | 0 ×0 | 0 ×0 |
| Gyarados | 55 ×2 | 74 ×2 | 0 ×0 | 0 ×0 |
| Tyranitar | 22 ×1 | 28 ×1 | 55 ×2 | 100 ×2 |
| Articuno | 90 ×4 | 123 ×4 | 0 ×0 | 0 ×0 |
| Zapdos | 51 ×2 | 69 ×2 | 0 ×0 | 0 ×0 |
| Moltres | 98 ×4 | 135 ×4 | 0 ×0 | 0 ×0 |
| Raikou | 29 ×1 | 37 ×1 | 74 ×2 | 135 ×2 |
| Entei | 51 ×2 | 69 ×2 | 69 ×2 | 123 ×2 |
| Suicune | 19 ×1 | 28 ×1 | 28 ×1 | 47 ×1 |
| Lugia | 37 ×2 | 49 ×2 | 0 ×0 | 0 ×0 |
| Ho-Oh | 98 ×4 | 135 ×4 | 0 ×0 | 0 ×0 |
| Celebi | 23 ×1 | 31 ×1 | 15 ×½ | 27 ×½ |
| Kyogre | 25 ×1 | 34 ×1 | 34 ×1 | 58 ×1 |
| Groudon | 9 ×½ | 11 ×½ | 23 ×1 | 40 ×1 |
| Rayquaza | 49 ×2 | 67 ×2 | 0 ×0 | 0 ×0 |
| **Mediana de daño** | 34 | 45 | 34 | 58 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Groudon

Tipos: **Ground** · HP 175 · Atk 170 · Def 160 · SpA 120 · SpD 110 · Vel 110

| Rival | Básica: Cuchillada<br>Normal · Fís · Pot 45 | Habilidad 1: Terremoto<br>Ground · Fís · Pot 18/s | Habilidad 2: Avalancha<br>Rock · Fís · Pot 55 | Definitiva: Filo del Abismo<br>Ground · Fís · Pot 100 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 47 ×1 | 64 ×1 | 29 ×½ | 154 ×1 |
| Charmander | 51 ×1 | 139 ×2 | 125 ×2 | 339 ×2 |
| Squirtle | 38 ×1 | 49 ×1 | 47 ×1 | 127 ×1 |
| Pikachu | 54 ×1 | 159 ×2 | 65 ×1 | 355 ×2 |
| Gengar | 0 ×0 | 109 ×2 | 25 ×½ | 266 ×2 |
| Voltorb | 47 ×1 | 129 ×2 | 56 ×1 | 302 ×2 |
| Eevee | 47 ×1 | 64 ×1 | 56 ×1 | 151 ×1 |
| Lucario | 18 ×½ | 98 ×2 | 10 ×¼ | 239 ×2 |
| Greninja | 38 ×1 | 49 ×1 | 46 ×1 | 123 ×1 |
| Mewtwo | 30 ×1 | 39 ×1 | 37 ×1 | 98 ×1 |
| Mew | 28 ×1 | 34 ×1 | 34 ×1 | 90 ×1 |
| Onix | 9 ×½ | 37 ×2 | 11 ×½ | 119 ×2 |
| Scyther | 33 ×1 | 0 ×0 | 159 ×4 | 0 ×0 |
| Gyarados | 34 ×1 | 0 ×0 | 80 ×2 | 0 ×0 |
| Tyranitar | 12 ×½ | 67 ×2 | 31 ×1 | 165 ×2 |
| Articuno | 28 ×1 | 0 ×0 | 135 ×4 | 0 ×0 |
| Zapdos | 32 ×1 | 0 ×0 | 76 ×2 | 0 ×0 |
| Moltres | 30 ×1 | 0 ×0 | 147 ×4 | 0 ×0 |
| Raikou | 35 ×1 | 98 ×2 | 42 ×1 | 227 ×2 |
| Entei | 32 ×1 | 78 ×2 | 76 ×2 | 204 ×2 |
| Suicune | 25 ×1 | 24 ×1 | 30 ×1 | 80 ×1 |
| Lugia | 22 ×1 | 0 ×0 | 53 ×2 | 0 ×0 |
| Ho-Oh | 30 ×1 | 0 ×0 | 147 ×4 | 0 ×0 |
| Celebi | 28 ×1 | 16 ×½ | 34 ×1 | 45 ×½ |
| Kyogre | 30 ×1 | 39 ×1 | 37 ×1 | 98 ×1 |
| Rayquaza | 30 ×1 | 0 ×0 | 73 ×2 | 0 ×0 |
| **Mediana de daño** | 30 | 39 | 50 | 108 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Celebi

Tipos: **Psychic / Grass** · HP 175 · Atk 120 · Def 120 · SpA 120 · SpD 120 · Vel 120

| Rival | Básica: Hoja Mágica<br>Grass · Esp · Pot 45 | Habilidad 1: Rayo Solar<br>Grass · Esp · Pot 85 | Habilidad 2: Deseo<br>Psychic · Estado · Pot — | Definitiva: Futuro Siniestro<br>Psychic · Esp · Pot 105 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 9 ×¼ | 18 ×¼ | Estado | 186 ×2 |
| Charmander | 25 ×½ | 46 ×½ | Estado | 113 ×1 |
| Squirtle | 82 ×2 | 153 ×2 | Estado | 95 ×1 |
| Pikachu | 49 ×1 | 93 ×1 | Estado | 113 ×1 |
| Gengar | 18 ×½ | 34 ×½ | Estado | 168 ×2 |
| Voltorb | 46 ×1 | 86 ×1 | Estado | 105 ×1 |
| Eevee | 40 ×1 | 75 ×1 | Estado | 93 ×1 |
| Lucario | 18 ×½ | 36 ×½ | Estado | 89 ×1 |
| Greninja | 76 ×2 | 143 ×2 | Estado (×0) | 0 ×0 |
| Mewtwo | 32 ×1 | 58 ×1 | Estado | 37 ×½ |
| Mew | 29 ×1 | 55 ×1 | Estado | 34 ×½ |
| Onix | 212 ×4 | 396 ×4 | Estado | 123 ×1 |
| Scyther | 8 ×¼ | 15 ×¼ | Estado | 80 ×1 |
| Gyarados | 29 ×1 | 55 ×1 | Estado | 67 ×1 |
| Tyranitar | 57 ×2 | 110 ×2 | Estado (×0) | 0 ×0 |
| Articuno | 12 ×½ | 22 ×½ | Estado | 56 ×1 |
| Zapdos | 15 ×½ | 29 ×½ | Estado | 74 ×1 |
| Moltres | 8 ×¼ | 15 ×¼ | Estado | 75 ×1 |
| Raikou | 29 ×1 | 55 ×1 | Estado | 67 ×1 |
| Entei | 18 ×½ | 34 ×½ | Estado | 84 ×1 |
| Suicune | 51 ×2 | 98 ×2 | Estado | 59 ×1 |
| Lugia | 9 ×½ | 18 ×½ | Estado | 22 ×½ |
| Ho-Oh | 4 ×¼ | 9 ×¼ | Estado | 46 ×1 |
| Kyogre | 43 ×2 | 82 ×2 | Estado | 50 ×1 |
| Groudon | 63 ×2 | 117 ×2 | Estado | 74 ×1 |
| Rayquaza | 7 ×¼ | 14 ×¼ | Estado | 74 ×1 |
| **Mediana de daño** | 29 | 55 | — | 74 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Lugia

Tipos: **Psychic / Flying** · HP 181 · Atk 110 · Def 150 · SpA 110 · SpD 174 · Vel 130

| Rival | Básica: Onda Mental<br>Psychic · Esp · Pot 50 | Habilidad 1: Marea<br>Water · Esp · Pot 30/s | Habilidad 2: Ciclón<br>Flying · Esp · Pot 45/s | Definitiva: Aerochorro<br>Flying · Esp · Pot 120 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 82 ×2 | 16 ×½ | 168 ×2 | 196 ×2 |
| Charmander | 50 ×1 | 96 ×2 | 100 ×1 | 117 ×1 |
| Squirtle | 41 ×1 | 16 ×½ | 84 ×1 | 99 ×1 |
| Pikachu | 50 ×1 | 48 ×1 | 48 ×½ | 58 ×½ |
| Gengar | 74 ×2 | 33 ×1 | 79 ×1 | 89 ×1 |
| Voltorb | 47 ×1 | 43 ×1 | 47 ×½ | 55 ×½ |
| Eevee | 41 ×1 | 38 ×1 | 84 ×1 | 98 ×1 |
| Lucario | 38 ×1 | 38 ×1 | 84 ×1 | 93 ×1 |
| Greninja | 0 ×0 | 16 ×½ | 79 ×1 | 92 ×1 |
| Mewtwo | 16 ×½ | 28 ×1 | 64 ×1 | 75 ×1 |
| Mew | 15 ×½ | 28 ×1 | 64 ×1 | 70 ×1 |
| Onix | 55 ×1 | 212 ×4 | 53 ×½ | 64 ×½ |
| Scyther | 37 ×1 | 33 ×1 | 139 ×2 | 168 ×2 |
| Gyarados | 31 ×1 | 11 ×½ | 64 ×1 | 70 ×1 |
| Tyranitar | 0 ×0 | 55 ×2 | 32 ×½ | 35 ×½ |
| Articuno | 25 ×1 | 22 ×1 | 49 ×1 | 58 ×1 |
| Zapdos | 34 ×1 | 28 ×1 | 32 ×½ | 37 ×½ |
| Moltres | 35 ×1 | 55 ×2 | 69 ×1 | 80 ×1 |
| Raikou | 31 ×1 | 28 ×1 | 32 ×½ | 35 ×½ |
| Entei | 37 ×1 | 65 ×2 | 79 ×1 | 89 ×1 |
| Suicune | 26 ×1 | 11 ×½ | 54 ×1 | 62 ×1 |
| Ho-Oh | 19 ×1 | 35 ×2 | 39 ×1 | 49 ×1 |
| Celebi | 15 ×½ | 11 ×½ | 129 ×2 | 141 ×2 |
| Kyogre | 23 ×1 | 6 ×½ | 39 ×1 | 53 ×1 |
| Groudon | 34 ×1 | 55 ×2 | 64 ×1 | 75 ×1 |
| Rayquaza | 34 ×1 | 11 ×½ | 64 ×1 | 75 ×1 |
| **Mediana de daño** | 34 | 30 | 64 | 75 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Ho-Oh

Tipos: **Fire / Flying** · HP 181 · Atk 150 · Def 110 · SpA 130 · SpD 174 · Vel 110

| Rival | Básica: Golpe Ala<br>Flying · Fís · Pot 55 | Habilidad 1: Pájaro Osado<br>Flying · Fís · Pot 100 | Habilidad 2: Recuperación<br>Fire · Estado · Pot — | Definitiva: Fuego Sagrado<br>Fire · Fís · Pot 50/s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 149 ×2 | 272 ×2 | Estado | 196 ×2 |
| Charmander | 83 ×1 | 150 ×1 | Estado | 55 ×½ |
| Squirtle | 61 ×1 | 111 ×1 | Estado | 39 ×½ |
| Pikachu | 43 ×½ | 79 ×½ | Estado | 113 ×1 |
| Gengar | 65 ×1 | 117 ×1 | Estado | 86 ×1 |
| Voltorb | 37 ×½ | 67 ×½ | Estado | 98 ×1 |
| Eevee | 75 ×1 | 135 ×1 | Estado | 98 ×1 |
| Lucario | 58 ×1 | 105 ×1 | Estado | 153 ×2 |
| Greninja | 59 ×1 | 108 ×1 | Estado | 38 ×½ |
| Mewtwo | 49 ×1 | 87 ×1 | Estado | 61 ×1 |
| Mew | 44 ×1 | 80 ×1 | Estado | 56 ×1 |
| Onix | 15 ×½ | 27 ×½ | Estado | 19 ×½ |
| Scyther | 106 ×2 | 190 ×2 | Estado | 135 ×2 |
| Gyarados | 53 ×1 | 95 ×1 | Estado | 33 ×½ |
| Tyranitar | 19 ×½ | 37 ×½ | Estado | 26 ×½ |
| Articuno | 44 ×1 | 80 ×1 | Estado | 112 ×2 |
| Zapdos | 25 ×½ | 45 ×½ | Estado | 61 ×1 |
| Moltres | 49 ×1 | 87 ×1 | Estado | 30 ×½ |
| Raikou | 28 ×½ | 49 ×½ | Estado | 71 ×1 |
| Entei | 50 ×1 | 90 ×1 | Estado | 30 ×½ |
| Suicune | 38 ×1 | 70 ×1 | Estado | 26 ×½ |
| Lugia | 37 ×1 | 64 ×1 | Estado | 49 ×1 |
| Celebi | 88 ×2 | 159 ×2 | Estado | 112 ×2 |
| Kyogre | 49 ×1 | 87 ×1 | Estado | 30 ×½ |
| Groudon | 34 ×1 | 59 ×1 | Estado | 43 ×1 |
| Rayquaza | 49 ×1 | 87 ×1 | Estado | 30 ×½ |
| **Mediana de daño** | 49 | 87 | — | 56 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Gyarados

Tipos: **Water / Flying** · HP 170 · Atk 145 · Def 99 · SpA 80 · SpD 120 · Vel 101

| Rival | Básica: Acua Cola<br>Water · Fís · Pot 55 | Habilidad 1: Cascada<br>Water · Fís · Pot 70 | Habilidad 2: Triturar<br>Dark · Fís · Pot 85 | Definitiva: Dragoaliento<br>Dragon · Fís · Pot 150 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 37 ×½ | 46 ×½ | 76 ×1 | 132 ×1 |
| Charmander | 159 ×2 | 202 ×2 | 83 ×1 | 144 ×1 |
| Squirtle | 30 ×½ | 37 ×½ | 61 ×1 | 107 ×1 |
| Pikachu | 84 ×1 | 107 ×1 | 87 ×1 | 151 ×1 |
| Gengar | 62 ×1 | 80 ×1 | 129 ×2 | 113 ×1 |
| Voltorb | 74 ×1 | 92 ×1 | 75 ×1 | 130 ×1 |
| Eevee | 74 ×1 | 92 ×1 | 75 ×1 | 130 ×1 |
| Lucario | 56 ×1 | 71 ×1 | 29 ×½ | 50 ×½ |
| Greninja | 29 ×½ | 37 ×½ | 30 ×½ | 105 ×1 |
| Mewtwo | 46 ×1 | 58 ×1 | 96 ×2 | 84 ×1 |
| Mew | 43 ×1 | 55 ×1 | 88 ×2 | 76 ×1 |
| Onix | 114 ×4 | 147 ×4 | 30 ×1 | 51 ×1 |
| Scyther | 52 ×1 | 64 ×1 | 52 ×1 | 91 ×1 |
| Tyranitar | 76 ×2 | 100 ×2 | 19 ×½ | 70 ×1 |
| Articuno | 43 ×1 | 55 ×1 | 44 ×1 | 76 ×1 |
| Zapdos | 49 ×1 | 61 ×1 | 50 ×1 | 88 ×1 |
| Moltres | 92 ×2 | 117 ×2 | 48 ×1 | 84 ×1 |
| Raikou | 53 ×1 | 68 ×1 | 55 ×1 | 96 ×1 |
| Entei | 98 ×2 | 123 ×2 | 50 ×1 | 88 ×1 |
| Suicune | 18 ×½ | 25 ×½ | 39 ×1 | 67 ×1 |
| Lugia | 35 ×1 | 43 ×1 | 71 ×2 | 61 ×1 |
| Ho-Oh | 92 ×2 | 117 ×2 | 48 ×1 | 84 ×1 |
| Celebi | 21 ×½ | 28 ×½ | 88 ×2 | 76 ×1 |
| Kyogre | 22 ×½ | 29 ×½ | 48 ×1 | 84 ×1 |
| Groudon | 63 ×2 | 80 ×2 | 33 ×1 | 57 ×1 |
| Rayquaza | 22 ×½ | 29 ×½ | 48 ×1 | 167 ×2 |
| **Mediana de daño** | 53 | 66 | 51 | 86 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Suicune

Tipos: **Water** · HP 175 · Atk 95 · Def 135 · SpA 110 · SpD 135 · Vel 105

| Rival | Básica: Golpe Cuerpo<br>Normal · Fís · Pot 80 | Habilidad 1: Chorro de Agua<br>Water · Esp · Pot 68 | Habilidad 2: Rayo Hielo<br>Ice · Esp · Pot 90 | Definitiva: Frío Polar<br>Ice · Esp · Pot 140 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 47 ×1 | 28 ×½ | 100 ×2 | 151 ×2 |
| Charmander | 51 ×1 | 137 ×2 | 30 ×½ | 46 ×½ |
| Squirtle | 38 ×1 | 28 ×½ | 25 ×½ | 38 ×½ |
| Pikachu | 53 ×1 | 68 ×1 | 60 ×1 | 92 ×1 |
| Gengar | 0 ×0 | 50 ×1 | 44 ×1 | 68 ×1 |
| Voltorb | 46 ×1 | 62 ×1 | 56 ×1 | 87 ×1 |
| Eevee | 46 ×1 | 56 ×1 | 50 ×1 | 76 ×1 |
| Lucario | 18 ×½ | 53 ×1 | 23 ×½ | 36 ×½ |
| Greninja | 38 ×1 | 27 ×½ | 22 ×½ | 36 ×½ |
| Mewtwo | 30 ×1 | 43 ×1 | 38 ×1 | 59 ×1 |
| Mew | 27 ×1 | 40 ×1 | 36 ×1 | 54 ×1 |
| Onix | 9 ×½ | 294 ×4 | 129 ×2 | 200 ×2 |
| Scyther | 33 ×1 | 47 ×1 | 84 ×2 | 129 ×2 |
| Gyarados | 33 ×1 | 19 ×½ | 36 ×1 | 54 ×1 |
| Tyranitar | 12 ×½ | 80 ×2 | 36 ×1 | 54 ×1 |
| Articuno | 27 ×1 | 34 ×1 | 30 ×1 | 45 ×1 |
| Zapdos | 31 ×1 | 43 ×1 | 76 ×2 | 118 ×2 |
| Moltres | 30 ×1 | 92 ×2 | 40 ×1 | 62 ×1 |
| Raikou | 35 ×1 | 40 ×1 | 36 ×1 | 54 ×1 |
| Entei | 31 ×1 | 100 ×2 | 21 ×½ | 34 ×½ |
| Lugia | 22 ×1 | 28 ×1 | 49 ×2 | 76 ×2 |
| Ho-Oh | 30 ×1 | 55 ×2 | 25 ×1 | 38 ×1 |
| Celebi | 27 ×1 | 19 ×½ | 71 ×2 | 108 ×2 |
| Kyogre | 30 ×1 | 15 ×½ | 13 ×½ | 20 ×½ |
| Groudon | 20 ×1 | 86 ×2 | 76 ×2 | 118 ×2 |
| Rayquaza | 30 ×1 | 21 ×½ | 151 ×4 | 237 ×4 |
| **Mediana de daño** | 30 | 45 | 39 | 61 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Kyogre

Tipos: **Water** · HP 175 · Atk 120 · Def 110 · SpA 170 · SpD 160 · Vel 110

| Rival | Básica: Ráfaga Marina<br>Water · Esp · Pot 46 | Habilidad 1: Remolino Marino<br>Water · Esp · Pot 34/s | Habilidad 2: Aguas Curativas<br>Water · Estado · Pot — | Definitiva: Origen del Mar<br>Water · Esp · Pot 125 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 29 ×½ | 47 ×½ | Estado | 79 ×½ |
| Charmander | 143 ×2 | 251 ×2 | Estado | 380 ×2 |
| Squirtle | 29 ×½ | 48 ×½ | Estado | 80 ×½ |
| Pikachu | 71 ×1 | 126 ×1 | Estado | 190 ×1 |
| Gengar | 53 ×1 | 93 ×1 | Estado | 141 ×1 |
| Voltorb | 65 ×1 | 111 ×1 | Estado | 178 ×1 |
| Eevee | 58 ×1 | 95 ×1 | Estado | 157 ×1 |
| Lucario | 56 ×1 | 95 ×1 | Estado | 148 ×1 |
| Greninja | 28 ×½ | 46 ×½ | Estado | 74 ×½ |
| Mewtwo | 46 ×1 | 79 ×1 | Estado | 123 ×1 |
| Mew | 41 ×1 | 69 ×1 | Estado | 111 ×1 |
| Onix | 298 ×4 | 522 ×4 | Estado | 821 ×4 |
| Scyther | 50 ×1 | 84 ×1 | Estado | 133 ×1 |
| Gyarados | 20 ×½ | 33 ×½ | Estado | 55 ×½ |
| Tyranitar | 82 ×2 | 139 ×2 | Estado | 223 ×2 |
| Articuno | 35 ×1 | 54 ×1 | Estado | 93 ×1 |
| Zapdos | 46 ×1 | 79 ×1 | Estado | 123 ×1 |
| Moltres | 94 ×2 | 168 ×2 | Estado | 257 ×2 |
| Raikou | 41 ×1 | 69 ×1 | Estado | 111 ×1 |
| Entei | 106 ×2 | 185 ×2 | Estado | 282 ×2 |
| Suicune | 18 ×½ | 32 ×½ | Estado | 49 ×½ |
| Lugia | 29 ×1 | 49 ×1 | Estado | 77 ×1 |
| Ho-Oh | 57 ×2 | 98 ×2 | Estado | 153 ×2 |
| Celebi | 20 ×½ | 33 ×½ | Estado | 55 ×½ |
| Groudon | 92 ×2 | 159 ×2 | Estado | 245 ×2 |
| Rayquaza | 22 ×½ | 38 ×½ | Estado | 61 ×½ |
| **Mediana de daño** | 48 | 82 | — | 128 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Rayquaza

Tipos: **Dragon / Flying** · HP 180 · Atk 170 · Def 110 · SpA 170 · SpD 110 · Vel 115

| Rival | Básica: Garra Dragón<br>Dragon · Fís · Pot 50 | Habilidad 1: Vuelo Dragón<br>Flying · Fís · Pot 70 | Habilidad 2: Furia Dragón<br>Dragon · Esp · Pot 85 | Definitiva: Ascenso Draco<br>Flying · Fís · Pot 130 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 78 ×1 | 216 ×2 | 107 ×1 | 400 ×2 |
| Charmander | 86 ×1 | 119 ×1 | 130 ×1 | 221 ×1 |
| Squirtle | 64 ×1 | 89 ×1 | 108 ×1 | 163 ×1 |
| Pikachu | 90 ×1 | 62 ×½ | 130 ×1 | 115 ×½ |
| Gengar | 67 ×1 | 93 ×1 | 95 ×1 | 173 ×1 |
| Voltorb | 77 ×1 | 53 ×½ | 121 ×1 | 98 ×½ |
| Eevee | 77 ×1 | 107 ×1 | 107 ×1 | 197 ×1 |
| Lucario | 30 ×½ | 84 ×1 | 50 ×½ | 154 ×1 |
| Greninja | 61 ×1 | 87 ×1 | 99 ×1 | 159 ×1 |
| Mewtwo | 50 ×1 | 68 ×1 | 83 ×1 | 127 ×1 |
| Mew | 46 ×1 | 62 ×1 | 75 ×1 | 116 ×1 |
| Onix | 31 ×1 | 21 ×½ | 139 ×1 | 39 ×½ |
| Scyther | 55 ×1 | 149 ×2 | 92 ×1 | 278 ×2 |
| Gyarados | 55 ×1 | 75 ×1 | 75 ×1 | 141 ×1 |
| Tyranitar | 41 ×1 | 29 ×½ | 75 ×1 | 53 ×½ |
| Articuno | 46 ×1 | 62 ×1 | 62 ×1 | 116 ×1 |
| Zapdos | 52 ×1 | 36 ×½ | 83 ×1 | 65 ×½ |
| Moltres | 50 ×1 | 68 ×1 | 87 ×1 | 127 ×1 |
| Raikou | 56 ×1 | 40 ×½ | 75 ×1 | 74 ×½ |
| Entei | 52 ×1 | 71 ×1 | 95 ×1 | 132 ×1 |
| Suicune | 40 ×1 | 56 ×1 | 68 ×1 | 104 ×1 |
| Lugia | 37 ×1 | 50 ×1 | 53 ×1 | 93 ×1 |
| Ho-Oh | 50 ×1 | 68 ×1 | 53 ×1 | 127 ×1 |
| Celebi | 46 ×1 | 125 ×2 | 75 ×1 | 233 ×2 |
| Kyogre | 50 ×1 | 68 ×1 | 56 ×1 | 127 ×1 |
| Groudon | 35 ×1 | 47 ×1 | 83 ×1 | 87 ×1 |
| **Mediana de daño** | 51 | 68 | 83 | 127 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Medianas por Pokémon

Resumen de las medianas de cada sección. `Combo` es la mediana del daño de los cuatro ataques sumados contra cada rival; las habilidades de estado cuentan como 0 en esa columna.

| Pokémon | Básica | Habilidad 1 | Habilidad 2 | Definitiva | Combo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pikachu | 16 | 18 | 34 | 63 | 126 |
| Voltorb | 31 | 20 | — | 102 | 145 |
| Gengar | 22 | 57 | 39 | 74 | 188 |
| Bulbasaur | 15 | — | 46 | 71 | 132 |
| Charmander | 15 | 30 | 43 | 56 | 143 |
| Squirtle | 14 | 30 | 35 | 59 | 136 |
| Lucario | 28 | 28 | 35 | 74 | 163 |
| Greninja | 32 | 48 | 37 | 69 | 200 |
| Articuno | 35 | 61 | 37 | 69 | 202 |
| Zapdos | 38 | — | 75 | 143 | 263 |
| Moltres | 38 | 53 | 46 | 80 | 210 |
| Mewtwo | 46 | — | 80 | 99 | 225 |
| Mew | 32 | — | 58 | — | 90 |
| Scyther | 29 | 46 | — | 82 | 161 |
| Tyranitar | 50 | 68 | 22 | 109 | 267 |
| Onix | 34 | 45 | 34 | 58 | 196 |
| Groudon | 30 | 39 | 50 | 108 | 203 |
| Celebi | 29 | 55 | — | 74 | 159 |
| Lugia | 34 | 30 | 64 | 75 | 198 |
| Ho-Oh | 49 | 87 | — | 56 | 189 |
| Gyarados | 53 | 66 | 51 | 86 | 266 |
| Suicune | 30 | 45 | 39 | 61 | 184 |
| Kyogre | 48 | 82 | — | 128 | 257 |
| Rayquaza | 51 | 68 | 83 | 127 | 330 |

## Pokémon sin moveset

Estas especies del roster todavía no tienen ataques asignados en `MOVESETS`, así que no pueden usarse como atacantes. Sí aparecen como rivales en las tablas anteriores porque el daño recibido solo depende de sus tipos y estadísticas.

| Pokémon | Tipos |
| --- | --- |
| Eevee | Normal |
| Raikou | Electric |
| Entei | Fire |

## Cobertura

Atacantes con moveset asignado: **24** de 27 especies del roster. Los rivales incluyen las 27 especies, tengan o no moveset, porque el daño solo depende de sus tipos y estadísticas.
