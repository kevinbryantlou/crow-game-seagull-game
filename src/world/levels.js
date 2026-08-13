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
import { buildLevel as buildLobby } from './lobby.js';
import { buildLevel as buildWharf } from './wharf.js';
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
      // "Steal the five from the picnickers", not "lift the five off the cooler".
      // Two fixes in one line: *lift* is British for steal and reads as carrying
      // on this side of the Atlantic, and *the cooler* names an object a player
      // has to already have found. A task line's job is to point at a place on
      // the map, and the picnickers are three people standing together — the
      // most findable thing in the west half of the park.
      { id: 'picnic', text: 'Steal the five from the picnickers', when: (g) => !!g.crow.carried?.onCooler },
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
    /**
     * The lobby, which is this same building through a different door.
     *
     * This one field is the whole unlock change: the ending screen grows a
     * brass button, the Levels screen grows a fourth chip, and `save.js` opens
     * the door — all three read the ladder off `next`, which is the entire
     * reason it is defined in exactly one place.
     */
    next: 4,
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

  {
    id: 4,
    slug: 'the-lobby',
    build: buildLobby,
    title: 'The Hotel (Inside)',
    district: 'The Atrium',
    /**
     * The wharf. This one field is the whole unlock, as it was for the lobby:
     * the ending screen grows a brass button, the Levels screen grows a fifth
     * chip, and save.js opens the door.
     *
     * The winning copy below was written as the game's last ending and it still
     * reads as one — it closes on the room looking back rather than pointing
     * anywhere, and the button under it does the pointing. That is the same
     * reasoning that left the roofline's ending alone when this block arrived.
     */
    next: 5,
    shortName: 'the lobby',
    /**
     * $35.
     *
     * It was built at $40, on the argument that the last block is the inside of
     * a building whose outside asked $30 and the only place in this game where
     * a lot of cash sitting in the open is not a contrivance. That argument was
     * about the fiction. The playtest note was about the run — $40 is too much
     * of an ask — and the run wins, which is what the brief said would happen
     * if it ever came to it.
     *
     * $35 also puts the ladder back on its own pattern: 20 / 25 / 30 / 35, four
     * equal steps, one rung per block. $57.05 exists here, so $35 is 61% of it
     * — the same fraction the *first* block asks for, and deliberately looser
     * than the park's 76%. A room with nowhere to run in it should not also be
     * the tightest sum in the game.
     */
    goal: 35.00,
    sessionSeconds: RULES.sessionSeconds,
    /**
     * The latest start of any block, so the lamps catch at 3m01s against the
     * roofline's 4m08s and the block's 5m46s. This is the first level where
     * most players finish in artificial light, which is the honest reading of
     * walking into a hotel lobby at six in the evening — and it makes the
     * chandelier catching this block's event, the way the street lights are
     * the block's.
     */
    dayStart: 0.55,
    /**
     * Near the lounge, looking back across the room.
     *
     * The opening frame has to carry the whole level in one picture: the
     * fountain and its free money, the kid on the luggage, the front desk
     * behind them, and — because the camera lifts as the crow climbs — the
     * chandelier with the nest in it directly over the middle of all three.
     */
    spawn: [7, 0, 5],

    tasks: [
      { id: 'dive', text: 'Dive the lobby fountain', when: (g) => g.crow.inWater },
      /**
       * Observed rather than banked, like the park's cooler: the risk is in the
       * lifting. Shove the bell, take the tip off the desk with the clerk on
       * the other side of it, and the task is done — whether you get it up to
       * the chandelier is a separate problem and the level is happy to let you
       * find that out.
       */
      { id: 'bell', text: 'Get the tip out from under the bell', when: (g) => !!g.crow.carried?.underBell },
      { id: 'trade', text: 'Trade something shiny' },
      { id: 'desk', text: 'Get the concierge away from the desk' },
      { id: 'twenty', text: 'Get the twenty' },
    ],
    bankTicks: { bill20: 'twenty' },

    teach: {
      money: 'Take it to your nest',
      // Plain words for a place, and American ones: "the kid on the suitcase"
      // is a person you can find from the back of the room without translating
      // anything first.
      shiny: 'The kid on the suitcase will trade for that',
      bait: 'A croissant. The pigeons in here got in the same way you did.',
    },

    /**
     * A rung above the roofline's.
     *
     * She is the easiest kid in the game to *reach* — she is sitting in the
     * middle of an open floor — and that floor is the worst place in the game
     * to be standing still: there is no cover on it, the bellhop laps it, and
     * somebody crosses it every twenty seconds. Bounded by the rule rather
     * than by taste: unguarded money plus every trade she will ever make is
     * $19.40 against $35, so trading can soften this block by rather more than
     * half and can never finish it.
     */
    tradeValues: [2.00, 3.00, 4.00, 5.00],

    bait: {
      task: 'desk',
      guard: 'concierge',
      seconds: 12,
      mobFor: 13,
      anchor: (world) => world.desk,
      minDist: 8,
      tooClose: 'Too near the desk',
      onDrop: 'Every pigeon in the atrium has seen it',
      /**
       * The floor, and the mezzanine is the wrong answer. The roofline teaches
       * "birds do not use stairs" with a failure rather than a toast; this
       * block is late enough to assume it, and the gallery is exactly the place
       * a player will try it.
       */
      deck: 0,
      wrongDeck: 'Not from up here',
    },

    pinToast: 'The tip is loose',

    /**
     * One room, so every probe but the last is on the same floor as every
     * other — which is the point of the level and the reason this list is
     * longer than the park's. The two that matter are the ones that start
     * *behind* something: a clerk in the alley behind a twelve-metre desk and a
     * bartender in a 1.65 m gap have to be able to get out, or they are
     * scenery.
     */
    chaseProbes: (w) => [
      ['the fountain, back to front', 0, [w.fountain.x, w.fountain.z - 7], [w.fountain.x, w.fountain.z + 8]],
      ['the fountain, corner to corner', 0, [-5, -3], [9, 7]],
      ['the desk, end to end', 0, [-17, -4.4], [-2, -4.4]],
      ['behind the desk, out through the gap', 0, [-7, -7.6], [-8, -3]],
      ['the bar, out of the alley', 0, [w.bar.x, -6.3], [w.bar.x, -1]],
      ['the lounge, through the chairs', 0, [8, 9], [19, 3]],
      ['the west end, round the luggage', 0, [-20, 9], [-15, 2]],
      ['the columns, straight across', 0, [-13, 3], [13, 3]],
      ['the gallery, end to end', 4.4, [-17, -8.4], [15, -8.4]],
    ],

    ending: {
      lostTitle: 'Check<span>Out</span>',
      /**
       * The last ending in the game, so it closes rather than points. The other
       * three all end on where you are standing; this one ends on the room
       * looking back, which is the only thing this block has that the others do
       * not — everybody is already here.
       */
      won: () =>
        'The last bill goes into the nest and the clock under you says ten past ten, '
        + 'which is what it has said all afternoon.<br><br>'
        + 'You come back twenty-three feet over a marble floor, standing on the cornice '
        + 'of a hotel clock in a hotel you are not a '
        + 'guest of, with a nest full of somebody else\'s money at your elbow and every '
        + 'face in the room turning up toward you. Every face but one. Down at the front '
        + 'of it all a kid is still holding a room key out at knee height, waiting for a '
        + 'bird that is not there any more.',
      lost: (total) =>
        `You got to $${total.toFixed(2)}. The lamps on the clock came on an hour ago `
        + 'and the bell captain has started looking up.<br><br>'
        + 'Still a crow. But nobody in a hotel lobby ever looks up for long, and there '
        + 'is a nest full of other people\'s change twenty-three feet over the check-in '
        + 'line.',
    },
  },
  {
    id: 5,
    slug: 'the-wharf',
    build: buildWharf,
    title: 'The Wharf',
    district: 'The Landing',
    /** The last block there is. The ending screen offers only a replay. */
    next: null,
    shortName: 'the wharf',
    /**
     * $40, and the ladder's honest fifth term.
     *
     * The lobby was built at $40 and came down to $35 on a playtest note about
     * the run, so this number needs an argument rather than a pattern. The
     * argument is that the lobby's $40 failed for a reason this block does not
     * have: one room with nowhere else to work, so a hot desk means waiting,
     * and waiting at $40 grinds. The wharf has four separate pitches — the
     * market, the ice house, the office window, the boat — plus $8.50 out on
     * the water that nobody guards at all. There is always something else to be
     * doing, which is the property that makes a bigger number survivable.
     *
     * $64.20 exists here, so $40 is 62% of it: looser than the park's 76%, a
     * shade tighter than the block's and the lobby's 61%. If it grinds, it will
     * grind because a round trip to the beacon is longer than a climb to a
     * chandelier and you pay it on every bank — which is the counter-argument,
     * and it is one line to reverse.
     */
    goal: 40.00,
    sessionSeconds: RULES.sessionSeconds,
    /**
     * The latest start of any block, so the lamps catch at 2m40s against the
     * lobby's 3m01s and the roofline's 4m08s. One more rung and a small one:
     * there is not much afternoon left to spend.
     *
     * It is also the only block where the light that comes on is a thing you
     * stand on. The street lamps are level 1's event and the chandelier was the
     * lobby's; here it is the harbour light, which is the one object in this
     * game whose actual job is to catch at dusk.
     */
    dayStart: 0.58,
    /**
     * On the quay east of the market, looking out over the water.
     *
     * The opening frame has to carry the block in one picture, and this one
     * does: the harbour, the boats on it, the beacon with the nest standing in
     * open water, the kid on her crate at the water's edge, and the market off
     * to the west with a twenty on the counter. What it does not show is any
     * way to walk to the middle of it, which is the point.
     */
    spawn: [6, 0, 10],

    tasks: [
      { id: 'dive', text: 'Dive the harbor', when: (g) => g.crow.inWater },
      /**
       * The block's teaching line, and it is doing the most work of any task
       * text in the game. It names a place you can see from the spawn, and the
       * only way to obey it is to fly out over water — so the level's whole
       * thesis arrives as a chore rather than as a toast.
       *
       * Observed rather than banked, like the park's cooler and the lobby's
       * bell: the risk is in the getting there. Whether you make it back to the
       * beacon carrying it is a separate problem and the level is happy to let
       * you find that out.
       */
      { id: 'piling', text: 'Get the five off the far pilings', when: (g) => !!g.crow.carried?.onPiling },
      { id: 'trade', text: 'Trade something shiny' },
      { id: 'counter', text: 'Get the fishmonger away from his counter' },
      { id: 'twenty', text: 'Get the twenty' },
    ],
    bankTicks: { bill20: 'twenty' },

    teach: {
      money: 'Take it to your nest',
      // Plain words for a place. "Crate" is a shape you can pick out of a
      // frame; "quay" is a word that sends an American player to a dictionary,
      // which is why it appears in the source and in no line a player reads.
      shiny: 'The kid on the crate will trade for that',
      bait: 'A mackerel. Every gull on this pier is already looking at you.',
    },

    /**
     * A rung above the lobby's.
     *
     * She is easy to reach — she is on a crate in the middle of an open quay
     * and nobody owns the ground around her. What she costs is that two of the
     * four shinies are out over the water, on the east float and the wheelhouse
     * roof, so half her ladder is paid for in this block's own currency.
     *
     * Bounded by the rule rather than by taste: unguarded money plus every
     * trade she will ever make is $27.50 against $40, so trading can soften
     * this block by more than half and can never finish it.
     */
    tradeValues: [2.00, 3.00, 4.50, 5.50],

    bait: {
      task: 'counter',
      guard: 'monger',
      seconds: 12,
      mobFor: 13,
      anchor: (world) => world.cart,
      minDist: 8,
      tooClose: 'Too near the counter',
      onDrop: 'Every gull on the wharf has seen it',
      /**
       * The quay, and out on the water is the wrong answer.
       *
       * The roofline teaches "birds do not use stairs" with a failure rather
       * than a toast, and this block is late enough to assume the lesson. The
       * reading here is the only one the fiction allows: the water is already
       * the gulls', so a fish dropped out there is lunch and nobody's problem.
       * It has to land on his floor before he has to deal with it.
       */
      deck: 0,
      wrongDeck: 'Not from out on the water',
    },

    pinToast: 'The five is loose',

    /**
     * Four decks' worth. The two that matter are the last two: a skipper on a
     * seven-metre deck and a crow on a three-metre gallery are both standing on
     * islands, and a guard who cannot get round his own wheelhouse is scenery.
     */
    chaseProbes: (w) => [
      ['the quay, end to end', 0, [-27, 6.5], [27, 6.5]],
      ['the market, round the counter', 0, [-20, 10.5], [-8, 10.5]],
      ['the market, past the cutting table', 0, [-19, 5.0], [-9.5, 6.6]],
      ['the ice house, round the back', 0, [4, 10.0], [12, 3.0]],
      ['the office, round the corner', 0, [16, 8.5], [24, 2.0]],
      ['the hoist and the west end', 0, [-28, 9.5], [-22, 1.5]],
      ['the crab pots, along the kerb', 0, [12, 13.0], [21, 12.5]],
      ['the boat, round the wheelhouse', 1.15, [-3.0, -5.0], [3.0, -5.0]],
    ],

    ending: {
      lostTitle: 'The Tide<span>Turns</span>',
      /**
       * The game's last ending, so it closes rather than points — and the thing
       * it closes on is the joke the whole project is built out of. This game
       * exists because a "would you rather" offered a crow with twenty dollars
       * or a seagull with forty fries, and the crow was chosen because $20 is a
       * value ladder and 40 fries is 40 identical pickups. Five blocks later
       * you are standing on a harbour light on a dock that belongs to gulls.
       */
      won: () =>
        'The last bill goes into the nest and the lamp comes on under your feet, once, '
        + 'and then again, and the whole harbour turns amber and back.<br><br>'
        + 'You come back six metres over open water with no way down that a person can '
        + 'take, and every boat in the basin between you and the dock. On the rail below '
        + 'you a gull has not moved in an hour. It has been watching you all afternoon the '
        + 'way you would watch somebody who took the other option, and got away with it.',
      lost: (total) =>
        `You got to $${total.toFixed(2)}. The market has hosed down its boards and the `
        + 'water has gone the colour of a bruise all the way to the breakwater.<br><br>'
        + 'Still a crow. But the lamp out there runs all night whether anybody is watching '
        + 'or not, and there is a five on a post that nobody has come back for since June.',
    },
  },
];

export const getLevel = (id) => LEVELS.find((l) => l.id === Number(id)) || LEVELS[0];
