import * as pc from 'playcanvas';

/**
 * Emisor de partículas de combate dibujado como un lote de billboards.
 *
 * Sustituye a los `ParticleSystem` de PlayCanvas en los efectos estáticos
 * (áreas, impactos, haces y melee). El emisor original costaba una pasada de
 * simulación por frame y hasta 32 pasadas de `preWarm` en cada casteo; aquí
 * las posiciones, la deriva y el tamaño se calculan en el vertex shader y la
 * CPU solo avanza un contador.
 */

export interface EffectParticleBatchOptions {
  /** Posición del emisor dentro del efecto. */
  position: readonly [number, number, number];
  /** Tamaño **completo** de la caja de emisión. */
  extents: readonly [number, number, number];
  count: number;
  texture: pc.Texture;
  /** `true` para mezcla aditiva; `false` para alfa recto. */
  additive: boolean;
  colorStart: readonly [number, number, number];
  colorMid: readonly [number, number, number];
  colorEnd: readonly [number, number, number];
  /** Punto de la vida donde se alcanza `colorMid` y `sizeMid`. */
  colorMidAt?: number;
  sizeMidAt?: number;
  sizeEndAt?: number;
  opacity: number;
  sizeStart: number;
  sizeMid: number;
  sizeEnd: number;
  lifetime: number;
  fadeIn: number;
  fadeOut: number;
  velocity: readonly [number, number, number];
  velocityEnd: readonly [number, number, number];
  radialSpeed?: number;
  radialSpeedEnd?: number;
  /** 0 = billboard normal; >0 lo estira en la dirección del movimiento. */
  stretch?: number;
  yaw?: number;
  preWarm?: boolean;
  seed?: number;
}

const VERTEX_GLSL = `
attribute vec3 aPosition;
attribute vec2 aUv0;
attribute vec3 aCenter;
attribute vec4 aParams;

uniform mat4 matrix_view;
uniform mat4 matrix_projection;
uniform mat4 matrix_model;
uniform float uTime;
uniform float uLife;
uniform float uSizeStart;
uniform float uSizeMid;
uniform float uSizeEnd;
uniform float uSizeMidAt;
uniform float uSizeEndAt;
uniform float uFadeIn;
uniform float uFadeOut;
uniform float uOpacity;
uniform vec3 uColorStart;
uniform vec3 uColorMid;
uniform vec3 uColorEnd;
uniform float uColorMidAt;
uniform vec3 uVelocity;
uniform vec3 uVelocityEnd;
uniform float uRadialSpeed;
uniform float uRadialSpeedEnd;
uniform float uStretch;
uniform float uPreWarm;
uniform float uFogStart;
uniform float uFogEnd;

varying vec2 vUv;
varying vec4 vTint;
varying float vFog;

void main(void) {
  float phase = aParams.x;
  // Con preWarm las motas nacen repartidas por su vida; sin él, escalonadas
  // durante el primer ciclo para que el emisor se llene poco a poco.
  float local = uPreWarm > 0.5
    ? uTime + phase * uLife
    : uTime - phase * uLife;
  if (local < 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vTint = vec4(0.0);
    vFog = 1.0;
    vUv = aUv0;
    return;
  }

  float t = fract(local / max(uLife, 0.001));
  vec3 center = aCenter
    + uVelocity * (t * uLife)
    + 0.5 * (uVelocityEnd - uVelocity) * t * t * uLife;
  float radial = mix(uRadialSpeed, uRadialSpeedEnd, t) * t * uLife;
  center.x += cos(aParams.z) * radial;
  center.z += sin(aParams.z) * radial;

  vec4 viewCenter = matrix_view * (matrix_model * vec4(center, 1.0));
  float depth = -viewCenter.z;
  vUv = aUv0;

  if (depth > uFogEnd) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vTint = vec4(0.0);
    vFog = 1.0;
    return;
  }

  float size = mix(uSizeStart, uSizeMid, clamp(t / max(uSizeMidAt, 0.001), 0.0, 1.0));
  if (t > uSizeMidAt) size = uSizeMid;
  if (t > uSizeEndAt) {
    size = mix(uSizeMid, uSizeEnd, (t - uSizeEndAt) / max(1.0 - uSizeEndAt, 0.001));
  }
  size *= aParams.y;

  vec2 axisX = vec2(1.0, 0.0);
  vec2 axisY = vec2(0.0, 1.0);
  if (uStretch > 0.0) {
    vec2 direction = (matrix_view * vec4(mix(uVelocity, uVelocityEnd, t), 0.0)).xy;
    float lengthSq = dot(direction, direction);
    if (lengthSq > 0.0001) {
      axisY = direction * inversesqrt(lengthSq);
      axisX = vec2(axisY.y, -axisY.x);
    }
  }
  float stretch = 1.0 + uStretch * 2.0;
  viewCenter.xy += axisX * aPosition.x * size;
  viewCenter.xy += axisY * aPosition.y * size * stretch;
  gl_Position = matrix_projection * viewCenter;

  float fade = smoothstep(0.0, uFadeIn, t) * (1.0 - smoothstep(uFadeOut, 1.0, t));
  vec3 color = t < uColorMidAt
    ? mix(uColorStart, uColorMid, t / max(uColorMidAt, 0.001))
    : mix(uColorMid, uColorEnd, (t - uColorMidAt) / max(1.0 - uColorMidAt, 0.001));
  vTint = vec4(color, fade * uOpacity);
  vFog = clamp((depth - uFogStart) / max(uFogEnd - uFogStart, 0.001), 0.0, 1.0);
}
`;

export const PARTICLE_FRAGMENT_GLSL = `
uniform sampler2D uMap;
uniform vec3 uFogColor;
uniform float uAdditive;

varying vec2 vUv;
varying vec4 vTint;
varying float vFog;

vec3 linearToSrgb(vec3 color) {
  color = max(color, vec3(0.0));
  return mix(
    1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055,
    color * 12.92,
    lessThanEqual(color, vec3(0.0031308))
  );
}

void main(void) {
  vec4 tex = texture2D(uMap, vUv);
  vec3 rgb = mix(tex.rgb * vTint.rgb, uFogColor, vFog);
  float alpha = tex.a * vTint.a;

  if (uAdditive > 0.5) {
    gl_FragColor = vec4(linearToSrgb(rgb * alpha), 1.0);
  } else {
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(linearToSrgb(rgb), alpha);
  }
}
`;

const VERTEX_WGSL = `
attribute aPosition: vec3f;
attribute aUv0: vec2f;
attribute aCenter: vec3f;
attribute aParams: vec4f;

uniform matrix_view: mat4x4f;
uniform matrix_projection: mat4x4f;
uniform matrix_model: mat4x4f;
uniform uTime: f32;
uniform uLife: f32;
uniform uSizeStart: f32;
uniform uSizeMid: f32;
uniform uSizeEnd: f32;
uniform uSizeMidAt: f32;
uniform uSizeEndAt: f32;
uniform uFadeIn: f32;
uniform uFadeOut: f32;
uniform uOpacity: f32;
uniform uColorStart: vec3f;
uniform uColorMid: vec3f;
uniform uColorEnd: vec3f;
uniform uColorMidAt: f32;
uniform uVelocity: vec3f;
uniform uVelocityEnd: vec3f;
uniform uRadialSpeed: f32;
uniform uRadialSpeedEnd: f32;
uniform uStretch: f32;
uniform uPreWarm: f32;
uniform uFogStart: f32;
uniform uFogEnd: f32;

varying vUv: vec2f;
varying vTint: vec4f;
varying vFog: f32;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let phase = aParams.x;
  let local = select(
    uniform.uTime - phase * uniform.uLife,
    uniform.uTime + phase * uniform.uLife,
    uniform.uPreWarm > 0.5
  );
  output.vUv = aUv0;
  if (local < 0.0) {
    output.position = vec4f(2.0, 2.0, 2.0, 1.0);
    output.vTint = vec4f(0.0);
    output.vFog = 1.0;
    return output;
  }

  let t = fract(local / max(uniform.uLife, 0.001));
  var center = aCenter
    + uniform.uVelocity * (t * uniform.uLife)
    + 0.5 * (uniform.uVelocityEnd - uniform.uVelocity) * t * t * uniform.uLife;
  let radial = mix(uniform.uRadialSpeed, uniform.uRadialSpeedEnd, t) * t * uniform.uLife;
  center.x += cos(aParams.z) * radial;
  center.z += sin(aParams.z) * radial;

  var viewCenter = uniform.matrix_view * (uniform.matrix_model * vec4f(center, 1.0));
  let depth = -viewCenter.z;

  if (depth > uniform.uFogEnd) {
    output.position = vec4f(2.0, 2.0, 2.0, 1.0);
    output.vTint = vec4f(0.0);
    output.vFog = 1.0;
    return output;
  }

  var size = mix(
    uniform.uSizeStart,
    uniform.uSizeMid,
    clamp(t / max(uniform.uSizeMidAt, 0.001), 0.0, 1.0)
  );
  if (t > uniform.uSizeMidAt) {
    size = uniform.uSizeMid;
  }
  if (t > uniform.uSizeEndAt) {
    size = mix(
      uniform.uSizeMid,
      uniform.uSizeEnd,
      (t - uniform.uSizeEndAt) / max(1.0 - uniform.uSizeEndAt, 0.001)
    );
  }
  size *= aParams.y;
  var axisX = vec2f(1.0, 0.0);
  var axisY = vec2f(0.0, 1.0);
  if (uniform.uStretch > 0.0) {
    let direction = (
      uniform.matrix_view * vec4f(mix(uniform.uVelocity, uniform.uVelocityEnd, t), 0.0)
    ).xy;
    let lengthSq = dot(direction, direction);
    if (lengthSq > 0.0001) {
      axisY = direction * inverseSqrt(lengthSq);
      axisX = vec2f(axisY.y, -axisY.x);
    }
  }
  let stretch = 1.0 + uniform.uStretch * 2.0;
  viewCenter.x += axisX.x * aPosition.x * size + axisY.x * aPosition.y * size * stretch;
  viewCenter.y += axisX.y * aPosition.x * size + axisY.y * aPosition.y * size * stretch;
  output.position = uniform.matrix_projection * viewCenter;

  let fade = smoothstep(0.0, uniform.uFadeIn, t) * (1.0 - smoothstep(uniform.uFadeOut, 1.0, t));
  let color = select(
    mix(
      uniform.uColorMid,
      uniform.uColorEnd,
      (t - uniform.uColorMidAt) / max(1.0 - uniform.uColorMidAt, 0.001)
    ),
    mix(
      uniform.uColorStart,
      uniform.uColorMid,
      t / max(uniform.uColorMidAt, 0.001)
    ),
    t < uniform.uColorMidAt
  );
  output.vTint = vec4f(color, fade * uniform.uOpacity);
  output.vFog = clamp(
    (depth - uniform.uFogStart) / max(uniform.uFogEnd - uniform.uFogStart, 0.001),
    0.0,
    1.0
  );
  return output;
}
`;

export const PARTICLE_FRAGMENT_WGSL = `
uniform uFogColor: vec3f;
uniform uAdditive: f32;
var uMap: texture_2d<f32>;
var uMap_sampler: sampler;

varying vUv: vec2f;
varying vTint: vec4f;
varying vFog: f32;

fn linearToSrgb(color: vec3f) -> vec3f {
  let x = max(color, vec3f(0.0));
  let hi = 1.055 * pow(x, vec3f(1.0 / 2.4)) - 0.055;
  let lo = x * 12.92;
  return select(hi, lo, x <= vec3f(0.0031308));
}

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  let tex = textureSample(uMap, uMap_sampler, vUv);
  let rgb = mix(tex.rgb * vTint.rgb, uniform.uFogColor, vFog);
  let alpha = tex.a * vTint.a;

  if (uniform.uAdditive > 0.5) {
    output.color = vec4f(linearToSrgb(rgb * alpha), 1.0);
  } else {
    if (alpha < 0.01) {
      discard;
    }
    output.color = vec4f(linearToSrgb(rgb), alpha);
  }
  return output;
}
`;

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

let nextSeed = 0x51ed270b;
let nextBatchId = 0x2f1e3d4c;

export class EffectParticleBatch {
  readonly entity: pc.Entity;
  private readonly material: pc.ShaderMaterial;
  private time = 0;

  constructor(
    app: pc.AppBase,
    parent: pc.Entity,
    options: EffectParticleBatchOptions
  ) {
    const device = app.graphicsDevice;
    const count = Math.max(1, options.count);
    const positions = new Float32Array(count * 4 * 3);
    const uvs = new Float32Array(count * 4 * 2);
    const centers = new Float32Array(count * 4 * 3);
    const params = new Float32Array(count * 4 * 4);
    const indices = new Uint32Array(count * 6);
    const rand = mulberry32(options.seed ?? nextSeed++);

    const [ex, ey, ez] = options.extents;
    for (let index = 0; index < count; index++) {
      const cx = (rand() - 0.5) * ex;
      const cy = (rand() - 0.5) * ey;
      const cz = (rand() - 0.5) * ez;
      const phase = rand();
      const sizeJitter = 0.85 + rand() * 0.3;
      const radialAngle = rand() * Math.PI * 2;

      for (let corner = 0; corner < 4; corner++) {
        const vx = corner === 0 || corner === 3 ? -1 : 1;
        const vy = corner < 2 ? -1 : 1;
        const vertex = index * 4 + corner;
        const p3 = vertex * 3;
        const p2 = vertex * 2;
        const p4 = vertex * 4;
        positions[p3] = vx;
        positions[p3 + 1] = vy;
        positions[p3 + 2] = 0;
        uvs[p2] = 0.5 + vx * 0.5;
        uvs[p2 + 1] = 0.5 - vy * 0.5;
        centers[p3] = cx;
        centers[p3 + 1] = cy;
        centers[p3 + 2] = cz;
        params[p4] = phase;
        params[p4 + 1] = sizeJitter;
        params[p4 + 2] = radialAngle;
        params[p4 + 3] = 0;
      }

      const offset = index * 6;
      const base = index * 4;
      indices[offset] = base;
      indices[offset + 1] = base + 1;
      indices[offset + 2] = base + 2;
      indices[offset + 3] = base;
      indices[offset + 4] = base + 2;
      indices[offset + 5] = base + 3;
    }

    const mesh = new pc.Mesh(device);
    mesh.setPositions(positions);
    mesh.setUvs(0, uvs);
    mesh.setVertexStream(pc.SEMANTIC_ATTR6, centers, 3);
    mesh.setVertexStream(pc.SEMANTIC_ATTR7, params, 4);
    mesh.setIndices(indices);
    mesh.update();

    const material = new pc.ShaderMaterial({
      uniqueName: `effect-particles-${nextBatchId++}`,
      vertexGLSL: VERTEX_GLSL,
      fragmentGLSL: PARTICLE_FRAGMENT_GLSL,
      vertexWGSL: VERTEX_WGSL,
      fragmentWGSL: PARTICLE_FRAGMENT_WGSL,
      attributes: {
        aPosition: pc.SEMANTIC_POSITION,
        aUv0: pc.SEMANTIC_TEXCOORD0,
        aCenter: pc.SEMANTIC_ATTR6,
        aParams: pc.SEMANTIC_ATTR7
      }
    });
    material.blendType = options.additive ? pc.BLEND_ADDITIVE : pc.BLEND_NORMAL;
    material.depthWrite = false;
    material.depthTest = true;
    material.cull = pc.CULLFACE_NONE;
    material.setParameter('uMap', options.texture);
    material.setParameter('uTime', 0);
    material.setParameter('uLife', options.lifetime);
    material.setParameter('uSizeStart', options.sizeStart);
    material.setParameter('uSizeMid', options.sizeMid);
    material.setParameter('uSizeEnd', options.sizeEnd);
    material.setParameter('uSizeMidAt', options.sizeMidAt ?? 0.3);
    material.setParameter('uSizeEndAt', options.sizeEndAt ?? 0.7);
    material.setParameter('uFadeIn', Math.max(options.fadeIn, 0.001));
    material.setParameter('uFadeOut', options.fadeOut);
    material.setParameter('uOpacity', options.opacity);
    material.setParameter('uColorStart', new Float32Array(options.colorStart));
    material.setParameter('uColorMid', new Float32Array(options.colorMid));
    material.setParameter('uColorEnd', new Float32Array(options.colorEnd));
    material.setParameter('uColorMidAt', options.colorMidAt ?? 0.5);
    material.setParameter('uVelocity', new Float32Array(options.velocity));
    material.setParameter('uVelocityEnd', new Float32Array(options.velocityEnd));
    material.setParameter('uRadialSpeed', options.radialSpeed ?? 0);
    material.setParameter('uRadialSpeedEnd', options.radialSpeedEnd ?? 0);
    material.setParameter('uStretch', options.stretch ?? 0);
    material.setParameter('uPreWarm', options.preWarm === false ? 0 : 1);
    const fog = app.scene.fog;
    material.setParameter('uFogStart', fog.start);
    material.setParameter('uFogEnd', fog.end);
    material.setParameter('uFogColor', new Float32Array([fog.color.r, fog.color.g, fog.color.b]));
    material.setParameter('uAdditive', options.additive ? 1 : 0);
    material.update();

    const instance = new pc.MeshInstance(mesh, material);
    instance.castShadows = false;
    instance.receiveShadows = false;

    const entity = new pc.Entity('fx-particle-batch');
    entity.addComponent('render');
    const render = entity.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    render.meshInstances = [instance];
    entity.setLocalPosition(...options.position);
    if (options.yaw) entity.setLocalEulerAngles(0, options.yaw, 0);
    parent.addChild(entity);

    const travel =
      Math.max(
        Math.hypot(...options.velocity),
        Math.hypot(...options.velocityEnd)
      ) *
        options.lifetime +
      Math.max(
        Math.abs(options.radialSpeed ?? 0),
        Math.abs(options.radialSpeedEnd ?? 0)
      ) *
        options.lifetime;
    const maxSize = Math.max(options.sizeStart, options.sizeMid, options.sizeEnd);
    render.customAabb = new pc.BoundingBox(
      new pc.Vec3(0, 0, 0),
      new pc.Vec3(
        Math.max(1, ex / 2 + travel + maxSize),
        Math.max(1, ey / 2 + travel + maxSize),
        Math.max(1, ez / 2 + travel + maxSize)
      )
    );

    this.entity = entity;
    this.material = material;

    entity.on('destroy', () => {
      material.destroy();
      mesh.destroy();
    });
  }

  update(dt: number): void {
    this.time += dt;
    this.material.setParameter('uTime', this.time);
  }

  destroy(): void {
    this.entity.destroy();
  }
}
