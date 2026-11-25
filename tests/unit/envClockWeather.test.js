import { describe, it, expect } from 'vitest';
import { createClock, hoursAfter, secondsBetween, clockRates, isNightHour, daylight, sunHeight } from '../../src/env/clock.js';
import { createWeather, WEATHER_STATES, TRANSITIONS, WEATHER_PARAMS, scheduleState, nextState, normalizeState } from '../../src/env/weather.js';
import { deriveEnvironment, makeEnvironment, visibilityOf } from '../../src/env/environment.js';
import { lookAtHour, applyWeather, makeLook, NIGHT, keyDirection, gradePalette, KEYFRAMES } from '../../src/env/look.js';

describe('world.clock', () => {
  it('a day takes dayMinutes of real time, 70% of it from dusk to dawn', () => {
    const cfg = { dayMinutes: 48, nightShare: 0.7, dawn: 6, dusk: 19 };
    expect(secondsBetween(0, 24, cfg)).toBeCloseTo(48 * 60, 3);
    expect(secondsBetween(19, 30, cfg)).toBeCloseTo(48 * 60 * 0.7, 3);
    expect(secondsBetween(6, 19, cfg)).toBeCloseTo(48 * 60 * 0.3, 3);
    const r = clockRates(cfg);
    expect(r.night).toBeLessThan(r.day); // nights are long
  });
  it('hoursAfter is the inverse of secondsBetween and crosses dawn and dusk exactly', () => {
    for (const start of [0, 5.9, 6, 12, 18.99, 23.5, 47.2]) {
      for (const secs of [1, 100, 1000, 2880, 9000]) {
        const end = hoursAfter(start, secs);
        expect(secondsBetween(start, end)).toBeCloseTo(secs, 2);
      }
    }
  });
  it('is deterministic from a start plus elapsed play time, whatever the frame steps', () => {
    const a = createClock({ startHour: 21 }), b = createClock({ startHour: 21 });
    for (let i = 0; i < 6000; i++) a.update(1 / 60);
    for (let i = 0; i < 100; i++) b.update(1);
    expect(a.value).toBeCloseTo(b.value, 6);
    expect(a.value).toBeCloseTo(hoursAfter(21, 100), 6);
  });
  it('pauses, pins (stacked, newest wins) and resumes where it was', () => {
    const c = createClock({ startHour: 22 });
    c.pause(); c.update(100); expect(c.hour).toBe(22); c.resume();
    c.pin(13, { id: 'story' });
    c.pin(2, { id: 'cut' });
    expect(c.hour).toBe(2);
    c.update(500);
    expect(c.value).toBe(22); // frozen while pinned
    c.unpin('cut'); expect(c.hour).toBe(13);
    c.unpin('story'); expect(c.hour).toBe(22);
    c.update(10); expect(c.hour).toBeGreaterThan(22);
  });
  it('skipTo rests to the next occurrence of an hour; sync adopts the host number', () => {
    const c = createClock({ startHour: 23 });
    c.skipTo(8);
    expect(c.hour).toBeCloseTo(8, 6); expect(c.day).toBe(1);
    c.skipTo(8); expect(c.day).toBe(2); // the next 8:00, not now
    const g = createClock({ startHour: 0 });
    g.sync(c.value); expect(g.value).toBe(c.value);
    const s = c.save(); const d = createClock(); d.load(s); expect(d.value).toBe(c.value);
  });
  it('day/night helpers', () => {
    expect(isNightHour(23)).toBe(true); expect(isNightHour(3)).toBe(true); expect(isNightHour(12)).toBe(false);
    expect(daylight(12)).toBe(1); expect(daylight(0)).toBe(0); expect(daylight(6)).toBeCloseTo(0.5, 5);
    expect(sunHeight(12.5)).toBeCloseTo(1, 5); expect(sunHeight(0.5)).toBeCloseTo(-1, 5);
  });
});

describe('world.weather', () => {
  it('every transition row is a distribution over known states', () => {
    for (const [from, row] of Object.entries(TRANSITIONS)) {
      expect(WEATHER_STATES).toContain(from);
      let sum = 0;
      for (const [to, p] of Object.entries(row)) { expect(WEATHER_STATES).toContain(to); sum += p; }
      expect(sum).toBeCloseTo(1, 6);
    }
    for (const s of WEATHER_STATES) expect(WEATHER_PARAMS[s]).toBeTruthy();
    expect(normalizeState('thunderstorm')).toBe('storm');
  });
  it('the schedule is a pure function of seed and clock: two worlds agree', () => {
    const c1 = createClock({ startHour: 23 }), c2 = createClock({ startHour: 23 });
    const w1 = createWeather({ seed: 99, clock: c1 }), w2 = createWeather({ seed: 99, clock: c2 });
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      c1.skip(1.3); c2.sync(c1.value);
      expect(w1.state).toBe(w2.state);
      seen.add(w1.state);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4); // it really changes
    expect(scheduleState(99, 0)).toBe('storm');
  });
  it('transitions are gradual and wetness builds and dries', () => {
    const c = createClock({ startHour: 12 });
    const w = createWeather({ seed: 1, start: 'clear', clock: c });
    w.snap();
    expect(w.rain).toBe(0);
    w.pin('storm', { id: 't' });
    w.update(1);
    expect(w.rain).toBeGreaterThan(0); expect(w.rain).toBeLessThan(0.1);
    for (let i = 0; i < 300; i++) w.update(1);
    expect(w.rain).toBeGreaterThan(0.95);
    expect(w.wetness).toBe(1);
    expect(w.traction).toBeLessThan(0.9);
    w.unpin('t'); w.pin('clear', { id: 'dry' });
    for (let i = 0; i < 400; i++) w.update(1);
    expect(w.wetness).toBeLessThan(0.5);
  });
  it('snow settles and cuts traction; lightning strikes only with a storm', () => {
    const w = createWeather({ seed: 3, start: 'snow' });
    w.snap();
    const strikes = [];
    w.on((s) => strikes.push(s));
    for (let i = 0; i < 200; i++) w.update(1);
    expect(w.snowCover).toBeGreaterThan(0.9);
    expect(w.traction).toBeLessThan(0.65);
    expect(strikes.length).toBe(0);
    w.pin('storm', { snap: true });
    for (let i = 0; i < 120; i++) w.update(1);
    expect(strikes.length).toBeGreaterThan(3);
    for (const s of strikes) { expect(s.distance).toBeGreaterThan(200); expect(s.kind).toBe('lightning'); }
  });
  it('forecast lists the next slots; lake effect thickens fog near the lake', () => {
    const c = createClock({ startHour: 23 });
    const w = createWeather({ seed: 5, clock: c, lakes: [{ minX: 500, maxX: 900, minZ: -800, maxZ: 0 }] });
    const f = w.forecast(3);
    expect(f.length).toBe(3);
    expect(f[0].inHours).toBeGreaterThan(0);
    w.pin('fog', { snap: true });
    const near = w.localAt(480, -200), far = w.localAt(-600, 300);
    expect(near.fog).toBeGreaterThanOrEqual(far.fog);
    expect(near.fog).toBeLessThanOrEqual(1);
  });
  it('nextState honours the snow scale (0 = never snow)', () => {
    for (let i = 0; i < 1000; i++) expect(nextState('overcast', i / 1000, { snowScale: 0 })).not.toBe('snow');
  });
});

describe('environment object', () => {
  it('derives every field, with night and weather cutting visibility', () => {
    const clock = createClock({ startHour: 12 });
    const weather = createWeather({ seed: 2, start: 'clear', clock });
    weather.snap();
    const env = deriveEnvironment({ clock, weather, district: 'loop', altitude: 12, t: 3 }, makeEnvironment());
    for (const k of ['district', 'timeOfDay', 'weather', 'rain', 'snow', 'wetness', 'wind', 'indoors', 'altitude', 'traffic', 'crowd', 'space', 'visibility']) expect(k in env).toBe(true);
    expect(env.district).toBe('loop');
    expect(env.night).toBe(false);
    const dayVis = env.visibility;
    clock.set(1);
    weather.pin('fog', { snap: true });
    deriveEnvironment({ clock, weather }, env);
    expect(env.night).toBe(true);
    expect(env.visibility).toBeLessThan(dayVis * 0.6);
    deriveEnvironment({ clock, weather, indoors: true }, env);
    expect(env.visibility).toBe(1); expect(env.rain).toBe(0);
    expect(visibilityOf(1, 0, 0, 0)).toBe(1);
  });
});

describe('look tables', () => {
  it('the night is exactly the old constants (Night One unchanged)', () => {
    const o = lookAtHour(23, makeLook());
    expect(o.keyI).toBe(2.4); expect(o.hemiI).toBe(0.75); expect(o.rimI).toBe(1.1); expect(o.fogMul).toBe(1);
    expect(o.fog).toEqual(NIGHT.fog);
    applyWeather(o, WEATHER_PARAMS.storm, 0, 0);
    expect(o.keyI).toBeCloseTo(2.4, 9); expect(o.fogMul).toBeCloseTo(1, 9); expect(o.cloudCut).toBeCloseTo(0.52, 9);
    expect(o.fog[0]).toBeCloseTo(NIGHT.fog[0], 9);
    const d = keyDirection(23, false);
    const L = Math.hypot(-30, 60, 22);
    expect(d[0]).toBeCloseTo(-30 / L, 6); expect(d[1]).toBeCloseTo(60 / L, 6); expect(d[2]).toBeCloseTo(22 / L, 6);
  });
  it('day is brighter than night; key frames are sorted; the sun rises east and sets west', () => {
    const n = lookAtHour(2), d = lookAtHour(12);
    expect(d.hemiI).toBeGreaterThan(n.hemiI);
    expect(d.fog[0] + d.fog[1] + d.fog[2]).toBeGreaterThan(n.fog[0] + n.fog[1] + n.fog[2]);
    for (let i = 1; i < KEYFRAMES.length; i++) expect(KEYFRAMES[i][0]).toBeGreaterThan(KEYFRAMES[i - 1][0]);
    expect(keyDirection(7, true)[0]).toBeGreaterThan(0.5);
    expect(keyDirection(18.5, true)[0]).toBeLessThan(-0.5);
    expect(keyDirection(12.5, true)[1]).toBeGreaterThan(0.6);
  });
  it('fog makes the air denser and paler; the palette grade leaves the night alone', () => {
    const a = applyWeather(lookAtHour(2), WEATHER_PARAMS.fog, 0, 0);
    expect(a.fogMul).toBeGreaterThan(2);
    const pal = Array.from({ length: 18 }, (_, i) => (i % 3) / 3);
    const copy = pal.slice();
    gradePalette(pal, 0, 0);
    expect(pal).toEqual(copy);
    gradePalette(pal, 1, 0);
    expect(pal).not.toEqual(copy);
  });
});
