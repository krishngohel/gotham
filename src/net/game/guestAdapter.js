// The guest's side of an online game (workstream D2). The guest runs the same game in replica
// mode (src/net/mode.js gates the story, encounters, side content and the boss): its own hero is
// player 0 here, fully local (movement, animation, traversal, its own strikes, camera, HUD,
// gadgets, detective vision, grapple); the host's hero is a remote player posed from snapshots;
// every enemy is a puppet the host's snapshots pose (src/net/game/puppets.js).
//
// What the guest sends: its hero state (30 Hz), hit claims for its own blows (played at once
// here, settled by the host), effect claims (a freeze, a chain's hold), lock requests for
// exclusive takedowns, defence reports for blows aimed at it, small requests and chat.
import * as THREE from 'three';
import { withPlayer } from '../../core/events.js';
import { readHero, puppetizeEnemy, applyEnemyRecord, pressedMask } from './puppets.js';
import { enemyNum, JOKER_NUM, isBossId } from '../codec/snapshot.js';
// [net2] wave 3: vehicles, paired moves, the world clock, every boss, the content seams.
import { createVehicleGuest } from './vehicleNet.js';
import { createGlueGuest } from './glueNet.js';
import { createWorldGuest } from './worldNet.js';
import { createBossGuest } from './bossNet.js';
import { pocketAt } from '../../bruce/pockets.js';

// [net2] + the shoulder throw (a paired take: the goon is held on our clock while the host holds his).
const EXCLUSIVE = new Set(['silent', 'perchDrop', 'takedown', 'grab', 'throw']);
// How close the blow must be on the guest's own screen to land (the enemy's limb reach + slack,
// as enemy.js resolves it).
const HIT_REACH = 1.6, HIT_DY = 2.5;

export function createGuestAdapter(G) {
  const { combat, events, players, flow, hostPlayer, rep, time, revive, hud } = G;
  const p0 = players[0];
  const now = () => performance.now();
  const puppets = new Map(); // id -> enemy
  const byNum = new Map();
  const offs = [];
  let lockFor = null; // { control, req, id }
  let list = [];
  // [net2]
  const veh = createVehicleGuest({ vehicles: G.vehicles, batwing: G.batwing, hero: p0.hero, follow: G.follow, events, withPlayer, p0 });
  const glue = createGlueGuest({ hero: p0.hero, follow: G.follow, events, hostNow: () => G.hostNow?.() ?? now() });
  const world = createWorldGuest({ world: G.world, hostNow: () => G.hostNow?.() ?? now() });
  const bossG = createBossGuest({ bosses: G.bosses, hud });
  let tapAcc = 0;
  const aim = { yaw: 0, pitch: 0 };
  const real = { dt: 1 / 60 };
  const fighterOf = (slot) => (slot === 1 ? p0.fighter : slot === 0 ? hostPlayer.fighter : null);
  // The host's hero puppet: never hurt or killed by this machine's rules.
  hostPlayer.fighter.onAttackLand = () => {};
  hostPlayer.fighter.killHero = () => {};

  // [net2] Allies the host draws (the AI Nightwing): posed like enemies, never fought.
  const allies = new Map();
  function publish() {
    list = [...puppets.values()].filter((e) => !e.ally);
    combat.setEnemies(list);
  }

  // ---- claims from the guest's own play ----
  const on = (n, fn) => offs.push(events.on(n, fn));
  on('impact', (d) => {
    if (d?.player !== p0 || !d.target?.netPuppet || d.remoteEcho) return;
    rep.claimHit(d.target.id, String(d.move ?? 'punch').slice(0, 24), { power: d.power, crit: !!d.crit, outcome: d.outcome, aerial: !!d.aerial });
  });
  on('takedown', (d) => {
    if (d?.player !== p0 || !d.target?.netPuppet || d.remoteEcho) return;
    rep.claimHit(d.target.id, `takedown:${String(d.kind ?? 'takedown').slice(0, 14)}`, { outcome: d.target.alive ? 'knockdown' : 'ko' });
  });
  // [net2] A grapple pull on a host goon (yank / disarm / strip a shield / resist): the host applies
  // the same outcome (src/actors/traverse/grapplePull.js) through a claim it range-checks.
  on('grapplePull', (d) => {
    if (d?.player !== p0 || !d.target?.netPuppet || d.remoteEcho) return;
    const fx = { yank: 'pull', disarm: 'pull', stripShield: 'strip', resist: 'chip' }[d.outcome];
    if (fx) rep.fx(d.target.id, fx, d.outcome === 'disarm' ? 1 : 0);
  });
  // [net2] A gadget's jam (disruptor, EMP) on a host goon: claimed like the other status effects.
  const gapi = p0.fighter?.gadgetApi;
  const origJam = gapi?.jam;
  if (gapi && typeof origJam === 'function') gapi.jam = (e, sec, ...rest) => { const r = origJam.call(gapi, e, sec, ...rest); if (e?.netPuppet) rep.fx(e.id, 'jam', typeof sec === 'number' ? sec : 0); return r; };
  // Our pings and quick chat go to the host.
  on('ping', (d) => { if (d?.player === p0 && !d.remote) rep.send({ t: 'ping', id: String(d.id ?? 'here').slice(0, 24), ...(G.pingExtra?.(d) ?? {}) }); });
  on('quickChat', (d) => { if (d?.player === p0 && !d.remote) rep.send({ t: 'chat', id: String(d.id ?? '').slice(0, 24), text: String(d.text ?? '').slice(0, 120), kind: 'quick' }); });

  function makePuppet(m) {
    // The Joker is this machine's own boss figure, shown and posed by the host.
    // [net2] Every other boss: the director builds its body (no phase logic) once its model loads.
    let e;
    if (typeof m.type === 'string' && m.type.startsWith('ally')) return makeAlly(m);
    if (m.id === 'joker') e = showJoker(m);
    else if (isBossId(m.id)) {
      e = bossG.body(m.id, () => { if (!puppets.has(m.id)) adapter.spawn(m); });
      if (e) { e.pos.set(m.pos.x, m.pos.y, m.pos.z); e.ch.face?.(m.yaw ?? 0); bossG.show(e, true); }
    } else e = G.spawnNet(m.type, m.pos, m.id, m.yaw ?? 0);
    if (!e) return null;
    puppetizeEnemy(e, {
      now,
      onFx: (en, fx, args) => {
        if (fx === 'yank') { const to = args[0]; rep.fx(en.id, fx, undefined, to ? { x: to.x, y: to.y, z: to.z } : undefined); }
        else rep.fx(en.id, fx, typeof args[0] === 'number' ? args[0] : undefined);
      },
      onCounter: (en) => rep.counterNow(en.id),
    });
    if (typeof m.hp === 'number') e.health = m.hp;
    if (m.alive === false) { e.alive = false; e.down = true; e.state = 'ko'; }
    return e;
  }

  // [net2] The host's AI Nightwing on this machine: our own figure of him (same look), posed from the
  // host's records; his blows land on the host (they reach us as KOs and impacts).
  function makeAlly(m) {
    const nw = G.nightwing;
    if (!nw?.spawn) return null;
    const mode = m.type.split(':')[1] || 'ally';
    nw.spawn({ x: m.pos.x, y: m.pos.y, z: m.pos.z }, mode === 'courier' || mode === 'pose' ? mode : 'ally');
    const ch = nw.actor;
    if (!ch) return null;
    const e = { id: m.id, type: m.type, ch, pos: ch.root.position, health: 1, alive: true, state: 'idle', ally: true, applyHit() { return false; } };
    puppetizeEnemy(e, { now });
    allies.set(m.id, e);
    return e;
  }
  function showJoker(m) {
    const b = G.boss;
    if (!b?.joker) return null;
    b.pose([m.pos.x, m.pos.y, m.pos.z], m.yaw ?? 0, 'Idle_Loop');
    b.joker.netJoker = true;
    return b.joker;
  }

  // [net2] Riding, driving and gunning in the host's vehicles: src/net/game/vehicleNet.js.
  const removeBody = (id, e) => { if (e?.ally) { allies.delete(id); G.nightwing?.despawn?.(); } else if (id === 'joker') G.boss?.hide(); else if (isBossId(id)) bossG.show(e, false); else G.despawn(e); };

  // ---- incoming attacks: resolved here, on this machine's timeline ----
  function resolveAttack(e, m) {
    e.netAttack = null;
    const h = p0.hero;
    if (h.dead || !e.alive) return 'miss';
    if (e.netCounteredAt > now() - 1500) return 'countered';
    if (h.invulnerable > 0) { events.emit('evaded', withPlayer({ e }, p0)); return 'dodged'; }
    const d = Math.hypot(h.pos.x - e.pos.x, h.pos.z - e.pos.z);
    if (d > HIT_REACH * (e.scale ?? 1) + 0.6 || Math.abs(h.pos.y - e.pos.y) > HIT_DY) return 'miss';
    const before = h.health;
    const blocking = !!h.blocking;
    p0.fighter.onAttackLand(e, m.kind);
    return { result: blocking ? 'blocked' : 'hit', dmg: Math.max(0, before - h.health) };
  }

  // ---- host events ----
  const tmpV = new THREE.Vector3();
  function onEvent(m) {
    switch (m.t) {
      case 'step': {
        // [net2] (night, step id): a new night's list loads here first; a re-entered step (a
        // mission retry) is entered again; the credits page closes when the host moves on.
        const wasCredits = flow.mode === 'credits';
        G.onStep?.(m);
        flow.follow(m.index, { night: m.night ?? null, id: m.id ?? null, force: true });
        if (wasCredits && flow.mode !== 'credits') G.closeCredits?.();
        return;
      }
      case 'pickup': G.pickups?.take?.(m.item); events.emit('pickup', { item: m.item, remote: true }); return;
      case 'place': {
        const h = p0.hero;
        if (m.heal) { h.dead = false; h.health = m.hp ?? h.maxHealth; h.control = null; hud.setHealth(h.health / h.maxHealth); }
        // [net2] Placed inside one of the Wayne pockets (a Bruce day): build it here first.
        try { const pk = pocketAt(m.pos); if (pk) G.bruce?.pockets?.ensure?.(pk.pocket); } catch { /* not a pocket */ }
        h.teleport(m.pos, m.yaw);
        G.follow?.snapBehind(m.yaw);
        return;
      }
      case 'respawn': flow.respawnAt(m.pos, m.yaw); revive.clear(); return;
      case 'down': if (m.p === 0) events.emit('playerDown', withPlayer({}, hostPlayer)); return;
      case 'revived': {
        revive.clear();
        if (m.p === 1) {
          const h = p0.hero;
          h.dead = false;
          h.health = m.hp ?? Math.round(h.maxHealth * 0.5);
          h.control = null;
          h.invulnerable = 2;
          h.bat.animator.play('LayToIdle', { once: true, timeScale: 1.4, fade: 0.1 });
          hud.setHealth(h.health / h.maxHealth);
          p0.hudSlot?.setDown?.(null);
          events.emit('playerRevived', withPlayer({ by: hostPlayer }, p0));
        } else {
          hostPlayer.hudSlot?.setDown?.(null);
          events.emit('playerRevived', withPlayer({ by: p0 }, hostPlayer));
        }
        return;
      }
      case 'slowMo': time.slowMo(m.sec, m.scale); return;
      case 'ping': G.showPing?.(hostPlayer, m); return;
      case 'chat': G.showChat?.(hostPlayer, m); return;
      case 'ev': onEv(m.name, m.data ?? {}); return;
      case 'boss': {
        const d = m.data ?? {};
        if (d.id || d.gen) { bossG.bar(d); return; } // [net2] a framework boss's bar
        if (d.on) hud.bossBar(true, Number.isFinite(d.bar) ? d.bar : 1, d.phase ?? 1); else hud.bossBar(false);
        return;
      }
      default: G.onOther?.(m);
    }
  }
  function onEv(name, d) {
    if (name === 'heal') { const h = p0.hero; if (!h.dead && typeof d.hp === 'number') { h.health = Math.min(h.maxHealth, Math.max(h.health, d.hp)); hud.setHealth(h.health / h.maxHealth); } return; }
    if (name === 'cutscene') {
      // The boss's end comic plays inside the host's boss step: play it here too, then say so.
      // [net2] Any boss's outro (the framework's defs name their own), in a boss step.
      const s = flow.objectives.step;
      const outro = s?.type === 'boss' ? (G.bosses?.def?.(s.boss ?? 'joker')?.outro ?? 'bossEnd') : 'bossEnd';
      if (d.on && typeof d.name === 'string' && (d.name === 'bossEnd' || d.name === outro) && flow.mode === 'play') { const at = flow.stepIndex; flow.playScene(d.name).then(() => G.sceneDone?.(at)); }
      return;
    }
    if (name === 'ride') { veh.ride(!!d.on, d.kind === 'wing' ? 'wing' : 'car', { drive: !!d.drive, ej: d.ej ?? null }); return; }
    // [net2] wave 3 events
    if (name === 'glueMove') { glue.play(d); return; }
    if (name === 'env') { world.apply(d); return; }
    if (name === 'strike') { world.strike(d); return; }
    if (name === 'bossSay') { bossG.say(d); return; }
    if (name === 'hint') { if (typeof d.text === 'string') hud.hint(d.text.slice(0, 200), 4500); return; }
    // Cosmetic events from the host's side (its hero's blows, barks, shots): replayed here so the
    // guest hears and sees them. Enemies by id; never anything that changes the world.
    const data = { remoteEcho: true };
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (v && typeof v === 'object' && typeof v.enemy === 'string') { const e = puppets.get(v.enemy); if (!e) return; data[k] = e; }
      else if (v && typeof v === 'object' && Number.isFinite(v.x)) data[k] = new THREE.Vector3(v.x, v.y ?? 0, v.z);
      else data[k] = v;
    }
    const by = d.by === 0 ? hostPlayer : d.by === 1 ? p0 : null;
    if (name === 'impact' && data.target?.netPuppet) data.target.ch?.headWorld?.(tmpV, -0.3);
    events.emit(name, by ? withPlayer(data, by) : data);
  }

  const adapter = {
    spawn(m) {
      if (puppets.has(m.id)) return;
      const e = makePuppet(m);
      if (!e) return;
      puppets.set(m.id, e);
      byNum.set(enemyNum(m.id), e);
      publish();
    },
    despawn(id) {
      const e = puppets.get(id);
      if (!e) return;
      puppets.delete(id);
      byNum.delete(enemyNum(id));
      removeBody(id, e);
      publish();
    },
    enemyByNum: (num) => byNum.get(num) ?? null,
    applyEnemy(e, pos, rec, rt) { applyEnemyRecord(e, pos, rec, rt, { now, fighterOf, real: real.dt }); },
    hostHero() {},
    hostHeroRecord(rec, t) { if (rec.slot === 0) hostPlayer.puppet?.push(rec, t); },
    localHero(out) {
      // [net2] the presses since the last record, and where our camera looks (driving, the turret)
      const st = G.follow?.state;
      aim.yaw = st?.yaw ?? p0.hero.bat.yaw; aim.pitch = st?.pitch ?? 0;
      readHero(p0.hero, 1, out, { away: document.hidden, tap: tapAcc, aim });
      tapAcc = 0;
      return true;
    },
    attackBegin(e, m) {
      // The goon winds up on our timeline now: the counter window starts here, not a round trip late.
      e.netAttack = { contact: m.contact, glyph: e.glyph ?? (e.def?.counterable === false ? 'red' : 'blue') };
      e.state = 'windup';
      e.glyph = e.netAttack.glyph;
      e.aggro = p0.fighter;
      e.hitDone = false;
    },
    isCounteredLocally(e) { return e.netCounteredAt > now() - 1500; },
    resolveAttack,
    hurt(m) {
      const h = p0.hero;
      if (h.dead) return;
      // Damage the host measured itself (the boss's tiles and gas): taken as it is.
      if (typeof m.dmg === 'number' && !m.e) {
        if (h.invulnerable > 0) return;
        h.health = Math.max(0, h.health - m.dmg);
        events.emit('heroHurt', withPlayer({ kind: m.kind, damage: m.dmg, pos: h.pos.clone() }, p0));
        if (h.health <= 0) p0.fighter.killHero();
        return;
      }
      const e = m.e ? puppets.get(m.e) ?? null : null;
      p0.fighter.onAttackLand(e, m.kind);
    },
    hitAck(m) {
      // A rejected claim: let the host's state show again at once.
      if (m.out === 'rejected' || m.out === 'locked') { const e = puppets.get(m.e); if (e) e.netHoldUntil = 0; }
    },
    granted() {},
    denied(req) {
      if (lockFor?.req === req) {
        // Someone else has him: our takedown plays out, but the host's version stands.
        const e = puppets.get(lockFor.id);
        if (e) e.netHoldUntil = 0;
      }
    },
    onEvent,
    // The host's vehicles, posed from the snapshot (this machine never simulates its own).
    prop(rec, pos) { veh.prop(rec, pos); },
    // Per frame, before combat: exclusive actions ask the host for their target.
    frame(dt) {
      real.dt = dt;
      // [net2] Our presses reach the host as edges (the vehicle key, the Batwing key, the gunner's
      // trigger, a dual takedown's grab): OR'd up until the next hero record goes.
      tapAcc |= pressedMask(p0.input);
      veh.frame(dt);
      for (const a of allies.values()) a.ch.animator.update(dt); // not on the fight list: tick him here
      const c = p0.hero.control;
      const target = c?.target;
      if (c && target?.netPuppet && EXCLUSIVE.has(c.name)) {
        if (!lockFor || lockFor.control !== c) {
          if (lockFor) rep.unlock(lockFor.req);
          lockFor = { control: c, id: target.id, req: rep.lock([target.id], c.name) };
        }
        target.netHold(400);
      } else if (lockFor && lockFor.control !== c) {
        rep.unlock(lockFor.req);
        lockFor = null;
      }
    },
    get puppets() { return puppets; },
    get riding() { return veh.riding; },
    // A fresh world from the host (welcome, reconnect): every puppet rebuilt from its records.
    loadWorld(enemies = []) {
      for (const [id, e] of puppets) removeBody(id, e);
      puppets.clear(); byNum.clear();
      for (const m of enemies) {
        const e = makePuppet(m);
        if (!e) continue;
        puppets.set(m.id, e);
        byNum.set(enemyNum(m.id), e);
      }
      publish();
    },
    dispose() { for (const off of offs.splice(0)) off(); for (const [id, e] of puppets) removeBody(id, e); puppets.clear(); byNum.clear(); publish(); world.dispose(); if (gapi && origJam) gapi.jam = origJam; },
  };
  return adapter;
}
