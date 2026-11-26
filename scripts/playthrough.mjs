// Automated run through every story step: teleports to each objective, wins each fight,
// grabs each item, reads each comic. Screenshots of every comic page go to $OUT.
import { chromium, firefox } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:5200/';
const out = process.env.OUT ?? 'playthrough';
mkdirSync(out, { recursive: true });
// ENGINE=firefox plays the story in Firefox instead (muted through its volume pref).
const browser = process.env.ENGINE === 'firefox'
  ? await firefox.launch({ firefoxUserPrefs: { 'webgl.force-enabled': true, 'media.volume_scale': '0.0' } })
  : await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
// [net] NET=broadcast: the same run with an online partner in a second page of the same browser
// (BroadcastChannel transport, workstream D2). The host page is driven exactly as below; the guest
// page follows the host's story as a replica, reads its own comics, and must reach the credits with
// the same story state.
const NET = process.env.NET === 'broadcast';
const ctx = NET ? await browser.newContext({ viewport: { width: 1280, height: 720 } }) : null;
const page = NET ? await ctx.newPage() : await browser.newPage({ viewport: { width: 1280, height: 720 } });
const guest = NET ? await ctx.newPage() : null;
const guestErrors = [];
if (guest) { guest.on('console', (m) => { if (m.type() === 'error') guestErrors.push(m.text()); }); guest.on('pageerror', (e) => guestErrors.push(e.message)); }
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
const start = process.env.START;
// [story] NIGHT=n2 starts at a campaign night (NIGHT=n2 START=<step> at a step in it); CAMPAIGN=1
// carries on past Night One's credits through every night written so far.
const night = process.env.NIGHT;
const campaign = process.env.CAMPAIGN === '1' || !!night;
// [m45] UNTIL=n5: stop once that night is done (the run has just entered the night after it), so
// NIGHT=n4 UNTIL=n5 plays two nights and still prints every check below. The NET check then compares
// the guest's night and step with the host's there, instead of asking for the credits.
const until = process.env.UNTIL ?? null;
// P2=bot: the same run with a second local player (a scripted bot, split screen; workstream D1).
// P2KIT picks its hero (default Robin, a roster kit with its own model, traversal and moves).
const p2 = process.env.P2 === 'bot' ? `&p2=bot&p2kit=${process.env.P2KIT ?? 'robin'}` : '';
// [onboard] abilities=story: ?god=1 alone opens every ability (a sandbox); the run plays the story's
// gates instead and checks the order they open in (below).
page.setDefaultNavigationTimeout(Number(process.env.READY_MS ?? 30000)); // [m23]
await page.goto(base + (night ? `?new=1&night=${night}${start ? `&at=${start}` : ''}&god=1` : start ? `?at=${start}&god=1` : '?new=1&god=1') + '&abilities=story' + p2 + (NET ? '&net=broadcast' : '') + (process.env.QUALITY ? `&q=${process.env.QUALITY}` : '')); // [story2] QUALITY=potato: no auto-tier reload under load; [verify] the game reads ?q= (src/game/game.js tierChoice), not ?quality=
// [m23] READY_MS: a longer wait for the first frame on a machine busy with other runs (default 90 s).
await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 20, null, { timeout: Number(process.env.READY_MS ?? 90000) });
if (!start && !night) await page.evaluate(() => { document.querySelector('.mbtn.primary').click(); document.querySelector('.suit-card.suit-m').click(); });
await page.waitForFunction(() => window.__game?.gadgets, null, { timeout: 60000 });
// [net] The guest joins with the room code the host's invite shows, and picks Robin.
async function joinGuest() {
  await guest.goto(base + '?net=broadcast&god=1');
  await guest.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 20, null, { timeout: 90000 });
  await page.evaluate(() => window.__game.openNet((n) => n.inviteFromRun()));
  await page.waitForSelector('.net-host-panel .net-code');
  const code = await page.$eval('.net-host-panel .net-code', (e) => e.dataset.code);
  await guest.evaluate(() => window.__game.openNet((n) => n.openJoin()));
  await guest.fill('.net-join-panel input.code', code);
  await guest.click('.net-join-panel .mbtn.primary');
  await guest.waitForSelector('.hero-select.show [data-act="ok"][data-col="0"]', { timeout: 30000 });
  await guest.click('.hero-select.show [data-act="ok"][data-col="0"]');
  await guest.waitForFunction(() => window.__game.net?.runStarted && window.__game.players?.length === 2, null, { timeout: 60000 });
  await page.evaluate(() => { document.querySelector('.net-host-panel')?.remove(); });
  console.log('guest joined with code', code);
}
const guestState = () => guest.evaluate(() => { const G = window.__game, s = G.flow?.objectives.step; return { id: s?.id ?? null, type: s?.type ?? null, mode: G.flow?.mode, enemies: G.enemies?.length ?? 0, role: G.net?.role }; });
if (NET) await joinGuest();
await page.evaluate(() => {
  const G = window.__game;
  G.__unlocked = [];
  G.events.on('gadgetUnlocked', ({ id }) => G.__unlocked.push(id));
  G.__abilities = [];
  G.events.on('abilityUnlocked', ({ id }) => G.__abilities.push(id)); // [onboard]
  // The real Batmobile/Batwing minigames (chase, battle, armada) run for real: the loop below
  // finishes each through vehicles.debugWin() / batwing.debugWin(), the same completion path a
  // player's win takes, so the story's wiring to the real parts is exercised end to end.
});

const state = () => page.evaluate(() => {
  const G = window.__game, s = G.flow.objectives.step;
  return { id: s?.id ?? null, type: s?.type ?? null, mode: G.flow.mode, site: G.flow.target, phase: G.boss?.phase, joker: G.boss?.joker.state, night: G.flow.story?.night?.id ?? 'n1', boss: s?.boss ?? null, last: !G.flow.story || !G.flow.story.night || G.flow.steps.at(-1) === s };
});
let shotN = 0;
// Part S: skip radio dialogue and any cinematic instantly (a real player reads/watches them at
// their own pace; the script just needs each beat to finish so its step, if any, can proceed).
async function skipTalk() {
  for (const p of NET ? [page, guest] : [page]) await p.evaluate(() => {
    if (window.__game.cinematic?.active) window.__game.cinematic.skip();
    if (window.__game.radio?.playing) window.__game.radio.skip();
  });
  // [net] The guest reads its own comics (the host waits for it before the story moves on).
  if (NET) await guest.evaluate(() => { const G = window.__game; if (G.comic?.playing) G.comic.skip(); if (document.querySelector('.credits-menu .mbtn') && G.flow?.mode === 'credits') G.__sawCredits = true; });
}
const nightsSeen = [];
let stuckId = null, stuckN = 0; // [m23]
const missionSince = new Map(); // [m23] when each mission step type's step began (solveMission)
let lastNight = null;
let stopAt = null; // [m45] UNTIL
// [net2] The nights the guest page was on, in order (it must follow the host into each one).
const guestNights = [];
for (let guard = 0; guard < (campaign ? 2400 : 1000); guard++) {
  await page.waitForTimeout(400);
  await skipTalk();
  const s = await state();
  if (process.env.DEBUG_TRACE) console.log(guard, JSON.stringify(s), NET ? JSON.stringify(await guestState()) : '');
  if (s.night !== lastNight) { const prev = lastNight; lastNight = s.night; nightsSeen.push(s.night); console.log('night', s.night); if (until && prev === until) stopAt = `${s.night} ${s.id}`; }
  // [m23] A step that has not moved in 40 passes says why (what is holding the story, where the hero is).
  if (s.id === stuckId) { if (++stuckN % 40 === 0) console.log('STUCK', s.night, s.id, JSON.stringify(await page.evaluate(() => { const G = window.__game, ow = G.side?.openworld; return { hero: [Math.round(G.hero.pos.x), Math.round(G.hero.pos.y), Math.round(G.hero.pos.z)], control: G.hero.control?.name ?? null, hold: G.side?.flowHooks?.holdStory?.() ?? null, stealth: ow?.stealthEnc?.active?.id ?? null, crimes: ow?.crimes?.live?.filter((c) => c.engaged).map((c) => c.type) ?? [], chain: !!ow?.chains?.active, wanted: [G.wanted?.level, G.wanted?.stateName], vehicle: G.vehicles?.active?.kind ?? null, enemies: (G.enemies ?? []).filter((e) => e.alive).length }; }))); }
  else { stuckId = s.id; stuckN = 0; }
  if (NET) { const gn = await guest.evaluate(() => window.__game.flow.story?.night?.id ?? 'n1'); if (gn !== guestNights.at(-1)) { guestNights.push(gn); console.log('guest night', gn); } }
  if (stopAt) {
    // [m45] give an online guest a moment to follow into the same night before the comparison
    if (NET) { await guest.waitForFunction((n) => (window.__game.flow.story?.night?.id ?? 'n1') === n, s.night, { timeout: 20000 }).catch(() => {}); const gn = await guest.evaluate(() => window.__game.flow.story?.night?.id ?? 'n1'); if (gn !== guestNights.at(-1)) { guestNights.push(gn); console.log('guest night', gn); } }
    console.log(`UNTIL ${until}: reached, stopping at ${stopAt}`);
    break;
  }
  // [story] A campaign night's last beat with no night after it: the run is done.
  if (campaign && s.type === 'nightEnd' && s.mode === 'play' && s.last) { await page.waitForTimeout(1500); const st = await state(); if (st.id === s.id) break; continue; }
  if (s.mode === 'cutscene' || s.mode === 'dead') {
    // Read every page of the comic.
    for (let k = 0; k < 8; k++) {
      await page.waitForTimeout(350);
      if (!(await page.evaluate(() => window.__game.comic.playing))) break;
      await page.screenshot({ path: `${out}/${String(shotN++).padStart(2, '0')}-${s.id}.png` });
      for (let j = 0; j < 4; j++) await page.keyboard.press('Space');
    }
    continue;
  }
  if (s.mode === 'finale') { await page.waitForTimeout(3000); await page.screenshot({ path: `${out}/${String(shotN++).padStart(2, '0')}-finale.png` }); await page.waitForTimeout(19000); continue; }
  if (s.mode === 'credits') { await page.screenshot({ path: `${out}/${String(shotN++).padStart(2, '0')}-credits.png` }); await page.evaluate(() => document.querySelector('.credits-menu .mbtn').click()); if (campaign) { await page.waitForTimeout(1500); continue; } break; }
  // [story] A campaign boss: clear any adds, then finish it through its own defeat path.
  if (s.type === 'boss' && s.boss && s.boss !== 'joker') {
    await page.evaluate(() => window.__game.winFight());
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const B = window.__game.bosses; if (B?.active) B.debugWin(); });
    await page.waitForTimeout(2500);
    continue;
  }
  // [story] The campaign's own step types, solved the way a player would (teleports for travel).
  if (['scan', 'traverse', 'puzzle', 'fork', 'fear'].includes(s.type)) { await solveStep(page); await page.waitForTimeout(600); continue; }
  // [story2] The double life: a dilemma goes to Batman's side (P2=bot covers both when it can), a
  // civvy walk visits each beat and takes each choice's default, a life test branches on its own.
  if (s.type === 'dilemma' || s.type === 'civvy') { await solveLife(page); await page.waitForTimeout(600); continue; }
  // [m23] Nights Two and Three: a case, a rescue, an escape from the police (src/story/missions).
  if (['case', 'rescue', 'evade', 'carTail'].includes(s.type)) { await solveMission(page, s); await page.waitForTimeout(500); continue; }
  // [m67] Mission step types (src/story/missions/**): a freeing and a hack are stood at point by point,
  // an escape goes to ground where the step suggests and waits for the city to lose it (or for the
  // mercy call), a case board is answered on the board itself, a tail is won like any chase.
  if (['freeing', 'hack', 'escape', 'caseboard'].includes(s.type)) { await solveMission67(page, s); await page.waitForTimeout(600); continue; }
  if (s.type === 'tail') { await page.evaluate(() => { const v = window.__game.vehicles; if (v && !v.active) v.enter(v.batmobile); v?.debugWin?.(); }); continue; }
  if (s.type === 'life') { await page.waitForTimeout(500); continue; }
  // [m45] Night Four's hunted step: go to ground where the step suggests and wait out the real search.
  if (s.type === 'hunted') { await solveLife(page); await page.waitForTimeout(600); continue; }
  if (s.type === 'wait' || s.type === 'nightEnd') { await page.waitForTimeout(800); continue; }
  if (s.type === 'boss') {
    // Clear the goon waves, then force the phases along.
    await page.evaluate(() => window.__game.winFight());
    await page.evaluate(() => {
      const B = window.__game.boss;
      if (B.phase === 2 && B.joker.state === 'roam') { B.joker.state = 'throw'; B.joker.t = 0; B.joker.applyHit({ outcome: 'stun' }, B.joker.pos); for (let i = 0; i < 5; i++) B.joker.applyHit({ outcome: 'hit' }, window.__game.hero.pos); }
      if (B.phase === 3 && ['approach', 'windup', 'backoff'].includes(B.joker.state)) { B.joker.state = 'staggered'; B.joker.finishable = true; B.joker.applyHit({ outcome: 'hit' }, window.__game.hero.pos); }
    });
    await page.waitForTimeout(1400);
    continue;
  }
  // [story2] Any open phone call is answered with its default (a player would pick one).
  await page.evaluate(() => window.__game.flow.story?.debugAnswer?.());
  // [story2] A vehicle boss (Firefly) is fought from the car: no teleport, just its defeat path.
  if (s.type === 'boss' && s.vehicle) { await page.evaluate(() => { const B = window.__game.bosses; if (B?.active) B.debugWin(); }); await page.waitForTimeout(2500); continue; }
  if (s.type === 'chase' || s.type === 'battle' || s.type === 'armada') {
    // These start async (after the beat's radio line, however far skipRadio has gotten it): try
    // the dev fast path every pass. It's a no-op returning false until the real mission is
    // actually running, then wins it once through the same onDone path a real finish would take.
    // No generic teleport here: it would fight the vehicle's own position sync and clear the
    // hero's drive/fly control state for no reason.
    await page.evaluate(() => { window.__game.vehicles?.debugWin?.(); window.__game.batwing?.debugWin?.(); });
    continue;
  }
  if (s.type === 'board') {
    // The Batmobile parks itself (src/vehicles/vehicles.js's park(), called from the 'board' step
    // in flow.js); wait for its slide-in to finish, then press the same enter-vehicle key a real
    // player would (vehicles.enter has no distance check of its own, so no teleport is needed).
    await page.waitForFunction(() => !window.__game.vehicles?.batmobile?.arriving, null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => { const v = window.__game.vehicles; if (v && !v.active) v.enter(v.batmobile); });
    continue;
  }
  // A plain travel step may still be reachable while driving or flying (that's the point of some
  // of them), but a few (back up onto a roof after a chase or a battle, say) sit somewhere a
  // vehicle simply cannot go. A real player gets out to climb or glide there; do the same before
  // the teleport cheat below, or the vehicle's own per-frame position sync would just snap the
  // teleport straight back to wherever the car or the Batwing still is.
  await page.evaluate(() => { const v = window.__game.vehicles, w = window.__game.batwing; if (v?.active) v.exit(); if (w?.active) w.exit(); });
  if (s.site) await page.evaluate((p) => window.__game.teleport({ x: p.x, y: p.y, z: p.z }), s.site);
  if (s.type === 'fight') { await page.waitForTimeout(600); await page.evaluate(() => window.__game.winFight()); await page.waitForTimeout(1800); await page.evaluate(() => window.__game.winFight()); await page.waitForTimeout(1800); await page.evaluate(() => window.__game.winFight()); }
}
const end = await state();
console.log('ended at', JSON.stringify(end));
if (NET) {
  await guest.waitForTimeout(1500);
  const g = await guestState();
  // [net2] The campaign position is (night, step id): an index alone matched falsely across nights.
  const pos = () => { const G = window.__game; return { night: G.flow.story?.night?.id ?? 'n1', id: G.flow.objectives.step?.id ?? null, index: G.flow.stepIndex }; };
  const gp = await guest.evaluate((f) => ({ sawCredits: !!window.__game.__sawCredits || window.__game.flow.mode === 'credits', ...(0, eval)(`(${f})`)(), saved: JSON.parse(localStorage.getItem('gotham-progress-v1') ?? '{}').online ?? null }), pos.toString());
  const hp = await page.evaluate((f) => (0, eval)(`(${f})`)(), pos.toString());
  console.log('guest ended at', JSON.stringify(g), JSON.stringify(gp), 'host at', JSON.stringify(hp));
  const same = gp.night === hp.night && gp.id === hp.id;
  const nightsOk = !campaign || guestNights.join('>') === nightsSeen.join('>');
  // [m45] an UNTIL run stops before the credits; [m23] a run started at a later night (NIGHT=n2) never passes Night One's credits
  const sawEnd = gp.sawCredits || !!night || (!!until && nightsSeen.at(-2) === until);
  console.log(sawEnd && same && nightsOk ? `NET: guest followed the host to the end (same night ${hp.night}, same step ${hp.id}; nights ${guestNights.join(' > ')})` : `NET: MISMATCH between host and guest (guest nights ${guestNights.join(' > ')})`);
  if (!(sawEnd && same && nightsOk)) process.exitCode = 1;
  console.log(guestErrors.length ? `GUEST ERRORS:\n${guestErrors.join('\n')}` : 'no guest console errors');
}
if (campaign) console.log('nights played:', nightsSeen.join(' > '));
if (p2) console.log('players:', await page.evaluate(() => window.__game.players.map((p) => p.kit.id).join(' + ')), '| split views:', await page.evaluate(() => window.__game.split.views.length));
console.log('comic pages captured:', shotN);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
const report = await page.evaluate(() => ({ unlocked: window.__game.__unlocked, abilities: window.__game.__abilities ?? [], wayne: { xp: window.__game.wayne.xp, level: window.__game.wayne.level }, gadgets: window.__game.progress.gadgets.unlocked }));
console.log('gadgets unlocked in order:', JSON.stringify(report.unlocked));
// [onboard] The abilities must open in story order: Night One's step grants in step order, then each
// campaign night's (night start, then the missions it waits on), and nothing before its beat.
{
  const { ABILITIES } = await import('../src/abilities/abilityDefs.js');
  const { STEPS } = await import('../src/game/story.js');
  const got = report.abilities;
  const rank = (id) => {
    const g = ABILITIES.find((a) => a.id === id)?.grant;
    if (g?.step) return STEPS.findIndex((s) => s.id === g.step);
    if (g?.night) return 1000 + Number(g.night.slice(1)) * 100 + (g.after ? 1 : 0);
    return -1;
  };
  const ordered = got.every((id, i) => i === 0 || rank(got[i - 1]) <= rank(id));
  const n1 = ABILITIES.filter((a) => a.grant?.step).map((a) => a.id);
  const missing = !start && !night ? n1.filter((id) => !got.includes(id)) : [];
  console.log('abilities unlocked in order:', JSON.stringify(got));
  console.log(ordered && !missing.length ? 'ABILITIES: story order OK' : `ABILITIES: ORDER PROBLEM${missing.length ? ` (never granted: ${missing.join(', ')})` : ''}`);
}
console.log('saved gadget unlocks:', JSON.stringify(report.gadgets), 'wayne:', JSON.stringify(report.wayne));
await browser.close();

// [story2] Walks a dilemma (to Batman's marker) or a civvy step (each beat in turn, answering each
// choice with its default the moment it opens).
async function solveLife(page) {
  const pts = await page.evaluate(() => { const r = window.__game.flow.story.debugSolve(); return (r ?? []).map((p) => ({ at: p.at ? { x: p.at.x, y: p.at.y, z: p.at.z } : null, hold: p.hold ?? 0.5 })); });
  for (const st of pts) {
    if (!st.at) continue;
    await page.evaluate((p) => { const G = window.__game; if (G.vehicles?.active) G.vehicles.exit(); G.teleport({ x: p.at.x, y: p.at.y, z: p.at.z }); }, st);
    for (let k = 0; k < 12; k++) {
      await page.waitForTimeout(400);
      await page.evaluate(() => { const G = window.__game; if (G.radio?.playing) G.radio.skip(); G.flow.story.debugAnswer(); });
    }
  }
}

// [story] Plays a campaign step type through: teleports onto each clue, gate, plate (in the
// riddle's order) or goal, with detective vision on for scans.
async function solveStep(page) {
  const steps = await page.evaluate(() => {
    const G = window.__game, s = G.flow.objectives.step, site = (x) => G.flow.story.site(x);
    const P = (p) => { const q = typeof p === 'string' ? site(p) : p; return q ? { x: q.x, y: q.y, z: q.z } : null; };
    if (s.type === 'scan') return (s.points ?? [{ site: s.site }]).map((p) => ({ at: P(p.site ?? p.at), hold: (s.hold ?? 1.2) + 0.6 }));
    if (s.type === 'traverse') return s.gates.map((g) => ({ at: P(g), hold: 0.4, up: 2.8 }));
    if (s.type === 'puzzle') return s.order.map((id) => ({ at: P(s.plates.find((p) => p.id === id).site ?? s.plates.find((p) => p.id === id).at), hold: 0.5, off: true }));
    if (s.type === 'fork') return [{ at: P(s.options[0].site), hold: 0.5 }];
    if (s.type === 'fear') return [{ at: P(s.site), hold: 0.6 }];
    return [];
  });
  await page.evaluate(() => { window.__game.state.detectiveOn = true; });
  for (const st of steps) {
    if (!st.at) continue;
    await page.evaluate((p) => { const G = window.__game; const v = G.vehicles; if (v?.active) v.exit(); G.teleport({ x: p.at.x, y: p.at.y + (p.up ?? 0), z: p.at.z }); }, st);
    await page.waitForTimeout(st.hold * 1000);
    // A plate counts when she steps onto it: step off before the next one.
    if (st.off) { await page.evaluate((p) => window.__game.teleport({ x: p.at.x + 4, y: p.at.y, z: p.at.z + 4 }), st); await page.waitForTimeout(300); }
  }
  await page.evaluate(() => { window.__game.state.detectiveOn = false; });
}

// [m23] Plays a mission step type that says where to stand (story.debugSolve: evidence and trail
// points with detective vision on, each lock of a rescue once its guards are down, a place to go to
// ground) and does the one thing standing cannot (its debugAct: the case board's answer). An escape
// that has not ended after 150 s is stood down through the wanted system's own clear().
async function solveMission(page, s) {
  const key = `${s.night}.${s.id}`;
  if (!missionSince.has(key)) missionSince.set(key, Date.now());
  const pts = await page.evaluate(() => (window.__game.flow.story.debugSolve() ?? []).map((p) => ({ at: p.at ? { x: p.at.x, y: p.at.y, z: p.at.z } : null, hold: p.hold ?? 0.6, clear: !!p.clear })));
  await page.evaluate(() => { window.__game.state.detectiveOn = true; });
  for (const p of pts) {
    if (p.clear) { await page.evaluate(() => window.__game.winFight()); await page.waitForTimeout(300); }
    if (p.at) await page.evaluate((q) => { const G = window.__game; if (G.vehicles?.active) G.vehicles.exit(); G.teleport({ x: q.x, y: q.y, z: q.z }); }, p.at);
    // An online partner goes to ground too (their own hero, on their own page): the search only
    // ends when nobody is in sight.
    if (NET && s.type === 'evade' && p.at) await guest.evaluate((q) => window.__game.teleport?.({ x: q.x + 1.5, y: q.y, z: q.z }), p.at).catch(() => {});
    if (p.clear) { await page.waitForTimeout(700); await page.evaluate(() => window.__game.winFight()); }
    await page.waitForTimeout(p.hold * 1000);
    if ((await page.evaluate(() => window.__game.flow.objectives.step?.id)) !== s.id) break;
  }
  await page.evaluate(() => { window.__game.state.detectiveOn = false; });
  if (s.type === 'evade' && Date.now() - missionSince.get(key) < 150000) return;
  const acted = await page.evaluate(() => { const st = window.__game.flow.story, cur = window.__game.flow.objectives.step; return cur ? !!st.stepTypes[cur.type]?.debugAct?.() : false; });
  if (acted && s.type === 'evade') console.log(`${key}: the search outlasted 150 s; stood down through wanted.clear()`);
}

// [m67] Plays a mission step type: its own debugSolve() says where to stand and for how long.
async function solveMission67(page, s) {
  const plan = await page.evaluate(() => {
    const G = window.__game, st = G.flow.objectives.step, T = G.flow.story.stepTypes[st.type];
    return { id: st.id, pts: (T.debugSolve?.(st) ?? []).map((p) => ({ at: p.at ? { x: p.at.x, y: p.at.y, z: p.at.z } : null, hold: p.hold ?? 0.5, wait: !!p.wait })), order: T.debugOrder?.(st) ?? null };
  });
  const same = () => page.evaluate((id) => window.__game.flow.objectives.step?.id === id, plan.id);
  await page.evaluate(() => { window.__game.state.detectiveOn = true; });
  for (const st of plan.pts) {
    if (!(await same())) break;
    if (st.at) await page.evaluate((p) => { const G = window.__game; if (G.vehicles?.active) G.vehicles.exit(); G.teleport({ x: p.at.x, y: p.at.y, z: p.at.z }); }, st);
    // A hold is game time (slower than the wall clock on a loaded machine): wait for the point to count.
    const left = () => page.evaluate(() => { const G = window.__game, x = G.flow.objectives.step; return G.flow.story.stepTypes[x?.type]?.debugLeft?.() ?? null; });
    const before = await left();
    for (let k = 0; k < 60; k++) { await page.waitForTimeout(Math.max(250, (st.hold * 1000) / 4)); if (k >= 3 && (before == null || !(await same()) || (await left()) < before)) break; }
    // An escape: stay put until the step is over (the search drains, or the chase is called off).
    for (let k = 0; st.wait && k < 420 && (await same()); k++) { await page.waitForTimeout(500); await page.evaluate(() => { if (window.__game.radio?.playing) window.__game.radio.skip(); }); }
  }
  await page.evaluate(() => { window.__game.state.detectiveOn = false; });
  if (plan.order) {
    // The case board opens once the evidence is in: type the order, submit, let it close.
    await page.waitForSelector('.case-board .cb-card', { timeout: 60000 });
    for (const n of plan.order) await page.keyboard.press(String(n));
    await page.keyboard.press('Enter');
    await page.waitForSelector('.case-board', { state: 'detached', timeout: 10000 });
  }
}
