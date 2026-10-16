// Everything a reader has made, kept: pages brought to life, short videos and chapter films.
import { useEffect, useState } from 'react';
import { getLibrary, deleteLesson, listJobs, deleteJob, type LibraryItem } from '../lib/api';
import type { Job } from '../lib/types';
import { Link, navigate } from '../lib/nav';
import { Icon } from '../components/Icon';
import { GeminiSpark } from '../components/GeminiSpark';
import { JobCard } from '../components/JobCard';
import { listStories, deleteStory, type Story } from '../lib/stories';

type Tab = 'pages' | 'stories' | 'videos' | 'films';
const TABS: { id: Tab; label: string }[] = [{ id: 'pages', label: 'Pages' }, { id: 'stories', label: 'Stories' }, { id: 'videos', label: 'Short videos' }, { id: 'films', label: 'Chapter films' }];

export function LibraryView() {
  const [tab, setTab] = useState<Tab>(() => { const t = new URLSearchParams(location.search).get('tab'); return t === 'videos' || t === 'films' || t === 'stories' ? t : 'pages'; });
  const [pages, setPages] = useState<LibraryItem[] | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [stories, setStories] = useState<Story[] | null>(null);
  useEffect(() => { getLibrary().then(setPages).catch(() => setPages([])); listJobs().then(setJobs).catch(() => setJobs([])); listStories().then(setStories).catch(() => setStories([])); }, []);
  const pick = (t: Tab) => { setTab(t); history.replaceState(null, '', t === 'pages' ? '/app/library' : `/app/library?tab=${t}`); };
  const shorts = jobs?.filter((j) => j.kind === 'short') ?? [], films = jobs?.filter((j) => j.kind === 'chapter') ?? [];
  const count = { pages: pages?.length, stories: stories?.length, videos: jobs ? shorts.length : undefined, films: jobs ? films.length : undefined };

  return (
    <div className="page library-page enter-page">
      <div className="page-head"><h1>Library<span className="marker-dot">.</span></h1></div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab-chip ${tab === t.id ? 'on' : ''}`} onClick={() => pick(t.id)}>{t.label}{count[t.id] !== undefined ? <span className="count">{count[t.id]}</span> : null}</button>)}
      </div>

      {tab === 'pages' && (pages === null ? <div className="row-wait"><GeminiSpark state="thinking" size={26} /></div> : pages.length === 0 ? (
        <Empty line="Pages you bring to life are kept here." cta="Scan a page" onClick={() => navigate('/scan')} />
      ) : (
        <div className="page-grid">
          {pages.map((p) => (
            <div key={p.id} className="page-card-lib">
              <Link to={`/x/${p.id}`} className="page-open"><img src={p.pageImageUrl} alt="" loading="lazy" /><b>{p.title || p.subject}</b><span className="muted small">{p.subject} · {new Date(p.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></Link>
              <button className="round small del" aria-label={`Delete ${p.title}`} onClick={async () => { if (!confirm(`Delete "${p.title}" from your library?`)) return; await deleteLesson(p.id).catch(() => {}); setPages((xs) => (xs ?? []).filter((x) => x.id !== p.id)); }}><Icon name="trash" size={18} /></button>
            </div>
          ))}
        </div>
      ))}

      {tab === 'stories' && (stories === null ? <div className="row-wait"><GeminiSpark state="thinking" size={26} /></div> : stories.length === 0 ? (
        <Empty line="Story pages you bring to life become a film you can play with: you choose what happens and talk to the characters." cta="Make a story come alive" onClick={() => navigate('/app/new/story')} />
      ) : (
        <div className="page-grid">
          {stories.map((s) => (
            <div key={s.id} className="page-card-lib story-card-lib">
              <Link to={`/story/${s.id}`} className="page-open"><img src={s.film?.poster || s.shots[0]?.keyframeUrl || s.pages[0]?.url} alt="" loading="lazy" /><b>{s.title}</b>
                <span className="muted small">{s.status === 'ready' ? `${s.shots.length} shots${s.reviews.length ? `, reviewed ${s.reviews.length} times` : ''}` : s.status === 'making' ? s.detail : 'Could not be made'} · {new Date(s.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></Link>
              <button className="round small del" aria-label={`Delete ${s.title}`} onClick={async () => { if (!confirm(`Delete "${s.title}"?`)) return; await deleteStory(s.id).catch(() => {}); setStories((xs) => (xs ?? []).filter((x) => x.id !== s.id)); }}><Icon name="trash" size={18} /></button>
            </div>
          ))}
        </div>
      ))}

      {tab !== 'pages' && tab !== 'stories' && (jobs === null ? <div className="row-wait"><GeminiSpark state="thinking" size={26} /></div> : (tab === 'videos' ? shorts : films).length === 0 ? (
        tab === 'videos'
          ? <Empty line="A short video turns one page into a video with a voice. You can save it and share it." cta="Make a short video" onClick={() => navigate('/app/new/short')} />
          : <Empty line="A chapter film turns a whole chapter PDF into a lesson film for your class." cta="Make a chapter film" onClick={() => navigate('/app/new/chapter')} />
      ) : (
        <div className="job-grid">
          {(tab === 'videos' ? shorts : films).map((j) => (
            <div key={j.id} className="job-wrap">
              <JobCard job={j} />
              <button className="round small del" aria-label="Delete" onClick={async () => { if (!confirm('Delete this video?')) return; await deleteJob(j.id).catch(() => {}); setJobs((xs) => (xs ?? []).filter((x) => x.id !== j.id)); }}><Icon name="trash" size={18} /></button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Empty({ line, cta, onClick }: { line: string; cta: string; onClick: () => void }) {
  return <div className="empty-card"><p>{line}</p><button className="primary" onClick={onClick}><Icon name="plus" size={20} /> {cta}</button></div>;
}
