// Online co-op in the game (workstream D2): the lobby, the session's life, and the wiring of the
// replicators into a run. Loaded on demand (game.js imports it only when someone picks "Host
// online game", "Join with code" or the pause menu's invite), so single-player never downloads it.
//
//   const net = createNetController(H)   H: game.js's hooks (see game.js "[net]" blocks)
//   net.openHost() / net.openJoin() / net.inviteFromRun()
//   net.pre(real, dt) / net.post(real)   once a frame from game.update
//
// Roles: the host's run is the world; the guest's run is a replica (src/net/mode.js). Players on
// the wire are by net slot: the host's hero is 0, the guest's is 1 (on the guest's own machine its
// hero is still player 0, the host's is player 1: p.netSlot says which is which).
import { setNetRole, netMode } from '../mode.js';
import { BUILD, PROTO, makeRoomCode, normalizeCode, cleanText, LIMITS } from '../protocol.js';
import { createHostSession, createGuestSession } from '../session.js';
import { createHostReplicator } from '../replication/host.js';
import { createGuestReplicator } from '../replication/guest.js';
import { createBroadcastSignaller, createTrysteroSignaller, manualHost, manualJoin, REASONS } from '../signal/signallers.js';
import { broadcastAvailable } from '../transport/broadcast.js';
import { webrtcAvailable, stunPrecheck } from '../transport/webrtc.js';
import { createHostAdapter } from './hostAdapter.js';
import { createGuestAdapter } from './guestAdapter.js';
import { createHeroPuppet, readEnemy } from './puppets.js';
import { hash32 } from '../codec/binary.js';
import { isNetEnemyId } from '../codec/snapshot.js';
import { guestStorage } from '../netSave.js';
import { showHostPanel, showJoinPanel, countdown, createBadge, createAwayOverlay, toast, messageFor } from '../ui/netUi.js';
import { STEPS } from '../../game/story.js';
import { KITS, HEROES, isKitId, kitById } from '../../heroes/roster.js';
import { ENEMY } from '../../combat/rules.js';
import { createRemoteInput } from '../../core/input.js';
// [net2] wave 3: the campaign's nights in the content hash, the content seams, stealth rings.
import { allNights, stepsOf } from '../../story/campaign.js';
import { net as seams } from '../share.js';
import { createContentHost, createContentGuest } from './contentNet.js';
import { glyphCode } from '../../stealth/brain.js';
import * as THREE from 'three';

// Game content both peers must share (the roster, the story, the enemy table): a mismatch is a
// different build even when the protocol number agrees.
export const CONTENT = (() => {
  // [net2] every night's step ids too: a guest without the host's nights could not follow it.
  const nights = allNights().map((n) => `${n.id}:${stepsOf(n).map((x) => x.id).join(',')}`).join(';');
  const s = [PROTO, STEPS.map((x) => x.id).join(','), KITS.map((k) => k.id).join(','), HEROES.map((h) => h.id).join(','), Object.keys(ENEMY).join(','), nights].join('|');
  return hash32(s).toString(16);
})();

const MSG_KEY = 'gotham-net-msg';
const SCENE_WAIT_MS = 90000;

export function createNetController(H) {
  const modes = [];
  if (webrtcAvailable()) modes.push(['trystero', 'Room code'], ['manual', 'Paste codes']);
  if (broadcastAvailable()) modes.push(['broadcast', 'Same PC (two tabs)']);
  const wanted = H.params.get('net');
  let mode = modes.some(([m]) => m === wanted) ? wanted : modes[0]?.[0] ?? 'broadcast';
  let session = null, role = null, ui = null, signaller = null;
  let rep = null, adapter = null, remote = null, badge = null, away = null;
  let lobby = null; // { mine: { kit, ready }, theirs: { kit, ready, name } }
  let runStarted = false, starting = false;
  let stopCount = null, manualLink = null;
  const sceneWaits = new Map(); // step index -> resolve
  const scenesDone = new Set();
  let hiddenT = null, hostAwayOn = false, pausedByHost = false, showPing = true;
  let content = null; // [net2] the content seams on the wire (contentNet.js)
  // [net2] The predator room's awareness rings for a guest: a host state blob (the net layer uses
  // its own seam): each room goon's id and glyph code (src/stealth/brain.js), the armed count.
  let stealthView = null;
  seams.registerState('net.stealth', {
    hz: 8,
    snapshot: () => {
      const st = H.getGame()?.stealth;
      if (!st?.active) return null;
      return { ids: st.goons.map((x) => x.e.id), c: st.goons.map((x) => (x.e.alive ? glyphCode(x.mind) : 0)), armed: st.armed() };
    },
    apply: (v) => { stealthView = v && Array.isArray(v.ids) && Array.isArray(v.c) ? v : null; },
  });
  try { showPing = localStorage.getItem('gotham-net-ping') !== '0'; } catch { /* default on */ }
  const name = (s) => cleanText(s, LIMITS.maxName);

  // ---------------------------------------------------------------- signallers
  function makeSignaller(m) {
    if (m === 'link' && directLink) return linkSignaller(directLink);
    if (m === 'broadcast') return createBroadcastSignaller();
    if (m === 'manual') return createManualSignaller();
    return createTrysteroSignaller();
  }
  // The manual exchange behind the signaller interface: the host's offer code is shown, the
  // guest's answer pasted; a lapsed answer makes a fresh offer.
  function createManualSignaller() {
    let pending = null;
    return {
      kind: 'manual',
      async host() {
        for (;;) {
          const o = await manualHost();
          manualLink = o;
          ui?.setOffer(o.code);
          const link = await new Promise((resolve) => { pending = { o, resolve }; });
          if (link) return link;
        }
      },
      async join() { throw new Error('manual-join'); },
      // The host pasted an answer: apply it and wait for the link (or regenerate on a lapse).
      async answer(code) {
        const p = pending;
        if (!p) return;
        try { await p.o.accept(code); } catch { ui?.setStatus(messageFor('bad-code'), true); return; }
        ui?.setStatus('Linking…');
        const t = setTimeout(() => { if (!p.o.link.open) { ui?.setStatus('That answer arrived too late. Here is a fresh code: send it and try again.', true); p.o.close(); pending = null; p.resolve(null); } }, 15000);
        p.o.link.on('open', () => { clearTimeout(t); pending = null; p.resolve(p.o.link); });
      },
      regenerate() { const p = pending; if (p) { p.o.close(); pending = null; p.resolve(null); } },
      close() { pending?.o.close(); pending = null; },
    };
  }

  // A link made elsewhere (the real-WebRTC e2e test relays the offer and answer itself): handed
  // out once, then never again (a reconnect needs a new one).
  let directLink = null;
  function linkSignaller(link) {
    let used = false;
    const once = () => { if (used) return new Promise(() => {}); used = true; return link.open ? Promise.resolve(link) : new Promise((res) => link.on('open', () => res(link))); };
    return { kind: 'link', host: once, join: once, close() {} };
  }

  // ---------------------------------------------------------------- host
  function openHost({ fromRun = false } = {}) {
    if (session) return;
    role = 'host';
    const code = makeRoomCode(rand);
    const start = () => {
      signaller = makeSignaller(mode);
      session = createHostSession({ signaller, code, hello: { build: BUILD, content: CONTENT, kit: H.hostKit(), name: 'Player 1' }, getWelcome });
      wireSession();
      session.start();
    };
    ui = showHostPanel({
      code, modes, mode,
      onMode: (m) => { mode = m; if (session) { session.close('restart'); session = null; } start(); },
      onCancel: () => { closePanel(); end('closed', { quiet: true }); },
      onManualAnswer: (a) => signaller?.answer?.(a),
      onRegenerate: () => signaller?.regenerate?.(),
    });
    ui.layer.dataset.code = code;
    ui.setStatus(fromRun ? 'Waiting for Player 2. Keep playing: they join where you are.' : 'Waiting for Player 2…');
    if (fromRun) { const b = document.createElement('button'); b.className = 'mbtn small'; b.textContent = 'Keep playing'; b.onclick = () => { ui.layer.style.display = 'none'; H.resume?.(); }; ui.layer.querySelector('.net-panel .net-row:last-child')?.appendChild(b); }
    start();
    if (mode === 'trystero') stunPrecheck().then((r) => { if (r === 'blocked' && ui && !session?.connected) ui.setStatus('Warning: this network seems to block direct links. A friend may not be able to connect; try Paste codes or another network.', true); });
  }

  function getWelcome() {
    const g = H.getGame();
    if (!g || !runStarted) return { phase: 'lobby', hostKit: H.hostKit(), step: H.getProgress()?.step ?? 0 };
    // A guest's run asking for the world (first time, late join, reconnect): every live enemy,
    // the story step, the items taken, where to stand.
    adapter?.markAllKnown?.();
    const enemies = [];
    const r = {};
    const list = [...g.combat.enemies];
    if (g.boss?.joker?.ch.root.visible && !list.includes(g.boss.joker)) list.push(g.boss.joker);
    for (const b of adapter?.bodies?.() ?? []) if (!list.includes(b)) list.push(b); // [net2] a framework boss on stage
    for (const e of list) {
      if (!isNetEnemyId(e.id ?? '') || (e.id === 'joker' && !e.ch.root.visible)) continue;
      readEnemy(e, r);
      enemies.push({ id: e.id, type: e.type, pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z }, yaw: e.ch.yaw, hp: e.health, alive: e.alive });
    }
    const h = g.hero;
    const a = h.bat.yaw + Math.PI * 0.6;
    rep?.setReady(true);
    return {
      phase: 'run', hostKit: H.hostKit(), step: g.flow.stepIndex, stepId: g.flow.objectives.step?.id ?? null, enemies,
      // [net2] the campaign position, the world's clock and weather, the content seams' state
      night: g.flow.story?.night?.id ?? 'n1', env: adapter?.world?.() ?? null, states: content?.welcome() ?? {},
      pickups: g.takenPickups?.() ?? [],
      t: H.getWorldTime(), at: performance.now(),
      spawn: { pos: { x: h.pos.x + Math.sin(a) * 1.8, y: h.pos.y, z: h.pos.z + Math.cos(a) * 1.8 }, yaw: h.bat.yaw },
    };
  }

  // ---------------------------------------------------------------- guest
  function openJoin(initialCode = '') {
    if (session) return;
    role = 'guest';
    ui = showJoinPanel({
      modes, mode, initialCode,
      onCancel: () => { closePanel(); end('closed', { quiet: true }); },
      onJoin: (raw, m) => {
        const code = normalizeCode(raw);
        if (!code) { ui.setStatus('A room code is six letters and numbers.', true); return; }
        mode = m;
        if (session) { session.close('restart'); session = null; }
        signaller = makeSignaller(mode === 'manual' ? 'trystero' : mode);
        joinWith(code, signaller);
      },
      onManualOffer: async (offer) => {
        try {
          const a = await manualJoin(offer);
          ui.setAnswer(a.code);
          stopCount?.();
          stopCount = countdown((n) => ui?.setCountdown(n), () => ui?.setStatus('If it did not link, ask your friend for a fresh code.', true));
          const sig = { kind: 'manual', join: () => new Promise((resolve, reject) => { if (a.link.open) resolve(a.link); a.link.on('open', () => resolve(a.link)); a.link.on('close', (r) => reject(new Error(r === 'ice-failed' ? REASONS.ice : 'closed'))); }), close() {} };
          joinWith('MANUAL', sig);
        } catch (e) { ui.setStatus(messageFor(e?.message === 'bad-code' ? 'bad-code' : 'error'), true); }
      },
    });
  }

  function joinWith(code, sig) {
    ui?.setStatus('Connecting…');
    session = createGuestSession({ signaller: sig, code, hello: { build: BUILD, content: CONTENT, kit: H.lastKit(1) ?? 'robin', name: 'Player 2' }, storage: sessionStore() });
    wireSession();
    session.start();
  }

  // ---------------------------------------------------------------- session events (both)
  function wireSession() {
    const s = session;
    s.on('status', ({ state, detail }) => {
      if (s !== session) return;
      if (ui && !runStarted) {
        const words = { connecting: 'Connecting…', handshake: 'Saying hello…', waiting: role === 'host' ? 'Waiting for Player 2…' : 'Waiting…', reconnecting: 'Connection lost. Reconnecting…', away: 'Player 2 went quiet…', connected: 'Connected!' };
        if (words[state]) ui.setStatus(words[state]);
      }
      if (state === 'reconnecting') { toast(role === 'host' ? 'Player 2 lost the connection. Holding their place for a minute…' : 'Connection lost. Reconnecting…', 4000); if (remote) remote.away = true; }
      updateBadge();
      void detail;
    });
    s.on('signal', (st) => { if (ui && !runStarted && st?.state) ui.setStatus({ loading: 'Loading matchmaking…', signalling: 'Reaching matchmaking…', searching: 'Looking for that game…', connecting: 'Found it. Linking…', waiting: 'Waiting for Player 2…' }[st.state] ?? ''); });
    s.on('error', ({ reason }) => { if (s === session) ui?.setStatus(messageFor(reason), true); });
    s.on('ended', ({ reason }) => { if (s === session) end(reason); });
    s.on('peerAway', (on) => { if (remote) remote.away = on && role === 'host' ? true : remote.away && on; updateBadge(); });
    s.on('hostAway', (on) => onHostAway(on));
    s.on('state', (d) => rep?.onState(d));
    s.on('message', (m) => onMessage(m));
    if (role === 'host') {
      s.on('guest', ({ rejoin, kit, name: n }) => {
        if (rejoin && runStarted) { if (remote) remote.away = false; toast('Player 2 is back.', 2500); return; }
        // Already playing (an invite from the pause menu): the host's hero is the one in the run.
        const playing = H.inRun();
        lobby = { mine: { kit: H.hostKit(), ready: playing }, theirs: { kit: isKitId(kit) ? kit : 'robin', ready: false, name: name(n) || 'Player 2' } };
        if (playing) { ui?.setStatus('Player 2 connected: they are picking a hero.'); return; }
        closePanel();
        H.showLobby({ mine: lobby.mine.kit, theirs: lobby.theirs, onLocal: onLocalPick, onDone: () => {}, onCancel: () => end('closed', { quiet: true }) });
      });
      s.on('guestLost', () => { rep?.setReady(false); if (remote) remote.away = true; });
      s.on('guestLeft', ({ reason }) => {
        rep?.setReady(false);
        if (remote) { detachRun(); toast(reason === 'timeout' ? 'Player 2 could not reconnect and has left.' : 'Player 2 left the game.'); }
        if (!runStarted) { H.closeLobby?.(); end('closed', { quiet: true }); H.showTitle(); }
      });
    } else {
      s.on('welcome', ({ state, host }) => onWelcome(state, host));
    }
  }

  function onMessage(m) {
    if (m.t === 'lobby') {
      const d = m.data ?? {};
      if (!lobby) return;
      lobby.theirs.kit = isKitId(d.kit) ? d.kit : lobby.theirs.kit;
      lobby.theirs.ready = !!d.ready;
      H.lobbyRemote?.({ kit: lobby.theirs.kit, ready: lobby.theirs.ready, label: lobby.theirs.name });
      maybeStart();
      return;
    }
    if (m.t === 'start' && role === 'guest') { startGuestRun(m); return; }
    if (m.t === 'kick') { end('kicked'); return; }
    if (m.t === 'sceneDone' && role === 'host') { scenesDone.add(m.index); const r = sceneWaits.get(m.index); if (r) { sceneWaits.delete(m.index); r(); } return; }
    if (m.t === 'ev' && m.name === 'timing' && role === 'host') { rep?.setTiming({ delay: num(m.data?.delay), rttMs: num(m.data?.rtt) }); return; }
    if (m.t === 'req' && role === 'host') { onRequest(m); return; }
    if (m.t === 'ev' && m.name === 'clock' && role === 'guest') { syncWorldTime(m.data); return; }
    rep?.onMessage(m);
  }

  // ---------------------------------------------------------------- lobby
  function onLocalPick({ kit, ready }) {
    if (!lobby) return;
    lobby.mine = { kit, ready };
    session?.send({ t: 'lobby', data: { kit, ready } });
    maybeStart();
  }
  function maybeStart() {
    if (role !== 'host' || starting || !lobby) return;
    if (!lobby.theirs.ready || !lobby.mine.ready) return;
    starting = true;
    H.closeLobby?.();
    closePanel();
    startHostRun().catch((err) => { console.error(err); end('error'); }).finally(() => { starting = false; });
  }

  function onWelcome(state, host) {
    if (state.phase === 'lobby' || (state.phase === 'run' && !runStarted)) {
      if (runStarted) return;
      // Pick a hero (the host's card shows theirs).
      closePanel();
      lobby = { mine: { kit: H.lastKit(1) ?? 'robin', ready: false }, theirs: { kit: isKitId(state.hostKit) ? state.hostKit : host?.kit ?? 'm', ready: state.phase === 'run', name: host?.name ?? 'Player 1' } };
      H.showLobby({ mine: lobby.mine.kit, theirs: lobby.theirs, guest: true, onLocal: onLocalPick, onDone: () => {}, onCancel: () => end('closed', { quiet: true }) });
      return;
    }
    // The world (first time after the run began, or after a reconnect).
    loadWorld(state);
  }

  // ---------------------------------------------------------------- starting a run
  async function startHostRun() {
    const g0 = H.getGame();
    const guestKit = lobby.theirs.kit;
    await H.prepareKit(guestKit);
    if (!g0 || !H.inRun()) await H.beginRun(lobby.mine.kit, false);
    setNetRole('host', api);
    runStarted = true;
    const g = H.getGame();
    remote = g.coop.addRemotePlayer({ kit: kitById(guestKit), input: createRemoteInput(), id: 1, slot: 1 });
    remote.netSlot = 1;
    g.players[0].netSlot = 0;
    // [net2] edges: the guest's presses act here (the vehicle key, the gunner, paired moves).
    remote.puppet = createHeroPuppet(remote, { hostNow: () => performance.now(), edges: true });
    rep = createHostReplicator({ session, adapter: { collect: (o) => adapter?.collect(o), guestHero: (r, t) => adapter?.guestHero(r, t), claimHit: (s, m) => adapter?.claimHit(s, m), defence: (s, a, m) => adapter?.defence(s, a, m), canLock: (s, i, a) => adapter?.canLock(s, i, a), lockGranted: (s, i, a) => adapter?.lockGranted(s, i, a), unlocked: (s, i) => adapter?.unlocked(s, i), claimFx: (s, m) => adapter?.claimFx(s, m), request: (s, m) => onRequest(m), chat: (s, m) => adapter?.chat(s, m), guestEvent: (s, m) => adapter?.guestEvent(s, m), claim: (s, m) => content?.claim(m) } });
    adapter = createHostAdapter({ ...gameDeps(g), remote, rep, revive: g.revive });
    content = createContentHost({ registry: seams, events: g.events, send: (m) => rep?.event(m), remote, enemyOk: (id) => isNetEnemyId(id) });
    adapter.markAllKnown = () => { for (const e of g.combat.enemies) if (isNetEnemyId(e.id ?? '') && !(e.id === 'joker' && !e.ch.root.visible)) adapter.known.set(e.id, e); if (g.boss?.joker?.ch.root.visible) adapter.known.set('joker', g.boss.joker); };
    showBadge();
    const step = g.flow.stepIndex;
    session.send({ t: 'start', kit: H.hostKit(), gkit: guestKit, step, night: g.flow.story?.night?.id ?? 'n1', stepId: g.flow.objectives.step?.id ?? null });
    toast('Player 2 is joining…', 2500);
  }

  async function startGuestRun(m) {
    if (runStarted) return;
    runStarted = true;
    closePanel();
    H.closeLobby?.();
    const kit = isKitId(m.gkit) ? m.gkit : lobby?.mine.kit ?? 'robin';
    const hostKit = isKitId(m.kit) ? m.kit : 'm';
    await H.prepareKit(kit);
    await H.prepareKit(hostKit);
    // The guest's save rule: its own story fields never change in someone else's world.
    const own = H.getProgress();
    // Two tabs of one browser share one save: the second tab's run is never written at all.
    H.setStorage(mode === 'broadcast' ? memoryStorage(H.realStorage()) : guestStorage(H.realStorage(), own));
    const step = Number.isInteger(m.step) ? m.step : 0;
    // [net2] The host's campaign position: Night One's index, or a later night and its step id (the
    // guest's run loads that night at start; its own campaign is put back before every save).
    const night = typeof m.night === 'string' && m.night !== 'n1' ? m.night : null;
    const n1 = night ? STEPS.length - 1 : step;
    H.setProgress({
      ...own, step: n1, stepId: STEPS[n1]?.id ?? null, finished: !!night,
      campaign: { ...(own.campaign ?? {}), night: night ?? 'n1', stepId: night && typeof m.stepId === 'string' ? m.stepId : null },
      online: { ...(own.online ?? {}), sessions: (own.online?.sessions ?? 0) + 1 },
    });
    setNetRole('guest', api);
    await H.beginRun(kit, false);
    const g = H.getGame();
    g.players[0].netSlot = 1;
    remote = g.coop.addRemotePlayer({ kit: kitById(hostKit), input: createRemoteInput(), id: 1, slot: 1 });
    remote.netSlot = 0;
    rep = createGuestReplicator({ session, adapter: guestShim() });
    remote.puppet = createHeroPuppet(remote, { hostNow: () => session.hostNow(), delay: rep.delay, noteDelay: false });
    adapter = createGuestAdapter({ ...gameDeps(g), hostPlayer: remote, rep, spawnNet: g.spawnNet, despawn: g.despawn, pickups: g.pickups, follow: g.follow, hostNow: () => session?.hostNow?.() ?? performance.now(), onOther: (x) => content?.onEvent(x) });
    content = createContentGuest({
      registry: seams, events: g.events, send: (x) => session?.send(x),
      playerBySlot: (s) => g.players.find((p) => p.netSlot === s) ?? null,
      enemyById: (id) => adapter?.puppets?.get(id) ?? null,
      makeVec: (v) => new THREE.Vector3(v.x, v.y, v.z),
    });
    showBadge();
    // Ask for the world now that there is a run to put it in.
    session.resync();
  }

  // The guest replicator talks to whatever adapter is current (it exists before the adapter).
  function guestShim() {
    const a = () => adapter;
    return {
      spawn: (m) => a()?.spawn(m), despawn: (id) => a()?.despawn(id), enemyByNum: (n) => a()?.enemyByNum(n) ?? null,
      applyEnemy: (...x) => a()?.applyEnemy(...x), hostHero: () => {}, prop: (r, p) => a()?.prop?.(r, p), hostHeroRecord: (r, t) => a()?.hostHeroRecord(r, t),
      localHero: (o) => a()?.localHero(o) ?? false, attackBegin: (...x) => a()?.attackBegin(...x), isCounteredLocally: (...x) => a()?.isCounteredLocally(...x) ?? false,
      resolveAttack: (...x) => a()?.resolveAttack(...x) ?? 'miss', hurt: (m) => a()?.hurt(m), hitAck: (m) => a()?.hitAck(m),
      granted: (r) => a()?.granted(r), denied: (r) => a()?.denied(r), onEvent: (m) => a()?.onEvent(m),
    };
  }

  function loadWorld(state) {
    const g = H.getGame();
    if (!g || !adapter) return;
    rep.reset();
    adapter.loadWorld(Array.isArray(state.enemies) ? state.enemies.filter((e) => e && typeof e.id === 'string' && isNetEnemyId(e.id) && typeof e.type === 'string' && e.pos) : []);
    for (const item of Array.isArray(state.pickups) ? state.pickups : []) if (typeof item === 'string') g.pickups?.take?.(item);
    // [net2] (night, step id), not the index alone
    if (Number.isInteger(state.step)) g.flow.follow(state.step, { night: typeof state.night === 'string' ? state.night : null, id: typeof state.stepId === 'string' ? state.stepId : null });
    syncWorldTime(state);
    if (state.env) adapter.onEvent?.({ t: 'ev', name: 'env', data: state.env });
    content?.loadStates(state.states);
    const sp = state.spawn;
    const h = g.hero;
    if (sp?.pos && Number.isFinite(sp.pos.x) && (!h.netPlaced || Math.hypot(h.pos.x - sp.pos.x, h.pos.z - sp.pos.z) > 60)) {
      h.teleport(sp.pos, sp.yaw ?? 0);
      g.follow.snapBehind(sp.yaw ?? 0);
      h.netPlaced = true;
    }
  }

  function gameDeps(g) {
    return {
      combat: g.combat, events: g.events, players: g.players, flow: g.flow, time: g.time, revive: g.revive, hud: g.hud, coop: g.coop, boss: g.boss, vehicles: g.vehicles,
      // [net2] the Batwing, every boss, the world (clock, weather), the credits page
      batwing: g.batwing, bosses: g.bosses, bruce: g.bruce, nightwing: g.nightwing, world: H.getWorld?.() ?? null, closeCredits: () => H.closeCredits?.(),
      // Seat the guest's hero in the host's car (a story drive, or its vehicle key).
      seatRemote: () => seatRemote(g),
      pingExtra, showPing: showPingFrom, showChat: showChatFrom, sceneDone: (i) => sceneDone(i),
    };
  }

  // ---------------------------------------------------------------- pings and chat (the glue)
  function pingExtra(d) {
    const g = H.getGame();
    const m = g?.coop?.glue?.pings?.marks?.filter((x) => x.by === g.players[0].id && x.id === d.id).pop();
    // [map] Waypoint and fast-travel pings (src/nav/navSystem.js) carry their own position.
    if (!m && d.pos && Number.isFinite(d.pos.x)) return { pos: { x: +d.pos.x.toFixed(2), y: +(d.pos.y ?? 0).toFixed(2), z: +d.pos.z.toFixed(2) } };
    if (!m) return {};
    const out = {};
    if (m.target?.id && /^e\d+$/.test(m.target.id)) out.e = m.target.id;
    if (m.pos) out.pos = { x: +m.pos.x.toFixed(2), y: +m.pos.y.toFixed(2), z: +m.pos.z.toFixed(2) };
    return out;
  }
  function showPingFrom(p, m) {
    const g = H.getGame();
    const pings = g?.coop?.glue?.pings;
    if (!pings) return;
    const target = m.e ? g.combat.enemies.find((e) => e.id === m.e) : null;
    // [map] A waypoint or fast-travel ping is the map's (src/nav/navSystem.js): no pin, just the event.
    if (/^(wp|ft)/.test(String(m.id))) { g.events.emit('ping', { id: m.id, remote: true, pos: m.pos ?? null, from: p.netSlot }); return; }
    const label = { enemy: 'THAT ONE!', here: 'HERE', help: 'HELP!' }[m.id] ?? 'HERE';
    if (m.id === 'enemy' && target) pings.add({ id: 'enemy', by: p.id, target, label });
    else if (m.id === 'help') { pings.add({ id: 'help', by: p.id, follow: p.hero, label }); g.hud.hint(`Player ${p.netSlot + 1} needs help!`, 2500); }
    else if (m.pos) pings.add({ id: 'here', by: p.id, pos: { x: m.pos.x, y: m.pos.y, z: m.pos.z, clone() { return { ...this }; } }, label });
    g.events.emit('ping', { id: m.id, remote: true });
  }
  function showChatFrom(p, m) {
    const g = H.getGame();
    const text = cleanText(m.text, LIMITS.maxChat);
    if (!text) return;
    g?.coop?.glue?.comms?.(p, { kind: 'chat', id: String(m.id ?? 'chat').slice(0, 24), label: text });
  }

  // [net2] The props (the Batmobile, its moving parts, the Batwing): src/net/game/vehicleNet.js.
  function seatRemote(g) {
    if (!remote || g.coop.seats.isMounted?.(remote.hero)) return;
    const car = g.vehicles.active;
    if (!car) return;
    // Seat it from where the car is (its puppet stands wherever the guest last was).
    remote.hero.pos.set(car.group.position.x + 1, car.group.position.y, car.group.position.z);
    g.coop.seats.vehicleKey(remote);
  }

  // ---------------------------------------------------------------- requests (guest -> host)
  function onRequest(m) {
    const g = H.getGame();
    if (!g || role !== 'host') return;
    if (m.what === 'regroup') g.coop.regroup();
    else if (m.what === 'ride' && remote) {
      // In (beside the car) or out: the seat rules are the split-screen ones (src/coop/passenger.js).
      if (g.coop.seats.isMounted?.(remote.hero) || !g.vehicles.active) g.coop.seats.vehicleKey(remote);
      else if (Math.hypot(remote.hero.pos.x - g.vehicles.active.group.position.x, remote.hero.pos.z - g.vehicles.active.group.position.z) < 8) seatRemote(g);
    }
  }

  // ---------------------------------------------------------------- story gates
  // The host waits for the guest's comic before moving on (capped, and not when it is away).
  function waitScene(index) {
    if (role !== 'host' || !remote || !rep?.ready || remote.away || scenesDone.has(index)) return Promise.resolve();
    return new Promise((resolve) => {
      sceneWaits.set(index, resolve);
      const g = H.getGame();
      g?.hud.hint('Waiting for Player 2 to finish reading…', 4000);
      setTimeout(() => { if (sceneWaits.get(index) === resolve) { sceneWaits.delete(index); resolve(); } }, SCENE_WAIT_MS);
    });
  }
  function sceneDone(index) { if (role === 'guest') session?.send({ t: 'sceneDone', index }); }

  // ---------------------------------------------------------------- host away / pause
  function onVisibility() {
    if (role !== 'host' || !session) return;
    clearTimeout(hiddenT);
    if (document.hidden) hiddenT = setTimeout(() => { hostAwayOn = true; session?.hostAway(true); }, 1000);
    else if (hostAwayOn) { hostAwayOn = false; session?.hostAway(false); }
  }
  document.addEventListener('visibilitychange', onVisibility);
  function onHostAway(on) {
    if (!away) away = createAwayOverlay();
    const st = H.state;
    if (on) {
      away.show('Waiting for the host… their game window is minimised or paused.');
      if (runStarted && !st.paused) { st.paused = true; st.pauseMenu = false; pausedByHost = true; }
    } else {
      away.hide();
      if (pausedByHost) { pausedByHost = false; st.paused = false; }
    }
  }

  // ---------------------------------------------------------------- per frame
  let badgeT = 0, timingT = 0;
  function pre(real, dt) {
    if (!runStarted || !rep) return;
    // [net2] the guest's presses (edges queued by its hero records) for this frame's readers
    if (role === 'host') remote?.input?.update?.(real);
    if (role === 'guest') {
      adapter?.frame(real);
      rep.tick();
      timingT -= real;
      if (timingT <= 0 && session?.welcomed) { timingT = 2; session.send({ t: 'ev', name: 'timing', data: { rtt: Math.round(session.sync.rtt), delay: Math.round(rep.delay.value) } }); }
    }
    void dt;
  }
  // The world clock (the El timetable, the bridges, the sky) runs on the host's: a guest's
  // state.t follows it (research: replicate timetable-driven things by clock, not by state).
  function syncWorldTime(d) {
    if (!d || !Number.isFinite(d.t) || !Number.isFinite(d.at) || !session?.hostNow) return;
    const t = d.t + Math.max(0, session.hostNow() - d.at) / 1000;
    if (Math.abs(t - H.getWorldTime()) > 0.25) H.setWorldTime(t);
  }
  let clockT = 0;
  function post(real) {
    if (runStarted && rep && role === 'guest') drawStealth(); // [net2]
    if (runStarted && rep && role === 'host') {
      adapter?.frame();
      if (rep.ready) content?.tick(real); // [net2] the content seams' state blobs
      rep.tick();
      clockT -= real;
      if (clockT <= 0 && rep.ready) { clockT = 3; rep.event({ t: 'ev', name: 'clock', data: { t: H.getWorldTime(), at: performance.now() } }); }
    }
    badgeT -= real;
    if (badgeT <= 0) { badgeT = 0.5; updateBadge(); }
  }

  // [net2] The host's predator-room rings over our puppets (after game.js drew its own empty set).
  function drawStealth() {
    const g = H.getGame();
    const hudS = g?.stealthHud;
    if (!hudS || !stealthView || g.stealth?.active) return;
    const n = stealthView.ids.length;
    for (let i = 0; i < n; i++) {
      const e = adapter?.puppets?.get(stealthView.ids[i]);
      const code = stealthView.c[i] | 0;
      if (!e || !code || !g.netScreen) { hudS.glyph(i, 0, 0, false, 0); continue; }
      const p = g.netScreen(e);
      hudS.glyph(i, p.x, p.y, !p.behind, code);
    }
    hudS.hideFrom(n);
    hudS.armed(stealthView.armed | 0, !!H.state?.detectiveOn);
  }

  function showBadge() {
    if (badge) return;
    badge = createBadge({ onClick: () => { showPing = !showPing; try { localStorage.setItem('gotham-net-ping', showPing ? '1' : '0'); } catch { /* fine */ } updateBadge(); } });
  }
  function updateBadge() {
    if (!badge || !session) return;
    const st = session.state;
    if (st === 'reconnecting' || st === 'connecting' || st === 'handshake') badge.set('RECONNECTING…', 'warn');
    else if (st === 'away') badge.set(role === 'host' ? 'P2 AWAY' : 'HOST QUIET', 'warn');
    else if (st === 'waiting') badge.set('ONLINE · waiting', 'warn');
    else if (st === 'closed') badge.set('OFFLINE', 'bad');
    else {
      const ms = role === 'guest' ? Math.round(session.sync?.rtt ?? 0) : Math.round(rep?.rtt ?? 0);
      badge.set(showPing && ms ? `ONLINE · ${ms} ms` : 'ONLINE', 'ok');
    }
  }

  // ---------------------------------------------------------------- endings
  function detachRun() {
    const g = H.getGame();
    adapter?.dispose?.();
    adapter = null;
    content?.dispose?.(); content = null; // [net2]
    if (g && remote) g.coop.removeRemotePlayer(remote);
    remote = null;
    rep = null;
  }
  function closePanel() { stopCount?.(); stopCount = null; ui?.close(); ui = null; }
  function end(reason, { quiet = false } = {}) {
    const s = session;
    session = null;
    try { if (s && !s.ended) s.close(role === 'host' ? 'host-left' : 'left'); } catch { /* closed */ }
    for (const r of sceneWaits.values()) r();
    sceneWaits.clear();
    closePanel();
    H.closeLobby?.();
    away?.hide();
    if (pausedByHost) { pausedByHost = false; H.state.paused = false; }
    if (role === 'guest' && runStarted) {
      // Back to title on the guest's own save (a reload: the replica run is thrown away whole).
      try { sessionStorage.setItem(MSG_KEY, reason); } catch { /* fine */ }
      setNetRole('off');
      H.toTitle();
      return;
    }
    if (role === 'host' && runStarted) {
      detachRun();
      badge?.remove(); badge = null;
      setNetRole('off');
      runStarted = false;
      if (!quiet) toast('The online game has ended. You are playing on your own.');
      return;
    }
    badge?.remove(); badge = null;
    setNetRole('off');
    runStarted = false;
    lobby = null;
    if (!quiet) toast(messageFor(reason), 8000);
    if (!quiet && !H.inRun()) H.showTitle();
    else if (quiet && !H.inRun()) H.showTitle();
  }

  const api = {
    openHost, openJoin,
    inviteFromRun: () => openHost({ fromRun: true }),
    // Tests: play over a link made elsewhere (a real WebRTC pair whose SDP the test relayed).
    hostWithLink(link, { fromRun = true } = {}) { directLink = link; mode = 'link'; openHost({ fromRun }); },
    joinWithLink(link) { directLink = link; mode = 'link'; role = 'guest'; joinWith('LINKED', linkSignaller(link)); },
    leave: () => end('closed'),
    kick: () => { if (role === 'host') { session?.kick(); detachRun(); } },
    pre, post, waitScene, sceneDone,
    bossBegin: () => {},
    // Host pause menu: the guest sees "host away" while it is open.
    hostPaused(on) { if (role === 'host' && runStarted) session?.hostAway(!!on); },
    get role() { return role; },
    get session() { return session; },
    get rep() { return rep; },
    get adapter() { return adapter; },
    get remote() { return remote; },
    get runStarted() { return runStarted; },
    get mode() { return mode; },
    get lobby() { return lobby; },
    get stealthView() { return stealthView; }, // [net2] tests: the predator rings a guest draws
    get content() { return content; }, // [net2]
    // Bandwidth over the session so far (the e2e tests report it).
    bandwidth() {
      const l = session?.link;
      if (!l) return null;
      return { out: { ...l.stats.bytesOut }, in: { ...l.stats.bytesIn }, sent: { ...l.stats.sent }, recv: { ...l.stats.recv } };
    },
  };
  return api;
}

// A message left by a guest session that ended (shown on the title after the reload).
export function takeEndMessage() {
  try { const r = sessionStorage.getItem(MSG_KEY); sessionStorage.removeItem(MSG_KEY); return r ? messageFor(r) : null; } catch { return null; }
}

// Reads the real save; writes stay in memory (the same-PC guest tab).
function memoryStorage(real) { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : real?.getItem(k) ?? null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
function sessionStore() { try { return window.sessionStorage; } catch { return null; } }
function rand() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
void netMode;
