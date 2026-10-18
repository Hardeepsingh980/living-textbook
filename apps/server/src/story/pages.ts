// Story pages, recognised from a photo. Every page of every story is embedded with Gemini's multimodal embedding and
// kept in Firestore (shared by everyone), so whoever scans the same page, or another page of the same story, gets the
// story that already exists: no new generation, the same film for everyone. A borderline match is confirmed by a
// quick Gemini look, and the printed picture to play the film on is located in the photo.
import sharp from 'sharp';
import { clients, generateJson, imagePart } from '../gemini.js';
import { store } from '../store.js';
import type { StoryDoc } from './types.js';

export type PageEntry = {
  id: string; storyId: string; page: number; title: string; book?: string;
  vector: number[];
  /** the printed pictures on this page (index into the story's pictures, box in 0-1000 of the page image) */
  pictures: { index: number; box: [number, number, number, number]; shows: string }[];
  at: number;
};
export type PageMatch = {
  storyId: string; page: number; score: number; exact: boolean; title: string; status: string;
  /** where the printed picture to play the film on is in the photo, [ymin, xmin, ymax, xmax] in 0-1000, if found */
  box: [number, number, number, number] | null;
  picture: number | null;
};

const EMBED_MODEL = process.env.PAGE_EMBED_MODEL || 'gemini-embedding-2';
// measured on scans and on "phone photos" (turned, darker, blurred, cropped) of 5 stories: the page itself scores
// 0.94-0.99; another page of the same story 0.77-0.91, always 0.04-0.09 above any other story; a page of no story
// scores about the same against every story (0.01 apart at most). So the gap to the next story decides, and Gemini
// confirms anything that is not the page itself.
const EXACT = 0.93, NEAR = 0.76, MARGIN = 0.03;

/** A page photo (or a scan) as a 3072-number vector. */
export async function embedPage(image: Buffer): Promise<number[]> {
  const { ai } = await clients();
  const small = await sharp(image).rotate().resize(768, 768, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
  const r: any = await ai.models.embedContent({ model: EMBED_MODEL, contents: [{ role: 'user', parts: [imagePart(small)] }] as any });
  const v: number[] = r.embeddings?.[0]?.values ?? [];
  if (!v.length) throw new Error('no embedding');
  return v;
}

const cosine = (a: number[], b: number[]) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i]! * b[i]!; x += a[i]! * a[i]!; y += b[i]! * b[i]!; } return d / Math.sqrt(x * y || 1); };

let cache: { at: number; entries: PageEntry[] } | null = null;
async function entries(): Promise<PageEntry[]> {
  if (!cache || Date.now() - cache.at > 5 * 60_000) cache = { at: Date.now(), entries: await store.listPageEntries() };
  return cache.entries;
}

/** Put a story's pages into the shared index (called once the story is planned, so a second reader who scans the
 *  same page while it is being made gets this story, not a second one). */
export async function indexStoryPages(doc: StoryDoc, pages: Buffer[]): Promise<number> {
  let n = 0;
  for (const [i, b] of pages.entries()) {
    const vector = await embedPage(b);
    const pictures = doc.pictures.map((p, index) => ({ index, box: p.box, shows: p.shows, page: p.page })).filter((p) => p.page === i).map(({ page, ...p }) => p);
    const entry: PageEntry = { id: `${doc.id}-${i}`, storyId: doc.id, page: i, title: doc.title, book: doc.book, vector, pictures, at: Date.now() };
    await store.putPageEntry(entry);
    if (cache) cache.entries = [...cache.entries.filter((e) => e.id !== entry.id), entry];
    n++;
  }
  return n;
}

/** Which story is this photo a page of, if any: the page itself, or another page of the same story. */
export async function matchPage(photo: Buffer, opts: { locate?: boolean } = {}): Promise<PageMatch | null> {
  const all = await entries();
  if (!all.length) return null;
  const v = await embedPage(photo);
  const scored = all.map((e) => ({ e, s: cosine(v, e.vector) })).sort((a, b) => b.s - a.s);
  const best = scored[0]!;
  const other = scored.find((x) => x.e.storyId !== best.e.storyId)?.s ?? 0;
  if (best.s < NEAR || best.s - other < MARGIN) return null;
  const story = await store.getStory(best.e.storyId);
  if (!story || story.owner.startsWith('deleted-') || story.status === 'failed') return null;
  const exact = best.s >= EXACT;
  // between "another page of this story" and "a different book that looks alike": Gemini reads the photo to decide
  // (at the same time as it finds the picture, to save a second)
  const [same, located] = await Promise.all([
    exact ? true : sameStory(photo, story),
    opts.locate ? locatePicture(photo, story, exact ? best.e : null) : { box: null, picture: null },
  ]);
  if (!same) return null;
  return { storyId: story.id, page: best.e.page, score: Math.round(best.s * 1000) / 1000, exact, title: story.title, status: story.status, ...located };
}

async function sameStory(photo: Buffer, story: StoryDoc): Promise<boolean> {
  const cast = story.characters.map((c) => c.name).join(', ');
  const r = await generateJson<{ same: boolean }>({
    model: 'quick', label: 'page-same-story', maxTokens: 60, thinking: 'minimal', mediaResolution: 'low',
    system: 'You look at a photo of a book page and decide whether it is a page of a given story. Answer JSON {"same": true|false}.',
    parts: [imagePart(await sharp(photo).rotate().resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()), { text: `Is this a page of the story "${story.title}"${story.book ? ` (${story.book})` : ''}, with ${cast}? ${story.summary}` }],
    schema: { type: 'object', properties: { same: { type: 'boolean' } }, required: ['same'] },
  }).catch(() => null);
  return !!r?.json?.same;
}

/** Where, in the photo, is the printed picture the film should play on: the page's first picture that a shot starts
 *  from (or its largest picture). For a page that is not indexed, the main illustration on it. */
async function locatePicture(photo: Buffer, story: StoryDoc, entry: PageEntry | null): Promise<{ box: [number, number, number, number] | null; picture: number | null }> {
  const onPage = entry?.pictures ?? [];
  const used = onPage.find((p) => story.shots.some((s) => s.fromPicture === p.index)) ?? [...onPage].sort((a, b) => area(b.box) - area(a.box))[0];
  const want = used ? `the printed illustration that shows: ${used.shows}` : 'the main printed illustration (a drawing, not text)';
  const r = await generateJson<{ box: number[] | null }>({
    model: 'quick', label: 'page-locate', maxTokens: 120, thinking: 'minimal', mediaResolution: 'medium',
    system: 'You find one printed illustration in a photo of a book page. Answer JSON {"box": [ymin, xmin, ymax, xmax]} in 0-1000 of the photo, tight around the drawing only (not its caption or the text), or {"box": null} if there is none.',
    parts: [imagePart(await sharp(photo).rotate().resize(1280, 1280, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()), { text: `Find ${want}.` }],
  }).catch(() => null);
  const b = r?.json?.box;
  const box = Array.isArray(b) && b.length === 4 && b.every((x) => Number.isFinite(Number(x))) ? (b.map((x) => Math.max(0, Math.min(1000, Number(x)))) as [number, number, number, number]) : null;
  // a small mark (an icon in the margin) is not a picture to play a film on: the film then sits in the middle of the page
  const big = box && box[2] - box[0] >= 120 && box[3] - box[1] >= 120 && area(box) >= 30_000;
  return { box: big ? box : null, picture: used?.index ?? null };
}
const area = (b: number[]) => (b[2]! - b[0]!) * (b[3]! - b[1]!);
