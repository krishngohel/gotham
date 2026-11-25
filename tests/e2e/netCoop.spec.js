import { test, expect, chromium } from '@playwright/test';
import { pairOverBroadcast, skipTalk, worldOf, sameWorld, collectErrors, ready } from './netHelpers.js';

// Online co-op (workstream D2) end to end: two pages of one browser context play together over the
// BroadcastChannel transport (the same session, replication and replica code as WebRTC; only the
// wire differs), plus one test over a real RTCPeerConnection whose offer and answer the test
// relays itself (no signalling service involved). Automated tests never touch public relays.
test.describe.configure({ mode: 'serial' });

const fightNow = async (host) => host.evaluate(() => { for (const e of window.__game.enemies) if (e.alive) e.wake?.(); });

test('online brawl: the guest fights the host\'s goons, hits and KOs replicate, the story step is shared, bandwidth in budget', async ({ browser }) => {
  const ctx = await browser.newContext();
  const host = await ctx.newPage(), guest = await ctx.newPage();
  const errs = { host: collectErrors(host), guest: collectErrors(guest) };
  await pairOverBroadcast(host, guest, { hostUrl: '/?fight=test&net=broadcast&god=1' });
  await host.evaluate(() => {
    window.__t = { guestImpacts: 0, guestKos: 0 };
    const g = window.__game;
    g.events.on('impact', (d) => { if (d.player?.remote) window.__t.guestImpacts += 1; });
    g.events.on('ko', (d) => { if (d.player?.remote) window.__t.guestKos += 1; });
  });
  await guest.evaluate(() => { window.__t = { hurt: 0 }; window.__game.events.on('heroHurt', (d) => { if (d.player === window.__game.players[0]) window.__t.hurt += 1; }); });
  const t0 = Date.now();
  const bw0 = await host.evaluate(() => window.__game.net.bandwidth());
  // The guest fights from the keyboard (kick attaches to any goon in reach); the host's hero stands.
  for (let i = 0; i < 120; i++) {
    await skipTalk(host, guest);
    await fightNow(host);
    await guest.keyboard.press(i % 3 ? 'KeyE' : 'KeyQ');
    await guest.waitForTimeout(200);
    const s = await host.evaluate(() => window.__t);
    if (s.guestKos >= 2 && i > 30) break;
  }
  const bw1 = await host.evaluate(() => window.__game.net.bandwidth());
  const secs = (Date.now() - t0) / 1000;
  const down = ((bw1.out.state + bw1.out.ctl - bw0.out.state - bw0.out.ctl) * 8) / secs / 1000;
  const up = ((bw1.in.state + bw1.in.ctl - bw0.in.state - bw0.in.ctl) * 8) / secs / 1000;
  console.log(`bandwidth in a brawl: host->guest ${down.toFixed(1)} kbit/s, guest->host ${up.toFixed(1)} kbit/s (payload, before UDP/DTLS/SCTP overhead)`);
  const hostSide = await host.evaluate(() => ({ t: window.__t, stats: window.__game.net.rep.stats }));
  const guestSide = await guest.evaluate(() => ({ t: window.__t, stats: window.__game.net.rep.stats }));
  expect(hostSide.stats.accepted, 'guest hit claims accepted by the host').toBeGreaterThan(0);
  expect(hostSide.t.guestImpacts, 'the host saw the guest\'s blows land').toBeGreaterThan(0);
  expect(hostSide.t.guestKos, 'the guest KO\'d goons in the host\'s world').toBeGreaterThan(0);
  expect(guestSide.stats.snaps).toBeGreaterThan(50);
  expect(down).toBeLessThan(200);
  expect(up).toBeLessThan(50);
  // A quiet moment, then both sides agree.
  await host.evaluate(() => { for (const e of window.__game.enemies) if (e.alive) e.ready = () => false; });
  await host.waitForTimeout(1500);
  const [a, b] = [await worldOf(host), await worldOf(guest)];
  sameWorld(expect, a, b, { posTol: 1.5 });
  expect(b.role).toBe('guest');
  expect(errs.host, 'host console errors').toEqual([]);
  expect(errs.guest, 'guest console errors').toEqual([]);
  await ctx.close();
});

test('disconnect and reconnect: the guest drops, comes back to the same slot and the worlds agree again', async ({ browser }) => {
  const ctx = await browser.newContext();
  const host = await ctx.newPage(), guest = await ctx.newPage();
  const errs = { host: collectErrors(host), guest: collectErrors(guest) };
  await pairOverBroadcast(host, guest, { hostUrl: '/?fight=test&net=broadcast&god=1' });
  await skipTalk(host, guest);
  // Cut the wire both ways (no close: an outage); the session notices the silence.
  for (const p of [host, guest]) await p.evaluate(() => { window.__st = []; window.__game.net.session.on('status', (x) => window.__st.push(x.state)); });
  await guest.evaluate(() => window.__game.net.session.link.unplug(true));
  await host.waitForFunction(() => window.__st.includes('away'), null, { timeout: 15000 });
  // While it is gone the host plays on: a goon goes down.
  await host.evaluate(() => { const e = window.__game.enemies.find((x) => x.alive); e.health = 0; e.applyHit({ outcome: 'ko' }, window.__game.hero.pos); });
  await guest.waitForFunction(() => window.__st.includes('reconnecting') && window.__game.net.session.state === 'connected', null, { timeout: 40000 });
  await host.waitForFunction(() => window.__game.net.session.state === 'connected' && window.__game.players.length === 2, null, { timeout: 30000 });
  await host.evaluate(() => { for (const e of window.__game.enemies) if (e.alive) e.ready = () => false; });
  await host.waitForTimeout(2000);
  sameWorld(expect, await worldOf(host), await worldOf(guest), { posTol: 1.5 });
  expect(await host.evaluate(() => window.__game.players[1].remote)).toBe(true);
  expect(errs.host).toEqual([]);
  expect(errs.guest).toEqual([]);
  await ctx.close();
});

test('story beats: a predator room, the Batmobile chase and the boss all advance on both machines', async ({ browser }) => {
  test.setTimeout(420000);
  const ctx = await browser.newContext();
  const host = await ctx.newPage(), guest = await ctx.newPage();
  const errs = { host: collectErrors(host), guest: collectErrors(guest) };
  await pairOverBroadcast(host, guest, { hostUrl: '/?at=monarchBalcony&net=broadcast&god=1' });
  const step = (p) => p.evaluate(() => window.__game.flow.objectives.step?.id);
  const drive = async (until, act) => {
    for (let i = 0; i < 200; i++) {
      await skipTalk(host, guest);
      const [h, g] = [await step(host), await step(guest)];
      if (until(h) && g === h) return h;
      await act(h);
      await host.waitForTimeout(400);
    }
    throw new Error(`stuck at host ${await step(host)} / guest ${await step(guest)}`);
  };
  // The predator room: the guest sees the room goons as puppets; the host clears the room.
  await guest.waitForFunction(() => window.__game.enemies.length > 0, null, { timeout: 30000 });
  const roomGuest = await guest.evaluate(() => window.__game.enemies.filter((e) => e.netPuppet).length);
  expect(roomGuest).toBeGreaterThan(0);
  await drive((s) => s === 'rig', async (s) => {
    if (s === 'monarchBalcony') { await host.evaluate((p) => window.__game.teleport(p), await host.evaluate(() => window.__game.flow.target)); await host.evaluate(() => window.__game.winFight()); }
  });
  // Jump the host to the chase: the guest follows; the chase runs on the host and finishes.
  await host.evaluate(() => window.__game.jump('boardBatmobile'));
  await drive((s) => s === 'toRoofAfterChase', async (s) => {
    if (s === 'boardBatmobile') await host.evaluate(() => { const v = window.__game.vehicles; if (v && !v.active) v.enter(v.batmobile); });
    else await host.evaluate(() => window.__game.vehicles?.debugWin?.());
  });
  // The boss: goons in waves (puppets on the guest), then the Joker's phases forced along.
  await host.evaluate(() => window.__game.jump('boss'));
  await drive((s) => s !== 'boss' && s !== 'toTower', async (s) => {
    if (s !== 'boss') return;
    await host.evaluate(() => {
      const G = window.__game, B = G.boss;
      G.winFight();
      if (B.phase === 2 && B.joker.state === 'roam') { B.joker.state = 'throw'; B.joker.t = 0; B.joker.applyHit({ outcome: 'stun' }, B.joker.pos); for (let i = 0; i < 5; i++) B.joker.applyHit({ outcome: 'hit' }, G.hero.pos); }
      if (B.phase === 3 && ['approach', 'windup', 'backoff'].includes(B.joker.state)) { B.joker.state = 'staggered'; B.joker.finishable = true; B.joker.applyHit({ outcome: 'hit' }, G.hero.pos); }
    });
  });
  const [h, g] = [await step(host), await step(guest)];
  expect(g).toBe(h);
  expect(errs.host).toEqual([]);
  expect(errs.guest).toEqual([]);
  await ctx.close();
});

test('real WebRTC: the test relays the offer and answer; both channels open and a fight replicates', async () => {
  // Two contexts in one browser: no BroadcastChannel between them, only the peer connection.
  const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const base = test.info().project.use.baseURL;
  const a = await (await browser.newContext({ baseURL: base })).newPage();
  const b = await (await browser.newContext({ baseURL: base })).newPage();
  const errs = { host: collectErrors(a), guest: collectErrors(b) };
  await a.goto('/?fight=test&god=1');
  await b.goto('/?god=1');
  await a.waitForFunction(ready, null, { timeout: 120000 });
  await b.waitForFunction(ready, null, { timeout: 120000 });
  // Signalling by hand: host offer -> guest answer -> host.
  const offer = await a.evaluate(async () => { const m = await import('/src/net/transport/webrtc.js'); const o = await m.createOffer({ rtcConfig: { iceServers: [] }, gatherMs: 2000 }); window.__o = o; return o.offer; });
  const answer = await b.evaluate(async (sdp) => { const m = await import('/src/net/transport/webrtc.js'); const r = await m.acceptOffer(sdp, { rtcConfig: { iceServers: [] }, gatherMs: 2000 }); window.__a = r; return r.answer; }, offer);
  await a.evaluate((sdp) => window.__o.acceptAnswer(sdp), answer);
  await a.waitForFunction(() => window.__o.link.open, null, { timeout: 30000 });
  await b.waitForFunction(() => window.__a.link.open, null, { timeout: 30000 });
  const chans = async (p, k) => p.evaluate((key) => { const l = window[key].link; return [l.channels.ctl.readyState, l.channels.state.readyState, l.channels.ctl.id, l.channels.state.id]; }, k);
  expect(await chans(a, '__o')).toEqual(['open', 'open', 100, 101]);
  expect(await chans(b, '__a')).toEqual(['open', 'open', 100, 101]);
  // The game over that link: the host invites, the guest joins, picks, and fights.
  await a.evaluate(() => window.__game.openNet((n) => n.hostWithLink(window.__o.link)));
  await b.evaluate(() => window.__game.openNet((n) => n.joinWithLink(window.__a.link)));
  await b.waitForSelector('.hero-select.show [data-act="ok"][data-col="0"]', { timeout: 30000 });
  await b.click('.hero-select.show [data-act="ok"][data-col="0"]');
  await b.waitForFunction(() => window.__game.net?.runStarted && window.__game.enemies.length > 0, null, { timeout: 90000 });
  await a.evaluate(() => document.querySelector('.net-host-panel')?.remove());
  for (let i = 0; i < 80; i++) {
    await skipTalk(a, b);
    await a.evaluate(() => { for (const e of window.__game.enemies) if (e.alive) e.wake?.(); });
    await b.keyboard.press('KeyE');
    await b.waitForTimeout(200);
    if (await a.evaluate(() => window.__game.net.rep.stats.accepted > 2)) break;
  }
  const st = await a.evaluate(() => window.__game.net.rep.stats);
  expect(st.accepted, 'hits claimed over WebRTC and accepted').toBeGreaterThan(0);
  expect(st.heroIn).toBeGreaterThan(20);
  expect(await b.evaluate(() => window.__game.net.rep.stats.snaps)).toBeGreaterThan(20);
  const path = await a.evaluate(() => window.__o.link.pathInfo());
  console.log('selected candidate pair:', JSON.stringify(path));
  expect(errs.host).toEqual([]);
  expect(errs.guest).toEqual([]);
  await browser.close();
});
