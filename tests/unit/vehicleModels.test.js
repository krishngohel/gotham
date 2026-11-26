// Contracts for the code-built vehicles in src/vehicles/models/: every vehicle exposes the handles
// the game and the mechanics workstreams rely on, stays inside its draw-call and triangle budgets,
// the Batmobile's mode blend has clean endpoints, and the El car keeps true-size dimensions.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CATALOG } from '../../src/vehicles/models/catalog.js';
import { FLEET_TYPES, FLEET, createStreetVehicle, createTrafficInstances, parkedVehicleParts, lodGeometry, fleetStats, PARKED_TYPES } from '../../src/vehicles/models/street.js';
import { createBatmobileModel, BATMOBILE } from '../../src/vehicles/models/batmobile.js';
import { createElCar, createElTrain, EL_CAR, elCarColliders } from '../../src/vehicles/models/elTrain.js';
import { createBoat, BOAT_TYPES } from '../../src/vehicles/models/marine.js';
import { createHelicopter, createBlimpModel } from '../../src/vehicles/models/aircraft.js';
import { createBatcycle, createWingBike } from '../../src/vehicles/models/heroBikes.js';
import { measure } from '../../src/vehicles/models/kit.js';
import * as legacy from '../../src/vehicles/vehicleModels.js';

const meshes = (root) => { const out = []; root.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
const box = (o) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };

describe('vehicle catalog', () => {
  it('builds every entry with a group and no NaN geometry', () => {
    for (const e of CATALOG) {
      const v = e.create({});
      expect(v.group?.isObject3D, e.id).toBe(true);
      for (const m of meshes(v.group)) for (const x of m.geometry.attributes.position.array) if (!Number.isFinite(x)) throw new Error(`${e.id}: NaN vertex`);
    }
  });
  it('keeps the original vehicleModels.js exports', () => {
    for (const k of ['createBatmobile', 'createStreetCar', 'createJokerVan', 'createDroneTank', 'createTracer', 'createShell']) expect(typeof legacy[k], k).toBe('function');
  });
});

describe('street fleet', () => {
  it('has the requested types', () => {
    for (const t of ['sedan', 'sedan_deco', 'sedan_compact', 'coupe', 'hatchback', 'wagon', 'suv', 'pickup', 'van_delivery', 'box_truck', 'taxi', 'bus', 'police', 'police_van', 'ambulance', 'fire_engine', 'garbage_truck', 'limousine', 'motorcycle', 'gang_van', 'armored_truck']) {
      expect(FLEET_TYPES).toContain(t);
    }
  });

  for (const type of FLEET_TYPES) {
    it(`${type}: handles, lamps, damage and LOD`, () => {
      const v = createStreetVehicle(type, { palette: 1 });
      expect(v.wheels.length).toBeGreaterThanOrEqual(2);
      expect(v.wheels.some((w) => w.front)).toBe(true);
      for (const w of v.wheels) { expect(w.pivot.isObject3D).toBe(true); expect(w.spin.isObject3D).toBe(true); }
      expect(v.wheelRadius).toBeGreaterThan(0.2);
      expect(v.lampAnchors.head.length).toBeGreaterThan(0);
      expect(v.lampAnchors.tail.length).toBeGreaterThan(0);
      expect(v.seat.isObject3D).toBe(true);
      expect(v.smokeAnchor.isObject3D).toBe(true);
      expect(() => v.setLamps({ head: true, brake: true, left: true, reverse: true })).not.toThrow();
      expect(() => v.update(0.5)).not.toThrow();
      // Turning a wheel moves its part of the skinned body (wheels are bones, not loose meshes).
      expect(v.wheels[0].spin.isBone).toBe(true);

      // Drivable individual: <= 6 draws at LOD0 (body, ink, glass, lamps, + smoke when damaged).
      expect(measure(v.group).draws).toBeLessThanOrEqual(6);
      const before = v.group.getObjectByName('body').geometry;
      v.setDamage(1);
      expect(v.group.getObjectByName('body').geometry).not.toBe(before);
      v.setDamage(2);
      expect(v.group.getObjectByName('smokePuffs').visible).toBe(true);
      expect(measure(v.group).draws).toBeLessThanOrEqual(6);
      v.setDamage(0);
      v.setLod(1);
      expect(measure(v.group).draws).toBe(1);
    });

    it(`${type}: triangle budgets (LOD0 <= 2.5k for traffic, LOD1 <= 300)`, () => {
      const s = fleetStats(type);
      expect(s.lod0Tris).toBeLessThanOrEqual(2500);
      expect(s.lod1Tris).toBeLessThanOrEqual(300);
      expect(s.individualDraws).toBeLessThanOrEqual(6);
    });
  }

  it('instances traffic in 3 draws per type (1 at LOD1), repainting only the paint', () => {
    const t = createTrafficInstances('sedan', 12);
    expect(t.meshes.length).toBe(3);
    expect(t.body.isInstancedMesh).toBe(true);
    expect(t.body.geometry.attributes.aPaint).toBeTruthy();
    t.setInstance(3, new THREE.Matrix4().makeTranslation(5, 0, 0), 0x336699);
    expect(t.body.instanceColor.getX(3)).toBeCloseTo(new THREE.Color(0x336699).r, 4);
    expect(createTrafficInstances('taxi', 4, { lod: 1 }).meshes.length).toBe(1);
  });

  it('shares one set of materials across the whole fleet', () => {
    const a = createStreetVehicle('sedan'), b = createStreetVehicle('bus');
    expect(a.group.getObjectByName('body').material).toBe(b.group.getObjectByName('body').material);
    expect(a.group.getObjectByName('glass').material).toBe(b.group.getObjectByName('glass').material);
  });

  it('gives parked cars plain static geometry for the city buckets', () => {
    const m = new THREE.Matrix4().makeTranslation(100, 0, -40);
    for (const type of PARKED_TYPES) {
      const p = parkedVehicleParts(type, { matrix: m });
      expect(p.painted.attributes.color).toBeTruthy();
      expect(p.painted.attributes.skinIndex).toBeUndefined();
      expect(p.painted.index).toBeNull();
      p.painted.computeBoundingBox();
      expect(p.painted.boundingBox.getCenter(new THREE.Vector3()).x).toBeGreaterThan(95);
      expect(p.glow.attributes.color).toBeTruthy();
    }
  });

  it('keeps vehicles at believable sizes', () => {
    const sedan = box(createStreetVehicle('sedan').group), bus = box(createStreetVehicle('bus').group);
    expect(sedan.max.z - sedan.min.z).toBeGreaterThan(4.2);
    expect(sedan.max.x - sedan.min.x).toBeLessThan(2.1);
    expect(sedan.min.y).toBeLessThan(0.05);
    expect(bus.max.z - bus.min.z).toBeGreaterThan(11);
    expect(bus.max.y).toBeGreaterThan(3);
    expect(lodGeometry('sedan').attributes.aPaint).toBeTruthy();
  });

  it('flashes beacons on emergency vehicles', () => {
    const p = createStreetVehicle('police');
    const lamps = p.group.getObjectByName('lamps');
    const snap = () => Array.from(lamps.geometry.attributes.color.array).join(',');
    p.setSiren(true);
    const seen = new Set();
    for (let i = 0; i < 8; i++) { p.update(0.09); seen.add(snap()); }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('exposes every fleet type with palettes', () => {
    for (const t of FLEET_TYPES) expect(FLEET[t].palettes.length).toBeGreaterThan(0);
  });
});

describe('Batmobile articulation', () => {
  it('has every mechanics handle', () => {
    const bm = createBatmobileModel();
    expect(bm.wheels).toHaveLength(4);
    for (const w of bm.wheels) for (const k of ['pivot', 'swivel', 'spin', 'mount']) expect(w[k].isObject3D, k).toBe(true);
    expect(bm.turret.muzzles).toHaveLength(2);
    for (const k of ['lift', 'yaw', 'pitch', 'spin']) expect(bm.turret[k].isBone, k).toBe(true);
    expect(bm.missilePorts).toHaveLength(4);
    for (const k of ['grapplePoint', 'seat', 'ejectPoint', 'canopy', 'hull', 'jetGlow', 'jetHalo', 'flame']) expect(bm[k]?.isObject3D, k).toBe(true);
    for (const k of ['setMode', 'setStrafe', 'aimTurret', 'setCanopy', 'setSuspension', 'setAttitude', 'setLamps', 'setAfterburner', 'setBoost', 'setFiring', 'update']) expect(typeof bm[k], k).toBe('function');
    expect(bm.wheelRadius).toBe(BATMOBILE.wheelR);
  });

  it('setMode blends between exact pursuit and battle endpoints', () => {
    const bm = createBatmobileModel();
    const snap = () => {
      bm.group.updateMatrixWorld(true);
      const w = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      return { lift: w(bm.turret.lift).y, hull: w(bm.hull).y, track: Math.abs(bm.wheels[0].pivot.position.x), muzzle: w(bm.turret.muzzles[0]).y, hatch: bm.bones.hatchL.rotation.z, armour: w(bm.bones.armorL).y };
    };
    bm.setMode(0);
    const pursuit = snap();
    bm.setMode(1);
    const battle = snap();
    expect(battle.lift).toBeGreaterThan(pursuit.lift + 0.5);
    expect(battle.hull).toBeGreaterThan(pursuit.hull);
    expect(battle.track).toBeGreaterThan(pursuit.track);
    expect(battle.armour).toBeGreaterThan(pursuit.armour);
    expect(Math.abs(battle.hatch)).toBeGreaterThan(1);
    // In pursuit the turret is stowed below the deck line; in battle the guns clear the deck.
    expect(pursuit.muzzle).toBeLessThan(1.02);
    expect(battle.muzzle).toBeGreaterThan(1.1);
    bm.setMode(0.5);
    const mid = snap();
    expect(mid.track).toBeGreaterThan(pursuit.track);
    expect(mid.track).toBeLessThan(battle.track);
    bm.setMode(0);
    expect(snap()).toEqual(pursuit);
    expect(bm.mode).toBe(0);
  });

  it('swivels the wheels 90 degrees for strafing, independent of steering', () => {
    const bm = createBatmobileModel();
    bm.setStrafe(1);
    for (const w of bm.wheels) expect(w.swivel.rotation.y).toBeCloseTo(Math.PI / 2, 6);
    bm.wheels[0].pivot.rotation.y = 0.3; // vehicles.js steering still works on top
    expect(bm.wheels[0].swivel.rotation.y).toBeCloseTo(Math.PI / 2, 6);
  });

  it('stays within ~14 draw calls in every state, and opens the canopy', () => {
    for (const skin of ['nightjar', 'classic']) {
      const bm = createBatmobileModel({ skin });
      bm.setMode(1); bm.setBoost(true); bm.setCanopy(1); bm.setFiring(true); bm.update(0.1);
      expect(measure(bm.group).draws).toBeLessThanOrEqual(14);
      expect(bm.canopy.rotation.x).toBeLessThan(-1);
    }
  });

  it('suspension moves wheels and their arms together', () => {
    const bm = createBatmobileModel();
    bm.setSuspension([0.1, -0.1, 0, 0.5]);
    expect(bm.wheels[0].pivot.position.y).toBeCloseTo(BATMOBILE.wheelR + 0.1, 6);
    expect(bm.wheels[3].pivot.position.y).toBeCloseTo(BATMOBILE.wheelR + 0.2, 6); // clamped
    for (const w of bm.wheels) expect(w.mount.position.equals(w.pivot.position)).toBe(true);
  });
});

describe('El train', () => {
  it('keeps true-size dimensions under the scale rule', () => {
    expect(EL_CAR.length).toBe(15);
    expect(EL_CAR.height).toBeCloseTo(3.4, 6);
    expect(EL_CAR.width).toBeGreaterThan(2.6);
    expect(EL_CAR.width).toBeLessThan(3.1);
    expect(EL_CAR.floorY).toBeGreaterThan(0.9);
    expect(EL_CAR.floorY).toBeLessThan(1.3);
    expect(EL_CAR.doorHeight).toBeGreaterThanOrEqual(1.9);
    const b = box(createElCar().group);
    expect(b.max.z - b.min.z).toBeGreaterThan(14.9);
    expect(b.max.z - b.min.z).toBeLessThan(16.0); // couplers stand proud of the 15 m body
    expect(b.max.x - b.min.x).toBeLessThan(EL_CAR.width + 0.1);
    expect(b.max.y).toBeGreaterThan(EL_CAR.roofY - 0.05);
    expect(b.max.y).toBeLessThan(EL_CAR.roofY + 0.25);
    expect(b.min.y).toBeGreaterThan(-0.05);
  });

  it('publishes collision boxes: a walkable roof at roof height, doors, a shell', () => {
    const cols = elCarColliders();
    const roof = cols.find((c) => c.kind === 'roof');
    expect(roof.walkable).toBe(true);
    expect(roof.max[1]).toBeCloseTo(EL_CAR.roofY, 6);
    expect(roof.max[0] - roof.min[0]).toBeGreaterThan(2.5); // a real width to fight on
    expect(cols.filter((c) => c.kind === 'door')).toHaveLength(4);
    expect(cols.some((c) => c.kind === 'shell')).toBe(true);
    for (const c of cols) for (let i = 0; i < 3; i++) expect(c.max[i]).toBeGreaterThan(c.min[i]);
  });

  it('couples 2-4 cars with consist-local colliders and bogie/axle handles', () => {
    const t = createElTrain(4);
    expect(t.cars).toHaveLength(4);
    expect(t.colliders.length).toBe(4 * elCarColliders().length);
    expect(t.length).toBeCloseTo(4 * 15 + 3 * EL_CAR.coupleGap, 6);
    const roofs = t.colliders.filter((c) => c.kind === 'roof').map((c) => (c.min[2] + c.max[2]) / 2);
    expect(Math.max(...roofs)).toBeLessThan(0);
    expect(Math.min(...roofs)).toBeGreaterThan(-t.length);
    expect(createElTrain(9).cars).toHaveLength(4);
    expect(createElTrain(1).cars).toHaveLength(2);
    const car = t.cars[0];
    expect(car.bogies).toHaveLength(2);
    expect(car.axles).toHaveLength(4);
    const a0 = car.axles[0].rotation.x;
    t.roll(1);
    expect(car.axles[0].rotation.x).not.toBe(a0);
    expect(measure(car.group).draws).toBeLessThanOrEqual(4);
  });
});

describe('other vehicles', () => {
  it('boats, aircraft and hero bikes expose their moving parts', () => {
    for (const t of BOAT_TYPES) { const b = createBoat(t); expect(b.prop.isBone).toBe(true); expect(() => b.update(0.1)).not.toThrow(); }
    const h = createHelicopter('gcpd');
    const r0 = h.rotor.rotation.y;
    h.update(0.1);
    expect(h.rotor.rotation.y).not.toBe(r0);
    expect(h.searchlight.isObject3D).toBe(true);
    const blimp = createBlimpModel();
    expect(blimp.signAnchors).toHaveLength(2);
    expect(blimp.props).toHaveLength(2);
    for (const bike of [createBatcycle(), createWingBike()]) {
      expect(bike.wheels).toHaveLength(2);
      expect(bike.wheels.filter((w) => w.front)).toHaveLength(1);
      expect(measure(bike.group).draws).toBeLessThanOrEqual(6);
    }
  });
});
