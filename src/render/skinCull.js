// [perf2] Frustum culling for skinned characters (and the static ink hulls, see fix()).
//
// Every character part (bodies, garments, kit slots, their ink hulls and x-ray copies) is built with
// frustumCulled = false, because a skinned mesh's geometry bounds describe the bind pose, not the
// animated one. So every visible character in the city drew all of its parts every frame wherever
// the camera looked, and drew them again into the shadow maps (three draws a non-culled caster into
// every shadow map, whatever its frustum). With a dozen parts per goon and 45 street figures on
// High, that was the biggest share of the frame's draw calls.
//
// This gives each such mesh a generous bounding sphere instead, and turns culling back on: the
// sphere of a sample of its vertices skinned to the pose it has when first seen (in the mesh's own
// space, so it follows the character), its radius doubled so any other pose (arms out, a kick, a
// cape-flared glide, a knockdown) stays inside. three then culls the part against the camera and
// the shadow cameras like any other mesh. Meshes sharing a position buffer (crowd figures built
// from one template, a part and its hull) share the sphere. Run every 20th frame over the scene for
// meshes added since (a flag test per object; the skinning sample costs ~1 ms once per template).
import * as THREE from 'three';

export const SKIN_CULL_SCALE = 2;
const MAX_SAMPLES = 600;
const _v = new THREE.Vector3();

// The culling sphere for a skinned mesh, in its local space, from its current pose. Exported for tests.
export function skinnedCullSphere(mesh, scale = SKIN_CULL_SCALE, out = new THREE.Sphere()) {
  const pos = mesh.geometry.attributes.position;
  const step = Math.max(1, Math.floor(pos.count / MAX_SAMPLES));
  const box = new THREE.Box3();
  for (let i = 0; i < pos.count; i += step) box.expandByPoint(mesh.getVertexPosition(i, _v));
  box.getBoundingSphere(out);
  out.radius = Math.max(out.radius * scale, 0.5);
  return out;
}

export function createSkinCuller({ every = 20 } = {}) {
  const shared = new WeakMap(); // position attribute -> Sphere
  let n = 0;
  function fix(o) {
    // Static ink hulls (toon.js addHullOutline) are built unculled too: one shares its mesh's
    // geometry and sits on it at identity, so it can cull exactly when the mesh does (the outline
    // pushes out by millimetres). Followed every sweep, in case the mesh's own flag changes.
    if (!o.isSkinnedMesh) {
      if (o.isMesh && o.material?.userData?.outline && o.parent?.isMesh && o.parent.geometry === o.geometry && (!o.frustumCulled || o.userData.hullCull)) {
        o.userData.hullCull = true;
        o.frustumCulled = o.parent.frustumCulled;
      }
      return;
    }
    if (o.frustumCulled || o.userData.noSkinCull || !o.skeleton) return;
    const p = o.geometry.attributes.position;
    if (!p) return;
    let s = shared.get(p);
    if (!s) shared.set(p, s = skinnedCullSphere(o));
    o.boundingSphere = s;
    o.frustumCulled = true;
  }
  return {
    // Call once per frame before drawing.
    tick(scene) {
      if (n++ % every !== 0) return;
      scene.traverseVisible(fix); // visible only: their bones were posed this frame
    },
    fix,
  };
}
