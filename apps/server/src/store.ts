// Storage behind one small interface: local disk for development, Cloud Storage + Firestore in production (day 5).
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import type { ExperienceRecord } from '@living-book/scene';

export interface Store {
  putFile(experienceId: string, name: string, bytes: Buffer, mime: string): Promise<string>; // returns public URL path
  getFile(experienceId: string, name: string): Promise<{ bytes: Buffer; mime: string } | null>;
  putRecord(rec: ExperienceRecord): Promise<void>;
  getRecord(id: string): Promise<ExperienceRecord | null>;
  listRecords(ownerId: string, limit?: number): Promise<ExperienceRecord[]>;
  deleteOwner(ownerId: string): Promise<number>;
}

const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/wav': 'wav', 'application/octet-stream': 'bin', 'application/json': 'json' };

export class LocalStore implements Store {
  constructor(private root = path.resolve(config.dataDir)) {}
  private dir(id: string) { return path.join(this.root, 'experiences', id); }
  async putFile(id: string, name: string, bytes: Buffer, mime: string) {
    await fs.mkdir(this.dir(id), { recursive: true });
    const file = name.includes('.') ? name : `${name}.${MIME_EXT[mime] ?? 'bin'}`;
    await fs.writeFile(path.join(this.dir(id), file), bytes);
    await fs.writeFile(path.join(this.dir(id), `${file}.mime`), mime);
    return `${config.publicBase}/api/files/${id}/${file}`;
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
    try { return JSON.parse(await fs.readFile(path.join(this.dir(path.basename(id)), 'record.json'), 'utf8')) as ExperienceRecord; } catch { return null; }
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

export const store: Store = new LocalStore();
