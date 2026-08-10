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

const CALM = 'calm', SUSPICIOUS = 'suspicious', SHOOING = 'shooing',
      RETURNING = 'returning', DISTRACTED = 'distracted';

export class Human {
  constructor(spec) {
    Object.assign(this, spec);
    this.pos = new THREE.Vector3(...spec.pos);
    this.homePos = new THREE.Vector3(...spec.home);
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
    this.buskerEyes = 0;     // busker plays with eyes shut, opens between songs

    this.root = new THREE.Group();
    this._build();
    this.root.position.copy(this.pos);
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
    const dist = Math.hypot(dx, dz);
    if (dist > this.viewDist) return false;
    if (this.busker && this.buskerEyes < 0.5) return false;
    if (dist < 1.4) return true;
    const fx = Math.cos(this.heading), fz = -Math.sin(this.heading);
    const dot = (dx * fx + dz * fz) / dist;
    return dot > this.viewCos;
  }

  owns(pickup) { return pickup && pickup.owner === this.id; }

  update(dt, crow, game) {
    const audio = game.audio;
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
        const d = Math.hypot(crow.pos.x - p.pos.x, crow.pos.z - p.pos.z);
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
        // Useless once the crow is airborne — flight is the answer to being chased.
        const reachable = crow.pos.y < 1.9;
        if (reachable) this._moveToward(crow.pos, dt, this.chaseSpeed);
        else this._moveToward(crow.pos, dt, this.chaseSpeed * 0.45);

        if (distCrow < 1.15 && crow.pos.y < 1.6 && crow.stunned <= 0) {
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

    const speed = this._lastSpeed || 0;
    this._animate(dt, speed);
    this.root.position.copy(this.pos);
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
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { this._lastSpeed = 0; return; }
    const step = Math.min(d, speed * dt);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    this._lastSpeed = speed;
  }

  _animate(dt, speed) {
    this._walk += dt * speed * 2.4;
    const swing = speed > 0.05 ? Math.sin(this._walk) * (0.36 + speed * 0.08) : 0;

    this.legs[0].rotation.z = swing;
    this.legs[1].rotation.z = -swing;

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
  constructor(x, z) {
    this.pos = new THREE.Vector3(x, 0, z);
    this.home = new THREE.Vector3(x, 0, z);
    this.target = this.home.clone();
    this.heading = Math.random() * Math.PI * 2;
    this.waitT = Math.random() * 2;
    this._walk = 0;
    this.mobbing = null;

    this.root = new THREE.Group();
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
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.root.position.copy(this.pos);
  }

  update(dt, food, crow) {
    // Food beats everything; a nearby crow scatters them.
    const scared = Math.hypot(crow.pos.x - this.pos.x, crow.pos.z - this.pos.z) < 1.6 && crow.pos.y < 1.2;

    if (food) {
      this.mobbing = food;
      this.target.set(food.x + (Math.random() - 0.5) * 0.6, 0, food.z + (Math.random() - 0.5) * 0.6);
    } else if (scared) {
      const dx = this.pos.x - crow.pos.x, dz = this.pos.z - crow.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.target.set(this.pos.x + (dx / d) * 3, 0, this.pos.z + (dz / d) * 3);
    } else {
      this.mobbing = null;
      this.waitT -= dt;
      if (this.waitT <= 0) {
        this.waitT = 1.2 + Math.random() * 3;
        this.target.set(
          this.home.x + (Math.random() - 0.5) * 7,
          0,
          this.home.z + (Math.random() - 0.5) * 7,
        );
      }
    }

    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const speed = scared ? 3.4 : this.mobbing ? 1.9 : 0.85;
    if (d > 0.18) {
      const step = Math.min(d, speed * dt);
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
      const want = Math.atan2(-dz, dx);
      let a = want - this.heading;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      this.heading += a * Math.min(1, 9 * dt);
      this._walk += dt * speed * 6;
      this.root.position.y = Math.abs(Math.sin(this._walk)) * 0.04;
    } else {
      this._walk += dt * 1.5;
      this.root.position.y = 0;
    }

    this.root.position.x = this.pos.x;
    this.root.position.z = this.pos.z;
    this.root.rotation.y = this.heading;
  }
}
