// A whole chapter in, a teacher's explainer film out. The chapter PDF is split into pages; every page is scored for
// how well it can be brought to life; the best few (in book order) become lessons through the same pipeline as a
// photographed page; each lesson is played in presentation mode and recorded with the tutor narrating; then the
// pieces are set into a 16:9 film: a title card, a card before each part, each lesson beside a panel of its key
// ideas, and closing questions for the class taken from the lessons' quizzes. Jobs run one at a time.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { runPipeline } from './pipeline.js';
import { recordLesson } from './reels.js';
import { store } from './store.js';
import { scorePage, chapterInfo, type PageScore } from './pages.js';
import { synthesize } from './gemini.js';
import { quizFor } from './quiz.js';
import type { ExperienceRecord, PipelineEvent } from '@living-book/scene';

const run = promisify(execFile);
const FPS = 30;
const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2'];

import type { JobDoc, JobSection } from './store.js';
type ChapterJob = {
  id: string; ownerId: string; createdAt: number;
  status: 'queued' | 'reading' | 'choosing' | 'making' | 'composing' | 'ready' | 'failed';
  detail: string; title?: string; subject?: string; grade?: string; pages?: number; sections: JobSection[];
  url?: string; poster?: string; seconds?: number; error?: string; questions?: string[];
};
type Report = (patch: Partial<JobDoc>) => void;

/** Make a chapter film from the job's PDF; progress goes to `report` (also every two seconds, since the parts change
 *  state in place). Resolves with what the finished job shows. */
export async function runChapter(doc: JobDoc, pdf: Buffer, report: Report): Promise<Partial<JobDoc>> {
  const job: ChapterJob = { id: doc.id, ownerId: doc.owner, createdAt: Date.now(), status: 'reading', detail: 'Reading the chapter', sections: [] };
  const push = () => report({ stage: job.status, detail: job.detail, title: job.title, subject: job.subject, grade: job.grade, pages: job.pages, sections: job.sections.map((x) => ({ ...x })), questions: job.questions });
  const timer = setInterval(push, 2000);
  try {
    await makeChapter(job, { pdf, ownerId: doc.owner, sections: doc.options.sections });
    push();
    return { url: job.url, poster: job.poster, seconds: job.seconds, title: job.title, subject: job.subject, grade: job.grade, pages: job.pages, sections: job.sections, questions: job.questions };
  } finally { clearInterval(timer); }
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const similar = (a: string, b: string) => { const A = words(a), B = words(b); if (!A.size || !B.size) return false; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size) >= 0.6; };
function limit(n: number) { let active = 0; const waiting: (() => void)[] = []; return async <T>(fn: () => Promise<T>): Promise<T> => { while (active >= n) await new Promise<void>((r) => waiting.push(r)); active++; try { return await fn(); } finally { active--; waiting.shift()?.(); } }; }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

async function makeChapter(job: ChapterJob, input: { pdf: Buffer; ownerId: string; sections?: number }) {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'lb-chapter-'));
  const t0 = Date.now();
  try {
    // 1. the pages
    job.status = 'reading'; job.detail = 'Reading the chapter';
    const pdf = path.join(work, 'chapter.pdf'); await fs.writeFile(pdf, input.pdf);
    const info = await run('pdfinfo', [pdf]).then((r) => r.stdout).catch(() => '');
    const pageCount = Number(/Pages:\s+(\d+)/.exec(info)?.[1] ?? 0);
    if (!pageCount) throw new Error('this file is not a readable PDF');
    await run('pdftoppm', ['-r', '110', '-f', '1', '-l', String(Math.min(pageCount, 40)), '-jpeg', '-jpegopt', 'quality=86', pdf, path.join(work, 'p')]);
    const num = (f: string) => Number(/p-(\d+)\.jpg$/.exec(f)?.[1] ?? 0);
    const files = (await fs.readdir(work)).filter((f) => /^p-\d+\.jpg$/.test(f)).sort((a, b) => num(a) - num(b));
    const imgs = await Promise.all(files.map((f) => fs.readFile(path.join(work, f))));
    job.pages = imgs.length;

    // 2. the parts worth a lesson: every page scored, the best few kept in book order
    job.status = 'choosing'; job.detail = `Looking at ${imgs.length} pages`;
    const infoP = chapterInfo(imgs.slice(0, 2)).catch(() => ({ title: 'This chapter', subject: '', grade: '', language: 'en' }));
    const scores: (PageScore & { page: number })[] = [];
    const four = limit(4);
    await Promise.all(imgs.map((img, i) => four(async () => { try { scores.push({ ...(await scorePage(img)), page: i + 1 }); } catch { /* an unreadable page is skipped */ } job.detail = `Looking at ${imgs.length} pages (${scores.length} read)`; })));
    const ci = await infoP; job.title = ci.title; job.subject = ci.subject; job.grade = ci.grade;
    const want = Math.max(2, Math.min(8, input.sections ?? 5));
    const chosen: (PageScore & { page: number })[] = [];
    const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
    for (const s of scores.filter((x) => x.score >= 7).map((x) => ({ ...x, concept: cap(x.concept) })).sort((a, b) => b.score - a.score || a.page - b.page)) {
      if (chosen.length >= want) break;
      if (chosen.some((c) => similar(c.concept, s.concept))) continue;
      chosen.push(s);
    }
    if (!chosen.length) throw new Error('no page in this chapter has a diagram to bring to life');
    chosen.sort((a, b) => a.page - b.page);
    const folder = `chapter-${job.id}`;
    job.sections = await Promise.all(chosen.map(async (c) => ({ page: c.page, concept: c.concept, score: c.score, status: 'waiting' as const, thumb: await store.putFile(folder, `page-${c.page}.jpg`, await sharp(imgs[c.page - 1]!).resize({ width: 360 }).jpeg({ quality: 78 }).toBuffer(), 'image/jpeg') })));

    // 3. the lessons: two pipelines at a time; recordings one at a time, in book order, as each lesson is ready
    job.status = 'making';
    const two = limit(2);
    const made = chosen.map((c, i) => two(async (): Promise<ExperienceRecord | null> => {
      const sec = job.sections[i]!; sec.status = 'making';
      try {
        const jpeg = await sharp(imgs[c.page - 1]!).jpeg({ quality: 90 }).toBuffer();
        let ok = false;
        const rec = await runPipeline({ image: jpeg, mime: 'image/jpeg', ownerId: job.ownerId }, (e: PipelineEvent) => { if (e.type === 'quick') sec.title = e.data.title; if (e.type === 'ready') ok = true; });
        if (!ok || !rec.scene) throw new Error('no usable scene');
        sec.experienceId = rec.id;
        return rec;
      } catch (e: any) { sec.status = 'skipped'; console.warn('[chapter] page', c.page, 'skipped:', String(e?.message).slice(0, 120)); return null; }
    }));
    const lessons: { i: number; rec: ExperienceRecord; file: string }[] = [];
    for (let i = 0; i < chosen.length; i++) {
      const rec = await made[i]!;
      if (!rec) continue;
      const sec = job.sections[i]!; sec.status = 'recording';
      const seconds = Math.max(30, Math.min(75, rec.scene.steps.length * 14 + 6));
      job.detail = `Recording part ${i + 1} of ${chosen.length}`;
      try {
        const mp4 = await recordLesson(rec.id, seconds, (d) => { job.detail = `Recording part ${i + 1} of ${chosen.length} (${d} of ${seconds} s)`; }, `${job.id.slice(0, 8)}-${i + 1}`);
        const file = path.join(work, `lesson-${i}.mp4`); await fs.writeFile(file, mp4);
        lessons.push({ i, rec, file }); sec.status = 'done';
      } catch (e: any) { sec.status = 'skipped'; console.warn('[chapter] recording', i + 1, 'failed:', String(e?.message).slice(0, 120)); }
    }
    if (!lessons.length) throw new Error('no lesson could be recorded');

    // 4. the film
    job.status = 'composing'; job.detail = 'Writing the cards';
    const quizzes = await Promise.all(lessons.map((l) => quizFor(l.rec.id).catch(() => null)));
    const questions = quizzes.map((q) => q?.questions[0]?.q).filter((q): q is string => !!q).slice(0, 4);
    job.questions = questions;
    const parts = lessons.map((l, k) => ({ n: k + 1, concept: job.sections[l.i]!.concept || l.rec.quick.title, page: job.sections[l.i]!.page, thumb: imgs[job.sections[l.i]!.page - 1]!, ideas: keyIdeas(l.rec) }));
    const pngs = await renderCards(work, { title: ci.title, subject: ci.subject, grade: ci.grade, parts, questions });
    job.detail = 'Recording the voice for the cards';
    const voice = async (name: string, text: string) => { try { const t = await synthesize({ text }); const f = path.join(work, `${name}.wav`); await fs.writeFile(f, t.wav); return { file: f, ms: t.durationMs }; } catch { return null; } };
    const [introV, outroV, ...partV] = await Promise.all([
      voice('intro', `${ci.title}. In this film, ${parts.map((p) => p.concept).join('; ')}.`),
      voice('outro', questions.length ? `Questions for the class. ${questions.join(' ')}` : 'That is the chapter. Try it on your own page.'),
      ...parts.map((p) => voice(`part-${p.n}`, `Part ${p.n}. ${p.concept}.`)),
    ]);
    job.detail = 'Putting the film together';
    const segs: string[] = [];
    segs.push(await cardSegment(work, 'seg-intro', pngs.intro, introV, 5));
    for (const [k, l] of lessons.entries()) {
      segs.push(await cardSegment(work, `seg-card-${k}`, pngs.parts[k]!, partV[k] ?? null, 3));
      segs.push(await lessonSegment(work, `seg-lesson-${k}`, pngs.frames[k]!, l.file));
      job.detail = `Putting the film together (${k + 1} of ${lessons.length})`;
    }
    segs.push(await cardSegment(work, 'seg-outro', pngs.outro, outroV, 6));
    const list = path.join(work, 'list.txt');
    await fs.writeFile(list, segs.map((s) => `file '${s}'`).join('\n'));
    const out = path.join(work, 'chapter.mp4');
    await run('ffmpeg', ['-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', '-y', out], { maxBuffer: 1 << 26 });
    const seconds = Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out])).stdout.trim()) || 0;
    const bytes = await fs.readFile(out);
    const poster = await run('ffmpeg', ['-v', 'error', '-ss', '2', '-i', out, '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', '-q:v', '4', 'pipe:1'], { encoding: 'buffer', maxBuffer: 1 << 24 }).then((r) => r.stdout as unknown as Buffer).catch(() => null);
    job.url = await store.putFile(folder, 'chapter.mp4', bytes, 'video/mp4');
    if (poster) job.poster = await store.putFile(folder, 'poster.jpg', poster, 'image/jpeg');
    job.seconds = Math.round(seconds);
    job.status = 'ready'; job.detail = 'Ready';
    console.log(`[chapter] ${job.id} ready: ${job.url} (${(bytes.length / 1e6).toFixed(1)} MB, ${job.seconds} s, ${lessons.length} parts, ${Math.round((Date.now() - t0) / 1000)} s to make)`);
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Up to three short statements the page itself supports. */
function keyIdeas(rec: ExperienceRecord): string[] {
  const claims = (rec.extraction?.claims ?? []).map((c) => c.trim()).filter((c) => c.length >= 12 && c.length <= 130);
  const picked = claims.slice(0, 3);
  if (picked.length >= 2) return picked;
  const lines = rec.scene.steps.map((s: any) => String(s.narration ?? '').split(/(?<=[.!?])\s/)[0] ?? '').filter((t): t is string => !!t && t.length <= 130);
  return [...picked, ...lines].slice(0, 3);
}

/** The cards and the lesson frames, drawn as HTML in the hand-drawn style and photographed at 1920×1080. */
export async function renderCards(work: string, d: { title: string; subject: string; grade: string; parts: { n: number; concept: string; page: number; thumb: Buffer; ideas: string[] }[]; questions: string[] }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const shoot = async (name: string, body: string) => {
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Patrick+Hand&display=block" rel="stylesheet"><style>${CARD_CSS}</style></head><body>${body}</body></html>`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
      await page.evaluate('document.fonts && document.fonts.ready').catch(() => {});
      const file = path.join(work, `${name}.png`);
      await page.screenshot({ path: file });
      return file;
    };
    const thumb = async (b: Buffer) => `data:image/jpeg;base64,${(await sharp(b).resize({ width: 560 }).jpeg({ quality: 80 }).toBuffer()).toString('base64')}`;
    const meta = [d.grade, d.subject].filter(Boolean).join(' · ');
    const intro = await shoot('intro', `<div class="mark">Living Textbook</div>${meta ? `<div class="postit tag">${esc(meta)}</div>` : ''}<h1 class="title">${esc(d.title)}<svg class="ul" viewBox="0 0 600 30" preserveAspectRatio="none"><path d="M6 20 C 140 6, 330 4, 594 14"/></svg></h1><div class="sub">A video explainer in ${d.parts.length} ${d.parts.length === 1 ? 'part' : 'parts'}</div><ol class="parts">${d.parts.map((p) => `<li><span class="num">${p.n}</span>${esc(p.concept)}</li>`).join('')}</ol>`);
    const parts: string[] = [], frames: string[] = [];
    for (const p of d.parts) {
      const t = await thumb(p.thumb);
      parts.push(await shoot(`card-${p.n}`, `<div class="mark">Living Textbook</div><div class="part-card"><div class="big-num">${p.n}</div><div><div class="part-of">Part ${p.n} of ${d.parts.length}</div><h1 class="concept">${esc(p.concept)}</h1><div class="postit pg">Page ${p.page}</div></div></div><div class="thumb"><span class="tape"></span><img src="${t}"></div>`));
      frames.push(await shoot(`frame-${p.n}`, `<div class="video-slot"><span class="tape"></span></div><div class="panel"><div class="part-of">Part ${p.n} of ${d.parts.length} · page ${p.page}</div><h2 class="concept small">${esc(p.concept)}</h2><div class="ideas-head">Key ideas</div><ul class="ideas">${p.ideas.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div><div class="mark corner">Living Textbook</div>`));
    }
    const outro = await shoot('outro', `<div class="mark">Living Textbook</div><h1 class="title mid">${d.questions.length ? 'Questions for the class' : 'That is the chapter'}<span class="dot">.</span></h1><div class="qs">${d.questions.map((q, k) => `<div class="postit q" style="transform:rotate(${[-1.5, 1.2, -0.8, 1][k % 4]}deg)">${esc(q)}</div>`).join('')}</div><div class="foot">Point a phone at the page to explore it yourself.</div>`);
    return { intro, parts, frames, outro };
  } finally { await browser.close().catch(() => {}); }
}

const CARD_CSS = `
*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden}
body{background:#fdfbf7 radial-gradient(#e5e0d8 2px,transparent 2px) 0 0/34px 34px;color:#2d2d2d;font-family:"Patrick Hand",sans-serif;position:relative}
h1,h2{font-family:Kalam,sans-serif;font-weight:700;margin:0;line-height:1.08}
.mark{position:absolute;left:90px;top:60px;font-family:Kalam;font-weight:700;font-size:40px;transform:rotate(-2deg);display:flex;align-items:center;gap:14px}
.mark:before{content:"";width:26px;height:34px;border:4px solid #2d2d2d;border-radius:4px 12px 12px 4px;background:#fff9c4;box-shadow:3px 3px 0 #2d2d2d}
.mark.corner{left:auto;right:70px;top:auto;bottom:44px;font-size:30px;opacity:.7}
.postit{display:inline-block;background:#fff9c4;border:3px solid #2d2d2d;border-radius:18px 120px 14px 110px/110px 14px 120px 18px;box-shadow:5px 5px 0 #2d2d2d;padding:8px 26px;font-family:Kalam;font-weight:700}
.tag{position:absolute;left:90px;top:170px;font-size:36px;transform:rotate(-2deg)}
.title{position:absolute;left:90px;top:270px;width:1600px;font-size:132px}
.title.mid{top:200px;font-size:110px}
.title .dot,.dot{color:#ff4d4d}
.ul{display:block;width:620px;height:30px;margin-top:6px}.ul path{fill:none;stroke:#ff4d4d;stroke-width:9;stroke-linecap:round}
.sub{position:absolute;left:94px;top:540px;font-size:46px;color:rgba(45,45,45,.7)}
.parts{position:absolute;left:90px;top:640px;margin:0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:18px 60px;width:1700px}
.parts li{font-family:Kalam;font-size:44px;display:flex;align-items:center;gap:20px}
.num{flex:none;width:66px;height:66px;display:grid;place-items:center;border:4px solid #2d2d2d;border-radius:48% 52% 50% 50%/52% 48% 52% 48%;background:#fff;box-shadow:4px 4px 0 #2d2d2d;font-weight:700;font-size:36px}
.part-card{position:absolute;left:90px;top:300px;width:1050px;display:flex;gap:48px;align-items:flex-start}
.big-num{flex:none;width:220px;height:220px;display:grid;place-items:center;font-family:Kalam;font-weight:700;font-size:150px;color:#fff;background:#ff4d4d;border:5px solid #2d2d2d;border-radius:48% 52% 50% 50%/52% 48% 52% 48%;box-shadow:8px 8px 0 #2d2d2d;transform:rotate(-6deg)}
.part-of{font-family:Kalam;font-size:40px;color:rgba(45,45,45,.65);margin-bottom:10px}
.concept{font-size:96px}.concept.small{font-size:68px;margin:6px 0 34px}
.pg{margin-top:34px;font-size:36px;transform:rotate(2deg)}
.thumb{position:absolute;right:120px;top:150px;width:560px;background:#fff;border:4px solid #2d2d2d;border-radius:15px 255px 15px 225px/225px 15px 255px 15px;box-shadow:10px 10px 0 #2d2d2d;padding:16px;transform:rotate(3deg)}
.thumb img{display:block;width:100%;border-radius:6px}
.tape{position:absolute;top:-22px;left:50%;width:170px;height:42px;background:rgba(45,45,45,.16);transform:translateX(-50%) rotate(-4deg);z-index:2}
.video-slot{position:absolute;left:66px;top:30px;width:830px;height:1020px;background:#fff;border:4px solid #2d2d2d;border-radius:15px 255px 15px 225px/225px 15px 255px 15px;box-shadow:10px 10px 0 #2d2d2d;transform:rotate(-.6deg)}
.panel{position:absolute;left:970px;top:110px;width:860px}
.ideas-head{display:inline-block;font-family:Kalam;font-weight:700;font-size:40px;background:#fff9c4;border:3px solid #2d2d2d;border-radius:14px 90px 12px 80px/80px 12px 90px 14px;box-shadow:4px 4px 0 #2d2d2d;padding:4px 22px;transform:rotate(-2deg);margin-bottom:26px}
.ideas{margin:0;padding:0;list-style:none;display:grid;gap:26px}
.ideas li{font-size:40px;line-height:1.3;padding-left:52px;position:relative}
.ideas li:before{content:"";position:absolute;left:0;top:14px;width:26px;height:26px;border:4px solid #2d5da1;border-radius:48% 52% 50% 50%/52% 48% 52% 48%}
.qs{position:absolute;left:90px;top:400px;width:1740px;display:grid;gap:34px}
.q{font-size:48px;font-weight:400;padding:16px 34px;line-height:1.25}
.foot{position:absolute;left:94px;bottom:70px;font-size:40px;color:rgba(45,45,45,.7)}
`;

/** A card held on screen for its narration (or `min` seconds), fading in and out. */
export async function cardSegment(work: string, name: string, png: string, voice: { file: string; ms: number } | null, min: number) {
  const dur = Math.max(min, voice ? voice.ms / 1000 + 1.4 : min);
  const out = path.join(work, `${name}.mp4`);
  const audio = voice ? ['-i', voice.file] : ['-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=48000:cl=stereo'];
  const af = voice ? `[1:a]adelay=500|500,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${dur.toFixed(2)}[a]` : `[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${dur.toFixed(2)}[a]`;
  await run('ffmpeg', ['-v', 'error', '-loop', '1', '-framerate', String(FPS), '-t', dur.toFixed(2), '-i', png, ...audio, '-filter_complex', `[0:v]format=yuv420p,fade=in:st=0:d=0.45,fade=out:st=${(dur - 0.45).toFixed(2)}:d=0.45[v];${af}`, '-map', '[v]', '-map', '[a]', '-t', dur.toFixed(2), ...ENC, '-y', out], { maxBuffer: 1 << 26 });
  return out;
}

/** A recorded lesson set into its frame: the page on the left in a taped card, the key ideas on the right. */
export async function lessonSegment(work: string, name: string, framePng: string, lesson: string) {
  const out = path.join(work, `${name}.mp4`);
  const probe = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', lesson])).stdout);
  const v = probe.streams.find((s: any) => s.codec_type === 'video');
  const hasAudio = probe.streams.some((s: any) => s.codec_type === 'audio');
  const dur = Number(probe.format.duration) || 30;
  const boxW = 790, boxH = 990;
  const scale = Math.min(boxW / v.width, boxH / v.height);
  const w = Math.round((v.width * scale) / 2) * 2, h = Math.round((v.height * scale) / 2) * 2;
  const x = 66 + Math.round((830 - w) / 2), y = 30 + Math.round((1020 - h) / 2);
  const audio = hasAudio ? [] : ['-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=48000:cl=stereo'];
  const af = hasAudio ? '[1:a]aresample=48000,aformat=channel_layouts=stereo[a]' : '[2:a]aresample=48000,aformat=channel_layouts=stereo[a]';
  await run('ffmpeg', ['-v', 'error', '-loop', '1', '-framerate', String(FPS), '-t', dur.toFixed(2), '-i', framePng, '-i', lesson, ...audio, '-filter_complex', `[1:v]scale=${w}:${h},setsar=1[l];[0:v][l]overlay=${x}:${y}:shortest=1,format=yuv420p,fade=in:st=0:d=0.4[v];${af}`, '-map', '[v]', '-map', '[a]', '-t', dur.toFixed(2), ...ENC, '-y', out], { maxBuffer: 1 << 26 });
  return out;
}
