import sharp from 'sharp';
import { inkMapFromGrey, freeRegionsFromInk, InkField } from '../../../packages/scene/src/index.ts';
const file = process.argv[2]!;
const base = sharp(file).rotate();
const jpeg = await base.clone().resize({ width: 1000 }).jpeg({ quality: 86 }).toBuffer();
const meta = await sharp(jpeg).metadata();
const grey = await sharp(jpeg).greyscale().raw().toBuffer();
const t0 = Date.now();
const ink = inkMapFromGrey(new Uint8Array(grey.buffer, grey.byteOffset, grey.byteLength), meta.width!, meta.height!);
console.log('ink map', ink.cols, 'x', ink.rows, 'in', Date.now() - t0, 'ms; cells with ink>0.1:', ink.ink.filter((v) => v > 0.1).length, 'of', ink.ink.length);
const f = new InkField(ink);
console.log('free regions:', JSON.stringify(freeRegionsFromInk(ink, [100, 595, 900, 1015])));
// rows as a tiny ascii picture
for (let r = 0; r < ink.rows; r += 2) console.log(String(Math.round(r * f.cell)).padStart(5), ink.ink.slice(r * ink.cols, (r + 1) * ink.cols).map((v) => (v > 0.2 ? '#' : v > 0.05 ? '+' : v > 0.01 ? '.' : ' ')).join(''));
