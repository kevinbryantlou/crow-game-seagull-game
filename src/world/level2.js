/**
 * LEVEL 2 — The Hotel (Outside).
 *
 * Named for what it is and for what it is not: there is an inside, and it is a
 * different level.
 *
 * The Vantage, from the forecourt to the water tank. Level 1 is a block: one
 * floor, three districts, money density falling left to right. This is the same
 * idea stood on its end. There are four decks — forecourt, fire escape, terrace,
 * roof — and money density rises as you climb, so the value ladder and the
 * altitude ladder are the same ladder.
 *
 * The consequence is the point. On the block, a penny cost you a short walk. Up
 * here a penny in the yard costs a twelve-metre climb to bank it, which is more
 * than a penny is worth — so the level prices its own pickups by putting them
 * somewhere, and the player works that out without being told. See
 * docs/level-2-brief.html §2.
 *
 * Nothing new is asked of the player: fly, take one thing, bank it, distract a
 * guard with food, trade a shiny with a kid. What is new is that the block has a
 * y axis, and that the roof has no cover on it — which is what the gulls are for.
 */

import * as THREE from 'three';
import { PAL } from '../render/palette.js';
import { box, cyl, cone, ico, plane, at, group, mat } from '../render/shapes.js';
import { NightLights } from '../render/nightlights.js';
import { makeKit } from './kit.js';
import { RULES } from './rules.js';

export const BOUNDS = { minX: -25, maxX: 25, minZ: -13, maxZ: 15 };

/**
 * The four floors, and the only numbers in this file that anything else needs.
 *
 * Every height in the level is written as one of these plus an offset, so a deck
 * can be moved without hunting for the props standing on it — and so the climb
 * between two of them can be read off rather than measured. RULES.maxUnbrokenClimb
 * is 9 and the largest gap here is 5.4; every one of them is broken up further by
 * something to stand on.
 */
export const DECK = { yard: 0, escape: 2.0, terrace: 5.4, roof: 9.2 };

/**
 * The fountain is on the ground, in the middle of the forecourt garden, where a
 * hotel would actually put one. It spent a version of this level on the roof
 * terrace as a plunge pool, which was a good excuse to prove the water code
 * works at height and a bad piece of level design: it put the dive, the money
 * and the guards all on the same deck, and left the ground floor reading as
 * nothing but a loading bay.
 */
const POOL = { x: -11, z: 8.5, r: 4.2 };
const LECTERN = { x: -15.5, z: -3.5 };
const TANK = { x: -16, z: -9 };
const CRADLE = { x: 14, z: 2.4, y: 4.0 };
/** The guest entrance, and the service door at the loading end. */
const ENTRANCE = { x: -11, z: 1.5 };
const SERVICE = { x: 13, z: 1.5 };
const DOCK = { x: 18, z: 5.5 };
/** Where the kid sits — on the terrace, one hop inside the parapet gap. */
const KID = { x: -5, z: -1.45 };
/**
 * Five tables, and each one holds exactly one idea: loose change, the tip glass,
 * the check under the lantern, the chips, more loose change. Level 1's cart
 * learned this the hard way — three takeables inside one beak-length made it a
 * lucky dip, and the fix was to give each surface one story.
 */
const TABLES = [
  { x: -3, z: -2 }, { x: 3.5, z: -3.5 }, { x: -9, z: -1.5 },
  { x: 7.5, z: -1 }, { x: -18, z: -1.5 },
];

export function buildLevel() {
  const root = new THREE.Group();
  const colliders = [];
  const occluders = [];
  const perches = [];
  const night = new NightLights(RULES.lampsOnAt);

  const kit = makeKit({ root, colliders, occluders, perches, night });
  const {
    solid, perch, addPlanter, addBench, addLamp, addBin, addTable, addTree,
    addSkyline, makeNest, addPool,
  } = kit;

  // ── the yard floor ────────────────────────────────────────────────────────
  // Wet asphalt rather than the plaza's warm paving: the yard is the bottom of a
  // light well, it is in shadow all day, and it should look like somewhere you
  // would rather not be for long.
  // The same paving as the block. It was one step darker — "wet asphalt, the
  // bottom of a light well" — and the fiction was not worth what it cost: the
  // yard is the largest surface in the frame from every camera position on the
  // level, and a 15% darker floor took the whole median under the navigability
  // floor after sundown. The yard reads as a yard from what is standing in it.
  const ground = plane(140, 90, PAL.paving, { receive: true });
  root.add(ground);
  for (const [x, z, w, d, c] of [
    [-14, 8, 22, 14, PAL.pavingMid], [10, 9, 26, 12, PAL.paving], [0, 3.4, 50, 4, PAL.stoneMid],
  ]) {
    const s = plane(w, d, c, { receive: true });
    s.position.set(x, 0.012, z);
    root.add(s);
  }

  // ── backdrop, and the far wall of the light well ──────────────────────────
  addSkyline([
    [13, 26, PAL.stoneMid], [16, 21, PAL.terracotta], [11, 30, PAL.bark],
    [18, 24, PAL.stoneMid], [14, 19, PAL.terracotta],
  ], -26, { startX: -42 });
  solid(0, -22, 140, 10, 26);

  // Invisible bounds. Higher than level 1's, because this block is climbed.
  solid(BOUNDS.minX - 2, 0, 4, 90, 34, 0, { perch: false });
  solid(BOUNDS.maxX + 2, 0, 4, 90, 34, 0, { perch: false });
  solid(0, BOUNDS.maxZ + 2.5, 140, 4, 34, 0, { perch: false });

  // ══════════════════════════════════════════════════════════════════════════
  // THE HOTEL — one mass, with the terrace on top of it
  // ══════════════════════════════════════════════════════════════════════════
  // x −25…25, z −12…1.5. Its front face at z = 1.5 is the wall the fire escape
  // is bolted to and the wall the yard looks at.
  {
    const g = new THREE.Group();
    // Stone, not terracotta. It was terracotta, and a fifty-metre wall of it
    // facing away from a sun that comes from behind the block is the darkest
    // thing anyone has ever put on screen: it filled a third of the frame, took
    // the 5th-percentile luminance to 6 against a floor of 24, and dragged the
    // whole dusk average red at the exact hour the palette says shade goes
    // violet. Both failures were one material.
    const face = box(50, DECK.terrace, 13.5, PAL.stone, { up: PAL.stone, down: PAL.shade });
    face.position.set(0, DECK.terrace / 2, -5.25);
    g.add(face);

    // A painted dado at pavement level, so fifty metres of wall has a horizon in
    // it. It was terracotta for one round of tuning and that was the same
    // mistake in miniature — at dusk the band alone was most of the darkest 5%
    // of the frame and most of the red in its average. An accent on a wall this
    // big has to be lighter than the wall, not darker.
    const dado = box(50.3, 1.0, 13.6, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    dado.position.set(0, 0.5, -5.25);
    g.add(dado);

    // A band of service windows onto the yard. They come on at dusk and they are
    // the only thing that stops the hotel wall being fifty metres of flat brick.
    const lit = [];
    for (const wx of [-19, -14.5, 1.5, 6, 10.5, 19]) {
      // waterLit, not water. Six dark-teal panels on a pale wall were the last
      // thing standing between this level and the navigability floor — in
      // daylight they measured darker than the shadow they sat in, which is also
      // just wrong: glass seen from outside on a sunny afternoon is a mirror of
      // the sky, not a hole.
      const win = box(2.2, 1.5, 0.22, PAL.waterLit, { shadow: false });
      win.position.set(wx, 3.3, 1.62);
      g.add(win);
      lit.push(win);
    }
    night.add(lit, PAL.goldLit, { peak: 0.52, warm: 3.6, delay: 1.0 });

    // The kitchen door — propped open, which is why the chef is standing in it.
    const door = box(1.9, 2.9, 0.22, PAL.barkShade, { shadow: false });
    door.position.set(-10, 1.45, 1.62);
    g.add(door);
    night.add(door, 0xe0a860, { peak: 0.62, warm: 2.6, delay: 0.5 });
    night.addPool(root, -10, 3.6, 4.6, { profile: 'stall', peak: 0.74, warm: 2.6, delay: 0.5 });

    // A caged bulkhead lamp further along, so the yard has two sources and one
    // dark stretch between them rather than one lit patch and a void.
    const cage = at(ico(0.16, 0, PAL.goldLit, { shadow: false }), 12, 3.2, 1.75);
    cage.material = mat(PAL.goldLit);
    g.add(cage);
    g.add(at(box(0.34, 0.06, 0.3, PAL.steelDark), 12, 3.44, 1.75));
    night.add(cage, PAL.goldLit, { peak: 0.9, warm: 1.5, delay: 1.5, flicker: true });
    night.addPool(root, 12, 2.9, 4.4, { profile: 'stall', peak: 0.62, warm: 1.5, delay: 1.5, flicker: true });

    root.add(g);
    solid(0, -5.25, 50, 13.5, DECK.terrace);
  }

  // ── the terrace deck surface and its parapet ──────────────────────────────
  {
    const deck = plane(49, 13, PAL.stone, { receive: true });
    deck.position.set(0, DECK.terrace + 0.014, -5.25);
    root.add(deck);

    // The front parapet, in two spans with a gap at the head of the fire escape.
    // The gap is not decoration: the parapet is 0.7 above the deck, which is
    // over the crow's 0.34 scramble, so without a way through, arriving by the
    // stairs would mean one more flap for no reason at the top of every climb.
    const wall = (cx, w) => {
      const b = box(w, 0.7, 0.6, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
      b.position.set(cx, DECK.terrace + 0.35, 1.2);
      root.add(b);
      solid(cx, 1.2, w, 0.6, DECK.terrace + 0.7, DECK.terrace);
      return b;
    };
    const parapetL = wall(-15.5, 19);
    const parapetR = wall(10.75, 28.5);
    // The near-side parapet is the one thing on this block that regularly stands
    // between the camera and a crow on the terrace, so it fades like the café
    // awning does on level 1.
    occluders.push(parapetL, parapetR);
    perch(-15.5, DECK.terrace + 0.7, 1.2);
    perch(18, DECK.terrace + 0.7, 1.2);
    perch(4, DECK.terrace + 0.7, 1.2);

    // Ends and the back edge, so the terrace is a room rather than a plateau.
    for (const [cx, cz, w, d] of [
      [-24.6, -5.25, 0.6, 13.5], [24.6, -5.25, 0.6, 13.5], [8.5, -11.7, 33, 0.6],
    ]) {
      const b = box(w, 0.7, d, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
      b.position.set(cx, DECK.terrace + 0.35, cz);
      root.add(b);
      solid(cx, cz, w, d, DECK.terrace + 0.7, DECK.terrace);
    }
  }

  // ── the upper storey, at the back left ────────────────────────────────────
  // x −24…−8, z −12…−5.5. It makes the terrace an L rather than a rectangle,
  // and it is the deck the nest sits above.
  {
    const g = new THREE.Group();
    const mass = box(16, DECK.roof, 6.5, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    mass.position.set(-16, DECK.roof / 2, -8.75);
    g.add(mass);
    root.add(g);
    solid(-16, -8.75, 16, 6.5, DECK.roof);

    const deck = plane(15.6, 6.1, PAL.stoneMid, { receive: true });
    deck.position.set(-16, DECK.roof + 0.014, -8.75);
    root.add(deck);

    const rail = box(16, 0.6, 0.5, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    rail.position.set(-16, DECK.roof + 0.3, -5.75);
    root.add(rail);
    solid(-16, -5.75, 16, 0.5, DECK.roof + 0.6, DECK.roof);
    perch(-16, DECK.roof + 0.6, -5.75);

    // The way in. A terrace with two staff on it and no door says everybody
    // climbed the fire escape, which is both silly and — now that the kid has
    // moved up here — the opposite of what the level is trying to say about the
    // fire escape being optional.
    const door = box(1.7, 2.4, 0.22, PAL.barkShade, { shadow: false });
    door.position.set(-14, DECK.terrace + 1.2, -5.38);
    root.add(door);
    night.add(door, 0xe0a860, { peak: 0.5, warm: 2.8, delay: 1.3 });
    night.addPool(root, -14, -4.4, 3.6,
      { profile: 'stall', peak: 0.5, warm: 2.8, delay: 1.3, y: DECK.terrace });
    const frame = box(2.1, 2.7, 0.1, PAL.stone, { shadow: false });
    frame.position.set(-14, DECK.terrace + 1.35, -5.45);
    root.add(frame);
  }

  // ── the plant room, on the right of the terrace ───────────────────────────
  // A mid-height perch on the far side of the roof, so the climb to the nest
  // from the pool end is broken up too.
  {
    const g = new THREE.Group();
    g.add(at(box(4.5, 2.4, 4, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), 19, DECK.terrace + 1.2, -9.5));
    g.add(at(cyl(0.5, 0.5, 1.0, 8, PAL.steel, { up: PAL.silver, down: PAL.steelDark }), 18, DECK.terrace + 3.1, -9.5));
    g.add(at(cyl(0.62, 0.62, 0.14, 8, PAL.steelDark, { up: PAL.steel }), 18, DECK.terrace + 3.65, -9.5));
    const svc = box(1.3, 2.0, 0.2, PAL.steel, { shadow: false });
    svc.position.set(19, DECK.terrace + 1.0, -7.42);
    g.add(svc);
    root.add(g);
    solid(19, -9.5, 4.5, 4, DECK.terrace + 2.4, DECK.terrace);
    perch(19, DECK.terrace + 2.4, -9.5);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE WATER TANK, and the nest on top of it
  // ══════════════════════════════════════════════════════════════════════════
  const NEST = { x: TANK.x, y: DECK.roof + 3.15, z: TANK.z };
  {
    const g = new THREE.Group();
    const legTop = DECK.roof + 0.8;
    for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
      g.add(at(cyl(0.11, 0.11, 0.8, 5, PAL.steel, { up: PAL.steel, down: PAL.steelDark }), lx, DECK.roof + 0.4, lz));
    }
    const staves = cyl(2.4, 2.2, 2.2, 14, PAL.bark, { up: PAL.bark, down: PAL.barkShade });
    staves.position.y = legTop + 1.1;
    g.add(staves);
    for (const by of [legTop + 0.4, legTop + 1.75]) {
      g.add(at(cyl(2.44, 2.44, 0.08, 14, PAL.steelDark, { up: PAL.steel }), 0, by, 0));
    }
    const lid = cyl(2.42, 2.42, 0.12, 14, PAL.steelDark, { up: PAL.steel, down: PAL.shade });
    lid.position.y = legTop + 2.26;
    g.add(lid);

    // A warning bead on the tank, because it is the tallest thing on the block
    // and because after dark it is the only mark on the skyline that says
    // "the nest is that way".
    const bead = at(ico(0.11, 0, PAL.gold, { shadow: false }), 1.9, legTop + 2.4, 0);
    bead.material = mat(PAL.gold);
    g.add(bead);
    night.add(bead, PAL.gold, { peak: 0.95, warm: 1.1, delay: 2.2, flicker: true });

    const nest = makeNest();
    nest.position.set(0, legTop + 2.32, 0);
    g.add(nest);

    g.position.set(TANK.x, 0, TANK.z);
    root.add(g);
    root.userData.nestGroup = nest;

    // The lid is round and the collider is the square inside it, so the crow can
    // never stand on a corner with nothing under it. 3.35 against a 1.5 twig
    // ring clears RULES.nestPlatformRatio with room to spare, which matters more
    // here than it did on the memorial: you arrive at this one out of breath.
    solid(TANK.x, TANK.z, 3.35, 3.35, legTop + 2.32, legTop);
    perch(TANK.x, legTop + 2.32, TANK.z);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE FIRE ESCAPE — the authored route up, and the one the kid sits on
  // ══════════════════════════════════════════════════════════════════════════
  {
    const g = new THREE.Group();
    // Landings are thin: 0.25 of steel with air under them, so the crow can fly
    // beneath the whole assembly and the porter can walk under it.
    const landing = (cx, top) => {
      const b = box(3.0, 0.12, 1.8, PAL.steelDark, { up: PAL.steel, down: PAL.shade });
      b.position.set(cx, top - 0.06, 2.3);
      g.add(b);
      for (const s of [-1, 1]) {
        const rail = box(3.0, 0.07, 0.07, PAL.steel);
        rail.position.set(cx, top + 0.75, 2.3 + s * 0.85);
        g.add(rail);
        for (const rx of [-1.4, 0, 1.4]) {
          g.add(at(cyl(0.04, 0.04, 0.8, 4, PAL.steel), cx + rx, top + 0.4, 2.3 + s * 0.85));
        }
      }
      solid(cx, 2.3, 3.0, 1.8, top, top - 0.25);
      perch(cx, top, 2.3);
    };
    landing(-5.0, DECK.escape);
    landing(-1.6, 3.65);
    landing(-5.0, 5.25);

    // The flights between them. Visual only — the crow has wings and a staircase
    // it cannot use is a staircase that only ever gets in the way.
    // Only the two diagonals. There was a third, from the ground to the first
    // landing, and because it was vertical it rendered as a 1.8m slab stood on
    // end against the wall.
    for (const [x0, x1, y0, y1] of [[-5.0, -1.6, DECK.escape, 3.65], [-1.6, -5.0, 3.65, 5.25]]) {
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1.8;
      const flight = box(len, 0.09, 0.9, PAL.steel, { up: PAL.silver, down: PAL.shade });
      flight.position.set((x0 + x1) / 2, (y0 + y1) / 2, 2.3);
      flight.rotation.z = Math.atan2(dy, dx);
      g.add(flight);
    }
    root.add(g);
    // It stands between the camera and anything on the hotel wall behind it.
    occluders.push(...g.children.filter((c) => c.isMesh));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE CRADLE — a window cleaner's platform, hanging where nobody can guard it
  // ══════════════════════════════════════════════════════════════════════════
  {
    const g = new THREE.Group();
    g.add(at(box(2.4, 0.1, 1.0, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), 0, CRADLE.y - 0.05, 0));
    for (const s of [-1, 1]) {
      g.add(at(box(2.4, 0.06, 0.06, PAL.steel), 0, CRADLE.y + 0.55, s * 0.47));
      g.add(at(cyl(0.03, 0.03, 2.6, 4, PAL.steel), s * 1.1, CRADLE.y + 1.9, 0));
    }
    const bucket = cyl(0.24, 0.19, 0.34, 8, PAL.cloth[1], { up: PAL.clothLit[1], down: PAL.shade });
    bucket.position.set(-0.7, CRADLE.y + 0.17, 0);
    g.add(bucket);
    g.position.set(CRADLE.x, 0, CRADLE.z);
    root.add(g);
    solid(CRADLE.x, CRADLE.z, 2.4, 1.0, CRADLE.y, CRADLE.y - 0.25);
    perch(CRADLE.x, CRADLE.y, CRADLE.z);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE TERRACE — where the money is
  // ══════════════════════════════════════════════════════════════════════════
  const tableTops = TABLES.map((t) => addTable(t.x, t.z, DECK.terrace, {
    chair: PAL.cloth[3], chairLit: PAL.clothLit[3],
  }).top);

  // The candle lantern holding the check down. Level 1's saltshaker, and it is
  // the same verb on purpose: SHOVE is taught on the block and charged for up
  // here, where the thing you are shoving is on a table beside a man who is
  // paid to notice.
  const lantern = group(
    at(box(0.17, 0.20, 0.17, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), 0, 0.10, 0),
    at(box(0.13, 0.16, 0.13, PAL.goldLit, { shadow: false }), 0, 0.11, 0),
    at(box(0.19, 0.04, 0.19, PAL.steelDark, { shadow: false }), 0, 0.22, 0),
  );
  lantern.position.set(tableTops[2].x - 0.02, tableTops[2].y, tableTops[2].z + 0.02);
  lantern.userData.label = 'THE LANTERN';
  root.add(lantern);
  night.add(lantern.children[1], PAL.goldLit, { peak: 0.8, warm: 2.0, delay: 1.2, flicker: true });

  // The maître d's stand, and the heat lamp over it.
  const lectern = new THREE.Group();
  {
    lectern.add(at(box(1.0, 1.1, 0.7, PAL.bark, { up: PAL.barkShade, down: PAL.shade }), 0, 0.55, 0));
    lectern.add(at(box(1.06, 0.08, 0.76, PAL.barkShade, { up: PAL.bark }), 0, 1.12, 0));
    lectern.add(at(cyl(0.05, 0.05, 2.3, 6, PAL.steelDark), 0.8, 1.15, -0.4));
    const element = cone(0.42, 0.5, 8, PAL.steelDark, { up: PAL.steel, down: PAL.shade });
    element.position.set(0.8, 2.5, -0.4);
    lectern.add(element);
    const glow = at(ico(0.2, 0, PAL.gold, { shadow: false }), 0.8, 2.28, -0.4);
    glow.material = mat(PAL.gold);
    lectern.add(glow);
    night.add(glow, 0xe07a34, { peak: 0.72, warm: 3.0, delay: 0.8 });
    night.addPool(root, LECTERN.x + 0.8, LECTERN.z - 0.4, 3.6,
      { profile: 'stall', peak: 0.66, warm: 3.0, delay: 0.8, y: DECK.terrace });
    lectern.position.set(LECTERN.x, DECK.terrace, LECTERN.z);
    root.add(lectern);
    solid(LECTERN.x, LECTERN.z, 1.0, 0.7, DECK.terrace + 1.2, DECK.terrace);
    perch(LECTERN.x, DECK.terrace + 1.2, LECTERN.z);
  }

  // The sun lounger by the pool, and the wallet somebody left on it.
  {
    const g = new THREE.Group();
    g.add(at(box(2.0, 0.12, 0.7, PAL.cloth[4], { up: PAL.clothLit[4], down: PAL.shade }), 0, 0.42, 0));
    g.add(at(box(0.7, 0.12, 0.7, PAL.cloth[4], { up: PAL.clothLit[4], down: PAL.shade }), -0.9, 0.62, 0));
    for (const [sx, sz] of [[-0.85, -0.28], [-0.85, 0.28], [0.85, -0.28], [0.85, 0.28]]) {
      g.add(at(box(0.06, 0.36, 0.06, PAL.steel), sx, 0.2, sz));
    }
    g.position.set(18, DECK.terrace, -2);
    g.rotation.y = 0.4;
    root.add(g);
    solid(18, -2, 2.1, 1.4, DECK.terrace + 0.48, DECK.terrace);
    perch(18, DECK.terrace + 0.48, -2);
  }

  // Festoon lights, strung the length of the terrace on two poles. They are the
  // terrace's whole night identity and they cost eleven boxes.
  {
    const g = new THREE.Group();
    const bulbs = [];
    for (const px of [-21, 21]) {
      g.add(at(cyl(0.07, 0.09, 3.0, 6, PAL.steelDark), px, DECK.terrace + 1.5, -1.4));
    }
    const wire = box(42, 0.03, 0.03, PAL.steelDark, { shadow: false });
    wire.position.set(0, DECK.terrace + 2.86, -1.4);
    g.add(wire);
    for (let i = 0; i < 11; i++) {
      const x = -20 + i * 4;
      // A shallow catenary, faked with a cosine. Nobody will measure it.
      const sag = Math.cos((i / 10 - 0.5) * Math.PI) * 0.34;
      const b = at(ico(0.13, 0, PAL.goldLit, { shadow: false }), x, DECK.terrace + 2.78 - sag, -1.4);
      b.material = mat(PAL.goldLit);
      g.add(b);
      bulbs.push(b);
    }
    root.add(g);
    night.add(bulbs, PAL.goldLit, { peak: 0.92, warm: 2.2, delay: 0.35 });
    // Three overlapping plateaus rather than eleven point sources: a strung wire
    // lights a strip, and eleven pools would cost eleven quads to say so.
    for (const px of [-13, 0, 12]) {
      night.addPool(root, px, -1.4, 6.4,
        { profile: 'stall', peak: 0.52, warm: 2.2, delay: 0.35, y: DECK.terrace });
    }
  }

  addPlanter(-20.5, -1.2, DECK.terrace, { w: 1.5 });
  addPlanter(22, -6.5, DECK.terrace, { w: 1.5 });

  // The kid's bench, on the terrace a step inside the gap in the parapet.
  //
  // She used to sit on the first fire-escape landing, which was evocative and
  // wrong: trading shinies is core loop, and it put the core loop on a 3×1.8m
  // steel platform three metres up a wall — the single most awkward place to
  // land on the block. The fire escape stays; nothing requires it any more.
  addBench(KID.x, KID.z + 0.95);

  // Aerials and chimney pots, for the silhouette. No colliders — they are too
  // thin to land on and pretending otherwise would only produce invisible walls.
  for (const [cx, cz, h] of [[-21, -10.5, 1.4], [-12.5, -10.8, 1.1], [-19, -6.8, 0.9]]) {
    const pot = cyl(0.22, 0.26, h, 6, PAL.terracotta, { up: PAL.terracottaLit, down: PAL.shade });
    pot.position.set(cx, DECK.roof + h / 2, cz);
    root.add(pot);
  }
  {
    const a = new THREE.Group();
    a.add(at(cyl(0.04, 0.04, 2.4, 4, PAL.steelDark), 0, 1.2, 0));
    for (let i = 0; i < 5; i++) {
      a.add(at(box(0.03, 0.03, 1.1 - i * 0.13, PAL.steelDark, { shadow: false }), 0, 1.5 + i * 0.22, 0));
    }
    a.position.set(-10.5, DECK.roof, -10.8);
    root.add(a);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE FORECOURT — the guest side, and the reason to be on the ground at all
  // ══════════════════════════════════════════════════════════════════════════
  // It was a service yard: bins, crates, a van, and nothing a person would ever
  // walk into on purpose. A hotel has a front, the front is where a fountain
  // belongs, and giving the ground floor something worth looking at is what
  // stops the whole level being "the terrace, plus a walk".
  const FOUNTAIN_ = addPool(POOL.x, POOL.z, POOL.r, DECK.yard, { tag: 'fountain-rim' });
  const FOUNTAIN = FOUNTAIN_.spec;
  root.userData.fountainWater = FOUNTAIN_.water;
  {
    const g = FOUNTAIN_.group;
    const stem = cyl(0.32, 0.5, 1.5, 8, PAL.stone, { up: PAL.stone, down: PAL.shade });
    stem.position.y = FOUNTAIN.rim + 0.75;
    g.add(stem);
    const dish = cyl(1.15, 0.34, 0.34, 12, PAL.stone, { up: PAL.stone, down: PAL.shade });
    dish.position.y = FOUNTAIN.rim + 1.62;
    g.add(dish);
    perch(POOL.x, FOUNTAIN.rim + 1.85, POOL.z);
    // Faint, from under the water. The brief's rule is that nothing added may
    // outshine a pickup glint, and this is the largest emissive surface down here.
    night.add(FOUNTAIN_.water, PAL.water, { peak: 0.055, warm: 5.0, delay: 1.6 });
  }

  // The garden the fountain stands in — four low kerbed beds, so the forecourt
  // has a shape rather than being paving with things on it.
  //
  // At 0.3 they are under the crow's 0.34 scramble and the walker's 0.45 step,
  // so they stop nobody and are pure silhouette. The one thing they can still do
  // is swallow a coin, so nothing takeable goes inside one.
  for (const [gx, gz, gw, gd] of [
    [-11, 2.8, 13, 1.0], [-11, 14.2, 13, 1.0], [-17, 8.5, 1.0, 12.4], [-5, 8.5, 1.0, 12.4],
  ]) {
    const bed = box(gw, 0.3, gd, PAL.canopy, { up: PAL.canopyLit, down: PAL.canopyShade });
    bed.position.set(gx, 0.15, gz);
    root.add(bed);
    const kerb = box(gw + 0.3, 0.22, gd + 0.3, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    kerb.position.set(gx, 0.11, gz);
    root.add(kerb);
    solid(gx, gz, gw + 0.3, gd + 0.3, 0.3);
  }

  // The entrance canopy. The one deliberate near-side occluder on this deck.
  {
    const g = new THREE.Group();
    const awn = box(7.0, 0.24, 2.4, PAL.awning, { up: PAL.awningLit, down: PAL.awning });
    awn.position.set(0, 3.3, 1.3);
    g.add(awn);
    for (let i = 0; i < 5; i++) {
      const stripe = box(1.3, 0.26, 2.4, i % 2 ? PAL.stone : PAL.awningLit, { shadow: false, receive: false });
      stripe.position.set(-2.8 + i * 1.4, 3.31, 1.3);
      g.add(stripe);
    }
    for (const sx of [-3.2, 3.2]) {
      g.add(at(cyl(0.09, 0.09, 3.2, 6, PAL.steel, { up: PAL.steel, down: PAL.steelDark }), sx, 1.6, 2.3));
    }
    const door = box(2.4, 2.9, 0.22, PAL.barkShade, { shadow: false });
    door.position.set(0, 1.45, 0.14);
    g.add(door);
    night.add(door, 0xe0a860, { peak: 0.66, warm: 2.6, delay: 0.5 });
    g.position.set(ENTRANCE.x, 0, ENTRANCE.z);
    root.add(g);
    occluders.push(awn, ...g.children.filter((c) => c.isMesh && c.position.z > 1.0));
    solid(ENTRANCE.x, ENTRANCE.z + 1.3, 7.0, 2.4, 3.42, 3.1);
    perch(ENTRANCE.x - 2, 3.42, ENTRANCE.z + 1.3);
    perch(ENTRANCE.x + 2, 3.42, ENTRANCE.z + 1.3);
    night.addPool(root, ENTRANCE.x, ENTRANCE.z + 2.0, 5.0, { profile: 'stall', peak: 0.76, warm: 2.6, delay: 0.5 });
  }

  addBench(-20, 6.5, Math.PI / 2);
  addBench(-20, 11.5, Math.PI / 2);
  addBench(-2.0, 9.5, Math.PI / 2);
  addLamp(-22.5, 9.0);
  addLamp(-2.0, 4.5);
  addTree(-23.5, 13.5, 0.85, { occlude: true });
  addPlanter(-1.5, 13.5, 0, { w: 1.4 });

  // ══════════════════════════════════════════════════════════════════════════
  // THE LOADING END — everything the forecourt is not
  // ══════════════════════════════════════════════════════════════════════════
  // Half the ground floor is still back-of-house, because the chef has to be
  // standing in something and because the crow needs one stretch of the block
  // that is not a garden.
  {
    const door = box(1.9, 2.7, 0.22, PAL.barkShade, { shadow: false });
    door.position.set(SERVICE.x, 1.35, 1.62);
    root.add(door);
    night.add(door, 0xe0a860, { peak: 0.6, warm: 2.6, delay: 1.1 });
    night.addPool(root, SERVICE.x, 3.4, 4.4, { profile: 'stall', peak: 0.7, warm: 2.6, delay: 1.1 });
  }
  addLamp(9, 11);
  addBin(6.5, 12.4, PAL.canopy);
  addBin(8.0, 13.8, PAL.steel);
  addBin(22.5, 9.5, PAL.canopy);

  const addCrates = (x, z, n = 3) => {
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const sz = 1.3 - i * 0.09;
      // Pale crates. The dark stack was one of the few things left in the
      // darkest 5% of the dusk frame once the wall stopped being.
      const c = box(sz, 0.62, sz, i % 2 ? PAL.pavingMid : PAL.bark, { up: PAL.paving, down: PAL.shade });
      c.position.set((Math.random() - 0.5) * 0.16, 0.31 + i * 0.63, (Math.random() - 0.5) * 0.16);
      c.rotation.y = (Math.random() - 0.5) * 0.3;
      g.add(c);
    }
    g.position.set(x, 0, z);
    root.add(g);
    const top = n * 0.63;
    solid(x, z, 1.4, 1.4, top);
    perch(x, top, z);
    return top;
  };
  const dockCrateTop = addCrates(20.5, 4.2, 3);
  addCrates(11.5, 6.6, 2);
  const doorCrateTop = addCrates(11.0, 3.4, 1);

  // The loading dock — a raised lip, and the first thing to stand on out of the
  // forecourt. Everything about this block is a staircase.
  {
    const d = box(8, 1.15, 4, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    d.position.set(DOCK.x, 0.575, DOCK.z);
    root.add(d);
    solid(DOCK.x, DOCK.z, 8, 4, 1.15);
    perch(DOCK.x, 1.15, DOCK.z);
  }

  // The delivery van. Near side, so it fades rather than hiding the block.
  {
    const g = new THREE.Group();
    // A white van. It was navy, and a 7m navy box is the second-darkest thing on
    // a block whose luminance floor was already failing.
    const body = box(4.8, 2.2, 2.2, PAL.stone, { up: PAL.stone, down: PAL.shade });
    body.position.set(0, 1.45, 0);
    g.add(body);
    const cab = box(2.4, 1.5, 2.2, PAL.stone, { up: PAL.stone, down: PAL.shade });
    cab.position.set(-3.6, 1.1, 0);
    g.add(cab);
    const stripe = box(4.85, 0.4, 2.25, PAL.cloth[1], { up: PAL.clothLit[1], down: PAL.shade, shadow: false });
    stripe.position.set(0, 1.1, 0);
    g.add(stripe);
    const glass = box(0.16, 0.7, 1.7, PAL.waterLit, { shadow: false });
    glass.position.set(-4.75, 1.5, 0);
    g.add(glass);
    for (const [wx, wz] of [[1.4, 1.1], [1.4, -1.1], [-3.2, 1.1], [-3.2, -1.1]]) {
      const w = cyl(0.45, 0.45, 0.24, 10, PAL.steelDark, { up: PAL.steel });
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.45, wz);
      g.add(w);
    }
    g.position.set(17, 0, 11);
    root.add(g);
    occluders.push(body, cab);
    // Body and cab share a z extent exactly. They used to differ by 0.1, which
    // left a 0.1m notch at the join — and a walker steered into that notch is in
    // a concave pocket it cannot commit its way out of.
    solid(17, 11, 4.8, 2.2, 2.55);
    solid(13.4, 11, 2.4, 2.2, 1.85);
    perch(17, 2.55, 11);
  }

  return {
    root, colliders, occluders, perches,
    nightLights: night,
    fountain: FOUNTAIN,
    waterDeck: DECK.yard,
    nest: NEST,
    nestPlatform: 3.35,
    nestFootprint: 1.5,
    decks: DECK,
    tables: tableTops,
    // The weighted object you have to move before the money under it is loose —
    // level 1's saltshaker, in a different hat.
    pin: lantern,
    pickups: pickupPlacements({ FOUNTAIN, tableTops, dockCrateTop, doorCrateTop }),
    humans: humanPlacements(),
    gulls: gullPlacements(),
    pigeons: pigeonPlacements(),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Placements
// ════════════════════════════════════════════════════════════════════════════

/**
 * The value ladder, stood on its end.
 *
 * $58.75 of money against a $40 target, and where it sits is the whole design:
 * $9.05 is unguarded and dry, and almost all of that is small change lying in a
 * yard twelve metres below the nest. The arithmetic a player does here is not
 * "can I reach it" but "is it worth the climb", which is a question level 1
 * never asks. docs/level-2-brief.html §3.
 */
function pickupPlacements({ FOUNTAIN, tableTops, dockCrateTop, doorCrateTop }) {
  const p = [];
  const add = (kind, value, x, y, z, extra = {}) =>
    p.push({ kind, value, pos: [x, y, z], ...extra });

  const Y = DECK.yard, T = DECK.terrace, R = DECK.roof;

  // — The forecourt: free, plentiful, and priced by the climb rather than by a
  //   guard. This is the level's whole argument in coin form.
  //
  //   All of it outside the garden ring (x −17.5…−4.5, z 2.3…14.7): a bed is
  //   only 0.3 tall and stops nobody, but it will happily swallow a penny. —
  for (const [x, z] of [
    [-22.0, 4.0], [-19.5, 14.0], [-2.5, 6.5], [-1.0, 12.0], [-24.0, 7.5],
    [2.5, 5.0], [4.0, 13.5], [12.0, 13.8], [22.0, 12.5], [-20.5, 14.3],
  ]) add('penny', 0.01, x, Y + 0.06, z);
  for (const [x, z] of [[-24.0, 11.0], [-2.5, 14.5], [6.5, 8.5], [23.5, 5.5]]) {
    add('nickel', 0.05, x, Y + 0.06, z);
  }
  // On the loading dock rather than in front of it: at ground level the dock's
  // own 1.15m lip stood between this coin and the camera.
  add('nickel', 0.05, DOCK.x - 2.2, 1.15 + 0.06, DOCK.z);
  for (const [x, z] of [[-21.5, 6.0], [1.0, 9.0], [12.0, 8.5], [-7.0, 15.0]]) {
    add('dime', 0.10, x, Y + 0.06, z);
  }
  // In the drain grate by the door of the service end.
  add('quarter', 0.25, 8.0, Y + 0.09, 11.5);
  add('quarter', 0.25, 8.3, Y + 0.09, 12.2);

  // The porter's open crate, and the chef's tin by the service door.
  add('coins', 1.20, 20.5, dockCrateTop + 0.04, 4.2, { owner: 'porter' });
  add('bill5', 5.00, 11.0, doorCrateTop + 0.04, 3.4, { owner: 'chef', label: 'THE TIN' });

  // — The fire escape: still worth climbing, no longer required to. —
  add('coins', 0.70, -5.9, DECK.escape + 0.04, 2.4);
  add('dime', 0.10, -1.6, 3.65 + 0.04, 2.5);

  // — The cradle: unguarded, and hard for entirely geometric reasons —
  // Beside the bucket, not in it: inside, the bucket hid it, and further back
  // the cradle's own guard rail did.
  add('bill5', 5.00, 13.6, 4.05, 2.1, { label: "THE CLEANER'S FIVE", inCradle: true });

  // — The terrace: one idea per table —
  add('coins', 0.85, tableTops[0].x - 0.18, tableTops[0].y + 0.04, tableTops[0].z + 0.14, { owner: 'busser' });
  add('coins', 1.10, tableTops[4].x + 0.16, tableTops[4].y + 0.04, tableTops[4].z - 0.12, { owner: 'busser' });
  // The tip glass — three singles, which read as one heap.
  for (let i = 0; i < 3; i++) {
    add('bill1', 1.00, tableTops[1].x - 0.1 + i * 0.07, tableTops[1].y + 0.05 + i * 0.02, tableTops[1].z + 0.1,
      { owner: 'busser', inJar: true });
  }
  // The check, under the candle lantern. The same puzzle as the saltshaker, and
  // deliberately so: the verb is taught on level 1 and charged for here.
  add('bill5', 5.00, tableTops[2].x + 0.14, tableTops[2].y + 0.03, tableTops[2].z - 0.36,
    { owner: 'busser', pinned: true, label: 'THE CHECK' });

  // Wishing coins on the basin floor, so you have to go in.
  //
  // Radii capped at 1.9. Further out and a coin's sightline to the camera clips
  // the inside of the basin wall on the way up: the rim is 0.28 above the coins
  // and the camera climbs at 38°, which buys 0.36 of horizontal travel to clear
  // it. Level 1's 5.2m basin is wide enough that nobody had to think about this.
  for (const [deg, r] of [[30, 1.6], [95, 1.9], [160, 1.5], [215, 1.9], [285, 1.65], [340, 1.85]]) {
    const a = (deg * Math.PI) / 180;
    add('quarter', 0.25,
      FOUNTAIN.x + Math.cos(a) * r, FOUNTAIN.rim - 0.28, FOUNTAIN.z + Math.sin(a) * r,
      { inWater: true });
  }

  // The wallet on the lounger, and the bill-fold on the stand.
  add('bill10', 10.00, 17.6, T + 0.54, -2.3, { owner: 'maitre', label: 'A WALLET' });
  add('bill20', 20.00, LECTERN.x - 0.05, T + 1.20, LECTERN.z + 0.12,
    { owner: 'maitre', label: 'THE BILL-FOLD' });

  // — Shinies: worthless, tradeable. One per deck, so a lap of the block is
  //   always worth something even when the money you wanted has gone. —
  add('shiny', 0, 5.0, Y + 0.07, 3.6, { shinyKind: 'foil' });
  add('shiny', 0, -4.1, DECK.escape + 0.07, 2.15, { shinyKind: 'screw' });
  add('shiny', 0, FOUNTAIN.x + 2.6, FOUNTAIN.rim - 0.28, FOUNTAIN.z + 0.9, { inWater: true, shinyKind: 'clip' });
  add('shiny', 0, -21.5, R + 0.07, -8.5, { shinyKind: 'fob' });
  add('shiny', 0, KID.x + 3.4, T + 0.07, KID.z - 0.6, { shinyKind: 'marble' });

  // — The chips. Not money; the only way to move six gulls and a maître d'. —
  add('chips', 0, tableTops[3].x, tableTops[3].y + 0.02, tableTops[3].z,
    { label: 'A CONE OF CHIPS' });

  p.forEach((x, i) => { x.id = i; });
  return p;
}

function humanPlacements() {
  return [
    {
      id: 'maitre', name: "the maître d'", cloth: 1, skin: 1, hair: 1,
      pos: [-13, DECK.terrace, -3.5], home: [-13, DECK.terrace, -3.5],
      patrol: [[-13, -3.5], [-6, -1], [2, -3], [-9, -4.5]],
      speed: 1.4, chaseSpeed: 4.4, viewDist: 10.5, viewCos: 0.25, guardRadius: 4.0, alertness: 1.3,
    },
    {
      id: 'busser', name: 'the busser', cloth: 0, skin: 2, hair: 0,
      pos: [-4.8, DECK.terrace, -3.4], home: [-4.8, DECK.terrace, -3.4],
      patrol: [[-4.8, -3.4], [2.0, -4.8], [6.0, 0.0], [-10.6, -0.3]],
      speed: 1.6, chaseSpeed: 4.2, viewDist: 9.0, viewCos: 0.35, guardRadius: 3.2, alertness: 1.0,
    },
    {
      id: 'chef', name: 'the chef on a break', cloth: 2, skin: 0, hair: 2,
      // In the service doorway, facing out. He is not watching the loading bay,
      // he is watching the middle distance, which is why his cone is narrow and
      // his tin is not.
      pos: [SERVICE.x, DECK.yard, 3.0], home: [SERVICE.x, DECK.yard, 3.0],
      patrol: null, speed: 1.0, chaseSpeed: 3.6, viewDist: 8, viewCos: 0.45, guardRadius: 3.0, alertness: 0.8,
      faces: [0, 1],
    },
    {
      id: 'porter', name: 'the porter', cloth: 3, skin: 3, hair: 3,
      pos: [8, DECK.yard, 8], home: [8, DECK.yard, 8],
      patrol: [[8, 8], [14, 13.5], [22, 12], [23, 4], [15.5, 8.5], [3, 11]],
      speed: 1.35, chaseSpeed: 3.4, viewDist: 3.2, viewCos: 0.8, guardRadius: 1.8, alertness: 0.3,
      oblivious: true,
    },
    {
      id: 'guest', name: 'a guest waiting for a car', cloth: 4, skin: 1, hair: 0,
      // Somebody has to be standing in a hotel forecourt. He owns nothing and
      // notices nothing; he is a body to steer round on the deck the level's
      // cheapest money is lying on.
      pos: [-8.4, DECK.yard, 3.4], home: [-8.4, DECK.yard, 3.4],
      patrol: null, speed: 1.0, chaseSpeed: 3.0, viewDist: 3.0, viewCos: 0.8, guardRadius: 1.4, alertness: 0.2,
      oblivious: true, faces: [1, 0],
    },
    {
      id: 'kid', name: 'the kid on the terrace', cloth: 2, skin: 2, hair: 2,
      // On the terrace, a step inside the gap in the parapet, facing the head of
      // the fire escape. She used to sit on the first fire-escape landing, which
      // put the core loop — trade a shiny, get cash — on the most awkward landing
      // surface on the block.
      pos: [KID.x, DECK.terrace, KID.z], home: [KID.x, DECK.terrace, KID.z],
      patrol: null, speed: 0, chaseSpeed: 0, viewDist: 0, viewCos: 1, guardRadius: 0, alertness: 0,
      kid: true, small: true, faces: [0, 1],
    },
  ];
}

/**
 * Where the gulls sit.
 *
 * These are the level's cover, inverted. On the block you could put a plane tree
 * between yourself and the waiter; on a terrace there is nothing to put anywhere,
 * so the danger is authored as birds. Two on the parapet either side of the
 * lectern, one by the pool, two on the roof — which is to say, one on every
 * approach to something expensive.
 */
function gullPlacements() {
  return [
    { x: -18.5, z: 1.2, y: DECK.terrace + 0.7 },
    { x: -9.5, z: 1.2, y: DECK.terrace + 0.7 },
    { x: 15.5, z: 1.2, y: DECK.terrace + 0.7 },
    { x: 9.6, z: -8.4, y: DECK.terrace },
    { x: -13.5, z: -9.6, y: DECK.roof },
    { x: -19.5, z: -7.4, y: DECK.roof },
  ];
}

/** Forecourt pigeons, round the fountain where the tourists drop things. */
function pigeonPlacements() {
  return [
    { x: -7.5, z: 11.5 }, { x: -14.5, z: 12.0 }, { x: -19, z: 7.5 },
    { x: 4, z: 11 }, { x: 10.5, z: 9.5 },
  ];
}
