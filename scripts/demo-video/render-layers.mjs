// The demo video's still layers, drawn in the app's own hand-drawn style and photographed by Chromium: the paper
// background, the browser window around the app (its content area is a hole the footage shows through), scene
// labels, caption cards for every voice line, the AR scene's card frames, and the title and end cards.
//   node scripts/demo-video/render-layers.mjs <out dir> <public url>
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
const script = JSON.parse(fs.readFileSync(new URL('./script.json', import.meta.url), 'utf8'));
const W = 1920, H = 1080;
// the window: content 1600×900 at (160, 82), a 46 px bar above it
const WIN = { x: 160, y: 36, w: 1600, bar: 46, h: 900 };
fs.writeFileSync(path.join(out, 'geometry.json'), JSON.stringify({ W, H, content: { x: WIN.x, y: WIN.y + WIN.bar, w: WIN.w, h: WIN.h } }));

const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Patrick+Hand&display=swap" rel="stylesheet">';
const BASE = `
:root { --paper:#fdfbf7; --deep:#e5e0d8; --pencil:#2d2d2d; --soft:rgba(45,45,45,.62); --marker:#ff4d4d; --pen:#2d5da1; --postit:#fff9c4; --white:#fff; }
* { box-sizing: border-box; } html, body { margin:0; width:${W}px; height:${H}px; font-family:'Patrick Hand',system-ui,sans-serif; color:var(--pencil); background:transparent; }
.paper { background-color:var(--paper); background-image:radial-gradient(var(--deep) 1.3px, transparent 1.3px); background-size:28px 28px; }
.postit { display:inline-flex; align-items:center; gap:12px; background:var(--postit); border:3px solid var(--pencil); border-radius:12px 255px 12px 225px / 225px 12px 255px 12px; box-shadow:4px 4px 0 var(--pencil); font-family:'Kalam'; font-weight:700; }
`;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
async function shot(html, file, { selector = null, transparent = true } = {}) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE}</style></head><body>${html}</body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const target = selector ? page.locator(selector) : page;
  await target.screenshot({ path: path.join(L, file), omitBackground: transparent });
}

// 1. the paper
await shot('<div class="paper" style="width:100%;height:100%"></div>', 'bg.png', { transparent: false });

// 2. the window: paper everywhere except the content (a hole), a pencil border, the bar, a hard shadow
const r = 18, cx = WIN.x, cy = WIN.y + WIN.bar, cw = WIN.w, ch = WIN.h;
const hole = `M${cx} ${cy} H${cx + cw} V${cy + ch - r} Q${cx + cw} ${cy + ch} ${cx + cw - r} ${cy + ch} H${cx + r} Q${cx} ${cy + ch} ${cx} ${cy + ch - r} Z`;
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

// 3. scene labels: a post-it at the window's top left
for (const sc of script.scenes) {
  if (!sc.label) continue;
  await shot(`<div id="l" class="postit" style="position:absolute;left:20px;top:20px;padding:6px 22px 8px;font-size:34px;transform:rotate(-2deg)">${sc.label.replace(/^(\d)\s+/, '<span style="display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#ff4d4d;color:#fff;border:3px solid #2d2d2d;font-size:28px">$1</span>')}</div>`, `label-${sc.id}.png`, { selector: '#l' });
}

// 4. captions: one card per voice line (and the student's question)
const cap = (text, who = '') => `<div id="c" style="position:absolute;left:20px;top:20px;max-width:1500px;padding:12px 34px 14px;background:#fff;border:3px solid #2d2d2d;border-radius:15px 255px 15px 225px / 225px 15px 255px 15px;box-shadow:5px 5px 0 #2d2d2d;font-size:40px;line-height:1.25;text-align:center">${who ? `<b style="font-family:Kalam;color:#2d5da1;margin-right:12px">${who}</b>` : ''}${text}</div>`;
for (const sc of script.scenes) for (const [i, line] of sc.lines.entries()) await shot(cap(line), `cap-${sc.id}-${i}.png`, { selector: '#c' });
await shot(cap(script.question, 'Student:'), 'cap-question.png', { selector: '#c' });

// 5. small badges naming what does the work
const BADGES = { gemini: 'Built by Gemini, checked against the page', live: 'Gemini Live: a voice tutor', voice: 'You can talk to it', bigquery: 'BigQuery + Gemini', sdk: 'Embed SDK and REST API', lyria: '' };
for (const [k, t] of Object.entries(BADGES)) if (t) await shot(`<div id="b" class="postit" style="position:absolute;left:20px;top:20px;padding:4px 18px 6px;font-size:28px;font-weight:400;font-family:'Patrick Hand';background:#fff;transform:rotate(1.5deg)"><span style="width:14px;height:14px;border-radius:50%;background:#ff4d4d;border:2px solid #2d2d2d"></span>${t}</div>`, `badge-${k}.png`, { selector: '#b' });

// 6. the AR scene: shadows under the phone clips (opaque, with the paper), frames and tags over them (transparent)
const cards = [[260, 'Stays on the page', -2], [758, 'Numbers change live', 1.5], [1256, 'Any table works', -1]];
const CARD = { y: 118, w: 404, h: 700 };
await shot(`
<div class="paper" style="position:absolute;inset:0"></div>
<svg width="${W}" height="${H}" style="position:absolute;inset:0" xmlns="http://www.w3.org/2000/svg">
  ${cards.map(([x]) => `<rect x="${x + 12}" y="${CARD.y + 12}" width="${CARD.w}" height="${CARD.h}" rx="18" fill="#2d2d2d"/>`).join('')}
</svg>`, 'ar-under.png', { transparent: false });
await shot(`
<svg width="${W}" height="${H}" style="position:absolute;inset:0" xmlns="http://www.w3.org/2000/svg">
  ${cards.map(([x]) => `<rect x="${x - 2}" y="${CARD.y - 2}" width="${CARD.w + 4}" height="${CARD.h + 4}" rx="18" fill="none" stroke="#2d2d2d" stroke-width="6"/>`).join('')}
</svg>
${cards.map(([x, tag, rot]) => `<div class="postit" style="position:absolute;left:${x + 30}px;top:${CARD.y + CARD.h - 34}px;padding:4px 18px 6px;font-size:30px;transform:rotate(${rot}deg)">${tag}</div>`).join('')}
`, 'ar-over.png');
fs.writeFileSync(path.join(out, 'ar-geometry.json'), JSON.stringify(cards.map(([x]) => ({ x, y: CARD.y, w: CARD.w, h: CARD.h }))));

// 7. title and end cards
const qr = await QRCode.toString(publicUrl, { type: 'svg', margin: 0, color: { dark: '#2d2d2d', light: '#ffffff' } });
await shot(`
<div class="paper" style="position:absolute;inset:0"></div>
<div style="position:absolute;left:150px;top:140px;width:900px">
  <div style="display:flex;align-items:center;gap:14px;font-family:Kalam;font-weight:700;font-size:40px;transform:rotate(-2deg)"><span style="width:30px;height:40px;border:4px solid #2d2d2d;border-radius:4px 10px 10px 4px;background:#fff9c4"></span>Living Textbook</div>
  <div class="postit" style="margin-top:56px;padding:6px 20px;font-size:30px;background:#ff4d4d;color:#fff;transform:rotate(-2deg)"><span style="width:14px;height:14px;border-radius:50%;background:#fff"></span>AR: moving pictures on your real book</div>
  <h1 style="font-family:Kalam;font-weight:700;font-size:128px;line-height:1.05;margin:26px 0 0;white-space:nowrap">Your textbook,<br><span style="position:relative">alive<svg style="position:absolute;left:0;bottom:-6px;width:100%;height:34px" viewBox="0 0 200 24" preserveAspectRatio="none"><path d="M4 16 C 40 8, 90 6, 196 12" stroke="#ff4d4d" stroke-width="7" fill="none" stroke-linecap="round"/></svg></span><span style="color:#ff4d4d">!</span></h1>
  <p style="font-size:42px;color:rgba(45,45,45,.7);margin:56px 0 0;max-width:820px;line-height:1.3">Point your phone at a page of your textbook. The picture starts to move, and a tutor explains it.</p>
</div>
<svg width="${W}" height="${H}" style="position:absolute;inset:0"><rect x="1200" y="70" width="540" height="870" rx="56" fill="#2d2d2d" transform="translate(12 12)"/><rect x="1200" y="70" width="540" height="870" rx="56" fill="#1d1d1d" stroke="#2d2d2d" stroke-width="6"/><rect x="1418" y="88" width="104" height="26" rx="13" fill="#000"/></svg>
`, 'title-base.png', { transparent: false });
fs.writeFileSync(path.join(out, 'title-geometry.json'), JSON.stringify({ phone: { x: 1222, y: 126, w: 496, h: 792 } }));
await shot(`
<div class="paper" style="position:absolute;inset:0"></div>
<div style="position:absolute;inset:0;display:grid;place-items:center">
  <div style="display:grid;grid-template-columns:auto 360px;gap:90px;align-items:center">
    <div>
      <div style="display:flex;align-items:center;gap:16px;font-family:Kalam;font-weight:700;font-size:60px;transform:rotate(-2deg)"><span style="width:44px;height:58px;border:5px solid #2d2d2d;border-radius:5px 12px 12px 5px;background:#fff9c4"></span>Living Textbook</div>
      <h1 style="font-family:Kalam;font-weight:700;font-size:120px;margin:30px 0 10px;line-height:1">Any page, alive<span style="color:#ff4d4d">.</span></h1>
      <p style="font-size:40px;margin:0;color:rgba(45,45,45,.75)">Built with Gemini on Google Cloud</p>
      <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:34px;max-width:900px">
        ${['Gemini Flash reads and builds', 'Gemini Live tutor', 'Gemini voices', 'BigQuery progress', 'Cloud Run'].map((t, i) => `<span class="postit" style="padding:4px 16px 6px;font-size:26px;font-family:'Patrick Hand';font-weight:400;background:${i % 2 ? '#fff' : '#fff9c4'};transform:rotate(${i % 2 ? 1.4 : -1.2}deg)">${t}</span>`).join('')}
      </div>
    </div>
    <div style="display:grid;gap:18px;justify-items:center">
      <div style="padding:22px;background:#fff;border:4px solid #2d2d2d;border-radius:18px;box-shadow:8px 8px 0 #2d2d2d;width:340px;height:340px">${qr.replace('<svg', '<svg width="292" height="292"')}</div>
      <div class="postit" style="padding:6px 18px;font-size:30px">Scan to try it</div>
      <div style="font-size:21px;color:rgba(45,45,45,.75);text-align:center;white-space:nowrap">${publicUrl.replace(/^https?:\/\//, '')}</div>
    </div>
  </div>
</div>
<div style="position:absolute;right:40px;bottom:24px;font-size:22px;color:rgba(45,45,45,.55)">Narration: Gemini text-to-speech. Music: Lyria.</div>
`, 'end-card.png', { transparent: false });
await browser.close();
console.log('layers:', fs.readdirSync(L).length, 'files in', L);
