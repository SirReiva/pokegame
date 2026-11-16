# Baseline de frame real

Medición con `pnpm build` + `vite preview` + Chrome headless (`--headless=new`,
`--use-angle=swiftshader`, 1280×720). **Los valores absolutos no representan una
GPU real**: SwiftShader renderiza por software y exagera el coste. Sirven como
referencia relativa y para detectar regresiones de CPU/draw calls en el mismo
entorno.

Comando:

```bash
pnpm build
pnpm bench:frame --all --seconds 5
```

| Mapa | Vistas | FPS | frame ms | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arena | 1 | 2,8 | 361,06 | 366,60 | 383,40 | 383,40 |
| arena | 4 | 2,5 | 397,22 | 416,60 | 483,40 | 483,40 |
| arena | 8 | 1,4 | 729,71 | 749,90 | 774,70 | 774,70 |
| caldera | 1 | 2,9 | 348,08 | 366,60 | 383,40 | 383,40 |
| caldera | 4 | 2,6 | 385,38 | 416,60 | 500,10 | 500,10 |
| caldera | 8 | 2,2 | 449,38 | 483,40 | 516,70 | 516,70 |
| perf-256 | 1 | 2,1 | 473,09 | 483,40 | 583,30 | 583,30 |
| perf-256 | 4 | 1,4 | 706,64 | 783,30 | 883,40 | 883,40 |
| perf-256 | 8 | 1,2 | 829,84 | 933,30 | 983,40 | 983,40 |

## Medición con GPU real

Mismo comando, añadiendo `--gpu` para no forzar SwiftShader:

```bash
pnpm bench:frame --all --seconds 5 --gpu
```

| Mapa | Vistas | FPS | frame ms | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arena | 1 | 58,0 | 17,23 | 16,70 | 16,80 | 150,00 |
| arena | 4 | 59,9 | 16,71 | 16,70 | 16,80 | 33,30 |
| arena | 8 | 60,1 | 16,64 | 16,70 | 16,80 | 17,00 |
| caldera | 1 | 59,8 | 16,73 | 16,70 | 16,80 | 49,90 |
| caldera | 4 | 60,0 | 16,66 | 16,70 | 16,80 | 16,90 |
| caldera | 8 | 60,1 | 16,64 | 16,70 | 16,80 | 16,90 |
| perf-256 | 1 | 59,2 | 16,88 | 16,70 | 16,80 | 66,50 |
| perf-256 | 4 | 59,9 | 16,69 | 16,70 | 16,80 | 33,30 |
| perf-256 | 8 | 60,0 | 16,65 | 16,70 | 16,80 | 16,90 |

Con aceleración por hardware el juego mantiene 60 FPS estables en las 9
combinaciones; los picos aislados de 33-150 ms son de arranque/compilación de
shaders, no del estado estacionario. **Esta es la tabla de referencia.**

## Segunda medición con SwiftShader (software)

Mismo entorno y comando:

| Mapa | Vistas | FPS | frame ms | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arena | 1 | 2,9 | 350,03 | 366,60 | 433,50 | 433,50 |
| arena | 4 | 2,7 | 366,80 | 400,00 | 433,40 | 433,40 |
| arena | 8 | 1,7 | 596,54 | 666,70 | 700,00 | 700,00 |
| caldera | 1 | 2,7 | 365,74 | 366,70 | 433,40 | 433,40 |
| caldera | 4 | 2,5 | 404,05 | 400,00 | 683,50 | 683,50 |
| caldera | 8 | 2,0 | 505,94 | 483,30 | 916,80 | 916,80 |
| perf-256 | 1 | 2,1 | 472,30 | 500,10 | 566,70 | 566,70 |
| perf-256 | 4 | 1,2 | 810,93 | 833,40 | 900,10 | 900,10 |
| perf-256 | 8 | 1,4 | 737,40 | 833,40 | 910,50 | 910,50 |

La variación entre ejecuciones de SwiftShader es alta (±15-20 %), sobre todo en
`caldera` y `perf-256`. No se usa esta tabla para declarar mejoras o regresiones
de GPU; solo confirma que el benchmark sigue funcionando y que el escalado por
vistas se mantiene.

## Lectura

- El escalado por vistas es el esperado: cada viewport redibuja el mundo.
- `perf-256` es el mapa más caro, seguido de `caldera` y `arena`.
- Para una medición válida de GPU hay que repetir el mismo comando en una
  máquina con aceleración por hardware, sin `--use-angle=swiftshader`, y usar
  Chrome DevTools para registrar draw calls y frame CPU.
- Criterio de aceptación de refactor: p95 dentro de ±3 % respecto a esta tabla
  en el mismo entorno, mismos draw calls y sin tareas largas nuevas.
