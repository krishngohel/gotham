// The environment object (design doc 4.5): one source of truth per player/view for audio,
// traffic, civilians, AI and UI. Pure, no three.js.
//
//   { district, region, timeOfDay, day, daylight, night, weather, rain, snow, fog, wetness,
//     snowCover, wind, windDir, gust, indoors, altitude, traffic, crowd, space, visibility,
//     traction }
//
// Field meanings follow src/audio/cityAmbience.js (the audio contract): `weather` is one of
// 'clear' | 'overcast' | 'drizzle' | 'rain' | 'storm' | 'fog' | 'snow'; `traffic` and `crowd` are
// absolute 0..1 densities (null: let the district decide); `space` is a reverb override or null.
// `visibility` (0..1) is what stealth reads: night, fog, rain and snow all cut it; indoors it is 1.
// `traction` (0..1) is for vehicles: wet streets and snow cut it.

export function makeEnvironment() {
  return {
    district: 'gcpd', region: 'core', timeOfDay: 23, day: 0, daylight: 0, night: true,
    weather: 'storm', rain: 1, snow: 0, fog: 0.1, wetness: 1, snowCover: 0,
    wind: 0.8, windDir: 0, gust: 0, indoors: false, altitude: 0,
    traffic: null, crowd: null, space: null, visibility: 0.5, traction: 0.82,
  };
}

// Fills `out` (allocates nothing). src = { clock, weather, district, region, indoors, altitude,
// covered, traffic, crowd, local: { fog, snow } (the weather's lake effect at this spot), t }.
export function deriveEnvironment(src, out = makeEnvironment()) {
  const c = src.clock, w = src.weather;
  const hour = c ? c.hour : 23;
  const daylight = c ? c.daylight : 0;
  out.district = src.district ?? out.district;
  out.region = src.region ?? out.region;
  out.timeOfDay = hour;
  out.day = c ? c.day : 0;
  out.daylight = daylight;
  out.night = daylight < 0.5;
  out.weather = w ? w.state : 'storm';
  const indoors = !!src.indoors;
  const covered = !!src.covered; // under a deck or a roof: no rain on you, but still outdoors
  const fog = src.local?.fog ?? w?.fog ?? 0.1;
  const snow = src.local?.snow ?? w?.snow ?? 0;
  out.rain = indoors || covered ? 0 : w?.rain ?? 1;
  out.snow = indoors || covered ? 0 : snow;
  out.fog = indoors ? 0 : fog;
  out.wetness = w?.wetness ?? 1;
  out.snowCover = w?.snowCover ?? 0;
  out.wind = indoors ? 0 : Math.min(1, (w?.wind ?? 0.5) * (1 + Math.min(1, (src.altitude ?? 0) / 80) * 0.6));
  out.windDir = w?.windDir ?? 0;
  out.gust = indoors ? 0 : w ? w.gust(src.t ?? 0) : 0;
  out.indoors = indoors;
  out.altitude = Math.max(0, src.altitude ?? 0);
  out.traffic = src.traffic ?? null;
  out.crowd = src.crowd ?? null;
  out.space = src.space ?? null;
  out.visibility = indoors ? 1 : visibilityOf(daylight, fog, out.rain, out.snow);
  out.traction = w ? w.traction : 0.82;
  return out;
}

// How far one sees, 0..1: full daylight in clear air is 1; a clear night 0.55; fog and heavy
// rain cut it further (stealth: goons spot you from less far). Pure.
export function visibilityOf(daylight, fog, rain, snow) {
  const light = 0.55 + 0.45 * daylight;
  return Math.max(0.12, light * (1 - 0.6 * fog) * (1 - 0.22 * rain) * (1 - 0.2 * snow));
}
