// Adaptive music direction, pure. Decides which cue (theme) should play for the game's state
// and which section of it comes next at each bar line. The engine (music.js) owns time and
// sound; it calls onBar() at every bar boundary of the playing cue and does what it is told.
//
// Contexts: title, explore, stealth, combat, chase, boss, manor, cave, finale, none.
// A cue is a theme id from themes.js ('explore:loop', 'combat', 'boss:riddler', ...).

export const CONTEXTS = ['title', 'explore', 'stealth', 'combat', 'chase', 'boss', 'manor', 'cave', 'finale', 'none'];

// District -> exploration theme. Unknown districts use the core Gotham theme.
export const DISTRICT_THEMES = {
  gcpd: 'explore:gotham', clock: 'explore:gotham', neon: 'explore:mile', docks: 'explore:docks', ace: 'explore:industrial',
  river: 'explore:docks', lowerGotham: 'explore:narrows', loop: 'explore:loop', gothamMile: 'explore:mile',
  robinsonPark: 'explore:park', lakefront: 'explore:park', museumCampus: 'explore:park', amusementMile: 'explore:mile',
  narrows: 'explore:narrows', parkRow: 'explore:narrows', chinatown: 'explore:chinatown', littleOdessa: 'explore:narrows',
  yards: 'explore:industrial', bristol: 'explore:park', arkham: 'explore:narrows',
};

// Villain -> boss theme. Three are written in full (joker, riddler, penguin); the rest are hooks
// that use the generic boss arranger with their own key, tempo and colour (themes.js).
export const VILLAIN_THEMES = {
  joker: 'boss:joker', riddler: 'boss:riddler', penguin: 'boss:penguin', twoFace: 'boss:twoFace',
  scarecrow: 'boss:scarecrow', poisonIvy: 'boss:poisonIvy', mrFreeze: 'boss:mrFreeze', harley: 'boss:harley',
  killerCroc: 'boss:killerCroc', bane: 'boss:bane', madHatter: 'boss:madHatter',
  // [story2] Act IV/V bosses without a theme of their own yet borrow the closest one
  firefly: 'boss:killerCroc', blackMask: 'boss:bane',
};

// Energy of each context: going down in energy plays the old cue's outro first; going up cuts
// in at the next bar (never mid-bar).
const ENERGY = { none: 0, cave: 0, manor: 0, title: 0, finale: 1, explore: 1, stealth: 2, chase: 3, combat: 3, boss: 4 };

export function cueFor({ context = 'explore', district = null, villain = null } = {}) {
  switch (context) {
    case 'explore': return DISTRICT_THEMES[district] ?? 'explore:gotham';
    case 'boss': return VILLAIN_THEMES[villain] ?? 'boss:joker';
    case 'none': return null;
    default: return CONTEXTS.includes(context) ? context : 'explore:gotham';
  }
}
export const contextOf = (cue) => (cue ? cue.split(':')[0] : 'none');

// Bar line at or after `now` for a cue that started at `origin`. Pure helper for the engine.
export function nextBarTime(now, origin, barDur) {
  if (!(barDur > 0)) return now;
  const k = Math.ceil((now - origin) / barDur - 1e-9);
  return origin + Math.max(0, k) * barDur;
}

// Smoothed threat with hysteresis, read once per bar so layers enter on bar lines.
export function layerOn(threat, min, wasOn, band = 0.08) {
  return wasOn ? threat >= min - band : threat >= min + band * 0.25;
}

// theme: { sections: { intro?, A, B?, C?, outro? }, order: ['A', 'B', ...] } with bar counts.
// Returns the sections a cue walks through: intro once, then `order` on repeat.
export function createMusicDirector() {
  let cue = null; // playing cue
  let want = null; // requested cue
  let wantCtx = 'none';
  let theme = null;
  let orderIdx = -1;
  let section = null;
  let sectionBar = 0;
  let outroLeft = 0;
  let threat = 0;

  function sectionLen(name) { return theme?.sections?.[name]?.bars ?? 0; }

  function startCue(next, nextTheme) {
    cue = next;
    theme = nextTheme;
    orderIdx = -1;
    sectionBar = 0;
    section = theme?.sections?.intro ? 'intro' : theme?.order?.[0] ?? null;
    if (section !== 'intro') orderIdx = 0;
    return { action: next ? 'start' : 'stop', cue: next, section, sectionBar: 0 };
  }

  function advance() {
    sectionBar++;
    if (sectionBar < sectionLen(section)) return;
    sectionBar = 0;
    const order = theme?.order ?? [];
    orderIdx = (orderIdx + 1) % Math.max(1, order.length);
    section = order[orderIdx] ?? section;
  }

  return {
    get cue() { return cue; },
    get wanted() { return want; },
    get section() { return section; },
    get sectionBar() { return sectionBar; },
    get threat() { return threat; },
    // context: { context, district, villain, threat }
    request(c = {}) {
      want = cueFor(c);
      wantCtx = c.context ?? 'explore';
      if (Number.isFinite(c.threat)) threat = Math.min(1, Math.max(0, c.threat));
      return want;
    },
    setThreat(x) { threat = Math.min(1, Math.max(0, Number(x) || 0)); },
    // Start the wanted cue right now, skipping any outro (nothing is playing, or a hard reset).
    jump(themes) { return startCue(want, want ? themes[want] ?? null : null); },
    // Called at each bar line of the playing cue (and once with no cue playing). `themes` maps
    // cue ids to theme data. Returns what to do on this bar:
    //   { action: 'continue' | 'outro' | 'start' | 'stop', cue, section, sectionBar }
    onBar(themes) {
      if (want !== cue) {
        const goingDown = (ENERGY[wantCtx] ?? 1) < (ENERGY[contextOf(cue)] ?? 1);
        if (cue && goingDown && theme?.sections?.outro) {
          if (section !== 'outro') { section = 'outro'; sectionBar = 0; outroLeft = sectionLen('outro'); return { action: 'outro', cue, section, sectionBar }; }
          sectionBar++;
          if (sectionBar < outroLeft) return { action: 'outro', cue, section, sectionBar };
        }
        return startCue(want, want ? themes[want] ?? null : null);
      }
      if (!cue) return { action: 'stop', cue: null, section: null, sectionBar: 0 };
      if (section === 'outro') { // asked to leave, then asked back before the outro finished
        section = theme.order[0]; orderIdx = 0; sectionBar = 0;
        return { action: 'continue', cue, section, sectionBar };
      }
      advance();
      return { action: 'continue', cue, section, sectionBar };
    },
  };
}
