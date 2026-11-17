# Tabla de daño por Pokémon y ataque

> Generado automáticamente por `node scripts/generate-damage-matrix.mjs` a partir de `abilities.ts`, `pokedex.ts`, `combat.ts`, `typeChart.ts` y el manifiesto de sprites. No editar a mano.

## Cómo leer las tablas

- **Agrupación**: una sección por Pokémon atacante y una fila por rival. Cada columna es uno de sus cuatro ataques.
- **Celda**: daño esperado de un lanzamiento completo y, al lado, la efectividad de ese tipo contra el rival.
- **Daño esperado**: nivel 50, IV 31, EV 0, naturaleza neutra, sin buffs, random medio 0,925, crítico 1/24 (×1,05). STAB ×1,05 incluido.
- **Áreas**: se valoran con el rival en el centro (100 %). En el borde el daño radial baja hasta `radialMinDamage`.
- **Áreas `overTime`**: el total suma todos los ticks (`ceil(duración / intervalo)`) con potencia por tick = `power × intervalo`. El `+2` de la fórmula se cobra una sola vez por objetivo y lanzamiento.
- **Estado**: la habilidad no hace daño. El estado se aplica aunque el tipo sea poco eficaz.
- **—**: el rival es el propio atacante (no se calcula el mirror).
- **Mediana**: valor central del daño esperado contra los 24 rivales (con un número par, media de los dos centrales). La fila de efectividad mediana resume el matchup típico del ataque.
- Son una **cota superior**: suponen que la habilidad conecta y que el rival no esquiva ni sale del área.

**Efectividades**: ×0,85 inmune · ×0,95 resiste · ×1 neutro · ×1,05 débil. Contra dos tipos se multiplican: ×0,90 doble resistencia · ×1,10 doble debilidad.

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
| Bulbasaur | 25 ×1 | 27 ×1 | 23 ×0,95 | 44 ×0,95 |
| Charmander | 27 ×1 | 30 ×1 | 30 ×1 | 56 ×1 |
| Squirtle | 21 ×1 | 23 ×1 | 26 ×1,05 | 49 ×1,05 |
| Gengar | 18 ×0,85 | 20 ×0,85 | 23 ×1 | 42 ×1 |
| Voltorb | 24 ×1 | 27 ×1 | 26 ×0,95 | 49 ×0,95 |
| Eevee | 24 ×1 | 27 ×1 | 25 ×1 | 47 ×1 |
| Lucario | 19 ×0,95 | 20 ×0,95 | 24 ×1 | 44 ×1 |
| Greninja | 20 ×1 | 22 ×1 | 25 ×1,05 | 46 ×1,05 |
| Mewtwo | 16 ×1 | 18 ×1 | 19 ×1 | 36 ×1 |
| Mew | 15 ×1 | 16 ×1 | 17 ×1 | 33 ×1 |
| Onix | 10 ×0,95 | 11 ×0,95 | 28 ×0,85 | 51 ×0,85 |
| Scyther | 18 ×1 | 19 ×1 | 23 ×1,05 | 40 ×1,05 |
| Gyarados | 18 ×1 | 20 ×1 | 18 ×1,10 | 36 ×1,10 |
| Tyranitar | 12 ×0,95 | 14 ×0,95 | 17 ×1 | 33 ×1 |
| Articuno | 15 ×1 | 16 ×1 | 14 ×1,05 | 28 ×1,05 |
| Zapdos | 17 ×1 | 18 ×1 | 18 ×1,00 | 35 ×1,00 |
| Moltres | 16 ×1 | 18 ×1 | 22 ×1,05 | 39 ×1,05 |
| Raikou | 19 ×1 | 20 ×1 | 16 ×0,95 | 31 ×0,95 |
| Entei | 17 ×1 | 18 ×1 | 23 ×1 | 42 ×1 |
| Suicune | 13 ×1 | 14 ×1 | 15 ×1,05 | 30 ×1,05 |
| Lugia | 12 ×1 | 13 ×1 | 12 ×1,05 | 25 ×1,05 |
| Ho-Oh | 16 ×1 | 18 ×1 | 12 ×1,05 | 25 ×1,05 |
| Celebi | 15 ×1 | 16 ×1 | 16 ×0,95 | 31 ×0,95 |
| Kyogre | 16 ×1 | 18 ×1 | 13 ×1,05 | 26 ×1,05 |
| Groudon | 12 ×1 | 12 ×1 | 16 ×0,85 | 30 ×0,85 |
| Rayquaza | 16 ×1 | 18 ×1 | 18 ×1,00 | 35 ×1,00 |
| **Mediana de daño** | 17 | 18 | 19 | 36 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Voltorb

Tipos: **Electric** · HP 115 · Atk 50 · Def 70 · SpA 75 · SpD 75 · Vel 120

| Rival | Básica: Chispa<br>Electric · Fís · Pot 80 | Habilidad 1: Rollout<br>Normal · Fís · Pot 100 | Habilidad 2: Onda Trueno<br>Electric · Estado · Pot — | Definitiva: Explosión<br>Electric · Esp · Pot 200 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 23 ×0,95 | 30 ×1 | Estado | 72 ×0,95 |
| Charmander | 27 ×1 | 33 ×1 | Estado | 92 ×1 |
| Squirtle | 22 ×1,05 | 24 ×1 | Estado | 80 ×1,05 |
| Pikachu | 27 ×0,95 | 35 ×1 | Estado | 87 ×0,95 |
| Gengar | 23 ×1 | 22 ×0,85 | Estado | 68 ×1 |
| Eevee | 25 ×1 | 30 ×1 | Estado | 76 ×1 |
| Lucario | 19 ×1 | 22 ×0,95 | Estado | 72 ×1 |
| Greninja | 22 ×1,05 | 24 ×1 | Estado | 74 ×1,05 |
| Mewtwo | 16 ×1 | 20 ×1 | Estado | 59 ×1 |
| Mew | 14 ×1 | 18 ×1 | Estado | 54 ×1 |
| Onix | 8 ×0,85 | 11 ×0,95 | Estado | 84 ×0,85 |
| Scyther | 17 ×1,05 | 22 ×1 | Estado | 68 ×1,05 |
| Gyarados | 18 ×1,10 | 22 ×1 | Estado | 59 ×1,10 |
| Tyranitar | 13 ×1 | 15 ×0,95 | Estado | 54 ×1 |
| Articuno | 14 ×1,05 | 18 ×1 | Estado | 47 ×1,05 |
| Zapdos | 15 ×1,00 | 20 ×1 | Estado | 58 ×1,00 |
| Moltres | 16 ×1,05 | 20 ×1 | Estado | 64 ×1,05 |
| Raikou | 17 ×0,95 | 23 ×1 | Estado | 51 ×0,95 |
| Entei | 16 ×1 | 20 ×1 | Estado | 68 ×1 |
| Suicune | 13 ×1,05 | 16 ×1 | Estado | 50 ×1,05 |
| Lugia | 12 ×1,05 | 14 ×1 | Estado | 38 ×1,05 |
| Ho-Oh | 16 ×1,05 | 20 ×1 | Estado | 38 ×1,05 |
| Celebi | 13 ×0,95 | 18 ×1 | Estado | 51 ×0,95 |
| Kyogre | 16 ×1,05 | 20 ×1 | Estado | 42 ×1,05 |
| Groudon | 10 ×0,85 | 13 ×1 | Estado | 50 ×0,85 |
| Rayquaza | 15 ×1,00 | 20 ×1 | Estado | 58 ×1,00 |
| **Mediana de daño** | 16 | 20 | — | 59 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Gengar

Tipos: **Ghost / Poison** · HP 135 · Atk 85 · Def 80 · SpA 150 · SpD 95 · Vel 130

| Rival | Básica: Lengüetazo<br>Ghost · Fís · Pot 42 | Habilidad 1: Bola Sombra<br>Ghost · Esp · Pot 62 | Habilidad 2: Bomba Lodo<br>Poison · Esp · Pot 20/s | Definitiva: Come Sueños<br>Ghost · Esp · Pot 80 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 23 ×1 | 48 ×1 | 27 ×1,00 | 61 ×1 |
| Charmander | 25 ×1 | 57 ×1 | 42 ×1 | 74 ×1 |
| Squirtle | 18 ×1 | 48 ×1 | 32 ×1 | 61 ×1 |
| Pikachu | 26 ×1 | 57 ×1 | 42 ×1 | 74 ×1 |
| Voltorb | 23 ×1 | 53 ×1 | 37 ×1 | 69 ×1 |
| Eevee | 19 ×0,85 | 40 ×0,85 | 32 ×1 | 51 ×0,85 |
| Lucario | 17 ×1 | 45 ×1 | 26 ×0,85 | 57 ×1 |
| Greninja | 17 ×0,95 | 41 ×0,95 | 32 ×1 | 54 ×0,95 |
| Mewtwo | 14 ×1,05 | 38 ×1,05 | 27 ×1 | 50 ×1,05 |
| Mew | 13 ×1,05 | 35 ×1,05 | 22 ×1 | 46 ×1,05 |
| Onix | 9 ×1 | 61 ×1 | 41 ×0,90 | 79 ×1 |
| Scyther | 15 ×1 | 39 ×1 | 27 ×1 | 51 ×1 |
| Gyarados | 15 ×1 | 34 ×1 | 22 ×1 | 44 ×1 |
| Tyranitar | 11 ×0,95 | 32 ×0,95 | 17 ×0,95 | 41 ×0,95 |
| Articuno | 13 ×1 | 28 ×1 | 17 ×1 | 36 ×1 |
| Zapdos | 14 ×1 | 37 ×1 | 27 ×1 | 48 ×1 |
| Moltres | 14 ×1 | 38 ×1 | 27 ×1 | 50 ×1 |
| Raikou | 16 ×1 | 34 ×1 | 22 ×1 | 44 ×1 |
| Entei | 14 ×1 | 43 ×1 | 27 ×1 | 54 ×1 |
| Suicune | 12 ×1 | 30 ×1 | 17 ×1 | 38 ×1 |
| Lugia | 11 ×1,05 | 25 ×1,05 | 12 ×1 | 31 ×1,05 |
| Ho-Oh | 14 ×1 | 24 ×1 | 12 ×1 | 30 ×1 |
| Celebi | 13 ×1,05 | 35 ×1,05 | 22 ×1,05 | 46 ×1,05 |
| Kyogre | 14 ×1 | 25 ×1 | 17 ×1 | 33 ×1 |
| Groudon | 10 ×1 | 37 ×1 | 22 ×0,95 | 48 ×1 |
| Rayquaza | 14 ×1 | 37 ×1 | 27 ×1 | 48 ×1 |
| **Mediana de daño** | 14 | 38 | 27 | 49 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Bulbasaur

Tipos: **Grass / Poison** · HP 120 · Atk 69 · Def 69 · SpA 85 · SpD 85 · Vel 65

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 | Habilidad 1: Paralizador<br>Grass · Estado · Pot — | Habilidad 2: Hoja Afilada<br>Grass · Esp · Pot 100 | Definitiva: Lluevehojas<br>Grass · Esp · Pot 160 |
| --- | ---: | ---: | ---: | ---: |
| Charmander | 25 ×1 | Estado | 49 ×0,95 | 79 ×0,95 |
| Squirtle | 19 ×1 | Estado | 46 ×1,05 | 73 ×1,05 |
| Pikachu | 26 ×1 | Estado | 52 ×1 | 84 ×1 |
| Gengar | 17 ×0,85 | Estado | 36 ×0,95 | 57 ×0,95 |
| Voltorb | 23 ×1 | Estado | 49 ×1 | 77 ×1 |
| Eevee | 23 ×1 | Estado | 44 ×1 | 69 ×1 |
| Lucario | 17 ×0,95 | Estado | 38 ×0,95 | 61 ×0,95 |
| Greninja | 19 ×1 | Estado | 42 ×1,05 | 67 ×1,05 |
| Mewtwo | 15 ×1 | Estado | 34 ×1 | 53 ×1 |
| Mew | 13 ×1 | Estado | 31 ×1 | 49 ×1 |
| Onix | 9 ×0,95 | Estado | 61 ×1,10 | 99 ×1,10 |
| Scyther | 16 ×1 | Estado | 33 ×0,90 | 52 ×0,90 |
| Gyarados | 16 ×1 | Estado | 30 ×1,00 | 48 ×1,00 |
| Tyranitar | 11 ×0,95 | Estado | 32 ×1,05 | 51 ×1,05 |
| Articuno | 13 ×1 | Estado | 23 ×0,95 | 38 ×0,95 |
| Zapdos | 15 ×1 | Estado | 32 ×0,95 | 50 ×0,95 |
| Moltres | 15 ×1 | Estado | 31 ×0,90 | 49 ×0,90 |
| Raikou | 17 ×1 | Estado | 31 ×1 | 49 ×1 |
| Entei | 15 ×1 | Estado | 36 ×0,95 | 57 ×0,95 |
| Suicune | 12 ×1 | Estado | 28 ×1,05 | 46 ×1,05 |
| Lugia | 12 ×1 | Estado | 20 ×0,95 | 32 ×0,95 |
| Ho-Oh | 15 ×1 | Estado | 19 ×0,90 | 30 ×0,90 |
| Celebi | 13 ×1 | Estado | 29 ×0,95 | 46 ×0,95 |
| Kyogre | 15 ×1 | Estado | 25 ×1,05 | 38 ×1,05 |
| Groudon | 11 ×1 | Estado | 35 ×1,05 | 55 ×1,05 |
| Rayquaza | 15 ×1 | Estado | 30 ×0,90 | 47 ×0,90 |
| **Mediana de daño** | 15 | — | 33 | 52 |
| **Efectividad mediana** | ×1 | ×1,00 | ×1,00 | ×1,00 |

## Charmander

Tipos: **Fire** · HP 114 · Atk 72 · Def 63 · SpA 80 · SpD 70 · Vel 85

| Rival | Básica: Arañazo<br>Normal · Fís · Pot 55 | Habilidad 1: Giro Fuego<br>Fire · Esp · Pot 40/s | Habilidad 2: Lanzallamas<br>Fire · Esp · Pot 100 | Definitiva: Anillo Ígneo<br>Fire · Esp · Pot 130 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 24 ×1 | 32 ×1,05 | 42 ×1,05 | 54 ×1,05 |
| Squirtle | 20 ×1 | 26 ×0,95 | 38 ×0,95 | 50 ×0,95 |
| Pikachu | 28 ×1 | 44 ×1 | 50 ×1 | 64 ×1 |
| Gengar | 17 ×0,85 | 26 ×1 | 37 ×1 | 48 ×1 |
| Voltorb | 24 ×1 | 38 ×1 | 46 ×1 | 60 ×1 |
| Eevee | 24 ×1 | 32 ×1 | 40 ×1 | 52 ×1 |
| Lucario | 18 ×0,95 | 32 ×1,05 | 39 ×1,05 | 52 ×1,05 |
| Greninja | 20 ×1 | 26 ×0,95 | 36 ×0,95 | 47 ×0,95 |
| Mewtwo | 15 ×1 | 26 ×1 | 32 ×1 | 40 ×1 |
| Mew | 14 ×1 | 20 ×1 | 29 ×1 | 38 ×1 |
| Onix | 9 ×0,95 | 38 ×0,95 | 50 ×0,95 | 65 ×0,95 |
| Scyther | 17 ×1 | 26 ×1,05 | 36 ×1,05 | 47 ×1,05 |
| Gyarados | 17 ×1 | 14 ×0,95 | 27 ×0,95 | 36 ×0,95 |
| Tyranitar | 12 ×0,95 | 14 ×0,95 | 27 ×0,95 | 36 ×0,95 |
| Articuno | 14 ×1 | 14 ×1,05 | 26 ×1,05 | 32 ×1,05 |
| Zapdos | 16 ×1 | 26 ×1 | 32 ×1 | 40 ×1 |
| Moltres | 15 ×1 | 20 ×0,95 | 31 ×0,95 | 40 ×0,95 |
| Raikou | 18 ×1 | 20 ×1 | 29 ×1 | 38 ×1 |
| Entei | 16 ×1 | 20 ×0,95 | 35 ×0,95 | 45 ×0,95 |
| Suicune | 12 ×1 | 14 ×0,95 | 24 ×0,95 | 31 ×0,95 |
| Lugia | 12 ×1 | 14 ×1 | 21 ×1 | 26 ×1 |
| Ho-Oh | 15 ×1 | 8 ×0,95 | 19 ×0,95 | 24 ×0,95 |
| Celebi | 14 ×1 | 20 ×1,05 | 30 ×1,05 | 39 ×1,05 |
| Kyogre | 15 ×1 | 8 ×0,95 | 21 ×0,95 | 26 ×0,95 |
| Groudon | 11 ×1 | 26 ×1 | 32 ×1 | 40 ×1 |
| Rayquaza | 15 ×1 | 20 ×0,95 | 30 ×0,95 | 38 ×0,95 |
| **Mediana de daño** | 16 | 23 | 32 | 40 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Squirtle

Tipos: **Water** · HP 119 · Atk 68 · Def 85 · SpA 70 · SpD 84 · Vel 63

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 | Habilidad 1: Acua Jet<br>Water · Fís · Pot 65 | Habilidad 2: Rayo Burbuja<br>Water · Esp · Pot 80 | Definitiva: Hidrobomba<br>Water · Esp · Pot 140 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 23 ×1 | 26 ×0,95 | 26 ×0,95 | 47 ×0,95 |
| Charmander | 25 ×1 | 31 ×1,05 | 36 ×1,05 | 63 ×1,05 |
| Pikachu | 26 ×1 | 32 ×1 | 35 ×1 | 60 ×1 |
| Gengar | 17 ×0,85 | 25 ×1 | 25 ×1 | 45 ×1 |
| Voltorb | 23 ×1 | 27 ×1 | 32 ×1 | 56 ×1 |
| Eevee | 23 ×1 | 27 ×1 | 28 ×1 | 50 ×1 |
| Lucario | 17 ×0,95 | 22 ×1 | 27 ×1 | 47 ×1 |
| Greninja | 18 ×1 | 21 ×0,95 | 25 ×0,95 | 44 ×0,95 |
| Mewtwo | 14 ×1 | 17 ×1 | 23 ×1 | 38 ×1 |
| Mew | 13 ×1 | 16 ×1 | 21 ×1 | 35 ×1 |
| Onix | 9 ×0,95 | 12 ×1,10 | 40 ×1,10 | 71 ×1,10 |
| Scyther | 16 ×1 | 19 ×1 | 25 ×1 | 43 ×1 |
| Gyarados | 16 ×1 | 18 ×0,95 | 19 ×0,95 | 33 ×0,95 |
| Tyranitar | 11 ×0,95 | 14 ×1,05 | 22 ×1,05 | 36 ×1,05 |
| Articuno | 13 ×1 | 16 ×1 | 16 ×1 | 29 ×1 |
| Zapdos | 15 ×1 | 18 ×1 | 23 ×1 | 38 ×1 |
| Moltres | 14 ×1 | 17 ×1,05 | 25 ×1,05 | 42 ×1,05 |
| Raikou | 17 ×1 | 21 ×1 | 21 ×1 | 35 ×1 |
| Entei | 15 ×1 | 18 ×1,05 | 26 ×1,05 | 47 ×1,05 |
| Suicune | 12 ×1 | 13 ×0,95 | 17 ×0,95 | 29 ×0,95 |
| Lugia | 11 ×1 | 12 ×1 | 14 ×1 | 25 ×1 |
| Ho-Oh | 14 ×1 | 17 ×1,05 | 14 ×1,05 | 26 ×1,05 |
| Celebi | 13 ×1 | 15 ×0,95 | 19 ×0,95 | 33 ×0,95 |
| Kyogre | 14 ×1 | 16 ×0,95 | 14 ×0,95 | 24 ×0,95 |
| Groudon | 11 ×1 | 12 ×1,05 | 24 ×1,05 | 39 ×1,05 |
| Rayquaza | 14 ×1 | 16 ×0,95 | 21 ×0,95 | 36 ×0,95 |
| **Mediana de daño** | 15 | 18 | 24 | 39 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Lucario

Tipos: **Fighting / Steel** · HP 145 · Atk 130 · Def 90 · SpA 135 · SpD 90 · Vel 110

| Rival | Básica: Garra Metal<br>Steel · Fís · Pot 45 | Habilidad 1: Velocidad Extrema<br>Normal · Fís · Pot 55 | Habilidad 2: Esfera Aura<br>Fighting · Esp · Pot 60 | Definitiva: Combate Cercano<br>Fighting · Fís · Pot 125 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 37 ×1 | 43 ×1 | 38 ×0,95 | 95 ×0,95 |
| Charmander | 37 ×0,95 | 47 ×1 | 50 ×1 | 111 ×1 |
| Squirtle | 28 ×0,95 | 36 ×1 | 42 ×1 | 82 ×1 |
| Pikachu | 39 ×0,95 | 49 ×1 | 50 ×1 | 116 ×1 |
| Gengar | 32 ×1 | 31 ×0,85 | 29 ×0,81 | 71 ×0,81 |
| Voltorb | 34 ×0,95 | 42 ×1 | 47 ×1 | 100 ×1 |
| Eevee | 36 ×1 | 42 ×1 | 42 ×1,05 | 105 ×1,05 |
| Greninja | 27 ×0,95 | 35 ×1 | 39 ×1,05 | 84 ×1,05 |
| Mewtwo | 24 ×1 | 27 ×1 | 30 ×0,95 | 60 ×0,95 |
| Mew | 22 ×1 | 25 ×1 | 27 ×0,95 | 55 ×0,95 |
| Onix | 14 ×1,05 | 16 ×0,95 | 55 ×1,05 | 39 ×1,05 |
| Scyther | 25 ×1 | 30 ×1 | 31 ×0,90 | 63 ×0,90 |
| Gyarados | 24 ×0,95 | 30 ×1 | 27 ×0,95 | 67 ×0,95 |
| Tyranitar | 19 ×1,05 | 22 ×0,95 | 31 ×1,10 | 59 ×1,10 |
| Articuno | 23 ×1,05 | 25 ×1 | 24 ×1,00 | 57 ×1,00 |
| Zapdos | 23 ×0,95 | 28 ×1 | 30 ×0,95 | 63 ×0,95 |
| Moltres | 22 ×0,95 | 27 ×1 | 31 ×0,95 | 60 ×0,95 |
| Raikou | 25 ×0,95 | 32 ×1 | 29 ×1 | 74 ×1 |
| Entei | 23 ×0,95 | 28 ×1 | 37 ×1 | 67 ×1 |
| Suicune | 18 ×0,95 | 23 ×1 | 26 ×1 | 51 ×1 |
| Lugia | 17 ×1 | 20 ×1 | 18 ×0,90 | 42 ×0,90 |
| Ho-Oh | 22 ×0,95 | 27 ×1 | 19 ×0,95 | 60 ×0,95 |
| Celebi | 22 ×1 | 25 ×1 | 27 ×0,95 | 55 ×0,95 |
| Kyogre | 22 ×0,95 | 27 ×1 | 23 ×1 | 64 ×1 |
| Groudon | 16 ×1 | 19 ×1 | 32 ×1 | 44 ×1 |
| Rayquaza | 24 ×1 | 27 ×1 | 30 ×0,95 | 60 ×0,95 |
| **Mediana de daño** | 24 | 28 | 31 | 63 |
| **Efectividad mediana** | ×0,97 | ×1 | ×1,00 | ×1,00 |

## Greninja

Tipos: **Water / Dark** · HP 147 · Atk 115 · Def 87 · SpA 123 · SpD 91 · Vel 142

| Rival | Básica: Shuriken de Agua<br>Water · Esp · Pot 42 | Habilidad 1: Tajo Umbrío<br>Dark · Fís · Pot 65 | Habilidad 2: Sombra Vil<br>Dark · Fís · Pot 50 | Definitiva: Pulso Umbrío<br>Dark · Esp · Pot 85 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 24 ×0,95 | 47 ×1 | 36 ×1 | 53 ×1 |
| Charmander | 33 ×1,05 | 51 ×1 | 39 ×1 | 64 ×1 |
| Squirtle | 25 ×0,95 | 38 ×1 | 29 ×1 | 53 ×1 |
| Pikachu | 32 ×1 | 53 ×1 | 42 ×1 | 64 ×1 |
| Gengar | 24 ×1 | 42 ×1,05 | 32 ×1,05 | 50 ×1,05 |
| Voltorb | 30 ×1 | 46 ×1 | 36 ×1 | 60 ×1 |
| Eevee | 26 ×1 | 46 ×1 | 36 ×1 | 53 ×1 |
| Lucario | 25 ×1 | 34 ×0,95 | 26 ×0,95 | 48 ×0,95 |
| Mewtwo | 21 ×1 | 30 ×1,05 | 25 ×1,05 | 42 ×1,05 |
| Mew | 18 ×1 | 28 ×1,05 | 23 ×1,05 | 39 ×1,05 |
| Onix | 37 ×1,10 | 18 ×1 | 14 ×1 | 69 ×1 |
| Scyther | 23 ×1 | 32 ×1 | 25 ×1 | 46 ×1 |
| Gyarados | 17 ×0,95 | 33 ×1 | 25 ×1 | 38 ×1 |
| Tyranitar | 18 ×1,05 | 23 ×0,95 | 18 ×0,95 | 36 ×0,95 |
| Articuno | 15 ×1 | 27 ×1 | 22 ×1 | 31 ×1 |
| Zapdos | 21 ×1 | 31 ×1 | 25 ×1 | 40 ×1 |
| Moltres | 23 ×1,05 | 29 ×1 | 24 ×1 | 43 ×1 |
| Raikou | 18 ×1 | 34 ×1 | 26 ×1 | 38 ×1 |
| Entei | 25 ×1,05 | 31 ×1 | 25 ×1 | 48 ×1 |
| Suicune | 15 ×0,95 | 25 ×1 | 18 ×1 | 34 ×1 |
| Lugia | 13 ×1 | 23 ×1,05 | 16 ×1,05 | 27 ×1,05 |
| Ho-Oh | 13 ×1,05 | 29 ×1 | 24 ×1 | 26 ×1 |
| Celebi | 17 ×0,95 | 28 ×1,05 | 23 ×1,05 | 39 ×1,05 |
| Kyogre | 13 ×0,95 | 29 ×1 | 24 ×1 | 28 ×1 |
| Groudon | 22 ×1,05 | 21 ×1 | 15 ×1 | 40 ×1 |
| Rayquaza | 19 ×0,95 | 29 ×1 | 24 ×1 | 40 ×1 |
| **Mediana de daño** | 22 | 31 | 25 | 41 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Articuno

Tipos: **Ice / Flying** · HP 165 · Atk 105 · Def 120 · SpA 115 · SpD 145 · Vel 105

| Rival | Básica: Golpe Ala<br>Flying · Fís · Pot 55 | Habilidad 1: Rayo Hielo<br>Ice · Esp · Pot 90 | Habilidad 2: Viento Gélido<br>Ice · Esp · Pot 55 | Definitiva: Ventisca<br>Ice · Esp · Pot 100 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 37 ×1,05 | 54 ×1,05 | 33 ×1,05 | 60 ×1,05 |
| Charmander | 39 ×1 | 60 ×0,95 | 36 ×0,95 | 67 ×0,95 |
| Squirtle | 29 ×1 | 50 ×0,95 | 31 ×0,95 | 56 ×0,95 |
| Pikachu | 39 ×0,95 | 64 ×1 | 38 ×1 | 71 ×1 |
| Gengar | 31 ×1 | 47 ×1 | 29 ×1 | 52 ×1 |
| Voltorb | 34 ×0,95 | 59 ×1 | 37 ×1 | 66 ×1 |
| Eevee | 36 ×1 | 52 ×1 | 32 ×1 | 58 ×1 |
| Lucario | 27 ×1,00 | 47 ×0,95 | 28 ×0,95 | 52 ×0,95 |
| Greninja | 29 ×1 | 47 ×0,95 | 28 ×0,95 | 51 ×0,95 |
| Mewtwo | 24 ×1 | 40 ×1 | 25 ×1 | 46 ×1 |
| Mew | 22 ×1 | 37 ×1 | 24 ×1 | 42 ×1 |
| Onix | 13 ×0,95 | 72 ×1,05 | 44 ×1,05 | 79 ×1,05 |
| Scyther | 26 ×1,05 | 47 ×1,05 | 28 ×1,05 | 52 ×1,05 |
| Gyarados | 25 ×1 | 36 ×1,00 | 23 ×1,00 | 41 ×1,00 |
| Tyranitar | 18 ×0,95 | 37 ×1 | 24 ×1 | 42 ×1 |
| Zapdos | 23 ×0,95 | 42 ×1,05 | 26 ×1,05 | 48 ×1,05 |
| Moltres | 24 ×1 | 42 ×1,00 | 25 ×1,00 | 47 ×1,00 |
| Raikou | 24 ×0,95 | 37 ×1 | 24 ×1 | 42 ×1 |
| Entei | 25 ×1 | 44 ×0,95 | 27 ×0,95 | 49 ×0,95 |
| Suicune | 18 ×1 | 31 ×0,95 | 19 ×0,95 | 35 ×0,95 |
| Lugia | 16 ×1 | 27 ×1,05 | 15 ×1,05 | 30 ×1,05 |
| Ho-Oh | 24 ×1 | 25 ×1,00 | 14 ×1,00 | 28 ×1,00 |
| Celebi | 23 ×1,05 | 38 ×1,05 | 25 ×1,05 | 44 ×1,05 |
| Kyogre | 24 ×1 | 26 ×0,95 | 16 ×0,95 | 29 ×0,95 |
| Groudon | 15 ×1 | 42 ×1,05 | 26 ×1,05 | 48 ×1,05 |
| Rayquaza | 24 ×1 | 44 ×1,10 | 27 ×1,10 | 50 ×1,10 |
| **Mediana de daño** | 24 | 43 | 27 | 49 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Zapdos

Tipos: **Electric / Flying** · HP 165 · Atk 110 · Def 105 · SpA 145 · SpD 110 · Vel 120

| Rival | Básica: Pico Taladro<br>Flying · Fís · Pot 60 | Habilidad 1: Onda Trueno<br>Electric · Estado · Pot — | Habilidad 2: Descarga<br>Electric · Esp · Pot 75 | Definitiva: Trueno<br>Electric · Esp · Pot 145 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 44 ×1,05 | Estado | 52 ×0,95 | 100 ×0,95 |
| Charmander | 46 ×1 | Estado | 67 ×1 | 129 ×1 |
| Squirtle | 34 ×1 | Estado | 57 ×1,05 | 113 ×1,05 |
| Pikachu | 45 ×0,95 | Estado | 63 ×0,95 | 122 ×0,95 |
| Gengar | 36 ×1 | Estado | 50 ×1 | 95 ×1 |
| Voltorb | 38 ×0,95 | Estado | 59 ×0,95 | 114 ×0,95 |
| Eevee | 40 ×1 | Estado | 55 ×1 | 106 ×1 |
| Lucario | 31 ×1,00 | Estado | 52 ×1 | 100 ×1 |
| Greninja | 33 ×1 | Estado | 53 ×1,05 | 103 ×1,05 |
| Mewtwo | 26 ×1 | Estado | 43 ×1 | 82 ×1 |
| Mew | 25 ×1 | Estado | 38 ×1 | 76 ×1 |
| Onix | 15 ×0,95 | Estado | 61 ×0,85 | 118 ×0,85 |
| Scyther | 30 ×1,05 | Estado | 49 ×1,05 | 94 ×1,05 |
| Gyarados | 29 ×1 | Estado | 41 ×1,10 | 83 ×1,10 |
| Tyranitar | 21 ×0,95 | Estado | 38 ×1 | 76 ×1 |
| Articuno | 25 ×1 | Estado | 34 ×1,05 | 66 ×1,05 |
| Moltres | 26 ×1 | Estado | 47 ×1,05 | 91 ×1,05 |
| Raikou | 28 ×0,95 | Estado | 36 ×0,95 | 72 ×0,95 |
| Entei | 27 ×1 | Estado | 50 ×1 | 95 ×1 |
| Suicune | 22 ×1 | Estado | 36 ×1,05 | 70 ×1,05 |
| Lugia | 19 ×1 | Estado | 28 ×1,05 | 54 ×1,05 |
| Ho-Oh | 26 ×1 | Estado | 28 ×1,05 | 54 ×1,05 |
| Celebi | 26 ×1,05 | Estado | 36 ×0,95 | 72 ×0,95 |
| Kyogre | 26 ×1 | Estado | 30 ×1,05 | 58 ×1,05 |
| Groudon | 18 ×1 | Estado | 36 ×0,85 | 69 ×0,85 |
| Rayquaza | 26 ×1 | Estado | 42 ×1,00 | 81 ×1,00 |
| **Mediana de daño** | 27 | — | 45 | 87 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Moltres

Tipos: **Fire / Flying** · HP 165 · Atk 120 · Def 110 · SpA 145 · SpD 105 · Vel 110

| Rival | Básica: Ataque Aéreo<br>Flying · Fís · Pot 55 | Habilidad 1: Tajo Aéreo<br>Flying · Esp · Pot 65 | Habilidad 2: Onda Ígnea<br>Fire · Esp · Pot 60 | Definitiva: Ataque Celeste<br>Flying · Fís · Pot 115 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 44 ×1,05 | 50 ×1,05 | 47 ×1,05 | 91 ×1,05 |
| Charmander | 46 ×1 | 58 ×1 | 50 ×0,95 | 94 ×1 |
| Squirtle | 34 ×1 | 49 ×1 | 42 ×0,95 | 70 ×1 |
| Pikachu | 45 ×0,95 | 55 ×0,95 | 53 ×1 | 94 ×0,95 |
| Gengar | 36 ×1 | 43 ×1 | 39 ×1 | 74 ×1 |
| Voltorb | 38 ×0,95 | 51 ×0,95 | 51 ×1 | 80 ×0,95 |
| Eevee | 40 ×1 | 48 ×1 | 45 ×1 | 85 ×1 |
| Lucario | 31 ×1,00 | 45 ×1,00 | 44 ×1,05 | 65 ×1,00 |
| Greninja | 33 ×1 | 45 ×1 | 39 ×0,95 | 68 ×1 |
| Mewtwo | 26 ×1 | 37 ×1 | 34 ×1 | 54 ×1 |
| Mew | 25 ×1 | 34 ×1 | 31 ×1 | 50 ×1 |
| Onix | 15 ×0,95 | 59 ×0,95 | 54 ×0,95 | 31 ×0,95 |
| Scyther | 30 ×1,05 | 42 ×1,05 | 39 ×1,05 | 61 ×1,05 |
| Gyarados | 29 ×1 | 34 ×1 | 29 ×0,95 | 60 ×1 |
| Tyranitar | 21 ×0,95 | 32 ×0,95 | 29 ×0,95 | 43 ×0,95 |
| Articuno | 25 ×1 | 28 ×1 | 27 ×1,05 | 50 ×1 |
| Zapdos | 25 ×0,95 | 35 ×0,95 | 34 ×1 | 53 ×0,95 |
| Raikou | 28 ×0,95 | 32 ×0,95 | 31 ×1 | 59 ×0,95 |
| Entei | 27 ×1 | 43 ×1 | 37 ×0,95 | 56 ×1 |
| Suicune | 22 ×1 | 30 ×1 | 26 ×0,95 | 44 ×1 |
| Lugia | 19 ×1 | 24 ×1 | 23 ×1 | 39 ×1 |
| Ho-Oh | 26 ×1 | 24 ×1 | 21 ×0,95 | 54 ×1 |
| Celebi | 26 ×1,05 | 35 ×1,05 | 32 ×1,05 | 52 ×1,05 |
| Kyogre | 26 ×1 | 25 ×1 | 22 ×0,95 | 54 ×1 |
| Groudon | 18 ×1 | 37 ×1 | 34 ×1 | 37 ×1 |
| Rayquaza | 26 ×1 | 37 ×1 | 32 ×0,95 | 54 ×1 |
| **Mediana de daño** | 27 | 37 | 34 | 55 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Mewtwo

Tipos: **Psychic** · HP 181 · Atk 130 · Def 110 · SpA 174 · SpD 110 · Vel 150

| Rival | Básica: Telequinesis<br>Psychic · Esp · Pot 45 | Habilidad 1: Teletransporte<br>Psychic · Estado · Pot — | Habilidad 2: Psíquico<br>Psychic · Esp · Pot 80 | Definitiva: Psicoataque<br>Psychic · Esp · Pot 100 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 40 ×1,05 | Estado | 74 ×1,05 | 93 ×1,05 |
| Charmander | 49 ×1 | Estado | 86 ×1 | 107 ×1 |
| Squirtle | 40 ×1 | Estado | 71 ×1 | 90 ×1 |
| Pikachu | 49 ×1 | Estado | 86 ×1 | 107 ×1 |
| Gengar | 37 ×1,05 | Estado | 67 ×1,05 | 81 ×1,05 |
| Voltorb | 45 ×1 | Estado | 79 ×1 | 100 ×1 |
| Eevee | 39 ×1 | Estado | 71 ×1 | 89 ×1 |
| Lucario | 37 ×1,00 | Estado | 66 ×1,00 | 83 ×1,00 |
| Greninja | 31 ×0,85 | Estado | 56 ×0,85 | 69 ×0,85 |
| Mew | 26 ×0,95 | Estado | 48 ×0,95 | 59 ×0,95 |
| Onix | 52 ×1 | Estado | 92 ×1 | 115 ×1 |
| Scyther | 34 ×1 | Estado | 60 ×1 | 75 ×1 |
| Gyarados | 28 ×1 | Estado | 51 ×1 | 63 ×1 |
| Tyranitar | 23 ×0,85 | Estado | 43 ×0,85 | 53 ×0,85 |
| Articuno | 24 ×1 | Estado | 42 ×1 | 51 ×1 |
| Zapdos | 31 ×1 | Estado | 54 ×1 | 68 ×1 |
| Moltres | 32 ×1 | Estado | 57 ×1 | 71 ×1 |
| Raikou | 28 ×1 | Estado | 51 ×1 | 63 ×1 |
| Entei | 36 ×1 | Estado | 64 ×1 | 78 ×1 |
| Suicune | 25 ×1 | Estado | 45 ×1 | 55 ×1 |
| Lugia | 18 ×0,95 | Estado | 33 ×0,95 | 41 ×0,95 |
| Ho-Oh | 19 ×1 | Estado | 35 ×1 | 44 ×1 |
| Celebi | 26 ×0,95 | Estado | 48 ×0,95 | 59 ×0,95 |
| Kyogre | 22 ×1 | Estado | 38 ×1 | 47 ×1 |
| Groudon | 31 ×1 | Estado | 54 ×1 | 68 ×1 |
| Rayquaza | 31 ×1 | Estado | 54 ×1 | 68 ×1 |
| **Mediana de daño** | 31 | — | 55 | 69 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Mew

Tipos: **Psychic** · HP 175 · Atk 120 · Def 120 · SpA 120 · SpD 120 · Vel 120

| Rival | Básica: Golpe Psíquico<br>Psychic · Esp · Pot 45 | Habilidad 1: Agilidad<br>Psychic · Estado · Pot — | Habilidad 2: Premonición<br>Psychic · Esp · Pot 85 | Definitiva: Recuperación<br>Psychic · Estado · Pot — |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 28 ×1,05 | Estado | 53 ×1,05 | Estado |
| Charmander | 33 ×1 | Estado | 64 ×1 | Estado |
| Squirtle | 28 ×1 | Estado | 52 ×1 | Estado |
| Pikachu | 33 ×1 | Estado | 64 ×1 | Estado |
| Gengar | 26 ×1,05 | Estado | 49 ×1,05 | Estado |
| Voltorb | 31 ×1 | Estado | 58 ×1 | Estado |
| Eevee | 27 ×1 | Estado | 51 ×1 | Estado |
| Lucario | 25 ×1,00 | Estado | 48 ×1,00 | Estado |
| Greninja | 22 ×0,85 | Estado | 41 ×0,85 | Estado |
| Mewtwo | 20 ×0,95 | Estado | 37 ×0,95 | Estado |
| Onix | 36 ×1 | Estado | 68 ×1 | Estado |
| Scyther | 24 ×1 | Estado | 44 ×1 | Estado |
| Gyarados | 19 ×1 | Estado | 37 ×1 | Estado |
| Tyranitar | 16 ×0,85 | Estado | 31 ×0,85 | Estado |
| Articuno | 16 ×1 | Estado | 30 ×1 | Estado |
| Zapdos | 22 ×1 | Estado | 39 ×1 | Estado |
| Moltres | 23 ×1 | Estado | 42 ×1 | Estado |
| Raikou | 19 ×1 | Estado | 37 ×1 | Estado |
| Entei | 25 ×1 | Estado | 47 ×1 | Estado |
| Suicune | 17 ×1 | Estado | 33 ×1 | Estado |
| Lugia | 12 ×0,95 | Estado | 23 ×0,95 | Estado |
| Ho-Oh | 13 ×1 | Estado | 25 ×1 | Estado |
| Celebi | 18 ×0,95 | Estado | 35 ×0,95 | Estado |
| Kyogre | 14 ×1 | Estado | 28 ×1 | Estado |
| Groudon | 22 ×1 | Estado | 39 ×1 | Estado |
| Rayquaza | 22 ×1 | Estado | 39 ×1 | Estado |
| **Mediana de daño** | 22 | — | 40 | — |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Scyther

Tipos: **Bug / Flying** · HP 145 · Atk 130 · Def 100 · SpA 75 · SpD 100 · Vel 125

| Rival | Básica: Golpe Furia<br>Bug · Fís · Pot 45 | Habilidad 1: Corte Aéreo<br>Flying · Fís · Pot 60 | Habilidad 2: Danza Espada<br>Normal · Estado · Pot — | Definitiva: Tijera X<br>Bug · Fís · Pot 130 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 36 ×1,00 | 51 ×1,05 | Estado | 104 ×1,00 |
| Charmander | 37 ×0,95 | 53 ×1 | Estado | 110 ×0,95 |
| Squirtle | 30 ×1 | 39 ×1 | Estado | 86 ×1 |
| Pikachu | 42 ×1 | 53 ×0,95 | Estado | 120 ×1 |
| Gengar | 28 ×0,90 | 42 ×1 | Estado | 81 ×0,90 |
| Voltorb | 36 ×1 | 46 ×0,95 | Estado | 103 ×1 |
| Eevee | 36 ×1 | 49 ×1 | Estado | 103 ×1 |
| Lucario | 25 ×0,90 | 37 ×1,00 | Estado | 72 ×0,90 |
| Greninja | 30 ×1,05 | 38 ×1 | Estado | 88 ×1,05 |
| Mewtwo | 25 ×1,05 | 31 ×1 | Estado | 69 ×1,05 |
| Mew | 23 ×1,05 | 28 ×1 | Estado | 63 ×1,05 |
| Onix | 14 ×1 | 18 ×0,95 | Estado | 40 ×1 |
| Gyarados | 24 ×0,95 | 34 ×1 | Estado | 70 ×0,95 |
| Tyranitar | 19 ×1,05 | 24 ×0,95 | Estado | 58 ×1,05 |
| Articuno | 20 ×0,95 | 28 ×1 | Estado | 57 ×0,95 |
| Zapdos | 23 ×0,95 | 30 ×0,95 | Estado | 65 ×0,95 |
| Moltres | 21 ×0,90 | 31 ×1 | Estado | 59 ×0,90 |
| Raikou | 27 ×1 | 34 ×0,95 | Estado | 77 ×1 |
| Entei | 23 ×0,95 | 32 ×1 | Estado | 65 ×0,95 |
| Suicune | 19 ×1 | 25 ×1 | Estado | 54 ×1 |
| Lugia | 16 ×1,00 | 23 ×1 | Estado | 48 ×1,00 |
| Ho-Oh | 21 ×0,90 | 31 ×1 | Estado | 59 ×0,90 |
| Celebi | 24 ×1,10 | 29 ×1,05 | Estado | 66 ×1,10 |
| Kyogre | 24 ×1 | 31 ×1 | Estado | 66 ×1 |
| Groudon | 16 ×1 | 22 ×1 | Estado | 46 ×1 |
| Rayquaza | 22 ×0,95 | 31 ×1 | Estado | 62 ×0,95 |
| **Mediana de daño** | 24 | 31 | — | 66 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Tyranitar

Tipos: **Rock / Dark** · HP 175 · Atk 154 · Def 130 · SpA 115 · SpD 120 · Vel 81

| Rival | Básica: Triturar<br>Dark · Fís · Pot 50 | Habilidad 1: Avalancha<br>Rock · Fís · Pot 55 | Habilidad 2: Terremoto<br>Ground · Fís · Pot 18/s | Definitiva: Roca Afilada<br>Rock · Fís · Pot 90 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 49 ×1 | 50 ×0,95 | 32 ×1,00 | 82 ×0,95 |
| Charmander | 52 ×1 | 60 ×1,05 | 42 ×1,05 | 98 ×1,05 |
| Squirtle | 38 ×1 | 43 ×1 | 32 ×1 | 70 ×1 |
| Pikachu | 55 ×1 | 61 ×1 | 47 ×1,05 | 99 ×1 |
| Gengar | 44 ×1,05 | 43 ×0,95 | 32 ×1,05 | 71 ×0,95 |
| Voltorb | 48 ×1 | 52 ×1 | 37 ×1,05 | 86 ×1 |
| Eevee | 48 ×1 | 52 ×1 | 37 ×1 | 86 ×1 |
| Lucario | 35 ×0,95 | 36 ×0,90 | 27 ×1,05 | 59 ×0,90 |
| Greninja | 36 ×0,95 | 42 ×1 | 32 ×1 | 69 ×1 |
| Mewtwo | 31 ×1,05 | 33 ×1 | 22 ×1 | 54 ×1 |
| Mew | 29 ×1,05 | 31 ×1 | 22 ×1 | 50 ×1 |
| Onix | 18 ×1 | 19 ×0,95 | 12 ×1,05 | 31 ×0,95 |
| Scyther | 33 ×1 | 40 ×1,10 | 21 ×0,81 | 65 ×1,10 |
| Gyarados | 34 ×1 | 38 ×1,05 | 21 ×0,85 | 63 ×1,05 |
| Articuno | 28 ×1 | 34 ×1,10 | 17 ×0,85 | 55 ×1,10 |
| Zapdos | 32 ×1 | 36 ×1,05 | 17 ×0,89 | 59 ×1,05 |
| Moltres | 30 ×1 | 36 ×1,10 | 17 ×0,89 | 59 ×1,10 |
| Raikou | 35 ×1 | 38 ×1 | 27 ×1,05 | 64 ×1 |
| Entei | 32 ×1 | 36 ×1,05 | 22 ×1,05 | 59 ×1,05 |
| Suicune | 25 ×1 | 27 ×1 | 17 ×1 | 45 ×1 |
| Lugia | 24 ×1,05 | 26 ×1,05 | 12 ×0,85 | 40 ×1,05 |
| Ho-Oh | 30 ×1 | 36 ×1,10 | 17 ×0,89 | 59 ×1,10 |
| Celebi | 29 ×1,05 | 31 ×1 | 17 ×0,95 | 50 ×1 |
| Kyogre | 30 ×1 | 33 ×1 | 22 ×1 | 54 ×1 |
| Groudon | 22 ×1 | 22 ×0,95 | 12 ×1 | 36 ×0,95 |
| Rayquaza | 30 ×1 | 34 ×1,05 | 17 ×0,85 | 56 ×1,05 |
| **Mediana de daño** | 32 | 36 | 22 | 59 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Onix

Tipos: **Rock / Ground** · HP 110 · Atk 65 · Def 180 · SpA 50 · SpD 65 · Vel 90

| Rival | Básica: Atadura<br>Rock · Fís · Pot 65 | Habilidad 1: Lanzarrocas<br>Rock · Fís · Pot 85 | Habilidad 2: Excavar<br>Ground · Fís · Pot 85 | Definitiva: Fisura<br>Ground · Fís · Pot 155 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 24 ×0,95 | 33 ×0,95 | 34 ×1,00 | 63 ×1,00 |
| Charmander | 30 ×1,05 | 39 ×1,05 | 39 ×1,05 | 72 ×1,05 |
| Squirtle | 22 ×1 | 28 ×1 | 28 ×1 | 51 ×1 |
| Pikachu | 30 ×1 | 39 ×1 | 40 ×1,05 | 75 ×1,05 |
| Gengar | 22 ×0,95 | 28 ×0,95 | 31 ×1,05 | 56 ×1,05 |
| Voltorb | 26 ×1 | 34 ×1 | 35 ×1,05 | 66 ×1,05 |
| Eevee | 26 ×1 | 34 ×1 | 34 ×1 | 63 ×1 |
| Lucario | 18 ×0,90 | 24 ×0,90 | 28 ×1,05 | 51 ×1,05 |
| Greninja | 22 ×1 | 27 ×1 | 27 ×1 | 50 ×1 |
| Mewtwo | 16 ×1 | 23 ×1 | 23 ×1 | 39 ×1 |
| Mew | 15 ×1 | 21 ×1 | 21 ×1 | 36 ×1 |
| Scyther | 19 ×1,10 | 27 ×1,10 | 20 ×0,81 | 35 ×0,81 |
| Gyarados | 18 ×1,05 | 26 ×1,05 | 21 ×0,85 | 37 ×0,85 |
| Tyranitar | 14 ×1 | 18 ×1 | 18 ×1,05 | 35 ×1,05 |
| Articuno | 16 ×1,10 | 23 ×1,10 | 17 ×0,85 | 30 ×0,85 |
| Zapdos | 17 ×1,05 | 25 ×1,05 | 21 ×0,89 | 37 ×0,89 |
| Moltres | 17 ×1,10 | 25 ×1,10 | 20 ×0,89 | 34 ×0,89 |
| Raikou | 19 ×1 | 25 ×1 | 26 ×1,05 | 48 ×1,05 |
| Entei | 17 ×1,05 | 25 ×1,05 | 25 ×1,05 | 44 ×1,05 |
| Suicune | 13 ×1 | 18 ×1 | 18 ×1 | 32 ×1 |
| Lugia | 12 ×1,05 | 16 ×1,05 | 13 ×0,85 | 24 ×0,85 |
| Ho-Oh | 17 ×1,10 | 25 ×1,10 | 20 ×0,89 | 34 ×0,89 |
| Celebi | 15 ×1 | 21 ×1 | 19 ×0,95 | 34 ×0,95 |
| Kyogre | 16 ×1 | 23 ×1 | 23 ×1 | 39 ×1 |
| Groudon | 11 ×0,95 | 14 ×0,95 | 15 ×1 | 27 ×1 |
| Rayquaza | 16 ×1,05 | 24 ×1,05 | 19 ×0,85 | 33 ×0,85 |
| **Mediana de daño** | 17 | 25 | 22 | 38 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Groudon

Tipos: **Ground** · HP 175 · Atk 170 · Def 160 · SpA 120 · SpD 110 · Vel 110

| Rival | Básica: Cuchillada<br>Normal · Fís · Pot 45 | Habilidad 1: Terremoto<br>Ground · Fís · Pot 18/s | Habilidad 2: Avalancha<br>Rock · Fís · Pot 55 | Definitiva: Filo del Abismo<br>Ground · Fís · Pot 100 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 46 ×1 | 37 ×1,00 | 53 ×0,95 | 105 ×1,00 |
| Charmander | 50 ×1 | 47 ×1,05 | 64 ×1,05 | 121 ×1,05 |
| Squirtle | 37 ×1 | 32 ×1 | 46 ×1 | 87 ×1 |
| Pikachu | 53 ×1 | 52 ×1,05 | 64 ×1 | 127 ×1,05 |
| Gengar | 34 ×0,85 | 37 ×1,05 | 46 ×0,95 | 95 ×1,05 |
| Voltorb | 46 ×1 | 42 ×1,05 | 55 ×1 | 108 ×1,05 |
| Eevee | 46 ×1 | 42 ×1 | 55 ×1 | 103 ×1 |
| Lucario | 34 ×0,95 | 32 ×1,05 | 38 ×0,90 | 85 ×1,05 |
| Greninja | 37 ×1 | 32 ×1 | 45 ×1 | 84 ×1 |
| Mewtwo | 29 ×1 | 27 ×1 | 36 ×1 | 67 ×1 |
| Mew | 27 ×1 | 22 ×1 | 33 ×1 | 61 ×1 |
| Onix | 17 ×0,95 | 12 ×1,05 | 20 ×0,95 | 42 ×1,05 |
| Scyther | 32 ×1 | 21 ×0,81 | 42 ×1,10 | 58 ×0,81 |
| Gyarados | 33 ×1 | 21 ×0,85 | 40 ×1,05 | 62 ×0,85 |
| Tyranitar | 22 ×0,95 | 22 ×1,05 | 30 ×1 | 58 ×1,05 |
| Articuno | 27 ×1 | 17 ×0,85 | 36 ×1,10 | 51 ×0,85 |
| Zapdos | 31 ×1 | 22 ×0,89 | 38 ×1,05 | 62 ×0,89 |
| Moltres | 29 ×1 | 22 ×0,89 | 39 ×1,10 | 59 ×0,89 |
| Raikou | 34 ×1 | 32 ×1,05 | 41 ×1 | 80 ×1,05 |
| Entei | 31 ×1 | 27 ×1,05 | 38 ×1,05 | 73 ×1,05 |
| Suicune | 24 ×1 | 17 ×1 | 29 ×1 | 54 ×1 |
| Lugia | 22 ×1 | 12 ×0,85 | 27 ×1,05 | 41 ×0,85 |
| Ho-Oh | 29 ×1 | 22 ×0,89 | 39 ×1,10 | 59 ×0,89 |
| Celebi | 27 ×1 | 17 ×0,95 | 33 ×1 | 57 ×0,95 |
| Kyogre | 29 ×1 | 27 ×1 | 36 ×1 | 67 ×1 |
| Rayquaza | 29 ×1 | 21 ×0,85 | 37 ×1,05 | 56 ×0,85 |
| **Mediana de daño** | 31 | 25 | 39 | 65 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Celebi

Tipos: **Psychic / Grass** · HP 175 · Atk 120 · Def 120 · SpA 120 · SpD 120 · Vel 120

| Rival | Básica: Hoja Mágica<br>Grass · Esp · Pot 45 | Habilidad 1: Rayo Solar<br>Grass · Esp · Pot 85 | Habilidad 2: Deseo<br>Psychic · Estado · Pot — | Definitiva: Futuro Siniestro<br>Psychic · Esp · Pot 105 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 24 ×0,90 | 46 ×0,90 | Estado | 67 ×1,05 |
| Charmander | 31 ×0,95 | 60 ×0,95 | Estado | 77 ×1 |
| Squirtle | 29 ×1,05 | 54 ×1,05 | Estado | 65 ×1 |
| Pikachu | 33 ×1 | 64 ×1 | Estado | 77 ×1 |
| Gengar | 23 ×0,95 | 44 ×0,95 | Estado | 59 ×1,05 |
| Voltorb | 31 ×1 | 58 ×1 | Estado | 72 ×1 |
| Eevee | 27 ×1 | 51 ×1 | Estado | 64 ×1 |
| Lucario | 24 ×0,95 | 46 ×0,95 | Estado | 59 ×1,00 |
| Greninja | 27 ×1,05 | 51 ×1,05 | Estado | 50 ×0,85 |
| Mewtwo | 22 ×1 | 39 ×1 | Estado | 47 ×0,95 |
| Mew | 19 ×1 | 37 ×1 | Estado | 43 ×0,95 |
| Onix | 39 ×1,10 | 74 ×1,10 | Estado | 84 ×1 |
| Scyther | 21 ×0,90 | 39 ×0,90 | Estado | 54 ×1 |
| Gyarados | 18 ×1,00 | 36 ×1,00 | Estado | 46 ×1 |
| Tyranitar | 19 ×1,05 | 38 ×1,05 | Estado | 39 ×0,85 |
| Articuno | 15 ×0,95 | 28 ×0,95 | Estado | 38 ×1 |
| Zapdos | 20 ×0,95 | 37 ×0,95 | Estado | 50 ×1 |
| Moltres | 20 ×0,90 | 37 ×0,90 | Estado | 51 ×1 |
| Raikou | 19 ×1 | 37 ×1 | Estado | 46 ×1 |
| Entei | 23 ×0,95 | 44 ×0,95 | Estado | 57 ×1 |
| Suicune | 17 ×1,05 | 34 ×1,05 | Estado | 40 ×1 |
| Lugia | 12 ×0,95 | 23 ×0,95 | Estado | 29 ×0,95 |
| Ho-Oh | 11 ×0,90 | 22 ×0,90 | Estado | 31 ×1 |
| Kyogre | 14 ×1,05 | 29 ×1,05 | Estado | 34 ×1 |
| Groudon | 23 ×1,05 | 40 ×1,05 | Estado | 50 ×1 |
| Rayquaza | 19 ×0,90 | 35 ×0,90 | Estado | 50 ×1 |
| **Mediana de daño** | 22 | 39 | — | 50 |
| **Efectividad mediana** | ×1,00 | ×1,00 | ×1 | ×1 |

## Lugia

Tipos: **Psychic / Flying** · HP 181 · Atk 110 · Def 150 · SpA 110 · SpD 174 · Vel 130

| Rival | Básica: Onda Mental<br>Psychic · Esp · Pot 50 | Habilidad 1: Marea<br>Water · Esp · Pot 30/s | Habilidad 2: Ciclón<br>Flying · Esp · Pot 45/s | Definitiva: Aerochorro<br>Flying · Esp · Pot 120 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 29 ×1,05 | 32 ×0,95 | 56 ×1,05 | 70 ×1,05 |
| Charmander | 34 ×1 | 47 ×1,05 | 67 ×1 | 80 ×1 |
| Squirtle | 28 ×1 | 32 ×0,95 | 56 ×1 | 68 ×1 |
| Pikachu | 34 ×1 | 47 ×1 | 62 ×0,95 | 76 ×0,95 |
| Gengar | 26 ×1,05 | 32 ×1 | 52 ×1 | 60 ×1 |
| Voltorb | 32 ×1 | 42 ×1 | 57 ×0,95 | 72 ×0,95 |
| Eevee | 28 ×1 | 37 ×1 | 56 ×1 | 67 ×1 |
| Lucario | 25 ×1,00 | 37 ×1 | 51 ×1,00 | 63 ×1,00 |
| Greninja | 22 ×0,85 | 27 ×0,95 | 52 ×1 | 63 ×1 |
| Mewtwo | 21 ×0,95 | 27 ×1 | 42 ×1 | 51 ×1 |
| Mew | 19 ×0,95 | 27 ×1 | 42 ×1 | 48 ×1 |
| Onix | 37 ×1 | 57 ×1,10 | 67 ×0,95 | 83 ×0,95 |
| Scyther | 25 ×1 | 32 ×1 | 47 ×1,05 | 59 ×1,05 |
| Gyarados | 21 ×1 | 22 ×0,95 | 42 ×1 | 48 ×1 |
| Tyranitar | 17 ×0,85 | 27 ×1,05 | 37 ×0,95 | 45 ×0,95 |
| Articuno | 16 ×1 | 22 ×1 | 32 ×1 | 39 ×1 |
| Zapdos | 23 ×1 | 27 ×1 | 37 ×0,95 | 48 ×0,95 |
| Moltres | 24 ×1 | 27 ×1,05 | 47 ×1 | 54 ×1 |
| Raikou | 21 ×1 | 27 ×1 | 37 ×0,95 | 45 ×0,95 |
| Entei | 25 ×1 | 32 ×1,05 | 52 ×1 | 60 ×1 |
| Suicune | 17 ×1 | 17 ×0,95 | 37 ×1 | 43 ×1 |
| Ho-Oh | 13 ×1 | 17 ×1,05 | 27 ×1 | 33 ×1 |
| Celebi | 19 ×0,95 | 22 ×0,95 | 42 ×1,05 | 50 ×1,05 |
| Kyogre | 15 ×1 | 12 ×0,95 | 27 ×1 | 36 ×1 |
| Groudon | 23 ×1 | 27 ×1,05 | 42 ×1 | 51 ×1 |
| Rayquaza | 23 ×1 | 22 ×0,95 | 42 ×1 | 51 ×1 |
| **Mediana de daño** | 23 | 27 | 45 | 53 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Ho-Oh

Tipos: **Fire / Flying** · HP 181 · Atk 150 · Def 110 · SpA 130 · SpD 174 · Vel 110

| Rival | Básica: Golpe Ala<br>Flying · Fís · Pot 55 | Habilidad 1: Pájaro Osado<br>Flying · Fís · Pot 100 | Habilidad 2: Recuperación<br>Fire · Estado · Pot — | Definitiva: Fuego Sagrado<br>Fire · Fís · Pot 50/s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 53 ×1,05 | 97 ×1,05 | Estado | 71 ×1,05 |
| Charmander | 56 ×1 | 102 ×1 | Estado | 70 ×0,95 |
| Squirtle | 42 ×1 | 76 ×1 | Estado | 50 ×0,95 |
| Pikachu | 56 ×0,95 | 102 ×0,95 | Estado | 77 ×1 |
| Gengar | 45 ×1 | 80 ×1 | Estado | 57 ×1 |
| Voltorb | 48 ×0,95 | 87 ×0,95 | Estado | 68 ×1 |
| Eevee | 51 ×1 | 92 ×1 | Estado | 68 ×1 |
| Lucario | 38 ×1,00 | 71 ×1,00 | Estado | 50 ×1,05 |
| Greninja | 40 ×1 | 74 ×1 | Estado | 47 ×0,95 |
| Mewtwo | 33 ×1 | 59 ×1 | Estado | 41 ×1 |
| Mew | 30 ×1 | 54 ×1 | Estado | 37 ×1 |
| Onix | 19 ×0,95 | 34 ×0,95 | Estado | 23 ×0,95 |
| Scyther | 37 ×1,05 | 68 ×1,05 | Estado | 44 ×1,05 |
| Gyarados | 36 ×1 | 65 ×1 | Estado | 41 ×0,95 |
| Tyranitar | 25 ×0,95 | 47 ×0,95 | Estado | 31 ×0,95 |
| Articuno | 30 ×1 | 54 ×1 | Estado | 37 ×1,05 |
| Zapdos | 32 ×0,95 | 57 ×0,95 | Estado | 41 ×1 |
| Moltres | 33 ×1 | 59 ×1 | Estado | 38 ×0,95 |
| Raikou | 36 ×0,95 | 64 ×0,95 | Estado | 47 ×1 |
| Entei | 34 ×1 | 61 ×1 | Estado | 38 ×0,95 |
| Suicune | 26 ×1 | 48 ×1 | Estado | 31 ×0,95 |
| Lugia | 25 ×1 | 44 ×1 | Estado | 32 ×1 |
| Celebi | 31 ×1,05 | 56 ×1,05 | Estado | 37 ×1,05 |
| Kyogre | 33 ×1 | 59 ×1 | Estado | 38 ×0,95 |
| Groudon | 23 ×1 | 40 ×1 | Estado | 29 ×1 |
| Rayquaza | 33 ×1 | 59 ×1 | Estado | 38 ×0,95 |
| **Mediana de daño** | 34 | 60 | — | 41 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Gyarados

Tipos: **Water / Flying** · HP 170 · Atk 145 · Def 99 · SpA 80 · SpD 120 · Vel 101

| Rival | Básica: Acua Cola<br>Water · Fís · Pot 55 | Habilidad 1: Cascada<br>Water · Fís · Pot 70 | Habilidad 2: Triturar<br>Dark · Fís · Pot 85 | Definitiva: Dragoaliento<br>Dragon · Fís · Pot 150 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 47 ×0,95 | 60 ×0,95 | 74 ×1 | 129 ×1 |
| Charmander | 56 ×1,05 | 72 ×1,05 | 81 ×1 | 141 ×1 |
| Squirtle | 38 ×0,95 | 48 ×0,95 | 60 ×1 | 105 ×1 |
| Pikachu | 57 ×1 | 73 ×1 | 85 ×1 | 148 ×1 |
| Gengar | 43 ×1 | 54 ×1 | 66 ×1,05 | 111 ×1 |
| Voltorb | 50 ×1 | 63 ×1 | 73 ×1 | 127 ×1 |
| Eevee | 50 ×1 | 63 ×1 | 73 ×1 | 127 ×1 |
| Lucario | 38 ×1 | 49 ×1 | 54 ×0,95 | 94 ×0,95 |
| Greninja | 37 ×0,95 | 48 ×0,95 | 56 ×0,95 | 103 ×1 |
| Mewtwo | 31 ×1 | 39 ×1 | 49 ×1,05 | 82 ×1 |
| Mew | 29 ×1 | 37 ×1 | 45 ×1,05 | 74 ×1 |
| Onix | 20 ×1,10 | 27 ×1,10 | 29 ×1 | 50 ×1 |
| Scyther | 35 ×1 | 44 ×1 | 51 ×1 | 89 ×1 |
| Tyranitar | 27 ×1,05 | 35 ×1,05 | 37 ×0,95 | 69 ×1 |
| Articuno | 29 ×1 | 37 ×1 | 43 ×1 | 74 ×1 |
| Zapdos | 33 ×1 | 42 ×1 | 49 ×1 | 86 ×1 |
| Moltres | 32 ×1,05 | 40 ×1,05 | 47 ×1 | 82 ×1 |
| Raikou | 36 ×1 | 47 ×1 | 54 ×1 | 94 ×1 |
| Entei | 34 ×1,05 | 44 ×1,05 | 49 ×1 | 86 ×1 |
| Suicune | 23 ×0,95 | 31 ×0,95 | 38 ×1 | 66 ×1 |
| Lugia | 24 ×1 | 29 ×1 | 36 ×1,05 | 60 ×1 |
| Ho-Oh | 32 ×1,05 | 40 ×1,05 | 47 ×1 | 82 ×1 |
| Celebi | 27 ×0,95 | 35 ×0,95 | 45 ×1,05 | 74 ×1 |
| Kyogre | 29 ×0,95 | 37 ×0,95 | 47 ×1 | 82 ×1 |
| Groudon | 23 ×1,05 | 28 ×1,05 | 32 ×1 | 56 ×1 |
| Rayquaza | 29 ×0,95 | 37 ×0,95 | 47 ×1 | 86 ×1,05 |
| **Mediana de daño** | 33 | 41 | 49 | 86 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Suicune

Tipos: **Water** · HP 175 · Atk 95 · Def 135 · SpA 110 · SpD 135 · Vel 105

| Rival | Básica: Golpe Cuerpo<br>Normal · Fís · Pot 80 | Habilidad 1: Chorro de Agua<br>Water · Esp · Pot 68 | Habilidad 2: Rayo Hielo<br>Ice · Esp · Pot 90 | Definitiva: Frío Polar<br>Ice · Esp · Pot 140 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 46 ×1 | 36 ×0,95 | 51 ×1,05 | 77 ×1,05 |
| Charmander | 50 ×1 | 49 ×1,05 | 56 ×0,95 | 85 ×0,95 |
| Squirtle | 37 ×1 | 36 ×0,95 | 46 ×0,95 | 71 ×0,95 |
| Pikachu | 52 ×1 | 47 ×1 | 59 ×1 | 90 ×1 |
| Gengar | 33 ×0,85 | 34 ×1 | 43 ×1 | 67 ×1 |
| Voltorb | 45 ×1 | 43 ×1 | 55 ×1 | 85 ×1 |
| Eevee | 45 ×1 | 38 ×1 | 49 ×1 | 74 ×1 |
| Lucario | 34 ×0,95 | 36 ×1 | 43 ×0,95 | 67 ×0,95 |
| Greninja | 37 ×1 | 34 ×0,95 | 42 ×0,95 | 66 ×0,95 |
| Mewtwo | 29 ×1 | 29 ×1 | 37 ×1 | 58 ×1 |
| Mew | 26 ×1 | 27 ×1 | 35 ×1 | 53 ×1 |
| Onix | 17 ×0,95 | 55 ×1,10 | 66 ×1,05 | 102 ×1,05 |
| Scyther | 32 ×1 | 32 ×1 | 43 ×1,05 | 66 ×1,05 |
| Gyarados | 32 ×1 | 25 ×0,95 | 34 ×1,00 | 52 ×1,00 |
| Tyranitar | 22 ×0,95 | 28 ×1,05 | 35 ×1 | 53 ×1 |
| Articuno | 26 ×1 | 23 ×1 | 28 ×1,00 | 43 ×1,00 |
| Zapdos | 30 ×1 | 29 ×1 | 38 ×1,05 | 60 ×1,05 |
| Moltres | 29 ×1 | 32 ×1,05 | 38 ×1,00 | 60 ×1,00 |
| Raikou | 34 ×1 | 27 ×1 | 35 ×1 | 53 ×1 |
| Entei | 30 ×1 | 35 ×1,05 | 40 ×0,95 | 63 ×0,95 |
| Lugia | 22 ×1 | 18 ×1 | 25 ×1,05 | 38 ×1,05 |
| Ho-Oh | 29 ×1 | 18 ×1,05 | 23 ×1,00 | 36 ×1,00 |
| Celebi | 26 ×1 | 25 ×0,95 | 36 ×1,05 | 55 ×1,05 |
| Kyogre | 29 ×1 | 19 ×0,95 | 24 ×0,95 | 38 ×0,95 |
| Groudon | 20 ×1 | 30 ×1,05 | 38 ×1,05 | 60 ×1,05 |
| Rayquaza | 29 ×1 | 27 ×0,95 | 40 ×1,10 | 63 ×1,10 |
| **Mediana de daño** | 30 | 31 | 39 | 62 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Kyogre

Tipos: **Water** · HP 175 · Atk 120 · Def 110 · SpA 170 · SpD 160 · Vel 110

| Rival | Básica: Ráfaga Marina<br>Water · Esp · Pot 46 | Habilidad 1: Remolino Marino<br>Water · Esp · Pot 34/s | Habilidad 2: Aguas Curativas<br>Water · Estado · Pot — | Definitiva: Pulso Primigenio<br>Water · Esp · Pot 160/s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 37 ×0,95 | 57 ×0,95 | Estado | 128 ×0,95 |
| Charmander | 51 ×1,05 | 82 ×1,05 | Estado | 173 ×1,05 |
| Squirtle | 37 ×0,95 | 62 ×0,95 | Estado | 130 ×0,95 |
| Pikachu | 49 ×1 | 82 ×1 | Estado | 165 ×1 |
| Gengar | 36 ×1 | 61 ×1 | Estado | 120 ×1 |
| Voltorb | 45 ×1 | 72 ×1 | Estado | 153 ×1 |
| Eevee | 39 ×1 | 62 ×1 | Estado | 136 ×1 |
| Lucario | 38 ×1 | 62 ×1 | Estado | 129 ×1 |
| Greninja | 35 ×0,95 | 56 ×0,95 | Estado | 119 ×0,95 |
| Mewtwo | 31 ×1 | 52 ×1 | Estado | 104 ×1 |
| Mew | 28 ×1 | 47 ×1 | Estado | 96 ×1 |
| Onix | 56 ×1,10 | 92 ×1,10 | Estado | 197 ×1,10 |
| Scyther | 34 ×1 | 56 ×1 | Estado | 114 ×1 |
| Gyarados | 26 ×0,95 | 42 ×0,95 | Estado | 90 ×0,95 |
| Tyranitar | 29 ×1,05 | 47 ×1,05 | Estado | 100 ×1,05 |
| Articuno | 24 ×1 | 37 ×1 | Estado | 78 ×1 |
| Zapdos | 31 ×1 | 52 ×1 | Estado | 104 ×1 |
| Moltres | 33 ×1,05 | 56 ×1,05 | Estado | 112 ×1,05 |
| Raikou | 28 ×1 | 47 ×1 | Estado | 96 ×1 |
| Entei | 37 ×1,05 | 61 ×1,05 | Estado | 125 ×1,05 |
| Suicune | 23 ×0,95 | 37 ×0,95 | Estado | 80 ×0,95 |
| Lugia | 19 ×1 | 32 ×1 | Estado | 66 ×1 |
| Ho-Oh | 19 ×1,05 | 32 ×1,05 | Estado | 68 ×1,05 |
| Celebi | 26 ×0,95 | 42 ×0,95 | Estado | 90 ×0,95 |
| Groudon | 32 ×1,05 | 52 ×1,05 | Estado | 108 ×1,05 |
| Rayquaza | 29 ×0,95 | 47 ×0,95 | Estado | 98 ×0,95 |
| **Mediana de daño** | 33 | 54 | — | 110 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Rayquaza

Tipos: **Dragon / Flying** · HP 180 · Atk 170 · Def 110 · SpA 170 · SpD 110 · Vel 115

| Rival | Básica: Garra Dragón<br>Dragon · Fís · Pot 50 | Habilidad 1: Vuelo Dragón<br>Flying · Fís · Pot 70 | Habilidad 2: Furia Dragón<br>Dragon · Esp · Pot 85 | Definitiva: Ascenso Draco<br>Flying · Fís · Pot 130 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 53 ×1 | 77 ×1,05 | 73 ×1 | 143 ×1,05 |
| Charmander | 58 ×1 | 81 ×1 | 89 ×1 | 151 ×1 |
| Squirtle | 44 ×1 | 60 ×1 | 74 ×1 | 112 ×1 |
| Pikachu | 61 ×1 | 81 ×0,95 | 89 ×1 | 150 ×0,95 |
| Gengar | 46 ×1 | 64 ×1 | 65 ×1 | 118 ×1 |
| Voltorb | 52 ×1 | 69 ×0,95 | 82 ×1 | 128 ×0,95 |
| Eevee | 52 ×1 | 73 ×1 | 73 ×1 | 135 ×1 |
| Lucario | 38 ×0,95 | 56 ×1,00 | 65 ×0,95 | 105 ×1,00 |
| Greninja | 42 ×1 | 59 ×1 | 68 ×1 | 109 ×1 |
| Mewtwo | 34 ×1 | 47 ×1 | 56 ×1 | 87 ×1 |
| Mew | 31 ×1 | 43 ×1 | 51 ×1 | 79 ×1 |
| Onix | 21 ×1 | 27 ×0,95 | 95 ×1 | 50 ×0,95 |
| Scyther | 37 ×1 | 53 ×1,05 | 63 ×1 | 99 ×1,05 |
| Gyarados | 37 ×1 | 51 ×1 | 51 ×1 | 96 ×1 |
| Tyranitar | 28 ×1 | 37 ×0,95 | 51 ×1 | 69 ×0,95 |
| Articuno | 31 ×1 | 43 ×1 | 43 ×1 | 79 ×1 |
| Zapdos | 35 ×1 | 46 ×0,95 | 56 ×1 | 85 ×0,95 |
| Moltres | 34 ×1 | 47 ×1 | 59 ×1 | 87 ×1 |
| Raikou | 38 ×1 | 51 ×0,95 | 51 ×1 | 95 ×0,95 |
| Entei | 35 ×1 | 49 ×1 | 65 ×1 | 90 ×1 |
| Suicune | 27 ×1 | 38 ×1 | 47 ×1 | 71 ×1 |
| Lugia | 25 ×1 | 34 ×1 | 36 ×1 | 64 ×1 |
| Ho-Oh | 34 ×1 | 47 ×1 | 36 ×1 | 87 ×1 |
| Celebi | 31 ×1 | 45 ×1,05 | 51 ×1 | 82 ×1,05 |
| Kyogre | 34 ×1 | 47 ×1 | 38 ×1 | 87 ×1 |
| Groudon | 24 ×1 | 32 ×1 | 56 ×1 | 59 ×1 |
| **Mediana de daño** | 35 | 48 | 58 | 89 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Medianas por Pokémon

Resumen de las medianas de cada sección. `Combo` es la mediana del daño de los cuatro ataques sumados contra cada rival; las habilidades de estado cuentan como 0 en esa columna.

| Pokémon | Básica | Habilidad 1 | Habilidad 2 | Definitiva | Combo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pikachu | 17 | 18 | 19 | 36 | 91 |
| Voltorb | 16 | 20 | — | 59 | 97 |
| Gengar | 14 | 38 | 27 | 49 | 128 |
| Bulbasaur | 15 | — | 33 | 52 | 99 |
| Charmander | 16 | 23 | 32 | 40 | 111 |
| Squirtle | 15 | 18 | 24 | 39 | 94 |
| Lucario | 24 | 28 | 31 | 63 | 143 |
| Greninja | 22 | 31 | 25 | 41 | 118 |
| Articuno | 24 | 43 | 27 | 49 | 142 |
| Zapdos | 27 | — | 45 | 87 | 159 |
| Moltres | 27 | 37 | 34 | 55 | 152 |
| Mewtwo | 31 | — | 55 | 69 | 155 |
| Mew | 22 | — | 40 | — | 62 |
| Scyther | 24 | 31 | — | 66 | 121 |
| Tyranitar | 32 | 36 | 22 | 59 | 147 |
| Onix | 17 | 25 | 22 | 38 | 101 |
| Groudon | 31 | 25 | 39 | 65 | 158 |
| Celebi | 22 | 39 | — | 50 | 111 |
| Lugia | 23 | 27 | 45 | 53 | 148 |
| Ho-Oh | 34 | 60 | — | 41 | 133 |
| Gyarados | 33 | 41 | 49 | 86 | 206 |
| Suicune | 30 | 31 | 39 | 62 | 159 |
| Kyogre | 33 | 54 | — | 110 | 197 |
| Rayquaza | 35 | 48 | 58 | 89 | 231 |

## Pokémon sin moveset

Estas especies del roster todavía no tienen ataques asignados en `MOVESETS`, así que no pueden usarse como atacantes. Sí aparecen como rivales en las tablas anteriores porque el daño recibido solo depende de sus tipos y estadísticas.

| Pokémon | Tipos |
| --- | --- |
| Eevee | Normal |
| Raikou | Electric |
| Entei | Fire |

## Cobertura

Atacantes con moveset asignado: **24** de 27 especies del roster. Los rivales incluyen las 27 especies, tengan o no moveset, porque el daño solo depende de sus tipos y estadísticas.
