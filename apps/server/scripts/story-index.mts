// Put existing stories' pages into the shared page index (stories made from now on index themselves).
//   STORE=cloud ... pnpm exec tsx scripts/story-index.mts [storyId ...]      (no ids: every ready story of dev-demo)
import { store } from '../src/store.js';
import { indexStoryPages } from '../src/story/pages.js';

const ids = process.argv.slice(2);
const docs = ids.length ? (await Promise.all(ids.map((id) => store.getStory(id)))).filter((d) => !!d) : (await store.listStories('dev-demo', 200)).filter((d) => d.status === 'ready');
for (const doc of docs) {
  const pages: Buffer[] = [];
  for (let i = 0; i < doc!.pages.length; i++) { const f = await store.getFile(doc!.id, `page-${i}.jpg`); if (f) pages.push(f.bytes); }
  const t0 = Date.now();
  const n = await indexStoryPages(doc!, pages);
  console.log(`${doc!.title}: ${n} pages indexed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
process.exit(0);
