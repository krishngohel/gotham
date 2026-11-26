// Bruce Wayne's Standing as the skill tree sees it: the Wayne branch is bought with it, not XP.
// Workstream K owns the double-life meters; it plugs its real numbers in with
// setStandingProvider({ getStanding, spendStanding }). Until then a stub answers: no Standing,
// unless a dev run passes ?standing=N (a session-only budget, never saved).
let provider = null;
let devBudget = 0;

export function setStandingProvider(p) {
  provider = p && typeof p.getStanding === 'function' && typeof p.spendStanding === 'function' ? p : null;
}
export function setDevStanding(n) { devBudget = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }

export function getStanding() {
  if (provider) {
    try { const v = provider.getStanding(); return Number.isFinite(v) && v > 0 ? v : 0; } catch { return 0; }
  }
  return devBudget;
}

// Spends `n` if there is that much; returns whether it was spent.
export function spendStanding(n) {
  if (!(n > 0)) return true;
  if (provider) {
    try { return provider.spendStanding(n) === true; } catch { return false; }
  }
  if (devBudget < n) return false;
  devBudget -= n;
  return true;
}

export const hasStandingProvider = () => !!provider;

// The campaign act (1..5) that gates skill nodes. A story (workstream J) can set progress.act or
// install its own provider; the default reads progress.act, then 5 once the Long Night is done
// (every node opens for the post-game), else 1.
let actProvider = null;
export function setActProvider(fn) { actProvider = typeof fn === 'function' ? fn : null; }
export function actOf(progress) {
  if (actProvider) {
    try { const a = actProvider(progress); if (Number.isInteger(a) && a >= 1) return Math.min(5, a); } catch { /* default below */ }
  }
  const a = progress?.act;
  if (Number.isInteger(a) && a >= 1) return Math.min(5, a);
  if ((progress?.mode?.ngPlus ?? 0) > 0) return 5;
  return progress?.finished === true ? 5 : 1;
}
