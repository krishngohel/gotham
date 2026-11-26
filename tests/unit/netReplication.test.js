// Replication under latency, jitter and loss (workstream D2; research §6 "Invariants to assert").
// A small deterministic stand-in world on each side drives the real session and replicators over
// the conditioned loopback transport: the host's goons fight, take hits from both heroes, attack
// the guest, die in waves that advance the story and drop pickups; the guest claims hits and
// counters. After the run quiesces, both sides must agree exactly.
import { describe, it, expect } from 'vitest';
import { createManualClock, createLoopbackNetwork } from '../../src/net/transport/loopback.js';
import { createHostSession, createGuestSession } from '../../src/net/session.js';
import { createHostReplicator } from '../../src/net/replication/host.js';
import { createGuestReplicator } from '../../src/net/replication/guest.js';
import { EF, enemyNum } from '../../src/net/codec/snapshot.js';
import { createRng } from '../../src/core/rng.js';

const HELLO = { build: 'b', content: 'c', kit: 'm' };
const WINDUP_MS = 700;

function world({ latencyMs, jitterMs = 0, loss = 0, seed = 1, duplicate = 0, reorder = 0 }) {
  const clock = createManualClock(10000);
  // The guest's performance.now() runs on another epoch: clock sync must find the offset.
  const guestEpoch = -7345.25;
  const net = createLoopbackNetwork({ clock, conditions: { latencyMs, jitterMs, loss, duplicate, reorder }, seed });
  const hostS = createHostSession({ signaller: net.signaller(), code: 'QWERTY', hello: HELLO, clock, getWelcome: () => hostWorld.welcome() });
  const guestS = createGuestSession({ signaller: net.signaller(), code: 'QWERTY', hello: HELLO, clock, now: () => clock.now() + guestEpoch });
  const rng = createRng(seed * 31 + 7);

  // ---------------- host world ----------------
  const H = { enemies: new Map(), nextId: 1, step: 0, pickups: new Set(), credit: new Map(), spawnedByGuest: 0, damageFromClaims: 0, acceptedClaims: 0, attacks: 0 };
  const hostWorld = {
    welcome() { return { step: H.step, pickups: [...H.pickups], enemies: [...H.enemies.values()].map((e) => ({ id: e.id, type: 'grunt', pos: { x: e.x, y: 0, z: e.z }, yaw: e.yaw })) }; },
  };
  let hostRep = null;
  function spawn() {
    const id = `e${H.nextId++}`;
    const e = { id, num: enemyNum(id), x: rng.range(-10, 10), z: rng.range(-10, 10), yaw: 0, health: 3, alive: true, state: 'engage', windupAt: 0, atkId: 0, counteredAt: 0 };
    H.enemies.set(id, e);
    hostRep.event({ t: 'spawn', id, type: 'grunt', pos: { x: e.x, y: 0, z: e.z }, yaw: 0 });
  }
  function despawn(e) { H.enemies.delete(e.id); hostRep.event({ t: 'despawn', id: e.id }); }
  function hit(e, slot, dmg) {
    if (!e.alive) return null;
    e.health = Math.max(0, e.health - dmg);
    if (e.health === 0) { e.alive = false; e.state = 'ko'; H.credit.set(e.id, slot); hostRep.event({ t: 'ev', name: 'ko', data: { e: e.id, by: slot } }); hostRep.attackCancel(e.id); }
    else e.state = 'hit';
    return { out: e.alive ? 'hit' : 'ko', hp: e.health };
  }
  const hostAdapter = {
    collect(out) {
      out.heroes.push({ slot: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, clip: 0, clipT: 0, speed: 1, health: 100, maxHealth: 100, flags: 0, state: 'ground', seat: 0, held: 0 });
      for (const e of H.enemies.values()) out.enemies.push({ num: e.num, x: e.x, y: 0, z: e.z, yaw: e.yaw, clip: 0, clipT: 0, speed: 1, state: e.state, health: e.health, flags: (e.alive ? EF.alive : 0) | (e.counteredAt ? EF.countered : 0), glyph: e.state === 'windup' ? 'blue' : null, target: e.state === 'windup' ? 1 : null });
    },
    guestHero() {},
    claimHit(slot, m) {
      const e = H.enemies.get(m.e);
      if (!e || !e.alive) return null;
      H.acceptedClaims++;
      H.damageFromClaims += 1;
      return hit(e, slot, 1);
    },
    defence(slot, a, m) {
      const e = H.enemies.get(a.e);
      if (!e) return;
      if (m.result === 'countered') { e.counteredAt = clock.now(); e.state = 'hit'; }
    },
    request(slot, m) { if (m.what === 'spawn') H.spawnedByGuest++; },
  };

  // ---------------- guest world ----------------
  const G = { puppets: new Map(), step: 0, pickups: new Set(), credit: new Map(), localSpawns: 0, windows: [], seenWindupAt: new Map(), counterTry: new Set() };
  const guestAdapter = {
    spawn(m) { if (!G.puppets.has(m.id)) G.puppets.set(m.id, { id: m.id, num: enemyNum(m.id), x: m.pos.x, z: m.pos.z, health: 3, alive: true, state: 'idle' }); },
    despawn(id) { G.puppets.delete(id); },
    enemyByNum(num) { return G.puppets.get(`e${num}`) ?? null; },
    applyEnemy(e, pos, rec, rt) {
      e.x = pos.x; e.z = pos.z;
      e.health = rec.health; e.alive = !!(rec.flags & EF.alive);
      e.state = rec.state;
    },
    attackBegin(e, m, rt) { G.seenWindupAt.set(m.id, rt); },
    hostHero() {},
    localHero(out) { out.x = 0; out.y = 0; out.z = 0; out.health = 100; out.maxHealth = 100; return true; },
    resolveAttack(e, m) {
      // The window this guest saw: from its puppet's wind-up to contact, on its own timeline.
      const from = G.seenWindupAt.get(m.id);
      if (from !== undefined) G.windows.push(m.contact - from);
      return 'hit';
    },
    isCounteredLocally(e, m) { return G.counterTry.has(m.id); },
    hurt() {},
    onEvent(m) {
      if (m.t === 'step') G.step = m.index;
      else if (m.t === 'pickup') G.pickups.add(m.item);
      else if (m.t === 'ev' && m.name === 'ko') G.credit.set(m.data.e, m.data.by);
    },
  };

  hostRep = createHostReplicator({ session: hostS, adapter: hostAdapter, now: clock.now });
  const guestRep = createGuestReplicator({ session: guestS, adapter: guestAdapter, now: () => clock.now() + guestEpoch, hostNow: () => guestS.hostNow() });
  hostS.on('state', (d) => hostRep.onState(d));
  hostS.on('message', (m) => hostRep.onMessage(m));
  hostS.on('guest', () => hostRep.setReady(true));
  guestS.on('state', (d) => guestRep.onState(d));
  guestS.on('message', (m) => guestRep.onMessage(m));
  guestS.on('welcome', ({ state }) => {
    guestRep.reset();
    G.puppets.clear();
    G.step = state.step;
    G.pickups = new Set(state.pickups);
    for (const e of state.enemies) guestAdapter.spawn({ id: e.id, pos: e.pos });
  });

  async function flush() { for (let i = 0; i < 6; i++) await Promise.resolve(); }
  async function run(ms, act = true) {
    for (let t = 0; t < ms; t += 16) {
      clock.advance(16);
      await flush();
      if (act && hostRep.ready) hostSim();
      if (act && guestS.welcomed) guestSim();
      hostRep.tick();
      if (guestS.welcomed) guestRep.tick();
    }
  }
  function hostSim() {
    const now = clock.now();
    if (![...H.enemies.values()].some((e) => e.alive)) {
      for (const e of [...H.enemies.values()]) despawn(e);
      if (H.step > 0 || H.nextId > 1) { H.step++; hostRep.event({ t: 'step', index: H.step }); const item = `item${H.step}`; H.pickups.add(item); hostRep.event({ t: 'pickup', item }); }
      for (let i = 0; i < 5; i++) spawn();
    }
    for (const e of H.enemies.values()) {
      if (!e.alive) continue;
      e.x += rng.range(-0.05, 0.05); e.z += rng.range(-0.05, 0.05);
      if (e.counteredAt && now - e.counteredAt > 400) { e.counteredAt = 0; e.state = 'engage'; }
      if (e.state === 'windup' && now >= e.contactAt) { hostRep.attackContact(e.id); e.state = 'engage'; }
      else if (e.state === 'hit' && rng.chance(0.05)) e.state = 'engage';
      else if (e.state === 'engage' && rng.chance(0.004)) {
        e.state = 'windup'; e.contactAt = now + WINDUP_MS; H.attacks++;
        e.atkId = hostRep.attackStart(e.id, 'grunt', WINDUP_MS);
      }
      // The host's own hero hits now and then.
      if (rng.chance(0.002)) hit(e, 0, 1);
    }
  }
  function guestSim() {
    for (const e of G.puppets.values()) {
      if (e.alive && rng.chance(0.01)) guestRep.claimHit(e.id, 'punch', {});
    }
  }
  return { clock, net, hostS, guestS, hostRep, guestRep, H, G, run, start: () => { hostS.start(); guestS.start(); } };
}

function agree(w) {
  const { H, G } = w;
  const hostIds = [...H.enemies.keys()].sort(), guestIds = [...G.puppets.keys()].sort();
  expect(guestIds, 'same enemy set').toEqual(hostIds);
  for (const id of hostIds) {
    const a = H.enemies.get(id), b = G.puppets.get(id);
    expect(b.health, `health of ${id}`).toBeCloseTo(a.health, 5);
    expect(b.alive, `alive of ${id}`).toBe(a.alive);
    expect(Math.hypot(a.x - b.x, a.z - b.z), `position of ${id}`).toBeLessThan(0.25);
  }
  expect(G.step, 'story step').toBe(H.step);
  expect([...G.pickups].sort(), 'pickups').toEqual([...H.pickups].sort());
  for (const [id, by] of H.credit) if (G.credit.has(id)) expect(G.credit.get(id), `KO credit for ${id}`).toBe(by);
  expect(H.spawnedByGuest, 'no guest spawns').toBe(0);
  expect(H.damageFromClaims, 'damage from claims = accepted claims').toBe(H.acceptedClaims);
}

const CASES = [
  { name: '0 ms', latencyMs: 0 },
  { name: '80 ms ±20, 5% loss', latencyMs: 80, jitterMs: 20, loss: 0.05 },
  { name: '200 ms ±60, 15% loss, duplicates and reorders', latencyMs: 200, jitterMs: 60, loss: 0.15, duplicate: 0.05, reorder: 0.1 },
];

describe('host and guest never diverge', () => {
  for (const c of CASES) {
    it(`agree on enemies, health, alive set, story, pickups and KO credit at ${c.name}`, async () => {
      const w = world({ ...c, seed: 3 });
      w.start();
      await w.run(25000);
      // Quiesce: the world stops changing; in-flight messages land; buffers catch up.
      await w.run(2500, false);
      expect(w.H.step).toBeGreaterThan(2);
      expect(w.H.acceptedClaims).toBeGreaterThan(5);
      agree(w);
    }, 60000);
  }
});

describe('defender-side resolution keeps the counter window whole', () => {
  for (const c of CASES) {
    it(`the guest sees the full ${WINDUP_MS} ms wind-up before contact at ${c.name}`, async () => {
      const w = world({ ...c, seed: 5 });
      w.start();
      await w.run(30000);
      expect(w.G.windows.length).toBeGreaterThan(3);
      // The wind-up starts from the reliable attack event on the guest's own render clock: the
      // window is the designed one to within a frame, never a round trip short.
      for (const win of w.G.windows) expect(win).toBeGreaterThan(WINDUP_MS - 17);
      expect(Math.min(...w.G.windows)).toBeLessThanOrEqual(WINDUP_MS + 1);
    }, 60000);
  }
  it('a counter reported in time freezes the goon on the host; a late report is ignored', async () => {
    const w = world({ latencyMs: 80, seed: 9 });
    w.start();
    await w.run(1500, false);
    await w.run(200);
    const e = [...w.H.enemies.values()][0];
    e.state = 'windup'; e.contactAt = w.clock.now() + WINDUP_MS;
    const id = w.hostRep.attackStart(e.id, 'grunt', WINDUP_MS);
    w.G.counterTry.add(id);
    await w.run(400, false);
    expect(e.counteredAt).toBeGreaterThan(0);
    // A report for an attack that already timed out does nothing.
    const e2 = [...w.H.enemies.values()][1];
    const id2 = w.hostRep.attackStart(e2.id, 'grunt', 10);
    w.hostRep.attackContact(e2.id);
    await w.run(1500, false);
    w.guestS.send({ t: 'defence', id: id2, e: e2.id, result: 'countered' });
    await w.run(300, false);
    expect(e2.counteredAt).toBe(0);
  }, 30000);
});

describe('reconnect and late join', () => {
  it('a guest that drops mid-fight reconnects and converges again', async () => {
    const w = world({ latencyMs: 60, jitterMs: 10, loss: 0.02, seed: 11 });
    w.start();
    await w.run(6000);
    w.net.links[0][1].close('network');
    await w.run(4000);
    await w.run(8000);
    await w.run(2500, false);
    agree(w);
  }, 60000);
  it('a guest that joins mid-mission gets the whole world in the welcome', async () => {
    const w = world({ latencyMs: 60, seed: 13 });
    w.hostS.start();
    // The host plays alone for a while (the replicator only emits once someone is there, so
    // drive the host world through a fake "ready").
    w.hostRep.setReady(true);
    await w.run(8000);
    w.hostRep.setReady(false);
    w.guestS.start();
    await w.run(8000);
    await w.run(2500, false);
    agree(w);
  }, 60000);
});

describe('security: the guest cannot change the world', () => {
  it('spawn, step and pickup messages from the guest are dropped; hit claims are rate-limited', async () => {
    const w = world({ latencyMs: 20, seed: 17 });
    w.start();
    await w.run(1500, false);
    await w.run(100);
    const step = w.H.step, n = w.H.enemies.size;
    w.guestS.send({ t: 'spawn', id: 'e999', type: 'grunt', pos: { x: 0, y: 0, z: 0 } });
    w.guestS.send({ t: 'step', index: 50 });
    w.guestS.send({ t: 'pickup', item: 'antidote' });
    const target = [...w.H.enemies.keys()][0];
    for (let i = 0; i < 200; i++) w.guestS.send({ t: 'hit', e: target, move: 'punch', seq: 100000 + i, at: 1 });
    await w.run(300, false);
    expect(w.H.step).toBe(step);
    expect(w.H.enemies.size).toBe(n);
    expect(w.H.pickups.has('antidote')).toBe(false);
    expect(w.hostRep.stats.rejected).toBeGreaterThan(150);
  }, 30000);
});
