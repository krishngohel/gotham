// Street life beyond people (workstream M): pigeons by day and bats by night that sit on the
// pavement near the players and scatter when a hero comes close or a fight starts. One instanced
// draw for every bird; positions are computed on the CPU (a few dozen), nothing allocated per frame.
// Off on potato (quality.ambientLife === false).
import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { LAYER_FX } from '../render/layers.js';

const FLOCKS = 4, PER = 7;

export function createAmbientLife({ scene, quality, world }) {
  const on = quality.ambientLife ?? quality.name !== 'potato';
  const n = on ? FLOCKS * PER : 0;
  // A bird: two wing triangles meeting at the body (flaps by scaling in the vertex positions).
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, -0.22, 0.02, -0.02, 0, 0, -0.1, 0, 0, 0.12, 0, 0, -0.1, 0.22, 0.02, -0.02], 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0x4a4d58, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.layers.set(LAYER_FX);
  mesh.name = 'ambientBirds';
  scene.add(mesh);
  const birds = [];
  for (let i = 0; i < n; i++) birds.push({ x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, flap: 0, state: 'gone', t: 0, flock: Math.floor(i / PER) });
  const flocks = Array.from({ length: FLOCKS }, () => ({ x: 0, y: 0, z: 0, live: false, t: 0 }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const day = new THREE.Color(0x5a5d66), night = new THREE.Color(PALETTE.ink);
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let hx = 0, hy = 0, hz = 0, hasHero = false;

  function placeFlock(f) {
    // On the nearest sidewalk 15-35 m from a hero, on the ground.
    const net = world.streetGraph;
    if (!net || !hasHero) return;
    const ang = rnd() * Math.PI * 2, r = 15 + rnd() * 20;
    const x = hx + Math.cos(ang) * r, z = hz + Math.sin(ang) * r;
    const g = world.collision.groundBelow(x, hy + 3, z, 0.3);
    if (!Number.isFinite(g) || Math.abs(g - hy) > 4) return;
    f.x = x; f.y = g; f.z = z; f.live = true; f.t = 0;
    for (const b of birds) {
      if (flocks[b.flock] !== f) continue;
      b.x = x + (rnd() - 0.5) * 3; b.y = g + 0.08; b.z = z + (rnd() - 0.5) * 3;
      b.yaw = rnd() * 6.28; b.state = 'sit'; b.t = rnd() * 3; b.vx = b.vy = b.vz = 0;
    }
  }
  function scatter(f, sx, sz) {
    for (const b of birds) {
      if (flocks[b.flock] !== f || b.state !== 'sit') continue;
      const dx = b.x - sx, dz = b.z - sz, L = Math.hypot(dx, dz) || 1;
      b.state = 'fly'; b.t = 0;
      b.vx = (dx / L) * (4 + rnd() * 3) + (rnd() - 0.5) * 2; b.vz = (dz / L) * (4 + rnd() * 3) + (rnd() - 0.5) * 2; b.vy = 3 + rnd() * 3;
    }
    f.live = false; f.t = 0;
  }

  return {
    mesh,
    // A hero is at (x, y, z): birds within 6 m take off.
    near(x, y, z) {
      hx = x; hy = y; hz = z; hasHero = true;
      for (const f of flocks) if (f.live && Math.hypot(f.x - x, f.z - z) < 6 && Math.abs(f.y - y) < 4) scatter(f, x, z);
    },
    // A fight, a shot, a gadget: every flock in range takes off.
    scare(x, y, z, radius = 20) { for (const f of flocks) if (f.live && Math.hypot(f.x - x, f.z - z) < radius) scatter(f, x, z); },
    update(dt, t) {
      if (!n) return;
      const lit = world.clock?.daylight ?? 0;
      mat.color.copy(night).lerp(day, lit);
      for (const f of flocks) {
        f.t += dt;
        if (!f.live && f.t > 6) placeFlock(f);
        else if (f.live && hasHero && Math.hypot(f.x - hx, f.z - hz) > 70) f.live = false;
      }
      let k = 0;
      for (const b of birds) {
        b.t += dt;
        if (b.state === 'sit') {
          if (!flocks[b.flock].live) { b.state = 'gone'; continue; }
          // Pecking: a hop now and then.
          const hop = Math.max(0, Math.sin(b.t * 2.3 + b.yaw * 5)) > 0.97 ? 0.06 : 0;
          p.set(b.x, b.y + hop, b.z);
          e.set(0, b.yaw, 0); s.set(0.8, 0.8, 0.8);
        } else if (b.state === 'fly') {
          b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
          b.vy += 1.5 * dt;
          b.yaw = Math.atan2(b.vx, b.vz);
          b.flap += dt * 22;
          if (b.t > 4) { b.state = 'gone'; continue; }
          p.set(b.x, b.y, b.z);
          e.set(0, b.yaw, 0); s.set(1, 0.5 + 0.9 * Math.abs(Math.sin(b.flap)), 1);
        } else continue;
        q.setFromEuler(e);
        m.compose(p, q, s);
        mesh.setMatrixAt(k++, m);
      }
      mesh.count = k;
      if (k) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
