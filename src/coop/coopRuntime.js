// Local co-op at run time (workstream D1, Long Night 2): everything a second local player needs to
// be a whole player, not a guest on player 0's screen. Built once per run by game.js.
//
// Player 0 is the game's own hero, camera, HUD, gadgets and frame code, untouched: single-player
// runs exactly the code it always ran. Every other local player gets a "rig" of its own:
//   camera + follow rig        its split-screen view (src/coop/splitScreen.js)
//   HUD                        a whole HUD confined to its view: health, combo, chains, objective,
//                              cards, hints, sound words, glyphs, the objective marker, the gadget
//                              panel and wheel, the predator HUD, speed lines (src/coop/hudGroup.js
//                              mirrors the shared story parts into it)
//   gadgets                    its own gadget system (equipped gadget, wheel, cooldowns; unlocks are
//                              the story's), firing through its own fighter
//   grapple targeting          its own grapple point, marker and line
//   detective vision           its own, drawn only in its view
//   predator stealth           seen by the goons, can choke and perch-drop (stealth.addHero)
//   combat                     its own fighter (src/combat/combatSystem.js addPlayer)
// and the glue: revive (hold to revive, src/coop/revive.js), the tether (src/coop/tether.js),
// vehicles (one drives, the other rides or calls their own: src/coop/passenger.js), signature
// and team moves, the ping wheel and quick chat (src/coop/glue.js).
//
// Net seam (docs/design/coop-seams.md): nothing here assumes the partner is on this machine except
// the rig's view and input; world-changing calls go through the functions listed there.
import * as THREE from 'three';
import { createPlayer } from '../players/players.js';
import { createReviveRules } from '../players/coopRules.js';
import { createBotDriver } from '../players/bot.js';
import { createScriptedInput, createMergedInput, createGamepadSource } from '../core/input.js';
import { withPlayer } from '../core/events.js';
import { kitById, kitInfo } from '../heroes/roster.js';
import { prepareKit } from '../heroes/kitModels.js';
import { createFollowCamera } from '../game/camera.js';
import { createHud } from '../ui/hud.js';
import { createComicFx } from '../ui/comicFx.js';
import { createWaypoint } from '../ui/waypoint.js';
import { createGadgetHud } from '../ui/gadgetHud.js';
import { createGadgetWheel } from '../ui/gadgetWheel.js';
import { createStealthHud } from '../ui/stealthHud.js';
import { createGadgetSystem } from '../gadgets/gadgetSystem.js';
import { pickGrapplePoint } from '../world/grapple.js';
import { glyphCode } from '../stealth/brain.js';
import { edgeGlyph } from '../ui/edgeGlyph.js';
import { bindingLabel } from '../core/bindings.js';
import { createJoinFlow, KBM } from './joinFlow.js';
import { createTether } from './tether.js';
import { reviveView } from './revive.js';
import { createReviveRing } from '../ui/reviveRing.js';
import { rememberPick } from './coopSave.js';
import { createSeats } from './passenger.js';
import { createGlue, createInputFilter } from './glue.js';
// [net] Online co-op (workstream D2): a networked partner and the guest's replica rules.
import { isReplica } from '../net/mode.js';

const PLAYER_COLORS = [0x49b4ff, 0xf2d24b];

export function createCoop(d) {
  const {
    scene, camera, follow, ink, split, hud, hudRoot, settings, events, time, combat, players, p0, world, assets,
    makeHero, effects, fx, chainFx, swarmFx, gfx, breakables, progress, save, stealth, revive, input, state, getFlow,
  } = d;
  const joins = createJoinFlow({ max: 2 });
  const tether = createTether();
  const rings = createReviveRing(hud.all);
  const tmpV = new THREE.Vector3(), scr = { x: 0, y: 0, behind: false };
  let bot = null;
  // Vehicles for two (src/coop/passenger.js) and the glue (src/coop/glue.js).
  const seats = createSeats({ vehicles: d.vehicles, batwing: d.batwing, players, events, getFlow, follow0: follow });
  const glue = createGlue({ players, combat, events, hud, split, assets, time, getFlow, keyFor: (p, a) => d.keyFor(p, a), toScreenOf: (p) => d.toScreenOf(p) });
  // Player 0's frame context reads through a filter while a partner plays (the glue masks a press
  // it used); alone, player 0 reads its input directly, exactly as before.
  // A kit with signature moves of its own (anyone but the Bat family) plays them even alone.
  const ownMoves = (kit) => kitInfo(kit).signature.some((x) => !x.native);
  const glueOn = () => players.count > 1 || ownMoves(p0.kit);
  function filterP0(on) {
    if (!p0.ctx) return;
    on = on || ownMoves(p0.kit);
    if (on && !p0.ctx.input.mask) p0.ctx.input = createInputFilter(input);
    else if (!on && p0.ctx.input.mask) p0.ctx.input = input;
  }

  // ---- per-hero rules every hero follows (player 0 included): flight is not allowed where it
  // would skip play (a predator room, a running fight); the kit's health and toughness ----
  function applyKitRules(h) {
    const info = kitInfo(h.kit);
    h.canFly = () => !stealth.inRoom(h.pos) && !(combat.fighterFor(h)?.api.active ?? combat.active);
    h.toughness = info.stats?.toughness ?? 1;
    return info;
  }
  applyKitRules(p0.hero);
  // Toughness: a tougher kit gets part of every hit back (combat deals the base damage; workstream
  // I owns that maths, so the kit's number is applied here, after it, on the hurt hero only).
  events.on('heroHurt', (e) => {
    const h = (e.player ?? p0).hero;
    const k = h.toughness ?? 1;
    if (k === 1 || !(e.damage > 0) || h.dead) return;
    const back = Math.round(e.damage * (1 - 1 / k));
    if (back > 0) h.health = Math.min(h.maxHealth, h.health + back);
  });

  // ---- a partner's rig ----
  function makeRig(p) {
    const cam = new THREE.PerspectiveCamera(settings.fov, 1, camera.near, camera.far);
    const fol = createFollowCamera(cam, world.collision);
    fol.configure(settings);
    fol.snapBehind(p.hero.bat.yaw);
    const h = createHud(hudRoot);
    h.el.dataset.player = String(p.slot);
    tag(h.el, p.slot);
    const size = () => h.viewSize();
    const rig = {
      camera: cam, follow: fol, hud: h,
      comicFx: createComicFx(h.el, size),
      waypoint: createWaypoint(h.el, size),
      gadgetHud: createGadgetHud(h.el),
      wheelUi: createGadgetWheel(h.el),
      stealthHud: createStealthHud(h.el),
      marker: new THREE.Mesh(new THREE.OctahedronGeometry(0.4), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[p.slot] ?? 0xffffff })),
      grapple: { target: null, timer: 0 },
      detectiveOn: false, detective: 0, lastCombo: -1, promptKind: null, glyphIds: new Set(),
    };
    rig.marker.layers.set(1);
    scene.add(rig.marker);
    rig.inkView = ink.createView({ camera: cam });
    return rig;
  }
  function tag(el, slot) {
    if (el.querySelector('.player-tag')) return;
    const t = document.createElement('div');
    t.className = 'player-tag';
    t.textContent = `P${slot + 1}`;
    el.appendChild(t);
  }
  tag(hud.primary.el, 0);
  hud.primary.el.dataset.player = '0';

  // ---- adding and removing a local player ----
  // input: an input source (src/core/input.js). kit: a kit object (already prepared).
  function addLocalPlayer({ kitId = 'f', kit = null, mode = 'pad', inputSrc = null } = {}) {
    if (players.count > 1) return players.list[1];
    kit = kit ?? kitById(kitId);
    const h = makeHero(kit);
    h.tuning = effects;
    applyKitRules(h);
    const a = p0.hero.bat.yaw + Math.PI * 0.6;
    h.teleport({ x: p0.hero.pos.x + Math.sin(a) * 1.8, y: p0.hero.pos.y, z: p0.hero.pos.z + Math.cos(a) * 1.8 }, p0.hero.bat.yaw);
    // Dev ?p2=1: player 0 keeps pad 0 (and the keyboard), player 1 gets pad 1.
    if (!inputSrc && mode !== 'bot') input.setPad(0);
    const in2 = inputSrc ?? (mode === 'bot' ? createScriptedInput() : createMergedInput({ pad: createGamepadSource({ index: 1 }) }));
    const p = createPlayer({ id: 1, slot: 1, kit, hero: h, input: in2 });
    p.local = true;
    p.rig = makeRig(p);
    p.view = { follow: p.rig.follow, camera: p.rig.camera };
    p.hudSlot = p.rig.hud.slot(0);
    p.lastCombo = -1;
    p.ctx = { input: createInputFilter(in2), cam: p.rig.follow, grappleTarget: null, fx, chainFx, swarmFx, lockInput: false };
    // Hooks combat's fighter reads at creation: this player's own gadgets and stealth takedowns.
    p.useGadget = (ctx, o) => p.gadgets?.fire(ctx, o) ?? false;
    p.stealthStart = (action) => stealth.startFor(h, action);
    p.stealthHold = (action, target) => stealth.hold(action, target);
    players.add(p);
    p.fighter = combat.addPlayer(p);
    stealth.addHero(h, p.fighter.api);
    // A gadget save of its own: the equipped gadget is this player's, unlocks are the story's.
    const gsave = { equipped: progress.gadgets.equipped, unlocked: progress.gadgets.unlocked, wheelUsed: true };
    p.gadgets = createGadgetSystem({
      hero: h, combat: p.fighter.api, follow: p.rig.follow, time, events, input: in2, fx, gfx, breakables, camera: p.rig.camera, effects,
      progress: { ...progress, gadgets: gsave }, wheelUi: p.rig.wheelUi, gadgetHud: p.rig.gadgetHud, stealth,
      collision: world.collision, save: () => {}, getBindings: () => settings.bindings,
      isPlaying: () => getFlow().mode === 'play' && !state.paused, devAll: d.devAll, player: p, secondary: true,
    });
    hud.attach(p, p.rig.hud);
    split.add(p, { camera: p.rig.camera, follow: p.rig.follow, inkView: p.rig.inkView, hud: p.rig.hud, extras: [p.rig.comicFx] });
    // Player 0's view gets the same treatment (its own panel); it was added at run start.
    p.hudSlot.setHealth(h.health / h.maxHealth);
    if (mode === 'bot') bot = createBotDriver({ player: p, partner: p0, combat, cam: p.rig.follow });
    filterP0(true);
    d.onPlayersChanged?.();
    events.emit('playerJoined', withPlayer({ slot: p.slot, kit: kit.id }, p));
    return p;
  }

  function removeLocalPlayer(p) {
    if (!p || p === p0 || !players.list.includes(p)) return false;
    events.emit('playerLeft', withPlayer({ slot: p.slot }, p));
    // Anything it holds lets go: a gadget in flight, a vehicle seat, a downed state.
    p.gadgets?.interrupt?.();
    p.gadgets?.dispose?.();
    seats.leave(p);
    // Driving or flying: the vehicle stops with them, and player 0 drives next.
    if (d.vehicles.driver === p.hero) { if (d.vehicles.active) d.vehicles.exit(); d.vehicles.setDriver({ hero: p0.hero, input, follow }); }
    if (d.batwing.pilot === p.hero) { if (d.batwing.active) d.batwing.exit(); d.batwing.setPilot({ hero: p0.hero, follow }); }
    d.onPlayerLeaving?.(p);
    revive.clear();
    combat.removePlayer(p);
    stealth.removeHero(p.hero);
    players.remove(p);
    split.remove(p);
    hud.detach(p);
    const h = p.hero;
    for (const o of [h.bat.root, h.cape.mesh, h.cable, p.rig.marker]) scene.remove(o);
    p.rig.hud.el.remove();
    if (bot && players.count < 2) bot = null;
    joins.leave(p.slot);
    input.setKbm(true);
    input.setPad('first');
    filterP0(false);
    d.onPlayersChanged?.();
    return true;
  }

  // [net] A networked partner (workstream D2, docs/design/coop-seams.md): the same player record,
  // fighter, stealth watcher and glue membership as a local partner, without a rig (no view, no
  // HUD of its own: a partner panel on this machine's HUD). Its hero is a puppet the net layer
  // poses from the wire every frame (never hero.update here: its owner simulates it); its input is
  // the remote source (src/core/input.js createRemoteInput) fed with the held actions it sends.
  function addRemotePlayer({ kit, input: in2, id = 1, slot = 1 }) {
    if (players.count > 1) return players.list[1];
    const h = makeHero(kit);
    h.tuning = effects;
    applyKitRules(h);
    h.teleport({ x: p0.hero.pos.x + 1.8, y: p0.hero.pos.y, z: p0.hero.pos.z }, p0.hero.bat.yaw);
    const p = createPlayer({ id, slot, local: false, kit, hero: h, input: in2 });
    p.remote = true;
    p.lastCombo = -1;
    p.ctx = { input: in2, cam: follow, grappleTarget: null, fx, chainFx, swarmFx, lockInput: true };
    players.add(p);
    p.fighter = combat.addPlayer(p);
    stealth.addHero(h, p.fighter.api);
    p.hudSlot = hud.primary.addSlot(slot);
    p.hudSlot?.setHealth(1);
    // Hints, flashes and cards about the partner's own play show on its own machine, not here.
    hud.attach(p, silentHud());
    filterP0(true);
    d.onPlayersChanged?.();
    events.emit('playerJoined', withPlayer({ slot: p.slot, kit: kit.id }, p));
    return p;
  }
  // A HUD that shows nothing (a networked partner's: its own machine draws its HUD).
  function silentHud() {
    const el = document.createElement('div');
    const size = { w: 1, h: 1 };
    return new Proxy({ el, viewSize: () => size, primary: null }, { get: (t, k) => (k in t ? t[k] : () => undefined) });
  }
  function removeRemotePlayer(p) {
    if (!p || p === p0 || !players.list.includes(p)) return false;
    events.emit('playerLeft', withPlayer({ slot: p.slot }, p));
    seats.leave(p);
    if (d.vehicles.driver === p.hero) { if (d.vehicles.active) d.vehicles.exit(); d.vehicles.setDriver({ hero: p0.hero, input, follow }); }
    revive.clear();
    combat.removePlayer(p);
    stealth.removeHero(p.hero);
    players.remove(p);
    hud.primary.removeSlot(p.slot);
    hud.detach(p);
    for (const o of [p.hero.bat.root, p.hero.cape.mesh, p.hero.cable]) scene.remove(o);
    filterP0(false);
    d.onPlayersChanged?.();
    return true;
  }

  // Join with a device (after the hero select). device: 'kbm' or a pad index.
  async function join(kitId, device, connectedPads = []) {
    const kit = kitById(kitId);
    await prepareKit(kit, assets);
    const a = joins.commit(device, connectedPads);
    // Player 0 hands over what the joiner took (src/coop/joinFlow.js).
    input.setKbm(a[0].kbm);
    input.setPad(a[0].pad);
    const src = createMergedInput({ kbm: a[1].kbm ? input.kbm : null, pad: a[1].pad === null ? null : createGamepadSource({ index: a[1].pad }) });
    if (!a[1].kbm) src.setKbm(false);
    const p = addLocalPlayer({ kit, inputSrc: src });
    rememberPick(progress, 1, kit.id);
    save();
    return p;
  }

  // A pad came back for a waiting player: point its input at the new index.
  function reassign(slot, padIndex) {
    const p = players.list[slot];
    if (!p) return;
    if (slot === 0) input.setPad(padIndex);
    else p.input.setPad?.(padIndex);
  }

  // ---- per frame ----
  const eye = new THREE.Vector3(), camDir = new THREE.Vector3(), toPt = new THREE.Vector3();
  const ledgePoints = world.grapplePoints.filter((g) => !g.perch).map((g) => ({ ...g, y: g.y - 0.1, ledge: true }));
  const visibleOpts = {
    visible: (g) => {
      toPt.set(g.x + (g.nx ?? 0) * 0.4 - eye.x, g.y + 0.3 - eye.y, g.z + (g.nz ?? 0) * 0.4 - eye.z);
      const dd = toPt.length();
      const hit = world.collision.raycast(eye, toPt.divideScalar(dd), dd);
      return !hit || hit.t > dd - 1.2;
    },
  };
  function pickGrapple(p, real) {
    const g = p.rig.grapple, h = p.hero;
    g.timer -= real;
    if (g.timer > 0) return;
    g.timer = 0.1;
    if (h.control || h.dead) { g.target = null; g.pull = null; return; }
    p.rig.follow.lookDir(camDir);
    eye.copy(h.pos); eye.y += 1.6;
    // [move] The grapple's range tier and the grapple pull (src/traversal/movesRuntime.js).
    visibleOpts.maxDist = h.moves?.grappleRange ?? 52;
    g.pull = d.moves?.pickPull(h, combat.enemies, eye, camDir) ?? null;
    g.target = pickGrapplePoint(p.input.down('back') ? ledgePoints : world.grapplePoints, p.rig.camera.position, camDir, h.pos, visibleOpts);
  }
  const partners = () => players.list.length > 1 ? players.list.slice(1) : NONE;
  const NONE = [];

  // Before combat: each partner's own toggles, grapple target and gadgets (player 0's are game.js's).
  function beforeCombat(real, dt) {
    // Partners' inputs first (player 0's was read in step()); the dev bot decides before its input.
    if (bot) bot.update(real);
    for (const p of partners()) if (!p.remote) p.input.update(real);
    if (glueOn()) glue.preUpdate(real, dt);
    if (players.count > 1 && !isReplica()) {
      // Vehicle and Batwing keys from anyone the vehicle code is not already listening to.
      for (const p of players.list) {
        if (p.hero.dead) continue;
        if (p.hero !== d.vehicles.driver && p.input.pressed('vehicle')) seats.vehicleKey(p);
        if (p !== p0 && p.input.pressed('batwing')) seats.batwingKey(p);
      }
    }
    for (const p of partners()) {
      if (!p.rig) continue;
      const h = p.hero, ctx = p.ctx;
      // [onboard] the partner's cowl filter follows the campaign's ability gates (and a scripted lock).
      if (p.hero.abilities && !p.hero.abilities.has('detective')) p.rig.detectiveOn = false;
      else if (p.input.pressed('detective') && !globalThis.__game?.sandbox?.radio?.ownsKey(p)) p.rig.detectiveOn = !p.rig.detectiveOn; // [sandbox] the driver's key tunes the radio
      pickGrapple(p, real);
      const busy = combat.enemies.some((e) => e.alive && e.aware && !e.room && e.pos.distanceTo(h.pos) < 12 && Math.abs(e.pos.y - h.pos.y) < 4);
      // Beside a downed partner the grapple button is the revive: no zipping away mid-revive.
      ctx.grappleTarget = busy || reviveNear(p) ? null : p.rig.grapple.target;
      ctx.pullTarget = reviveNear(p) ? null : p.rig.grapple.pull ?? null; // [move]
      p.gadgets.update(real, dt, ctx);
    }
  }

  // A downed partner within revive reach of this player.
  function reviveNear(p) {
    if (players.count < 2) return false;
    for (const o of players.list) if (o !== p && o.hero.dead && revive.isDown(o.id) && Math.hypot(o.hero.pos.x - p.hero.pos.x, o.hero.pos.z - p.hero.pos.z) <= revive.options.radius + 0.4) return true;
    return false;
  }
  d.reviveNear = reviveNear;

  // After combat: partners' heroes, revives, the tether.
  const reviveList = [];
  function afterCombat(real, dt) {
    seats.update();
    for (const p of partners()) {
      const h = p.hero;
      // [net] A networked partner's hero is posed by the net layer (src/net/game/puppets.js).
      if (p.remote) { p.puppet?.update(real, dt); h.updateCape(time.dtFor(h, dt)); p.hudSlot?.setHealth(h.health / h.maxHealth); continue; }
      h.update(time.dtFor(h, dt), p.ctx);
      if (world.belowWater(h.pos)) { h.teleport(h.lastSafe); events.emit('splash', withPlayer({}, p)); }
      h.updateCape(time.dtFor(h, dt));
      const f = p.fighter;
      if (f.combo.value !== p.lastCombo) { p.lastCombo = f.combo.value; p.hudSlot.setCombo(p.lastCombo, f.combo.readyAt); }
      p.hudSlot.setChains(f.chains, d.chainLabels());
      if (p.rig) p.rig.gadgetHud.setSwarm(f.swarm, d.swarmLabel());
    }
    if (players.count < 2) return;
    // [net] A guest's revives and tether are the host's to decide (it says so on the wire).
    if (isReplica()) { for (const p of players.list) if (p.hero.dead && revive.isDown(p.id)) p.hudSlot?.setDown(revive.state(p.id).progress); return; }
    // Downed and revive: hold the grapple button beside a downed partner (the ring fills).
    reviveView(players.list, reviveList, (p) => !p.hero.dead && !!p.hero.control && !p.hero.control.combat && !p.hero.control.revive);
    for (const r of revive.update(real, reviveList)) {
      const p = players.byId(r.id);
      if (r.type === 'revived') {
        const h = p.hero;
        h.dead = false;
        h.health = Math.round(h.maxHealth * revive.options.health);
        h.control = null;
        h.invulnerable = 2;
        h.bat.animator.play('LayToIdle', { once: true, timeScale: 1.4, fade: 0.1 });
        p.hudSlot?.setDown(null);
        p.hudSlot?.setHealth(h.health / h.maxHealth);
        events.emit('playerRevived', withPlayer({ by: players.byId(r.by) }, p));
        events.emit('word', { text: 'BACK UP!', pos: h.pos.clone().setY(h.pos.y + 2.2), big: true });
      } else if (r.type === 'expired') {
        // Nobody got there in time: the team goes back to the checkpoint, as after a death.
        events.emit('heroDown', withPlayer({}, p));
      }
    }
    for (const p of players.list) if (p.hero.dead && revive.isDown(p.id)) p.hudSlot?.setDown(revive.state(p.id).progress);
    updateTether(real);
  }

  // ---- the tether: never let the team split so far that a story beat strands one of them ----
  function updateTether(real) {
    const flow = getFlow();
    const step = flow.objectives.step;
    const mission = !!step && step.type !== 'credits' && flow.mode === 'play' && !seats.together();
    const [a, b] = players.list;
    const r = tether.update(real, { mission, dist: Math.hypot(a.hero.pos.x - b.hero.pos.x, a.hero.pos.z - b.hero.pos.z), dy: Math.abs(a.hero.pos.y - b.hero.pos.y), anyDown: a.hero.dead || b.hero.dead });
    if (r.warn) for (const h of hud.all()) h.hint(`Regroup! You are ${Math.round(r.dist)} m apart. ${r.left > 0 ? `Pulling you together in ${Math.ceil(r.left)} s` : ''} (Pause menu: Regroup)`, 1200);
    if (r.regroup) regroup();
  }
  // The player farther from the objective (or player 1) is brought to the other.
  function regroup() {
    if (players.count < 2) return;
    const flow = getFlow();
    const t = flow.target;
    const [a, b] = players.list;
    const da = t ? Math.hypot(a.hero.pos.x - t.x, a.hero.pos.z - t.z) : 0, db = t ? Math.hypot(b.hero.pos.x - t.x, b.hero.pos.z - t.z) : 1;
    const [stay, go] = (da <= db && !a.hero.dead) || b.hero.dead ? [a, b] : [b, a];
    if (go.hero.dead) return;
    d.onPlacePartner?.(go);
    const yaw = stay.hero.bat.yaw + Math.PI * 0.6;
    const x = stay.hero.pos.x + Math.sin(yaw) * 1.8, z = stay.hero.pos.z + Math.cos(yaw) * 1.8;
    const gy = world.collision.groundBelow(x, stay.hero.pos.y + 1.5, z, 0.3);
    const ok = gy > -Infinity && Math.abs(gy - stay.hero.pos.y) < 1.5;
    go.hero.teleport({ x: ok ? x : stay.hero.pos.x, y: ok ? gy : stay.hero.pos.y, z: ok ? z : stay.hero.pos.z }, stay.hero.bat.yaw);
    (go === p0 ? follow : go.rig?.follow)?.snapBehind(stay.hero.bat.yaw);
    tether.reset();
    events.emit('regroup', withPlayer({}, go));
  }

  // Late: each partner's camera and everything drawn in its view.
  function lateUpdate(real, dt, { playing, toScreenOf }) {
    for (const p of partners()) {
      const r = p.rig;
      if (!r) continue;
      const h = p.hero;
      const g = p.gadgets;
      r.follow.update(real, g.cameraFocus ?? h.pos, g.wheelOpen ? NO_LOOK : p.input.look, g.cameraMode ?? p.fighter.cameraMode ?? h.cameraMode(), h.speed);
      r.comicFx.update(real, playing ? { speed: h.control?.speed ?? Math.hypot(h.vel.x, h.vel.y, h.vel.z), actionActive: r.follow.actionActive } : NO_FX);
      r.marker.visible = playing && !!p.ctx.grappleTarget && !h.control;
      if (r.marker.visible) { r.marker.position.set(p.ctx.grappleTarget.x, p.ctx.grappleTarget.y + 1, p.ctx.grappleTarget.z); r.marker.rotation.y += real * 3; }
      r.detective += ((r.detectiveOn && playing ? 1 : 0) - r.detective) * Math.min(1, real * 6);
      const v = split.viewOf(p);
      if (v) v.overrides.detective = r.detective;
      // The objective marker in this view (flow decides what it points at).
      const flow = getFlow();
      const mt = flow.markerTarget;
      const near = mt && Math.hypot(h.pos.x - mt.x, h.pos.z - mt.z) < 7 && Math.abs(h.pos.y - mt.y) < 5;
      r.waypoint.update(playing && split.split && !near ? mt : null, r.camera, h.pos);
      if (!playing) continue;
      // Counter glyphs over the goons going after this player.
      glyphsFor(p, r.hud, r.camera, toScreenOf(p), r.glyphIds);
      // Predator HUD: awareness rings, the armed counter, this player's takedown prompt, crouch.
      const room = stealth.active ? stealth.goons : null;
      if (room) {
        for (let i = 0; i < room.length; i++) {
          const gg = room[i], code = gg.e.alive ? glyphCode(gg.mind) : 0;
          if (!code) { r.stealthHud.glyph(i, 0, 0, false, 0); continue; }
          const s = toScreenOf(p)(gg.e.ch.headWorld(tmpV, 0.75));
          r.stealthHud.glyph(i, s.x, s.y, !s.behind, code);
        }
      }
      r.stealthHud.hideFrom(room ? room.length : 0);
      r.stealthHud.armed(stealth.armed(), !!room && r.detectiveOn);
      r.stealthHud.crouch(!!h.crouched);
      const pk = stealth.promptOf(h);
      if (pk !== r.promptKind) {
        r.promptKind = pk;
        r.stealthHud.prompt(pk === 'silent' ? `${d.keyFor(p, 'punch')} Silent takedown` : pk === 'perch' ? `${d.keyFor(p, 'kick')} Perch drop` : null);
      }
    }
    // Revive rings over downed heroes, in every view.
    rings.update(players.list, revive, split, toScreenOf, d.keyFor);
    if (glueOn()) glue.lateUpdate(real);
  }
  const NO_LOOK = { dx: 0, dy: 0 };
  const NO_FX = { speed: 0, actionActive: false };

  // Counter glyphs in one view: only the goons whose attack is aimed at this view's player.
  function glyphsFor(p, h, cam, toScreen, ids) {
    ids.clear();
    const f = p.fighter;
    const sz = h.viewSize();
    for (const e of combat.enemies) {
      ids.add(e.id);
      const mine = !e.aggro || e.aggro === f;
      const show = mine && !!e.glyph && (e.state === 'windup' || e.state === 'throw');
      if (show) {
        const s = toScreen(e.ch.headWorld(tmpV, 0.45));
        const gl = edgeGlyph(s.x, s.y, s.behind, sz.w, sz.h, 56, 84);
        h.glyph(e.id, gl.x, gl.y, true, e.glyph, gl.edge ? gl.angle : null);
      } else h.glyph(e.id, 0, 0, false);
    }
    h.pruneGlyphs(ids);
  }

  filterP0(false);
  return {
    joins, tether, addLocalPlayer, removeLocalPlayer, join, reassign, regroup,
    addRemotePlayer, removeRemotePlayer,
    beforeCombat, afterCombat, lateUpdate, glyphsFor,
    get bot() { return bot; },
    partners,
    // Whether a hero is riding in or driving a vehicle (flow's onFoot check asks per hero).
    mounted: (h) => seats.isMounted(h),
    seats, glue,
    // Player 0's Batwing key in co-op (true: handled here).
    batwingKey: (p) => seats.batwingKey(p),
    keyLabel: (p, action) => d.keyFor(p, action),
    applyKitRules,
    get kbmPlayer() { return players.list.find((p) => p.input.hasKbm) ?? null; },
    KBM,
  };
}
