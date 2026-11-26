// A Batman from a far future: black, a big red bat, a sleek cowl with short sharp ears and no
// cape. He glides on membranes between his arms and his sides instead: a web skinned between the
// arm and the torso, so it stretches into wings as the arms rise and folds away when they drop.
// [polish] Built on the reworked Batman's chassis (batman.js: the hero body, cowl, chest plate,
// gauntlets, belt and boots) in his own palette, so he stands with the main suit, not a step behind.
import * as THREE from 'three';
import { createBatmanModel } from './batman.js';
import { boneIndex, linear, shell } from './kit.js';

const LOOK = {
  palette: {
    suit: 0x1b1c23, dark: 0x0c0d12, accent: 0x2b2d36, emblem: 0xd0262f, line: 0x0a0a0d,
    cape: 0x0c0d12, lens: 0xffffff, skin: 0xc99a7c, glove: 0x14151b, plate: 0x16171d,
  },
  ears: 0.62, collar: 'none', mantle: false, pouches: 'flat', fins: false,
  // The future bat is the suit's whole chest: wide wings, set a touch lower.
  emblemScale: 0.0042, emblemDrop: -0.01, emblemUnlit: true, emblemLift: 0.012,
  extra({ ch, src, kit, lm, fwd, B }) {
    // Red belt line and red cuffs at the wrists: the colour is the silhouette's only accent.
    kit.skinned(shell(src, { pick: (p) => Math.abs(p.y - (lm.beltY - 0.022)) < 0.006 && Math.abs(p.x) < lm.hipHalfWidth + 0.06, offset: 0.0125, color: 0xb3212a, uv: false }), { outline: 0 });
    for (const side of ['l', 'r']) kit.skinned(webGeometry(ch, B, lm, side), { outline: 0.004 });
    void fwd;
  },
};

export function createFutureBat(assets) {
  const ch = createBatmanModel(assets, 'm', { id: 'futureBat', look: LOOK });
  ch.root.scale.setScalar(1.02);
  ch.suit = 'futureBat';
  ch.colors = { ...ch.colors, suit: LOOK.palette.suit, emblem: LOOK.palette.emblem };
  ch.meta = { heightScale: 1.02, cape: null, wings: 'membrane', hands: { l: 'hand_l', r: 'hand_r' }, props: 'none', traversal: 'glide', palette: ch.colors };
  return ch;
}

// The membrane: rows from the arm's underside to the flank; the outer edge runs from the wrist
// back to the hip. Vertices on the arm edge follow the arm bones, those on the body edge the
// spine and pelvis, the inside blends, so it unfolds with the arm. Two-sided.
function webGeometry(ch, B, lm, side) {
  const sk = ch.body.skeleton;
  const fwd = lm.fwd;
  const ua = B(`upperarm_${side}`), la = B(`lowerarm_${side}`), hand = B(`hand_${side}`), hip = B(`thigh_${side}`);
  const z = ua.z - 0.03 * fwd;
  const armEdge = [ua, la, hand].map((v) => new THREE.Vector3(v.x, v.y - 0.03, z));
  const bodyEdge = [new THREE.Vector3(ua.x * 0.75, ua.y - 0.1, z), new THREE.Vector3(ua.x * 0.7, lm.chestY - 0.12, z), new THREE.Vector3(hip.x * 1.3, lm.beltY, z)];
  const iU = boneIndex(sk, `upperarm_${side}`), iL = boneIndex(sk, `lowerarm_${side}`), iS = boneIndex(sk, 'spine_02'), iP = boneIndex(sk, 'pelvis');
  const ROWS = 5, COLS = 6;
  const pos = [], si = [], sw = [], idx = [];
  for (let c = 0; c < COLS; c++) {
    const t = c / (COLS - 1);
    const a = sample(armEdge, t), b = sample(bodyEdge, t);
    for (let r = 0; r < ROWS; r++) {
      const u = r / (ROWS - 1);
      const sag = (c % 2 ? 0.02 : 0) * Math.sin(u * Math.PI); // scallops between the ribs
      pos.push(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + sag, a.z);
      si.push(t < 0.5 ? iU : iL, t < 0.6 ? iS : iP, 0, 0);
      sw.push(1 - u, u, 0, 0);
    }
  }
  for (let c = 0; c < COLS - 1; c++) for (let r = 0; r < ROWS - 1; r++) {
    const i = c * ROWS + r;
    idx.push(i, i + ROWS, i + 1, i + 1, i + ROWS, i + ROWS + 1);
    idx.push(i, i + 1, i + ROWS, i + 1, i + ROWS + 1, i + ROWS);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  const k = linear(0x1a1b22);
  const col = new Float32Array(pos.length);
  for (let i = 0; i < col.length; i += 3) { col[i] = k.r; col[i + 1] = k.g; col[i + 2] = k.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function sample(pts, t) {
  const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f));
  return pts[i].clone().lerp(pts[i + 1], f - i);
}
