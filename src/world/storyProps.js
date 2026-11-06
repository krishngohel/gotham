// The things the Joker stole or built: the Wayne Tech crates, his pirate transmitter and the
// antidote case. Built from primitives in the toon style.
import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { toonMaterial, addHullOutline } from '../render/toon.js';

const mat = (color, extra = {}) => toonMaterial({ color, ...extra });

// A stencilled crate face: a flat colour with a border, a hazard stripe and a label.
function crateTexture(label, base = '#59634a') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#2a3022'; x.lineWidth = 6; x.strokeRect(6, 6, 244, 116);
  x.fillStyle = '#f2d24b';
  for (let k = 0; k < 8; k++) {
    x.beginPath();
    x.moveTo(14 + k * 30, 112); x.lineTo(34 + k * 30, 112); x.lineTo(54 + k * 30, 96); x.lineTo(34 + k * 30, 96);
    x.closePath(); x.fill();
  }
  x.font = '54px Bangers, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#e9e1c8'; x.fillText(label, 128, 54);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// One armoured shipping crate: a body, two steel straps and a stencilled face.
function crate(size, faceMat, strap = 0x1e2026) {
  const g = new THREE.Group();
  const [w, h, d] = size;
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), faceMat);
  box.position.y = h / 2;
  addHullOutline(box, 0.02);
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, h * 0.12, d + 0.03), mat(strap));
  const s2 = s1.clone();
  s1.position.y = h * 0.22;
  s2.position.y = h * 0.78;
  g.add(box, s1, s2);
  return g;
}

export function createCrates() {
  const g = new THREE.Group();
  const face = toonMaterial({ map: crateTexture('WAYNE TECH') });
  const plain = mat(0x59634a);
  const specs = [
    [[0.95, 0.75, 0.95], face, 0, 0, 0],
    [[0.7, 0.55, 0.7], plain, 0.9, 0, 0.3],
    [[0.75, 0.95, 0.55], face, -0.85, 0, -0.1],
    [[0.55, 0.45, 0.55], plain, 0.1, 0.75, 0.05],
    [[0.5, 0.4, 0.5], face, -0.3, 0, 0.85],
  ];
  for (const [size, m, x, y, z] of specs) {
    const p = crate(size, m);
    p.position.set(x, y, z);
    p.rotation.y = x * 0.7;
    g.add(p);
  }
  return g;
}

// A rotating satellite dish on a short mast, with a red beacon on the feed horn.
function dishAssembly() {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.4, 8), mat(0x3a3f4a));
  mast.position.y = 0.7;
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.32),
    toonMaterial({ color: 0xc9d4e6, emissive: 0x1d2735, side: THREE.DoubleSide }),
  );
  addHullOutline(bowl, 0.02);
  bowl.rotation.x = -Math.PI / 2 + 0.5;
  bowl.position.y = 1.7;
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.75, 6), mat(PALETTE.ink));
  feed.position.set(0, 1.95, 0.4);
  feed.rotation.x = Math.PI / 2 - 0.5;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: PALETTE.crimson }));
  beacon.position.set(0, 2.07, 0.74);
  g.add(mast, bowl, feed, beacon);
  return g;
}

// The Joker's pirate transmitter: crates stencilled J-TV, a pair of speaker stacks and a dish.
export function createBroadcastRig() {
  const g = new THREE.Group();
  const face = toonMaterial({ map: crateTexture('J-TV', '#4b3a63') });
  for (const [cx, cz, s] of [[0, 0, 1], [1.2, 0.2, 0.8], [-1.1, -0.3, 0.9], [0.1, 1.1, 0.7]]) {
    const cr = crate([s, s * 0.8, s], face, 0x14151b);
    cr.position.set(cx, 0, cz);
    cr.rotation.y = cx * 0.4;
    g.add(cr);
  }
  for (const s of [-1, 1]) {
    const spk = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.6), mat(0x1e2026));
    spk.position.set(s * 2.3, 0.7, -0.6);
    const cone = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), mat(0x3a3f4a));
    cone.position.set(s * 2.3, 0.9, -0.29);
    addHullOutline(spk, 0.02);
    g.add(spk, cone);
  }
  const dish = dishAssembly();
  dish.position.set(0, 0.8, 0.2);
  g.add(dish);
  g.userData.dish = dish;
  return g;
}

// The antidote: a steel carry case open on three glowing vials in a foam rack.
export function createAntidoteCase() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.95), mat(0x2f343f));
  shell.position.y = 0.15;
  addHullOutline(shell, 0.02);
  const foam = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.06, 0.8), mat(0x14151b));
  foam.position.y = 0.32;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.95), mat(0x3a3f4a));
  lid.position.set(0, 0.95, -0.58);
  lid.rotation.x = -1.35;
  addHullOutline(lid, 0.02);
  g.add(shell, foam, lid);
  const glows = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.42;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.62, 12), new THREE.MeshBasicMaterial({ color: PALETTE.jokerGreen, transparent: true, opacity: 0.85 }));
    glass.position.set(x, 0.66, 0);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.08, 12), mat(0xd8dde6));
    cap.position.set(x, 1.01, 0);
    g.add(glass, cap);
    glows.push(glass);
  }
  g.userData.glows = glows;
  g.userData.top = 1.1;
  return g;
}

// Pickup wrapper: a stolen item waiting at a site, with a slow spin and a glow halo.
export function createPickups(scene, halos, sites) {
  const items = {
    crates: { group: createCrates(), site: sites.crates, taken: false },
    rig: { group: createBroadcastRig(), site: sites.rig, taken: false },
    antidote: { group: createAntidoteCase(), site: sites.antidote, taken: false },
  };
  for (const [id, it] of Object.entries(items)) {
    it.group.position.set(it.site.x, it.site.y, it.site.z);
    it.halo = halos.add(it.site.x, it.site.y + 1.2, it.site.z, id === 'rig' ? PALETTE.neonPink : id === 'antidote' ? PALETTE.jokerGreen : PALETTE.signal, 6);
    scene.add(it.group);
  }
  return {
    items,
    // Marks an item recovered. It stays in place for its reward comic, then hide() clears it.
    take(id) {
      const it = items[id];
      if (!it || it.taken) return;
      it.taken = true;
      halos.setSize(it.halo, 0.01);
    },
    hide(id) { if (items[id]) items[id].group.visible = false; },
    restore(taken) { for (const id of taken) { this.take(id); this.hide(id); } },
    update(t) {
      const dish = items.rig.group.userData.dish;
      if (dish) dish.rotation.y = t * 0.8;
      for (const [i, v] of items.antidote.group.userData.glows.entries()) v.material.opacity = 0.7 + Math.sin(t * 3 + i * 1.3) * 0.2;
    },
  };
}

// Once the pirate transmitter is seized, Neon Row's signs come back on over the street.
export function createNeonRelight(scene, halos) {
  const colors = [PALETTE.neonCyan, PALETTE.neonPink, PALETTE.signal, PALETTE.neonCyan, PALETTE.neonPink];
  const lights = [];
  for (let z = -80; z <= 120; z += 14) lights.push([150, 11.5, z + 7]);
  const ids = [];
  let shown = false;
  return {
    show() {
      if (shown) return;
      shown = true;
      for (const [x, y, z] of lights) ids.push(halos.add(x, y, z, colors[ids.length % colors.length], 7));
    },
  };
}
