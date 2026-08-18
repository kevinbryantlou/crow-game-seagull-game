/**
 * Container-layout mockup — rendered by the game, at the game's own camera.
 *
 * Level 6's deck density is a three-way argument that no single build settles:
 * a container ship in transit should be *stacked*, the fixed 38-degree camera
 * hides 1.16x the height of anything on the deck, and the audit requires the
 * blinded share of the block to fall every time the crow climbs. This drives
 * the real level through its `?cargo=` hook, photographs each candidate from
 * two positions, and measures all three numbers off the built world.
 *
 * The first version of this drew its own oblique projection in an SVG and did
 * not reflect the camera the game uses, which made it useless for the one
 * judgement it exists to support. Nothing here is drawn twice.
 *
 *   npm run dev                       # in another shell
 *   node scripts/cargo-mock.mjs       # writes docs/cargo-mock.html
 */
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';

const URL = process.argv[2] || 'http://localhost:5174';
const OUT = 'shots/cargo';
mkdirSync(OUT, { recursive: true });

/** `[x, z, tiers, hue]` per container. Edit freely and re-run. */
const LAYOUTS = {
  'A — as shipped': [
    [-2, -4.5, 1, 0], [14, -4, 1, 2], [20, 1, 1, 3], [27, -1, 1, 1], [5, -5, 1, 2], [10, 4.5, 1, 3],
  ],
  'B — two bays, two and three high': [
    [-2, -6.4, 2, 0], [-2, -3.6, 3, 1], [4, -6.4, 3, 2], [4, -3.6, 2, 3],
    [16, -6.4, 3, 1], [16, -3.6, 2, 0], [22, -6.4, 2, 3], [22, -3.6, 3, 2],
    [10, -6.4, 2, 3], [28, -3.6, 2, 1],
  ],
  'C — worked ship: full bays, one struck': [
    [-4, -6.4, 3, 0], [-4, -3.6, 3, 2], [-4, -0.8, 2, 1],
    [2, -6.4, 3, 3], [2, -3.6, 2, 0], [2, -0.8, 2, 2],
    [14, -6.4, 3, 1], [14, -3.6, 3, 3], [14, -0.8, 2, 0],
    [20, -6.4, 2, 2], [20, -3.6, 3, 1], [20, -0.8, 1, 3],
    [26, -6.4, 2, 0], [26, -3.6, 2, 2],
  ],
  'D — full load, four bays': [
    [-4, -6.4, 3, 0], [-4, -3.6, 3, 2], [-4, -0.8, 3, 1], [-4, 2.0, 2, 3],
    [2, -6.4, 3, 3], [2, -3.6, 3, 0], [2, -0.8, 2, 2], [2, 2.0, 2, 1],
    [14, -6.4, 3, 1], [14, -3.6, 3, 3], [14, -0.8, 3, 0], [14, 2.0, 2, 2],
    [20, -6.4, 3, 2], [20, -3.6, 3, 1], [20, -0.8, 2, 3], [20, 2.0, 2, 0],
    [26, -6.4, 2, 0], [26, -3.6, 2, 2], [26, -0.8, 2, 1],
  ],
};

const enc = (l) => l.map((a) => a.join(',')).join(';');

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
await page.setCacheEnabled(false);

const VIEWS = [
  ['deck', [6, 0, 10.4]],
  ['cargo', [12, 0, 1.0]],
];

const rows = [];
for (const [name, layout] of Object.entries(LAYOUTS)) {
  const slug = name.split(' ')[0].toLowerCase();
  await page.goto(`${URL}/?level=6&cargo=${encodeURIComponent(enc(layout))}&cb=${Date.now()}`,
    { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__game?.world, { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => document.querySelector('#start')?.click());
  await new Promise((r) => setTimeout(r, 1400));
  await page.evaluate(() => { document.getElementById('hud').style.display = 'none'; });

  const shots = [];
  for (const [view, pos] of VIEWS) {
    await page.evaluate((p) => {
      const g = window.__game;
      g.crow.pos.set(p[0], p[1], p[2]);
      g.crow.vel.set(0, 0, 0);
      g.stage.snapTo(g.crow.pos);
    }, pos);
    await new Promise((r) => setTimeout(r, 800));
    const file = `${slug}-${view}.png`;
    writeFileSync(`${OUT}/${file}`, await page.screenshot({ type: 'png' }));
    shots.push(file);
  }

  /**
   * Measured off the built world, in the page, using the level's own colliders
   * — not off the layout table. What is drawn and what is measured are the
   * same thing, which is the whole point of doing this in the game.
   */
  const m = await page.evaluate(() => {
    const g = window.__game;
    const cols = g.world.colliders;
    const P = (38 * Math.PI) / 180, Y = (25 * Math.PI) / 180;
    const CAM = { x: Math.sin(Y) * Math.cos(P), y: Math.sin(P), z: Math.cos(Y) * Math.cos(P) };
    const EYE = 1.6;
    const solids = cols.filter((c) => c.shape !== 'ring' && c.sight !== false
      && !(c.perch === false && (c.maxX - c.minX >= 40 || c.maxZ - c.minZ >= 40)));
    const seg = (ex, ey, ez, px, py, pz) => {
      const dx = px - ex, dy = py - ey, dz = pz - ez;
      const lo = Math.min(ey, py), hi = Math.max(ey, py);
      for (const c of solids) {
        if (c.top <= lo || c.bottom >= hi) continue;
        let t0 = 0, t1 = 1, skip = false;
        for (const [o, d, a, b] of [[ex, dx, c.minX, c.maxX], [ez, dz, c.minZ, c.maxZ]]) {
          if (d === 0) { if (o <= a || o >= b) { skip = true; break; } continue; }
          let u = (a - o) / d, v = (b - o) / d;
          if (u > v) { const s = u; u = v; v = s; }
          if (u > t0) t0 = u;
          if (v < t1) t1 = v;
        }
        if (skip || t0 >= t1) continue;
        const ya = ey + dy * t0, yb = ey + dy * t1;
        if (Math.min(ya, yb) < c.top - 0.05 && Math.max(ya, yb) > c.bottom + 0.05) return true;
      }
      return false;
    };
    const free = (x, z, floor) => !cols.some((c) => c.top > floor + 0.05 && c.bottom < floor + 1.6
      && x + 0.3 > c.minX && x - 0.3 < c.maxX && z + 0.3 > c.minZ && z - 0.3 < c.maxZ);
    let walk = 0, hid = 0;
    for (let x = -30; x <= 30; x += 0.75) {
      for (let z = -8; z <= 11.6; z += 0.75) {
        if (!free(x, z, 0)) continue;
        walk++;
        if (seg(x, 0.06, z, x + CAM.x * 200, 0.06 + CAM.y * 200, z + CAM.z * 200)) hid++;
      }
    }
    const guards = g.humans.filter((h) => !h.kid);
    const share = (lift) => {
      let n = 0, b = 0;
      for (const h of guards) {
        const fy = h.floorY || 0;
        for (let x = -30; x <= 30; x += 1.5) {
          for (let z = -8; z <= 11.6; z += 1.5) {
            if (!free(x, z, 0)) continue;
            if (Math.hypot(x - h.pos.x, z - h.pos.z, lift * 0.62) > h.viewDist) continue;
            n++;
            if (seg(h.pos.x, fy + EYE, h.pos.z, x, 0.06 + lift, z)) b++;
          }
        }
      }
      return n ? (100 * b) / n : 0;
    };
    const boxes = cols.filter((c) => c.tag === 'container');
    let meshes = 0;
    g.world.root.traverse((o) => { if (o.isMesh) meshes++; });
    return {
      boxes: boxes.length,
      tallest: boxes.length ? Math.max(...boxes.map((c) => c.top)) : 0,
      outOfReach: boxes.filter((c) => c.top > 1.9).length,
      meshes,
      hidden: (100 * hid) / walk,
      g0: share(0), g1: share(1.2), g3: share(3.0),
    };
  });
  m.ok = m.g1 <= m.g0 + 0.5 && m.g3 <= m.g1 + 0.5;
  rows.push({ name, m, shots });
  console.log(`${name.padEnd(38)} ${String(m.boxes).padStart(3)} boxes  `
    + `${m.tallest.toFixed(1)}m  ${m.meshes} meshes  hidden ${m.hidden.toFixed(1)}%  `
    + `blind ${m.g0.toFixed(0)}→${m.g1.toFixed(0)}→${m.g3.toFixed(0)} ${m.ok ? 'ok' : 'RISES'}`);
}
await browser.close();

const cards = rows.map(({ name, m, shots }) => `
  <section class="card">
    <h2>${name}</h2>
    <div class="shots">${shots.map((f) => `<img src="../shots/cargo/${f}" alt="">`).join('')}</div>
    <div class="nums">
      <div><dt>Containers</dt><dd>${m.boxes}</dd></div>
      <div><dt>Tallest stack</dt><dd>${m.tallest.toFixed(1)} m</dd></div>
      <div><dt>Out of a guard's reach</dt><dd>${m.outOfReach} / ${m.boxes}</dd></div>
      <div><dt>Meshes</dt><dd>${m.meshes}<small>lobby 618</small></dd></div>
      <div class="${m.hidden > 35 ? 'bad' : 'ok'}"><dt>Deck hidden from camera</dt><dd>${m.hidden.toFixed(1)}%<small>budget 35 · level 1 is 34.7</small></dd></div>
      <div class="${m.ok ? 'ok' : 'bad'}"><dt>Guards blind at 0 / 1.2 / 3 m</dt><dd>${m.g0.toFixed(0)} → ${m.g1.toFixed(0)} → ${m.g3.toFixed(0)}%<small>${m.ok ? 'never rises — passes' : 'RISES — fails the flight rule'}</small></dd></div>
    </div>
  </section>`).join('');

writeFileSync('docs/cargo-mock.html', `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Small Change — Cargo Layouts</title>
<style>
:root{--paper:#E9E5DA;--paper2:#DFDACB;--ink:#141C18;--soft:#3E4A44;--rule:#C3BFB1;--bad:#9c3b2e;--good:#2f6d4a}
@media (prefers-color-scheme:dark){:root{--paper:#131815;--paper2:#1A211D;--ink:#E4E2D7;--soft:#A3ADA6;--rule:#2C3630;--bad:#d4756a;--good:#6fbf92}}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);margin:0;padding:2rem 1.5rem 5rem;
 font-family:Charter,"Iowan Old Style",Georgia,serif;font-size:16px;line-height:1.6}
h1{font-family:"Avenir Next Condensed","Arial Narrow",sans-serif;text-transform:uppercase;
 font-size:clamp(1.8rem,5vw,3rem);margin:0 0 .3rem}
.lede{max-width:46rem;color:var(--soft);margin:0 0 2.5rem}
.card{max-width:78rem;margin:0 auto 3.5rem;border-top:2px solid var(--ink);padding-top:1rem}
h2{font-family:"Avenir Next Condensed","Arial Narrow",sans-serif;text-transform:uppercase;
 font-size:1.05rem;letter-spacing:.05em;margin:0 0 .8rem}
.shots{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;background:var(--paper2);
 border:1px solid var(--rule);padding:.6rem}
.shots img{width:100%;height:auto;display:block}
.nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));
 border:1px solid var(--rule);border-top:0}
.nums>div{padding:.7rem .9rem;border-right:1px solid var(--rule)}
.nums>div:last-child{border-right:0}
dt{font-family:Menlo,monospace;font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:var(--soft)}
dd{margin:.15rem 0 0;font-family:Menlo,monospace;font-size:1.05rem}
dd small{display:block;font-size:.58rem;letter-spacing:.1em;text-transform:uppercase;margin-top:.2rem;opacity:.8}
.ok dd{color:var(--good)} .bad dd{color:var(--bad)}
footer{max-width:78rem;margin:0 auto;color:var(--soft);font-size:.9rem;border-top:1px solid var(--rule);padding-top:1rem}
code{font-family:Menlo,monospace;font-size:.85em}
</style></head><body>
<h1>Cargo layouts</h1>
<p class="lede">Each of these is <strong>the actual level</strong>, built with a different cargo list and
photographed through the game's own camera from two positions — the spawn on the starboard walkway, and
in among the boxes. The numbers underneath are measured off the built world, not off the table that
made it. <strong>Deck hidden from camera</strong> is walkable steel the player cannot see (level 1 is
34.7%). <strong>Guards blind</strong> must never rise as the crow climbs, or flight becomes a way to
hide — the one thing the sightline change must not do.</p>
${cards}
<footer>Generated by <code>scripts/cargo-mock.mjs</code> against a running <code>npm run dev</code>.
Edit the <code>LAYOUTS</code> table and re-run; each entry is <code>[x, z, tiers, hue]</code>.
The frames live in <code>shots/cargo/</code>, which is gitignored — this page is a local tool and
needs a re-run rather than a checkout.
The level reads the same list from <code>?cargo=</code> in dev builds, so you can drive it by hand too.</footer>
</body></html>`);
console.log('\nwrote docs/cargo-mock.html');
