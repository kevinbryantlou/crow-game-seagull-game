/**
 * Screenshots the mockups out of an interface brief.
 *
 * The briefs in docs/ are self-contained HTML, and the menu brief's mockups are
 * built from the game's own tokens rather than drawn — so they can be
 * photographed the same way shoot.mjs photographs the game, and looked at as
 * images instead of read as markup. Every element carrying `data-shot` is
 * written to shots/mock-<name>.png.
 *
 * No dev server: the brief is opened over file://, which is also the check that
 * it really is self-contained. A brief that needs a server has an external
 * asset in it, and docs/*.html are not allowed one.
 *
 *   node scripts/mock-shots.mjs [docs/menu-brief.html]
 */

import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DOC = process.argv[2] || 'docs/menu-brief.html';
const url = pathToFileURL(resolve(DOC)).href;

mkdirSync('shots', { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb'],
});
const page = await browser.newPage();
// Wide enough that the 900px mockups are never squeezed by the plate, and
// deviceScaleFactor 2 so the 8.5px mono labels are legible in the PNG.
await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 2 });

const problems = [];
// Every doc links /favicon.svg, which resolves against the site root when
// deployed and against the filesystem root here. Its absence over file:// says
// nothing about the brief.
const expected = (u) => u.endsWith('/favicon.svg');
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !expected(m.location()?.url || '')) problems.push(`console: ${m.text()}`);
});
page.on('requestfailed', (r) => { if (!expected(r.url())) problems.push(`failed request: ${r.url()}`); });

await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

// The mockups quote the game's stack — condensed display face, Charter, Menlo.
// Nothing is downloaded (docs carry no webfonts by rule), but the system faces
// still have to be resolved before anything is worth photographing.
await page.evaluate(() => document.fonts.ready);

const shots = await page.$$('[data-shot]');
if (!shots.length) {
  console.error(`No [data-shot] elements in ${DOC}`);
  process.exit(1);
}

const written = [];
for (const el of shots) {
  const name = await el.evaluate((n) => n.dataset.shot);
  const box = await el.boundingBox();
  const path = `shots/mock-${name}.png`;
  await el.screenshot({ path });
  written.push({ name, path, size: `${Math.round(box.width)}×${Math.round(box.height)}` });
}

// Both themes, since the doc is theme-aware and the surrounding page changes
// with it. The mockups themselves are deliberately fixed — a game screen has
// one look — so this is a check on the brief, not on the mocks.
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await page.screenshot({ path: 'shots/mock-brief-dark.png', fullPage: false });

await browser.close();

for (const w of written) console.log(`  ${w.path.padEnd(34)} ${w.size}`);
console.log(`\n${written.length} mockups → shots/`);

if (problems.length) {
  console.error(`\n${problems.length} problem(s) loading the brief:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
