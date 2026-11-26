import { BARK_TABLES, SPEAKERS, CRIME_ALERTS } from './barks/lines.js';

// Dialogue and bark scheduling. Pure: it decides *what* is said, *when* and by *whom*; the engine
// (audio.js) plays the voice blips, the radio treatment and the ducking, and calls the subtitle
// hook with what this returns.
//
// Channels:
//   'voice'  - foreground speech (Alfred, a villain, story lines). One at a time; queued.
//   'radio'  - dispatch, police, comms. Shares the foreground slot with 'voice'; queued.
//   'world'  - barks from goons and civilians out in the street. Up to WORLD_MAX at once,
//              positional, dropped (not queued) when busy, because a late bark is a wrong bark.
// Priorities: higher wins. A foreground request may interrupt a lower-priority line only when
// it asks to (`interrupt: true`); otherwise it waits in a short queue that drops stale entries.

export const BARK_PRIORITY = Object.freeze({ ambient: 0, combat: 1, radio: 2, companion: 3, story: 4 });
const WORLD_MAX = 2;
const QUEUE_MAX = 4;
const RECENT = 6; // never repeat any of the last N lines of a table (or N-1 for small tables)

// Seconds a line takes to say at a natural pace, used for subtitles and ducking.
export function lineDuration(text) {
  const n = typeof text === 'string' ? text.length : 0;
  const pauses = typeof text === 'string' ? (text.match(/[.!?…]/g) || []).length : 0;
  return Math.min(8, Math.max(0.9, 0.45 + n * 0.058 + pauses * 0.12));
}

export function speakerName(id) { return SPEAKERS[id] ?? (typeof id === 'string' ? id : ''); }

// A crime alert line for the dispatch radio.
export function dispatchLine({ kind = 'generic', district = 'the city' } = {}, rng = Math.random) {
  const list = CRIME_ALERTS[kind] ?? CRIME_ALERTS.generic;
  const tpl = list[Math.floor(rng() * list.length) % list.length];
  const pretty = (s) => String(s).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
  return tpl.replace('{kind}', String(kind === 'generic' ? 'disturbance' : kind).toLowerCase()).replace('{district}', pretty(district));
}

export function createDialogue({ rng = Math.random, tables = BARK_TABLES } = {}) {
  const recent = new Map(); // table id -> recent line indices
  const lastSpoke = new Map(); // speaker id -> time its last line ended
  const lastTable = new Map(); // table id -> time it was last used
  let fore = null; // { plan, until }
  let world = []; // [{ plan, until }]
  let queue = [];

  // Picks a line index from a table, avoiding the recent ones.
  function pickIndex(id) {
    const t = tables[id];
    if (!t || !t.lines.length) return -1;
    const n = t.lines.length;
    const avoid = recent.get(id) ?? [];
    const keep = Math.min(RECENT, n - 1);
    const pool = [];
    for (let i = 0; i < n; i++) if (!avoid.slice(-keep).includes(i)) pool.push(i);
    const i = pool.length ? pool[Math.floor(rng() * pool.length) % pool.length] : 0;
    avoid.push(i);
    if (avoid.length > RECENT) avoid.shift();
    recent.set(id, avoid);
    return i;
  }

  // Expands a table line (string or conversation) into timed parts.
  function expand(line, speaker, start) {
    const parts = Array.isArray(line) ? line.map(([s, text]) => ({ speaker: s, text })) : [{ speaker, text: line }];
    let at = start;
    return parts.map((p) => {
      const duration = lineDuration(p.text);
      const part = { speaker: p.speaker, name: speakerName(p.speaker), text: p.text, duration, start: at };
      at += duration + 0.25; // a breath between speakers
      return part;
    });
  }

  function makePlan(req, now) {
    let speaker = req.speaker;
    let line = req.text ?? null;
    let radio = !!req.radio;
    let tableId = null;
    if (!line && req.table) {
      const t = tables[req.table];
      if (!t) return null;
      const i = pickIndex(req.table);
      if (i < 0) return null;
      line = t.lines[i];
      speaker = speaker ?? t.speaker;
      radio = radio || !!t.radio;
      tableId = req.table;
    }
    if (!line) return null;
    const channel = req.channel ?? (radio ? 'radio' : 'world');
    const parts = expand(line, speaker ?? 'goon', now);
    const last = parts[parts.length - 1];
    return {
      id: req.id ?? null, table: tableId, channel, radio: radio || channel === 'radio',
      priority: req.priority ?? (channel === 'world' ? BARK_PRIORITY.combat : BARK_PRIORITY.radio),
      speaker: speaker ?? parts[0].speaker, pos: req.pos ?? null, parts,
      start: now, end: last.start + last.duration, expires: now + (req.ttl ?? 6),
    };
  }

  function cooled(req, now) {
    const sp = req.speaker ?? tables[req.table]?.speaker;
    const cd = req.cooldown ?? (req.channel === 'world' || (!req.channel && !tables[req.table]?.radio) ? 6 : 0);
    if (sp && cd > 0 && now < (lastSpoke.get(sp) ?? -Infinity) + cd) return false;
    const tcd = req.tableCooldown ?? 0;
    if (req.table && tcd > 0 && now < (lastTable.get(req.table) ?? -Infinity) + tcd) return false;
    return true;
  }

  function begin(plan, now) {
    // re-time a queued plan to start now
    const shift = now - plan.start;
    if (shift) { for (const p of plan.parts) p.start += shift; plan.start += shift; plan.end += shift; }
    for (const p of plan.parts) lastSpoke.set(p.speaker, p.start + p.duration);
    if (plan.table) lastTable.set(plan.table, now);
    return plan;
  }

  return {
    // Ask for a line. Returns the plan if it starts now, 'queued', or null (dropped).
    // req: { table | text, speaker, priority, channel, radio, pos, interrupt, cooldown, ttl, id }
    request(req = {}, now = 0) {
      if (!req || (!req.table && !req.text)) return null;
      if (!cooled(req, now)) return null;
      const channel = req.channel ?? (req.radio || tables[req.table]?.radio ? 'radio' : 'world');
      world = world.filter((w) => w.until > now);
      if (channel === 'world') {
        if (world.length >= WORLD_MAX) return null;
        const plan = makePlan({ ...req, channel }, now);
        if (!plan) return null;
        world.push({ plan, until: plan.end });
        return begin(plan, now);
      }
      if (fore && fore.until <= now) fore = null;
      const prio = req.priority ?? BARK_PRIORITY.radio;
      if (!fore) {
        const plan = makePlan({ ...req, channel, priority: prio }, now);
        if (!plan) return null;
        fore = { plan, until: plan.end };
        return begin(plan, now);
      }
      if (req.interrupt && prio > fore.plan.priority) {
        const plan = makePlan({ ...req, channel, priority: prio }, now);
        if (!plan) return null;
        const cut = fore.plan;
        fore = { plan, until: plan.end };
        plan.interrupted = cut;
        return begin(plan, now);
      }
      const plan = makePlan({ ...req, channel, priority: prio }, now);
      if (!plan) return null;
      queue.push(plan);
      queue.sort((a, b) => b.priority - a.priority || a.start - b.start);
      if (queue.length > QUEUE_MAX) queue.length = QUEUE_MAX;
      return queue.includes(plan) ? 'queued' : null;
    },
    // Call regularly: returns the next queued plan that should start now, or null.
    update(now) {
      if (fore && fore.until <= now) fore = null;
      if (!queue.length) return null;
      if (queue.some((p) => p.expires <= now && p.priority < BARK_PRIORITY.story)) queue = queue.filter((p) => p.expires > now || p.priority >= BARK_PRIORITY.story);
      if (fore || !queue.length) return null;
      const plan = queue.shift();
      fore = { plan, until: now + (plan.end - plan.start) };
      return begin(plan, now);
    },
    stop(now = 0) { fore = null; queue = []; world = world.filter((w) => w.until > now); },
    get busy() { return !!fore; },
    get queued() { return queue.length; },
    pickIndex,
  };
}
