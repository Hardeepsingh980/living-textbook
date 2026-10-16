// Give a story more review rounds: its files are in eval/output/stories/<slug>; the last review's notes are applied,
// then each new version is reviewed and fixed again.
//   STORE=cloud ... pnpm exec tsx scripts/story-more.mts <slug> [--rounds 2]
import fs from 'node:fs';
import path from 'node:path';
import { store } from '../src/store.js';
import { makeStory } from '../src/story/make.js';
import type { StoryDoc } from '../src/story/types.js';

const argv = process.argv.slice(2);
const i = argv.indexOf('--rounds'); const rounds = i >= 0 ? Number(argv.splice(i, 2)[1]) : 2;
const slug = argv[0]!;
const work = path.resolve('../../eval/output/stories', slug);
const local = JSON.parse(fs.readFileSync(path.join(work, 'story.json'), 'utf8')) as StoryDoc;
const doc = (await store.getStory(local.id)) ?? local;
const t0 = Date.now();
const out = await makeStory({ resume: doc, owner: doc.owner, work, rounds, log: (m) => console.log(`[${slug} +${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`) });
fs.writeFileSync(path.join(work, 'story.json'), JSON.stringify(out, null, 1));
for (const r of out.reviews) console.log(`  round ${r.round}: overall ${r.overall}${r.applied?.length ? ` | applied: ${r.applied.join(' | ').slice(0, 300)}` : ''}`);
console.log(`${slug}: ${out.status}, cost $${out.cost.usd.toFixed(2)}`);
process.exit(0);
