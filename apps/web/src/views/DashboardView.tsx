// Home for a signed-in reader: start something, see what is being made right now (it keeps going in the
// background), pick up a lesson where it was left, watch the videos, and a glance at the week.
import { useEffect, useRef, useState } from 'react';
import { useReader } from '../lib/firebase';
import { listJobs, getLibrary } from '../lib/api';
import { getMe, getInsights, type Insights, type Lesson } from '../lib/progress';
import type { Job } from '../lib/types';
import { Link, navigate } from '../lib/nav';
import { Icon } from '../components/Icon';
import { GeminiSpark } from '../components/GeminiSpark';
import { JobCard, active } from '../components/JobCard';

export function DashboardView({ onPhoto }: { onPhoto: (f: File) => void }) {
  const reader = useReader();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [ins, setIns] = useState<Insights | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    let off = false;
    // what to pick up: lessons opened (with how far the reader got) and pages made but not opened yet, newest first
    Promise.all([getMe().then((m) => m.lessons).catch(() => [] as Lesson[]), getLibrary().catch(() => [])]).then(([opened, made]) => {
      if (off) return;
      const seen = new Set(opened.map((l) => l.experienceId));
      const fresh: Lesson[] = made.filter((p) => !seen.has(p.id)).map((p) => ({ experienceId: p.id, title: p.title, subject: p.subject, kind: p.kind, language: p.language, pageImageUrl: p.pageImageUrl, openedAt: p.createdAt, lastAt: p.createdAt, opens: 0, steps: 0, totalSteps: 0, completed: false, seconds: 0, questions: 0 }));
      setLessons([...opened, ...fresh].sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || '')));
    });
    getInsights().then((i) => { if (!off) setIns(i); }).catch(() => {});
    const load = async () => {
      const js = await listJobs().catch(() => [] as Job[]);
      if (off) return;
      setJobs(js);
      if (js.some(active)) timer.current = window.setTimeout(load, 4000); // while something is being made, keep it fresh
    };
    void load();
    return () => { off = true; if (timer.current) clearTimeout(timer.current); };
  }, [reader?.uid]);

  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = (reader?.name || '').split(' ')[0];
  const making = jobs?.filter(active) ?? [];
  const videos = jobs?.filter((j) => j.status === 'ready' || j.status === 'failed') ?? [];
  const fresh = lessons !== null && jobs !== null && lessons.length === 0 && jobs.length === 0;

  return (
    <div className="page dash enter-page">
      <div className="dash-hello">
        <h1>{hello}{first ? `, ${first}` : ''}<span className="marker-dot">.</span></h1>
        <p className="muted">{fresh ? 'Pick a page from any textbook and bring it to life.' : 'Here is where you stopped.'}</p>
      </div>

      <section className="start-row" aria-label="Start something">
        <button className="start-card hot" onClick={() => navigate('/scan')}><span className="start-icon"><Icon name="camera" size={30} /></span><b>Scan a page</b><span>Point the camera at a textbook</span></button>
        <label className="start-card"><span className="start-icon"><Icon name="upload" size={30} /></span><b>Upload a photo</b><span>A photo of a page that you took before</span>
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} /></label>
        <button className="start-card" onClick={() => navigate('/app/new/short')}><span className="start-icon"><Icon name="film" size={30} /></span><b>Short video</b><span>One page becomes a video with a voice</span></button>
        <button className="start-card" onClick={() => navigate('/app/new/chapter')}><span className="start-icon"><Icon name="doc" size={30} /></span><b>Chapter film</b><span>A chapter PDF becomes a film for your class</span></button>
      </section>

      {making.length > 0 && (
        <section className="dash-section">
          <div className="section-head"><h2>Being made now</h2><span className="muted small">It keeps going if you leave.</span></div>
          <div className="job-grid">{making.map((j) => <JobCard key={j.id} job={j} />)}</div>
        </section>
      )}

      <section className="dash-section">
        <div className="section-head"><h2>Continue learning</h2>{lessons && lessons.length > 0 && <Link to="/app/library" className="link">All pages</Link>}</div>
        {lessons === null && <div className="row-wait"><GeminiSpark state="thinking" size={24} /></div>}
        {lessons && lessons.length === 0 && <div className="empty-note">Pages you bring to life show up here, with how far you got and your quiz score.</div>}
        {lessons && lessons.length > 0 && (
          <div className="lesson-strip">
            {lessons.slice(0, 8).map((l) => (
              <Link key={l.experienceId} to={`/x/${l.experienceId}`} className="lesson-tile">
                {l.pageImageUrl ? <img src={l.pageImageUrl} alt="" loading="lazy" /> : <span className="blank" />}
                <b>{l.title || 'A page'}</b>
                <span className="meter"><span style={{ width: `${l.totalSteps ? Math.round((Math.min(l.steps, l.totalSteps) / l.totalSteps) * 100) : l.completed ? 100 : 10}%` }} /></span>
                <span className="muted small">{l.quiz ? `Quiz ${l.quiz.best}/${l.quiz.total}` : l.completed ? 'Finished' : l.opens ? 'In progress' : 'New'}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {videos.length > 0 && (
        <section className="dash-section">
          <div className="section-head"><h2>Your videos</h2><Link to="/app/library?tab=videos" className="link">All videos</Link></div>
          <div className="job-grid">{videos.slice(0, 6).map((j) => <JobCard key={j.id} job={j} />)}</div>
        </section>
      )}

      {ins && ins.stats.lessons > 0 && (
        <section className="dash-section week">
          <div className="section-head"><h2>This week</h2><Link to="/app/progress" className="link">My progress</Link></div>
          <div className="week-row">
            <div className="tile"><span className="n">{ins.stats.streak}</span><span className="l">day streak</span></div>
            <div className="tile"><span className="n">{ins.stats.minutes}</span><span className="l">minutes</span></div>
            <div className="tile"><span className="n">{ins.stats.accuracy != null ? `${Math.round(ins.stats.accuracy * 100)}%` : '–'}</span><span className="l">quiz answers right</span></div>
            {ins.suggestions[0] && <div className="suggestion small-suggestion"><span className="tack" aria-hidden="true" /><h3>{ins.suggestions[0].title}</h3><p>{ins.suggestions[0].line}</p></div>}
          </div>
        </section>
      )}
    </div>
  );
}
