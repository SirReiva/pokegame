# Daño por segundo por Pokémon y habilidad

> Generado automáticamente por `node scripts/generate-damage-matrix.mjs` a partir de `abilities.ts`, `pokedex.ts`, `combat.ts`, `typeChart.ts` y el manifiesto de sprites. No editar a mano.

## Cómo leer las tablas

- **Agrupación**: una sección por Pokémon atacante y una fila por rival. Cada columna es uno de sus cuatro ataques.
- **Celda**: daño esperado por segundo (`daño de un lanzamiento / cooldown`). La efectividad de cada celda está en [`tabla-danos-por-ataque.md`](tabla-danos-por-ataque.md).
- **Cooldown**: es el valor de la definición de la habilidad y empieza al iniciar el lanzamiento. El DPS no descuenta el `startup`, el `active`, el `recovery` ni el tiempo de movimiento entre ataques, así que es una **cota superior**.
- **Daño esperado**: nivel 50, IV 31, EV 0, naturaleza neutra, sin buffs, random medio 0,925, crítico 1/24 (×1,5). STAB incluido.
- **Áreas**: se valoran con el rival en el centro (100 %). En el borde el daño radial baja hasta `radialMinDamage`.
- **Áreas `overTime`**: el daño de un lanzamiento suma todos los ticks (`ceil(duración / intervalo)`) con potencia por tick = `power × intervalo`. El `+2` de la fórmula se cobra una sola vez por objetivo y lanzamiento.
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

## Pikachu

Tipos: **Electric** · HP 110 · Atk 75 · Def 60 · SpA 70 · SpD 70 · Vel 110

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 · CD 0,25 s | Habilidad 1: Ataque Rápido<br>Normal · Fís · Pot 60 · CD 4 s | Habilidad 2: Impactrueno<br>Electric · Esp · Pot 70 · CD 0,9 s | Definitiva: Rayo<br>Electric · Esp · Pot 130 · CD 8 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 102,2 | 6,9 | 20,4 | 4,2 |
| Charmander | 110,3 | 7,7 | 48,8 | 10,3 |
| Squirtle | 85,7 | 5,9 | 81,8 | 17,1 |
| Gengar | 0 | 0 | 37,4 | 7,7 |
| Voltorb | 98,2 | 6,9 | 22,7 | 4,7 |
| Eevee | 98,2 | 6,9 | 40,9 | 8,5 |
| Lucario | 40,8 | 2,8 | 38,6 | 8 |
| Greninja | 81,7 | 5,6 | 77,1 | 16,1 |
| Mewtwo | 65,3 | 4,6 | 31,8 | 6,6 |
| Mew | 61,3 | 4,1 | 28,3 | 6,1 |
| Onix | 20,5 | 1,5 | 0 | 0 |
| Scyther | 73,5 | 4,8 | 70,3 | 14,6 |
| Gyarados | 73,5 | 5,1 | 113,3 | 24,5 |
| Tyranitar | 24,7 | 1,8 | 28,3 | 6,1 |
| Articuno | 61,3 | 4,1 | 47,8 | 9,9 |
| Zapdos | 69,3 | 4,6 | 31,8 | 6,6 |
| Moltres | 65,3 | 4,6 | 68,1 | 14 |
| Raikou | 77,5 | 5,1 | 13,6 | 3,1 |
| Entei | 69,3 | 4,6 | 37,4 | 7,7 |
| Suicune | 53,2 | 3,6 | 50 | 10,7 |
| Lugia | 49,2 | 3,3 | 40,9 | 8,7 |
| Ho-Oh | 65,3 | 4,6 | 40,9 | 8,7 |
| Celebi | 61,3 | 4,1 | 13,6 | 3,1 |
| Groudon | 48,8 | 3,1 | 0 | 0 |
| **Mediana de DPS** | 65,3 | 4,6 | 38 | 7,8 |

## Voltorb

Tipos: **Electric** · HP 115 · Atk 50 · Def 70 · SpA 75 · SpD 75 · Vel 120

| Rival | Básica: Chispa<br>Electric · Fís · Pot 80 · CD 0,6 s | Habilidad 1: Rollout<br>Normal · Fís · Pot 100 · CD 6 s | Habilidad 2: Onda Trueno<br>Electric · Estado · Pot — · CD 5 s | Definitiva: Explosión<br>Electric · Esp · Pot 200 · CD 18 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 30,6 | 5,1 | Estado | 3,1 |
| Charmander | 66,3 | 5,6 | Estado | 7,5 |
| Squirtle | 102,1 | 4,1 | Estado | 12,6 |
| Pikachu | 35,7 | 6 | Estado | 3,7 |
| Gengar | 56,1 | 0 | Estado | 5,5 |
| Eevee | 61,3 | 5,1 | Estado | 6,2 |
| Lucario | 47,6 | 2 | Estado | 5,8 |
| Greninja | 102,1 | 4,1 | Estado | 11,6 |
| Mewtwo | 40,8 | 3,4 | Estado | 4,8 |
| Mew | 35,8 | 3,1 | Estado | 4,4 |
| Onix | 0 | 1 | Estado | 0 |
| Scyther | 85 | 3,7 | Estado | 10,6 |
| Gyarados | 170 | 3,7 | Estado | 17,7 |
| Tyranitar | 32,4 | 1,4 | Estado | 4,4 |
| Articuno | 71,7 | 3,1 | Estado | 7,3 |
| Zapdos | 40,8 | 3,4 | Estado | 4,8 |
| Moltres | 81,7 | 3,4 | Estado | 10 |
| Raikou | 22,2 | 3,9 | Estado | 2,2 |
| Entei | 40,8 | 3,4 | Estado | 5,5 |
| Suicune | 64,9 | 2,7 | Estado | 7,8 |
| Lugia | 61 | 2,4 | Estado | 6,1 |
| Ho-Oh | 81,7 | 3,4 | Estado | 6,1 |
| Celebi | 17,1 | 3,1 | Estado | 2,2 |
| Groudon | 0 | 2,2 | Estado | 0 |
| **Mediana de DPS** | 51,9 | 3,4 | — | 5,7 |

## Gengar

Tipos: **Ghost / Poison** · HP 135 · Atk 85 · Def 80 · SpA 150 · SpD 95 · Vel 130

| Rival | Básica: Lengüetazo<br>Ghost · Fís · Pot 42 · CD 0,7 s | Habilidad 1: Bola Sombra<br>Ghost · Esp · Pot 62 · CD 6 s | Habilidad 2: Bomba Lodo<br>Poison · Esp · Pot 20/s · CD 9 s | Definitiva: Come Sueños<br>Ghost · Esp · Pot 80 · CD 11 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 48,1 | 11,7 | 5,4 | 8,2 |
| Charmander | 52,5 | 14 | 7,1 | 9,8 |
| Squirtle | 39,3 | 11,7 | 5,4 | 8,2 |
| Pikachu | 54 | 14 | 7,1 | 9,8 |
| Voltorb | 48,1 | 12,9 | 6 | 9,2 |
| Eevee | 0 | 0 | 5,4 | 0 |
| Lucario | 36,4 | 10,9 | 0 | 7,6 |
| Greninja | 19 | 5,3 | 5,4 | 3,8 |
| Mewtwo | 61,4 | 18,3 | 4,3 | 12,8 |
| Mew | 55,6 | 16,7 | 3,7 | 11,7 |
| Onix | 18,9 | 15 | 1,8 | 10,6 |
| Scyther | 32,1 | 9,7 | 4,3 | 6,8 |
| Gyarados | 32,1 | 8,3 | 3,7 | 5,8 |
| Tyranitar | 13,2 | 4,1 | 1,8 | 2,9 |
| Articuno | 27,8 | 6,8 | 2,6 | 4,8 |
| Zapdos | 30,7 | 9,2 | 4,3 | 6,4 |
| Moltres | 30,7 | 9,4 | 4,3 | 6,7 |
| Raikou | 35 | 8,3 | 3,7 | 5,8 |
| Entei | 30,7 | 10,4 | 4,3 | 7,2 |
| Suicune | 26,1 | 7,3 | 2,6 | 5,1 |
| Lugia | 46,7 | 11,6 | 2 | 8 |
| Ho-Oh | 30,7 | 5,8 | 2 | 4 |
| Celebi | 55,6 | 16,7 | 7,5 | 11,7 |
| Groudon | 21,8 | 9,2 | 2 | 6,4 |
| **Mediana de DPS** | 32,1 | 10 | 4,3 | 7 |

## Bulbasaur

Tipos: **Grass / Poison** · HP 120 · Atk 69 · Def 69 · SpA 85 · SpD 85 · Vel 65

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 · CD 0,25 s | Habilidad 1: Paralizador<br>Grass · Estado · Pot — · CD 7 s | Habilidad 2: Hoja Afilada<br>Grass · Esp · Pot 100 · CD 5 s | Definitiva: Lluevehojas<br>Grass · Esp · Pot 160 · CD 14 s |
| --- | ---: | ---: | ---: | ---: |
| Charmander | 102,2 | Estado | 7,6 | 4,4 |
| Squirtle | 77,5 | Estado | 25,7 | 14,6 |
| Pikachu | 106,2 | Estado | 15,3 | 8,8 |
| Gengar | 0 | Estado | 5,5 | 3,2 |
| Voltorb | 93,8 | Estado | 14,3 | 8,1 |
| Eevee | 93,8 | Estado | 12,9 | 7,2 |
| Lucario | 36,7 | Estado | 5,9 | 3,4 |
| Greninja | 77,5 | Estado | 23,7 | 13,3 |
| Mewtwo | 61,3 | Estado | 10 | 5,5 |
| Mew | 53,2 | Estado | 9,2 | 5,1 |
| Onix | 20,3 | Estado | 66,1 | 37,6 |
| Scyther | 65,3 | Estado | 2,7 | 1,5 |
| Gyarados | 65,3 | Estado | 9,2 | 5,1 |
| Tyranitar | 24,5 | Estado | 18,4 | 10,2 |
| Articuno | 53,2 | Estado | 3,7 | 2,1 |
| Zapdos | 61,3 | Estado | 4,9 | 2,8 |
| Moltres | 61,3 | Estado | 2,5 | 1,4 |
| Raikou | 69,3 | Estado | 9,2 | 5,1 |
| Entei | 61,3 | Estado | 5,5 | 3,2 |
| Suicune | 49,2 | Estado | 15,9 | 9,2 |
| Lugia | 48,8 | Estado | 3,1 | 1,8 |
| Ho-Oh | 61,3 | Estado | 1,4 | 0,9 |
| Celebi | 53,2 | Estado | 4,5 | 2,6 |
| Groudon | 44,8 | Estado | 20 | 11,1 |
| **Mediana de DPS** | 61,3 | — | 9,2 | 5,1 |

## Charmander

Tipos: **Fire** · HP 114 · Atk 72 · Def 63 · SpA 80 · SpD 70 · Vel 85

| Rival | Básica: Arañazo<br>Normal · Fís · Pot 55 · CD 0,3 s | Habilidad 1: Giro Fuego<br>Fire · Esp · Pot 40/s · CD 6 s | Habilidad 2: Lanzallamas<br>Fire · Esp · Pot 100 · CD 6,5 s | Definitiva: Anillo Ígneo<br>Fire · Esp · Pot 130 · CD 14 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 81,8 | 15,4 | 18,2 | 10,9 |
| Squirtle | 68,1 | 3,5 | 4,6 | 2,8 |
| Pikachu | 95,3 | 10,8 | 11,3 | 6,6 |
| Gengar | 0 | 6,6 | 8,5 | 5 |
| Voltorb | 81,7 | 9,7 | 10,4 | 6,3 |
| Eevee | 81,7 | 7,7 | 9,1 | 5,5 |
| Lucario | 30,7 | 15,4 | 17,3 | 10,5 |
| Greninja | 68,1 | 3,5 | 4,2 | 2,6 |
| Mewtwo | 51,1 | 6,6 | 7,2 | 4,2 |
| Mew | 47,8 | 4,6 | 6,6 | 4 |
| Onix | 16,9 | 5,3 | 6 | 3,6 |
| Scyther | 57,8 | 13,3 | 16 | 9,3 |
| Gyarados | 57,8 | 2,2 | 3,3 | 2 |
| Tyranitar | 20,6 | 2,2 | 3,3 | 2 |
| Articuno | 47,8 | 7,1 | 11,3 | 6,6 |
| Zapdos | 54,4 | 6,6 | 7,2 | 4,2 |
| Moltres | 51,1 | 3,2 | 3,8 | 2,2 |
| Raikou | 61,3 | 4,6 | 6,6 | 4 |
| Entei | 54,4 | 3,2 | 4,2 | 2,5 |
| Suicune | 41 | 2,2 | 2,8 | 1,8 |
| Lugia | 40,7 | 3,6 | 4,7 | 2,7 |
| Ho-Oh | 51,1 | 1,4 | 2,4 | 1,3 |
| Celebi | 47,8 | 9,3 | 13,2 | 8 |
| Groudon | 37,4 | 6,6 | 7,2 | 4,2 |
| **Mediana de DPS** | 51,1 | 6 | 6,9 | 4,1 |

## Squirtle

Tipos: **Water** · HP 119 · Atk 68 · Def 85 · SpA 70 · SpD 84 · Vel 63

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 · CD 0,25 s | Habilidad 1: Acua Jet<br>Water · Fís · Pot 65 · CD 5 s | Habilidad 2: Rayo Burbuja<br>Water · Esp · Pot 80 · CD 3 s | Definitiva: Hidrobomba<br>Water · Esp · Pot 140 · CD 9 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 93,8 | 4,1 | 6,8 | 4,1 |
| Charmander | 102,2 | 17,6 | 34,7 | 19,7 |
| Pikachu | 106,2 | 9,4 | 17,3 | 9,9 |
| Gengar | 0 | 7,4 | 12,3 | 7,3 |
| Voltorb | 93,8 | 8 | 15,7 | 9,2 |
| Eevee | 93,8 | 8 | 13,6 | 8,2 |
| Lucario | 36,7 | 6,3 | 13,3 | 7,6 |
| Greninja | 73,5 | 3,3 | 6,5 | 3,7 |
| Mewtwo | 57,3 | 5,1 | 11,2 | 6,2 |
| Mew | 53,2 | 4,9 | 10,2 | 5,8 |
| Onix | 20,3 | 13,1 | 73,4 | 42,2 |
| Scyther | 65,3 | 5,7 | 12,3 | 6,9 |
| Gyarados | 65,3 | 2,9 | 5,1 | 2,8 |
| Tyranitar | 24,5 | 8,6 | 20,4 | 11,6 |
| Articuno | 53,2 | 4,9 | 8,2 | 4,8 |
| Zapdos | 61,3 | 5,5 | 11,2 | 6,2 |
| Moltres | 57,3 | 10,2 | 23,1 | 13,2 |
| Raikou | 69,3 | 6,1 | 10,2 | 5,8 |
| Entei | 61,3 | 11 | 24,5 | 14,5 |
| Suicune | 49,2 | 2,1 | 4,4 | 2,5 |
| Lugia | 44,8 | 3,7 | 7,2 | 4,1 |
| Ho-Oh | 57,3 | 10,2 | 14,3 | 8,2 |
| Celebi | 53,2 | 2,5 | 5,1 | 2,8 |
| Groudon | 44,8 | 7,4 | 22,4 | 12,5 |
| **Mediana de DPS** | 57,3 | 6,2 | 12,3 | 7,1 |

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

| Rival | Básica: Shuriken de Agua<br>Water · Esp · Pot 42 · CD 0,65 s | Habilidad 1: Tajo Umbrío<br>Dark · Fís · Pot 65 · CD 1,4 s | Habilidad 2: Sombra Vil<br>Dark · Fís · Pot 50 · CD 7 s | Definitiva: Pulso Umbrío<br>Dark · Esp · Pot 85 · CD 10 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 28,3 | 48,8 | 7,6 | 7,8 |
| Charmander | 144,6 | 53,3 | 8,3 | 9,3 |
| Squirtle | 29,9 | 40,1 | 6,1 | 7,8 |
| Pikachu | 72,3 | 55,4 | 8,8 | 9,3 |
| Gengar | 53,4 | 84,6 | 13,1 | 14,1 |
| Voltorb | 67,6 | 48,1 | 7,6 | 8,9 |
| Eevee | 58,2 | 48,1 | 7,6 | 7,8 |
| Lucario | 56,6 | 19 | 2,9 | 3,7 |
| Mewtwo | 47,1 | 61,3 | 9,9 | 11,9 |
| Mew | 42,4 | 56,8 | 9 | 11,2 |
| Onix | 307,7 | 19,7 | 3,1 | 10,1 |
| Scyther | 51,8 | 33,6 | 5,3 | 6,7 |
| Gyarados | 20,4 | 35 | 5,3 | 5,6 |
| Tyranitar | 84,7 | 13,1 | 2 | 2,8 |
| Articuno | 34,6 | 28,4 | 4,5 | 4,6 |
| Zapdos | 47,1 | 32,8 | 5,3 | 5,9 |
| Moltres | 97,3 | 30,6 | 5 | 6,2 |
| Raikou | 42,4 | 35,7 | 5,4 | 5,6 |
| Entei | 106,8 | 32,8 | 5,3 | 7 |
| Suicune | 18,8 | 26,3 | 3,9 | 5 |
| Lugia | 29,9 | 45,2 | 7 | 7,6 |
| Ho-Oh | 59,9 | 30,6 | 5 | 3,8 |
| Celebi | 20,4 | 56,8 | 9 | 11,2 |
| Groudon | 94,2 | 21,9 | 3,2 | 5,9 |
| **Mediana de DPS** | 52,6 | 35,4 | 5,3 | 7,3 |

## Articuno

Tipos: **Ice / Flying** · HP 165 · Atk 105 · Def 120 · SpA 115 · SpD 145 · Vel 105

| Rival | Básica: Golpe Ala<br>Flying · Fís · Pot 55 · CD 0,55 s | Habilidad 1: Rayo Hielo<br>Ice · Esp · Pot 90 · CD 7 s | Habilidad 2: Viento Gélido<br>Ice · Esp · Pot 55 · CD 8 s | Definitiva: Ventisca<br>Ice · Esp · Pot 100 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 193 | 21,9 | 11,8 | 11,4 |
| Charmander | 105,9 | 6,6 | 3,5 | 3,5 |
| Squirtle | 78 | 5,5 | 3,1 | 2,9 |
| Pikachu | 55,7 | 13,3 | 7 | 6,9 |
| Gengar | 83,5 | 9,8 | 5,4 | 5,1 |
| Voltorb | 48,3 | 12,4 | 6,9 | 6,4 |
| Eevee | 96,5 | 10,9 | 5,9 | 5,7 |
| Lucario | 74,3 | 5,3 | 2,7 | 2,7 |
| Greninja | 78 | 5,3 | 2,7 | 2,7 |
| Mewtwo | 63,1 | 8,5 | 4,6 | 4,5 |
| Mew | 57,5 | 7,9 | 4,3 | 4,1 |
| Onix | 18,6 | 28,9 | 15,3 | 14,8 |
| Scyther | 133,8 | 18,7 | 9,9 | 9,8 |
| Gyarados | 66,9 | 7,9 | 4,3 | 4,1 |
| Tyranitar | 26 | 7,9 | 4,3 | 4,1 |
| Zapdos | 33,4 | 16,9 | 9,2 | 9 |
| Moltres | 63,1 | 8,9 | 4,7 | 4,7 |
| Raikou | 33,5 | 7,9 | 4,3 | 4,1 |
| Entei | 66,8 | 4,8 | 2,7 | 2,5 |
| Suicune | 50,1 | 3,5 | 1,9 | 1,8 |
| Lugia | 44,5 | 10,8 | 5,6 | 5,7 |
| Ho-Oh | 63,1 | 5,4 | 2,8 | 2,9 |
| Celebi | 115 | 15,7 | 8,7 | 8,2 |
| Groudon | 40,9 | 16,9 | 9,2 | 9 |
| **Mediana de DPS** | 63,1 | 8,7 | 4,7 | 4,6 |

## Zapdos

Tipos: **Electric / Flying** · HP 165 · Atk 110 · Def 105 · SpA 145 · SpD 110 · Vel 120

| Rival | Básica: Pico Taladro<br>Flying · Fís · Pot 60 · CD 0,6 s | Habilidad 1: Onda Trueno<br>Electric · Estado · Pot — · CD 5 s | Habilidad 2: Descarga<br>Electric · Esp · Pot 75 · CD 8 s | Definitiva: Trueno<br>Electric · Esp · Pot 145 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 204,3 | Estado | 5 | 5,1 |
| Charmander | 112,3 | Estado | 12,3 | 12,5 |
| Squirtle | 83,3 | Estado | 20,2 | 21 |
| Pikachu | 57,8 | Estado | 6,1 | 6,3 |
| Gengar | 88,5 | Estado | 9,2 | 9,3 |
| Voltorb | 49,4 | Estado | 5,7 | 5,9 |
| Eevee | 98,8 | Estado | 10,1 | 10,3 |
| Lucario | 78,3 | Estado | 9,6 | 9,8 |
| Greninja | 81,7 | Estado | 18,6 | 19,3 |
| Mewtwo | 63,1 | Estado | 7,8 | 8 |
| Mew | 61,3 | Estado | 7 | 7,4 |
| Onix | 20,4 | Estado | 0 | 0 |
| Scyther | 142,9 | Estado | 17,1 | 17,6 |
| Gyarados | 71,5 | Estado | 28,1 | 29,7 |
| Tyranitar | 27,2 | Estado | 7 | 7,4 |
| Articuno | 61,3 | Estado | 12,3 | 12,2 |
| Moltres | 63,1 | Estado | 16,3 | 16,9 |
| Raikou | 35,8 | Estado | 3,5 | 3,7 |
| Entei | 66,3 | Estado | 9,2 | 9,3 |
| Suicune | 52,7 | Estado | 13 | 13,1 |
| Lugia | 47,6 | Estado | 9,9 | 10,2 |
| Ho-Oh | 63,1 | Estado | 9,9 | 10,2 |
| Celebi | 122,5 | Estado | 3,5 | 3,7 |
| Groudon | 45,9 | Estado | 0 | 0 |
| **Mediana de DPS** | 63,1 | — | 9,4 | 9,5 |

## Moltres

Tipos: **Fire / Flying** · HP 165 · Atk 120 · Def 110 · SpA 145 · SpD 105 · Vel 110

| Rival | Básica: Ataque Aéreo<br>Flying · Fís · Pot 55 · CD 0,55 s | Habilidad 1: Tajo Aéreo<br>Flying · Esp · Pot 65 · CD 3,5 s | Habilidad 2: Onda Ígnea<br>Fire · Esp · Pot 60 · CD 8 s | Definitiva: Ataque Celeste<br>Flying · Fís · Pot 115 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 222,9 | 40,2 | 16,3 | 16,9 |
| Charmander | 122,5 | 24,5 | 4,8 | 9,2 |
| Squirtle | 90,9 | 20,4 | 4,1 | 6,8 |
| Pikachu | 63,1 | 12,3 | 9,7 | 4,8 |
| Gengar | 96,5 | 17,8 | 7,3 | 7,2 |
| Voltorb | 53,9 | 11,4 | 9,3 | 4,1 |
| Eevee | 107,7 | 20,1 | 8,2 | 8,2 |
| Lucario | 85,5 | 19,3 | 15,3 | 6,4 |
| Greninja | 89,1 | 18,7 | 3,8 | 6,6 |
| Mewtwo | 68,8 | 15,7 | 6,3 | 5,3 |
| Mew | 66,8 | 14,3 | 5,7 | 4,9 |
| Onix | 22,3 | 13,1 | 5,2 | 1,6 |
| Scyther | 155,9 | 33,9 | 14 | 11,6 |
| Gyarados | 78 | 14,3 | 2,8 | 5,9 |
| Tyranitar | 29,7 | 7 | 2,8 | 2,2 |
| Articuno | 66,8 | 11,7 | 9,5 | 4,9 |
| Zapdos | 35,3 | 7,9 | 6,3 | 2,7 |
| Raikou | 39,1 | 7 | 5,7 | 3,1 |
| Entei | 72,3 | 17,8 | 3,6 | 5,5 |
| Suicune | 57,5 | 12,6 | 2,6 | 4,3 |
| Lugia | 52 | 9,9 | 4,2 | 3,9 |
| Ho-Oh | 68,8 | 9,9 | 2 | 5,3 |
| Celebi | 133,6 | 28,6 | 11,5 | 9,8 |
| Groudon | 50,1 | 15,7 | 6,3 | 3,7 |
| **Mediana de DPS** | 68,8 | 15 | 6 | 5,3 |

## Mewtwo

Tipos: **Psychic** · HP 181 · Atk 130 · Def 110 · SpA 174 · SpD 110 · Vel 150

| Rival | Básica: Telequinesis<br>Psychic · Esp · Pot 45 · CD 0,6 s | Habilidad 1: Teletransporte<br>Psychic · Estado · Pot — · CD 6 s | Habilidad 2: Psíquico<br>Psychic · Esp · Pot 80 · CD 7 s | Definitiva: Psicoataque<br>Psychic · Esp · Pot 100 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 194,2 | Estado | 29,8 | 17,3 |
| Charmander | 119,1 | Estado | 17,9 | 10,4 |
| Squirtle | 98,8 | Estado | 14,9 | 8,8 |
| Pikachu | 119,1 | Estado | 17,9 | 10,4 |
| Gengar | 176,9 | Estado | 26,5 | 15,3 |
| Voltorb | 108,9 | Estado | 16,6 | 9,8 |
| Eevee | 97,1 | Estado | 14,9 | 8,6 |
| Lucario | 93,5 | Estado | 14 | 8,2 |
| Greninja | 0 | Estado | 0 | 0 |
| Mew | 34 | Estado | 5,3 | 3,1 |
| Onix | 127,6 | Estado | 19,3 | 11,2 |
| Scyther | 83,3 | Estado | 12,7 | 7,4 |
| Gyarados | 68,1 | Estado | 10,6 | 6,1 |
| Tyranitar | 0 | Estado | 0 | 0 |
| Articuno | 57,8 | Estado | 8,8 | 5 |
| Zapdos | 76,5 | Estado | 11,4 | 6,6 |
| Moltres | 78,3 | Estado | 12 | 6,9 |
| Raikou | 68,1 | Estado | 10,6 | 6,1 |
| Entei | 88,5 | Estado | 13,3 | 7,6 |
| Suicune | 61,3 | Estado | 9,3 | 5,4 |
| Lugia | 23,8 | Estado | 3,6 | 2,1 |
| Ho-Oh | 47,6 | Estado | 7,4 | 4,3 |
| Celebi | 34 | Estado | 5,3 | 3,1 |
| Groudon | 76,5 | Estado | 11,4 | 6,6 |
| **Mediana de DPS** | 77,4 | — | 11,7 | 6,8 |

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

| Rival | Básica: Triturar<br>Dark · Fís · Pot 50 · CD 0,85 s | Habilidad 1: Avalancha<br>Rock · Fís · Pot 55 · CD 5 s | Habilidad 2: Terremoto<br>Ground · Fís · Pot 18/s · CD 9 s | Definitiva: Roca Afilada<br>Rock · Fís · Pot 90 · CD 12 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 84,1 | 7,8 | 4,2 | 5,3 |
| Charmander | 90 | 34,3 | 9,5 | 23 |
| Squirtle | 66,1 | 12,5 | 3,6 | 8,5 |
| Pikachu | 95 | 18 | 10,6 | 12,1 |
| Gengar | 144,2 | 6,7 | 7,3 | 4,6 |
| Voltorb | 82,8 | 15,3 | 8,4 | 10,5 |
| Eevee | 82,8 | 15,3 | 4,2 | 10,5 |
| Lucario | 32,4 | 2,9 | 6,1 | 2 |
| Greninja | 32,5 | 12,3 | 3,6 | 8,4 |
| Mewtwo | 103,4 | 9,8 | 2,5 | 6,6 |
| Mew | 96,2 | 9,2 | 2,5 | 6,1 |
| Onix | 32,4 | 3,1 | 2,7 | 2 |
| Scyther | 57,6 | 44 | 0 | 28,9 |
| Gyarados | 58,8 | 22 | 0 | 14,8 |
| Articuno | 48,1 | 36,7 | 0 | 24,5 |
| Zapdos | 55,3 | 20,8 | 0 | 14 |
| Moltres | 51,7 | 39,2 | 0 | 26,5 |
| Raikou | 61,2 | 11,2 | 6,1 | 7,7 |
| Entei | 55,3 | 20,8 | 5 | 14 |
| Suicune | 43,3 | 8 | 1,9 | 5,4 |
| Lugia | 79,2 | 14,7 | 0 | 9,7 |
| Ho-Oh | 51,7 | 39,2 | 0 | 26,5 |
| Celebi | 96,2 | 9,2 | 1,2 | 6,1 |
| Groudon | 37,2 | 3,5 | 1,4 | 2,3 |
| **Mediana de DPS** | 60 | 13,6 | 2,6 | 9,1 |

## Onix

Tipos: **Rock / Ground** · HP 110 · Atk 65 · Def 180 · SpA 50 · SpD 65 · Vel 90

| Rival | Básica: Atadura<br>Rock · Fís · Pot 65 · CD 0,7 s | Habilidad 1: Lanzarrocas<br>Rock · Fís · Pot 85 · CD 4,5 s | Habilidad 2: Excavar<br>Ground · Fís · Pot 85 · CD 6 s | Definitiva: Fisura<br>Ground · Fís · Pot 155 · CD 14 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 26,3 | 5,7 | 8,7 | 6,6 |
| Charmander | 122,5 | 24,9 | 18,7 | 14,4 |
| Squirtle | 45,2 | 9,1 | 6,8 | 5,3 |
| Pikachu | 62,8 | 12,9 | 19,4 | 15 |
| Gengar | 24,8 | 4,8 | 14,7 | 11,4 |
| Voltorb | 54 | 11,1 | 16,7 | 13,1 |
| Eevee | 54 | 11,1 | 8,3 | 6,6 |
| Lucario | 10,2 | 2 | 13,3 | 10,2 |
| Greninja | 45,2 | 8,8 | 6,6 | 5,3 |
| Mewtwo | 35 | 7,5 | 5,6 | 4,2 |
| Mew | 32,1 | 6,8 | 5,1 | 3,8 |
| Scyther | 157,4 | 32,7 | 0 | 0 |
| Gyarados | 78,7 | 16,3 | 0 | 0 |
| Tyranitar | 30,7 | 6,1 | 9,2 | 7,1 |
| Articuno | 128,6 | 27,2 | 0 | 0 |
| Zapdos | 72,9 | 15,4 | 0 | 0 |
| Moltres | 140 | 29,9 | 0 | 0 |
| Raikou | 40,8 | 8,2 | 12,3 | 9,6 |
| Entei | 72,9 | 15,4 | 11,6 | 8,8 |
| Suicune | 27,8 | 6,1 | 4,6 | 3,4 |
| Lugia | 52,6 | 10,9 | 0 | 0 |
| Ho-Oh | 140 | 29,9 | 0 | 0 |
| Celebi | 32,1 | 6,8 | 2,5 | 1,9 |
| Groudon | 13 | 2,5 | 3,8 | 2,8 |
| **Mediana de DPS** | 48,9 | 10 | 6,1 | 4,7 |

## Groudon

Tipos: **Ground** · HP 175 · Atk 170 · Def 160 · SpA 120 · SpD 110 · Vel 110

| Rival | Básica: Cuchillada<br>Normal · Fís · Pot 45 · CD 0,6 s | Habilidad 1: Terremoto<br>Ground · Fís · Pot 18/s · CD 9 s | Habilidad 2: Avalancha<br>Rock · Fís · Pot 55 · CD 5 s | Definitiva: Filo del Abismo<br>Ground · Fís · Pot 100 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 78,3 | 7,1 | 5,7 | 10,3 |
| Charmander | 85,1 | 15,4 | 24,9 | 22,6 |
| Squirtle | 63 | 5,4 | 9,4 | 8,4 |
| Pikachu | 90,2 | 17,6 | 13,1 | 23,7 |
| Gengar | 0 | 12,1 | 4,9 | 17,7 |
| Voltorb | 78,3 | 14,3 | 11,2 | 20,2 |
| Eevee | 78,3 | 7,1 | 11,2 | 10,1 |
| Lucario | 30,6 | 10,9 | 2,1 | 15,9 |
| Greninja | 62,9 | 5,4 | 9,2 | 8,2 |
| Mewtwo | 49,4 | 4,3 | 7,3 | 6,5 |
| Mew | 46 | 3,7 | 6,7 | 6 |
| Onix | 15,3 | 4,1 | 2,2 | 7,9 |
| Scyther | 54,4 | 0 | 31,9 | 0 |
| Gyarados | 56,1 | 0 | 15,9 | 0 |
| Tyranitar | 20,4 | 7,5 | 6,1 | 11 |
| Articuno | 46 | 0 | 26,9 | 0 |
| Zapdos | 52,8 | 0 | 15,1 | 0 |
| Moltres | 49,4 | 0 | 29,4 | 0 |
| Raikou | 57,8 | 10,9 | 8,4 | 15,1 |
| Entei | 52,8 | 8,7 | 15,1 | 13,6 |
| Suicune | 40,8 | 2,6 | 5,9 | 5,3 |
| Lugia | 37,4 | 0 | 10,6 | 0 |
| Ho-Oh | 49,4 | 0 | 29,4 | 0 |
| Celebi | 46 | 1,8 | 6,7 | 3 |
| **Mediana de DPS** | 51,1 | 4,9 | 10 | 8 |

## Celebi

Tipos: **Psychic / Grass** · HP 175 · Atk 120 · Def 120 · SpA 120 · SpD 120 · Vel 120

| Rival | Básica: Hoja Mágica<br>Grass · Esp · Pot 45 · CD 0,8 s | Habilidad 1: Rayo Solar<br>Grass · Esp · Pot 85 · CD 8 s | Habilidad 2: Deseo<br>Psychic · Estado · Pot — · CD 13 s | Definitiva: Futuro Siniestro<br>Psychic · Esp · Pot 105 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 11,5 | 2,3 | Estado | 12,4 |
| Charmander | 30,6 | 5,7 | Estado | 7,6 |
| Squirtle | 102,2 | 19,1 | Estado | 6,3 |
| Pikachu | 61,3 | 11,6 | Estado | 7,6 |
| Gengar | 23 | 4,2 | Estado | 11,2 |
| Voltorb | 57,4 | 10,7 | Estado | 7 |
| Eevee | 49,7 | 9,3 | Estado | 6,2 |
| Lucario | 23 | 4,5 | Estado | 5,9 |
| Greninja | 94,6 | 17,9 | Estado | 0 |
| Mewtwo | 39,5 | 7,3 | Estado | 2,5 |
| Mew | 35,7 | 6,9 | Estado | 2,2 |
| Onix | 265,4 | 49,5 | Estado | 8,2 |
| Scyther | 10,2 | 1,9 | Estado | 5,3 |
| Gyarados | 35,7 | 6,9 | Estado | 4,5 |
| Tyranitar | 71,5 | 13,8 | Estado | 0 |
| Articuno | 15,3 | 2,7 | Estado | 3,7 |
| Zapdos | 19,2 | 3,6 | Estado | 4,9 |
| Moltres | 10,2 | 1,9 | Estado | 5 |
| Raikou | 35,7 | 6,9 | Estado | 4,5 |
| Entei | 23 | 4,2 | Estado | 5,6 |
| Suicune | 63,8 | 12,3 | Estado | 4 |
| Lugia | 11,6 | 2,3 | Estado | 1,5 |
| Ho-Oh | 5,2 | 1,1 | Estado | 3,1 |
| Groudon | 79,1 | 14,6 | Estado | 4,9 |
| **Mediana de DPS** | 35,7 | 6,9 | — | 4,9 |

## Lugia

Tipos: **Psychic / Flying** · HP 181 · Atk 110 · Def 150 · SpA 110 · SpD 174 · Vel 130

| Rival | Básica: Onda Mental<br>Psychic · Esp · Pot 50 · CD 0,8 s | Habilidad 1: Marea<br>Water · Esp · Pot 30/s · CD 9 s | Habilidad 2: Ciclón<br>Flying · Esp · Pot 45/s · CD 4 s | Definitiva: Aerochorro<br>Flying · Esp · Pot 120 · CD 16 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 102,2 | 1,8 | 41,9 | 12,3 |
| Charmander | 62,5 | 10,6 | 25,1 | 7,3 |
| Squirtle | 51,1 | 1,8 | 20,9 | 6,2 |
| Pikachu | 62,5 | 5,3 | 12,1 | 3,6 |
| Gengar | 92 | 3,6 | 19,8 | 5,5 |
| Voltorb | 58,8 | 4,8 | 11,8 | 3,4 |
| Eevee | 51,1 | 4,2 | 20,9 | 6,1 |
| Lucario | 47,3 | 4,2 | 20,9 | 5,8 |
| Greninja | 0 | 1,8 | 19,8 | 5,7 |
| Mewtwo | 20,4 | 3,1 | 16,1 | 4,7 |
| Mew | 19,1 | 3,1 | 16,1 | 4,4 |
| Onix | 68,8 | 23,5 | 13,3 | 4 |
| Scyther | 45,9 | 3,6 | 34,7 | 10,5 |
| Gyarados | 38,3 | 1,3 | 16,1 | 4,4 |
| Tyranitar | 0 | 6,1 | 7,9 | 2,2 |
| Articuno | 30,6 | 2,5 | 12,2 | 3,6 |
| Zapdos | 42,1 | 3,1 | 7,9 | 2,3 |
| Moltres | 43,4 | 6,1 | 17,3 | 5 |
| Raikou | 38,3 | 3,1 | 7,9 | 2,2 |
| Entei | 46 | 7,3 | 19,8 | 5,5 |
| Suicune | 31,9 | 1,2 | 13,6 | 3,9 |
| Ho-Oh | 24,3 | 3,9 | 9,8 | 3,1 |
| Celebi | 19,1 | 1,3 | 32,1 | 8,8 |
| Groudon | 42,1 | 6,1 | 16,1 | 4,7 |
| **Mediana de DPS** | 42,7 | 3,6 | 16,1 | 4,7 |

## Ho-Oh

Tipos: **Fire / Flying** · HP 181 · Atk 150 · Def 110 · SpA 130 · SpD 174 · Vel 110

| Rival | Básica: Golpe Ala<br>Flying · Fís · Pot 55 · CD 0,55 s | Habilidad 1: Pájaro Osado<br>Flying · Fís · Pot 100 · CD 6 s | Habilidad 2: Recuperación<br>Fire · Estado · Pot — · CD 13 s | Definitiva: Fuego Sagrado<br>Fire · Fís · Pot 50/s · CD 3 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 271,2 | 45,3 | Estado | 65,3 |
| Charmander | 150,3 | 25 | Estado | 18,4 |
| Squirtle | 111,4 | 18,5 | Estado | 12,9 |
| Pikachu | 78 | 13,1 | Estado | 37,8 |
| Gengar | 118,8 | 19,6 | Estado | 28,6 |
| Voltorb | 66,8 | 11,2 | Estado | 32,7 |
| Eevee | 135,5 | 22,5 | Estado | 32,7 |
| Lucario | 105,9 | 17,5 | Estado | 51 |
| Greninja | 107,7 | 18 | Estado | 12,6 |
| Mewtwo | 89,1 | 14,5 | Estado | 20,5 |
| Mew | 79,9 | 13,3 | Estado | 18,7 |
| Onix | 27,8 | 4,4 | Estado | 6,5 |
| Scyther | 193 | 31,7 | Estado | 45 |
| Gyarados | 96,5 | 15,8 | Estado | 10,9 |
| Tyranitar | 35,3 | 6,1 | Estado | 8,5 |
| Articuno | 79,9 | 13,3 | Estado | 37,4 |
| Zapdos | 44,5 | 7,5 | Estado | 20,5 |
| Moltres | 89,1 | 14,5 | Estado | 9,9 |
| Raikou | 50,2 | 8,2 | Estado | 23,5 |
| Entei | 90,9 | 15 | Estado | 9,9 |
| Suicune | 68,8 | 11,7 | Estado | 8,5 |
| Lugia | 66,8 | 10,7 | Estado | 16,3 |
| Celebi | 159,8 | 26,5 | Estado | 37,4 |
| Groudon | 61,2 | 9,9 | Estado | 14,3 |
| **Mediana de DPS** | 89,1 | 14,5 | — | 19,6 |

## Gyarados

Tipos: **Water / Flying** · HP 170 · Atk 145 · Def 99 · SpA 80 · SpD 120 · Vel 101

| Rival | Básica: Acua Cola<br>Water · Fís · Pot 55 · CD 0,7 s | Habilidad 1: Cascada<br>Water · Fís · Pot 70 · CD 5,5 s | Habilidad 2: Triturar<br>Dark · Fís · Pot 85 · CD 6 s | Definitiva: Dragoaliento<br>Dragon · Fís · Pot 150 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 52,5 | 8,4 | 12,6 | 8,8 |
| Charmander | 227,5 | 36,7 | 13,8 | 9,6 |
| Squirtle | 42,3 | 6,7 | 10,2 | 7,1 |
| Pikachu | 119,6 | 19,5 | 14,5 | 10,1 |
| Gengar | 88,9 | 14,5 | 21,4 | 7,6 |
| Voltorb | 105 | 16,7 | 12,4 | 8,6 |
| Eevee | 105 | 16,7 | 12,4 | 8,6 |
| Lucario | 80,2 | 13 | 4,8 | 3,3 |
| Greninja | 40,9 | 6,7 | 4,9 | 7 |
| Mewtwo | 65,6 | 10,6 | 16 | 5,6 |
| Mew | 61,3 | 10 | 14,6 | 5 |
| Onix | 163,3 | 26,7 | 4,9 | 3,4 |
| Scyther | 74,3 | 11,7 | 8,7 | 6,1 |
| Tyranitar | 108,1 | 18,2 | 3,2 | 4,7 |
| Articuno | 61,3 | 10 | 7,3 | 5 |
| Zapdos | 70 | 11,1 | 8,3 | 5,9 |
| Moltres | 131,2 | 21,2 | 8 | 5,6 |
| Raikou | 75,8 | 12,4 | 9,2 | 6,4 |
| Entei | 140 | 22,3 | 8,3 | 5,9 |
| Suicune | 26,3 | 4,5 | 6,5 | 4,5 |
| Lugia | 49,6 | 7,8 | 11,9 | 4,1 |
| Ho-Oh | 131,2 | 21,2 | 8 | 5,6 |
| Celebi | 30,6 | 5 | 14,6 | 5 |
| Groudon | 90,4 | 14,5 | 5,4 | 3,8 |
| **Mediana de DPS** | 78 | 12,7 | 8,9 | 5,7 |

## DPS por habilidad contra un objetivo neutro

Objetivo sin tipos y con 100 en todas las estadísticas: sirve para comparar la potencia bruta de cada habilidad sin que el matchup de tipos distorsione el resultado. STAB incluido.

| Pokémon | Básica | Habilidad 1 | Habilidad 2 | Definitiva | DPS sostenido |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pikachu | Placaje 73,5 | Ataque Rápido 4,8 | Impactrueno 35,1 | Rayo 7,3 | 120,8 |
| Voltorb | Chispa 42,5 | Rollout 3,7 | Onda Trueno — | Explosión 5,3 | 51,5 |
| Gengar | Lengüetazo 32,1 | Bola Sombra 9,7 | Bomba Lodo 4,3 | Come Sueños 6,8 | 53 |
| Bulbasaur | Placaje 65,3 | Paralizador — | Hoja Afilada 11 | Lluevehojas 6,1 | 82,5 |
| Charmander | Arañazo 57,8 | Giro Fuego 6,6 | Lanzallamas 8 | Anillo Ígneo 4,7 | 77,1 |
| Squirtle | Placaje 65,3 | Acua Jet 5,7 | Rayo Burbuja 12,3 | Hidrobomba 6,9 | 90,2 |
| Lucario | Garra Metal 73,6 | Velocidad Extrema 5,1 | Esfera Aura 10,4 | Combate Cercano 7,9 | 96,9 |
| Greninja | Shuriken de Agua 51,8 | Tajo Umbrío 33,6 | Sombra Vil 5,3 | Pulso Umbrío 6,7 | 97,4 |
| Articuno | Golpe Ala 66,9 | Rayo Hielo 9,3 | Viento Gélido 5 | Ventisca 4,9 | 86,1 |
| Zapdos | Pico Taladro 71,5 | Onda Trueno — | Descarga 8,5 | Trueno 8,8 | 88,8 |
| Moltres | Ataque Aéreo 78 | Tajo Aéreo 16,9 | Onda Ígnea 7 | Ataque Celeste 5,8 | 107,7 |
| Mewtwo | Telequinesis 83,3 | Teletransporte — | Psíquico 12,7 | Psicoataque 7,4 | 103,4 |
| Mew | Golpe Psíquico 115,7 | Agilidad — | Premonición 6,4 | Recuperación — | 122,1 |
| Scyther | Golpe Furia 92 | Corte Aéreo 7,7 | Danza Espada — | Tijera X 7,7 | 107,3 |
| Tyranitar | Triturar 57,6 | Avalancha 11 | Terremoto 3,1 | Roca Afilada 7,2 | 79 |
| Onix | Atadura 39,3 | Lanzarrocas 8,2 | Excavar 6,1 | Fisura 4,6 | 58,2 |
| Groudon | Cuchillada 54,4 | Terremoto 4,3 | Avalancha 8 | Filo del Abismo 7,1 | 73,9 |
| Celebi | Hoja Mágica 43,4 | Rayo Solar 8 | Deseo — | Futuro Siniestro 5,3 | 56,7 |
| Lugia | Onda Mental 45,9 | Marea 3,6 | Ciclón 17,3 | Aerochorro 5,2 | 72,1 |
| Ho-Oh | Golpe Ala 96,5 | Pájaro Osado 15,8 | Recuperación — | Fuego Sagrado 22,5 | 134,8 |
| Gyarados | Acua Cola 74,3 | Cascada 11,7 | Triturar 8,7 | Dragoaliento 6,1 | 100,7 |

**DPS sostenido** es la suma del DPS de las cuatro habilidades contra el objetivo neutro. Supone que se pueden encadenar sin solaparse; el bloqueo global de casteo hace que el valor real sea algo menor.

Atacantes con moveset asignado: **21** de 25 especies del roster.
