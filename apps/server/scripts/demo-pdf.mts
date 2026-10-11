// The printable demo pack: an instruction and index page (with a QR code to the app), then the chosen NCERT pages
// themselves, taken as vector pages from the original chapter PDFs so they print sharp.
//   pnpm exec tsx scripts/demo-pdf.mts <judged.json[,judged2.json,...]> <chapter-pdf-dir> <out.pdf> [count=20] [appUrl]
// With several judged files (one per round), every page is ranked by its mean score over the rounds it appears in,
// so the pack favours pages that come alive well every time, not once.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chapterInfo } from '../src/pages.js';
const run = promisify(execFile);
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const QRCode = require('qrcode');
const [judgedFile, pdfDir, out, countArg = '20', appUrl = 'https://living-book-945707801757.asia-south1.run.app/scan'] = process.argv.slice(2);
const rounds: any[][] = await Promise.all(judgedFile!.split(',').map(async (f) => JSON.parse(await fs.readFile(f, 'utf8'))));
const byPage = new Map<string, any[]>();
for (const round of rounds) for (const j of round) { if (!j.id || j.verification === 'failed') continue; const k = j.file; if (!byPage.has(k)) byPage.set(k, []); byPage.get(k)!.push(j); }
const words = (t: string) => new Set(String(t).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const similar = (a: string, b: string) => { const A = words(a), B = words(b); if (!A.size || !B.size) return false; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size) >= 0.6; };
const ranked = [...byPage.entries()].map(([file, runs]) => {
  const best = runs.reduce((a, b) => (b.score > a.score ? b : a));
  const mean = runs.reduce((a, r) => a + r.score, 0) / runs.length;
  return { ...best, file, mean: Math.round(mean * 10) / 10, runs: runs.length, demoRuns: runs.filter((r) => r.verdict === 'demo').length };
}).sort((a, b) => b.mean - a.mean || b.score - a.score);
const top: any[] = [];
for (const r of ranked) { if (top.length >= Number(countArg)) break; if (top.some((t) => similar(t.concept, r.concept))) continue; top.push(r); }
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'lb-demo-pdf-'));
const CLASS: Record<string, string> = { g: '7', h: '8', i: '9', j: '10' };
const book = (code: string) => (code.slice(1, 4) === 'emh' ? 'Mathematics' : 'Science');
// chapter titles, read once per chapter from its first page
const chapters = new Map<string, string>();
for (const code of new Set(top.map((t) => t.file.split('-')[0]))) {
  try {
    const first = path.join(work, `${code}-first`);
    await run('pdftoppm', ['-r', '90', '-f', '1', '-l', '1', '-jpeg', path.join(pdfDir!, `${code}.pdf`), first]);
    const img = (await fs.readdir(work)).find((f) => f.startsWith(`${code}-first`))!;
    chapters.set(code, (await chapterInfo([await fs.readFile(path.join(work, img))])).title);
  } catch { chapters.set(code, ''); }
}
const rows = top.map((t, k) => {
  const [code, pg] = t.file.split('-'); const page = Number(pg);
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const titleCase = (x: string) => (x === x.toUpperCase() ? x.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(And|Of|The|In|On|To)\b/g, (m, w, i) => (i ? w.toLowerCase() : w)) : x);
  return { n: k + 1, code, page, cls: CLASS[code[0]] ?? '', book: book(code), chapterNo: Number(code.slice(-2)), chapter: titleCase(chapters.get(code) ?? ''), concept: cap(t.concept), moves: cap(String(t.what_moves ?? '').split(/,? (?:but|then stays|then remains|while the rest|though)\b|; /i)[0]!.trim().replace(/[.,;]$/, '')), score: t.mean ?? t.score, runs: t.runs ?? 1, demo: (t.demoRuns ?? (t.verdict === 'demo' ? 1 : 0)) > 0, alive: t.alive_seconds, id: t.id };
});
const qr = await QRCode.toString(appUrl, { type: 'svg', margin: 1, color: { dark: '#2d2d2d', light: '#ffffff' } });
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Patrick+Hand&display=block" rel="stylesheet"><style>
@page{size:A4;margin:11mm 12mm}
body{font-family:"Patrick Hand",sans-serif;color:#2d2d2d;font-size:11.5pt;margin:0}
h1{font-family:Kalam;font-weight:700;font-size:26pt;margin:0 0 2mm;line-height:1.05}
h1 .dot{color:#ff4d4d}
.top{display:flex;gap:8mm;align-items:flex-start;margin-bottom:3mm}
.top .qr{flex:none;width:32mm;border:2px solid #2d2d2d;border-radius:4mm 10mm 4mm 9mm/9mm 4mm 10mm 4mm;padding:2mm;box-shadow:2px 2px 0 #2d2d2d}
.top .qr svg{display:block;width:100%;height:auto}
.top .qr div{text-align:center;font-family:Kalam;font-size:10pt;margin-top:1mm}
.lede{font-size:14pt;color:#555;margin:0 0 3mm}
ol.how{margin:0;padding-left:5mm;font-size:11.5pt;line-height:1.3}
ol.how b{font-family:Kalam}
table{width:100%;border-collapse:collapse;font-size:9.6pt;margin-top:2mm}
th{font-family:Kalam;text-align:left;border-bottom:2px solid #2d2d2d;padding:1.5mm 1.5mm}
td{border-bottom:1px dashed #b9b2a7;padding:0.8mm 1.4mm;vertical-align:top;line-height:1.16}
td.pg{font-family:Kalam;white-space:nowrap;text-align:center}
td.n{font-family:Kalam;font-weight:700;width:7mm}
td.t b{font-family:Kalam}
td.s{white-space:nowrap;text-align:right;font-family:Kalam}
.star{display:inline-block;background:#ff4d4d;color:#fff;border-radius:3mm 6mm 3mm 5mm/5mm 3mm 6mm 3mm;padding:0 1.6mm;font-size:9pt;margin-left:1mm}
.small{color:#666;font-size:9pt}
.foot{margin-top:3mm;color:#666;font-size:10pt}
</style></head><body>
<div class="top"><div style="flex:1"><h1>Living Textbook demo pages<span class="dot">.</span></h1>
<p class="lede">${rows.length} NCERT pages that came alive best and most reliably in testing. Print the pack, then point a phone at any page.</p>
<ol class="how"><li><b>Open the app</b> on a phone: scan the code, allow the camera.</li><li><b>Lay the page flat</b> in good light and fit the whole page in the frame. Hold still for a moment.</li><li><b>Watch it come alive</b> on the paper. The tutor starts teaching; ask it anything out loud, or tap <b>What if?</b></li><li><b>Take the Quiz</b> at the end. Sign in with Google to keep the score.</li></ol></div>
<div class="qr">${qr}<div>open the app</div></div></div>
<table><thead><tr><th>#</th><th>Sheet</th><th>Page</th><th>What comes alive</th><th>Rating</th></tr></thead><tbody>
${rows.map((r) => `<tr><td class="n">${r.n}</td><td class="pg">__SHEET_${r.n}__</td><td class="t"><b>${esc(r.concept)}</b><br><span class="small">Class ${r.cls} ${r.book}, ch. ${r.chapterNo}${r.chapter ? ` (${esc(r.chapter)})` : ''}, page ${r.page} of the chapter</span></td><td>${esc(r.moves)}</td><td class="s">${Number(r.score).toFixed(1)}${r.demo ? '<span class="star">demo</span>' : ''}</td></tr>`).join('')}
</tbody></table>
<div class="foot">Ratings: each page was generated and recorded more than once; Gemini watched every recording (picture and voice) and scored placement, motion, clarity, correctness, narration and wow out of 10. The rating is the average over the runs; <b>demo</b> marks pages Gemini judged ready to show. The app makes a fresh lesson every time a page is scanned, so results vary a little. Sheet = page number in this PDF. Pages from NCERT textbooks (ncert.nic.in), printed for classroom testing.</div>
</body></html>`;
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
const cover = path.join(work, 'cover.pdf');
const render = async (h: string) => { await page.setContent(h, { waitUntil: 'networkidle' }); await page.evaluate('document.fonts.ready'); await page.pdf({ path: cover, format: 'A4', printBackground: true, preferCSSPageSize: true }); };
await render(html.replace(/__SHEET_(\d+)__/g, '00'));
const coverPages = Number((await run('pdfinfo', [cover])).stdout.match(/Pages:\s+(\d+)/)?.[1] ?? 1);
await render(html.replace(/__SHEET_(\d+)__/g, (_m, n) => String(coverPages + Number(n))));
await browser.close();
const parts = [cover];
// each page is rewritten by cairo as a fresh vector PDF: several NCERT files carry an (all-permissions) encryption that
// would otherwise stop the pages being merged
for (const r of rows) { const f = path.join(work, `p${String(r.n).padStart(2, '0')}.pdf`); await run('pdftocairo', ['-pdf', '-f', String(r.page), '-l', String(r.page), path.join(pdfDir!, `${r.code}.pdf`), f]); parts.push(f); }
await fs.mkdir(path.dirname(out!), { recursive: true });
await run('pdfunite', [...parts, out!]);
await fs.writeFile(out!.replace(/\.pdf$/, '.json'), JSON.stringify(rows, null, 1));
const pages = (await run('pdfinfo', [out!])).stdout.match(/Pages:\s+(\d+)/)?.[1];
console.log(`saved ${out}: ${pages} pages (${((await fs.stat(out!)).size / 1e6).toFixed(1)} MB)`);
for (const r of rows) console.log(`${String(r.n).padStart(2)}. ${r.concept} | class ${r.cls} ${r.book} ch ${r.chapterNo} p${r.page} | ${r.score}`);
await fs.rm(work, { recursive: true, force: true });
process.exit(0);
