// The campaign's saved state: progress.campaign (registered field; old saves without it load with
// the default and carry on exactly as before). Night One keeps its place in progress.step /
// progress.stepId; this field holds everything after it.
//
//   campaign = {
//     night: 'n1',          the night in play (or next up, once the last one finished)
//     stepId: null,         the step id inside that night (null: its first step)
//     nightsDone: [],       finished nights
//     missionsDone: [],     'n2.m2Lounge' keys (mission select, rewards granted once)
//     optionalDone: [],     'n2.lookout1' keys (optional objectives found)
//     rewards: [],          reward ids already emitted (L1 grants; never emitted twice)
//     daysSeen: [],         Bruce-day hooks already played
//     choices: {},          [story2] 'n6.gala' -> 'bruce' | 'batman' | ... (double-life choices,
//                           mid-night calls, dilemmas; later nights read them back)
//     boss: null,           [story2] { id, phase }: the phase a boss fight reached (resume there)
//     ending: null,         [story2] the finale's ending id once seen ('family' | 'partners' | 'alone')
//   }
import { registerProgressField } from '../core/save.js';
import { STEP_ID } from './campaign.js';

const KEY = /^[a-zA-Z][a-zA-Z0-9]{0,31}(\.[a-zA-Z][a-zA-Z0-9]{0,31})?$/;
const REWARD = /^[a-z]+:[a-zA-Z0-9_.-]{1,40}$/;
export const CAMPAIGN_DEFAULT = Object.freeze({ night: 'n1', stepId: null, nightsDone: [], missionsDone: [], optionalDone: [], rewards: [], daysSeen: [], choices: {}, boss: null, ending: null });
const VALUE = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/;
function choiceMap(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  let n = 0;
  for (const [k, x] of Object.entries(v)) {
    if (n >= 128) break;
    if (KEY.test(k) && typeof x === 'string' && VALUE.test(x)) { out[k] = x; n += 1; }
  }
  return out;
}

const list = (v, re, max = 256) => (Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === 'string' && re.test(s)))].slice(0, max) : []);

export function sanitizeCampaign(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    night: typeof r.night === 'string' && STEP_ID.test(r.night) ? r.night : 'n1',
    stepId: typeof r.stepId === 'string' && STEP_ID.test(r.stepId) ? r.stepId : null,
    nightsDone: list(r.nightsDone, STEP_ID, 32),
    missionsDone: list(r.missionsDone, KEY),
    optionalDone: list(r.optionalDone, KEY),
    rewards: list(r.rewards, REWARD),
    daysSeen: list(r.daysSeen, KEY, 64),
    choices: choiceMap(r.choices),
    boss: r.boss && typeof r.boss === 'object' && typeof r.boss.id === 'string' && STEP_ID.test(r.boss.id) && Number.isInteger(r.boss.phase) && r.boss.phase >= 0 && r.boss.phase < 10 ? { id: r.boss.id, phase: r.boss.phase } : null,
    ending: typeof r.ending === 'string' && VALUE.test(r.ending) ? r.ending : null,
  };
}

// A new game starts the campaign over too.
registerProgressField('campaign', { sanitize: sanitizeCampaign, fresh: { ...CAMPAIGN_DEFAULT, choices: {} } });

// Dev / test start: ?night=n2 (its first step) or ?night=n2&at=stepId; a Night One ?at= id that
// was retired by the pacing pass resolves through ALIASES (src/game/storyAliases.js). Returns the
// progress to start from.
export function applyStartParams(progress, params, { nightSteps, nightOneSteps, aliases = {} }) {
  const night = params.get('night');
  const at = params.get('at');
  if (night && night !== 'n1') {
    const list = nightSteps(night);
    if (!list.length) return progress;
    const stepId = at && list.some((s) => s.id === at) ? at : list[0].id;
    // Night One counts as finished (its step at the credits, the gadgets it unlocks in hand).
    const credits = nightOneSteps.findIndex((s) => s.type === 'credits');
    const prior = [...new Set([...(progress.campaign?.nightsDone ?? []), 'n1'])];
    return { ...progress, step: credits, stepId: nightOneSteps[credits].id, finished: true, campaign: { ...sanitizeCampaign(progress.campaign), night, stepId, nightsDone: prior } };
  }
  if (at) {
    const id = aliases[at] ?? at;
    const i = nightOneSteps.findIndex((s) => s.id === id);
    if (i >= 0) return { ...progress, step: i, stepId: nightOneSteps[i].id, campaign: { ...sanitizeCampaign(progress.campaign), night: 'n1', stepId: null } };
  }
  return progress;
}
