// A short quiz on the page just learned: one question at a time, the answer marked straight away with the page's
// reason, an "explain it" that hands a wrong answer to the live tutor, and a score at the end. Every answer is a
// learning event (BigQuery), the score goes to the reader's progress.
import { useEffect, useMemo, useState } from 'react';
import type { Quiz } from '@living-book/scene';
import { getQuiz } from '../lib/api';
import { track } from '../lib/progress';
import { signIn, useReader, useSignInAvailable } from '../lib/firebase';
import type { LessonMeta } from '../lib/types';
import { Icon } from './Icon';
import { GeminiSpark } from './GeminiSpark';
import '../learn.css';

type Props = { experienceId: string; meta: Partial<LessonMeta>; onClose: () => void; onExplain?: (prompt: string) => void };

/** Options in a fresh order each attempt, so the right answer is not always where the model put it. */
function shuffled(quiz: Quiz, seed: number) {
  return quiz.questions.map((q, qi) => {
    const order = q.options.map((_, i) => i);
    let s = (seed + qi * 7919) >>> 0;
    for (let i = order.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [order[i], order[j]] = [order[j]!, order[i]!]; }
    return { q: q.q, why: q.why, options: order.map((i) => q.options[i]!), answer: order.indexOf(q.answer) };
  });
}

export function QuizSheet({ experienceId, meta, onClose, onExplain }: Props) {
  const reader = useReader();
  const canSignIn = useSignInAvailable();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(() => Math.floor(Math.random() * 1e6));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => { let off = false; getQuiz(experienceId).then((q) => { if (!off) setQuiz(q); }).catch((e) => { if (!off) setError(String(e?.message || e)); }); return () => { off = true; }; }, [experienceId]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  const qs = useMemo(() => (quiz ? shuffled(quiz, attempt) : []), [quiz, attempt]);
  const q = qs[i];
  const total = qs.length;

  function choose(k: number) {
    if (!q || picked !== null) return;
    setPicked(k);
    const right = k === q.answer;
    if (right) setScore((s) => s + 1);
    track({ ...meta, experienceId, event: 'quiz_answer', value: right ? 1 : 0, step: i, totalSteps: total, detail: `${q.q} | chose: ${q.options[k]} | right: ${q.options[q.answer]}`.slice(0, 300) });
  }
  function next() {
    if (i + 1 < total) { setI(i + 1); setPicked(null); return; }
    setDone(true);
    track({ ...meta, experienceId, event: 'quiz', value: score, totalSteps: total, detail: `${score} of ${total}` });
  }
  function again() { setAttempt((a) => a + 1); setI(0); setPicked(null); setScore(0); setDone(false); }
  const verdict = total ? score / total : 0;
  const message = verdict === 1 ? 'Every one right!' : verdict >= 0.75 ? 'Nearly all of it.' : verdict >= 0.5 ? 'Good start. One more look at the page?' : 'Let the page show you again, then try once more.';

  return (
    <div className="quiz-back" onClick={onClose} role="dialog" aria-modal="true" aria-label="Quiz">
      <div className="quiz-card enter" onClick={(e) => e.stopPropagation()}>
        <span className="tape" aria-hidden="true" />
        <div className="quiz-head">
          <span className="postit">Quiz</span>
          {total > 0 && !done && <div className="quiz-dots" aria-hidden="true">{qs.map((_, k) => <span key={k} className={k < i ? 'done' : k === i ? 'on' : ''} />)}</div>}
          <button className="round small" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
        </div>
        {!quiz && !error && <div className="quiz-wait"><GeminiSpark state="thinking" size={30} /><span>Writing a quiz from this page</span></div>}
        {error && <div className="quiz-wait"><span>{error}</span><button className="secondary small" onClick={onClose}>Back to the page</button></div>}
        {q && !done && (
          <div className="quiz-body" key={`${attempt}-${i}`}>
            <h3 className="quiz-q">{q.q}</h3>
            <div className="quiz-options">
              {q.options.map((o, k) => {
                const state = picked === null ? '' : k === q.answer ? 'right' : k === picked ? 'wrong' : 'dim';
                return (
                  <button key={k} className={`quiz-option ${state}`} disabled={picked !== null} onClick={() => choose(k)}>
                    <span className="letter">{'ABCD'[k]}</span><span className="text">{o}</span>
                    {state === 'right' && <Icon name="check" size={22} />}{state === 'wrong' && <Icon name="cross" size={22} />}
                  </button>
                );
              })}
            </div>
            {picked !== null && <div className={`quiz-why ${picked === q.answer ? 'right' : 'wrong'}`}><b>{picked === q.answer ? 'Right!' : 'Not quite.'}</b> {q.why}</div>}
            {picked !== null && (
              <div className="quiz-actions">
                {picked !== q.answer && onExplain && <button className="secondary small" onClick={() => { onExplain(`A quiz question about this page: "${q.q}". The student chose "${q.options[picked]}", but the right answer is "${q.options[q.answer]}". In two short sentences, explain why, using the page.`); onClose(); }}><Icon name="mic" size={18} /> Explain it</button>}
                <button className="primary" onClick={next}>{i + 1 < total ? 'Next' : 'My score'}</button>
              </div>
            )}
          </div>
        )}
        {done && (
          <div className="quiz-done enter">
            <div className="quiz-score"><span className="big">{score}</span><span className="of">of {total}</span></div>
            <p className="quiz-message">{message}</p>
            {!reader && canSignIn && <button className="link" onClick={() => { void signIn().catch(() => {}); }}>Sign in with Google to keep your scores</button>}
            <div className="quiz-actions">
              <button className="secondary" onClick={again}><Icon name="replay" size={18} /> Try again</button>
              <button className="primary" onClick={onClose}>Back to the page</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
