// [verify] A co-op partner cannot call a vehicle the story has not given yet: the seat layer
// (src/coop/passenger.js) called the Batwing and a bike for partner 2 without asking the
// abilities layer, while player 0's keys were gated (game.js, vehicles.js).
import { describe, it, expect, vi } from 'vitest';
import { createSeats } from '../../src/coop/passenger.js';
import { createAbilityState } from '../../src/abilities/abilities.js';

function setup(unlocked) {
  const abilities = createAbilityState({ mode: 'story', unlocked });
  const hero = (x) => ({ abilities, pos: { x, y: 0, z: 0 }, bat: { yaw: 0, root: {} }, cape: { mesh: {} }, vel: { set() {} } });
  const p0 = { slot: 0, hero: hero(0) }, p1 = { slot: 1, hero: hero(100), rig: { follow: {} } };
  const vehicles = { active: { group: { position: { x: 0, y: 0, z: 0 } } }, driver: p0.hero, summonBikeFor: vi.fn(), setDriver: vi.fn(), useKey: vi.fn() };
  const batwing = { active: false, pilot: null, call: vi.fn(), setPilot: vi.fn(), exit: vi.fn() };
  const players = { count: 2, list: [p0, p1] };
  const seats = createSeats({ vehicles, batwing, players, events: { emit() {} }, getFlow: () => null, follow0: {} });
  return { seats, vehicles, batwing, p1 };
}

describe('co-op seats ask the abilities layer', () => {
  it('before the story gives them, a partner neither calls the Batwing nor a bike', () => {
    const t = setup(['move']);
    expect(t.seats.batwingKey(t.p1)).toBe(true); // handled: nothing happens
    expect(t.batwing.call).not.toHaveBeenCalled();
    t.seats.vehicleKey(t.p1); // the Batmobile is out but 100 m away: too far to board
    expect(t.vehicles.summonBikeFor).not.toHaveBeenCalled();
  });
  it('once given, both work as before', () => {
    const t = setup(['batwing', 'batmobileCall']);
    t.seats.batwingKey(t.p1);
    expect(t.batwing.call).toHaveBeenCalledTimes(1);
    t.seats.vehicleKey(t.p1);
    expect(t.vehicles.summonBikeFor).toHaveBeenCalledTimes(1);
  });
});
