// Backdrops for the homepage: a photograph-like image of an open textbook on a desk whose visible page is the given
// page image (reference-guided image generation). pnpm exec tsx scripts/backdrop.mts <page.jpg> <out.png> <aspect> [scene words]
import fs from 'node:fs/promises';
import { generateImage } from '../src/gemini.js';
const [pageFile, out, aspect = '4:3', ...words] = process.argv.slice(2);
const page = await fs.readFile(pageFile!);
const scene = words.join(' ') || 'on a wooden school desk in warm window light, a pencil and an eraser nearby';
const prompt = `A realistic photograph taken from directly above: an open school textbook lying ${scene}. The visible page of the book is exactly the attached page, printed on slightly textured paper, every diagram and line of text reproduced faithfully and sharp. Natural soft shadows, the page fills most of the frame, no phone, no hands, no added text or stickers.`;
const r = await generateImage({ prompt, aspect, refs: [page], model: 'imageRef' });
await fs.writeFile(out!, r.bytes);
console.log(`saved ${out} (${r.mime}, ${(r.bytes.length / 1e6).toFixed(2)} MB, ${r.usage.model}, ${r.usage.ms} ms, $${r.usage.costUsd.toFixed(3)})`);
