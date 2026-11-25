// Two small HUD widgets the campaign's step types need, in the HUD's comic style: a countdown chip
// (timed rooms, traversal runs) and a labelled meter (the fear meter, the cold meter). Built
// lazily into the HUD root on first use; text that tells the player what to do still goes through
// the HUD's own banner/card/objective and the radio, so subtitles and accessibility apply.
const FONT = "'Bangers', cursive";

export function createStoryUi(getRoot) {
  let timerEl = null, meterEl = null, meterFill = null, meterLabel = null;
  function root() { return getRoot?.() ?? document.querySelector('.hud') ?? document.body; }
  function ensureTimer() {
    if (timerEl) return timerEl;
    timerEl = document.createElement('div');
    timerEl.className = 'story-timer';
    // [m45] top 16px: above the HUD card (.hud-card; its title starts about 70px down the screen). At 84px the
    // chip sat on a riddle card's title for as long as the card showed.
    // [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
    timerEl.style.cssText = `position:absolute;left:50%;top:16px;transform:translateX(-50%) skewX(-8deg);font:calc(28px * var(--a11y-text, 1)) ${FONT};letter-spacing:2px;color:#f2c94c;background:rgba(11,11,18,.85);border:3px solid #0b0b12;box-shadow:4px 4px 0 #0b0b12;padding:2px 14px;display:none;pointer-events:none;z-index:3`;
    root().appendChild(timerEl);
    return timerEl;
  }
  function ensureMeter() {
    if (meterEl) return meterEl;
    meterEl = document.createElement('div');
    meterEl.className = 'story-meter';
    meterEl.style.cssText = 'position:absolute;left:24px;bottom:150px;width:min(260px,40vw);display:none;pointer-events:none;z-index:3';
    // [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
    meterEl.innerHTML = `<div style="font:calc(20px * var(--a11y-text, 1)) ${FONT};letter-spacing:2px;color:#efe6cf;-webkit-text-stroke:1px #0b0b12;text-shadow:2px 2px 0 #0b0b12"></div><div style="height:12px;background:rgba(11,11,18,.85);border:3px solid #0b0b12;transform:skewX(-14deg);box-shadow:3px 3px 0 #0b0b12"><div style="height:100%;width:0%;transition:width .25s"></div></div>`;
    meterLabel = meterEl.firstElementChild;
    meterFill = meterEl.lastElementChild.firstElementChild;
    root().appendChild(meterEl);
    return meterEl;
  }
  let lastTimer = '';
  return {
    timer(seconds) {
      const el = ensureTimer();
      if (seconds == null) { el.style.display = 'none'; lastTimer = ''; return; }
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (text !== lastTimer) { el.textContent = text; lastTimer = text; el.style.color = s <= 10 ? '#ff6a5a' : '#f2c94c'; }
      el.style.display = '';
    },
    // meter(label, fraction 0..1, colour) or meter(null) to hide.
    meter(label, fraction = 0, color = '#7dd36a') {
      const el = ensureMeter();
      if (label == null) { el.style.display = 'none'; return; }
      if (meterLabel.textContent !== label) meterLabel.textContent = label;
      meterFill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
      meterFill.style.background = color;
      el.style.display = '';
    },
    hideAll() { if (timerEl) timerEl.style.display = 'none'; if (meterEl) meterEl.style.display = 'none'; lastTimer = ''; },
  };
}
