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
const KNOWN = new Set(['lesson_open', 'step', 'lesson_complete', 'time', 'question', 'quiz', 'quiz_answer', 'reel', 'capture', 'what_if', 'chapter']);

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
  stats: { lessons: number; completed: number; minutes: number; quizzes: number; avgScore: number | null; questions: number; daysActive: number; streak: number; answers: number; accuracy: number | null };
  bySubject: { subject: string; lessons: number; avgScore: number | null; minutes: number; accuracy?: number | null }[];
  weakest: { experienceId: string; title: string; score: number; total: number }[];
  daily: { day: string; minutes: number; opens: number; answers: number; right: number }[];
  missed: { title: string; experienceId: string | null; question: string }[];
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
  const bySubject: Insights['bySubject'] = [...subjects.entries()].map(([subject, ls]) => ({ subject, lessons: ls.length, avgScore: avg(ls.filter((l) => l.quiz).map((l) => l.quiz!.best / l.quiz!.total)), minutes: Math.round(ls.reduce((a, l) => a + l.seconds, 0) / 60) })).sort((a, b) => b.lessons - a.lessons);
  const weakest = quizzed.map((l) => ({ experienceId: l.experienceId, title: l.title, score: l.quiz!.best, total: l.quiz!.total })).filter((w) => w.score / w.total < 0.75).sort((a, b) => a.score / a.total - b.score / b.total).slice(0, 3);
  // the event stream in BigQuery gives the activity by day, the streak, answer-level accuracy by subject and the
  // questions the reader got wrong; without it, the lesson documents give a rougher picture
  let daysActive = 0, streak = 0, source: Insights['source'] = 'firestore';
  let daily: Insights['daily'] = [], missed: Insights['missed'] = [], answers = 0, right = 0;
  const accuracyBySubject = new Map<string, number>();
  if (await bqReady()) {
    try {
      const table = `\`${process.env.GCP_PROJECT || 'cheerio-app'}.${process.env.BQ_DATASET || 'living_textbook'}.events\``;
      const [days, wrong, subj] = await Promise.all([
        query<{ day: any; minutes: number; opens: number; answers: number; right_answers: number }>(`SELECT DATE(ts, 'Asia/Kolkata') AS day, SUM(IF(event = 'time', duration_ms, 0)) / 60000 AS minutes, COUNTIF(event = 'lesson_open') AS opens, COUNTIF(event = 'quiz_answer') AS answers, COUNTIF(event = 'quiz_answer' AND value = 1) AS right_answers FROM ${table} WHERE uid = @uid AND ts > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY) GROUP BY day ORDER BY day`, { uid: user.uid }),
        query<{ title: string; experience_id: string | null; detail: string }>(`SELECT title, experience_id, detail FROM ${table} WHERE uid = @uid AND event = 'quiz_answer' AND value = 0 ORDER BY ts DESC LIMIT 6`, { uid: user.uid }),
        query<{ subject: string; accuracy: number; answers: number }>(`SELECT IFNULL(subject, 'other') AS subject, SAFE_DIVIDE(COUNTIF(value = 1), COUNT(*)) AS accuracy, COUNT(*) AS answers FROM ${table} WHERE uid = @uid AND event = 'quiz_answer' GROUP BY subject`, { uid: user.uid }),
      ]);
      const dayKey = (d: any) => (typeof d === 'string' ? d : d?.value ?? String(d));
      daily = days.map((r) => ({ day: dayKey(r.day), minutes: Math.round(Number(r.minutes) * 10) / 10, opens: Number(r.opens), answers: Number(r.answers), right: Number(r.right_answers) }));
      const active = daily.filter((d) => d.minutes > 0 || d.opens > 0 || d.answers > 0).map((d) => d.day);
      daysActive = active.length; source = 'bigquery+firestore';
      answers = daily.reduce((a, d) => a + d.answers, 0); right = daily.reduce((a, d) => a + d.right, 0);
      const set = new Set(active);
      const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
      let cursor = new Date();
      if (!set.has(ist(cursor))) cursor = new Date(cursor.getTime() - 86400_000); // today not started yet: the streak runs to yesterday
      while (set.has(ist(cursor))) { streak++; cursor = new Date(cursor.getTime() - 86400_000); }
      missed = wrong.map((w) => ({ title: w.title ?? '', experienceId: w.experience_id, question: String(w.detail ?? '').split(' | ')[0]!.slice(0, 200) }));
      for (const s of subj) accuracyBySubject.set(s.subject, Number(s.accuracy));
    } catch (e: any) { console.warn('[insights] bigquery:', String(e?.message).slice(0, 160)); }
  }
  if (!daysActive) { const set = new Set(lessons.map((l) => l.lastAt.slice(0, 10))); daysActive = set.size; streak = set.has(new Date().toISOString().slice(0, 10)) ? 1 : 0; }
  for (const b of bySubject) b.accuracy = accuracyBySubject.has(b.subject) ? accuracyBySubject.get(b.subject)! : null;
  const stats = { lessons: lessons.length, completed: lessons.filter((l) => l.completed).length, minutes, quizzes: quizzed.reduce((a, l) => a + (l.quiz?.attempts ?? 0), 0), avgScore: avg(quizzed.map((l) => l.quiz!.best / l.quiz!.total)), questions: lessons.reduce((a, l) => a + l.questions, 0), daysActive, streak, answers, accuracy: answers ? right / answers : null };
  let summary = '', suggestions: Insights['suggestions'] = [];
  if (lessons.length) {
    try {
      const facts = { name: user.name?.split(' ')[0], stats, bySubject, weakest, missedQuestions: missed, recent: lessons.slice(0, 8).map((l) => ({ id: l.experienceId, title: l.title, subject: l.subject, steps: `${l.steps}/${l.totalSteps}`, completed: l.completed, minutes: Math.round(l.seconds / 60), questions: l.questions, quiz: l.quiz ? `${l.quiz.best}/${l.quiz.total}` : null })) };
      const r = await generateJson<{ summary: string; suggestions: { title: string; line: string; experienceId?: string }[] }>({
        model: 'quick', label: 'insights', maxTokens: 400, temperature: 0.5,
        system: 'You are a kind tutor writing to a school student about their own learning in this app (pages they brought to life, questions they asked, quizzes they took). From the JSON given, write {"summary": one warm sentence about what they did, "suggestions": 3 items {title: 2-5 words, line: one concrete next step (which page to revisit, what to ask the tutor, what to try in the quiz), experienceId: the id of the page it refers to when there is one}}. Mention real titles and scores from the data only; never invent. If the student did well everywhere, suggest a new page or a what-if to try. No lists inside lines, no markdown.',
        parts: [{ text: JSON.stringify(facts) }],
        schema: { type: 'object', properties: { summary: { type: 'string' }, suggestions: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, line: { type: 'string' }, experienceId: { type: 'string' } }, required: ['title', 'line'] } } }, required: ['summary', 'suggestions'] },
      });
      summary = r.json.summary; suggestions = (r.json.suggestions ?? []).slice(0, 3);
    } catch (e: any) { console.warn('[insights] suggestions:', String(e?.message).slice(0, 120)); }
  }
  const value: Insights = { stats, bySubject, weakest, daily, missed, summary, suggestions, source };
  insightCache.set(user.uid, { at: Date.now(), value });
  return value;
}
