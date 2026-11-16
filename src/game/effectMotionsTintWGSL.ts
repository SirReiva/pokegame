/**
 * Versiones WGSL de los movimientos usados por `EffectTintBatch`.
 *
 * Este lote permite color y alfa por instancia, así que aquí viven los
 * movimientos de capas que antes necesitaban una entidad y un material por
 * elemento: arcos y ondas del melee, capas de haz y decoración de proyectiles.
 */

/** Arcos de golpe del melee: cada frente sale con su propio retardo. */
export const MOTION_TINT_MELEE_ARCS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a0.x) / max(a0.y, 0.001), 0.0, 1.0);
  let ease = 1.0 - pow(1.0 - local, 3.0);
  let radius = uniform.uEffectRadius * (a0.z + (1.0 - a0.z) * ease);
  return effectTRS(
    vec3f(0.0, a0.w, 0.0),
    vec3f(max(0.001, radius), 1.0, max(0.001, radius)),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Ondas psíquicas del melee: frentes curvos con fase y ritmo propios. */
export const MOTION_TINT_MELEE_WAVES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a0.x) / max(a0.y, 0.001), 0.0, 1.0);
  let ease = 1.0 - (1.0 - local) * (1.0 - local);
  let radius = uniform.uEffectRadius * (0.1 + 0.95 * ease);
  let lift = a0.z + sin(uniform.uEffectTime * 8.0 + a1.y) * 0.025;
  return effectTRS(
    vec3f(0.0, lift, 0.0),
    vec3f(max(0.001, radius), 1.0, max(0.001, radius)),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  let angle = atan2(vertexPosition.x, vertexPosition.z);
  let edge = select(0.0, 1.0, length(vertexPosition.xz) >= 0.97);
  let wave = sin(
    angle * a1.z +
    uniform.uEffectTime * 11.0 +
    a1.y +
    edge * 0.9
  ) * a1.x;
  return vec3f(vertexPosition.x, wave, vertexPosition.z);
}
`;

/** Capas del cuerpo de un haz: se revelan desde el lanzador a la punta. */
export const MOTION_TINT_BEAM_LAYER_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let revealDur = max(uniform.uEffectParam0, 0.001);
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / revealDur), 2.0);
  let visible = max(0.04, uniform.uEffectRadius * reveal);
  return effectTRS(
    vec3f(0.0, 0.0, visible * 0.5),
    vec3f(a0.x, a0.x, visible),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Bultos que viajan por el cuerpo del haz. */
export const MOTION_TINT_BEAM_BULGES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let revealDur = max(uniform.uEffectParam0, 0.001);
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / revealDur), 2.0);
  let visible = max(0.04, uniform.uEffectRadius * reveal);
  let phase = fract(a0.x + uniform.uEffectTime * a0.y);
  let wobble = sin(uniform.uEffectTime * a0.z + a0.x * 6.2831853);
  let size = a0.w * (0.82 + wobble * 0.22);
  return effectTRS(
    vec3f(
      sin(uniform.uEffectTime * 13.0 + a0.x * 6.2831853) * a1.x * 0.7,
      cos(uniform.uEffectTime * 11.0 + a0.x * 6.2831853) * a1.x * 0.5,
      phase * visible
    ),
    vec3f(size, size, size * 1.6),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Vetas blancas que recorren el núcleo del haz. */
export const MOTION_TINT_BEAM_STREAKS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let revealDur = max(uniform.uEffectParam0, 0.001);
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / revealDur), 2.0);
  let visible = max(0.04, uniform.uEffectRadius * reveal);
  let phase = fract(a0.x + uniform.uEffectTime * a0.y);
  let thickness = max(0.02, a1.x * 0.09);
  return effectTRS(
    vec3f(a0.z, a0.w, phase * visible),
    vec3f(thickness, thickness, max(0.04, a1.y)),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Espuma que pulsa en la boca del haz. */
export const MOTION_TINT_BEAM_FOAM_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let revealDur = max(uniform.uEffectParam0, 0.001);
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / revealDur), 2.0);
  let pulse = 0.8 + sin(uniform.uEffectTime * 34.0 + a0.y) * 0.28;
  let size = a0.x * pulse;
  return effectTRS(
    vec3f(
      sin(uniform.uEffectTime * 18.0 + a0.y) * a1.x * 0.28,
      cos(uniform.uEffectTime * 16.0 + a0.y) * a1.x * 0.22,
      a0.z * reveal
    ),
    vec3f(size, size, size),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Gotas de la salpicadura de la punta del haz. */
export const MOTION_TINT_BEAM_DROPS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let revealDur = max(uniform.uEffectParam0, 0.001);
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / revealDur), 2.0);
  let visible = max(0.04, uniform.uEffectRadius * reveal);
  let phase = fract(a0.w + uniform.uEffectTime * a1.y);
  let distance = a0.y * phase;
  let fade = max(0.0, 1.0 - phase);
  let scale = max(0.001, a1.x * fade);
  return effectTRS(
    vec3f(
      cos(a0.x) * distance,
      sin(phase * EFFECT_PI) * a0.z,
      visible + sin(a0.x) * distance * 0.55
    ),
    vec3f(scale),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Lenguas de fuego que cubren el chorro del haz ígneo. */
export const MOTION_TINT_BEAM_FIRE_LICKS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let revealDur = max(uniform.uEffectParam0, 0.001);
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / revealDur), 2.0);
  let visible = max(0.04, uniform.uEffectRadius * reveal);
  if (a0.y > visible) {
    return effectTRS(vec3f(0.0), vec3f(0.0001), effectRotY(0.0));
  }
  let phase = a0.x;
  let pulse = 0.78 + sin(uniform.uEffectTime * 21.0 + phase) * 0.24;
  let stretch = 0.86 + sin(uniform.uEffectTime * 17.0 + phase * 1.3) * 0.22;
  let sway = sin(uniform.uEffectTime * 11.0 + phase) * uniform.uEffectParam1 * 0.55;
  let rise = cos(uniform.uEffectTime * 8.0 + phase) * uniform.uEffectParam1 * 0.55;
  let widthNow = a1.x * pulse;
  let heightNow = a1.y * stretch;
  let yaw = a1.w * EFFECT_DEG;
  var rotation: mat4x4f;
  if (instance_anim2.y > 0.5) {
    rotation = effectEulerZYX(
      0.0,
      yaw + sin(uniform.uEffectTime * 6.0 + phase) * 18.0 * EFFECT_DEG,
      sin(uniform.uEffectTime * 13.0 + phase) * 8.0 * EFFECT_DEG
    );
  } else {
    rotation = effectEulerZYX(
      a1.z * EFFECT_DEG,
      yaw + sin(uniform.uEffectTime * 9.0 + phase) * 14.0 * EFFECT_DEG,
      instance_anim2.x * EFFECT_DEG + sin(uniform.uEffectTime * 15.0 + phase) * 12.0 * EFFECT_DEG
    );
  }
  return effectTRS(
    vec3f(a0.z + sway, a0.w + rise, a0.y),
    vec3f(widthNow, heightNow, widthNow),
    rotation
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Cilindro del cuerpo de un haz (eje Y rotado al eje del haz). */
export const MOTION_TINT_BEAM_CYLINDER_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let revealDur = max(uniform.uEffectParam0, 0.001);
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / revealDur), 2.0);
  let visible = max(0.02, uniform.uEffectRadius * reveal);
  let pulse = uniform.uEffectParam1;
  return effectTRS(
    vec3f(0.0, 0.0, visible * 0.5),
    vec3f(a0.x * pulse, visible, a0.y * pulse),
    effectRotX(90.0 * EFFECT_DEG)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Segmentos rectangulares en hélice de los haces de aire. */
export const MOTION_TINT_BEAM_RIBBONS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let revealDur = max(uniform.uEffectParam0, 0.001);
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / revealDur), 2.0);
  let visible = max(0.02, uniform.uEffectRadius * reveal);
  let angle =
    a0.x + uniform.uEffectTime * uniform.uEffectParam1 + a0.y * EFFECT_PI * uniform.uEffectParam2;
  let radius = a0.z * (0.85 + uniform.uEffectParam3 * 0.2);
  return effectTRS(
    vec3f(cos(angle) * radius, sin(angle) * radius, a0.y * visible),
    vec3f(a1.x, a1.x, a1.y),
    effectEulerZYX(0.0, -angle, angle + 20.0 * EFFECT_DEG)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Hojas en hélice de los haces de Planta. */
export const MOTION_TINT_BEAM_LEAVES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let revealDur = max(uniform.uEffectParam0, 0.001);
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / revealDur), 2.0);
  let visible = max(0.02, uniform.uEffectRadius * reveal);
  let angle =
    a0.x + uniform.uEffectTime * uniform.uEffectParam1 + a0.y * EFFECT_PI * uniform.uEffectParam2;
  let radius = a0.z;
  let scale = a1.x * (0.8 + uniform.uEffectParam3 * 0.2);
  return effectTRS(
    vec3f(cos(angle) * radius, sin(angle) * radius, a0.y * visible),
    vec3f(scale, scale * 1.8, scale),
    effectEulerZYX(
      sin(uniform.uEffectTime * 10.0 + a0.w) * 35.0 * EFFECT_DEG,
      angle + uniform.uEffectTime * 220.0 * EFFECT_DEG,
      cos(uniform.uEffectTime * 8.0 + a0.w) * 45.0 * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Anillos que recorren el haz de aire, planta o hielo. */
export const MOTION_TINT_BEAM_RINGS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let revealDur = max(uniform.uEffectParam0, 0.001);
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / revealDur), 2.0);
  let visible = max(0.02, uniform.uEffectRadius * reveal);
  let path = fract(uniform.uEffectTime * uniform.uEffectParam1 + a0.x * 0.25);
  let scale =
    uniform.uEffectParam2 * (1.4 + sin(path * EFFECT_PI) * 1.1) * uniform.uEffectParam3;
  return effectTRS(
    vec3f(0.0, 0.0, visible * (0.08 + path * 0.92)),
    vec3f(scale, scale, scale),
    effectEulerZYX(
      90.0 * EFFECT_DEG,
      0.0,
      (uniform.uEffectTime * 180.0 + a0.x * 40.0) * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Plumas que escoltan el haz de aire. */
export const MOTION_TINT_BEAM_FEATHERS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let revealDur = max(uniform.uEffectParam0, 0.001);
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / revealDur), 2.0);
  let visible = max(0.02, uniform.uEffectRadius * reveal);
  let local = min(1.0, uniform.uEffectTime / 0.4);
  let angle = a0.x + uniform.uEffectTime * 3.2;
  let radius = uniform.uEffectParam1 * (1.2 + local * 0.7);
  let scale = a0.z * max(0.0, 1.0 - local * 0.7);
  return effectTRS(
    vec3f(cos(angle) * radius, sin(angle) * radius, a0.y * visible),
    vec3f(scale, scale * 2.1, scale),
    effectEulerZYX(
      sin(uniform.uEffectTime * 9.0 + a0.w) * 35.0 * EFFECT_DEG,
      angle + uniform.uEffectTime * 160.0 * EFFECT_DEG,
      cos(uniform.uEffectTime * 8.0 + a0.w) * 45.0 * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Cristales incrustados y de la punta del haz de hielo. */
export const MOTION_ICE_BEAM_CRYSTALS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let revealDur = max(uniform.uEffectParam0, 0.001);
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / revealDur), 2.0);
  let visible = max(0.02, uniform.uEffectRadius * reveal);
  let pulse = uniform.uEffectParam1;
  var angle: f32;
  var pos: vec3f;
  var rotation: mat4x4f;
  var size: vec3f;
  if (a1.y > 0.5) {
    angle = a0.y + uniform.uEffectTime * 3.0;
    pos = vec3f(
      cos(angle) * uniform.uEffectParam2,
      sin(angle) * uniform.uEffectParam2,
      visible
    );
    rotation = effectEulerZYX(
      uniform.uEffectTime * 160.0 * EFFECT_DEG,
      angle,
      uniform.uEffectTime * 90.0 * EFFECT_DEG
    );
    size = vec3f(a0.w * 0.65, a0.w * 2.0, a0.w * 0.65);
  } else {
    angle = a0.y + uniform.uEffectTime * 4.5 + a1.x;
    let radius = a0.z * (0.85 + pulse * 0.25);
    let scale = a0.w * (0.75 + sin(uniform.uEffectTime * 8.0 + a1.x) * 0.2);
    pos = vec3f(cos(angle) * radius, sin(angle) * radius, a0.x * visible);
    rotation = effectEulerZYX(
      (uniform.uEffectTime * 120.0 + a1.x * 40.0) * EFFECT_DEG,
      angle,
      uniform.uEffectTime * 80.0 * EFFECT_DEG
    );
    size = vec3f(scale * 0.7, scale * 1.9, scale * 0.7);
  }
  return effectTRS(pos, size, rotation);
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Neblina que gira alrededor del haz de hielo. */
export const MOTION_TINT_BEAM_MIST_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let revealDur = max(uniform.uEffectParam0, 0.001);
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / revealDur), 2.0);
  let visible = max(0.02, uniform.uEffectRadius * reveal);
  let angle = a0.y + uniform.uEffectTime * 2.4;
  let scale =
    a0.z * (0.7 + sin(uniform.uEffectTime * 5.0 + a0.y) * 0.2);
  return effectTRS(
    vec3f(
      cos(angle) * uniform.uEffectParam1 * 1.2,
      sin(angle) * uniform.uEffectParam1 * 0.8,
      a0.x * visible
    ),
    vec3f(scale, scale * 0.7, scale),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Núcleo y halos de un proyectil que laten a distinta velocidad. */
export const MOTION_TINT_PROJECTILE_BODY_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let pulse = 1.0 + sin(uniform.uEffectTime * a0.x + a0.y) * a0.z;
  var result = base;
  result[0] = result[0] * pulse;
  result[1] = result[1] * pulse;
  result[2] = result[2] * pulse;
  return result;
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Dos lenguas de fuego que forman la cola de un proyectil. */
export const MOTION_TINT_PROJECTILE_FLAME_TAIL_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let stretch = a1.w + sin(uniform.uEffectTime * a0.x + a0.z) * 0.2;
  let sway = 1.0 + sin(uniform.uEffectTime * a0.y + a0.w) * instance_anim2.x;
  let roll =
    a1.z + sin(uniform.uEffectTime * instance_anim2.z + a0.w) * instance_anim2.y;
  return effectTRS(
    base[3].xyz,
    vec3f(a1.x * sway, a1.y * stretch, a1.x * sway),
    effectEulerZYX(-90.0 * EFFECT_DEG, 0.0, roll * EFFECT_DEG)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Jirones que orbitan el proyectil de sombra. */
export const MOTION_TINT_PROJECTILE_ORBIT_WISPS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let angle = a0.x + uniform.uEffectTime * 5.2;
  return effectTRS(
    vec3f(
      cos(angle) * a0.y,
      sin(angle * 1.4) * uniform.uEffectRadius * 0.8,
      sin(angle) * a0.y
    ),
    vec3f(a1.x, a1.x, a1.y),
    effectEulerZYX(
      0.0,
      -angle,
      sin(angle * 2.0) * 40.0 * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Piedras del proyectil de roca: giran como un único boulder. */
export const MOTION_PROJECTILE_ROCK_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  return effectTRS(
    base[3].xyz,
    vec3f(instance_anim2.x, instance_anim2.y, instance_anim2.z),
    effectEulerZYX(
      (a0.x + uniform.uEffectTime * a1.x) * EFFECT_DEG,
      (a0.y + uniform.uEffectTime * a1.y) * EFFECT_DEG,
      (a0.z + uniform.uEffectTime * a1.z) * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;
