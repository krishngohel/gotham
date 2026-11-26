// [net2] The world's clock and weather online (docs/design/environment.md): one number and a seed.
//   host:  every second, and at once on a skip / set / pin change: 'ev' env { v: clock.value,
//          h: the shown hour, p: pinned, seed, ws: the weather in force, at: host time }; every
//          lightning strike as 'ev' strike { d: distance, b: bearing } (strike times depend on
//          frame timing, so they are sent, not recomputed)
//   guest: its clock adopts the host's value (and shows the host's pinned hour under a 'net' pin),
//          its weather is reseeded to the host's seed and pinned to the host's state; its own
//          lightning is off (weather.remoteStrikes) and the host's strikes play here.
// The El, the bascule bridges and the traffic lights run on state.t (D2's 'clock' event).
export function createWorldHost({ world, rep, now = () => performance.now() }) {
  const clock = world?.clock, weather = world?.weather;
  let t = 0, last = '';
  const offs = [];
  const send = (force = false) => {
    if (!clock || !weather) return;
    const d = { v: +clock.value.toFixed(5), h: +clock.hour.toFixed(4), p: !!clock.pinned, seed: weather.seed >>> 0, ws: String(weather.state), at: now() };
    const key = `${d.p ? d.h.toFixed(2) : ''}|${d.seed}|${d.ws}|${d.p}`;
    if (!force && key === last && t > 0) return;
    last = key;
    rep.event({ t: 'ev', name: 'env', data: d });
  };
  if (clock?.on) offs.push(clock.on((kind) => { if (kind === 'skip' || kind === 'set') send(true); }));
  if (weather?.on) offs.push(weather.on((s) => { if (s?.kind === 'lightning' && !s.remote) rep.event({ t: 'ev', name: 'strike', data: { d: +s.distance.toFixed(1), b: +(s.bearing ?? 0).toFixed(3) } }); }));
  return {
    frame(real) {
      t -= real;
      if (t <= 0) { t = 1; send(true); return; }
      send(false); // a pin or weather change between beats goes at once
    },
    welcome() { if (!clock || !weather) return null; return { v: clock.value, h: clock.hour, p: !!clock.pinned, seed: weather.seed >>> 0, ws: String(weather.state), at: now() }; },
    dispose() { for (const o of offs.splice(0)) o?.(); },
  };
}

export function createWorldGuest({ world, hostNow }) {
  const clock = world?.clock, weather = world?.weather;
  if (weather) weather.remoteStrikes = true;
  let first = true, pinShown = null, wsShown = null;
  return {
    apply(d) {
      if (!clock || !weather || !d || !Number.isFinite(d.v)) return;
      // The hour the host shows: its pinned hour (a story beat, a Bruce scene) under our 'net' pin.
      const pinKey = d.p ? d.h.toFixed(3) : null;
      if (pinKey !== pinShown || (d.p && clock.pinId !== 'net') || (!d.p && clock.pinned)) {
        clock.unpin();
        if (d.p) clock.pin(d.h, { id: 'net' });
        pinShown = pinKey;
      }
      // The running clock: the host's value, aged by the trip (an hour of game time per real
      // minutes; a fraction of a second is nothing, so no dead reckoning beyond the clock's own).
      if (Math.abs(clock.value - d.v) > 0.01) clock.sync(d.v, { force: true });
      if (Number.isInteger(d.seed) && (weather.seed >>> 0) !== d.seed) weather.reseed(d.seed, d.ws);
      if (typeof d.ws === 'string' && (d.ws !== wsShown || weather.state !== d.ws)) {
        weather.unpin();
        weather.pin(d.ws, { id: 'net', snap: first });
        wsShown = d.ws;
      }
      first = false;
      void hostNow;
    },
    strike(d) { if (d && Number.isFinite(d.d)) weather?.remoteStrike?.({ distance: d.d, bearing: d.b }); },
    dispose() { if (weather) { weather.remoteStrikes = false; weather.unpin('net'); } clock?.unpin('net'); },
  };
}
