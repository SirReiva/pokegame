# Modelos 3D: atlas y rendimiento

Este documento resume el pipeline de los cuerpos 3D y las optimizaciones que se
aplican después de exportarlos desde Blender.

## Por qué un atlas

El exportador de Blender (`tools/blender/export_pm_glb.py`) hornea una textura
de color y otra de normales **por material**. Un Pokémon normal acaba con 4-7
materiales, 8-14 texturas y 5-7 primitivas. En PlayCanvas cada primitiva es un
draw call, y el contorno de equipo (`OutlineRenderer`) vuelve a dibujar todas
esas primitivas en su propio pase.

`tools/models/atlas-glb.mjs` trabaja sobre el GLB ya exportado, sin necesitar
Blender ni los `.blend`:

1. Empaqueta las texturas de color en un atlas y las de normales en otro.
2. Remapea las UV de cada primitiva a su celda del atlas, con margen para que
   los mips no mezclen celdas vecinas.
3. Fusiona todas las primitivas del mismo grupo en una sola malla y un solo
   material. Los materiales emisivos (fuego, humo) van en un segundo grupo,
   porque necesitan su propia textura de emisión.
4. Conserva nodos, esqueleto, skin, pesos, colores y animaciones tal cual. El
   contorno de equipo sigue funcionando porque solo depende de las mallas.

## Uso

```bash
# Informe sin escribir nada
pnpm models:atlas

# Reescribir public/models
pnpm models:atlas --write

# Un solo modelo o una carpeta de salida
pnpm models:atlas --only pm0001_00
pnpm models:atlas --out .cache/atlas
pnpm models:atlas --input otra/carpeta --out .cache/atlas

# Mantener el detalle original en modelos de 3+ materiales
pnpm models:atlas --cell 1024 --write
```

Por defecto usa celdas de 1024 px con 1-2 materiales y de 512 px con 3 o más.
512 px es la mitad de lado que el horneado original: en una cámara cenital y
con los cuerpos a poca pantalla no se aprecia, y evita que el atlas de 7
materiales pida una textura de 4096 px. `--cell 1024` conserva el detalle a
cambio de más VRAM.

También acepta PNG indexados o en grises (1/4 bits), materiales con `alphaMode`
distinto de `OPAQUE`, cara doble y `KHR_texture_transform` (se hornea en la
textura y se descarta la extensión). Los materiales totalmente transparentes
(alfa 0) no gastan celda.

Además normaliza la escala de bind. Algunos exportadores (Sketchfab) dejan el
modelo a otra escala en el nodo raíz y la compensan con las matrices inversas de
bind; PlayCanvas dibuja el cuerpo a esa escala, pero los `min`/`max` de
`POSITION` no la incluyen y el juego escalaría el modelo con una caja falsa. El
script calcula `mundo(joint) · inverseBindMatrix`; si todas valen `s·I`, divide
la raíz por `s` y multiplica `POSITION` por `s`. El resultado se ve igual, pero
la caja de los accessors pasa a ser la real. No se usa la escala del nodo raíz
como señal porque no siempre coincide: en Onix la raíz escala `0,01` y el bind
real es `1`.

El script es idempotente de forma segura: si el `asset.generator` ya contiene
`newpoke atlas`, omite el modelo para no atlasear el atlas. Para volver a
generarlo hay que partir del GLB original: reexpórtalo con Blender o restaura
la versión anterior desde git (`git checkout <commit> -- public/models`) y
vuelve a lanzar el script.

## Resultado medido

Con los 27 modelos originales:

| Métrica | Antes | Después |
|---|---:|---:|
| Tamaño de los GLB | 219,8 MB | 187,4 MB |
| Texturas | 236 | 54 |
| Materiales | 128 | 29 |
| Primitivas (draw calls base) | 148 | 29 |
| VRAM de texturas (RGBA8 + mips) | 632 MB | 405 MB |
| Media por modelo | 23,4 MB | 15,0 MB |

Greninja (`pm0658`) se añadió después. Su GLB de Sketchfab pasó de 8
materiales, 10 primitivas y 5 texturas a 1/1/1; el tamaño no baja porque el
peso son las 74 animaciones, no la geometría.

En una partida de 8 especies eso pasa de ~44 primitivas base a ~9, y el pase de
contorno baja en la misma proporción. La VRAM de los Pokémon baja de ~187 MB a
~120 MB.

## LOD de animación

`CONFIG.performance.animationLod` (en `src/game/config.ts`) para el reloj del
`AnimComponent` de los cuerpos que están a más de `distance` unidades
horizontales del foco de la cámara. Siguen dibujándose con su contorno, pero el
esqueleto se evalúa cada `interval` segundos en vez de cada frame. Los casteos
manuales y el jugador cercano no se ven afectados.

## Precarga de animaciones

Durante la cuenta atrás, `Game.prewarmActors` reparte en tandas de 3 ms el
trabajo de PlayCanvas que antes caía en el primer casteo:

1. **Asignación de estados** (`prewarmStep`): crea el `AnimState` de cada clip.
   Los clips de casteo se asignan con `loop: false` porque se reproducen con
   `setManualFrame`; si se asignan con loop, el primer casteo vuelve a asignar
   el estado y paga otro `rebind`.
2. **Bind de clips** (`prewarmBind`): entra y sale de cada estado en el mismo
   tick, sin que el `AnimComponent` llegue a evaluar la pose. Así se resuelven
   una vez por copia los targets del binder; el `AnimClip` se recrea al activar
   el estado, pero sus bindings ya están cacheados. Las cachés del
   `AnimComponent` no se comparten entre viewports, por eso se calienta cada
   copia real.

`CONFIG.performance.warmUpAnimations` desactiva la segunda pasada. Para medir el
efecto, `CONFIG.debug.animationWarmupMarks` deja marcas `performance.measure`
por cada bind (`newpoke:anim-warmup:*`) y por el primer cambio real de estado
(`newpoke:anim-first:*`), que debería ser mucho más corto.

## Presupuesto de píxeles

`CONFIG.performance.matchPixelBudget` limita los píxeles internos de la
partida. En 1080p apenas cambia nada; en 1440p/4K evita pedir 6-8 M de píxeles
internos, que es donde el relleno de texturas y el contorno se comen el frame.
La resolución dinámica sigue bajando desde ese valor si el FPS no llega.


