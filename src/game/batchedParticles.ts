import * as pc from 'playcanvas';

/**
 * Partículas ambientales por lotes con movimiento analítico.
 *
 * PlayCanvas simula cada `ParticleSystem` con una pasada de render a una textura
 * por emisor y lo dibuja con un draw call propio. Un mapa como `caldera` tiene
 * decenas de emisores ambientales (polvo, humo, niebla, brasas…), así que solo
 * en envíos se iba una parte importante del frame.
 *
 * Aquí todas las motas de un mismo tipo comparten una malla y un material: la
 * posición, la deriva y el desvanecido se calculan en el vertex shader a partir
 * del tiempo, sin simulación por CPU ni una pasada de GPU por emisor. El
 * resultado es **un draw call por tipo y vista** en lugar de uno por emisor.
 */

/** Opciones visuales de un tipo de partícula. Compartidas por todas sus motas. */
export interface ParticleTypeOptions {
  /** Textura de la mota (ya generada por `textures.ts`). */
  texture: pc.Texture;
  /** `true` para blending aditivo (brasas, polen, chispas, fuegos fatuos). */
  additive?: boolean;
  /** Color RGB al nacer y al morir; se interpola durante la vida. */
  colorStart: readonly [number, number, number];
  colorEnd: readonly [number, number, number];
  /** Opacidad máxima de la curva de alfa (0-1). */
  opacity: number;
  /** Tamaño del quad en unidades de mundo: al nacer, a mitad y al morir. */
  sizeStart: number;
  sizeMid: number;
  sizeEnd: number;
  /** Vida de una mota, en segundos. */
  lifetime: number;
  /** Fracción de la vida que tarda en aparecer y en empezar a desvanecerse. */
  fadeIn: number;
  fadeOut: number;
  /** Deriva media en unidades por segundo (x, y, z). */
  drift: readonly [number, number, number];
  /** Amplitud (u) y velocidad (rad/s) del vaivén que rompe la línea recta. */
  sway: number;
  swaySpeed: number;
  /** Orden de dibujo dentro de las capas transparentes. */
  drawOrder?: number;
}

interface EmitterSpec {
  x: number;
  y: number;
  z: number;
  /** Tamaño completo de la caja de emisión, como en PlayCanvas. */
  ex: number;
  ey: number;
  ez: number;
  count: number;
  seed: number;
}

interface Batch {
  readonly key: string;
  readonly options: ParticleTypeOptions;
  readonly emitters: EmitterSpec[];
  material?: pc.ShaderMaterial;
  mesh?: pc.Mesh;
}

/** Generador determinista: el mapa debe verse igual en cada carga. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const VERTEX_GLSL = `
attribute vec3 aPosition;
attribute vec2 aUv0;
attribute vec3 aCenter;
attribute vec3 aSpeed;
attribute vec4 aParams;
attribute vec2 aSway;

uniform mat4 matrix_view;
uniform mat4 matrix_projection;
uniform float uTime;
uniform float uSizeStart;
uniform float uSizeMid;
uniform float uSizeEnd;
uniform float uFadeIn;
uniform float uFadeOut;
uniform float uOpacity;
uniform vec3 uColorStart;
uniform vec3 uColorEnd;
uniform float uFogStart;
uniform float uFogEnd;

varying vec2 vUv;
varying vec4 vTint;
varying float vFog;

void main(void) {
  float lifetime = max(aParams.y, 0.001);
  float t = fract(uTime / lifetime + aParams.x);

  // Movimiento analítico: deriva constante + vaivén. Al reiniciarse la vida la
  // mota vuelve al origen, pero el alfa es 0 en los dos extremos y el salto no
  // se ve.
  vec3 center = aCenter + aSpeed * (t * lifetime);
  float phase = aParams.w * 6.2831853;
  float w = uTime * aSway.y;
  center.x += sin(w + phase) * aSway.x;
  center.z += cos(w * 0.83 + phase * 1.7) * aSway.x * 0.7;
  center.y += sin(w * 1.37 + phase * 0.6) * aSway.x * 0.3;

  vec4 viewCenter = matrix_view * vec4(center, 1.0);
  float depth = -viewCenter.z;
  vUv = aUv0;

  // Más allá del final de la niebla la mota es invisible: se descarta antes de
  // rasterizar para no pagar su relleno.
  if (depth > uFogEnd) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vTint = vec4(0.0);
    vFog = 1.0;
    return;
  }

  float size = mix(uSizeStart, uSizeMid, clamp(t * 2.0, 0.0, 1.0));
  if (t > 0.5) size = mix(uSizeMid, uSizeEnd, (t - 0.5) * 2.0);
  size *= aParams.z;
  viewCenter.xy += aPosition.xy * size;
  gl_Position = matrix_projection * viewCenter;

  float fade = smoothstep(0.0, uFadeIn, t) * (1.0 - smoothstep(uFadeOut, 1.0, t));
  vTint = vec4(mix(uColorStart, uColorEnd, t), fade * uOpacity);
  vFog = clamp((depth - uFogStart) / max(uFogEnd - uFogStart, 0.001), 0.0, 1.0);
}
`;

const FRAGMENT_GLSL = `
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

  // El aditivo de PlayCanvas multiplica el color por el alfa antes de sumar;
  // así las brasas y el polen no dejan un cuadrado brillante.
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
attribute aSpeed: vec3f;
attribute aParams: vec4f;
attribute aSway: vec2f;

uniform matrix_view: mat4x4f;
uniform matrix_projection: mat4x4f;
uniform uTime: f32;
uniform uSizeStart: f32;
uniform uSizeMid: f32;
uniform uSizeEnd: f32;
uniform uFadeIn: f32;
uniform uFadeOut: f32;
uniform uOpacity: f32;
uniform uColorStart: vec3f;
uniform uColorEnd: vec3f;
uniform uFogStart: f32;
uniform uFogEnd: f32;

varying vUv: vec2f;
varying vTint: vec4f;
varying vFog: f32;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let lifetime = max(aParams.y, 0.001);
  let t = fract(uniform.uTime / lifetime + aParams.x);

  var center = aCenter + aSpeed * (t * lifetime);
  let phase = aParams.w * 6.2831853;
  let w = uniform.uTime * aSway.y;
  center.x += sin(w + phase) * aSway.x;
  center.z += cos(w * 0.83 + phase * 1.7) * aSway.x * 0.7;
  center.y += sin(w * 1.37 + phase * 0.6) * aSway.x * 0.3;

  var viewCenter = uniform.matrix_view * vec4f(center, 1.0);
  let depth = -viewCenter.z;
  output.vUv = aUv0;

  if (depth > uniform.uFogEnd) {
    output.position = vec4f(2.0, 2.0, 2.0, 1.0);
    output.vTint = vec4f(0.0);
    output.vFog = 1.0;
    return output;
  }

  var size = mix(uniform.uSizeStart, uniform.uSizeMid, clamp(t * 2.0, 0.0, 1.0));
  if (t > 0.5) {
    size = mix(uniform.uSizeMid, uniform.uSizeEnd, (t - 0.5) * 2.0);
  }
  size *= aParams.z;
  viewCenter.x += aPosition.x * size;
  viewCenter.y += aPosition.y * size;
  output.position = uniform.matrix_projection * viewCenter;

  let fade = smoothstep(0.0, uniform.uFadeIn, t) * (1.0 - smoothstep(uniform.uFadeOut, 1.0, t));
  output.vTint = vec4f(mix(uniform.uColorStart, uniform.uColorEnd, t), fade * uniform.uOpacity);
  output.vFog = clamp((depth - uniform.uFogStart) / max(uniform.uFogEnd - uniform.uFogStart, 0.001), 0.0, 1.0);
  return output;
}
`;

const FRAGMENT_WGSL = `
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

export class BatchedParticles {
  private readonly batches = new Map<string, Batch>();
  private readonly built: Batch[] = [];
  private readonly fogColor = new Float32Array(3);
  private time = 0;
  private fogStart = -1;
  private fogEnd = -1;
  private fogR = -1;
  private fogG = -1;
  private fogB = -1;

  /** Declara un tipo de partícula. Los tipos sin motas no se construyen. */
  define(key: string, options: ParticleTypeOptions): void {
    this.batches.set(key, { key, options, emitters: [] });
  }

  /**
   * Añade un foco de emisión. `extents` es el tamaño **completo** de la caja
   * (igual que `emitterExtents` de PlayCanvas), no la mitad.
   */
  emit(
    key: string,
    position: readonly [number, number, number],
    extents: pc.Vec3,
    count: number,
    seed: number
  ): void {
    const batch = this.batches.get(key);
    if (!batch || count <= 0) return;
    batch.emitters.push({
      x: position[0],
      y: position[1],
      z: position[2],
      ex: extents.x,
      ey: extents.y,
      ez: extents.z,
      count,
      seed
    });
  }

  /**
   * Crea una malla, un material y un `MeshInstance` por tipo. La caja de la
   * malla abarca el mapa porque las posiciones reales van en atributos y la
   * geometría solo son las esquinas del billboard.
   */
  build(
    device: pc.GraphicsDevice,
    root: pc.Entity,
    halfSize: { x: number; z: number }
  ): void {
    for (const batch of this.batches.values()) {
      const total = batch.emitters.reduce((sum, emitter) => sum + emitter.count, 0);
      if (total === 0) continue;

      const vertexCount = total * 4;
      const positions = new Float32Array(vertexCount * 3);
      const uvs = new Float32Array(vertexCount * 2);
      const centers = new Float32Array(vertexCount * 3);
      const speeds = new Float32Array(vertexCount * 3);
      const params = new Float32Array(vertexCount * 4);
      const sways = new Float32Array(vertexCount * 2);
      const indices = new Uint32Array(total * 6);

      const { drift, sway, swaySpeed, lifetime } = batch.options;
      let particle = 0;

      for (const emitter of batch.emitters) {
        const rand = mulberry32(emitter.seed);
        for (let i = 0; i < emitter.count; i++) {
          const sx = emitter.x + (rand() - 0.5) * emitter.ex;
          const sy = emitter.y + (rand() - 0.5) * emitter.ey;
          const sz = emitter.z + (rand() - 0.5) * emitter.ez;
          const speedScale = 0.7 + rand() * 0.6;
          const sizeJitter = 0.85 + rand() * 0.3;
          const phase = rand();
          const seed = rand();

          for (let corner = 0; corner < 4; corner++) {
            const cx = corner === 0 || corner === 3 ? -1 : 1;
            const cy = corner < 2 ? -1 : 1;
            const vertex = particle * 4 + corner;
            const p3 = vertex * 3;
            const p2 = vertex * 2;
            const p4 = vertex * 4;

            positions[p3] = cx;
            positions[p3 + 1] = cy;
            positions[p3 + 2] = 0;
            uvs[p2] = 0.5 + cx * 0.5;
            uvs[p2 + 1] = 0.5 - cy * 0.5;

            centers[p3] = sx;
            centers[p3 + 1] = sy;
            centers[p3 + 2] = sz;

            speeds[p3] = drift[0] * speedScale;
            speeds[p3 + 1] = drift[1] * speedScale;
            speeds[p3 + 2] = drift[2] * speedScale;

            params[p4] = phase;
            params[p4 + 1] = lifetime;
            params[p4 + 2] = sizeJitter;
            params[p4 + 3] = seed;

            sways[p2] = sway;
            sways[p2 + 1] = swaySpeed;
          }

          const index = particle * 6;
          const base = particle * 4;
          indices[index] = base;
          indices[index + 1] = base + 1;
          indices[index + 2] = base + 2;
          indices[index + 3] = base;
          indices[index + 4] = base + 2;
          indices[index + 5] = base + 3;
          particle++;
        }
      }

      const mesh = new pc.Mesh(device);
      mesh.setPositions(positions);
      mesh.setUvs(0, uvs);
      mesh.setVertexStream(pc.SEMANTIC_ATTR6, centers, 3);
      mesh.setVertexStream(pc.SEMANTIC_ATTR7, speeds, 3);
      mesh.setVertexStream(pc.SEMANTIC_ATTR8, params, 4);
      mesh.setVertexStream(pc.SEMANTIC_ATTR9, sways, 2);
      mesh.setIndices(indices);
      mesh.update();

      const options = batch.options;
      const material = new pc.ShaderMaterial({
        uniqueName: `ambient-particles-${batch.key}`,
        vertexGLSL: VERTEX_GLSL,
        fragmentGLSL: FRAGMENT_GLSL,
        vertexWGSL: VERTEX_WGSL,
        fragmentWGSL: FRAGMENT_WGSL,
        attributes: {
          aPosition: pc.SEMANTIC_POSITION,
          aUv0: pc.SEMANTIC_TEXCOORD0,
          aCenter: pc.SEMANTIC_ATTR6,
          aSpeed: pc.SEMANTIC_ATTR7,
          aParams: pc.SEMANTIC_ATTR8,
          aSway: pc.SEMANTIC_ATTR9
        }
      });
      material.blendType = options.additive ? pc.BLEND_ADDITIVE : pc.BLEND_NORMAL;
      material.depthWrite = false;
      material.depthTest = true;
      material.cull = pc.CULLFACE_NONE;
      material.setParameter('uMap', options.texture);
      material.setParameter('uTime', 0);
      material.setParameter('uSizeStart', options.sizeStart);
      material.setParameter('uSizeMid', options.sizeMid);
      material.setParameter('uSizeEnd', options.sizeEnd);
      material.setParameter('uFadeIn', Math.max(options.fadeIn, 0.001));
      material.setParameter('uFadeOut', options.fadeOut);
      material.setParameter('uOpacity', options.opacity);
      material.setParameter('uColorStart', new Float32Array(options.colorStart));
      material.setParameter('uColorEnd', new Float32Array(options.colorEnd));
      material.setParameter('uFogStart', 0);
      material.setParameter('uFogEnd', 1000);
      material.setParameter('uFogColor', this.fogColor);
      material.setParameter('uAdditive', options.additive ? 1 : 0);
      material.update();

      const instance = new pc.MeshInstance(mesh, material);
      instance.castShadows = false;
      instance.receiveShadows = false;
      instance.drawOrder = options.drawOrder ?? 0;

      const entity = new pc.Entity(`ambient-particles-${batch.key}`);
      entity.addComponent('render');
      const render = entity.render!;
      render.meshInstances = [instance];
      render.castShadows = false;
      render.receiveShadows = false;
      render.customAabb = new pc.BoundingBox(
        new pc.Vec3(0, 2, 0),
        new pc.Vec3(halfSize.x + 2, 8, halfSize.z + 2)
      );
      root.addChild(entity);

      batch.material = material;
      batch.mesh = mesh;
      this.built.push(batch);
    }
  }

  /** Avanza el tiempo y sincroniza la niebla de la escena con los materiales. */
  update(dt: number, fog: pc.FogParams): void {
    this.time += dt;
    const start = fog.start;
    const end = fog.end;
    const color = fog.color;
    const fogChanged =
      start !== this.fogStart ||
      end !== this.fogEnd ||
      color.r !== this.fogR ||
      color.g !== this.fogG ||
      color.b !== this.fogB;
    if (fogChanged) {
      this.fogStart = start;
      this.fogEnd = end;
      this.fogR = color.r;
      this.fogG = color.g;
      this.fogB = color.b;
      this.fogColor[0] = color.r;
      this.fogColor[1] = color.g;
      this.fogColor[2] = color.b;
    }

    for (const batch of this.built) {
      const material = batch.material;
      if (!material) continue;
      material.setParameter('uTime', this.time);
      if (fogChanged) {
        material.setParameter('uFogStart', start);
        material.setParameter('uFogEnd', end);
        material.setParameter('uFogColor', this.fogColor);
      }
    }
  }

  destroy(): void {
    for (const batch of this.built) {
      batch.material?.destroy();
      batch.mesh?.destroy();
      batch.material = undefined;
      batch.mesh = undefined;
    }
    this.built.length = 0;
  }
}
