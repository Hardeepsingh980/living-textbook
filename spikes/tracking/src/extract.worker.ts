// Pure-JS extraction of MindAR tracking templates (no TensorFlow needed). Runs off the main thread.
import { buildTrackingImageList } from 'mind-ar/src/image-target/image-list.js';
import { extractTrackingFeatures } from 'mind-ar/src/image-target/tracker/extract-utils.js';

self.onmessage = (e: MessageEvent) => {
  const { grey, width, height } = e.data as { grey: Uint8Array; width: number; height: number };
  const t0 = performance.now();
  const list = buildTrackingImageList({ data: grey, width, height });
  const tracking = extractTrackingFeatures(list, () => {});
  (self as any).postMessage({ tracking, ms: Math.round(performance.now() - t0), points: tracking.map((l: any) => l.points.length) });
};
