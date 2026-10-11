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
import { startReel, getReel, waitReel } from './reels.js';
import { showcase, askShowcase } from './showcase.js';
import { userFromRequest, ownerOf } from './auth.js';
import { recordEvent, touchUser, me, insights } from './progress.js';
import { quizFor } from './quiz.js';
import { startChapter, getChapter, waitChapter } from './chapters.js';
import type { PipelineEvent } from '@living-book/scene';

const app = new Hono();
app.use('/api/*', cors());

app.get('/api/health', (c) => c.json({ ok: true, models: Object.fromEntries(Object.entries(config.models).map(([k, v]) => [k, v.id])), time: new Date().toISOString() }));

/** Create an experience from a page photo. Body: raw image bytes. Response: SSE stream of pipeline events. */
app.post('/api/experiences', async (c) => {
  const mime = c.req.header('content-type') || 'image/jpeg';
  if (!mime.startsWith('image/')) return c.json({ error: 'send the page photo as the raw body with an image/* content type' }, 400);
  const image = Buffer.from(await c.req.arrayBuffer());
  if (image.length < 1000) return c.json({ error: 'image too small' }, 400);
  if (image.length > 15 * 1024 * 1024) return c.json({ error: 'image too large (15 MB max)' }, 413);
  const { owner: ownerId } = await ownerOf(c);
  const bookId = c.req.header('x-book-id') || undefined;
  const id = randomUUID();
  return streamSSE(c, async (stream) => {
    // writes are chained so the stream only closes after the last event has been flushed
    let chain: Promise<void> = Promise.resolve();
    const write = (e: PipelineEvent) => { chain = chain.then(() => stream.writeSSE({ event: e.type, data: JSON.stringify(e) })).catch(() => {}); return chain; };
    const keepAlive = setInterval(() => { chain = chain.then(() => stream.writeSSE({ event: 'ping', data: String(Date.now()) })).catch(() => {}); }, 15000);
    try {
      await runPipeline({ id, image, mime, ownerId, bookId }, (e) => { void write(e); });
    } catch (e: any) {
      console.error('[pipeline] fatal', e);
      void write({ type: 'error', message: String(e?.message || e), recoverable: false, t: 0 });
    } finally { clearInterval(keepAlive); await chain; }
  });
});

app.get('/api/experiences/:id', async (c) => {
  const rec = await store.getRecord(c.req.param('id'));
  if (!rec) return c.json({ error: 'not found' }, 404);
  const { events, ...rest } = rec;
  return c.json(c.req.query('events') ? rec : rest, 200, { 'Cache-Control': 'private, max-age=60' });
});

/** Public web configuration: Firebase (sign-in, analytics) comes from the environment, so no keys live in the repo. */
app.get('/api/config', (c) => {
  const apiKey = process.env.FIREBASE_API_KEY, appId = process.env.FIREBASE_APP_ID;
  const firebase = apiKey && appId ? { apiKey, appId, projectId: config.project, authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${config.project}.firebaseapp.com`, messagingSenderId: appId.split(':')[1], measurementId: process.env.FIREBASE_MEASUREMENT_ID || undefined } : null;
  return c.json({ firebase }, 200, { 'Cache-Control': 'public, max-age=300' });
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

/** Chapter films for teachers: a chapter PDF in, a narrated 16:9 explainer of its key ideas out (long-polled like reels). */
app.post('/api/chapters', async (c) => {
  const body = Buffer.from(await c.req.arrayBuffer());
  if (body.length < 1000 || body.subarray(0, 4).toString() !== '%PDF') return c.json({ error: 'send the chapter as a PDF' }, 400);
  if (body.length > 30 * 1024 * 1024) return c.json({ error: 'the PDF is larger than 30 MB' }, 413);
  const { owner, user } = await ownerOf(c);
  const job = startChapter({ pdf: body, ownerId: owner, sections: Number(c.req.query('sections')) || undefined });
  void recordEvent(user, owner, { event: 'chapter', detail: `started ${job.id}` }, c.req.header('user-agent') || '').catch(() => {});
  return c.json(job);
});
app.get('/api/chapters/:id', async (c) => { const wait = Math.min(50000, Math.max(0, Number(c.req.query('wait')) || 0)); const j = wait ? await waitChapter(c.req.param('id'), wait) : getChapter(c.req.param('id')); return j ? c.json(j) : c.json({ error: 'not found' }, 404); });

/** Explainer reels: a page in, a short film of its lesson out (the job runs on this instance, one at a time). */
app.post('/api/reels', async (c) => {
  const mime = c.req.header('content-type') || 'image/jpeg';
  const body = Buffer.from(await c.req.arrayBuffer());
  if (!body.length) return c.json({ error: 'no file' }, 400);
  if (body.length > 25 * 1024 * 1024) return c.json({ error: 'file too large' }, 413);
  const job = startReel({ image: body, mime, ownerId: c.req.header('x-owner-id') || 'anonymous', seconds: Number(c.req.query('seconds')) || undefined });
  return c.json({ id: job.id, status: job.status, detail: job.detail });
});
// ?wait=<ms> holds the request until something changes (long-poll): on Cloud Run the CPU is only allocated while a request is in flight
app.get('/api/reels/:id', async (c) => { const wait = Math.min(50000, Math.max(0, Number(c.req.query('wait')) || 0)); const j = wait ? await waitReel(c.req.param('id'), wait) : getReel(c.req.param('id')); return j ? c.json(j) : c.json({ error: 'not found' }, 404); });

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
  const ownerId = (await ownerOf(c)).owner;
  const recs = await store.listRecords(ownerId);
  return c.json(recs.map((r) => ({ id: r.id, createdAt: r.createdAt, title: r.quick.title, kind: r.quick.kind, subject: r.quick.subject, language: r.quick.language, pageImageUrl: r.page.imageUrl, verification: r.verification?.status, bookId: r.bookId })));
});

app.delete('/api/library', async (c) => {
  const ownerId = c.req.header('x-owner-id');
  if (!ownerId || ownerId === 'anonymous') return c.json({ error: 'owner required' }, 400);
  return c.json({ deleted: await store.deleteOwner(ownerId) });
});

app.get('/api/files/:id/:name', async (c) => {
  const f = await store.getFile(c.req.param('id'), c.req.param('name'));
  if (!f) return c.text('not found', 404);
  return c.body(new Uint8Array(f.bytes), 200, { 'Content-Type': f.mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
});

// Production: serve the built web app (apps/web/dist) and fall back to index.html for client routes.
const webDist = process.env.WEB_DIST || path.resolve(process.cwd(), '../web/dist');
if (fs.existsSync(webDist)) {
  const rel = path.relative(process.cwd(), webDist) || '.';
  app.use('/assets/*', serveStatic({ root: rel }));
  app.use('/*', serveStatic({ root: rel }));
  app.get('*', (c) => c.html(fs.readFileSync(path.join(webDist, 'index.html'), 'utf8')));
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
