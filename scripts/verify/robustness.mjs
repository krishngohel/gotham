// [verify] Robustness of the production build (item 2f): boots the game under hostile conditions and
// reports uncaught errors and what the player sees. One browser at a time, scenario by scenario.
// usage: BASE=http://localhost:5861/ OUT=<dir for screenshots> node scripts/verify/robustness.mjs [scenario ...]
// scenarios: nostorage corrupt contextloss hidden noaudio res720 res1080 ultrawide res43 touch
import { chromium, devices } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:5861/';
const out = process.env.OUT ?? 'robustness';
mkdirSync(out, { recursive: true });
const all = ['nostorage', 'corrupt', 'contextloss', 'hidden', 'noaudio', 'res720', 'res1080', 'ultrawide', 'res43', 'touch'];
const pick = process.argv.slice(2).length ? process.argv.slice(2) : all;
const ARGS = ['--ignore-gpu-blocklist', '--use-angle=d3d11'];
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 30;
const results = [];

async function scenario(name, fn, { args = ['--mute-audio', ...ARGS], context = {} } = {}) {
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...context });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  const t0 = Date.now();
  let note = {};
  try { note = (await fn(page, ctx)) ?? {}; } catch (e) { note = { threw: e.message.slice(0, 300) }; }
  await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 55 }).catch(() => {});
  results.push({ name, ms: Date.now() - t0, errors, ...note });
  console.log(JSON.stringify(results.at(-1)));
  await browser.close();
}
async function boot(page, q = '?at=start&god=1&q=low') {
  await page.goto(base + q);
  await page.waitForFunction(ready, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
}
const frame = (page) => page.evaluate(() => window.__game?.state?.frame ?? -1);
const visibleText = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== 'none' && e.offsetParent !== null ? e.textContent.trim().slice(0, 160) : null; }, sel);
const overflow = (page) => page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: innerWidth, scrollH: document.documentElement.scrollHeight, innerH: innerHeight, canvas: [document.getElementById('game').width, document.getElementById('game').height] }));

const S = {
  // localStorage throws on every access (a locked-down browser profile).
  nostorage: () => scenario('nostorage', async (page, ctx) => {
    await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } }); });
    await boot(page, '?god=1&q=low');
    const title = await page.evaluate(() => !!document.querySelector('.mbtn.primary'));
    await page.evaluate(() => { document.querySelector('.mbtn.primary')?.click(); document.querySelector('.suit-card.suit-m')?.click(); });
    await page.waitForTimeout(6000);
    return { title, frameAfterStart: await frame(page), inRun: await page.evaluate(() => !!window.__game?.flow) };
  }),
  // A corrupt progress save and corrupt settings.
  corrupt: () => scenario('corrupt', async (page, ctx) => {
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('gotham-progress-v1', '{"step": 9, "gadgets": [broken'); localStorage.setItem('gotham-settings-v1', 'not json at all'); } });
    await boot(page, '?god=1&q=low');
    await page.evaluate(() => { document.querySelector('.mbtn.primary')?.click(); document.querySelector('.suit-card.suit-m')?.click(); });
    await page.waitForTimeout(6000);
    return { inRun: await page.evaluate(() => !!window.__game?.flow), step: await page.evaluate(() => window.__game?.flow?.objectives?.step?.id ?? null) };
  }),
  // The GPU drops the context mid-game and gives it back.
  contextloss: () => scenario('contextloss', async (page) => {
    await boot(page);
    const before = await frame(page);
    const lost = await page.evaluate(() => { const gl = document.getElementById('game').getContext('webgl2'); const x = gl?.getExtension('WEBGL_lose_context'); if (!x) return 'no extension'; window.__lose = x; x.loseContext(); return 'lost'; });
    await page.waitForTimeout(3000);
    const msgLost = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.offsetParent && /graphics|context|GPU|WebGL/i.test(e.textContent) && e.children.length === 0).map((e) => e.textContent.trim()).slice(0, 3));
    await page.evaluate(() => window.__lose?.restoreContext());
    await page.waitForTimeout(5000);
    const after = await frame(page);
    return { lost, before, after, advancing: after > before, messageWhileLost: msgLost };
  }),
  // The tab is hidden (frozen) for 60 s, then comes back.
  hidden: () => scenario('hidden', async (page) => {
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await new Promise((r) => setTimeout(r, 60000));
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
    const f1 = await frame(page);
    await page.waitForTimeout(3000);
    const f2 = await frame(page);
    return { resumed: f2 > f1, paused: await page.evaluate(() => !!window.__game?.state?.paused), heroY: await page.evaluate(() => window.__game?.hero?.pos?.y ?? null) };
  }),
  // Audio blocked: no user gesture ever reaches the page, autoplay needs one.
  noaudio: () => scenario('noaudio', async (page) => {
    await boot(page, '?at=start&q=low');
    await page.waitForTimeout(4000);
    return { audioState: await page.evaluate(() => window.__game?.audio?.ctx?.state ?? window.__game?.audio?.state ?? null), frame: await frame(page) };
  }, { args: ['--autoplay-policy=document-user-activation-required', ...ARGS] }),
  res720: () => scenario('res720', async (page) => { await boot(page); return overflow(page); }),
  res1080: () => scenario('res1080', async (page) => { await boot(page); return overflow(page); }, { context: { viewport: { width: 1920, height: 1080 } } }),
  ultrawide: () => scenario('ultrawide', async (page) => { await boot(page); return overflow(page); }, { context: { viewport: { width: 2560, height: 1080 } } }),
  res43: () => scenario('res43', async (page) => { await boot(page); return overflow(page); }, { context: { viewport: { width: 1024, height: 768 } } }),
  // A phone: it should explain, not crash.
  touch: () => scenario('touch', async (page) => {
    await page.goto(base);
    await page.waitForTimeout(12000);
    return { mobileNote: await visibleText(page, '.mobile-note'), errorNote: await visibleText(page, '.error-note'), ready: await page.evaluate(() => !!window.__game?.state?.ready) };
  }, { context: { ...devices['iPhone 13'] } }),
};
for (const n of pick) if (S[n]) await S[n]();
console.log(`\nSUMMARY ${results.map((r) => `${r.name}:${r.errors.length ? `${r.errors.length} errors` : r.threw ? 'threw' : 'ok'}`).join(' ')}`);
