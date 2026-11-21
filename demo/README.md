# Visor de modelos Pokémon (GLB + PlayCanvas)

Página independiente del juego en `/demo/` que carga los modelos convertidos desde Blender con PlayCanvas: cámara orbital, selector de modelo, reproductor de animaciones con timeline, velocidad y estadísticas en vivo.

## Ejecutar

```bash
pnpm install
pnpm dev:model
```

Abre <http://localhost:5173/demo/>. También se puede arrancar con `pnpm dev` y entrar a mano.

El modelo inicial se puede elegir desde la URL:

```text
http://localhost:5173/demo/?model=pm0002_00
```

En producción, `pnpm build` genera `dist/demo/index.html` y copia los modelos a `dist/models/`.

## Modelos

| Modelo | Especie | Triángulos | Huesos | Clips | GLB |
| --- | --- | ---: | ---: | ---: | --- |
| `pm0001_00` | Bulbasaur | 3.996 | 75 | 46 | `public/models/pm0001/pm0001_00.glb` |
| `pm0002_00` | Ivysaur | 5.816 | 64 | 49 | `public/models/pm0002/pm0002_00.glb` |
| `pm0004_00` | Charmander | 3.706 | 68 | 50 | `public/models/pm0004/pm0004_00.glb` |
| `pm0007_00` | Squirtle | 3.998 | 48 | 86 | `public/models/pm0007/pm0007_00.glb` |
| `pm0025` | Pikachu | 3.950 | 81 | 78 | `public/models/pm0025/pm0025.glb` |
| `pm0094_00` | Gengar | 5.588 | 67 | 77 | `public/models/pm0094/pm0094_00.glb` |
| `pm0095_00` | Onix | 3.630 | 31 | 23 | `public/models/pm0095/pm0095_00.glb` |
| `pm0100_00` | Voltorb | 2.654 | 26 | 41 | `public/models/pm0100/pm0100_00.glb` |
| `pm0123` | Scyther | 6.184 | 72 | 82 | `public/models/pm0123/pm0123.glb` |
| `pm0130` | Gyarados | 6.068 | 69 | 46 | `public/models/pm0130/pm0130.glb` |
| `pm0133_00` | Eevee | 4.000 | 81 | 77 | `public/models/pm0133/pm0133_00.glb` |
| `pm0144_00` | Articuno | 6.852 | 91 | 56 | `public/models/pm0144/pm0144_00.glb` |
| `pm0145_00` | Zapdos | 6.236 | 75 | 56 | `public/models/pm0145/pm0145_00.glb` |
| `pm0146_00` | Moltres | 9.548 | 110 | 56 | `public/models/pm0146/pm0146_00.glb` |
| `pm0150_00` | Mewtwo | 9.986 | 87 | 71 | `public/models/pm0150/pm0150_00.glb` |
| `pm0151_00` | Mew | 3.998 | 54 | 43 | `public/models/pm0151/pm0151_00.glb` |
| `pm0243` | Raikou | 5.994 | 66 | 43 | `public/models/pm0243/pm0243.glb` |
| `pm0244` | Entei | 9.714 | 102 | 45 | `public/models/pm0244/pm0244.glb` |
| `pm0245` | Suicune | 5.986 | 118 | 74 | `public/models/pm0245/pm0245.glb` |
| `pm0248` | Tyranitar | 5.998 | 58 | 45 | `public/models/pm0248/pm0248.glb` |
| `pm0249` | Lugia | 8.566 | 120 | 84 | `public/models/pm0249/pm0249.glb` |
| `pm0250` | Ho-Oh | 9.998 | 124 | 56 | `public/models/pm0250/pm0250.glb` |
| `pm0251_00` | Celebi | 4.266 | 64 | 33 | `public/models/pm0251/pm0251_00.glb` |
| `pm0382` | Kyogre | 7.636 | 63 | 43 | `public/models/pm0382/pm0382.glb` |
| `pm0383_00` | Groudon | 9.030 | 74 | 46 | `public/models/pm0383/pm0383_00.glb` |
| `pm0384` | Rayquaza | 7.186 | 67 | 46 | `public/models/pm0384/pm0384.glb` |
| `pm0448` | Lucario | 5.978 | 83 | 49 | `public/models/pm0448/pm0448.glb` |

El selector de la cabecera cambia de modelo sin recargar la página: descarga el GLB, reconstruye la lista de clips y ajusta la cámara a la escala de cada uno. La lista de modelos y sus ajustes de cámara están en `MODELS`, en `main.ts`.

Los clips se agrupan por categoría (Espera, Movimiento, Descanso, Combate, Reacciones y Rostro). Los modelos comparten la mayoría de IDs; `00293`–`00295` (`eat02`) solo falta en pm0001, `08201` (`loop01`) solo está en pm0004, `00260`–`00262` (`wildbool02`) solo en pm0007, y pm0007 añade además una segunda tanda completa de clips con el prefijo `10000`.

Los modelos añadidos del roster mezclan dos esquemas de clips: los PMD (`fi20_walk01`, `kw01_wait01`…) y los que llevan prefijo de rutina (`00000_`, `10000_`, `20000_`). `clipMetaFor` normaliza ambos para reutilizar las mismas etiquetas y grupos. Los clips sin nombre en el `.blend` original (hashes de Onix) se muestran como `Clip especial` en **Otros**.

## Controles

- **Arrastrar** en el canvas: orbitar.
- **Rueda** del ratón o **pinza** en móvil: zoom.
- **Espacio**: reproducir / pausar.
- **← →**: clip anterior / siguiente.
- **R**: restablecer cámara.
- **Loop** y **Órbita** se pueden desactivar desde el dock.
- La barra de progreso se puede arrastrar para hacer *scrubbing*.

## Conversión `.blend` → GLB

El `.blend` usa un grafo de materiales del shader original (albedo × AO, máscaras de ojos y normales con la componente Z en el alfa) que el exportador glTF no entiende. El script `tools/blender/export_pm_glb.py` es genérico para los modelos dados de alta en `tools/blender/models.json`:

1. Hornea el color base de cada material con Cycles (`EMIT`): albedo × AO y el color de los ojos. Los materiales gobernados por un nodo `Emission` (la llama de pm0004) se hornean por su color de emisión y se reconstruyen con `Emission Color`, base negra y sin depender de la luz.
2. Convierte las normales al formato glTF (X/Y en RGB y Z en el canal azul).
3. Normaliza con módulo 1 las UV de los materiales configurados en `uvWrapMaterials` (el atlas original vive fuera de 0..1 y el juego lo muestrea con `REPEAT`).
4. Reconstruye un `Principled BSDF` limpio con la textura horneada y el normal map.
5. Añade la escala de las lianas cuando el modelo lo pide en `models.json`: las acciones importadas desde `.gfbanm` solo traen locación y rotación, así que la escala quedaba congelada y el exportador muestreaba `1.0` en casi todos los clips.
6. Exporta **todos** los actions del armature como animaciones glTF (`BROADCAST`).

### Conversión con `pnpm convert:model`

El wrapper `tools/blender/convert_model.mjs` lee `models.json`, deja elegir el modelo y llama a Blender con la ruta del `.blend` y la configuración correctos:

```bash
pnpm convert:model                  # menú interactivo
pnpm convert:model pm0001_00        # por id
pnpm convert:model 2                # por número del menú
pnpm convert:model --all            # todos los modelos
pnpm convert:model --list           # ver los disponibles
pnpm convert:model pm0001_00 --resolution 2048
```

Busca Blender en `--blender`, la variable `BLENDER_PATH`, el `PATH` y las instalaciones habituales (incluida la portable de `Downloads`). Si está en otro sitio:

```bash
pnpm convert:model pm0001_00 --blender "C:\ruta\a\blender.exe"
```

Todo lo que no es una opción del wrapper se reenvía al exportador (`--config`, `--resolution`, `--eye-resolution`, `--feeler-bones`, `--feeler-scale`, `--feeler-visible`); también puedes agruparlo después de `--`. `--blend` y `--output` permiten usar rutas alternativas en una conversión puntual, y `--dry-run` enseña el comando sin ejecutarlo.

### Conversión a mano

También se puede lanzar Blender directamente:

```bash
blender -b tools/blender/models/pm0001_00.blend -P tools/blender/export_pm_glb.py
```

La salida se toma de `models.json`; también puedes pasarla a mano:

```bash
blender -b tools/blender/models/pm0001_00.blend -P tools/blender/export_pm_glb.py -- public/models/pm0001/pm0001_00.glb
```

Los `.blend` viven en `tools/blender/models/`.

Opciones del exportador: `--config` (JSON alternativo), `--resolution` (cuerpo, por defecto 1024), `--eye-resolution` (ojos, por defecto 512), `--feeler-bones`, `--feeler-scale` y `--feeler-visible`. Todas sobrescriben lo que haya en `models.json`.

En este equipo se usó Blender 5.2 LTS portable; el wrapper lo detecta sin configurar nada:

```powershell
& "$env:USERPROFILE\Downloads\BlenderPortable\App\Blender64\blender.exe" `
  -b tools/blender/models/pm0002_00.blend `
  -P tools/blender/export_pm_glb.py
```

### Configuración por modelo (`tools/blender/models.json`)

La clave es el nombre del `.blend` sin extensión (`pm0001_00`); también se acepta el prefijo del armature (`pm0001_00_00`). `defaults` se mezcla con la entrada del modelo:

| Clave | Qué hace |
| --- | --- |
| `blend` | Ruta del `.blend` (relativa a `tools/blender/` o a la raíz del repo). |
| `output` | Ruta del GLB (relativa a la raíz del repo). |
| `resolution` / `eyeResolution` | Tamaño del horneado del cuerpo / ojos. |
| `eyeMaterials` | Materiales que usan `eyeResolution`. |
| `uvWrapMaterials` | Materiales cuyas UV se envuelven con módulo 1 antes de hornear. |

pm0007 no usa el material `body_b` del default: su caparazón y su cola viven en `body_b_00` y `body_b_01` con UV en V 1..2, así que la entrada del modelo sustituye la lista por esos dos nombres.
| `feeler.bones` | Huesos raíz que se escalan para recoger las lianas (vacío = no tocar). |
| `feeler.hiddenScale` | Escala con la que se recogen. |
| `feeler.visibleClips` | Clips que se quedan a escala 1. |

### Lianas (`tuta`)

En pm0001 las lianas son `left_tuta_mesh_shape` / `right_tuta_mesh_shape`, skinneadas a las cadenas `feeler → left_feeler_01..10` y `feeler → right_feeler_01..10`. El juego las recoge escalando los huesos raíz a `0.154`; solo se sacan en el ataque a distancia. El `.blend` de origen no incluye esas curvas de escala, por eso el exportador las añade antes de exportar. La configuración concreta está en `models.pm0001_00.feeler` de `models.json`; si otro clip debe mostrar las lianas, se añade a `visibleClips`.

## Implementación

- `main.ts` crea el dispositivo con `pc.createGraphicsDevice` y una `pc.AppBase` con solo los sistemas necesarios (`Render`, `Camera`, `Light`, `Anim`).
- Cada GLB se descarga con `fetch` para mostrar progreso real, se carga como asset `container` desde un blob y se instancia con `instantiateRenderEntity`.
- Al cambiar de modelo se destruye la entidad anterior, se descarga su asset y se reconstruye la lista de clips; la cámara vuelve a los valores del modelo elegido.
- Cada clip se registra como un estado (`state_0`…`state_N`) y se cambia con `baseLayer.transition` para mezclar 160 ms.
- Los nombres de los clips se leen del JSON embebido del GLB, porque PlayCanvas bautiza los assets de animación con un GUID interno.
- El suelo es un `PlaneGeometry` de 60 × 60 con una textura radial procedural y niebla lineal para que el borde no se vea.
