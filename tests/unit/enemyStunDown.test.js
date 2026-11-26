// [fix1] A stun on a goon on the floor never stands his state up with `down` still set. The cape
// stun over a knocked-down goon used to put him in 'stunned' (then 'engage') flagged down: the
// director never gave him an attack token again, the cape never stunned him again and any punch
// was a free ground KO (tests/e2e/combatRoles.spec.js ended with him standing there).
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createRng } from '../../src/core/rng.js';

vi.mock('../../src/actors/characters.js', () => ({
  createGoon: () => ({
    root: new THREE.Group(),
    yaw: 0,
    face: () => {},
    headWorld: () => {},
    animator: {
      prime: () => {},
      play: () => ({ time: 0, getClip: () => ({ duration: 1 }) }),
      update: () => {},
      overlay: () => true,
      has: () => true,
      mixer: { timeScale: 1 },
    },
    groundAt: null,
  }),
  footGround: () => () => 0,
  enemyPlantsFeet: () => false,
}));

const { createEnemy } = await import('../../src/actors/enemy.js');
const from = new THREE.Vector3(0, 0, -2);
const make = (type = 'grunt') => createEnemy({ id: 'x', type, assets: {}, scene: { add: () => {} }, collision: {}, rng: createRng(3) });
const floored = (type) => {
  const e = make(type);
  e.applyHit({ outcome: 'knockdown', damage: 1, stun: 0 }, from);
  expect(e.state).toBe('down');
  expect(e.down).toBe(true);
  return e;
};

describe('[fix1] stuns and the down flag', () => {
  for (const type of ['grunt', 'medic', 'shield']) {
    it(`a cape stun over a ${type} lying down leaves him lying down`, () => {
      const e = floored(type);
      e.applyHit({ outcome: 'stun', damage: 0, stun: 1.5 }, from, { move: 'cape' });
      expect(e.state).toBe('down');
      expect(e.down).toBe(true);
    });
  }
  it('a goon caught getting up by a stun or a blow is on his feet', () => {
    for (const outcome of ['stun', 'hit', 'blocked', 'parried']) {
      const e = floored(outcome === 'blocked' ? 'shield' : outcome === 'parried' ? 'knife' : 'grunt');
      e.state = 'getup';
      e.applyHit({ outcome, damage: outcome === 'hit' ? 1 : 0, stun: outcome === 'stun' ? 1.5 : 0 }, from);
      expect(e.state, outcome).not.toBe('down');
      expect(e.down, outcome).toBe(false);
    }
  });
  it('whatever lands, a goon standing in a fighting state is never flagged down', () => {
    const STANDING = new Set(['engage', 'stunned', 'hit', 'windup', 'attack', 'recover', 'approach', 'riposte']);
    for (const seq of [['knockdown', 'stun'], ['knockdown', 'stun', 'stun'], ['knockdown', 'hit', 'stun']]) {
      const e = make();
      for (const outcome of seq) e.applyHit({ outcome, damage: 0, stun: outcome === 'stun' ? 1.5 : 0 }, from);
      if (STANDING.has(e.state)) expect(e.down, seq.join('>')).toBe(false);
    }
  });
});

describe('[fix1] a parried punch does not stun-lock a knife goon', () => {
  it('the parry is layered on: he keeps his state, however many punches come', () => {
    const e = make('knife');
    e.state = 'engage';
    for (let i = 0; i < 5; i++) e.applyHit({ outcome: 'parried', damage: 0, stun: 0 }, from);
    expect(e.state).toBe('engage');
  });
});
