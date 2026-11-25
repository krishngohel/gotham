// UI stations: a tiny registry of full-screen pages that the Batcave (workstream K) opens by id,
// so the cave never imports the skill tree, the gadget loadout or the wardrobe directly.
//
//   registerStation(id, open)   open(ctx) -> { close() } | void; ctx = { onClose, player, ...extra }
//   openStation(id, ctx)        never throws: an unknown id (or a page that fails) shows a small
//                               "not installed yet" card and calls ctx.onClose when it is dismissed
//   hasStation(id), stationIds()
//
// Ids in use (docs/design/progression.md): 'skillTree', 'gadgets', 'suits'.
// One registry for every workstream's stations ('cityMap' from the map, 'skillTree', 'gadgets',
// 'suits' from progression). openStation returns a handle { close() }; an unknown id shows the
// placeholder card, so callers that need to know ask hasStation(id) first.
export const stations = new Map();

export const STATION_IDS = Object.freeze(['skillTree', 'gadgets', 'suits', 'cityMap']);

export function registerStation(id, open) {
  if (typeof id !== 'string' || typeof open !== 'function') throw new Error('registerStation(id, open)');
  stations.set(id, open);
  return () => { if (stations.get(id) === open) stations.delete(id); };
}

export const hasStation = (id) => stations.has(id);
export const stationIds = () => [...stations.keys()];

// A plain card for a station that is not there (yet), or one whose page threw.
function placeholder(id, ctx, root) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) { ctx.onClose?.(); return { close() {} }; }
  const box = doc.createElement('div');
  box.className = 'station-placeholder menu';
  box.setAttribute('role', 'dialog');
  const h = doc.createElement('h2');
  h.textContent = 'Not wired up yet';
  const p = doc.createElement('p');
  p.textContent = `The ${String(id)} station has nothing installed. Lucius says next week.`;
  const b = doc.createElement('button');
  b.className = 'mbtn small';
  b.textContent = 'Back';
  let done = false;
  const close = () => { if (done) return; done = true; box.remove(); ctx.onClose?.(); };
  b.addEventListener('click', close);
  box.append(h, p, b);
  (root ?? doc.body).appendChild(box);
  b.focus?.();
  return { close };
}

export function openStation(id, ctx = {}) {
  const open = stations.get(id);
  if (!open) return placeholder(id, ctx, ctx.root);
  try {
    return open(ctx) ?? { close() {} };
  } catch (err) {
    console.error(`station ${id}`, err);
    return placeholder(id, ctx, ctx.root);
  }
}
