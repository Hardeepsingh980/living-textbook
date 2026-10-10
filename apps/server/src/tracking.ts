// Server-side compile of MindAR detection + tracking data for a page image, spread across worker threads.
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import * as msgpack from '@msgpack/msgpack';
import { buildImageList, buildTrackingImageList } from 'mind-ar/src/image-target/image-list.js';
import { extractTrackingFeatures } from 'mind-ar/src/image-target/tracker/extract-utils.js';

const N = Math.max(2, Math.min(os.cpus().length - 2, 6)); // leave cores for the event loop and streaming
const MAX_LEVEL_WIDTH = Number(process.env.TRACK_MAX_LEVEL || 640);
let pool: Worker[] | null = null;
let ready: Promise<void> | null = null;

function ensurePool() {
  if (!pool) {
    pool = Array.from({ length: N }, () => new Worker(new URL('./tracking-worker.mjs', import.meta.url)));
    ready = Promise.all(pool.map((w) => new Promise<void>((r) => { w.once('message', () => r()); w.postMessage({ ping: true }); }))).then(() => {});
  }
  return ready!;
}
const runLevel = (w: Worker, image: unknown) => new Promise<any>((resolve) => { w.once('message', resolve); w.postMessage(image); });

export type TrackingCompileResult = { buffer: Uint8Array; ms: number; trackPts: number[]; matchPts: number[]; levels: number };

/** `grey` is a row-major 8-bit greyscale image of the page at the canonical size. */
export async function compileTracking(grey: Uint8Array, width: number, height: number): Promise<TrackingCompileResult> {
  await ensurePool();
  const t0 = Date.now();
  const target = { data: grey, width, height };
  const tracking = extractTrackingFeatures(buildTrackingImageList(target), () => {});
  // The two largest pyramid levels cost ~60% of the compile and only help when the camera is very close;
  // keyframe scales stay relative to the full target, so marker units are unchanged.
  const imageList = buildImageList(target).filter((img: any) => img.width <= MAX_LEVEL_WIDTH);
  const levels = imageList.map((img: any, i: number) => ({ img, i })).sort((a: any, b: any) => b.img.width - a.img.width);
  const results: any[] = new Array(imageList.length);
  let next = 0;
  await Promise.all(pool!.map(async (w) => { while (next < levels.length) { const { img, i } = levels[next++]!; results[i] = await runLevel(w, img); } }));
  const buffer = msgpack.encode({ v: 2, dataList: [{ targetImage: { width, height }, trackingData: tracking, matchingData: results }] });
  return { buffer, ms: Date.now() - t0, levels: imageList.length, trackPts: tracking.map((l: any) => l.points.length), matchPts: results.map((r) => r.maximaPoints.length + r.minimaPoints.length) };
}

export function warmTracking() { return ensurePool(); }
