#!/usr/bin/env node
// Record a video of an experience as a reader would see it (presentation mode: whole page, title, captions), then
// mix the narration clips in at the moments they played, so the video carries the voice too.
//   node eval/record.mjs --server http://localhost:8080 --ids <id1,id2,...> --out eval/output/videos --seconds 45
//   node eval/record.mjs --from eval/output/<stamp>          (ids from results.json)
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
const run = promisify(execFile);
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : [])).filter(Boolean));
const SERVER = args.server || 'http://localhost:8080';
const OUT = path.resolve(String(args.out || 'eval/output/videos'));
const SECONDS = Number(args.seconds || 45);
await fs.mkdir(OUT, { recursive: true });
let ids = args.ids ? String(args.ids).split(',') : [];
let names = new Map();
if (args.from) { const res = JSON.parse(await fs.readFile(path.join(String(args.from), 'results.json'), 'utf8')); ids = res.map((r) => r.id).filter(Boolean); for (const r of res) if (r.id) names.set(r.id, r.file.replace(/\.(jpe?g|png)$/i, '')); }
if (!ids.length) { console.error('no ids'); process.exit(1); }

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
for (const id of ids) {
  const name = names.get(id) ?? id;
  const work = path.join(OUT, `.work-${id}`);
  await fs.mkdir(work, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordVideo: { dir: work, size: { width: 1080, height: 1920 } } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.addInitScript(() => { window.__captureLive = true; });
  await page.goto(`${SERVER}/x/${id}?present=1`, { waitUntil: 'load' });
  const t0 = await page.evaluate(() => performance.now()); // page clock at (about) the start of the recording
  await page.waitForFunction(() => document.documentElement.dataset.assetsReady === '1', null, { timeout: 15000 }).catch(() => errors.push('assets not ready in 15 s'));
  await page.waitForTimeout(SECONDS * 1000);
  const clips = await page.evaluate(() => (window.__clipLog ?? []).slice());
  const live = await page.evaluate(() => (window.__liveAudio ?? []).slice());
  const rec = await fetch(`${SERVER}/api/experiences/${id}`).then((r) => r.json());
  await page.close();
  await ctx.close(); // flushes the video file
  const files = (await fs.readdir(work)).filter((f) => f.endsWith('.webm'));
  if (!files.length) { console.log(`${name}: no video captured`); continue; }
  const webm = path.join(work, files[0]);
  // narration clips at their offsets (the video starts a little before t0; the offset error is well under a second)
  const inputs = ['-i', webm];
  const filters = [];
  let n = 0;
  // the tutor's voice: consecutive chunks form one segment, written as a 24 kHz WAV at the moment it was scheduled
  const segments = [];
  for (const ch of live) {
    const bytes = Buffer.from(ch.data, 'base64');
    const last = segments[segments.length - 1];
    if (last && ch.at - last.end < 400) { last.parts.push(bytes); last.end = ch.at + (bytes.length / 2 / 24000) * 1000; }
    else segments.push({ at: ch.at, end: ch.at + (bytes.length / 2 / 24000) * 1000, parts: [bytes] });
  }
  for (const seg of segments) {
    const delay = Math.max(0, Math.round(seg.at - t0));
    if (delay > SECONDS * 1000) continue;
    const pcm = Buffer.concat(seg.parts);
    const wav = path.join(work, `live-${n}.wav`);
    const header = Buffer.alloc(44);
    header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    await fs.writeFile(wav, Buffer.concat([header, pcm]));
    n++;
    inputs.push('-i', wav);
    filters.push(`[${n}]adelay=${delay}|${delay}[a${n}]`);
  }
  for (const c of (segments.length ? [] : clips)) {
    const delay = Math.max(0, Math.round(c.at - t0));
    if (delay > SECONDS * 1000) continue;
    const wav = path.join(work, `${n}.wav`);
    const bytes = await fetch(`${SERVER}${c.url}`).then((r) => r.arrayBuffer()).catch(() => null);
    if (!bytes) continue;
    await fs.writeFile(wav, Buffer.from(bytes));
    n++;
    inputs.push('-i', wav);
    filters.push(`[${n}]adelay=${delay}|${delay}[a${n}]`);
  }
  const out = path.join(OUT, `${name}.mp4`);
  const ffArgs = n
    ? [...inputs, '-filter_complex', `${filters.join(';')};${Array.from({ length: n }, (_, i) => `[a${i + 1}]`).join('')}amix=inputs=${n}:normalize=0:dropout_transition=0[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-t', String(SECONDS), '-movflags', '+faststart', '-y', out]
    : [...inputs, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-an', '-t', String(SECONDS), '-movflags', '+faststart', '-y', out];
  try { await run('ffmpeg', ffArgs, { maxBuffer: 1 << 26 }); } catch (e) { console.log(`${name}: ffmpeg failed: ${String(e.stderr || e.message).slice(-300)}`); continue; }
  const size = (await fs.stat(out)).size;
  console.log(`${name}: ${out} (${(size / 1e6).toFixed(1)} MB, ${n} audio parts${segments.length ? ' from the live tutor' : ''}, ${rec.quick?.title ?? ''}${errors.length ? `, errors: ${errors.slice(0, 2).join(' | ')}` : ''})`);
  await fs.rm(work, { recursive: true, force: true });
}
await browser.close();
