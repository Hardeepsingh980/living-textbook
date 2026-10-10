// Client for the Living Book server: experience creation over SSE, records, library.
import type { PipelineEvent, ExperienceRecord } from '@living-book/scene';

const OWNER_KEY = 'lb.owner';
export function ownerId(): string {
  try {
    let id = localStorage.getItem(OWNER_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(OWNER_KEY, id); }
    return id;
  } catch { return 'anonymous'; }
}

/** POST the page photo and stream pipeline events. Resolves when the stream ends. */
export async function createExperience(blob: Blob, onEvent: (e: PipelineEvent) => void, opts: { bookId?: string; signal?: AbortSignal } = {}): Promise<void> {
  const res = await fetch('/api/experiences', {
    method: 'POST', body: blob, signal: opts.signal,
    headers: { 'content-type': blob.type || 'image/jpeg', 'x-owner-id': ownerId(), ...(opts.bookId ? { 'x-book-id': opts.bookId } : {}) },
  });
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
  const res = await fetch('/api/library', { headers: { 'x-owner-id': ownerId() } });
  if (!res.ok) return [];
  return res.json();
}
export async function deleteLibrary(): Promise<void> {
  await fetch('/api/library', { method: 'DELETE', headers: { 'x-owner-id': ownerId() } });
}
