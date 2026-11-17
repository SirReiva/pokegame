# Daño por segundo por Pokémon y habilidad

> Generado automáticamente por `node scripts/generate-damage-matrix.mjs` a partir de `abilities.ts`, `pokedex.ts`, `combat.ts`, `typeChart.ts` y el manifiesto de sprites. No editar a mano.

## Cómo leer las tablas

- **Agrupación**: una sección por Pokémon atacante y una fila por rival. Cada columna es uno de sus cuatro ataques.
- **Celda**: daño esperado por segundo (`daño de un lanzamiento / cooldown`). La efectividad de cada celda está en [`tabla-danos-por-ataque.md`](tabla-danos-por-ataque.md).
- **Cooldown**: es el valor de la definición de la habilidad y empieza al iniciar el lanzamiento. El DPS no descuenta el `startup`, el `active`, el `recovery` ni el tiempo de movimiento entre ataques, así que es una **cota superior**.
- **Daño esperado**: nivel 50, IV 31, EV 0, naturaleza neutra, sin buffs, random medio 0,925, crítico 1/24 (×1,05). STAB ×1,05 incluido.
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
- [Suicune](#suicune)
- [Kyogre](#kyogre)
- [Rayquaza](#rayquaza)

## Pikachu

Tipos: **Electric** · HP 110 · Atk 75 · Def 60 · SpA 70 · SpD 70 · Vel 110

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 · CD 0,25 s | Habilidad 1: Ataque Rápido<br>Normal · Fís · Pot 60 · CD 4 s | Habilidad 2: Impactrueno<br>Electric · Esp · Pot 70 · CD 0,9 s | Definitiva: Rayo<br>Electric · Esp · Pot 130 · CD 8 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 100,2 | 6,8 | 25,6 | 5,5 |
| Charmander | 108,2 | 7,5 | 33,4 | 7 |
| Squirtle | 84,2 | 5,8 | 28,9 | 6,1 |
| Gengar | 72,2 | 5 | 25,6 | 5,3 |
| Voltorb | 96,2 | 6,8 | 28,9 | 6,1 |
| Eevee | 96,2 | 6,8 | 27,8 | 5,9 |
| Lucario | 76 | 5 | 26,7 | 5,5 |
| Greninja | 80,2 | 5,5 | 27,8 | 5,8 |
| Mewtwo | 64 | 4,5 | 21,2 | 4,5 |
| Mew | 60 | 4 | 18,9 | 4,1 |
| Onix | 40 | 2,8 | 31,1 | 6,4 |
| Scyther | 72,2 | 4,8 | 25,6 | 5 |
| Gyarados | 72,2 | 5 | 20 | 4,5 |
| Tyranitar | 48 | 3,5 | 18,9 | 4,1 |
| Articuno | 60 | 4 | 15,6 | 3,5 |
| Zapdos | 68 | 4,5 | 20,1 | 4,4 |
| Moltres | 64 | 4,5 | 24,5 | 4,9 |
| Raikou | 76,2 | 5 | 17,8 | 3,9 |
| Entei | 68 | 4,5 | 25,6 | 5,3 |
| Suicune | 52 | 3,5 | 16,7 | 3,8 |
| Lugia | 48 | 3,3 | 13,3 | 3,1 |
| Ho-Oh | 64 | 4,5 | 13,3 | 3,1 |
| Celebi | 60 | 4 | 17,8 | 3,9 |
| Kyogre | 64 | 4,5 | 14,4 | 3,3 |
| Groudon | 48 | 3 | 17,8 | 3,8 |
| Rayquaza | 64 | 4,5 | 20,1 | 4,4 |
| **Mediana de DPS** | 66 | 4,5 | 20,6 | 4,5 |

## Voltorb

Tipos: **Electric** · HP 115 · Atk 50 · Def 70 · SpA 75 · SpD 75 · Vel 120

| Rival | Básica: Chispa<br>Electric · Fís · Pot 80 · CD 0,6 s | Habilidad 1: Rollout<br>Normal · Fís · Pot 100 · CD 6 s | Habilidad 2: Onda Trueno<br>Electric · Estado · Pot — · CD 5 s | Definitiva: Explosión<br>Electric · Esp · Pot 200 · CD 18 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 38,4 | 5 | Estado | 4 |
| Charmander | 45,1 | 5,5 | Estado | 5,1 |
| Squirtle | 36,7 | 4 | Estado | 4,5 |
| Pikachu | 45,1 | 5,8 | Estado | 4,8 |
| Gengar | 38,4 | 3,7 | Estado | 3,8 |
| Eevee | 41,7 | 5 | Estado | 4,2 |
| Lucario | 31,8 | 3,7 | Estado | 4 |
| Greninja | 36,7 | 4 | Estado | 4,1 |
| Mewtwo | 26,7 | 3,3 | Estado | 3,3 |
| Mew | 23,3 | 3 | Estado | 3 |
| Onix | 13,3 | 1,8 | Estado | 4,7 |
| Scyther | 28,3 | 3,7 | Estado | 3,8 |
| Gyarados | 30 | 3,7 | Estado | 3,3 |
| Tyranitar | 21,7 | 2,5 | Estado | 3 |
| Articuno | 23,3 | 3 | Estado | 2,6 |
| Zapdos | 25 | 3,3 | Estado | 3,2 |
| Moltres | 26,7 | 3,3 | Estado | 3,6 |
| Raikou | 28,4 | 3,8 | Estado | 2,8 |
| Entei | 26,7 | 3,3 | Estado | 3,8 |
| Suicune | 21,7 | 2,7 | Estado | 2,8 |
| Lugia | 20 | 2,3 | Estado | 2,1 |
| Ho-Oh | 26,7 | 3,3 | Estado | 2,1 |
| Celebi | 21,7 | 3 | Estado | 2,8 |
| Kyogre | 26,7 | 3,3 | Estado | 2,3 |
| Groudon | 16,7 | 2,2 | Estado | 2,8 |
| Rayquaza | 25 | 3,3 | Estado | 3,2 |
| **Mediana de DPS** | 26,7 | 3,3 | — | 3,3 |

## Gengar

Tipos: **Ghost / Poison** · HP 135 · Atk 85 · Def 80 · SpA 150 · SpD 95 · Vel 130

| Rival | Básica: Lengüetazo<br>Ghost · Fís · Pot 42 · CD 0,7 s | Habilidad 1: Bola Sombra<br>Ghost · Esp · Pot 62 · CD 6 s | Habilidad 2: Bomba Lodo<br>Poison · Esp · Pot 20/s · CD 9 s | Definitiva: Come Sueños<br>Ghost · Esp · Pot 80 · CD 11 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 32,9 | 8 | 3 | 5,6 |
| Charmander | 35,7 | 9,5 | 4,7 | 6,7 |
| Squirtle | 25,8 | 8 | 3,6 | 5,6 |
| Pikachu | 37,2 | 9,5 | 4,7 | 6,7 |
| Voltorb | 32,9 | 8,8 | 4,1 | 6,3 |
| Eevee | 27,2 | 6,7 | 3,6 | 4,6 |
| Lucario | 24,3 | 7,5 | 2,9 | 5,2 |
| Greninja | 24,3 | 6,8 | 3,6 | 4,9 |
| Mewtwo | 20 | 6,3 | 3 | 4,6 |
| Mew | 18,6 | 5,8 | 2,4 | 4,2 |
| Onix | 12,9 | 10,2 | 4,6 | 7,2 |
| Scyther | 21,4 | 6,5 | 3 | 4,6 |
| Gyarados | 21,4 | 5,7 | 2,4 | 4 |
| Tyranitar | 15,7 | 5,3 | 1,9 | 3,7 |
| Articuno | 18,6 | 4,7 | 1,9 | 3,3 |
| Zapdos | 20 | 6,2 | 3 | 4,4 |
| Moltres | 20 | 6,3 | 3 | 4,5 |
| Raikou | 22,9 | 5,7 | 2,4 | 4 |
| Entei | 20 | 7,2 | 3 | 4,9 |
| Suicune | 17,1 | 5 | 1,9 | 3,5 |
| Lugia | 15,7 | 4,2 | 1,3 | 2,8 |
| Ho-Oh | 20 | 4 | 1,3 | 2,7 |
| Celebi | 18,6 | 5,8 | 2,4 | 4,2 |
| Kyogre | 20 | 4,2 | 1,9 | 3 |
| Groudon | 14,3 | 6,2 | 2,4 | 4,4 |
| Rayquaza | 20 | 6,2 | 3 | 4,4 |
| **Mediana de DPS** | 20 | 6,3 | 3 | 4,5 |

## Bulbasaur

Tipos: **Grass / Poison** · HP 120 · Atk 69 · Def 69 · SpA 85 · SpD 85 · Vel 65

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 · CD 0,25 s | Habilidad 1: Paralizador<br>Grass · Estado · Pot — · CD 7 s | Habilidad 2: Hoja Afilada<br>Grass · Esp · Pot 100 · CD 5 s | Definitiva: Lluevehojas<br>Grass · Esp · Pot 160 · CD 14 s |
| --- | ---: | ---: | ---: | ---: |
| Charmander | 100,2 | Estado | 9,8 | 5,7 |
| Squirtle | 76,2 | Estado | 9,2 | 5,2 |
| Pikachu | 104,2 | Estado | 10,4 | 6 |
| Gengar | 68 | Estado | 7,2 | 4,1 |
| Voltorb | 92,2 | Estado | 9,8 | 5,5 |
| Eevee | 92,2 | Estado | 8,8 | 4,9 |
| Lucario | 68,2 | Estado | 7,6 | 4,4 |
| Greninja | 76,2 | Estado | 8,4 | 4,8 |
| Mewtwo | 60 | Estado | 6,8 | 3,8 |
| Mew | 52 | Estado | 6,2 | 3,5 |
| Onix | 36 | Estado | 12,2 | 7,1 |
| Scyther | 64 | Estado | 6,6 | 3,7 |
| Gyarados | 64 | Estado | 6 | 3,4 |
| Tyranitar | 44 | Estado | 6,4 | 3,6 |
| Articuno | 52 | Estado | 4,6 | 2,7 |
| Zapdos | 60 | Estado | 6,4 | 3,6 |
| Moltres | 60 | Estado | 6,2 | 3,5 |
| Raikou | 68 | Estado | 6,2 | 3,5 |
| Entei | 60 | Estado | 7,2 | 4,1 |
| Suicune | 48 | Estado | 5,6 | 3,3 |
| Lugia | 48 | Estado | 4 | 2,3 |
| Ho-Oh | 60 | Estado | 3,8 | 2,1 |
| Celebi | 52 | Estado | 5,8 | 3,3 |
| Kyogre | 60 | Estado | 5 | 2,7 |
| Groudon | 44 | Estado | 7 | 3,9 |
| Rayquaza | 60 | Estado | 6 | 3,4 |
| **Mediana de DPS** | 60 | — | 6,5 | 3,7 |

## Charmander

Tipos: **Fire** · HP 114 · Atk 72 · Def 63 · SpA 80 · SpD 70 · Vel 85

| Rival | Básica: Arañazo<br>Normal · Fís · Pot 55 · CD 0,3 s | Habilidad 1: Giro Fuego<br>Fire · Esp · Pot 40/s · CD 6 s | Habilidad 2: Lanzallamas<br>Fire · Esp · Pot 100 · CD 6,5 s | Definitiva: Anillo Ígneo<br>Fire · Esp · Pot 130 · CD 14 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 80,1 | 5,3 | 6,5 | 3,9 |
| Squirtle | 66,8 | 4,3 | 5,9 | 3,6 |
| Pikachu | 93,5 | 7,3 | 7,7 | 4,6 |
| Gengar | 56,8 | 4,3 | 5,7 | 3,4 |
| Voltorb | 80 | 6,3 | 7,1 | 4,3 |
| Eevee | 80 | 5,3 | 6,2 | 3,7 |
| Lucario | 60,1 | 5,3 | 6 | 3,7 |
| Greninja | 66,8 | 4,3 | 5,5 | 3,4 |
| Mewtwo | 50 | 4,3 | 4,9 | 2,9 |
| Mew | 46,7 | 3,3 | 4,5 | 2,7 |
| Onix | 30 | 6,3 | 7,7 | 4,7 |
| Scyther | 56,7 | 4,3 | 5,5 | 3,4 |
| Gyarados | 56,7 | 2,3 | 4,2 | 2,6 |
| Tyranitar | 40 | 2,3 | 4,2 | 2,6 |
| Articuno | 46,7 | 2,3 | 4 | 2,3 |
| Zapdos | 53,3 | 4,3 | 4,9 | 2,9 |
| Moltres | 50 | 3,3 | 4,8 | 2,9 |
| Raikou | 60,1 | 3,3 | 4,5 | 2,7 |
| Entei | 53,3 | 3,3 | 5,4 | 3,2 |
| Suicune | 40 | 2,3 | 3,7 | 2,2 |
| Lugia | 40 | 2,3 | 3,2 | 1,9 |
| Ho-Oh | 50 | 1,3 | 2,9 | 1,7 |
| Celebi | 46,7 | 3,3 | 4,6 | 2,8 |
| Kyogre | 50 | 1,3 | 3,2 | 1,9 |
| Groudon | 36,7 | 4,3 | 4,9 | 2,9 |
| Rayquaza | 50 | 3,3 | 4,6 | 2,7 |
| **Mediana de DPS** | 51,7 | 3,8 | 4,9 | 2,9 |

## Squirtle

Tipos: **Water** · HP 119 · Atk 68 · Def 85 · SpA 70 · SpD 84 · Vel 63

| Rival | Básica: Placaje<br>Normal · Fís · Pot 55 · CD 0,25 s | Habilidad 1: Acua Jet<br>Water · Fís · Pot 65 · CD 5 s | Habilidad 2: Rayo Burbuja<br>Water · Esp · Pot 80 · CD 3 s | Definitiva: Hidrobomba<br>Water · Esp · Pot 140 · CD 9 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 92,2 | 5,2 | 8,7 | 5,2 |
| Charmander | 100,2 | 6,2 | 12 | 7 |
| Pikachu | 104,2 | 6,4 | 11,7 | 6,7 |
| Gengar | 68 | 5 | 8,3 | 5 |
| Voltorb | 92,2 | 5,4 | 10,7 | 6,2 |
| Eevee | 92,2 | 5,4 | 9,3 | 5,6 |
| Lucario | 68,2 | 4,4 | 9 | 5,2 |
| Greninja | 72,2 | 4,2 | 8,3 | 4,9 |
| Mewtwo | 56 | 3,4 | 7,7 | 4,2 |
| Mew | 52 | 3,2 | 7 | 3,9 |
| Onix | 36 | 2,4 | 13,3 | 7,9 |
| Scyther | 64 | 3,8 | 8,3 | 4,8 |
| Gyarados | 64 | 3,6 | 6,3 | 3,7 |
| Tyranitar | 44 | 2,8 | 7,3 | 4 |
| Articuno | 52 | 3,2 | 5,3 | 3,2 |
| Zapdos | 60 | 3,6 | 7,7 | 4,2 |
| Moltres | 56 | 3,4 | 8,3 | 4,7 |
| Raikou | 68 | 4,2 | 7 | 3,9 |
| Entei | 60 | 3,6 | 8,7 | 5,2 |
| Suicune | 48 | 2,6 | 5,7 | 3,2 |
| Lugia | 44 | 2,4 | 4,7 | 2,8 |
| Ho-Oh | 56 | 3,4 | 4,7 | 2,9 |
| Celebi | 52 | 3 | 6,3 | 3,7 |
| Kyogre | 56 | 3,2 | 4,7 | 2,7 |
| Groudon | 44 | 2,4 | 8 | 4,3 |
| Rayquaza | 56 | 3,2 | 7 | 4 |
| **Mediana de DPS** | 58 | 3,5 | 7,8 | 4,3 |

## Lucario

Tipos: **Fighting / Steel** · HP 145 · Atk 130 · Def 90 · SpA 135 · SpD 90 · Vel 110

| Rival | Básica: Garra Metal<br>Steel · Fís · Pot 45 · CD 0,5 s | Habilidad 1: Velocidad Extrema<br>Normal · Fís · Pot 55 · CD 6 s | Habilidad 2: Esfera Aura<br>Fighting · Esp · Pot 60 · CD 5 s | Definitiva: Combate Cercano<br>Fighting · Fís · Pot 125 · CD 13 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 74,1 | 7,2 | 7,6 | 7,3 |
| Charmander | 74,2 | 7,8 | 10 | 8,6 |
| Squirtle | 56,1 | 6 | 8,4 | 6,3 |
| Pikachu | 78,2 | 8,2 | 10 | 8,9 |
| Gengar | 64,1 | 5,2 | 5,8 | 5,5 |
| Voltorb | 68,1 | 7 | 9,4 | 7,7 |
| Eevee | 72,1 | 7 | 8,4 | 8,1 |
| Greninja | 54,1 | 5,8 | 7,8 | 6,5 |
| Mewtwo | 48,1 | 4,5 | 6 | 4,6 |
| Mew | 44,1 | 4,2 | 5,4 | 4,2 |
| Onix | 28 | 2,7 | 11 | 3 |
| Scyther | 50,1 | 5 | 6,2 | 4,9 |
| Gyarados | 48,1 | 5 | 5,4 | 5,2 |
| Tyranitar | 38,3 | 3,7 | 6,2 | 4,5 |
| Articuno | 46,1 | 4,2 | 4,8 | 4,4 |
| Zapdos | 46 | 4,7 | 6 | 4,9 |
| Moltres | 44,1 | 4,5 | 6,2 | 4,6 |
| Raikou | 50,1 | 5,3 | 5,8 | 5,7 |
| Entei | 46 | 4,7 | 7,4 | 5,2 |
| Suicune | 36,1 | 3,8 | 5,2 | 3,9 |
| Lugia | 34 | 3,3 | 3,6 | 3,2 |
| Ho-Oh | 44,1 | 4,5 | 3,8 | 4,6 |
| Celebi | 44,1 | 4,2 | 5,4 | 4,2 |
| Kyogre | 44,1 | 4,5 | 4,6 | 4,9 |
| Groudon | 32 | 3,2 | 6,4 | 3,4 |
| Rayquaza | 48,1 | 4,5 | 6 | 4,6 |
| **Mediana de DPS** | 47,1 | 4,6 | 6,1 | 4,9 |

## Greninja

Tipos: **Water / Dark** · HP 147 · Atk 115 · Def 87 · SpA 123 · SpD 91 · Vel 142

| Rival | Básica: Shuriken de Agua<br>Water · Esp · Pot 42 · CD 0,65 s | Habilidad 1: Tajo Umbrío<br>Dark · Fís · Pot 65 · CD 1,4 s | Habilidad 2: Sombra Vil<br>Dark · Fís · Pot 50 · CD 7 s | Definitiva: Pulso Umbrío<br>Dark · Esp · Pot 85 · CD 10 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 37 | 33,6 | 5,1 | 5,3 |
| Charmander | 50,8 | 36,5 | 5,6 | 6,4 |
| Squirtle | 38,5 | 27,2 | 4,1 | 5,3 |
| Pikachu | 49,3 | 37,9 | 6 | 6,4 |
| Gengar | 37 | 30,1 | 4,6 | 5 |
| Voltorb | 46,2 | 32,9 | 5,1 | 6 |
| Eevee | 40,1 | 32,9 | 5,1 | 5,3 |
| Lucario | 38,5 | 24,3 | 3,7 | 4,8 |
| Mewtwo | 32,4 | 21,5 | 3,6 | 4,2 |
| Mew | 27,8 | 20 | 3,3 | 3,9 |
| Onix | 57 | 12,9 | 2 | 6,9 |
| Scyther | 35,4 | 22,9 | 3,6 | 4,6 |
| Gyarados | 26,2 | 23,6 | 3,6 | 3,8 |
| Tyranitar | 27,8 | 16,5 | 2,6 | 3,6 |
| Articuno | 23,1 | 19,3 | 3,1 | 3,1 |
| Zapdos | 32,4 | 22,2 | 3,6 | 4 |
| Moltres | 35,4 | 20,7 | 3,4 | 4,3 |
| Raikou | 27,8 | 24,3 | 3,7 | 3,8 |
| Entei | 38,5 | 22,2 | 3,6 | 4,8 |
| Suicune | 23,1 | 17,9 | 2,6 | 3,4 |
| Lugia | 20 | 16,5 | 2,3 | 2,7 |
| Ho-Oh | 20 | 20,7 | 3,4 | 2,6 |
| Celebi | 26,2 | 20 | 3,3 | 3,9 |
| Kyogre | 20 | 20,7 | 3,4 | 2,8 |
| Groudon | 33,9 | 15 | 2,1 | 4 |
| Rayquaza | 29,3 | 20,7 | 3,4 | 4 |
| **Mediana de DPS** | 33,1 | 21,8 | 3,6 | 4,1 |

## Articuno

Tipos: **Ice / Flying** · HP 165 · Atk 105 · Def 120 · SpA 115 · SpD 145 · Vel 105

| Rival | Básica: Golpe Ala<br>Flying · Fís · Pot 55 · CD 0,55 s | Habilidad 1: Rayo Hielo<br>Ice · Esp · Pot 90 · CD 7 s | Habilidad 2: Viento Gélido<br>Ice · Esp · Pot 55 · CD 8 s | Definitiva: Ventisca<br>Ice · Esp · Pot 100 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 67,3 | 7,7 | 4,1 | 4 |
| Charmander | 71,1 | 8,6 | 4,5 | 4,5 |
| Squirtle | 52,8 | 7,2 | 3,9 | 3,7 |
| Pikachu | 71,1 | 9,2 | 4,8 | 4,7 |
| Gengar | 56,4 | 6,7 | 3,6 | 3,5 |
| Voltorb | 61,9 | 8,5 | 4,6 | 4,4 |
| Eevee | 65,5 | 7,4 | 4 | 3,9 |
| Lucario | 49,2 | 6,7 | 3,5 | 3,5 |
| Greninja | 52,8 | 6,7 | 3,5 | 3,4 |
| Mewtwo | 43,7 | 5,7 | 3,1 | 3,1 |
| Mew | 40,1 | 5,3 | 3 | 2,8 |
| Onix | 23,6 | 10,3 | 5,5 | 5,3 |
| Scyther | 47,3 | 6,7 | 3,5 | 3,5 |
| Gyarados | 45,5 | 5,1 | 2,9 | 2,7 |
| Tyranitar | 32,8 | 5,3 | 3 | 2,8 |
| Zapdos | 41,8 | 6 | 3,3 | 3,2 |
| Moltres | 43,7 | 6 | 3,1 | 3,1 |
| Raikou | 43,7 | 5,3 | 3 | 2,8 |
| Entei | 45,5 | 6,3 | 3,4 | 3,3 |
| Suicune | 32,8 | 4,4 | 2,4 | 2,3 |
| Lugia | 29,1 | 3,9 | 1,9 | 2 |
| Ho-Oh | 43,7 | 3,6 | 1,8 | 1,9 |
| Celebi | 41,9 | 5,4 | 3,1 | 2,9 |
| Kyogre | 43,7 | 3,7 | 2 | 1,9 |
| Groudon | 27,3 | 6 | 3,3 | 3,2 |
| Rayquaza | 43,7 | 6,3 | 3,4 | 3,3 |
| **Mediana de DPS** | 43,7 | 6,2 | 3,3 | 3,2 |

## Zapdos

Tipos: **Electric / Flying** · HP 165 · Atk 110 · Def 105 · SpA 145 · SpD 110 · Vel 120

| Rival | Básica: Pico Taladro<br>Flying · Fís · Pot 60 · CD 0,6 s | Habilidad 1: Onda Trueno<br>Electric · Estado · Pot — · CD 5 s | Habilidad 2: Descarga<br>Electric · Esp · Pot 75 · CD 8 s | Definitiva: Trueno<br>Electric · Esp · Pot 145 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 73,5 | Estado | 6,5 | 6,7 |
| Charmander | 76,8 | Estado | 8,4 | 8,6 |
| Squirtle | 56,7 | Estado | 7,1 | 7,5 |
| Pikachu | 75,1 | Estado | 7,9 | 8,2 |
| Gengar | 60,1 | Estado | 6,3 | 6,3 |
| Voltorb | 63,5 | Estado | 7,4 | 7,6 |
| Eevee | 66,9 | Estado | 6,9 | 7,1 |
| Lucario | 51,7 | Estado | 6,5 | 6,7 |
| Greninja | 55,1 | Estado | 6,6 | 6,9 |
| Mewtwo | 43,4 | Estado | 5,4 | 5,5 |
| Mew | 41,7 | Estado | 4,8 | 5,1 |
| Onix | 25 | Estado | 7,6 | 7,9 |
| Scyther | 50,1 | Estado | 6,1 | 6,3 |
| Gyarados | 48,4 | Estado | 5,1 | 5,5 |
| Tyranitar | 35,1 | Estado | 4,8 | 5,1 |
| Articuno | 41,7 | Estado | 4,3 | 4,4 |
| Moltres | 43,4 | Estado | 5,9 | 6,1 |
| Raikou | 46,7 | Estado | 4,5 | 4,8 |
| Entei | 45,1 | Estado | 6,3 | 6,3 |
| Suicune | 36,7 | Estado | 4,5 | 4,7 |
| Lugia | 31,8 | Estado | 3,5 | 3,6 |
| Ho-Oh | 43,4 | Estado | 3,5 | 3,6 |
| Celebi | 43,3 | Estado | 4,5 | 4,8 |
| Kyogre | 43,4 | Estado | 3,8 | 3,9 |
| Groudon | 30,1 | Estado | 4,5 | 4,6 |
| Rayquaza | 43,4 | Estado | 5,3 | 5,4 |
| **Mediana de DPS** | 44,2 | — | 5,6 | 5,8 |

## Moltres

Tipos: **Fire / Flying** · HP 165 · Atk 120 · Def 110 · SpA 145 · SpD 105 · Vel 110

| Rival | Básica: Ataque Aéreo<br>Flying · Fís · Pot 55 · CD 0,55 s | Habilidad 1: Tajo Aéreo<br>Flying · Esp · Pot 65 · CD 3,5 s | Habilidad 2: Onda Ígnea<br>Fire · Esp · Pot 60 · CD 8 s | Definitiva: Ataque Celeste<br>Flying · Fís · Pot 115 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 80,2 | 14,3 | 5,9 | 6,1 |
| Charmander | 83,8 | 16,6 | 6,3 | 6,3 |
| Squirtle | 61,9 | 14 | 5,3 | 4,7 |
| Pikachu | 82 | 15,7 | 6,6 | 6,3 |
| Gengar | 65,5 | 12,3 | 4,9 | 4,9 |
| Voltorb | 69,2 | 14,6 | 6,4 | 5,3 |
| Eevee | 73 | 13,7 | 5,6 | 5,7 |
| Lucario | 56,4 | 12,9 | 5,5 | 4,3 |
| Greninja | 60,1 | 12,9 | 4,9 | 4,5 |
| Mewtwo | 47,3 | 10,6 | 4,3 | 3,6 |
| Mew | 45,5 | 9,7 | 3,9 | 3,3 |
| Onix | 27,3 | 16,9 | 6,8 | 2,1 |
| Scyther | 54,6 | 12 | 4,9 | 4,1 |
| Gyarados | 52,8 | 9,7 | 3,6 | 4 |
| Tyranitar | 38,3 | 9,2 | 3,6 | 2,9 |
| Articuno | 45,5 | 8 | 3,4 | 3,3 |
| Zapdos | 45,5 | 10 | 4,3 | 3,5 |
| Raikou | 51 | 9,2 | 3,9 | 3,9 |
| Entei | 49,2 | 12,3 | 4,6 | 3,7 |
| Suicune | 40,1 | 8,6 | 3,3 | 2,9 |
| Lugia | 34,7 | 6,9 | 2,9 | 2,6 |
| Ho-Oh | 47,3 | 6,9 | 2,6 | 3,6 |
| Celebi | 47,3 | 10 | 4 | 3,5 |
| Kyogre | 47,3 | 7,2 | 2,8 | 3,6 |
| Groudon | 32,8 | 10,6 | 4,3 | 2,5 |
| Rayquaza | 47,3 | 10,6 | 4 | 3,6 |
| **Mediana de DPS** | 48,3 | 10,6 | 4,3 | 3,7 |

## Mewtwo

Tipos: **Psychic** · HP 181 · Atk 130 · Def 110 · SpA 174 · SpD 110 · Vel 150

| Rival | Básica: Telequinesis<br>Psychic · Esp · Pot 45 · CD 0,6 s | Habilidad 1: Teletransporte<br>Psychic · Estado · Pot — · CD 6 s | Habilidad 2: Psíquico<br>Psychic · Esp · Pot 80 · CD 7 s | Definitiva: Psicoataque<br>Psychic · Esp · Pot 100 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 66,9 | Estado | 10,6 | 6,2 |
| Charmander | 81,8 | Estado | 12,3 | 7,1 |
| Squirtle | 66,9 | Estado | 10,2 | 6 |
| Pikachu | 81,8 | Estado | 12,3 | 7,1 |
| Gengar | 61,7 | Estado | 9,6 | 5,4 |
| Voltorb | 75,1 | Estado | 11,3 | 6,7 |
| Eevee | 65,2 | Estado | 10,2 | 5,9 |
| Lucario | 61,7 | Estado | 9,4 | 5,5 |
| Greninja | 51,7 | Estado | 8 | 4,6 |
| Mew | 43,4 | Estado | 6,9 | 3,9 |
| Onix | 86,8 | Estado | 13,2 | 7,7 |
| Scyther | 56,7 | Estado | 8,6 | 5 |
| Gyarados | 46,7 | Estado | 7,3 | 4,2 |
| Tyranitar | 38,4 | Estado | 6,1 | 3,5 |
| Articuno | 40,1 | Estado | 6 | 3,4 |
| Zapdos | 51,7 | Estado | 7,7 | 4,5 |
| Moltres | 53,4 | Estado | 8,2 | 4,7 |
| Raikou | 46,7 | Estado | 7,3 | 4,2 |
| Entei | 60,1 | Estado | 9,2 | 5,2 |
| Suicune | 41,7 | Estado | 6,4 | 3,7 |
| Lugia | 30,1 | Estado | 4,7 | 2,7 |
| Ho-Oh | 31,8 | Estado | 5 | 2,9 |
| Celebi | 43,4 | Estado | 6,9 | 3,9 |
| Kyogre | 36,7 | Estado | 5,4 | 3,1 |
| Groudon | 51,7 | Estado | 7,7 | 4,5 |
| Rayquaza | 51,7 | Estado | 7,7 | 4,5 |
| **Mediana de DPS** | 51,7 | — | 7,9 | 4,6 |

## Mew

Tipos: **Psychic** · HP 175 · Atk 120 · Def 120 · SpA 120 · SpD 120 · Vel 120

| Rival | Básica: Golpe Psíquico<br>Psychic · Esp · Pot 45 · CD 0,3 s | Habilidad 1: Agilidad<br>Psychic · Estado · Pot — · CD 8 s | Habilidad 2: Premonición<br>Psychic · Esp · Pot 85 · CD 10 s | Definitiva: Recuperación<br>Psychic · Estado · Pot — · CD 14 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 93,5 | Estado | 5,3 | Estado |
| Charmander | 110,1 | Estado | 6,4 | Estado |
| Squirtle | 93,5 | Estado | 5,2 | Estado |
| Pikachu | 110,1 | Estado | 6,4 | Estado |
| Gengar | 86,8 | Estado | 4,9 | Estado |
| Voltorb | 103,5 | Estado | 5,8 | Estado |
| Eevee | 90,1 | Estado | 5,1 | Estado |
| Lucario | 83,5 | Estado | 4,8 | Estado |
| Greninja | 73,3 | Estado | 4,1 | Estado |
| Mewtwo | 66,8 | Estado | 3,7 | Estado |
| Onix | 120,1 | Estado | 6,8 | Estado |
| Scyther | 80,1 | Estado | 4,4 | Estado |
| Gyarados | 63,6 | Estado | 3,7 | Estado |
| Tyranitar | 53,5 | Estado | 3,1 | Estado |
| Articuno | 53,3 | Estado | 3 | Estado |
| Zapdos | 73,5 | Estado | 3,9 | Estado |
| Moltres | 76,8 | Estado | 4,2 | Estado |
| Raikou | 63,6 | Estado | 3,7 | Estado |
| Entei | 83,5 | Estado | 4,7 | Estado |
| Suicune | 56,7 | Estado | 3,3 | Estado |
| Lugia | 40 | Estado | 2,3 | Estado |
| Ho-Oh | 43,3 | Estado | 2,5 | Estado |
| Celebi | 60,1 | Estado | 3,5 | Estado |
| Kyogre | 46,7 | Estado | 2,8 | Estado |
| Groudon | 73,5 | Estado | 3,9 | Estado |
| Rayquaza | 73,5 | Estado | 3,9 | Estado |
| **Mediana de DPS** | 73,5 | — | 4 | — |

## Scyther

Tipos: **Bug / Flying** · HP 145 · Atk 130 · Def 100 · SpA 75 · SpD 100 · Vel 125

| Rival | Básica: Golpe Furia<br>Bug · Fís · Pot 45 · CD 0,4 s | Habilidad 1: Corte Aéreo<br>Flying · Fís · Pot 60 · CD 6,5 s | Habilidad 2: Danza Espada<br>Normal · Estado · Pot — · CD 12 s | Definitiva: Tijera X<br>Bug · Fís · Pot 130 · CD 14 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 90,1 | 7,9 | Estado | 7,4 |
| Charmander | 92,7 | 8,2 | Estado | 7,9 |
| Squirtle | 75,1 | 6 | Estado | 6,2 |
| Pikachu | 105,2 | 8,2 | Estado | 8,6 |
| Gengar | 70,1 | 6,5 | Estado | 5,8 |
| Voltorb | 90,1 | 7,1 | Estado | 7,4 |
| Eevee | 90,1 | 7,6 | Estado | 7,4 |
| Lucario | 62,6 | 5,7 | Estado | 5,2 |
| Greninja | 75,1 | 5,9 | Estado | 6,3 |
| Mewtwo | 62,6 | 4,8 | Estado | 4,9 |
| Mew | 57,6 | 4,3 | Estado | 4,5 |
| Onix | 35 | 2,8 | Estado | 2,9 |
| Gyarados | 60,1 | 5,2 | Estado | 5 |
| Tyranitar | 47,8 | 3,7 | Estado | 4,1 |
| Articuno | 50,1 | 4,3 | Estado | 4,1 |
| Zapdos | 57,5 | 4,6 | Estado | 4,7 |
| Moltres | 52,6 | 4,8 | Estado | 4,2 |
| Raikou | 67,6 | 5,2 | Estado | 5,5 |
| Entei | 57,5 | 4,9 | Estado | 4,7 |
| Suicune | 47,7 | 3,9 | Estado | 3,9 |
| Lugia | 40 | 3,5 | Estado | 3,4 |
| Ho-Oh | 52,6 | 4,8 | Estado | 4,2 |
| Celebi | 60,1 | 4,5 | Estado | 4,7 |
| Kyogre | 60,1 | 4,8 | Estado | 4,7 |
| Groudon | 40 | 3,4 | Estado | 3,3 |
| Rayquaza | 55,1 | 4,8 | Estado | 4,4 |
| **Mediana de DPS** | 60,1 | 4,8 | — | 4,7 |

## Tyranitar

Tipos: **Rock / Dark** · HP 175 · Atk 154 · Def 130 · SpA 115 · SpD 120 · Vel 81

| Rival | Básica: Triturar<br>Dark · Fís · Pot 50 · CD 0,85 s | Habilidad 1: Avalancha<br>Rock · Fís · Pot 55 · CD 5 s | Habilidad 2: Terremoto<br>Ground · Fís · Pot 18/s · CD 9 s | Definitiva: Roca Afilada<br>Rock · Fís · Pot 90 · CD 12 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 57,7 | 10 | 3,6 | 6,8 |
| Charmander | 61,3 | 12 | 4,7 | 8,2 |
| Squirtle | 44,8 | 8,6 | 3,6 | 5,8 |
| Pikachu | 64,8 | 12,2 | 5,2 | 8,3 |
| Gengar | 51,9 | 8,6 | 3,6 | 5,9 |
| Voltorb | 56,6 | 10,4 | 4,1 | 7,2 |
| Eevee | 56,6 | 10,4 | 4,1 | 7,2 |
| Lucario | 41,2 | 7,2 | 3 | 4,9 |
| Greninja | 42,4 | 8,4 | 3,6 | 5,8 |
| Mewtwo | 36,5 | 6,6 | 2,4 | 4,5 |
| Mew | 34,2 | 6,2 | 2,4 | 4,2 |
| Onix | 21,2 | 3,8 | 1,3 | 2,6 |
| Scyther | 38,9 | 8 | 2,3 | 5,4 |
| Gyarados | 40 | 7,6 | 2,3 | 5,3 |
| Articuno | 33 | 6,8 | 1,9 | 4,6 |
| Zapdos | 37,7 | 7,2 | 1,9 | 4,9 |
| Moltres | 35,3 | 7,2 | 1,9 | 4,9 |
| Raikou | 41,2 | 7,6 | 3 | 5,3 |
| Entei | 37,7 | 7,2 | 2,4 | 4,9 |
| Suicune | 29,5 | 5,4 | 1,9 | 3,8 |
| Lugia | 28,3 | 5,2 | 1,3 | 3,3 |
| Ho-Oh | 35,3 | 7,2 | 1,9 | 4,9 |
| Celebi | 34,2 | 6,2 | 1,9 | 4,2 |
| Kyogre | 35,3 | 6,6 | 2,4 | 4,5 |
| Groudon | 25,9 | 4,4 | 1,3 | 3 |
| Rayquaza | 35,3 | 6,8 | 1,9 | 4,7 |
| **Mediana de DPS** | 37,7 | 7,2 | 2,4 | 4,9 |

## Onix

Tipos: **Rock / Ground** · HP 110 · Atk 65 · Def 180 · SpA 50 · SpD 65 · Vel 90

| Rival | Básica: Atadura<br>Rock · Fís · Pot 65 · CD 0,7 s | Habilidad 1: Lanzarrocas<br>Rock · Fís · Pot 85 · CD 4,5 s | Habilidad 2: Excavar<br>Ground · Fís · Pot 85 · CD 6 s | Definitiva: Fisura<br>Ground · Fís · Pot 155 · CD 14 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 34,3 | 7,3 | 5,7 | 4,5 |
| Charmander | 42,9 | 8,7 | 6,5 | 5,2 |
| Squirtle | 31,5 | 6,2 | 4,7 | 3,6 |
| Pikachu | 42,9 | 8,7 | 6,7 | 5,4 |
| Gengar | 31,5 | 6,2 | 5,2 | 4 |
| Voltorb | 37,2 | 7,6 | 5,8 | 4,7 |
| Eevee | 37,2 | 7,6 | 5,7 | 4,5 |
| Lucario | 25,8 | 5,3 | 4,7 | 3,6 |
| Greninja | 31,5 | 6 | 4,5 | 3,6 |
| Mewtwo | 22,9 | 5,1 | 3,8 | 2,8 |
| Mew | 21,4 | 4,7 | 3,5 | 2,6 |
| Scyther | 27,2 | 6 | 3,3 | 2,5 |
| Gyarados | 25,8 | 5,8 | 3,5 | 2,6 |
| Tyranitar | 20 | 4 | 3 | 2,5 |
| Articuno | 22,9 | 5,1 | 2,8 | 2,1 |
| Zapdos | 24,3 | 5,6 | 3,5 | 2,6 |
| Moltres | 24,3 | 5,6 | 3,3 | 2,4 |
| Raikou | 27,3 | 5,6 | 4,3 | 3,4 |
| Entei | 24,3 | 5,6 | 4,2 | 3,1 |
| Suicune | 18,6 | 4 | 3 | 2,3 |
| Lugia | 17,1 | 3,6 | 2,2 | 1,7 |
| Ho-Oh | 24,3 | 5,6 | 3,3 | 2,4 |
| Celebi | 21,4 | 4,7 | 3,2 | 2,4 |
| Kyogre | 22,9 | 5,1 | 3,8 | 2,8 |
| Groudon | 15,7 | 3,1 | 2,5 | 1,9 |
| Rayquaza | 22,9 | 5,3 | 3,2 | 2,4 |
| **Mediana de DPS** | 24,3 | 5,6 | 3,7 | 2,7 |

## Groudon

Tipos: **Ground** · HP 175 · Atk 170 · Def 160 · SpA 120 · SpD 110 · Vel 110

| Rival | Básica: Cuchillada<br>Normal · Fís · Pot 45 · CD 0,6 s | Habilidad 1: Terremoto<br>Ground · Fís · Pot 18/s · CD 9 s | Habilidad 2: Avalancha<br>Rock · Fís · Pot 55 · CD 5 s | Definitiva: Filo del Abismo<br>Ground · Fís · Pot 100 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 76,8 | 4,1 | 10,6 | 7 |
| Charmander | 83,5 | 5,2 | 12,8 | 8,1 |
| Squirtle | 61,8 | 3,6 | 9,2 | 5,8 |
| Pikachu | 88,5 | 5,8 | 12,8 | 8,5 |
| Gengar | 56,7 | 4,1 | 9,2 | 6,3 |
| Voltorb | 76,8 | 4,7 | 11 | 7,2 |
| Eevee | 76,8 | 4,7 | 11 | 6,9 |
| Lucario | 56,7 | 3,6 | 7,6 | 5,7 |
| Greninja | 61,7 | 3,6 | 9 | 5,6 |
| Mewtwo | 48,4 | 3 | 7,2 | 4,5 |
| Mew | 45,1 | 2,4 | 6,6 | 4,1 |
| Onix | 28,4 | 1,3 | 4 | 2,8 |
| Scyther | 53,4 | 2,3 | 8,4 | 3,9 |
| Gyarados | 55,1 | 2,3 | 8 | 4,1 |
| Tyranitar | 36,7 | 2,4 | 6 | 3,9 |
| Articuno | 45,1 | 1,9 | 7,2 | 3,4 |
| Zapdos | 51,7 | 2,4 | 7,6 | 4,1 |
| Moltres | 48,4 | 2,4 | 7,8 | 3,9 |
| Raikou | 56,7 | 3,6 | 8,2 | 5,3 |
| Entei | 51,7 | 3 | 7,6 | 4,9 |
| Suicune | 40 | 1,9 | 5,8 | 3,6 |
| Lugia | 36,7 | 1,3 | 5,4 | 2,7 |
| Ho-Oh | 48,4 | 2,4 | 7,8 | 3,9 |
| Celebi | 45,1 | 1,9 | 6,6 | 3,8 |
| Kyogre | 48,4 | 3 | 7,2 | 4,5 |
| Rayquaza | 48,4 | 2,3 | 7,4 | 3,7 |
| **Mediana de DPS** | 51,7 | 2,7 | 7,7 | 4,3 |

## Celebi

Tipos: **Psychic / Grass** · HP 175 · Atk 120 · Def 120 · SpA 120 · SpD 120 · Vel 120

| Rival | Básica: Hoja Mágica<br>Grass · Esp · Pot 45 · CD 0,8 s | Habilidad 1: Rayo Solar<br>Grass · Esp · Pot 85 · CD 8 s | Habilidad 2: Deseo<br>Psychic · Estado · Pot — · CD 13 s | Definitiva: Futuro Siniestro<br>Psychic · Esp · Pot 105 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 30,1 | 5,8 | Estado | 4,5 |
| Charmander | 38,8 | 7,5 | Estado | 5,1 |
| Squirtle | 36,3 | 6,8 | Estado | 4,3 |
| Pikachu | 41,3 | 8 | Estado | 5,1 |
| Gengar | 28,8 | 5,5 | Estado | 3,9 |
| Voltorb | 38,8 | 7,3 | Estado | 4,8 |
| Eevee | 33,8 | 6,4 | Estado | 4,3 |
| Lucario | 30,1 | 5,8 | Estado | 3,9 |
| Greninja | 33,8 | 6,4 | Estado | 3,3 |
| Mewtwo | 27,6 | 4,9 | Estado | 3,1 |
| Mew | 23,9 | 4,6 | Estado | 2,9 |
| Onix | 48,8 | 9,3 | Estado | 5,6 |
| Scyther | 26,3 | 4,9 | Estado | 3,6 |
| Gyarados | 22,6 | 4,5 | Estado | 3,1 |
| Tyranitar | 23,9 | 4,8 | Estado | 2,6 |
| Articuno | 18,8 | 3,5 | Estado | 2,5 |
| Zapdos | 25,1 | 4,6 | Estado | 3,3 |
| Moltres | 25,1 | 4,6 | Estado | 3,4 |
| Raikou | 23,9 | 4,6 | Estado | 3,1 |
| Entei | 28,8 | 5,5 | Estado | 3,8 |
| Suicune | 21,3 | 4,3 | Estado | 2,7 |
| Lugia | 15 | 2,9 | Estado | 1,9 |
| Ho-Oh | 13,8 | 2,8 | Estado | 2,1 |
| Kyogre | 17,5 | 3,6 | Estado | 2,3 |
| Groudon | 28,8 | 5 | Estado | 3,3 |
| Rayquaza | 23,8 | 4,4 | Estado | 3,3 |
| **Mediana de DPS** | 26,9 | 4,9 | — | 3,3 |

## Lugia

Tipos: **Psychic / Flying** · HP 181 · Atk 110 · Def 150 · SpA 110 · SpD 174 · Vel 130

| Rival | Básica: Onda Mental<br>Psychic · Esp · Pot 50 · CD 0,8 s | Habilidad 1: Marea<br>Water · Esp · Pot 30/s · CD 9 s | Habilidad 2: Ciclón<br>Flying · Esp · Pot 45/s · CD 4 s | Definitiva: Aerochorro<br>Flying · Esp · Pot 120 · CD 16 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 36,3 | 3,6 | 14 | 4,4 |
| Charmander | 42,6 | 5,2 | 16,8 | 5 |
| Squirtle | 35,1 | 3,6 | 14 | 4,3 |
| Pikachu | 42,6 | 5,2 | 15,5 | 4,8 |
| Gengar | 32,6 | 3,6 | 13 | 3,8 |
| Voltorb | 40,1 | 4,7 | 14,3 | 4,5 |
| Eevee | 35,1 | 4,1 | 14 | 4,2 |
| Lucario | 31,3 | 4,1 | 12,8 | 3,9 |
| Greninja | 27,5 | 3 | 13 | 3,9 |
| Mewtwo | 26,3 | 3 | 10,5 | 3,2 |
| Mew | 23,8 | 3 | 10,5 | 3 |
| Onix | 46,3 | 6,3 | 16,8 | 5,2 |
| Scyther | 31,3 | 3,6 | 11,8 | 3,7 |
| Gyarados | 26,3 | 2,4 | 10,5 | 3 |
| Tyranitar | 21,3 | 3 | 9,3 | 2,8 |
| Articuno | 20 | 2,4 | 8 | 2,4 |
| Zapdos | 28,8 | 3 | 9,3 | 3 |
| Moltres | 30,1 | 3 | 11,8 | 3,4 |
| Raikou | 26,3 | 3 | 9,3 | 2,8 |
| Entei | 31,3 | 3,6 | 13 | 3,8 |
| Suicune | 21,3 | 1,9 | 9,3 | 2,7 |
| Ho-Oh | 16,3 | 1,9 | 6,8 | 2,1 |
| Celebi | 23,8 | 2,4 | 10,5 | 3,1 |
| Kyogre | 18,8 | 1,3 | 6,8 | 2,3 |
| Groudon | 28,8 | 3 | 10,5 | 3,2 |
| Rayquaza | 28,8 | 2,4 | 10,5 | 3,2 |
| **Mediana de DPS** | 28,8 | 3 | 11,1 | 3,3 |

## Ho-Oh

Tipos: **Fire / Flying** · HP 181 · Atk 150 · Def 110 · SpA 130 · SpD 174 · Vel 110

| Rival | Básica: Golpe Ala<br>Flying · Fís · Pot 55 · CD 0,55 s | Habilidad 1: Pájaro Osado<br>Flying · Fís · Pot 100 · CD 6 s | Habilidad 2: Recuperación<br>Fire · Estado · Pot — · CD 13 s | Definitiva: Fuego Sagrado<br>Fire · Fís · Pot 50/s · CD 3 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 96,5 | 16,2 | Estado | 23,7 |
| Charmander | 102 | 17 | Estado | 23,3 |
| Squirtle | 76,5 | 12,7 | Estado | 16,7 |
| Pikachu | 102 | 17 | Estado | 25,7 |
| Gengar | 82 | 13,4 | Estado | 19 |
| Voltorb | 87,3 | 14,5 | Estado | 22,7 |
| Eevee | 92,8 | 15,4 | Estado | 22,7 |
| Lucario | 69,3 | 11,9 | Estado | 16,7 |
| Greninja | 73 | 12,4 | Estado | 15,7 |
| Mewtwo | 60,1 | 9,9 | Estado | 13,7 |
| Mew | 54,6 | 9 | Estado | 12,3 |
| Onix | 34,6 | 5,7 | Estado | 7,7 |
| Scyther | 67,3 | 11,4 | Estado | 14,7 |
| Gyarados | 65,5 | 10,9 | Estado | 13,7 |
| Tyranitar | 45,5 | 7,8 | Estado | 10,3 |
| Articuno | 54,6 | 9 | Estado | 12,3 |
| Zapdos | 58,3 | 9,5 | Estado | 13,7 |
| Moltres | 60,1 | 9,9 | Estado | 12,7 |
| Raikou | 65,5 | 10,7 | Estado | 15,7 |
| Entei | 61,9 | 10,2 | Estado | 12,7 |
| Suicune | 47,3 | 8 | Estado | 10,3 |
| Lugia | 45,5 | 7,3 | Estado | 10,7 |
| Celebi | 56,4 | 9,3 | Estado | 12,3 |
| Kyogre | 60,1 | 9,9 | Estado | 12,7 |
| Groudon | 41,9 | 6,7 | Estado | 9,7 |
| Rayquaza | 60,1 | 9,9 | Estado | 12,7 |
| **Mediana de DPS** | 61 | 10 | — | 13,7 |

## Gyarados

Tipos: **Water / Flying** · HP 170 · Atk 145 · Def 99 · SpA 80 · SpD 120 · Vel 101

| Rival | Básica: Acua Cola<br>Water · Fís · Pot 55 · CD 0,7 s | Habilidad 1: Cascada<br>Water · Fís · Pot 70 · CD 5,5 s | Habilidad 2: Triturar<br>Dark · Fís · Pot 85 · CD 6 s | Definitiva: Dragoaliento<br>Dragon · Fís · Pot 150 · CD 15 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 67,2 | 10,9 | 12,4 | 8,6 |
| Charmander | 80,1 | 13,1 | 13,5 | 9,4 |
| Squirtle | 54,4 | 8,7 | 10 | 7 |
| Pikachu | 81,6 | 13,3 | 14,2 | 9,9 |
| Gengar | 61,5 | 9,8 | 11 | 7,4 |
| Voltorb | 71,5 | 11,5 | 12,2 | 8,5 |
| Eevee | 71,5 | 11,5 | 12,2 | 8,5 |
| Lucario | 54,3 | 8,9 | 9 | 6,3 |
| Greninja | 53 | 8,7 | 9,3 | 6,9 |
| Mewtwo | 44,3 | 7,1 | 8,2 | 5,5 |
| Mew | 41,5 | 6,7 | 7,5 | 4,9 |
| Onix | 28,8 | 4,9 | 4,8 | 3,3 |
| Scyther | 50,1 | 8 | 8,5 | 5,9 |
| Tyranitar | 38,6 | 6,4 | 6,2 | 4,6 |
| Articuno | 41,5 | 6,7 | 7,2 | 4,9 |
| Zapdos | 47,2 | 7,7 | 8,2 | 5,7 |
| Moltres | 45,8 | 7,3 | 7,8 | 5,5 |
| Raikou | 51,5 | 8,6 | 9 | 6,3 |
| Entei | 48,6 | 8 | 8,2 | 5,7 |
| Suicune | 32,9 | 5,6 | 6,3 | 4,4 |
| Lugia | 34,3 | 5,3 | 6 | 4 |
| Ho-Oh | 45,8 | 7,3 | 7,8 | 5,5 |
| Celebi | 38,6 | 6,4 | 7,5 | 4,9 |
| Kyogre | 41,5 | 6,7 | 7,8 | 5,5 |
| Groudon | 32,9 | 5,1 | 5,3 | 3,7 |
| Rayquaza | 41,5 | 6,7 | 7,8 | 5,7 |
| **Mediana de DPS** | 46,5 | 7,5 | 8,2 | 5,7 |

## Suicune

Tipos: **Water** · HP 175 · Atk 95 · Def 135 · SpA 110 · SpD 135 · Vel 105

| Rival | Básica: Golpe Cuerpo<br>Normal · Fís · Pot 80 · CD 0,8 s | Habilidad 1: Chorro de Agua<br>Water · Esp · Pot 68 · CD 1,5 s | Habilidad 2: Rayo Hielo<br>Ice · Esp · Pot 90 · CD 7 s | Definitiva: Frío Polar<br>Ice · Esp · Pot 140 · CD 8 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 57,6 | 24 | 7,3 | 9,6 |
| Charmander | 62,6 | 32,7 | 8 | 10,6 |
| Squirtle | 46,4 | 24,1 | 6,6 | 8,9 |
| Pikachu | 65,1 | 31,4 | 8,4 | 11,3 |
| Gengar | 41,3 | 22,7 | 6,2 | 8,4 |
| Voltorb | 56,4 | 28,7 | 7,9 | 10,6 |
| Eevee | 56,4 | 25,4 | 7 | 9,3 |
| Lucario | 42,6 | 24 | 6,2 | 8,4 |
| Greninja | 46,3 | 22,7 | 6 | 8,3 |
| Mewtwo | 36,3 | 19,4 | 5,3 | 7,3 |
| Mew | 32,6 | 18 | 5 | 6,6 |
| Onix | 21,3 | 36,7 | 9,4 | 12,8 |
| Scyther | 40,1 | 21,4 | 6,2 | 8,3 |
| Gyarados | 40,1 | 16,7 | 4,9 | 6,5 |
| Tyranitar | 27,6 | 18,7 | 5 | 6,6 |
| Articuno | 32,6 | 15,4 | 4 | 5,4 |
| Zapdos | 37,6 | 19,4 | 5,4 | 7,5 |
| Moltres | 36,3 | 21,4 | 5,4 | 7,5 |
| Raikou | 42,6 | 18 | 5 | 6,6 |
| Entei | 37,6 | 23,4 | 5,7 | 7,9 |
| Lugia | 27,6 | 12 | 3,6 | 4,8 |
| Ho-Oh | 36,3 | 12 | 3,3 | 4,5 |
| Celebi | 32,6 | 16,7 | 5,1 | 6,9 |
| Kyogre | 36,3 | 12,7 | 3,4 | 4,8 |
| Groudon | 25,1 | 20 | 5,4 | 7,5 |
| Rayquaza | 36,3 | 18 | 5,7 | 7,9 |
| **Mediana de DPS** | 37,6 | 20,7 | 5,6 | 7,7 |

## Kyogre

Tipos: **Water** · HP 175 · Atk 120 · Def 110 · SpA 170 · SpD 160 · Vel 110

| Rival | Básica: Ráfaga Marina<br>Water · Esp · Pot 46 · CD 0,85 s | Habilidad 1: Remolino Marino<br>Water · Esp · Pot 34/s · CD 8 s | Habilidad 2: Aguas Curativas<br>Water · Estado · Pot — · CD 12 s | Definitiva: Pulso Primigenio<br>Water · Esp · Pot 160/s · CD 16 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 43,6 | 7,1 | Estado | 8 |
| Charmander | 60,1 | 10,3 | Estado | 10,8 |
| Squirtle | 43,6 | 7,8 | Estado | 8,1 |
| Pikachu | 57,7 | 10,3 | Estado | 10,3 |
| Gengar | 42,4 | 7,6 | Estado | 7,5 |
| Voltorb | 53 | 9 | Estado | 9,6 |
| Eevee | 46 | 7,8 | Estado | 8,5 |
| Lucario | 44,8 | 7,8 | Estado | 8,1 |
| Greninja | 41,2 | 7 | Estado | 7,5 |
| Mewtwo | 36,5 | 6,5 | Estado | 6,5 |
| Mew | 33 | 5,9 | Estado | 6 |
| Onix | 66 | 11,5 | Estado | 12,3 |
| Scyther | 40 | 7 | Estado | 7,1 |
| Gyarados | 30,6 | 5,3 | Estado | 5,6 |
| Tyranitar | 34,2 | 5,9 | Estado | 6,3 |
| Articuno | 28,3 | 4,6 | Estado | 4,9 |
| Zapdos | 36,5 | 6,5 | Estado | 6,5 |
| Moltres | 38,9 | 7 | Estado | 7 |
| Raikou | 33 | 5,9 | Estado | 6 |
| Entei | 43,6 | 7,6 | Estado | 7,8 |
| Suicune | 27,1 | 4,6 | Estado | 5 |
| Lugia | 22,5 | 4 | Estado | 4,1 |
| Ho-Oh | 22,5 | 4 | Estado | 4,3 |
| Celebi | 30,6 | 5,3 | Estado | 5,6 |
| Groudon | 37,7 | 6,5 | Estado | 6,8 |
| Rayquaza | 34,2 | 5,9 | Estado | 6,1 |
| **Mediana de DPS** | 38,3 | 6,8 | — | 6,9 |

## Rayquaza

Tipos: **Dragon / Flying** · HP 180 · Atk 170 · Def 110 · SpA 170 · SpD 110 · Vel 115

| Rival | Básica: Garra Dragón<br>Dragon · Fís · Pot 50 · CD 0,7 s | Habilidad 1: Vuelo Dragón<br>Flying · Fís · Pot 70 · CD 6 s | Habilidad 2: Furia Dragón<br>Dragon · Esp · Pot 85 · CD 9 s | Definitiva: Ascenso Draco<br>Flying · Fís · Pot 130 · CD 16 s |
| --- | ---: | ---: | ---: | ---: |
| Bulbasaur | 75,8 | 12,9 | 8,1 | 9 |
| Charmander | 83 | 13,5 | 9,9 | 9,5 |
| Squirtle | 63 | 10 | 8,2 | 7 |
| Pikachu | 87,3 | 13,5 | 9,9 | 9,4 |
| Gengar | 65,8 | 10,7 | 7,2 | 7,4 |
| Voltorb | 74,4 | 11,5 | 9,1 | 8 |
| Eevee | 74,4 | 12,2 | 8,1 | 8,5 |
| Lucario | 54,4 | 9,4 | 7,2 | 6,6 |
| Greninja | 60,1 | 9,9 | 7,6 | 6,8 |
| Mewtwo | 48,6 | 7,8 | 6,2 | 5,4 |
| Mew | 44,3 | 7,2 | 5,7 | 5 |
| Onix | 30,1 | 4,5 | 10,6 | 3,1 |
| Scyther | 52,9 | 8,8 | 7 | 6,2 |
| Gyarados | 52,9 | 8,5 | 5,7 | 6 |
| Tyranitar | 40,1 | 6,2 | 5,7 | 4,3 |
| Articuno | 44,3 | 7,2 | 4,8 | 5 |
| Zapdos | 50,1 | 7,7 | 6,2 | 5,3 |
| Moltres | 48,6 | 7,8 | 6,6 | 5,4 |
| Raikou | 54,4 | 8,5 | 5,7 | 5,9 |
| Entei | 50,1 | 8,2 | 7,2 | 5,6 |
| Suicune | 38,6 | 6,3 | 5,2 | 4,4 |
| Lugia | 35,7 | 5,7 | 4 | 4 |
| Ho-Oh | 48,6 | 7,8 | 4 | 5,4 |
| Celebi | 44,3 | 7,5 | 5,7 | 5,1 |
| Kyogre | 48,6 | 7,8 | 4,2 | 5,4 |
| Groudon | 34,3 | 5,3 | 6,2 | 3,7 |
| **Mediana de DPS** | 50,1 | 8 | 6,4 | 5,5 |

## DPS por habilidad contra un objetivo neutro

Objetivo sin tipos y con 100 en todas las estadísticas: sirve para comparar la potencia bruta de cada habilidad sin que el matchup de tipos distorsione el resultado. STAB incluido.

| Pokémon | Básica | Habilidad 1 | Habilidad 2 | Definitiva | DPS sostenido |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pikachu | Placaje 72,2 | Ataque Rápido 4,8 | Impactrueno 24,5 | Rayo 4,9 | 106,3 |
| Voltorb | Chispa 28,3 | Rollout 3,7 | Onda Trueno — | Explosión 3,6 | 35,6 |
| Gengar | Lengüetazo 21,4 | Bola Sombra 6,5 | Bomba Lodo 3 | Come Sueños 4,6 | 35,6 |
| Bulbasaur | Placaje 64 | Paralizador — | Hoja Afilada 7,4 | Lluevehojas 4,2 | 75,6 |
| Charmander | Arañazo 56,7 | Giro Fuego 4,3 | Lanzallamas 5,4 | Anillo Ígneo 3,2 | 69,6 |
| Squirtle | Placaje 64 | Acua Jet 3,8 | Rayo Burbuja 8,3 | Hidrobomba 4,8 | 80,9 |
| Lucario | Garra Metal 50,1 | Velocidad Extrema 5 | Esfera Aura 7 | Combate Cercano 5,4 | 67,5 |
| Greninja | Shuriken de Agua 35,4 | Tajo Umbrío 22,9 | Sombra Vil 3,6 | Pulso Umbrío 4,6 | 66,5 |
| Articuno | Golpe Ala 45,5 | Rayo Hielo 6,4 | Viento Gélido 3,4 | Ventisca 3,3 | 58,7 |
| Zapdos | Pico Taladro 48,4 | Onda Trueno — | Descarga 5,9 | Trueno 6 | 60,3 |
| Moltres | Ataque Aéreo 52,8 | Tajo Aéreo 11,5 | Onda Ígnea 4,8 | Ataque Celeste 3,9 | 73 |
| Mewtwo | Telequinesis 56,7 | Teletransporte — | Psíquico 8,6 | Psicoataque 5 | 70,3 |
| Mew | Golpe Psíquico 80,1 | Agilidad — | Premonición 4,4 | Recuperación — | 84,5 |
| Scyther | Golpe Furia 62,6 | Corte Aéreo 5,2 | Danza Espada — | Tijera X 5,2 | 73,1 |
| Tyranitar | Triturar 38,9 | Avalancha 7,4 | Terremoto 3 | Roca Afilada 4,9 | 54,2 |
| Onix | Atadura 25,8 | Lanzarrocas 5,6 | Excavar 4,2 | Fisura 3,1 | 38,6 |
| Groudon | Cuchillada 53,4 | Terremoto 3 | Avalancha 7,8 | Filo del Abismo 4,9 | 69,1 |
| Celebi | Hoja Mágica 30,1 | Rayo Solar 5,5 | Deseo — | Futuro Siniestro 3,6 | 39,2 |
| Lugia | Onda Mental 31,3 | Marea 3,6 | Ciclón 11,8 | Aerochorro 3,6 | 50,1 |
| Ho-Oh | Golpe Ala 65,5 | Pájaro Osado 10,9 | Recuperación — | Fuego Sagrado 14,7 | 91,1 |
| Gyarados | Acua Cola 50,1 | Cascada 8 | Triturar 8,5 | Dragoaliento 5,9 | 72,5 |
| Suicune | Golpe Cuerpo 40,1 | Chorro de Agua 21,4 | Rayo Hielo 5,9 | Frío Polar 7,9 | 75,2 |
| Kyogre | Ráfaga Marina 40 | Remolino Marino 7 | Aguas Curativas — | Pulso Primigenio 7,1 | 54,2 |
| Rayquaza | Garra Dragón 52,9 | Vuelo Dragón 8,5 | Furia Dragón 7 | Ascenso Draco 5,9 | 74,4 |

**DPS sostenido** es la suma del DPS de las cuatro habilidades contra el objetivo neutro. Supone que se pueden encadenar sin solaparse; el bloqueo global de casteo hace que el valor real sea algo menor.

Atacantes con moveset asignado: **24** de 27 especies del roster.
