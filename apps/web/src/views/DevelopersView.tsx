// The developer dashboard: API keys (secret for servers, publishable for web pages), usage against the daily
// allowance, ready-to-paste code with the developer's own key, a live scanner preview, and the lessons made through
// the API and the scanner.
import { useEffect, useMemo, useState } from 'react';
import { listKeys, createKey, updateKey, revokeKey, getUsage, listDevLessons, type DevKey, type DevUsage, type DevLesson } from '../lib/devapi';
import { Link } from '../lib/nav';
import { Icon } from '../components/Icon';
import { CodeBlock } from '../components/CodeBlock';
import '../dev.css';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');
const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : when(iso);
};
const splitSites = (t: string) => t.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

function NewKeySheet({ onClose, onMade }: { onClose: () => void; onMade: (k: DevKey) => void }) {
  const [kind, setKind] = useState<DevKey['kind']>('publishable');
  const [name, setName] = useState('');
  const [sites, setSites] = useState(`${location.origin.startsWith('http://localhost') ? 'http://localhost:3000' : 'https://'}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const make = async () => {
    setBusy(true); setError('');
    try { onMade(await createKey({ kind, name, origins: kind === 'publishable' ? splitSites(sites) : [] })); }
    catch (e: any) { setError(String(e?.message || e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="sheet-back" onClick={onClose} role="dialog" aria-modal="true" aria-label="New API key">
      <div className="new-sheet dev-sheet enter" onClick={(e) => e.stopPropagation()}>
        <div className="section-head"><h2>New key</h2><button className="round small" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button></div>
        <div className="kind-grid" role="radiogroup" aria-label="Kind of key">
          <button role="radio" aria-checked={kind === 'publishable'} className={`kind-card ${kind === 'publishable' ? 'on' : ''}`} onClick={() => setKind('publishable')}>
            <b>Publishable</b><span>For your web pages. Opens the scanner, only on the sites you list.</span><code>ltpk_…</code>
          </button>
          <button role="radio" aria-checked={kind === 'secret'} className={`kind-card ${kind === 'secret' ? 'on' : ''}`} onClick={() => setKind('secret')}>
            <b>Secret</b><span>For your server. Makes, lists and deletes lessons with the REST API. Never put it in a web page or an app.</span><code>ltsk_…</code>
          </button>
        </div>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'secret' ? 'Production server' : 'School website'} maxLength={60} /></label>
        {kind === 'publishable' && (
          <label className="field"><span>Sites that may show the scanner, one per line</span>
            <textarea rows={3} value={sites} onChange={(e) => setSites(e.target.value)} placeholder={'https://your-school.app\nhttps://*.your-school.app\nhttp://localhost:3000'} />
            <small className="muted">https only, except localhost. *.your-site.com covers its subdomains.</small>
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="row-actions"><button className="primary" onClick={make} disabled={busy}>{busy ? 'Making it…' : 'Make the key'}</button><button className="link" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}

function KeyRow({ k, onChanged }: { k: DevKey; onChanged: (k: DevKey) => void }) {
  const [editing, setEditing] = useState(false);
  const [sites, setSites] = useState(k.origins.join('\n'));
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const save = async () => { setError(''); try { onChanged(await updateKey(k.id, { origins: splitSites(sites) })); setEditing(false); } catch (e: any) { setError(String(e?.message || e)); } };
  const revoke = async () => { setError(''); try { onChanged(await revokeKey(k.id)); setConfirm(false); } catch (e: any) { setError(String(e?.message || e)); } };
  const revoked = !!k.revoked_at;
  return (
    <li className={`key-row ${revoked ? 'revoked' : ''}`}>
      <div className="key-main">
        <span className={`kind-chip ${k.kind}`}>{k.kind === 'secret' ? 'Secret' : 'Publishable'}</span>
        <b className="key-name">{k.name}</b>
        <code className="key-display">{k.display}</code>
      </div>
      <div className="key-meta muted small">
        <span>Made {when(k.created_at)}</span><span>Last used {ago(k.last_used_at)}</span><span>{k.uses} {k.uses === 1 ? 'lesson' : 'lessons'}</span>
        {revoked && <span className="revoked-note">Revoked {when(k.revoked_at)}</span>}
      </div>
      {k.kind === 'publishable' && !editing && <div className="key-sites small">{k.origins.map((o) => <code key={o}>{o}</code>)}</div>}
      {editing && (
        <div className="key-edit">
          <textarea rows={3} value={sites} onChange={(e) => setSites(e.target.value)} aria-label="Sites" />
          <div className="row-actions"><button className="primary small-btn" onClick={save}>Save sites</button><button className="link" onClick={() => { setEditing(false); setSites(k.origins.join('\n')); }}>Cancel</button></div>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      {!revoked && !editing && (
        <div className="key-actions">
          {k.kind === 'publishable' && <button className="link" onClick={() => setEditing(true)}>Edit sites</button>}
          {confirm
            ? <span className="confirm"><span className="small">Apps using it stop working within a minute.</span><button className="danger small-btn" onClick={revoke}>Revoke</button><button className="link" onClick={() => setConfirm(false)}>Keep it</button></span>
            : <button className="link danger-link" onClick={() => setConfirm(true)}>Revoke</button>}
        </div>
      )}
    </li>
  );
}

function UsageCard({ usage }: { usage: DevUsage | null }) {
  if (!usage) return <div className="usage-card"><span className="muted">Loading usage…</span></div>;
  const max = Math.max(5, ...usage.days.map((d) => d.lessons));
  const pct = Math.min(100, Math.round((usage.today.lessons / usage.daily_limit) * 100));
  return (
    <div className="usage-card">
      <div className="usage-today">
        <span className="big">{usage.today.lessons}</span><span className="of">of {usage.daily_limit} lessons today</span>
        <div className="big-meter" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
        <span className="muted small">Resets at midnight UTC. At most {usage.per_minute_limit} a minute per key.</span>
      </div>
      <div className="usage-bars" role="img" aria-label={`Lessons per day over the last ${usage.days.length} days`}>
        {usage.days.map((d) => (
          <div key={d.day} className="usage-bar" title={`${d.day}: ${d.lessons}`}>
            <span style={{ height: `${Math.round((d.lessons / max) * 100)}%` }} className={d.lessons ? '' : 'zero'} />
            <small>{new Date(`${d.day}T00:00:00Z`).getUTCDate()}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DevelopersView() {
  const [keys, setKeys] = useState<DevKey[] | null>(null);
  const [usage, setUsage] = useState<DevUsage | null>(null);
  const [lessons, setLessons] = useState<DevLesson[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [made, setMade] = useState<DevKey | null>(null);
  const [tab, setTab] = useState<'lesson' | 'scanner' | 'server'>('scanner');
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    listKeys().then(setKeys).catch((e) => { setKeys([]); setError(String(e?.message || e)); });
    getUsage().then(setUsage).catch(() => {});
    listDevLessons().then(setLessons).catch(() => setLessons([]));
  }, []);

  const host = location.origin;
  const active = keys?.filter((k) => !k.revoked_at) ?? [];
  const pk = active.find((k) => k.kind === 'publishable');
  const pkText = pk?.key ?? 'ltpk_YOUR_PUBLISHABLE_KEY';
  const lessonId = lessons?.[0]?.id ?? 'LESSON_ID';
  const snippets = useMemo(() => ({
    lesson: `<script src="${host}/sdk/v1.js" data-key="${pkText}"></script>

<!-- a lesson player; it fills the width of its container -->
<div data-lt-lesson="${lessonId}" data-lt-height="640"></div>

<script>
  document.addEventListener('livingtextbook:complete', (e) => {
    console.log('lesson finished', e.detail.lessonId);
  });
</script>`,
    scanner: `<script src="${host}/sdk/v1.js" data-key="${pkText}"></script>

<button id="scan">Scan a page</button>
<script>
  document.getElementById('scan').onclick = () => {
    LivingTextbook().scanner({
      onLesson: (lesson) => {
        // { id, title, share_url, embed_url }: keep it with the learner
        console.log('new lesson', lesson.id, lesson.title);
      },
    });
  };
</script>`,
    server: `curl ${host}/v1/lessons \\
  -H "Authorization: Bearer $LIVING_TEXTBOOK_SECRET_KEY" \\
  -F image=@page.jpg \\
  -F external_user_id=student-42

# Node 18+:  npm install ${host}/sdk/living-textbook-sdk.tgz
import { LivingTextbook } from '@living-textbook/sdk';
const lt = new LivingTextbook({ apiKey: process.env.LIVING_TEXTBOOK_SECRET_KEY, baseUrl: '${host}' });
const lesson = await lt.lessons.create({ image: await fs.readFile('page.jpg'), externalUserId: 'student-42' });
console.log(lesson.embed_url);`,
  }), [host, pkText, lessonId]);

  const onMade = (k: DevKey) => { setNewOpen(false); setMade(k); setKeys((ks) => [k, ...(ks ?? [])]); if (k.kind === 'publishable') setTab('scanner'); else setTab('server'); };
  const onChanged = (k: DevKey) => setKeys((ks) => (ks ?? []).map((x) => (x.id === k.id ? k : x)));

  return (
    <div className="page devs enter-page">
      <div className="page-head">
        <h1>Developers<span className="marker-dot">.</span></h1>
        <p className="muted dev-lede">Put living lessons inside your own learning app: the scanner and the lesson player on your pages, and a REST API for your server.</p>
        <div className="row-actions">
          <Link to="/developers" className="secondary"><Icon name="doc" size={18} /> Read the docs</Link>
          <a className="link" href="/v1/openapi.json" target="_blank" rel="noreferrer">OpenAPI description</a>
          <a className="link" href="/sdk/living-textbook-sdk.tgz">Node SDK</a>
        </div>
      </div>

      <section className="dash-section" aria-labelledby="keys-h">
        <div className="section-head"><h2 id="keys-h">API keys</h2>{keys && keys.length > 0 && <button className="primary small-btn" onClick={() => setNewOpen(true)}><Icon name="plus" size={18} /> New key</button>}</div>
        {made?.key && (
          <div className="key-reveal enter" role="status">
            <div className="key-reveal-head"><Icon name="key" size={22} /><b>Your new {made.kind} key</b></div>
            <CodeBlock code={made.key} label={made.name} />
            <p className="small">{made.kind === 'secret' ? <><b>Copy it now: it is shown only this once.</b> Keep it on your server, in an environment variable. Never put it in a web page or an app.</> : 'It goes in your web pages, and works only on the sites you listed. It stays visible here, in the code below.'}</p>
            <button className="link" onClick={() => setMade(null)}>I have copied it</button>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        {keys === null ? <div className="row-wait"><span className="muted">Loading keys…</span></div>
          : keys.length === 0 ? (
            <div className="empty-card">
              <b>No keys yet.</b>
              <span className="muted">A publishable key puts the scanner on your site in two lines. A secret key lets your server make lessons from page images.</span>
              <div className="row-actions"><button className="primary" onClick={() => setNewOpen(true)}><Icon name="key" size={18} /> Make your first key</button></div>
            </div>
          ) : <ul className="key-list">{keys.map((k) => <KeyRow key={k.id} k={k} onChanged={onChanged} />)}</ul>}
      </section>

      <section className="dash-section" aria-labelledby="usage-h">
        <div className="section-head"><h2 id="usage-h">Usage</h2></div>
        <UsageCard usage={usage} />
      </section>

      <section className="dash-section" aria-labelledby="start-h">
        <div className="section-head"><h2 id="start-h">Quick start</h2><Link to="/developers#embed" className="link">All options</Link></div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'scanner'} className={`tab-chip ${tab === 'scanner' ? 'on' : ''}`} onClick={() => setTab('scanner')}><Icon name="camera" size={18} /> Scanner on your page</button>
          <button role="tab" aria-selected={tab === 'lesson'} className={`tab-chip ${tab === 'lesson' ? 'on' : ''}`} onClick={() => setTab('lesson')}><Icon name="play" size={18} /> Show a lesson</button>
          <button role="tab" aria-selected={tab === 'server'} className={`tab-chip ${tab === 'server' ? 'on' : ''}`} onClick={() => setTab('server')}><Icon name="code" size={18} /> From your server</button>
        </div>
        <CodeBlock code={snippets[tab]} label={tab === 'server' ? 'shell and Node' : 'HTML'} />
        {tab !== 'server' && !pk && <p className="small muted">Make a publishable key first; the code above then carries it.</p>}
        {tab === 'scanner' && pk && (
          <div className="preview">
            {!preview
              ? <button className="secondary" onClick={() => setPreview(true)}><Icon name="camera" size={18} /> Try your scanner here</button>
              : <>
                <p className="small muted">This is the scanner exactly as your site will show it. Lessons made here count against your allowance.</p>
                <div className="preview-frame"><iframe title="Your scanner" src={`/embed/scan?key=${encodeURIComponent(pk.key ?? '')}`} allow="camera; microphone; autoplay; fullscreen" referrerPolicy="origin" /></div>
                <button className="link" onClick={() => setPreview(false)}>Close the preview</button>
              </>}
          </div>
        )}
      </section>

      <section className="dash-section" aria-labelledby="made-h">
        <div className="section-head"><h2 id="made-h">Lessons made with your keys</h2></div>
        {lessons === null ? <div className="row-wait"><span className="muted">Loading…</span></div>
          : lessons.length === 0 ? <p className="empty-note">Lessons made through the API or your scanner appear here.</p>
          : (
            <ul className="dev-lessons">
              {lessons.map((l) => (
                <li key={l.id} className="dev-lesson">
                  {l.page.image_url ? <img src={l.page.image_url} alt="" loading="lazy" /> : <span className="blank" />}
                  <div className="dev-lesson-text">
                    <b>{l.title || l.subject || 'Untitled page'}</b>
                    <span className="muted small">{l.source === 'embed' ? 'Scanner' : 'API'} · {when(l.created_at)}{l.external_user_id ? ` · ${l.external_user_id}` : ''}</span>
                    <code className="small">{l.id}</code>
                  </div>
                  <a className="link" href={l.share_url} target="_blank" rel="noreferrer"><Icon name="open" size={16} /> Open</a>
                </li>
              ))}
            </ul>
          )}
      </section>
      {newOpen && <NewKeySheet onClose={() => setNewOpen(false)} onMade={onMade} />}
    </div>
  );
}
