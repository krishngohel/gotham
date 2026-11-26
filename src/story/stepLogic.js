// Pure rules behind the campaign's step types (unit-tested; src/story/stepTypes.js draws and
// drives them). No DOM, no three.js.

// A puzzle's plate sequence: press(id) -> 'ok' (right plate, more to go), 'done' (the last right
// plate), 'wrong' (resets the sequence), 'same' (the plate already lit, ignored).
export function createSequence(order) {
  let k = 0;
  const lit = new Set();
  return {
    press(id) {
      if (lit.has(id)) return 'same';
      if (order[k] !== id) { k = 0; lit.clear(); return 'wrong'; }
      lit.add(id);
      k += 1;
      return k >= order.length ? 'done' : 'ok';
    },
    reset() { k = 0; lit.clear(); },
    get progress() { return k / order.length; },
    get next() { return order[k] ?? null; },
    isLit: (id) => lit.has(id),
  };
}

// Ordered gates: pass(i) only counts the current gate. Returns 'next', 'done' or null.
export function createGates(count) {
  let k = 0;
  return {
    pass(i) { if (i !== k) return null; k += 1; return k >= count ? 'done' : 'next'; },
    reset() { k = 0; },
    get current() { return k; },
  };
}

// The fear meter (Scarecrow's toxin): rises inside the gas, faster while a watcher sees her, jumps
// when she strikes a hallucination; drains outside the gas. 0..100; full means the step fails.
export const FEAR = { gas: 4, seen: 26, hitPhantom: 30, drain: 12, max: 100 };
export function fearStep(value, { inGas = false, seen = false, hits = 0 } = {}, dt = 0, rules = FEAR) {
  let v = value;
  if (inGas) v += rules.gas * dt;
  else v -= rules.drain * dt;
  if (seen) v += rules.seen * dt;
  v += hits * rules.hitPhantom;
  return Math.max(0, Math.min(rules.max, v));
}

// A watcher's cone: within range metres and within half-angle of its facing (yaw 0 faces +z).
export function inCone(watcher, p, { range = 9, half = 0.9 } = {}) {
  const dx = p.x - watcher.x, dz = p.z - watcher.z;
  const d = Math.hypot(dx, dz);
  if (d > range || d < 0.01) return d <= 0.01;
  const a = Math.atan2(dx, dz);
  const diff = Math.atan2(Math.sin(a - watcher.yaw), Math.cos(a - watcher.yaw));
  return Math.abs(diff) <= half;
}

// The nearest point of a list to p (x, z), or null.
export function nearest(points, p) {
  let best = null, bd = Infinity;
  for (const q of points) { if (!q) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
  return best;
}
