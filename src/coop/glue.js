// Co-op glue at run time (workstream D1, design section 5): signature moves per kit, team moves
// per pairing, dual takedowns, the comms wheel (marks: that goon, go here, need help; quick-chat
// lines) shown in both views. The rules are src/coop/glueRules.js; this file plays them.
//
// Every move here hits through the attacker's own fighter (gadgetApi.landHit / areaBlast): the same
// bookkeeping as a punch (combo, aggro, KO events, XP to that player). A press this layer uses is
// masked from combat for that frame through the player's input filter, so a special button press
// that became a signature move is not also a special takedown hint.
import * as THREE from 'three';
import { withPlayer } from '../core/events.js';
import { kitInfo } from '../heroes/roster.js';
import { signatureChoice, teamMoveFor, teamReady, dualTakedownTarget, createPings, COMMS, commsSlot, TEAM } from './glueRules.js';
import { isReplica } from '../net/mode.js'; // [net2]

// An input that can hide one action for a frame (what combat and the hero read as ctx.input).
export function createInputFilter(src) {
  const masked = new Set();
  return {
    src, masked,
    get move() { return src.move; },
    get look() { return src.look; },
    get stick() { return src.stick; },
    get device() { return src.device; },
    get hasKbm() { return src.hasKbm; },
    get pad() { return src.pad; },
    get padIndex() { return src.padIndex; },
    down: (a) => !masked.has(a) && src.down(a),
    pressed: (a) => !masked.has(a) && src.pressed(a),
    released: (a) => src.released(a),
    codePressed: (c) => src.codePressed?.(c) ?? false,
    swallow: (c) => src.swallow?.(c),
    padPressed: (a) => src.padPressed?.(a) ?? false,
    padButton: (i) => src.padButton?.(i) ?? false,
    padButtonHeld: (i) => src.padButtonHeld?.(i) ?? false,
    mask(a) { masked.add(a); },
    clear() { masked.clear(); },
  };
}

export function createGlue({ players, combat, events, hud, split, assets, time, getFlow, keyFor, toScreenOf }) {
  const pings = createPings();
  const cool = new Map(); // player -> Map(sigId -> seconds)
  const pressAt = new Map(); // player -> time of its last special press
  let now = 0, teamCool = 0;
  const tmp = new THREE.Vector3(), dir = new THREE.Vector3();
  const wheels = new Map(); // player -> { el, open, pick, cx, cy }

  const coolOf = (p) => { let m = cool.get(p); if (!m) { m = new Map(); cool.set(p, m); } return m; };
  const filterOf = (p) => (p.ctx?.input?.mask ? p.ctx.input : null);
  const rawOf = (p) => p.ctx?.input?.src ?? p.input;
  const fighterOf = (p) => p.fighter ?? combat.fighterFor(p.hero);

  // ---------------- moves as hero controls ----------------
  // A clip played once with a contact time; `strike` lands at contact. Moves that travel lunge
  // toward their target first (the pack clips have their root motion removed).
  function moveControl(p, { clip, fallback = 'Kick_Round', contact, reach = 2.5, lunge = 0, target = null, strike, name = 'signature', speed = 1.1 }) {
    const h = p.hero;
    const has = h.bat.animator.has(clip);
    const use = has ? clip : fallback;
    const at = has ? contact : 0.35;
    const dur = Math.min(assets.clips.get(use)?.duration ?? at + 0.8, at + 1.0);
    h.bat.animator.play(use, { once: true, timeScale: speed, fade: 0.08 });
    if (target) h.bat.face(Math.atan2(target.pos.x - h.pos.x, target.pos.z - h.pos.z));
    let t = 0, fired = false;
    return {
      name, combat: true, signature: true,
      canChain: () => fired && t * speed > at + 0.2,
      update(dt) {
        t += dt;
        const k = t * speed;
        if (!fired && lunge > 0 && target && k < at) {
          const dx = target.pos.x - h.pos.x, dz = target.pos.z - h.pos.z, d = Math.hypot(dx, dz);
          if (d > reach * 0.6) { h.vel.set((dx / d) * lunge, 0, (dz / d) * lunge); h.integrate(dt); }
        }
        if (!fired && k >= at) { fired = true; strike(); }
        return k >= dur;
      },
    };
  }

  // The goons in front of a hero within reach and arc, nearest first (allocates a small list:
  // only when a move fires, never per frame).
  function inFront(h, reach, arc) {
    const fx = Math.sin(h.bat.yaw), fz = Math.cos(h.bat.yaw);
    const out = [];
    for (const e of combat.enemies) {
      if (!e.alive || e.def?.boss || e.state === 'chained') continue;
      const dx = e.pos.x - h.pos.x, dz = e.pos.z - h.pos.z, d = Math.hypot(dx, dz);
      if (d > reach || Math.abs(e.pos.y - h.pos.y) > 2.5) continue;
      if (d > 0.5 && Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d))) > arc / 2) continue;
      out.push({ e, d });
    }
    return out.sort((a, b) => a.d - b.d).map((x) => x.e);
  }
  const nearestEnemy = (h, range) => {
    let best = null, bd = range;
    for (const e of combat.enemies) { if (!e.alive || e.def?.boss) continue; const d = e.pos.distanceTo(h.pos); if (d < bd) { bd = d; best = e; } }
    return best;
  };

  function startSignature(p, sig) {
    const h = p.hero, f = fighterOf(p);
    const target = nearestEnemy(h, Math.max(sig.reach + 2, 6));
    coolOf(p).set(sig.id, sig.cooldown);
    h.control = moveControl(p, {
      clip: sig.clip, contact: sig.contact, reach: sig.reach, lunge: sig.when === 'move' ? 9 : 3, target,
      strike: () => {
        let n = 0;
        if (sig.area > 0) n = f.gadgetApi.areaBlast(h.pos, sig.area, 'spinKick', { power: sig.power, launch: sig.launch || 3 });
        else for (const e of inFront(h, sig.reach, sig.arc).slice(0, 2)) { f.gadgetApi.landHit('spinKick', e, { power: sig.power, launch: sig.launch, crit: n === 0 }); n += 1; }
        events.emit('word', { text: sig.name.toUpperCase() + '!', pos: h.pos.clone().setY(h.pos.y + 2.3), big: n > 0 });
        events.emit('signatureMove', withPlayer({ id: sig.id, hits: n }, p));
      },
    });
    events.emit('signatureStart', withPlayer({ id: sig.id }, p));
  }

  // ---------------- team moves ----------------
  function startTeamMove(a, b) {
    const move = teamMoveFor(kitInfo(a.kit).teamTags, kitInfo(b.kit).teamTags);
    teamCool = TEAM.cooldown;
    const mid = tmp.copy(a.hero.pos).add(b.hero.pos).multiplyScalar(0.5).clone();
    const fa = fighterOf(a), fb = fighterOf(b);
    const clipOf = (p) => (kitInfo(p.kit).signature.find((s) => !s.native)?.clip ?? 'Kick_Spin');
    const word = () => events.emit('word', { text: move.word, pos: mid.clone().setY(mid.y + 2.6), big: true });
    if (move.id === 'thunderclap' || move.id === 'launchPad') {
      // The acrobat (or the strong one) leads; both land the blast together.
      const lead = move.id === 'launchPad' ? (kitInfo(a.kit).teamTags.includes('acrobat') ? a : b) : (kitInfo(a.kit).teamTags.includes('power') ? a : b);
      const other = lead === a ? b : a;
      const target = nearestEnemy(lead.hero, 12);
      const center = target ? target.pos.clone() : mid;
      other.hero.control = moveControl(other, { clip: 'Fly_PowerPush', fallback: 'Spell_Simple_Shoot', contact: 0.5, name: 'teamMove', strike: () => {} });
      lead.hero.control = moveControl(lead, {
        clip: move.id === 'launchPad' ? 'Staff_JumpAttack' : 'Fly_Slam', fallback: 'Kick_Flying', contact: move.id === 'launchPad' ? 1.5 : 0.73, reach: 2.5, lunge: 11, target, name: 'teamMove',
        strike: () => {
          const n = (lead === a ? fa : fb).gadgetApi.areaBlast(center, move.radius, 'spinKick', { power: move.power, launch: move.launch });
          word();
          events.emit('teamMove', withPlayer({ id: move.id, hits: n, with: other }, lead));
          if (target) events.emit('critical', withPlayer({ target, impact: 2 }, lead));
        },
      });
    } else {
      // Both pick their own goons and put them down, hard (KO through each fighter's own combat).
      const taken = new Set();
      for (const p of [a, b]) {
        const f = p === a ? fa : fb;
        const list = inFront(p.hero, 9, Math.PI * 2).filter((e) => !taken.has(e)).slice(0, move.targets);
        for (const e of list) taken.add(e);
        p.hero.control = moveControl(p, {
          clip: clipOf(p), fallback: 'Melee_Hook', contact: kitInfo(p.kit).signature.find((s) => !s.native)?.contact ?? 0.35, reach: 2.4, lunge: 10, target: list[0] ?? null, name: 'teamMove',
          strike: () => { for (const e of list) f.gadgetApi.landHit('special', e, { power: move.power, launch: 3 }); if (p === a) { word(); events.emit('teamMove', withPlayer({ id: move.id, hits: taken.size, with: b }, a)); } },
        });
      }
    }
  }

  // ---------------- dual takedowns ----------------
  function startDual(a, b, target) {
    const fa = fighterOf(a);
    // Opposite sides of him, facing in: one grabs and slams, the other hammers.
    const ax = a.hero.pos.x - target.pos.x, az = a.hero.pos.z - target.pos.z, al = Math.hypot(ax, az) || 1;
    a.hero.pos.set(target.pos.x + (ax / al) * 1.1, a.hero.pos.y, target.pos.z + (az / al) * 1.1);
    b.hero.pos.set(target.pos.x - (ax / al) * 1.1, b.hero.pos.y, target.pos.z - (az / al) * 1.1);
    target.chainHold?.();
    a.hero.control = moveControl(a, { clip: 'Grab_Slam', fallback: 'Melee_Hook', contact: 0.6, target, name: 'dualTakedown', strike: () => {} });
    b.hero.control = moveControl(b, {
      clip: 'Hammer_Down', fallback: 'Punch_Hammer', contact: 0.83, target, name: 'dualTakedown',
      strike: () => {
        target.chainRelease?.();
        fa.gadgetApi.landHit('special', target, { power: 2, launch: 0 });
        events.emit('word', { text: 'DOUBLE TAKEDOWN!', pos: target.pos.clone().setY(target.pos.y + 1.8), big: true });
        events.emit('dualTakedown', withPlayer({ target, with: b }, a));
      },
    });
    for (const p of [a, b]) p.hero.invulnerable = Math.max(p.hero.invulnerable, 1.6);
  }

  // ---------------- the comms wheel ----------------
  function wheelFor(p) {
    let w = wheels.get(p);
    const host = hud.forPlayer(p).el;
    if (w && w.host !== host) { w.el.remove(); w = null; }
    if (!w) {
      const el = document.createElement('div');
      el.className = 'comms-wheel';
      el.innerHTML = COMMS.map((c, i) => {
        const a = (i / COMMS.length) * Math.PI * 2;
        return `<div class="cw-item cw-${c.kind}" style="--x:${(Math.sin(a) * 120).toFixed(0)}px;--y:${(-Math.cos(a) * 120).toFixed(0)}px">${c.label}</div>`;
      }).join('') + '<div class="cw-center">COMMS</div>';
      host.appendChild(el);
      w = { el, host, items: [...el.querySelectorAll('.cw-item')], open: false, pick: null, cx: 0, cy: 0 };
      wheels.set(p, w);
    }
    return w;
  }
  function commsUpdate(p) {
    const raw = rawOf(p);
    // Keyboard: hold B. Pad: hold Y and D-pad down together (read raw: D-pad down alone stays help).
    const held = raw.down('ping') || (!!raw.padButtonHeld?.(3) && !!raw.padButtonHeld?.(13));
    const w = held || wheels.get(p)?.open ? wheelFor(p) : null;
    if (!w) return;
    if (held && !w.open) { w.open = true; w.cx = 0; w.cy = 0; w.pick = null; w.el.classList.add('show'); }
    if (w.open && held) {
      w.cx += (raw.look?.dx ?? 0) / 70 + (raw.stick?.lx ?? 0) * 0.25;
      w.cy += (raw.look?.dy ?? 0) / 70 + (raw.stick?.ly ?? 0) * 0.25;
      const len = Math.hypot(w.cx, w.cy);
      if (len > 1) { w.cx /= len; w.cy /= len; }
      const s = commsSlot(w.cx, w.cy, 0.35);
      if (s !== w.pick) { w.items[w.pick]?.classList.remove('on'); w.pick = s; w.items[s]?.classList.add('on'); }
      // The wheel holds the camera still.
      filterOf(p)?.mask('ping');
    }
    if (w.open && !held) {
      w.open = false;
      w.el.classList.remove('show');
      w.items[w.pick]?.classList.remove('on');
      if (w.pick !== null) comms(p, COMMS[w.pick]);
    }
  }
  function comms(p, c) {
    const h = p.hero;
    if (c.kind === 'chat') {
      events.emit('quickChat', withPlayer({ id: c.id, text: c.label }, p));
      bubble(p, c.label);
      return;
    }
    const cam = p.view?.camera;
    if (c.id === 'enemy') {
      cam?.getWorldDirection(dir);
      let best = null, bs = 0.2;
      for (const e of combat.enemies) {
        if (!e.alive) continue;
        tmp.copy(e.pos).sub(cam.position);
        const d = tmp.length();
        if (d > 45) continue;
        const s = tmp.dot(dir) / d;
        if (s > 1 - bs) { bs = 1 - s; best = e; }
      }
      if (!best) best = nearestEnemy(h, 30);
      if (best) pings.add({ id: 'enemy', by: p.id, target: best, label: 'THAT ONE!' });
    } else if (c.id === 'here') {
      cam?.getWorldDirection(dir);
      const from = cam.position;
      const hit = h.collision.raycast(from, dir, 120);
      const at = hit ? from.clone().addScaledVector(dir, hit.t) : h.pos.clone().addScaledVector(dir.setY(0).normalize(), 12);
      pings.add({ id: 'here', by: p.id, pos: at, label: 'HERE' });
    } else if (c.id === 'help') {
      pings.add({ id: 'help', by: p.id, follow: h, label: 'HELP!' });
      for (const o of players.list) if (o !== p) hud.forPlayer(o).hint(`Player ${p.slot + 1} needs help!`, 2500);
    }
    events.emit('ping', withPlayer({ id: c.id }, p));
  }
  // A speech balloon over the speaker, in every view.
  const bubbles = [];
  function bubble(p, text) {
    bubbles.push({ p, text, t: 2.6, els: new Map() });
  }

  // Marks and balloons, projected into every view's own HUD.
  const pinPool = new Map();
  function drawMarks(dt) {
    const views = split.split ? split.views : split.views.slice(0, 1);
    const seen = new Set();
    for (const v of views) {
      const host = (v.hud ?? hud.primary).el;
      const project = toScreenOf(v.player);
      for (const m of pings.marks) {
        const key = `${v.player.id}:${m.by}:${m.id}`;
        seen.add(key);
        let el = pinPool.get(key);
        if (!el || el.parentNode !== host) { el?.remove(); el = document.createElement('div'); el.className = `ping-pin ping-${m.id} by-${m.by}`; el.innerHTML = `<i></i><span>${m.label}</span>`; host.appendChild(el); pinPool.set(key, el); }
        const at = m.target ? tmp.copy(m.target.pos).setY(m.target.pos.y + 2.2) : m.follow ? tmp.copy(m.follow.pos).setY(m.follow.pos.y + 2.4) : tmp.copy(m.pos).setY(m.pos.y + 0.6);
        const s = project(at);
        el.style.display = s.behind ? 'none' : '';
        el.style.left = `${s.x}px`;
        el.style.top = `${s.y}px`;
      }
      for (const b of bubbles) {
        const key = `b:${v.player.id}:${bubbles.indexOf(b)}`;
        let el = b.els.get(v);
        if (!el) { el = document.createElement('div'); el.className = 'chat-bubble'; el.textContent = b.text; host.appendChild(el); b.els.set(v, el); }
        const s = project(tmp.copy(b.p.hero.pos).setY(b.p.hero.pos.y + 2.5));
        el.style.display = s.behind ? 'none' : '';
        el.style.left = `${s.x}px`;
        el.style.top = `${s.y}px`;
        seen.add(key);
      }
    }
    for (const [k, el] of pinPool) if (!seen.has(k)) { el.remove(); pinPool.delete(k); }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      bubbles[i].t -= dt;
      if (bubbles[i].t <= 0) { for (const el of bubbles[i].els.values()) el.remove(); bubbles.splice(i, 1); }
    }
  }

  // ---------------- per frame ----------------
  function preUpdate(real, dt) {
    now += real;
    teamCool = Math.max(0, teamCool - dt);
    for (const p of players.list) {
      filterOf(p)?.clear();
      for (const [k, v] of coolOf(p)) if (v > 0) coolOf(p).set(k, v - dt);
    }
    if (getFlow().mode !== 'play') return;
    const two = players.list.length > 1;
    for (const p of players.list) {
      const raw = rawOf(p), f = filterOf(p), h = p.hero;
      // [net2] An online host also reads its networked partner's presses (src/net/game/glueNet.js
      // gives it press edges): dual takedowns and team moves start here for it too. Its comms wheel
      // and its own signature moves are its machine's. On an online guest (replica) only the comms
      // and signature moves run: the host starts the paired moves and tells the guest to play its part.
      if ((!f && !p.remote) || h.dead) continue;
      if (two && !p.remote) commsUpdate(p);
      // Dual takedown: grab beside a stunned or floored goon the partner is also beside.
      if (two && raw.pressed('throw') && !h.control) {
        const o = players.list.find((x) => x !== p && !x.hero.dead && (!x.hero.control || x.hero.control.combat));
        const t = o ? dualTakedownTarget(h.pos, o.hero.pos, combat.enemies) : null;
        if (t && isReplica()) { f?.mask('throw'); continue; } // [net2] the host starts it (it sees this press)
        if (t) { f?.mask('throw'); o.ctx?.input?.mask?.('throw'); startDual(p, o, t); continue; }
      }
      if (!raw.pressed('special')) continue;
      pressAt.set(p, now);
      // Team move: the partner pressed special a moment ago, close by, with goons around.
      if (two && !isReplica()) {
        const o = players.list.find((x) => x !== p && !x.hero.dead);
        if (o) {
          const enemiesNear = combat.enemies.some((e) => e.alive && e.aware && e.pos.distanceTo(h.pos) < TEAM.enemyRange);
          if (teamReady({ pressA: pressAt.get(p), pressB: pressAt.get(o) ?? -Infinity, now, dist: h.pos.distanceTo(o.hero.pos), enemiesNear: enemiesNear ? 1 : 0, cooldown: teamCool })) {
            f?.mask('special');
            startTeamMove(o, p);
            continue;
          }
        }
      }
      // Signature move: special with the combo not ready.
      if (p.remote) continue; // [net2] a networked partner's signature moves run on its own machine
      const fi = fighterOf(p);
      const sig = signatureChoice(kitInfo(p.kit).signature, {
        comboReady: fi ? fi.combo.value >= fi.combo.readyAt : true, moving: h.speed > 3 || raw.down('sprint'),
        grounded: h.grounded && h.state === 'ground', cooldowns: coolOf(p), busy: !!h.control && !h.control.combat,
      });
      if (sig) { f.mask('special'); startSignature(p, sig); }
    }
  }
  function lateUpdate(real) {
    pings.update(real);
    if (pings.marks.length || bubbles.length || pinPool.size) drawMarks(real);
  }

  return {
    preUpdate, lateUpdate, pings,
    // Signature cooldowns per player (the HUD line and tests read them).
    cooldownOf: (p, id) => coolOf(p).get(id) ?? 0,
    get teamCooldown() { return teamCool; },
    comms, startTeamMove, startDual, startSignature,
  };
}
