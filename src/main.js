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
import { formatRankLine } from './ui/rank.js';
import { getLevel } from './world/levels.js';
import { RULES } from './world/rules.js';
import { Crow } from './entities/crow.js';
import { Human, Pigeon, Gull } from './entities/human.js';
import { Pickup, BAIT_KINDS } from './world/pickups.js';
import { PAL } from './render/palette.js';

const STEP = 1 / 60;
const REACH = 1.15;

/**
 * Which block to build.
 *
 * A URL parameter, on purpose and for now: how a player actually gets from the
 * block to the roofline is a separate question and it is not answered here. This
 * is the seam, not the join.
 */
const LEVEL_ID = Number(new URLSearchParams(location.search).get('level')) || 1;

const _nestWorld = new THREE.Vector3();

// Test hook: set to a number to override the kid's trade ladder, so one trade
// clears the $20 goal and the end of the loop can be tested without collecting
// the whole block first. Null in normal play. While it is non-null the game
// shows a TEST MODE badge, `npm run smoke` prints a banner and startup logs a
// warning, so it cannot be shipped by accident.
const TEST_TRADE_PAYOUT = null;

// Test hook: shorten the day. The whole light rig, the sun dial and the
// out-of-time ending are all driven by elapsed/SESSION_SECONDS, so setting this
// to 60 runs a full dawn-to-dusk in a minute. Null means the real day length.
// Carries the same three tripwires as the payout cheat above.
const TEST_SESSION_SECONDS = null;

class Game {
  constructor() {
    /** Everything about this run that the block decides. See world/levels.js. */
    this.level = getLevel(LEVEL_ID);
    const GOAL = this.level.goal;
    const SESSION_SECONDS = TEST_SESSION_SECONDS ?? this.level.sessionSeconds;
    this.goal = GOAL;

    this.stage = new Stage(document.getElementById('c'));
    this.input = new Input();
    this.audio = new Audio();
    this.hud = new Hud(GOAL, SESSION_SECONDS);

    this.world = this.level.build();
    this.stage.scene.add(this.world.root);
    this.stage.registerOccluders([...new Set(this.world.occluders.filter((o) => o && o.isMesh))]);

    this.crow = new Crow(this.stage);
    this.crow.pos.set(...this.level.spawn);
    this.crow.root.position.copy(this.crow.pos);
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
    this.baitGuard = this.humans.find((h) => h.id === this.level.bait.guard);

    this.pigeons = (this.world.pigeons || []).map((s) => {
      const p = new Pigeon(s.x, s.z, s.y ?? 0);
      this.stage.scene.add(p.root);
      return p;
    });
    // Gulls are pigeons that stay put and object to company. They are level 2's
    // answer to a roof having no cover on it; the block has none.
    this.gulls = (this.world.gulls || []).map((s) => {
      const g = new Gull(s.x, s.z, s.y ?? 0);
      this.stage.scene.add(g.root);
      return g;
    });
    /** Everything with feathers that mobs food, which is both kinds. */
    this.birds = [...this.pigeons, ...this.gulls];

    this.total = 0;
    this.banked = 0;
    this.elapsed = 0;
    // Exposed because TEST_SESSION_SECONDS makes the day length a variable, and
    // a harness that wants "60% of the day" has to be able to ask rather than
    // assume a fixed length — scripts/shoot.mjs measured four identical frames
    // before this existed.
    this.sessionSeconds = SESSION_SECONDS;
    this.running = false;
    this.finished = false;
    this.tradeStep = 0;
    this.saltMoved = false;
    this.caught = 0;
    this._taughtNest = false;
    this._taughtTrade = false;
    this._cawCooldown = 0;
    this._screen = { x: 0, y: 0, visible: false };
    this._acc = 0;
    this._last = performance.now();

    this.tasks = this.level.tasks.map((t) => ({ ...t, done: false }));
    this.hud.setTasks(this.tasks);
    this.hud.setMoney(0);

    const cheats = [];
    if (TEST_TRADE_PAYOUT != null) cheats.push(`trade pays $${TEST_TRADE_PAYOUT.toFixed(2)}`);
    if (TEST_SESSION_SECONDS != null) cheats.push(`day lasts ${TEST_SESSION_SECONDS}s`);
    if (cheats.length) {
      const badge = document.getElementById('testmode');
      badge.textContent = `Test mode · ${cheats.join(' · ')}`;
      badge.hidden = false;
      console.warn(`[Small Change] TEST CHEAT ACTIVE: ${cheats.join('; ')}`);
    }

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
      // On touch the list is a real share of a small screen, so it introduces
      // itself and then folds down to a count. On desktop it stays open.
      if (this.input.hasTouch) this.hud.enableTaskAutoCollapse(12);
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

    // The weighted object pinning a bill — a saltshaker on the block, a candle
    // lantern on the terrace. Move it before the money under it comes loose.
    const pin = this.world.pin;
    if (pin && pin.visible) {
      const sp = pin.getWorldPosition(new THREE.Vector3());
      if (beak.distanceTo(sp) < REACH) {
        return { verb: 'SHOVE', noun: pin.userData.label || 'IT', kind: 'salt' };
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

    // The pinned bill, before you have moved the weight — tell the player why.
    for (const p of this.pickups) {
      if (p.pinned && !this.saltMoved && beak.distanceTo(p.root.position) < REACH + 0.3) {
        const label = this.world.pin?.userData.label || 'IT';
        return { verb: 'PINNED', noun: `UNDER ${label}`, kind: null };
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
        this.audio.coin(this.total / this.goal);
        const teach = this.level.teach;
        if (p.value > 0 && !this._taughtNest) {
          this._taughtNest = true;
          this.hud.toast(teach.money, 2.6);
        } else if (p.kind === 'shiny' && !this._taughtTrade) {
          this._taughtTrade = true;
          this.hud.toast(teach.shiny, 2.8);
        } else if (BAIT_KINDS.has(p.kind)) {
          this.hud.toast(teach.bait, 1.6);
        }
        break;
      }
      case 'drop': {
        const p = this.crow.carried;
        this.crow.carried = null;
        const beak = this.crow.beakWorld;
        p.setDropped(this.stage.scene, beak, new THREE.Vector3(this.crow.vel.x * 0.3, 0.6, this.crow.vel.z * 0.3));
        this._checkBaitDrop(p);
        break;
      }
      case 'bank': {
        const p = this.crow.carried;
        this.crow.carried = null;
        p.bank(this.world.root.userData.nestGroup, this.banked++);
        this.total += p.value;
        this.audio.bank(this.total / this.goal);
        this.hud.setMoney(this.total);
        const tick = this.level.bankTicks?.[p.kind];
        if (tick) this._tick(tick);
        if (this.total >= this.goal) this._finish(true);
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
        const v = TEST_TRADE_PAYOUT ?? values[Math.min(this.tradeStep, values.length - 1)];
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
        this.world.pin.visible = false;
        this.saltMoved = true;
        this.audio.step();
        this.hud.toast(this.level.pinToast, 1.4);
        break;
      }
    }
  }

  /**
   * The marquee puzzle, on both blocks: food dropped away from what it guards
   * pulls every bird within reach, and the guard leaves his post to deal with
   * them. Twelve seconds of an unguarded ten, or an unguarded twenty.
   *
   * Level 2 adds one condition and teaches it by failing: birds do not use
   * stairs. Chips dropped in the yard feed the yard pigeons and change nothing
   * five metres above them, which is the cheapest possible way to tell a player
   * that this block has floors.
   */
  _checkBaitDrop(p) {
    if (!BAIT_KINDS.has(p.kind)) return;
    const bait = this.level.bait;

    if (bait.deck != null && Math.abs(p.pos.y - bait.deck) > 1.6) {
      this.hud.toast(bait.wrongDeck, 1.8);
      return;
    }
    const anchor = bait.anchor(this.world);
    if (Math.hypot(p.pos.x - anchor.x, p.pos.z - anchor.z) < bait.minDist) {
      this.hud.toast(bait.tooClose, 1.6);
      return;
    }

    this.foodPos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    this.foodUntil = this.elapsed + bait.mobFor;
    this.baitGuard?.distract(new THREE.Vector3(p.pos.x, 0, p.pos.z), bait.seconds);
    this.audio.ding();
    this.hud.toast(bait.onDrop, 2.0);
    this._tick(bait.task);
  }

  /**
   * A gull went off. Everyone who could have heard it looks that way, and the
   * ones already half-suspicious get pushed the rest of the way.
   *
   * This is the whole of the gull mechanic on the game's side: the bird makes a
   * noise and does not know what a person is. It reuses the plumbing a caw
   * already runs through, which is deliberate — a gull is the crow's own trick
   * used against it.
   */
  onGullAlarm(gull) {
    this.audio.alert();
    for (const h of this.humans) {
      if (h.kid) continue;
      const d = Math.hypot(h.pos.x - gull.pos.x, h.pos.z - gull.pos.z, h.floorY - gull.floorY);
      if (d > 11) continue;
      h.lookAt = new THREE.Vector3(gull.pos.x, gull.floorY, gull.pos.z);
      h._suspicion += 0.34;
      setTimeout(() => { if (h.lookAt && h.lookAt.x === gull.pos.x) h.lookAt = null; }, 2400);
    }
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
    this.caught++;
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
    for (const p of this.birds) {
      const d = Math.hypot(p.pos.x - at.x, p.pos.z - at.z);
      if (d < 5 && Math.abs(at.y - p.floorY) < 2) {
        p.target.set(p.pos.x + (p.pos.x - at.x), p.floorY, p.pos.z + (p.pos.z - at.z));
      }
    }
  }

  _finish(won) {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.audio.transform();


    const title = document.getElementById('ending-title');
    const body = document.getElementById('ending-body');
    document.getElementById('rank').textContent = formatRankLine({
      won,
      elapsed: this.elapsed,
      caught: this.caught,
      traded: this.tradeStep > 0,
      tasksDone: this.tasks.filter((t) => t.done).length,
      totalTasks: this.tasks.length,
    });

    const copy = this.level.ending;
    if (won) {
      setEndingTitle(this.total);
      body.innerHTML = copy.won(this.total);
    } else {
      title.innerHTML = copy.lostTitle;
      body.innerHTML = copy.lost(this.total);
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
    for (const p of this.pigeons) p.update(dt, food, this.crow, this.world);
    for (const g of this.gulls) g.update(dt, food, this.crow, this.world, this);

    // Tasks that complete by observation rather than by a discrete action. The
    // predicate lives on the level, because what counts as an observation is the
    // block's business — a dive is a dive, but "rob the tip jar" and "rob the
    // window cleaner" are the same line of code about two different objects.
    for (const t of this.tasks) {
      if (!t.done && t.when && t.when(this)) this._tick(t.id);
    }

    this.input.flush();

    if (this.elapsed >= this.sessionSeconds && !this.finished) this._finish(false);
  }

  /**
   * Wayfinding to the nest, for players who have not yet learned where it is.
   *
   * Visible only while carrying money that has not been banked, and retired
   * permanently after the first successful stash — at that point the loop is
   * demonstrably learned. Deliberately not a glint: that signal means "you can
   * take this", and the nest is where you put things.
   */
  _updateNestPointer() {
    const carrying = this.crow.carried;
    const show = this.running && this.banked === 0 && carrying && carrying.value > 0;
    if (!show) { this.hud.setNestPointer(null); return; }

    const n = this.world.nest;
    _nestWorld.set(n.x, n.y + 1.5, n.z).project(this.stage.camera);

    // Behind the camera, the projection mirrors through the origin; flipping
    // both axes turns it back into a usable direction.
    const behind = _nestWorld.z > 1;
    const ndcX = behind ? -_nestWorld.x : _nestWorld.x;
    const ndcY = behind ? -_nestWorld.y : _nestWorld.y;

    let x = (ndcX * 0.5 + 0.5) * innerWidth;
    let y = (-ndcY * 0.5 + 0.5) * innerHeight;

    // Clamp inside a rectangle that clears the HUD plates rather than a uniform
    // margin — a plain inset parks the pointer underneath the money counter.
    const left = 70;
    const right = Math.max(left + 2, innerWidth - 70);
    const top = Math.min(innerHeight - 2, 124);     // under money + task list
    const bottom = Math.max(top + 2, innerHeight - 96);  // over legend + sun dial

    const onScreen = !behind && x > left && x < right && y > top && y < bottom;

    let angle;
    if (onScreen) {
      // Sit above the nest and point down at it.
      y = Math.max(top, y - 34);
      angle = 180;
    } else {
      const cx = (left + right) / 2, cy = (top + bottom) / 2;
      let dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const halfW = (right - left) / 2;
      const halfH = (bottom - top) / 2;
      const t = Math.min(halfW / Math.max(Math.abs(dx), 1e-6), halfH / Math.max(Math.abs(dy), 1e-6));
      x = cx + dx * t;
      y = cy + dy * t;
      angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    }

    this.hud.setNestPointer({ x, y, angle });
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

    // Time of day, which is no longer the same number as progress through the
    // run. A block may start partway into the afternoon — level 2 does, at 0.42 —
    // so the light ramp is compressed into whatever is left of the day rather
    // than replayed from noon.
    const through = Math.min(1, this.elapsed / this.sessionSeconds);
    const d0 = this.level.dayStart;
    const t = d0 + (1 - d0) * through;
    this.stage.follow(this.crow.pos, dt);
    this.stage.setTimeOfDay(t);
    // Driven in real seconds, not in `t`: the catch-and-warm schedule has to
    // look the same on a full-length day and a 60-second test one.
    this.world.nightLights.update(t, dt);

    // Fountain surface: a slow shimmer, no normal maps.
    const w = this.world.root.userData.fountainWater;
    if (w) w.material.opacity = 0.80 + Math.sin(this.elapsed * 1.4) * 0.05;

    this.hud.update(dt);
    this.hud.setTime(t, this.elapsed);
    this.hud.setCarry(this.crow.carried ? this.crow.carried.label : null);
    this.hud.setStamina(this.crow.stamina, !this.crow.grounded || this.crow.stamina < 0.98);
    this._updateNestPointer();

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
