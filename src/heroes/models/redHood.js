// The hooded gunman: a domed red motorcycle-style helmet that encloses the whole head (a darker
// face plate with a chin bar and two white slit lenses, a neck seal), a brown leather jacket with
// a raised collar worn open over a grey armoured shirt with our own red bat (src/config/batShape.js,
// not the comics' mark), and a holster with a pistol grip on each thigh. Pistols are the kit's props.
import * as THREE from 'three';
import { costumeBody, chestDecal } from './costume.js';
import { shell, skirt, box, torus } from './kit.js';
import { frontHeightField } from './shape.js';
import { batOutline } from '../../config/batShape.js';
import { PALETTE } from '../../config/palette.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const RED = 0xb8262e, PLATE = 0x7e161d, CHIN = 0x9a1d25, SEAL = 0x1c1c22, JACKET = 0x5a3a26, JACKET_DARK = 0x40281a, ARMOUR = 0x5c616c;

// The helmet surface as a function of polar angle theta (0 = crown) and azimuth phi (0 = the
// face, +x to the model's left), in metres about the helmet centre, facing +z. Below the eyes the
// section squares off toward a squircle and the chin pushes forward: a helmet, not a ball.
function helmetPoint(theta, phi, inflate = 1) {
  const st = Math.sin(theta), ct = Math.cos(theta);
  let x = st * Math.sin(phi), z = st * Math.cos(phi);
  const sq = clamp01((theta - Math.PI * 0.36) / (Math.PI * 0.3));
  const s4 = Math.sin(phi) ** 4 + Math.cos(phi) ** 4;
  const k = 1 + (1 / Math.pow(s4, 0.25) - 1) * sq;
  x *= k * (1 - 0.06 * sq); z *= k;
  const front = z > 0;
  const rx = 0.12, ry = ct > 0 ? 0.135 : 0.14;
  const rz = front ? 0.14 * (1 + 0.07 * sq) : 0.13;
  return [x * rx * inflate, ct * ry * inflate, z * rz * inflate];
}

// A grid patch of the helmet surface: at(u, v) -> [theta, phi] for u, v in [0, 1].
function helmetPatch(at, { rows = 10, cols = 16, inflate = 1 } = {}) {
  const pos = [], idx = [];
  const C = cols + 1;
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const [th, ph] = at(r / rows, c / cols);
    pos.push(...helmetPoint(th, ph, inflate));
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * C + c;
    idx.push(i, i + C, i + 1, i + 1, i + C, i + C + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Outward winding: compare the first non-degenerate face normal with the direction from centre.
  const P = g.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromBufferAttribute(P, idx[t]); b.fromBufferAttribute(P, idx[t + 1]); c.fromBufferAttribute(P, idx[t + 2]);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-12) continue;
    if (n.dot(a.clone().add(b).add(c)) < 0) {
      const ia = g.index.array;
      for (let k = 0; k < ia.length; k += 3) { const s = ia[k]; ia[k] = ia[k + 2]; ia[k + 2] = s; }
      g.computeVertexNormals();
    }
    break;
  }
  return g;
}

export function createRedHood(assets) {
  const { ch, src, kit, B, lm, fwd } = costumeBody(assets, 'redHood', { height: 1.01 });
  const hc = lm.headCenter;
  const yaw = fwd < 0 ? Math.PI : 0;
  const PI = Math.PI;

  // ---- the helmet (bound to the head)
  const centre = [hc.x, hc.y - 0.012, hc.z + 0.004 * fwd];
  const onHead = (geo, color, outline, slot = 'lit') => kit.rigid(geo, { bone: 'Head', slot, color, outline, pos: centre, rot: [0, yaw, 0] });
  // Shell: crown to just under the jaw, all the way round.
  // (phi runs from the back round to the back, so the patch's seam is out of sight)
  onHead(helmetPatch((u, v) => [u * PI * 0.83, PI + v * PI * 2], { rows: 16, cols: 28 }), RED, 0.006);
  // Face plate: a shield shape from the brow to the chin, a few millimetres proud of the shell so
  // its edge inks as a seam; narrower at the chin, the brow edge dipping at the temples.
  onHead(helmetPatch((u, v) => {
    const w = PI * (0.34 - 0.1 * u);
    const ph = (v * 2 - 1) * w;
    const top = PI * (0.4 + 0.05 * (ph / w) ** 2);
    return [top + (PI * 0.79 - top) * u, ph];
  }, { rows: 10, cols: 14, inflate: 1.03 }), PLATE, 0.004);
  // Chin bar over the bottom of the plate.
  onHead(helmetPatch((u, v) => [PI * (0.68 + 0.15 * u), (v * 2 - 1) * PI * (0.22 - 0.03 * u)], { rows: 5, cols: 10, inflate: 1.055 }), CHIN, 0.004);
  // Two breathing slots in the chin bar.
  for (const s of [-1, 1]) onHead(helmetPatch((u, v) => [PI * (0.735 + 0.025 * u), s * PI * (0.04 + 0.08 * v)], { rows: 1, cols: 4, inflate: 1.062 }), SEAL, 0);
  // Lenses: slanted slits, paper-white and unlit so they read at night from across a street.
  for (const s of [-1, 1]) {
    const corner = (u, v) => {
      // inner-top, outer-top, inner-bottom, outer-bottom in (theta, phi) fractions of pi
      const it = [0.462, 0.035], ot = [0.418, 0.215], ib = [0.522, 0.045], ob = [0.49, 0.2];
      const top = [it[0] + (ot[0] - it[0]) * v, it[1] + (ot[1] - it[1]) * v];
      const bot = [ib[0] + (ob[0] - ib[0]) * v, ib[1] + (ob[1] - ib[1]) * v];
      return [PI * (top[0] + (bot[0] - top[0]) * u), s * PI * (top[1] + (bot[1] - top[1]) * u)];
    };
    onHead(helmetPatch(corner, { rows: 3, cols: 6, inflate: 1.045 }), PALETTE.paper, 0.002, 'unlit');
  }
  // Neck seal: a dark rolled gasket where the helmet meets the collar.
  const neck = B('neck_01');
  // A dark gaiter over the throat from the shirt collar up into the helmet, then the gasket ring.
  kit.skinned(shell(src, { pick: (p) => p.y > lm.neckY - 0.05 && p.y < centre[1] - 0.07 && Math.abs(p.x) < 0.1, offset: 0.007, color: SEAL, uv: false }), { outline: 0.003 });
  kit.rigid(torus(0.064, 0.016, 6, 18), { bone: 'Head', color: SEAL, outline: 0.003, pos: [0, centre[1] - 0.12, neck.z + 0.01 * fwd], rot: [PI / 2, 0, 0], scale: [1, 1.15, 0.9] });

  // ---- armour and emblem on the shirt
  kit.skinned(shell(src, {
    // The armoured front: a plate over the chest and stomach (it also hides the bat painted into
    // the suit texture), skinned exactly like the body under it.
    pick: (p, n) => !(Math.abs(p.x) > lm.shoulderX - 0.03 && p.y > lm.chestY - 0.12) && p.y > lm.beltY + 0.03 && p.y < lm.neckY - 0.045 && n.z * fwd > 0.1 && Math.abs(p.x) < 0.2,
    offset: 0.006, uv: false,
    color: (p) => (p.y < lm.chestY - 0.08 && (Math.abs(p.y - (lm.chestY - 0.12)) < 0.006 || Math.abs(p.y - (lm.chestY - 0.21)) < 0.006 || Math.abs(p.x) < 0.004) ? 0x3a3e47 : ARMOUR),
  }), { outline: 0.004 });
  const hf = frontHeightField(src, lm, lm.chestY, fwd);
  const y0 = lm.chestY + 0.006;
  const bat = batOutline().map(([x, y]) => [x * 0.0031, y * 0.0031]);
  kit.skinned(chestDecal(src, lm, bat, { y: y0, lift: 0.015, color: RED, hf }), { outline: 0.0025 });

  // ---- the jacket: torso and sleeves, open down the front, a short skirt for a clean hem, collar up
  const inArm = (p) => Math.abs(p.x) > lm.shoulderX - 0.02 && p.y > lm.chestY - 0.12;
  const wristX = Math.abs(B('hand_l').x) - 0.04;
  const openAt = (y) => 0.06 + Math.max(0, y - (lm.chestY - 0.14)) * 0.45;
  kit.skinned(shell(src, {
    pick: (p, n) => {
      const ax = Math.abs(p.x);
      if (inArm(p)) return ax < wristX;
      if (p.y < lm.beltY - 0.02 || p.y > lm.neckY + 0.01) return false;
      return !(n.z * fwd > -0.1 && ax < openAt(p.y));
    },
    offset: (p) => 0.016 + 0.006 * clamp01((p.y - lm.chestY) / 0.12),
    // Darker cuffs and a darker band round the shoulders' yoke.
    color: (p) => (inArm(p) && Math.abs(p.x) > wristX - 0.05 ? JACKET_DARK : JACKET), uv: false,
  }), { outline: 0.005 });
  kit.skinned(skirt(ch.body, lm, { top: lm.beltY + 0.02, bottom: lm.beltY - 0.15, rTop: lm.hipHalfWidth * 0.72, rBottom: lm.hipHalfWidth * 0.8, depth: 0.78, open: 0.42, segs: 18, rows: 3, color: JACKET }), { outline: 0.005 });
  // Raised collar: a flared open cone round the back and sides of the neck, lapel tips in front.
  const collarGeo = new THREE.CylinderGeometry(0.118, 0.092, 0.1, 18, 1, true, PI * 0.3, PI * 1.4);
  kit.rigid(collarGeo, { bone: 'spine_03', color: JACKET_DARK, outline: 0.005, pos: [0, neck.y + 0.005, neck.z - 0.012 * fwd], rot: [-0.12 * fwd, yaw, 0] });
  kit.rigid(collarGeo, { bone: 'spine_03', color: JACKET_DARK, outline: 0, pos: [0, neck.y + 0.005, neck.z - 0.012 * fwd], rot: [-0.12 * fwd, yaw, 0], scale: [-0.96, 1, 0.96] });

  // ---- belt and thigh holsters with pistol grips
  for (const t of ['thigh_l', 'thigh_r']) {
    const th = B(t);
    const side = Math.sign(th.x) || 1;
    const x = th.x + side * 0.088, y = th.y - 0.17;
    // [polish] Tan leather with a pale welt round the outer face, so the holsters read against
    // the dark trousers (they were near-black and vanished at play distance).
    kit.rigid(box(0.046, 0.18, 0.09), { bone: t, color: 0x7a4e2c, outline: 0.004, pos: [x, y, th.z + 0.005 * fwd], rot: [0, 0, side * 0.05] });
    kit.rigid(box(0.004, 0.186, 0.096), { bone: t, color: 0xc89a62, outline: 0, pos: [x + side * 0.024, y, th.z + 0.005 * fwd], rot: [0, 0, side * 0.05] });
    kit.rigid(box(0.004, 0.158, 0.07), { bone: t, color: 0x8e5c34, outline: 0, pos: [x + side * 0.0265, y - 0.004, th.z + 0.005 * fwd], rot: [0, 0, side * 0.05] });
    // The grip: angled back out of the holster's mouth, gunmetal with a lit back strap.
    kit.rigid(box(0.03, 0.085, 0.036), { bone: t, color: 0x4a4e58, outline: 0.003, pos: [x + side * 0.004, y + 0.115, th.z - 0.016 * fwd], rot: [-0.35 * fwd, 0, side * 0.05] });
    // Leg straps, in the same leather.
    for (const dy of [-0.08, -0.2]) kit.rigid(torus(0.088, 0.009, 4, 16), { bone: t, color: 0x6a4428, outline: 0.002, pos: [th.x, th.y + dy, th.z], rot: [PI / 2, 0, 0], scale: [1, 0.95, 1] });
  }
  kit.build();
  ch.suit = 'redHood';
  ch.colors = { jacket: JACKET, helmet: RED };
  ch.meta = { heightScale: 1.01, cape: null, hands: { l: 'hand_l', r: 'hand_r' }, props: 'pistols', traversal: 'grapple', palette: ch.colors };
  ch.animator.play('Idle_Loop');
  ch.dressed();
  return ch;
}
