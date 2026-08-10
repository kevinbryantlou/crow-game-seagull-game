/**
 * Small Change — a crow, a city block, and twenty dollars before sundown.
 *
 * Fixed-step simulation at 60 Hz with a decoupled render, so a 120 Hz iPad and
 * a throttled phone produce identical physics. See docs/design-brief.html §9.
 */

import * as THREE from 'three';
import { Stage } from './render/stage.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { Hud, setEndingTitle } from './ui/hud.js';
import { buildLevel } from './world/level.js';
import { Crow } from './entities/crow.js';
import { Human, Pigeon } from './entities/human.js';
import { Pickup } from './world/pickups.js';
import { PAL } from './render/palette.js';

const GOAL = 20.00;
const SESSION_SECONDS = 18 * 60;
const STEP = 1 / 60;
const REACH = 1.15;

class Game {
  constructor() {
    this.stage = new Stage(document.getElementById('c'));
    this.input = new Input();
    this.audio = new Audio();
    this.hud = new Hud(GOAL);

    this.world = buildLevel();
    this.stage.scene.add(this.world.root);
    this.stage.registerOccluders([...new Set(this.world.occluders.filter((o) => o && o.isMesh))]);

    this.crow = new Crow(this.stage);
    this.stage.scene.add(this.crow.root);

    this.pickups = this.world.pickups.map((spec) => {
      const p = new Pickup(spec);
      this.stage.scene.add(p.root);
      return p;
    });

    this.humans = this.world.humans.map((spec) => {
      const h = new Human(spec);
      this.stage.scene.add(h.root);
      return h;
    });
    this.kid = this.humans.find((h) => h.kid);
    this.vendor = this.humans.find((h) => h.id === 'vendor');

    this.pigeons = [];
    for (let i = 0; i < 7; i++) {
      const p = new Pigeon(-20 + Math.random() * 14, 4 + Math.random() * 8);
      this.stage.scene.add(p.root);
      this.pigeons.push(p);
    }

    this.total = 0;
    this.banked = 0;
    this.elapsed = 0;
    this.running = false;
    this.finished = false;
    this.tradeStep = 0;
    this.saltMoved = false;
    this._taughtNest = false;
    this._taughtTrade = false;
    this._cawCooldown = 0;
    this._screen = { x: 0, y: 0, visible: false };
    this._acc = 0;
    this._last = performance.now();

    this.tasks = [
      { id: 'dive',  text: 'Dive for the wishing coins', done: false },
      { id: 'jar',   text: 'Rob the tip jar', done: false },
      { id: 'trade', text: 'Trade something shiny', done: false },
      { id: 'cart',  text: 'Make the vendor leave his cart', done: false },
      { id: 'ten',   text: 'Get the ten', done: false },
    ];
    this.hud.setTasks(this.tasks);
    this.hud.setMoney(0);

    this._bindUi();
    requestAnimationFrame(this._frame);
  }

  _bindUi() {
    const start = () => {
      this.audio.unlock();
      document.getElementById('title').classList.add('hidden');
      this.running = true;
      this._last = performance.now();
      this.hud.beginControlsCountdown(10);
      setTimeout(() => { if (this.running) this.hud.toast('Collect money', 2.2); }, 900);
    };
    document.getElementById('start').addEventListener('click', start);
    document.getElementById('again').addEventListener('click', () => location.reload());
    addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && !this.running && !this.finished) start();
      if (e.code === 'KeyM') this.audio.setMuted(!this.audio.muted);
    });
    document.getElementById('loading').classList.add('hidden');
  }

  // ── interaction ───────────────────────────────────────────────────────────

  /** What would the beak do right now? Drives both the prompt and the action. */
  _bestAction() {
    const beak = this.crow.beakWorld;

    // Holding something: nest first, then the kid, then just put it down.
    if (this.crow.carried) {
      const n = this.world.nest;
      // Covers the whole cornice including its corners, so anywhere you can
      // land is somewhere you can stash.
      if (Math.hypot(this.crow.pos.x - n.x, this.crow.pos.z - n.z) < 2.45 && this.crow.pos.y > n.y - 1.2) {
        return this.crow.carried.value > 0
          ? { verb: 'STASH', noun: this.crow.carried.label, kind: 'bank' }
          : { verb: 'STASH', noun: this.crow.carried.label, kind: 'bank' };
      }
      if (this.crow.carried.kind === 'shiny') {
        const k = this.kid;
        if (Math.hypot(this.crow.pos.x - k.pos.x, this.crow.pos.z - k.pos.z) < 2.2) {
          return { verb: 'GIVE', noun: 'to the kid', kind: 'trade' };
        }
      }
      return { verb: 'DROP', noun: this.crow.carried.label, kind: 'drop' };
    }

    // The saltshaker pins the café bill — a weighted object you must move first.
    const salt = this.world.saltshaker;
    if (salt.visible) {
      const sp = salt.getWorldPosition(new THREE.Vector3());
      if (beak.distanceTo(sp) < REACH) {
        return { verb: 'SHOVE', noun: 'SALTSHAKER', kind: 'salt' };
      }
    }

    let best = null, bestD = REACH;
    for (const p of this.pickups) {
      if (p.state !== 'world' || p.taken) continue;
      if (p.pinned && !this.saltMoved) continue;
      const d = beak.distanceTo(p.root.position);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) return { verb: 'TAKE', noun: best.label, kind: 'take', pickup: best };

    // The pinned bill, before you have moved the shaker — tell the player why.
    for (const p of this.pickups) {
      if (p.pinned && !this.saltMoved && beak.distanceTo(p.root.position) < REACH + 0.3) {
        return { verb: 'PINNED', noun: 'UNDER THE SALTSHAKER', kind: null };
      }
    }
    return null;
  }

  _doAction(a) {
    if (!a) return;
    switch (a.kind) {
      case 'take': {
        const p = a.pickup;
        p.setCarried(this.crow.grip);
        this.crow.carried = p;
        this.audio.coin(this.total / GOAL);
        if (p.value > 0 && !this._taughtNest) {
          this._taughtNest = true;
          this.hud.toast('Take it to your nest', 2.6);
        } else if (p.kind === 'shiny' && !this._taughtTrade) {
          this._taughtTrade = true;
          this.hud.toast('The kid on the bench will trade for that', 2.8);
        } else if (p.kind === 'hotdog') {
          this.hud.toast('A hot dog', 1.3);
        }
        break;
      }
      case 'drop': {
        const p = this.crow.carried;
        this.crow.carried = null;
        const beak = this.crow.beakWorld;
        p.setDropped(this.stage.scene, beak, new THREE.Vector3(this.crow.vel.x * 0.3, 0.6, this.crow.vel.z * 0.3));
        this._checkHotdogDrop(p);
        break;
      }
      case 'bank': {
        const p = this.crow.carried;
        this.crow.carried = null;
        p.bank(this.world.root.userData.nestGroup, this.banked++);
        this.total += p.value;
        this.audio.bank(this.total / GOAL);
        this.hud.setMoney(this.total);
        if (p.kind === 'bill10') this._tick('ten');
        if (this.total >= GOAL) this._finish(true);
        break;
      }
      case 'trade': {
        const p = this.crow.carried;
        this.crow.carried = null;
        p.taken = true;
        p.root.visible = false;
        // A quarter was not worth finding a shiny and carrying it across the
        // block. A dollar is, and the ladder still rewards repeat trades.
        const values = [1.00, 1.50, 2.00, 3.00];
        const v = values[Math.min(this.tradeStep, values.length - 1)];
        this.tradeStep++;
        // She puts it straight in your beak. The crow's beak is necessarily
        // empty at this instant — it just handed over the shiny — so there is
        // no reason to make the player hunt for a coin on the ground, where
        // the bench and the trees can hide it.
        const coin = new Pickup({
          kind: 'coins', value: v, id: 900 + this.tradeStep,
          pos: [this.kid.pos.x + 0.9, 0.70, this.kid.pos.z + 0.5],
        });
        this.pickups.push(coin);
        coin.setCarried(this.crow.grip);
        this.crow.carried = coin;
        this.audio.ding();
        this.hud.toast(`She gives you $${v.toFixed(2)}`, 1.8);
        this._tick('trade');
        break;
      }
      case 'salt': {
        this.world.saltshaker.visible = false;
        this.saltMoved = true;
        this.audio.step();
        this.hud.toast('The bill is loose', 1.4);
        break;
      }
    }
  }

  /**
   * The marquee puzzle: a hot dog dropped away from the cart pulls the pigeons,
   * and the vendor leaves his cart to shoo them. Twelve seconds of unguarded ten.
   */
  _checkHotdogDrop(p) {
    if (p.kind !== 'hotdog') return;
    const d = Math.hypot(p.pos.x - this.world.cart.x, p.pos.z - this.world.cart.z);
    if (d < 6.5) {
      this.hud.toast('Too close to the cart', 1.6);
      return;
    }
    this.foodPos = { x: p.pos.x, z: p.pos.z };
    this.foodUntil = this.elapsed + 13;
    this.vendor.distract(new THREE.Vector3(p.pos.x, 0, p.pos.z), 12);
    this.audio.ding();
    this.hud.toast('The pigeons have found it', 2.0);
    this._tick('cart');
  }

  _tick(id) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t || t.done) return;
    t.done = true;
    this.hud.setTasks(this.tasks);
    this.audio.ding();
  }

  /** A human caught the crow. Costs time and dignity — nothing is ever lost. */
  onShooed(human, crow) {
    this.audio.fumble();
    if (crow.carried) {
      const p = crow.carried;
      crow.carried = null;
      const beak = crow.beakWorld;
      const away = new THREE.Vector3(crow.pos.x - human.pos.x, 0, crow.pos.z - human.pos.z).normalize();
      p.setDropped(this.stage.scene, beak, new THREE.Vector3(away.x * 3.4, 3.6, away.z * 3.4));
      this.hud.toast('Dropped it', 1.3);
    }
    crow.fumble(human.pos.x, human.pos.z);
  }

  _caw() {
    if (this._cawCooldown > 0) return;
    this._cawCooldown = 0.55;
    this.audio.caw();
    const at = this.crow.pos.clone();
    for (const h of this.humans) {
      if (h.kid) continue;
      const d = h.pos.distanceTo(at);
      if (d < 13) {
        h.lookAt = at;
        // Overuse makes a person suspicious rather than curious.
        h._suspicion += 0.12;
        setTimeout(() => { if (h.lookAt === at) h.lookAt = null; }, 2600);
      }
    }
    for (const p of this.pigeons) {
      const d = Math.hypot(p.pos.x - at.x, p.pos.z - at.z);
      if (d < 5) {
        p.target.set(p.pos.x + (p.pos.x - at.x), 0, p.pos.z + (p.pos.z - at.z));
      }
    }
  }

  _finish(won) {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.audio.transform();

    const mins = Math.floor(this.elapsed / 60);
    const secs = Math.floor(this.elapsed % 60);
    const rank = won
      ? (this.elapsed < 300 ? 'Corvid Prodigy' : this.elapsed < 600 ? 'Accomplished Thief' : 'Persistent Bird')
      : 'Still A Crow';

    const title = document.getElementById('ending-title');
    const body = document.getElementById('ending-body');
    document.getElementById('rank').textContent =
      `${rank} · ${mins}m ${String(secs).padStart(2, '0')}s`;

    if (won) {
      setEndingTitle(this.total);
      body.innerHTML = 'The last coin lands in the nest and the weight of it goes through you '
        + 'like a held breath let go. Fingers. Shoulders. The ache of standing up.<br><br>'
        + 'The first thing you see, from the top of a war memorial you have no business being on, '
        + 'is a kid on a bench — still holding out a bottle cap, for a bird that is not there any more.';
    } else {
      title.innerHTML = 'The Light<span>Goes</span>';
      body.innerHTML = `You got to $${this.total.toFixed(2)}. The sun is off the block now and the `
        + 'shadows have gone violet all the way across the plaza.<br><br>'
        + 'Still a crow. But the fountain is full of coins that nobody is watching, '
        + 'and you have all night.';
    }
    document.getElementById('ending').classList.remove('hidden');
  }

  // ── loop ──────────────────────────────────────────────────────────────────

  _tickSim(dt) {
    this.elapsed += dt;
    if (this._cawCooldown > 0) this._cawCooldown -= dt;

    this.input.sample();
    if (this.input.beakPressed) this._doAction(this._bestAction());
    if (this.input.cawPressed) this._caw();
    if (this.input.helpPressed) this.hud.toggleControls();

    this.crow.update(dt, this.input, this.world, this.audio);

    // Coins in the fountain need the crow actually in the water.
    for (const p of this.pickups) p.update(dt, this.world, this.stage.camera);

    const food = (this.foodUntil && this.elapsed < this.foodUntil) ? this.foodPos : null;
    for (const h of this.humans) h.update(dt, this.crow, this);
    for (const p of this.pigeons) p.update(dt, food, this.crow);

    // Tasks that complete by observation rather than by a discrete action.
    if (!this.tasks[0].done && this.crow.inWater) this._tick('dive');
    if (!this.tasks[1].done && this.crow.carried?.inJar) this._tick('jar');

    this.input.flush();

    if (this.elapsed >= SESSION_SECONDS && !this.finished) this._finish(false);
  }

  _frame = (now) => {
    requestAnimationFrame(this._frame);
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 0.25) dt = 0.25;      // a backgrounded tab must not teleport anyone

    if (this.running) {
      this._acc += dt;
      let steps = 0;
      while (this._acc >= STEP && steps < 6) {
        this._tickSim(STEP);
        this._acc -= STEP;
        steps++;
      }
    }

    const t = Math.min(1, this.elapsed / SESSION_SECONDS);
    this.stage.follow(this.crow.pos, dt);
    this.stage.setTimeOfDay(t);

    // Fountain surface: a slow shimmer, no normal maps.
    const w = this.world.root.userData.fountainWater;
    if (w) w.material.opacity = 0.80 + Math.sin(this.elapsed * 1.4) * 0.05;

    this.hud.update(dt);
    this.hud.setTime(t);
    this.hud.setCarry(this.crow.carried ? this.crow.carried.label : null);
    this.hud.setStamina(this.crow.stamina, !this.crow.grounded || this.crow.stamina < 0.98);

    if (this.running) {
      const a = this._bestAction();
      this.stage.project(this.crow.beakWorld, this._screen);
      this.hud.setPrompt(a, this._screen, !this.input.hasTouch);
    } else {
      this.hud.setPrompt(null, null);
    }

    this.stage.render(this.crow.pos, dt);
  };
}

// A thrown error during construction would otherwise leave a black screen with
// the reason only in the console — which is no use at all on a phone.
try {
  const game = new Game();
  // Dev-only handle so scripts/shoot.mjs can inspect any part of the block
  // instead of only wherever the crow happens to have flown. Stripped from
  // production builds by Vite's dead-code elimination.
  if (import.meta.env?.DEV) window.__game = game;
} catch (err) {
  console.error(err);
  const el = document.getElementById('loading');
  el.classList.remove('hidden');
  el.style.cssText += 'flex-direction:column;gap:12px;padding:24px;text-align:center;color:#d95f4c';
  el.textContent = `Could not start: ${err.message}`;
}
