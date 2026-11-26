// [polish] World checks on the real assembled city: the Blackgate causeway mouth is clear.
import { describe, it, expect, beforeAll } from 'vitest';
import { buildCoreCityHeadless } from './helpers/headlessCity.js';

let city;
beforeAll(async () => { city = await buildCoreCityHeadless(); }, 180000);

describe('Blackgate causeway mouth', () => {
  it('nothing stands on the road into the causeway (x 84..96, docks to the landing)', () => {
    const hits = city.collision.query(85, 180, 95, 204).filter((b) => !b.removed && b.maxY > 0.35 && b.minY < 2.5
      && b.tag !== 'bound' && b.maxX - b.minX < 4 && b.maxZ - b.minZ < 4);
    expect(hits.map((b) => `${b.tag || 'untagged'} ${((b.minX + b.maxX) / 2).toFixed(1)},${((b.minZ + b.maxZ) / 2).toFixed(1)}`)).toEqual([]);
  });
});

// Every street-graph edge, sampled every 0.5 m at its own height, against the railings, fences and
// parapets (bodies 0.3..1.5 m above the line). Lower Gotham's jersey barriers on the lower deck's
// centre line are left out on purpose: a 4-lane median, the lanes run either side of it.
describe('street graph vs railings', () => {
  it('no edge runs through a railing, fence or parapet', () => {
    const g = city.streetGraph;
    const TAGS = new Set(['railing', 'fence', 'parapet']);
    const out = [];
    for (const e of g.edges) {
      const A = g.nodes[e.a], B = g.nodes[e.b];
      const n = Math.max(1, Math.ceil(e.length / 0.5));
      const hit = new Set();
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t, y = A.y + (B.y - A.y) * t;
        for (const b of city.collision.query(x, z, x, z)) {
          if (b.removed || !TAGS.has(b.tag) || hit.has(b.id)) continue;
          if (b.maxY < y + 0.3 || b.minY > y + 1.5) continue;
          if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
            hit.add(b.id);
            out.push(`${e.kind} ${e.region} (${A.x},${A.z})->(${B.x},${B.z}) x ${b.tag} at ${x.toFixed(1)},${z.toFixed(1)}`);
          }
        }
      }
    }
    expect(out).toEqual([]);
  });
});
