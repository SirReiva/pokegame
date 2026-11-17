# Eevee

**Tipos:** Normal · **Roles:** Hostigador / Luchador · **Dex:** 0133

## Identidad

Versátil por elección: cambia de estado para cubrir lo que el equipo necesita.
No es "bueno en todo": es el que decide qué ser en cada pelea.

## Estadísticas (balance v1)

| PV | AF | DF | AE | DE | VEL | VIS |
|---|---|---|---|---|---|---|
| 1050 | 105 | 95 | 95 | 95 | 6,1 | 9,5 |

## Números (balance v1.1)

| Slot | Potencia / enfriamiento | Armadura |
|---|---|---|
| Básico | 45 / 0,55 s | 0 |
| H1 | — / 8 s | 0 |
| H2 | 60 / 7 s | 15 |
| Definitiva | 120 / 15 s | 30 |

## Kit

| Slot | Habilidad | Tipo | Resumen |
|---|---|---|---|
| Pasiva | **Adaptabilidad** | — | Tres estados: **Agilidad** (+15 % VEL), **Resistencia** (+15 % DF/DE) y **Potencia** (+15 % AF/AE). Solo uno activo. El cambio es manual, determinista y con enfriamiento. |
| Básico | **Placaje** | Físico · Normal | Golpe rápido de corto alcance, sin efectos. |
| H1 | **Adaptación** | Self | Cambia entre los tres estados. Instantáneo, sin preparación. |
| H2 | **Ataque Rápido** | Físico · Normal | Dash; el efecto depende del estado: más distancia (Agilidad), escudo al final (Resistencia) o más daño (Potencia). |
| Definitiva | **Último Recurso** | Físico · Normal | Ataque corto con preparación visible. Con Agilidad reparte tres impactos, con Resistencia deja un escudo y con Potencia concentra todo el daño en un golpe. |

## Interrupción

| Habilidad | Armadura | Ventana |
|---|---|---|
| Placaje | 0 | — |
| Adaptación | 0 | — |
| Ataque Rápido | 15 | Startup |
| Último Recurso | 30 | Startup |

## Efectividades

- **Atacante Normal:** ×0,90 a Roca y Acero · ×0,85 a Fantasma.
- **Defensor:** ×1,15 de Lucha · ×0,85 de Fantasma · neutral del resto.

## Balance

**Fortalezas:** flexibilidad, techo de habilidad, se adapta al equipo.
**Debilidades:** sin especialización, daño medio, depende de elegir bien el estado.

## Decisiones cerradas

- Cambio **libre** entre estados (opción A), no adaptación automática.
- Los estados son mutuamente excluyentes y tienen enfriamiento.

## Estado

Balance v1.2 aplicado. Los tres estados ya modifican Ataque Rápido y Último Recurso; el escudo de Resistencia llega al terminar la habilidad. Ver `../balance.md`.
