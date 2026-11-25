// District gangs for the open world (research 5.4). The regions' spawn tables name a district's
// crews with flavour ids (`triad`, `carRing`, `narrowsCrew`...); this maps each to a goon look
// (src/heroes/models/enemies.js GANGS key, the colours `spawn()` paints), a display name and the
// bark theme its lines come from. Pure data.
import { REGION_DATA, DISTRICTS } from '../world/regions/data.js';

export const GANGS = {
  joker: { look: 'joker', name: 'Joker crew', theme: 'jokes' },
  street: { look: 'joker', name: 'street crew', theme: 'street' },
  penguin: { look: 'penguin', name: 'Umbrella Men', theme: 'money' },
  smugglers: { look: 'penguin', name: 'river smugglers', theme: 'money' },
  twoFace: { look: 'twoFace', name: 'Coin crew', theme: 'odds' },
  parkRowCrew: { look: 'twoFace', name: 'Park Row Kings', theme: 'street' },
  riddler: { look: 'riddler', name: 'Question Marks', theme: 'trivia' },
  blackMask: { look: 'blackMask', name: 'False Faces', theme: 'corporate' },
  falconeRemnants: { look: 'blackMask', name: 'the old family', theme: 'corporate' },
  triad: { look: 'blackMask', name: 'the Red Lantern triad', theme: 'corporate' },
  odessaMob: { look: 'blackMask', name: 'the Odessa mob', theme: 'corporate' },
  scarecrowCult: { look: 'scarecrow', name: 'Hollow Men', theme: 'paranoid' },
  narrowsCrew: { look: 'joker', name: 'Narrows crew', theme: 'street' },
  firefly: { look: 'firefly', name: 'Burners', theme: 'heat' },
  fireflyCrew: { look: 'firefly', name: 'Burners', theme: 'heat' },
  carRing: { look: 'firefly', name: 'the chop-shop ring', theme: 'heat' },
  freeze: { look: 'freeze', name: 'Cold Crew', theme: 'cold' },
  ivy: { look: 'ivy', name: 'Thorns', theme: 'plants' },
  tweedles: { look: 'joker', name: 'carnival crew', theme: 'jokes' },
  inmates: { look: 'joker', name: 'escaped inmates', theme: 'street' },
  dockRats: { look: 'croc', name: 'Sewer Rats', theme: 'superstition' },
};
export const GANG_IDS = Object.keys(GANGS);
export const lookOf = (gang) => GANGS[gang]?.look ?? 'joker';
export const gangName = (gang) => GANGS[gang]?.name ?? 'a crew';

// Core districts and the east side's string lists get sensible owners.
const FALLBACK = { gcpd: ['street'], docks: ['smugglers', 'dockRats'], neon: ['joker'], ace: ['joker'], clock: ['street'], city: ['street'],
  river: ['smugglers'], lowerGotham: ['blackMask', 'dockRats'], lake: ['smugglers'], wayneManor: ['street'], blackgate: ['inmates'], quay: ['smugglers'] };

// { [districtId]: [{ id, weight }] } from the regions' spawn tables (string lists and per-district
// entries both appear there).
export const DISTRICT_GANGS = (() => {
  const out = {};
  for (const r of REGION_DATA) {
    const list = r.spawnTables?.gangs ?? [];
    for (const d of r.districts) {
      const mine = list
        .map((g) => (typeof g === 'string' ? { id: g, weight: 1 } : g))
        .filter((g) => !g.district || g.district === d.id)
        .filter((g) => GANGS[g.id]);
      out[d.id] = mine.length ? mine.map((g) => ({ id: g.id, weight: g.weight ?? 1 })) : (FALLBACK[d.id] ?? ['street']).map((id) => ({ id, weight: 1 }));
    }
  }
  for (const [d, l] of Object.entries(FALLBACK)) out[d] ??= l.map((id) => ({ id, weight: 1 }));
  return out;
})();

// Starting control shares (sum 1) for a district.
export function startingControl(district) {
  const list = DISTRICT_GANGS[district] ?? [{ id: 'street', weight: 1 }];
  const total = list.reduce((n, g) => n + g.weight, 0) || 1;
  return Object.fromEntries(list.map((g) => [g.id, g.weight / total]));
}

// The gang that runs most of a district now.
export function topGang(control) {
  let best = 'street', v = -1;
  for (const [g, s] of Object.entries(control ?? {})) if (g !== 'free' && s > v) { v = s; best = g; }
  return best;
}

export const DISTRICT_LIST = DISTRICTS.map((d) => d.id);

// Lieutenant names (generated per gang when a district boils over); original and silly enough.
export const LIEUTENANT_NAMES = {
  jokes: ['Giggles Malone', 'Two-Tone Teddy', 'Punchline Pete'],
  street: ['Knuckles Ruiz', 'Big Sal', 'Tommy Two-Bags'],
  money: ['Mister Pemberton', 'Ledger Lou', 'Silk Umbrella Sam'],
  odds: ['Even Steven', 'Heads Harrigan', 'Lucky Lenny Coin'],
  trivia: ['Quiz Kowalski', 'Trivia Tina', 'Doc Question'],
  corporate: ['The Accountant', 'Madame Lin', 'Viktor Sable'],
  paranoid: ['Whisper Jack', 'The Hollow Deacon', 'Sister Twitch'],
  heat: ['Matchstick Moe', 'Torch Tanaka', 'Spark Delgado'],
  cold: ['Frostbite Frank', 'Icebox Ivan', 'Chilly Charlene'],
  plants: ['Briar Rose', 'Old Man Thistle', 'Mossy'],
  superstition: ['Lantern Larry', 'Wet Willie Grogan', 'Gator Gus'],
};
