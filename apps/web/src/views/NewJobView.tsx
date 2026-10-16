// Making a short video (a page photo or PDF in) or a chapter film (a chapter PDF in). The file goes to the server,
// a background job starts, and the reader lands on its page, which they can leave.
import { useState } from 'react';
import { startShort, startChapter, ApiError } from '../lib/api';
import { navigate } from '../lib/nav';
import { Icon } from '../components/Icon';
import { GeminiSpark } from '../components/GeminiSpark';

const COPY = {
  short: { title: 'Make a short video from one page', line: 'Choose a photo of a textbook page, or a PDF. For a PDF, we use its first page. The tutor teaches the page, and you get a video with a voice. You can save it or share it.', drop: 'Choose a page', accept: 'image/*,application/pdf', hint: 'a photo or a PDF', choiceLabel: 'Length', choices: [30, 45, 60], unit: 's', def: 45 },
  chapter: { title: 'Make a class film from a chapter', line: 'Choose a chapter PDF. The best pages come alive, and the tutor explains each part. The film ends with questions for your class.', drop: 'Choose a chapter PDF', accept: 'application/pdf,.pdf', hint: 'NCERT chapters work well. We read up to 40 pages.', choiceLabel: 'Parts', choices: [3, 4, 5, 6], unit: '', def: 5 },
} as const;

export function NewJobView({ kind }: { kind: 'short' | 'chapter' }) {
  const c = COPY[kind];
  const [choice, setChoice] = useState<number>(c.def);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(file: File) {
    setBusy(true); setError('');
    try { const job = kind === 'short' ? await startShort(file, choice) : await startChapter(file, choice); navigate(`/app/jobs/${job.id}`, true); }
    catch (e: any) { setError(e instanceof ApiError ? e.message : String(e?.message || e)); setBusy(false); }
  }
  return (
    <div className="page new-page enter-page">
      <div className="page-head"><h1>{c.title}<span className="marker-dot">.</span></h1><p className="lede">{c.line}</p></div>
      <label className={`teach-drop ${busy ? 'busy' : ''}`}>
        <span className="tape" aria-hidden="true" />
        {busy ? <GeminiSpark state="thinking" size={34} /> : <Icon name={kind === 'short' ? 'film' : 'doc'} size={34} />}
        <span className="drop-word">{busy ? 'Uploading' : c.drop}</span>
        <span className="muted">{c.hint}</span>
        <input type="file" accept={c.accept} hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void submit(f); e.target.value = ''; }} />
      </label>
      <div className="parts-pick">
        <span>{c.choiceLabel}</span>
        {c.choices.map((n) => <button key={n} className={`chip ${choice === n ? 'on' : ''}`} onClick={() => setChoice(n)} disabled={busy}>{n}{c.unit}</button>)}
      </div>
      {error && <p className="note" role="alert">{error}</p>}
      <p className="muted small">It keeps working after you close this page. You will find it on your dashboard.</p>
    </div>
  );
}
