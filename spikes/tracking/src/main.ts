// Living Book — day-0 tracking spike.
// Capture-seeded page tracking: the captured camera frame becomes the tracking target, the tracker starts from the
// known capture pose using tracking templates computed on-device (pure JS, ~ms), and the detection data needed for
// re-acquisition is compiled on the server in the background.
import * as tf from '@tensorflow/tfjs';
import { decode as msgpackDecode } from '@msgpack/msgpack';
import { Tracker } from 'mind-ar/src/image-target/tracker/tracker.js';
import { InputLoader } from 'mind-ar/src/image-target/input-loader.js';
import { CropDetector } from 'mind-ar/src/image-target/detector/crop-detector.js';
import { buildModelViewProjectionTransform, computeScreenCoordiate } from 'mind-ar/src/image-target/estimation/utils.js';
import MindWorker from 'mind-ar/src/image-target/controller.worker.js?worker&inline';
import ExtractWorker from './extract.worker?worker';

type MV = number[][]; // 3x4 model-view in target-pixel units (y down)

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('video');
const frozen = $<HTMLImageElement>('frozen');
const page = $<HTMLDivElement>('page');
const quad = $<HTMLCanvasElement>('quad');
const statsEl = $<HTMLDivElement>('stats');
const logEl = $<HTMLDivElement>('log');
const btnStart = $<HTMLButtonElement>('start');
const btnCapture = $<HTMLButtonElement>('capture');
const btnReset = $<HTMLButtonElement>('reset');
const btnCompile = $<HTMLButtonElement>('compileBrowser');
const selRes = $<HTMLSelectElement>('res');
const selTw = $<HTMLSelectElement>('tw');

const MISS_TOLERANCE = 6;
const LOST_TO_PHOTO_MS = 2000;

let vw = 0, vh = 0;
let K: number[][] = [];
let loader: any = null, cropDetector: any = null, tracker: any = null, mindWorker: Worker | null = null;
let extractWorker: Worker | null = null;
let targetW = 800, targetH = 1000;
let mv: MV | null = null, seedMv: MV | null = null;
let tracking = false, hasMatching = false, running = false, busy = false;
let misses = 0, lostAt = 0, reacquisitions = 0, trackedPts = 0;
let photoMode = false;
let captureCanvas: HTMLCanvasElement | null = null;
let captureBlob: Blob | null = null;
let fullBlob: Blob | null = null;
const timings: Record<string, number | string> = {};
let frames = 0, fpsT0 = performance.now(), fps = 0;
const filter = makeOneEuro(0.001, 1000);

function log(msg: string) {
  const line = `${new Date().toISOString().slice(11, 23)} ${msg}`;
  console.log(line);
  logEl.textContent = (logEl.textContent || '') + line + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}
window.addEventListener('error', (e) => log(`ERROR ${e.message}`));
window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => log(`REJECTION ${e.reason?.message || e.reason}`));

function renderStats(state: string) {
  const t = Object.entries(timings).map(([k, v]) => `${k}=${v}`).join('  ');
  statsEl.textContent = `${state}  video ${vw}x${vh}  target ${targetW}x${targetH}  kf ${KF}  fps ${fps}\n` +
    `tracked pts ${trackedPts}  misses ${misses}  reacq ${reacquisitions}  matching ${hasMatching ? 'yes' : 'no'}  backend ${tf.getBackend?.() || '-'}\n${t}`;
}

// ---------- camera ----------
async function startCamera() {
  const res = Number(selRes.value);
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: res }, height: { ideal: Math.round(res * 9 / 16) } },
  };
  const t0 = performance.now();
  const simParam = new URLSearchParams(location.search).get('sim');
  const stream = simParam ? simulatedCamera(Number(simParam) || 1) : await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await new Promise<void>((r) => { video.onloadedmetadata = () => r(); });
  await video.play();
  vw = video.videoWidth; vh = video.videoHeight;
  // MindAR's InputLoader draws the video using the element's width/height attributes, so they must match the stream
  video.setAttribute('width', String(vw)); video.setAttribute('height', String(vh));
  const s = stream.getVideoTracks()[0]?.getSettings();
  log(`camera ${vw}x${vh} in ${Math.round(performance.now() - t0)} ms; settings ${JSON.stringify({ w: s?.width, h: s?.height, fr: s?.frameRate, facing: (s as any)?.facingMode })}`);
  const fovy = 45 * Math.PI / 180;
  const f = (vh / 2) / Math.tan(fovy / 2);
  K = [[f, 0, vw / 2], [0, f, vh / 2], [0, 0, 1]];
  targetW = Number(selTw.value);
  targetH = Math.round(targetW * vh / vw);
  page.style.width = `${targetW}px`; page.style.height = `${targetH}px`;
  quad.width = window.innerWidth * devicePixelRatio; quad.height = window.innerHeight * devicePixelRatio;
  await prewarm();
  btnCapture.disabled = false; btnReset.disabled = false; btnCompile.disabled = false;
  renderStats('ready');
}

// ---------- synthetic camera for desktop/CI: a drawn page that drifts, rotates and scales ----------
function simulatedCamera(motion: number): MediaStream {
  const W = 1080, H = 1920;
  const pageW = 1000, pageH = 1400;
  const pageCanvas = document.createElement('canvas'); pageCanvas.width = pageW; pageCanvas.height = pageH;
  const pc = pageCanvas.getContext('2d')!;
  pc.fillStyle = '#fdfbf5'; pc.fillRect(0, 0, pageW, pageH);
  pc.fillStyle = '#222'; pc.font = '19px Georgia, serif';
  const words = 'When a body falls freely under gravity its velocity increases uniformly with time. The acceleration due to gravity near the surface of the Earth is about 9.8 metres per second squared. A ball dropped from a height h reaches the ground after time t given by h equals half g t squared. Galileo showed that all bodies fall at the same rate in the absence of air resistance. Example 2.3: a stone is dropped from a tower 20 m high; find the time it takes to reach the ground and its speed on impact. Solution: from h = ½gt², t = √(2h/g) = √(40/9.8) ≈ 2.02 s, and v = gt ≈ 19.8 m/s.'.split(' ');
  let wi = 0;
  for (let y = 80; y < pageH - 60; y += 28) {
    if (y > 500 && y < 920) continue; // leave room for the figure
    let line = ''; while (pc.measureText(line + words[wi % words.length] + ' ').width < pageW - 150) { line += words[wi % words.length] + ' '; wi++; }
    pc.fillText(line, 70, y + 14);
  }
  pc.font = 'bold 30px Georgia, serif'; pc.fillText('2.4 Motion under gravity', 70, 60);
  pc.fillStyle = '#fff'; pc.fillRect(120, 520, pageW - 240, 380); pc.strokeStyle = '#333'; pc.lineWidth = 3; pc.strokeRect(120, 520, pageW - 240, 380);
  pc.fillStyle = '#e63946'; pc.beginPath(); pc.arc(240, 640, 60, 0, Math.PI * 2); pc.fill();
  pc.strokeStyle = '#1d3557'; pc.lineWidth = 8; pc.beginPath(); pc.arc(540, 740, 90, 0, Math.PI * 2); pc.stroke();
  pc.strokeStyle = '#2a9d8f'; pc.lineWidth = 6; pc.beginPath(); pc.moveTo(180, 860); pc.lineTo(420, 580); pc.lineTo(680, 820); pc.closePath(); pc.stroke();
  pc.fillStyle = '#000'; pc.font = '36px sans-serif'; pc.fillText('h = ½ g t²', 320, 870);
  const cam = document.createElement('canvas'); cam.width = W; cam.height = H;
  const cc = cam.getContext('2d')!;
  const t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    cc.fillStyle = '#6b6b6b'; cc.fillRect(0, 0, W, H);
    cc.save();
    cc.translate(W / 2 + Math.sin(t * 0.7) * 60 * motion, H / 2 + Math.cos(t * 0.5) * 40 * motion);
    cc.rotate(Math.sin(t * 0.6) * 0.12 * motion);
    const sc = 0.95 + Math.sin(t * 0.4) * 0.06 * motion;
    cc.scale(sc, sc);
    cc.drawImage(pageCanvas, -pageW / 2, -pageH / 2);
    cc.restore();
    requestAnimationFrame(draw);
  };
  draw();
  log(`simulated camera ${W}x${H}, motion ${motion}`);
  return (cam as any).captureStream(30) as MediaStream;
}

// ---------- pre-warm: compile all WebGL kernels before the user captures ----------
async function prewarm() {
  renderStats('prewarming');
  const t0 = performance.now();
  await tf.setBackend('webgl');
  await tf.ready();
  timings.tfReady = Math.round(performance.now() - t0);
  loader = new InputLoader(vw, vh);
  cropDetector = new CropDetector(vw, vh);
  const mw = new MindWorker();
  mw.onmessage = onMindMessage;
  mw.postMessage({ type: 'setup', inputWidth: vw, inputHeight: vh, projectionTransform: K, debugMode: false, matchingDataList: [] });
  mindWorker = mw;
  extractWorker = new ExtractWorker();
  // dummy target of the canonical size (structured noise) so shader sources match the real target's dimensions
  // sparse blobs on a light background: realistic feature density, cheap to extract
  const grey = new Uint8Array(targetW * targetH).fill(235);
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let b = 0; b < 400; b++) {
    const cx = (rnd() * targetW) | 0, cy = (rnd() * targetH) | 0, r = 3 + rnd() * 10, v = (rnd() * 120) | 0;
    for (let y = Math.max(0, cy - r); y < Math.min(targetH, cy + r); y++) for (let x = Math.max(0, cx - r); x < Math.min(targetW, cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) grey[y * targetW + x] = v;
  }
  const t1 = performance.now();
  const { tracking: dummyTracking, ms } = await extract(grey, targetW, targetH);
  timings.extractDummy = `${ms}ms`;
  const t2 = performance.now();
  const dummy = new Tracker([[targetW, targetH]], [dummyTracking], K, vw, vh);
  const inputT = loader.loadInput(video);
  dummy.dummyRun(inputT);
  cropDetector.detect(inputT);
  cropDetector.detectMoving(inputT);
  inputT.dispose();
  timings.warmKernels = `${Math.round(performance.now() - t2)}ms`;
  timings.prewarmTotal = `${Math.round(performance.now() - t0)}ms`;
  log(`prewarm done: tf ${timings.tfReady} ms, extract dummy ${ms} ms (${Math.round(t2 - t1)} incl worker), kernels ${timings.warmKernels}, total ${timings.prewarmTotal}`);
  running = true;
  loop();
}

const KF = Number(new URLSearchParams(location.search).get('kf')) || 256; // tracking keyframe min-dimension (MindAR default 128)
function extract(grey: Uint8Array, width: number, height: number): Promise<{ tracking: any; ms: number; points: number[] }> {
  return new Promise((resolve) => {
    extractWorker!.onmessage = (e) => resolve(e.data);
    extractWorker!.postMessage({ grey, width, height, kf: KF });
  });
}

// ---------- MindAR worker (matcher + pose refinement) ----------
let pendingTrack: ((mv: MV | null) => void) | null = null;
let pendingMatch: ((r: any) => void) | null = null;
function onMindMessage(e: MessageEvent) {
  const d = e.data;
  if (d.type === 'trackUpdateDone' && pendingTrack) { const r = pendingTrack; pendingTrack = null; r(d.modelViewTransform); }
  if (d.type === 'matchDone' && pendingMatch) { const r = pendingMatch; pendingMatch = null; r(d); }
}
function workerTrackUpdate(last: MV, worldCoords: any[], screenCoords: any[]): Promise<MV | null> {
  return new Promise((resolve) => { pendingTrack = resolve; mindWorker!.postMessage({ type: 'trackUpdate', modelViewTransform: last, worldCoords, screenCoords }); });
}
function workerMatch(featurePoints: any): Promise<any> {
  return new Promise((resolve) => { pendingMatch = resolve; mindWorker!.postMessage({ type: 'match', featurePoints, targetIndexes: [0] }); });
}

// ---------- capture ----------
async function capture() {
  const tCap = performance.now();
  btnCapture.disabled = true;
  captureCanvas = document.createElement('canvas');
  captureCanvas.width = targetW; captureCanvas.height = targetH;
  const ctx = captureCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, targetW, targetH);
  const img = ctx.getImageData(0, 0, targetW, targetH).data;
  const grey = new Uint8Array(targetW * targetH);
  for (let i = 0, j = 0; i < grey.length; i++, j += 4) grey[i] = (img[j]! * 0.299 + img[j + 1]! * 0.587 + img[j + 2]! * 0.114) | 0;
  const q = quality(grey, targetW, targetH);
  timings.blur = q.blur.toFixed(0); timings.luma = `${q.mean.toFixed(0)}/${q.p10.toFixed(0)}`;
  captureBlob = await new Promise<Blob>((r) => captureCanvas!.toBlob((b) => r(b!), 'image/jpeg', 0.85));
  const full = document.createElement('canvas'); full.width = vw; full.height = vh;
  full.getContext('2d')!.drawImage(video, 0, 0, vw, vh);
  frozen.src = URL.createObjectURL(captureBlob);
  const tExtract0 = performance.now();
  const { tracking: trackingData, ms, points } = await extract(grey, targetW, targetH);
  timings.extract = `${ms}ms`;
  tracker = new Tracker([[targetW, targetH]], [trackingData], K, vw, vh);
  seedMv = seedPose();
  mv = seedMv;
  misses = 0; tracking = true; photoMode = false; hasMatching = false; filter.reset();
  timings.captureToTrack = `${Math.round(performance.now() - tCap)}ms`;
  log(`capture: blur ${q.blur.toFixed(0)} luma ${q.mean.toFixed(0)} (p10 ${q.p10.toFixed(0)}); templates ${JSON.stringify(points)} in ${ms} ms (${Math.round(performance.now() - tExtract0)} incl worker); tracking seeded ${timings.captureToTrack} after capture`);
  page.style.display = 'block';
  // background: server compile for re-acquisition data, and upload of the full-res still
  void serverCompile(captureBlob);
  full.toBlob((b) => { fullBlob = b; void upload(b!); }, 'image/jpeg', 0.9);
  btnCapture.disabled = false;
}

function seedPose(): MV {
  const s = vw / targetW;
  const f = K[0]![0]!;
  return [[1, 0, 0, -targetW / 2], [0, 1, 0, -targetH / 2], [0, 0, 1, f / s]];
}

function quality(grey: Uint8Array, w: number, h: number) {
  // downscale to ~320 wide by sampling, then Laplacian variance and luminance percentiles
  const step = Math.max(1, Math.round(w / 320));
  const sw = Math.floor(w / step), sh = Math.floor(h / step);
  const g = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) g[y * sw + x] = grey[(y * step) * w + x * step]!;
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
    const i = y * sw + x;
    const lap = g[i - 1]! + g[i + 1]! + g[i - sw]! + g[i + sw]! - 4 * g[i]!;
    sum += lap; sum2 += lap * lap; n++;
  }
  const meanLap = sum / n, blur = sum2 / n - meanLap * meanLap;
  const sorted = Array.from(g).sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return { blur, mean, p10: sorted[Math.floor(sorted.length * 0.1)]! };
}

async function serverCompile(blob: Blob) {
  const t0 = performance.now();
  try {
    const r = await fetch(`/api/compile?w=${targetW}`, { method: 'POST', body: blob, headers: { 'content-type': 'image/jpeg' } });
    const j = await r.json();
    const total = Math.round(performance.now() - t0);
    const buf = Uint8Array.from(atob(j.buffer), (c) => c.charCodeAt(0));
    const content: any = msgpackDecode(buf);
    const matchingData = content.dataList[0].matchingData;
    mindWorker!.postMessage({ type: 'setup', inputWidth: vw, inputHeight: vh, projectionTransform: K, debugMode: false, matchingDataList: [matchingData] });
    hasMatching = true;
    timings.serverCompile = `${total}ms(srv ${j.ms})`;
    log(`server compile ${j.width}x${j.height}: ${j.ms} ms on server (${total} ms round trip), ${j.levels} levels, ${Math.round(buf.length / 1024)} KB; re-acquisition enabled`);
  } catch (e: any) {
    log(`server compile failed: ${e?.message || e}`);
  }
}

async function upload(blob: Blob) {
  try {
    const r = await fetch(`/api/upload?name=capture-${vw}x${vh}`, { method: 'POST', body: blob, headers: { 'content-type': 'image/jpeg' } });
    const j = await r.json();
    log(`uploaded ${j.path} (${Math.round(blob.size / 1024)} KB)`);
  } catch (e: any) { log(`upload failed: ${e?.message || e}`); }
}

// ---------- main loop ----------
async function loop() {
  while (running) {
    if (!busy) {
      busy = true;
      try { await step(); } catch (e: any) { log(`loop error: ${e?.message || e}`); tracking = false; }
      busy = false;
    }
    frames++;
    const now = performance.now();
    if (now - fpsT0 >= 1000) { fps = Math.round(frames * 1000 / (now - fpsT0)); frames = 0; fpsT0 = now; }
    await tf.nextFrame();
  }
}

async function step() {
  if (!tracker) { renderStats('ready'); return; }
  const inputT = loader.loadInput(video);
  try {
    if (tracking && mv) {
      const r = tracker.track(inputT, mv, 0);
      trackedPts = r.worldCoords.length;
      let next: MV | null = null;
      if (r.worldCoords.length >= 4) next = await workerTrackUpdate(mv, r.worldCoords, r.screenCoords);
      if (next) { mv = next; misses = 0; }
      else { misses++; if (misses > MISS_TOLERANCE) { tracking = false; lostAt = performance.now(); log(`lost (${trackedPts} pts)`); } }
    } else if (!tracking && hasMatching) {
      const { featurePoints } = cropDetector.detectMoving(inputT);
      const res = await workerMatch(featurePoints);
      if (res.targetIndex === 0 && res.modelViewTransform) {
        mv = res.modelViewTransform; tracking = true; misses = 0; reacquisitions++; filter.reset();
        if (photoMode) setPhotoMode(false);
        log(`re-acquired after ${Math.round(performance.now() - lostAt)} ms`);
      }
    }
  } finally { inputT.dispose(); }
  if (!tracking && !photoMode && performance.now() - lostAt > LOST_TO_PHOTO_MS) setPhotoMode(true);
  render();
  renderStats(photoMode ? 'PHOTO MODE (tracking lost)' : tracking ? 'TRACKING' : hasMatching ? 'LOST, searching' : 'LOST, waiting for detection data');
}

function setPhotoMode(on: boolean) {
  photoMode = on;
  frozen.style.display = on ? 'block' : 'none';
  if (on) log('photo mode: experience shown on the frozen capture');
}

// ---------- pose -> screen homography -> CSS ----------
function render() {
  const pose = photoMode ? seedMv : mv;
  if (!pose) return;
  const mvp = buildModelViewProjectionTransform(K, pose);
  const cw = window.innerWidth, ch = window.innerHeight;
  const scale = Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * scale) / 2, oy = (ch - vh * scale) / 2;
  const corners = [[0, 0], [targetW, 0], [targetW, targetH], [0, targetH]].map(([x, y]) => {
    const p = computeScreenCoordiate(mvp, x, y, 0);
    return [p.x * scale + ox, p.y * scale + oy];
  });
  const flat = photoMode ? corners.flat() : filter.filter(performance.now(), corners.flat());
  const H = solveHomography(targetW, targetH, flat);
  if (!H) return;
  page.style.transform = `matrix3d(${H[0]},${H[3]},0,${H[6]}, ${H[1]},${H[4]},0,${H[7]}, 0,0,1,0, ${H[2]},${H[5]},0,1)`;
  const g = quad.getContext('2d')!;
  g.clearRect(0, 0, quad.width, quad.height);
  g.strokeStyle = tracking ? 'rgba(80,255,120,.9)' : 'rgba(255,120,80,.9)'; g.lineWidth = 3 * devicePixelRatio;
  g.beginPath();
  for (let i = 0; i < 4; i++) { const x = flat[i * 2]! * devicePixelRatio, y = flat[i * 2 + 1]! * devicePixelRatio; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath(); g.stroke();
}

// Solve H (h8 = 1) mapping (0,0),(W,0),(W,H),(0,H) to the four screen points.
function solveHomography(W: number, Hh: number, p: number[]): number[] | null {
  const src = [[0, 0], [W, 0], [W, Hh], [0, Hh]];
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const x = src[i]![0]!, y = src[i]![1]!; const X = p[i * 2]!, Y = p[i * 2 + 1]!;
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X, X]);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y, Y]);
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    if (Math.abs(A[piv]![c]!) < 1e-9) return null;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let k = c; k < 9; k++) A[r]![k]! -= f * A[c]![k]!;
    }
  }
  return A.map((row, i) => row[8]! / row[i]!);
}

function makeOneEuro(minCutoff: number, beta: number) {
  let xPrev: number[] | null = null, dxPrev: number[] = [], tPrev = 0;
  const alpha = (te: number, cutoff: number) => { const r = 2 * Math.PI * cutoff * te; return r / (r + 1); };
  return {
    reset() { xPrev = null; },
    filter(t: number, x: number[]) {
      if (!xPrev) { xPrev = x.slice(); dxPrev = x.map(() => 0); tPrev = t; return x; }
      const te = Math.max(t - tPrev, 1);
      const ad = alpha(te, 0.001);
      const out: number[] = [];
      for (let i = 0; i < x.length; i++) {
        const dx = (x[i]! - xPrev[i]!) / te;
        const dxHat = ad * dx + (1 - ad) * dxPrev[i]!;
        const a = alpha(te, minCutoff + beta * Math.abs(dxHat));
        out[i] = a * x[i]! + (1 - a) * xPrev[i]!;
        dxPrev[i] = dxHat;
      }
      xPrev = out; tPrev = t;
      return out;
    },
  };
}

// ---------- optional: in-browser MindAR compile for comparison ----------
async function compileInBrowser() {
  if (!captureCanvas) { log('capture first'); return; }
  btnCompile.disabled = true;
  const t0 = performance.now();
  try {
    const mod: any = await import('mind-ar/src/image-target/compiler.js');
    const compiler = new mod.Compiler();
    let last = 0;
    await compiler.compileImageTargets([captureCanvas], (p: number) => { if (p - last > 25) { last = p; log(`browser compile ${p.toFixed(0)}%`); } });
    const buf = compiler.exportData();
    timings.browserCompile = `${Math.round(performance.now() - t0)}ms`;
    log(`browser compile done in ${timings.browserCompile}, ${Math.round(buf.byteLength / 1024)} KB`);
  } catch (e: any) { log(`browser compile failed: ${e?.message || e}`); }
  btnCompile.disabled = false;
}

function reset() {
  tracking = false; photoMode = false; mv = null; tracker = null; hasMatching = false; misses = 0; trackedPts = 0;
  page.style.display = 'none'; frozen.style.display = 'none';
  quad.getContext('2d')!.clearRect(0, 0, quad.width, quad.height);
  mindWorker?.postMessage({ type: 'setup', inputWidth: vw, inputHeight: vh, projectionTransform: K, debugMode: false, matchingDataList: [] });
  renderStats('ready');
}

btnStart.onclick = () => { btnStart.disabled = true; startCamera().catch((e) => { log(`camera failed: ${e?.message || e}`); btnStart.disabled = false; }); };
btnCapture.onclick = () => { capture().catch((e) => log(`capture failed: ${e?.message || e}`)); };
btnReset.onclick = reset;
btnCompile.onclick = () => { void compileInBrowser(); };
$<HTMLButtonElement>('toggleLog').onclick = () => logEl.classList.toggle('open');
document.addEventListener('visibilitychange', () => log(`visibility ${document.visibilityState}`));
log(`ua ${navigator.userAgent}`);
renderStats('idle');
