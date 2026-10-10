// Spike server: serves the built page, compiles MindAR detection data for a captured page (parallel across cores),
// and stores uploaded captures locally for the Gemini latency spike.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import sharp from 'sharp';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import * as msgpack from '@msgpack/msgpack';
import { buildImageList, buildTrackingImageList } from 'mind-ar/src/image-target/image-list.js';
import { extractTrackingFeatures } from 'mind-ar/src/image-target/tracker/extract-utils.js';

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const UPLOADS = path.join(ROOT, 'uploads');
await fs.mkdir(UPLOADS, { recursive: true });

// ---- worker pool for detection levels ----
const N = Math.min(os.cpus().length, 8);
const pool = Array.from({ length: N }, () => new Worker(new URL('./level-worker.mjs', import.meta.url)));
const runLevel = (w, image) => new Promise((resolve) => { w.once('message', resolve); w.postMessage(image); });
await Promise.all(pool.map((w) => new Promise((r) => w.once('message', r).postMessage({ ping: true }))));
console.log(`compile pool: ${N} workers ready`);

async function compileTarget(grey, width, height) {
  const t0 = Date.now();
  const target = { data: grey, width, height };
  const tracking = extractTrackingFeatures(buildTrackingImageList(target), () => {});
  const tTrack = Date.now();
  const imageList = buildImageList(target);
  const levels = imageList.map((img, i) => ({ img, i })).sort((a, b) => b.img.width - a.img.width);
  const results = new Array(imageList.length);
  let next = 0;
  await Promise.all(pool.map(async (w) => { while (next < levels.length) { const { img, i } = levels[next++]; results[i] = await runLevel(w, img); } }));
  const tMatch = Date.now();
  const buffer = msgpack.encode({ v: 2, dataList: [{ targetImage: { width, height }, trackingData: tracking, matchingData: results }] });
  return { buffer, ms: Date.now() - t0, trackMs: tTrack - t0, matchMs: tMatch - tTrack, levels: imageList.length,
    trackPts: tracking.map((l) => l.points.length), matchPts: results.map((r) => r.maximaPoints.length + r.minimaPoints.length) };
}

const app = new Hono();
app.post('/api/compile', async (c) => {
  const w = Math.min(Math.max(Number(c.req.query('w') || 800), 320), 1600);
  const body = Buffer.from(await c.req.arrayBuffer());
  const t0 = Date.now();
  const { data, info } = await sharp(body).rotate().resize({ width: w }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const decodeMs = Date.now() - t0;
  const r = await compileTarget(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
  console.log(`compile ${info.width}x${info.height}: decode ${decodeMs} ms, compile ${r.ms} ms (track ${r.trackMs}, match ${r.matchMs}), ${Math.round(r.buffer.byteLength / 1024)} KB`);
  return c.json({ width: info.width, height: info.height, decodeMs, ms: r.ms, trackMs: r.trackMs, matchMs: r.matchMs, levels: r.levels,
    trackPts: r.trackPts, matchPts: r.matchPts, buffer: Buffer.from(r.buffer).toString('base64') });
});
app.post('/api/upload', async (c) => {
  const name = (c.req.query('name') || 'capture').replace(/[^a-z0-9_-]/gi, '_');
  const body = Buffer.from(await c.req.arrayBuffer());
  const file = `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}.jpg`;
  await fs.writeFile(path.join(UPLOADS, file), body);
  console.log(`upload ${file} (${Math.round(body.length / 1024)} KB)`);
  return c.json({ path: `uploads/${file}`, bytes: body.length });
});
app.use('/*', async (c, next) => { await next(); if (!c.req.path.startsWith('/assets/')) c.header('Cache-Control', 'no-store'); });
app.use('/*', serveStatic({ root: path.relative(process.cwd(), path.join(ROOT, 'dist')) || 'dist' }));

serve({ fetch: app.fetch, port: PORT }, (info) => console.log(`spike server on http://localhost:${info.port} (serving ${path.join(ROOT, 'dist')})`));
