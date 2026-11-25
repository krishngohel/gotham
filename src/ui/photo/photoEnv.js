// Time-of-day and weather overrides for photo mode (workstream L1, item 7). DOM-free.
//
// world.clock and world.weather belong to workstream M (design 4.5) and may not exist yet, so
// everything is feature-detected: a missing object, or one without a way to set it, simply turns
// the control off. What is changed is put back exactly on restore().
//
// Shapes understood (any one is enough):
//   clock:   pin(h) / unpin()  |  set(h)  |  a writable `hour`;  read from `hour` or get()
//            optional `pinned` (a pinned hour or null) is restored as it was.
//   weather: set(name) | force(name) | a writable `state`; read from `state`, `current` or get();
//            the choices from `states` / `kinds` (array) or the design list.

export const WEATHER_DEFAULT = ['clear', 'drizzle', 'rain', 'storm', 'fog', 'snow'];
const isFn = (f) => typeof f === 'function';
const wrapHour = (h) => ((h % 24) + 24) % 24;

function readHour(c) {
  try {
    if (typeof c.hour === 'number') return c.hour;
    if (isFn(c.get)) { const v = c.get(); if (typeof v === 'number') return v; }
    if (typeof c.time === 'number') return c.time;
  } catch { /* a getter that throws: no clock */ }
  return null;
}
function readWeather(w) {
  try {
    if (typeof w.state === 'string') return w.state;
    if (typeof w.current === 'string') return w.current;
    if (w.state && typeof w.state.name === 'string') return w.state.name;
    if (isFn(w.get)) { const v = w.get(); if (typeof v === 'string') return v; }
  } catch { /* nothing readable */ }
  return null;
}

export function createEnvOverride(world) {
  const clock = world?.clock ?? null;
  const weather = world?.weather ?? null;
  const clockOk = !!clock && readHour(clock) !== null && (isFn(clock.pin) || isFn(clock.set) || Object.getOwnPropertyDescriptor(clock, 'hour')?.writable === true || !!Object.getOwnPropertyDescriptor(clock, 'hour')?.set);
  const weatherOk = !!weather && readWeather(weather) !== null && (isFn(weather.set) || isFn(weather.force) || typeof weather.state === 'string');
  let saved = null;

  function save() {
    if (saved) return;
    saved = {
      hour: clockOk ? readHour(clock) : null,
      pinned: clockOk && 'pinned' in clock ? clock.pinned : undefined,
      weather: weatherOk ? readWeather(weather) : null,
      touchedClock: false, touchedWeather: false,
    };
  }
  function writeHour(h) {
    if (isFn(clock.pin)) clock.pin(h);
    else if (isFn(clock.set)) clock.set(h);
    else clock.hour = h;
  }
  function writeWeather(name) {
    if (isFn(weather.set)) weather.set(name);
    else if (isFn(weather.force)) weather.force(name);
    else weather.state = name;
  }

  return {
    get hasClock() { return clockOk; },
    get hasWeather() { return weatherOk; },
    get hour() { return clockOk ? readHour(clock) : null; },
    get weather() { return weatherOk ? readWeather(weather) : null; },
    weatherChoices() {
      const l = weather?.states ?? weather?.kinds;
      return Array.isArray(l) && l.length ? l.filter((s) => typeof s === 'string') : WEATHER_DEFAULT;
    },
    setHour(h) {
      if (!clockOk) return false;
      save();
      try { writeHour(wrapHour(h)); saved.touchedClock = true; return true; } catch { return false; }
    },
    setWeather(name) {
      if (!weatherOk) return false;
      save();
      try { writeWeather(name); saved.touchedWeather = true; return true; } catch { return false; }
    },
    // Puts back whatever was there when the first override was made.
    restore() {
      if (!saved) return;
      const s = saved;
      saved = null;
      try {
        if (s.touchedClock) {
          if (!isFn(clock.pin)) writeHour(s.hour);
          else if (typeof s.pinned === 'number') clock.pin(s.pinned);
          else if (isFn(clock.unpin)) { clock.unpin(); if (readHour(clock) !== s.hour && isFn(clock.set)) clock.set(s.hour); }
          else clock.pin(s.hour);
        }
      } catch { /* best effort */ }
      try { if (s.touchedWeather) writeWeather(s.weather); } catch { /* best effort */ }
    },
  };
}
