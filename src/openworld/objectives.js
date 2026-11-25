// Crime objectives as small reusable state machines (crime system v2). Pure: no three.js, no DOM,
// no allocation per update. A crime is a tree of these (seq / all / any of leaves); the runtime
// (crimeRuntime.js) builds a `facts` snapshot each frame (reused object), calls step() and draws
// whatever the leaves simulate (runners, getaway cars, bombs, civilians' panic).
//
//   const o = createObjective(spec, rng)   spec = { kind, ...params } (leaf) or { kind: 'seq'|'all'|'any', parts: [spec] }
//   o.step(dt, facts) -> 'run' | 'won' | 'lost' | 'escalate'
//   o.leaves                                  every leaf (the runtime draws them; HUD reads hud())
//   leaf.hud() -> { text, meter (0..1 | null), tone: 'ok'|'warn'|'bad' }
//   leaf.outcome  { saved, hurt, caught, escaped, silent, collateral, sided }  (counters the rewards read)
//
// facts = {
//   heroes: [{ x, y, z, slot, detective, crouched, dead }], nHeroes,
//   materialized, engaged,                          the squad exists / a hero has started the fight
//   squad: { alive, total, aware, alarm },          this crime's goons (alarm: a predator alarm)
//   gangAlive: { [gang]: n },                       for gang wars (two gangs in one squad)
//   press: [bool, bool],                            per slot: the interact press this frame
//   hit: Uint8Array(8)                              runner/carrier index struck this frame (1)
//   train: { x, y, z, stopped } | null,             the El train this crime rides (El events)
//   chase: 'run'|'won'|'lost'|null                  a vehicle chase adapter's state
// }
//
// Co-op: every leaf counts any standing hero; leaves that split (two bombs, two runners, two
// collectors) are the design's way to give each player a job (research 5.2's rule: split the
// objective, don't inflate health).

const d2 = (a, x, z) => Math.hypot(a.x - x, a.z - z);
function nearestHero(f, x, y, z, yTol = 4) {
  let best = Infinity;
  for (let i = 0; i < f.nHeroes; i++) {
    const h = f.heroes[i];
    if (h.dead) continue;
    if (Math.abs(h.y - y) > yTol) continue;
    const d = d2(h, x, z);
    if (d < best) best = d;
  }
  return best;
}
function heroWithin(f, x, y, z, r, yTol = 4, need = null) {
  for (let i = 0; i < f.nHeroes; i++) {
    const h = f.heroes[i];
    if (h.dead || Math.abs(h.y - y) > yTol || d2(h, x, z) > r) continue;
    if (need === 'detective' && !h.detective) continue;
    return h;
  }
  return null;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fmt = (s) => `${Math.max(0, Math.ceil(s))}s`;

// A point moving along a polyline of { x, y, z, hop? } at `speed` m/s; a point flagged `hop`
// arcs (rooftop gaps). Writes into `out`. Pure helper shared by runners, cars and trains.
export function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return L;
}
export function pointAt(pts, s, out) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (s <= acc + L || i === pts.length - 1) {
      const k = L > 0 ? clamp01((s - acc) / L) : 1;
      out.x = a.x + (b.x - a.x) * k;
      out.z = a.z + (b.z - a.z) * k;
      const ay = a.y ?? 0, by = b.y ?? 0;
      out.y = ay + (by - ay) * k + (b.hop ? Math.sin(k * Math.PI) * Math.min(4, L * 0.25) : 0);
      out.yaw = Math.atan2(b.x - a.x, b.z - a.z);
      out.air = !!b.hop && k > 0.05 && k < 0.95;
      return out;
    }
    acc += L;
  }
  const p = pts[pts.length - 1] ?? { x: 0, y: 0, z: 0 };
  out.x = p.x; out.y = p.y ?? 0; out.z = p.z; out.air = false;
  return out;
}

// ---------------------------------------------------------------- leaves

const LEAVES = {
  // Beat (or zip-tie) the squad. `timer`: optional, the crew finishes the job and leaves.
  defeat: (p) => {
    let t = 0;
    const L = {
      outcome: {},
      step(dt, f) {
        if (!f.materialized) return 'run';
        if (f.engaged) t += dt;
        if (f.squad.total > 0 && f.squad.alive === 0) return 'won';
        if (p.timer && t > p.timer) return 'lost';
        return 'run';
      },
      hud: () => ({ text: p.text ?? 'Take down the crew', meter: null, tone: 'ok', count: null }),
    };
    return L;
  },

  // Keep civilians safe: each has a panic meter that climbs while the crew is near and no hero
  // is, and falls when a hero stands by them. Full panic: that civilian is hurt. Won when the
  // threat is gone with at least one civilian safe; lost when everyone is hurt.
  protect: (p) => {
    const civs = (p.civilians ?? [{ dx: 0, dz: 0 }]).map((c) => ({ x: (p.at?.x ?? 0) + (c.dx ?? 0), y: p.at?.y ?? 0, z: (p.at?.z ?? 0) + (c.dz ?? 0), panic: c.panic ?? 0.15, hurt: false, safe: false }));
    const rise = p.rise ?? 0.045, calm = p.calm ?? 0.25;
    const L = {
      civilians: civs, outcome: { saved: 0, hurt: 0 }, worst: 0,
      step(dt, f) {
        const threat = !f.materialized || f.squad.alive > 0;
        let worst = 0, standing = 0;
        for (const c of civs) {
          if (c.hurt || c.safe) continue;
          const near = nearestHero(f, c.x, c.y, c.z) < (p.guard ?? 5);
          // An alarm (a hostage-taker hears the hero) is a spike; a stealthy approach is not.
          const spike = f.squad.alarm && p.deadMan ? 0.6 * dt * 4 : 0;
          if (threat) c.panic = clamp01(c.panic + (near ? -calm * 0.4 : rise * (f.engaged ? 1.6 : 1)) * dt + spike);
          else c.panic = clamp01(c.panic - calm * dt);
          if (c.panic >= 1) { c.hurt = true; L.outcome.hurt += 1; continue; }
          if (!threat) { c.safe = true; L.outcome.saved += 1; continue; }
          standing += 1;
          if (c.panic > worst) worst = c.panic;
        }
        L.worst = worst;
        if (civs.every((c) => c.hurt)) return 'lost';
        if (!threat && civs.every((c) => c.hurt || c.safe)) return 'won';
        return standing || threat ? 'run' : 'won';
      },
      hud: () => ({ text: p.text ?? (civs.length > 1 ? `Protect the hostages (${civs.filter((c) => !c.hurt).length}/${civs.length})` : 'Protect the civilian'), meter: L.worst, tone: L.worst > 0.7 ? 'bad' : L.worst > 0.4 ? 'warn' : 'ok', label: 'PANIC' }),
    };
    return L;
  },

  // Bombs on a clock. Find each (detective vision shows which are real: `decoys` are flagged
  // `decoy` and only fool the eye), then the skill interaction: a cursor sweeps a dial and the
  // interact press must land inside the window `need` times; a miss costs `miss` seconds.
  defuse: (p, rng) => {
    const bombs = (p.bombs ?? [{ dx: 0, dz: 0 }]).map((b, i) => ({ i, x: (p.at?.x ?? 0) + (b.dx ?? 0), y: (p.at?.y ?? 0) + (b.dy ?? 0), z: (p.at?.z ?? 0) + (b.dz ?? 0), decoy: !!b.decoy, done: false, hits: 0, phase: rng ? rng.next() : 0.3, scanned: false, window: p.window ?? 0.22 }));
    let clock = p.timer ?? 60;
    const need = p.need ?? 3, speed = p.speed ?? 0.7, miss = p.miss ?? 6;
    const L = {
      bombs, outcome: { defused: 0 }, active: null,
      get clock() { return clock; },
      // The dial for a bomb: 0..1 cursor, the window centred on 0.5.
      inWindow(b) { return Math.abs(b.phase - 0.5) <= b.window / 2; },
      press(b) {
        if (!b || b.done) return false;
        if (L.inWindow(b)) { b.hits += 1; b.window = Math.max(0.12, b.window - 0.03); if (b.hits >= need) { b.done = true; L.outcome.defused += 1; } return true; }
        clock -= miss;
        return false;
      },
      step(dt, f) {
        clock -= dt;
        L.active = null;
        for (const b of bombs) {
          if (b.done) continue;
          b.phase = (b.phase + dt * speed) % 1;
          const h = heroWithin(f, b.x, b.y, b.z, p.reach ?? 2.2, 3);
          if (h && h.detective) b.scanned = true;
          if (!h) continue;
          L.active = b;
          // A decoy found by scanning is simply disarmed; by hand it costs time.
          if (b.decoy && b.scanned) { b.done = true; continue; }
          if (f.press[h.slot]) L.press(b);
        }
        if (bombs.every((b) => b.done || b.decoy)) { for (const b of bombs) b.done = true; return 'won'; }
        return clock <= 0 ? 'lost' : 'run';
      },
      hud: () => ({ text: L.active ? `Defuse: strike in the window (${L.active.hits}/${need})` : `Find and defuse ${bombs.filter((b) => !b.done && !(b.decoy && b.scanned)).length > 1 ? 'the bombs' : 'the bomb'}`, meter: L.active ? L.active.phase : clamp01(clock / (p.timer ?? 60)), tone: clock < 15 ? 'bad' : 'warn', timer: fmt(clock), dial: L.active ? { phase: L.active.phase, window: L.active.window } : null }),
    };
    return L;
  },

  // Runners along paths (on foot, over the rooftops, or carriers of stolen goods). Caught when a
  // hero gets within reach or strikes them (facts.hit); lost when `escape` of them reach the end.
  // `need`: how many must be caught (recover: 2 of 3 bags). A runner starts when a hero is within
  // `wake` metres (or at once when `wake` is 0).
  chase: (p) => {
    const runners = (p.runners ?? [{ path: p.path, speed: p.speed }]).map((r, i) => {
      const path = r.path ?? p.path;
      return { i, path, len: pathLength(path), s: 0, speed: r.speed ?? p.speed ?? 6.2, caught: false, escaped: false, started: !p.wake, x: path[0].x, y: path[0].y ?? 0, z: path[0].z, yaw: 0, air: false, carrying: !!p.goods, burst: 0 };
    });
    const need = p.need ?? runners.length;
    const reach = p.reach ?? 2.4;
    const L = {
      runners, outcome: { caught: 0, escaped: 0 },
      step(dt, f) {
        for (const r of runners) {
          if (r.caught || r.escaped) continue;
          if (!r.started) {
            if (nearestHero(f, r.x, r.y, r.z, 30) < p.wake) r.started = true;
            else continue;
          }
          // Rubber band: a runner who's been left far behind slows down so the chase stays a chase,
          // one with a hero on his heels gets a burst (never faster than a gliding hero).
          const gap = nearestHero(f, r.x, r.y, r.z, 40);
          const k = gap > 45 ? 0.55 : gap < 6 ? 1.15 : 1;
          r.s += r.speed * k * dt;
          pointAt(r.path, r.s, r);
          if (f.hit[r.i] || (!r.air && heroWithin(f, r.x, r.y, r.z, reach, 2.6))) { r.caught = true; L.outcome.caught += 1; continue; }
          if (r.s >= r.len) { r.escaped = true; L.outcome.escaped += 1; }
        }
        if (L.outcome.caught >= need) return 'won';
        if (runners.length - L.outcome.escaped < need) return 'lost';
        return 'run';
      },
      hud: () => {
        const left = runners.filter((r) => !r.caught && !r.escaped);
        const lead = left[0];
        const frac = lead ? lead.s / lead.len : 1;
        return { text: p.text ?? (runners.length > 1 ? `Catch them (${L.outcome.caught}/${need})` : 'Catch the runner'), meter: frac, tone: frac > 0.7 ? 'bad' : 'warn', label: 'ESCAPE' };
      },
    };
    return L;
  },

  // A getaway car on a route to the district's edge, leaving `delay` s after the crew is alerted
  // (or at once). Stopped by a hero alongside it for `hold` s (the driver is pulled out) or a
  // strike on it (facts.hit[0]); lost when it reaches the exit. With `vehicle: true` the runtime
  // hands it to the vehicle-chase adapter instead and this leaf only mirrors facts.chase.
  getaway: (p) => {
    const car = { path: p.path, len: pathLength(p.path), s: 0, x: p.path[0].x, y: p.path[0].y ?? 0, z: p.path[0].z, yaw: 0, moving: false, stopped: false, hold: 0, wait: p.delay ?? 20 };
    const L = {
      car, outcome: { getaway: 0 },
      step(dt, f) {
        if (p.vehicle && f.chase) return f.chase === 'won' ? 'won' : f.chase === 'lost' ? (L.outcome.getaway = 1, 'lost') : 'run';
        if (car.stopped) return 'won';
        // The crew down before the car pulls away: the driver gives up (or bolts on foot).
        if (!car.moving && !p.vehicle && f.materialized && f.squad.total > 0 && f.squad.alive === 0) { car.stopped = true; L.outcome.driverQuit = 1; return 'won'; }
        const near = heroWithin(f, car.x, car.y, car.z, p.reach ?? 4.5, 4);
        car.hold = near ? car.hold + dt : Math.max(0, car.hold - dt * 2);
        if (car.hold >= (p.hold ?? 1.2) || f.hit[0]) { car.stopped = true; return 'won'; }
        if (!car.moving) {
          if (f.engaged || f.squad.aware || p.delay === 0) car.wait -= dt;
          if (car.wait <= 0) car.moving = true;
        } else {
          car.s += (p.speed ?? 9) * dt;
          pointAt(car.path, car.s, car);
          if (car.s >= car.len) { L.outcome.getaway = 1; return 'lost'; }
        }
        return 'run';
      },
      hud: () => ({ text: car.moving ? 'Stop the getaway car' : 'The getaway driver is waiting', meter: car.moving ? car.s / car.len : clamp01(1 - car.wait / (p.delay ?? 20)), tone: car.moving ? 'bad' : 'warn', label: car.moving ? 'EXIT' : 'DRIVER', timer: car.moving ? null : fmt(car.wait) }),
    };
    return L;
  },

  // A deal or a counting room: take the whole squad down before anyone raises the alarm. An
  // alarm doesn't fail it: it escalates (the money runs; the runtime adds a `chase` to recover it).
  interrupt: (p) => {
    let silent = true;
    const L = {
      outcome: { silent: 1 },
      step(dt, f) {
        if (!f.materialized) return 'run';
        if (f.squad.alarm && silent) { silent = false; L.outcome.silent = 0; if (p.onAlarm === 'escalate') return 'escalate'; }
        if (f.squad.total > 0 && f.squad.alive === 0) return 'won';
        return 'run';
      },
      hud: () => ({ text: silent ? (p.text ?? 'Break up the deal. Stay unseen.') : 'They know you are here', meter: null, tone: silent ? 'ok' : 'bad' }),
    };
    return L;
  },

  // Two gangs at war in one street (facts.gangAlive). Stop both, or pick a side: once one gang is
  // down, the other gets a truce: leave them be for `truce` s and they clear out (sided), hit
  // them and it's a fight to the finish.
  war: (p) => {
    const [a, b] = p.gangs;
    let truce = -1, sideWith = null;
    const L = {
      outcome: { sided: null },
      get truce() { return truce; },
      step(dt, f) {
        if (!f.materialized) return 'run';
        const na = f.gangAlive[a] ?? 0, nb = f.gangAlive[b] ?? 0;
        if (na + nb === 0) return 'won';
        if (truce < 0 && f.engaged && (na === 0 || nb === 0)) { truce = p.truce ?? 10; sideWith = na === 0 ? b : a; L.truceFor = sideWith; }
        if (truce >= 0) {
          if (f.struckGang === sideWith) { truce = -2; L.truceFor = null; }
          else if ((truce -= dt) <= 0) { L.outcome.sided = sideWith; return 'won'; }
        }
        return 'run';
      },
      hud: () => ({ text: truce >= 0 ? `Truce: let the ${p.names?.[sideWith] ?? 'other crew'} walk, or finish it` : `Gang war: stop both crews, or pick a side`, meter: truce >= 0 ? truce / (p.truce ?? 10) : null, tone: 'warn' }),
    };
    return L;
  },

  // Hold a zone (a cell block, a ward): the meter fills while a hero stands in it and drains while
  // the crew holds it alone; won once full with the crew down.
  hold: (p) => {
    let meter = 0;
    const L = {
      outcome: {},
      step(dt, f) {
        if (!f.materialized) return 'run';
        const inside = !!heroWithin(f, p.at.x, p.at.y, p.at.z, p.radius ?? 9, 5);
        meter = clamp01(meter + (inside ? dt / (p.time ?? 25) : -dt / 60));
        if (meter >= 1 && f.squad.alive === 0) return 'won';
        return 'run';
      },
      get meter() { return meter; },
      hud: () => ({ text: p.text ?? 'Retake the block: hold the zone', meter, tone: 'ok', label: 'HOLD' }),
    };
    return L;
  },

  // Sniper nests: each nest's sightline (the laser the runtime draws) spots a hero standing in it
  // uncrouched for `spot` s: the sniper fires on the police below (collateral) and the nest is
  // "loud". Won when the snipers are down (facts.squad), stealthily or not.
  sniper: (p) => {
    const nests = p.nests.map((n) => ({ ...n, seen: 0, shots: 0 }));
    const L = {
      nests, outcome: { collateral: 0, silent: 1 },
      step(dt, f) {
        for (const n of nests) {
          if (n.down) continue;
          const h = heroWithin(f, n.x, n.y, n.z, n.range ?? 38, 30);
          // Inside the cone (the nest's yaw, 35 degrees either side), standing tall, in range.
          let inCone = false;
          if (h && !h.crouched) {
            const yaw = Math.atan2(h.x - n.x, h.z - n.z);
            const dy = Math.atan2(Math.sin(yaw - (n.yaw ?? 0)), Math.cos(yaw - (n.yaw ?? 0)));
            inCone = Math.abs(dy) < 0.62;
          }
          n.seen = inCone ? n.seen + dt : Math.max(0, n.seen - dt);
          if (n.seen > (p.spot ?? 1.6)) { n.seen = 0; n.shots += 1; L.outcome.collateral += 1; L.outcome.silent = 0; L.shot = n; }
        }
        if (f.materialized && f.squad.total > 0 && f.squad.alive === 0) return 'won';
        if (L.outcome.collateral >= (p.maxShots ?? 6)) return 'lost';
        return 'run';
      },
      hud: () => ({ text: 'Snipers pinning down the police. Approach unseen.', meter: Math.max(0, ...nests.map((n) => n.seen / (p.spot ?? 1.6))), tone: 'warn', label: 'SPOTTED' }),
    };
    return L;
  },

  // Reach each person in a burning building (hold `grab` s beside them) before the fire takes
  // their spot (`burn` s each, staggered).
  rescue: (p) => {
    const people = p.people.map((q, i) => ({ x: p.at.x + q.dx, y: p.at.y + (q.dy ?? 0), z: p.at.z + q.dz, t: (p.burn ?? 50) + i * (p.stagger ?? 12), grab: 0, saved: false, hurt: false }));
    const L = {
      people, outcome: { saved: 0, hurt: 0 },
      step(dt, f) {
        for (const q of people) {
          if (q.saved || q.hurt) continue;
          q.t -= dt;
          const h = heroWithin(f, q.x, q.y, q.z, 2.6, 2.5);
          q.grab = h ? q.grab + dt : 0;
          if (q.grab >= (p.grab ?? 0.8)) { q.saved = true; L.outcome.saved += 1; continue; }
          if (q.t <= 0) { q.hurt = true; L.outcome.hurt += 1; }
        }
        if (people.every((q) => q.saved || q.hurt)) return L.outcome.saved > 0 ? 'won' : 'lost';
        return 'run';
      },
      hud: () => {
        const left = people.filter((q) => !q.saved && !q.hurt);
        const worst = left.reduce((m, q) => Math.min(m, q.t), Infinity);
        return { text: `Get them out (${L.outcome.saved}/${people.length})`, meter: left.length ? clamp01(1 - worst / (p.burn ?? 50)) : 0, tone: 'bad', label: 'FIRE', timer: left.length ? fmt(worst) : null };
      },
    };
    return L;
  },

  // A trail of clues held in detective vision in order (tyre marks, a dropped phone, radio
  // triangulation points). The last one reveals where the target is.
  trail: (p) => {
    const pts = p.points.map((q) => ({ ...q, held: 0, done: false }));
    let at = 0;
    const L = {
      points: pts, outcome: {},
      get index() { return at; },
      step(dt, f) {
        const q = pts[at];
        if (!q) return 'won';
        const h = heroWithin(f, q.x, q.y ?? 0, q.z, p.radius ?? 4, 5, 'detective');
        q.held = h ? q.held + dt : Math.max(0, q.held - dt);
        if (q.held >= (p.hold ?? 1)) { q.done = true; at += 1; L.found = q; }
        return at >= pts.length ? 'won' : 'run';
      },
      hud: () => ({ text: p.text ?? `Follow the trail in detective vision (${at}/${pts.length})`, meter: pts.length ? at / pts.length : 1, tone: 'ok', label: 'TRAIL' }),
    };
    return L;
  },

  // Follow a target at a distance band: closer than `min` for `spook` s and it bolts (lost: the
  // runtime turns it into a chase), farther than `max` for `lose` s and the trail goes cold.
  tail: (p) => {
    const tgt = { path: p.path, len: pathLength(p.path), s: 0, x: p.path[0].x, y: p.path[0].y ?? 0, z: p.path[0].z, yaw: 0 };
    let close = 0, far = 0, started = false;
    const L = {
      target: tgt, outcome: { spooked: 0 },
      step(dt, f) {
        const d = nearestHero(f, tgt.x, tgt.y, tgt.z, 40);
        if (!started) { if (d < (p.max ?? 45)) started = true; else return 'run'; }
        tgt.s += (p.speed ?? 2.2) * dt;
        pointAt(tgt.path, tgt.s, tgt);
        close = d < (p.min ?? 10) ? close + dt : Math.max(0, close - dt);
        far = d > (p.max ?? 45) ? far + dt : 0;
        if (close > (p.spook ?? 2.5)) { L.outcome.spooked = 1; return 'escalate'; }
        if (far > (p.lose ?? 8)) return 'lost';
        return tgt.s >= tgt.len ? 'won' : 'run';
      },
      hud: () => ({ text: p.text ?? 'Tail them. Not too close.', meter: clamp01(close / (p.spook ?? 2.5)), tone: close > 0.5 ? 'bad' : far > 0 ? 'warn' : 'ok', label: far > 0 ? 'LOSING' : 'SUSPICION' }),
    };
    return L;
  },

  // Get on the El train the crew is riding (facts.train) before it has made `stops` more stops.
  board: (p) => {
    let stops = 0, wasStopped = true;
    const L = {
      outcome: {},
      step(dt, f) {
        const T = f.train;
        if (!T) return 'run';
        if (T.stopped && !wasStopped) stops += 1;
        wasStopped = T.stopped;
        for (let i = 0; i < f.nHeroes; i++) {
          const h = f.heroes[i];
          if (!h.dead && Math.abs(h.y - T.y) < 3.5 && d2(h, T.x, T.z) < (p.reach ?? 26)) return 'won';
        }
        return stops >= (p.stops ?? 3) ? 'lost' : 'run';
      },
      hud: () => ({ text: 'Get aboard the hijacked train', meter: stops / (p.stops ?? 3), tone: 'bad', label: 'STOPS' }),
    };
    return L;
  },

  // Reach a place (the bridgehouse controls, the chop shop door): won on arrival.
  reach: (p) => ({
    outcome: {},
    step(dt, f) { return heroWithin(f, p.at.x, p.at.y ?? 0, p.at.z, p.radius ?? 4, 6) ? 'won' : 'run'; },
    hud: () => ({ text: p.text ?? 'Get there', meter: null, tone: 'ok' }),
  }),

  // A clock on its own (a bridge leaf still rising, a cell door timer): lost when it runs out.
  clock: (p) => {
    let t = p.timer ?? 60;
    return {
      outcome: {},
      get left() { return t; },
      step(dt) { t -= dt; return t <= 0 ? 'lost' : 'run'; },
      hud: () => ({ text: p.text ?? 'Hurry', meter: clamp01(1 - t / (p.timer ?? 60)), tone: t < 15 ? 'bad' : 'warn', timer: fmt(t) }),
    };
  },
};
export const LEAF_KINDS = Object.keys(LEAVES);

// ---------------------------------------------------------------- composites

// seq: one part at a time; all: every part (a lost part loses); any: the first part done wins.
// A part may be `optional: true` (its loss doesn't fail the whole; its outcome still counts).
export function createObjective(spec, rng = null) {
  if (spec.kind === 'seq' || spec.kind === 'all' || spec.kind === 'any') {
    const parts = spec.parts.map((s) => createObjective(s, rng));
    const status = parts.map(() => 'run');
    let at = 0;
    const node = {
      kind: spec.kind, parts, status,
      get leaves() { return parts.flatMap((p) => p.leaves); },
      get current() { return spec.kind === 'seq' ? parts[at] ?? null : null; },
      get index() { return at; },
      step(dt, f) {
        if (spec.kind === 'seq') {
          while (at < parts.length) {
            const r = parts[at].step(dt, f);
            status[at] = r;
            if (r === 'run' || r === 'escalate') return r;
            if (r === 'lost' && !spec.parts[at].optional) return 'lost';
            at += 1;
            dt = 0; // the next part starts next frame's clock, not this one's
          }
          return 'won';
        }
        let allWon = true;
        for (let i = 0; i < parts.length; i++) {
          if (status[i] === 'won' || (status[i] === 'lost' && spec.parts[i].optional)) continue;
          const r = parts[i].step(dt, f);
          status[i] = r;
          if (r === 'escalate') return r;
          if (r === 'lost' && !spec.parts[i].optional) return 'lost';
          if (r === 'won' && spec.kind === 'any') return 'won';
          if (r !== 'won') allWon = false;
        }
        return allWon ? 'won' : 'run';
      },
      // Splice a new part in (escalation: the deal's money runs, the tailed car bolts).
      add(partSpec) { const o = createObjective(partSpec, rng); parts.push(o); status.push('run'); spec.parts.push(partSpec); return o; },
      // One line for the HUD: the first live part's text (an `all` joins two), the first meter.
      hud() {
        const live = spec.kind === 'seq' ? [parts[at]].filter(Boolean) : parts.filter((p, i) => status[i] === 'run');
        const hs = live.slice(0, 2).map((p) => p.hud?.()).filter(Boolean);
        if (!hs.length) return null;
        if (hs.length === 1) return hs[0];
        const m = hs.find((h) => h.meter != null || h.dial) ?? hs[0];
        return { ...m, text: `${hs[0].text}. ${hs[1].text}`, timer: hs[0].timer ?? hs[1].timer ?? null };
      },
      outcome() {
        const o = { saved: 0, hurt: 0, caught: 0, escaped: 0, silent: 1, collateral: 0, getaway: 0, defused: 0, sided: null, spooked: 0 };
        for (const l of node.leaves) {
          const lo = l.outcome ?? {};
          for (const k of ['saved', 'hurt', 'caught', 'escaped', 'collateral', 'getaway', 'defused', 'spooked']) o[k] += lo[k] ?? 0;
          if (lo.silent === 0) o.silent = 0;
          if (lo.sided) o.sided = lo.sided;
        }
        return o;
      },
    };
    return node;
  }
  const make = LEAVES[spec.kind];
  if (!make) throw new Error(`unknown objective ${spec.kind}`);
  const leaf = make(spec, rng);
  leaf.kind = spec.kind;
  leaf.spec = spec;
  leaf.leaves = [leaf];
  return leaf;
}

// A reusable facts object (the runtime fills it every frame; tests fill it by hand).
export function createFacts(maxHeroes = 2) {
  return {
    heroes: Array.from({ length: maxHeroes }, (_, slot) => ({ x: 0, y: 0, z: 0, slot, detective: false, crouched: false, dead: false })),
    nHeroes: 0, materialized: false, engaged: false,
    squad: { alive: 0, total: 0, aware: false, alarm: false },
    gangAlive: {}, struckGang: null,
    press: [false, false], hit: new Uint8Array(8), train: null, chase: null,
  };
}
