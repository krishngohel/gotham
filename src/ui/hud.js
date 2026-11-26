import { createCardQueue } from './cardQueue.js';
import { batSvgPath } from '../config/batShape.js';
import { chainHudKey } from '../combat/chains.js';
import { glyphTell, tellSvg, getAccess } from './accessibility.js'; // [prog] a11y
// [onboard] One centre card at a time, deferred over combat, compact chips, approach reveals.
import { createHudDirector, revealStyle, quantise } from './hudDirector.js';
import { cardsAsChips } from './hudLayout.js'; // [polish] the layout grammar

const R = 50;
const C = 2 * Math.PI * R;
// [prog] a11y: the counter bolt moved to src/ui/accessibility.js (TELLS.counter.path).
const TROPHY = '<svg width="16" height="22" viewBox="0 0 16 22"><path d="M3.5 7 Q3.5 2.5 8 2.5 Q12.5 2.5 12.5 7 Q12.5 10 8 12.5 V15" stroke="#0b0b12" stroke-width="4.2" fill="none" stroke-linecap="round"/><path d="M3.5 7 Q3.5 2.5 8 2.5 Q12.5 2.5 12.5 7 Q12.5 10 8 12.5 V15" stroke="#3dff72" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="8" cy="19" r="2.2" fill="#3dff72" stroke="#0b0b12" stroke-width="1.2"/></svg>';

// The comic sound-effect vocabulary, gathered from every events.emit('word', ...) call in the
// game (combat hits, every gadget, vehicles, stealth takedowns, breakables, level-up and the Bat
// Swarm's own two lines) so prewarmWords() (below) can pay sfx()'s one-time forced-layout cost
// for all of them at boot, not on whichever is first shown mid-play. Kept as one flat, loosely
// maintained list rather than importing each source's own words: missing a newly added word here
// costs nothing but that one word's first-use reflow, same as before this list existed.
export const SFX_WORDS = [
  'KRAK!', 'WHAM!', 'THWACK!', 'WHUMP!', 'POW!', 'BLAM!', 'KAPOW!', 'THWAMP!', 'KRUNCH!',
  'KA-BOOM!', 'WHAMMO!', 'SWOOSH-THWACK!', 'KRAKOOM!', 'BADOOM!', 'WHEEE-CRASH!', 'YOINK!',
  'KRSSSH!', 'TINK!', 'RIIIP!', 'KRZZT!', 'SPLUT!', 'KA-BLOOEY!', 'THUNK!', 'POP! POP! POP!',
  'WHIRRR!', 'FSSSHH!', 'LEVEL UP!', 'ZZZIP!', 'FWOOSH!', 'KA-THOOM!', 'THUD', 'TEAM UP!',
  'NIGHTY NIGHT!', 'SCREEECH!', 'BAZZAP!', 'SKREEEE!', 'FLAP FLAP KRAKOOM!', 'KA-CHUNK!',
  'KSSSSH!', 'KLANG!', 'SKREEK!',
];

// Chain icons, inked: a looped rope, two heads meeting, a boot coming down on a crater.
const CHAIN_ICON = [
  '<path d="M8 30 C8 14 30 14 30 24 C30 34 14 34 14 24 C14 14 36 12 40 22"/>',
  '<circle cx="14" cy="26" r="9"/><circle cx="34" cy="26" r="9"/><path d="M24 6 L24 13 M17 9 L21 15 M31 9 L27 15"/>',
  '<path d="M24 5 L24 29 M16 21 L24 31 L32 21 M8 41 L40 41 M12 37 L7 32 M36 37 L41 32"/>',
];

// Where a sound word's centre goes so the whole word stays on screen: w x h is its laid-out
// size, rotDeg its tilt, and the pop animation scales it to 1.15. m keeps it clear of the
// comic frame. If it would cover a box in `avoid` (DOMRect-like: the objective card, a showing
// hint, the HUD, a word still on screen), it takes the nearest spot just above, below, left or
// right of one of those boxes that stays on screen and covers none of them. A word wider than
// the screen is centred.
const POP = 1.15;
// Half the on-screen width and height of a word at its biggest (tilted, popped).
export function wordHalf(w, h, rotDeg) {
  const r = (Math.abs(rotDeg) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return { hw: (POP * (w * c + h * s)) / 2, hh: (POP * (w * s + h * c)) / 2 };
}
export function placeWord(x, y, w, h, rotDeg, view, avoid = [], m = 24) {
  const { hw, hh } = wordHalf(w, h, rotDeg);
  const x0 = hw + m, x1 = view.w - hw - m, y0 = hh + m, y1 = view.h - hh - m;
  const fit = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const px = fit(x, x0, x1), py = fit(y, y0, y1);
  const boxes = avoid.filter((b) => b && b.width > 0);
  const covers = (cx, cy) => boxes.some((b) => cx + hw > b.left && cx - hw < b.right && cy + hh > b.top && cy - hh < b.bottom);
  if (!covers(px, py)) return { x: px, y: py };
  let best = null, bd = Infinity;
  const tryAt = (cx, cy) => {
    if (cx < x0 - 1e-9 || cx > x1 + 1e-9 || cy < y0 - 1e-9 || cy > y1 + 1e-9 || covers(cx, cy)) return;
    const d = Math.hypot(cx - px, cy - py);
    if (d < bd) { bd = d; best = { x: cx, y: cy }; }
  };
  for (const b of boxes) {
    tryAt(px, b.top - hh - m);
    tryAt(px, b.bottom + hh + m);
    tryAt(b.left - hw - m, py);
    tryAt(b.right + hw + m, py);
  }
  // Nowhere free (a crowded screen): on screen where it was, flagged so the caller can retry with
  // fewer boxes.
  return best ?? { x: px, y: py, crowded: true };
}

// The middle of the screen, where a critical's action camera (and an impact frame) frames the
// blow: sound words keep off it while that shot plays.
export function actionFocusBox(view) {
  const left = view.w * 0.33, right = view.w * 0.67, top = view.h * 0.2, bottom = view.h * 0.82;
  return { left, right, top, bottom, width: right - left };
}

// Words ({ x, y, w, h, rot }) that cover `focus` get a new spot beside it, still on screen and off
// `ui` and the other words. Returns the moves ({ word, x, y }); words clear of it aren't listed.
export function moveOffFocus(words, focus, view, ui) {
  const moves = [];
  for (const word of words) {
    const { hw, hh } = wordHalf(word.w, word.h, word.rot);
    if (!(word.x + hw > focus.left && word.x - hw < focus.right && word.y + hh > focus.top && word.y - hh < focus.bottom)) continue;
    const others = words.filter((o) => o !== word).map((o) => {
      const h2 = wordHalf(o.w, o.h, o.rot);
      return { left: o.x - h2.hw, right: o.x + h2.hw, top: o.y - h2.hh, bottom: o.y + h2.hh, width: 2 * h2.hw };
    });
    let p = placeWord(word.x, word.y, word.w, word.h, word.rot, view, [...ui, focus, ...others]);
    if (p.crowded) p = placeWord(word.x, word.y, word.w, word.h, word.rot, view, [...ui, focus]);
    moves.push({ word, x: p.x, y: p.y });
  }
  return moves;
}

export function arcDash(fraction, circumference = C, span = 0.75) {
  const f = Math.min(1, Math.max(0, fraction));
  return `${(f * span * circumference).toFixed(2)} ${circumference.toFixed(2)}`;
}

// One player's own HUD (Long Night 2, workstream B): the combo counter, the chain icons and the
// health ring, in a .hud-slot container. Slot 0 is display: contents, so with one player the page
// lays out exactly as it always did; slot 1 mirrors it on the right (style.css).
const slotHtml = (index) => `<div class="hud-slot" data-slot="${index}">
    <div class="hud-combo hidden"><span class="x">x</span><span class="n">0</span></div>
    <div class="hud-chains hidden">${CHAIN_ICON.map((p, i) => `<div class="chain-ico" data-n="${i + 1}"><svg viewBox="0 0 48 48">${p}</svg><b>${i + 1}</b></div>`).join('')}</div>
    <svg class="hud-health" viewBox="0 0 120 120">
      <circle class="track" cx="60" cy="60" r="${R}" stroke-dasharray="${arcDash(1)}" transform="rotate(135 60 60)"/>
      <circle class="bar" cx="60" cy="60" r="${R}" stroke-dasharray="${arcDash(1)}" transform="rotate(135 60 60)"/>
      <path class="bat" d="${batSvgPath(0.62, 60, 62)}"/>
    </svg>
  </div>`;

// A slot's live parts and its setters.
function bindSlot(slotEl) {
  const combo = slotEl.querySelector('.hud-combo');
  const comboN = combo.querySelector('.n');
  const chainsEl = slotEl.querySelector('.hud-chains');
  const chainIcons = [...chainsEl.querySelectorAll('.chain-ico')];
  const healthEl = slotEl.querySelector('.hud-health');
  const bar = slotEl.querySelector('.bar');
  let chainKey = '', lastChainState = null, lastChainKeys = null, down = null;
  return {
    el: slotEl, combo, chainsEl, healthEl,
    setHealth(f) { bar.setAttribute('stroke-dasharray', arcDash(f)); },
    setCombo(n, readyAt = 8) {
      comboN.textContent = n;
      combo.classList.toggle('hidden', n === 0);
      combo.classList.toggle('ready', n >= readyAt);
      combo.classList.remove('pop');
      void combo.offsetWidth;
      if (n > 0) combo.classList.add('pop');
    },
    // Chain takedown icons under the combo counter (lit = affordable, blue = free from stealth).
    // state is the fighter's chains; keys are the bound key labels. Most frames pass the same two
    // objects and return at once; the DOM is touched only when what the icons show changed.
    setChains(state, keys) {
      if (state === lastChainState && keys === lastChainKeys) return;
      lastChainState = state;
      lastChainKeys = keys;
      const k = chainHudKey(state) + keys.join('');
      if (k === chainKey) return;
      chainKey = k;
      chainsEl.classList.toggle('hidden', !state.show);
      chainsEl.classList.toggle('stealth', !!state.stealth);
      chainIcons.forEach((ic, i) => { ic.classList.toggle('lit', !!state.affordable[i]); ic.querySelector('b').textContent = keys[i]; });
    },
    // A downed co-op hero: the ring becomes the revive progress (0..1); null: back on their feet.
    setDown(progress) {
      const on = progress !== null && progress !== undefined;
      if (!on && down === null) return;
      down = on ? progress : null;
      slotEl.classList.toggle('down', on);
      if (on) bar.setAttribute('stroke-dasharray', arcDash(progress));
    },
  };
}

export function createHud(root) {
  const el = document.createElement('div');
  el.className = 'hud';
  el.innerHTML = `
    ${slotHtml(0)}
    <div class="hud-caption"><div class="obj"></div><div class="trophies">${TROPHY}<span>0/12</span></div></div>
    <div class="hud-under"><div class="hud-locks"></div><div class="hud-chips"></div><div class="hud-arrive"><span class="arrive-k">NEXT</span><span class="arrive-t"></span></div></div>
    <div class="hud-banner"></div>
    <div class="hud-layer"></div>
    <div class="hud-hint"></div>
    <div class="hud-card"><div class="card-title"></div><div class="card-text"></div></div>
    <div class="hud-boss"><div class="boss-name">THE JOKER</div><div class="boss-track"><div class="boss-fill"></div></div></div>
    <div class="hud-speech"></div>
    <div class="hud-flash"></div>
    <div class="hud-speed"></div>`;
  root.appendChild(el);
  const slot0 = bindSlot(el.querySelector('.hud-slot'));
  const slots = [slot0];
  const { combo, chainsEl } = slot0;
  const obj = el.querySelector('.obj');
  const captionEl = el.querySelector('.hud-caption');
  // A new goal shows big in the middle for BANNER_MS, then the corner caption carries it.
  const bannerEl = el.querySelector('.hud-banner');
  const BANNER_MS = 2300;
  let bannerUntil = 0;
  const trophyCount = el.querySelector('.trophies span');
  const layer = el.querySelector('.hud-layer');
  const glyphs = new Map();
  const hintEl = el.querySelector('.hud-hint');
  const healthEl = slot0.healthEl;
  // Where the sound words still on screen sit, so a new one doesn't land on top of one.
  const liveWords = [];
  // Until when (performance.now) sound words keep off the action camera's framed blow.
  let focusUntil = 0;
  // sfx()'s own offsetWidth/offsetHeight read right after inserting the element is a forced
  // synchronous layout (the browser can't just batch it with the next paint), and the comic
  // vocabulary ("POW!", "THUD", a chain finisher's own line) repeats constantly in a real fight.
  // Cached by the exact string shown (word text plus the big/small class), so only a word's very
  // first appearance ever pays for the reflow; every repeat reuses the measured size. Cleared on
  // resize since font metrics (and so text layout) can change with the viewport.
  const wordSizeCache = new Map();
  window.addEventListener('resize', () => wordSizeCache.clear());
  // The objective card, a showing hint, the combo and chain icons and the health ring.
  // The objective marker (src/ui/waypoint.js, outside this HUD) is on the list too: a word like
  // SCREEECH! landing on it hid where to go. So is a showing vehicle message (vehicles.js).
  // Split screen (workstream D1): this HUD covers one player's view, `panel` ({ left, top, width,
  // height } CSS px), and word placement works in that panel's own coordinates. null: the whole
  // window, exactly as before co-op.
  let panel = null;
  const viewSize = () => (panel ? { w: panel.width, h: panel.height } : { w: innerWidth, h: innerHeight });
  // Boxes in this HUD's own coordinates (a split panel is offset on the page).
  const local = (r) => (!r || !panel ? r : { left: r.left - panel.left, right: r.right - panel.left, top: r.top - panel.top, bottom: r.bottom - panel.top, width: r.width, height: r.height });
  const uiBoxes = () => [captionEl.getBoundingClientRect(), hintEl.classList.contains('show') ? hintEl.getBoundingClientRect() : null,
    combo.getBoundingClientRect(), chainsEl.getBoundingClientRect(), healthEl.getBoundingClientRect(),
    // This HUD's own objective marker (each split view has one); the page's first one otherwise.
    (el.querySelector('.waypoint') ?? document.querySelector('.waypoint'))?.getBoundingClientRect() ?? null,
    document.querySelector('.vehicle-toast.show')?.getBoundingClientRect() ?? null,
    // [onboard] The goal-ahead tag and the chips under the caption.
    arriveEl.style.opacity > 0.05 ? arriveEl.getBoundingClientRect() : null, chipsEl.childElementCount ? chipsEl.getBoundingClientRect() : null,
    // [polish] Every other panel on screen: sound words keep to the action area.
    ...panelBoxes()].map(local);
  // [polish] The panels a sound word must never cover, this HUD's own and the page-wide ones (the
  // feed, the dialogue, the Bruce furniture). Read only when a word is placed, never per frame.
  const OWN_PANELS = '.hud-card.show, .hud-banner.show, .hud-boss.show, .ow-job.show, .ow-list, .minimap, .wanted-readout.show, .ghud, .hud-under, .radio-dial.show';
  const PAGE_PANELS = '.dlg-panel.show, .side-hud .show, .bw-meters.show, .bw-ticker > div, .bw-choices.show, .bw-goal.show, .vehicle-toast, .autosave-mark.show';
  function panelBoxes() {
    const out = [];
    const add = (r) => { if (r.width > 1 && r.height > 1) out.push(r); };
    for (const n of el.querySelectorAll(OWN_PANELS)) add(n.getBoundingClientRect());
    for (const n of document.querySelectorAll(PAGE_PANELS)) {
      if (n.classList.contains('vehicle-toast') && !(+getComputedStyle(n).opacity > 0.05)) continue;
      add(n.getBoundingClientRect());
    }
    return out;
  }
  const flashEl = el.querySelector('.hud-flash');
  const speedEl = el.querySelector('.hud-speed');
  let hintTimer = null;
  const cardEl = el.querySelector('.hud-card');
  const bossEl = el.querySelector('.hud-boss');
  const bossFill = el.querySelector('.boss-fill');
  // [story] The boss bar's name and phase pips (generalised from the hard-coded Joker bar).
  const bossName = el.querySelector('.boss-name');
  const bossPips = document.createElement('div');
  bossPips.className = 'boss-pips';
  bossPips.style.cssText = "text-align:center;font:16px 'Bangers',cursive;letter-spacing:4px;color:#efe6cf;-webkit-text-stroke:1px #0b0b12;margin-top:2px";
  bossEl.appendChild(bossPips);
  const speechEl = el.querySelector('.hud-speech');
  // [onboard] The centre of the screen belongs to the HUD director (src/ui/hudDirector.js): the goal
  // banner and the cards (WayneTech deliveries, level-ups, case-file ticks) take turns, wait out a
  // fight close by, and collapse to a chip under the caption when they can't wait. createCardQueue
  // stays exported for anyone using it directly.
  void createCardQueue;
  let compactHud = false;
  // [polish] Split screen: half a screen has no room for a centre card, so cards come as chips.
  const director = createHudDirector({ compact: () => cardsAsChips({ compact: compactHud, split: !!panel }) });
  const chipsEl = el.querySelector('.hud-chips');
  const arriveEl = el.querySelector('.hud-arrive');
  const arriveText = arriveEl.querySelector('.arrive-t');
  let arriveK = -1, arriveStr = '';
  let tickCtx = { combat: false, blocked: false };
  let lastTick = 0;
  function showItem(item) {
    if (item.kind === 'banner') {
      bannerEl.textContent = item.payload.text;
      bannerEl.classList.remove('show');
      void bannerEl.offsetWidth;
      bannerEl.classList.add('show');
      bannerUntil = performance.now() + BANNER_MS;
    } else {
      cardEl.querySelector('.card-title').textContent = item.payload.title;
      cardEl.querySelector('.card-text').textContent = item.payload.text;
      cardEl.classList.remove('show');
      void cardEl.offsetWidth;
      cardEl.classList.add('show');
    }
  }
  function hideItem(item) {
    if (item.kind === 'banner') bannerEl.classList.remove('show');
    else cardEl.classList.remove('show');
  }
  let chipKey = '';
  function renderChips() {
    const list = director.chips;
    const key = list.map((c) => c.id).join('|');
    if (key === chipKey) return;
    chipKey = key;
    const have = new Map([...chipsEl.children].map((c) => [c.dataset.id, c]));
    for (const [id, node] of have) if (!list.some((c) => c.id === id)) { node.classList.remove('in'); node.classList.add('out'); setTimeout(() => node.remove(), 220); have.delete(id); }
    for (const c of list) {
      if (have.has(c.id)) continue;
      const n = document.createElement('div');
      n.className = `hud-chip ${c.kind}`;
      n.dataset.id = c.id;
      n.textContent = c.text;
      chipsEl.appendChild(n);
      requestAnimationFrame(() => n.classList.add('in'));
    }
  }
  function runOps(ops) {
    let chipsDirty = false;
    for (const o of ops) {
      if (o.op === 'show') showItem(o.item);
      else if (o.op === 'hide') hideItem(o.item);
      else chipsDirty = true;
    }
    if (chipsDirty) renderChips();
  }
  function directorTick(ctx) {
    if (ctx) tickCtx = ctx;
    const now = performance.now();
    if (now - lastTick >= 30 || director.waiting) {
      lastTick = now;
      const ops = director.tick(now, tickCtx);
      if (ops.length) runOps(ops);
    }
    // Keep itself ticking while anything is queued, up or aging out, even when the game loop that
    // normally drives it isn't running (a comic, a menu, a sandbox): the last context stands.
    if (!rafPending && (director.waiting || director.current || director.chips.length) && typeof requestAnimationFrame === 'function') {
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; directorTick(); });
    }
  }
  let rafPending = false;
  const cards = {
    // A failed mission or a forced restart is news she must see now, fight or no fight.
    push: (title, text, ms) => director.request({ id: `card:${title}:${text}`, kind: 'card', ms, payload: { title, text }, chip: title, critical: /^(MISSION FAILED|BACK TO THE CHECKPOINT)/.test(title) }, performance.now()),
    dismiss: (minMs) => director.dismiss(performance.now(), minMs),
  };

  return {
    el,
    // Split screen: confine this HUD to one view's rect (CSS px), or null for the whole window.
    setPanel(rect) {
      panel = rect ? { ...rect } : null;
      el.classList.toggle('split', !!rect);
      el.style.left = rect ? `${rect.left}px` : '';
      el.style.top = rect ? `${rect.top}px` : '';
      el.style.width = rect ? `${rect.width}px` : '';
      el.style.height = rect ? `${rect.height}px` : '';
      el.style.right = rect ? 'auto' : '';
      el.style.bottom = rect ? 'auto' : '';
      wordSizeCache.clear();
    },
    get panel() { return panel; },
    viewSize,
    // Player 0's panel (every old call site); slot(i) and addSlot(i) reach the others.
    setHealth: (f) => slot0.setHealth(f),
    setCombo: (n, readyAt = 8) => slot0.setCombo(n, readyAt),
    setChains: (state, keys) => slot0.setChains(state, keys),
    slot: (i) => slots[i] ?? null,
    // Another player's panel (co-op): the same parts, mirrored on the right. Idempotent.
    addSlot(i) {
      if (slots[i]) return slots[i];
      const holder = document.createElement('div');
      holder.innerHTML = slotHtml(i);
      const slotEl = holder.firstElementChild;
      el.insertBefore(slotEl, captionEl);
      slots[i] = bindSlot(slotEl);
      return slots[i];
    },
    removeSlot(i) { if (i > 0 && slots[i]) { slots[i].el.remove(); slots[i] = null; } },
    setObjective(text) {
      if (obj.textContent === text) return;
      obj.textContent = text;
      // [onboard] What sits under the caption (a lock note, chips, the goal ahead) starts below it:
      // measured once per new goal, a frame later, never per frame.
      requestAnimationFrame(() => { const r = captionEl.offsetTop + captionEl.offsetHeight; if (r > 0) el.style.setProperty('--cap-bottom', `${r + 10}px`); });
      const cap = el.querySelector('.hud-caption');
      cap.style.display = text ? '' : 'none';
      cap.classList.remove('new');
      void cap.offsetWidth;
      cap.classList.add('new');
    },
    // One card at a time: one arriving over another waits its turn (src/ui/cardQueue.js).
    // A card that arrives under a new goal's banner (a gadget unlocked as the step begins) waits
    // for the banner to finish instead of covering it.
    card(title, text, ms = 7000) {
      const wait = bannerUntil - performance.now();
      if (wait > 0) setTimeout(() => cards.push(title, text, ms), wait);
      else cards.push(title, text, ms);
    },
    // The action is starting (a fight, getting into a vehicle): a card that has had its moment
    // (minMs on screen) comes down now instead of covering the view for the rest of its time.
    dismissCard(minMs = 1500) { cards.dismiss(minMs); },
    get cardShowing() { return cardEl.classList.contains('show'); },
    // [onboard] Once a frame (game.js): the director's turn. ctx: { combat, blocked }. Cheap: it
    // only touches the DOM when something arrives or leaves.
    tick: directorTick,
    // A small chip under the caption (checkpoint reached, a new ability, a collapsed card).
    chip(id, text, kind = 'chip') { director.chip(id, text, performance.now(), kind); renderChips(); },
    setCompact(on) {
      compactHud = !!on; el.classList.toggle('compact', compactHud); wordSizeCache.clear();
      // [polish] Compact has teeth: the page-wide panels (the feed, the dialogue, the Bruce card)
      // read it from the body, and a card already up folds into a chip now.
      if (typeof document !== 'undefined') document.body.classList.toggle('hud-compact', compactHud);
      const cur = director.current;
      if (compactHud && cur && cur.kind !== 'banner' && !cur.critical) { director.chip(cur.id, cur.chip ?? cur.payload?.title ?? '', performance.now(), cur.kind); director.dismiss(performance.now(), 0); renderChips(); directorTick(); }
    },
    // A scripted lock is on (Night Eight's gauntlet): a standing note under the caption until it
    // lifts (text null).
    setLocks(text) {
      const lk = el.querySelector('.hud-locks');
      if (text) lk.textContent = text;
      lk.classList.toggle('show', !!text);
    },
    get director() { return director; },
    // The goal ahead, revealed as she approaches it (k 0..1, src/ui/hudDirector.js approachLevel):
    // a 'NEXT' tag under the caption fades and rises in, so reaching the site never pops something
    // new out of nowhere. Written only when the quantised level or the text changes.
    setApproach(k, text = '') {
      const q = quantise(k);
      if (q === arriveK && text === arriveStr) return;
      if (text !== arriveStr) { arriveStr = text; arriveText.textContent = text; }
      arriveK = q;
      const r = revealStyle(text ? q : 0, !!getAccess().reducedMotion);
      arriveEl.style.opacity = String(r.opacity);
      arriveEl.style.transform = `translateY(${r.y.toFixed(1)}px) scale(${r.scale.toFixed(3)}) rotate(-1deg)`;
    },
    // A goal reached: the caption ticks off and the next goal takes its place a beat later.
    reached() {
      captionEl.classList.remove('done');
      void captionEl.offsetWidth;
      captionEl.classList.add('done');
      arriveEl.classList.add('promote');
      setTimeout(() => arriveEl.classList.remove('promote'), 700);
    },
    setTrophies(n, total) { trophyCount.textContent = `${n}/${total}`; },
    // edgeAngle: he is off screen and (x, y) is pinned to the screen edge (src/ui/edgeGlyph.js);
    // the bolt shrinks a little and a pointer faces him. null: over his head as usual.
    glyph(id, x, y, visible, color = 'blue', edgeAngle = null) {
      let g = glyphs.get(id);
      if (!visible) { if (g) { g.remove(); glyphs.delete(id); } return; }
      if (g && g.dataset.color !== color) { g.remove(); glyphs.delete(id); g = null; }
      if (!g) {
        g = document.createElement('div');
        g.className = `glyph ${color}`;
        g.dataset.color = color;
        // [prog] a11y: each tell has its own shape and pattern (counter bolt, spiked dodge, gun
        // crosshair, boss star), not only its colour (src/ui/accessibility.js TELLS).
        const tell = glyphTell(color, id);
        g.dataset.tell = tell.id;
        g.innerHTML = tellSvg(tell);
        layer.appendChild(g);
        glyphs.set(id, g);
      }
      g.style.left = `${x}px`;
      g.style.top = `${y}px`;
      g.classList.toggle('edge', edgeAngle !== null);
      if (edgeAngle !== null) g.style.setProperty('--a', `${edgeAngle}rad`);
    },
    clearGlyphs() { for (const g of glyphs.values()) g.remove(); glyphs.clear(); },
    // Removes glyphs for enemies that no longer exist (restarts, new waves).
    pruneGlyphs(keep) { for (const [id, g] of glyphs) if (!keep.has(id)) { g.remove(); glyphs.delete(id); } },
    // A caption at the bottom of the screen. html may contain <kbd> key labels.
    hint(html, ms = 3500) {
      hintEl.innerHTML = html;
      hintEl.classList.add('show');
      clearTimeout(hintTimer);
      if (ms > 0) hintTimer = setTimeout(() => hintEl.classList.remove('show'), ms);
    },
    hideHint() { hintEl.classList.remove('show'); },
    damage(amount) {
      flashEl.style.opacity = String(Math.min(0.75, 0.25 + amount / 40));
      flashEl.classList.remove('fade');
      void flashEl.offsetWidth;
      flashEl.classList.add('fade');
    },
    setVisible(v) { el.style.display = v ? '' : 'none'; },
    // [onboard] Through the director: it shows when the centre is free and no fight is close, else
    // collapses to the corner caption (which already carries the goal).
    banner(text) {
      director.request({ id: `banner:${text}`, kind: 'banner', ms: BANNER_MS, payload: { text }, chip: null, collapse: null }, performance.now());
      bannerUntil = performance.now() + BANNER_MS;
      directorTick();
    },
    get bannerShowing() { return performance.now() < bannerUntil || director.current?.kind === 'banner'; },
    // [story] opts (the boss framework, src/bosses/director.js): { name, phases, colors: [a, b] }.
    // Without opts it is the Joker's bar exactly as before.
    bossBar(visible, fraction = 1, phase = 0, opts = null) {
      bossEl.classList.toggle('show', visible);
      if (!visible) return;
      bossFill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
      const name = opts?.name ?? 'THE JOKER';
      if (bossName.textContent !== name) bossName.textContent = name;
      const colors = opts?.colors ?? null;
      const bg = colors ? `repeating-linear-gradient(90deg, ${colors[0]} 0 14px, ${colors[1]} 14px 18px)` : '';
      if (bossFill.dataset.bg !== bg) { bossFill.dataset.bg = bg; bossFill.style.background = bg; }
      const pips = opts?.phases ? Array.from({ length: opts.phases }, (_, i) => (i < (phase || 1) ? '◆' : '◇')).join(' ') : '';
      if (bossPips.textContent !== pips) bossPips.textContent = pips;
    },
    speech(text) {
      if (!text) { speechEl.classList.remove('show'); return; }
      speechEl.textContent = text;
      speechEl.classList.add('show');
    },
    speechPos(x, y, visible = true) {
      speechEl.style.left = `${x}px`;
      speechEl.style.top = `${y}px`;
      speechEl.style.visibility = visible ? 'visible' : 'hidden';
    },
    // Comic speed lines burst on a critical hit; chain finishers pick their own ('rope', 'head', 'domino').
    critical(variant = '') {
      speedEl.className = 'hud-speed';
      void speedEl.offsetWidth;
      speedEl.className = `hud-speed on ${variant}`.trim();
    },
    sfx(word, x, y, big = false) {
      const s = document.createElement('div');
      s.className = big ? 'sfx big' : 'sfx';
      s.textContent = word;
      const rot = Math.random() * 24 - 12;
      s.style.setProperty('--r', `${rot.toFixed(1)}deg`);
      layer.appendChild(s);
      // Measured once per distinct word (see wordSizeCache above), now it's laid out: keep it on
      // screen, off the objective card, a showing hint, the combo and chain icons, the health
      // ring and any word still on screen.
      const sizeKey = big ? `1:${word}` : `0:${word}`;
      let size = wordSizeCache.get(sizeKey);
      if (!size) { size = { w: s.offsetWidth, h: s.offsetHeight }; wordSizeCache.set(sizeKey, size); }
      const { w, h } = size;
      const view = viewSize();
      const ui = uiBoxes();
      // While a critical's action shot plays, the middle of the screen is the blow itself.
      if (performance.now() < focusUntil) ui.push(actionFocusBox(view));
      let p = placeWord(x, y, w, h, rot, view, [...ui, ...liveWords]);
      // Too crowded to miss every word: overlapping a word beats covering the card or the HUD.
      if (p.crowded) p = placeWord(x, y, w, h, rot, view, ui);
      // [polish] Nowhere in the action area at all (a screen full of panels): no word, rather than
      // one printed over a panel someone is reading.
      if (p.crowded) { s.remove(); return; }
      const { hw, hh } = wordHalf(w, h, rot);
      const box = { left: p.x - hw, right: p.x + hw, top: p.y - hh, bottom: p.y + hh, width: 2 * hw, el: s, x: p.x, y: p.y, w, h, rot };
      liveWords.push(box);
      s.addEventListener('animationend', () => { s.remove(); const i = liveWords.indexOf(box); if (i >= 0) liveWords.splice(i, 1); });
      s.style.left = `${p.x}px`;
      s.style.top = `${p.y}px`;
    },
    // Pays sfx()'s one-time forced-layout cost for a batch of words up front (called once at
    // boot, after the 'Bangers' comic font is confirmed loaded, alongside the rest of the
    // loading-screen warm-up), so nothing mid-play is the very first appearance of its text. A
    // word this list misses just falls back to sfx()'s own pay-on-first-use behaviour: safe to
    // under-list, never wrong to over-list.
    prewarmWords(words) {
      for (const text of words) {
        for (const big of [false, true]) {
          const key = big ? `1:${text}` : `0:${text}`;
          if (wordSizeCache.has(key)) continue;
          const s = document.createElement('div');
          s.className = big ? 'sfx big' : 'sfx';
          s.textContent = text;
          s.style.visibility = 'hidden';
          layer.appendChild(s);
          wordSizeCache.set(key, { w: s.offsetWidth, h: s.offsetHeight });
          layer.removeChild(s);
        }
      }
    },
    // A critical's action shot is about to frame the blow in the middle of the screen: words keep
    // off it for `ms`, and any word already there (emitted a moment before) steps aside.
    focus(ms) {
      focusUntil = performance.now() + ms;
      const view = viewSize();
      for (const m of moveOffFocus(liveWords, actionFocusBox(view), view, uiBoxes())) {
        const b = m.word, { hw, hh } = wordHalf(b.w, b.h, b.rot);
        b.x = m.x; b.y = m.y;
        b.left = m.x - hw; b.right = m.x + hw; b.top = m.y - hh; b.bottom = m.y + hh;
        b.el.style.left = `${m.x}px`;
        b.el.style.top = `${m.y}px`;
      }
    },
  };
}
