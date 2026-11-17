# Voltorb

**Tipos:** Eléctrico · **Roles:** Hostigador / Mago · **Dex:** 0100

## Identidad

Bomba eléctrica con movimiento propio: amenaza espacios, castiga grupos y
explota con un coste real. Se diferencia de Pikachu en que no acumula energía
en sí mismo: **prepara descargas sobre los enemigos**.

## Estadísticas (balance v1.2)

| PV | AF | DF | AE | DE | VEL | VIS |
|---|---|---|---|---|---|---|
| 1000 | 80 | 80 | 120 | 85 | 8,2 | 9,5 |

## Números (balance v1.1)

| Slot | Potencia / enfriamiento | Armadura |
|---|---|---|
| Básico | 40 / 0,60 s | 0 |
| H1 | 55 / 6 s | 15 |
| H2 | 65 / 8 s | 20 |
| Definitiva | 170 / 16 s | 40 |

## Kit

| Slot | Habilidad | Tipo | Resumen |
|---|---|---|---|
| Pasiva | **Núcleo Resonante** | — | Cada golpe directo deja una carga residual (máx. 2). Al completarse, detona una descarga eléctrica de 40 de daño. Una marca por enemigo, duración limitada. |
| Básico | **Rodamiento** | Físico · Normal | Giro corto hacia delante, rápido, sin control. |
| H1 | **Rodar** | Físico · Normal | Dash que atraviesa enemigos y hace daño durante el recorrido. |
| H2 | **Onda Trueno** | Especial · Eléctrico | Descarga circular centrada en Voltorb: daño, slow breve y aplica la marca de la pasiva. |
| Definitiva | **Explosión** | Especial · Eléctrico | Carga visible, explosión circular con daño elevado y empuje. **Coste: 20 % de PV máximos**, solo si se ejecuta; no puede matarse con él. |

## Interrupción

| Habilidad | Armadura | Ventana |
|---|---|---|
| Rodamiento | 0 | — |
| Rodar | 15 | Startup |
| Onda Trueno | 20 | Startup |
| Explosión | 40 | Startup |

## Efectividades

- **Atacante Eléctrico:** ×1,15 a Agua y Volador · ×0,90 a Eléctrico, Planta y Dragón · ×0,85 a Tierra.
- **Defensor:** ×1,15 de Tierra · ×0,90 de Eléctrico, Volador y Acero.

## Balance

**Fortalezas:** movilidad, daño de área, presión en espacios cerrados.
**Debilidades:** vida media-baja, la definitiva le cuesta un quinto de la barra.

## Decisiones cerradas

- Explosión tiene coste de 20 % de PV y nunca puede matar a Voltorb.
- El coste solo se paga si la explosión llega a ejecutarse.
- La pasiva marca con cualquier golpe directo para que el básico también
  alimente la descarga; antes solo los ataques eléctricos la activaban y el kit
  quedaba demasiado dependiente de la definitiva.

## Estado

Balance v1.2 aplicado; ver `../balance.md`.
