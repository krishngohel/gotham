// The open world's runtime context (`ow`): one object every open-world subsystem (crimes, the
// director, stealth encounters, cases, side chains, collectibles) is created with, so none of them
// reaches into game.js. Built once by createOpenWorld (src/openworld/index.js) from side content's
// deps. Host-only online: the whole open world runs where side content runs (game.js gates
// side.update with !isReplica()); a guest draws from the events listed in docs/design/openworld.md.
//
//   ow = {
//     events, rng, progress, store (= progress.openworld), save(),
//     players()            every player (local and remote); p.hero, p.slot, p.id
//     heroes()             standing heroes (not dead)
//     detective(player)    that player's detective vision is on
//     pressed(player, a)   input action pressed this frame ('punch', 'jump', 'grapple', ...)
//     site(id)             { x, y, z } from SITES / REGION_SITES / a literal, or null
//     districtAt(x, z)     district id
//     hour()               world clock hour 0..24;  weather() -> 'clear'|'rain'|'storm'|'snow'|'fog'|...
//     ui                   { radio(title, text, ms), toast(title, text, ms), hint(text, ms), hintFor(player, text, ms) }
//     say(lines)           radio lines [{ speaker, text }] through the story's radio (subtitles apply)
//     bark(text, pos, speaker)   a positional world bark (audio.bark through the 'bark' event)
//     dispatch(text, district)   a police-radio line (the 'dispatch' event: audio + subtitle)
//     markers              story markers (place(kind, {x,y,z}) / color / flash / release)
//     scene, assets, collision, world, encounters, combat, stealth, bosses, flow, hud
//     comic(pages)         plays comic pages full screen (HUD hidden) -> Promise
//     reward(ids, meta)    emits 'storyReward' for each 'kind:name' id once per save (L1 grants)
//     xp(amount, source)   XP through the reward path ('xp:N'), repeatable
//     busy()               true while the story or a side mission owns the moment
//     teleport(p)          places player 0 (and brings a partner) at { x, y, z }
//     quality              the quality object (caps read quality.name)
//   }
export const OW_CONTEXT_FIELDS = ['events', 'rng', 'progress', 'store', 'save', 'players', 'heroes', 'detective', 'pressed', 'site', 'districtAt', 'hour', 'weather', 'ui', 'say', 'bark', 'dispatch', 'markers', 'reward', 'xp', 'busy', 'teleport'];

// A context for unit tests: no world, scripted heroes, captured events.
export function testContext({ heroes = [{ x: 0, y: 0, z: 0 }], store = null, hour = 23, weather = 'clear' } = {}) {
  const emitted = [];
  const handlers = new Map();
  const events = {
    emit(type, data) { emitted.push({ type, data }); for (const fn of handlers.get(type) ?? []) fn(data); },
    on(type, fn) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); return () => handlers.set(type, handlers.get(type).filter((f) => f !== fn)); },
  };
  const players = heroes.map((h, slot) => ({ id: slot, slot, hero: { pos: { x: h.x, y: h.y ?? 0, z: h.z }, dead: false, crouched: false }, det: false, press: {} }));
  let seed = 7;
  const rng = { next: () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; } };
  const said = [];
  const ow = {
    events, emitted, rng, said,
    progress: { openworld: store ?? {}, campaign: { nightsDone: [] } },
    get store() { return ow.progress.openworld; },
    save() {},
    players: () => players,
    heroes: () => players.filter((p) => !p.hero.dead).map((p) => p.hero),
    detective: (p) => !!p.det,
    pressed: (p, a) => !!p.press[a],
    site: (id) => (typeof id === 'object' ? id : null),
    districtAt: () => 'loop',
    hour: () => hour, weather: () => weather,
    ui: { radio: (t, x) => said.push(['radio', t, x]), toast: (t, x) => said.push(['toast', t, x]), hint: (x) => said.push(['hint', x]), hintFor: (p, x) => said.push(['hint', x]) },
    say: (lines) => { said.push(['say', lines]); return Promise.resolve(); },
    bark: (text) => said.push(['bark', text]),
    dispatch: (text) => said.push(['dispatch', text]),
    markers: { place: (kind, p) => ({ kind, p, mesh: { visible: true } }), color() {}, flash() {}, release() {} },
    reward: (ids) => { for (const id of ids) emitted.push({ type: 'storyReward', data: { id } }); },
    xp: (n) => emitted.push({ type: 'storyReward', data: { id: `xp:${n}` } }),
    busy: () => false,
    teleport: (p) => { players[0].hero.pos.x = p.x; players[0].hero.pos.y = p.y ?? 0; players[0].hero.pos.z = p.z; },
    quality: { name: 'high' },
  };
  return ow;
}
