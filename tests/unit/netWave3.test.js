// [net2] Online co-op parity (wave 3): the content seams over the conditioned loopback transport,
// the campaign position, the new record fields, boss wire ids, vehicles, the world clock and
// paired moves. Game-free stand-ins drive the real session, replicators and net modules.
import { describe, it, expect } from 'vitest';
import { createManualClock, createLoopbackNetwork } from '../../src/net/transport/loopback.js';
import { createHostSession, createGuestSession } from '../../src/net/session.js';
import { createHostReplicator } from '../../src/net/replication/host.js';
import { createGuestReplicator } from '../../src/net/replication/guest.js';
import { createContentHost, createContentGuest, toWire, fromWire } from '../../src/net/game/contentNet.js';
import { net } from '../../src/net/share.js';
import { setNetRole } from '../../src/net/mode.js';
import { createEvents, withPlayer } from '../../src/core/events.js';
import { parseCtl, PROTO } from '../../src/net/protocol.js';
import { createWriter, encodeSnapshot, decodeSnapshot, encodeHeroState, decodeHeroState, enemyNum, isBossId, BOSS_NUM, JOKER_NUM, RF } from '../../src/net/codec/snapshot.js';
import { roleOf, applyRole, pressedMask, createHeroPuppet } from '../../src/net/game/puppets.js';
import { createVehicleHost, createVehicleGuest, PROP, PF } from '../../src/net/game/vehicleNet.js';
import { createWorldHost, createWorldGuest } from '../../src/net/game/worldNet.js';
import { createGlueHost } from '../../src/net/game/glueNet.js';
import { createScriptedInput } from '../../src/core/input.js';
import { STORY_FIELDS, guestStorage, PROGRESS_KEY } from '../../src/net/netSave.js';

const HELLO = { build: 'b', content: 'c', kit: 'm' };

// A host and a guest session with replicators whose adapters only forward the content seams.
function pair(conditions) {
  const clock = createManualClock(10000);
  const netw = createLoopbackNetwork({ clock, conditions, seed: 9 });
  const hostS = createHostSession({ signaller: netw.signaller(), code: 'QWERTY', hello: HELLO, clock, getWelcome: () => ({ states: hostContent.welcome() }) });
  const guestS = createGuestSession({ signaller: netw.signaller(), code: 'QWERTY', hello: HELLO, clock, now: () => clock.now() - 500 });
  const hostEvents = createEvents(), guestEvents = createEvents();
  const remote = { netSlot: 1, hero: { bat: {} } };
  remote.hero.player = remote;
  const guestPlayers = [{ netSlot: 1, name: 'me' }, { netSlot: 0, name: 'host' }];
  const puppets = new Map([['e7', { id: 'e7', ch: {}, pos: { x: 0, y: 0, z: 0 }, puppet: true }]]);
  let hostRep = null;
  const hostContent = createContentHost({ registry: net, events: hostEvents, send: (m) => hostRep.event(m), remote });
  hostRep = createHostReplicator({ session: hostS, now: clock.now, adapter: { collect() {}, guestHero() {}, claimHit: () => null, claim: (s, m) => hostContent.claim(m) } });
  let guestContent = null;
  const guestRep = createGuestReplicator({ session: guestS, now: () => clock.now() - 500, hostNow: () => guestS.hostNow(), adapter: { spawn() {}, despawn() {}, enemyByNum: () => null, localHero: () => false, resolveAttack: () => 'miss', hurt() {}, onEvent: (m) => guestContent.onEvent(m) } });
  guestContent = createContentGuest({ registry: net, events: guestEvents, send: (m) => guestS.send(m), playerBySlot: (s) => guestPlayers.find((p) => p.netSlot === s) ?? null, enemyById: (id) => puppets.get(id) ?? null, makeVec: (v) => ({ ...v, vec: true }) });
  hostS.on('message', (m) => hostRep.onMessage(m));
  hostS.on('guest', () => hostRep.setReady(true));
  guestS.on('message', (m) => guestRep.onMessage(m));
  guestS.on('welcome', ({ state }) => guestContent.loadStates(state.states));
  async function run(ms) {
    for (let t = 0; t < ms; t += 16) {
      clock.advance(16);
      for (let i = 0; i < 6; i++) await Promise.resolve();
      if (hostRep.ready) hostContent.tick(0.016);
      hostRep.tick();
      if (guestS.welcomed) guestRep.tick();
    }
  }
  return { clock, hostS, guestS, hostEvents, guestEvents, hostContent, guestContent, run, remote, guestPlayers, puppets, start() { hostS.start(); guestS.start(); } };
}

describe('content seams (src/net/share.js) over loopback', () => {
  for (const c of [{ name: '0 ms', latencyMs: 0 }, { name: '200 ms ±60, 15% loss', latencyMs: 200, jitterMs: 60, loss: 0.15, duplicate: 0.05, reorder: 0.1 }]) {
    it(`shared events, claims and state blobs arrive whole and in order at ${c.name}`, async () => {
      const offs = [];
      let hudState = { timer: '0:00', title: 'Rooftop' };
      const applied = [];
      const claims = [];
      offs.push(net.shareEvent('t3Crime', (d) => typeof d.kind === 'string'));
      offs.push(net.registerState('t3Hud', { hz: 10, snapshot: () => hudState, apply: (v) => applied.push(v) }));
      offs.push(net.registerClaim('t3Ask', (d, { player }) => claims.push({ d, slot: player?.netSlot }), (d) => typeof d.id === 'string'));
      const w = pair(c);
      w.start();
      await w.run(3000);
      expect(w.guestS.welcomed).toBe(true);
      setNetRole('guest');
      const got = [];
      w.guestEvents.on('t3Crime', (d) => got.push(d));
      // Host -> guest: an event with an enemy, a player, a vector and an object that must not travel.
      for (let i = 0; i < 5; i++) w.hostEvents.emit('t3Crime', withPlayer({ kind: 'mugging', n: i, target: w.puppets.get('e7'), pos: { x: 1.234, y: 2, z: 3 }, mesh: { isObject3D: true } }, w.remote));
      w.hostEvents.emit('t3Crime', { kind: 42 }); // fails the guest's validator
      hudState = { timer: '0:12', title: 'Rooftop' };
      await w.run(3000);
      expect(got.map((d) => d.n)).toEqual([0, 1, 2, 3, 4]);
      expect(got[0].remote).toBe(true);
      expect(got[0].player.netSlot).toBe(1);
      expect(got[0].target).toBe(w.puppets.get('e7'));
      expect(got[0].pos).toEqual({ x: 1.23, y: 2, z: 3, vec: true });
      expect('mesh' in got[0]).toBe(false);
      expect(applied.at(-1)).toEqual({ timer: '0:12', title: 'Rooftop' });
      // Unchanged state is not re-sent.
      const n = applied.length;
      await w.run(2000);
      expect(applied.length).toBe(n);
      // Guest -> host claims: validated, handed the guest's player record.
      expect(net.claim('t3Ask', { id: 'pillar1' })).toBe(true);
      expect(net.claim('t3Ask', { id: 5 })).toBe(true); // sent, then refused by the validator
      await w.run(2000);
      expect(claims).toEqual([{ d: { id: 'pillar1' }, slot: 1 }]);
      setNetRole('off');
      expect(net.claim('t3Ask', { id: 'x' })).toBe(false); // offline: the caller acts itself
      for (const o of offs) o();
    }, 60000);
  }
  it('a late joiner gets every state in its welcome', async () => {
    const off = net.registerState('t3Late', { snapshot: () => ({ score: 7 }), apply: (v) => { got = v; } });
    let got = null;
    const w = pair({ latencyMs: 50 });
    w.start();
    await w.run(1500);
    expect(got).toEqual({ score: 7 });
    off();
  });
  it('toWire / fromWire keep payloads plain and bounded', () => {
    const cyc = { a: 1 }; cyc.self = cyc;
    const w = toWire({ cyc, list: Array.from({ length: 100 }, (_, i) => i), s: 'x'.repeat(500), f: () => 1, nan: NaN });
    expect(w.cyc).toEqual({ a: 1 });
    expect(w.list.length).toBe(64);
    expect(w.s.length).toBe(200);
    expect('f' in w || 'nan' in w).toBe(false);
    expect(fromWire({ e: { enemy: 'e1' }, p: { player: 0 } }, { enemyById: (id) => ({ id }), playerBySlot: (s) => ({ s }) })).toEqual({ e: { id: 'e1' }, p: { s: 0 } });
  });
});

describe('the campaign position on the wire', () => {
  it('a step event carries the night and the step id', () => {
    expect(parseCtl(JSON.stringify({ t: 'step', index: 0, id: 'n2Start', night: 'n2' }), 'host')).toBeTruthy();
    expect(parseCtl(JSON.stringify({ t: 'step', index: 0, id: 'x', night: 5 }), 'host')).toBe(null);
    expect(PROTO).toBeGreaterThanOrEqual(2);
  });
  it('the guest save rule keeps its own campaign, double life and clock', () => {
    expect(STORY_FIELDS).toEqual(expect.arrayContaining(['campaign', 'bruce', 'env']));
    const mem = new Map();
    const real = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const own = { step: 3, campaign: { night: 'n1', nightsDone: [] }, bruce: { credit: 2 }, env: { abs: 5 } };
    const st = guestStorage(real, own);
    st.setItem(PROGRESS_KEY, JSON.stringify({ step: 40, campaign: { night: 'n4', nightsDone: ['n1', 'n2', 'n3'] }, bruce: { credit: 99 }, env: { abs: 900 }, xp: 500 }));
    const saved = JSON.parse(mem.get(PROGRESS_KEY));
    expect(saved.campaign).toEqual(own.campaign);
    expect(saved.bruce).toEqual(own.bruce);
    expect(saved.env).toEqual(own.env);
    expect(saved.xp).toBe(500);
  });
});

describe('records (PROTO 2)', () => {
  it('hero records carry presses, the stick and the camera aim', () => {
    const w = createWriter();
    const hero = { slot: 1, x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0, yaw: 0.5, clip: 0, clipT: 0, speed: 1, health: 90, maxHealth: 100, flags: 0, state: 'ground', seat: 1, held: 0b101, tap: 0b1000000000, mx: -0.5, my: 1, camYaw: 2.5, camPitch: -0.3 };
    const d = decodeHeroState(encodeHeroState(w, { seq: 4, hostTime: 99, hero }));
    expect(d.hero.tap).toBe(0b1000000000);
    expect(d.hero.mx).toBeCloseTo(-0.5, 1);
    expect(d.hero.my).toBeCloseTo(1, 2);
    expect(d.hero.camYaw).toBeCloseTo(2.5, 3);
    expect(d.hero.camPitch).toBeCloseTo(-0.3, 3);
  });
  it('enemy records carry the role bits (weapon, charge, phantom, shield) without growing', () => {
    const e = { weapon: 'baton', charged: true, hallucination: false, shieldLost: true };
    const role = roleOf(e);
    const w = createWriter();
    let pkt = null;
    encodeSnapshot(w, { seq: 1, hostTime: 1, enemies: [{ num: 3, x: 1, y: 0, z: 1, yaw: 0, clip: 0, clipT: 0, speed: 1, state: 'surrender', health: 2, flags: 1, glyph: 'red', target: 1, role }] }, (b) => { pkt = b.slice(); });
    const s = decodeSnapshot(pkt);
    expect(s.enemies[0].glyph).toBe('red');
    expect(s.enemies[0].state).toBe('surrender');
    expect(s.enemies[0].role).toBe(role);
    const puppet = { weapon: 'baton', ch: { prop: { visible: true } }, def: { shock: true } };
    applyRole(puppet, RF.shieldLost); // dropped: no weapon bits
    expect(puppet.weapon).toBe(null);
    expect(puppet.ch.prop.visible).toBe(false);
    expect(puppet.def.shock).toBe(false);
    expect(puppet.shieldLost).toBe(true);
  });
  it('every boss has its own wire number; plain words and goon ids keep theirs', () => {
    const ids = ['penguin', 'riddler', 'scarecrow', 'freeze', 'harley', 'mrFreeze2', 'bane', 'poisonIvy', 'twoFace', 'killerCroc'];
    const nums = ids.map(enemyNum);
    expect(new Set(nums).size).toBe(ids.length);
    for (const n of nums) { expect(n).toBeGreaterThanOrEqual(BOSS_NUM); expect(n).toBeLessThan(65536); }
    expect(enemyNum('joker')).toBe(JOKER_NUM);
    expect(enemyNum('e12')).toBe(12);
    expect(isBossId('boss')).toBe(false);
    expect(isBossId('e3')).toBe(false);
  });
  it('the host sees a quick tap as a press edge and the stick as its move', () => {
    const input = createScriptedInput();
    const player = { input, netAim: { yaw: 0, pitch: 0 }, hero: { pos: { set() {}, x: 0, y: 0, z: 0 }, bat: { animator: null, face() {}, root: {} }, vel: { set() {} }, cape: { mesh: {} } } };
    const pup = createHeroPuppet(player, { hostNow: () => 0, edges: true, noteDelay: false });
    pup.push({ x: 0, y: 0, z: 0, yaw: 0, held: 0, tap: 1 << 10, mx: 0.5, my: 0, camYaw: 1.2, camPitch: 0.2 }, 0); // 'vehicle' tapped
    input.update();
    expect(input.pressed('vehicle')).toBe(true);
    expect(input.move.x).toBeCloseTo(0.5);
    expect(player.netAim.yaw).toBeCloseTo(1.2);
    input.endFrame();
    input.update();
    expect(input.pressed('vehicle')).toBe(false);
    pup.push({ x: 0, y: 0, z: 0, yaw: 0, held: 1 << 1, tap: 0 }, 1); // punch held: one edge
    input.update();
    expect(input.pressed('punch')).toBe(true);
    expect(input.down('punch')).toBe(true);
    const i2 = createScriptedInput(); i2.tap('throw'); i2.update();
    expect(pressedMask(i2)).toBe(1 << 11);
  });
});

describe('vehicles: host props and the guest seat', () => {
  const vec = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
  function fakeCar() {
    const calls = {};
    return { calls, group: { position: vec(), rotation: { y: 0 }, visible: true }, v: { speed: 22, lat: 0.4 }, modeT: 1, battle: true, heat: { boosting: true },
      aimTurret(y, p) { calls.aim = [y, p]; }, setCanopy(c) { calls.canopy = c; }, setFiring(on) { calls.firing = on; }, setBoost(on) { calls.boost = on; }, setMode(m) { calls.mode = m; }, update() {} };
  }
  it('the Batmobile, its moving parts and the Batwing go out as props and pose the guest copy', () => {
    const hostCar = fakeCar();
    hostCar.group.position.set(10, 2, -5);
    hostCar.aimTurret(0.3, 0.1); // seen by the wrapper only once wrapped: aim again after
    const events = [];
    const remote = { hero: {} };
    const host = createVehicleHost({ vehicles: { batmobile: hostCar, active: hostCar, driver: remote.hero, lastEject: { frames: 0 } }, batwing: { mesh: { position: vec(), rotation: { x: 0, y: 1, z: 0 }, visible: false }, state: { speed: 0 } }, remote, rep: { event: (m) => events.push(m) }, coop: null, hint() {} });
    hostCar.aimTurret(0.3, 0.1);
    host.frame();
    expect(events[0]).toMatchObject({ t: 'ev', name: 'ride', data: { on: true, drive: true } });
    const props = [];
    host.collect(props);
    const car = props.find((p) => p.id === PROP.car);
    expect(car.speed).toBe(22);
    expect(car.flags & PF.battle).toBeTruthy();
    expect(car.roll).toBeCloseTo(0.3);
    const parts = props.find((p) => p.id === PROP.carParts);
    expect(parts.x).toBe(1);
    // The guest's copy.
    const guestCar = fakeCar();
    guestCar.group.visible = false;
    const hero = { pos: vec(), vel: vec(), bat: { root: { visible: true } }, cape: { mesh: { visible: true } }, control: null };
    const evs = createEvents();
    const g = createVehicleGuest({ vehicles: { batmobile: guestCar }, batwing: null, hero, follow: null, events: evs, withPlayer, p0: {} });
    for (const p of props) g.prop(p, { x: p.x, y: p.y, z: p.z, yaw: p.yaw });
    expect(guestCar.group.visible).toBe(true);
    expect(guestCar.group.position.x).toBe(10);
    expect(guestCar.calls.aim[0]).toBeCloseTo(0.3);
    expect(guestCar.calls.mode).toBe(1);
    g.ride(true, 'car', { drive: true });
    g.frame(0.016);
    expect(hero.control.camera).toBe('drive');
    expect(hero.pos.x).toBe(10);
    expect(hero.bat.root.visible).toBe(false);
    g.ride(false, 'car', { drive: true, ej: { vx: 0, vy: 13, vz: 5 } });
    expect(hero.control).toBe(null);
    expect(hero.vel.y).toBe(13);
    host.dispose();
  });
});

describe('the world clock and weather', () => {
  function fakeClock(v = 23, pinned = null) {
    const listeners = new Set();
    const c = { abs: v, pins: pinned === null ? [] : [{ id: 'story', hour: pinned }],
      get value() { return this.abs; }, get hour() { return this.pins.length ? this.pins.at(-1).hour : this.abs % 24; }, get pinned() { return this.pins.length > 0; }, get pinId() { return this.pins.at(-1)?.id ?? null; },
      pin(h, { id }) { this.pins = this.pins.filter((p) => p.id !== id); this.pins.push({ id, hour: h }); }, unpin(id = null) { this.pins = id === null ? [] : this.pins.filter((p) => p.id !== id); },
      sync(x) { this.abs = x; }, skip(h) { this.abs += h; for (const f of listeners) f('skip', this); }, on(f) { listeners.add(f); return () => listeners.delete(f); } };
    return c;
  }
  function fakeWeather(seed = 7, state = 'storm') {
    const listeners = new Set();
    return { seed, base: state, pins: [], remoteStrikes: false, strikes: [],
      get state() { return this.pins.at(-1)?.s ?? this.base; }, pin(s, { id }) { this.pins = this.pins.filter((p) => p.id !== id); this.pins.push({ id, s }); }, unpin(id = null) { this.pins = id === null ? [] : this.pins.filter((p) => p.id !== id); },
      reseed(s, st) { this.seed = s; this.base = st; }, on(f) { listeners.add(f); return () => listeners.delete(f); }, fire(s) { for (const f of listeners) f(s); }, remoteStrike(s) { this.strikes.push(s); } };
  }
  it('a time skip, a pinned hour, a new weather and a lightning strike reach the guest', () => {
    const hostW = { clock: fakeClock(30), weather: fakeWeather(7, 'storm') };
    const guestW = { clock: fakeClock(2, 23), weather: fakeWeather(1, 'clear') };
    const sent = [];
    const h = createWorldHost({ world: hostW, rep: { event: (m) => sent.push(m) }, now: () => 0 });
    const g = createWorldGuest({ world: guestW, hostNow: () => 0 });
    const deliver = () => { for (const m of sent.splice(0)) if (m.name === 'env') g.apply(m.data); else if (m.name === 'strike') g.strike(m.data); };
    h.frame(1.1); deliver();
    expect(guestW.clock.value).toBe(30);
    expect(guestW.clock.pinned).toBe(false);
    expect(guestW.weather.state).toBe('storm');
    expect(guestW.weather.seed).toBe(7);
    expect(guestW.weather.remoteStrikes).toBe(true);
    hostW.clock.skip(9); deliver(); // the Bruce day's skip goes at once
    expect(guestW.clock.value).toBe(39);
    hostW.clock.pin(11, { id: 'bruce:scene' }); hostW.weather.pin('overcast', { id: 'story:day' });
    h.frame(0.016); deliver();
    expect(guestW.clock.hour).toBe(11);
    expect(guestW.weather.state).toBe('overcast');
    hostW.weather.fire({ kind: 'lightning', distance: 812.4, bearing: 1.5 }); deliver();
    expect(guestW.weather.strikes).toEqual([{ distance: 812.4, bearing: 1.5 }]);
  });
});

describe('paired moves: the host runs the guest hero\'s glue control', () => {
  it('times the strike on the host and tells the guest once', () => {
    const sent = [];
    let struck = 0, t = 0;
    const remote = { hero: { control: null, pos: { x: 1, y: 0, z: 2 }, bat: { yaw: 0.5, animator: { currentName: 'Hammer_Down' } } } };
    const g = createGlueHost({ remote, rep: { event: (m) => sent.push(m) }, now: () => 5 });
    remote.hero.control = { name: 'dualTakedown', signature: true, update(dt) { t += dt; if (t >= 0.83 && !struck) struck = 1; return t >= 1.4; } };
    for (let i = 0; i < 120 && remote.hero.control; i++) g.frame(1 / 60);
    expect(struck).toBe(1);
    expect(remote.hero.control).toBe(null);
    expect(sent.length).toBe(1);
    expect(sent[0].data).toMatchObject({ name: 'dualTakedown', clip: 'Hammer_Down' });
  });
});
