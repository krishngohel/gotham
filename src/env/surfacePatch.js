// Time-of-day and weather on the city's own materials, by shared uniforms only (rendering research
// section 8: never recompile mid-run). Installed once on the static city's toon materials right
// after the world is built, before the boot prewarm compiles anything, so each patched material
// compiles exactly once.
//
//   uEnvWindows  0..1: share of windows lit. Each window cell of a facade's emissive map has its
//                own random threshold, so at dusk lights come on one by one, not all at once.
//   uEnvWet      0..1: up-facing surfaces darken when the street is wet (quality.envSurface).
//   uEnvSnow     0..1: snow settles on up-facing surfaces (roofs, streets, car tops), broken up by
//                world-space noise so it does not swim (quality.envSurface).
// Static halos (street lamps, signs) get uEnvLamps the same way: each lamp has its own threshold.
import * as THREE from 'three';

export const ENV_UNIFORMS = {
  uEnvWindows: { value: 1 },
  uEnvWet: { value: 0 },
  uEnvSnow: { value: 0 },
  uEnvLamps: { value: 1 },
};

const HASH = /* glsl */ `
float envHash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float envNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(envHash(i), envHash(i + vec2(1.0, 0.0)), f.x), mix(envHash(i + vec2(0.0, 1.0)), envHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

function patchToon(mat, surface) {
  mat.defines = { ...(mat.defines ?? {}), ...(surface ? { ENV_SURFACE: '' } : {}) };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ENV_UNIFORMS);
    if (surface) {
      shader.vertexShader = 'varying vec3 vEnvW;\nvarying vec3 vEnvN;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
	{
		vec4 envW = vec4( transformed, 1.0 );
		vec3 envN = objectNormal;
	#ifdef USE_INSTANCING
		envW = instanceMatrix * envW;
		envN = mat3( instanceMatrix ) * envN;
	#endif
	#ifdef USE_BATCHING
		envW = batchingMatrix * envW;
		envN = mat3( batchingMatrix ) * envN;
	#endif
		envW = modelMatrix * envW;
		vEnvW = envW.xyz;
		vEnvN = normalize( mat3( modelMatrix ) * envN );
	}`);
    }
    shader.fragmentShader = 'uniform float uEnvWindows, uEnvWet, uEnvSnow;\n' + (surface ? 'varying vec3 vEnvW;\nvarying vec3 vEnvN;\n' : '') + HASH
      + shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef ENV_SURFACE
	{
		float envUp = normalize( vEnvN ).y;
		float envFlat = smoothstep( 0.6, 0.9, envUp );
		diffuseColor.rgb *= 1.0 - 0.3 * envFlat * uEnvWet;
		if ( uEnvSnow > 0.001 ) {
			float sn = envNoise( vEnvW.xz * 0.45 ) * 0.65 + envNoise( vEnvW.xz * 2.3 ) * 0.35;
			float snowMask = envFlat * step( 1.0 - uEnvSnow, sn * 0.85 + 0.12 );
			diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.85, 0.8 ), snowMask );
		}
	}
#endif`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#ifdef USE_EMISSIVEMAP
	totalEmissiveRadiance *= step( envHash( floor( vEmissiveMapUv * vec2( 23.0, 19.0 ) ) + 0.5 ), uEnvWindows );
#endif`);
  };
  mat.customProgramCacheKey = () => (surface ? 'env-toon-s' : 'env-toon');
  mat.needsUpdate = true;
}

// Patches every static toon material under `root` that has no hook of its own. Returns the count.
export function patchCityMaterials(root, { surface = true } = {}) {
  const seen = new Set();
  const base = THREE.Material.prototype.onBeforeCompile;
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || seen.has(m) || !m.isMeshToonMaterial) continue;
      seen.add(m);
      if (m.onBeforeCompile !== base) continue;
      patchToon(m, surface);
    }
  });
  return seen.size;
}

// Static halos (frozen into chunk batches by halos.freeze): one material clone with a per-lamp
// threshold. Red lamps (aviation beacons, tail lights) stay on. Returns the patched count.
export function patchStaticHalos(root) {
  let clone = null, n = 0;
  root.traverse((o) => {
    if (!o.isPoints || !o.name.startsWith('halos:')) return;
    if (!clone) {
      clone = o.material.clone();
      clone.uniforms = { ...o.material.uniforms, uEnvLamps: ENV_UNIFORMS.uEnvLamps };
      clone.vertexShader = 'uniform float uEnvLamps;\n' + clone.vertexShader.replace('vColor = aColor;', `vColor = aColor;
  {
    vec2 hp = fract(position.xz * vec2(0.1031, 0.1030) + position.y * 0.0973);
    hp += dot(hp, hp.yx + 33.33);
    float th = fract((hp.x + hp.y) * hp.x) * 0.92 + 0.04;
    float beacon = step(0.7, aColor.r) * step(aColor.g, 0.3);
    vColor *= max(beacon, step(th, uEnvLamps));
  }`);
    }
    o.material = clone;
    n++;
  });
  return n;
}
