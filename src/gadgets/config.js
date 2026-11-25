// [prog] Run-wide wiring the wave 3 gadgets read, set once by game.js (every player's gadget system
// shares it, so the co-op partner's system needs no extra deps):
//   getSettings()     the live settings (accessibility: settings.access.qteAssist for the hack)
//   getVehicles()     street cars the tracker dart can tag: objects with .group.position
//   uiRoot            where the hack minigame's DOM goes (default document.body)
// Everything is optional: a handler without it falls back (no settings: assist 'off'; no cars).
export const gadgetConfig = { getSettings: () => null, getVehicles: () => null, uiRoot: null };

export function configureGadgets(o = {}) {
  Object.assign(gadgetConfig, o);
  return gadgetConfig;
}
