// A reader's own page: what they did (from Firestore), how it went day by day and what they missed (from BigQuery),
// and three suggestions written from those numbers by Gemini. Every page links back into its lesson.
import { useEffect, useState } from 'react';
import { useReader, signOut } from '../lib/firebase';
import { getMe, getInsights, type Insights, type Lesson } from '../lib/progress';
import { GoogleButton } from '../components/GoogleButton';
import { GeminiSpark } from '../components/GeminiSpark';
import { Icon } from '../components/Icon';
import '../learn.css';

type Props = { onOpen: (id: string) => void; onBack: () => void; onScan: () => void };

export function ProgressView({ onOpen, onBack, onScan }: Props) {
  const reader = useReader();
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [ins, setIns] = useState<Insights | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!reader) return;
    let off = false;
    getMe().then((m) => { if (!off) setLessons(m.lessons); }).catch((e) => { if (!off) setError(String(e?.message || e)); });
    getInsights().then((i) => { if (!off) setIns(i); }).catch(() => {});
    return () => { off = true; };
  }, [reader?.uid]);

  return (
    <div className="progress-page paper enter-page">
      <div className="progress-inner">
        <div className="progress-top">
          <button className="round" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
          <div className="who">
            {reader && (reader.photo ? <img className="avatar" src={reader.photo} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(reader.name || reader.email || '?').slice(0, 1).toUpperCase()}</span>)}
            <span className="name">{reader ? (reader.name || reader.email) : 'My progress'}</span>
          </div>
          {reader && <button className="link" onClick={() => { void signOut(); }}>Sign out</button>}
        </div>

        {!reader && (
          <div className="signin-card">
            <span className="tape" aria-hidden="true" />
            <h2>Keep what you learn<span className="marker-dot">.</span></h2>
            <p className="muted">Your pages, quiz scores and a weekly picture of how you are doing, on any device.</p>
            <GoogleButton />
          </div>
        )}

        {reader && error && <p className="muted">{error}</p>}
        {reader && lessons === null && !error && <div className="quiz-wait"><GeminiSpark state="thinking" size={30} /><span>Opening your progress</span></div>}

        {reader && lessons && lessons.length === 0 && (
          <div className="signin-card">
            <h2>Your first page is waiting<span className="marker-dot">.</span></h2>
            <p className="muted">Point the camera at any textbook page. Everything you learn shows up here.</p>
            <button className="primary" onClick={onScan}><Icon name="camera" size={22} /> Open camera</button>
          </div>
        )}

        {reader && lessons && lessons.length > 0 && (
          <>
            {ins?.summary && <div className="summary-note"><GeminiSpark size={22} /> {ins.summary}</div>}
            <div className="tiles">
              <div className="tile"><span className="n">{ins?.stats.lessons ?? lessons.length}</span><span className="l">pages learned</span></div>
              <div className="tile"><span className="n">{ins?.stats.minutes ?? Math.round(lessons.reduce((a, l) => a + l.seconds, 0) / 60)}</span><span className="l">minutes</span></div>
              <div className="tile"><span className="n">{ins?.stats.accuracy != null ? `${Math.round(ins.stats.accuracy * 100)}%` : ins?.stats.avgScore != null ? `${Math.round(ins.stats.avgScore * 100)}%` : '–'}</span><span className="l">quiz answers right</span></div>
              <div className={`tile ${(ins?.stats.streak ?? 0) >= 2 ? 'hot' : ''}`}><span className="n">{ins?.stats.streak ?? 0}</span><span className="l">day streak</span></div>
              <div className="tile"><span className="n">{ins?.stats.questions ?? lessons.reduce((a, l) => a + l.questions, 0)}</span><span className="l">questions asked</span></div>
            </div>

            {ins && ins.suggestions.length > 0 && (
              <section className="enter">
                <h2 className="section-title">Next for you<span className="marker-dot">.</span></h2>
                <div className="suggestions" style={{ marginTop: 16 }}>
                  {ins.suggestions.map((s, k) => (
                    <div key={k} className="suggestion">
                      <span className="tack" aria-hidden="true" />
                      <h3>{s.title}</h3>
                      <p>{s.line}</p>
                      {s.experienceId && lessons.some((l) => l.experienceId === s.experienceId) && <button className="secondary small" onClick={() => onOpen(s.experienceId!)}>Open the page</button>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {ins && ins.daily.length > 0 && <Days daily={ins.daily} />}

            {ins && ins.missed.length > 0 && (
              <section>
                <h2 className="section-title">Worth another look<span className="marker-dot">.</span></h2>
                <div className="missed" style={{ marginTop: 16 }}>
                  {ins.missed.slice(0, 4).map((m, k) => (
                    <div key={k} className="missed-item"><Icon name="question" size={20} /><span className="q"><b>{m.title}</b>: {m.question}</span>{m.experienceId && <button className="secondary small" onClick={() => onOpen(m.experienceId!)}>Revisit</button>}</div>
                  ))}
                </div>
              </section>
            )}

            {ins && ins.bySubject.length > 0 && (
              <section>
                <h2 className="section-title">By subject<span className="marker-dot">.</span></h2>
                <div className="subject-rows" style={{ marginTop: 16 }}>
                  {ins.bySubject.map((b) => {
                    const acc = b.accuracy ?? b.avgScore;
                    return (
                      <div key={b.subject} className="subject-row">
                        <span className="name">{b.subject}</span>
                        <div className={`meter ${acc != null && acc < 0.6 ? 'marker' : ''}`} title={acc != null ? `${Math.round(acc * 100)}% of quiz answers right` : 'no quiz yet'}><span style={{ width: `${Math.round((acc ?? 0) * 100)}%` }} /></div>
                        <span className="muted">{b.lessons} {b.lessons === 1 ? 'page' : 'pages'}{acc != null ? ` · ${Math.round(acc * 100)}%` : ''}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h2 className="section-title">Your pages<span className="marker-dot">.</span></h2>
              <div className="lessons" style={{ marginTop: 16 }}>
                {lessons.map((l) => (
                  <button key={l.experienceId} className="lesson-row" onClick={() => onOpen(l.experienceId)}>
                    {l.pageImageUrl ? <img src={l.pageImageUrl} alt="" loading="lazy" /> : <span />}
                    <span>
                      <span className="t">{l.title || 'A page'}</span><br />
                      <span className="s">{l.subject}{l.seconds ? ` · ${Math.max(1, Math.round(l.seconds / 60))} min` : ''}{l.questions ? ` · ${l.questions} ${l.questions === 1 ? 'question' : 'questions'}` : ''}{l.completed ? ' · finished' : ''}</span>
                      <span className="meter" style={{ display: 'block' }}><span style={{ width: `${l.totalSteps ? Math.round((Math.min(l.steps, l.totalSteps) / l.totalSteps) * 100) : l.completed ? 100 : 10}%` }} /></span>
                    </span>
                    {l.quiz ? <span className="score-chip">{l.quiz.best}/{l.quiz.total}</span> : <span className="score-chip none">no quiz</span>}
                  </button>
                ))}
              </div>
            </section>
            {ins && <p className="fine">Day-by-day activity and quiz answers are analysed in BigQuery; suggestions are written by Gemini from those numbers.</p>}
          </>
        )}
      </div>
    </div>
  );
}

/** The last fourteen days as pencil bars: minutes spent, today in marker red. */
function Days({ daily }: { daily: Insights['daily'] }) {
  const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const today = new Date();
  const days = Array.from({ length: 14 }, (_, k) => ist(new Date(today.getTime() - (13 - k) * 86400_000)));
  const by = new Map(daily.map((d) => [d.day, d]));
  const max = Math.max(1, ...days.map((d) => by.get(d)?.minutes ?? 0));
  return (
    <section>
      <h2 className="section-title">Two weeks<span className="marker-dot">.</span></h2>
      <div className="days" style={{ marginTop: 16 }} aria-label="Minutes learned per day, last fourteen days">
        {days.map((d, k) => { const m = by.get(d)?.minutes ?? 0; return <span key={d} className={`bar ${m === 0 && !(by.get(d)?.opens) ? 'zero' : ''} ${k === 13 ? 'today' : ''}`} style={{ height: `${Math.max(4, (m / max) * 100)}%` }} title={`${d}: ${m} min`} />; })}
      </div>
      <div className="days-legend"><span>two weeks ago</span><span>today</span></div>
    </section>
  );
}
