// [perf3] Runtime switches for the round-2 optimisations, so each one can be measured on and off
// in the SAME page, alternating every half second (scripts/perf-toggle.mjs). On this laptop two
// page loads minutes apart differ by 30 % or more on their own; a switch flipped inside one page
// sees the same machine state on both sides. Every optimisation registers here with a setter; all
// are on unless a test flips them (window.__perfToggles, dev only). Never a player setting.
const registry = new Map();

// name: short id; apply(on): makes the optimisation take effect (true) or restores the old path.
export function registerToggle(name, apply) {
  registry.set(name, { on: true, apply });
}
export function setToggle(name, on) {
  const t = registry.get(name);
  if (!t || t.on === on) return !!t;
  t.on = on;
  t.apply(on);
  return true;
}
export function toggleNames() { return [...registry.keys()]; }
if (typeof window !== 'undefined') window.__perfToggles = { set: setToggle, names: toggleNames };
