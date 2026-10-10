import { useEffect, useState } from 'react';
import { CaptureView } from './views/CaptureView';
import { ExperienceView } from './views/ExperienceView';
import { LibraryView } from './views/LibraryView';
import { useStore } from './lib/store';
import { createExperience, getExperience } from './lib/api';

type Route = { name: 'capture' } | { name: 'experience'; id?: string } | { name: 'library' };

function parseRoute(): Route {
  const p = location.pathname;
  const m = /^\/x\/([^/]+)/.exec(p);
  if (m) return { name: 'experience', id: decodeURIComponent(m[1]!) };
  if (p.startsWith('/library')) return { name: 'library' };
  return { name: 'capture' };
}

export function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const status = useStore((s) => s.status);
  const beginGeneration = useStore((s) => s.beginGeneration);
  const applyEvent = useStore((s) => s.applyEvent);
  const loadRecord = useStore((s) => s.loadRecord);
  const fail = useStore((s) => s.fail);
  const reset = useStore((s) => s.reset);
  const currentId = useStore((s) => s.id);

  const go = (r: Route, url: string) => { history.pushState(null, '', url); setRoute(r); };
  useEffect(() => { const onPop = () => setRoute(parseRoute()); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);

  // open a saved experience by URL
  useEffect(() => {
    if (route.name === 'experience' && route.id === 'new' && status === 'idle') { go({ name: 'capture' }, '/'); return; }
    if (route.name === 'experience' && route.id && route.id !== 'new' && route.id !== currentId && status !== 'generating') {
      getExperience(route.id).then(loadRecord).catch((e) => fail(String(e?.message || e)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  async function onCapture(blob: Blob, preview: string, size: { w: number; h: number }) {
    beginGeneration(preview, size);
    go({ name: 'experience' }, '/x/new');
    try {
      await createExperience(blob, (e) => { applyEvent(e); if (e.type === 'done') history.replaceState(null, '', `/x/${e.experienceId}`); });
    } catch (e: any) { fail(String(e?.message || e)); }
  }

  if (route.name === 'experience') return <ExperienceView onBack={() => { reset(); go({ name: 'capture' }, '/'); }} />;
  if (route.name === 'library') return <LibraryView onOpen={(id) => go({ name: 'experience', id }, `/x/${id}`)} onBack={() => go({ name: 'capture' }, '/')} />;
  return <CaptureView onCapture={onCapture} onLibrary={() => go({ name: 'library' }, '/library')} />;
}
