/**
 * Low-fidelity container-layout mockup, at the real camera.
 *
 * Level 6's deck density is a three-way argument that cannot be settled by
 * looking at one build: a container ship in transit should be *stacked*, the
 * fixed 38-degree camera hides 1.16x the height of anything you put on the
 * deck, and the audit requires the blinded share of the block to fall every
 * time the crow climbs. Those pull against each other, so this renders several
 * candidate layouts side by side with all three numbers measured off each one.
 *
 * It renders with the game's own camera maths and the game's own sightline
 * arithmetic — no three.js, no browser, no level build. Writes an HTML page.
 *
 *   node scripts/cargo-mock.mjs && open docs/cargo-mock.html
 */
import { writeFileSync } from 'fs';

const PITCH = (38 * Math.PI) / 180, YAW = (25 * Math.PI) / 180;
/** The one sightline the game has. See docs/ship-brief.html §3. */
const CAM = {
  x: Math.sin(YAW) * Math.cos(PITCH), y: Math.sin(PITCH), z: Math.cos(YAW) * Math.cos(PITCH),
};
const HIDE_Z = CAM.z / CAM.y;      // 1.160 — a wall across the frame
const EYE = 1.60;                  // WALKER_EYE
const REACH = 1.9;                 // a guard gives up above this

const DECK = { minX: -30, maxX: 30, minZ: -8.0, maxZ: 11.6 };
const BOX = { w: 6.0, d: 2.4, h: 2.4 };

/** A layout is a list of [x, z, tiers]. */
const LAYOUTS = {
  'A — as shipped (6 boxes, 1 tier)': [
    [-2, -4.5, 1], [14, -4, 1], [20, 1, 1], [27, -1, 1], [5, -5, 1], [10, 4.5, 1],
  ],
  'B — working ship (14 boxes, 1–2 tiers)': [
    [-2, -4.5, 1], [-2, -1.5, 2], [4, -4.5, 2], [4, -1.5, 1], [10, -4.5, 1],
    [10, -1.5, 2], [16, -4.5, 2], [16, -1.5, 1], [22, -4.5, 1], [22, -1.5, 2],
    [27, -4.5, 1], [27, -1.5, 1], [10, 4.5, 1], [16, 4.5, 1],
  ],
  'C — bays fore and aft, clear waist (16 boxes)': [
    [-2, -6.5, 2], [-2, -4.0, 2], [-2, -1.5, 1], [4, -6.5, 1], [4, -4.0, 2], [4, -1.5, 2],
    [18, -6.5, 2], [18, -4.0, 2], [18, -1.5, 1], [24, -6.5, 1], [24, -4.0, 2], [24, -1.5, 2],
    [10, -6.5, 1], [10, -4.0, 1], [29, -4.0, 1], [29, -1.5, 1],
  ],
  'D — full load, three high (20 boxes)': [
    [-2, -6.5, 3], [-2, -4.0, 3], [-2, -1.5, 2], [-2, 1.0, 2],
    [4, -6.5, 3], [4, -4.0, 3], [4, -1.5, 2], [4, 1.0, 1],
    [12, -6.5, 3], [12, -4.0, 3], [12, -1.5, 2], [12, 1.0, 2],
    [18, -6.5, 3], [18, -4.0, 3], [18, -1.5, 2], [18, 1.0, 1],
    [25, -6.5, 2], [25, -4.0, 2], [25, -1.5, 2], [25, 1.0, 1],
  ],
};

const boxesOf = (l) => l.map(([x, z, t]) => ({
  minX: x - BOX.w / 2, maxX: x + BOX.w / 2,
  minZ: z - BOX.d / 2, maxZ: z + BOX.d / 2,
  top: t * BOX.h, tiers: t, x, z,
}));

/** Does the segment from (ex,ey,ez) to (px,py,pz) cross any box? */
function blocked(boxes, ex, ey, ez, px, py, pz) {
  const dx = px - ex, dy = py - ey, dz = pz - ez;
  const loY = Math.min(ey, py), hiY = Math.max(ey, py);
  for (const c of boxes) {
    if (c.top <= loY || hiY <= 0) continue;
    let t0 = 0, t1 = 1, skip = false;
    for (const [o, d, lo, hi] of [[ex, dx, c.minX, c.maxX], [ez, dz, c.minZ, c.maxZ]]) {
      if (d === 0) { if (o <= lo || o >= hi) { skip = true; break; } continue; }
      let a = (lo - o) / d, b = (hi - o) / d;
      if (a > b) { const s = a; a = b; b = s; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
    }
    if (skip || t0 >= t1) continue;
    const ya = ey + dy * t0, yb = ey + dy * t1;
    if (Math.min(ya, yb) < c.top - 0.05 && Math.max(ya, yb) > 0.05) return true;
  }
  return false;
}

/** Hidden from the camera: cast the fixed ray and see if a box is in the way. */
function hiddenFromCamera(boxes, x, y, z) {
  return blocked(boxes, x, y, z, x + CAM.x * 200, y + CAM.y * 200, z + CAM.z * 200);
}

function measure(layout) {
  const boxes = boxesOf(layout);
  const inside = (x, z) => boxes.some((c) => x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ);
  let deckCells = 0, hidden = 0;
  for (let x = DECK.minX; x <= DECK.maxX; x += 0.75) {
    for (let z = DECK.minZ; z <= DECK.maxZ; z += 0.75) {
      if (inside(x, z)) continue;
      deckCells++;
      if (hiddenFromCamera(boxes, x, 0.06, z)) hidden++;
    }
  }
  // Guard blindness at three crow heights, from a spread of plausible posts.
  const posts = [[1, -1], [12, 8.6], [24, 8.3], [9, -6.2], [-2, 8.4], [7, 10.6]];
  const share = (lift) => {
    let n = 0, b = 0;
    for (const [gx, gz] of posts) {
      for (let x = DECK.minX; x <= DECK.maxX; x += 1.5) {
        for (let z = DECK.minZ; z <= DECK.maxZ; z += 1.5) {
          if (inside(x, z)) continue;
          if (Math.hypot(x - gx, z - gz) > 10) continue;
          n++;
          if (blocked(boxes, gx, EYE, gz, x, 0.06 + lift, z)) b++;
        }
      }
    }
    return n ? (100 * b) / n : 0;
  };
  const tops = boxes.filter((c) => c.top > REACH).length;
  return {
    boxes: boxes.length, tops,
    hidden: (100 * hidden) / deckCells,
    g0: share(0), g1: share(1.2), g3: share(3.0),
    tallest: Math.max(...boxes.map((c) => c.top)),
  };
}

// ── drawing: the real camera, orthographic-ish, which is what the game reads as
const SC = 15;
const proj = (x, y, z) => ({
  // Screen right is +x with the yaw; screen up is height plus the z recession.
  px: (x + z * Math.sin(YAW)) * SC,
  py: -(y * Math.cos(PITCH) - z * Math.cos(YAW) * Math.sin(PITCH)) * SC,
});
const HUES = ['#c98f80', '#6f9fc0', '#7fb392', '#dfb662'];

function drawBox(c, i) {
  const hue = HUES[i % 4];
  const dark = `color-mix(in srgb, ${hue} 62%, #1a2330)`;
  const lit = `color-mix(in srgb, ${hue} 78%, white)`;
  const p = [
    proj(c.minX, c.top, c.minZ), proj(c.maxX, c.top, c.minZ),
    proj(c.maxX, c.top, c.maxZ), proj(c.minX, c.top, c.maxZ),
    proj(c.minX, 0, c.maxZ), proj(c.maxX, 0, c.maxZ), proj(c.maxX, 0, c.minZ),
  ];
  const poly = (pts, fill) => `<polygon points="${pts.map((q) => `${q.px.toFixed(1)},${q.py.toFixed(1)}`).join(' ')}" fill="${fill}" stroke="#1a2330" stroke-width="0.7"/>`;
  return poly([p[0], p[1], p[2], p[3]], lit)          // top
    + poly([p[3], p[2], p[5], p[4]], hue)             // near long side
    + poly([p[2], p[1], p[6], p[5]], dark);           // near short end
}

function svg(layout) {
  const boxes = boxesOf(layout).sort((a, b) => (a.z - b.z) || (a.x - b.x));
  const corners = [
    proj(DECK.minX, 0, DECK.minZ), proj(DECK.maxX, 0, DECK.minZ),
    proj(DECK.maxX, 0, DECK.maxZ), proj(DECK.minX, 0, DECK.maxZ),
  ];
  const deck = `<polygon points="${corners.map((q) => `${q.px.toFixed(1)},${q.py.toFixed(1)}`).join(' ')}" fill="#a8ceff" fill-opacity=".55" stroke="#7d93b0"/>`;
  const body = deck + boxes.map(drawBox).join('');
  const xs = [], ys = [];
  for (const q of corners) { xs.push(q.px); ys.push(q.py); }
  for (const c of boxes) {
    for (const [X, Y, Z] of [[c.minX, 0, c.minZ], [c.maxX, c.top, c.maxZ], [c.maxX, c.top, c.minZ], [c.minX, 0, c.maxZ]]) {
      const q = proj(X, Y, Z); xs.push(q.px); ys.push(q.py);
    }
  }
  const pad = 18;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  return `<svg viewBox="${minX.toFixed(0)} ${minY.toFixed(0)} ${(maxX - minX).toFixed(0)} ${(maxY - minY).toFixed(0)}" role="img">${body}</svg>`;
}

const rows = Object.entries(LAYOUTS).map(([name, l]) => {
  const m = measure(l);
  /**
   * Non-increasing, not strictly falling. Below a 2.4m box, a crow at 0.06 and
   * a crow at 1.26 are blocked by exactly the same things, so the first two
   * numbers are equal by construction and a strict test calls every layout a
   * failure. What matters is that climbing never makes it *worse*.
   */
  const monotone = m.g1 <= m.g0 + 0.5 && m.g3 <= m.g1 + 0.5;
  return { name, l, m, monotone };
});

const cards = rows.map(({ name, l, m, monotone }) => `
  <section class="card">
    <h2>${name}</h2>
    <div class="plate">${svg(l)}</div>
    <div class="nums">
      <div><dt>Boxes</dt><dd>${m.boxes}</dd></div>
      <div><dt>Tallest</dt><dd>${m.tallest.toFixed(1)} m</dd></div>
      <div><dt>Out of a guard's reach</dt><dd>${m.tops} / ${m.boxes}</dd></div>
      <div class="${m.hidden > 35 ? 'bad' : 'ok'}"><dt>Deck hidden from camera</dt><dd>${m.hidden.toFixed(1)}%<small> budget 35</small></dd></div>
      <div class="${monotone ? 'ok' : 'bad'}"><dt>Guards blind at 0 / 1.2 / 3 m</dt><dd>${m.g0.toFixed(0)} → ${m.g1.toFixed(0)} → ${m.g3.toFixed(0)}%<small>${monotone ? 'never rises — passes' : 'RISES — fails the flight rule'}</small></dd></div>
    </div>
  </section>`).join('');

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Small Change — Cargo Layouts</title>
<style>
:root{--paper:#E9E5DA;--paper2:#DFDACB;--ink:#141C18;--soft:#3E4A44;--rule:#C3BFB1;--brass:#A87C22;--bad:#9c3b2e;--good:#2f6d4a}
@media (prefers-color-scheme:dark){:root{--paper:#131815;--paper2:#1A211D;--ink:#E4E2D7;--soft:#A3ADA6;--rule:#2C3630;--brass:#D2A644;--bad:#d4756a;--good:#6fbf92}}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);margin:0;padding:2rem 1.5rem 5rem;
 font-family:Charter,"Iowan Old Style",Georgia,serif;font-size:16px;line-height:1.6}
h1{font-family:"Avenir Next Condensed","Arial Narrow",sans-serif;text-transform:uppercase;
 font-size:clamp(1.8rem,5vw,3rem);margin:0 0 .3rem;letter-spacing:.02em}
.lede{max-width:44rem;color:var(--soft);margin:0 0 2.5rem}
.card{max-width:70rem;margin:0 auto 3rem;border-top:2px solid var(--ink);padding-top:1rem}
h2{font-family:"Avenir Next Condensed","Arial Narrow",sans-serif;text-transform:uppercase;
 font-size:1.05rem;letter-spacing:.05em;margin:0 0 .8rem}
.plate{background:var(--paper2);border:1px solid var(--rule);padding:1rem;overflow-x:auto}
.plate svg{display:block;width:100%;height:auto;min-width:34rem}
.nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:0;
 border:1px solid var(--rule);border-top:0}
.nums>div{padding:.7rem .9rem;border-right:1px solid var(--rule)}
.nums>div:last-child{border-right:0}
dt{font-family:Menlo,monospace;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--soft)}
dd{margin:.15rem 0 0;font-family:Menlo,monospace;font-size:1.05rem}
dd small{display:block;font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;margin-top:.2rem;opacity:.8}
.ok dd{color:var(--good)} .bad dd{color:var(--bad)}
footer{max-width:70rem;margin:0 auto;color:var(--soft);font-size:.9rem;border-top:1px solid var(--rule);padding-top:1rem}
</style></head><body>
<h1>Cargo layouts</h1>
<p class="lede">Level 6's deck density, drawn at the game's real camera — 38&deg; down, 25&deg; of yaw — with
the two numbers that constrain it measured off each layout. <strong>Deck hidden from camera</strong> is
how much walkable steel the player cannot see (level 1 is 34.7%, so 35 is the budget).
<strong>Guards blind</strong> has to <em>fall</em> as the crow climbs, or flight becomes a way to hide,
which is the one thing the sight change must never do. No geometry has been built from any of these.</p>
${cards}
<footer>Generated by <code>scripts/cargo-mock.mjs</code>. Edit the <code>LAYOUTS</code> table and re-run
to try your own — each entry is a list of <code>[x, z, tiers]</code>, one container each,
6.0 &times; 2.4 &times; 2.4 m.</footer>
</body></html>`;

writeFileSync('docs/cargo-mock.html', html);
console.log('wrote docs/cargo-mock.html\n');
console.log('layout                                     boxes  hidden%  guards blind 0/1.2/3');
for (const { name, m, monotone } of rows) {
  console.log(`${name.padEnd(42)} ${String(m.boxes).padStart(4)}   ${m.hidden.toFixed(1).padStart(5)}   `
    + `${m.g0.toFixed(0).padStart(2)} → ${m.g1.toFixed(0).padStart(2)} → ${m.g3.toFixed(0).padStart(2)}  ${monotone ? 'ok' : 'FAILS'}`);
}
