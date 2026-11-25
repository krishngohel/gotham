// The co-op hero select (workstream D1): one comic column per player, each driven by that
// player's own device (src/coop/deviceWatch.js nav), over a live 3D preview of the picked heroes
// (src/coop/heroPreview.js). Left/right picks the hero, up/down the suit, A / Enter readies,
// B / Esc goes back (un-ready, then leave). A column shows the hero's name, tagline, how they move,
// four stat bars and their two signature moves; locked suits show their unlock text.
//
//   const sel = createHeroSelect({ root, progress, sound, onDone, onCancel })
//   sel.open({ slots: [{ device, kitId, label }], allowJoin, mode })  then sel.update(watch) a frame
// onDone([kitId, ...]) once every column is ready; onCancel() when player 1 backs out.
import { HEROES, heroKits, kitById, heroOfKit, kitInfo } from '../heroes/roster.js';
import { suitById } from '../heroes/models/suits.js';
// [prog] suits: the same unlock rule as the wardrobe (suits.js conditions, plus campaign rewards).
import { isSuitUnlocked } from '../progress/suitData.js';

const MOVE_STYLE = {
  glide: 'Cape glide + grapple', acrobat: 'Acrobat: flips, quick lines, no glide', wings: 'Glider wings + grapple',
  flight: 'Flight (stamina, low ceiling)', grapple: 'Grapple + brawler jumps',
};
const STAT_LABELS = [['health', 'Health'], ['speed', 'Speed'], ['damage', 'Power'], ['toughness', 'Toughness']];
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createHeroSelect({ root = document.body, progress, sound = () => {}, onChange = () => {} } = {}) {
  const el = document.createElement('div');
  el.className = 'hero-select';
  root.appendChild(el);
  let cols = [];
  let callbacks = null;
  let opened = false;

  const unlocked = (suitId) => isSuitUnlocked(suitId, progress); // [prog] suits
  // A column's hero index and suit index from a kit id.
  function locate(kitId) {
    const kit = kitById(kitId);
    const h = heroOfKit(kit);
    const hi = Math.max(0, HEROES.indexOf(h));
    const kits = heroKits(h.id, unlocked);
    const si = Math.max(0, kits.findIndex((k) => k.kit.id === kit.id));
    return { hi, si };
  }
  function currentKit(c) {
    const kits = heroKits(HEROES[c.hi].id, unlocked);
    return kits[Math.min(c.si, kits.length - 1)];
  }

  function render() {
    el.innerHTML = `<div class="hs-title">Choose your heroes</div><div class="hs-cols">${cols.map(colHtml).join('')}</div>
      <div class="hs-foot">${callbacks?.footer ?? ''}</div>`;
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', (e) => {
      const c = cols[Number(b.dataset.col)];
      if (!c || c.device !== 'kbm') return;
      act(c, b.dataset.act);
      e.stopPropagation();
    }));
  }

  function colHtml(c, i) {
    if (c.waiting) return `<div class="hs-col waiting" data-slot="${i}"><div class="hs-player">PLAYER ${i + 1}</div><div class="hs-join">Press <b>Start</b> / <b>A</b> on a controller<br>or <b>Enter</b> on the keyboard to join</div></div>`;
    const entry = currentKit(c);
    const kit = entry.kit, h = heroOfKit(kit), info = kitInfo(kit);
    const kits = heroKits(h.id, unlocked);
    const suitName = (k) => (h.suits ? suitById(k.kit.id).name : h.name);
    const stats = STAT_LABELS.map(([k, label]) => {
      const v = info.stats?.[k] ?? 1;
      return `<div class="hs-stat"><span>${label}</span><i style="--v:${Math.max(0.15, Math.min(1, (v - 0.6) / 0.9)).toFixed(2)}"></i></div>`;
    }).join('');
    const sigs = (info.signature ?? []).map((s) => `<li>${esc(s.name)}</li>`).join('');
    const lock = entry.locked ? `<div class="hs-lock">Locked: ${esc(suitById(kit.id).unlock?.text ?? '')}</div>` : '';
    return `<div class="hs-col${c.ready ? ' ready' : ''}" data-slot="${i}">
      <div class="hs-player">PLAYER ${i + 1} <small>${esc(c.label ?? '')}</small></div>
      <div class="hs-hero"><button class="hs-arrow" data-act="left" data-col="${i}">&#9664;</button><div class="hs-name">${esc(h.name)}</div><button class="hs-arrow" data-act="right" data-col="${i}">&#9654;</button></div>
      <div class="hs-tag">${esc(h.tagline)}</div>
      <div class="hs-style">${esc(MOVE_STYLE[info.traversal.style] ?? info.traversal.style)}</div>
      <div class="hs-stats">${stats}</div>
      <div class="hs-sig"><b>Signature moves</b><ul>${sigs}</ul></div>
      <div class="hs-suits">${kits.length > 1 ? `<button class="hs-arrow small" data-act="up" data-col="${i}">&#9650;</button>` : ''}<span>${esc(suitName(entry))}</span>${kits.length > 1 ? `<button class="hs-arrow small" data-act="down" data-col="${i}">&#9660;</button><em>${c.si + 1}/${kits.length}</em>` : ''}</div>
      ${lock}
      <div class="hs-ready">${c.ready ? 'READY!' : c.remote ? 'Choosing&hellip;' : `<button class="mbtn primary" data-act="ok" data-col="${i}">Ready</button>`}</div>
      <div class="hs-keys">${c.remote ? 'Online player' : c.device === 'kbm' ? 'A/D hero · W/S suit · Enter ready · Esc back' : '&#9664; &#9654; hero · &#9650; &#9660; suit · A ready · B back'}</div>
    </div>`;
  }

  function act(c, a) {
    if (c.waiting) return;
    if (a === 'back') {
      if (c.ready) { c.ready = false; sound('uiMove'); }
      else if (cols.indexOf(c) === 0 || callbacks.joinedOnly) { close(); callbacks.onCancel?.(); return; }
      else { c.waiting = true; callbacks.onLeave?.(cols.indexOf(c)); }
      render(); return;
    }
    if (c.ready) return;
    if (c.remote) return;
    if (a === 'left' || a === 'right') {
      c.hi = (c.hi + (a === 'left' ? -1 : 1) + HEROES.length) % HEROES.length;
      c.si = 0;
      // The first suit this save can wear.
      const kits = heroKits(HEROES[c.hi].id, unlocked);
      c.si = Math.max(0, kits.findIndex((k) => !k.locked));
      // [prog] suits: the look the wardrobe equipped for this hero, if it can be worn.
      const eq = kits.findIndex((k) => !k.locked && k.kit.id === progress?.wardrobe?.equipped?.[HEROES[c.hi].id]);
      if (eq >= 0) c.si = eq;
      sound('uiMove');
    } else if (a === 'up' || a === 'down') {
      const kits = heroKits(HEROES[c.hi].id, unlocked);
      c.si = (c.si + (a === 'up' ? -1 : 1) + kits.length) % kits.length;
      sound('uiMove');
    } else if (a === 'ok') {
      if (currentKit(c).locked) { sound('uiBack'); return; }
      c.ready = true;
      sound('uiSelect');
    }
    render();
    onChange(picks());
    // [net] An online lobby hears about this machine's own column (its pick and ready state).
    callbacks.onColumn?.(cols.indexOf(c), { kit: currentKit(c).kit.id, ready: c.ready });
    if (cols.length && cols.every((x) => x.ready || (x.waiting && callbacks.optional))) {
      const out = picks();
      close();
      callbacks.onDone(out);
    }
  }

  // The kit id each column shows right now (null for a column still waiting for a player).
  const picks = () => cols.map((c) => (c.waiting ? null : currentKit(c).kit.id));

  function close() { opened = false; el.classList.remove('show'); el.innerHTML = ''; }

  return {
    get open() { return opened; },
    get picks() { return picks(); },
    // slots: [{ device, kitId, label, waiting }]; optional: a waiting column does not block
    // (the pre-game lobby: player 2 may join or not); joinedOnly: Back from any column cancels.
    show(slots, cbs) {
      callbacks = cbs;
      // fresh: the press that opened a column (Start / A / Enter) is not also its first choice.
      cols = slots.map((s) => ({ ...locate(s.kitId ?? 'm'), device: s.remote ? null : s.device ?? null, remote: !!s.remote, label: s.label ?? '', ready: !!s.ready, waiting: !!s.waiting, fresh: true }));
      opened = true;
      el.classList.add('show');
      render();
      onChange(picks());
    },
    // A device joined a waiting column (the lobby).
    fill(i, device, kitId, label) {
      const c = cols[i];
      if (!c) return;
      Object.assign(c, locate(kitId ?? 'robin'), { device, label, waiting: false, ready: false, fresh: true });
      render();
      onChange(picks());
    },
    // [net] An online partner's column, driven from the wire: its pick and whether it is ready.
    remote(i, { kitId, ready, label }) {
      const c = cols[i];
      if (!c || !c.remote) return;
      const wasReady = c.ready;
      Object.assign(c, locate(kitId ?? 'robin'), { ready: !!ready, waiting: false });
      if (label !== undefined) c.label = label;
      render();
      onChange(picks());
      if (!wasReady && c.ready && cols.every((x) => x.ready)) { const out = picks(); close(); callbacks.onDone(out); }
    },
    // The column a device drives, or -1.
    columnOf(device) { return cols.findIndex((c) => !c.waiting && c.device === device); },
    update(watch) {
      if (!opened) return;
      for (const c of cols) {
        if (c.waiting || c.device === null) continue;
        if (c.fresh) { c.fresh = false; continue; }
        const n = watch.nav(c.device);
        if (n.left) act(c, 'left');
        else if (n.right) act(c, 'right');
        else if (n.up) act(c, 'up');
        else if (n.down) act(c, 'down');
        else if (n.ok || n.start) act(c, 'ok');
        else if (n.back) act(c, 'back');
        if (!opened) return;
      }
    },
    close,
  };
}
