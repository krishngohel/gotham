// [verify] Probe for the movement.spec "grapple chain across the Loop" failure: which start roof the
// test picks, what the roof heights around it are, and whether the game offers grapple targets from
// a glide at that height versus from a typical mid-height roof.
// usage: node scripts/verify/grapple-probe.mjs <base url>
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5860/';
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(base + '?at=toNeon&god=1&new=1&moves=all&q=potato');
await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 30, null, { timeout: 120000 });
const r = await page.evaluate(() => {
  const g = window.__game;
  const box = g.world.grapplePoints.filter((p) => !p.perch && p.x > -260 && p.x < -200 && p.z < -380 && p.z > -560 && p.y > 20);
  box.sort((a, b) => b.y - a.y);
  const heights = box.map((p) => Math.round(p.y));
  const hist = {};
  for (const p of g.world.grapplePoints.filter((q) => !q.perch && q.x > -260 && q.x < 236 && q.z < -380 && q.z > -560)) {
    const b = Math.floor(p.y / 20) * 20; hist[b] = (hist[b] ?? 0) + 1;
  }
  return { total: g.world.grapplePoints.length, inBox: box.length, top: box.slice(0, 5).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), src: p.src ?? p.kind ?? p.tag ?? null })), heights: heights.slice(0, 30), loopHeightHist: hist, range: g.hero.moves.grappleRange, reGrapple: g.hero.moves.reGrapple };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
