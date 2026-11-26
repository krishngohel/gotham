// The side-chain runner: registers every chain mission with the campaign (registerSideMission),
// lists what the save has unlocked (campaign night + the chain's previous mission), starts a
// mission when a hero walks into its start marker (or from the Batcomputer), and plays its steps
// (chains/data.js) on top of the other open-world systems: crimes, stealth encounters, cases,
// fights and the boss framework. While a mission runs the director spawns nothing and the story
// waits (holdStory). Host-only online. Events: sideMissionAvailable { id, title, chain, pos },
// sideMissionStart { id, chain }, sideMissionStep { id, step, kind }, sideMissionComplete
// { id, chain, chainDone }, sideMissionFailed { id }, missionComplete (the audio stinger).
import { registerSideMission, sideMissionsAvailable } from '../../story/campaign.js';
import { CHAINS, ALL_MISSIONS, CHAIN_SITES, CLAY_STAGES } from './data.js';
import { catBurglarDef, clayBruteDef, twoFaceDef, mercenaryDef, CHAIN_BOSS_IDS } from './bosses.js';
import { chainPages } from './art.js';
import { composeWave } from '../../enemies/compose.js';
import { lookOf } from '../gangs.js';
import { encounterById } from '../stealth/encounters.js';

let registered = false;
const runners = new Set(); // live runners (the registered run() hands its ctx to the first)
export function registerChainMissions() {
  if (registered) return;
  registered = true;
  for (const m of ALL_MISSIONS) {
    try {
      registerSideMission({ id: m.id, title: m.title, kind: 'side', after: m.after, district: m.district, start: m.start, chain: m.chain, index: m.index, run: (ctx) => [...runners][0]?.start(m.id, ctx) });
    } catch { /* already registered (a second game in one page) */ }
  }
}

// Comic scenes for the chains' key beats.
const SCENES = {
  owCatChainIntro: () => chainPages([{ card: ['catBurglar', 'NINE LIVES', 'a side story'], caption: 'Three penthouses. Three empty safes. Not one broken window.', balloon: 'Every safe in this city purrs if you know where to scratch.' }]),
  owCatIntro: () => chainPages([{ card: ['catBurglar', 'COLLECTION DAY', 'the Pemberton roof'], caption: 'Ten o\'clock. The cat comes for her money.', balloon: 'Oh, it is you. I was hoping for the fence. He at least pays.' }]),
  owCatOutro: () => chainPages([{ card: ['catBurglar', 'CAUGHT', 'for now'], caption: 'Cornered on the roof she robbed.', balloon: 'You know they never hold me long. Leave the window open, handsome.' }]),
  owClayChainIntro: () => chainPages([{ card: ['clayBrute', 'FEET OF CLAY', 'a side story'], caption: 'The Yards. A security guard swears the pile of mud stood up.', balloon: 'I used to be a man with a face. Now I can have any face I want.' }]),
  owClayIntro: () => chainPages([{ card: ['clayBrute', 'THE CLAY MAN', 'the Yards'], caption: 'He has swallowed a tanker of binder. He is the size of a truck.', balloon: 'Hit me. Every hole you punch, I fill.' }]),
  owClayOutro: () => chainPages([{ card: ['clayBrute', 'FIRED', 'kiln-dried and cuffed'], caption: 'Crushed, baked and washed out. What is left fits in a van.', balloon: 'Water... always the water...' }]),
  owTwoFaceChainIntro: () => chainPages([{ card: ['twoFace', 'HEADS OR TAILS', 'a side story'], caption: 'Park Row has a new judge. He keeps his verdicts in his pocket.', balloon: 'Justice is blind. So is luck. I am both.' }]),
  owTwoFaceIntro: () => chainPages([{ card: ['twoFace', 'THE VERDICT', 'outside the Orpheum'], caption: 'Hostages on the steps. A coin in the air.', balloon: 'Heads, they walk. Tails, they do not. You may watch.' }]),
  owTwoFaceOutro: () => chainPages([{ card: ['twoFace', 'CASE CLOSED', 'the coin, confiscated'], caption: 'Every hostage home. The coin in an evidence bag.', balloon: 'You think you beat the odds. The odds are patient.' }]),
  owMercChainIntro: () => chainPages([{ card: ['mercenary', 'THE CONTRACT', 'a side story'], caption: 'A price on the Bat. The best in the business took the job.', balloon: 'Nothing personal. I do not do personal. I do paid.' }]),
  owMercIntro: () => chainPages([{ card: ['mercenary', 'THE HUNT', 'Robinson Park'], caption: 'Midnight. The fountain. No witnesses, as requested.', balloon: 'I have hunted men in jungles. A park is a small jungle with benches.' }]),
  owMercOutro: () => chainPages([{ card: ['mercenary', 'CONTRACT VOID', 'the hunter, hunted'], caption: 'Disarmed. Unmasked would take a crowbar.', balloon: 'Someone else will take the contract. They always do.' }]),
};
export const CHAIN_SCENES = Object.keys(SCENES);

export function createChains(ow, { crimes, stealthEnc, cases, bossDeps = null }) {
  const { events, store } = ow;
  const pollers = new Set();
  let run = null;
  const announced = new Set();
  let lookT = 0;
  const until = (fn) => new Promise((resolve) => { const p = { fn, resolve }; pollers.add(p); });
  const once = (name, pred) => new Promise((resolve) => { const off = events.on(name, (d) => { if (!pred || pred(d)) { off?.(); resolve(d); } }); });
  const siteOf = (id) => CHAIN_SITES[id] ?? ow.site(id) ?? ow.spotById?.(id) ?? null;
  const done = (m) => (store.chains[m.chain] ?? 0) > m.index;
  const unlocked = (m) => {
    const avail = new Set(sideMissionsAvailable(campaignView()).map((x) => x.id));
    return avail.has(m.id) && (m.index === 0 || (store.chains[m.chain] ?? 0) >= m.index);
  };
  // The campaign's view, with Night One finished counted for saves that ended it before the
  // campaign field existed.
  const campaignView = () => {
    const c = ow.progress.campaign ?? {};
    return ow.progress.finished && !(c.nightsDone ?? []).includes('n1') ? { ...c, nightsDone: [...(c.nightsDone ?? []), 'n1'] } : c;
  };

  // ---- the bosses join the game's boss director
  const bosses = ow.bosses;
  if (bosses && bossDeps) {
    const opts = {
      sites: { cat: CHAIN_SITES.catArena, twoFace: CHAIN_SITES.twoFaceArena, merc: CHAIN_SITES.mercArena, clay: CLAY_STAGES },
      markers: ow.markers, roofPath: (at, hops) => ow.geo.roofPath(at, hops),
      detectiveNear: (p, r) => ow.players().some((pl) => ow.detective(pl) && Math.hypot(pl.hero.pos.x - p.x, pl.hero.pos.z - p.z) < r),
      hostages: (pts, truth) => ow.hostages?.(pts, truth),
    };
    for (const make of [catBurglarDef, clayBruteDef, twoFaceDef, mercenaryDef]) if (!bosses.has(make(opts)(bossDeps).id)) bosses.register(make(opts)(bossDeps));
  }
  // The chain comics go through the flow's own playScene (cutscene mode, HUD hidden, radio skipped).
  ow.registerScenes?.(SCENES);
  const playScene = (name) => ow.playScene(name);

  // ---- steps
  async function step(s, m) {
    run.stepKind = s.do;
    events.emit('sideMissionStep', { id: m.id, step: run.stepIndex, kind: s.do });
    switch (s.do) {
      case 'talk': if (api.fast) { ow.say(s.lines); return; } await ow.say(s.lines); return;
      case 'comic': await playScene(s.scene); return;
      case 'go': run.target = siteOf(s.at); ow.ui.hint(s.text ?? 'Go to the marker', 3000); await until(() => near(run.target, s.radius ?? 8)); return;
      case 'crime': {
        for (let tries = 0; tries < 99 && run; tries++) {
          const spot = siteOf(s.spot);
          const c = crimes.spawnNow({ type: s.type, spot: { id: s.spot, district: m.district, yaw: 0, ...spot }, twists: s.twists ?? [], life: 1e6 });
          if (!c) return;
          c.forcedFocus = true; c.chain = m.id;
          run.target = c.pos; run.crime = c;
          const end = await once('crimeEnd', (d) => d.id === c.id);
          run.crime = null;
          if (end.outcome === 'stopped') return;
          if (end.outcome === 'cancelled') { abort('cancelled'); return; }
          await ow.say([{ speaker: 'oracle', portrait: 'oracle', text: 'They slipped away. Reset and go again. They will be back.' }]);
        }
        return;
      }
      case 'stealth': {
        const enc = encounterById(s.id);
        if (!enc || !stealthEnc) return;
        run.target = ow.site(enc.entry) ?? enc.entry;
        for (;;) {
          await until(() => !run || near(run.target, 30) || run.fromComputer);
          if (!run) return;
          const t = run.fromComputer; run.fromComputer = false;
          if (!stealthEnc.start(s.id, { teleport: t })) { await until(() => !ow.busyOther?.()); continue; }
          const r = await Promise.race([once('stealthEncounterDone', (d) => d.id === s.id).then(() => 'done'), once('stealthEncounterFailed', (d) => d.id === s.id).then(() => 'failed')]);
          if (r === 'done') return;
          ow.ui.hint('Seen and run off. Go back in when you are ready.', 3500);
        }
      }
      case 'case': {
        cases.start(s.id);
        run.target = null;
        const off = events.on('caseConfront', (d) => { if (d.id === s.id && d.spec?.kind === 'chain') cases.confrontDone(true); });
        await once('caseSolved', (d) => d.id === s.id);
        off?.();
        return;
      }
      case 'fight': {
        const at = siteOf(s.at);
        run.target = at;
        const w = composeWave({ budget: s.budget, district: m.district, act: s.act ?? 3, players: ow.players().length, rng: ow.rng, gang: lookOf(s.gang) });
        const n = w.list.length;
        const list = w.list.map((e, i) => ({ type: e.type, dx: Math.sin((i / n) * 6.28) * 6, dz: Math.cos((i / n) * 6.28) * 6 }));
        const id = `chain:${m.id}`;
        await until(() => !ow.encounters.id || ow.encounters.id.startsWith('crime:'));
        ow.encounters.begin(id, { site: at, radius: 18, gang: w.gang, waves: [list.slice(0, Math.ceil(n / 2)), list.slice(Math.ceil(n / 2))] });
        ow.ui.hint(s.text ?? 'Clear them out', 3500);
        await once('fightDone', (d) => d.id === id);
        return;
      }
      case 'boss': {
        if (!bosses?.has(s.id)) return;
        run.target = bosses.siteOf(s.id);
        await until(() => !run || near(run.target, 40) || run.fromComputer);
        if (!run) return;
        run.boss = s.id;
        await bosses.begin(s.id, { playScene });
        await once('bossDefeated', (d) => d.id === s.id);
        await bosses.outro(s.id, playScene);
        run.boss = null;
        return;
      }
      default:
    }
  }
  const near = (p, r) => !!p && ow.heroes().some((h) => Math.hypot(h.pos.x - p.x, h.pos.z - p.z) < r && Math.abs(h.pos.y - (p.y ?? h.pos.y)) < 8);

  async function play(m, { fromComputer = false } = {}) {
    run = { m, stepIndex: 0, target: siteOf(m.start), fromComputer, boss: null, crime: null };
    store.chainActive = m.id;
    events.emit('sideMissionStart', { id: m.id, chain: m.chain, title: m.title });
    ow.ui.toast(`Side mission: ${m.title}`, CHAINS.find((c) => c.id === m.chain)?.title ?? '', 4500);
    try {
      for (let i = 0; i < m.steps.length && run; i++) {
        run.stepIndex = i;
        await step(m.steps[i], m);
      }
    } catch (e) { console.warn('side mission', m.id, e); }
    if (!run || run.aborted) { events.emit('sideMissionFailed', { id: m.id }); run = null; return false; }
    store.chains[m.chain] = Math.max(store.chains[m.chain] ?? 0, m.index + 1);
    const chain = CHAINS.find((c) => c.id === m.chain);
    const chainDone = store.chains[m.chain] >= chain.missions.length;
    ow.xp(150 + 50 * m.index, 'sideMission');
    if (m.reward) ow.reward(m.reward, { source: 'chain', id: m.id });
    events.emit('missionComplete', { night: 'side', mission: m.id, replay: false });
    events.emit('missionDone', { id: m.id });
    events.emit('sideMissionComplete', { id: m.id, chain: m.chain, chainDone });
    ow.ui.toast(chainDone ? `${chain.title}: complete` : `${m.title}: complete`, chainDone ? 'The chain is done. The Batcomputer has the file.' : 'The next part of the chain is on the map.', 5000);
    ow.save();
    run = null;
    announce();
    return true;
  }
  function abort(reason = 'quit') {
    if (!run) return;
    run.aborted = true;
    if (run.boss) bosses.abort();
    if (run.crime) crimes.debugWin?.(run.crime.id);
    events.emit('sideMissionFailed', { id: run.m.id, reason });
    run = null;
    for (const p of pollers) p.resolve(false);
    pollers.clear();
  }

  function announce() {
    for (const m of ALL_MISSIONS) {
      if (done(m) || !unlocked(m) || announced.has(m.id)) continue;
      announced.add(m.id);
      const p = siteOf(m.start);
      events.emit('sideMissionAvailable', { id: m.id, title: m.title, chain: m.chain, pos: p ? { x: p.x, y: p.y ?? 0, z: p.z } : null });
    }
  }

  const api = {
    fast: false, // dev/e2e: radio lines play without holding the mission
    update(dt) {
      for (const p of pollers) if (p.fn()) { pollers.delete(p); p.resolve(true); }
      if (run) return;
      // Unlocks and start markers: twice a second is plenty (and allocates nothing per frame).
      if ((lookT -= dt) > 0) return;
      lookT = 0.5;
      announce();
      if (ow.busy() || ow.storyHeld?.() || stealthEnc?.active || cases?.active) return; // [m23] storyHeld: never on top of a story beat
      for (const m of ALL_MISSIONS) {
        if (done(m) || !unlocked(m)) continue;
        const p = siteOf(m.start);
        if (p && near(p, 6)) { play(m); return; }
      }
    },
    get active() { return run ? { id: run.m.id, chain: run.m.chain, title: run.m.title, step: run.stepIndex, kind: run.stepKind, boss: run.boss } : null; },
    marker() { return run?.target ?? null; },
    start(id, opts = {}) {
      const m = ALL_MISSIONS.find((x) => x.id === id);
      if (!m || run) return false;
      const p = siteOf(m.start);
      if (opts.teleport !== false && p) ow.teleport(p);
      play(m, { fromComputer: opts.teleport !== false });
      return true;
    },
    abort,
    list() {
      return CHAINS.map((c) => ({ id: c.id, title: c.title, villain: c.villain, blurb: c.blurb, after: c.after, done: store.chains[c.id] ?? 0, total: c.missions.length,
        missions: c.missions.map((m, i) => { const full = ALL_MISSIONS.find((x) => x.id === m.id); return { id: m.id, title: m.title, done: done(full), unlocked: unlocked(full), index: i }; }) }));
    },
    // Death mid-mission: a boss restarts at its phase; a mission crime is already back on.
    onRespawn() {
      if (!run) return null;
      if (run.boss) { bosses.restart(); const s = bosses.siteOf(run.boss); return s ? { x: s.x + 6, y: s.y, z: s.z + 6 } : null; }
      return null;
    },
    holdStory: () => !!run,
    // Dev/e2e: unlock everything, finish the step in play.
    debugUnlock() { for (const c of CHAINS) store.chains[c.id] ??= 0; if (!(ow.progress.campaign.nightsDone ?? []).includes(CHAINS[3].after)) ow.progress.campaign.nightsDone = [...new Set([...(ow.progress.campaign.nightsDone ?? []), 'n1', 'n2', 'n3', 'n4'])]; },
    debugStep() {
      if (!run) return false;
      if (run.boss) { bosses.debugWin(); return true; }
      if (run.crime) { crimes.debugWin(run.crime.id); return true; }
      if (run.stepKind === 'stealth') { stealthEnc.debugWin(); return true; }
      if (run.stepKind === 'case') { cases.debugSolve(); return true; }
      if (run.stepKind === 'fight') { ow.winFight?.(); return true; }
      if (run.target) { ow.teleport(run.target); return true; }
      return false;
    },
  };
  runners.add(api);
  registerChainMissions();
  return api;
}
export { CHAIN_BOSS_IDS };
