// Every night of the campaign, registered in play order. A new night (Acts IV and V, the second
// story workstream) is one import and one registerNight line here; nothing else changes.
import { registerNight } from '../campaign.js';
import n1 from './n1.js';
import n2 from './n2.js';
import n3 from './n3.js';
import n4 from './n4.js';
import n5 from './n5.js';
// [story2] Acts IV and V
import n6 from './n6.js';
import n7 from './n7.js';
import n8 from './n8.js';
import n9 from './n9.js';

for (const night of [n1, n2, n3, n4, n5, n6, n7, n8, n9]) registerNight(night);
