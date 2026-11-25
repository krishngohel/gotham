// Puppets (workstream D2; research decision 15): characters this machine draws but does not
// simulate. A puppet replicates animation *state* (clip, clip time, speed), never bones: the shared
// skeleton plays the same clip at the time the owner had it, adjusted for when the sample was taken.
//
//   readAnim(animator, out)        what an animator is playing now (owner side)
//   createAnimDriver(animator)     plays a record's clip at the right time (puppet side)
//   readHero(hero, slot, out)      a hero record (owner side)
//   createHeroPuppet(player, ...)  a remote hero posed from records (no hero.update)
//   readEnemy(e, out)              an enemy record (host side)
import { createClipTable } from '../codec/binary.js';
import { EF, HF, RF, WEAPONS, enemyNum, heldMask, heldList, HELD_ACTIONS } from '../codec/snapshot.js';
import { createSampleBuffer, createInterpDelay } from '../clock.js';

export const clipTable = createClipTable();
const LOOP_ONCE = 2200; // THREE.LoopOnce

// ---- owner side ----
export function readAnim(animator, out) {
  const a = animator?.currentAction;
  const name = animator?.currentName;
  if (!a || !name) { out.clip = 0; out.clipT = 0; out.speed = 1; out.once = false; return out; }
  out.clip = clipTable.hash(name);
  out.clipT = a.time % 65.5;
  out.speed = Math.max(0, Math.min(7.9, a.timeScale ?? 1));
  out.once = a.loop === LOOP_ONCE;
  return out;
}

const anim = { clip: 0, clipT: 0, speed: 1, once: false };
// [net2] The presses an input made this frame, as a HELD_ACTIONS mask (the guest ORs them up between
// two hero records so a quick tap reaches the host).
export function pressedMask(input) { let m = 0; if (!input?.pressed) return 0; for (let i = 0; i < HELD_ACTIONS.length; i++) if (input.pressed(HELD_ACTIONS[i])) m |= 1 << i; return m >>> 0; }

export function readHero(h, slot, out, { away = false, tap = 0, aim = null } = {}) {
  readAnim(h.bat.animator, anim);
  out.slot = slot;
  out.x = h.pos.x; out.y = h.pos.y; out.z = h.pos.z;
  out.vx = h.vel.x; out.vy = h.vel.y; out.vz = h.vel.z;
  out.yaw = h.bat.yaw;
  out.clip = anim.clip; out.clipT = anim.clipT; out.speed = anim.speed;
  out.health = Math.max(0, h.health); out.maxHealth = Math.max(1, h.maxHealth);
  out.flags = (h.dead ? HF.dead : 0) | (h.blocking ? HF.blocking : 0) | (h.crouched ? HF.crouched : 0)
    | (h.invulnerable > 0 ? HF.invulnerable : 0) | (anim.once ? HF.once : 0) | (h.grounded ? HF.grounded : 0)
    | (away ? HF.away : 0) | (h.bat.root.visible === false ? HF.hidden : 0);
  out.state = h.state ?? 'ground';
  out.seat = h.control?.ride ? 2 : h.control?.name === 'drive' ? 1 : 0;
  out.held = heldMask(h.player?.input);
  // [net2] presses since the last record, the move stick and the camera's aim
  out.tap = tap >>> 0;
  const mv = h.player?.input?.move;
  out.mx = mv?.x ?? 0; out.my = mv?.y ?? 0;
  out.camYaw = aim?.yaw ?? h.bat.yaw; out.camPitch = aim?.pitch ?? 0;
  return out;
}

// [net2] The role bits a puppet needs to look right (snapshot.js RF).
export function roleOf(e) {
  const i = e.weapon ? WEAPONS.indexOf(e.weapon) : 0;
  const w = e.weapon ? (i > 0 ? i : 3) : 0;
  return w | (e.charged ? RF.charged : 0) | (e.hallucination ? RF.phantom : 0) | (e.shieldLost ? RF.shieldLost : 0);
}

export function readEnemy(e, out) {
  readAnim(e.ch.animator, anim);
  out.num = enemyNum(e.id);
  out.x = e.pos.x; out.y = e.pos.y; out.z = e.pos.z;
  out.yaw = e.ch.yaw;
  out.clip = anim.clip; out.clipT = anim.clipT; out.speed = anim.speed;
  out.state = e.state;
  out.health = e.health;
  out.flags = (e.alive ? EF.alive : 0) | (e.down ? EF.down : 0) | (e.aware ? EF.aware : 0) | (e.air ? EF.air : 0)
    | (e.stunned ? EF.stunned : 0) | (e.countered ? EF.countered : 0) | (anim.once ? EF.once : 0) | (e.room ? EF.room : 0);
  out.glyph = e.glyph ?? null;
  out.target = e.aggro?.player?.netSlot ?? null;
  out.role = roleOf(e);
  return out;
}

// [net2] A puppet's role from the host's bits: the weapon in hand (or gone), the baton's charge,
// a fear phantom, a stripped shield. Visual and local-rule state only (resolveHit reads them).
export function applyRole(e, role) {
  if (role === undefined || role === e.netRole) return;
  e.netRole = role;
  const w = role & RF.weaponMask;
  if (!w && e.weapon) {
    e.weapon = null;
    if (e.ch?.prop) e.ch.prop.visible = false;
    if (e.armProp) e.armProp.visible = false;
    if (e.def?.shock) e.def = { ...e.def, shock: false };
  } else if (w && !e.weapon && typeof e.arm === 'function' && WEAPONS[w]) {
    try { e.arm(WEAPONS[w]); } catch { /* a puppet that cannot hold it */ }
  }
  e.charged = !!(role & RF.charged);
  e.hallucination = !!(role & RF.phantom);
  e.shieldLost = !!(role & RF.shieldLost);
}

// ---- puppet side ----
// Plays rec's clip so it shows what the owner showed at renderTime: a new clip cross-fades in at
// the right point; the same clip is nudged only when it has drifted (no per-frame snapping).
export function createAnimDriver(animator, { fade = 0.12, drift = 0.14 } = {}) {
  let lastClip = 0, lastT = 0;
  return {
    apply(rec, sampleTime, renderTime) {
      if (!rec || !rec.clip || !animator) return;
      const name = clipTable.name(rec.clip, animator.clips);
      if (!name) return;
      const once = !!(rec.flags & (rec.num !== undefined ? EF.once : HF.once));
      const speed = rec.speed || 0;
      let want = rec.clipT + Math.max(0, (renderTime - sampleTime) / 1000) * speed;
      const clip = animator.clips.get(name);
      const dur = clip?.duration || 1;
      want = once ? Math.min(want, dur) : want % dur;
      const cur = animator.currentAction;
      // A new clip, or the same one-shot started again (a second identical reaction).
      const restarted = once && rec.clip === lastClip && rec.clipT + 0.2 < lastT;
      if (animator.currentName !== name || restarted) {
        try { animator.play(name, { fade, once, timeScale: speed, startAt: want }); } catch { /* a clip this build lacks */ }
      } else if (cur) {
        cur.timeScale = speed;
        let d = want - cur.time;
        if (!once) d = ((d % dur) + dur * 1.5) % dur - dur * 0.5;
        if (Math.abs(d) > drift) cur.time = once ? Math.min(want, dur) : want;
      }
      lastClip = rec.clip; lastT = rec.clipT;
    },
  };
}

// A remote hero posed from records: position (smoothed), facing, clip, health, flags. Records are
// pushed with the owner's host-clock time; update() samples at hostNow - delay.
// [net2] edges: the host's copy of a guest makes press/release edges on its remote input (the
// vehicle key, the gunner's trigger, a dual takedown's grab, a team move's special), and takes its
// stick and camera aim (player.netAim) for driving and the turret. The guest's copy of the host
// keeps the old held-only rule (its presses act on the host's machine, never here).
export function createHeroPuppet(player, { hostNow, delay = createInterpDelay(), noteDelay = true, edges = false } = {}) {
  const h = player.hero;
  const buf = createSampleBuffer(16);
  const recs = [];
  const drv = createAnimDriver(h.bat.animator);
  const held = [], tapList = [];
  let last = null;
  const pup = {
    delay,
    get last() { return last; },
    push(rec, t) {
      if (noteDelay) delay.note(hostNow(), t);
      if (!buf.push(t, rec.x, rec.y, rec.z, rec.yaw)) return;
      rec.time = t;
      recs.push(rec);
      if (recs.length > 16) recs.shift();
      if (edges) {
        const inp = player.input;
        heldList(rec.held, held);
        inp?.setState?.({ held: [...held], move: { x: rec.mx ?? 0, y: rec.my ?? 0 } });
        if (rec.tap) for (const a of heldList(rec.tap, tapList)) if (!held.includes(a)) inp?.tap?.(a);
        if (player.netAim) { player.netAim.yaw = rec.camYaw ?? 0; player.netAim.pitch = rec.camPitch ?? 0; }
      }
    },
    clear() { buf.clear(); recs.length = 0; },
    // Snap at once (a teleport the owner made, a respawn).
    snap(p, yaw) { buf.clear(); recs.length = 0; h.pos.set(p.x, p.y, p.z); h.bat.face(yaw); },
    update(real) {
      if (!buf.count) return;
      const rt = hostNow() - delay.value;
      const s = buf.sample(rt, 120);
      if (!s) return;
      let rec = recs[0];
      for (let i = recs.length - 1; i >= 0; i--) if (recs[i].time <= rt) { rec = recs[i]; break; }
      last = rec;
      const dx = s.x - h.pos.x, dy = s.y - h.pos.y, dz = s.z - h.pos.z;
      if (dx * dx + dy * dy + dz * dz > 16) h.pos.set(s.x, s.y, s.z);
      else { const k = Math.min(1, real * 18); h.pos.x += dx * k; h.pos.y += dy * k; h.pos.z += dz * k; }
      h.bat.face(s.yaw);
      h.vel.set(rec.vx, rec.vy, rec.vz);
      drv.apply(rec, rec.time, rt);
      h.bat.animator.update(real);
      const dead = !!(rec.flags & HF.dead);
      h.health = rec.health;
      h.maxHealth = rec.maxHealth;
      h.dead = dead;
      h.blocking = !!(rec.flags & HF.blocking);
      h.crouched = !!(rec.flags & HF.crouched);
      h.invulnerable = rec.flags & (HF.invulnerable | HF.away) ? 0.2 : 0;
      h.grounded = !!(rec.flags & HF.grounded);
      h.state = rec.state;
      const hidden = !!(rec.flags & HF.hidden);
      h.bat.root.visible = !hidden;
      h.cape.mesh.visible = !hidden;
      player.away = !!(rec.flags & HF.away);
      if (!edges) player.input?.setHeld?.(heldList(rec.held, held));
    },
  };
  return pup;
}

// Turns a freshly made enemy into a puppet: its AI never runs here, the host's snapshots pose it.
// Local prediction stays: the guest's own blows still play their reaction at once (applyHit), and
// for `holdMs` after one the snapshot's (older) state is not forced back over it.
export function puppetizeEnemy(e, { now, holdMs = 450, onFx = null, onCounter = null } = {}) {
  e.netPuppet = true;
  e.netHoldUntil = 0;
  e.netAttack = null;
  const drv = createAnimDriver(e.ch.animator);
  e.netDriver = drv;
  const noop = () => false;
  for (const k of ['ready', 'startWindup', 'setMood', 'startRevive', 'startPickup', 'wake', 'calm', 'engageNow', 'goTo', 'lookAt', 'tryEvade', 'riposte']) if (typeof e[k] === 'function') e[k] = noop;
  // The animation advances once a frame here (combat calls update): pose comes from the net layer.
  e.update = (dt) => { e.ch.animator.update(dt); };
  const hold = (ms = holdMs) => { e.netHoldUntil = Math.max(e.netHoldUntil, now() + ms); };
  e.netHold = hold;
  const origApply = e.applyHit;
  e.applyHit = (...a) => { hold(); return origApply(...a); };
  // Status effects the guest's gadgets and chains put on him: played here, claimed to the host.
  for (const fx of ['freeze', 'dazzle', 'yank', 'tie', 'chainHold', 'chainRelease', 'lose']) {
    const orig = e[fx];
    if (typeof orig !== 'function') continue;
    e[fx] = (...a) => {
      hold(fx === 'chainHold' ? 6000 : fx === 'freeze' ? (a[0] ?? 3) * 1000 : 900);
      if (fx === 'chainRelease') e.netHoldUntil = now() + 300;
      onFx?.(e, fx, a);
      return orig(...a);
    };
  }
  // A counter (combatSystem sets e.countered) aimed at this goon: report it the moment it happens.
  let countered = false;
  Object.defineProperty(e, 'countered', {
    configurable: true,
    get: () => countered,
    set: (v) => {
      const was = countered;
      countered = !!v;
      if (countered && !was && !e.netApplying) { e.netCounteredAt = now(); hold(1300); onCounter?.(e); }
    },
  });
  return e;
}

// Applies one snapshot sample to an enemy puppet (unless a local action holds it).
export function applyEnemyRecord(e, pos, rec, renderTime, { now, fighterOf, real = 1 / 60 }) {
  const held = e.netHoldUntil > now();
  // Life and death are always the host's (a local prediction is corrected here).
  e.netApplying = true;
  e.health = rec.health;
  const alive = !!(rec.flags & EF.alive);
  if (!held || !alive) {
    e.alive = alive;
    e.down = !!(rec.flags & EF.down);
    e.air = !!(rec.flags & EF.air);
    e.stunned = !!(rec.flags & EF.stunned);
    // An attack the guest is resolving on its own timeline keeps its wind-up until contact.
    const atk = e.netAttack;
    if (atk && renderTime < atk.contact + 150 && alive) {
      e.state = renderTime < atk.contact ? 'windup' : 'attack';
      e.glyph = atk.glyph;
    } else {
      e.netAttack = null;
      e.state = rec.state;
      e.glyph = rec.glyph;
    }
    if (!(e.netCounteredAt > now() - 1300)) e.countered = !!(rec.flags & EF.countered);
    e.aware = !!(rec.flags & EF.aware);
    e.aggro = fighterOf(rec.target) ?? e.aggro;
    const dx = pos.x - e.pos.x, dy = pos.y - e.pos.y, dz = pos.z - e.pos.z;
    if (dx * dx + dy * dy + dz * dz > 9) e.pos.set(pos.x, pos.y, pos.z);
    else { const k = Math.min(1, real * 16); e.pos.x += dx * k; e.pos.y += dy * k; e.pos.z += dz * k; }
    e.ch.face(pos.yaw);
    e.netDriver.apply(rec, rec.time, renderTime);
    applyRole(e, rec.role);
  } else {
    e.alive = alive;
  }
  e.netApplying = false;
}
