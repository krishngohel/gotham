// A thin adapter between vehicle-chase crimes and whatever runs vehicle chases. Today that is the
// old free-roam van chase in src/vehicles/vehicles.js (trySpawnSideChase / cancelSideChase and
// the sideChaseDone event: ram the van three times). Workstream L3 is building a new chase API
// (docs/design/vehicles.md); at integration only this file changes. When no chase can start (the
// hero isn't near a drivable street, another chase is running), start() returns null and the
// crime's getaway leaf falls back to its own kinematic car (stand alongside it to stop it).
//
//   const chase = createChaseAdapter({ vehicles, events })
//   chase.start(crime) -> handle { state: 'run'|'won'|'lost' } | null
//   chase.cancel(handle)
export function createChaseAdapter({ vehicles, events }) {
  let current = null;
  events.on('sideChaseDone', ({ ok }) => {
    if (!current) return;
    current.state = ok ? 'won' : 'lost';
    current = null;
  });
  return {
    get current() { return current; },
    start(crime) {
      if (current || !vehicles?.trySpawnSideChase) return null;
      if (vehicles.chase?.active || vehicles.battle?.active || vehicles.sideChase?.active) return null;
      const ok = vehicles.trySpawnSideChase(crime.pos);
      if (!ok) return null;
      current = { state: 'run', crime: crime.id };
      return current;
    },
    cancel(h) {
      if (!h || h !== current) return;
      vehicles.cancelSideChase?.();
      current = null;
    },
  };
}
