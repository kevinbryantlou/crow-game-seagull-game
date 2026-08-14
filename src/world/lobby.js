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
 * Which is why the nest is on the lobby clock in the middle of the room rather
 * than in a corner like every other block's. The safest place in the lobby is
 * also the most conspicuous, and every trip to bank anything is a flight
 * straight up through the centre of it in front of everybody.
 *
 * The sun still works indoors because there is, in the end, no ceiling at all
 * over the part of the room anybody plays in: a clerestory band from 6.6 m up
 * on all four sides, a plastered soffit over the back seven metres where the
 * gallery is, and the rest sectioned away like the near wall. The bars of light
 * across the marble come off the clerestory mullions on the west and back
 * walls, which is where the sun is — its azimuth swings from −118° to −138°
 * across a session, behind the block and to the west, all day. Nothing in
 * render/stage.js knows this level is an interior.
 * docs/lobby-brief.html §6.
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
 * `crown` is the top of the lobby clock, which is what the nest sits on. The
 * climb to it is broken in half by the moulded band at 3.3 — 3.3 m and then
 * 3.7, rather than 7 in one go. Both halves clear RULES.maxUnbrokenClimb on
 * their own several times over; the point is that you arrive at the bottom of
 * this one having just flown away from somebody.
 */
export const DECK = { floor: 0, mezzanine: 4.4, crown: 6.97 };
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
/**
 * The grand stair, named up here because the gallery's rail has to line its
 * opening up with it — and a rail that types those numbers in itself gets them
 * wrong, which it did, by 0.2 m one way and 0.8 m the other.
 */
const STAIR = { x: -19.9, w: 3.0, botZ: 2.6, topZ: -7.2, steps: 14 };

/**
 * The piano, its stool, and the one thing on this block that is not the point.
 *
 * The keyboard faces +z after the rotation, which is toward the camera — so the
 * pianist sits on the near side with her back to it, playing into the
 * instrument. That is the classic image and it is also the reason this is
 * allowed to exist at all: the kid's silhouette is *sitting*, and the game has
 * spent two blocks defending that. A second seated figure is a real cost, paid
 * down three ways — this one is full-size where the kid is 0.72, she is seen
 * from behind where the kid faces you, and she is at an instrument where the
 * kid is on her own luggage in the middle of an empty floor. See
 * docs/lobby-brief.html §12.
 */
const PIANO = { x: -6, z: 7, ry: 0.5 };
const STOOL = {
  x: PIANO.x + Math.sin(PIANO.ry) * 2.3,
  z: PIANO.z + Math.cos(PIANO.ry) * 2.3,
};

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
    const long = w > d;
    const glaze = long
      ? box(w, ROOF - SILL, d * 0.5, PAL.waterLit,
        { transparent: true, opacity: 0.24, shadow: false, receive: false })
      : box(w * 0.5, ROOF - SILL, d, PAL.waterLit,
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
     *
     * A mullion is thin in the wall's *long* direction and as deep as the wall
     * is thick. The first version had `w` and `d` the wrong way round on the two
     * short walls, which made every "mullion" on the west wall a **fourteen
     * metre slab** hanging over the room at 6.6 m — seven of them, in a row,
     * across the whole west end. It was reported from a playtest as bars
     * obscuring the staircase, which is exactly what it was. Swapping two
     * letters is the fix; the reason it survived the shipping pass is that
     * every automated check this block has looks at the floor.
     */
    for (let i = 1; mullions && i < (long ? Math.round(w / 3.2) : Math.round(d / 3.2)); i++) {
      const m = long
        ? box(0.14, ROOF - SILL, d * 0.6, PAL.steel, { shadow: false })
        : box(w * 0.6, ROOF - SILL, 0.14, PAL.steel, { shadow: false });
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
    for (const px of [-12, 2]) {
      night.addPool(root, px, -9.4, 5.4,
        { profile: 'stall', peak: 0.44, warm: 2.4, delay: 0.6, y: DECK.mezzanine });
    }

    /**
     * Over the front two thirds there is now *nothing at all*, and that is the
     * second thing this block learned the hard way.
     *
     * The lantern was already sectioned down to panes and two trusses, which
     * cleared the audit — and a playtest still read it as junk in the way. It
     * is worth being blunt about why: at 38° above a room, **everything you put
     * near the ceiling is between the camera and the floor**, and "between the
     * camera and a *pickup*" is only the part a test can see. Glass tints the
     * whole frame, a truss lays a bar across it, and neither is load-bearing
     * for anything a player is trying to do.
     *
     * So the roof is cut away exactly like the near wall, and what is left is
     * a cornice capping each wall head — at the edges of the frame, where the
     * room needs an edge and nobody is playing.
     */
    for (const [cx, cz, w, d] of [
      [-22.0, 0.9, 0.5, 25], [22.0, 0.9, 0.5, 25], [0, CEIL_TO, 44, 0.6],
    ]) {
      root.add(at(box(w, 0.44, d, PAL.steel, { up: PAL.silver, down: PAL.shade }), cx, ROOF - 0.2, cz));
    }
    // One collider, 44 wide. Wide on purpose: the audit probes every overhang
    // narrower than thirty metres from eight headings looking for the shove
    // bug, and a roof is not that shape of object.
    solid(0, 0.9, 44, 24.6, ROOF + 0.4, ROOF - 0.7, { perch: false });
  }

  // ── the front glass, and the section cut ──────────────────────────────────
  /**
   * The near wall is cut away, the way the roofline cuts away everything under
   * its terrace — and unlike the roofline, there is nothing standing at the cut.
   *
   * There was: a 1.2 m glass screen on a brass rail, so the room "stopped
   * somewhere". It stopped somewhere in two senses. The screen was perchable,
   * and the invisible frontage above it occupied the same footprint from 1.3 up
   * — so a crow that landed on the screen was standing inside the wall above it
   * and got resolved out through the **nearer face**, which on the near wall of
   * a room means *outside*. From there the map bounds thirteen metres up the
   * street held it, and it was stuck on the sidewalk with the lobby behind
   * glass. Reported from a playtest, and it is the crow's own lateral-collision
   * rule doing exactly what it is supposed to.
   *
   * One collider now, floor to roof, and **`perch: false`** — there is nothing
   * to stand on, so there is no way to be pushed off it. A brass threshold in
   * the floor marks the line, because a room still has to stop somewhere; it is
   * 12 cm tall, which is under the crow's 0.34 m scramble and reads as a
   * doorstep rather than a railing.
   */
  {
    const sill = box(44, 0.12, 0.5, PAL.gold, { up: PAL.goldLit, down: PAL.shade });
    sill.position.set(0, 0.06, 13.0);
    root.add(sill);
    solid(0, 13.0, 44, 0.5, ROOF, 0, { perch: false });
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
    // West to the wall, not to x = −20. The stair lands at x −21.4…−18.4 and the
    // gallery used to stop at −20, so the top step delivered you onto 1.6 m of
    // deck with a two-metre hole beside it.
    const slab = box(42, 0.4, 4.0, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
    slab.position.set(-1, DECK.mezzanine - 0.2, -9.2);
    root.add(slab);
    solid(-1, -9.2, 42, 4.0, DECK.mezzanine, DECK.mezzanine - 0.4);
    addDecal(-1, -9.2, 41.4, 3.6, PAL.stone, DECK.mezzanine);

    // The balustrade. Its top is at 5.3, which is the number that decides where
    // anything on this deck can be put: money at the back of the gallery clears
    // it on the way to the camera, money at the front does not.
    /**
     * And it stops short of the stair, which is the other half of that bug.
     *
     * An unbroken rail along the gallery edge is a 0.9 m wall standing across
     * the top step. Everything arriving on foot met it, and the only way on was
     * to fly — over a stair whose entire reason for existing is that you do not
     * have to. A staircase has an opening at its head; so does this one now.
     */
    /**
     * The opening is the stair's own width, and both edges are read off the
     * stair rather than typed in.
     *
     * They were typed in, and the numbers were 0.2 m and 0.8 m wrong in
     * opposite directions — so the west newel stood *on* the top step and the
     * gap ran 0.8 m past the east side of the stair into open gallery with no
     * rail on it. Neither is visible in the source, because the stair is
     * eighty lines further down the file and its width is a different literal.
     * A player walking up met a post; a player on the gallery could walk off a
     * railed edge that had a hole in it.
     */
    const caps = [];
    const gapW = STAIR.x - STAIR.w / 2 - 0.2;      // west edge of the opening
    const gapE = STAIR.x + STAIR.w / 2 + 0.2;      // east edge
    for (const [cx, w] of [
      [(-22 + gapW) / 2, gapW + 22],               // the stub west of the stair
      [(gapE + 20) / 2, 20 - gapE],                // and the long run east of it
    ]) {
      if (w < 0.2) continue;
      const b = box(w, 0.9, 0.25, PAL.stoneMid, { up: PAL.stone, down: PAL.shade });
      b.position.set(cx, DECK.mezzanine + 0.45, -7.32);
      root.add(b);
      solid(cx, -7.32, w, 0.25, DECK.mezzanine + 0.9, DECK.mezzanine);
      const cap = box(w, 0.1, 0.34, PAL.gold, { up: PAL.goldLit, down: PAL.shade });
      cap.position.set(cx, DECK.mezzanine + 0.92, -7.32);
      root.add(cap);
      caps.push(cap);
      for (let x = cx - w / 2 + 0.8; x < cx + w / 2 - 0.4; x += 1.6) {
        root.add(at(cyl(0.05, 0.05, 0.86, 5, PAL.gold, { up: PAL.goldLit, down: PAL.shade }),
          x, DECK.mezzanine + 0.43, -7.32));
      }
    }
    // A newel either side of the opening, so the gap reads as a stair head
    // rather than as a rail somebody forgot to finish.
    for (const nx of [gapW, gapE]) {
      root.add(at(box(0.28, 1.15, 0.28, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }),
        nx, DECK.mezzanine + 0.575, -7.32));
      root.add(at(ico(0.13, 0, PAL.gold, { shadow: false }), nx, DECK.mezzanine + 1.24, -7.32));
    }
    night.add(caps, PAL.gold, { peak: 0.42, warm: 3.0, delay: 1.4 });

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
    night.addPool(root, cx, cz + 0.6, 4.0, { profile: 'stall', peak: 0.4, warm: 2.2, delay: 0.5 });
  }

  /**
   * Wall washers under the gallery — five of them, and they used to be eight.
   *
   * **A pool's cost is its area; its brightness is nearly free.** Alpha is one
   * more term in a fragment shader that already runs, and every extra square
   * metre of quad is fill that has to be blended whether or not anything is
   * lit by it. So when this block turned out to be spending 38 ms a frame on
   * pools against the roofline's 6, the fix was not "fewer lights" — it was
   * smaller ones turned up. Radii came down about 15% and peaks went up about
   * the same, which is the same picture for two thirds of the fragments.
   *
   * Every pool peak on this block was retuned once, downward, and the reason is
   * worth recording: they were set while roughly half of the pool *area* was
   * being clipped away by the decal stack — see NightLights.POOL_LIFT. Tuning
   * brightness against a bug means the numbers are wrong the moment it is
   * fixed, and they were: the floor went to near-white cream. **Do not tune a
   * value against a frame you have not checked is drawing what you think it
   * is.**
   *
   * A forty-metre soffit casts a forty-metre shadow across the back of the
   * floor, and the answer is light on the ground rather than another pendant —
   * the park bought two points of median and lost four of 5th percentile by
   * adding one more lamppost. That lesson is about *columns*, though, and a
   * washer bolted to a wall has none: it is pure pool. Which is the reason this
   * block can carry roughly twice the fixture count of any outdoor one without
   * paying for it. An interior at six in the evening has its lights on; the
   * three blocks before this were lit by a sky.
   */
  for (const wx of [-17, -10, -3, 4, 12]) {
    const w = box(0.5, 0.22, 0.3, PAL.goldLit, { shadow: false });
    w.position.set(wx, 3.5, -7.05);
    root.add(w);
    night.add(w, PAL.goldLit, { peak: 0.85, warm: 2.6, delay: 0.9 });
    night.addPool(root, wx, -5.6, 5.6, { profile: 'stall', peak: 0.58, warm: 2.6, delay: 0.9 });
  }

  /**
   * Uplights at the foot of the columns — the fixtures stayed, the pools went.
   *
   * There were seven, each with a 4.6 m pool, and together they were 590 square
   * metres of additive quad in a room of 1080. A pool is pure fill and pools
   * overlap, so the cost of light on this block scales with *area*, not with
   * fixture count — and these seven were the worst ratio of the lot: they sat
   * under the gallery washers, adding almost nothing a frame could show.
   *
   * The little brass discs are still there and still come on, because an
   * emissive is a constant in a shader that already runs and costs nothing.
   * What they no longer do is paint the floor twice.
   */
  const ups = [];
  for (const [ux, uz] of [[-16, -7.6], [-8, -7.6], [0, -7.6], [8, -7.6], [16, -7.6], [-9, 3], [9, 3]]) {
    const u = cyl(0.2, 0.24, 0.07, 8, PAL.goldLit, { shadow: false });
    u.position.set(ux, 0.035, uz + 0.7);
    root.add(u);
    ups.push(u);
  }
  night.add(ups, PAL.goldLit, { peak: 0.7, warm: 3.0, delay: 1.2 });

  // ── the grand stair, against the west wall ────────────────────────────────
  /**
   * Fourteen steps, and every one of them shallow enough to walk up.
   *
   * It was four stacked slabs with 1.1 m risers and a rail floating diagonally
   * through the middle of them, and a playtest called it buggy from three
   * directions at once — the crow appeared to clip through it, bits of
   * balustrade stuck out of the treads, and the top did not meet the gallery.
   * Only the last of those was a collision problem. The other two were the
   * *drawing*: a 1.1 m riser is not a step, it is a wall you can stand on top
   * of, so walking into one and rising over it looks exactly like passing
   * through it; and a straight rail laid over a four-slab staircase crosses the
   * treads because the staircase has no consistent slope to follow.
   *
   * A riser of 0.314 m is under the crow's 0.34 m scramble, so this is now a
   * staircase a bird can walk up rather than a stack it has to flap over — and
   * it is under a walker's 0.45 m step, so the bottom of it is not a wall to a
   * person either. The rail is generated from the step tops rather than laid
   * across them, which is the only way it can be right for a shape that
   * changed once and will change again.
   */
  {
    const STEPS = STAIR.steps;
    const TOP_Z = STAIR.topZ, BOT_Z = STAIR.botZ;   // meets the gallery, and the floor
    const run = (BOT_Z - TOP_Z) / STEPS;      // 0.7 m of tread per step
    const rise = DECK.mezzanine / STEPS;      // 0.314 m — under a 0.34 scramble
    for (let i = 0; i < STEPS; i++) {
      const top = rise * (i + 1);
      const cz = BOT_Z - run * (i + 0.5);
      // Each step is solid to the floor, so none of them is an overhang and
      // none of them can shove anything sideways.
      const b = box(STAIR.w, top, run + 0.02, PAL.stone, { up: PAL.stone, down: PAL.shade });
      b.position.set(STAIR.x, top / 2, cz);
      root.add(b);
      solid(STAIR.x, cz, STAIR.w, run + 0.02, top);
      if (i % 4 === 3) perch(STAIR.x, top, cz);
      // The balustrade, one post per pair of steps, standing *on* the step it
      // belongs to. Read off the same two numbers as the geometry.
      if (i % 2 === 1) {
        root.add(at(cyl(0.05, 0.05, 0.92, 5, PAL.gold, { up: PAL.goldLit, down: PAL.shade }),
          STAIR.x + STAIR.w / 2 - 0.1, top + 0.46, cz));
        const seg = box(0.09, 0.09, run * 2.1, PAL.gold, { up: PAL.goldLit, down: PAL.shade });
        seg.position.set(STAIR.x + STAIR.w / 2 - 0.1, top + 0.95, cz + run * 0.5);
        seg.rotation.x = Math.atan2(rise * 2, run * 2);
        root.add(seg);
      }
    }
    // A newel at the foot, matching the pair at the head.
    root.add(at(box(0.28, 1.15, 0.28, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }),
      STAIR.x + STAIR.w / 2 - 0.1, 0.575, BOT_Z - 0.2));
    root.add(at(ico(0.13, 0, PAL.gold, { shadow: false }), STAIR.x + STAIR.w / 2 - 0.1, 1.24, BOT_Z - 0.2));
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
  night.add(POOL.water, PAL.water, { peak: 0.18, warm: 5.0, delay: 1.8 });
  night.addPool(root, POOL_SPEC.x, POOL_SPEC.z, 6.0,
    { profile: 'stall', peak: 0.3, warm: 5.0, delay: 1.8 });

  // ══════════════════════════════════════════════════════════════════════════
  // THE LOBBY CLOCK — a landmark that stands on the floor, and the nest on it
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * This was a chandelier, and losing it is the price of losing the ceiling.
   *
   * A hanging fitting is the better object — the dusk frame it made was the best
   * picture this block has ever produced — but it needs something overhead to
   * hang from, and every candidate for that turned out to be a bar across the
   * camera. A chain rising into a ceiling that is not drawn is the same problem
   * wearing a disguise: it either ends in mid-air or it goes out of frame, and
   * both read as unfinished.
   *
   * So the thing the nest sits on now stands on the floor. It is a lobby clock,
   * which is the one landmark a hotel of this vintage certainly has, and it
   * keeps everything the chandelier was carrying:
   *
   *   - It is on the room's centre line, so banking is still a flight up
   *     through the middle of the lobby in front of everybody. That sentence is
   *     the level, and it survives the change intact.
   *   - Its crown is an open brass lantern — the chandelier's corona, moved
   *     down and given a pedestal — so the block still has one thing that comes
   *     on at dusk and owns the middle of the frame.
   *   - Its cornice is 3.2 m across against a 1.5 m twig ring, which is
   *     RULES.nestPlatformRatio with room to spare.
   *   - The moulded band at 3.3 breaks the climb in half, so it is 3.3 m and
   *     then 3.7 rather than 7 in one go.
   *
   * It stands *north of* the fountain rather than in it. A centrepiece in the
   * basin was the obvious reading of "ornamental fountain feature" and it is a
   * trap twice over: the audit forbids building inside the water, and the
   * escape test drops a crow at the exact middle of the basin and requires it
   * to get out — which a stem standing there would prevent. 5.2 m north puts it
   * clear of the coping by half a metre and still dead centre in x.
   */
  const CLOCK = { x: 2, z: -3.2 };
  const NEST = { x: CLOCK.x, y: DECK.crown, z: CLOCK.z };
  {
    const g = new THREE.Group();
    const bulbs = [];

    // Plinth, shaft, and the moulded band that halves the climb.
    g.add(at(box(2.8, 0.5, 2.8, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, 0.25, 0));
    g.add(at(box(2.4, 0.22, 2.4, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 0.61, 0));
    // 2.56 rather than 2.6, so the shaft's top lands *inside* the band above it
    // instead of exactly on the band's own top face. Both were at 3.30 — two
    // coplanar faces over 3.4 m², on the one object in this room a crow lands on
    // to bank. Found by the audit rule the wharf's flickering wheelhouse earned.
    g.add(at(cyl(0.78, 0.92, 2.56, 8, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 1.98, 0));
    g.add(at(cyl(1.15, 1.15, 0.28, 8, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, 3.16, 0));
    g.add(at(cyl(0.7, 0.78, 1.6, 8, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 4.1, 0));

    /**
     * The clock stage, and only two faces on it.
     *
     * A real one has four and this camera can see two, and the two it cannot
     * see are forty triangles apiece of nothing. The faces are the level's one
     * joke about its own sun dial: the block is timed, and there is a clock in
     * the middle of it that the player will never once read.
     */
    g.add(at(box(1.9, 1.5, 1.9, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, 5.65, 0));
    const faces = [];
    for (const ry of [0, Math.PI / 2]) {
      // One group per face, rotated as a unit. Rotating the dial, the bezel and
      // two hands independently is four chances to get an Euler order wrong,
      // and the first attempt got the side face pointing at the floor.
      const f = new THREE.Group();
      const dial = cyl(0.62, 0.62, 0.05, 14, PAL.shiny, { up: PAL.shiny, down: PAL.silver, shadow: false });
      dial.rotation.x = Math.PI / 2;
      f.add(dial);
      faces.push(dial);
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.075, 4, 14), mat(PAL.gold));
      f.add(bezel);
      // Ten past ten, because that is what a clock in a photograph always says.
      for (const [len, ang] of [[0.44, 2.16], [0.3, 0.87]]) {
        const h = box(len, 0.055, 0.03, PAL.feather, { shadow: false });
        h.position.set(Math.cos(ang) * len / 2, Math.sin(ang) * len / 2, 0.04);
        h.rotation.z = ang;
        f.add(h);
      }
      f.position.set(ry ? 0.99 : 0, 5.65, ry ? 0 : 0.99);
      f.rotation.y = ry;
      g.add(f);
    }
    night.add(faces, 0xf2e0b0, { peak: 0.85, warm: 2.6, delay: 0.9 });

    // The cornice, which is the landing surface.
    g.add(at(box(2.9, 0.24, 2.9, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 6.52, 0));
    g.add(at(box(3.2, 0.22, 3.2, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, 6.75, 0));

    /**
     * The lantern crown — the chandelier's corona, kept whole.
     *
     * A thin pale pan, a brass rim, spokes to a hub, candles standing on the
     * rim and drops hanging off the edge. It photographed as a wedding cake in
     * wood before it was any of those things; what says *light fitting* from a
     * camera looking down at 38° is a wheel, not a disc.
     */
    const corona = (y, r, candles, spokes) => {
      // A ring rather than a disc: the middle of the crown belongs to the nest,
      // and a pale plate under dark twigs is the one background that makes them
      // hard to pick out.
      const band = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.42, r, 16).rotateX(-Math.PI / 2),
        mat(PAL.shiny, { side: THREE.DoubleSide }),
      );
      band.position.y = y;
      g.add(band);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 4, 16), mat(PAL.gold));
      lip.rotation.x = Math.PI / 2;
      lip.position.y = y + 0.03;
      g.add(lip);
      /**
       * Spokes from the rim *inward*, and stopping well short of the middle.
       *
       * They ran hub-to-rim at first, which is how a wheel is built and which
       * laid eight brass bars straight across the nest — a pie chart with a
       * crow's nest under it. **Nothing overlaps the nest**, ever: it is the one
       * object on a block whose whole job is to be read at a glance, from the
       * far side of the room, while something is chasing you. `audit-level.mjs`
       * asserts it now rather than leaving it to whoever builds the fifth block.
       */
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        const len = r - 1.02;
        const arm = box(len, 0.05, 0.05, PAL.gold, { shadow: false });
        arm.position.set(Math.cos(a) * (r - len / 2), y + 0.06, Math.sin(a) * (r - len / 2));
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
        if (i % 2 === 0) {
          g.add(at(ico(0.06, 0, PAL.shiny, { shadow: false }), cx, y - 0.16, cz));
        }
      }
    };
    corona(DECK.crown, 1.5, 12, 8);
    night.add(bulbs, PAL.goldLit, { peak: 1.0, warm: 2.0, delay: 0.15 });
    // The room's event. Everything else on this block catches after it.
    // Centred between the clock and the fountain rather than on the clock, so
    // the pool covers the open floor everybody has to cross rather than the one
    // object nobody stands next to.
    night.addPool(root, CLOCK.x, CLOCK.z + 4.4, 8.6,
      { profile: 'stall', peak: 0.58, warm: 2.0, delay: 0.15 });

    const nest = makeNest();
    nest.position.y = DECK.crown + 0.04;
    g.add(nest);
    root.userData.nestGroup = nest;

    g.position.set(CLOCK.x, 0, CLOCK.z);
    root.add(g);

    // Three colliders, one per stage, so the outline is what the eye sees. The
    // shaft is the only one with air under it, and it is under two metres tall,
    // so the audit will fly a crow at it from eight headings looking for the
    // shove bug.
    solid(CLOCK.x, CLOCK.z, 2.8, 2.8, 0.72);
    solid(CLOCK.x, CLOCK.z, 2.3, 2.3, 3.44, 3.02);
    solid(CLOCK.x, CLOCK.z, 3.2, 3.2, DECK.crown, DECK.crown - 0.36);
    perch(CLOCK.x, 0.72, CLOCK.z);
    perch(CLOCK.x, 3.44, CLOCK.z);
    perch(CLOCK.x, DECK.crown, CLOCK.z);
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
    night.addPool(root, DESK.x, DESK.z + 1.2, 7.0,
      { profile: 'stall', peak: 0.6, warm: 1.8, delay: 0.7 });

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
    night.addPool(root, BAR.x, BAR.z + 1.2, 6.2,
      { profile: 'stall', peak: 0.58, warm: 2.8, delay: 1.1 });

    // Three pendants over the counter. They hang from nothing, and at 2.6 m
    // that is fine — the eye reads a lamp on a short drop as hung off something
    // out of shot, which is not true of a three-metre chandelier in the middle
    // of a room. Kept low enough to sit under every sightline the bar has.
    const pend = [];
    for (const px of [-2.6, 0, 2.6]) {
      const sh = cone(0.26, 0.3, 8, PAL.gold, { up: PAL.goldLit, down: PAL.goldLit, shadow: false });
      sh.rotation.z = Math.PI;
      sh.position.set(BAR.x + px, 2.42, BAR.z - 0.1);
      root.add(sh);
      root.add(at(cyl(0.02, 0.02, 0.5, 4, PAL.gold, { shadow: false }), BAR.x + px, 2.75, BAR.z - 0.1));
      pend.push(sh);
    }
    night.add(pend, PAL.goldLit, { peak: 0.95, warm: 2.2, delay: 0.5 });

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
      night.add(shade, PAL.goldLit, { peak: 0.95, warm: 2.2, delay: 0.35 });
      night.addPool(root, lx, lz, 6.0, { profile: 'stall', peak: 0.6, warm: 2.2, delay: 0.35 });
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
  /**
   * The entrance, third attempt.
   *
   * A revolving door failed twice — as a glazed drum it read as a teal barrel,
   * as an open brass frame it read as a café table — because a revolving door
   * is a hole in a wall and this block has no near wall. What replaced it was a
   * rope line and a lamp, and that failed for a smaller reason: **four posts
   * and two ropes at this distance are six thin sticks**, and a rope slung
   * between two of them at an angle reads as a red stick that missed.
   *
   * The version that works stops trying to draw a barrier and draws the two
   * things a hotel entrance actually has at ankle and eye height: a *mat*, wide
   * enough to read as one, and a pair of urns flanking it. Both are objects
   * with mass. Neither is taller than a person, so the near edge of the room
   * stays clear.
   */
  {
    addDecal(DOOR.x, DOOR.z - 0.2, 6.2, 3.4, PAL.gold);
    addDecal(DOOR.x, DOOR.z - 0.2, 5.6, 2.8, PAL.terracotta);
    addDecal(DOOR.x, DOOR.z - 0.2, 4.4, 1.9, PAL.terracottaLit);

    // The urns. Kit planters, which is what they are — and the only greenery at
    // this end of a room whose other three quarters all have some.
    for (const ux of [-2.9, 2.9]) {
      const urn = addPlanter(DOOR.x + ux, DOOR.z - 0.2, 0, { w: 1.2 });
      urn.add(at(cyl(0.72, 0.5, 0.24, 10, PAL.stoneMid, { up: PAL.stone, down: PAL.shade }), 0, 0.82, 0));
    }

    /**
     * The lamp standard, and the block's first light.
     *
     * It catches at delay 0 with the stutter, before anything else in the room —
     * the entrance goes, then the desk, then the clock. Smoke asserts that some
     * light on every block flickers from a standing start, which is the only
     * reason that schedule is worth writing down.
     */
    const post = new THREE.Group();
    post.add(at(cyl(0.3, 0.36, 0.1, 8, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), 0, 0.05, 0));
    post.add(at(cyl(0.06, 0.075, 2.3, 6, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), 0, 1.2, 0));
    // A lantern, which is glass panels in a brass cage rather than a box on a
    // stick — the box on a stick read as a birdhouse.
    const lantern = at(box(0.34, 0.46, 0.34, PAL.goldLit, { shadow: false }), 0, 2.55, 0);
    lantern.material = mat(PAL.goldLit);
    post.add(lantern);
    for (const [ex, ez] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
      post.add(at(cyl(0.03, 0.03, 0.5, 4, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), ex, 2.55, ez));
    }
    post.add(at(cone(0.32, 0.24, 4, PAL.gold, { up: PAL.goldLit, down: PAL.shade }), 0, 2.9, 0));
    post.add(at(ico(0.07, 0, PAL.gold, { shadow: false }), 0, 3.08, 0));
    post.position.set(DOOR.x + 4.4, 0, DOOR.z - 0.6);
    root.add(post);
    solid(DOOR.x + 4.4, DOOR.z - 0.6, 0.7, 0.7, 2.8);
    night.add(lantern, PAL.goldLit, { peak: 1.0, warm: 1.6, delay: 0, flicker: true });
    night.addPool(root, DOOR.x + 1.4, DOOR.z - 0.6, 6.2,
      { profile: 'stall', peak: 0.58, warm: 1.6, delay: 0, flicker: true });
  }

  /**
   * A pair of sconces on the west wall, over the stair and the bell cart.
   *
   * They existed, and then they did not: the entrance rewrite replaced a span
   * of this file that happened to have them in the middle of it, and nothing
   * noticed for two rounds because a missing light is not a failing check — it
   * is three points of 5th percentile spread over a quarter of the room.
   */
  for (const sz of [-1.0, 6.0]) {
    const sc = box(0.16, 0.5, 0.34, PAL.goldLit, { shadow: false });
    sc.position.set(-21.7, 3.1, sz);
    root.add(sc);
    night.add(sc, PAL.goldLit, { peak: 0.85, warm: 2.4, delay: 0.8 });
    night.addPool(root, -20.4, sz, 5.0, { profile: 'stall', peak: 0.48, warm: 2.4, delay: 0.8 });
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
    g.position.set(PIANO.x, 0, PIANO.z);
    g.rotation.y = PIANO.ry;
    root.add(g);
    solid(PIANO.x, PIANO.z, 2.4, 2.6, 1.0);
    perch(PIANO.x, 1.0, PIANO.z);

    // The stool, on the keyboard side. It is what the pianist is sitting on,
    // so it is also what the "everyone is standing on a deck that exists" rule
    // measures her against — 0.5 is her `pos[1]`.
    const st = new THREE.Group();
    st.add(at(box(1.0, 0.1, 0.42, PAL.bark, { up: PAL.bark, down: PAL.barkShade }), 0, 0.45, 0));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      st.add(at(cyl(0.04, 0.04, 0.45, 4, PAL.barkShade), sx * 0.42, 0.225, sz * 0.15));
    }
    st.position.set(STOOL.x, 0, STOOL.z);
    st.rotation.y = PIANO.ry;
    root.add(st);
    solid(STOOL.x, STOOL.z, 1.0, 0.5, 0.5);
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
    /** Where the easter egg lives. `main.js` looks for a human with this id. */
    pianist: 'pianist',
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
      id: 'pianist', name: 'the pianist', cloth: 1, skin: 3, hair: 0,
      /**
       * Owns nothing, guards nothing, notices nothing, and is worth no money.
       *
       * She is the block's easter egg: bring her a coin instead of banking it
       * and she plays for a quarter of a minute. Nothing advertises her — no
       * teaching toast, no task — because the whole pleasure of the thing is
       * that a player who has spent four blocks learning that money goes in the
       * nest tries the one other thing you can do with it.
       */
      pos: [STOOL.x, 0.5, STOOL.z], home: [STOOL.x, 0.5, STOOL.z],
      patrol: null, speed: 0, chaseSpeed: 0, viewDist: 0, viewCos: 1,
      guardRadius: 0, alertness: 0,
      sits: true, oblivious: true,
      // Facing into the piano, which puts her back to the camera.
      faces: [-Math.sin(PIANO.ry), -Math.cos(PIANO.ry)],
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
