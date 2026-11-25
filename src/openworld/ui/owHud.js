// The open world's HUD pieces, one panel per local player's view (each split view has its own
// HUD element: hud.forPlayer(p).el). The current job (a crime's objective with its meter and
// clock, a case's stage, a stealth run, a trial) and a short list of what is going on nearby.
// Text, not colour, carries the meaning: meters have a word label (PANIC, ESCAPE, FIRE...) and
// the tone also sets a pattern (striped when bad). Updated a few times a second, not per frame.
// [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
const CSS = `
.ow-panel{position:absolute;right:14px;top:34%;width:270px;pointer-events:none;font-family:'Patrick Hand SC','Comic Sans MS',sans-serif;z-index:6}
.ow-panel .ow-job{display:none;background:#efe6cf;border:3px solid #0b0b12;box-shadow:4px 4px 0 #0b0b12;padding:6px 9px 8px;margin-bottom:8px;transform:rotate(-0.6deg)}
.ow-panel .ow-job.show{display:block}
.ow-panel .ow-title{font-family:'Bangers',Impact,sans-serif;font-size:calc(19px * var(--a11y-text, 1));letter-spacing:1px;color:#0b0b12;line-height:1.05}
.ow-panel .ow-text{font-size:calc(15px * var(--a11y-text, 1));color:#1a1a22;line-height:1.15;margin-top:2px}
.ow-panel .ow-meter{position:relative;height:12px;border:2px solid #0b0b12;background:#fff;margin-top:6px}
.ow-panel .ow-fill{position:absolute;left:0;top:0;bottom:0;background:#f2c94c}
.ow-panel .ow-meter.bad .ow-fill{background:repeating-linear-gradient(45deg,#c8323c 0 6px,#8a1a22 6px 12px)}
.ow-panel .ow-meter.warn .ow-fill{background:#f08a24}
.ow-panel .ow-win{position:absolute;top:-2px;bottom:-2px;border:2px solid #0b0b12;background:rgba(125,255,74,0.55)}
.ow-panel .ow-cur{position:absolute;top:-5px;bottom:-5px;width:3px;background:#0b0b12}
.ow-panel .ow-label{position:absolute;right:3px;top:-1px;font-size:calc(10px * var(--a11y-text, 1));font-family:'Bangers',Impact,sans-serif;letter-spacing:1px;color:#0b0b12}
.ow-panel .ow-timer{float:right;font-family:'Bangers',Impact,sans-serif;font-size:calc(18px * var(--a11y-text, 1));color:#c8323c}
.ow-panel .ow-list{font-size:calc(14px * var(--a11y-text, 1));color:#efe6cf;text-shadow:1px 1px 0 #0b0b12,-1px -1px 0 #0b0b12,1px -1px 0 #0b0b12,-1px 1px 0 #0b0b12}
.ow-panel .ow-list div{margin:1px 0}
.ow-panel .ow-list b{font-family:'Bangers',Impact,sans-serif;letter-spacing:1px;font-weight:normal}
`;
let styled = false;

export function createOwPanel(root) {
  if (!styled && typeof document !== 'undefined') { styled = true; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement('div');
  el.className = 'ow-panel';
  el.innerHTML = '<div class="ow-job"><div class="ow-title"><span class="ow-timer"></span><span class="ow-t"></span></div><div class="ow-text"></div><div class="ow-meter"><div class="ow-fill"></div><div class="ow-win"></div><div class="ow-cur"></div><div class="ow-label"></div></div></div><div class="ow-list"></div>';
  // [polish] The job card lives in the column under the objective caption (src/ui/hudLayout.js),
  // so it can never sit on the caption, its chips or the dialogue below.
  (root.querySelector?.(':scope > .hud-under') ?? root).appendChild(el);
  const q = (s) => el.querySelector(s);
  const job = q('.ow-job'), title = q('.ow-t'), text = q('.ow-text'), meter = q('.ow-meter'), fill = q('.ow-fill'), win = q('.ow-win'), cur = q('.ow-cur'), lab = q('.ow-label'), timer = q('.ow-timer'), list = q('.ow-list');
  const set = (n, v) => { if (n.textContent !== v) n.textContent = v; };
  let lastList = '';
  return {
    el,
    // h = { title, text, meter (0..1|null), label, tone, timer, dial: { phase, window } } | null
    job(h) {
      job.classList.toggle('show', !!h);
      if (!h) return;
      set(title, h.title ?? '');
      set(text, h.text ?? '');
      set(timer, h.timer ?? '');
      const hasMeter = h.meter != null || !!h.dial;
      meter.style.display = hasMeter ? '' : 'none';
      meter.className = `ow-meter ${h.tone ?? ''}`;
      if (h.dial) {
        fill.style.width = '0%';
        win.style.display = '';
        win.style.left = `${(0.5 - h.dial.window / 2) * 100}%`;
        win.style.width = `${h.dial.window * 100}%`;
        cur.style.display = '';
        cur.style.left = `${h.dial.phase * 100}%`;
        set(lab, 'STRIKE IN THE WINDOW');
      } else {
        win.style.display = 'none';
        cur.style.display = 'none';
        fill.style.width = `${Math.round(Math.max(0, Math.min(1, h.meter ?? 0)) * 100)}%`;
        set(lab, h.label ?? '');
      }
    },
    // rows: [{ title, where, dist }]
    list(rows) {
      const html = rows.map((r) => `<div><b>${esc(r.title)}</b> · ${esc(r.where)} · ${Math.round(r.dist)} m</div>`).join('');
      if (html !== lastList) { lastList = html; list.innerHTML = html; }
    },
    remove() { el.remove(); },
  };
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
