/**
 * LEVEL 6 — The Container Ship.
 *
 * The ship that sat in the wharf's backdrop for a whole level, boarded, and now
 * days out in open water with no land in any direction.
 *
 * What it spends is **reach**. The deck is a wide-open steel floor with cargo
 * standing on it in ones and twos, and the whole level turns on two numbers
 * that were already true before this file existed:
 *
 *   - A container is 2.4 tall. At this camera that hides 1.16 x 2.4 = 2.78m of
 *     deck — about what a litter bin already costs level 1. To a guard, whose
 *     eye is at WALKER_EYE (1.60), the same box hides *everything* behind it.
 *     So the player sees the whole board and the crew see almost none of it.
 *   - A guard gives up once the crow is 1.9 above their own floor, and the shoo
 *     itself needs 1.6. A box top is 2.4, or 3.0 standing on a hatch cover. So
 *     one hop up is safe everywhere, and safe by half a metre rather than by a
 *     hair.
 *
 * The consequence is a loop no other block has: you have perfect information
 * and the money is all on the floor with the people. Watch, drop, grab, hop
 * back up. Height is not a reward here — it is a pause button, and the cost of
 * pressing it is that you are not carrying anything while you do.
 *
 * The counterweight is the mate on the bridge wing at 6.6, who is the one
 * person high enough that the cargo does not help you, and a third of the money
 * is in his half of the ship.
 *
 * Nothing here is a new mechanic. The sight change that makes it work shipped
 * separately, as a bug fix, and applies to all six blocks.
 *
 * See docs/ship-brief.html.
 */

import * as THREE from 'three';
import { PAL } from '../render/palette.js';
import { box, cyl, cone, ico, plane, at, group, mat } from '../render/shapes.js';
import { NightLights } from '../render/nightlights.js';
import { WATER_EDGE_PAD } from './collide.js';
import { makeKit } from './kit.js';
import { RULES } from './rules.js';

/** The wharf's footprint. A ship does not want more beam than that. */
export const BOUNDS = { minX: -30, maxX: 30, minZ: -12, maxZ: 13 };

/**
 * Five decks, and four of them are one flap apart.
 *
 * This is not the roofline. There the decks are far apart and climbing is the
 * difficulty; here the tallest unbroken climb is 3.0m against a 9m rule,
 * because the climb is meant to be free. What it buys is not altitude, it is
 * being out of arm's reach.
 */
export const DECK = {
  deck: 0,
  /**
   * The hatch covers, and 0.40 is load-bearing in two directions at once.
   *
   * Below `WALKER_STEP_OVER` (0.45), so the crew walk straight across them and
   * the deck stays one connected floor — at 0.6 they were 15m walls splitting
   * the ship into islands, and every chase probe and half the patrol waypoints
   * failed on it. And below `SIGHT_OVER` (0.85), so a guard looks over them
   * rather than being blinded by the floor.
   *
   * So they are texture and scale and nothing else, which is exactly the job: a
   * real ship's deck is mostly hatch cover, and this block wants an open floor.
   */
  hatch: 0.40,
  boxTop: 2.80,    // a container standing on a hatch cover
  boat: 3.4,       // the house's boat deck
  bridge: 6.6,     // the bridge wing — the mate's floor
};

/**
 * The waterline, and it is a compromise being written down as one.
 *
 * A loaded ship's freeboard is several metres. At -2.6 this block's near
 * topside was a 3.4m band running the whole width of every frame, facing the
 * camera — and **the sun is behind the block all day**, so that band is in
 * shadow at every hour. It took the daylight 5th percentile to 21 against a
 * floor of 24 while the deck itself measured 115. That is the wharf's ship in
 * the foreground instead of the backdrop, and it is the same finding: the dark
 * thing was not the water.
 *
 * At -1.6 the band is 1.6m, which is what a deeply laden ship actually looks
 * like, and at 38 degrees you see very little of it anyway.
 */
const SEA_Y = -1.6;
const RAIL_STBD = 11.9;      // the near bulwark, and the block's edge kerb
const RAIL_PORT = -8.3;
const HOUSE = { x: -26.5, w: 7.0 };
/**
 * The washdown tank. Its z is set by the escape harness rather than by the eye:
 * the rim test lays approach runs 3.2m outside the water's *extent* on all four
 * sides and needs twelve of the twenty on standable ground, and the collider is
 * `WATER_EDGE_PAD` wider than the waterline again on top of that. At z 4.5 the
 * starboard approaches landed inside the bulwark and only eight survived.
 */
const POOL = { x: -13.5, z: 3.4 };
const MAST = { x: 9.0, z: 2.0 };
const KID = { x: -20.0, z: 9.6 };
/** The bait anchor — the hatch the bosun works over. The game calls it `cart`. */
const HATCH_BOSUN = { x: 1.0, z: -1.0 };

/** The two hatch covers, and the cross lane between them. */
const HATCHES = [
  { x: 1.0, z: 0.5, w: 12.0, d: 15.0 },
  { x: 17.0, z: 0.5, w: 12.0, d: 15.0 },
];

export function buildLevel() {
  const root = new THREE.Group();
  const colliders = [];
  const occluders = [];
  const perches = [];
  const night = new NightLights(RULES.lampsOnAt);

  const kit = makeKit({ root, colliders, occluders, perches, night });
  const { solid, perch, addDecal, addBin, makeNest } = kit;

  // ══════════════════════════════════════════════════════════════════════════
  // The sea, and the deck laid on top of it
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Open ocean, on both sides, running past a horizon that is never in frame.
   *
   * The wharf learned that at this camera a backdrop holds exactly one readable
   * idea. Out here it holds none, and that is the picture: no shore, no
   * breakwater, nothing to steer by. It is also about six meshes, which makes
   * it the cheapest backdrop in the game by a distance.
   */
  {
    /**
     * `transparent`/`opacity` go through `plane()` so they are part of the
     * material cache key. Setting them on the returned material instead mutates
     * the *shared* `PAL.harbour` entry for everything else that ever asks for
     * that colour, and `isSharedMaterial()` still calls it cache-owned, so
     * teardown never frees it. No victim today; exactly the documented landmine.
     */
    const sea = plane(220, 200, PAL.ocean, { receive: false, transparent: true, opacity: 0.94 });
    sea.position.y = SEA_Y;
    sea.userData.baseOpacity = 0.94;
    root.add(sea);
    root.userData.seaPlane = sea;
    /**
     * And the sea lights itself at dusk, which is not decoration.
     *
     * Open water reaches no fixture on the ship, so unlit it goes to almost
     * black — and at this camera the near sea and the hull below the rail are a
     * band across the bottom third of every frame. The first dusk measurement
     * of this block was a 5th percentile of **5** against a floor of 24, and
     * that band was all of it. The wharf hit the same wall and solved it the
     * same way: the water carries its own emissive rather than being lit.
     */
    night.add(sea, PAL.oceanDeep, { peak: 0.42, warm: 3.4, delay: 1.2 });
  }

  // The deck itself. Cool steel grey: three channels high with blue a shade
  // over red, so it survives the 2.6-intensity warm key at t=0 without going
  // tan, and still catches the violet fill at dusk. Red oxide and deck green
  // are what a real ship uses and both are ruled out — see docs/ship-brief §7.
  const deck = plane(64, 21.4, PAL.deckSteel, { receive: true });
  deck.position.set(0, 0, (RAIL_STBD + RAIL_PORT) / 2);
  root.add(deck);

  /**
   * The hull, seen over the rail. Three bands, which is what makes a box read
   * as a ship at this distance: a dark topside, a bright sheer line at the deck
   * edge, and the boot-top at the waterline. None of them shares a face plane
   * with another — that is the coin-flip-per-pixel bug, and a backdrop-scale
   * object shows it as a shimmer down the whole length.
   */
  /**
   * The ship's side carries a faint emissive at dusk, for the same reason the
   * sea does and it is the same bug found twice.
   *
   * After lighting the water the 5th percentile was still 13 against a floor of
   * 24, and the frame said why: a black band running the whole width of the
   * picture between the lit deck and the lit sea. That band is the *ship* — the
   * outboard face of the bulwark and the top of the hull, which face away from
   * every fixture on deck and away from the sun all day. Nothing on a ship
   * lights its own side, so it has to light itself. Deck lights do spill over a
   * rail, which is what this is.
   */
  const shipSide = [];
  for (const [z, sign] of [[RAIL_STBD, 1], [RAIL_PORT, -1]]) {
    // Bulwark above the deck — a real wall, and the map bound on that side.
    const bw = box(64, 1.1, 0.6, PAL.hullSide, { up: PAL.hullSheer, down: PAL.hullSide });
    bw.position.set(0, 0.55, z + sign * 0.3);
    root.add(bw);
    shipSide.push(bw);
    /**
     * 1.32 rather than 1.24, and the 0.08 is not cosmetic. The bosun works on a
     * hatch cover at 0.40, and 1.24 put the rail 0.840 above him against a
     * `SIGHT_OVER` of 0.85 — inside the 0.03 window the audit guards, which
     * means whether a guard on a cover can see over the ship's side would have
     * been decided by a rounding crumb.
     */
    const cap = box(64.2, 0.14, 0.76, PAL.hullSheer, { up: PAL.hullSheer });
    cap.position.set(0, 1.25, z + sign * 0.3);   // proud of the plate, not flush
    root.add(cap);
    // Topside, down to the sea.
    const side = box(64, 2.4, 0.5, PAL.hullSide, { up: PAL.hullSheer, down: PAL.hullSide });
    side.position.set(0, -1.2, z + sign * 0.62);
    root.add(side);
    shipSide.push(side);
    const boot = box(64.3, 0.5, 0.66, PAL.hullBoot, { up: PAL.hullSheer, down: PAL.hullBoot });
    boot.position.set(0, SEA_Y + 0.28, z + sign * 0.62);
    root.add(boot);
    // The rail is a wall, floor to well over a crow's head, and not perchable —
    // a perchable ledge with a wall above it ejects the crow through the nearer
    // face, which on the near side is the sea.
    solid(0, z + sign * 0.45, 68, 1.4, 1.32, 0, {
      tag: sign > 0 ? 'edge-kerb' : null, perch: false,
    });
  }

  night.add(shipSide, PAL.hullSide, { peak: 0.44, warm: 2.6, delay: 1.0 });

  /**
   * The wake and the bow wave — the only thing in frame that says *moving*
   * rather than *floating*, and the one readable idea the backdrop is allowed.
   * Static geometry: no animation, and emphatically no roll, which would move
   * every collider on the block and the crow's whole frame of reference.
   */
  for (const [z, sign] of [[RAIL_STBD, 1], [RAIL_PORT, -1]]) {
    for (let i = 0; i < 5; i++) {
      const f = plane(9 - i * 0.7, 1.2 + i * 0.5, PAL.shiny, { receive: false });
      f.rotation.x = -Math.PI / 2;
      f.position.set(-24 + i * 11, SEA_Y + 0.03 + i * 0.004, z + sign * (1.6 + i * 0.55));
      f.material.transparent = true;
      f.material.opacity = 0.32;
      root.add(f);
    }
  }

  // Painted non-slip strips down both walkways. Decals, so they stack in add
  // order rather than fighting the deck for depth.
  addDecal(0, 10.2, 60, 2.0, PAL.deckWalk);
  addDecal(0, -6.9, 60, 1.6, PAL.deckWalk);

  // ══════════════════════════════════════════════════════════════════════════
  // The hatch covers
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * A real ship's deck is mostly hatch cover, and at 0.6 they are the quiet
   * trick of this block: below SIGHT_OVER (0.85), so a guard looks straight
   * over them, and only 0.70m of camera shadow. They break the floor into
   * levels and give the deck scale, for free.
   */
  for (const h of HATCHES) {
    const cov = box(h.w, 0.40, h.d, PAL.deckHatch, { up: PAL.deckHatchLit, down: PAL.shade });
    cov.position.set(h.x, 0.20, h.z);
    root.add(cov);
    // Coaming rails along the long edges, so it reads as a lid and not a slab.
    for (const s of [-1, 1]) {
      const r = box(h.w + 0.3, 0.18, 0.22, PAL.steelDark, { up: PAL.steel });
      r.position.set(h.x, 0.49, h.z + s * (h.d / 2 - 0.2));
      root.add(r);
    }
    solid(h.x, h.z, h.w, h.d, 0.40, 0, { tag: 'hatch' });
    perch(h.x, 0.40, h.z);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // The cargo
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Eleven boxes, standing in ones and twos with open steel between them.
   *
   * Not rows and not a wall. A row makes a corridor, and a corridor is a route
   * you walk down blind — which is the version of this level that got vetoed,
   * for the right reason. Scattered, each box costs the player a 2.78m shadow
   * and costs a guard the whole deck behind it, which is the trade the block is
   * built on.
   *
   * `[x, z, tiers, hue, on-a-hatch]`. The two-high pairs go on the port side
   * only: a 4.8 box throws a 5.6m shadow, and from there it lands on the rail
   * and the sea rather than anywhere anybody plays.
   *
   * They sit at z -5.0 rather than hard against the rail, and that is pathing
   * rather than composition. At -6.6 they left 0.25m between the cargo and the
   * bulwark — a walker is 0.72m across, so the port walkway was a wall with a
   * crack in it and two chase probes died in it. Nothing on this deck may pinch
   * a lane below about 1.5m.
   */
  /**
   * This block's cargo hues. Three come straight from `PAL.container`; the red
   * is the ship's own, because at this size the palette's coral goes near-black
   * in shade. See `PAL.cargoRust`.
   */
  const HUE = [PAL.cargoRust, PAL.container[1], PAL.container[2], PAL.container[3]];
  const HUE_LIT = [PAL.cargoRustLit, PAL.containerLit[1], PAL.containerLit[2], PAL.containerLit[3]];

  const boxTops = [];
  /**
   * Ten boxes, laid out so that **no two of them share any volume** and none of
   * them is near the pool. Both of those were broken when the positions were
   * chosen by eye: two 6m containers overlapped by 18m³, and moving them to fix
   * it put one in the water. Nothing in the audit sees solid-into-solid, so the
   * spacing is the author's job and it is worth doing on paper — every box is
   * 6.0 x 2.4, so two of them clash unless their centres differ by 6 in x or
   * 2.4 in z.
   */
  const CARGO = [
    [-2.0, -4.5, 1, 0], [14.0, -4.0, 1, 2], [20.0, 1.0, 1, 3],
    [27.0, -1.0, 1, 1], [5.0, -5.0, 1, 2], [10.0, 4.5, 1, 3],
  ];
  /**
   * **Seven, not ten**, and the count is set by a fairness rule rather than by
   * composition.
   *
   * The audit requires the blinded share of the block to *fall* every time the
   * crow gets off the ground — flight must never be a way to become invisible.
   * On a deck of 2.4m boxes, three metres up is the worst possible altitude:
   * the bird is barely over the cargo, so every ray from a 1.6m eye grazes a
   * box top. Ten boxes measured 41.4% / 36.1% / 43.2% and seven still rose at
   * the third step. Thinning the load is the only lever that moves it, and it
   * costs the picture something real — but "boxes in ones and twos with open
   * steel between them" was the design from the first line of this file, so
   * this is the arithmetic agreeing with it rather than overruling it.
   */
  /**
   * **Every stack is one tier.** The plan called for two two-high pairs on the
   * port side for silhouette, and they cost more than they were worth twice
   * over. A 5.2m stack is tall enough that a guard's 1.60m eye stays blind to a
   * crow *eight metres up* over it — the audit's "getting off the ground makes
   * the crow more visible, not less" caught it, and being invisible while
   * flying is the one direction the sight change must never break. And at
   * z -6.2 they left 0.65m between the cargo and the port rail, which is under
   * a walker's width, so the back lane stopped being a lane.
   *
   * The variety comes from the house, the funnel and the mast instead. A deck
   * that is uniformly low is also the deck this block's whole thesis wants.
   */
  for (const [x, z, tiers, hue] of CARGO) {
    /**
     * Whether a box stands on a cover is a property of where it *is*, not a
     * flag somebody types. Typed by hand, three boxes sat 0.40m sunk into the
     * covers they were standing on and two 6m containers occupied 18m³ of the
     * same volume as each other — none of which any check can see, because the
     * coplanar rule compares tops and these differ.
     */
    const onHatch = HATCHES.some((h) => x > h.x - h.w / 2 - 2.6 && x < h.x + h.w / 2 + 2.6
      && z > h.z - h.d / 2 && z < h.z + h.d / 2);
    const base = onHatch ? DECK.hatch : 0;
    const g = new THREE.Group();
    for (let t = 0; t < tiers; t++) {
      const c = box(6.0, 2.4, 2.4, HUE[hue], { up: HUE_LIT[hue], down: PAL.shade });
      c.position.y = 1.2 + t * 2.4;
      g.add(c);
      // Doors on the near end, so a container is not an anonymous slab.
      const d = box(0.10, 1.9, 2.0, HUE_LIT[hue], { shadow: false });
      d.position.set(3.02, 1.15 + t * 2.4, 0);
      g.add(d);
      // Corner castings, and the one detail that could not be anything else.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.add(at(box(0.26, 0.26, 0.26, PAL.steelDark),
          sx * 2.87, 0.13 + t * 2.4, sz * 1.07));
      }
    }
    g.position.set(x, base, z);
    root.add(g);
    const top = base + tiers * 2.4;
    solid(x, z, 6.0, 2.4, top, base, { tag: 'container' });
    perch(x, top, z);
    boxTops.push({ x, y: top, z, tiers });
    // Lashing rods at the feet of the ones standing on deck.
    if (!onHatch) {
      for (const sx of [-1, 1]) {
        const rod = cyl(0.05, 0.05, 1.9, 5, PAL.steel, { up: PAL.silver });
        rod.rotation.z = sx * 0.42;
        rod.position.set(x + sx * 3.1, base + 0.95, z + 1.2);
        root.add(rod);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // The house, aft at the west end
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * At the west end, and that is derived rather than nautical. The funnel tops
   * out at 9.4 and throws a 10.9m blind wedge; put the house at the east end
   * and that lands across the cargo deck, put it at the west and it goes off
   * the map. So the ship is heading east and nobody will ever ask why.
   */
  {
    const hx = HOUSE.x, hw = HOUSE.w;
    const beam = RAIL_STBD - RAIL_PORT - 1.0;
    const cz = (RAIL_STBD + RAIL_PORT) / 2;

    /**
     * The upper block is narrower than the lower one by seven metres, so the
     * house has side decks and the bridge wing is a real cantilever rather than
     * a pad in the middle of a roof.
     *
     * It was full beam, and that was most of a fairness failure: sample points
     * on the boat deck sat behind the block's own 6.6m wall, so the share of
     * the map a guard could not see went *up* when the crow climbed to three
     * metres. A superstructure that fills the ship is also just wrong — every
     * real one has a walkway round it.
     */
    for (const [w, h, y, dz] of [[hw, 3.4, 0, 0], [hw - 1.2, 3.2, 3.4, 7.2]]) {
      const b = box(w, h, beam - dz, PAL.stone, { up: PAL.stone, down: PAL.shade });
      b.position.set(hx, y + h / 2, cz);
      root.add(b);
    }
    // The bridge band — the one warm mark on the block, and a night light.
    const band = box(hw - 1.0, 0.62, beam + 0.16, PAL.goldLit, { shadow: false });
    band.position.set(hx, 5.9, cz);
    band.material = mat(PAL.goldLit);
    root.add(band);
    night.add(band, PAL.goldLit, { peak: 0.85, warm: 1.4, delay: 0.3 });

    // The funnel, and nothing above it but sky.
    const fn = box(2.6, 2.8, 3.2, PAL.cargoRust,
      { up: PAL.cargoRustLit, down: PAL.shade });
    fn.position.set(hx, 8.0, cz);
    root.add(fn);

    solid(hx, cz, hw, beam, 3.4, 0, { tag: 'house' });
    solid(hx, cz, hw - 1.2, beam - 7.2, 6.6, 3.4, { tag: 'house' });
    solid(hx, cz, 2.6, 3.2, 9.4, 6.6, { tag: 'funnel' });
    perch(hx, 3.4, cz + 6.0);
    perch(hx, 6.6, cz);

    // The bridge wing, sticking out to starboard — the mate's floor, and the
    // only place on the ship with a clear view over the cargo.
    /**
     * The wing stands *proud* of the bridge deck rather than flush with it.
     *
     * Drawn flush, its top and the house roof were both exactly 6.6 over 7.8m²
     * of shared footprint — two faces at identical depth, which is a coin flip
     * per pixel and the artifact that has now shipped three times in this
     * project wearing three different costumes. A part either overlaps what it
     * sits on or stops short of it, and never lands exactly on it.
     */
    const wing = box(2.6, 0.24, 3.0, PAL.stone, { up: PAL.stone, down: PAL.shade });
    wing.position.set(hx + 0.6, DECK.bridge + 0.12, 8.4);
    root.add(wing);
    solid(hx + 0.6, 8.4, 2.6, 3.0, DECK.bridge + 0.24, DECK.bridge, { tag: 'wing' });
    perch(hx + 0.6, DECK.bridge + 0.24, 8.4);
    for (const s of [-1, 1]) {
      const r = box(2.7, 0.08, 0.08, PAL.steel, { up: PAL.silver, shadow: false });
      r.position.set(hx + 0.6, DECK.bridge + 0.5, 8.4 + s * 1.4);
      root.add(r);
    }

    // The galley door, and a light over it.
    const door = box(0.14, 2.0, 1.1, PAL.awning, { up: PAL.awningLit, shadow: false });
    door.position.set(hx + hw / 2 + 0.05, 1.0, 5.2);
    root.add(door);
    const lamp = at(ico(0.16, 0, PAL.goldLit, { shadow: false }), hx + hw / 2 + 0.2, 2.35, 5.2);
    lamp.material = mat(PAL.goldLit);
    root.add(lamp);
    night.add(lamp, PAL.goldLit, { peak: 1.0, warm: 1.6, delay: 0.9, flicker: true });
    night.addPool(root, hx + hw / 2 + 1.6, 5.2, 4.4, { peak: 0.72, warm: 1.6, delay: 0.9 });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // The crew pool
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * A rectangular steel deck tank, not a swimming pool.
   *
   * The first build used `kit.addPool`, which is the object every basin in this
   * game is made of — a circular stone rim with pale coping. On a container
   * ship it photographed as **an ornamental fountain**, which is exactly what it
   * is, and it was the first thing a playtest objected to. Nothing round and
   * stone-rimmed belongs on a working deck.
   *
   * So it is the wharf's box water instead: a welded steel tank with a coaming,
   * of the sort a ship carries for washdown and fire drill. Same numbers as
   * every water body in the game — coping 0.62, surface 0.42, bed 0.06 — because
   * those two are fixed by a pair of assertions that hold hands and not by
   * taste. `WATER_EDGE_PAD` is why the collider box is 0.6 wider on every side
   * than the waterline: the crow has to still read as *in* the water while it is
   * pressed against the inside face, or it loses its float height at the one
   * moment it needs to climb out.
   */
  const TANK = { minX: POOL.x - 4.4, maxX: POOL.x + 4.4, minZ: POOL.z - 3.0, maxZ: POOL.z + 3.0 };
  const RIM = 0.62, SURFACE = RIM - 0.20, BED = 0.06;
  const FOUNTAIN = {
    shape: 'box',
    minX: TANK.minX - WATER_EDGE_PAD, maxX: TANK.maxX + WATER_EDGE_PAD,
    minZ: TANK.minZ - WATER_EDGE_PAD, maxZ: TANK.maxZ + WATER_EDGE_PAD,
    x: (TANK.minX + TANK.maxX) / 2,
    z: (TANK.minZ + TANK.maxZ) / 2,
    r: Math.min((TANK.maxX - TANK.minX) / 2, (TANK.maxZ - TANK.minZ) / 2),
    rim: RIM, floor: BED,
  };
  {
    const w = TANK.maxX - TANK.minX, d = TANK.maxZ - TANK.minZ;
    const cx = FOUNTAIN.x, cz = FOUNTAIN.z;
    // Four coaming walls, each stopping short of the corner posts rather than
    // landing flush on them — two solids must never share a face plane.
    for (const [ox, oz, ww, dd] of [
      [0, -(d / 2 + 0.2), w + 0.8, 0.4], [0, d / 2 + 0.2, w + 0.8, 0.4],
      [-(w / 2 + 0.2), 0, 0.4, d + 0.8], [w / 2 + 0.2, 0, 0.4, d + 0.8],
    ]) {
      const wall = box(ww, RIM, dd, PAL.deckHatch, { up: PAL.hullSheer, down: PAL.shade });
      wall.position.set(cx + ox, RIM / 2, cz + oz);
      root.add(wall);
      solid(cx + ox, cz + oz, ww, dd, RIM, 0, { tag: 'tank-coaming' });
      perch(cx + ox, RIM, cz + oz);
    }
    const bed = plane(w, d, PAL.poolTile, { receive: true, decal: true });
    bed.position.set(cx, BED, cz);
    root.add(bed);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({
        color: PAL.poolWater, transparent: true, opacity: 0.72, flatShading: true,
      }),
    );
    water.userData.baseOpacity = 0.72;
    water.position.set(cx, SURFACE, cz);
    root.add(water);
    root.userData.fountainWater = water;
    night.add(water, PAL.poolWater, { peak: 0.34, warm: 2.6, delay: 1.4 });
  }
  night.addPool(root, POOL.x, POOL.z, 5.2, { peak: 0.78, warm: 1.2, delay: 1.4 });

  // ══════════════════════════════════════════════════════════════════════════
  // The mast, and the nest on it
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * The crow's nest is a crow's nest, and the joke has been sitting in this
   * ship since the wharf's backdrop was drawn.
   *
   * It stands in the cross lane between the two hatch covers, so it is central
   * and every bank is short. Three rules it has to satisfy and does: the
   * platform is 3.2 across against a 1.5 nest (2.13x, needs 2); the mast is a
   * bare pole with no gallery under the platform, so there is no lid to be
   * trapped beneath; and the masthead light hangs from an arm cantilevered
   * *below* the platform, because anything rooted above it stands in the column
   * the audit sweeps — which is the mistake the lobby clock made.
   */
  const NEST = { x: MAST.x, y: 7.0, z: MAST.z };
  {
    const g = new THREE.Group();
    g.add(at(cyl(0.18, 0.22, 7.0, 6, PAL.steel, { up: PAL.silver, down: PAL.steelDark }), 0, 3.5, 0));
    for (let i = 0; i < 9; i++) {
      g.add(at(box(0.56, 0.05, 0.05, PAL.steelDark, { shadow: false }), 0, 0.7 + i * 0.7, 0.22));
    }
    const plat = cyl(1.6, 1.6, 0.16, 12, PAL.steel, { up: PAL.silver, down: PAL.steelDark });
    plat.position.y = 6.92;
    g.add(plat);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.add(at(box(0.06, 0.44, 0.06, PAL.steelDark, { shadow: false }),
        Math.cos(a) * 1.5, 7.22, Math.sin(a) * 1.5));
    }
    // The masthead light, on an arm *below* the platform.
    g.add(at(box(0.9, 0.07, 0.07, PAL.steel, { shadow: false }), 0.55, 6.6, 0));
    const bulb = at(ico(0.19, 0, PAL.goldLit, { shadow: false }), 1.0, 6.6, 0);
    bulb.material = mat(PAL.goldLit);
    g.add(bulb);
    night.add(bulb, PAL.goldLit, { peak: 1.0, warm: 1.5, delay: 0.0, flicker: true });
    night.addPool(root, MAST.x, MAST.z, 5.2, { peak: 0.80, warm: 1.5, delay: 0.0 });

    const nest = makeNest();
    nest.position.y = 7.0;
    g.add(nest);
    g.position.set(MAST.x, 0, MAST.z);
    root.add(g);
    root.userData.nestGroup = nest;

    solid(MAST.x, MAST.z, 0.44, 0.44, 6.4, 0, { tag: 'mast' });
    solid(MAST.x, MAST.z, 3.2, 3.2, 7.0, 6.6, { tag: 'mast-platform', sight: false });
    perch(MAST.x, 7.0, MAST.z);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Deck furniture — the things that make it a working ship
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * The shackle, and the five under it.
   *
   * `pinned: true` on a pickup means nothing without a `pin` object to shove:
   * the game only offers SHOVE while `world.pin` is visible, and until it is
   * shoved the bill is skipped entirely *and* the beak prompt reads "PINNED /
   * UNDER IT" because it has no label to use. A pinned bill with no pin is a
   * five nobody can ever take.
   */
  const SHACKLE = { x: -3.9, y: 0.62, z: 1.0 };
  const shackle = group(
    at(cyl(0.20, 0.20, 0.09, 10, PAL.steelDark, { up: PAL.steel }), 0, 0.045, 0),
    at(box(0.09, 0.20, 0.09, PAL.steel, { up: PAL.silver }), 0.10, 0.14, 0),
    at(box(0.09, 0.20, 0.09, PAL.steel, { up: PAL.silver }), -0.10, 0.14, 0),
    at(box(0.29, 0.08, 0.09, PAL.steel, { up: PAL.silver }), 0, 0.24, 0),
  );
  shackle.position.set(SHACKLE.x, DECK.hatch, SHACKLE.z);
  shackle.userData.label = 'THE SHACKLE';
  root.add(shackle);
  solid(SHACKLE.x, SHACKLE.z, 0.42, 0.42, DECK.hatch + 0.28, DECK.hatch);

  /** The lashing bridge over the bosun's hatch: the twenty lives up here. */
  const LASH = { x: HATCH_BOSUN.x, y: 2.4, z: HATCH_BOSUN.z };
  {
    const g = new THREE.Group();
    g.add(at(box(7.0, 0.18, 1.1, PAL.steel, { up: PAL.silver, down: PAL.steelDark }), 0, 2.31, 0));
    for (const sx of [-1, 1]) {
      g.add(at(cyl(0.10, 0.10, 2.0, 6, PAL.steelDark, { up: PAL.steel }), sx * 3.2, 1.4, 0));
      g.add(at(box(7.0, 0.06, 0.06, PAL.steelDark, { shadow: false }), 0, 2.78, sx * 0.5));
    }
    g.position.set(LASH.x, 0, LASH.z);
    root.add(g);
    /**
     * `sight: false`, and it is the truest use of that flag on the block.
     *
     * A lashing bridge is open steel grating with a handrail — you look through
     * it, and along the deck under it. As a solid it was a 7m slab sitting in
     * the 2.2-2.4m band, which is exactly where the sightline from a 1.6m eye to
     * a crow three metres up passes: it accounted for **61 of the blinded
     * samples at 3m against 28 for all five containers put together**, and it
     * was single-handedly making flight hide the bird. It is still a floor and
     * still a perch; it is just not a wall.
     */
    solid(LASH.x, LASH.z, 7.0, 1.1, 2.4, 2.2, { tag: 'lashing-bridge', sight: false });
    perch(LASH.x, 2.4, LASH.z);
  }

  /** The mooring winch, aft on the well deck. The lasher's five sits on it. */
  const WINCH = { x: -6.5, y: 1.10, z: 9.4 };
  {
    const g = new THREE.Group();
    // The drum lies down, and the collider top matches the top of the drum
    // rather than splitting it — a five authored on this used to sit *inside*
    // the casting, and so did any crow that perched there.
    g.add(at(box(2.4, 0.55, 1.5, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), 0, 0.28, 0));
    const drum = at(cyl(0.36, 0.36, 1.7, 10, PAL.steel, { up: PAL.silver }), 0, 0.74, 0);
    drum.rotation.z = Math.PI / 2;
    g.add(drum);
    g.position.set(WINCH.x, 0, WINCH.z);
    root.add(g);
    solid(WINCH.x, WINCH.z, 2.4, 1.6, 1.10, 0, { tag: 'winch' });
    perch(WINCH.x, 1.10, WINCH.z);
  }

  /** A coil of mooring rope. The kid sits on it. */
  {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(
        new THREE.TorusGeometry(0.9 - i * 0.12, 0.11, 5, 14).rotateX(Math.PI / 2),
        mat(i % 2 ? PAL.dockLit : PAL.dock),
      );
      t.position.y = 0.12 + i * 0.16;
      t.castShadow = true;
      g.add(t);
    }
    g.position.set(KID.x, 0, KID.z);
    root.add(g);
    solid(KID.x, KID.z, 2.0, 2.0, 0.5, 0, { tag: 'rope-coil' });
    perch(KID.x, 0.5, KID.z);
  }

  /** The paint store and the fo'c'sle store: two lockers against the house. */
  const PAINT = { x: -22.0, y: 1.42, z: -5.4 };
  const FOCSLE = { x: 28.0, y: 1.42, z: 8.2 };
  for (const s of [PAINT, FOCSLE]) {
    const g = new THREE.Group();
    g.add(at(box(2.2, 1.3, 1.6, PAL.container[1],
      { up: PAL.containerLit[1], down: PAL.shade }), 0, 0.65, 0));
    g.add(at(box(2.3, 0.1, 1.7, PAL.steelDark, { up: PAL.steel }), 0, 1.34, 0));
    g.position.set(s.x, 0, s.z);
    root.add(g);
    solid(s.x, s.z, 2.2, 1.6, 1.42, 0, { tag: 'locker' });
    perch(s.x, 1.42, s.z);
  }

  /** An open flat rack — cargo with no box on it, and loose change in the bed. */
  const RACK = { x: 8.5, y: 0.24, z: -4.6 };
  {
    const g = new THREE.Group();
    g.add(at(box(6.0, 0.22, 2.4, PAL.dockMid, { up: PAL.dockLit, down: PAL.shade }), 0, 0.11, 0));
    for (const sx of [-1, 1]) {
      g.add(at(box(0.16, 1.0, 2.4, PAL.container[3],
        { up: PAL.containerLit[3], down: PAL.shade }), sx * 2.9, 0.5, 0));  // wheat, safe at this size
    }
    g.position.set(RACK.x, 0, RACK.z);
    root.add(g);
    solid(RACK.x, RACK.z, 6.0, 2.4, 0.24, 0, { tag: 'flat-rack' });
    perch(RACK.x, 0.24, RACK.z);
  }

  /** The mess room table, seen through the galley door. The cook's ten. */
  const MESS = { x: -21.4, y: 0.78, z: 6.6 };
  {
    const g = new THREE.Group();
    g.add(at(cyl(0.06, 0.06, 0.72, 6, PAL.steelDark), 0, 0.36, 0));
    g.add(at(box(1.5, 0.08, 1.0, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 0.76, 0));
    g.position.set(MESS.x, 0, MESS.z);
    root.add(g);
    solid(MESS.x, MESS.z, 1.5, 1.0, 0.8, 0.62, { tag: 'mess-table' });
    solid(MESS.x, MESS.z, 0.3, 0.3, 0.62, 0);
    perch(MESS.x, 0.8, MESS.z);
  }

  // Two bins, a bollard row, and the vents that make a deck look worked.
  addBin(-17.5, 10.4, PAL.steelDark);
  addBin(22.5, 10.4, PAL.steelDark);
  for (const x of [-11, -1, 12, 23]) {
    for (const z of [RAIL_STBD - 1.3, RAIL_PORT + 1.3]) {
      const b = cyl(0.24, 0.28, 0.62, 8, PAL.steelDark, { up: PAL.steel });
      b.position.set(x, 0.31, z);
      root.add(b);
      solid(x, z, 0.56, 0.56, 0.62, 0);
    }
  }
  for (const [x, z] of [[-9.5, -2.0], [3.0, 8.4], [21.0, -1.5]]) {
    const v = cyl(0.4, 0.44, 1.5, 8, PAL.steel, { up: PAL.silver, down: PAL.steelDark });
    v.position.set(x, 0.75, z);
    root.add(v);
    const cap = cone(0.5, 0.4, 8, PAL.steelDark, { up: PAL.steel });
    cap.position.set(x, 1.66, z);
    root.add(cap);
    solid(x, z, 0.9, 0.9, 1.9, 0);   // to the top of the cowl, not into it
    perch(x, 1.9, z);
  }

  // Deck floodlights: few, small, bright. The lobby's lesson — a pool's cost is
  // its area and its brightness is nearly free.
  /**
   * Deck floodlights: few, small, bright — the lobby's lesson, where thirty
   * pools cost 38ms a frame and the fix was smaller radii and higher peaks
   * rather than fewer lights. Eight posts, none over 5.2m of radius.
   *
   * Two of them stand in the cargo lanes rather than at the rails, which is
   * where the second dusk pass put them: standing among the boxes the median
   * measured 43 against a floor of 48, because every fixture was outboard and
   * the middle of the deck had nothing over it.
   */
  for (const [x, z] of [
    [-4.0, 10.6], [12.0, 10.6], [26.0, 10.6], [4.0, -7.4], [20.0, -7.4],
    [9.0, 6.0], [9.0, -2.0], [-18.0, -6.4], [24.0, 3.0],
  ]) {
    const post = cyl(0.09, 0.11, 2.6, 6, PAL.steel, { up: PAL.silver, down: PAL.steelDark });
    post.position.set(x, 1.3, z);
    root.add(post);
    const head = at(box(0.42, 0.2, 0.3, PAL.goldLit, { shadow: false }), x, 2.68, z);
    head.material = mat(PAL.goldLit);
    root.add(head);
    night.add(head, PAL.goldLit, { peak: 1.0, warm: 1.5, delay: 0.4, flicker: true });
    night.addPool(root, x, z, 5.2, { peak: 0.86, warm: 1.5, delay: 0.4 });
    // Not perchable. It is a 0.3m pole — the cat was hopping onto floodlights
    // and standing on them, which is how it kept topping out at 2.6.
    solid(x, z, 0.3, 0.3, 2.6, 0, { perch: false });
  }

  /**
   * The invisible bound. Everything beyond the rails is sea and scenery, and
   * this is what stops the crow leaving the map — the same statement every
   * block makes right after its backdrop. It reads like part of the sea and it
   * is the only thing keeping the bird on the ship.
   */
  solid(0, RAIL_STBD + 12, 140, 22, 40, 0, { perch: false });
  solid(0, RAIL_PORT - 12, 140, 22, 40, 0, { perch: false });
  solid(-34.5, 0, 5, 60, 40, 0, { perch: false });
  solid(34.5, 0, 5, 60, 40, 0, { perch: false });

  // Anything that stands between the camera and the near walkway fades when it
  // is in the way. Only the near-side boxes qualify — the fade is a nicety on
  // this block, not load-bearing, because nothing forms a corridor.
  /**
   * Nothing here is registered as an occluder, and that is a decision.
   *
   * The first version filtered groups by `z > 6.5`, which matched no cargo at
   * all — the nearest box sits at exactly 6.5 — and instead registered the
   * rope coil, the winch, a locker and the mess table. The rope coil is what
   * the kid sits on, and her silhouette is the one thing this block inherits
   * and has to defend; fading it is the opposite of what anyone wanted.
   *
   * On a deck of 2.4m boxes with 2.78m of camera shadow each, nothing stands
   * between the camera and the crow for long enough to matter. An occluder that
   * is not needed is a cloned material and a raycast every frame.
   */

  return {
    root, colliders, occluders, perches,
    nightLights: night,
    fountain: FOUNTAIN,
    waterDeck: DECK.deck,
    nest: NEST,
    nestPlatform: 3.2,     // the mast platform
    nestFootprint: 1.5,    // the twig ring itself
    decks: DECK,
    /** The bait anchor. The game calls it `cart` whatever the block sells. */
    cart: HATCH_BOSUN,
    pin: shackle,
    pickups: pickupPlacements({ FOUNTAIN, LASH, WINCH, RACK, MESS, PAINT, FOCSLE, SHACKLE, boxTops }),
    humans: humanPlacements(),
    gulls: gullPlacements(),
    pigeons: [],
    /**
     * The ship's cat, and the only entity in the game that changes decks.
     *
     * It exists because of an arithmetic problem this block created for itself:
     * a guard reaches 1.9m above their own feet and a container top is 2.4, so
     * one hop up is safe everywhere and forever. That is a fine feeling for
     * ninety seconds and then the block has no teeth. See entities/cat.js.
     */
    cats: catPlacements(),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// The money
// ════════════════════════════════════════════════════════════════════════════

/**
 * $71.42 against a $45 goal, so you land 63% of it — in line with the wharf's
 * 62% and the lobby's 61%.
 *
 * **Almost none of it is on a box top**, and that is the design working rather
 * than an oversight. The tops are where you are safe, so paying you to stand
 * there would pay you for hiding. The three cheap pickups up there exist only
 * to teach, in the first thirty seconds, that the boxes are landable at all.
 */
function pickupPlacements({ FOUNTAIN, LASH, WINCH, RACK, MESS, PAINT, FOCSLE, SHACKLE, boxTops }) {
  const p = [];
  const add = (kind, value, x, y, z, extra = {}) =>
    p.push({ kind, value, pos: [x, y, z], ...extra });

  // — Scattered change down the walkways: the teaching money, deliberately
  //   trivial and deliberately not enough. All of it on open deck, where the
  //   camera sees it and so does everybody else. —
  for (const [x, y, z] of [
    [-9.5, 0.06, 10.3], [-2.0, 0.06, 10.0], [5.0, 0.06, 9.9], [16.0, 0.06, 10.0],
    [27.5, 0.06, 10.2], [-22.0, 0.06, 10.3], [-19.5, 0.06, -7.2], [24.5, 0.06, -7.0],
  ]) add('penny', 0.01, x, y, z);
  for (const [x, y, z] of [[-13.0, 0.06, 10.2], [24.0, 0.06, 9.6], [19.5, 0.06, 9.9]]) {
    add('nickel', 0.05, x, y, z);
  }
  for (const [x, y, z] of [[-6.0, 0.06, -3.2], [13.0, 0.06, 9.9], [29.0, 0.06, 6.0]]) {
    add('dime', 0.10, x, y, z);
  }
  for (const [x, y, z] of [[-16.5, 0.06, -6.6], [7.5, 0.06, 10.2]]) add('quarter', 0.25, x, y, z);

  /**
   * Three cheap pickups on box tops, and that is all there is up there.
   *
   * Their whole job is to teach, in the first thirty seconds, that the boxes
   * are landable — because the tops are where you are *safe*, and paying you
   * properly for standing on one would be paying you to hide. Named boxes with
   * explicit heights rather than offsets off a filtered list: the list order
   * changes whenever the cargo moves, and it silently put a coin inside a
   * neighbouring stack the first time the port side was rearranged.
   */
  const top = (x, z) => (boxTops.find((b) => b.x === x && b.z === z) || { y: 0 }).y;
  add('coins', 0.60, 14.0, top(14.0, -4.0) + 0.04, -4.0);
  add('bill1', 1.00, 20.0, top(20.0, 1.0) + 0.04, 1.0);
  add('coins', 1.55, 5.0, top(5.0, -5.0) + 0.04, -5.0);

  /**
   * The tank. Free money, and you have to get in for it.
   *
   * Placed by hand inside the waterline rather than on a circle, because the
   * water is a rectangle now: a ring of coins put one of them 0.2m behind the
   * starboard coaming, which is 0.62 tall and therefore hides 0.72m of bed
   * behind it. Every one of these is clear of all four walls.
   */
  for (const [x, z, kind, v] of [
    [-16.0, 2.0, 'quarter', 0.25], [-14.0, 4.4, 'quarter', 0.25],
    [-11.5, 1.6, 'dime', 0.10], [-15.5, 5.2, 'quarter', 0.25],
    [-12.0, 4.8, 'coins', 0.60],
  ]) add(kind, v, x, FOUNTAIN.rim - 0.28, z, { inWater: true });

  // A five under a shackle on the hatch cover — the weight you shove off first.
  add('bill5', 5.00, SHACKLE.x + 0.34, SHACKLE.y + 0.02, SHACKLE.z, { pinned: true });

  // A dollar on the mooring deck, and loose change in the flat rack's bed.
  add('bill1', 1.00, -3.0, 0.66, 7.7);
  add('coins', 6.50, RACK.x + 0.6, RACK.y + 0.04, RACK.z);
  // The fo'c'sle store, right forward and a long way from anybody.
  add('coins', 4.00, FOCSLE.x - 0.3, FOCSLE.y + 0.04, FOCSLE.z);

  // — The guarded stretch. Four owners, $49.40, and the endgame. —
  add('bill20', 20.00, LASH.x + 1.2, LASH.y + 0.05, LASH.z, { owner: 'bosun' });
  add('coins', 8.00, PAINT.x + 0.4, PAINT.y + 0.04, PAINT.z, { owner: 'bosun' });
  add('bill10', 10.00, MESS.x + 0.3, MESS.y + 0.04, MESS.z, { owner: 'cook' });
  // `onWing` is what the level's observed task watches for. Every block sets one
  // of these explicitly — the lobby's `underBell`, the wharf's `onPiling` — and
  // without it the task is permanently un-tickable.
  add('coins', 6.40, -25.6, 6.88, 8.4, { owner: 'mate', onWing: true });
  add('bill5', 5.00, WINCH.x + 0.5, WINCH.y + 0.04, WINCH.z, { owner: 'lasher' });

  // — Four shinies. Three are somewhere you have to look up to find. —
  add('shiny', 0, 11.4, 0.66, 6.4, { shinyKind: 'ring' });
  add('shiny', 0, -16.6, FOUNTAIN.rim - 0.28, 3.6, { inWater: true, shinyKind: 'cap' });
  add('shiny', 0, 27.0, top(27.0, -1.0) + 0.05, -1.0, { shinyKind: 'marble' });
  add('shiny', 0, 26.2, 0.06, -5.4, { shinyKind: 'cap' });

  // The bait. A bacon roll off the galley step — the sixth member of
  // BAIT_KINDS, and the only new noun on the block.
  add('bacon', 0, -21.8, 0.06, 5.2);

  return p;
}

// ════════════════════════════════════════════════════════════════════════════
// The cast
// ════════════════════════════════════════════════════════════════════════════

/**
 * Six people, and every one of them at 1.60m of eye height on a deck full of
 * 2.4m boxes — which since the sight fix means they genuinely cannot see past
 * their own cargo. That is the block's gift to the player and it needs a
 * counterweight, which is the mate.
 *
 * They are working because that is what a deck gang does on passage: tightening
 * lashings, chipping, painting. No cargo work and no crane — the ship is at sea.
 */
function humanPlacements() {
  return [
    {
      id: 'bosun', name: 'the bosun', cloth: 0, skin: 1, hair: 0,
      /**
       * Under his own lashing bridge, working the hatch the twenty sits on.
       * He owns $28 of the $49.40 guarded, which is what makes him the bait
       * guard: the audit requires the guard the bait moves to be the one
       * standing over the dearest thing on the block.
       */
      /**
       * On the hatch cover, not inside it. A cover is 0.40 and
       * `WALKER_STEP_OVER` is 0.45, so a walker authored at `y: 0` on top of one
       * is never pushed up and simply stands in it to the knee — and the deck
       * check cannot see it, because it probes from `floorY + 0.05`.
       */
      pos: [1.0, DECK.hatch, -1.0], home: [1.0, DECK.hatch, -1.0],
      patrol: [[1.0, -1.0], [-3.5, -2.0], [4.0, -2.5], [6.5, -1.5]],
      speed: 1.2, chaseSpeed: 4.0, viewDist: 10, viewCos: 0.15,
      guardRadius: 4.0, alertness: 1.2,
    },
    {
      id: 'lasher', name: 'a deckhand', cloth: 3, skin: 2, hair: 1,
      /**
       * A long lap of both hatch covers, which is what keeps crossing your
       * approach. He walks the open deck rather than between the boxes: a cone
       * you can memorise is a puzzle you beat once, and one that walks and
       * comes back makes the same approach safe and unsafe at different moments
       * without anything moving fast enough to feel unfair.
       */
      pos: [12.0, 0, 8.6], home: [12.0, 0, 8.6],
      patrol: [[12.0, 8.6], [24.4, 8.3], [26.0, -4.5], [9.0, -6.2], [1.0, -7.4], [-2.0, 8.4]],
      speed: 1.3, chaseSpeed: 4.0, viewDist: 9.5, viewCos: 0.25,
      guardRadius: 3.4, alertness: 1.0,
    },
    {
      id: 'mate', name: 'the mate', cloth: 1, skin: 0, hair: 3,
      /**
       * On the bridge wing at 6.6, and the reason this block is not solved by
       * standing on a box.
       *
       * Everybody else is at 1.60 with cargo in the way. He is five metres over
       * all of it with nothing between him and the deck, because the cargo is
       * deliberately low — so the west end of the ship, where a third of the
       * money is, is the one part where the boxes do not help you.
       *
       * `canSee` discounts height rather than blocking it, so a long viewDist
       * from up here reaches the whole aft deck. He cannot chase — a human's
       * floorY is authored and he never leaves it — which is exactly right: he
       * is a cone, not a threat, and the threat is that he tells nobody and
       * simply keeps seeing you.
       */
      pos: [-25.9, 6.84, 8.4], home: [-25.9, 6.84, 8.4],
      /**
       * `chaseSpeed: 0`, and this is the fix for a real bug rather than a mood.
       *
       * `floorY` fixes a person's *height*, not their xz — `_moveToward` will
       * happily walk them off the end of their own deck. The house roof stops
       * at x -23.6; take the mate's change and he left it inside two seconds
       * and stood 6.6m over open deck, in the middle of the frame, until his
       * 11m leash pulled him back. He is a cone, and now he is only a cone.
       */
      patrol: null, speed: 0.9, chaseSpeed: 0, viewDist: 15, viewCos: 0.0,
      guardRadius: 5.0, alertness: 1.15, faces: [0.85, 0.3],
    },
    {
      id: 'cook', name: 'the cook', cloth: 2, skin: 3, hair: 2,
      // In the galley doorway, owning the mess room ten and noticing nothing.
      // A body in the doorway you want to use.
      pos: [-22.6, 0, 5.2], home: [-22.6, 0, 5.2],
      patrol: null, speed: 1.0, chaseSpeed: 3.4, viewDist: 6.0, viewCos: 0.45,
      guardRadius: 2.6, alertness: 0.75, faces: [1, 0.1],
    },
    {
      id: 'fitter', name: 'somebody chipping paint', cloth: 4, skin: 1, hair: 1,
      // Oblivious, paces three metres of walkway, stands where you want to
      // land. The park's phone-starer, at the rail.
      pos: [7.0, 0, 10.6], home: [7.0, 0, 10.6],
      patrol: [[7.0, 10.6], [10.5, 10.2], [8.0, 9.0]],
      speed: 1.0, chaseSpeed: 3.0, viewDist: 3.6, viewCos: 0.75,
      guardRadius: 1.6, alertness: 0.25, oblivious: true,
    },
    {
      id: 'kid', name: 'the kid on the rope', cloth: 3, skin: 0, hair: 0,
      /**
       * The youngest aboard, which is what "the kid" means on a ship anyway.
       *
       * She sits, and almost nothing else in this game does — the lobby's
       * pianist spent that rule once and weakened it to "nothing else sits in
       * the open". A ship's deck is full of things that read as seats, so this
       * block has to work at defending it: the bollards are bare, the hatch
       * coamings are bare, and everybody working is on their feet.
       */
      pos: [KID.x, 0.5, KID.z], home: [KID.x, 0.5, KID.z],
      patrol: null, speed: 0, chaseSpeed: 0, viewDist: 0, viewCos: 1,
      guardRadius: 0, alertness: 0,
      kid: true, small: true, sits: true,
      faces: [0.2, 1],
    },
  ];
}

/**
 * Eight gulls, and they have to be two groups.
 *
 * A bird only comes to food within 2.2 of its own floor, so **a gull on a 2.4
 * box is already out of range of a bacon roll on the deck**, by twenty
 * centimetres. Four go low — the rails, the deck, a hatch cover — and those are
 * the mob the bait pulls. Four go high on the boxes, and they are the ceiling
 * on standing up there: land near one and it shrieks, and every human within
 * eleven metres turns to look.
 *
 * They are also the level-5 callback, now that there is no landmark to be one.
 * A ship on passage tows gulls for days, so these are the wharf's gulls and
 * they followed you out. Nothing has to say so.
 *
 * Every one is on a deck that exists — a bird's y is authored and never
 * integrated, so a gull over open sea would hover there, and the audit checks.
 */
function gullPlacements() {
  return [
    // Low — the mob. Every one on something with a real, perchable top: the
    // bulwark is `perch: false` and `deckAt` does not return it, so a gull put
    // on the rail hovers over the sea. The deck check caught exactly that.
    // ...and every one on a surface big enough to stand about on. A gull gets a
    // 2.2m wander range, so it needs at least that much floor in *both*
    // directions: a bollard is 0.56 across, a vent cap 0.9 and the winch 1.6,
    // and a bird on any of them is off it within a second — which the "gulls
    // hold their pitch" check reports as a bird that has left home, twice now.
    // Hatch covers and open deck are the perches that are actually perches.
    // Two on the open deck aft, near where the bacon roll gets dropped: a bird
    // on a hatch cover is leashed to it, so a mob that can only reach the cover
    // edge is a set piece that visibly stalls. `floorY < 0.01` is the one case
    // `_onDeck` lets wander freely, which is exactly what a mob needs.
    { x: -16.0, z: -3.0, y: 0.00 },
    { x: -9.0, z: 7.8, y: 0.00 },
    // ...and two amidships on the covers, clear of the lasher's round. A gull
    // parked on a patrol line gets shoved by a *chasing* guard — worth 2.9m of
    // drift against a 2.6m rule, and invisible unless the sim has money in it
    // for somebody to be provoked about.
    { x: 4.0, z: 3.0, y: 0.40 },
    { x: 13.5, z: 2.0, y: 0.40 },
    // High — the ceiling on standing up there.
    { x: -2.0, z: -4.5, y: 2.80 },
    { x: 20.0, z: 1.0, y: 2.80 },
    { x: 5.0, z: -5.0, y: 2.80 },
    { x: 27.0, z: -1.0, y: 2.40 },
  ];
}

/**
 * One cat, and one is the right number.
 *
 * Two would be a patrol and this is not a patrol — the whole point is that it
 * is a single, slow, entirely avoidable animal that happens to be able to go
 * where the crew cannot. It starts aft by the galley, because that is where a
 * ship's cat lives and because it puts it a long way from the cargo, so the
 * first time it comes for you it has to walk the length of the deck to do it.
 */
function catPlacements() {
  return [{
    id: 'cat',
    name: "the ship's cat",
    pos: [-19.5, 0, 2.0],
    /**
     * A long round of the whole deck, because the point of it is the cargo.
     *
     * It starts aft by the galley, which is where a ship's cat lives, and then
     * walks the length of the ship and back down the other side. Every leg is
     * open deck at y 0 — it never has to path through cargo to get anywhere,
     * and the climbing is a decision it makes when it notices you rather than
     * something it needs in order to get around.
     */
    patrol: [
      [-19.5, 2.0], [-8.0, 8.6], [4.0, 9.4], [16.0, 9.0], [26.0, 6.0],
      [26.5, -6.5], [13.0, -7.4], [1.0, -7.4], [-9.0, -6.0], [-18.0, -4.0],
    ],
  }];
}
