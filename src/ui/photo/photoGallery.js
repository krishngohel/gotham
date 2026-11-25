// The in-game photo gallery (workstream L1, item 7): small downscaled thumbnails kept in the
// browser under its own key, never in the game save. Capped by count and bytes; every storage
// call is wrapped, so full or blocked storage only means the gallery doesn't keep the shot.
// DOM-free: storage is injected (localStorage in the game, a Map-backed fake in tests).

export const GALLERY_KEY = 'gotham-photos-v1';
export const GALLERY_CAPS = { maxCount: 24, maxBytes: 1_200_000 };

// Approximate bytes an entry costs in storage (JSON text, UTF-16 in some browsers: count chars).
export function entryBytes(e) {
  return (e?.thumb?.length ?? 0) + (e?.caption?.length ?? 0) + 160;
}
export const listBytes = (list) => list.reduce((n, e) => n + entryBytes(e), 0);

const ok = (e) => e && typeof e === 'object' && typeof e.id === 'string' && typeof e.thumb === 'string' && e.thumb.startsWith('data:image/');

// Newest first. Drops the oldest until both caps hold. An entry that alone is over the byte cap
// is refused ({ list unchanged, added: false }).
export function addPhoto(list, entry, caps = GALLERY_CAPS) {
  const { maxCount, maxBytes } = { ...GALLERY_CAPS, ...caps };
  if (!ok(entry) || entryBytes(entry) > maxBytes) return { list, added: false, dropped: [] };
  const next = [entry, ...list.filter((e) => e.id !== entry.id)];
  const dropped = [];
  while (next.length > maxCount || (next.length > 1 && listBytes(next) > maxBytes)) dropped.push(next.pop());
  return { list: next, added: true, dropped };
}

export function sanitizeGallery(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const e of raw) {
    if (!ok(e) || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({
      id: e.id, thumb: e.thumb, t: Number(e.t) || 0,
      w: Math.max(0, Number(e.w) | 0), h: Math.max(0, Number(e.h) | 0),
      filter: typeof e.filter === 'string' ? e.filter.slice(0, 16) : 'ink',
      caption: typeof e.caption === 'string' ? e.caption.slice(0, 64) : '',
    });
  }
  return out;
}

const defaultStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function createGallery({ storage = defaultStorage(), key = GALLERY_KEY, caps = GALLERY_CAPS } = {}) {
  let list = null;
  function load() {
    if (list) return list;
    list = [];
    try {
      const raw = storage?.getItem(key);
      if (raw) list = sanitizeGallery(JSON.parse(raw));
    } catch { list = []; }
    return list;
  }
  // Writes the list; on a quota error drops the oldest and tries again (a few times at most).
  function write(next) {
    let l = next;
    for (let i = 0; i < 6; i++) {
      try {
        storage?.setItem(key, JSON.stringify(l));
        return l;
      } catch {
        if (l.length <= 1) return null;
        l = l.slice(0, Math.max(1, Math.floor(l.length * 0.6)));
      }
    }
    return null;
  }
  return {
    key,
    list: () => load().slice(),
    get count() { return load().length; },
    get bytes() { return listBytes(load()); },
    // Returns true when the photo is in the gallery (in memory at least for this session).
    add(entry) {
      const r = addPhoto(load(), entry, caps);
      if (!r.added) return false;
      const saved = write(r.list);
      list = saved ?? r.list;
      return true;
    },
    remove(id) {
      const next = load().filter((e) => e.id !== id);
      list = write(next) ?? next;
    },
    clear() {
      list = [];
      try { storage?.removeItem(key); } catch { /* blocked storage: nothing to clear */ }
    },
    reload() { list = null; return load().slice(); },
  };
}
