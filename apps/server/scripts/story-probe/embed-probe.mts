// Probe: Gemini multimodal embeddings on Vertex for page recognition. Embeds page images and a distorted "phone photo"
// of one of them, and prints the cosine similarities.
import fs from 'node:fs';
import sharp from 'sharp';
import { clients } from '../../src/gemini.js';
const [model, ...files] = process.argv.slice(2);
const { ai } = await clients();
async function embed(b: Buffer) {
  const t0 = Date.now();
  const r: any = await ai.models.embedContent({ model: model!, contents: [{ role: 'user', parts: [{ inlineData: { data: b.toString('base64'), mimeType: 'image/jpeg' } }] }] as any });
  const v: number[] = r.embeddings?.[0]?.values ?? [];
  return { v, ms: Date.now() - t0 };
}
const cos = (a: number[], b: number[]) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i]! * b[i]!; x += a[i]! ** 2; y += b[i]! ** 2; } return d / Math.sqrt(x * y); };
const pages = [] as { f: string; v: number[] }[];
for (const f of files) { const b = await sharp(fs.readFileSync(f)).resize(768, 768, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer(); const e = await embed(b); pages.push({ f, v: e.v }); console.log(`${f.split('/').pop()}: dim ${e.v.length}, ${e.ms} ms`); }
// a phone photo of the first page: rotated, cropped, darker, blurred, on a desk-coloured background
const photo = await sharp(fs.readFileSync(files[0]!)).rotate(7, { background: '#7a6a55' }).resize(900).modulate({ brightness: 0.82, saturation: 0.9 }).blur(1.2).extract({ left: 40, top: 60, width: 780, height: 1000 }).jpeg({ quality: 70 }).toBuffer();
fs.writeFileSync('/tmp/embed-probe-photo.jpg', photo);
const p = await embed(photo);
console.log(`photo of ${files[0]!.split('/').pop()}: ${p.ms} ms`);
for (const q of pages) console.log(`  vs ${q.f.split('/').pop()}: ${cos(p.v, q.v).toFixed(4)}`);
