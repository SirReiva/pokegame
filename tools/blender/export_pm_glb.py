"""
Exporta un modelo .blend de Pokémon (rip de .trmdl/.gfbanm) a un GLB listo
para PlayCanvas.

El .blend usa un grafo de materiales pensado para el shader del juego original
(albedo x AO, normales con la componente Z en el alfa, máscaras para los ojos).
El exportador glTF no entiende ese grafo, así que este script:

  1. Hornea el color base de cada material (albedo, AO y color de ojos) a una
     textura propia con Cycles.
  2. Reconstruye un Principled BSDF limpio con esa textura + el normal map.
  3. Añade la escala de las lianas cuando el modelo la necesita, porque las
     acciones importadas solo traen locación y rotación (ver models.json).
  4. Exporta todos los actions del armature como animaciones glTF.

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


def load_config(path):
    with open(path, encoding="utf-8") as handle:
        config = json.load(handle)

    stem = os.path.splitext(os.path.basename(bpy.data.filepath))[0]
    armature = next((obj for obj in bpy.data.objects if obj.type == "ARMATURE"), None)
    prefix = armature.name.split(".")[0] if armature else ""

    models = config.get("models", {})
    entry = models.get(stem) or models.get(prefix)
    if entry is None:
        print(f"[config] {stem}: sin entrada en {path}; se usan los defaults")
        entry = {}
    else:
        print(f"[config] {stem}: {', '.join(entry) or 'sin opciones'}")

    return merge(config.get("defaults", {}), entry), stem, prefix, armature


def find_node(material, node_type):
    return next((node for node in material.node_tree.nodes if node.type == node_type), None)


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
            principled = find_node(material, "BSDF_PRINCIPLED")
            output = find_node(material, "OUTPUT_MATERIAL")
            if not principled or not output:
                print(f"[material] {material.name}: sin Principled/Output, se omite")
                continue
            if not principled.inputs["Base Color"].is_linked:
                print(f"[material] {material.name}: Base Color sin conectar, se omite")
                continue
            materials[material.name] = material
    return materials


def bake_base_color(output_dir, sizes):
    """Hornea la salida de Base Color de cada material a una imagen empaquetada."""
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
        principled = find_node(mat, "BSDF_PRINCIPLED")
        output = find_node(mat, "OUTPUT_MATERIAL")
        if not principled or not output:
            raise RuntimeError(f"{mat.name}: falta Principled BSDF o Material Output")

        source_link = principled.inputs["Base Color"].links[0]
        source_socket = source_link.from_socket

        image = bpy.data.images.new(f"{mat.name}_basecolor", width=size, height=size, alpha=False)
        image.colorspace_settings.name = "sRGB"

        bake_node = nt.nodes.new("ShaderNodeTexImage")
        bake_node.name = "BAKE_TARGET"
        bake_node.image = image
        bake_node.select = True
        nt.nodes.active = bake_node
        targets[mat_name] = bake_node

        emission = nt.nodes.new("ShaderNodeEmission")
        emission.name = "BAKE_EMISSION"
        nt.links.new(source_socket, emission.inputs["Color"])
        nt.links.new(emission.outputs["Emission"], output.inputs["Surface"])

    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    baked = {}
    for mat_name, size in sizes.items():
        mat = bpy.data.materials[mat_name]
        objects = [obj for obj in meshes if mat.name in [slot.name for slot in obj.data.materials if slot]]
        if not objects:
            raise RuntimeError(f"{mat.name}: ningún objeto usa este material")

        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]

        # Crear el nodo de emisión deja activo ese nodo: hay que reactivar el
        # nodo de imagen antes de hornear o Blender no encuentra el destino.
        nt = mat.node_tree
        nt.nodes.active = targets[mat_name]
        for node in nt.nodes:
            node.select = node == targets[mat_name]

        print(f"[bake] {mat.name}: {len(objects)} objetos, {size}x{size}…")
        bpy.ops.object.bake(type="EMIT", margin=12, use_clear=True)

        image = targets[mat_name].image
        path = os.path.join(output_dir, f"{mat.name}_basecolor.png")
        image.filepath_raw = path
        image.file_format = "PNG"
        image.save()
        image.pack()
        baked[mat.name] = image
    return baked


def wrap_uvs_for_material(material_name):
    """El juego muestrea estos atlas con REPEAT: si las UV salen de 0..1, se
    envuelven con módulo 1 para que el horneado y el GLB usen el mismo atlas.

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
            if v < 0.0 or v >= 1.0:
                datum.uv = (u, v % 1.0)
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
    for mat_name, base_image in baked.items():
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
        print(f"[material] {mat_name}: reconstruido")


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

    temp_dir = tempfile.mkdtemp(prefix=f"{stem}_bake_")
    baked = bake_base_color(temp_dir, sizes)
    rebuild_materials(baked, temp_dir)
    rename_actions(prefix)

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
