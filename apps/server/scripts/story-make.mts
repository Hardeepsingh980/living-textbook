// Make a story alive from page images, with the review rounds, and keep every round's film and review.
//   STORE=cloud GCS_BUCKET=... FIRESTORE_DB=... LB_USE_GCLOUD_TOKEN=1 pnpm exec tsx scripts/story-make.mts <slug> <page images...> [--rounds 3] [--owner dev-demo]
// Output: eval/output/stories/<slug>/ (plan.json, the frames, clips and voices, film-r<n>.mp4, review-r<n>.json, story.json)
import fs from 'node:fs';
import path from 'node:path';
import { makeStory } from '../src/story/make.js';

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv.splice(i, 2)[1]! : d; };
const rounds = Number(opt('rounds', '3')), owner = opt('owner', 'dev-demo'), id = opt('id', '');
const [slug, ...pageFiles] = argv;
if (!slug || !pageFiles.length) { console.error('usage: story-make.mts <slug> <page images...> [--rounds 3] [--owner dev-demo]'); process.exit(1); }
const work = path.resolve('../../eval/output/stories', slug);
const t0 = Date.now();
const doc = await makeStory({ pages: pageFiles.map((f) => fs.readFileSync(f)), owner, work, rounds, id: id || undefined, log: (m) => console.log(`[${slug} ${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`) });
fs.writeFileSync(path.join(work, 'story.json'), JSON.stringify(doc, null, 1));
console.log(`\n${slug}: story ${doc.id} "${doc.title}" ${doc.status}`);
for (const r of doc.reviews) console.log(`  round ${r.round}: overall ${r.overall} (${Object.entries(r.scores).map(([k, v]) => `${k} ${v}`).join(', ')})${r.applied?.length ? `\n    applied: ${r.applied.join(' | ')}` : ''}`);
console.log(`  film ${doc.film?.url} ${((doc.film?.ms ?? 0) / 1000).toFixed(1)} s, cost $${doc.cost.usd.toFixed(2)}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(0);
