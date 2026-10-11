// A reader's progress: every event goes to BigQuery; for a signed-in reader it also keeps a lesson document up to
// date (opens, steps, time, questions, quiz), and the insights page reads those back and asks the quick model for
// three kind, concrete suggestions.
import { store, type LessonDoc, type UserDoc } from './store.js';
import { track, query, bqReady } from './bq.js';
import { generateJson } from './gemini.js';
import type { User } from './auth.js';

export type ProgressEvent = {
  experienceId?: string; event: string; detail?: string; value?: number; durationMs?: number; step?: number; totalSteps?: number;
  title?: string; subject?: string; kind?: string; language?: string; pageImageUrl?: string;
};
const KNOWN = new Set(['lesson_open', 'step', 'lesson_complete', 'time', 'question', 'quiz', 'reel', 'capture', 'what_if']);

export async function recordEvent(user: User | null, owner: string, e: ProgressEvent, device: string) {
  const event = KNOWN.has(e.event) ? e.event : 'other';
  const now = new Date().toISOString();
  track({ ts: now, uid: user?.uid ?? null, owner, experience_id: e.experienceId ?? null, title: e.title?.slice(0, 120) ?? null, subject: e.subject ?? null, kind: e.kind ?? null, event, detail: e.detail?.slice(0, 300) ?? null, value: e.value ?? null, duration_ms: e.durationMs ?? null, step: e.step ?? null, total_steps: e.totalSteps ?? null, device: device.slice(0, 120) });
  if (!user || !e.experienceId) return;
  const cur = await store.getLesson(user.uid, e.experienceId);
  const doc: LessonDoc = cur ?? { experienceId: e.experienceId, title: e.title ?? '', subject: e.subject ?? '', kind: e.kind ?? '', language: e.language ?? '', pageImageUrl: e.pageImageUrl ?? '', openedAt: now, lastAt: now, opens: 0, steps: 0, totalSteps: e.totalSteps ?? 0, completed: false, seconds: 0, questions: 0 };
  if (e.title && !doc.title) { doc.title = e.title; doc.subject = e.subject ?? doc.subject; doc.kind = e.kind ?? doc.kind; doc.language = e.language ?? doc.language; doc.pageImageUrl = e.pageImageUrl ?? doc.pageImageUrl; }
  doc.lastAt = now;
  if (e.totalSteps) doc.totalSteps = e.totalSteps;
  switch (event) {
    case 'lesson_open': doc.opens += 1; break;
    case 'step': if (typeof e.step === 'number') doc.steps = Math.max(doc.steps, e.step + 1); if (doc.totalSteps && doc.steps >= doc.totalSteps) doc.completed = true; break;
    case 'lesson_complete': doc.completed = true; if (doc.totalSteps) doc.steps = doc.totalSteps; break;
    case 'time': doc.seconds += Math.max(0, Math.min(3600, (e.durationMs ?? 0) / 1000)); break;
    case 'question': doc.questions += 1; break;
    case 'quiz': {
      const score = Math.max(0, Math.round(e.value ?? 0)), total = Math.max(1, Math.round(Number(e.detail?.match(/of (\d+)/)?.[1] ?? e.totalSteps ?? 4)));
      doc.quiz = { score, total, at: now, best: Math.max(score, doc.quiz?.best ?? 0), attempts: (doc.quiz?.attempts ?? 0) + 1 };
      break;
    }
  }
  await store.putLesson(user.uid, e.experienceId, doc);
}

export async function touchUser(user: User) {
  const cur = await store.getUser(user.uid);
  const now = new Date().toISOString();
  await store.putUser(user.uid, { name: user.name, email: user.email, picture: user.picture, lastSeenAt: now, ...(cur ? {} : { createdAt: now }) });
}

export async function me(user: User): Promise<{ user: UserDoc | null; lessons: LessonDoc[] }> {
  const [u, lessons] = await Promise.all([store.getUser(user.uid), store.listLessons(user.uid, 100)]);
  return { user: u, lessons };
}

export type Insights = {
  stats: { lessons: number; completed: number; minutes: number; quizzes: number; avgScore: number | null; questions: number; daysActive: number; streak: number };
  bySubject: { subject: string; lessons: number; avgScore: number | null; minutes: number }[];
  weakest: { experienceId: string; title: string; score: number; total: number }[];
  summary: string;
  suggestions: { title: string; line: string; experienceId?: string }[];
  source: 'bigquery+firestore' | 'firestore';
};
const insightCache = new Map<string, { at: number; value: Insights }>();

export async function insights(user: User, force = false): Promise<Insights> {
  const hit = insightCache.get(user.uid);
  if (hit && !force && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const lessons = await store.listLessons(user.uid, 300);
  const quizzed = lessons.filter((l) => l.quiz);
  const minutes = Math.round(lessons.reduce((a, l) => a + l.seconds, 0) / 60);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const subjects = new Map<string, LessonDoc[]>();
  for (const l of lessons) { const k = l.subject || 'other'; if (!subjects.has(k)) subjects.set(k, []); subjects.get(k)!.push(l); }
  const bySubject = [...subjects.entries()].map(([subject, ls]) => ({ subject, lessons: ls.length, avgScore: avg(ls.filter((l) => l.quiz).map((l) => l.quiz!.best / l.quiz!.total)), minutes: Math.round(ls.reduce((a, l) => a + l.seconds, 0) / 60) })).sort((a, b) => b.lessons - a.lessons);
  const weakest = quizzed.map((l) => ({ experienceId: l.experienceId, title: l.title, score: l.quiz!.best, total: l.quiz!.total })).filter((w) => w.score / w.total < 0.75).sort((a, b) => a.score / a.total - b.score / b.total).slice(0, 3);
  // days active and the streak come from BigQuery (the event stream); without it, from the lesson dates
  let daysActive = 0, streak = 0, source: Insights['source'] = 'firestore';
  if (await bqReady()) {
    try {
      const rows = await query<{ day: { value: string } }>(`SELECT DISTINCT DATE(ts, 'Asia/Kolkata') AS day FROM \`${process.env.GCP_PROJECT || 'cheerio-app'}.${process.env.BQ_DATASET || 'living_textbook'}.events\` WHERE uid = @uid AND ts > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY) ORDER BY day DESC`, { uid: user.uid });
      const days = rows.map((r) => (typeof r.day === 'string' ? r.day : r.day.value));
      daysActive = days.length; source = 'bigquery+firestore';
      const today = new Date(); let d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const set = new Set(days);
      for (;;) { const key = d.toISOString().slice(0, 10); if (!set.has(key)) { if (streak === 0) { d.setUTCDate(d.getUTCDate() - 1); if (set.has(d.toISOString().slice(0, 10))) continue; } break; } streak++; d.setUTCDate(d.getUTCDate() - 1); }
    } catch (e: any) { console.warn('[insights] bigquery:', String(e?.message).slice(0, 120)); }
  }
  if (!daysActive) { const set = new Set(lessons.map((l) => l.lastAt.slice(0, 10))); daysActive = set.size; streak = set.has(new Date().toISOString().slice(0, 10)) ? 1 : 0; }
  const stats = { lessons: lessons.length, completed: lessons.filter((l) => l.completed).length, minutes, quizzes: quizzed.reduce((a, l) => a + (l.quiz?.attempts ?? 0), 0), avgScore: avg(quizzed.map((l) => l.quiz!.best / l.quiz!.total)), questions: lessons.reduce((a, l) => a + l.questions, 0), daysActive, streak };
  let summary = '', suggestions: Insights['suggestions'] = [];
  if (lessons.length) {
    try {
      const facts = { name: user.name?.split(' ')[0], stats, bySubject, weakest, recent: lessons.slice(0, 8).map((l) => ({ id: l.experienceId, title: l.title, subject: l.subject, steps: `${l.steps}/${l.totalSteps}`, completed: l.completed, minutes: Math.round(l.seconds / 60), questions: l.questions, quiz: l.quiz ? `${l.quiz.best}/${l.quiz.total}` : null })) };
      const r = await generateJson<{ summary: string; suggestions: { title: string; line: string; experienceId?: string }[] }>({
        model: 'quick', label: 'insights', maxTokens: 400, temperature: 0.5,
        system: 'You are a kind tutor writing to a school student about their own learning in this app (pages they brought to life, questions they asked, quizzes they took). From the JSON given, write {"summary": one warm sentence about what they did, "suggestions": 3 items {title: 2-5 words, line: one concrete next step (which page to revisit, what to ask the tutor, what to try in the quiz), experienceId: the id of the page it refers to when there is one}}. Mention real titles and scores from the data only; never invent. If the student did well everywhere, suggest a new page or a what-if to try. No lists inside lines, no markdown.',
        parts: [{ text: JSON.stringify(facts) }],
        schema: { type: 'object', properties: { summary: { type: 'string' }, suggestions: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, line: { type: 'string' }, experienceId: { type: 'string' } }, required: ['title', 'line'] } } }, required: ['summary', 'suggestions'] },
      });
      summary = r.json.summary; suggestions = (r.json.suggestions ?? []).slice(0, 3);
    } catch (e: any) { console.warn('[insights] suggestions:', String(e?.message).slice(0, 120)); }
  }
  const value: Insights = { stats, bySubject, weakest, summary, suggestions, source };
  insightCache.set(user.uid, { at: Date.now(), value });
  return value;
}
