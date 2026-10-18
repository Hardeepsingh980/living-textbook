// Making a story come alive: photos of a story's pages (in reading order) go to the server, a background job starts,
// and the reader lands on the story, which shows how far it got until the film is ready.
import { useEffect, useState } from 'react';
import { ApiError, getJob } from '../lib/api';
import { startStory } from '../lib/stories';
import { navigate } from '../lib/nav';
import { Icon } from '../components/Icon';
import { GeminiSpark } from '../components/GeminiSpark';

export function NewStoryView() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previews = useState(() => new Map<File, string>())[0];
  useEffect(() => () => { for (const u of previews.values()) URL.revokeObjectURL(u); }, [previews]);
  const url = (f: File) => { let u = previews.get(f); if (!u) { u = URL.createObjectURL(f); previews.set(f, u); } return u; };
  const add = (list: FileList | null) => { if (list) setFiles((xs) => [...xs, ...Array.from(list)].slice(0, 6)); };
  async function make() {
    setBusy(true); setError('');
    try {
      const job = await startStory(files);
      // these pages already have a story: open it (the same film everyone sees)
      if ('reused' in job) { navigate(`/story/${job.storyId}`, true); return; }
      // the story gets its id once the job starts; then the story page shows the making
      for (let i = 0; i < 40; i++) { const j = await getJob(job.id, 5000); if (j.storyId) { navigate(`/story/${j.storyId}`, true); return; } if (j.status === 'failed') throw new Error(j.error || 'It could not start'); }
      navigate(`/app/jobs/${job.id}`, true);
    } catch (e: any) { setError(e instanceof ApiError ? e.message : String(e?.message || e)); setBusy(false); }
  }
  return (
    <div className="page new-page enter-page">
      <div className="page-head"><h1>Make a story come alive<span className="marker-dot">.</span></h1>
        <p className="lede">Choose photos of the pages of a story, from a picture book, a story in your English reader or a comic, in reading order (up to six). The pictures start to move, every character gets a voice, and you choose what happens. It takes a few minutes.</p></div>
      <div className="story-pages">
        {files.map((f, i) => (
          <div key={i} className="story-page-thumb"><img src={url(f)} alt={`Page ${i + 1}`} /><span className="postit">{i + 1}</span>
            <button className="round small del" aria-label={`Remove page ${i + 1}`} disabled={busy} onClick={() => setFiles((xs) => xs.filter((_, k) => k !== i))}><Icon name="close" size={16} /></button></div>
        ))}
        {files.length < 6 && (
          <label className={`teach-drop small ${busy ? 'busy' : ''}`}>
            <Icon name={files.length ? 'plus' : 'upload'} size={30} />
            <span className="drop-word">{files.length ? 'Add the next page' : 'Choose the pages'}</span>
            <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          </label>
        )}
      </div>
      <button className="primary big" disabled={!files.length || busy} onClick={make}>{busy ? <><GeminiSpark state="thinking" size={24} /> Starting</> : <><Icon name="film" /> Make the story</>}</button>
      {error && <p className="note" role="alert">{error}</p>}
      <p className="muted small">It keeps working after you close this page. You will find it in your library, under Stories.</p>
    </div>
  );
}
