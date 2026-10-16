// Probe: a story keyframe with several references through the app's own generateImage (prints the reason on failure).
import fs from 'node:fs';
import { generateImage } from '../../src/gemini.js';
const [prompt, ...refs] = process.argv.slice(2);
for (let k = 0; k < 3; k++) {
  const t0 = Date.now();
  try { const r = await generateImage({ prompt: prompt!, model: 'imageRef', aspect: '16:9', refs: refs.map((f) => fs.readFileSync(f)), noFallback: true }); console.log(`ok ${((Date.now() - t0) / 1000).toFixed(1)} s ${r.bytes.length} bytes`); }
  catch (e: any) { console.log(`fail ${((Date.now() - t0) / 1000).toFixed(1)} s: ${String(e?.message).slice(0, 300)}`); }
}
