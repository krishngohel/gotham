// [onboard] progress.abilities: unlocked ids beyond what the story derives, and practice counts.
// An old save loads with the default; its abilities come from its story progress
// (src/abilities/abilities.js deriveUnlocked).
import { registerProgressField } from '../core/save.js';
import { sanitizeAbilitySave, ABILITY_SAVE_DEFAULT } from './abilities.js';

registerProgressField('abilities', { sanitize: sanitizeAbilitySave, fresh: { unlocked: [...ABILITY_SAVE_DEFAULT.unlocked], practised: {} } });
