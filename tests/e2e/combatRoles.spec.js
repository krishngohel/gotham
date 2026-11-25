import { test, expect } from '@playwright/test';

// Long Night 2, workstream I: a mixed-role fight is won on Normal by a scripted player who gives
// each threat its answer (counter the blue tells, dodge the red ones, cape-stun the shield and the
// stun baton before striking them), and lost on Hard by one who only mashes punch. Both play
// through the real input path (synthetic key and mouse events on the page), the real combat code
// and the real enemy AI; nobody is in god mode. Difficulty is real when the same squad that the
// right answers beat on Normal beats the masher on Hard.
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;
const SQUAD = ['grunt', 'knife', 'shield', 'baton', 'medic', 'grunt'];

async function stageFight(page, difficulty) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?fight=test');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__game.enemies.length > 0, null, { timeout: 20000 });
  await page.evaluate(({ difficulty, squad }) => {
    const G = window.__game;
    // The new-game intro comic (and any story page) would pause the fight: skip them as they come.
    setInterval(() => { if (G.comic?.playing) G.comic.skip?.(); }, 100);
    G.settings.difficulty = difficulty;
    for (const e of [...G.combat.enemies]) G.despawn(e);
    const h = G.hero;
    h.health = h.maxHealth = 100;
    const list = squad.map((type, i) => {
      const a = (i / squad.length) * Math.PI * 2;
      return G.spawn(type, { x: h.pos.x + Math.sin(a) * 6, y: h.pos.y, z: h.pos.z + Math.cos(a) * 6 });
    });
    G.combat.setEnemies(list);
    window.__fight = { list, hurt: 0, down: false, counters: 0, dodges: 0, capes: 0, presses: 0 };
    G.events.on('heroHurt', () => { window.__fight.hurt += 1; });
    G.events.on('heroDown', () => { window.__fight.down = true; });
  }, { difficulty, squad: SQUAD });
  // The role clips arrive with the enemies pack (lazy): wait for it, then wake the squad.
  await page.waitForFunction(() => window.__game.hero.bat.animator.has('Shield_Bash') && window.__game.hero.bat.animator.has('Cape_Swirl'), null, { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => { for (const e of window.__fight.list) e.wake(); });
  return errors;
}

// A page-side player: every frame it reads the fight and presses keys like a person would.
async function startPlayer(page, mode) {
  await page.evaluate((mode) => {
    const G = window.__game, F = window.__fight;
    const key = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code })), 40); F.presses += 1; };
    const mouse = (button) => { window.dispatchEvent(new MouseEvent('mousedown', { button })); setTimeout(() => window.dispatchEvent(new MouseEvent('mouseup', { button })), 40); F.presses += 1; };
    const answered = new Set();
    let cd = 0, last = performance.now();
    const tick = () => {
      if (window.__stopPlayer) return;
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      cd -= dt;
      const h = G.hero;
      if (h.dead || F.down) return;
      // [fix1] A goon on his knees with his hands up is out of the fight (as playOut counts him):
      // the player leaves him be. Counted as live, a surrendered baton goon (still holding a charged
      // baton, never stunned by the cape) was a "guard" to cape forever (107 capes in 30 s) while
      // the last goon standing went untouched.
      const live = F.list.filter((e) => e.alive && e.state !== 'surrender');
      if (!live.length) return;
      if (mode === 'masher') { if (cd <= 0) { mouse(0); cd = 0.15; } requestAnimationFrame(tick); return; }
      const near = (e, r) => e.pos.distanceTo(h.pos) < r;
      // [fix1] Reeling from a blow, nothing he presses does anything (the game drops it): like a
      // person he waits until he has his feet back and answers then, instead of spending the
      // answer on a press that cannot land and letting that wind-up through unanswered.
      if (h.control && (h.control.name === 'stagger' || h.control.name === 'blockStagger')) { requestAnimationFrame(tick); return; }
      // 1. A tell aimed at me: blue -> counter, red -> dodge just before it lands.
      for (const e of live) {
        if (e.state !== 'windup' && e.state !== 'attack') continue;
        const id = e.id + ':' + (e.windupN ?? 0);
        if (e.tell === 'blue' && e.state === 'windup' && near(e, 7) && e.t > 0.06 && !answered.has('c' + id)) {
          answered.add('c' + id); mouse(2); F.counters += 1; cd = 0.2; requestAnimationFrame(tick); return;
        }
        if (e.tell === 'red' && near(e, e.def.ranged ? 40 : 5.5) && ((e.state === 'windup' && e.windupDur - e.t < 0.22) || e.state === 'attack') && !answered.has('d' + id)) {
          answered.add('d' + id); key('KeyC'); F.dodges += 1; cd = 0.3; requestAnimationFrame(tick); return;
        }
      }
      if (cd > 0 || (h.control && !(h.control.combat && h.control.canChain?.()))) { requestAnimationFrame(tick); return; }
      // 2. Shields and charged batons: cape-stun first.
      const guard = live.find((e) => near(e, 3.2) && !e.stunned && !e.down && ((e.def.frontBlock) || (e.def.shock && e.charged)));
      if (guard) { key('KeyQ'); F.capes += 1; cd = 0.55; requestAnimationFrame(tick); return; }
      // 3. Otherwise keep hitting.
      mouse(0); cd = 0.22;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, mode);
}

async function playOut(page, seconds) {
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    // A goon on his knees with his hands up is out of the fight (zip-tying him is a walk over).
    const s = await page.evaluate(() => ({ left: window.__fight.list.filter((e) => e.alive && e.state !== 'surrender').length, down: window.__fight.down || window.__game.hero.dead, hp: window.__game.hero.health }));
    if (s.left === 0 || s.down) return s;
    await page.waitForTimeout(500);
  }
  return page.evaluate(() => ({ left: window.__fight.list.filter((e) => e.alive && e.state !== 'surrender').length, down: window.__fight.down || window.__game.hero.dead, hp: window.__game.hero.health, timeout: true }));
}

test('normal: the right answers win a mixed-role fight', async ({ page }) => {
  const errors = await stageFight(page, 'normal');
  await startPlayer(page, 'answers');
  const end = await playOut(page, 120);
  const stats = await page.evaluate(() => { window.__stopPlayer = true; const F = window.__fight; return { hurt: F.hurt, counters: F.counters, dodges: F.dodges, capes: F.capes }; });
  console.log('normal / answers', JSON.stringify({ ...end, ...stats }));
  expect(end.down, 'the hero stays up').toBe(false);
  expect(end.left, 'every goon is down, zip-tied, surrendered or gone').toBe(0);
  expect(stats.counters + stats.dodges + stats.capes, 'the answers were used').toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

test('hard: button-mashing loses the same fight', async ({ page }) => {
  const errors = await stageFight(page, 'hard');
  await startPlayer(page, 'masher');
  const end = await playOut(page, 120);
  await page.evaluate(() => { window.__stopPlayer = true; });
  console.log('hard / masher', JSON.stringify(end));
  expect(end.down, 'the masher goes down').toBe(true);
  expect(end.left, 'with goons still standing').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
