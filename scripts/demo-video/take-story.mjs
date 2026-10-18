// The story takes for the second demo video, each a recording of the real app (the deployed one works: stories are
// public). Every sound the page plays (the story's voices, music and clip sound) is logged with its time, so the
// sound can be put back exactly (media-audio.mjs); a character's Gemini Live voice is kept as in take-lesson.mjs.
//   ar      a phone: the scanner with a simulated camera showing a story page, the tap, the film on the page
//   choice  the story player from the start to the choice, the second option, and the imagined scene
//   talk    the story player, then "Talk to <character>": the greeting and a spoken question (simulated microphone)
//   node scripts/demo-video/take-story.mjs <server> <out dir> <kind> [key=value ...]
//     ar: page=<story page url> name=<take name> seconds=<after the tap>
//     choice / talk: story=<id> [option=<index>] [character=<id>] [mic=<wav>]
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
const phone = kind === 'ar';
const ctx = await browser.newContext(phone
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['microphone', 'camera'] }
  : { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, permissions: ['microphone'] });
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
  await sleep(Number(opt.seconds ?? 20) * 1000);
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
