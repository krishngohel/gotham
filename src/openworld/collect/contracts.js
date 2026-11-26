// The post-game "Most Wanted" contracts (pure). Once every night of the campaign is done (or with
// the ?contracts=1 dev switch), the GCPD posts contracts one at a time: a remix fight built with
// composeWave (act 5 roles: heavies and lieutenants), its budget and difficulty stepping up each
// time, with modifiers on top. The tier lives in progress.openworld.contracts, so it carries into
// a New Game Plus (the save field survives the story reset) and keeps escalating.
import { composeWave } from '../../enemies/compose.js';
import { nightOrder } from '../../story/campaign.js';
import { REGION_SITES } from '../../world/regions/data.js';

// Fight sites the contracts rotate through (district fight / arena sites).
export const CONTRACT_SITES = [
  { site: 'loopAlleyWest', district: 'loop', gang: 'twoFace' },
  { site: 'diamondAlley', district: 'gothamMile', gang: 'penguin' },
  { site: 'blackgateYard', district: 'blackgate', gang: 'joker' },
  { site: 'narrowsMarket', district: 'narrows', gang: 'scarecrow' },
  { site: 'yardsRoundhouse', district: 'yards', gang: 'firefly' },
  { site: 'chinatownGate', district: 'chinatown', gang: 'blackMask' },
];
export const MODIFIERS = {
  noGadgets: { label: 'No gadgets', text: 'The GCPD wants it clean: no gadgets.' },
  timed: { label: 'Timed', text: 'Finish before the clock runs out.' },
  waves: { label: 'Extra wave', text: 'They brought friends.' },
  elite: { label: 'Elite', text: 'A lieutenant runs this crew.' },
};
const DIFFICULTY = ['normal', 'normal', 'hard', 'hard', 'knightmare'];
const NAMES = ['The Night Shift', 'Bad Company', 'Full House', 'Last Orders', 'The Long Odds', 'Rush Hour', 'Closing Time', 'Dead Heat'];

export function contractUnlocked(progress, { dev = false } = {}) {
  if (dev) return true;
  const order = nightOrder();
  const done = new Set(progress?.campaign?.nightsDone ?? []);
  return order.length > 0 && order.every((n) => done.has(n));
}

// The next contract for this save: tier = contracts done so far. Deterministic given the rng.
export function nextContract(store, rng) {
  const c = store?.contracts ?? { tier: 0, done: 0, best: 0 };
  const tier = c.tier ?? 0;
  const place = CONTRACT_SITES[tier % CONTRACT_SITES.length];
  const difficulty = DIFFICULTY[Math.min(DIFFICULTY.length - 1, Math.floor(tier / 2))];
  const budget = 8 + 2 * tier;
  const mods = [];
  const pool = ['noGadgets', 'timed', 'waves', 'elite'];
  const nMods = Math.min(3, 1 + Math.floor(tier / 3));
  while (mods.length < nMods) { const m = pool[Math.floor(rng.next() * pool.length)]; if (!mods.includes(m)) mods.push(m); }
  const nWaves = 2 + (mods.includes('waves') ? 1 : 0) + Math.floor(tier / 4);
  const waves = [];
  for (let w = 0; w < nWaves; w++) {
    const { list } = composeWave({ budget: budget + w * 2, act: 5, difficulty, rng, gang: place.gang });
    if (w === nWaves - 1 && mods.includes('elite') && !list.some((e) => e.type === 'lieutenant')) list.push({ type: 'lieutenant' });
    waves.push(list.map((e, i) => { const a = (i / list.length) * Math.PI * 2 + w; return { type: e.type, dx: Math.sin(a) * 7, dz: Math.cos(a) * 7 }; }));
  }
  const s = REGION_SITES[place.site];
  return {
    id: `contract${tier}`, tier, name: `${NAMES[tier % NAMES.length]}${tier >= NAMES.length ? ` ${Math.floor(tier / NAMES.length) + 1}` : ''}`,
    district: place.district, gang: place.gang, difficulty, budget, modifiers: mods,
    timer: mods.includes('timed') ? 90 + nWaves * 45 : null,
    fight: { site: { x: s.x, y: s.y, z: s.z }, radius: 18, gang: place.gang, waves },
    xp: 300 + tier * 100,
  };
}

// A finished contract moves the tier on.
export function recordContract(store, contract, ok) {
  const c = store.contracts ?? (store.contracts = { tier: 0, done: 0, best: 0 });
  if (!ok) return c;
  c.done += 1;
  c.tier = Math.max(c.tier, contract.tier + 1);
  c.best = Math.max(c.best, contract.tier + 1);
  return c;
}
