// [polish] Riding the El through its curves: a body standing anywhere on a car's floor or roof
// stays on it (polish list: "riders can drop through the train floor on curves").
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { installCanvasStub } from './helpers/headlessCity.js';
import { createCollision } from '../../src/world/collision.js';
import { createElTrains } from '../../src/world/regions/el.js';
import { EL_CAR } from '../../src/vehicles/models/elTrain.js';

installCanvasStub();

function trainsCtx() {
  const collision = createCollision({ cell: 8, floor: () => 0 });
  const halos = { add: () => 0, set: () => {} };
  const ctx = { collision, scene: new THREE.Scene(), halos, quality: { crowdDensity: 1 } };
  return { ctx, el: createElTrains(ctx, { perTrack: 1 }) };
}

// One hero-like body: gravity, then resolveCylinder (hero.js integrate), at 60 Hz.
function stepBody(collision, p, dt) {
  const prevY = p.y;
  p.vy -= 25 * dt;
  p.y += p.vy * dt;
  const r = collision.resolveCylinder(p, 0.35, 1.8, { prevY });
  if (r.grounded) p.vy = 0;
}

describe('El riders through the curves', () => {
  for (const id of ['loopOuter0', 'loopInner0']) {
    it(`${id}: bodies on the floor and the roof ride a full lap without dropping`, () => {
      const { ctx, el } = trainsCtx();
      const T = el.trains.find((t) => t.def.id === id);
      const dt = 1 / 60;
      // Start just after the train leaves a station, so it runs straights and corners at speed.
      const S = T.schedule, o = {};
      let t = 0;
      for (; t < S.cycle; t += 0.25) { S.at(t + T.def.phase * S.cycle, o); if (o.v > 6) break; }
      el.update(t);
      const car = T.cars[1];
      // A grid of car-local spots (across, along) on the floor and roof.
      const bodies = [];
      for (const lx of [-1.0, -0.5, 0, 0.5, 1.0]) for (const lz of [-6.5, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6.5]) {
        for (const lvl of [EL_CAR.floorY, EL_CAR.roofY]) {
          const cs = Math.cos(car.yaw), sn = Math.sin(car.yaw);
          bodies.push({ lx, lz, lvl, x: car.x + lx * cs + lz * sn, y: car.y + lvl, z: car.z - lx * sn + lz * cs, vy: 0 });
        }
      }
      for (const p of bodies) stepBody(ctx.collision, p, dt);
      let worst = 0, curveFrames = 0;
      for (let f = 0; f < 60 * 70; f++) {
        t += dt;
        el.update(t);
        const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
        if (Math.abs(sy) > 0.05 && Math.abs(cy) > 0.05) curveFrames++;
        for (const p of bodies) {
          stepBody(ctx.collision, p, dt);
          worst = Math.max(worst, (car.y + p.lvl) - p.y);
        }
      }
      expect(curveFrames).toBeGreaterThan(60); // it did go round a corner
      const dropped = bodies.filter((p) => p.y < car.y + p.lvl - 0.05).map((p) => `${p.lvl === EL_CAR.floorY ? 'floor' : 'roof'}(${p.lx},${p.lz}) y ${p.y.toFixed(2)}`);
      expect(dropped).toEqual([]);
      expect(worst).toBeLessThan(0.05);
    });
  }

  it('in a curve the car walls still hold a body inside (they turn with the car)', () => {
    const { ctx, el } = trainsCtx();
    const T = el.trains.find((t) => t.def.id === 'loopInner0');
    let t = 0;
    const car = T.cars[1];
    for (; t < 400; t += 0.1) { el.update(t); if (Math.abs(Math.sin(2 * car.yaw)) > 0.6) break; }
    expect(Math.abs(Math.sin(2 * car.yaw))).toBeGreaterThan(0.6);
    const cs = Math.cos(car.yaw), sn = Math.sin(car.yaw);
    const p = { x: car.x, y: car.y + EL_CAR.floorY, z: car.z, vy: 0 };
    let walls = 0;
    for (let i = 1; i <= 40; i++) {   // walk 2.4 m across the car, between the doors
      p.x += 0.06 * cs; p.z -= 0.06 * sn;
      const r = ctx.collision.resolveCylinder(p, 0.35, 1.8, { prevY: p.y });
      if (r.hitWall) walls++;
    }
    expect(walls).toBeGreaterThan(0);
    const lx = (p.x - car.x) * cs - (p.z - car.z) * sn;
    expect(lx).toBeLessThan(EL_CAR.width / 2 - 0.1);
  });
});
