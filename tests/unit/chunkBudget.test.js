import { it, expect } from 'vitest';
import { buildCoreCityHeadless } from './helpers/headlessCity.js';

// Per-chunk budgets the framework doc quotes (docs/design/world-framework.md section 4): near
// draws and triangles per 128 m chunk, far-LOD triangles. Printed so the doc can be checked.
it('chunk budgets', async () => {
  const city = await buildCoreCityHeadless();
  const rows = [];
  for (const c of city.ctx.chunks.chunks.values()) {
    let tris = 0;
    for (const m of c.near) tris += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
    const lod = c.lod ? c.lod.geometry.index.count / 3 : 0;
    rows.push({ key: c.key, region: c.region, draws: c.near.length, tris, lod });
  }
  rows.sort((a, b) => b.tris - a.tris);
  console.log(rows.map((r) => `${r.key.padEnd(6)} ${String(r.region).padEnd(12)} draws ${String(r.draws).padStart(3)} tris ${String(r.tris).padStart(6)} lod ${r.lod}`).join('\n'));
  for (const r of rows) {
    expect(r.draws).toBeLessThanOrEqual(40);
    expect(r.lod).toBeLessThan(4000);
  }
}, 120000);
