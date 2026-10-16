// Screen capture for the demo video: Chrome's screencast (sharp JPEG frames with wall-clock times) instead of
// Playwright's recorder, the tutor's voice as the page scheduled it, and a log of events, all on one clock.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Playwright comes from the eval package (pnpm install in eval/)
export const PW = new URL('../../eval/node_modules/playwright/index.mjs', import.meta.url).href;

/** Start recording `page`. Frames land in `dir`; stop() returns them with their times (epoch ms). */
export async function startCapture(page, dir, { width = 1920, height = 1080, quality = 92 } = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const client = await page.context().newCDPSession(page);
  const frames = [];
  let n = 0, writing = Promise.resolve();
  client.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = path.join(dir, `f${String(n++).padStart(6, '0')}.jpg`);
    frames.push({ file, t: metadata.timestamp * 1000 });
    writing = writing.then(() => fs.promises.writeFile(file, Buffer.from(data, 'base64')));
    client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await client.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: width, maxHeight: height, everyNthFrame: 1 });
  const events = [];
  const startedAt = Date.now();
  return {
    startedAt,
    /** note something that happened now (wall clock) */
    mark(name, data = {}) { events.push({ name, t: Date.now(), ...data }); },
    async stop() {
      await client.send('Page.stopScreencast').catch(() => {});
      await writing;
      return { frames, events, startedAt };
    },
  };
}

/** Frames (with their times) into a constant-rate H.264 video, holding each frame until the next one arrived. */
export function framesToVideo(frames, out, { fps = 30, from = frames[0]?.t, to = frames[frames.length - 1]?.t, size = '1920:1080' } = {}) {
  const list = frames.filter((f, i) => f.t <= to && (frames[i + 1]?.t ?? Infinity) >= from);
  if (!list.length) throw new Error('no frames in range');
  const lines = [];
  for (let i = 0; i < list.length; i++) {
    const start = Math.max(from, list[i].t), end = Math.min(to, list[i + 1]?.t ?? to + 1000 / fps);
    const d = Math.max(0.001, (end - start) / 1000);
    lines.push(`file '${path.resolve(list[i].file)}'`, `duration ${d.toFixed(4)}`);
  }
  lines.push(`file '${path.resolve(list[list.length - 1].file)}'`);
  const txt = `${out}.frames.txt`;
  fs.writeFileSync(txt, lines.join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', txt, '-vf', `fps=${fps},scale=${size}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-r', String(fps), '-t', ((to - from) / 1000).toFixed(3), out]);
  fs.rmSync(txt, { force: true });
  return out;
}

/** The tutor's voice chunks (window.__liveAudio, 24 kHz PCM) as WAV segments with their start (epoch ms). */
export function liveAudioSegments(chunks, timeOrigin, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const segs = [];
  for (const ch of chunks) {
    const bytes = Buffer.from(ch.data, 'base64');
    const at = timeOrigin + ch.at, dur = (bytes.length / 2 / 24000) * 1000;
    const last = segs[segs.length - 1];
    if (last && at - last.end < 400) {
      // a short gap between chunks stays in as silence, so the voice keeps the page's timing
      const gap = Math.round(((at - last.end) / 1000) * 24000);
      if (gap > 0) last.parts.push(Buffer.alloc(gap * 2));
      last.parts.push(bytes);
      last.end = Math.max(last.end, at) + dur;
    } else segs.push({ start: at, end: at + dur, parts: [bytes] });
  }
  return segs.map((s, i) => {
    const pcm = Buffer.concat(s.parts);
    const file = path.join(dir, `tutor-${i}.wav`);
    fs.writeFileSync(file, Buffer.concat([wavHeader(pcm.length, 24000), pcm]));
    return { file, start: s.start, end: s.start + (pcm.length / 2 / 24000) * 1000 };
  });
}

export function wavHeader(bytes, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(bytes, 40);
  return h;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
