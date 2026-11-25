// [perf3] The adaptive detail governor: steps down only with dynamic resolution at its floor and
// frames still late two windows running, steps back up after a long calm spell, clamps.
import { describe, it, expect } from 'vitest';
import { createDetailGovernor, LEVELS } from '../../src/render/detailGovernor.js';

const P = 1000 / 60;
function run(g, ms, dt, atFloor) { for (let t = 0; t < ms; t += dt) g.update(dt, P, atFloor); }

describe('detail governor', () => {
  it('waits for the resolution floor and two bad windows before stepping down', () => {
    const seen = [];
    const g = createDetailGovernor({ apply: (L, lvl) => seen.push(lvl) });
    run(g, 6000, 40, false); // late frames, but dynamic resolution still has room
    expect(g.level).toBe(0);
    run(g, 2000, 40, true); // one bad window at the floor
    expect(g.level).toBe(0);
    run(g, 2000, 40, true); // second
    expect(g.level).toBe(1);
    run(g, 20000, 40, true);
    expect(g.level).toBe(LEVELS.length - 1); // clamps at the last level
    expect(seen).toEqual([1, 2, 3]);
  });
  it('climbs back one level after 20 s of on-time frames, and ignores stalls', () => {
    const g = createDetailGovernor();
    run(g, 8000, 40, true);
    const top = g.level;
    expect(top).toBeGreaterThan(0);
    g.update(5000, P, true); // a tab switch / loading stall is ignored
    run(g, 19000, P, true);
    expect(g.level).toBe(top);
    run(g, 2500, P, true);
    expect(g.level).toBe(top - 1);
  });
  it('turning it off restores level 0', () => {
    const levels = [];
    const g = createDetailGovernor({ apply: (L, lvl) => levels.push([lvl, L.crowd]) });
    run(g, 4100, 40, true);
    g.setEnabled(false);
    expect(g.level).toBe(0);
    expect(levels.at(-1)).toEqual([0, 1]);
  });
});
