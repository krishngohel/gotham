// [m1] Screenshots of Night One's added missions: jumps to each new step, stands the hero where a
// player would be, and saves a small JPEG per location. Also prints each frame's mean luminance
// (owner note 2026-11-25: no scene too dark), measured on the screenshot itself.
//   BASE=http://localhost:5950/ node scripts/n1-mission-shots.mjs [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const base = process.env.BASE ?? 'http://localhost:5950/';
const out = process.argv[2] ?? 'docs/design/shots/missions/n1';
mkdirSync(out, { recursive: true });
// [file, step, hero position, look yaw (the way the hero faces), pitch, settle ms, what to do first]
const SHOTS = [
  ['short-1-crane', 'shortCount', [-262, 18.65, 122], -Math.PI / 2, 0.2],
  ['short-2-silo-view', 'toFurnace', [-340, 42.15, 30], -Math.PI / 2, 0.35],
  ['short-3-furnace-fight', 'furnaceFight', [-418, 0.15, 58], Math.PI, 0.2, 2500],
  ['short-4-yard-car', 'callCar', [-456, 0, 64], -Math.PI / 2, 0.2, 3500],
  ['booth-1-feed-scan', 'feedTrace', [176, 22, -58], Math.PI / 2, 0.25, 1500, 'detective'],
  ['booth-2-dome-view', 'domeWatch', [336, 17.4, 259], 0, 0.6, 2500],
  ['booth-3-promenade', 'domeWatch', [306, 0, 281], Math.PI / 2, 0.15, 2500],
  ['booth-4-booth-door', 'freeEngineer', [336, 0, 276], 0, 0.2, 1500],
  ['booth-5-relay-scan', 'relayKill', [312, 0, 252], Math.atan2(6, -6), 0.2, 1500, 'detective'],
  ['encore-1-drive', 'encoreBoard', [345, 0, -124], Math.PI, 0.18, 3500],
  ['encore-2-fountain', 'valves', [300, 0.15, -436], Math.PI, 0.3, 2500],
  ['clocks-1-crane', 'quayWatch', [-262, 18.65, -118], 0, 0.5, 2500],
  ['clocks-2-quay', 'quayWatch', [-260.5, 0, -146], 0, 0.15, 2500],
  ['clocks-3-clock-scan', 'quayClock', [-260, 0, -40], 0, 0.2, 1500, 'detective'],
  ['clocks-4-exchange', 'pulseRun', [-140, 92, -566], Math.atan2(80, 71), 0.4, 2500],
  ['clocks-5-kane', 'pulseRun', [-85, 8.55, -449], Math.atan2(55, 119), 0.15, 2000],
];

const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?at=shortCount&god=1&abilities=story${process.env.QUALITY ? `&q=${process.env.QUALITY}` : ''}`);
await page.waitForFunction(() => window.__game?.state?.ready && window.__game.flow && window.__game.state.frame > 30, null, { timeout: 120000 });
await page.waitForTimeout(2000);
for (const [file, step, p, yaw, pitch, settle = 2000, mode] of SHOTS) {
  await page.evaluate(({ step, p, yaw, pitch, mode }) => {
    const G = window.__game;
    if (G.vehicles?.active) G.vehicles.exit();
    if (G.flow.objectives.step?.id !== step) G.jump(step);
    G.radio?.skip?.();
    G.hero.teleport({ x: p[0], y: p[1], z: p[2] }, yaw);
    G.hero.bat.face(yaw);
    G.players?.[0]?.view?.follow?.snapBehind?.(yaw, pitch);
    G.state.detectiveOn = mode === 'detective';
  }, { step, p, yaw, pitch, mode });
  await page.waitForTimeout(settle);
  await page.evaluate(({ p, yaw, pitch }) => { const G = window.__game; G.radio?.skip?.(); G.hero.teleport({ x: p[0], y: p[1], z: p[2] }, yaw); G.players?.[0]?.view?.follow?.snapBehind?.(yaw, pitch); }, { p, yaw, pitch });
  await page.waitForTimeout(700);
  const png = await page.screenshot();
  await sharp(png).resize(960).jpeg({ quality: 62 }).toFile(`${out}/${file}.jpg`);
  const { channels } = await sharp(png).stats();
  const luma = Math.round(0.2126 * channels[0].mean + 0.7152 * channels[1].mean + 0.0722 * channels[2].mean);
  const info = await page.evaluate(() => { const G = window.__game; return { step: G.flow.objectives.step?.id, enemies: G.enemies?.filter?.((e) => e.alive).length ?? 0 }; });
  console.log(`${file.padEnd(26)} step ${String(info.step).padEnd(14)} enemies ${info.enemies}  mean luma ${luma}/255`);
}
await page.evaluate(() => { window.__game.state.detectiveOn = false; });
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
