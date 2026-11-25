// [polish] A bascule's deck is solid whenever its leaves are actually down, including the
// `closing` phase (gates coming down, leaves not yet moving) and the `opening` phase (leaves
// down again, gates still up). Polish list: walkers and traffic fell through during `closing`.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCollision } from '../../src/world/collision.js';
import { createBascules, basculeState, BASCULE } from '../../src/world/regions/bascules.js';
import { createWestBascules } from '../../src/world/regions/westBascules.js';

function ctx() {
  const m = () => new THREE.MeshBasicMaterial({ vertexColors: true });
  return {
    scene: new THREE.Scene(), collision: createCollision({ cell: 8, floor: () => -50 }),
    materials: { painted: m(), asphalt: m(), sidewalk: m(), lane: m() },
    halos: { add: () => 0, set: () => {} }, region: 'test',
  };
}
// The middle of the first stretch of time a bridge with this offset spends in `phase`.
function timeIn(phase, offset) {
  let a = -1, b = -1;
  for (let t = 0; t < BASCULE.cycle; t += 0.05) {
    const on = basculeState(t, offset).phase === phase;
    if (on && a < 0) a = t;
    if (!on && a >= 0) { b = t; break; }
  }
  if (a < 0) throw new Error(phase);
  return (a + (b < 0 ? BASCULE.cycle : b)) / 2;
}

describe('bascule decks follow the leaves', () => {
  it('river bascules: solid in down, closing and opening; gone while up', () => {
    const c = ctx();
    const br = createBascules(c, [{ id: 'b', x: 0, z0: 20, z1: -20 }], { offsets: [0] });
    for (const [phase, solid] of [['down', true], ['closing', true], ['raising', false], ['up', false], ['opening', true]]) {
      br.update(timeIn(phase, 0));
      const y = c.collision.groundBelow(0, 1, 5, 0.2);
      expect([phase, y >= -0.01 && y <= 0.2]).toEqual([phase, solid]);
    }
  });
  it('west bascules (along x): solid in down, closing and opening', () => {
    const c = ctx();
    const br = createWestBascules(c, [{ id: 'w', axis: 'x', z: 0, x0: -266, x1: -300 }], { offsets: [0] });
    for (const [phase, solid] of [['down', true], ['closing', true], ['raising', false], ['opening', true]]) {
      br.update(timeIn(phase, 0));
      const y = c.collision.groundBelow(-280, 1, 2, 0.2);
      expect([phase, y >= -0.01 && y <= 0.2]).toEqual([phase, solid]);
    }
  });
});
