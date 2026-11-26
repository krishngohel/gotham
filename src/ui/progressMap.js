// Inks the Progress page map: paper, hatched harbour, district-tinted blocks, trophy pins
// (filled when found, outlined once their district is visited) and bat medals for challenges.
//
// Workstream L2: when the navigation system is running it registers the city model here
// (setProgressCity), and the page shows the whole city instead (src/ui/minimap/mapPainter.js),
// fogged where nobody has been, with each visited district's progress ring at its name. The old
// core-only drawing stays for anything that draws without a running game.
import { batOutline } from '../config/batShape.js';
import { DISTRICT_TINT } from '../world/regions/data.js';
import { drawCity } from './minimap/mapPainter.js';

const INK = '#0b0b12', PAPER = '#efe6cf', RED = '#c8323c';
// District tints are data from the region list; 'city' is the paper tone between districts.
const TINT = { ...DISTRICT_TINT, city: '#d8cfb8' };
const MEDAL = { gold: '#f2d24b', silver: '#c9ccd6', bronze: '#c07a3c' };
const BAT = batOutline();

let city = null;
// { model, fogLayer(): { canvas, cell, ox, oz } | null } from src/nav/navSystem.js, or null.
export function setProgressCity(c) { city = c; }

// One line per visited district for the page ("Neon Row: trophies 2/3, medals 1/2, crimes 4").
export function districtLines(m) {
  return (m.districts ?? []).filter((d) => d.visited).map((d) => {
    const parts = [];
    if (d.trophies.total) parts.push(`trophies ${d.trophies.found}/${d.trophies.total}`);
    if (d.medals.total) parts.push(`medals ${d.medals.won}/${d.medals.total}`);
    if (d.collectibles) parts.push(`${d.collectibles} hidden ${d.collectibles === 1 ? 'item' : 'items'}`);
    parts.push(`crimes stopped ${d.crimes.stopped}`);
    return `${d.label}: ${parts.join(', ')}`;
  });
}

// Share of a district's countable things done (0..1), or null when it has none.
export function districtFraction(d) {
  const total = d.trophies.total + d.medals.total;
  return total ? (d.trophies.found + d.medals.won) / total : null;
}

function drawMedal(g, u, v, medal, k = 0.12) {
  g.beginPath();
  BAT.forEach(([x, y], i) => (i ? g.lineTo(u + x * k, v - y * k) : g.moveTo(u + x * k, v - y * k)));
  g.closePath();
  g.fillStyle = MEDAL[medal] ?? PAPER;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = INK;
  g.stroke();
}
function drawPin(g, u, v, found, r = 3.2) {
  g.beginPath();
  g.arc(u, v, r, 0, Math.PI * 2);
  if (found) { g.fillStyle = RED; g.fill(); }
  g.lineWidth = 1.3;
  g.strokeStyle = found ? INK : RED;
  g.stroke();
}

function drawCityProgress(canvas, m) {
  const g = canvas.getContext('2d');
  const b = city.model.bounds;
  const size = Math.min(canvas.width, canvas.height);
  const s = size / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const ox = b.minX - (size / s - (b.maxX - b.minX)) / 2, oz = b.minZ - (size / s - (b.maxZ - b.minZ)) / 2;
  const X = (x) => (x - ox) * s, Z = (z) => (z - oz) * s;
  g.save();
  drawCity(g, city.model, { s, ox, oz }, {});
  const F = city.fogLayer?.();
  if (F) { g.imageSmoothingEnabled = true; g.drawImage(F.canvas, X(F.ox), Z(F.oz), F.canvas.width * F.cell * s, F.canvas.height * F.cell * s); }
  const k = size / 360;
  for (const c of m.challenges) if (Number.isFinite(c.x)) drawMedal(g, X(c.x), Z(c.z), c.medal, 0.1 * k);
  for (const p of m.trophies) if (Number.isFinite(p.x)) drawPin(g, X(p.x), Z(p.z), p.found, 2.6 * k);
  // A progress ring and the name at each visited district.
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const d of m.districts ?? []) {
    if (!d.visited) continue;
    const md = city.model.districts.find((q) => q.id === d.id);
    if (!md?.area) continue;
    const x = X(md.cx), y = Z(md.cz), r = 7 * k;
    const f = districtFraction(d);
    if (f !== null) {
      g.beginPath(); g.arc(x, y - 9 * k, r, 0, Math.PI * 2); g.fillStyle = PAPER; g.fill();
      g.beginPath(); g.moveTo(x, y - 9 * k); g.arc(x, y - 9 * k, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); g.closePath(); g.fillStyle = '#3a9a4a'; g.fill();
      g.beginPath(); g.arc(x, y - 9 * k, r, 0, Math.PI * 2); g.lineWidth = 1.4 * k; g.strokeStyle = INK; g.stroke();
    }
    g.font = `${Math.round(9 * k)}px 'Bangers', cursive`;
    g.lineWidth = 3 * k; g.strokeStyle = PAPER; g.strokeText(d.label.toUpperCase(), x, y + 3 * k);
    g.fillStyle = INK; g.fillText(d.label.toUpperCase(), x, y + 3 * k);
  }
  g.lineWidth = 3 * k;
  g.strokeStyle = INK;
  g.strokeRect(1.5 * k, 1.5 * k, canvas.width - 3 * k, canvas.height - 3 * k);
  g.restore();
}

export function drawProgressMap(canvas, m) {
  if (city?.model && (m.trophies ?? []).every((p) => Number.isFinite(p.x))) { drawCityProgress(canvas, m); return; }
  const g = canvas.getContext('2d');
  g.save();
  g.scale(canvas.width / m.size, canvas.height / m.size);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, m.size, m.size);
  g.fillStyle = '#b9c7cf';
  g.fillRect(0, m.water, m.size, m.size - m.water);
  g.strokeStyle = 'rgba(11,11,18,0.35)';
  g.lineWidth = 0.6;
  const depth = m.size - m.water;
  for (let x = -depth; x < m.size; x += 6) { g.beginPath(); g.moveTo(x, m.size); g.lineTo(x + depth, m.water); g.stroke(); }
  g.strokeStyle = INK;
  for (const b of m.blocks) {
    g.fillStyle = TINT[b.district] ?? TINT.city;
    g.fillRect(b.u, b.v, b.w, b.h);
    g.lineWidth = b.landmark ? 1.4 : 0.7;
    g.strokeRect(b.u, b.v, b.w, b.h);
  }
  for (const c of m.challenges) drawMedal(g, c.u, c.v, c.medal);
  for (const p of m.trophies) drawPin(g, p.u, p.v, p.found);
  g.lineWidth = 3;
  g.strokeStyle = INK;
  g.strokeRect(1.5, 1.5, m.size - 3, m.size - 3);
  g.restore();
}
