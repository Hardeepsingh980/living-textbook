// The story takes for the second demo video, each a recording of the real app (the deployed one works: stories are
// public). Every sound the page plays (the story's voices, music and clip sound) is logged with its time, so the
// sound can be put back exactly (media-audio.mjs); a character's Gemini Live voice is kept as in take-lesson.mjs.
//   ar      a phone: the scanner with a simulated camera showing a story page, the tap, the film on the page
//   choice  the story player from the start to the choice, the second option, and the imagined scene
//   talk    the story player, then "Talk to <character>": the greeting and a spoken question (simulated microphone)
//   lesson  a phone: the scanner on a science page, Gemini making the lesson, the lesson on the page with the Gemini
//           Live tutor, a spoken question, the tutor's what-if, then the quiz (needs a server with DEV_USERS=1)
//   node scripts/demo-video/take-story.mjs <server> <out dir> <kind> [key=value ...]
//     ar: page=<story page url> name=<take name> seconds=<after the tap> [choice=<option index>]
//     choice / talk: story=<id> [option=<index>] [label=<character>] [mic=<wav>] [phone=1]
//     lesson: page=<page url on the server> mic=<wav>
import fs from 'node:fs';
import path from 'node:path';
import { PW, startCapture, framesToVideo, sleep } from './capture-lib.mjs';
const { chromium } = await import(PW);

const [server, out, kind, ...kv] = process.argv.slice(2);
const opt = Object.fromEntries(kv.map((s) => s.split(/=(.*)/s).slice(0, 2)));
const name = opt.name ?? kind;
const dir = path.join(out, name);
fs.mkdirSync(dir, { recursive: true });

// the GPU (Metal) keeps page tracking at full speed in headless Chrome
const args = ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
if (opt.mic) args.push(`--use-file-for-fake-audio-capture=${path.resolve(opt.mic)}%noloop`);
const browser = await chromium.launch({ args });
const phone = kind === 'ar' || kind === 'lesson' || opt.phone === '1';
const ctx = await browser.newContext(phone
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['microphone', 'camera'] }
  : { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, permissions: ['microphone'] });
if (kind === 'lesson') await ctx.addInitScript(() => { try { localStorage.setItem('lb.devUser', 'demo'); localStorage.setItem('lb.devUserName', 'Asha'); } catch {} });
await ctx.addInitScript(() => {
  window.__captureLive = true;
  // every media element's playback, with times on the page clock
  const log = (window.__media = []);
  let n = 0;
  const rec = (el, ev) => log.push({ ev, id: el.__mid, t: performance.now(), src: el.currentSrc || el.src || '', ct: el.currentTime, vol: el.volume, muted: el.muted, rate: el.playbackRate, tag: el.tagName });
  const hook = (el) => {
    if (el.__mid) return;
    el.__mid = ++n;
    for (const ev of ['playing', 'pause', 'ended', 'volumechange', 'seeked', 'ratechange', 'emptied']) el.addEventListener(ev, () => rec(el, ev));
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) { hook(this); rec(this, 'play'); return play.apply(this, a); };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const size = phone ? { width: 780, height: 1688 } : { width: 1920, height: 1080 };

let cap;
if (kind === 'ar') {
  await page.goto(`${server}/scan?sim=0.3&simpage=${encodeURIComponent(opt.page)}`, { waitUntil: 'load' });
  await page.waitForSelector('.guide-frame.ready', { timeout: 60000 });
  await sleep(1500);
  cap = await startCapture(page, path.join(dir, 'frames'), size);
  await sleep(2000);
  cap.mark('tap');
  await page.click('text=Bring it to life');
  await page.waitForURL(/\/story\//, { timeout: 20000 });
  cap.mark('story');
  await page.waitForSelector('.ar-film.grown', { timeout: 15000 }).catch(() => {});
  cap.mark('grown');
  if (opt.choice !== undefined) {
    // on to the story's turning point, then a choice
    await page.waitForSelector('.story-choice .choice-card', { timeout: 240000 });
    cap.mark('choice');
    await sleep(Number(opt.wait ?? 5500));
    await page.locator('.story-choice .choice-card').nth(Number(opt.choice)).click();
    cap.mark('chosen');
  }
  await sleep(Number(opt.seconds ?? 20) * 1000);
} else if (kind === 'lesson') {
  await page.goto(`${server}/scan?sim=0.3&simpage=${encodeURIComponent(opt.page)}`, { waitUntil: 'load' });
  await page.waitForSelector('.guide-frame.ready', { timeout: 60000 });
  await sleep(1500);
  cap = await startCapture(page, path.join(dir, 'frames'), size);
  await sleep(2000);
  cap.mark('tap');
  await page.click('text=Bring it to life');
  await page.waitForURL(/\/x\//, { timeout: 30000 });
  cap.mark('making');
  for (let i = 0; i < 160 && !(await page.$('.experience.revealed')); i++) await sleep(250);
  cap.mark('revealed');
  // the lesson: the tutor teaches, the question plays into the microphone, the tutor's what-if at the end
  const state = () => page.evaluate(() => ({ caption: document.querySelector('.caption')?.textContent ?? '', knob: !!document.querySelector('.knob-panel'), pill: document.querySelector('.pill.tutor')?.textContent ?? '' })).catch(() => null);
  let sawKnob = false;
  const until = Date.now() + 190_000;
  while (Date.now() < until) {
    await sleep(1000);
    const st = await state();
    if (st?.knob && !sawKnob) { sawKnob = true; cap.mark('knob'); }
    if (sawKnob && /question|try|explore|ask/i.test(st?.caption ?? '') && /\?|!/.test(st?.caption ?? '') && st?.pill && !/Thinking|Changing/.test(st.pill)) { await sleep(3000); break; }
  }
  cap.mark('lesson-done');
  // the quiz: two right answers, one wrong, then the score
  const id = await page.evaluate(() => location.pathname.split('/').pop());
  const quiz = await fetch(`${server}/api/experiences/${id}/quiz`).then((r) => r.json()).catch(() => null);
  await page.click('.quiz-pill').catch(() => {});
  cap.mark('quiz');
  await page.waitForSelector('.quiz-option', { timeout: 40000 }).catch(() => {});
  await sleep(1500);
  for (let k = 0; k < Math.min(3, quiz?.questions?.length ?? 0); k++) {
    const q = (await page.locator('.quiz-q').textContent().catch(() => '')) ?? '';
    const data = quiz.questions.find((x) => x.q.trim() === q.trim()) ?? quiz.questions[k];
    const choose = k === 2 ? data.options.find((o, i) => i !== data.answer) : data.options[data.answer];
    await page.locator('.quiz-option', { hasText: choose }).first().click().catch(() => {});
    cap.mark('answer', { k, right: k !== 2 });
    await sleep(k === 2 ? 3600 : 2400);
    await page.locator('.quiz-card button.primary').last().click().catch(() => {});
    await sleep(900);
  }
  await sleep(2500);
  cap.mark('end');
  fs.writeFileSync(path.join(dir, 'lesson.json'), JSON.stringify({ id }));
} else {
  await page.goto(`${server}/story/${opt.story}`, { waitUntil: 'load' });
  await page.waitForSelector('.cover-card button.primary', { timeout: 30000 });
  await sleep(1500);
  cap = await startCapture(page, path.join(dir, 'frames'), size);
  await sleep(1500);
  cap.mark('start');
  await page.click('.cover-card button.primary');
  if (kind === 'choice') {
    await page.waitForSelector('.story-choice .choice-card', { timeout: 240000 });
    cap.mark('choice');
    await sleep(Number(opt.wait ?? 5500));
    await page.locator('.story-choice .choice-card').nth(Number(opt.option ?? 1)).click();
    cap.mark('chosen');
    await sleep(Number(opt.after ?? 22) * 1000);
  } else {
    await sleep(Number(opt.before ?? 4) * 1000);
    await page.locator('.story-controls button.secondary', { hasText: opt.label ?? 'Dog-Spirit' }).first().click();
    cap.mark('talk');
    await sleep(Number(opt.after ?? 28) * 1000);
  }
}
const timeOrigin = await page.evaluate(() => performance.timeOrigin);
const media = await page.evaluate(() => window.__media ?? []);
const live = await page.evaluate(() => (window.__liveAudio ?? []).slice());
const micStartedAt = await page.evaluate(() => window.__micStartedAt ?? null);
const res = await cap.stop();
fs.writeFileSync(path.join(dir, 'take.json'), JSON.stringify({ timeOrigin, micStartedAt, frames: res.frames, events: res.events, media, errors }, null, 1));
fs.writeFileSync(path.join(dir, 'live.json'), JSON.stringify(live));
framesToVideo(res.frames, path.join(dir, 'take.mp4'), { fps: 30, size: `${size.width}:${size.height}` });
const f0 = res.frames[0].t;
console.log(`${name}: ${res.frames.length} frames, ${((res.frames.at(-1).t - f0) / 1000).toFixed(1)} s, ${media.length} media events, ${live.length} live chunks, mic ${micStartedAt ? ((timeOrigin + micStartedAt - f0) / 1000).toFixed(1) + ' s' : '-'}, errors ${errors.length}`);
console.log(JSON.stringify(res.events.map((e) => [e.name, Math.round((e.t - f0) / 100) / 10])));
await browser.close();
