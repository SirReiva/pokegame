# Baseline de rendimiento

Fecha de referencia: noviembre de 2026 · build de producción.

## CPU pura (`pnpm bench`)

Node 26, sin GPU, sobre los módulos puros. Sirve para detectar regresiones de
lógica o asignaciones tras un refactor; **no sustituye** a la medición del
frame real.

| Benchmark | Iteraciones | Tiempo | Throughput |
| --- | ---: | ---: | ---: |
| `decorateDamage` | 2.000.000 | 133,9 ms | 14.931.312 ops/s |
| `aoeContains` (cono) | 2.000.000 | 253,6 ms | 7.886.687 ops/s |
| `buildBotHazards` (100 proyectiles + 20 áreas) | 20.000 | 113,1 ms | 176.904 ops/s |
| `normalizeModeSettings` | 200.000 | 40,8 ms | 4.903.716 ops/s |

Criterio de aceptación: una variación de ±5 % en estos números es ruido; por
encima de ese margen se investiga antes de mergear.

## Frame real (pendiente de repetir tras el refactor)

La metodología ya está descrita en `docs/rendimiento-carga-mapas.md`. Para
cerrar cada fase hay que medir con Chrome headless y `pnpm build` +
`pnpm preview`, nunca con `pnpm dev`:

- mapas `arena`, `caldera` y `perf-256`;
- 1, 4 y 8 vistas;
- frame CPU p50/p95, `renderTime`, draw calls, tareas largas y memoria;
- misma cámara, mismos bots y mismo seed.

Criterio: p95 dentro de ±3 %, mismos draw calls y ninguna tarea larga nueva.

Las pasadas de partida real (v0.28.4, 1 vista, GPU hardware) están en
`docs/performance/revision-2026-11-18.md`: 60,0 fps estables, p95 de 21,4 ms y
p99 del tick de 14,7 ms. Quedan pendientes las combinaciones de 4 y 8 vistas.
