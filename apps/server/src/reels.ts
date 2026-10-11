// Explainer reels: a page (photo or the first page of a PDF) goes through the same pipeline as a live lesson, the
// finished experience is played in presentation mode inside a headless browser on this server while the tutor
// teaches it, and the capture is mixed with the tutor's voice into an MP4. Jobs run one at a time.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { runPipeline } from './pipeline.js';
import { store } from './store.js';
import type { PipelineEvent } from '@living-book/scene';

const run = promisify(execFile);

export type ReelJob = {
  id: string; ownerId: string; createdAt: number; status: 'queued' | 'generating' | 'recording' | 'encoding' | 'ready' | 'failed';
  detail: string; experienceId?: string; url?: string; error?: string; seconds: number; title?: string;
};

const jobs = new Map<string, ReelJob>();
let queue: Promise<void> = Promise.resolve();
const MAX_JOBS_KEPT = 50;

export function getReel(id: string) { return jobs.get(id) ?? null; }

/** Queue a reel for a page image (or PDF: its first page). Returns the job immediately; poll getReel for progress. */
export function startReel(input: { image: Buffer; mime: string; ownerId: string; seconds?: number }): ReelJob {
  const id = crypto.randomUUID();
  const job: ReelJob = { id, ownerId: input.ownerId, createdAt: Date.now(), status: 'queued', detail: 'Waiting for its turn', seconds: Math.min(90, Math.max(20, input.seconds ?? 50)) };
  jobs.set(id, job);
  if (jobs.size > MAX_JOBS_KEPT) { const oldest = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt)[0]; if (oldest && oldest.status !== 'generating' && oldest.status !== 'recording') jobs.delete(oldest.id); }
  queue = queue.then(() => makeReel(job, input).catch((e) => { job.status = 'failed'; job.error = String(e?.message || e).slice(0, 200); job.detail = 'Something went wrong'; console.error('[reel] failed', job.id, job.error); }));
  return job;
}

async function pageImage(image: Buffer, mime: string): Promise<Buffer> {
  if (mime === 'application/pdf' || image.subarray(0, 4).toString() === '%PDF') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lb-pdf-'));
    const pdf = path.join(dir, 'in.pdf'); await fs.writeFile(pdf, image);
    await run('pdftoppm', ['-r', '120', '-f', '1', '-l', '1', '-jpeg', '-jpegopt', 'quality=88', pdf, path.join(dir, 'page')]);
    const out = (await fs.readdir(dir)).find((f) => f.startsWith('page') && f.endsWith('.jpg'));
    if (!out) throw new Error('the PDF has no page to read');
    const bytes = await fs.readFile(path.join(dir, out));
    await fs.rm(dir, { recursive: true, force: true });
    return bytes;
  }
  return image;
}

async function makeReel(job: ReelJob, input: { image: Buffer; mime: string; ownerId: string }) {
  job.status = 'generating'; job.detail = 'Reading the page';
  const image = await pageImage(input.image, input.mime);
  const jpeg = await sharp(image, { failOn: 'none' }).rotate().jpeg({ quality: 90 }).toBuffer();
  let revealed = false;
  const rec = await runPipeline({ image: jpeg, mime: 'image/jpeg', ownerId: input.ownerId }, (e: PipelineEvent) => {
    if (e.type === 'quick') { job.title = e.data.title; job.detail = 'Sketching the scene'; }
    if (e.type === 'scene' && e.version === 1) job.detail = 'Checking it against the page';
    if (e.type === 'ready') { revealed = true; job.detail = 'Scene verified; richer version on its way'; }
    if (e.type === 'error' && !e.recoverable) throw new Error(e.message);
  });
  if (!revealed || !rec.scene) throw new Error('no usable scene');
  job.experienceId = rec.id;
  job.status = 'recording'; job.detail = 'Recording the lesson';
  const mp4 = await record(rec.id, job);
  job.status = 'encoding'; job.detail = 'Saving the reel';
  job.url = await store.putFile(rec.id, 'reel', mp4, 'video/mp4');
  job.status = 'ready'; job.detail = 'Ready';
  console.log(`[reel] ${job.id} ready: ${job.url} (${(mp4.length / 1e6).toFixed(1)} MB)`);
}

/** Play the experience in presentation mode in headless Chromium, capture video, then mix the tutor's voice in. */
async function record(experienceId: string, job: ReelJob): Promise<Buffer> {
  const { chromium } = await import('playwright');
  const port = Number(process.env.PORT || 8080);
  const base = `http://127.0.0.1:${port}`;
  const rec = await store.getRecord(experienceId);
  const pw = rec?.page.w ?? 1000, ph = rec?.page.h ?? 1400;
  const width = 1080, height = Math.min(1600, Math.round((width * ph) / pw));
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'lb-reel-'));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, recordVideo: { dir: work, size: { width, height } } });
    const page = await ctx.newPage();
    await page.addInitScript('window.__captureLive = true;');
    await page.goto(`${base}/x/${experienceId}?present=1`, { waitUntil: 'load' });
    const t0 = await page.evaluate(() => performance.now());
    await page.waitForFunction("document.documentElement.dataset.assetsReady === '1'", null, { timeout: 20000 }).catch(() => {});
    const seconds = job.seconds;
    for (let s = 0; s < seconds; s += 5) { await page.waitForTimeout(Math.min(5000, (seconds - s) * 1000)); job.detail = `Recording the lesson (${Math.min(seconds, s + 5)} of ${seconds} s)`; }
    const live: { at: number; data: string }[] = await page.evaluate('(window.__liveAudio || []).slice()');
    const clips: { at: number; url: string }[] = await page.evaluate('(window.__clipLog || []).slice()');
    await page.close(); await ctx.close();
    const webm = (await fs.readdir(work)).find((f) => f.endsWith('.webm'));
    if (!webm) throw new Error('no video captured');
    // audio: the tutor's voice segments, or the recorded clips when it did not speak
    const inputs = ['-i', path.join(work, webm)]; const filters: string[] = []; let n = 0;
    const segments: { at: number; end: number; parts: Buffer[] }[] = [];
    for (const ch of live) {
      const bytes = Buffer.from(ch.data, 'base64'); const last = segments[segments.length - 1];
      if (last && ch.at - last.end < 400) { last.parts.push(bytes); last.end = ch.at + (bytes.length / 2 / 24000) * 1000; }
      else segments.push({ at: ch.at, end: ch.at + (bytes.length / 2 / 24000) * 1000, parts: [bytes] });
    }
    for (const seg of segments) {
      const delay = Math.max(0, Math.round(seg.at - t0)); if (delay > seconds * 1000) continue;
      const pcm = Buffer.concat(seg.parts); const wav = path.join(work, `live-${n}.wav`);
      const header = Buffer.alloc(44);
      header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
      await fs.writeFile(wav, Buffer.concat([header, pcm])); n++; inputs.push('-i', wav); filters.push(`[${n}]adelay=${delay}|${delay}[a${n}]`);
    }
    if (!segments.length) for (const c of clips) {
      const delay = Math.max(0, Math.round(c.at - t0)); if (delay > seconds * 1000) continue;
      const m = /\/api\/files\/([^/]+)\/([^/?]+)/.exec(c.url); if (!m) continue;
      const file = await store.getFile(m[1]!, m[2]!).catch(() => null); if (!file) continue;
      const wav = path.join(work, `clip-${n}.wav`); await fs.writeFile(wav, file.bytes); n++; inputs.push('-i', wav); filters.push(`[${n}]adelay=${delay}|${delay}[a${n}]`);
    }
    const out = path.join(work, 'reel.mp4');
    const args = n
      ? [...inputs, '-filter_complex', `${filters.join(';')};${Array.from({ length: n }, (_, i) => `[a${i + 1}]`).join('')}amix=inputs=${n}:normalize=0:dropout_transition=0[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-t', String(seconds), '-movflags', '+faststart', '-y', out]
      : [...inputs, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', '30', '-an', '-t', String(seconds), '-movflags', '+faststart', '-y', out];
    await run('ffmpeg', args, { maxBuffer: 1 << 26 });
    return await fs.readFile(out);
  } finally {
    await browser.close().catch(() => {});
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
