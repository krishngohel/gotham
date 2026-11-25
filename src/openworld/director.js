// The city director (pure): per-district heat (0..5) and gang control that evolve with what the
// players do and ignore, lieutenants who take over boiling districts, where and what the next
// crime is, and the pacing governor that keeps the story in front. No three.js, no DOM; the
// runtime (crimeRuntime.js via index.js) feeds it the clock, the weather, the heroes and the story's mode.
//
// Heat rules (research 5.3): crimes stopped cool a district; crimes ignored, expired or escaped
// heat it; a district with nobody looking slowly heats up at night and slowly cools by day. Heat
// tiers pick the mix (0-1 muggings, 2-3 robberies and chases, 4 hostages, gang wars and bombs, 5 a
// lieutenant). Gang control shifts toward whoever the players leave alone.
import { CRIME_TYPES, typeFits, tierOfHeat } from './crimeTypes.js';
import { startingControl, topGang, GANGS, LIEUTENANT_NAMES, DISTRICT_LIST } from './gangs.js';

export const HEAT = {
  stopped: -0.7, stoppedPerTier: -0.15, failed: 0.45, expired: 0.35, getaway: 0.3, hurt: 0.25,
  // Per minute: an unwatched district warms toward idleBase at night (more if it has seen
  // failures); by day the city cools.
  nightDrift: 0.015, dayDrift: -0.02, idleBase: 2.2,
  lieutenantAt: 4.4, lieutenantControl: 0.55, max: 5,
};
// How many crimes may be live at once, by quality tier (entity caps), and the gaps between them.
export const CAPS = { potato: 2, low: 3, medium: 4, high: 5, ultra: 6 };
export const GAP = { first: 35, min: 22, max: 55, retry: 8, storyQuiet: 25 };
export const LIFE = { base: 170, perTier: 20 }; // seconds a crime waits before it is over (expired)
export const DISCOVER = { sound: 75, sight: 55, min: 38, max: 320 };

const NONE = Object.freeze([]);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// What the story allows right now (the pacing governor). The story is never drowned: no crime
// during fights, bosses, cutscenes, challenges, photo mode, comics or a side mission's own beat;
// one at a time while a story objective is waiting (and never near it); the full cap in free roam.
// Results are shared frozen objects (no allocation per frame).
const HALT = Object.freeze({ spawn: false, age: false, cap: 0 });
const STOP_TYPES = new Set(['fight', 'boss', 'cutscene', 'chase', 'battle', 'armada', 'board', 'puzzle', 'fear']);
const GOV = new Map();
const gov = (spawn, cap) => { const k = (spawn ? 100 : 0) + cap; let g = GOV.get(k); if (!g) { g = Object.freeze({ spawn, age: true, cap }); GOV.set(k, g); } return g; };
export function governor({ mode = 'play', stepType = null, freeRoam = false, challenge = false, photo = false, mission = false, sinceStep = 999, quality = 'high' } = {}) {
  const cap = CAPS[quality] ?? CAPS.high;
  if (mode !== 'play' || challenge || photo || mission) return HALT;
  if (STOP_TYPES.has(stepType)) return HALT;
  if (freeRoam || !stepType || stepType === 'credits' || stepType === 'nightEnd') return gov(true, cap);
  // A story objective is waiting: at most a couple of crimes, and a quiet spell after a new step.
  return gov(sinceStep > GAP.storyQuiet, Math.min(2, cap));
}

export function createCityDirector({ store, rng, districts = DISTRICT_LIST, spots = [], typeList = CRIME_TYPES } = {}) {
  const D = store.districts;
  const ensure = (d) => (D[d] ??= { heat: 1, control: startingControl(d), stopped: 0, failed: 0, lt: null });
  for (const d of districts) ensure(d);
  const byDistrict = new Map();
  for (const s of spots) { if (!byDistrict.has(s.district)) byDistrict.set(s.district, []); byDistrict.get(s.district).push(s); }
  const recentTypes = [];
  let timer = GAP.first;
  let serial = 0;
  const events = []; // director events for the runtime this tick (lieutenant, mood change); reused

  const heat = (d) => ensure(d).heat;
  const tier = (d) => tierOfHeat(heat(d));
  function mood(d) {
    const h = heat(d);
    return h < 0.6 ? 'safe' : h < 1.6 ? 'calm' : h < 2.8 ? 'uneasy' : h < 4 ? 'tense' : 'lawless';
  }
  function bump(d, amount) {
    const r = ensure(d);
    const before = mood(d);
    r.heat = clamp(r.heat + amount, 0, HEAT.max);
    if (mood(d) !== before) events.push({ type: 'mood', district: d, mood: mood(d), from: before });
  }
  // Shares stay summing to 1. A gang that loses ground loses it to 'free' (streets the Bat has
  // taken back); a gang that gains takes it from everyone else in proportion.
  function shift(d, gang, amount) {
    const c = ensure(d).control;
    const before = c[gang] ?? 0;
    const after = clamp(before + amount, 0, 1);
    const delta = after - before;
    if (!delta) return;
    c[gang] = after;
    if (delta < 0) { c.free = (c.free ?? 0) - delta; return; }
    const others = Object.keys(c).filter((g) => g !== gang);
    const sum = others.reduce((n, g) => n + c[g], 0);
    if (sum > 0) for (const g of others) c[g] = Math.max(0, c[g] - (c[g] / sum) * delta);
  }
  // Cocky gangs: a hot district whose gang isn't scared of the Bat sets traps (ambush twists).
  function cocky(d, rep = null) {
    const g = topGang(ensure(d).control);
    const fear = rep?.gangs?.[g] ?? rep?.value ?? 50;
    return clamp((heat(d) - 2) / 3, 0, 1) * clamp((70 - fear) / 40, 0, 1);
  }
  // Civilians at night: cleaned districts get busier, neglected ones empty (shutters down).
  const densityScale = (d) => [1.35, 1.15, 1, 0.8, 0.6][Math.min(4, Math.floor(heat(d)))];

  function maybeLieutenant(d) {
    const r = ensure(d);
    if (r.lt || r.heat < HEAT.lieutenantAt) return;
    const g = topGang(r.control);
    if ((r.control[g] ?? 0) < HEAT.lieutenantControl) return;
    const names = LIEUTENANT_NAMES[GANGS[g]?.theme ?? 'street'] ?? LIEUTENANT_NAMES.street;
    r.lt = { name: names[Math.floor(rng.next() * names.length)], gang: g, beaten: 0, memory: [] };
    events.push({ type: 'lieutenant', district: d, lt: r.lt });
  }

  // Next crime: a district weighted by heat among those visited and in range of a hero, a type
  // that fits (heat band, hour, weather, not one of the last three), a spot clear of heroes, other
  // crimes and the story's objective.
  function choose(ctx) {
    const { visited = districts, heroes = [], hour = 23, weather = 'clear', avoid = null, live = [], forced = null } = ctx;
    if (forced) {
      const spot = forced.spot ?? (forced.district ? pickSpot(forced.district, ctx, true) : null);
      if (!spot) return null;
      return { type: forced.type, spot, district: spot.district, forced: true };
    }
    const cands = [];
    for (const d of visited) {
      if (!byDistrict.has(d)) continue;
      const near = byDistrict.get(d).some((s) => heroes.some((h) => Math.hypot(h.x - s.x, h.z - s.z) < DISCOVER.max));
      if (!near) continue;
      cands.push({ d, w: 1 + heat(d) * 0.8 });
    }
    if (!cands.length) return null;
    for (let tries = 0; tries < 4; tries++) {
      const d = weighted(cands, rng).d;
      const types = typeList.filter((t) => typeFits(t, { district: d, heat: heat(d), hour, weather }) && !t.special);
      if (!types.length) continue;
      const fresh = types.filter((t) => !recentTypes.includes(t.id));
      const pool = fresh.length ? fresh : types;
      const t = weighted(pool.map((x) => ({ t: x, w: x.optional ? 0.5 : x.districts ? 1.6 : 1 })), rng).t;
      const spot = pickSpot(d, ctx);
      if (spot) return { type: t.id, spot, district: d };
    }
    return null;
    function pickSpot(dd, c, any = false) {
      const list = (byDistrict.get(dd) ?? []).filter((s) => {
        if (any) return true;
        for (const h of c.heroes ?? []) { const dist = Math.hypot(h.x - s.x, h.z - s.z); if (dist < DISCOVER.min) return false; }
        if (!(c.heroes ?? []).some((h) => Math.hypot(h.x - s.x, h.z - s.z) < DISCOVER.max)) return false;
        if (c.avoid && Math.hypot(c.avoid.x - s.x, c.avoid.z - s.z) < 70) return false;
        for (const l of c.live ?? []) if (Math.hypot(l.x - s.x, l.z - s.z) < 45) return false;
        return true;
      });
      return list.length ? list[Math.floor(rng.next() * list.length)] : null;
    }
  }

  return {
    get timer() { return timer; },
    heat, tier, mood, cocky, densityScale, bump, shift,
    district: ensure,
    // Per frame (or a few times a second). Returns a spawn request { type, spot, district, id } or
    // null; director events (mood changes, lieutenants) collect in drain().
    tick(dt, ctx) {
      const gov = ctx.gov ?? governor(ctx);
      // Heat drift: one minute of night with nobody stopping anything warms every district a
      // little toward idleBase; by day the city cools.
      const night = (ctx.hour ?? 23) >= 19 || (ctx.hour ?? 23) < 6;
      const k = dt / 60;
      for (const d of districts) {
        const r = ensure(d);
        if (night && r.heat < HEAT.idleBase + Math.min(1.5, r.failed * 0.15)) r.heat = Math.min(HEAT.max, r.heat + HEAT.nightDrift * k);
        else if (!night && r.heat > 0.3) r.heat = Math.max(0, r.heat + HEAT.dayDrift * k);
        maybeLieutenant(d);
      }
      if (ctx.forced ? !gov.age : (!gov.spawn || (ctx.live?.length ?? 0) >= gov.cap)) return null;
      timer -= dt;
      if (timer > 0 && !ctx.forced) return null;
      const pick = choose(ctx);
      if (!pick) { timer = GAP.retry; return null; }
      timer = GAP.min + rng.next() * (GAP.max - GAP.min) * (1 - Math.min(0.5, (ctx.live?.length ?? 0) * 0.1));
      recentTypes.push(pick.type);
      if (recentTypes.length > 3) recentTypes.shift();
      serial += 1;
      return { ...pick, id: `ow${serial}`, life: LIFE.base + LIFE.perTier * tier(pick.district) };
    },
    force() { timer = 0; },
    // A crime ended. result = { outcome: 'stopped'|'failed'|'expired'|'abandoned'|'getaway', tier,
    //   gang, gangs, hurt, sided, arrests, lieutenant }
    outcome(district, result) {
      const r = ensure(district);
      const t = result.tier ?? 0;
      if (result.outcome === 'stopped') {
        r.stopped += 1;
        bump(district, HEAT.stopped + HEAT.stoppedPerTier * t + HEAT.hurt * (result.hurt ?? 0));
        for (const g of result.gangs ?? [result.gang]) if (g && g !== result.sided) shift(district, g, -0.06 - 0.02 * t);
        if (result.sided) shift(district, result.sided, 0.08);
      } else if (result.outcome === 'abandoned' || result.outcome === 'cancelled') {
        // Walking away or the story calling it off is not neglect.
      } else {
        r.failed += 1;
        bump(district, result.outcome === 'expired' ? HEAT.expired : result.outcome === 'getaway' ? HEAT.getaway : HEAT.failed);
        if (result.gang) shift(district, result.gang, 0.05);
      }
    },
    // A lieutenant beaten: the district's top gang loses its grip; he remembers how (memory).
    lieutenantBeaten(district, how = []) {
      const r = ensure(district);
      if (!r.lt) return;
      r.lt.beaten += 1;
      r.lt.memory = [...new Set([...r.lt.memory, ...how])].slice(-4);
      shift(district, r.lt.gang, -0.25);
      bump(district, -1.5);
      if (r.lt.beaten >= 2) r.lt = null; // twice beaten: he's done in this town
    },
    drain() { if (!events.length) return NONE; const out = events.slice(); events.length = 0; return out; },
    summary() {
      return districts.map((d) => {
        const r = ensure(d);
        return { district: d, heat: r.heat, tier: tier(d), mood: mood(d), gang: topGang(r.control), control: { ...r.control }, stopped: r.stopped, failed: r.failed, lt: r.lt };
      });
    },
  };
}

function weighted(list, rng) {
  const total = list.reduce((n, x) => n + x.w, 0);
  let r = rng.next() * total;
  for (const x of list) { r -= x.w; if (r <= 0) return x; }
  return list[list.length - 1];
}
