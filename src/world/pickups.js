/**
 * Pickups — the value ladder made physical.
 *
 * A pickup is the only kind of object in the game that carries a glint. There
 * is no outline shader and no highlight pass: if it shines, you can take it.
 * See docs/style-guide.html §5.
 */

import * as THREE from 'three';
import { PAL } from '../render/palette.js';
import { box, cyl, ico, at, group, mat } from '../render/shapes.js';

export const KIND_LABEL = {
  penny: 'PENNY', nickel: 'NICKEL', dime: 'DIME', quarter: 'QUARTER',
  coins: 'LOOSE CHANGE', bill1: 'DOLLAR BILL', bill5: 'FIVE', bill10: 'TEN',
  shiny: 'SOMETHING SHINY', hotdog: 'HOT DOG',
};

const SHINY_LABEL = { cap: 'BOTTLE CAP', ring: 'A RING', marble: 'A MARBLE', key: 'A KEY' };

/**
 * The glint texture: a soft radial falloff with a faint four-point star.
 * A hard-edged quad reads as a scrap of paper lying on the pavement rather
 * than as light, which is the opposite of the signal we want.
 */
let _glintTex = null;
function glintTexture() {
  if (_glintTex) return _glintTex;
  const S = 64;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = S;
  const c = cvs.getContext('2d');

  const grad = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0.00, 'rgba(255,246,220,1)');
  grad.addColorStop(0.18, 'rgba(240,201,116,0.62)');
  grad.addColorStop(0.55, 'rgba(224,179,72,0.16)');
  grad.addColorStop(1.00, 'rgba(224,179,72,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, S, S);

  // Star spikes, drawn as fading strokes so they never show a hard end.
  const spike = c.createLinearGradient(0, 0, S, 0);
  spike.addColorStop(0, 'rgba(255,246,220,0)');
  spike.addColorStop(0.5, 'rgba(255,246,220,0.55)');
  spike.addColorStop(1, 'rgba(255,246,220,0)');
  c.strokeStyle = spike;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(2, S / 2); c.lineTo(S - 2, S / 2);
  c.stroke();
  c.save();
  c.translate(S / 2, S / 2); c.rotate(Math.PI / 2); c.translate(-S / 2, -S / 2);
  c.beginPath();
  c.moveTo(2, S / 2); c.lineTo(S - 2, S / 2);
  c.stroke();
  c.restore();

  _glintTex = new THREE.CanvasTexture(cvs);
  return _glintTex;
}

function coinMesh(r, h, color) {
  const m = cyl(r, r, h, 10, color, { up: color, down: PAL.shade });
  m.rotation.x = Math.PI / 2;
  return m;
}

function billMesh(color, w = 0.30, d = 0.15) {
  const g = new THREE.Group();
  const b = box(w, 0.012, d, color, { up: color, down: PAL.billDark });
  g.add(b);
  const mark = box(w * 0.34, 0.014, d * 0.42, PAL.billDark, { shadow: false });
  mark.position.y = 0.004;
  g.add(mark);
  return g;
}

function buildMesh(spec) {
  switch (spec.kind) {
    case 'penny':   return coinMesh(0.055, 0.012, PAL.terracottaLit);
    case 'nickel':  return coinMesh(0.065, 0.014, PAL.silver);
    case 'dime':    return coinMesh(0.052, 0.011, PAL.silver);
    case 'quarter': return coinMesh(0.078, 0.015, PAL.silver);
    case 'coins': {
      const g = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const c = coinMesh(0.055 + Math.random() * 0.02, 0.012, i % 2 ? PAL.silver : PAL.gold);
        c.position.set((Math.random() - 0.5) * 0.16, i * 0.014, (Math.random() - 0.5) * 0.16);
        c.rotation.z = Math.random() * Math.PI;
        g.add(c);
      }
      return g;
    }
    case 'bill1':  return billMesh(PAL.bill, 0.30, 0.14);
    case 'bill5':  return billMesh(PAL.bill, 0.34, 0.16);
    case 'bill10': {
      const g = billMesh(PAL.bill, 0.38, 0.18);
      // Folded, so the ten reads differently from every other note at a glance.
      const fold = box(0.38, 0.012, 0.06, PAL.billDark, { shadow: false });
      fold.position.y = 0.012;
      g.add(fold);
      return g;
    }
    case 'shiny': {
      switch (spec.shinyKind) {
        case 'ring': {
          const t = new THREE.Mesh(
            new THREE.TorusGeometry(0.07, 0.018, 4, 10),
            mat(PAL.gold),
          );
          t.rotation.x = Math.PI / 2;
          t.castShadow = true;
          return t;
        }
        case 'marble': {
          const m = ico(0.062, 1, PAL.waterLit);
          m.material = mat(PAL.waterLit);
          return m;
        }
        case 'key': {
          const g = new THREE.Group();
          g.add(at(box(0.17, 0.014, 0.03, PAL.silver), 0, 0, 0));
          g.add(at(box(0.04, 0.014, 0.055, PAL.silver), 0.07, 0, 0.03));
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 4, 8), mat(PAL.silver));
          ring.rotation.x = Math.PI / 2;
          ring.position.x = -0.10;
          g.add(ring);
          return g;
        }
        default: {
          const g = new THREE.Group();
          g.add(cyl(0.055, 0.055, 0.016, 8, PAL.cloth[0], { up: PAL.clothLit[0], down: PAL.shade }));
          return g;
        }
      }
    }
    case 'hotdog': {
      const g = new THREE.Group();
      const bun = box(0.26, 0.07, 0.10, PAL.pavingMid, { up: PAL.paving, down: PAL.shade });
      g.add(bun);
      const sausage = cyl(0.033, 0.033, 0.28, 6, PAL.terracotta, { up: PAL.terracottaLit });
      sausage.rotation.z = Math.PI / 2;
      sausage.position.y = 0.035;
      g.add(sausage);
      const mustard = box(0.22, 0.012, 0.02, PAL.gold, { shadow: false });
      mustard.position.y = 0.072;
      g.add(mustard);
      return g;
    }
    default: return ico(0.06, 0, PAL.gold);
  }
}

export class Pickup {
  constructor(spec) {
    // `label` is an accessor on this class, so it must not go through
    // Object.assign — assigning to a getter-only property throws in strict mode.
    const { label, ...rest } = spec;
    Object.assign(this, rest);
    this.customLabel = label || null;
    this.home = new THREE.Vector3(...spec.pos);
    this.pos = this.home.clone();
    this.vel = new THREE.Vector3();
    this.state = 'world';        // world | carried | banked
    this.loose = false;          // dropped by the player, will not go home
    this.grounded = true;
    this.taken = false;

    this.root = new THREE.Group();
    this.mesh = buildMesh(spec);
    this.root.add(this.mesh);
    this.root.position.copy(this.pos);

    // The glint — the game's only "you can take this" signal. It goes on
    // everything takeable without exception, including the hot dog: it is not
    // money, but it is the key to the whole of Cart Corner, and a player who
    // cannot see that it is an object cannot find the puzzle.
    {
      // A Sprite, so it always faces the camera without any per-frame work.
      const g = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glintTexture(), transparent: true, opacity: 0.85,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      g.scale.setScalar(0.34);
      g.position.y = 0.15;
      this.glint = g;
      this.root.add(g);
    }

    this._spin = Math.random() * Math.PI * 2;
  }

  get label() {
    if (this.kind === 'shiny') return SHINY_LABEL[this.shinyKind] || 'SOMETHING SHINY';
    return this.customLabel || KIND_LABEL[this.kind] || 'SOMETHING';
  }

  /** Physics only runs for items the player has thrown around. */
  update(dt, world, camera) {
    if (this.state === 'carried') return;

    if (!this.grounded) {
      this.vel.y -= 19 * dt;
      this.pos.addScaledVector(this.vel, dt);

      let floor = 0;
      for (const c of world.colliders) {
        if (!c.perch) continue;
        if (this.pos.x > c.minX && this.pos.x < c.maxX && this.pos.z > c.minZ && this.pos.z < c.maxZ) {
          if (this.pos.y >= c.top - 0.2 && c.top > floor) floor = c.top;
        }
      }
      const f = world.fountain;
      if (Math.hypot(this.pos.x - f.x, this.pos.z - f.z) < f.r - 0.7) floor = f.floor;

      if (this.pos.y <= floor) {
        this.pos.y = floor;
        this.vel.set(0, 0, 0);
        this.grounded = true;
      }
      this.root.position.copy(this.pos);
    }

    this._spin += dt * 1.6;
    if (this.glint) {
      const pulse = Math.abs(Math.sin(this._spin * 1.3));
      this.glint.position.y = 0.14 + Math.sin(this._spin * 1.7) * 0.03;
      this.glint.material.opacity = 0.5 + pulse * 0.42;
      this.glint.scale.setScalar(0.30 + pulse * 0.07);
    }
    if (this.kind !== 'coins' && this.kind !== 'hotdog') {
      this.mesh.rotation.y = this._spin * 0.55;
    }
  }

  setCarried(grip) {
    this.state = 'carried';
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    if (this.glint) this.glint.visible = false;
    grip.add(this.root);
  }

  setDropped(scene, pos, vel) {
    this.state = 'world';
    this.loose = true;
    scene.add(this.root);
    this.pos.copy(pos);
    this.vel.copy(vel);
    this.grounded = false;
    if (this.glint) this.glint.visible = true;
    this.root.position.copy(this.pos);
  }

  bank(nestGroup, index) {
    this.state = 'banked';
    this.taken = true;
    if (this.glint) this.glint.visible = false;
    nestGroup.add(this.root);
    const a = index * 2.4;
    const r = 0.12 + (index % 3) * 0.11;
    this.root.position.set(Math.cos(a) * r, 0.10 + Math.floor(index / 5) * 0.03, Math.sin(a) * r);
    this.root.rotation.set(0, Math.random() * Math.PI, 0);
  }
}
