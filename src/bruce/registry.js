// Hooks other workstreams fill (workstream K owns the stations; the systems behind them are theirs).
//
//   registerBruceUI(id, open)          open(ctx) shows that system's own screen. Ids the cave uses:
//                                      'skillTree' (the upgrade bench), 'gadgets' (the workbench).
//                                      ctx = { game, life, close() }. Unregistered: a placeholder
//                                      panel says what the station will do and shows the numbers
//                                      the Wayne side already provides (Wayne credit, R&D budget).
//   registerBatcomputerTab(id, { label, render(ctx) -> html, buttons?(ctx) -> [{ label, onClick }] })
//                                      extra Batcomputer tabs (the campaign's 'missions', the case
//                                      board's 'cases', the villain files' 'villains'). A registered
//                                      tab replaces the built-in placeholder of the same id.
//   registerMissionProvider(fn)        fn(ctx) -> [{ id, title, blurb, start() }]: the campaign's
//                                      mission select on the Batcomputer.
const ui = new Map();
const tabs = new Map();
let missions = null;

export function registerBruceUI(id, open) { ui.set(id, open); return () => ui.delete(id); }
export const bruceUI = (id) => ui.get(id) ?? null;
export function registerBatcomputerTab(id, tab) { tabs.set(id, tab); return () => tabs.delete(id); }
export const batcomputerTabs = () => [...tabs.entries()];
export function registerMissionProvider(fn) { missions = fn; return () => { if (missions === fn) missions = null; }; }
export const missionList = (ctx) => { try { return missions ? missions(ctx) ?? [] : null; } catch { return []; } };
