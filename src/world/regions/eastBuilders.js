// The east side's region builders (workstream H2), registered in ./index.js BUILDERS.
import { buildLakefront, buildLakeshore } from './lakefront.js';
import { buildPier } from './pier.js';
import { buildMuseum } from './museum.js';
import { buildArkham } from './arkham.js';

export const EAST_BUILDERS = {
  lakefront(ctx) { buildLakefront(ctx); },
  lakeshore(ctx) { buildLakeshore(ctx); },
  museum(ctx) { buildMuseum(ctx); },
  pier(ctx) { buildPier(ctx); },
  arkham(ctx) { buildArkham(ctx); },
};
