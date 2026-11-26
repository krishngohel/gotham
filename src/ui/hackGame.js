// [prog] The remote hacking device's minigame panel (src/gadgets/hackRules.js is the logic): an
// inked comic panel with a signal bar, a lit window and a sweeping needle, the rounds left and the
// key to press. Built once, hidden; set() writes only what changed (it runs every frame while open).
export function createHackGame(root) {
  const doc = root?.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!doc) return { show() {}, set() {}, done() {}, hide() {}, get shown() { return false; } };
  const el = doc.createElement('div');
  el.className = 'hackgame';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Hacking');
  el.innerHTML = '<div class="hk-title">CRACKING THE SIGNAL</div><div class="hk-label"></div>'
    + '<div class="hk-bar"><div class="hk-win"></div><div class="hk-needle"></div></div>'
    + '<div class="hk-foot"><span class="hk-rounds"></span><b class="hk-key"></b></div><div class="hk-result" aria-live="polite"></div>';
  root.appendChild(el);
  const label = el.querySelector('.hk-label'), win = el.querySelector('.hk-win'), needle = el.querySelector('.hk-needle');
  const rounds = el.querySelector('.hk-rounds'), key = el.querySelector('.hk-key'), result = el.querySelector('.hk-result');
  let shown = false, lastNeedle = -1, lastC = -1, lastW = -1, lastRound = -1;
  return {
    get shown() { return shown; },
    show(text, keyLabel, auto = false) {
      label.textContent = text;
      key.textContent = auto ? 'AUTO' : keyLabel;
      result.textContent = '';
      el.classList.remove('win', 'lose');
      el.classList.add('show');
      shown = true;
      lastNeedle = lastC = lastW = lastRound = -1;
    },
    // r: a hack round (needle, centre, width, round, rounds).
    set(r) {
      const n = Math.round(r.needle * 400) / 4;
      if (n !== lastNeedle) { needle.style.left = `${n}%`; lastNeedle = n; }
      if (r.centre !== lastC || r.width !== lastW) {
        win.style.left = `${((r.centre - r.width / 2) * 100).toFixed(2)}%`;
        win.style.width = `${(r.width * 100).toFixed(2)}%`;
        lastC = r.centre; lastW = r.width;
      }
      if (r.round !== lastRound) { rounds.textContent = `${r.round} of ${r.rounds}`; lastRound = r.round; }
    },
    done(ok) {
      el.classList.add(ok ? 'win' : 'lose');
      result.textContent = ok ? 'SIGNAL CRACKED' : 'LOCKED OUT';
    },
    hide() { el.classList.remove('show'); shown = false; },
  };
}
