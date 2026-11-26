// Comic panel art for Act II's villains (code-drawn, no assets): a villain's "broadcast" card with
// an emblem (an umbrella for the crime boss, a question mark for the puzzler) behind a caption
// band, in the ink-and-halftone look of src/ui/comicArt.js. Browser only (canvas); called from
// the night files' scene functions, never at import time.
const INK = '#0b0b12', PAPER = '#efe6cf';

function halftone(g, w, h, color, step = 14) {
  g.fillStyle = color;
  for (let y = 0; y < h; y += step) for (let x = (y / step) % 2 ? step / 2 : 0; x < w; x += step) { g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }
}

function umbrella(g, cx, cy, s, color) {
  g.lineWidth = s * 0.05; g.strokeStyle = INK; g.fillStyle = color;
  g.beginPath(); g.moveTo(cx - s, cy);
  for (let i = 0; i < 4; i++) { const x0 = cx - s + i * (s / 2); g.quadraticCurveTo(x0 + s / 4, cy - s * 0.18, x0 + s / 2, cy); }
  g.quadraticCurveTo(cx, cy - s * 1.15, cx - s, cy); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy + s * 0.95); g.arc(cx - s * 0.16, cy + s * 0.95, s * 0.16, 0, Math.PI); g.stroke();
}

function question(g, cx, cy, s, color) {
  g.font = `900 ${Math.round(s * 2.2)}px Bangers, Impact, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = s * 0.12; g.strokeStyle = INK; g.strokeText('?', cx, cy); g.fillStyle = color; g.fillText('?', cx, cy);
}

// villainCard('penguin' | 'riddler', title, sub) -> canvas
export function villainCard(kind, title = '', sub = '', { w = 900, h = 520 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const bg = kind === 'riddler' ? '#16301c' : '#141a26';
  const tone = kind === 'riddler' ? '#2f8a3a' : '#3a4a66';
  const accent = kind === 'riddler' ? '#7dff4a' : '#7a3a8a';
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  halftone(g, w, h, tone);
  // A spotlight burst behind the emblem.
  g.save(); g.translate(w / 2, h * 0.44);
  for (let i = 0; i < 18; i++) { g.rotate(Math.PI / 9); g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.11)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, -40); g.lineTo(w, 40); g.fill(); }
  g.restore();
  if (kind === 'riddler') question(g, w / 2, h * 0.42, h * 0.22, accent);
  else umbrella(g, w / 2, h * 0.42, h * 0.3, accent);
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
