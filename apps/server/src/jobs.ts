// Background jobs (short videos, chapter films). A job is a Firestore document; it runs inside a request of its own,
// so the instance running it keeps its CPU on Cloud Run: in production Cloud Tasks makes that request (and retries it
// once if the instance goes away), locally the job simply runs in this process. The reader can leave the page; the
// dashboard reads the document back, from any instance, on any device.
import { GoogleAuth } from 'google-auth-library';
import { store, type JobDoc, type JobKind } from './store.js';
import { config } from './config.js';
import { runShort } from './reels.js';
import { runChapter } from './chapters.js';

const STALE_MS = 4 * 60_000;          // a running job with no heartbeat for this long is taken over
const LOST_MS = 3 * 60_000;           // a queued job nobody has started for this long is dispatched again
const PER_INSTANCE = Math.max(1, Number(process.env.JOBS_PER_INSTANCE || 1));
const QUEUE = process.env.JOBS_QUEUE || 'living-book-jobs';
const QUEUE_LOCATION = process.env.JOBS_LOCATION || 'asia-south1';
const useTasks = process.env.JOBS_MODE === 'tasks';
const selfUrl = () => (process.env.SELF_URL || `http://127.0.0.1:${config.port}`).replace(/\/$/, '');

export async function createJob(kind: JobKind, owner: string, bytes: Buffer, mime: string, options: JobDoc['options'], name?: string): Promise<JobDoc> {
  const id = crypto.randomUUID();
  const ext = mime === 'application/pdf' ? 'pdf' : mime.includes('png') ? 'png' : 'jpg';
  const url = await store.putFile(`job-${id}`, `input.${ext}`, bytes, mime);
  const doc: JobDoc = { id, kind, owner, createdAt: new Date().toISOString(), updatedAt: Date.now(), status: 'queued', stage: 'queued', detail: 'Waiting to start', attempts: 0, input: { url, mime, name }, options };
  await store.putJob(doc);
  await dispatch(id);
  return doc;
}

/** Start the job somewhere: a Cloud Task in production, this process locally. */
export async function dispatch(id: string) {
  if (!useTasks) { void runJob(id).catch((e) => console.error('[jobs] run failed', id, e?.message)); return; }
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const token = await auth.getAccessToken();
  const res = await fetch(`https://cloudtasks.googleapis.com/v2/projects/${config.project}/locations/${QUEUE_LOCATION}/queues/${QUEUE}/tasks`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ task: { dispatchDeadline: '1800s', httpRequest: { httpMethod: 'POST', url: `${selfUrl()}/api/jobs/${id}/run`, headers: { 'x-job-run': '1' } } } }),
  });
  if (!res.ok) { const t = await res.text(); console.error('[jobs] enqueue failed', id, res.status, t.slice(0, 200)); throw new Error('could not start the job'); }
}

// one heavy job at a time on an instance (Chromium, pipelines); others wait in their own requests, still queued
let active = 0; const waiting: (() => void)[] = [];
async function slot() { while (active >= PER_INSTANCE) await new Promise<void>((r) => waiting.push(r)); active++; }
function release() { active--; waiting.shift()?.(); }

/** Run a job to the end if nobody else is running it. Safe to call more than once: only one caller claims it. */
export async function runJob(id: string): Promise<'done' | 'taken' | 'missing'> {
  const before = await store.getJob(id);
  if (!before) return 'missing';
  await slot();
  try {
    const job = await store.claimJob(id, STALE_MS);
    if (!job) return 'taken';
    console.log(`[jobs] ${job.kind} ${id} started (attempt ${job.attempts})`);
    let pending: Partial<JobDoc> = {}, timer: NodeJS.Timeout | undefined, writing: Promise<void> = Promise.resolve();
    const flush = () => { const p = pending; pending = {}; timer = undefined; writing = writing.then(() => store.patchJob(id, { ...p, updatedAt: Date.now() })).catch((e) => console.warn('[jobs] patch failed', e?.message)); return writing; };
    const report = (patch: Partial<JobDoc>) => { pending = { ...pending, ...patch }; if (!timer) timer = setTimeout(flush, 1200); };
    const heartbeat = setInterval(() => { if (!timer) void store.patchJob(id, { updatedAt: Date.now() }).catch(() => {}); }, 20_000);
    try {
      const file = await fetchInput(job);
      const result = job.kind === 'short' ? await runShort(job, file, report) : await runChapter(job, file, report);
      if (timer) clearTimeout(timer); await flush();
      await store.patchJob(id, { ...result, status: 'ready', stage: 'ready', detail: 'Ready', error: undefined, updatedAt: Date.now() });
      console.log(`[jobs] ${job.kind} ${id} ready`);
    } catch (e: any) {
      if (timer) clearTimeout(timer); await flush();
      const msg = String(e?.message || e).split('\n')[0]!.slice(0, 200);
      console.error(`[jobs] ${job.kind} ${id} failed:`, msg, String(e?.stderr ?? '').slice(-400));
      await store.patchJob(id, { status: 'failed', stage: 'failed', detail: 'Something went wrong', error: msg, updatedAt: Date.now() });
    } finally { clearInterval(heartbeat); }
    return 'done';
  } finally { release(); }
}

async function fetchInput(job: JobDoc): Promise<Buffer> {
  const m = /\/api\/files\/([^/]+)\/([^/?]+)/.exec(job.input.url);
  if (!m) throw new Error('the uploaded file is missing');
  const f = await store.getFile(m[1]!, m[2]!);
  if (!f) throw new Error('the uploaded file is missing');
  return f.bytes;
}

/** A job that lost its runner (the instance went away) or was never started is dispatched again, at most twice. */
export async function heal(job: JobDoc): Promise<JobDoc> {
  const age = Date.now() - job.updatedAt;
  const lost = (job.status === 'running' && age > STALE_MS) || (job.status === 'queued' && age > LOST_MS);
  if (!lost) return job;
  if ((job.attempts ?? 0) >= 3) {
    const patch = { status: 'failed' as const, stage: 'failed', detail: 'It stopped part way', error: 'interrupted', updatedAt: Date.now() };
    await store.patchJob(job.id, patch); return { ...job, ...patch };
  }
  const patch = { status: 'queued' as const, stage: 'queued', detail: 'Starting again', updatedAt: Date.now() };
  await store.patchJob(job.id, patch);
  await dispatch(job.id).catch(() => {});
  return { ...job, ...patch };
}

export async function retryJob(job: JobDoc): Promise<JobDoc> {
  const patch = { status: 'queued' as const, stage: 'queued', detail: 'Starting again', error: undefined, attempts: 0, updatedAt: Date.now() };
  await store.patchJob(job.id, patch);
  await dispatch(job.id);
  return { ...job, ...patch };
}
