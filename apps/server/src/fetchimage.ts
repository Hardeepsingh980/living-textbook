// Fetch a page image a partner points at (`image_url`), safely: https only, every address the name resolves to must
// be public (checked at connection time, so a DNS answer cannot change between the check and the connection),
// at most three redirects (each checked the same way), a size cap and a time limit.
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

const blocked = new net.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) blocked.addSubnet(a, p, 'ipv6');

/** True for an address on the public internet (not private, loopback, link-local, metadata, multicast or reserved). */
export function isPublicAddress(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return !blocked.check(ip, 'ipv4');
  if (v === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return isPublicAddress(mapped[1]!);
    return !blocked.check(ip, 'ipv6');
  }
  return false;
}

export class ImageFetchError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }

const safeLookup: typeof dns.lookup = ((hostname: string, options: any, cb: any) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses: dns.LookupAddress[]) => {
    if (err) return cb(err);
    const list = Array.isArray(addresses) ? addresses : [];
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (!list.length || bad) return cb(new ImageFetchError('image_url_blocked', 'image_url must point at a public internet address.'));
    if (options?.all) return cb(null, list);
    cb(null, list[0]!.address, list[0]!.family);
  });
}) as any;

function getOnce(url: URL, maxBytes: number, timeoutMs: number): Promise<{ status: number; location?: string; type: string; body?: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { lookup: safeLookup, timeout: timeoutMs, headers: { 'user-agent': 'LivingTextbook-ImageFetch/1.0', accept: 'image/*' } }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) { res.resume(); resolve({ status, location: res.headers.location, type: '' }); return; }
      if (status !== 200) { res.resume(); resolve({ status, type: '' }); return; }
      const declared = Number(res.headers['content-length'] || 0);
      if (declared > maxBytes) { res.destroy(); reject(new ImageFetchError('image_too_large', `The image is larger than ${Math.round(maxBytes / 1048576)} MB.`, 413)); return; }
      const chunks: Buffer[] = []; let total = 0;
      res.on('data', (c: Buffer) => { total += c.length; if (total > maxBytes) { res.destroy(); reject(new ImageFetchError('image_too_large', `The image is larger than ${Math.round(maxBytes / 1048576)} MB.`, 413)); return; } chunks.push(c); });
      res.on('end', () => resolve({ status, type: String(res.headers['content-type'] || ''), body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    const overall = setTimeout(() => req.destroy(new ImageFetchError('image_url_timeout', 'The image URL took too long to answer.')), timeoutMs);
    req.on('close', () => clearTimeout(overall));
    req.on('timeout', () => req.destroy(new ImageFetchError('image_url_timeout', 'The image URL took too long to answer.')));
    req.on('error', (e) => reject(e instanceof ImageFetchError ? e : new ImageFetchError('image_url_unreachable', `We cannot download the image from image_url (${String((e as any)?.code || e.message).slice(0, 60)}).`)));
  });
}

export async function fetchImage(raw: string, maxBytes = 15 * 1024 * 1024, timeoutMs = 12_000): Promise<{ bytes: Buffer; type: string }> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ImageFetchError('image_url_invalid', 'image_url is not a valid URL.'); }
  for (let hop = 0; hop <= 3; hop++) {
    if (url.protocol !== 'https:') throw new ImageFetchError('image_url_invalid', 'image_url must be an https URL.');
    if (url.username || url.password) throw new ImageFetchError('image_url_invalid', 'image_url must not contain credentials.');
    // an address written as a number never goes through the lookup, so it is checked here
    const literal = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(literal) && !isPublicAddress(literal)) throw new ImageFetchError('image_url_blocked', 'image_url must point at a public internet address.');
    const r = await getOnce(url, maxBytes, timeoutMs);
    if (r.location) { url = new URL(r.location, url); continue; }
    if (r.status !== 200 || !r.body) throw new ImageFetchError('image_url_unreachable', `The image URL answered ${r.status || 'nothing'}.`);
    return { bytes: r.body, type: r.type };
  }
  throw new ImageFetchError('image_url_unreachable', 'The image URL redirected too many times.');
}
