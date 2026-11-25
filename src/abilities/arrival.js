// [verify] When the story hands a capability over, as a line the skill tree can show next to a node
// that rides on it ("Arrives in Night 3, after Express Service"). Pure: reads the ability data
// (./abilityDefs.js grant), the gadget data (src/gadgets/gadgetDefs.js unlock) and the campaign's
// registered nights (their gadget rewards), never the save.
//
//   NODE_ABILITY                 skill node id -> the ability id it upgrades (content is data)
//   arrivalOf(abilityId)         -> { night: 'n3' | null, mission: 'm3El' | null, text } | null
//   withArrivals(tree, has)      -> a copy of wayneTech.tree() whose not-yet-owned nodes that ride on
//                                   an ability `has(id)` says is missing carry `arrives: text`
import { abilityById } from './abilityDefs.js';
import { GADGETS, rewardGadgetId } from '../gadgets/gadgetDefs.js';
import { allNights, missionsOf, stepsOf } from '../story/campaign.js';

export const NODE_ABILITY = Object.freeze({
  // combat
  fastFinish: 'specialTakedown', efficient: 'chainTakedown', swarm: 'batSwarm', aerialPlus: 'aerialAttacks',
  beatdownFinisher: 'beatdown',
  // gadgets
  triple: 'gadget.batarang', bigBang: 'gadget.gel', quickSmoke: 'gadget.smoke', doubleClaw: 'gadget.claw', deepFreeze: 'gadget.freeze',
  disruptorCharges: 'gadget.disruptor', sonicStun: 'gadget.sonic', hackFast: 'gadget.hack', shockOvercharge: 'gadget.shock',
  glueSpread: 'gadget.glue', trackerMulti: 'gadget.tracker', droneLong: 'gadget.drone', bolasDouble: 'gadget.bolas',
  empWide: 'gadget.emp', decoyLong: 'gadget.decoy',
  // traversal
  accelerator: 'grapple', grip: 'wallRun', seismic: 'diveBomb', grappleRange1: 'grapple', grappleRange2: 'grapple',
  grappleBoost: 'grappleBoost', glideReGrapple: 'reGrapple', grapplePull: 'grapplePull',
  wingsuit1: 'wingsuit', wingsuit2: 'wingsuit', wingsuit3: 'wingsuit', updraftReader: 'wingsuit',
  // predator
  invertedTakedown: 'perch', fearTakedown1: 'silentTakedown', fearTakedown2: 'silentTakedown', ledgePlus: 'ledgeTakedown',
  // detective
  scanRange: 'detective', forensics: 'detective', trackerNetwork: 'gadget.tracker', hackRange: 'gadget.hack',
  // vehicle
  pursuitTuning: 'batmobile', ramPlates: 'batmobile', afterburner: 'batmobile', battleArmor: 'battleMode',
});

// Every reward id a night pays (the same walk as storyRuntime: mission rewards, step reward(s),
// optional rewards), with the mission it belongs to when there is one.
function nightRewardList(night) {
  const out = [];
  for (const m of missionsOf(night)) for (const r of m.rewards ?? []) out.push({ id: r, mission: m.id });
  for (const s of stepsOf(night)) {
    if (s.reward) out.push({ id: s.reward, mission: null });
    for (const r of s.rewards ?? []) out.push({ id: r, mission: null });
    for (const o of s.optional ?? []) if (o.reward) out.push({ id: o.reward, mission: null });
  }
  return out;
}

function nightText(night, missionId) {
  if (!night) return 'Arrives later in the story';
  const n = night.number ?? (Number(String(night.id).replace(/\D/g, '')) || null);
  const title = missionId ? missionsOf(night).find((m) => m.id === missionId)?.title : null;
  return `Arrives in Night ${n === 1 ? 'One' : n}${title ? `, after ${title}` : ''}`;
}

export function arrivalOf(abilityId, { nights = null } = {}) {
  const def = abilityById(abilityId);
  if (!def) return null;
  const list = nights ?? allNights().filter(Boolean);
  if (def.gadget) {
    const g = abilityId.slice(7);
    const orig = GADGETS.find((x) => x.id === g);
    if (orig) {
      if (!orig.unlock || orig.unlock.step) return { night: 'n1', mission: null, text: 'Arrives in Night One' };
      return { night: null, mission: null, text: 'Arrives after Night One' };
    }
    for (const night of list) {
      const hit = nightRewardList(night).find((r) => rewardGadgetId(r.id) === g);
      if (hit) return { night: night.id, mission: hit.mission, text: nightText(night, hit.mission) };
    }
    return { night: null, mission: null, text: 'Arrives later in the story' };
  }
  const grant = def.grant;
  if (grant === 'start') return { night: null, mission: null, text: 'From the start' };
  if (grant?.step) return { night: 'n1', mission: null, text: 'Arrives in Night One' };
  if (grant?.night) {
    const night = list.find((n) => n.id === grant.night) ?? null;
    return { night: grant.night, mission: grant.after ?? null, text: night ? nightText(night, grant.after ?? null) : 'Arrives later in the story' };
  }
  return { night: null, mission: null, text: 'Arrives later in the story' };
}

// The tree with arrival lines on the nodes whose ability has not arrived yet. `has(abilityId)` is
// the live ability layer's answer (game.abilities.has); a node already built never gets one.
export function withArrivals(tree, has, opts = {}) {
  if (!tree || typeof has !== 'function') return tree;
  return {
    ...tree,
    branches: (tree.branches ?? []).map((br) => ({
      ...br,
      nodes: br.nodes.map((x) => {
        const a = NODE_ABILITY[x.id];
        if (!a || x.state === 'owned' || has(a)) return x;
        const arr = arrivalOf(a, opts);
        return arr ? { ...x, arrives: arr.text } : x;
      }),
    })),
  };
}
