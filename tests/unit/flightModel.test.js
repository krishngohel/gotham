import { describe, it, expect } from 'vitest';
import { WINGSUIT, wingsuitProfile, createFlightState, enterFlight, stepFlight, dragCoef, terminalDive, landingKind } from '../../src/traversal/flightModel.js';

const P = WINGSUIT[1];
// Fly for `secs` with a fixed input, tracking height from the returned vertical speed.
function fly(s, p, input, secs, dt = 1 / 60) {
  let h = 0;
  for (let t = 0; t < secs; t += dt) { stepFlight(s, { ...input, dt }, p); h += s.vy * dt; }
  return h;
}
const level = (p = P) => { const s = createFlightState(); enterFlight(s, 0, 0, p.cruise, p); return s; };

describe('wingsuit flight model', () => {
  it('holds its cruise speed and a shallow sink with the stick centred', () => {
    const s = level();
    const h = fly(s, P, {}, 10);
    expect(s.speed).toBeGreaterThan(P.cruise - 0.5);
    expect(s.speed).toBeLessThan(P.cruise + 0.5);
    expect(h / 10).toBeGreaterThan(-2.4); // sinks slower than the cape glide's 2.4 m/s
    expect(h / 10).toBeLessThan(-1);
  });

  it('conserves energy (v^2/2 + g h) with drag removed', () => {
    const p = { ...P, glideAngle: 1e-9, vMax: 1e9, vStall: -1 };
    expect(dragCoef(p)).toBeLessThan(1e-9);
    const s = level(p);
    const e0 = s.speed ** 2 / 2;
    let h = 0;
    const seq = [[1, 3], [-1, 2], [0.5, 2], [-0.6, 3], [0, 2]];
    for (const [pitch, secs] of seq) h += fly(s, p, { pitch, turn: 0.4 }, secs, 1 / 120);
    const e1 = s.speed ** 2 / 2 + p.g * h;
    expect(Math.abs(e1 - e0) / e0).toBeLessThan(0.01);
  });

  it('only ever loses energy with drag (no free height)', () => {
    const s = level();
    const e0 = s.speed ** 2 / 2;
    let h = 0;
    for (let i = 0; i < 6; i++) { h += fly(s, P, { pitch: 1 }, 2); h += fly(s, P, { pitch: -1 }, 2); }
    expect(s.speed ** 2 / 2 + P.g * h).toBeLessThan(e0);
  });

  it('a dive builds speed toward the terminal speed, never past vMax', () => {
    const s = level();
    fly(s, P, { pitch: 1 }, 3);
    expect(s.speed).toBeGreaterThan(35);
    fly(s, P, { pitch: 1 }, 30);
    expect(s.speed).toBeLessThanOrEqual(P.vMax);
    expect(s.speed).toBeGreaterThan(terminalDive(P) * 0.95);
  });

  it('pulling up trades speed for height, and gains it from a dive', () => {
    const s = level();
    const lost = fly(s, P, { pitch: 1 }, 4);
    const v = s.speed;
    // Height from the bottom of the swoop to its top.
    let h = 0, lo = 0, hi = -Infinity;
    for (let t = 0; t < 4; t += 1 / 60) { stepFlight(s, { pitch: -1, dt: 1 / 60 }, P); h += s.vy / 60; lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const gained = hi - lo;
    expect(gained).toBeGreaterThan(25);
    expect(gained).toBeLessThan((v * v) / (2 * P.g)); // never more than the speed paid for it
    expect(s.speed).toBeLessThan(v);
    expect(lost).toBeLessThan(0);
  });

  it('stalls when held nose-up too long, and the nose drops whatever the stick says', () => {
    const s = level();
    let stalled = false, noseDown = true;
    for (let t = 0; t < 8; t += 1 / 60) {
      const before = s.gamma;
      stepFlight(s, { pitch: -1, dt: 1 / 60 }, P);
      if (s.stalled) { stalled = true; if (before > -0.6 && s.gamma > before + 1e-9) noseDown = false; }
    }
    expect(stalled).toBe(true);
    expect(noseDown).toBe(true);
    fly(s, P, { pitch: -1 }, 0.5);
    // It recovers by diving.
    fly(s, P, { pitch: 1 }, 3);
    expect(s.stalled).toBe(false);
  });

  it('respects the bank and path limits', () => {
    const s = level();
    for (let i = 0; i < 600; i++) {
      stepFlight(s, { pitch: Math.sin(i * 0.05), turn: Math.cos(i * 0.03) * 2, dt: 1 / 60 }, P);
      expect(Math.abs(s.roll)).toBeLessThanOrEqual(P.maxRoll + 1e-9);
      expect(s.gamma).toBeLessThanOrEqual(P.climbAngle + 1e-9);
      expect(s.gamma).toBeGreaterThanOrEqual(-1.25 - 1e-9);
      expect(s.speed).toBeGreaterThanOrEqual(0);
    }
  });

  it('a banked turn is tighter slow than fast, and tighter on the second tier', () => {
    const slow = level(), fast = level();
    fast.speed = 45;
    fly(slow, P, { turn: 1 }, 1);
    fly(fast, P, { turn: 1, pitch: 1 }, 1);
    expect(Math.abs(slow.turnRate)).toBeGreaterThan(Math.abs(fast.turnRate));
    const t2 = level(WINGSUIT[2]);
    fly(t2, WINGSUIT[2], { turn: 1 }, 1);
    expect(Math.abs(t2.turnRate)).toBeGreaterThan(Math.abs(slow.turnRate));
    expect(slow.turnRate).toBeGreaterThan(0); // turn +1 raises the heading
  });

  it('the air brake slows the suit', () => {
    const a = level(), b = level();
    a.speed = b.speed = 40;
    fly(a, P, {}, 1.5);
    fly(b, P, { brake: true }, 1.5);
    expect(b.speed).toBeLessThan(a.speed - 5);
  });

  it('rising air lifts it without touching the speed', () => {
    const a = level(), b = level();
    const ha = fly(a, P, {}, 2), hb = fly(b, P, { updraft: 6 }, 2);
    expect(hb - ha).toBeCloseTo(12, 0);
    expect(b.speed).toBeCloseTo(a.speed, 5);
  });

  it('the glider wings cruise faster and dive to a higher top speed', () => {
    const w = wingsuitProfile(1, { style: 'wings', glideCruise: 22, glideMax: 60 });
    expect(w.cruise).toBe(22);
    expect(w.vMax).toBe(P.vMax + 12);
    expect(wingsuitProfile(1, { style: 'glide' })).toBe(P);
  });

  it('reads a landing as a roll, a hard landing or a soft one', () => {
    expect(landingKind(25, -4, 0)).toBe('roll');
    expect(landingKind(25, -12, 0)).toBe('hard');
    expect(landingKind(5, -20, 0)).toBe('hard');
    expect(landingKind(5, -3, 0)).toBe('soft');
  });
});
