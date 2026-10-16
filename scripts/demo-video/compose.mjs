// Put the demo video together: each shot is the real app (or a card) inside the hand-drawn frame, with its label,
// a caption for every voice line, the narrator (Gemini TTS), the tutor's own voice (Gemini Live) where the app speaks,
// and the student's question. The shots are joined with short dips to paper, then the Lyria music goes under all of
// it, quieter whenever someone speaks, and the loudness is set for sharing.
//   node scripts/demo-video/compose.mjs <dir> <out.mp4>       (SHOTS=quiz,dev renders only those shots again)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { liveAudioSegments } from './capture-lib.mjs';

const [D, OUT] = process.argv.slice(2);
const FPS = 30;
const L = (f) => path.join(D, 'layers', f);
const manifest = JSON.parse(fs.readFileSync(path.join(D, 'vo', 'manifest.json'), 'utf8'));
const voOf = (id) => { const [scene, i] = id.split(/-(?=\d+$)/); const v = manifest.find((m) => m.scene === scene && m.index === Number(i)); if (!v) throw new Error(`no voice line ${id}`); return v; };
const geo = JSON.parse(fs.readFileSync(path.join(D, 'geometry.json'), 'utf8')).content;
const ar = JSON.parse(fs.readFileSync(path.join(D, 'ar-geometry.json'), 'utf8'));
const titleGeo = JSON.parse(fs.readFileSync(path.join(D, 'title-geometry.json'), 'utf8')).phone;
const PUBLIC = fileURLToPath(new URL('../../apps/web/public/home', import.meta.url));
const PAPER = '0xfdfbf7';
const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 1 << 26 });
const pngSize = (f) => { const b = fs.readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const frames = (s) => Math.round(s * FPS) / FPS;
/** RMS level (dB) of a 16-bit WAV between two times, across its channels. */
function levelDb(file, from, to) {
  const b = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12) };
    if (id === 'data') { data = b.subarray(p + 8, Math.min(b.length, p + 8 + size)); break; }
    p += 8 + size + (size % 2);
  }
  const at = (t) => Math.max(0, Math.min(data.length / 2, Math.round(t * fmt.rate) * fmt.ch));
  let sum = 0, n = 0;
  for (let i = at(from); i < at(to); i++) { const v = data.readInt16LE(i * 2) / 32768; sum += v * v; n++; }
  return n ? 10 * Math.log10(sum / n + 1e-12) : -120;
}

// the main take's voices on its own clock (seconds from its first frame)
const take = JSON.parse(fs.readFileSync(path.join(D, 'take', 'take.json'), 'utf8'));
const f0 = take.frames[0].t;
const tutor = liveAudioSegments(JSON.parse(fs.readFileSync(path.join(D, 'take', 'live.json'), 'utf8')), take.timeOrigin, path.join(D, 'take', 'voice'))
  .map((s) => ({ file: s.file, start: (s.start - f0) / 1000, end: (s.end - f0) / 1000 }));
const questionAt = (take.timeOrigin + take.micStartedAt - f0) / 1000 + 26; // the microphone file begins with 26 s of quiet

// a and b are seconds in the shot's source take. vo: voice lines one after another, or [line, at] at a set time.
// hold: a still of the source (easing out of a slight zoom) before the footage. cut: no dip from the shot before.
const SHOTS = [
  { id: 'title', kind: 'title', vo: [['title-0', 1.3], ['title-1', 3.6]] },
  { id: 'ar', kind: 'ar', vo: ['ar-0', 'ar-1', 'ar-2'], label: 'ar' },
  { id: 'home', kind: 'window', src: 'home', a: 0.4, b: 9.4, vo: ['home-0', 'home-1'], label: 'home' },
  { id: 'make', kind: 'window', src: 'take', a: 0.3, b: 19.1, vo: ['make-0', 'make-1', 'make-2', 'lesson-0'], label: 'make', badge: 'gemini' },
  { id: 'lesson', kind: 'window', src: 'take', a: 19.1, b: 34.6, vo: ['lesson-1'], label: 'lesson', badge: 'live', voices: true, cut: true },
  { id: 'ask', kind: 'window', src: 'take', hold: { at: 47.6, dur: 4.1 }, a: 47.6, b: 60.5, vo: ['ask-0'], label: 'ask', badge: 'voice', voices: true, question: true },
  { id: 'whatif', kind: 'window', src: 'take', a: 77.2, b: 88.5, vo: ['whatif-0'], label: 'whatif', voices: true },
  { id: 'quiz', kind: 'window', src: 'quiz', a: 1.0, b: 21.8, speed: 1.4, vo: [['quiz-0', 0.35], ['quiz-1', 7.3]], label: 'quiz' },
  { id: 'progress', kind: 'window', src: 'progress', a: 0, b: 15.4, vo: [['progress-0', 0.4], ['progress-1', 6.9], ['progress-2', 10.3]], label: 'progress', badge: 'bigquery' },
  { id: 'films', kind: 'window', src: 'films', a: 0, b: 18.8, vo: [['films-0', 2.9], ['films-1', 12.0]], label: 'films' },
  { id: 'dev', kind: 'window', src: 'dev', a: 0, b: 14.0, vo: [['dev-0', 0.8], ['dev-1', 7.4]], label: 'dev', badge: 'sdk' },
  { id: 'end', kind: 'end', vo: [['end-0', 0.5], ['end-1', 4.9]], captions: false },
];
const only = process.env.SHOTS?.split(',');

const work = path.join(D, 'shots');
fs.mkdirSync(work, { recursive: true });
const made = [];
const speech = []; // [from, to] of every voice in the final timeline, for the music
let clock = 0;
for (const [n, s] of SHOTS.entries()) {
  // voice lines in sequence (or at given times) and their captions
  let t = 0.35;
  const lines = s.vo.map((x) => { const [id, at] = Array.isArray(x) ? x : [x, null]; const v = voOf(id); const start = at ?? t; t = start + v.ms / 1000 + 0.25; return { ...v, id, start, end: start + v.ms / 1000 }; });
  const footage = s.a !== undefined ? (s.b - s.a) / (s.speed ?? 1) : 0;
  const hold = s.hold?.dur ?? 0;
  const dur = frames(Math.max(hold + footage, (lines.at(-1)?.end ?? 0) + (s.kind === 'window' ? 0.6 : 1.0)));
  const dipIn = !s.cut, dipOut = !SHOTS[n + 1]?.cut;
  const out = path.join(work, `${String(n).padStart(2, '0')}-${s.id}.mkv`);
  const qShot = s.question ? hold + (questionAt - s.a) : null;
  const tutorHere = s.voices ? tutor.filter((seg) => Math.min(seg.end, s.b) - Math.max(seg.start, s.a) > 0.3) : []; // not a sliver of a sentence's tail
  for (const l of lines) speech.push([clock + l.start, clock + l.end]);
  for (const seg of tutorHere) speech.push([clock + hold + Math.max(0, seg.start - s.a), clock + hold + Math.min(seg.end, s.b) - s.a]);
  if (qShot !== null) speech.push([clock + qShot, clock + qShot + 2.8]);
  clock += dur;
  made.push({ out, dur });
  if (only && !only.includes(s.id) && fs.existsSync(out)) continue;

  const inputs = [], vf = [], af = [];
  let count = 0;
  const add = (...a) => { inputs.push(...a); return count++; };
  const still = (file) => add('-loop', '1', '-framerate', String(FPS), '-t', String(dur), '-i', file);
  let cur;
  if (s.kind === 'window' || s.kind === 'ar') {
    vf.push(`[${still(L(s.kind === 'ar' ? 'ar-under.png' : 'bg.png'))}:v]format=rgba[b0]`);
    cur = 'b0';
  }
  if (s.kind === 'window') {
    const src = path.join(D, s.src, 'take.mp4');
    const parts = [];
    if (s.hold) {
      // the paused frame eases out of a slight zoom, so the pause reads as a pause and flows into the footage
      const png = path.join(work, `${s.id}-hold.png`);
      ff(['-ss', String(s.hold.at), '-i', src, '-frames:v', '1', png]);
      const hi = add('-i', png);
      const k = Math.round(s.hold.dur * FPS);
      vf.push(`[${hi}:v]scale=7680:4320:flags=lanczos,loop=loop=${k - 1}:size=1:start=0,setpts=N/${FPS}/TB,zoompan=z='1+0.045*pow(1-on/${k},2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FPS},format=yuv420p,setsar=1[h]`);
      parts.push('[h]');
    }
    const fi = add('-ss', String(s.a), '-t', String(s.b - s.a), '-i', src);
    vf.push(`[${fi}:v]setpts=(PTS-STARTPTS)/${s.speed ?? 1},fps=${FPS},format=yuv420p,setsar=1[f]`);
    parts.push('[f]');
    vf.push(`${parts.join('')}concat=n=${parts.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${dur},trim=duration=${dur},setpts=PTS-STARTPTS,scale=${geo.w}:${geo.h}:flags=lanczos[c]`);
    vf.push(`[${cur}][c]overlay=${geo.x}:${geo.y}[v1]`); cur = 'v1';
    vf.push(`[${cur}][${still(L('frame.png'))}:v]overlay=0:0[v2]`); cur = 'v2';
  }
  if (s.kind === 'ar') {
    ['ar-desk', 'ar-kitchen', 'ar-class'].forEach((c, k) => {
      const ci = add('-stream_loop', '-1', '-t', String(dur), '-i', path.join(PUBLIC, `${c}.mp4`));
      const g = ar[k];
      vf.push(`[${ci}:v]fps=${FPS},scale=${g.w}:-2:flags=lanczos,crop=${g.w}:${g.h}:0:(ih-${g.h})/2,setsar=1[a${k}]`);
      vf.push(`[${cur}][a${k}]overlay=${g.x}:${g.y}[av${k}]`); cur = `av${k}`;
    });
    vf.push(`[${cur}][${still(L('ar-over.png'))}:v]overlay=0:0[aov]`); cur = 'aov';
  }
  if (s.kind === 'title' || s.kind === 'end') {
    vf.push(`[${still(L(s.kind === 'title' ? 'title-base.png' : 'end-card.png'))}:v]format=rgba[b0]`); cur = 'b0';
    if (s.kind === 'title') {
      const hi = add('-stream_loop', '-1', '-t', String(dur), '-i', path.join(PUBLIC, 'hero.mp4'));
      vf.push(`[${hi}:v]fps=${FPS},scale=${titleGeo.w}:-2:flags=lanczos,crop=${titleGeo.w}:${titleGeo.h}:0:(ih-${titleGeo.h})/2,setsar=1[hv]`);
      vf.push(`[${cur}][hv]overlay=${titleGeo.x}:${titleGeo.y}[tv]`); cur = 'tv';
    }
  }
  const overlayPng = (file, x, y, from, to, fade = 0.2) => {
    const i = still(file);
    const o = `o${vf.length}`;
    vf.push(`[${i}:v]format=rgba,fade=t=in:st=${from.toFixed(3)}:d=${fade}:alpha=1,fade=t=out:st=${Math.max(from, to - fade).toFixed(3)}:d=${fade}:alpha=1[${o}i]`);
    vf.push(`[${cur}][${o}i]overlay=${x}:${y}:enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'[${o}]`); cur = o;
  };
  if (s.label) overlayPng(L(`label-${s.label}.png`), s.kind === 'ar' ? 60 : 118, s.kind === 'ar' ? 26 : 0, dipIn ? 0.15 : 0, dur, 0.35);
  if (s.badge) { const sz = pngSize(L(`badge-${s.badge}.png`)); overlayPng(L(`badge-${s.badge}.png`), 1890 - sz.w, 10, 0.6, dur, 0.35); }
  const caps = s.captions === false ? [] : lines.map((l) => ({ file: L(`cap-${l.id}.png`), from: Math.max(0, l.start - 0.1), to: l.end + 0.25 }));
  if (qShot !== null) caps.push({ file: L('cap-question.png'), from: qShot - 0.05, to: qShot + 3.3 });
  caps.sort((x, y) => x.from - y.from).forEach((c, k, all) => {
    const to = Math.min(c.to, (all[k + 1]?.from ?? Infinity) - 0.02, dur);
    const sz = pngSize(c.file);
    overlayPng(c.file, Math.round((1920 - sz.w) / 2), 1080 - sz.h - 14, c.from, to, 0.15);
  });
  vf.push(`[${cur}]${dipIn ? `fade=t=in:st=0:d=0.3:color=${PAPER},` : ''}${dipOut ? `fade=t=out:st=${(dur - 0.3).toFixed(3)}:d=0.3:color=${PAPER},` : ''}format=yuv420p[vout]`);

  // sound, in a pass of its own: the narrator, the tutor (only within the footage, shifted by any hold), the student.
  // Once, an ffmpeg run with all the video inputs dropped two of three voice lines without an error, so every voice
  // is measured in the result and the pass runs again if one is missing.
  const ain = [];
  let acount = 0;
  const aadd = (...a) => { ain.push(...a); return acount++; };
  const sounds = [];
  for (const l of lines) sounds.push({ i: aadd('-i', l.file), at: l.start, end: l.end, f: '' });
  for (const seg of tutorHere) {
    const cut = Math.max(0, s.a - seg.start), until = Math.min(seg.end, s.b) - seg.start;
    const fades = `${cut > 0 ? 'afade=t=in:d=0.08,' : ''}${seg.end > s.b ? `afade=t=out:st=${Math.max(0, until - cut - 0.1).toFixed(3)}:d=0.1,` : ''}`;
    const at = hold + Math.max(0, seg.start - s.a);
    sounds.push({ i: aadd('-i', seg.file), at, end: at + until - cut, f: `atrim=${cut.toFixed(3)}:${until.toFixed(3)},asetpts=PTS-STARTPTS,${fades}` });
  }
  if (qShot !== null) sounds.push({ i: aadd('-i', path.join(D, 'question.wav')), at: qShot, end: qShot + 2.6, f: '' });
  sounds.forEach((x, k) => af.push(`[${x.i}:a]${x.f}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${Math.round(x.at * 1000)}:all=1[s${k}]`));
  const silent = aadd('-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=48000:cl=stereo');
  af.push(`${sounds.map((_, k) => `[s${k}]`).join('')}[${silent}:a]amix=inputs=${sounds.length + 1}:normalize=0:duration=longest,atrim=0:${dur},asetpts=PTS-STARTPTS${dipIn ? ',afade=t=in:st=0:d=0.05' : ''}${dipOut ? `,afade=t=out:st=${(dur - 0.15).toFixed(3)}:d=0.15` : ''}[aout]`);
  const wav = out.replace(/\.mkv$/, '.wav');
  for (let attempt = 1; ; attempt++) {
    ff([...ain, '-filter_complex', af.join(';'), '-map', '[aout]', '-t', String(dur), '-c:a', 'pcm_s16le', '-ar', '48000', wav]);
    const quiet = sounds.filter((x) => levelDb(wav, x.at + 0.15, Math.min(x.end, dur) - 0.15) < -38);
    if (!quiet.length) break;
    if (attempt === 3) throw new Error(`${s.id}: no sound at ${quiet.map((x) => x.at.toFixed(2)).join(', ')} s`);
    console.warn(`${s.id}: no sound at ${quiet.map((x) => x.at.toFixed(2)).join(', ')} s, mixing again`);
  }
  const wi = add('-i', wav);

  if (process.env.DUMP) fs.writeFileSync(`${out}.args.json`, JSON.stringify([...inputs, '-filter_complex', vf.join(';')], null, 1));
  ff([...inputs, '-filter_complex', vf.join(';'), '-map', '[vout]', '-map', `${wi}:a`, '-t', String(dur), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-g', '60', '-c:a', 'copy', out]);
  console.log(`${s.id.padEnd(9)} ${dur.toFixed(2).padStart(6)} s  ${lines.map((l) => l.id).join(', ')}${tutorHere.length ? `  + tutor ${tutorHere.length}` : ''}${qShot !== null ? ' + question' : ''}`);
}

// join the shots (sound kept as PCM until the end, so nothing drifts), then the music under everything and the loudness
const list = path.join(work, 'list.txt');
fs.writeFileSync(list, made.map((m) => `file '${path.resolve(m.out)}'`).join('\n'));
const joined = path.join(work, 'joined.mkv');
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
const total = made.reduce((a, m) => a + m.dur, 0);
const music = path.join(D, 'music.wav');
const copies = Math.ceil(total / 28) + 1;
const mIn = Array.from({ length: copies }, () => ['-i', music]).flat();
// the music: the clip looped with crossfades, and quieter while anyone speaks (ramping over 0.4 s, so it never jumps)
const loop = Array.from({ length: copies - 1 }, (_, k) => `${k === 0 ? '[1:a]' : `[m${k}]`}[${k + 2}:a]acrossfade=d=3:c1=qsin:c2=qsin[m${k + 1}]`).join(';');
const spans = speech.map(([a, b]) => [a - 0.35, b + 0.5]).sort((x, y) => x[0] - y[0])
  .reduce((acc, r) => { const last = acc.at(-1); if (last && r[0] <= last[1] + 0.8) last[1] = Math.max(last[1], r[1]); else acc.push([...r]); return acc; }, []);
const under = spans.map(([a, b]) => `max(0,min(1,min((t-${(a - 0.4).toFixed(2)})/0.4,(${(b + 0.4).toFixed(2)}-t)/0.4)))`).join('+') || '0';
const mixed = `${loop};[m${copies - 1}]atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,volume=0.62,volume='0.32+0.68*(1-min(1,${under}))':eval=frame,`
  + `afade=t=in:st=0:d=1.2,afade=t=out:st=${(total - 2.5).toFixed(3)}:d=2.5,aformat=sample_fmts=fltp:channel_layouts=stereo[mus];`
  + `[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo[sp];[sp][mus]amix=inputs=2:normalize=0:duration=first`;
const measure = spawnSync('ffmpeg', ['-hide_banner', '-i', joined, ...mIn, '-filter_complex', `${mixed},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json[a]`, '-map', '[a]', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const m = JSON.parse(measure.stderr.slice(measure.stderr.lastIndexOf('{'), measure.stderr.lastIndexOf('}') + 1));
const norm = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
ff(['-i', joined, ...mIn, '-filter_complex', `${mixed},${norm},aresample=48000[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', OUT]);
console.log(`\n${OUT}: ${total.toFixed(1)} s, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB, measured ${m.input_i} LUFS before the final level`);
