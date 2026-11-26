// world.clock: the city's time of day (design doc 4.5). Pure, no three.js.
//
// Game time is one number, `abs`: hours since midnight of day 0 (hour = abs mod 24, day =
// floor(abs / 24)). That number is the whole network state: the host broadcasts `clock.value`,
// a guest calls `clock.sync(value)` (workstream D2). Between syncs both advance it the same way.
//
// Nights are long and days short: a real-time day lasts `dayMinutes` (48 by default) and the
// dusk-to-dawn span takes `nightShare` (0.7) of it, so game hours run slower at night. Advancing is
// analytic (hoursAfter), so `abs` is a pure function of where it started and the real seconds
// played since: deterministic from a seed (the start) plus elapsed play time.
//
// Story steps and cutscenes pin the clock (workstream J1): `pin(hour, { id })` shows that hour and
// stops the clock until `unpin(id)`; pins stack, the newest wins, and the clock resumes from where
// it was. `pause()` stops it without changing the hour. `skipTo(hour)` is resting (to the next time
// the clock reads that hour). Shape shared with workstream K's adapter: hour, day, pause(), pin().

export const CLOCK_DEFAULTS = Object.freeze({ startHour: 23, day: 0, dayMinutes: 48, nightShare: 0.7, dawn: 6, dusk: 19 });

const mod24 = (h) => ((h % 24) + 24) % 24;

// Is hour h in the night span [dusk, dawn) (wrapping midnight)?
export function isNightHour(h, { dawn = 6, dusk = 19 } = {}) {
  const x = mod24(h);
  return dusk > dawn ? x >= dusk || x < dawn : x >= dusk && x < dawn;
}

// Game hours per real second at night and by day for a configuration.
export function clockRates({ dayMinutes = 48, nightShare = 0.7, dawn = 6, dusk = 19 } = {}) {
  const nightHours = mod24(dawn - dusk) || 24;
  const dayHours = 24 - nightHours;
  const secs = dayMinutes * 60;
  const share = Math.min(0.98, Math.max(0.02, nightShare));
  return { night: nightHours / (secs * share), day: dayHours / (secs * (1 - share)), nightHours, dayHours };
}

// abs after `seconds` of real time from `abs0`, crossing dawn and dusk exactly. Pure.
export function hoursAfter(abs0, seconds, cfg = CLOCK_DEFAULTS) {
  const { dawn = 6, dusk = 19 } = cfg;
  const rates = clockRates(cfg);
  let abs = abs0, left = Math.max(0, seconds);
  for (let guard = 0; left > 1e-9 && guard < 1000; guard++) {
    const h = mod24(abs);
    const night = isNightHour(h, cfg);
    const rate = night ? rates.night : rates.day;
    // Hours to the next boundary (dawn if night, dusk if day).
    const edge = night ? dawn : dusk;
    let toEdge = mod24(edge - h);
    if (toEdge < 1e-9) toEdge = 24;
    const need = toEdge / rate;
    if (need >= left) { abs += left * rate; left = 0; } else { abs += toEdge; left -= need; }
  }
  return abs;
}

// Real seconds it takes the running clock to go from abs0 to abs1 (abs1 >= abs0). Pure.
export function secondsBetween(abs0, abs1, cfg = CLOCK_DEFAULTS) {
  const { dawn = 6, dusk = 19 } = cfg;
  const rates = clockRates(cfg);
  let abs = abs0, secs = 0;
  for (let guard = 0; abs1 - abs > 1e-9 && guard < 1000; guard++) {
    const h = mod24(abs);
    const night = isNightHour(h, cfg);
    let toEdge = mod24((night ? dawn : dusk) - h);
    if (toEdge < 1e-9) toEdge = 24;
    const step = Math.min(toEdge, abs1 - abs);
    secs += step / (night ? rates.night : rates.day);
    abs += step;
  }
  return secs;
}

// Sun height for an hour: -1 at midnight, 1 at noon, 0 at dawn and dusk (a smooth curve through
// the configured dawn/dusk, so a short day still peaks at noon). Pure.
export function sunHeight(h, { dawn = 6, dusk = 19 } = {}) {
  const x = mod24(h);
  if (!isNightHour(x, { dawn, dusk })) {
    const t = (x - dawn) / (dusk - dawn); // 0..1 across the day
    return Math.sin(t * Math.PI);
  }
  const span = mod24(dawn - dusk);
  const t = mod24(x - dusk) / span; // 0..1 across the night
  return -Math.sin(t * Math.PI);
}

// 0 at night, 1 in full day, ramping over `twilight` hours either side of dawn and dusk. Pure.
export function daylight(h, { dawn = 6, dusk = 19, twilight = 1.2 } = {}) {
  const x = mod24(h);
  // Signed hours to the nearest of dawn and dusk: positive inside the day, negative at night.
  const v = isNightHour(x, { dawn, dusk }) ? -Math.min(mod24(x - dusk), mod24(dawn - x)) : Math.min(x - dawn, dusk - x);
  return Math.min(1, Math.max(0, v / twilight + 0.5));
}

export function createClock(opts = {}) {
  const cfg = { ...CLOCK_DEFAULTS, ...opts };
  let base = (cfg.day ?? 0) * 24 + mod24(cfg.startHour);
  let elapsed = 0; // real seconds run since `base` was set
  let abs = base;
  let paused = false;
  const pins = []; // [{ id, hour, day }]
  const listeners = new Set();

  const rebase = (v) => { base = v; elapsed = 0; abs = v; };
  const shown = () => (pins.length ? pins[pins.length - 1].hour : mod24(abs));

  const clock = {
    config: cfg,
    // The visible hour, 0..24 (a pin's hour while pinned).
    get hour() { return shown(); },
    get hours() { return shown(); }, // alias read by the audio environment (sound.js)
    get day() { return Math.floor(abs / 24); },
    get minutes() { return Math.floor((shown() % 1) * 60); },
    // The single number for network sync and saves.
    get value() { return abs; },
    get paused() { return paused; },
    get pinned() { return pins.length > 0; },
    get pinId() { return pins.length ? pins[pins.length - 1].id : null; },
    get night() { return isNightHour(shown(), cfg); },
    get daylight() { return daylight(shown(), cfg); },
    get sun() { return sunHeight(shown(), cfg); },
    get rate() { return isNightHour(mod24(abs), cfg) ? clockRates(cfg).night : clockRates(cfg).day; },
    // Advance by real seconds (frozen while paused or pinned).
    update(realDt) {
      if (paused || pins.length || !(realDt > 0)) return;
      elapsed += realDt;
      abs = hoursAfter(base, elapsed, cfg);
      // Re-anchor now and then so the analytic walk stays short.
      if (elapsed > 600) rebase(abs);
    },
    pause() { paused = true; },
    resume() { paused = false; },
    // pin(hour, { id }) -> id. The hour shows until unpin(id).
    // [fix1] { under: true }: a standing preference (Gameplay > Time of day 'Always night') goes
    // beneath every other pin, so a story night or a Bruce day still shows its own hour over it.
    pin(hour, { id = 'pin', under = false } = {}) {
      const i = pins.findIndex((p) => p.id === id);
      if (i >= 0) pins.splice(i, 1);
      if (under) pins.unshift({ id, hour: mod24(hour) }); else pins.push({ id, hour: mod24(hour) });
      return id;
    },
    // [fix1] Pins other than the given ids (the story's or a scene's hold on the hour).
    heldBy(except = []) { return pins.filter((p) => !except.includes(p.id)).map((p) => p.id); },
    unpin(id = null) {
      if (id === null) { pins.length = 0; return; }
      const i = pins.findIndex((p) => p.id === id);
      if (i >= 0) pins.splice(i, 1);
    },
    // Set the time directly (debug, ?time=, a loaded save). Keeps the day unless given.
    set(hour, day = Math.floor(abs / 24)) { rebase(day * 24 + mod24(hour)); emit('set'); },
    // Rest: run forward to the next time the clock reads `hour` (at least `minHours` ahead).
    skipTo(hour, { minHours = 0.01 } = {}) {
      let d = mod24(hour - mod24(abs));
      if (d < minHours) d += 24;
      rebase(abs + d);
      emit('skip');
      return d;
    },
    skip(hours) { if (hours > 0) { rebase(abs + hours); emit('skip'); } },
    // Network: adopt the host's number (only moves forward unless `force`).
    sync(value, { force = false } = {}) {
      if (!Number.isFinite(value)) return;
      if (force || Math.abs(value - abs) > 1e-4) rebase(value);
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Saves: { abs } is enough.
    save() { return { abs }; },
    load(s) { if (s && Number.isFinite(s.abs)) rebase(s.abs); },
  };
  function emit(kind) { for (const fn of listeners) fn(kind, clock); }
  return clock;
}
