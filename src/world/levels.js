/**
 * The levels, and everything about a level that is not geometry.
 *
 * A block used to be a `buildLevel()` and a pile of assumptions in main.js: the
 * goal was a constant, the task list was a literal, the two teaching toasts were
 * strings inside `_doAction`, and the ending copy was an if/else in `_finish`.
 * None of that was wrong while there was one block. All of it is level data.
 *
 * The rule for what belongs here: if a second block would need a different one,
 * it is level data. If both blocks need the same one, it is in world/rules.js.
 *
 * How the player gets from one to the other is deliberately not decided here —
 * for now `?level=2` selects, and `main.js` is the only thing that reads it.
 */

import { buildLevel as buildBlock } from './level.js';
import { buildLevel as buildRoofline } from './level2.js';
import { RULES } from './rules.js';

export const LEVELS = [
  {
    id: 1,
    slug: 'the-block',
    build: buildBlock,
    title: 'Small Change',
    district: 'The block',
    goal: 20.00,
    sessionSeconds: RULES.sessionSeconds,
    /**
     * Where in the day this block starts, 0 = early afternoon, 1 = the light
     * going. The block starts at the beginning of the afternoon and gets the
     * whole ramp.
     */
    dayStart: 0,
    spawn: [-24, 0, 6],

    tasks: [
      { id: 'dive', text: 'Dive for the wishing coins', when: (g) => g.crow.inWater },
      { id: 'jar', text: 'Rob the tip jar', when: (g) => !!g.crow.carried?.inJar },
      { id: 'trade', text: 'Trade something shiny' },
      { id: 'cart', text: 'Make the vendor leave his cart' },
      { id: 'ten', text: 'Get the ten' },
    ],
    /** Banking one of these ticks the task named. */
    bankTicks: { bill10: 'ten' },

    teach: {
      money: 'Take it to your nest',
      shiny: 'The kid on the bench will trade for that',
      bait: 'A hot dog',
    },

    /**
     * The distraction set piece. Drop the bait far enough from what it guards
     * and the birds mob it and the guard goes to deal with them.
     */
    bait: {
      task: 'cart',
      guard: 'vendor',
      seconds: 12,
      mobFor: 13,
      /** Measured from here — the thing the guard would otherwise be standing over. */
      anchor: (world) => world.cart,
      minDist: 6.5,
      tooClose: 'Too close to the cart',
      onDrop: 'The pigeons have found it',
      /** Bait only works on the deck it lands on; the block has one. */
      deck: null,
    },

    pinToast: 'The bill is loose',

    /**
     * Journeys a chase has to be able to make. SHOOING steers straight at the
     * crow and the crow can stand behind whatever it likes, so every large solid
     * needs a way round it — and that cannot be authored, it has to be pathing.
     * `[label, deck, from, to]`.
     */
    chaseProbes: (w) => [
      ['the fountain, north to south', 0, [w.fountain.x, w.fountain.z - 9], [w.fountain.x, w.fountain.z + 9]],
      ['the fountain, corner to corner', 0, [w.fountain.x - 7, w.fountain.z - 7], [w.fountain.x + 7, w.fountain.z + 7]],
      ['the memorial', 0, [w.nest.x, w.nest.z - 5.5], [w.nest.x, w.nest.z + 5.5]],
      ['the newsstand', 0, [11, 11], [11, 4]],
      ['the café tables', 0, [-8, 2], [8, 10]],
      ['the hot dog cart', 0, [w.cart.x, w.cart.z - 5], [w.cart.x, w.cart.z + 5]],
    ],

    ending: {
      lostTitle: 'The Light<span>Goes</span>',
      won: () =>
        'The last coin lands in the nest and the weight of it goes through you '
        + 'like a held breath let go. Fingers. Shoulders. The ache of standing up.<br><br>'
        + 'The first thing you see, from the top of a war memorial you have no business being on, '
        + 'is a kid on a bench — still holding out a bottle cap, for a bird that is not there any more.',
      lost: (total) =>
        `You got to $${total.toFixed(2)}. The sun is off the block now and the `
        + 'shadows have gone violet all the way across the plaza.<br><br>'
        + 'Still a crow. But the fountain is full of coins that nobody is watching, '
        + 'and you have all night.',
    },
  },

  {
    id: 2,
    slug: 'the-roofline',
    build: buildRoofline,
    title: 'Second Storey',
    district: 'The Vantage Hotel',
    goal: 40.00,
    sessionSeconds: RULES.sessionSeconds,
    /**
     * The roofline starts in the late afternoon and gets the back 58% of the
     * ramp. Same eight minutes, less daylight in them: the lamps catch at 4m08s
     * here against 5m46s on the block, so the sunset arrives while you are still
     * working rather than as a reward for being slow.
     *
     * It is also the honest reading of where the level sits — you are on a hotel
     * roof at the hour a hotel roof gets busy.
     */
    dayStart: 0.42,
    spawn: [-1, 0, 9.5],

    tasks: [
      { id: 'dive', text: 'Dive the plunge pool', when: (g) => g.crow.inWater },
      { id: 'cradle', text: 'Rob the window cleaner', when: (g) => !!g.crow.carried?.inCradle },
      { id: 'trade', text: 'Trade something shiny' },
      { id: 'gulls', text: 'Get the gulls off the terrace' },
      { id: 'twenty', text: 'Get the twenty' },
    ],
    bankTicks: { bill20: 'twenty' },

    teach: {
      money: 'Take it to your nest',
      shiny: 'The kid on the fire escape will trade for that',
      bait: 'Chips. Gulls like chips.',
    },

    bait: {
      task: 'gulls',
      guard: 'maitre',
      seconds: 12,
      mobFor: 13,
      anchor: (world) => ({ x: -15.5, z: -3.5 }),   // the maître d's stand
      minDist: 8,
      tooClose: 'Still too near the stand',
      onDrop: 'Every gull on the roof has seen it',
      /**
       * Birds do not use stairs, and this is the one rule the level teaches with
       * a failure rather than a toast: drop the chips in the yard and the yard
       * pigeons get a meal while the terrace carries on exactly as it was.
       */
      deck: 5.4,
      wrongDeck: 'Not from down here',
    },

    pinToast: 'The check is loose',

    /**
     * Three decks' worth, because a chase happens on whichever floor it starts
     * on and each of them has something big in the middle of it: a van, a pool,
     * a water tank.
     */
    chaseProbes: () => [
      ['the yard, round the van', 0, [9, 14], [9, 6]],
      ['the yard, round the loading dock', 0, [-18, 10], [-18, 2.5]],
      ['the yard, bins to the middle', 0, [-2, 14], [6, 9]],
      ['the terrace, round the plunge pool', 5.4, [13, 0], [13, -10]],
      ['the terrace, through the tables', 5.4, [-12, -0.5], [6, -4]],
      ["the terrace, past the stand", 5.4, [-22.5, -3.5], [-8, -4]],
      ['the roof, round the water tank', 9.2, [-20, -7], [-11, -10.5]],
    ],

    ending: {
      lostTitle: 'Last<span>Orders</span>',
      won: () =>
        'Forty dollars, in a nest, on top of a water tank, at the exact moment the '
        + 'festoon lights come on underneath you.<br><br>'
        + 'You come back all at once — knees first, which is unfair — standing on a lid '
        + 'two and a half metres across with no way off it that a person can take. '
        + 'The window cleaner has been up here all afternoon. He has questions.',
      lost: (total) =>
        `You got to $${total.toFixed(2)}. The terrace has gone to candles and the yard `
        + 'below has gone to nothing at all.<br><br>'
        + 'Still a crow. But there is a whole roof up here that nobody comes to after '
        + 'dark, and the gulls have all gone home.',
    },
  },
];

export const getLevel = (id) => LEVELS.find((l) => l.id === Number(id)) || LEVELS[0];
