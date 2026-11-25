// Dead blending (Holden 2023, a simple inertialization): on a transition the new clip takes over
// at full weight at once, and for a short blend the pose shown is a cross-fade from the OLD pose
// carried forward on its own velocity (decaying) into the new clip. A cancelled strike keeps its
// arm's momentum and lands in the new clip's pose, where crossFadeFrom dragged it back toward
// wherever the old clip was going and mushed two live poses together (combat-findings 3, 4).
// docs/design/research/combat-animation-assets.md 1.3.
//
// It runs as a post-pass after mixer.update on every bone quaternion plus the pelvis position
// (root motion is never blended: the warp owns the root). Allocation-free per frame: the history
// and the extrapolated pose live in typed arrays made once per character.
import * as THREE from 'three';

// Quality switch (potato/low fall back to the mixer's cross-fade). Set from the render tier.
let enabled = true;
export function setDeadBlendEnabled(on) { enabled = !!on; }
export const deadBlendEnabled = () => enabled;

// Caps on the velocity a transition carries (rad/s per bone, m/s for the hips).
const MAX_SPIN = 10, MAX_SLIDE = 2.5;
// Adaptive length (anim2): a blend over `fade` is fine between two similar poses, but a roll into a
// cape swirl or a stagger into a fall turns the arms and legs through 2-3 radians, and squeezed
// into 0.08 s that is a pop however smooth the curve. On the first blended frame the distance
// between the old pose and the new clip's is measured along each limb chain (the sum of the
// joint angles from the hips out to the hand or foot) and the blend is stretched so the limb's
// acceleration stays bounded: dur >= ADAPT * sqrt(chain angle) (+ the hips' offset), capped at
// MAX_ADAPT and at the caller's `maxBlend` (a strike's contact must still read).
const ADAPT = 0.13, ADAPT_HIPS = 0.25, MAX_ADAPT = 0.38;
// The offset `o` (sign s) turned part of the way back to identity: (1 - t) of its angle, along its
// own arc (never flipped to the other way round).
function towardIdentity(o, s, t, out) {
  const x = o.x * s, y = o.y * s, z = o.z * s, w = o.w * s;
  const th = Math.acos(Math.min(1, Math.max(-1, w))), sn = Math.sin(th);
  if (sn < 1e-5) return out.set(x * (1 - t), y * (1 - t), z * (1 - t), 1).normalize();
  const k = Math.sin((1 - t) * th) / sn;
  return out.set(x * k, y * k, z * k, Math.cos((1 - t) * th));
}
// Limb chains by bone name (the shared skeleton); characters without them use the largest angle.
const CHAINS = [
  ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l'],
  ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r'],
  ['pelvis', 'thigh_l', 'calf_l', 'foot_l'],
  ['pelvis', 'thigh_r', 'calf_r', 'foot_r'],
  ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head'],
];
// The pure length rule (exported for tests): a chain angle (rad) and hip offset (m) to seconds.
export function adaptiveBlend(fade, chainAngle, hips = 0, maxBlend = MAX_ADAPT) {
  const want = ADAPT * Math.sqrt(Math.max(0, chainAngle)) + ADAPT_HIPS * Math.max(0, hips);
  return Math.max(fade, Math.min(want, maxBlend, MAX_ADAPT));
}

export function createDeadBlend(bones, pelvis, { decayHalfLife = 0.05 } = {}) {
  const n = bones.length;
  const last = new Float32Array(n * 4), prev = new Float32Array(n * 4);
  const ext = new Float32Array(n * 4), w = new Float32Array(n * 3);
  const lastP = new THREE.Vector3(), prevP = new THREE.Vector3(), extP = new THREE.Vector3(), vP = new THREE.Vector3();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qd = new THREE.Quaternion();
  const mt = new THREE.Matrix4(), mr = new THREE.Matrix4(), qm = new THREE.Quaternion(), vt = new THREE.Vector3(), sc = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let t = 0, dur = 0, lastDt = 1 / 60, frames = 0, measure = false, maxDur = MAX_ADAPT;
  // Limb groups (anim2): a strike caps its blend so the striking limb lands on its contact frame,
  // but the other limbs need not hurry: a punch thrown out of a kick lets the kicking leg come
  // down at its own pace (durFree) instead of in the punch's 0.14 s.
  let durFree = 0, free = 0;
  const group = new Uint8Array(n); // 0 core (hips, spine, head), 1 arms, 2 legs
  for (let i = 0; i < n; i++) {
    for (let b = bones[i]; b; b = b.parent) {
      const nm = b.name ?? '';
      if (/^clavicle_/.test(nm)) { group[i] = 1; break; }
      if (/^thigh_/.test(nm)) { group[i] = 2; break; }
      if (!b.isBone) break;
    }
  }
  // Chains as bone indices (built once).
  const index = new Map(bones.map((b, i) => [b.name, i]));
  const chains = CHAINS.map((c) => c.map((n) => index.get(n))).filter((c) => c.every((i) => i !== undefined));
  const ang = new Float32Array(n);
  // The new clip's pose on the first blended frame, and the sign that keeps each bone's offset
  // (old pose relative to it) on its own side as the old pose drifts.
  const tgt0 = new Float32Array(n * 4), sign = new Int8Array(n).fill(1);
  const tgtP0 = new THREE.Vector3(), qo = new THREE.Quaternion();
  // The clip's own (raw) pose this frame, and what was finally shown last frame (after the blend,
  // the overlays and the IK hooks). A bone the new clip has no track for keeps last frame's shown
  // value (the mixer never touches it): the offset, and any IK after it, must go on the raw value
  // again, not on top of themselves (the ladder's arms shook while its IK faded in).
  const raw = new Float64Array(n * 4), shown = new Float64Array(n * 4);
  const rawP = new THREE.Vector3(), shownP = new THREE.Vector3();
  let fresh = true;
  return {
    get active() { return t < Math.max(dur, durFree); },
    get duration() { return Math.max(dur, durFree); },
    // Right before the new action starts at full weight: snapshot the pose being shown and how
    // fast each bone was turning over the last frame. `blend` is the shortest blend; the first
    // apply() stretches it to the pose distance, up to `maxBlend`.
    // freeGroup: 'arms' or 'legs', the limbs the cap does not apply to (null: none).
    start(blend = 0.1, maxBlend = MAX_ADAPT, freeGroup = null) {
      if (!enabled || frames < 1) { t = dur = durFree = 0; return; }
      measure = blend > 0.01; maxDur = maxBlend;
      free = freeGroup === 'arms' ? 1 : freeGroup === 'legs' ? 2 : 0;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        if (frames < 2) { w[i * 3] = w[i * 3 + 1] = w[i * 3 + 2] = 0; }
        else {
          qa.fromArray(last, o); qb.fromArray(prev, o);
          qd.copy(qa).multiply(qb.invert());
          if (qd.w < 0) { qd.x = -qd.x; qd.y = -qd.y; qd.z = -qd.z; qd.w = -qd.w; }
          const s = Math.sqrt(Math.max(0, 1 - qd.w * qd.w)), ang = 2 * Math.acos(Math.min(1, qd.w));
          let k = s > 1e-6 ? ang / s / lastDt : 0;
          // A bone that jumped last frame (a pose snap, a clamped clip end) would extrapolate
          // into a spin ("crazy poses"): cap the carried angular speed.
          const spd = (ang / lastDt);
          if (spd > MAX_SPIN) k *= MAX_SPIN / spd;
          w[i * 3] = qd.x * k; w[i * 3 + 1] = qd.y * k; w[i * 3 + 2] = qd.z * k;
        }
        ext[o] = last[o]; ext[o + 1] = last[o + 1]; ext[o + 2] = last[o + 2]; ext[o + 3] = last[o + 3];
      }
      extP.copy(lastP);
      if (frames >= 2) vP.copy(lastP).sub(prevP).divideScalar(lastDt); else vP.set(0, 0, 0);
      if (vP.lengthSq() > MAX_SLIDE * MAX_SLIDE) vP.setLength(MAX_SLIDE);
      t = 0; dur = durFree = Math.max(1e-3, blend);
    },
    // After mixer.update(dt), before render. dt is this actor's: 0 during its hit-stop, when the
    // extrapolation holds still but the blend is still applied (the mixer has just written the
    // new clip's raw pose; without the blend a frozen fighter would show it for the whole stop).
    // record(dt) follows.
    apply(dt) {
      if (t >= dur && t >= durFree) return;
      if (measure) {
        // The new clip's first pose is on the bones now: how far is it from the old one?
        measure = false;
        let worst = 0;
        for (let i = 0; i < n; i++) {
          const q = bones[i].quaternion;
          qa.fromArray(ext, i * 4); ang[i] = qa.angleTo(q); if (ang[i] > worst) worst = ang[i];
          q.toArray(tgt0, i * 4);
          qo.copy(q).invert().premultiply(qa);
          sign[i] = qo.w < 0 ? -1 : 1;
        }
        if (pelvis) tgtP0.copy(pelvis.position);
        fresh = true;
        let chain = chains.length ? 0 : worst;
        for (const c of chains) { let s = 0; for (const i of c) s += ang[i]; if (s > chain) chain = s; }
        const hips = pelvis ? Math.hypot(extP.x - pelvis.position.x, extP.y - pelvis.position.y, extP.z - pelvis.position.z) * (pelvis.parent?.scale?.x ?? 1) : 0;
        const d0 = dur;
        dur = adaptiveBlend(d0, chain, hips, maxDur);
        durFree = free ? adaptiveBlend(d0, chain, hips) : dur;
      }
      const step = dt > 0 ? dt : 0;
      t += step;
      const decay = step > 0 ? Math.pow(0.5, step / decayHalfLife) : 1;
      const a = Math.min(1, t / dur), alphaCap = a * a * (3 - 2 * a);
      const af = Math.min(1, t / durFree), alphaFree = af * af * (3 - 2 * af);
      const alpha = alphaCap;
      for (let i = 0; i < n; i++) {
        const o = i * 4, j = i * 3;
        qa.fromArray(ext, o);
        if (step > 0) {
          const wx = (w[j] *= decay), wy = (w[j + 1] *= decay), wz = (w[j + 2] *= decay);
          const speed = Math.hypot(wx, wy, wz), ang = speed * step;
          if (ang > 1e-7) {
            const s = Math.sin(ang / 2) / speed;
            qd.set(wx * s, wy * s, wz * s, Math.cos(ang / 2));
            qa.premultiply(qd).normalize();
          }
          qa.toArray(ext, o);
        }
        // Offset form (anim2): the old pose as an offset from the new clip's FIRST blended pose,
        // decayed to nothing and laid over the clip as it moves on. A slerp straight from the old
        // pose to the moving clip pose (the first version) flips its way round whenever the two
        // pass 180 degrees apart (a roll's arm against a fall's, a cape swirl spinning past the
        // held stance) and the limb whipped round for a frame: the 0.6-1.5 m arm pops.
        const q = bones[i].quaternion;
        if (!fresh && q.x === shown[o] && q.y === shown[o + 1] && q.z === shown[o + 2] && q.w === shown[o + 3]) q.set(raw[o], raw[o + 1], raw[o + 2], raw[o + 3]);
        raw[o] = q.x; raw[o + 1] = q.y; raw[o + 2] = q.z; raw[o + 3] = q.w;
        qo.fromArray(tgt0, o).invert().premultiply(qa);
        towardIdentity(qo, sign[i], free && group[i] === free ? alphaFree : alphaCap, qo);
        q.premultiply(qo);
      }
      if (step > 0) { vP.multiplyScalar(decay); extP.addScaledVector(vP, step); }
      if (pelvis) {
        const p = pelvis.position;
        if (!fresh && p.equals(shownP)) p.copy(rawP);
        rawP.copy(p);
        p.addScaledVector(vt.subVectors(extP, tgtP0), 1 - alpha);
      }
      fresh = false;
    },
    // After everything else has posed the bones this frame (overlays, IK): what is shown, for
    // the next transition's velocity.
    record(dt) {
      if (t < Math.max(dur, durFree) + 0.5) {
        for (let i = 0; i < n; i++) { const q = bones[i].quaternion, o = i * 4; shown[o] = q.x; shown[o + 1] = q.y; shown[o + 2] = q.z; shown[o + 3] = q.w; }
        if (pelvis) shownP.copy(pelvis.position);
      }
      if (dt <= 0) return;
      prev.set(last);
      for (let i = 0; i < n; i++) bones[i].quaternion.toArray(last, i * 4);
      if (pelvis) { prevP.copy(lastP); lastP.copy(pelvis.position); }
      lastDt = dt;
      frames++;
    },
    // The character's root moved or turned under a running blend (a get-up aligned to where the
    // body lies): `m` (the pelvis parent's old world matrix in its new frame, Mp'^-1 * Mp) carries
    // the held old pose with it, so it stays put in the world while the new clip blends in.
    rebase(m) {
      if (!pelvis) return;
      const pi = bones.indexOf(pelvis);
      if (pi < 0) return;
      mr.extractRotation(m); qm.setFromRotationMatrix(mr);
      const fix = (arr, p) => {
        qb.fromArray(arr, pi * 4);
        mt.compose(p, qb, one).premultiply(m).decompose(p, qb, sc);
        qb.toArray(arr, pi * 4);
      };
      fix(ext, extP); fix(last, lastP); fix(prev, prevP);
      vP.applyQuaternion(qm);
      vt.set(w[pi * 3], w[pi * 3 + 1], w[pi * 3 + 2]).applyQuaternion(qm);
      w[pi * 3] = vt.x; w[pi * 3 + 1] = vt.y; w[pi * 3 + 2] = vt.z;
    },
    cancel() { t = dur = 0; },
  };
}
