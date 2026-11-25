// Gadgets at run time: the wheel (hold to open with time at 20%, pick with the mouse, the right
// stick or 1 to 8, let go to equip), the equipped gadget and its HUD panel, firing through
// combat's input buffer (the useGadget hook), each gadget's live effects (handlers in ./g/),
// unlock announcements and the help list.
import { ALL_GADGETS, ALL_GADGET_IDS, gadgetById, unlockedIds, unlockedNewIds, rewardGadgetId, gadgetsLocked, freeForGadget } from './gadgetDefs.js';
import { can } from '../abilities/gate.js'; // [onboard]
import { DEFAULT_LOADOUT, sanitizeLoadout, slotOf, nextPage, livePages } from './loadout.js';
import { createGadgetState } from './gadgetState.js';
import { createWheelLogic, createWheelCursor, slotFromDir, WHEEL_DIGITS } from './wheelMath.js';
import { HANDLER_FACTORIES } from './g/index.js';
import { STEPS } from '../game/story.js';
import { bindingLabel } from '../core/bindings.js';
import { promptText } from '../ui/prompts.js';
import { withPlayer } from '../core/events.js';

// How long the returning-player summary card stays up before the flashbang gets its own.
export const NEWS_CARD_S = 9;
// Mouse pixels (pointer lock) for a full push toward a slot. Small, so a short trackpad swipe
// (a MacBook in Safari) is enough: past the 0.35 dead zone after about 25 px.
const WHEEL_PX = 70;

export function createGadgetSystem(deps) {
  const {
    hero, combat, follow, time, events, input, fx, gfx, breakables, progress, save, collision, camera, effects,
    wheelUi, gadgetHud, getBindings, isPlaying, devAll = false, factories = HANDLER_FACTORIES, stealth = null,
    // The player these gadgets belong to (time holds are player-local: src/core/time.js).
    player = 0,
    // A co-op partner's own gadgets (workstream D1): the story's unlocks are announced once, by
    // player 0's system, so this one never shows news or unlock cards and never writes the save.
    secondary = false,
  } = deps;
  // Its events carry the player when it is a Player record (player 0 passes 0: payloads unchanged).
  const who = player && typeof player === 'object' ? player : null;
  const offs = [];
  // The wheel's time hold, named per player so one player's wheel closing never drops another's.
  const WHEEL_HOLD = who ? `wheel:${who.id}` : 'wheel';
  const on = (n, fn) => { offs.push(events.on(n, fn)); };
  const saved = progress.gadgets;
  // [prog] The story's eight plus the new gadgets the campaign gave ([fix1] no longer all of them
  // once finished: `finished` is Night One's credits; see unlockedNewIds).
  const storyUnlocks = () => [...unlockedIds(progress, STEPS, saved.unlocked), ...unlockedNewIds(progress, saved.unlocked)];
  const state = createGadgetState({ equipped: saved.equipped, unlocked: storyUnlocks(), tune: effects });
  if (devAll) state.unlock(ALL_GADGET_IDS);
  const handlers = ALL_GADGETS.filter((g) => factories[g.id]).map((g) => factories[g.id]());
  // [prog] The wheel's pages (src/gadgets/loadout.js): the saved loadout or the default one, and
  // the page on screen. Page 1 is the original eight in their original slots.
  // A ?gadgets=all run and a co-op partner keep theirs here (never saved): the partner follows
  // player 0's loadout through the 'gadgetLoadout' event.
  let localLoadout = null;
  const loadout = () => localLoadout ?? saved.loadout ?? DEFAULT_LOADOUT;
  let page = 0;
  const idAt = (i) => (i === null || i === undefined ? null : loadout()[page]?.[i] ?? null);
  const open = (id) => !!id && state.isUnlocked(id);
  const byId = new Map(handlers.map((h) => [h.id, h]));
  const wheel = createWheelLogic();
  const cursor = createWheelCursor({ pxPerUnit: WHEEL_PX });
  const st = {};
  let hudCode = -1, pickCode = -1;
  // The last slot the mouse and the stick pointed at: they only move the pick when that changes,
  // so a key pick (1 to 8) isn't overwritten by a cursor resting on another slot.
  let cursorSlot = null, stickSlot = null;
  // Set when the wheel opens; the next update, if it is still open, it has been on screen for a
  // rendered frame and 'wheelSeen' fires (the tutorial prompt only counts from then).
  let unseen = false;

  const sys = {
    hero, combat, api: combat.gadgetApi, follow, time, events, input, fx, gfx, breakables, collision, camera, state, effects, progress,
    stealth, player,
    cameraFocus: null, cameraMode: null, wheelOpen: false,
    // [prog] The Player record (null for player 0), for player-scoped events (withPlayer).
    who,
    emit(name, data) { events.emit(name, withPlayer(data, who)); },
    getBindings,
    // A ?gadgets=all dev run: handlers must not write progress or call save() while it is set.
    devAll,
    hint(id, arg) { events.emit('hint', withPlayer({ id, arg }, who)); },
    // A short gadget pose (throw, spray, fire). On the ground it holds locomotion off for `dur`, so
    // the clip isn't cut by the idle, and replaces a combat move in its chain window, as the next
    // punch would; otherwise it just plays. A move that can't be cut keeps its own clip.
    pose(clip, dur = 0.3, timeScale = 2) {
      if (!freeForGadget(hero)) return;
      hero.bat.animator.play(clip, { once: true, timeScale, fade: 0.05 });
      if (hero.state !== 'ground') return;
      let t = 0;
      hero.control = { name: 'gadgetPose', combat: true, canChain: () => t > dur * 0.7, update(dt) { t += dt; return t > dur; } };
    },
  };

  // Gadgets a returning save earned before they existed (a save past their unlock steps, or one
  // that finished the story): unlocked now, never announced. They are told on the first live play
  // frame (one summary card, then the flashbang's own card) and only then remembered, so the
  // news never repeats. A ?gadgets=all run has no news and never writes.
  // [prog] Only the original eight: new gadgets come with their own card (a campaign reward) or,
  // from the story's paid rewards on load, silently, and are never written for that.
  const quietNew = (id) => !gadgetById(id).unlock?.reward;
  const news = devAll || secondary ? [] : [...state.unlocked].filter((id) => id !== 'batarang' && quietNew(id) && !saved.unlocked.includes(id));
  let newsT = 0;
  // The wheel tutorial, once per run while more than one gadget is unlocked and the wheel has
  // never been opened (progress.gadgets.wheelUsed).
  let wheelTip = !devAll && !secondary && !saved.wheelUsed;

  // Every gadget the story has unlocked is remembered in the save, so a new game keeps it.
  function remember() {
    if (devAll || secondary) return;
    let dirty = false;
    for (const id of state.unlocked) {
      if (id !== 'batarang' && quietNew(id) && !news.includes(id) && !saved.unlocked.includes(id)) { saved.unlocked.push(id); dirty = true; }
    }
    if (dirty) save();
  }
  remember();

  // Runs every play frame; does nothing once the news is out (a length check and a Set size).
  function updateNews(real) {
    if (wheelTip && state.unlocked.size > 1 && isPlaying()) { wheelTip = false; events.emit('gadgetWheelTip'); }
    if (!news.length || !isPlaying()) return;
    newsT -= real;
    if (newsT > 0) return;
    const flashbang = news.indexOf('flashbang');
    const rest = news.length - (flashbang >= 0 ? 1 : 0);
    if (rest > 1) {
      const ids = news.filter((id) => id !== 'flashbang');
      events.emit('gadgetNews', { ids });
      news.length = 0;
      if (flashbang >= 0) { news.push('flashbang'); newsT = NEWS_CARD_S; }
    } else {
      // One gadget (the flashbang, or any other on its own) gets its normal unlock card.
      const id = rest ? news.find((g) => g !== 'flashbang') : 'flashbang';
      news.splice(news.indexOf(id), 1);
      events.emit('gadgetUnlocked', { id });
      if (news.length) newsT = NEWS_CARD_S;
    }
    remember();
  }

  function unlockCheck() {
    if (devAll) return;
    const fresh = state.unlock(storyUnlocks());
    remember();
    if (!secondary) for (const id of fresh) events.emit('gadgetUnlocked', { id });
  }
  on('step', unlockCheck);
  if (secondary) on('gadgetLoadout', (d) => { if (Array.isArray(d?.loadout)) localLoadout = sanitizeLoadout(d.loadout); });
  // [prog] Campaign rewards (workstream J1): 'gadget.<id>' unlocks that gadget for the save, kept in
  // the sticky list (a new game keeps it) and announced with the gadget card by player 0's system.
  // A partner's system shares the story's list, so it only unlocks. ?gadgets=all never writes.
  on('campaignReward', (d) => {
    const id = rewardGadgetId(d?.id);
    if (!id) return;
    if (!devAll && !secondary && !saved.unlocked.includes(id) && id !== 'batarang') { saved.unlocked.push(id); save(); }
    const fresh = state.unlock([id]);
    if (!secondary) for (const f of fresh) events.emit('gadgetUnlocked', { id: f });
  });
  // The Joker only answers to the batarang: his fight starts with it in hand. Not saved, so the
  // gadget picked before still comes back on the next load.
  on('step', (e) => {
    if (e?.step?.type !== 'boss' || state.equipped === 'batarang') return;
    state.equip('batarang');
    hudCode = -1;
  });

  function equip(id) {
    if (!state.equip(id)) return false;
    // ?gadgets=all is a dev run: its picks never reach the real save.
    if (!devAll && saved.equipped !== id) { saved.equipped = id; save(); }
    hudCode = -1;
    events.emit('gadgetEquip', withPlayer({ id }, who));
    return true;
  }

  function info(i) {
    const id = idAt(i);
    if (!id) return { name: 'Empty slot', text: 'Arrange the wheel in the Batcave.' };
    if (!state.isUnlocked(id)) return { name: '???', text: gadgetById(id).unlockText };
    state.status(id, st);
    return { name: st.name, text: st.text };
  }
  // Only in live play: never dead, in a cutscene or comic, paused, in photo mode, mid chain
  // takedown, stealth takedown or the Bat Swarm (gadgetDefs NO_GADGET_CONTROLS), in a challenge
  // countdown or while steering the remote batarang.
  function canUseWheel() {
    // [prog] nor while flying the drone or cracking a hack.
    return isPlaying() && !hero.dead && !gadgetsLocked(hero) && !byId.get('remote')?.active && !byId.get('drone')?.flying && !byId.get('hack')?.active;
  }
  function openWheel() {
    if (wheel.open || !canUseWheel()) return;
    // [prog] It opens on the page that holds the equipped gadget.
    const at = slotOf(loadout(), state.equipped);
    page = at && (at.page === 0 || livePages(loadout(), open).includes(at.page)) ? at.page : 0;
    wheel.press(at && at.page === page ? at.slot : 0);
    cursor.reset();
    cursorSlot = null;
    stickSlot = null;
    sys.wheelOpen = true;
    // Player-local: one player alone gets the world at 20% as always; in co-op the wheel never
    // slows the other player's fight (src/core/time.js).
    time.hold(WHEEL_HOLD, 0.2, player);
    showPage();
    pickCode = idAt(wheel.pick) ? state.hudCode(idAt(wheel.pick)) : -2;
    wheelUi.show(loadout()[page].map(open), wheel.pick, info(wheel.pick));
    unseen = true;
    events.emit('wheelOpen', withPlayer({}, who));
  }
  function closeWheel(apply = true) {
    // Always drop the hold, even if the wheel was already shut: it must never outlive the wheel.
    time.release(WHEEL_HOLD);
    if (!wheel.open) return;
    const slot = wheel.release((i) => apply && open(idAt(i)));
    sys.wheelOpen = false;
    wheelUi.hide();
    events.emit('wheelClose', withPlayer({}, who));
    if (slot !== null && idAt(slot) !== state.equipped) equip(idAt(slot));
  }
  // [prog] The page strip on the wheel: shown only when more than one page holds a gadget.
  function showPage() {
    const live = livePages(loadout(), open);
    wheelUi.setPage?.(loadout()[page], live.indexOf(page), live.length, bindingLabel(getBindings(), 'batarang'));
  }
  // Turn the open wheel to the next page with an unlocked gadget (the fire key or Q).
  function flipPage(dir = 1) {
    const to = nextPage(loadout(), page, open, dir);
    if (to === page) return false;
    page = to;
    showPage();
    wheelUi.show(loadout()[page].map(open), wheel.pick, info(wheel.pick));
    pickCode = -2;
    events.emit('wheelPage', withPlayer({ page }, who));
    return true;
  }
  function updateWheel() {
    if (wheel.open && unseen) {
      unseen = false;
      wheelTip = false;
      if (!devAll && !saved.wheelUsed) { saved.wheelUsed = true; save(); }
      events.emit('wheelSeen', withPlayer({}, who));
    }
    if (input.pressed('gadgetWheel') && can(hero, 'gadgets')) openWheel(); // [onboard] a locked belt (Night Eight)
    if (!wheel.open) return;
    // Play stopped or a chain began under the wheel: shut it without equipping.
    if (!canUseWheel()) { closeWheel(false); return; }
    const before = wheel.pick;
    cursor.move(input.look.dx, input.look.dy);
    const cs = cursor.slot();
    if (cs !== cursorSlot) { cursorSlot = cs; wheel.choose(cs); }
    const ss = slotFromDir(input.stick?.lx ?? 0, input.stick?.ly ?? 0, { dead: 0.5 });
    if (ss !== stickSlot) { stickSlot = ss; wheel.choose(ss); }
    if (input.pressed('batarang') || input.codePressed('KeyQ')) { input.swallow('KeyQ'); flipPage(1); }
    for (let i = 0; i < WHEEL_DIGITS.length; i++) {
      if (!input.codePressed(WHEEL_DIGITS[i])) continue;
      wheel.choose(i);
      input.swallow(WHEEL_DIGITS[i]);
    }
    const code = idAt(wheel.pick) ? state.hudCode(idAt(wheel.pick)) : -2;
    if (wheel.pick !== before) {
      pickCode = code;
      wheelUi.setPick(wheel.pick, info(wheel.pick));
      events.emit('wheelPick', withPlayer({ slot: wheel.pick }, who));
    } else if (code !== pickCode) {
      pickCode = code;
      wheelUi.setInfo(info(wheel.pick));
    }
    if (!input.down('gadgetWheel')) closeWheel(true);
  }

  // combat's useGadget hook. Returns true when the buffered press is used up.
  function fire(ctx, opts = {}) {
    const id = state.equipped;
    const h = byId.get(id);
    if (!h || wheel.open) return true;
    if (!h.manualSpend && !state.ready(id)) {
      const g = gadgetById(id);
      sys.hint(g.kind === 'charges' ? 'gadget-empty' : 'gadget-cooldown', g.name);
      return true;
    }
    const ok = h.fire(sys, ctx, opts);
    if (ok && !h.manualSpend) { state.use(id); events.emit('gadgetUse', withPlayer({ id }, who)); }
    return ok || !h.retry;
  }

  function update(real, dt, ctx) {
    state.tick(dt);
    updateNews(real);
    updateWheel();
    ctx.lockInput = wheel.open;
    sys.wheelOpen = wheel.open;
    for (const h of handlers) h.update?.(sys, real, dt, ctx);
    const id = state.equipped;
    const code = state.hudCode(id) + (state.ready(id) ? 0.5 : 0);
    if (code !== hudCode) {
      hudCode = code;
      gadgetHud.set(state.status(id, st), bindingLabel(getBindings(), 'batarang'));
    }
  }

  // A pause, the help screen or photo mode: shut the wheel without equipping and drop every time
  // hold, so slow time never survives into a menu or out the other side of one.
  function halt() {
    closeWheel(false);
    if (!secondary) time.releaseAll();
  }
  // Play stopped (a cutscene, the finale, a death, a new run): as halt, and drop anything in flight.
  function interrupt() {
    halt();
    for (const h of handlers) h.cancel?.(sys);
  }
  on('heroDown', interrupt);
  on('cutscene', (e) => { if (e?.on) interrupt(); });
  on('photoOpen', halt);

  return {
    state, fire, update, equip, openWheel, closeWheel, unlockCheck, halt, interrupt,
    // A co-op partner dropping out: its listeners go with it.
    dispose() { interrupt(); for (const off of offs) off(); offs.length = 0; },
    helpList(bindings) {
      return ALL_GADGETS.map((g) => (state.isUnlocked(g.id)
        ? { name: g.name, html: promptText(g.promptId, bindings) }
        : { name: '???', html: g.unlockText }));
    },
    handler: (id) => byId.get(id) ?? null,
    // [prog] The wheel's pages (src/gadgets/loadout.js) and the loadout station's write.
    get loadout() { return loadout(); },
    get page() { return page; },
    flipPage,
    setLoadout(next) {
      const clean = sanitizeLoadout(next);
      if (devAll || secondary) localLoadout = clean;
      else { saved.loadout = clean; save(); }
      if (!secondary) events.emit('gadgetLoadout', { loadout: clean });
      return clean;
    },
    refresh() { hudCode = -1; },
    // True until every returning-player gadget card (the WayneTech delivery, then the flashbang's own)
    // has gone up, gaps between them included, so other one-off cards can wait their turn.
    get newsPending() { return news.length > 0; },
    get wheelOpen() { return wheel.open; },
    get cameraFocus() { return sys.cameraFocus; },
    get cameraMode() { return sys.cameraMode; },
    get debug() {
      return { equipped: state.equipped, wheel: wheel.open, pick: wheel.pick, page, unlocked: [...state.unlocked], held: time.held, status: ALL_GADGET_IDS.map((id) => ({ ...state.status(id) })) };
    },
  };
}
