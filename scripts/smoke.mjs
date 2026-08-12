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
const { overlaps, blocksWalker, deckAt, WALKER_RADIUS } = await import('../src/world/collide.js');
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
  RULES, overlaps, blocksWalker, deckAt, WALKER_RADIUS,
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
