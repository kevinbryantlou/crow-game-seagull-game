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
import { Hud, setEndingTitle, replayEndingAnimation } from './ui/hud.js';
import { formatRankLine } from './ui/rank.js';
import { moneyInWords } from './ui/words.js';
import { getLevel, LEVELS } from './world/levels.js';
import { Progress } from './core/save.js';
import { isSharedMaterial } from './render/shapes.js';
import { RULES } from './world/rules.js';
import { Crow } from './entities/crow.js';
import { Human, Pigeon, Gull } from './entities/human.js';
import { Pickup, BAIT_KINDS } from './world/pickups.js';
import { PAL } from './render/palette.js';

const STEP = 1 / 60;
const REACH = 1.15;

/**
 * Which block to build first.
 *
 * Read once, at boot, and then never again — which is the point. It used to be
 * the only answer to "which level am I on", so the level was a module constant
 * and swapping blocks meant reloading the page. The running answer now lives on
 * the Game (`this.level`), and this is only where a session starts: a bookmark,
 * a shared link, or a refresh mid-block.
 *
 * How a player gets from one block to the next is no longer a URL question — it
 * is the ending screen. See `_finish` and `loadLevel`.
 */
const START_LEVEL = Number(new URLSearchParams(location.search).get('level')) || null;

/**
 * Strip a block down to nothing, freeing what it owns and nothing else.
 *
 * Geometry made by this project is always safe: every mesh builds its own, and
 * `tint()` hands back a private non-indexed clone on top of that. **Sprites are
 * the exception, and they are not ours** — three.js keeps one module-level
 * quad and gives it to every Sprite ever constructed, so the fifty-odd glints
 * and state markers on a block share a single geometry with each other and with
 * every future block. Disposing it is survivable (the renderer re-uploads on the
 * next frame) and it is still wrong: it is pure churn, and it is exactly the
 * assumption a future `InstancedMesh` would break for real.
 *
 * Materials are the opposite of geometry — `mat()` caches by colour and 38
 * meshes share one `goldLit` — so anything the cache owns is left strictly
 * alone and only the per-build ones (light clones, pool quads, sprite
 * materials, the pool water, the netting) are freed. `isSharedMaterial` is what
 * makes that a check rather than a promise.
 */
function disposeTree(root) {
  if (!root) return;
  root.traverse((o) => {
    if (!o.isSprite) o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m && !isSharedMaterial(m)) m.dispose();
  });
  root.removeFromParent();
}

/** "the park" → "The park", for a button that composes its own noun. */
const sentenceCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Say what went wrong, on screen, and stop.
 *
 * A thrown error used to be survivable in exactly one place — construction —
 * which is why the boot path has always been wrapped: a black canvas with the
 * reason only in a console is no use at all on a phone.
 *
 * Building a block is no longer something that happens only at boot. A swap
 * tears the old one down *first*, so a throw half-way through the rebuild
 * leaves no world and no crow, and the render loop — which re-arms itself
 * before it touches anything — then throws on every frame for the rest of the
 * session behind a frozen picture. Same failure, same remedy, so it is one
 * function now and the swap uses it too.
 */
function fatal(err, headline) {
  console.error(err);
  const el = document.getElementById('loading');
  el.classList.remove('hidden');
  el.style.cssText += 'flex-direction:column;gap:12px;padding:24px;text-align:center;color:#d95f4c';
  el.textContent = `${headline}: ${err.message}`;
}

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
  /**
   * Everything here outlives a block: the renderer, the input abstraction, the
   * audio graph, the HUD's DOM bindings, the UI listeners and the one animation
   * frame loop. Everything a *block* owns is built in `loadLevel`.
   *
   * The split is what lets "Again!" and the next-level button drop you straight
   * into a level instead of reloading the page. That is not only a nicety: the
   * Web Audio context can only be created from a user gesture, so a reload
   * would come back with the whole game silent until the player next pressed
   * something. Keeping one page alive keeps the audio alive with it.
   */
  constructor(levelId) {
    this.stage = new Stage(document.getElementById('c'));
    this.input = new Input();
    this.audio = new Audio();
    /**
     * What survives the tab closing. Constructed before anything reads it, and
     * never allowed to fail — a device that refuses to persist gets an
     * in-memory store and a game that works for exactly one session.
     */
    this.progress = new Progress(undefined, LEVELS.map((l) => l.id));
    /** Which chip the Levels screen has armed. Null while that screen is shut. */
    this._armed = null;

    const first = getLevel(levelId ?? this.progress.continueId(LEVELS));
    this.hud = new Hud(first.goal, TEST_SESSION_SECONDS ?? first.sessionSeconds);

    this._screen = { x: 0, y: 0, visible: false };
    this._acc = 0;
    this._last = performance.now();
    /**
     * Timers that outlive the frame that scheduled them.
     *
     * A gull alarm parks a 2.4s callback that writes to a Human; swap blocks in
     * the meantime and it wakes up holding somebody who is no longer in the
     * scene. Cheap to track, and it keeps a torn-down cast from being kept
     * alive by a pending callback.
     */
    this._timers = new Set();

    const cheats = [];
    if (TEST_TRADE_PAYOUT != null) cheats.push(`trade pays $${TEST_TRADE_PAYOUT.toFixed(2)}`);
    if (TEST_SESSION_SECONDS != null) cheats.push(`day lasts ${TEST_SESSION_SECONDS}s`);
    if (cheats.length) {
      const badge = document.getElementById('testmode');
      badge.textContent = `Test mode · ${cheats.join(' · ')}`;
      badge.hidden = false;
      // The badge and the touch pause control both want top-centre. The badge
      // must stay the more visible of the two — it is one of three tripwires
      // stopping a cheat from shipping — so the control moves down, never it.
      document.body.classList.add('test');
      console.warn(`[Small Change] TEST CHEAT ACTIVE: ${cheats.join('; ')}`);
    }

    this._bindUi();
    /**
     * Where a session starts.
     *
     * An explicit `?level=N` wins — it is how `shoot.mjs` drives the game, how
     * a block gets spot-checked without playing two others first, and what a
     * shared link means. Otherwise the ladder decides, so closing the tab on
     * the park and coming back opens the park.
     */
    this.loadLevel(levelId ?? this.progress.continueId(LEVELS));
    this._paintTitle();
    requestAnimationFrame(this._frame);
  }

  /** setTimeout that a level swap can cancel. */
  _after(ms, fn) {
    const id = setTimeout(() => { this._timers.delete(id); fn(); }, ms);
    this._timers.add(id);
    return id;
  }

  /**
   * Build a block and make it the one being played.
   *
   * Safe to call at boot and safe to call over the top of a block already
   * running — the whole progression system is this function plus a `next` field
   * on the level descriptor.
   *
   * @param {number} id          which block, from world/levels.js
   * @param {boolean} autoStart  skip the title card and start playing at once,
   *   which is what both ending-screen buttons want: "Again!" should put you
   *   back in the park, not in front of a Begin button.
   */
  loadLevel(id, autoStart = false) {
    try {
      this._build(id, autoStart);
    } catch (err) {
      // The old block is already gone by the time anything here can throw, so
      // there is nothing to fall back to — but the player gets told, and the
      // loop is stopped rather than left throwing behind a frozen frame.
      this.running = false;
      fatal(err, 'Lost the thread');
    }
  }

  _build(id, autoStart) {
    this._teardown();

    /** Everything about this run that the block decides. See world/levels.js. */
    this.level = getLevel(id);
    this.goal = this.level.goal;
    // Exposed because TEST_SESSION_SECONDS makes the day length a variable, and
    // a harness that wants "60% of the day" has to be able to ask rather than
    // assume a fixed length — scripts/shoot.mjs measured four identical frames
    // before this existed.
    this.sessionSeconds = TEST_SESSION_SECONDS ?? this.level.sessionSeconds;

    this.world = this.level.build();
    this.stage.scene.add(this.world.root);
    this.stage.registerOccluders(
      [...new Set(this.world.occluders.filter((o) => o && o.isMesh))],
      this.world.nightLights,
    );

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
    // Gulls are pigeons that stay put and object to company. They are the
    // roofline's answer to a roof having no cover on it; the others have none.
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
    this.running = false;
    this.finished = false;
    this.paused = false;
    this.tradeStep = 0;
    this.saltMoved = false;
    this.caught = 0;
    this._taughtNest = false;
    this._taughtTrade = false;
    this._cawCooldown = 0;
    this._acc = 0;
    this.foodPos = null;
    this.foodUntil = 0;
    // Cleared rather than left over from the last ending. Nothing can reach it
    // while a block is running — both readers are gated on `finished` or on a
    // button inside the hidden ending screen — but a stale "next block" sitting
    // on the game between runs is a trap waiting for the next person to add a
    // third reader.
    this._nextId = null;

    this.tasks = this.level.tasks.map((t) => ({ ...t, done: false }));
    this.hud.reset(this.goal, this.sessionSeconds);
    this.hud.setTasks(this.tasks);

    // The camera lags the crow by about 0.2s, which is right on every frame
    // except the first of a new block — `_smoothed` is still parked over the
    // last one, and without this it sails across the map to catch up.
    this.stage.snapTo(this.crow.pos);

    /**
     * Keep the address bar honest, so a refresh reloads the block you are on
     * rather than the one the session started with.
     *
     * Written from `this.level.id` rather than from `id`, because `getLevel`
     * falls back to the first block for anything it does not recognise — so
     * `?level=99` plays the block and the URL should say so instead of
     * preserving a number that means nothing. Edited through a URL object so a
     * hash or any other parameter survives being here.
     */
    try {
      const url = new URL(location.href);
      if (this.level.id === 1) url.searchParams.delete('level');
      else url.searchParams.set('level', String(this.level.id));
      history.replaceState(null, '', url);
    } catch { /* history is unavailable on file://, and this is not worth a crash */ }

    if (autoStart) this.begin();
  }

  /** Drop the free GPU resources of the outgoing block, and only those. */
  _teardown() {
    if (!this.world) return;

    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();

    // Before the meshes go, not after: Stage raycasts its occluder list every
    // frame and owns a private material clone for each one.
    this.stage.clearOccluders();

    // A carried or banked pickup has been reparented under the crow's beak or
    // into the nest, so the scene graph is not a reliable index of them. The
    // arrays are.
    for (const p of this.pickups) disposeTree(p.root);
    for (const h of this.humans) { h.dispose(); disposeTree(h.root); }
    for (const b of this.birds) disposeTree(b.root);
    // Optional chaining because a build that threw half-way leaves a world
    // without a crow, and the teardown that follows must not throw on top of
    // the failure it is trying to clean up after.
    disposeTree(this.crow?.root);
    disposeTree(this.world.root);

    // The night lights are the only lambert materials on level geometry that
    // are clones rather than cache entries, and the pools are additive quads.
    for (const item of this.world.nightLights.items) {
      for (const m of item.materials) m.dispose();
    }

    this.world = null;
    this.crow = null;
    this.pickups = [];
    this.humans = [];
    this.pigeons = [];
    this.gulls = [];
    this.birds = [];
  }

  /** Hide the cards and start play. The one entry point into a running game. */
  begin() {
    this.audio.unlock();
    document.getElementById('title').classList.add('hidden');
    document.getElementById('ending').classList.add('hidden');
    document.getElementById('pause').classList.add('hidden');
    this.hideLevels();
    this.paused = false;
    this.running = true;
    this._last = performance.now();
    this._acc = 0;
    /**
     * Throw away whatever is already held down.
     *
     * Enter is mapped to the beak, and `Input`'s keydown listener is installed
     * before the game's — so the Enter that dismisses the ending screen has
     * already registered a beak press by the time this runs, and the first
     * simulated tick of the new block would spend it. Harmless at all three
     * current spawns and a trap for the first one placed within reach of
     * anything: the block would open by grabbing something on its own.
     */
    this.input.flush();
    this.hud.beginControlsCountdown(10);
    // On touch the list is a real share of a small screen, so it introduces
    // itself and then folds down to a count. On desktop it stays open.
    if (this.input.hasTouch) this.hud.enableTaskAutoCollapse(12);
    // Pausing inside the first 900ms used to eat this outright: the timer fired
    // with `running` false, the toast was skipped, and nothing rescheduled it.
    // Held instead, and delivered on resume.
    this._pendingToast = null;
    this._after(900, () => {
      if (this.running) this.hud.toast('Collect money', 2.2);
      else if (this.paused) this._pendingToast = 'Collect money';
    });
  }

  // ── pause ─────────────────────────────────────────────────────────────────

  /**
   * Stop the simulation without stopping the picture.
   *
   * `elapsed` only advances inside `_tickSim` and `_tickSim` only runs under the
   * `running` guard, so clearing it stops the day clock along with the physics —
   * which is the one thing a pause must not get wrong. Pausing at 6:40 into an
   * eight-minute day and coming back to find the sun down would be worse than
   * having no pause at all.
   *
   * The render half of `_frame` sits *outside* that guard, so the block behind
   * the scrim keeps its camera, its light ramp and its night lights. That is
   * deliberate and it is free.
   */
  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.running = false;
    const where = document.getElementById('pause-where');
    where.textContent = `${sentenceCase(this.level.shortName)} · $${this.total.toFixed(2)} in the nest`;
    document.getElementById('pause').classList.remove('hidden');
  }

  /**
   * Resume, discarding the pause rather than owing it.
   *
   * `_last` and `_acc` are reset exactly as `begin()` resets them. Without it
   * the fixed-step accumulator comes back holding the entire length of the
   * pause and spends it on catch-up ticks — the `steps < 6` clamp bounds the
   * damage to six frames of simulation the player did not ask for, which is
   * still six too many. `input.flush()` is here for the same reason it is in
   * `begin`: the key that dismissed the overlay is still down.
   */
  resume() {
    if (!this.paused) return;
    this.paused = false;
    document.getElementById('pause').classList.add('hidden');
    this.hideLevels();
    this.running = true;
    this._last = performance.now();
    this._acc = 0;
    this.input.flush();
    if (this._pendingToast) {
      this.hud.toast(this._pendingToast, 2.2);
      this._pendingToast = null;
    }
  }

  togglePause() {
    if (this.paused) this.resume();
    else if (this.running) this.pause();
  }

  // ── the Levels screen ─────────────────────────────────────────────────────

  /**
   * Build the chip list from the registry.
   *
   * Names and prices are read off the level descriptor every time rather than
   * cached anywhere, which is the rule that replaced the argument for keeping
   * the list on the title card: two places naming and pricing a block is the
   * thing that decays first. See docs/menu-brief.html §2.
   */
  showLevels() {
    /**
     * `paused` is state; the pause card and the Levels card are two views of
     * it, and only one is up at a time.
     *
     * Leaving the pause card visible underneath was the first thing that broke
     * here, and it broke silently: `#pause` sits at z-index 45 and `.screen` at
     * 40, so the scrim covered the level list and ate every click on it. The
     * screen looked completely correct in a screenshot.
     */
    document.getElementById('pause').classList.add('hidden');
    // And the ending, for the same reason from the other direction: `#ending`
    // is *after* `#levels` in the document at the same z-index, so it paints on
    // top. Both neighbours have to be put away rather than layered.
    document.getElementById('ending').classList.add('hidden');
    document.getElementById('title').classList.add('hidden');
    /**
     * Any pending forfeit dies with the old chip list.
     *
     * Only `hideLevels` used to undo it, and `#forget` re-enters this method
     * *without* leaving first — so forgetting your progress while a forfeit was
     * up left the panel open, the Play/Back row hidden, and `_forfeitTo`
     * pointing at a block that had just been re-locked.
     */
    this._cancelForfeit();
    const open = new Set(this.progress.unlockedIds(LEVELS));
    const list = document.getElementById('levels-list');
    list.replaceChildren();

    /**
     * Arm the block being played if there is one, otherwise the block that is
     * loaded — so the screen agrees with the title card behind it.
     *
     * The clamp is not decoration. `?level=3` deliberately bypasses the lock,
     * so the loaded block can be one the save says is shut; press *Forget my
     * progress* on that page and the armed chip is greyed out while the button
     * beside it offers to play it. Falling back to Continue keeps the armed
     * chip and the button honest with each other in every combination.
     */
    const playing = this.running || this.paused ? this.level.id : null;
    const loaded = open.has(this.level.id) ? this.level.id : this.progress.continueId(LEVELS);
    this._armed = playing ?? loaded;

    for (const level of LEVELS) {
      const unlocked = open.has(level.id);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `chip${unlocked ? '' : ' locked'}`;
      chip.dataset.level = String(level.id);
      chip.disabled = !unlocked;

      let status;
      if (!unlocked) status = 'Locked';
      else if (level.id === playing) status = `Playing · $${this.total.toFixed(2)}`;
      else if (this.progress.isCleared(level.id)) status = '▣ Cleared';
      else status = 'Not yet cleared';

      chip.innerHTML =
        `<span class="n">${String(level.id).padStart(2, '0')}</span>`
        + `<span class="nm"></span>`
        + `<span class="g">$${level.goal.toFixed(0)}</span>`
        + `<span class="st"></span>`;
      // textContent, not innerHTML: level copy is authored data and this is the
      // one place it lands in the DOM as a name rather than as prose.
      chip.querySelector('.nm').textContent = sentenceCase(level.shortName);
      chip.querySelector('.st').textContent = status;

      chip.addEventListener('click', () => this._armLevel(level.id));
      list.appendChild(chip);
    }

    this._paintArmed();
    document.getElementById('levels').classList.remove('hidden');
  }

  hideLevels() {
    document.getElementById('levels').classList.add('hidden');
    this._cancelForfeit();
  }

  /**
   * Close the Levels screen and go back where it was opened from.
   *
   * Three callers — the Back button, Esc, and the browser's idea of "away" —
   * and they must all agree, because the screen is reachable from three places
   * that each want a different thing behind it.
   */
  _leaveLevels() {
    this.hideLevels();
    if (this.paused) document.getElementById('pause').classList.remove('hidden');
    else if (this.finished) document.getElementById('ending').classList.remove('hidden');
    else this.showTitle();
  }

  _armLevel(id) {
    this._armed = id;
    this._cancelForfeit();
    this._paintArmed();
  }

  /** Reflect the armed chip onto the chips and onto the button that acts on it. */
  _paintArmed() {
    for (const chip of document.querySelectorAll('#levels-list .chip')) {
      chip.setAttribute('aria-pressed', String(Number(chip.dataset.level) === this._armed));
    }
    const level = getLevel(this._armed);
    const play = document.getElementById('levels-play');
    const inThisBlock = (this.running || this.paused) && level.id === this.level.id;
    play.textContent = inThisBlock
      ? `Back to ${level.shortName}`
      : `Play ${level.shortName}`;
  }

  /**
   * Act on the armed chip.
   *
   * Three outcomes, and the middle one is the reason this is not just a call to
   * `loadLevel`: picking the block you are already standing in must resume it,
   * not rebuild it. A forfeit prompt for the level you are in is nonsense, and
   * silently restarting it would throw away a run the player was not trying to
   * end.
   */
  _playArmed() {
    const id = this._armed;
    const midRun = this.running || this.paused;

    if (midRun && id === this.level.id) { this.resume(); return; }
    // Something in the nest is something to lose. An empty nest is not, so
    // switching is silent — friction only where there is a stake.
    if (midRun && this.total > 0) { this._askForfeit(id); return; }

    this.hideLevels();
    this.paused = false;
    document.getElementById('pause').classList.add('hidden');
    this.loadLevel(id, true);
  }

  _askForfeit(id) {
    this._forfeitTo = id;
    const target = getLevel(id);
    const copy = document.getElementById('forfeit-copy');
    copy.innerHTML = `<b>Are you sure?</b> You already collected $${this.total.toFixed(2)}.`;
    document.getElementById('forfeit-go').textContent = `Go to ${target.shortName}`;
    document.getElementById('forfeit-stay').textContent = `Stay in ${this.level.shortName}`;
    document.getElementById('forfeit').hidden = false;
    document.getElementById('levels-actions').hidden = true;
  }

  _cancelForfeit() {
    this._forfeitTo = null;
    document.getElementById('forfeit').hidden = true;
    document.getElementById('levels-actions').hidden = false;
  }

  /** The title card, dressed for whoever is looking at it — and for whichever block. */
  _paintTitle() {
    const start = document.getElementById('start');
    const toLevels = document.getElementById('to-levels');

    // The strapline names the goal of the block the card is fronting. Spelled
    // out rather than numeric, because it is prose — the same words the ending
    // headline uses, from the same module.
    const { dollars, cents } = moneyInWords(this.goal);
    document.getElementById('title-goal').textContent =
      [dollars, cents].filter(Boolean).join(', ');

    if (this.progress.isNewPlayer) {
      // Exactly today's card: one brass button, no second one, no evidence a
      // level list exists.
      start.textContent = 'Begin';
      toLevels.hidden = true;
      return;
    }
    start.textContent = `Continue — ${this.level.shortName}`;
    toLevels.hidden = false;
  }

  /**
   * Back to the front door, abandoning whatever was running.
   *
   * The block is **rebuilt**, and that is the whole of this method's job.
   * Clearing the flags and showing the card looks like it is enough and is not:
   * `total`, `elapsed`, the task list and the crow all survive, so quitting
   * four minutes into a run and pressing Begin resumed it — same money, same
   * half-spent day, sun where you left it. That is a mid-run save, which the
   * brief lists as explicitly out of scope, arrived at by accident.
   *
   * `autoStart: false` so it builds behind the title card rather than dropping
   * the player straight back in.
   */
  showTitle() {
    const id = this.level.id;
    this.paused = false;
    this.finished = false;
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('ending').classList.add('hidden');
    this.hideLevels();
    this.loadLevel(id, false);
    this._paintTitle();
    document.getElementById('title').classList.remove('hidden');
  }

  /**
   * Bound once, to permanent nodes. Nothing in here may be re-run on a level
   * swap — the DOM survives it, so a second binding would fire every click
   * twice.
   */
  _bindUi() {
    // Begin on a first visit, Continue afterwards — but always the block that
    // is *loaded*, never a second opinion about which one that should be. The
    // boot path already resolved that question once, and a URL that asked for a
    // specific block must not be overruled by the button on the card.
    document.getElementById('start').addEventListener('click', () => this.begin());

    document.getElementById('to-levels').addEventListener('click', () => this.showLevels());
    document.getElementById('ending-levels').addEventListener('click', () => this.showLevels());
    document.getElementById('pause-levels').addEventListener('click', () => this.showLevels());
    document.getElementById('levels-play').addEventListener('click', () => this._playArmed());
    document.getElementById('levels-back').addEventListener('click', () => this._leaveLevels());

    document.getElementById('forfeit-go').addEventListener('click', () => {
      const id = this._forfeitTo;
      this._cancelForfeit();
      this.hideLevels();
      this.paused = false;
      document.getElementById('pause').classList.add('hidden');
      this.loadLevel(id, true);
    });
    document.getElementById('forfeit-stay').addEventListener('click', () => {
      this._cancelForfeit();
      this._armed = this.level.id;
      this._paintArmed();
    });

    document.getElementById('forget').addEventListener('click', () => {
      this.progress.forget();
      this._paintTitle();
      this.showLevels();
    });

    document.getElementById('resume').addEventListener('click', () => this.resume());
    document.getElementById('restart').addEventListener('click', () => {
      this.paused = false;
      document.getElementById('pause').classList.add('hidden');
      this.loadLevel(this.level.id, true);
    });
    document.getElementById('quit').addEventListener('click', () => this.showTitle());

    const pauseBtn = document.getElementById('btn-pause');
    pauseBtn.addEventListener('click', () => this.togglePause());
    // Matches the other touch controls, which paint their own press state
    // because a phone has no hover to fall back on.
    pauseBtn.addEventListener('pointerdown', () => pauseBtn.classList.add('down'));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
      pauseBtn.addEventListener(ev, () => pauseBtn.classList.remove('down'));
    }


    // Both ending buttons rebuild a block and drop straight into it. "Again!"
    // used to reload the page, which is why it landed you back on the title
    // card — a small thing that made replaying feel like starting over.
    document.getElementById('again')
      .addEventListener('click', () => this.loadLevel(this.level.id, true));
    document.getElementById('onward')
      .addEventListener('click', () => {
        if (this._nextId) this.loadLevel(this._nextId, true);
      });

    addEventListener('keydown', (e) => {
      // Esc is the only key bound while paused, and it is bound in both
      // directions. It closes the Levels screen first when that is what is on
      // top, so a player who opened it mid-run gets back to the game in two
      // presses rather than being trapped behind it.
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!document.getElementById('levels').classList.contains('hidden')) this._leaveLevels();
        else this.togglePause();
        e.preventDefault();
        return;
      }

      // Enter takes whatever the loudest button on screen is: Begin before the
      // first run, and afterwards the block the ending is offering — falling
      // back to a replay on the last block and on a loss, which is exactly the
      // button that is brass in each case. Paused, that button is Resume.
      if (e.code === 'Enter' && !this.running) {
        if (this.paused) this.resume();
        else if (this.finished) this.loadLevel(this._nextId ?? this.level.id, true);
        else if (document.getElementById('levels').classList.contains('hidden')) this.begin();
      }
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
        // What a trade is worth depends on what it costs to make one, which is
        // a property of the block. See `tradeValues` in world/levels.js.
        const values = this.level.tradeValues;
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
      this._after(2400, () => { if (h.lookAt && h.lookAt.x === gull.pos.x) h.lookAt = null; });
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
        this._after(2600, () => { if (h.lookAt === at) h.lookAt = null; });
      }
    }
    for (const p of this.birds) {
      const d = Math.hypot(p.pos.x - at.x, p.pos.z - at.z);
      if (d < 5 && Math.abs(at.y - p.floorY) < 2) {
        p.target.set(p.pos.x + (p.pos.x - at.x), p.floorY, p.pos.z + (p.pos.z - at.z));
      }
    }
  }

  /**
   * Dress the ending screen's two ways out.
   *
   * There is always exactly one brass button, and it is whatever the block
   * wants to happen next: the block after this one if you earned it, a replay
   * otherwise. The outlined button only appears when there is a genuine choice
   * to make, so a losing screen and the last block both offer a single
   * unambiguous action rather than two of equal weight.
   *
   * Losing offers no way forward on purpose. The whole progression rule is that
   * you reach a block by finishing the one before it, and a next-level button
   * on a run that ran out of light quietly repeals that.
   */
  _setEndingActions(won) {
    const onward = document.getElementById('onward');
    const again = document.getElementById('again');
    this._nextId = won ? (this.level.next ?? null) : null;

    if (this._nextId) {
      const next = getLevel(this._nextId);
      onward.innerHTML = `${sentenceCase(next.shortName)} <span class="arw">→</span>`;
      onward.hidden = false;
      again.classList.add('ghost');
    } else {
      onward.hidden = true;
      again.classList.remove('ghost');
    }
  }

  _finish(won) {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.paused = false;
    document.getElementById('pause').classList.add('hidden');
    this.audio.transform();

    /**
     * The one write of the whole feature.
     *
     * Only a win opens the next door — losing is a complete and legitimate way
     * to end a session, it just does not clear the block. The best run is
     * written here too and read by nothing yet, because recording it is free
     * and cannot be done retroactively: a best that starts being written the
     * day it is first displayed shows every returning player an empty history
     * of runs they actually played. See docs/menu-brief.html §3.
     */
    this.progress.recordRun(this.level.id, {
      won,
      total: this.total,
      secs: this.elapsed,
    });
    this._paintTitle();

    this._setEndingActions(won);

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
      // No spelled-out headline to wait for, so nothing below it should be
      // holding a delay left over from a win earlier in the session.
      for (const id of ['rank', 'ending-body', 'ending-actions']) {
        document.getElementById(id).style.animationDelay = '';
      }
    }
    // Shown first, re-armed second, and the order is the whole point: the
    // screen is `display: none` until that class comes off, and a reflow read
    // on a `display: none` element measures nothing and restarts nothing.
    document.getElementById('ending').classList.remove('hidden');
    replayEndingAnimation();
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

    /**
     * There may be no block to draw.
     *
     * A swap tears the old one down before building the new one, so a rebuild
     * that throws leaves this loop with no world and no crow — and the loop
     * re-arms itself above before it touches either. Without this guard that is
     * sixty exceptions a second, for the rest of the session, on top of a
     * frozen picture: the console fills with the same line and the real error
     * scrolls away. `fatal` has already put the reason on screen; the loop's
     * job now is to be quiet.
     */
    if (!this.world) return;

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

    /**
     * The picture keeps moving while paused; the HUD's countdowns do not.
     *
     * `Hud.update` drains the toast, the controls legend and the task list from
     * real `dt`, all of which sit *behind* the scrim — so a ten-second pause
     * collapsed the legend and a twelve-second one folded the task list away,
     * both invisibly, and the player came back to a HUD that had rearranged
     * itself for no reason they could see. Freezing dt is enough: nothing in
     * there integrates, it only counts down.
     */
    this.hud.update(this.paused ? 0 : dt);
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
  const game = new Game(START_LEVEL);
  // Dev-only handle so scripts/shoot.mjs can inspect any part of the block
  // instead of only wherever the crow happens to have flown. Stripped from
  // production builds by Vite's dead-code elimination.
  if (import.meta.env?.DEV) window.__game = game;
} catch (err) {
  fatal(err, 'Could not start');
}
