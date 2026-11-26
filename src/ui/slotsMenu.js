// Title-screen pages for save slots and starting a run (wave 3, workstream L1): the three slots
// with a summary each, play / copy / delete (with confirmation) / export / import, the guest
// profile, and the new-game page (difficulty with honest descriptions, optional modifiers, New
// Game Plus). Built as plain DOM nodes and shown through menus.page(). Text via textContent.
import { DIFFICULTY_INFO, CHECKPOINT_LIMITS } from '../progress/mode.js';
import { DIFFICULTIES } from '../combat/rules.js';
import { formatPlayTime } from '../core/slots.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function btn(label, fn, cls = '', sound = () => {}) {
  const b = el('button', `mbtn small ${cls}`, label);
  b.addEventListener('click', (e) => { e.stopPropagation(); sound('uiSelect'); fn(); });
  return b;
}

const DIFF_NAME = (d) => DIFFICULTY_INFO[d]?.name ?? 'Normal';

export function summaryLine(s) {
  if (!s || s.empty) return 'Empty';
  const bits = [];
  bits.push(s.finished ? 'Finished' : s.where ? s.where : 'In progress');
  if (s.percent != null) bits.push(`${s.percent}%`);
  bits.push(`Level ${s.level}`);
  bits.push(formatPlayTime(s.playTime));
  if (s.difficulty) bits.push(DIFF_NAME(s.difficulty));
  return bits.join(' · ');
}

// opts: { summaries: [{slot,...}x3], guest, active, onPlay(slot), onCopy(from,to), onDelete(slot),
//         onExportCode(slot) -> string, onExportFile(slot), onImport(slot, text) -> {ok,error},
//         onBack, sound }
export function buildSlotsPage(opts) {
  const { summaries, guest = null, active, onPlay, onCopy, onDelete, onExportCode, onExportFile, onImport, onBack, sound = () => {} } = opts;
  const node = el('div', 'menu slots-menu');
  node.appendChild(el('h2', '', 'Save slots'));
  const list = el('div', 'slot-list');
  const panel = el('div', 'slot-panel');
  const say = (text, cls = '') => { panel.className = `slot-panel ${cls}`; panel.textContent = text; };

  function confirm(question, yes) {
    panel.className = 'slot-panel confirm';
    panel.textContent = '';
    panel.appendChild(el('span', 'slot-q', question));
    const y = btn('Yes', () => { yes(); }, 'danger slot-yes', sound);
    const n = btn('No', () => say(''), 'slot-no', sound);
    panel.append(y, n);
    n.focus();
  }

  function exportBox(slot) {
    panel.className = 'slot-panel export';
    panel.textContent = '';
    const code = onExportCode(slot);
    const ta = el('textarea', 'slot-code');
    ta.value = code;
    ta.readOnly = true;
    ta.rows = 3;
    panel.append(el('span', 'slot-q', `Slot ${slot} as a code. Copy it somewhere safe.`), ta);
    panel.appendChild(btn('Copy code', () => { ta.select(); try { navigator.clipboard?.writeText(code); } catch { /* manual copy */ } say('Copied (or select the text and copy it).', 'ok'); }, 'slot-copycode', sound));
    panel.appendChild(btn('Download file', () => onExportFile(slot), 'slot-file', sound));
    ta.focus();
    ta.select();
  }

  function importBox(slot) {
    panel.className = 'slot-panel import';
    panel.textContent = '';
    const ta = el('textarea', 'slot-code slot-paste');
    ta.rows = 3;
    ta.placeholder = 'Paste a GOTHAM1 code here, or choose a file';
    const file = el('input', 'slot-fileinput');
    file.type = 'file';
    file.accept = '.json,.txt,application/json,text/plain';
    const run = (text) => {
      const go = () => {
        const r = onImport(slot, text);
        if (r.ok) { say(`Imported into slot ${slot}.`, 'ok'); refresh(); } else say(r.error, 'bad');
      };
      if (summaries[slot - 1] && !summaries[slot - 1].empty) confirm(`Replace what is in slot ${slot}?`, go);
      else go();
    };
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (!f) return;
      if (f.size > 256 * 1024) { say('That file is too big to be a save.', 'bad'); return; }
      f.text().then(run, () => say('That file could not be read.', 'bad'));
    });
    panel.append(el('span', 'slot-q', `Import into slot ${slot}`), ta, file, btn('Import code', () => run(ta.value), 'slot-doimport', sound));
    ta.focus();
  }

  function refresh() { opts.refresh?.(); }

  summaries.forEach((s) => {
    const card = el('div', `slot-card ${s.empty ? 'empty' : ''} ${s.slot === active ? 'active' : ''}`);
    card.dataset.slot = String(s.slot);
    const head = el('div', 'slot-head');
    head.append(el('span', 'slot-num', `Slot ${s.slot}`));
    if (s.slot === active) head.append(el('span', 'slot-badge', 'In use'));
    if (s.ngPlus) head.append(el('span', 'slot-badge ng', `NG+${s.ngPlus > 1 ? s.ngPlus : ''}`));
    card.append(head, el('div', 'slot-sum', summaryLine(s)));
    const row = el('div', 'slot-actions');
    row.appendChild(btn(s.slot === active ? 'Back to it' : s.empty ? 'Start here' : 'Play', () => onPlay(s.slot), 'slot-play', sound));
    if (!s.empty) {
      for (const to of [1, 2, 3].filter((t) => t !== s.slot)) {
        row.appendChild(btn(`Copy to ${to}`, () => {
          const go = () => { onCopy(s.slot, to); say(`Slot ${s.slot} copied to slot ${to}.`, 'ok'); refresh(); };
          if (!summaries[to - 1].empty) confirm(`Slot ${to} has a save. Overwrite it with slot ${s.slot}?`, go); else go();
        }, `slot-copy slot-copy-${to}`, sound));
      }
      row.appendChild(btn('Delete', () => confirm(`Delete slot ${s.slot}? This cannot be undone.`, () => { onDelete(s.slot); say(`Slot ${s.slot} deleted.`, 'ok'); refresh(); }), 'danger slot-delete', sound));
      row.appendChild(btn('Export', () => exportBox(s.slot), 'slot-export', sound));
    }
    row.appendChild(btn('Import', () => importBox(s.slot), 'slot-import', sound));
    card.appendChild(row);
    list.appendChild(card);
  });
  if (guest && !guest.empty) {
    const card = el('div', 'slot-card guest');
    card.append(el('div', 'slot-head', 'Guest profile (online co-op)'), el('div', 'slot-sum', summaryLine(guest)));
    const row = el('div', 'slot-actions');
    for (const to of [1, 2, 3]) row.appendChild(btn(`Copy to ${to}`, () => confirm(`Copy the guest profile over slot ${to}?`, () => { onCopy('guest', to); say(`Guest profile copied to slot ${to}.`, 'ok'); refresh(); }), 'slot-guest-copy', sound));
    card.appendChild(row);
    list.appendChild(card);
  }
  node.append(list, panel);
  node.appendChild(el('p', 'note', 'Settings are shared by every slot. Online co-op as a guest saves to the guest profile.'));
  node.appendChild(btn('Back', onBack, 'back', sound));
  return node;
}

// The difficulty row the suit select shows when a run starts: four tiers with honest text,
// optional modifiers, and New Game Plus's note and rewards. Returns { node, value() }.
export function buildDifficultyRow({ ngPlus = false, current = 'normal', sound = () => {}, rewards = [] }) {
  const node = el('div', `newgame-row ${ngPlus ? 'ng' : ''}`);
  if (ngPlus) node.appendChild(el('p', 'note ng-note', 'New Game Plus: the story starts again with tougher, mixed squads. Your skills, gadgets, suits, trophies and XP come with you.'));
  let pick = DIFFICULTIES.includes(current) ? current : 'normal';
  let noHud = false, limit = 0;
  const cards = el('div', 'diff-list');
  const desc = el('p', 'diff-desc');
  const draw = () => {
    for (const c of cards.children) c.classList.toggle('on', c.dataset.diff === pick);
    desc.textContent = DIFFICULTY_INFO[pick].text;
  };
  cards.appendChild(el('span', 'mods-label', 'Difficulty:'));
  for (const d of DIFFICULTIES) {
    const c = btn(DIFFICULTY_INFO[d].name, () => { pick = d; draw(); }, `diff-card diff-${d}`, sound);
    c.dataset.diff = d;
    cards.appendChild(c);
  }
  node.append(cards, desc);
  const mods = el('div', 'mods');
  const hudB = btn('No HUD: off', () => { noHud = !noHud; hudB.textContent = `No HUD: ${noHud ? 'on' : 'off'}`; }, 'mod-hud', sound);
  const limB = btn('Checkpoint restarts: unlimited', () => {
    limit = CHECKPOINT_LIMITS[(CHECKPOINT_LIMITS.indexOf(limit) + 1) % CHECKPOINT_LIMITS.length];
    limB.textContent = `Checkpoint restarts: ${limit || 'unlimited'}`;
  }, 'mod-limit', sound);
  mods.append(el('span', 'mods-label', 'Optional:'), hudB, limB);
  node.appendChild(mods);
  if (rewards.length) node.appendChild(el('p', 'note ng-rewards', `New Game Plus rewards: ${rewards.map((r) => r.name).join(', ')}.`));
  draw();
  return { node, value: () => ({ difficulty: pick, modifiers: { noHud, checkpointLimit: limit } }) };
}
