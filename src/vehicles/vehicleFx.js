// Vehicle effects (workstream L3, `[move]`): skid marks and tyre smoke, pooled and sized by the
// quality tier (src/render/quality.js: `vehicleFx` if a tier sets it, else derived from the crowd
// density so potato gets none and ultra the most). One InstancedMesh of skid quads (one draw) and
// one of smoke puffs; nothing is allocated per frame. Works in both split-screen views (it is just
// scene geometry).
import * as THREE from 'three';
import { LAYER_FX } from '../render/layers.js';

export function vehicleFxBudget(quality = {}) {
  if (quality.vehicleFx) return quality.vehicleFx;
  const c = quality.crowdDensity ?? 1;
  if (c <= 0.25) return { skids: 0, smoke: 0 };
  if (c <= 0.5) return { skids: 80, smoke: 0 };
  if (c <= 0.75) return { skids: 160, smoke: 12 };
  return { skids: 280, smoke: 24 };
}

export function createVehicleFx(scene, quality = {}) {
  const budget = vehicleFxBudget(quality);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), at = new THREE.Vector3();
  let skids = null, smoke = null, skidNext = 0, smokeNext = 0;
  const smokeLife = new Float32Array(budget.smoke), smokePos = new Float32Array(budget.smoke * 3);
  if (budget.skids > 0) {
    const geo = new THREE.PlaneGeometry(0.34, 0.9).rotateX(-Math.PI / 2);
    skids = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x0b0b10, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), budget.skids);
    skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    skids.count = 0;
    skids.frustumCulled = false;
    skids.name = 'skidMarks';
    scene.add(skids);
  }
  if (budget.smoke > 0) {
    smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xbfc4cc, transparent: true, opacity: 0.35, depthWrite: false }), budget.smoke);
    smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    smoke.layers.set(LAYER_FX);
    smoke.count = budget.smoke;
    smoke.frustumCulled = false;
    smoke.name = 'tyreSmoke';
    for (let i = 0; i < budget.smoke; i++) { m4.makeScale(0, 0, 0); smoke.setMatrixAt(i, m4); }
    scene.add(smoke);
  }
  // Per-wheel last mark positions (keyed by a small integer the caller picks).
  const last = new Map();

  return {
    budget,
    // A tyre on the road at (x, y, z) heading `yaw`, sliding: lays a mark every 0.8 m. key: unique
    // per wheel (vehicle index * 4 + wheel).
    skid(key, x, y, z, yaw) {
      if (!skids) return;
      let l = last.get(key);
      if (!l) last.set(key, (l = { x, z, t: 0 }));
      if (Math.hypot(x - l.x, z - l.z) < 0.8) return;
      l.x = x; l.z = z;
      e.set(0, yaw, 0); q.setFromEuler(e); sc.set(1, 1, 1); at.set(x, y + 0.03, z);
      m4.compose(at, q, sc);
      skids.setMatrixAt(skidNext, m4);
      skidNext = (skidNext + 1) % budget.skids;
      skids.count = Math.min(budget.skids, skids.count + 1);
      skids.instanceMatrix.needsUpdate = true;
    },
    // Lift a wheel: the next mark starts fresh instead of joining a gap.
    lift(key) { last.delete(key); },
    puff(x, y, z) {
      if (!smoke) return;
      const i = smokeNext;
      smokeNext = (smokeNext + 1) % budget.smoke;
      smokeLife[i] = 1;
      smokePos[i * 3] = x; smokePos[i * 3 + 1] = y + 0.3; smokePos[i * 3 + 2] = z;
    },
    update(dt) {
      if (!smoke) return;
      let any = false;
      for (let i = 0; i < budget.smoke; i++) {
        if (smokeLife[i] <= 0) continue;
        any = true;
        smokeLife[i] -= dt * 0.9;
        const k = Math.max(0, smokeLife[i]);
        smokePos[i * 3 + 1] += dt * 0.8;
        const s = k > 0 ? 0.6 + (1 - k) * 2.2 : 0;
        at.set(smokePos[i * 3], smokePos[i * 3 + 1], smokePos[i * 3 + 2]);
        sc.set(s, s, s);
        m4.compose(at, q.identity(), sc);
        smoke.setMatrixAt(i, m4);
      }
      if (any) smoke.instanceMatrix.needsUpdate = true;
    },
  };
}
