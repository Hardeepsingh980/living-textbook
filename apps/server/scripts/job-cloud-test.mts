// Production check of background jobs: a job document is created directly (owner: a test reader), its Cloud Task is
// enqueued with the gcloud token, and the document is watched while the live service runs it.
//   LB_USE_GCLOUD_TOKEN=1 STORE=cloud ... pnpm exec tsx scripts/job-cloud-test.mts <page.jpg|chapter.pdf> <short|chapter> [service url]
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { store, type JobDoc } from '../src/store.js';
const [file, kind = 'short', url = 'https://living-book-945707801757.asia-south1.run.app'] = process.argv.slice(2) as [string, 'short' | 'chapter', string];
const bytes = await fs.readFile(file);
const mime = file.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
const id = crypto.randomUUID();
const inputUrl = await store.putFile(`job-${id}`, `input.${mime === 'application/pdf' ? 'pdf' : 'jpg'}`, bytes, mime);
const doc: JobDoc = { id, kind, owner: 'test-cloud-reader', createdAt: new Date().toISOString(), updatedAt: Date.now(), status: 'queued', stage: 'queued', detail: 'Waiting to start', attempts: 0, input: { url: inputUrl, mime, name: file.split('/').pop() }, options: kind === 'short' ? { seconds: 20 } : { sections: 2 } };
await store.putJob(doc);
const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const r = await fetch('https://cloudtasks.googleapis.com/v2/projects/cheerio-app/locations/asia-south1/queues/living-book-jobs/tasks', {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-goog-user-project': 'cheerio-app' },
  body: JSON.stringify({ task: { dispatchDeadline: '1800s', httpRequest: { httpMethod: 'POST', url: `${url}/api/jobs/${id}/run`, headers: { 'x-job-run': '1' } } } }),
});
console.log('task:', r.status, (await r.text()).slice(0, 160).replace(/\s+/g, ' '));
const t0 = Date.now(); let last = '';
for (;;) {
  await new Promise((res) => setTimeout(res, 5000));
  const j = await store.getJob(id); if (!j) { console.log('job vanished'); break; }
  const line = `${j.status} | ${j.stage} | ${j.detail}`;
  if (line !== last) { console.log(`+${Math.round((Date.now() - t0) / 1000)}s ${line}`); last = line; }
  if (j.status === 'ready' || j.status === 'failed') { console.log('result:', j.url ?? j.error, j.seconds ?? ''); break; }
  if (Date.now() - t0 > 20 * 60_000) { console.log('timed out'); break; }
}
await store.deleteJob(id);
console.log('test job removed');
process.exit(0);
