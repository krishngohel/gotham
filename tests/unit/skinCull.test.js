// [perf2] Skinned characters frustum-cull on a generous posed sphere (src/render/skinCull.js).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { skinnedCullSphere, createSkinCuller, SKIN_CULL_SCALE } from '../../src/render/skinCull.js';

function skinnedBox() {
  const geo = new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0);
  const n = geo.attributes.position.count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
  const w = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) w[i * 4] = 1;
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
  const bone = new THREE.Bone();
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  mesh.frustumCulled = false;
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, bone };
}

describe('skinCull', () => {
  it('spheres the posed vertices in the mesh frame, radius scaled', () => {
    const { root, mesh } = skinnedBox();
    root.updateMatrixWorld(true);
    const s = skinnedCullSphere(mesh);
    expect(s.center.y).toBeCloseTo(1, 3);
    expect(s.radius).toBeCloseTo(Math.hypot(0.5, 1, 0.5) * SKIN_CULL_SCALE, 3);
  });
  it('follows the pose it is first seen in (a bone moved up moves the sphere)', () => {
    const { root, mesh, bone } = skinnedBox();
    bone.position.y = 3;
    root.updateMatrixWorld(true);
    expect(skinnedCullSphere(mesh).center.y).toBeCloseTo(4, 3);
  });
  it('turns culling on for visible skinned meshes and shares spheres per position buffer', () => {
    const scene = new THREE.Scene();
    const a = skinnedBox(), b = skinnedBox();
    b.mesh.geometry.setAttribute('position', a.mesh.geometry.attributes.position);
    const hidden = skinnedBox();
    hidden.root.visible = false;
    scene.add(a.root, b.root, hidden.root);
    scene.updateMatrixWorld(true);
    createSkinCuller().tick(scene);
    expect(a.mesh.frustumCulled).toBe(true);
    expect(b.mesh.boundingSphere).toBe(a.mesh.boundingSphere);
    // A hidden mesh's bones may never have been posed: left alone until it shows.
    expect(hidden.mesh.frustumCulled).toBe(false);
  });
  it('leaves meshes that opt out', () => {
    const scene = new THREE.Scene();
    const a = skinnedBox();
    a.mesh.userData.noSkinCull = true;
    scene.add(a.root);
    scene.updateMatrixWorld(true);
    createSkinCuller().tick(scene);
    expect(a.mesh.frustumCulled).toBe(false);
  });
});
