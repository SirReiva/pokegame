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

| Rival | Básica: Placaje<br>Normal · Fís · Pot 40 | Habilidad 1: Ataque Rápido<br>Normal · Fís · Pot 40 | Habilidad 2: Rayo<br>Electric · Esp · Pot 90 | Definitiva: Impactrueno<br>Electric · Esp · Pot 40 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 19 ×1 | 19 ×1 | 24 ×½ | 10 ×½ |
| Charmander | 20 ×1 | 20 ×1 | 56 ×1 | 26 ×1 |
| Squirtle | 15 ×1 | 15 ×1 | 98 ×2 | 43 ×2 |
| Gengar | 0 ×0 | 0 ×0 | 43 ×1 | 18 ×1 |
| Voltorb | 18 ×1 | 18 ×1 | 27 ×½ | 12 ×½ |
| Eevee | 18 ×1 | 18 ×1 | 47 ×1 | 22 ×1 |
| Lucario | 7 ×½ | 7 ×½ | 44 ×1 | 19 ×1 |
| Greninja | 15 ×1 | 15 ×1 | 88 ×2 | 39 ×2 |
| Mewtwo | 12 ×1 | 12 ×1 | 37 ×1 | 18 ×1 |
| Mew | 12 ×1 | 12 ×1 | 35 ×1 | 16 ×1 |
| Onix | 4 ×½ | 4 ×½ | 0 ×0 | 0 ×0 |
| Scyther | 13 ×1 | 13 ×1 | 80 ×2 | 37 ×2 |
| Gyarados | 13 ×1 | 13 ×1 | 139 ×4 | 65 ×4 |
| Tyranitar | 5 ×½ | 5 ×½ | 35 ×1 | 16 ×1 |
| Articuno | 12 ×1 | 12 ×1 | 57 ×2 | 27 ×2 |
| Zapdos | 12 ×1 | 12 ×1 | 37 ×1 | 18 ×1 |
| Moltres | 12 ×1 | 12 ×1 | 76 ×2 | 37 ×2 |
| Raikou | 13 ×1 | 13 ×1 | 17 ×½ | 8 ×½ |
| Entei | 12 ×1 | 12 ×1 | 43 ×1 | 18 ×1 |
| Suicune | 10 ×1 | 10 ×1 | 61 ×2 | 31 ×2 |
| Lugia | 9 ×1 | 9 ×1 | 45 ×2 | 25 ×2 |
| Ho-Oh | 12 ×1 | 12 ×1 | 45 ×2 | 25 ×2 |
| Celebi | 12 ×1 | 12 ×1 | 17 ×½ | 8 ×½ |
| Groudon | 9 ×1 | 9 ×1 | 0 ×0 | 0 ×0 |
| **Mediana de daño** | 12 | 12 | 43 | 19 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Voltorb

Tipos: **Electric** · HP 115 · Atk 50 · Def 70 · SpA 75 · SpD 75 · Vel 120

| Rival | Básica: Chispa<br>Electric · Fís · Pot 65 | Habilidad 1: Rollout<br>Normal · Fís · Pot 80 | Habilidad 2: Onda Trueno<br>Electric · Estado · Pot — | Definitiva: Explosión<br>Electric · Esp · Pot 175 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 15 ×½ | 25 ×1 | Estado | 48 ×½ |
| Charmander | 34 ×1 | 27 ×1 | Estado | 117 ×1 |
| Squirtle | 49 ×2 | 20 ×1 | Estado | 196 ×2 |
| Pikachu | 17 ×½ | 29 ×1 | Estado | 58 ×½ |
| Gengar | 26 ×1 | 0 ×0 | Estado | 87 ×1 |
| Eevee | 31 ×1 | 25 ×1 | Estado | 96 ×1 |
| Lucario | 23 ×1 | 9 ×½ | Estado | 93 ×1 |
| Greninja | 49 ×2 | 20 ×1 | Estado | 184 ×2 |
| Mewtwo | 19 ×1 | 16 ×1 | Estado | 75 ×1 |
| Mew | 18 ×1 | 14 ×1 | Estado | 70 ×1 |
| Onix | 0 ×0 | 5 ×½ | Estado (×0) | 0 ×0 |
| Scyther | 43 ×2 | 17 ×1 | Estado | 165 ×2 |
| Gyarados | 86 ×4 | 17 ×1 | Estado | 282 ×4 |
| Tyranitar | 18 ×1 | 6 ×½ | Estado | 70 ×1 |
| Articuno | 37 ×2 | 14 ×1 | Estado | 112 ×2 |
| Zapdos | 19 ×1 | 16 ×1 | Estado | 75 ×1 |
| Moltres | 39 ×2 | 16 ×1 | Estado | 159 ×2 |
| Raikou | 11 ×½ | 18 ×1 | Estado | 35 ×½ |
| Entei | 19 ×1 | 16 ×1 | Estado | 87 ×1 |
| Suicune | 33 ×2 | 13 ×1 | Estado | 123 ×2 |
| Lugia | 31 ×2 | 12 ×1 | Estado | 98 ×2 |
| Ho-Oh | 39 ×2 | 16 ×1 | Estado | 98 ×2 |
| Celebi | 9 ×½ | 14 ×1 | Estado | 35 ×½ |
| Groudon | 0 ×0 | 12 ×1 | Estado (×0) | 0 ×0 |
| **Mediana de daño** | 24 | 16 | — | 90 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Gengar

Tipos: **Ghost / Poison** · HP 135 · Atk 85 · Def 80 · SpA 150 · SpD 95 · Vel 130

| Rival | Básica: Lengüetazo<br>Ghost · Fís · Pot 45 | Habilidad 1: Bola Sombra<br>Ghost · Esp · Pot 70 | Habilidad 2: Bomba Lodo<br>Poison · Esp · Pot 25/s | Definitiva: Come Sueños<br>Ghost · Esp · Pot 90 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 37 ×1 | 78 ×1 | 76 ×1 | 99 ×1 |
| Charmander | 38 ×1 | 95 ×1 | 91 ×1 | 121 ×1 |
| Squirtle | 29 ×1 | 80 ×1 | 76 ×1 | 101 ×1 |
| Pikachu | 41 ×1 | 95 ×1 | 91 ×1 | 121 ×1 |
| Voltorb | 37 ×1 | 89 ×1 | 91 ×1 | 113 ×1 |
| Eevee | 0 ×0 | 0 ×0 | 76 ×1 | 0 ×0 |
| Lucario | 28 ×1 | 75 ×1 | 0 ×0 | 95 ×1 |
| Greninja | 14 ×½ | 37 ×½ | 76 ×1 | 46 ×½ |
| Mewtwo | 45 ×2 | 123 ×2 | 61 ×1 | 155 ×2 |
| Mew | 43 ×2 | 112 ×2 | 51 ×1 | 143 ×2 |
| Onix | 15 ×1 | 102 ×1 | 21 ×¼ | 132 ×1 |
| Scyther | 25 ×1 | 67 ×1 | 66 ×1 | 86 ×1 |
| Gyarados | 26 ×1 | 56 ×1 | 51 ×1 | 71 ×1 |
| Tyranitar | 9 ×½ | 28 ×½ | 26 ×½ | 36 ×½ |
| Articuno | 22 ×1 | 46 ×1 | 46 ×1 | 58 ×1 |
| Zapdos | 25 ×1 | 61 ×1 | 61 ×1 | 78 ×1 |
| Moltres | 23 ×1 | 64 ×1 | 61 ×1 | 81 ×1 |
| Raikou | 26 ×1 | 56 ×1 | 51 ×1 | 71 ×1 |
| Entei | 25 ×1 | 70 ×1 | 66 ×1 | 90 ×1 |
| Suicune | 18 ×1 | 50 ×1 | 51 ×1 | 64 ×1 |
| Lugia | 37 ×2 | 76 ×2 | 36 ×1 | 100 ×2 |
| Ho-Oh | 23 ×1 | 38 ×1 | 36 ×1 | 50 ×1 |
| Celebi | 43 ×2 | 112 ×2 | 103 ×2 | 143 ×2 |
| Groudon | 16 ×1 | 61 ×1 | 31 ×½ | 78 ×1 |
| **Mediana de daño** | 25 | 69 | 61 | 88 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Bulbasaur

Tipos: **Grass / Poison** · HP 120 · Atk 69 · Def 69 · SpA 85 · SpD 85 · Vel 65

| Rival | Básica: Placaje<br>Normal · Fís · Pot 40 | Habilidad 1: Paralizador<br>Grass · Estado · Pot — | Habilidad 2: Hoja Afilada<br>Grass · Esp · Pot 60 | Definitiva: Lluevehojas<br>Grass · Esp · Pot 120 |
| --- | ---: | ---: | ---: | ---: |
| Charmander | 19 ×1 | Estado | 24 ×½ | 44 ×½ |
| Squirtle | 14 ×1 | Estado | 76 ×2 | 145 ×2 |
| Pikachu | 20 ×1 | Estado | 47 ×1 | 88 ×1 |
| Gengar | 0 ×0 | Estado | 17 ×½ | 32 ×½ |
| Voltorb | 17 ×1 | Estado | 43 ×1 | 81 ×1 |
| Eevee | 17 ×1 | Estado | 38 ×1 | 71 ×1 |
| Lucario | 6 ×½ | Estado | 18 ×½ | 34 ×½ |
| Greninja | 13 ×1 | Estado | 74 ×2 | 136 ×2 |
| Mewtwo | 12 ×1 | Estado | 31 ×1 | 55 ×1 |
| Mew | 11 ×1 | Estado | 28 ×1 | 52 ×1 |
| Onix | 3 ×½ | Estado | 200 ×4 | 377 ×4 |
| Scyther | 12 ×1 | Estado | 8 ×¼ | 15 ×¼ |
| Gyarados | 12 ×1 | Estado | 28 ×1 | 52 ×1 |
| Tyranitar | 5 ×½ | Estado | 55 ×2 | 105 ×2 |
| Articuno | 11 ×1 | Estado | 11 ×½ | 20 ×½ |
| Zapdos | 12 ×1 | Estado | 15 ×½ | 27 ×½ |
| Moltres | 12 ×1 | Estado | 7 ×¼ | 15 ×¼ |
| Raikou | 12 ×1 | Estado | 28 ×1 | 52 ×1 |
| Entei | 12 ×1 | Estado | 17 ×½ | 32 ×½ |
| Suicune | 9 ×1 | Estado | 49 ×2 | 93 ×2 |
| Lugia | 9 ×1 | Estado | 9 ×½ | 17 ×½ |
| Ho-Oh | 12 ×1 | Estado | 4 ×¼ | 9 ×¼ |
| Celebi | 11 ×1 | Estado | 13 ×½ | 26 ×½ |
| Groudon | 8 ×1 | Estado | 61 ×2 | 111 ×2 |
| **Mediana de daño** | 12 | — | 28 | 52 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Charmander

Tipos: **Fire** · HP 114 · Atk 72 · Def 63 · SpA 80 · SpD 70 · Vel 85

| Rival | Básica: Arañazo<br>Normal · Fís · Pot 40 | Habilidad 1: Giro Fuego<br>Fire · Esp · Pot 35/s | Habilidad 2: Lanzallamas<br>Fire · Esp · Pot 90 | Definitiva: Anillo Ígneo<br>Fire · Esp · Pot 110 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 18 ×1 | 94 ×2 | 110 ×2 | 111 ×2 |
| Squirtle | 14 ×1 | 21 ×½ | 28 ×½ | 29 ×½ |
| Pikachu | 21 ×1 | 62 ×1 | 65 ×1 | 68 ×1 |
| Gengar | 0 ×0 | 47 ×1 | 49 ×1 | 50 ×1 |
| Voltorb | 18 ×1 | 52 ×1 | 61 ×1 | 63 ×1 |
| Eevee | 18 ×1 | 47 ×1 | 55 ×1 | 56 ×1 |
| Lucario | 7 ×½ | 94 ×2 | 104 ×2 | 106 ×2 |
| Greninja | 14 ×1 | 21 ×½ | 25 ×½ | 26 ×½ |
| Mewtwo | 12 ×1 | 37 ×1 | 41 ×1 | 44 ×1 |
| Mew | 11 ×1 | 37 ×1 | 38 ×1 | 40 ×1 |
| Onix | 4 ×½ | 31 ×½ | 35 ×½ | 36 ×½ |
| Scyther | 12 ×1 | 74 ×2 | 92 ×2 | 95 ×2 |
| Gyarados | 12 ×1 | 16 ×½ | 18 ×½ | 20 ×½ |
| Tyranitar | 5 ×½ | 16 ×½ | 18 ×½ | 20 ×½ |
| Articuno | 11 ×1 | 62 ×2 | 63 ×2 | 64 ×2 |
| Zapdos | 12 ×1 | 37 ×1 | 41 ×1 | 44 ×1 |
| Moltres | 12 ×1 | 16 ×½ | 22 ×½ | 23 ×½ |
| Raikou | 13 ×1 | 37 ×1 | 38 ×1 | 40 ×1 |
| Entei | 12 ×1 | 21 ×½ | 25 ×½ | 24 ×½ |
| Suicune | 10 ×1 | 16 ×½ | 17 ×½ | 17 ×½ |
| Lugia | 9 ×1 | 21 ×1 | 28 ×1 | 29 ×1 |
| Ho-Oh | 12 ×1 | 10 ×½ | 13 ×½ | 14 ×½ |
| Celebi | 11 ×1 | 74 ×2 | 76 ×2 | 80 ×2 |
| Groudon | 8 ×1 | 37 ×1 | 41 ×1 | 44 ×1 |
| **Mediana de daño** | 12 | 37 | 39 | 42 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Squirtle

Tipos: **Water** · HP 119 · Atk 68 · Def 85 · SpA 70 · SpD 84 · Vel 63

| Rival | Básica: Placaje<br>Normal · Fís · Pot 40 | Habilidad 1: Acua Jet<br>Water · Fís · Pot 45 | Habilidad 2: Rayo Burbuja<br>Water · Esp · Pot 65 | Definitiva: Hidrobomba<br>Water · Esp · Pot 115 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 17 ×1 | 14 ×½ | 17 ×½ | 27 ×½ |
| Charmander | 18 ×1 | 63 ×2 | 82 ×2 | 132 ×2 |
| Pikachu | 19 ×1 | 34 ×1 | 41 ×1 | 66 ×1 |
| Gengar | 0 ×0 | 25 ×1 | 32 ×1 | 50 ×1 |
| Voltorb | 17 ×1 | 29 ×1 | 38 ×1 | 62 ×1 |
| Eevee | 17 ×1 | 29 ×1 | 35 ×1 | 53 ×1 |
| Lucario | 6 ×½ | 22 ×1 | 34 ×1 | 51 ×1 |
| Greninja | 13 ×1 | 11 ×½ | 16 ×½ | 25 ×½ |
| Mewtwo | 11 ×1 | 18 ×1 | 28 ×1 | 42 ×1 |
| Mew | 10 ×1 | 18 ×1 | 25 ×1 | 39 ×1 |
| Onix | 3 ×½ | 49 ×4 | 176 ×4 | 279 ×4 |
| Scyther | 12 ×1 | 19 ×1 | 31 ×1 | 47 ×1 |
| Gyarados | 12 ×1 | 9 ×½ | 12 ×½ | 19 ×½ |
| Tyranitar | 5 ×½ | 33 ×2 | 49 ×2 | 77 ×2 |
| Articuno | 10 ×1 | 18 ×1 | 19 ×1 | 33 ×1 |
| Zapdos | 12 ×1 | 18 ×1 | 28 ×1 | 42 ×1 |
| Moltres | 11 ×1 | 37 ×2 | 57 ×2 | 88 ×2 |
| Raikou | 12 ×1 | 22 ×1 | 25 ×1 | 39 ×1 |
| Entei | 12 ×1 | 37 ×2 | 63 ×2 | 99 ×2 |
| Suicune | 9 ×1 | 7 ×½ | 10 ×½ | 17 ×½ |
| Lugia | 8 ×1 | 13 ×1 | 18 ×1 | 28 ×1 |
| Ho-Oh | 11 ×1 | 37 ×2 | 37 ×2 | 55 ×2 |
| Celebi | 10 ×1 | 9 ×½ | 12 ×½ | 19 ×½ |
| Groudon | 8 ×1 | 27 ×2 | 55 ×2 | 85 ×2 |
| **Mediana de daño** | 11 | 22 | 31 | 48 |
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

| Rival | Básica: Shuriken de Agua<br>Water · Esp · Pot 45 | Habilidad 1: Tajo Umbrío<br>Dark · Fís · Pot 70 | Habilidad 2: Sombra Vil<br>Dark · Fís · Pot 50 | Definitiva: Pulso Umbrío<br>Dark · Esp · Pot 95 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 20 ×½ | 75 ×1 | 53 ×1 | 87 ×1 |
| Charmander | 100 ×2 | 81 ×1 | 58 ×1 | 105 ×1 |
| Squirtle | 20 ×½ | 59 ×1 | 43 ×1 | 89 ×1 |
| Pikachu | 50 ×1 | 86 ×1 | 61 ×1 | 105 ×1 |
| Gengar | 37 ×1 | 129 ×2 | 92 ×2 | 155 ×2 |
| Voltorb | 47 ×1 | 74 ×1 | 53 ×1 | 98 ×1 |
| Eevee | 41 ×1 | 74 ×1 | 53 ×1 | 87 ×1 |
| Lucario | 40 ×1 | 28 ×½ | 20 ×½ | 41 ×½ |
| Mewtwo | 34 ×1 | 94 ×2 | 69 ×2 | 135 ×2 |
| Mew | 31 ×1 | 86 ×2 | 63 ×2 | 123 ×2 |
| Onix | 220 ×4 | 29 ×1 | 22 ×1 | 113 ×1 |
| Scyther | 37 ×1 | 52 ×1 | 37 ×1 | 75 ×1 |
| Gyarados | 15 ×½ | 52 ×1 | 37 ×1 | 61 ×1 |
| Tyranitar | 61 ×2 | 19 ×½ | 14 ×½ | 31 ×½ |
| Articuno | 25 ×1 | 43 ×1 | 32 ×1 | 52 ×1 |
| Zapdos | 34 ×1 | 49 ×1 | 37 ×1 | 67 ×1 |
| Moltres | 69 ×2 | 47 ×1 | 35 ×1 | 70 ×1 |
| Raikou | 31 ×1 | 55 ×1 | 38 ×1 | 61 ×1 |
| Entei | 74 ×2 | 49 ×1 | 37 ×1 | 78 ×1 |
| Suicune | 13 ×½ | 38 ×1 | 28 ×1 | 56 ×1 |
| Lugia | 19 ×1 | 69 ×2 | 49 ×2 | 86 ×2 |
| Ho-Oh | 39 ×2 | 47 ×1 | 35 ×1 | 43 ×1 |
| Celebi | 15 ×½ | 86 ×2 | 63 ×2 | 123 ×2 |
| Groudon | 67 ×2 | 34 ×1 | 23 ×1 | 67 ×1 |
| **Mediana de daño** | 37 | 54 | 37 | 82 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Articuno

Tipos: **Ice / Flying** · HP 165 · Atk 105 · Def 120 · SpA 115 · SpD 145 · Vel 105

| Rival | Básica: Golpe Ala<br>Flying · Fís · Pot 55 | Habilidad 1: Rayo Hielo<br>Ice · Esp · Pot 90 | Habilidad 2: Viento Gélido<br>Ice · Esp · Pot 55 | Definitiva: Ventisca<br>Ice · Esp · Pot 110 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 106 ×2 | 153 ×2 | 89 ×2 | 167 ×2 |
| Charmander | 58 ×1 | 46 ×½ | 26 ×½ | 51 ×½ |
| Squirtle | 43 ×1 | 39 ×½ | 23 ×½ | 42 ×½ |
| Pikachu | 31 ×½ | 93 ×1 | 53 ×1 | 102 ×1 |
| Gengar | 46 ×1 | 68 ×1 | 41 ×1 | 75 ×1 |
| Voltorb | 27 ×½ | 87 ×1 | 52 ×1 | 96 ×1 |
| Eevee | 53 ×1 | 77 ×1 | 45 ×1 | 84 ×1 |
| Lucario | 41 ×1 | 37 ×½ | 20 ×½ | 39 ×½ |
| Greninja | 43 ×1 | 37 ×½ | 20 ×½ | 39 ×½ |
| Mewtwo | 35 ×1 | 59 ×1 | 35 ×1 | 66 ×1 |
| Mew | 32 ×1 | 55 ×1 | 33 ×1 | 61 ×1 |
| Onix | 10 ×½ | 202 ×2 | 116 ×2 | 221 ×2 |
| Scyther | 74 ×2 | 131 ×2 | 76 ×2 | 143 ×2 |
| Gyarados | 37 ×1 | 55 ×1 | 33 ×1 | 61 ×1 |
| Tyranitar | 14 ×½ | 55 ×1 | 33 ×1 | 61 ×1 |
| Zapdos | 18 ×½ | 119 ×2 | 70 ×2 | 132 ×2 |
| Moltres | 35 ×1 | 62 ×1 | 36 ×1 | 69 ×1 |
| Raikou | 18 ×½ | 55 ×1 | 33 ×1 | 61 ×1 |
| Entei | 37 ×1 | 34 ×½ | 20 ×½ | 38 ×½ |
| Suicune | 28 ×1 | 25 ×½ | 15 ×½ | 27 ×½ |
| Lugia | 25 ×1 | 76 ×2 | 43 ×2 | 83 ×2 |
| Ho-Oh | 35 ×1 | 38 ×1 | 21 ×1 | 41 ×1 |
| Celebi | 63 ×2 | 110 ×2 | 66 ×2 | 121 ×2 |
| Groudon | 23 ×1 | 119 ×2 | 70 ×2 | 132 ×2 |
| **Mediana de daño** | 35 | 61 | 35 | 68 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Moltres

Tipos: **Fire / Flying** · HP 165 · Atk 120 · Def 110 · SpA 145 · SpD 105 · Vel 110

| Rival | Básica: Ataque Aéreo<br>Flying · Fís · Pot 55 | Habilidad 1: Tajo Aéreo<br>Flying · Esp · Pot 65 | Habilidad 2: Onda Ígnea<br>Fire · Esp · Pot 65 | Definitiva: Ataque Celeste<br>Flying · Fís · Pot 130 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 123 ×2 | 141 ×2 | 134 ×2 | 255 ×2 |
| Charmander | 67 ×1 | 86 ×1 | 41 ×½ | 139 ×1 |
| Squirtle | 50 ×1 | 71 ×1 | 34 ×½ | 103 ×1 |
| Pikachu | 35 ×½ | 43 ×½ | 81 ×1 | 74 ×½ |
| Gengar | 53 ×1 | 62 ×1 | 59 ×1 | 110 ×1 |
| Voltorb | 30 ×½ | 40 ×½ | 76 ×1 | 63 ×½ |
| Eevee | 59 ×1 | 70 ×1 | 67 ×1 | 127 ×1 |
| Lucario | 47 ×1 | 67 ×1 | 128 ×2 | 99 ×1 |
| Greninja | 49 ×1 | 65 ×1 | 31 ×½ | 102 ×1 |
| Mewtwo | 38 ×1 | 55 ×1 | 52 ×1 | 81 ×1 |
| Mew | 37 ×1 | 50 ×1 | 48 ×1 | 74 ×1 |
| Onix | 12 ×½ | 46 ×½ | 44 ×½ | 25 ×½ |
| Scyther | 86 ×2 | 119 ×2 | 113 ×2 | 176 ×2 |
| Gyarados | 43 ×1 | 50 ×1 | 23 ×½ | 89 ×1 |
| Tyranitar | 16 ×½ | 25 ×½ | 23 ×½ | 33 ×½ |
| Articuno | 37 ×1 | 41 ×1 | 78 ×2 | 74 ×1 |
| Zapdos | 19 ×½ | 28 ×½ | 52 ×1 | 41 ×½ |
| Raikou | 22 ×½ | 25 ×½ | 48 ×1 | 47 ×½ |
| Entei | 40 ×1 | 62 ×1 | 29 ×½ | 84 ×1 |
| Suicune | 32 ×1 | 44 ×1 | 20 ×½ | 66 ×1 |
| Lugia | 29 ×1 | 35 ×1 | 33 ×1 | 59 ×1 |
| Ho-Oh | 38 ×1 | 35 ×1 | 16 ×½ | 81 ×1 |
| Celebi | 74 ×2 | 100 ×2 | 95 ×2 | 149 ×2 |
| Groudon | 28 ×1 | 55 ×1 | 52 ×1 | 55 ×1 |
| **Mediana de daño** | 38 | 53 | 50 | 81 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Mewtwo

Tipos: **Psychic** · HP 181 · Atk 130 · Def 110 · SpA 174 · SpD 110 · Vel 150

| Rival | Básica: Telequinesis<br>Psychic · Esp · Pot 55 | Habilidad 1: Teletransporte<br>Psychic · Estado · Pot — | Habilidad 2: Psíquico<br>Psychic · Esp · Pot 95 | Definitiva: Psicoataque<br>Psychic · Esp · Pot 125 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 143 ×2 | Estado | 245 ×2 | 305 ×2 |
| Charmander | 87 ×1 | Estado | 148 ×1 | 184 ×1 |
| Squirtle | 74 ×1 | Estado | 124 ×1 | 154 ×1 |
| Pikachu | 87 ×1 | Estado | 148 ×1 | 184 ×1 |
| Gengar | 129 ×2 | Estado | 221 ×2 | 273 ×2 |
| Voltorb | 81 ×1 | Estado | 138 ×1 | 173 ×1 |
| Eevee | 71 ×1 | Estado | 123 ×1 | 152 ×1 |
| Lucario | 67 ×1 | Estado | 114 ×1 | 144 ×1 |
| Greninja | 0 ×0 | Estado (×0) | 0 ×0 | 0 ×0 |
| Mew | 26 ×½ | Estado | 43 ×½ | 53 ×½ |
| Onix | 93 ×1 | Estado | 159 ×1 | 199 ×1 |
| Scyther | 61 ×1 | Estado | 104 ×1 | 129 ×1 |
| Gyarados | 52 ×1 | Estado | 87 ×1 | 108 ×1 |
| Tyranitar | 0 ×0 | Estado (×0) | 0 ×0 | 0 ×0 |
| Articuno | 43 ×1 | Estado | 74 ×1 | 90 ×1 |
| Zapdos | 56 ×1 | Estado | 95 ×1 | 119 ×1 |
| Moltres | 58 ×1 | Estado | 99 ×1 | 125 ×1 |
| Raikou | 52 ×1 | Estado | 87 ×1 | 108 ×1 |
| Entei | 64 ×1 | Estado | 110 ×1 | 137 ×1 |
| Suicune | 46 ×1 | Estado | 77 ×1 | 96 ×1 |
| Lugia | 18 ×½ | Estado | 30 ×½ | 38 ×½ |
| Ho-Oh | 37 ×1 | Estado | 59 ×1 | 76 ×1 |
| Celebi | 26 ×½ | Estado | 43 ×½ | 53 ×½ |
| Groudon | 56 ×1 | Estado | 95 ×1 | 119 ×1 |
| **Mediana de daño** | 57 | — | 97 | 122 |
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

| Rival | Básica: Triturar<br>Dark · Fís · Pot 75 | Habilidad 1: Avalancha<br>Rock · Fís · Pot 75 | Habilidad 2: Terremoto<br>Ground · Fís · Pot 40/s | Definitiva: Roca Afilada<br>Rock · Fís · Pot 125 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 105 ×1 | 47 ×½ | 97 ×1 | 69 ×½ |
| Charmander | 114 ×1 | 206 ×2 | 214 ×2 | 306 ×2 |
| Squirtle | 86 ×1 | 77 ×1 | 77 ×1 | 114 ×1 |
| Pikachu | 121 ×1 | 108 ×1 | 225 ×2 | 162 ×1 |
| Gengar | 184 ×2 | 41 ×½ | 163 ×2 | 60 ×½ |
| Voltorb | 104 ×1 | 94 ×1 | 194 ×2 | 138 ×1 |
| Eevee | 104 ×1 | 94 ×1 | 97 ×1 | 138 ×1 |
| Lucario | 40 ×½ | 18 ×¼ | 153 ×2 | 27 ×¼ |
| Greninja | 42 ×½ | 75 ×1 | 77 ×1 | 111 ×1 |
| Mewtwo | 135 ×2 | 61 ×1 | 61 ×1 | 89 ×1 |
| Mew | 123 ×2 | 55 ×1 | 61 ×1 | 81 ×1 |
| Onix | 41 ×1 | 18 ×½ | 82 ×2 | 27 ×½ |
| Scyther | 74 ×1 | 265 ×4 | 0 ×0 | 386 ×4 |
| Gyarados | 75 ×1 | 134 ×2 | 0 ×0 | 196 ×2 |
| Articuno | 61 ×1 | 221 ×4 | 0 ×0 | 323 ×4 |
| Zapdos | 70 ×1 | 127 ×2 | 0 ×0 | 183 ×2 |
| Moltres | 67 ×1 | 243 ×4 | 0 ×0 | 356 ×4 |
| Raikou | 77 ×1 | 69 ×1 | 143 ×2 | 103 ×1 |
| Entei | 70 ×1 | 127 ×2 | 123 ×2 | 183 ×2 |
| Suicune | 55 ×1 | 50 ×1 | 56 ×1 | 72 ×1 |
| Lugia | 98 ×2 | 88 ×2 | 0 ×0 | 129 ×2 |
| Ho-Oh | 67 ×1 | 243 ×4 | 0 ×0 | 356 ×4 |
| Celebi | 123 ×2 | 55 ×1 | 30 ×½ | 81 ×1 |
| Groudon | 46 ×1 | 20 ×½ | 46 ×1 | 29 ×½ |
| **Mediana de daño** | 76 | 83 | 69 | 121 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Onix

Tipos: **Rock / Ground** · HP 110 · Atk 65 · Def 180 · SpA 50 · SpD 65 · Vel 90

| Rival | Básica: Atadura<br>Rock · Fís · Pot 65 | Habilidad 1: Lanzarrocas<br>Rock · Fís · Pot 80 | Habilidad 2: Excavar<br>Ground · Fís · Pot 85 | Definitiva: Fisura<br>Ground · Fís · Pot 135 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 18 ×½ | 23 ×½ | 52 ×1 | 56 ×1 |
| Charmander | 86 ×2 | 101 ×2 | 112 ×2 | 124 ×2 |
| Squirtle | 32 ×1 | 36 ×1 | 41 ×1 | 46 ×1 |
| Pikachu | 44 ×1 | 53 ×1 | 117 ×2 | 130 ×2 |
| Gengar | 17 ×½ | 19 ×½ | 88 ×2 | 99 ×2 |
| Voltorb | 38 ×1 | 45 ×1 | 100 ×2 | 111 ×2 |
| Eevee | 38 ×1 | 45 ×1 | 50 ×1 | 56 ×1 |
| Lucario | 7 ×¼ | 9 ×¼ | 80 ×2 | 86 ×2 |
| Greninja | 32 ×1 | 36 ×1 | 40 ×1 | 45 ×1 |
| Mewtwo | 25 ×1 | 29 ×1 | 34 ×1 | 36 ×1 |
| Mew | 23 ×1 | 27 ×1 | 31 ×1 | 33 ×1 |
| Scyther | 110 ×4 | 128 ×4 | 0 ×0 | 0 ×0 |
| Gyarados | 55 ×2 | 66 ×2 | 0 ×0 | 0 ×0 |
| Tyranitar | 22 ×1 | 24 ×1 | 55 ×2 | 60 ×2 |
| Articuno | 90 ×4 | 109 ×4 | 0 ×0 | 0 ×0 |
| Zapdos | 51 ×2 | 60 ×2 | 0 ×0 | 0 ×0 |
| Moltres | 98 ×4 | 116 ×4 | 0 ×0 | 0 ×0 |
| Raikou | 29 ×1 | 35 ×1 | 74 ×2 | 82 ×2 |
| Entei | 51 ×2 | 60 ×2 | 69 ×2 | 74 ×2 |
| Suicune | 19 ×1 | 23 ×1 | 28 ×1 | 29 ×1 |
| Lugia | 37 ×2 | 43 ×2 | 0 ×0 | 0 ×0 |
| Ho-Oh | 98 ×4 | 116 ×4 | 0 ×0 | 0 ×0 |
| Celebi | 23 ×1 | 27 ×1 | 15 ×½ | 16 ×½ |
| Groudon | 9 ×½ | 10 ×½ | 23 ×1 | 26 ×1 |
| **Mediana de daño** | 34 | 39 | 37 | 41 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Groudon

Tipos: **Ground** · HP 175 · Atk 170 · Def 160 · SpA 120 · SpD 110 · Vel 110

| Rival | Básica: Cuchillada<br>Normal · Fís · Pot 55 | Habilidad 1: Terremoto<br>Ground · Fís · Pot 40/s | Habilidad 2: Avalancha<br>Rock · Fís · Pot 75 | Definitiva: Filo del Abismo<br>Ground · Fís · Pot 130 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 57 ×1 | 158 ×1 | 35 ×½ | 180 ×1 |
| Charmander | 62 ×1 | 347 ×2 | 154 ×2 | 397 ×2 |
| Squirtle | 47 ×1 | 128 ×1 | 57 ×1 | 147 ×1 |
| Pikachu | 65 ×1 | 368 ×2 | 80 ×1 | 415 ×2 |
| Gengar | 0 ×0 | 275 ×2 | 30 ×½ | 311 ×2 |
| Voltorb | 56 ×1 | 316 ×2 | 69 ×1 | 355 ×2 |
| Eevee | 56 ×1 | 158 ×1 | 69 ×1 | 177 ×1 |
| Lucario | 21 ×½ | 245 ×2 | 13 ×¼ | 278 ×2 |
| Greninja | 46 ×1 | 128 ×1 | 56 ×1 | 143 ×1 |
| Mewtwo | 37 ×1 | 97 ×1 | 45 ×1 | 114 ×1 |
| Mew | 34 ×1 | 92 ×1 | 40 ×1 | 105 ×1 |
| Onix | 11 ×½ | 133 ×2 | 14 ×½ | 140 ×2 |
| Scyther | 40 ×1 | 0 ×0 | 195 ×4 | 0 ×0 |
| Gyarados | 40 ×1 | 0 ×0 | 97 ×2 | 0 ×0 |
| Tyranitar | 15 ×½ | 183 ×2 | 38 ×1 | 193 ×2 |
| Articuno | 34 ×1 | 0 ×0 | 162 ×4 | 0 ×0 |
| Zapdos | 38 ×1 | 0 ×0 | 92 ×2 | 0 ×0 |
| Moltres | 37 ×1 | 0 ×0 | 180 ×4 | 0 ×0 |
| Raikou | 42 ×1 | 225 ×2 | 51 ×1 | 265 ×2 |
| Entei | 38 ×1 | 215 ×2 | 92 ×2 | 237 ×2 |
| Suicune | 30 ×1 | 91 ×1 | 36 ×1 | 94 ×1 |
| Lugia | 27 ×1 | 0 ×0 | 66 ×2 | 0 ×0 |
| Ho-Oh | 37 ×1 | 0 ×0 | 180 ×4 | 0 ×0 |
| Celebi | 34 ×1 | 46 ×½ | 40 ×1 | 52 ×½ |
| **Mediana de daño** | 37 | 128 | 62 | 142 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Celebi

Tipos: **Psychic / Grass** · HP 175 · Atk 120 · Def 120 · SpA 120 · SpD 120 · Vel 120

| Rival | Básica: Hoja Mágica<br>Grass · Esp · Pot 40 | Habilidad 1: Rayo Solar<br>Grass · Esp · Pot 75 | Habilidad 2: Deseo<br>Psychic · Estado · Pot — | Definitiva: Futuro Siniestro<br>Psychic · Esp · Pot 90 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 9 ×¼ | 16 ×¼ | Estado | 151 ×2 |
| Charmander | 22 ×½ | 38 ×½ | Estado | 91 ×1 |
| Squirtle | 74 ×2 | 130 ×2 | Estado | 77 ×1 |
| Pikachu | 44 ×1 | 77 ×1 | Estado | 91 ×1 |
| Gengar | 16 ×½ | 28 ×½ | Estado | 140 ×2 |
| Voltorb | 41 ×1 | 71 ×1 | Estado | 87 ×1 |
| Eevee | 37 ×1 | 64 ×1 | Estado | 76 ×1 |
| Lucario | 17 ×½ | 30 ×½ | Estado | 71 ×1 |
| Greninja | 69 ×2 | 118 ×2 | Estado (×0) | 0 ×0 |
| Mewtwo | 29 ×1 | 50 ×1 | Estado | 29 ×½ |
| Mew | 26 ×1 | 47 ×1 | Estado | 26 ×½ |
| Onix | 188 ×4 | 330 ×4 | Estado | 100 ×1 |
| Scyther | 7 ×¼ | 13 ×¼ | Estado | 65 ×1 |
| Gyarados | 26 ×1 | 47 ×1 | Estado | 53 ×1 |
| Tyranitar | 51 ×2 | 93 ×2 | Estado (×0) | 0 ×0 |
| Articuno | 10 ×½ | 18 ×½ | Estado | 45 ×1 |
| Zapdos | 14 ×½ | 25 ×½ | Estado | 59 ×1 |
| Moltres | 7 ×¼ | 13 ×¼ | Estado | 62 ×1 |
| Raikou | 26 ×1 | 47 ×1 | Estado | 53 ×1 |
| Entei | 16 ×½ | 28 ×½ | Estado | 70 ×1 |
| Suicune | 45 ×2 | 81 ×2 | Estado | 49 ×1 |
| Lugia | 9 ×½ | 16 ×½ | Estado | 18 ×½ |
| Ho-Oh | 4 ×¼ | 8 ×¼ | Estado | 38 ×1 |
| Groudon | 57 ×2 | 101 ×2 | Estado | 59 ×1 |
| **Mediana de daño** | 26 | 47 | — | 61 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Lugia

Tipos: **Psychic / Flying** · HP 181 · Atk 110 · Def 150 · SpA 110 · SpD 174 · Vel 130

| Rival | Básica: Onda Mental<br>Psychic · Esp · Pot 45 | Habilidad 1: Marea<br>Water · Esp · Pot 20/s | Habilidad 2: Ciclón<br>Flying · Esp · Pot 30 | Definitiva: Aerochorro<br>Flying · Esp · Pot 110 |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 74 ×2 | 14 ×½ | 51 ×2 | 171 ×2 |
| Charmander | 46 ×1 | 68 ×2 | 31 ×1 | 105 ×1 |
| Squirtle | 37 ×1 | 14 ×½ | 26 ×1 | 87 ×1 |
| Pikachu | 46 ×1 | 34 ×1 | 15 ×½ | 52 ×½ |
| Gengar | 67 ×2 | 29 ×1 | 23 ×1 | 77 ×1 |
| Voltorb | 43 ×1 | 34 ×1 | 14 ×½ | 48 ×½ |
| Eevee | 37 ×1 | 29 ×1 | 26 ×1 | 85 ×1 |
| Lucario | 37 ×1 | 29 ×1 | 25 ×1 | 81 ×1 |
| Greninja | 0 ×0 | 14 ×½ | 23 ×1 | 80 ×1 |
| Mewtwo | 14 ×½ | 24 ×1 | 19 ×1 | 67 ×1 |
| Mew | 13 ×½ | 24 ×1 | 18 ×1 | 61 ×1 |
| Onix | 49 ×1 | 155 ×4 | 16 ×½ | 55 ×½ |
| Scyther | 32 ×1 | 24 ×1 | 43 ×2 | 145 ×2 |
| Gyarados | 28 ×1 | 10 ×½ | 18 ×1 | 61 ×1 |
| Tyranitar | 0 ×0 | 49 ×2 | 9 ×½ | 30 ×½ |
| Articuno | 23 ×1 | 19 ×1 | 16 ×1 | 50 ×1 |
| Zapdos | 29 ×1 | 24 ×1 | 9 ×½ | 33 ×½ |
| Moltres | 31 ×1 | 49 ×2 | 19 ×1 | 70 ×1 |
| Raikou | 28 ×1 | 24 ×1 | 9 ×½ | 30 ×½ |
| Entei | 34 ×1 | 58 ×2 | 23 ×1 | 77 ×1 |
| Suicune | 25 ×1 | 10 ×½ | 16 ×1 | 53 ×1 |
| Ho-Oh | 18 ×1 | 29 ×2 | 13 ×1 | 42 ×1 |
| Celebi | 13 ×½ | 10 ×½ | 37 ×2 | 122 ×2 |
| Groudon | 29 ×1 | 49 ×2 | 19 ×1 | 67 ×1 |
| **Mediana de daño** | 30 | 27 | 19 | 67 |
| **Efectividad mediana** | ×1 | ×1 | ×1 | ×1 |

## Medianas por Pokémon

Resumen de las medianas de cada sección. `Combo` es la mediana del daño de los cuatro ataques sumados contra cada rival; las habilidades de estado cuentan como 0 en esa columna.

| Pokémon | Básica | Habilidad 1 | Habilidad 2 | Definitiva | Combo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pikachu | 12 | 12 | 43 | 19 | 83 |
| Voltorb | 24 | 16 | — | 90 | 124 |
| Gengar | 25 | 69 | 61 | 88 | 236 |
| Bulbasaur | 12 | — | 28 | 52 | 92 |
| Charmander | 12 | 37 | 39 | 42 | 129 |
| Squirtle | 11 | 22 | 31 | 48 | 107 |
| Lucario | 28 | 28 | 37 | 74 | 178 |
| Greninja | 37 | 54 | 37 | 82 | 223 |
| Articuno | 35 | 61 | 35 | 68 | 198 |
| Moltres | 38 | 53 | 50 | 81 | 220 |
| Mewtwo | 57 | — | 97 | 122 | 276 |
| Mew | 33 | — | 60 | — | 92 |
| Scyther | 29 | 46 | — | 82 | 162 |
| Tyranitar | 76 | 83 | 69 | 121 | 386 |
| Onix | 34 | 39 | 37 | 41 | 171 |
| Groudon | 37 | 128 | 62 | 142 | 335 |
| Celebi | 26 | 47 | — | 61 | 135 |
| Lugia | 30 | 27 | 19 | 67 | 156 |

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
