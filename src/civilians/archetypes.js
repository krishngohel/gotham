// Who walks Gotham's streets, where and when (workstream M). Plain data plus small pure functions,
// unit-tested (tests/unit/civilians.test.js): every clip, model type and region kind resolves.
//
// An archetype is a kind of pedestrian: which figure types it is dressed as (src/actors/civilians/
// generator.js CIVILIAN_TYPES or a named look), how it walks (anims_civ clips, natural speed comes
// from the clip), what it does when it stops, and how it reacts to heroes and fights.
// Region spawn tables (src/world/regions/*Data.js spawnTables.civilians.kinds) name kinds; KIND_MAP
// turns each into archetypes, and the hour bends the mix (commuters at the rush hours, theatre
// crowds in the Loop at night, night-shift workers in the Yards, almost nobody at 4 a.m.).

// Activity ids (pedSim runs them; crowd.js plays their clips).
export const ACTIVITIES = ['window', 'phone', 'talk', 'photo', 'loiter', 'wait', 'sit', 'queue', 'vendor', 'musician', 'doorman', 'newspaper'];

export const ARCHETYPES = {
  commuter: { types: ['office', 'office', 'coat'], walks: ['Civ_Walk_Briefcase_M', 'Civ_Walk_Briefcase_F', 'Civ_Walk_Hurried', 'Civ_Walk_Text_M'], idles: ['Civ_Idle_Briefcase', 'Civ_Phone_M'], activities: { phone: 2, wait: 2, window: 1 }, pause: 0.15, brave: 0.3 },
  shopper: { types: ['casual', 'coat', 'casual'], walks: ['Civ_Walk_Carry', 'Civ_Walk_F', 'Civ_Walk_M'], idles: ['Civ_Idle_F', 'Civ_Idle_Look'], activities: { window: 4, talk: 2, phone: 1, queue: 1 }, pause: 0.35, brave: 0.4 },
  walker: { types: ['casual', 'coat', 'hoodie', 'casual'], walks: ['Civ_Walk_M', 'Civ_Walk_F', 'Civ_Walk_Swagger', 'Civ_Walk_Text_F'], idles: ['Civ_Idle_M', 'Civ_Idle_F', 'Civ_Texting'], activities: { phone: 2, talk: 2, window: 1, loiter: 1 }, pause: 0.25, brave: 0.5 },
  tourist: { types: ['tourist'], walks: ['Civ_Walk_M', 'Civ_Walk_F'], idles: ['Civ_Idle_Happy', 'Civ_Idle_Look'], activities: { photo: 5, window: 2, talk: 1 }, pause: 0.45, brave: 0.6 },
  theatregoer: { types: ['coat', 'office'], walks: ['Civ_Walk_F', 'Civ_Walk_M', 'Civ_Walk_Swagger'], idles: ['Civ_Idle_Happy', 'Civ_Argue'], activities: { talk: 4, queue: 2, phone: 1 }, pause: 0.3, brave: 0.4 },
  worker: { types: ['worker'], walks: ['Civ_Walk_M', 'Civ_Walk_Sad', 'Civ_Walk_Box'], idles: ['Civ_Idle_M', 'Civ_Idle_Box'], activities: { loiter: 2, talk: 2, phone: 1 }, pause: 0.2, brave: 0.7 },
  vendor: { types: ['vendor', 'chef'], walks: ['Civ_Walk_Carry', 'Civ_Walk_M'], idles: ['Civ_Idle_M', 'Civ_Idle_Look'], activities: { vendor: 3, newspaper: 1, talk: 1 }, pause: 0.6, brave: 0.5 },
  jogger: { types: ['casual'], walks: ['Civ_Jog'], idles: ['Civ_Idle_M'], activities: { phone: 1 }, pause: 0.05, brave: 0.5 },
  elderly: { types: ['coat'], walks: ['Civ_Walk_Old'], idles: ['Civ_Idle_Old'], activities: { sit: 3, talk: 2, wait: 1 }, pause: 0.4, brave: 0.2, build: 'elder' },
  student: { types: ['casual', 'hoodie'], walks: ['Civ_Walk_Text_M', 'Civ_Walk_Text_F', 'Civ_Walk_M'], idles: ['Civ_Texting', 'Civ_Idle_Look'], activities: { phone: 3, talk: 3, photo: 1 }, pause: 0.3, brave: 0.6 },
  vagrant: { types: ['hoodie', 'coat'], walks: ['Civ_Walk_Drunk', 'Civ_Walk_Sad'], idles: ['Civ_Drunk_Idle', 'Civ_Idle_Sad'], activities: { loiter: 4, sit: 2 }, pause: 0.5, brave: 0.3 },
  nurse: { types: ['nurse'], walks: ['Civ_Walk_Hurried', 'Civ_Walk_F'], idles: ['Civ_Idle_F', 'Civ_Phone_F'], activities: { phone: 1, wait: 1 }, pause: 0.1, brave: 0.6 },
  police: { types: ['police'], walks: ['Civ_Walk_M', 'Civ_Walk_Swagger'], idles: ['Civ_Idle_Look', 'Civ_Idle_M'], activities: { loiter: 2, talk: 1 }, pause: 0.25, brave: 1, police: true },
  doorman: { types: ['office'], walks: ['Civ_Walk_M'], idles: ['Civ_Idle_M'], activities: { doorman: 1 }, pause: 0.8, brave: 0.5 },
};
export const ARCHETYPE_IDS = Object.keys(ARCHETYPES);

// Region spawn-table kinds -> archetype weights.
export const KIND_MAP = {
  walker: { walker: 1 }, jogger: { jogger: 1 }, tourist: { tourist: 1 }, worker: { worker: 1 },
  dogWalker: { walker: 1, elderly: 0.3 }, guard: { police: 1 }, student: { student: 1 }, family: { tourist: 0.6, shopper: 0.6 },
  teen: { student: 1 }, orderly: { nurse: 1 }, office: { commuter: 1 }, theatregoer: { theatregoer: 1 },
  shopper: { shopper: 1 }, doorman: { doorman: 0.5, commuter: 0.5 }, vagrant: { vagrant: 1 }, kid: { student: 1 },
  elderly: { elderly: 1 }, vendor: { vendor: 1 },
};

// Districts whose evening belongs to the theatres, the market or the night shift.
const NIGHTLIFE = new Set(['loop', 'gothamMile', 'neon', 'theatre', 'mile']);
const MARKET = new Set(['narrows', 'chinatown']);
const NIGHT_SHIFT = new Set(['yards', 'ace', 'docks', 'quay']);

// The archetype mix for a region's kinds at an hour (weights, not normalised). Pure.
export function mixAt(kinds, district, hour, out = {}) {
  for (const k in out) delete out[k];
  const add = (a, w) => { if (w > 0) out[a] = (out[a] ?? 0) + w; };
  for (const kind of kinds ?? ['walker']) for (const [a, w] of Object.entries(KIND_MAP[kind] ?? { walker: 1 })) add(a, w);
  const h = ((hour % 24) + 24) % 24;
  const rush = (h >= 7 && h < 9.5) || (h >= 16.5 && h < 19) ? 1 : 0;
  const day = h >= 8 && h < 18 ? 1 : 0;
  const late = h >= 22 || h < 5 ? 1 : 0;
  add('commuter', rush * 1.6 + day * 0.4);
  add('shopper', day * 0.8);
  add('walker', 0.5);
  add('jogger', (h >= 6 && h < 8.5) || (h >= 17 && h < 19.5) ? 0.4 : 0);
  if (NIGHTLIFE.has(district)) add('theatregoer', h >= 18.5 && h < 23.5 ? 2.2 : 0);
  if (MARKET.has(district)) { add('vendor', h >= 7 && h < 21 ? 1 : 0); add('shopper', h >= 8 && h < 21 ? 1.2 : 0); }
  if (NIGHT_SHIFT.has(district)) add('worker', h >= 21 || h < 7 ? 1.5 : 0.3);
  // Late at night: fewer commuters and shoppers, more drifters.
  if (late) {
    for (const a of ['commuter', 'shopper', 'tourist', 'elderly', 'jogger']) if (out[a]) out[a] *= 0.15;
    add('vagrant', 0.4);
  }
  // Police walk a beat at every hour.
  add('police', 0.12);
  return out;
}

// Pick from weights with r in [0, 1). Pure.
export function pickWeighted(weights, r) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let x = r * total, last = null;
  for (const k in weights) { last = k; x -= weights[k]; if (x <= 0) return k; }
  return last;
}

// How busy the streets are at an hour (0..1): almost nobody at 4 a.m., a lunch and an evening
// peak, a long night tail. Pure.
const HOUR_CURVE = [0.25, 0.18, 0.12, 0.08, 0.06, 0.1, 0.25, 0.6, 0.9, 0.8, 0.75, 0.85, 1, 0.95, 0.85, 0.85, 0.9, 1, 1, 0.9, 0.8, 0.7, 0.55, 0.4];
export function hourFactor(hour) {
  const h = ((hour % 24) + 24) % 24;
  const i = Math.floor(h), t = h - i;
  return HOUR_CURVE[i] + (HOUR_CURVE[(i + 1) % 24] - HOUR_CURVE[i]) * t;
}

// Weather keeps people in: rain and storms empty the streets, fog a little. w: { rain, snow, fog }.
export function weatherFactor(w) {
  const rain = w?.rain ?? 0, snow = w?.snow ?? 0, fog = w?.fog ?? 0;
  return Math.max(0.2, (1 - 0.6 * rain) * (1 - 0.4 * snow) * (1 - 0.2 * Math.max(0, fog - 0.1)));
}

// Target pedestrian count around one anchor: region density (spawn table) x hour x weather x
// the tier's cap. Pure.
export function targetCount({ regionDensity = 0.5, hour = 12, weather = null, cap = 40 }) {
  return Math.round(cap * Math.min(1, regionDensity) * hourFactor(hour) * weatherFactor(weather));
}

// Umbrella weather: share of walkers who carry one. Pure.
export function umbrellaShare(w) { return (w?.rain ?? 0) > 0.2 ? Math.min(0.85, 0.3 + 0.6 * (w.rain ?? 0)) : (w?.snow ?? 0) > 0.4 ? 0.2 : 0; }

// Per tier: full skinned figures near, how many impostors far, and the radii (metres).
export const CROWD_TIERS = {
  potato: { full: 12, impostors: 64, fullRadius: 28, drawRadius: 90, cap: 40 },
  low: { full: 20, impostors: 96, fullRadius: 34, drawRadius: 110, cap: 56 },
  medium: { full: 32, impostors: 140, fullRadius: 40, drawRadius: 130, cap: 80 },
  high: { full: 45, impostors: 180, fullRadius: 46, drawRadius: 150, cap: 100 },
  ultra: { full: 64, impostors: 220, fullRadius: 55, drawRadius: 170, cap: 120 },
};
export function crowdTier(quality) {
  const base = CROWD_TIERS[quality?.name] ?? CROWD_TIERS.high;
  const t = { ...base };
  if (quality?.crowd) Object.assign(t, quality.crowd);
  return t;
}

// The core city's districts have no spawn table of their own (src/world/regions/data.js): these
// stand in, by district. Other regions use their spawnTables.civilians.
export const CORE_TABLES = {
  gcpd: { density: 0.8, kinds: ['office', 'walker', 'shopper'] },
  neon: { density: 0.9, kinds: ['walker', 'shopper', 'theatregoer', 'vagrant'] },
  clock: { density: 0.7, kinds: ['walker', 'office', 'elderly', 'tourist'] },
  docks: { density: 0.3, kinds: ['worker', 'walker'] },
  ace: { density: 0.25, kinds: ['worker'] },
};
export function districtTable(district, regionTable = null) {
  return regionTable ?? CORE_TABLES[district] ?? { density: 0.5, kinds: ['walker'] };
}
