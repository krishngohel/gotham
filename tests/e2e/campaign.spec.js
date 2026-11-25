// The campaign end to end (workstream J1): a save resumes mid-night, Night One's credits lead into
// Night Two, and one whole new night plays through with a scripted player (god mode; travel by
// teleport, fights by winFight, campaign step types solved the way a player would, the boss
// through its own defeat path), with a second local player along for the ride.
import { test, expect } from '@playwright/test';

const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;
async function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('a save in the middle of Night Two resumes on its step, in that night', async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto('/');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  const mid = await page.evaluate(async () => {
    const { stepsOf } = await import('/src/story/campaign.js');
    const list = stepsOf('n2');
    const s = list[Math.floor(list.length / 2)];
    localStorage.setItem('gotham-progress-v1', JSON.stringify({ stepId: 'credits', finished: true, trophies: [], suit: 'm', campaign: { night: 'n2', stepId: s.id, nightsDone: ['n1'] } }));
    return s.id;
  });
  await page.reload();
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.evaluate(() => window.__game.begin('m', false));
  await page.waitForFunction(() => window.__game.flow?.objectives?.step, null, { timeout: 15000 });
  expect(await page.evaluate(() => window.__game.flow.story.night.id)).toBe('n2');
  expect(await page.evaluate(() => window.__game.flow.objectives.step.id)).toBe(mid);
  // Night One's own place is untouched: the save still counts it finished (gadgets, the roof).
  expect(await page.evaluate(() => window.__game.progress.stepId)).toBe('credits');
  // Moving on a step saves the new place in the campaign field, not in Night One's.
  await page.evaluate(() => { const G = window.__game; const i = G.flow.objectives.index; G.flow.jumpTo(i + 1); });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gotham-progress-v1')));
  expect(saved.campaign.night).toBe('n2');
  expect(saved.campaign.stepId).toBe(await page.evaluate(() => window.__game.flow.objectives.step.id));
  expect(saved.stepId).toBe('credits');
  expect(errors).toEqual([]);
});

test("Night One's credits lead into Night Two, with free roam kept", async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto('/?at=finale&god=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__game.flow.mode === 'credits', null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector('.credits-menu .mbtn').click());
  await page.waitForFunction(() => window.__game.flow.story?.night?.id === 'n2', null, { timeout: 15000 });
  const s = await page.evaluate(() => ({ id: window.__game.flow.objectives.step.id, mode: window.__game.flow.mode, done: window.__game.progress.campaign.nightsDone }));
  // [story2] Night Two now opens on its "Previously" page: the recap comic, then play.
  expect(['play', 'cutscene']).toContain(s.mode);
  expect(s.done).toContain('n1');
  expect(errors).toEqual([]);
});

test('Night Two plays start to finish with a scripted player and a co-op bot', async ({ page }) => {
  test.setTimeout(900000);
  const errors = await collectErrors(page);
  await page.goto('/?new=1&night=n2&god=1&p2=bot&p2kit=robin');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__game.flow?.story?.night?.id === 'n2', null, { timeout: 30000 });
  const seen = new Set();
  for (let guard = 0; guard < 900; guard++) {
    await page.waitForTimeout(350);
    const s = await page.evaluate(() => {
      const G = window.__game; const st = G.flow.objectives.step;
      if (G.cinematic?.active) G.cinematic.skip();
      if (G.radio?.playing) G.radio.skip();
      if (G.comic.playing) G.comic.skip();
      return { id: st?.id ?? null, type: st?.type ?? null, mode: G.flow.mode, night: G.flow.story.night.id, boss: st?.boss ?? null, site: G.flow.target };
    });
    if (s.night !== 'n2') break;
    if (!s.id) break;
    seen.add(s.id);
    if (s.mode !== 'play') continue;
    if (s.type === 'nightEnd') { await page.waitForTimeout(1500); continue; }
    await page.evaluate(async (s) => {
      const G = window.__game, step = G.flow.objectives.step, site = (x) => G.flow.story.site(x);
      const tp = (p, up = 0) => { if (G.vehicles?.active) G.vehicles.exit(); if (p) G.teleport({ x: p.x, y: p.y + up, z: p.z }); };
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      switch (s.type) {
        case 'fight': if (G.flow.target) tp(G.flow.target); await wait(500); G.winFight(); break;
        case 'boss': G.winFight(); await wait(800); if (G.bosses.active) G.bosses.debugWin(); await wait(1800); break;
        case 'chase': case 'battle': G.vehicles?.debugWin?.(); break;
        case 'board': { const v = G.vehicles; if (v && !v.active) v.enter(v.batmobile); break; }
        case 'scan': G.state.detectiveOn = true; for (const p of step.points ?? [{ site: step.site }]) { tp(site(p.site ?? p.at)); await wait((step.hold ?? 1.2) * 1000 + 500); } G.state.detectiveOn = false; break;
        case 'traverse': for (const g of step.gates) { tp(site(g), 2.8); await wait(400); } break;
        case 'puzzle': for (const id of step.order) { const pl = step.plates.find((p) => p.id === id); const at = site(pl.site ?? pl.at); tp(at); await wait(450); tp({ x: at.x + 4, y: at.y, z: at.z + 4 }); await wait(300); } break;
        case 'fork': tp(site(step.options[0].site)); break;
        case 'fear': tp(site(step.site)); break;
        case 'wait': case 'radio': case 'courier': case 'ally': case 'cutscene': break;
        default: if (s.site) tp(s.site);
      }
    }, s);
  }
  const end = await page.evaluate(() => ({ night: window.__game.flow.story.night.id, done: window.__game.progress.campaign.nightsDone, missions: window.__game.progress.campaign.missionsDone }));
  expect(end.done).toContain('n2');
  expect(end.night).toBe('n3');
  expect(end.missions.filter((m) => m.startsWith('n2.')).length).toBeGreaterThan(3);
  expect(seen.size).toBeGreaterThan(10);
  expect(await page.evaluate(() => window.__game.players.length)).toBe(2);
  expect(errors).toEqual([]);
});

// [story2] Night Eight's duel played by the scripted competent player (scripts/simPlayer.mjs): real
// input, counters on blue, dodges on red, no god mode and no winFight. It has to make progress on
// its own: at least one phase of the Black Mask fight inside three minutes, with no console errors.
test('Night Eight: the scripted player fights Black Mask for real and makes progress', async ({ page }) => {
  test.setTimeout(300000);
  const errors = await collectErrors(page);
  const { installSim } = await import('../../scripts/simPlayer.mjs');
  await page.goto('/?new=1&night=n8&at=n8Boss&bruceDays=0');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.evaluate(installSim);
  // The intro comic, then the duel.
  for (let k = 0; k < 20 && !(await page.evaluate(() => window.__game.bosses?.active)); k++) {
    await page.evaluate(() => window.__game.comic?.skip?.());
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
  }
  expect(await page.evaluate(() => window.__game.bosses.current?.id)).toBe('blackMask');
  await page.evaluate(() => { window.__sim.mode = 'boss'; });
  await page.waitForFunction(() => (window.__game.bosses.phase ?? 0) >= 1 || window.__game.flow.objectives.step?.id !== 'n8Boss', null, { timeout: 180000, polling: 1000 });
  const snap = await page.evaluate(() => window.__game.bosses.snapshot());
  expect(snap.id).toBe('blackMask');
  expect(snap.phase).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});
