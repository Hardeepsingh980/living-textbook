// Learning events: to the server (Firestore progress for a signed-in reader, BigQuery for everyone) and to Firebase
// Analytics. Fire and forget; nothing waits on them.
import { authHeaders } from './api';
import { logAnalytics } from './firebase';
import type { LessonMeta } from './types';

export type ProgressEvent = Partial<LessonMeta> & {
  experienceId?: string; event: 'lesson_open' | 'step' | 'lesson_complete' | 'time' | 'question' | 'quiz' | 'quiz_answer' | 'reel' | 'capture' | 'what_if' | 'chapter';
  detail?: string; value?: number; durationMs?: number; step?: number; totalSteps?: number;
};

export function track(e: ProgressEvent) {
  logAnalytics(e.event, { experience_id: e.experienceId, subject: e.subject, value: e.value, step: e.step });
  void authHeaders({ 'content-type': 'application/json' })
    .then((headers) => fetch('/api/progress', { method: 'POST', headers, body: JSON.stringify(e), keepalive: true }))
    .catch(() => { /* best effort */ });
}

export type Lesson = { experienceId: string; title: string; subject: string; kind: string; language: string; pageImageUrl: string; openedAt: string; lastAt: string; opens: number; steps: number; totalSteps: number; completed: boolean; seconds: number; questions: number; quiz?: { score: number; total: number; at: string; best: number; attempts: number } };
export type Insights = {
  stats: { lessons: number; completed: number; minutes: number; quizzes: number; avgScore: number | null; questions: number; daysActive: number; streak: number; answers: number; accuracy: number | null };
  bySubject: { subject: string; lessons: number; avgScore: number | null; minutes: number; accuracy?: number | null }[];
  weakest: { experienceId: string; title: string; score: number; total: number }[];
  daily: { day: string; minutes: number; opens: number; answers: number; right: number }[];
  missed: { title: string; experienceId: string | null; question: string }[];
  summary: string;
  suggestions: { title: string; line: string; experienceId?: string }[];
  source: string;
};
export async function getMe(): Promise<{ user: { name?: string; email?: string; picture?: string; createdAt?: string }; lessons: Lesson[] }> {
  const r = await fetch('/api/me', { headers: await authHeaders() });
  if (!r.ok) throw new Error('could not load your progress');
  return r.json();
}
export async function getInsights(fresh = false): Promise<Insights> {
  const r = await fetch(`/api/me/insights${fresh ? '?fresh=1' : ''}`, { headers: await authHeaders() });
  if (!r.ok) throw new Error('could not load your insights');
  return r.json();
}
