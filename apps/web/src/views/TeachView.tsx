// For teachers: a chapter PDF in, a narrated explainer film out. The same engine reads every page, picks the pages
// worth bringing to life, makes and records each lesson with the tutor, and sets them into one 16:9 film.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { GeminiSpark } from '../components/GeminiSpark';
import { authHeaders } from '../lib/api';
import '../learn.css';

type Section = { page: number; concept: string; status: 'waiting' | 'making' | 'recording' | 'done' | 'skipped'; experienceId?: string; thumb?: string; title?: string };
type Job = { id: string; status: 'queued' | 'reading' | 'choosing' | 'making' | 'composing' | 'ready' | 'failed'; detail: string; title?: string; subject?: string; grade?: string; pages?: number; sections: Section[]; url?: string; poster?: string; seconds?: number; error?: string; questions?: string[] };
const STAGES: { key: Job['status']; label: string }[] = [
  { key: 'reading', label: 'Reading the chapter' }, { key: 'choosing', label: 'Choosing the pages to bring to life' }, { key: 'making', label: 'Making and recording each lesson' }, { key: 'composing', label: 'Setting the film' }, { key: 'ready', label: 'Ready' },
];
const ORDER: Job['status'][] = ['queued', 'reading', 'choosing', 'making', 'composing', 'ready'];
const STATUS_WORD: Record<Section['status'], string> = { waiting: 'waiting', making: 'bringing it to life', recording: 'recording', done: 'recorded', skipped: 'left out' };

export function TeachView({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [parts, setParts] = useState(5);
  const timer = useRef<number | null>(null);

  async function submit(file: File) {
    setError(''); setBusy(true);
    try {
      const res = await fetch(`/api/chapters?sections=${parts}`, { method: 'POST', body: file, headers: await authHeaders({ 'content-type': 'application/pdf' }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `server error ${res.status}`);
      setJob(j);
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setBusy(false); }
  }
  // long-poll: the server answers when something changes, and the held request keeps the server's CPU on
  useEffect(() => {
    if (!job || job.status === 'ready' || job.status === 'failed') return;
    let cancelled = false;
    const again = (next: Job, delay: number) => { timer.current = window.setTimeout(() => { if (!cancelled) setJob({ ...next }); }, delay); };
    (async () => {
      try { const r = await fetch(`/api/chapters/${job.id}?wait=25000`); if (cancelled) return; if (r.ok) again(await r.json(), 0); else again(job, 3000); }
      catch { if (!cancelled) again(job, 3000); }
    })();
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [job]);

  const reached = job ? ORDER.indexOf(job.status) : -1;
  return (
    <div className="teach paper enter-page">
      <div className="teach-inner">
        <div className="progress-top">
          <button className="round" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
          <div className="who"><span className="name">For teachers</span></div>
        </div>
        {!job && (
          <>
            <h1 className="teach-title">A chapter in, a film out<span className="marker-dot">.</span></h1>
            <p className="lede">Upload a chapter PDF. You get a narrated explainer of its key diagrams, ready for the class projector.</p>
            <label className="teach-drop">
              <span className="tape" aria-hidden="true" />
              <GeminiSpark size={34} />
              <span className="drop-word">Choose a chapter PDF</span>
              <span className="muted">NCERT chapters work well; up to 40 pages are read</span>
              <input type="file" accept="application/pdf,.pdf" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void submit(f); e.target.value = ''; }} />
            </label>
            <div className="parts-pick">
              <span>Parts in the film</span>
              {[3, 4, 5, 6].map((n) => <button key={n} className={`chip ${parts === n ? 'on' : ''}`} onClick={() => setParts(n)}>{n}</button>)}
            </div>
            {error && <p className="note" role="alert">{error}</p>}
          </>
        )}
        {job && job.status !== 'ready' && job.status !== 'failed' && (
          <div className="teach-status enter">
            <h2 className="teach-title small">{job.title || 'Your chapter'}<span className="marker-dot">.</span></h2>
            <ul className="reel-steps">
              {STAGES.map((s) => { const k = ORDER.indexOf(s.key); return <li key={s.key} className={k < reached ? 'done' : k === reached ? 'now' : ''}><span className="dot" />{k === reached ? job.detail : s.label}</li>; })}
            </ul>
            {job.sections.length > 0 && <Sections sections={job.sections} />}
            <p className="muted">A few minutes per part. You can leave this page open in the background.</p>
          </div>
        )}
        {job?.status === 'failed' && (
          <div className="teach-status enter">
            <p>I couldn't make a film from this chapter. {job.error}</p>
            <button className="primary" onClick={() => setJob(null)}>Try another chapter</button>
          </div>
        )}
        {job?.status === 'ready' && job.url && (
          <div className="teach-status enter">
            <h2 className="teach-title small">{job.title}<span className="marker-dot">.</span></h2>
            <div className="film-frame"><span className="tape" aria-hidden="true" /><video src={job.url} poster={job.poster} controls playsInline /></div>
            <div className="reel-actions">
              <a className="primary" href={job.url} download={`${(job.title || 'chapter').replace(/[^\w]+/g, '-')}.mp4`}><Icon name="film" size={20} /> Save the film</a>
              <button className="secondary" onClick={() => setJob(null)}>Another chapter</button>
            </div>
            <Sections sections={job.sections} onOpen={onOpen} />
            {job.questions && job.questions.length > 0 && (
              <div className="teach-questions">
                <h3>Questions for the class</h3>
                {job.questions.map((q, k) => <div key={k} className="postit q">{q}</div>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Sections({ sections, onOpen }: { sections: Section[]; onOpen?: (id: string) => void }) {
  return (
    <div className="sections">
      {sections.map((s, k) => (
        <div key={s.page} className={`section-card ${s.status}`}>
          {s.thumb ? <img src={s.thumb} alt="" /> : <span className="thumb-blank" />}
          <div className="section-text">
            <span className="part">Part {k + 1} · page {s.page}</span>
            <b>{s.concept}</b>
            <span className={`state ${s.status}`}>{s.status === 'making' || s.status === 'recording' ? <GeminiSpark state="thinking" size={14} /> : s.status === 'done' ? <Icon name="check" size={14} /> : null}{STATUS_WORD[s.status]}</span>
          </div>
          {onOpen && s.experienceId && s.status === 'done' && <button className="secondary small" onClick={() => onOpen(s.experienceId!)}>Open</button>}
        </div>
      ))}
    </div>
  );
}
