// Comic art for the side chains (code-drawn, no assets): a villain card with an emblem (a cat's
// head, a scarred coin, a clay hand, a crosshair mask) behind a caption band, in the halftone look
// of src/ui/comicArt.js. Browser only (canvas); called when a comic plays, never at import time.
const INK = '#0b0b12', PAPER = '#efe6cf';
const STYLE = {
  catBurglar: { bg: '#141018', tone: '#3a2a4a', accent: '#b08ad8' },
  twoFace: { bg: '#101418', tone: '#3a3a40', accent: '#e8e2d6' },
  clayBrute: { bg: '#1a140e', tone: '#5a4a32', accent: '#c9a66a' },
  mercenary: { bg: '#18100c', tone: '#4a2a1a', accent: '#d06a2c' },
};

function halftone(g, w, h, color, step = 14) {
  g.fillStyle = color;
  for (let y = 0; y < h; y += step) for (let x = (y / step) % 2 ? step / 2 : 0; x < w; x += step) { g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }
}

const EMBLEM = {
  catBurglar(g, x, y, s, c) {
    g.fillStyle = c; g.strokeStyle = INK; g.lineWidth = s * 0.05;
    g.beginPath(); g.moveTo(x - s, y + s * 0.6); g.lineTo(x - s * 0.9, y - s * 0.9); g.lineTo(x - s * 0.35, y - s * 0.35);
    g.lineTo(x + s * 0.35, y - s * 0.35); g.lineTo(x + s * 0.9, y - s * 0.9); g.lineTo(x + s, y + s * 0.6);
    g.quadraticCurveTo(x, y + s * 1.2, x - s, y + s * 0.6); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = INK; for (const k of [-1, 1]) { g.beginPath(); g.ellipse(x + k * s * 0.38, y + s * 0.1, s * 0.16, s * 0.07, k * 0.3, 0, Math.PI * 2); g.fill(); }
  },
  twoFace(g, x, y, s, c) {
    g.lineWidth = s * 0.06; g.strokeStyle = INK;
    g.fillStyle = c; g.beginPath(); g.arc(x, y, s, Math.PI / 2, Math.PI * 1.5); g.fill();
    g.fillStyle = '#6a1a26'; g.beginPath(); g.arc(x, y, s, -Math.PI / 2, Math.PI / 2); g.fill();
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = INK; g.lineWidth = s * 0.04;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(x + s * 0.15, y - s * 0.6 + i * s * 0.3); g.lineTo(x + s * 0.7, y - s * 0.5 + i * s * 0.28); g.stroke(); }
    g.font = `${Math.round(s * 0.9)}px Bangers, Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK; g.fillText('2', x - s * 0.45, y);
  },
  clayBrute(g, x, y, s, c) {
    g.fillStyle = c; g.strokeStyle = INK; g.lineWidth = s * 0.05;
    g.beginPath(); g.ellipse(x, y + s * 0.3, s * 0.6, s * 0.55, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    for (let i = 0; i < 4; i++) { g.beginPath(); g.roundRect(x - s * 0.55 + i * s * 0.3, y - s * 0.75 + (i % 2) * s * 0.12, s * 0.22, s * 0.8, s * 0.1); g.fill(); g.stroke(); }
    g.fillStyle = '#8a7a62'; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(x - s * 0.3 + i * s * 0.3, y + s * 1.0 + (i % 2) * s * 0.1, s * 0.08, s * 0.16, 0, 0, Math.PI * 2); g.fill(); }
  },
  mercenary(g, x, y, s, c) {
    g.lineWidth = s * 0.05; g.strokeStyle = INK;
    g.fillStyle = c; g.beginPath(); g.arc(x, y, s * 0.85, Math.PI / 2, Math.PI * 1.5); g.fill();
    g.fillStyle = '#16161c'; g.beginPath(); g.arc(x, y, s * 0.85, -Math.PI / 2, Math.PI / 2); g.fill();
    g.beginPath(); g.arc(x, y, s * 0.85, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#ff3a2a'; g.lineWidth = s * 0.04;
    g.beginPath(); g.arc(x - s * 0.3, y - s * 0.1, s * 0.2, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(x - s * 1.1, y - s * 0.1); g.lineTo(x + s * 1.1, y - s * 0.1); g.moveTo(x - s * 0.3, y - s * 1.1); g.lineTo(x - s * 0.3, y + s * 0.9); g.stroke();
  },
};

export function chainCard(kind, title = '', sub = '', { w = 900, h = 520 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const st = STYLE[kind] ?? STYLE.twoFace;
  g.fillStyle = st.bg; g.fillRect(0, 0, w, h);
  halftone(g, w, h, st.tone);
  g.save(); g.translate(w / 2, h * 0.42);
  for (let i = 0; i < 18; i++) { g.rotate(Math.PI / 9); g.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.1)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, -40); g.lineTo(w, 40); g.fill(); }
  g.restore();
  (EMBLEM[kind] ?? EMBLEM.twoFace)(g, w / 2, h * 0.4, h * 0.24, st.accent);
  if (title) {
    g.fillStyle = PAPER; g.fillRect(0, h * 0.76, w, h * 0.24);
    g.fillStyle = INK; g.fillRect(0, h * 0.76, w, 6);
    g.font = `${Math.round(h * 0.1)}px Bangers, Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(title, w / 2, h * 0.84);
    if (sub) { g.font = `${Math.round(h * 0.05)}px 'Patrick Hand SC', sans-serif`; g.fillText(sub, w / 2, h * 0.93); }
  }
  g.lineWidth = 10; g.strokeStyle = INK; g.strokeRect(0, 0, w, h);
  return c;
}

// A two-panel page: a card and a line. `beats`: [{ card: [kind, title, sub], text, balloon }]
export function chainPages(beats) {
  return beats.map((b) => ({
    layout: 'duo',
    panels: [
      { img: chainCard(...b.card), caption: b.caption ?? '' },
      { img: chainCard(b.card[0], b.title2 ?? '', b.sub2 ?? ''), balloons: b.balloon ? [{ text: b.balloon, x: 50, y: 6, w: 80 }] : [] },
    ],
  }));
}
