// World markers the campaign's step types draw: traversal gates (a ring to fly or swing through),
// puzzle plates (a lit disc on the floor), valves and scan glints. Comic look: flat unlit colour
// with an ink edge, on the FX layer like the Joker's buzzer tiles. Created lazily (a night that
// never uses them costs nothing), pooled, no per-frame allocation, no lights.
import * as THREE from 'three';
import { LAYER_FX } from '../render/layers.js';

const INK = 0x0b0b12;
const COLORS = { gate: 0xf2c94c, plate: 0x7dff4a, plateLit: 0xffffff, plateWrong: 0xc8323c, valve: 0x7fd8ff, scan: 0x9fe0ff, hazard: 0xc8323c, safe: 0xf08a24 };

export function createMarkers(scene) {
  const pool = [];
  let ringGeo = null, discGeo = null, pillarGeo = null;
  function geo(kind) {
    if (kind === 'gate') return (ringGeo ??= new THREE.TorusGeometry(2.6, 0.22, 8, 28));
    if (kind === 'pillar') return (pillarGeo ??= new THREE.CylinderGeometry(0.5, 0.5, 6, 12, 1, true));
    return (discGeo ??= new THREE.CircleGeometry(1.6, 24).rotateX(-Math.PI / 2));
  }
  function make(kind) {
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.gate, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });
    const mesh = new THREE.Mesh(geo(kind === 'gate' ? 'gate' : kind === 'pillar' ? 'pillar' : 'disc'), mat);
    mesh.layers.set(LAYER_FX);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), new THREE.LineBasicMaterial({ color: INK }));
    edge.layers.set(LAYER_FX);
    mesh.add(edge);
    scene.add(mesh);
    return { kind, mesh, mat, t: 0, busy: false, pulse: 0 };
  }
  return {
    // place(kind, { x, y, z, yaw, color, scale }) -> handle; kinds: gate, plate, valve, scan, pillar
    place(kind, p, { color = null, scale = 1 } = {}) {
      const shapeKind = kind === 'gate' ? 'gate' : kind === 'pillar' || kind === 'scan' ? 'pillar' : 'disc';
      let m = pool.find((x) => !x.busy && (x.kind === 'gate' ? 'gate' : x.kind === 'pillar' || x.kind === 'scan' ? 'pillar' : 'disc') === shapeKind);
      if (!m) { m = make(kind); pool.push(m); }
      m.kind = kind;
      m.busy = true;
      m.t = 0;
      m.pulse = 0;
      m.mesh.visible = true;
      m.mesh.position.set(p.x, (p.y ?? 0) + (shapeKind === 'gate' ? 2.8 : shapeKind === 'pillar' ? 3 : 0.06), p.z);
      m.mesh.rotation.set(0, p.yaw ?? 0, 0);
      m.mesh.scale.setScalar(scale);
      m.mat.color.set(color ?? COLORS[kind] ?? COLORS.gate);
      m.mat.opacity = shapeKind === 'pillar' ? 0.35 : 0.85;
      return m;
    },
    color(m, key) { if (m) m.mat.color.set(COLORS[key] ?? key); },
    flash(m) { if (m) m.pulse = 1; },
    release(m) { if (!m) return; m.busy = false; m.mesh.visible = false; },
    releaseAll() { for (const m of pool) { m.busy = false; m.mesh.visible = false; } },
    update(dt) {
      for (const m of pool) {
        if (!m.busy) continue;
        m.t += dt;
        if (m.kind === 'gate') m.mesh.rotation.z += dt * 0.6;
        const base = m.kind === 'pillar' || m.kind === 'scan' ? 0.25 + 0.15 * Math.sin(m.t * 3) : 0.7 + 0.2 * Math.sin(m.t * 4);
        m.pulse = Math.max(0, m.pulse - dt * 2);
        m.mat.opacity = Math.min(1, base + m.pulse * 0.5);
      }
    },
    get count() { return pool.filter((m) => m.busy).length; },
  };
}
