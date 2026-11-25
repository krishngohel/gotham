// [story2] Plays campaign nights with a scripted competent player and measures how long they take.
// Unlike scripts/playthrough.mjs (which teleports and wins every fight with a cheat), this one
// FIGHTS: it drives player one's real input (move, punch, kick, counter on blue, dodge on red, cape
// shields and brutes and the spore-dazed, close on gunmen first), plays predator rooms as stealth
// (crouch, approach unaware goons from behind, silent takedowns), walks fear zones for real, and
// fights every boss using the boss's own hint (src/bosses/** sim(b): where to stand, what to press).
// Travel is NOT simulated (the city has no navmesh for a bot): the sim teleports between beats and
// adds an estimate (distance / speed + a few seconds) instead; comics and radio are skipped and
// estimated by count. Chases and Batmobile battles are won by their dev path after an estimate.
// What it reports, per night: real seconds in fights, rooms, fear and bosses; estimated seconds for
// travel, reading and driving; deaths; steps that needed the dev path ("assisted").
//
//   BASE=http://localhost:5720/ NIGHTS=n6,n7 node scripts/night-sim.mjs
//   DIFF=story|normal|hard   P2=bot   STEPS=1 (per-step table)   OUT=dir (json report)
//   ONLY=boss,stealth (only these step kinds for real; everything else is skipped by dev paths)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { installSim } from './simPlayer.mjs';

const base = process.env.BASE ?? 'http://localhost:5720/';
const nights = (process.env.NIGHTS ?? 'n2,n3,n4,n5,n6,n7,n8,n9').split(',');
const diff = process.env.DIFF ?? 'normal';
const p2 = process.env.P2 === 'bot' ? '&p2=bot&p2kit=robin' : '';
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const out = process.env.OUT ?? null;
const TRAVEL_SPEED = 14; // m/s: a competent mix of gliding, grapple-boosting and running
const COMIC_PAGE = 7, RADIO_LINE = 3.2, BEAT_READ = 12;
const LIMIT = { fight: Number(process.env.LIM_FIGHT ?? 150), stealth: Number(process.env.LIM_STEALTH ?? 180), boss: Number(process.env.LIM_BOSS ?? 360), fear: 120 };

const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const report = [];
for (const night of nights) report.push(await playNight(night));
await browser.close();

console.log(`\nnight-sim  difficulty ${diff}${p2 ? '  co-op (P2 bot)' : ''}`);
console.log('night | real (fights, rooms, fear, bosses) | estimated (travel, reading, driving) | total | deaths | assisted | boss real');
for (const r of report) console.log(`${r.night} | ${fmt(r.real)} | ${fmt(r.est)} | ${fmt(r.real + r.est)} | ${r.deaths} | ${r.assisted.join(' ') || '-'} | ${r.bossReal ? fmt(r.bossReal) : '-'}`);
if (out) { mkdirSync(out, { recursive: true }); writeFileSync(`${out}/night-sim-${diff}${p2 ? '-coop' : ''}.json`, JSON.stringify(report, null, 2)); }

function fmt(s) { const m = Math.floor(s / 60); return `${m}m${String(Math.round(s % 60)).padStart(2, '0')}s`; }

async function playNight(night) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((d) => { try { const k = 'gotham-settings-v1'; const s = JSON.parse(localStorage.getItem(k) ?? '{}'); s.difficulty = d; localStorage.setItem(k, JSON.stringify(s)); } catch { /* fresh */ } }, diff);
  await page.goto(`${base}?new=1&night=${night}&bruceDays=0&q=potato${p2}`);
  await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 20, null, { timeout: 120000 });
  await page.evaluate(installSim);
  const r = { night, real: 0, est: 0, deaths: 0, assisted: [], bossReal: 0, steps: [], errors };
  let lastId = null, stepT0 = Date.now(), guard = 0;
  const seen = new Set();
  while (guard++ < 6000) {
    await page.waitForTimeout(250);
    // A reload (a dev-server rebuild, a crash) resumes the night from its save: re-arm the player.
    if (!(await page.evaluate(() => !!window.__sim).catch(() => false))) {
      await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 20, null, { timeout: 120000 });
      await page.evaluate(installSim);
      r.reloads = (r.reloads ?? 0) + 1;
    }
    const s = await page.evaluate(() => {
      if (!window.__game?.flow?.objectives) return { id: '__wait', type: 'wait', mode: 'cutscene', night: null };
      const G = window.__game, st = G.flow.objectives.step;
      const at = st ? G.flow.story.site(st.site) ?? G.flow.target : null;
      return { id: st?.id ?? null, type: st?.type ?? 'reach', mode: G.flow.mode, comic: !!G.comic?.playing, radio: !!G.radio?.playing, night: G.flow.story.night.id, deaths: window.__sim.deaths,
        thralls: !!st?.thralls, stealth: st?.type === 'fight' && !!G.flow.story.fight(st.fight)?.stealth, hero: { x: G.hero.pos.x, y: G.hero.pos.y, z: G.hero.pos.z }, at: at ? { x: at.x, y: at.y, z: at.z } : null, lines: st?.lines?.length ?? 0, last: G.flow.steps.at(-1) === st };
    }).catch(() => ({ id: '__wait', type: 'wait', mode: 'cutscene', night: null }));
    if (process.env.TRACE && guard % 20 === 0) console.log('trace', guard, s.id, s.type, s.mode, s.comic ? 'comic' : '');
    if (s.id === '__wait') continue;
    if (s.night !== night || !s.id) break;
    if (s.type === 'nightEnd') { r.steps.push({ id: s.id, type: s.type }); break; }
    if (s.comic) { r.est += COMIC_PAGE; await page.evaluate(() => window.__game.comic.skip?.()); await page.keyboard.press('Space'); continue; }
    if (s.mode === 'cutscene' || s.mode === 'dead') continue;
    if (s.id !== lastId) { lastId = s.id; stepT0 = Date.now(); }
    // A step that has not moved in ten minutes (a death loop, a lost marker): skip it and say so.
    if (Date.now() - stepT0 > 600000) {
      r.assisted.push(`${s.id}(stalled)`);
      await page.evaluate(() => { const G = window.__game; G.winFight(); G.bosses?.debugWin?.(); const i = G.flow.objectives.index; const n = G.flow.steps[i + 1]; if (n) G.jump?.(n.id); }).catch(() => {});
      stepT0 = Date.now();
    }
    if (seen.has(s.id)) {
      // A fight skipped by ONLY: keep winning its later waves through the dev path.
      if (only && s.type === 'fight' && !only.has(s.stealth ? 'stealth' : 'fight')) await page.evaluate(() => window.__game.winFight()).catch(() => {});
    } else {
      seen.add(s.id);
      r.est += s.lines * RADIO_LINE;
      let rec;
      try { rec = await playStep(page, s, r); } catch (e) { rec = { id: s.id, type: s.type, error: String(e.message ?? e).slice(0, 80) }; seen.delete(s.id); await page.waitForTimeout(3000); }
      r.steps.push(rec);
      if (process.env.STEPS) console.log(night, rec.id, rec.type, rec.real != null ? `real ${Math.round(rec.real)}s` : '', rec.est ? `est ${Math.round(rec.est)}s` : '', rec.assisted ? 'ASSISTED' : '', rec.phaseReached != null ? `phase reached ${rec.phaseReached + 1}` : '');
    }
    await page.evaluate(() => { const G = window.__game; if (G?.radio?.playing) G.radio.skip(); G?.flow?.story?.debugAnswer?.(); }).catch(() => {});
    void stepT0;
  }
  r.deaths = await page.evaluate(() => window.__sim.deaths);
  if (errors.length) console.log(`${night}: console errors\n  ${[...new Set(errors)].slice(0, 6).join('\n  ')}`);
  await page.close();
  return r;
}

async function playStep(page, s, r) {
  const rec = { id: s.id, type: s.type, real: null, est: 0, assisted: false };
  const dist = s.at ? Math.hypot(s.at.x - s.hero.x, s.at.z - s.hero.z) : 0;
  const travel = (d) => (d > 8 ? d / TRAVEL_SPEED + 3 : 0);
  const want = (kind) => !only || only.has(kind);
  const tp = (p) => page.evaluate((q) => { const G = window.__game; if (G.vehicles?.active) G.vehicles.exit(); G.teleport({ x: q.x, y: q.y, z: q.z }); }, p);
  const realRun = async (kind, mode, extra = {}) => {
    const t0 = Date.now();
    await page.evaluate(({ m, e }) => { window.__sim.mode = m; Object.assign(window.__sim, e); }, { m: mode, e: extra });
    let ok = false;
    while ((Date.now() - t0) / 1000 < LIMIT[kind]) {
      await page.waitForTimeout(500);
      const now = await page.evaluate(() => ({ id: window.__game.flow.objectives.step?.id, comic: !!window.__game.comic?.playing, mode: window.__game.flow.mode }));
      if (now.comic) { await page.evaluate(() => window.__game.comic.skip?.()); await page.keyboard.press('Space'); }
      if (now.id !== s.id) { ok = true; break; }
    }
    await page.evaluate(() => { window.__sim.mode = 'off'; });
    rec.real = (Date.now() - t0) / 1000;
    if (!ok) {
      rec.assisted = true; r.assisted.push(s.id);
      if (kind === 'boss') rec.phaseReached = await page.evaluate(() => window.__game.bosses?.phase ?? null).catch(() => null);
      if (kind === 'boss') await page.evaluate(() => { window.__game.winFight(); window.__game.bosses.debugWin(); });
      else await page.evaluate(() => window.__game.winFight());
      await page.waitForTimeout(3000);
    }
    r.real += rec.real;
    if (kind === 'boss') r.bossReal += rec.real;
  };
  switch (s.type) {
    case 'cutscene': case 'wait': case 'life': return rec;
    case 'fight': {
      rec.est = travel(dist); r.est += rec.est;
      if (!want(s.stealth ? 'stealth' : 'fight')) { await page.evaluate(() => window.__game.winFight()); return rec; }
      if (s.at) await tp(s.stealth ? (await page.evaluate(() => { const G = window.__game; const f = G.flow.story.fight(G.flow.objectives.step.fight); return f.entry ? G.flow.story.site(f.entry) ?? f.entry : null; })) ?? s.at : { x: s.at.x, y: s.at.y, z: s.at.z + 9 });
      await realRun(s.stealth ? 'stealth' : 'fight', s.stealth ? 'stealth' : 'fight', { thralls: s.thralls });
      return rec;
    }
    case 'boss': {
      rec.est = travel(dist); r.est += rec.est;
      if (!want('boss')) { await page.evaluate(() => { window.__game.winFight(); window.__game.bosses.debugWin(); }); return rec; }
      await page.waitForTimeout(1500);
      await realRun('boss', 'boss');
      return rec;
    }
    case 'fear': {
      rec.est = travel(dist * 0.2); r.est += rec.est;
      if (!want('fear')) { await tp(s.at); return rec; }
      await realRun('fear', 'fear', { goal: s.at });
      return rec;
    }
    case 'chase': case 'battle': {
      rec.est = s.type === 'chase' ? 70 : 110; r.est += rec.est;
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__game.vehicles?.debugWin?.());
      return rec;
    }
    case 'board': {
      rec.est = travel(dist) + 4; r.est += rec.est;
      await page.waitForFunction(() => !window.__game.vehicles?.batmobile?.arriving, null, { timeout: 5000 }).catch(() => {});
      await page.evaluate(() => { const v = window.__game.vehicles; if (v && !v.active) v.enter(v.batmobile); });
      return rec;
    }
    case 'scan': case 'traverse': case 'puzzle': case 'fork': case 'dilemma': case 'civvy': {
      const pts = await page.evaluate(() => {
        const G = window.__game, st = G.flow.objectives.step, site = (x) => G.flow.story.site(x);
        const P = (p) => { const q = typeof p === 'string' ? site(p) : p; return q ? { x: q.x, y: q.y, z: q.z } : null; };
        if (st.type === 'scan') return (st.points ?? [{ site: st.site }]).map((p) => ({ at: P(p.site ?? p.at), hold: (st.hold ?? 1.2) + 0.5 }));
        if (st.type === 'traverse') return st.gates.map((g) => ({ at: P(g), hold: 0.4, up: 2.8 }));
        if (st.type === 'puzzle') return st.order.map((id) => ({ at: P(st.plates.find((p) => p.id === id).site), hold: 0.5, off: true }));
        if (st.type === 'fork') return [{ at: P(st.options[0].site), hold: 0.5 }];
        return (G.flow.story.debugSolve() ?? []).map((p) => ({ at: p.at ? { x: p.at.x, y: p.at.y, z: p.at.z } : null, hold: p.talk ? 4 : 0.6 }));
      });
      let from = s.hero, d = 0;
      for (const p of pts) if (p.at) { d += Math.hypot(p.at.x - from.x, p.at.z - from.z); from = p.at; }
      rec.est = travel(d) + (s.type === 'puzzle' ? 25 : 0) + (s.type === 'civvy' ? pts.length * BEAT_READ : 0) + (s.type === 'scan' ? pts.length * 2 : 0);
      r.est += rec.est;
      await page.evaluate(() => { window.__game.state.detectiveOn = true; });
      for (const p of pts) {
        if (!p.at) continue;
        await tp({ x: p.at.x, y: p.at.y + (p.up ?? 0), z: p.at.z });
        await page.waitForTimeout(p.hold * 1000);
        // A conversation beat: let its lines go by and answer its choice (a player reads; it is estimated above).
        for (let k = 0; k < (p.hold >= 4 ? 10 : 1); k++) {
          await page.evaluate(() => { const G = window.__game; if (G.radio?.playing) G.radio.skip(); G.flow.story.debugAnswer?.(); });
          if (p.hold >= 4) await page.waitForTimeout(400);
        }
        if (p.off) { await tp({ x: p.at.x + 4, y: p.at.y, z: p.at.z + 4 }); await page.waitForTimeout(300); }
      }
      await page.evaluate(() => { window.__game.state.detectiveOn = false; });
      return rec;
    }
    default: {
      rec.est = travel(dist); r.est += rec.est;
      if (s.at) await tp(s.at);
      return rec;
    }
  }
}
