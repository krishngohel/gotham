// The boss framework's one entry point for src/game/game.js: the director plus every boss def.
// Night One's two (the Joker on boss.js, Harley's watched fight) and the campaign's own. A new
// boss (Acts IV and V) is one def file in ./defs and one register line here.
import { createBossDirector } from './director.js';
import { jokerDef } from './defs/joker.js';
import { harleyDef } from './defs/harley.js';
import { penguinDef } from './defs/penguin.js';
import { riddlerDef } from './defs/riddler.js';
import { scarecrowDef } from './defs/scarecrow.js';
import { freezeDef } from './defs/freeze.js';
// [story2] Acts IV and V
import { ivyDef } from './defs/ivy.js';
import { fireflyDef } from './defs/firefly.js';
import { blackMaskDef } from './defs/blackMask.js';
import { doubleActDef } from './defs/doubleAct.js';
import { SITES } from '../world/mapData.js';
import { REGION_SITES } from '../world/regions/data.js';
import { allNights } from '../story/campaign.js';
import '../story/nights/index.js';

// Any named place a boss def may use: a night's own sites, then the city's.
export function bossSite(id) {
  if (!id) return null;
  if (typeof id === 'object') return id;
  for (const n of allNights()) if (n.sites?.[id]) return n.sites[id];
  return SITES[id] ?? REGION_SITES[id] ?? null;
}

export function createBossFramework(deps) {
  const director = createBossDirector({ ...deps, site: bossSite });
  director.register(jokerDef(deps.boss, deps));
  director.register(harleyDef(deps));
  for (const make of [penguinDef, riddlerDef, scarecrowDef, freezeDef, ivyDef, fireflyDef, blackMaskDef, doubleActDef]) director.register(make(deps));
  return director;
}

export const BOSS_IDS = ['joker', 'harley', 'penguin', 'riddler', 'scarecrow', 'freeze', 'ivy', 'firefly', 'blackMask', 'doubleAct'];
// [story2] every campaign boss def maker (tests, the night simulator)
export const CAMPAIGN_BOSS_DEFS = [penguinDef, riddlerDef, scarecrowDef, freezeDef, ivyDef, fireflyDef, blackMaskDef, doubleActDef];
