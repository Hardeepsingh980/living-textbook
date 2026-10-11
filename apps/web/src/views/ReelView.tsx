// A page in, a short film out: the same engine makes the lesson, plays it with the tutor narrating, and records it.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { GeminiSpark } from '../components/GeminiSpark';
import { ownerId } from '../lib/api';

type Job = { id: string; status: 'queued' | 'generating' | 'recording' | 'encoding' | 'ready' | 'failed'; detail: string; url?: string; error?: string; title?: string; experienceId?: string };
const STEPS: { key: Job['status'][]; label: string }[] = [
  { key: ['queued'], label: 'In the queue' },
  { key: ['generating'], label: 'Bringing the page to life' },
  { key: ['recording'], label: 'Recording the lesson' },
  { key: ['encoding'], label: 'Saving the reel' },
  { key: ['ready'], label: 'Ready' },
];
const ORDER: Job['status'][] = ['queued', 'generating', 'recording', 'encoding', 'ready'];

export function ReelView({ onBack }: { onBack: () => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  async function submit(file: File) {
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/reels?seconds=50', { method: 'POST', body: file, headers: { 'content-type': file.type || 'application/octet-stream', 'x-owner-id': ownerId() } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: `server error ${res.status}` }))).error || 'could not start');
      setJob(await res.json());
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setBusy(false); }
  }
  // long-poll: the server answers when something changes (and the held request keeps its CPU on); a fresh object re-arms the effect
  useEffect(() => {
    if (!job || job.status === 'ready' || job.status === 'failed') return;
    let cancelled = false;
    const again = (next: Job, delay: number) => { timer.current = window.setTimeout(() => { if (!cancelled) setJob({ ...next }); }, delay); };
    (async () => {
      try { const r = await fetch(`/api/reels/${job.id}?wait=25000`); if (cancelled) return; if (r.ok) again(await r.json(), 0); else again(job, 2500); }
      catch { if (!cancelled) again(job, 2500); }
    })();
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [job]);

  const reached = job ? ORDER.indexOf(job.status) : -1;
  return (
    <div className="reel paper enter-page">
      <div className="reel-inner">
        <div className="wordmark"><span className="mark" />Living Book</div>
        <h1>Make a reel</h1>
        <p className="lede">A page in, a short explainer film out, narrated by the tutor.</p>
        {!job && (
          <label className="reel-drop">
            <GeminiSpark size={30} />
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 22 }}>Choose a page</span>
            <span className="muted">a photo, or a PDF (its first page)</span>
            <input type="file" accept="image/*,application/pdf" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void submit(f); }} />
          </label>
        )}
        {error && <div className="note">{error}</div>}
        {job && job.status !== 'ready' && job.status !== 'failed' && (
          <div className="reel-status enter">
            {job.title && <div className="note-pill">{job.title}</div>}
            <ul className="reel-steps">
              {STEPS.map((s, i) => <li key={s.label} className={i < reached ? 'done' : i === reached ? 'now' : ''}><span className="dot" />{i === reached ? job.detail : s.label}</li>)}
            </ul>
            <p className="muted">About two minutes.</p>
          </div>
        )}
        {job?.status === 'failed' && (
          <div className="reel-status enter">
            <p>I couldn't make a reel from this page. {job.error?.includes('no usable scene') ? 'Try a page with a clear diagram or worked example.' : ''}</p>
            <button className="primary" onClick={() => setJob(null)}>Try another page</button>
          </div>
        )}
        {job?.status === 'ready' && job.url && (
          <div className="reel-status enter">
            {job.title && <div className="note-pill">{job.title}</div>}
            <video className="reel-video" src={job.url} controls playsInline />
            <div className="reel-actions">
              <a className="primary" href={job.url} download={`${(job.title || 'living-book').replace(/[^\w]+/g, '-')}.mp4`}><Icon name="film" size={20} /> Save the reel</a>
              {job.experienceId && <a className="secondary" href={`/x/${job.experienceId}`}>Open the lesson</a>}
              <button className="secondary" onClick={() => setJob(null)}>Another page</button>
            </div>
          </div>
        )}
        <button className="link" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
