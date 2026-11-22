"""
Exporta un modelo .blend de Pokémon (rip de .trmdl/.gfbanm) a un GLB listo
para PlayCanvas.

El .blend usa un grafo de materiales pensado para el shader del juego original
(albedo x AO, normales con la componente Z en el alfa, máscaras para los ojos).
El exportador glTF no entiende ese grafo, así que este script:

  1. Hornea el color base de cada material (albedo, AO y color de ojos) a una
     textura propia con Cycles. Los materiales con un nodo Emission conectado
     a la salida (por ejemplo, la llama de un Pokémon de fuego) se hornean por
     su color de emisión y se reconstruyen como emisivos.
  2. Reconstruye un Principled BSDF limpio con esa textura + el normal map.
  3. Añade la escala de las lianas cuando el modelo la necesita, porque las
     acciones importadas solo traen locación y rotación (ver models.json).
  4. Rellena con la pose de un clip de referencia los huesos que las demás
     acciones dejan en reposo (ver `basePose` en models.json).
  5. Exporta todos los actions del armature como animaciones glTF.

La configuración por modelo vive en tools/blender/models.json. La clave es el
nombre del .blend sin extensión (por ejemplo "pm0001_00"); también se acepta el
prefijo del armature ("pm0001_00_00"). El bloque "defaults" se mezcla con la
entrada del modelo.

Uso:
    pnpm convert:model                          # menú interactivo
    pnpm convert:model pm0001_00                # un modelo concreto

Uso directo (sin el wrapper de Node):
    blender -b tools/blender/models/pm0001_00.blend -P tools/blender/export_pm_glb.py
    blender -b tools/blender/models/pm0001_00.blend -P tools/blender/export_pm_glb.py -- <salida.glb>

Opciones (sobrescriben models.json):
    --config <ruta>       ruta del JSON de configuración
    --resolution 1024     resolución del horneado del cuerpo
    --eye-resolution 512  resolución del horneado de los ojos
    --feeler-bones a,b    huesos raíz de las lianas que se recogen
    --feeler-scale 0.154  escala con la que se recogen
    --feeler-visible a,b  clips en los que las lianas se quedan a escala 1
"""

import argparse
import json
import os
import sys
import tempfile

import bpy
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
DEFAULT_CONFIG = os.path.join(SCRIPT_DIR, "models.json")


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("output", nargs="?", help="Ruta del GLB de salida (por defecto, la de models.json)")
    parser.add_argument("--config", default=DEFAULT_CONFIG, help="JSON de configuración por modelo")
    parser.add_argument("--resolution", type=int)
    parser.add_argument("--eye-resolution", type=int)
    parser.add_argument("--feeler-bones")
    parser.add_argument("--feeler-scale", type=float)
    parser.add_argument("--feeler-visible")
    return parser.parse_args(argv)


def merge(base, override):
    """Mezcla recursiva de la configuración: defaults + entrada del modelo."""
    result = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = merge(result[key], value)
        else:
            result[key] = value
    return result


def select_armature(stem, requested):
    """Elige el armature a exportar.

    Algunos .blend traen varias formas del mismo Pokémon (por ejemplo Pikachu
    con sus disfraces). Se usa el armature indicado en la configuración o, si no
    hay, el primero cuyo prefijo encaje con el nombre del archivo.
    """
    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    if not armatures:
        return None

    if requested:
        for obj in armatures:
            if obj.name == requested or obj.name.split(".")[0] == requested:
                return obj
        raise RuntimeError(
            f"No se encontró el armature '{requested}'. Disponibles: {', '.join(obj.name for obj in armatures)}"
        )

    for obj in armatures:
        if obj.name.split(".")[0].startswith(stem):
            return obj
    return armatures[0]


def load_config(path):
    with open(path, encoding="utf-8") as handle:
        config = json.load(handle)

    stem = os.path.splitext(os.path.basename(bpy.data.filepath))[0]
    models = config.get("models", {})
    entry = models.get(stem)
    if entry is None:
        # La clave del armature puede no coincidir con el nombre del .blend.
        armature = next((obj for obj in bpy.data.objects if obj.type == "ARMATURE"), None)
        prefix = armature.name.split(".")[0] if armature else ""
        entry = models.get(prefix)
    if entry is None:
        print(f"[config] {stem}: sin entrada en {path}; se usan los defaults")
        entry = {}
    else:
        print(f"[config] {stem}: {', '.join(entry) or 'sin opciones'}")

    merged = merge(config.get("defaults", {}), entry)
    armature = select_armature(stem, merged.get("armature"))
    prefix = armature.name.split(".")[0] if armature else ""

    return merged, stem, prefix, armature


def find_node(material, node_type):
    return next((node for node in material.node_tree.nodes if node.type == node_type), None)


def material_source(material):
    """Devuelve el tipo de horneado y el socket que alimenta la superficie.

    La mayoría de materiales usan un Principled BSDF con el color base
    conectado; los materiales emisivos (por ejemplo, la llama de un Pokémon de
    fuego) llevan un nodo Emission directo al Material Output y se hornean por
    su color de emisión.
    """
    output = find_node(material, "OUTPUT_MATERIAL")
    if not output or not output.inputs["Surface"].is_linked:
        return None, None
    surface = output.inputs["Surface"].links[0].from_node
    if surface.type == "EMISSION" and surface.inputs["Color"].is_linked:
        return "emissive", surface.inputs["Color"].links[0].from_socket
    principled = find_node(material, "BSDF_PRINCIPLED")
    if principled and principled.inputs["Base Color"].is_linked:
        return "basecolor", principled.inputs["Base Color"].links[0].from_socket
    # Los modelos de Scarlet/Violet envuelven el shader en un grupo
    # (ScViShaderbyChicoEevee). Sus mezclas internas dependen de máscaras que no
    # siempre vienen conectadas en estos .blend, así que para los cuerpos se
    # hornea directamente el socket Albedo. Los ojos usan otro grupo con
    # reflejos y pupilas: ahí sí conviene hornear el color difuso completo.
    if surface.type == "GROUP":
        group_name = surface.node_tree.name if surface.node_tree else ""
        if "Eye" not in group_name:
            albedo = surface.inputs.get("Albedo")
            if albedo and albedo.is_linked:
                return "albedo", albedo.links[0].from_socket
        return "group", None
    return None, None


def collect_bake_materials():
    """Materiales usados por mallas que se pueden hornear con el grafo original."""
    materials = {}
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for material in obj.data.materials:
            if not material or material.name in materials:
                continue
            if not material.use_nodes:
                continue
            kind, socket = material_source(material)
            if not kind:
                print(f"[material] {material.name}: superficie sin color horneable, se omite")
                continue
            if kind == "emissive":
                print(f"[material] {material.name}: emisión")
            elif kind == "albedo":
                print(f"[material] {material.name}: shader ScVi (albedo)")
            elif kind == "group":
                print(f"[material] {material.name}: shader ScVi (grupo)")
            materials[material.name] = {"material": material, "kind": kind, "socket": socket}
    return materials


def prune_to_armature(armature):
    """Deja solo la forma elegida en los .blend con varios armatures.

    Pikachu, Scyther o Gyarados incluyen varias formas en el mismo archivo. Si
    se exportan todas, el GLB mezcla mallas y acciones de todas ellas.
    """
    target = armature.name
    kept_meshes = 0
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        rigs = [modifier.object.name for modifier in obj.modifiers if modifier.type == "ARMATURE" and modifier.object]
        if rigs and target not in rigs:
            bpy.data.objects.remove(obj, do_unlink=True)
        else:
            kept_meshes += 1

    target_prefix = target.split(".")[0]
    other_prefixes = [
        obj.name.split(".")[0]
        for obj in bpy.data.objects
        if obj.type == "ARMATURE" and obj.name != target
    ]
    other_prefixes = [prefix for prefix in other_prefixes if prefix != target_prefix]
    for obj in list(bpy.data.objects):
        if obj.type == "ARMATURE" and obj.name != target:
            bpy.data.objects.remove(obj, do_unlink=True)

    removed_actions = 0
    for action in list(bpy.data.actions):
        if any(action.name.startswith(f"{prefix}_") for prefix in other_prefixes):
            bpy.data.actions.remove(action)
            removed_actions += 1

    print(
        f"[rig] {target}: {kept_meshes} mallas, "
        f"{len(bpy.data.actions)} acciones ({removed_actions} de otras formas descartadas)"
    )


def bake_base_color(output_dir, sizes, materials):
    """Hornea el color base (o de emisión) de cada material a una imagen empaquetada."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.render.bake.margin = 12
    scene.render.bake.use_clear = True
    scene.render.bake.use_selected_to_active = False

    targets = {}
    for mat_name, size in sizes.items():
        mat = bpy.data.materials[mat_name]
        nt = mat.node_tree
        output = find_node(mat, "OUTPUT_MATERIAL")
        if not output:
            raise RuntimeError(f"{mat.name}: falta Material Output")

        kind = materials[mat_name]["kind"]
        source_socket = materials[mat_name]["socket"]
        suffix = "emissive" if kind == "emissive" else "basecolor"

        image = bpy.data.images.new(f"{mat.name}_{suffix}", width=size, height=size, alpha=False)
        image.colorspace_settings.name = "sRGB"

        bake_node = nt.nodes.new("ShaderNodeTexImage")
        bake_node.name = "BAKE_TARGET"
        bake_node.image = image
        bake_node.select = True
        nt.nodes.active = bake_node
        targets[mat_name] = bake_node

        # El grupo ScVi se hornea tal cual con el pase de color difuso; no se
        # sustituye por una emisión porque perdería los recoloreados internos.
        if kind != "group":
            emission = nt.nodes.new("ShaderNodeEmission")
            emission.name = "BAKE_EMISSION"
            nt.links.new(source_socket, emission.inputs["Color"])
            nt.links.new(emission.outputs["Emission"], output.inputs["Surface"])

    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    usable = [
        obj
        for obj in meshes
        if any(mat and mat.name in sizes for mat in obj.data.materials)
    ]

    # Las mallas que comparten materiales se hornean juntas: así cada textura
    # recibe todos sus objetos. Blender escribe cada ranura en su propia imagen
    # en una sola pasada, sin pisar las demás.
    parent = {obj.name: obj.name for obj in usable}

    def find(name):
        while parent[name] != name:
            parent[name] = parent[parent[name]]
            name = parent[name]
        return name

    for mat_name in sizes:
        users = [
            obj
            for obj in usable
            if any(mat and mat.name == mat_name for mat in obj.data.materials)
        ]
        for other in users[1:]:
            root_a, root_b = find(users[0].name), find(other.name)
            if root_a != root_b:
                parent[root_b] = root_a

    groups = {}
    for obj in usable:
        groups.setdefault(find(obj.name), []).append(obj)

    for objects in groups.values():
        names = {
            mat.name
            for obj in objects
            for mat in obj.data.materials
            if mat and mat.name in sizes
        }
        kinds = {materials[name]["kind"] for name in names}
        bake_type = "DIFFUSE" if "group" in kinds else "EMIT"
        if bake_type == "DIFFUSE" and kinds - {"group"}:
            raise RuntimeError(
                f"{', '.join(sorted(names))}: la malla mezcla el shader ScVi con "
                "materiales normales y no se pueden hornear juntos"
            )

        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]

        # Crear el nodo de emisión deja activo ese nodo: hay que reactivar el
        # nodo de imagen antes de hornear o Blender no encuentra el destino.
        for name in names:
            nt = bpy.data.materials[name].node_tree
            nt.nodes.active = targets[name]
            for node in nt.nodes:
                node.select = node == targets[name]

        print(f"[bake] {', '.join(sorted(names))}: {len(objects)} mallas…")
        if bake_type == "DIFFUSE":
            # Solo el color: sin luz directa ni indirecta, para que la textura
            # horneada sea el albedo del shader y no la iluminación de la escena.
            scene.render.bake.use_pass_direct = False
            scene.render.bake.use_pass_indirect = False
            scene.render.bake.use_pass_color = True
            bpy.ops.object.bake(type="DIFFUSE", margin=12, use_clear=True)
        else:
            bpy.ops.object.bake(type="EMIT", margin=12, use_clear=True)

    baked = {}
    for mat_name in sizes:
        image = targets[mat_name].image
        suffix = "emissive" if materials[mat_name]["kind"] == "emissive" else "basecolor"
        path = os.path.join(output_dir, f"{mat_name}_{suffix}.png")
        image.filepath_raw = path
        image.file_format = "PNG"
        image.save()
        image.pack()
        baked[mat_name] = {"image": image, "kind": materials[mat_name]["kind"]}
    return baked


def material_uv_out_of_range(material_name):
    """¿Alguna cara del material sale del atlas 0..1?"""
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        me = obj.data
        slot = next(
            (index for index, mat in enumerate(me.materials) if mat and mat.name == material_name),
            None,
        )
        layer = me.uv_layers.active
        if slot is None or layer is None:
            continue
        for poly in me.polygons:
            if poly.material_index != slot:
                continue
            for loop_index in poly.loop_indices:
                u, v = layer.data[loop_index].uv
                if u < 0.0 or u >= 1.0 or v < 0.0 or v >= 1.0:
                    return True
    return False


def wrap_uvs_for_material(material_name):
    """El juego muestrea estos atlas con REPEAT: si las UV salen de 0..1, se
    envuelven con módulo 1 para que el horneado y el GLB usen el mismo atlas.

    Hay que envolver U y V: los ojos de Onix viven en U 1..2 (el ojo izquierdo
    se horneaba negro porque el ráster de Blender lo escribía fuera de la
    imagen) y los cuerpos PMD reparten los materiales en bandas de V.

    Se envuelve la malla completa, no solo las caras del material indicado: una
    misma capa UV la comparten todos los materiales del objeto y el horneado de
    los demás también necesita coordenadas dentro de 0..1 (por ejemplo, en
    pm0002 la flor usa body_c en V 2..3 y body_b en V 1..2).
    """
    wrapped = 0
    objects = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        me = obj.data
        if not any(mat and mat.name == material_name for mat in me.materials):
            continue
        uv_layer = me.uv_layers.active
        if not uv_layer:
            continue
        objects += 1
        for datum in uv_layer.data:
            u, v = datum.uv
            if u < 0.0 or u >= 1.0 or v < 0.0 or v >= 1.0:
                datum.uv = (u % 1.0, v % 1.0)
                wrapped += 1
    print(f"[uv] {material_name}: {objects} objetos, {wrapped} bucles UV envueltos a 0..1")


def find_normal_image(material):
    """Localiza la textura de normales del grafo original por su sufijo _nrm."""
    return next(
        (
            node.image
            for node in material.node_tree.nodes
            if node.type == "TEX_IMAGE" and node.image and "_nrm" in node.image.name.lower()
        ),
        None,
    )


def build_normal_map(source, target_name, output_dir):
    """glTF espera la normal en RGB; el original guarda la Z en el alfa."""
    if source is None:
        return None

    width, height = source.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    source.pixels.foreach_get(pixels)
    pixels = pixels.reshape(-1, 4)

    # La imagen original es non-color: R y G son X/Y, el alfa es Z.
    result = np.empty_like(pixels)
    result[:, 0] = pixels[:, 0]
    result[:, 1] = pixels[:, 1]
    result[:, 2] = pixels[:, 3]
    result[:, 3] = 1.0

    image = bpy.data.images.new(target_name, width=width, height=height, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(result.ravel())
    path = os.path.join(output_dir, f"{target_name}.png")
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    image.pack()
    print(f"[normal] {source.name} -> {target_name} ({width}x{height})")
    return image


def rebuild_materials(baked, output_dir):
    for mat_name, entry in baked.items():
        base_image = entry["image"]
        kind = entry["kind"]
        mat = bpy.data.materials[mat_name]
        normal_source = find_normal_image(mat)

        nt = mat.node_tree
        nt.nodes.clear()

        output = nt.nodes.new("ShaderNodeOutputMaterial")
        output.location = (420, 0)
        principled = nt.nodes.new("ShaderNodeBsdfPrincipled")
        principled.location = (100, 0)
        principled.inputs["Roughness"].default_value = 0.72
        principled.inputs["Metallic"].default_value = 0.0
        nt.links.new(principled.outputs["BSDF"], output.inputs["Surface"])

        base_node = nt.nodes.new("ShaderNodeTexImage")
        base_node.name = "Base Color"
        base_node.image = base_image
        base_node.location = (-420, 160)
        if kind == "emissive":
            # Un material emisivo no depende de la luz: el color va al canal
            # de emisión y la base queda negra, como en el shader original.
            principled.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
            principled.inputs["Emission Strength"].default_value = 1.0
            nt.links.new(base_node.outputs["Color"], principled.inputs["Emission Color"])
        else:
            nt.links.new(base_node.outputs["Color"], principled.inputs["Base Color"])

        normal_image = build_normal_map(normal_source, f"{mat_name}_normal", output_dir)
        if normal_image:
            normal_node = nt.nodes.new("ShaderNodeTexImage")
            normal_node.name = "Normal Map"
            normal_node.image = normal_image
            normal_node.location = (-420, -180)
            normal_map = nt.nodes.new("ShaderNodeNormalMap")
            normal_map.location = (-140, -180)
            nt.links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
            nt.links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])

        mat.use_backface_culling = True
        suffix = " (emisión)" if kind == "emissive" else ""
        print(f"[material] {mat_name}: reconstruido{suffix}")


def rename_actions(prefix):
    """Quita el prefijo y el sufijo del exportador para que el GLB sea legible."""
    for action in bpy.data.actions:
        original = action.name
        name = original.removesuffix(".gfbanm").removeprefix(f"{prefix}_")
        action.name = name
        print(f"[action] {original} -> {name}")


def action_fcurves(action):
    """Fcurves de la acción, compatible con acciones legacy y por capas (5.x)."""
    if hasattr(action, "fcurves"):
        return action.fcurves
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                return channelbag.fcurves
    raise RuntimeError(f"{action.name}: no se encontró ningún channelbag")


def bone_name(data_path):
    """Nombre del hueso de un `data_path` de pose, o `None` si no lo es."""
    if not data_path.startswith("pose.bones"):
        return None
    start = data_path.find('"')
    end = data_path.find('"', start + 1)
    return data_path[start + 1 : end] if start != -1 and end != -1 else None


def is_rest_curve(fcurve):
    """¿La curva mantiene el valor de reposo del hueso en todos sus keys?"""
    path = fcurve.data_path
    if path.endswith(".rotation_quaternion"):
        rest = 1.0 if fcurve.array_index == 3 else 0.0
    elif path.endswith(".scale"):
        rest = 1.0
    else:
        rest = 0.0
    return all(abs(key.co[1] - rest) <= 1e-5 for key in fcurve.keyframe_points)


def apply_base_pose(source_clip, bone_prefixes):
    """Copia la pose de un clip a los huesos que quedan en reposo en las demás.

    Algunos `.gfbanm` (por ejemplo, la cola de Suicune) solo posan ciertos
    huesos en la animación de espera. El resto de acciones los deja en la pose
    de reposo del armature, que no coincide con la pose "natural" del modelo y
    se ve rígida. Para esos huesos se escriben keys constantes con la pose del
    clip de referencia; si la acción ya los anima (o los deja en una pose
    deliberada distinta de la de reposo), no se toca nada.
    """
    if not bone_prefixes:
        return

    source = next(
        (
            action
            for action in bpy.data.actions
            if action.name == source_clip or source_clip in action.name
        ),
        None,
    )
    if source is None:
        print(f"[pose] aviso: no se encontró el clip de referencia {source_clip}")
        return

    source_start = source.frame_range[0]
    pose = {}
    for fcurve in action_fcurves(source):
        bone = bone_name(fcurve.data_path)
        if bone is None or not any(bone.startswith(prefix) for prefix in bone_prefixes):
            continue
        pose.setdefault(bone, []).append(
            (fcurve.data_path, fcurve.array_index, fcurve.evaluate(source_start))
        )

    if not pose:
        print(f"[pose] {source_clip}: sin curvas para {', '.join(bone_prefixes)}")
        return

    for action in bpy.data.actions:
        if action is source:
            continue

        fcurves = action_fcurves(action)
        start, end = action.frame_range
        injected = []

        for bone, entries in pose.items():
            prefix = f'pose.bones["{bone}"]'
            existing = [fcurve for fcurve in fcurves if fcurve.data_path.startswith(prefix)]
            # Si la acción ya posee el hueso (aunque sea con una pose estática
            # distinta de la de reposo), se respeta tal cual.
            if existing and not all(is_rest_curve(fcurve) for fcurve in existing):
                continue

            for fcurve in existing:
                fcurves.remove(fcurve)
            for path, index, value in entries:
                fcurve = fcurves.new(path, index=index)
                for frame in (start, end):
                    keyframe = fcurve.keyframe_points.insert(frame, value)
                    keyframe.interpolation = "LINEAR"
                fcurve.update()
            injected.append(bone)

        if injected:
            print(f"[pose] {action.name}: {len(injected)} huesos con la pose de {source.name}")


def add_feeler_scale_keys(bones, hidden_scale, visible_clips):
    """Añade curvas de escala a las raíces de las lianas en todas las acciones."""
    bones = [bone for bone in bones if bone]
    if not bones:
        print("[feeler] sin huesos configurados: no se añaden curvas de escala")
        return

    armature = next((obj for obj in bpy.data.objects if obj.type == "ARMATURE"), None)
    valid = [bone for bone in bones if armature and bone in armature.pose.bones]
    missing = [bone for bone in bones if bone not in valid]
    if missing:
        print(f"[feeler] aviso: huesos inexistentes {missing}")
    if not valid:
        return

    for action in bpy.data.actions:
        visible = any(clip in action.name for clip in visible_clips)
        value = 1.0 if visible else hidden_scale
        fcurves = action_fcurves(action)
        start, end = action.frame_range

        for bone in valid:
            path = f'pose.bones["{bone}"].scale'
            for index in range(3):
                existing = fcurves.find(path, index=index)
                if existing is not None:
                    fcurves.remove(existing)
                fcurve = fcurves.new(path, index=index)
                for frame in (start, end):
                    keyframe = fcurve.keyframe_points.insert(frame, value)
                    keyframe.interpolation = "LINEAR"
                fcurve.update()

        print(f"[feeler] {action.name}: escala {value:.3f}")


def parse_list(value):
    return [item.strip() for item in value.split(",") if item.strip()]


def main():
    args = parse_args()
    config, stem, prefix, armature = load_config(args.config)
    if armature is None:
        raise RuntimeError("No se encontró ningún armature en el .blend")

    prune_to_armature(armature)

    output = args.output or config.get("output")
    if not output:
        raise SystemExit("Falta la ruta de salida: pásala como argumento o define 'output' en models.json")
    if args.output:
        output = os.path.abspath(output)
    elif not os.path.isabs(output):
        output = os.path.join(REPO_ROOT, output)
    output = os.path.abspath(output)
    os.makedirs(os.path.dirname(output), exist_ok=True)

    resolution = args.resolution if args.resolution is not None else int(config.get("resolution", 1024))
    eye_resolution = (
        args.eye_resolution if args.eye_resolution is not None else int(config.get("eyeResolution", 512))
    )
    eye_materials = set(config.get("eyeMaterials", []))
    uv_wrap_materials = config.get("uvWrapMaterials", [])

    materials = collect_bake_materials()
    if not materials:
        raise RuntimeError("No se encontró ningún material horneable")
    sizes = {name: eye_resolution if name in eye_materials else resolution for name in materials}

    print(f"[modelo] {stem} (prefijo {prefix}) → {output}")
    print(f"[bake] materiales: {', '.join(sizes)}")

    for material_name in uv_wrap_materials:
        if material_name in materials:
            wrap_uvs_for_material(material_name)
        else:
            print(f"[uv] {material_name}: el modelo no lo usa, se omite")

    # El atlas original usa REPEAT y reparte los materiales en bandas de V
    # (cuerpo 0..1, alas 1..2, cola 2..3, ojos 3..4). Si se hornea con UV fuera
    # de 0..1, la textura sale negra; se envuelven todas las que lo necesiten.
    for material_name in materials:
        if material_uv_out_of_range(material_name):
            wrap_uvs_for_material(material_name)

    temp_dir = tempfile.mkdtemp(prefix=f"{stem}_bake_")
    baked = bake_base_color(temp_dir, sizes, materials)
    rebuild_materials(baked, temp_dir)
    rename_actions(prefix)

    base_pose = config.get("basePose", {})
    apply_base_pose(base_pose.get("clip", ""), list(base_pose.get("bones", [])))

    feeler = config.get("feeler", {})
    bones = parse_list(args.feeler_bones) if args.feeler_bones is not None else list(feeler.get("bones", []))
    hidden_scale = (
        args.feeler_scale if args.feeler_scale is not None else float(feeler.get("hiddenScale", 0.154057))
    )
    visible_clips = (
        parse_list(args.feeler_visible) if args.feeler_visible is not None else list(feeler.get("visibleClips", []))
    )
    add_feeler_scale_keys(bones, hidden_scale, visible_clips)

    # Las cámaras/luces del .blend están en colecciones vacías; se exporta solo
    # la jerarquía del modelo por claridad.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.type in {"ARMATURE", "MESH"}:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = armature

    print("[gltf] exportando…")
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_image_quality=92,
        export_unused_images=False,
        export_unused_textures=False,
        export_animations=True,
        export_animation_mode="BROADCAST",
        export_anim_single_armature=True,
        export_anim_slide_to_zero=True,
        export_force_sampling=True,
        export_frame_step=1,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True,
        export_reset_pose_bones=True,
        export_current_frame=False,
        export_rest_position_armature=True,
        export_skins=True,
        export_influence_nb=4,
        export_all_influences=False,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
    )
    size_mb = os.path.getsize(output) / (1024 * 1024)
    print(f"[ok] {output} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
