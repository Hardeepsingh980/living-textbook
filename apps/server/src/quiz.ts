// A short quiz for a page, written once from the page's own text and kept with the record.
import { store } from './store.js';
import { generateJson } from './gemini.js';
import type { Quiz } from '@living-book/scene';

const inflight = new Map<string, Promise<Quiz | null>>();
export function quizFor(id: string): Promise<Quiz | null> {
  let p = inflight.get(id);
  if (!p) { p = makeQuiz(id).finally(() => inflight.delete(id)); inflight.set(id, p); }
  return p;
}

async function makeQuiz(id: string): Promise<Quiz | null> {
  const rec = await store.getRecord(id);
  if (!rec) return null;
  if (rec.quiz?.questions?.length) return rec.quiz;
  const ex = rec.extraction;
  const material = {
    title: rec.quick.title, subject: rec.quick.subject, gist: rec.quick.gist,
    text: (ex?.text ?? '').slice(0, 6000), claims: ex?.claims?.slice(0, 20), values: ex?.values?.slice(0, 20), worked: ex?.worked?.slice(0, 4), equations: ex?.equations?.slice(0, 10),
    lesson: rec.scene.steps.map((s: any) => s.narration ?? s.say ?? s.text).filter(Boolean).slice(0, 8),
  };
  const system = `Write a short quiz about ONE textbook page for a school student, in ${rec.quick.language || 'en'} (the page's language).
Rules: 4 questions; each has exactly 4 options with one correct answer and three plausible wrong ones; everything must be answerable from the page material given (its text, facts, values and worked example) and nothing else; mix one recall question, two understanding questions ("why" / "what happens if") and, when the page has a worked example or numbers, one short numeric question with the page's own numbers; wording simple and friendly; "why" is one sentence that points to the page's reason. Never invent facts, numbers or names. Return JSON {"questions":[{"q":"...","options":["...","...","...","..."],"answer":<0-3>,"why":"..."}]}`;
  const r = await generateJson<{ questions: Quiz['questions'] }>({
    model: 'extract', system, parts: [{ text: JSON.stringify(material) }], maxTokens: 1400, temperature: 0.3, label: 'quiz',
    schema: { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' }, why: { type: 'string' } }, required: ['q', 'options', 'answer', 'why'] } } }, required: ['questions'] },
  });
  const questions = (r.json.questions ?? []).filter((q) => q && typeof q.q === 'string' && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4).slice(0, 5);
  if (questions.length < 2) return null;
  const quiz: Quiz = { questions, language: rec.quick.language || 'en', createdAt: new Date().toISOString(), model: r.usage.model };
  await store.patchRecord(id, { quiz });
  return quiz;
}
