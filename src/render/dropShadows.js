// Inked drop shadows under characters for the tiers without shadow maps (quality.blobShadows):
// one flat ink ellipse on the ground under each character near the camera, the way a comic artist
// grounds a figure with a pool of black. One instanced draw for all of them.
//
// Characters are found, not registered: every half second the scene's top-level children are
// checked once each (cached) for a skinned mesh, so any character any system adds gets a shadow.
// Per frame: the nearest MAX within RANGE of the camera, placed on the ground below them and
// shrunk as they rise. No allocation per frame.
import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';

const MAX = 24, RANGE = 45, RESCAN = 0.5;

export function createDropShadows(scene, groundBelow) {
  const geo = new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: PALETTE.ink, transparent: true, opacity: 0.6, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.name = 'dropShadows';
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 1;
  scene.add(mesh);

  const hasSkin = new WeakMap();
  const roots = [];
  const near = new Array(MAX).fill(null);
  const nearD = new Float32Array(MAX);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  let scanT = 0;

  // A character's anchor is the parent of its skinned body (the model root, at the feet); hulls
  // and x-ray copies hang off the body itself and are skipped. Cached per top-level object.
  const anchorsOf = (o) => {
    const set = new Set();
    o.traverse((c) => { if (c.isSkinnedMesh && c.parent && !c.parent.isSkinnedMesh) set.add(c.parent); });
    return [...set];
  };
  function rescan() {
    roots.length = 0;
    for (const c of scene.children) {
      if (c === mesh) continue;
      let a = hasSkin.get(c);
      if (a === undefined) { a = anchorsOf(c); hasSkin.set(c, a); }
      for (let i = 0; i < a.length; i++) roots.push(a[i], c);
    }
  }

  return {
    mesh,
    update(dt, camera) {
      scanT -= dt;
      if (scanT <= 0) { scanT = RESCAN; rescan(); }
      let n = 0;
      for (let i = 0; i < MAX; i++) { near[i] = null; nearD[i] = Infinity; }
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      for (let j = 0; j < roots.length; j += 2) {
        const r = roots[j], top = roots[j + 1];
        if (!r.visible || !top.visible || !top.parent) continue;
        const e = r.matrixWorld.elements;
        const d = (e[12] - cx) ** 2 + (e[13] - cy) ** 2 + (e[14] - cz) ** 2;
        if (d > RANGE * RANGE) continue;
        // Insertion into the nearest-MAX list.
        let k = Math.min(n, MAX - 1);
        if (n >= MAX && d >= nearD[MAX - 1]) continue;
        while (k > 0 && nearD[k - 1] > d) { near[k] = near[k - 1]; nearD[k] = nearD[k - 1]; k--; }
        near[k] = r; nearD[k] = d;
        if (n < MAX) n++;
      }
      let c = 0;
      for (let i = 0; i < n; i++) {
        const e = near[i].matrixWorld.elements;
        const x = e[12], y = e[13], z = e[14];
        const g = groundBelow(x, y + 0.5, z);
        if (!(g > -50) || y - g > 12) continue;
        const k = Math.max(0.35, 1 - (y - g) / 8);
        pos.set(x, g + 0.04, z);
        scl.set(1.15 * k, 1, 0.85 * k);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(c++, m);
      }
      mesh.count = c;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
