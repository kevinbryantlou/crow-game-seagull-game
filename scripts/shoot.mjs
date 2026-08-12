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
import { mkdirSync, writeFileSync } from 'node:fs';

// The level module is pure at import time, but three.js and the shape kit both
// reach for a canvas, so give them somewhere to reach. We only want RULES.
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({}), style: {} }) };
globalThis.window ??= globalThis;
const { RULES } = await import('../src/world/rules.js');

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

// ── level 2: the roofline ────────────────────────────────────────────────────
/**
 * A second block gets a second pass, because almost nothing that goes wrong on
 * it would show up on the first. The four decks are the whole level and they are
 * the whole risk: a prop authored without its deck offset hangs in the air, a
 * light pool lands on the yard instead of the terrace, and both are invisible in
 * the source and obvious in a PNG.
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

  await shoot2('20-l2-spawn');
  // One shot per deck, bottom to top. If a deck is empty in the frame, it is
  // because nothing was built on it — which is exactly what these are for.
  await look2('21-l2-forecourt', -11, 0, 13.5);
  await look2('22-l2-loading-end', 17, 0, 8);
  await look2('23-l2-cradle', 14, 4.0, 2.4);
  await look2('24-l2-terrace', -6, 5.4, -2);
  await look2('25-l2-kid', -5, 5.4, 0.6);
  await look2('26-l2-lectern', -15.5, 5.4, -1.5);
  await look2('27-l2-roof', -12, 9.2, -8);
  await look2('28-l2-nest', -16, 12.4, -9);

  /**
   * The plunge pool, which is the plaza fountain five metres in the air — and
   * therefore the same lobster-pot risk arrived at from a new direction. The
   * scramble test read `c.bottom <= 0.01`, which is true of a rim standing on
   * paving and false of one standing on a roof, so a crow in this pool could not
   * climb out of it at any heading at all.
   */
  const pool = !has2 ? null : await p2.evaluate(async () => {
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
  if (pool && !pool.wet) errors.push('L2: crow on the pool floor is not in the water');
  if (pool) {
    const failed = ['hold', 'tap', 'walk'].filter((k) => !pool[k]);
    if (failed.length) errors.push(`L2: cannot get out of the plunge pool by: ${failed.join(', ')}`);
  }
  if (pool && pool.wetFromBelow) errors.push('L2: a crow in the yard is swimming in the roof pool');

  /**
   * The set piece, and the rule it teaches by failing. Chips in the yard feed
   * the yard; chips on the terrace, away from the stand, empty the parapet.
   */
  const bait = !has2 ? null : await p2.evaluate(async () => {
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
  if (bait && bait.movedYard) errors.push('L2: chips dropped in the yard moved the terrace');
  if (bait && !/down here/i.test(bait.inTheYard)) errors.push(`L2: no deck hint in the yard: "${bait.inTheYard}"`);
  if (bait && !/stand/i.test(bait.tooNear)) errors.push(`L2: no too-close hint by the stand: "${bait.tooNear}"`);
  if (bait && !bait.movedTerrace) errors.push('L2: a legal chip drop did nothing');
  if (bait && !bait.guardDistracted) errors.push('L2: the maître d’ did not leave his stand');
  if (bait && !bait.taskTicked) errors.push('L2: the gull task did not tick');

  // The gulls: land beside one and everybody looks. Fly over it and nobody does.
  const gulls = !has2 ? null : await p2.evaluate(() => {
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
  if (gulls && !gulls.count) errors.push('L2: no gulls on the roof');
  if (gulls && !gulls.landedBeside) errors.push('L2: a gull ignored a crow landing beside it');
  if (gulls && gulls.flewOver) errors.push('L2: a gull objected to a crow flying over it');

  /**
   * Dusk, measured. Same floors as level 1, sampled from the two places on this
   * block that can actually go dark: the yard, which is the bottom of a light
   * well, and the terrace, which is where the money is.
   *
   * `t` here is progress through the run, not time of day — the level starts at
   * 0.42 and its lamps catch at 0.52 of the session.
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
    for (const [where, pos] of [['forecourt', [-11, 0, 12]], ['terrace', [-6, 5.4, -2]]]) {
      for (const [through, settle] of [[0.30, 500], [0.62, 9000], [0.98, 700]]) {
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
    g.total = 31.35; g.elapsed = 268; g.finished = false; g.running = true;
    g._finish(true);
    return {
      title: document.getElementById('ending-title').textContent.replace(/\s+/g, ' ').trim(),
      body: document.getElementById('ending-body').textContent.slice(0, 60),
      goal: g.goal,
    };
  });
  if (end2) console.log('  L2 ending:', JSON.stringify(end2));
  if (end2 && end2.goal !== 30) errors.push(`L2 goal is ${end2.goal}, expected 30`);
  if (end2 && !/thirty-one dollars thirty-five cents/i.test(end2.title)) {
    errors.push(`L2 ending headline wrong: "${end2.title}"`);
  }
  if (end2) { await new Promise((r) => setTimeout(r, 1400)); await shoot2('29-l2-ending'); }
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
await mob.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
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

// The task list should fold down to a count once it has introduced itself.
await new Promise((r) => setTimeout(r, 12000));
const folded = await mob.evaluate(() =>
  document.getElementById('tasks').classList.contains('collapsed'));
if (!folded) errors.push('mobile: task list never collapsed');
writeFileSync(`${OUT}/13-mobile-collapsed.png`, await mob.screenshot({ type: 'png' }));
console.log(`  wrote ${OUT}/13-mobile-collapsed.png (tasks collapsed: ${folded})`);

await browser.close();

console.log('');
if (errors.length) {
  console.log(`FAIL — ${errors.length} problem(s):`);
  for (const e of [...new Set(errors)]) console.log(`  ${e}`);
  process.exit(1);
}
console.log('PASS — no console errors, no failed requests\n');
