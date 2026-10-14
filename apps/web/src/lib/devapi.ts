// The developer dashboard's calls: keys, usage and the lessons made with them (signed-in developers only).
import { authHeaders, ApiError } from './api';

export type DevKey = {
  id: string; name: string; kind: 'secret' | 'publishable'; display: string; origins: string[];
  created_at: string; last_used_at: string | null; revoked_at: string | null; uses: number;
  /** only in the answer that creates the key; never again */
  key?: string;
};
export type UsageDay = { day: string; lessons: number; by_key: Record<string, number> };
export type DevUsage = { object: 'usage'; daily_limit: number; per_minute_limit: number; today: UsageDay; days: UsageDay[] };
export type DevLesson = {
  id: string; created_at: string; status: string; title: string; subject: string; language: string;
  source: 'api' | 'embed'; external_user_id: string | null; share_url: string; embed_url: string;
  page: { image_url: string | null }; verification: { status: string } | null;
};

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: await authHeaders(body ? { 'content-type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((j as any).error || `server error ${res.status}`, (j as any).code || String(res.status));
  return j as T;
}
export const listKeys = () => call<DevKey[]>('GET', '/api/dev/keys');
export const createKey = (input: { name: string; kind: DevKey['kind']; origins: string[] }) => call<DevKey>('POST', '/api/dev/keys', input);
export const updateKey = (id: string, patch: { name?: string; origins?: string[] }) => call<DevKey>('PATCH', `/api/dev/keys/${encodeURIComponent(id)}`, patch);
export const revokeKey = (id: string) => call<DevKey>('DELETE', `/api/dev/keys/${encodeURIComponent(id)}`);
export const getUsage = () => call<DevUsage>('GET', '/api/dev/usage');
export const listDevLessons = () => call<DevLesson[]>('GET', '/api/dev/lessons');
