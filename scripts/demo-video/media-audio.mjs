// The sound a take played, rebuilt on the take's clock (0 = its first frame) as one WAV: every media element the page
// played (from the take's media log: the story's voices, its music, each clip's own sound, at the volume and speed the
// page used), the Gemini Live voice (live.json), and the student's question played into the simulated microphone.
//   node scripts/demo-video/media-audio.mjs <take dir> [question=<wav>@<seconds after the microphone started>]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { liveAudioSegments, wavHeader } from './capture-lib.mjs';

const [dir, ...kv] = process.argv.slice(2);
const opt = Object.fromEntries(kv.map((s) => s.split(/=(.*)/s).slice(0, 2)));
const take = JSON.parse(fs.readFileSync(path.join(dir, 'take.json'), 'utf8'));
const f0 = take.frames[0].t, total = (take.frames.at(-1).t - f0) / 1000 + 0.5;
const RATE = 48000;
// two stems: who speaks (voice lines, the Live voice, the question) and the bed under them (music, clip sound)
const stems = { voice: new Float32Array(Math.ceil(total * RATE) * 2), bed: new Float32Array(Math.ceil(total * RATE) * 2) };
const cache = path.join(dir, '..', 'media-cache');
fs.mkdirSync(cache, { recursive: true });

/** decode part of a file to 48 kHz stereo float, with speed and volume, and add it to the mix at `at` seconds */
function add(file, { at, from = 0, dur = null, rate = 1, vol = 1, stem = 'voice' }) {
  const mix = stems[stem];
  const af = [rate !== 1 ? `atempo=${rate.toFixed(4)}` : null, vol !== 1 ? `volume=${vol.toFixed(4)}` : null].filter(Boolean).join(',');
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', from.toFixed(3), ...(dur ? ['-t', (dur * rate).toFixed(3)] : []), '-i', file,
    ...(af ? ['-af', af] : []), '-vn', '-ac', '2', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const s = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const o = Math.round(at * RATE) * 2;
  for (let i = 0; i < s.length && o + i < mix.length; i++) if (o + i >= 0) mix[o + i] += s[i];
  return s.length / 2 / RATE;
}
async function local(url) {
  const file = path.join(cache, path.basename(new URL(url).pathname));
  if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  return file;
}

// 1. media elements: a segment runs from "playing" to pause/end/new source; a change of volume, position or speed
//    starts a new segment where the old one stopped
const segs = [], state = new Map();
const close = (s, at) => { if (s.on && at - s.start > 0.04) segs.push({ ...s, end: at }); s.on = false; };
const open = (s, e) => Object.assign(s, { on: true, id: e.id, src: e.src, from: e.ct, start: e.at, vol: e.vol, muted: e.muted, rate: e.rate });
for (const m of take.media ?? []) {
  const e = { ...m, at: (take.timeOrigin + m.t - f0) / 1000 };
  const s = state.get(e.id) ?? { on: false };
  state.set(e.id, s);
  if (e.ev === 'playing') { close(s, e.at); open(s, e); }
  else if (['pause', 'ended', 'emptied'].includes(e.ev)) close(s, e.at);
  else if (['volumechange', 'seeked', 'ratechange'].includes(e.ev) && s.on) { close(s, e.at); open(s, e); }
}
for (const s of state.values()) close(s, total - 0.5);
let n = 0;
for (const s of segs) {
  if (!s.src || s.src.startsWith('data:') || s.muted || s.vol <= 0) continue;
  add(await local(s.src), { at: s.start, from: s.from, dur: s.end - s.start, rate: s.rate, vol: s.vol, stem: /\/v-[^/]+\.wav$/.test(s.src) ? 'voice' : 'bed' });
  n++;
}
// 2. the Gemini Live voice, where the page scheduled it
const live = fs.existsSync(path.join(dir, 'live.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'live.json'), 'utf8')) : [];
const voice = live.length ? liveAudioSegments(live, take.timeOrigin, path.join(dir, 'voice')) : [];
for (const v of voice) add(v.file, { at: (v.start - f0) / 1000 });
// 3. the student's question, as the simulated microphone played it
let q = null;
if (opt.question && take.micStartedAt) {
  const [file, delay] = opt.question.split('@');
  q = (take.timeOrigin + take.micStartedAt - f0) / 1000 + Number(delay);
  add(file, { at: q });
}
const write = (name, ...parts) => {
  const pcm = Buffer.alloc(parts[0].length * 2);
  for (let i = 0; i < parts[0].length; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(parts.reduce((a, p) => a + p[i], 0) * 32767))), i * 2);
  const h = wavHeader(pcm.length, RATE);
  h.writeUInt16LE(2, 22); h.writeUInt32LE(RATE * 4, 28); h.writeUInt16LE(4, 32); // stereo
  fs.writeFileSync(path.join(dir, name), Buffer.concat([h, pcm]));
};
write('app-audio.wav', stems.voice, stems.bed);
write('app-voice.wav', stems.voice);
write('app-bed.wav', stems.bed);
// when someone speaks in the take (for the music under the video): voice lines, the Live voice and the question
const speech = [
  ...segs.filter((s) => /\/v-[^/]+\.wav$/.test(s.src) && !s.muted).map((s) => [s.start, s.end]),
  ...voice.map((v) => [(v.start - f0) / 1000, (v.end - f0) / 1000]),
  ...(q !== null ? [[q, q + 3.3]] : []),
];
fs.writeFileSync(path.join(dir, 'app-audio.json'), JSON.stringify({ total, speech, segments: segs.filter((s) => !s.src.startsWith('data:')).map((s) => ({ src: path.basename(s.src), start: +s.start.toFixed(2), end: +s.end.toFixed(2), vol: s.vol, rate: +s.rate.toFixed(3) })), question: q }, null, 1));
console.log(`${path.basename(dir)}: ${n} media segments, ${voice.length} live segments${q !== null ? `, question at ${q.toFixed(2)} s` : ''}, ${total.toFixed(1)} s`);
