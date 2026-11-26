import { describe, it, expect } from 'vitest';
import { stepPursuit, stepHeat, stepBattle, battleVelocity, stepMode, followGround, bikeLean, STEP_UP } from '../../src/vehicles/driveModel.js';
import { mergeTuning, stepDrive } from '../../src/vehicles/vehiclePhysics.js';

const T = mergeTuning({});
const GEO = { wheelbase: 3.9, track: 2.84 };
const IN = (o = {}) => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, ...o });

describe('pursuit handling', () => {
  it('a power slide holds with throttle and steer into it, and countersteer recovers fast', () => {
    const slide = () => { const v = { speed: 24, yaw: 0, drift: 0 }; for (let i = 0; i < 40; i++) stepPursuit(v, IN({ throttle: 1, steer: 1, handbrake: true }), 1 / 60, T); return v; };
    const held = slide(), counter = slide(), plain = slide();
    expect(held.drift).toBeGreaterThan(0.4);
    expect(held.sliding).toBe(true);
    for (let i = 0; i < 30; i++) {
      stepPursuit(held, IN({ throttle: 1, steer: 1 }), 1 / 60, T);
      stepPursuit(counter, IN({ throttle: 1, steer: -1 }), 1 / 60, T);
      stepPursuit(plain, IN({ throttle: 1 }), 1 / 60, T);
    }
    expect(held.drift).toBeGreaterThan(plain.drift);
    expect(Math.abs(counter.drift)).toBeLessThan(plain.drift);
  });
  it('without a slide it is exactly the old arcade drive', () => {
    const a = { speed: 10, yaw: 0, drift: 0 }, b = { speed: 10, yaw: 0, drift: 0 };
    for (let i = 0; i < 30; i++) { stepPursuit(a, IN({ throttle: 1, steer: 0.5 }), 1 / 60, T); stepDrive(b, IN({ throttle: 1, steer: 0.5 }), 1 / 60, T); }
    expect(b.yaw).toBeCloseTo(a.yaw, 9);
    expect(b.speed).toBeCloseTo(a.speed, 9);
  });
});

describe('afterburner heat', () => {
  it('boosting heats, locks at full, and only unlocks once cooled', () => {
    const h = { heat: 0, locked: false };
    let t = 0;
    while (!h.locked && t < 20) { stepHeat(h, true, 0.1); t += 0.1; }
    expect(t).toBeGreaterThan(4);
    expect(t).toBeLessThan(5);
    expect(stepHeat(h, true, 0.1)).toBe(false); // locked: no boost
    while (h.locked) stepHeat(h, true, 0.1);
    expect(h.heat).toBeLessThanOrEqual(0.36);
  });
  it('the heat upgrade lasts longer', () => {
    const a = { heat: 0, locked: false }, b = { heat: 0, locked: false };
    for (let i = 0; i < 30; i++) { stepHeat(a, true, 0.1); stepHeat(b, true, 0.1, 1.6); }
    expect(b.heat).toBeLessThan(a.heat);
  });
});

describe('battle mode', () => {
  it('strafes sideways with the stick, the body turning to the aim', () => {
    const v = { speed: 0, yaw: 0, drift: 0 };
    for (let i = 0; i < 90; i++) stepBattle(v, { moveX: 1, moveY: 0, aimYaw: 0.5, dodge: false }, 1 / 60);
    const out = { x: 0, z: 0 };
    battleVelocity(v, out);
    expect(v.yaw).toBeCloseTo(0.5, 2);
    expect(Math.abs(v.lat)).toBeGreaterThan(9);
    expect(Math.abs(v.speed)).toBeLessThan(0.5);
    // moving to the right of its own facing: (-cos, sin)
    expect(out.x * -Math.cos(v.yaw) + out.z * Math.sin(v.yaw)).toBeGreaterThan(9);
  });
  it('a dodge kicks it sideways once per cooldown', () => {
    const v = { speed: 0, yaw: 0, drift: 0 };
    stepBattle(v, { moveX: -1, moveY: 0, aimYaw: 0, dodge: true }, 1 / 60);
    expect(v.lat).toBeLessThan(-15);
    const cd = v.dodgeCd;
    stepBattle(v, { moveX: 1, moveY: 0, aimYaw: 0, dodge: true }, 1 / 60);
    expect(v.dodged).toBe(false);
    expect(cd).toBeGreaterThan(1);
  });
  it('the transform takes its time both ways', () => {
    let m = 0;
    m = stepMode(m, true, 0.35); expect(m).toBeCloseTo(0.5);
    m = stepMode(m, true, 1); expect(m).toBe(1);
    m = stepMode(m, false, 0.35); expect(m).toBeCloseTo(0.5);
  });
});

describe('ground following', () => {
  const gs = (y = 0) => ({ y, vy: 0, air: false, airT: 0, pitch: 0, roll: 0 });
  // Probes the way vehicles.js does: the highest surface at or below y + STEP_UP.
  const probe = (surfaces, y) => { let best = -Infinity; for (const s of surfaces) if (s <= y + STEP_UP && s > best) best = s; return best; };

  it('follows a slope up and down', () => {
    const g = gs(0);
    const grade = 0.12, dt = 1 / 60, speed = 25;
    for (let i = 1; i <= 120; i++) {
      const x = i * speed * dt;
      const y = x * grade;
      followGround(g, [y + 0.23, y + 0.23, y - 0.23, y - 0.23], dt, GEO);
      expect(g.air).toBe(false);
      expect(Math.abs(g.y - y)).toBeLessThan(0.01);
    }
    expect(g.pitch).toBeGreaterThan(0.1);
  });

  it('a fast car never tunnels through a deck floor, and a deck overhead is not the ground', () => {
    // Upper deck at 0, lower deck at -5.5. Dropping off the upper deck's edge at speed lands on the
    // lower one; driving on the lower deck under the upper one stays there.
    const decks = [0, -5.5];
    const g = gs(4); g.air = true; g.vy = -40; // falling fast from above the upper deck
    for (let i = 0; i < 60; i++) {
      const h = probe(decks, g.y);
      followGround(g, [h, h, h, h], 1 / 30, GEO);
      expect(g.y).toBeGreaterThanOrEqual(-1e-9); // never below the upper deck it is over
    }
    expect(g.air).toBe(false);
    const low = gs(-5.5);
    for (let i = 0; i < 60; i++) { const h = probe(decks, low.y); followGround(low, [h, h, h, h], 1 / 60, GEO); }
    expect(low.y).toBeCloseTo(-5.5);
    expect(low.air).toBe(false);
  });

  it('jumps off a ramp lip and lands', () => {
    const g = gs(0), dt = 1 / 60;
    let landed = 0, maxY = 0, x = 0;
    for (let i = 0; i < 240 && !landed; i++) {
      x += 30 * dt;
      const ramp = x < 20 ? x * 0.2 : 0; // a 4 m ramp, then flat street
      const h = probe([ramp], g.y);
      landed = followGround(g, [h, h, h, h], dt, GEO);
      maxY = Math.max(maxY, g.y);
    }
    expect(maxY).toBeGreaterThan(4.5);
    expect(landed).toBeLessThan(-5);
    expect(g.y).toBeCloseTo(0);
  });

  it('a bike leans into the turn, more with speed', () => {
    expect(bikeLean(20, 1)).toBeLessThan(bikeLean(5, 1));
    expect(Math.abs(bikeLean(40, -1))).toBeLessThanOrEqual(0.62);
  });
});
