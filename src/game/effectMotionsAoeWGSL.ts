/**
 * Versiones WGSL de los movimientos de áreas con muchos escombros.
 *
 * Se separaron de `effectMotionsWGSL.ts` para mantener cada archivo por debajo
 * del límite de tamaño del guardarraíl de arquitectura.
 */

/** Olas de choque del área psíquica: tres frentes con retardo. */
export const MOTION_PSYCHIC_RINGS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let progress = clamp(
    (uniform.uEffectTime - a0.x) / max(a0.y, 0.001),
    0.0,
    1.0
  );
  let ease = 1.0 - (1.0 - progress) * (1.0 - progress);
  let scale = max(0.01, uniform.uEffectRadius * 2.0 * ease);
  return effectTRS(
    vec3f(0.0, a0.z, 0.0),
    vec3f(scale, 1.0, scale),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Olas de choque del cráter de `Excavar`. */
export const MOTION_BURROW_WAVES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let waveT = min(1.0, uniform.uEffectTime / 0.4);
  let wave = 1.0 - pow(1.0 - waveT, 3.0);
  let scale = max(
    0.001,
    uniform.uEffectRadius * 2.0 * (0.25 + wave * (1.5 + a0.x * 0.5))
  );
  return effectTRS(
    vec3f(0.0, a0.y, 0.0),
    vec3f(scale, 1.0, scale),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Grietas que se abren en el cráter de `Excavar`. */
export const MOTION_BURROW_CRACKS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let burst = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / 0.12), 3.0);
  let reach = a0.y * burst;
  let width = max(0.001, a0.w * burst);
  return effectTRS(
    vec3f(sin(a0.x) * reach * 0.5, 0.03, cos(a0.x) * reach * 0.5),
    vec3f(width, 0.02, max(0.001, reach)),
    effectRotY(a0.x)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Losas que saltan del cráter de `Excavar`. */
export const MOTION_BURROW_SLABS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a1.y) / 0.55, 0.0, 1.0);
  let ease = 1.0 - pow(1.0 - local, 2.0);
  let distance = a0.y * ease;
  let height = sin(local * EFFECT_PI) * a0.w;
  let fade = min(1.0, local / 0.08) *
    max(0.0, 1.0 - max(0.0, local - 0.72) / 0.28);
  let scale = a0.z * fade;
  return effectTRS(
    vec3f(sin(a0.x) * distance, 0.04 + height, cos(a0.x) * distance),
    vec3f(
      max(0.001, scale),
      max(0.001, scale * 0.38),
      max(0.001, scale * 0.8)
    ),
    effectEulerZYX(
      a1.x * local * EFFECT_DEG,
      a0.x,
      a1.x * 0.45 * local * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Rocas despedidas por el cráter de `Excavar`. */
export const MOTION_BURROW_ROCKS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a1.y) / 0.7, 0.0, 1.0);
  let ease = 1.0 - pow(1.0 - local, 2.0);
  let distance = a0.y * ease;
  let height = sin(local * EFFECT_PI) * a0.w;
  let fade = max(0.0, 1.0 - local);
  let scale = a0.z * (1.0 - local * 0.35) * fade;
  return effectTRS(
    vec3f(sin(a0.x) * distance, 0.1 + height, cos(a0.x) * distance),
    vec3f(
      max(0.001, scale),
      max(0.001, scale * 0.82),
      max(0.001, scale * 0.94)
    ),
    effectEulerZYX(
      local * 300.0 * EFFECT_DEG,
      a0.x + local * a1.x * EFFECT_DEG,
      local * 190.0 * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Puffs de polvo que suben del cráter de `Excavar`. */
export const MOTION_BURROW_PUFFS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a1.y) / 0.6, 0.0, 1.0);
  let ease = 1.0 - pow(1.0 - local, 2.0);
  let distance = a0.y * ease;
  let rise = a0.w * ease;
  let fade = max(0.0, 1.0 - local);
  let scale = a0.z * (0.5 + ease * 1.5) * fade;
  return effectTRS(
    vec3f(sin(a0.x) * distance, 0.12 + rise, cos(a0.x) * distance),
    vec3f(max(0.001, scale), max(0.001, scale * 0.72), max(0.001, scale)),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Aros de escarcha de `Viento Gélido` y `Ventisca`. */
export const MOTION_ICE_RINGS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let grow = 1.0 - pow(
    1.0 - min(1.0, uniform.uEffectTime / max(a0.z, 0.001)),
    2.0
  );
  let scale = max(0.001, uniform.uEffectRadius * (a0.w + grow * a1.x));
  return effectTRS(
    vec3f(0.0, a0.y, 0.0),
    vec3f(scale, 1.0, scale),
    effectRotY(uniform.uEffectTime * a0.x * EFFECT_DEG)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;
