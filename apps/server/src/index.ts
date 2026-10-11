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
import { startReel, getReel } from './reels.js';
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
  const ownerId = c.req.header('x-owner-id') || 'anonymous';
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

/** Explainer reels: a page in, a short film of its lesson out (the job runs on this instance, one at a time). */
app.post('/api/reels', async (c) => {
  const mime = c.req.header('content-type') || 'image/jpeg';
  const body = Buffer.from(await c.req.arrayBuffer());
  if (!body.length) return c.json({ error: 'no file' }, 400);
  if (body.length > 25 * 1024 * 1024) return c.json({ error: 'file too large' }, 413);
  const job = startReel({ image: body, mime, ownerId: c.req.header('x-owner-id') || 'anonymous', seconds: Number(c.req.query('seconds')) || undefined });
  return c.json({ id: job.id, status: job.status, detail: job.detail });
});
app.get('/api/reels/:id', (c) => { const j = getReel(c.req.param('id')); return j ? c.json(j) : c.json({ error: 'not found' }, 404); });

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
  const ownerId = c.req.header('x-owner-id') || 'anonymous';
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
