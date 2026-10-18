// The second demo video (stories, the film on the page, the same film for everyone), put together from recordings of
// the real app: each shot is footage (one or more parts of a take, and still holds) in a drawn frame (a browser
// window, a phone beside its printed page, two phones, the AR clips, or the steps of how a film is made), with labels,
// captions for the narrator and for the app's voices, and the take's own sound (rebuilt by media-audio.mjs). Three
// versions come out: with notes that say where to film a real phone, clean, and without the narrator (for your own
// voice). Also the narrator alone and the captions as SRT.
//   node scripts/demo-video/compose2.mjs <dir>        (SHOTS=cold,made renders only those shots again)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const [D] = process.argv.slice(2);
const D1 = path.join(D, '..', 'demo-video'); // the first video's takes (the lesson, quiz, progress, films, developers)
const FPS = 30;
const L = (f) => path.join(D, 'layers', f);
const PUBLIC = fileURLToPath(new URL('../../apps/web/public/home', import.meta.url));
const GEO = JSON.parse(fs.readFileSync(path.join(D, 'geometry2.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(D, 'vo', 'manifest.json'), 'utf8'));
const APP = JSON.parse(fs.readFileSync(new URL('./app-lines2.json', import.meta.url), 'utf8'));
const PAPER = '0xfdfbf7';
const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 1 << 26 });
const pngSize = (f) => { const b = fs.readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const fr = (s) => Math.round(s * FPS) / FPS;
const voOf = (id) => { const [scene, i] = id.split(/-(?=\d+$)/); const v = manifest.find((m) => m.scene === scene && m.index === Number(i)); if (!v) throw new Error(`no voice line ${id}`); return v; };
const TAKES = { ar1: D, ar2: D, choice: D, talk: D, take: D1, quiz: D1, progress: D1, films: D1, dev: D1 };
const takeFile = (t, f) => path.join(TAKES[t], t, f);
// the level of each take's voices against the narrator (1: as recorded, which already matches)
const VOICE_GAIN = { take: 1, talk: 1 };

// a part: footage of a take from a to b (speed), or a still hold of it at `at` for dur. audio: which of the take's
// sound plays: 'all', 'bed' (music and clip sound), 'voice', a list of [take time, take time] windows for the
// voice over the bed, or nothing. capx: the app's voices to caption, in take time.
const SHOTS = [
  { id: 'cold', kind: 'cold', note: 'P1', music: false, musicOffAt: 5.2, parts: [{ take: 'ar1', a: 0.0, b: 21.9, audio: 'all' }],
    vo: [['cold-0', 0.4], ['cold-1', 3.9]], capx: [['ar1-l1', 9.73, 14.24], ['ar1-l2', 15.7, 21.48]] },
  { id: 'title', kind: 'title', vo: [['title-0', 0.5], ['title-1', 3.1]] },
  { id: 'make', kind: 'window', label: 'make', badges: ['gemini', 'speed'], parts: [{ take: 'take', a: 1.6, b: 21.0, speed: 1.6 }],
    vo: [['make-0', 0.4], ['make-1', 4.1]] },
  { id: 'paper', kind: 'ar', label: 'paper', note: 'P2', dur: 5.2, vo: [['paper-0', 0.4]] },
  { id: 'tutor', kind: 'window', label: 'tutor', badges: ['live'], parts: [
      { take: 'take', a: 19.8, b: 26.4, audio: 'voice' },
      { take: 'take', hold: 47.4, dur: 2.7 },
      { take: 'take', a: 47.4, b: 60.3, audio: 'voice' }],
    vo: [['tutor-0', 0.2], ['tutor-1', 6.7]], capx: [['q1', 47.9, 51.2]] },
  { id: 'whatif', kind: 'window', label: 'whatif', parts: [{ take: 'take', a: 78.4, b: 88.5, audio: 'voice' }], vo: [['whatif-0', 0.2]] },
  { id: 'story', kind: 'window', label: 'story', note: 'P3', music: false, parts: [
      { take: 'choice', a: 49.6, b: 54.4, audio: 'all' },
      { take: 'choice', a: 54.4, b: 60.4, audio: 'bed' },
      { take: 'choice', hold: 60.4, dur: 2.4, audio: 'bed' },
      { take: 'choice', a: 60.4, b: 67.15, audio: [[61.9, 67.1]] }],
    vo: [['story-0', 5.1], ['story-1', 9.6]] },
  { id: 'talk', kind: 'window', label: 'talk', note: 'P3', badges: ['character'], parts: [
      { take: 'talk', a: 5.0, b: 9.8, audio: 'bed' },
      { take: 'talk', a: 17.4, b: 29.0, audio: 'all' }],
    vo: [['talk-0', 0.2]], capx: [['q2', 17.76, 21.1], ['dog-a', 22.4, 28.7]] },
  { id: 'made', kind: 'made', label: 'made', dur: 19.6, vo: [['made-0', 0.3], ['made-1', 3.5], ['made-2', 13.6]],
    steps: [['mk-page', 0.0], ['mk-plan', 3.6], ['mk-draw', 4.9], ['mk-film', 8.1], ['mk-voice', 9.9], ['mk-review', 13.6], ['mk-loop', 16.6]] },
  { id: 'shared', kind: 'shared', label: 'shared', note: 'P4', music: false, musicOffAt: 3.8, badges: ['embed'], streams: [
      [{ take: 'ar1', a: 1.4, b: 11.4, audio: 'bed' }], [{ take: 'ar2', a: 1.4, b: 11.4 }]],
    vo: [['shared-0', 0.3], ['shared-1', 3.0]], same: 6.0 },
  { id: 'more', kind: 'window', label: 'more', parts: [
      { take: 'quiz', a: 7.6, b: 10.4, sub: 'sub-quiz' }, { take: 'progress', a: 8.0, b: 10.8, sub: 'sub-progress' },
      { take: 'films', a: 5.0, b: 7.8, sub: 'sub-films' }, { take: 'dev', a: 10.5, b: 13.3, sub: 'sub-dev' }],
    vo: [['more-0', 0.3], ['more-1', 6.6]] },
  { id: 'end', kind: 'end', dur: 8.0, captions: false, vo: [['end-0', 0.5], ['end-1', 4.2]] },
];
const only = process.env.SHOTS?.split(',');

const work = path.join(D, 'shots');
fs.mkdirSync(work, { recursive: true });
const timeline = []; // per shot: start, dur, files
const speech = [], srt = [], quietMusic = [];
let clock = 0;
const lenOf = (p) => (p.hold !== undefined ? p.dur : (p.b - p.a) / (p.speed ?? 1));

for (const [n, s] of SHOTS.entries()) {
  const parts = s.parts ?? s.streams?.[0] ?? [];
  const footage = parts.reduce((a, p) => a + lenOf(p), 0);
  const lines = s.vo.map(([id, at]) => { const v = voOf(id); return { ...v, id, start: at, end: at + v.ms / 1000 }; });
  const dur = fr(Math.max(s.dur ?? 0, footage, (lines.at(-1)?.end ?? 0) + 0.5));
  // take time → shot time, through the parts
  const shotTime = (take, t) => { let at = 0; for (const p of parts) { if (p.hold === undefined && p.take === take && t >= p.a && t <= p.b) return at + (t - p.a) / (p.speed ?? 1); at += lenOf(p); } return null; };
  const capx = (s.capx ?? []).map(([k, a, b]) => ({ key: k, from: shotTime(parts.find((p) => p.hold === undefined && a >= p.a && a <= p.b)?.take, a), len: b - a })).filter((c) => c.from !== null).map((c) => ({ ...c, to: Math.min(dur, c.from + c.len) }));
  const dipIn = !s.cut, dipOut = !SHOTS[n + 1]?.cut;
  const base = path.join(work, `${String(n).padStart(2, '0')}-${s.id}`);
  timeline.push({ id: s.id, start: clock, dur, base });
  for (const l of lines) { speech.push([clock + l.start, clock + l.end]); srt.push({ from: clock + l.start, to: clock + l.end + 0.2, text: l.text }); }
  for (const c of capx) srt.push({ from: clock + c.from, to: clock + c.to, text: `${APP[c.key].who}: ${APP[c.key].text}` });
  if (s.music === false) quietMusic.push([clock + (s.musicOffAt ?? 0), clock + dur]); // the story's own music takes over

  // the take's own sound: each part's stem(s), cut and placed on the shot's clock
  const appSound = [];
  let at = 0;
  for (const p of parts) {
    const len = lenOf(p);
    const from = p.hold !== undefined ? p.hold : p.a;
    const audio = p.audio;
    const add = (stem, a0, a1, fade = 0.12) => { const f = takeFile(p.take, `app-${stem}.wav`); if (!fs.existsSync(f) || a1 - a0 < 0.05) return; appSound.push({ file: f, from: a0, len: a1 - a0, at: at + (a0 - from), fade, vol: stem === 'voice' ? VOICE_GAIN[p.take] ?? 1 : 1 }); };
    if (audio === 'all') { add('voice', from, from + len); add('bed', from, from + len); }
    else if (audio === 'bed') add('bed', from, from + len);
    else if (audio === 'voice') add('voice', from, from + len);
    else if (Array.isArray(audio)) { add('bed', from, from + len); for (const [a, b] of audio) add('voice', Math.max(a, from), Math.min(b, from + len)); }
    at += len;
  }
  // the speech in the take (for the music under it): the app's voices that play here
  for (const x of appSound) if (/app-voice/.test(x.file)) speech.push([clock + x.at, clock + x.at + x.len]);
  clock += dur;
  if (only && !only.includes(s.id) && fs.existsSync(`${base}-clean.mkv`)) { console.log(`${s.id.padEnd(8)} kept`); continue; }

  // ---- the picture: once with the notes, once clean
  for (const variant of ['notes', 'clean']) {
    if (variant === 'notes' && !s.note) continue; // the same as clean
    if (process.env.AUDIO_ONLY && fs.existsSync(`${base}-${variant}.mkv`)) continue;
    const inputs = [], vf = [];
    let count = 0;
    const add = (...a) => { inputs.push(...a); return count++; };
    const still = (file) => add('-loop', '1', '-framerate', String(FPS), '-t', String(dur), '-i', file);
    let cur;
    const base0 = { window: 'bg.png', cold: 'cold-under.png', shared: 'shared-under.png', ar: 'ar-under.png', made: 'bg.png', title: 'title-base.png', end: 'end-card.png' }[s.kind];
    vf.push(`[${still(L(base0))}:v]format=rgba[b0]`); cur = 'b0';
    /** a stream of parts (footage and holds) as one clip of the shot's length, scaled to w×h */
    const stream = (ps, w, h, tag) => {
      const segs = [];
      for (const [k, p] of ps.entries()) {
        const src = takeFile(p.take, 'take.mp4');
        if (p.hold !== undefined) {
          const png = path.join(work, `${s.id}-${tag}-hold${k}.png`);
          ff(['-ss', String(p.hold), '-i', src, '-frames:v', '1', png]);
          const hi = add('-loop', '1', '-framerate', String(FPS), '-t', String(p.dur), '-i', png);
          vf.push(`[${hi}:v]fps=${FPS},trim=duration=${p.dur},setpts=PTS-STARTPTS,format=yuv420p,setsar=1,scale=${w}:${h}:flags=lanczos[${tag}s${k}]`);
        } else {
          const fi = add('-ss', String(p.a), '-t', String(p.b - p.a), '-i', src);
          vf.push(`[${fi}:v]setpts=(PTS-STARTPTS)/${p.speed ?? 1},fps=${FPS},format=yuv420p,setsar=1,scale=${w}:${h}:flags=lanczos[${tag}s${k}]`);
        }
        segs.push(`[${tag}s${k}]`);
      }
      vf.push(`${segs.join('')}concat=n=${segs.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${dur},trim=duration=${dur},setpts=PTS-STARTPTS[${tag}]`);
      return tag;
    };
    const place = (tag, g) => { vf.push(`[${cur}][${tag}]overlay=${g.x}:${g.y}[v${vf.length}]`); cur = `v${vf.length - 1}`; };
    if (s.kind === 'window') { place(stream(s.parts, GEO.content.w, GEO.content.h, 'm'), GEO.content); vf.push(`[${cur}][${still(L('frame.png'))}:v]overlay=0:0[fr]`); cur = 'fr'; }
    if (s.kind === 'cold') { place(stream(s.parts, GEO.cold.w, GEO.cold.h, 'm'), GEO.cold); vf.push(`[${cur}][${still(L('cold-over.png'))}:v]overlay=0:0[co]`); cur = 'co'; }
    if (s.kind === 'shared') {
      s.streams.forEach((ps, k) => place(stream(ps, GEO.shared[k].w, GEO.shared[k].h, `p${k}`), GEO.shared[k]));
      vf.push(`[${cur}][${still(L('shared-over.png'))}:v]overlay=0:0[so]`); cur = 'so';
    }
    if (s.kind === 'ar') {
      ['ar-desk', 'ar-kitchen', 'ar-class'].forEach((c, k) => {
        const ci = add('-stream_loop', '-1', '-t', String(dur), '-i', path.join(PUBLIC, `${c}.mp4`));
        const g = GEO.ar[k];
        vf.push(`[${ci}:v]fps=${FPS},scale=${g.w}:-2:flags=lanczos,crop=${g.w}:${g.h}:0:(ih-${g.h})/2,setsar=1[a${k}]`);
        place(`a${k}`, g);
      });
      vf.push(`[${cur}][${still(L('ar-over.png'))}:v]overlay=0:0[ao]`); cur = 'ao';
    }
    if (s.kind === 'title') {
      const hi = add('-stream_loop', '-1', '-t', String(dur), '-i', path.join(PUBLIC, 'hero.mp4'));
      vf.push(`[${hi}:v]fps=${FPS},scale=${GEO.title.w}:-2:flags=lanczos,crop=${GEO.title.w}:${GEO.title.h}:0:(ih-${GEO.title.h})/2,setsar=1[hv]`);
      place('hv', GEO.title);
    }
    const overlayPng = (file, x, y, from, to, fade = 0.2) => {
      const i = still(file);
      const o = `o${vf.length}`;
      vf.push(`[${i}:v]format=rgba,fade=t=in:st=${from.toFixed(3)}:d=${fade}:alpha=1,fade=t=out:st=${Math.max(from, to - fade).toFixed(3)}:d=${fade}:alpha=1[${o}i]`);
      vf.push(`[${cur}][${o}i]overlay=${x}:${y}:enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'[${o}]`); cur = o;
    };
    if (s.kind === 'made') {
      for (const [k, [name, t0]] of s.steps.entries()) {
        overlayPng(L(`${name}.png`), 0, 0, t0, dur, 0.35);
        if (name === 'mk-film') {
          const ci = add('-stream_loop', '-1', '-t', String(dur), '-i', path.join(D, 'media-cache', 'clip-s3.mp4'));
          vf.push(`[${ci}:v]fps=${FPS},scale=${GEO.film.w}:${GEO.film.h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${GEO.film.w}:${GEO.film.h},setsar=1,format=rgba,setpts=PTS-STARTPTS+${t0}/TB,fade=t=in:st=${t0 + 0.2}:d=0.35:alpha=1[clip${k}]`);
          vf.push(`[${cur}][clip${k}]overlay=${GEO.film.x}:${GEO.film.y}:enable='gte(t,${t0 + 0.2})'[cl${k}]`); cur = `cl${k}`;
        }
      }
    }
    if (s.kind === 'shared' && s.same) { const sz = pngSize(L('shared-same.png')); overlayPng(L('shared-same.png'), Math.round((1920 - sz.w) / 2), 470, s.same, dur, 0.35); }
    // labels, small labels for the parts of a montage, badges, the note
    if (s.label) overlayPng(L(`label-${s.label}.png`), s.kind === 'window' ? 118 : 40, s.kind === 'window' ? 0 : 10, dipIn ? 0.15 : 0, dur, 0.35);
    if (s.kind === 'window' && s.parts.some((p) => p.sub)) {
      let t = 0;
      for (const p of s.parts) { const len = lenOf(p); if (p.sub) { const sz = pngSize(L(`${p.sub}.png`)); overlayPng(L(`${p.sub}.png`), 1890 - sz.w, 10, t + 0.1, t + len - 0.05, 0.15); } t += len; }
    }
    let by = 10;
    for (const b of s.badges ?? []) { const f = L(`badge-${b}.png`); const sz = pngSize(f); overlayPng(f, 1890 - sz.w, by, 0.6, dur, 0.35); by += sz.h - 6; }
    if (variant === 'notes' && s.note) { const f = L(`note-${s.note}.png`); const sz = pngSize(f); overlayPng(f, Math.round((1920 - sz.w) / 2), s.kind === 'window' ? 120 : 18, 0.3, dur - 0.2, 0.3); }
    // captions: the narrator, and the app's voices where the picture does not show their words large enough
    if (s.captions !== false) {
      const caps = [
        ...lines.map((l) => ({ file: L(`cap-${l.id}.png`), from: Math.max(0, l.start - 0.1), to: l.end + 0.25 })),
        ...capx.map((c) => ({ file: L(`capx-${c.key}.png`), from: c.from - 0.05, to: c.to + 0.2 })),
      ].sort((x, y) => x.from - y.from);
      caps.forEach((c, k, all) => {
        const to = Math.min(c.to, (all[k + 1]?.from ?? Infinity) - 0.02, dur);
        const sz = pngSize(c.file);
        overlayPng(c.file, Math.round((1920 - sz.w) / 2), 1080 - sz.h - 14, c.from, to, 0.15);
      });
    }
    vf.push(`[${cur}]${dipIn ? `fade=t=in:st=0:d=0.3:color=${PAPER},` : ''}${dipOut ? `fade=t=out:st=${(dur - 0.3).toFixed(3)}:d=0.3:color=${PAPER},` : ''}format=yuv420p[vout]`);
    ff([...inputs, '-filter_complex', vf.join(';'), '-map', '[vout]', '-t', String(dur), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-g', '60', `${base}-${variant}.mkv`]);
  }

  // ---- the sound: the app's own sound, with and without the narrator (each measured: a silent voice is an error)
  for (const narr of [true, false]) {
    const sounds = [...appSound.map((x) => ({ ...x })), ...(narr ? lines.map((l) => ({ file: l.file, from: 0, len: l.ms / 1000, at: l.start, fade: 0 })) : [])];
    const ain = [], af = [];
    sounds.forEach((x, k) => {
      ain.push('-i', x.file);
      const fade = x.fade ? `afade=t=in:d=${x.fade},afade=t=out:st=${Math.max(0, x.len - x.fade).toFixed(3)}:d=${x.fade},` : '';
      af.push(`[${k}:a]atrim=${x.from.toFixed(3)}:${(x.from + x.len).toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,${x.vol && x.vol !== 1 ? `volume=${x.vol},` : ''}${fade}adelay=${Math.round(x.at * 1000)}:all=1[s${k}]`);
    });
    ain.push('-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=48000:cl=stereo');
    // the silence that runs the whole shot goes first: amix ends with its first input (with "longest", a mix whose
    // first sound starts late ended with that sound, and the shot's sound came out short)
    af.push(`[${sounds.length}:a]${sounds.map((_, k) => `[s${k}]`).join('')}amix=inputs=${sounds.length + 1}:normalize=0:duration=first,atrim=0:${dur},asetpts=PTS-STARTPTS${dipIn ? ',afade=t=in:st=0:d=0.05' : ''}${dipOut ? `,afade=t=out:st=${(dur - 0.15).toFixed(3)}:d=0.15` : ''}[aout]`);
    const wav = `${base}-${narr ? 'full' : 'nonarr'}.wav`;
    ff([...ain, '-filter_complex', af.join(';'), '-map', '[aout]', '-t', String(dur), '-c:a', 'pcm_s16le', '-ar', '48000', wav]);
  }
  console.log(`${s.id.padEnd(8)} ${dur.toFixed(2).padStart(6)} s  ${lines.map((l) => l.id).join(', ')}${appSound.length ? `  + app sound ${appSound.length}` : ''}${capx.length ? `  + captions ${capx.map((c) => c.key).join(',')}` : ''}`);
}

// ---- join: picture per version, sound per version, then the music under everything and the loudness
const total = timeline.reduce((a, t) => a + t.dur, 0);
const music = path.join(D1, 'music.wav');
const copies = Math.ceil(total / 28) + 1;
const mIn = Array.from({ length: copies }, () => ['-i', music]).flat();
/** the music filter: the speech is input `sp`, the music copies start at input `ms` */
const loopOf = (ms) => Array.from({ length: copies - 1 }, (_, k) => `${k === 0 ? `[${ms}:a]` : `[m${k}]`}[${ms + k + 1}:a]acrossfade=d=3:c1=qsin:c2=qsin[m${k + 1}]`).join(';');
const spans = speech.map(([a, b]) => [a - 0.35, b + 0.5]).sort((x, y) => x[0] - y[0]).reduce((acc, r) => { const last = acc.at(-1); if (last && r[0] <= last[1] + 0.8) last[1] = Math.max(last[1], r[1]); else acc.push([...r]); return acc; }, []);
const under = spans.map(([a, b]) => `max(0,min(1,min((t-${(a - 0.4).toFixed(2)})/0.4,(${(b + 0.4).toFixed(2)}-t)/0.4)))`).join('+') || '0';
// the story's own music plays in some shots: the video's music steps aside there
const off = quietMusic.map(([a, b]) => `max(0,min(1,min((t-${(a - 0.6).toFixed(2)})/0.6,(${(b + 0.6).toFixed(2)}-t)/0.6)))`).join('+') || '0';
const mixedOf = (sp, ms) => `${loopOf(ms)};[m${copies - 1}]atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,volume=0.62,volume='(0.32+0.68*(1-min(1,${under})))*(1-min(1,${off}))':eval=frame,`
  + `afade=t=in:st=0:d=1.2,afade=t=out:st=${(total - 2.5).toFixed(3)}:d=2.5,aformat=sample_fmts=fltp:channel_layouts=stereo[mus];`
  + `[${sp}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[sp];[sp][mus]amix=inputs=2:normalize=0:duration=first`;
const concat = (files, out) => { const list = `${out}.txt`; fs.writeFileSync(list, files.map((f) => `file '${path.resolve(f)}'`).join('\n')); ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]); fs.rmSync(list); return out; };
const pic = { notes: concat(timeline.map((t) => (fs.existsSync(`${t.base}-notes.mkv`) ? `${t.base}-notes.mkv` : `${t.base}-clean.mkv`)), path.join(work, 'pic-notes.mkv')), clean: concat(timeline.map((t) => `${t.base}-clean.mkv`), path.join(work, 'pic-clean.mkv')) };
const snd = { full: concat(timeline.map((t) => `${t.base}-full.wav`), path.join(work, 'snd-full.wav')), nonarr: concat(timeline.map((t) => `${t.base}-nonarr.wav`), path.join(work, 'snd-nonarr.wav')) };
const finish = (picture, sound, out) => {
  const measure = spawnSync('ffmpeg', ['-hide_banner', '-i', sound, ...mIn, '-filter_complex', `${mixedOf(0, 1)},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json[a]`, '-map', '[a]', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = JSON.parse(measure.stderr.slice(measure.stderr.lastIndexOf('{'), measure.stderr.lastIndexOf('}') + 1));
  const norm = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  ff(['-i', picture, '-i', sound, ...mIn, '-filter_complex', `${mixedOf(1, 2)},${norm},aresample=48000[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out]);
  console.log(`${path.basename(out)}: ${total.toFixed(1)} s, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
};
finish(pic.notes, snd.full, path.join(D, 'living-textbook-demo-placeholders.mp4'));
finish(pic.clean, snd.full, path.join(D, 'living-textbook-demo.mp4'));
finish(pic.clean, snd.nonarr, path.join(D, 'living-textbook-demo-no-narrator.mp4'));

// the narrator alone on the video's clock, and the captions
const narr = [];
for (const [n, s] of SHOTS.entries()) for (const [id, at] of s.vo) narr.push({ file: voOf(id).file, at: timeline[n].start + at });
const nin = narr.flatMap((x) => ['-i', x.file]);
ff([...nin, '-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=r=48000:cl=mono', '-filter_complex', `${narr.map((x, k) => `[${k}:a]aresample=48000,adelay=${Math.round(x.at * 1000)}:all=1[n${k}]`).join(';')};[${narr.length}:a]${narr.map((_, k) => `[n${k}]`).join('')}amix=inputs=${narr.length + 1}:normalize=0:duration=first,atrim=0:${total.toFixed(3)}[a]`, '-map', '[a]', '-c:a', 'pcm_s16le', path.join(D, 'narration.wav')]);
const ts = (x) => { const ms = Math.round(x * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
srt.sort((a, b) => a.from - b.from);
fs.writeFileSync(path.join(D, 'captions.srt'), srt.map((c, i) => `${i + 1}\n${ts(c.from)} --> ${ts(Math.min(c.to, srt[i + 1]?.from ?? Infinity))}\n${c.text}\n`).join('\n'));
fs.writeFileSync(path.join(D, 'timeline.json'), JSON.stringify(timeline.map((t) => ({ id: t.id, start: +t.start.toFixed(2), end: +(t.start + t.dur).toFixed(2), note: SHOTS.find((s) => s.id === t.id).note ?? null })), null, 1));
console.log(`total ${total.toFixed(1)} s`);
