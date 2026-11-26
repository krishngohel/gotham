// [polish] The Batcave's trophies, built properly: a man-high two-faced coin on a cradle (one
// face clean, one scarred), a mechanical tyrannosaur mid-stride on its mount, and a door-sized
// playing card with a painted face. Each is one merged, vertex-coloured toon mesh (the card adds
// one canvas-textured face). Original designs. Positions are the caller's (local to the trophy).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function paint(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.index ? g.toNonIndexed() : g;
}
function merged(parts) {
  const g = mergeGeometries(parts.map(([geo, hex]) => { const p = paint(geo, hex); for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'color'].includes(k)) p.deleteAttribute(k); return p; }));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true }));
}

const GOLD = 0xc8a050, GOLD_D = 0x8a6a2a, SCAR = 0x6a5a3a, STEEL = 0x5a6068;

export function trophyCoin() {
  const parts = [
    [new THREE.CylinderGeometry(2.4, 2.4, 0.42, 40).rotateX(Math.PI / 2), GOLD],
    [new THREE.TorusGeometry(2.3, 0.09, 6, 40), GOLD_D],
    [new THREE.TorusGeometry(1.75, 0.05, 6, 40).translate(0, 0, 0.22), GOLD_D],
    // The clean face: a profile relief and a laurel of studs.
    [new THREE.CylinderGeometry(0.9, 0.9, 0.08, 24).rotateX(Math.PI / 2).scale(0.75, 1, 1).translate(0, 0.15, 0.24), 0xd8b868],
    // The scarred half: gouges across the lower right.
    ...[[0.6, -0.8, 0.5], [1.1, -0.3, 0.9], [0.2, -1.4, 0.2], [1.3, -1.0, -0.3]].map(([x, y, a]) => [new THREE.BoxGeometry(1.1, 0.07, 0.06).rotateZ(a).translate(x, y, 0.23), SCAR]),
  ];
  for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; parts.push([new THREE.SphereGeometry(0.07, 6, 4).translate(Math.cos(a) * 2.0, Math.sin(a) * 2.0, 0.22), GOLD_D]); }
  // The cradle it stands in.
  parts.push([new THREE.BoxGeometry(2.6, 0.3, 1.0).translate(0, -2.35, 0), STEEL]);
  for (const s of [-1, 1]) parts.push([new THREE.BoxGeometry(0.25, 1.1, 0.9).rotateZ(s * 0.4).translate(s * 1.3, -1.9, 0), STEEL]);
  return merged(parts);
}

export function trophyDinosaur() {
  const G = 0x5a6a58, D = 0x3e4a3c, L = 0x7a8a6a, T = 0xe8e0c8;
  const parts = [
    [new THREE.SphereGeometry(1, 12, 8).scale(1.9, 1.05, 0.95).translate(0, 2.9, 0), G], // the body
    [new THREE.SphereGeometry(1, 10, 8).scale(1.1, 0.9, 0.8).translate(1.4, 3.4, 0), G], // the chest
    [new THREE.ConeGeometry(0.85, 4.6, 10).rotateZ(Math.PI / 2 + 0.12).translate(-3.8, 3.2, 0), G], // the tail
    [new THREE.ConeGeometry(0.4, 2.0, 8).rotateZ(Math.PI / 2 + 0.25).translate(-6.6, 3.65, 0), D],
    [new THREE.CylinderGeometry(0.55, 0.75, 1.4, 10).rotateZ(-0.7).translate(2.35, 4.2, 0), G], // the neck
    [new THREE.BoxGeometry(1.9, 0.75, 0.9).translate(3.4, 4.85, 0), G], // the skull
    [new THREE.BoxGeometry(1.7, 0.3, 0.8).rotateZ(-0.28).translate(3.35, 4.25, 0), D], // the jaw, open
    [new THREE.BoxGeometry(0.4, 0.2, 0.92).translate(2.9, 5.15, 0), D], // the brow ridge
    ...[-0.32, 0.32].map((z) => [new THREE.SphereGeometry(0.11, 6, 4).translate(3.0, 5.05, z * 1.4), 0xd9a92c]), // eyes
  ];
  for (let k = 0; k < 7; k++) { parts.push([new THREE.ConeGeometry(0.06, 0.2, 4).rotateX(Math.PI).translate(2.7 + k * 0.24, 4.42, 0.36), T]); parts.push([new THREE.ConeGeometry(0.06, 0.2, 4).rotateX(Math.PI).translate(2.7 + k * 0.24, 4.42, -0.36), T]); }
  // Legs mid-stride: thighs, shins, feet with toes.
  for (const [z, fwd] of [[0.55, 0.6], [-0.55, -0.5]]) {
    parts.push([new THREE.SphereGeometry(1, 10, 8).scale(0.6, 1.0, 0.45).rotateZ(-fwd * 0.5).translate(0.2 + fwd * 0.3, 2.3, z), L]);
    parts.push([new THREE.CylinderGeometry(0.22, 0.3, 1.6, 8).rotateZ(fwd * 0.4).translate(0.2 + fwd * 0.75, 1.0, z), D]);
    parts.push([new THREE.BoxGeometry(1.0, 0.22, 0.5).translate(0.55 + fwd * 1.0, 0.2, z), D]);
    for (const t of [-0.15, 0, 0.15]) parts.push([new THREE.ConeGeometry(0.06, 0.35, 4).rotateZ(-Math.PI / 2).translate(1.15 + fwd * 1.0, 0.18, z + t), T]);
  }
  // Little arms.
  for (const z of [0.5, -0.5]) parts.push([new THREE.CylinderGeometry(0.08, 0.1, 0.7, 6).rotateZ(-1.0).translate(2.1, 3.3, z), D]);
  // Mechanical seams: riveted plates along the back.
  for (let k = 0; k < 9; k++) parts.push([new THREE.BoxGeometry(0.35, 0.18, 0.5).rotateZ(0.2 - k * 0.05).translate(-2.6 + k * 0.6, 3.95 - Math.abs(k - 4) * 0.05, 0), STEEL]);
  // The mount: a steel post under the belly into the plinth.
  parts.push([new THREE.CylinderGeometry(0.12, 0.12, 2.0, 8).translate(-0.3, 1.0, 0), STEEL]);
  return merged(parts);
}

export function trophyCard() {
  const grp = new THREE.Group();
  const body = merged([
    [new THREE.BoxGeometry(2.4, 3.4, 0.08), 0xf0ead8],
    [new THREE.BoxGeometry(2.2, 3.2, 0.09), 0xc8323c],
    [new THREE.BoxGeometry(2.05, 3.05, 0.1), 0xf0ead8],
    [new THREE.BoxGeometry(0.15, 1.6, 0.4).translate(0, -1.6, -0.3), STEEL],
    [new THREE.BoxGeometry(1.4, 0.15, 0.8).translate(0, -2.3, -0.3), STEEL],
  ]);
  grp.add(body);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 384;
    const g = c.getContext('2d');
    g.fillStyle = '#f0ead8'; g.fillRect(0, 0, 256, 384);
    g.fillStyle = '#c8323c'; g.font = 'bold 54px Bangers, Impact, sans-serif'; g.fillText('J', 18, 62);
    g.save(); g.translate(238, 322); g.rotate(Math.PI); g.fillText('J', 0, 0); g.restore();
    // A grinning jester's face in green, purple and red ink.
    g.fillStyle = '#4a2a6a'; g.beginPath(); g.moveTo(68, 150); g.lineTo(128, 70); g.lineTo(188, 150); g.closePath(); g.fill();
    g.fillStyle = '#2f8a3a'; for (const x of [68, 128, 188]) { g.beginPath(); g.arc(x, x === 128 ? 70 : 150, 12, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#f4f0e8'; g.beginPath(); g.ellipse(128, 200, 56, 64, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#0b0b12'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#0b0b12'; for (const x of [106, 150]) { g.beginPath(); g.ellipse(x, 186, 8, 12, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#c8323c'; g.lineWidth = 7; g.beginPath(); g.arc(128, 206, 34, 0.15, Math.PI - 0.15); g.stroke();
    g.fillStyle = '#0b0b12'; g.font = 'bold 34px Bangers, Impact, sans-serif'; g.textAlign = 'center'; g.fillText('JOKER', 128, 320);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 2.95), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.z = 0.056;
    grp.add(face);
  }
  return grp;
}
