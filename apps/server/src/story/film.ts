// The linear film of a story (the version that is reviewed, shared and downloaded): each shot's clip with its lines
// read over it in order and captioned, the clip's own ambient sound underneath, the choice asked as a card, the
// imagined path shown once, then the story's own path. Music goes under everything, quieter while anyone speaks.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { StoryChoice, StoryDoc, StoryLine, StoryShot } from './types.js';

const run = promisify(execFile);
const ff = (args: string[]) => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 1 << 26 });

/** Local copies of everything the film needs, by id. */
export type FilmAssets = { clip: (shotId: string) => string | null; still: (shotId: string) => string | null; voice: (lineId: string) => string | null; music: string | null; quiet?: (shotId: string) => boolean };
export type FilmTuning = { gap: number; tail: number; ambient: number; music: number; maxStretch: number };
export const DEFAULT_TUNING: FilmTuning = { gap: 0.4, tail: 1.1, ambient: 0.32, music: 0.5, maxStretch: 1.3 };
export type FilmSegment = { kind: 'shot' | 'choice'; id: string; start: number; end: number; lines: { id: string; start: number; end: number; text: string; speaker: string }[] };

const W = 1280, H = 720, FPS = 24;

function font(name: string): string {
  for (const base of [path.resolve('assets/fonts'), path.resolve('apps/server/assets/fonts'), path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../assets/fonts'), path.resolve(path.dirname(new URL(import.meta.url).pathname), '../assets/fonts')]) {
    const f = path.join(base, name);
    if (fs.existsSync(f)) return f;
  }
  throw new Error(`font ${name} not found`);
}

/** What a caption shows: the line without vocal tags, with the speaker's name for a character. */
export function captionText(l: StoryLine, names: Record<string, string>): string {
  const clean = l.text.replace(/<[^>]+>/g, ' ').replace(/\|[^|]*\|/g, ' ').replace(/\s+/g, ' ').trim();
  return l.speaker === 'narrator' ? clean : `${names[l.speaker] ?? l.speaker}: ${clean}`;
}

function wrap(text: string, width = 50): string {
  const words = text.split(' '); const rows: string[] = []; let row = '';
  for (const w of words) { if ((row + ' ' + w).trim().length > width && row) { rows.push(row); row = w; } else row = (row + ' ' + w).trim(); }
  if (row) rows.push(row);
  return rows.join('\n');
}

async function durationOf(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim()) || 0;
}
async function hasAudio(file: string): Promise<boolean> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]);
  return stdout.trim().length > 0;
}

/** One segment: a picture source (a clip, or a still), lines read over it in order, captions, ambient sound. */
async function segment(opts: {
  work: string; name: string; video: string | null; still: string | null; lines: StoryLine[]; voices: FilmAssets['voice']; names: Record<string, string>;
  tune: FilmTuning; tag?: string; card?: string[]; minSeconds?: number; hold?: number; quiet?: boolean;
}): Promise<{ file: string; seconds: number; lines: FilmSegment['lines'] }> {
  const { work, name, tune } = opts;
  const placed: FilmSegment['lines'] = [];
  let t = 0.5;
  const inputs: string[] = [];
  let count = 0;
  const add = (...a: string[]) => { inputs.push(...a); return count++; };
  const voices: { file: string; at: number }[] = [];
  for (const l of opts.lines) {
    const f = opts.voices(l.id);
    if (!f) continue;
    const secs = await durationOf(f);
    voices.push({ file: f, at: t });
    placed.push({ id: l.id, start: t, end: t + secs, text: captionText(l, opts.names), speaker: l.speaker });
    t += secs + tune.gap;
  }
  const speechEnd = placed.length ? placed.at(-1)!.end : 0;
  let seconds = Math.max(opts.minSeconds ?? 5.5, speechEnd + tune.tail + (opts.hold ?? 0));
  seconds = Math.round(seconds * FPS) / FPS;
  // the picture: a clip stretched a little if the speech runs long, then held on its last frame; or a still
  let vf: string;
  let clip: { i: number; stretch: number } | null = null;
  if (opts.video) {
    const clipSecs = await durationOf(opts.video);
    const stretch = Math.min(tune.maxStretch, Math.max(1, seconds / Math.max(1, clipSecs - 0.1)));
    const vi = add('-i', opts.video);
    vf = `[${vi}:v]setpts=PTS*${stretch.toFixed(3)},fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,tpad=stop_mode=clone:stop_duration=${seconds},trim=duration=${seconds},setpts=PTS-STARTPTS`;
    if (!opts.quiet && await hasAudio(opts.video)) clip = { i: vi, stretch };
  } else {
    const si = add('-loop', '1', '-framerate', String(FPS), '-t', String(seconds), '-i', opts.still!);
    vf = `[${si}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p,eq=brightness=-0.06:saturation=0.85,trim=duration=${seconds}`;
  }
  // captions (and the choice card's options, and a small tag in the corner) drawn with the app's hand-written fonts
  const reg = font('PatrickHand-Regular.ttf'), bold = font('Kalam-Bold.ttf');
  const draws: string[] = [];
  const textFile = (s: string, k: string) => { const f = path.join(work, `${name}-${k}.txt`); fs.writeFileSync(f, s); return f.replace(/:/g, '\\:'); };
  placed.forEach((p, k) => {
    const next = placed[k + 1]?.start ?? seconds;
    draws.push(`drawtext=fontfile=${reg}:textfile=${textFile(wrap(p.text), `c${k}`)}:fontsize=40:line_spacing=6:fontcolor=0x2d2d2d:box=1:boxcolor=0xfffdf7@0.92:boxborderw=18:x=(w-text_w)/2:y=h-text_h-44:enable='between(t,${(p.start - 0.05).toFixed(2)},${(next - 0.02).toFixed(2)})'`);
  });
  if (opts.card?.length) draws.push(`drawtext=fontfile=${bold}:textfile=${textFile(opts.card.map((x) => wrap(x, 36)).join('\n'), 'card')}:fontsize=38:line_spacing=14:fontcolor=0x2d2d2d:box=1:boxcolor=0xfff9c4@0.95:boxborderw=26:x=(w-text_w)/2:y=(h-text_h)/2-60`);
  if (opts.tag) draws.push(`drawtext=fontfile=${bold}:textfile=${textFile(opts.tag, 'tag')}:fontsize=30:fontcolor=white:box=1:boxcolor=0xff4d4d@0.95:boxborderw=12:x=28:y=24`);
  vf += `${draws.length ? ',' + draws.join(',') : ''},fade=t=in:st=0:d=0.25,fade=t=out:st=${(seconds - 0.25).toFixed(3)}:d=0.25,format=yuv420p[v]`;
  // sound: the clip's ambience under the voices
  const af: string[] = [];
  const mix: string[] = [];
  if (clip) { af.push(`[${clip.i}:a]atempo=${(1 / clip.stretch).toFixed(4)},aresample=48000,aformat=channel_layouts=stereo,volume=${tune.ambient},apad,atrim=0:${seconds}[amb]`); mix.push('[amb]'); }
  for (const [k, a] of voices.entries()) {
    const ii = add('-i', a.file);
    af.push(`[${ii}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(a.at * 1000)}:all=1[s${k}]`); mix.push(`[s${k}]`);
  }
  const sil = add('-f', 'lavfi', '-t', String(seconds), '-i', 'anullsrc=r=48000:cl=stereo');
  mix.push(`[${sil}:a]`);
  af.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=longest,atrim=0:${seconds},asetpts=PTS-STARTPTS,afade=t=in:d=0.15,afade=t=out:st=${(seconds - 0.25).toFixed(3)}:d=0.25[a]`);
  const file = path.join(work, `${name}.mkv`);
  await ff([...inputs, '-filter_complex', [vf, ...af].join(';'), '-map', '[v]', '-map', '[a]', '-t', String(seconds), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ar', '48000', file]);
  return { file, seconds, lines: placed };
}

/** An opening card: the book's page beside the story's title, so a viewer sees what the film was made from. */
export async function introSegment(work: string, page: string, title: string, credit: string | undefined, seconds = 4): Promise<{ file: string; seconds: number; lines: FilmSegment['lines'] }> {
  const bold = font('Kalam-Bold.ttf'), reg = font('PatrickHand-Regular.ttf');
  const t = (s: string, k: string) => { const f = path.join(work, `intro-${k}.txt`); fs.writeFileSync(f, s); return f.replace(/:/g, '\\:'); };
  const file = path.join(work, 'intro.mkv');
  // the title block is centred whatever the number of lines (Kalam's lines are about 93 px apart at 54 px)
  const titleLines = wrap(title, 22).split('\n').length, creditLines = credit ? wrap(credit, 40).split('\n').length : 0;
  const block = titleLines * 93 + 16 + creditLines * 42 + 28 + 50;
  const y0 = Math.max(40, Math.round((H - block) / 2)), yCredit = y0 + titleLines * 93 + 16, yTag = yCredit + creditLines * 42 + 28;
  const vf = [
    `[1:v]scale=-2:600,pad=iw+12:ih+12:6:6:color=0x2d2d2d,rotate=-0.035:fillcolor=0xfdfbf7:ow=rotw(-0.035):oh=roth(-0.035)[pg]`,
    `[0:v][pg]overlay=70:(H-h)/2[b]`,
    `[b]drawtext=fontfile=${bold}:textfile=${t(wrap(title, 22), 'title')}:fontsize=54:line_spacing=6:fontcolor=0x2d2d2d:x=600:y=${y0},`
      + (credit ? `drawtext=fontfile=${reg}:textfile=${t(wrap(credit, 40), 'credit')}:fontsize=30:fontcolor=0x2d2d2d@0.7:x=604:y=${yCredit},` : '')
      + `drawtext=fontfile=${bold}:textfile=${t('A story made alive with Gemini', 'tag')}:fontsize=26:fontcolor=white:box=1:boxcolor=0xff4d4d:boxborderw=12:x=606:y=${yTag},`
      + `fade=t=in:st=0:d=0.4:color=0xfdfbf7,fade=t=out:st=${seconds - 0.4}:d=0.4,format=yuv420p[v]`,
  ];
  await ff(['-f', 'lavfi', '-t', String(seconds), '-i', `color=c=0xfdfbf7:s=${W}x${H}:r=${FPS}`, '-loop', '1', '-framerate', String(FPS), '-t', String(seconds), '-i', page,
    '-f', 'lavfi', '-t', String(seconds), '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', vf.join(';'), '-map', '[v]', '-map', '2:a', '-t', String(seconds), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ar', '48000', file]);
  return { file, seconds, lines: [] };
}

/** Render the whole film. Returns the segments with their times (for the reviewer and for chapters in the player). */
export async function renderFilm(doc: StoryDoc, assets: FilmAssets, out: string, opts: { work: string; tune?: Partial<FilmTuning>; preview?: string; holds?: Record<string, number>; intro?: { page: string } }): Promise<{ seconds: number; segments: FilmSegment[] }> {
  const tune = { ...DEFAULT_TUNING, ...(opts.tune ?? {}) };
  fs.mkdirSync(opts.work, { recursive: true });
  const names = Object.fromEntries(doc.characters.map((c) => [c.id, c.name]));
  const parts: { file: string; seconds: number }[] = [];
  const segments: FilmSegment[] = [];
  let clock = 0;
  const push = (kind: FilmSegment['kind'], id: string, r: { file: string; seconds: number; lines: FilmSegment['lines'] }) => {
    parts.push(r);
    segments.push({ kind, id, start: clock, end: clock + r.seconds, lines: r.lines.map((l) => ({ ...l, start: l.start + clock, end: l.end + clock })) });
    clock += r.seconds;
  };
  if (opts.intro) push('shot', 'intro', await introSegment(opts.work, opts.intro.page, doc.title, [doc.credit, doc.book].filter(Boolean).join(', ') || undefined));
  const shotSeg = async (s: StoryShot, extra: StoryLine[] = [], tag?: string) =>
    segment({ work: opts.work, name: s.id, video: assets.clip(s.id), still: assets.still(s.id), lines: [...s.lines, ...extra], voices: assets.voice, names, tune, tag, hold: opts.holds?.[s.id], quiet: assets.quiet?.(s.id) });
  for (const s of doc.shots) {
    if (!assets.clip(s.id) && !assets.still(s.id)) continue;
    push('shot', s.id, await shotSeg(s));
    const choice: StoryChoice | undefined = doc.choices.find((c) => c.afterShot === s.id);
    if (!choice) continue;
    const imagined = choice.options.find((o) => !o.canon);
    const canon = choice.options.find((o) => o.canon);
    const card = [choice.question.text.replace(/<[^>]+>/g, '').trim(), ...choice.options.map((o, k) => `${k === 0 ? 'A' : 'B'}.  ${o.label}`)];
    const still = assets.still(s.id) ?? assets.still(imagined?.shots[0]?.id ?? '');
    if (still) push('choice', choice.id, await segment({ work: opts.work, name: `${choice.id}-q`, video: null, still, lines: [choice.question], voices: assets.voice, names, tune, card, minSeconds: 4.5 }));
    const alt = imagined?.shots[0];
    if (alt && (assets.clip(alt.id) || assets.still(alt.id))) push('shot', alt.id, await shotSeg(alt, imagined!.rejoin ? [imagined!.rejoin] : [], `If you choose: ${imagined!.label}`));
    void canon;
  }
  if (!parts.length) throw new Error('nothing to film');
  // join (sound kept as PCM until the end), then music under everything, then one loudness for sharing
  const list = path.join(opts.work, 'film-list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${path.resolve(p.file)}'`).join('\n'));
  const joined = path.join(opts.work, 'film-joined.mkv');
  await ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
  const total = clock;
  const speech = segments.flatMap((g) => g.lines.map((l) => [l.start - 0.3, l.end + 0.45]))
    .sort((a, b) => a[0]! - b[0]!).reduce((acc: number[][], r) => { const last = acc.at(-1); if (last && r[0]! <= last[1]! + 0.8) last[1] = Math.max(last[1]!, r[1]!); else acc.push([...r]); return acc; }, []);
  const duck = speech.map(([a, b]) => `max(0,min(1,min((t-${(a! - 0.4).toFixed(2)})/0.4,(${(b! + 0.4).toFixed(2)}-t)/0.4)))`).join('+') || '0';
  const music = assets.music;
  const args = ['-i', joined];
  let fc: string;
  if (music) {
    const loops = Math.ceil(total / 28) + 1;
    for (let k = 0; k < loops; k++) args.push('-i', music);
    const chain = Array.from({ length: loops - 1 }, (_, k) => `${k === 0 ? '[1:a]' : `[m${k}]`}[${k + 2}:a]acrossfade=d=3:c1=qsin:c2=qsin[m${k + 1}]`).join(';');
    const last = loops > 1 ? `[m${loops - 1}]` : '[1:a]';
    fc = `${chain ? chain + ';' : ''}${last}atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${tune.music},volume='0.3+0.7*(1-min(1,${duck}))':eval=frame,afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, total - 3).toFixed(3)}:d=3[mus];`
      + `[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo[sp];[sp][mus]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`;
  } else fc = `[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`;
  await ff([...args, '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out]);
  if (opts.preview) await ff(['-i', out, '-vf', 'scale=960:540', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-c:a', 'aac', '-b:a', '96k', opts.preview]);
  return { seconds: total, segments };
}
