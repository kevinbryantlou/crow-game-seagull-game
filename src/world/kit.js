/**
 * The prop kit — the parts both blocks are built from.
 *
 * These all lived inside world/level.js while there was one level. They are the
 * same functions with the same numbers; what has changed is that they now take a
 * context (where to add the mesh, where to file the collider) instead of closing
 * over one level's arrays, and most of them take a `y` so a bench can stand on a
 * roof terrace as readily as on paving.
 *
 * The rule for what belongs here: anything a second block would otherwise
 * copy-paste. A café table is kit. A war memorial with a nest on it is not.
 */

import * as THREE from 'three';
import { PAL } from '../render/palette.js';
import { box, cyl, cone, ico, plane, at, mat } from '../render/shapes.js';

/**
 * Bind the kit to one level under construction.
 *
 * @param {object} ctx  { root, colliders, perches, occluders, night }
 */
export function makeKit(ctx) {
  const { root, colliders, perches, occluders, night } = ctx;

  /** Axis-aligned solid. `top` is landable; `bottom` lets the crow fly underneath. */
  const solid = (x, z, w, d, top, bottom = 0, opts = {}) => {
    colliders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
      top, bottom, perch: opts.perch !== false,
      tag: opts.tag || null,
      /**
       * Declares that this thing is allowed to stand in the water.
       *
       * Only the wharf sets it. The audit's rule used to be "nothing is built
       * inside the water" full stop, which is right for an ornamental basin and
       * impossible for a harbour with a pier in it — so the exemption has to be
       * typed out per collider and gets printed back by name. It has to be
       * copied through here, which is the bit that was missed first time: the
       * level said `inWater: true` thirteen times and `solid()` quietly dropped
       * every one of them, so the audit reported thirteen undeclared structures
       * standing in water that had all been declared.
       */
      inWater: opts.inWater === true,
    });
  };

  /**
   * A hollow circular wall — the plaza fountain, and the terrace plunge pool.
   * `minX`…`maxZ` are the ring's bounding square, so code that only wants rough
   * bounds still has them; anything that cares tests `shape === 'ring'`.
   * See world/collide.js.
   */
  const ring = (cx, cz, rInner, rOuter, top, opts = {}) => {
    colliders.push({
      shape: 'ring', cx, cz, rInner, rOuter,
      minX: cx - rOuter, maxX: cx + rOuter,
      minZ: cz - rOuter, maxZ: cz + rOuter,
      top, bottom: opts.bottom ?? 0, perch: opts.perch !== false,
      tag: opts.tag || null,
    });
  };

  const perch = (x, y, z) => { perches.push({ x, y, z }); };

  /**
   * A flat patch lying on a surface: paving variation, a road, a deck top.
   *
   * Every one gets its own height, four millimetres apart, in the order it was
   * added. That is the whole point of this existing.
   *
   * The paving slabs used to sit at a shared y = 0.012, and three of them
   * overlapped: a 64 × 4 strip along the building crossed both of the big ones.
   * Two decals at *identical* depth is not a near miss, it is a coin flip per
   * pixel, and it rendered as a staircase along the whole frontage that got
   * reported three times as textures clipping through each other.
   *
   * `polygonOffset` — which these also carry, and which is the right tool
   * against the ground *underneath* them — cannot help with that, because it
   * gives every decal the same nudge and leaves them exactly as coplanar with
   * each other as they were. Depth precision at fifty metres is a fraction of a
   * millimetre; four is plenty. The stack is invisible and the fight is over.
   */
  let decalIndex = 0;
  const addDecal = (x, z, w, d, colour, base = 0) => {
    const m = plane(w, d, colour, { receive: true, decal: true });
    m.position.set(x, base + 0.012 + decalIndex * 0.004, z);
    decalIndex++;
    root.add(m);
    return m;
  };

  // ── planting ──────────────────────────────────────────────────────────────
  const addTree = (x, z, scale = 1, opts = {}) => {
    const g = new THREE.Group();
    const trunkH = 3.0 * scale;
    g.add(at(cyl(0.18 * scale, 0.3 * scale, trunkH, 6, PAL.bark, { up: PAL.bark, down: PAL.barkShade }), 0, trunkH / 2, 0));
    const blobs = [[0, trunkH + 0.7, 0, 1.7], [0.9, trunkH + 0.25, 0.4, 1.2], [-0.8, trunkH + 0.4, -0.5, 1.25], [0.2, trunkH + 1.5, -0.3, 1.05]];
    for (const [bxx, by, bz, r] of blobs) {
      const b = ico(r * scale, 0, PAL.canopy, { up: PAL.canopyLit, down: PAL.canopyShade });
      b.position.set(bxx * scale, by * scale, bz * scale);
      b.rotation.set(Math.random(), Math.random(), Math.random());
      g.add(b);
    }
    g.position.set(x, 0, z);
    root.add(g);
    solid(x, z, 0.6, 0.6, trunkH);
    solid(x, z, 2.8, 2.8, (trunkH + 1.9) * scale, (trunkH + 0.6) * scale);
    perch(x, (trunkH + 2.0) * scale, z);
    if (opts.occlude) occluders.push(...g.children);
    return g;
  };

  const addPlanter = (x, z, y = 0, opts = {}) => {
    const w = opts.w ?? 1.8;
    const g = new THREE.Group();
    g.add(at(box(w, 0.7, w, PAL.terracotta, { up: PAL.terracottaLit, down: PAL.shade }), 0, 0.35, 0));
    for (let i = 0; i < 4; i++) {
      const b = ico(0.42, 0, PAL.canopy, { up: PAL.canopyLit, down: PAL.canopyShade });
      b.position.set((Math.random() - 0.5) * (w * 0.62), 0.85 + Math.random() * 0.2, (Math.random() - 0.5) * (w * 0.62));
      g.add(b);
    }
    g.position.set(x, y, z);
    root.add(g);
    solid(x, z, w, w, y + 0.7, y);
    return g;
  };

  // ── street furniture ──────────────────────────────────────────────────────
  const addBench = (x, z, ry = 0, y = 0) => {
    const g = new THREE.Group();
    g.add(at(box(2.6, 0.12, 0.62, PAL.bark, { up: PAL.bark, down: PAL.barkShade }), 0, 0.55, 0));
    g.add(at(box(2.6, 0.5, 0.1, PAL.bark, { up: PAL.bark, down: PAL.barkShade }), 0, 0.86, -0.28));
    for (const s of [-1, 1]) {
      g.add(at(box(0.14, 0.55, 0.5, PAL.steelDark), s * 1.1, 0.28, 0));
    }
    g.position.set(x, y, z);
    g.rotation.y = ry;
    root.add(g);
    solid(x, z, ry ? 0.9 : 2.7, ry ? 2.7 : 0.9, y + 0.67, y);
    perch(x, y + 0.67, z);
    return g;
  };

  let lampIndex = 0;
  const addLamp = (x, z, y = 0) => {
    const g = new THREE.Group();
    g.add(at(cyl(0.09, 0.13, 4.6, 6, PAL.steel, { up: PAL.steel, down: PAL.steelDark }), 0, 2.3, 0));
    g.add(at(box(0.5, 0.14, 0.5, PAL.steelDark), 0, 0.07, 0));
    g.add(at(cyl(0.34, 0.16, 0.5, 6, PAL.steelDark, { up: PAL.steel }), 0, 4.75, 0));
    const bulb = at(ico(0.22, 0, PAL.goldLit, { shadow: false }), 0, 4.52, 0);
    bulb.material = mat(PAL.goldLit);
    g.add(bulb);
    // Each lamp on its own clone and its own clock. They catch a beat apart,
    // which is the difference between a light switch and a street waking up.
    night.add(bulb, PAL.goldLit, { peak: 1.0, delay: lampIndex * 0.45, warm: 1.6, flicker: true });
    night.addPool(root, x, z, 5.2, { peak: 0.68, delay: lampIndex * 0.45, warm: 1.6, flicker: true, y });
    lampIndex++;
    g.position.set(x, y, z);
    root.add(g);
    solid(x, z, 0.3, 0.3, y + 4.6, y);
    perch(x, y + 5.0, z);
    return g;
  };

  const addBin = (x, z, colour = PAL.steelDark, y = 0) => {
    const g = new THREE.Group();
    g.add(at(cyl(0.62, 0.55, 1.5, 8, colour, { up: PAL.steel, down: PAL.shade }), 0, 0.75, 0));
    g.add(at(cyl(0.68, 0.68, 0.12, 8, PAL.steelDark, { up: PAL.steel }), 0, 1.56, 0));
    g.position.set(x, y, z);
    root.add(g);
    solid(x, z, 1.3, 1.3, y + 1.62, y);
    perch(x, y + 1.62, z);
    return g;
  };

  /**
   * A round café table with two chairs. Returns the top's world position,
   * because what a level actually wants from a table is somewhere to put money.
   */
  const addTable = (x, z, y = 0, opts = {}) => {
    const g = new THREE.Group();
    g.add(at(cyl(0.06, 0.28, 0.72, 8, PAL.steelDark, { up: PAL.steel }), 0, 0.36, 0));
    g.add(at(cyl(0.62, 0.62, 0.09, 12, PAL.stone, { up: PAL.stone, down: PAL.shade }), 0, 0.76, 0));
    const chair = opts.chair ?? PAL.awning;
    const chairLit = opts.chairLit ?? PAL.awningLit;
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + 0.6;
      const ch = new THREE.Group();
      ch.add(at(box(0.5, 0.07, 0.5, chair, { up: chairLit, down: PAL.shade }), 0, 0.44, 0));
      ch.add(at(box(0.5, 0.55, 0.06, chair, { up: chairLit, down: PAL.shade }), 0, 0.72, -0.22));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ch.add(at(box(0.05, 0.44, 0.05, PAL.steelDark), sx * 0.2, 0.22, sz * 0.2));
      }
      ch.position.set(Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05);
      ch.rotation.y = -a + Math.PI / 2;
      g.add(ch);
    }
    g.position.set(x, y, z);
    root.add(g);
    solid(x, z, 1.24, 1.24, y + 0.81, y + 0.66);
    solid(x, z, 0.5, 0.5, y + 0.66, y);
    perch(x, y + 0.81, z);
    return { group: g, top: { x, y: y + 0.81, z } };
  };

  /**
   * The city behind the block. One material, one schedule, randomised windows —
   * the foreground lamps are the event, the skyline is the weather behind it.
   *
   * **It casts no shadow, and that is the point of this comment.**
   *
   * It used to. A thirty-metre tower sixteen metres behind a block, lit by a sun
   * whose elevation drops to 0.06, throws a shadow the length of the map — and
   * the shadow camera is ±34 m around the crow, so the tower is inside it. On
   * the three outdoor blocks that reads as a slightly darker dusk and nobody
   * ever questioned it. On the lobby it was a hard-edged black wedge lying
   * across half the floor: an interior whose back wall is 6.6 m with clear
   * glazing above it lets the whole skyline rake straight in over the top.
   * Reported from a playtest as "the background buildings are causing odd
   * lighting", which was exactly right.
   *
   * Nobody has ever placed one of these to shade anything — they are weather.
   * And switching it off can only *raise* luminance, while every dusk rule in
   * the game is a floor, so no block can fail because of it. That asymmetry is
   * why this is safe to change for all four at once rather than opting the new
   * one out.
   *
   * @returns {number} the depth (z) the wall of buildings occupies
   */
  const addSkyline = (bands, z = -24, opts = {}) => {
    let bx = opts.startX ?? -46;
    const lit = [];
    for (const [w, h, c] of bands) {
      const b = box(w, h, 12, c, { up: PAL.stone, down: PAL.shade, receive: false, shadow: false });
      b.position.set(bx + w / 2, h / 2, z);
      root.add(b);
      // Windows: a grid of small dark quads, cheap and enough at this distance.
      const cols = Math.floor(w / 3), rows = Math.floor(h / 3.4);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (Math.random() < 0.22) continue;
          const isLit = Math.random() < 0.3;
          const win = box(1.5, 1.9, 0.2, isLit ? PAL.goldLit : PAL.shade, { shadow: false, receive: false });
          win.position.set(bx + 2 + i * 3, 2.4 + j * 3.4, z + 5.95);
          root.add(win);
          if (isLit) lit.push(win);
        }
      }
      bx += w + 1.5;
    }
    night.add(lit, PAL.goldLit, { peak: 0.75, warm: 6.0, delay: 0.2 });
    return lit;
  };

  /**
   * A nest: a ring of twigs. Every block needs one and it is the same nest.
   * Returns the twig group, which is what banked money gets parented to.
   */
  const makeNest = () => {
    const nest = new THREE.Group();
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
      const r = 0.62 + Math.random() * 0.12;
      const twig = box(0.5 + Math.random() * 0.35, 0.07, 0.07, i % 3 ? PAL.bark : PAL.barkShade);
      twig.position.set(Math.cos(a) * r, 0.06 + (i % 3) * 0.07, Math.sin(a) * r);
      twig.rotation.y = -a + Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      twig.rotation.z = (Math.random() - 0.5) * 0.3;
      nest.add(twig);
    }
    return nest;
  };

  /**
   * A body of still water in a ring of stone. The plaza fountain and the roof
   * terrace's plunge pool are the same object with different numbers and a
   * different story, so it is built once.
   *
   * `deck` is the level the surrounding floor sits at; every other height is
   * measured from it, which is the only reason a pool can be on a roof at all.
   *
   * @returns {{ group, water, spec }} `spec` is what the crow reads as `world.fountain`
   */
  const addPool = (cx, cz, r, deck = 0, opts = {}) => {
    const rimH = opts.rim ?? 0.62;
    const SEG = 20;
    const RI = r - 0.6;
    const spec = { x: cx, z: cz, r, rim: deck + rimH, floor: deck + 0.06 };

    const g = new THREE.Group();
    // The basin has to be genuinely hollow — a solid cylinder would cap the
    // interior and hide both the water and the coins the player dives for.
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(r + 0.3, r + 0.3, rimH, SEG, 1, true),
      mat(opts.stone ?? PAL.stoneMid, { side: THREE.DoubleSide }),
    );
    wall.position.y = rimH / 2;
    wall.castShadow = true; wall.receiveShadow = true;
    g.add(wall);

    const innerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(RI, RI, rimH, SEG, 1, true),
      mat(opts.lining ?? PAL.pavingMid, { side: THREE.DoubleSide }),
    );
    innerWall.position.y = rimH / 2;
    innerWall.receiveShadow = true;
    g.add(innerWall);

    const rimTop = new THREE.Mesh(
      new THREE.RingGeometry(RI, r + 0.3, SEG).rotateX(-Math.PI / 2),
      mat(opts.coping ?? PAL.stone),
    );
    rimTop.position.y = rimH;
    rimTop.receiveShadow = true;
    g.add(rimTop);

    const basinFloor = new THREE.Mesh(
      new THREE.CircleGeometry(RI, SEG).rotateX(-Math.PI / 2),
      mat(opts.lining ?? PAL.stoneMid),
    );
    basinFloor.position.y = 0.06;
    basinFloor.receiveShadow = true;
    g.add(basinFloor);

    // Sits well below the rim, so the coins on the floor read through it.
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(RI - 0.03, SEG).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({
        color: PAL.water, transparent: true, opacity: 0.62, flatShading: true,
      }),
    );
    /**
     * What the per-frame shimmer in main.js oscillates *around*.
     *
     * It used to be a literal 0.80 in the frame loop, which was fine while every
     * block's water was an ornamental basin and wrong the moment one of them was
     * a harbour built at a different opacity: the level set a value and the frame
     * loop overwrote it every frame. Stated per water body now.
     */
    water.userData.baseOpacity = 0.80;
    water.position.y = rimH - 0.20;
    g.add(water);

    g.position.set(cx, deck, cz);
    root.add(g);

    // One ring collider, matching the stone exactly, so the crow can perch on
    // the rim and hop in. It used to be twelve boxes laid round a circle, which
    // met only at their corners — the basin was walk-in-able at three headings
    // out of 180, and a crow that got in any other way never got out.
    ring(cx, cz, RI, r + 0.3, deck + rimH, { bottom: deck, tag: opts.tag || 'pool-rim' });

    return { group: g, water, spec };
  };

  return {
    solid, ring, perch, addDecal,
    addTree, addPlanter, addBench, addLamp, addBin, addTable, addSkyline,
    makeNest, addPool,
  };
}
