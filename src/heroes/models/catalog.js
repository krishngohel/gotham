// Every character look in the game, as data: id, display name, gallery group, and a lazy loader
// that resolves to build(assets) -> character (the createBat return shape). Used by the dev
// gallery (tools/roster.html) and the contact-sheet script (scripts/model-shots.mjs --roster);
// gameplay code imports the builders it needs directly. Loaders are dynamic imports so a page
// that lists the catalog pulls in only the builders it actually shows.
import { SUITS } from './suits.js';

export const CATALOG = [];
const add = (group, id, name, load) => CATALOG.push({ group, id, name, load });

// ---- heroes: Batman suits (createBat ids; see suits.js for the data table)
for (const s of SUITS.filter((x) => x.hero === 'batman')) {
  add('batman', `bat-${s.id}`, s.name, async () => { const { createBat } = await import('../../actors/characters.js'); return (a) => createBat(a, s.id); });
}

// ---- allies
for (const s of SUITS.filter((x) => x.hero === 'nightwing')) {
  add('nightwing', s.id, s.name, async () => { const { createNightwing } = await import('./nightwing.js'); return (a) => createNightwing(a, { suit: s.id }); });
}
add('nightwing', 'nightwing-courier', 'Nightwing (courier disguise)', async () => { const { createNightwingCharacter } = await import('../../actors/nightwingChar.js'); return (a) => createNightwingCharacter(a, 'courier'); });

// ---- enemies
for (const type of ['grunt', 'knife', 'brute', 'rifle', 'civilian']) {
  add('goons', `goon-${type}`, `Goon: ${type}`, async () => { const { createGoon } = await import('../../actors/characters.js'); return (a, seed = 1) => createGoon(a, { type, rng: seeded(seed) }); });
}
add('villains', 'joker', 'The Joker', async () => { const { createJoker } = await import('../../actors/characters.js'); return (a) => createJoker(a); });
add('villains', 'harley', 'Harley', async () => { const { createHarleyCharacter } = await import('../../actors/harleyChar.js'); return (a) => createHarleyCharacter(a); });

// ---- co-op heroes (their textures load on demand, as the lobby would)
const HERO_FILES = {
  robin: () => import('./robin.js'), batgirl: () => import('./batgirl.js'), redHood: () => import('./redHood.js'),
  futureBat: () => import('./futureBat.js'), gaslightBat: () => import('./gaslightBat.js'), superman: () => import('./superman.js'),
};
const hero = (id, name, file, make, tex) => add('coop', id, name, async () => {
  const m = await HERO_FILES[file]();
  const { loadHeroTextures } = await import('./costume.js');
  return async (a) => { await loadHeroTextures(a, tex); return make(m, a); };
});
hero('robin', 'Robin (classic)', 'robin', (m, a) => m.createRobin(a, { variant: 'classic' }), ['robin']);
hero('robin-winter', 'Robin (winter suit)', 'robin', (m, a) => m.createRobin(a, { variant: 'classic', suit: 'robin-winter' }), ['robin']);
hero('robin-shadow', 'Robin (shadow suit)', 'robin', (m, a) => m.createRobin(a, { variant: 'classic', suit: 'robin-shadow' }), ['robin']);
hero('robin-modern', 'Robin (armoured, hooded)', 'robin', (m, a) => m.createRobin(a, { variant: 'modern' }), ['robinModern']);
hero('robin-staff', 'Robin (staff)', 'robin', (m, a) => m.createRobin(a, { variant: 'staff' }), ['robinStaff']);
hero('batgirl', 'Batgirl', 'batgirl', (m, a) => m.createBatgirl(a), ['batgirl']);
hero('red-hood', 'Red Hood', 'redHood', (m, a) => m.createRedHood(a), ['redHood']);
hero('future-bat', 'Future Batman', 'futureBat', (m, a) => m.createFutureBat(a), ['futureBat']);
hero('gaslight-bat', 'Gaslight Batman', 'gaslightBat', (m, a) => m.createGaslightBat(a), ['gaslightBat']);
hero('superman', 'Superman', 'superman', (m, a) => m.createSuperman(a), ['superman']);

// ---- villains (figures) and enemy roles in gang colours
for (const id of ['crimeBoss', 'puzzler', 'scarecrow', 'twoFace', 'coldScientist', 'clayBrute', 'venomBrute', 'catBurglar', 'mercenary', 'jester', 'harlequin']) {
  add('villains', `villain-${id}`, id, async () => { const { createVillain } = await import('./villains.js'); return (a) => createVillain(a, id); });
}
const GANG_OF = { shield: 'penguin', baton: 'joker', heavy: 'blackMask', gunner: 'twoFace', sniper: 'riddler', ninja: 'scarecrow', medic: 'freeze', lieutenant: 'blackMask' };
for (const role of ['shield', 'baton', 'heavy', 'gunner', 'sniper', 'ninja', 'medic', 'lieutenant']) {
  add('enemies', `enemy-${role}`, `${role} (${GANG_OF[role]})`, async () => { const { createEnemyLook } = await import('./enemies.js'); return (a, seed = 1) => createEnemyLook(a, role, { gang: GANG_OF[role], rng: seeded(seed) }); });
}
for (const gang of ['firefly', 'ivy', 'croc']) {
  add('enemies', `enemy-baton-${gang}`, `baton (${gang})`, async () => { const { createEnemyLook } = await import('./enemies.js'); return (a, seed = 1) => createEnemyLook(a, 'baton', { gang, rng: seeded(seed) }); });
}

// ---- Alfred and Bruce Wayne
for (const variant of ['butler', 'shirtsleeves', 'overcoat']) {
  add('alfred', `alfred-${variant}`, `Alfred: ${variant}`, async () => { const { createAlfred } = await import('./alfred.js'); return (a) => createAlfred(a, { variant, glasses: variant === 'shirtsleeves', prop: variant === 'butler' ? 'tray' : variant === 'shirtsleeves' ? 'medkit' : 'umbrella' }); });
}
for (const outfit of ['tux', 'suit', 'casual', 'training']) {
  add('bruce', `bruce-${outfit}`, `Bruce Wayne: ${outfit}`, async () => { const { createBruce } = await import('./bruce.js'); return (a) => createBruce(a, { outfit }); });
}
add('bruce', 'bruce-injured', 'Bruce Wayne: the morning after', async () => { const { createBruce } = await import('./bruce.js'); return (a) => createBruce(a, { outfit: 'training', injuries: { bruise: true, lip: true, ribs: true, sling: true } }); });

// ---- named looks: services and the story's people
for (const id of ['gcpd', 'gcpdF', 'swat', 'doctor', 'reporter', 'photographer', 'commissioner', 'detective', 'techExpert', 'engineer', 'ward', 'mayor', 'socialite', 'boardMember', 'galaGuest', 'galaGuestF', 'waiter']) {
  add('people', `look-${id}`, id, async () => { const { createLook } = await import('../../actors/civilians/looks.js'); return (a) => createLook(a, id); });
}

// ---- civilians: one of each type, both bodies, then a seeded street crowd
for (const type of ['office', 'casual', 'worker', 'chef', 'nurse', 'police', 'firefighter', 'vendor', 'tourist', 'hoodie', 'coat', 'formal']) {
  for (const body of ['m', 'f']) {
    add('civilians', `civ-${type}-${body}`, `Civilian: ${type} (${body})`, async () => { const { createCivilian } = await import('../../actors/civilians/generator.js'); return (a, seed = 1) => createCivilian(a, seed * 7 + type.length, { type, body }); });
  }
}
for (let k = 0; k < 6; k++) add('crowd', `crowd-${k}`, `Street crowd #${k}`, async () => { const { createCivilian } = await import('../../actors/civilians/generator.js'); return (a) => createCivilian(a, 1000 + k * 97); });

// Small deterministic RNG with the { next() } shape createGoon expects.
export function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return { next() { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; } };
}

export const catalogEntry = (id) => CATALOG.find((e) => e.id === id) ?? null;
