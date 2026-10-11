// Compose a two-part chapter film from existing recordings, to test the cards and segments without the pipeline.
//   pnpm exec tsx scripts/chapter-compose-test.mts <lesson1.mp4> <lesson2.mp4> <page1.jpg> <page2.jpg> <out.mp4>
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { renderCards, cardSegment, lessonSegment } from '../src/chapters.js';
const run = promisify(execFile);
const [l1, l2, p1, p2, out] = process.argv.slice(2);
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'lb-ctest-'));
const parts = [
  { n: 1, concept: 'Convection currents in air and water', page: 8, thumb: await fs.readFile(p1!), ideas: ['Warm air rises and cooler air moves in to take its place.', 'Sea breezes blow from the sea to the land during the day.', 'Convection carries heat through liquids and gases.'] },
  { n: 2, concept: 'Reflection of light by spherical mirrors', page: 6, thumb: await fs.readFile(p2!), ideas: ['A concave mirror can form a real, inverted image.', 'Rays parallel to the axis pass through the focus after reflection.'] },
];
const pngs = await renderCards(work, { title: 'Test chapter', subject: 'Science', grade: 'Class 7', parts, questions: ['Why does warm air rise?', 'Where does a ray parallel to the axis go after reflection?'] });
console.log('cards:', Object.values(pngs).flat().length);
const segs: string[] = [];
try {
  segs.push(await cardSegment(work, 'intro', pngs.intro, null, 4));
  segs.push(await cardSegment(work, 'card-0', pngs.parts[0]!, null, 3));
  segs.push(await lessonSegment(work, 'lesson-0', pngs.frames[0]!, l1!));
  segs.push(await cardSegment(work, 'card-1', pngs.parts[1]!, null, 3));
  segs.push(await lessonSegment(work, 'lesson-1', pngs.frames[1]!, l2!));
  segs.push(await cardSegment(work, 'outro', pngs.outro, null, 5));
} catch (e: any) { console.error('FAILED:', String(e?.stderr ?? e?.message).slice(-1200)); process.exit(1); }
await fs.writeFile(path.join(work, 'list.txt'), segs.map((s) => `file '${s}'`).join('\n'));
await run('ffmpeg', ['-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', '-y', out!]);
for (const k of ['intro', 'card-1', 'frame-1', 'outro']) await fs.copyFile(path.join(work, `${k}.png`), path.join(path.dirname(out!), `${k}.png`)).catch(() => {});
console.log('saved', out);
process.exit(0);
