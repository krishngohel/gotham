// Title, suit select, pause, settings (with key rebinding), controls help and credits.
import { ACTIONS, DEFAULT_BINDINGS, keyLabel, rebind } from '../core/bindings.js';
import { saveSettings } from '../core/settings.js';
import { TIERS, TIER_LABELS } from '../render/quality.js';
import { loadAutoTier } from '../render/tierDetect.js';
import { promptText } from './prompts.js';
import { drawProgressMap, districtLines } from './progressMap.js';
import { whatsNewSections, whatsNewHeadline } from './whatsNew.js';
import STORY from '../story.config.js';
import { MOVE_TABLE } from '../combat/moveSelect.js';
import { SUITS } from '../heroes/models/suits.js';
import { isSuitUnlocked } from '../progress/suitData.js'; // [prog] campaign-reward suits count too
import { DIFFICULTY_INFO } from '../progress/mode.js'; // [prog]
import { DIFFICULTIES } from '../combat/rules.js'; // [prog]
import { getAudioPrefs, setAudioPrefs } from '../audio/prefs.js';
import { buildAccessibilityTab, buildPadBindings, buildPadLook } from './accessibility.js'; // [prog] a11y

const MOVING_AROUND = ['ladder', 'ledge', 'zip', 'wallrun', 'divebomb', 'takedown'];
const PREDATOR = ['crouch', 'silent', 'perch', 'perchDrop', 'distract', 'vent', 'ledgeStealth', 'spotted', 'rifle'];
const CHAIN_TIPS = ['chain', 'chainTied'];

const PAD_LAYOUT = [
  ['Move / camera', 'Left stick / right stick'], ['Jump, glide', 'A'], ['Punch', 'X'], ['Kick', 'B'], ['Block, counter', 'Y'],
  ['Grab and throw', 'D-pad right'], ['Grapple', 'LB'], ['Cape stun', 'RB (tap)'], ['Dodge', 'LT'], ['Use gadget', 'RT'], ['Sprint', 'Hold L3'], ['Crouch', 'Tap L3'], ['Special takedown', 'R3'],
  ['Chain takedowns', 'Hold Y, then D-pad left, up or right'], ['Chain takedown 4 (Bat Swarm)', 'Hold Y, then LB'],
  ['Gadget wheel', 'Hold RB, pick with the right stick'],
  ['Detective vision', 'Tap View'], ['City map (A drops a waypoint)', 'Hold View'], ['Photo mode', 'D-pad up'], ['Pause', 'Menu'], // [polish] hold View: map
  ['Vehicle: summon, enter or exit', 'D-pad left'],
];

// Some gadget prompts already open with "Name: ..." (see src/ui/prompts.js); the help list
// prepends its own bold name, so drop a matching leading "Name:" here rather than show it twice.
// Never touches the prompt text itself, only this one rendering.
function dropLeadingName(name, text) {
  const prefix = `${name}:`;
  return text.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()
    ? text.slice(prefix.length).trimStart()
    : text;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function createMenus({ root, settings, storage, input, sound = () => {}, onChange = () => {} }) {
  const layer = el('div', 'menu-layer');
  root.appendChild(layer);
  let current = null;
  let gadgetHelp = () => [];

  function show(node) {
    layer.innerHTML = '';
    layer.appendChild(node);
    layer.classList.add('show');
    current = node;
    node.querySelector('button')?.focus({ preventScroll: true });
  }
  function hide() { layer.classList.remove('show'); layer.innerHTML = ''; current = null; }

  // [polish] Tabs tick, Back/Done/Resume step back, everything else confirms (src/ui/uiSounds.js
  // maps these onto the audio system's ui-bus sounds); focus moves (mouse, arrows, pad) tick too.
  const clickSound = (label, cls) => (/tab/.test(cls) ? 'uiTab' : /^(Back|Done|Resume|Close)$/i.test(label) ? 'uiBack' : 'uiSelect');
  const button = (label, fn, cls = '') => {
    const b = el('button', `mbtn ${cls}`, label);
    const snd = clickSound(label, cls);
    b.addEventListener('click', (e) => { e.stopPropagation(); sound(snd); fn(); });
    b.addEventListener('mouseenter', () => sound('uiMove'));
    return b;
  };
  // [polish] Keyboard: the arrow keys walk the buttons of a page in order (Tab still works), the
  // way the D-pad does (game.js padControls). Pages that move focus by position (data-nav
  // spatial), text fields and a key being rebound keep their keys.
  layer.addEventListener('keydown', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const t = e.target;
    if (t?.tagName === 'INPUT' || t?.tagName === 'SELECT' || t?.closest?.('[data-nav="spatial"]') || layer.querySelector('.listening')) return;
    const buttons = [...layer.querySelectorAll('button')].filter((b) => b.offsetParent !== null && !b.disabled);
    if (!buttons.length) return;
    const i = buttons.indexOf(document.activeElement);
    const d = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1;
    buttons[i < 0 ? 0 : (i + d + buttons.length) % buttons.length].focus({ preventScroll: false });
    sound('uiMove');
    e.preventDefault();
  });

  function save() { saveSettings(storage, settings); onChange(settings); }

  // ---------- title ----------
  // [polish] The game's name, one clear primary action, grouped secondary actions (story, play
  // together) and a quiet row of links; the city drifts by on the right (src/ui/titleCam.js).
  // Pads walk the buttons in this order (game.js padControls).
  function title(opts) {
    const { canContinue, percent = null, onContinue, onNew, onCoop = null, onHostOnline = null, onJoinOnline = null } = opts;
    const again = () => title(opts);
    const node = el('div', 'menu title-menu');
    node.appendChild(el('div', 'logo', '<span class="l1">Gotham</span><span class="l2"><i>The Long Night</i></span><span class="kicker">An unofficial comic-book fan game</span>'));
    const main = el('div', 'tm-main');
    const primary = canContinue
      ? button('Continue', onContinue, 'primary tm-primary')
      : button('Start', onNew, 'primary tm-primary');
    // The save line rides on the primary button: what Continue resumes, or what Start begins.
    const sub = el('span', 'tm-sub');
    sub.textContent = canContinue
      ? [percent == null ? null : `${percent}% complete`, opts.slotLine].filter(Boolean).join(' · ')
      : 'Night One: a new story begins';
    primary.appendChild(sub);
    main.appendChild(primary);
    node.appendChild(main);
    const group = (label, buttons) => {
      const list = buttons.filter(Boolean);
      if (!list.length) return;
      const g = el('div', 'tm-group');
      g.appendChild(el('div', 'tm-label', label));
      const row = el('div', 'tm-row');
      for (const b of list) row.appendChild(b);
      g.appendChild(row);
      node.appendChild(g);
    };
    // [prog] New Game Plus (a finished save), and the three save slots.
    group('Story', [
      canContinue ? button('New game', onNew, 'tm-btn') : null,
      opts.onNgPlus ? button('New Game Plus', opts.onNgPlus, 'tm-btn ngplus') : null,
      opts.onSlots && canContinue ? button('Save slots', opts.onSlots, 'tm-btn slots') : null,
    ]);
    // Local co-op (workstream D1) and online co-op (workstream D2).
    group('Play together', [
      onCoop ? button('Two players', onCoop, 'tm-btn coop') : null,
      onHostOnline ? button('Host online', onHostOnline, 'tm-btn net-host') : null,
      onJoinOnline ? button('Join with code', onJoinOnline, 'tm-btn net-join') : null,
    ]);
    const links = el('div', 'tm-links');
    // A fresh start has no story row: the slots (other saves may live there) join the links.
    if (opts.onSlots && !canContinue) links.appendChild(button('Save slots', opts.onSlots, 'tm-link slots'));
    links.appendChild(button("What's new", () => whatsNew(again), 'tm-link'));
    links.appendChild(button('Settings', () => openSettings(again), 'tm-link'));
    links.appendChild(button('Controls', () => help(again), 'tm-link'));
    links.appendChild(button('Credits', () => credits({ onClose: again }), 'tm-link'));
    node.appendChild(links);
    node.appendChild(el('div', 'foot', 'Best with headphones. Mouse and keyboard, or a gamepad.'));
    show(node);
  }

  // ---------- suit select ----------
  // [prog] `header` (optional): an element shown above the cards (the new-game difficulty row).
  function suitSelect({ gold, onPick, onBack, progress = null, header = null, title: heading = 'Choose your suit' }) {
    const node = el('div', 'menu suit-menu');
    node.appendChild(el('h2', '', heading));
    if (header) node.appendChild(header);
    const row = el('div', 'suits');
    // Card art: front views from the suit reference sheets. The gold suit reuses Batman's card
    // with a CSS gold tint.
    // Batman's suits come from the data table (src/heroes/models/suits.js). The original three
    // keep their cards and the gold one still shows only once unlocked. The alternates show
    // locked, with their unlock text, until `progress` (when the caller passes it) meets it.
    // Without `progress` (a caller not yet wired for alternates) only the original three show.
    const suits = SUITS.filter((s) => s.hero === 'batman' && (s.id !== 'gold' || gold) && (progress || ['m', 'f', 'gold'].includes(s.id)));
    for (const s of suits) {
      const { id } = s;
      const locked = id !== 'gold' && !!s.unlock && !(progress && isSuitUnlocked(s.id, progress));
      const tint = s.cardFilter && id !== 'gold' ? ` style="filter:${s.cardFilter}"` : '';
      const card = el('button', `suit-card suit-${id}${locked ? ' locked' : ''}`, `<div class="swatch"><img src="./assets/art/${s.card}.webp" alt="" draggable="false"${tint}></div><div class="sname">${s.name}</div><div class="sdesc">${locked ? `Locked: ${s.unlock.text}` : s.desc}</div>`);
      if (locked) { card.disabled = true; row.appendChild(card); continue; }
      card.addEventListener('click', () => { sound('uiSelect'); onPick(id); });
      card.addEventListener('mouseenter', () => sound('uiMove'));
      row.appendChild(card);
    }
    node.appendChild(row);
    if (onBack) node.appendChild(button('Back', onBack, 'small'));
    show(node);
  }

  // ---------- pause ----------
  // opts: { onResume, onRestart, onTitle, info?: { challenge, crimesStopped, percent },
  //         onQuitChallenge?, onChallenges?, onProgress?, onPhoto? }
  function pause(opts) {
    const { onResume, onRestart, onTitle, info = {}, onQuitChallenge, onChallenges, onProgress, onCaseFile, onPhoto, onWayneTech } = opts;
    const again = () => pause(opts);
    const node = el('div', 'menu pause-menu');
    node.appendChild(el('h2', '', 'Paused'));
    const list = el('div', 'mlist');
    list.appendChild(button('Resume', onResume, 'primary'));
    if (info.challenge && onQuitChallenge) list.appendChild(button('Quit challenge', onQuitChallenge));
    if (onChallenges) list.appendChild(button('Challenges', onChallenges));
    if (onProgress) list.appendChild(button(info.percent != null ? `Progress, ${info.percent}%` : 'Progress', onProgress));
    if (onCaseFile) list.appendChild(button(info.caseFile ? `Case file, ${info.caseFile}` : 'Case file', onCaseFile));
    if (onWayneTech) list.appendChild(button(info.wayneFree ? `WayneTech, ${info.wayneFree} to spend` : 'WayneTech', onWayneTech, info.wayneFree ? 'glow' : ''));
    if (onPhoto) list.appendChild(button('Photo mode', onPhoto));
    list.appendChild(button('Controls', () => help(again)));
    list.appendChild(button('Settings', () => openSettings(again)));
    // Co-op extras (workstream D1): add or drop a player, regroup, the split layout.
    for (const x of opts.extra ?? []) list.appendChild(button(x.label, x.onClick, x.cls ?? ''));
    list.appendChild(button('Restart from checkpoint', onRestart));
    list.appendChild(button('Quit to title', onTitle));
    node.appendChild(list);
    if (info.crimesStopped != null) node.appendChild(el('p', 'note', `Crimes stopped: ${info.crimesStopped}`));
    show(node);
  }

  // ---------- case file ----------
  function caseFilePage(data, { onBack }) {
    const node = el('div', 'menu case-menu');
    node.appendChild(el('h2', '', data.title));
    const list = el('ul', 'case-list');
    for (const c of data.items) {
      const li = el('li', c.done ? 'done' : '');
      li.textContent = c.label;
      list.appendChild(li);
    }
    node.appendChild(list);
    node.appendChild(button('Back', onBack, 'small'));
    show(node);
  }

  // ---------- challenges ----------
  function challengesPage(data, { onBack, onRead }) {
    const node = el('div', 'menu challenges-menu');
    node.appendChild(el('h2', '', 'Challenges'));
    const list = el('div', 'cr-list');
    for (const c of data.list) {
      const row = el('div', `cr-row medal-${c.medal ?? 'none'}`, '<span class="cr-medal"></span><span class="cr-title"></span><span class="cr-best"></span><span class="cr-blurb"></span><span class="cr-goal"></span>');
      row.querySelector('.cr-title').textContent = c.name;
      row.querySelector('.cr-best').textContent = c.best ?? 'Not tried yet';
      row.querySelector('.cr-blurb').textContent = c.blurb;
      row.querySelector('.cr-goal').textContent = c.goal;
      list.appendChild(row);
    }
    node.appendChild(list);
    node.appendChild(el('p', 'note', 'Walk into a glowing bat pillar to start. Detective vision shows every pillar through walls.'));
    if (data.goldStandard) node.appendChild(button('Read: The Gold Standard', onRead, 'primary'));
    else node.appendChild(el('p', 'note', 'Gold in every challenge unlocks a comic page: The Gold Standard.'));
    node.appendChild(button('Back', onBack, 'small'));
    show(node);
  }

  // ---------- progress ----------
  function progressPage(data, { onBack, onRead }) {
    const node = el('div', 'menu progress-menu');
    node.appendChild(el('h2', '', `Progress: ${data.percent}%`));
    const wrap = el('div', 'pg-wrap');
    const map = el('canvas', 'pg-map');
    const parts = el('div', 'pg-parts');
    for (const p of data.parts) {
      const row = el('div', 'pg-row', '<div class="pg-head"><span class="pg-label"></span><span class="pg-count"></span></div><div class="pg-bar"><i></i></div><div class="pg-detail"></div>');
      row.querySelector('.pg-label').textContent = p.label;
      row.querySelector('.pg-count').textContent = `${p.done}/${p.total}`;
      row.querySelector('.pg-bar i').style.width = `${Math.round(p.fraction * 100)}%`;
      row.querySelector('.pg-detail').textContent = p.detail;
      parts.appendChild(row);
    }
    // [map] Each visited district's trophies, medals, hidden items and crimes (src/ui/progressMap.js).
    for (const line of districtLines(data.map ?? {})) parts.appendChild(el('div', 'pg-detail pg-district', line));
    wrap.append(map, parts);
    node.appendChild(wrap);
    const stats = el('p', 'pg-stats');
    stats.textContent = data.statsLine;
    node.appendChild(stats);
    if (data.commendation) node.appendChild(button('Read: From Commissioner Gordon', onRead, 'primary'));
    node.appendChild(button('Back', onBack, 'small'));
    show(node);
    // Sized and drawn once the map is actually laid out, so the backing store matches its real
    // CSS box (min(320px, 80vw), see .pg-map) instead of guessing it. Backing store = CSS size x
    // device pixel ratio (capped at 2), floored at 540 so non-Retina screens keep today's crispness.
    // drawProgressMap scales its own drawing to canvas.width/height, so this alone fixes the soft
    // render on Retina screens (DPR 2, e.g. a 2021 MacBook Air); it's still one draw per open, no
    // per-frame redraw.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const boxSize = map.getBoundingClientRect().width || 320;
    const backing = Math.max(540, Math.round(boxSize * dpr));
    map.width = backing;
    map.height = backing;
    drawProgressMap(map, data.map);
  }

  // ---------- WayneTech ----------
  // data: wayne.page(). Every card is a button so a gamepad can browse them; only buyable ones buy.
  // Text goes in with textContent.
  const WT_STATE = { owned: 'Built', buyable: 'Build it: 1 point', poor: 'Needs 1 point', locked: 'Needs the one above' };
  function wayneTechPage(data, { onBuy, onBack, focus = null }) {
    const node = el('div', 'menu wt-menu');
    node.appendChild(el('div', 'wt-head', '<span class="wt-logo">WAYNETECH</span><span class="wt-sub">Applied Sciences Division</span>'));
    const bar = el('div', 'wt-xp', '<div class="wt-level"></div><div class="wt-bar"><i></i></div><div class="wt-points"></div><div class="wt-next"></div>');
    bar.querySelector('.wt-level').textContent = `Level ${data.level}`;
    bar.querySelector('.wt-bar i').style.width = `${Math.round(data.fraction * 100)}%`;
    bar.querySelector('.wt-points').textContent = data.allOwned ? 'Every upgrade built' : data.free === 1 ? '1 point to spend' : `${data.free} points to spend`;
    bar.querySelector('.wt-next').textContent = `${data.xp.toLocaleString('en-US')} XP. ${data.need.toLocaleString('en-US')} more to level ${data.level + 1}.`;
    node.appendChild(bar);
    const trees = el('div', 'wt-trees');
    for (const t of data.trees) {
      const col = el('div', `wt-tree wt-${t.id}`);
      col.appendChild(el('h3', '', t.name));
      for (const u of t.upgrades) {
        const card = el('button', `mbtn wt-card ${u.state}`, '<span class="wt-tier"></span><span class="wt-name"></span><span class="wt-text"></span><span class="wt-state"></span>');
        card.dataset.id = u.id;
        card.querySelector('.wt-tier').textContent = String(u.tier);
        card.querySelector('.wt-name').textContent = u.name;
        card.querySelector('.wt-text').textContent = u.text;
        card.querySelector('.wt-state').textContent = WT_STATE[u.state];
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          if (u.state === 'buyable') onBuy(u.id);
          else sound('uiRefuse'); // [polish]
        });
        card.addEventListener('mouseenter', () => sound('uiMove'));
        col.appendChild(card);
      }
      trees.appendChild(col);
    }
    node.appendChild(trees);
    node.appendChild(button('Back', onBack, 'small'));
    show(node);
    if (focus) node.querySelector(`[data-id="${focus}"]`)?.focus({ preventScroll: true });
  }

  // ---------- controls help ----------
  function help(onBack) {
    const node = el('div', 'menu help-menu');
    node.appendChild(el('h2', '', 'Controls'));
    const cols = el('div', 'help-cols');
    for (const group of ['Move', 'Fight', 'Other']) {
      const col = el('div', 'help-col');
      col.appendChild(el('h3', '', group));
      for (const a of ACTIONS.filter((x) => x.group === group)) {
        col.appendChild(el('div', 'help-row', `<span>${a.label}</span><kbd>${keyLabel(settings.bindings[a.id][0])}</kbd>`));
      }
      cols.appendChild(col);
    }
    const pad = el('div', 'help-col');
    pad.appendChild(el('h3', '', 'Gamepad'));
    for (const [a, k] of PAD_LAYOUT) pad.appendChild(el('div', 'help-row', `<span>${a}</span><kbd>${k}</kbd>`));
    cols.appendChild(pad);
    node.appendChild(cols);
    node.appendChild(el('h3', '', 'Moves'));
    node.appendChild(el('p', 'tip', 'How you move picks the strike: hold a direction, sprint or jump while you punch or kick. Attacks find the nearest goon on their own.'));
    for (const m of MOVE_TABLE) {
      const p = el('p', 'tip', m.input);
      p.prepend(el('b', '', `${m.name}: `));
      node.appendChild(p);
    }
    node.appendChild(el('h3', '', 'Moving around'));
    for (const id of MOVING_AROUND) node.appendChild(el('p', 'tip', promptText(id, settings.bindings)));
    node.appendChild(el('h3', '', 'Predator'));
    for (const id of PREDATOR) node.appendChild(el('p', 'tip', promptText(id, settings.bindings)));
    node.appendChild(el('p', 'tip', 'The ring over a goon fills white while he notices you, turns yellow while he searches and red once he has found you. Detective vision shows every goon in his state colour through walls, his vision cone on the floor, and how many rifles are left.'));
    node.appendChild(el('h3', '', 'Chain takedowns'));
    // The 'chain' tip carries the stealth clause (free and silent near two unaware goons).
    for (const id of CHAIN_TIPS) node.appendChild(el('p', 'tip', promptText(id, settings.bindings)));
    // No costs here: WayneTech's Efficient Chains lowers them, and the chain icons and the cost
    // hint show the live ones.
    node.appendChild(el('p', 'tip', 'Rope-a-Dope ties up to three goons together. Headbanger smashes two heads together. Domino Drop bounces off every head into a dive-bomb.'));
    const gadgets = gadgetHelp();
    if (gadgets.length) {
      node.appendChild(el('h3', '', 'Gadgets'));
      node.appendChild(el('p', 'tip', promptText('gadgetWheel', settings.bindings)));
      for (const g of gadgets) {
        const p = el('p', 'tip', dropLeadingName(g.name, g.html));
        p.prepend(el('b', '', `${g.name}: `));
        node.appendChild(p);
      }
    }
    node.appendChild(el('h3', '', 'Extras'));
    for (const id of ['challenges', 'photo']) node.appendChild(el('p', 'tip', promptText(id, settings.bindings)));
    node.appendChild(el('p', 'tip', 'Tips: counter every blue bolt, dodge the red ones. Kick or cape-stun knife goons. Batarang the Joker mid-throw.'));
    node.appendChild(button('Back', onBack, 'small'));
    show(node);
  }

  // ---------- settings ----------
  function openSettings(onBack, tab = 'controls') {
    const node = el('div', 'menu settings-menu');
    node.appendChild(el('h2', '', 'Settings'));
    const tabs = el('div', 'tabs');
    const body = el('div', 'tab-body');
    const TABS = { controls: 'Controls', camera: 'Camera', video: 'Video', audio: 'Audio', gameplay: 'Gameplay', access: 'Accessibility' }; // [prog] a11y: + access
    for (const [id, label] of Object.entries(TABS)) {
      const t = button(label, () => openSettings(onBack, id), `tab ${id === tab ? 'on' : ''}`);
      tabs.appendChild(t);
    }
    node.appendChild(tabs);
    node.appendChild(body);

    const slider = (label, value, min, max, step, fn, fmt = (v) => v) => {
      const row = el('label', 'set-row');
      row.appendChild(el('span', '', label));
      const r = el('input');
      r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = value;
      const out = el('output', '', fmt(value));
      r.addEventListener('input', () => { out.textContent = fmt(Number(r.value)); fn(Number(r.value)); save(); });
      row.append(r, out);
      return row;
    };
    const toggle = (label, value, fn) => {
      const row = el('label', 'set-row');
      row.appendChild(el('span', '', label));
      const b = button(value ? 'On' : 'Off', () => { value = !value; b.textContent = value ? 'On' : 'Off'; fn(value); save(); }, 'small toggle');
      row.appendChild(b);
      return row;
    };
    const choice = (label, value, options, fn) => {
      const row = el('div', 'set-row');
      row.appendChild(el('span', '', label));
      const group = el('div', 'choices');
      for (const [id, name] of options) {
        const b = button(name, () => { fn(id); save(); openSettings(onBack, tab); }, `small ${id === value ? 'on' : ''}`);
        group.appendChild(b);
      }
      row.appendChild(group);
      return row;
    };
    // [prog] a11y: the menu's own controls for the Accessibility tab and the pad sections.
    const a11y = { el, button, slider, toggle, choice, save, rerender: () => openSettings(onBack, tab),
      subtitlesToggle: () => toggle('Subtitles', getAudioPrefs().subtitles, (v) => setAudioPrefs({ subtitles: v })) };

    if (tab === 'controls') {
      const list = el('div', 'binds');
      for (const a of ACTIONS) {
        const row = el('div', 'set-row');
        row.appendChild(el('span', '', a.label));
        const b = button(keyLabel(settings.bindings[a.id][0]), () => {
          b.textContent = 'Press a key...';
          b.classList.add('listening');
          input.captureNext((code) => {
            b.classList.remove('listening');
            if (code) { settings.bindings = rebind(settings.bindings, a.id, code); input.setBindings(settings.bindings); save(); }
            openSettings(onBack, 'controls');
          });
        }, 'small rebind');
        row.appendChild(b);
        list.appendChild(row);
      }
      body.appendChild(list);
      body.appendChild(button('Reset to defaults', () => {
        settings.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
        input.setBindings(settings.bindings);
        save();
        openSettings(onBack, 'controls');
      }, 'small'));
      buildPadBindings(body, settings, a11y); // [prog] a11y: pad layout and rebinding per player
    } else if (tab === 'camera') {
      body.appendChild(slider('Mouse sensitivity', settings.sensitivity, 0.2, 3, 0.05, (v) => { settings.sensitivity = v; }, (v) => v.toFixed(2)));
      body.appendChild(toggle('Invert Y', settings.invertY, (v) => { settings.invertY = v; }));
      body.appendChild(slider('Field of view', settings.fov, 50, 90, 1, (v) => { settings.fov = v; }, (v) => `${v}°`));
      body.appendChild(toggle('Camera shake', settings.cameraShake, (v) => { settings.cameraShake = v; }));
      body.appendChild(toggle('Action camera on critical hits', settings.actionCam, (v) => { settings.actionCam = v; }));
      body.appendChild(toggle('Line wobble', settings.lineWobble, (v) => { settings.lineWobble = v; }));
      body.appendChild(choice('Impact frames', settings.impactFrames, [['full', 'Full'], ['soft', 'Soft (no flashing)'], ['off', 'Off']], (v) => { settings.impactFrames = v; }));
      body.appendChild(toggle('Auto ledge grab', settings.autoLedge, (v) => { settings.autoLedge = v; }));
      buildPadLook(body, settings, a11y); // [prog] a11y: pad look sensitivity and inversion per player
    } else if (tab === 'video') {
      // Auto shows what it picked for this machine (render/tierDetect.js stores the decision).
      const auto = loadAutoTier(storage)?.tier;
      const autoLabel = auto ? `Auto (${TIER_LABELS[auto] ?? auto})` : 'Auto';
      body.appendChild(choice('Quality', settings.quality, [['auto', autoLabel], ...TIERS.map((t) => [t, TIER_LABELS[t]])], (v) => { settings.quality = v; }));
      body.appendChild(el('p', 'note', 'Potato and Low suit integrated graphics; High is the full comic look. Quality changes apply the next time the game loads.'));
      body.appendChild(button('Reload now', () => location.reload(), 'small reload-quality'));
      body.appendChild(slider('Render scale', settings.renderScale, 0.5, 1, 0.05, (v) => { settings.renderScale = v; }, (v) => `${Math.round(v * 100)}%`));
      body.appendChild(toggle('Dynamic resolution', settings.dynamicRes, (v) => { settings.dynamicRes = v; }));
      body.appendChild(el('p', 'note', 'Lowers the render scale a little when frames run late, and raises it again when there is room.'));
      body.appendChild(slider('Halftone dots', settings.halftone, 0, 1.5, 0.05, (v) => { settings.halftone = v; }, (v) => `${Math.round(v * 100)}%`));
      // [env] Upper-tier ink lighting (src/render/inkPipeline.js INK_AO / INK_CONTACT / INK_SSR).
      body.appendChild(choice('Ink lighting', settings.inkLight, [['auto', 'Auto (Ultra)'], ['on', 'On'], ['off', 'Off']], (v) => { settings.inkLight = v; }));
      body.appendChild(el('p', 'note', 'Shadowed corners drawn as hatching, contact shadows, and neon reflected on wet streets. Medium and up; applies the next time the game loads.'));
      body.appendChild(toggle('Show FPS', settings.showFps, (v) => { settings.showFps = v; }));
      body.appendChild(toggle('FPS details (GPU, render scale)', settings.fpsDetails, (v) => { settings.fpsDetails = v; }));
    } else if (tab === 'audio') {
      body.appendChild(slider('Master', settings.volume.master, 0, 1, 0.05, (v) => { settings.volume.master = v; }, (v) => `${Math.round(v * 100)}%`));
      body.appendChild(slider('Music', settings.volume.music, 0, 1, 0.05, (v) => { settings.volume.music = v; }, (v) => `${Math.round(v * 100)}%`));
      body.appendChild(slider('Effects', settings.volume.sfx, 0, 1, 0.05, (v) => { settings.volume.sfx = v; }, (v) => `${Math.round(v * 100)}%`));
      // The extra buses and mix options live in their own store (src/audio/prefs.js), so the
      // saved settings.volume keeps its old shape.
      const ap = getAudioPrefs();
      const pct = (v) => `${Math.round(v * 100)}%`;
      body.appendChild(slider('Ambience', ap.ambience, 0, 1, 0.05, (v) => setAudioPrefs({ ambience: v }), pct));
      body.appendChild(slider('Dialogue', ap.dialogue, 0, 1, 0.05, (v) => setAudioPrefs({ dialogue: v }), pct));
      body.appendChild(slider('Interface', ap.ui, 0, 1, 0.05, (v) => { setAudioPrefs({ ui: v }); sound('uiSlider'); }, pct));
      body.appendChild(toggle('Night mode (less dynamic range)', ap.nightMode, (v) => setAudioPrefs({ nightMode: v })));
      body.appendChild(toggle('Mono audio', ap.mono, (v) => setAudioPrefs({ mono: v })));
      body.appendChild(toggle('Subtitles for barks and radio', ap.subtitles, (v) => setAudioPrefs({ subtitles: v })));
      body.appendChild(choice('Low-spec audio', ap.lowSpec, [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], (v) => setAudioPrefs({ lowSpec: v })));
      body.appendChild(el('p', 'note', 'Low-spec audio plays fewer sounds at once and uses a cheaper reverb. The reverb change applies the next time the game loads.'));
    } else if (tab === 'gameplay') {
      // [prog] All four tiers, Knightmare surfaced, each with an honest description.
      body.appendChild(choice('Difficulty', settings.difficulty, DIFFICULTIES.map((d) => [d, DIFFICULTY_INFO[d].name]), (v) => { settings.difficulty = v; }));
      body.appendChild(el('p', 'note diff-note', ''));
      body.lastChild.textContent = DIFFICULTY_INFO[settings.difficulty]?.text ?? '';
      body.appendChild(toggle('Tutorial prompts', settings.hints, (v) => { settings.hints = v; }));
      // [env] The day/night cycle (src/env/clock.js); story steps may still pin the hour.
      // [fix1] 'Always night' goes under the story's own pins (a story night or a Bruce day still
      // shows its hour), and while the story holds the hour the page says so instead of the change
      // silently doing nothing.
      const timeNote = el('p', 'note time-note', '');
      const timeHeldNote = (clk) => { timeNote.textContent = clk?.heldBy?.(['settings']).length ? 'The story holds the hour right now. Your choice applies as soon as it lets go.' : ''; };
      body.appendChild(choice('Time of day', settings.timeOfDay, [['cycle', 'Day and night'], ['night', 'Always night']], (v) => { settings.timeOfDay = v; const clk = globalThis.__game?.world?.clock; clk?.[v === 'night' ? 'pin' : 'unpin']?.(...(v === 'night' ? [23, { id: 'settings', under: true }] : ['settings'])); timeHeldNote(clk); }));
      body.appendChild(timeNote);
      timeHeldNote(globalThis.__game?.world?.clock);
      // [wanted] Police attention (src/wanted/wanted.js): off for players who don't want it; story moments still play.
      body.appendChild(choice('Police attention', settings.police ?? 'on', [['on', 'On'], ['off', 'Off']], (v) => { settings.police = v; }));
      body.appendChild(choice('Police pressure', settings.policeHeat ?? 'standard', [['relaxed', 'Relaxed'], ['standard', 'Standard'], ['relentless', 'Relentless']], (v) => { settings.policeHeat = v; }));
      // [map] Minimap and GPS (src/nav/mapSettings.js).
      const mp = settings.map;
      if (mp) {
        body.appendChild(toggle('Minimap', mp.minimap, (v) => { mp.minimap = v; }));
        body.appendChild(toggle('Minimap turns with you', mp.rotate, (v) => { mp.rotate = v; }));
        body.appendChild(toggle('Route on the road when on foot', mp.footRoute, (v) => { mp.footRoute = v; }));
        body.appendChild(toggle('High-contrast map', mp.highContrast, (v) => { mp.highContrast = v; }));
        body.appendChild(toggle('Breadcrumb trail on the map', mp.breadcrumbs, (v) => { mp.breadcrumbs = v; }));
        body.appendChild(toggle('"Go here" ping sets your waypoint', mp.pingSetsWaypoint, (v) => { mp.pingSetsWaypoint = v; }));
      }
    }
    if (tab === 'access') buildAccessibilityTab(body, settings, a11y); // [prog] a11y
    node.appendChild(button('Back', () => { input.cancelCapture(); onBack(); }, 'small back'));
    show(node);
  }

  // ---------- what's inside ----------
  function whatsNew(onBack) {
    // [polish] Grouped by theme (src/ui/whatsNew.js sections); Back stays on screen while the
    // page scrolls.
    const node = el('div', 'menu whatsnew-menu');
    node.appendChild(el('h2', '', "What's new"));
    node.appendChild(el('p', 'wn-lead', whatsNewHeadline()));
    const list = el('div', 'wn-list');
    for (const sec of whatsNewSections(settings.bindings)) {
      const h = el('h3', 'wn-sec');
      h.textContent = sec.title;
      list.appendChild(h);
      for (const line of sec.items) { const p = el('p', 'wn-row'); p.textContent = line; list.appendChild(p); }
    }
    node.appendChild(list);
    node.appendChild(button('Back', onBack, 'small back wn-back'));
    show(node);
  }

  // ---------- credits ----------
  function credits({ onClose, final = false }) {
    const node = el('div', `menu credits-menu ${final ? 'final' : ''}`);
    const roll = el('div', 'roll');
    roll.innerHTML = `
      ${final ? `<h1>The Long Night</h1><p class="final-msg">${STORY.finalMessage}</p>` : '<h2>Credits</h2>'}
      <h3>Made by</h3><p>Krishn Gohel</p>
      <h3>In the game</h3><p>A three act story across Gotham, the Batmobile and every street car, the Batwing, Nightwing, Harley Quinn, walk in interiors at Ace Chemicals and the Joker funhouse, in engine cinematics, twelve hidden Riddler trophies, and the Gotham Grand Prix and Wing Walk challenges.</p>
      <h3>Characters and animation</h3><p>Universal Base Characters and Universal Animation Library 1 and 2 by Quaternius (CC0)</p>
      <h3>Type</h3><p>Bangers, Patrick Hand SC and Barlow Condensed via Google Fonts (SIL Open Font License)</p>
      <h3>Music and voice</h3><p>The score is synthesised live in the browser. The Joker's voice: Seed Audio 1.0 on Higgsfield.</p>
      <h3>Sound layers</h3><p>Impact, footstep, glass and door recordings layered over the synth: Kenney Impact Sounds and RPG Audio (CC0).</p>
      <h3>Everything else</h3><p>City, comics, score and most sound effects are built in code, in the browser.</p>
      <p class="legal">Batman, Batgirl, the Joker and Gotham City belong to DC. This is a non-commercial fan-made tribute.</p>`;
    node.appendChild(roll);
    node.appendChild(button(final ? 'Keep exploring Gotham' : 'Back', onClose, final ? 'primary' : 'small'));
    show(node);
  }

  // [prog] A full page built elsewhere (the skill tree, a station): shown in the menu layer like
  // any menu, so pause, Esc and the gamepad treat it the same.
  function page(node) { show(node); node.focusFirst?.(); }

  return {
    title, suitSelect, pause, challengesPage, progressPage, caseFilePage, wayneTechPage, help, whatsNew, openSettings, credits, hide,
    page,
    setGadgetHelp(fn) { gadgetHelp = fn; },
    get open() { return !!current; },
  };
}
