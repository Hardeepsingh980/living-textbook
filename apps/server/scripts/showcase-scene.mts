// Make a showcase experience from a page with extra direction for the scene model, and print its id.
//   LB_USE_GCLOUD_TOKEN=1 STORE=cloud ... pnpm exec tsx scripts/showcase-scene.mts <page.jpg> "<emphasis>"
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { runPipeline } from '../src/pipeline.js';
const [file, emphasis = ''] = process.argv.slice(2);
const jpeg = await sharp(await fs.readFile(file!)).rotate().jpeg({ quality: 90 }).toBuffer();
const rec = await runPipeline({ image: jpeg, mime: 'image/jpeg', ownerId: 'showcase', emphasis }, (e: any) => {
  if (e.type === 'ready' || e.type === 'scene' || e.type === 'error' || e.type === 'done') console.log(`[${e.type}]`, e.type === 'scene' ? `v${e.version}` : e.type === 'error' ? e.message : '');
});
const moving = rec.scene.elements.filter((e: any) => e.anim?.length || e.type === 'particles' || ['x', 'y', 'rot', 'scale'].some((k) => typeof (e as any)[k] === 'string' && /\bt\b/.test((e as any)[k]))).map((e: any) => `${e.id}(${e.type})`);
console.log(`id ${rec.id} | ${rec.quick.title} | v${rec.sceneVersion} | ${rec.verification?.status} | elements ${rec.scene.elements.length} | moving ${moving.length}: ${moving.join(', ')}`);
process.exit(0);
