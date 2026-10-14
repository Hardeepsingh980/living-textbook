import { describe, it, expect, vi } from 'vitest';

// keys are stored through the store; these tests only exercise the pure parts, so the store is a stub
vi.mock('./store.js', () => ({ store: { getDevKey: async () => null, putDevKey: async () => {}, patchDevKey: async () => {} } }));
const { randomBase62, hashKey, looksLikeKey, normalizeOrigin, originAllowed, rateLimit, lessonObject, apiOwner, lastDays } = await import('./devkeys.js');
const { sniffImage, cleanMetadata, cleanExternalId } = await import('./devinput.js');
const { isPublicAddress } = await import('./fetchimage.js');

describe('keys', () => {
  it('are long, base62 and different every time', () => {
    const a = randomBase62(40), b = randomBase62(40);
    expect(a).toMatch(/^[0-9A-Za-z]{40}$/);
    expect(a).not.toBe(b);
    expect(looksLikeKey(`ltsk_${a}`)).toBe(true);
    expect(looksLikeKey(`ltpk_${randomBase62(32)}`)).toBe(true);
    expect(looksLikeKey('sk_live_abc')).toBe(false);
    expect(looksLikeKey(`ltsk_${a}'; drop`)).toBe(false);
  });
  it('are stored as a hash', () => {
    expect(hashKey('ltsk_x')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashKey('ltsk_x')).toBe(hashKey('ltsk_x'));
    expect(hashKey('ltsk_x')).not.toBe(hashKey('ltsk_y'));
  });
  it('put API lessons apart from the developer\'s own library', () => {
    expect(apiOwner('abc')).toBe('api-abc');
    expect(apiOwner('a/b..c')).toBe('api-abc');
  });
});

describe('allowed sites', () => {
  it('normalises site addresses', () => {
    expect(normalizeOrigin('https://School.example/')).toBe('https://school.example');
    expect(normalizeOrigin('https://*.school.example')).toBe('https://*.school.example');
    expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeOrigin('https://app.school.example:8443')).toBe('https://app.school.example:8443');
  });
  it('refuses what is not a site', () => {
    expect(normalizeOrigin('http://school.example')).toBeNull(); // plain http only for localhost
    expect(normalizeOrigin('https://school.example/path')).toBeNull();
    expect(normalizeOrigin('school.example')).toBeNull();
    expect(normalizeOrigin('https://*')).toBeNull();
    expect(normalizeOrigin('https://*.com')).toBeNull();
    expect(normalizeOrigin('javascript:alert(1)')).toBeNull();
    expect(normalizeOrigin('https://intranet')).toBeNull();
  });
  it('matches exact sites and subdomain wildcards', () => {
    const allowed = ['https://school.example', 'https://*.learn.example', 'http://localhost:3000'];
    expect(originAllowed('https://school.example', allowed)).toBe(true);
    expect(originAllowed('https://school.example:443', allowed)).toBe(true);
    expect(originAllowed('https://app.learn.example', allowed)).toBe(true);
    expect(originAllowed('https://a.b.learn.example', allowed)).toBe(true);
    expect(originAllowed('http://localhost:3000', allowed)).toBe(true);
    expect(originAllowed('https://learn.example', allowed)).toBe(false); // the wildcard is subdomains only
    expect(originAllowed('https://evil-learn.example', allowed)).toBe(false);
    expect(originAllowed('https://school.example.evil.test', allowed)).toBe(false);
    expect(originAllowed('http://school.example', allowed)).toBe(false);
    expect(originAllowed('http://localhost:3001', allowed)).toBe(false);
    expect(originAllowed('', allowed)).toBe(false);
    expect(originAllowed(null, allowed)).toBe(false);
  });
});

describe('limits', () => {
  it('allow a few lessons a minute per key', () => {
    const id = `key_test_${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(id, 3).ok).toBe(true);
    const r = rateLimit(id, 3);
    expect(r.ok).toBe(false);
    expect(r.resetSeconds).toBeGreaterThan(0);
  });
  it('count days in UTC, oldest first', () => {
    const d = lastDays(3, Date.UTC(2026, 9, 14, 23, 30));
    expect(d).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });
});

describe('what partners send', () => {
  it('recognises images by their bytes', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe('image/png');
    expect(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))).toBe('image/webp');
    expect(sniffImage(Buffer.from('%PDF-1.7 hello'))).toBeNull();
    expect(sniffImage(Buffer.from('<svg></svg>'))).toBeNull();
  });
  it('keeps metadata small and flat', () => {
    expect(cleanMetadata('{"course":"phy-10","week":3}')).toEqual({ course: 'phy-10', week: '3' });
    expect(cleanMetadata({ a: true })).toEqual({ a: 'true' });
    expect(cleanMetadata(undefined)).toBeUndefined();
    expect(() => cleanMetadata('not json')).toThrow();
    expect(() => cleanMetadata({ nested: { a: 1 } })).toThrow();
    expect(() => cleanMetadata({ 'bad key!': 'x' })).toThrow();
    expect(() => cleanMetadata(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v'])))).toThrow();
    expect(() => cleanMetadata({ k: 'x'.repeat(501) })).toThrow();
    expect(cleanExternalId('student-42')).toBe('student-42');
    expect(() => cleanExternalId('x'.repeat(129))).toThrow();
  });
});

describe('image URLs', () => {
  it('reach only the public internet', () => {
    for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.20.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', '::ffff:169.254.169.254'])
      expect(isPublicAddress(ip), ip).toBe(false);
    for (const ip of ['8.8.8.8', '142.250.183.14', '2607:f8b0:4004:c07::64', '::ffff:8.8.8.8'])
      expect(isPublicAddress(ip), ip).toBe(true);
    expect(isPublicAddress('not-an-ip')).toBe(false);
  });
});

describe('the lesson object', () => {
  it('carries what a partner needs and nothing private', () => {
    const rec: any = {
      id: 'L1', createdAt: '2026-10-14T10:00:00.000Z', ownerId: 'api-u1', timings: { total: 15000 },
      quick: { title: 'Transfer of Heat', subject: 'Science', kind: 'science', language: 'en', gist: 'Heat moves along a rod.' },
      scene: { steps: [{ id: 's1', title: 'Heating', narration: 'Heat flows.' }, { id: 's2', narration: 'Wax drops.' }] },
      verification: { status: 'faithful', summary: 'ok', checks: [{ pass: true }, { pass: false }] },
      page: { w: 1000, h: 1341, imageUrl: '/api/files/L1/page.jpg' },
      api: { keyId: 'key_1', source: 'api', externalUserId: 'stu-9', metadata: { course: 'c1' } },
      extraction: { text: 'secret page text' }, costUsd: 0.03,
    };
    const o = lessonObject(rec, 'https://lt.example');
    expect(o).toMatchObject({ id: 'L1', object: 'lesson', status: 'ready', title: 'Transfer of Heat', language: 'en', external_user_id: 'stu-9', metadata: { course: 'c1' }, source: 'api' });
    expect(o.steps).toEqual([{ index: 0, title: 'Heating', narration: 'Heat flows.' }, { index: 1, title: '', narration: 'Wax drops.' }]);
    expect(o.verification).toEqual({ status: 'faithful', summary: 'ok', checks: 2, passed: 1 });
    expect(o.page.image_url).toBe('https://lt.example/api/files/L1/page.jpg');
    expect(o.embed_url).toBe('https://lt.example/embed/lesson/L1');
    expect(JSON.stringify(o)).not.toContain('api-u1');
    expect(JSON.stringify(o)).not.toContain('costUsd');
    expect(lessonObject({ ...rec, timings: {} }, 'https://lt.example').status).toBe('processing');
  });
});
