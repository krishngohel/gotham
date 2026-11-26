// [prog] Subtitles (wave 3, workstream L1 item 6): captions for spoken lines, driven by the audio
// engine's subtitle hook (audio.onSubtitle, src/audio/audio.js). Bottom centre of the screen,
// across the whole width (in split screen too, so both players read the same line once).
//
// On/off is the audio pref `subtitles` (src/audio/prefs.js); size, the backing plate and speaker
// names come from settings.access through CSS variables and body classes (src/ui/accessibility.js).
// Lines already on screen elsewhere (a goon's speech balloon over his head) are suppressed so they
// never show twice: call suppress(text) when such a line is drawn.

export const SUB_MAX_LINES = 3;
// Reading time: never shorter than MIN_READ seconds, and at least READ_CPS characters a second.
export const MIN_READ = 1.8, READ_CPS = 15, TAIL = 0.6;

// Pure: when each line of a subtitle shows and goes, in seconds from now.
// sub: the audio hook's payload { lines: [{ name, text, delay, duration }], channel, radio }.
export function subtitleSchedule(sub, { speakers = true } = {}) {
  const out = [];
  const lines = Array.isArray(sub?.lines) && sub.lines.length ? sub.lines : sub?.text ? [{ text: sub.text, name: sub.name, delay: 0, duration: sub.duration }] : [];
  for (const l of lines) {
    const text = typeof l?.text === 'string' ? l.text.trim() : '';
    if (!text) continue;
    const at = Math.max(0, Number(l.delay) || 0);
    const spoken = Math.max(0, Number(l.duration) || 0);
    const read = Math.max(MIN_READ, text.length / READ_CPS);
    out.push({ name: speakers && l.name ? String(l.name) : '', text, at, until: at + Math.max(spoken + TAIL, read), radio: !!sub.radio, channel: sub.channel ?? 'voice' });
  }
  return out;
}

export function createSubtitles(root, { enabled = () => true, speakers = () => true, now = () => performance.now() / 1000, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
  const el = document.createElement('div');
  el.className = 'subtitles';
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('role', 'log');
  root.appendChild(el);
  const suppressed = new Map(); // text -> until (seconds)
  const timers = new Set();
  let recent = { text: '', at: -Infinity };

  const later = (fn, s) => { const id = setTimer(() => { timers.delete(id); fn(); }, Math.max(0, s * 1000)); timers.add(id); };

  function addLine(l) {
    const row = document.createElement('div');
    row.className = `sub-line${l.radio ? ' radio' : ''}`;
    if (l.name) {
      const b = document.createElement('b');
      b.className = 'sub-name';
      b.textContent = `${l.name}:`;
      row.appendChild(b);
      row.appendChild(document.createTextNode(' '));
    }
    const span = document.createElement('span');
    span.className = 'sub-text';
    span.textContent = l.text;
    row.appendChild(span);
    el.appendChild(row);
    while (el.children.length > SUB_MAX_LINES) el.firstElementChild.remove();
    later(() => row.remove(), l.until - l.at);
  }

  const api = {
    el,
    // The audio hook's payload. Returns how many lines were scheduled.
    show(sub) {
      if (!enabled()) return 0;
      const t = now();
      for (const [k, until] of suppressed) if (until < t) suppressed.delete(k);
      let n = 0;
      for (const l of subtitleSchedule(sub, { speakers: speakers() })) {
        if (suppressed.has(l.text)) continue;
        // The same line twice in a row (two goons, one bark) shows once.
        if (l.text === recent.text && t + l.at - recent.at < 1.5) continue;
        recent = { text: l.text, at: t + l.at };
        if (l.at > 0) later(() => { if (enabled()) addLine(l); }, l.at);
        else addLine(l);
        n++;
      }
      return n;
    },
    // A line shown elsewhere on screen right now: no caption for it for `seconds`.
    suppress(text, seconds = 4) { if (text) suppressed.set(String(text).trim(), now() + seconds); },
    clear() { for (const id of timers) clearTimer(id); timers.clear(); el.textContent = ''; },
    get lines() { return [...el.querySelectorAll('.sub-line')].map((r) => r.textContent); },
    dispose() { api.clear(); el.remove(); },
  };
  return api;
}
