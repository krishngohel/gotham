// world.weather: a state machine with gradual transitions and a forecast (design doc 4.5).
// Pure, no three.js.
//
// The schedule is a Markov chain over fixed slots of game time (`slotHours`, 2 h): the state of
// slot k is drawn from slot k-1's row of TRANSITIONS with a hash of (seed, k). So the weather at
// any moment is a pure function of the weather seed and the clock's number: a network guest with
// the same seed and clock value sees the same sky (workstream D2 sends only those two numbers).
// The visible parameters (`params`: rain, snow, fog, cloud, wind, lightning) follow the scheduled
// (or pinned) state smoothly in real time, so a change of state is a gradual transition. Wetness
// and snow cover build up and dry off over time from those parameters.
//
// Story steps pin the weather (workstream J1): `pin('storm', { id })` until `unpin(id)`.
//
// Gameplay values other systems read (every one 0..1):
//   visibility  how far one sees in this weather (stealth reads environment.visibility, which also
//               counts the night)        traction  tyre grip on the street (vehicles)
//   gust(t)     wind gust strength now (gliding)   wetness, snowCover   the street surface

export const WEATHER_STATES = ['clear', 'overcast', 'drizzle', 'rain', 'storm', 'fog', 'snow'];
const ALIAS = { thunderstorm: 'storm', thunder: 'storm', mist: 'fog', cloudy: 'overcast' };
export const normalizeState = (s) => (WEATHER_STATES.includes(s) ? s : ALIAS[s] ?? null);

// What each state looks like. lightning: strikes per minute.
export const WEATHER_PARAMS = {
  clear: { rain: 0, snow: 0, fog: 0, cloud: 0.25, wind: 0.2, lightning: 0 },
  overcast: { rain: 0, snow: 0, fog: 0.15, cloud: 0.85, wind: 0.3, lightning: 0 },
  drizzle: { rain: 0.3, snow: 0, fog: 0.15, cloud: 0.9, wind: 0.3, lightning: 0 },
  rain: { rain: 0.75, snow: 0, fog: 0.1, cloud: 1, wind: 0.45, lightning: 0 },
  storm: { rain: 1, snow: 0, fog: 0.1, cloud: 1, wind: 0.8, lightning: 4 },
  fog: { rain: 0, snow: 0, fog: 1, cloud: 0.7, wind: 0.05, lightning: 0 },
  snow: { rain: 0, snow: 0.8, fog: 0.25, cloud: 1, wind: 0.35, lightning: 0 },
};
const KEYS = ['rain', 'snow', 'fog', 'cloud', 'wind', 'lightning'];

// Gotham's weather: gloomy, wet, sometimes foggy; snow is rare unless the season says so.
export const TRANSITIONS = {
  clear: { clear: 0.3, overcast: 0.5, fog: 0.2 },
  overcast: { overcast: 0.3, clear: 0.12, drizzle: 0.3, fog: 0.16, snow: 0.06, rain: 0.06 },
  drizzle: { drizzle: 0.25, rain: 0.4, overcast: 0.3, fog: 0.05 },
  rain: { rain: 0.35, storm: 0.25, drizzle: 0.3, overcast: 0.1 },
  storm: { storm: 0.3, rain: 0.6, drizzle: 0.1 },
  fog: { fog: 0.35, overcast: 0.4, drizzle: 0.25 },
  snow: { snow: 0.5, overcast: 0.4, fog: 0.1 },
};

// A 32-bit integer hash to [0, 1).
export function hash01(a, b = 0) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Pick the next state from a transition row with r in [0, 1). snowScale scales snow's weight.
export function nextState(from, r, { snowScale = 1 } = {}) {
  const row = TRANSITIONS[from] ?? TRANSITIONS.overcast;
  let total = 0;
  for (const k in row) total += row[k] * (k === 'snow' ? snowScale : 1);
  let x = r * total;
  for (const k in row) { x -= row[k] * (k === 'snow' ? snowScale : 1); if (x <= 0) return k; }
  return from;
}

// The scheduled state of slot k for a seed (slot 0 is `start`). Pure; memoised by the caller.
export function scheduleState(seed, k, { start = 'storm', snowScale = 1 } = {}) {
  let s = start;
  for (let i = 1; i <= k; i++) s = nextState(s, hash01(seed, i), { snowScale });
  return s;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Distance from (x, z) to a rectangle (0 inside).
const rectDist = (r, x, z) => Math.hypot(Math.max(r.minX - x, 0, x - r.maxX), Math.max(r.minZ - z, 0, z - r.maxZ));

export function createWeather({ seed = 7, start = 'storm', slotHours = 2, transitionSeconds = 45, snowScale = 1, lakes = [], clock = null } = {}) {
  const startSlotState = normalizeState(start) ?? 'storm';
  const params = { ...WEATHER_PARAMS[startSlotState] };
  const target = { ...params };
  const pins = []; // [{ id, state }]
  const listeners = new Set();
  let wetness = params.rain > 0.2 ? 1 : 0;
  let snowCover = params.snow > 0.2 ? 0.6 : 0;
  let strikeIn = 4;
  let strikeN = 0;
  let windDir = hash01(seed, 999) * Math.PI * 2;
  let time = 0;
  // The slot index whose state is cached, and its state (walked forward incrementally).
  let memoK = 0, memoS = startSlotState;
  let anchor = clock ? Math.floor(clock.value / slotHours) : 0; // slot 0 = the slot the clock starts in

  function slotState(k) {
    if (k < memoK) { memoK = 0; memoS = startSlotState; }
    while (memoK < k) { memoK++; memoS = nextState(memoS, hash01(seed, memoK), { snowScale }); }
    return memoS;
  }
  const slotOf = (abs) => Math.max(0, Math.floor(abs / slotHours) - anchor);
  const scheduled = () => (clock ? slotState(slotOf(clock.value)) : startSlotState);

  const weather = {
    params,
    get state() { return pins.length ? pins[pins.length - 1].state : scheduled(); },
    get scheduled() { return scheduled(); },
    get pinned() { return pins.length > 0; },
    get seed() { return seed; },
    get wetness() { return wetness; },
    get snowCover() { return snowCover; },
    get rain() { return params.rain; },
    get snow() { return params.snow; },
    get fog() { return params.fog; },
    get cloud() { return params.cloud; },
    // Wind: strength 0..1 and direction (radians, the way it blows toward, in the x-z plane).
    get wind() { return params.wind; },
    get windDir() { return windDir; },
    get visibility() { return Math.max(0.15, 1 - 0.6 * params.fog - 0.22 * params.rain - 0.2 * params.snow); },
    get traction() { return Math.max(0.4, 1 - 0.18 * wetness - 0.42 * snowCover); },
    gust(t = time) {
      const n = Math.sin(t * 0.73 + seed) * 0.5 + Math.sin(t * 1.91 + seed * 3.1) * 0.3 + Math.sin(t * 4.3) * 0.2;
      return Math.max(0, params.wind * (0.55 + 0.45 * n));
    },
    // Lake effect: fog and snow are heavier near open lake water. out: { fog, snow }.
    localAt(x, z, out = { fog: 0, snow: 0 }) {
      let k = 0;
      for (let i = 0; i < lakes.length; i++) k = Math.max(k, 1 - smooth(0, 260, rectDist(lakes[i], x, z)));
      out.fog = Math.min(1, params.fog + k * (0.25 + 0.35 * params.cloud) * (params.rain > 0.6 ? 0.3 : 1));
      out.snow = Math.min(1, params.snow * (1 + 0.5 * k));
      return out;
    },
    // The next `n` scheduled slots: [{ state, inHours }] (pins aside).
    forecast(n = 4) {
      const out = [];
      if (!clock) return out;
      const abs = clock.value;
      const k0 = slotOf(abs);
      for (let i = 1; i <= n; i++) out.push({ state: slotState(k0 + i), inHours: (Math.floor(abs / slotHours) + i) * slotHours - abs });
      return out;
    },
    pin(state, { id = 'pin', snap = false } = {}) {
      const s = normalizeState(state);
      if (!s) return null;
      const i = pins.findIndex((p) => p.id === id);
      if (i >= 0) pins.splice(i, 1);
      pins.push({ id, state: s });
      if (snap) weather.snap();
      return id;
    },
    unpin(id = null) {
      if (id === null) pins.length = 0;
      else { const i = pins.findIndex((p) => p.id === id); if (i >= 0) pins.splice(i, 1); }
    },
    // Jump straight to the target look (after a time skip, a story cut, a test).
    snap() {
      const s = weather.state;
      Object.assign(params, WEATHER_PARAMS[s]);
      Object.assign(target, WEATHER_PARAMS[s]);
      if (params.rain > 0.2) wetness = Math.max(wetness, 0.9);
      if (params.snow > 0.2) snowCover = Math.max(snowCover, 0.6);
      if (params.rain === 0 && params.snow === 0) wetness = Math.min(wetness, 0.25);
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Network: a new seed (the clock is synced separately). Restarts the chain from the clock now.
    reseed(s, startState = weather.state) { seed = s >>> 0; memoK = 0; memoS = normalizeState(startState) ?? 'overcast'; anchor = clock ? Math.floor(clock.value / slotHours) : 0; },
    update(dt) {
      if (!(dt > 0)) return;
      time += dt;
      const s = weather.state;
      Object.assign(target, WEATHER_PARAMS[s]);
      const k = 1 - Math.exp(-dt / transitionSeconds);
      for (const key of KEYS) params[key] += (target[key] - params[key]) * k;
      // The street: wet in rain (fast), dries slowly; snow settles over a couple of minutes.
      if (params.rain > 0.15) wetness = Math.min(1, wetness + dt * params.rain * 0.03);
      else wetness = Math.max(0, wetness - dt * (params.fog > 0.5 ? 0.0015 : 0.004));
      if (params.snow > 0.1) snowCover = Math.min(1, snowCover + dt * params.snow * 0.008);
      else snowCover = Math.max(0, snowCover - dt * (params.rain > 0.2 ? 0.01 : 0.003));
      // Wind turns slowly.
      windDir += Math.sin(time * 0.013 + seed) * dt * 0.01;
      // Lightning: seeded strike times while the sky has it.
      // [net2] An online guest's strikes are the host's (weather.remoteStrike): none of its own.
      if (params.lightning > 0.3 && !weather.remoteStrikes) {
        strikeIn -= dt;
        if (strikeIn <= 0) {
          strikeN++;
          const r1 = hash01(seed + 77, strikeN), r2 = hash01(seed + 78, strikeN);
          strikeIn = (60 / params.lightning) * (0.45 + r1 * 1.1);
          const strike = { kind: 'lightning', distance: 250 + r2 * 2600, bearing: r1 * Math.PI * 2, n: strikeN };
          for (const fn of listeners) fn(strike);
        }
      } else strikeIn = Math.max(strikeIn, 3);
    },
    // Tests and the debug overlay: force the next strike now.
    strikeNow() { strikeIn = 0; if (params.lightning <= 0.3) { params.lightning = 1; } },
    save() { return { seed, state: weather.state, wetness, snowCover }; },
    // [net2] Online co-op: the host's strike, played here (the flash, the thunder, the HUD word).
    remoteStrikes: false,
    remoteStrike(s) { if (!s || !Number.isFinite(s.distance)) return; strikeN++; const strike = { kind: 'lightning', distance: s.distance, bearing: Number.isFinite(s.bearing) ? s.bearing : 0, n: strikeN, remote: true }; for (const fn of listeners) fn(strike); },
  };
  return weather;
}
