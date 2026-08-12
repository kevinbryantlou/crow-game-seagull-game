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
 * How the player gets from one block to the next is deliberately not decided
 * here — for now `?level=N` selects, and `main.js` is the only thing that reads
 * it.
 *
 * Order is a registry question, not a filename one. The roofline lives in
 * `level2.js` and is level 3: it was built second and it reads as too big a
 * scale leap to follow the block directly, so the park was written to sit
 * between them. Renaming the file would only move the confusion somewhere the
 * git history cannot follow it.
 */

import { buildLevel as buildBlock } from './level.js';
import { buildLevel as buildPark } from './park.js';
import { buildLevel as buildRoofline } from './level2.js';
import { RULES } from './rules.js';

export const LEVELS = [
  {
    id: 1,
    slug: 'the-block',
    build: buildBlock,
    title: 'Small Change',
    district: 'The block',
    /**
     * How the ending screen offers the next block, and what it calls it.
     *
     * `next` is the whole of the progression system for now: finish a block and
     * you are handed the one after it. There is no menu and no saved unlock —
     * a loss offers only a replay, because the rule is that you reach a block by
     * completing the one before it, and holding that rule is what keeps the
     * ending screen honest.
     *
     * `shortName` is the button's noun, lower case because the button composes
     * it ("The park →"). The `title` is no use here: "The Hotel (Outside)" is a
     * headline, not something that fits on a button.
     */
    next: 2,
    shortName: 'the block',
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
     * What the kid pays, in order. A quarter was not worth finding a shiny and
     * carrying it across the block; a dollar is, and the ladder still rewards
     * repeat trades. Per level, because what a trade is worth depends on what it
     * costs to make one.
     */
    tradeValues: [1.00, 1.50, 2.00, 3.00],

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
      /**
       * The last line is the only piece of copy in the game with a job outside
       * the fiction: it has to make you want to do this again, and it has to
       * name the park, because the park is what the button beside it offers.
       *
       * Paid for by cutting "from the top of a war memorial you have no
       * business being on" — the funniest clause here and the most cuttable,
       * because the memorial is behind you at this point and the kid is not.
       */
      won: () =>
        'The last coin lands in the nest and the weight of it goes through you '
        + 'like a held breath let go. Fingers. Shoulders. The ache of standing up.<br><br>'
        + 'Below you a kid is still holding out a bottle cap for a bird that is not there '
        + 'any more. You walk home past the park, and find you know exactly how far it is. '
        + 'Not in blocks. In wingbeats.',
      lost: (total) =>
        `You got to $${total.toFixed(2)}. The sun is off the block now and the `
        + 'shadows have gone violet all the way across the plaza.<br><br>'
        + 'Still a crow. But the fountain is full of coins that nobody is watching, '
        + 'and you have all night.',
    },
  },

  {
    id: 2,
    slug: 'the-park',
    build: buildPark,
    title: 'The Park',
    district: 'The Green',
    next: 3,
    shortName: 'the park',
    /**
     * $25.
     *
     * The rungs matter more than the numbers: $20 on the block, $25 here, $30
     * on the roofline. A quarter more than the block is a step you feel in the
     * last minute of a run and never in the first, which is exactly the size of
     * step this level is for — it is the one that teaches the game has floors,
     * and asking for a harder sum at the same time would be two lessons.
     */
    goal: 25.00,
    sessionSeconds: RULES.sessionSeconds,
    /**
     * Mid-afternoon. The block gets the whole ramp from 0 and the roofline
     * starts at 0.42 with the light already going; the park sits between them,
     * so its lamps catch at 5m12s of an eight-minute day against the block's
     * 5m46s. Same reward structure — finish well and you never see dusk — with
     * half a minute less rope.
     */
    dayStart: 0.20,
    /**
     * On the main path west of the shelter, looking over the pond.
     *
     * It was under the shelter, and the opening frame was four square metres
     * of striped canvas: the shelter is this block's deliberate near-side
     * occluder, and an occluder only fades when it is between the camera and
     * the crow — standing *under* one just fills the screen with it. From here
     * the first thing anybody sees is the water, the free money in it, and the
     * kid sitting on its edge, which is the whole opening lesson.
     */
    spawn: [-8, 0, 9.5],

    tasks: [
      { id: 'dive', text: 'Dive the pond', when: (g) => g.crow.inWater },
      /**
       * Observed rather than banked, because the risk is in the lifting. Get
       * the five off the cooler with three people round it and the task is
       * done; whether you make it to the nest with it is a different problem
       * and the level is happy to let you find that out.
       */
      { id: 'picnic', text: 'Lift the five off the cooler', when: (g) => !!g.crow.carried?.onCooler },
      { id: 'trade', text: 'Trade something shiny' },
      { id: 'cart', text: 'Get the vendor away from his cart' },
      { id: 'ten', text: 'Get the ten' },
    ],
    bankTicks: { bill10: 'ten' },

    teach: {
      money: 'Take it to your nest',
      // Plain words for a place, as always: "pond edge", not "kerb", not
      // "coping". The whole job of this line is to send someone somewhere.
      shiny: 'The kid on the pond edge will trade for that',
      bait: 'A pretzel. Every pigeon here can smell it.',
    },

    /**
     * A little above the block's ladder and a little below the roofline's.
     *
     * A trade here costs a walk across open grass past a picnic that is
     * watching the grass, which is worse odds than the block's empty plaza
     * corner and much better than carrying something up a hotel. Bounded by the
     * rule rather than by taste: unguarded money plus every trade this kid will
     * ever make still cannot reach $25.
     */
    tradeValues: [1.25, 1.75, 2.50, 3.50],

    bait: {
      task: 'cart',
      guard: 'vendor',
      seconds: 12,
      mobFor: 13,
      anchor: (world) => world.cart,
      minDist: 6.5,
      tooClose: 'Too close to the cart',
      onDrop: 'Every pigeon in the park has seen it',
      /**
       * Null, deliberately. The roofline teaches "birds do not use stairs" by
       * failing you for dropping food on the wrong deck; this level has one
       * deck that matters and no business teaching that lesson early. The
       * pavilion roof is somewhere to stand, not somewhere to solve anything.
       */
      deck: null,
    },

    pinToast: 'The five is loose',

    chaseProbes: (w) => [
      ['the pond, north to south', 0, [w.fountain.x, w.fountain.z - 8], [w.fountain.x, w.fountain.z + 8]],
      ['the pond, corner to corner', 0, [-11, -2], [3, 10]],
      ['the picnic, past the cooler', 0, [-23.5, 3.2], [-15.5, 3.2]],
      ['the bandstand', 0, [-17, -9.5], [-17, -1.5]],
      ['the shelter', 0, [-4, 12.6], [8, 12.6]],
      ['the pavilion, end to end', 0, [12, -8], [0, -8]],
      ['the cart', 0, [w.cart.x, w.cart.z - 5], [w.cart.x, w.cart.z + 5]],
    ],

    ending: {
      lostTitle: 'The Gates<span>Close</span>',
      /**
       * The block's ending is about being changed against your will. This one
       * cannot be, because you chose it — you arrived here off a button that
       * said "the park". So the joke is the ending: the curse is over and you
       * are doing this as a pastime.
       *
       * It drops the kid-and-bottle-cap image the other two close on. That
       * callback lands harder at the first and last block for not being in all
       * three, and it pays for the line that has to point at the hotel.
       */
      won: () =>
        'The last coin goes into the nest and the park stops being a map of '
        + 'distances. It is just a park.<br><br>'
        + 'You come back sitting down, on a roof whose door is locked from the '
        + 'inside, with grass stains you cannot account for. Nobody cursed you this '
        + 'time. You did this on purpose, as a hobby, and there is a hotel across '
        + 'town with a roof you have already started thinking about.',
      lost: (total) =>
        `You got to $${total.toFixed(2)}. The keeper has started his last lap and `
        + 'the light through the hedge has gone the colour of a bruise.<br><br>'
        + 'Still a crow. But nobody locks a park, not really, and there are five '
        + 'quarters at the bottom of that pond that have been there since June.',
    },
  },

  {
    id: 3,
    slug: 'the-roofline',
    build: buildRoofline,
    title: 'The Hotel (Outside)',
    district: 'The Vantage',
    /** The last block there is. The ending screen offers only a replay. */
    next: null,
    shortName: 'the hotel',
    /**
     * $30, not $40.
     *
     * The playtest read of this block was "too much of a scale leap from level
     * 1", so it sits at slot 3 with the park between it and the block. The goal
     * has to be above the block's $20 and below the $40 it was first built at:
     * a step on the ladder rather than a doubling. With the park at $25 the
     * ladder now reads 20 / 25 / 30, which is the shape it always wanted.
     */
    goal: 30.00,
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
    spawn: [-2, 0, 11.5],

    tasks: [
      { id: 'dive', text: 'Dive the fountain', when: (g) => g.crow.inWater },
      { id: 'cradle', text: 'Rob the window cleaner', when: (g) => !!g.crow.carried?.inCradle },
      { id: 'trade', text: 'Trade something shiny' },
      { id: 'gulls', text: 'Get the gulls off the terrace' },
      { id: 'twenty', text: 'Get the twenty' },
    ],
    bankTicks: { bill20: 'twenty' },

    /**
     * Half again what the block pays.
     *
     * The kid is sitting on the roof edge in the middle of a working restaurant
     * terrace, between a maître d' and a busser, and every shiny has to be
     * carried up to her past both of them. On the block she is alone in a corner
     * of a plaza and a trade costs a walk. Same verb, much worse odds, so it
     * pays more.
     *
     * Bounded by a rule rather than by taste: unguarded money plus the entire
     * trade ladder still cannot reach the goal, so trading can never be a way to
     * avoid stealing — only a way to soften it.
     */
    tradeValues: [1.50, 2.25, 3.00, 4.00],

    teach: {
      money: 'Take it to your nest',
      // "Parapet" is not a word an American player is going to act on, and the
      // whole job of this line is to send someone to a specific place.
      shiny: 'The kid on the roof edge will trade for that',
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
    chaseProbes: (w) => [
      ['the forecourt, round the fountain', 0, [w.fountain.x, 3.4], [w.fountain.x, 15.0]],
      ['the forecourt, corner to corner', 0, [-25, 3.4], [-8, 15.0]],
      ['the loading end, round the van', 0, [25, 15.2], [25, 9.0]],
      ['the loading end, round the dock', 0, [24, 9.0], [24, 2.6]],
      ['the terrace, through the tables', 5.4, [-19, -0.5], [4, -4]],
      ['the terrace, past the stand', 5.4, [-30, -3.5], [-14, -4]],
      ['the terrace, the far end', 5.4, [20, 0], [20, -10]],
      ['the roof, round the water tank', 9.2, [-26, -7], [-17, -10.5]],
    ],

    ending: {
      lostTitle: 'Last<span>Orders</span>',
      won: () =>
        'The last note lands in the nest at the exact moment the festoon lights come '
        + 'on two floors underneath you.<br><br>'
        + 'You come back all at once — knees first, which is unfair — standing on a '
        + 'water tank lid two and a half metres across, with no way off it that a '
        + 'person can take. Somewhere below, a kid on a terrace is still holding out '
        + 'a marble for a bird that is not there any more.',
      lost: (total) =>
        `You got to $${total.toFixed(2)}. The terrace has gone to candles and the `
        + 'forecourt fountain is lit from underneath and full of other people\'s wishes.'
        + '<br><br>'
        + 'Still a crow. But there is a whole roof up here that nobody comes to after '
        + 'dark, and the gulls have all gone home.',
    },
  },
];

export const getLevel = (id) => LEVELS.find((l) => l.id === Number(id)) || LEVELS[0];
