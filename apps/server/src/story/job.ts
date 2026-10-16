// A story as a background job: the reader sends photos of the pages and can leave; the job makes the story (several
// minutes) and the library shows it when it is ready. The story itself is readable while it is being made, so the
// player can show how far it got.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { store, type JobDoc } from '../store.js';
import { dispatch } from '../jobs.js';
import { makeStory } from './make.js';

export async function createStoryJob(owner: string, pages: Buffer[]): Promise<JobDoc> {
  const id = crypto.randomUUID();
  const urls: string[] = [];
  for (const [i, b] of pages.entries()) urls.push(await store.putFile(`job-${id}`, `page-${i}.jpg`, b, 'image/jpeg'));
  const doc: JobDoc = { id, kind: 'story', owner, createdAt: new Date().toISOString(), updatedAt: Date.now(), status: 'queued', stage: 'queued', detail: 'Waiting to start', attempts: 0, input: { url: urls[0]!, mime: 'image/jpeg' }, options: { pages: urls } };
  await store.putJob(doc);
  await dispatch(id);
  return doc;
}

async function fileAt(url: string): Promise<Buffer> {
  const m = /\/api\/files\/([^/]+)\/([^/?]+)/.exec(url);
  const f = m ? await store.getFile(m[1]!, m[2]!) : null;
  if (!f) throw new Error('a page photo is missing');
  return f.bytes;
}

export async function runStoryJob(job: JobDoc, report: (patch: Partial<JobDoc>) => void): Promise<Partial<JobDoc>> {
  const pages = await Promise.all((job.options.pages?.length ? job.options.pages : [job.input.url]).map(fileAt));
  const storyId = job.storyId ?? crypto.randomUUID();
  report({ storyId, stage: 'reading', detail: 'Reading the story' });
  const work = path.join(os.tmpdir(), 'stories', storyId);
  // Cloud Run's disk is memory: everything the story needs is in the store, so the work folder goes when the job ends
  const doc = await makeStory({
    pages, owner: job.owner, id: storyId, work,
    rounds: Number(process.env.STORY_ROUNDS || 2),
    report: (stage, detail) => report({ stage, detail }),
  }).finally(() => fs.rmSync(work, { recursive: true, force: true }));
  return { storyId, title: doc.title, url: doc.film?.url, poster: doc.film?.poster, seconds: Math.round((doc.film?.ms ?? 0) / 1000) };
}
