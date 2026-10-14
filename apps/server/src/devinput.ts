// Checking what a partner sends with a page: the image's real type, their user id and their metadata.

export const MAX_IMAGE = 15 * 1024 * 1024;
export class InputError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

/** The image's real type from its first bytes (the declared content type is not trusted). */
export function sniffImage(b: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** The partner's own references: an opaque id for their user, and up to 20 short string fields. */
export function cleanExternalId(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v);
  if (s.length > 128) throw new InputError(400, 'external_user_id_invalid', 'external_user_id must be at most 128 characters.');
  return s;
}
export function cleanMetadata(v: unknown): Record<string, string> | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  let o: unknown = v;
  if (typeof v === 'string') { try { o = JSON.parse(v); } catch { throw new InputError(400, 'metadata_invalid', 'metadata must be a JSON object of strings.'); } }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new InputError(400, 'metadata_invalid', 'metadata must be a JSON object of strings.');
  const entries = Object.entries(o as Record<string, unknown>);
  if (entries.length > 20) throw new InputError(400, 'metadata_invalid', 'metadata may have at most 20 keys.');
  const out: Record<string, string> = {};
  for (const [k, val] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,40}$/.test(k)) throw new InputError(400, 'metadata_invalid', `metadata key "${k.slice(0, 40)}" must be 1-40 letters, digits, "_", "." or "-".`);
    if (val !== null && typeof val === 'object') throw new InputError(400, 'metadata_invalid', `metadata.${k} must be a string, number or boolean.`);
    const s = val === null ? '' : String(val);
    if (s.length > 500) throw new InputError(400, 'metadata_invalid', `metadata.${k} must be at most 500 characters.`);
    out[k] = s;
  }
  return out;
}

