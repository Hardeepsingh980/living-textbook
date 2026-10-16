// Finish a story made by story-make.mts: write the music if Lyria refused it the first time, render the film again
// from the latest clips and voices (with the current renderer), and save it as the story's film. Nothing is filmed again.
//   STORE=cloud ... pnpm exec tsx scripts/story-finish.mts <slug> [--review]   (--review also asks the reviewer once more)
import fs from 'node:fs';
import path from 'node:path';
import { store } from '../src/store.js';
import { compose } from '../src/story/media.js';
import { renderFilm } from '../src/story/film.js';
import { reviewFilm } from '../src/story/review.js';
import type { StoryDoc, StoryShot } from '../src/story/types.js';

const [slug, ...flags] = process.argv.slice(2);
const work = path.resolve('../../eval/output/stories', slug!);
const local = JSON.parse(fs.readFileSync(path.join(work, 'story.json'), 'utf8')) as StoryDoc;
let doc = (await store.getStory(local.id)) ?? local;
const spend = (m: string, usd: number) => { doc.cost.usd += usd; doc.cost.byModel[m] = (doc.cost.byModel[m] ?? 0) + usd; };
const file = (url?: string) => { const f = url ? path.join(work, path.basename(url)) : ''; return f && fs.existsSync(f) ? f : null; };
if (!doc.music?.url) {
  const m = await compose(doc.music?.prompt ?? "gentle instrumental music for a children's story", spend);
  fs.writeFileSync(path.join(work, 'music.wav'), m);
  doc.music = { prompt: doc.music?.prompt ?? '', url: await store.putFile(doc.id, 'music.wav', m, 'audio/wav') };
  console.log('music written');
}
const shots: StoryShot[] = [...doc.shots, ...doc.choices.flatMap((c) => c.options.flatMap((o) => o.shots))];
const lines = [...shots.flatMap((s) => s.lines), ...doc.choices.flatMap((c) => [c.question, ...c.options.map((o) => o.rejoin).filter((x) => !!x)])];
const assets = {
  clip: (id: string) => file(shots.find((s) => s.id === id)?.clipUrl),
  still: (id: string) => file(shots.find((s) => s.id === id)?.keyframeUrl),
  voice: (id: string) => file(lines.find((l) => l?.id === id)?.audioUrl),
  music: file(doc.music?.url),
  quiet: (id: string) => !!shots.find((s) => s.id === id)?.clipMuted,
};
const out = path.join(work, 'film-final.mp4'), preview = path.join(work, 'film-final-review.mp4');
const { seconds, segments } = await renderFilm(doc, assets, out, { work: path.join(work, 'render-final'), preview, tune: doc.mix ? { music: doc.mix.music, ambient: doc.mix.ambient } : undefined, holds: doc.mix?.holds, intro: { page: path.join(work, 'page-0.jpg') } });
const url = await store.putFile(doc.id, `film-final-${Date.now().toString(36)}.mp4`, fs.readFileSync(out), 'video/mp4');
doc.film = { url, ms: Math.round(seconds * 1000), poster: doc.film?.poster ?? shots[0]?.keyframeUrl };
if (flags.includes('--review')) {
  const pages = doc.pages.map((_, i) => fs.readFileSync(path.join(work, `page-${i}.jpg`)));
  const r = await reviewFilm({ doc, film: fs.readFileSync(preview), pages, segments, round: doc.reviews.length + 1, filmUrl: url, spend });
  fs.writeFileSync(path.join(work, `review-final.json`), JSON.stringify(r, null, 1));
  doc.reviews = [...doc.reviews, r];
  console.log(`final review: ${r.overall} | ${r.summary}`);
}
await store.putStory({ ...doc, updatedAt: Date.now() });
fs.writeFileSync(path.join(work, 'story.json'), JSON.stringify(doc, null, 1));
console.log(`${slug}: film ${seconds.toFixed(1)} s -> ${url}`);
process.exit(0);
