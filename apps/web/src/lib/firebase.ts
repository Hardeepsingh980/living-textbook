// Sign in with Google through Firebase Auth, plus Firebase Analytics. The web config comes from the server
// (/api/config), so no keys live in the repository; without it the app simply runs signed out. The Firebase modules
// load on demand, so the first paint does not wait for them.
import { useSyncExternalStore } from 'react';
import type { User } from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';

export type Reader = { uid: string; name: string; email: string; photo: string };
let reader: Reader | null = null;
let fbUser: User | null = null;
let available = false;
let ready = false;            // the sign-in state is known (signed in or out)
let devName: string | null = null; // local development: a test reader (server DEV_USERS=1, localStorage lb.devUser)
let app: FirebaseApp | null = null;
let authMod: typeof import('firebase/auth') | null = null;
let analytics: ((name: string, params?: Record<string, unknown>) => void) | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let resolveAuth!: () => void;
const authResolved = new Promise<void>((r) => { resolveAuth = () => { if (!ready) { ready = true; emit(); } r(); }; });
setTimeout(() => resolveAuth(), 2500); // a request never waits long for the auth state

const CLAIMED = 'lb.claimed.';
const boot = (async () => {
  // inside another app (the embed), nobody signs in: lessons there belong to the partner's account
  if (location.pathname.startsWith('/embed/')) { resolveAuth(); return; }
  try {
    const cfg = await fetch('/api/config').then((r) => (r.ok ? r.json() : null));
    if (cfg?.devUsers) {
      try { devName = localStorage.getItem('lb.devUser'); } catch { devName = null; }
      if (devName) { reader = { uid: `dev-${devName}`, name: 'Test Reader', email: 'test@example.com', photo: '' }; available = true; resolveAuth(); emit(); return; }
    }
    if (!cfg?.firebase?.apiKey) { resolveAuth(); return; }
    const [{ initializeApp }, mod] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    app = initializeApp(cfg.firebase); authMod = mod; available = true; emit();
    const auth = mod.getAuth(app);
    mod.onAuthStateChanged(auth, (u) => {
      fbUser = u;
      reader = u ? { uid: u.uid, name: u.displayName ?? '', email: u.email ?? '', photo: u.photoURL ?? '' } : null;
      resolveAuth(); emit();
      if (u) void claimEarlierPages(u);
    });
    mod.getRedirectResult(auth).catch(() => { /* no redirect pending */ });
    if (cfg.firebase.measurementId) {
      import('firebase/analytics').then(async (a) => { if (await a.isSupported()) { const an = a.getAnalytics(app!); analytics = (n, p) => a.logEvent(an, n, p as any); } }).catch(() => {});
    }
  } catch { resolveAuth(); }
})();

/** Pages made on this device before signing in move to the reader's account, once. */
async function claimEarlierPages(u: User) {
  try {
    if (localStorage.getItem(CLAIMED + u.uid)) return;
    const anon = localStorage.getItem('lb.owner');
    if (!anon) return;
    const r = await fetch('/api/me/claim', { method: 'POST', headers: { authorization: `Bearer ${await u.getIdToken()}`, 'x-owner-id': anon } });
    if (r.ok) localStorage.setItem(CLAIMED + u.uid, '1');
  } catch { /* try again next time */ }
}

export function useReader(): Reader | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => reader, () => null);
}
/** True once it is known whether the reader is signed in (so a page can show a sign-in card instead of flickering). */
export function useAuthReady(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => ready, () => false);
}
export function devUserHeader(): Record<string, string> { return devName ? { 'x-dev-user': devName } : {}; }
export function currentReader(): Reader | null { return reader; }
export function useSignInAvailable(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => available, () => false);
}
export async function signIn(): Promise<void> {
  await boot;
  if (!app || !authMod) throw new Error('Sign-in is not available right now.');
  const auth = authMod.getAuth(app);
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { await authMod.signInWithPopup(auth, provider); }
  catch (e: any) {
    const code = String(e?.code ?? '');
    if (/popup-blocked|operation-not-supported-in-this-environment/.test(code)) await authMod.signInWithRedirect(auth, provider);
    else if (!/popup-closed-by-user|cancelled-popup-request/.test(code)) throw e;
  }
}
export async function signOut(): Promise<void> {
  await boot;
  if (devName) { try { localStorage.removeItem('lb.devUser'); } catch { /* ignore */ } devName = null; reader = null; emit(); return; }
  if (app && authMod) await authMod.signOut(authMod.getAuth(app));
}
export async function idToken(): Promise<string | null> {
  await boot; await authResolved;
  try { return fbUser ? await fbUser.getIdToken() : null; } catch { return null; }
}
export function logAnalytics(name: string, params?: Record<string, unknown>) { try { analytics?.(name, params); } catch { /* analytics is best effort */ } }
