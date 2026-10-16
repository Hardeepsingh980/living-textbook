import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { runPipeline } from './pipeline.js';
import { store } from './store.js';
import { warmTracking } from './tracking.js';
import { WebSocketServer } from 'ws';
import { handleLiveSocket } from './live.js';
import { showcase, askShowcase } from './showcase.js';
import { userFromRequest, ownerOf } from './auth.js';
import { recordEvent, touchUser, me, insights } from './progress.js';
import { quizFor } from './quiz.js';
import { createJob, runJob, heal, retryJob } from './jobs.js';
import { createStoryJob } from './story/job.js';
import { mountDeveloperPlatform } from './devapi.js';
import { resolveKey, originAllowed, publicOrigin, rateLimit, touchKey, apiOwner, utcDay, frameAncestors, DEV_DAILY, EMBED_PER_VISITOR } from './devkeys.js';
import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import type { PipelineEvent, ApiInfo } from '@living-book/scene';

const app = new Hono();
app.use('/api/*', cors());

// ---- who may make what: lessons are free to try (a few a day); short videos and chapter films need an account
const clientIp = (c: Context) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
const istDay = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const ipKey = (ip: string) => createHash('sha256').update(`${ip}|${process.env.QUOTA_SALT || 'living-textbook'}`).digest('hex').slice(0, 24);
const FREE_LESSONS = Number(process.env.FREE_LESSONS_PER_DAY || 3), MEMBER_LESSONS = Number(process.env.MEMBER_LESSONS_PER_DAY || 60);
const MEMBER_SHORTS = 10, MEMBER_CHAPTERS = 4;
const exempt = (c: Context) => clientIp(c) === 'local' || (!!process.env.EVAL_KEY && c.req.header('x-eval-key') === process.env.EVAL_KEY);
const lessonKey = (uid: string | null, ip: string) => (uid ? `lesson-u-${uid.replace(/[^A-Za-z0-9_-]/g, '')}-${istDay()}` : `lesson-a-${ipKey(ip)}-${istDay()}`);
const signinRequired = (c: Context, what: string) => c.json({ error: `Sign in to ${what}.`, code: 'signin-required' }, 401);

app.get('/api/health', (c) => c.json({ ok: true, models: Object.fromEntries(Object.entries(config.models).map(([k, v]) => [k, v.id])), time: new Date().toISOString() }));

/** Create an experience from a page photo. Body: raw image bytes. Response: SSE stream of pipeline events. */
app.post('/api/experiences', async (c) => {
  const mime = c.req.header('content-type') || 'image/jpeg';
  if (!mime.startsWith('image/')) return c.json({ error: 'Send the photo of the page as the body of the request, with an image/* content type.' }, 400);
  const image = Buffer.from(await c.req.arrayBuffer());
  if (image.length < 1000) return c.json({ error: 'The image is too small to read.' }, 400);
  if (image.length > 15 * 1024 * 1024) return c.json({ error: 'The image is too large. The limit is 15 MB.' }, 413);
  let { owner: ownerId, user } = await ownerOf(c);
  let api: ApiInfo | undefined;
  const embedKey = c.req.header('x-embed-key');
  if (embedKey) {
    // the scanner embed on a partner's site: the lesson counts against the partner's allowance, not the reader's
    const key = await resolveKey(embedKey);
    if (!key || key.kind !== 'publishable') return c.json({ error: "This scanner's key is not valid. Please let the site's team know.", code: 'embed-key-invalid' }, 401);
    const parent = c.req.header('x-embed-parent') || '';
    if (!originAllowed(parent, key.origins) && parent !== publicOrigin(c)) return c.json({ error: 'This site is not allowed to use this scanner. Please let its team know.', code: 'embed-origin' }, 403);
    if (!exempt(c)) {
      const v = await store.bumpQuota(`embed-${key.id}-${ipKey(clientIp(c))}-${utcDay()}`, EMBED_PER_VISITOR).catch(() => ({ allowed: true, used: 0 }));
      if (!v.allowed) return c.json({ error: 'That is a lot of pages for one day. Try again tomorrow.', code: 'daily-limit' }, 429);
    }
    const rl = rateLimit(key.id);
    if (!rl.ok) return c.json({ error: `Many people are scanning right now. Try again in ${rl.resetSeconds} seconds.`, code: 'rate-limited' }, 429);
    const q = await store.bumpDevUsage(key.owner, utcDay(), key.id, DEV_DAILY).catch(() => ({ allowed: true, used: 0 }));
    if (!q.allowed) return c.json({ error: "This site has used today's lessons. Try again tomorrow.", code: 'daily-limit' }, 429);
    touchKey(key, true);
    ownerId = apiOwner(key.owner); user = null;
    api = { keyId: key.id, source: 'embed', origin: parent };
  } else if (!exempt(c)) {
    const limit = user ? MEMBER_LESSONS : FREE_LESSONS;
    const q = await store.bumpQuota(lessonKey(user?.uid ?? null, clientIp(c)), limit).catch(() => ({ allowed: true, used: 0 }));
    if (!q.allowed) return c.json(user
      ? { error: 'That is a lot of pages for one day. Try again tomorrow.', code: 'daily-limit', limit }
      : { error: `You used all ${limit} free pages for today. Sign in to make more. It is free.`, code: 'signin-required', limit }, 429);
  }
  const bookId = c.req.header('x-book-id') || undefined;
  const id = randomUUID();
  return streamSSE(c, async (stream) => {
    // writes are chained so the stream only closes after the last event has been flushed
    let chain: Promise<void> = Promise.resolve();
    const write = (e: PipelineEvent) => { chain = chain.then(() => stream.writeSSE({ event: e.type, data: JSON.stringify(e) })).catch(() => {}); return chain; };
    const keepAlive = setInterval(() => { chain = chain.then(() => stream.writeSSE({ event: 'ping', data: String(Date.now()) })).catch(() => {}); }, 15000);
    try {
      await runPipeline({ id, image, mime, ownerId, bookId, api }, (e) => { void write(e); });
    } catch (e: any) {
      console.error('[pipeline] fatal', e);
      void write({ type: 'error', message: String(e?.message || e), recoverable: false, t: 0 });
    } finally { clearInterval(keepAlive); await chain; }
  });
});

app.get('/api/experiences/:id', async (c) => {
  const rec = await store.getRecord(c.req.param('id'));
  if (!rec) return c.json({ error: 'not found' }, 404);
  // the owner is never sent: with it, anyone holding a shared link could list or claim that reader's pages
  const { events, ownerId, api, ...rest } = rec; // nor a partner's references (their user ids and metadata)
  return c.json(c.req.query('events') ? { ...rest, events } : rest, 200, { 'Cache-Control': 'private, max-age=60' });
});

/** How many free pages are left today (signed-out readers), or the member allowance. */
app.get('/api/quota', async (c) => {
  const user = await userFromRequest(c);
  const limit = user ? MEMBER_LESSONS : FREE_LESSONS;
  const used = await store.peekQuota(lessonKey(user?.uid ?? null, clientIp(c))).catch(() => 0);
  return c.json({ signedIn: !!user, limit, used, remaining: Math.max(0, limit - used) }, 200, { 'Cache-Control': 'no-store' });
});

/** Public web configuration: Firebase (sign-in, analytics) comes from the environment, so no keys live in the repo. */
app.get('/api/config', (c) => {
  const apiKey = process.env.FIREBASE_API_KEY, appId = process.env.FIREBASE_APP_ID;
  const firebase = apiKey && appId ? { apiKey, appId, projectId: config.project, authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${config.project}.firebaseapp.com`, messagingSenderId: appId.split(':')[1], measurementId: process.env.FIREBASE_MEASUREMENT_ID || undefined } : null;
  return c.json({ firebase, devUsers: process.env.DEV_USERS === '1' }, 200, { 'Cache-Control': 'public, max-age=300' });
});
/** On first sign-in on a device, the pages made there before signing in move to the reader's account. */
app.post('/api/me/claim', async (c) => {
  const user = await userFromRequest(c); if (!user) return c.json({ error: 'sign in first' }, 401);
  const anon = c.req.header('x-owner-id');
  if (!anon || anon === user.uid || anon === 'anonymous' || anon === 'eval' || anon === 'showcase') return c.json({ moved: 0 });
  const recs = await store.listRecords(anon, 500);
  for (const r of recs) await store.patchRecord(r.id, { ownerId: user.uid });
  return c.json({ moved: recs.length });
});

/** A signed-in reader: profile and progress, insights, and the events that feed them. Anonymous events are kept too. */
app.get('/api/me', async (c) => {
  const user = await userFromRequest(c); if (!user) return c.json({ error: 'sign in first' }, 401);
  await touchUser(user);
  const m = await me(user);
  return c.json({ ...m, user: { ...m.user, uid: user.uid, name: user.name, email: user.email, picture: user.picture } });
});
app.get('/api/me/insights', async (c) => {
  const user = await userFromRequest(c); if (!user) return c.json({ error: 'sign in first' }, 401);
  return c.json(await insights(user, c.req.query('fresh') === '1'));
});
app.post('/api/progress', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.event !== 'string') return c.json({ error: 'event required' }, 400);
  const { owner, user } = await ownerOf(c);
  await recordEvent(user, owner, body, c.req.header('user-agent') || '').catch((e) => console.warn('[progress]', String(e?.message).slice(0, 120)));
  return c.json({ ok: true, signedIn: !!user });
});
app.get('/api/experiences/:id/quiz', async (c) => {
  const quiz = await quizFor(c.req.param('id')).catch((e) => { console.warn('[quiz]', String(e?.message).slice(0, 160)); return null; });
  return quiz ? c.json(quiz) : c.json({ error: 'no quiz for this page yet' }, 404);
});

/** The homepage's living samples, and a text preview of the tutor about one of them. */
app.get('/api/showcase', async (c) => c.json(await showcase()));
app.post('/api/showcase/ask', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const r = await askShowcase({ id: String(body?.id ?? ''), question: String(body?.question ?? ''), ip }).catch((e) => ({ error: String(e?.message || e).slice(0, 120), status: 400 as const }));
  return 'error' in r ? c.json({ error: r.error }, r.status) : c.json(r);
});

/** Short videos (a page in, a narrated video out) and chapter films (a chapter PDF in, a 16:9 explainer out) are
 *  background jobs for signed-in readers: they keep running when the reader leaves, and the dashboard shows them. */
async function startJob(c: Context, kind: 'short' | 'chapter') {
  const user = await userFromRequest(c);
  if (!user) return signinRequired(c, kind === 'short' ? 'make short videos' : 'make chapter films');
  const mime = c.req.header('content-type') || 'application/octet-stream';
  const body = Buffer.from(await c.req.arrayBuffer());
  const isPdf = body.subarray(0, 4).toString() === '%PDF';
  if (kind === 'chapter' && (body.length < 1000 || !isPdf)) return c.json({ error: 'Send the chapter as a PDF.' }, 400);
  if (kind === 'short' && (body.length < 1000 || (!isPdf && !mime.startsWith('image/')))) return c.json({ error: 'Send a photo of the page or a PDF.' }, 400);
  if (body.length > 30 * 1024 * 1024) return c.json({ error: 'The file is larger than 30 MB.' }, 413);
  const q = await store.bumpQuota(`${kind}-u-${user.uid.replace(/[^A-Za-z0-9_-]/g, '')}-${istDay()}`, kind === 'short' ? MEMBER_SHORTS : MEMBER_CHAPTERS).catch(() => ({ allowed: true, used: 0 }));
  if (!q.allowed && !exempt(c)) return c.json({ error: kind === 'short' ? 'You made ten short videos today. Try again tomorrow.' : 'You made four chapter films today. Try again tomorrow.', code: 'daily-limit' }, 429);
  const name = (c.req.header('x-file-name') || '').slice(0, 120) || undefined;
  const job = await createJob(kind, user.uid, body, isPdf ? 'application/pdf' : mime, kind === 'short' ? { seconds: Number(c.req.query('seconds')) || 45 } : { sections: Number(c.req.query('sections')) || 5 }, name);
  void recordEvent(user, user.uid, { event: kind === 'short' ? 'reel' : 'chapter', detail: `started ${job.id}` }, c.req.header('user-agent') || '').catch(() => {});
  return c.json(job);
}
app.post('/api/shorts', (c) => startJob(c, 'short'));

/** Stories made alive: photos of a fiction story's pages in, an interactive film out (a background job of several
 *  minutes). Each one films about a minute of video, so a reader makes at most two a day and everyone together twenty. */
app.post('/api/stories', async (c) => {
  const user = await userFromRequest(c);
  if (!user) return signinRequired(c, 'make stories');
  const form = await c.req.formData().catch(() => null);
  const files = form ? form.getAll('pages').filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f) : [];
  if (!files.length || files.length > 6) return c.json({ error: 'Send one to six photos of the story pages, in reading order.' }, 400);
  const pages = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
  if (pages.some((b) => b.length < 1000 || b.length > 15 * 1024 * 1024)) return c.json({ error: 'Each page must be a photo under 15 MB.' }, 400);
  if (!exempt(c)) {
    const mine = await store.bumpQuota(`story-u-${user.uid.replace(/[^A-Za-z0-9_-]/g, '')}-${istDay()}`, 2).catch(() => ({ allowed: true, used: 0 }));
    if (!mine.allowed) return c.json({ error: 'You made two stories today. Try again tomorrow.', code: 'daily-limit' }, 429);
    const all = await store.bumpQuota(`story-all-${istDay()}`, 20).catch(() => ({ allowed: true, used: 0 }));
    if (!all.allowed) return c.json({ error: 'Many stories were made today. Try again tomorrow.', code: 'daily-limit' }, 429);
  }
  const job = await createStoryJob(user.uid, pages);
  void recordEvent(user, user.uid, { event: 'story', detail: `started ${job.id}` }, c.req.header('user-agent') || '').catch(() => {});
  return c.json(job);
});
/** A story page scanned as a lesson can become a film: the lesson's saved page photo goes to the story engine. */
app.post('/api/stories/from-lesson/:id', async (c) => {
  const user = await userFromRequest(c);
  if (!user) return signinRequired(c, 'make stories');
  const rec = await store.getRecord(c.req.param('id'));
  const page = rec ? await store.getFile(rec.id, 'page.jpg') : null;
  if (!rec || !page) return c.json({ error: 'not found' }, 404);
  if (!exempt(c)) {
    const mine = await store.bumpQuota(`story-u-${user.uid.replace(/[^A-Za-z0-9_-]/g, '')}-${istDay()}`, 2).catch(() => ({ allowed: true, used: 0 }));
    if (!mine.allowed) return c.json({ error: 'You made two stories today. Try again tomorrow.', code: 'daily-limit' }, 429);
    const all = await store.bumpQuota(`story-all-${istDay()}`, 20).catch(() => ({ allowed: true, used: 0 }));
    if (!all.allowed) return c.json({ error: 'Many stories were made today. Try again tomorrow.', code: 'daily-limit' }, 429);
  }
  return c.json(await createStoryJob(user.uid, [page.bytes]));
});
app.get('/api/stories', async (c) => {
  const user = await userFromRequest(c);
  if (!user) return signinRequired(c, 'see your stories');
  const docs = await store.listStories(user.uid, 100);
  return c.json(docs.map(({ owner, ...d }) => d), 200, { 'Cache-Control': 'no-store' });
});
app.get('/api/stories/:id', async (c) => {
  const doc = await store.getStory(c.req.param('id'));
  if (!doc) return c.json({ error: 'not found' }, 404);
  const { owner, ...pub } = doc;
  return c.json(pub, 200, { 'Cache-Control': doc.status === 'ready' ? 'public, max-age=30' : 'no-store' });
});
app.delete('/api/stories/:id', async (c) => {
  const user = await userFromRequest(c);
  if (!user) return signinRequired(c, 'manage your stories');
  const doc = await store.getStory(c.req.param('id'));
  if (!doc || doc.owner !== user.uid) return c.json({ error: 'not found' }, 404);
  await store.patchStory(doc.id, { owner: `deleted-${doc.owner}` });
  return c.json({ ok: true });
});
app.post('/api/reels', (c) => startJob(c, 'short'));
app.post('/api/chapters', (c) => startJob(c, 'chapter'));

async function myJob(c: Context) {
  const user = await userFromRequest(c);
  if (!user) return { error: signinRequired(c, 'see your videos') };
  const job = await store.getJob(c.req.param('id') ?? '');
  if (!job || job.owner !== user.uid) return { error: c.json({ error: 'not found' }, 404) };
  return { job, user };
}
app.get('/api/jobs', async (c) => {
  const user = await userFromRequest(c);
  if (!user) return signinRequired(c, 'see your videos');
  const jobs = await store.listJobs(user.uid, 100);
  return c.json(await Promise.all(jobs.map((j) => (j.status === 'queued' || j.status === 'running' ? heal(j) : j))), 200, { 'Cache-Control': 'no-store' });
});
async function getJobRoute(c: Context) {
  const r = await myJob(c); if ('error' in r && r.error) return r.error;
  let job = await heal(r.job!);
  // ?wait=<ms>: answer when the job changes (or the wait runs out), so a progress page does not need to poll hard
  const wait = Math.min(25000, Math.max(0, Number(c.req.query('wait')) || 0));
  const until = Date.now() + wait;
  while (wait && Date.now() < until && (job.status === 'queued' || job.status === 'running')) {
    await new Promise((res) => setTimeout(res, 1500));
    const next = await store.getJob(job.id); if (!next) break;
    if (next.updatedAt !== job.updatedAt || next.status !== job.status) { job = next; break; }
  }
  return c.json(job, 200, { 'Cache-Control': 'no-store' });
}
app.get('/api/jobs/:id', getJobRoute);
app.get('/api/reels/:id', getJobRoute);
app.get('/api/chapters/:id', getJobRoute);
/** The runner: Cloud Tasks calls this and the job runs inside the request (the instance keeps its CPU meanwhile). */
app.post('/api/jobs/:id/run', async (c) => c.json({ result: await runJob(c.req.param('id')) }));
app.post('/api/jobs/:id/retry', async (c) => { const r = await myJob(c); if ('error' in r && r.error) return r.error; return c.json(await retryJob(r.job!)); });
app.delete('/api/jobs/:id', async (c) => { const r = await myJob(c); if ('error' in r && r.error) return r.error; await store.deleteJob(r.job!.id); return c.json({ ok: true }); });

/** AR metrics from the phone (fps, losses, re-acquisitions); appended to the experience for evaluation. */
app.post('/api/experiences/:id/metrics', async (c) => {
  const rec = await store.getRecord(c.req.param('id'));
  if (!rec) return c.json({ error: 'not found' }, 404);
  let m: any; try { m = await c.req.json(); } catch { return c.json({ error: 'bad json' }, 400); }
  const list = [...((rec as any).arMetrics ?? []), m].slice(-50);
  await store.putRecord({ ...rec, arMetrics: list } as any);
  if (m.tutor) console.log(`[tutor] ${rec.id.slice(0, 8)} ${m.tutor} ${m.detail ?? ''} (${m.ua ?? ''})`);
  else console.log(`[ar] ${rec.id.slice(0, 8)} ${m.state} ${m.fps} fps ${m.trackedPts} pts losses ${m.losses} reacq ${m.reacquisitions} tracked ${m.framesTracked} lost ${m.framesLost}${m.final ? ' (final)' : ''}`);
  return c.json({ ok: true, n: list.length });
});

app.get('/api/library', async (c) => {
  const user = await userFromRequest(c);
  if (!user) return signinRequired(c, 'keep a library');
  const recs = await store.listRecords(user.uid, 200);
  return c.json(recs.map((r) => ({ id: r.id, createdAt: r.createdAt, title: r.quick.title, kind: r.quick.kind, subject: r.quick.subject, language: r.quick.language, pageImageUrl: r.page.imageUrl, verification: r.verification?.status, bookId: r.bookId })));
});

app.delete('/api/library', async (c) => {
  const user = await userFromRequest(c);
  if (!user) return signinRequired(c, 'manage your library');
  return c.json({ deleted: await store.deleteOwner(user.uid) });
});
app.delete('/api/experiences/:id', async (c) => {
  const user = await userFromRequest(c);
  if (!user) return signinRequired(c, 'manage your library');
  const rec = await store.getRecord(c.req.param('id'));
  if (!rec || rec.ownerId !== user.uid) return c.json({ error: 'not found' }, 404);
  await store.deleteRecord(rec.id);
  return c.json({ ok: true });
});

app.get('/api/files/:id/:name', async (c) => {
  const f = await store.getFile(c.req.param('id'), c.req.param('name'));
  if (!f) return c.text('not found', 404);
  const size = f.bytes.length;
  const headers = { 'Content-Type': f.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(c.req.header('range') ?? '');
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2])), end = m[1] && m[2] ? Number(m[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return c.body(null, 416, { 'Content-Range': `bytes */${size}` });
    return c.body(new Uint8Array(f.bytes.subarray(start, end + 1)), 206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) });
  }
  return c.body(new Uint8Array(f.bytes), 200, { ...headers, 'Content-Length': String(size) });
});

// The developer platform: key management for the dashboard (/api/dev) and the public REST API (/v1)
mountDeveloperPlatform(app);

// The embed SDK (a script tag for partner sites) and the Node SDK package, built from packages/sdk
const sdkDist = process.env.SDK_DIST || path.resolve(process.cwd(), '../../packages/sdk/dist');
const SDK_FILES: Record<string, string> = { 'v1.js': 'text/javascript; charset=utf-8', 'living-textbook-sdk.tgz': 'application/gzip' };
app.get('/sdk/:file', (c) => {
  const name = path.basename(c.req.param('file'));
  const type = SDK_FILES[name];
  const file = path.join(sdkDist, name);
  if (!type || !fs.existsSync(file)) return c.text('not found', 404);
  return c.body(new Uint8Array(fs.readFileSync(file)), 200, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': name.endsWith('.js') ? 'public, max-age=300' : 'no-cache', ...(name.endsWith('.tgz') ? { 'Content-Disposition': `attachment; filename="${name}"` } : {}) });
});

// Who may frame what: a lesson embed anywhere; the scanner embed only on the sites its publishable key lists (and on
// this site, for the dashboard's preview); every other page only here.
app.use('*', async (c, next) => {
  await next();
  if (!c.req.path.startsWith('/embed/') && (c.res.headers.get('content-type') ?? '').includes('text/html')) c.res.headers.set('Content-Security-Policy', "frame-ancestors 'self'");
});

// Production: serve the built web app (apps/web/dist) and fall back to index.html for client routes.
const webDist = process.env.WEB_DIST || path.resolve(process.cwd(), '../web/dist');
if (fs.existsSync(webDist)) {
  const rel = path.relative(process.cwd(), webDist) || '.';
  const indexHtml = () => fs.readFileSync(path.join(webDist, 'index.html'), 'utf8');
  app.use('/assets/*', serveStatic({ root: rel }));
  app.use('/*', serveStatic({ root: rel }));
  app.get('/embed/*', async (c) => {
    let ancestors = '*';
    if (c.req.path.startsWith('/embed/scan')) {
      const key = await resolveKey(c.req.query('key'));
      ancestors = key && key.kind === 'publishable' ? `'self' ${frameAncestors(key.origins)}` : "'self'";
    }
    return c.html(indexHtml(), 200, { 'Content-Security-Policy': `frame-ancestors ${ancestors}`, 'Cache-Control': 'no-cache' });
  });
  app.get('*', (c) => c.html(indexHtml()));
  console.log(`[web] serving ${webDist}`);
}

warmTracking().then(() => console.log('[tracking] worker pool warm')).catch((e) => console.warn('[tracking] pool failed', e));
const server = serve({ fetch: app.fetch, port: config.port }, (info) => console.log(`[server] listening on http://localhost:${info.port} (project ${config.project}, ${config.location})`));
// Voice Q&A: WebSocket proxy to the Gemini Live API at /api/live
const wss = new WebSocketServer({ noServer: true });
(server as any).on('upgrade', (req: any, socket: any, head: any) => {
  if (!String(req.url).startsWith('/api/live')) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => { handleLiveSocket(ws).catch((e) => { console.error('[live]', e); try { ws.close(); } catch { /* ok */ } }); });
});
