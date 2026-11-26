// The Gotham Gazette's front page (a data hook for newsstands, billboards, the radio and loading
// screens): a headline chosen from the city's view of the heroes (reputation) and recent events.
// Pure and unit-tested; original lines in the comic voice.
export const HEADLINES = {
  loved: ['MASKED HERO SAVES THE DAY (AGAIN)', 'CRIME DOWN, SPIRITS UP', 'WHO WAS THAT CAPED FIGURE?', 'GOTHAM SLEEPS A LITTLE EASIER'],
  neutral: ['VIGILANTE: FRIEND OR FOE?', 'CITY COUNCIL SPLIT ON "BAT PROBLEM"', 'RAIN CONTINUES; CITIZENS SHRUG', 'NIGHT SHIFT REPORTS STRANGE SHADOWS'],
  feared: ['MENACE IN A MASK', 'POLICE WARN: STAY OFF THE ROOFTOPS', 'GOONS SPOTTED TREMBLING', 'WHO WATCHES THE BAT?'],
  crime: { robbery: 'ROBBERY FOILED IN {district}', van: 'GETAWAY VAN STOPPED COLD IN {district}', hostage: 'HOSTAGES FREED IN {district}', generic: 'TROUBLE IN {district}, TROUBLE STOPPED' },
  weather: { storm: 'STORM BATTERS GOTHAM', snow: 'FIRST SNOW: CITY SLIDES TO WORK', fog: 'PEA-SOUPER SWALLOWS THE BAY' },
};

// state: { rep 0..100, recent: [{ kind, district, outcome }], weather }; r in [0, 1).
export function pickHeadline({ rep = 50, recent = [], weather = null } = {}, r = 0.5) {
  const last = recent.length ? recent[recent.length - 1] : null;
  if (last && last.outcome === 'stopped' && r < 0.6) {
    const t = HEADLINES.crime[last.kind] ?? HEADLINES.crime.generic;
    return t.replace('{district}', String(last.district ?? 'the city').toUpperCase());
  }
  if (weather && HEADLINES.weather[weather] && r > 0.85) return HEADLINES.weather[weather];
  const pool = rep >= 65 ? HEADLINES.loved : rep <= 35 ? HEADLINES.feared : HEADLINES.neutral;
  return pool[Math.floor(r * pool.length) % pool.length];
}
