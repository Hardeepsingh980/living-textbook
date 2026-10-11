// Who is asking: a Firebase ID token in the Authorization header, verified with Firebase Admin (public keys; no
// credentials needed). Anonymous readers simply have no user.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Context } from 'hono';
import { config } from './config.js';

export type User = { uid: string; name?: string; email?: string; picture?: string };
const app = getApps()[0] ?? initializeApp({ projectId: config.project });
const cache = new Map<string, { user: User; exp: number }>();

export async function userFromRequest(c: Context): Promise<User | null> {
  // local development only: DEV_USERS=1 lets a test reader sign in with a header (never set on Cloud Run)
  if (process.env.DEV_USERS === '1') { const dev = c.req.header('x-dev-user'); if (dev) return { uid: `dev-${dev.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}`, name: 'Test Reader', email: 'test@example.com' }; }
  const h = c.req.header('authorization');
  if (!h?.startsWith('Bearer ')) return null;
  const token = h.slice(7).trim();
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit.user;
  try {
    const d = await getAuth(app).verifyIdToken(token);
    const user: User = { uid: d.uid, name: d.name, email: d.email, picture: d.picture };
    cache.set(token, { user, exp: Math.min(d.exp * 1000, Date.now() + 10 * 60_000) });
    if (cache.size > 2000) cache.clear();
    return user;
  } catch (e: any) {
    if (process.env.LIVE_DEBUG) console.warn('[auth] token rejected:', String(e?.message).slice(0, 100));
    return null;
  }
}

/** The owner of what this request creates or lists: the signed-in user, else the browser's anonymous id. */
export async function ownerOf(c: Context): Promise<{ owner: string; user: User | null }> {
  const user = await userFromRequest(c);
  return { owner: user?.uid || c.req.header('x-owner-id') || 'anonymous', user };
}
