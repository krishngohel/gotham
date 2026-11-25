// [verify] Weather reaches the driving and the wingsuit: world.weather.traction and the gusts in
// world.windVec were exposed but nothing read them.
import { describe, it, expect } from 'vitest';
import { DEFAULT_TUNING, wetTuning, stepDrive } from '../../src/vehicles/vehiclePhysics.js';
import { createWingsuit } from '../../src/actors/traverse/wingsuit.js';

describe('traction', () => {
  it('a dry street changes nothing', () => {
    expect(wetTuning(DEFAULT_TUNING, 1)).toEqual({ ...DEFAULT_TUNING });
  });
  it('wet and snowy streets brake shorter of bite and slide longer; junk reads as dry', () => {
    const snow = wetTuning(DEFAULT_TUNING, 0.4);
    expect(snow.brakeDecel).toBeLessThan(DEFAULT_TUNING.brakeDecel);
    expect(snow.driftDecayRate).toBeLessThan(DEFAULT_TUNING.driftDecayRate);
    expect(wetTuning(DEFAULT_TUNING, NaN)).toEqual({ ...DEFAULT_TUNING });
    const stop = (t) => { const v = { speed: 20, yaw: 0, drift: 0 }; let s = 0; while (v.speed > 0.5 && s < 600) { stepDrive(v, { throttle: 0, brake: 1, steer: 0 }, 1 / 60, t); s++; } return s; };
    expect(stop(snow)).toBeGreaterThan(stop(DEFAULT_TUNING));
  });
});

describe('wingsuit and the wind', () => {
  it("drifts with the hero's envWind (the weather's wind and gusts) when no h.wind is set", () => {
    const mk = (envWind) => {
      const h = { moves: { wingsuit: 1 }, pos: { x: 0, y: 100, z: 0 }, vel: { x: 0, y: 0, z: 20, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, glide: {}, envWind,
        bat: { face() {}, yaw: 0, lm: { fwd: 1 }, tilt: { rotation: { x: 0, z: 0 } } } };
      const w = createWingsuit(h);
      w.enter(0);
      w.step(1 / 60, 0, 0, false);
      return h.vel.x;
    };
    expect(mk(null)).toBeCloseTo(0, 5);
    expect(mk([4, 0])).toBeGreaterThan(1);
  });
});
