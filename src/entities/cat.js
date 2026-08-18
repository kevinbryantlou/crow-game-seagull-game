/**
 * The ship's cat — the one thing on this game's maps that goes up.
 *
 * Every human in this game has an authored `floorY` and never leaves it. That
 * is the property four blocks are designed around: it is what makes guards
 * cheap, predictable and fair, and it is why flight has always been the answer
 * to being chased. Level 6 pays for it. Its whole deck is 2.4m boxes, a guard
 * can only reach 1.9m above their own feet, and so **one hop up is safe
 * everywhere, forever** — which is a lovely feeling for about ninety seconds
 * and then is the reason the block has no teeth.
 *
 * A cat is the answer, and it is the answer because of what it is rather than
 * what it does. Ships carried cats for centuries, so it needs no explanation.
 * It is not menacing — the register of this game is that nothing can really
 * hurt you and there is no fail state, and a drone or a rat or a rival crow all
 * break that. And a cat on a stack of boxes is the most ordinary sight there
 * is, while being the exact capability the level is missing.
 *
 * What it costs is deliberately small:
 *
 *   - It does not path in three dimensions. It walks in xz on whatever deck it
 *     is on, using the same `stepAround` every walker uses, and it *hops* —
 *     onto an adjacent surface, one level at a time. A cat using the same route
 *     up every time is what a real cat does, so the cheap implementation is
 *     also the honest one.
 *   - It is slow, and it telegraphs. You always see it coming, and you can
 *     always leave. It converts "the boxes are safe" into "the boxes are safe
 *     for about eight seconds", which is the change the block wanted.
 *   - When it arrives it does exactly what a shooing human does — the crow
 *     fumbles and drops what it is carrying. It cannot do anything a guard
 *     cannot do, so it adds a capability without adding a consequence.
 *
 * See docs/style-guide.html for how it is drawn and why.
 */

import * as THREE from 'three';
import { PAL } from '../render/palette.js';
import { box, cyl, ico, at, mat } from '../render/shapes.js';
import {
  resolveWalk, stepAround, deckAt, overlaps, blocksWalker,
} from '../world/collide.js';

/** Slower than a walking guard. Being outrun has to always be an option. */
const PROWL_SPEED = 1.15;
const STALK_SPEED = 2.05;
/** A cat is small. It fits where a person does not, and it is 0.22 wide. */
const CAT_RADIUS = 0.22;
const CAT_HEIGHT = 0.45;
const CAT_STEP_OVER = 0.30;
/** The tallest single hop. Two container tiers is 4.8 and takes two hops. */
const HOP_UP = 2.6;
/** Down is easier than up, and it has to clear a full container in one go. */
const HOP_DOWN = 3.4;
const HOP_TIME = 0.55;
/** How close it has to get, and it is the same reach a person has. */
const SWAT_DIST = 1.05;

const PROWL = 0, STALK = 1, HOP = 2, GIVEUP = 3;

export class Cat {
  /**
   * @param {object} spec  { pos: [x, y, z], home: [x, z], name }
   */
  constructor(spec) {
    this.id = spec.id || 'cat';
    this.name = spec.name || 'the ship\'s cat';
    this.pos = new THREE.Vector3(spec.pos[0], spec.pos[1] || 0, spec.pos[2]);
    this.floorY = spec.pos[1] || 0;
    this.homePos = new THREE.Vector3(spec.pos[0], spec.pos[1] || 0, spec.pos[2]);
    /**
     * A route, and it is the difference between an entity and an ornament.
     *
     * The first version had a fixed home and wandered 4.5m around it, with an
     * 11m notice range. Simulated over a full day that gave it an envelope of
     * x -22.8 to -8.8 — so the furthest east it could ever notice anything was
     * x 2.2, and the cargo deck runs to x 27. It never once visited a box top
     * that had anything on it, while fumbling the crow seventeen times in three
     * minutes at the pool and the galley step, which are both places the level
     * asks you to go. The entity built to put a clock on "a box top is safe"
     * was patrolling the two spots that are not boxes.
     *
     * So it walks the ship. `homePos` is the waypoint it is heading for rather
     * than a fixed post, which also gives GIVEUP somewhere sensible to go back
     * to — a cat that has lost interest rejoins its round.
     */
    this.patrol = spec.patrol || null;
    this._leg = 0;
    this.heading = 0;
    this.state = PROWL;
    this.stateT = 0;
    this.cooldown = 0;
    this.interest = 0;
    this._side = 0;
    this._cols = [];
    this._waitT = 0;
    this._target = new THREE.Vector3();
    this._hop = null;
    this._walk = 0;
    this.root = new THREE.Group();
    this._build();
    this.root.position.copy(this.pos);
  }

  /**
   * Ginger, low and long. The silhouette has one job: to be read as *a cat*
   * from thirty metres, on a deck where everything else is a rectangle and
   * every person is a standing box. So it is the only thing in the game that is
   * longer than it is tall, and the tail is half its length again — a vertical
   * line moving above a horizontal one, which is what the eye picks up first.
   */
  _build() {
    const g = this.root;
    const body = box(0.62, 0.24, 0.26, PAL.catFur, { up: PAL.catFurLit, down: PAL.catFurShade });
    body.position.y = 0.30;
    g.add(body);
    const chest = box(0.24, 0.22, 0.24, PAL.catFur, { up: PAL.catFurLit, down: PAL.catFurShade });
    chest.position.set(0.24, 0.27, 0);
    g.add(chest);
    // Head, and the two ears that make it not a loaf of bread.
    const head = ico(0.135, 0, PAL.catFur, { up: PAL.catFurLit, down: PAL.catFurShade });
    head.position.set(0.38, 0.42, 0);
    g.add(head);
    for (const s of [-1, 1]) {
      const ear = box(0.07, 0.09, 0.04, PAL.catFurShade, { shadow: false });
      ear.position.set(0.37, 0.53, s * 0.07);
      g.add(ear);
    }
    const muzzle = box(0.09, 0.06, 0.10, PAL.catFurLit, { shadow: false });
    muzzle.position.set(0.47, 0.39, 0);
    g.add(muzzle);
    // Four legs, and the front pair animate.
    this.legs = [];
    for (const [sx, sz] of [[1, -1], [1, 1], [-1, -1], [-1, 1]]) {
      const leg = box(0.08, 0.26, 0.08, PAL.catFurShade);
      leg.position.set(sx * 0.2, 0.13, sz * 0.09);
      g.add(leg);
      this.legs.push(leg);
    }
    /**
     * The tail, and it is doing the most work of anything here.
     *
     * Three segments so it can curve, and it is the only part that reads state:
     * up and still while prowling, low and level while stalking. That is the
     * one piece of feedback the player gets about whether the cat has seen
     * them, and it costs three boxes.
     */
    this.tail = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const t = box(0.16, 0.07, 0.07, i % 2 ? PAL.catFurShade : PAL.catFur, { shadow: false });
      t.position.set(-0.08 - i * 0.15, 0.10 + i * 0.10, 0);
      this.tail.add(t);
    }
    this.tail.position.set(-0.28, 0.28, 0);
    g.add(this.tail);
    this.body = body;
  }

  /** Where the cat can stand: the deck under a point, on any level. */
  _floorAt(x, z, from) {
    return deckAt(this._cols, x, z, from + 0.05);
  }

  _free(x, z, floor) {
    return !this._cols.some((c) => blocksWalker(c, CAT_HEIGHT, CAT_STEP_OVER, floor)
      && overlaps(c, x, z, CAT_RADIUS));
  }

  /**
   * Is there something adjacent the cat could get onto that is nearer the
   * crow's height than where it is standing?
   *
   * This is the whole of the climbing, and it is deliberately not path-finding.
   * It looks at the colliders it is touching, takes the highest one that is a
   * hop away and no higher than the crow, and gets on it. A cat that goes up
   * the same corner of the same stack every time is what a cat does.
   */
  _findHop(targetY, cx, cz) {
    let best = null;
    /** Where on this collider the cat would end up, for the "is it closer" test. */
    const lxTest = (c) => Math.max(c.minX + 0.3, Math.min(cx, c.maxX - 0.3));
    const lzTest = (c) => Math.max(c.minZ + 0.3, Math.min(cz, c.maxZ - 0.3));
    for (const c of this._cols) {
      if (c.shape === 'ring' || c.perch === false) continue;
      /**
       * And it has to be something a cat could actually stand on. Without this
       * it will happily hop onto a 0.3m floodlight post and perch there like a
       * finial — which it did, and which is why it kept stopping 0.2m short of
       * the bird. Anything narrower than about a cat is not a surface.
       */
      if (c.maxX - c.minX < 0.9 || c.maxZ - c.minZ < 0.9) continue;
      const rise = c.top - this.floorY;
      if (rise < 0.25 || rise > HOP_UP) continue;
      if (c.top > targetY + 0.35) continue;          // never overshoot the bird
      /**
       * And it has to be a step *toward* the bird. Without this the cat takes
       * whatever is nearest — and since cargo on a hatch tops out at 2.80 while
       * cargo on the deck tops out at 2.40, the nearest box is usually 0.4m
       * short of the crow's. From there `above` is under a metre, the climb
       * never fires again, and it stands on the wrong box until it times out.
       */
      const closer = Math.hypot(lxTest(c) - cx, lzTest(c) - cz)
        < Math.hypot(this.pos.x - cx, this.pos.z - cz) - 0.2;
      if (!closer && c.top < targetY - 0.6) continue;
      // Touching it, or within a whisker of it.
      if (!overlaps(c, this.pos.x, this.pos.z, CAT_RADIUS + 0.75)) continue;
      // Somewhere on top of it to actually land.
      /**
       * Land as near the bird as there is room for.
       *
       * Nearest-the-bird is what puts the next hop in range, but on a hatch
       * cover the point directly under the crow is usually occupied by the very
       * container it is standing on — so taking only that point rejected the
       * hatch entirely and the cat paced the cover's edge forever. Try the
       * bird's side first, then the cat's own side, then give up on this solid.
       */
      let lx = lxTest(c);
      let lz = lzTest(c);
      if (!this._free(lx, lz, c.top)) {
        lx = Math.max(c.minX + 0.3, Math.min(this.pos.x, c.maxX - 0.3));
        lz = Math.max(c.minZ + 0.3, Math.min(this.pos.z, c.maxZ - 0.3));
        if (!this._free(lx, lz, c.top)) continue;
      }
      /**
       * Prefer the thing the bird is actually standing on. Without this the cat
       * climbs whatever is nearest, walks toward the crow, steps off the far
       * edge and falls — then climbs the same box again. The first trace of it
       * did exactly that, forever. A cat gets *under* the bird and then goes
       * up, which is both what a cat does and the only version that terminates.
       */
      const holdsCrow = cx > c.minX - 0.4 && cx < c.maxX + 0.4
        && cz > c.minZ - 0.4 && cz < c.maxZ + 0.4;
      const score = c.top + (holdsCrow ? 100 : 0);
      if (!best || score > best.score) best = { top: c.top, x: lx, z: lz, score };
    }
    return best;
  }

  /** And the way back down, which is any drop it is standing on the edge of. */
  _findDrop() {
    const step = 0.55;
    for (let a = 0; a < 360; a += 30) {
      const r = (a * Math.PI) / 180;
      const x = this.pos.x + Math.cos(r) * step, z = this.pos.z + Math.sin(r) * step;
      const f = this._floorAt(x, z, this.floorY);
      if (f < this.floorY - 0.25 && this.floorY - f <= HOP_DOWN && this._free(x, z, f)) {
        return { top: f, x, z };
      }
    }
    return null;
  }

  _face(px, pz, dt, rate) {
    const want = Math.atan2(-(pz - this.pos.z), px - this.pos.x);
    let d = want - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.heading += d * Math.min(1, rate * dt);
  }

  /**
   * @param {boolean} keepDeck  refuse a step that would walk off this floor.
   *   Stalking on a container top, the cat must stay on it; coming down is a
   *   decision it makes deliberately in GIVEUP, not something it does by
   *   walking into space.
   */
  _walkToward(tx, tz, dt, speed, keepDeck = false) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return 0;
    const step = Math.min(speed * dt, d);
    const wasX = this.pos.x, wasZ = this.pos.z;
    this._side = stepAround(this._cols, this.pos, tx, tz, step, CAT_RADIUS,
      this._side, CAT_HEIGHT, CAT_STEP_OVER, this.floorY) ?? 0;
    resolveWalk(this._cols, this.pos, CAT_RADIUS, CAT_HEIGHT, CAT_STEP_OVER, this.floorY);
    if (keepDeck && this.floorY > 0.1
      && this._floorAt(this.pos.x, this.pos.z, this.floorY) < this.floorY - 0.3) {
      this.pos.x = wasX;
      this.pos.z = wasZ;
      return 0;
    }
    this._walk += step * 5.5;
    return step;
  }

  update(dt, crow, game) {
    this._cols = game.world.colliders;
    this.stateT += dt;
    if (this.cooldown > 0) this.cooldown -= dt;

    // A hop is a fixed arc and nothing interrupts it. Anything else and the cat
    // can be caught mid-air between two decks, which is a bird with legs.
    if (this.state === HOP) {
      const t = Math.min(1, this.stateT / HOP_TIME);
      this.pos.x = this._hop.fromX + (this._hop.x - this._hop.fromX) * t;
      this.pos.z = this._hop.fromZ + (this._hop.z - this._hop.fromZ) * t;
      const base = this._hop.fromY + (this._hop.top - this._hop.fromY) * t;
      this.root.position.set(this.pos.x, base + Math.sin(t * Math.PI) * 0.30, this.pos.z);
      this.root.rotation.y = this.heading;
      this._animate(dt, 1);
      if (t >= 1) {
        this.floorY = this._hop.top;
        this.pos.y = this.floorY;
        // Landing is a teleport, so it can land overlapping something. Push out
        // once on arrival rather than leaving it embedded for a few frames.
        resolveWalk(this._cols, this.pos, CAT_RADIUS, CAT_HEIGHT, CAT_STEP_OVER, this.floorY);
        this.state = this._hop.up ? STALK : PROWL;
        this.stateT = 0;
      }
      return;
    }

    const dxz = Math.hypot(crow.pos.x - this.pos.x, crow.pos.z - this.pos.z);
    /**
     * What the cat is interested in. Not "can it see the crow" — a cat that
     * tracked you through steel would be the guard bug all over again — but
     * near, and above, and not moving fast. A crow crossing the deck at speed
     * is not worth getting up for.
     */
    const nearby = dxz < 11 && this.cooldown <= 0;
    const above = crow.pos.y - this.floorY;

    switch (this.state) {
      case PROWL: {
        this.interest = nearby ? this.interest + dt : Math.max(0, this.interest - dt * 1.5);
        if (this.interest > 1.1) { this.state = STALK; this.stateT = 0; this.interest = 0; break; }
        this._waitT -= dt;
        if (this.patrol) {
          // Down the route, pausing at each mark the way a cat does.
          const wp = this.patrol[this._leg];
          this.homePos.set(wp[0], this.floorY, wp[1]);
          const d = Math.hypot(wp[0] - this.pos.x, wp[1] - this.pos.z);
          if (d < 1.1) {
            if (this._waitT <= 0) {
              this._waitT = 1.8 + Math.random() * 3.5;
              this._leg = (this._leg + 1) % this.patrol.length;
            }
            this._target.copy(this.pos);
          } else this._target.set(wp[0], this.floorY, wp[1]);
        } else if (this._waitT <= 0) {
          this._waitT = 2.4 + Math.random() * 4;
          const tx = this.homePos.x + (Math.random() - 0.5) * 9;
          const tz = this.homePos.z + (Math.random() - 0.5) * 6;
          if (Math.abs(this._floorAt(tx, tz, this.floorY) - this.floorY) < 0.3) {
            this._target.set(tx, this.floorY, tz);
          } else this._target.copy(this.homePos);
        }
        this._face(this._target.x, this._target.z, dt, 4);
        this._walkToward(this._target.x, this._target.z, dt, PROWL_SPEED);
        break;
      }

      case STALK: {
        this._face(crow.pos.x, crow.pos.z, dt, 6);
        // Level with the bird and close enough: that is the whole threat.
        if (Math.abs(above) < 1.0 && dxz < SWAT_DIST && crow.stunned <= 0) {
          game.onShooed(this, crow);
          this.cooldown = 6.5;
          this.state = GIVEUP;
          this.stateT = 0;
          break;
        }
        // Below the bird and there is something to get onto: go up.
        if (above > 1.0) {
          // Close enough to be underneath it. Further out, walk first: a cat
          // three boxes away that starts climbing is a cat that will spend the
          // whole run getting on and off cargo.
          const up = dxz < 4.5 ? this._findHop(crow.pos.y, crow.pos.x, crow.pos.z) : null;
          if (up) {
            this._hop = { ...up, up: true, fromX: this.pos.x, fromZ: this.pos.z, fromY: this.floorY };
            this.state = HOP; this.stateT = 0;
            break;
          }
        }
        this._walkToward(crow.pos.x, crow.pos.z, dt, STALK_SPEED, true);
        /**
         * And it gives up, which is the property that keeps it fair. Eight
         * seconds is long enough to make standing still expensive and short
         * enough that it is never the reason a run went wrong.
         */
        /**
         * And it gives up, with a cooldown. Without one it re-acquires 1.1s
         * later and spends the entire run getting on and off cargo — measured
         * at a stalk every nine seconds, forever, which is precisely the
         * behaviour the header of this file claims to be avoiding.
         */
        if (this.stateT > 8 || dxz > 14) {
          this.state = GIVEUP;
          this.stateT = 0;
          this.cooldown = 4;
        }
        break;
      }

      case GIVEUP: {
        // Down first, then home. A cat comes off a stack the way it went up.
        if (this.floorY > this.homePos.y + 0.1) {
          const down = this._findDrop();
          if (down) {
            this._hop = { ...down, up: false, fromX: this.pos.x, fromZ: this.pos.z, fromY: this.floorY };
            this.state = HOP; this.stateT = 0;
            break;
          }
        }
        this._face(this.homePos.x, this.homePos.z, dt, 3);
        /**
         * Home is a *distance*, not a step length. This read `d < 0.02` off the
         * return of `_walkToward`, which is how far it moved this frame —
         * `PROWL_SPEED / 60` is 0.019, permanently under it, so GIVEUP lasted
         * exactly one frame every single time and the "come down, then go home"
         * behaviour never once ran.
         */
        this._walkToward(this.homePos.x, this.homePos.z, dt, PROWL_SPEED);
        const home = Math.hypot(this.pos.x - this.homePos.x, this.pos.z - this.homePos.z);
        if (home < 0.5 || this.stateT > 12) { this.state = PROWL; this.stateT = 0; this._waitT = 0; }
        break;
      }
      default: break;
    }

    /**
     * And it can never be standing on nothing.
     *
     * Everything above moves the cat in xz on the deck it thinks it is on. Walk
     * off the edge of a container and it thinks that still — the first trace of
     * this entity showed it giving up on a box top and then strolling home
     * three metres in the air, because a 2.8m drop was taller than its hop and
     * `_findDrop` returned nothing. Deciding to come down is one thing; being
     * on the floor that is actually underneath you is not a decision.
     */
    const under = this._floorAt(this.pos.x, this.pos.z, this.floorY);
    if (under < this.floorY - 0.3) {
      this._hop = {
        top: under, x: this.pos.x, z: this.pos.z, up: false,
        fromX: this.pos.x, fromZ: this.pos.z, fromY: this.floorY,
      };
      this.state = HOP;
      this.stateT = 0;
      return;
    }

    this.pos.y = this.floorY;
    this.root.position.set(this.pos.x, this.floorY, this.pos.z);
    this.root.rotation.y = this.heading;
    this._animate(dt, this.state === STALK ? 1 : 0);
  }

  /**
   * Two lines of animation. The legs swing, and the tail says what the cat is
   * thinking — up and swaying while it prowls, flat and still while it stalks.
   */
  _animate(dt, stalking) {
    for (let i = 0; i < this.legs.length; i++) {
      const ph = this._walk + (i % 2) * Math.PI;
      this.legs[i].position.y = 0.13 + Math.abs(Math.sin(ph)) * 0.03;
    }
    const want = stalking ? -0.35 : 0.55;
    this.tail.rotation.z = (this.tail.rotation.z || 0) + (want - this.tail.rotation.z) * Math.min(1, dt * 4);
    this.tail.rotation.y = stalking ? 0 : Math.sin(this._walk * 0.5) * 0.35;
    this.root.position.y += stalking ? 0 : Math.abs(Math.sin(this._walk)) * 0.015;
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
}
