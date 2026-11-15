/**
 * Versiones WGSL de los movimientos de impactos.
 *
 * Se separaron de `effectMotionsWGSL.ts` para mantener cada archivo por debajo
 * del límite de tamaño del guardarraíl de arquitectura.
 */

/** Motas y jirones que salen del centro de un impacto. */
export const MOTION_IMPACT_RADIAL_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let t = clamp(uniform.uEffectTime / max(uniform.uEffectLife, 0.001), 0.0, 1.0);
  let local = clamp((t - a1.x) / max(a1.y, 0.001), 0.0, 1.0);
  let distance = a0.y * local;
  let angle = a0.x + local * instance_anim2.x;
  let fade = max(0.0, 1.0 - local);
  let size = a0.w * fade;
  return effectTRS(
    vec3f(
      cos(angle) * distance,
      a1.z + sin(local * EFFECT_PI) * a0.z,
      sin(angle) * distance
    ),
    vec3f(size, size, size * instance_anim2.y),
    effectEulerZYX(
      local * a1.w * EFFECT_DEG,
      angle / EFFECT_DEG,
      local * instance_anim2.z * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Aros que se expanden desde el centro de un impacto. */
export const MOTION_IMPACT_RINGS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let t = clamp(uniform.uEffectTime / max(uniform.uEffectLife, 0.001), 0.0, 1.0);
  let ease = 1.0 - pow(1.0 - t, 3.0);
  let scale = (a1.y + ease * (a1.z + a0.y)) * a1.x;
  return effectTRS(
    vec3f(0.0, a0.x, 0.0),
    vec3f(max(0.0001, scale), 1.0, max(0.0001, scale)),
    effectEulerZYX(a0.z * EFFECT_DEG, t * a0.w * EFFECT_DEG, 0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Líneas de impacto de un clúster de Lucha. */
export const MOTION_FIGHTING_LINES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let t = clamp(uniform.uEffectTime / max(uniform.uEffectLife, 0.001), 0.0, 1.0);
  let local = clamp((t - a1.x) / max(a1.y, 0.001), 0.0, 1.0);
  let fade = max(0.0, 1.0 - local);
  let distance = (0.1 + local * 0.45) * a1.z;
  return effectTRS(
    vec3f(
      a0.x + sin(a0.w) * distance,
      a0.y,
      a0.z + cos(a0.w) * distance
    ),
    vec3f(0.035 * fade, 0.035 * fade, (0.16 + local * 0.42) * fade),
    effectRotY(a0.w)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Núcleos de los clústeres de Lucha. */
export const MOTION_FIGHTING_CORES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let t = clamp(uniform.uEffectTime / max(uniform.uEffectLife, 0.001), 0.0, 1.0);
  let local = clamp((t - a0.w) / 0.32, 0.0, 1.0);
  let appear = select(0.0, 1.0, local > 0.0);
  let scale = (0.08 + local * 0.42) * appear * a1.x;
  return effectTRS(
    vec3f(a0.x, a0.y, a0.z),
    vec3f(max(0.0001, scale)),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Puffs que crecen y se dispersan en un impacto. */
export const MOTION_IMPACT_PUFFS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let t = clamp(uniform.uEffectTime / max(uniform.uEffectLife, 0.001), 0.0, 1.0);
  let local = clamp((t - a1.x) / max(a1.y, 0.001), 0.0, 1.0);
  let distance = a0.y * local;
  let grow = 1.0 + local * instance_anim2.x;
  let fade = max(0.0, 1.0 - local);
  let size = max(0.0001, a0.w * grow * fade);
  return effectTRS(
    vec3f(
      cos(a0.x) * distance,
      a1.z + sin(local * EFFECT_PI) * a0.z,
      sin(a0.x) * distance
    ),
    vec3f(size, size * a1.w, size),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Llamas del impacto de fuego. */
export const MOTION_FIRE_BURST_FLAMES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let t = clamp(uniform.uEffectTime / max(uniform.uEffectLife, 0.001), 0.0, 1.0);
  let life = min(1.0, t / 0.12) * (1.0 - max(0.0, (t - 0.3) / 0.7));
  let sway = sin(t * 21.0 + a0.z) * 0.2;
  let scaleNow = max(0.001, life);
  return effectTRS(
    vec3f(a0.x * (1.0 + t * 0.4), 0.08 + t * 1.05, a0.y * (1.0 + t * 0.4)),
    vec3f(
      max(0.0001, a1.x * scaleNow * (1.0 + sway * 0.3)),
      max(0.0001, a1.y * scaleNow * (1.05 + sway)),
      max(0.0001, a1.x * scaleNow * (1.0 + sway * 0.3))
    ),
    effectEulerZYX(
      0.0,
      (a0.w + t * 70.0) * EFFECT_DEG,
      sin(t * 18.0 + a0.z) * 10.0 * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Chispas del impacto de fuego. */
export const MOTION_FIRE_BURST_SPARKS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let t = clamp(uniform.uEffectTime / max(uniform.uEffectLife, 0.001), 0.0, 1.0);
  let travel = t * 0.42;
  let y = a0.w * travel - 4.2 * travel * travel;
  let sparkLife =
    max(0.0, 1.0 - t) * (0.8 + sin(t * 30.0 + a1.x) * 0.2);
  let size = max(0.0001, sparkLife * a1.y);
  return effectTRS(
    vec3f(
      a0.x * a0.z * travel,
      max(0.03, 0.35 + y),
      a0.y * a0.z * travel
    ),
    vec3f(size),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Esquirlas del impacto de mordida. */
export const MOTION_JAW_SHARDS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let t = clamp(uniform.uEffectTime / max(uniform.uEffectLife, 0.001), 0.0, 1.0);
  let local = clamp((t - a1.x) / 0.7, 0.0, 1.0);
  let travel = 1.0 - (1.0 - local) * (1.0 - local);
  let grow = 1.0 - local * 0.6;
  return effectTRS(
    vec3f(
      cos(a0.x) * a0.y * travel,
      0.1 + a0.z * travel,
      sin(a0.x) * a0.y * travel
    ),
    vec3f(
      max(0.0001, 0.09 * a1.z * grow),
      max(0.0001, a0.w * grow),
      max(0.0001, 0.09 * a1.z * grow)
    ),
    effectEulerZYX(
      local * 320.0 * EFFECT_DEG,
      local * a1.y * EFFECT_DEG,
      local * 180.0 * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;
