// Cutscene pages. `stage.shot(...)` renders the live city from a posed camera into a panel image.
import { jokerTV, jokerCard, titleCard } from '../ui/comicArt.js';

const J = (text, x = 50, y = 5, extra = {}) => ({ text, x, y, joker: true, ...extra });

export const SCENES = {
  intro: (stage) => [
    {
      panels: [
        { span: 'wide', img: stage.shot({ cam: [34, 74, 70], look: [-30, 30, -70] }), caption: 'Gotham City, an hour before midnight. The rain has not let up in three days.' },
        { img: stage.shot({ cam: [-5, 44.2, -2], look: [-12, 43.6, -12], hero: null }), caption: 'Then the Batsignal flickers, and for a moment the light on the clouds is not a bat anymore. It is a grin.', captionPos: 'bottom' },
        { img: jokerTV('grin'), balloons: [J("Good evening, Gotham! Tonight's program is brought to you by... ME! HA HA HA!", 50, 5, { w: 80 })] },
        { span: 'wide', img: jokerTV('smug'), balloons: [J("I borrowed Wayne Tech's finest toys, the airwaves, and all the Smilex one city can hold. Come and get them, Bats! HA HA HA!", 50, 5, { w: 70 })] },
      ],
    },
    {
      layout: 'single',
      panels: [{ span: 'full', img: stage.shot({ cam: [3.2, 42.8, 23], look: [-4, 47, 8], fov: 50, hero: { at: [0.5, 42, 17.5], yaw: -2.7, anim: 'Idle_Loop' } }), caption: 'Gotham needs Batman. Midnight is coming, and the Joker has a head start.', captionPos: 'bottom' }],
    },
  ],

  // Act title cards: a plain, big comic panel between chapters, reusing titleCard().
  actOne: () => [{ layout: 'single', panels: [{ span: 'full', img: titleCard('ACT ONE: THE STOLEN SHIPMENT', 'The Docks and Neon Row') }] }],
  actTwo: () => [{ layout: 'single', panels: [{ span: 'full', img: titleCard('ACT TWO: ACE CHEMICALS', 'Follow the smell of bitter almonds') }] }],
  actThree: () => [{ layout: 'single', panels: [{ span: 'full', img: titleCard('ACT THREE: THE CLOCK PLAZA', 'Hostages, a funhouse, and the Joker') }] }],

  card: (stage) => [
    {
      layout: 'duo',
      panels: [
        { img: stage.shot({ cam: [-5.6, 44.8, -5.2], look: [-12, 43.4, -12], hero: { at: [-9.4, 42, -8.2], yaw: -2.35, anim: 'Interact' } }), caption: 'A playing card, taped to the lamp.' },
        { img: jokerCard() },
      ],
    },
  ],

  crates: (stage) => [
    {
      layout: 'duo',
      panels: [
        { img: stage.shot({ cam: [-40.5, 10.9, 236.5], look: [-44, 9.7, 232], hero: { at: [-42.6, 9, 233.6], yaw: -2.4, anim: 'Yes' } }), caption: 'The Wayne Tech crates: secured. Every seal still unbroken.' },
        { img: jokerTV('smug'), balloons: [J('Lucky break, Batsy! But you will never find my little BROADCAST. It is somewhere very... neon.', 50, 5, { w: 78 })] },
      ],
    },
  ],

  rig: (stage) => [
    {
      layout: 'trio',
      panels: [
        { img: stage.shot({ cam: [182.5, 24.2, -58], look: [186, 22.9, -66], hero: { at: [184.4, 22, -62.5], yaw: 2.9, anim: 'Interact', time: 1.2 } }), caption: 'The broadcast is dead. The transmitter is in pieces.' },
        { img: stage.shot({ cam: [150, 2.5, 24], look: [150, 9, 62] }), caption: 'Neon Row lights up again, one sign at a time.', captionPos: 'bottom' },
        { img: jokerTV('angry'), balloons: [J('Fine, keep the toys! The ANTIDOTE stays with me!', 50, 5, { w: 80 })] },
      ],
    },
  ],

  antidote: (stage) => [
    {
      layout: 'duo',
      panels: [
        { img: stage.shot({ cam: [180.8, 11.6, -107.6], look: [184, 10.8, -112], hero: { at: [182, 10, -109.8], yaw: 2.4, anim: 'Yes' } }), caption: 'The antidote survived. Barely.' },
        { img: jokerTV('angry'), balloons: [J('ENOUGH! The clock tower. Midnight. Let us finish this with a BANG!', 50, 5, { w: 78 })] },
      ],
    },
  ],

  bossIntro: (stage) => [
    {
      layout: 'duo',
      panels: [
        { img: stage.shot({ cam: [-66, 70.4, -153.5], look: [-62, 68.8, -162], fov: 50, hero: { at: [-63.5, 58, -148], yaw: Math.PI, anim: 'Idle_Loop' }, setup: (s) => s.boss.pose([-62, 68, -161.45], 0, 'Idle_Rail_Call', 0.8) }), caption: 'The clock tower. One minute to midnight.' },
        { img: stage.shot({ cam: [-59.4, 69.9, -157.6], look: [-62.1, 69.2, -161.3], hero: null, setup: (s) => s.boss.pose([-62, 68, -161.45], 0.3, 'Idle_Rail_Call', 1.4) }), balloons: [J('Welcome to the show, Batsy! Games first. Mercy never. HA HA HA!', 59, 5, { w: 80 })] },
      ],
    },
  ],

  bossEnd: (stage) => [
    {
      layout: 'duo',
      panels: [
        { img: stage.shot({ cam: [-58, 59.8, -146], look: [-62, 58.4, -152], hero: { at: [-61, 58, -149.5], yaw: Math.PI, anim: 'Idle_Loop' }, setup: (s) => s.boss.pose([-62, 58, -153.5], 0, 'Death01', 3) }), caption: 'The Joker is done laughing. For tonight.' },
        { img: jokerTV('smug'), balloons: [J('Okay, okay, you win! The antidote is safe, the city is breathing, and... the joke was on me, Bats. For tonight. HA HA HA.', 50, 5, { w: 84 })] },
      ],
    },
  ],

  death: () => [
    { layout: 'single', panels: [{ span: 'full', img: titleCard('GET UP!', 'Gotham is still waiting.') }] },
  ],
};
