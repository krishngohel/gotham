// The west side's region builders (workstream H3), registered into regions/index.js BUILDERS.
// Order follows REGION_DATA (westRiver first: its bridges merge into world.bridges).
import { buildWestRiver, buildQuay } from './westRiver.js';
import { buildNarrows } from './narrows.js';
import { buildParkRow } from './parkRow.js';
import { buildChinatown } from './chinatown.js';
import { buildYards } from './yards.js';

export const WEST_BUILDERS = {
  westRiver: buildWestRiver,
  quay: buildQuay,
  narrows: buildNarrows,
  parkRow: buildParkRow,
  chinatown: buildChinatown,
  yards: buildYards,
};

// Below these a body is in the water (game.js teleports the hero back to safe ground). The
// branches have walkable surfaces down to the river walk (-4.5), the river is at -6.
export const WEST_KILL_Y = { westRiver: -6.2 };
