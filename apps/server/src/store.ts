// Storage behind one small interface: local disk for development, Cloud Storage + Firestore in production.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';
import { Firestore } from '@google-cloud/firestore';
import { config } from './config.js';
import { gcloudAuthClient } from './gemini.js';
import type { ExperienceRecord } from '@living-book/scene';

export interface Store {
  putFile(experienceId: string, name: string, bytes: Buffer, mime: string): Promise<string>; // returns URL path
  getFile(experienceId: string, name: string): Promise<{ bytes: Buffer; mime: string } | null>;
  putRecord(rec: ExperienceRecord): Promise<void>;
  getRecord(id: string): Promise<ExperienceRecord | null>;
  listRecords(ownerId: string, limit?: number): Promise<ExperienceRecord[]>;
  deleteOwner(ownerId: string): Promise<number>;
}

const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/wav': 'wav', 'application/octet-stream': 'bin', 'application/json': 'json' };
const fileName = (name: string, mime: string) => (name.includes('.') ? name : `${name}.${MIME_EXT[mime] ?? 'bin'}`);
const safeId = (id: string) => path.basename(id).replace(/[^A-Za-z0-9_-]/g, '');

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
    this.memo.set(url, Promise.resolve({ bytes, mime })); // serve what we just wrote without a round trip
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
}

export const store: Store = process.env.STORE === 'cloud'
  ? new CloudStore(process.env.GCS_BUCKET || 'cheerio-app-living-book', process.env.FIRESTORE_DB || 'living-book')
  : new LocalStore();
console.log(`[store] ${process.env.STORE === 'cloud' ? 'cloud (GCS + Firestore)' : 'local disk'}`);
