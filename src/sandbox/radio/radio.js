// [sandbox] The car radio. In an ordinary car: five original music stations (the game's own
// synthesised themes, picked through the music director: see `musicContext`, read by
// src/game/sound.js) with spoken interludes between songs (DJ chatter, news that reacts to the
// city and the police, the weather, satirical ads) as text with voice blips. In the Batmobile: the
// GCPD scanner (crime alerts and the pursuit chatter come through louder) or Alfred.
//
// Switch with the detective-vision key while driving (it does nothing else in a car); a small
// radial of station names eases in round the readout and fades after 1.6 s (reduced motion: no
// slide). Costs nothing when no one is driving: one branch.
import { STATIONS, CAR_BANDS, OFF, NEWS, WEATHER, ADS, ALFRED } from './stations.js';
import { DISTRICT_LABEL } from '../../world/regions/data.js';

let styled = false;
function ensureStyles() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const st = document.createElement('style');
  // [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
  st.textContent = `
.radio-dial { position: absolute; right: 60px; top: 150px; width: 210px; height: 210px; pointer-events: none; z-index: 3; opacity: 0;
  transform: scale(0.85) rotate(-4deg); transition: opacity 0.26s ease-out, transform 0.26s cubic-bezier(.2,1.4,.4,1); }
.radio-dial.show { opacity: 1; transform: scale(1) rotate(-2deg); }
.radio-dial.calm { transition: opacity 0.2s; transform: none; }
.radio-dial .rd-item { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 2px 7px; white-space: nowrap;
  font: calc(15px * var(--a11y-text, 1))/1.1 'Bangers', cursive; letter-spacing: 1px; color: #0b0b12; background: #efe6cf; border: 2px solid #0b0b12; opacity: 0.72; }
.radio-dial .rd-item.on { background: #f2c14b; opacity: 1; font-size: calc(18px * var(--a11y-text, 1)); box-shadow: 3px 3px 0 #0b0b12; }
.radio-dial .rd-now { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 96px; text-align: center;
  font: calc(13px * var(--a11y-text, 1))/1.15 'Patrick Hand SC', cursive; color: #efe6cf; text-shadow: 1px 1px 0 #0b0b12; }
.hud.split .radio-dial { right: 12px; top: 110px; transform-origin: right top; }
`;
  document.head.appendChild(st);
}

export function createRadio({ events, vehicles, players, hud, world, wanted = () => null, reducedMotion = () => false, save, rng = Math.random, can = () => true }) { // [verify] can('carRadio')
  ensureStyles();
  const list = () => players?.list ?? players ?? [];
  let station = null; // the live station object, or null when nobody drives
  let kind = null; // 'car' | 'batmobile'
  let idx = { car: Math.max(0, STATIONS.findIndex((s) => s.id === save?.station)), batmobile: 0 };
  let talkT = 25, newsN = 0, adN = 0, talkN = 0, dialT = 0;
  let dial = null, dialRoot = null;
  const ctx = { context: 'explore', district: null };
  let musicCtx = null;

  const bandsFor = (k) => (k === 'batmobile' ? [...CAR_BANDS, OFF] : [...STATIONS, OFF]);
  function driver() {
    const d = vehicles?.driver;
    for (const p of list()) if (p.hero === d) return p;
    return null;
  }
  function vehicleKind() {
    const a = vehicles?.active;
    if (!a || !can('carRadio')) return null; // [verify] no radio before the story hands over the car
    if (a === vehicles.batmobile) return 'batmobile';
    if (a.kind === 'car') return 'car';
    return null; // bikes: no radio
  }
  function current() { const b = bandsFor(kind); return b[Math.min(idx[kind], b.length - 1)]; }
  function tune(next) {
    station = next;
    if (kind === 'car' && save) save.station = next.id;
    musicCtx = next.theme ? (ctx.district = next.theme, ctx) : null;
    events?.emit('radioStation', { id: next.id, name: next.name });
    talkT = next.theme ? 8 + rng() * 6 : next.alfred ? 6 : 999;
  }
  function showDial(p) {
    const root = hud?.forPlayer?.(p)?.el ?? hud?.el;
    if (!root) return;
    if (!dial || dialRoot !== root) {
      dial?.remove();
      dial = document.createElement('div');
      dial.className = 'radio-dial';
      root.appendChild(dial);
      dialRoot = root;
    }
    const bands = bandsFor(kind);
    const on = Math.min(idx[kind], bands.length - 1);
    dial.classList.toggle('calm', !!reducedMotion());
    // Names round a circle, the tuned one at the top.
    const R = 78;
    dial.innerHTML = bands.map((b, i) => {
      const a = ((i - on) / bands.length) * Math.PI * 2 - Math.PI / 2;
      return `<div class="rd-item${i === on ? ' on' : ''}" style="left:${(50 + (Math.cos(a) * R) / 2.1).toFixed(1)}%;top:${(50 + (Math.sin(a) * R) / 2.1).toFixed(1)}%">${b.short}</div>`;
    }).join('') + `<div class="rd-now">${bands[on].tag ?? bands[on].name}</div>`;
    void dial.offsetWidth;
    dial.classList.add('show');
    dialT = 1.6;
  }

  // Interludes: DJ chatter, a news bulletin about the city and the police, the weather, an ad.
  function interlude() {
    const s = station;
    if (!s) return;
    if (s.alfred) { say('Alfred', ALFRED[talkN++ % ALFRED.length].replace(/^Alfred: /, ''), 'alfred'); talkT = 50 + rng() * 40; return; }
    if (!s.theme) return;
    const w = wanted();
    const lvl = w?.level ?? 0;
    const roll = talkN++ % 4;
    const p = driver()?.hero?.pos;
    const district = p ? `in ${DISTRICT_LABEL[world?.districtAt?.(p.x, p.z)] ?? 'the city'}` : 'in the city';
    let text;
    if (roll === 1 || lvl >= 2) {
      const pool = lvl >= 5 ? NEWS.manhunt : lvl >= 2 ? NEWS.wanted : w?.state?.menace ? NEWS.menace : NEWS.clear;
      text = `News: ${pool[newsN++ % pool.length]}`;
    } else if (roll === 2) {
      text = `Weather: ${WEATHER[world?.weather?.state] ?? WEATHER.rain}`;
    } else if (roll === 3) {
      text = ADS[adN++ % ADS.length];
    } else {
      text = s.talk[Math.floor(rng() * s.talk.length)];
    }
    const hour = world?.clock?.hour ?? 23;
    const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    text = text.replace('{district}', district).replace('{hour}', `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'a.m.' : 'p.m.'}`).replace('{weather}', world?.weather?.state ?? 'rain');
    say(s.short, text);
    talkT = 55 + rng() * 50;
  }
  function say(name, text, speaker = null) {
    events?.emit('bark', { text, speaker: speaker ?? name, channel: 'radio', radio: true });
  }

  // The scanner: crime alerts are already read out by dispatch; the police band adds nothing but
  // says so in its dial tag. Alfred talks on his own.

  const api = {
    get station() { return station; },
    get musicContext() { return musicCtx; },
    // Whether the detective key belongs to the radio for this player right now.
    ownsKey(p) { return !!kind && p?.hero === vehicles?.driver; },
    next(p = driver()) {
      if (!kind) return null;
      const bands = bandsFor(kind);
      idx[kind] = (Math.min(idx[kind], bands.length - 1) + 1) % bands.length;
      tune(current());
      if (p) showDial(p);
      return station;
    },
    tuneTo(id) {
      if (!kind) return null;
      const i = bandsFor(kind).findIndex((b) => b.id === id);
      if (i < 0) return null;
      idx[kind] = i;
      tune(current());
      return station;
    },
    update(dt) {
      const k = vehicleKind();
      if (k !== kind) {
        kind = k;
        if (!k) { station = null; musicCtx = null; }
        else tune(current());
      }
      if (!kind) { if (dialT > 0) { dialT = 0; dial?.classList.remove('show'); } return; }
      const p = driver();
      if (p?.local !== false && p?.input?.pressed?.('detective')) api.next(p);
      if (dialT > 0) { dialT -= dt; if (dialT <= 0) dial?.classList.remove('show'); }
      talkT -= dt;
      if (talkT <= 0) interlude();
    },
    dispose() { dial?.remove(); },
  };
  return api;
}
