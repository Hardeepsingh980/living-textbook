// Which pages of a textbook chapter are worth bringing to life? Each page image is scored by the quick model.
//   LB_USE_GCLOUD_TOKEN=1 pnpm exec tsx scripts/pick-pages.mts <pages-dir> <out.json>
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { generateJson, imagePart } from '../src/gemini.js';
const [dir, out] = process.argv.slice(2);
const files = (await fs.readdir(dir!)).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
const results: any[] = [];
const system = `You judge one printed textbook page for an app that animates the page's own diagram on the page (a moving diagram, live values, a short spoken lesson). Return JSON: {"score": 0-10, "concept": "<the main concept on this page, 3-8 words>", "subject": "<physics|chemistry|biology|maths|other>", "figure": "<what the main diagram shows, or 'none'>", "why": "<one short line>"}. Score 9-10: a clear central diagram of a dynamic process or quantitative relation (a pendulum, a circuit, a ray diagram, a graph, forces on a body, a geometric construction with a theorem) with the numbers or steps to animate. Score 5-7: a figure but mostly static (apparatus photo, table). Score 0-3: text only, exercises, chapter openers, summaries, questions, or decorative pictures.`;
let i = 0;
const limit = 4; // in flight
await Promise.all(Array.from({ length: limit }, async () => {
  while (i < files.length) {
    const f = files[i++]!;
    try {
      const jpeg = await sharp(path.join(dir!, f)).resize({ width: 900 }).jpeg({ quality: 80 }).toBuffer();
      const r = await generateJson<any>({ model: 'quick', system, parts: [imagePart(jpeg)], maxTokens: 200, temperature: 0.1, label: 'pick', mediaResolution: 'low' });
      results.push({ file: f, ...r.json });
      console.log(`${f}: ${r.json.score} ${r.json.concept} (${r.json.subject})`);
    } catch (e: any) { console.log(`${f}: failed ${String(e?.message).slice(0, 80)}`); }
  }
}));
results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
await fs.writeFile(out!, JSON.stringify(results, null, 1));
console.log(`wrote ${out}: ${results.length} pages, ${results.filter((r) => r.score >= 8).length} scored 8+`);
