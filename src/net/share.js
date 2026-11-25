// The generic online seams for game content ([net2], wave 3). Tiny and dependency-free (it ships in
// the main bundle like mode.js): content modules register here at load time and never import
// anything from src/net/game/**. While a session runs, src/net/game/netGame.js wires the registry
// to the wire; in single-player and split screen every call below is a cheap no-op or runs the
// handler locally, so content behaves exactly as it does today.
//
//   net.shareEvent(name, validator?)          host -> guest: every `events.emit(name, data)` on the
//                                             host is re-emitted on the guest's own event bus as
//                                             `{ ...data, remote: true }` (player -> that player on
//                                             the guest, enemies by id -> the guest's puppet,
//                                             vectors -> plain {x,y,z}). validator(data) runs on the
//                                             guest before re-emitting; false drops it.
//   net.registerClaim(name, hostHandler, validator?)
//                                             guest -> host: `net.claim(name, data)` on the guest
//                                             sends a request; the host runs
//                                             hostHandler(data, { player }) (player = the guest's
//                                             player record on the host) after validator(data).
//   net.claim(name, data, player?)            the call content makes from input code. Returns true
//                                             when it went to the host as a guest claim (do NOT act
//                                             locally); false offline / on the host (act locally,
//                                             exactly as before; on the host the registered handler
//                                             is NOT called for you: the content's own code runs).
//   net.registerState(key, { snapshot, apply, hz = 4 })
//                                             a small host state blob (<= 4 KiB JSON): the host
//                                             calls snapshot() hz times a second and sends it when
//                                             it changed (and in every welcome); the guest calls
//                                             apply(value). Use it for HUD state a guest must show
//                                             (a crime's timer, a challenge's score).
//                                             Expected blobs (connect at integration):
//                                               'abilities'  the story's ability gates (moves,
//                                               traversal, gadgets unlocked by the story; branch
//                                               ln2/onboard): register
//                                               net.registerState('abilities', { snapshot:
//                                               () => abilities.snapshot(), apply: (v) =>
//                                               abilities.apply(v) }) so a guest plays under the
//                                               host's gates, never its own save's.
//   net.role / net.isGuest() / net.isHost() / net.online()
//   net.hostOnly(hud, text?)                  a guest-side "host only for now" hint helper
//
// Docs and the message catalogue: docs/design/online-coop.md "Content seams".
import { netMode } from './mode.js';

const events = new Map();
const claims = new Map();
const states = new Map();
const listeners = new Set();
let wire = null; // { claim(name, data) } while a guest session runs
const changed = () => { for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } };

export const net = {
  shareEvent(name, validator = null) {
    if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,31}$/.test(name)) throw new Error(`net.shareEvent: bad name ${name}`);
    events.set(name, typeof validator === 'function' ? validator : null);
    changed();
    return () => { events.delete(name); changed(); };
  },
  registerClaim(name, hostHandler, validator = null) {
    if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,31}$/.test(name)) throw new Error(`net.registerClaim: bad name ${name}`);
    if (typeof hostHandler !== 'function') throw new Error('net.registerClaim: handler');
    claims.set(name, { handler: hostHandler, validator: typeof validator === 'function' ? validator : null });
    return () => claims.delete(name);
  },
  registerState(key, { snapshot, apply, hz = 4 } = {}) {
    if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,31}$/.test(key)) throw new Error(`net.registerState: bad key ${key}`);
    if (typeof snapshot !== 'function' || typeof apply !== 'function') throw new Error('net.registerState: snapshot and apply');
    states.set(key, { snapshot, apply, hz: Math.max(0.5, Math.min(20, hz)) });
    changed();
    return () => { states.delete(key); changed(); };
  },
  claim(name, data = {}) {
    if (netMode.role !== 'guest' || !wire) return false;
    wire.claim(name, data);
    return true;
  },
  get role() { return netMode.role; },
  isGuest: () => netMode.role === 'guest',
  isHost: () => netMode.role === 'host',
  online: () => netMode.role !== 'off',
  hostOnly(hud, text = 'Host only for now: your partner runs this one.') { if (netMode.role === 'guest') { hud?.hint?.(text, 3000); return true; } return false; },
  // ---- read by src/net/game/** (not for content) ----
  _events: events, _claims: claims, _states: states,
  _onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  _bind(w) { wire = w; },
};
