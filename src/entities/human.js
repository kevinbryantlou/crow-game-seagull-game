/**
 * People.
 *
 * There is no combat and no damage — humans are moving weather. Six boxes, no
 * faces: a faceless human is a shape rather than a person, which keeps stealing
 * from them funny instead of mean, and at thirty feet up a face would be four
 * pixels of noise. State reads from posture first, marker second.
 * See docs/design-brief.html §5.
 */

import * as THREE from 'three';
import { PAL } from '../render/palette.js';
import { box, cyl, ico, at, mat } from '../render/shapes.js';
import {
  resolveWalk, stepAround, deckAt, hasLineOfSight,
  WALKER_RADIUS, WALKER_HEIGHT, WALKER_STEP_OVER, WALKER_EYE,
  PIGEON_RADIUS, PIGEON_HEIGHT, PIGEON_STEP_OVER,
} from '../world/collide.js';

const CALM = 'calm', SUSPICIOUS = 'suspicious', SHOOING = 'shooing',
      RETURNING = 'returning', DISTRACTED = 'distracted';

export class Human {
  constructor(spec) {
    Object.assign(this, spec);
    this.pos = new THREE.Vector3(...spec.pos);
    this.homePos = new THREE.Vector3(...spec.home);
    /**
     * The deck this person stands on. Everything about walking is still 2-D —
     * nobody uses stairs and nobody changes storey — but a roof terrace is a
     * 5.4m solid, and a walker that measures obstacles from y = 0 is inside it.
     * `floorY` is what collision, reach and sightlines all measure from, so the
     * maître d' can chase across a roof while the porter chases across a yard
     * with one implementation and no special cases.
     */
    this.floorY = spec.pos[1] || 0;
    this.heading = spec.faces ? Math.atan2(-spec.faces[1], spec.faces[0]) : 0;
    this.state = CALM;
    this.stateT = 0;
    this.patrolIndex = 0;
    this.waitT = 0;
    this.cooldown = 0;
    this.lookAt = null;      // a caw, or a distraction
    this.distractPos = null;
    this._walk = 0;
    this._suspicion = 0;
    this._cols = [];         // the block's colliders, handed over each update
    this._skirt = 0;         // which way round the last obstacle we went
    this.buskerEyes = 0;     // busker plays with eyes shut, opens between songs

    this.root = new THREE.Group();
    this._build();
    this.root.position.copy(this.pos);
    // The kid never runs her movement code, so her facing has to be applied here.
    this.root.rotation.y = this.heading;
  }

  _build() {
    const s = this.small ? 0.72 : 1;
    const cloth = PAL.cloth[this.cloth], clothLit = PAL.clothLit[this.cloth];
    const skin = PAL.skin[this.skin], hair = PAL.hair[this.hair];

    this.body = new THREE.Group();
    this.root.add(this.body);

    const torso = box(0.52 * s, 0.72 * s, 0.30 * s, cloth, { up: clothLit, down: PAL.shade });
    torso.position.y = 1.06 * s;
    this.body.add(torso);

    this.head = new THREE.Group();
    this.head.position.y = 1.60 * s;
    this.body.add(this.head);
    const skull = box(0.30 * s, 0.32 * s, 0.28 * s, skin, { up: skin, down: PAL.shade });
    this.head.add(skull);
    const cap = box(0.32 * s, 0.11 * s, 0.30 * s, hair, { up: hair, down: PAL.shade });
    cap.position.y = 0.15 * s;
    this.head.add(cap);
    // A nose, purely so facing is legible from above without a face.
    const nose = box(0.06 * s, 0.06 * s, 0.07 * s, skin, { shadow: false });
    nose.position.set(0.16 * s, -0.02 * s, 0);
    this.head.add(nose);

    this.arms = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 1.38 * s, side * 0.30 * s);
      const arm = box(0.14 * s, 0.60 * s, 0.14 * s, cloth, { up: clothLit, down: PAL.shade });
      arm.position.y = -0.30 * s;
      pivot.add(arm);
      pivot.userData.side = side;
      this.body.add(pivot);
      this.arms.push(pivot);
    }

    this.legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.70 * s, side * 0.13 * s);
      const leg = box(0.17 * s, 0.70 * s, 0.17 * s, PAL.trouser[this.hair % 3], { up: PAL.trouser[this.hair % 3], down: PAL.shade });
      leg.position.y = -0.35 * s;
      pivot.add(leg);
      this.body.add(pivot);
      this.legs.push(pivot);
    }

    if (this.busker) {
      const guitar = box(0.10, 0.62, 0.26, PAL.bark, { up: PAL.barkShade, down: PAL.shade });
      guitar.position.set(0.22, 1.05, 0);
      guitar.rotation.z = 0.5;
      this.body.add(guitar);
    }
    if (this.kid) {
      // The paper cup of coins she trades from.
      const cup = cyl(0.09, 0.07, 0.16, 8, PAL.stone, { up: PAL.stone, down: PAL.shade });
      cup.position.set(0.22, 1.02, 0.16);
      this.body.add(cup);
    }
    if (this.id === 'vendor') {
      const apron = box(0.44, 0.5, 0.06, PAL.stone, { up: PAL.stone, down: PAL.shade });
      apron.position.set(0.16, 0.95, 0);
      this.body.add(apron);
    }

    // State marker — a floating glyph, billboarded at the camera.
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 128;
    this._markCanvas = cvs;
    this._markTex = new THREE.CanvasTexture(cvs);
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._markTex, transparent: true, depthTest: false,
    }));
    this.marker.scale.set(0.5, 0.5, 0.5);
    this.marker.position.y = 2.15 * s;
    this.marker.visible = false;
    this.root.add(this.marker);
    this._markGlyph = null;

    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  /**
   * Free the one GPU resource a person owns outright.
   *
   * Everything else about a Human comes out of the shared material cache or is
   * geometry the generic teardown walks. The state marker is neither: it is a
   * 128×128 CanvasTexture built per person in `_build`, so seven of them would
   * be stranded on every level swap.
   */
  dispose() {
    this._markTex?.dispose();
  }

  _setMarker(glyph, color) {
    if (this._markGlyph === glyph) return;
    this._markGlyph = glyph;
    const c = this._markCanvas.getContext('2d');
    c.clearRect(0, 0, 128, 128);
    if (glyph) {
      c.font = 'bold 104px Menlo, monospace';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 12;
      c.strokeStyle = 'rgba(15,13,20,0.85)';
      c.strokeText(glyph, 64, 68);
      c.fillStyle = color;
      c.fillText(glyph, 64, 68);
    }
    this._markTex.needsUpdate = true;
    this.marker.visible = !!glyph;
  }

  /** Can this person see that point right now? */
  canSee(p) {
    if (this.kid) return false;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    // Height counts, at a discount. On one flat block it never mattered; with a
    // yard under a terrace it decides whether the roof staff spend the whole
    // session shooing at a crow five metres below their feet that they could
    // not reach if they wanted to. Discounted rather than blocked, because a
    // person does notice a bird overhead — they just notice it less.
    const dy = (p.y - this.floorY) * 0.62;
    const dist = Math.hypot(dx, dz, dy);
    if (dist > this.viewDist) return false;
    if (this.busker && this.buskerEyes < 0.5) return false;

    /**
     * And nothing solid in the way.
     *
     * This used to be distance and a cone and nothing else, so a guard saw the
     * crow through the lobby's front desk, the roofline's van, the park's
     * shelter and the wharf's ice house. It is a real 3-D segment test rather
     * than a footprint one for one specific reason: a crow *over* the desk has
     * to stay visible, and getting that direction wrong would be worse than the
     * bug — it would make flight, the answer to being chased, a hiding place.
     *
     * It runs before the 1.4m cone exemption below, not after. Close range is a
     * statement about peripheral vision, and peripheral vision does not go
     * through a wall: a crow crouched on the far side of the reception desk a
     * metre and a half away is precisely the case being fixed.
     *
     * `_cols` is handed over by `update` every frame. A person built and asked
     * about a sightline before ever being updated has an empty list and sees
     * everything, which is the same answer they gave before this existed.
     */
    if (!hasLineOfSight(this._cols, this.pos.x, this.floorY + WALKER_EYE, this.pos.z,
      p.x, p.y, p.z, this.floorY)) return false;

    if (dist < 1.4) return true;
    const fx = Math.cos(this.heading), fz = -Math.sin(this.heading);
    const dot = (dx * fx + dz * fz) / dist;
    return dot > this.viewCos;
  }

  owns(pickup) { return pickup && pickup.owner === this.id; }

  update(dt, crow, game) {
    const audio = game.audio;
    this._cols = game.world.colliders;
    this.stateT += dt;
    if (this.cooldown > 0) this.cooldown -= dt;

    if (this.busker) {
      // Eyes shut while playing, open between songs.
      this.buskerEyes = (Math.sin(game.elapsed * 0.42) > 0.62) ? 1 : 0;
    }

    if (this.kid) { this._animate(dt, 0); return; }

    const toCrow = new THREE.Vector3().subVectors(crow.pos, this.pos);
    const distCrow = Math.hypot(toCrow.x, toCrow.z);

    // Does the crow have something of mine, or is it near something of mine?
    let provoked = false;
    if (crow.carried && this.owns(crow.carried)) provoked = true;
    if (!provoked && this.cooldown <= 0) {
      for (const p of game.pickups) {
        if (p.state !== 'world' || p.taken || !this.owns(p)) continue;
        const d = Math.hypot(crow.pos.x - p.pos.x, crow.pos.z - p.pos.z, crow.pos.y - p.pos.y);
        if (d < this.guardRadius && this.canSee(crow.pos)) { provoked = true; break; }
      }
    }

    switch (this.state) {
      case CALM:
      case RETURNING: {
        if (provoked && this.cooldown <= 0) {
          this._suspicion += dt * this.alertness * (crow.carried && this.owns(crow.carried) ? 4 : 1.6);
          if (this._suspicion > 0.6) this._enter(SUSPICIOUS, audio);
        } else {
          this._suspicion = Math.max(0, this._suspicion - dt);
        }
        this._wander(dt);
        break;
      }
      case SUSPICIOUS: {
        // Turn to face the crow, and give it two seconds of grace.
        this._face(crow.pos, dt, 7);
        this._moveToward(null, dt, 0);
        if (!provoked) {
          if (this.stateT > 1.2) this._enter(RETURNING, audio);
        } else if (this.stateT > 1.1) {
          this._enter(SHOOING, audio);
        }
        break;
      }
      case SHOOING: {
        this._face(crow.pos, dt, 9);
        // Useless once the crow is airborne — flight is the answer to being
        // chased. Measured from this person's own deck: arms reach the same
        // distance above a roof terrace as above a pavement.
        const above = crow.pos.y - this.floorY;
        const reachable = above < 1.9;
        if (reachable) this._moveToward(crow.pos, dt, this.chaseSpeed);
        else this._moveToward(crow.pos, dt, this.chaseSpeed * 0.45);

        if (distCrow < 1.15 && above < 1.6 && above > -1.2 && crow.stunned <= 0) {
          game.onShooed(this, crow);
          this.cooldown = 2.2;
          this._enter(RETURNING, audio);
        }
        const tooFar = this.pos.distanceTo(this.homePos) > (this.patrol ? 18 : 11);
        if (this.stateT > 9 || tooFar || (!provoked && this.stateT > 2.6)) {
          this._enter(RETURNING, audio);
          this.cooldown = 1.4;
        }
        break;
      }
      case DISTRACTED: {
        const target = this.distractPos || this.homePos;
        this._face(target, dt, 5);
        const d = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
        if (d > 1.4) this._moveToward(target, dt, this.speed * 1.5);
        if (this.stateT > this.distractFor) {
          this.distractPos = null;
          this._enter(RETURNING, audio);
          this.cooldown = 0.8;
        }
        break;
      }
    }

    // A caw turns heads. Overuse makes people suspicious rather than curious.
    if (this.lookAt && this.state !== SHOOING && this.state !== DISTRACTED) {
      this._face(this.lookAt, dt, 5);
    }

    // People are solid against the block, in every state. Without this a chase
    // walked straight through the fountain, the café tables and the newsstand —
    // and no amount of route authoring fixes it, because SHOOING steers at the
    // crow and the crow can stand anywhere.
    resolveWalk(game.world.colliders, this.pos, WALKER_RADIUS,
      WALKER_HEIGHT, WALKER_STEP_OVER, this.floorY);

    const speed = this._lastSpeed || 0;
    this._animate(dt, speed);
    this.root.position.set(this.pos.x, this.floorY, this.pos.z);
    this.root.rotation.y = this.heading;

    this._setMarker(
      this.state === SHOOING ? '!' : this.state === SUSPICIOUS ? '?' : this.state === DISTRACTED ? '…' : null,
      this.state === SHOOING ? '#ff8f7a' : this.state === DISTRACTED ? '#e8e2d2' : '#f2cf74',
    );
  }

  _enter(state, audio) {
    if (this.state === state) return;
    if (state === SUSPICIOUS) audio.alert();
    if (state === SHOOING) audio.alert();
    this.state = state;
    this.stateT = 0;
    if (state === RETURNING) this._suspicion = 0;
  }

  /** Something interesting is over there. */
  distract(pos, seconds) {
    if (this.kid) return;
    this.distractPos = pos.clone();
    this.distractFor = seconds;
    this.state = DISTRACTED;
    this.stateT = 0;
    this._suspicion = 0;
  }

  _wander(dt) {
    if (this.patrol) {
      const [tx, tz] = this.patrol[this.patrolIndex];
      const target = new THREE.Vector3(tx, 0, tz);
      const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
      if (d < 0.8) {
        this.waitT -= dt;
        if (this.waitT <= 0) {
          this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
          this.waitT = 0.6 + Math.random() * 1.8;
        }
        this._moveToward(null, dt, 0);
      } else {
        this._face(target, dt, 4);
        this._moveToward(target, dt, this.speed);
      }
    } else {
      const d = this.pos.distanceTo(this.homePos);
      if (d > 0.5) {
        this._face(this.homePos, dt, 4);
        this._moveToward(this.homePos, dt, this.speed);
      } else {
        this._moveToward(null, dt, 0);
        if (this.faces && this.state === RETURNING) {
          const want = Math.atan2(-this.faces[1], this.faces[0]);
          this._turnTo(want, dt, 3);
          if (this.stateT > 1.5) this.state = CALM;
        }
      }
    }
  }

  _face(target, dt, rate) {
    const want = Math.atan2(-(target.z - this.pos.z), target.x - this.pos.x);
    this._turnTo(want, dt, rate);
  }

  _turnTo(want, dt, rate) {
    let d = want - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.heading += d * Math.min(1, rate * dt);
  }

  _moveToward(target, dt, speed) {
    if (!target || speed <= 0) { this._lastSpeed = 0; return; }
    const d = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
    if (d < 0.05) { this._lastSpeed = 0; return; }
    const step = Math.min(d, speed * dt);
    const side = stepAround(this._cols, this.pos, target.x, target.z, step, WALKER_RADIUS,
      this._skirt, WALKER_HEIGHT, WALKER_STEP_OVER, this.floorY);
    // Remember which way round we went, so the next frame commits to the same
    // side of the obstacle instead of re-deciding from scratch.
    this._skirt = side ?? 0;
    this._lastSpeed = side === null ? 0 : speed;
  }

  _animate(dt, speed) {
    this._walk += dt * speed * 2.4;
    const swing = speed > 0.05 ? Math.sin(this._walk) * (0.36 + speed * 0.08) : 0;

    this.legs[0].rotation.z = swing;
    this.legs[1].rotation.z = -swing;

    /**
     * Sitting.
     *
     * The only posture in the game that is not a variation on standing, and it
     * exists for exactly one person. On level 1 the kid reads instantly because
     * she is the only human in an empty corner of a plaza; drop the same figure
     * onto a restaurant terrace with a maître d' and a busser on it and she is a
     * slightly shorter adult in a crowd of adults. Nothing about her colour or
     * her cup fixes that at the distance the camera sits.
     *
     * A silhouette does. Nobody else in either block sits down, so the shape
     * alone says *this one is different* before you are close enough to see what
     * she is holding.
     */
    if (this.sits) {
      const sc = this.small ? 0.72 : 1;
      this.body.position.y = -0.62 * sc;
      this.legs[0].rotation.z = -1.28;
      this.legs[1].rotation.z = -1.16;      // one leg swinging a little wider
      this.legs[0].position.y = 0.70 * sc;
      this.legs[1].position.y = 0.70 * sc;
      this.arms[0].rotation.z = -0.55;
      this.arms[1].rotation.z = -0.15;
      this.body.rotation.z = -0.06;
      return;
    }

    if (this.state === SHOOING) {
      // Arms up and flapping — the silhouette changes so intent reads at
      // distance without needing the marker.
      const f = Math.sin(this.stateT * 17) * 0.5;
      this.arms[0].rotation.z = -2.2 + f;
      this.arms[1].rotation.z = -2.2 - f;
      this.arms[0].rotation.x = 0.5;
      this.arms[1].rotation.x = -0.5;
      this.body.position.y = Math.abs(Math.sin(this.stateT * 9)) * 0.05;
    } else if (this.kid) {
      this.arms[0].rotation.z = -0.9;
      this.arms[1].rotation.z = -0.2;
      this.body.position.y = Math.sin(this._walk * 0.2 + 1) * 0.012;
    } else if (this.busker) {
      const p = Math.sin(this.stateT * 6) * 0.14;
      this.arms[0].rotation.z = -1.5 + p;
      this.arms[1].rotation.z = -0.9 - p;
      this.body.position.y = Math.sin(this.stateT * 3) * 0.02;
    } else {
      const t = this.state === SUSPICIOUS ? 0.25 : 0;
      this.arms[0].rotation.z += (-swing * 0.8 - t - this.arms[0].rotation.z) * Math.min(1, 10 * dt);
      this.arms[1].rotation.z += (swing * 0.8 - t - this.arms[1].rotation.z) * Math.min(1, 10 * dt);
      this.arms[0].rotation.x *= Math.max(0, 1 - dt * 8);
      this.arms[1].rotation.x *= Math.max(0, 1 - dt * 8);
      this.body.position.y = speed > 0.05 ? Math.abs(Math.sin(this._walk)) * 0.03 : 0;
    }

    // Leaning forward reads as "coming for you" before the marker is legible.
    const leanTarget = this.state === SHOOING ? 0.18 : this.state === SUSPICIOUS ? -0.06 : 0;
    this.body.rotation.z += (leanTarget - this.body.rotation.z) * Math.min(1, 8 * dt);
  }
}

/**
 * Pigeons. Not a threat — but they mob any dropped food, and that is the whole
 * key to Cart Corner: a hot dog dropped away from the cart pulls the pigeons,
 * and the vendor leaves his cart to shoo them.
 */
export class Pigeon {
  /**
   * @param {number} x
   * @param {number} z
   * @param {number} floorY  the deck it lives on — 0 for a plaza, 8.8 for a roof
   * @param {number} range   how far it will wander from home
   */
  constructor(x, z, floorY = 0, range = 7) {
    this.pos = new THREE.Vector3(x, floorY, z);
    this.home = new THREE.Vector3(x, floorY, z);
    this.target = this.home.clone();
    this.floorY = floorY;
    this.range = range;
    this.heading = Math.random() * Math.PI * 2;
    this.waitT = Math.random() * 2;
    this._walk = 0;
    this.mobbing = null;

    this.root = new THREE.Group();
    this._build();
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.root.position.copy(this.pos);
  }

  _build() {
    const body = ico(0.16, 0, PAL.steel, { up: PAL.silver, down: PAL.shade });
    body.scale.set(1.5, 1, 1);
    body.position.y = 0.20;
    this.root.add(body);
    const head = ico(0.09, 0, PAL.steelDark, { up: PAL.steel, down: PAL.shade });
    head.position.set(0.17, 0.31, 0);
    this.root.add(head);
    const beak = box(0.08, 0.03, 0.03, PAL.gold, { shadow: false });
    beak.position.set(0.26, 0.30, 0);
    this.root.add(beak);
  }

  /**
   * Is (x, z) actually on this bird's deck?
   *
   * Birds do not fall — their y is authored and never integrated — which was
   * invisible for as long as every bird stood on a plaza, because a plaza is
   * everywhere. Put one on a parapet 0.6m deep and it walks calmly off the side
   * and hovers over the yard six metres up.
   */
  _onDeck(world, x, z) {
    if (!world || this.floorY < 0.01) return true;
    return Math.abs(deckAt(world.colliders, x, z, this.floorY + 0.05) - this.floorY) < 0.3;
  }

  update(dt, food, crow, world) {
    const heldX = this.pos.x, heldZ = this.pos.z;
    // Food beats everything; a nearby crow scatters them.
    const scared = Math.hypot(crow.pos.x - this.pos.x, crow.pos.z - this.pos.z) < 1.6
      && Math.abs(crow.pos.y - this.floorY) < 1.2;
    // Birds do not use stairs. Food two storeys down is somebody else's lunch,
    // which is what lets level 2 lure the roof birds off the roof and leave the
    // yard birds where they are.
    const mine = food && Math.abs((food.y ?? 0) - this.floorY) < 2.2;

    if (mine) {
      this.mobbing = food;
      this.target.set(
        food.x + (Math.random() - 0.5) * 0.6, this.floorY,
        food.z + (Math.random() - 0.5) * 0.6,
      );
    } else if (scared) {
      const dx = this.pos.x - crow.pos.x, dz = this.pos.z - crow.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.target.set(this.pos.x + (dx / d) * 3, this.floorY, this.pos.z + (dz / d) * 3);
    } else {
      this.mobbing = null;
      this.waitT -= dt;
      if (this.waitT <= 0) {
        this.waitT = 1.2 + Math.random() * 3;
        const tx = this.home.x + (Math.random() - 0.5) * this.range;
        const tz = this.home.z + (Math.random() - 0.5) * this.range;
        // Never wander at somewhere there is no floor. Cheaper than walking
        // there and being pulled back, and it stops a gull on a narrow parapet
        // spending its whole life pressed against the edge.
        if (this._onDeck(world, tx, tz)) this.target.set(tx, this.floorY, tz);
        else this.target.copy(this.home);
      }
    }

    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const speed = scared ? 3.4 : this.mobbing ? 1.9 : 0.85;
    if (d > 0.18) {
      const step = Math.min(d, speed * dt);
      // Ankle height, so a pigeon shelters under a café table but is still
      // turned back by its pedestal — and by the fountain it used to paddle in.
      if (world) {
        this._skirt = stepAround(world.colliders, this.pos, this.target.x, this.target.z,
          step, PIGEON_RADIUS, this._skirt, PIGEON_HEIGHT, PIGEON_STEP_OVER, this.floorY) ?? 0;
      } else {
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
      }
      const want = Math.atan2(-dz, dx);
      let a = want - this.heading;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      this.heading += a * Math.min(1, 9 * dt);
      this._walk += dt * speed * 6;
      this.root.position.y = this.floorY + Math.abs(Math.sin(this._walk)) * 0.04;
    } else {
      this._walk += dt * 1.5;
      this.root.position.y = this.floorY;
    }

    if (world) {
      resolveWalk(world.colliders, this.pos, PIGEON_RADIUS,
        PIGEON_HEIGHT, PIGEON_STEP_OVER, this.floorY);
      // The deck is a leash. Any step that leaves it is undone, and the bird is
      // sent home rather than left shuffling at the brink.
      if (!this._onDeck(world, this.pos.x, this.pos.z)) {
        this.pos.x = heldX;
        this.pos.z = heldZ;
        this.target.copy(this.home);
      }
    }

    this.root.position.x = this.pos.x;
    this.root.position.z = this.pos.z;
    this.root.rotation.y = this.heading;
  }
}

/**
 * Gulls.
 *
 * A pigeon that is bigger, louder, and stays where it was put. They exist
 * because level 2 is a roof and a roof has no cover: on the block you could put
 * a plane tree between yourself and the waiter, and on a terrace there is
 * nothing to put anywhere. So the danger is authored as birds instead of walls —
 * land inside a gull's patch and it shrieks, and every person who hears it turns
 * round. They are markers that say *not here*, and unlike a guard they cannot be
 * outrun, only avoided or moved.
 *
 * Moving them is the level's set piece: gulls mob dropped food exactly as
 * pigeons do, so one cone of chips dropped in the yard empties the parapet and
 * takes the maître d' with it.
 *
 * They are also the joke this project owes itself. The Instagram prompt offered
 * a seagull chasing forty chips; the crow was chosen instead. The seagulls got
 * in anyway, and the chips with them.
 */
export class Gull extends Pigeon {
  constructor(x, z, floorY = 0) {
    // A gull holds its pitch. Range is small on purpose — it shuffles on the
    // parapet rather than patrolling, so its patch stays learnable.
    super(x, z, floorY, 2.2);
    this.alarmRadius = 2.4;
    this.alarmCooldown = 0;
    this.alarmed = false;
    this.shriek = 0;
  }

  _build() {
    const body = ico(0.21, 0, PAL.stone, { up: PAL.shiny, down: PAL.shade });
    body.scale.set(1.55, 1.05, 1);
    body.position.y = 0.28;
    this.root.add(body);
    // The grey mantle across the back — the one marking that reads as "gull"
    // rather than "large pale pigeon" at the distance the camera sits.
    const mantle = box(0.26, 0.06, 0.26, PAL.steel, { up: PAL.silver, down: PAL.shade });
    mantle.position.set(-0.05, 0.40, 0);
    this.root.add(mantle);
    const head = ico(0.115, 0, PAL.stone, { up: PAL.shiny, down: PAL.shade });
    head.position.set(0.22, 0.45, 0);
    this.root.add(head);
    const beak = box(0.13, 0.045, 0.04, PAL.gold, { shadow: false });
    beak.position.set(0.34, 0.44, 0);
    this.root.add(beak);
    this.body = body;
    this.head = head;
  }

  /**
   * @param {object} game  needs `onGullAlarm(gull)` — the gull does not know
   *   what a human is, it only makes a noise and lets the game decide who heard.
   */
  update(dt, food, crow, world, game) {
    if (this.alarmCooldown > 0) this.alarmCooldown -= dt;
    this.shriek = Math.max(0, this.shriek - dt * 2.2);
    this.alarmed = false;

    // Landing next to one is the mistake. Flying over it is not: a gull on a
    // parapet does not care about a bird two metres above its head, and if it
    // did the level would punish the one thing it is trying to teach.
    const near = Math.hypot(crow.pos.x - this.pos.x, crow.pos.z - this.pos.z) < this.alarmRadius
      && Math.abs(crow.pos.y - this.floorY) < 1.3;
    if (near && !this.mobbing && this.alarmCooldown <= 0) {
      this.alarmCooldown = 4.5;
      this.shriek = 1;
      this.alarmed = true;
      game?.onGullAlarm?.(this);
    }

    super.update(dt, food, crow, world);

    // Head thrown back mid-shriek. Two lines of animation, and it is the only
    // feedback the player gets that the noise came from *this* bird.
    if (this.head) {
      this.head.position.y = 0.45 + this.shriek * 0.09;
      this.head.position.x = 0.22 - this.shriek * 0.05;
    }
  }
}
