// Prints the pacing report (src/story/pacing.js) for Night One and every campaign night, or for a
// story module given on the command line (e.g. a copy of an older story.js, to compare before and
// after). usage: node scripts/pacing.mjs [path/to/story.js] [--stops]
import { pacingReport } from '../src/story/pacing.js';

const arg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const stops = process.argv.includes('--stops');
const show = (name, steps) => {
  const r = pacingReport(steps);
  console.log(`${name.padEnd(28)} steps ${String(r.steps).padStart(3)} | hard stops ${String(r.hardStops).padStart(2)} (radio-only ${r.radioSteps}, comics ${r.comics}, cinematics ${r.cinematics}) | camera cuts ${String(r.cuts).padStart(2)} | no agency ${r.noAgencySeconds} s`);
  if (stops) for (const s of r.stops) console.log(`    ${s.id.padEnd(22)} ${s.type.padEnd(9)} ${s.seconds} s`);
};
if (arg) {
  const mod = await import(new URL(arg, `file://${process.cwd().replace(/\\/g, '/')}/`).href);
  show(arg, mod.STEPS);
} else {
  const { allNights, stepsOf } = await import('../src/story/campaign.js');
  await import('../src/story/nights/index.js');
  for (const n of allNights()) show(`${n.id} ${n.title}`, stepsOf(n));
}
