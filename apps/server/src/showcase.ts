// The homepage's living samples: curated saved experiences any visitor can watch, and a small text preview of the
// tutor that answers questions about one of them with the quick model, grounded on the page's own text.
import { generateJson } from './gemini.js';
import { store } from './store.js';

export const SHOWCASE = {
  hero: { id: '9aee2e9b-606b-4086-bb15-1f872b687149', title: 'Motion and Time', slider: 'L' },
  explore: { id: '26361c93-7794-401c-99a7-9c4c6c9d30c9', title: 'Resistors in Series', slider: 'V' },
  ask: { id: '9aee2e9b-606b-4086-bb15-1f872b687149', title: 'Motion and Time' },
};
// pages the homepage shows in its gallery: the verified textbook samples
const GALLERY_IDS = ['9aee2e9b-606b-4086-bb15-1f872b687149', '26361c93-7794-401c-99a7-9c4c6c9d30c9', '376abcca-c784-459a-96d6-549b598a7314', '82071d9a-f9c4-449a-9ac4-0dc0e98f9db3', '582d7438-5ac7-4ed5-a8c6-2d8bd3a60e5b', 'd9f920c7-a321-43dd-9410-57ae8c618b15'];
type GalleryItem = { id: string; title: string; subject: string; pageImageUrl: string; verification?: string; moving: number };
// stories made alive that the homepage offers to play (fiction pages: a school reader, a comic, a folk tale)
const STORY_IDS: string[] = (process.env.SHOWCASE_STORIES || [
  '1c80f669-d6ff-470f-8a9d-8843b57ad02c', // The Ashes That Made Trees Bloom (NCERT Honeycomb, class 7)
  '1bdf54fc-5f20-4ff2-b24f-d481675c0a60', // The Tiger, the Brahman, and the Jackal (Indian Fairy Tales, 1892)
  '9c405f17-094a-41cc-96e0-81c4468afc39', // the stag at the pond (NCERT Honeycomb picture reading)
  '2d34f1b6-6f43-4ffc-b6e6-8ac88c836a04', // Gopal and the Hilsa-fish (NCERT Honeycomb, a comic)
  'f19b0659-9163-4f1a-b4eb-5bd5331fb03f', // Three Questions (Tolstoy, NCERT Honeycomb)
].join(',')).split(',').filter(Boolean);
type StoryItem = { id: string; title: string; book?: string; poster?: string; score?: number };
let galleryCache: { at: number; items: GalleryItem[]; stories: StoryItem[] } | null = null;
export async function showcase() {
  if (!galleryCache || Date.now() - galleryCache.at > 10 * 60_000) {
    const items: GalleryItem[] = [];
    for (const id of GALLERY_IDS) {
      const rec = await store.getRecord(id).catch(() => null);
      if (!rec) continue;
      const moving = rec.scene.elements.filter((e) => e.anim?.length || e.type === 'particles').length;
      items.push({ id, title: rec.quick.title, subject: rec.quick.subject, pageImageUrl: rec.page.imageUrl, verification: rec.verification?.status, moving });
    }
    const stories: StoryItem[] = [];
    for (const id of STORY_IDS) {
      const s = await store.getStory(id).catch(() => null);
      if (s?.status === 'ready') stories.push({ id, title: s.title, book: s.book, poster: s.film?.poster ?? s.shots[0]?.keyframeUrl, score: s.reviews.at(-1)?.overall });
    }
    galleryCache = { at: Date.now(), items, stories };
  }
  return { ...SHOWCASE, gallery: galleryCache.items, stories: galleryCache.stories };
}

// a handful of questions a minute per visitor keeps the preview cheap
const windows = new Map<string, number[]>();
function allowed(ip: string, limit = 8, perMs = 60_000) {
  const now = Date.now();
  const hits = (windows.get(ip) ?? []).filter((t) => now - t < perMs);
  if (hits.length >= limit) { windows.set(ip, hits); return false; }
  hits.push(now); windows.set(ip, hits);
  if (windows.size > 5000) windows.clear();
  return true;
}

export async function askShowcase(input: { id: string; question: string; ip: string }): Promise<{ answer: string } | { error: string; status: 400 | 404 | 429 }> {
  if (!Object.values(SHOWCASE).some((s) => s.id === input.id)) return { error: 'not a sample page', status: 404 };
  const q = input.question.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (q.length < 2) return { error: 'ask something about the page', status: 400 };
  if (!allowed(input.ip)) return { error: 'that is enough questions for a minute', status: 429 };
  const rec = await store.getRecord(input.id);
  if (!rec) return { error: 'not found', status: 404 };
  const facts = rec.extraction?.claims?.slice(0, 12) ?? [];
  const text = (rec.extraction?.text ?? '').slice(0, 4000);
  const system = `You are the tutor of Living Textbook, talking with a school student about one page of their book.
Answer the question in at most two short, warm sentences, in the language of the question (English or Hindi).
Use only what the page says (its text and facts below) and the scene's values; never invent numbers, names or facts.
If the page does not answer the question, say so kindly and point to what the page does explain. No lists, no markdown.
Return JSON {"answer": "..."}.
Page title: ${rec.quick.title}
Page text: ${text}
Facts: ${JSON.stringify(facts)}
Scene values: ${JSON.stringify(rec.scene.vars.map((v) => ({ id: v.id, label: v.label, init: v.init, unit: v.unit })))}`;
  const r = await generateJson<{ answer: string }>({ model: 'quick', system, parts: [{ text: `Question: ${q}` }], maxTokens: 220, temperature: 0.4, label: 'showcase-ask', schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] } });
  const answer = String(r.json?.answer ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
  return { answer: answer || 'I could not find that on this page.' };
}
