/**
 * LEVEL 2 — The Park.
 *
 * The step between the block and the roofline, and it is deliberately a small
 * one. Level 1 is flat and level 3 is a four-deck climb; the playtest read of
 * going straight from one to the other was "too big a scale leap to follow the
 * block". So the park adds exactly one new thing — a roof you can stand on —
 * and spends the rest of its budget on people rather than on altitude.
 *
 * There are two decks: the grass, and the pavilion roof at 3.4 with the nest on
 * the vent housing above it. That is the whole vertical story. Everything else
 * the level asks for, level 1 already taught: fly, take one thing, bank it,
 * distract a guard with food, trade a shiny with a kid.
 *
 * What is new is *social* pressure instead of architectural pressure. The
 * block's guards each stand over their own pitch, one guard per district, and
 * you can always work the district next door. The park's marquee is three
 * people standing round one cooler with ten dollars between them: two of them
 * own something, the third is a body in the way, and there is no angle on the
 * cooler that is not inside somebody's cone. High risk for a third of the goal
 * in one place — see docs/park-brief.html §3.
 *
 * Returns geometry plus the collision, pickup and NPC data the sim needs.
 */

import * as THREE from 'three';
import { PAL } from '../render/palette.js';
import { box, cyl, cone, ico, plane, at, group, mat } from '../render/shapes.js';
import { NightLights } from '../render/nightlights.js';
import { makeKit } from './kit.js';
import { RULES } from './rules.js';

/**
 * Level 1's footprint, near enough. The roofline is ±32 because a hotel wants
 * sixty-four metres of frontage; a park does not want anything, and matching
 * the block is the point — this level is a step, not a leap.
 */
export const BOUNDS = { minX: -30, maxX: 30, minZ: -14, maxZ: 15 };

/**
 * Two floors, and the only heights in this file anything else needs.
 *
 * 3.4 is chosen against RULES.maxUnbrokenClimb (9) with a lot of room, because
 * this is the level where a player finds out the game has a y axis at all. The
 * roof is reachable from a standing start on a bar that is mostly empty, and
 * the nest sits 1.35 above it — so the last hop happens somewhere you can
 * already stand.
 */
export const DECK = { ground: 0, roof: 3.4 };

const POND = { x: -4, z: 4, r: 4.2 };
/** The cooler the picnic stands round, and the level's whole argument. */
const COOLER = { x: -19.6, z: 3.2 };
const BANDSTAND = { x: -17, z: -5.5 };
const SHELTER = { x: 2, z: 12.6 };
const PAVILION = { x: 6, z: -8 };
const CART = { x: 20, z: -1 };
/**
 * Where the kid sits: on the pond kerb, feet over the grass.
 *
 * On the near-west arc, at 118° round from due east, and neither number is
 * decoration.
 *
 * Near, because she was first put on the far side of the water, which is
 * correct in plan and useless on screen: from a camera that never moves, the
 * pond's own 0.62m wall stands between it and anybody sitting behind it, so she
 * rendered as a tan head above a tan kerb in front of a tan path. Round here
 * the water is behind her instead of in front, and a small figure against teal
 * is a small figure you can see.
 *
 * West, because the picnic shelter is this block's deliberate near-side
 * occluder and it only fades when it is on the one ray between the camera and
 * the crow — which is most of the time and not all of it. Trading is core loop.
 * It does not go behind the thing whose job is to be in the way.
 */
const KID_ANGLE = (118 * Math.PI) / 180;
const KID = {
  x: -4 + Math.cos(KID_ANGLE) * 4.05,
  z: 4 + Math.sin(KID_ANGLE) * 4.05,
};

export function buildLevel() {
  const root = new THREE.Group();
  const colliders = [];
  const occluders = [];
  const perches = [];
  const night = new NightLights(RULES.lampsOnAt);

  const kit = makeKit({ root, colliders, occluders, perches, night });
  const {
    solid, perch, addDecal, addTree, addPlanter, addBench, addLamp, addBin,
    addSkyline, makeNest, addPool,
  } = kit;

  // ── the grass ─────────────────────────────────────────────────────────────
  /**
   * PAL.lawn, which exists because of this line.
   *
   * The grass was first painted in the tree greens — the obvious choice, and
   * wrong twice: it took the dusk median to 35 against a floor of 48 and it
   * turned the whole frame neutral, because saturated green swallows the
   * violet sky fill that every other block's shadows are made of. See the note
   * on PAL.lawn. The trees kept the leaf green, which is the only reason they
   * still read as trees standing on something.
   */
  const ground = plane(150, 96, PAL.lawn, { receive: true });
  root.add(ground);

  // Mown stripes. Five bands the width of the park, each on its own height —
  // see `addDecal` in world/kit.js for why that matters. Barely a step darker
  // than the lawn, on purpose: at the first attempt they were a leaf-green band
  // on a leaf-green field and read at dusk as five black stripes across the
  // one surface the whole level is navigated over.
  for (let i = 0; i < 5; i++) addDecal(0, -10 + i * 6, 140, 3.0, PAL.lawnMid);

  /**
   * The paths, in PAL.stone rather than PAL.paving, and wider than first drawn.
   *
   * Paving is the block's pavement colour and it is nearly the same value as a
   * lawn once the afternoon key has finished with both of them: the first pass
   * rendered a park whose paths were invisible, which on a level navigated
   * entirely by "follow the path to the next district" is not a look, it is a
   * missing feature. Pale gravel separates from green at every hour of the day
   * and is the brightest large surface here, which is also most of where the
   * dusk median comes from.
   *
   * Overlapping on purpose: a park path that stops where another one starts is
   * a diagram, not a park.
   */
  // The promenade, three spurs off it, and a back walk linking the bandstand to
  // the pavilion to the cart. Six paths rather than the three this started
  // with, because three was not a network: both dusk samples looked out over
  // unbroken lawn and measured two points under the median floor, and a park
  // where you cannot walk from the bandstand to the refreshments without
  // crossing the grass is not a park anyone has been to.
  addDecal(0, 8.5, 140, 3.4, PAL.stone);
  addDecal(-17, 1.5, 3.0, 16, PAL.stone);
  addDecal(6, -1, 3.0, 20, PAL.stone);
  addDecal(-24, 3.5, 3.0, 13, PAL.stone);
  addDecal(-5, -3, 26, 3.0, PAL.stone);
  addDecal(14, -3, 14, 3.0, PAL.stone);
  addDecal(24, 6.5, 3.0, 13, PAL.stone);
  addDecal(2, 11.5, 3.4, 7, PAL.stone);
  // Two gate walks up from the street. A park has entrances, and the strip
  // between the promenade and the kerb was eight metres of lawn no lamp reached
  // — a third of the west frame at dusk, and the last two points of median.
  addDecal(-21, 12.5, 4.4, 8, PAL.stone);
  addDecal(14, 12.5, 4.4, 8, PAL.stone);
  addDecal(POND.x, POND.z, 13, 12, PAL.stoneMid);
  addDecal(CART.x, CART.z + 1.5, 13, 9, PAL.stoneMid);
  addDecal(PAVILION.x, PAVILION.z + 3.4, 12, 4.5, PAL.stoneMid);

  // Kerb along the near edge, so the park stops somewhere. Narrow, and no
  // darker than the paving: a wide dark band across the foreground is a third
  // of the frame no lamp reaches, which cost level 3 eleven points of median.
  {
    // Paving, not pavingMid. The road runs the whole width across the bottom of
    // every frame, and at pavingMid it measured *darker than the lawn* — which
    // is the roofline's "black river in front of the kerb" arriving from the
    // other direction. The kerb still reads, because a kerb reads by being a
    // lit edge above a surface rather than by being a lighter colour than it.
    addDecal(0, 19, 150, 5, PAL.paving);
    const kerb = box(150, 0.34, 1.2, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    kerb.position.set(0, 0.17, 16.2);
    root.add(kerb);
    solid(0, 16.2, 150, 1.2, 0.34, 0, { tag: 'edge-kerb' });
  }

  // ── the park railing, along the back ──────────────────────────────────────
  // A hedge with iron in it. It is what makes the far side a boundary rather
  // than the grass simply running out, and it is the reason the skyline reads
  // as "the city, outside" instead of "buildings in a field".
  {
    const hedge = box(140, 1.3, 1.6, PAL.canopy, { up: PAL.canopyLit, down: PAL.canopyShade });
    hedge.position.set(0, 0.65, -12.8);
    root.add(hedge);
    for (let x = -68; x <= 68; x += 2.4) {
      root.add(at(cyl(0.035, 0.035, 1.9, 4, PAL.steelDark), x, 0.95, -11.9));
    }
    const top = box(140, 0.07, 0.07, PAL.steelDark, { shadow: false });
    top.position.set(0, 1.86, -11.9);
    root.add(top);
    solid(0, -12.5, 140, 2.4, 1.4);
  }

  // ── backdrop skyline ──────────────────────────────────────────────────────
  addSkyline([
    [13, 24, PAL.stoneMid], [16, 19, PAL.terracotta], [11, 27, PAL.bark],
    [14, 22, PAL.stoneMid], [12, 18, PAL.terracotta], [15, 25, PAL.stoneMid],
  ], -24, { startX: -48 });
  solid(0, -20, 150, 10, 24);

  // Invisible bounds so the crow cannot leave the park.
  solid(BOUNDS.minX - 2, 0, 4, 96, 28, 0, { perch: false });
  solid(BOUNDS.maxX + 2, 0, 4, 96, 28, 0, { perch: false });
  solid(0, BOUNDS.maxZ + 2.5, 150, 4, 28, 0, { perch: false });

  // ══════════════════════════════════════════════════════════════════════════
  // THE POND — the level's free money, and the only place it is safe
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * No centrepiece, on purpose.
   *
   * Both other blocks put an ornament in the middle of their water and both
   * paid for it: level 3's 2.3m stem eats the sightline of anything sitting on
   * the far side of a 3.2m basin, which is why its wishing coins ended up in an
   * arc rather than a ring. A duck pond wants a flat sheet of water anyway, and
   * a flat sheet means the coins can go anywhere and the rule that catches
   * hidden pickups has nothing to catch.
   */
  const POOL = addPool(POND.x, POND.z, POND.r, DECK.ground, {
    tag: 'pond-rim', stone: PAL.stoneMid, coping: PAL.stone, lining: PAL.pavingMid,
  });
  const FOUNTAIN = POOL.spec;
  root.userData.fountainWater = POOL.water;
  {
    // Lily pads: flat discs on the surface, kept off the coins' sightlines. Two
    // centimetres thick, which is enough to read at this camera and not enough
    // to hide anything.
    for (const [deg, r, size] of [[55, 2.3, 0.42], [118, 2.7, 0.34], [252, 2.1, 0.38], [345, 2.5, 0.30]]) {
      const a = (deg * Math.PI) / 180;
      const pad = cyl(size, size, 0.02, 7, PAL.canopy, { up: PAL.canopyLit, down: PAL.canopyShade, shadow: false });
      pad.position.set(POND.x + Math.cos(a) * r, FOUNTAIN.rim - 0.18, POND.z + Math.sin(a) * r);
      root.add(pad);
    }
    perch(POND.x + POND.r + 0.1, FOUNTAIN.rim, POND.z);
    // Faint, from under the water — the losing ending's line about a pond full
    // of other people's wishes has to be literally true after dark. The brief's
    // rule is that nothing added may outshine a pickup glint.
    night.add(POOL.water, PAL.water, { peak: 0.055, warm: 5.0, delay: 1.6 });
  }

  /**
   * The kid's pitch: her cup and the trinkets she has already been given, laid
   * along the kerb beside her. None of them are takeable. They are the
   * affordance — someone sitting on a wall with a row of bottle caps next to
   * her is visibly the person who collects bottle caps, and that is a thing the
   * level can say without a marker.
   */
  {
    const g = new THREE.Group();
    g.add(at(cyl(0.055, 0.055, 0.016, 8, PAL.cloth[0], { up: PAL.clothLit[0], down: PAL.shade }), 0, 0.02, -0.30));
    const marble = ico(0.05, 1, PAL.waterLit, { shadow: false });
    marble.position.set(0.02, 0.05, -0.06);
    g.add(marble);
    g.add(at(box(0.13, 0.02, 0.05, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), -0.02, 0.02, 0.20));
    // Further round the same arc, so they sit on the kerb beside her rather
    // than floating over the grass.
    const a = KID_ANGLE - 0.30;
    g.position.set(POND.x + Math.cos(a) * 4.05, FOUNTAIN.rim, POND.z + Math.sin(a) * 4.05);
    g.rotation.y = -a;
    root.add(g);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE PICNIC — three people, one cooler, and a third of the goal
  // ══════════════════════════════════════════════════════════════════════════
  {
    // The blanket. A decal rather than geometry, so nothing can be dropped
    // behind it and nothing on it is standing on a lip.
    addDecal(-19.4, 5.4, 3.4, 2.6, PAL.cloth[0]);

    const g = new THREE.Group();
    const body = box(0.95, 0.46, 0.62, PAL.cloth[4], { up: PAL.clothLit[4], down: PAL.shade });
    body.position.y = 0.23;
    g.add(body);
    const lid = box(1.0, 0.09, 0.66, PAL.clothLit[4], { up: PAL.stone, down: PAL.shade });
    lid.position.y = 0.505;
    g.add(lid);
    // A handle, so it reads as a cooler and not as a green brick.
    g.add(at(box(0.06, 0.16, 0.06, PAL.steelDark), 0.42, 0.30, 0.34));
    g.add(at(box(0.06, 0.16, 0.06, PAL.steelDark), -0.42, 0.30, 0.34));
    g.position.set(COOLER.x, 0, COOLER.z);
    root.add(g);
    solid(COOLER.x, COOLER.z, 0.95, 0.62, 0.55);
    perch(COOLER.x, 0.55, COOLER.z);

    // Picnic dressing: a speaker, a thermos, two cups. None of it takeable —
    // the glint is the game's only "you can take this" signal and this pitch
    // already has three things that carry one.
    const speaker = box(0.24, 0.34, 0.22, PAL.steelDark, { up: PAL.steel, down: PAL.shade });
    speaker.position.set(-18.2, 0.17, 4.4);
    root.add(speaker);
    const flask = cyl(0.075, 0.085, 0.28, 8, PAL.silver, { up: PAL.shiny, down: PAL.shade });
    flask.position.set(-20.3, 0.14, 4.5);
    root.add(flask);
    for (const [cx, cz] of [[-20.0, 6.1], [-18.7, 6.3]]) {
      root.add(at(cyl(0.055, 0.045, 0.10, 7, PAL.stone, { up: PAL.stone, down: PAL.shade }), cx, 0.05, cz));
    }
  }

  /**
   * The paperback, face-down on the blanket with a five underneath it.
   *
   * Level 1's saltshaker, level 3's candle lantern, and the same verb on
   * purpose: SHOVE is taught on the block in an empty corner of a café row and
   * charged for here, on a blanket with three people standing round it.
   */
  const paperback = group(
    at(box(0.19, 0.035, 0.13, PAL.cloth[3], { up: PAL.clothLit[3], down: PAL.shade }), 0, 0.018, 0),
    at(box(0.175, 0.02, 0.12, PAL.stone, { shadow: false }), 0, 0.042, 0),
  );
  paperback.position.set(-19.0, 0.03, 5.0);
  paperback.rotation.y = 0.4;
  paperback.userData.label = 'THE PAPERBACK';
  root.add(paperback);

  // ══════════════════════════════════════════════════════════════════════════
  // THE BANDSTAND — the west landmark, and a roof to sit under
  // ══════════════════════════════════════════════════════════════════════════
  {
    const g = new THREE.Group();
    const deck = cyl(3.0, 3.1, 0.9, 8, PAL.stone, { up: PAL.stone, down: PAL.shade });
    deck.position.y = 0.45;
    g.add(deck);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      g.add(at(cyl(0.085, 0.085, 2.3, 6, PAL.stone, { up: PAL.stone, down: PAL.shade }),
        Math.cos(a) * 2.6, 2.05, Math.sin(a) * 2.6));
    }
    const band = cyl(3.25, 3.25, 0.18, 8, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    band.position.y = 3.29;
    g.add(band);
    const roof = cone(3.3, 1.2, 8, PAL.terracotta, { up: PAL.terracottaLit, down: PAL.shade });
    roof.position.y = 3.98;
    g.add(roof);
    g.add(at(ico(0.16, 0, PAL.gold, { shadow: false }), 0, 4.72, 0));

    // Festoon bulbs round the eaves. Cheap, and it gives the west end of the
    // park a night identity that is not another lamppost.
    const bulbs = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = at(ico(0.10, 0, PAL.goldLit, { shadow: false }),
        Math.cos(a) * 3.0, 3.16, Math.sin(a) * 3.0);
      b.material = mat(PAL.goldLit);
      g.add(b);
      bulbs.push(b);
    }
    night.add(bulbs, PAL.goldLit, { peak: 0.9, warm: 2.4, delay: 0.6 });
    night.addPool(root, BANDSTAND.x, BANDSTAND.z, 6.4,
      { profile: 'stall', peak: 0.56, warm: 2.4, delay: 0.6 });

    g.position.set(BANDSTAND.x, 0, BANDSTAND.z);
    root.add(g);
    // The square inside the octagon, so the crow can never stand on a corner
    // with nothing under it. Same trick as the roofline's water tank lid.
    solid(BANDSTAND.x, BANDSTAND.z, 4.0, 4.0, 0.9);
    solid(BANDSTAND.x, BANDSTAND.z, 4.4, 4.4, 4.3, 3.2);
    perch(BANDSTAND.x, 0.9, BANDSTAND.z);
    perch(BANDSTAND.x, 4.9, BANDSTAND.z);

    // The step up, on the camera side.
    const step = box(2.2, 0.45, 0.9, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    step.position.set(BANDSTAND.x, 0.225, BANDSTAND.z + 3.3);
    root.add(step);
    solid(BANDSTAND.x, BANDSTAND.z + 3.3, 2.2, 0.9, 0.45);
    perch(BANDSTAND.x, 0.45, BANDSTAND.z + 3.3);
  }
  const BAND_STEP = { x: BANDSTAND.x, y: 0.45, z: BANDSTAND.z + 3.3 };

  // ══════════════════════════════════════════════════════════════════════════
  // THE SHELTER — the park's one deliberate occluder, on the near side
  // ══════════════════════════════════════════════════════════════════════════
  {
    const g = new THREE.Group();
    const roof = box(9.0, 0.22, 4.4, PAL.awning, { up: PAL.awningLit, down: PAL.awning });
    roof.position.set(0, 2.98, 0);
    g.add(roof);
    for (let i = 0; i < 7; i++) {
      const stripe = box(1.24, 0.24, 4.4, i % 2 ? PAL.stone : PAL.awningLit, { shadow: false, receive: false });
      stripe.position.set(-3.72 + i * 1.24, 2.99, 0);
      g.add(stripe);
    }
    for (const [px, pz] of [[-4.1, -1.9], [4.1, -1.9], [-4.1, 1.9], [4.1, 1.9]]) {
      g.add(at(cyl(0.11, 0.11, 2.9, 6, PAL.bark, { up: PAL.bark, down: PAL.barkShade }), px, 1.45, pz));
    }

    // The table under it: a plank top on trestles, with two benches.
    g.add(at(box(2.6, 0.10, 0.9, PAL.bark, { up: PAL.bark, down: PAL.barkShade }), -0.9, 0.74, 0));
    for (const bz of [-0.72, 0.72]) {
      g.add(at(box(2.6, 0.08, 0.34, PAL.barkShade, { up: PAL.bark, down: PAL.shade }), -0.9, 0.44, bz));
    }
    for (const tx of [-1.9, 0.1]) {
      g.add(at(box(0.09, 0.72, 1.5, PAL.steelDark), tx, 0.36, 0));
    }

    // A caged bulb hung off the middle purlin.
    const lamp = at(ico(0.13, 0, PAL.goldLit, { shadow: false }), 0, 2.68, 0);
    lamp.material = mat(PAL.goldLit);
    g.add(lamp);
    g.add(at(cyl(0.02, 0.02, 0.22, 4, PAL.steelDark), 0, 2.85, 0));
    night.add(lamp, PAL.goldLit, { peak: 0.95, warm: 1.6, delay: 1.5, flicker: true });
    night.addPool(root, SHELTER.x, SHELTER.z, 5.4,
      { profile: 'stall', peak: 0.70, warm: 1.6, delay: 1.5, flicker: true });

    g.position.set(SHELTER.x, 0, SHELTER.z);
    root.add(g);
    occluders.push(roof, ...g.children.filter((c) => c.geometry?.type === 'BoxGeometry' && c.position.y > 2.9));
    solid(SHELTER.x, SHELTER.z, 9.0, 4.4, 3.10, 2.86);
    solid(SHELTER.x - 0.9, SHELTER.z, 2.6, 0.9, 0.79);
    perch(SHELTER.x - 3, 3.10, SHELTER.z);
    perch(SHELTER.x + 3, 3.10, SHELTER.z);
  }
  const SHELTER_TABLE = { x: SHELTER.x - 0.9, y: 0.79, z: SHELTER.z };

  // ══════════════════════════════════════════════════════════════════════════
  // THE PAVILION — the park building, and the nest on top of it
  // ══════════════════════════════════════════════════════════════════════════
  const NEST = { x: PAVILION.x, y: 4.75, z: PAVILION.z };
  {
    const g = new THREE.Group();
    const mass = box(9, DECK.roof, 5.5, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    mass.position.y = DECK.roof / 2;
    g.add(mass);
    // A brick plinth course, so the frontage has a horizon in it. Lighter than
    // the wall, always: an accent darker than what it sits on is how level 3
    // lost eleven points of luminance twice.
    const plinth = box(9.2, 0.8, 5.7, PAL.stone, { up: PAL.stone, down: PAL.shade });
    plinth.position.y = 0.4;
    g.add(plinth);

    // The doorway and two windows, all on the camera-facing side.
    const door = box(1.7, 2.4, 0.22, PAL.barkShade, { shadow: false });
    door.position.set(0, 1.2, 2.78);
    g.add(door);
    night.add(door, 0xe0a860, { peak: 0.58, warm: 2.8, delay: 1.0 });
    const frame = box(2.1, 2.8, 0.12, PAL.stone, { shadow: false });
    frame.position.set(0, 1.4, 2.72);
    g.add(frame);
    // Two blank plaques either side of the door. Nobody can read them at this
    // distance, which is the point — a park building's signage is a shape you
    // recognise, not text you parse.
    const signs = [];
    for (const sx of [-1.5, 1.5]) {
      const s = box(0.5, 0.34, 0.1, PAL.steel, { shadow: false });
      s.position.set(sx, 2.15, 2.80);
      g.add(s);
      signs.push(s);
    }
    for (const wx of [-3.1, 2.5]) {
      const win = box(1.5, 1.0, 0.22, PAL.waterLit, { shadow: false });
      win.position.set(wx, 2.1, 2.78);
      g.add(win);
      night.add(win, PAL.goldLit, { peak: 0.44, warm: 3.2, delay: 1.6 });
    }
    night.add(signs, PAL.shiny, { peak: 0.35, warm: 2.0, delay: 1.8 });

    g.position.set(PAVILION.x, 0, PAVILION.z);
    root.add(g);
    solid(PAVILION.x, PAVILION.z, 9, 5.5, DECK.roof);
    addDecal(PAVILION.x, PAVILION.z, 8.6, 5.1, PAL.stone, DECK.roof);
    night.addPool(root, PAVILION.x, PAVILION.z + 4.0, 5.0,
      { profile: 'stall', peak: 0.72, warm: 2.8, delay: 1.0 });

    // The window ledge, which is where the lost-property tin lives.
    const ledge = box(1.7, 0.14, 0.4, PAL.stone, { up: PAL.stone, down: PAL.shade });
    ledge.position.set(PAVILION.x + 2.5, 1.21, PAVILION.z + 2.95);
    root.add(ledge);
    solid(PAVILION.x + 2.5, PAVILION.z + 2.95, 1.7, 0.4, 1.28, 1.10);
    perch(PAVILION.x + 2.5, 1.28, PAVILION.z + 2.95);

    // The honesty box on its post, beside the door.
    const bx = PAVILION.x - 2.0, bz = PAVILION.z + 3.2;
    const post = box(0.5, 0.9, 0.36, PAL.bark, { up: PAL.barkShade, down: PAL.shade });
    post.position.set(bx, 0.45, bz);
    root.add(post);
    const boxTop = box(0.62, 0.14, 0.46, PAL.barkShade, { up: PAL.bark, down: PAL.shade });
    boxTop.position.set(bx, 0.97, bz);
    root.add(boxTop);
    solid(bx, bz, 0.62, 0.46, 1.04);
    perch(bx, 1.04, bz);

    // A low parapet round the roof, so it reads as a place rather than a lid.
    for (const [cx, cz, w, d] of [
      [0, -2.55, 8.6, 0.4], [0, 2.55, 8.6, 0.4], [-4.3, 0, 0.4, 5.5], [4.3, 0, 0.4, 5.5],
    ]) {
      const p = box(w, 0.4, d, PAL.stone, { up: PAL.stone, down: PAL.shade });
      p.position.set(PAVILION.x + cx, DECK.roof + 0.2, PAVILION.z + cz);
      root.add(p);
      solid(PAVILION.x + cx, PAVILION.z + cz, w, d, DECK.roof + 0.4, DECK.roof);
    }
    perch(PAVILION.x, DECK.roof, PAVILION.z + 2.0);

    /**
     * The vent housing, and the nest on its cap.
     *
     * 3.2 square against a 1.5m twig ring clears RULES.nestPlatformRatio, which
     * is the rule that says a landing under pressure must never be pixel
     * accurate. It matters less here than on the roofline — you arrive at this
     * one with most of a bar left — but a nest is the one place in a level
     * where being generous costs nothing.
     */
    const vent = new THREE.Group();
    vent.add(at(box(3.2, 1.2, 3.2, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, DECK.roof + 0.6, 0));
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        vent.add(at(box(2.4, 0.10, 0.08, PAL.steelDark, { shadow: false }),
          0, DECK.roof + 0.32 + i * 0.3, s * 1.62));
      }
    }
    vent.add(at(box(3.5, 0.12, 3.5, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), 0, DECK.roof + 1.26, 0));
    // The one mark on the park's skyline that says "the nest is that way".
    const bead = at(ico(0.10, 0, PAL.gold, { shadow: false }), 1.5, DECK.roof + 1.42, 1.5);
    bead.material = mat(PAL.gold);
    vent.add(bead);
    night.add(bead, PAL.gold, { peak: 0.95, warm: 1.1, delay: 2.2, flicker: true });

    const nest = makeNest();
    nest.position.set(0, DECK.roof + 1.32, 0);
    vent.add(nest);
    vent.position.set(PAVILION.x, 0, PAVILION.z);
    root.add(vent);
    root.userData.nestGroup = nest;

    solid(PAVILION.x, PAVILION.z, 3.2, 3.2, DECK.roof + 1.32, DECK.roof);
    perch(PAVILION.x, DECK.roof + 1.32, PAVILION.z);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE CART — a pretzel wagon, the endgame, and the level's set piece
  // ══════════════════════════════════════════════════════════════════════════
  {
    const g = new THREE.Group();
    // Cream, not the navy this was first painted. A dark wagon is the second
    // thing the roofline's dusk pass caught — it had a navy van — and a
    // pretzel cart is allowed to be the brightest object at its end of the
    // park. The red-and-white canopy carries the colour.
    g.add(at(box(3.2, 1.3, 1.6, PAL.cloth[2], { up: PAL.clothLit[2], down: PAL.shade }), 0, 1.05, 0));
    g.add(at(box(3.3, 0.14, 1.7, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 1.75, 0));
    for (const s of [-1, 1]) {
      const w = cyl(0.42, 0.42, 0.14, 10, PAL.feather, { up: PAL.steelDark });
      w.rotation.z = Math.PI / 2;
      w.position.set(s * 1.05, 0.42, 0.84);
      g.add(w);
    }
    // The warmer: a hot box, not a lamp. Deep orange and dimmer than anything
    // on a pole — the cart is the far end of the park and it should stay the
    // dimmest place in it.
    const warmer = at(box(0.9, 0.34, 0.7, PAL.steel, { up: PAL.steel, down: PAL.steelDark }), -1.05, 1.99, 0.35);
    g.add(warmer);
    night.add(warmer, 0xd8632c, { peak: 0.50, warm: 4.0, delay: 1.2 });
    night.addPool(root, CART.x - 0.4, CART.z + 1.6, 5.0,
      { profile: 'stall', peak: 0.70, warm: 4.0, delay: 1.2 });

    /**
     * The canopy sits at 3.2, not at the 2.8 a market stall would want.
     *
     * Not taste: a canopy's underside is the one thing on this cart that can
     * stand between the counter and a camera climbing at 38°, and at 2.8 the
     * ten's single sightline clipped it. Raising the fabric by forty
     * centimetres moves the exit point clear of the far edge. The same
     * arithmetic put level 3's wishing coins in an arc.
     */
    for (const px of [-1.5, 1.5]) {
      g.add(at(cyl(0.05, 0.05, 3.2, 6, PAL.steelDark), px, 1.6, -1.1));
    }
    const canopy = box(3.8, 0.16, 2.4, PAL.cloth[0], { up: PAL.clothLit[0], down: PAL.shade });
    canopy.position.set(0, 3.28, -1.4);
    g.add(canopy);
    for (let i = 0; i < 5; i++) {
      const stripe = box(0.76, 0.18, 2.4, i % 2 ? PAL.stone : PAL.clothLit[0], { shadow: false, receive: false });
      stripe.position.set(-1.52 + i * 0.76, 3.29, -1.4);
      g.add(stripe);
    }

    // The display rack: three pretzels on hooks. Props — the takeable one is on
    // the counter, where it is unambiguous.
    const rack = new THREE.Group();
    rack.add(at(cyl(0.035, 0.035, 1.0, 5, PAL.steel), 0, 0.5, 0));
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.03, 4, 8), mat(PAL.terracotta));
      p.rotation.y = Math.PI / 2;
      p.position.set(0, 0.86 - i * 0.24, 0.05);
      p.castShadow = true;
      rack.add(p);
    }
    rack.position.set(-1.3, 1.82, -0.4);
    g.add(rack);

    // The open cash tin the ten sits in. A label that says CASH BOX over a
    // note lying on bare wood is a label doing work the geometry should be
    // doing; the note rests on the lid, so nothing is buried by it.
    const tin = new THREE.Group();
    tin.add(at(box(0.36, 0.10, 0.26, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), 0, 0.05, 0));
    tin.add(at(box(0.36, 0.14, 0.03, PAL.steel, { up: PAL.silver, down: PAL.shade }), 0, 0.12, -0.13));
    tin.position.set(1.0, 1.82, -0.2);
    g.add(tin);

    g.position.set(CART.x, 0, CART.z);
    root.add(g);
    solid(CART.x, CART.z, 3.3, 1.7, 1.82);
    solid(CART.x, CART.z - 1.4, 3.8, 2.4, 3.36, 3.2);
    perch(CART.x, 1.82, CART.z);
    perch(CART.x, 3.36, CART.z - 1.4);
  }

  // The vendor's folding table, which is where the tips are. Level 1 learned
  // that three takeables on one cart make it a lucky dip; the money that is not
  // the point goes somewhere else.
  {
    const g = new THREE.Group();
    g.add(at(box(1.3, 0.06, 0.9, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 0.95, 0));
    for (const [tx, tz] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) {
      g.add(at(box(0.05, 0.92, 0.05, PAL.steelDark), tx, 0.46, tz));
    }
    // The jar itself is glass, so it is transparent and cannot hide the notes
    // in it from anything — including the check that says nothing may.
    const jar = cyl(0.15, 0.13, 0.28, 10, PAL.waterLit, { transparent: true, opacity: 0.34, shadow: false });
    jar.position.set(0, 1.12, 0);
    g.add(jar);
    g.position.set(CART.x + 2.6, 0, CART.z - 1.2);
    root.add(g);
    solid(CART.x + 2.6, CART.z - 1.2, 1.3, 0.9, 0.98);
    perch(CART.x + 2.6, 0.98, CART.z - 1.2);
  }
  const TIP_TABLE = { x: CART.x + 2.6, y: 0.98, z: CART.z - 1.2 };

  // ── the noticeboard ───────────────────────────────────────────────────────
  // Park furniture, a perch, and a ledge for the dollar somebody pinned to it.
  {
    const g = new THREE.Group();
    g.add(at(box(2.2, 1.4, 0.16, PAL.bark, { up: PAL.barkShade, down: PAL.shade }), 0, 1.5, 0));
    g.add(at(box(2.3, 0.14, 0.34, PAL.barkShade, { up: PAL.bark, down: PAL.shade }), 0, 1.12, 0.12));
    for (const px of [-0.95, 0.95]) {
      g.add(at(cyl(0.07, 0.07, 2.2, 5, PAL.bark, { up: PAL.bark, down: PAL.barkShade }), px, 1.1, 0));
    }
    for (let i = 0; i < 4; i++) {
      const note = box(0.34, 0.44, 0.03, PAL.cloth[i % 5], { shadow: false });
      note.position.set(-0.72 + i * 0.48, 1.55 + (i % 2) * 0.12, 0.10);
      g.add(note);
    }
    g.position.set(12, 0, 7.5);
    root.add(g);
    // The ledge collider has to sit where the ledge mesh sits, not where the
    // board does. It is 0.12 proud of the board, and that 0.12 is the whole
    // clearance the dollar has: any further back and the bill is inside the
    // board, any further forward and it is standing on air.
    solid(12, 7.62, 2.3, 0.34, 1.19, 1.02);
    solid(12, 7.5, 2.2, 0.16, 2.2);
    perch(12, 2.2, 7.5);
  }

  // ── the tool store, back west ─────────────────────────────────────────────
  {
    const g = new THREE.Group();
    g.add(at(box(3.6, 2.4, 2.8, PAL.bark, { up: PAL.barkShade, down: PAL.shade }), 0, 1.2, 0));
    const roof = box(4.0, 0.22, 3.2, PAL.steelDark, { up: PAL.steel, down: PAL.shade });
    roof.position.y = 2.5;
    roof.rotation.x = 0.09;
    g.add(roof);
    g.add(at(box(0.9, 1.9, 0.14, PAL.barkShade, { shadow: false }), 0, 0.95, 1.44));
    g.position.set(-27, 0, -8.5);
    root.add(g);
    solid(-27, -8.5, 3.8, 3.0, 2.62);
    perch(-27, 2.62, -8.5);
  }

  // ── planting and furniture ────────────────────────────────────────────────
  /**
   * Seven trees, all under full size, and none of them in a clump.
   *
   * The first pass had eight at full scale with five of them in the west half,
   * three around the picnic. Once the lawn stopped being the darkest thing in
   * the frame the canopies became it — nothing on a lamppost reaches four
   * metres up, so a tree at dusk is an unlit mass by construction — and the
   * 5th-percentile floor caught it at 23 against 24. The answer is not to light
   * them, which would be a lie about where the lamps are; it is to stop
   * stacking them in the one corner of the block a player has to work in.
   *
   * They are still the level's cover, which is the whole reason a crow can get
   * near the picnic at all. Fewer and smaller, not gone.
   */
  addTree(-28, 6.5, 0.9);
  addTree(-24.5, -2.5, 0.85);
  addTree(-12.5, -6.2, 0.85);
  addTree(-10.5, 13.0, 0.85, { occlude: true });
  addTree(9.5, 2.5, 0.85);
  addTree(17.5, 11.5, 0.9, { occlude: true });
  addTree(26, 6.5, 0.85, { occlude: true });

  addPlanter(-6.5, 12.8);
  addPlanter(24.5, -6.0);

  addLamp(-23, 9.5);
  addLamp(-10, 6.5);
  // On the bandstand path where it passes the picnic. The set piece sat in the
  // one gap between two lamp pools, which is a fine place for a set piece to be
  // at four o'clock and a bad one at eight.
  addLamp(-16.5, 4.5);
  // There was a ninth here, at the west gate. It bought two points of median
  // and cost four of 5th percentile, which is the trade a lamppost always
  // makes at this camera: the pool is on the ground and the 4.6m column and
  // its shadow are in the frame. Light the ground, not the lamp count.
  addLamp(3, 9.5);
  addLamp(16.5, 5.5);
  // The east end had one lamp and a hot box between them, which made the cart
  // district a light desert measuring eleven points under the floor while the
  // rest of the park sat comfortably over it.
  addLamp(25, 3.5);
  // West of the bandstand step, not east of it. A lamp column is 4.6m of
  // nothing-you-can-see-through, and at (-16, -1) it stood exactly on the one
  // sightline the loose change on that step has to the camera.
  addLamp(-20.5, -1.0);

  addBench(-25, 3.5, Math.PI / 2);
  addBench(-2, 11.5);
  addBench(10.5, 4.5, Math.PI / 2);
  addBench(-12.5, -8.5);

  addBin(13.8, 9.8, PAL.canopyShade);
  addBin(-14.5, 9.8, PAL.steelDark);
  addBin(23.5, -3.5, PAL.canopyShade);

  return {
    root, colliders, occluders, perches,
    nightLights: night,
    fountain: FOUNTAIN,
    waterDeck: DECK.ground,
    nest: NEST,
    nestPlatform: 3.2,     // the vent housing's cap
    nestFootprint: 1.5,    // the twig ring itself
    decks: DECK,
    cart: CART,
    /** The weighted object pinning a note. The game knows it as `pin`. */
    pin: paperback,
    pickups: pickupPlacements({ FOUNTAIN, BAND_STEP, SHELTER_TABLE, TIP_TABLE }),
    humans: humanPlacements(),
    gulls: [],
    pigeons: pigeonPlacements(),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Placements
// ════════════════════════════════════════════════════════════════════════════

/**
 * The value ladder, laid out in a park.
 *
 * $32.85 against a $25 goal. $3.85 of that is unguarded and dry and $1.25 more
 * is at the bottom of the pond, which means the honest half of the park is
 * worth about a fifth of what you need — and every trade the kid will ever make
 * only gets you to $12.85. The other twenty dollars are standing next to
 * somebody.
 *
 * Where it differs from the block is the shape rather than the size. Level 1
 * spreads its guarded money across three districts with one guard each, so
 * there is always a softer pitch to work. The park puts $10.85 of it on one
 * blanket with three people round it and $13 more at the far end with the
 * vendor on it, so the middle third of a run is a choice between two hard
 * problems rather than a queue of easy ones. docs/park-brief.html §3.
 */
function pickupPlacements({ FOUNTAIN, BAND_STEP, SHELTER_TABLE, TIP_TABLE }) {
  const p = [];
  const add = (kind, value, x, y, z, extra = {}) =>
    p.push({ kind, value, pos: [x, y, z], ...extra });

  // — Scattered change: the teaching money, spread down the paths and over the
  //   grass, deliberately trivial and deliberately not enough. —
  for (const [x, z] of [
    [-27, 7.5], [-22, 10.5], [-13, 8], [-9, 10], [2, 6.5],
    [8, 6.5], [14.5, 11.5], [21.5, 12], [-3, -2], [5.5, -3.5],
  ]) add('penny', 0.01, x, 0.06, z);
  for (const [x, z] of [[-25.5, 11.5], [-11.5, 1.5], [4.5, 11], [18.5, 3.5], [-19.5, -2]]) {
    add('nickel', 0.05, x, 0.06, z);
  }
  for (const [x, z] of [[-28.5, 10.5], [-5.0, 14.0], [11.5, -6.5], [25.5, 1.5]]) {
    add('dime', 0.10, x, 0.06, z);
  }
  for (const [x, z] of [[-15, 5.5], [1.5, -6.5], [27, 9.5]]) add('quarter', 0.25, x, 0.06, z);

  // Loose change on the shelter table and on the bandstand step. Free, and both
  // of them are somewhere you would sit down — which is the only reason a park
  // has coins lying on furniture at all.
  add('coins', 0.60, SHELTER_TABLE.x + 0.5, SHELTER_TABLE.y + 0.04, SHELTER_TABLE.z + 0.1);
  add('coins', 0.75, BAND_STEP.x + 0.4, BAND_STEP.y + 0.04, BAND_STEP.z + 0.05);
  // A dollar somebody pinned to the noticeboard and nobody came back for. On
  // the front lip of the ledge rather than the middle of it: the board itself
  // is a solid, and a bill halfway back is inside it.
  add('bill1', 1.00, 12.5, 1.23, 7.72);

  // — The pond: you have to go in. No centrepiece, so no arc and no sightline
  //   arithmetic; a duck pond is allowed to be a flat sheet of water. —
  for (const [deg, r] of [[20, 2.6], [80, 2.9], [150, 2.5], [225, 2.8], [300, 2.6]]) {
    const a = (deg * Math.PI) / 180;
    add('quarter', 0.25,
      FOUNTAIN.x + Math.cos(a) * r, FOUNTAIN.rim - 0.28, FOUNTAIN.z + Math.sin(a) * r,
      { inWater: true });
  }

  // — The picnic. Two owners, three bodies, and $10.85 inside four metres. —
  //
  // The five on the cooler lid is the level's marquee: it is in the open, it
  // glints from anywhere in the west half of the park, and there is no approach
  // to it that is not inside somebody's cone.
  add('bill5', 5.00, -19.6, 0.58, 3.2,
    { owner: 'picnicker', label: 'THE FIVE ON THE COOLER', onCooler: true });
  add('coins', 0.85, -20.6, 0.06, 5.5, { owner: 'picnicker' });
  // And the one under the paperback, which costs a SHOVE first.
  add('bill5', 5.00, -19.0, 0.03, 5.0,
    { owner: 'frisbee', pinned: true, label: 'THE FIVE UNDER THE BOOK' });

  // — The pavilion: the keeper's two tins. —
  add('coins', 1.40, 4.0, 1.08, -4.8, { owner: 'keeper', label: 'THE HONESTY BOX' });
  add('coins', 2.50, 8.5, 1.32, -4.95, { owner: 'keeper', label: 'THE LOST-PROPERTY TIN' });

  // — The cart: the endgame. The ten is on the counter with the vendor beside
  //   it, and the only way to move him is to move the smell. —
  add('bill10', 10.00, 21.0, 1.93, -1.2, { owner: 'vendor', label: 'THE CASH BOX' });
  for (let i = 0; i < 3; i++) {
    add('bill1', 1.00, TIP_TABLE.x - 0.06 + i * 0.06, TIP_TABLE.y + 0.08 + i * 0.02, TIP_TABLE.z,
      { owner: 'vendor', inJar: true });
  }

  // — Shinies: worthless, tradeable, one for each quarter of the park. —
  add('shiny', 0, -17.6, 0.07, 6.0, { shinyKind: 'screw' });
  add('shiny', 0, -3.0, FOUNTAIN.rim - 0.28, 4.6, { inWater: true, shinyKind: 'ring' });
  add('shiny', 0, 4.6, 0.07, 13.4, { shinyKind: 'foil' });
  add('shiny', 0, 11.6, 0.07, 8.4, { shinyKind: 'cap' });

  // — The pretzel. Not money; the only way to move a vendor and six pigeons. —
  // On the counter in front of the display rack, not on the warmer — a takeable
  // sitting inside a hot box is a takeable nobody can see.
  add('pretzel', 0, 19.6, 1.86, -1.3, { owner: 'vendor' });

  p.forEach((x, i) => { x.id = i; });
  return p;
}

function humanPlacements() {
  return [
    {
      id: 'vendor', name: 'the pretzel vendor', cloth: 1, skin: 0, hair: 2,
      // At the open end of his wagon rather than behind it. Behind is where a
      // vendor belongs and where the camera cannot see him — the block's
      // newsagent spent a build reading as a head growing out of a shelf.
      pos: [17.4, 0, -1.4], home: [17.4, 0, -1.4],
      patrol: null, speed: 1.3, chaseSpeed: 4.0, viewDist: 11, viewCos: 0.1,
      guardRadius: 4.2, alertness: 1.25, faces: [0.4, 1],
    },
    {
      id: 'keeper', name: 'the parks keeper', cloth: 4, skin: 3, hair: 3,
      /**
       * A full lap of the park, and it is the level's clock.
       *
       * He owns both tins at the pavilion and neither of them is inside his
       * guard radius for most of the minute — which is the point. The block's
       * guards stand still and you learn a cone; this one you have to time.
       */
      pos: [2, 0, -3], home: [2, 0, -3],
      patrol: [[-24, 9], [-12, 11], [0, 11], [9.5, 9], [16, 4], [14, -2], [2, -3], [-10, -2], [-22, 2]],
      speed: 1.35, chaseSpeed: 4.1, viewDist: 9.5, viewCos: 0.3,
      guardRadius: 3.4, alertness: 0.95,
    },
    {
      id: 'picnicker', name: 'someone at the picnic', cloth: 0, skin: 1, hair: 0,
      // Facing across the cooler, which puts the five between the two of them.
      pos: [-21.2, 0, 3.0], home: [-21.2, 0, 3.0],
      patrol: null, speed: 1.1, chaseSpeed: 4.0, viewDist: 8.5, viewCos: 0.3,
      guardRadius: 3.6, alertness: 1.15, faces: [1, 0.2],
    },
    {
      id: 'frisbee', name: 'someone with a frisbee', cloth: 3, skin: 2, hair: 1,
      /**
       * Three metres of pacing, and it is the whole difficulty of the set piece.
       *
       * A cone you can memorise is a puzzle you solve once. A cone that walks
       * three metres and comes back means the same approach is safe and unsafe
       * at different moments, and the player has to watch rather than plan —
       * without anything on screen moving fast enough to feel unfair.
       */
      pos: [-17.6, 0, 1.8], home: [-17.6, 0, 1.8],
      patrol: [[-17.6, 1.8], [-21.0, 0.6], [-18.5, 6.8]],
      speed: 1.25, chaseSpeed: 3.8, viewDist: 8, viewCos: 0.4,
      guardRadius: 3.0, alertness: 0.9,
    },
    {
      id: 'phone', name: 'someone on their phone', cloth: 2, skin: 0, hair: 1,
      // The third body. Owns nothing, notices nothing, and stands exactly where
      // you want to land — which is the only job a park needs from a third
      // person at a picnic.
      pos: [-19.4, 0, 1.3], home: [-19.4, 0, 1.3],
      patrol: null, speed: 1.0, chaseSpeed: 3.0, viewDist: 3.0, viewCos: 0.8,
      guardRadius: 1.4, alertness: 0.2, oblivious: true, faces: [0, -1],
    },
    {
      id: 'jogger', name: 'a jogger', cloth: 2, skin: 1, hair: 0,
      // A lap of the whole park at nearly twice walking pace. Ambience, and a
      // moving obstacle on the one path every route across the park uses.
      pos: [-26, 0, 12], home: [-26, 0, 12],
      patrol: [[-26, 12], [-4, 14], [10, 12.5], [24, 10], [26, 2], [12, -2.5], [-2, -2], [-14, -1], [-26, 4]],
      speed: 2.2, chaseSpeed: 3.2, viewDist: 3.0, viewCos: 0.85,
      guardRadius: 1.5, alertness: 0.2, oblivious: true,
    },
    {
      id: 'kid', name: 'the kid on the pond edge', cloth: 2, skin: 2, hair: 2,
      /**
       * On the kerb of the pond with her feet over the grass, on the side
       * nearest the middle of the park.
       *
       * Sitting is still what identifies her, and in a park that is a real
       * question rather than a free win: benches are the one thing a park has
       * more of than anything else. So nobody else in the level sits down —
       * the picnic *stands* round its cooler, the keeper walks, the jogger
       * runs — and the four benches stay empty. The silhouette only works if it
       * is the only one of its kind, and here that had to be defended rather
       * than inherited.
       */
      pos: [KID.x, 0.62, KID.z], home: [KID.x, 0.62, KID.z],
      patrol: null, speed: 0, chaseSpeed: 0, viewDist: 0, viewCos: 1,
      guardRadius: 0, alertness: 0,
      // Facing out of the pond, which is what puts her legs over the edge
      // rather than along the kerb — the sitting pose swings them forward.
      kid: true, small: true, sits: true,
      faces: [Math.cos(KID_ANGLE), Math.sin(KID_ANGLE)],
    },
  ];
}

/**
 * Park pigeons, round the pond and the path where people drop things.
 *
 * Eight rather than the block's seven, and clustered nearer the middle: the
 * pretzel has to be droppable more than six metres from the cart and still pull
 * a visible crowd, which on a block this wide means the birds cannot all live
 * at one end.
 */
function pigeonPlacements() {
  return [
    { x: -8, z: 9 }, { x: -1, z: 10 }, { x: -9, z: 0 }, { x: 1, z: 1.5 },
    { x: -13, z: 7 }, { x: 4, z: 8 }, { x: -6, z: -1 }, { x: 8, z: 9.5 },
  ];
}
