// [polish] Landmark lights that carry through the fog: the city's 'glow' look (unlit vertex
// colour), but by night the fog only takes a quarter of its usual share, so a landmark's lit
// signature (Wayne Tower's crown, Blackgate's lamps) still reads at 200-320 m, where the
// ordinary glow has faded into the fog. By day (uEnvLamps 0) it fogs like everything else.
// One shared material: one program, compiled with the rest at boot.
import * as THREE from 'three';
import { ENV_UNIFORMS } from '../env/surfacePatch.js';

let mat = null;
export function beaconMaterial() {
  if (mat) return mat;
  mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  mat.name = 'beaconGlow';
  mat.userData.noShadow = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uEnvLamps = ENV_UNIFORMS.uEnvLamps;
    shader.fragmentShader = 'uniform float uEnvLamps;\n' + shader.fragmentShader.replace('#include <fog_fragment>', `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	fogFactor *= 1.0 - 0.75 * clamp( uEnvLamps, 0.0, 1.0 );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
// The stock chunk still runs, minus its fog: the ink pipeline appends its normal-buffer write to it
// (render/mrtNormals.js), and every program drawing into the colour target must make that write.
#undef USE_FOG
#include <fog_fragment>`);
  };
  mat.customProgramCacheKey = () => 'beaconGlow';
  return mat;
}

// Merges a list of world-space geometries (each with a colour attribute) into one beacon mesh
// under `parent`, registered with the chunk set as a detail drawn out to the draw distance.
export function addBeaconMesh(ctx, geos, name = 'beaconGlow') {
  if (!geos.length) return null;
  const merged = mergeLoose(geos);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, beaconMaterial());
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  mesh.userData.chunk = 'detail';
  ctx.scene.add(mesh);
  const bb = merged.boundingBox;
  ctx.chunks?.addDetail(mesh, { minX: bb.min.x, minY: bb.min.y, minZ: bb.min.z, maxX: bb.max.x, maxY: bb.max.y, maxZ: bb.max.z }, 'draw');
  return mesh;
}

function mergeLoose(geos) {
  let n = 0, m = 0;
  for (const g of geos) { n += g.attributes.position.count; m += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const idx = n > 65535 ? new Uint32Array(m) : new Uint16Array(m);
  let v = 0, k = 0;
  for (const g of geos) {
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      pos[(v + i) * 3] = p.getX(i); pos[(v + i) * 3 + 1] = p.getY(i); pos[(v + i) * 3 + 2] = p.getZ(i);
      col[(v + i) * 3] = c ? c.getX(i) : 1; col[(v + i) * 3 + 1] = c ? c.getY(i) : 1; col[(v + i) * 3 + 2] = c ? c.getZ(i) : 1;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[k++] = g.index.getX(i) + v;
    else for (let i = 0; i < p.count; i++) idx[k++] = i + v;
    v += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
