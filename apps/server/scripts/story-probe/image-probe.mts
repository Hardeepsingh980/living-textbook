// Probe: what does Nano Banana 2.1 answer for a reference-image prompt (image, text, or a block)?
import fs from 'node:fs';
import { Modality } from '@google/genai';
import { clients } from '../../src/gemini.js';
const [ref, aspect = '16:9', ...words] = process.argv.slice(2);
const { ai } = await clients();
const t0 = Date.now();
const res: any = await ai.models.generateContent({
  model: 'gemini-nano-banana-2.1',
  contents: [{ role: 'user', parts: [{ inlineData: { data: fs.readFileSync(ref!).toString('base64'), mimeType: 'image/png' } }, { text: words.join(' ') }] }],
  config: { responseModalities: [Modality.IMAGE], imageConfig: { aspectRatio: aspect } } as any,
});
const c = res.candidates?.[0];
console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s finish=${c?.finishReason} safety=${JSON.stringify(c?.safetyRatings ?? res.promptFeedback ?? '').slice(0, 200)}`);
for (const p of c?.content?.parts ?? []) console.log(p.inlineData ? `image ${p.inlineData.mimeType} ${p.inlineData.data.length}` : `text: ${String(p.text).slice(0, 300)}`);
