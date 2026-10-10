// One MindAR detection pyramid level per message, on the TensorFlow.js CPU backend (worker thread).
import { parentPort } from 'node:worker_threads';
import * as tf from '@tensorflow/tfjs';
import { Detector } from 'mind-ar/src/image-target/detector/detector.js';
import { build as hierarchicalClusteringBuild } from 'mind-ar/src/image-target/matching/hierarchical-clustering.js';
import 'mind-ar/src/image-target/detector/kernels/cpu/index.js';

await tf.setBackend('cpu');
await tf.ready();

parentPort.on('message', (image) => {
  if (image.ping) { parentPort.postMessage({ pong: true }); return; }
  const detector = new Detector(image.width, image.height);
  const out = tf.tidy(() => {
    const inputT = tf.tensor(image.data, [image.data.length], 'float32').reshape([image.height, image.width]);
    const { featurePoints: ps } = detector.detect(inputT);
    const maximaPoints = ps.filter((p) => p.maxima);
    const minimaPoints = ps.filter((p) => !p.maxima);
    return {
      maximaPoints, minimaPoints,
      maximaPointsCluster: hierarchicalClusteringBuild({ points: maximaPoints }),
      minimaPointsCluster: hierarchicalClusteringBuild({ points: minimaPoints }),
      width: image.width, height: image.height, scale: image.scale,
    };
  });
  parentPort.postMessage(out);
});
