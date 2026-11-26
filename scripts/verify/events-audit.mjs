// [verify] Lists every event name emitted with `events.emit('x'` / `emit('x'` and every name
// listened to with `events.on('x'` / `.once('x'` / `on('x'` across src/, then prints emitters no
// one listens to and listeners nothing emits. Names built at run time (template strings, variables,
// `onceEachId` maps) are reported separately so a human can check them.
// usage: node scripts/verify/events-audit.mjs [--json]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js)$/.test(f)) files.push(p);
  }
})(join(root, 'src'));

const emits = new Map(), ons = new Map(), dynamic = [];
const add = (m, k, where) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(where); };
// emit / emitFor / withPlayer(... 'x' ...) style calls on an events bus.
const EMIT = /\b(?:events|ev|bus|game\.events|deps\.events|ctx\.events|this\.events)\s*\??\.\s*emit\s*\(\s*(['"`])([^'"`]+)\1/g;
const EMIT_BARE = /(?<![\w.])(?:emit|emitFor|shareEvent)\s*\(\s*(?:[\w.]+\s*,\s*)?(['"])([A-Za-z][\w.:-]*)\1/g;
const ON = /\b(?:events|ev|bus|game\.events|deps\.events|ctx\.events|this\.events)\s*\??\.\s*(?:on|once)\s*\(\s*(['"`])([^'"`]+)\1/g;
const ON_BARE = /(?<![\w.])(?:on|once)\s*\(\s*(['"])([A-Za-z][\w.:-]*)\1\s*,/g;
const ON_LIST = /for\s*\(\s*const\s+\w+\s+of\s+\[([^\]]+)\]\s*\)\s*(?:events|ev|bus)\s*\.\s*on\s*\(/g;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = relative(root, f).replace(/\\/g, '/');
  for (const re of [EMIT, EMIT_BARE]) for (const m of src.matchAll(re)) {
    if (m[1] === '`' && m[2].includes('${')) { dynamic.push(`${rel}: emit ${m[2]}`); continue; }
    add(emits, m[2], rel);
  }
  for (const re of [ON, ON_BARE]) for (const m of src.matchAll(re)) {
    if (m[1] === '`' && m[2].includes('${')) { dynamic.push(`${rel}: on ${m[2]}`); continue; }
    add(ons, m[2], rel);
  }
  for (const m of src.matchAll(ON_LIST)) for (const n of m[1].matchAll(/['"]([\w.:-]+)['"]/g)) add(ons, n[1], rel);
}
// A name that is only ever an emit/on literal is a real orphan; one that also appears as a quoted
// string elsewhere (a relay list, a sound table, `onEvent: 'zipOn'`, a FLAT xp list) is wired
// indirectly and listed apart so the report separates the two.
const all = files.map((f) => readFileSync(f, 'utf8')).join('\n');
const quotedElsewhere = (k, sites) => {
  const n = (all.match(new RegExp(`['"\`]${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`, 'g')) ?? []).length;
  return n > sites;
};
const count = (k) => (all.match(new RegExp(`(?:emit|emitFor|shareEvent|on|once)\\s*\\(\\s*(?:[\\w.]+\\s*,\\s*)?['"\`]${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`, 'g')) ?? []).length;
const noListenerAll = [...emits.keys()].filter((k) => !ons.has(k)).sort();
const noEmitterAll = [...ons.keys()].filter((k) => !emits.has(k)).sort();
const noListener = noListenerAll.filter((k) => !quotedElsewhere(k, count(k)));
const noEmitter = noEmitterAll.filter((k) => !quotedElsewhere(k, count(k)));
const indirect = [...noListenerAll, ...noEmitterAll].filter((k) => !noListener.includes(k) && !noEmitter.includes(k));
console.log(`(indirectly wired, name quoted elsewhere: ${indirect.join(', ')})`);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ emits: emits.size, ons: ons.size, noListener: noListener.map((k) => [k, [...emits.get(k)]]), noEmitter: noEmitter.map((k) => [k, [...ons.get(k)]]), dynamic }, null, 1));
} else {
  console.log(`event names emitted: ${emits.size}, listened: ${ons.size}`);
  console.log(`\n## emitted, no listener (${noListener.length})`);
  for (const k of noListener) console.log(`${k}\t${[...emits.get(k)].join(', ')}`);
  console.log(`\n## listened, never emitted by a literal name (${noEmitter.length})`);
  for (const k of noEmitter) console.log(`${k}\t${[...ons.get(k)].join(', ')}`);
  console.log(`\n## dynamic names (${dynamic.length})`);
  for (const d of dynamic) console.log(d);
}
