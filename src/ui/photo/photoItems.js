// Speech bubbles, stickers and caption presets for photo mode (workstream L1, item 7). Pure data
// and rules; photoDraw.js draws them. Positions are fractions of the picture (0..1, top-left
// origin) and sizes are in the frame's units (1% of the short side), so the preview and an
// export at any resolution place them identically.

export const BUBBLE_KINDS = ['speech', 'thought', 'shout'];
export const STICKER_KINDS = ['burst', 'star', 'arrow', 'question'];
export const ITEM_LABEL = { speech: 'Speech', thought: 'Thought', shout: 'Shout', burst: 'Burst', star: 'Star', arrow: 'Arrow', question: '?!' };

// Original lines, comic voice, general audience.
export const CAPTION_LINES = [
  'THE LONG NIGHT',
  'MEANWHILE, ON A ROOFTOP...',
  'LATER THAT NIGHT...',
  'NOT THEIR FINEST HOUR.',
  'THE CITY NEVER SLEEPS. NEITHER DO WE.',
  'ONE MORE ROUND.',
  'SOMEWHERE, A GARGOYLE SIGHS.',
  '',
];
export const BUBBLE_LINES = [
  'Nice night for it.',
  'Did anyone else hear that?',
  'I meant to do that.',
  'Hold still. This is art.',
  'That ledge looked shorter.',
  'Who ordered extra goons?',
  'Five more minutes.',
  'Smile for the rooftop!',
];
export const STICKER_WORDS = ['WHAM!', 'KRAK!', 'FWOOSH!', 'THUNK!', 'ZAP!', 'BOOM!'];

export const MAX_ITEMS = 12;
export const MAX_ITEM_TEXT = 60;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function sanitizeItemText(text) {
  return String(text ?? '').replace(/[–—]/g, '-').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_ITEM_TEXT);
}

let seq = 0;
export function createItem(kind, { x = 0.5, y = 0.4, text, scale = 1, flip = false, n = seq } = {}) {
  seq += 1;
  const bubble = BUBBLE_KINDS.includes(kind);
  const sticker = STICKER_KINDS.includes(kind);
  if (!bubble && !sticker) throw new Error(`unknown photo item ${kind}`);
  const def = bubble ? BUBBLE_LINES[n % BUBBLE_LINES.length] : kind === 'burst' ? STICKER_WORDS[n % STICKER_WORDS.length] : '';
  return {
    id: `i${Date.now().toString(36)}${seq}`, kind,
    x: clamp(x, 0.02, 0.98), y: clamp(y, 0.02, 0.98),
    text: sanitizeItemText(text ?? def),
    scale: clamp(scale, 0.5, 2.5), flip: !!flip,
    // Where the bubble's tail points (fractions); a little below and to the side by default.
    tx: clamp(x + (flip ? 0.08 : -0.08), 0, 1), ty: clamp(y + 0.16, 0, 1),
  };
}

export function addItem(items, item) {
  if (items.length >= MAX_ITEMS) return items;
  return [...items, item];
}
export function removeItem(items, id) { return items.filter((i) => i.id !== id); }
export function updateItem(items, id, patch) {
  return items.map((i) => (i.id === id ? { ...i, ...patch, text: patch.text !== undefined ? sanitizeItemText(patch.text) : i.text } : i));
}
// Moves the item and its tail together, kept on the picture.
export function moveItem(item, dx, dy) {
  const x = clamp(item.x + dx, 0.02, 0.98), y = clamp(item.y + dy, 0.02, 0.98);
  return { ...item, x, y, tx: clamp(item.tx + (x - item.x), 0, 1), ty: clamp(item.ty + (y - item.y), 0, 1) };
}

// Rough half-size of an item in picture fractions, for picking with the mouse.
export function itemExtent(item, w, h) {
  const u = Math.min(w, h) / 100;
  const r = (BUBBLE_KINDS.includes(item.kind) ? 14 : 9) * u * item.scale;
  return { rx: r / w, ry: (r * 0.7) / h };
}
// The top-most item under (x, y) (fractions), or null.
export function hitItem(items, x, y, w, h) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const { rx, ry } = itemExtent(it, w, h);
    if (Math.abs(x - it.x) <= rx && Math.abs(y - it.y) <= ry) return it;
  }
  return null;
}

export function cycleIn(list, cur, dir = 1) {
  const i = list.indexOf(cur);
  return i < 0 ? list[0] : list[(i + dir + list.length) % list.length];
}
