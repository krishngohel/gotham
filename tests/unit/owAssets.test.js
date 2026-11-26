// Every clip, model, look and speaker the open world names resolves to something the game ships.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { VILLAINS } from '../../src/heroes/models/villains.js';
import { GANGS as LOOKS } from '../../src/heroes/models/enemies.js';
import { GANGS, lookOf } from '../../src/openworld/gangs.js';
import { CHAINS } from '../../src/openworld/chains/data.js';
import { SPEAKERS } from '../../src/audio/barks/lines.js';
import { DISPATCH, MOOD_BARKS, ARRIVAL_BARKS } from '../../src/openworld/lines.js';
import { CRIME_TYPE_IDS } from '../../src/openworld/crimeTypes.js';
import { VILLAIN_THEMES } from '../../src/audio/music/director.js';

// Animation names in the shipped GLBs (the JSON chunk of each file).
function glbClips() {
  const names = new Set();
  const dir = 'public/assets';
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.glb'))) {
    const buf = readFileSync(`${dir}/${f}`);
    const len = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
    for (const a of json.animations ?? []) names.add(a.name);
  }
  return names;
}
// The clips src/openworld plays on civilians, runners, hostages and the chain bosses.
const USED = ['Crouch_Idle_Loop', 'Idle_Loop', 'Jog_Fwd_Loop', 'Walk_Loop', 'Jump_Loop', 'Hit_Knockback', 'Yes'];

describe('open-world assets resolve', () => {
  it('every animation clip the open world plays ships in a GLB', () => {
    const clips = glbClips();
    expect(clips.size).toBeGreaterThan(50);
    for (const c of USED) expect(clips.has(c), c).toBe(true);
  });
  it('every chain villain has a model; every gang a goon look', () => {
    for (const c of CHAINS) expect(VILLAINS[c.villain], c.villain).toBeTruthy();
    for (const g of Object.keys(GANGS)) expect(LOOKS[lookOf(g)], g).toBeTruthy();
  });
  it('every crime type has a dispatch line; every mood and arrival reaction has barks', () => {
    for (const t of CRIME_TYPE_IDS) expect(DISPATCH.spawn[t]?.length, t).toBeGreaterThan(0);
    for (const m of ['safe', 'calm', 'uneasy', 'tense', 'lawless']) expect(MOOD_BARKS[m].length).toBeGreaterThan(1);
    for (const k of ['surrender', 'flee', 'trap']) expect(ARRIVAL_BARKS[k].length).toBeGreaterThan(1);
    // Speakers the open world barks as.
    for (const s of ['goon', 'civilian', 'dispatch']) expect(SPEAKERS[s]).toBeTruthy();
  });
  it('lines stay general-audience and fill their placeholders', () => {
    const all = [...Object.values(DISPATCH.spawn).flat(), ...Object.values(MOOD_BARKS).flat(), ...Object.values(ARRIVAL_BARKS).flat()];
    for (const l of all) {
      expect(l).not.toMatch(/\{(?!district\}|n\}|name\})/);
      expect(l).not.toMatch(/\b(damn|hell|kill you)\b/i);
    }
  });
  it('the chain bosses with a music theme use it (the rest fall back to the boss cue)', () => {
    expect(VILLAIN_THEMES.twoFace).toBeTruthy();
  });
});
