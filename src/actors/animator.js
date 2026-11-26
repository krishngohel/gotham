import * as THREE from 'three';
import { createDeadBlend, deadBlendEnabled } from '../anim/deadBlend.js';
import { createOverlays } from '../anim/overlay.js';

// The shared skeleton has matching bone lengths, but only rotations and the pelvis
// translation are safe to apply across bodies. Scale tracks are identity noise.
export function sanitizeClip(clip) {
  const tracks = clip.tracks.filter((t) => {
    const dot = t.name.lastIndexOf('.');
    const node = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    if (prop === 'scale') return false;
    if (prop === 'position') return node === 'pelvis';
    return true;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// One character's clip player.
// - play(name, { fade, once, timeScale, startAt, blend, maxBlend }) switches the base clip. On a
//   character with dead blending (inertial() enabled: every character with an animation graph,
//   on tiers where it is on) every switch is inertial: the new clip takes over at once and the
//   jump is hidden by a dead blend of at least `fade` seconds, longer for poses far apart
//   (src/anim/deadBlend.js). blend 'crossfade' (or no dead blending) cross-fades in the mixer.
// - overlays: an upper-body layer and an additive flinch layer applied after the mixer
//   (src/anim/overlay.js).
// - after(fn): post-mix hooks (foot locks, IK) that run after the mixer and the overlays, before
//   the pose is recorded for the next inertial transition.
export function createAnimator(root, clips) {
  const mixer = new THREE.AnimationMixer(root);
  // Two actions per clip: replaying the clip that is playing (the same hit reaction twice, the
  // same strike again) restarts it on the other one and crossfades, where a single action could
  // only jump back to its first frame. The twin is made the first time it is needed.
  const actions = new Map();
  let current = null;
  // Base-layer actions that may still hold weight (a cross-fade leaves the old one fading out).
  const live = new Set();
  let blend = null, overlays = null;
  const hooks = [];
  const action = (name, twin = false) => {
    let pair = actions.get(name);
    if (!pair) {
      const clip = clips.get(name);
      if (!clip) throw new Error(`Missing animation clip ${name}`);
      pair = [mixer.clipAction(clip), null];
      actions.set(name, pair);
    }
    if (twin && !pair[1]) pair[1] = mixer.clipAction(pair[0].getClip().clone());
    return twin ? pair[1] : pair[0];
  };
  const prune = (a) => { if (a !== current && a.getEffectiveWeight() <= 0) live.delete(a); };
  const bonesOf = () => { const b = []; root.traverse((o) => { if (o.isBone) b.push(o); }); return b; };
  const api = {
    mixer,
    clips,
    // `startAt` begins the clip partway in (clip seconds), which skips a long wind-up.
    // `maxBlend`: the longest a dead blend may stretch to (src/anim/deadBlend.js adapts its length
    // to how far apart the two poses are; a strike caps it so its contact still reads).
    // `freeLimbs` ('arms' | 'legs'): limbs the maxBlend cap does not hold to (deadBlend.start).
    play(name, { fade = 0.15, once = false, timeScale = 1, startAt = 0, blend: mode = 'fade', maxBlend = undefined, freeLimbs = null } = {}) {
      // anim2: once a character dead-blends (it has an animation graph), every switch does,
      // locomotion and traversal included, with the blend's length adapted to the pose distance;
      // 'crossfade' asks for the mixer's cross-fade explicitly.
      const inertial = mode !== 'crossfade' && !!blend && deadBlendEnabled();
      let next = action(name);
      if (current && current.getClip().name === name) {
        if (!once) { current.timeScale = timeScale; return current; }
        next = inertial ? current : current === next ? action(name, true) : next;
      }
      // Snapshot the pose being shown, then switch outright: one action at full weight.
      if (inertial) blend.start(fade, maxBlend, freeLimbs);
      next.reset();
      next.time = startAt;
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      next.timeScale = timeScale;
      next.enabled = true;
      next.setEffectiveWeight(1);
      if (!inertial && current && current !== next) next.crossFadeFrom(current, fade, false);
      next.play();
      // The old actions stop only once the new one is active: three's mixer restores a binding's
      // original (rest) pose the moment no active action uses it, so stopping them first showed
      // a one-frame T-pose whenever a clip was switched after this frame's update (an attack
      // started by the director, a reaction from the hero's contact) — the 1-3 m "pops" at the
      // first frame of goon strikes and reactions.
      if (inertial) {
        for (const a of live) if (a !== next) { a.stop(); a.setEffectiveWeight(0); }
        live.clear();
      }
      live.add(next);
      current = next;
      return next;
    },
    // Creates the actions up front, so a clip's first play mid-fight doesn't build its bindings.
    prime(names) { for (const n of names) action(n); },
    get currentName() { return current?.getClip().name ?? null; },
    // The playing action itself (a goon's strike speeds up from its held wind-up without a restart).
    get currentAction() { return current; },
    has: (name) => clips.has(name),
    // Turns on dead blending for this character (records its pose every frame from now on).
    inertial() {
      if (!blend) blend = createDeadBlend(bonesOf(), root.getObjectByName('pelvis'));
      return api;
    },
    get blending() { return !!blend?.active; },
    get blendDuration() { return blend?.duration ?? 0; },
    // See deadBlend.rebase: the root moved under a running blend.
    rebaseBlend(m) { if (blend?.active) blend.rebase(m); },
    // Upper-body / additive layers (lazily made: most characters never use them).
    get overlays() { if (!overlays) overlays = createOverlays(root); return overlays; },
    // Plays a clip on the upper-body ('upper') or additive ('add') layer; false when missing.
    overlay(slot, name, opts) {
      const clip = clips.get(name);
      if (!clip) return false;
      api.overlays.play(slot, clip, opts);
      return true;
    },
    after(fn) { hooks.push(fn); },
    update(dt) {
      mixer.update(dt);
      // Drop fully faded actions from the live set (bounded: a handful are ever live).
      if (live.size > 2) live.forEach(prune);
      if (blend) blend.apply(dt);
      if (overlays) { overlays.update(dt); overlays.apply(); }
      for (let i = 0; i < hooks.length; i++) hooks[i](dt);
      if (blend) blend.record(dt);
    },
  };
  return api;
}
