// Grapple gun rules with the upgrades (workstream L3, `[move]`). Pure: src/actors/hero.js asks and
// applies the answers. `moves` is the object from src/traversal/moves.js (BASE_MOVES with nothing
// owned, which reproduces today's grapple number for number).
//
// The loop these rules make: grapple a ledge, press jump in the last part of the reel (the timing
// window) for a PERFECT boost that throws the hero up past the ledge with the reel's speed carried
// forward, open the glide or wingsuit, grapple the next ledge from the air. A re-grapple from the
// air keeps the flight's speed into the reel (a faster line), and that is the part that costs: one
// chain charge per re-grapple, refilled on landing, a short cooldown between them, and each link
// of a chain adds a little less than the one before. A skilled player strings a whole district
// together; mashing does not (an early press is the plain boost, no carry).

export const ZIP_BASE = 30;            // m/s: today's reel speed (times the kit's grappleSpeed)
export const PERFECT_WINDOW = 0.7;     // fraction of the reel after which a jump press is "perfect"
export const CHAIN_COOLDOWN = 0.6;     // s between re-grapples
export const CHAIN_DECAY = 0.85;       // each chained link carries this much of the last one's gain
export const ZIP_MAX = 58;             // m/s: the fastest a chained reel can run

// Reel speed for a grapple: the kit's line speed and the reel upgrade; a chained re-grapple from
// the air keeps most of the flight speed it was fired at (never slower than a standing reel).
export function zipSpeed(trav, moves, { entrySpeed = 0, chained = false } = {}) {
  const base = ZIP_BASE * (trav?.grappleSpeed ?? 1) * (moves?.reel ?? 1);
  if (!chained) return base;
  return Math.min(ZIP_MAX, Math.max(base, entrySpeed * 0.92));
}

export function zipDuration(dist, speed) { return Math.max(0.35, dist / Math.max(1, speed)); }

// What a jump press during the reel earns: null (no press), 'boost' (today's boost: a fixed fling
// up and over), or 'perfect' (owned grappleBoost and pressed in the window: the reel's momentum
// carries into a launch). `pressK` is how far through the reel (0..1) the first press came.
export function boostKind(pressK, moves) {
  if (pressK === null || pressK === undefined) return null;
  if (moves?.perfectBoost && pressK >= PERFECT_WINDOW) return 'perfect';
  return 'boost';
}

// The launch velocity of a boost, as { up, out } (m/s; out is along the wall's inward direction).
// tuning: hero.tuning (boostUp, boostOut: the Grapple Accelerator upgrade raises those). link: how
// many chained links came before this one (0 for the first grapple off the ground).
export function boostLaunch(kind, tuning, { reel = ZIP_BASE, link = 0 } = {}) {
  const up = tuning?.boostUp ?? 15, out = tuning?.boostOut ?? 9;
  if (kind !== 'perfect') return { up, out };
  const k = Math.pow(CHAIN_DECAY, Math.max(0, link));
  return { up: up * 1.1 + Math.min(7, reel * 0.16) * k, out: out + Math.max(0, reel - ZIP_BASE * 0.6) * 0.5 * k + 4 };
}

// Re-grapple charges: per hero, refilled on the ground.
export function createChain() { return { used: 0, cd: 0, link: 0 }; }
export function tickChain(c, dt) { c.cd = Math.max(0, c.cd - dt); return c; }
export function landChain(c) { c.used = 0; c.link = 0; return c; }
// Whether a grapple fired now is a chained (momentum-keeping) one: airborne (gliding or falling),
// the upgrade owned, a charge left and the cooldown run out.
export function canChain(c, moves, airborne) {
  return !!(airborne && moves?.reGrapple && c.used < (moves.chainCharges ?? 0) && c.cd <= 0);
}
export function spendChain(c) { c.used += 1; c.link += 1; c.cd = CHAIN_COOLDOWN; return c; }

// Grapple pull on a goon: what happens, by role. enemy: { type, def: { boss, armored }, alive, down }.
//   'yank'         pulled off his feet to the hero (the batclaw's yank)
//   'disarm'       his weapon is torn away, and he is yanked
//   'stripShield'  a shield bearer loses the shield (stunned, not pulled)
//   'resist'       a heavy or a brute plants his feet: a short stagger only
//   null           nothing to pull (a boss, someone already down)
const ARMED = new Set(['knife', 'baton', 'pistol', 'rifle', 'sniper']);
export function pullOutcome(e) {
  if (!e || !e.alive || e.down || e.def?.boss) return null;
  if (e.type === 'shield') return e.shieldLost ? 'yank' : 'stripShield';
  if (e.type === 'heavy' || e.type === 'brute' || e.def?.armored) return 'resist';
  if (ARMED.has(e.type) && !e.disarmed) return 'disarm';
  return 'yank';
}
export const PULL_RANGE = 26;
