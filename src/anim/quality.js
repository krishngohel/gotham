// The animation features a render tier can afford (design doc 4.3: read flags, never the tier
// name). Dead blending is a few dozen slerps per blending character: on from `medium` up (the
// tiers that animate characters at full rate out to 25 m or more).
// Foot locking (src/anim/footLock.js, the hero's planted feet during strikes and reactions):
// with dead blending, from `medium` up (anim2: rewritten after the IK weight bug that made the
// first version worse; it takes about 30% off the hero's foot slide in the scripted moves of
// scripts/anim-audit.mjs). quality.anim.footLock overrides.
import { setDeadBlendEnabled, deadBlendEnabled } from './deadBlend.js';
import { setFootLockEnabled, footLockEnabled } from './footLock.js';

export function animFlags(quality) {
  const rate = quality?.animFullRate ?? 35;
  return { inertial: quality?.anim?.inertial ?? rate >= 25, footLock: quality?.anim?.footLock ?? rate >= 25 };
}

export function setAnimQuality(quality) {
  const f = animFlags(quality);
  setDeadBlendEnabled(f.inertial);
  setFootLockEnabled(f.footLock);
  return f;
}

// The live switches, for the animation scripts' A/B runs (scripts/anim-audit.mjs FOOTLOCK=0/1):
// a module imported by URL from the page can be a second copy after a dev-server reload.
if (typeof window !== 'undefined') window.__animFlags = { setDeadBlendEnabled, deadBlendEnabled, setFootLockEnabled, footLockEnabled };
