import { describe, it, expect } from 'vitest';
import { roundFor, pickLock, fillMeter, canBarrage, salvoTargets } from '../../src/vehicles/battleMode.js';
import { createAutopilot, stepAutopilot } from '../../src/vehicles/autopilot.js';
import { buildStreetGraph } from '../../src/world/regions/streets.js';

describe('battle mode weapons', () => {
  it('the heavy cannon only ever fires at machines', () => {
    expect(roundFor({ unmanned: true })).toBe('cannon');
    expect(roundFor({ vehicle: true })).toBe('immobiliser');
    expect(roundFor({ person: true })).toBe('riot');
    expect(roundFor({ vehicle: true, unmanned: false })).toBe('immobiliser');
  });
  it('locks the target nearest the aim line, within range', () => {
    const t = [{ id: 1, x: 0, y: 0, z: 30 }, { id: 2, x: 8, y: 0, z: 30 }, { id: 3, x: 0, y: 0, z: 90 }, { id: 4, x: 0, y: 0, z: 20, dead: true }];
    expect(pickLock(t, { x: 0, y: 0, z: 0 }, 0)?.id).toBe(1);
    expect(pickLock(t, { x: 0, y: 0, z: 0 }, Math.atan2(8, 30))?.id).toBe(2);
    expect(pickLock(t, { x: 0, y: 0, z: 0 }, Math.PI)).toBe(null);
  });
  it('the barrage meter fills and only an owner can fire it, at machines only', () => {
    const m = { value: 0 };
    fillMeter(m, { hits: 3 });
    expect(canBarrage(m, true)).toBe(false);
    fillMeter(m, { dt: 30 });
    expect(canBarrage(m, false)).toBe(false);
    expect(canBarrage(m, true)).toBe(true);
    const targets = Array.from({ length: 9 }, (_, i) => ({ x: i * 5, z: 0, unmanned: i !== 2 }));
    const s = salvoTargets(targets, { x: 0, z: 0 });
    expect(s.length).toBe(6);
    expect(s.every((x) => x.unmanned)).toBe(true);
  });
});

describe('remote call autopilot', () => {
  it('drives the whole route and stops at its end, slowing for corners', () => {
    const G = buildStreetGraph();
    const r = G.routeBetween({ x: -90, z: -150 }, { x: 90, z: 90 });
    expect(r).not.toBe(null);
    const ap = createAutopilot(r.points);
    let t = 0, top = 0;
    while (!ap.done && t < 120) { stepAutopilot(ap, 1 / 30); t += 1 / 30; top = Math.max(top, ap.speed); }
    expect(ap.done).toBe(true);
    const end = r.points[r.points.length - 1];
    expect(Math.hypot(ap.at.x - end.x, ap.at.z - end.z)).toBeLessThan(0.2);
    expect(top).toBeLessThanOrEqual(26.01);
    expect(t).toBeLessThan(r.length / 26 * 2.5 + 3);
  });
});
