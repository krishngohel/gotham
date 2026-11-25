// Save slots, export and import (wave 3, workstream L1). Pure apart from the storage passed in.
//
// Slot 1 IS the old single save: key gotham-progress-v1, untouched, so every existing save is
// slot 1 with no migration step at all. Slots 2 and 3 live beside it; the guest profile (an online
// co-op run as a guest, design 4.4 save rule) has its own key. Which slot is in play is stored
// under gotham-slot-v1. Settings (gotham-settings-v1) stay global.
//
// slotStorage(real, slot) is a Storage-like wrapper that maps the one progress key everything
// already writes (save.js, flow.js, sideContent, net's guestStorage) onto that slot's key, so no
// caller changes: game.js just hands the wrapper out as `storage`.
//
// Export code: GOTHAM1.<base64url(utf-8 JSON)>.<crc32 hex>. Export file: JSON with a header and
// the same checksum. Imports are size-capped, checksum-checked, parsed defensively and always run
// through sanitizeProgress, so a corrupt or hostile import can never reach the game unsanitised.
import { sanitizeProgress } from './save.js';
import { levelOf } from '../progress/xp.js';

export const PROGRESS_KEY = 'gotham-progress-v1';
export const ACTIVE_KEY = 'gotham-slot-v1';
export const SLOTS = [1, 2, 3];
export const SLOT_KEYS = Object.freeze({ 1: PROGRESS_KEY, 2: `${PROGRESS_KEY}-slot2`, 3: `${PROGRESS_KEY}-slot3`, guest: `${PROGRESS_KEY}-guest` });
export const CODE_PREFIX = 'GOTHAM1';
export const MAX_IMPORT_BYTES = 256 * 1024;
export const FILE_FORMAT = 'gotham-long-night-save';

const isSlot = (s) => s === 1 || s === 2 || s === 3 || s === 'guest';
export const slotKey = (slot) => SLOT_KEYS[isSlot(slot) ? slot : 1];

export function getActiveSlot(storage) {
  try {
    const v = Number(storage?.getItem(ACTIVE_KEY));
    return SLOTS.includes(v) ? v : 1;
  } catch { return 1; }
}
export function setActiveSlot(storage, slot) {
  try { storage?.setItem(ACTIVE_KEY, String(SLOTS.includes(slot) ? slot : 1)); } catch { /* blocked */ }
}

// A storage that reads and writes `slot`'s progress under the old key's name. `onWrite(slot)` is
// told about every progress write (the autosave indicator).
export function slotStorage(real, slot, { onWrite = null } = {}) {
  const key = slotKey(slot);
  const map = (k) => (k === PROGRESS_KEY ? key : k);
  return {
    slot,
    getItem: (k) => real?.getItem(map(k)) ?? null,
    setItem(k, v) {
      real?.setItem(map(k), v);
      if (k === PROGRESS_KEY) onWrite?.(slot);
    },
    removeItem: (k) => real?.removeItem?.(map(k)),
  };
}

function readRaw(storage, slot) {
  try {
    const raw = storage?.getItem(slotKey(slot));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
  } catch { return null; }
}

// A slot is empty when nothing was ever saved there or the story never started and nothing earned.
export function isEmptyProgress(p) {
  return !p || (!(p.step > 0) && !p.finished && !(p.wayne?.xp > 0) && !(p.trophies?.length) && !(p.stats?.playTime > 1));
}

// What the title screen shows for a slot. `score(progress) -> percent` and `stepName(progress)`
// are passed in by the game (they live outside core).
export function slotSummary(storage, slot, { score = null, stepName = null } = {}) {
  const raw = readRaw(storage, slot);
  if (!raw) return { slot, empty: true };
  const p = sanitizeProgress(raw);
  if (isEmptyProgress(p)) return { slot, empty: true };
  let percent = null;
  try { percent = score ? score(p) : null; } catch { percent = null; }
  let where = null;
  try { where = stepName ? stepName(p) : null; } catch { where = null; }
  return {
    slot, empty: false, percent, where,
    finished: p.finished === true,
    ngPlus: p.mode?.ngPlus ?? 0,
    difficulty: p.mode?.difficulty ?? null,
    playTime: p.stats.playTime,
    level: levelOf(p.wayne?.xp ?? 0),
    xp: p.wayne?.xp ?? 0,
    trophies: p.trophies.length,
    suit: p.suit,
  };
}

export function formatPlayTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

export function copySlot(storage, from, to) {
  if (from === to || !isSlot(from) || !SLOTS.includes(to)) return false;
  try {
    const raw = storage.getItem(slotKey(from));
    if (!raw) return false;
    storage.setItem(slotKey(to), raw);
    return true;
  } catch { return false; }
}

export function deleteSlot(storage, slot) {
  if (!isSlot(slot)) return false;
  try {
    if (storage.removeItem) storage.removeItem(slotKey(slot));
    else storage.setItem(slotKey(slot), '{}');
    return true;
  } catch { return false; }
}

// Writes an imported (already sanitised) progress into a slot.
export function writeSlot(storage, slot, progress) {
  if (!SLOTS.includes(slot)) return false;
  try { storage.setItem(slotKey(slot), JSON.stringify(progress)); return true; } catch { return false; }
}

// ---- checksums and encodings ----
let CRC_TABLE = null;
export function crc32(str) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  const bytes = new TextEncoder().encode(str);
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad characters');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// Only plain data survives into the export: no functions, getters are read (reputation's toJSON).
const plain = (progress) => JSON.stringify(sanitizeProgress(JSON.parse(JSON.stringify(progress))));

export function exportCode(progress) {
  const json = plain(progress);
  return `${CODE_PREFIX}.${toBase64Url(json)}.${crc32(json)}`;
}

export function exportFile(progress, { now = Date.now() } = {}) {
  const json = plain(progress);
  return JSON.stringify({ format: FILE_FORMAT, version: 1, exportedAt: new Date(now).toISOString(), checksum: crc32(json), progress: JSON.parse(json) }, null, 1);
}

const fail = (error) => ({ ok: false, error, progress: null });
const parseProgress = (json) => {
  let raw;
  try { raw = JSON.parse(json); } catch { return fail('That save is not readable.'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('That save is empty.');
  try { return { ok: true, error: null, progress: sanitizeProgress(raw) }; } catch { return fail('That save could not be loaded.'); }
};

// Accepts a code or a file's text. Never throws.
export function importSave(text) {
  try {
    if (typeof text !== 'string') return fail('Nothing to import.');
    const t = text.trim();
    if (!t) return fail('Nothing to import.');
    if (t.length > MAX_IMPORT_BYTES) return fail('That save is too big.');
    if (t.startsWith(`${CODE_PREFIX}.`)) {
      const parts = t.replace(/\s+/g, '').split('.');
      if (parts.length !== 3) return fail('That code is incomplete.');
      let json;
      try { json = fromBase64Url(parts[1]); } catch { return fail('That code is damaged.'); }
      if (crc32(json) !== parts[2].toLowerCase()) return fail('That code is damaged (checksum).');
      return parseProgress(json);
    }
    if (t.startsWith('{')) {
      let file;
      try { file = JSON.parse(t); } catch { return fail('That file is not a save.'); }
      if (!file || file.format !== FILE_FORMAT || typeof file.progress !== 'object' || !file.progress) return fail('That file is not a save.');
      if (!Number.isInteger(file.version) || file.version > 1) return fail('That save is from a newer version.');
      const json = JSON.stringify(file.progress);
      if (typeof file.checksum === 'string' && crc32(json) !== file.checksum) return fail('That file is damaged (checksum).');
      return parseProgress(json);
    }
    return fail('That is not a save code or file.');
  } catch {
    return fail('That save could not be loaded.');
  }
}
