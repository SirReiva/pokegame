/**
 * Versiones WGSL de los `MOTION_*` de `effectBatch.ts`.
 *
 * Cada constante define las mismas funciones que su gemela GLSL:
 * `effectModel(base, a0, a1)` y `effectLocalPosition(vertexPosition, a0, a1)`.
 * Las utilidades comunes (`effectTRS`, `effectEuler`, `EFFECT_PI`…) las aporta
 * el chunk que las envuelve en `effectBatch.ts`.
 *
 * Se mantienen en un archivo aparte para que el par GLSL/WGSL sea fácil de
 * revisar sin que `effectBatch.ts` crezca hasta las dos mil líneas, pero el
 * emparejamiento es explícito en `MOTION_WGSL_SOURCES` (allí se detecta si
 * falta alguno).
 */

/** Lote estático: la transformación de cada instancia ya viene en su matriz. */
export const MOTION_STATIC_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  return base;
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Animación de hojas en espiral de `Lluevehojas`. */
export const MOTION_GRASS_LEAVES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let p = fract(uniform.uEffectTime * a0.w + a0.z);
  let angle = a0.x + uniform.uEffectTime * 7.2 + p * 2.6 * EFFECT_PI;
  let funnel = 0.45 + 0.55 * p;
  let dist = uniform.uEffectRadius * a0.y * funnel;
  let y = 0.05 + p * uniform.uEffectRadius * 0.45;
  let fade = min(1.0, p / 0.1) * min(1.0, (1.0 - p) / 0.18);
  let envelope = effectEnvelope(0.12, 0.25);
  let pulse = 0.8 + sin(uniform.uEffectTime * 6.0 + a0.z * 10.0) * 0.2;
  let s = max(0.0001, a1.y * fade * pulse * envelope);
  let pitch = sin(uniform.uEffectTime * 2.4 + a0.z * 6.28318530718) * 22.0 * EFFECT_DEG;
  let yaw = (a1.z + uniform.uEffectTime * 900.0 * a1.x + p * 540.0) * EFFECT_DEG;
  let roll = cos(uniform.uEffectTime * 2.0 + a0.z * 6.28318530718) * 18.0 * EFFECT_DEG;
  return effectTRS(
    vec3f(cos(angle) * dist, y, sin(angle) * dist),
    vec3f(s, s * 1.75, s),
    effectEuler(pitch, yaw, roll)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Nubes del huracán de `Ciclón`: suben y bajan y respiran en escala. */
export const MOTION_CYCLONE_PUFFS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let bob = sin(uniform.uEffectTime * 2.6 + a0.x) * (0.03 + a0.y * 0.012);
  let pulse = 0.9 + sin(uniform.uEffectTime * 3.2 + a0.x) * 0.1;
  var result = base;
  result[3].y = result[3].y + bob;
  return result * effectScale(vec3f(pulse));
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Llamas de `Onda Ígnea` y `Llama Final`: crecen, parpadean y se mecen. */
export const MOTION_HEAT_FLAMES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let growIn = max(0.0001, uniform.uEffectParam2);
  let delay = fract(a0.x) * growIn * 0.3;
  let localIn = clamp((uniform.uEffectTime - delay) / growIn, 0.0, 1.0);
  let envelope = effectEnvelope(uniform.uEffectParam0, uniform.uEffectParam1);
  let flicker = 0.88 + sin(uniform.uEffectTime * 11.0 + a0.x * 1.7) * 0.12;
  let sway = sin(uniform.uEffectTime * 6.5 + a0.x) * 0.2;
  let scale = max(0.001, localIn * envelope);
  let yaw = (a0.w + uniform.uEffectTime * 10.0 + sin(uniform.uEffectTime * 3.0 + a0.x) * 10.0) * EFFECT_DEG;
  let roll = sin(uniform.uEffectTime * 4.0 + a0.x) * 7.0 * EFFECT_DEG;
  let pos = vec3f(
    cos(a0.y) * a0.z,
    max(0.0, sway * uniform.uEffectRadius * 0.05),
    sin(a0.y) * a0.z
  );
  return effectTRS(
    pos,
    vec3f(a1.x * scale * flicker, a1.y * scale * (1.05 + sway), a1.x * scale * flicker),
    effectEuler(0.0, yaw, roll)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Brasas de `Onda Ígnea`: suben, se abren y se apagan. */
export const MOTION_HEAT_EMBERS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let progress = min(1.0, uniform.uEffectTime / max(0.2, uniform.uEffectLife * 0.8));
  let angle = a0.x + uniform.uEffectTime * 1.6;
  let dist = a0.y * (0.5 + progress * 0.7);
  let fade = max(0.0, 1.0 - progress);
  let s = max(0.0001, a1.x * fade);
  return effectTRS(
    vec3f(cos(angle) * dist, 0.18 + progress * a0.z, sin(angle) * dist),
    vec3f(s),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Aspas de viento sobre las llamas: giran, crecen y respiran. */
export const MOTION_HEAT_BLADES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let envelope = effectEnvelope(uniform.uEffectParam0, uniform.uEffectParam1);
  let grow = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / max(0.0001, uniform.uEffectParam2)), 2.0);
  let scale = a0.x * uniform.uEffectRadius * (0.7 + grow * 0.45) * (0.85 + sin(uniform.uEffectTime * 7.0 + a0.y) * 0.12) * envelope;
  let yaw = (uniform.uEffectTime * 40.0 + a0.y * 60.0) * EFFECT_DEG;
  let roll = sin(uniform.uEffectTime * 4.0 + a0.y) * 18.0 * EFFECT_DEG;
  return effectTRS(
    base[3].xyz,
    vec3f(max(0.0001, scale)),
    effectEuler(90.0 * EFFECT_DEG, yaw, roll)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Chorros 3D de `Marea`: respiran en altura y grosor con fase propia. */
export const MOTION_WATER_JETS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let wave = 0.5 + 0.5 * sin(uniform.uEffectTime * a0.w * 6.28318530718 + a0.z);
  let height = a1.y * (0.55 + 0.45 * wave);
  let width = a1.x * (0.92 + 0.12 * wave);
  let yaw = (a1.z + sin(uniform.uEffectTime * 1.2 + a0.z) * 5.0) * EFFECT_DEG;
  return effectTRS(
    vec3f(a0.x, 0.0, a0.y),
    vec3f(width, height, width),
    effectRotY(yaw)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Esquirlas de `Psíquico`: salen del centro, giran y se desvanecen. */
export const MOTION_PSYCHIC_SHARDS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let travel = max(0.0001, a1.x);
  let local = clamp((uniform.uEffectTime - a0.w) / travel, 0.0, 1.0);
  let ease = 1.0 - (1.0 - local) * (1.0 - local);
  let distance = a0.z * ease;
  let angle = a0.x + sin(uniform.uEffectTime * 3.0 + a1.z) * 0.06;
  let y = 0.4 + a0.y * ease * uniform.uEffectRadius * 0.45;
  let fadeOut = min(1.0, max(0.0, (uniform.uEffectLife - uniform.uEffectTime) / max(0.0001, uniform.uEffectLife * 0.45)));
  let fade = min(1.0, local / 0.1) * min(1.0, (1.0 - local) / 0.25);
  let s = max(0.0001, a1.y * (0.6 + ease * 0.9) * max(0.0, fade) * fadeOut);
  let pitch = (uniform.uEffectTime * 160.0 + a1.z * 30.0) * EFFECT_DEG;
  let yaw = (uniform.uEffectTime * 210.0 + a1.z * 40.0) * EFFECT_DEG;
  let roll = sin(uniform.uEffectTime * 5.0 + a1.z) * 24.0 * EFFECT_DEG;
  return effectTRS(
    vec3f(cos(angle) * distance, y, sin(angle) * distance),
    vec3f(s),
    effectEuler(pitch, yaw, roll)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/**
 * Cuerpo del haz de `Psíquico`: tres esferas estiradas crecen desde el
 * lanzador hasta la punta. La longitud viaja en `uEffectParam0`.
 */
export const MOTION_PSYCHIC_BEAM_BODY_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let reveal = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / 0.1), 2.0);
  let length = max(0.0001, uniform.uEffectParam0 * reveal);
  let pulse = 0.9 + sin(uniform.uEffectTime * 34.0) * 0.08;
  let fade = effectEnvelope(0.05, 0.22);
  let width = max(0.0001, a0.x * pulse * fade);
  return effectTRS(
    vec3f(0.0, 0.0, length * 0.5),
    vec3f(width, width, length),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/**
 * Aros del haz de `Psíquico`: recorren la línea, se mecen, giran y se ondulan.
 * `anim0 = [offset, inclinación, giro, fase]`; `anim1.x` es la escala base.
 */
export const MOTION_PSYCHIC_BEAM_RINGS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let time = uniform.uEffectTime;
  let reveal = 1.0 - pow(1.0 - min(1.0, time / 0.1), 2.0);
  let path = fract(time * 2.5 + a0.x);
  let sway = uniform.uEffectParam1 * 0.22;
  let pulse = 0.9 + sin(time * 34.0) * 0.08;
  let fade = effectEnvelope(0.04, 0.22);
  let scale = max(
    0.0001,
    a1.x * (0.7 + pulse * 0.5) *
    (0.55 + sin(path * EFFECT_PI) * 0.9) * fade
  );
  let position = vec3f(
    sin(time * 9.0 + a0.x * 6.28318530718) * sway,
    cos(time * 7.0 + a0.x * 6.28318530718) * sway,
    uniform.uEffectParam0 * reveal * (0.06 + path * 0.94)
  );
  let tilt = (90.0 + a0.y) * EFFECT_DEG;
  let swayYaw = sin(time * 5.0 + a0.x * 6.0) * 18.0 * EFFECT_DEG;
  let spin = (time * a0.z + a0.x * 180.0) * EFFECT_DEG;
  return effectTRS(position, vec3f(scale), effectEuler(tilt, swayYaw, spin));
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  let angle = atan2(vertexPosition.x, vertexPosition.z);
  let wave = sin(angle * 4.0 + uniform.uEffectTime * 11.0 + a0.w * 6.28318530718);
  return vec3f(
    vertexPosition.x,
    vertexPosition.y + wave * uniform.uEffectParam2,
    vertexPosition.z
  );
}
`;

/** Fogonazos del haz de `Psíquico`: `anim0 = [z, retardo, escala, giroX]`. */
export const MOTION_PSYCHIC_BEAM_FLASH_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a0.y) / 0.16, 0.0, 1.0);
  let ease = 1.0 - pow(1.0 - local, 2.0);
  let fade = effectEnvelope(0.02, 0.2);
  let scale = max(
    0.0001,
    a0.z * (0.35 + ease * 0.65) * (1.0 - local) * fade
  );
  return effectTRS(
    vec3f(0.0, 0.0, a0.x),
    vec3f(scale),
    effectRotX(a0.w * EFFECT_DEG)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/**
 * Aros de la esfera de `Psíquico`: miran a cámara, giran, crecen y se ondulan.
 * `anim0 = [offsetX, offsetY, tamaño, retardo]`; `anim1 = [giro, fase, 0, 0]`.
 */
export const MOTION_PSYCHIC_ORB_RINGS_WGSL = `
#ifndef LINEAR_DEPTH
uniform matrix_view: mat4x4f;
#endif

fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let time = uniform.uEffectTime;
  let local = clamp((time - a0.w) / 0.22, 0.0, 1.0);
  let ease = 1.0 - pow(1.0 - local, 2.0);
  let fade = effectEnvelope(0.04, 0.26);
  let scale = max(
    0.0001,
    a0.z * (0.22 + 0.78 * ease) *
    (0.98 + sin(time * 11.0 + a1.y) * 0.02) * fade
  );
  let right = vec3f(uniform.matrix_view[0][0], uniform.matrix_view[1][0], uniform.matrix_view[2][0]);
  let up = vec3f(uniform.matrix_view[0][1], uniform.matrix_view[1][1], uniform.matrix_view[2][1]);
  let forward = vec3f(uniform.matrix_view[0][2], uniform.matrix_view[1][2], uniform.matrix_view[2][2]);
  let spin = (time * a1.x + a1.y * 41.0) * EFFECT_DEG;
  let spinRight = right * cos(spin) + up * sin(spin);
  let spinUp = up * cos(spin) - right * sin(spin);
  let billboard = mat4x4f(
    vec4f(spinRight, 0.0),
    vec4f(forward, 0.0),
    vec4f(spinUp, 0.0),
    vec4f(0.0, 0.0, 0.0, 1.0)
  );
  let position = vec3f(0.0, uniform.uEffectParam0, 0.0) + right * a0.x + up * a0.y;
  return effectTRS(position, vec3f(scale), billboard);
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  let angle = atan2(vertexPosition.x, vertexPosition.z);
  let wave = sin(angle * 5.0 + uniform.uEffectTime * 11.0 + a1.y * 6.28318530718);
  let radial = normalize(vertexPosition.xz);
  return vec3f(
    vertexPosition.x + radial.x * wave * uniform.uEffectParam2,
    vertexPosition.y,
    vertexPosition.z + radial.y * wave * uniform.uEffectParam2
  );
}
`;

/** Rayos del impacto psíquico: `anim0 = [ángulo, longitud, altura, retardo]`. */
export const MOTION_PSYCHIC_RAYS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a0.w) / 0.24, 0.0, 1.0);
  let ease = 1.0 - pow(1.0 - local, 3.0);
  let fadeIn = min(1.0, local * 4.0);
  let fadeOut = min(
    1.0,
    max(0.0, (uniform.uEffectLife - uniform.uEffectTime) / 0.28)
  );
  let fade = fadeIn * fadeOut;
  let length = max(0.0001, a0.y * ease);
  let distance = 0.08 + length * 0.5;
  let thickness = max(0.0001, a1.x * fade);
  return effectTRS(
    vec3f(
      sin(a0.x) * distance,
      uniform.uEffectParam0 + a0.z * ease,
      cos(a0.x) * distance
    ),
    vec3f(thickness, thickness, max(0.0001, length * fade)),
    effectRotY(a0.x)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Esfera de `Psíquico`: `anim0 = [diámetro, retardo, crecimiento, fundido]`. */
export const MOTION_PSYCHIC_SHELL_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a0.y) / max(0.0001, a0.z), 0.0, 1.0);
  let ease = 1.0 - pow(1.0 - local, 2.0);
  let lifeFade = effectEnvelope(0.05, uniform.uEffectParam1);
  var earlyFade = 1.0;
  if (a0.w > 0.0) {
    earlyFade = max(0.0, 1.0 - (uniform.uEffectTime - a0.y) / max(0.0001, a0.w));
  }
  let scale = max(0.0001, a0.x * (0.35 + 0.65 * ease) * lifeFade * earlyFade);
  return effectTRS(
    vec3f(0.0, uniform.uEffectParam0, 0.0),
    vec3f(scale),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/**
 * Aro exterior de `Psíquico` orientado a cámara. Usa `matrix_view` para que el
 * círculo mire a la cámara de cada vista.
 */
export const MOTION_PSYCHIC_RIM_WGSL = `
#ifndef LINEAR_DEPTH
uniform matrix_view: mat4x4f;
#endif

fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a0.y) / max(0.0001, a0.z), 0.0, 1.0);
  let ease = 1.0 - pow(1.0 - local, 2.0);
  let lifeFade = effectEnvelope(0.05, uniform.uEffectParam1);
  var earlyFade = 1.0;
  if (a0.w > 0.0) {
    earlyFade = max(0.0, 1.0 - (uniform.uEffectTime - a0.y) / max(0.0001, a0.w));
  }
  let scale = max(0.0001, a0.x * (0.35 + 0.65 * ease) * lifeFade * earlyFade);
  let right = vec3f(uniform.matrix_view[0][0], uniform.matrix_view[1][0], uniform.matrix_view[2][0]);
  let up = vec3f(uniform.matrix_view[0][1], uniform.matrix_view[1][1], uniform.matrix_view[2][1]);
  let forward = vec3f(uniform.matrix_view[0][2], uniform.matrix_view[1][2], uniform.matrix_view[2][2]);
  let billboard = mat4x4f(
    vec4f(right, 0.0),
    vec4f(forward, 0.0),
    vec4f(up, 0.0),
    vec4f(0.0, 0.0, 0.0, 1.0)
  );
  return effectTRS(
    vec3f(0.0, uniform.uEffectParam0, 0.0),
    vec3f(scale),
    billboard
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Cristales de `Ventisca`: caen, se clavan y se asientan. */
export const MOTION_BLIZZARD_CRYSTALS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = (uniform.uEffectTime - a0.z) / max(0.0001, a0.w);
  if (local <= 0.0) {
    return effectTRS(base[3].xyz, vec3f(0.0001), effectRotY(0.0));
  }
  let fall = min(1.0, local);
  let eased = fall * fall * fall;
  let y = a0.x + (a0.y - a0.x) * eased;
  let landed = local >= 1.0;
  let settle = select(0.0, min(1.0, (uniform.uEffectTime - (a0.z + a0.w)) / 0.16), landed);
  let endFade = min(1.0, max(0.0, (uniform.uEffectLife - uniform.uEffectTime) / 0.22));
  let appear = min(1.0, local * 6.0);
  let scale = appear * endFade;
  let extraTilt = select(0.0, sin(settle * EFFECT_PI) * 4.0 * EFFECT_DEG, landed);
  var result = base;
  result[3].y = result[3].y + y;
  result = result * effectEuler(extraTilt, 0.0, 0.0);
  return result * effectScale(
    vec3f(
      max(0.0001, a1.x * scale),
      max(0.0001, a1.y * scale),
      max(0.0001, a1.x * scale)
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Puffs de nieve que levantan los cristales al clavarse. */
export const MOTION_BLIZZARD_PUFFS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let puffLocal = clamp((uniform.uEffectTime - a0.y - a0.z) / 0.3, 0.0, 1.0);
  let envelope = effectEnvelope(0.12, 0.24);
  let scale = a0.x * (0.3 + puffLocal * 1.1) * max(0.0, 1.0 - puffLocal) * envelope;
  return effectTRS(
    base[3].xyz,
    vec3f(max(0.0001, scale), max(0.0001, scale * 0.7), max(0.0001, scale)),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Copos de `Ventisca`: caen con deriva y se encogen. */
export const MOTION_SNOWFLAKES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let fall = min(1.0, uniform.uEffectTime / max(0.0001, a0.y));
  let drift = sin(uniform.uEffectTime * 1.7 + a0.z) * uniform.uEffectRadius * 0.07;
  let side = cos(uniform.uEffectTime * 1.4 + a0.z) * uniform.uEffectRadius * 0.07;
  let scale = a0.w * (1.0 - fall * 0.5) * max(0.0, 1.0 - fall);
  let pos = vec3f(
    base[3].x + drift,
    0.1 + a0.x * (1.0 - fall),
    base[3].z + side
  );
  return effectTRS(pos, vec3f(max(0.0001, scale)), effectRotY(0.0));
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Grietas de `Falla`: cada losa emerge con su propio retardo. */
export const MOTION_FISSURE_BRANCHES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a0.x) / 0.14, 0.0, 1.0);
  let pop = 1.0 - pow(1.0 - local, 3.0);
  let sink = uniform.uEffectRadius * 0.02 * pop;
  var result = base;
  result[3].y = result[3].y - sink;
  result = result * effectScale(vec3f(0.5 + pop * 0.5, 1.0, 1.0));
  result = result * effectEuler(
    a0.y * pop * EFFECT_DEG,
    0.0,
    a0.y * 0.35 * pop * EFFECT_DEG
  );
  return result;
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Losas del suelo que saltan en `Falla`. */
export const MOTION_FISSURE_SLABS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a0.x) / 0.16, 0.0, 1.0);
  let pop = 1.0 - pow(1.0 - local, 3.0);
  let fadeOut = min(1.0, max(0.0, (uniform.uEffectLife - uniform.uEffectTime) / 0.2));
  let scale = max(0.001, pop * fadeOut);
  var result = base;
  result[3].y = result[3].y + uniform.uEffectRadius * 0.025 * pop;
  result = result * effectScale(vec3f(scale, scale, scale));
  result = result * effectEuler(
    a0.y * pop * EFFECT_DEG,
    0.0,
    a0.y * 0.4 * pop * EFFECT_DEG
  );
  return result;
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Estalagmitas de `Falla`. */
export const MOTION_FISSURE_SPIKES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a0.z) / 0.12, 0.0, 1.0);
  let pop = 1.0 - pow(1.0 - local, 3.0);
  let fadeOut = min(1.0, max(0.0, (uniform.uEffectLife - uniform.uEffectTime) / 0.2));
  let height = a0.x * pop * fadeOut;
  if (height <= 0.001) {
    return effectTRS(base[3].xyz, vec3f(0.001), effectRotY(0.0));
  }
  let width = max(0.001, a0.y * pop * fadeOut);
  var result = base;
  result[3].y = result[3].y + height * (pop - 0.5);
  result = result * effectScale(vec3f(width, height, width));
  result = result * effectEuler(
    a0.w * pop * EFFECT_DEG,
    0.0,
    a0.w * 0.35 * pop * EFFECT_DEG
  );
  return result;
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Piedras que salen despedidas en `Falla`. */
export const MOTION_FISSURE_PEBBLES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a0.w) / 0.4, 0.0, 1.0);
  if (local <= 0.0) {
    return effectTRS(vec3f(0.0), vec3f(0.001), effectRotY(0.0));
  }
  let distance = a0.y * local;
  let y = a1.x * 0.4 + sin(local * EFFECT_PI) * a0.z;
  let fadeOut = min(1.0, max(0.0, (uniform.uEffectLife - uniform.uEffectTime) / 0.2));
  let scale = a1.x * (1.0 - local * 0.55) * fadeOut;
  let pitch = local * 260.0 * EFFECT_DEG;
  let yaw = a0.x * EFFECT_DEG;
  let roll = local * a1.y * EFFECT_DEG;
  return effectTRS(
    vec3f(sin(a0.x) * distance, y, cos(a0.x) * distance),
    vec3f(max(0.001, scale), max(0.001, scale * 0.8), max(0.001, scale * 0.9)),
    effectEuler(pitch, yaw, roll)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Llamas del remolino de `Torbellino Ígneo`. */
export const MOTION_FIRE_WHIRL_FLAMES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let growIn = max(0.0001, uniform.uEffectParam2);
  let delay = fract(a0.w) * growIn * 0.25;
  let localIn = clamp((uniform.uEffectTime - delay) / growIn, 0.0, 1.0);
  let envelope = effectEnvelope(uniform.uEffectParam0, uniform.uEffectParam1);
  let scale = localIn * envelope;
  let angle = a0.x + uniform.uEffectTime * 2.8;
  let flicker = 0.85 + sin(uniform.uEffectTime * 9.0 + a0.w) * 0.15;
  let sway = sin(uniform.uEffectTime * 6.0 + a0.w) * 0.18;
  let size = vec3f(
    a1.x * scale * flicker,
    a1.y * scale * (1.05 + sway),
    a1.x * scale * flicker
  );
  let yaw = (90.0 - (angle * 180.0 / EFFECT_PI)) * EFFECT_DEG;
  let roll = sin(uniform.uEffectTime * 4.0 + a0.w) * 10.0 * EFFECT_DEG;
  return effectTRS(
    vec3f(cos(angle) * a0.y, 0.0, sin(angle) * a0.y),
    size,
    effectEuler(a0.z * EFFECT_DEG, yaw, roll)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Llamarada de `Fuego Sagrado`: las lenguas viajan del vértice a la base del cono. */
export const MOTION_FLAME_JET_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let p = fract(uniform.uEffectTime * max(0.0001, a0.w) + a0.x);
  let distance = p * uniform.uEffectRadius;
  // uEffectParam0 = tan(semiángulo); a1.z = factor radial 0..1.
  let radius = distance * uniform.uEffectParam0 * a1.z;
  let azimuth = a0.y;
  let grow = mix(0.85, 1.45, p);
  let flicker = 0.86 + sin(uniform.uEffectTime * 19.0 + a0.x * 53.0) * 0.14;
  let fadeIn = smoothstep(0.0, 0.06, p);
  let fadeOut = 1.0 - smoothstep(0.86, 1.0, p);
  let envelope = effectEnvelope(uniform.uEffectParam1, uniform.uEffectParam2) * fadeIn * fadeOut;
  let scale = max(0.0001, envelope * grow * flicker);
  let yaw = (azimuth / EFFECT_DEG + uniform.uEffectTime * 100.0 + a0.x * 360.0) * EFFECT_DEG;
  let pitch = (20.0 + sin(uniform.uEffectTime * 4.5 + a0.x * 6.28318530718) * 12.0) * EFFECT_DEG;
  let roll = sin(uniform.uEffectTime * 5.5 + a0.x * 6.28318530718) * 13.0 * EFFECT_DEG;
  let pos = vec3f(
    sin(azimuth) * radius,
    max(0.12, uniform.uEffectParam3 + cos(azimuth) * radius * 0.72),
    distance
  );
  return effectTRS(
    pos,
    vec3f(a1.x * scale, a1.y * scale, a1.x * scale),
    effectEuler(pitch, yaw, roll)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Rocío de `Paralizador`: viaja del vértice al borde del cono. */
export const MOTION_SPORE_SWARM_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let travel = max(0.0001, a1.x);
  let local = clamp((uniform.uEffectTime - a0.w) / travel, 0.0, 1.0);
  let ease = 1.0 - (1.0 - local) * (1.0 - local);
  let distance = a0.y * ease;
  let angle = a0.x + sin(uniform.uEffectTime * 2.4 + a1.z) * 0.035;
  let y = 0.55 + (a0.z - 0.55) * ease + sin(local * EFFECT_PI) * 0.18;
  let fade = min(1.0, local / 0.1) * min(1.0, (1.0 - local) / 0.15);
  let s = max(0.0001, a1.y * (0.7 + ease * 0.7) * max(0.0, fade));
  let pitch = sin(uniform.uEffectTime * 2.1 + a1.z) * 18.0 * EFFECT_DEG;
  let yaw = (uniform.uEffectTime * 150.0 + a1.z * 40.0) * EFFECT_DEG;
  let roll = cos(uniform.uEffectTime * 1.8 + a1.z) * 18.0 * EFFECT_DEG;
  return effectTRS(
    vec3f(sin(angle) * distance, y, cos(angle) * distance),
    vec3f(s),
    effectEuler(pitch, yaw, roll)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Burbujas y brillos del charco de `Bomba Lodo`. */
export const MOTION_POISON_BUBBLES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = uniform.uEffectTime - a0.w;
  if (local < 0.0 || local >= a1.x) {
    return base * effectScale(vec3f(0.0001));
  }
  let riseT = local / max(0.0001, a1.x);
  let emerge = min(1.0, local / 0.22);
  let grow = 0.42 + 0.58 * (1.0 - pow(1.0 - emerge, 2.0));
  let breathe = 1.0 + sin(uniform.uEffectTime * 11.0 + a1.w) * 0.07;
  let scale = a0.z * grow * breathe;
  let height = a1.y * pow(riseT, 0.85);
  let driftX = sin(uniform.uEffectTime * 3.4 + a1.w) * a1.z * riseT;
  let driftZ = cos(uniform.uEffectTime * 2.9 + a1.w) * a1.z * riseT;
  let pos = vec3f(a0.x + driftX, 0.05 + height, a0.y + driftZ);
  let rot = effectEuler(
    (uniform.uEffectTime * 95.0 + a1.w * 40.0) * EFFECT_DEG,
    (uniform.uEffectTime * 130.0 + a1.w * 30.0) * EFFECT_DEG,
    0.0
  );
  return effectTRS(pos, vec3f(max(0.0001, scale)), rot) * base;
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Aros que se abren cuando revientan las burbujas de `Bomba Lodo`. */
export const MOTION_POISON_POP_RINGS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = uniform.uEffectTime - a0.w;
  if (local < a1.x || local >= a1.x + 0.3) {
    return effectTRS(vec3f(0.0), vec3f(0.0001), effectRotY(0.0));
  }
  let popT = (local - a1.x) / 0.3;
  let popTime = a0.w + a1.x;
  let popX = a0.x + sin(popTime * 3.4 + a1.w) * a1.z;
  let popZ = a0.y + cos(popTime * 2.9 + a1.w) * a1.z;
  let popY = 0.05 + a1.y;
  let scale = a0.z * (1.4 + popT * 2.6);
  return effectTRS(
    vec3f(popX, popY, popZ),
    vec3f(max(0.001, scale), 1.0, max(0.001, scale)),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Gotas que salen despedidas al reventar una burbuja de `Bomba Lodo`. */
export const MOTION_POISON_DROPS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = uniform.uEffectTime - a0.w;
  if (local < a1.x || local >= a1.x + 0.3) {
    return effectTRS(vec3f(0.0), vec3f(0.0001), effectRotY(0.0));
  }
  let popT = (local - a1.x) / 0.3;
  let popTime = a0.w + a1.x;
  let popX = a0.x + sin(popTime * 3.4 + a1.w) * a1.z;
  let popZ = a0.y + cos(popTime * 2.9 + a1.w) * a1.z;
  let popY = 0.05 + a1.y;
  let dropAngle = a1.w + (instance_anim2.x / 3.0) * 6.28318530718;
  let spread = a0.z * (0.8 + popT * 2.4);
  let dropScale = a0.z * 0.24 * (1.0 - popT);
  let pos = vec3f(
    popX + cos(dropAngle) * spread,
    popY + sin(popT * EFFECT_PI) * a0.z * 1.2,
    popZ + sin(dropAngle) * spread
  );
  return effectTRS(
    pos,
    vec3f(max(0.001, dropScale)),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Grietas del suelo de `Terremoto` y `Filo del Abismo`. */
export const MOTION_GROUND_CRACKS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let yaw = (a1.y + sin(uniform.uEffectTime * 2.0 + a1.z) * 1.4) * EFFECT_DEG;
  return effectTRS(
    vec3f(a0.x, a0.y, a0.z),
    vec3f(a0.w, 0.02, a1.x),
    effectRotY(yaw)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Rocas que caen en `Terremoto` y `Filo del Abismo`. */
export const MOTION_GROUND_ROCKS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  var local = (uniform.uEffectTime - a0.w) / max(0.0001, a1.y);
  if (local <= 0.0) {
    return effectTRS(vec3f(0.0), vec3f(0.0001), effectRotY(0.0));
  }
  local = min(1.0, local);
  let endFade = min(1.0, max(0.0, (uniform.uEffectLife - uniform.uEffectTime) / 0.3));
  let drop = local * local;
  let scale = max(0.001, a0.z * (0.85 + local * 0.15) * endFade);
  let pos = vec3f(
    sin(a0.x) * a0.y,
    a1.x * (1.0 - drop) + a0.z * 0.45,
    cos(a0.x) * a0.y
  );
  let yaw = (a0.x / EFFECT_DEG + local * a1.z) * EFFECT_DEG;
  return effectTRS(
    pos,
    vec3f(scale, max(0.001, scale * 0.78), max(0.001, scale * 0.92)),
    effectEuler(local * 320.0 * EFFECT_DEG, yaw, local * 210.0 * EFFECT_DEG)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Polvo que levantan las rocas al impactar en `Terremoto` y `Filo del Abismo`. */
export const MOTION_GROUND_PUFFS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let puffLocal = clamp(
    (uniform.uEffectTime - (a0.w + a1.x)) / 0.35,
    0.0,
    1.0
  );
  if (puffLocal <= 0.0) {
    return effectTRS(vec3f(0.0), vec3f(0.0001), effectRotY(0.0));
  }
  let puffFade = max(0.0, 1.0 - puffLocal);
  let envelope = effectEnvelope(0.16, 0.3);
  let scale = max(
    0.001,
    a0.z * (0.5 + puffLocal * 1.2) * puffFade * envelope
  );
  let pos = vec3f(
    sin(a0.x) * a0.y,
    0.07 + puffLocal * 0.08,
    cos(a0.x) * a0.y
  );
  return effectTRS(
    pos,
    vec3f(scale, max(0.001, scale * 0.55), scale),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Motas del efecto de recuperación que comparten `Recuperación` y `Deseo`. */
export const MOTION_RECOVERY_MOTES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let span = max(0.05, uniform.uEffectLife - a0.z);
  let local = clamp((uniform.uEffectTime - a0.z) / span, 0.0, 1.0);
  let angle = a0.x + local * 0.45;
  let pos = vec3f(
    cos(angle) * a0.y,
    0.12 + a0.w * local,
    sin(angle) * a0.y
  );
  let fade = min(1.0, local / 0.15) * max(0.0, 1.0 - local);
  let scale = max(
    0.0001,
    a1.x * (0.7 + sin(local * EFFECT_PI) * 0.6) * fade
  );
  return effectTRS(pos, vec3f(scale), effectRotY(0.0));
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Púas de hielo de `Viento Gélido`. */
export const MOTION_ICE_SPIKES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a0.w) / 0.22, 0.0, 1.0);
  let ease = 1.0 - pow(1.0 - local, 3.0);
  let height = a1.x * ease;
  let pos = vec3f(a0.x, height * 0.5, a0.y);
  return effectTRS(
    pos,
    vec3f(max(0.001, a0.z), max(0.001, height), max(0.001, a0.z)),
    effectEuler(
      a1.y * EFFECT_DEG,
      a1.z * EFFECT_DEG,
      a1.w * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Niebla baja de `Viento Gélido`. */
export const MOTION_ICE_MIST_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = min(1.0, uniform.uEffectTime / max(0.2, uniform.uEffectLife * 0.8));
  let angle = a0.x + uniform.uEffectTime * 1.3;
  let distance = a0.y * (0.5 + local * 0.7);
  let scale = max(0.0001, a0.w * (0.7 + local * 0.8) * max(0.0, 1.0 - local));
  let pos = vec3f(cos(angle) * distance, 0.15 + local * a0.z, sin(angle) * distance);
  return effectTRS(
    pos,
    vec3f(scale, max(0.0001, scale * 0.7), scale),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Chispas de `Viento Gélido`. */
export const MOTION_ICE_SPARKS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = min(1.0, uniform.uEffectTime / max(0.2, uniform.uEffectLife * 0.8));
  let angle = a0.x + uniform.uEffectTime * 1.8;
  let pos = vec3f(
    cos(angle) * a0.y,
    0.15 + local * a0.z,
    sin(angle) * a0.y
  );
  let scale = max(0.0001, a0.w * max(0.0, 1.0 - local));
  return effectTRS(pos, vec3f(scale), effectRotY(0.0));
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Escombros de `Explosión`. */
export const MOTION_EXPLOSION_DEBRIS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let t = clamp(uniform.uEffectTime / max(0.0001, uniform.uEffectLife), 0.0, 1.0);
  let local = clamp((t - 0.04) / 0.7, 0.0, 1.0);
  let distance = a0.y * local;
  let pos = vec3f(
    cos(a0.x) * distance,
    0.25 + sin(local * EFFECT_PI) * a0.z,
    sin(a0.x) * distance
  );
  let fade = max(0.0, 1.0 - local);
  return effectTRS(
    pos,
    vec3f(
      max(0.001, a0.w * 2.0 * fade),
      max(0.001, a0.w * 1.2 * fade),
      max(0.001, a0.w * 2.6 * fade)
    ),
    effectEuler(
      (a1.x + t * 260.0) * EFFECT_DEG,
      (a1.x + t * 190.0) * EFFECT_DEG,
      (a1.y + t * 140.0) * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Humo de `Explosión`. */
export const MOTION_EXPLOSION_SMOKE_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let t = clamp(uniform.uEffectTime / max(0.0001, uniform.uEffectLife), 0.0, 1.0);
  let local = min(1.0, t / 0.9);
  let distance = a0.y * (0.35 + local * 1.2);
  let pos = vec3f(
    cos(a0.x) * distance,
    0.35 + local * a0.z,
    sin(a0.x) * distance
  );
  let grow = 0.85 + local * 1.1;
  let fade = max(0.0, 1.0 - local);
  return effectTRS(
    pos,
    vec3f(
      max(0.001, a0.w * grow * fade),
      max(0.001, a0.w * 0.7 * grow * fade),
      max(0.001, a0.w * grow * fade)
    ),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Aspas de viento de `Ataque Celeste`. */
export const MOTION_AIR_BLADES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let grow = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / 0.35), 2.0);
  let angle = a0.x + uniform.uEffectTime * a0.y;
  let distance = a0.z * (0.7 + grow * 0.6);
  let pos = vec3f(
    cos(angle) * distance,
    0.18 + sin(uniform.uEffectTime * 2.2 + a0.x) * 0.06,
    sin(angle) * distance
  );
  let scale = a0.w * (0.7 + grow * 0.5);
  return effectTRS(
    pos,
    vec3f(max(0.0001, scale)),
    effectEuler(
      90.0 * EFFECT_DEG,
      (angle / EFFECT_DEG + 90.0) * EFFECT_DEG,
      sin(uniform.uEffectTime * 3.0 + a0.x) * 18.0 * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Plumas de `Ataque Celeste`. */
export const MOTION_AIR_FEATHERS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a0.w) / 1.15, 0.0, 1.0);
  let distance = a0.y * (0.4 + local * 0.8);
  let angle = a0.x + uniform.uEffectTime * 1.4 + a1.y * 0.2;
  let envelope = effectEnvelope(0.16, 0.3);
  let fade = max(0.0, 1.0 - local) * envelope;
  let pos = vec3f(
    cos(angle) * distance,
    0.12 + local * a0.z,
    sin(angle) * distance
  );
  return effectTRS(
    pos,
    vec3f(
      max(0.0001, a1.x * fade),
      max(0.0001, a1.x * 2.4 * fade),
      max(0.0001, a1.x * fade)
    ),
    effectEuler(
      sin(uniform.uEffectTime * 4.0 + a1.y) * 35.0 * EFFECT_DEG,
      (angle / EFFECT_DEG + uniform.uEffectTime * 120.0) * EFFECT_DEG,
      cos(uniform.uEffectTime * 3.5 + a1.y) * 40.0 * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Brasas de `Ataque Celeste`. */
export const MOTION_AIR_EMBERS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let progress = min(1.0, uniform.uEffectTime / max(0.0001, uniform.uEffectLife));
  let angle = a0.x + uniform.uEffectTime * 2.4;
  let pos = vec3f(
    cos(angle) * a0.y,
    0.14 + progress * uniform.uEffectRadius * 0.55,
    sin(angle) * a0.y
  );
  let scale = max(0.0001, uniform.uEffectRadius * 0.05 * (1.0 - progress * 0.7));
  return effectTRS(pos, vec3f(scale), effectRotY(0.0));
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Jirones del área fantasma. */
export const MOTION_GHOST_WISPS_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let local = clamp((uniform.uEffectTime - a0.z) / 1.2, 0.0, 1.0);
  let pos = vec3f(
    cos(a0.x) * a0.y,
    0.1 + local * a0.w,
    sin(a0.x) * a0.y
  );
  let fade = max(0.0, 1.0 - local);
  return effectTRS(
    pos,
    vec3f(
      max(0.0001, a1.x * fade),
      max(0.0001, a1.x * fade),
      max(0.0001, a1.x * 3.4 * fade)
    ),
    effectEuler(
      local * 60.0 * EFFECT_DEG,
      a0.x / EFFECT_DEG,
      local * 35.0 * EFFECT_DEG
    )
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Ojos que parpadean en el área fantasma. */
export const MOTION_GHOST_EYES_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let blink = select(0.02, 0.09, sin(uniform.uEffectTime * 3.2 + a0.x) > 0.2);
  return effectTRS(
    base[3].xyz,
    vec3f(blink, blink, blink * 0.6),
    effectRotY(0.0)
  );
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/** Anillo de área genérico (`ring`). */
export const MOTION_RING_WGSL = `
fn effectModel(base: mat4x4f, a0: vec4f, a1: vec4f) -> mat4x4f {
  let grow = 1.0 - pow(1.0 - min(1.0, uniform.uEffectTime / 0.3), 2.0);
  let scale = max(0.2, uniform.uEffectRadius * 2.0) * (0.4 + 0.6 * grow);
  return effectTRS(base[3].xyz, vec3f(scale, 1.0, scale), effectRotY(0.0));
}

fn effectLocalPosition(vertexPosition: vec3f, a0: vec4f, a1: vec4f) -> vec3f {
  return vertexPosition;
}
`;

/**
 * Onda psíquica del golpe melee. Se aplica a un material normal (sin
 * instancing): el desplazamiento en Y depende del ángulo y del borde del arco.
 * `uEffectParam0` es la fase, `uEffectParam1` la amplitud y `uEffectParam2` el
 * número de ondulaciones.
 */
export const MOTION_PSYCHIC_WAVE_WGSL = `
fn effectLocalPosition(vertexPosition: vec3f) -> vec3f {
  let angle = atan2(vertexPosition.x, vertexPosition.z);
  let edge = step(0.97, length(vertexPosition.xz));
  let wave = sin(
    angle * uniform.uEffectParam2 +
    uniform.uEffectTime * 11.0 +
    uniform.uEffectParam0 +
    edge * 0.9
  ) * uniform.uEffectParam1;
  return vec3f(vertexPosition.x, wave, vertexPosition.z);
}
`;
