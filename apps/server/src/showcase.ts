// The homepage's living samples: curated saved experiences any visitor can watch, and a small text preview of the
// tutor that answers questions about one of them with the quick model, grounded on the page's own text.
import { generateJson } from './gemini.js';
import { store } from './store.js';

export const SHOWCASE = {
  hero: { id: '9aee2e9b-606b-4086-bb15-1f872b687149', title: 'Motion and Time', slider: 'L' },
  explore: { id: '26361c93-7794-401c-99a7-9c4c6c9d30c9', title: 'Resistors in Series', slider: 'V' },
  ask: { id: '9aee2e9b-606b-4086-bb15-1f872b687149', title: 'Motion and Time' },
};
export function showcase() { return SHOWCASE; }

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
