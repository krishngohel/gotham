// Comic panel art for Act III's two villains, drawn with canvas (like src/ui/comicArt.js's Joker
// TV): the burlap doctor and the cold-suit scientist as inked busts on a halftone ground. Used by
// the night files' scenes (src/story/nights/n4.js, n5.js) and the boss intro/outro pages.
const INK = '#0b0b12';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function dots(g, w, h, color, step = 14, max = 5) {
  g.fillStyle = color;
  for (let y = 0; y < h; y += step) {
    for (let x = (y / step) % 2 ? step / 2 : 0; x < w; x += step) {
      const r = max * (1 - y / h);
      if (r < 0.5) continue;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }
}
function inked(g, fill, path, lw = 8) {
  g.beginPath(); path(); g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
}

// The burlap doctor: a sack head with stitched eyes and mouth, a noose collar, a gas line.
// mood: 'calm' | 'gloat' | 'beaten'
export function scarecrowPanel(mood = 'calm', { w = 900, h = 520 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = '#1d2418'; g.fillRect(0, 0, w, h);
  dots(g, w, h, 'rgba(184,154,98,0.28)', 16, 7);
  const cx = w / 2, cy = h * 0.55, s = h / 520;
  inked(g, '#3a3022', () => { g.moveTo(cx - 260 * s, h); g.quadraticCurveTo(cx, cy + 40 * s, cx + 260 * s, h); g.closePath(); });
  inked(g, '#b89a62', () => g.ellipse(cx, cy - 40 * s, 120 * s, 150 * s, 0, 0, Math.PI * 2));
  g.strokeStyle = '#7a6a44'; g.lineWidth = 3;
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(cx + i * 30 * s, cy - 180 * s); g.lineTo(cx + i * 34 * s, cy + 100 * s); g.stroke(); }
  g.fillStyle = mood === 'beaten' ? '#5a4a32' : '#e8d23a';
  for (const dx of [-45, 45]) { g.beginPath(); g.ellipse(cx + dx * s, cy - 70 * s, 22 * s, mood === 'gloat' ? 10 * s : 16 * s, 0, 0, Math.PI * 2); g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke(); }
  g.lineWidth = 6; g.strokeStyle = INK;
  g.beginPath();
  const smile = mood === 'gloat' ? 40 : mood === 'beaten' ? -20 : 10;
  g.moveTo(cx - 70 * s, cy + 10 * s); g.quadraticCurveTo(cx, cy + (10 + smile) * s, cx + 70 * s, cy + 10 * s); g.stroke();
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(cx + i * 20 * s, cy + (5 + smile * 0.5 * (1 - Math.abs(i) / 4)) * s); g.lineTo(cx + i * 20 * s, cy + (25 + smile * 0.5 * (1 - Math.abs(i) / 4)) * s); g.stroke(); }
  inked(g, '#8a7a52', () => { g.rect(cx - 90 * s, cy + 95 * s, 180 * s, 22 * s); }, 5);
  if (mood !== 'beaten') { g.fillStyle = 'rgba(122,200,90,0.35)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(cx + (i - 2.5) * 110 * s, h * 0.15 + (i % 2) * 40 * s, 60 * s, 0, Math.PI * 2); g.fill(); } }
  return c;
}

// The cold-suit scientist: a clear dome over a pale head, red goggles, a frosted collar.
// mood: 'cold' | 'angry' | 'beaten'
export function freezePanel(mood = 'cold', { w = 900, h = 520 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = '#16243a'; g.fillRect(0, 0, w, h);
  dots(g, w, h, 'rgba(127,216,255,0.25)', 16, 7);
  const cx = w / 2, cy = h * 0.56, s = h / 520;
  inked(g, '#5a7a9a', () => { g.moveTo(cx - 280 * s, h); g.lineTo(cx - 200 * s, cy + 80 * s); g.lineTo(cx + 200 * s, cy + 80 * s); g.lineTo(cx + 280 * s, h); g.closePath(); });
  inked(g, '#a8b8c8', () => g.rect(cx - 150 * s, cy + 50 * s, 300 * s, 50 * s), 6);
  inked(g, '#c8d4de', () => g.ellipse(cx, cy - 40 * s, 95 * s, 120 * s, 0, 0, Math.PI * 2));
  g.fillStyle = mood === 'beaten' ? '#6a2a2a' : '#e2323c';
  for (const dx of [-40, 40]) { g.beginPath(); g.ellipse(cx + dx * s, cy - 60 * s, 30 * s, mood === 'angry' ? 12 * s : 18 * s, 0, 0, Math.PI * 2); g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke(); }
  g.lineWidth = 6; g.strokeStyle = INK; g.beginPath(); g.moveTo(cx - 40 * s, cy + 15 * s); g.lineTo(cx + 40 * s, cy + (mood === 'angry' ? 5 : 15) * s); g.stroke();
  g.lineWidth = 7; g.strokeStyle = 'rgba(191,239,255,0.9)';
  g.beginPath(); g.ellipse(cx, cy - 50 * s, 150 * s, 170 * s, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.lineWidth = 6; g.strokeStyle = INK;
  g.beginPath(); g.ellipse(cx, cy - 50 * s, 160 * s, 180 * s, 0, 0, Math.PI * 2); g.stroke();
  if (mood !== 'beaten') { g.fillStyle = '#ffffff'; for (let i = 0; i < 40; i++) { const x = (i * 197) % w, y = (i * 113) % (h * 0.6); g.beginPath(); g.arc(x, y, 3 + (i % 3), 0, Math.PI * 2); g.fill(); } }
  return c;
}
