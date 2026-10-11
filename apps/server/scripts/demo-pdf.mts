// The printable demo pack: an instruction and index page (with a QR code to the app), then the chosen NCERT pages
// themselves, taken as vector pages from the original chapter PDFs so they print sharp.
//   pnpm exec tsx scripts/demo-pdf.mts <judged.json> <chapter-pdf-dir> <out.pdf> [count=20] [appUrl]
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
const judged: any[] = JSON.parse(await fs.readFile(judgedFile!, 'utf8'));
const top = judged.filter((j) => j.verification !== 'failed' && j.verdict !== 'skip').slice(0, Number(countArg));
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
  return { n: k + 1, code, page, cls: CLASS[code[0]] ?? '', book: book(code), chapterNo: Number(code.slice(-2)), chapter: chapters.get(code) ?? '', concept: t.concept, moves: t.what_moves, score: t.score };
});
const qr = await QRCode.toString(appUrl, { type: 'svg', margin: 1, color: { dark: '#2d2d2d', light: '#ffffff' } });
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Patrick+Hand&display=block" rel="stylesheet"><style>
@page{size:A4;margin:14mm 13mm}
body{font-family:"Patrick Hand",sans-serif;color:#2d2d2d;font-size:12.5pt;margin:0}
h1{font-family:Kalam;font-weight:700;font-size:30pt;margin:0 0 2mm;line-height:1.05}
h1 .dot{color:#ff4d4d}
.top{display:flex;gap:8mm;align-items:flex-start;margin-bottom:5mm}
.top .qr{flex:none;width:36mm;border:2px solid #2d2d2d;border-radius:4mm 10mm 4mm 9mm/9mm 4mm 10mm 4mm;padding:2mm;box-shadow:2px 2px 0 #2d2d2d}
.top .qr svg{display:block;width:100%;height:auto}
.top .qr div{text-align:center;font-family:Kalam;font-size:10pt;margin-top:1mm}
.lede{font-size:14pt;color:#555;margin:0 0 3mm}
ol.how{margin:0;padding-left:5mm;font-size:12.5pt;line-height:1.35}
ol.how b{font-family:Kalam}
table{width:100%;border-collapse:collapse;font-size:11pt;margin-top:3mm}
th{font-family:Kalam;text-align:left;border-bottom:2px solid #2d2d2d;padding:1.5mm 1.5mm}
td{border-bottom:1px dashed #b9b2a7;padding:1.4mm 1.5mm;vertical-align:top;line-height:1.25}
td.n{font-family:Kalam;font-weight:700;width:7mm}
td.t b{font-family:Kalam}
td.s{white-space:nowrap;text-align:right;font-family:Kalam}
.small{color:#666;font-size:10pt}
.foot{margin-top:3mm;color:#666;font-size:10pt}
</style></head><body>
<div class="top"><div style="flex:1"><h1>Living Textbook: demo pages<span class="dot">.</span></h1>
<p class="lede">${rows.length} NCERT pages that came alive best in testing. Print them, then point a phone at any one.</p>
<ol class="how"><li><b>Open the app</b> on a phone: scan the code, allow the camera.</li><li><b>Lay the page flat</b> in good light and fit the whole page in the frame. Hold still for a moment.</li><li><b>Watch it come alive</b> on the paper. The tutor starts teaching; ask it anything out loud, or tap <b>What if?</b></li><li><b>Take the Quiz</b> at the end. Sign in with Google to keep the score.</li></ol></div>
<div class="qr">${qr}<div>open the app</div></div></div>
<table><thead><tr><th>#</th><th>Page</th><th>What comes alive</th><th>Score</th></tr></thead><tbody>
${rows.map((r) => `<tr><td class="n">${r.n}</td><td class="t"><b>${esc(r.concept)}</b><br><span class="small">Class ${r.cls} ${r.book}, ch. ${r.chapterNo}${r.chapter ? ` (${esc(r.chapter)})` : ''}, page ${r.page} of the chapter</span></td><td>${esc(r.moves)}</td><td class="s">${r.score.toFixed(1)}</td></tr>`).join('')}
</tbody></table>
<div class="foot">Scores: Gemini watched each recorded lesson (picture and voice) and rated placement, motion, clarity, correctness, narration and wow, out of 10. Pages from NCERT textbooks (ncert.nic.in), printed here for classroom testing.</div>
</body></html>`;
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate('document.fonts.ready');
const cover = path.join(work, 'cover.pdf');
await page.pdf({ path: cover, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
const parts = [cover];
for (const r of rows) { const f = path.join(work, `p${String(r.n).padStart(2, '0')}.pdf`); await run('pdfseparate', ['-f', String(r.page), '-l', String(r.page), path.join(pdfDir!, `${r.code}.pdf`), f]); parts.push(f); }
await fs.mkdir(path.dirname(out!), { recursive: true });
await run('pdfunite', [...parts, out!]);
await fs.writeFile(out!.replace(/\.pdf$/, '.json'), JSON.stringify(rows, null, 1));
const pages = (await run('pdfinfo', [out!])).stdout.match(/Pages:\s+(\d+)/)?.[1];
console.log(`saved ${out}: ${pages} pages (${((await fs.stat(out!)).size / 1e6).toFixed(1)} MB)`);
for (const r of rows) console.log(`${String(r.n).padStart(2)}. ${r.concept} | class ${r.cls} ${r.book} ch ${r.chapterNo} p${r.page} | ${r.score}`);
await fs.rm(work, { recursive: true, force: true });
process.exit(0);
