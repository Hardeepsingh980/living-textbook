// Probe: recognise story pages from "phone photos" (rotated, cropped, darker, blurred) with the shared page index.
import fs from 'node:fs';
import sharp from 'sharp';
import { matchPage } from '../../src/story/pages.js';
for (const f of process.argv.slice(2)) {
  const photo = await sharp(fs.readFileSync(f)).rotate(-6, { background: '#6d5d48' }).resize(1100).modulate({ brightness: 0.8 }).blur(1).extract({ left: 30, top: 50, width: 1000, height: 1250 }).jpeg({ quality: 72 }).toBuffer().catch(async () => sharp(fs.readFileSync(f)).resize(1000).jpeg({ quality: 72 }).toBuffer());
  const t0 = Date.now();
  const m = await matchPage(photo, { locate: true });
  console.log(`${f.split('/').pop()!.padEnd(28)} ${((Date.now() - t0) / 1000).toFixed(1)} s  ${m ? `${m.title} p${m.page} score ${m.score} ${m.exact ? 'EXACT' : 'same story'} box ${JSON.stringify(m.box)} pic ${m.picture}` : 'no match'}`);
}
process.exit(0);
