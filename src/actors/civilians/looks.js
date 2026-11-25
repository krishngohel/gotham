// Named looks: services (GCPD, SWAT, a doctor, a reporter) and the story's people, as figure
// specs (see generator.js figureFromSpec). Original designs; names are data so they can change.
import { figureFromSpec } from './generator.js';

const base = { eyeWhite: 0xeeeae0, iris: 0x2a2018, belt: 0x1e1a18, metal: 0xd9b84a, white: 0xf2f0e8, ink: 0x0b0b12, lens: 0x2a3a4a, glove: 0x1e1e24, stripe: 0xd8dde6 };
const person = (skin, hair, extra) => ({ ...base, skin, hair, brow: hair, stubble: skin, ...extra });

export const LOOKS = {
  // ---- services
  gcpd: { name: 'GCPD officer', body: 'm', build: 'average', height: 1.0,
    cut: { top: 'shirt', sleeves: 'long', outer: 'tactical', bottom: 'trousers', shoes: 'boots', hair: 'short', hat: 'police', extras: ['badge', 'radio', 'holster', 'belt'] },
    palette: person(0xc99a7c, 0x2b1d14, { top: 0x2c3e66, vest: 0x1e2433, bottom: 0x1e2433, shoes: 0x111116, hat: 0x1e2433, hat2: 0x111116 }) },
  gcpdF: { name: 'GCPD officer (f)', body: 'f', build: 'average', height: 0.95,
    cut: { top: 'shirt', sleeves: 'long', outer: 'tactical', bottom: 'trousers', shoes: 'boots', hair: 'bun', hat: 'police', extras: ['badge', 'radio', 'holster', 'belt'] },
    palette: person(0x8d5a3b, 0x16120f, { top: 0x2c3e66, vest: 0x1e2433, bottom: 0x1e2433, shoes: 0x111116, hat: 0x1e2433, hat2: 0x111116 }) },
  swat: { name: 'SWAT', body: 'm', build: 'heavy', height: 1.02,
    cut: { top: 'sweater', sleeves: 'long', outer: 'tactical', bottom: 'trousers', shoes: 'boots', hair: 'buzz', hat: 'swat', extras: ['kneepads', 'gloves', 'radio', 'holster'] },
    palette: person(0xb07b58, 0x16120f, { top: 0x2a2e36, vest: 0x1a1d24, bottom: 0x2a2e36, shoes: 0x111116, hat: 0x1a1d24, lens: 0x2a4a6a, glove: 0x111116 }) },
  doctor: { name: 'Doctor', body: 'f', build: 'slim', height: 0.96,
    cut: { top: 'shirt', sleeves: 'long', outer: 'labcoat', bottom: 'trousers', shoes: 'shoes', hair: 'bun', extras: ['stethoscope', 'glasses', 'lanyard'] },
    palette: person(0xe0ac86, 0x9a9690, { top: 0x7aa0c8, outer: 0xf0f0ea, outer2: 0xe0e0da, bottom: 0x3a3f4e, shoes: 0x1e1814 }) },
  reporter: { name: 'Gazette reporter', body: 'f', build: 'average', height: 0.97,
    cut: { top: 'turtleneck', outer: 'trench', bottom: 'trousers', shoes: 'boots', hair: 'bob', extras: ['camera', 'lanyard'] },
    palette: person(0xf1c8a6, 0xc8a46a, { top: 0x1e1e24, outer: 0xb89a6a, outer2: 0x8a7048, bottom: 0x23252e, shoes: 0x1e1814 }) },
  photographer: { name: 'Press photographer', body: 'm', build: 'heavy', height: 0.98,
    cut: { top: 'shirt', sleeves: 'rolled', outer: 'waistcoat', bottom: 'jeans', shoes: 'boots', hair: 'curly', hat: 'cap', extras: ['camera', 'stubble', 'bag'] },
    palette: person(0x8d5a3b, 0x16120f, { top: 0x8a9aa8, vest: 0x5a5a3a, bottom: 0x2f4a6e, shoes: 0x3a2a1a, hat: 0x2a2a30, hat2: 0x1a1a1f, bag: 0x3a3a30 }) },

  // ---- the story's people (original looks)
  commissioner: { name: 'The Commissioner', body: 'm', build: 'heavy', height: 0.98,
    cut: { top: 'shirt', sleeves: 'long', outer: 'trench', bottom: 'trousers', shoes: 'shoes', hair: 'thinning', extras: ['glasses', 'moustache', 'tie'] },
    palette: person(0xe3b08c, 0xb0623a, { top: 0xe8e2d6, outer: 0x8a7a5a, outer2: 0x6a5a40, bottom: 0x4a4a52, shoes: 0x2a1f18, accent: 0x6a2a2a }) },
  detective: { name: 'Detective', body: 'f', build: 'slim', height: 0.98,
    cut: { top: 'shirt', sleeves: 'long', outer: 'jacket', bottom: 'trousers', shoes: 'boots', hair: 'ponytail', extras: ['badge', 'holster'] },
    palette: person(0xb07b58, 0x16120f, { top: 0xd6dbe3, outer: 0x2c2a33, bottom: 0x2c2a33, shoes: 0x111116 }) },
  techExpert: { name: 'Tech expert', body: 'f', build: 'slim', height: 0.95,
    cut: { top: 'sweater', sleeves: 'long', bottom: 'trousers', shoes: 'sneakers', hair: 'long', extras: ['glasses', 'headset'] },
    palette: person(0xf1c8a6, 0xa8321f, { top: 0x5a6a3a, bottom: 0x2a3346, shoes: 0xe8e8e8 }) },
  engineer: { name: 'Applied-sciences chief', body: 'm', build: 'elder', height: 1.0,
    cut: { top: 'shirt', sleeves: 'long', outer: 'blazer', bottom: 'trousers', shoes: 'shoes', hair: 'buzz', extras: ['glasses', 'beard', 'tie', 'pocketsquare'] },
    palette: person(0x6b4129, 0xb8b4ac, { top: 0xe8e2d6, outer: 0x3a3f4e, outer2: 0x2a2e3a, bottom: 0x3a3f4e, shoes: 0x1a1410, accent: 0x7a2a3a }) },
  ward: { name: 'The ward, off duty', body: 'm', build: 'slim', height: 1.0,
    cut: { top: 'tee', sleeves: 'short', outer: 'jacket', bottom: 'jeans', shoes: 'sneakers', hair: 'swept', extras: [] },
    palette: person(0xd9b08c, 0x16120f, { top: 0x2a4a7a, outer: 0x3a2a24, bottom: 0x283a58, shoes: 0x1a1a1f }) },
  mayor: { name: 'The Mayor', body: 'm', build: 'heavy', height: 0.97,
    cut: { top: 'shirt', sleeves: 'long', outer: 'blazer', bottom: 'trousers', shoes: 'shoes', hair: 'slick', extras: ['tie', 'pocketsquare', 'badge'] },
    palette: person(0xe0ac86, 0x9a9690, { top: 0xefe6cf, outer: 0x1e2a3c, outer2: 0x16202e, bottom: 0x1e2a3c, shoes: 0x111116, accent: 0xc8323c }) },
  socialite: { name: 'Gala guest', body: 'f', build: 'slim', height: 0.98,
    cut: { top: 'tank', outer: 'gown', bottom: 'longskirt', shoes: 'shoes', hair: 'bun', extras: [] },
    palette: person(0xc99a7c, 0x2b1d14, { top: 0x6a1a2a, outer: 0x6a1a2a, bottom: 0x6a1a2a, shoes: 0x1a1a1f }) },
  // ---- the gala (chars2): guests in evening dress and the catering staff
  galaGuest: { name: 'Gala guest (dinner jacket)', body: 'm', build: 'average', height: 1.0,
    cut: { top: 'shirt', sleeves: 'long', outer: 'tux', bottom: 'trousers', shoes: 'shoes', hair: 'slick', extras: ['bowtie', 'pocketsquare'] },
    palette: person(0xd9b08c, 0x2b1d14, { top: 0xf4f2ec, outer: 0x15161c, outer2: 0x2c2d38, vest: 0x15161c, bottom: 0x15161c, shoes: 0x08080c, accent: 0x08080c }) },
  galaGuestF: { name: 'Gala guest (gown)', body: 'f', build: 'slim', height: 0.97,
    cut: { top: 'tank', outer: 'gown', bottom: 'longskirt', shoes: 'shoes', hair: 'long', extras: [] },
    palette: person(0xe0ac86, 0x16120f, { top: 0x1f3a5a, outer: 0x1f3a5a, bottom: 0x1f3a5a, shoes: 0x1a1a1f }) },
  waiter: { name: 'Gala waiter', body: 'm', build: 'slim', height: 0.99,
    cut: { top: 'shirt', sleeves: 'long', outer: 'waistcoat', bottom: 'trousers', shoes: 'shoes', hair: 'short', extras: ['bowtie', 'belt'] },
    palette: person(0xc99a7c, 0x16120f, { top: 0xf4f2ec, vest: 0x1a1a20, bottom: 0x1a1a20, shoes: 0x08080c, accent: 0x08080c }) },
  boardMember: { name: 'Board member', body: 'm', build: 'elder', height: 0.98,
    cut: { top: 'shirt', sleeves: 'long', outer: 'blazer', bottom: 'trousers', shoes: 'shoes', hair: 'thinning', extras: ['glasses', 'tie'] },
    palette: person(0xf1c8a6, 0xd8d4cc, { top: 0xd6dbe3, outer: 0x33363f, outer2: 0x26282f, bottom: 0x33363f, shoes: 0x111116, accent: 0x3a4a7a }) },
};

export function createLook(assets, id, opts = {}) {
  const look = LOOKS[id];
  if (!look) throw new Error(`Unknown look ${id}`);
  const ch = figureFromSpec(assets, { type: id, ...look }, { layer: opts.layer ?? 0, ...opts });
  ch.look = id;
  return ch;
}
