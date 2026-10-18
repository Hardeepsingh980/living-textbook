// Probe: the top page-index scores for a few images (no thresholds), as scans and as "phone photos", to set the
// match thresholds. Prints the best page and the best page of any other story.
import fs from 'node:fs';
import sharp from 'sharp';
import { embedPage } from '../../src/story/pages.js';
import { store } from '../../src/store.js';
const all = await store.listPageEntries();
const cos = (a: number[], b: number[]) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i]! * b[i]!; x += a[i]! ** 2; y += b[i]! ** 2; } return d / Math.sqrt(x * y); };
const photo = (b: Buffer) => sharp(b).rotate(-6, { background: '#6d5d48' }).resize(1100).modulate({ brightness: 0.8 }).blur(1).extract({ left: 30, top: 50, width: 1000, height: 1250 }).jpeg({ quality: 72 }).toBuffer().catch(() => sharp(b).resize(1000).jpeg({ quality: 72 }).toBuffer());
for (const f of process.argv.slice(2)) {
  const raw = fs.readFileSync(f);
  const row: string[] = [];
  for (const [kind, img] of [['scan', raw], ['photo', await photo(raw)]] as const) {
    const v = await embedPage(img);
    const s = all.map((e) => ({ e, s: cos(v, e.vector) })).sort((a, b) => b.s - a.s);
    const other = s.find((x) => x.e.storyId !== s[0]!.e.storyId)!;
    row.push(`${kind} ${s[0]!.e.title.slice(0, 10)} p${s[0]!.e.page} ${s[0]!.s.toFixed(3)} / other ${other.s.toFixed(3)}`);
  }
  console.log(f.split('/').pop()!.padEnd(34), row.join('   '));
}
process.exit(0);
