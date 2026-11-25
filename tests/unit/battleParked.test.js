// [fix1] A Batmobile left parked in battle mode is stepped with the plain neutral input (no aimYaw,
// moveX, moveY). It used to turn its yaw and position into NaN, and the hero who got back in was
// put at NaN (the story walk froze at toHarleyDoor after driving in the Ace battle).
import { describe, it, expect } from 'vitest';
import { stepBattle, battleVelocity } from '../../src/vehicles/driveModel.js';

describe('[fix1] battle mode with the neutral input', () => {
  it('holds its heading and coasts to a stop, all finite', () => {
    const v = { yaw: 1.2, speed: 9, lat: 4 };
    for (let i = 0; i < 240; i++) stepBattle(v, { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false }, 1 / 60);
    expect(Number.isFinite(v.yaw)).toBe(true);
    expect(v.yaw).toBeCloseTo(1.2, 5);
    expect(Math.abs(v.speed)).toBeLessThan(0.01);
    const out = battleVelocity(v, { x: 0, y: 0, z: 0 });
    expect(Number.isFinite(out.x) && Number.isFinite(out.z)).toBe(true);
  });
});
