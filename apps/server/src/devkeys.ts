// The developer platform's keys, limits and lesson shape. Partner apps call the REST API with a secret key (from their
// server) and open the scanner embed with a publishable key (in the browser, only on the sites they list). Only a
// SHA-256 hash of each key is stored, and it is the document id; the key itself is shown once, when it is made.
import { createHash, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import type { ExperienceRecord } from '@living-book/scene';
import { store, type DevKeyDoc, type DevKeyKind } from './store.js';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** `n` uniformly random base62 characters (bytes of 248 and above are skipped, so every character is equally likely). */
export function randomBase62(n: number): string {
  let out = '';
  while (out.length < n) for (const b of randomBytes(n * 2)) if (b < 248 && out.length < n) out += ALPHABET[b % 62];
  return out;
}

export const KEY_PREFIX: Record<DevKeyKind, string> = { secret: 'ltsk_', publishable: 'ltpk_' };
const KEY_SHAPE = /^lt(sk|pk)_[0-9A-Za-z]{24,64}$/;
export const looksLikeKey = (s: string | null | undefined): s is string => !!s && KEY_SHAPE.test(s);
export const hashKey = (key: string) => createHash('sha256').update(key, 'utf8').digest('hex');
export const MAX_KEYS = 10;
export const MAX_ORIGINS = 10;

/** Lessons a developer account may make per UTC day (all keys together), and per key per minute. */
export const DEV_DAILY = Number(process.env.DEV_LESSONS_PER_DAY || 50);
export const DEV_PER_MINUTE = Number(process.env.DEV_LESSONS_PER_MINUTE || 6);
/** Scanner lessons one network address may make on one publishable key per day, so a single visitor cannot use up a partner's allowance. */
export const EMBED_PER_VISITOR = Number(process.env.EMBED_LESSONS_PER_VISITOR || 15);
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const lastDays = (n: number, t = Date.now()) => Array.from({ length: n }, (_, i) => utcDay(t - (n - 1 - i) * 86_400_000));
/** Lessons made with a developer's keys belong to this owner, apart from the developer's own library. */
export const apiOwner = (uid: string) => `api-${uid.replace(/[^A-Za-z0-9_-]/g, '')}`;

/**
 * A site a publishable key may be embedded on, normalised to scheme://host[:port]: "https://school.example",
 * "https://*.school.example" (any subdomain), or plain http for localhost only. Anything else is refused (null).
 */
export function normalizeOrigin(raw: string): string | null {
  const s = raw.trim().replace(/\/+$/, '');
  const m = /^(https?):\/\/(\*\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*)(:\d{1,5})?$/i.exec(s);
  if (!m) return null;
  const scheme = m[1]!.toLowerCase(), wild = !!m[2], host = m[3]!.toLowerCase(), port = m[4] ?? '';
  const local = host === 'localhost' || host === '127.0.0.1';
  if (scheme === 'http' && !local) return null;
  if (!local && !host.includes('.')) return null;
  if (wild && (local || host.split('.').length < 2)) return null;
  return `${scheme}://${wild ? '*.' : ''}${host}${port}`;
}

/** Whether a page at `origin` may hold an embed for a key that lists `allowed`. A wildcard matches subdomains only. */
export function originAllowed(origin: string | null | undefined, allowed: string[]): boolean {
  if (!origin) return false;
  let u: URL; try { u = new URL(origin); } catch { return false; }
  const o = `${u.protocol}//${u.host}`.toLowerCase();
  return allowed.some((a) => {
    const i = a.indexOf('://*.');
    if (i < 0) return a === o;
    const scheme = a.slice(0, i), rest = a.slice(i + 5);
    return o.startsWith(`${scheme}://`) && o.endsWith(`.${rest}`);
  });
}

/** The CSP source list for a key's sites (wildcards are valid CSP host sources as written). */
export const frameAncestors = (origins: string[]) => origins.join(' ');

export async function createDevKey(owner: string, input: { name: string; kind: DevKeyKind; origins: string[] }) {
  const key = KEY_PREFIX[input.kind] + randomBase62(input.kind === 'secret' ? 40 : 32);
  const doc: DevKeyDoc = {
    hash: hashKey(key), id: `key_${randomBase62(14)}`, owner, name: input.name, kind: input.kind,
    prefix: key.slice(0, 9), last4: key.slice(-4), origins: input.origins, createdAt: new Date().toISOString(), uses: 0,
    ...(input.kind === 'publishable' ? { plain: key } : {}),
  };
  await store.putDevKey(doc);
  return { key, doc };
}

/** What the dashboard may see of a key: never the hash, and a secret key never again after it is made. */
export const publicKey = (d: DevKeyDoc) => ({
  id: d.id, name: d.name, kind: d.kind, display: `${d.prefix}…${d.last4}`, origins: d.origins,
  created_at: d.createdAt, last_used_at: d.lastUsedAt ?? null, revoked_at: d.revokedAt ?? null, uses: d.uses ?? 0,
  ...(d.kind === 'publishable' && d.plain && !d.revokedAt ? { key: d.plain } : {}),
});

// Keys are looked up by hash on every call; a short cache keeps that cheap. A revoked key stops working on this
// instance at once and on the others within the cache's lifetime.
const cache = new Map<string, { doc: DevKeyDoc | null; at: number }>();
const CACHE_MS = 30_000;
export async function resolveKey(raw: string | null | undefined): Promise<DevKeyDoc | null> {
  if (!looksLikeKey(raw)) return null;
  const h = hashKey(raw);
  const hit = cache.get(h);
  let doc: DevKeyDoc | null;
  if (hit && Date.now() - hit.at < CACHE_MS) doc = hit.doc;
  else {
    doc = await store.getDevKey(h).catch(() => null);
    if (cache.size > 5000) cache.clear();
    cache.set(h, { doc, at: Date.now() });
  }
  return doc && !doc.revokedAt ? doc : null;
}
export const forgetKey = (hash: string) => { cache.delete(hash); };

/** Note that a key was used (at most once a minute per key and instance, so reads stay cheap). */
const touched = new Map<string, number>();
export function touchKey(doc: DevKeyDoc, made = false) {
  const last = touched.get(doc.hash) ?? 0;
  if (!made && Date.now() - last < 60_000) return;
  touched.set(doc.hash, Date.now());
  doc.uses = (doc.uses ?? 0) + (made ? 1 : 0);
  void store.patchDevKey(doc.hash, { lastUsedAt: new Date().toISOString(), ...(made ? { uses: doc.uses } : {}) }).catch(() => {});
}

/** A sliding one-minute window per key (per instance): enough to stop a runaway loop. */
const windows = new Map<string, number[]>();
export function rateLimit(keyId: string, perMinute = DEV_PER_MINUTE): { ok: boolean; limit: number; remaining: number; resetSeconds: number } {
  const now = Date.now();
  const list = (windows.get(keyId) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMinute) { windows.set(keyId, list); return { ok: false, limit: perMinute, remaining: 0, resetSeconds: Math.max(1, Math.ceil((60_000 - (now - list[0]!)) / 1000)) }; }
  list.push(now); windows.set(keyId, list);
  if (windows.size > 10_000) windows.clear();
  return { ok: true, limit: perMinute, remaining: perMinute - list.length, resetSeconds: 60 };
}

/** The address the public API is reached at (absolute links in responses). */
export function publicOrigin(c: Context): string {
  if (process.env.SELF_URL) return process.env.SELF_URL.replace(/\/+$/, '');
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:8080';
  const proto = c.req.header('x-forwarded-proto') || (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** A lesson as the REST API returns it. */
export function lessonObject(rec: ExperienceRecord, base: string) {
  const abs = (u: string) => (/^https?:\/\//.test(u) ? u : `${base}${u.startsWith('/') ? '' : '/'}${u}`);
  const v = rec.verification;
  return {
    id: rec.id,
    object: 'lesson' as const,
    created_at: rec.createdAt,
    status: rec.timings?.total ? 'ready' : 'processing',
    title: rec.quick?.title ?? '',
    subject: rec.quick?.subject ?? '',
    kind: rec.quick?.kind ?? '',
    language: rec.quick?.language ?? '',
    summary: rec.quick?.gist ?? '',
    steps: (rec.scene?.steps ?? []).map((s, i) => ({ index: i, title: s.title ?? '', narration: s.narration ?? '' })),
    verification: v ? { status: v.status, summary: v.summary, checks: v.checks.length, passed: v.checks.filter((c) => c.pass).length } : null,
    page: { width: rec.page?.w ?? 0, height: rec.page?.h ?? 0, image_url: rec.page?.imageUrl ? abs(rec.page.imageUrl) : null },
    share_url: `${base}/x/${rec.id}`,
    embed_url: `${base}/embed/lesson/${rec.id}`,
    source: rec.api?.source ?? 'api',
    external_user_id: rec.api?.externalUserId ?? null,
    metadata: rec.api?.metadata ?? {},
  };
}
export type LessonObject = ReturnType<typeof lessonObject>;
