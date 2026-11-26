// The host's side of an online game (workstream D2): reads the live world into snapshots and
// events for the host replicator, and applies the guest's claims through the same functions the
// game uses for a local partner (docs/design/coop-seams.md: the remote player's own fighter lands
// its hits, so combos, KO credit, XP and audio work exactly as in split screen).
//
// The guest's hero is a remote player (coopRuntime.addRemotePlayer): a puppet posed from the
// guest's hero state. The host never simulates, damages or kills it on its own:
//   - enemies' melee blows on it are resolved by the guest (an 'atk' event at wind-up start; the
//     guest reports countered / dodged / hit; timeout = hit)
//   - everything else that hurts it (shots, charges, the boss's buzzers and gas) is forwarded as a
//     'hurt' the guest applies through its own fighter (blocking and dodging still count there)
//   - its health, death and position are whatever the guest says
import { withPlayer } from '../../core/events.js';
import { readHero, readEnemy } from './puppets.js';
import { isNetEnemyId, isBossId } from '../codec/snapshot.js';
import { MOVES } from '../../combat/rules.js';
// [net2] wave 3: vehicles, paired moves, the world clock, every boss.
import { createVehicleHost } from './vehicleNet.js';
import { createGlueHost } from './glueNet.js';
import { createWorldHost } from './worldNet.js';
import { createBossHost } from './bossNet.js';

// How far a guest's blow may land from where the host last saw the guest's hero (generous: the
// host's view of the guest is ~100-250 ms old; this only stops nonsense, not skill).
const RANGED = new Set(['batarang', 'gel', 'remote', 'claw', 'smoke', 'flashbang', 'thrownInto', 'throw']);
const reachOf = (move) => (RANGED.has(move) ? 70 : move === 'diveBomb' ? 14 : 9);
// Moves whose outcome the guest decides (they don't go through resolveHit on its side either).
const OUTCOME_MOVES = new Set(['chain', 'shatter', 'swarm']);
// [net2] + a grapple pull's outcomes (pull: yank, disarm when arg 1; strip: a shield; chip: resisted)
// and a gadget's jam (disruptor, EMP: arg = seconds, 0 ends it).
const FX = new Set(['freeze', 'dazzle', 'yank', 'tie', 'chainHold', 'chainRelease', 'lose', 'pull', 'strip', 'chip', 'jam']);
const PULL_REACH = 26 + 8;
const HOST_RUN = new Set(['boardCar']);
const FORWARD_EVENTS = ['impact', 'word', 'ko', 'takedown', 'counter', 'bark', 'rifleShot', 'iceShatter', 'blocked', 'zipTie', 'harleyTaunt', 'courierTaunt', 'rifleAim'];

export function createHostAdapter(G) {
  const { combat, events, players, flow, remote, rep, revive } = G;
  const p0 = players[0];
  const known = new Map(); // enemy id -> enemy (what the guest has been told exists)
  const heroRec = {};
  const enemyRecs = [];
  const atkSeen = new Map(); // enemy id -> windupN reported
  let remoteDead = false;
  let bossOn = false, bossT = 0;
  const offs = [];
  const rf = () => remote.fighter;
  // [net2]
  const hintGuest = (text) => rep.event({ t: 'ev', name: 'hint', data: { text: String(text).slice(0, 200) } });
  const veh = createVehicleHost({ vehicles: G.vehicles, batwing: G.batwing, remote, rep, coop: G.coop, hint: hintGuest });
  const glueH = createGlueHost({ remote, rep });
  const worldH = createWorldHost({ world: G.world, rep });
  const bossH = createBossHost({ bosses: G.bosses, rep });
  // The glue (src/coop/glue.js) reads the guest's presses through a filter-shaped input.
  const origCtxInput = remote.ctx?.input;
  if (remote.ctx && origCtxInput) remote.ctx.input = Object.assign(Object.create(origCtxInput), { src: origCtxInput, mask() {}, clear() {} });
  let lastReal = performance.now();
  // [net2] A Bruce Wayne day or scene runs here (its double life is this save's alone): the guest
  // is placed with the host (the ward / the partner at the table) and told what is going on.
  offs.push(events.on('bruceDayStart', () => hintGuest('Bruce Wayne\'s day: your partner plays it. You are along as the ward; the night picks up after it.')));
  offs.push(events.on('bruceSceneStart', () => hintGuest('A Bruce Wayne scene: your partner makes the choices. Press the ping key to lend a hand when it asks.')));

  // ---- the remote fighter never hurts or kills the guest's hero on its own ----
  const f = rf();
  f.onAttackLand = (e, kind) => {
    if (!e || remote.hero.dead || remote.away) return;
    // A blow the guest is resolving itself: nothing to do here.
    if (e.id && rep.attackContact(e.id)) return;
    rep.event({ t: 'hurt', kind: String(kind ?? 'grunt').slice(0, 24), e: e.id && isNetEnemyId(e.id) ? e.id : null });
  };
  f.killHero = () => {};
  // A teleport the host makes (bringAlong, regroup, a story placement) is the guest's to make.
  const origTeleport = remote.hero.teleport;
  remote.hero.teleport = (p, yaw = remote.hero.bat.yaw) => {
    origTeleport(p, yaw);
    remote.puppet?.snap(p, yaw);
    // A respawn or regroup also stands a downed hero up (flow's regroup cleared .dead first).
    const heal = remoteDead && !remote.hero.dead;
    rep.event({ t: 'place', pos: { x: p.x, y: p.y, z: p.z }, yaw, ...(heal ? { heal: true, hp: remote.hero.health } : {}) });
  };

  // World slow motion (a cinematic beat: with two players only the world scope slows everyone) is
  // broadcast with its host start time, so both machines play it together.
  const time = G.time;
  const origSlow = time?.slowMo;
  if (origSlow) time.slowMo = (sec, scale, scope) => {
    if (scope === undefined || scope === null || scope === 'world') rep.event({ t: 'slowMo', sec: num(sec, 0, 0, 10), scale: num(scale, 1, 0.01, 1), at: performance.now() });
    return origSlow(sec, scale, scope);
  };

  // ---- events the guest must know about ----
  const on = (n, fn) => offs.push(events.on(n, fn));
  // [net2] The campaign position is (night, step id): the index alone is ambiguous across nights.
  on('step', ({ index, step }) => rep.event({ t: 'step', index, id: step?.id ?? null, night: flow.story?.night?.id ?? 'n1' }));
  on('pickup', ({ item }) => rep.event({ t: 'pickup', item }));
  on('cutscene', ({ name, on: isOn }) => rep.event({ t: 'ev', name: 'cutscene', data: { name, on: !!isOn } }));
  // Heals after a won fight or the boss (flow heals partners; the guest's hero heals itself).
  for (const n of ['fightDone', 'bossDefeated']) on(n, () => setTimeout(() => rep.event({ t: 'ev', name: 'heal', data: { hp: remote.hero.health } }), 0));
  // Downs and revives decided here.
  on('playerDown', (d) => { const p = d.player; if (p === p0) rep.event({ t: 'down', p: 0 }); });
  on('playerRevived', (d) => {
    const p = d.player;
    if (p === remote) { remoteDead = false; rep.event({ t: 'revived', p: 1, hp: Math.round(remote.hero.maxHealth * revive.options.health) }); }
    else if (p === p0) rep.event({ t: 'revived', p: 0 });
  });
  // The guest's blows the host applies come back out of the remote fighter with player = remote:
  // the guest already played them. Everything else is forwarded for sound and effects.
  for (const name of FORWARD_EVENTS) {
    on(name, (d) => {
      if (!d || d.player === remote) return;
      const data = serialise(d);
      if (data) rep.event({ t: 'ev', name, data });
    });
  }
  // The boss's buzzer tiles and gas hurt the guest's puppet here directly (boss.js): the guest's
  // own hero takes the same damage on its machine.
  on('heroHurt', (d) => { if (d?.player === remote && (d.kind === 'buzzer' || d.kind === 'gas')) rep.event({ t: 'hurt', kind: d.kind, dmg: Math.max(0, Math.min(1000, d.damage ?? 0)) }); });
  // Vehicles (src/coop/passenger.js decides seats here): the guest rides the host's car.
  on('passengerIn', (d) => { if (d?.player === remote) rep.event({ t: 'ev', name: 'ride', data: { on: true, kind: d.kind ?? 'car' } }); });
  on('passengerOut', (d) => { if (d?.player === remote) rep.event({ t: 'ev', name: 'ride', data: { on: false, kind: d.kind ?? 'car' } }); });
  // The host boards the Batmobile for a story drive: the guest comes along as the passenger.
  on('vehicleEnter', (d) => {
    const st = flow.objectives.step?.type;
    if (d?.kind !== 'batmobile' || !['board', 'chase', 'battle'].includes(st) || remote.hero.dead || remote.away) return;
    setTimeout(() => G.seatRemote?.(), 0);
  });
  on('ping', (d) => { if (d?.player === p0) rep.event({ t: 'ping', id: String(d.id ?? 'here').slice(0, 24), ...(G.pingExtra?.(d) ?? {}) }); });
  on('quickChat', (d) => { if (d?.player === p0) rep.event({ t: 'chat', id: String(d.id ?? '').slice(0, 24), text: String(d.text ?? '').slice(0, 120), kind: 'quick' }); });

  function vec(v) { return v && Number.isFinite(v.x) ? { x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) } : null; }
  // Event payloads on the wire: enemies by id, vectors as plain numbers, nothing else that is an object.
  function serialise(d) {
    const out = {};
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (v === null || v === undefined) continue;
      if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
      else if (typeof v === 'string') out[k] = v.slice(0, 64);
      else if (v.isVector3 || (typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.z) && !v.id)) out[k] = vec({ x: v.x, y: v.y ?? 0, z: v.z });
      else if (typeof v === 'object' && typeof v.id === 'string' && v.ch && isNetEnemyId(v.id)) out[k] = { enemy: v.id };
    }
    if (d.player) out.by = d.player.netSlot ?? 0;
    return out;
  }

  const enemyById = (id) => { for (const e of combat.enemies) if (e.id === id) return e; return known.get(id) ?? null; };

  // ---- per frame (before the snapshot) ----
  const bodies = [];
  // [net2] The AI Nightwing as an ally record (an enemy-shaped wrapper: pose, clip, state).
  let nwWrap = null;
  function allyBody(out) {
    const ch = G.nightwing?.actor;
    if (!ch || !ch.root.parent || !ch.root.visible) return out;
    if (!nwWrap || nwWrap.ch !== ch) nwWrap = { id: 'nightwing', type: `ally:${G.nightwing.mode ?? 'ally'}`, ch, pos: ch.root.position, health: 1, alive: true, state: 'idle', ally: true };
    out.push(nwWrap);
    return out;
  }
  function frame() {
    const t = performance.now(), real = Math.min(0.1, (t - lastReal) / 1000);
    lastReal = t;
    // Spawns and despawns: whatever combat draws is what the guest must have.
    const seen = new Set();
    // [net2] A framework boss on stage, on the fight list or not (a puzzle phase, a hunt).
    bodies.length = 0;
    for (const e of [...combat.enemies, ...allyBody(bossH.bodies(bodies))]) {
      if (!e?.id || !isNetEnemyId(e.id)) continue;
      seen.add(e.id);
      if (!known.has(e.id)) {
        known.set(e.id, e);
        rep.event({ t: 'spawn', id: e.id, type: e.type, pos: vec(e.pos), yaw: e.ch.yaw, hp: e.health, alive: e.alive });
      }
    }
    // The Joker on his balcony is not in the fight list yet, but he is on stage.
    const jk = G.boss?.joker;
    if (jk?.ch?.root.visible) { seen.add('joker'); if (!known.has('joker')) { known.set('joker', jk); rep.event({ t: 'spawn', id: 'joker', type: 'joker', pos: vec(jk.pos), yaw: jk.ch.yaw, hp: jk.health, alive: jk.alive }); } }
    for (const [id, e] of known) if (!seen.has(id) && (!e.ch.root.parent || ((id === 'joker' || isBossId(id)) && !e.ch.root.visible))) { known.delete(id); atkSeen.delete(id); rep.event({ t: 'despawn', id }); }
    // [net2] the framework boss's bar and lines, vehicles, the guest's paired moves, clock and weather
    bossH.frame(real);
    veh.frame();
    glueH.frame(time ? time.dtFor?.(remote.hero, real) ?? real : real);
    // [net2] Short host-side controls the vehicle code gives the guest's hero (the leap into the
    // driver's seat): its hero never runs hero.update here, so they are ticked here to finish.
    const rc = remote.hero.control;
    if (rc && HOST_RUN.has(rc.name)) { let done = false; try { done = rc.update(real, remote.ctx); } catch (err) { console.error(err); done = true; } if (done && remote.hero.control === rc) remote.hero.control = null; }
    worldH.frame(real);
    // The boss bar (boss.js draws it from its own fight state, which only runs here).
    const b = G.boss;
    if (b) {
      const on = !!b.active;
      bossT -= 1 / 60;
      if (on !== bossOn || (on && bossT <= 0)) { bossOn = on; bossT = 0.5; rep.event({ t: 'boss', data: { on, phase: b.phase, bar: b.progress?.() ?? null } }); }
    }
    // Attacks aimed at the guest's hero: a new wind-up starts the guest's own timeline.
    const mine = rf();
    for (const e of combat.enemies) {
      if (!e.alive || !known.has(e.id) || e.ally) continue;
      const aimed = e.aggro === mine;
      if (aimed && e.state === 'windup' && atkSeen.get(e.id) !== e.windupN && !e.def?.ranged && e.type !== 'harley') {
        atkSeen.set(e.id, e.windupN);
        const left = Math.max(0, (e.windupDur ?? 0.6) - (e.t ?? 0));
        e.netAtk = rep.attackStart(e.id, String(e.attackKind ?? e.type).slice(0, 24), left * 1000 + 170);
      } else if (e.netAtk && e.state !== 'windup' && e.state !== 'attack') {
        // The wind-up ended without a blow on the host (hit, stunned, countered by the host): the
        // guest drops it too.
        if (!e.countered) rep.attackCancel(e.id);
        e.netAtk = null;
      }
    }
    // The guest's hero going down here: the revive rule (which runs here) needs to know.
    const dead = !!remote.hero.dead;
    if (dead && !remoteDead) { remoteDead = true; events.emit('playerDown', withPlayer({}, remote)); }
    if (!dead && remoteDead && !revive.isDown(remote.id)) remoteDead = false;
    // The host's own exclusive actions take the lock on their target.
    const c = p0.hero.control;
    if (c?.target?.id && (c.name === 'silent' || c.name === 'perchDrop' || c.name === 'chain' || c.name === 'takedown')) rep.hostLock(c.target.id, 0);
  }

  const adapter = {
    frame,
    collect(out) {
      out.heroes.push(readHero(p0.hero, 0, heroRec));
      let i = 0;
      for (const e of known.values()) {
        const r = enemyRecs[i] ?? (enemyRecs[i] = {});
        out.enemies.push(readEnemy(e, r));
        i++;
      }
      veh.collect(out.props); // [net2] the Batmobile (and its moving parts) and the Batwing
    },
    world: () => worldH.welcome(), // [net2]
    bodies: () => bossH.bodies([]), // [net2]
    guestHero(rec, t) { remote.puppet?.push(rec, t); },
    claimHit(slot, m) {
      const e = enemyById(m.e);
      if (!e || !known.has(m.e)) return null;
      const h = remote.hero;
      const move = String(m.move);
      const base = move.startsWith('takedown:') ? 'takedown' : move;
      if (Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) > reachOf(base) || Math.abs(e.pos.y - h.pos.y) > 12) return null;
      const o = m.o ?? {};
      const fr = rf();
      if (base === 'takedown' || OUTCOME_MOVES.has(base)) {
        if (!e.alive && e.state !== 'tied') return { out: 'ko', hp: 0 };
        const outcome = o.outcome === 'knockdown' && e.type !== 'joker' ? 'knockdown' : 'ko';
        if (outcome === 'ko') e.health = 0;
        e.applyHit({ outcome, damage: 0, stun: 0 }, h.pos, { power: num(o.power, 1, 0, 4), launch: num(o.launch, 0, 0, 12) });
        combat.director.release(e.id);
        e.lastHitBy = fr;
        if (e.state === 'chained') e.chainRelease?.();
        if (outcome === 'ko') events.emit(base === 'takedown' ? 'takedown' : 'ko', withPlayer(base === 'takedown' ? { kind: move.slice(9) || 'takedown', pos: e.pos.clone(), target: e } : { target: e, pos: e.pos.clone() }, remote));
        if (base === 'takedown' && outcome === 'ko') events.emit('ko', withPlayer({ target: e, pos: e.pos.clone() }, remote));
        rep.hostUnlock(e.id, 1);
        return { out: outcome, hp: e.health };
      }
      if (!MOVES[base]) return null;
      if (!e.alive) return { out: 'dead', hp: e.health };
      // [net2] A goon the guest holds (a throw, a grab) is let go as its blow lands.
      if (e.state === 'chained' && rep.lockedBy?.(e.id) === slot) e.chainRelease?.();
      let r;
      try { r = fr.landHit(base, e, { power: num(o.power, 1, 0, 4), launch: num(o.launch, 0, 0, 12), crit: !!o.crit, react: typeof o.react === 'string' ? o.react.slice(0, 12) : null, aerial: !!o.aerial }); } catch { return null; }
      return { out: r?.outcome ?? 'hit', hp: e.health };
    },
    defence(slot, a, m) {
      const e = enemyById(a.e);
      if (!e) return;
      if (m.result === 'countered') {
        if (!e.alive) return;
        e.glyph = null;
        e.countered = true;
        e.counterT = 0;
        e.hitDone = true;
        combat.director.release(e.id);
      } else if (m.result === 'dodged') events.emit('evaded', withPlayer({ e }, remote));
      else if (m.result === 'hit' || m.result === 'blocked') events.emit('heroHurt', withPlayer({ kind: a.kind, blocking: m.result === 'blocked', damage: num(m.dmg, 0, 0, 1000), from: e, pos: remote.hero.pos.clone() }, remote));
    },
    canLock(slot, ids) { return ids.every((id) => { const e = enemyById(id); return e && !e.ally && (e.alive || e.state === 'tied'); }); },
    lockGranted(slot, ids, action) {
      // A silent takedown or a grab: the goon stops where the guest has him.
      if (action === 'silent' || action === 'grab' || action === 'perchDrop' || action === 'throw') for (const id of ids) { const e = enemyById(id); if (e?.alive && e.state !== 'chained') { e.chainHold?.(); combat.director.release(e.id); } }
    },
    unlocked(slot, ids) { for (const id of ids) { const e = enemyById(id); if (e?.alive && e.state === 'chained') e.chainRelease?.(); } },
    claimFx(slot, m) {
      if (!FX.has(m.fx)) return;
      const e = enemyById(m.e);
      if (!e || !known.has(m.e)) return;
      if (Math.hypot(e.pos.x - remote.hero.pos.x, e.pos.z - remote.hero.pos.z) > 70) return;
      try {
        if (m.fx === 'freeze') e.freeze?.(num(m.arg, 3, 0.1, 12));
        else if (m.fx === 'dazzle') e.dazzle?.(num(m.arg, 2, 0.1, 10));
        else if (m.fx === 'yank') e.yank?.(m.v ?? remote.hero.pos);
        else if (m.fx === 'lose') e.lose?.(num(m.arg, 4, 0.1, 12), remote.hero.pos);
        else if (m.fx === 'chainHold') { if (e.alive) { e.chainHold?.(); combat.director.release(e.id); } }
        else if (m.fx === 'chainRelease') e.chainRelease?.();
        else if (m.fx === 'tie') { if (e.alive) e.tie?.([e], num(m.arg, 6, 1, 12)); }
        // [net2] grapple pulls (the guest's pull control applied this on its copy; the host's goon
        // is the real one: src/actors/traverse/grapplePull.js) and gadget jams
        else if (m.fx === 'pull' || m.fx === 'strip' || m.fx === 'chip') {
          if (!e.alive || Math.hypot(e.pos.x - remote.hero.pos.x, e.pos.z - remote.hero.pos.z) > PULL_REACH) return;
          if (m.fx === 'pull') { if (m.arg === 1 || e.weapon) { e.dropWeapon?.(); e.disarmed = true; } e.yank?.(remote.hero.pos); combat.director.release(e.id); }
          else if (m.fx === 'strip') { e.shieldLost = true; e.applyHit({ outcome: 'stun', stun: 2.5, damage: 0 }, remote.hero.pos); }
          else e.applyHit({ outcome: 'chip', damage: 0 }, remote.hero.pos);
          e.lastHitBy = rf();
          events.emit('grapplePull', withPlayer({ outcome: m.fx === 'strip' ? 'stripShield' : m.fx === 'chip' ? 'resist' : m.arg === 1 ? 'disarm' : 'yank', target: e }, remote));
        } else if (m.fx === 'jam') rf().gadgetApi?.jam?.(e, num(m.arg, 0, 0, 20));
      } catch { /* a bad effect on a goon in an odd state: ignored */ }
    },
    request(slot, m) { G.onRequest?.(m); },
    chat(slot, m) {
      if (m.t === 'ping') G.showPing?.(remote, m);
      else G.showChat?.(remote, m);
    },
    guestEvent() {},
    attackTimedOut() {},
    dispose() { for (const off of offs.splice(0)) off(); remote.hero.teleport = origTeleport; if (origSlow) time.slowMo = origSlow; veh.dispose(); worldH.dispose(); if (remote.ctx && origCtxInput) remote.ctx.input = origCtxInput; },
    get vehicles() { return veh; },
    get known() { return known; },
  };
  return adapter;
}

function num(v, d, lo, hi) { return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
