// [onboard] The one question every trigger point asks: may this hero do `id` right now?
// A hero with no `abilities` (unit tests, tools, anything built without the story) may do
// everything, exactly as before the ability layer existed. game.js gives every player's hero the
// campaign's ability state (src/abilities/abilities.js).
export const can = (hero, id) => !hero?.abilities || hero.abilities.has(id);
