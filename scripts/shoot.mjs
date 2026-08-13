/**
 * Headless screenshot harness.
 *
 * Loads the running dev server in headless Chrome with real WebGL, presses
 * Begin, drives the crow, and writes PNGs — so the render can actually be
 * looked at rather than assumed. Also fails loudly on any console error or
 * uncaught exception, which is the cheap half of the value.
 *
 *   npm run dev            # in another shell
 *   node scripts/shoot.mjs [url]
 *
 * Shots land in shots/.
 */

import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

// The level module is pure at import time, but three.js and the shape kit both
// reach for a canvas, so give them somewhere to reach. We only want RULES.
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({}), style: {} }) };
globalThis.window ??= globalThis;
const { RULES } = await import('../src/world/rules.js');
/**
 * The registry, so this harness never has to be told a fourth block exists.
 *
 * Both of the numbers below used to be literals — "the last block" was 3 and
 * "how many chips" was 3 — and both of them failed the day the lobby landed,
 * which is a harness reporting its own staleness as a bug in the game. A check
 * that has to be edited to notice a new level is not a check.
 */
const { LEVELS } = await import('../src/world/levels.js');
const LAST = LEVELS[LEVELS.length - 1];

/**
 * Wait for the street lights to finish coming on, rather than sleeping and
 * hoping. **This is a real bug this file had, on four blocks out of five.**
 *
 * The night lights ramp over about eight seconds once the clock passes
 * `RULES.lampsOnAt`, and `since` — the ramp's own clock — resets to zero any
 * time the day is wound back below the trigger. The dusk samples are taken in
 * order at t = 0.20, 0.45 and 0.98 of a session, and the middle one gets a nine
 * second settle precisely so the lamps have time to catch.
 *
 * But whether the middle sample is *past the trigger at all* depends on the
 * level's `dayStart`, and on four blocks it is not: level 1's 0.45 is t=0.450,
 * the park's is t=0.560, the roofline's t=0.681, the wharf's t=0.593 — all
 * below 0.72. So the ramp's clock was still at zero when the final sample
 * started, and that sample's 700 ms sleep photographed the block **700 ms into
 * an eight second fade**. Only the lobby, whose `dayStart` is 0.55, ever
 * measured a block with its lights actually on.
 *
 * It passed for years because four of the five blocks are bright enough to
 * clear the floors unlit. The wharf is not: its harbour is more than half the
 * frame and no fixture can reach open water, so the water's own emissive is
 * what carries the median — and it was being measured before it arrived.
 *
 * Waiting on the condition is also the rule this project already wrote down
 * after the mobile task-list flake: *a test that sleeps exactly as long as the
 * thing it measures will flake.* Correcting it can only **add** light, and every
 * dusk rule in the game is a floor, so no block can fail because of it — the
 * same asymmetry that made switching off the skyline's shadow safe.
 */
const settleLights = async (page, ms = 11000) => {
  await page.waitForFunction(() => {
    const n = window.__game?.world?.nightLights;
    if (!n) return true;
    const lit = n.items.filter((i) => i.peak > 0);
    return lit.length === 0 || lit.every((i) => i.level >= i.peak * 0.995);
  }, { timeout: ms, polling: 100 }).catch(() => {});
};

/**
 * A pinned clock makes every dusk measurement in this file a lie.
 *
 * `TEST_TIME_OF_DAY` freezes the light rig so a block can be walked around
 * under one hour of the evening. Every dusk sample below then photographs that
 * one hour four times and reports it as t=0.20, t=0.45 and t=0.98 — three
 * numbers that agree with each other and with nothing else. That is the same
 * shape of failure as the harness that hardcoded an 18-minute day and silently
 * measured four identical frames, which is the reason this guard exists rather
 * than a note in a README.
 *
 * It fails the run rather than skipping the samples: a green shoot with no
 * dusk coverage is worse than a red one.
 */
const mainSrc = readFileSync('src/main.js', 'utf8');
const pinned = mainSrc.match(/const TEST_TIME_OF_DAY = ([^;]+);/)?.[1].trim();
if (pinned && pinned !== 'null') {
  console.error(`\n  TEST_TIME_OF_DAY is ${pinned} — the light rig is frozen.`);
  console.error('  Every dusk measurement in this file would photograph one hour '
    + 'and report it as three.\n  Set it back to null in src/main.js and re-run.\n');
  process.exit(1);
}

const URL = process.argv[2] || 'http://localhost:5173/';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--enable-unsafe-swiftshader',   // software WebGL in headless
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--hide-scrollbars',
    '--mute-audio',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`404/failed: ${r.url()}`));

console.log(`loading ${URL}`);
// Not networkidle0 — Vite's HMR websocket never closes, so it can never fire.
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

// The game hides #loading once it has constructed, so that is the boot signal.
await page.waitForFunction(
  () => document.getElementById('loading')?.classList.contains('hidden')
     || (document.getElementById('loading')?.textContent || '').startsWith('Could not start'),
  { timeout: 20000 },
).catch(() => errors.push('game never finished booting (20s)'));

// Did the renderer actually come up, or are we looking at a fallback?
const webgl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return null;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log(`webgl renderer: ${webgl ?? 'NONE'}`);
if (!webgl) { errors.push('no WebGL context available'); }

const loadingVisible = await page.$eval('#loading', (el) => !el.classList.contains('hidden'));
if (loadingVisible) {
  const msg = await page.$eval('#loading', (el) => el.textContent);
  errors.push(`game did not start: ${msg}`);
}

const shoot = async (name) => {
  const buf = await page.screenshot({ type: 'png' });
  writeFileSync(`${OUT}/${name}.png`, buf);
  console.log(`  wrote ${OUT}/${name}.png`);
};

await shoot('01-title');

await page.click('#start');
await new Promise((r) => setTimeout(r, 1200));
await shoot('02-spawn');

/** Hold keys for a while so the crow actually goes somewhere. */
const drive = async (keys, ms) => {
  for (const k of keys) await page.keyboard.down(k);
  await new Promise((r) => setTimeout(r, ms));
  for (const k of keys) await page.keyboard.up(k);
};

// Fly up for a wide read of the block.
await drive([' '], 1400);
await new Promise((r) => setTimeout(r, 400));
await shoot('03-airborne');

// Head east toward Café Row and Cart Corner.
await drive(['d', ' '], 2600);
await drive(['d'], 1400);
await shoot('04-cafe-row');

await drive(['d', ' '], 2600);
await drive(['d'], 1600);
await shoot('05-cart-corner');

/** Put the crow somewhere specific and photograph it, for spot checks. */
const hasHandle = await page.evaluate(() => !!window.__game);
if (!hasHandle) {
  console.log('  note: no __game handle (production build) — introspective checks skipped');
}

const look = async (name, x, y, z) => {
  if (!hasHandle) return;
  await page.evaluate(([px, py, pz]) => {
    window.__game.crow.pos.set(px, py, pz);
    window.__game.crow.vel.set(0, 0, 0);
  }, [x, y, z]);
  await new Promise((r) => setTimeout(r, 900));   // let the camera settle
  await shoot(name);
};

await look('06-newsstand', 11, 2.2, 10.5);
await look('07-cart', 15, 2.0, -2.0);
await look('08-nest', -12.5, 5.0, -6.5);
await look('09-kid', -17.5, 0, 11.5);
// The fountain is the one thing on the block that is not a box, and the only
// collider with its own shape. Both sides of its wall get photographed.
await look('09a-fountain-rim', -22, 0.62, 5.2);
// Off the middle, or the pedestal stands in front of the bird.
await look('09b-fountain-in', -19.6, 0.06, 1.6);

// Functional check: the basin is a room with a door in the ceiling. It used to
// be a lobster pot — the rim leaked at three headings and flight was disabled
// in water, so a crow that got in could not get out. Fly out of it for real.
const basin = !hasHandle ? null : await page.evaluate(async () => {
  const g = window.__game;
  const f = g.world.fountain;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  g.crow.pos.set(f.x, f.floor, f.z);
  g.crow.vel.set(0, 0, 0);
  g.crow.stamina = 0;
  await frame(); await frame();
  const wet = g.crow.inWater;

  // Three independent ways out, all from an empty bar — the state a player is
  // actually in by the time they decide the fountain is broken. Holding and
  // tapping fail differently, and walking needs no technique at all.
  const out = { wet, rim: f.rim };
  for (const [name, drive] of [
    ['hold', (i) => ({ move: { x: 0, y: 0 }, flap: true })],
    ['tap',  (i) => ({ move: { x: 0, y: 0 }, flap: (i % 12) < 5 })],
    ['walk', (i) => ({ move: { x: 1, y: 0 }, flap: false })],
  ]) {
    g.crow.pos.set(f.x, f.floor, f.z);
    g.crow.vel.set(0, 0, 0);
    g.crow.stamina = 0;
    g.crow.inWater = true;
    let escaped = false;
    for (let i = 0; i < 600 && !escaped; i++) {
      g.crow.update(1 / 60, drive(i), g.world, g.audio);
      const r = Math.hypot(g.crow.pos.x - f.x, g.crow.pos.z - f.z);
      escaped = (!g.crow.inWater && g.crow.pos.y > f.rim) || r > f.r + 0.5;
    }
    out[name] = escaped;
  }
  out.escaped = out.hold && out.tap && out.walk;

  // And the wall holds: walk hard at it from outside, all the way round.
  let leaks = 0;
  for (let deg = 0; deg < 360; deg += 10) {
    const a = (deg * Math.PI) / 180;
    g.crow.pos.set(f.x + Math.cos(a) * 8, 0, f.z + Math.sin(a) * 8);
    g.crow.vel.set(0, 0, 0);
    g.crow.inWater = false;
    const move = { x: -Math.cos(a), y: Math.sin(a) };
    for (let i = 0; i < 400 && !g.crow.inWater; i++) {
      g.crow.update(1 / 60, { move, flap: false }, g.world, g.audio);
    }
    if (g.crow.inWater) leaks++;
  }
  out.leaks = leaks;
  g.crow.pos.set(-24, 0, 6);
  g.crow.vel.set(0, 0, 0);
  return out;
});
if (basin) console.log('  fountain:', JSON.stringify(basin));
if (basin && !basin.wet) errors.push('crow on the basin floor is not in the water');
if (basin && !basin.escaped) {
  const failed = ['hold', 'tap', 'walk'].filter((k) => !basin[k]);
  errors.push(`crow cannot get out of the fountain by: ${failed.join(', ')}`);
}
if (basin && basin.leaks) errors.push(`rim leaks: walked into the basin from ${basin.leaks} heading(s)`);

// Functional check: the nest pointer appears only while carrying unbanked
// money, and retires for good after the first stash.
const nest = !hasHandle ? null : await page.evaluate(async () => {
  const g = window.__game;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const on = () => document.getElementById('nestptr').classList.contains('on');

  g.crow.carried = null; await frame();
  const idle = on();

  const coin = g.pickups.find((p) => p.value > 0 && p.state === 'world' && !p.pinned);
  g._doAction({ kind: 'take', pickup: coin });
  await frame();
  const carrying = on();

  // Stash it: stand on the cornice and bank.
  g.crow.pos.set(g.world.nest.x, g.world.nest.y, g.world.nest.z);
  await frame();
  g._doAction({ kind: 'bank' });
  await frame();
  const afterBank = on();

  const coin2 = g.pickups.find((p) => p.value > 0 && p.state === 'world' && !p.pinned);
  g._doAction({ kind: 'take', pickup: coin2 });
  await frame();
  const carryingAgain = on();

  g.crow.carried = null; g.banked = 0; g.total = 0;
  return { idle, carrying, afterBank, carryingAgain };
});
if (nest) {
  console.log('  nest pointer:', JSON.stringify(nest));
  if (nest.idle) errors.push('nest pointer shows while carrying nothing');
  if (!nest.carrying) errors.push('nest pointer missing while carrying money');
  if (nest.afterBank) errors.push('nest pointer still showing after banking');
  if (nest.carryingAgain) errors.push('nest pointer returned after the loop was learned');
}

// Photograph the pointer from across the block, where it has to clamp to the
// screen edge rather than sit over the memorial.
if (hasHandle) {
  await page.evaluate(() => {
    const g = window.__game;
    const coin = g.pickups.find((p) => p.value > 0 && p.state === 'world' && !p.pinned);
    g._doAction({ kind: 'take', pickup: coin });
    g.crow.pos.set(24, 4, 4);
    g.crow.vel.set(0, 0, 0);
  });
  await new Promise((r) => setTimeout(r, 1000));
  await shoot('11-nest-pointer');
  await page.evaluate(() => { window.__game.crow.carried = null; window.__game.banked = 0; });
}

// Functional check: the two teaching beats fire at the moment each applies.
const teach = !hasHandle ? null : await page.evaluate(() => {
  const g = window.__game;
  const toast = () => document.getElementById('toast').textContent;
  const coin = g.pickups.find((p) => p.value > 0 && p.state === 'world' && !p.pinned);
  g._doAction({ kind: 'take', pickup: coin });
  const onMoney = toast();
  g.crow.carried = null; coin.state = 'world';
  const shiny = g.pickups.find((p) => p.kind === 'shiny' && p.state === 'world');
  g._doAction({ kind: 'take', pickup: shiny });
  const onShiny = toast();
  g.crow.carried = null; shiny.state = 'world';
  return { onMoney, onShiny };
});
if (teach) console.log('  teach:', JSON.stringify(teach));
if (teach && !/nest/i.test(teach.onMoney)) errors.push(`no nest hint on first money: "${teach.onMoney}"`);
if (teach && !/trade/i.test(teach.onShiny)) errors.push(`no trade hint on first shiny: "${teach.onShiny}"`);

// Functional check: trading a shiny must put the reward straight in the beak,
// never on the ground where scenery can hide it.
const trade = !hasHandle ? null : await page.evaluate(() => {
  const g = window.__game;
  const shiny = g.pickups.find((p) => p.kind === 'shiny' && !p.taken);
  if (!shiny) return { error: 'no shiny available' };
  shiny.setCarried(g.crow.grip);
  g.crow.carried = shiny;
  g._doAction({ kind: 'trade' });
  const reward = g.crow.carried;
  return {
    carrying: reward ? reward.label : null,
    value: reward ? reward.value : 0,
    parentedToBeak: !!reward && reward.root.parent === g.crow.grip,
    strayOnGround: g.pickups.filter((p) => p.id >= 900 && p.state === 'world').length,
  };
});
if (trade) console.log('  trade:', JSON.stringify(trade));
// A temporary test cheat can override the payout; honour it rather than
// failing, but report it so it is never silently in effect.
const cheat = !hasHandle ? null : await page.evaluate(() => {
  const b = document.getElementById('testmode');
  if (!b || b.hidden) return null;
  return Number((b.textContent.match(/\$([\d.]+)/) || [])[1]) || null;
});
if (cheat) console.log(`  NOTE: test cheat active — trade pays $${cheat.toFixed(2)}`);
const expected = cheat ?? 1;
if (trade && trade.value !== expected) errors.push(`first trade paid ${trade.value}, expected ${expected}`);
if (trade && !trade.parentedToBeak) errors.push('trade reward was not auto-equipped');
if (trade && trade.strayOnGround) errors.push('trade reward was left on the ground');

// ── dusk ─────────────────────────────────────────────────────────────────────
/**
 * The last third of the session used to be unplayable: the block's median
 * luminance fell to 19/255 and its 5th percentile to 8. Nobody noticed until a
 * playtest, because nothing measured it.
 *
 * Floors come from RULES.duskMedianFloor / duskShadowFloor, measured over the
 * lower 58% of the frame with the HUD hidden. docs/lighting-brief.html §1
 * proposed 55 and 35 before anything was built; those were revised down after
 * looking at frames that hit 53 and 29 and are plainly navigable. Pushing the
 * last few points would mean more ambient, and more ambient is how a sunset
 * turns into grey wash.
 */
if (hasHandle) {
  const DUSK_FLOOR = { p50: RULES.duskMedianFloor, p05: RULES.duskShadowFloor };
  await page.evaluate(() => {
    document.getElementById('hud').style.display = 'none';
    const badge = document.getElementById('testmode');
    if (badge) badge.style.display = 'none';
    window.__game.crow.pos.set(-19, 0, 3);
  });

  const measure = async (t, settle) => {
    // Freeze the clock: a shortened test day would otherwise run out mid-sample
    // and photograph the ending screen. `_frame` still drives the light rig.
    await page.evaluate((tt) => {
      const g = window.__game;
      g.running = false;
      g.finished = false;
      g.elapsed = tt * g.sessionSeconds;
    }, t);
    await new Promise((r) => setTimeout(r, settle));
    // The lamps take ~8s to come up and the sleep above does not know that.
    await settleLights(page);
    const b64 = await page.screenshot({ type: 'png', encoding: 'base64' });
    return page.evaluate((url) => new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const cx = cv.getContext('2d');
        cx.drawImage(img, 0, 0);
        const y0 = Math.floor(img.height * 0.42);   // below the skyline
        const d = cx.getImageData(0, y0, img.width, img.height - y0).data;
        const L = [];
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 16) {
          L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        L.sort((x, y) => x - y);
        res({
          p05: Math.round(L[Math.floor(L.length * 0.05)]),
          p50: Math.round(L[Math.floor(L.length * 0.5)]),
          rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
        });
      };
      img.src = url;
    }), `data:image/png;base64,${b64}`);
  };

  // First sample past the trigger waits out the catch-and-warm; the lamps stay
  // lit after that, so the rest are quick.
  const dusk = {};
  for (const [t, settle] of [[0.60, 500], [0.75, 9000], [0.85, 700], [0.97, 700]]) {
    const m = await measure(t, settle);
    dusk[t] = m;
    const key = `dusk-${String(Math.round(t * 100))}`;
    await shoot(key);
    console.log(`  ${key}: p05 ${m.p05}, p50 ${m.p50}, avg rgb ${m.rgb.join(',')}`);
    if (m.p50 < DUSK_FLOOR.p50) errors.push(`${key}: median ${m.p50} below the ${DUSK_FLOOR.p50} floor`);
    if (m.p05 < DUSK_FLOOR.p05) errors.push(`${key}: 5th pct ${m.p05} below the ${DUSK_FLOOR.p05} floor`);
  }

  // Shade is violet, never grey — and, since the fill was split off the horizon
  // glow, never rust. At dusk the frame average must be blue-dominant.
  const late = dusk[0.97].rgb;
  if (late[2] <= late[0]) {
    errors.push(`dusk reads warm, not violet: avg rgb ${late.join(',')} (blue must beat red)`);
  }

  await page.evaluate(() => {
    document.getElementById('hud').style.display = '';
    const g = window.__game;
    g.elapsed = 0; g.running = true;
  });
}

// Look at what the crow can see right now.
const state = await page.evaluate(() => {
  const amt = document.getElementById('amt')?.textContent;
  const prompt = document.getElementById('prompt');
  return {
    money: amt,
    prompt: prompt && prompt.classList.contains('on') ? prompt.textContent : null,
    carrying: document.getElementById('carry')?.classList.contains('on')
      ? document.getElementById('carry').textContent : null,
  };
});
console.log('  hud:', JSON.stringify(state));

// The ending screen, with a deliberately awkward amount.
const ending = !hasHandle ? null : await page.evaluate(() => {
  const g = window.__game;
  g.total = 22.66; g.elapsed = 247; g.finished = false; g.running = true;
  g._finish(true);
  return {
    title: document.getElementById('ending-title').textContent.replace(/\s+/g, ' ').trim(),
    rank: document.getElementById('rank').textContent,
    again: document.getElementById('again').textContent,
  };
});
if (ending) console.log('  ending:', JSON.stringify(ending));
if (ending && !/twenty-two dollars sixty-six cents/i.test(ending.title)) {
  errors.push(`ending headline wrong: "${ending.title}"`);
}
if (ending && /\$/.test(ending.rank)) errors.push(`amount still in the eyebrow: "${ending.rank}"`);
if (ending) { await new Promise((r) => setTimeout(r, 1600)); await shoot('10-ending'); }

// ── level 2: the park ────────────────────────────────────────────────────────
/**
 * The park's risks are not the roofline's. It has one raised deck and nothing
 * clever about it; what it has instead is three people standing round one
 * cooler, and every claim this level makes is about *who can see what*. That is
 * not visible in the geometry and it is not visible in a screenshot either —
 * so the set piece gets asserted rather than photographed, and the photographs
 * are for the two things that are only ever wrong in a frame: whether the lawn
 * survives dusk, and whether a kid sitting on a pond kerb reads as a kid
 * sitting on a pond kerb.
 */
{
  const url2 = URL + (URL.includes('?') ? '&' : '?') + 'level=2';
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  p2.on('console', (m) => { if (m.type() === 'error') errors.push(`L2 console: ${m.text()}`); });
  p2.on('pageerror', (e) => errors.push(`L2 uncaught: ${e.message}`));
  p2.on('requestfailed', (r) => errors.push(`L2 404/failed: ${r.url()}`));

  console.log(`\nloading ${url2}`);
  await p2.goto(url2, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const booted2 = Date.now();
  await p2.waitForFunction(
    () => document.getElementById('loading')?.classList.contains('hidden')
       || (document.getElementById('loading')?.textContent || '').startsWith('Could not start'),
    { timeout: 30000 },
  ).catch(() => errors.push('L2: still booting after 30s — no error thrown, just slow'));
  const boot2Msg = await p2.$eval('#loading', (el) => (el.classList.contains('hidden') ? null : el.textContent))
    .catch(() => null);
  if (boot2Msg) errors.push(`L2 did not start: ${boot2Msg}`);
  console.log(`  L2 booted in ${Date.now() - booted2} ms`);

  const has2 = await p2.evaluate(() => !!window.__game);
  await p2.click('#start');
  await new Promise((r) => setTimeout(r, 1200));

  const shoot2 = async (name) => {
    writeFileSync(`${OUT}/${name}.png`, await p2.screenshot({ type: 'png' }));
    console.log(`  wrote ${OUT}/${name}.png`);
  };
  const look2 = async (name, x, y, z) => {
    if (!has2) return;
    await p2.evaluate(([px, py, pz]) => {
      window.__game.crow.pos.set(px, py, pz);
      window.__game.crow.vel.set(0, 0, 0);
    }, [x, y, z]);
    await new Promise((r) => setTimeout(r, 900));
    await shoot2(name);
  };
  const frames2 = () => p2.evaluate(() => new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r))));

  await shoot2('20-l2-spawn');
  await look2('21-l2-pond', -4, 0, 9.5);
  await look2('22-l2-kid', -6.5, 0, 10);
  await look2('23-l2-picnic', -19.5, 0, 7.0);
  await look2('24-l2-bandstand', -17, 0, -1.0);
  await look2('25-l2-shelter', 2, 0, 15.0);
  await look2('26-l2-cart', 20, 0, 2.5);
  await look2('27-l2-pavilion', 6, 0, -3.0);
  await look2('28-l2-nest', 6, 4.75, -8);

  // The pond is the plaza fountain with the ornament taken out, so it is the
  // same lobster-pot risk and gets the same three exits from an empty bar.
  const pond = !has2 ? null : await p2.evaluate(async () => {
    const g = window.__game;
    const f = g.world.fountain;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    g.crow.pos.set(f.x, f.floor, f.z);
    g.crow.vel.set(0, 0, 0);
    await frame(); await frame();
    const out = { wet: g.crow.inWater, rim: f.rim };
    for (const [nm, drive] of [
      ['hold', () => ({ move: { x: 0, y: 0 }, flap: true })],
      ['tap', (i) => ({ move: { x: 0, y: 0 }, flap: (i % 12) < 5 })],
      ['walk', () => ({ move: { x: 1, y: 0 }, flap: false })],
    ]) {
      g.crow.pos.set(f.x, f.floor, f.z);
      g.crow.vel.set(0, 0, 0);
      g.crow.stamina = 0;
      g.crow.inWater = true;
      let escaped = false;
      for (let i = 0; i < 600 && !escaped; i++) {
        g.crow.update(1 / 60, drive(i), g.world, g.audio);
        const r = Math.hypot(g.crow.pos.x - f.x, g.crow.pos.z - f.z);
        escaped = (!g.crow.inWater && g.crow.pos.y > f.rim) || r > f.r + 0.5;
      }
      out[nm] = escaped;
    }
    g.crow.pos.set(-8, 0, 9.5);
    g.crow.vel.set(0, 0, 0);
    return out;
  });
  if (pond) console.log('  pond:', JSON.stringify(pond));
  if (pond && !pond.wet) errors.push('L2: crow on the pond floor is not in the water');
  if (pond) {
    const failed = ['hold', 'tap', 'walk'].filter((k) => !pond[k]);
    if (failed.length) errors.push(`L2: cannot get out of the pond by: ${failed.join(', ')}`);
  }

  /**
   * The set piece, asserted rather than admired.
   *
   * The level's whole claim is that the five on the cooler is worth a fifth of
   * the goal and cannot be taken unobserved. "Unobserved" is a property of
   * three cones and a patrol, so it is measured: how many non-oblivious people
   * are inside guarding distance of that coin, at the moment the crow lifts it.
   * If a later edit walks somebody away, this is what notices.
   */
  const cooler = !has2 ? null : await p2.evaluate(async () => {
    const g = window.__game;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const five = g.pickups.find((p) => p.onCooler);
    if (!five) return { error: 'nothing on the cooler' };
    g.crow.pos.set(five.pos.x, 0.55, five.pos.z);
    g.crow.vel.set(0, 0, 0);
    await frame();
    const a = g._bestAction();
    g._doAction(a);
    const task = g.tasks.find((t) => t.id === 'picnic');
    const out = {
      label: five.label,
      value: five.value,
      verb: a ? a.verb : null,
      carrying: g.crow.carried ? g.crow.carried.label : null,
      ticks: !!(task && task.when(g)),
      owner: five.owner,
      // Everyone who could care, and is close enough to do something about it.
      watchers: g.humans.filter((h) => !h.kid && !h.oblivious
        && Math.hypot(h.pos.x - five.pos.x, h.pos.z - five.pos.z) < 5).length,
    };
    g.crow.carried = null;
    five.state = 'world'; five.taken = false;
    g.crow.pos.set(-8, 0, 9.5);
    return out;
  });
  if (cooler) console.log('  cooler:', JSON.stringify(cooler));
  if (cooler && cooler.verb !== 'TAKE') errors.push(`L2: the five on the cooler is not takeable (${cooler.verb})`);
  if (cooler && !cooler.ticks) errors.push('L2: lifting the cooler five did not satisfy the picnic task');
  if (cooler && cooler.value !== 5) errors.push(`L2: the cooler five is worth ${cooler.value}`);
  if (cooler && cooler.watchers < 2) {
    errors.push(`L2: the cooler is guarded by ${cooler.watchers} — the set piece has gone soft`);
  }

  /**
   * The pinned note, which is the same verb as level 1's saltshaker on a
   * blanket with people round it. Before the shove there must be no way to take
   * it and the game must say why; after it, it is just money.
   */
  const pinned = !has2 ? null : await p2.evaluate(async () => {
    const g = window.__game;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const five = g.pickups.find((p) => p.pinned);
    g.saltMoved = false;
    g.world.pin.visible = true;
    g.crow.pos.set(five.pos.x, 0, five.pos.z);
    g.crow.vel.set(0, 0, 0);
    await frame(); await frame();
    const before = g._bestAction();
    g._doAction({ kind: 'salt' });
    await frame();
    const after = g._bestAction();
    const out = {
      pin: g.world.pin.userData.label,
      beforeVerb: before ? before.verb : null,
      toast: document.getElementById('toast').textContent,
      afterVerb: after ? after.verb : null,
      afterNoun: after ? after.noun : null,
      pinHidden: g.world.pin.visible === false,
    };
    g.crow.pos.set(-8, 0, 9.5);
    return out;
  });
  if (pinned) console.log('  pinned:', JSON.stringify(pinned));
  if (pinned && pinned.beforeVerb !== 'SHOVE') {
    errors.push(`L2: the paperback does not offer SHOVE (${pinned.beforeVerb})`);
  }
  if (pinned && !pinned.pinHidden) errors.push('L2: the paperback survived being shoved');
  if (pinned && pinned.afterVerb !== 'TAKE') {
    errors.push(`L2: the note under the paperback is still stuck (${pinned.afterVerb})`);
  }

  /**
   * The bait. One deck, so there is no wrong-floor lesson to teach here — the
   * only rule is distance, and it has to hold in both directions.
   */
  const bait = !has2 ? null : await p2.evaluate(async () => {
    const g = window.__game;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const toast = () => document.getElementById('toast').textContent;
    const food = g.pickups.find((p) => p.kind === 'pretzel');
    const out = { label: food.label };
    const dropAt = async (x, y, z) => {
      food.state = 'world'; food.taken = false;
      g.crow.pos.set(x, y, z);
      g.crow.vel.set(0, 0, 0);
      // Two frames before the drop, never none: a dropped pickup lands at the
      // beak, and the beak comes off the rig's world matrix, which only catches
      // up with crow.pos on the next step.
      await frame(); await frame();
      food.setCarried(g.crow.grip);
      g.crow.carried = food;
      g.foodUntil = 0;
      g._doAction({ kind: 'drop' });
      await frame();
      return toast();
    };
    out.tooClose = await dropAt(g.world.cart.x + 2, 0, g.world.cart.z + 3);
    out.movedNear = !!(g.foodUntil && g.foodUntil > g.elapsed);
    out.legal = await dropAt(g.world.cart.x - 9, 0, g.world.cart.z + 9);
    out.moved = !!(g.foodUntil && g.foodUntil > g.elapsed);
    out.guardDistracted = g.baitGuard.state === 'distracted';
    out.taskTicked = g.tasks.find((t) => t.id === 'cart').done;
    g.crow.carried = null;
    g.crow.pos.set(-8, 0, 9.5);
    return out;
  });
  if (bait) console.log('  bait:', JSON.stringify(bait));
  if (bait && bait.movedNear) errors.push('L2: a pretzel dropped at the cart still moved the vendor');
  if (bait && !/close to the cart/i.test(bait.tooClose)) {
    errors.push(`L2: no too-close hint by the cart: "${bait.tooClose}"`);
  }
  if (bait && !bait.moved) errors.push('L2: a legal pretzel drop did nothing');
  if (bait && !bait.guardDistracted) errors.push('L2: the vendor did not leave his cart');
  if (bait && !bait.taskTicked) errors.push('L2: the cart task did not tick');

  // The kid pays this block's ladder, and the reward goes straight in the beak.
  const trade2 = !has2 ? null : await p2.evaluate(() => {
    const g = window.__game;
    const shiny = g.pickups.find((p) => p.kind === 'shiny' && !p.taken);
    if (!shiny) return { error: 'no shiny available' };
    shiny.setCarried(g.crow.grip);
    g.crow.carried = shiny;
    g._doAction({ kind: 'trade' });
    const reward = g.crow.carried;
    const out = {
      value: reward ? reward.value : 0,
      expected: g.level.tradeValues[0],
      parentedToBeak: !!reward && reward.root.parent === g.crow.grip,
    };
    g.crow.carried = null; g.tradeStep = 0;
    return out;
  });
  if (trade2) console.log('  L2 trade:', JSON.stringify(trade2));
  if (trade2 && trade2.value !== trade2.expected) {
    errors.push(`L2 first trade paid ${trade2.value}, expected ${trade2.expected}`);
  }
  if (trade2 && !trade2.parentedToBeak) errors.push('L2 trade reward was not auto-equipped');

  // The nest, which is the one thing on this block that is off the ground.
  const nest2 = !has2 ? null : await p2.evaluate(async () => {
    const g = window.__game;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const coin = g.pickups.find((p) => p.value > 0 && p.state === 'world' && !p.pinned);
    g._doAction({ kind: 'take', pickup: coin });
    const n = g.world.nest;
    g.crow.pos.set(n.x, n.y, n.z);
    g.crow.vel.set(0, 0, 0);
    await frame();
    const a = g._bestAction();
    const out = { nestY: n.y, verb: a ? a.verb : null };
    g._doAction({ kind: 'bank' });
    out.banked = coin.state === 'banked';
    g.total = 0; g.banked = 0; g.crow.carried = null;
    g.crow.pos.set(-8, 0, 9.5);
    return out;
  });
  if (nest2) console.log('  nest:', JSON.stringify(nest2));
  if (nest2 && nest2.verb !== 'STASH') errors.push(`L2: standing on the vent cap does not offer STASH (${nest2.verb})`);
  if (nest2 && !nest2.banked) errors.push('L2: banking on the pavilion did nothing');
  await frames2();

  /**
   * Dusk, measured. A lawn is darker than paving whatever you do with it, and
   * this is the block that finds out whether "canopyLit as the ground" was
   * enough. Sampled where it can actually go dark: under the picnic's trees at
   * the west end, and at the cart, which is deliberately the dimmest thing in
   * the park.
   */
  if (has2) {
    const FLOOR = { p50: RULES.duskMedianFloor, p05: RULES.duskShadowFloor };
    await p2.evaluate(() => {
      document.getElementById('hud').style.display = 'none';
      const b = document.getElementById('testmode');
      if (b) b.style.display = 'none';
    });

    const measure2 = async (through, settle, at) => {
      await p2.evaluate(([tt, pos]) => {
        const g = window.__game;
        g.running = false;
        g.finished = false;
        g.elapsed = tt * g.sessionSeconds;
        g.crow.pos.set(pos[0], pos[1], pos[2]);
        g.crow.vel.set(0, 0, 0);
      }, [through, at]);
      await new Promise((r) => setTimeout(r, settle));
      // The lamps take ~8s to come up and the sleep above does not know that.
      await settleLights(p2);
      const b64 = await p2.screenshot({ type: 'png', encoding: 'base64' });
      return p2.evaluate((u) => new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const cv = document.createElement('canvas');
          cv.width = img.width; cv.height = img.height;
          const cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0);
          const y0 = Math.floor(img.height * 0.42);
          const d = cx.getImageData(0, y0, img.width, img.height - y0).data;
          const L = [];
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 16) {
            L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
          }
          L.sort((x, y) => x - y);
          res({
            p05: Math.round(L[Math.floor(L.length * 0.05)]),
            p50: Math.round(L[Math.floor(L.length * 0.5)]),
            rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
          });
        };
        img.src = u;
      }), `data:image/png;base64,${b64}`);
    };

    let late = null;
    for (const [where, pos] of [['picnic', [-19, 0, 7]], ['cart', [19, 0, 3]]]) {
      for (const [through, settle] of [[0.35, 500], [0.70, 9000], [0.98, 700]]) {
        const m = await measure2(through, settle, pos);
        const key = `l2-dusk-${where}-${String(Math.round(through * 100))}`;
        writeFileSync(`${OUT}/${key}.png`, await p2.screenshot({ type: 'png' }));
        console.log(`  ${key}: p05 ${m.p05}, p50 ${m.p50}, avg rgb ${m.rgb.join(',')}`);
        if (m.p50 < FLOOR.p50) errors.push(`${key}: median ${m.p50} below the ${FLOOR.p50} floor`);
        if (m.p05 < FLOOR.p05) errors.push(`${key}: 5th pct ${m.p05} below the ${FLOOR.p05} floor`);
        if (through > 0.9) late = m;
      }
    }
    if (late && late.rgb[2] <= late.rgb[0]) {
      errors.push(`L2 dusk reads warm, not violet: avg rgb ${late.rgb.join(',')}`);
    }
    await p2.evaluate(() => { document.getElementById('hud').style.display = ''; });
  }

  // The ending, with the level's own copy and an awkward amount.
  const end2 = !has2 ? null : await p2.evaluate(() => {
    const g = window.__game;
    g.total = 26.40; g.elapsed = 233; g.finished = false; g.running = true;
    g._finish(true);
    return {
      title: document.getElementById('ending-title').textContent.replace(/\s+/g, ' ').trim(),
      body: document.getElementById('ending-body').textContent.slice(0, 60),
      goal: g.goal,
    };
  });
  if (end2) console.log('  L2 ending:', JSON.stringify(end2));
  if (end2 && end2.goal !== 25) errors.push(`L2 goal is ${end2.goal}, expected 25`);
  if (end2 && !/twenty-six dollars forty cents/i.test(end2.title)) {
    errors.push(`L2 ending headline wrong: "${end2.title}"`);
  }
  if (end2) { await new Promise((r) => setTimeout(r, 1400)); await shoot2('29-l2-ending'); }
}

// ── level 3: the roofline ────────────────────────────────────────────────────
/**
 * Every block gets its own pass, because almost nothing that goes wrong on one
 * would show up on another. Here the four decks are the whole level and they
 * are the whole risk: a prop authored without its deck offset hangs in the air,
 * a light pool lands on the yard instead of the terrace, and both are invisible
 * in the source and obvious in a PNG.
 */
{
  const url3 = URL + (URL.includes('?') ? '&' : '?') + 'level=3';
  const p3 = await browser.newPage();
  await p3.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  p3.on('console', (m) => { if (m.type() === 'error') errors.push(`L3 console: ${m.text()}`); });
  p3.on('pageerror', (e) => errors.push(`L3 uncaught: ${e.message}`));
  p3.on('requestfailed', (r) => errors.push(`L3 404/failed: ${r.url()}`));

  console.log(`\nloading ${url3}`);
  await p3.goto(url3, { waitUntil: 'domcontentloaded', timeout: 30000 });
  /**
   * 30s, not 20 — and it says which kind of failure it was.
   *
   * The real boot is ~1.5s on this hardware, so 20 was already twelve times the
   * measured time and the intermittent failure was never the game being slow: it
   * is the second page contending for one software-WebGL context. Raising the
   * ceiling lowers the false-failure rate and treats a symptom, so the useful
   * half of this change is the diagnosis underneath it — a game that *threw*
   * leaves "Could not start:" in #loading and now reports that, instead of being
   * indistinguishable from a slow machine.
   */
  const booted3 = Date.now();
  await p3.waitForFunction(
    () => document.getElementById('loading')?.classList.contains('hidden')
       || (document.getElementById('loading')?.textContent || '').startsWith('Could not start'),
    { timeout: 30000 },
  ).catch(() => errors.push('L3: still booting after 30s — no error thrown, just slow'));
  const boot3Msg = await p3.$eval('#loading', (el) => (el.classList.contains('hidden') ? null : el.textContent))
    .catch(() => null);
  if (boot3Msg) errors.push(`L3 did not start: ${boot3Msg}`);
  console.log(`  L3 booted in ${Date.now() - booted3} ms`);

  const has3 = await p3.evaluate(() => !!window.__game);
  await p3.click('#start');
  await new Promise((r) => setTimeout(r, 1200));

  const shoot3 = async (name) => {
    writeFileSync(`${OUT}/${name}.png`, await p3.screenshot({ type: 'png' }));
    console.log(`  wrote ${OUT}/${name}.png`);
  };
  const look3 = async (name, x, y, z) => {
    if (!has3) return;
    await p3.evaluate(([px, py, pz]) => {
      window.__game.crow.pos.set(px, py, pz);
      window.__game.crow.vel.set(0, 0, 0);
    }, [x, y, z]);
    await new Promise((r) => setTimeout(r, 900));
    await shoot3(name);
  };

  await shoot3('30-l3-spawn');
  // One shot per deck, bottom to top. If a deck is empty in the frame, it is
  // because nothing was built on it — which is exactly what these are for.
  await look3('31-l3-forecourt', -11, 0, 13.5);
  await look3('32-l3-loading-end', 17, 0, 8);
  await look3('33-l3-cradle', 14, 4.0, 2.4);
  await look3('34-l3-terrace', -6, 5.4, -2);
  await look3('35-l3-kid', -5, 5.4, 0.6);
  await look3('36-l3-lectern', -15.5, 5.4, -1.5);
  await look3('37-l3-roof', -12, 9.2, -8);
  await look3('38-l3-nest', -16, 12.4, -9);

  /**
   * The plunge pool, which is the plaza fountain five metres in the air — and
   * therefore the same lobster-pot risk arrived at from a new direction. The
   * scramble test read `c.bottom <= 0.01`, which is true of a rim standing on
   * paving and false of one standing on a roof, so a crow in this pool could not
   * climb out of it at any heading at all.
   */
  const pool = !has3 ? null : await p3.evaluate(async () => {
    const g = window.__game;
    const f = g.world.fountain;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    g.crow.pos.set(f.x, f.floor, f.z);
    g.crow.vel.set(0, 0, 0);
    await frame(); await frame();
    const out = { deck: g.world.waterDeck, rim: f.rim, wet: g.crow.inWater };

    for (const [nm, drive] of [
      ['hold', () => ({ move: { x: 0, y: 0 }, flap: true })],
      ['tap', (i) => ({ move: { x: 0, y: 0 }, flap: (i % 12) < 5 })],
      ['walk', () => ({ move: { x: 1, y: 0 }, flap: false })],
    ]) {
      g.crow.pos.set(f.x, f.floor, f.z);
      g.crow.vel.set(0, 0, 0);
      g.crow.stamina = 0;
      g.crow.inWater = true;
      let escaped = false;
      for (let i = 0; i < 600 && !escaped; i++) {
        g.crow.update(1 / 60, drive(i), g.world, g.audio);
        const r = Math.hypot(g.crow.pos.x - f.x, g.crow.pos.z - f.z);
        escaped = (!g.crow.inWater && g.crow.pos.y > f.rim) || r > f.r + 0.5;
      }
      out[nm] = escaped;
    }

    // The trap unique to a pool that is *not* on the ground: the column of air
    // beneath it must not count as being in it. Only meaningful while some block
    // has a raised one — this one's fountain went back to the forecourt — but
    // the guard stays, because the bug it watches for is in the crow, not in the
    // level.
    if (g.world.waterDeck > 1) {
      g.crow.pos.set(f.x, 0, f.z);
      g.crow.vel.set(0, 0, 0);
      g.crow.inWater = false;
      g.crow.update(1 / 60, { move: { x: 0, y: 0 }, flap: false }, g.world, g.audio);
      out.wetFromBelow = g.crow.inWater;
    }

    g.crow.pos.set(-1, 0, 9.5);
    g.crow.vel.set(0, 0, 0);
    return out;
  });
  if (pool) console.log('  water:', JSON.stringify(pool));
  if (pool && !pool.wet) errors.push('L3: crow on the pool floor is not in the water');
  if (pool) {
    const failed = ['hold', 'tap', 'walk'].filter((k) => !pool[k]);
    if (failed.length) errors.push(`L3: cannot get out of the plunge pool by: ${failed.join(', ')}`);
  }
  if (pool && pool.wetFromBelow) errors.push('L3: a crow in the yard is swimming in the roof pool');

  /**
   * The set piece, and the rule it teaches by failing. Chips in the yard feed
   * the yard; chips on the terrace, away from the stand, empty the parapet.
   */
  const bait = !has3 ? null : await p3.evaluate(async () => {
    const g = window.__game;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const toast = () => document.getElementById('toast').textContent;
    const chips = g.pickups.find((p) => p.kind === 'chips');
    const out = { label: chips.label };

    const dropAt = async (x, y, z) => {
      chips.state = 'world'; chips.taken = false;
      g.crow.pos.set(x, y, z);
      g.crow.vel.set(0, 0, 0);
      // Two frames before the drop, not none. A dropped pickup is placed at the
      // beak, and the beak is read off the rig's world matrix — which only
      // catches up with `crow.pos` on the next simulation step. Dropping in the
      // same tick as the teleport tests the position the crow used to be in,
      // which is how this check first reported that the terrace was the yard.
      await frame(); await frame();
      chips.setCarried(g.crow.grip);
      g.crow.carried = chips;
      g.foodUntil = 0;
      g._doAction({ kind: 'drop' });
      await frame();
      return toast();
    };

    out.inTheYard = await dropAt(4, 0, 10);
    out.movedYard = !!(g.foodUntil && g.foodUntil > g.elapsed);
    out.tooNear = await dropAt(-13, 5.4, -3.5);
    out.onTheTerrace = await dropAt(6, 5.4, -3);
    out.movedTerrace = !!(g.foodUntil && g.foodUntil > g.elapsed);
    out.guardDistracted = g.baitGuard.state === 'distracted';
    out.taskTicked = g.tasks.find((t) => t.id === 'gulls').done;

    g.crow.carried = null;
    g.crow.pos.set(-1, 0, 9.5);
    return out;
  });
  if (bait) console.log('  bait:', JSON.stringify(bait));
  if (bait && bait.movedYard) errors.push('L3: chips dropped in the yard moved the terrace');
  if (bait && !/down here/i.test(bait.inTheYard)) errors.push(`L3: no deck hint in the yard: "${bait.inTheYard}"`);
  if (bait && !/stand/i.test(bait.tooNear)) errors.push(`L3: no too-close hint by the stand: "${bait.tooNear}"`);
  if (bait && !bait.movedTerrace) errors.push('L3: a legal chip drop did nothing');
  if (bait && !bait.guardDistracted) errors.push('L3: the maître d’ did not leave his stand');
  if (bait && !bait.taskTicked) errors.push('L3: the gull task did not tick');

  // The gulls: land beside one and everybody looks. Fly over it and nobody does.
  const gulls = !has3 ? null : await p3.evaluate(() => {
    const g = window.__game;
    // Stop the loop and clear the food first. The bait check above left thirteen
    // seconds of chips on the terrace, and a gull that is mobbing does not
    // shriek — it has better things to do. The first version of this check
    // measured that and reported it as a broken gull.
    g.running = false;
    g.foodUntil = 0;
    const gull = g.gulls[0];
    gull.mobbing = null;
    const out = { count: g.gulls.length, deck: gull.floorY };
    const fire = () => {
      let heard = 0;
      const real = g.onGullAlarm.bind(g);
      g.onGullAlarm = (x) => { heard++; real(x); };
      gull.alarmCooldown = 0;
      gull.update(1 / 60, null, g.crow, g.world, g);
      g.onGullAlarm = real;
      return heard;
    };
    g.crow.pos.set(gull.pos.x + 0.9, gull.floorY, gull.pos.z);
    out.landedBeside = fire();
    g.crow.pos.set(gull.pos.x + 0.9, gull.floorY + 4, gull.pos.z);
    out.flewOver = fire();
    g.crow.pos.set(-1, 0, 9.5);
    g.running = true;
    return out;
  });
  if (gulls) console.log('  gulls:', JSON.stringify(gulls));

  // The kid pays this block's ladder, not the block's-next-door one.
  const trade3 = !has3 ? null : await p3.evaluate(() => {
    const g = window.__game;
    const shiny = g.pickups.find((p) => p.kind === 'shiny' && !p.taken);
    if (!shiny) return { error: 'no shiny available' };
    shiny.setCarried(g.crow.grip);
    g.crow.carried = shiny;
    g._doAction({ kind: 'trade' });
    const reward = g.crow.carried;
    const out = {
      value: reward ? reward.value : 0,
      expected: g.level.tradeValues[0],
      parentedToBeak: !!reward && reward.root.parent === g.crow.grip,
    };
    g.crow.carried = null; g.tradeStep = 0;
    return out;
  });
  if (trade3) console.log('  L3 trade:', JSON.stringify(trade3));
  if (trade3 && trade3.value !== trade3.expected) {
    errors.push(`L3 first trade paid ${trade3.value}, expected ${trade3.expected}`);
  }
  if (trade3 && !trade3.parentedToBeak) errors.push('L3 trade reward was not auto-equipped');
  if (gulls && !gulls.count) errors.push('L3: no gulls on the roof');
  if (gulls && !gulls.landedBeside) errors.push('L3: a gull ignored a crow landing beside it');
  if (gulls && gulls.flewOver) errors.push('L3: a gull objected to a crow flying over it');

  /**
   * Dusk, measured. Same floors as level 1, sampled from the two places on this
   * block that can actually go dark: the yard, which is the bottom of a light
   * well, and the terrace, which is where the money is.
   *
   * `t` here is progress through the run, not time of day — the level starts at
   * 0.42 and its lamps catch at 0.52 of the session.
   */
  if (has3) {
    const FLOOR = { p50: RULES.duskMedianFloor, p05: RULES.duskShadowFloor };
    await p3.evaluate(() => {
      document.getElementById('hud').style.display = 'none';
      const b = document.getElementById('testmode');
      if (b) b.style.display = 'none';
    });

    const measure3 = async (through, settle, at) => {
      await p3.evaluate(([tt, pos]) => {
        const g = window.__game;
        g.running = false;
        g.finished = false;
        g.elapsed = tt * g.sessionSeconds;
        g.crow.pos.set(pos[0], pos[1], pos[2]);
        g.crow.vel.set(0, 0, 0);
      }, [through, at]);
      await new Promise((r) => setTimeout(r, settle));
      // The lamps take ~8s to come up and the sleep above does not know that.
      await settleLights(p3);
      const b64 = await p3.screenshot({ type: 'png', encoding: 'base64' });
      return p3.evaluate((u) => new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const cv = document.createElement('canvas');
          cv.width = img.width; cv.height = img.height;
          const cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0);
          const y0 = Math.floor(img.height * 0.42);
          const d = cx.getImageData(0, y0, img.width, img.height - y0).data;
          const L = [];
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 16) {
            L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
          }
          L.sort((x, y) => x - y);
          res({
            p05: Math.round(L[Math.floor(L.length * 0.05)]),
            p50: Math.round(L[Math.floor(L.length * 0.5)]),
            rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
          });
        };
        img.src = u;
      }), `data:image/png;base64,${b64}`);
    };

    let late = null;
    for (const [where, pos] of [['forecourt', [-11, 0, 12]], ['terrace', [-6, 5.4, -2]]]) {
      for (const [through, settle] of [[0.30, 500], [0.62, 9000], [0.98, 700]]) {
        const m = await measure3(through, settle, pos);
        const key = `l3-dusk-${where}-${String(Math.round(through * 100))}`;
        writeFileSync(`${OUT}/${key}.png`, await p3.screenshot({ type: 'png' }));
        console.log(`  ${key}: p05 ${m.p05}, p50 ${m.p50}, avg rgb ${m.rgb.join(',')}`);
        if (m.p50 < FLOOR.p50) errors.push(`${key}: median ${m.p50} below the ${FLOOR.p50} floor`);
        if (m.p05 < FLOOR.p05) errors.push(`${key}: 5th pct ${m.p05} below the ${FLOOR.p05} floor`);
        if (through > 0.9) late = m;
      }
    }
    if (late && late.rgb[2] <= late.rgb[0]) {
      errors.push(`L3 dusk reads warm, not violet: avg rgb ${late.rgb.join(',')}`);
    }
    await p3.evaluate(() => { document.getElementById('hud').style.display = ''; });
  }

  // The ending, with the level's own copy and an awkward amount.
  const end3 = !has3 ? null : await p3.evaluate(() => {
    const g = window.__game;
    g.total = 31.35; g.elapsed = 268; g.finished = false; g.running = true;
    g._finish(true);
    return {
      title: document.getElementById('ending-title').textContent.replace(/\s+/g, ' ').trim(),
      body: document.getElementById('ending-body').textContent.slice(0, 60),
      goal: g.goal,
    };
  });
  if (end3) console.log('  L3 ending:', JSON.stringify(end3));
  if (end3 && end3.goal !== 30) errors.push(`L3 goal is ${end3.goal}, expected 30`);
  if (end3 && !/thirty-one dollars thirty-five cents/i.test(end3.title)) {
    errors.push(`L3 ending headline wrong: "${end3.title}"`);
  }
  if (end3) { await new Promise((r) => setTimeout(r, 1400)); await shoot3('39-l3-ending'); }
}

// ── level 4: the lobby (shots 50-59; 40 is the touch pause control) ──────────
/**
 * The first interior, and its risks are nothing like the other three.
 *
 * A block with a roof is a block seen *through* something: this camera sits 38°
 * up and thirty metres back, so the sightline from anything on the floor leaves
 * through the ceiling. The first build had a steel truss up there and it laid a
 * grille over the entire level — five pickups caught by the audit and the crow
 * caught by nobody, because no headless test looks at what is in front of the
 * bird. The roof is sectioned away now and these frames are how that stays true.
 *
 * The other new thing is a forty-metre gallery. Everything under it is in
 * shadow that no key light reaches at any hour, which makes the back of this
 * floor the darkest place in the game — so it gets its own dusk sample.
 */
{
  const url4 = URL + (URL.includes('?') ? '&' : '?') + 'level=4';
  const p4 = await browser.newPage();
  await p4.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  p4.on('console', (m) => { if (m.type() === 'error') errors.push(`L4 console: ${m.text()}`); });
  p4.on('pageerror', (e) => errors.push(`L4 uncaught: ${e.message}`));
  p4.on('requestfailed', (r) => errors.push(`L4 404/failed: ${r.url()}`));

  console.log(`\nloading ${url4}`);
  await p4.goto(url4, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const booted4 = Date.now();
  await p4.waitForFunction(
    () => document.getElementById('loading')?.classList.contains('hidden')
       || (document.getElementById('loading')?.textContent || '').startsWith('Could not start'),
    { timeout: 30000 },
  ).catch(() => errors.push('L4: still booting after 30s — no error thrown, just slow'));
  const boot4Msg = await p4.$eval('#loading', (el) => (el.classList.contains('hidden') ? null : el.textContent))
    .catch(() => null);
  if (boot4Msg) errors.push(`L4 did not start: ${boot4Msg}`);
  console.log(`  L4 booted in ${Date.now() - booted4} ms`);

  const has4 = await p4.evaluate(() => !!window.__game);
  await p4.click('#start');
  await new Promise((r) => setTimeout(r, 1200));

  const shoot4 = async (name) => {
    writeFileSync(`${OUT}/${name}.png`, await p4.screenshot({ type: 'png' }));
    console.log(`  wrote ${OUT}/${name}.png`);
  };
  const look4 = async (name, x, y, z) => {
    if (!has4) return;
    await p4.evaluate(([px, py, pz]) => {
      window.__game.crow.pos.set(px, py, pz);
      window.__game.crow.vel.set(0, 0, 0);
    }, [x, y, z]);
    await new Promise((r) => setTimeout(r, 900));
    await shoot4(name);
  };

  await shoot4('50-l4-spawn');
  await look4('51-l4-fountain', 5, 0, 4);
  await look4('52-l4-desk', -10, 0, -3.6);
  await look4('53-l4-bell', -6.4, 0, -4.6);
  await look4('54-l4-bar', 13, 0, -2.6);
  await look4('55-l4-lounge', 14, 0, 7);
  await look4('56-l4-west', -17, 0, 6);
  await look4('57-l4-gallery', -12, 4.4, -8.4);
  await look4('58-l4-clock', 2, 6.97, -3.2);

  /**
   * The lobby fountain — the third body of water in the game, and the first two
   * both had a bug in them. A rim you can walk into but not out of is the
   * lobster pot, and it has arrived twice from two unrelated directions.
   */
  const pool4 = !has4 ? null : await p4.evaluate(async () => {
    const g = window.__game;
    const f = g.world.fountain;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    g.crow.pos.set(f.x, f.floor, f.z);
    g.crow.vel.set(0, 0, 0);
    await frame(); await frame();
    const out = { rim: f.rim, wet: g.crow.inWater };
    for (const [nm, drive] of [
      ['hold', () => ({ move: { x: 0, y: 0 }, flap: true })],
      ['tap', (i) => ({ move: { x: 0, y: 0 }, flap: (i % 12) < 5 })],
      ['walk', () => ({ move: { x: 1, y: 0 }, flap: false })],
    ]) {
      g.crow.pos.set(f.x, f.floor, f.z);
      g.crow.vel.set(0, 0, 0);
      g.crow.stamina = 0;
      g.crow.inWater = true;
      let escaped = false;
      for (let i = 0; i < 600 && !escaped; i++) {
        g.crow.update(1 / 60, drive(i), g.world, g.audio);
        const r = Math.hypot(g.crow.pos.x - f.x, g.crow.pos.z - f.z);
        escaped = (!g.crow.inWater && g.crow.pos.y > f.rim) || r > f.r + 0.5;
      }
      out[nm] = escaped;
    }
    g.crow.pos.set(12, 0, 9);
    g.crow.vel.set(0, 0, 0);
    return out;
  });
  if (pool4) console.log('  water:', JSON.stringify(pool4));
  if (pool4 && !pool4.wet) errors.push('L4: crow on the fountain floor is not in the water');
  if (pool4) {
    const failed = ['hold', 'tap', 'walk'].filter((k) => !pool4[k]);
    if (failed.length) errors.push(`L4: cannot get out of the lobby fountain by: ${failed.join(', ')}`);
  }

  /**
   * The chandelier crown, and the assertion the brief asked for.
   *
   * It is a three-metre disc hanging in mid-air with the nest on it, and it is
   * the only way to bank anything on this block. Every other nest in the game
   * stands on a building. Fly at it from eight headings and end up on it.
   */
  const crown = !has4 ? null : await p4.evaluate(async () => {
    const g = window.__game;
    const n = g.world.nest;
    const stuck = [];
    // Eight points round the rim, dropped from just above it with no input.
    //
    // The first version of this flew at the crown from five metres out and
    // reported all eight headings as unlandable — which was the *test* being
    // wrong, not the level: a crow crossing a three-metre disc at flight speed
    // has 0.35 s to fall 1.4 m, so it sailed over every time and then kept
    // going. What is actually worth asserting is the collision, not the piloting:
    // the whole disc has to be a floor, edges included, because banking is the
    // only reason anybody comes up here and you arrive carrying.
    for (let deg = 0; deg < 360; deg += 45) {
      const a = (deg * Math.PI) / 180;
      g.crow.pos.set(n.x + Math.cos(a) * 1.4, n.y + 1.2, n.z + Math.sin(a) * 1.4);
      g.crow.vel.set(0, 0, 0);
      let landed = false;
      for (let i = 0; i < 240 && !landed; i++) {
        g.crow.update(1 / 60, { move: { x: 0, y: 0 }, flap: false }, g.world, g.audio);
        landed = g.crow.grounded && Math.abs(g.crow.pos.y - n.y) < 0.3;
      }
      if (!landed) stuck.push(`${deg}° (fell to ${g.crow.pos.y.toFixed(1)})`);
    }
    g.crow.pos.set(8.5, 0, 5.5);
    g.crow.vel.set(0, 0, 0);
    return { stuck, nest: [n.x, n.y, n.z] };
  });
  if (crown) console.log('  crown:', JSON.stringify(crown));
  if (crown && crown.stuck.length) {
    errors.push(`L4: cannot land on the chandelier from ${crown.stuck.join(', ')}`);
  }

  /**
   * Every pickup on the gallery is visible from the camera.
   *
   * The audit already casts this ray headless, but the gallery is a forty-metre
   * overhang with a balustrade on the front of it and it is the one place on
   * this block where the answer is decided by centimetres — so it is worth
   * asking the real renderer, in the real scene, after the occluder clones have
   * been swapped in.
   */
  const seen = !has4 ? null : await p4.evaluate(() => {
    const g = window.__game;
    const THREE = g.crow.pos.constructor;
    const dir = new THREE(
      Math.sin(25 * Math.PI / 180) * Math.cos(38 * Math.PI / 180),
      Math.sin(38 * Math.PI / 180),
      Math.cos(25 * Math.PI / 180) * Math.cos(38 * Math.PI / 180),
    ).normalize();
    g.world.root.updateMatrixWorld(true);
    const opaque = [];
    g.world.root.traverse((o) => {
      if (!o.isMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m && m.transparent && m.opacity < 0.9) return;
      opaque.push(o);
    });
    const ray = new g.stage._ray.constructor();
    ray.far = 60;
    const blocked = [];
    for (const p of g.pickups) {
      if (p.home.y < 4) continue;                    // the gallery deck and up
      ray.set(p.home.clone().addScaledVector(dir, 0.06), dir);
      if (ray.intersectObjects(opaque, false).length) blocked.push(p.label);
    }
    return { checked: g.pickups.filter((p) => p.home.y >= 4).length, blocked };
  });
  if (seen) console.log('  gallery sightlines:', JSON.stringify(seen));
  if (seen && !seen.checked) errors.push('L4: nothing is on the gallery to look at');
  if (seen && seen.blocked.length) {
    errors.push(`L4: hidden on the gallery: ${seen.blocked.join(', ')}`);
  }

  /**
   * The set piece. A croissant on the floor empties the front desk; the same
   * croissant on the gallery feeds nobody, because birds do not use stairs.
   */
  const bait4 = !has4 ? null : await p4.evaluate(async () => {
    const g = window.__game;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const toast = () => document.getElementById('toast').textContent;
    const food = g.pickups.find((p) => p.kind === 'croissant');
    const out = { label: food.label };
    const dropAt = async (x, y, z) => {
      food.state = 'world'; food.taken = false;
      g.crow.pos.set(x, y, z);
      g.crow.vel.set(0, 0, 0);
      // Two frames, because a dropped pickup lands at the beak and the beak
      // comes off the rig's world matrix.
      await frame(); await frame();
      food.setCarried(g.crow.grip);
      g.crow.carried = food;
      g.foodUntil = 0;
      g._doAction({ kind: 'drop' });
      await frame();
      return toast();
    };
    out.onTheGallery = await dropAt(0, 4.4, -9);
    out.movedGallery = !!(g.foodUntil && g.foodUntil > g.elapsed);
    out.tooNear = await dropAt(-8, 0, -3.5);
    out.onTheFloor = await dropAt(8, 0, 8);
    out.movedFloor = !!(g.foodUntil && g.foodUntil > g.elapsed);
    out.guardDistracted = g.baitGuard.state === 'distracted';
    out.taskTicked = g.tasks.find((t) => t.id === 'desk').done;
    g.crow.carried = null;
    g.crow.pos.set(12, 0, 9);
    return out;
  });
  if (bait4) console.log('  bait:', JSON.stringify(bait4));
  if (bait4 && bait4.movedGallery) errors.push('L4: a croissant on the gallery moved the concierge');
  if (bait4 && !/up here/i.test(bait4.onTheGallery)) errors.push(`L4: no deck hint on the gallery: "${bait4.onTheGallery}"`);
  if (bait4 && !/desk/i.test(bait4.tooNear)) errors.push(`L4: no too-close hint by the desk: "${bait4.tooNear}"`);
  if (bait4 && !bait4.movedFloor) errors.push('L4: a legal croissant drop did nothing');
  if (bait4 && !bait4.guardDistracted) errors.push('L4: the concierge did not leave the desk');
  if (bait4 && !bait4.taskTicked) errors.push('L4: the concierge task did not tick');

  // The kid pays this block's ladder, and the reward auto-equips.
  const trade4 = !has4 ? null : await p4.evaluate(() => {
    const g = window.__game;
    const shiny = g.pickups.find((p) => p.kind === 'shiny' && !p.taken);
    if (!shiny) return { error: 'no shiny available' };
    shiny.setCarried(g.crow.grip);
    g.crow.carried = shiny;
    g._doAction({ kind: 'trade' });
    const reward = g.crow.carried;
    const out = {
      value: reward ? reward.value : 0,
      expected: g.level.tradeValues[0],
      parentedToBeak: !!reward && reward.root.parent === g.crow.grip,
    };
    g.crow.carried = null; g.tradeStep = 0;
    return out;
  });
  if (trade4) console.log('  L4 trade:', JSON.stringify(trade4));
  if (trade4 && trade4.value !== trade4.expected) {
    errors.push(`L4 first trade paid ${trade4.value}, expected ${trade4.expected}`);
  }
  if (trade4 && !trade4.parentedToBeak) errors.push('L4 trade reward was not auto-equipped');

  /**
   * The pianist, who is the one thing on this block nothing tells you about.
   *
   * Checked in the real page rather than headless because the interesting half
   * is the *prompt*: money near her has to offer GIVE without stealing the
   * kid's trade from a shiny, and the coin has to leave the world without
   * touching the total — `total` only moves on `bank`, and this is the check
   * that says so out loud.
   */
  const egg = !has4 ? null : await p4.evaluate(async () => {
    const g = window.__game;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const q = g.pianist;
    if (!q) return { error: 'no pianist' };
    const out = { songs: [], prompts: [] };

    const tip = async () => {
      const coin = g.pickups.find((x) => x.value > 0 && !x.taken && !x.pinned);
      g.crow.pos.set(q.pos.x + 1.1, 0, q.pos.z + 0.6);
      g.crow.vel.set(0, 0, 0);
      await frame(); await frame();
      coin.setCarried(g.crow.grip);
      g.crow.carried = coin;
      const a = g._bestAction();
      out.prompts.push(a && `${a.verb} — ${a.noun}`);
      const before = g.total;
      out.songs.push(g.audio.songIndex);
      g.pianoUntil = 0;                       // she has stopped; ask for another
      g._doAction(a);
      out.totalHeld = (out.totalHeld ?? true) && g.total === before;
      out.gone = (out.gone ?? true) && coin.taken;
    };
    // Four, so the rotation is seen to wrap rather than merely to advance.
    for (let i = 0; i < 4; i++) await tip();

    // A shiny next to her is still the kid's business, not hers.
    const shiny = g.pickups.find((x) => x.kind === 'shiny' && !x.taken);
    shiny.setCarried(g.crow.grip);
    g.crow.carried = shiny;
    const a2 = g._bestAction();
    out.withShiny = a2 && a2.kind;

    g.crow.carried = null;
    g.pianoUntil = 0;
    g.crow.pos.set(7, 0, 5);
    return out;
  });
  if (egg) console.log('  pianist:', JSON.stringify(egg));
  if (egg && egg.error) errors.push(`L4: ${egg.error}`);
  if (egg && !egg.error) {
    if (!egg.prompts.every((t) => /GIVE — to the pianist/.test(t || ''))) {
      errors.push(`L4: pianist prompt wrong: ${JSON.stringify(egg.prompts)}`);
    }
    if (JSON.stringify(egg.songs) !== JSON.stringify([0, 1, 2, 3])) {
      errors.push(`L4: the repertoire did not advance in order: ${JSON.stringify(egg.songs)}`);
    }
    if (!egg.totalHeld) errors.push('L4: tipping the pianist changed the money in the nest');
    if (!egg.gone) errors.push('L4: the coin given to the pianist is still in the world');
    if (egg.withShiny === 'tip') errors.push('L4: a shiny near the pianist stole the kid\'s trade');
  }

  /**
   * Dusk, measured from the two places this room can go dark: the middle of the
   * floor, which is lit by one chandelier and nothing else, and under the
   * gallery, where no key light reaches at any hour of any day.
   */
  if (has4) {
    const FLOOR = { p50: RULES.duskMedianFloor, p05: RULES.duskShadowFloor };
    await p4.evaluate(() => {
      document.getElementById('hud').style.display = 'none';
      const b = document.getElementById('testmode');
      if (b) b.style.display = 'none';
    });

    const measure4 = async (through, settle, at) => {
      await p4.evaluate(([tt, pos]) => {
        const g = window.__game;
        g.running = false;
        g.finished = false;
        g.elapsed = tt * g.sessionSeconds;
        g.crow.pos.set(pos[0], pos[1], pos[2]);
        g.crow.vel.set(0, 0, 0);
      }, [through, at]);
      await new Promise((r) => setTimeout(r, settle));
      // The lamps take ~8s to come up and the sleep above does not know that.
      await settleLights(p4);
      const b64 = await p4.screenshot({ type: 'png', encoding: 'base64' });
      return p4.evaluate((u) => new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const cv = document.createElement('canvas');
          cv.width = img.width; cv.height = img.height;
          const cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0);
          const y0 = Math.floor(img.height * 0.42);
          const d = cx.getImageData(0, y0, img.width, img.height - y0).data;
          const L = [];
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 16) {
            L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
          }
          L.sort((x, y) => x - y);
          res({
            p05: Math.round(L[Math.floor(L.length * 0.05)]),
            p50: Math.round(L[Math.floor(L.length * 0.5)]),
            rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
          });
        };
        img.src = u;
      }), `data:image/png;base64,${b64}`);
    };

    let late4 = null;
    for (const [where, pos] of [['floor', [4, 0, 5]], ['gallery', [-8, 0, -4]]]) {
      for (const [through, settle] of [[0.20, 500], [0.45, 9000], [0.98, 700]]) {
        const m = await measure4(through, settle, pos);
        const key = `l4-dusk-${where}-${String(Math.round(through * 100))}`;
        writeFileSync(`${OUT}/${key}.png`, await p4.screenshot({ type: 'png' }));
        console.log(`  ${key}: p05 ${m.p05}, p50 ${m.p50}, avg rgb ${m.rgb.join(',')}`);
        if (m.p50 < FLOOR.p50) errors.push(`${key}: median ${m.p50} below the ${FLOOR.p50} floor`);
        if (m.p05 < FLOOR.p05) errors.push(`${key}: 5th pct ${m.p05} below the ${FLOOR.p05} floor`);
        if (through > 0.9) late4 = m;
      }
    }
    if (late4 && late4.rgb[2] <= late4.rgb[0]) {
      errors.push(`L4 dusk reads warm, not violet: avg rgb ${late4.rgb.join(',')}`);
    }
    await p4.evaluate(() => { document.getElementById('hud').style.display = ''; });
  }

  // The ending, with the level's own copy, its own goal, and no next block.
  const end4 = !has4 ? null : await p4.evaluate(() => {
    const g = window.__game;
    g.total = 36.15; g.elapsed = 289; g.finished = false; g.running = true;
    g._finish(true);
    return {
      title: document.getElementById('ending-title').textContent.replace(/\s+/g, ' ').trim(),
      body: document.getElementById('ending-body').textContent.slice(0, 60),
      goal: g.goal,
      onward: document.getElementById('onward').hidden,
    };
  });
  if (end4) console.log('  L4 ending:', JSON.stringify(end4));
  if (end4 && end4.goal !== 35) errors.push(`L4 goal is ${end4.goal}, expected 35`);
  if (end4 && !/thirty-six dollars fifteen cents/i.test(end4.title)) {
    errors.push(`L4 ending headline wrong: "${end4.title}"`);
  }
  // The lobby stopped being the last block when the wharf arrived, so this
  // reads the registry rather than restating it — the same fix this file
  // already made when "the last block is 3" became wrong.
  if (end4 && end4.onward === (LEVELS.find((l) => l.id === 4).next != null)) {
    errors.push(`L4's next button is ${end4.onward ? 'hidden' : 'shown'} and the registry disagrees`);
  }
  if (end4) { await new Promise((r) => setTimeout(r, 1400)); await shoot4('59-l4-ending'); }
}

// ── level 5: the wharf (shots 60-69) ─────────────────────────────────────────
/**
 * The block whose ground is not continuous, and its risks are its own.
 *
 * Every other level can be checked by asking "can the camera see this" and "can
 * a walker get round that". Here the question is whether a *bird* can get
 * anywhere at all: the nest stands in open water with nothing walkable within
 * nine metres of it, and the money that teaches the level is on a piling cap
 * with no floor between it and the quay. So these frames photograph the water
 * from both sides of it, and the functional checks are all about getting out of
 * it and back onto things.
 *
 * The harbour is also the largest single surface in the game — bigger than the
 * park's lawn — and it is the only large surface that no lamp can reach. Both
 * dusk samples exist because of that.
 */
{
  const url5 = URL + (URL.includes('?') ? '&' : '?') + 'level=5';
  const p5 = await browser.newPage();
  await p5.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  p5.on('console', (m) => { if (m.type() === 'error') errors.push(`L5 console: ${m.text()}`); });
  p5.on('pageerror', (e) => errors.push(`L5 uncaught: ${e.message}`));
  p5.on('requestfailed', (r) => errors.push(`L5 404/failed: ${r.url()}`));

  console.log(`\nloading ${url5}`);
  await p5.goto(url5, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const booted5 = Date.now();
  await p5.waitForFunction(
    () => document.getElementById('loading')?.classList.contains('hidden')
       || (document.getElementById('loading')?.textContent || '').startsWith('Could not start'),
    { timeout: 30000 },
  ).catch(() => errors.push('L5: still booting after 30s — no error thrown, just slow'));
  const boot5Msg = await p5.$eval('#loading', (el) => (el.classList.contains('hidden') ? null : el.textContent))
    .catch(() => null);
  if (boot5Msg) errors.push(`L5 did not start: ${boot5Msg}`);
  console.log(`  L5 booted in ${Date.now() - booted5} ms`);

  const has5 = await p5.evaluate(() => !!window.__game);
  await p5.click('#start');
  await new Promise((r) => setTimeout(r, 1200));

  const shoot5 = async (name) => {
    writeFileSync(`${OUT}/${name}.png`, await p5.screenshot({ type: 'png' }));
    console.log(`  wrote ${OUT}/${name}.png`);
  };
  const look5 = async (name, x, y, z) => {
    if (!has5) return;
    await p5.evaluate(([px, py, pz]) => {
      window.__game.crow.pos.set(px, py, pz);
      window.__game.crow.vel.set(0, 0, 0);
    }, [x, y, z]);
    await new Promise((r) => setTimeout(r, 900));
    await shoot5(name);
  };

  await shoot5('60-l5-spawn');
  await look5('61-l5-market', -12, 0, 10.5);
  await look5('62-l5-cutting-table', -16, 0, 7.6);
  await look5('63-l5-kid', -1, 0, 4.2);
  await look5('64-l5-pier', -5.5, 0.62, -7.5);
  await look5('65-l5-boat', 1.5, 1.15, -5);
  await look5('66-l5-beacon', 4.5, 6.5, -8);
  await look5('67-l5-pilings', 11, 1.36, -8);
  await look5('68-l5-east', 14, 0, 7);

  /**
   * The harbour, which is the fourth body of water in the game and the first
   * that is not a circle.
   *
   * Three of the first three had a lobster-pot bug in them at some point, from
   * three unrelated directions, so this asks the real engine the same question
   * the audit asks headless — and it asks it from a corner as well as from the
   * middle, because a rectangle has corners and a circle does not.
   */
  const pool5 = !has5 ? null : await p5.evaluate(async () => {
    const g = window.__game;
    const f = g.world.fountain;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const outside = (x, z) => x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ;
    g.crow.pos.set(f.x, f.floor, f.z);
    g.crow.vel.set(0, 0, 0);
    await frame(); await frame();
    const out = { shape: f.shape, wet: g.crow.inWater, from: {} };
    for (const [spot, sx, sz] of [
      ['middle', f.x, f.z],
      ['far-west-corner', f.minX + 1.6, f.minZ + 1.6],
      ['near-east-corner', f.maxX - 1.6, f.maxZ - 1.6],
    ]) {
      out.from[spot] = {};
      for (const [nm, drive] of [
        ['hold', () => ({ move: { x: 0, y: 0 }, flap: true })],
        ['tap', (i) => ({ move: { x: 0, y: 0 }, flap: (i % 12) < 5 })],
      ]) {
        g.crow.pos.set(sx, f.floor, sz);
        g.crow.vel.set(0, 0, 0);
        g.crow.stamina = 0;
        g.crow.inWater = true;
        let escaped = false;
        for (let i = 0; i < 720 && !escaped; i++) {
          g.crow.update(1 / 60, drive(i), g.world, g.audio);
          escaped = (!g.crow.inWater && g.crow.pos.y > f.rim)
            || outside(g.crow.pos.x, g.crow.pos.z);
        }
        out.from[spot][nm] = escaped;
      }
    }
    g.crow.pos.set(6, 0, 10);
    g.crow.vel.set(0, 0, 0);
    return out;
  });
  if (pool5) console.log('  water:', JSON.stringify(pool5));
  if (pool5 && pool5.shape !== 'box') errors.push(`L5 water is ${pool5.shape}, expected box`);
  if (pool5 && !pool5.wet) errors.push('L5: crow on the harbour floor is not in the water');
  if (pool5) {
    for (const [spot, modes] of Object.entries(pool5.from)) {
      const failed = Object.entries(modes).filter(([, ok]) => !ok).map(([k]) => k);
      if (failed.length) errors.push(`L5: cannot get out of the harbour from the ${spot} by: ${failed.join(', ')}`);
    }
  }

  /**
   * The beacon crown, and the same assertion the chandelier earned.
   *
   * It is a 3.2 m platform on a tower in open water and it is the only way to
   * bank anything on this block — if an edge of it is not a floor, the money
   * goes in the harbour. Dropped onto eight points round the rim with no input,
   * which asserts the collision rather than a particular flight path.
   */
  const crown5 = !has5 ? null : await p5.evaluate(async () => {
    const g = window.__game;
    const n = g.world.nest;
    const stuck = [];
    for (let deg = 0; deg < 360; deg += 45) {
      const a = (deg * Math.PI) / 180;
      g.crow.pos.set(n.x + Math.cos(a) * 1.35, n.y + 1.2, n.z + Math.sin(a) * 1.35);
      g.crow.vel.set(0, 0, 0);
      let landed = false;
      for (let i = 0; i < 240 && !landed; i++) {
        g.crow.update(1 / 60, { move: { x: 0, y: 0 }, flap: false }, g.world, g.audio);
        landed = g.crow.grounded && Math.abs(g.crow.pos.y - n.y) < 0.3;
      }
      if (!landed) stuck.push(`${deg}° (fell to ${g.crow.pos.y.toFixed(1)})`);
    }
    g.crow.pos.set(6, 0, 10);
    g.crow.vel.set(0, 0, 0);
    return { stuck, nest: [n.x, n.y, n.z] };
  });
  if (crown5) console.log('  crown:', JSON.stringify(crown5));
  if (crown5 && crown5.stuck.length) {
    errors.push(`L5: cannot land on the beacon from ${crown5.stuck.join(', ')}`);
  }

  /**
   * And the flight the whole block is built on: pier to nest, carrying.
   *
   * The design claim is that banking costs a crossing of open water and not a
   * stamina bar. If a crow leaving the pier with a full bar cannot reach the
   * beacon, every trip to the nest ends in the harbour and the level is a
   * grind — so it is measured rather than assumed.
   */
  const reach5 = !has5 ? null : await p5.evaluate(async () => {
    const g = window.__game;
    const n = g.world.nest;
    const G = g.world.decks.gallery;

    /**
     * A world direction, expressed as the stick input that produces it.
     *
     * The crow moves in *camera space* — `wish = right * move.x + forward *
     * -move.y` — so writing a world direction straight into `move` is off by the
     * camera's 25° yaw, and writing `-dz` instead of `dz` sends it away
     * entirely. Both of those were wrong in the first version of this test and
     * both reported a reachable nest as unreachable. Solved against the game's
     * real basis rather than a hardcoded angle.
     */
    const { forward, right } = g.stage.basis();
    const det = right.x * forward.z - forward.x * right.z;
    const toMove = (wx, wz) => ({
      x: (wx * forward.z - forward.x * wz) / det,
      y: -((right.x * wz - wx * right.z) / det),
    });

    /**
     * Fly from a standing start onto a deck, the way a player does: climb clear
     * of whatever is overhead, then cross.
     *
     * The hold-off matters. The crown overhangs the tower it stands on, so a
     * crow that steers in while still below it rises into an underside and gets
     * bonked — which is exactly the bug this test found in the level, when the
     * gallery was narrower than the crown and *every* point on it was under the
     * overhang.
     */
    const flyTo = (t, sx, sy, sz, stamina) => {
      g.crow.pos.set(sx, sy, sz);
      g.crow.vel.set(0, 0, 0);
      g.crow.stamina = stamina;
      let best = 1e9;
      for (let i = 0; i < 60 * 10; i++) {
        const dx = t.x - g.crow.pos.x, dz = t.z - g.crow.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const steer = (g.crow.pos.y > t.y + 0.2 || d > 2.2) ? 1 : 0;
        const m = toMove((dx / d) * steer, (dz / d) * steer);
        g.crow.update(1 / 60, { move: m, flap: g.crow.pos.y < t.y + 0.8 }, g.world, g.audio);
        const flat = Math.hypot(g.crow.pos.x - t.x, g.crow.pos.z - t.z);
        best = Math.min(best, flat);
        // Landed means *here*, not merely at this height. The first version
        // checked only y, and the coping is at 0.62 all the way round the
        // harbour — so standing on the quay counted as reaching the pier head,
        // eighteen metres away.
        if (g.crow.grounded && Math.abs(g.crow.pos.y - t.y) < 0.3 && flat < 2.0) {
          return { landed: true, closest: Number(best.toFixed(2)), at: Number((i / 60).toFixed(2)) };
        }
      }
      return { landed: false, closest: Number(best.toFixed(2)), at: null };
    };

    /**
     * The intended ladder out to the nest, and a half-empty bar rather than a
     * full one — you arrive at a climb having just flown away from somebody,
     * which is the reasoning that sizes RULES.maxUnbrokenClimb at 60% of the
     * ceiling. The last leg is the teaching flight for the five.
     */
    const legs = [
      ['pier head → the boat', { x: 2.4, y: g.world.decks.boat, z: -5 }, [-5.5, 0.62, -9.0], 0.55],
      ['the boat → the wheelhouse', { x: -1.2, y: g.world.decks.wheelhouse, z: -5 }, [1.5, g.world.decks.boat, -5.0], 0.55],
      ['the wheelhouse → the gallery', { x: n.x, y: G, z: n.z }, [-1.2, g.world.decks.wheelhouse, -5.0], 0.55],
      ['the gallery → the nest', n, [n.x + 2.0, G, n.z], 0.55],
      ['the east coping → the pilings', { x: 11, y: 1.36, z: -8 }, [14.35, 0.62, -8.0], 0.55],
      ['the pier head → the gallery, full bar', { x: n.x, y: G, z: n.z }, [-5.5, 0.62, -9.0], 1.0],
    ];
    const runs = legs.map(([leg, t, from, st]) => ({ leg, ...flyTo(t, from[0], from[1], from[2], st) }));
    g.crow.pos.set(1, 0, 8.5);
    g.crow.vel.set(0, 0, 0);
    return runs;
  });
  if (reach5) console.log('  reach:', JSON.stringify(reach5));
  if (reach5) {
    const missed = reach5.filter((r) => !r.landed).map((r) => `${r.leg} (within ${r.closest}m)`);
    if (missed.length) errors.push(`L5: cannot fly ${missed.join('; ')}`);
  }

  // ── dusk, from the quay and from out over the water ───────────────────────
  if (has5) {
    const FLOOR = { p50: RULES.duskMedianFloor, p05: RULES.duskShadowFloor };
    await p5.evaluate(() => { document.getElementById('hud').style.display = 'none'; });

    const measure5 = async (through, settle, at) => {
      await p5.evaluate(([tt, pos]) => {
        const g = window.__game;
        g.running = false;
        g.finished = false;
        g.elapsed = tt * g.sessionSeconds;
        g.crow.pos.set(pos[0], pos[1], pos[2]);
        g.crow.vel.set(0, 0, 0);
      }, [through, at]);
      await new Promise((r) => setTimeout(r, settle));
      // The lamps take ~8s to come up and the sleep above does not know that.
      await settleLights(p5);
      const b64 = await p5.screenshot({ type: 'png', encoding: 'base64' });
      return p5.evaluate((u) => new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const cv = document.createElement('canvas');
          cv.width = img.width; cv.height = img.height;
          const cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0);
          const y0 = Math.floor(img.height * 0.42);
          const d = cx.getImageData(0, y0, img.width, img.height - y0).data;
          const L = [];
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 16) {
            L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
          }
          L.sort((x, y) => x - y);
          res({
            p05: Math.round(L[Math.floor(L.length * 0.05)]),
            p50: Math.round(L[Math.floor(L.length * 0.5)]),
            rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
          });
        };
        img.src = u;
      }), `data:image/png;base64,${b64}`);
    };

    let late5 = null;
    for (const [where, pos] of [['quay', [-6, 0, 7]], ['water', [-5.5, 0.62, -7.5]]]) {
      for (const [through, settle] of [[0.20, 500], [0.45, 9000], [0.98, 700]]) {
        const m = await measure5(through, settle, pos);
        const key = `l5-dusk-${where}-${String(Math.round(through * 100))}`;
        writeFileSync(`${OUT}/${key}.png`, await p5.screenshot({ type: 'png' }));
        console.log(`  ${key}: p05 ${m.p05}, p50 ${m.p50}, avg rgb ${m.rgb.join(',')}`);
        if (m.p50 < FLOOR.p50) errors.push(`${key}: median ${m.p50} below the ${FLOOR.p50} floor`);
        if (m.p05 < FLOOR.p05) errors.push(`${key}: 5th pct ${m.p05} below the ${FLOOR.p05} floor`);
        if (through > 0.9) late5 = m;
      }
    }
    /**
     * And the hue, which is the number that has been quietly eroding.
     *
     * The lobby ships with blue over red by 10 and 17 at t = 0.98, down from
     * the roofline's 18 and 34, because warm additive light eats the violet the
     * whole style guide is built on. This block's biggest surface is cool by
     * nature, so it should be repaying that rather than spending it — the
     * margin is printed every run so it stops being invisible.
     */
    if (late5) {
      console.log(`  L5 dusk hue: blue over red by ${late5.rgb[2] - late5.rgb[0]}`);
      if (late5.rgb[2] <= late5.rgb[0]) {
        errors.push(`L5 dusk reads warm, not violet: avg rgb ${late5.rgb.join(',')}`);
      }
    }
    await p5.evaluate(() => { document.getElementById('hud').style.display = ''; });
  }

  // The ending: its own copy, its own goal, and no next block after it.
  const end5 = !has5 ? null : await p5.evaluate(() => {
    const g = window.__game;
    g.total = 41.20; g.elapsed = 301; g.finished = false; g.running = true;
    g._finish(true);
    return {
      title: document.getElementById('ending-title').textContent.replace(/\s+/g, ' ').trim(),
      body: document.getElementById('ending-body').textContent.slice(0, 60),
      goal: g.goal,
      onward: document.getElementById('onward').hidden,
    };
  });
  if (end5) console.log('  L5 ending:', JSON.stringify(end5));
  if (end5 && end5.goal !== 40) errors.push(`L5 goal is ${end5.goal}, expected 40`);
  if (end5 && !/forty-one dollars twenty cents/i.test(end5.title)) {
    errors.push(`L5 ending headline wrong: "${end5.title}"`);
  }
  if (end5 && end5.onward === false) errors.push('L5 is the last block but offered a next one');
  if (end5) { await new Promise((r) => setTimeout(r, 1400)); await shoot5('69-l5-ending'); }

  // This section wins a block, which clears it. Any later section that needs a
  // known save has to clear storage itself — see the navigation notes below.
  await p5.close();
}

// ── the way from one block to the next ───────────────────────────────────────
/**
 * Finishing a block hands you the one after it, and "Again!" drops you back
 * into the one you are on. Both rebuild the level inside the same page rather
 * than reloading, which is the only way the audio survives — a reload comes
 * back with no user gesture, so the AudioContext cannot be unlocked and the
 * game is silent until the player next presses something.
 *
 * Building in place is also the thing most likely to rot quietly, in two ways
 * that this checks and a person would not: state from the last block surviving
 * into the next one, and GPU resources that are never freed. The second is why
 * the geometry count is asserted rather than eyeballed — every mesh owns its
 * geometry, so a leak here grows without bound across a session of replays.
 */
{
  const nav = await browser.newPage();
  await nav.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  nav.on('console', (m) => { if (m.type() === 'error') errors.push(`nav console: ${m.text()}`); });
  nav.on('pageerror', (e) => errors.push(`nav uncaught: ${e.message}`));

  console.log('\nlevel navigation');
  /**
   * Pinned to level 1, and it has to be.
   *
   * A bare URL used to mean "level 1" and now means "wherever you left off" —
   * and every page in this run shares one `localStorage`, so the sections above
   * that win a block to photograph its ending also clear it. This test would
   * otherwise boot into whatever the *previous* test finished, which is how it
   * first failed: it opened the roofline and asserted the block's ending copy.
   */
  await nav.evaluateOnNewDocument(() => {
    try { localStorage.clear(); } catch { /* private mode, nothing to clear */ }
  });
  await nav.goto(`${URL}?level=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await nav.waitForFunction(
    () => document.getElementById('loading')?.classList.contains('hidden'),
    { timeout: 30000 },
  ).catch(() => errors.push('nav: game never booted'));

  const hasNav = await nav.evaluate(() => !!window.__game);
  await nav.click('#start');
  await new Promise((r) => setTimeout(r, 900));

  if (!hasNav) {
    console.log('  note: no __game handle (production build) — navigation checks skipped');
  } else {
    /** Everything worth knowing about which block is on screen. */
    const state = () => nav.evaluate(() => {
      const g = window.__game;
      const r = g.stage.renderer.info.memory;
      return {
        id: g.level.id,
        goal: g.goal,
        hudGoal: document.getElementById('goal').textContent,
        money: document.getElementById('amt').textContent,
        tasks: [...document.querySelectorAll('#task-list li')].map((li) => li.textContent),
        // What the block actually asked for, so the rendered list can be
        // compared against its own source rather than against a guess.
        wanted: g.tasks.map((t) => t.text),
        count: document.getElementById('tasks-count').textContent,
        running: g.running,
        titleHidden: document.getElementById('title').classList.contains('hidden'),
        endingHidden: document.getElementById('ending').classList.contains('hidden'),
        geometries: r.geometries,
        textures: r.textures,
        children: g.stage.scene.children.length,
      };
    });
    /** Win the block outright, and report what the ending offers. */
    const win = () => nav.evaluate(() => {
      const g = window.__game;
      g.total = g.goal + 2.66;
      g.elapsed = 247;
      g.finished = false;
      g.running = true;
      g._finish(true);
      const on = document.getElementById('onward');
      const ag = document.getElementById('again');
      return {
        onward: on.hidden ? null : on.textContent.trim(),
        againIsGhost: ag.classList.contains('ghost'),
        nextId: g._nextId,
      };
    });

    const before = await state();
    const end1 = await win();
    console.log(`  L${before.id} ending offers: ${JSON.stringify(end1)}`);
    if (end1.onward !== 'The park →') errors.push(`L1 ending's next button reads "${end1.onward}"`);
    if (!end1.againIsGhost) errors.push('L1 ending: Again! is not the secondary button');

    await nav.click('#onward');
    await new Promise((r) => setTimeout(r, 1200));
    const after = await state();
    console.log(`  → L${after.id}: goal ${after.hudGoal}, ${after.tasks.length} tasks, `
      + `${after.geometries} geometries`);

    if (after.id !== 2) errors.push(`the next-level button landed on L${after.id}, expected 2`);
    if (!after.running) errors.push('the next block is not running — it stopped at a card');
    if (!after.titleHidden) errors.push('the next block dropped the player on the title screen');
    if (!after.endingHidden) errors.push("the previous block's ending screen is still up");
    if (after.hudGoal !== 'of $25.00') errors.push(`HUD goal did not follow the block: ${after.hudGoal}`);
    if (after.money !== '$0.00') errors.push(`money carried across a level swap: ${after.money}`);
    /**
     * The task list keys off task id and `setTasks` only ever appends, so a
     * level swap is exactly where the previous block's rows would survive
     * underneath the new ones.
     *
     * Checked against the block's own task list rather than against the
     * previous block's: two blocks legitimately share wording — "Trade
     * something shiny" is the same job everywhere — so an overlap test reports
     * a swap that worked perfectly well. Equality is the actual invariant.
     */
    if (JSON.stringify(after.tasks) !== JSON.stringify(after.wanted)) {
      errors.push(`task list is not the new block's: ${JSON.stringify(after.tasks)}`);
    }
    if (after.count !== `0/${after.wanted.length}`) {
      errors.push(`task counter reads ${after.count} on a fresh block`);
    }

    // The last block has nowhere to send you, so its single action must be the
    // brass one rather than an outlined button beside an empty slot.
    await nav.evaluate((id) => window.__game.loadLevel(id, true), LAST.id);
    await new Promise((r) => setTimeout(r, 1000));
    const endLast = await win();
    console.log(`  last block (${LAST.shortName}) ending offers: ${JSON.stringify(endLast)}`);
    if (endLast.onward !== null) errors.push(`the last block offers a next level: "${endLast.onward}"`);
    if (endLast.againIsGhost) errors.push('the last block leaves Again! as a secondary button');

    // And the block before it does offer one, by name — the same field, read
    // from the other side, so "nothing is offered" can never pass by accident.
    const prev = LEVELS.find((l) => l.next === LAST.id);
    await nav.evaluate((id) => window.__game.loadLevel(id, true), prev.id);
    await new Promise((r) => setTimeout(r, 1000));
    const endPrev = await win();
    console.log(`  ${prev.shortName} ending offers: ${JSON.stringify(endPrev)}`);
    if (!endPrev.onward || !endPrev.onward.toLowerCase().includes(LAST.shortName.replace(/^the /, ''))) {
      errors.push(`${prev.shortName} does not offer ${LAST.shortName}: "${endPrev.onward}"`);
    }

    // And losing never hands out the next block — you reach one by finishing
    // the one before it, and that rule is the whole progression system.
    const lost = await nav.evaluate(() => {
      const g = window.__game;
      g.loadLevel(1, true);
      g.total = 4.2;
      g.finished = false;
      g.running = true;
      g._finish(false);
      return {
        onwardHidden: document.getElementById('onward').hidden,
        nextId: g._nextId,
      };
    });
    console.log(`  a losing L1 offers: ${JSON.stringify(lost)}`);
    if (!lost.onwardHidden || lost.nextId) errors.push('running out of light still unlocks the next block');

    /**
     * The leak, measured.
     *
     * Every mesh owns its own geometry, so if teardown missed anything the
     * count climbs by a whole block on every swap — eight of them would be
     * about four thousand. Materials are deliberately not counted: they come
     * from a shared cache by colour and are supposed to outlive any one block.
     *
     * Geometry is bounded rather than pinned, because a block is not built the
     * same way twice: `addSkyline` drops 22% of its windows at random, which
     * moves the roofline's mesh count over a spread of about ten. Anything
     * inside a quarter of a block is that; anything above it is a leak. Scene
     * children *are* deterministic — a missed root shows up there exactly —
     * so that one is pinned.
     */
    const SLACK = 120;

    /**
     * Swap the way a player does: pause, open the level list, click a chip,
     * press the button.
     *
     * This used to call `loadLevel` directly, which tested teardown and nothing
     * else. The menu is now the only route a player has to a level swap, and it
     * does more than `loadLevel` on the way through — it paints chips, hides two
     * other screens and resolves an armed id — so the leak check is worth
     * pointing at the real path rather than at a parallel one that can drift
     * from it.
     */
    const swapViaMenu = async (id) => {
      await nav.evaluate(() => {
        const g = window.__game;
        // Everything unlocked: this is a memory test, not a ladder test, and a
        // locked chip is correctly unclickable.
        g.progress.cleared = [1, 2, 3];
        g.total = 0;                       // no nest money, so no forfeit prompt
        if (!g.paused && g.running) g.pause();
        g.showLevels();
      });
      await nav.click(`#levels-list .chip[data-level="${id}"]`);
      await nav.click('#levels-play');
      await new Promise((r) => setTimeout(r, 350));
    };

    await swapViaMenu(3);
    await new Promise((r) => setTimeout(r, 550));
    const base = await state();
    for (let i = 0; i < 4; i++) {
      await swapViaMenu(1);
      await swapViaMenu(3);
    }
    const leaked = await state();
    console.log(`  after 8 swaps: ${leaked.geometries} geometries (was ${base.geometries}), `
      + `${leaked.textures} textures (was ${base.textures}), `
      + `${leaked.children} scene children (was ${base.children})`);
    if (leaked.geometries > base.geometries + SLACK) {
      errors.push(`level swaps leak geometry: ${base.geometries} → ${leaked.geometries} after 8`);
    }
    if (leaked.textures > base.textures + 4) {
      errors.push(`level swaps leak textures: ${base.textures} → ${leaked.textures} after 8`);
    }
    if (leaked.children !== base.children) {
      errors.push(`level swaps leak scene children: ${base.children} → ${leaked.children} after 8`);
    }

    writeFileSync(`${OUT}/14-ending-onward.png`, await (async () => {
      await nav.evaluate(() => window.__game.loadLevel(1, true));
      await new Promise((r) => setTimeout(r, 900));
      await nav.evaluate(() => {
        const g = window.__game;
        g.total = 22.66; g.elapsed = 247; g.finished = false; g.running = true;
        g._finish(true);
      });
      await new Promise((r) => setTimeout(r, 1600));
      return nav.screenshot({ type: 'png' });
    })());
    console.log(`  wrote ${OUT}/14-ending-onward.png`);
  }
  await nav.close();
}

// ── mobile pass ──────────────────────────────────────────────────────────────
// Phone layout cannot be eyeballed any other way, and the bottom-right corner
// is contested there: the sun dial and the touch buttons both want it.
const mob = await browser.newPage();
mob.on('pageerror', (e) => errors.push(`mobile uncaught: ${e.message}`));
mob.on('console', (m) => { if (m.type() === 'error') errors.push(`mobile console: ${m.text()}`); });
await mob.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
// puppeteer's emulateMediaFeatures whitelist has no 'pointer', so go via CDP.
// Without this the page never sets body.touch and the on-screen controls stay
// hidden, which is precisely the layout under test.
const mobCdp = await mob.createCDPSession();
await mobCdp.send('Emulation.setEmulatedMedia', {
  features: [{ name: 'pointer', value: 'coarse' }, { name: 'any-pointer', value: 'coarse' }],
});
// Pinned to level 1 for the same reason the nav page is: every page in this run
// shares one localStorage, the sections above win blocks to photograph their
// endings, and a bare URL now resolves to whatever they left cleared. 12- and
// 13- are documented as *the block's* mobile layout, and the HUD-overlap check
// measures the block's task list specifically.
await mob.goto(`${URL}?level=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await mob.waitForFunction(
  () => document.getElementById('loading')?.classList.contains('hidden'),
  { timeout: 20000 },
).catch(() => errors.push('mobile: game never booted'));

const touchLayout = await mob.evaluate(() => ({ touchClass: document.body.classList.contains('touch') }));
if (!touchLayout.touchClass) errors.push('mobile: touch layout did not activate');

await mob.tap('#start');
await new Promise((r) => setTimeout(r, 1500));
writeFileSync(`${OUT}/12-mobile.png`, await mob.screenshot({ type: 'png' }));
console.log(`  wrote ${OUT}/12-mobile.png`);

// Overlap check: no HUD element may intersect the touch buttons.
const overlap = await mob.evaluate(() => {
  const box = (id) => {
    const el = document.getElementById(id);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? r : null;
  };
  const hits = (a, b) => a && b
    && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const buttons = box('buttons');
  const out = [];
  for (const id of ['sun', 'stam', 'money', 'tasks', 'carry']) {
    if (hits(box(id), buttons)) out.push(id);
  }
  const b = box('buttons'), sun = box('sun'), tasks = box('tasks');
  return {
    collides: out,
    tasksCollapsed: document.getElementById('tasks').classList.contains('collapsed'),
    sunAboveButtonsBy: b && sun ? Math.round(b.top - sun.bottom) : null,
    headerLines: tasks ? Math.round(document.getElementById('tasks-toggle').getBoundingClientRect().height) : null,
  };
});
console.log('  mobile layout:', JSON.stringify(overlap));
if (overlap.collides.length) {
  errors.push(`mobile: ${overlap.collides.join(', ')} overlapping the touch buttons`);
}

/**
 * The task list should fold down to a count once it has introduced itself.
 *
 * Waited for rather than slept through. The countdown is 12s of *simulated*
 * time, decremented from rAF deltas, and a page that is not foreground gets its
 * rAF throttled — so a flat 12000ms sleep raced the thing it was measuring and
 * failed about one run in three, with nothing wrong.
 */
const folded = await mob.waitForFunction(
  () => document.getElementById('tasks').classList.contains('collapsed'),
  { timeout: 25000, polling: 250 },
).then(() => true).catch(() => false);
if (!folded) errors.push('mobile: task list never collapsed');
writeFileSync(`${OUT}/13-mobile-collapsed.png`, await mob.screenshot({ type: 'png' }));
console.log(`  wrote ${OUT}/13-mobile-collapsed.png (tasks collapsed: ${folded})`);

// ── the menu, pause, and saved progress ──────────────────────────────────────
/**
 * Everything in docs/menu-brief.html that only exists in a browser.
 *
 * The save layer itself is tested headless in `smoke.mjs`, where a hostile
 * storage and a corrupt blob are cheap to construct. What is left here is the
 * part that needs a real DOM and a real clock: that pausing actually stops the
 * day, that resuming does not then spend it, that the screens do not cover each
 * other, and that a locked chip is genuinely inert.
 */
{
  console.log('\nmenu, pause and progress');
  const menu = await browser.newPage();
  menu.on('pageerror', (e) => errors.push(`menu page error: ${e.message}`));
  menu.on('console', (m) => { if (m.type() === 'error') errors.push(`menu console: ${m.text()}`); });
  await menu.setViewport({ width: 1100, height: 690, deviceScaleFactor: 1 });

  const bootMenu = async (suffix = '') => {
    await menu.goto(`${URL}${suffix}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await menu.waitForFunction(
      () => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 20000 });
  };
  /**
   * Visible *on screen*, not merely un-hidden.
   *
   * The first version checked only the element's own `hidden` attribute and
   * class, which reported the forfeit panel as showing while the entire Levels
   * card behind it was `display: none` — so a test asserting the panel was up
   * passed, and the next line failed trying to click something nobody could
   * see.
   *
   * `offsetParent` is the obvious way to test that and is wrong here: it is
   * null for *every* `position: fixed` element, and every screen in this game
   * is fixed — so it reported the title, pause, levels and ending cards as
   * hidden while they were on screen. `checkVisibility()` walks ancestors
   * properly; `getClientRects()` is the fallback for anything older.
   */
  const shown = (id) => menu.evaluate((i) => {
    const el = document.getElementById(i);
    if (!el || el.hidden || el.classList.contains('hidden')) return false;
    return el.checkVisibility
      ? el.checkVisibility()
      : el.getClientRects().length > 0;
  }, id);
  const label = (id) => menu.evaluate((i) => document.getElementById(i)?.textContent?.trim(), id);
  const bad = (msg) => errors.push(`menu: ${msg}`);

  await bootMenu();
  const hasMenuHandle = await menu.evaluate(() => !!window.__game);
  await menu.evaluate(() => { try { localStorage.clear(); } catch { /* private mode */ } });
  await bootMenu();

  // A first-ever visit is exactly the card that shipped before any of this.
  if ((await label('start')) !== 'Begin') bad(`new player's button reads "${await label('start')}"`);
  if (await shown('to-levels')) bad('new player is offered a level list');
  writeFileSync(`${OUT}/15-title-new.png`, await menu.screenshot({ type: 'png' }));

  await menu.click('#start');
  await new Promise((r) => setTimeout(r, 800));

  if (hasMenuHandle) {
    /**
     * The one thing a pause must not get wrong.
     *
     * `elapsed` drives the light rig, the sun dial and the out-of-time ending,
     * so a pause that lets it run means pausing at 6:40 of an eight-minute day
     * and coming back to a lost run. Both are read: the number, and the dial
     * that is drawn from it.
     */
    await menu.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 200));
    if (!await shown('pause')) bad('Esc did not pause');
    const t0 = await menu.evaluate(() => ({
      elapsed: window.__game.elapsed,
      dial: document.getElementById('sun-dot')?.getAttribute('cx'),
      running: window.__game.running,
    }));
    await new Promise((r) => setTimeout(r, 1600));
    const t1 = await menu.evaluate(() => ({
      elapsed: window.__game.elapsed,
      dial: document.getElementById('sun-dot')?.getAttribute('cx'),
    }));
    if (t0.running !== false) bad('paused but still running');
    if (Math.abs(t1.elapsed - t0.elapsed) > 1e-6) {
      bad(`the day advanced while paused: ${t0.elapsed} → ${t1.elapsed}`);
    }
    if (t1.dial !== t0.dial) bad(`the sun dial moved while paused: ${t0.dial} → ${t1.dial}`);
    writeFileSync(`${OUT}/16-pause.png`, await menu.screenshot({ type: 'png' }));

    /**
     * And the other half of it: resuming must discard the pause rather than owe
     * it. Without resetting `_acc` the accumulator comes back holding the whole
     * gap and spends it on catch-up ticks — six of them, given the `steps < 6`
     * clamp, which is six frames of simulation the player did not ask for.
     */
    const before = await menu.evaluate(() => ({ ...window.__game.crow.pos }));
    await menu.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 80));
    const after = await menu.evaluate(() => ({ ...window.__game.crow.pos }));
    const jump = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
    if (jump > 0.6) bad(`resume spent the pause on catch-up: crow moved ${jump.toFixed(2)}m`);

    // The level list, opened from a paused game.
    await menu.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 150));
    await menu.click('#pause-levels');
    await new Promise((r) => setTimeout(r, 200));
    if (!await shown('levels')) bad('Levels did not open from pause');
    // Both neighbours must be put away, not layered: #pause is z-index 45 and
    // #ending is later in the document at the same z-index as #levels, so
    // either one left visible silently eats every click on the list.
    if (await shown('pause')) bad('the pause scrim is still covering the level list');
    if (await shown('ending')) bad('the ending card is still covering the level list');

    const chips = await menu.evaluate(() => [...document.querySelectorAll('#levels-list .chip')]
      .map((c) => ({
        id: Number(c.dataset.level),
        locked: c.classList.contains('locked'),
        disabled: c.disabled,
        armed: c.getAttribute('aria-pressed') === 'true',
      })));
    if (chips.length !== LEVELS.length) bad(`${chips.length} chips for ${LEVELS.length} levels`);
    if (!chips[0]?.armed) bad('the block being played is not the armed chip');
    if (!chips[1]?.locked || !chips[1]?.disabled) bad('an uncleared block is not locked');
    if (!/back to/i.test(await label('levels-play'))) {
      bad(`the armed-current button reads "${await label('levels-play')}"`);
    }
    writeFileSync(`${OUT}/17-levels.png`, await menu.screenshot({ type: 'png' }));

    /**
     * A locked chip is inert — it cannot even be *armed*, which is the level
     * the check belongs at.
     *
     * Pressing Play afterwards was the obvious way to write this and it tested
     * nothing: the click on a disabled button is a no-op, so the armed id stays
     * on the current block and Play correctly resumes it. The test passed while
     * asserting something it had not exercised, and closed the screen it needed
     * for the next step.
     */
    await menu.evaluate(() => document.querySelector('#levels-list .chip[data-level="3"]').click());
    await new Promise((r) => setTimeout(r, 120));
    const armed = await menu.evaluate(() => window.__game._armed);
    if (armed === 3) bad('a locked chip can be armed');

    // Choosing the block you are standing in resumes it rather than rebuilding
    // it — a forfeit prompt for the level you are in is nonsense, and a silent
    // restart throws away a run nobody was trying to end.
    await menu.evaluate(() => { window.__game.total = 4.25; });
    await menu.click('#levels-list .chip[data-level="1"]');
    await menu.click('#levels-play');
    await new Promise((r) => setTimeout(r, 300));
    const resumed = await menu.evaluate(() => ({
      running: window.__game.running, total: window.__game.total,
    }));
    if (!resumed.running) bad('picking the current block did not resume it');
    if (resumed.total !== 4.25) bad(`picking the current block reset the nest to ${resumed.total}`);

    // The forfeit: money in the nest is something to lose, so it asks.
    await menu.evaluate(() => {
      const g = window.__game;
      g.progress.cleared = [1, 2, 3];
      g.progress.save();          // to disk, so the reboot below sees a returning player
      g.pause();
      g.showLevels();
    });
    await menu.click('#levels-list .chip[data-level="2"]');
    await menu.click('#levels-play');
    await new Promise((r) => setTimeout(r, 200));
    if (!await shown('confirm')) bad('leaving a block with money in the nest did not ask');
    if (await shown('levels-actions')) bad('the forfeit did not take over the action row');
    if (!/4\.25/.test(await label('confirm-copy'))) {
      bad(`the forfeit does not name the amount: "${await label('confirm-copy')}"`);
    }
    writeFileSync(`${OUT}/18-forfeit.png`, await menu.screenshot({ type: 'png' }));

    await menu.click('#confirm-yes');
    await new Promise((r) => setTimeout(r, 900));

    /**
     * After a swap driven by the menu, three things that have each gone wrong
     * before: the task list appends rather than replaces, the camera is still
     * parked over the old block, and the nest carries money across.
     */
    const landed = await menu.evaluate(() => {
      const g = window.__game;
      const cam = g.stage.camera.position;
      const crow = g.crow.pos;
      return {
        id: g.level.id,
        rows: document.querySelectorAll('#task-list li').length,
        expected: g.tasks.length,
        total: g.total,
        camDist: Math.hypot(cam.x - crow.x, cam.z - crow.z),
      };
    });
    if (landed.id !== 2) bad(`the forfeit went to level ${landed.id}, not 2`);
    if (landed.rows !== landed.expected) {
      bad(`task list shows ${landed.rows} rows for a ${landed.expected}-task block`);
    }
    if (landed.total !== 0) bad(`money survived a level swap: ${landed.total}`);
    // The camera lags by ~0.2s but must start *at* the new spawn, not sail
    // across the map from the old one.
    if (landed.camDist > 40) bad(`camera did not snap to the new spawn (${landed.camDist.toFixed(1)}m away)`);

    /**
     * Quit to title abandons the run.
     *
     * Clearing the flags and showing the card is not enough — `total`,
     * `elapsed` and the crow all survive a screen change, so quitting four
     * minutes in and pressing Begin resumed the same run with the same money
     * and the same half-spent day. A mid-run save, arrived at by accident, and
     * explicitly out of scope.
     */
    await menu.evaluate(() => {
      const g = window.__game;
      g.total = 9.5; g.elapsed = 200;
      g.pause();
    });
    await menu.click('#quit');
    await new Promise((r) => setTimeout(r, 900));
    await menu.click('#start');
    await new Promise((r) => setTimeout(r, 700));
    const afterQuit = await menu.evaluate(() => ({
      total: window.__game.total,
      elapsed: Math.round(window.__game.elapsed),
      running: window.__game.running,
    }));
    if (afterQuit.total !== 0) bad(`quitting kept $${afterQuit.total} in the nest`);
    if (afterQuit.elapsed > 5) bad(`quitting kept ${afterQuit.elapsed}s of the day spent`);
    if (!afterQuit.running) bad('starting after a quit did not start');

    /**
     * A pending forfeit must not survive the chip list being rebuilt.
     * `#forget` re-enters `showLevels` without leaving first, which left the
     * panel up over a hidden action row, still armed at a now-locked block.
     */
    // Deliberately *not* the block being played — arming the current one
    // resumes it, which is correct behaviour and tests nothing here.
    const elsewhere = await menu.evaluate(() => {
      const g = window.__game;
      g.progress.cleared = [1, 2, 3]; g.progress.save();
      g.total = 3.5;
      g.pause(); g.showLevels();
      return g.level.id === 1 ? 2 : 1;
    });
    await menu.click(`#levels-list .chip[data-level="${elsewhere}"]`);
    await menu.click('#levels-play');
    await new Promise((r) => setTimeout(r, 200));
    if (!await shown('confirm')) bad('the forfeit did not appear for the re-entry check');
    await menu.click('#forget');
    await new Promise((r) => setTimeout(r, 300));
    // Forget now *asks*, so the panel is still up — but it must be the reset
    // question, not the stale forfeit one.
    if (!await shown('confirm')) bad('forgetting did not ask for confirmation');
    if (!/forgets every level/i.test(await label('confirm-copy'))) {
      bad(`forget re-used the stale prompt: "${await label('confirm-copy')}"`);
    }
    await menu.click('#confirm-no');
    await new Promise((r) => setTimeout(r, 200));
    if (await shown('confirm')) bad('declining the reset left the prompt up');
    if (!await shown('levels-actions')) bad('declining the reset left the action row hidden');
    const kept = await menu.evaluate(() => window.__game.progress.cleared.length);
    if (kept === 0) bad('declining the reset forgot the progress anyway');

    /**
     * The playtest repro, exactly: finish the roofline, open Levels from the
     * ending, forget, go Back — and the ending screen is still sitting there
     * offering `Again!` on a block the reset has just locked. A reset that
     * leaves you holding a key to the thing it locked is not a reset, so it
     * ends the run and returns to the first block.
     */
    await menu.evaluate(() => {
      const g = window.__game;
      g.progress.cleared = [1, 2, 3]; g.progress.save();
      g.resume?.();
      g.total = 31; g.elapsed = 240; g.finished = false; g.running = true;
      g._finish(true);
    });
    await new Promise((r) => setTimeout(r, 300));
    await menu.click('#ending-levels');
    await new Promise((r) => setTimeout(r, 200));
    await menu.click('#forget');
    await new Promise((r) => setTimeout(r, 150));
    await menu.click('#confirm-yes');
    await new Promise((r) => setTimeout(r, 900));
    const afterReset = await menu.evaluate(() => ({
      level: window.__game.level.id,
      cleared: window.__game.progress.cleared.length,
      finished: window.__game.finished,
      running: window.__game.running,
      titleUp: !document.getElementById('title').classList.contains('hidden'),
      endingUp: !document.getElementById('ending').classList.contains('hidden'),
      levelsUp: !document.getElementById('levels').classList.contains('hidden'),
      start: document.getElementById('start').textContent.trim(),
    }));
    if (afterReset.cleared !== 0) bad('the reset did not clear the ladder');
    if (afterReset.level !== 1) bad(`the reset left the player on level ${afterReset.level}`);
    if (afterReset.endingUp) bad('the reset left the ending screen up, offering Again! on a locked block');
    if (afterReset.levelsUp) bad('the reset left the level list up');
    if (!afterReset.titleUp) bad('the reset did not return to the title');
    if (afterReset.finished || afterReset.running) bad('the reset left a run in progress');
    if (afterReset.start !== 'Begin') bad(`after a reset the title reads "${afterReset.start}"`);

    /**
     * HUD countdowns must not drain behind the scrim.
     *
     * Self-contained: the reset above deliberately ends the run and returns to
     * the title, so this has to establish its own running game rather than
     * inherit one — otherwise `pause()` is a no-op and the test measures a
     * countdown that was never frozen because it was never paused.
     */
    await menu.evaluate(() => window.__game.loadLevel(1, true));
    await new Promise((r) => setTimeout(r, 700));
    await menu.evaluate(() => {
      const g = window.__game;
      g.hud._tasksT = 3; g.hud._controlsT = 3;
      g.pause();
    });
    await new Promise((r) => setTimeout(r, 1400));
    const frozen = await menu.evaluate(() => ({
      tasksT: window.__game.hud._tasksT,
      controlsT: window.__game.hud._controlsT,
    }));
    if (frozen.tasksT < 2.9) bad(`the task-list countdown ran while paused (${frozen.tasksT})`);
    if (frozen.controlsT < 2.9) bad(`the legend countdown ran while paused (${frozen.controlsT})`);
    await menu.evaluate(() => window.__game.resume());

    // The re-entry check above pressed "Forget my progress", which is the point
    // of it — but it also wiped the save the returning-player checks below read
    // back off disk. Put it back, since those two are testing different things.
    await menu.evaluate(() => {
      const g = window.__game;
      g.progress.cleared = [1, 2];
      g.progress.save();
    });
  }

  /**
   * Everything from here needs a save on disk to read back, and the only way to
   * write one is to finish a block — which without the `__game` handle means
   * playing eight real minutes. So a production build stops here.
   *
   * This is not a hypothetical branch: verifying a deploy runs `shoot` against
   * the built bundle, which is exactly the build with no handle. The first
   * version of this section left the tail unguarded and crashed on the deploy
   * check, clicking a button on a screen that had never been opened.
   */
  if (!hasMenuHandle) {
    console.log('  note: no __game handle (production build) — menu state checks skipped');
  } else {
    // A returning player, from disk.
    await bootMenu();
    if (!/continue/i.test(await label('start') ?? '')) {
      bad(`returning player's button reads "${await label('start')}"`);
    }
    if (!await shown('to-levels')) bad('returning player has no way to the level list');
    writeFileSync(`${OUT}/19-title-returning.png`, await menu.screenshot({ type: 'png' }));

    // The ending's third way out.
    await menu.click('#start');
    await new Promise((r) => setTimeout(r, 700));
    await menu.evaluate(() => {
      const g = window.__game;
      g.total = 26.5; g.elapsed = 240; g.finished = false; g.running = true;
      g._finish(true);
    });
    await new Promise((r) => setTimeout(r, 400));
    await menu.click('#ending-levels');
    await new Promise((r) => setTimeout(r, 250));
    if (!await shown('levels')) bad('the ending has no route to the level list');
    if (await shown('ending')) bad('the ending card is covering the level list');

    // And that a win actually wrote something.
    const saved = await menu.evaluate(() => {
      try { return localStorage.getItem('smallchange.progress'); } catch { return null; }
    });
    if (saved && !/"cleared"\s*:\s*\[[^\]]/.test(saved)) bad(`a win wrote no cleared block: ${saved}`);

  // Forget, and the empty state it restores. It asks first — the only action in
  // the game that destroys something the player cannot get back.
  await menu.click('#forget');
  await new Promise((r) => setTimeout(r, 200));
  if (!await shown('confirm')) bad('forget did not ask before wiping the save');
  await menu.click('#confirm-yes');
  await new Promise((r) => setTimeout(r, 900));
  // A reset returns to the title on the first block, so the ladder has to be
  // read by re-opening the list — and the title has no Levels button any more,
  // because a wiped save is a new player.
  const relocked = await menu.evaluate(() => {
    window.__game.showLevels();
    return [...document.querySelectorAll('#levels-list .chip')]
      .map((c) => c.classList.contains('locked'));
  });
  if (relocked[0] !== false || relocked[1] !== true) {
    bad(`forget left the ladder as ${JSON.stringify(relocked)}`);
  }
  /**
   * The armed chip and the button beside it must never disagree.
   *
   * Forgetting can re-lock the block that is *loaded* — `?level=3` bypasses the
   * lock on purpose, so the two can legitimately diverge — and the armed chip
   * would otherwise sit greyed out under a button offering to play it.
   */
  const consistent = await menu.evaluate(() => {
    const armed = document.querySelector('#levels-list .chip[aria-pressed="true"]');
    return {
      armedIsLocked: armed ? armed.classList.contains('locked') : null,
      button: document.getElementById('levels-play').textContent.trim(),
    };
  });
  if (consistent.armedIsLocked) {
    bad(`a locked chip is armed after forgetting, under "${consistent.button}"`);
  }

  // The URL still bypasses the lock, with no progress at all.
  await bootMenu('?level=3');
  const forced = await menu.evaluate(() => window.__game?.level?.id);
  if (hasMenuHandle && forced !== 3) bad(`?level=3 booted level ${forced}`);

  /**
   * The title card's strapline names the goal of the block it is fronting.
   *
   * It was markup — "twenty dollars", whatever was loaded — and stayed correct
   * for as long as the card only ever fronted level 1. `Continue` can now open
   * the hotel on it, at which point the card offered $30 and promised twenty.
   * The money counter's goal had exactly this bug once already, which is why
   * this checks both of them against the level rather than against each other.
   */
  const promised = await menu.evaluate(() => ({
    goal: window.__game?.goal,
    strapline: document.getElementById('title-goal')?.textContent,
    counter: document.getElementById('goal')?.textContent,
  }));
  if (hasMenuHandle && !/thirty dollars/.test(promised.strapline ?? '')) {
    bad(`the title card promises "${promised.strapline}" on a $${promised.goal} block`);
  }
  if (promised.counter !== '$30.00' && !/30/.test(promised.counter ?? '')) {
    bad(`the money counter reads "${promised.counter}" on a $${promised.goal} block`);
  }
  }

  console.log(`  wrote ${OUT}/15..19 — title (new/returning), pause, levels, forfeit`);
  await menu.close();
}

// The touch build's pause control, and its one interaction with the TEST MODE
// badge: both want top-centre, and the badge must stay the more visible of the
// two — it is one of three tripwires stopping a cheat from shipping.
{
  const tp = await browser.newPage();
  tp.on('pageerror', (e) => errors.push(`touch-pause uncaught: ${e.message}`));
  await tp.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  // Same CDP dance as the mobile layout page above: puppeteer's
  // emulateMediaFeatures whitelist has no 'pointer', and without a coarse
  // pointer the page never sets body.touch — so #btn-pause stays display:none
  // and this whole section would measure a hidden element.
  const tpCdp = await tp.createCDPSession();
  await tpCdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'pointer', value: 'coarse' }, { name: 'any-pointer', value: 'coarse' }],
  });
  await tp.goto(`${URL}?level=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await tp.waitForFunction(
    () => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 20000 });
  await tp.click('#start');
  await new Promise((r) => setTimeout(r, 800));

  const geom = await tp.evaluate(() => {
    const btn = document.getElementById('btn-pause');
    const style = getComputedStyle(btn);
    const r = btn.getBoundingClientRect();
    const boxOf = (id) => {
      const el = document.getElementById(id);
      const b = el?.getBoundingClientRect();
      return b && b.width && b.height ? b : null;
    };
    const hits = (a, b) => a && b
      && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    document.body.classList.add('test');
    const withBadge = document.getElementById('btn-pause').getBoundingClientRect().top;
    document.body.classList.remove('test');
    return {
      shown: style.display !== 'none',
      size: Math.round(Math.min(r.width, r.height)),
      overlaps: ['money', 'tasks', 'buttons', 'stick'].filter((id) => hits(r, boxOf(id))),
      top: r.top,
      topWithBadge: withBadge,
    };
  });
  if (!geom.shown) errors.push('touch: no pause control');
  // 44px is the smallest thing a thumb reliably hits.
  if (geom.size < 44) errors.push(`touch: pause control is ${geom.size}px`);
  if (geom.overlaps.length) {
    errors.push(`touch: pause control overlaps ${geom.overlaps.join(', ')}`);
  }
  if (!(geom.topWithBadge > geom.top)) {
    errors.push('touch: the TEST MODE badge does not push the pause control down');
  }

  await tp.click('#btn-pause');
  await new Promise((r) => setTimeout(r, 250));
  const paused = await tp.evaluate(() =>
    !document.getElementById('pause').classList.contains('hidden'));
  if (!paused) errors.push('touch: the pause control does not pause');
  writeFileSync(`${OUT}/40-touch-pause.png`, await tp.screenshot({ type: 'png' }));
  console.log(`  wrote ${OUT}/40-touch-pause.png (control ${geom.size}px, clear of the HUD)`);
  await tp.close();
}

await browser.close();

console.log('');
if (errors.length) {
  console.log(`FAIL — ${errors.length} problem(s):`);
  for (const e of [...new Set(errors)]) console.log(`  ${e}`);
  process.exit(1);
}
console.log('PASS — no console errors, no failed requests\n');
