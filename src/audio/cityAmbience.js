// City ambience mixing, pure. The environment object (design 4.5, fed by the world, the clock
// and weather workstreams) goes in; a level per ambience layer, a muffling low-pass and the
// rates of the sparse one-shot events come out. ambience.js turns those into Web Audio nodes.
//
// environment = {
//   district,           region/district id ('docks', 'neon', 'loop', 'yards', ...)
//   timeOfDay,          0-24 hours
//   weather,            'clear' | 'drizzle' | 'rain' | 'storm' | 'fog' | 'snow'
//   rain,               optional 0..1 override of the rain intensity
//   indoors,            true inside a building
//   altitude,           metres above the street
//   traffic, crowd,     optional 0..1 densities (absolute, override the district's character)
//   wind,               optional 0..1 override
//   space,              optional reverb space override (see spaces.js)
// }

export const LAYERS = ['hum', 'traffic', 'crowd', 'water', 'harbour', 'industrial', 'insects', 'wind', 'rain', 'snow', 'roomTone'];

export const DEFAULT_ENV = Object.freeze({
  district: 'gcpd', timeOfDay: 23, weather: 'rain', rain: null, indoors: false, altitude: 0,
  traffic: null, crowd: null, wind: null, space: null,
});

// Each district's character: base level per layer plus how likely each one-shot is.
// Core districts keep their ids (gcpd, docks, neon, ace, clock); the new ones follow the
// district map in docs/design/long-night-2.md section 8.
const P = (layers, events = {}) => ({ layers, events });
export const DISTRICT_PROFILES = {
  gcpd: P({ traffic: 0.7, crowd: 0.35, hum: 0.5 }, { sirenPass: 3, carHorn: 2, shout: 1, carAlarm: 1 }),
  docks: P({ traffic: 0.2, crowd: 0.08, water: 0.75, harbour: 1, industrial: 0.4, hum: 0.3 }, { foghorn: 2, bellBuoy: 2, creak: 2, dogBark: 1, clank: 1 }),
  neon: P({ traffic: 0.6, crowd: 0.7, hum: 0.55 }, { jazzDoor: 3, shout: 2, carHorn: 2, glass: 1, sirenPass: 1 }),
  ace: P({ traffic: 0.15, industrial: 1, water: 0.25, hum: 0.6 }, { clank: 4, steam: 3, dogBark: 1 }),
  clock: P({ traffic: 0.5, crowd: 0.45, hum: 0.45 }, { carHorn: 2, shout: 1, dogBark: 1, carAlarm: 1 }),
  river: P({ traffic: 0.4, water: 1, hum: 0.4 }, { foghorn: 1, bridgeBell: 2, carHorn: 1 }),
  lowerGotham: P({ traffic: 0.85, crowd: 0.1, hum: 0.7, industrial: 0.2 }, { carHorn: 3, sirenPass: 2, elTrain: 1 }),
  loop: P({ traffic: 0.9, crowd: 0.6, hum: 0.65 }, { elTrain: 4, carHorn: 3, sirenPass: 2, shout: 1 }),
  gothamMile: P({ traffic: 0.85, crowd: 0.9, hum: 0.6 }, { carHorn: 3, jazzDoor: 1, shout: 1, sirenPass: 1 }),
  robinsonPark: P({ traffic: 0.25, crowd: 0.15, insects: 1, water: 0.35, hum: 0.2 }, { owl: 2, dogBark: 2 }),
  lakefront: P({ traffic: 0.35, crowd: 0.2, insects: 0.6, water: 0.8, hum: 0.25 }, { dogBark: 1, bellBuoy: 1, owl: 1 }),
  museumCampus: P({ traffic: 0.3, crowd: 0.3, water: 0.5, hum: 0.3 }, { dogBark: 1, shout: 1 }),
  amusementMile: P({ crowd: 0.7, water: 0.7, hum: 0.3 }, { calliope: 3, shout: 2, bellBuoy: 1 }),
  narrows: P({ traffic: 0.2, crowd: 0.4, hum: 0.4 }, { dogBark: 3, shout: 3, glass: 2, carAlarm: 2, elTrain: 1, sirenPass: 1 }),
  parkRow: P({ traffic: 0.3, crowd: 0.3, hum: 0.4 }, { sirenPass: 3, dogBark: 2, shout: 2, glass: 1 }),
  chinatown: P({ traffic: 0.4, crowd: 0.75, hum: 0.45 }, { shout: 2, carHorn: 2, jazzDoor: 1 }),
  littleOdessa: P({ traffic: 0.35, crowd: 0.45, hum: 0.4 }, { dogBark: 2, shout: 2, carHorn: 1 }),
  yards: P({ traffic: 0.15, industrial: 0.9, hum: 0.5 }, { elTrain: 2, clank: 4, steam: 2, dogBark: 1 }),
  bristol: P({ traffic: 0.05, insects: 0.85, hum: 0.05, wind: 0.35 }, { owl: 3, dogBark: 1 }),
  arkham: P({ water: 0.8, harbour: 0.3, hum: 0.15, wind: 0.55 }, { foghorn: 2, sirenPass: 1, creak: 1 }),
};
export const AMBIENT_EVENTS = ['sirenPass', 'carHorn', 'carAlarm', 'dogBark', 'shout', 'glass', 'jazzDoor', 'foghorn', 'bellBuoy', 'creak', 'clank', 'steam', 'elTrain', 'owl', 'calliope', 'bridgeBell'];

const c01 = (x) => Math.min(1, Math.max(0, Number(x) || 0));
const RAIN = { clear: 0, fog: 0, drizzle: 0.35, rain: 0.7, storm: 1, snow: 0 };

export function sanitizeEnv(env) {
  const e = env && typeof env === 'object' ? env : {};
  const d = DEFAULT_ENV;
  const tod = Number.isFinite(e.timeOfDay) ? ((e.timeOfDay % 24) + 24) % 24 : d.timeOfDay;
  return {
    district: typeof e.district === 'string' ? e.district : d.district,
    timeOfDay: tod,
    weather: typeof e.weather === 'string' && e.weather in RAIN ? e.weather : d.weather,
    rain: Number.isFinite(e.rain) ? c01(e.rain) : null,
    indoors: !!e.indoors,
    altitude: Number.isFinite(e.altitude) ? e.altitude : 0,
    traffic: Number.isFinite(e.traffic) ? c01(e.traffic) : null,
    crowd: Number.isFinite(e.crowd) ? c01(e.crowd) : null,
    wind: Number.isFinite(e.wind) ? c01(e.wind) : null,
    space: typeof e.space === 'string' ? e.space : null,
  };
}

// 1 deep in the night, 0 at midday, smooth in between (dusk ~19 h, dawn ~6 h).
export function nightness(tod) {
  const h = ((Number(tod) || 0) % 24 + 24) % 24;
  // cosine with its peak at 1 am, flattened so nights read as night for longer
  const x = Math.cos(((h - 1) / 24) * Math.PI * 2);
  return c01(0.5 + 0.75 * x);
}

// The mix. `maxLayers` (from the quality tier) keeps only the loudest few on low spec.
export function ambienceLevels(envIn, { maxLayers = LAYERS.length } = {}) {
  const env = sanitizeEnv(envIn);
  const prof = DISTRICT_PROFILES[env.district] ?? DISTRICT_PROFILES.gcpd;
  const base = prof.layers;
  const night = nightness(env.timeOfDay);
  const day = 1 - night;
  const lv = {};
  for (const k of LAYERS) lv[k] = base[k] ?? 0;

  // time of day: traffic and crowds thin out at night, insects come out
  lv.traffic = env.traffic ?? lv.traffic * (0.55 + 0.45 * day);
  const nightlife = env.district === 'neon' || env.district === 'gothamMile' || env.district === 'amusementMile';
  lv.crowd = env.crowd ?? lv.crowd * (nightlife ? 0.7 + 0.3 * night : 0.35 + 0.65 * day);
  lv.insects *= night;
  lv.hum = Math.max(0.15, lv.hum);

  // weather
  const rain = env.rain ?? RAIN[env.weather] ?? 0;
  lv.rain = rain;
  lv.insects *= 1 - Math.min(1, rain * 2);
  lv.crowd *= 1 - 0.5 * rain;
  const snowing = env.weather === 'snow';
  lv.snow = snowing ? 1 : 0;
  if (snowing) { lv.traffic *= 0.6; lv.crowd *= 0.5; lv.insects = 0; }
  if (env.weather === 'fog') lv.harbour = Math.min(1, lv.harbour * 1.3 + (lv.water > 0.3 ? 0.2 : 0));

  // height: the street falls away, the wind picks up
  const alt = Math.max(0, env.altitude);
  const streetFall = 1 / (1 + alt / 35);
  lv.traffic *= streetFall;
  lv.crowd *= 1 / (1 + alt / 12);
  lv.insects *= 1 / (1 + alt / 20);
  lv.wind = env.wind ?? c01((alt - 8) / 55 + (base.wind ?? 0) * 0.5 + (env.weather === 'storm' ? 0.35 : 0));

  // indoors: the outside is through a wall
  let lowpass = 18000;
  if (env.indoors) {
    for (const k of ['traffic', 'crowd', 'water', 'harbour', 'industrial', 'insects', 'wind']) lv[k] *= 0.22;
    lv.rain *= 0.45;
    lv.roomTone = 0.5;
    lowpass = 700;
  } else {
    lowpass = snowing ? 4200 : Math.max(2200, 16000 / (1 + alt / 60));
  }

  for (const k of LAYERS) lv[k] = c01(lv[k]);
  if (maxLayers < LAYERS.length) {
    const keep = new Set(LAYERS.filter((k) => lv[k] > 0.01).sort((a, b) => lv[b] - lv[a]).slice(0, Math.max(1, maxLayers)));
    for (const k of LAYERS) if (!keep.has(k)) lv[k] = 0;
  }

  // One-shot events: about one every 7 s in a busy street at night, rarer by day, indoors and up high.
  const busy = 0.4 + 0.6 * Math.max(lv.traffic, lv.crowd, base.industrial ?? 0, base.harbour ?? 0);
  const eventRate = (0.06 + 0.1 * busy) * (0.6 + 0.4 * night) * (env.indoors ? 0.3 : 1) * streetFall;
  return { env, levels: lv, lowpass, eventRate, events: prof.events, night };
}

// Picks the next one-shot event. rng: () => 0..1. Returns { kind, delay, distance, azimuth } where
// delay is seconds from now (exponential, so the city never ticks like a metronome), distance in
// metres and azimuth in radians around the listener.
export function nextAmbientEvent(mix, rng = Math.random) {
  const ev = mix.events ?? {};
  const night = mix.night ?? 0.5;
  const weights = [];
  let total = 0;
  for (const k of AMBIENT_EVENTS) {
    let w = ev[k] ?? 0;
    if (k === 'owl') w *= night;
    if (k === 'jazzDoor' || k === 'shout' || k === 'glass') w *= 0.5 + night;
    if (k === 'calliope') w *= 1 - 0.5 * night;
    if (w > 0) { weights.push([k, w]); total += w; }
  }
  const rate = Math.max(0.005, mix.eventRate ?? 0.1);
  const delay = Math.min(60, -Math.log(1 - Math.min(0.999, rng())) / rate);
  if (!total) return { kind: null, delay, distance: 0, azimuth: 0 };
  let r = rng() * total;
  let kind = weights[weights.length - 1][0];
  for (const [k, w] of weights) { if ((r -= w) <= 0) { kind = k; break; } }
  const far = kind === 'foghorn' || kind === 'elTrain' || kind === 'sirenPass' || kind === 'bridgeBell';
  const distance = far ? 80 + rng() * 260 : 18 + rng() * 70;
  return { kind, delay, distance, azimuth: rng() * Math.PI * 2 };
}
