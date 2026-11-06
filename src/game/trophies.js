// The 12 Riddler trophies hidden around Gotham, easiest first. Each one taunts you with a message
// from story.config.js. Detective vision shows them through walls.
import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { LAYER_XRAY } from '../render/layers.js';
import { toonMaterial, addHullOutline } from '../render/toon.js';
import { TROPHIES } from '../config/trophySpots.js';
export { TROPHIES };

// A glowing green question mark: a hook, a stem and a dot, on a small plinth.
function buildQuestionMark() {
  const g = new THREE.Group();
  const glow = () => toonMaterial({ color: PALETTE.riddler, emissive: 0x0f5a24, emissiveIntensity: 1 });
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.085, 10, 22, Math.PI * 1.55), glow());
  hook.rotation.z = Math.PI * 0.18;
  hook.position.y = 0.38;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.3, 10), glow());
  stem.position.set(0.02, -0.06, 0);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), glow());
  dot.position.set(0.02, -0.38, 0);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.1, 16), toonMaterial({ color: 0x1a2a20 }));
  plinth.position.y = -0.62;
  for (const m of [hook, stem, dot, plinth]) addHullOutline(m, 0.03);
  g.add(hook, stem, dot, plinth);
  return g;
}

export function createTrophies(scene, found = []) {
  const items = [];
  const xrayGeo = new THREE.SphereGeometry(0.6, 16, 12);
  const xrayMat = new THREE.MeshBasicMaterial({ color: PALETTE.riddler, transparent: true, opacity: 0.7, depthTest: false });
  TROPHIES.forEach((b, i) => {
    const g = new THREE.Group();
    const xray = new THREE.Mesh(xrayGeo, xrayMat);
    xray.layers.set(LAYER_XRAY);
    g.add(buildQuestionMark(), xray);
    g.position.set(b.x, b.y, b.z);
    g.visible = !found.includes(i);
    scene.add(g);
    items.push({ ...b, index: i, group: g, taken: found.includes(i), phase: i * 1.7 });
  });
  return {
    items,
    // Returns the index of a trophy the hero just touched, or -1.
    update(t, heroPos) {
      let hit = -1;
      for (const it of items) {
        if (it.taken) continue;
        it.group.position.y = it.y + Math.sin(t * 1.6 + it.phase) * 0.18;
        it.group.rotation.y = t * 0.9 + it.phase;
        const dx = heroPos.x - it.x, dy = heroPos.y + 1 - it.group.position.y, dz = heroPos.z - it.z;
        if (dx * dx + dy * dy * 0.5 + dz * dz < 2.2 * 2.2) { it.taken = true; it.group.visible = false; hit = it.index; }
      }
      return hit;
    },
    get count() { return items.filter((i) => i.taken).length; },
  };
}
