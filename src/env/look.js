// The look of the city by time of day and weather, as numbers (pure, no three.js). The world's
// environment system (envSystem.js) writes these into existing uniforms and light properties
// only: no light is added or removed and no shader recompiles (rendering research section 8).
//
// Colours are sRGB [r, g, b] in 0..1 (the three side sets them with SRGBColorSpace, so a key
// frame's value is exactly the hex it came from). The night key frames ARE the pre-overhaul
// constants (world.js, sky.js): at night in a storm the city looks exactly as it always did.

const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const K = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' && COLOR_KEYS.includes(k) ? rgb(v) : v]));
export const COLOR_KEYS = ['skyTop', 'skyHorizon', 'skyGlow', 'hemiSky', 'hemiGround', 'key', 'rim', 'fog', 'water'];
export const SCALAR_KEYS = ['hemiI', 'keyI', 'rimI', 'fogMul', 'lamps', 'windows', 'stars'];

// The night, exactly as world.js and sky.js set it before Long Night 2.
export const NIGHT = K({
  skyTop: 0x0e1422, skyHorizon: 0x243248, skyGlow: 0x6b4a3a, hemiSky: 0x6a7fa8, hemiGround: 0x14171f, hemiI: 0.75,
  key: 0xa9bde0, keyI: 2.4, rim: 0xcfe0ff, rimI: 1.1, fog: 0x1a2436, fogMul: 1, water: 0x152235, lamps: 1, windows: 1, stars: 1,
});

// [hour, frame]. Night holds from 21:00 to 04:30; days are short and overcast.
export const KEYFRAMES = [
  [4.5, NIGHT],
  [5.5, K({ skyTop: 0x1c2740, skyHorizon: 0x3f4d66, skyGlow: 0x8a6a5a, hemiSky: 0x7488ad, hemiGround: 0x1c1f28, hemiI: 0.85, key: 0x9fb0d8, keyI: 1.4, rim: 0xcfe0ff, rimI: 0.9, fog: 0x2c3850, fogMul: 1, water: 0x1c2a40, lamps: 1, windows: 0.8, stars: 0.4 })],
  [6.5, K({ skyTop: 0x4a5a78, skyHorizon: 0xb88a70, skyGlow: 0xe0a070, hemiSky: 0x9aa6c0, hemiGround: 0x2a2a30, hemiI: 1.15, key: 0xffc79a, keyI: 1.5, rim: 0xffd0b0, rimI: 0.7, fog: 0x6a6670, fogMul: 0.9, water: 0x3a4658, lamps: 0.55, windows: 0.5, stars: 0 })],
  [8, K({ skyTop: 0x6e7c92, skyHorizon: 0x9aa3ae, skyGlow: 0xb8b0a4, hemiSky: 0xa4b0c2, hemiGround: 0x3a3c44, hemiI: 1.5, key: 0xe8e2d4, keyI: 2.2, rim: 0xe0e6f0, rimI: 0.55, fog: 0x7f8996, fogMul: 0.8, water: 0x4a5a6c, lamps: 0, windows: 0.2, stars: 0 })],
  [12, K({ skyTop: 0x7a879a, skyHorizon: 0xa6aeb8, skyGlow: 0xc0bab0, hemiSky: 0xb0bccc, hemiGround: 0x4a4c54, hemiI: 1.7, key: 0xf2ecde, keyI: 2.4, rim: 0xe8eef6, rimI: 0.5, fog: 0x8a94a0, fogMul: 0.75, water: 0x52627a, lamps: 0, windows: 0.15, stars: 0 })],
  [16, K({ skyTop: 0x6c788c, skyHorizon: 0xa8a49c, skyGlow: 0xc8b096, hemiSky: 0xa6aec0, hemiGround: 0x44444e, hemiI: 1.5, key: 0xf0dcc0, keyI: 2.1, rim: 0xe0e6f0, rimI: 0.55, fog: 0x84868e, fogMul: 0.8, water: 0x4c5a70, lamps: 0, windows: 0.25, stars: 0 })],
  [18, K({ skyTop: 0x4e5670, skyHorizon: 0xc08a64, skyGlow: 0xe89a5a, hemiSky: 0x8e94aa, hemiGround: 0x2e2a2e, hemiI: 1.15, key: 0xffb070, keyI: 1.7, rim: 0xffc89a, rimI: 0.8, fog: 0x6a5e60, fogMul: 0.9, water: 0x3e4256, lamps: 0.45, windows: 0.6, stars: 0 })],
  [19, K({ skyTop: 0x2a3048, skyHorizon: 0x8a5a58, skyGlow: 0xd07848, hemiSky: 0x7a82a0, hemiGround: 0x1e1e26, hemiI: 0.85, key: 0xe09070, keyI: 1.0, rim: 0xd8c8e0, rimI: 1.0, fog: 0x3a3848, fogMul: 1, water: 0x262c40, lamps: 0.9, windows: 0.9, stars: 0.1 })],
  [20, K({ skyTop: 0x141c30, skyHorizon: 0x2e3a54, skyGlow: 0x7a5048, hemiSky: 0x6c80a8, hemiGround: 0x16191f, hemiI: 0.78, key: 0xa9bde0, keyI: 1.9, rim: 0xcfe0ff, rimI: 1.05, fog: 0x1e2a3e, fogMul: 1, water: 0x172438, lamps: 1, windows: 1, stars: 0.7 })],
  [21, NIGHT],
];

const lerp = (a, b, t) => a + (b - a) * t;
const mod24 = (h) => ((h % 24) + 24) % 24;

export function makeLook() {
  const o = {};
  for (const k of COLOR_KEYS) o[k] = [0, 0, 0];
  for (const k of SCALAR_KEYS) o[k] = 0;
  Object.assign(o, { day: 0, cloudCut: 0.52, sunDir: [0, -1, 0], keyDir: [0, 1, 0], keyIsSun: false, signal: 1, starsVis: 0 });
  return o;
}

// Time-of-day frame for hour h into `out` (allocates nothing).
export function lookAtHour(h, out = makeLook()) {
  const x = mod24(h);
  // Find the bracketing key frames (the list wraps from 21:00 to 04:30 through midnight).
  let a = KEYFRAMES[KEYFRAMES.length - 1], b = KEYFRAMES[0], t = 0;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (x >= KEYFRAMES[i][0] && x < KEYFRAMES[i + 1][0]) { a = KEYFRAMES[i]; b = KEYFRAMES[i + 1]; break; }
  }
  if (a !== KEYFRAMES[KEYFRAMES.length - 1]) t = (x - a[0]) / (b[0] - a[0]);
  else t = 0; // 21:00 -> 04:30: both are NIGHT
  const A = a[1], B = b[1];
  for (const k of COLOR_KEYS) for (let c = 0; c < 3; c++) out[k][c] = lerp(A[k][c], B[k][c], t);
  for (const k of SCALAR_KEYS) out[k] = lerp(A[k], B[k], t);
  return out;
}

const mixc = (c, hex, k) => { const r = rgb(hex); for (let i = 0; i < 3; i++) c[i] += (r[i] - c[i]) * k; };
// Constant targets for the weather mixes (precomputed would be nicer; these are 8 tiny arrays).

// The weather's changes on top of the hour's frame. w: { cloud, fog, rain, snow }; day 0..1;
// snowCover 0..1. With a storm's numbers (cloud 1, fog 0.1, no snow) nothing changes.
export function applyWeather(out, w, day, snowCover = 0) {
  const clearK = Math.max(0, 1 - (w.cloud ?? 1));
  const fogK = Math.max(0, ((w.fog ?? 0.1) - 0.1) / 0.9);
  const snow = w.snow ?? 0;
  const rain = w.rain ?? 0;
  // Clear skies: a brighter, bluer day and a brighter moon with stars at night.
  out.keyI *= 1 + clearK * (0.2 + 0.25 * day);
  out.hemiI *= 1 - 0.1 * clearK * day;
  if (day > 0) mixc(out.skyTop, 0x5a7aa8, 0.55 * clearK * day);
  out.starsVis = out.stars * clearK;
  // The sky shader's cloud cut-off: 0.52 (the old sky) under full cover, fewer clouds when clear.
  out.cloudCut = 0.52 + clearK * 0.22;
  // Rain dims a day (the night storm is the reference look).
  out.keyI *= 1 - 0.3 * rain * day;
  // Fog: denser, paler fog and a flatter key light.
  out.fogMul *= 1 + 3 * fogK;
  mixc(out.fog, day > 0.5 ? 0xb4b9c0 : 0x5a6680, 0.75 * fogK);
  mixc(out.skyHorizon, day > 0.5 ? 0xb4b9c0 : 0x5a6680, 0.6 * fogK);
  out.keyI *= 1 - 0.35 * fogK;
  // Snow: whiter air and a lighter bounce off the ground.
  mixc(out.fog, day > 0.5 ? 0xc8ccd4 : 0x4a5468, 0.4 * snow);
  mixc(out.hemiGround, day > 0.5 ? 0x9aa0ac : 0x3a4250, 0.6 * snowCover);
  out.fogMul *= 1 + 0.5 * snow;
  return out;
}

// Key light direction (unit vector from the target toward the light) for an hour: the moon by
// night (at 23:00 exactly the old fixed moon, (-30, 60, 22)), the sun by day, low and southern
// (an overcast late-autumn sun). x east, z south.
const MOON0 = (() => { const v = [-30, 60, 22], L = Math.hypot(...v); return v.map((c) => c / L); })();
export function keyDirection(h, sunUp, out = [0, 1, 0]) {
  const x = mod24(h);
  if (sunUp) {
    // 06:00 east, 12:30 south and highest (~48 degrees), 19:00 west.
    const t = Math.min(1, Math.max(0, (x - 6) / 13));
    const az = Math.PI * t; // 0 east -> pi west, through south
    const el = Math.max(0.12, Math.sin(Math.PI * t) * 0.84);
    out[0] = Math.cos(az) * Math.cos(el); out[1] = Math.sin(el); out[2] = Math.sin(az) * Math.cos(el);
    return out;
  }
  // The moon turns slowly about the vertical through the night, matching the old one at 23:00.
  const nightT = mod24(x - 23); // hours since 23:00 (wraps)
  const ang = ((nightT > 12 ? nightT - 24 : nightT) * 6 * Math.PI) / 180; // 6 degrees per hour
  const c = Math.cos(ang), s = Math.sin(ang);
  out[0] = MOON0[0] * c - MOON0[2] * s; out[1] = MOON0[1]; out[2] = MOON0[0] * s + MOON0[2] * c;
  return out;
}

// The per-district comic palette (6 swatches, sRGB 0..1, 18 numbers) graded by the time of day:
// by day the swatches lift toward a cool grey overcast; at dusk they warm. In place.
export function gradePalette(pal, day, warm = 0) {
  if (day <= 0 && warm <= 0) return pal;
  for (let i = 0; i < 6; i++) {
    const r = pal[i * 3], g = pal[i * 3 + 1], b = pal[i * 3 + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Day: desaturate 35% toward grey and lift; dusk: push toward amber.
    let nr = r + (L - r) * 0.35 * day, ng = g + (L - g) * 0.35 * day, nb = b + (L - b) * 0.35 * day;
    nr += (0.95 - nr) * 0.15 * warm; ng += (0.62 - ng) * 0.1 * warm; nb += (0.4 - nb) * 0.06 * warm;
    pal[i * 3] = nr; pal[i * 3 + 1] = ng; pal[i * 3 + 2] = nb;
  }
  return pal;
}
