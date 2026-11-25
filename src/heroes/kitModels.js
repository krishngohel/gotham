// Gets a kit ready to build (workstream D1): its model builder registered with the roster, its
// costume texture and its animation packs loaded. Nothing here runs until a kit is picked (the
// hero select, a join, a resumed save), so a single-player Batman never downloads any of it.
//
//   await prepareKit(kit, assets)   then createHero({ kit }) builds it synchronously.
import { registerModelBuilder, hasModelBuilder, kitInfo } from './roster.js';
import { loadAnimPack, mergePackClips } from '../actors/animPacks.js';

// builder id -> () => Promise<build(assets, kit)>. 'bat' is built in (createBat).
const BUILDERS = {
  nightwing: async () => { const m = await import('./models/nightwing.js'); return (a, kit) => m.createNightwing(a, { suit: kit.model.suit ?? 'nightwing', mode: 'ally' }); },
  robin: async () => { const m = await import('./models/robin.js'); return (a, kit) => m.createRobin(a, { variant: kit.model.variant ?? 'classic', suit: kit.model.suit ?? 'robin' }); },
  batgirl: async () => { const m = await import('./models/batgirl.js'); return (a) => m.createBatgirl(a); },
  redHood: async () => { const m = await import('./models/redHood.js'); return (a) => m.createRedHood(a); },
  futureBat: async () => { const m = await import('./models/futureBat.js'); return (a) => m.createFutureBat(a); },
  gaslightBat: async () => { const m = await import('./models/gaslightBat.js'); return (a) => m.createGaslightBat(a); },
  superman: async () => { const m = await import('./models/superman.js'); return (a) => m.createSuperman(a); },
};
// The costume texture each look paints from (src/heroes/models/costume.js loadHeroTextures ids).
export function costumeTextures(kit) {
  const b = kit.model?.builder;
  if (b === 'robin') return [{ classic: 'robin', modern: 'robinModern', staff: 'robinStaff' }[kit.model.variant ?? 'classic'] ?? 'robin'];
  if (b && b !== 'bat' && b !== 'nightwing') return [b];
  return [];
}

const pending = new Map();
export function prepareKit(kit, assets) {
  const key = kit.id;
  if (pending.has(key)) return pending.get(key);
  const p = (async () => {
    const b = kit.model?.builder;
    if (b && b !== 'bat' && !hasModelBuilder(b) && BUILDERS[b]) registerModelBuilder(b, await BUILDERS[b]());
    const tex = costumeTextures(kit);
    if (tex.length) {
      const { loadHeroTextures } = await import('./models/costume.js');
      await loadHeroTextures(assets, tex);
    }
    // The animation packs the kit's signature moves play (merged into the shared clip map, never
    // replacing a clip already there). A pack that fails to load leaves the kit on base moves.
    for (const name of kitInfo(kit).packs ?? []) {
      try { mergePackClips(assets.clips, await loadAnimPack(name, { base: assets.base ?? './assets/' })); } catch (err) { console.warn(`animation pack ${name}:`, err?.message ?? err); }
    }
    return kit;
  })();
  p.catch(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

// True once prepareKit(kit) has finished (the hero can be built right now).
export function kitReady(kit) {
  const b = kit.model?.builder;
  return !b || b === 'bat' || hasModelBuilder(b);
}
