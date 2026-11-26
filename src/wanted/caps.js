// [wanted] Hard caps on police units by quality tier, and the level's wish cut to them (pure;
// tests/unit/wantedPlacement.test.js). Read from the quality object's flags, never the tier name
// (design rule 4.3): `quality.wantedCaps` if the render owner ever sets one, else derived from the
// light pool size (0/2/4/6/8 by tier) and crowd density, which already scale with the machine.
//
//   tier     cruisers  vans  officers  helicopter  heli light cone  boats  roadblocks  props
//   potato   2         0     3         yes (dark)  no               0      1           6
//   low      3         1     5         yes         no               1      1           10
//   medium   4         1     6         yes         yes              1      2           14
//   high     5         2     8         yes         yes              1      2           18
//   ultra    6         2     10        yes         yes              2      3           24
// Vehicles (cruisers + vans) never exceed `vehicles` (potato 2 .. ultra 6).
import { LEVELS, MAX_LEVEL } from './rules.js';

const TABLE = [
  { vehicles: 2, cruisers: 2, vans: 0, officers: 3, heli: true, heliCone: false, boats: 0, roadblocks: 1, props: 6, debris: 8 },
  { vehicles: 3, cruisers: 3, vans: 1, officers: 5, heli: true, heliCone: false, boats: 1, roadblocks: 1, props: 10, debris: 12 },
  { vehicles: 4, cruisers: 4, vans: 1, officers: 6, heli: true, heliCone: true, boats: 1, roadblocks: 2, props: 14, debris: 16 },
  { vehicles: 5, cruisers: 5, vans: 2, officers: 8, heli: true, heliCone: true, boats: 1, roadblocks: 2, props: 18, debris: 20 },
  { vehicles: 6, cruisers: 6, vans: 2, officers: 10, heli: true, heliCone: true, boats: 2, roadblocks: 3, props: 24, debris: 24 },
];

export function tierIndexOf(quality) {
  if (!quality) return 3;
  const lights = Number.isFinite(quality.lights) ? quality.lights : 6;
  const dens = Number.isFinite(quality.crowdDensity) ? quality.crowdDensity : 1;
  let i = Math.max(0, Math.min(4, Math.round(lights / 2)));
  // A crowd thinned below half (potato) never gets more than the low row.
  if (dens < 0.4) i = Math.min(i, 0);
  return i;
}

export function capsFor(quality) {
  if (quality?.wantedCaps) return { ...TABLE[3], ...quality.wantedCaps };
  return { ...TABLE[tierIndexOf(quality)] };
}

// How many of each unit the level wants, after the modifiers' `units` bonus and the tier caps.
// split: two players far apart split the pursuit (one extra cruiser, still under the cap).
export function unitBudget(level, caps, { units = 0, split = false } = {}) {
  const L = LEVELS[Math.max(0, Math.min(MAX_LEVEL, level))];
  if (L.level === 0) return { cruisers: 0, vans: 0, officers: 0, heli: false, heliCone: false, roadblocks: 0, spikes: false, boats: 0 };
  const bonus = L.level >= 2 ? units : Math.min(0, units);
  let cruisers = Math.max(0, Math.min(caps.cruisers, L.cruisers + bonus + (split ? 1 : 0)));
  let vans = Math.max(0, Math.min(caps.vans, L.vans + (L.vans ? Math.max(0, bonus) : 0)));
  // The vehicle cap is shared: vans first (they carry the SWAT), cruisers fill the rest.
  if (cruisers + vans > caps.vehicles) cruisers = Math.max(0, caps.vehicles - vans);
  if (cruisers + vans > caps.vehicles) vans = caps.vehicles;
  return {
    cruisers, vans,
    officers: Math.max(0, Math.min(caps.officers, L.officers + bonus)),
    heli: L.heli && caps.heli,
    heliCone: L.heli && caps.heli && caps.heliCone,
    roadblocks: Math.min(caps.roadblocks, L.roadblocks),
    spikes: L.spikes,
    boats: L.level >= 3 ? Math.min(caps.boats, L.level >= 4 ? 2 : 1) : 0,
  };
}
