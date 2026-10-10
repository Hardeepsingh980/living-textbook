// Pure-JS extraction of MindAR tracking templates (no TensorFlow needed). Runs off the main thread.
import { resize } from 'mind-ar/src/image-target/utils/images.js';
import { extractTrackingFeatures } from 'mind-ar/src/image-target/tracker/extract-utils.js';

// MindAR's tracker only reads index 1 of this list (its tracking keyframe; default 128 px of the min dimension),
// so index 0 is a tiny placeholder and only the keyframe level is extracted.
function buildList(target: { data: Uint8Array; width: number; height: number }, kf: number) {
  const minDim = Math.min(target.width, target.height);
  const ratio = kf / minDim;
  const placeholder = { data: new Uint8Array(16), width: 4, height: 4, scale: 4 / minDim };
  return [placeholder, Object.assign(resize({ image: target, ratio }), { scale: ratio })];
}

self.onmessage = (e: MessageEvent) => {
  const { grey, width, height, kf } = e.data as { grey: Uint8Array; width: number; height: number; kf: number };
  const t0 = performance.now();
  const list = buildList({ data: grey, width, height }, kf || 128);
  const tracking = extractTrackingFeatures(list, () => {});
  (self as any).postMessage({ tracking, ms: Math.round(performance.now() - t0), points: tracking.map((l: any) => l.points.length) });
};
