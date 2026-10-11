// A photograph-like image of hands holding a phone above an open textbook that shows the given page; the phone's
// screen is a flat green rectangle so the real app can be keyed onto it afterwards (scripts/compose-phone.mjs).
//   pnpm exec tsx scripts/phone-backdrop.mts <page.jpg> <out.png> [aspect] [scene words]
import fs from 'node:fs/promises';
import { generateImage } from '../src/gemini.js';
const [pageFile, out, aspect = '9:16', ...words] = process.argv.slice(2);
const page = await fs.readFile(pageFile!);
const scene = words.join(' ') || 'on a wooden desk in warm window light';
const prompt = `A realistic photograph, vertical framing, slightly from above: an adult's two hands hold a modern smartphone flat and level, screen up, about twenty centimetres above an open school textbook lying ${scene}. The phone's screen is a single flat, uniform, bright pure green rectangle (#00FF00) with no reflections, no icons and nothing on it, filling the whole front of the phone; the phone takes up roughly a third of the frame and is seen face-on so its screen is an almost perfect rectangle. The visible page of the book under the phone is exactly the attached page, sharp and faithful. Shallow depth of field on the background, natural colours, no text anywhere except on the page.`;
const r = await generateImage({ prompt, aspect, refs: [page], model: 'imageRef' });
await fs.writeFile(out!, r.bytes);
console.log(`saved ${out} (${(r.bytes.length / 1e6).toFixed(2)} MB, ${r.usage.model}, ${r.usage.ms} ms)`);
