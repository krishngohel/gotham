// [polish] Hold poses for carried props, authored with poseAuthor on the shared skeleton and played
// as a looping upper-body overlay (src/anim/overlay.js), so the legs keep whatever the base clip
// does (idle, walk) while the arm holds the prop:
//   Carry_Tray      right forearm level in front of the waist, palm up, the tray flat on it;
//   Carry_Umbrella  right fist at the chest, the shaft upright, the open canopy over the head.
// Each is a one-second loop with a small breath so the hold does not look frozen.
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { sampleRest, discoverFrames, compileClip } from './poseAuthor.js';

export const CARRY_CLIPS = { tray: 'Carry_Tray', umbrella: 'Carry_Umbrella' };

const POSES = {
  Carry_Tray: {
    spine_02: { f: -0.04 }, neck_01: { f: 0.04 },
    upperarm_r: { f: 0.25, s: -0.05 }, lowerarm_r: { f: 0.85 },
    // The other hand tucked in at the waist, a butler's composure.
    upperarm_l: { f: -0.45, s: 0.05 }, lowerarm_l: { f: 1.6 },
  },
  Carry_Umbrella: {
    spine_02: { f: -0.02 },
    upperarm_r: { f: 0.6, s: -0.15 }, lowerarm_r: { f: 1.0 }, 
    upperarm_l: { f: 0.05, s: -0.05 }, lowerarm_l: { f: 0.25 },
  },
};

// Adds the carry clips to `clips` (the shared clip map) once; returns the names.
export function ensureCarryClips(assets) {
  const clips = assets.clips;
  if (clips.has('Carry_Tray')) return CARRY_CLIPS;
  const model = SkeletonUtils.clone(assets.bodies.m);
  const rest = sampleRest(model, clips.get('Idle_Loop'), 0);
  const frames = discoverFrames(model, 1);
  for (const [name, pose] of Object.entries(POSES)) {
    // A breath: the shoulders rise a hair at mid-loop.
    const breath = { ...pose, spine_02: { ...(pose.spine_02 ?? {}), f: (pose.spine_02?.f ?? 0) - 0.02 } };
    clips.set(name, compileClip(name, 1.6, [
      { t: 0, ...pose },
      { t: 0.8, ease: 'io', ...breath },
      { t: 1.6, ease: 'io', ...pose },
    ], { model, frames, rest }));
  }
  return CARRY_CLIPS;
}

// Starts the hold on a character carrying `prop` (no-op for other props).
export function holdProp(ch, assets, prop) {
  const name = ensureCarryClips(assets)[prop];
  if (!name) return false;
  return ch.animator.overlay('upper', name, { loop: true, fadeIn: 0, fadeOut: 0.2 });
}
