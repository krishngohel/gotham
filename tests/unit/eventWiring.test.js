// [verify] Every event something listens for is emitted somewhere (scripts/verify/events-audit.mjs).
// Regression for 'crimeExpired': Bruce's night report listened for it, nothing ever emitted it, so
// ignored crimes never reached the papers.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

describe('event wiring', () => {
  it('no listener waits for an event name nothing emits', () => {
    const script = fileURLToPath(new URL('../../scripts/verify/events-audit.mjs', import.meta.url));
    const out = execFileSync(process.execPath, [script, '--json'], { encoding: 'utf8' });
    const json = JSON.parse(out.slice(out.indexOf('{')));
    expect(json.noEmitter).toEqual([]);
  });
});
