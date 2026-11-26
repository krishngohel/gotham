// The west side's region builders (workstream H3), registered into regions/index.js BUILDERS.
// Order follows REGION_DATA (westRiver first: its bridges merge into world.bridges).
import { buildWestRiver, buildQuay } from './westRiver.js';
import { buildNarrows } from './narrows.js';
import { buildParkRow } from './parkRow.js';
import { buildChinatown } from './chinatown.js';
import { buildYards } from './yards.js';
import { buildElWest } from './el.js';
import { X_STREETS } from './westLayout.js';

// [polish2] The El West Line's structure over each district's stretch of the z -479 street (el.js).
const EL_CROSS_X = X_STREETS.filter((s) => !s.quay).map((s) => s.x);
const withEl = (build, region) => (ctx, env) => { build(ctx, env); buildElWest(ctx, region, EL_CROSS_X); };

export const WEST_BUILDERS = {
  westRiver: withEl(buildWestRiver, 'westRiver'),
  quay: buildQuay,
  narrows: withEl(buildNarrows, 'narrows'),
  parkRow: withEl(buildParkRow, 'parkRow'),
  chinatown: buildChinatown,
  yards: buildYards,
};

// Below these a body is in the water (game.js teleports the hero back to safe ground). The
// branches have walkable surfaces down to the river walk (-4.5), the river is at -6.
export const WEST_KILL_Y = { westRiver: -6.2 };
