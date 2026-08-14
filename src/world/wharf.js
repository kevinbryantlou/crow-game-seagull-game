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
/**
 * The basin's waterline — the coping's inner faces, and the water you can swim
 * in. Its north edge is the breakwater's inner face rather than a fourth wall,
 * because the harbour opens to the sea there.
 */
const BASIN = { minX: -18, maxX: 14, minZ: -12.55, maxZ: 0.4 };
/** The breakwater. Wider than the basin, so it closes it at both corners. */
const MOLE = { x: -2, z: -13.25, w: 64, d: 1.4 };
/**
 * The harbour mouth — the gap in the breakwater, and the reason the water reads
 * as connected to something.
 *
 * Kept inside the basin's own width (x -18..14) so the opening is a gap in the
 * *basin's* north edge rather than a notch beyond the corner of it, and east of
 * the beacon so the block's focal object is not standing in front of the hole.
 */
const MOUTH = { minX: -10, maxX: 3 };
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
  /** The net loft's stage, out in the water on piles. */
  stage: 2.5,
};

const PIER = { x: -5.5, z: -4.55, w: 4.0, d: 9.9 };     // z −9.5 … 0.4
const MARKET = { x: -14, z: 6.0 };
const COUNTER = { x: -14, z: 8.5 };                      // the bait anchor
const ICEHOUSE = { x: 8, z: 6.2 };
const OFFICE = { x: 20, z: 4.0 };
/**
 * The net loft: the nest, on a hut on piles in open water.
 *
 * `roof` is the only height anything else needs. The climb to it is 2.4 (the
 * boat's wheelhouse) → 5.0, which is 2.6 m against a 9 m rule — the difficulty
 * here was never vertical, it is the water in between.
 */
/**
 * Solved from the constraints rather than placed by eye, which is how it ended
 * up 0.05 m from a piling the last time.
 *
 * The stage is 5.4 across. The mole's berthing ledge ends at z = −11.85 and the
 * quay coping at z = 0.4, so 2.5 m of clearance at both ends puts the centre at
 * −6.65. The boat's hull reaches x = 4.4 and overlaps this in z, so the same
 * clearance in x puts the centre at 9.6. Both gaps are the audit's minimum, and
 * the audit prints the whole matrix every run because adjacency is the one
 * property of a level that is invisible in its source.
 */
const LOFT = { x: 9.6, z: -6.65, roof: 5.0 };
/**
 * The harbour light, on the head of the west arm at the mouth.
 *
 * Out at the far west end of the mole it was barely in frame — the camera cuts
 * off anything that tall that far to the side, so all a player saw was a plinth.
 * The entrance is where a harbour light actually stands, it is near the middle
 * of the map, and it means the one lit tower on the block marks the one gap in
 * the wall. The east arm keeps a plain green marker, which is the real pairing.
 */
const LIGHT = { x: 4.5 };
/**
 * Alongside the pier, not merged into it — and deliberately still alongside.
 *
 * The hull used to *overlap* the pier by 0.1 m, which is two colliders sharing a
 * strip and a boat that has grown into the dock. It lies 0.3 m off it now, which
 * is what a moored boat does.
 *
 * A design review argued for pushing it 2 m out so that boarding the skipper is
 * a flight. It is right about the effect and the basin cannot pay for it: 32 m of
 * water has to hold a 4 m pier, a 7.2 m boat and a 5.4 m loft, and buying 2 m
 * here costs the nest the 2.5 m clearance that is the more important number by
 * far. **A boat moored at a dock is also simply what this is** — the fiction
 * wants it against the pier, and the level's claim that there is nowhere to
 * retreat to has been corrected to match the geometry rather than the other way
 * round.
 */
const BOAT = { x: 0.4, z: -4.0 };
/**
 * The piling cluster, and it has moved west of the pier.
 *
 * It was at (11, −8), which was nine metres from the old lighthouse nest and
 * five centimetres from the loft that replaced it. The five on its cap is the
 * block's teaching object — the task line says *get the five off the far
 * pilings* and its whole job is to make a player fly out over water for the
 * first time — and it had ended up on the nest's doorstep, so the lesson fired
 * while you were already standing at the bank. Moving the nest moved what the
 * nest was far from; nothing pointed that out because no rule measures the gap
 * between two things.
 *
 * West of the pier it is on the opposite side of the block from the loft, so the
 * trip is its own decision again.
 */
const DOLPHIN = { x: -13.5, z: -9.0 };
/** Where the west float used to be. Still lit — it is open water now. */
const WEST_FLOAT = { x: -14, z: -6.0 };
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
    solid, perch, addDecal, addBench, addLamp, addBin, makeNest,
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
    minX: BASIN.minX - WATER_EDGE_PAD, maxX: BASIN.maxX + WATER_EDGE_PAD,
    minZ: BASIN.minZ - WATER_EDGE_PAD, maxZ: BASIN.maxZ + WATER_EDGE_PAD,
    x: (BASIN.minX + BASIN.maxX) / 2,
    z: (BASIN.minZ + BASIN.maxZ) / 2,
    /** The inradius, for anything that still wants one scalar. */
    r: Math.min((BASIN.maxX - BASIN.minX) / 2, (BASIN.maxZ - BASIN.minZ) / 2),
    rim: RIM, floor: BED,
  };

  /** Anything standing in the harbour declares itself. See audit-level.mjs. */
  const inWater = (x, z, w, d, top, bottom = 0, opts = {}) =>
    solid(x, z, w, d, top, bottom, { ...opts, inWater: true });

  // ── the quay ──────────────────────────────────────────────────────────────
  /**
   * Concrete, not `paving`.
   *
   * This is the biggest lit surface on the block and most of where the dusk
   * median comes from, so it has to stay pale — but it does not have to stay
   * *tan*. Every other block stands on `paving`, and on a level whose props are
   * timber and stone that made the whole frame beige, which is the note this
   * block came back with. `PAL.concrete` is the same luminance and a good deal
   * cooler, and its whole job is to be something a saturated colour can sit on.
   */
  root.add(plane(150, 96, PAL.concrete, { receive: true }));

  // Working boards down the middle of the quay, and the aprons in front of the
  // three buildings. Decals, in add order, four millimetres apart.
  addDecal(0, 6.0, 150, 5.0, PAL.concreteMid);
  addDecal(MARKET.x, MARKET.z + 1.0, 13, 9.0, PAL.stone);
  addDecal(ICEHOUSE.x, ICEHOUSE.z + 1.4, 9, 8.0, PAL.stone);
  addDecal(OFFICE.x, OFFICE.z + 2.0, 9, 8.0, PAL.stone);
  addDecal(-25, 3.0, 8, 7.0, PAL.stone);
  addDecal(PIER.x, 2.2, 7.0, 3.4, PAL.stone);
  addDecal(KID.x + 1.5, 3.2, 9.0, 3.6, PAL.stone);
  /**
   * Painted deck markings, and they are *pale* — which took a measurement.
   *
   * The first pass laid a 9x3 orange keep-clear and a 6x4 hatched bay across the
   * near half of the quay, on the reasoning that flat colour is free. It is not:
   * `PAL.buoy` is 70 points of luminance below the concrete and
   * `container[3]` is 37 below it, and the quay is the block's brightest and
   * largest lit surface. Four big patches of it took the dusk 5th percentile
   * from 41 to 22 and the median from 115 to 128-and-falling — I had added the
   * biggest dark thing on the block while trying to make it less beige.
   *
   * The colour on this block comes from *objects* — containers, drums, crates,
   * buoys — which occupy a few percent of the frame each and can be as saturated
   * as they like. Ground paint is a value decision, so it is bay-marking white
   * with a thin warm edge, which is what a real quay is painted with anyway.
   */
  addDecal(4.5, 2.2, 6.4, 0.34, PAL.stone);
  addDecal(4.5, 3.9, 6.4, 0.34, PAL.stone);
  addDecal(-22.0, 0.6, 5.4, 0.30, PAL.stone);

  // The harbour bed, seen through the water. A decal rather than a plane
  // floating six centimetres over the ground: a flat PlaneGeometry sitting
  // between 1 mm and 30 cm above a surface has to carry polygonOffset, and
  // `addDecal` is the only thing here that hands it out.
  /**
   * It runs north past the basin to under the breakwater, which is wider than
   * the water it is the bed of — deliberately.
   *
   * The mouth is bridged by a translucent quad, and translucent over *bare
   * ground* is a pale tan band, which is what the seam at the harbour mouth
   * turned into once the z-fighting was fixed. The strip between the basin's
   * north edge and the sea's south edge had no bed under it, so the water there
   * was tinting the quay's concrete instead of the harbour floor. Extending the
   * bed costs one decal's worth of nothing and the overhang is invisible: it
   * ends up inside the mole arms, which are opaque solids standing on it.
   */
  addDecal((BASIN.minX + BASIN.maxX) / 2, (BASIN.maxZ + (MOLE.z - MOLE.d / 2 - 0.4)) / 2,
    BASIN.maxX - BASIN.minX, BASIN.maxZ - (MOLE.z - MOLE.d / 2 - 0.4), PAL.harbourBed);

  // ── the water: a basin that opens to the sea ──────────────────────────────
  /**
   * Two planes, and the reason there are two is the note this level came back
   * with: *a landlocked square does not look good.*
   *
   * The first build put coping on all four sides, which is what a fountain is
   * and what a harbour is not — the water stopped in a straight line six metres
   * short of the backdrop and read as a swimming pool with boats in it. A
   * harbour has to look like it goes somewhere.
   *
   * So the basin keeps its coping on three sides and opens north across a
   * breakwater into open water that runs to the horizon. The seam between them
   * sits exactly on the breakwater's far face, so the one thing standing in the
   * frame at that line is the thing that would be standing there anyway.
   *
   *   basin  — translucent over its own bed, because the coins on the bottom
   *            have to read through it. This is the part you can swim in.
   *   sea    — opaque, a step deeper in colour, 440 m across. Visual only: the
   *            crow is stopped at the breakwater, which is what keeps the water
   *            body spec and the water you can *see* from disagreeing.
   */
  {
    const w = BASIN.maxX - BASIN.minX, d = BASIN.maxZ - BASIN.minZ;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.06, d - 0.06).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({
        color: PAL.harbour, transparent: true, opacity: 0.66, flatShading: true,
      }),
    );
    water.position.set((BASIN.minX + BASIN.maxX) / 2, SURFACE, (BASIN.minZ + BASIN.maxZ) / 2);
    /**
     * What the shimmer in main.js oscillates around, and the reason that number
     * is per-level now.
     *
     * The frame loop used to hardcode `0.80 + sin(...) * 0.05`, which is right
     * for an ornamental basin and wrong here: this water is built at 0.66 so the
     * quarters on the bed read through it, and the loop drove it to 0.85 every
     * frame regardless. The level set a value and the renderer overwrote it, and
     * the only symptom was that the block's biggest surface looked flatter and
     * more opaque than the material said it was.
     */
    water.userData.baseOpacity = 0.66;
    root.add(water);
    root.userData.fountainWater = water;
    /**
     * The water lights itself at dusk, and that is not decoration.
     *
     * The harbour is over half the frame from anywhere on the pier and it is the
     * one surface on this block no fixture can reach — a pool is a disc on a
     * plane, and open water is 400 m of plane. At the first setting its median
     * fell to 45 against a floor of 48 while every lit surface around it passed
     * comfortably, which is the same shape as the roofline's dark wall: the
     * biggest thing in the frame decides the median on its own.
     *
     * So the emissive on the water itself is what carries it, which is also the
     * honest phenomenon — a harbour at dusk is lit by the sky, not by lamps, and
     * still water is a mirror of it. Kept under a pickup glint, which is the
     * brief's rule for anything added to a frame.
     *
     * **Tuned twice, and the first number was junk.** It went to 0.72 while the
     * harness was still photographing this block 700 ms into an eight-second
     * ramp — so the value was chosen against a frame that was not showing what
     * it would show in play. With the measurement fixed, 0.72 rendered the
     * harbour as milky near-white and took the frame's blue-over-red margin from
     * 28 down to 14. Fix the measurement, then tune: this project has written
     * that down once already, about a light pool being tuned while it was
     * clipped.
     */
    night.add(water, PAL.harbour, { peak: 0.30, warm: 3.4, delay: 1.2 });

    // The open sea. No bed under it and nothing to see through it, so it is
    // opaque — a translucent plane out here would show the tan ground plane
    // underneath and the harbour would end in a beach.
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(440, 400).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: PAL.harbourDeep, flatShading: true }),
    );
    sea.position.set(0, SURFACE, MOLE.z - MOLE.d / 2 - 200);
    sea.receiveShadow = true;
    root.add(sea);
    night.add(sea, PAL.harbourDeep, { peak: 0.26, warm: 3.4, delay: 1.2 });
  }

  /**
   * The coping, on three sides only.
   *
   * The ring collider exists because a circular wall has no axis to slide
   * along. A rectangular basin's edge is ordinary boxes, and the crow's box
   * logic is already right at both ends of them: 0.62 is out of reach from the
   * quay, and 0.20 is one step up from the water.
   *
   * The near run has a gap in it for the pier steps. There is no north run —
   * the breakwater is the north wall, which is the whole point of it.
   */
  {
    const T = 0.7;
    const cope = (x, z, w, d) => {
      const m = box(w, RIM, d, PAL.concreteMid, { up: PAL.concrete, down: PAL.shade });
      m.position.set(x, RIM / 2, z);
      root.add(m);
      solid(x, z, w, d, RIM, 0, { tag: 'coping' });
    };
    // Near, in two runs either side of the pier steps.
    cope((BASIN.minX - T / 2 + -8.0) / 2, BASIN.maxZ + T / 2,
      -8.0 - (BASIN.minX - T), T);
    cope((-3.0 + BASIN.maxX + T) / 2, BASIN.maxZ + T / 2,
      BASIN.maxX + T + 3.0, T);
    // West and east, run all the way north to meet the breakwater.
    const zc = (BASIN.maxZ + T - MOLE.z) / 2 + MOLE.z;
    const zd = BASIN.maxZ + T - MOLE.z;
    cope(BASIN.minX - T / 2, zc, T, zd);
    cope(BASIN.maxX + T / 2, zc, T, zd);
    perch(BASIN.maxX + T / 2, RIM, 0);
    perch(BASIN.minX - T / 2, RIM, -8);
  }

  /**
   * The breakwater, in two arms with a harbour mouth between them.
   *
   * It was one unbroken 64 m wall, and the playtest note was that the dock still
   * read as closed off — a basin with a lid on it rather than a harbour. It was
   * right: a harbour is defined by the fact that the sea gets in. Every real one
   * has a mouth, and the arms exist to shelter it, not to seal it.
   *
   * So the water now runs continuously from the quay out through the gap and on
   * to the horizon, with nothing crossing that line. What stops the crow is an
   * invisible bound across the mouth — the same device already holding the other
   * three map edges, moved to the one place a player will actually swim at. The
   * distinction Kevin drew is the one being honoured: *the player not being able
   * to go there is fine; the water looking like it stops there is not.*
   *
   * **It casts no shadow**, for the same reason the backdrop does not. A wall
   * this long under a sun that is behind the block all day lays a band of shade
   * straight across the harbour, and the harbour is the one surface here no
   * fixture can reach. Removing a shadow can only *raise* luminance and every
   * dusk rule in this game is a floor.
   */
  {
    const flat = { up: PAL.concrete, down: PAL.shade, shadow: false };
    /** One arm, from `x0` to `x1`, with its rubble apron on the seaward face. */
    const arm = (x0, x1) => {
      const w = x1 - x0, cx = (x0 + x1) / 2;
      const m = box(w, 1.4, MOLE.d, PAL.concreteMid, flat);
      m.position.set(cx, 0.7, MOLE.z);
      root.add(m);
      const apron = box(w, 0.5, 1.6, PAL.concreteMid,
        { up: PAL.concreteMid, down: PAL.shade, shadow: false });
      apron.position.set(cx, 0.25, MOLE.z - MOLE.d / 2 - 0.7);
      root.add(apron);
      solid(cx, MOLE.z, w, MOLE.d, 1.4, 0, { tag: 'breakwater' });
      perch(cx, 1.4, MOLE.z);

      /**
       * A berthing ledge along the harbour face, at the same 0.62 as the coping
       * on the other three sides — and it is a bug fix, not decoration.
       *
       * The mole is 1.4 m tall, which is well over the 0.34 a floating crow can
       * scramble. So the north wall of the basin was the one edge of the water
       * that could be swum to and not climbed out of, and the escape grid found
       * exactly that: three cells along it where the only ways out were a
       * sixteen-metre swim west or a boat hull too high to board. **The lobster
       * pot, for the fourth time on this block's water.**
       *
       * Every real mole has one of these for boats to lie against, and it makes
       * all four sides of the basin behave the same way, which is what a player
       * will assume after the first swim.
       */
      const ledgeZ = MOLE.z + MOLE.d / 2 + 0.35;
      const ledge = box(w, RIM, 0.7, PAL.concreteMid,
        { up: PAL.concrete, down: PAL.shade, shadow: false });
      ledge.position.set(cx, RIM / 2, ledgeZ);
      root.add(ledge);
      inWater(cx, ledgeZ, w, 0.7, RIM, 0, { tag: 'mole-ledge' });
    };
    arm(MOLE.x - MOLE.w / 2, MOUTH.minX);
    arm(MOUTH.maxX, MOLE.x + MOLE.w / 2);

    /**
     * The water in the mouth itself — one quad bridging the basin to the sea.
     *
     * Without it the two planes meet at the mole line with a 1.4 m strip of bare
     * ground between them, which is the seam the arms used to hide and which the
     * gap would otherwise put on show.
     */
    const gap = new THREE.Mesh(
      new THREE.PlaneGeometry(MOUTH.maxX - MOUTH.minX, MOLE.d + 0.4).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({
        color: PAL.harbour, transparent: true, opacity: 0.66, flatShading: true,
      }),
    );
    gap.position.set((MOUTH.minX + MOUTH.maxX) / 2, SURFACE, MOLE.z);
    gap.userData.baseOpacity = 0.66;
    root.add(gap);
    night.add(gap, PAL.harbour, { peak: 0.30, warm: 3.4, delay: 1.2 });

    /**
     * A green light on each arm head, which is what a harbour mouth has and what
     * makes the gap read as a gap rather than as a wall someone forgot to build.
     */
    for (const hx of [MOUTH.minX - 0.9]) {
      root.add(at(cyl(0.16, 0.20, 1.9, 6, PAL.concrete, { down: PAL.shade, shadow: false }),
        hx, 1.4 + 0.95, MOLE.z));
      const marker = at(ico(0.26, 0, PAL.canopyLit, { shadow: false }), hx, 1.4 + 2.05, MOLE.z);
      marker.material = mat(PAL.canopyLit);
      root.add(marker);
      night.add(marker, PAL.canopyLit, { peak: 1.0, warm: 1.2, delay: 0.1, flicker: true });
    }

    /**
     * The lighthouse, standing on the west arm.
     *
     * It used to be in the middle of the harbour with the nest stacked on top of
     * it, which is where it grew a tier every time something needed fixing. Out
     * here it has nothing to carry: nothing lands on it, nothing has to rise past
     * it, and it can simply be a tower with a light on it — which is the one
     * thing it was always trying to be.
     *
     * Height is capped by the camera rather than by taste. From the pier the sea
     * is in frame to about 7 m at this distance, so a 7.4 m tower is the tallest
     * thing that stays whole; anything taller loses its lamp room off the top of
     * the frame, which is the fault the container terminal had.
     */
    const B = 1.4;
    root.add(at(cyl(1.05, 1.25, 0.5, 10, PAL.concreteMid, { up: PAL.concrete, down: PAL.shade, shadow: false }),
      LIGHT.x, B + 0.25, MOLE.z));
    root.add(at(cyl(0.62, 0.88, 4.6, 10, PAL.stone, { up: PAL.stone, down: PAL.concreteMid, shadow: false }),
      LIGHT.x, B + 0.5 + 2.3, MOLE.z));
    // The painted band, so a white cylinder against a pale sky has a height.
    root.add(at(cyl(0.75, 0.79, 0.8, 10, PAL.container[0], { up: PAL.containerLit[0], down: PAL.shade, shadow: false }),
      LIGHT.x, B + 2.4, MOLE.z));
    // The gallery and the lamp room. Small, because nothing has to stand here.
    root.add(at(cyl(0.86, 0.86, 0.16, 10, PAL.steelDark, { up: PAL.steel, shadow: false }),
      LIGHT.x, B + 5.2, MOLE.z));
    const lantern = at(cyl(0.52, 0.56, 0.9, 8, PAL.goldLit, { shadow: false }),
      LIGHT.x, B + 5.7, MOLE.z);
    lantern.material = mat(PAL.goldLit);
    root.add(lantern);
    root.add(at(cone(0.62, 0.6, 8, PAL.container[0], { up: PAL.containerLit[0], down: PAL.shade, shadow: false }),
      LIGHT.x, B + 6.45, MOLE.z));
    night.add(lantern, PAL.goldLit, { peak: 1.0, warm: 1.2, delay: 0.0, flicker: true });
    night.addPool(root, LIGHT.x, MOLE.z + 2.0, 7.0,
      { profile: 'stall', peak: 0.58, warm: 1.2, y: SURFACE });
    solid(LIGHT.x, MOLE.z, 1.8, 1.8, B + 5.2, 0, { tag: 'lighthouse' });
  }

  // ── the backdrop: open ocean, and one ship on it ──────────────────────────
  addFarShore({ root, night });

  /**
   * Invisible bounds.
   *
   * The north one used to be a single wall behind an unbroken breakwater. With a
   * mouth in that breakwater it is the only thing stopping a crow swimming out
   * to a sea plane that has no water body under it — so it sits on the mole line
   * and spans the map, which puts it inside the arms where they exist and across
   * the open mouth where they do not. A player meets it in exactly one place,
   * and it is the place a harbour would have a boat in it.
   */
  solid(BOUNDS.minX - 2, 0, 4, 96, 28, 0, { perch: false });
  solid(BOUNDS.maxX + 2, 0, 4, 96, 28, 0, { perch: false });
  solid(0, BOUNDS.maxZ + 2.5, 150, 4, 28, 0, { perch: false });
  solid(0, MOLE.z, 220, MOLE.d, 30, 0, { perch: false });

  // The kerb along the near edge, so the quay stops somewhere. Narrow, and no
  // darker than the paving: a wide dark band across the foreground is a third
  // of the frame no lamp reaches.
  {
    addDecal(0, 17.5, 150, 5, PAL.concrete);
    const kerb = box(150, 0.34, 1.2, PAL.concreteMid, { up: PAL.concrete, down: PAL.shade });
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
  // THE NET LOFT — the nest, standing in open water
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * A fisherman's loft on piles: four legs in the water, one room, a flat roof,
   * and the nest on the roof.
   *
   * This replaces a lighthouse, and the reason is a playtest note — *the
   * lighthouse is starting to look a little insane.* It was: a tower with a 5.2 m
   * gallery skirt, a 3.2 m lamp deck above that, a glazed corona and a nest in
   * the middle of it, all stacked on one stalk in open water. Every layer had
   * been added to fix a real problem — the gallery was widened so a crow could
   * rise past the crown's overhang, the crown was widened to clear the twig ring
   * — and the result was a wedding cake. **A shape that grows a tier every time
   * it is corrected is telling you the shape is wrong.**
   *
   * A loft is the honest object instead. Harbours are full of them: a shed on
   * legs over the water where nets were dried and gear was kept, reached by boat
   * and by nobody else. It gives the nest a *single* landing — one flat roof, no
   * skirt, no overhang, nothing above it — and it keeps everything the beacon was
   * carrying for the level: it stands in open water with no walking route to it,
   * so every bank is still a flight out and back over nothing, and it is still
   * the lit thing in the middle of the harbour after dark.
   *
   * The lighthouse itself is not gone; it has moved to the breakwater, which is
   * where a harbour light belongs and where it can be tall without anything
   * having to land on it.
   */
  const NEST = { x: LOFT.x, y: LOFT.roof, z: LOFT.z };
  {
    const g = new THREE.Group();
    const DECKY = LOFT.roof - 2.5;          // the loft floor

    // Four legs, down to the bed. Splayed a little, as piles are.
    for (const [px, pz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) {
      g.add(at(cyl(0.20, 0.24, DECKY, 6, PAL.dockMid, { up: PAL.dock, down: PAL.shade }),
        px, DECKY / 2, pz));
    }
    // Cross-bracing, so the legs read as a structure rather than four posts.
    for (const s of [-1, 1]) {
      g.add(at(box(4.2, 0.14, 0.12, PAL.dockMid, { up: PAL.dock, down: PAL.shade }),
        0, DECKY * 0.45, s * 1.9));
      g.add(at(box(0.12, 0.14, 4.2, PAL.dockMid, { up: PAL.dock, down: PAL.shade }),
        s * 1.9, DECKY * 0.45, 0));
    }

    /**
     * The stage it stands on, and it is a metre and a half wider than the hut on
     * purpose: a landing that is only as big as the thing on it is a lid, which
     * is the mistake the old gallery made. This leaves a walkable apron all the
     * way round and a wide one at the front, which is where the loose change is.
     */
    g.add(at(box(5.4, 0.22, 5.4, PAL.dock, { up: PAL.dockLit, down: PAL.dockMid }),
      0, DECKY - 0.11, 0));
    // A rail on three sides, low, open toward the pier.
    for (const [rx, rz, rw, rd] of [
      [0, -2.64, 5.4, 0.12], [-2.64, 0, 0.12, 5.4], [2.64, 0, 0.12, 5.4],
    ]) {
      g.add(at(box(rw, 0.34, rd, PAL.dockMid, { up: PAL.dock, down: PAL.shade }),
        rx, DECKY + 0.17, rz));
    }

    // The hut: boarded walls, a door on the pier side, one window each way.
    // Starting 4 cm inside the stage rather than exactly on its top face — see
    // the boat's wheelhouse for what sharing a plane costs.
    g.add(at(box(3.6, 2.32, 3.6, PAL.container[2], { up: PAL.containerLit[2], down: PAL.shade }),
      0, DECKY + 1.12, 0));
    const door = box(0.9, 1.7, 0.12, PAL.dockMid, { shadow: false });
    door.position.set(0, DECKY + 0.85, 1.81);
    g.add(door);
    const panes = [];
    for (const [wx, wz, ry] of [[-1.2, 1.81, 0], [1.81, -0.4, Math.PI / 2]]) {
      const win = box(0.9, 0.7, 0.10, PAL.goldLit, { shadow: false });
      win.position.set(wx, DECKY + 1.45, wz);
      win.rotation.y = ry;
      win.material = mat(PAL.goldLit);
      g.add(win);
      panes.push(win);
    }
    night.add(panes, PAL.goldLit, { peak: 0.95, warm: 2.0, delay: 0.4 });

    /**
     * The roof, and it is the nest's only landing.
     *
     * 3.6 m against a 1.5 m twig ring, so it clears the platform rule with
     * room — and, more to the point, **nothing overhangs it and nothing stands
     * on it.** The old crown was a lid: a crow on the gallery below could not
     * rise past its edge, which took a reach test to find because every check
     * that looks at the nest looks *down* at it. A flat roof with open sky over
     * it cannot have that bug.
     */
    g.add(at(box(3.9, 0.20, 3.9, PAL.dock, { up: PAL.dockLit, down: PAL.dockMid }),
      0, LOFT.roof - 0.10, 0));
    // A lamp on a bracket at the eaves, on the pier side. The loft is the block's
    // lit object in the water now that the beacon has moved to the mole.
    g.add(at(cyl(0.05, 0.05, 0.5, 4, PAL.steelDark, { shadow: false }),
      0, LOFT.roof + 0.24, 1.7));
    const lamp = at(ico(0.20, 0, PAL.goldLit, { shadow: false }), 0, LOFT.roof + 0.42, 1.9);
    lamp.material = mat(PAL.goldLit);
    g.add(lamp);
    night.add(lamp, PAL.goldLit, { peak: 1.0, warm: 1.6, delay: 0.15, flicker: true });

    g.position.set(LOFT.x, 0, LOFT.z);
    root.add(g);

    inWater(LOFT.x, LOFT.z, 5.4, 5.4, DECKY, 0, { tag: 'loft-stage' });
    inWater(LOFT.x, LOFT.z, 3.9, 3.9, LOFT.roof, DECKY, { tag: 'loft-roof' });
    perch(LOFT.x, DECKY, LOFT.z);
    perch(LOFT.x, LOFT.roof, LOFT.z);

    const nest = makeNest();
    nest.position.set(LOFT.x, LOFT.roof, LOFT.z);
    root.add(nest);
    root.userData.nestGroup = nest;

    night.addPool(root, LOFT.x, LOFT.z, 6.0,
      { profile: 'stall', peak: 0.60, warm: 1.6, y: SURFACE });
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
    const roof = box(6.6, 0.24, 5.0, PAL.container[1], { up: PAL.containerLit[1], down: PAL.shade });
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
  /**
   * No floats at all, in the end.
   *
   * There were two: one between the boat and the loft, and one west of the pier.
   * Both went, over two playtest rounds, for the same reason — a boat, two
   * floats, a dinghy, a hut on piles and seven pilings inside a basin thirty
   * metres across is not a block that spends footing. **Footing stops being a
   * cost the moment there is something to stand on every four metres**, and a
   * float was the least interesting of those things: a flat rectangle at knee
   * height that asks nothing of the player.
   *
   * What is left in the water earns its place — the pier you can walk, the boat
   * with a guard on it, the dinghy, the pilings you can only reach in the air,
   * and the loft. `addFloat` stays: the idiom is sound and a later block may
   * want one.
   */
  // The west corner of the harbour has no fixture within fifteen metres of it
  // and it measured as the darkest part of the block. A washer on the market's
  // seaward gable is the honest place for this: pure pool, no column.
  {
    const w = at(box(0.34, 0.16, 0.20, PAL.goldLit, { shadow: false }), MARKET.x, 3.3, 2.7);
    w.material = mat(PAL.goldLit);
    root.add(w);
    night.add(w, PAL.goldLit, { peak: 0.9, warm: 2.0, delay: 0.7 });
    night.addPool(root, WEST_FLOAT.x, WEST_FLOAT.z, 4.4,
      { profile: 'stall', peak: 0.72, warm: 2.0, delay: 0.7, y: SURFACE });
  }
  /**
   * One float, not two.
   *
   * There was a second at (8, −3.5), between the charter boat and the loft, and
   * the playtest read the water as crowded — which it was: a boat, two floats, a
   * dinghy, a hut on piles and seven pilings inside a basin thirty metres
   * across. This block spends *footing*, and footing stops being a cost when
   * there is something to stand on every four metres.
   */

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
    const hull = box(7.0, 1.15, 2.8, PAL.container[1], { up: PAL.containerLit[1], down: PAL.shade });
    hull.position.y = 0.575;
    g.add(hull);
    /**
     * **No two of these share a plane**, and the y numbers look fussy for that
     * reason alone.
     *
     * Reported from a playtest as the wheelhouse roof flickering, and it was
     * four faults rather than one: the rubbing band's top, the gunwales' bottom
     * and the wheelhouse's bottom all sat at exactly the hull's deck line of
     * 1.15, and the roof's top sat at exactly the wheelhouse walls' top of 2.40.
     * Two coplanar faces at identical depth is a coin flip per pixel — the same
     * thing that drew a staircase down level 1's frontage and shimmered along
     * the container ship — and it is invisible in the source, because every one
     * of those numbers is the *correct* height for the part.
     *
     * The rule that avoids it: a part that sits on another either overlaps it or
     * stops short of it, and never lands exactly on it. Here the band stops 3 cm
     * low, the gunwales and the wheelhouse start 2 cm high, and the walls finish
     * 9 cm inside the roof, where their top face is hidden entirely.
     */
    g.add(at(box(7.2, 0.14, 3.0, PAL.terracotta, { up: PAL.terracottaLit, down: PAL.shade }), 0, 1.05, 0));
    g.add(at(box(6.4, 0.06, 2.5, PAL.dockLit, { shadow: false, receive: true }), 0, DECK.boat + 0.01, 0));
    // Gunwales, low enough to hop.
    for (const s of [-1, 1]) {
      g.add(at(box(6.8, 0.26, 0.16, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, DECK.boat + 0.15, s * 1.35));
    }
    // The wheelhouse.
    g.add(at(box(2.2, 1.14, 2.2, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), -1.2, DECK.boat + 0.59, 0));
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
    g.add(at(box(3.0, 0.70, 1.6, PAL.container[3], { up: PAL.containerLit[3], down: PAL.shade }), 0, 0.35, 0));
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

    /**
     * Four, not seven.
     *
     * Two stood 0.79 m and 1.81 m off the pier — close enough to step to, so
     * they bought nothing but gull furniture on a block that had already given
     * up both its floats for exactly that reason. A third sat at (10.0, −10.8),
     * entirely *inside* the loft stage's footprint: an invisible prop carrying a
     * perch point underneath a deck.
     */
    for (const [px, pz, h] of [
      [1.5, -10.6, 1.4], [13.0, 2.0, 1.3], [-16.6, -9.4, 1.35], [-3.0, -11.4, 1.25],
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
   * Crab pots — the block's near-side occluder, and it is only pots now.
   *
   * There was a net on a frame behind them: two posts and a 3.4 x 1.9 panel at
   * eye height. It photographed as a **billboard** — a flat teal rectangle
   * standing in the near corner with the level behind it — and the playtest
   * called it exactly that. A hanging net is a thing you can see through in life
   * and a solid quad at this distance, and 55% opacity does not read as mesh, it
   * reads as tinted glass.
   *
   * What is left is the part that was doing the work: a low stack of pots with
   * mass and no height. An occluder does not have to be tall to be an occluder —
   * it has to be *between* — and the fade only ever mattered on the one ray from
   * the camera to the crow. Nothing that is core loop is behind it either way.
   */
  {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const pot = box(1.05, 0.42, 1.05, PAL.container[2], { up: PAL.containerLit[2], down: PAL.shade });
      pot.position.set((i % 2) * 1.15 - 0.55, 0.21 + Math.floor(i / 2) * 0.44, (i % 3 === 2) ? 0.2 : -0.15);
      g.add(pot);
    }
    g.position.set(16, 0, 12.4);
    root.add(g);
    occluders.push(...g.children);
    solid(16, 12.25, 2.6, 1.6, 1.34);
    perch(16, 1.34, 12.25);
  }

  /**
   * Containers, fish crates and buoys — on the quay, where they can be seen.
   *
   * The far shore is the obvious place to put a port's colour and it is the
   * wrong one: this camera pitches 38° down through a 20° lens, so the horizon
   * is never in frame and the visible ground runs out about twelve metres past
   * the crow. Everything across the water is invisible from every position a
   * player actually stands in — only the cranes and the stack are tall enough to
   * poke in over the top. **Decoration beyond the visible band is decoration
   * nobody sees**, so the colour this block was missing had to come inside it.
   *
   * These are also the only things on the quay a crow can stand on that are not
   * a building, which is worth something on a block about footing.
   */
  {
    /** A stack of containers. Perchable, and never more than two high. */
    const containers = (x, z, spec) => {
      spec.forEach(([dx, dz, lvl, hue], i) => {
        const c = box(6.0, 2.4, 2.4, PAL.container[hue],
          { up: PAL.containerLit[hue], down: PAL.shade });
        c.position.set(x + dx, 1.2 + lvl * 2.45, z + dz);
        root.add(c);
        // Doors on the near end, so a container is not an anonymous slab.
        const doors = box(0.10, 1.9, 2.0, PAL.containerLit[hue], { shadow: false });
        doors.position.set(x + dx + 3.0, 1.2 + lvl * 2.45, z + dz);
        root.add(doors);
        solid(x + dx, z + dz, 6.0, 2.4, 2.4 + lvl * 2.45, lvl ? 2.45 : 0,
          { tag: 'container' });
        perch(x + dx, 2.4 + lvl * 2.45, z + dz);
      });
    };
    // East quay, beyond the water. Two down, one up, stepped.
    containers(24, -7.0, [[0, 0, 0, 0], [0, 2.8, 0, 1], [0, 1.4, 1, 3]]);
    // West quay, a single pair.
    containers(-24, -6.5, [[0, 0, 0, 2], [0, 2.8, 0, 3]]);

    /** Fish crates, stacked by the market where the catch lands. */
    const crate = (x, y, z, hue, ry) => {
      const c = box(0.72, 0.30, 0.52, PAL.container[hue],
        { up: PAL.containerLit[hue], down: PAL.shade });
      c.position.set(x, y + 0.15, z);
      c.rotation.y = ry;
      root.add(c);
    };
    for (const [cx, cz, ry] of [[-8.6, 6.4, 0.1], [-8.4, 7.1, -0.15], [-9.2, 6.8, 0.3]]) {
      crate(cx, 0, cz, 3, ry); crate(cx, 0.30, cz, 0, ry + 0.12); crate(cx, 0.60, cz, 2, ry - 0.1);
    }
    solid(-8.7, 6.8, 1.6, 1.6, 0.90);
    perch(-8.7, 0.90, 6.8);
    for (const [cx, cz, ry] of [[6.2, 2.9, -0.2], [18.0, 8.6, 0.25]]) {
      crate(cx, 0, cz, 1, ry); crate(cx, 0.30, cz, 3, ry + 0.2);
    }

    /**
     * Buoys, hung on the coping and floating in the basin. Orange is the one
     * hue nothing else in this game uses, so it reads as *harbour* from the
     * first frame — and they are two triangles each.
     */
    const buoy = (x, y, z, r = 0.30) => {
      const b = ico(r, 0, PAL.buoy, { up: PAL.buoyLit, down: PAL.shade });
      b.position.set(x, y, z);
      b.scale.set(1, 0.85, 1);
      root.add(b);
    };
    for (const [bx, bz] of [[-11.5, 1.0], [-6.5, 1.0], [6.0, 1.0], [12.0, 1.0]]) buoy(bx, 0.42, bz);
    for (const [bx, bz] of [[-16.6, -2.2], [2.2, -10.4], [9.5, -5.6]]) buoy(bx, SURFACE + 0.16, bz, 0.34);
    // And a row of them along the pier's edge, where a boat comes alongside.
    for (const bz of [-8.2, -6.4, -1.2]) buoy(PIER.x - 2.15, RIM - 0.18, bz, 0.26);
  }

  /**
   * Drums and a crate stack in the near half of the block.
   *
   * The same argument as the containers, applied to the foreground: the bottom
   * third of every frame on this block is quay, and no amount of colour across
   * the water reaches it. A working dock has drums on it, they are cylinders,
   * and they are the cheapest saturated object in the file.
   */
  {
    const drum = (x, z, hue, ry = 0) => {
      const g = new THREE.Group();
      g.add(at(cyl(0.36, 0.36, 0.88, 10, PAL.container[hue],
        { up: PAL.containerLit[hue], down: PAL.shade }), 0, 0.44, 0));
      // Two rolling hoops, so a drum is not a plain can.
      for (const hy of [0.34, 0.60]) {
        g.add(at(cyl(0.38, 0.38, 0.07, 10, PAL.containerLit[hue], { shadow: false }), 0, hy, 0));
      }
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      root.add(g);
      solid(x, z, 0.76, 0.76, 0.90);
      perch(x, 0.90, z);
    };
    drum(4.0, 12.4, 1);
    drum(4.9, 12.9, 1, 0.4);
    drum(4.4, 13.5, 0, 0.8);

    const stack = (x, z) => {
      for (let i = 0; i < 4; i++) {
        const hue = [3, 0, 2, 1][i];
        const c = box(0.78, 0.32, 0.56, PAL.container[hue],
          { up: PAL.containerLit[hue], down: PAL.shade });
        c.position.set(x + (i % 2 ? 0.05 : -0.04), 0.16 + i * 0.32, z + (i % 2 ? -0.03 : 0.04));
        c.rotation.y = 0.1 * i - 0.15;
        root.add(c);
      }
      solid(x, z, 0.9, 0.7, 1.28);
      perch(x, 1.28, z);
    };
    stack(-13.4, 12.1);
    stack(9.8, 6.2);
  }

  /**
   * Light on the water, and on the stacks.
   *
   * Two mistakes to correct in one place, both mine and both the same shape.
   *
   * The floating decks were dark because their pools sat at the waterline, below
   * them — so I moved the pools onto the decks, and the *water* went dark
   * instead. At full dusk the harbour is most of the frame from anywhere on the
   * pier and its median fell to 44 against a floor of 48. A deck 0.7 m over the
   * water and the water under it are two surfaces and they need two pools; a
   * light on a pier really does light the water beside it.
   *
   * And the container stacks are the biggest new masses on the quay, which cost
   * the 5th percentile twelve points at t=0.98. A floodlight on a container
   * stack is the least surprising object on a working dock.
   */
  {
    // Modest, because the water now carries its own value. At the peaks these
    // were first given — set while the harness was measuring an unlit block —
    // they rendered as milky white discs floating on the harbour rather than as
    // light on water.
    for (const [px, pz, r, peak] of [
      [BOAT.x, BOAT.z, 4.8, 0.32],
      [PIER.x + 2.2, PIER.z - 1.0, 5.2, 0.28],
    ]) {
      night.addPool(root, px, pz, r,
        { profile: 'stall', peak, warm: 2.0, delay: 0.5, y: SURFACE });
    }

    // A floodlight mast at each stack. At the far east and west ends, where
    // nothing has a sightline to lose behind them.
    for (const [mx, mz] of [[29.5, -7.0], [-28.5, -6.5]]) {
      const g = new THREE.Group();
      g.add(at(cyl(0.10, 0.13, 4.2, 6, PAL.steel, { up: PAL.steel, down: PAL.steelDark }), 0, 2.1, 0));
      g.add(at(box(0.5, 0.14, 0.5, PAL.steelDark), 0, 0.07, 0));
      const head = at(box(0.8, 0.30, 0.34, PAL.goldLit, { shadow: false }), 0, 4.3, 0.2);
      head.material = mat(PAL.goldLit);
      g.add(head);
      g.position.set(mx, 0, mz);
      root.add(g);
      solid(mx, mz, 0.3, 0.3, 4.2);
      night.add(head, PAL.goldLit, { peak: 0.95, warm: 1.9, delay: 0.35 });
      night.addPool(root, mx - 5.0, mz, 6.0,
        { profile: 'stall', peak: 0.62, warm: 1.9, delay: 0.35 });
    }
  }

  // Two benches, both empty. The kid is the only person on this block who is
  // sitting down and a wharf is full of people sitting on things, so this is a
  // choice being defended rather than a fact being inherited.
  addBench(-2, 12.5);
  addBench(11, 12.0);

  // Two bins. There was a third at (-7.5, 11.5), between the market and the ice
  // house, and the playtest reported it as being in the way — a bin is 1.3m
  // across and 1.6 tall, standing on the route people walk most.
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
    nestPlatform: 3.6,     // the loft's roof
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
// The backdrop
// ════════════════════════════════════════════════════════════════════════════

/**
 * Open ocean, and one ship on it.
 *
 * This block has now had three backdrops and the argument for each one taught
 * something. It began as `addSkyline`, the row of apartment blocks every other
 * level ends in, which is wrong here because a fishing dock does not look out at
 * housing. It became a container terminal — a far quay with stacks, gantries,
 * sheds, silos and a chimney — which fixed the fiction and broke the picture:
 * from a camera pitched 38° down through a 20° lens **the horizon is never in
 * frame**, so all a player ever saw of that terminal was the tallest few metres
 * of it, floating with no ground under it. Containers apparently at sea. The
 * detail that justified it was in the half of the model nobody could see.
 *
 * So the far shore is gone and the water runs to the horizon, with a single
 * point of interest on it. That is Kevin's proposal and it is the right one for
 * a reason worth writing down: **at this camera a backdrop can have exactly one
 * readable idea in it.** A skyline gets away with many because they are all the
 * same idea repeated. A working port is several ideas, and at forty metres they
 * become one indistinct band — whereas a ship is one silhouette that survives
 * being small, and it says *this water goes somewhere* better than a quay full
 * of cranes ever did.
 *
 * It is also the cheapest of the three by a distance: about 30 meshes against
 * the terminal's 94 and the skyline's 124, on a block where the backdrop used to
 * be a third of everything drawn.
 */
function addFarShore({ root, night }) {
  const flat = { shadow: false, receive: false };
  const lit = [];
  const g = new THREE.Group();

  /**
   * Hull, and it sits low.
   *
   * A loaded ship rides deep, which is what puts the containers near the
   * waterline where they read as cargo rather than as buildings — the exact
   * failure the terminal had. Nothing here is above about nine metres.
   */
  const L = 40, H = 3.0;
  /**
  /**
   * A **dark** hull under a bright deck line, which is the third livery this
   * ship has had and the first that reads.
   *
   * Pale blue photographed as a black slab, because the sun is behind the block
   * all day and the ship's long camera-facing side is in shadow at every hour.
   * The obvious correction — paint it concrete, like the quay — was worse: a
   * pale band under a row of containers is a *shore*, and the whole point of
   * removing the far quay was to stop things looking like they were standing on
   * land that was not there.
   *
   * What a ship needs at this distance is the contrast a real one has: a dark
   * hull, a bright band along the deck edge, and the boot-top at the waterline.
   * Three stripes, and the eye assembles a ship out of them.
   */
  g.add(at(box(L, H, 7.0, PAL.trouser[2], { up: PAL.steelDark, down: PAL.shade, ...flat }),
    0, H / 2, 0));
  // The boot-top stripe at the waterline, and the sheer line above it. Two flat
  // bands are what makes a box read as a hull at this distance.
  /**
   * The boot-top and the deck rail, and **neither shares a face with the hull.**
   *
   * They did, and it flickered: the boot-top's underside sat at exactly y = 0
   * with the hull's, and the rail's top at exactly y = H with the hull's deck.
   * Two coplanar faces at identical depth is a coin flip per pixel — the same
   * thing that drew a staircase down level 1's frontage — and on a backdrop
   * object at forty metres it reads as a shimmer along the whole length. Both
   * bands are inset a few centimetres in y and proud in z, which is also what a
   * rubbing strake actually is.
   */
  g.add(at(box(L + 0.24, 0.66, 7.24, PAL.container[0], { up: PAL.containerLit[0], ...flat }),
    0, 0.40, 0));
  g.add(at(box(L + 0.30, 0.46, 7.30, PAL.stone, { up: PAL.stone, ...flat }), 0, H - 0.34, 0));
  // A raked bow, so the ship has a front. One wedge is enough.
  g.add(at(box(4.0, H - 0.3, 4.4, PAL.trouser[2], { up: PAL.steelDark, down: PAL.shade, ...flat }),
    L / 2 + 1.6, (H - 0.3) / 2 + 0.22, 0));

  /**
   * A partial load, which is the note as given — *does not have to be a full
   * load.* It is also better: an even wall of boxes is a building again, and the
   * gaps are what say "ship being worked" rather than "wall painted like
   * containers".
   *
   * `[x offset, tier, hue]`, hand-placed rather than looped, because the point
   * is the raggedness.
   */
  for (const [dx, hue] of [
    [-13, 0], [-8, 3], [-3, 1], [2, 2], [7, 0], [12, 3], [16.5, 1],
  ]) {
    // Sitting *on* the deck, not sunk into it. These were centred at H + 0.15
    // with a height of 1.7, so their lower halves were inside the hull.
    g.add(at(box(4.2, 1.7, 5.6, PAL.container[hue],
      { up: PAL.containerLit[hue], down: PAL.shade, ...flat }),
    dx, H + 0.85, 0));
  }

  /** The house aft, white, with a lit bridge band. The one warm mark out here. */
  g.add(at(box(5.4, 2.6, 6.0, PAL.stone, { up: PAL.stone, down: PAL.shade, ...flat }),
    -L / 2 + 4.0, H + 1.3, 0.02));
  const bridge = box(5.7, 0.6, 6.3, PAL.goldLit, flat);
  bridge.position.set(-L / 2 + 4.0, H + 2.2, 0);
  bridge.material = mat(PAL.goldLit);
  g.add(bridge);
  lit.push(bridge);
  // Funnel, and a mast light forward.
  g.add(at(box(2.0, 1.5, 2.2, PAL.container[0], { up: PAL.containerLit[0], down: PAL.shade, ...flat }),
    -L / 2 + 4.0, H + 3.3, 0));
  const mast = at(ico(0.26, 0, PAL.goldLit, flat), L / 2 - 2.6, H + 2.8, 0);
  mast.material = mat(PAL.goldLit);
  g.add(at(cyl(0.14, 0.14, 2.8, 5, PAL.stone, { ...flat }), L / 2 - 2.6, H + 1.4, 0));
  g.add(mast);
  lit.push(mast);

  /**
   * Out past the mouth and turned across the frame, so it reads broadside.
   *
   * **The height is the constraint, not the distance, and that is the whole
   * lesson of this backdrop.** Measured from the running game: from the pier the
   * sea is in frame out to z = −28 at water level but only to z = −11.5 at eight
   * metres up; from the beacon, −36.5 and −20. So *the taller a thing is, the
   * nearer it must be to stay in frame* — and anything that breaks that rule has
   * its base visible and its top cut off, which is precisely why the container
   * terminal read as boxes floating on the water. It was not floating. It was
   * decapitated.
   *
   * Hence a **low** ship rather than a distant one: hull, a single tier of
   * containers, a short house, nothing above about 7.6 m. At z = −19.5 that is
   * inside the frame from the beacon, which is where a player goes on every trip
   * to the nest, and partly cut from the pier — which is what a backdrop is
   * allowed to be. It was 74 m long and 13 m tall first, and it read as a wall
   * with its head off.
   */
  /**
   * Square to the grid, not angled.
   *
   * It sat at −0.10 rad on the theory that a slight skew reads as "moored"
   * rather than "placed". At this camera it reads as a mistake instead: every
   * other edge in the game is axis-aligned, so a backdrop object a few degrees
   * off is the one thing in frame that looks like it slipped.
   */
  g.position.set(-3, 0, -23.0);
  root.add(g);

  /** One clone for the whole backdrop, as the skyline's hundred windows were. */
  night.add(lit, PAL.goldLit, { peak: 0.85, warm: 5.5, delay: 0.15 });
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
    [1.2, 13.2], [7.0, 11.0], [15.5, 6.5], [22.0, 9.5], [27.0, 5.5],
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
    [-9.0, -3.0], [-2.5, -8.6], [2.5, -2.0], [1.0, -11.0], [-16.0, -9.0], [11.5, -3.2],
  ]) add('quarter', 0.25, x, RIM - 0.28, z, { inWater: true });

  // — Out over the water: unowned, and unreachable on foot. —
  //
  // The five on the dolphin is the block's teaching object and the task points
  // at it. It is on a 1.5 m cap nine metres from the nearest walkable thing.
  add('bill5', 5.00, -13.5, 1.42, -9.0,
    { owner: null, label: 'THE FIVE ON THE PILINGS', onPiling: true });
  add('coins', 1.25, -16.6, 1.41, -9.4);
  add('bill1', 1.00, -16.0, 0.77, -3.4);
  // On the loft's stage, in front of the hut — free, once, because you are
  // going there anyway.
  add('coins', 1.25, 9.6, 2.56, -4.4);

  // — The fish market: $29 across one counter. —
  add('bill20', 20.00, -11.0, 1.26, 8.5, { owner: 'monger', label: "THE DAY'S TAKE" });
  add('coins', 4.00, -17.5, 1.30, 8.5, { owner: 'monger', label: 'THE TIP JAR', inJar: true });
  add('bill5', 5.00, -16.5, 0.96, 6.6,
    { owner: 'monger', pinned: true, label: 'THE FIVE UNDER THE TACKLE BOX' });

  // — The ice house, the office, and the boat. —
  add('coins', 3.60, 9.6, 1.14, 8.62, { owner: 'deckhand', label: 'THE HONESTY BOX' });
  add('bill5', 5.00, 18.6, 1.22, 6.15, { owner: 'harbormaster', label: 'THE FIVE ON THE LEDGE' });
  add('coins', 1.20, 20.8, 1.22, 6.15, { owner: 'harbormaster' });
  add('bill10', 10.00, 2.8, 1.32, -4.6, { owner: 'skipper', label: 'THE FARE BOX' });
  add('coins', 1.40, 2.9, 1.22, -3.2, { owner: 'skipper' });

  // — Shinies: worthless, tradeable, and two of the four are out over water. —
  add('shiny', 0, -4.5, 0.07, 5.5, { shinyKind: 'cap' });
  add('shiny', 0, 0.5, RIM - 0.28, -1.5, { inWater: true, shinyKind: 'ring' });
  add('shiny', 0, 13.0, 1.42, 2.0, { shinyKind: 'key' });
  add('shiny', 0, -0.8, 2.47, -4.0, { shinyKind: 'foil' });

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
       * On his own deck at 1.15, with water on three sides and the pier on the
       * fourth.
       *
       * A human's floorY is authored and they never leave it, which on every
       * other block is a thing the crow exploits by going up. Here it is the
       * guard's whole character: he cannot chase you off the boat and he cannot
       * be baited off it, so the $11.40 he stands over is the only money on this
       * block guarded by somebody who is certain to still be there.
       *
       * This used to claim there was *nowhere to retreat to that is not a swim*,
       * and that was never true of what shipped — the hull overlapped the pier,
       * so the retreat was always a hop. A design review wanted the boat pushed
       * two metres out to make boarding a real flight; the basin cannot pay for
       * it without costing the nest its clearance, which is the more important
       * number. The claim is corrected rather than the geometry, and a moored
       * boat lying against a dock is what the fiction wanted anyway.
       */
      pos: [2.0, 1.15, -4.0], home: [2.0, 1.15, -4.0],
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
    { x: 1.5, z: -10.6, y: 1.46 },
    { x: 1.5, z: -10.6, y: 1.46 },
    { x: 13.0, z: 2.0, y: 1.36 },
    { x: 9.5, z: -13.2, y: 1.4 },
    // Both of these are on the arms, and both have been moved once already: a
    // bird's y is authored, so a gull left where the breakwater used to be
    // hovers over the channel. The deck check has caught it twice, which is the
    // rule earning its keep — widening the mouth is exactly the kind of edit
    // that strands one.
    { x: -17.0, z: -13.2, y: 1.4 },
    { x: -3.0, z: -11.4, y: 1.31 },
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
