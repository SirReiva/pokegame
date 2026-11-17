# Arcanine

**Tipos:** Fuego · **Roles:** Luchador / Tanque · **Dex:** 0059 (nuevo, 28.º)

## Identidad

El perseguidor del roster: entra, se queda y no deja que el objetivo se
separe. No acumula calor ni hostiga: mantiene el contacto y aguanta.

## Estadísticas (balance v1.1)

| PV | AF | DF | AE | DE | VEL | VIS |
|---|---|---|---|---|---|---|
| 1.100 | 120 | 105 | 70 | 90 | 6,4 u/s | 11,0 u |

## Kit

| Slot | Habilidad | Tipo | Resumen |
|---|---|---|---|
| Pasiva | **Intimidación** | — | Al entrar en combate (daño tras 6 s sin combatir), −15 % AF a los enemigos en 4,5 u durante 3 s. Sin acumular; enfriamiento por enemigo de 10 s. No afecta a objetivos. |
| Básico | **Mordisco** | Físico · Siniestro | 55, 0,45 s, 1,8 u, cono 45°, empuje 0,25. |
| H1 | **Velocidad Extrema** | Físico · Normal | 60, 7 s, dash 5,2 u, radio 0,85, empuje 0,5. Armadura 20 en Startup. |
| H2 | **Colmillo Ígneo** | Físico · Fuego | 85, 8 s, 2,0 u · quemadura 12 PV/s durante 4 s (48) · slow 15 % 1,2 s · armadura 15. |
| Definitiva | **Envite Ígneo** | Físico + Especial · Fuego | 160 impacto + 40 explosión · 15 s · carga 0,7 s · dash 6 u · armadura 35 · **autodaño 6 % solo si impacta** (no puede matar). |

## Interrupción

| Habilidad | Armadura | Ventana |
|---|---|---|
| Mordisco | 0 | — |
| Velocidad Extrema | 20 | Startup |
| Colmillo Ígneo | 15 | Startup |
| Envite Ígneo | 35 | Startup (carga) |

## Efectividades

- **Atacante Fuego:** ×1,15 a Planta, Hielo, Bicho y Acero · ×0,90 a Fuego, Agua, Roca y Dragón.
- **Defensor:** ×1,15 de Agua, Tierra y Roca · ×0,90 de Fuego, Planta, Hielo, Bicho, Acero y Hada.

## Balance

**Fortalezas:** persecución, aguante físico, presión con quemadura, buena ult.
**Debilidades:** una sola movilidad, sin control fuerte, sufre daño especial a distancia.

## Decisiones cerradas

- El autodaño de Envite Ígneo solo se aplica si impacta (opción B).
- Intimidación se mantiene tal cual, sin marca añadida.
- Arcanine se añade como Pokémon 28 del roster.

## Nota de implementación

Ya está registrado en `pokedex.ts`, `abilities.ts`, `roster.ts`, `vision.ts`,
`public/sprites/0059/` y `public/sprites/manifest.json` con su moveset y sus
aspectos normal y shiny. Aparece en el carrusel del roster.
