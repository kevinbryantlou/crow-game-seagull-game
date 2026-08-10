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
const look = async (name, x, y, z) => {
  const ok = await page.evaluate(([px, py, pz]) => {
    if (!window.__game) return false;
    window.__game.crow.pos.set(px, py, pz);
    window.__game.crow.vel.set(0, 0, 0);
    return true;
  }, [x, y, z]);
  if (!ok) { errors.push('no __game handle for spot checks'); return; }
  await new Promise((r) => setTimeout(r, 900));   // let the camera settle
  await shoot(name);
};

await look('06-newsstand', 11, 2.2, 10.5);
await look('07-cart', 15, 2.0, -2.0);
await look('08-nest', -12.5, 5.0, -6.5);
await look('09-kid', -17.5, 0, 11.5);

// Functional check: the two teaching beats fire at the moment each applies.
const teach = await page.evaluate(() => {
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
console.log('  teach:', JSON.stringify(teach));
if (!/nest/i.test(teach.onMoney)) errors.push(`no nest hint on first money: "${teach.onMoney}"`);
if (!/trade/i.test(teach.onShiny)) errors.push(`no trade hint on first shiny: "${teach.onShiny}"`);

// Functional check: trading a shiny must put the reward straight in the beak,
// never on the ground where scenery can hide it.
const trade = await page.evaluate(() => {
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
console.log('  trade:', JSON.stringify(trade));
// A temporary test cheat can override the payout; honour it rather than
// failing, but report it so it is never silently in effect.
const cheat = await page.evaluate(() => {
  const b = document.getElementById('testmode');
  if (!b || b.hidden) return null;
  return Number((b.textContent.match(/\$([\d.]+)/) || [])[1]) || null;
});
if (cheat) console.log(`  NOTE: test cheat active — trade pays $${cheat.toFixed(2)}`);
const expected = cheat ?? 1;
if (trade.value !== expected) errors.push(`first trade paid ${trade.value}, expected ${expected}`);
if (!trade.parentedToBeak) errors.push('trade reward was not auto-equipped');
if (trade.strayOnGround) errors.push('trade reward was left on the ground');

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
const ending = await page.evaluate(() => {
  const g = window.__game;
  g.total = 22.66; g.elapsed = 247; g.finished = false; g.running = true;
  g._finish(true);
  return {
    title: document.getElementById('ending-title').textContent.replace(/\s+/g, ' ').trim(),
    rank: document.getElementById('rank').textContent,
    again: document.getElementById('again').textContent,
  };
});
console.log('  ending:', JSON.stringify(ending));
if (!/twenty-two dollars sixty-six cents/i.test(ending.title)) {
  errors.push(`ending headline wrong: "${ending.title}"`);
}
if (/\$/.test(ending.rank)) errors.push(`amount still in the eyebrow: "${ending.rank}"`);
await new Promise((r) => setTimeout(r, 1600));
await shoot('10-ending');

await browser.close();

console.log('');
if (errors.length) {
  console.log(`FAIL — ${errors.length} problem(s):`);
  for (const e of [...new Set(errors)]) console.log(`  ${e}`);
  process.exit(1);
}
console.log('PASS — no console errors, no failed requests\n');
