// Gadget handlers by id. Each gadget task adds its line; the system builds one handler per entry.
import { createBatarangHandler } from './batarang.js';
import { createRemoteHandler } from './remote.js';
import { createGelHandler } from './gel.js';
import { createSmokeHandler } from './smoke.js';
import { createLauncherHandler } from './launcher.js';
import { createClawHandler } from './claw.js';
import { createFreezeHandler } from './freeze.js';
import { createFlashbangHandler } from './flashbang.js';
// [prog] wave 3
import { createDisruptorHandler } from './disruptor.js';
import { createSonicHandler } from './sonic.js';
import { createHackHandler } from './hack.js';
import { createShockHandler } from './shock.js';
import { createGlueHandler } from './glue.js';
import { createTrackerHandler } from './tracker.js';
import { createDroneHandler } from './drone.js';
import { createBolasHandler } from './bolas.js';
import { createEmpHandler } from './emp.js';
import { createDecoyHandler } from './decoy.js';

export const HANDLER_FACTORIES = {
  batarang: createBatarangHandler,
  remote: createRemoteHandler,
  gel: createGelHandler,
  smoke: createSmokeHandler,
  launcher: createLauncherHandler,
  claw: createClawHandler,
  freeze: createFreezeHandler,
  flashbang: createFlashbangHandler,
  // [prog] wave 3
  disruptor: createDisruptorHandler,
  sonic: createSonicHandler,
  hack: createHackHandler,
  shock: createShockHandler,
  glue: createGlueHandler,
  tracker: createTrackerHandler,
  drone: createDroneHandler,
  bolas: createBolasHandler,
  emp: createEmpHandler,
  decoy: createDecoyHandler,
};
