/**
 * Lotes de efectos dibujados con GPU Instancing.
 *
 * La animación de cada instancia vive en el vertex shader: la CPU solo escribe
 * una vez la matriz base y los parámetros de fase. Así un enjambre de hojas,
 * nubes o llamas se dibuja con un único draw call por material y no necesita
 * recorrer entidades cada frame.
 *
 * El patrón es el mismo que usa la hierba de `world.ts`: un `VertexBuffer` con
 * el formato de instancing y un chunk `transformCoreVS` propio. La diferencia
 * es que aquí cada lote lleva dos atributos extra (`instance_anim0` e
 * `instance_anim1`) para guardar fase, velocidad, tamaño y demás datos de la
 * animación procedural.
 */

import * as pc from 'playcanvas';

const ATTR_ANIM0 = pc.SEMANTIC_ATTR13;
const ATTR_ANIM1 = pc.SEMANTIC_ATTR10;

/** Datos de una instancia. Las componentes no indicadas usan su valor neutro. */
export interface EffectBatchInstance {
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
}

export interface EffectBatchOptions {
  app: pc.Application;
  parent: pc.Entity;
  mesh: pc.Mesh;
  material: pc.StandardMaterial;
  instances: readonly EffectBatchInstance[];
  /** Código GLSL que define `effectModel` y `effectLocalPosition`. */
  motion: string;
  radius?: number;
  life?: number;
  /** Valores de `uEffectParam0..3`, usados por algunas animaciones. */
  params?: readonly [number, number, number, number];
}

const INSTANCE_FLOATS = 16 + 4 + 4;

const instanceFormats = new WeakMap<pc.GraphicsDevice, pc.VertexFormat>();

function getInstanceFormat(device: pc.GraphicsDevice): pc.VertexFormat {
  let format = instanceFormats.get(device);
  if (format) return format;
  format = new pc.VertexFormat(device, [
    // Columnas de la matriz de instancia, igual que el formato por defecto.
    { semantic: pc.SEMANTIC_ATTR11, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR12, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR14, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: pc.SEMANTIC_ATTR15, components: 4, type: pc.TYPE_FLOAT32 },
    // Datos procedurales de la animación.
    { semantic: ATTR_ANIM0, components: 4, type: pc.TYPE_FLOAT32 },
    { semantic: ATTR_ANIM1, components: 4, type: pc.TYPE_FLOAT32 }
  ]);
  instanceFormats.set(device, format);
  return format;
}

/** Declaraciones y utilidades comunes a todos los shaders de efecto. */
const EFFECT_SHADER_COMMON = `
attribute vec4 vertex_position;
uniform mat4 matrix_viewProjection;
uniform mat4 matrix_model;
uniform float uEffectTime;
uniform float uEffectLife;
uniform float uEffectOpacity;
uniform float uEffectRadius;
uniform float uEffectParam0;
uniform float uEffectParam1;
uniform float uEffectParam2;
uniform float uEffectParam3;

const float EFFECT_PI = 3.141592653589793;
const float EFFECT_DEG = 0.017453292519943295;

mat4 effectScale(vec3 s) {
  return mat4(
    s.x, 0.0, 0.0, 0.0,
    0.0, s.y, 0.0, 0.0,
    0.0, 0.0, s.z, 0.0,
    0.0, 0.0, 0.0, 1.0
  );
}

mat4 effectRotX(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat4(
    1.0, 0.0, 0.0, 0.0,
    0.0, c, s, 0.0,
    0.0, -s, c, 0.0,
    0.0, 0.0, 0.0, 1.0
  );
}

mat4 effectRotY(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat4(
    c, 0.0, -s, 0.0,
    0.0, 1.0, 0.0, 0.0,
    s, 0.0, c, 0.0,
    0.0, 0.0, 0.0, 1.0
  );
}

mat4 effectRotZ(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat4(
    c, s, 0.0, 0.0,
    -s, c, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0
  );
}

mat4 effectEuler(float x, float y, float z) {
  return effectRotY(y) * effectRotX(x) * effectRotZ(z);
}

mat4 effectTRS(vec3 translation, vec3 scale, mat4 rotation) {
  mat4 result = rotation;
  result[0] *= scale.x;
  result[1] *= scale.y;
  result[2] *= scale.z;
  result[3] = vec4(translation, 1.0);
  return result;
}

float effectEnvelope(float fadeIn, float fadeOut) {
  float inValue = min(1.0, uEffectTime / max(fadeIn, 0.0001));
  float outValue = min(1.0, max(0.0, (uEffectLife - uEffectTime) / max(fadeOut, 0.0001)));
  return min(inValue, outValue);
}
`;

function instancedChunk(motion: string): string {
  return `${EFFECT_SHADER_COMMON}
#ifdef INSTANCING
attribute vec4 instance_line1;
attribute vec4 instance_line2;
attribute vec4 instance_line3;
attribute vec4 instance_line4;
attribute vec4 instance_anim0;
attribute vec4 instance_anim1;

${motion}

mat4 getModelMatrix() {
  mat4 base = mat4(instance_line1, instance_line2, instance_line3, instance_line4);
  return matrix_model * effectModel(base, instance_anim0, instance_anim1);
}

vec3 getLocalPosition(vec3 vertexPosition) {
  return effectLocalPosition(vertexPosition, instance_anim0, instance_anim1);
}
#else
mat4 getModelMatrix() {
  return matrix_model;
}

vec3 getLocalPosition(vec3 vertexPosition) {
  return vertexPosition;
}
#endif
`;
}

function vertexChunk(motion: string): string {
  return `${EFFECT_SHADER_COMMON}

${motion}

mat4 getModelMatrix() {
  return matrix_model;
}

vec3 getLocalPosition(vec3 vertexPosition) {
  return effectLocalPosition(vertexPosition);
}
`;
}

/** Añade a un material el shader de instancing con la animación indicada. */
export function applyInstancedEffectShader(
  material: pc.StandardMaterial,
  motion: string
): void {
  material.userAttributes.set(ATTR_ANIM0, 'instance_anim0');
  material.userAttributes.set(ATTR_ANIM1, 'instance_anim1');
  material
    .getShaderChunks(pc.SHADERLANGUAGE_GLSL)
    .set('transformCoreVS', instancedChunk(motion));
  material.update();
}

/** Añade a un material una deformación de vértices por shader, sin instancing. */
export function applyVertexEffectShader(
  material: pc.StandardMaterial,
  motion: string
): void {
  material
    .getShaderChunks(pc.SHADERLANGUAGE_GLSL)
    .set('transformCoreVS', vertexChunk(motion));
  material.update();
}

/**
 * Lote de instancias.
 *
 * El material se comparte con el efecto: `CombatFx.update()` sigue llamando a
 * `material.update()` una vez por material, no una por instancia. El buffer de
 * instancias es estático; la animación se resuelve con `uEffectTime`.
 */
export class EffectBatch {
  readonly entity: pc.Entity;
  readonly material: pc.StandardMaterial;
  private readonly buffer: pc.VertexBuffer | null;

  constructor(options: EffectBatchOptions) {
    const { app, parent, mesh, material, instances, motion } = options;
    const device = app.graphicsDevice;
    const count = instances.length;
    if (count === 0) {
      this.entity = new pc.Entity('gpu-effect-batch-empty');
      this.material = material;
      this.buffer = null;
      return;
    }

    const data = new Float32Array(count * INSTANCE_FLOATS);
    const position = new pc.Vec3();
    const rotation = new pc.Quat();
    const scale = new pc.Vec3();
    const matrix = new pc.Mat4();

    for (let index = 0; index < count; index++) {
      const instance = instances[index];
      const offset = index * INSTANCE_FLOATS;
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
      data[offset + 16] = anim0[0];
      data[offset + 17] = anim0[1];
      data[offset + 18] = anim0[2];
      data[offset + 19] = anim0[3];
      data[offset + 20] = anim1[0];
      data[offset + 21] = anim1[1];
      data[offset + 22] = anim1[2];
      data[offset + 23] = anim1[3];
    }

    this.buffer = new pc.VertexBuffer(device, getInstanceFormat(device), count, {
      data,
      usage: pc.BUFFER_STATIC
    });

    applyInstancedEffectShader(material, motion);
    material.setParameter('uEffectTime', 0);
    material.setParameter('uEffectLife', options.life ?? 1);
    material.setParameter('uEffectRadius', options.radius ?? 1);
    material.setParameter('uEffectOpacity', 1);
    const params = options.params ?? [0, 0, 0, 0];
    material.setParameter('uEffectParam0', params[0]);
    material.setParameter('uEffectParam1', params[1]);
    material.setParameter('uEffectParam2', params[2]);
    material.setParameter('uEffectParam3', params[3]);
    material.update();

    const instance = new pc.MeshInstance(mesh, material);
    instance.castShadow = false;
    instance.receiveShadow = false;
    instance.setInstancing(this.buffer, false);

    const entity = new pc.Entity('gpu-effect-batch');
    entity.addComponent('render');
    const render = entity.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    render.meshInstances = [instance];
    parent.addChild(entity);
    entity.on('destroy', () => this.buffer?.destroy());

    this.entity = entity;
    this.material = material;
  }

  setTime(time: number): void {
    this.material.setParameter('uEffectTime', time);
  }

  setOpacity(opacity: number): void {
    this.material.opacity = opacity;
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

/** Lote estático: la transformación de cada instancia ya viene en su matriz. */
export const MOTION_STATIC = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  return base;
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Animación de hojas en espiral de `Lluevehojas`. */
export const MOTION_GRASS_LEAVES = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float p = fract(uEffectTime * a0.w + a0.z);
  float angle = a0.x + uEffectTime * 7.2 + p * 2.6 * EFFECT_PI;
  float funnel = 0.45 + 0.55 * p;
  float dist = uEffectRadius * a0.y * funnel;
  float y = 0.05 + p * uEffectRadius * 0.45;
  float fade = min(1.0, p / 0.1) * min(1.0, (1.0 - p) / 0.18);
  float envelope = effectEnvelope(0.12, 0.25);
  float pulse = 0.8 + sin(uEffectTime * 6.0 + a0.z * 10.0) * 0.2;
  float s = max(0.0001, a1.y * fade * pulse * envelope);
  float pitch = sin(uEffectTime * 2.4 + a0.z * 6.28318530718) * 22.0 * EFFECT_DEG;
  float yaw = (a1.z + uEffectTime * 900.0 * a1.x + p * 540.0) * EFFECT_DEG;
  float roll = cos(uEffectTime * 2.0 + a0.z * 6.28318530718) * 18.0 * EFFECT_DEG;
  return effectTRS(
    vec3(cos(angle) * dist, y, sin(angle) * dist),
    vec3(s, s * 1.75, s),
    effectEuler(pitch, yaw, roll)
  );
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Nubes del huracán de `Ciclón`: suben y bajan y respiran en escala. */
export const MOTION_CYCLONE_PUFFS = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float bob = sin(uEffectTime * 2.6 + a0.x) * (0.03 + a0.y * 0.012);
  float pulse = 0.9 + sin(uEffectTime * 3.2 + a0.x) * 0.1;
  mat4 result = base;
  result[3].y += bob;
  return result * effectScale(vec3(pulse));
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Llamas de `Onda Ígnea` y `Llama Final`: crecen, parpadean y se mecen. */
export const MOTION_HEAT_FLAMES = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float growIn = max(0.0001, uEffectParam2);
  float delay = fract(a0.x) * growIn * 0.3;
  float localIn = clamp((uEffectTime - delay) / growIn, 0.0, 1.0);
  float envelope = effectEnvelope(uEffectParam0, uEffectParam1);
  float flicker = 0.88 + sin(uEffectTime * 11.0 + a0.x * 1.7) * 0.12;
  float sway = sin(uEffectTime * 6.5 + a0.x) * 0.2;
  float scale = max(0.001, localIn * envelope);
  float yaw = (a0.w + uEffectTime * 10.0 + sin(uEffectTime * 3.0 + a0.x) * 10.0) * EFFECT_DEG;
  float roll = sin(uEffectTime * 4.0 + a0.x) * 7.0 * EFFECT_DEG;
  vec3 pos = vec3(
    cos(a0.y) * a0.z,
    max(0.0, sway * uEffectRadius * 0.05),
    sin(a0.y) * a0.z
  );
  return effectTRS(
    pos,
    vec3(a1.x * scale * flicker, a1.y * scale * (1.05 + sway), a1.x * scale * flicker),
    effectEuler(0.0, yaw, roll)
  );
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Brasas de `Onda Ígnea`: suben, se abren y se apagan. */
export const MOTION_HEAT_EMBERS = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float progress = min(1.0, uEffectTime / max(0.2, uEffectLife * 0.8));
  float angle = a0.x + uEffectTime * 1.6;
  float dist = a0.y * (0.5 + progress * 0.7);
  float fade = max(0.0, 1.0 - progress);
  float s = max(0.0001, a1.x * fade);
  return effectTRS(
    vec3(cos(angle) * dist, 0.18 + progress * a0.z, sin(angle) * dist),
    vec3(s),
    effectRotY(0.0)
  );
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Aspas de viento sobre las llamas: giran, crecen y respiran. */
export const MOTION_HEAT_BLADES = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float envelope = effectEnvelope(uEffectParam0, uEffectParam1);
  float grow = 1.0 - pow(1.0 - min(1.0, uEffectTime / max(0.0001, uEffectParam2)), 2.0);
  float scale = a0.x * uEffectRadius * (0.7 + grow * 0.45) * (0.85 + sin(uEffectTime * 7.0 + a0.y) * 0.12) * envelope;
  float yaw = (uEffectTime * 40.0 + a0.y * 60.0) * EFFECT_DEG;
  float roll = sin(uEffectTime * 4.0 + a0.y) * 18.0 * EFFECT_DEG;
  return effectTRS(
    base[3].xyz,
    vec3(max(0.0001, scale)),
    effectEuler(90.0 * EFFECT_DEG, yaw, roll)
  );
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Chorros 3D de `Marea`: respiran en altura y grosor con fase propia. */
export const MOTION_WATER_JETS = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float wave = 0.5 + 0.5 * sin(uEffectTime * a0.w * 6.28318530718 + a0.z);
  float height = a1.y * (0.55 + 0.45 * wave);
  float width = a1.x * (0.92 + 0.12 * wave);
  float yaw = (a1.z + sin(uEffectTime * 1.2 + a0.z) * 5.0) * EFFECT_DEG;
  return effectTRS(
    vec3(a0.x, 0.0, a0.y),
    vec3(width, height, width),
    effectRotY(yaw)
  );
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Esquirlas de `Psíquico`: salen del centro, giran y se desvanecen. */
export const MOTION_PSYCHIC_SHARDS = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float travel = max(0.0001, a1.x);
  float local = clamp((uEffectTime - a0.w) / travel, 0.0, 1.0);
  float ease = 1.0 - (1.0 - local) * (1.0 - local);
  float distance = a0.z * ease;
  float angle = a0.x + sin(uEffectTime * 3.0 + a1.z) * 0.06;
  float y = 0.4 + a0.y * ease * uEffectRadius * 0.45;
  float fadeOut = min(1.0, max(0.0, (uEffectLife - uEffectTime) / max(0.0001, uEffectLife * 0.45)));
  float fade = min(1.0, local / 0.1) * min(1.0, (1.0 - local) / 0.25);
  float s = max(0.0001, a1.y * (0.6 + ease * 0.9) * max(0.0, fade) * fadeOut);
  float pitch = (uEffectTime * 160.0 + a1.z * 30.0) * EFFECT_DEG;
  float yaw = (uEffectTime * 210.0 + a1.z * 40.0) * EFFECT_DEG;
  float roll = sin(uEffectTime * 5.0 + a1.z) * 24.0 * EFFECT_DEG;
  return effectTRS(
    vec3(cos(angle) * distance, y, sin(angle) * distance),
    vec3(s),
    effectEuler(pitch, yaw, roll)
  );
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Cristales de `Ventisca`: caen, se clavan y se asientan. */
export const MOTION_BLIZZARD_CRYSTALS = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float local = (uEffectTime - a0.z) / max(0.0001, a0.w);
  if (local <= 0.0) {
    return effectTRS(base[3].xyz, vec3(0.0001), effectRotY(0.0));
  }
  float fall = min(1.0, local);
  float eased = fall * fall * fall;
  float y = a0.x + (a0.y - a0.x) * eased;
  bool landed = local >= 1.0;
  float settle = landed ? min(1.0, (uEffectTime - (a0.z + a0.w)) / 0.16) : 0.0;
  float endFade = min(1.0, max(0.0, (uEffectLife - uEffectTime) / 0.22));
  float appear = min(1.0, local * 6.0);
  float scale = appear * endFade;
  float extraTilt = landed ? sin(settle * EFFECT_PI) * 4.0 * EFFECT_DEG : 0.0;
  mat4 result = base;
  result[3].y += y;
  result = result * effectEuler(extraTilt, 0.0, 0.0);
  return result * effectScale(
    vec3(
      max(0.0001, a1.x * scale),
      max(0.0001, a1.y * scale),
      max(0.0001, a1.x * scale)
    )
  );
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Puffs de nieve que levantan los cristales al clavarse. */
export const MOTION_BLIZZARD_PUFFS = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float puffLocal = clamp((uEffectTime - a0.y - a0.z) / 0.3, 0.0, 1.0);
  float envelope = effectEnvelope(0.12, 0.24);
  float scale = a0.x * (0.3 + puffLocal * 1.1) * max(0.0, 1.0 - puffLocal) * envelope;
  return effectTRS(
    base[3].xyz,
    vec3(max(0.0001, scale), max(0.0001, scale * 0.7), max(0.0001, scale)),
    effectRotY(0.0)
  );
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Copos de `Ventisca`: caen con deriva y se encogen. */
export const MOTION_SNOWFLAKES = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float fall = min(1.0, uEffectTime / max(0.0001, a0.y));
  float drift = sin(uEffectTime * 1.7 + a0.z) * uEffectRadius * 0.07;
  float side = cos(uEffectTime * 1.4 + a0.z) * uEffectRadius * 0.07;
  float scale = a0.w * (1.0 - fall * 0.5) * max(0.0, 1.0 - fall);
  vec3 pos = vec3(
    base[3].x + drift,
    0.1 + a0.x * (1.0 - fall),
    base[3].z + side
  );
  return effectTRS(pos, vec3(max(0.0001, scale)), effectRotY(0.0));
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Grietas de `Falla`: cada losa emerge con su propio retardo. */
export const MOTION_FISSURE_BRANCHES = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float local = clamp((uEffectTime - a0.x) / 0.14, 0.0, 1.0);
  float pop = 1.0 - pow(1.0 - local, 3.0);
  float sink = uEffectRadius * 0.02 * pop;
  mat4 result = base;
  result[3].y -= sink;
  result = result * effectScale(vec3(0.5 + pop * 0.5, 1.0, 1.0));
  result = result * effectEuler(
    a0.y * pop * EFFECT_DEG,
    0.0,
    a0.y * 0.35 * pop * EFFECT_DEG
  );
  return result;
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Losas del suelo que saltan en `Falla`. */
export const MOTION_FISSURE_SLABS = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float local = clamp((uEffectTime - a0.x) / 0.16, 0.0, 1.0);
  float pop = 1.0 - pow(1.0 - local, 3.0);
  float fadeOut = min(1.0, max(0.0, (uEffectLife - uEffectTime) / 0.2));
  float scale = max(0.001, pop * fadeOut);
  mat4 result = base;
  result[3].y += uEffectRadius * 0.025 * pop;
  result = result * effectScale(vec3(scale, scale, scale));
  result = result * effectEuler(
    a0.y * pop * EFFECT_DEG,
    0.0,
    a0.y * 0.4 * pop * EFFECT_DEG
  );
  return result;
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Estalagmitas de `Falla`. */
export const MOTION_FISSURE_SPIKES = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float local = clamp((uEffectTime - a0.z) / 0.12, 0.0, 1.0);
  float pop = 1.0 - pow(1.0 - local, 3.0);
  float fadeOut = min(1.0, max(0.0, (uEffectLife - uEffectTime) / 0.2));
  float height = a0.x * pop * fadeOut;
  if (height <= 0.001) {
    return effectTRS(base[3].xyz, vec3(0.001), effectRotY(0.0));
  }
  float width = max(0.001, a0.y * pop * fadeOut);
  mat4 result = base;
  result[3].y += height * (pop - 0.5);
  result = result * effectScale(vec3(width, height, width));
  result = result * effectEuler(
    a0.w * pop * EFFECT_DEG,
    0.0,
    a0.w * 0.35 * pop * EFFECT_DEG
  );
  return result;
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Piedras que salen despedidas en `Falla`. */
export const MOTION_FISSURE_PEBBLES = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float local = clamp((uEffectTime - a0.w) / 0.4, 0.0, 1.0);
  if (local <= 0.0) {
    return effectTRS(vec3(0.0), vec3(0.001), effectRotY(0.0));
  }
  float distance = a0.y * local;
  float y = a1.x * 0.4 + sin(local * EFFECT_PI) * a0.z;
  float fadeOut = min(1.0, max(0.0, (uEffectLife - uEffectTime) / 0.2));
  float scale = a1.x * (1.0 - local * 0.55) * fadeOut;
  float pitch = local * 260.0 * EFFECT_DEG;
  float yaw = a0.x * EFFECT_DEG;
  float roll = local * a1.y * EFFECT_DEG;
  return effectTRS(
    vec3(sin(a0.x) * distance, y, cos(a0.x) * distance),
    vec3(max(0.001, scale), max(0.001, scale * 0.8), max(0.001, scale * 0.9)),
    effectEuler(pitch, yaw, roll)
  );
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Llamas del remolino de `Torbellino Ígneo`. */
export const MOTION_FIRE_WHIRL_FLAMES = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float growIn = max(0.0001, uEffectParam2);
  float delay = fract(a0.w) * growIn * 0.25;
  float localIn = clamp((uEffectTime - delay) / growIn, 0.0, 1.0);
  float envelope = effectEnvelope(uEffectParam0, uEffectParam1);
  float scale = localIn * envelope;
  float angle = a0.x + uEffectTime * 2.8;
  float flicker = 0.85 + sin(uEffectTime * 9.0 + a0.w) * 0.15;
  float sway = sin(uEffectTime * 6.0 + a0.w) * 0.18;
  vec3 size = vec3(
    a1.x * scale * flicker,
    a1.y * scale * (1.05 + sway),
    a1.x * scale * flicker
  );
  float yaw = (90.0 - (angle * 180.0 / EFFECT_PI)) * EFFECT_DEG;
  float roll = sin(uEffectTime * 4.0 + a0.w) * 10.0 * EFFECT_DEG;
  return effectTRS(
    vec3(cos(angle) * a0.y, 0.0, sin(angle) * a0.y),
    size,
    effectEuler(a0.z * EFFECT_DEG, yaw, roll)
  );
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/** Rocío de `Paralizador`: viaja del vértice al borde del cono. */
export const MOTION_SPORE_SWARM = `
mat4 effectModel(mat4 base, vec4 a0, vec4 a1) {
  float travel = max(0.0001, a1.x);
  float local = clamp((uEffectTime - a0.w) / travel, 0.0, 1.0);
  float ease = 1.0 - (1.0 - local) * (1.0 - local);
  float distance = a0.y * ease;
  float angle = a0.x + sin(uEffectTime * 2.4 + a1.z) * 0.035;
  float y = 0.55 + (a0.z - 0.55) * ease + sin(local * EFFECT_PI) * 0.18;
  float fade = min(1.0, local / 0.1) * min(1.0, (1.0 - local) / 0.15);
  float s = max(0.0001, a1.y * (0.7 + ease * 0.7) * max(0.0, fade));
  float pitch = sin(uEffectTime * 2.1 + a1.z) * 18.0 * EFFECT_DEG;
  float yaw = (uEffectTime * 150.0 + a1.z * 40.0) * EFFECT_DEG;
  float roll = cos(uEffectTime * 1.8 + a1.z) * 18.0 * EFFECT_DEG;
  return effectTRS(
    vec3(sin(angle) * distance, y, cos(angle) * distance),
    vec3(s),
    effectEuler(pitch, yaw, roll)
  );
}

vec3 effectLocalPosition(vec3 vertexPosition, vec4 a0, vec4 a1) {
  return vertexPosition;
}
`;

/**
 * Onda psíquica del golpe melee. Se aplica a un material normal (sin
 * instancing): el desplazamiento en Y depende del ángulo y del borde del arco.
 * `uEffectParam0` es la fase, `uEffectParam1` la amplitud y `uEffectParam2` el
 * número de ondulaciones.
 */
export const MOTION_PSYCHIC_WAVE = `
vec3 effectLocalPosition(vec3 vertexPosition) {
  float angle = atan(vertexPosition.x, vertexPosition.z);
  float edge = step(0.97, length(vertexPosition.xz));
  float wave = sin(
    angle * uEffectParam2 +
    uEffectTime * 11.0 +
    uEffectParam0 +
    edge * 0.9
  ) * uEffectParam1;
  return vec3(vertexPosition.x, wave, vertexPosition.z);
}
`;
