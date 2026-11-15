/**
 * Contorno de equipo dibujado dentro del propio sprite.
 *
 * Antes cada copia de un Pokémon ajeno llevaba dos `MeshInstance`: el cuerpo y
 * un segundo plano algo más grande, por detrás y con un material aparte. En
 * una partida de 8 vistas eso son hasta 56 draw calls solo de contornos, cada
 * uno con su propio estado de material.
 *
 * Aquí el contorno se resuelve en el mismo draw call: el recorte alfa se
 * calcula con 8 muestras vecinas (`alphaTestPS`) y los píxeles que solo existen
 * por esa dilatación se tiñen con el color del equipo (`emissivePS`). El
 * resultado visual es el mismo borde sólido, sin geometría ni material extra.
 *
 * Las muestras se recortan a la celda de la hoja (`uOutlineMin`/`uOutlineMax`):
 * sin ese recorte, el borde de un frame tomaría píxeles del frame vecino y
 * aparecerían motas de color sueltas alrededor del Pokémon.
 *
 * Hay versión GLSL y WGSL porque el motor compila `StandardMaterial` con los
 * chunks del backend activo; si solo se inyectara el GLSL, en WebGPU el
 * contorno desaparecería sin dar ningún error (igual que el viento del follaje,
 * ver `windShader.ts`).
 */

import * as pc from 'playcanvas';

/**
 * Chunk de `alphaTestPS`: en vez de descartar por el alfa del téxel central,
 * descarta por el máximo de una vecindad de 8 muestras. Guarda además qué
 * píxeles son contorno para que `emissivePS` los tiña, y sube `dAlpha` para que
 * `alphaToCoverage` no recorte justo el borde que queremos ver.
 */
const OUTLINE_ALPHA_TEST_GLSL = `
uniform float alpha_ref;
uniform vec2 uOutlineStep;
uniform vec2 uOutlineMin;
uniform vec2 uOutlineMax;

float pcOutlineRim;

float pcOutlineSample(vec2 uv) {
	return texture2DBias({STD_OPACITY_TEXTURE_NAME}, clamp(uv, uOutlineMin, uOutlineMax), {STD_TEXTURE_BIAS}).a;
}

void alphaTest(float a) {
	vec2 uv = {STD_OPACITY_TEXTURE_UV};
	vec2 stepUv = uOutlineStep;
	vec2 diagonal = stepUv * 0.70710678;
	float dilated = a;
	dilated = max(dilated, pcOutlineSample(uv + vec2(stepUv.x, 0.0)));
	dilated = max(dilated, pcOutlineSample(uv - vec2(stepUv.x, 0.0)));
	dilated = max(dilated, pcOutlineSample(uv + vec2(0.0, stepUv.y)));
	dilated = max(dilated, pcOutlineSample(uv - vec2(0.0, stepUv.y)));
	dilated = max(dilated, pcOutlineSample(uv + diagonal));
	dilated = max(dilated, pcOutlineSample(uv - diagonal));
	dilated = max(dilated, pcOutlineSample(uv + vec2(diagonal.x, -diagonal.y)));
	dilated = max(dilated, pcOutlineSample(uv + vec2(-diagonal.x, diagonal.y)));
	if (dilated < alpha_ref) {
		discard;
	}
	// Solo los píxeles que el cuerpo habría descartado son contorno: el arte
	// original conserva su propio color y su borde.
	pcOutlineRim = a < alpha_ref ? 1.0 : 0.0;
	dAlpha = max(dAlpha, pcOutlineRim);
}
`;

/**
 * Chunk de `emissivePS`: el cuerpo conserva el color de la hoja y los píxeles
 * que solo añade la dilatación toman el color del equipo. Se ejecuta después de
 * `alphaTest`, que es quien deja `pcOutlineRim` calculado.
 */
const OUTLINE_EMISSIVE_GLSL = `
#ifndef MESH_COLOR
	uniform vec3 material_emissive;
#endif
uniform float material_emissiveIntensity;
uniform vec3 uOutlineColor;

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
	dEmission = mix(dEmission, uOutlineColor, pcOutlineRim);
}
`;

const OUTLINE_ALPHA_TEST_WGSL = `
uniform alpha_ref: f32;
uniform uOutlineStep: vec2f;
uniform uOutlineMin: vec2f;
uniform uOutlineMax: vec2f;

var<private> pcOutlineRim: f32 = 0.0;

fn pcOutlineSample(uv: vec2f) -> f32 {
	let clamped: vec2f = clamp(uv, uniform.uOutlineMin, uniform.uOutlineMax);
	return textureSampleBias({STD_OPACITY_TEXTURE_NAME}, {STD_OPACITY_TEXTURE_NAME}Sampler, clamped, {STD_TEXTURE_BIAS}).a;
}

fn alphaTest(a: f32) {
	let uv: vec2f = {STD_OPACITY_TEXTURE_UV};
	let stepUv: vec2f = uniform.uOutlineStep;
	let diagonal: vec2f = stepUv * 0.70710678;
	var dilated: f32 = a;
	dilated = max(dilated, pcOutlineSample(uv + vec2f(stepUv.x, 0.0)));
	dilated = max(dilated, pcOutlineSample(uv - vec2f(stepUv.x, 0.0)));
	dilated = max(dilated, pcOutlineSample(uv + vec2f(0.0, stepUv.y)));
	dilated = max(dilated, pcOutlineSample(uv - vec2f(0.0, stepUv.y)));
	dilated = max(dilated, pcOutlineSample(uv + diagonal));
	dilated = max(dilated, pcOutlineSample(uv - diagonal));
	dilated = max(dilated, pcOutlineSample(uv + vec2f(diagonal.x, -diagonal.y)));
	dilated = max(dilated, pcOutlineSample(uv + vec2f(-diagonal.x, diagonal.y)));
	if (dilated < uniform.alpha_ref) {
		discard;
	}
	// Solo los píxeles que el cuerpo habría descartado son contorno: el arte
	// original conserva su propio color y su borde.
	pcOutlineRim = select(0.0, 1.0, a < uniform.alpha_ref);
	dAlpha = max(dAlpha, pcOutlineRim);
}
`;

const OUTLINE_EMISSIVE_WGSL = `
#ifndef MESH_COLOR
	uniform material_emissive: vec3f;
#endif
uniform material_emissiveIntensity: f32;
uniform uOutlineColor: vec3f;

fn getEmission() {
	#ifdef MESH_COLOR
		dEmission = uniform.mesh_color.rgb * uniform.material_emissiveIntensity;
	#else
		dEmission = uniform.material_emissive * uniform.material_emissiveIntensity;
	#endif
	#ifdef STD_EMISSIVE_TEXTURE
	dEmission = dEmission * {STD_EMISSIVE_TEXTURE_DECODE}(textureSampleBias({STD_EMISSIVE_TEXTURE_NAME}, {STD_EMISSIVE_TEXTURE_NAME}Sampler, {STD_EMISSIVE_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_EMISSIVE_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_EMISSIVE_VERTEX
	dEmission = dEmission * saturate(vVertexColor.{STD_EMISSIVE_VERTEX_CHANNEL});
	#endif
	dEmission = mix(dEmission, uniform.uOutlineColor, pcOutlineRim);
}
`;

/**
 * Añade el contorno de equipo a un material de sprite. El color va en 0-255,
 * como el resto de acentos del juego; el paso de la dilatación y los límites de
 * la celda los actualiza `SpriteBillboard.applyFrame()`.
 */
export function applySpriteOutline(
  material: pc.StandardMaterial,
  color: readonly [number, number, number]
): void {
  material.setParameter(
    'uOutlineColor',
    new Float32Array([color[0] / 255, color[1] / 255, color[2] / 255])
  );
  const glsl = material.getShaderChunks(pc.SHADERLANGUAGE_GLSL);
  glsl.set('alphaTestPS', OUTLINE_ALPHA_TEST_GLSL);
  glsl.set('emissivePS', OUTLINE_EMISSIVE_GLSL);
  const wgsl = material.getShaderChunks(pc.SHADERLANGUAGE_WGSL);
  wgsl.set('alphaTestPS', OUTLINE_ALPHA_TEST_WGSL);
  wgsl.set('emissivePS', OUTLINE_EMISSIVE_WGSL);
}
