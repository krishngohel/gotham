// [m45] Companion to the flow's own `armada` step (Night Four, "Second Delivery"). The flow calls
// the Batwing once as the step begins, and the plane only comes for a hero standing on a roof or
// gliding (src/vehicles/batwing.js canCall): a hero who is mid-landing at that instant is left on
// the roof with balloons overhead. This keeps asking, a few times a second, until she is aboard
// (the same call the player's own key makes; it refuses by itself anywhere it should). The flow
// still owns the mission: starting it, the balloons, finishing the step.
import { isReplica } from '../../../net/mode.js';

export const PICKUP_EVERY = 0.4; // seconds between calls
export const PICKUP_FOR = 45;    // seconds it keeps trying (after that the player calls it herself)

// Pure: should the plane be called now?
export function pickupDue(state, { aboard = false, replica = false } = {}, dt = 0) {
  if (replica || aboard || state.age >= PICKUP_FOR) return false;
  state.age += dt;
  state.wait -= dt;
  if (state.wait > 0) return false;
  state.wait = PICKUP_EVERY;
  return true;
}

export function createWingPickup(ctx) {
  const state = { age: 0, wait: 0 };
  return {
    enter() { state.age = 0; state.wait = PICKUP_EVERY; },
    update(dt) {
      const wing = ctx.theGame()?.batwing;
      if (!wing?.call) return;
      if (pickupDue(state, { aboard: !!wing.active, replica: isReplica() }, dt)) wing.call();
    },
    marker() { return null; },
    exit() {},
    onRespawn() { state.age = 0; state.wait = PICKUP_EVERY; },
  };
}
