import * as pc from 'playcanvas';

/**
 * Shader de viento para follaje instanciado.
 *
 * Es una variante de `transformCoreVS`: cada instancia lleva en `instance_wind`
 * su fase y su fuerza, y el vertex shader inclina la mata sobre su base (y = 0)
 * sin desplazarla. La animación de una región entera cuesta un uniforme por
 * material y ningún trabajo de CPU por mata.
 *
 * Hay una versión GLSL y otra WGSL porque, en WebGPU, `StandardMaterial` se
 * genera con los chunks WGSL: inyectar solo el GLSL haría que la hierba se
 * quedase quieta sin dar ningún error.
 */
export const WIND_ATTRIBUTE = 'instance_wind';

export const WIND_TRANSFORM_CORE_GLSL = `
attribute vec4 vertex_position;
uniform mat4 matrix_viewProjection;
uniform mat4 matrix_model;
#ifdef INSTANCING
attribute vec4 instance_wind;
uniform float uWindTime;
uniform float uWindSpeed;
uniform float uWindAmplitude;
#endif
#ifdef MORPHING
	uniform vec2 morph_tex_params;
	attribute uint morph_vertex_id;
	ivec2 getTextureMorphCoords() {
		ivec2 textureSize = ivec2(morph_tex_params);
		int morphGridV = int(morph_vertex_id) / textureSize.x;
		int morphGridU = int(morph_vertex_id) - (morphGridV * textureSize.x);
		#ifdef WEBGPU
			morphGridV = textureSize.y - morphGridV - 1;
		#endif
		return ivec2(morphGridU, morphGridV);
	}
	#ifdef MORPHING_POSITION
		#ifdef MORPHING_INT
			uniform vec3 aabbSize;
			uniform vec3 aabbMin;
			uniform usampler2D morphPositionTex;
		#else
			uniform highp sampler2D morphPositionTex;
		#endif
	#endif
#endif
#ifdef defined(BATCH)
	#include "skinBatchVS"
	mat4 getModelMatrix() {
		return getBoneMatrix(vertex_boneIndices);
	}
#elif defined(SKIN)
	#include "skinVS"
	mat4 getModelMatrix() {
		return matrix_model * getSkinMatrix(vertex_boneIndices, vertex_boneWeights);
	}
#elif defined(INSTANCING)
	#include "transformInstancingVS"
#else
	mat4 getModelMatrix() {
		return matrix_model;
	}
#endif
vec3 getLocalPosition(vec3 vertexPosition) {
	vec3 localPos = vertexPosition;
	#ifdef INSTANCING
		// Giro sobre Z en el espacio local: la base queda fija y la punta se mece.
		float sway = sin(uWindTime * uWindSpeed + instance_wind.x) * uWindAmplitude * instance_wind.y;
		float swaySin = sin(sway);
		float swayCos = cos(sway);
		localPos = vec3(
			localPos.x * swayCos - localPos.y * swaySin,
			localPos.x * swaySin + localPos.y * swayCos,
			localPos.z
		);
	#endif
	#ifdef MORPHING_POSITION
		ivec2 morphUV = getTextureMorphCoords();
		#ifdef MORPHING_INT
			vec3 morphPos = vec3(texelFetch(morphPositionTex, ivec2(morphUV), 0).xyz) / 65535.0 * aabbSize + aabbMin;
		#else
			vec3 morphPos = texelFetch(morphPositionTex, ivec2(morphUV), 0).xyz;
		#endif
		localPos += morphPos;
	#endif
	return localPos;
}
`;

export const WIND_TRANSFORM_CORE_WGSL = `
attribute vertex_position: vec4f;
uniform matrix_viewProjection: mat4x4f;
#ifdef MESH_INSTANCE_STORAGE
	#include "meshInstanceStorageVS"
#endif
#ifdef INSTANCING
	attribute instance_wind: vec4f;
	uniform uWindTime: f32;
	uniform uWindSpeed: f32;
	uniform uWindAmplitude: f32;
#endif
#ifdef MORPHING
	uniform morph_tex_params: vec2f;
	attribute morph_vertex_id: u32;
	fn getTextureMorphCoords() -> vec2i {
		var textureSize: vec2i = vec2i(uniform.morph_tex_params);
		var morphGridV: i32 = i32(morph_vertex_id) / textureSize.x;
		var morphGridU: i32 = i32(morph_vertex_id) - (morphGridV * textureSize.x);
		morphGridV = textureSize.y - morphGridV - 1;
		return vec2i(morphGridU, morphGridV);
	}
	#ifdef MORPHING_POSITION
		#ifdef MORPHING_INT
			uniform aabbSize: vec3f;
			uniform aabbMin: vec3f;
			var morphPositionTex: texture_2d<u32>;
		#else
			var morphPositionTex: texture_2d<f32>;
		#endif
	#endif
#endif
#ifdef defined(BATCH)
	#include "skinBatchVS"
	fn getModelMatrix() -> mat4x4f {
		return getBoneMatrix(vertex_boneIndices);
	}
#elif defined(SKIN)
	#include "skinVS"
	#ifdef MESH_INSTANCE_STORAGE
		fn getModelMatrix() -> mat4x4f {
			return getStoredModelMatrix() * getSkinMatrix(vertex_boneIndices, vertex_boneWeights);
		}
	#else
		uniform matrix_model: mat4x4f;
		fn getModelMatrix() -> mat4x4f {
			return uniform.matrix_model * getSkinMatrix(vertex_boneIndices, vertex_boneWeights);
		}
	#endif
#elif defined(INSTANCING)
	uniform matrix_model: mat4x4f;
	#include "transformInstancingVS"
#elif defined(MESH_INSTANCE_STORAGE)
	fn getModelMatrix() -> mat4x4f {
		return getStoredModelMatrix();
	}
#else
	uniform matrix_model: mat4x4f;
	fn getModelMatrix() -> mat4x4f {
		return uniform.matrix_model;
	}
#endif
fn getLocalPosition(vertexPosition: vec3f) -> vec3f {
	var localPos: vec3f = vertexPosition;
	#ifdef INSTANCING
		// Giro sobre Z en el espacio local: la base queda fija y la punta se mece.
		let sway = sin(uniform.uWindTime * uniform.uWindSpeed + instance_wind.x) * uniform.uWindAmplitude * instance_wind.y;
		let swaySin = sin(sway);
		let swayCos = cos(sway);
		localPos = vec3f(
			localPos.x * swayCos - localPos.y * swaySin,
			localPos.x * swaySin + localPos.y * swayCos,
			localPos.z
		);
	#endif
	#ifdef MORPHING_POSITION
		let morphUV: vec2i = getTextureMorphCoords();
		#ifdef MORPHING_INT
			let morphPos: vec3f = vec3f(textureLoad(morphPositionTex, morphUV, 0).xyz) / 65535.0 * uniform.aabbSize + uniform.aabbMin;
		#else
			let morphPos: vec3f = textureLoad(morphPositionTex, morphUV, 0).xyz;
		#endif
		localPos += morphPos;
	#endif
	return localPos;
}
`;

/** Aplica el viento al material en el idioma que use cada backend. */
export function applyWindShader(material: pc.StandardMaterial): void {
  material.userAttributes.set(pc.SEMANTIC_ATTR13, WIND_ATTRIBUTE);
  material
    .getShaderChunks(pc.SHADERLANGUAGE_GLSL)
    .set('transformCoreVS', WIND_TRANSFORM_CORE_GLSL);
  material
    .getShaderChunks(pc.SHADERLANGUAGE_WGSL)
    .set('transformCoreVS', WIND_TRANSFORM_CORE_WGSL);
  material.update();
}
