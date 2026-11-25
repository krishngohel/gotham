// Traversal rules per kit style (workstream D1, Long Night 2). Pure: hero.js asks these and
// applies the answer. Profiles are data in src/heroes/roster.js (TRAVERSAL_PROFILES).
//
//   glide    the Bat family: hold jump in the air to glide, grapple, dive-bomb (today's hero).
//   wings    glider wings: the same glide, faster cruise and top speed, a better climb.
//   acrobat  Nightwing and the Robins: higher jumps, one mid-air flip, quicker grapple lines and
//            longer wall runs, and no long glide (holding jump does nothing in the air).
//   grapple  Red Hood: grapple and jumps, no glide.
//   flight   Superman: a second jump press in the air takes off. Hover, fly with the stick, climb
//            with jump held, fast flight with sprint. Flight burns stamina (seconds) and is capped
//            at `ceiling` metres above the ground under him; out of stamina he drops. It is never
//            allowed where it would skip play: inside a predator room or a running fight
//            (canFly(), set by the co-op layer), and story triggers still need him near the
//            ground (flow.js reach steps keep their height check).
//
// With the 'glide' profile every answer is today's behaviour (Batman is unchanged).

// What a jump press in the air does: 'glide' (hold), 'flip' (a second jump), 'fly' (take off) or null.
export function airJumpAction(profile, { airT, flipsUsed, stamina, canFly, heightAboveGround }) {
  if (!profile) return null;
  if (profile.style === 'flight') return canFly && stamina > 1 && airT > 0.12 && heightAboveGround > 0.6 ? 'fly' : null;
  if (profile.airFlips > flipsUsed && airT > 0.12) return 'flip';
  return null;
}

// Whether holding jump in the air starts a glide.
export const canGlide = (profile) => !profile || profile.glide !== false;

// Flight, one step: { vx, vy, vz, stamina, done } from the stick (world-space wish x/z with
// magnitude 0..1), climb (jump held), fast (sprint held), the camera pitch (looking down dives a
// little in fast flight), height above the ground and the profile's numbers. Pure.
export function flightStep(f, { wishX = 0, wishZ = 0, mag = 0, climb = false, fast = false, height = 0, stamina, dt }) {
  const speed = (fast ? f.fast : f.speed) * mag;
  let vy = climb ? f.climb : fast ? 0 : -0.6;
  // The ceiling: no climbing above it, and drift back down if above (a launch from a tower).
  if (height >= f.ceiling && vy > 0) vy = 0;
  if (height > f.ceiling + 2) vy = -4;
  const drain = (fast ? 1.6 : climb ? 1.3 : mag > 0.1 ? 1 : f.hoverDrain) * dt;
  const left = Math.max(0, stamina - drain);
  return { vx: wishX * speed, vy, vz: wishZ * speed, stamina: left, done: left <= 0 };
}

// Stamina back on the ground (or while not flying), capped at the profile's maximum.
// [verify] k: the double life's tiredness factor (hero.staminaRegenK, src/bruce/runtime.js; 1 = rested).
export function regenStamina(f, stamina, dt, grounded, k = 1) {
  if (!f) return 0;
  const kk = Number.isFinite(k) ? Math.min(1, Math.max(0.25, k)) : 1; // [verify]
  return Math.min(f.stamina, stamina + (grounded ? f.regen : f.regen * 0.25) * kk * dt); // [verify] * kk
}
