// Dumps Mixamo's Motion catalogue (name, description, id, a few flags) to <MIXAMO_DIR>/catalog.json,
// so clip choices can be made offline instead of by repeated searches. Same Chrome-on-:9555 setup
// as mixamo-fetch.mjs; the session token never leaves the page. Pages are fetched one at a time.
//   MIXAMO_DIR=../gotham/assets-src/mixamo node scripts/mixamo-catalog.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mixamoDir } from './mixamo-fetch.mjs';

const listPage = async (n) => {
  const token = localStorage.getItem('access_token');
  if (!token) return { error: 'not logged in' };
  const r = await fetch(`https://www.mixamo.com/api/v1/products?page=${n}&limit=96&order=&type=Motion&query=`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Api-Key': 'mixamo2', Accept: 'application/json' },
  });
  if (!r.ok) return { error: `HTTP ${r.status}` };
  const j = await r.json();
  return {
    pages: j.pagination?.num_pages ?? 1,
    results: (j.results ?? []).map((x) => ({ id: x.id, name: x.name, description: x.description, motion: x.motion_id, type: x.type, source: x.source })),
  };
};

const dir = mixamoDir();
mkdirSync(dir, { recursive: true });
const b = await chromium.connectOverCDP('http://127.0.0.1:9555');
const page = b.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('mixamo.com'));
if (!page) { console.error('no mixamo.com tab in the Chrome on :9555'); process.exit(1); }
const all = [];
let pages = 1;
for (let n = 1; n <= pages; n++) {
  let r;
  for (let tries = 0; tries < 6; tries++) {
    r = await page.evaluate(listPage, n);
    if (!r.error?.includes('429')) break;
    await new Promise((ok) => setTimeout(ok, 30000 + tries * 30000));
  }
  if (r.error) { console.error(`page ${n}: ${r.error}`); process.exit(1); }
  pages = r.pages;
  all.push(...r.results);
  console.log(`page ${n}/${pages}: ${all.length}`);
  await new Promise((ok) => setTimeout(ok, 1200));
}
writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify(all, null, 1));
console.log(`${all.length} motions -> ${path.join(dir, 'catalog.json')}`);
process.exit(0); // disconnect only: the owner's browser stays open
