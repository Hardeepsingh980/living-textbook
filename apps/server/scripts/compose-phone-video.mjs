// The real app on a moving phone: Veo animated each green-screen photograph (hands breathing, camera swaying); this
// tracks the green screen in every frame, warps the app's own recording onto it, keys around the fingers, removes
// the green spill, and loops the background back and forth so the clip has no jump.
//   node scripts/compose-phone-video.mjs <veo.mp4> <app.mp4> <out.mp4> [appStart=2] [focusY=0.5]
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const [veo, app, out, ssArg = '2', focusArg = '0.5'] = process.argv.slice(2);
const ss = Number(ssArg), focusY = Number(focusArg);
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames:format=duration', '-of', 'json', f]).toString());

// 1. the background loops back and forth (forward, then reversed), so the hands never jump
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'lb-phonevid-'));
const bg = path.join(work, 'bg.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-i', veo, '-filter_complex', '[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]', '-map', '[v]', '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-y', bg]);
const pb = probe(bg); const W = pb.streams[0].width, H = pb.streams[0].height;
const [fn, fd] = pb.streams[0].r_frame_rate.split('/').map(Number); const fps = fn / (fd || 1);
const FB = W * H * 3;

/** Reads raw RGB frames of a fixed size from an ffmpeg process: chunks are kept as a list (no copy per chunk) and the
 *  decoder is paused while a few frames are waiting, so memory stays small. */
function reader(args, frameBytes) {
  const p = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });
  const chunks = []; let have = 0, ended = false, wake = null;
  p.stdout.on('data', (c) => { chunks.push(c); have += c.length; if (have >= frameBytes * 3) p.stdout.pause(); if (have >= frameBytes) { const w = wake; wake = null; w?.(); } });
  p.stdout.on('end', () => { ended = true; const w = wake; wake = null; w?.(); });
  return {
    close() { p.stdout.destroy(); p.kill('SIGKILL'); },
    async next() {
      while (have < frameBytes && !ended) { p.stdout.resume(); await new Promise((r) => (wake = r)); }
      if (have < frameBytes) return null;
      const frame = Buffer.allocUnsafe(frameBytes); let off = 0;
      while (off < frameBytes) { const c = chunks[0]; const take = Math.min(c.length, frameBytes - off); c.copy(frame, off, 0, take); off += take; if (take === c.length) chunks.shift(); else chunks[0] = c.subarray(take); }
      have -= frameBytes;
      if (have < frameBytes * 3) p.stdout.resume();
      return frame;
    },
  };
}
const isGreen = (r, g, b) => g > 80 && g - Math.max(r, b) > 30;

// 2. pass one: the screen's corners in every frame (extreme points of the green area along the diagonals)
const corners = [];
{
  const rd = reader(['-v', 'error', '-i', bg, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], FB);
  for (let f; (f = await rd.next());) {
    let tl = null, tr = null, bl = null, br = null, ts = Infinity, trs = -Infinity, bls = -Infinity, brs = -Infinity, n = 0;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 3; if (!isGreen(f[i], f[i + 1], f[i + 2])) continue; n++;
      if (x + y < ts) { ts = x + y; tl = [x, y]; } if (x - y > trs) { trs = x - y; tr = [x, y]; } if (y - x > bls) { bls = y - x; bl = [x, y]; } if (x + y > brs) { brs = x + y; br = [x, y]; }
    }
    corners.push(n > 500 ? [tl, tr, bl, br] : null);
  }
}
// fill gaps and smooth: a median of five, then a mean of five, per coordinate
for (let k = 0; k < corners.length; k++) if (!corners[k]) corners[k] = corners[k - 1] ?? corners.find(Boolean);
const smooth = (get) => { const raw = corners.map(get); const med = raw.map((_, k) => { const w = raw.slice(Math.max(0, k - 2), k + 3).sort((a, b) => a - b); return w[Math.floor(w.length / 2)]; }); return med.map((_, k) => { const w = med.slice(Math.max(0, k - 2), k + 3); return w.reduce((a, b) => a + b, 0) / w.length; }); };
const S = [0, 1, 2, 3].map((c) => [smooth((q) => q[c][0]), smooth((q) => q[c][1])]);
const quad = (k) => [0, 1, 2, 3].map((c) => [S[c][0][k], S[c][1][k]]);
// the screen's aspect from the median frame decides how the recording is cropped
const q0 = quad(Math.floor(corners.length / 2));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const aspect = ((dist(q0[0], q0[1]) + dist(q0[2], q0[3])) / 2) / ((dist(q0[0], q0[2]) + dist(q0[1], q0[3])) / 2);
const pa = probe(app); const AW0 = pa.streams[0].width, AH0 = pa.streams[0].height;
let cw = AW0, ch = Math.round(cw / aspect); if (ch > AH0) { ch = AH0; cw = Math.round(ch * aspect); }
const cx = Math.round((AW0 - cw) / 2), cy = Math.round(Math.min(Math.max(0, AH0 * focusY - ch / 2), AH0 - ch));
const AW = 600, AH = Math.round(AW / aspect) & ~1, AB = AW * AH * 3;
console.log(`background ${W}×${H} @${fps.toFixed(0)} fps, ${corners.length} frames; screen aspect ${aspect.toFixed(2)}; app crop ${cw}×${ch}+${cx}+${cy} → ${AW}×${AH}`);

// homography from the app rectangle to the screen quad (corners in tl, tr, bl, br order), inverted for sampling
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; } }
  const h = b.map((v, i) => v / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m; const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

// 3. pass two: warp, key, despill, write
const frames = corners.length, seconds = frames / fps;
const bgr = reader(['-v', 'error', '-i', bg, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], FB);
const apr = reader(['-v', 'error', '-ss', String(ss), '-i', app, '-t', String(seconds + 1), '-vf', `crop=${cw}:${ch}:${cx}:${cy},scale=${AW}:${AH},fps=${fps}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], AB);
const enc = spawn('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0', '-vf', 'scale=540:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', out], { stdio: ['pipe', 'ignore', 'inherit'] });
enc.on('exit', (code) => { if (code) console.error(`encoder exited with ${code}`); });
enc.stdin.on('error', (e) => console.error('encoder input:', e.message));
let lastApp = null;
for (let k = 0; k < frames; k++) {
  const f = await bgr.next(); if (!f) break;
  const a = (await apr.next()) ?? lastApp; lastApp = a;
  const q = quad(k);
  const Hm = homography([[0, 0], [AW, 0], [0, AH], [AW, AH]], q); const Hi = invert(Hm);
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 6), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)) + 6), y0 = Math.max(0, Math.floor(Math.min(...ys)) - 6), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)) + 6);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * W + x) * 3; const r = f[i], g = f[i + 1], b = f[i + 2];
    const spill = g - Math.max(r, b);
    if (spill <= 8) continue;
    const alpha = g > 70 ? Math.min(1, Math.max(0, (spill - 18) / 45)) : 0;
    // despilled background colour (what remains at the edges and under soft fingers)
    let br = r, bgc = Math.min(g, Math.max(r, b) + 6), bb = b;
    if (alpha > 0 && a) {
      const w = Hi[6] * x + Hi[7] * y + Hi[8]; const sx = (Hi[0] * x + Hi[1] * y + Hi[2]) / w, sy = (Hi[3] * x + Hi[4] * y + Hi[5]) / w;
      let ar = 20, ag = 18, ab = 16; // outside the recording (rounded screen corners): the screen's black
      if (sx >= 0 && sy >= 0 && sx < AW - 1 && sy < AH - 1) {
        const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy, j = (iy * AW + ix) * 3, j2 = j + AW * 3;
        ar = (a[j] * (1 - fx) + a[j + 3] * fx) * (1 - fy) + (a[j2] * (1 - fx) + a[j2 + 3] * fx) * fy;
        ag = (a[j + 1] * (1 - fx) + a[j + 4] * fx) * (1 - fy) + (a[j2 + 1] * (1 - fx) + a[j2 + 4] * fx) * fy;
        ab = (a[j + 2] * (1 - fx) + a[j + 5] * fx) * (1 - fy) + (a[j2 + 2] * (1 - fx) + a[j2 + 5] * fx) * fy;
        ar *= 0.96; ag *= 0.96; ab *= 0.95; // a screen in a room is a touch dimmer than the file
      }
      br = br * (1 - alpha) + ar * alpha; bgc = bgc * (1 - alpha) + ag * alpha; bb = bb * (1 - alpha) + ab * alpha;
    }
    f[i] = br; f[i + 1] = bgc; f[i + 2] = bb;
  }
  if (!enc.stdin.write(f)) await new Promise((r) => enc.stdin.once('drain', r));
}
enc.stdin.end();
bgr.close(); apr.close(); // the app clip runs longer than the loop: its decoder is stopped, not drained
await new Promise((r) => enc.on('close', r));
await fs.rm(work, { recursive: true, force: true });
console.log(`saved ${out} (${frames} frames, ${seconds.toFixed(1)} s)`);
