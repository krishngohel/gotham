// The calendar clock (workstream K): a thin adapter over the world clock (workstream M,
// src/env/clock.js; docs/design/environment.md). When `world.clock` exists every call goes straight
// to it; on a build without it, a small clock of the same shape stands in, so nothing else changes.
//
//   clock.hour (0..24)  clock.day  clock.value (game hours since day 0)
//   clock.pin(hour, { id }) / unpin(id)   pins stack, newest wins (scenes pin their hour)
//   clock.pause() / resume()              clock.skipTo(hour) (rest: forward to the next `hour`)
//   clock.set(hour, day?)                 clock.advance(realSeconds) (the stand-in only)
//   clock.shared                          true while the world clock is the one in use
// The stand-in runs a day in 48 real minutes, like the world clock's default.
export const DAY_RATE = 24 / (48 * 60); // game hours per real second

const hasShape = (c) => !!c && typeof c === 'object' && typeof c.hour === 'number' && typeof c.pause === 'function';

function standIn(hour, day, rate) {
  const c = {
    value: day * 24 + hour, paused: false, pins: [], rate,
    get hour() { return this.pins.length ? this.pins[this.pins.length - 1].hour : ((this.value % 24) + 24) % 24; },
    get day() { return Math.floor(this.value / 24); },
    get pinned() { return this.pins.length ? this.pins[this.pins.length - 1].hour : null; },
    advance(s) { if (this.paused || this.pins.length) return 0; const h = s * this.rate; this.value += h; return h; },
    set(h, d = null) { const dd = d ?? (h < this.hour ? this.day + 1 : this.day); this.value = dd * 24 + (((h % 24) + 24) % 24); },
    skipTo(h) { const now = ((this.value % 24) + 24) % 24; let dh = h - now; if (dh <= 0) dh += 24; this.value += dh; },
    pause() { this.paused = true; },
    resume() { this.paused = false; },
    pin(h, { id = 'pin' } = {}) { this.pins = this.pins.filter((p) => p.id !== id); this.pins.push({ id, hour: h }); },
    unpin(id) { this.pins = id === undefined ? [] : this.pins.filter((p) => p.id !== id); },
  };
  return c;
}

export function createDayClock({ world = null, hour = 21, day = 0, rate = DAY_RATE } = {}) {
  const own = standIn(hour, day, rate);
  const live = () => (hasShape(world?.clock) ? world.clock : own);
  return {
    get hour() { return live().hour; },
    get day() { return live().day ?? own.day; },
    get value() { return live().value ?? own.value; },
    get paused() { return !!live().paused; },
    get pinned() { const c = live(); return c === own ? own.pinned : (c.pinned ?? null); },
    // [fix1] Ids of the pins holding the hour, minus `except` (the world clock's heldBy).
    heldBy(except = []) { const c = live(); return c.heldBy ? c.heldBy(except) : (c.pins ?? []).map((p) => p.id).filter((id) => !except.includes(id)); },
    get shared() { return live() !== own; },
    // Only the stand-in needs ticking; the world clock runs itself.
    advance(s) { return live() === own ? own.advance(s) : 0; },
    set(h, d = null) { const c = live(); if (c.set) c.set(h, d); else { c.hour = h; if (d !== null) c.day = d; } },
    skipTo(h) { const c = live(); if (c.skipTo) c.skipTo(h); else c.set?.(h); },
    pause() { live().pause(); },
    resume() { live().resume?.(); },
    pin(h, o = {}) { live().pin?.(h, o); },
    unpin(id) { live().unpin?.(id); },
    // Hours from now until `h` (wrapping past midnight).
    until(h) { const now = this.hour; return h >= now ? h - now : h + 24 - now; },
  };
}
