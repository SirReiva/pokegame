# Tabla de daño por Pokémon y ataque

> Generado automáticamente por `node scripts/generate-damage-matrix.mjs` a partir de `abilities.ts`, `pokedex.ts`, `combat.ts`, `typeChart.ts` y el manifiesto de sprites. No editar a mano.

## Cómo leer las tablas

- **Agrupación**: una sección por Pokémon atacante y una fila por rival. Cada columna es uno de sus cuatro ataques.
- **Celda**: daño esperado de un lanzamiento completo y, al lado, la efectividad de ese tipo contra el rival.
- **Daño esperado**: nivel 50, IV 31, EV 0, naturaleza neutra, sin buffs, random medio 0,925, crítico 1/24 (×1,5) y precisión aplicada. STAB incluido.
- **Áreas**: se valoran con el rival en el centro (100 %). En el borde el daño radial baja hasta `radialMinDamage`.
- **Áreas `overTime`**: el total suma todos los ticks (`ceil(duración / intervalo)`) con potencia por tick = `power × intervalo`.
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
- [Moltres](#moltres)
- [Mewtwo](#mewtwo)
- [Mew](#mew)
- [Scyther](#scyther)
- [Tyranitar](#tyranitar)
- [Onix](#onix)
- [Groudon](#groudon)
- [Celebi](#celebi)
- [Lugia](#lugia)

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
| Groudon | 12 ×1 | 12 ×1 | 0 ×0 | 0 ×0 |
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
| Groudon | 0 ×0 | 13 ×1 | Estado (×0) | 0 ×0 |
| **Mediana de daño** | 31 | 20 | — | 102 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Gengar

Tipos: **Ghost / Poison** · HP 135 · Atk 85 · Def 80 · SpA 150 · SpD 95 · Vel 130

| Rival | Básica: Lengüetazo<br>Ghost · Fís · Pot 42 | Habilidad 1: Bola Sombra<br>Ghost · Esp · Pot 62 | Habilidad 2: Bomba Lodo<br>Poison · Esp · Pot 20/s | Definitiva: Come Sueños<br>Ghost · Esp · Pot 80 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 34 ×1 | 70 ×1 | 61 ×1 | 90 ×1 |
| Charmander | 37 ×1 | 84 ×1 | 76 ×1 | 108 ×1 |
| Squirtle | 28 ×1 | 70 ×1 | 61 ×1 | 90 ×1 |
| Pikachu | 38 ×1 | 84 ×1 | 76 ×1 | 108 ×1 |
| Voltorb | 34 ×1 | 78 ×1 | 66 ×1 | 101 ×1 |
| Eevee | 0 ×0 | 0 ×0 | 61 ×1 | 0 ×0 |
| Lucario | 26 ×1 | 65 ×1 | 0 ×0 | 84 ×1 |
| Greninja | 13 ×½ | 32 ×½ | 61 ×1 | 42 ×½ |
| Mewtwo | 43 ×2 | 110 ×2 | 51 ×1 | 141 ×2 |
| Mew | 39 ×2 | 100 ×2 | 46 ×1 | 129 ×2 |
| Onix | 13 ×1 | 90 ×1 | 20 ×¼ | 116 ×1 |
| Scyther | 23 ×1 | 58 ×1 | 51 ×1 | 75 ×1 |
| Gyarados | 23 ×1 | 50 ×1 | 46 ×1 | 64 ×1 |
| Tyranitar | 9 ×½ | 25 ×½ | 20 ×½ | 32 ×½ |
| Articuno | 19 ×1 | 41 ×1 | 36 ×1 | 53 ×1 |
| Zapdos | 22 ×1 | 55 ×1 | 51 ×1 | 70 ×1 |
| Moltres | 22 ×1 | 56 ×1 | 51 ×1 | 74 ×1 |
| Raikou | 25 ×1 | 50 ×1 | 46 ×1 | 64 ×1 |
| Entei | 22 ×1 | 62 ×1 | 51 ×1 | 80 ×1 |
| Suicune | 18 ×1 | 44 ×1 | 36 ×1 | 56 ×1 |
| Lugia | 33 ×2 | 69 ×2 | 31 ×1 | 88 ×2 |
| Ho-Oh | 22 ×1 | 35 ×1 | 31 ×1 | 44 ×1 |
| Celebi | 39 ×2 | 100 ×2 | 92 ×2 | 129 ×2 |
| Groudon | 15 ×1 | 55 ×1 | 26 ×½ | 70 ×1 |
| **Mediana de daño** | 23 | 60 | 51 | 77 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Bulbasaur

Tipos: **Grass / Poison** · HP 120 · Atk 69 · Def 69 · SpA 85 · SpD 85 · Vel 65

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 | Habilidad 1: Paralizador<br>Grass · Estado · Pot — | Habilidad 2: Hoja Afilada<br>Grass · Esp · Pot 100 | Definitiva: Lluevehojas<br>Grass · Esp · Pot 160 |
| --- | ---: | ---: | ---: | ---: |
| Charmander | 26 ×1 | Estado | 38 ×½ | 58 ×½ |
| Squirtle | 19 ×1 | Estado | 129 ×2 | 194 ×2 |
| Pikachu | 27 ×1 | Estado | 77 ×1 | 116 ×1 |
| Gengar | 0 ×0 | Estado | 28 ×½ | 43 ×½ |
| Voltorb | 23 ×1 | Estado | 71 ×1 | 108 ×1 |
| Eevee | 23 ×1 | Estado | 64 ×1 | 96 ×1 |
| Lucario | 9 ×½ | Estado | 30 ×½ | 45 ×½ |
| Greninja | 19 ×1 | Estado | 119 ×2 | 177 ×2 |
| Mewtwo | 15 ×1 | Estado | 50 ×1 | 74 ×1 |
| Mew | 13 ×1 | Estado | 46 ×1 | 68 ×1 |
| Onix | 5 ×½ | Estado | 331 ×4 | 501 ×4 |
| Scyther | 16 ×1 | Estado | 13 ×¼ | 20 ×¼ |
| Gyarados | 16 ×1 | Estado | 46 ×1 | 68 ×1 |
| Tyranitar | 6 ×½ | Estado | 92 ×2 | 136 ×2 |
| Articuno | 13 ×1 | Estado | 18 ×½ | 28 ×½ |
| Zapdos | 15 ×1 | Estado | 25 ×½ | 37 ×½ |
| Moltres | 15 ×1 | Estado | 12 ×¼ | 18 ×¼ |
| Raikou | 17 ×1 | Estado | 46 ×1 | 68 ×1 |
| Entei | 15 ×1 | Estado | 28 ×½ | 43 ×½ |
| Suicune | 12 ×1 | Estado | 80 ×2 | 122 ×2 |
| Lugia | 12 ×1 | Estado | 15 ×½ | 23 ×½ |
| Ho-Oh | 15 ×1 | Estado | 7 ×¼ | 12 ×¼ |
| Celebi | 13 ×1 | Estado | 22 ×½ | 34 ×½ |
| Groudon | 11 ×1 | Estado | 100 ×2 | 147 ×2 |
| **Mediana de daño** | 15 | — | 46 | 68 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Charmander

Tipos: **Fire** · HP 114 · Atk 72 · Def 63 · SpA 80 · SpD 70 · Vel 85

| Rival | Básica: Arañazo<br>Normal · Fís · Pot 55 | Habilidad 1: Giro Fuego<br>Fire · Esp · Pot 40/s | Habilidad 2: Lanzallamas<br>Fire · Esp · Pot 100 | Definitiva: Anillo Ígneo<br>Fire · Esp · Pot 130 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 25 ×1 | 105 ×2 | 119 ×2 | 130 ×2 |
| Squirtle | 20 ×1 | 26 ×½ | 30 ×½ | 33 ×½ |
| Pikachu | 29 ×1 | 68 ×1 | 74 ×1 | 79 ×1 |
| Gengar | 0 ×0 | 47 ×1 | 55 ×1 | 60 ×1 |
| Voltorb | 25 ×1 | 62 ×1 | 67 ×1 | 75 ×1 |
| Eevee | 25 ×1 | 52 ×1 | 59 ×1 | 65 ×1 |
| Lucario | 9 ×½ | 105 ×2 | 112 ×2 | 125 ×2 |
| Greninja | 20 ×1 | 26 ×½ | 28 ×½ | 31 ×½ |
| Mewtwo | 15 ×1 | 47 ×1 | 47 ×1 | 50 ×1 |
| Mew | 14 ×1 | 37 ×1 | 43 ×1 | 48 ×1 |
| Onix | 5 ×½ | 31 ×½ | 39 ×½ | 43 ×½ |
| Scyther | 17 ×1 | 94 ×2 | 104 ×2 | 111 ×2 |
| Gyarados | 17 ×1 | 16 ×½ | 21 ×½ | 23 ×½ |
| Tyranitar | 6 ×½ | 16 ×½ | 21 ×½ | 23 ×½ |
| Articuno | 14 ×1 | 62 ×2 | 74 ×2 | 78 ×2 |
| Zapdos | 16 ×1 | 47 ×1 | 47 ×1 | 50 ×1 |
| Moltres | 15 ×1 | 21 ×½ | 25 ×½ | 26 ×½ |
| Raikou | 18 ×1 | 37 ×1 | 43 ×1 | 48 ×1 |
| Entei | 16 ×1 | 21 ×½ | 28 ×½ | 30 ×½ |
| Suicune | 12 ×1 | 16 ×½ | 18 ×½ | 21 ×½ |
| Lugia | 12 ×1 | 31 ×1 | 31 ×1 | 32 ×1 |
| Ho-Oh | 15 ×1 | 16 ×½ | 15 ×½ | 16 ×½ |
| Celebi | 14 ×1 | 74 ×2 | 86 ×2 | 95 ×2 |
| Groudon | 11 ×1 | 47 ×1 | 47 ×1 | 50 ×1 |
| **Mediana de daño** | 15 | 42 | 45 | 49 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Squirtle

Tipos: **Water** · HP 119 · Atk 68 · Def 85 · SpA 70 · SpD 84 · Vel 63

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 | Habilidad 1: Acua Jet<br>Water · Fís · Pot 65 | Habilidad 2: Rayo Burbuja<br>Water · Esp · Pot 80 | Definitiva: Hidrobomba<br>Water · Esp · Pot 140 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 23 ×1 | 20 ×½ | 20 ×½ | 33 ×½ |
| Charmander | 26 ×1 | 88 ×2 | 104 ×2 | 160 ×2 |
| Pikachu | 27 ×1 | 47 ×1 | 52 ×1 | 80 ×1 |
| Gengar | 0 ×0 | 37 ×1 | 37 ×1 | 59 ×1 |
| Voltorb | 23 ×1 | 40 ×1 | 47 ×1 | 74 ×1 |
| Eevee | 23 ×1 | 40 ×1 | 41 ×1 | 66 ×1 |
| Lucario | 9 ×½ | 32 ×1 | 40 ×1 | 62 ×1 |
| Greninja | 18 ×1 | 16 ×½ | 19 ×½ | 30 ×½ |
| Mewtwo | 14 ×1 | 26 ×1 | 34 ×1 | 51 ×1 |
| Mew | 13 ×1 | 25 ×1 | 31 ×1 | 47 ×1 |
| Onix | 5 ×½ | 65 ×4 | 220 ×4 | 342 ×4 |
| Scyther | 16 ×1 | 29 ×1 | 37 ×1 | 56 ×1 |
| Gyarados | 16 ×1 | 14 ×½ | 15 ×½ | 23 ×½ |
| Tyranitar | 6 ×½ | 43 ×2 | 61 ×2 | 94 ×2 |
| Articuno | 13 ×1 | 25 ×1 | 25 ×1 | 39 ×1 |
| Zapdos | 15 ×1 | 28 ×1 | 34 ×1 | 51 ×1 |
| Moltres | 14 ×1 | 51 ×2 | 69 ×2 | 107 ×2 |
| Raikou | 17 ×1 | 31 ×1 | 31 ×1 | 47 ×1 |
| Entei | 15 ×1 | 55 ×2 | 74 ×2 | 118 ×2 |
| Suicune | 12 ×1 | 10 ×½ | 13 ×½ | 20 ×½ |
| Lugia | 11 ×1 | 18 ×1 | 22 ×1 | 33 ×1 |
| Ho-Oh | 14 ×1 | 51 ×2 | 43 ×2 | 66 ×2 |
| Celebi | 13 ×1 | 12 ×½ | 15 ×½ | 23 ×½ |
| Groudon | 11 ×1 | 37 ×2 | 67 ×2 | 101 ×2 |
| **Mediana de daño** | 14 | 31 | 37 | 57 |
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
| Groudon | 25 ×1 | 19 ×1 | 47 ×1 | 64 ×1 |
| **Mediana de daño** | 28 | 28 | 37 | 74 |
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
| Groudon | 61 ×2 | 31 ×1 | 23 ×1 | 59 ×1 |
| **Mediana de daño** | 34 | 50 | 37 | 73 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Articuno

Tipos: **Ice / Flying** · HP 165 · Atk 105 · Def 120 · SpA 115 · SpD 145 · Vel 105

| Rival | Básica: Golpe Ala<br>Flying · Fís · Pot 55 | Habilidad 1: Rayo Hielo<br>Ice · Esp · Pot 90 | Habilidad 2: Viento Gélido<br>Ice · Esp · Pot 55 | Definitiva: Ventisca<br>Ice · Esp · Pot 100 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 106 ×2 | 153 ×2 | 89 ×2 | 154 ×2 |
| Charmander | 58 ×1 | 46 ×½ | 26 ×½ | 47 ×½ |
| Squirtle | 43 ×1 | 39 ×½ | 23 ×½ | 39 ×½ |
| Pikachu | 31 ×½ | 93 ×1 | 53 ×1 | 94 ×1 |
| Gengar | 46 ×1 | 68 ×1 | 41 ×1 | 69 ×1 |
| Voltorb | 27 ×½ | 87 ×1 | 52 ×1 | 86 ×1 |
| Eevee | 53 ×1 | 77 ×1 | 45 ×1 | 77 ×1 |
| Lucario | 41 ×1 | 37 ×½ | 20 ×½ | 36 ×½ |
| Greninja | 43 ×1 | 37 ×½ | 20 ×½ | 36 ×½ |
| Mewtwo | 35 ×1 | 59 ×1 | 35 ×1 | 61 ×1 |
| Mew | 32 ×1 | 55 ×1 | 33 ×1 | 55 ×1 |
| Onix | 10 ×½ | 202 ×2 | 116 ×2 | 200 ×2 |
| Scyther | 74 ×2 | 131 ×2 | 76 ×2 | 132 ×2 |
| Gyarados | 37 ×1 | 55 ×1 | 33 ×1 | 55 ×1 |
| Tyranitar | 14 ×½ | 55 ×1 | 33 ×1 | 55 ×1 |
| Zapdos | 18 ×½ | 119 ×2 | 70 ×2 | 121 ×2 |
| Moltres | 35 ×1 | 62 ×1 | 36 ×1 | 63 ×1 |
| Raikou | 18 ×½ | 55 ×1 | 33 ×1 | 55 ×1 |
| Entei | 37 ×1 | 34 ×½ | 20 ×½ | 34 ×½ |
| Suicune | 28 ×1 | 25 ×½ | 15 ×½ | 25 ×½ |
| Lugia | 25 ×1 | 76 ×2 | 43 ×2 | 77 ×2 |
| Ho-Oh | 35 ×1 | 38 ×1 | 21 ×1 | 39 ×1 |
| Celebi | 63 ×2 | 110 ×2 | 66 ×2 | 110 ×2 |
| Groudon | 23 ×1 | 119 ×2 | 70 ×2 | 121 ×2 |
| **Mediana de daño** | 35 | 61 | 35 | 62 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Moltres

Tipos: **Fire / Flying** · HP 165 · Atk 120 · Def 110 · SpA 145 · SpD 105 · Vel 110

| Rival | Básica: Ataque Aéreo<br>Flying · Fís · Pot 55 | Habilidad 1: Tajo Aéreo<br>Flying · Esp · Pot 65 | Habilidad 2: Onda Ígnea<br>Fire · Esp · Pot 60 | Definitiva: Ataque Celeste<br>Flying · Fís · Pot 115 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 123 ×2 | 141 ×2 | 124 ×2 | 228 ×2 |
| Charmander | 67 ×1 | 86 ×1 | 37 ×½ | 124 ×1 |
| Squirtle | 50 ×1 | 71 ×1 | 31 ×½ | 92 ×1 |
| Pikachu | 35 ×½ | 43 ×½ | 74 ×1 | 65 ×½ |
| Gengar | 53 ×1 | 62 ×1 | 55 ×1 | 97 ×1 |
| Voltorb | 30 ×½ | 40 ×½ | 71 ×1 | 55 ×½ |
| Eevee | 59 ×1 | 70 ×1 | 62 ×1 | 111 ×1 |
| Lucario | 47 ×1 | 67 ×1 | 116 ×2 | 86 ×1 |
| Greninja | 49 ×1 | 65 ×1 | 29 ×½ | 89 ×1 |
| Mewtwo | 38 ×1 | 55 ×1 | 48 ×1 | 72 ×1 |
| Mew | 37 ×1 | 50 ×1 | 44 ×1 | 66 ×1 |
| Onix | 12 ×½ | 46 ×½ | 40 ×½ | 22 ×½ |
| Scyther | 86 ×2 | 119 ×2 | 107 ×2 | 156 ×2 |
| Gyarados | 43 ×1 | 50 ×1 | 21 ×½ | 80 ×1 |
| Tyranitar | 16 ×½ | 25 ×½ | 21 ×½ | 30 ×½ |
| Articuno | 37 ×1 | 41 ×1 | 72 ×2 | 66 ×1 |
| Zapdos | 19 ×½ | 28 ×½ | 48 ×1 | 37 ×½ |
| Raikou | 22 ×½ | 25 ×½ | 44 ×1 | 41 ×½ |
| Entei | 40 ×1 | 62 ×1 | 27 ×½ | 74 ×1 |
| Suicune | 32 ×1 | 44 ×1 | 19 ×½ | 58 ×1 |
| Lugia | 29 ×1 | 35 ×1 | 32 ×1 | 52 ×1 |
| Ho-Oh | 38 ×1 | 35 ×1 | 16 ×½ | 72 ×1 |
| Celebi | 74 ×2 | 100 ×2 | 87 ×2 | 132 ×2 |
| Groudon | 28 ×1 | 55 ×1 | 48 ×1 | 50 ×1 |
| **Mediana de daño** | 38 | 53 | 46 | 72 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Mewtwo

Tipos: **Psychic** · HP 181 · Atk 130 · Def 110 · SpA 174 · SpD 110 · Vel 150

| Rival | Básica: Telequinesis<br>Psychic · Esp · Pot 45 | Habilidad 1: Teletransporte<br>Psychic · Estado · Pot — | Habilidad 2: Psíquico<br>Psychic · Esp · Pot 80 | Definitiva: Psicoataque<br>Psychic · Esp · Pot 100 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 117 ×2 | Estado | 208 ×2 | 246 ×2 |
| Charmander | 71 ×1 | Estado | 126 ×1 | 148 ×1 |
| Squirtle | 59 ×1 | Estado | 104 ×1 | 125 ×1 |
| Pikachu | 71 ×1 | Estado | 126 ×1 | 148 ×1 |
| Gengar | 106 ×2 | Estado | 186 ×2 | 217 ×2 |
| Voltorb | 65 ×1 | Estado | 116 ×1 | 140 ×1 |
| Eevee | 58 ×1 | Estado | 104 ×1 | 123 ×1 |
| Lucario | 56 ×1 | Estado | 98 ×1 | 116 ×1 |
| Greninja | 0 ×0 | Estado (×0) | 0 ×0 | 0 ×0 |
| Mew | 20 ×½ | Estado | 37 ×½ | 44 ×½ |
| Onix | 77 ×1 | Estado | 135 ×1 | 160 ×1 |
| Scyther | 50 ×1 | Estado | 89 ×1 | 105 ×1 |
| Gyarados | 41 ×1 | Estado | 75 ×1 | 87 ×1 |
| Tyranitar | 0 ×0 | Estado (×0) | 0 ×0 | 0 ×0 |
| Articuno | 35 ×1 | Estado | 61 ×1 | 71 ×1 |
| Zapdos | 46 ×1 | Estado | 80 ×1 | 94 ×1 |
| Moltres | 47 ×1 | Estado | 84 ×1 | 99 ×1 |
| Raikou | 41 ×1 | Estado | 75 ×1 | 87 ×1 |
| Entei | 53 ×1 | Estado | 93 ×1 | 109 ×1 |
| Suicune | 37 ×1 | Estado | 65 ×1 | 77 ×1 |
| Lugia | 14 ×½ | Estado | 26 ×½ | 30 ×½ |
| Ho-Oh | 29 ×1 | Estado | 52 ×1 | 61 ×1 |
| Celebi | 20 ×½ | Estado | 37 ×½ | 44 ×½ |
| Groudon | 46 ×1 | Estado | 80 ×1 | 94 ×1 |
| **Mediana de daño** | 46 | — | 82 | 97 |
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
| Groudon | 32 ×1 | Estado | 58 ×1 | Estado |
| **Mediana de daño** | 33 | — | 60 | — |
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
| Groudon | 25 ×1 | 32 ×1 | Estado | 67 ×1 |
| **Mediana de daño** | 29 | 46 | — | 82 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Tyranitar

Tipos: **Rock / Dark** · HP 175 · Atk 154 · Def 130 · SpA 115 · SpD 120 · Vel 81

| Rival | Básica: Triturar<br>Dark · Fís · Pot 50 | Habilidad 1: Avalancha<br>Rock · Fís · Pot 55 | Habilidad 2: Terremoto<br>Ground · Fís · Pot 18/s | Definitiva: Roca Afilada<br>Rock · Fís · Pot 90 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 71 ×1 | 35 ×½ | 46 ×1 | 51 ×½ |
| Charmander | 77 ×1 | 154 ×2 | 102 ×2 | 220 ×2 |
| Squirtle | 56 ×1 | 56 ×1 | 41 ×1 | 82 ×1 |
| Pikachu | 81 ×1 | 81 ×1 | 112 ×2 | 116 ×1 |
| Gengar | 123 ×2 | 30 ×½ | 82 ×2 | 44 ×½ |
| Voltorb | 70 ×1 | 69 ×1 | 92 ×2 | 100 ×1 |
| Eevee | 70 ×1 | 69 ×1 | 46 ×1 | 100 ×1 |
| Lucario | 28 ×½ | 13 ×¼ | 72 ×2 | 19 ×¼ |
| Greninja | 28 ×½ | 55 ×1 | 41 ×1 | 81 ×1 |
| Mewtwo | 88 ×2 | 44 ×1 | 31 ×1 | 64 ×1 |
| Mew | 82 ×2 | 41 ×1 | 31 ×1 | 59 ×1 |
| Onix | 28 ×1 | 14 ×½ | 41 ×2 | 20 ×½ |
| Scyther | 49 ×1 | 198 ×4 | 0 ×0 | 278 ×4 |
| Gyarados | 50 ×1 | 99 ×2 | 0 ×0 | 142 ×2 |
| Articuno | 41 ×1 | 165 ×4 | 0 ×0 | 235 ×4 |
| Zapdos | 47 ×1 | 94 ×2 | 0 ×0 | 134 ×2 |
| Moltres | 44 ×1 | 176 ×4 | 0 ×0 | 255 ×4 |
| Raikou | 52 ×1 | 51 ×1 | 72 ×2 | 74 ×1 |
| Entei | 47 ×1 | 94 ×2 | 61 ×2 | 134 ×2 |
| Suicune | 37 ×1 | 36 ×1 | 26 ×1 | 52 ×1 |
| Lugia | 67 ×2 | 66 ×2 | 0 ×0 | 93 ×2 |
| Ho-Oh | 44 ×1 | 176 ×4 | 0 ×0 | 255 ×4 |
| Celebi | 82 ×2 | 41 ×1 | 15 ×½ | 59 ×1 |
| Groudon | 32 ×1 | 16 ×½ | 20 ×1 | 22 ×½ |
| **Mediana de daño** | 51 | 61 | 36 | 87 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Onix

Tipos: **Rock / Ground** · HP 110 · Atk 65 · Def 180 · SpA 50 · SpD 65 · Vel 90

| Rival | Básica: Atadura<br>Rock · Fís · Pot 65 | Habilidad 1: Lanzarrocas<br>Rock · Fís · Pot 85 | Habilidad 2: Excavar<br>Ground · Fís · Pot 85 | Definitiva: Fisura<br>Ground · Fís · Pot 155 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 18 ×½ | 24 ×½ | 52 ×1 | 65 ×1 |
| Charmander | 86 ×2 | 107 ×2 | 112 ×2 | 141 ×2 |
| Squirtle | 32 ×1 | 39 ×1 | 41 ×1 | 52 ×1 |
| Pikachu | 44 ×1 | 55 ×1 | 117 ×2 | 147 ×2 |
| Gengar | 17 ×½ | 20 ×½ | 88 ×2 | 111 ×2 |
| Voltorb | 38 ×1 | 48 ×1 | 100 ×2 | 129 ×2 |
| Eevee | 38 ×1 | 48 ×1 | 50 ×1 | 64 ×1 |
| Lucario | 7 ×¼ | 9 ×¼ | 80 ×2 | 100 ×2 |
| Greninja | 32 ×1 | 38 ×1 | 40 ×1 | 51 ×1 |
| Mewtwo | 25 ×1 | 32 ×1 | 34 ×1 | 41 ×1 |
| Mew | 23 ×1 | 29 ×1 | 31 ×1 | 37 ×1 |
| Scyther | 110 ×4 | 140 ×4 | 0 ×0 | 0 ×0 |
| Gyarados | 55 ×2 | 70 ×2 | 0 ×0 | 0 ×0 |
| Tyranitar | 22 ×1 | 26 ×1 | 55 ×2 | 70 ×2 |
| Articuno | 90 ×4 | 116 ×4 | 0 ×0 | 0 ×0 |
| Zapdos | 51 ×2 | 66 ×2 | 0 ×0 | 0 ×0 |
| Moltres | 98 ×4 | 128 ×4 | 0 ×0 | 0 ×0 |
| Raikou | 29 ×1 | 35 ×1 | 74 ×2 | 94 ×2 |
| Entei | 51 ×2 | 66 ×2 | 69 ×2 | 86 ×2 |
| Suicune | 19 ×1 | 26 ×1 | 28 ×1 | 33 ×1 |
| Lugia | 37 ×2 | 47 ×2 | 0 ×0 | 0 ×0 |
| Ho-Oh | 98 ×4 | 128 ×4 | 0 ×0 | 0 ×0 |
| Celebi | 23 ×1 | 29 ×1 | 15 ×½ | 19 ×½ |
| Groudon | 9 ×½ | 11 ×½ | 23 ×1 | 28 ×1 |
| **Mediana de daño** | 34 | 43 | 37 | 46 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Groudon

Tipos: **Ground** · HP 175 · Atk 170 · Def 160 · SpA 120 · SpD 110 · Vel 110

| Rival | Básica: Cuchillada<br>Normal · Fís · Pot 45 | Habilidad 1: Terremoto<br>Ground · Fís · Pot 18/s | Habilidad 2: Avalancha<br>Rock · Fís · Pot 55 | Definitiva: Filo del Abismo<br>Ground · Fís · Pot 100 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 47 ×1 | 76 ×1 | 26 ×½ | 139 ×1 |
| Charmander | 51 ×1 | 163 ×2 | 112 ×2 | 305 ×2 |
| Squirtle | 38 ×1 | 61 ×1 | 42 ×1 | 114 ×1 |
| Pikachu | 54 ×1 | 183 ×2 | 59 ×1 | 320 ×2 |
| Gengar | 0 ×0 | 133 ×2 | 22 ×½ | 239 ×2 |
| Voltorb | 47 ×1 | 153 ×2 | 51 ×1 | 272 ×2 |
| Eevee | 47 ×1 | 76 ×1 | 51 ×1 | 136 ×1 |
| Lucario | 18 ×½ | 123 ×2 | 9 ×¼ | 215 ×2 |
| Greninja | 38 ×1 | 61 ×1 | 41 ×1 | 110 ×1 |
| Mewtwo | 30 ×1 | 51 ×1 | 33 ×1 | 88 ×1 |
| Mew | 28 ×1 | 46 ×1 | 30 ×1 | 81 ×1 |
| Onix | 9 ×½ | 61 ×2 | 10 ×½ | 107 ×2 |
| Scyther | 33 ×1 | 0 ×0 | 143 ×4 | 0 ×0 |
| Gyarados | 34 ×1 | 0 ×0 | 72 ×2 | 0 ×0 |
| Tyranitar | 12 ×½ | 92 ×2 | 28 ×1 | 149 ×2 |
| Articuno | 28 ×1 | 0 ×0 | 121 ×4 | 0 ×0 |
| Zapdos | 32 ×1 | 0 ×0 | 68 ×2 | 0 ×0 |
| Moltres | 30 ×1 | 0 ×0 | 132 ×4 | 0 ×0 |
| Raikou | 35 ×1 | 123 ×2 | 38 ×1 | 204 ×2 |
| Entei | 32 ×1 | 103 ×2 | 68 ×2 | 184 ×2 |
| Suicune | 25 ×1 | 36 ×1 | 27 ×1 | 72 ×1 |
| Lugia | 22 ×1 | 0 ×0 | 48 ×2 | 0 ×0 |
| Ho-Oh | 30 ×1 | 0 ×0 | 132 ×4 | 0 ×0 |
| Celebi | 28 ×1 | 20 ×½ | 30 ×1 | 40 ×½ |
| **Mediana de daño** | 31 | 61 | 45 | 108 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Celebi

Tipos: **Psychic / Grass** · HP 175 · Atk 120 · Def 120 · SpA 120 · SpD 120 · Vel 120

| Rival | Básica: Hoja Mágica<br>Grass · Esp · Pot 45 | Habilidad 1: Rayo Solar<br>Grass · Esp · Pot 85 | Habilidad 2: Deseo<br>Psychic · Estado · Pot — | Definitiva: Futuro Siniestro<br>Psychic · Esp · Pot 105 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 9 ×¼ | 17 ×¼ | Estado | 177 ×2 |
| Charmander | 25 ×½ | 44 ×½ | Estado | 108 ×1 |
| Squirtle | 82 ×2 | 145 ×2 | Estado | 90 ×1 |
| Pikachu | 49 ×1 | 88 ×1 | Estado | 108 ×1 |
| Gengar | 18 ×½ | 32 ×½ | Estado | 159 ×2 |
| Voltorb | 46 ×1 | 81 ×1 | Estado | 100 ×1 |
| Eevee | 40 ×1 | 71 ×1 | Estado | 88 ×1 |
| Lucario | 18 ×½ | 34 ×½ | Estado | 84 ×1 |
| Greninja | 76 ×2 | 136 ×2 | Estado (×0) | 0 ×0 |
| Mewtwo | 32 ×1 | 55 ×1 | Estado | 35 ×½ |
| Mew | 29 ×1 | 52 ×1 | Estado | 32 ×½ |
| Onix | 212 ×4 | 377 ×4 | Estado | 116 ×1 |
| Scyther | 8 ×¼ | 15 ×¼ | Estado | 76 ×1 |
| Gyarados | 29 ×1 | 52 ×1 | Estado | 64 ×1 |
| Tyranitar | 57 ×2 | 105 ×2 | Estado (×0) | 0 ×0 |
| Articuno | 12 ×½ | 20 ×½ | Estado | 53 ×1 |
| Zapdos | 15 ×½ | 27 ×½ | Estado | 70 ×1 |
| Moltres | 8 ×¼ | 15 ×¼ | Estado | 71 ×1 |
| Raikou | 29 ×1 | 52 ×1 | Estado | 64 ×1 |
| Entei | 18 ×½ | 32 ×½ | Estado | 80 ×1 |
| Suicune | 51 ×2 | 93 ×2 | Estado | 56 ×1 |
| Lugia | 9 ×½ | 17 ×½ | Estado | 21 ×½ |
| Ho-Oh | 4 ×¼ | 9 ×¼ | Estado | 44 ×1 |
| Groudon | 63 ×2 | 111 ×2 | Estado | 70 ×1 |
| **Mediana de daño** | 29 | 52 | — | 70 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Lugia

Tipos: **Psychic / Flying** · HP 181 · Atk 110 · Def 150 · SpA 110 · SpD 174 · Vel 130

| Rival | Básica: Onda Mental<br>Psychic · Esp · Pot 50 | Habilidad 1: Marea<br>Water · Esp · Pot 30/s | Habilidad 2: Ciclón<br>Flying · Esp · Pot 45 | Definitiva: Aerochorro<br>Flying · Esp · Pot 120 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 82 ×2 | 19 ×½ | 74 ×2 | 186 ×2 |
| Charmander | 50 ×1 | 106 ×2 | 46 ×1 | 112 ×1 |
| Squirtle | 41 ×1 | 19 ×½ | 37 ×1 | 94 ×1 |
| Pikachu | 50 ×1 | 53 ×1 | 22 ×½ | 55 ×½ |
| Gengar | 74 ×2 | 39 ×1 | 34 ×1 | 84 ×1 |
| Voltorb | 47 ×1 | 48 ×1 | 21 ×½ | 52 ×½ |
| Eevee | 41 ×1 | 44 ×1 | 37 ×1 | 93 ×1 |
| Lucario | 38 ×1 | 44 ×1 | 37 ×1 | 88 ×1 |
| Greninja | 0 ×0 | 19 ×½ | 35 ×1 | 87 ×1 |
| Mewtwo | 16 ×½ | 34 ×1 | 29 ×1 | 71 ×1 |
| Mew | 15 ×½ | 34 ×1 | 28 ×1 | 67 ×1 |
| Onix | 55 ×1 | 232 ×4 | 25 ×½ | 61 ×½ |
| Scyther | 37 ×1 | 39 ×1 | 63 ×2 | 159 ×2 |
| Gyarados | 31 ×1 | 15 ×½ | 28 ×1 | 67 ×1 |
| Tyranitar | 0 ×0 | 68 ×2 | 13 ×½ | 33 ×½ |
| Articuno | 25 ×1 | 29 ×1 | 23 ×1 | 55 ×1 |
| Zapdos | 34 ×1 | 34 ×1 | 14 ×½ | 35 ×½ |
| Moltres | 35 ×1 | 68 ×2 | 31 ×1 | 76 ×1 |
| Raikou | 31 ×1 | 34 ×1 | 13 ×½ | 33 ×½ |
| Entei | 37 ×1 | 78 ×2 | 34 ×1 | 84 ×1 |
| Suicune | 26 ×1 | 14 ×½ | 25 ×1 | 59 ×1 |
| Ho-Oh | 19 ×1 | 49 ×2 | 18 ×1 | 47 ×1 |
| Celebi | 15 ×½ | 15 ×½ | 55 ×2 | 134 ×2 |
| Groudon | 34 ×1 | 68 ×2 | 29 ×1 | 71 ×1 |
| **Mediana de daño** | 34 | 39 | 29 | 71 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Medianas por Pokémon

Resumen de las medianas de cada sección. `Combo` es la mediana del daño de los cuatro ataques sumados contra cada rival; las habilidades de estado cuentan como 0 en esa columna.

| Pokémon | Básica | Habilidad 1 | Habilidad 2 | Definitiva | Combo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pikachu | 16 | 18 | 34 | 63 | 126 |
| Voltorb | 31 | 20 | — | 102 | 145 |
| Gengar | 23 | 60 | 51 | 77 | 204 |
| Bulbasaur | 15 | — | 46 | 68 | 129 |
| Charmander | 15 | 42 | 45 | 49 | 151 |
| Squirtle | 14 | 31 | 37 | 57 | 135 |
| Lucario | 28 | 28 | 37 | 74 | 178 |
| Greninja | 34 | 50 | 37 | 73 | 205 |
| Articuno | 35 | 61 | 35 | 62 | 193 |
| Moltres | 38 | 53 | 46 | 72 | 208 |
| Mewtwo | 46 | — | 82 | 97 | 225 |
| Mew | 33 | — | 60 | — | 92 |
| Scyther | 29 | 46 | — | 82 | 162 |
| Tyranitar | 51 | 61 | 36 | 87 | 262 |
| Onix | 34 | 43 | 37 | 46 | 184 |
| Groudon | 31 | 61 | 45 | 108 | 226 |
| Celebi | 29 | 52 | — | 70 | 153 |
| Lugia | 34 | 39 | 29 | 71 | 186 |

## Pokémon sin moveset

Estas especies del roster todavía no tienen ataques asignados en `MOVESETS`, así que no pueden usarse como atacantes. Sí aparecen como rivales en las tablas anteriores porque el daño recibido solo depende de sus tipos y estadísticas.

| Pokémon | Tipos |
| --- | --- |
| Eevee | Normal |
| Gyarados | Water / Flying |
| Zapdos | Electric / Flying |
| Raikou | Electric |
| Entei | Fire |
| Suicune | Water |
| Ho-Oh | Fire / Flying |

## Cobertura

Atacantes con moveset asignado: **18** de 25 especies del roster. Los rivales incluyen las 25 especies, tengan o no moveset, porque el daño solo depende de sus tipos y estadísticas.
