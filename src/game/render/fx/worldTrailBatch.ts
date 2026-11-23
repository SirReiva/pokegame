import * as pc from 'playcanvas';
import {
  PARTICLE_FRAGMENT_GLSL,
  PARTICLE_FRAGMENT_WGSL,
  mulberry32
} from './effectParticleBatch';

/**
 * Estela de partículas en **espacio de mundo** para proyectiles.
 *
 * El emisor original de PlayCanvas usaba `localSpace: false`: cada partícula se
 * quedaba donde nacía mientras el proyectil avanzaba. Aquí la CPU solo emite
 * una partícula cada `rate` segundos en la posición mundial del proyectil y el
 * vertex shader calcula su edad, tamaño y color. Es un draw call, sin pasada de
 * simulación ni `preWarm`.
 */

export interface WorldTrailBatchOptions {
  texture: pc.Texture;
  additive: boolean;
  colorStart: readonly [number, number, number];
  colorMid: readonly [number, number, number];
  colorEnd: readonly [number, number, number];
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
  stretch?: number;
  rate: number;
  maxParticles: number;
  preWarm?: boolean;
  seed?: number;
}

const FLOATS_PER_VERTEX = 12;

const VERTEX_GLSL = `
attribute vec3 aPosition;
attribute vec2 aUv0;
attribute vec3 aCenter;
attribute vec4 aParams;

uniform mat4 matrix_view;
uniform mat4 matrix_projection;
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
uniform float uFogStart;
uniform float uFogEnd;

varying vec2 vUv;
varying vec4 vTint;
varying float vFog;

void main(void) {
  float age = uTime - aParams.x;
  vUv = aUv0;
  if (age < 0.0 || age > uLife) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vTint = vec4(0.0);
    vFog = 1.0;
    return;
  }

  float t = clamp(age / max(uLife, 0.001), 0.0, 1.0);
  vec3 center = aCenter + mix(uVelocity, uVelocityEnd, t) * age;
  float radial = mix(uRadialSpeed, uRadialSpeedEnd, t) * age;
  center.x += cos(aParams.z) * radial;
  center.z += sin(aParams.z) * radial;

  vec4 viewCenter = matrix_view * vec4(center, 1.0);
  float depth = -viewCenter.z;
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

const VERTEX_WGSL = `
attribute aPosition: vec3f;
attribute aUv0: vec2f;
attribute aCenter: vec3f;
attribute aParams: vec4f;

uniform matrix_view: mat4x4f;
uniform matrix_projection: mat4x4f;
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
uniform uFogStart: f32;
uniform uFogEnd: f32;

varying vUv: vec2f;
varying vTint: vec4f;
varying vFog: f32;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let age = uniform.uTime - aParams.x;
  output.vUv = aUv0;
  if (age < 0.0 || age > uniform.uLife) {
    output.position = vec4f(2.0, 2.0, 2.0, 1.0);
    output.vTint = vec4f(0.0);
    output.vFog = 1.0;
    return output;
  }

  let t = clamp(age / max(uniform.uLife, 0.001), 0.0, 1.0);
  var center = aCenter + mix(uniform.uVelocity, uniform.uVelocityEnd, t) * age;
  let radial = mix(uniform.uRadialSpeed, uniform.uRadialSpeedEnd, t) * age;
  center.x += cos(aParams.z) * radial;
  center.z += sin(aParams.z) * radial;

  var viewCenter = uniform.matrix_view * vec4f(center, 1.0);
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

const FORMATS = new WeakMap<pc.GraphicsDevice, pc.VertexFormat>();

function getFormat(device: pc.GraphicsDevice): pc.VertexFormat {
  let format = FORMATS.get(device);
  if (!format) {
    format = new pc.VertexFormat(device, [
      { semantic: pc.SEMANTIC_POSITION, components: 3, type: pc.TYPE_FLOAT32 },
      { semantic: pc.SEMANTIC_TEXCOORD0, components: 2, type: pc.TYPE_FLOAT32 },
      { semantic: pc.SEMANTIC_ATTR6, components: 3, type: pc.TYPE_FLOAT32 },
      { semantic: pc.SEMANTIC_ATTR7, components: 4, type: pc.TYPE_FLOAT32 }
    ]);
    FORMATS.set(device, format);
  }
  return format;
}

let nextSeed = 0x7f4a7c15;

export class WorldTrailBatch {
  readonly entity: pc.Entity;
  private readonly material: pc.ShaderMaterial;
  private readonly buffer: pc.VertexBuffer;
  private readonly data: Float32Array;
  private readonly source: pc.Entity;
  private readonly options: WorldTrailBatchOptions;
  private readonly rand: () => number;
  private readonly maxParticles: number;
  private cursor = 0;
  private time = 0;
  private emit = 0;

  constructor(
    app: pc.AppBase,
    source: pc.Entity,
    options: WorldTrailBatchOptions
  ) {
    const device = app.graphicsDevice;
    const maxParticles = Math.max(1, options.maxParticles);
    const vertexCount = maxParticles * 4;
    const indexCount = maxParticles * 6;
    const data = new Float32Array(vertexCount * FLOATS_PER_VERTEX);
    const indices = new Uint32Array(indexCount);
    const rand = mulberry32(options.seed ?? nextSeed++);

    for (let particle = 0; particle < maxParticles; particle++) {
      for (let corner = 0; corner < 4; corner++) {
        const vx = corner === 0 || corner === 3 ? -1 : 1;
        const vy = corner < 2 ? -1 : 1;
        const offset = (particle * 4 + corner) * FLOATS_PER_VERTEX;
        data[offset] = vx;
        data[offset + 1] = vy;
        data[offset + 2] = 0;
        data[offset + 3] = 0.5 + vx * 0.5;
        data[offset + 4] = 0.5 - vy * 0.5;
        data[offset + 5] = 0;
        data[offset + 6] = 0;
        data[offset + 7] = 0;
        data[offset + 8] = -1000;
        data[offset + 9] = 1;
        data[offset + 10] = 0;
        data[offset + 11] = 0;
      }
      const index = particle * 6;
      const base = particle * 4;
      indices[index] = base;
      indices[index + 1] = base + 1;
      indices[index + 2] = base + 2;
      indices[index + 3] = base;
      indices[index + 4] = base + 2;
      indices[index + 5] = base + 3;
    }

    const buffer = new pc.VertexBuffer(device, getFormat(device), vertexCount, {
      data,
      usage: pc.BUFFER_DYNAMIC
    });
    const indexBuffer = new pc.IndexBuffer(
      device,
      pc.INDEXFORMAT_UINT32,
      indexCount,
      pc.BUFFER_STATIC,
      indices
    );
    const mesh = new pc.Mesh(device);
    mesh.vertexBuffer = buffer;
    mesh.indexBuffer[0] = indexBuffer;
    mesh.primitive[0].type = pc.PRIMITIVE_TRIANGLES;
    mesh.primitive[0].base = 0;
    mesh.primitive[0].count = indexCount;
    mesh.primitive[0].indexed = true;

    const material = new pc.ShaderMaterial({
      // Nombre estable por la misma razón que en `EffectTintBatch`: la clave
      // del programa incluye `uniqueName` y un contador por lote compilaba un
      // shader nuevo para cada estela.
      uniqueName: 'fx-world-trail',
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
    material.name = 'fx:trail';
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
    const fog = app.scene.fog;
    material.setParameter('uFogStart', fog.start);
    material.setParameter('uFogEnd', fog.end);
    material.setParameter('uFogColor', new Float32Array([fog.color.r, fog.color.g, fog.color.b]));
    material.setParameter('uAdditive', options.additive ? 1 : 0);
    material.update();

    const instance = new pc.MeshInstance(mesh, material);
    instance.castShadows = false;
    instance.receiveShadows = false;

    const entity = new pc.Entity('fx-world-trail');
    entity.addComponent('render');
    const render = entity.render!;
    render.castShadows = false;
    render.receiveShadows = false;
    render.meshInstances = [instance];
    render.customAabb = new pc.BoundingBox(
      new pc.Vec3(0, 0, 0),
      new pc.Vec3(64, 32, 64)
    );
    source.addChild(entity);

    this.entity = entity;
    this.material = material;
    this.buffer = buffer;
    this.data = data;
    this.source = source;
    this.options = options;
    this.rand = rand;
    this.maxParticles = maxParticles;

    entity.on('destroy', () => {
      material.destroy();
      mesh.destroy();
      buffer.destroy();
      indexBuffer.destroy();
    });

    // Precalentado sin simulación: varias motas en el origen con edades
    // repartidas, como el `preWarm` del emisor original.
    const prewarm =
      options.preWarm === false
        ? 1
        : Math.min(
            maxParticles,
            Math.max(1, Math.ceil(options.lifetime / Math.max(options.rate, 1e-6)))
          );
    for (let index = 0; index < prewarm; index++) {
      this.spawn(-index * options.rate);
    }
    this.buffer.setData(this.data);
  }

  private spawn(birth = this.time): void {
    const position = this.source.getPosition();
    const particle = this.cursor;
    const sizeJitter = 0.85 + this.rand() * 0.3;
    const radialAngle = this.rand() * Math.PI * 2;
    for (let corner = 0; corner < 4; corner++) {
      const offset = (particle * 4 + corner) * FLOATS_PER_VERTEX;
      this.data[offset + 5] = position.x;
      this.data[offset + 6] = position.y;
      this.data[offset + 7] = position.z;
      this.data[offset + 8] = birth;
      this.data[offset + 9] = sizeJitter;
      this.data[offset + 10] = radialAngle;
      this.data[offset + 11] = 0;
    }
    this.cursor = (this.cursor + 1) % this.maxParticles;
  }

  update(dt: number): void {
    this.time += dt;
    this.emit += dt;
    let spawned = false;
    let emitted = 0;
    while (this.emit >= this.options.rate && emitted < this.maxParticles) {
      this.emit -= this.options.rate;
      this.spawn();
      emitted++;
      spawned = true;
    }
    if (spawned) this.buffer.setData(this.data);
    this.material.setParameter('uTime', this.time);
  }

  destroy(): void {
    this.entity.destroy();
  }
}
