// Online co-op screens (workstream D2): the host and join panels, the in-game connection badge,
// the "host away" overlay and the player-facing failure messages. Peer-supplied text (names, chat)
// only ever goes in with textContent.
import { MANUAL_WINDOW_S } from '../signal/signallers.js';

// One message per failure (research decision 7). Short, concrete, never "NAT".
export const MESSAGES = {
  'signalling-unreachable': "Can't reach matchmaking right now. Use “Paste codes” instead.",
  'no-host': 'No game found for that code. Check it with your friend, and that you are both on the latest version (Ctrl+F5).',
  version: 'You are on different versions of the game. Both press Ctrl+F5 to reload, then try again.',
  'ice-failed': "Your networks won't let the game link directly. Try swapping who hosts, turning off any VPN, or using home Wi-Fi instead of a phone hotspot or a work/school network. (This version has no relay server to fall back on.)",
  'room-full': 'That game already has two players.',
  'host-left': 'The host ended the session. You are back on your own save.',
  kicked: 'The host removed you from the game.',
  timeout: "Lost the connection and couldn't get it back. You are back on your own save.",
  closed: 'The connection closed.',
  'bad-code': "That code doesn't look right. Copy the whole thing and try again.",
  'no-broadcast': 'This browser cannot link two tabs. Use a room code instead.',
  error: 'Something went wrong with the connection. Try again.',
};
export const messageFor = (reason) => MESSAGES[reason] ?? MESSAGES.error;

const PRIVACY = 'Online play links your PC straight to your friend’s, so each of you can see the other’s internet address. Only play with people you trust.';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function btn(label, fn, cls = '') {
  const b = el('button', `mbtn ${cls}`.trim(), label);
  b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  return b;
}

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
.net-layer{position:fixed;inset:0;z-index:31;display:grid;place-items:center;background:radial-gradient(ellipse at center,rgba(11,11,18,.35),rgba(11,11,18,.85))}
.net-panel{width:min(620px,92vw);max-height:88vh;overflow:auto;padding:24px 28px;background:var(--paper,#f4ead2);color:var(--ink,#111);border:5px solid var(--ink,#111);box-shadow:12px 12px 0 var(--ink,#111);transform:rotate(-.4deg);font:18px 'Barlow Condensed',sans-serif}
.net-panel h2{font:44px Bangers,Impact,sans-serif;margin:0 0 8px;letter-spacing:1px}
.net-code{font:56px Bangers,Impact,sans-serif;letter-spacing:8px;background:#fff8e6;border:3px solid var(--ink,#111);padding:4px 14px;display:inline-block;user-select:all}
.net-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}
.net-tabs{display:flex;gap:6px;margin:8px 0}
.net-tabs .mbtn{font-size:17px;padding:6px 10px}
.net-tabs .mbtn.on{background:var(--signal,#f2d24b)}
.net-status{min-height:1.4em;font-weight:700;margin:8px 0}
.net-status.bad{color:#b3001b}
.net-note{font-size:15px;opacity:.8;margin-top:10px}
.net-panel input,.net-panel textarea{font:20px 'Barlow Condensed',sans-serif;border:3px solid var(--ink,#111);padding:6px 8px;background:#fff;width:100%;box-sizing:border-box}
.net-panel input.code{font:34px Bangers,Impact,sans-serif;letter-spacing:6px;text-transform:uppercase;width:9em}
.net-panel textarea{height:5.5em;font-size:13px;word-break:break-all}
.net-count{font:28px Bangers,Impact,sans-serif;color:#b3001b}
.net-badge{position:fixed;top:8px;right:84px;z-index:25;font:700 15px 'Barlow Condensed',sans-serif;background:#111c;color:#fff;padding:3px 9px;border:2px solid #000;letter-spacing:1px;pointer-events:auto;cursor:pointer;user-select:none}
.net-badge i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:#4c4}
.net-badge.warn i{background:#fb3}.net-badge.bad i{background:#e33}
.net-away{position:fixed;inset:0;z-index:29;display:none;place-items:center;background:rgba(10,10,16,.6);color:#fff;font:40px Bangers,Impact,sans-serif;text-align:center;padding:20px}
.net-away.show{display:grid}
.net-toast{position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:40;max-width:min(560px,90vw);background:var(--paper,#f4ead2);color:var(--ink,#111);border:4px solid var(--ink,#111);box-shadow:8px 8px 0 var(--ink,#111);padding:14px 18px;font:20px 'Barlow Condensed',sans-serif}
`;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------- panels
// Host panel: the room code, how to connect, the status line, manual codes.
export function showHostPanel({ code, modes, mode, onMode, onCancel, onManualAnswer, onRegenerate }) {
  style();
  const layer = el('div', 'net-layer net-host-panel');
  const p = el('div', 'net-panel');
  p.appendChild(el('h2', '', 'Host an online game'));
  const tabs = el('div', 'net-tabs');
  const body = el('div');
  const status = el('div', 'net-status', '');
  const ui = {
    layer, status,
    setStatus(text, bad = false) { status.textContent = text; status.classList.toggle('bad', !!bad); },
    setOffer(text) { const t = body.querySelector('textarea.offer'); if (t) t.value = text; },
    setCountdown(n) { const c = body.querySelector('.net-count'); if (c) c.textContent = n > 0 ? `${n}` : ''; },
    close() { layer.remove(); },
    get mode() { return mode; },
  };
  function draw() {
    tabs.innerHTML = '';
    for (const [id, label] of modes) { const b = btn(label, () => { mode = id; draw(); onMode(id); }, id === mode ? 'on' : ''); b.dataset.mode = id; tabs.appendChild(b); }
    body.innerHTML = '';
    if (mode === 'manual') {
      body.appendChild(el('div', '', '1. Send your friend this code:'));
      const t = el('textarea', 'offer'); t.readOnly = true; t.value = 'Making a code…';
      body.appendChild(t);
      const row = el('div', 'net-row');
      row.appendChild(btn('Copy', () => { t.select(); navigator.clipboard?.writeText(t.value).catch(() => {}); }, 'small'));
      row.appendChild(btn('New code', () => onRegenerate?.(), 'small'));
      body.appendChild(row);
      body.appendChild(el('div', '', '2. Paste their answer here straight away (it is only good for about 15 seconds):'));
      const a = el('input', 'answer'); a.placeholder = 'Their answer code';
      body.appendChild(a);
      const row2 = el('div', 'net-row');
      row2.appendChild(btn('Connect', () => onManualAnswer?.(a.value), 'primary small'));
      row2.appendChild(el('span', 'net-count', ''));
      body.appendChild(row2);
    } else {
      body.appendChild(el('div', '', mode === 'broadcast' ? 'Open the game in another tab of this browser and choose Join with code:' : 'Tell your friend this room code:'));
      const c = el('div', 'net-code', code);
      c.dataset.code = code;
      body.appendChild(c);
    }
  }
  p.appendChild(tabs);
  p.appendChild(body);
  p.appendChild(status);
  p.appendChild(el('div', 'net-note', PRIVACY));
  const foot = el('div', 'net-row');
  foot.appendChild(btn('Cancel', onCancel));
  p.appendChild(foot);
  layer.appendChild(p);
  document.body.appendChild(layer);
  draw();
  return ui;
}

// Join panel: a room code box, or the manual exchange.
export function showJoinPanel({ modes, mode, onJoin, onManualOffer, onCancel, initialCode = '' }) {
  style();
  const layer = el('div', 'net-layer net-join-panel');
  const p = el('div', 'net-panel');
  p.appendChild(el('h2', '', 'Join an online game'));
  const tabs = el('div', 'net-tabs');
  const body = el('div');
  const status = el('div', 'net-status', '');
  const ui = {
    layer, status,
    setStatus(text, bad = false) { status.textContent = text; status.classList.toggle('bad', !!bad); },
    setAnswer(text) { const t = body.querySelector('textarea.answer'); if (t) { t.value = text; t.select(); } },
    setCountdown(n) { const c = body.querySelector('.net-count'); if (c) c.textContent = n > 0 ? `Send it now: ${n}` : ''; },
    close() { layer.remove(); },
  };
  function draw() {
    tabs.innerHTML = '';
    for (const [id, label] of modes) { const b = btn(label, () => { mode = id; draw(); }, id === mode ? 'on' : ''); b.dataset.mode = id; tabs.appendChild(b); }
    body.innerHTML = '';
    if (mode === 'manual') {
      body.appendChild(el('div', '', '1. Paste the code your friend sent:'));
      const o = el('input', 'offer'); o.placeholder = 'Their code';
      body.appendChild(o);
      body.appendChild(btn('Make my answer', () => onManualOffer?.(o.value), 'small'));
      body.appendChild(el('div', '', '2. Send this answer back at once:'));
      const t = el('textarea', 'answer'); t.readOnly = true;
      body.appendChild(t);
      const row = el('div', 'net-row');
      row.appendChild(btn('Copy', () => { t.select(); navigator.clipboard?.writeText(t.value).catch(() => {}); }, 'small'));
      row.appendChild(el('span', 'net-count', ''));
      body.appendChild(row);
    } else {
      const row = el('div', 'net-row');
      const i = el('input', 'code'); i.placeholder = 'CODE'; i.maxLength = 8; i.value = initialCode; i.autocomplete = 'off'; i.spellcheck = false;
      i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') onJoin(i.value, mode); });
      row.appendChild(i);
      row.appendChild(btn('Join', () => onJoin(i.value, mode), 'primary'));
      body.appendChild(row);
      setTimeout(() => i.focus(), 0);
    }
  }
  p.appendChild(tabs);
  p.appendChild(body);
  p.appendChild(status);
  p.appendChild(el('div', 'net-note', PRIVACY));
  const foot = el('div', 'net-row');
  foot.appendChild(btn('Back', onCancel));
  p.appendChild(foot);
  layer.appendChild(p);
  document.body.appendChild(layer);
  draw();
  return ui;
}

// A countdown for the manual answer window; calls onLapse when it runs out.
export function countdown(set, onLapse, seconds = MANUAL_WINDOW_S) {
  let n = seconds;
  set(n);
  const t = setInterval(() => { n -= 1; set(n); if (n <= 0) { clearInterval(t); onLapse?.(); } }, 1000);
  return () => clearInterval(t);
}

// ---------------------------------------------------------------- in game
export function createBadge({ onClick } = {}) {
  style();
  const b = el('div', 'net-badge');
  const dot = el('i');
  const txt = el('span', '', 'ONLINE');
  b.appendChild(dot); b.appendChild(txt);
  b.addEventListener('click', () => onClick?.());
  document.body.appendChild(b);
  return {
    el: b,
    set(text, level = 'ok') { txt.textContent = text; b.classList.toggle('warn', level === 'warn'); b.classList.toggle('bad', level === 'bad'); },
    remove() { b.remove(); },
  };
}

export function createAwayOverlay() {
  style();
  const o = el('div', 'net-away');
  const t = el('div', '', '');
  o.appendChild(t);
  document.body.appendChild(o);
  return {
    show(text) { t.textContent = text; o.classList.add('show'); },
    hide() { o.classList.remove('show'); },
    get shown() { return o.classList.contains('show'); },
    remove() { o.remove(); },
  };
}

export function toast(text, ms = 6000) {
  style();
  const t = el('div', 'net-toast', text);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
  return t;
}
