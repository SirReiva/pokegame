/**
 * Versiones WGSL de los movimientos de proyectiles.
 *
 * Se separaron de `effectMotionsWGSL.ts` para mantener cada archivo por
 * debajo del límite de tamaño del guardarraíl de arquitectura.
 */

/**
 * Estela de un proyectil: cuentas alineadas en −Z que se mecen y laten.
 * `anim0 = [fase, z local, tamaño, alargamiento]`;
 * `anim1 = [vaivén X, vaivén Y, velocidad de pulso, 0]`.
 */
export const MOTION_PROJECTILE_WAKE_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let pulse = 1.0 + sin(uniform.uEffectTime * a1.z + a0.x) * 0.12;
  let size = max(0.0001, a0.z * pulse);
  let pos = vec3f(
    sin(uniform.uEffectTime * 8.0 + a0.x) * a1.x,
    cos(uniform.uEffectTime * 10.0 + a0.x) * a1.y,
    a0.y
  );
  return effectTRS(
    pos,
    vec3f(size, size, size * a0.w),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/**
 * Gotas o motas que orbitan alrededor del eje del proyectil.
 * `anim0 = [ángulo base, velocidad angular, factor de órbita, fase]`;
 * `anim1 = [tamaño, frecuencia vertical, amplitud vertical, vaivén Z]`;
 * `anim2 = [alargamiento Z, fase vertical, 0, 0]`.
 */
export const MOTION_PROJECTILE_ORBIT_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let angle = a0.x + uniform.uEffectTime * a0.y;
  let orbit = uniform.uEffectRadius * a0.z;
  let zStretch = select(1.0, instance_anim2.x, instance_anim2.x > 0.0);
  let yPhase = instance_anim2.y;
  return effectTRS(
    vec3f(
      cos(angle) * orbit,
      sin(angle * a1.y + yPhase) * uniform.uEffectRadius * a1.z,
      base[3].z + sin(uniform.uEffectTime * 13.0 + a0.w) * uniform.uEffectRadius * a1.w
    ),
    vec3f(
      max(0.0001, a1.x),
      max(0.0001, a1.x),
      max(0.0001, a1.x * zStretch)
    ),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/**
 * Aros de presión que se expanden y avanzan por el eje del proyectil.
 * `anim1 = [radio base, crecimiento, velocidad, avance]`.
 */
export const MOTION_PROJECTILE_RING_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let phase = fract(uniform.uEffectTime * a1.z + a0.x);
  let scale = uniform.uEffectRadius * (a1.x + phase * a1.y);
  let z = base[3].z + phase * uniform.uEffectRadius * a1.w;
  return effectTRS(
    vec3f(0.0, 0.0, z),
    vec3f(max(0.0001, scale)),
    effectRotX(90.0 * EFFECT_DEG)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Aspas de viento que giran sobre el eje de vuelo. */
export const MOTION_PROJECTILE_BLADES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let angle = (a0.x + uniform.uEffectTime * a0.y) * EFFECT_DEG;
  let yaw = a0.z * EFFECT_DEG;
  return effectTRS(
    vec3f(0.0),
    vec3f(max(0.0001, a1.x)),
    effectEuler(0.0, yaw, angle)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Plumas que flotan detrás de un proyectil. */
export const MOTION_PROJECTILE_FEATHERS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let radius = uniform.uEffectRadius;
  let size = max(0.0001, a1.z);
  return effectTRS(
    vec3f(
      a0.x * radius + sin(uniform.uEffectTime * 9.0 + a0.w) * a1.x,
      a0.y * radius + sin(uniform.uEffectTime * 7.0 + a0.w) * a1.y,
      a0.z * radius
    ),
    vec3f(size, size * 2.444, size),
    effectEulerZYX(
      sin(uniform.uEffectTime * 8.0 + a0.w) * 25.0 * EFFECT_DEG,
      (uniform.uEffectTime * a1.w + a0.w * 40.0) * EFFECT_DEG,
      cos(uniform.uEffectTime * 7.0 + a0.w) * 30.0 * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Jirones rectangulares de la estela. */
export const MOTION_PROJECTILE_TRAIL_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let radius = uniform.uEffectRadius;
  return effectTRS(
    vec3f(0.0, a0.y * radius * 0.45, -radius * 2.2),
    vec3f(a1.x, a1.y, a1.z),
    effectEulerZYX(
      0.0,
      sin(uniform.uEffectTime * 10.0 + a0.x) * 14.0 * EFFECT_DEG,
      a0.z * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Motas que orbitan en el plano XZ con un vaivén vertical. */
export const MOTION_PROJECTILE_ORBIT_XZ_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let angle = a0.x + uniform.uEffectTime * a0.y;
  let orbit = uniform.uEffectRadius * a0.z;
  return effectTRS(
    vec3f(
      cos(angle) * orbit,
      sin(angle * a1.y + a0.w) * uniform.uEffectRadius * a1.z,
      sin(angle) * orbit
    ),
    vec3f(max(0.0001, a1.x)),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Aros que giran sobre su centro con una velocidad por eje. */
export const MOTION_PROJECTILE_SPIN_RING_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let angles = vec3f(
    a0.x + uniform.uEffectTime * a1.x,
    a0.y + uniform.uEffectTime * a1.y,
    a0.z + uniform.uEffectTime * a1.z
  ) * EFFECT_DEG;
  return effectTRS(
    base[3].xyz,
    vec3f(max(0.0001, a1.w)),
    effectEulerZYX(angles.x, angles.y, angles.z)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Jirones que ondean detrás de un proyectil fantasma. */
export const MOTION_PROJECTILE_WISPS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let wave = sin(uniform.uEffectTime * 8.0 + a0.x);
  let scale = max(
    0.0001,
    uniform.uEffectRadius * a0.z *
      (0.85 + sin(uniform.uEffectTime * 13.0 + a0.x) * 0.15)
  );
  return effectTRS(
    vec3f(
      wave * uniform.uEffectRadius * 0.55,
      sin(uniform.uEffectTime * 5.0 + a0.x) * uniform.uEffectRadius * 0.45,
      a0.y * uniform.uEffectRadius
    ),
    vec3f(scale, scale, scale * 2.4),
    effectEulerZYX(
      0.0,
      wave * 22.0 * EFFECT_DEG,
      sin(uniform.uEffectTime * 7.0 + a0.x) * 18.0 * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Ojos que parpadean. */
export const MOTION_PROJECTILE_EYES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let blink = select(1.0, 0.08, sin(uniform.uEffectTime * 4.2) > 0.965);
  return effectTRS(
    vec3f(
      a0.x * uniform.uEffectRadius,
      a0.y * uniform.uEffectRadius,
      a0.z * uniform.uEffectRadius
    ),
    vec3f(
      a1.x * uniform.uEffectRadius,
      a1.y * uniform.uEffectRadius * blink,
      a1.z * uniform.uEffectRadius
    ),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Grupo de burbujas: órbita del grupo más desplazamiento local rotado. */
export const MOTION_PROJECTILE_BUBBLE_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let angle = a0.x + uniform.uEffectTime * a0.y;
  let orbit = uniform.uEffectRadius * a0.z;
  let group = vec3f(
    cos(angle) * orbit,
    sin(angle) * orbit + sin(uniform.uEffectTime * 6.0 + a0.w) * uniform.uEffectRadius * 0.12,
    sin(angle * 2.0 + a0.x) * uniform.uEffectRadius * 0.3
  );
  let rot = effectEuler(
    (uniform.uEffectTime * 150.0 + a0.x * 40.0) * EFFECT_DEG,
    (uniform.uEffectTime * 210.0 + a0.x * 30.0) * EFFECT_DEG,
    0.0
  );
  let offset = (rot * vec4f(a1.yzw, 0.0)).xyz;
  let pulse = 1.0 + sin(uniform.uEffectTime * 14.0 + a0.x) * instance_anim2.x;
  return effectTRS(
    group + offset,
    vec3f(max(0.0001, a1.x * pulse)),
    rot
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;
