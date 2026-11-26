import * as pc from 'playcanvas';

/**
 * Constante de tiempo (s) del gris del KO. Coincide con la del billboard de
 * sprites (`sprite.ts`) para que ambos cuerpos se apaguen al mismo ritmo.
 */
export const DESATURATION_SECONDS = 0.08;

/**
 * Estado del gris del KO: 0 = color, 1 = escala de grises.
 *
 * Morir interpola el gris en `step()` para que el clip `faint` se vea apagarse;
 * revivir lo aplica de golpe para que el cuerpo reaparezca con color y sin un
 * frame gris. Se separa del billboard para poder probar la transición sin
 * montar una escena de PlayCanvas.
 */
export class DesaturationState {
  private current = 0;
  private target = 0;

  /** Valor actual, el que se sube al uniform `uDesaturate`. */
  get value(): number {
    return this.current;
  }

  /**
   * Fija el objetivo (se recorta a [0, 1]).
   *
   * @returns `true` si el valor actual cambió y hay que subirlo a los materiales.
   */
  request(target: number): boolean {
    const next = Math.min(1, Math.max(0, target));
    if (next === this.target) return false;
    this.target = next;
    // Recuperar color nunca se interpola: el respawn debe verse vivo ya.
    if (next >= this.current) return false;
    this.current = next;
    return true;
  }

  /**
   * Avanza la interpolación del gris.
   *
   * @returns `true` si el valor actual cambió y hay que subirlo a los materiales.
   */
  step(dt: number): boolean {
    if (this.current === this.target) return false;
    const blend = 1 - Math.exp(-dt / DESATURATION_SECONDS);
    const previous = this.current;
    this.current += (this.target - this.current) * blend;
    // Se cierra en el objetivo: así el uniform deja de subirse cada frame.
    if (Math.abs(this.target - this.current) < 0.004) {
      this.current = this.target;
    }
    return this.current !== previous;
  }
}

const shadedMaterials = new WeakSet<pc.StandardMaterial>();

/**
 * Añade desaturación por instancia sin cambiar el material compartido.
 *
 * El chunk `emissivePS` replica el de PlayCanvas 2.24.2 y añade dos `mix` con
 * `uDesaturate`: uno sobre `litArgs_albedo` (el motor lo asigna justo antes de
 * llamar a `getEmission()`) y otro sobre `dEmission`. Con `uDesaturate = 0` el
 * resultado es idéntico al del motor.
 *
 * Los materiales no estándar (o ausentes) se ignoran: los GLB del catálogo son
 * todos `StandardMaterial`, pero un render sin material no debe romper la carga.
 */
export function applyModelShading(
  material: pc.Material | null | undefined
): void {
  if (!(material instanceof pc.StandardMaterial)) return;
  if (shadedMaterials.has(material)) return;

  const glsl = material.getShaderChunks(pc.SHADERLANGUAGE_GLSL);
  glsl.set(
    'emissivePS',
    `
#ifndef MESH_COLOR
uniform vec3 material_emissive;
#endif
uniform float material_emissiveIntensity;
uniform float uDesaturate;
void getEmission() {
  #ifdef MESH_COLOR
    dEmission = mesh_color.rgb * material_emissiveIntensity;
  #else
    dEmission = material_emissive * material_emissiveIntensity;
  #endif
  #ifdef STD_EMISSIVE_TEXTURE
    dEmission *= {STD_EMISSIVE_TEXTURE_DECODE}(texture2DBias({STD_EMISSIVE_TEXTURE_NAME}, {STD_EMISSIVE_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_EMISSIVE_TEXTURE_CHANNEL};
  #endif
  #ifdef STD_EMISSIVE_VERTEX
    dEmission *= saturate(vVertexColor.{STD_EMISSIVE_VERTEX_CHANNEL});
  #endif
  float albedoLuminance = dot(litArgs_albedo, vec3(0.2126, 0.7152, 0.0722));
  litArgs_albedo = mix(litArgs_albedo, vec3(albedoLuminance), uDesaturate);
  float emissionLuminance = dot(dEmission, vec3(0.2126, 0.7152, 0.0722));
  dEmission = mix(dEmission, vec3(emissionLuminance), uDesaturate);
}`
  );

  const wgsl = material.getShaderChunks(pc.SHADERLANGUAGE_WGSL);
  wgsl.set(
    'emissivePS',
    `
#ifndef MESH_COLOR
uniform material_emissive: vec3f;
#endif
uniform material_emissiveIntensity: f32;
uniform uDesaturate: f32;
fn getEmission() {
  #ifdef MESH_COLOR
    dEmission = uniform.mesh_color.rgb * uniform.material_emissiveIntensity;
  #else
    dEmission = uniform.material_emissive * uniform.material_emissiveIntensity;
  #endif
  #ifdef STD_EMISSIVE_TEXTURE
    dEmission *= {STD_EMISSIVE_TEXTURE_DECODE}(textureSampleBias({STD_EMISSIVE_TEXTURE_NAME}, {STD_EMISSIVE_TEXTURE_NAME}Sampler, {STD_EMISSIVE_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_EMISSIVE_TEXTURE_CHANNEL};
  #endif
  #ifdef STD_EMISSIVE_VERTEX
    dEmission = dEmission * saturate(vVertexColor.{STD_EMISSIVE_VERTEX_CHANNEL});
  #endif
  let albedoLuminance = dot(litArgs_albedo, vec3f(0.2126, 0.7152, 0.0722));
  litArgs_albedo = mix(litArgs_albedo, vec3f(albedoLuminance), uniform.uDesaturate);
  let emissionLuminance = dot(dEmission, vec3f(0.2126, 0.7152, 0.0722));
  dEmission = mix(dEmission, vec3f(emissionLuminance), uniform.uDesaturate);
}`
  );
  material.setParameter('uDesaturate', 0);
  material.update();
  shadedMaterials.add(material);
}
