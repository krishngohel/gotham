// Lazy combat animation packs (src/actors/animPacks.js) wired into the shared clip map and the
// reach table: combat2 (hero melee replacements, evades, travel strikes, finishers, the shared
// directional reaction / knockdown / get-up table) at run start, enemies (role clips) the first
// time a role that needs them spawns. Clips merge into the one Map every animator reads, so every
// existing character can play them as soon as they arrive; until then the callers fall back to
// the preloaded clips (clipReady() says which).
//
// Priming (building a clip's mixer action) is spread one actor per frame through primeQueue, so a
// pack landing mid-fight never builds a dozen actions in one frame.
import { loadCombat2Anims, loadEnemyAnims, mergePackClips } from '../actors/animPacks.js';
import { registerClipData } from './clips.js';

const state = { combat2: null, enemies: null };
const loaded = new Set();
const browser = () => typeof window !== 'undefined' && typeof document !== 'undefined' && typeof fetch === 'function';

function addReach(reach, data) {
  if (!reach) return;
  for (const [name, d] of Object.entries(data)) {
    if (reach[name] || d.kind !== 'strike' || !d.reach) continue;
    reach[name] = { contact: d.events?.contact ?? d.contact, limb: d.limb, reach: { ...d.reach }, root: d.root ?? null, fps: d.fps ?? 30, duration: d.duration };
  }
}

const data = { combat2: null, enemies: null };
const reaches = { combat2: new Set(), enemies: new Set() };
function load(name, loader, clips, reach) {
  if (!browser() || !clips) return Promise.resolve(false);
  if (reach) {
    reaches[name].add(reach);
    if (data[name]) addReach(reach, data[name]);
  }
  if (!state[name]) {
    state[name] = loader().then((pack) => {
      registerClipData(pack.data);
      for (const k of pack.clips.keys()) if (!clips.has(k)) loaded.add(k);
      mergePackClips(clips, pack);
      data[name] = pack.data;
      for (const r of reaches[name]) addReach(r, pack.data);
      return true;
    }).catch(() => { state[name] = null; return false; });
  }
  return state[name];
}

export const loadCombatPack = (clips, reach = null) => load('combat2', loadCombat2Anims, clips, reach);
export const loadEnemyPack = (clips, reach = null) => load('enemies', loadEnemyAnims, clips, reach);
// Whether a pack clip has arrived in this clip map (preloaded clips always count).
export const clipReady = (clips, name) => !!clips?.has?.(name);
export const packClipLoaded = (name) => loaded.has(name);

// One actor's clip list per frame: animator.prime(names) for whatever has arrived.
const queue = [];
export function primeLater(animator, names) { if (animator?.prime) queue.push([animator, names]); }
export function primeStep() {
  const job = queue.shift();
  if (!job) return;
  const [animator, names] = job;
  for (const n of names) if (animator.has(n)) animator.prime([n]);
}
