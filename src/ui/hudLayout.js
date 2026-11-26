// [polish] The HUD's layout grammar: which kind of thing goes where, so no two panels ever share
// a spot. Pure (no DOM); src/ui/hud.js, src/ui/sideHud.js and style.css follow it.
//
//   corner chips   small, standing readouts in the four corners:
//                    top left      minimap, wanted readout beside it
//                    top right     the objective caption, and under it in one column: a lock
//                                  note, chips (collapsed cards, checkpoints), the goal ahead, then
//                                  the current job card (a crime, a case: src/openworld/ui/owHud.js)
//                    bottom left   vitals: health ring and gadget slot (Batman), or the double-life
//                                  card (Bruce, src/bruce/ui.js)
//                    bottom right  status: fps, autosave
//   side panels    the feed (left, under the minimap): police radio, toasts, a challenge panel,
//                  stacked by stackSlot() below, oldest dropped first when there is no room;
//                  the dialogue (right, low): radio and story speech (src/ui/radio.js)
//   centre cards   one at a time, through the HUD director (src/ui/hudDirector.js): the goal
//                  banner, WayneTech deliveries, level-ups. Compact HUD and split screen turn
//                  them into chips (no room for a centre card in half a screen)
//   prompts        bottom centre: the tutorial prompt, short hints, the vehicle toast above it
//   action area    what is left (the middle band): comic sound words keep to it (placeWord in
//                  src/ui/hud.js avoids every panel's rect and drops a word with nowhere to go)
export const SLOTS = Object.freeze({
  minimap: 'corner', wanted: 'corner', objective: 'corner', vitals: 'corner', status: 'corner',
  feed: 'side', job: 'side', dialogue: 'side',
  card: 'centre', banner: 'centre', boss: 'centre',
  prompt: 'prompt', vehicleToast: 'prompt',
});

// The feed column's bounds for a view of height h (CSS px): under the minimap and its district
// label, above the vitals corner. compact: the smaller minimap.
export function feedBounds(h, { compact = false, split = false } = {}) {
  const top = split ? 200 : compact ? 196 : 236;
  const bottom = h - (split ? 250 : compact ? 150 : 176);
  return { top, bottom: Math.max(top, bottom) };
}

// Stacks the feed's items top-down from `top`, `gap` apart. items: [{ id, h, pinned?, at }] in
// any order; pinned items (a running challenge) come first, the rest oldest first (newest at the
// bottom, where the eye lands next). When they don't all fit above `bottom`, the oldest unpinned
// ones are dropped until they do. Returns { placed: [{ id, y }], dropped: [id] }.
export function stackSlot(items, { top, bottom, gap = 8 }) {
  const order = [...items].sort((a, b) => (!!b.pinned - !!a.pinned) || (a.at ?? 0) - (b.at ?? 0));
  const dropped = [];
  const total = (list) => list.reduce((s, it, i) => s + it.h + (i ? gap : 0), 0);
  while (order.length && top + total(order) > bottom) {
    const i = order.findIndex((it) => !it.pinned);
    if (i < 0) break;
    dropped.push(order.splice(i, 1)[0].id);
  }
  const placed = [];
  let y = top;
  for (const it of order) { placed.push({ id: it.id, y }); y += it.h + gap; }
  return { placed, dropped };
}

// Two DOMRect-likes overlap (by more than `slack` px each way: rotated panels' boxes graze).
export function overlaps(a, b, slack = 2) {
  return a.left < b.right - slack && b.left < a.right - slack && a.top < b.bottom - slack && b.top < a.bottom - slack;
}

// Every overlapping pair among named boxes ([{ name, rect }]): the layout check (scripts/hud-shots.mjs).
export function findOverlaps(boxes, slack = 2) {
  const out = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    if (overlaps(boxes[i].rect, boxes[j].rect, slack)) out.push([boxes[i].name, boxes[j].name]);
  }
  return out;
}

// Centre cards become chips when there is no room for them: the compact HUD, or a split view.
export const cardsAsChips = ({ compact = false, split = false } = {}) => !!(compact || split);
