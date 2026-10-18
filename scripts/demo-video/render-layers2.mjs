// The still layers of the second demo video, in the app's hand-drawn style, photographed by Chromium: the paper,
// the browser window, the drawn phones (one beside its printed page, two side by side), the steps of "how a film is
// made" with the Ashes story's own pictures, labels, captions for every voice (narrator and app), the placeholder
// notes that say what to film on a real phone, and the title and end cards.
//   node scripts/demo-video/render-layers2.mjs <out dir> <public url>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PW } from './capture-lib.mjs';
const { chromium } = await import(PW);
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const QRCode = require('qrcode');

const [out, publicUrl] = process.argv.slice(2);
const L = path.join(out, 'layers');
fs.mkdirSync(L, { recursive: true });
const script = JSON.parse(fs.readFileSync(new URL('./script2.json', import.meta.url), 'utf8'));
const STORY = `${publicUrl}/api/files/1c80f669-d6ff-470f-8a9d-8843b57ad02c`;
const W = 1920, H = 1080;
const WIN = { x: 160, y: 36, w: 1600, bar: 46, h: 900 };
// a phone: the take is 780×1688; on screen 407×880 inside an 18 px body
const PH = { w: 407, h: 880, bezel: 18 };
const phoneAt = (x, y) => ({ x: x + PH.bezel, y: y + PH.bezel, w: PH.w, h: PH.h, bx: x, by: y });
const GEO = {
  content: { x: WIN.x, y: WIN.y + WIN.bar, w: WIN.w, h: WIN.h },
  cold: phoneAt(1180, 64),
  shared: [phoneAt(420, 64), phoneAt(1060, 64)],
  title: { x: 1222, y: 126, w: 496, h: 792 },
  film: { x: 1258, y: 196, w: 560, h: 315 }, // the clip inside the "films it" step
};

const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Patrick+Hand&display=swap" rel="stylesheet">';
const BASE = `
:root { --paper:#fdfbf7; --deep:#e5e0d8; --pencil:#2d2d2d; --soft:rgba(45,45,45,.62); --marker:#ff4d4d; --pen:#2d5da1; --postit:#fff9c4; --white:#fff; }
* { box-sizing: border-box; } html, body { margin:0; width:${W}px; height:${H}px; font-family:'Patrick Hand',system-ui,sans-serif; color:var(--pencil); background:transparent; }
.paper { background-color:var(--paper); background-image:radial-gradient(var(--deep) 1.3px, transparent 1.3px); background-size:28px 28px; }
.postit { display:inline-flex; align-items:center; gap:12px; background:var(--postit); border:3px solid var(--pencil); border-radius:12px 255px 12px 225px / 225px 12px 255px 12px; box-shadow:4px 4px 0 var(--pencil); font-family:'Kalam'; font-weight:700; }
.card { position:absolute; background:#fff; border:3px solid var(--pencil); border-radius:15px 225px 15px 255px / 255px 15px 225px 15px; box-shadow:7px 7px 0 var(--pencil); padding:16px 20px; }
.card h3 { margin:0 0 8px; font-family:Kalam; font-weight:700; font-size:30px; line-height:1.1; }
.card p { margin:0; font-size:24px; line-height:1.25; color:rgba(45,45,45,.85); }
.tag { position:absolute; display:inline-block; padding:3px 14px 5px; font-size:22px; font-family:'Patrick Hand'; font-weight:400; background:#fff; border:2.5px solid var(--pencil); border-radius:10px; box-shadow:3px 3px 0 var(--pencil); }
`;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
async function shot(html, file, { selector = null, transparent = true } = {}) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}</style></head><body>${html}</body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))));
  const target = selector ? page.locator(selector) : page;
  await target.screenshot({ path: path.join(L, file), omitBackground: transparent });
}

// the paper, and the browser window with a hole for the app (as in the first video)
await shot('<div class="paper" style="width:100%;height:100%"></div>', 'bg.png', { transparent: false });
const r = 18, cx = WIN.x, cy = WIN.y + WIN.bar, cw = WIN.w, ch = WIN.h;
const winOuter = `M${WIN.x + r} ${WIN.y} H${WIN.x + WIN.w - r} Q${WIN.x + WIN.w} ${WIN.y} ${WIN.x + WIN.w} ${WIN.y + r} V${cy + ch - r} Q${WIN.x + WIN.w} ${cy + ch} ${WIN.x + WIN.w - r} ${cy + ch} H${WIN.x + r} Q${WIN.x} ${cy + ch} ${WIN.x} ${cy + ch - r} V${WIN.y + r} Q${WIN.x} ${WIN.y} ${WIN.x + r} ${WIN.y} Z`;
await shot(`
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="#fdfbf7"/><circle cx="14" cy="14" r="1.3" fill="#e5e0d8"/></pattern>
    <clipPath id="outside"><path clip-rule="evenodd" d="M0 0 H${W} V${H} H0 Z ${winOuter}"/></clipPath>
  </defs>
  <path fill-rule="evenodd" fill="url(#dots)" d="M0 0 H${W} V${H} H0 Z ${winOuter}"/>
  <g clip-path="url(#outside)"><path d="${winOuter}" transform="translate(9 9)" fill="#2d2d2d"/></g>
  <path d="M${WIN.x + r} ${WIN.y} H${WIN.x + WIN.w - r} Q${WIN.x + WIN.w} ${WIN.y} ${WIN.x + WIN.w} ${WIN.y + r} V${cy} H${WIN.x} V${WIN.y + r} Q${WIN.x} ${WIN.y} ${WIN.x + r} ${WIN.y} Z" fill="#e5e0d8"/>
  <path d="${winOuter}" fill="none" stroke="#2d2d2d" stroke-width="3.5"/>
  <line x1="${WIN.x}" y1="${cy}" x2="${WIN.x + WIN.w}" y2="${cy}" stroke="#2d2d2d" stroke-width="2.5"/>
  <circle cx="${WIN.x + 28}" cy="${WIN.y + 23}" r="8" fill="#ff4d4d" stroke="#2d2d2d" stroke-width="2"/>
  <circle cx="${WIN.x + 54}" cy="${WIN.y + 23}" r="8" fill="#fff9c4" stroke="#2d2d2d" stroke-width="2"/>
  <circle cx="${WIN.x + 80}" cy="${WIN.y + 23}" r="8" fill="#ffffff" stroke="#2d2d2d" stroke-width="2"/>
  <rect x="${WIN.x + 520}" y="${WIN.y + 9}" width="560" height="28" rx="14" fill="#ffffff" stroke="#2d2d2d" stroke-width="2"/>
  <text x="${WIN.x + 800}" y="${WIN.y + 29}" text-anchor="middle" font-family="Patrick Hand" font-size="19" fill="#2d2d2d">${publicUrl.replace(/^https?:\/\//, '')}</text>
</svg>`, 'frame.png');

// the phones: the body under the footage (with its hard shadow), the bezel and the camera notch over it
const body = (g) => `<rect x="${g.bx + 12}" y="${g.by + 12}" width="${PH.w + 2 * PH.bezel}" height="${PH.h + 2 * PH.bezel}" rx="58" fill="#2d2d2d"/><rect x="${g.bx}" y="${g.by}" width="${PH.w + 2 * PH.bezel}" height="${PH.h + 2 * PH.bezel}" rx="58" fill="#1d1d1d" stroke="#2d2d2d" stroke-width="5"/>`;
const bezel = (g) => `<rect x="${g.x - 2}" y="${g.y - 2}" width="${PH.w + 4}" height="${PH.h + 4}" rx="42" fill="none" stroke="#1d1d1d" stroke-width="10"/><rect x="${g.bx}" y="${g.by}" width="${PH.w + 2 * PH.bezel}" height="${PH.h + 2 * PH.bezel}" rx="58" fill="none" stroke="#2d2d2d" stroke-width="5"/><rect x="${g.x + PH.w / 2 - 52}" y="${g.y + 10}" width="104" height="26" rx="13" fill="#000"/>`;
// the cold open: the printed page on the desk, and the phone looking at it
await shot(`
<div class="paper" style="position:absolute;inset:0"></div>
<div style="position:absolute;left:250px;top:120px;transform:rotate(-3deg)">
  <div style="position:absolute;left:14px;top:14px;width:600px;height:857px;background:#2d2d2d;border-radius:6px"></div>
  <img src="${STORY}/page-1.jpg" style="position:relative;display:block;width:600px;height:857px;border:3px solid #2d2d2d;border-radius:6px">
</div>
<svg width="${W}" height="${H}" style="position:absolute;inset:0">${body(GEO.cold)}</svg>`, 'cold-under.png', { transparent: false });
await shot(`
<svg width="${W}" height="${H}" style="position:absolute;inset:0">${bezel(GEO.cold)}
  <path d="M 880 210 C 980 150, 1080 160, 1150 230" stroke="#ff4d4d" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M 1150 230 l -30 -6 m 30 6 l -8 -28" stroke="#ff4d4d" stroke-width="6" fill="none" stroke-linecap="round"/>
</svg>
<div class="postit" style="position:absolute;left:300px;top:58px;padding:4px 18px 6px;font-size:30px;transform:rotate(-2deg)">A printed page of a class 7 English book</div>
<div class="postit" style="position:absolute;left:1640px;top:150px;padding:4px 16px 6px;font-size:28px;background:#fff;transform:rotate(3deg);white-space:nowrap;flex-direction:column;gap:0">The phone's<span>camera</span></div>`, 'cold-over.png');
// the same film for everyone: two phones
await shot(`<div class="paper" style="position:absolute;inset:0"></div><svg width="${W}" height="${H}" style="position:absolute;inset:0">${GEO.shared.map(body).join('')}</svg>`, 'shared-under.png', { transparent: false });
await shot(`
<svg width="${W}" height="${H}" style="position:absolute;inset:0">${GEO.shared.map(bezel).join('')}</svg>
<div class="postit" style="position:absolute;left:150px;top:420px;padding:6px 18px 8px;font-size:30px;flex-direction:column;align-items:flex-start;gap:0;transform:rotate(-3deg)">Student 1<span style="font-family:'Patrick Hand';font-weight:400;font-size:26px">scans page 62</span></div>
<div class="postit" style="position:absolute;left:1560px;top:420px;padding:6px 18px 8px;font-size:30px;flex-direction:column;align-items:flex-start;gap:0;background:#fff;transform:rotate(2.5deg)">Student 2<span style="font-family:'Patrick Hand';font-weight:400;font-size:26px">scans page 63</span></div>`, 'shared-over.png');
await shot(`<div id="s" class="postit" style="position:absolute;left:20px;top:20px;padding:8px 22px 10px;font-size:34px;background:#ff4d4d;color:#fff;flex-direction:column;gap:0;transform:rotate(-2deg)">The same film<span style="font-family:'Patrick Hand';font-weight:400;font-size:28px">found in about 3 seconds</span></div>`, 'shared-same.png', { selector: '#s' });

// how a film is made: one transparent layer per step (they appear one after another), with the story's own pictures
const steps = {
  'mk-page': `<div class="card" style="left:70px;top:150px;width:300px;transform:rotate(-2deg)"><h3>The page</h3><img src="${STORY}/page-1.jpg" style="display:block;width:256px;border:2px solid #2d2d2d;border-radius:4px"></div>`,
  'mk-plan': `<div class="card" style="left:430px;top:150px;width:330px;transform:rotate(1deg)"><h3>Gemini plans it</h3><p>The book's own sentences, in the book's order: 6 shots, 7 characters with a voice each, and 1 choice.</p><div class="tag" style="position:relative;margin-top:14px">Gemini 4 Argon</div></div>
    <svg width="${W}" height="${H}" style="position:absolute;inset:0"><path d="M 372 300 C 395 290, 405 290, 425 300" stroke="#2d2d2d" stroke-width="4" fill="none"/><path d="M 425 300 l -14 -9 m 14 9 l -15 7" stroke="#2d2d2d" stroke-width="4" fill="none"/></svg>`,
  'mk-draw': `<div class="card" style="left:820px;top:150px;width:380px;transform:rotate(-1deg)"><h3>Nano Banana draws it</h3><img src="${STORY}/cast.png" style="display:block;width:340px;height:120px;object-fit:cover;border:2px solid #2d2d2d;border-radius:4px"><img src="${STORY}/kf-s3.png" style="display:block;margin-top:8px;width:340px;height:150px;object-fit:cover;border:2px solid #2d2d2d;border-radius:4px"><div class="tag" style="position:relative;margin-top:10px">in the book's own style</div></div>
    <svg width="${W}" height="${H}" style="position:absolute;inset:0"><path d="M 762 300 C 785 290, 795 290, 815 300" stroke="#2d2d2d" stroke-width="4" fill="none"/><path d="M 815 300 l -14 -9 m 14 9 l -15 7" stroke="#2d2d2d" stroke-width="4" fill="none"/></svg>`,
  'mk-film': `<div class="card" style="left:1240px;top:150px;width:596px;height:470px;transform:rotate(0.6deg)"><h3>Gemini Omni films it</h3><div style="position:absolute;left:16px;top:44px;width:${GEO.film.w}px;height:${GEO.film.h}px;background:#000;border:2px solid #2d2d2d;border-radius:4px"></div><div class="tag" style="position:absolute;left:18px;top:384px">one 10-second clip for each shot</div></div>
    <svg width="${W}" height="${H}" style="position:absolute;inset:0"><path d="M 1202 300 C 1215 290, 1222 290, 1236 300" stroke="#2d2d2d" stroke-width="4" fill="none"/><path d="M 1236 300 l -14 -9 m 14 9 l -15 7" stroke="#2d2d2d" stroke-width="4" fill="none"/></svg>`,
  'mk-voice': `<div class="card" style="left:120px;top:660px;width:560px;transform:rotate(1deg)"><h3>Gemini gives every character a voice</h3><p>Narrator, Good Old Man, Dog-Spirit, Leader of the Van, and more, each with its own acting style. Music by Lyria.</p><div class="tag" style="position:relative;margin-top:12px">Gemini 3.8 TTS and Lyria</div></div>`,
  'mk-review': `<div class="card" style="left:740px;top:650px;width:640px;transform:rotate(-1deg);background:#fff9c4"><h3>Gemini watches the film like a critic</h3><p>"The palanquin glides by itself with no bearers carrying the poles."</p><p style="margin-top:8px;font-family:Kalam;font-weight:700;color:#ff4d4d">Shot 5: film it again.</p><div class="tag" style="position:relative;margin-top:10px">Gemini 4 Argon, round 1 of 7</div></div>`,
  'mk-loop': `<svg width="${W}" height="${H}" style="position:absolute;inset:0"><path d="M 1390 760 C 1560 760, 1640 700, 1640 640" stroke="#ff4d4d" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="2 14"/><path d="M 1640 636 l -16 22 m 16 -22 l 18 20" stroke="#ff4d4d" stroke-width="7" fill="none" stroke-linecap="round"/></svg>
    <div class="postit" style="position:absolute;left:1430px;top:790px;padding:4px 16px 6px;font-size:28px;background:#ff4d4d;color:#fff;transform:rotate(-2deg)">Weak shots made again</div>`,
};
for (const [name, html] of Object.entries(steps)) await shot(html, `${name}.png`);

// the AR clips on real books (from the first video): the shadows under them and the frames and tags over them
const cards = [[260, 'Stays on the page', -2], [758, 'Moves on the paper', 1.5], [1256, 'Any table works', -1]];
const CARD = { y: 118, w: 404, h: 700 };
await shot(`<div class="paper" style="position:absolute;inset:0"></div><svg width="${W}" height="${H}" style="position:absolute;inset:0">${cards.map(([x]) => `<rect x="${x + 12}" y="${CARD.y + 12}" width="${CARD.w}" height="${CARD.h}" rx="18" fill="#2d2d2d"/>`).join('')}</svg>`, 'ar-under.png', { transparent: false });
await shot(`<svg width="${W}" height="${H}" style="position:absolute;inset:0">${cards.map(([x]) => `<rect x="${x - 2}" y="${CARD.y - 2}" width="${CARD.w + 4}" height="${CARD.h + 4}" rx="18" fill="none" stroke="#2d2d2d" stroke-width="6"/>`).join('')}</svg>
${cards.map(([x, tag, rot]) => `<div class="postit" style="position:absolute;left:${x + 30}px;top:${CARD.y + CARD.h - 34}px;padding:4px 18px 6px;font-size:30px;transform:rotate(${rot}deg)">${tag}</div>`).join('')}`, 'ar-over.png');
GEO.ar = cards.map(([x]) => ({ x, y: CARD.y, w: CARD.w, h: CARD.h }));

// labels: a post-it at the top left
for (const sc of script.scenes) {
  if (!sc.label) continue;
  await shot(`<div id="l" class="postit" style="position:absolute;left:20px;top:20px;padding:6px 22px 8px;font-size:34px;transform:rotate(-2deg)">${sc.label.replace(/^(\d)\s+/, '<span style="display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#ff4d4d;color:#fff;border:3px solid #2d2d2d;font-size:28px">$1</span>')}</div>`, `label-${sc.id}.png`, { selector: '#l' });
}
// small labels for the parts of the last montage, and badges
const SMALL = { 'sub-quiz': 'A quiz from the page', 'sub-progress': 'Progress, with Gemini\'s suggestions', 'sub-films': 'A chapter film for the class', 'sub-dev': 'Inside a school\'s own website', 'badge-speed': 'Shown at 1.6 times the speed', 'badge-live': 'Gemini Live: a voice tutor', 'badge-gemini': 'Built by Gemini, checked against the page', 'badge-embed': 'Gemini Embedding + Firestore', 'badge-character': 'Gemini Live, in the character\'s voice' };
for (const [k, t] of Object.entries(SMALL)) await shot(`<div id="b" class="postit" style="position:absolute;left:20px;top:20px;padding:4px 18px 6px;font-size:28px;font-weight:400;font-family:'Patrick Hand';background:#fff;transform:rotate(1.5deg)"><span style="width:14px;height:14px;border-radius:50%;background:#ff4d4d;border:2px solid #2d2d2d"></span>${t}</div>`, `${k}.png`, { selector: '#b' });

// captions: the narrator's lines, and what the app's voices say (with who says it)
const cap = (text, who = '') => `<div id="c" style="position:absolute;left:20px;top:20px;max-width:1500px;padding:12px 34px 14px;background:#fff;border:3px solid #2d2d2d;border-radius:15px 255px 15px 225px / 225px 15px 255px 15px;box-shadow:5px 5px 0 #2d2d2d;font-size:40px;line-height:1.25;text-align:center">${who ? `<b style="font-family:Kalam;color:#2d5da1;margin-right:12px">${who}</b>` : ''}${text}</div>`;
for (const sc of script.scenes) for (const [i, line] of sc.lines.entries()) await shot(cap(line), `cap-${sc.id}-${i}.png`, { selector: '#c' });
const APP = JSON.parse(fs.readFileSync(new URL('./app-lines2.json', import.meta.url), 'utf8'));
for (const [k, v] of Object.entries(APP)) await shot(cap(v.text, v.who ? `${v.who}:` : ''), `capx-${k}.png`, { selector: '#c' });

// the placeholder notes: what to film on a real phone, and how long
const NOTES = {
  P1: ['Your phone video here (P1)', 'Over your shoulder: the printed page on the desk, the phone above it. Tap "Bring it to life" and keep the page in view. About 12 seconds.'],
  P2: ['Your phone video here (P2)', 'A printed science page. Tap "Bring it to life", then tilt the phone a little: the drawing stays on the paper. About 6 seconds.'],
  P3: ['Optional: your phone video here (P3)', 'The same moment on a phone: tap a choice, or tap "Talk to Dog-Spirit" and ask out loud. About 6 seconds.'],
  P4: ['Your phone video here (P4)', 'Two phones over two pages of the same story. Tap both at about the same time. Both play the same film. About 8 seconds.'],
};
for (const [k, [head, line]] of Object.entries(NOTES)) await shot(`<div id="n" style="position:absolute;left:20px;top:20px;width:1180px;padding:12px 26px 14px;background:#ff4d4d;color:#fff;border:4px solid #2d2d2d;border-radius:12px 255px 12px 225px / 225px 12px 255px 12px;box-shadow:6px 6px 0 #2d2d2d;transform:rotate(-0.6deg)"><div style="font-family:Kalam;font-weight:700;font-size:38px;line-height:1.1">${head}</div><div style="font-size:27px;line-height:1.25;margin-top:4px">${line}</div></div>`, `note-${k}.png`, { selector: '#n' });

// the title and end cards
await shot(`
<div class="paper" style="position:absolute;inset:0"></div>
<div style="position:absolute;left:150px;top:130px;width:960px">
  <div style="display:flex;align-items:center;gap:14px;font-family:Kalam;font-weight:700;font-size:40px;transform:rotate(-2deg)"><span style="width:30px;height:40px;border:4px solid #2d2d2d;border-radius:4px 10px 10px 4px;background:#fff9c4"></span>Living Textbook</div>
  <div class="postit" style="margin-top:50px;padding:6px 20px;font-size:30px;background:#ff4d4d;color:#fff;transform:rotate(-2deg)"><span style="width:14px;height:14px;border-radius:50%;background:#fff"></span>AR: moving pictures on your real book</div>
  <h1 style="font-family:Kalam;font-weight:700;font-size:128px;line-height:1.05;margin:26px 0 0;white-space:nowrap">Any page,<br><span style="position:relative">alive<svg style="position:absolute;left:0;bottom:-6px;width:100%;height:34px" viewBox="0 0 200 24" preserveAspectRatio="none"><path d="M4 16 C 40 8, 90 6, 196 12" stroke="#ff4d4d" stroke-width="7" fill="none" stroke-linecap="round"/></svg></span><span style="color:#ff4d4d">!</span></h1>
  <p style="font-size:40px;color:rgba(45,45,45,.75);margin:50px 0 0;max-width:900px;line-height:1.3">A science page becomes a lesson with a tutor. A story page becomes a film you play. On the paper itself.</p>
</div>
<svg width="${W}" height="${H}" style="position:absolute;inset:0"><rect x="1200" y="70" width="540" height="870" rx="56" fill="#2d2d2d" transform="translate(12 12)"/><rect x="1200" y="70" width="540" height="870" rx="56" fill="#1d1d1d" stroke="#2d2d2d" stroke-width="6"/><rect x="1418" y="88" width="104" height="26" rx="13" fill="#000"/></svg>
`, 'title-base.png', { transparent: false });
const qr = await QRCode.toString(`${publicUrl}/scan`, { type: 'svg', margin: 0, color: { dark: '#2d2d2d', light: '#ffffff' } });
const chips = ['Gemini 4 Argon', 'Gemini Flash', 'Gemini Live', 'Gemini TTS', 'Gemini Omni', 'Nano Banana', 'Lyria', 'Gemini Embedding', 'Cloud Run', 'Firestore', 'BigQuery'];
await shot(`
<div class="paper" style="position:absolute;inset:0"></div>
<div style="position:absolute;inset:0;display:grid;place-items:center">
  <div style="display:grid;grid-template-columns:auto 360px;gap:90px;align-items:center">
    <div>
      <div style="display:flex;align-items:center;gap:16px;font-family:Kalam;font-weight:700;font-size:60px;transform:rotate(-2deg)"><span style="width:44px;height:58px;border:5px solid #2d2d2d;border-radius:5px 12px 12px 5px;background:#fff9c4"></span>Living Textbook</div>
      <h1 style="font-family:Kalam;font-weight:700;font-size:120px;margin:30px 0 10px;line-height:1">Any page, alive<span style="color:#ff4d4d">.</span></h1>
      <p style="font-size:40px;margin:0;color:rgba(45,45,45,.75)">Built with Gemini on Google Cloud</p>
      <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:34px;max-width:960px">
        ${chips.map((t, i) => `<span class="postit" style="padding:4px 16px 6px;font-size:26px;font-family:'Patrick Hand';font-weight:400;background:${i % 2 ? '#fff' : '#fff9c4'};transform:rotate(${i % 2 ? 1.4 : -1.2}deg)">${t}</span>`).join('')}
      </div>
    </div>
    <div style="display:grid;gap:18px;justify-items:center">
      <div style="padding:22px;background:#fff;border:4px solid #2d2d2d;border-radius:18px;box-shadow:8px 8px 0 #2d2d2d;width:340px;height:340px">${qr.replace('<svg', '<svg width="292" height="292"')}</div>
      <div class="postit" style="padding:6px 18px;font-size:30px">Scan to try it</div>
      <div style="font-size:21px;color:rgba(45,45,45,.75);text-align:center;white-space:nowrap">${publicUrl.replace(/^https?:\/\//, '')}</div>
    </div>
  </div>
</div>
<div style="position:absolute;right:40px;bottom:24px;font-size:22px;color:rgba(45,45,45,.55)">Narration: Gemini text-to-speech. Music: Lyria. Every app shot is a recording of the real app.</div>
`, 'end-card.png', { transparent: false });
fs.writeFileSync(path.join(out, 'geometry2.json'), JSON.stringify(GEO, null, 1));
await browser.close();
console.log('layers:', fs.readdirSync(L).length, 'files in', L);
