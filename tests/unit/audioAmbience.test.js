import { describe, it, expect } from 'vitest';
import { ambienceLevels, nextAmbientEvent, sanitizeEnv, nightness, LAYERS, DISTRICT_PROFILES, AMBIENT_EVENTS, DEFAULT_ENV } from '../../src/audio/cityAmbience.js';
import { stepGearbox, stepTurbine, makeEngineState, firingHz, turbineHz, GEARS, IDLE_RPM } from '../../src/audio/vehicleModel.js';

const L = (env, o) => ambienceLevels(env, o).levels;
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('environment', () => {
  it('fills defaults for a missing or broken environment', () => {
    expect(sanitizeEnv(null)).toMatchObject({ district: DEFAULT_ENV.district, weather: DEFAULT_ENV.weather, indoors: false });
    expect(sanitizeEnv({ timeOfDay: 26, weather: 'hail', traffic: 4 })).toMatchObject({ timeOfDay: 2, weather: DEFAULT_ENV.weather, traffic: 1 });
  });
  it('night peaks after midnight and day at noon', () => {
    expect(nightness(1)).toBe(1);
    expect(nightness(13)).toBe(0);
    expect(nightness(19)).toBeGreaterThan(0.3);
    expect(nightness(19)).toBeLessThan(0.7);
  });
});

describe('ambience levels', () => {
  it('every layer is between 0 and 1 for every district', () => {
    for (const d of Object.keys(DISTRICT_PROFILES)) {
      const lv = L({ district: d });
      for (const k of LAYERS) { expect(lv[k]).toBeGreaterThanOrEqual(0); expect(lv[k]).toBeLessThanOrEqual(1); }
    }
  });
  it('districts have their own character', () => {
    expect(L({ district: 'docks' }).harbour).toBeGreaterThan(L({ district: 'loop' }).harbour);
    expect(L({ district: 'ace' }).industrial).toBeGreaterThan(L({ district: 'neon' }).industrial);
    expect(L({ district: 'loop', timeOfDay: 13 }).traffic).toBeGreaterThan(L({ district: 'bristol', timeOfDay: 13 }).traffic);
  });
  it('the park has insects at night but not by day or in the rain', () => {
    expect(L({ district: 'robinsonPark', timeOfDay: 1, weather: 'clear' }).insects).toBeGreaterThan(0.5);
    expect(L({ district: 'robinsonPark', timeOfDay: 13, weather: 'clear' }).insects).toBe(0);
    expect(L({ district: 'robinsonPark', timeOfDay: 1, weather: 'storm' }).insects).toBe(0);
  });
  it('traffic thins at night; nightlife districts get busier crowds at night', () => {
    expect(L({ district: 'loop', timeOfDay: 2 }).traffic).toBeLessThan(L({ district: 'loop', timeOfDay: 13 }).traffic);
    expect(L({ district: 'neon', timeOfDay: 1, weather: 'clear' }).crowd).toBeGreaterThan(L({ district: 'neon', timeOfDay: 13, weather: 'clear' }).crowd);
  });
  it('rain follows the weather, with an explicit override', () => {
    expect(L({ weather: 'clear' }).rain).toBe(0);
    expect(L({ weather: 'drizzle' }).rain).toBeLessThan(L({ weather: 'storm' }).rain);
    expect(L({ weather: 'clear', rain: 0.4 }).rain).toBe(0.4);
  });
  it('snow hushes the city and darkens it', () => {
    const snow = ambienceLevels({ district: 'loop', weather: 'snow', timeOfDay: 13 });
    const clear = ambienceLevels({ district: 'loop', weather: 'clear', timeOfDay: 13 });
    expect(snow.levels.snow).toBe(1);
    expect(snow.levels.traffic).toBeLessThan(clear.levels.traffic);
    expect(snow.lowpass).toBeLessThan(clear.lowpass);
  });
  it('height trades street noise for wind', () => {
    const street = L({ district: 'loop', altitude: 0, timeOfDay: 13, weather: 'clear' });
    const roof = L({ district: 'loop', altitude: 80, timeOfDay: 13, weather: 'clear' });
    expect(roof.wind).toBeGreaterThan(street.wind);
    expect(roof.traffic).toBeLessThan(street.traffic);
    expect(roof.crowd).toBeLessThan(street.crowd);
  });
  it('indoors muffles the outside and adds room tone', () => {
    const inside = ambienceLevels({ district: 'loop', indoors: true });
    const out = ambienceLevels({ district: 'loop', indoors: false });
    expect(inside.levels.traffic).toBeLessThan(out.levels.traffic);
    expect(inside.levels.roomTone).toBeGreaterThan(0);
    expect(inside.lowpass).toBeLessThan(1000);
    expect(inside.eventRate).toBeLessThan(out.eventRate);
  });
  it('density overrides win over the district character', () => {
    expect(L({ district: 'bristol', traffic: 0.9 }).traffic).toBeCloseTo(0.9, 6);
  });
  it('low spec keeps only the loudest few layers', () => {
    const lv = L({ district: 'docks', weather: 'rain' }, { maxLayers: 2 });
    expect(LAYERS.filter((k) => lv[k] > 0).length).toBeLessThanOrEqual(2);
  });
});

describe('ambient one-shots', () => {
  it('picks only events the district allows, after a positive delay', () => {
    const mix = ambienceLevels({ district: 'docks', timeOfDay: 1 });
    const rng = seq([0.3, 0.1, 0.5, 0.9, 0.7, 0.2]);
    for (let i = 0; i < 20; i++) {
      const e = nextAmbientEvent(mix, rng);
      expect(e.delay).toBeGreaterThan(0);
      expect(Object.keys(DISTRICT_PROFILES.docks.events)).toContain(e.kind);
      expect(e.distance).toBeGreaterThan(0);
    }
  });
  it('is rarer indoors (longer average delay)', () => {
    const avg = (env) => { const m = ambienceLevels(env); let s = 0; const rng = seq([0.5, 0.2, 0.8, 0.4]); for (let i = 0; i < 40; i++) s += nextAmbientEvent(m, rng).delay; return s / 40; };
    expect(avg({ district: 'loop', indoors: true })).toBeGreaterThan(avg({ district: 'loop', indoors: false }));
  });
  it('every event a district names is a known event', () => {
    for (const p of Object.values(DISTRICT_PROFILES)) for (const k of Object.keys(p.events)) expect(AMBIENT_EVENTS).toContain(k);
  });
});

describe('vehicle engine models', () => {
  it('the gearbox climbs through the gears as speed rises and keeps rpm in range', () => {
    const s = makeEngineState();
    let maxGear = 0, shifts = 0;
    for (let i = 0; i <= 600; i++) {
      stepGearbox(s, i / 600, { throttle: 1, dt: 1 / 60 });
      if (s.shifted) shifts++;
      maxGear = Math.max(maxGear, s.gear);
      expect(s.rpm).toBeGreaterThanOrEqual(0.05);
      expect(s.rpm).toBeLessThanOrEqual(1.05);
    }
    expect(maxGear).toBe(GEARS.car.length - 1);
    expect(shifts).toBeGreaterThanOrEqual(GEARS.car.length - 1);
  });
  it('downshifts when slowing and idles when stopped', () => {
    const s = makeEngineState();
    for (let i = 0; i < 300; i++) stepGearbox(s, 0.9, { dt: 1 / 60 });
    const top = s.gear;
    for (let i = 0; i < 300; i++) stepGearbox(s, 0, { throttle: 0, dt: 1 / 60 });
    expect(s.gear).toBeLessThan(top);
    expect(s.rpm).toBeLessThan(IDLE_RPM + 0.1);
  });
  it('the turbine spools up slower than it winds down, and boost pins it', () => {
    const s = makeEngineState();
    stepTurbine(s, 0, { throttle: 1, dt: 0.25 });
    const up = s.spool;
    const t = makeEngineState(); t.spool = 1;
    stepTurbine(t, 0, { throttle: 0, dt: 0.25 });
    expect(1 - t.spool).toBeGreaterThan(up);
    const b = makeEngineState();
    for (let i = 0; i < 200; i++) stepTurbine(b, 0.2, { boost: true, dt: 1 / 60 });
    expect(b.spool).toBeGreaterThan(0.95);
  });
  it('pitches rise with rpm', () => {
    expect(firingHz(1)).toBeGreaterThan(firingHz(0.2));
    expect(turbineHz(1)).toBeGreaterThan(turbineHz(0));
    expect(turbineHz(1, 'wing')).not.toBe(turbineHz(1));
  });
});
