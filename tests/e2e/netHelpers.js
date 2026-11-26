// Shared steps for the online co-op e2e specs (workstream D2): two pages of one context over the
// BroadcastChannel transport (research decision 20), a host and a guest.
export const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;

export function collectErrors(page, into = []) {
  page.on('console', (m) => { if (m.type() === 'error') into.push(m.text()); });
  page.on('pageerror', (e) => into.push(e.message));
  return into;
}

// The host is already in a run (hostUrl); it invites from the pause-menu path; the guest joins
// with the room code shown and readies with the hero offered.
export async function pairOverBroadcast(host, guest, { hostUrl, guestUrl = '/?net=broadcast&god=1' }) {
  await host.goto(hostUrl);
  await guest.goto(guestUrl);
  await host.waitForFunction(ready, null, { timeout: 120000 });
  await guest.waitForFunction(ready, null, { timeout: 120000 });
  await host.waitForFunction(() => !!window.__game.flow, null, { timeout: 60000 });
  await host.evaluate(() => window.__game.openNet((n) => n.inviteFromRun()));
  await host.waitForSelector('.net-host-panel .net-code');
  const code = await host.$eval('.net-host-panel .net-code', (e) => e.dataset.code);
  await guest.evaluate(() => window.__game.openNet((n) => n.openJoin()));
  await guest.fill('.net-join-panel input.code', code);
  await guest.click('.net-join-panel .mbtn.primary');
  await guest.waitForSelector('.hero-select.show [data-act="ok"][data-col="0"]', { timeout: 30000 });
  await guest.click('.hero-select.show [data-act="ok"][data-col="0"]');
  await guest.waitForFunction(() => window.__game.net?.runStarted && window.__game.players?.length === 2, null, { timeout: 90000 });
  await host.waitForFunction(() => window.__game.players.length === 2 && window.__game.net?.rep?.ready, null, { timeout: 30000 });
  await host.evaluate(() => document.querySelector('.net-host-panel')?.remove());
  return code;
}

// Comics, cinematics and radio lines out of the way on both pages (the script's stand-in for a
// player reading at their own pace).
export async function skipTalk(...pages) {
  for (const p of pages) {
    await p.evaluate(() => {
      const g = window.__game;
      if (g.comic?.playing) g.comic.skip();
      if (g.cinematic?.active) g.cinematic.skip();
      if (g.radio?.playing) g.radio.skip();
    });
  }
}

// Both sides' view of the world, for comparing after a quiet moment.
export const worldOf = (p) => p.evaluate(() => {
  const g = window.__game;
  const enemies = {};
  for (const e of g.enemies) if (/^e\d+$/.test(e.id)) enemies[e.id] = { hp: Math.round(e.health * 10) / 10, alive: e.alive, x: e.pos.x, z: e.pos.z };
  return { step: g.flow.objectives.step?.id ?? null, index: g.flow.stepIndex, enemies, players: g.players.length, role: g.net?.role ?? null };
});

export function sameWorld(expect, a, b, { posTol = 0.6 } = {}) {
  expect(Object.keys(b.enemies).sort(), 'same enemy ids').toEqual(Object.keys(a.enemies).sort());
  for (const id of Object.keys(a.enemies)) {
    expect(b.enemies[id].alive, `alive ${id}`).toBe(a.enemies[id].alive);
    expect(b.enemies[id].hp, `health ${id}`).toBeCloseTo(a.enemies[id].hp, 1);
    if (a.enemies[id].alive) expect(Math.hypot(a.enemies[id].x - b.enemies[id].x, a.enemies[id].z - b.enemies[id].z), `position ${id}`).toBeLessThan(posTol);
  }
  expect(b.step, 'same story step').toBe(a.step);
}

// Waits until neither side's enemies change for `ms` (a quiet moment to compare in).
export async function quiesce(host, guest, ms = 1500) {
  await host.evaluate(() => { for (const e of window.__game.enemies) if (e.alive) { e.ready = () => false; } window.__game.combat.director.clear?.(); });
  await host.waitForTimeout(ms);
  void guest;
}
