// Cape colour regression check (polish list: "Batman's cape renders pale blue from behind").
// Photographs each dark-caped suit from behind in tools/roster.html under the game's toon + ink
// pipeline at night (23:00) and at noon (12:30), once with the cape and once without; the pixels
// that change are the cape, and their mean luma (sRGB, 0..255) must stay under LIMIT.
//   node scripts/cape-check.mjs [url=http://localhost:5730] [id ...]
// Exit code 1 when any cape is too light. Prints one line per suit and hour.
import { chromium } from 'playwright-core';

// A near-black or dark-navy cape. Measured here: the old pale-blue cape 42-45 (night and noon);
// the fixed one 15-27 depending on the suit's cape colour.
const LIMIT = 32;
const args = process.argv.slice(2);
const url = (args[0] && args[0].startsWith('http') ? args.shift() : 'http://localhost:5730').replace(/\/$/, '');
// Suits whose cape is meant to be dark (the blue-and-grey and arctic capes are light on purpose).
const ids = args.length ? args : ['bat-m', 'bat-stealth', 'bat-noir', 'bat-armoured', 'bat-year-one', 'bat-gold', 'bat-f'];
const sharp = (await import('sharp')).default;
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 360, height: 480 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(`${url}/tools/roster.html?ui=0&freeze=1&pr=1&id=${ids[0]}`);
await page.waitForFunction(() => window.__roster?.ready, null, { timeout: 120000 });

const raw = async () => sharp(await page.screenshot({ type: 'png' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
let failed = 0;
for (const id of ids) {
  await page.evaluate((id) => window.__roster.show(id), id);
  // 'back' is a level camera; 'game8m' is the follow camera, above and behind, which is how the
  // cape is seen in play (and the angle at which the rim used to flood it pale: see cape.js).
  for (const [view, hour] of [['back', 23], ['back', 12.5], ['game8m', 23], ['game8m', 12.5]]) {
    const shot = async (cape) => {
      await page.evaluate(([hour, cape, view]) => {
        const r = window.__roster;
        r.setHour(hour);
        r.pose('Idle_Loop', 0.4);
        for (const l of r.live) if (l.cape) l.cape.mesh.visible = cape;
        r.setView(view); r.render(); r.render();
      }, [hour, cape, view]);
      return raw();
    };
    const a = await shot(true), b = await shot(false);
    let sum = 0, n = 0;
    for (let i = 0; i < a.data.length; i += 3) {
      const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d < 24) continue;
      sum += 0.2126 * a.data[i] + 0.7152 * a.data[i + 1] + 0.0722 * a.data[i + 2];
      n++;
    }
    const luma = n ? sum / n : 0;
    const ok = n > (view === 'back' ? 2000 : 150) && luma < LIMIT;
    if (!ok) failed++;
    console.log(`${id.padEnd(14)} ${view.padEnd(6)} ${String(hour).padStart(5)}h  cape pixels ${String(n).padStart(6)}  mean luma ${luma.toFixed(1).padStart(6)}  ${ok ? 'ok' : 'FAIL'}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
