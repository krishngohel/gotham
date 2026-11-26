// The fast-travel transition (workstream L2): a comic panel covers the screen while the heroes
// move, so the far chunks and LODs swap in unseen. The El rides past lit windows ("NEXT STOP"),
// the Batwing sweeps in for a glide-in drop, the cave is a quick cut. Any key, click or pad
// button skips once the heroes have arrived (and a few frames have drawn the new place).
let styled = false;
function ensureStyles() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  // [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
  st.textContent = `
.travel-panel { position: fixed; inset: 0; z-index: 45; display: none; align-items: center; justify-content: center; background: #0b0b12; opacity: 0; transition: opacity 0.22s; }
.travel-panel.show { display: flex; }
.travel-panel.on { opacity: 1; }
.travel-panel .tp-card { position: relative; padding: 18px 40px; background: #f2d24b; border: 5px solid #0b0b12; box-shadow: 9px 9px 0 #efe6cf; transform: rotate(-2deg);
  font: calc(54px * var(--a11y-text, 1))/1 'Bangers', cursive; letter-spacing: 2px; color: #0b0b12; text-align: center; }
.travel-panel .tp-sub { display: block; margin-top: 6px; font: calc(22px * var(--a11y-text, 1)) 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: 0; }
.travel-panel .tp-strip { position: absolute; left: 0; right: 0; top: 18%; height: 18%; background: repeating-linear-gradient(90deg, #f2c96b 0 38px, #1b1d28 38px 70px);
  opacity: 0.55; animation: tpStrip 0.5s linear infinite; }
.travel-panel .tp-strip.low { top: auto; bottom: 18%; animation-duration: 0.36s; }
.travel-panel.batwing .tp-strip { background: repeating-linear-gradient(120deg, #2a2d3c 0 30px, #0b0b12 30px 60px); }
.travel-panel .tp-skip { position: absolute; bottom: 18px; right: 24px; font: calc(18px * var(--a11y-text, 1)) 'Barlow Condensed', sans-serif; color: #efe6cf; opacity: 0.7; }
@keyframes tpStrip { from { background-position: 0 0; } to { background-position: -140px 0; } }
`;
  document.head.appendChild(st);
}

export function createTravelTransition(root = document.body) {
  ensureStyles();
  const el = document.createElement('div');
  el.className = 'travel-panel';
  el.innerHTML = '<div class="tp-strip"></div><div class="tp-strip low"></div><div class="tp-card"><span class="tp-title"></span><span class="tp-sub"></span></div><div class="tp-skip">Any key to skip</div>';
  root.appendChild(el);
  const title = el.querySelector('.tp-title'), sub = el.querySelector('.tp-sub');
  let run = null;
  function skip() { if (run && run.arrived && run.frames > 3) run.end = Math.min(run.end, run.t + 0.05); }
  addEventListener('keydown', skip, true);
  addEventListener('mousedown', skip, true);
  function step(now) {
    if (!run) return;
    const r = run;
    const dt = r.last ? Math.min(0.1, (now - r.last) / 1000) : 0;
    r.last = now;
    r.t += dt;
    if (r.arrived) r.frames++;
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) if (p?.buttons?.some((b) => b.pressed)) skip();
    if (!r.arrived && r.t >= 0.3) { r.arrived = true; try { r.arrive(); } catch (err) { console.error(err); } }
    if (r.t >= r.end) {
      el.classList.remove('on');
      run = null;
      setTimeout(() => { if (!run) el.classList.remove('show'); }, 240);
      r.done?.();
      return;
    }
    requestAnimationFrame(step);
  }
  return {
    el,
    get active() { return !!run; },
    // info: { point: { kind, label }, minutes }. arrive(): moves the heroes (called once, covered).
    play(info, arrive, done = null) {
      const k = info.point.kind;
      el.classList.toggle('batwing', k === 'batwing');
      title.textContent = k === 'el' ? `NEXT STOP: ${info.point.label.toUpperCase()}` : k === 'batwing' ? 'BATWING DROP!' : 'TO THE CAVE!';
      sub.textContent = k === 'el' ? `${info.minutes} minutes on the El` : k === 'batwing' ? `Over ${info.point.label}` : info.point.label;
      el.classList.add('show');
      void el.offsetWidth;
      el.classList.add('on');
      run = { t: 0, last: 0, arrived: false, frames: 0, end: k === 'el' ? 2.4 : k === 'batwing' ? 2.0 : 1.2, arrive, done };
      requestAnimationFrame(step);
    },
  };
}
