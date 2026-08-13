/**
 * LEVEL 5 — The Wharf.
 *
 * The first block in this game whose ground is not continuous.
 *
 * Every level so far has a floor you can walk the whole of. The block, the
 * park, the roofline and the lobby all differ in who is watching and how high
 * you have to go; on all four you can put the stick in a direction and get
 * there on foot, and flight is a shortcut rather than the only road. This block
 * breaks the floor: a quay along the near edge, one pier out into the water,
 * and then a scatter of things that float. Between them is harbour.
 *
 * What it spends is **footing**. Water is not a wall and it is not death —
 * there is no fail state here and there is not going to be one. It is a cost:
 * 45% speed while you are in it, three seconds of wet after you get out, and a
 * beat of the wings you had not planned to spend. Missing a landing costs you
 * about eight seconds and never a run.
 *
 * The nest is a harbour light standing in open water with no walking route to
 * it at all, so every trip to bank anything is a flight out and back over
 * nothing. That is the lobby's "straight up through the middle of the room in
 * front of everybody" rotated ninety degrees, and it is the level in one object.
 *
 * See docs/wharf-brief.html. §6 is the arithmetic that decided the heights, and
 * it is worth reading before moving any of them.
 */

import * as THREE from 'three';
import { PAL } from '../render/palette.js';
import { box, cyl, cone, ico, plane, at, group, mat } from '../render/shapes.js';
import { NightLights } from '../render/nightlights.js';
import { WATER_EDGE_PAD } from './collide.js';
import { makeKit } from './kit.js';
import { RULES } from './rules.js';

/** The park's footprint, near enough. A harbour basin does not want more. */
export const BOUNDS = { minX: -30, maxX: 30, minZ: -15, maxZ: 15 };

/**
 * The water, as a rectangle.
 *
 * Four blocks have had a circular basin and `world.fountain` was a circle in
 * the type as well as in the fiction. It carries a `shape` now — see
 * `inWaterXZ` in world/collide.js — and this is the first block to use the
 * other branch.
 *
 * The heights are not a choice. Two assertions in the audit hold hands: the rim
 * has to be a wall from the land, and it has to be a single step from the
 * water. The crow scrambles onto anything within STEP_UP (0.34) of its feet,
 * and afloat its feet are at the surface. So the coping must stand more than
 * 0.34 above the quay and less than 0.34 above the water, and 0.62 / 0.42 is
 * the pair every water body in this game has used since level 1.
 *
 * The consequence is that the harbour sits 0.42 above the quay, which is a
 * compromise and is being written down as one. What saves it is the camera and
 * the tide: at 38° from thirty metres you see a quay, a low stone lip and water
 * beyond it, and a harbour at full tide genuinely does lap the top of its wall.
 * Everything that floats here floats high.
 */
// The coping's *inner* faces — where the water visibly stops.
const WATER = { minX: -18, maxX: 14, minZ: -11.5, maxZ: 0.4 };
const RIM = 0.62;          // coping top, and the pier deck
const SURFACE = RIM - 0.20;
const BED = 0.06;

/**
 * Five decks, and four of them are out over the water.
 *
 * This is not the roofline arriving again. The roofline's decks are far apart
 * and the climbing is the difficulty; these are close together — the tallest
 * unbroken climb to the nest is 3.1 m against a 9 m rule — because they are
 * *boats*, and what is hard about them is the water in between. You climb this
 * block by hopping: pier, boat, wheelhouse, beacon.
 */
export const DECK = {
  quay: 0,
  pier: RIM,
  float: 0.55,
  boat: 1.15,
  wheelhouse: 2.4,
  gallery: 3.4,
};

const PIER = { x: -5.5, z: -4.55, w: 4.0, d: 9.9 };     // z −9.5 … 0.4
const MARKET = { x: -14, z: 6.0 };
const COUNTER = { x: -14, z: 8.5 };                      // the bait anchor
const ICEHOUSE = { x: 8, z: 6.2 };
const OFFICE = { x: 20, z: 4.0 };
const BEACON = { x: 4.5, z: -8.0 };
const BOAT = { x: 0, z: -5.0 };
const DOLPHIN = { x: 11, z: -8.0 };                      // the piling cluster
const WEST_FLOAT = { x: -14, z: -6.0 };
const EAST_FLOAT = { x: 8, z: -3.5 };
const DINGHY = { x: -16.0, z: -3.4 };

/**
 * Where the kid sits: on a crate on the quay, with the harbour behind her.
 *
 * The park's rule rather than the roofline's — on the camera side of the water,
 * so a small figure reads against teal instead of against a tan quay. She is
 * also nowhere near the crab pots, which are this block's deliberate near-side
 * occluder: an occluder only fades on the one ray between camera and crow, and
 * trading is core loop.
 */
const KID = { x: -1.0, z: 2.6 };

export function buildLevel() {
  const root = new THREE.Group();
  const colliders = [];
  const occluders = [];
  const perches = [];
  const night = new NightLights(RULES.lampsOnAt);

  const kit = makeKit({ root, colliders, occluders, perches, night });
  const {
    solid, perch, addDecal, addBench, addLamp, addBin, addSkyline, makeNest,
  } = kit;

  /**
   * The spec's rectangle is the waterline grown by WATER_EDGE_PAD, because the
   * shape describes the *basin* and not the water in it — exactly as a circular
   * pool's `r` sits 0.6 outside the stone's inner face. See collide.js; getting
   * this wrong made a crow stop being in the water while it was still in the
   * water, and stranded it against a coping it was touching.
   */
  const FOUNTAIN = {
    shape: 'box',
    minX: WATER.minX - WATER_EDGE_PAD, maxX: WATER.maxX + WATER_EDGE_PAD,
    minZ: WATER.minZ - WATER_EDGE_PAD, maxZ: WATER.maxZ + WATER_EDGE_PAD,
    x: (WATER.minX + WATER.maxX) / 2,
    z: (WATER.minZ + WATER.maxZ) / 2,
    /** The inradius, for anything that still wants one scalar. */
    r: Math.min((WATER.maxX - WATER.minX) / 2, (WATER.maxZ - WATER.minZ) / 2),
    rim: RIM, floor: BED,
  };

  /** Anything standing in the harbour declares itself. See audit-level.mjs. */
  const inWater = (x, z, w, d, top, bottom = 0, opts = {}) =>
    solid(x, z, w, d, top, bottom, { ...opts, inWater: true });

  // ── the quay ──────────────────────────────────────────────────────────────
  // Pale, and paler than a pavement would be. This is the biggest lit surface
  // on the block and most of where the dusk median comes from; the harbour is
  // the biggest surface overall and it cannot be lit at all.
  root.add(plane(150, 96, PAL.paving, { receive: true }));

  // Working boards down the middle of the quay, and the aprons in front of the
  // three buildings. Decals, in add order, four millimetres apart.
  addDecal(0, 6.0, 150, 5.0, PAL.pavingMid);
  addDecal(MARKET.x, MARKET.z + 1.0, 13, 9.0, PAL.stone);
  addDecal(ICEHOUSE.x, ICEHOUSE.z + 1.4, 9, 8.0, PAL.stone);
  addDecal(OFFICE.x, OFFICE.z + 2.0, 9, 8.0, PAL.stone);
  addDecal(-25, 3.0, 8, 7.0, PAL.stone);
  addDecal(PIER.x, 2.2, 7.0, 3.4, PAL.stone);
  addDecal(KID.x + 1.5, 3.2, 9.0, 3.6, PAL.stone);

  // The harbour bed, seen through the water. A decal rather than a plane
  // floating six centimetres over the ground: a flat PlaneGeometry sitting
  // between 1 mm and 30 cm above a surface has to carry polygonOffset, and
  // `addDecal` is the only thing here that hands it out.
  addDecal(FOUNTAIN.x, FOUNTAIN.z,
    WATER.maxX - WATER.minX, WATER.maxZ - WATER.minZ, PAL.harbourBed);

  // ── the water itself ──────────────────────────────────────────────────────
  {
    const w = WATER.maxX - WATER.minX, d = WATER.maxZ - WATER.minZ;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.06, d - 0.06).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({
        color: PAL.harbour, transparent: true, opacity: 0.66, flatShading: true,
      }),
    );
    water.position.set(FOUNTAIN.x, SURFACE, FOUNTAIN.z);
    root.add(water);
    root.userData.fountainWater = water;
    // Faint, and from under the surface. Kept well below a pickup glint — the
    // brief's rule is that nothing added may outshine one.
    night.add(water, PAL.harbour, { peak: 0.12, warm: 4.4, delay: 1.4 });
  }

  /**
   * The coping — four ordinary boxes, and the reason this block needed no new
   * collider shape at all.
   *
   * The ring exists because a circular wall has no axis to slide along. A
   * rectangular basin's edge is four walls, and the crow's box logic already
   * does the right thing at both ends of them: 0.62 is out of reach from the
   * quay, and 0.20 is one step from the water.
   *
   * The near run has a gap in it for the pier steps. Everything else is
   * continuous, corners included, because a gap in a coping is a hole a walker
   * can path through.
   */
  {
    const T = 0.7;
    const cope = (x, z, w, d) => {
      const m = box(w, RIM, d, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
      m.position.set(x, RIM / 2, z);
      root.add(m);
      solid(x, z, w, d, RIM, 0, { tag: 'coping' });
    };
    // Near, in two runs either side of the pier steps.
    cope((WATER.minX - T / 2 + -8.0) / 2, WATER.maxZ + T / 2,
      -8.0 - (WATER.minX - T), T);
    cope((-3.0 + WATER.maxX + T) / 2, WATER.maxZ + T / 2,
      WATER.maxX + T + 3.0, T);
    cope(FOUNTAIN.x, WATER.minZ - T / 2, WATER.maxX - WATER.minX + T * 2, T);
    cope(WATER.minX - T / 2, FOUNTAIN.z, T, WATER.maxZ - WATER.minZ + T * 2);
    cope(WATER.maxX + T / 2, FOUNTAIN.z, T, WATER.maxZ - WATER.minZ + T * 2);
    perch(WATER.maxX + T / 2, RIM, 0);
    perch(WATER.minX - T / 2, RIM, -8);
  }

  // The breakwater, behind the far coping. It is what makes the water stop
  // somewhere rather than run out, and it is where half the gulls stand.
  /**
   * It casts no shadow, for the same reason the backdrop skyline does not.
   *
   * A 36 m wall standing at the very back of the map, under a sun that is behind
   * the block all day, lays a band of shade straight across the harbour — and
   * the harbour is the one surface on this block that no fixture can reach, so
   * that band is pure loss. Nobody plays behind the breakwater; it is there to
   * make the water stop somewhere and to give the gulls a rail. Removing a
   * shadow can only *raise* luminance and every dusk rule in this game is a
   * floor, which is the asymmetry that makes it safe.
   */
  {
    const m = box(36, 1.4, 1.4, PAL.stoneMid, { up: PAL.stone, down: PAL.shade, shadow: false });
    m.position.set(FOUNTAIN.x, 0.7, WATER.minZ - 1.75);
    root.add(m);
    solid(FOUNTAIN.x, WATER.minZ - 1.75, 36, 1.4, 1.4, 0);
    perch(FOUNTAIN.x, 1.4, WATER.minZ - 1.75);
  }

  // ── backdrop: the city, across the water ──────────────────────────────────
  addSkyline([
    [14, 22, PAL.stoneMid], [12, 27, PAL.bark], [16, 18, PAL.terracotta],
    [11, 24, PAL.stoneMid], [15, 20, PAL.terracotta], [13, 26, PAL.stoneMid],
  ], -24, { startX: -48 });
  solid(0, -21, 150, 8, 24);

  // Invisible bounds. The near one sits past the kerb, the far one past the
  // breakwater — a crow that reaches open sea has left the level.
  solid(BOUNDS.minX - 2, 0, 4, 96, 28, 0, { perch: false });
  solid(BOUNDS.maxX + 2, 0, 4, 96, 28, 0, { perch: false });
  solid(0, BOUNDS.maxZ + 2.5, 150, 4, 28, 0, { perch: false });
  solid(0, BOUNDS.minZ - 1.5, 150, 4, 28, 0, { perch: false });

  // The kerb along the near edge, so the quay stops somewhere. Narrow, and no
  // darker than the paving: a wide dark band across the foreground is a third
  // of the frame no lamp reaches.
  {
    addDecal(0, 17.5, 150, 5, PAL.paving);
    const kerb = box(150, 0.34, 1.2, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    kerb.position.set(0, 0.17, 14.8);
    root.add(kerb);
    solid(0, 14.8, 150, 1.2, 0.34, 0, { tag: 'edge-kerb' });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE PIER — the one walking route out over the water
  // ══════════════════════════════════════════════════════════════════════════
  {
    const g = new THREE.Group();
    g.add(at(box(PIER.w, 0.30, PIER.d, PAL.dock, { up: PAL.dockLit, down: PAL.dockMid }),
      0, RIM - 0.15, 0));
    /**
     * Deck boards, so it reads as planking rather than as a plank.
     *
     * Both tones are pale. The first pass alternated `bark` and `barkShade`,
     * which drew thirteen dark grooves across the biggest surface standing over
     * the water and was a good part of why the harbour's 5th percentile came in
     * at 13 against a floor of 24. A board line only has to be a *step* in value
     * to read at this distance, not a shadow.
     */
    for (let i = 0; i < 13; i++) {
      const p2 = box(PIER.w - 0.24, 0.04, 0.52, i % 2 ? PAL.dockLit : PAL.dock,
        { shadow: false, receive: true });
      p2.position.set(0, RIM + 0.005, -PIER.d / 2 + 0.5 + i * 0.76);
      g.add(p2);
    }
    // Pilings under it, down to the bed.
    for (const px of [-1.5, 1.5]) {
      for (let i = 0; i < 5; i++) {
        g.add(at(cyl(0.16, 0.18, RIM, 6, PAL.dockMid, { up: PAL.dock, down: PAL.shade }),
          px, RIM / 2, -PIER.d / 2 + 1.0 + i * 2.0));
      }
    }
    /**
     * Two deck lights, and they are 0.95 m tall on purpose.
     *
     * The pier needs light of its own — it is the one walkable thing out over
     * the water and the beacon is nine metres away — but a lamppost at this
     * camera is a pool on the ground *plus* 4.6 m of opaque column and its
     * shadow standing in the frame, which is what cost the park's ninth lamp
     * more than it bought. A knee-high post occludes nothing and lights the
     * boards, so the pool is nearly all of what you get.
     */
    for (const [i, lz] of [-3.0, 2.2].entries()) {
      g.add(at(cyl(0.06, 0.07, 0.95, 5, PAL.steelDark), 1.6, RIM + 0.475, lz));
      const head = at(ico(0.12, 0, PAL.goldLit, { shadow: false }), 1.6, RIM + 1.02, lz);
      head.material = mat(PAL.goldLit);
      g.add(head);
      night.add(head, PAL.goldLit, { peak: 0.95, warm: 1.7, delay: 0.3 + i * 0.4 });
      night.addPool(root, PIER.x + 1.6, PIER.z + lz, 4.6,
        { profile: 'stall', peak: 0.72, warm: 1.7, delay: 0.3 + i * 0.4, y: RIM });
    }

    g.position.set(PIER.x, 0, PIER.z);
    root.add(g);
    inWater(PIER.x, PIER.z, PIER.w, PIER.d, RIM, 0, { tag: 'pier' });
    perch(PIER.x, RIM, PIER.z - 3);
    perch(PIER.x, RIM, PIER.z + 3);
  }

  /**
   * Two steps up onto the pier, filling the gap in the coping.
   *
   * 0.31 each, which is under the crow's 0.34 scramble so a bird can walk out,
   * and under a walker's 0.45 step so the deckhand can too. They also have to
   * span the whole gap: a hole in the coping with nothing in it is a place you
   * walk straight into the water, and the rule that the rim is a wall from the
   * land is one this block keeps.
   */
  for (const [z, top] of [[1.25, 0.31], [0.75, RIM]]) {
    const m = box(5.0, top, 0.5, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    m.position.set(PIER.x, top / 2, z);
    root.add(m);
    solid(PIER.x, z, 5.0, 0.5, top, 0, { tag: 'pier-step' });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE BEACON — the nest, standing in open water
  // ══════════════════════════════════════════════════════════════════════════
  const NEST = { x: BEACON.x, y: 6.5, z: BEACON.z };
  {
    const g = new THREE.Group();

    // The piling cluster it stands on, and the shaft up to the gallery.
    for (const [px, pz] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) {
      g.add(at(cyl(0.22, 0.26, DECK.gallery, 6, PAL.dockMid, { up: PAL.dock, down: PAL.shade }),
        px, DECK.gallery / 2, pz));
    }
    g.add(at(cyl(0.72, 0.86, DECK.gallery, 8, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }),
      0, DECK.gallery / 2, 0));

    /**
     * The gallery: a square deck with a low rail, and it is 5.2 across for a
     * reason that has nothing to do with looks.
     *
     * It was 3.6, against a crown of 3.2 — which left a ring of 0.2 m, and a
     * crow has a support radius of 0.24. So *every* point on the gallery was
     * inside the crown's footprint, the crown's underside is a ceiling, and a
     * bird standing on the gallery trying to fly up to the nest bonked its head
     * at 5.84 and fell back down. Forever. The only way onto the nest was to
     * arrive already above it.
     *
     * Nothing caught that. "Nothing overlaps the nest" passes because the crown
     * is *below* the twigs, and the crown-landing check drops a crow from above,
     * which is the one approach that works. It took flying the intended route to
     * find — arriving from underneath is a different question from arriving from
     * over the top, and this block is the first one where the answer differs.
     *
     * At 5.2 the ring is 1.0 m wide, so a crow on it stands clear of the
     * overhang and can rise straight past the crown's edge. A lighthouse gallery
     * being wider than its lamp room is also exactly what a lighthouse looks
     * like.
     */
    g.add(at(box(5.2, 0.22, 5.2, PAL.steelDark, { up: PAL.steel, down: PAL.shade }),
      0, DECK.gallery - 0.11, 0));
    for (const [rx, rz, rw, rd] of [
      [0, -2.54, 5.2, 0.12], [0, 2.54, 5.2, 0.12], [-2.54, 0, 0.12, 5.2], [2.54, 0, 0.12, 5.2],
    ]) {
      g.add(at(box(rw, 0.30, rd, PAL.steel, { up: PAL.silver, down: PAL.shade }),
        rx, DECK.gallery + 0.15, rz));
    }

    // The tower, white, tapering. It is the one thing on this block you can see
    // from anywhere, which is the whole job of a harbour light.
    g.add(at(cyl(0.62, 0.88, 6.5 - DECK.gallery, 10, PAL.stone, { up: PAL.stone, down: PAL.stoneMid }),
      0, (DECK.gallery + 6.5) / 2, 0));
    // A painted band, because a white cylinder against a pale sky is a shape
    // nobody can read the height of.
    g.add(at(cyl(0.75, 0.79, 0.6, 10, PAL.terracotta, { up: PAL.terracottaLit, down: PAL.shade }),
      0, DECK.gallery + 1.5, 0));

    /**
     * The lamp gallery at the top, and the nest sitting inside it.
     *
     * The crown is a floor with a low rim, not a lantern with a roof. A hanging
     * or capping fitting over the nest is the lobby's chandelier problem again —
     * "no mesh may cross the nest's own footprint above its base" is an asserted
     * rule now, and it falls out of modelling the thing the nest sits on and
     * forgetting what sits on it. The glazing is a ring of panels at 1.5 m
     * radius; the twig ring is 0.75. Nothing is over it at all.
     */
    g.add(at(box(3.2, 0.24, 3.2, PAL.steelDark, { up: PAL.steel, down: PAL.shade }),
      0, 6.5 - 0.12, 0));
    const panes = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const pane = at(box(0.62, 0.32, 0.10, PAL.goldLit, { shadow: false }),
        Math.cos(a) * 1.48, 6.5 + 0.16, Math.sin(a) * 1.48);
      pane.rotation.y = -a;
      pane.material = mat(PAL.goldLit);
      g.add(pane);
      panes.push(pane);
    }
    // The lens itself, on the north edge and clear of the twigs.
    const lens = at(cyl(0.30, 0.34, 0.52, 8, PAL.goldLit, { shadow: false }), 0, 6.76, -1.15);
    lens.material = mat(PAL.goldLit);
    g.add(lens);
    night.add([...panes, lens], PAL.goldLit,
      { peak: 1.0, warm: 1.4, delay: 0.0, flicker: false });

    g.position.set(BEACON.x, 0, BEACON.z);
    root.add(g);

    inWater(BEACON.x, BEACON.z, 2.2, 2.2, DECK.gallery, 0, { tag: 'beacon-shaft' });
    inWater(BEACON.x, BEACON.z, 5.2, 5.2, DECK.gallery, DECK.gallery - 0.4, { tag: 'beacon-gallery' });
    inWater(BEACON.x, BEACON.z, 1.8, 1.8, 6.5, DECK.gallery, { tag: 'beacon-tower' });
    inWater(BEACON.x, BEACON.z, 3.2, 3.2, 6.5, 6.26, { tag: 'beacon-crown' });
    perch(BEACON.x, DECK.gallery, BEACON.z);
    perch(BEACON.x, 6.5, BEACON.z);

    const nest = makeNest();
    nest.position.set(BEACON.x, 6.5, BEACON.z);
    root.add(nest);
    root.userData.nestGroup = nest;

    // The pool it throws on the water. Discs, small and bright rather than
    // large and dim: a pool costs its area and its brightness is nearly free.
    night.addPool(root, BEACON.x, BEACON.z, 6.2,
      { profile: 'stall', peak: 0.62, warm: 1.4, y: SURFACE });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE FISH MARKET — the set piece, and $29 across one counter
  // ══════════════════════════════════════════════════════════════════════════
  {
    const g = new THREE.Group();

    /**
     * An open shed: a roof on posts, a low landing shelf at the back, and the
     * customer counter at the front.
     *
     * The back is open on purpose. A solid wall here would stand between the
     * camera and everything in the water behind it — the sightline rises 0.616
     * for every 0.714 it travels toward +z, so a 3.9 m wall hides a strip of
     * water roughly four metres deep behind itself, and that strip is where the
     * west float is. Open-backed is also just what a market that lands its fish
     * off the quay looks like.
     */
    const ROOF = 3.9;
    for (const [px, pz] of [[-5.2, -3.0], [5.2, -3.0], [-5.2, 2.5], [5.2, 2.5], [0, -3.0], [0, 2.5]]) {
      g.add(at(cyl(0.10, 0.10, ROOF, 6, PAL.steelDark), px, ROOF / 2, pz));
    }
    const roof = box(11.6, 0.20, 6.6, PAL.terracotta, { up: PAL.terracottaLit, down: PAL.shade });
    roof.position.set(0, ROOF, -0.25);
    g.add(roof);
    for (let i = 0; i < 7; i++) {
      const rib = box(1.6, 0.10, 6.6, i % 2 ? PAL.stone : PAL.terracottaLit, { shadow: false, receive: false });
      rib.position.set(-4.8 + i * 1.6, ROOF + 0.11, -0.25);
      g.add(rib);
    }
    // The landing shelf along the back — low, so it hides nothing.
    g.add(at(box(11.0, 0.95, 0.7, PAL.steel, { up: PAL.silver, down: PAL.shade }), 0, 0.475, -2.9));

    // A strip light under the ridge. The market is the brightest thing on the
    // quay after dark, which is the honest reading of the one place still open.
    const strip = at(box(9.0, 0.14, 0.36, PAL.goldLit, { shadow: false }), 0, ROOF - 0.4, -0.25);
    strip.material = mat(PAL.goldLit);
    g.add(strip);
    night.add(strip, PAL.goldLit, { peak: 0.95, warm: 2.2, delay: 0.5 });

    g.position.set(MARKET.x, 0, MARKET.z);
    root.add(g);
    solid(MARKET.x, MARKET.z - 0.25, 11.6, 6.6, ROOF + 0.2, ROOF - 0.2, { tag: 'market-roof' });
    solid(MARKET.x, MARKET.z - 2.9, 11.0, 0.7, 0.95);
    perch(MARKET.x - 4, ROOF + 0.2, MARKET.z - 0.25);
    perch(MARKET.x + 4, ROOF + 0.2, MARKET.z - 0.25);
    night.addPool(root, MARKET.x, MARKET.z + 1.0, 7.0,
      { profile: 'stall', peak: 0.80, warm: 2.2, delay: 0.5 });
  }

  // The counter, and the open cash box on it. A label saying CASH BOX over a
  // note lying on bare wood is a label doing the geometry's job.
  {
    const g = new THREE.Group();
    g.add(at(box(10.0, 1.10, 0.85, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 0.55, 0));
    g.add(at(box(10.4, 0.10, 1.0, PAL.silver, { up: PAL.shiny, down: PAL.shade }), 0, 1.15, 0));
    // Crushed ice and the day's catch, laid out along it.
    for (let i = 0; i < 5; i++) {
      g.add(at(box(1.5, 0.07, 0.6, PAL.shiny, { shadow: false }), -3.8 + i * 1.9, 1.23, -0.1));
    }
    for (let i = 0; i < 7; i++) {
      const fish = at(ico(0.15, 0, PAL.steel, { up: PAL.silver, down: PAL.shade }),
        -3.9 + i * 1.3, 1.29, -0.12);
      fish.scale.set(1.7, 0.55, 0.7);
      fish.rotation.y = (i % 2 ? 0.3 : -0.4);
      g.add(fish);
    }
    // The open cash box at the east end, where he stands.
    const tin = group(
      at(box(0.40, 0.11, 0.28, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), 0, 0.055, 0),
      at(box(0.40, 0.15, 0.03, PAL.steel, { up: PAL.silver, down: PAL.shade }), 0, 0.13, -0.14),
    );
    tin.position.set(3.0, 1.20, 0);
    g.add(tin);
    // The tip jar at the far end. Glass, so it cannot hide what is in it.
    const jar = cyl(0.16, 0.14, 0.30, 10, PAL.waterLit, { transparent: true, opacity: 0.34, shadow: false });
    jar.position.set(-3.5, 1.35, 0);
    g.add(jar);

    g.position.set(COUNTER.x, 0, COUNTER.z);
    root.add(g);
    solid(COUNTER.x, COUNTER.z, 10.4, 1.0, 1.20);
    perch(COUNTER.x, 1.20, COUNTER.z);
  }

  /**
   * The cutting table, and the tackle box with a five under it.
   *
   * Level 1's saltshaker, the park's paperback, the roofline's candle lantern,
   * the lobby's brass bell. SHOVE is taught on the block in an empty corner and
   * charged for here, on a table inside a working market with the man who owns
   * it eight metres away.
   */
  const tackle = group(
    at(box(0.34, 0.14, 0.22, PAL.cloth[1], { up: PAL.clothLit[1], down: PAL.shade }), 0, 0.07, 0),
    at(box(0.36, 0.03, 0.24, PAL.steelDark, { shadow: false }), 0, 0.155, 0),
  );
  {
    const g = new THREE.Group();
    g.add(at(box(2.4, 0.09, 1.0, PAL.silver, { up: PAL.shiny, down: PAL.shade }), 0, 0.90, 0));
    for (const [tx, tz] of [[-1.0, -0.38], [1.0, -0.38], [-1.0, 0.38], [1.0, 0.38]]) {
      g.add(at(box(0.06, 0.86, 0.06, PAL.steelDark), tx, 0.43, tz));
    }
    g.position.set(MARKET.x - 2.5, 0, 6.6);
    root.add(g);
    solid(MARKET.x - 2.5, 6.6, 2.4, 1.0, 0.95);
    perch(MARKET.x - 2.5, 0.95, 6.6);
    tackle.position.set(MARKET.x - 2.5, 0.97, 6.6);
    tackle.rotation.y = 0.3;
    tackle.userData.label = 'THE TACKLE BOX';
    root.add(tackle);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE ICE HOUSE and THE HARBORMASTER'S OFFICE
  // ══════════════════════════════════════════════════════════════════════════
  {
    const g = new THREE.Group();
    g.add(at(box(6.0, 3.2, 4.5, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, 1.6, 0));
    const roof = box(6.6, 0.24, 5.0, PAL.steelDark, { up: PAL.steel, down: PAL.shade });
    roof.position.y = 3.3;
    g.add(roof);
    // The door and a lamp over it, both on the camera-facing side.
    const door = box(1.5, 2.3, 0.16, PAL.barkShade, { shadow: false });
    door.position.set(-1.0, 1.15, 2.3);
    g.add(door);
    night.add(door, 0xe0a860, { peak: 0.52, warm: 2.8, delay: 1.2 });
    const bulb = at(ico(0.14, 0, PAL.goldLit, { shadow: false }), -1.0, 2.62, 2.44);
    bulb.material = mat(PAL.goldLit);
    g.add(bulb);
    night.add(bulb, PAL.goldLit, { peak: 0.9, warm: 1.8, delay: 1.2, flicker: true });
    // The honesty box on a ledge beside the door.
    g.add(at(box(1.5, 0.13, 0.42, PAL.stone, { up: PAL.stone, down: PAL.shade }), 1.6, 1.06, 2.42));
    g.add(at(box(0.5, 0.44, 0.30, PAL.dockMid, { up: PAL.dock, down: PAL.shade }), 1.6, 1.34, 2.36));

    g.position.set(ICEHOUSE.x, 0, ICEHOUSE.z);
    root.add(g);
    solid(ICEHOUSE.x, ICEHOUSE.z, 6.2, 4.7, 3.42);
    solid(ICEHOUSE.x + 1.6, ICEHOUSE.z + 2.42, 1.5, 0.42, 1.12, 0.94);
    perch(ICEHOUSE.x, 3.42, ICEHOUSE.z);
    night.addPool(root, ICEHOUSE.x - 1.0, ICEHOUSE.z + 3.6, 5.0,
      { profile: 'stall', peak: 0.68, warm: 2.4, delay: 1.2 });
  }

  {
    const g = new THREE.Group();
    g.add(at(box(6.0, 3.4, 4.0, PAL.terracotta, { up: PAL.terracottaLit, down: PAL.shade }), 0, 1.7, 0));
    const roof = box(6.6, 0.26, 4.6, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    roof.position.y = 3.5;
    g.add(roof);
    const win = box(2.6, 1.3, 0.18, PAL.waterLit, { shadow: false });
    win.position.set(-0.5, 1.85, 2.05);
    g.add(win);
    night.add(win, PAL.goldLit, { peak: 0.55, warm: 3.0, delay: 1.6 });
    // The ledge under it, which is where the money is.
    g.add(at(box(3.2, 0.14, 0.44, PAL.stone, { up: PAL.stone, down: PAL.shade }), -0.5, 1.13, 2.15));

    g.position.set(OFFICE.x, 0, OFFICE.z);
    root.add(g);
    solid(OFFICE.x, OFFICE.z, 6.2, 4.2, 3.63);
    solid(OFFICE.x - 0.5, OFFICE.z + 2.15, 3.2, 0.44, 1.20, 1.02);
    perch(OFFICE.x, 3.63, OFFICE.z);
    night.addPool(root, OFFICE.x - 0.5, OFFICE.z + 3.4, 5.0,
      { profile: 'stall', peak: 0.66, warm: 3.0, delay: 1.6 });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WHAT FLOATS
  // ══════════════════════════════════════════════════════════════════════════

  /** A floating dock: a raft just clear of the water, reachable only by air. */
  const addFloat = (x, z, w, d) => {
    const g = new THREE.Group();
    g.add(at(box(w, 0.24, d, PAL.dock, { up: PAL.dockLit, down: PAL.dockMid }), 0, DECK.float - 0.12, 0));
    g.add(at(box(w - 0.3, 0.05, d - 0.3, PAL.dockLit, { shadow: false, receive: true }), 0, DECK.float + 0.01, 0));
    for (const s of [-1, 1]) {
      g.add(at(box(w * 0.9, 0.16, 0.14, PAL.steelDark, { shadow: false }), 0, DECK.float - 0.30, s * (d / 2 - 0.2)));
    }
    g.position.set(x, 0, z);
    root.add(g);
    inWater(x, z, w, d, DECK.float, 0, { tag: 'float' });
    perch(x, DECK.float, z);
    return g;
  };
  addFloat(WEST_FLOAT.x, WEST_FLOAT.z, 6.0, 2.4);
  // The west corner of the harbour has no fixture within fifteen metres of it
  // and it measured as the darkest part of the block. A washer on the market's
  // seaward gable is the honest place for this: pure pool, no column.
  {
    const w = at(box(0.34, 0.16, 0.20, PAL.goldLit, { shadow: false }), MARKET.x, 3.3, 2.7);
    w.material = mat(PAL.goldLit);
    root.add(w);
    night.add(w, PAL.goldLit, { peak: 0.9, warm: 2.0, delay: 0.7 });
    night.addPool(root, WEST_FLOAT.x, WEST_FLOAT.z, 4.4,
      { profile: 'stall', peak: 0.72, warm: 2.0, delay: 0.7, y: DECK.float });
  }
  addFloat(EAST_FLOAT.x, EAST_FLOAT.z, 5.0, 2.2);

  /**
   * The charter boat — a guard on an island.
   *
   * The skipper stands on a deck 1.15 up with water on all four sides, and a
   * human's floorY is authored and never changes, so he cannot follow you
   * anywhere and cannot be lured off. He owns $11.40 that you have to land next
   * to him for. That is either the best guard in the game or a man shouting
   * from a pot, and only a playtest can say which.
   */
  {
    const g = new THREE.Group();
    const hull = box(7.0, 1.15, 2.8, PAL.stone, { up: PAL.stone, down: PAL.shade });
    hull.position.y = 0.575;
    g.add(hull);
    g.add(at(box(7.2, 0.14, 3.0, PAL.terracotta, { up: PAL.terracottaLit, down: PAL.shade }), 0, 1.08, 0));
    g.add(at(box(6.4, 0.06, 2.5, PAL.dockLit, { shadow: false, receive: true }), 0, DECK.boat + 0.01, 0));
    // Gunwales, low enough to hop.
    for (const s of [-1, 1]) {
      g.add(at(box(6.8, 0.26, 0.16, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, DECK.boat + 0.13, s * 1.35));
    }
    // The wheelhouse.
    g.add(at(box(2.2, 1.25, 2.2, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), -1.2, DECK.boat + 0.625, 0));
    g.add(at(box(2.4, 0.14, 2.4, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), -1.2, DECK.wheelhouse - 0.07, 0));
    const glass = box(2.0, 0.6, 0.1, PAL.waterLit, { shadow: false });
    glass.position.set(-1.2, DECK.boat + 0.85, 1.06);
    g.add(glass);
    night.add(glass, PAL.goldLit, { peak: 0.5, warm: 3.4, delay: 2.0 });
    // A mast and a working light on it.
    g.add(at(cyl(0.07, 0.09, 2.6, 5, PAL.steel), -1.2, DECK.wheelhouse + 1.3, -0.6));
    const deckLight = at(ico(0.13, 0, PAL.goldLit, { shadow: false }), -1.2, DECK.wheelhouse + 2.5, -0.6);
    deckLight.material = mat(PAL.goldLit);
    g.add(deckLight);
    night.add(deckLight, PAL.goldLit, { peak: 0.85, warm: 2.0, delay: 0.9 });
    // The fare box, bolted to the transom.
    g.add(at(box(0.42, 0.30, 0.26, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), 2.4, DECK.boat + 0.15, -0.6));

    g.position.set(BOAT.x, 0, BOAT.z);
    root.add(g);
    inWater(BOAT.x, BOAT.z, 7.2, 3.0, DECK.boat, 0, { tag: 'boat-hull' });
    inWater(BOAT.x - 1.2, BOAT.z, 2.4, 2.4, DECK.wheelhouse, DECK.boat, { tag: 'wheelhouse' });
    perch(BOAT.x + 2, DECK.boat, BOAT.z);
    perch(BOAT.x - 1.2, DECK.wheelhouse, BOAT.z);
    night.addPool(root, BOAT.x, BOAT.z, 4.2,
      { profile: 'stall', peak: 0.62, warm: 2.0, delay: 0.9, y: DECK.boat });
  }

  // The dinghy, tied up west. Small, low, and a dollar in the bottom of it.
  {
    const g = new THREE.Group();
    g.add(at(box(3.0, 0.70, 1.6, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 0.35, 0));
    g.add(at(box(2.6, 0.05, 1.2, PAL.dockLit, { shadow: false, receive: true }), 0, 0.71, 0));
    g.add(at(box(1.1, 0.08, 1.1, PAL.dockMid, { shadow: false }), -0.6, 0.76, 0));
    g.position.set(DINGHY.x, 0, DINGHY.z);
    root.add(g);
    inWater(DINGHY.x, DINGHY.z, 3.0, 1.6, 0.70, 0, { tag: 'dinghy' });
    perch(DINGHY.x, 0.70, DINGHY.z);
  }

  /**
   * Pilings. The three-piling dolphin holds the five, and the loose ones are
   * the block's gull furniture — somewhere for a bird to stand that a crow can
   * only reach in the air.
   */
  {
    const addPiling = (x, z, top = 1.3, r = 0.22) => {
      const g = new THREE.Group();
      g.add(at(cyl(r, r * 1.15, top, 6, PAL.dockMid, { up: PAL.dock, down: PAL.shade }), 0, top / 2, 0));
      g.add(at(cyl(r * 1.25, r * 1.25, 0.10, 6, PAL.steelDark, { up: PAL.steel }), 0, top - 0.05, 0));
      g.position.set(x, 0, z);
      root.add(g);
      return g;
    };
    // The dolphin: three pilings and a cap plate, wide enough to stand on.
    for (const [dx, dz] of [[-0.5, -0.45], [0.5, -0.45], [0, 0.5]]) {
      addPiling(DOLPHIN.x + dx, DOLPHIN.z + dz, 1.3, 0.24);
    }
    const cap = box(1.5, 0.12, 1.5, PAL.dock, { up: PAL.dockLit, down: PAL.dockMid });
    cap.position.set(DOLPHIN.x, 1.30, DOLPHIN.z);
    root.add(cap);
    inWater(DOLPHIN.x, DOLPHIN.z, 1.5, 1.5, 1.36, 0, { tag: 'dolphin' });
    perch(DOLPHIN.x, 1.36, DOLPHIN.z);

    for (const [px, pz, h] of [
      [-9.5, -10.2, 1.5], [-8.2, -10.4, 1.2], [1.5, -10.6, 1.4],
      [12.6, -2.0, 1.3], [-16.6, -9.4, 1.35], [10.0, -10.8, 1.25],
    ]) {
      addPiling(px, pz, h, 0.20);
      inWater(px, pz, 0.5, 0.5, h + 0.06, 0, { tag: 'piling' });
      perch(px, h + 0.06, pz);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // QUAY FURNITURE
  // ══════════════════════════════════════════════════════════════════════════

  // Bollards along the coping. Perches, and where the loose change ends up.
  {
    const bollard = (x, z) => {
      const g = new THREE.Group();
      g.add(at(cyl(0.20, 0.24, 0.60, 8, PAL.steel, { up: PAL.silver, down: PAL.shade }), 0, 0.30, 0));
      g.add(at(cyl(0.26, 0.22, 0.12, 8, PAL.steel, { up: PAL.silver }), 0, 0.66, 0));
      g.position.set(x, 0, z);
      root.add(g);
      solid(x, z, 0.52, 0.52, 0.72);
      perch(x, 0.72, z);
    };
    for (const [x, z] of [[-16.5, 2.0], [-10.0, 2.0], [2.0, 2.0], [8.5, 2.0], [11.5, 2.2], [-20.5, 2.0]]) {
      bollard(x, z);
    }
  }

  /**
   * The hoist at the west end. Tall, thin, and deliberately at the far end of
   * the block from anything takeable — a 5.5 m column is opaque all the way up
   * and the park lost a coin's only sightline to a lamppost exactly like it.
   */
  {
    const g = new THREE.Group();
    g.add(at(box(1.6, 0.35, 1.6, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), 0, 0.175, 0));
    g.add(at(cyl(0.18, 0.22, 5.2, 6, PAL.steel, { up: PAL.steel, down: PAL.steelDark }), 0, 2.6, 0));
    g.add(at(box(3.4, 0.24, 0.4, PAL.steel, { up: PAL.silver, down: PAL.shade }), 1.0, 5.3, 0));
    g.add(at(cyl(0.03, 0.03, 1.6, 4, PAL.steelDark, { shadow: false }), 2.4, 4.4, 0));
    g.add(at(box(0.36, 0.30, 0.3, PAL.steelDark), 2.4, 3.5, 0));
    g.position.set(-25, 0, 1.6);
    root.add(g);
    solid(-25, 1.6, 1.6, 1.6, 5.4, 0);
    perch(-25, 5.42, 1.6);
  }

  /**
   * Crab pots and a net frame — the block's deliberate near-side occluder.
   *
   * At the near-east corner, which is as far from the kid, the counter and the
   * beacon as the block goes. Nothing that is core loop is behind it.
   */
  {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const pot = box(1.05, 0.42, 1.05, PAL.canopyShade, { up: PAL.canopy, down: PAL.shade });
      pot.position.set((i % 2) * 1.15 - 0.55, 0.21 + Math.floor(i / 2) * 0.44, (i % 3 === 2) ? 0.2 : -0.15);
      g.add(pot);
    }
    // The net frame: two posts and a hanging net.
    for (const px of [-1.6, 1.6]) g.add(at(cyl(0.09, 0.09, 3.0, 5, PAL.dockMid), px, 1.5, 1.6));
    const net = box(3.4, 1.9, 0.06, PAL.awning, { transparent: true, opacity: 0.55, shadow: false });
    net.position.set(0, 1.85, 1.6);
    g.add(net);
    g.position.set(16, 0, 12.4);
    root.add(g);
    occluders.push(...g.children);
    solid(16, 12.25, 2.6, 1.6, 1.34);
    solid(16, 14.0, 3.4, 0.3, 3.0);
    perch(16, 1.34, 12.25);
  }

  // Two benches, both empty. The kid is the only person on this block who is
  // sitting down and a wharf is full of people sitting on things, so this is a
  // choice being defended rather than a fact being inherited.
  addBench(-2, 12.5);
  addBench(11, 12.0);

  addBin(-7.5, 11.5, PAL.steelDark);
  addBin(13.5, 3.0, PAL.canopyShade);
  addBin(-22.5, 7.5, PAL.steelDark);

  /**
   * Six pole lights, and no more.
   *
   * At this camera a lamp is a pool on the ground *plus* a 4.6 m opaque column
   * and its shadow standing in the frame — the park's ninth lamppost bought two
   * points of median and cost four of 5th percentile. The market strip, the ice
   * house door, the boat's deck light and the beacon do most of the work here;
   * these fill the gaps between them.
   */
  addLamp(-27.5, 9.5);
  addLamp(-19.5, 11.5);
  addLamp(-8.0, 3.4);
  addLamp(4.5, 11.0);
  addLamp(14.5, 8.0);
  addLamp(25.5, 8.5);

  // The kid's crate, and the trinkets she has already been given beside it.
  {
    const g = new THREE.Group();
    g.add(at(box(0.86, 0.50, 0.72, PAL.dock, { up: PAL.dockLit, down: PAL.dockMid }), 0, 0.25, 0));
    g.add(at(box(0.90, 0.06, 0.76, PAL.dockMid, { shadow: false }), 0, 0.53, 0));
    g.position.set(KID.x, 0, KID.z);
    root.add(g);
    solid(KID.x, KID.z, 0.86, 0.72, 0.50);

    // Her pitch: a cup and the things she has collected. None takeable — the
    // affordance is that she is visibly the person who collects things.
    const t = new THREE.Group();
    t.add(at(cyl(0.055, 0.055, 0.016, 8, PAL.cloth[0], { up: PAL.clothLit[0], down: PAL.shade }), 0, 0.02, 0));
    const shell = ico(0.055, 1, PAL.shiny, { shadow: false });
    shell.position.set(0.20, 0.05, 0.10);
    t.add(shell);
    t.add(at(box(0.12, 0.02, 0.05, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), -0.22, 0.02, 0.06));
    t.position.set(KID.x + 0.85, 0, KID.z + 0.30);
    root.add(t);
  }

  return {
    root, colliders, occluders, perches,
    nightLights: night,
    fountain: FOUNTAIN,
    waterDeck: DECK.quay,
    nest: NEST,
    nestPlatform: 3.2,     // the lamp gallery's floor
    nestFootprint: 1.5,    // the twig ring itself
    decks: DECK,
    /** The bait anchor. The game calls it `cart` whatever the block sells. */
    cart: COUNTER,
    /** The weighted object pinning a bill. The game knows it as `pin`. */
    pin: tackle,
    pickups: pickupPlacements(),
    humans: humanPlacements(),
    gulls: gullPlacements(),
    pigeons: pigeonPlacements(),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Placements
// ════════════════════════════════════════════════════════════════════════════

/**
 * The value ladder, laid out on a dock.
 *
 * $64.20 against a $40 goal, so you have to land 62% of it. What is new here is
 * a column the other four blocks do not have: money that **nobody owns and you
 * still cannot walk to**. $8.50 of it sits out over the water on a piling cap,
 * a float, a dinghy and the beacon's own gallery, guarded by nothing but the
 * fact that there is no floor between you and it.
 *
 * That money is what makes the block teachable. A player who has not worked out
 * what this level is about can see a five glinting on a post nine metres out,
 * and the only way to answer it is to fly.
 */
function pickupPlacements() {
  const p = [];
  const add = (kind, value, x, y, z, extra = {}) =>
    p.push({ kind, value, pos: [x, y, z], ...extra });

  // — Scattered change on the quay: the teaching money, deliberately trivial
  //   and deliberately nowhere near enough. —
  for (const [x, z] of [
    [-26.5, 8.0], [-21.0, 12.0], [-16.0, 11.5], [-9.5, 12.5], [-3.0, 9.5],
    [3.5, 12.0], [7.0, 11.0], [15.5, 6.5], [22.0, 9.5], [27.0, 5.5],
  ]) add('penny', 0.01, x, 0.06, z);
  for (const [x, z] of [[-28.0, 4.5], [-21.5, 5.0], [-5.5, 11.5], [12.5, 11.0], [24.5, 2.0]]) {
    add('nickel', 0.05, x, 0.06, z);
  }
  for (const [x, z] of [[-23.5, 10.5], [2.5, 2.6], [5.0, 10.0], [19.5, 11.0]]) {
    add('dime', 0.10, x, 0.06, z);
  }
  for (const [x, z] of [[-27.5, 1.5], [1.0, 6.5], [26.5, 1.5]]) add('quarter', 0.25, x, 0.06, z);

  // Loose change on the furniture, and a dollar somebody left in the crab pots.
  add('coins', 0.80, 11.5, 0.76, 2.2);
  add('coins', 0.70, -2.0, 0.71, 12.5);
  add('bill1', 1.00, 16.0, 1.40, 12.25);

  // — The harbour floor. You have to go in. —
  for (const [x, z] of [
    [-9.0, -3.0], [-2.5, -8.6], [2.5, -2.0], [7.2, -9.8], [-16.0, -9.0], [11.5, -3.2],
  ]) add('quarter', 0.25, x, RIM - 0.28, z, { inWater: true });

  // — Out over the water: unowned, and unreachable on foot. —
  //
  // The five on the dolphin is the block's teaching object and the task points
  // at it. It is on a 1.5 m cap nine metres from the nearest walkable thing.
  add('bill5', 5.00, 11.0, 1.42, -8.0,
    { owner: null, label: 'THE FIVE ON THE PILINGS', onPiling: true });
  add('coins', 1.25, -14.0, 0.61, -6.0);
  add('bill1', 1.00, -16.0, 0.77, -3.4);
  // On the beacon's own gallery — free, once, because you are going there anyway.
  add('coins', 1.25, 6.4, 3.46, -8.0);

  // — The fish market: $29 across one counter. —
  add('bill20', 20.00, -11.0, 1.26, 8.5, { owner: 'monger', label: "THE DAY'S TAKE" });
  add('coins', 4.00, -17.5, 1.30, 8.5, { owner: 'monger', label: 'THE TIP JAR', inJar: true });
  add('bill5', 5.00, -16.5, 0.96, 6.6,
    { owner: 'monger', pinned: true, label: 'THE FIVE UNDER THE TACKLE BOX' });

  // — The ice house, the office, and the boat. —
  add('coins', 3.60, 9.6, 1.14, 8.62, { owner: 'deckhand', label: 'THE HONESTY BOX' });
  add('bill5', 5.00, 18.6, 1.22, 6.15, { owner: 'harbormaster', label: 'THE FIVE ON THE LEDGE' });
  add('coins', 1.20, 20.8, 1.22, 6.15, { owner: 'harbormaster' });
  add('bill10', 10.00, 2.4, 1.32, -5.6, { owner: 'skipper', label: 'THE FARE BOX' });
  add('coins', 1.40, 2.5, 1.22, -4.2, { owner: 'skipper' });

  // — Shinies: worthless, tradeable, and two of the four are out over water. —
  add('shiny', 0, -4.5, 0.07, 5.5, { shinyKind: 'cap' });
  add('shiny', 0, 0.5, RIM - 0.28, -1.5, { inWater: true, shinyKind: 'ring' });
  add('shiny', 0, 8.0, 0.61, -3.5, { shinyKind: 'key' });
  add('shiny', 0, -1.2, 2.47, -5.0, { shinyKind: 'foil' });

  // — The mackerel. Not money; the only way to move a fishmonger. —
  // On the counter, well clear of both the cash box and the jar: the beak takes
  // the nearest, and a bait sitting inside a beak-length of a twenty is a lucky
  // dip at the worst possible moment.
  add('fish', 0, -14.0, 1.28, 8.5, { owner: 'monger' });

  p.forEach((x, i) => { x.id = i; });
  return p;
}

function humanPlacements() {
  return [
    {
      id: 'monger', name: 'the fishmonger', cloth: 1, skin: 0, hair: 1,
      /**
       * At the open east end of his counter rather than behind it.
       *
       * The park learned this and the lobby restated it: the guard whose leaving
       * is the puzzle has to be unmistakably visible both before and after he
       * leaves, and behind a counter is where this camera cannot see him. He is
       * standing on the quay in the open, beside the cash box he owns.
       */
      pos: [-8.0, 0, 9.2], home: [-8.0, 0, 9.2],
      patrol: null, speed: 1.3, chaseSpeed: 4.0, viewDist: 12, viewCos: 0.1,
      guardRadius: 4.6, alertness: 1.25, faces: [-1, -0.2],
    },
    {
      id: 'deckhand', name: 'a deckhand', cloth: 4, skin: 3, hair: 0,
      /**
       * A full lap of the quay, and the level's clock — the park's keeper and
       * the lobby's bellhop doing the same job. He owns the ice house box, and
       * it is outside his guard radius for most of the minute, which is the
       * point: you time him rather than learn a cone.
       */
      pos: [2, 0, 10], home: [2, 0, 10],
      patrol: [[-22, 9], [-10, 11.5], [1, 11], [9, 9.5], [15, 4.0], [22, 9.5], [26, 5.0], [10, 2.6], [-4, 3.4], [-24, 4.0]],
      speed: 1.35, chaseSpeed: 4.1, viewDist: 9.5, viewCos: 0.3,
      guardRadius: 3.4, alertness: 0.95,
    },
    {
      id: 'skipper', name: 'the skipper', cloth: 3, skin: 1, hair: 2,
      /**
       * On his own deck at 1.15, with water on all four sides.
       *
       * A human's floorY is authored and they never leave it, which on every
       * other block is a thing the crow exploits by going up. Here it is the
       * guard's whole character: he cannot chase you off the boat, he cannot be
       * baited off it, and he is standing over $11.40. Getting it means landing
       * next to him and being right about the timing, because there is nowhere
       * to retreat to that is not a swim.
       */
      pos: [1.6, 1.15, -5.0], home: [1.6, 1.15, -5.0],
      patrol: null, speed: 1.0, chaseSpeed: 3.6, viewDist: 8.5, viewCos: 0.25,
      guardRadius: 3.2, alertness: 1.2, faces: [-1, 0.15],
    },
    {
      id: 'harbormaster', name: 'the harbormaster', cloth: 1, skin: 2, hair: 3,
      pos: [21.6, 0, 6.8], home: [21.6, 0, 6.8],
      patrol: null, speed: 1.1, chaseSpeed: 3.9, viewDist: 9, viewCos: 0.25,
      guardRadius: 3.6, alertness: 1.05, faces: [-0.7, 0.7],
    },
    {
      id: 'tourist', name: 'someone taking a picture', cloth: 2, skin: 0, hair: 1,
      // Owns nothing, notices nothing, and stands exactly where you want to
      // land. The park's phone-starer, at the rail.
      pos: [13.0, 0, 10.2], home: [13.0, 0, 10.2],
      patrol: null, speed: 1.0, chaseSpeed: 3.0, viewDist: 3.0, viewCos: 0.8,
      guardRadius: 1.4, alertness: 0.2, oblivious: true, faces: [-0.3, -1],
    },
    {
      id: 'hoser', name: 'someone washing down the boards', cloth: 0, skin: 1, hair: 0,
      // A slow three-metre pace across the front of the market. A cone you can
      // memorise is a puzzle you beat once; one that walks and comes back makes
      // the same approach safe and unsafe at different moments.
      pos: [-6.5, 0, 5.6], home: [-6.5, 0, 5.6],
      patrol: [[-6.5, 5.6], [-6.0, 10.4], [-2.5, 7.0]],
      speed: 1.15, chaseSpeed: 3.4, viewDist: 4.0, viewCos: 0.7,
      guardRadius: 1.8, alertness: 0.35, oblivious: true,
    },
    {
      id: 'kid', name: 'the kid on the crate', cloth: 2, skin: 2, hair: 2,
      /**
       * The only person on this block who is sitting down.
       *
       * The lobby spent this rule — its pianist sits, so it is "nothing else
       * sits in the open" now rather than "nothing else sits". This block
       * inherits the weaker version and does not spend any more of it: the two
       * people fishing off the east quay stand at the rail, both benches are
       * empty, and everybody working is on their feet. A dock is full of people
       * sitting on bollards, so that is a defence rather than a coincidence.
       */
      pos: [KID.x, 0.53, KID.z], home: [KID.x, 0.53, KID.z],
      patrol: null, speed: 0, chaseSpeed: 0, viewDist: 0, viewCos: 1,
      guardRadius: 0, alertness: 0,
      kid: true, small: true, sits: true,
      // Facing the water, which is what swings her legs out over the coping.
      faces: [0.15, -1],
    },
  ];
}

/**
 * The gulls, and this is their dock.
 *
 * On the roofline they are authored danger — cover, inverted, one on every
 * approach to something expensive. Here they are the opposite: nine of them,
 * none guarding anything, standing on the pilings and the breakwater and the
 * shed roof because that is where gulls stand. They are the block's weather,
 * and they are the mob the mackerel pulls.
 *
 * Every one of them is on a deck above the water rather than in it — a bird's y
 * is authored and never integrated, so a gull placed over open harbour would
 * hover there, and the audit checks for exactly that.
 */
function gullPlacements() {
  return [
    { x: -9.5, z: -10.2, y: 1.56 },
    { x: 1.5, z: -10.6, y: 1.46 },
    { x: 12.6, z: -2.0, y: 1.36 },
    { x: -6.0, z: -13.2, y: 1.4 },
    { x: 6.5, z: -13.2, y: 1.4 },
    { x: -14.0, z: -6.0, y: DECK.float },
    { x: -14.0, z: 4.15, y: 4.1 },
    { x: -10.5, z: 4.15, y: 4.1 },
    { x: 20.0, z: 4.0, y: 3.63 },
  ];
}

/** Quay pigeons, where the market drops things. */
function pigeonPlacements() {
  return [
    { x: -5.0, z: 8.5 }, { x: 0.5, z: 10.5 }, { x: -18.5, z: 11.0 },
    { x: 6.5, z: 12.0 }, { x: 18.0, z: 9.0 },
  ];
}
