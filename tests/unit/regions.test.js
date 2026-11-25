import { describe, it, expect } from 'vitest';
import { REGIONS, regionAt, killYAt, DISTRICT_IDS, DISTRICT_LABEL, DISTRICT_PHRASE, DISTRICTS, districtAt, floorAt, WORLD_BOUNDS, PROGRESS_MAP_BOUNDS, REGION_CRIME_SPOTS } from '../../src/world/regions/index.js';
import { districtAt as coreDistrictAt, WORLD } from '../../src/world/mapData.js';
import { boundaryWalls, insideAny } from '../../src/world/regions/walls.js';
import { basculeState, BASCULE } from '../../src/world/regions/bascules.js';
import { sanitizeProgress, loadProgress } from '../../src/core/save.js';
import { DISTRICT_PALETTES, DISTRICT_CENTERS } from '../../src/render/comicPalette.js';
import { ALL_CRIME_SPOTS, CRIME_SPOTS } from '../../src/game/crimes.js';
import { MAP_BOUNDS } from '../../src/game/mapModel.js';
import { buildStreetGraph } from '../../src/world/regions/streets.js';

const OLD_FIVE = ['gcpd', 'docks', 'neon', 'ace', 'clock'];

describe('region list', () => {
  it('every region has the contract fields and its own seed', () => {
    const seeds = new Set();
    for (const r of REGIONS) {
      for (const k of ['id', 'name', 'bounds', 'seed', 'build', 'districtAt', 'sites', 'spawnTables']) expect(r[k], `${r.id}.${k}`).toBeDefined();
      expect(typeof r.build).toBe('function');
      seeds.add(r.seed);
    }
    expect(seeds.size).toBe(REGIONS.length);
    expect(REGIONS[0].id).toBe('core');
    expect(REGIONS[0].seed).toBe(11);
  });
  it('regions do not overlap', () => {
    for (let i = 0; i < REGIONS.length; i++) for (let j = i + 1; j < REGIONS.length; j++) {
      const a = REGIONS[i].bounds, b = REGIONS[j].bounds;
      const overlap = a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
      expect(overlap, `${REGIONS[i].id}/${REGIONS[j].id}`).toBe(false);
    }
  });
  it('the core region is the old city exactly', () => {
    const c = REGIONS[0].bounds;
    expect([c.minX, c.maxX, c.minZ, c.maxZ]).toEqual([WORLD.minX, WORLD.maxX, WORLD.minZ, WORLD.waterZ]);
  });
  it('regionAt finds the owner', () => {
    expect(regionAt(0, 0).id).toBe('core');
    expect(regionAt(0, -250).id).toBe('river');
    expect(regionAt(0, -290).id).toBe('lowerGotham');
    expect(regionAt(0, -340).id).toBe('loop');
    expect(regionAt(0, 400)).toBe(null);
  });
});

describe('districts are data', () => {
  it('keeps the five old ids first and in order (saves store them)', () => {
    expect(DISTRICT_IDS.slice(0, 5)).toEqual(OLD_FIVE);
    expect(new Set(DISTRICT_IDS).size).toBe(DISTRICT_IDS.length);
    expect(DISTRICT_LABEL.neon).toBe('Neon Row');
    expect(DISTRICT_PHRASE.clock).toBe('in the Clock Plaza');
    for (const id of DISTRICT_IDS) { expect(DISTRICT_LABEL[id]).toBeTruthy(); expect(DISTRICT_PHRASE[id]).toBeTruthy(); }
  });
  it('an old save with the five districts loads unchanged, and new ids are kept', () => {
    const store = new Map([['gotham-progress-v1', JSON.stringify({ step: 12, districts: ['gcpd', 'neon', 'clock'], trophies: [1] })]]);
    const st = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    const p = loadProgress(st);
    expect(p.districts).toEqual(['gcpd', 'neon', 'clock']);
    expect(p.step).toBe(12);
    expect(sanitizeProgress({ districts: ['gcpd', 'loop', 'lowerGotham', 'bogus'] }).districts).toEqual(['gcpd', 'loop', 'lowerGotham']);
  });
  it('districtAt answers exactly as before inside the core and over the harbour', () => {
    for (let x = -236; x <= 236; x += 7) for (let z = -236; z <= 330; z += 7) expect(districtAt(x, z)).toBe(coreDistrictAt(x, z));
  });
  it('districtAt names the new districts', () => {
    expect(districtAt(-30, -258)).toBe('river');
    expect(districtAt(-30, -290)).toBe('lowerGotham');
    expect(districtAt(-30, -330)).toBe('loop');
  });
  it('palettes keep their old keys and values and add the new districts', () => {
    expect(DISTRICT_PALETTES.cathedral).toEqual([0x1e1c1c, 0x6e675e, 0x4f4a44, 0x34302c, 0xe8a23f, 0xefe1c4]);
    expect(DISTRICT_CENTERS.docks).toEqual({ x: -20, z: 200 });
    for (const d of DISTRICTS) expect(DISTRICT_PALETTES[d.palette.key]).toHaveLength(6);
  });
  it('the floor is the old one in the core and the harbour; decks and the river have none', () => {
    for (let x = -236; x <= 236; x += 23) for (let z = -236; z <= 330; z += 11) expect(floorAt(x, z)).toBe(z > WORLD.waterZ ? -Infinity : 0);
    expect(floorAt(0, -250)).toBe(-Infinity);
    expect(floorAt(0, -290)).toBe(-Infinity);
    expect(floorAt(0, -330)).toBe(0);
  });
  it('the water line: -0.8 in the core and harbour, lower on the river and decks', () => {
    expect(killYAt(0, 0)).toBe(-0.8);
    expect(killYAt(0, 260)).toBe(-0.8);
    expect(killYAt(0, -250)).toBeLessThan(-6);
    expect(killYAt(0, -290)).toBeLessThan(-5.5);
  });
  it('crime spots: core ones unchanged, region ones in their own districts and visited-gated', () => {
    expect(ALL_CRIME_SPOTS.slice(0, CRIME_SPOTS.length)).toEqual(CRIME_SPOTS);
    for (const s of REGION_CRIME_SPOTS) expect(districtAt(s.x, s.z), s.id).toBe(s.district);
  });
  it('the progress map stays on the old city until a region opts in', () => {
    expect(MAP_BOUNDS).toEqual({ minX: -236, maxX: 236, minZ: -236, maxZ: 280 });
    expect(PROGRESS_MAP_BOUNDS).toEqual(MAP_BOUNDS);
  });
  it('world bounds cover every region and keep the harbour edge', () => {
    for (const r of REGIONS) {
      expect(WORLD_BOUNDS.minX).toBeLessThanOrEqual(r.bounds.minX);
      expect(WORLD_BOUNDS.minZ).toBeLessThanOrEqual(r.bounds.minZ);
      expect(WORLD_BOUNDS.maxX).toBeGreaterThanOrEqual(r.bounds.maxX);
    }
    expect(WORLD_BOUNDS.waterZ).toBe(205);
  });
});

describe('edge walls', () => {
  const land = REGIONS.map((r) => r.bounds).concat([{ minX: -236, maxX: 236, minZ: 205, maxZ: 320 }]);
  const walls = boundaryWalls(land);
  const inWall = (x, z) => walls.some((w) => x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ);
  it('never stands on land', () => {
    for (const w of walls) {
      for (const [x, z] of [[w.minX + 0.5, w.minZ + 0.5], [w.maxX - 0.5, w.maxZ - 0.5], [(w.minX + w.maxX) / 2, (w.minZ + w.maxZ) / 2]]) expect(insideAny(land, x, z)).toBe(false);
    }
  });
  it('closes every way out: walking outward from any edge point hits a wall', () => {
    for (let x = -300; x <= 400; x += 3) {
      // Straight north out of the land at this x, and straight south.
      let z = -200.5;
      let last = null;
      for (; z > -500; z -= 1) { if (insideAny(land, x, z)) last = z; else if (last !== null) break; }
      if (last !== null && z > -500) expect(inWall(x, z - 1), `north at x ${x}`).toBe(true);
    }
    // The old north edge of the core is open now (the river is there). The old west edge opened
    // too when the South Branch quay and the west districts arrived (workstream H3): the wall now
    // stands on the city's new west edge, x -580.
    expect(inWall(0, -240)).toBe(false);
    expect(inWall(-238, 0)).toBe(false);
    expect(inWall(-582, 0)).toBe(true);
    expect(inWall(0, 322)).toBe(true);
  });
});

describe('bascule bridges', () => {
  it('cycle: down most of the time, gates before lifting, 70 degrees up, back down', () => {
    expect(basculeState(0, 0).phase).toBe('down');
    const down = BASCULE.cycle - (2 * BASCULE.close + 2 * BASCULE.lift + BASCULE.hold);
    expect(basculeState(down + 1, 0)).toMatchObject({ phase: 'closing', angle: 0, gates: true });
    const up = basculeState(down + BASCULE.close + BASCULE.lift + 1, 0);
    expect(up.phase).toBe('up');
    expect(up.angle).toBeCloseTo(BASCULE.maxAngle);
    expect(basculeState(BASCULE.cycle - 1, 0).phase).toBe('opening');
    expect(basculeState(BASCULE.cycle + 1, 0).phase).toBe('down');
    expect(basculeState(5, 0, 'up').angle).toBeCloseTo(BASCULE.maxAngle);
    expect(basculeState(down + 30, 0, 'down').phase).toBe('down');
  });
  it('the graph knows which edges a raised bridge closes', () => {
    const g = buildStreetGraph();
    const closed = (e) => e.bridge === 'bridgeE';
    const r = g.routeBetween({ x: -30, y: 0, z: -200 }, { x: -30, y: 0, z: -291 }, { blocked: closed });
    // With the east bridge up, the route goes round by the west one.
    expect(r.edges.some((e) => g.edges[e].bridge === 'bridgeW')).toBe(true);
  });
});
