// Capture-seeded page tracking built on MindAR's tracker (per-frame template matching on WebGL) and matcher
// (feature matching in a worker, used only to re-acquire the page after it is lost).
//
//  1. prewarm(video): compiles the WebGL kernels with a dummy target while the user frames the page.
//  2. seedFromCapture(grey): the captured frame is the target; templates are extracted on-device and tracking
//     starts from the known capture pose (the page fills the frame exactly as captured).
//  3. loadDetectionData(buffer): server-compiled MindAR data enables automatic re-acquisition.
//  Each tracked frame yields the four page corners in video pixels; the presentation layer turns them into CSS.
import * as tf from '@tensorflow/tfjs';
import { decode as msgpackDecode } from '@msgpack/msgpack';
import { Tracker } from 'mind-ar/src/image-target/tracker/tracker.js';
import { InputLoader } from 'mind-ar/src/image-target/input-loader.js';
import { CropDetector } from 'mind-ar/src/image-target/detector/crop-detector.js';
import { buildModelViewProjectionTransform, computeScreenCoordiate } from 'mind-ar/src/image-target/estimation/utils.js';
import MindWorker from 'mind-ar/src/image-target/controller.worker.js?worker&inline';
import ExtractWorker from './extract.worker?worker';

export type MV = number[][];
export type TrackerState = 'idle' | 'prewarming' | 'ready' | 'tracking' | 'lost' | 'searching';
export type Corners = [number, number, number, number, number, number, number, number]; // x0,y0 … x3,y3 in video pixels

const MISS_TOLERANCE = 10;        // frames of failed local tracking before we declare the page lost
const SEARCH_EVERY_MS = 400;      // while lost without detection data: how often to try a pose search around the last pose
const MIN_TRACK_POINTS = 6;       // below this the pose refinement is not trusted

export class PageTracker {
  state: TrackerState = 'idle';
  video!: HTMLVideoElement;
  vw = 0; vh = 0;
  targetW = 0; targetH = 0;
  K: number[][] = [];
  private loader: any = null;
  private cropDetector: any = null;
  private tracker: any = null;
  private mindWorker: Worker | null = null;
  private extractWorker: Worker | null = null;
  private mv: MV | null = null;
  private seedMv: MV | null = null;
  private misses = 0;
  private hasMatching = false;
  private running = false;
  private busy = false;
  private seeding = false;
  private pendingTrack: ((mv: MV | null) => void) | null = null;
  private pendingMatch: ((r: any) => void) | null = null;
  private reqId = 0;
  private filter = makeOneEuro(0.0015, 0.02); // tuned for corner coordinates in pixels (see makeOneEuro)
  private input!: HTMLCanvasElement;           // tracking input: the video scaled down for speed
  private inputCtx!: CanvasRenderingContext2D;
  private inputScale = 1;                      // input px = video px × inputScale
  private lastReacquireAt = 0;
  private lastSearchAt = 0;
  metrics = { losses: 0, reacquisitions: 0, searches: 0, searchHits: 0, framesTracked: 0, framesLost: 0 };
  trackedPts = 0;
  fps = 0; private frames = 0; private fpsT = 0;
  lostAt = 0;
  onCorners: ((c: Corners | null, state: TrackerState) => void) | null = null;
  onLog: ((msg: string) => void) | null = null;
  kf = 256;

  private log(msg: string) { this.onLog?.(msg); }

  /** Compile kernels for a video of this size and a target of the given canonical width. */
  async prewarm(video: HTMLVideoElement, targetW: number) {
    this.video = video;
    this.vw = video.videoWidth; this.vh = video.videoHeight;
    video.setAttribute('width', String(this.vw)); video.setAttribute('height', String(this.vh)); // MindAR's loader reads these attributes
    this.state = 'prewarming';
    const t0 = performance.now();
    await tf.setBackend('webgl'); await tf.ready();
    // tracking runs on a downscaled copy of the frame (≤ 720 px on the long side): 2-4× cheaper per frame on phones
    this.inputScale = Math.min(1, 720 / Math.max(this.vw, this.vh));
    const iw = Math.round(this.vw * this.inputScale), ih = Math.round(this.vh * this.inputScale);
    this.input = document.createElement('canvas'); this.input.width = iw; this.input.height = ih;
    this.input.setAttribute('width', String(iw)); this.input.setAttribute('height', String(ih));
    this.inputCtx = this.input.getContext('2d', { willReadFrequently: false })!;
    const fovy = 45 * Math.PI / 180;
    const f = (ih / 2) / Math.tan(fovy / 2);
    this.K = [[f, 0, iw / 2], [0, f, ih / 2], [0, 0, 1]];
    this.targetW = targetW; this.targetH = Math.round(targetW * this.vh / this.vw);
    this.loader = new InputLoader(iw, ih);
    this.cropDetector = new CropDetector(iw, ih);
    this.extractWorker = new ExtractWorker();
    const mw = new MindWorker();
    mw.onmessage = (e) => this.onMindMessage(e);
    mw.postMessage({ type: 'setup', inputWidth: iw, inputHeight: ih, projectionTransform: this.K, debugMode: false, matchingDataList: [] });
    this.mindWorker = mw;
    // sparse-blob dummy target of the canonical size: same shader sources as the real one, cheap to extract
    const grey = new Uint8Array(this.targetW * this.targetH).fill(235);
    let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let b = 0; b < 400; b++) { const cx = (rnd() * this.targetW) | 0, cy = (rnd() * this.targetH) | 0, r = 3 + rnd() * 10, v = (rnd() * 120) | 0; for (let y = Math.max(0, cy - r); y < Math.min(this.targetH, cy + r); y++) for (let x = Math.max(0, cx - r); x < Math.min(this.targetW, cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) grey[y * this.targetW + x] = v; }
    const { tracking } = await this.extract(grey);
    const dummy = new Tracker([[this.targetW, this.targetH]], [tracking], this.K, iw, ih);
    this.drawInput();
    const inputT = this.loader.loadInput(this.input);
    dummy.dummyRun(inputT); this.cropDetector.detect(inputT); this.cropDetector.detectMoving(inputT);
    inputT.dispose();
    this.state = 'ready';
    this.log(`tracker prewarmed in ${Math.round(performance.now() - t0)} ms (video ${this.vw}x${this.vh}, tracking input ${iw}x${ih}, target ${this.targetW}x${this.targetH})`);
    this.running = true;
    void this.loop();
  }

  private extract(grey: Uint8Array): Promise<{ tracking: any; ms: number; points: number[] }> {
    return new Promise((resolve) => {
      const reqId = ++this.reqId;
      const w = this.extractWorker!;
      const handler = (e: MessageEvent) => { if (e.data.reqId !== reqId) return; w.removeEventListener('message', handler); resolve(e.data); };
      w.addEventListener('message', handler);
      w.postMessage({ grey, width: this.targetW, height: this.targetH, kf: this.kf, reqId });
    });
  }

  /** Draw the current frame at the canonical size and return its greyscale pixels plus a JPEG for upload. */
  captureFrame(): { grey: Uint8Array; canvas: HTMLCanvasElement } {
    const c = document.createElement('canvas'); c.width = this.targetW; c.height = this.targetH;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.video, 0, 0, this.targetW, this.targetH);
    const img = ctx.getImageData(0, 0, this.targetW, this.targetH).data;
    const grey = new Uint8Array(this.targetW * this.targetH);
    for (let i = 0, j = 0; i < grey.length; i++, j += 4) grey[i] = (img[j]! * 0.299 + img[j + 1]! * 0.587 + img[j + 2]! * 0.114) | 0;
    return { grey, canvas: c };
  }

  /** Start tracking from the capture pose. */
  async seedFromCapture(grey: Uint8Array) {
    const t0 = performance.now();
    this.seeding = true;
    try { await this.seedInner(grey, t0); } finally { this.seeding = false; }
  }
  private async seedInner(grey: Uint8Array, t0: number) {
    while (this.busy) await new Promise((r) => setTimeout(r, 5));
    const { tracking, ms, points } = await this.extract(grey);
    this.tracker = new Tracker([[this.targetW, this.targetH]], [tracking], this.K, this.input.width, this.input.height);
    const s = this.input.width / this.targetW, f = this.K[0]![0]!;
    this.seedMv = [[1, 0, 0, -this.targetW / 2], [0, 1, 0, -this.targetH / 2], [0, 0, 1, f / s]];
    this.mv = this.seedMv; this.misses = 0; this.filter.reset(); this.lostAt = performance.now();
    // the hand has moved a little since the capture: look around the seed for the best starting pose
    this.drawInput();
    const inputT = this.loader.loadInput(this.input);
    try { const best = await this.searchPose(inputT, this.seedMv, 2); if (best) this.mv = best; } finally { inputT.dispose(); }
    this.state = 'tracking';
    this.log(`templates ${points.join('/')} in ${ms} ms; tracking seeded ${Math.round(performance.now() - t0)} ms after capture`);
  }

  /** Server-compiled MindAR data: enables re-acquisition. */
  loadDetectionData(buffer: ArrayBuffer) {
    const content: any = msgpackDecode(new Uint8Array(buffer));
    const matchingData = content?.dataList?.[0]?.matchingData;
    if (!matchingData || !this.mindWorker) return;
    this.mindWorker.postMessage({ type: 'setup', inputWidth: this.input.width, inputHeight: this.input.height, projectionTransform: this.K, debugMode: false, matchingDataList: [matchingData] });
    this.hasMatching = true;
    this.log('detection data loaded; re-acquisition enabled');
  }

  /** Corners of the page for the capture pose (used by photo mode). */
  seedCorners(): Corners | null { return this.seedMv ? this.project(this.seedMv) : null; }

  private project(mv: MV): Corners {
    const mvp = buildModelViewProjectionTransform(this.K, mv);
    const out: number[] = [];
    for (const [x, y] of [[0, 0], [this.targetW, 0], [this.targetW, this.targetH], [0, this.targetH]]) { const p = computeScreenCoordiate(mvp, x, y, 0); out.push(p.x / this.inputScale, p.y / this.inputScale); }
    return out as Corners;
  }

  private drawInput() { this.inputCtx.drawImage(this.video, 0, 0, this.input.width, this.input.height); }

  /** Try the local tracker from a grid of poses around `center` (translations and scales); return the pose with most matches. */
  private async searchPose(inputT: any, center: MV, radius: number): Promise<MV | null> {
    this.metrics.searches++;
    const z = center[2]![3]!;
    const stepPx = 0.08 * this.input.width; // 8 % of the frame per grid step (in target units via the depth ratio)
    const f = this.K[0]![0]!;
    const unit = stepPx * z / f; // target units that move the projection by stepPx
    const candidates: MV[] = [];
    for (let sy = -radius; sy <= radius; sy++) for (let sx = -radius; sx <= radius; sx++) for (const zs of [1, 0.88, 1.14]) {
      if (zs !== 1 && (sx !== 0 || sy !== 0)) continue;
      candidates.push([[center[0]![0]!, center[0]![1]!, center[0]![2]!, center[0]![3]! + sx * unit], [center[1]![0]!, center[1]![1]!, center[1]![2]!, center[1]![3]! + sy * unit], [center[2]![0]!, center[2]![1]!, center[2]![2]!, z * zs]]);
    }
    let best: { mv: MV; n: number } | null = null;
    for (const mv of candidates) {
      const r = this.tracker.track(inputT, mv, 0);
      const n = r.worldCoords.length;
      if (n >= MIN_TRACK_POINTS && (!best || n > best.n)) {
        const refined = await this.workerTrackUpdate(mv, r.worldCoords, r.screenCoords);
        if (refined) best = { mv: refined, n };
      }
    }
    if (best) this.metrics.searchHits++;
    return best?.mv ?? null;
  }

  private onMindMessage(e: MessageEvent) {
    const d = e.data;
    if (d.type === 'trackUpdateDone' && this.pendingTrack) { const r = this.pendingTrack; this.pendingTrack = null; r(d.modelViewTransform); }
    if (d.type === 'matchDone' && this.pendingMatch) { const r = this.pendingMatch; this.pendingMatch = null; r(d); }
  }
  private workerTrackUpdate(last: MV, worldCoords: any[], screenCoords: any[]): Promise<MV | null> {
    return new Promise((resolve) => { this.pendingTrack = resolve; this.mindWorker!.postMessage({ type: 'trackUpdate', modelViewTransform: last, worldCoords, screenCoords }); });
  }
  private workerMatch(featurePoints: any): Promise<any> {
    return new Promise((resolve) => { this.pendingMatch = resolve; this.mindWorker!.postMessage({ type: 'match', featurePoints, targetIndexes: [0] }); });
  }

  private async loop() {
    while (this.running) {
      if (!this.busy && !this.seeding && this.tracker && this.video.readyState >= 2) {
        this.busy = true;
        try { await this.step(); } catch (e: any) { this.log(`tracker error: ${e?.message || e}`); this.state = 'lost'; }
        this.busy = false;
      }
      this.frames++; const now = performance.now();
      if (now - this.fpsT >= 1000) { this.fps = Math.round(this.frames * 1000 / (now - this.fpsT)); this.frames = 0; this.fpsT = now; }
      await tf.nextFrame();
    }
  }

  private async step() {
    this.drawInput();
    const inputT = this.loader.loadInput(this.input);
    try {
      if (this.state === 'tracking' && this.mv) {
        const r = this.tracker.track(inputT, this.mv, 0);
        this.trackedPts = r.worldCoords.length;
        let next: MV | null = null;
        if (r.worldCoords.length >= MIN_TRACK_POINTS) next = await this.workerTrackUpdate(this.mv, r.worldCoords, r.screenCoords);
        if (next) { this.mv = next; this.misses = 0; this.metrics.framesTracked++; }
        else if (++this.misses > MISS_TOLERANCE) { this.state = this.hasMatching ? 'searching' : 'lost'; this.lostAt = performance.now(); this.metrics.losses++; this.log(`lost (${this.trackedPts} pts)`); }
      } else if (this.state !== 'tracking' && this.mv) {
        this.metrics.framesLost++;
        const now = performance.now();
        let found: MV | null = null;
        if (this.hasMatching) {
          this.state = 'searching';
          const { featurePoints } = this.cropDetector.detectMoving(inputT);
          const res = await this.workerMatch(featurePoints);
          if (res.targetIndex === 0 && res.modelViewTransform) found = res.modelViewTransform;
        }
        if (!found && now - this.lastSearchAt > SEARCH_EVERY_MS) { this.lastSearchAt = now; found = await this.searchPose(inputT, this.mv, 2); }
        if (found) {
          this.mv = found; this.state = 'tracking'; this.misses = 0; this.metrics.reacquisitions++;
          const quick = now - this.lostAt < 800; // a brief dropout keeps the smoothing state so the layer does not jump
          if (!quick) this.filter.reset();
          this.lastReacquireAt = now;
          this.log(`re-acquired after ${Math.round(now - this.lostAt)} ms`);
        } else if (!this.hasMatching) this.state = 'lost';
      }
    } finally { inputT.dispose(); }
    if (this.state === 'tracking' && this.mv) this.onCorners?.(this.filter.filter(performance.now(), this.project(this.mv)) as Corners, this.state);
    else this.onCorners?.(null, this.state);
  }

  stop() {
    this.running = false;
    try { this.mindWorker?.postMessage({ type: 'dispose' }); } catch { /* ok */ }
    this.extractWorker?.terminate();
    this.mindWorker = null; this.extractWorker = null; this.tracker = null;
    this.state = 'idle';
  }
}

/** Solve the homography (h8 = 1) mapping the rectangle (0,0)-(W,H) onto four screen points; returns a CSS matrix3d. */
export function cornersToMatrix3d(W: number, H: number, p: number[]): string | null {
  const src = [[0, 0], [W, 0], [W, H], [0, H]];
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const x = src[i]![0]!, y = src[i]![1]!, X = p[i * 2]!, Y = p[i * 2 + 1]!;
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X, X]);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y, Y]);
  }
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    if (Math.abs(A[piv]![c]!) < 1e-9) return null;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r]![c]! / A[c]![c]!; for (let k = c; k < 9; k++) A[r]![k]! -= f * A[c]![k]!; }
  }
  const h = A.map((row, i) => row[8]! / row[i]!);
  return `matrix3d(${h[0]},${h[3]},0,${h[6]}, ${h[1]},${h[4]},0,${h[7]}, 0,0,1,0, ${h[2]},${h[5]},0,1)`;
}

/** One-euro filter over an array of pixel coordinates. te is in ms: minCutoff 0.0015 ≈ 1.5 Hz smoothing at rest,
 *  beta 0.02 per px/ms opens the cutoff quickly under real motion so the layer never lags the page. */
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
