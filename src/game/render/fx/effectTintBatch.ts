/**
 * Lote instanciado para mallas emisivas con **color y alfa por instancia**.
 *
 * `EffectBatch` reutiliza el `StandardMaterial` del efecto, así que todas sus
 * instancias comparten color y opacidad. Eso deja fuera las capas que mezclan
 * varios tonos en el mismo efecto (cuerpo/núcleo/halo de un haz, arcos de golpe
 * con brillos distintos, decoración de proyectiles…). Este lote usa un
 * `ShaderMaterial` propio, sin iluminación, y guarda el tinte en el buffer de
 * instancias; la animación sigue saliendo del mismo banco de `MOTION_*` que
 * usa `EffectBatch`, con su gemelo WGSL.
 */

import * as pc from 'playcanvas';
import {
  EFFECT_SHADER_COMMON,
  EFFECT_SHADER_COMMON_WGSL,
  effectMotionWgsl
} from '../../effectBatch';

const ATTR_ANIM0 = pc.SEMANTIC_ATTR13;
const ATTR_ANIM1 = pc.SEMANTIC_ATTR10;
const ATTR_ANIM2 = pc.SEMANTIC_ATTR9;
const ATTR_TINT = pc.SEMANTIC_ATTR8;
const ATTR_FADE = pc.SEMANTIC_ATTR7;

const FLOATS_PER_INSTANCE = 16 + 4 + 4 + 4 + 4 + 4;

/** Sin la declaración de atributo del material estándar: aquí la pone el lote. */
const COMMON_GLSL = EFFECT_SHADER_COMMON.replace(
  /^attribute vec4 vertex_position;\r?\n/m,
  ''
);
const COMMON_WGSL = EFFECT_SHADER_COMMON_WGSL.replace(
  /^attribute vertex_position: vec4f;\r?\n/m,
  ''
);

const FRAGMENT_COMMON_GLSL = `
uniform vec3 uFogColor;

varying vec4 vTint;
varying float vFog;

vec3 linearToSrgb(vec3 color) {
  vec3 x = max(color, vec3(0.0));
  vec3 hi = 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055;
  vec3 lo = x * 12.92;
  return mix(hi, lo, lessThanEqual(x, vec3(0.0031308)));
}
`;

const FRAGMENT_GLSL = `${FRAGMENT_COMMON_GLSL}
void main(void) {
  if (vTint.a < 0.004) discard;
  vec3 rgb = mix(vTint.rgb, uFogColor, vFog);
  gl_FragColor = vec4(linearToSrgb(rgb), vTint.a);
}
`;

const TEXTURED_FRAGMENT_GLSL = `${FRAGMENT_COMMON_GLSL}
uniform sampler2D uMap;
varying vec2 vUv;

void main(void) {
  vec4 tex = texture2D(uMap, vUv);
  vec3 rgb = mix(tex.rgb * vTint.rgb, uFogColor, vFog);
  float alpha = tex.a * vTint.a;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(linearToSrgb(rgb), alpha);
}
`;

const FRAGMENT_COMMON_WGSL = `
uniform uFogColor: vec3f;

varying vTint: vec4f;
varying vFog: f32;

fn linearToSrgb(color: vec3f) -> vec3f {
  let x = max(color, vec3f(0.0));
  let hi = 1.055 * pow(x, vec3f(1.0 / 2.4)) - 0.055;
  let lo = x * 12.92;
  return select(hi, lo, x <= vec3f(0.0031308));
}
`;

const FRAGMENT_WGSL = `${FRAGMENT_COMMON_WGSL}
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  if (vTint.a < 0.004) {
    discard;
  }
  let rgb = mix(vTint.rgb, uniform.uFogColor, vFog);
  output.color = vec4f(linearToSrgb(rgb), vTint.a);
  return output;
}
`;

const TEXTURED_FRAGMENT_WGSL = `${FRAGMENT_COMMON_WGSL}
varying vUv: vec2f;
var uMap: texture_2d<f32>;
var uMap_sampler: sampler;

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  let tex = textureSample(uMap, uMap_sampler, vUv);
  let rgb = mix(tex.rgb * vTint.rgb, uniform.uFogColor, vFog);
  let alpha = tex.a * vTint.a;
  if (alpha < 0.004) {
    discard;
  }
  output.color = vec4f(linearToSrgb(rgb), alpha);
  return output;
}
`;


const VERTEX_ATTRIBUTES = `
attribute vec3 aPosition;
attribute vec4 instance_line1;
attribute vec4 instance_line2;
attribute vec4 instance_line3;
attribute vec4 instance_line4;
attribute vec4 instance_anim0;
attribute vec4 instance_anim1;
attribute vec4 instance_anim2;
attribute vec4 instance_fade;
attribute vec4 instance_tint;

uniform mat4 matrix_view;
uniform float uFogStart;
uniform float uFogEnd;

varying vec4 vTint;
varying float vFog;
`;

const VERTEX_ATTRIBUTES_WGSL = `
attribute aPosition: vec3f;
attribute instance_line1: vec4f;
attribute instance_line2: vec4f;
attribute instance_line3: vec4f;
attribute instance_line4: vec4f;
attribute instance_anim0: vec4f;
attribute instance_anim1: vec4f;
attribute instance_anim2: vec4f;
attribute instance_fade: vec4f;
attribute instance_tint: vec4f;

uniform matrix_model: mat4x4f;
uniform matrix_view: mat4x4f;
uniform uFogStart: f32;
uniform uFogEnd: f32;

varying vTint: vec4f;
varying vFog: f32;
`;

function buildVertexGLSL(motion: string, textured: boolean): string {
  return `${VERTEX_ATTRIBUTES}
${textured ? 'attribute vec2 aUv0;\nvarying vec2 vUv;' : ''}
${COMMON_GLSL}
${motion}

void main(void) {
  mat4 base = mat4(instance_line1, instance_line2, instance_line3, instance_line4);
  mat4 model = matrix_model * effectModel(base, instance_anim0, instance_anim1);
  vec3 local = effectLocalPosition(aPosition, instance_anim0, instance_anim1);
  vec4 world = model * vec4(local, 1.0);
  vec4 view = matrix_view * world;
  gl_Position = matrix_viewProjection * world;
  ${textured ? 'vUv = aUv0;' : ''}
  float age = uEffectTime - instance_fade.x;
  float fade = 0.0;
  if (age > 0.0) {
    float up = smoothstep(0.0, max(instance_fade.y, 0.0001), age);
    float down = 1.0 - smoothstep(
      instance_fade.z,
      instance_fade.z + max(instance_fade.w, 0.0001),
      age
    );
    fade = max(0.0, up * down);
  }
  vTint = vec4(
    instance_tint.rgb,
    instance_tint.a * uEffectOpacity * fade
  );
  vFog = clamp(
    (-view.z - uFogStart) / max(uFogEnd - uFogStart, 0.001),
    0.0,
    1.0
  );
}
`;
}

function buildVertexWGSL(motion: string, textured: boolean): string {
  return `${VERTEX_ATTRIBUTES_WGSL}
${textured ? 'attribute aUv0: vec2f;\nvarying vUv: vec2f;' : ''}
${COMMON_WGSL}
${motion}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let base = mat4x4f(instance_line1, instance_line2, instance_line3, instance_line4);
  let model = uniform.matrix_model * effectModel(base, instance_anim0, instance_anim1);
  let local = effectLocalPosition(aPosition, instance_anim0, instance_anim1);
  let world = model * vec4f(local, 1.0);
  let view = uniform.matrix_view * world;
  output.position = uniform.matrix_viewProjection * world;
  ${textured ? 'output.vUv = aUv0;' : ''}
  let age = uniform.uEffectTime - instance_fade.x;
  var fade = 0.0;
  if (age > 0.0) {
    let up = smoothstep(0.0, max(instance_fade.y, 0.0001), age);
    let down = 1.0 - smoothstep(
      instance_fade.z,
      instance_fade.z + max(instance_fade.w, 0.0001),
      age
    );
    fade = max(0.0, up * down);
  }
  output.vTint = vec4f(
    instance_tint.rgb,
    instance_tint.a * uniform.uEffectOpacity * fade
  );
  output.vFog = clamp(
    (-view.z - uniform.uFogStart) / max(uniform.uFogEnd - uniform.uFogStart, 0.001),
    0.0,
    1.0
  );
  return output;
}
`;
}

/** Datos de una instancia. `color` va en 0-255, como el resto de efectos. */
export interface TintEffectInstance {
  x?: number;
  y?: number;
  z?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  /** Rotación en grados, igual que `Entity.setLocalEulerAngles`. */
  rx?: number;
  ry?: number;
  rz?: number;
  anim0?: readonly [number, number, number, number];
  anim1?: readonly [number, number, number, number];
  anim2?: readonly [number, number, number, number];
  /** Ventana de alfa: `[nacimiento, subida, meseta, caída]` en segundos. */
  fade?: readonly [number, number, number, number];
  color?: readonly [number, number, number];
  alpha?: number;
}

export interface TintEffectBatchOptions {
  app: pc.AppBase;
  parent: pc.Entity;
  mesh: pc.Mesh;
  instances: readonly TintEffectInstance[];
  /** Código GLSL que define `effectModel` y `effectLocalPosition`. */
  motion: string;
  /** `true` para mezcla aditiva; por defecto, mezcla normal. */
  additive?: boolean;
  /** Textura opcional (llamas, hojas) muestreada con las UV de la malla. */
  texture?: pc.Texture;
  /** Multiplicador de color para igualar el brillo del material original. */
  intensity?: number;
  radius?: number;
  life?: number;
  params?: readonly [number, number, number, number];
  /** Centro de la caja de culling, relativo al padre. */
  boundsCenter?: readonly [number, number, number];
  /** Semiejes de la caja de culling. */
  boundsHalf?: readonly [number, number, number];
}

const instanceFormats = new WeakMap<pc.GraphicsDevice, pc.VertexFormat>();

function getInstanceFormat(device: pc.GraphicsDevice): pc.VertexFormat {
  let format = instanceFormats.get(device);
  if (format) return format;
  format = new pc.VertexFormat(device, [
    { semantic: pc.SEMANTIC_ATTR11, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR12, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR14, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR15, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: ATTR_ANIM0, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: ATTR_ANIM1, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: ATTR_ANIM2, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: ATTR_FADE, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: ATTR_TINT, components: 4, type: pc.TYPE_FLOAT32 }
  ]);
  instanceFormats.set(device, format);
  return format;
}

let nextSeed = 0x2c1b3d5f;

export class EffectTintBatch {
  readonly entity: pc.Entity;
  readonly material: pc.ShaderMaterial;
  private readonly buffer: pc.VertexBuffer | null;

  constructor(options: TintEffectBatchOptions) {
    const { app, parent, mesh, instances, motion } = options;
    const device = app.graphicsDevice;
    const count = instances.length;
    if (count === 0) {
      this.entity = new pc.Entity('tint-effect-batch-empty');
      this.material = new pc.ShaderMaterial();
      this.buffer = null;
      return;
    }

    const data = new Float32Array(count * FLOATS_PER_INSTANCE);
    const position = new pc.Vec3();
    const rotation = new pc.Quat();
    const scale = new pc.Vec3();
    const matrix = new pc.Mat4();

    for (let index = 0; index < count; index++) {
      const instance = instances[index];
      const offset = index * FLOATS_PER_INSTANCE;
      position.set(instance.x ?? 0, instance.y ?? 0, instance.z ?? 0);
      rotation.setFromEulerAngles(
        instance.rx ?? 0,
        instance.ry ?? 0,
        instance.rz ?? 0
      );
      scale.set(instance.sx ?? 1, instance.sy ?? 1, instance.sz ?? 1);
      matrix.setTRS(position, rotation, scale);
      data.set(matrix.data, offset);

      const anim0 = instance.anim0 ?? [0, 0, 0, 0];
      const anim1 = instance.anim1 ?? [0, 0, 0, 0];
      const anim2 = instance.anim2 ?? [0, 0, 0, 0];
      data[offset + 16] = anim0[0];
      data[offset + 17] = anim0[1];
      data[offset + 18] = anim0[2];
      data[offset + 19] = anim0[3];
      data[offset + 20] = anim1[0];
      data[offset + 21] = anim1[1];
      data[offset + 22] = anim1[2];
      data[offset + 23] = anim1[3];
      data[offset + 24] = anim2[0];
      data[offset + 25] = anim2[1];
      data[offset + 26] = anim2[2];
      data[offset + 27] = anim2[3];

      const fade = instance.fade ?? [-1, 0.001, 1e6, 0.001];
      data[offset + 28] = fade[0];
      data[offset + 29] = fade[1];
      data[offset + 30] = fade[2];
      data[offset + 31] = fade[3];

      const color = instance.color ?? [255, 255, 255];
      const intensity = options.intensity ?? 1;
      data[offset + 32] = (color[0] / 255) * intensity;
      data[offset + 33] = (color[1] / 255) * intensity;
      data[offset + 34] = (color[2] / 255) * intensity;
      data[offset + 35] = instance.alpha ?? 1;
    }

    this.buffer = new pc.VertexBuffer(device, getInstanceFormat(device), count, {
      data,
      usage: pc.BUFFER_STATIC
    });

    const wgslMotion = effectMotionWgsl(motion);
    if (!wgslMotion) {
      console.error(
        'Lote de tinte sin versión WGSL; en WebGPU no se animará. Añade el movimiento a effectMotionsWGSL.ts.'
      );
    }
    const textured = !!options.texture;

    const material = new pc.ShaderMaterial({
      uniqueName: `tint-effect-${nextSeed++}`,
      vertexGLSL: buildVertexGLSL(motion, textured),
      fragmentGLSL: textured ? TEXTURED_FRAGMENT_GLSL : FRAGMENT_GLSL,
      vertexWGSL: wgslMotion
        ? buildVertexWGSL(wgslMotion, textured)
        : buildVertexWGSL(motion, textured),
      fragmentWGSL: textured ? TEXTURED_FRAGMENT_WGSL : FRAGMENT_WGSL,
      attributes: {
        aPosition: pc.SEMANTIC_POSITION,
        ...(textured ? { aUv0: pc.SEMANTIC_TEXCOORD0 } : {}),
        instance_line1: pc.SEMANTIC_ATTR11,
        instance_line2: pc.SEMANTIC_ATTR12,
        instance_line3: pc.SEMANTIC_ATTR14,
        instance_line4: pc.SEMANTIC_ATTR15,
        instance_anim0: ATTR_ANIM0,
        instance_anim1: ATTR_ANIM1,
        instance_anim2: ATTR_ANIM2,
        instance_fade: ATTR_FADE,
        instance_tint: ATTR_TINT
      }
    });
    material.blendType = options.additive
      ? pc.BLEND_ADDITIVEALPHA
      : pc.BLEND_NORMAL;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = pc.CULLFACE_NONE;
    if (options.texture) material.setParameter('uMap', options.texture);
    material.setParameter('uEffectTime', 0);
    material.setParameter('uEffectLife', options.life ?? 1);
    material.setParameter('uEffectOpacity', 1);
    material.setParameter('uEffectRadius', options.radius ?? 1);
    const params = options.params ?? [0, 0, 0, 0];
    material.setParameter('uEffectParam0', params[0]);
    material.setParameter('uEffectParam1', params[1]);
    material.setParameter('uEffectParam2', params[2]);
    material.setParameter('uEffectParam3', params[3]);
    const fog = app.scene.fog;
    material.setParameter('uFogStart', fog.start);
    material.setParameter('uFogEnd', fog.end);
    material.setParameter(
      'uFogColor',
      new Float32Array([fog.color.r, fog.color.g, fog.color.b])
    );
    material.update();

    const instance = new pc.MeshInstance(mesh, material);
    instance.castShadows = false;
    instance.receiveShadows = false;
    instance.setInstancing(this.buffer, false);

    const entity = new pc.Entity('tint-effect-batch');
    entity.addComponent('render');
    const render = entity.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    render.meshInstances = [instance];

    const meshHalf = mesh.aabb.halfExtents;
    let halfX = options.boundsHalf?.[0] ?? 0;
    let halfY = options.boundsHalf?.[1] ?? 0;
    let halfZ = options.boundsHalf?.[2] ?? 0;
    if (!options.boundsHalf) {
      for (const item of instances) {
        halfX = Math.max(halfX, Math.abs(item.x ?? 0) + (item.sx ?? 1) * meshHalf.x);
        halfY = Math.max(halfY, Math.abs(item.y ?? 0) + (item.sy ?? 1) * meshHalf.y);
        halfZ = Math.max(halfZ, Math.abs(item.z ?? 0) + (item.sz ?? 1) * meshHalf.z);
      }
      halfX += options.radius ?? 1;
      halfY += options.radius ?? 1;
      halfZ += options.radius ?? 1;
    }
    const center = options.boundsCenter ?? [0, 0, 0];
    render.customAabb = new pc.BoundingBox(
      new pc.Vec3(center[0], center[1], center[2]),
      new pc.Vec3(Math.max(0.5, halfX), Math.max(0.5, halfY), Math.max(0.5, halfZ))
    );
    parent.addChild(entity);

    this.entity = entity;
    this.material = material;
    entity.on('destroy', () => {
      this.buffer?.destroy();
      material.destroy();
    });
  }

  setTime(time: number): void {
    this.material.setParameter('uEffectTime', time);
  }

  /** Multiplicador global de alfa; las instancias conservan su alfa base. */
  setOpacity(opacity: number): void {
    this.material.setParameter('uEffectOpacity', opacity);
  }

  setRadius(radius: number): void {
    this.material.setParameter('uEffectRadius', radius);
  }

  setParams(a: number, b: number, c: number, d: number): void {
    this.material.setParameter('uEffectParam0', a);
    this.material.setParameter('uEffectParam1', b);
    this.material.setParameter('uEffectParam2', c);
    this.material.setParameter('uEffectParam3', d);
  }
}
