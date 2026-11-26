// Faces and life on the shared 65-bone skeleton, without touching it.
//
// The Quaternius rig has no jaw, eye or lid bones, and the skeleton's names, hierarchy and rest
// pose are shared with every clip and with the animation graph, so they stay exactly as they are.
// Instead a character gets a few FACE PIVOTS: plain Object3Ds (not bones: no clip binds to them)
// parented to the Head bone at the eyes, lids, brows and mouth. A mesh that wants a face is bound
// to an EXTENDED skeleton: the body's 65 bones followed by these pivots, so face vertices are
// skinned to a pivot exactly like any other vertex is to a bone, and the figure stays one mesh
// (one draw call, plus its hull). Moving a pivot moves its part:
//
//   eye_l, eye_r     the eyeballs, turned for lookAt (the pupils follow a target)
//   lid_l, lid_r     a skin-coloured lid hinged at its top edge: scale.y 0 open, 1 shut (blinks)
//   brow_l, brow_r   the brows: raised, lowered, tilted by expressions
//   jaw              the mouth: a dark mouth shape, scale.y from a closed line to open (talk)
//
// API on the character (graceful no-ops where a model lacks a part, e.g. Batman has no eyes):
//   ch.setExpression(name)   'neutral' | 'smile' | 'frown' | 'angry' | 'surprised' | 'sad'
//                            | 'tired' | 'pain' | 'wince' (unknown names: neutral)
//   ch.lookAt(pos | null)    world position for the eyes (and the head, up to ~30 degrees); null
//                            lets go
//   ch.talk(amount)          0..1 mouth motion while speaking (0 stops); the jaw flaps on its own
//   ch.blink()               one blink now (they also blink on their own every few seconds)
// All of it is applied after the animation each frame (wrapped round animator.update, like the
// foot planting), so any clip plays underneath unchanged.
import * as THREE from 'three';

export const FACE_PIVOTS = ['eye_l', 'eye_r', 'lid_l', 'lid_r', 'brow_l', 'brow_r', 'jaw'];

export const EXPRESSIONS = {
  neutral: { brow: 0, tilt: 0, lid: 0, mouthW: 1, mouthOpen: 0 },
  smile: { brow: 0.003, tilt: 0.05, lid: 0.15, mouthW: 1.25, mouthOpen: 0.15 },
  frown: { brow: -0.004, tilt: -0.22, lid: 0.1, mouthW: 0.85, mouthOpen: 0 },
  angry: { brow: -0.006, tilt: -0.38, lid: 0.25, mouthW: 0.9, mouthOpen: 0.1 },
  surprised: { brow: 0.009, tilt: 0.08, lid: 0, mouthW: 0.8, mouthOpen: 0.65 },
  sad: { brow: 0.002, tilt: 0.3, lid: 0.3, mouthW: 0.85, mouthOpen: 0 },
  tired: { brow: -0.002, tilt: 0.1, lid: 0.55, mouthW: 0.95, mouthOpen: 0 },
  pain: { brow: -0.004, tilt: 0.32, lid: 0.6, mouthW: 1.1, mouthOpen: 0.35 },
  wince: { brow: -0.005, tilt: 0.25, lid: 0.8, mouthW: 1.15, mouthOpen: 0.2 },
};

// Where the face parts are on this body (bind space), from the eye and brow meshes.
export function faceLandmarks(ch) {
  const { lm, eyes, brows } = ch;
  const P = eyes.geometry.attributes.position;
  const side = (s) => {
    const box = new THREE.Box3();
    for (let i = 0; i < P.count; i++) if (Math.sign(P.getX(i)) === s) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(P, i));
    return box;
  };
  const out = {};
  for (const [name, s] of [['l', Math.sign(lm.eyeSpread) || 1], ['r', -(Math.sign(lm.eyeSpread) || 1)]]) {
    const b = side(s);
    const c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y) / 2;
    // The eye mesh in this rig is the visible front of the eyeball: pivot a radius behind it.
    out[`eye_${name}`] = c.clone().setZ((lm.fwd > 0 ? b.max.z : b.min.z) - r * lm.fwd);
    out[`eyeFront_${name}`] = lm.fwd > 0 ? b.max.z : b.min.z;
    out[`eyeR_${name}`] = r;
    out[`side_${name}`] = s;
  }
  const BP = brows?.geometry.attributes.position;
  for (const name of ['l', 'r']) {
    const s = out[`side_${name}`];
    const b = new THREE.Box3();
    if (BP) for (let i = 0; i < BP.count; i++) if (Math.sign(BP.getX(i)) === s) b.expandByPoint(new THREE.Vector3().fromBufferAttribute(BP, i));
    out[`brow_${name}`] = b.isEmpty() ? out[`eye_${name}`].clone().add(new THREE.Vector3(0, 0.022, 0)) : b.getCenter(new THREE.Vector3());
  }
  out.mouth = new THREE.Vector3(0, lm.eyeY - 0.079, 0);
  return out;
}

// The extended skeleton for one character: its body skeleton's bones plus the face pivots,
// parented to its Head bone. Returns { skeleton, index: { pivotName: boneIndex }, pivots }.
// `at` gives each pivot's bind position (mesh space); missing names are placed at the head.
export function createFaceRig(ch, at) {
  const body = ch.body;
  const sk = body.skeleton;
  const headI = sk.bones.findIndex((b) => b.name === 'Head');
  const head = sk.bones[headI];
  const headBind = sk.boneInverses[headI].clone().invert(); // the Head's world matrix at bind
  const bones = sk.bones.slice(), inverses = sk.boneInverses.slice();
  const index = {}, pivots = {};
  const q = new THREE.Vector3();
  for (const name of FACE_PIVOTS) {
    const p = (at[name] ?? ch.lm.headCenter).clone().applyMatrix4(body.bindMatrix);
    q.copy(p).applyMatrix4(headBind.clone().invert()); // in the Head's own frame
    const o = new THREE.Object3D();
    o.name = `face_${name}`;
    o.position.copy(q);
    head.add(o);
    const bind = headBind.clone().multiply(new THREE.Matrix4().makeTranslation(q.x, q.y, q.z));
    index[name] = bones.length;
    bones.push(o);
    inverses.push(bind.invert());
    pivots[name] = o;
  }
  return { skeleton: new THREE.Skeleton(bones, inverses), index, pivots };
}

// Lid and mouth geometry for a face (bind space; skinIndex set by the caller to the pivots).
// Lids hinge at their top edge; the mouth is centred, its height the open shape.
export function lidGeometry(r) {
  const w = r * 1.35, h = r * 2.3;
  const g = new THREE.ShapeGeometry(new THREE.Shape([[-w, 0], [w, 0], [w * 0.9, -h * 0.55], [0, -h], [-w * 0.9, -h * 0.55]].map(([x, y]) => new THREE.Vector2(x, y))));
  return g;
}
export function mouthGeometry() {
  const pts = [];
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; pts.push(new THREE.Vector2(Math.cos(a) * 0.019, Math.sin(a) * (Math.sin(a) < 0 ? 0.011 : 0.004))); }
  return new THREE.ShapeGeometry(new THREE.Shape(pts));
}

// Installs the face behaviour on ch for the pivots that exist. headTurn: how far (radians) the
// head turns toward a lookAt target on top of the animation.
export function installFace(ch, rig, { headTurn = 0.5, blink = true } = {}) {
  const pv = rig?.pivots ?? {};
  const head = ch.bone('Head');
  const state = { expr: EXPRESSIONS.neutral, target: null, talk: 0, blinkT: 0, nextBlink: 2 + Math.random() * 3, t: 0 };
  const cur = { brow: 0, tilt: 0, lid: 0, mouthW: 1, mouthOpen: 0, yaw: 0, pitch: 0 };
  const rest = {};
  for (const [k, o] of Object.entries(pv)) rest[k] = o.position.clone();
  const base = new THREE.Quaternion(), written = new THREE.Quaternion(), turn = new THREE.Quaternion();
  const v = new THREE.Vector3(), hp = new THREE.Vector3(), e = new THREE.Euler();
  const inv = new THREE.Matrix4();
  let haveBase = false;

  ch.setExpression = (name) => { state.expr = EXPRESSIONS[name] ?? EXPRESSIONS.neutral; ch.expression = EXPRESSIONS[name] ? name : 'neutral'; };
  ch.lookAt = (pos) => { state.target = pos ? (state.target ?? new THREE.Vector3()).copy(pos) : null; };
  ch.talk = (amount = 0) => { state.talk = Math.max(0, Math.min(1, amount)); };
  ch.blink = () => { state.blinkT = 0.16; };
  ch.expression = 'neutral';
  // (ch.face(yaw) is the facing method every character has: the rig lives on ch.faceRig.)
  ch.faceRig = { pivots: pv, state, parts: Object.keys(pv) };

  const advance = ch.animator.update;
  ch.animator.update = (dt) => {
    advance(dt);
    state.t += dt;
    const k = Math.min(1, dt * 10);
    const x = state.expr;
    for (const key of ['brow', 'tilt', 'lid', 'mouthW', 'mouthOpen']) cur[key] += (x[key] - cur[key]) * k;
    // Blinks: a quick shut and open every few seconds.
    if (blink) {
      state.nextBlink -= dt;
      if (state.nextBlink <= 0) { state.blinkT = 0.16; state.nextBlink = 2.5 + Math.random() * 3.5; }
    }
    let lid = cur.lid;
    if (state.blinkT > 0) { state.blinkT -= dt; lid = Math.max(lid, 1 - Math.abs(state.blinkT - 0.08) / 0.08); }
    for (const s of ['l', 'r']) {
      const L = pv[`lid_${s}`]; if (L) L.scale.set(1, Math.max(0.001, lid), 1);
      const B = pv[`brow_${s}`];
      if (B) { B.position.copy(rest[`brow_${s}`]); B.position.y += cur.brow; B.rotation.z = cur.tilt * (s === 'l' ? 1 : -1) * ch.lm.fwd; }
    }
    // Talking: an irregular open/close on top of the expression's mouth.
    const flap = state.talk > 0 ? state.talk * (0.35 + 0.65 * Math.abs(Math.sin(state.t * 11) * Math.sin(state.t * 4.3 + 1))) : 0;
    if (pv.jaw) pv.jaw.scale.set(cur.mouthW, Math.max(0.12, Math.min(1, cur.mouthOpen + flap)), 1);
    // Look-at: the head turns part of the way (on top of the clip), the eyes the rest.
    // Angles are measured and applied in the MODEL's frame (y up, facing lm.fwd on z), never in
    // a bone's own axes, which this rig does not align with anything.
    let yaw = 0, pitch = 0;
    const model = ch.model;
    if (head && haveBase && head.quaternion.equals(written)) head.quaternion.copy(base); // un-keyed head
    if (state.target && head) {
      model.updateWorldMatrix(true, false);
      head.updateWorldMatrix(true, false);
      head.getWorldPosition(hp);
      v.copy(state.target).sub(hp);
      inv.copy(model.matrixWorld).invert();
      v.transformDirection(inv); // direction in model space
      const fz = v.z * ch.lm.fwd;
      yaw = Math.atan2(v.x * ch.lm.fwd, Math.max(1e-3, fz));
      pitch = Math.atan2(v.y, Math.hypot(v.x, fz));
      if (fz < -0.2) { yaw = 0; pitch = 0; } // behind: do not wring the neck
    }
    cur.yaw += (yaw - cur.yaw) * Math.min(1, dt * 6);
    cur.pitch += (pitch - cur.pitch) * Math.min(1, dt * 6);
    if (head) {
      base.copy(head.quaternion);
      haveBase = true;
      const hy = headTurn > 0 ? THREE.MathUtils.clamp(cur.yaw * 0.6, -headTurn, headTurn) : 0;
      const hpch = headTurn > 0 ? THREE.MathUtils.clamp(cur.pitch * 0.5, -headTurn * 0.6, headTurn * 0.6) : 0;
      if (Math.abs(hy) > 1e-4 || Math.abs(hpch) > 1e-4) {
        rotateInModel(head, model, e.set(-hpch * ch.lm.fwd, hy, 0, 'YXZ'));
      }
      written.copy(head.quaternion);
    }
    const ey = THREE.MathUtils.clamp(cur.yaw * 0.4, -0.4, 0.4), ep = THREE.MathUtils.clamp(cur.pitch * 0.5, -0.3, 0.3);
    for (const s of ['l', 'r']) {
      const E = pv[`eye_${s}`];
      if (!E) continue;
      E.quaternion.identity();
      if (Math.abs(ey) > 1e-4 || Math.abs(ep) > 1e-4) rotateInModel(E, model, e.set(-ep * ch.lm.fwd, ey, 0, 'YXZ'));
    }
  };
  return ch;
}

// Turns an object by a rotation given in the model's frame, about the object's own origin.
const _qm = new THREE.Quaternion(), _qmi = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qpi = new THREE.Quaternion(), _qr = new THREE.Quaternion();
function rotateInModel(obj, model, euler) {
  model.getWorldQuaternion(_qm);
  obj.parent.getWorldQuaternion(_qp);
  _qmi.copy(_qm).invert(); _qpi.copy(_qp).invert();
  // world rotation W = qm * r * qm^-1; new local = (qp^-1 * W * qp) * local
  _qr.setFromEuler(euler).premultiply(_qm).multiply(_qmi).premultiply(_qpi).multiply(_qp);
  obj.quaternion.premultiply(_qr);
}
