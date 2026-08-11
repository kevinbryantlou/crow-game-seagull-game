/**
 * Renders the 1200×630 link-preview card.
 *
 * Uses the real game rather than a mockup: boots it headless, hides the HUD,
 * parks the crow somewhere flattering, and overlays the wordmark. Output goes
 * to public/preview.png, which Vite copies to the root of dist/ — so it lands
 * at /small-change-crow-game/preview.png and survives every rebuild. (Anything
 * written straight into the deploy directory would be wiped by build:web.)
 *
 *   npm run dev
 *   node scripts/preview.mjs [url]
 */

import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:5173/';

/**
 * The line under the wordmark. It sits directly beside the og:description in a
 * link preview, so it should share that voice — flat, declarative, deadpan —
 * without repeating it word for word. Override for comparison:
 *   node scripts/preview.mjs <url> "some other line"
 */
const SUBTITLE = process.argv[3] || 'You are a crow. You need twenty dollars. Steal it.';
const ONLY = process.env.ONLY || null;
mkdirSync('public', { recursive: true });
mkdirSync('shots', { recursive: true });

// Candidate framings. The first is the one that ships.
const SHOTS = [
  { name: 'preview', pos: [-25.5, 0, 7.5], label: 'A · fountain plaza' },
  { name: 'preview-b-memorial', pos: [-14.5, 0, -3.5], label: 'B · the memorial' },
  { name: 'preview-c-cafe', pos: [-3, 0, 6.5], label: 'C · café row' },
  { name: 'preview-d-nest', pos: [-12.5, 5.0, -6.5], label: 'D · perched at the nest' },
  { name: 'preview-e-open', pos: [-17.5, 0, 3.5], label: 'E · open paving by the fountain' },
  { name: 'preview-f-cart', pos: [13.5, 0, -1.5], label: 'F · cart corner' },
];

const browser = await puppeteer.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--hide-scrollbars', '--mute-audio'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(
  () => document.getElementById('loading')?.classList.contains('hidden'),
  { timeout: 20000 },
);

await page.click('#start');
await new Promise((r) => setTimeout(r, 800));

// Strip the interface and lay the wordmark over the scene.
await page.evaluate((subtitle) => {
  document.getElementById('hud').style.display = 'none';
  document.getElementById('touch').style.display = 'none';
  const card = document.createElement('div');
  card.id = 'card';
  card.innerHTML = `
    <div class="card-wash"></div>
    <div class="card-text">
      <h1>Small<span>Change</span></h1>
      <p>__SUBTITLE__</p>
    </div>`;
  const css = document.createElement('style');
  css.textContent = `
    #card { position: fixed; inset: 0; z-index: 60; pointer-events: none; }
    .card-wash {
      position: absolute; inset: 0;
      background: linear-gradient(105deg, rgba(15,32,26,.92) 0%, rgba(15,32,26,.72) 26%,
                                          rgba(15,32,26,.18) 46%, rgba(15,32,26,0) 62%);
    }
    .card-text {
      position: absolute; left: 58px; top: 50%; transform: translateY(-50%);
      max-width: 560px;
    }
    .card-text h1 {
      font-family: "Avenir Next Condensed","HelveticaNeue-CondensedBold","Arial Narrow",sans-serif;
      font-weight: 700; text-transform: uppercase; font-size: 118px; line-height: .84;
      margin: 0; color: #e9e5da; letter-spacing: .005em;
      text-shadow: 0 4px 24px rgba(10,20,16,.55);
    }
    .card-text h1 span { display: block; color: #e0b348; }
    .card-text p {
      font-family: Charter, "Iowan Old Style", Georgia, serif;
      font-size: 25px; line-height: 1.4; color: #cfe0d8; margin: 22px 0 0;
      text-shadow: 0 2px 12px rgba(10,20,16,.7);
    }`;
  document.head.appendChild(css);
  card.querySelector('.card-text p').textContent = subtitle;
  document.body.appendChild(card);
}, SUBTITLE);

for (const s of SHOTS.filter((x) => !ONLY || x.name === ONLY)) {
  await page.evaluate(([x, y, z]) => {
    const g = window.__game;
    g.crow.pos.set(x, y, z);
    g.crow.vel.set(0, 0, 0);
  }, s.pos);
  await new Promise((r) => setTimeout(r, 1100));   // camera lag settles
  const buf = await page.screenshot({ type: 'png' });
  const out = `shots/${s.name}.png`;
  writeFileSync(out, buf);
  console.log(`  ${out.padEnd(34)} ${s.label}`);
}

await browser.close();
if (errors.length) {
  console.log(`\nFAIL — ${errors.length} page error(s):`);
  for (const e of new Set(errors)) console.log(`  ${e}`);
  process.exit(1);
}
console.log('\nPASS');
