import { describe, it, expect } from 'vitest';
import { createPursuitTarget, stepPursuitTarget, stepTail, createTail, CHASE_DEFAULTS } from '../../src/vehicles/chaseAI.js';
import { buildStreetGraph } from '../../src/world/regions/streets.js';
import { createRng } from '../../src/core/rng.js';

const G = buildStreetGraph();

function onDrivableEdge(t) {
  const e = G.edges[t.edge];
  return e.lanes > 0 && e.deck !== 'walk';
}

describe('pursuit target on the street graph', () => {
  it('drives along drivable edges only, and runs from the pursuer', () => {
    const rng = createRng(3);
    const t = createPursuitTarget(G, { x: 30, z: 30 }, rng, { awayFrom: { x: 30, z: 60 } });
    const pursuer = { x: 30, y: 0, z: 60 };
    for (let i = 0; i < 60 * 40; i++) {
      stepPursuitTarget(G, t, 1 / 60, pursuer, rng);
      expect(onDrivableEdge(t)).toBe(true);
    }
    expect(Math.hypot(t.x - pursuer.x, t.z - pursuer.z)).toBeGreaterThan(150);
    expect(t.nodesVisited).toBeGreaterThan(3);
  });

  it('rubber-bands: eases off far ahead, pushes when the pursuer is close, inside its limits', () => {
    const rng = createRng(5);
    const far = createPursuitTarget(G, { x: 30, z: 30 }, rng);
    const close = createPursuitTarget(G, { x: 30, z: 30 }, rng);
    for (let i = 0; i < 300; i++) {
      stepPursuitTarget(G, far, 1 / 60, { x: far.x + 200, z: far.z }, rng);
      stepPursuitTarget(G, close, 1 / 60, { x: close.x + 5, z: close.z }, rng);
      expect(far.speed).toBeLessThanOrEqual(CHASE_DEFAULTS.maxSpeed);
      expect(close.speed).toBeLessThanOrEqual(CHASE_DEFAULTS.maxSpeed);
    }
    expect(close.speed).toBeGreaterThan(far.speed + 5);
    expect(far.speed).toBeGreaterThanOrEqual(CHASE_DEFAULTS.minSpeed);
  });

  it('follows the Lower Gotham decks and ramps by graph height, never a raised bridge', () => {
    const rng = createRng(9);
    const t = createPursuitTarget(G, { x: 0, y: -5.5, z: -291 }, rng, { mode: 'tail' });
    const raised = (e) => !!e.bridge;
    const ys = new Set();
    for (let i = 0; i < 60 * 120; i++) {
      stepPursuitTarget(G, t, 1 / 60, null, rng, raised);
      expect(G.edges[t.edge].bridge).toBeFalsy();
      ys.add(Math.round(t.y));
    }
    expect([...ys].some((y) => y <= -5)).toBe(true);
  });
});

describe('tail meter', () => {
  it('too close and seen gets you spotted; hanging back is fine; too far loses it', () => {
    const a = createTail();
    for (let i = 0; i < 60 * 5; i++) stepTail(a, 12, true, 1 / 60);
    expect(a.status).toBe('spotted');
    const b = createTail();
    for (let i = 0; i < 60 * 30; i++) stepTail(b, 60, true, 1 / 60);
    expect(b.status).toBe('tailing');
    const c = createTail();
    for (let i = 0; i < 60 * 10; i++) stepTail(c, 200, false, 1 / 60);
    expect(c.status).toBe('lost');
  });
});
