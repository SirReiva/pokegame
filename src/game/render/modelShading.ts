import * as pc from 'playcanvas';

const shadedMaterials = new WeakSet<pc.StandardMaterial>();

/** Añade desaturación por instancia sin cambiar el material compartido. */
export function applyModelShading(material: pc.StandardMaterial): void {
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
