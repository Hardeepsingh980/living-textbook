// List a reader's stories (id, title, status, shots with clips, age) — and with --clean, hide stories left "making"
// by a run that was stopped (no update for 20 minutes).
//   STORE=cloud ... pnpm exec tsx scripts/story-list.mts [owner] [--clean]
import { store } from '../src/store.js';
const owner = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'dev-demo';
const clean = process.argv.includes('--clean');
const docs = await store.listStories(owner, 200);
for (const d of docs) {
  const mins = (Date.now() - d.updatedAt) / 60000;
  const clips = d.shots.filter((s) => s.clipUrl).length;
  console.log(`${d.id}  ${d.status.padEnd(7)} ${mins.toFixed(0).padStart(4)} min  ${clips}/${d.shots.length} clips  ${d.reviews.length} reviews  ${d.title}`);
  if (clean && d.status === 'making' && mins > 20) { await store.patchStory(d.id, { owner: `deleted-${owner}` }); console.log('   hidden'); }
}
process.exit(0);
