// Fear and reputation (design doc section 5, "fear and reputation"; workstream I builds it, J and
// K read it). Pure: no DOM, no three.js, no allocation in tick() or the per-frame readers.
//
// Interface:
//   createFear({ rng, bias = 0 })        one per fight (squad). bias: starting fear from the city's
//                                        reputation (reputation.fearBias()).
//     .join(id, { base })                an enemy enters the fight (base: its own nerve, 0..1)
//     .leave(id)                         it is gone (KO'd, despawned)
//     .note(kind, data)                  something happened (kinds below); the combat code calls it
//     .tick(dt)                          fear decays toward the squad's floor; once per frame
//     .fearOf(id), .squad                0..1 readers
//     .decide(id, { alone, armed, lieutenant }) -> 'steady' | 'hesitant' | 'wild' | 'dropWeapon'
//                                        | 'surrender' | 'flee'; the enemy AI calls it when it is
//                                        free to choose (not mid-attack), a few times a second
//     .effects(state)                    numbers the AI applies for that state (shared objects:
//                                        read, never write)
//   Kinds for note(): 'silentTakedown', 'ko' ({ witnesses: ids that saw it }), 'combo' ({ n }),
//   'gadgetFromDark', 'lastStanding', 'lieutenantDown', 'heroHurt', 'revive', 'reinforcements'.
//
//   createReputation(saved?)             the city-wide number (0..100, 50 = unknown). Other
//                                        workstreams read .value / .gangs and call .add(); wave 3
//                                        persists toJSON() and restores with createReputation(json).
//     .value, .gangs ({ [gangId]: 0..100 }), .add(kind, amount = 1, gang = null), .fearBias(gang?),
//     .toJSON()
//
// Fear is raised by how the player fights (silent takedowns, a squad dwindling to its last man,
// long combos, gadgets out of the dark) and lowered by the squad's own successes (hurting the
// hero, a revive, reinforcements, a lieutenant's presence). It decays slowly toward a floor set by
// how the fight is going, so a fight that has turned stays turned.

// How much each event moves fear: [own (the enemy named in data.id or the witnesses), squad].
const NOTE = {
  silentTakedown: [0.3, 0.12],
  ko: [0.12, 0.06],
  combo: [0, 0.015], // per hit of the combo past 5
  gadgetFromDark: [0.15, 0.08],
  lastStanding: [0.35, 0.2],
  lieutenantDown: [0.25, 0.25],
  heroHurt: [-0.05, -0.04],
  revive: [-0.1, -0.08],
  reinforcements: [-0.15, -0.12],
};
// Shared effect objects (the AI reads them; nothing writes them).
const EFFECTS = {
  steady: Object.freeze({ windupDelay: 0, tellScale: 1, missChance: 0, attack: true, keepDistance: 0 }),
  hesitant: Object.freeze({ windupDelay: 0.6, tellScale: 1.25, missChance: 0.1, attack: true, keepDistance: 1.5 }),
  wild: Object.freeze({ windupDelay: -0.15, tellScale: 0.9, missChance: 0.45, attack: true, keepDistance: 0 }),
  dropWeapon: Object.freeze({ windupDelay: 0, tellScale: 1, missChance: 0, attack: false, keepDistance: 3 }),
  surrender: Object.freeze({ windupDelay: 0, tellScale: 1, missChance: 1, attack: false, keepDistance: 0 }),
  flee: Object.freeze({ windupDelay: 0, tellScale: 1, missChance: 1, attack: false, keepDistance: 30 }),
};
export const FEAR_STATES = Object.keys(EFFECTS);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// [verify] gain: () => the skill tree's fearGain (Dread, a predator node; docs/design/progression.md 2),
// read at each note: what the player does to scare a squad (the positive moves) is scaled by it.
export function createFear({ rng = null, bias = 0, gain = null } = {}) {
  const rand = () => (rng ? rng.next() : Math.random());
  const own = new Map(); // id -> fear 0..1
  const nerve = new Map(); // id -> base 0..1 (how brave this one is)
  let squad = clamp01(bias * 0.5);
  // The floor fear decays toward: rises with how badly the fight is going.
  let floor = squad;
  let joined = 0, gone = 0;

  const raise = (id, d) => { if (own.has(id)) own.set(id, clamp01(own.get(id) + d)); };
  // tick() without an iterator per frame: forEach with one bound callback.
  let tickK = 0;
  const decayOne = (f, id) => { own.set(id, f + (Math.max(floor, squad * 0.7) - f) * tickK); };
  const raiseAll = (d) => { for (const [id, f] of own) own.set(id, clamp01(f + d)); };

  return {
    join(id, { base = 0.5 } = {}) {
      joined += 1;
      nerve.set(id, clamp01(base));
      own.set(id, clamp01(squad * 0.8 + bias * 0.3));
    },
    leave(id) {
      if (own.delete(id)) gone += 1;
      nerve.delete(id);
      floor = clamp01(Math.max(floor, (gone / Math.max(1, joined)) * 0.45 + bias * 0.2));
    },
    note(kind, data = {}) {
      const n = NOTE[kind];
      if (!n) return;
      let [o, s] = n;
      if (kind === 'combo') s *= Math.max(0, (data.n ?? 0) - 5);
      if (gain) { const g = gain(); if (Number.isFinite(g) && g > 0) { if (o > 0) o *= g; if (s > 0) s *= g; } } // [verify] fearGain
      squad = clamp01(squad + s);
      if (o) {
        if (data.witnesses) for (const id of data.witnesses) raise(id, o);
        else if (data.id !== undefined) raise(data.id, o);
        else raiseAll(o * 0.5);
      }
      if (s) raiseAll(s * 0.5);
      if (kind === 'lastStanding' || kind === 'lieutenantDown') floor = clamp01(floor + 0.1);
      if (s < 0) floor = clamp01(floor + s * 0.5);
    },
    tick(dt) {
      // Fear fades toward the floor (half-life about 8 s): a panic passes, a lost fight doesn't.
      const k = 1 - Math.pow(0.5, dt / 8);
      squad += (floor - squad) * k;
      tickK = k;
      own.forEach(decayOne);
    },
    fearOf(id) { return own.get(id) ?? squad; },
    get squad() { return squad; },
    // What this enemy does with its fear. Deterministic given the rng sequence.
    decide(id, { alone = false, armed = true, lieutenant = false } = {}) {
      const brave = nerve.get(id) ?? 0.5;
      let f = (own.get(id) ?? squad) * 0.7 + squad * 0.3 - (brave - 0.5) * 0.3;
      if (alone) f += 0.25;
      if (lieutenant) f -= 0.2;
      f = clamp01(f);
      const r = rand();
      if (f < 0.35) return 'steady';
      if (f < 0.55) return r < 0.7 ? 'hesitant' : 'wild';
      if (f < 0.75) return armed && r < 0.4 ? 'dropWeapon' : r < 0.75 ? 'hesitant' : 'wild';
      if (alone) return r < 0.55 ? 'surrender' : 'flee';
      return r < 0.3 ? 'flee' : r < 0.55 ? 'surrender' : armed ? 'dropWeapon' : 'hesitant';
    },
    effects(state) { return EFFECTS[state] ?? EFFECTS.steady; },
  };
}

// Reputation: what the city's criminals think of the Bat. Moves slowly; per-gang values move
// faster than the city's.
const REP_WEIGHT = {
  silentTakedown: 0.4, ko: 0.08, fightWon: 1, fightFled: -1.5, heroDown: -2, surrender: 0.6, flee: 0.4, comboBig: 0.5, crimeStopped: 1,
};
const clamp100 = (v) => (v < 0 ? 0 : v > 100 ? 100 : v);

export function createReputation(saved = {}) {
  let value = clamp100(Number.isFinite(saved.value) ? saved.value : 50);
  const gangs = {};
  if (saved.gangs && typeof saved.gangs === 'object') for (const [k, v] of Object.entries(saved.gangs)) if (Number.isFinite(v)) gangs[k] = clamp100(v);
  return {
    get value() { return value; },
    get gangs() { return gangs; },
    // kind: a REP_WEIGHT key, or a raw number of points when kind is 'points'.
    add(kind, amount = 1, gang = null) {
      const w = kind === 'points' ? 1 : REP_WEIGHT[kind] ?? 0;
      const d = w * amount;
      value = clamp100(value + d);
      if (gang) gangs[gang] = clamp100((gangs[gang] ?? value) + d * 2);
      return value;
    },
    // 0..1: how scared a new squad starts out (50 = no bias).
    fearBias(gang = null) {
      const v = gang && gangs[gang] !== undefined ? gangs[gang] : value;
      return v <= 50 ? 0 : (v - 50) / 50;
    },
    toJSON() { return { value, gangs: { ...gangs } }; },
  };
}
