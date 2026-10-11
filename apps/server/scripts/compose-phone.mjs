// Put the real app onto the green phone screen of a generated photograph and add a slow camera drift:
//   node scripts/compose-phone.mjs <backdrop.png> <screen.mp4> <out.mp4> [seconds=9] [ss=2] [focusY=0.5]
// The green pixels give both the screen's shape (a mask, so rounded corners stay rounded) and its corners (the clip
// is warped onto a slightly enlarged quad so it overshoots the mask). A portrait clip on a landscape screen is
// letterboxed on paper, as the app itself would show it; otherwise it is cropped to the screen's shape around focusY.
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const run = promisify(execFile);
const [backdrop, screen, out, secondsArg = '9', ssArg = '2', focusArg = '0.5'] = process.argv.slice(2);
const seconds = Number(secondsArg), ss = Number(ssArg), focusY = Number(focusArg);

// 1. the green screen: a mask and its corners
const img = sharp(backdrop);
const { width: W, height: H } = await img.metadata();
const { data } = await img.raw().toBuffer({ resolveWithObject: true });
const mask = Buffer.alloc(W * H);
const pts = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; const r = data[i], g = data[i + 1], b = data[i + 2]; if (g > 90 && g > r * 1.35 && g > b * 1.35) { mask[y * W + x] = 255; pts.push([x, y]); } }
if (pts.length < 2000) { console.error('no green screen found'); process.exit(1); }
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'lb-phone-'));
const maskPng = path.join(work, 'mask.png');
await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).blur(2.2).threshold(40).png().toFile(maskPng); // dilated a few pixels so the anti-aliased rim is covered too
const pick = (score) => pts.reduce((best, p) => (score(p) > score(best) ? p : best), pts[0]);
let tl = pick(([x, y]) => -(x + y)), tr = pick(([x, y]) => x - y), bl = pick(([x, y]) => y - x), br = pick(([x, y]) => x + y);
const cx0 = (tl[0] + tr[0] + bl[0] + br[0]) / 4, cy0 = (tl[1] + tr[1] + bl[1] + br[1]) / 4;
const grow = ([x, y]) => [Math.round(cx0 + (x - cx0) * 1.07), Math.round(cy0 + (y - cy0) * 1.05)]; // overshoot past the rounded corners; the mask trims it
[tl, tr, bl, br] = [tl, tr, bl, br].map(grow);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const qw = (dist(tl, tr) + dist(bl, br)) / 2, qh = (dist(tl, bl) + dist(tr, br)) / 2, aspect = qw / qh;
console.log(`screen ${Math.round(qw)}×${Math.round(qh)} (${aspect.toFixed(2)}) in ${W}×${H}; corners ${[tl, tr, bl, br].map((p) => p.join(',')).join(' ')}`);

// 2. the clip shaped like the screen
const meta = JSON.parse((await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', screen])).stdout).streams[0];
// the clip is cropped to the screen's shape around focusY: a wide screen shows the part of the page the camera is close to
let cw = meta.width, ch = Math.round(cw / aspect);
if (ch > meta.height) { ch = meta.height; cw = Math.round(ch * aspect); }
const cx = Math.round((meta.width - cw) / 2), cy = Math.round(Math.min(Math.max(0, meta.height * focusY - ch / 2), meta.height - ch));
const shape = `crop=${cw}:${ch}:${cx}:${cy}`;
const quad = `x0=${tl[0]}:y0=${tl[1]}:x1=${tr[0]}:y1=${tr[1]}:x2=${bl[0]}:y2=${bl[1]}:x3=${br[0]}:y3=${br[1]}:sense=destination`;
// 3. warp, mask, overlay, drift, encode
const fps = 24, frames = seconds * fps;
const filter = [
  `[1:v]trim=start=${ss}:duration=${seconds},setpts=PTS-STARTPTS,${shape},scale=${W}:${H},format=rgb24,perspective=${quad}:interpolation=cubic[warp]`,
  `[2:v]format=gray[mask]`,
  `[warp][mask]alphamerge[screen]`,
  `color=c=0x141210:s=${W}x${H}:r=${fps}:d=${seconds}[bezel]`,
  `[0:v]format=rgba,chromakey=0x00ff00:similarity=0.3:blend=0.06[keyed]`,
  `[bezel][keyed]overlay=0:0:format=auto,format=rgba[bg]`, // whatever green the mask misses becomes bezel, not green
  `[bg][screen]overlay=0:0:format=auto,format=yuv420p,zoompan=z='1+0.05*on/${frames}':x='iw/2-(iw/zoom/2)+8*sin(on/40)':y='ih/2-(ih/zoom/2)+6*cos(on/55)':d=1:s=${W}x${H}:fps=${fps},scale=540:-2[out]`,
].join(';');
await run('ffmpeg', ['-v', 'error', '-loop', '1', '-framerate', String(fps), '-t', String(seconds), '-i', backdrop, '-i', screen, '-loop', '1', '-framerate', String(fps), '-t', String(seconds), '-i', maskPng, '-filter_complex', filter, '-map', '[out]', '-t', String(seconds), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', out], { maxBuffer: 1 << 26 });
await fs.rm(work, { recursive: true, force: true });
console.log(`saved ${out}`);
