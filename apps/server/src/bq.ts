// Every learning event also goes to BigQuery (dataset living_textbook, table events), where the insights are
// computed. Rows are batched for a second or two; if BigQuery is unreachable the app carries on without it.
import { BigQuery } from '@google-cloud/bigquery';
import { config } from './config.js';
import { gcloudAuthClient } from './gemini.js';

export const DATASET = process.env.BQ_DATASET || 'living_textbook';
export const TABLE = 'events';
export const LOCATION = process.env.BQ_LOCATION || 'asia-south1';
export type EventRow = {
  ts: string; uid: string | null; owner: string; experience_id: string | null; title?: string | null; subject?: string | null; kind?: string | null;
  event: string; detail?: string | null; value?: number | null; duration_ms?: number | null; step?: number | null; total_steps?: number | null; device?: string | null;
};
const SCHEMA = [
  { name: 'ts', type: 'TIMESTAMP', mode: 'REQUIRED' }, { name: 'uid', type: 'STRING' }, { name: 'owner', type: 'STRING' }, { name: 'experience_id', type: 'STRING' },
  { name: 'title', type: 'STRING' }, { name: 'subject', type: 'STRING' }, { name: 'kind', type: 'STRING' }, { name: 'event', type: 'STRING', mode: 'REQUIRED' },
  { name: 'detail', type: 'STRING' }, { name: 'value', type: 'FLOAT' }, { name: 'duration_ms', type: 'INTEGER' }, { name: 'step', type: 'INTEGER' }, { name: 'total_steps', type: 'INTEGER' }, { name: 'device', type: 'STRING' },
];

let bq: BigQuery | null = null;
const ready: Promise<boolean> = (async () => {
  if (process.env.BQ_DISABLED === '1') return false;
  try {
    const auth = config.useGcloudToken ? await gcloudAuthClient() : undefined;
    bq = new BigQuery({ projectId: config.project, ...(auth ? { authClient: auth as any } : {}) });
    const ds = bq.dataset(DATASET);
    const [exists] = await ds.exists();
    if (!exists) await ds.create({ location: LOCATION });
    const t = ds.table(TABLE);
    const [te] = await t.exists();
    if (!te) await t.create({ schema: SCHEMA, timePartitioning: { type: 'DAY', field: 'ts' } });
    console.log(`[bq] ${config.project}.${DATASET}.${TABLE} ready`);
    return true;
  } catch (e: any) { console.warn('[bq] disabled:', String(e?.message || e).slice(0, 160)); return false; }
})();
export const bqReady = () => ready;

const queue: EventRow[] = [];
let timer: NodeJS.Timeout | undefined;
export function track(row: EventRow) {
  queue.push(row);
  if (!timer) timer = setTimeout(() => { timer = undefined; void flush(); }, 1500);
}
async function flush() {
  const rows = queue.splice(0);
  if (!rows.length || !(await ready)) return;
  try { await bq!.dataset(DATASET).table(TABLE).insert(rows, { skipInvalidRows: true, ignoreUnknownValues: true }); }
  catch (e: any) { console.warn('[bq] insert failed:', String(e?.errors?.[0]?.errors?.[0]?.message || e?.message || e).slice(0, 160)); }
}

export async function query<T = any>(sql: string, params: Record<string, unknown> = {}): Promise<T[]> {
  if (!(await ready)) return [];
  const [rows] = await bq!.query({ query: sql, params, location: LOCATION });
  return rows as T[];
}
