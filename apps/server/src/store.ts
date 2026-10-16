// Storage behind one small interface: local disk for development, Cloud Storage + Firestore in production.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';
import { Firestore } from '@google-cloud/firestore';
import { config } from './config.js';
import { gcloudAuthClient } from './gemini.js';
import type { ExperienceRecord } from '@living-book/scene';
import type { StoryDoc } from './story/types.js';

export type UserDoc = { uid: string; name?: string; email?: string; picture?: string; createdAt: string; lastSeenAt: string };
export type LessonDoc = {
  experienceId: string; title: string; subject: string; kind: string; language: string; pageImageUrl: string;
  openedAt: string; lastAt: string; opens: number; steps: number; totalSteps: number; completed: boolean; seconds: number; questions: number;
  quiz?: { score: number; total: number; at: string; best: number; attempts: number };
};

/** A long generation (short video, chapter film) that runs in the background and outlives the page that asked for it. */
export type JobKind = 'short' | 'chapter' | 'story';
export type JobStatus = 'queued' | 'running' | 'ready' | 'failed';
export type JobSection = { page: number; concept: string; score: number; status: 'waiting' | 'making' | 'recording' | 'done' | 'skipped'; experienceId?: string; thumb?: string; title?: string };
export type JobDoc = {
  id: string; kind: JobKind; owner: string; createdAt: string; updatedAt: number;
  status: JobStatus; stage: string; detail: string; attempts: number;
  input: { url: string; mime: string; name?: string };
  options: { seconds?: number; sections?: number; pages?: string[] };
  title?: string; subject?: string; grade?: string; pages?: number; sections?: JobSection[]; questions?: string[];
  experienceId?: string; storyId?: string; url?: string; poster?: string; seconds?: number; error?: string;
};

/** A developer's API key. Only the SHA-256 hash of the key is kept (it is also the document id); the key itself is
 *  shown once, when it is made. Secret keys call the REST API from a server; publishable keys open the scanner
 *  embed on the sites listed in `origins`. */
export type DevKeyKind = 'secret' | 'publishable';
export type DevKeyDoc = {
  hash: string; id: string; owner: string; name: string; kind: DevKeyKind;
  prefix: string; last4: string; origins: string[];
  createdAt: string; lastUsedAt?: string; revokedAt?: string; uses: number;
  /** a publishable key in full: it is public by design (it sits in partners' web pages), so the dashboard may show it */
  plain?: string;
};
/** Lessons made with a developer's keys on one day (IST), in total and per key. */
export type DevUsageDoc = { owner: string; day: string; total: number; byKey: Record<string, number> };

export interface Store {
  putFile(experienceId: string, name: string, bytes: Buffer, mime: string): Promise<string>; // returns URL path
  getFile(experienceId: string, name: string): Promise<{ bytes: Buffer; mime: string } | null>;
  putRecord(rec: ExperienceRecord): Promise<void>;
  patchRecord(id: string, patch: Partial<ExperienceRecord>): Promise<void>;
  getRecord(id: string): Promise<ExperienceRecord | null>;
  listRecords(ownerId: string, limit?: number): Promise<ExperienceRecord[]>;
  deleteOwner(ownerId: string): Promise<number>;
  // a signed-in reader's progress
  getUser(uid: string): Promise<UserDoc | null>;
  putUser(uid: string, doc: Partial<UserDoc>): Promise<void>;
  getLesson(uid: string, experienceId: string): Promise<LessonDoc | null>;
  putLesson(uid: string, experienceId: string, doc: Partial<LessonDoc>): Promise<void>;
  listLessons(uid: string, limit?: number): Promise<LessonDoc[]>;
  deleteRecord(id: string): Promise<void>;
  // background jobs
  putJob(doc: JobDoc): Promise<void>;
  patchJob(id: string, patch: Partial<JobDoc>): Promise<void>;
  getJob(id: string): Promise<JobDoc | null>;
  listJobs(owner: string, limit?: number): Promise<JobDoc[]>;
  /** queued, or running with no heartbeat for `staleMs` → running, atomically; null when another runner has it */
  claimJob(id: string, staleMs: number): Promise<JobDoc | null>;
  deleteJob(id: string): Promise<void>;
  /** count one use against `key` (which carries the day); false once `limit` is reached */
  bumpQuota(key: string, limit: number): Promise<{ allowed: boolean; used: number }>;
  peekQuota(key: string): Promise<number>;
  // developer platform: API keys and their daily usage
  putDevKey(doc: DevKeyDoc): Promise<void>;
  getDevKey(hash: string): Promise<DevKeyDoc | null>;
  patchDevKey(hash: string, patch: Partial<DevKeyDoc>): Promise<void>;
  listDevKeys(owner: string): Promise<DevKeyDoc[]>;
  /** count one lesson for `owner` on `day` (and for the key); false once `limit` is reached */
  bumpDevUsage(owner: string, day: string, keyId: string, limit: number): Promise<{ allowed: boolean; used: number }>;
  getDevUsage(owner: string, days: string[]): Promise<DevUsageDoc[]>;
  // stories made alive (see story/types.ts)
  putStory(doc: StoryDoc): Promise<void>;
  patchStory(id: string, patch: Partial<StoryDoc>): Promise<void>;
  getStory(id: string): Promise<StoryDoc | null>;
  listStories(owner: string, limit?: number): Promise<StoryDoc[]>;
}

const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4', 'application/octet-stream': 'bin', 'application/json': 'json' };
const fileName = (name: string, mime: string) => (name.includes('.') ? name : `${name}.${MIME_EXT[mime] ?? 'bin'}`);
const safeId = (id: string) => path.basename(id).replace(/[^A-Za-z0-9_-]/g, '');
/** files larger than this are not kept in memory after they are served (a story has dozens of 4 MB clips) */
const MEMO_MAX = 3 * 1024 * 1024;

export class LocalStore implements Store {
  constructor(private root = path.resolve(config.dataDir)) {}
  private dir(id: string) { return path.join(this.root, 'experiences', safeId(id)); }
  async putFile(id: string, name: string, bytes: Buffer, mime: string) {
    await fs.mkdir(this.dir(id), { recursive: true });
    const file = fileName(name, mime);
    await fs.writeFile(path.join(this.dir(id), file), bytes);
    await fs.writeFile(path.join(this.dir(id), `${file}.mime`), mime);
    return `${config.publicBase}/api/files/${safeId(id)}/${file}`;
  }
  async getFile(id: string, name: string) {
    try {
      const safe = path.basename(name);
      const bytes = await fs.readFile(path.join(this.dir(id), safe));
      const mime = await fs.readFile(path.join(this.dir(id), `${safe}.mime`), 'utf8').catch(() => 'application/octet-stream');
      return { bytes, mime };
    } catch { return null; }
  }
  async putRecord(rec: ExperienceRecord) {
    await fs.mkdir(this.dir(rec.id), { recursive: true });
    await fs.writeFile(path.join(this.dir(rec.id), 'record.json'), JSON.stringify(rec));
  }
  async getRecord(id: string) {
    try { return JSON.parse(await fs.readFile(path.join(this.dir(id), 'record.json'), 'utf8')) as ExperienceRecord; } catch { return null; }
  }

  async patchRecord(id: string, patch: Partial<ExperienceRecord>) {
    const rec = await this.getRecord(id); if (!rec) return;
    await fs.writeFile(path.join(this.dir(id), 'record.json'), JSON.stringify({ ...rec, ...patch }));
  }
  private userDir(uid: string) { return path.join(this.root, 'users', safeId(uid)); }
  async getUser(uid: string) { try { return JSON.parse(await fs.readFile(path.join(this.userDir(uid), 'user.json'), 'utf8')); } catch { return null; } }
  async putUser(uid: string, doc: Partial<UserDoc>) { await fs.mkdir(this.userDir(uid), { recursive: true }); const cur = (await this.getUser(uid)) ?? {}; await fs.writeFile(path.join(this.userDir(uid), 'user.json'), JSON.stringify({ ...cur, ...doc, uid })); }
  async getLesson(uid: string, experienceId: string) { try { return JSON.parse(await fs.readFile(path.join(this.userDir(uid), 'lessons', `${safeId(experienceId)}.json`), 'utf8')); } catch { return null; } }
  async putLesson(uid: string, experienceId: string, doc: Partial<LessonDoc>) { await fs.mkdir(path.join(this.userDir(uid), 'lessons'), { recursive: true }); const cur = (await this.getLesson(uid, experienceId)) ?? {}; await fs.writeFile(path.join(this.userDir(uid), 'lessons', `${safeId(experienceId)}.json`), JSON.stringify({ ...cur, ...doc, experienceId })); }
  async listLessons(uid: string, limit = 100) {
    const dir = path.join(this.userDir(uid), 'lessons');
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    const docs: LessonDoc[] = [];
    for (const f of files) { try { docs.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'))); } catch { /* skip */ } }
    return docs.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || '')).slice(0, limit);
  }  async deleteRecord(id: string) { await fs.rm(this.dir(id), { recursive: true, force: true }); }
  private jobFile(id: string) { return path.join(this.root, 'jobs', `${safeId(id)}.json`); }
  async putJob(doc: JobDoc) { await fs.mkdir(path.join(this.root, 'jobs'), { recursive: true }); await fs.writeFile(this.jobFile(doc.id), JSON.stringify(doc)); }
  async patchJob(id: string, patch: Partial<JobDoc>) { const cur = await this.getJob(id); if (cur) await this.putJob({ ...cur, ...patch }); }
  async getJob(id: string) { try { return JSON.parse(await fs.readFile(this.jobFile(id), 'utf8')) as JobDoc; } catch { return null; } }
  async listJobs(owner: string, limit = 100) {
    const files = await fs.readdir(path.join(this.root, 'jobs')).catch(() => [] as string[]);
    const docs: JobDoc[] = [];
    for (const f of files) { try { const d = JSON.parse(await fs.readFile(path.join(this.root, 'jobs', f), 'utf8')) as JobDoc; if (d.owner === owner) docs.push(d); } catch { /* skip */ } }
    return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
  private claiming = Promise.resolve<unknown>(null);
  async claimJob(id: string, staleMs: number) {
    const next = this.claiming.then(async () => {
      const d = await this.getJob(id); if (!d) return null;
      const free = d.status === 'queued' || (d.status === 'running' && Date.now() - d.updatedAt > staleMs);
      if (!free) return null;
      const claimed = { ...d, status: 'running' as const, updatedAt: Date.now(), attempts: (d.attempts ?? 0) + 1 };
      await this.putJob(claimed); return claimed;
    });
    this.claiming = next.catch(() => null);
    return next;
  }
  async deleteJob(id: string) { await fs.rm(this.jobFile(id), { force: true }); }
  private quota = new Map<string, number>();
  async bumpQuota(key: string, limit: number) { const used = this.quota.get(key) ?? 0; if (used >= limit) return { allowed: false, used }; this.quota.set(key, used + 1); return { allowed: true, used: used + 1 }; }
  async peekQuota(key: string) { return this.quota.get(key) ?? 0; }
  async listRecords(ownerId: string, limit = 50) {
    const base = path.join(this.root, 'experiences');
    let ids: string[] = [];
    try { ids = await fs.readdir(base); } catch { return []; }
    const recs: ExperienceRecord[] = [];
    for (const id of ids) { const r = await this.getRecord(id); if (r && r.ownerId === ownerId) recs.push(r); }
    return recs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
  async deleteOwner(ownerId: string) {
    const recs = await this.listRecords(ownerId, 10000);
    for (const r of recs) await fs.rm(this.dir(r.id), { recursive: true, force: true });
    return recs.length;
  }
  private devKeyFile(hash: string) { return path.join(this.root, 'devkeys', `${safeId(hash)}.json`); }
  async putDevKey(doc: DevKeyDoc) { await fs.mkdir(path.join(this.root, 'devkeys'), { recursive: true }); await fs.writeFile(this.devKeyFile(doc.hash), JSON.stringify(doc)); }
  async getDevKey(hash: string) { try { return JSON.parse(await fs.readFile(this.devKeyFile(hash), 'utf8')) as DevKeyDoc; } catch { return null; } }
  async patchDevKey(hash: string, patch: Partial<DevKeyDoc>) { const cur = await this.getDevKey(hash); if (cur) await this.putDevKey({ ...cur, ...patch }); }
  async listDevKeys(owner: string) {
    const dir = path.join(this.root, 'devkeys');
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    const docs: DevKeyDoc[] = [];
    for (const f of files) { try { const d = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')) as DevKeyDoc; if (d.owner === owner) docs.push(d); } catch { /* skip */ } }
    return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  private usageFile(owner: string, day: string) { return path.join(this.root, 'devusage', `${safeId(owner)}_${day}.json`); }
  private usageChain = Promise.resolve<unknown>(null);
  async bumpDevUsage(owner: string, day: string, keyId: string, limit: number) {
    const next = this.usageChain.then(async () => {
      const cur = (await this.getDevUsage(owner, [day]))[0] ?? { owner, day, total: 0, byKey: {} };
      if (cur.total >= limit) return { allowed: false, used: cur.total };
      const doc: DevUsageDoc = { ...cur, total: cur.total + 1, byKey: { ...cur.byKey, [keyId]: (cur.byKey[keyId] ?? 0) + 1 } };
      await fs.mkdir(path.join(this.root, 'devusage'), { recursive: true });
      await fs.writeFile(this.usageFile(owner, day), JSON.stringify(doc));
      return { allowed: true, used: doc.total };
    });
    this.usageChain = next.catch(() => null);
    return next;
  }
  async getDevUsage(owner: string, days: string[]) {
    const out: DevUsageDoc[] = [];
    for (const day of days) { try { out.push(JSON.parse(await fs.readFile(this.usageFile(owner, day), 'utf8'))); } catch { /* no lessons that day */ } }
    return out;
  }
  private storyFile(id: string) { return path.join(this.root, 'stories', `${safeId(id)}.json`); }
  async putStory(doc: StoryDoc) { await fs.mkdir(path.join(this.root, 'stories'), { recursive: true }); await fs.writeFile(this.storyFile(doc.id), JSON.stringify(doc)); }
  async patchStory(id: string, patch: Partial<StoryDoc>) { const cur = await this.getStory(id); if (cur) await this.putStory({ ...cur, ...patch }); }
  async getStory(id: string) { try { return JSON.parse(await fs.readFile(this.storyFile(id), 'utf8')) as StoryDoc; } catch { return null; } }
  async listStories(owner: string, limit = 100) {
    const files = await fs.readdir(path.join(this.root, 'stories')).catch(() => [] as string[]);
    const docs: StoryDoc[] = [];
    for (const f of files) { try { const d = JSON.parse(await fs.readFile(path.join(this.root, 'stories', f), 'utf8')) as StoryDoc; if (d.owner === owner) docs.push(d); } catch { /* skip */ } }
    return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
}

/** Cloud Storage for files (served through the API with long cache headers) and Firestore for records. */
export class CloudStore implements Store {
  private bucket;
  private db;
  private memo = new Map<string, Promise<{ bytes: Buffer; mime: string } | null>>();
  private ready: Promise<void>;
  constructor(bucketName: string, databaseId: string) {
    // In local development the gcloud CLI token is used (see gemini.ts); on Cloud Run the service account is picked up automatically.
    const auth = config.useGcloudToken ? gcloudAuthClient() : Promise.resolve(undefined);
    this.bucket = new Storage({ projectId: config.project }).bucket(bucketName);
    this.db = new Firestore({ projectId: config.project, databaseId, ignoreUndefinedProperties: true });
    this.ready = auth.then((client) => {
      if (!client) return;
      this.bucket = new Storage({ projectId: config.project, authClient: client as any }).bucket(bucketName);
      this.db = new Firestore({ projectId: config.project, databaseId, authClient: client as any, ignoreUndefinedProperties: true });
    });
  }
  private objectPath(id: string, file: string) { return `experiences/${safeId(id)}/${file}`; }
  async putFile(id: string, name: string, bytes: Buffer, mime: string) {
    await this.ready;
    const file = fileName(name, mime);
    await this.bucket.file(this.objectPath(id, file)).save(bytes, { contentType: mime, resumable: false, metadata: { cacheControl: 'public, max-age=31536000, immutable' } });
    const url = `${config.publicBase}/api/files/${safeId(id)}/${file}`;
    if (bytes.length <= MEMO_MAX) this.memo.set(url, Promise.resolve({ bytes, mime })); // serve what we just wrote without a round trip
    return url;
  }
  async getFile(id: string, name: string) {
    const key = `${config.publicBase}/api/files/${safeId(id)}/${path.basename(name)}`;
    let p = this.memo.get(key);
    if (!p) {
      p = (async () => {
        try {
          await this.ready;
          const f = this.bucket.file(this.objectPath(id, path.basename(name)));
          const [bytes] = await f.download();
          const [meta] = await f.getMetadata();
          if (bytes.length > MEMO_MAX) setTimeout(() => this.memo.delete(key), 30_000); // big media (story clips) is not kept
          return { bytes, mime: meta.contentType ?? 'application/octet-stream' };
        } catch { return null; }
      })();
      this.memo.set(key, p);
      if (this.memo.size > 400) this.memo.delete(this.memo.keys().next().value!);
    }
    return p;
  }
  async putRecord(rec: ExperienceRecord) {
    await this.ready;
    const { events, ...doc } = rec;
    await this.db.collection('experiences').doc(rec.id).set({ ...doc, eventsCount: events.length });
    await this.bucket.file(this.objectPath(rec.id, 'events.json')).save(JSON.stringify(events), { contentType: 'application/json', resumable: false });
  }
  async getRecord(id: string) {
    await this.ready;
    const snap = await this.db.collection('experiences').doc(safeId(id)).get();
    if (!snap.exists) return null;
    return { events: [], ...(snap.data() as Omit<ExperienceRecord, 'events'>) } as ExperienceRecord;
  }
  async patchRecord(id: string, patch: Partial<ExperienceRecord>) {
    await this.ready;
    const { events, ...doc } = patch as any;
    await this.db.collection('experiences').doc(safeId(id)).set(doc, { merge: true });
  }
  async getUser(uid: string) { await this.ready; const s = await this.db.collection('users').doc(safeId(uid)).get(); return s.exists ? (s.data() as UserDoc) : null; }
  async putUser(uid: string, doc: Partial<UserDoc>) { await this.ready; await this.db.collection('users').doc(safeId(uid)).set({ ...doc, uid }, { merge: true }); }
  async getLesson(uid: string, experienceId: string) { await this.ready; const s = await this.db.collection('users').doc(safeId(uid)).collection('lessons').doc(safeId(experienceId)).get(); return s.exists ? (s.data() as LessonDoc) : null; }
  async putLesson(uid: string, experienceId: string, doc: Partial<LessonDoc>) { await this.ready; await this.db.collection('users').doc(safeId(uid)).collection('lessons').doc(safeId(experienceId)).set({ ...doc, experienceId }, { merge: true }); }
  async listLessons(uid: string, limit = 100) {
    await this.ready;
    const q = await this.db.collection('users').doc(safeId(uid)).collection('lessons').limit(500).get();
    return q.docs.map((d) => d.data() as LessonDoc).sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || '')).slice(0, limit);
  }
  async deleteRecord(id: string) {
    await this.ready;
    await this.db.collection('experiences').doc(safeId(id)).delete();
    await this.bucket.deleteFiles({ prefix: `experiences/${safeId(id)}/` }).catch(() => {});
  }
  async putJob(doc: JobDoc) { await this.ready; await this.db.collection('jobs').doc(safeId(doc.id)).set(doc); }
  async patchJob(id: string, patch: Partial<JobDoc>) { await this.ready; await this.db.collection('jobs').doc(safeId(id)).set(patch, { merge: true }); }
  async getJob(id: string) { await this.ready; const s = await this.db.collection('jobs').doc(safeId(id)).get(); return s.exists ? (s.data() as JobDoc) : null; }
  async listJobs(owner: string, limit = 100) {
    await this.ready;
    const q = await this.db.collection('jobs').where('owner', '==', owner).limit(300).get();
    return q.docs.map((d) => d.data() as JobDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
  async claimJob(id: string, staleMs: number) {
    await this.ready;
    const ref = this.db.collection('jobs').doc(safeId(id));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref); if (!snap.exists) return null;
      const d = snap.data() as JobDoc;
      const free = d.status === 'queued' || (d.status === 'running' && Date.now() - d.updatedAt > staleMs);
      if (!free) return null;
      const claimed: JobDoc = { ...d, status: 'running', updatedAt: Date.now(), attempts: (d.attempts ?? 0) + 1 };
      tx.set(ref, { status: claimed.status, updatedAt: claimed.updatedAt, attempts: claimed.attempts }, { merge: true });
      return claimed;
    });
  }
  async deleteJob(id: string) {
    await this.ready;
    await this.db.collection('jobs').doc(safeId(id)).delete();
    await this.bucket.deleteFiles({ prefix: `experiences/job-${safeId(id)}/` }).catch(() => {});
  }
  async bumpQuota(key: string, limit: number) {
    await this.ready;
    const ref = this.db.collection('quota').doc(safeId(key));
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref); const used = snap.exists ? Number(snap.data()!.count ?? 0) : 0;
      if (used >= limit) return { allowed: false, used };
      tx.set(ref, { count: used + 1, at: Date.now() }, { merge: true });
      return { allowed: true, used: used + 1 };
    });
  }
  async peekQuota(key: string) { await this.ready; const s = await this.db.collection('quota').doc(safeId(key)).get(); return s.exists ? Number(s.data()!.count ?? 0) : 0; }
  async listRecords(ownerId: string, limit = 50) {
    await this.ready;
    // single-field filter only (no composite index needed); sorted in memory
    const q = await this.db.collection('experiences').where('ownerId', '==', ownerId).limit(300).get();
    return q.docs.map((d) => ({ events: [], ...(d.data() as Omit<ExperienceRecord, 'events'>) }) as ExperienceRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
  async deleteOwner(ownerId: string) {
    await this.ready;
    const recs = await this.listRecords(ownerId, 1000);
    for (const r of recs) {
      await this.db.collection('experiences').doc(r.id).delete();
      await this.bucket.deleteFiles({ prefix: `experiences/${safeId(r.id)}/` }).catch(() => {});
    }
    return recs.length;
  }
  async putDevKey(doc: DevKeyDoc) { await this.ready; await this.db.collection('devkeys').doc(safeId(doc.hash)).set(doc); }
  async getDevKey(hash: string) { await this.ready; const s = await this.db.collection('devkeys').doc(safeId(hash)).get(); return s.exists ? (s.data() as DevKeyDoc) : null; }
  async patchDevKey(hash: string, patch: Partial<DevKeyDoc>) { await this.ready; await this.db.collection('devkeys').doc(safeId(hash)).set(patch, { merge: true }); }
  async listDevKeys(owner: string) {
    await this.ready;
    const q = await this.db.collection('devkeys').where('owner', '==', owner).limit(100).get();
    return q.docs.map((d) => d.data() as DevKeyDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async bumpDevUsage(owner: string, day: string, keyId: string, limit: number) {
    await this.ready;
    const ref = this.db.collection('devusage').doc(`${safeId(owner)}_${day}`);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? (snap.data() as DevUsageDoc) : { owner, day, total: 0, byKey: {} };
      if (cur.total >= limit) return { allowed: false, used: cur.total };
      tx.set(ref, { owner, day, total: cur.total + 1, byKey: { ...cur.byKey, [keyId]: (cur.byKey?.[keyId] ?? 0) + 1 } });
      return { allowed: true, used: cur.total + 1 };
    });
  }
  async getDevUsage(owner: string, days: string[]) {
    await this.ready;
    if (!days.length) return [];
    const snaps = await this.db.getAll(...days.map((d) => this.db.collection('devusage').doc(`${safeId(owner)}_${d}`)));
    return snaps.filter((s) => s.exists).map((s) => s.data() as DevUsageDoc);
  }
  async putStory(doc: StoryDoc) { await this.ready; await this.db.collection('stories').doc(safeId(doc.id)).set(doc); }
  async patchStory(id: string, patch: Partial<StoryDoc>) { await this.ready; await this.db.collection('stories').doc(safeId(id)).set(patch, { merge: true }); }
  async getStory(id: string) { await this.ready; const s = await this.db.collection('stories').doc(safeId(id)).get(); return s.exists ? (s.data() as StoryDoc) : null; }
  async listStories(owner: string, limit = 100) {
    await this.ready;
    const q = await this.db.collection('stories').where('owner', '==', owner).limit(200).get();
    return q.docs.map((d) => d.data() as StoryDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
}

export const store: Store = process.env.STORE === 'cloud'
  ? new CloudStore(process.env.GCS_BUCKET || 'cheerio-app-living-book', process.env.FIRESTORE_DB || 'living-book')
  : new LocalStore();
console.log(`[store] ${process.env.STORE === 'cloud' ? 'cloud (GCS + Firestore)' : 'local disk'}`);
