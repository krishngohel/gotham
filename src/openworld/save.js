// The open world's saved state: progress.openworld (registered field; old saves load with the
// default). One field for everything workstream J3 adds, so the save format gains exactly one key.
//
//   openworld = {
//     districts: { [districtId]: { heat 0..5, control: { [gang]: 0..1 }, stopped, failed,
//                                   lt: { name, gang, beaten, memory: [counter ids] } | null } },
//     types: { [crimeTypeId]: stopped count },     arrests, saved, hurt, getaways, collateral
//     rep: { value, gangs } | null                 the city-wide reputation (combat.reputation)
//     stealth: { [encounterId]: { best, medal, opts: [optional ids done] } }
//     chains: { [chainId]: step index done (0..n) }
//     cases: { [caseId]: { stage, found: [evidence ids], trail: n, solved } }
//     collect: { riddles: [], hides: [], logs: [], photos: [], trials: { [id]: { best, medal } } }
//     contracts: { tier, done, best }
//     rewards: ['lore.catBurglarFile', ...]        unlock rewards already emitted (':' saved as '.')
//   }
import { registerProgressField } from '../core/save.js';

const ID = /^[a-zA-Z][a-zA-Z0-9_.-]{0,47}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v, lo = 0, hi = 1e9) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const whole = (v, hi = 1e7) => Math.floor(num(v, 0, hi));
const ids = (v, max = 256) => (Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === 'string' && ID.test(s)))].slice(0, max) : []);
const MEDALS = ['bronze', 'silver', 'gold'];

function map(raw, fn, max = 128) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw).slice(0, max)) {
    if (!ID.test(k)) continue;
    const s = fn(v);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

const district = (r) => {
  if (!isObj(r)) return undefined;
  const lt = isObj(r.lt) && typeof r.lt.name === 'string' ? {
    name: r.lt.name.slice(0, 40), gang: typeof r.lt.gang === 'string' && ID.test(r.lt.gang) ? r.lt.gang : 'street',
    beaten: whole(r.lt.beaten, 99), memory: ids(r.lt.memory, 6),
  } : null;
  return { heat: num(r.heat, 0, 5), control: map(r.control, (v) => (typeof v === 'number' ? num(v, 0, 1) : undefined), 8), stopped: whole(r.stopped), failed: whole(r.failed), lt };
};
const result = (r) => (isObj(r) && typeof r.best === 'number' && Number.isFinite(r.best) && r.best >= 0
  ? { best: r.best, medal: MEDALS.includes(r.medal) ? r.medal : null, opts: ids(r.opts, 8) } : undefined);

export const OPENWORLD_DEFAULT = Object.freeze({
  districts: {}, types: {}, arrests: 0, saved: 0, hurt: 0, getaways: 0, collateral: 0, rep: null,
  stealth: {}, chains: {}, cases: {}, collect: { riddles: [], hides: [], logs: [], photos: [], trials: {} }, contracts: { tier: 0, done: 0, best: 0 }, rewards: [],
});

export function sanitizeOpenworld(raw) {
  const r = isObj(raw) ? raw : {};
  const c = isObj(r.collect) ? r.collect : {};
  const rep = isObj(r.rep) && Number.isFinite(r.rep.value)
    ? { value: num(r.rep.value, 0, 100), gangs: map(r.rep.gangs, (v) => (typeof v === 'number' ? num(v, 0, 100) : undefined), 32) } : null;
  return {
    districts: map(r.districts, district, 64),
    types: map(r.types, (v) => (typeof v === 'number' ? whole(v) : undefined), 64),
    arrests: whole(r.arrests), saved: whole(r.saved), hurt: whole(r.hurt), getaways: whole(r.getaways), collateral: whole(r.collateral),
    rep,
    stealth: map(r.stealth, result, 32),
    chains: map(r.chains, (v) => (typeof v === 'number' ? whole(v, 16) : undefined), 16),
    cases: map(r.cases, (v) => (isObj(v) ? { stage: whole(v.stage, 9), found: ids(v.found, 32), trail: whole(v.trail, 32), solved: v.solved === true } : undefined), 32),
    collect: {
      riddles: ids(c.riddles), hides: ids(c.hides), logs: ids(c.logs), photos: ids(c.photos),
      trials: map(c.trials, result, 64),
    },
    contracts: { tier: whole(r.contracts?.tier, 99), done: whole(r.contracts?.done), best: whole(r.contracts?.best, 99) },
    rewards: ids(r.rewards, 128),
  };
}

const fresh = () => sanitizeOpenworld({});
registerProgressField('openworld', { sanitize: sanitizeOpenworld, fresh: fresh() });
