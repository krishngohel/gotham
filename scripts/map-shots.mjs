// Screenshots of the map work (workstream L2): node scripts/map-shots.mjs http://localhost:5670 [dir]
// Minimap close-ups (north-up, rotating, high contrast), the lower-deck ribbon, the city map
// overview, a floor plan, and the Progress page's city map.
import { chromium } from '@playwright/test';
const BASE = process.argv[2] ?? 'http://localhost:5670';
const DIR = process.argv[3] ?? 'docs/design/shots/map';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`${BASE}/?at=start&god=1&new=1`);
await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 20, null, { timeout: 120000 });
for (let i = 0; i < 30; i++) {
  const busy = await page.evaluate(() => { const G = window.__game; if (G.cinematic?.active) { G.cinematic.skip(); return true; } if (G.comic?.playing) { G.comic.skip(); return true; } if (G.radio?.playing) { G.radio.skip(); return true; } return false; });
  if (!busy && i > 3) break; await wait(250);
}
await page.mouse.click(640, 400);
const shot = (name, clip) => page.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 80, clip });
const ev = (fn, arg) => page.evaluate(fn, arg);
// Explore a little so the fog has holes: the Loop, the Mile, the river, a vista.
for (const p of [[-150, -400], [0, -450], [90, -520], [150, -650], [-30, -300], [300, -500], [-380, -400]]) {
  await ev(([x, z]) => { const G = window.__game; const y = G.world.collision.groundBelow(x, 200, z, 0.3); G.hero.teleport({ x, y: Math.max(0, y) + 0.2, z }, Math.PI); }, p);
  await wait(700);
}
// 1. Minimap, north-up, on a Loop street at the El.
await ev(() => { const G = window.__game; G.hero.teleport({ x: -30, y: 0.2, z: -440 }, Math.PI); G.follow.snapBehind?.(Math.PI); G.nav.placeWaypoint(G.players[0], { x: 150, y: 0, z: -650 }); });
await wait(1500);
await shot('minimap-single', { x: 0, y: 0, width: 260, height: 260 });
// 2. Rotating, then high contrast.
await ev(() => { window.__game.settings.map.rotate = true; window.__game.hero.teleport({ x: -30, y: 0.2, z: -440 }, Math.PI / 2); });
await wait(1200);
await shot('minimap-rotating', { x: 0, y: 0, width: 260, height: 260 });
await ev(() => { window.__game.settings.map.rotate = false; window.__game.settings.map.highContrast = true; });
await wait(1200);
await shot('minimap-high-contrast', { x: 0, y: 0, width: 260, height: 260 });
await ev(() => { window.__game.settings.map.highContrast = false; });
// 3. The ribbon on the lower deck (under the upper one) from the Batmobile. The driving camera
// sits up inside the upper deck's slab down there (a vehicle-camera issue, reported), so this shot
// holds the camera low behind the car by hand.
await ev(() => { const b = window.__game.world.bridges; b.hold('bridgeE', 'down'); b.hold('bridgeW', 'down'); });
await ev(() => {
  const G = window.__game;
  G.nav.clearWaypoints(G.players[0]);
  G.hero.teleport({ x: -150, y: -5.3, z: -287 }, Math.PI / 2);
  const v = G.vehicles; v.summon('batmobile', { instant: true });
  const bm = v.batmobile; bm.group.position.set(-150, -5.5, -289); bm.v.yaw = Math.PI / 2; bm.group.rotation.y = Math.PI / 2;
});
await wait(300);
await ev(() => { const v = window.__game.vehicles; if (!v.active) v.enter(v.batmobile); });
await wait(600);
await ev(() => {
  const G = window.__game;
  G.nav.placeWaypoint(G.players[0], { x: 150, y: -5.5, z: -291 });
  const f = G.follow, upd = f.update;
  window.__restoreFollow = () => { f.update = upd; };
  f.update = () => { const p = G.vehicles.batmobile.group.position; G.camera.position.set(p.x - 10, p.y + 2.6, p.z - 1.5); G.camera.lookAt(p.x + 30, p.y + 0.5, p.z - 1.5); };
});
await wait(2500);
await shot('ribbon-lower-deck');
await ev(() => { window.__restoreFollow?.(); const v = window.__game.vehicles; if (v.active) v.exit?.(); });
await wait(500);
// 4. City map overview.
await ev(() => { const G = window.__game; G.nav.placeWaypoint(G.players[0], { x: -400, y: 0, z: -300 }, { color: 2 }); G.nav.openMap(G.players[0], { scale: 0.52, focus: { x: 60, z: -220 } }); });
await wait(800);
await shot('full-map-overview');
await page.keyboard.press('Escape');
await wait(500);
// 5. A floor plan: inside the Funhouse.
await ev(() => { const G = window.__game; G.nav.clearWaypoints(G.players[0]); G.hero.teleport({ x: -120, y: 0.2, z: -150 }, Math.PI); G.interiors.update(); });
await wait(1500);
await shot('minimap-floor-plan', { x: 0, y: 0, width: 260, height: 260 });
// 6. The Progress page's city map.
await ev(() => { const G = window.__game; G.hero.teleport({ x: 0, y: 42.2, z: 10 }, Math.PI); });
await wait(600);
await page.keyboard.press('Escape');
await wait(500);
await page.locator('.menu-layer.show button', { hasText: 'Progress' }).first().click().catch(() => {});
await wait(800);
await shot('progress-page');
await b.close();
console.log('shots in', DIR);
