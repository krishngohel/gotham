// Seeded pedestrians: a seed always gives the same person (body, build, height, skin, hair, cut,
// colours), built as one skinned mesh by figure.js. The choice tables are data so district
// palettes and schedules (workstream M) can bias them.
//
//   civilianSpec(seed, { type, body })  -> { type, body, build, cut, palette, height, width }
//   createCivilian(assets, seed, opts)  -> character (createBat shape) + ch.budget()
import { buildFigure, prepareFigure } from './figure.js';
import { cutKey, dresser } from './wardrobe.js';

// mulberry32: tiny, fast, good enough for picking clothes.
export function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, pick: (arr) => arr[Math.floor(next() * arr.length)], range: (a0, a1) => a0 + (a1 - a0) * next(), chance: (p) => next() < p };
}

export const SKIN_TONES = [0xf1c8a6, 0xe0ac86, 0xc99a7c, 0xb07b58, 0x8d5a3b, 0x6b4129, 0x4e2e1d, 0xd9b08c];
export const HAIR_COLOURS = [0x16120f, 0x2b1d14, 0x4a2e1a, 0x6e4a2a, 0x9a7444, 0xc8a46a, 0x8e2a1f, 0x9a9690, 0xd8d4cc, 0x1d1d26];
const DARK = [0x23252e, 0x2c2a33, 0x333744, 0x1e2a3c, 0x3a2f2a, 0x2e3b33, 0x41393a];
const MID = [0x4a5266, 0x5e5a52, 0x6b4f3a, 0x4b5d4a, 0x6a3a3a, 0x3f5470, 0x7a6a52, 0x5a4a66];
const BRIGHT = [0xc8323c, 0xd9a92c, 0x3d7fbf, 0x3f9e5a, 0xd06a2c, 0x8a3fa3, 0xe0d4b8, 0x2fa6a0, 0xcf6f8f];
const LIGHT = [0xe8e2d6, 0xd6dbe3, 0xefe6cf, 0xcfd7e6, 0xe3d3c0, 0xd8e6d4];
const DENIM = [0x2f4a6e, 0x3a5578, 0x283a58, 0x4a5f80];

// Each type: the cut choices (arrays are picked from) and a palette maker.
export const CIVILIAN_TYPES = {
  office: {
    cut: (r, f) => ({ top: 'shirt', sleeves: 'long', outer: r.pick(['blazer', 'blazer', null]), bottom: f && r.chance(0.5) ? 'skirt' : 'trousers', shoes: 'shoes', extras: [...(f ? [] : ['tie']), ...(r.chance(0.3) ? ['glasses'] : []), ...(r.chance(0.3) ? ['bag'] : []), ...(r.chance(0.25) ? ['lanyard'] : [])] }),
    palette: (r) => ({ top: r.pick(LIGHT), outer: r.pick(DARK), outer2: r.pick(DARK), bottom: r.pick(DARK), shoes: 0x1a1a1f, accent: r.pick(BRIGHT), bag: r.pick(MID) }),
  },
  casual: {
    cut: (r, f) => ({ top: r.pick(['tee', 'tee', 'shirt', 'sweater', 'tank']), sleeves: r.pick(['short', 'long', 'rolled']), outer: r.pick([null, null, 'jacket']), bottom: r.pick(f ? ['jeans', 'skirt', 'shorts', 'jeans'] : ['jeans', 'jeans', 'shorts', 'trousers']), shoes: r.pick(['sneakers', 'shoes', 'boots']), extras: r.chance(0.3) ? ['backpack'] : [] }),
    palette: (r) => ({ top: r.pick([...BRIGHT, ...MID, ...LIGHT]), outer: r.pick([...DARK, ...MID]), bottom: r.pick([...DENIM, ...DARK, ...MID]), shoes: r.pick([0xe8e8e8, 0x1a1a1f, 0x5a3a24]), bag: r.pick([...BRIGHT, ...DARK]) }),
  },
  worker: {
    cut: (r) => ({ top: r.pick(['tee', 'shirt']), sleeves: r.pick(['short', 'long']), outer: 'hivis', bottom: r.pick(['jeans', 'trousers']), shoes: 'boots', hat: r.pick(['hardhat', 'hardhat', 'beanie', null]), extras: ['gloves', ...(r.chance(0.3) ? ['radio'] : [])] }),
    palette: (r) => ({ top: r.pick([...MID, ...DARK]), vest: r.pick([0xe8e23a, 0xf08a24]), stripe: 0xd8dde6, bottom: r.pick([...DENIM, 0x3a3a40]), shoes: 0x4a3524, hat: r.pick([0xe8c32a, 0xeeeeee, 0xe07a1e]), hat2: 0x2a2a30, glove: 0x8a6a3a }),
  },
  chef: {
    cut: () => ({ top: 'tunic', outer: 'apron', bottom: 'trousers', shoes: 'shoes', hat: 'chef', extras: [] }),
    palette: (r) => ({ top: 0xefefe8, white: 0xf4f4ee, bottom: r.pick([0x23252e, 0x3a3a3a]), shoes: 0x1a1a1f }),
  },
  nurse: {
    cut: (r, f) => ({ top: 'tunic', bottom: 'trousers', shoes: 'sneakers', extras: ['lanyard', ...(r.chance(0.5) ? ['stethoscope'] : [])] }),
    palette: (r) => ({ top: r.pick([0x5aa6a6, 0x4a78b8, 0x7ab88a, 0xa86aa8]), bottom: 0, shoes: 0xf0f0f0, white: 0xffffff }),
    sameBottom: true,
  },
  police: {
    cut: (r) => ({ top: 'shirt', sleeves: r.pick(['long', 'short']), outer: 'tactical', bottom: 'trousers', shoes: 'boots', hat: 'police', extras: ['badge', 'radio', 'holster', 'belt'] }),
    palette: () => ({ top: 0x2c3e66, vest: 0x1e2433, bottom: 0x1e2433, shoes: 0x111116, hat: 0x1e2433, hat2: 0x111116, metal: 0xd9b84a, belt: 0x111116 }),
  },
  firefighter: {
    cut: () => ({ top: 'shirt', sleeves: 'long', outer: 'coat', bottom: 'trousers', shoes: 'boots', hat: 'fire', extras: ['gloves'] }),
    palette: (r) => ({ top: 0x3a3a30, outer: r.pick([0x8a7a4a, 0x2a2a28]), outer2: 0xd8d23a, bottom: 0x8a7a4a, shoes: 0x111116, hat: r.pick([0xc8323c, 0xe8c32a, 0x1a1a1f]), accent: 0xd9b84a, glove: 0x6a5a3a }),
  },
  vendor: {
    cut: (r) => ({ top: r.pick(['shirt', 'tee']), sleeves: 'rolled', outer: 'apron', bottom: 'trousers', shoes: 'shoes', hat: r.pick(['cap', 'beanie', null]), extras: [] }),
    palette: (r) => ({ top: r.pick([...LIGHT, ...BRIGHT]), white: r.pick([0xf0ece0, 0xd8c8a8]), bottom: r.pick(DARK), shoes: 0x2a1f18, hat: r.pick(BRIGHT), hat2: r.pick(DARK) }),
  },
  tourist: {
    cut: (r, f) => ({ top: r.pick(['tee', 'shirt']), sleeves: 'short', bottom: 'shorts', shoes: 'sneakers', hat: r.pick(['cap', null, 'cap']), extras: ['camera', ...(r.chance(0.5) ? ['backpack'] : []), ...(r.chance(0.4) ? ['sunglasses'] : [])] }),
    palette: (r) => ({ top: r.pick([...BRIGHT, 0xf4e04a, 0x7fd0e0]), bottom: r.pick([0xd8c8a0, ...DENIM, 0x6a7a5a]), shoes: 0xf0f0f0, hat: r.pick(BRIGHT), hat2: r.pick(LIGHT), bag: r.pick(MID) }),
  },
  hoodie: {
    cut: (r) => ({ top: 'tee', outer: 'hoodie', bottom: r.pick(['jeans', 'trousers']), shoes: 'sneakers', hat: r.pick([null, null, 'hood', 'beanie']), extras: [] }),
    palette: (r) => ({ top: r.pick(DARK), outer: r.pick([...MID, ...DARK, ...BRIGHT]), bottom: r.pick([...DENIM, ...DARK]), shoes: r.pick([0xe8e8e8, 0x1a1a1f]), hat: r.pick(DARK), hat2: r.pick(DARK) }),
  },
  // Evening dress (galas, the opera, Wayne Tower functions): dinner jackets and gowns.
  formal: {
    cut: (r, f) => (f
      ? { top: 'tank', outer: 'gown', bottom: 'longskirt', shoes: 'shoes', extras: r.chance(0.3) ? ['scarf'] : [] }
      : { top: 'shirt', sleeves: 'long', outer: r.pick(['tux', 'tux', 'blazer']), bottom: 'trousers', shoes: 'shoes', extras: [r.pick(['bowtie', 'bowtie', 'tie']), ...(r.chance(0.5) ? ['pocketsquare'] : [])] }),
    palette: (r) => ({ top: r.pick([0xf4f2ec, 0xeae6dc]), outer: r.pick([0x15161c, 0x15161c, 0x1e2a3c, 0x5a1a2a, 0x1f3a5a, 0x2a3a2a]), outer2: r.pick([0x2c2d38, 0x23252e]), vest: 0x15161c, bottom: 0x15161c, shoes: 0x08080c, accent: r.pick([0x08080c, 0x08080c, 0x6a1a26]) }),
    sameBottomAsOuterF: true,
  },
  coat: {
    cut: (r, f) => ({ top: r.pick(['shirt', 'sweater', 'turtleneck']), sleeves: 'long', outer: r.pick(['coat', 'trench', 'coat']), bottom: f && r.chance(0.4) ? 'skirt' : 'trousers', shoes: r.pick(['shoes', 'boots']), hat: r.pick([null, null, 'fedora', 'beanie']), extras: [...(r.chance(0.5) ? ['scarf'] : []), ...(r.chance(0.2) ? ['glasses'] : [])] }),
    palette: (r) => ({ top: r.pick([...LIGHT, ...MID]), outer: r.pick([0x6a5a44, 0x2c2a33, 0x3a3f4e, 0x5a2a2a, 0x8a7a5a]), outer2: r.pick(DARK), bottom: r.pick(DARK), shoes: 0x1e1814, hat: r.pick(DARK), hat2: r.pick(DARK), accent: r.pick(BRIGHT) }),
    umbrella: true,
  },
};

// What a street crowd is drawn from.
export const STREET_TYPES = Object.keys(CIVILIAN_TYPES);

const MALE_HAIR = ['short', 'short', 'buzz', 'swept', 'bald', 'thinning', 'curly', 'slick', 'afro'];
const FEMALE_HAIR = ['long', 'bob', 'bun', 'ponytail', 'curly', 'afro', 'short', 'long'];

export function civilianSpec(seed, { type = null, body = null } = {}) {
  const r = rng(seed);
  const t = type ?? r.pick(STREET_TYPES);
  // (formal is in STREET_TYPES: a few people in evening dress on their way to the opera)
  const T = CIVILIAN_TYPES[t];
  const b = body ?? (r.chance(0.5) ? 'f' : 'm');
  const f = b === 'f';
  const build = r.pick(f ? ['average', 'slim', 'average', 'heavy'] : ['average', 'average', 'slim', 'heavy', 'elder']);
  const cut = T.cut(r, f);
  // Hats that hide the hair still keep a hair style for the sides; hoods replace it.
  cut.hair = r.pick(f ? FEMALE_HAIR : MALE_HAIR);
  if (!f && r.chance(0.25)) cut.extras = [...(cut.extras ?? []), r.pick(['moustache', 'beard', 'stubble'])];
  const skin = r.pick(SKIN_TONES);
  const hairCol = build === 'elder' ? r.pick([0x9a9690, 0xd8d4cc, 0xb8b4ac]) : r.pick(HAIR_COLOURS);
  const palette = {
    skin, hair: hairCol, brow: hairCol, stubble: shade(skin, 0.78), eyeWhite: 0xeeeae0, iris: r.pick([0x3a2a1a, 0x2a4a6a, 0x3a5a3a, 0x1a1a1a]),
    belt: 0x1e1a18, metal: 0xc8c8c0, white: 0xf2f0e8, ink: 0x0b0b12, lens: 0x2a3a4a, glove: 0x2a2a30, stripe: 0xd8dde6,
    ...T.palette(r),
  };
  if (T.sameBottom) palette.bottom = palette.top;
  if (T.sameBottomAsOuterF && f) { palette.bottom = palette.outer; palette.top = palette.outer; }
  palette.vest ??= palette.outer;
  palette.outer2 ??= palette.outer;
  return {
    type: t, body: b, build, cut, palette,
    height: (f ? 0.94 : 1.0) * r.range(0.93, 1.06),
    width: r.range(0.95, 1.06),
    umbrella: !!T.umbrella,
  };
}

function shade(hex, k) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k);
}

const shapeOf = (assets, spec) => ({ key: cutKey(spec.body, spec.build, spec.cut), body: spec.body, build: spec.build, dress: dresser(spec.cut, assets) });

// [perf2] A generator that builds the spec's figure template a slice at a time (crowd.js), so the
// figureFromSpec() that follows is quick.
export function prepareFromSpec(assets, spec, opts = {}) { return prepareFigure(assets, shapeOf(assets, spec), opts); }

// A spec (from civilianSpec, or a named look from looks.js) as a figure.
export function figureFromSpec(assets, spec, opts = {}) {
  const shape = shapeOf(assets, spec);
  const ch = buildFigure(assets, shape, spec.palette, { height: spec.height ?? 1, width: spec.width ?? 1, ...opts });
  ch.spec = spec;
  ch.type = spec.type ?? 'civilian';
  // An umbrella-ready right hand: props parent to meta.hands.r (see props.js).
  ch.meta.umbrella = !!spec.umbrella;
  return ch;
}

export function createCivilian(assets, seed, { type = null, body = null, ...opts } = {}) {
  return figureFromSpec(assets, civilianSpec(seed, { type, body }), opts);
}
