// [verify] Settings are honoured everywhere: every CSS animation in the game (src/ui/style.css and
// the styles modules inject from JS) has a reduced-motion answer, the strobe / distortion helpers
// follow flash reduction and reduced motion, and text added by later waves scales with text size.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { allowStrobe, distortOptions, lightningFlash } from '../../src/ui/accessibility.js';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = `${dir}/${name}`;
    if (statSync(join(ROOT, p)).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

// A tiny CSS reader: [{ selectors: [..], body }], @keyframes skipped, @media/@supports entered.
function cssRules(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\$\{[^}]*\}/g, 'X');
  const rules = [];
  let i = 0;
  const block = (from) => { // index after the matching close brace of the block opened at `from`
    let d = 0;
    for (let j = from; j < src.length; j++) {
      if (src[j] === '{') d++;
      else if (src[j] === '}' && --d === 0) return j + 1;
    }
    return src.length;
  };
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const head = src.slice(i, open).trim();
    const end = block(open);
    if (/^@(media|supports)/.test(head)) rules.push(...cssRules(src.slice(open + 1, end - 1)));
    else if (!head.startsWith('@')) {
      rules.push({ selectors: head.split(',').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean), body: src.slice(open + 1, end - 1) });
    }
    i = end;
  }
  return rules;
}

// Every stylesheet: style.css plus each template literal in src/ that holds CSS rules.
function allRules() {
  const rules = cssRules(read('src/ui/style.css')).map((r) => ({ ...r, file: 'src/ui/style.css' }));
  for (const f of jsFiles('src')) {
    const text = read(f);
    for (const m of text.matchAll(/`([^`]*)`/g)) {
      if (!/[.#][\w-]+[^{}]*\{[^{}]*:[^{}]*\}/.test(m[1])) continue;
      for (const r of cssRules(m[1])) rules.push({ ...r, file: f });
    }
  }
  return rules;
}

const ANIM = /(^|[;{\s])animation(-name)?\s*:(?!\s*none\b)[^;]+/;
const CALM = ['.a11y-reduced-motion ', 'body.a11y-reduced-motion ', '.st-calm '];
// Animations that need no reduced-motion rule, and why.
const ALLOWED = {
  '.loading .bar i': 'the loading bar runs before settings are read; an indeterminate progress bar',
  '.hud-flash.fade': 'an opacity-only fade (no motion); the flash-reduce rule dims and slows it',
  '.photo-flash.on': 'photoMode.js never adds .on under flash reduction or reduced motion',
  '.bw-meters .flash': 'a colour change, no motion; the flash-reduce rule replaces it with an outline',
};

describe('[verify] CSS animations all have a reduced-motion answer', () => {
  const rules = allRules();
  const covered = new Set();
  for (const r of rules) for (const s of r.selectors) for (const p of CALM) if (s.startsWith(p)) covered.add(s.slice(p.length));

  it('the reader sees the stylesheets (sanity)', () => {
    expect(rules.length).toBeGreaterThan(300);
    expect(rules.some((r) => r.file === 'src/wanted/hud.js' && r.selectors.includes('.wanted-readout.pulse svg'))).toBe(true);
    expect(rules.some((r) => r.file === 'src/bruce/ui.js')).toBe(true);
  });

  it('every animated selector is covered or allowed with a reason', () => {
    const missing = [];
    for (const r of rules) {
      if (!ANIM.test(r.body)) continue;
      for (const s of r.selectors) {
        if (CALM.some((p) => s.startsWith(p)) || /^(body)?\.a11y-flash-reduce /.test(s)) continue;
        if (covered.has(s) || ALLOWED[s]) continue;
        missing.push(`${r.file}: ${s}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('no stylesheet uses backdrop-filter without a reduced-motion or flash-reduce rule', () => {
    const flashCovered = new Set();
    for (const r of rules) for (const s of r.selectors) for (const p of ['.a11y-flash-reduce ', 'body.a11y-flash-reduce ']) if (s.startsWith(p)) flashCovered.add(s.slice(p.length));
    const bad = rules.filter((r) => /backdrop-filter\s*:(?!\s*none\b)/.test(r.body)).flatMap((r) => r.selectors.filter((s) => !covered.has(s) && !flashCovered.has(s)).map((s) => `${r.file}: ${s}`));
    expect(bad).toEqual([]);
  });

  it('comic sound words keep an animation under reduced motion (hud.js removes them on animationend)', () => {
    const calm = rules.find((r) => r.selectors.includes('body.a11y-reduced-motion .sfx'));
    expect(calm?.body).toMatch(/animation-name:\s*a11ySfxCalm/);
    expect(calm?.body).not.toMatch(/animation:\s*none/);
  });
});

describe('[verify] strobe and distortion helpers', () => {
  it('allowStrobe: only with neither flash reduction nor reduced motion', () => {
    expect(allowStrobe({})).toBe(true);
    expect(allowStrobe({ flashReduce: true })).toBe(false);
    expect(allowStrobe({ reducedMotion: true })).toBe(false);
    expect(allowStrobe(null)).toBe(true);
  });
  it('distortOptions: flash reduction halves the swing, reduced motion drops the blur', () => {
    expect(distortOptions({})).toEqual({ k: 1, blur: true });
    expect(distortOptions({ flashReduce: true })).toEqual({ k: 0.5, blur: true });
    expect(distortOptions({ reducedMotion: true })).toEqual({ k: 1, blur: false });
  });
  it('the env system draws lightning through lightningFlash (reduced: no frame above 0.3)', () => {
    expect(read('src/env/envSystem.js')).toMatch(/flash = lightningFlash\(flashT, !!getAccess\(\)\.flashReduce\)/);
    for (let t = 0; t <= 0.26; t += 0.01) expect(lightningFlash(t, true)).toBeLessThanOrEqual(0.3);
  });
  it('the wanted siren edge only alternates colours when strobing is allowed', () => {
    expect(read('src/wanted/hud.js')).toMatch(/!reducedMotion\(\) && allowStrobe\(\)/);
  });
});

describe('[verify] text added by later waves scales with the text size', () => {
  const FILES = ['src/wanted/hud.js', 'src/sandbox/radio/radio.js', 'src/bruce/ui.js', 'src/nav/travelTransition.js', 'src/story/viewFx.js',
    'src/story/ui.js', 'src/openworld/ui/owHud.js', 'src/ui/minimap/minimap.js', 'src/ui/cityMap/cityMap.js', 'src/openworld/cases/board.js',
    'src/vehicles/vehicles.js', 'src/vehicles/batwing.js', 'src/story/endgame.js', 'src/ui/cinematic.js'];
  it.each(FILES)('%s has no fixed px font size', (f) => {
    const fixed = read(f).match(/font(-size)?\s*:\s*(\d{3}\s+)?\d+(\.\d+)?px/g) ?? [];
    expect(fixed).toEqual([]);
  });
});
