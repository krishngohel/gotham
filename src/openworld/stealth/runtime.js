// Open-world predator encounters at run time (workstream J3, item 4). One encounter at a time,
// through the encounter system (src/game/encounters.js begin(id, roomFight(...))), so the
// existing stealth runtime (src/stealth/stealthSystem.js) drives patrols, sight, takedowns, the
// alarm and fear exactly as in the story's rooms. This file adds what the open world needs:
// discovery in free roam, replay from the Batcomputer, optional objectives (never seen, no
// gadgets, under the time), medals and best times in progress.openworld.stealth, rewards, and the
// lieutenant's detector (a standing hero within a few metres of him is "heard").
//
// Host-only online (the encounter system and the stealth update are host-only, coop-seams.md 3).
// Events: stealthEncounterNear { id, pos }, stealthEncounterStart { id, title }, stealthEncounterDone
// { id, time, medal, opts, best }, stealthEncounterFailed { id, reason }.
import { STEALTH_ENCOUNTERS, encounterById, stealthMedal, OPTIONAL_TEXT } from './encounters.js';
import { roomFight, registerNightRooms } from '../../story/rooms.js';
import { REGION_SITES } from '../../world/regions/data.js';
import { SITES } from '../../world/mapData.js';

export const FIGHT_PREFIX = 'stealth:';
export const DETECTOR = { range: 9, dwell: 0.8, radius: 14, cooldown: 3 };
export const NEAR = 60;
const REWARD_XP = { gold: 300, silver: 200, bronze: 120, none: 60 };
const MEDAL_RANK = { gold: 3, silver: 2, bronze: 1 };

// The lieutenant's detector (pure): a hero standing (not crouched) within DETECTOR.range of him
// for DETECTOR.dwell seconds is heard. `st` carries the dwell between calls. Returns that hero or
// null. Allocation-free.
export function detectorPing(lt, heroes, dt, st) {
  let heard = null;
  for (let i = 0; i < heroes.length; i++) {
    const h = heroes[i];
    if (!h || h.dead || h.crouched) continue;
    const p = h.pos;
    if (Math.abs(p.y - lt.y) > 4 || Math.hypot(p.x - lt.x, p.z - lt.z) > DETECTOR.range) continue;
    heard = h;
    break;
  }
  st.t = heard ? st.t + dt : 0;
  if (heard && st.t >= DETECTOR.dwell) { st.t = 0; return heard; }
  return null;
}

export function createStealthEncounters(ow) {
  const { events } = ow;
  const store = () => (ow.store.stealth ??= {});
  const site = (s) => (typeof s === 'string' ? ow.site?.(s) ?? REGION_SITES[s] ?? SITES[s] ?? null : s);
  let run = null; // { enc, id, t, seen, gadgets, det: { t, cool }, lt }
  const announced = new Set();
  let nearT = 0;

  function begin(enc) {
    const room = { ...enc };
    // Lazily dress the room (crates with collision, lamp posts), once, like a night's rooms.
    try { registerNightRooms({ rooms: { [enc.id]: room } }); } catch { /* no scene in tests */ }
    const fight = roomFight(room, site);
    ow.encounters.begin(FIGHT_PREFIX + enc.id, fight);
  }

  function finish(won) {
    const r = run;
    if (!r) return;
    run = null;
    if (!won) { events.emit('stealthEncounterFailed', { id: r.enc.id, reason: 'quit' }); return; }
    const time = Math.round(r.t * 10) / 10;
    const opts = [];
    if (!r.seen) opts.push('unseen');
    if (!r.gadgets) opts.push('noGadgets');
    const lim = r.enc.optional.find((o) => o.id === 'time')?.limit ?? Infinity;
    if (r.t <= lim) opts.push('time');
    const medal = stealthMedal(r.enc, r.t);
    const prev = store()[r.enc.id];
    const best = prev ? Math.min(prev.best, time) : time;
    const keep = prev && (MEDAL_RANK[prev.medal] ?? 0) > (MEDAL_RANK[medal] ?? 0) ? prev.medal : medal;
    store()[r.enc.id] = { best, medal: keep ?? null, opts: [...new Set([...(prev?.opts ?? []), ...opts])] };
    ow.save?.();
    // Rewards: XP every clear (more for a better medal, a little per optional), a lore entry the
    // first time, and one for clearing every optional objective.
    ow.xp?.(REWARD_XP[medal ?? 'none'] + opts.length * 25, 'stealth');
    if (!prev) ow.reward?.([`lore:stealth.${r.enc.id}`], { source: 'stealth' });
    if (opts.length === r.enc.optional.length) ow.reward?.([`upgrade:predator.${r.enc.id}`], { source: 'stealth' });
    events.emit('stealthEncounterDone', { id: r.enc.id, time, medal, opts, best });
    ow.ui?.toast?.(r.enc.title, `${medal ? `${medal[0].toUpperCase()}${medal.slice(1)} ` : ''}${formatTime(time)}${opts.length ? ` - ${opts.map((o) => OPTIONAL_TEXT[o]).join(', ')}` : ''}`, 6000);
  }

  const offs = [
    events.on('fightDone', ({ id } = {}) => { if (run && id === FIGHT_PREFIX + run.enc.id) finish(true); }),
    events.on('stealthAlarm', () => { if (run) run.seen = true; }),
    events.on('gadgetUse', () => { if (run) run.gadgets = true; }),
  ];

  // The live lieutenant of the running encounter (for the detector), found among the fight's goons.
  function lieutenant() {
    const list = ow.encounters.enemies ?? ow.combat?.enemies ?? [];
    for (let i = 0; i < list.length; i++) if (list[i].type === 'lieutenant' && list[i].alive && !list[i].down) return list[i];
    return null;
  }

  const api = {
    list() {
      const s = store();
      return STEALTH_ENCOUNTERS.map((e) => ({ id: e.id, title: e.title, district: e.district, blurb: e.blurb, best: s[e.id]?.best ?? null, medal: s[e.id]?.medal ?? null, opts: s[e.id]?.opts ?? [], played: !!s[e.id], unlocked: true, medals: e.medals, optional: e.optional }));
    },
    get active() { return run ? { id: run.enc.id, title: run.enc.title, t: run.t, seen: run.seen, gadgets: run.gadgets } : null; },
    // Starts one (replay from the Batcomputer, or a dev hook). teleport: player 0 to the entry.
    start(id, { teleport = true } = {}) {
      const enc = encounterById(id);
      if (!enc || run || ow.busy?.()) return false;
      if (teleport) ow.teleport?.(enc.entry);
      run = { enc, t: 0, seen: false, gadgets: false, det: { t: 0, cool: 0 } };
      begin(enc);
      events.emit('stealthEncounterStart', { id: enc.id, title: enc.title });
      ow.ui?.toast?.(enc.title, enc.blurb, 6000);
      if (enc.lines?.length) ow.say?.(enc.lines);
      return true;
    },
    quit() {
      if (!run) return;
      if (ow.encounters.id === FIGHT_PREFIX + run.enc.id) ow.encounters.end();
      finish(false);
    },
    update(dt) {
      if (run) {
        // A story beat or a crime took the encounter system: the encounter is over (not failed by the player).
        if (ow.encounters.id !== FIGHT_PREFIX + run.enc.id) { finish(false); return; }
        run.t += dt;
        const lt = lieutenant();
        if (lt) {
          run.det.cool -= dt;
          const heard = detectorPing(lt.pos, ow.heroes(), dt, run.det);
          if (heard && run.det.cool <= 0) {
            run.det.cool = DETECTOR.cooldown;
            ow.stealth?.noise?.(heard.pos, DETECTOR.radius, 'detector');
            events.emit('stealthDetector', { pos: { x: heard.pos.x, y: heard.pos.y, z: heard.pos.z } });
          }
        }
        return;
      }
      // Free roam: an unplayed encounter announces itself once when a hero comes near.
      nearT -= dt;
      if (nearT > 0) return;
      nearT = 0.5;
      const m = api.marker();
      if (m && !announced.has(m.id)) {
        announced.add(m.id);
        events.emit('stealthEncounterNear', { id: m.id, pos: { x: m.pos.x, y: m.pos.y, z: m.pos.z } });
        ow.ui?.hint?.(`${encounterById(m.id).title}: a predator encounter. Get close and stay unseen.`, 4500);
      }
    },
    // The nearest unplayed encounter within NEAR metres of a hero: { id, pos } or null.
    marker() {
      if (run) return null;
      const s = store();
      let best = null, bd = NEAR;
      for (const h of ow.heroes()) {
        for (const e of STEALTH_ENCOUNTERS) {
          if (s[e.id]) continue;
          const d = Math.hypot(h.pos.x - e.entry.x, h.pos.z - e.entry.z);
          if (d < bd) { bd = d; best = e; }
        }
      }
      return best ? { id: best.id, pos: best.entry } : null;
    },
    // A hero walked into an unplayed encounter's area in free roam: begin it there (no teleport).
    engageNear(radius = 25) {
      const m = api.marker();
      if (!m) return false;
      const e = encounterById(m.id);
      if (!ow.heroes().some((h) => Math.hypot(h.pos.x - e.entry.x, h.pos.z - e.entry.z) < radius)) return false;
      return api.start(m.id, { teleport: false });
    },
    // Dev: KO the encounter's squad through combat (as window.__game.winFight does).
    debugWin() {
      if (!run) return;
      const from = ow.heroes()[0]?.pos ?? { x: 0, y: 0, z: 0 };
      for (const e of [...(ow.encounters.enemies ?? [])]) if (e.alive) { e.health = 0; e.applyHit?.({ outcome: 'ko' }, from); }
    },
    hud() {
      if (!run) return null;
      const lim = run.enc.optional.find((o) => o.id === 'time')?.limit;
      return { title: run.enc.title, time: formatTime(run.t), unseen: !run.seen, noGadgets: !run.gadgets, underTime: lim ? run.t <= lim : true, gold: formatTime(run.enc.medals.gold) };
    },
    destroy() { for (const off of offs) off?.(); },
  };
  return api;
}

export function formatTime(s) {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}
