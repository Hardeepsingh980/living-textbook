// One short video or chapter film: its progress while it is being made (the reader may leave and come back; it keeps
// going on the server), then the video, the parts and the questions for the class.
import { useEffect, useRef, useState } from 'react';
import { getJob, retryJob, deleteJob } from '../lib/api';
import type { Job } from '../lib/types';
import { Link, navigate } from '../lib/nav';
import { Icon } from '../components/Icon';
import { GeminiSpark } from '../components/GeminiSpark';
import { KIND_LABEL, jobProgress, jobTitle, active } from '../components/JobCard';

const STAGES: Record<Job['kind'], { key: string; label: string }[]> = {
  short: [{ key: 'queued', label: 'Waiting to start' }, { key: 'generating', label: 'Bringing the page to life' }, { key: 'recording', label: 'Recording the lesson with the tutor' }, { key: 'encoding', label: 'Saving the video' }, { key: 'ready', label: 'Ready' }],
  story: [{ key: 'queued', label: 'Waiting to start' }, { key: 'reading', label: 'Reading the story' }, { key: 'drawing', label: 'Drawing the cast and the frames' }, { key: 'filming', label: 'Filming and recording the voices' }, { key: 'reviewing', label: 'Reviewing the film' }, { key: 'revising', label: 'Fixing what the review found' }, { key: 'ready', label: 'Ready' }],
  chapter: [{ key: 'queued', label: 'Waiting to start' }, { key: 'reading', label: 'Reading the chapter' }, { key: 'choosing', label: 'Choosing the pages to bring to life' }, { key: 'making', label: 'Making and recording each part' }, { key: 'composing', label: 'Putting the film together' }, { key: 'ready', label: 'Ready' }],
};
const PART_WORD: Record<string, string> = { waiting: 'waiting', making: 'bringing it to life', recording: 'recording', done: 'recorded', skipped: 'left out' };

export function JobView({ id }: { id: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let first = true;
    const load = async () => {
      try {
        const j = await getJob(id, first ? 0 : 20000); first = false;
        if (!alive.current) return;
        setJob(j);
        if (active(j)) void load();
      } catch (e: any) { if (alive.current) { setError(String(e?.message || e)); window.setTimeout(() => { if (alive.current) void load(); }, 5000); } }
    };
    void load();
    return () => { alive.current = false; };
  }, [id]);

  if (!job) return <div className="page enter-page">{error ? <p className="muted">{error}</p> : <div className="row-wait"><GeminiSpark state="thinking" size={30} /></div>}</div>;
  const stages = STAGES[job.kind];
  const at = stages.findIndex((s) => s.key === job.stage);
  const pct = Math.round(jobProgress(job) * 100);
  return (
    <div className="page job-page enter-page">
      <div className="page-head">
        <Link to={job.kind === 'short' ? '/app/library?tab=videos' : '/app/library?tab=films'} className="crumb"><Icon name="back" size={18} /> {KIND_LABEL[job.kind]}s</Link>
        <h1>{jobTitle(job)}<span className="marker-dot">.</span></h1>
        <p className="muted">{[job.grade, job.subject].filter(Boolean).join(' · ')}{job.pages ? ` · ${job.pages} pages read` : ''} · started {new Date(job.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
      </div>

      {active(job) && (
        <div className="job-progress">
          <div className="big-meter"><span style={{ width: `${pct}%` }} /></div>
          <ul className="reel-steps">
            {stages.filter((s) => s.key !== 'ready').map((s, k) => <li key={s.key} className={k < at ? 'done' : k === at ? 'now' : ''}><span className="dot" />{k === at ? job.detail : s.label}</li>)}
          </ul>
          <p className="leave-note"><Icon name="clock" size={18} /> You can leave this page. It keeps going, and it will be on your dashboard when it is ready.</p>
        </div>
      )}

      {job.status === 'failed' && (
        <div className="empty-card">
          <p>This stopped part way{job.error && job.error !== 'interrupted' ? `: ${job.error}` : ''}.</p>
          <div className="row-actions">
            <button className="primary" onClick={async () => setJob(await retryJob(job.id))}><Icon name="replay" size={20} /> Try again</button>
            <button className="secondary" onClick={async () => { await deleteJob(job.id).catch(() => {}); navigate('/app/library?tab=videos'); }}>Delete</button>
          </div>
        </div>
      )}

      {job.status === 'ready' && job.url && (
        <div className={`film-frame ${job.kind === 'short' ? 'portrait' : ''}`}>
          <span className="tape" aria-hidden="true" />
          <video src={job.url} poster={job.poster} controls playsInline preload="metadata" />
        </div>
      )}
      {job.status === 'ready' && job.url && (
        <div className="row-actions">
          <a className="primary" href={job.url} download={`${jobTitle(job).replace(/[^\w]+/g, '-')}.mp4`}><Icon name="download" size={20} /> Save the video</a>
          {job.kind === 'short' && job.experienceId && <Link to={`/x/${job.experienceId}`} className="secondary"><Icon name="open" size={18} /> Open the lesson</Link>}
          <button className="secondary" onClick={async () => { if (!confirm('Delete this video?')) return; await deleteJob(job.id).catch(() => {}); navigate('/app/library?tab=videos'); }}><Icon name="trash" size={18} /> Delete</button>
        </div>
      )}

      {job.kind === 'chapter' && (job.sections?.length ?? 0) > 0 && (
        <section className="dash-section">
          <div className="section-head"><h2>Parts</h2></div>
          <div className="sections">
            {job.sections!.map((s, k) => (
              <div key={s.page} className={`section-card ${s.status}`}>
                {s.thumb ? <img src={s.thumb} alt="" /> : <span className="thumb-blank" />}
                <div className="section-text">
                  <span className="part">Part {k + 1} · page {s.page}</span>
                  <b>{s.concept}</b>
                  <span className={`state ${s.status}`}>{s.status === 'making' || s.status === 'recording' ? <GeminiSpark state="thinking" size={14} /> : s.status === 'done' ? <Icon name="check" size={14} /> : null}{PART_WORD[s.status]}</span>
                </div>
                {s.experienceId && s.status === 'done' && <Link to={`/x/${s.experienceId}`} className="secondary small">Open</Link>}
              </div>
            ))}
          </div>
        </section>
      )}
      {job.status === 'ready' && job.questions && job.questions.length > 0 && (
        <section className="dash-section teach-questions">
          <h3>Questions for the class</h3>
          {job.questions.map((q, k) => <div key={k} className="postit q">{q}</div>)}
        </section>
      )}
    </div>
  );
}
