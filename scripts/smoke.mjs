/**
 * Headless smoke test.
 *
 * Builds the whole world and runs the simulation for a simulated minute with no
 * WebGL context — everything except the renderer is plain three.js maths, so
 * this catches the class of bug that would otherwise only show up as a blank
 * canvas: bad API calls, undefined reads, NaN in the physics, broken collision.
 *
 *   node scripts/smoke.mjs
 */

import * as THREE from 'three';

// ── minimal DOM, for the one place we build a canvas texture ────────────────
const fakeGradient = { addColorStop() {} };
class FakeCtx {
  clearRect() {} strokeText() {} fillText() {} fillRect() {}
  beginPath() {} moveTo() {} lineTo() {} stroke() {}
  save() {} restore() {} translate() {} rotate() {}
  createRadialGradient() { return fakeGradient; }
  createLinearGradient() { return fakeGradient; }
  set font(_) {} set textAlign(_) {} set textBaseline(_) {}
  set lineWidth(_) {} set strokeStyle(_) {} set fillStyle(_) {}
  set globalCompositeOperation(_) {}
}
globalThis.document = {
  createElement: (tag) => {
    if (tag !== 'canvas') return {};
    return { width: 0, height: 0, getContext: () => new FakeCtx(), style: {} };
  },
};
globalThis.window = globalThis;
// Node 26 ships a read-only `navigator`; nothing under test reads it, so leave it.

const { LEVELS } = await import('../src/world/levels.js');
const { RULES } = await import('../src/world/rules.js');
const { overlaps, blocksWalker, deckAt, WALKER_RADIUS, WALKER_HEIGHT, WALKER_STEP_OVER, inWaterXZ, waterExtent } = await import('../src/world/collide.js');
const { Crow, TUNING: CROW } = await import('../src/entities/crow.js');
const { Human, Pigeon, Gull } = await import('../src/entities/human.js');
const { Pickup, BAIT_KINDS } = await import('../src/world/pickups.js');
const { NightLights } = await import('../src/render/nightlights.js');
const { PAL, SKY_RAMP } = await import('../src/render/palette.js');
const { mat } = await import('../src/render/shapes.js');
// Imported for the audit's orphaned-night-light check, which has to run the
// real occluder swap rather than a copy of it. Stage itself is never
// constructed here — it would want a WebGL context — but the module is safe
// to import: nothing at its top level touches the DOM.
const { prepareOccluders } = await import('../src/render/stage.js');
const { auditLevel } = await import('./audit-level.mjs');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) { console.log(`  ok   ${name}`); }
  else { console.log(`  FAIL ${name} ${detail}`); failures++; }
};

const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

console.log('\nmoney in words');
const { moneyInWords } = await import('../src/ui/words.js');
const say = (n) => {
  const { dollars, cents } = moneyInWords(n);
  return [dollars, cents].filter(Boolean).join(', ');
};
for (const [amount, expected] of [
  [20.00, 'twenty dollars'],
  [22.66, 'twenty-two dollars, sixty-six cents'],
  [20.01, 'twenty dollars, one cent'],
  [21.00, 'twenty-one dollars'],
  [33.95, 'thirty-three dollars, ninety-five cents'],
  [1.00,  'one dollar'],
  [0.05,  'five cents'],
  [0.00,  'zero dollars'],
  [40.10, 'forty dollars, ten cents'],
  [115.15,'one hundred fifteen dollars, fifteen cents'],
]) {
  check(`$${amount.toFixed(2)} reads as "${expected}"`, say(amount) === expected, `(got "${say(amount)}")`);
}
// Floating-point sums of pennies must not drift into the wrong words.
let drift = 0;
for (let i = 0; i < 2066; i++) drift += 0.01;
check('a sum of 2066 pennies still reads correctly',
  say(drift) === 'twenty dollars, sixty-six cents', `(got "${say(drift)}")`);

console.log('\nranks');
const { rankFor, formatRankLine, RANKS, UNFINISHED } = await import('../src/ui/rank.js');
const run = (o) => ({ won: true, elapsed: 400, caught: 3, traded: true, tasksDone: 2, totalTasks: 5, ...o });

for (const [label, state, expected] of [
  ['never caught beats everything', run({ caught: 0, elapsed: 900 }), 'Model Citizen'],
  ['a genuinely fast run',          run({ elapsed: 120 }),            'Corvid Prodigy'],
  ['2m07s (the real playtest run)', run({ elapsed: 127 }),            'Corvid Prodigy'],
  ['all theft, no trading',         run({ traded: false }),           'Career Criminal'],
  ['cleared the list',              run({ tasksDone: 5 }),            'Thorough Bird'],
  ['a solid time',                  run({ elapsed: 300 }),            'Accomplished Thief'],
  ['took a beating',                run({ elapsed: 600, caught: 7 }), 'Persistent Bird'],
  ['got there eventually',          run({ elapsed: 600 }),            'Bird About Town'],
  ['ran out of light',              run({ won: false, caught: 0 }),   UNFINISHED],
]) {
  check(`${label} → ${expected}`, rankFor(state) === expected, `(got ${rankFor(state)})`);
}

// The old ladder handed the top rank to any informed run; the new one must not.
check('a middling 4-minute run is no longer a prodigy',
  rankFor(run({ elapsed: 240 })) !== 'Corvid Prodigy', `(got ${rankFor(run({ elapsed: 240 }))})`);
check('every rank is reachable — none is shadowed by an earlier test',
  RANKS.every((r) => RANKS.findIndex((x) => x.title === r.title) ===
    RANKS.findIndex((x) => x.test({
      won: true, elapsed: 400, caught: 3, traded: true, tasksDone: 2, totalTasks: 5,
      ...(r.title === 'Model Citizen' ? { caught: 0 } : {}),
      ...(r.title === 'Corvid Prodigy' ? { elapsed: 100 } : {}),
      ...(r.title === 'Career Criminal' ? { traded: false } : {}),
      ...(r.title === 'Thorough Bird' ? { tasksDone: 5 } : {}),
      ...(r.title === 'Accomplished Thief' ? { elapsed: 300 } : {}),
      ...(r.title === 'Persistent Bird' ? { elapsed: 600, caught: 7 } : {}),
      ...(r.title === 'Bird About Town' ? { elapsed: 600 } : {}),
    }))));
check('the eyebrow names the catch count, not the money',
  formatRankLine(run({ elapsed: 127, caught: 0 })) === 'Model Citizen · 2m 07s · never caught',
  `(got "${formatRankLine(run({ elapsed: 127, caught: 0 }))}")`);
check('being caught is counted in the eyebrow',
  formatRankLine(run({ elapsed: 127, caught: 3 })).endsWith('caught ×3'),
  `(got "${formatRankLine(run({ elapsed: 127, caught: 3 }))}")`);

/**
 * The rank ladder's own thresholds, probed rather than hardcoded, so the lamp
 * timing stays true if the ranks are ever retuned.
 */
const clean = (elapsed) => rankFor({ won: true, elapsed, caught: 1, traded: true, tasksDone: 1, totalTasks: 5 });
const cutoff = (title) => {
  for (let e = 10; e < 3600; e += 5) if (clean(e) !== title) return e;
  return Infinity;
};
const FAST = cutoff('Corvid Prodigy');            // 150s — a speedrun
const SOLID = (() => { let e = FAST; while (e < 3600 && clean(e) === 'Accomplished Thief') e += 5; return e; })();

/**
 * The HUD's position filter.
 *
 * Pure and static, so it is testable here rather than only through a browser —
 * which matters, because the two bugs it has had were both invisible in a
 * screenshot. It smooths the projected screen point behind the beak prompt and
 * the nest pointer, whose jitter measured six times their actual motion.
 */
console.log('\nHUD position filter');
{
  const { Hud } = await import('../src/ui/hud.js');
  const at = { x: 100, y: 100 };

  check('no previous position snaps', Hud._ease(null, 50, 60, 0.016).x === 50);
  check('a zero dt snaps rather than dividing by nothing',
    Hud._ease(at, 150, 100, 0).x === 150);

  const near = Hud._ease(at, 110, 100, 0.016);
  check('a small move is eased, not taken whole',
    near.x > 100 && near.x < 110, `(got ${near.x.toFixed(2)})`);
  check('and it moves toward the target', near.x > at.x);

  // Crossing behind the camera flips the projection through the origin, which
  // is a jump between two unrelated places rather than motion.
  const far = Hud._ease(at, 1200, 700, 0.016);
  check('a jump across the screen is taken whole', far.x === 1200 && far.y === 700);

  /**
   * NaN must snap, not ease.
   *
   * `Math.hypot(NaN, NaN) > T` is false, so a naive `>` sent NaN into the
   * filter — and once the stored position held NaN, every later frame stayed
   * NaN, because NaN never exceeds a threshold either. The element then froze
   * for the rest of the run, since `translate3d(NaNpx, …)` is silently ignored.
   */
  const nan = Hud._ease(at, NaN, NaN, 0.016);
  check('a NaN position snaps instead of poisoning the filter',
    Number.isNaN(nan.x) && !Number.isFinite(nan.x));
  const recovered = Hud._ease(nan, 300, 300, 0.016);
  check('and the very next good frame recovers',
    recovered.x === 300 && recovered.y === 300,
    `(got ${recovered.x})`);

  // Repeated easing converges rather than overshooting or oscillating.
  let p = { x: 0, y: 0 };
  for (let i = 0; i < 40; i++) p = Hud._ease(p, 100, 100, 0.016);
  check('easing converges on the target', Math.abs(p.x - 100) < 0.5, `(got ${p.x.toFixed(2)})`);
}

/**
 * Saved progress.
 *
 * Every case here is a way a save file can be wrong rather than a way it can be
 * right, because the right case is one line and the wrong ones are the whole
 * reason the module exists. See docs/menu-brief.html §8.
 */
console.log('\nsaved progress');
const { Progress, memoryStorage, SAVE_KEY, SAVE_VERSION } =
  await import('../src/core/save.js');

/** A ladder to test the unlock rules against, so they are not only ever tested on three blocks. */
const LADDER = [
  { id: 1, next: 2 }, { id: 2, next: 3 }, { id: 3, next: 4 }, { id: 4, next: null },
];
const KNOWN = LADDER.map((l) => l.id);
const withRaw = (raw) => {
  const s = memoryStorage();
  if (raw !== undefined) s.setItem(SAVE_KEY, raw);
  return new Progress(s, KNOWN);
};

{
  const s = memoryStorage();
  const p = new Progress(s, KNOWN);
  p.recordRun(1, { won: true, total: 32.4, secs: 252 });
  p.recordRun(2, { won: true, total: 27.1, secs: 398 });
  const reloaded = new Progress(s, KNOWN);
  check('a cleared set round-trips through save and load',
    reloaded.cleared.join(',') === '1,2', `(got "${reloaded.cleared.join(',')}")`);
  check('a best round-trips with it',
    reloaded.bestFor(1)?.total === 32.4 && reloaded.bestFor(1)?.secs === 252,
    `(got ${JSON.stringify(reloaded.bestFor(1))})`);
  check('the blob carries no floats',
    !/\.\d/.test(s.getItem(SAVE_KEY)), `(${s.getItem(SAVE_KEY)})`);
}

// A run that banks less is not a better run, whatever the clock says. Money is
// the goal of this game; time only breaks a tie.
{
  const p = withRaw();
  p.recordRun(1, { won: true, total: 32.40, secs: 252 });
  p.recordRun(1, { won: true, total: 21.00, secs: 90 });
  check('a worse run does not overwrite a best', p.bestFor(1).total === 32.40,
    `(got ${p.bestFor(1).total})`);
  p.recordRun(1, { won: true, total: 32.40, secs: 200 });
  check('the same money in less time does', p.bestFor(1).secs === 200,
    `(got ${p.bestFor(1).secs})`);
  p.recordRun(3, { won: false, total: 99, secs: 10 });
  check('losing clears nothing and records nothing',
    !p.isCleared(3) && p.bestFor(3) === null);
}

// Every one of these must land on "no progress" rather than on a throw. A save
// file that crashes the title card is worse than no save file.
for (const [label, raw] of [
  ['garbage', 'not json at all'],
  ['a truncated blob', '{"v":1,"cleared":[1,2'],
  ['a JSON array', '[1,2,3]'],
  ['a JSON string', '"cleared"'],
  ['null', 'null'],
  ['a wrong version', JSON.stringify({ v: SAVE_VERSION + 1, cleared: [1, 2, 3] })],
  ['a missing version', JSON.stringify({ cleared: [1, 2, 3] })],
  ['cleared as an object', JSON.stringify({ v: SAVE_VERSION, cleared: { 1: true } })],
]) {
  let threw = null;
  let p = null;
  try { p = withRaw(raw); } catch (e) { threw = e; }
  check(`${label} reads as no progress`,
    !threw && p && p.cleared.length === 0, threw ? `(threw ${threw.message})` : '');
}

// One malformed field must not condemn the rest of the blob — a garbage `best`
// costs you a best, not a ladder.
{
  const p = withRaw(JSON.stringify({ v: SAVE_VERSION, cleared: [1, 2], best: [1, 2] }));
  check('a malformed best does not discard the cleared list',
    p.cleared.join(',') === '1,2' && p.bestFor(1) === null,
    `(got "${p.cleared.join(',')}")`);
}

{
  const p = withRaw(JSON.stringify({
    v: SAVE_VERSION,
    cleared: [1, 9, 2, 2, -3, 'x', null],
    best: { 9: { cents: 100, secs: 5 }, 1: { cents: 'x', secs: 5 } },
  }));
  check('ids this build does not know are dropped',
    p.cleared.join(',') === '1,2', `(got "${p.cleared.join(',')}")`);
  check('a best for an unknown id is dropped', p.bestFor(9) === null);
  check('a malformed best is dropped, without taking the cleared list with it',
    p.bestFor(1) === null && p.isCleared(1));
}

// Safari private mode throws on access; a full quota throws on write; a
// WKWebView can do either. None of it may reach the player.
{
  const hostile = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() { throw new Error('SecurityError'); },
  };
  let threw = null;
  let p = null;
  let clearedInMemory = false;
  try {
    p = new Progress(hostile, KNOWN);
    p.recordRun(1, { won: true, total: 20, secs: 100 });
    clearedInMemory = p.isCleared(1);
    p.forget();
  } catch (e) { threw = e; }
  check('a storage that throws on every call never raises',
    !threw, threw ? `(threw ${threw.message})` : '');
  check('and the session still works in memory', clearedInMemory);
  check('and a failed write is reported as failed, not thrown',
    p && p.save() === false);
  check('forgetting still empties it when the disk refuses',
    p && p.cleared.length === 0);
}

check('memory storage declares itself volatile', memoryStorage().volatile === true);

// The ladder rules, on an invented four-rung ladder.
{
  const none = withRaw();
  check('the first block is open to a new player',
    none.unlockedIds(LADDER).join(',') === '1', `(got "${none.unlockedIds(LADDER)}")`);
  check('a new player continues at the first block', none.continueId(LADDER) === 1);
  check('a new player is a new player', none.isNewPlayer);

  const p = withRaw();
  p.recordRun(1, { won: true, total: 20, secs: 100 });
  check('clearing a block opens exactly the one it names',
    p.unlockedIds(LADDER).sort().join(',') === '1,2', `(got "${p.unlockedIds(LADDER)}")`);
  check('and nothing further along', !p.isUnlocked(3, LADDER));

  p.recordRun(2, { won: true, total: 25, secs: 100 });
  p.recordRun(3, { won: true, total: 30, secs: 100 });
  check('Continue resolves to the furthest opened block', p.continueId(LADDER) === 4,
    `(got ${p.continueId(LADDER)})`);
  // The distinction the button's promise rests on: replaying an old block must
  // not drag Continue backwards with it.
  p.recordRun(1, { won: true, total: 33, secs: 90 });
  check('replaying an earlier block does not move Continue back',
    p.continueId(LADDER) === 4, `(got ${p.continueId(LADDER)})`);
}

// A save from a longer ladder, loaded by a build that has fewer blocks in it.
{
  const s = memoryStorage();
  s.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, cleared: [1, 2, 3, 4, 5, 6] }));
  const short = new Progress(s, [1, 2, 3]);
  check('a save from a longer ladder loads clean on a shorter build',
    short.cleared.join(',') === '1,2,3', `(got "${short.cleared.join(',')}")`);
  check('and cannot unlock a block that does not exist',
    short.unlockedIds(LADDER.slice(0, 3)).every((id) => id <= 3));
}

// Against the real registry, so the shipped ladder is walkable end to end.
{
  const ids = LEVELS.map((l) => l.id);
  const p = new Progress(memoryStorage(), ids);
  let open = p.unlockedIds(LEVELS);
  const reached = new Set(open);
  for (let i = 0; i < LEVELS.length + 2 && open.length; i++) {
    for (const id of open) p.recordRun(id, { won: true, total: 999, secs: 10 });
    open = p.unlockedIds(LEVELS).filter((id) => !reached.has(id));
    for (const id of open) reached.add(id);
  }
  check('every shipped block is reachable by clearing its predecessor',
    reached.size === LEVELS.length, `(reached ${[...reached].join(',')} of ${ids.join(',')})`);
  check('the last block ends the ladder',
    LEVELS[LEVELS.length - 1].next == null);
}

// Two places naming or pricing a block is the thing that decays first, so the
// menu is not allowed a second copy of either.
{
  const missing = LEVELS.filter((l) => !l.shortName || typeof l.goal !== 'number');
  check('every block carries the name and goal a chip reads',
    missing.length === 0, `(${missing.map((l) => l.id).join(',')})`);
}

function auditLights(level, world) {
  console.log(`\nlights at dusk [L${level.id}]`);
  const say = (t) => `${t} [L${level.id}]`;
  const night = world.nightLights;

  // A pool drives `opacity` on a MeshBasicMaterial; an emissive source drives
  // `emissiveIntensity`. Everything that asks "is it off?" has to read whichever
  // one this light actually uses.
  // A light may drive more than one material — see NightLights.follow — but
  // they are all written together, so the first one speaks for the item.
  const output = (i) => (i.pool ? i.materials[0].opacity : i.materials[0].emissiveIntensity);
  const pools = night.items.filter((i) => i.pool);

  /**
   * A pool is built hidden — asserted *here*, before anything drives the ramp.
   *
   * This has to run before the first `night.update` of the block and it is the
   * whole point of the check. `transparent: true` puts a mesh in the
   * transparent pass whatever its opacity, so a pool at zero is still
   * rasterised and blended across its whole disc; the daylight half of a run
   * happens before `update` ever crosses a level, so **build-time visibility is
   * the entire saving**.
   *
   * The first version of this check sat further down the file, after the ramp
   * had already been driven up and wound back. That runs the toggle path in
   * `update`, which sets `visible = false` on its own — so the assertion was
   * reading a value `update` had written and would have passed with
   * `addPool`'s line deleted and 2.5-4 screens of overdraw back in the frame.
   * A check that runs after the thing it checks for has been overwritten by
   * something else passes for free.
   */
  check(say('a pool is built hidden, before the ramp ever runs'),
    pools.every((i) => i.mesh && i.mesh.visible === false),
    `(${pools.filter((i) => !i.mesh || i.mesh.visible).length} of ${pools.length} drawn at build)`);

  /**
   * The sunset has to actually happen inside a session someone will play.
   *
   * At 18 minutes it did not: the light held steady until 10m48s and the lamps
   * caught at 12m58s, while the real playtest run is 2m07s and the rank ladder's
   * fast cutoff is 2m30s. Every hour of lighting work was unreachable in normal
   * play and no test noticed, because each half was individually correct — the
   * lamps fired at the right *fraction* of a day nobody was still playing.
   *
   * A block may start partway into the afternoon, so the trigger has to be
   * converted from a time of day into a time on this level's clock before any of
   * it means anything. Level 2 starts at 0.42 and its lamps catch at 4m08s, not
   * at the 5m46s the same 0.72 buys on the block — and it is precisely that sort
   * of "right fraction of the wrong day" arithmetic that shipped the bug this
   * whole check exists for.
   */
  const d0 = level.dayStart;
  const lampsAt = ((RULES.lampsOnAt - d0) / (1 - d0)) * level.sessionSeconds;
  console.log(`       lamps catch at ${Math.floor(lampsAt / 60)}m${String(Math.round(lampsAt % 60)).padStart(2, '0')}s`
    + ` of a ${level.sessionSeconds}s day starting at t=${d0}`);

  check(say('the lamps catch inside the session at all'),
    lampsAt > 0 && lampsAt < level.sessionSeconds,
    `(${Math.round(lampsAt)}s of ${level.sessionSeconds}s)`);

  check(say('a fast run is rewarded with daylight — the lamps catch after it ends'),
    lampsAt > FAST, `(lamps ${Math.round(lampsAt)}s vs fast cutoff ${FAST}s)`);

  /**
   * The upper bound is the one that matters, and the first version of this
   * check did not have it — it passed happily at eighteen minutes, which is the
   * exact bug it was written for. Guarding only against a day that is too short
   * misses the failure that actually shipped: lamps firing so late that no real
   * run reaches them. 1.5x the ladder's "did fine" time is the outer edge of a
   * session someone actually plays.
   */
  check(say('a normal run reaches the sunset — the lamps are not stranded past it'),
    lampsAt < SOLID * 1.5,
    `(lamps ${Math.round(lampsAt)}s vs 1.5x the ${SOLID}s solid-run mark)`);

  check(say('there is enough lit dusk left to be worth building'),
    level.sessionSeconds - lampsAt > 90,
    `(only ${Math.round(level.sessionSeconds - lampsAt)}s of dusk)`);
  check(say('the slowest rank is still winnable inside the session'),
    level.sessionSeconds > SOLID, `(session ${level.sessionSeconds}s vs ${SOLID}s)`);

  check(say('the street lights catch at the documented hour'),
    night.trigger === RULES.lampsOnAt, `(${night.trigger} vs RULES ${RULES.lampsOnAt})`);
  check(say('the block registers night lights'), night.items.length >= 8, `(${night.items.length})`);
  check(say('the block registers ground pools'), pools.length >= 6, `(${pools.length})`);
  check(say('nothing is emitting during the day'), night.items.every((i) => output(i) === 0));

  /**
   * The cache trap, asserted. `shapes.mat()` hands the same material to every
   * mesh of a colour — 38 of them share `goldLit`. If a light were registered by
   * mutating that material instead of a clone, every lamp bulb, every skyline
   * window and anything else gold would come on as one object with one
   * schedule, and there would be no way to stagger them.
   */
  // `emissiveIntensity` defaults to 1 on a fresh material; what makes one inert
  // is a black `emissive`. Checking the intensity here would fail on a material
  // nobody has touched.
  const cached = mat(PAL.goldLit);
  check(say('registering a light did not poison the shared material cache'),
    cached.emissive.getHex() === 0,
    `(cached goldLit emissive #${cached.emissive.getHexString()})`);
  check(say('every night light has its own material, none is the cached one'),
    night.items.every((i) => !i.materials.includes(cached)));

  // Before the trigger nothing is on, however long the frame.
  night.update(0.5, 10);
  check(say('nothing comes on before the trigger'), night.items.every((i) => output(i) === 0));

  // A lamp that flickers must actually flicker: bright, dark, bright.
  const lamp = night.items.find((i) => i.flicker && i.delay === 0);
  const trace = [0.02, 0.10, 0.16, 0.24].map((s) => NightLights.levelAt(lamp, s));
  check(say('a lamp catches with a stutter before it warms'),
    trace[0] > 0.5 && trace[1] < 0.1 && trace[2] > 0.5 && trace[3] < 0.1,
    `(${trace.map((v) => v.toFixed(2)).join(', ')})`);

  // And everything reaches full, in order, within a sensible wall-clock time.
  const slowest = Math.max(...night.items.map((i) => i.delay + i.warm));
  night.update(0.99, slowest + 1.5);
  const short = night.items.filter((i) => output(i) < i.peak - 1e-6);
  check(say(`every light reaches full by ${(slowest + 1.5).toFixed(1)}s after sundown`),
    short.length === 0, `(${short.length} still ramping)`);

  // Scrubbing time backwards re-arms the sequence rather than leaving the block
  // lit in daylight — which is exactly what a debug session or a replay does.
  night.update(0.1, 0.016);
  check(say('winding the clock back turns the block off again'),
    night.items.every((i) => output(i) === 0));

  /**
   * The bug that cost a whole round of tuning. A CanvasTexture defaults to
   * NoColorSpace, so three.js reads the gradient as linear data while the
   * renderer outputs sRGB — an amber authored as (255,206,120) reaches the
   * screen as roughly (255,234,183), a near-white cream. It measured as a pool
   * 40% brighter and 0% warmer, and no amount of retinting the stops would have
   * fixed it. Asserted because it is invisible in code review and only shows up
   * as "the light looks a bit washed out".
   */
  check(say('pool textures are tagged sRGB, not left linear'),
    pools.every((i) => i.materials[0].map && i.materials[0].map.colorSpace === THREE.SRGBColorSpace),
    `(${pools.map((i) => i.materials[0].map?.colorSpace || 'none').join(', ')})`);

  /**
   * A pool is light, not geometry that light falls on — and specifically it must
   * not write depth. That is what lets the crow stand on top of one and stay a
   * silhouette, which is how "the crow is the darkest thing on screen" survives
   * putting light on the ground it walks over.
   */
  check(say('pools are additive and write no depth'),
    pools.every((i) => i.materials[0].blending === THREE.AdditiveBlending
      && i.materials[0].depthWrite === false && i.materials[0].fog === false));

  /**
   * A pool at zero is not drawn at all.
   *
   * `transparent: true` puts a mesh in the transparent pass and three.js draws
   * it whatever its opacity is, so every pool used to be rasterised and blended
   * across its whole disc for the daylight half of a run, adding nothing to any
   * pixel — 16% of the lobby's frame at midday for eighteen invisible quads.
   *
   * Asserted in both directions, because the failure that matters is not "a
   * pool was drawn while dark" (wasteful) but "a pool never came back" (a block
   * that goes dark at dusk and stays dark). The dusk luminance floors in
   * `shoot` are the second guard on that.
   */
  check(say('every pool has a mesh to hide'), pools.every((i) => !!i.mesh));
  // "Hidden in daylight" is asserted at build time, further up — down here the
  // ramp has already been driven, so `update`'s own toggle would have set it
  // and the check would pass with the constructor's line deleted. What is worth
  // testing here is the *toggle*, in both directions.
  night.since = 0;
  for (let s = 0; s < 24; s += 0.1) night.update(1, 0.1);
  check(say('every pool is drawn once it is lit'),
    pools.every((i) => i.mesh.visible === true),
    `(${pools.filter((i) => !i.mesh.visible).length} still hidden)`);
  // And winding the clock back puts them away again, which is what a level
  // rebuild and a scrubbed test both do.
  night.since = 0;
  night.update(0, 0.016);
  check(say('winding the clock back hides them again'),
    pools.every((i) => i.mesh.visible === false));

}

console.log('\nthe sky ramp');
{
  /**
   * Shade is violet, never grey — and after the fill colour was split off the
   * horizon glow, never rust either. Checked as blue-beats-red on the colour
   * that lights every up-facing surface the key does not reach. One ramp serves
   * every block, so this is asserted once.
   */
  const dusk = SKY_RAMP[SKY_RAMP.length - 1];
  const fillB = dusk.fill & 0xff, fillR = (dusk.fill >> 16) & 0xff;
  check('the colour of shade at dusk is violet, not rust',
    fillB > fillR + 20, `(fill #${dusk.fill.toString(16)} — r${fillR} b${fillB})`);
  check('the ramp lifts the ambient floor through the back half of the day',
    dusk.amb > SKY_RAMP[0].amb, `(${dusk.amb} at dusk vs ${SKY_RAMP[0].amb} at noon)`);
}

// ── every block, every rule ─────────────────────────────────────────────────
const deps = {
  RULES, overlaps, blocksWalker, deckAt, WALKER_RADIUS, WALKER_HEIGHT, WALKER_STEP_OVER,
  inWaterXZ, waterExtent,
  Crow, CROW, Human, Pigeon, Gull, Pickup, BAIT_KINDS, prepareOccluders,
};
const summary = [];
for (const level of LEVELS) {
  const world = level.build();
  summary.push({ level, ...auditLevel({ level, world, check, deps }) });
  auditLights(level, world);
}

console.log('\nthe blocks, side by side');
console.log('       level                meshes  colliders   money  unguarded  climb');
for (const s of summary) {
  console.log(`       ${String(s.level.id + '. ' + s.level.title).padEnd(20)} `
    + `${String(s.meshCount).padStart(6)}  ${String(s.colliders).padStart(9)}  `
    + `${('$' + s.money.toFixed(2)).padStart(6)}  ${('$' + s.free.toFixed(2)).padStart(9)}  `
    + `${(s.toNest.toFixed(1) + 'm').padStart(5)}`);
}

/**
 * The pianist's repertoire — pure logic, so it is testable with no audio
 * context at all. `Audio`'s constructor deliberately builds nothing until
 * `unlock()`, and `piano()` advances its cursor and computes its length before
 * it looks for a context, which is what makes this possible.
 */
console.log('\nthe pianist');
{
  const { Audio } = await import('../src/core/audio.js');
  const a = new Audio();
  const names = Audio.SONGS.map((x) => x.name);
  check(`there is more than one piece (${names.length})`, names.length > 1, `(${names.join(', ')})`);
  check('every piece has a name and notes',
    Audio.SONGS.every((x) => x.name && x.notes.length > 3 && x.tail));

  // In order, and it wraps. This is the whole reason the rotation is a cursor
  // rather than a Math.random: a sequence can be asserted and a shuffle cannot.
  const played = [];
  const lengths = [];
  for (let i = 0; i < names.length * 2 + 1; i++) {
    played.push(Audio.SONGS[a.songIndex % names.length].name);
    lengths.push(a.piano());
  }
  const wanted = [...names, ...names, names[0]];
  check('the pieces play in order and wrap', JSON.stringify(played) === JSON.stringify(wanted),
    `(${played.join(' → ')})`);

  /**
   * And none of them runs away. The cue is scheduled in one go against the
   * audio clock, so a badly authored song is not a frame-rate problem — it is
   * a player standing next to a piano unable to do anything else for a minute,
   * which no other check in this file would catch.
   */
  const strays = lengths.filter((n) => !(n > 8 && n < 20));
  check('every piece runs between 8 and 20 seconds', strays.length === 0,
    `(${lengths.map((n) => n.toFixed(1)).join(', ')})`);
  const spread = Math.max(...lengths) - Math.min(...lengths);
  check('the pieces are all about the same length', spread < 3,
    `(spread ${spread.toFixed(1)}s)`);
  console.log(`       ${names.length} pieces, ${lengths.slice(0, names.length).map((n) => n.toFixed(1) + 's').join(' / ')}`);

  // A muted player must see the same rotation a listening one does, or turning
  // the sound off parks the pianist on one song forever.
  const b2 = new Audio();
  b2.setMuted(true);
  b2.piano(); b2.piano();
  check('the rotation advances even when muted', b2.songIndex === 2, `(${b2.songIndex})`);
}

// Loud warning if a temporary test cheat is still wired in.
const mainSrc = await import('node:fs').then((fs) => fs.readFileSync('src/main.js', 'utf8'));
const active = [...mainSrc.matchAll(/const (TEST_\w+) = ([^;]+);/g)]
  .filter((m) => m[2].trim() !== 'null');
if (active.length) {
  console.log(`\n  ${'!'.repeat(60)}`);
  for (const m of active) console.log(`  TEST CHEAT ACTIVE — ${m[1]} = ${m[2].trim()}`);
  console.log('  Set it back to null in src/main.js before shipping.');
  console.log(`  ${'!'.repeat(60)}`);
}

console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} failing check(s)`}\n`);
process.exit(failures === 0 ? 0 : 1);
