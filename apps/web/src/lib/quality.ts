/** Blur (variance of a 3×3 Laplacian) and brightness statistics of a small greyscale frame. */
export function quality(img: ImageData): { blur: number; mean: number; p10: number } {
  const { width: w, height: h, data } = img;
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = data[j]! * 0.299 + data[j + 1]! * 0.587 + data[j + 2]! * 0.114;
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const lap = g[i - 1]! + g[i + 1]! + g[i - w]! + g[i + w]! - 4 * g[i]!;
    sum += lap; sum2 += lap * lap; n++;
  }
  const meanLap = sum / n;
  const sorted = Float32Array.from(g).sort();
  return { blur: sum2 / n - meanLap * meanLap, mean: g.reduce((a, b) => a + b, 0) / g.length, p10: sorted[Math.floor(sorted.length * 0.1)]! };
}
