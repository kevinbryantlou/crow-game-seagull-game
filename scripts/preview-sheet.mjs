/**
 * Builds docs/preview-candidates.html — a contact sheet of the link-preview
 * candidates rendered by scripts/preview.mjs.
 *
 * Images are downscaled and inlined as data URIs so the page is self-contained
 * and small enough to keep in the repo. Full-resolution PNGs stay in shots/
 * (gitignored); regenerate them any time with `npm run preview`.
 *
 *   node scripts/preview-sheet.mjs
 */

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  {
    id: 'A', file: 'preview.png', name: 'Fountain plaza',
    pos: '-25.5, 0, 7.5',
    good: 'The fountain is the strongest single shape in the game and it anchors the frame. Warm paving, violet shadows, clean read.',
    bad: 'The crow is small and sits close to the wordmark wash, so the subject of the game is nearly invisible.',
  },
  {
    id: 'B', file: 'preview-b-memorial.png', name: 'The memorial',
    pos: '-14.5, 0, -3.5',
    good: 'Shows the nest on the plinth, which is what the tagline is about, and the fountain edge gives the left side a curve to sit the wordmark against. Kevin flagged this as the one to come back to.',
    bad: 'Busy. The dark red backdrop building is heavy and pulls the eye off the plaza.',
    runnerUp: true,
  },
  {
    id: 'C', file: 'preview-c-cafe.png', name: 'Café row',
    pos: '-3, 0, 6.5',
    good: 'Awning stripes are the one cool colour accent in the palette.',
    bad: 'Rejected. The awning roof fills a third of the frame as a flat brown slab, and the crow is hidden behind it entirely.',
  },
  {
    id: 'D', file: 'preview-d-nest.png', name: 'Perched at the nest',
    pos: '-12.5, 5.0, -6.5',
    good: 'The most literal illustration of the goal: the crow is sitting in the twig ring the tagline names.',
    bad: 'Camera pulls back as the crow climbs, so everything shrinks. Backdrop buildings crowd the top right.',
  },
  {
    id: 'E', file: 'preview-e-open.png', name: 'Open paving by the fountain',
    pos: '-17.5, 0, 3.5',
    good: 'Shows the most game: fountain, memorial and nest, café awning, trees, three people. A "here is the block" shot.',
    bad: 'No single subject. The crow is one small dark shape among many.',
  },
  {
    id: 'F', file: 'preview-f-cart.png', name: 'Cart corner',
    pos: '13.5, 0, -1.5',
    good: 'The crow reads clearly against open paving, and the vendor has a "?" over his head — this is the only candidate showing the game\'s actual verb rather than its scenery. Orange parasol gives the frame a focal point.',
    bad: 'Scaffolding on the right is a large flat plane. Less immediately pretty than the fountain.',
    pick: true,
  },
];

const tmp = mkdtempSync(join(tmpdir(), 'sheet-'));
/**
 * Downscale to JPEG before inlining. At full-size PNG the six candidates come to
 * ~4 MB of base64, which is no way to store a review page in a repo; at 620px
 * JPEG it is a fraction of that and still far more resolution than judging a
 * framing needs. Full-resolution PNGs live in shots/.
 */
const dataUri = (file, width) => {
  const src = join('shots', file);
  if (!existsSync(src)) throw new Error(`missing ${src} — run \`npm run preview\` first`);
  const out = join(tmp, `${file.replace(/\.png$/, '')}-${width}.jpg`);
  execFileSync('sips', [
    '-s', 'format', 'jpeg', '-s', 'formatOptions', '62',
    '-Z', String(width), src, '--out', out,
  ], { stdio: 'ignore' });
  return `data:image/jpeg;base64,${readFileSync(out).toString('base64')}`;
};

const cards = CANDIDATES.map((c) => {
  const uri = dataUri(c.file, 620);
  return `
      <figure class="cand${c.pick ? ' pick' : ''}${c.runnerUp ? ' runner' : ''}" id="cand-${c.id}">
        <figcaption>
          <span class="tag">${c.id}</span>
          <h3>${c.name}</h3>
          ${c.pick ? '<span class="chip">Shipping</span>' : ''}${c.runnerUp ? '<span class="chip alt">Runner-up</span>' : ''}
          <span class="pos">crow at ${c.pos}</span>
        </figcaption>
        <div class="shots">
          <div class="wide">
            <img src="${uri}" alt="${c.name} — full 1.91:1 card" loading="lazy">
            <span class="cap">1200 × 630 — Slack, Twitter, Discord</span>
          </div>
          <div class="square">
            <img src="${uri}" alt="${c.name} — square crop" loading="lazy">
            <span class="cap">square crop — some clients</span>
          </div>
        </div>
        <div class="notes">
          <p class="good"><strong>Works</strong> ${c.good}</p>
          <p class="bad"><strong>Costs</strong> ${c.bad}</p>
        </div>
      </figure>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<title>Small Change — Link Preview Candidates</title>
<style>
  html { -webkit-text-size-adjust: 100%; }
  :root {
    --paper:#E9E5DA; --paper-2:#DFDACB; --ink:#141C18; --ink-soft:#3E4A44;
    --nickel:#8B948F; --rule:#C3BFB1; --enamel:#1F4D3D; --brass:#A87C22;
    --brass-lit:#C79A34; --band-text:#EDEAE0; --band-dim:#9FB5AB; --chip:#D7D2C2;
    --good:#2F6B4F; --bad:#9C4A32;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper:#131815; --paper-2:#1A211D; --ink:#E4E2D7; --ink-soft:#A3ADA6;
      --nickel:#7C857F; --rule:#2C3630; --enamel:#16332A; --brass:#D2A644;
      --brass-lit:#E0B85C; --band-text:#E4E2D7; --band-dim:#7E9A8D; --chip:#212925;
      --good:#7FBF9A; --bad:#E09070;
    }
  }
  :root[data-theme="dark"] {
    --paper:#131815; --paper-2:#1A211D; --ink:#E4E2D7; --ink-soft:#A3ADA6;
    --nickel:#7C857F; --rule:#2C3630; --enamel:#16332A; --brass:#D2A644;
    --brass-lit:#E0B85C; --band-text:#E4E2D7; --band-dim:#7E9A8D; --chip:#212925;
    --good:#7FBF9A; --bad:#E09070;
  }
  * { box-sizing: border-box; }
  body {
    background: var(--paper); color: var(--ink); margin: 0;
    font-family: Charter, "Iowan Old Style", Georgia, serif;
    font-size: 17px; line-height: 1.6; -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: Menlo, ui-monospace, monospace; font-size: .82em; }
  .band {
    background: var(--enamel); color: var(--band-text);
    padding: 3rem 1.5rem 2.2rem; border-bottom: 6px solid var(--brass);
  }
  .band-inner { max-width: 68rem; margin: 0 auto; display: flex; flex-direction: column; gap: .9rem; }
  .eyebrow {
    font-family: Menlo, monospace; font-size: .72rem; letter-spacing: .22em;
    text-transform: uppercase; color: var(--band-dim);
  }
  h1 {
    font-family: "Avenir Next Condensed","Arial Narrow",sans-serif; font-weight: 700;
    font-size: clamp(2.4rem, 8vw, 4.4rem); line-height: .9; text-transform: uppercase;
    margin: 0; letter-spacing: .005em;
  }
  h1 span { display: block; color: var(--brass-lit); }
  .deck { font-size: 1.06rem; max-width: 40rem; opacity: .9; margin: 0; }
  main { max-width: 68rem; margin: 0 auto; padding: 2.6rem 1.5rem 6rem; }
  .intro { max-width: 40rem; }
  .intro p + p { margin-top: .8rem; }
  h2 {
    font-family: "Avenir Next Condensed","Arial Narrow",sans-serif; font-weight: 700;
    text-transform: uppercase; font-size: 1.5rem; letter-spacing: .015em;
    margin: 3rem 0 .2rem; padding-bottom: .5rem; border-bottom: 2px solid var(--ink);
  }
  .cand {
    margin: 2rem 0 0; border: 1px solid var(--rule); background: var(--paper-2);
    padding: 1.1rem;
  }
  .cand.pick { border-color: var(--brass); border-width: 2px; }
  .cand.runner { border-color: var(--nickel); border-width: 2px; border-style: dashed; }
  .chip.alt { background: var(--nickel); color: var(--paper-2); }
  figcaption { display: flex; align-items: baseline; gap: .7rem; flex-wrap: wrap; margin-bottom: .9rem; }
  .tag {
    font-family: Menlo, monospace; font-size: .72rem; font-weight: 700;
    background: var(--enamel); color: var(--band-text); padding: .15rem .5rem;
  }
  figcaption h3 {
    font-family: "Avenir Next Condensed","Arial Narrow",sans-serif; font-weight: 700;
    text-transform: uppercase; letter-spacing: .04em; font-size: 1.1rem; margin: 0;
  }
  .chip {
    font-family: Menlo, monospace; font-size: .62rem; letter-spacing: .16em;
    text-transform: uppercase; background: var(--brass); color: #14261f;
    padding: .18rem .5rem; font-weight: 700;
  }
  .pos { font-family: Menlo, monospace; font-size: .68rem; color: var(--nickel); margin-left: auto; }
  .shots { display: grid; grid-template-columns: 1fr 315px; gap: 1rem; align-items: start; }
  .shots img { display: block; width: 100%; height: auto; }
  .square { overflow: hidden; }
  .square img { width: 315px; height: 315px; object-fit: cover; object-position: 38% 50%; }
  .cap {
    display: block; font-family: Menlo, monospace; font-size: .62rem;
    letter-spacing: .12em; text-transform: uppercase; color: var(--nickel); margin-top: .4rem;
  }
  .notes { margin-top: 1rem; display: grid; gap: .35rem; }
  .notes p { margin: 0; font-size: .93rem; }
  .notes strong {
    font-family: Menlo, monospace; font-size: .64rem; letter-spacing: .16em;
    text-transform: uppercase; margin-right: .5rem;
  }
  .good strong { color: var(--good); }
  .bad strong { color: var(--bad); }
  .note {
    border-left: 4px solid var(--brass); background: var(--paper-2);
    padding: .9rem 1.1rem; font-size: .95rem; max-width: 44rem; margin-top: 1.4rem;
  }
  .note .lbl {
    font-family: Menlo, monospace; font-size: .66rem; letter-spacing: .16em;
    text-transform: uppercase; color: var(--brass); display: block; margin-bottom: .25rem;
  }
  code {
    font-family: Menlo, monospace; font-size: .82em; background: var(--chip);
    padding: .1rem .3rem;
  }
  footer {
    border-top: 2px solid var(--ink); margin-top: 4rem; padding-top: 1rem;
    font-family: Menlo, monospace; font-size: .7rem; letter-spacing: .1em;
    text-transform: uppercase; color: var(--nickel);
    display: flex; justify-content: space-between; flex-wrap: wrap; gap: .5rem;
  }
  @media (max-width: 52rem) {
    .shots { grid-template-columns: 1fr; }
    .square img { width: 100%; height: 260px; }
    .pos { margin-left: 0; width: 100%; }
  }
</style>
</head>
<body>

<header class="band">
  <div class="band-inner">
    <div class="eyebrow">Link preview · candidate framings</div>
    <h1>Preview<span>Candidates</span></h1>
    <p class="deck">Six framings for the card that appears when
      <span class="mono">beacon2.com/small-change-crow-game</span> is pasted into a
      message. All rendered from the running game, not mocked up.</p>
  </div>
</header>

<main>
  <div class="intro">
    <p>Every candidate is the real game at 1200 × 630 with the HUD stripped and the
    wordmark laid over it. The camera angle is fixed and cannot be zoomed, so the only
    variable is where the crow stands — the camera follows it, and the framing follows
    from that.</p>

    <p>That constraint is the whole problem here. Because the camera sits far back, the
    crow is always small, and a card advertising a game about a crow should probably
    contain a visible crow. The candidates split into two kinds: <em>pretty scenery</em>
    where the bird is a speck, and <em>a legible bird</em> where the scenery is plainer.</p>

    <p>Regenerate the images with <code>npm run preview</code>, then rebuild this page
    with <code>npm run preview:sheet</code>. Edit the framings at the top of
    <code>scripts/preview.mjs</code>.</p>
  </div>

  <h2>Candidates</h2>
${cards}

  <div class="note">
    <span class="lbl">Why F ships</span>
    It is the only frame where you can tell what the game <em>is</em> rather than what it
    looks like. The crow reads clearly against open paving, and the vendor beside it has a
    question mark over his head — meaning he has just noticed a bird next to his cart. That
    is the entire game in one image: a small thief, a person about to object, and something
    worth stealing between them. The fountain shots are prettier and say nothing.
  </div>

  <div class="note">
    <span class="lbl">Keep B in the drawer</span>
    The memorial shot is the strongest of the scenery framings and the obvious second
    choice — it is the only one besides F that has a subject, and its subject is the nest
    itself. If the card is ever rotated, or a second one is needed for a different
    surface, start here rather than re-deriving from scratch.
  </div>

  <div class="note">
    <span class="lbl">If we revisit this</span>
    The real fix is a preview-only camera. A temporary override of the fixed distance —
    say 46 down to 22 — would let the crow fill a third of the frame while keeping the
    signature angle, and would beat all six of these. It is maybe ten lines in
    <code>stage.js</code>, gated so it can never affect play.
  </div>

  <footer>
    <span>Small Change — preview candidates</span>
    <span>Generated by scripts/preview-sheet.mjs</span>
  </footer>
</main>
</body>
</html>
`;

writeFileSync('docs/preview-candidates.html', html);
const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`wrote docs/preview-candidates.html (${kb} KB, ${CANDIDATES.length} candidates)`);
