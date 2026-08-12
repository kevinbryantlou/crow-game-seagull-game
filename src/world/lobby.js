/**
 * LEVEL 4 — The Hotel (Inside).
 *
 * The roofline is this building from outside. This is the same building from
 * inside, and it is the one progression the game had never made: every other
 * block is a new place, this one is a place you have already been to, through a
 * different door.
 *
 * What it spends is neither altitude nor social pressure but **enclosure**.
 * Every other block is open at the edges — caught at the cart, go and work the
 * café row; caught at the picnic, the pretzel wagon is forty metres east. This
 * is 44 m by 24 m with walls on all four sides, and every guard in it shares a
 * room with every other guard. There is no district next door.
 *
 * Left alone that is a level you lose in, so it is paired with the thing that
 * makes it playable, and the pairing is the design: **laterally there is
 * nowhere to run, vertically nobody can follow.** A human's floorY is authored
 * and they never leave it, so the mezzanine at 4.4 and the chandelier at 7.6
 * are two rooms nobody in the cast can reach. Drop in, take one thing, climb
 * out of the world.
 *
 * Which is why the nest is in the chandelier over the middle of the room rather
 * than in a corner like every other block's. The safest place in the lobby is
 * also the most conspicuous, and every trip to bank anything is a flight
 * straight up through the centre of it in front of everybody.
 *
 * The sun still works indoors because there is no ceiling: a glazed steel
 * lantern at 11.2 and a clerestory band from 6.6 up, on all four sides. The
 * panes cast no shadow and the truss members do, so the afternoon key comes
 * through as bars of light lying across the marble and swings and reddens
 * exactly as it does outdoors. Nothing in render/stage.js knows this level is
 * an interior. docs/lobby-brief.html §6.
 */

import * as THREE from 'three';
import { PAL } from '../render/palette.js';
import { box, cyl, cone, ico, plane, at, group, mat } from '../render/shapes.js';
import { NightLights } from '../render/nightlights.js';
import { makeKit } from './kit.js';
import { RULES } from './rules.js';

/**
 * The smallest block in the game, deliberately — the park is ±30 and the
 * roofline ±32. A room you cannot leave should be a room, not a field with
 * walls round it, and every metre of extra floor is a metre of "work somewhere
 * else" that this level is specifically not offering.
 */
export const BOUNDS = { minX: -22, maxX: 22, minZ: -11.4, maxZ: 13.2 };

/**
 * Three decks, and the only heights anything else in this file needs.
 *
 * The roofline's four are *places* — a forecourt, a terrace, a roof, each with
 * its own economy. These three are one place seen from three heights, which is
 * why they stack inside a room a third the size and still do not read as a
 * smaller level.
 *
 * 5.9 is not a deck, it is the chandelier's lower tier, and it exists so the
 * climb to the nest is 5.9 + 1.7 rather than 7.6 in one go. Both halves clear
 * RULES.maxUnbrokenClimb on their own; the point is that you arrive at the
 * bottom of this one having just flown away from somebody.
 */
export const DECK = { floor: 0, mezzanine: 4.4, chandelier: 7.6 };
const TIER = 5.9;
const ROOF = 11.2;
/** Where the solid wall stops and the clerestory glazing starts. */
const SILL = 6.6;

const POOL_SPEC = { x: 2, z: 2, r: 3.2 };
/** The front desk: two counters with a pass-through between them. */
const DESK = { x: -10, z: -6.4 };
const BAR = { x: 13, z: -5.0 };
const DOOR = { x: -13, z: 11.4 };
const CART = { x: -18.5, z: 5.0 };
/** The housekeeping cart, on the mezzanine. */
const TROLLEY = { x: -12.5, z: -10.2 };
/**
 * Where the kid sits, on the family luggage.
 *
 * On the *camera side* of the fountain, which is the park's rule and not the
 * roofline's: from a fixed camera a small figure in front of a marble floor and
 * a marble counter is a tan smudge, and a small figure with three metres of
 * teal water behind her is a small figure you can see.
 *
 * 6.7 m out from the middle of the basin rather than on its rim, because the
 * smoke test walks a crow at the fountain from 360 headings starting at
 * r + 2.3, and a collider sitting exactly on that ring is a crow that starts
 * the test embedded in it.
 */
const KID = { x: 6.8, z: 6.6 };

export function buildLevel() {
  const root = new THREE.Group();
  const colliders = [];
  const occluders = [];
  const perches = [];
  const night = new NightLights(RULES.lampsOnAt);

  const kit = makeKit({ root, colliders, occluders, perches, night });
  const { solid, perch, addDecal, addPlanter, addSkyline, makeNest, addPool } = kit;

  // ── the floor ─────────────────────────────────────────────────────────────
  // The ground plane is the *street*, and the marble is a decal on top of it —
  // the room has an outside, and the frame shows about thirteen metres of it in
  // front of the glass.
  const ground = plane(150, 96, PAL.paving, { receive: true });
  root.add(ground);

  // Marble. PAL.stone, the brightest large surface the palette has, and it is
  // most of where this block's dusk median is going to come from: an interior
  // lit by chandeliers has no sky in the lower half of the frame to make up the
  // difference the way a forecourt does.
  addDecal(0, 0.9, 44, 24.6, PAL.stone);

  /**
   * The runner, in PAL.rug — which exists because of these two decals.
   *
   * It was teal, and teal is what a screenshot caught: a long green band running
   * off the edge of the frame, which on the one block in this game that is
   * trying not to read as outdoors photographs as a lawn. See the note on
   * PAL.rug. Blue cannot be mistaken for planting at any hour of this day.
   *
   * An L rather than a strip: one leg is the walk from the door to the desk and
   * the other is the walk from the desk to the bar, which between them are the
   * two routes every run in this block actually takes.
   */
  // Border first, field on top of it — the field is nine tenths of what anybody
  // sees, so the field is the one that has to be pale.
  addDecal(-3, 8.6, 30, 4.4, PAL.rugMid);
  addDecal(-12.5, 1.8, 4.4, 18, PAL.rugMid);
  addDecal(-3, 8.6, 29.2, 3.5, PAL.rug);
  addDecal(-12.5, 1.8, 3.5, 17.2, PAL.rug);

  // Aprons: the polished stone the desk and the bar stand on.
  addDecal(DESK.x, DESK.z + 1.4, 16, 6, PAL.stoneMid);
  addDecal(BAR.x, BAR.z + 1.2, 12, 5, PAL.stoneMid);
  addDecal(14, 6.5, 14, 9, PAL.stoneMid);

  // ── the street, seen through the front glass ──────────────────────────────
  // Level 3's forecourt is on the other side of this glass, which is worth one
  // strip of paving and a kerb and nothing more. Narrow, and no darker than the
  // paving: a wide dark band across the foreground is a third of the frame the
  // lamps never reach, and it cost the roofline eleven points of median.
  {
    addDecal(0, 15.6, 150, 4.4, PAL.pavingMid);
    const kerb = box(150, 0.34, 1.2, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    kerb.position.set(0, 0.17, 17.6);
    root.add(kerb);
    solid(0, 17.6, 150, 1.2, 0.34, 0, { tag: 'edge-kerb' });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE ROOM — three walls, a clerestory, and a glass lantern for a ceiling
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * A wall in two parts: solid to the sill, glazed from there to the roof.
   *
   * The glazing is what makes an interior legal in a game whose entire light rig
   * is a sunset — but it is also the reason the *solid* half is only 6.6 m tall.
   * The audit casts a ray from every pickup along the one sightline this camera
   * ever uses, and that ray travels toward +x and +z: the back wall and the west
   * wall are behind everything and can never occlude, while the east wall would
   * hide anything within about three metres of it. Six and a half metres of
   * stone and four and a half of glass is the shape that keeps the east end of
   * the bar visible.
   */
  const wall = (cx, cz, w, d, mullions = true) => {
    const g = new THREE.Group();
    const mass = box(w, SILL, d, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    mass.position.set(cx, SILL / 2, cz);
    g.add(mass);
    // A pale dado course, so a wall this size has a horizon in it. Lighter than
    // the wall, always — an accent darker than what it sits on is how the
    // roofline lost eleven points of luminance twice.
    const dado = box(w + 0.1, 1.1, d + 0.1, PAL.stone, { up: PAL.stone, down: PAL.shade });
    dado.position.set(cx, 0.55, cz);
    g.add(dado);
    // The clerestory. Transparent, so the audit's sightline ray ignores it —
    // and so the skyline behind the block reads through it, which is the only
    // thing telling the player this room is in a city at all.
    const glaze = box(w, ROOF - SILL, d * 0.5, PAL.waterLit,
      { transparent: true, opacity: 0.24, shadow: false, receive: false });
    glaze.position.set(cx, (SILL + ROOF) / 2, cz);
    g.add(glaze);
    /**
     * Mullions, and they do two jobs. They stop the glazing being a coloured
     * slab, and — because the sun sits behind the block to the west all
     * session — the back and west ones are what lay the bars of light across
     * the marble that were the whole reason for building an atrium.
     *
     * The east wall gets none. It is the only wall the camera looks *through*:
     * a ray from a pickup travels toward +x and +z, so a 4.6 m opaque post
     * standing over the east wall hides the bar, and four of them hid four
     * pickups the first time this was measured. The bars come off the two walls
     * that can never occlude anything.
     */
    const long = w > d;
    for (let i = 1; mullions && i < (long ? Math.round(w / 3.2) : Math.round(d / 3.2)); i++) {
      const m = long
        ? box(0.14, ROOF - SILL, d * 0.55, PAL.steel, { shadow: false })
        : box(d * 0.55, ROOF - SILL, 0.14, PAL.steel, { shadow: false });
      m.position.set(
        long ? cx - w / 2 + i * 3.2 : cx,
        (SILL + ROOF) / 2,
        long ? cz : cz - d / 2 + i * 3.2,
      );
      g.add(m);
    }
    root.add(g);
    // Full height, so the crow cannot leave through the glass.
    solid(cx, cz, w, d, ROOF);
  };
  wall(0, -11.8, 45.6, 0.8);           // back
  wall(-22.4, 0.9, 0.8, 25.4);         // west
  wall(22.4, 0.9, 0.8, 25.4, false);   // east — the one the camera looks through

  /**
   * The glass lantern, and the second thing this block cuts away.
   *
   * The first version had a full steel truss under the glass — beams every five
   * metres, casting the bars of light the atrium was built for. It hid five
   * pickups, and the reason is worth writing down because it is not obvious
   * from inside the room: **this camera is above the roof.** It sits 38° up and
   * about thirty metres back, so the sightline from anything on the floor
   * leaves through the ceiling, and a ceiling with structure in it is a grille
   * laid over the entire level — the crow included, which no audit would have
   * caught and every player would have.
   *
   * So the roof is sectioned exactly like the near wall: the glass is drawn,
   * because it is transparent and costs nothing, and the steel is kept only
   * where it springs from the walls. The bars of light come from the clerestory
   * mullions on the west and back walls instead, which is where the sun
   * actually is — az swings from −118° to −138° across the session, behind the
   * block and to the west, all day.
   */
  {
    /**
     * Where the ceiling is allowed to be solid, worked out rather than guessed.
     *
     * A ray toward this camera rises 0.616 for every 0.714 it travels in +z, so
     * anything on the floor crosses the ceiling plane **12.9 m further forward
     * than it stands**, and the frontmost pickup on this block stands at
     * z = −8.2. Nothing on the floor therefore leaves through the ceiling
     * before z = +4.7, and nothing on the gallery before z = −3.2.
     *
     * So the back seven metres can be a real plastered ceiling with downlights
     * in it — which the gallery badly needs and which is most of what makes the
     * room read as a room — and the rest is the lantern. The trusses under the
     * glass run *across*, never along: a beam parallel to z sits over a strip of
     * floor 6 m to its west and would hide everything on it.
     */
    const CEIL_TO = -4.4;
    const soffit = box(44, 0.5, 7.0, PAL.stoneMid, { up: PAL.stone, down: PAL.stone });
    soffit.position.set(0, ROOF - 0.25, -7.9);
    root.add(soffit);
    // Coffers, and a downlight in every third one. The gallery is under seven
    // metres of solid ceiling and no key light reaches any of it at any hour.
    const cans = [];
    for (let x = -19; x <= 19; x += 3.2) {
      root.add(at(box(0.3, 0.3, 6.6, PAL.stone, { up: PAL.stone, down: PAL.stoneMid }), x, ROOF - 0.6, -7.9));
      if ((x + 19) % 6.4 < 0.1) {
        const can = cyl(0.22, 0.26, 0.12, 8, PAL.goldLit, { shadow: false });
        can.position.set(x, ROOF - 0.62, -9.4);
        root.add(can);
        cans.push(can);
      }
    }
    night.add(cans, PAL.goldLit, { peak: 0.9, warm: 2.4, delay: 0.6 });
    /**
     * And the *top* of it, which is in frame and was a blank tan plane.
     *
     * A crow on the gallery puts the camera thirty metres up, looking down at
     * the outside of this ceiling — so it is a roof, and it gets a parapet and
     * two vent housings. Both sit behind the trimmer at z = −4.4, which a ray
     * from the gallery has already passed under by the time it reaches the
     * ceiling plane.
     */
    const para = box(44, 0.45, 0.3, PAL.stone, { up: PAL.stone, down: PAL.shade });
    para.position.set(0, ROOF + 0.5, -4.6);
    root.add(para);
    for (const [vx, vw] of [[-13, 3.4], [9, 2.6]]) {
      root.add(at(box(vw, 0.9, 2.2, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), vx, ROOF + 0.75, -8.6));
      root.add(at(cyl(0.34, 0.34, 0.5, 8, PAL.steel, { up: PAL.silver, down: PAL.steelDark }), vx, ROOF + 1.4, -8.6));
    }
    for (const px of [-14, -4, 6, 14]) {
      night.addPool(root, px, -9.4, 5.0,
        { profile: 'stall', peak: 0.5, warm: 2.4, delay: 0.6, y: DECK.mezzanine });
    }

    const panes = box(44, 0.1, 17.6, PAL.waterLit,
      { transparent: true, opacity: 0.16, shadow: false, receive: false });
    panes.position.set(0, ROOF, 4.4);
    root.add(panes);
    // The gutter beam capping each wall, the trimmer where the glass meets the
    // plaster, and one truss over the middle — which is what the chandelier
    // hangs from, and the reason it is at z = 2.
    for (const [cx, cz, w, d] of [
      [-22.0, 0.9, 0.5, 25], [22.0, 0.9, 0.5, 25],
      [0, CEIL_TO, 44, 0.6], [0, POOL_SPEC.z, 44, 0.5],
    ]) {
      root.add(at(box(w, 0.44, d, PAL.steel, { up: PAL.silver, down: PAL.shade }), cx, ROOF - 0.2, cz));
    }
    for (let x = -18; x <= 18; x += 6) {
      root.add(at(box(0.26, 0.3, 1.8, PAL.steel, { up: PAL.silver, down: PAL.shade }), x, ROOF - 0.3, POOL_SPEC.z));
    }
    // One collider, 44 wide. Wide on purpose: the audit probes every overhang
    // narrower than thirty metres from eight headings looking for the shove
    // bug, and a roof is not that shape of object.
    solid(0, 0.9, 44, 24.6, ROOF + 0.4, ROOF - 0.7, { perch: false });
  }

  // ── the front glass, and the section cut ──────────────────────────────────
  /**
   * The near wall is cut away, the way the roofline cuts away everything under
   * its terrace. What is left at the section line is a 1.2 m glass screen on a
   * brass rail — enough that the room stops somewhere, low enough that nothing
   * ever stands between the camera and the floor.
   *
   * The glass above it is not drawn and is absolutely still there: the second
   * collider is the rest of the frontage, invisible, so a crow that hops the
   * screen finds out that a lobby is a closed room the same way it would in a
   * real one.
   */
  {
    const screen = box(44, 1.2, 0.16, PAL.waterLit,
      { transparent: true, opacity: 0.3, shadow: false, receive: false });
    screen.position.set(0, 0.6, 13.0);
    root.add(screen);
    const rail = box(44, 0.1, 0.3, PAL.gold, { up: PAL.goldLit, down: PAL.shade });
    rail.position.set(0, 1.25, 13.0);
    root.add(rail);
    for (let x = -21; x <= 21; x += 3) {
      root.add(at(cyl(0.05, 0.05, 1.2, 6, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), x, 0.6, 13.0));
    }
    solid(0, 13.0, 44, 0.4, 1.3);
    solid(0, 13.0, 44, 0.4, ROOF, 1.3, { perch: false });
  }

  // Invisible bounds outside the glass, so nothing that gets past the frontage
  // — a dropped pickup, a shoved crow — leaves the map.
  solid(BOUNDS.minX - 3, 0.9, 4, 96, 30, 0, { perch: false });
  solid(BOUNDS.maxX + 3, 0.9, 4, 96, 30, 0, { perch: false });
  solid(0, BOUNDS.maxZ + 6, 150, 4, 30, 0, { perch: false });

  // ── the city, over the back wall ──────────────────────────────────────────
  addSkyline([
    [14, 25, PAL.stoneMid], [17, 20, PAL.terracotta], [12, 28, PAL.bark],
    [15, 23, PAL.stoneMid], [13, 19, PAL.terracotta], [16, 26, PAL.stoneMid],
  ], -28, { startX: -50 });
  solid(0, -24, 150, 10, 26);

  // ══════════════════════════════════════════════════════════════════════════
  // THE MEZZANINE — the deck nobody in the cast can follow you onto
  // ══════════════════════════════════════════════════════════════════════════
  {
    const slab = box(40, 0.4, 4.0, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    slab.position.set(0, DECK.mezzanine - 0.2, -9.2);
    root.add(slab);
    solid(0, -9.2, 40, 4.0, DECK.mezzanine, DECK.mezzanine - 0.4);
    addDecal(0, -9.2, 39.4, 3.6, PAL.stone, DECK.mezzanine);

    // The balustrade. Its top is at 5.3, which is the number that decides where
    // anything on this deck can be put: money at the back of the gallery clears
    // it on the way to the camera, money at the front does not.
    const bal = box(40, 0.9, 0.25, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    bal.position.set(0, DECK.mezzanine + 0.45, -7.32);
    root.add(bal);
    solid(0, -7.32, 40, 0.25, DECK.mezzanine + 0.9, DECK.mezzanine);
    for (let x = -19; x <= 19; x += 1.6) {
      root.add(at(cyl(0.05, 0.05, 0.86, 5, PAL.gold, { up: PAL.goldLit, down: PAL.shade }),
        x, DECK.mezzanine + 0.43, -7.32));
    }
    const cap = box(40, 0.1, 0.34, PAL.gold, { up: PAL.goldLit, down: PAL.shade });
    cap.position.set(0, DECK.mezzanine + 0.92, -7.32);
    root.add(cap);
    night.add(cap, PAL.gold, { peak: 0.42, warm: 3.0, delay: 1.4 });

    for (const px of [-16, -8, 0, 8, 16]) perch(px, DECK.mezzanine + 0.9, -7.32);
    for (const px of [-14, -4, 6, 14]) perch(px, DECK.mezzanine, -9.6);

    /**
     * The columns holding it up, and the block's only cover.
     *
     * A lobby's answer to "there is nowhere to stand where nobody can see you"
     * has to be something, and in a room with no trees it is the structure. Five
     * of them under the gallery edge and two free-standing in the floor.
     */
    for (const cx of [-16, -8, 0, 8, 16]) {
      const col = cyl(0.42, 0.48, DECK.mezzanine - 0.4, 8, PAL.stone, { up: PAL.stone, down: PAL.shade });
      col.position.set(cx, (DECK.mezzanine - 0.4) / 2, -7.6);
      root.add(col);
      solid(cx, -7.6, 0.94, 0.94, DECK.mezzanine - 0.4);
    }
  }
  for (const [cx, cz] of [[-9, 3], [9, 3]]) {
    const g = new THREE.Group();
    g.add(at(cyl(0.42, 0.48, 4.9, 8, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 2.45, 0));
    g.add(at(box(1.1, 0.3, 1.1, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, 5.05, 0));
    g.add(at(box(1.2, 0.24, 1.2, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 0.12, 0));
    g.position.set(cx, 0, cz);
    root.add(g);
    solid(cx, cz, 1.1, 1.1, 5.2);
    perch(cx, 5.2, cz);
    // A sconce on the camera side of each, because the middle of this room is
    // the one place a chandelier directly overhead lights worst.
    const sconce = box(0.34, 0.5, 0.16, PAL.goldLit, { shadow: false });
    sconce.position.set(cx + 0.2, 3.0, cz + 0.55);
    root.add(sconce);
    night.add(sconce, PAL.goldLit, { peak: 0.85, warm: 2.2, delay: 0.5 });
    night.addPool(root, cx, cz + 0.6, 5.0, { profile: 'stall', peak: 0.5, warm: 2.2, delay: 0.5 });
  }

  // Wall washers under the gallery. A forty-metre soffit casts a forty-metre
  // shadow across the back of the floor, and the answer to that is light on the
  // ground rather than another pendant — the park bought two points of median
  // and lost four of 5th percentile by adding one more lamppost.
  for (const wx of [-15, -5, 5, 15]) {
    const w = box(0.5, 0.22, 0.3, PAL.goldLit, { shadow: false });
    w.position.set(wx, 3.5, -7.05);
    root.add(w);
    night.add(w, PAL.goldLit, { peak: 0.8, warm: 2.6, delay: 0.9 });
    night.addPool(root, wx, -6.0, 5.6, { profile: 'stall', peak: 0.62, warm: 2.6, delay: 0.9 });
  }

  // ── the grand stair, against the west wall ────────────────────────────────
  /**
   * Four runs and a landing, from the floor to the gallery.
   *
   * It is scenery for the crow — the mezzanine is one hop from a column — and it
   * is the reason a housekeeper is up there at all. It also breaks the climb for
   * anybody who does not want to spend a stamina bar on it, which is the
   * roofline's staircase-of-decks argument at a fifth of the scale.
   *
   * Three metres wide, not four. The west end of this room is the only strip of
   * it the concierge has to stand in, and at four metres the stair left him a
   * 1.4 m slot between it and his own counter — which a walker can stand in and
   * cannot chase out of.
   */
  {
    const RUNS = [[1.6, 1.1], [-0.4, 2.2], [-2.4, 3.3], [-5.0, DECK.mezzanine]];
    for (const [cz, top] of RUNS) {
      const d = cz === -5.0 ? 4.4 : 2.0;
      const b = box(3.0, top, d, PAL.stone, { up: PAL.stone, down: PAL.shade });
      b.position.set(-19.9, top / 2, cz);
      root.add(b);
      solid(-19.9, cz, 3.0, d, top);
      perch(-19.9, top, cz);
    }
    // The balustrade down the open side.
    for (const [px, py] of [[2.4, 1.2], [0.6, 2.3], [-1.4, 3.4], [-3.4, 4.5]]) {
      root.add(at(cyl(0.05, 0.05, 0.9, 5, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), -18.45, py - 0.45, px));
    }
    const rail = box(0.1, 0.1, 8.4, PAL.gold, { up: PAL.goldLit, down: PAL.shade });
    rail.position.set(-18.45, 3.1, -1.2);
    rail.rotation.x = -0.34;
    root.add(rail);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE FOUNTAIN — the free money, and the only place in the room that is safe
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * No centrepiece, for the reason the park has none: the roofline's 2.3 m stem
   * ate the sightline of anything sitting on the far side of a 3.2 m basin and
   * its wishing coins had to be moved into an arc. A flat sheet of water lets
   * the coins go anywhere, and the rule that catches hidden pickups has nothing
   * to catch.
   */
  const POOL = addPool(POOL_SPEC.x, POOL_SPEC.z, POOL_SPEC.r, DECK.floor, {
    tag: 'lobby-pool', stone: PAL.stone, coping: PAL.stone, lining: PAL.stoneMid,
  });
  const FOUNTAIN = POOL.spec;
  root.userData.fountainWater = POOL.water;
  perch(POOL_SPEC.x + POOL_SPEC.r + 0.1, FOUNTAIN.rim, POOL_SPEC.z);
  night.add(POOL.water, PAL.water, { peak: 0.07, warm: 5.0, delay: 1.8 });

  // ══════════════════════════════════════════════════════════════════════════
  // THE CHANDELIER — two tiers, and the nest on top of the upper one
  // ══════════════════════════════════════════════════════════════════════════
  const NEST = { x: POOL_SPEC.x, y: DECK.chandelier, z: POOL_SPEC.z };
  {
    const g = new THREE.Group();
    // The rod up to the lantern truss — which is at z = 2 because this is, and
    // a chandelier hanging off nothing was the first thing a screenshot caught.
    g.add(at(cyl(0.06, 0.06, ROOF - DECK.chandelier - 0.35, 6, PAL.gold,
      { up: PAL.goldLit, down: PAL.shade, shadow: false }),
    0, (ROOF + DECK.chandelier) / 2 - 0.15, 0));

    const bulbs = [];
    /**
     * Neither tier casts a shadow, and that is a decision rather than an
     * oversight: this is three metres of brass and glass hanging directly over
     * the middle of the room, and a solid disc of shadow lying across the one
     * open floor everybody has to cross would cost more median than the whole
     * fitting is worth. After dark it is a light source; in daylight it is
     * filigree. It is still opaque geometry, so the audit's sightline ray still
     * has to get past it.
     */
    /**
     * Two coronas, not two cakes.
     *
     * The first build was a pair of thick discs with a cone between them, and
     * from a camera looking down at 38° it photographed as a tiered wedding
     * cake in wood — nothing about it said light fitting. What says it, from
     * above, is a *wheel*: a thin ring, candles standing on the ring, spokes to
     * a hub, and drops hanging off the edge. The rim of a corona is also the
     * honest reason the crown is three metres across, which is what
     * RULES.nestPlatformRatio wants of it.
     */
    const corona = (y, r, candles, spokes) => {
      // Pale and thin, not gold and thick. Gold at 0.09 m across three metres
      // still photographed as a wooden plate; PAL.shiny reads as the glass pan
      // of a light fitting, and the brass is left to do the rim and the spokes.
      const band = cyl(r, r, 0.05, 16, PAL.shiny, { up: PAL.shiny, down: PAL.silver, shadow: false });
      band.position.y = y;
      g.add(band);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 4, 16), mat(PAL.gold));
      lip.rotation.x = Math.PI / 2;
      lip.position.y = y + 0.03;
      g.add(lip);
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        const arm = box(r, 0.05, 0.05, PAL.gold, { shadow: false });
        arm.position.set(Math.cos(a) * r / 2, y + 0.06, Math.sin(a) * r / 2);
        arm.rotation.y = -a;
        g.add(arm);
      }
      for (let i = 0; i < candles; i++) {
        const a = (i / candles) * Math.PI * 2 + 0.2;
        const cx = Math.cos(a) * (r - 0.06), cz = Math.sin(a) * (r - 0.06);
        g.add(at(cyl(0.035, 0.045, 0.2, 5, PAL.stone, { shadow: false }), cx, y + 0.15, cz));
        const b = at(ico(0.085, 0, PAL.goldLit, { shadow: false }), cx, y + 0.31, cz);
        b.material = mat(PAL.goldLit);
        g.add(b);
        bulbs.push(b);
        // A drop under every other candle, so the edge reads as glass.
        if (i % 2 === 0) {
          g.add(at(ico(0.06, 0, PAL.shiny, { shadow: false }), cx, y - 0.16, cz));
        }
      }
    };
    corona(TIER, 1.9, 14, 8);
    corona(DECK.chandelier - 0.05, 1.6, 12, 8);
    // The stem between them, and the hub the nest sits in.
    g.add(at(cyl(0.16, 0.22, 1.6, 8, PAL.gold, { up: PAL.goldLit, down: PAL.shade, shadow: false }),
      0, TIER + 0.85, 0));
    g.add(at(cyl(0.72, 0.6, 0.14, 10, PAL.goldLit, { up: PAL.goldLit, down: PAL.gold, shadow: false }),
      0, DECK.chandelier + 0.03, 0));
    night.add(bulbs, PAL.goldLit, { peak: 1.0, warm: 2.0, delay: 0.15 });
    // The room's event. Everything else on this block catches after it.
    night.addPool(root, POOL_SPEC.x, POOL_SPEC.z, 13.0,
      { profile: 'stall', peak: 0.88, warm: 2.0, delay: 0.15 });

    const nest = makeNest();
    nest.position.y = DECK.chandelier;
    g.add(nest);
    root.userData.nestGroup = nest;

    g.position.set(POOL_SPEC.x, 0, POOL_SPEC.z);
    root.add(g);

    // 3.2 across against a 1.5 m twig ring — RULES.nestPlatformRatio, and worth
    // more here than anywhere else in the game: this is a disc in mid-air, it is
    // the only way to bank anything, and you arrive at it carrying.
    solid(POOL_SPEC.x, POOL_SPEC.z, 3.2, 3.2, DECK.chandelier, DECK.chandelier - 0.22);
    solid(POOL_SPEC.x, POOL_SPEC.z, 3.5, 3.5, TIER, TIER - 0.16);
    perch(POOL_SPEC.x, DECK.chandelier, POOL_SPEC.z);
    perch(POOL_SPEC.x + 1.4, TIER, POOL_SPEC.z);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE FRONT DESK — $28.00, two staff, and the block's set piece
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * Two counters with a 1.6 m pass-through between them, which is not decoration.
   * A twelve-metre unbroken counter with a clerk in a 1.5 m alley behind it is a
   * guard who cannot chase — she has to walk the length of the desk and round
   * the end, and a corridor is exactly the shape `stepAround` deadlocks in. The
   * gap is how she gets out, and the audit's chase probe starts behind the desk
   * to prove it.
   */
  {
    for (const [cx, w] of [[-13.2, 5.6], [-6.4, 4.8]]) {
      const g = new THREE.Group();
      g.add(at(box(w, 1.15, 0.9, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, 0.575, 0));
      g.add(at(box(w + 0.16, 0.09, 1.04, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 1.2, 0));
      // A brass toe rail, so the front of the desk is not a blank slab.
      g.add(at(box(w, 0.06, 0.06, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), 0, 0.22, 0.48));
      g.position.set(cx, 0, DESK.z);
      root.add(g);
      solid(cx, DESK.z, w + 0.16, 1.04, 1.245);
      perch(cx, 1.245, DESK.z);
    }

    // The key pigeonholes behind, and the ledge the mail sits on. The ledge
    // collider has to be where the ledge mesh is, not where the board is — the
    // park's noticeboard cost a round of this: any further back and the money is
    // inside the cabinet, any further forward and it is standing on air.
    const cab = new THREE.Group();
    cab.add(at(box(8.0, 2.4, 0.45, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, 1.2, 0));
    const slots = [];
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 3; j++) {
        const s = box(0.5, 0.34, 0.1, PAL.barkShade, { shadow: false });
        s.position.set(-3.5 + i * 0.64, 1.05 + j * 0.44, 0.2);
        cab.add(s);
        slots.push(s);
      }
    }
    night.add(slots, 0xe0a860, { peak: 0.4, warm: 3.4, delay: 1.6 });
    cab.position.set(DESK.x, 0, -8.6);
    root.add(cab);
    solid(DESK.x, -8.6, 8.0, 0.45, 2.4);

    const ledge = box(8.0, 0.14, 0.36, PAL.stone, { up: PAL.stone, down: PAL.shade });
    ledge.position.set(DESK.x, 1.63, -8.24);
    root.add(ledge);
    solid(DESK.x, -8.24, 8.0, 0.36, 1.70, 1.52);

    // The desk lamps.
    for (const lx of [-14.4, -5.6]) {
      root.add(at(cyl(0.09, 0.11, 0.28, 6, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), lx, 1.38, DESK.z - 0.2));
      const shade = cone(0.2, 0.26, 8, PAL.goldLit, { shadow: false });
      shade.rotation.z = Math.PI;
      shade.position.set(lx, 1.65, DESK.z - 0.2);
      root.add(shade);
      night.add(shade, PAL.goldLit, { peak: 0.95, warm: 1.8, delay: 0.7 });
    }
    night.addPool(root, DESK.x, DESK.z + 0.6, 7.4,
      { profile: 'stall', peak: 0.7, warm: 1.8, delay: 0.7 });

    // The open cash drawer, on the west counter. A tray with a 5 cm lip, so the
    // bill in it is unmistakably *in* something and nothing is standing between
    // it and the camera.
    const tray = new THREE.Group();
    tray.add(at(box(0.5, 0.05, 0.32, PAL.steelDark, { up: PAL.steel, down: PAL.shade }), 0, 0.025, 0));
    for (const [dx, dz, w, d] of [[0, -0.17, 0.5, 0.03], [-0.25, 0, 0.03, 0.34], [0.25, 0, 0.03, 0.34]]) {
      tray.add(at(box(w, 0.1, d, PAL.steel, { up: PAL.silver, down: PAL.shade }), dx, 0.05, dz));
    }
    tray.position.set(-13.5, 1.245, -6.28);
    root.add(tray);
  }

  /**
   * The brass bell, and the tip under it.
   *
   * Level 1's saltshaker, level 2's paperback, level 3's candle lantern, and the
   * same verb charged for a fourth time. It sits on the *far* corner of the bill
   * rather than on top of it — the audit's sightline ray starts six centimetres
   * from a pickup's middle and travels toward the camera, so a weight centred on
   * a bill is a bill the camera cannot see. The park's paperback clears that by
   * fourteen millimetres, which is not a margin anybody should copy.
   */
  const bell = group(
    at(cyl(0.11, 0.13, 0.02, 10, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), 0, 0.01, 0),
    at(ico(0.1, 0, PAL.goldLit), 0, 0.09, 0),
    at(cyl(0.014, 0.014, 0.05, 4, PAL.steel), 0, 0.17, 0),
  );
  bell.position.set(-6.4, 1.245, -6.32);
  bell.userData.label = 'THE BELL';
  root.add(bell);

  // ══════════════════════════════════════════════════════════════════════════
  // THE BAR — under the east end of the gallery
  // ══════════════════════════════════════════════════════════════════════════
  {
    const g = new THREE.Group();
    g.add(at(box(8, 1.15, 1.0, PAL.bark, { up: PAL.barkShade, down: PAL.shade }), 0, 0.575, 0));
    g.add(at(box(8.3, 0.1, 1.2, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 1.2, 0));
    g.add(at(box(8, 0.06, 0.06, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), 0, 0.24, 0.52));
    g.position.set(BAR.x, 0, BAR.z);
    root.add(g);
    solid(BAR.x, BAR.z, 8.3, 1.2, 1.25);
    perch(BAR.x, 1.25, BAR.z);

    // The back bar, and the alley between. 1.65 m of it, which is what the
    // bartender needs to not be standing inside his own furniture and what a
    // chase needs to get out of the far end.
    const back = new THREE.Group();
    back.add(at(box(8, 2.4, 0.5, PAL.barkShade, { up: PAL.bark, down: PAL.shade }), 0, 1.2, 0));
    const shelf = [];
    for (let i = 0; i < 3; i++) {
      const s = box(7.6, 0.09, 0.34, PAL.stone, { shadow: false });
      s.position.set(0, 0.9 + i * 0.52, 0.28);
      back.add(s);
      shelf.push(s);
    }
    for (let i = 0; i < 22; i++) {
      const h = 0.2 + Math.random() * 0.14;
      const btl = cyl(0.035, 0.05, h, 5,
        [PAL.canopyShade, PAL.terracotta, PAL.bark, PAL.awning][i % 4], { shadow: false });
      btl.position.set(-3.4 + (i % 11) * 0.68, 0.95 + Math.floor(i / 11) * 0.52 + h / 2, 0.28);
      back.add(btl);
    }
    night.add(shelf, PAL.goldLit, { peak: 0.75, warm: 2.8, delay: 1.1 });
    back.position.set(BAR.x, 0, -7.4);
    root.add(back);
    solid(BAR.x, -7.4, 8, 0.5, 2.4);
    night.addPool(root, BAR.x, BAR.z + 0.8, 6.4,
      { profile: 'stall', peak: 0.66, warm: 2.8, delay: 1.1 });

    // The tip tray. An open dish, so the coins in it read as takeable rather
    // than as decoration on a counter.
    const dish = cyl(0.22, 0.18, 0.05, 10, PAL.gold, { up: PAL.goldLit, down: PAL.shade });
    dish.position.set(11.5, 1.27, -4.7);
    root.add(dish);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE LOUNGE — four empty armchairs, and the tea cart the croissant is on
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * Every one of these chairs is empty, and that is load-bearing rather than
   * lazy.
   *
   * The kid is identified by her silhouette — she sits, and nothing else in the
   * game sits. The roofline invented that and the park had to defend it against
   * being mostly benches. A hotel lobby is worse: it is a room whose entire
   * purpose is chairs. So the lounge is unoccupied, which costs nothing because
   * an empty armchair in a hotel lobby is the most ordinary object in the world,
   * and the kid sits on the family luggage instead — a shape nothing else in the
   * room has.
   */
  {
    const chair = (x, z, ry) => {
      const g = new THREE.Group();
      g.add(at(box(0.86, 0.32, 0.8, PAL.terracotta, { up: PAL.terracottaLit, down: PAL.shade }), 0, 0.42, 0));
      g.add(at(box(0.86, 0.62, 0.16, PAL.terracotta, { up: PAL.terracottaLit, down: PAL.shade }), 0, 0.89, -0.32));
      for (const s of [-1, 1]) {
        g.add(at(box(0.14, 0.3, 0.8, PAL.terracottaLit, { up: PAL.terracottaLit, down: PAL.shade }), s * 0.36, 0.73, 0));
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.add(at(cyl(0.04, 0.04, 0.26, 4, PAL.bark), sx * 0.34, 0.13, sz * 0.3));
      }
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      root.add(g);
      solid(x, z, 1.0, 1.0, 0.58);
      perch(x, 0.58, z);
    };
    chair(10.4, 6.4, 0.8);
    chair(14.2, 7.8, -0.4);
    chair(17.4, 4.6, -1.5);
    chair(12.6, 3.0, 2.6);

    // The low table between them.
    const t = new THREE.Group();
    t.add(at(box(1.5, 0.08, 0.9, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 0.44, 0));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      t.add(at(box(0.07, 0.44, 0.07, PAL.bark), sx * 0.65, 0.22, sz * 0.35));
    }
    t.position.set(13.8, 0, 5.4);
    root.add(t);
    solid(13.8, 5.4, 1.5, 0.9, 0.48);
    perch(13.8, 0.48, 5.4);

    // The tea cart, which is where the croissant is. Two shelves and four
    // castors — a trolley rather than a table, because the bait wants to look
    // like something nobody is watching.
    const cart = new THREE.Group();
    cart.add(at(box(1.1, 0.07, 0.66, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 0.86, 0));
    cart.add(at(box(1.1, 0.07, 0.66, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 0.44, 0));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      cart.add(at(cyl(0.035, 0.035, 0.86, 5, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), sx * 0.5, 0.43, sz * 0.28));
      cart.add(at(cyl(0.06, 0.06, 0.05, 6, PAL.steelDark), sx * 0.5, 0.05, sz * 0.28));
    }
    // Dressing: a stack of plates and a cloche. Not takeable — the glint is the
    // game's only "you can take this" signal and this cart has one thing on it.
    for (let i = 0; i < 4; i++) {
      cart.add(at(cyl(0.16, 0.16, 0.02, 10, PAL.stone, { shadow: false }), -0.34, 0.91 + i * 0.025, 0.1));
    }
    cart.add(at(cyl(0.2, 0.22, 0.16, 8, PAL.silver, { up: PAL.shiny, down: PAL.shade }), 0.3, 0.98, -0.14));
    cart.position.set(16.6, 0, 8.2);
    root.add(cart);
    solid(16.6, 8.2, 1.1, 0.66, 0.9);
    perch(16.6, 0.9, 8.2);

    /**
     * Two floor lamps, and they are 1.9 m rather than the kit's 4.6.
     *
     * The lounge and the west end were the only quarters of this room with no
     * light of their own, and at t=0.98 the 5th percentile came in at 21
     * against a floor of 24 — three points, all of it in corners a chandelier
     * thirteen metres away cannot reach. The park's lesson is that a lamp at
     * this camera is a pool on the ground *plus* a column and its shadow
     * standing in the frame, and it is the height of the column that decides
     * which half of that trade you get. A standard lamp beside an armchair is
     * all pool and almost no column.
     */
    for (const [lx, lz] of [[18.6, 3.2], [9.0, 8.8]]) {
      const l = new THREE.Group();
      l.add(at(cyl(0.26, 0.3, 0.06, 8, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), 0, 0.03, 0));
      l.add(at(cyl(0.035, 0.035, 1.6, 6, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), 0, 0.8, 0));
      const shade = cone(0.34, 0.4, 8, PAL.stone, { up: PAL.stone, down: PAL.goldLit });
      shade.rotation.z = Math.PI;
      shade.position.y = 1.78;
      l.add(shade);
      l.position.set(lx, 0, lz);
      root.add(l);
      solid(lx, lz, 0.5, 0.5, 1.6);
      night.add(shade, PAL.goldLit, { peak: 0.9, warm: 2.2, delay: 0.35 });
      night.addPool(root, lx, lz, 6.2, { profile: 'stall', peak: 0.72, warm: 2.2, delay: 0.35 });
    }

    // The near-side occluder. Every block has one thing whose job is to be in
    // the way, and nothing that is core loop goes behind it — the kid is four
    // metres west of this and the fountain is further.
    const palm = addPlanter(10.6, 10.6, 0, { w: 1.5 });
    for (let i = 0; i < 5; i++) {
      const frond = box(0.16, 0.08, 2.0, PAL.canopy, { up: PAL.canopyLit, down: PAL.canopyShade });
      frond.position.set(Math.cos(i * 1.3) * 0.5, 1.7 + (i % 2) * 0.35, Math.sin(i * 1.3) * 0.5);
      frond.rotation.set(0.4, i * 1.3, 0.3);
      palm.add(frond);
    }
    palm.add(at(cyl(0.11, 0.14, 1.5, 6, PAL.bark, { up: PAL.bark, down: PAL.barkShade }), 0, 1.2, 0));
    solid(10.6, 10.6, 1.5, 1.5, 1.6);
    occluders.push(...palm.children);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE WEST END — the door, the luggage, and the kid's suitcase
  // ══════════════════════════════════════════════════════════════════════════
  {
    // The revolving door. The other occluder, and the reason there is nothing
    // takeable in the near-west corner of this room.
    const g = new THREE.Group();
    const drum = cyl(1.5, 1.5, 2.6, 12, PAL.waterLit,
      { transparent: true, opacity: 0.26, shadow: false, receive: false });
    drum.position.y = 1.3;
    g.add(drum);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      g.add(at(box(0.08, 2.5, 1.44, PAL.gold, { up: PAL.goldLit, down: PAL.shade }),
        Math.cos(a) * 0.72, 1.3, Math.sin(a) * 0.72, -a));
    }
    g.add(at(cyl(1.62, 1.62, 0.22, 12, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), 0, 2.72, 0));
    const lantern = at(ico(0.16, 0, PAL.goldLit, { shadow: false }), 0, 3.1, 0);
    lantern.material = mat(PAL.goldLit);
    g.add(lantern);
    night.add(lantern, PAL.goldLit, { peak: 0.9, warm: 1.6, delay: 0, flicker: true });
    night.addPool(root, DOOR.x, DOOR.z, 5.6,
      { profile: 'stall', peak: 0.6, warm: 1.6, delay: 0, flicker: true });
    g.position.set(DOOR.x, 0, DOOR.z);
    root.add(g);
    solid(DOOR.x, DOOR.z, 3.0, 3.0, 2.83);
    perch(DOOR.x, 2.83, DOOR.z);
    occluders.push(...g.children.filter((c) => c.isMesh));
  }

  // A pair of sconces on the west wall, over the stair and the bell cart —
  // the last unlit quarter of the room, and light on the ground rather than
  // another column standing in it.
  for (const sz of [-1.0, 6.0]) {
    const sc = box(0.16, 0.5, 0.34, PAL.goldLit, { shadow: false });
    sc.position.set(-21.7, 3.1, sz);
    root.add(sc);
    night.add(sc, PAL.goldLit, { peak: 0.85, warm: 2.4, delay: 0.8 });
    night.addPool(root, -20.4, sz, 5.8, { profile: 'stall', peak: 0.62, warm: 2.4, delay: 0.8 });
  }

  // The luggage cart, and the change dish on it.
  {
    const g = new THREE.Group();
    g.add(at(box(1.9, 0.1, 1.0, PAL.bark, { up: PAL.bark, down: PAL.barkShade }), 0, 0.28, 0));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(at(cyl(0.05, 0.05, 0.28, 5, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), sx * 0.82, 0.14, sz * 0.4));
      g.add(at(cyl(0.09, 0.09, 0.06, 6, PAL.steelDark), sx * 0.82, 0.03, sz * 0.4));
    }
    // The upright, which is what makes it a bell cart and not a table.
    for (const sx of [-1, 1]) {
      g.add(at(cyl(0.045, 0.045, 1.3, 6, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), sx * 0.82, 0.95, -0.4));
    }
    g.add(at(cyl(0.045, 0.045, 1.64, 6, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), 0, 1.58, -0.4, Math.PI / 2));
    const bar = box(1.64, 0.09, 0.09, PAL.gold, { up: PAL.goldLit, down: PAL.shade });
    bar.position.set(0, 1.58, -0.4);
    g.add(bar);
    // Cases on it, in three cloth colours.
    for (const [cx2, cz2, w, h, d, c] of [
      [-0.5, 0.1, 0.7, 0.42, 0.44, 2], [0.35, 0.05, 0.62, 0.5, 0.4, 3], [-0.1, -0.2, 0.5, 0.3, 0.36, 1],
    ]) {
      g.add(at(box(w, h, d, PAL.cloth[c], { up: PAL.clothLit[c], down: PAL.shade }), cx2, 0.33 + h / 2, cz2));
    }
    g.position.set(CART.x, 0, CART.z);
    root.add(g);
    // The *deck*, not the handle. A collider drawn to the top of the push bar
    // is a collider with the cart's own change dish inside it.
    solid(CART.x, CART.z, 1.9, 1.0, 0.33);
    perch(CART.x, 0.33, CART.z);

    const dish = cyl(0.2, 0.16, 0.05, 10, PAL.silver, { up: PAL.shiny, down: PAL.shade });
    dish.position.set(CART.x + 0.62, 0.355, CART.z + 0.3);
    root.add(dish);
  }

  // The kid's luggage, which is the thing she is sitting on.
  {
    const g = new THREE.Group();
    g.add(at(box(0.86, 0.3, 0.56, PAL.cloth[1], { up: PAL.clothLit[1], down: PAL.shade }), 0, 0.15, 0));
    g.add(at(box(0.7, 0.16, 0.46, PAL.cloth[3], { up: PAL.clothLit[3], down: PAL.shade }), 0.02, 0.38, 0.02));
    g.add(at(box(0.3, 0.05, 0.05, PAL.bark), 0, 0.48, 0.02));
    g.position.set(KID.x, 0, KID.z);
    g.rotation.y = -0.5;
    root.add(g);
    solid(KID.x, KID.z, 0.94, 0.7, 0.46);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // THE PIANO — the west-centre landmark, and it is cream
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * Cream, not black.
   *
   * A black baby grand is what anyone would draw and it is the roofline's navy
   * van again: three square metres of the darkest value in the palette parked in
   * the middle of the one frame this block has to stay navigable in. A cream
   * piano is a real thing a hotel owns, so nothing is being given up.
   */
  {
    const g = new THREE.Group();
    g.add(at(box(1.6, 0.22, 2.3, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 0.88, 0));
    // The lid, propped.
    const lid = box(1.5, 0.09, 2.1, PAL.stone, { up: PAL.stone, down: PAL.shade });
    lid.position.set(-0.1, 1.14, -0.1);
    lid.rotation.z = 0.24;
    g.add(lid);
    g.add(at(box(1.5, 0.07, 0.34, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, 0.99, 1.2));
    for (const [sx, sz] of [[-0.6, -0.9], [0.6, -0.9], [0, 1.0]]) {
      g.add(at(cyl(0.06, 0.08, 0.86, 6, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), sx, 0.43, sz));
    }
    // The keys, which is the only thing that says piano at this distance.
    g.add(at(box(1.2, 0.04, 0.22, PAL.shiny, { shadow: false }), 0, 1.02, 1.18));
    g.add(at(box(1.2, 0.03, 0.09, PAL.feather, { shadow: false }), 0, 1.05, 1.13));
    g.position.set(-6, 0, 7);
    g.rotation.y = 0.5;
    root.add(g);
    solid(-6, 7, 2.4, 2.6, 1.0);
    perch(-6, 1.0, 7);
  }

  // ── the housekeeping cart, up on the gallery ──────────────────────────────
  {
    const g = new THREE.Group();
    g.add(at(box(1.5, 0.08, 0.8, PAL.steel, { up: PAL.silver, down: PAL.shade }), 0, 0.86, 0));
    g.add(at(box(1.5, 0.08, 0.8, PAL.steel, { up: PAL.silver, down: PAL.shade }), 0, 0.4, 0));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(at(cyl(0.04, 0.04, 0.86, 5, PAL.steelDark), sx * 0.68, 0.43, sz * 0.34));
    }
    // Linen, in the two cloth tones that are not the armchairs.
    g.add(at(box(0.62, 0.34, 0.6, PAL.stone, { up: PAL.stone, down: PAL.shade }), -0.4, 1.07, 0));
    g.add(at(box(0.5, 0.26, 0.5, PAL.cloth[4], { up: PAL.clothLit[4], down: PAL.shade }), 0.42, 1.03, 0.06));
    g.position.set(TROLLEY.x, DECK.mezzanine, TROLLEY.z);
    root.add(g);
    solid(TROLLEY.x, TROLLEY.z, 1.5, 0.8, DECK.mezzanine + 0.9, DECK.mezzanine);
    perch(TROLLEY.x, DECK.mezzanine + 0.9, TROLLEY.z);
  }

  return {
    root, colliders, occluders, perches,
    nightLights: night,
    fountain: FOUNTAIN,
    waterDeck: DECK.floor,
    nest: NEST,
    nestPlatform: 3.2,     // the chandelier's crown
    nestFootprint: 1.5,    // the twig ring itself
    decks: DECK,
    desk: DESK,
    bar: BAR,
    /** The weighted object pinning a bill. The game knows it as `pin`. */
    pin: bell,
    pickups: pickupPlacements({ FOUNTAIN }),
    humans: humanPlacements(),
    gulls: gullPlacements(),
    pigeons: pigeonPlacements(),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Placements
// ════════════════════════════════════════════════════════════════════════════

/**
 * The value ladder, laid out in one room.
 *
 * $57.05 against a $40 goal, so a run has to land about 70% of everything in
 * the lobby — the block asks 62% and the park 76%, and this sits between them
 * because a level that is harder to *work* should not also be tighter to
 * finish.
 *
 * The shape is the argument. $5.40 is unguarded and dry, which is the least
 * free money any block has ever offered, and it is the direct consequence of
 * there being no district next door: on the block the scattered change is a
 * fallback, and here it is a rounding error. Everything that matters is on a
 * counter with somebody behind it. docs/lobby-brief.html §3.
 */
function pickupPlacements({ FOUNTAIN }) {
  const p = [];
  const add = (kind, value, x, y, z, extra = {}) =>
    p.push({ kind, value, pos: [x, y, z], ...extra });

  // — Scattered change. Two constraints that are not obvious from the numbers:
  //   nothing under the gallery (z < -7.2), because a pickup under a
  //   forty-metre overhang cannot be seen from a camera at 38°, and nothing
  //   inside three metres of the east wall, for the same arithmetic sideways. —
  for (const [x, z] of [
    [-17, 3], [-15, 10.5], [-8, 11], [-3, 9], [4, 10.5],
    [11, 1], [8.5, 10.8], [18, -1], [-6, -3], [12, 10.4],
  ]) add('penny', 0.01, x, 0.06, z);
  for (const [x, z] of [[-20, 7.5], [-11, 5.5], [0, 10.4], [8, -2.5], [16, 2]]) {
    add('nickel', 0.05, x, 0.06, z);
  }
  for (const [x, z] of [[-17, 0.5], [-4, -4.5], [7, 8.5], [15, 10.5]]) {
    add('dime', 0.10, x, 0.06, z);
  }
  for (const [x, z] of [[-13, 8.5], [6, -5.5], [18, 4]]) add('quarter', 0.25, x, 0.06, z);

  // Free money that is somewhere rather than nowhere: a heap on the lounge
  // table, a heap on the piano lid, a bill somebody dropped getting out of a
  // chair, and the change on the gallery ledge — the only free money in the
  // block that costs a climb.
  add('coins', 1.10, 13.8, 0.52, 5.4);
  add('coins', 0.90, -5.43, 1.06, 8.05);
  add('bill1', 1.00, 10.9, 0.05, 8.0);
  add('coins', 0.90, -7.0, 4.46, -9.0);

  // — The fountain. Five quarters and a ring, on a flat sheet of water with
  //   nothing in the middle of it, so there is no sightline arithmetic. —
  for (const [deg, r] of [[20, 2.0], [92, 2.1], [164, 1.9], [236, 2.1], [308, 2.0]]) {
    const a = (deg * Math.PI) / 180;
    add('quarter', 0.25,
      FOUNTAIN.x + Math.cos(a) * r, FOUNTAIN.rim - 0.28, FOUNTAIN.z + Math.sin(a) * r,
      { inWater: true });
  }

  // — The front desk: $28.00 across twelve metres, three problems, three prices. —
  add('bill20', 20.00, -13.5, 1.30, -6.22,
    { owner: 'concierge', label: 'THE CASH DRAWER' });
  // The tip, on the camera side of the bell that is holding it down.
  add('bill5', 5.00, -6.4, 1.26, -6.18,
    { owner: 'clerk', pinned: true, label: 'THE TIP UNDER THE BELL', underBell: true });
  add('coins', 3.00, -7.5, 1.74, -8.2, { owner: 'clerk', label: 'THE MAIL SLOT' });

  // — The bar. Two takes, one trip, and a bartender who does not move. —
  add('coins', 6.00, 11.5, 1.33, -4.7, { owner: 'bartender', label: 'THE TIP TRAY' });
  add('bill5', 5.00, 15.5, 1.27, -4.7, { owner: 'bartender', label: 'A FIVE BY THE REGISTER' });

  // — The bell cart, and the gallery. —
  add('coins', 3.40, -17.88, 0.40, 5.3, { owner: 'bellhop', label: 'THE CHANGE DISH' });
  add('coins', 8.00, -12.5, 5.34, -9.9, { owner: 'housekeeper', label: "HOUSEKEEPING'S FLOAT" });

  // — Shinies: worthless, tradeable, one for each quarter of the room. —
  add('shiny', 0, -4.5, 0.07, -3.0, { shinyKind: 'fob' });
  add('shiny', 0, 16.8, 0.07, 6.8, { shinyKind: 'clip' });
  add('shiny', 0, -15.2, 0.07, 2.6, { shinyKind: 'foil' });
  add('shiny', 0, FOUNTAIN.x, FOUNTAIN.rim - 0.28, FOUNTAIN.z, { inWater: true, shinyKind: 'ring' });

  // — The croissant. Not money; the only thing in the room that moves a
  //   concierge. On the top shelf of the tea cart, where a takeable reads as
  //   takeable rather than as part of the furniture. —
  add('croissant', 0, 16.6, 0.94, 8.35);

  p.forEach((x, i) => { x.id = i; });
  return p;
}

function humanPlacements() {
  return [
    {
      id: 'concierge', name: 'the concierge', cloth: 1, skin: 0, hair: 1,
      /**
       * At the open west end of his own desk, in front of it.
       *
       * The park learned this and it is the same lesson twice: its vendor stands
       * at the open end of the wagon rather than behind it, because behind it is
       * where the camera cannot see him. It matters more here than there — the
       * whole puzzle of this block is watching this particular man leave, and a
       * guard whose *absence* is the solution has to be unmistakable in both
       * states.
       */
      pos: [-16.9, 0, -5.2], home: [-16.9, 0, -5.2],
      patrol: null, speed: 1.3, chaseSpeed: 4.1, viewDist: 12, viewCos: 0.05,
      guardRadius: 4.6, alertness: 1.3, faces: [1, -0.2],
    },
    {
      id: 'clerk', name: 'the desk clerk', cloth: 3, skin: 2, hair: 0,
      // In the alley behind the east counter. She can get out through the
      // pass-through between the two counters, which is the only reason a
      // twelve-metre desk is legal here at all.
      pos: [-7.0, 0, -7.6], home: [-7.0, 0, -7.6],
      patrol: null, speed: 1.2, chaseSpeed: 4.0, viewDist: 9, viewCos: 0.25,
      guardRadius: 3.6, alertness: 1.15, faces: [0, 1],
    },
    {
      id: 'bellhop', name: 'the bellhop', cloth: 0, skin: 1, hair: 2,
      /**
       * A full lap of the floor, and it is this block's clock.
       *
       * The park's keeper does the same job for the same reason: the other
       * guards stand still and you learn a cone, this one you have to time. In a
       * room with no way out, a walker who crosses the middle of it every forty
       * seconds is also the thing that stops the open marble from being safe.
       */
      pos: [-16.5, 0, 7.5], home: [-16.5, 0, 7.5],
      patrol: [[-16.5, 7.5], [-13, 8.8], [-4, 10.5], [6, 10], [14, 9.5],
        [18.5, 6.8], [10, -1.5], [0, -2.5], [-9, -1.5], [-16, 2]],
      speed: 1.4, chaseSpeed: 4.2, viewDist: 9.5, viewCos: 0.3,
      guardRadius: 3.4, alertness: 1.0,
    },
    {
      id: 'bartender', name: 'the bartender', cloth: 4, skin: 3, hair: 1,
      pos: [13.5, 0, -6.3], home: [13.5, 0, -6.3],
      patrol: null, speed: 1.1, chaseSpeed: 3.9, viewDist: 9, viewCos: 0.25,
      guardRadius: 4.0, alertness: 1.1, faces: [0, 1],
    },
    {
      id: 'guest', name: 'someone checking in', cloth: 2, skin: 0, hair: 3,
      // Owns nothing, notices nothing, and stands exactly where you want to
      // land. Every block needs one and this one needs it most: the cash drawer
      // is four metres from where he is leaning on the counter.
      pos: [-11.6, 0, -4.9], home: [-11.6, 0, -4.9],
      patrol: null, speed: 1.0, chaseSpeed: 3.0, viewDist: 3.0, viewCos: 0.8,
      guardRadius: 1.4, alertness: 0.2, oblivious: true, faces: [0, -1],
    },
    {
      id: 'crossing', name: 'someone crossing the lobby', cloth: 3, skin: 1, hair: 0,
      // A moving obstacle on the one route everybody uses. The lap is authored
      // round the fountain rather than through it — a patrol leg across the
      // water is a rule the audit enforces, and it should be.
      pos: [-14, 0, 6], home: [-14, 0, 6],
      patrol: [[-14, 6], [-2, 7], [8, 6.5], [15, 2], [9, -2], [-2, -3], [-12, -1]],
      speed: 2.0, chaseSpeed: 3.2, viewDist: 3.0, viewCos: 0.85,
      guardRadius: 1.5, alertness: 0.2, oblivious: true,
    },
    {
      id: 'housekeeper', name: 'housekeeping', cloth: 4, skin: 2, hair: 3,
      /**
       * The whole reason the mezzanine is not simply a safe room.
       *
       * The deal this block makes is that nobody can follow you up; the deal it
       * does not make is that up is free. She works the gallery on a lane in
       * front of her own cart, and the eight dollars on it is the second-largest
       * single pickup in the level.
       */
      pos: [-12.5, DECK.mezzanine, -8.4], home: [-12.5, DECK.mezzanine, -8.4],
      patrol: [[-16, -8.4], [8, -8.4]],
      speed: 1.25, chaseSpeed: 3.8, viewDist: 8.5, viewCos: 0.3,
      guardRadius: 3.4, alertness: 1.05,
    },
    {
      id: 'kid', name: 'the kid on the suitcase', cloth: 2, skin: 1, hair: 2,
      /**
       * On the family luggage in the middle of an open marble floor.
       *
       * Sitting is what identifies her, and a hotel lobby is the hardest place
       * in the game to defend that in — so she does not sit on any of the
       * furniture. A kid parked on the cases while the parents check in is the
       * single most recognisable thing that happens in a room like this, and it
       * reads from the back of the frame because nothing else in the block has
       * that shape.
       *
       * Facing away from the fountain, which puts the water behind her.
       */
      pos: [KID.x, 0.46, KID.z], home: [KID.x, 0.46, KID.z],
      patrol: null, speed: 0, chaseSpeed: 0, viewDist: 0, viewCos: 1,
      guardRadius: 0, alertness: 0,
      kid: true, small: true, sits: true,
      faces: [0.72, 0.69],
    },
  ];
}

/**
 * Two gulls, on the gallery.
 *
 * They got in the way the pigeons did, and they are here so that the one deck
 * nobody can follow you onto is not free either. On the *deck*, never on the
 * balustrade: a bird's y is authored and never integrated, so a gull put on a
 * 0.25 m rail walks calmly off it and hovers over the lobby — which is exactly
 * what the roofline's parapet did, reported from a playtest and now asserted.
 */
function gullPlacements() {
  return [{ x: 3, z: -8.6, y: DECK.mezzanine }, { x: 8.5, z: -9.0, y: DECK.mezzanine }];
}

/**
 * Lobby pigeons. There are seven of them and nobody can work out how they got
 * in, which is the joke and also the set piece: the concierge does not leave
 * his drawer for a crow, and he leaves it immediately for this.
 */
function pigeonPlacements() {
  return [
    { x: -6, z: 9 }, { x: 2, z: 10.5 }, { x: -12, z: 4 }, { x: 10, z: 3.5 },
    { x: -2, z: -4 }, { x: 14, z: 6 }, { x: -16, z: 1 },
  ];
}
