// [polish] Menus speak through the audio system's interface sounds (src/audio/sfxExtra.js, the
// `ui` bus): a soft tick when focus moves, a two-note confirm, a low buzz for "not allowed". The
// menu code still asks for the old names (uiMove / uiSelect / uiBack, which in-game events keep
// using: the gadget wheel, hacking); this map translates them at the one place menus get `sound`.
export const MENU_SOUNDS = Object.freeze({ uiMove: 'uiHover', uiSelect: 'uiConfirm', uiRefuse: 'uiError' });

export function menuSound(play) {
  return (name, opts) => play(MENU_SOUNDS[name] ?? name, opts);
}
