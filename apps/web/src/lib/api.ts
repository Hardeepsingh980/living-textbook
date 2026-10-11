// Client for the Living Book server: experience creation over SSE, records, library.
import type { PipelineEvent, ExperienceRecord, Quiz } from '@living-book/scene';
import { idToken, devUserHeader } from './firebase';
import type { Job } from './types';

const OWNER_KEY = 'lb.owner';
export function ownerId(): string {
  try {
    let id = localStorage.getItem(OWNER_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(OWNER_KEY, id); }
    return id;
  } catch { return 'anonymous'; }
}

/** An error the server explained (a sign-in requirement, a daily limit), with its code. */
export class ApiError extends Error { constructor(message: string, public code: string) { super(message); } }
async function json<T>(res: Response): Promise<T> {
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((j as any).error || `server error ${res.status}`, (j as any).code || String(res.status));
  return j as T;
}

/** Who is asking: the browser's anonymous id, plus the signed-in reader's Firebase token when there is one. */
export async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const t = await idToken();
  return { 'x-owner-id': ownerId(), ...(t ? { authorization: `Bearer ${t}` } : {}), ...devUserHeader(), ...extra };
}

/** POST the page photo and stream pipeline events. Resolves when the stream ends. */
export async function createExperience(blob: Blob, onEvent: (e: PipelineEvent) => void, opts: { bookId?: string; signal?: AbortSignal } = {}): Promise<void> {
  const res = await fetch('/api/experiences', {
    method: 'POST', body: blob, signal: opts.signal,
    headers: await authHeaders({ 'content-type': blob.type || 'image/jpeg', ...(opts.bookId ? { 'x-book-id': opts.bookId } : {}) }),
  });
  if (res.status === 429 || res.status === 401) { const j = await res.json().catch(() => ({})); throw new ApiError(j.error || 'Please sign in to continue.', j.code || 'signin-required'); }
  if (!res.ok || !res.body) throw new Error(`server error ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      if (!data) continue;
      try { const e = JSON.parse(data); if (e && typeof e === 'object' && e.type) onEvent(e as PipelineEvent); } catch { /* keep-alive */ }
    }
  }
}

export async function getExperience(id: string): Promise<ExperienceRecord> {
  const res = await fetch(`/api/experiences/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`not found (${res.status})`);
  return res.json();
}

export type LibraryItem = { id: string; createdAt: string; title: string; kind: string; subject: string; language: string; pageImageUrl: string; verification?: string; bookId?: string };
export async function getLibrary(): Promise<LibraryItem[]> {
  const res = await fetch('/api/library', { headers: await authHeaders() });
  if (!res.ok) return [];
  return res.json();
}
export async function deleteLesson(id: string): Promise<void> { await json(await fetch(`/api/experiences/${encodeURIComponent(id)}`, { method: 'DELETE', headers: await authHeaders() })); }

// ---- background jobs: short videos and chapter films
export async function startShort(file: File, seconds: number): Promise<Job> {
  return json(await fetch(`/api/shorts?seconds=${seconds}`, { method: 'POST', body: file, headers: await authHeaders({ 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name).slice(0, 120) }) }));
}
export async function startChapter(file: File, sections: number): Promise<Job> {
  return json(await fetch(`/api/chapters?sections=${sections}`, { method: 'POST', body: file, headers: await authHeaders({ 'content-type': 'application/pdf', 'x-file-name': encodeURIComponent(file.name).slice(0, 120) }) }));
}
export async function listJobs(): Promise<Job[]> { const r = await fetch('/api/jobs', { headers: await authHeaders() }); return r.ok ? r.json() : []; }
export async function getJob(id: string, waitMs = 0): Promise<Job> { return json(await fetch(`/api/jobs/${encodeURIComponent(id)}${waitMs ? `?wait=${waitMs}` : ''}`, { headers: await authHeaders() })); }
export async function retryJob(id: string): Promise<Job> { return json(await fetch(`/api/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST', headers: await authHeaders() })); }
export async function deleteJob(id: string): Promise<void> { await json(await fetch(`/api/jobs/${encodeURIComponent(id)}`, { method: 'DELETE', headers: await authHeaders() })); }
export type Quota = { signedIn: boolean; limit: number; used: number; remaining: number };
export async function getQuota(): Promise<Quota | null> { try { return await json(await fetch('/api/quota', { headers: await authHeaders() })); } catch { return null; } }
export async function deleteLibrary(): Promise<void> {
  await fetch('/api/library', { method: 'DELETE', headers: await authHeaders() });
}

export async function getQuiz(id: string): Promise<Quiz> {
  const res = await fetch(`/api/experiences/${encodeURIComponent(id)}/quiz`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'no quiz yet');
  return res.json();
}
