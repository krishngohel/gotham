// Per-view screen effects for the campaign (workstream J2): a labelled meter and a screen
// distortion that belong to ONE player's view. In split screen each player's HUD element is
// confined to that player's half (hud.setPanel), so a meter appended to it and a full-size
// `backdrop-filter` overlay inside it only ever touch that half. With one player it is the whole
// screen, exactly as before. Fear (Night Four), cold (Night Five), spores (Night Six), smoke and
// heat (Night Seven) all read from here so a partner's toxin never tints the other view.
//
//   const fx = createViewFx({ hud, players })
//   fx.meter(player, label, fraction 0..1, colour)   fx.meter(player, null) hides it
//   fx.distort(player, k 0..1, kind)                  kind: 'fear' | 'cold' | 'spore' | 'heat'
//   fx.clear()                                        hides everything for every player
import { distortOptions } from '../ui/accessibility.js'; // [verify] a11y
const FONT = "'Bangers', cursive";
const FILTERS = {
  fear: (k) => `hue-rotate(${Math.round(40 + 40 * k)}deg) saturate(${(1.4 + k).toFixed(2)}) contrast(1.15)`,
  cold: (k) => `saturate(${(1 - 0.6 * k).toFixed(2)}) brightness(${(1 + 0.25 * k).toFixed(2)}) hue-rotate(${Math.round(-12 * k)}deg)`,
  spore: (k, blur = true) => `hue-rotate(${Math.round(70 * k)}deg) saturate(${(1.2 + 0.8 * k).toFixed(2)})${blur ? ` blur(${(1.4 * k).toFixed(1)}px)` : ''}`, // [verify] a11y: no blur under reduced motion
  heat: (k) => `sepia(${(0.5 * k).toFixed(2)}) saturate(${(1 + k).toFixed(2)}) contrast(${(1 + 0.2 * k).toFixed(2)})`,
};

export function createViewFx({ hud, players = () => [] }) {
  const per = new Map(); // player id (or 'p0') -> { meter, fill, label, veil }
  const rootFor = (p) => (hud?.forPlayer ? hud.forPlayer(p) : hud)?.el ?? (typeof document !== 'undefined' ? document.querySelector('.hud') : null);
  const keyOf = (p) => p?.id ?? 'p0';

  function parts(p) {
    const k = keyOf(p);
    let rec = per.get(k);
    const root = rootFor(p);
    if (rec && rec.root === root) return rec;
    if (!root || typeof document === 'undefined') return null;
    const meter = document.createElement('div');
    meter.className = 'story-meter';
    meter.style.cssText = 'position:absolute;left:24px;bottom:150px;width:min(260px,40%);display:none;pointer-events:none;z-index:3';
    // [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
    meter.innerHTML = `<div style="font:calc(20px * var(--a11y-text, 1)) ${FONT};letter-spacing:2px;color:#efe6cf;-webkit-text-stroke:1px #0b0b12;text-shadow:2px 2px 0 #0b0b12"></div><div style="height:12px;background:rgba(11,11,18,.85);border:3px solid #0b0b12;transform:skewX(-14deg);box-shadow:3px 3px 0 #0b0b12"><div style="height:100%;width:0%;transition:width .25s"></div></div>`;
    const veil = document.createElement('div');
    veil.className = 'story-veil';
    veil.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;display:none';
    root.appendChild(veil);
    root.appendChild(meter);
    rec = { root, meter, label: meter.firstElementChild, fill: meter.lastElementChild.firstElementChild, veil, lastFilter: '' };
    per.set(k, rec);
    return rec;
  }

  const api = {
    meter(p, label, fraction = 0, color = '#7dd36a') {
      const r = parts(p);
      if (!r) return;
      if (label == null) { r.meter.style.display = 'none'; return; }
      if (r.label.textContent !== label) r.label.textContent = label;
      r.fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
      r.fill.style.background = color;
      r.meter.style.display = '';
    },
    distort(p, k = 0, kind = 'fear') {
      const r = parts(p);
      if (!r) return;
      if (!(k > 0.02)) { if (r.lastFilter) { r.veil.style.display = 'none'; r.veil.style.backdropFilter = ''; r.veil.style.webkitBackdropFilter = ''; r.lastFilter = ''; } return; }
      const o = distortOptions(); // [verify] a11y: flash reduction halves the colour swing, reduced motion drops the blur
      const f = (FILTERS[kind] ?? FILTERS.fear)(Math.min(1, k) * o.k, o.blur);
      if (f === r.lastFilter) return;
      r.lastFilter = f;
      r.veil.style.display = '';
      r.veil.style.backdropFilter = f;
      r.veil.style.webkitBackdropFilter = f;
    },
    // Every player's meter and veil at once (a step or a boss ending).
    clear() {
      for (const r of per.values()) {
        r.meter.style.display = 'none';
        r.veil.style.display = 'none'; r.veil.style.backdropFilter = ''; r.veil.style.webkitBackdropFilter = ''; r.lastFilter = '';
      }
    },
    // For each standing player: fn(player, hero).
    each(fn) { for (const p of players()) fn(p, p.hero); },
  };
  return api;
}
