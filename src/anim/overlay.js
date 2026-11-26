// Layers on top of the base clip, applied as a post-pass after mixer.update:
// - an upper-body overlay (a flinch while running, a gadget aim or throw while moving): the masked
//   bones are slerped toward the overlay clip's pose by the layer weight;
// - an additive flinch (armoured and shield enemies, a hero chipped mid-move): the overlay clip's
//   rotation relative to its own first frame is added on top of whatever plays.
// Why not three.js actions: an AnimationMixer normalises weights per property and blends a
// partial weight with the bind pose, not with the other actions' result, so a masked action at
// weight 0.6 over a full-body clip would pull the arms 40% toward the T-pose. Sampling the tracks
// ourselves is cheap (a few dozen interpolants) and allocation-free per frame.
import * as THREE from 'three';

// The upper body: the spine and everything above it (arms, neck, head).
export function upperBodyBones(model) {
  const out = new Set();
  const spine = model.getObjectByName('spine_01');
  spine?.traverse((o) => { if (o.isBone) out.add(o.name); });
  return out;
}

// One clip prepared for sampling on one model: per masked bone, its quaternion interpolant.
export function prepareOverlay(model, clip, mask = null) {
  const entries = [];
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const node = track.name.slice(0, dot), prop = track.name.slice(dot + 1);
    if (prop !== 'quaternion' || (mask && !mask.has(node))) continue;
    const bone = model.getObjectByName(node);
    if (!bone) continue;
    const it = track.createInterpolant();
    // The first frame, for the additive reference.
    const ref = new THREE.Quaternion().fromArray(it.evaluate(0)).normalize();
    entries.push({ bone, it, ref });
  }
  return { clip, duration: clip.duration, entries };
}

const qs = new THREE.Quaternion(), qr = new THREE.Quaternion(), qi = new THREE.Quaternion();

// Applies one layer at clip time t with weight w (0..1). additive: add the clip's motion since its
// first frame; otherwise slerp toward the clip's pose.
export function applyOverlay(prep, t, w, additive = false) {
  if (w <= 0) return;
  const time = Math.min(Math.max(0, t), prep.duration);
  for (let i = 0; i < prep.entries.length; i++) {
    const { bone, it, ref } = prep.entries[i];
    qs.fromArray(it.evaluate(time)).normalize();
    if (additive) {
      // delta = ref^-1 * sample, scaled by w (slerp from identity), applied in the bone's frame.
      qr.copy(ref).invert().multiply(qs);
      qi.identity().slerp(qr, w);
      bone.quaternion.multiply(qi);
    } else {
      if (bone.quaternion.dot(qs) < 0) { qs.x = -qs.x; qs.y = -qs.y; qs.z = -qs.z; qs.w = -qs.w; }
      bone.quaternion.slerp(qs, w);
    }
  }
}

// A small set of timed layers for one character. play() starts one (replacing a layer on the same
// slot); update(dt) advances and fades them; apply() poses the bones. Slots: 'upper', 'add'.
export function createOverlays(model) {
  const upper = upperBodyBones(model);
  // The lower body: every other bone (hips and legs), for walking under an upper-body action.
  const lower = new Set();
  model.traverse((o) => { if (o.isBone && !upper.has(o.name)) lower.add(o.name); });
  const masks = { upper, lower, add: null };
  const preps = new Map(); // `${clip.name}|${mask}` -> prepared clip
  const slots = {
    upper: { prep: null, t: 0, speed: 1, w: 0, target: 0, fadeIn: 0.1, fadeOut: 0.15, hold: 0, loop: false, additive: false },
    add: { prep: null, t: 0, speed: 1, w: 0, target: 0, fadeIn: 0.04, fadeOut: 0.12, hold: 0, loop: false, additive: true },
    lower: { prep: null, t: 0, speed: 1, w: 0, target: 0, fadeIn: 0.15, fadeOut: 0.15, hold: 0, loop: false, additive: false },
  };
  const prep = (clip, slot) => {
    const k = clip.name + '|' + (masks[slot] ? slot : 'all');
    let p = preps.get(k);
    if (!p) { p = prepareOverlay(model, clip, masks[slot] ?? null); preps.set(k, p); }
    return p;
  };
  return {
    upperBones: upper,
    // Prepares a clip up front (no interpolant creation mid-fight).
    prime(clip, slot = 'upper') { prep(clip, slot); },
    // weight: peak weight; duration: seconds of clip to play (default the whole clip, or `hold`
    // until stop() for a loop).
    play(slot, clip, { weight = 1, timeScale = 1, startAt = 0, duration = null, loop = false, fadeIn, fadeOut } = {}) {
      const s = slots[slot];
      s.prep = prep(clip, slot);
      s.t = startAt; s.speed = timeScale; s.target = weight; s.loop = loop;
      if (fadeIn !== undefined) s.fadeIn = fadeIn;
      if (fadeOut !== undefined) s.fadeOut = fadeOut;
      s.hold = loop ? Infinity : (duration ?? (s.prep.duration - startAt) / Math.max(0.01, timeScale));
    },
    stop(slot) { const s = slots[slot]; s.hold = 0; },
    active(slot) { const s = slots[slot]; return !!s.prep && (s.w > 0 || s.hold > 0); },
    update(dt) {
      for (const k in slots) {
        const s = slots[k];
        if (!s.prep) continue;
        s.t += dt * s.speed;
        if (s.loop && s.t > s.prep.duration) s.t %= s.prep.duration;
        s.hold -= dt;
        const want = s.hold > 0 ? s.target : 0;
        const rate = want > s.w ? (s.fadeIn > 0 ? dt / s.fadeIn : 1) : (s.fadeOut > 0 ? dt / s.fadeOut : 1);
        s.w = want > s.w ? Math.min(want, s.w + rate * s.target) : Math.max(want, s.w - rate * Math.max(s.target, 1e-3));
        if (s.w <= 0 && s.hold <= 0) s.prep = null;
      }
    },
    apply() {
      for (const k in slots) {
        const s = slots[k];
        if (s.prep && s.w > 0) applyOverlay(s.prep, s.t, s.w, s.additive);
      }
    },
  };
}
