// Draws photo mode's speech bubbles and stickers onto a 2D canvas (the preview overlay and the
// exported picture use the same code, so placement matches at any size). Items: photoItems.js.
const INK = '#0b0b12', PAPER = '#fffdf3', SIGNAL = '#f2d24b', RED = '#c8323c', CYAN = '#5fd3e6';

function wrap(g, text, max) {
  const lines = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const t = cur ? `${cur} ${word}` : word;
    if (cur && g.measureText(t).width > max) { lines.push(cur); cur = word; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

function burstPath(g, cx, cy, r, spikes, jag = 0.62) {
  g.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * jag * (0.92 + 0.16 * ((i * 7) % 3) / 2) : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
  }
  g.closePath();
}

function drawBubble(g, it, w, h, u, selected) {
  const s = it.scale;
  const font = 3.4 * u * s;
  g.font = `${font}px "Patrick Hand SC", "Comic Sans MS", cursive`;
  const lines = wrap(g, it.text || '...', 30 * u * s);
  const lh = font * 1.08;
  const tw = Math.max(...lines.map((l) => g.measureText(l).width), 6 * u);
  const rx = tw / 2 + 3.2 * u * s, ry = (lines.length * lh) / 2 + 2.6 * u * s;
  const cx = it.x * w, cy = it.y * h, tx = it.tx * w, ty = it.ty * h;
  g.lineWidth = Math.max(2, 0.55 * u * s);
  g.strokeStyle = INK;
  g.fillStyle = it.kind === 'shout' ? SIGNAL : PAPER;
  if (it.kind === 'thought') {
    // Trail of little clouds toward the speaker.
    for (let k = 1; k <= 3; k++) {
      const f = k / 4, r = (1.6 - k * 0.35) * u * s;
      g.beginPath();
      g.ellipse(cx + (tx - cx) * f, cy + ry * (1 - f) + (ty - cy - ry) * f, r * 1.3, r, 0, 0, Math.PI * 2);
      g.fill(); g.stroke();
    }
    g.beginPath();
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      g.ellipse(cx + Math.cos(a) * rx * 0.82, cy + Math.sin(a) * ry * 0.78, rx * 0.36, ry * 0.42, 0, 0, Math.PI * 2);
    }
    g.fill(); g.stroke();
    g.beginPath(); g.ellipse(cx, cy, rx * 0.86, ry * 0.8, 0, 0, Math.PI * 2); g.fill();
  } else if (it.kind === 'shout') {
    burstPath(g, cx, cy, Math.max(rx, ry * 1.3) * 1.18, 14, 0.8);
    g.fill(); g.stroke();
    g.beginPath();
    g.moveTo(cx + (tx - cx) * 0.2 - u * s, cy + ry * 0.6); g.lineTo(tx, ty); g.lineTo(cx + (tx - cx) * 0.2 + 2 * u * s, cy + ry * 0.6);
    g.closePath(); g.fill(); g.stroke();
  } else {
    // Speech: an oval with a tapered tail; the fill hides the tail's root.
    const ang = Math.atan2(ty - cy, tx - cx);
    const bx = cx + Math.cos(ang) * rx * 0.8, by = cy + Math.sin(ang) * ry * 0.8;
    const nx = -Math.sin(ang) * 1.6 * u * s, ny = Math.cos(ang) * 1.6 * u * s;
    g.beginPath(); g.moveTo(bx + nx, by + ny); g.quadraticCurveTo((bx + tx) / 2, (by + ty) / 2 + ny * 0.3, tx, ty); g.lineTo(bx - nx, by - ny); g.closePath();
    g.fill(); g.stroke();
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(bx + nx * 0.9, by + ny * 0.9); g.lineTo(bx - nx * 0.9, by - ny * 0.9); g.lineWidth = g.lineWidth * 1.6; g.strokeStyle = PAPER; g.stroke();
    g.strokeStyle = INK;
  }
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * lh));
  if (selected) { g.setLineDash([u, u]); g.strokeStyle = CYAN; g.lineWidth = Math.max(1, u * 0.3); g.strokeRect(cx - rx - u, cy - ry - u, rx * 2 + 2 * u, ry * 2 + 2 * u); g.setLineDash([]); }
}

function drawSticker(g, it, w, h, u, selected) {
  const s = it.scale, cx = it.x * w, cy = it.y * h, r = 8 * u * s;
  g.lineWidth = Math.max(2, 0.6 * u * s);
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  if (it.kind === 'burst') {
    burstPath(g, cx, cy, r * 1.3, 12);
    g.fillStyle = RED; g.fill(); g.stroke();
    burstPath(g, cx, cy, r * 0.95, 12);
    g.fillStyle = SIGNAL; g.fill();
    const text = it.text || 'POW!';
    let size = r * 0.62;
    g.font = `${size}px Bangers, Impact, sans-serif`;
    while (size > 6 && g.measureText(text).width > r * 1.8) { size *= 0.9; g.font = `${size}px Bangers, Impact, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(cx, cy); g.rotate(-0.12);
    g.lineWidth = size * 0.14; g.strokeText(text, 0, 0); g.fillStyle = PAPER; g.fillText(text, 0, 0);
    g.restore();
  } else if (it.kind === 'star') {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath(); g.fillStyle = SIGNAL; g.fill(); g.stroke();
  } else if (it.kind === 'arrow') {
    g.save(); g.translate(cx, cy); if (it.flip) g.scale(-1, 1); g.rotate(0.35);
    g.beginPath();
    g.moveTo(-r, -r * 0.18); g.lineTo(r * 0.25, -r * 0.18); g.lineTo(r * 0.25, -r * 0.5); g.lineTo(r, 0);
    g.lineTo(r * 0.25, r * 0.5); g.lineTo(r * 0.25, r * 0.18); g.lineTo(-r, r * 0.18); g.closePath();
    g.fillStyle = RED; g.fill(); g.stroke();
    g.restore();
  } else {
    g.font = `${r * 1.5}px Bangers, Impact, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = r * 0.16; g.strokeText('?!', cx, cy); g.fillStyle = SIGNAL; g.fillText('?!', cx, cy);
  }
  if (selected) { g.setLineDash([u, u]); g.strokeStyle = CYAN; g.lineWidth = Math.max(1, u * 0.3); g.strokeRect(cx - r * 1.3, cy - r * 1.1, r * 2.6, r * 2.2); g.setLineDash([]); }
}

// items: photoItems.js items. selectedId: outlined in the preview only (pass null for exports).
export function drawPhotoItems(g, w, h, items, selectedId = null) {
  const u = Math.min(w, h) / 100;
  g.save();
  g.lineJoin = 'round';
  for (const it of items) {
    if (it.kind === 'speech' || it.kind === 'thought' || it.kind === 'shout') drawBubble(g, it, w, h, u, it.id === selectedId);
    else drawSticker(g, it, w, h, u, it.id === selectedId);
  }
  g.restore();
}
