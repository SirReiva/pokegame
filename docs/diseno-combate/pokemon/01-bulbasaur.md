# Bulbasaur

**Tipos:** Planta / Veneno · **Roles:** Apoyo / Controlador · **Dex:** 0001

## Identidad

Controlador vegetal de medio alcance. Mantiene zonas, desgasta y crea
oportunidades de curación para el equipo. No es un sanador de retaguardia.
Su debilidad son los personajes móviles que esquivan sus zonas.

## Estadísticas (balance v1)

| PV | AF | DF | AE | DE | VEL | VIS |
|---|---|---|---|---|---|---|
| 1000 | 70 | 90 | 115 | 100 | 4,6 | 8,8 |

## Números (balance v1.1)

| Slot | Potencia / enfriamiento | Armadura |
|---|---|---|
| Básico | 45 / 0,70 s | 0 |
| H1 | 80 / 8 s | 0 |
| H2 | 60 / 9 s | 0 |
| Definitiva | 110 / 16 s | 30 |

## Kit

| Slot | Habilidad | Tipo | Resumen |
|---|---|---|---|
| Pasiva | **Semillas Latentes** | — | Los impactos directos dejan una semilla. Un segundo impacto directo la germina: daño especial extra + pequeña curación para Bulbasaur o un aliado cercano. Una semilla por enemigo, con enfriamiento interno. El daño periódico no la activa. |
| Básico | **Semilladora** | Especial · Planta | Proyectil de alcance medio, un impacto, sin control. Puede germinar semillas. |
| H1 | **Drenadoras** | Especial · Planta | Proyectil de un solo objetivo. Daño periódico + robo de vida. Reaplicar renueva; no acumula. Persiste aunque Bulbasaur reciba daño tras lanzarla. |
| H2 | **Raíces Enredadoras** | Especial · Planta | Zona alargada en el suelo, con aviso. Enraíza brevemente (0,35-0,60 s) y ralentiza al liberarse. Afecta a varios. La zona persiste tras el casteo. |
| Definitiva | **Floración** | Especial · Planta | Gran zona con varios pulsos: daña y ralentiza a enemigos, cura a aliados. Preparación de 0,75 s, movimiento bloqueado, armadura moderada en Startup. |

## Interrupción

| Habilidad | Armadura | Ventana |
|---|---|---|
| Semilladora | 0 | — |
| Drenadoras | 0 | Vulnerable en preparación |
| Raíces Enredadoras | 0 | Vulnerable en preparación |
| Floración | Moderada (por definir) | Startup |

## Efectividades (producto con tope)

- **Atacante Planta:** ×1,15 a Agua, Tierra y Roca · ×0,90 a Fuego, Planta, Veneno, Volador, Bicho, Acero y Dragón.
- **Atacante Veneno:** ×1,15 a Planta y Hada · ×0,90 a Veneno, Tierra, Roca y Fantasma · ×0,85 a Acero.
- **Defensor:** ×1,15 de Fuego, Hielo, Volador y Psíquico · ×0,90 de Agua, Eléctrico, Lucha y Hada · ×0,85 de Planta.

## Balance

**Fortalezas:** control de zonas, desgaste, apoyo, defensa de objetivos.
**Debilidades:** movilidad limitada, poco daño explosivo, depende de acertar.

## Decisiones cerradas

- La semilla se consume con el segundo impacto directo.
- La curación puede ir a Bulbasaur o a un aliado cercano.
- Floración es apoyo y control, no una definitiva de burst.

## Estado

Balance v1 aplicado; ver `../balance.md`.
