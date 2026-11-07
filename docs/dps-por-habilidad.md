# Daño por segundo por Pokémon y habilidad

> Generado automáticamente por `node scripts/generate-damage-matrix.mjs` a partir de `abilities.ts`, `pokedex.ts`, `combat.ts`, `typeChart.ts` y el manifiesto de sprites. No editar a mano.

## Cómo leer las tablas

- **Agrupación**: una sección por Pokémon atacante y una fila por rival. Cada columna es uno de sus cuatro ataques.
- **Celda**: daño esperado por segundo (`daño de un lanzamiento / cooldown`). La efectividad de cada celda está en [`tabla-danos-por-ataque.md`](tabla-danos-por-ataque.md).
- **Cooldown**: es el valor de la definición de la habilidad y empieza al iniciar el lanzamiento. El DPS no descuenta el `cast`, el `windup`, el bloqueo global ni el tiempo de movimiento entre ataques, así que es una **cota superior**.
- **Daño esperado**: nivel 50, IV 31, EV 0, naturaleza neutra, sin buffs, random medio 0,925, crítico 1/24 (×1,5) y precisión aplicada. STAB incluido.
- **Áreas**: se valoran con el rival en el centro (100 %). En el borde el daño radial baja hasta `radialMinDamage`.
- **Áreas `overTime`**: el daño de un lanzamiento suma todos los ticks (`ceil(duración / intervalo)`) con potencia por tick = `power × intervalo`.
- **Estado**: la habilidad no hace daño; la celda muestra `Estado`.
- **—**: hueco sin asignar o valor que no aplica.
- **Mediana**: valor central del DPS contra los 24 rivales (con un número par, media de los dos centrales).

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

| Rival | Básica: Placaje<br>Normal · Fís · Pot 40 · CD 0,25 s | Habilidad 1: Ataque Rápido<br>Normal · Fís · Pot 40 · CD 4 s | Habilidad 2: Rayo<br>Electric · Esp · Pot 90 · CD 8 s | Definitiva: Impactrueno<br>Electric · Esp · Pot 40 · CD 0,9 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 77,5 | 4,8 | 2,9 | 11,4 |
| Charmander | 81,7 | 5,1 | 7 | 28,3 |
| Squirtle | 61,3 | 3,8 | 12,3 | 47,8 |
| Gengar | 0 | 0 | 5,4 | 20,5 |
| Voltorb | 73,5 | 4,6 | 3,3 | 13,6 |
| Eevee | 73,5 | 4,6 | 5,9 | 23,9 |
| Lucario | 28,7 | 1,8 | 5,5 | 21,6 |
| Greninja | 61,3 | 3,8 | 11 | 43,2 |
| Mewtwo | 49,2 | 3,1 | 4,6 | 20,3 |
| Mew | 48,8 | 3,1 | 4,3 | 18,1 |
| Onix | 16,3 | 1 | 0 | 0 |
| Scyther | 53,2 | 3,3 | 9,9 | 40,9 |
| Gyarados | 53,2 | 3,3 | 17,4 | 72,6 |
| Tyranitar | 20,5 | 1,3 | 4,3 | 18,1 |
| Articuno | 48,8 | 3,1 | 7,1 | 29,4 |
| Zapdos | 49,2 | 3,1 | 4,6 | 20,3 |
| Moltres | 49,2 | 3,1 | 9,5 | 40,6 |
| Raikou | 53,2 | 3,3 | 2,2 | 9,1 |
| Entei | 49,2 | 3,1 | 5,4 | 20,5 |
| Suicune | 40,7 | 2,5 | 7,7 | 33,9 |
| Lugia | 36,7 | 2,3 | 5,6 | 27,2 |
| Ho-Oh | 49,2 | 3,1 | 5,6 | 27,2 |
| Celebi | 48,8 | 3,1 | 2,2 | 9,1 |
| Groudon | 36,7 | 2,3 | 0 | 0 |
| **Mediana de DPS** | 49,2 | 3,1 | 5,4 | 21 |

## Voltorb

Tipos: **Electric** · HP 115 · Atk 50 · Def 70 · SpA 75 · SpD 75 · Vel 120

| Rival | Básica: Chispa<br>Electric · Fís · Pot 65 · CD 0,6 s | Habilidad 1: Rollout<br>Normal · Fís · Pot 80 · CD 6 s | Habilidad 2: Onda Trueno<br>Electric · Estado · Pot — · CD 5 s | Definitiva: Explosión<br>Electric · Esp · Pot 175 · CD 18 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 25,5 | 4,1 | Estado | 2,7 |
| Charmander | 56,1 | 4,4 | Estado | 6,5 |
| Squirtle | 81,7 | 3,4 | Estado | 10,9 |
| Pikachu | 28,9 | 4,8 | Estado | 3,2 |
| Gengar | 42,5 | 0 | Estado | 4,8 |
| Eevee | 51 | 4,1 | Estado | 5,3 |
| Lucario | 37,5 | 1,5 | Estado | 5,2 |
| Greninja | 81,7 | 3,4 | Estado | 10,2 |
| Mewtwo | 32,4 | 2,7 | Estado | 4,1 |
| Mew | 30,5 | 2,4 | Estado | 3,9 |
| Onix | 0 | 0,8 | Estado | 0 |
| Scyther | 71,7 | 2,9 | Estado | 9,2 |
| Gyarados | 143,3 | 2,9 | Estado | 15,6 |
| Tyranitar | 30,5 | 1 | Estado | 3,9 |
| Articuno | 61 | 2,4 | Estado | 6,2 |
| Zapdos | 32,4 | 2,7 | Estado | 4,1 |
| Moltres | 64,9 | 2,7 | Estado | 8,8 |
| Raikou | 18,8 | 3,1 | Estado | 1,9 |
| Entei | 32,4 | 2,7 | Estado | 4,8 |
| Suicune | 54,4 | 2,2 | Estado | 6,8 |
| Lugia | 50,8 | 2 | Estado | 5,4 |
| Ho-Oh | 64,9 | 2,7 | Estado | 5,4 |
| Celebi | 15,2 | 2,4 | Estado | 1,9 |
| Groudon | 0 | 2 | Estado | 0 |
| **Mediana de DPS** | 40 | 2,7 | — | 5 |

## Gengar

Tipos: **Ghost / Poison** · HP 135 · Atk 85 · Def 80 · SpA 150 · SpD 95 · Vel 130

| Rival | Básica: Lengüetazo<br>Ghost · Fís · Pot 45 · CD 0,7 s | Habilidad 1: Bola Sombra<br>Ghost · Esp · Pot 70 · CD 6 s | Habilidad 2: Bomba Lodo<br>Poison · Esp · Pot 25/s · CD 9 s | Definitiva: Come Sueños<br>Ghost · Esp · Pot 90 · CD 11 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 52,5 | 12,9 | 8,5 | 9 |
| Charmander | 54 | 15,8 | 10,2 | 11 |
| Squirtle | 40,8 | 13,3 | 8,5 | 9,2 |
| Pikachu | 58,4 | 15,8 | 10,2 | 11 |
| Voltorb | 52,5 | 14,8 | 10,2 | 10,3 |
| Eevee | 0 | 0 | 8,5 | 0 |
| Lucario | 39,3 | 12,4 | 0 | 8,6 |
| Greninja | 20,4 | 6,1 | 8,5 | 4,2 |
| Mewtwo | 64,3 | 20,4 | 6,8 | 14,1 |
| Mew | 61,4 | 18,7 | 5,7 | 13 |
| Onix | 21,8 | 17 | 2,3 | 12 |
| Scyther | 35 | 11,2 | 7,4 | 7,8 |
| Gyarados | 36,4 | 9,4 | 5,7 | 6,5 |
| Tyranitar | 13,2 | 4,6 | 2,8 | 3,2 |
| Articuno | 30,7 | 7,7 | 5,1 | 5,3 |
| Zapdos | 35 | 10,2 | 6,8 | 7,1 |
| Moltres | 32,1 | 10,7 | 6,8 | 7,3 |
| Raikou | 36,4 | 9,4 | 5,7 | 6,5 |
| Entei | 35 | 11,7 | 7,4 | 8,2 |
| Suicune | 26,3 | 8,3 | 5,7 | 5,8 |
| Lugia | 52,3 | 12,6 | 4 | 9,1 |
| Ho-Oh | 32,1 | 6,3 | 4 | 4,5 |
| Celebi | 61,4 | 18,7 | 11,4 | 13 |
| Groudon | 23,3 | 10,2 | 3,4 | 7,1 |
| **Mediana de DPS** | 35,7 | 11,5 | 6,8 | 8 |

## Bulbasaur

Tipos: **Grass / Poison** · HP 120 · Atk 69 · Def 69 · SpA 85 · SpD 85 · Vel 65

| Rival | Básica: Placaje<br>Normal · Fís · Pot 40 · CD 0,25 s | Habilidad 1: Paralizador<br>Grass · Estado · Pot — · CD 7 s | Habilidad 2: Hoja Afilada<br>Grass · Esp · Pot 60 · CD 5 s | Definitiva: Lluevehojas<br>Grass · Esp · Pot 120 · CD 14 s |
| --- | ---: | ---: | ---: | ---: |
| Charmander | 77,5 | Estado | 4,7 | 3,1 |
| Squirtle | 57,3 | Estado | 15,1 | 10,4 |
| Pikachu | 81,7 | Estado | 9,4 | 6,3 |
| Gengar | 0 | Estado | 3,5 | 2,3 |
| Voltorb | 69,3 | Estado | 8,6 | 5,8 |
| Eevee | 69,3 | Estado | 7,6 | 5,1 |
| Lucario | 24,7 | Estado | 3,7 | 2,4 |
| Greninja | 53,2 | Estado | 14,7 | 9,7 |
| Mewtwo | 48,8 | Estado | 6,1 | 4 |
| Mew | 44,8 | Estado | 5,5 | 3,7 |
| Onix | 12,3 | Estado | 40 | 26,9 |
| Scyther | 49,2 | Estado | 1,6 | 1 |
| Gyarados | 49,2 | Estado | 5,5 | 3,7 |
| Tyranitar | 20,3 | Estado | 11 | 7,5 |
| Articuno | 44,8 | Estado | 2,3 | 1,5 |
| Zapdos | 48,8 | Estado | 3,1 | 1,9 |
| Moltres | 48,8 | Estado | 1,4 | 1 |
| Raikou | 49,2 | Estado | 5,5 | 3,7 |
| Entei | 48,8 | Estado | 3,5 | 2,3 |
| Suicune | 36,7 | Estado | 9,8 | 6,7 |
| Lugia | 36,7 | Estado | 1,8 | 1,2 |
| Ho-Oh | 48,8 | Estado | 0,8 | 0,6 |
| Celebi | 44,8 | Estado | 2,7 | 1,9 |
| Groudon | 32,7 | Estado | 12,3 | 7,9 |
| **Mediana de DPS** | 48,8 | — | 5,5 | 3,7 |

## Charmander

Tipos: **Fire** · HP 114 · Atk 72 · Def 63 · SpA 80 · SpD 70 · Vel 85

| Rival | Básica: Arañazo<br>Normal · Fís · Pot 40 · CD 0,3 s | Habilidad 1: Giro Fuego<br>Fire · Esp · Pot 35/s · CD 6 s | Habilidad 2: Lanzallamas<br>Fire · Esp · Pot 90 · CD 6,5 s | Definitiva: Anillo Ígneo<br>Fire · Esp · Pot 110 · CD 14 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 61,3 | 15,6 | 16,9 | 7,9 |
| Squirtle | 47,8 | 3,5 | 4,2 | 2 |
| Pikachu | 71,4 | 10,4 | 10,1 | 4,8 |
| Gengar | 0 | 7,8 | 7,5 | 3,5 |
| Voltorb | 61,3 | 8,7 | 9,4 | 4,5 |
| Eevee | 61,3 | 7,8 | 8,5 | 4 |
| Lucario | 23,9 | 15,6 | 16 | 7,6 |
| Greninja | 47,8 | 3,5 | 3,8 | 1,9 |
| Mewtwo | 40,7 | 6,1 | 6,3 | 3,2 |
| Mew | 37,4 | 6,1 | 5,8 | 2,9 |
| Onix | 13,6 | 5,2 | 5,3 | 2,6 |
| Scyther | 41 | 12,3 | 14,1 | 6,8 |
| Gyarados | 41 | 2,7 | 2,8 | 1,4 |
| Tyranitar | 16,9 | 2,7 | 2,8 | 1,4 |
| Articuno | 37,4 | 10,4 | 9,7 | 4,6 |
| Zapdos | 41 | 6,1 | 6,3 | 3,2 |
| Moltres | 40,7 | 2,7 | 3,3 | 1,6 |
| Raikou | 44,3 | 6,1 | 5,8 | 2,9 |
| Entei | 41 | 3,5 | 3,8 | 1,7 |
| Suicune | 33,9 | 2,6 | 2,7 | 1,2 |
| Lugia | 30,6 | 3,5 | 4,2 | 2 |
| Ho-Oh | 40,7 | 1,7 | 2 | 1 |
| Celebi | 37,4 | 12,3 | 11,6 | 5,7 |
| Groudon | 27,2 | 6,1 | 6,3 | 3,2 |
| **Mediana de DPS** | 40,7 | 6,1 | 6,1 | 3 |

## Squirtle

Tipos: **Water** · HP 119 · Atk 68 · Def 85 · SpA 70 · SpD 84 · Vel 63

| Rival | Básica: Placaje<br>Normal · Fís · Pot 40 · CD 0,25 s | Habilidad 1: Acua Jet<br>Water · Fís · Pot 45 · CD 5 s | Habilidad 2: Rayo Burbuja<br>Water · Esp · Pot 65 · CD 3 s | Definitiva: Hidrobomba<br>Water · Esp · Pot 115 · CD 9 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 69,3 | 2,9 | 5,8 | 3 |
| Charmander | 73,5 | 12,7 | 27,3 | 14,7 |
| Pikachu | 77,5 | 6,7 | 13,6 | 7,4 |
| Gengar | 0 | 4,9 | 10,5 | 5,5 |
| Voltorb | 69,3 | 5,7 | 12,6 | 6,8 |
| Eevee | 69,3 | 5,7 | 11,6 | 5,9 |
| Lucario | 24,7 | 4,3 | 11,2 | 5,6 |
| Greninja | 53,2 | 2,3 | 5,4 | 2,8 |
| Mewtwo | 44,8 | 3,7 | 9,2 | 4,7 |
| Mew | 40,7 | 3,7 | 8,2 | 4,3 |
| Onix | 12,3 | 9,8 | 58,6 | 31,1 |
| Scyther | 48,8 | 3,9 | 10,2 | 5,2 |
| Gyarados | 49,2 | 1,9 | 4,1 | 2,1 |
| Tyranitar | 20,3 | 6,5 | 16,3 | 8,6 |
| Articuno | 40,7 | 3,7 | 6,5 | 3,7 |
| Zapdos | 48,8 | 3,7 | 9,2 | 4,7 |
| Moltres | 44,8 | 7,4 | 19,1 | 9,8 |
| Raikou | 49,2 | 4,3 | 8,2 | 4,3 |
| Entei | 48,8 | 7,4 | 21,1 | 11 |
| Suicune | 36,7 | 1,4 | 3,4 | 1,8 |
| Lugia | 32,7 | 2,7 | 6,1 | 3,1 |
| Ho-Oh | 44,8 | 7,4 | 12,2 | 6,1 |
| Celebi | 40,7 | 1,8 | 4,1 | 2,1 |
| Groudon | 32,7 | 5,3 | 18,4 | 9,4 |
| **Mediana de DPS** | 44,8 | 4,3 | 10,4 | 5,4 |

## Lucario

Tipos: **Fighting / Steel** · HP 145 · Atk 130 · Def 90 · SpA 135 · SpD 90 · Vel 110

| Rival | Básica: Garra Metal<br>Steel · Fís · Pot 45 · CD 0,5 s | Habilidad 1: Velocidad Extrema<br>Normal · Fís · Pot 55 · CD 6 s | Habilidad 2: Esfera Aura<br>Fighting · Esp · Pot 60 · CD 5 s | Definitiva: Combate Cercano<br>Fighting · Fís · Pot 125 · CD 13 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 110,1 | 7,3 | 5,9 | 5,7 |
| Charmander | 57,3 | 8 | 14,7 | 12,5 |
| Squirtle | 43 | 6,1 | 12,3 | 9,3 |
| Pikachu | 61,3 | 8,3 | 14,7 | 13 |
| Gengar | 94 | 0 | 0 | 0 |
| Voltorb | 53,1 | 7,1 | 13,7 | 11,3 |
| Eevee | 106,2 | 7,1 | 23,7 | 22,6 |
| Greninja | 42,8 | 6 | 22,5 | 18,1 |
| Mewtwo | 69,4 | 4,6 | 4,7 | 3,5 |
| Mew | 63,3 | 4,3 | 4,3 | 3,3 |
| Onix | 86 | 1,4 | 31,1 | 8,6 |
| Scyther | 73,6 | 5,1 | 2,5 | 2 |
| Gyarados | 36,8 | 5,1 | 4,3 | 4 |
| Tyranitar | 114,3 | 2 | 34,3 | 24,5 |
| Articuno | 126,5 | 4,3 | 7,4 | 6,6 |
| Zapdos | 36,8 | 4,8 | 4,7 | 3,8 |
| Moltres | 34,7 | 4,6 | 4,9 | 3,5 |
| Raikou | 38,8 | 5,4 | 8,6 | 8,3 |
| Entei | 36,8 | 4,8 | 11 | 7,5 |
| Suicune | 28,6 | 3,9 | 7,6 | 5,7 |
| Lugia | 51 | 3,4 | 1,4 | 1,3 |
| Ho-Oh | 34,7 | 4,6 | 3,1 | 3,5 |
| Celebi | 63,3 | 4,3 | 4,3 | 3,3 |
| Groudon | 49 | 3,2 | 9,4 | 4,9 |
| **Mediana de DPS** | 55,2 | 4,7 | 7,5 | 5,7 |

## Greninja

Tipos: **Water / Dark** · HP 147 · Atk 115 · Def 87 · SpA 123 · SpD 91 · Vel 142

| Rival | Básica: Shuriken de Agua<br>Water · Esp · Pot 45 · CD 0,65 s | Habilidad 1: Tajo Umbrío<br>Dark · Fís · Pot 70 · CD 1,4 s | Habilidad 2: Sombra Vil<br>Dark · Fís · Pot 50 · CD 7 s | Definitiva: Pulso Umbrío<br>Dark · Esp · Pot 95 · CD 10 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 31,4 | 53,2 | 7,6 | 8,7 |
| Charmander | 153,8 | 57,6 | 8,3 | 10,5 |
| Squirtle | 31,4 | 42,3 | 6,1 | 8,9 |
| Pikachu | 76,9 | 61,3 | 8,8 | 10,5 |
| Gengar | 56,6 | 91,8 | 13,1 | 15,5 |
| Voltorb | 72,3 | 52,5 | 7,6 | 9,8 |
| Eevee | 62,9 | 52,5 | 7,6 | 8,7 |
| Lucario | 61,2 | 19,7 | 2,9 | 4,1 |
| Mewtwo | 51,8 | 67,1 | 9,9 | 13,5 |
| Mew | 47,1 | 61,3 | 9 | 12,3 |
| Onix | 338,7 | 20,4 | 3,1 | 11,3 |
| Scyther | 56,5 | 37,1 | 5,3 | 7,5 |
| Gyarados | 23,5 | 37,1 | 5,3 | 6,1 |
| Tyranitar | 94,2 | 13,9 | 2 | 3,1 |
| Articuno | 37,7 | 30,6 | 4,5 | 5,2 |
| Zapdos | 51,8 | 35 | 5,3 | 6,7 |
| Moltres | 106,8 | 33,6 | 5 | 7 |
| Raikou | 47,1 | 39,3 | 5,4 | 6,1 |
| Entei | 113,2 | 35 | 5,3 | 7,8 |
| Suicune | 20,4 | 27 | 3,9 | 5,6 |
| Lugia | 29,9 | 49,6 | 7 | 8,6 |
| Ho-Oh | 59,9 | 33,6 | 5 | 4,3 |
| Celebi | 23,5 | 61,3 | 9 | 12,3 |
| Groudon | 103,6 | 24 | 3,2 | 6,7 |
| **Mediana de DPS** | 56,6 | 38,2 | 5,3 | 8,2 |

## Articuno

Tipos: **Ice / Flying** · HP 165 · Atk 105 · Def 120 · SpA 115 · SpD 145 · Vel 105

| Rival | Básica: Golpe Ala<br>Flying · Fís · Pot 55 · CD 0,55 s | Habilidad 1: Rayo Hielo<br>Ice · Esp · Pot 90 · CD 7 s | Habilidad 2: Viento Gélido<br>Ice · Esp · Pot 55 · CD 8 s | Definitiva: Ventisca<br>Ice · Esp · Pot 110 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 193 | 21,9 | 11,2 | 11,2 |
| Charmander | 105,9 | 6,6 | 3,3 | 3,4 |
| Squirtle | 78 | 5,5 | 2,9 | 2,8 |
| Pikachu | 55,7 | 13,3 | 6,7 | 6,8 |
| Gengar | 83,5 | 9,8 | 5,1 | 5 |
| Voltorb | 48,3 | 12,4 | 6,5 | 6,4 |
| Eevee | 96,5 | 10,9 | 5,6 | 5,6 |
| Lucario | 74,3 | 5,3 | 2,6 | 2,6 |
| Greninja | 78 | 5,3 | 2,6 | 2,6 |
| Mewtwo | 63,1 | 8,5 | 4,4 | 4,4 |
| Mew | 57,5 | 7,9 | 4,1 | 4 |
| Onix | 18,6 | 28,9 | 14,6 | 14,7 |
| Scyther | 133,8 | 18,7 | 9,5 | 9,6 |
| Gyarados | 66,9 | 7,9 | 4,1 | 4 |
| Tyranitar | 26 | 7,9 | 4,1 | 4 |
| Zapdos | 33,4 | 16,9 | 8,7 | 8,8 |
| Moltres | 63,1 | 8,9 | 4,5 | 4,6 |
| Raikou | 33,5 | 7,9 | 4,1 | 4 |
| Entei | 66,8 | 4,8 | 2,5 | 2,5 |
| Suicune | 50,1 | 3,5 | 1,8 | 1,8 |
| Lugia | 44,5 | 10,8 | 5,3 | 5,5 |
| Ho-Oh | 63,1 | 5,4 | 2,7 | 2,8 |
| Celebi | 115 | 15,7 | 8,2 | 8,1 |
| Groudon | 40,9 | 16,9 | 8,7 | 8,8 |
| **Mediana de DPS** | 63,1 | 8,7 | 4,4 | 4,5 |

## Moltres

Tipos: **Fire / Flying** · HP 165 · Atk 120 · Def 110 · SpA 145 · SpD 105 · Vel 110

| Rival | Básica: Ataque Aéreo<br>Flying · Fís · Pot 55 · CD 0,55 s | Habilidad 1: Tajo Aéreo<br>Flying · Esp · Pot 65 · CD 3,5 s | Habilidad 2: Onda Ígnea<br>Fire · Esp · Pot 65 · CD 8 s | Definitiva: Ataque Celeste<br>Flying · Fís · Pot 130 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 222,9 | 40,2 | 16,7 | 17 |
| Charmander | 122,5 | 24,5 | 5,1 | 9,3 |
| Squirtle | 90,9 | 20,4 | 4,2 | 6,9 |
| Pikachu | 63,1 | 12,3 | 10,2 | 4,9 |
| Gengar | 96,5 | 17,8 | 7,4 | 7,4 |
| Voltorb | 53,9 | 11,4 | 9,5 | 4,2 |
| Eevee | 107,7 | 20,1 | 8,4 | 8,5 |
| Lucario | 85,5 | 19,3 | 16 | 6,6 |
| Greninja | 89,1 | 18,7 | 3,9 | 6,8 |
| Mewtwo | 68,8 | 15,7 | 6,5 | 5,4 |
| Mew | 66,8 | 14,3 | 5,9 | 5 |
| Onix | 22,3 | 13,1 | 5,4 | 1,7 |
| Scyther | 155,9 | 33,9 | 14,1 | 11,8 |
| Gyarados | 78 | 14,3 | 2,9 | 5,9 |
| Tyranitar | 29,7 | 7 | 2,9 | 2,2 |
| Articuno | 66,8 | 11,7 | 9,7 | 5 |
| Zapdos | 35,3 | 7,9 | 6,5 | 2,8 |
| Raikou | 39,1 | 7 | 5,9 | 3,1 |
| Entei | 72,3 | 17,8 | 3,6 | 5,6 |
| Suicune | 57,5 | 12,6 | 2,6 | 4,4 |
| Lugia | 52 | 9,9 | 4,1 | 3,9 |
| Ho-Oh | 68,8 | 9,9 | 2,1 | 5,4 |
| Celebi | 133,6 | 28,6 | 11,9 | 9,9 |
| Groudon | 50,1 | 15,7 | 6,5 | 3,7 |
| **Mediana de DPS** | 68,8 | 15 | 6,2 | 5,4 |

## Mewtwo

Tipos: **Psychic** · HP 181 · Atk 130 · Def 110 · SpA 174 · SpD 110 · Vel 150

| Rival | Básica: Telequinesis<br>Psychic · Esp · Pot 55 · CD 0,6 s | Habilidad 1: Teletransporte<br>Psychic · Estado · Pot — · CD 6 s | Habilidad 2: Psíquico<br>Psychic · Esp · Pot 95 · CD 7 s | Definitiva: Psicoataque<br>Psychic · Esp · Pot 125 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 238,2 | Estado | 35 | 20,3 |
| Charmander | 144,7 | Estado | 21,1 | 12,3 |
| Squirtle | 122,5 | Estado | 17,7 | 10,3 |
| Pikachu | 144,7 | Estado | 21,1 | 12,3 |
| Gengar | 214,3 | Estado | 31,5 | 18,2 |
| Voltorb | 134,5 | Estado | 19,7 | 11,5 |
| Eevee | 119,1 | Estado | 17,5 | 10,2 |
| Lucario | 112,3 | Estado | 16,3 | 9,6 |
| Greninja | 0 | Estado | 0 | 0 |
| Mew | 42,5 | Estado | 6,1 | 3,6 |
| Onix | 154,8 | Estado | 22,8 | 13,3 |
| Scyther | 102,2 | Estado | 14,9 | 8,6 |
| Gyarados | 86,7 | Estado | 12,4 | 7,2 |
| Tyranitar | 0 | Estado | 0 | 0 |
| Articuno | 71,5 | Estado | 10,5 | 6 |
| Zapdos | 93,5 | Estado | 13,6 | 8 |
| Moltres | 97,1 | Estado | 14,2 | 8,3 |
| Raikou | 86,7 | Estado | 12,4 | 7,2 |
| Entei | 107,2 | Estado | 15,8 | 9,1 |
| Suicune | 76,5 | Estado | 10,9 | 6,4 |
| Lugia | 30,6 | Estado | 4,2 | 2,5 |
| Ho-Oh | 61,3 | Estado | 8,5 | 5 |
| Celebi | 42,5 | Estado | 6,1 | 3,6 |
| Groudon | 93,5 | Estado | 13,6 | 8 |
| **Mediana de DPS** | 95,3 | — | 13,9 | 8,1 |

## Mew

Tipos: **Psychic** · HP 175 · Atk 120 · Def 120 · SpA 120 · SpD 120 · Vel 120

| Rival | Básica: Golpe Psíquico<br>Psychic · Esp · Pot 45 · CD 0,3 s | Habilidad 1: Agilidad<br>Psychic · Estado · Pot — · CD 8 s | Habilidad 2: Premonición<br>Psychic · Esp · Pot 85 · CD 10 s | Definitiva: Recuperación<br>Psychic · Estado · Pot — · CD 14 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 265,3 | Estado | 14,9 | Estado |
| Charmander | 163,3 | Estado | 9,3 | Estado |
| Squirtle | 136,3 | Estado | 7,7 | Estado |
| Pikachu | 163,3 | Estado | 9,3 | Estado |
| Gengar | 245,3 | Estado | 13,7 | Estado |
| Voltorb | 153,1 | Estado | 8,6 | Estado |
| Eevee | 132,6 | Estado | 7,5 | Estado |
| Lucario | 126,1 | Estado | 7,1 | Estado |
| Greninja | 0 | Estado | 0 | Estado |
| Mewtwo | 51,1 | Estado | 2,9 | Estado |
| Onix | 176,9 | Estado | 9,9 | Estado |
| Scyther | 115,7 | Estado | 6,4 | Estado |
| Gyarados | 95,3 | Estado | 5,5 | Estado |
| Tyranitar | 0 | Estado | 0 | Estado |
| Articuno | 81,7 | Estado | 4,4 | Estado |
| Zapdos | 105,4 | Estado | 5,8 | Estado |
| Moltres | 112,2 | Estado | 6,1 | Estado |
| Raikou | 95,3 | Estado | 5,5 | Estado |
| Entei | 122,6 | Estado | 6,8 | Estado |
| Suicune | 85 | Estado | 4,9 | Estado |
| Lugia | 30,8 | Estado | 1,8 | Estado |
| Ho-Oh | 64,9 | Estado | 3,7 | Estado |
| Celebi | 47,6 | Estado | 2,8 | Estado |
| Groudon | 105,4 | Estado | 5,8 | Estado |
| **Mediana de DPS** | 108,8 | — | 6 | — |

## Scyther

Tipos: **Bug / Flying** · HP 145 · Atk 130 · Def 100 · SpA 75 · SpD 100 · Vel 125

| Rival | Básica: Golpe Furia<br>Bug · Fís · Pot 45 · CD 0,4 s | Habilidad 1: Corte Aéreo<br>Flying · Fís · Pot 60 · CD 6,5 s | Habilidad 2: Danza Espada<br>Normal · Estado · Pot — · CD 12 s | Definitiva: Tijera X<br>Bug · Fís · Pot 130 · CD 14 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 137,6 | 22 | Estado | 10,9 |
| Charmander | 71,6 | 11,9 | Estado | 6,1 |
| Squirtle | 109,9 | 9 | Estado | 9 |
| Pikachu | 153,2 | 6,3 | Estado | 12,5 |
| Gengar | 28,1 | 9,4 | Estado | 2,3 |
| Voltorb | 132,7 | 5,5 | Estado | 10,8 |
| Eevee | 132,7 | 11 | Estado | 10,8 |
| Lucario | 25,5 | 8,6 | Estado | 2 |
| Greninja | 214,4 | 8,6 | Estado | 17,5 |
| Mewtwo | 173,5 | 7,1 | Estado | 13,7 |
| Mew | 158,1 | 6,3 | Estado | 12,7 |
| Onix | 53,8 | 2,2 | Estado | 4,2 |
| Gyarados | 46 | 7,7 | Estado | 3,9 |
| Tyranitar | 142,9 | 2,8 | Estado | 11,8 |
| Articuno | 38,3 | 6,3 | Estado | 3,1 |
| Zapdos | 45,9 | 3,6 | Estado | 3,6 |
| Moltres | 20,4 | 7,1 | Estado | 1,7 |
| Raikou | 99,5 | 4,1 | Estado | 8,1 |
| Entei | 45,9 | 7,2 | Estado | 3,6 |
| Suicune | 71,5 | 5,7 | Estado | 5,7 |
| Lugia | 63,8 | 5,2 | Estado | 5,1 |
| Ho-Oh | 20,4 | 7,1 | Estado | 1,7 |
| Celebi | 316,3 | 12,6 | Estado | 25,4 |
| Groudon | 61,3 | 4,9 | Estado | 4,8 |
| **Mediana de DPS** | 71,5 | 7,1 | — | 5,9 |

## Tyranitar

Tipos: **Rock / Dark** · HP 175 · Atk 154 · Def 130 · SpA 115 · SpD 120 · Vel 81

| Rival | Básica: Triturar<br>Dark · Fís · Pot 75 · CD 0,85 s | Habilidad 1: Avalancha<br>Rock · Fís · Pot 75 · CD 5 s | Habilidad 2: Terremoto<br>Ground · Fís · Pot 40/s · CD 9 s | Definitiva: Roca Afilada<br>Rock · Fís · Pot 125 · CD 12 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 123,7 | 9,4 | 10,8 | 5,8 |
| Charmander | 134,6 | 41,2 | 23,8 | 25,5 |
| Squirtle | 100,9 | 15,4 | 8,5 | 9,5 |
| Pikachu | 141,8 | 21,7 | 25 | 13,5 |
| Gengar | 216 | 8,3 | 18,1 | 5 |
| Voltorb | 122,5 | 18,7 | 21,5 | 11,5 |
| Eevee | 122,5 | 18,7 | 10,8 | 11,5 |
| Lucario | 46,9 | 3,5 | 17 | 2,2 |
| Greninja | 49,3 | 15,1 | 8,5 | 9,3 |
| Mewtwo | 158,5 | 12,1 | 6,8 | 7,4 |
| Mew | 144,2 | 11 | 6,8 | 6,7 |
| Onix | 48,1 | 3,7 | 9,1 | 2,2 |
| Scyther | 86,5 | 52,9 | 0 | 32,1 |
| Gyarados | 87,6 | 26,8 | 0 | 16,3 |
| Articuno | 72,1 | 44,1 | 0 | 26,9 |
| Zapdos | 82,8 | 25,4 | 0 | 15,3 |
| Moltres | 79,3 | 48,5 | 0 | 29,7 |
| Raikou | 90 | 13,8 | 15,9 | 8,6 |
| Entei | 82,8 | 25,4 | 13,7 | 15,3 |
| Suicune | 64,8 | 9,9 | 6,2 | 6 |
| Lugia | 115,3 | 17,6 | 0 | 10,8 |
| Ho-Oh | 79,3 | 48,5 | 0 | 29,7 |
| Celebi | 144,2 | 11 | 3,4 | 6,7 |
| Groudon | 54 | 4 | 5,1 | 2,5 |
| **Mediana de DPS** | 88,8 | 16,5 | 7,7 | 10,1 |

## Onix

Tipos: **Rock / Ground** · HP 110 · Atk 65 · Def 180 · SpA 50 · SpD 65 · Vel 90

| Rival | Básica: Atadura<br>Rock · Fís · Pot 65 · CD 0,7 s | Habilidad 1: Lanzarrocas<br>Rock · Fís · Pot 80 · CD 4,5 s | Habilidad 2: Excavar<br>Ground · Fís · Pot 85 · CD 8 s | Definitiva: Fisura<br>Ground · Fís · Pot 135 · CD 14 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 26,3 | 5,2 | 6,5 | 4 |
| Charmander | 122,5 | 22,4 | 14 | 8,9 |
| Squirtle | 45,2 | 8 | 5,1 | 3,3 |
| Pikachu | 62,8 | 11,8 | 14,6 | 9,3 |
| Gengar | 24,8 | 4,3 | 11 | 7 |
| Voltorb | 54 | 9,9 | 12,5 | 8 |
| Eevee | 54 | 9,9 | 6,3 | 4 |
| Lucario | 10,2 | 1,9 | 9,9 | 6,1 |
| Greninja | 45,2 | 8 | 5 | 3,2 |
| Mewtwo | 35 | 6,5 | 4,2 | 2,6 |
| Mew | 32,1 | 6 | 3,8 | 2,4 |
| Scyther | 157,4 | 28,4 | 0 | 0 |
| Gyarados | 78,7 | 14,7 | 0 | 0 |
| Tyranitar | 30,7 | 5,4 | 6,9 | 4,3 |
| Articuno | 128,6 | 24,1 | 0 | 0 |
| Zapdos | 72,9 | 13,4 | 0 | 0 |
| Moltres | 140 | 25,9 | 0 | 0 |
| Raikou | 40,8 | 7,8 | 9,2 | 5,8 |
| Entei | 72,9 | 13,4 | 8,7 | 5,3 |
| Suicune | 27,8 | 5,2 | 3,4 | 2 |
| Lugia | 52,6 | 9,5 | 0 | 0 |
| Ho-Oh | 140 | 25,9 | 0 | 0 |
| Celebi | 32,1 | 6 | 1,9 | 1,2 |
| Groudon | 13 | 2,2 | 2,8 | 1,8 |
| **Mediana de DPS** | 48,9 | 8,7 | 4,6 | 2,9 |

## Groudon

Tipos: **Ground** · HP 175 · Atk 170 · Def 160 · SpA 120 · SpD 110 · Vel 110

| Rival | Básica: Cuchillada<br>Normal · Fís · Pot 55 · CD 0,6 s | Habilidad 1: Terremoto<br>Ground · Fís · Pot 40/s · CD 9 s | Habilidad 2: Avalancha<br>Rock · Fís · Pot 75 · CD 5 s | Definitiva: Filo del Abismo<br>Ground · Fís · Pot 130 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 95,3 | 17,6 | 7 | 12 |
| Charmander | 103,8 | 38,6 | 30,9 | 26,5 |
| Squirtle | 78,3 | 14,2 | 11,4 | 9,8 |
| Pikachu | 109 | 40,8 | 16 | 27,7 |
| Gengar | 0 | 30,6 | 6,1 | 20,7 |
| Voltorb | 93,6 | 35,1 | 13,8 | 23,7 |
| Eevee | 93,6 | 17,6 | 13,8 | 11,8 |
| Lucario | 35,8 | 27,2 | 2,6 | 18,5 |
| Greninja | 76,5 | 14,2 | 11,2 | 9,6 |
| Mewtwo | 61,2 | 10,8 | 9 | 7,6 |
| Mew | 56,1 | 10,2 | 8,1 | 7 |
| Onix | 18,7 | 14,7 | 2,8 | 9,3 |
| Scyther | 66,4 | 0 | 39 | 0 |
| Gyarados | 66,4 | 0 | 19,5 | 0 |
| Tyranitar | 25,5 | 20,3 | 7,5 | 12,9 |
| Articuno | 56,1 | 0 | 32,3 | 0 |
| Zapdos | 63 | 0 | 18,4 | 0 |
| Moltres | 61,2 | 0 | 36 | 0 |
| Raikou | 69,7 | 25 | 10,3 | 17,6 |
| Entei | 63 | 23,9 | 18,4 | 15,8 |
| Suicune | 49,4 | 10,2 | 7,2 | 6,2 |
| Lugia | 44,2 | 0 | 13,2 | 0 |
| Ho-Oh | 61,2 | 0 | 36 | 0 |
| Celebi | 56,1 | 5,1 | 8,1 | 3,5 |
| **Mediana de DPS** | 62,1 | 14,2 | 12,3 | 9,4 |

## Celebi

Tipos: **Psychic / Grass** · HP 175 · Atk 120 · Def 120 · SpA 120 · SpD 120 · Vel 120

| Rival | Básica: Hoja Mágica<br>Grass · Esp · Pot 40 · CD 0,8 s | Habilidad 1: Rayo Solar<br>Grass · Esp · Pot 75 · CD 8 s | Habilidad 2: Deseo<br>Psychic · Estado · Pot — · CD 13 s | Definitiva: Futuro Siniestro<br>Psychic · Esp · Pot 90 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 11,5 | 1,9 | Estado | 10,1 |
| Charmander | 26,9 | 4,7 | Estado | 6,1 |
| Squirtle | 92 | 16,2 | Estado | 5,1 |
| Pikachu | 54,9 | 9,6 | Estado | 6,1 |
| Gengar | 20,4 | 3,5 | Estado | 9,3 |
| Voltorb | 51,1 | 8,9 | Estado | 5,8 |
| Eevee | 45,9 | 8 | Estado | 5 |
| Lucario | 21,7 | 3,8 | Estado | 4,7 |
| Greninja | 86,8 | 14,8 | Estado | 0 |
| Mewtwo | 35,7 | 6,3 | Estado | 1,9 |
| Mew | 31,9 | 5,8 | Estado | 1,7 |
| Onix | 235 | 41,2 | Estado | 6,7 |
| Scyther | 9 | 1,6 | Estado | 4,3 |
| Gyarados | 31,9 | 5,8 | Estado | 3,6 |
| Tyranitar | 63,8 | 11,6 | Estado | 0 |
| Articuno | 12,8 | 2,3 | Estado | 3 |
| Zapdos | 17,9 | 3,2 | Estado | 3,9 |
| Moltres | 9 | 1,6 | Estado | 4,1 |
| Raikou | 31,9 | 5,8 | Estado | 3,6 |
| Entei | 20,4 | 3,5 | Estado | 4,7 |
| Suicune | 56,3 | 10,2 | Estado | 3,3 |
| Lugia | 11,5 | 1,9 | Estado | 1,2 |
| Ho-Oh | 5,2 | 1 | Estado | 2,5 |
| Groudon | 71,5 | 12,6 | Estado | 3,9 |
| **Mediana de DPS** | 31,9 | 5,8 | — | 4 |

## Lugia

Tipos: **Psychic / Flying** · HP 181 · Atk 110 · Def 150 · SpA 110 · SpD 174 · Vel 130

| Rival | Básica: Onda Mental<br>Psychic · Esp · Pot 45 · CD 0,8 s | Habilidad 1: Marea<br>Water · Esp · Pot 20/s · CD 9 s | Habilidad 2: Ciclón<br>Flying · Esp · Pot 30 · CD 12 s | Definitiva: Aerochorro<br>Flying · Esp · Pot 110 · CD 16 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 92 | 1,6 | 4,3 | 10,7 |
| Charmander | 57,4 | 7,6 | 2,6 | 6,5 |
| Squirtle | 46 | 1,6 | 2,1 | 5,5 |
| Pikachu | 57,4 | 3,8 | 1,3 | 3,3 |
| Gengar | 84,2 | 3,2 | 1,9 | 4,8 |
| Voltorb | 53,6 | 3,8 | 1,2 | 3 |
| Eevee | 46 | 3,2 | 2,1 | 5,3 |
| Lucario | 45,9 | 3,2 | 2 | 5,1 |
| Greninja | 0 | 1,6 | 1,9 | 5 |
| Mewtwo | 17,9 | 2,7 | 1,6 | 4,2 |
| Mew | 16,6 | 2,7 | 1,5 | 3,8 |
| Onix | 61,3 | 17,2 | 1,4 | 3,5 |
| Scyther | 39,5 | 2,7 | 3,6 | 9,1 |
| Gyarados | 34,4 | 1,1 | 1,5 | 3,8 |
| Tyranitar | 0 | 5,4 | 0,8 | 1,9 |
| Articuno | 28,1 | 2,2 | 1,4 | 3,2 |
| Zapdos | 35,7 | 2,7 | 0,8 | 2,1 |
| Moltres | 38,3 | 5,4 | 1,6 | 4,4 |
| Raikou | 34,4 | 2,7 | 0,8 | 1,9 |
| Entei | 42,1 | 6,5 | 1,9 | 4,8 |
| Suicune | 30,6 | 1,1 | 1,4 | 3,3 |
| Ho-Oh | 23 | 3,3 | 1,1 | 2,6 |
| Celebi | 16,6 | 1,1 | 3,1 | 7,6 |
| Groudon | 35,7 | 5,4 | 1,6 | 4,2 |
| **Mediana de DPS** | 37 | 3 | 1,6 | 4,2 |

## DPS por habilidad contra un objetivo neutro

Objetivo sin tipos y con 100 en todas las estadísticas: sirve para comparar la potencia bruta de cada habilidad sin que el matchup de tipos distorsione el resultado. STAB incluido.

| Pokémon | Básica | Habilidad 1 | Habilidad 2 | Definitiva | DPS sostenido |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pikachu | Placaje 53,2 | Ataque Rápido 3,3 | Rayo 5 | Impactrueno 20,5 | 81,9 |
| Voltorb | Chispa 35,8 | Rollout 2,9 | Onda Trueno — | Explosión 4,6 | 43,3 |
| Gengar | Lengüetazo 35 | Bola Sombra 11,2 | Bomba Lodo 7,4 | Come Sueños 7,8 | 61,4 |
| Bulbasaur | Placaje 49,2 | Paralizador — | Hoja Afilada 6,7 | Lluevehojas 4,4 | 60,3 |
| Charmander | Arañazo 41 | Giro Fuego 6,1 | Lanzallamas 7,1 | Anillo Ígneo 3,4 | 57,6 |
| Squirtle | Placaje 48,8 | Acua Jet 3,9 | Rayo Burbuja 10,2 | Hidrobomba 5,2 | 68,1 |
| Lucario | Garra Metal 73,6 | Velocidad Extrema 5,1 | Esfera Aura 10,4 | Combate Cercano 7,9 | 96,9 |
| Greninja | Shuriken de Agua 56,5 | Tajo Umbrío 37,1 | Sombra Vil 5,3 | Pulso Umbrío 7,5 | 106,4 |
| Articuno | Golpe Ala 66,9 | Rayo Hielo 9,3 | Viento Gélido 4,7 | Ventisca 4,8 | 85,7 |
| Moltres | Ataque Aéreo 78 | Tajo Aéreo 16,9 | Onda Ígnea 7 | Ataque Celeste 5,9 | 107,8 |
| Mewtwo | Telequinesis 102,2 | Teletransporte — | Psíquico 14,9 | Psicoataque 8,6 | 125,6 |
| Mew | Golpe Psíquico 115,7 | Agilidad — | Premonición 6,4 | Recuperación — | 122,1 |
| Scyther | Golpe Furia 92 | Corte Aéreo 7,7 | Danza Espada — | Tijera X 7,7 | 107,3 |
| Tyranitar | Triturar 86,5 | Avalancha 13,2 | Terremoto 7,4 | Roca Afilada 8 | 115,1 |
| Onix | Atadura 39,3 | Lanzarrocas 7,1 | Excavar 4,6 | Fisura 2,8 | 53,9 |
| Groudon | Cuchillada 66,4 | Terremoto 11,9 | Avalancha 9,7 | Filo del Abismo 8,3 | 96,4 |
| Celebi | Hoja Mágica 39,5 | Rayo Solar 6,7 | Deseo — | Futuro Siniestro 4,3 | 50,5 |
| Lugia | Onda Mental 39,5 | Marea 2,7 | Ciclón 1,8 | Aerochorro 4,5 | 48,6 |

**DPS sostenido** es la suma del DPS de las cuatro habilidades contra el objetivo neutro. Supone que se pueden encadenar sin solaparse; el bloqueo global de casteo hace que el valor real sea algo menor.

Atacantes con moveset asignado: **18** de 25 especies del roster.
