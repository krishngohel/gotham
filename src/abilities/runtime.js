// [onboard] The ability layer at run time: the campaign's state, handed to every player's hero,
// grown by the story, and each new ability taught by a short hands-on beat.
//
//   createAbilities({ events, progress, steps, params, settings, radio, prompts, hud, save,
//                     missionsOf, isNightOne })
//     .state        the live set (src/abilities/abilities.js); every hero's `abilities`
//     .attach(hero) gives a hero the campaign's state (player 0, a co-op partner, any kit)
//     .snapshot() / .apply(snap)  online co-op: the host's gates, replicated to a guest
//     .practised(id)              how many times she has done a taught move since it was granted
//
// Grants arrive on the story's own events, so they work the same for the host, a guest following
// the host's steps, a replay and New Game Plus:
//   'step'             a Night One step begins: its grants (and, silently, every earlier step's:
//                      a jump with ?at= or a guest joining mid-night has them all)
//   'nightStart'       a campaign night's own grants
//   'missionComplete'  grants waiting on that mission
//   'storyReward'      an 'ability:<id>' reward a night emits
// A grant with a `teach` beat (src/abilities/abilityDefs.js) plays its diegetic line over the play,
// shows a NEW chip and its tutorial prompt at the front of the queue, and counts the proof event:
// once is learned (a tick chip), twice and its prompt is taken down. Settings > Accessibility >
// Tutorials 'Skip' keeps every gate but drops the lines and prompts (the chip stays).
import { ABILITIES, abilityById, TRAVERSAL_IDS, LOCK_GROUPS } from './abilityDefs.js';
import { net } from '../net/share.js';
import { createAbilityState, deriveUnlocked, grantsForMission, grantsForNight, grantsForStep, abilityModeFromParams, sanitizeAbilitySave, ABILITY_SAVE_DEFAULT } from './abilities.js';

export function createAbilities({ events, progress, steps = [], params = new URLSearchParams(''), settings = {}, radio = null, prompts = null, hud = null, save = () => {}, missionsOf = null, isNightOne = () => true }) {
  const mode = abilityModeFromParams(params);
  if (!progress.abilities) progress.abilities = sanitizeAbilitySave(ABILITY_SAVE_DEFAULT);
  const saved = progress.abilities;
  const derived = deriveUnlocked(progress, { steps, missionsOf });
  const state = createAbilityState({ mode, unlocked: [...new Set([...derived, ...saved.unlocked])] });
  // ?moves=all (a traversal dev run) also opens the traversal abilities its skill nodes ride on.
  if (params.get('moves') === 'all') state.unlock(TRAVERSAL_IDS);
  const heroes = new Set();
  const tutorials = () => settings.access?.tutorials !== 'skip';
  const counts = new Map(); // id -> times performed since granted this session
  const teaching = new Map(); // proof event -> [ability ids being taught]
  const offs = [];
  const on = (ev, fn) => { const off = events.on(ev, fn); if (typeof off === 'function') offs.push(off); };

  function persist(ids) {
    let dirty = false;
    for (const id of ids) if (!saved.unlocked.includes(id)) { saved.unlocked.push(id); dirty = true; }
    if (dirty) save();
  }
  const taught = new Set();
  function teach(id) {
    if (taught.has(id)) return;
    taught.add(id);
    const def = abilityById(id);
    hud?.chip?.(`ability:${id}`, def.name, 'ability');
    if (!def.teach || state.mode !== 'story') return;
    const { prompt, proof, line } = def.teach;
    if (proof) { const list = teaching.get(proof) ?? []; if (!list.includes(id)) list.push(id); teaching.set(proof, list); ensureProof(proof); }
    if (!tutorials()) return;
    if (line) radio?.say?.([line]);
    if (prompt) prompts?.show?.([prompt], { first: true });
  }
  const proofs = new Set();
  function ensureProof(ev) {
    if (proofs.has(ev)) return;
    proofs.add(ev);
    on(ev, () => {
      for (const id of teaching.get(ev) ?? []) {
        const n = (counts.get(id) ?? 0) + 1;
        counts.set(id, n);
        saved.practised[id] = Math.min(99, (saved.practised[id] ?? 0) + 1);
        const def = abilityById(id);
        if (n === 1) { hud?.chip?.(`learned:${id}`, def.name, 'practised'); events.emit('abilityLearned', { id }); }
        // Done twice: the card has done its job.
        if (n >= 2 && def.teach?.prompt) prompts?.done?.(def.teach.prompt);
      }
    });
  }
  // ids: to grant; teachIds: the subset whose beat plays now (the rest arrive silently).
  // A step's own grants are taught when they arrive, and again on a save resumed at that step if
  // she never practised them (the beat belongs to the step, not to the moment of unlocking).
  function grant(ids, { teachIds = ids, source = null, reteach = false } = {}) {
    const fresh = state.unlock(ids);
    if (fresh.length) persist(fresh);
    for (const id of fresh) events.emit('abilityUnlocked', { id, source });
    for (const id of teachIds) if (fresh.includes(id) || (reteach && state.has(id) && !saved.practised[id])) teach(id);
    return fresh;
  }

  // A step's scripted locks (`locks: ['detective', 'gadgets', 'grapple']`, `lockText`): those
  // abilities go dark while it runs, with a standing note on the HUD; the next step without locks
  // gives them back. Any night, any step type.
  on('step', ({ step } = {}) => {
    const groups = Array.isArray(step?.locks) ? step.locks : [];
    if (groups.length) {
      state.resume();
      state.suspend(groups.flatMap((g) => LOCK_GROUPS[g] ?? [g]), step.lockText ?? null);
      hud?.setLocks?.(step.lockText ?? 'Some of your tools are locked out.');
      events.emit('abilitiesLocked', { ids: state.suspended, step: step.id });
    } else if (state.suspended.length) {
      state.resume();
      hud?.setLocks?.(null);
      events.emit('abilitiesLocked', { ids: [], step: step?.id ?? null });
    }
  });
  on('step', ({ step, index } = {}) => {
    if (!step?.id || !isNightOne()) return;
    const own = grantsForStep(step.id);
    const before = Number.isInteger(index) ? steps.slice(0, index).flatMap((s) => grantsForStep(s.id)) : [];
    grant([...before, ...own], { teachIds: own, source: step.id, reteach: true });
  });
  on('nightStart', ({ night } = {}) => { if (night) grant(grantsForNight(night), { source: night }); });
  on('missionComplete', ({ night, mission, replay } = {}) => { if (night && mission && !replay) grant(grantsForMission(night, mission), { source: `${night}.${mission}` }); });
  on('storyReward', ({ id } = {}) => { if (typeof id === 'string' && id.startsWith('ability:')) grant([id.slice(8)], { source: id }); });

  const api = {
    state,
    get mode() { return state.mode; },
    has: (id) => state.has(id),
    list: () => state.list(),
    attach(hero) { if (hero) { hero.abilities = state; heroes.add(hero); } return hero; },
    detach(hero) { if (hero && hero.abilities === state) delete hero.abilities; heroes.delete(hero); },
    grant,
    snapshot: () => state.snapshot(),
    apply: (snap) => state.apply(snap),
    practised: (id) => counts.get(id) ?? 0,
    // For scripts: the grants in the order they happened this session.
    log: [],
    defs: ABILITIES,
    dispose() { for (const off of offs) off(); offs.length = 0; },
  };
  state.onChange(({ ids }) => { for (const id of ids) api.log.push(id); });
  // Online: a guest plays under the host's gates, never its own save's (src/net/share.js).
  try {
    offs.push(net.registerState('abilities', {
      snapshot: () => state.snapshot(),
      apply: (v) => { state.apply(v); hud?.setLocks?.(state.suspended.length ? (state.suspendReason ?? 'Some of your tools are locked out.') : null); },
    }) ?? (() => {}));
  } catch (e) { console.error(e); }
  return api;
}
