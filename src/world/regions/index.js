// The region list (Long Night 2 contract 4.2):
//   REGIONS: Region[]
//   Region = { id, name, bounds, seed, build(ctx, env), districtAt(x, z), sites, spawnTables,
//              palette, districts, water, floor, killY }
// Data (bounds, districts, palettes, water, sites, spawn tables) lives in ./data.js so pure
// modules can read it; this file adds each region's builder. World assembly order is the array
// order: the core first (so its rng sequence and its grapple pruning are exactly as before),
// then each further region with its own seed. See docs/design/world-framework.md.
import { REGION_DATA, regionDataAt } from './data.js';
import { buildCity } from '../cityBuilder.js';
import { buildDistricts } from '../districts.js';
import { buildZiplines } from '../ziplines.js';
import { buildInteriors } from '../interiors.js';
import { buildRiver, buildLowerGotham, buildLoopRow } from './riverfront.js';
import { createBascules } from './bascules.js';
import { RIVERFRONT } from './streets.js';
import { buildLoop } from './loop.js';
import { buildMile } from './mile.js';
import { buildElStructure, createElTrains } from './el.js';
import { EAST_BUILDERS } from './eastBuilders.js'; // H2: lakefront, museum campus, lake + pier, Arkham
import { WEST_BUILDERS, WEST_KILL_Y } from './westBuilders.js'; // workstream H3
import { buildBristol } from './bristol.js';
import { buildBlackgate } from './blackgate.js';

const BUILDERS = {
  // Today's builders, in today's order, on the core's own rng (seed 11): byte-for-byte the city
  // the game always had (tests/unit/coreWorldFrozen.test.js holds it to that).
  core(ctx, { data }) {
    buildCity(ctx, data);
    buildDistricts(ctx);
    buildZiplines(ctx);
    // Part I: enterable interiors (the Joker funhouse inside the cathedral, the Ace Chemicals hall).
    buildInteriors(ctx);
    clearCausewayMouth(ctx); // [polish]
  },
  river(ctx) {
    buildRiver(ctx);
    const bridges = createBascules(ctx, RIVERFRONT.bridges);
    ctx.world.bridges = bridges;
    ctx.updaters.push((t) => bridges.update(t));
  },
  lowerGotham(ctx) { buildLowerGotham(ctx); },
  loop(ctx) {
    buildLoopRow(ctx);
    buildLoop(ctx);
    buildElStructure(ctx);
    // The running El (world.regions -> loop.el, and ctx.world.el for world.js to expose).
    const el = createElTrains(ctx);
    ctx.world.el = el;
    REGIONS.find((r) => r.id === 'loop').el = el;
    ctx.updaters.push((t) => el.update(t));
  },
  gothamMile(ctx) { buildMile(ctx); },
  ...EAST_BUILDERS,
  bristol(ctx) { buildBristol(ctx); },
  blackgate(ctx) { buildBlackgate(ctx); },
};

// [polish] One of the docks' random crates (districts.js, seed 11) stands on the centre line of
// the road into the Blackgate causeway, where every car to the prison hits it. The frozen build
// still draws and places it (rng and the core's box numbers unchanged); here its collision box is
// taken out of the world and its geometry out of the buckets before they merge.
const CAUSEWAY_MOUTH = { minX: 86, maxX: 94, minZ: 184, maxZ: 196 };
function clearCausewayMouth(ctx) {
  const gone = [];
  for (let i = ctx.boxStart ?? 0; i < ctx.collision.boxes.length; i++) {
    const b = ctx.collision.boxes[i];
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, M = CAUSEWAY_MOUTH;
    if (b.removed || b.tag || b.maxY > 2 || b.maxX - b.minX > 2 || b.maxZ - b.minZ > 2) continue;
    if (cx < M.minX || cx > M.maxX || cz < M.minZ || cz > M.maxZ) continue;
    ctx.collision.removeBox(b);
    gone.push(b);
  }
  const same = (bb, b) => Math.abs(bb.min.x - b.minX) < 1e-6 && Math.abs(bb.max.x - b.maxX) < 1e-6 && Math.abs(bb.min.z - b.minZ) < 1e-6
    && Math.abs(bb.max.z - b.maxZ) < 1e-6 && Math.abs(bb.min.y - b.minY) < 1e-6 && Math.abs(bb.max.y - b.maxY) < 1e-6;
  if (gone.length) ctx.buckets.remove((bb) => gone.some((b) => same(bb, b)));
}

// Height below which a body counts as in the water (game.js teleports the hero back to safe
// ground). The core keeps its old -0.8 m everywhere; the river and the lower deck sit lower.
const KILL_Y = { core: -0.8, river: -6.2, lowerGotham: -7, loop: -0.8, bristol: -0.8, blackgate: -0.8 };

Object.assign(BUILDERS, WEST_BUILDERS);
Object.assign(KILL_Y, WEST_KILL_Y);

export const REGIONS = REGION_DATA.map((r) => ({
  ...r,
  palette: r.districts[0]?.palette ?? null,
  killY: KILL_Y[r.id] ?? -0.8,
  build: BUILDERS[r.id],
}));

export function regionAt(x, z) {
  const d = regionDataAt(x, z);
  return d ? REGIONS.find((r) => r.id === d.id) : null;
}

export function killYAt(x, z) {
  if (z > 205) return -0.8; // the harbour
  return regionAt(x, z)?.killY ?? -0.8;
}

export * from './data.js';
