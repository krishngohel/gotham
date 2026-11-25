// Builds every region into one scene and collision world, in region order (the core first, on
// the shared seed-11 rng the rest of world.js keeps drawing from afterwards). Shared by the game
// (src/game/world.js) and the headless tests (tests/unit/helpers/headlessCity.js), so the tests
// freeze exactly what the game builds.
import { createCollision } from '../collision.js';
import { buildMapData } from '../mapData.js';
import { createCityContext, finishRegion, finishWorld } from '../cityBuilder.js';
import { REGIONS, floorAt } from './index.js';
import { boundaryWalls } from './walls.js';
import { buildStreetGraph } from './streets.js';

// The collision grid covers the whole planned city (and then some); boxes outside it still work
// through the grid's sparse fallback.
export const COLLISION_BOUNDS = { minX: -700, maxX: 800, minZ: -820, maxZ: 420 };

export function assembleCity(scene, { rng, quality, regions = REGIONS, createRng }) {
  const collision = createCollision({ floor: floorAt, bounds: COLLISION_BOUNDS });
  // Invisible walls around the union of the regions' land, plus the harbour strip the core always
  // let you reach (to z 320, past the freighter).
  const land = regions.map((r) => r.bounds).concat([{ minX: -236, maxX: 236, minZ: 205, maxZ: 320 }]);
  for (const w of boundaryWalls(land)) collision.addBox(w.minX, -12, w.minZ, w.maxX, 400, w.maxZ, 'bound');

  const data = buildMapData(11);
  const ctx = createCityContext(scene, rng, collision);
  ctx.compounds = data.compounds;
  ctx.quality = quality;
  ctx.world = { covers: [] }; // shared across regions: bridges, covered volumes (no rain under them)
  // Region 'core' first: today's builders on the shared seed-11 rng, then its own finish (grapple
  // pruning sees exactly the boxes it always did). Then every other region on its own seed.
  const regionCtx = {};
  for (const region of regions) {
    const rctx = region.id === 'core' ? ctx : createCityContext(scene, createRng(region.seed), collision, { shared: ctx, region: region.id });
    region.build(rctx, { data, quality });
    finishRegion(rctx);
    regionCtx[region.id] = { boxStart: rctx.boxStart, boxEnd: collision.boxes.length, grappleStart: rctx.grappleStart, grappleEnd: ctx.grapple.length };
  }
  finishWorld(ctx);
  return { ctx, collision, data, streetGraph: buildStreetGraph(), regionCtx };
}
