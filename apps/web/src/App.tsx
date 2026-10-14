import { useCallback, useEffect, useState } from 'react';
import { ScanExperience, type CaptureResult, fileToCapture } from './views/ScanExperience';
import { HomeView } from './views/HomeView';
import { ExperienceView } from './views/ExperienceView';
import { LibraryView } from './views/LibraryView';
import { ProgressView } from './views/ProgressView';
import { DashboardView } from './views/DashboardView';
import { JobView } from './views/JobView';
import { NewJobView } from './views/NewJobView';
import { DevelopersView } from './views/DevelopersView';
import { DocsView } from './views/DocsView';
import { isEmbed, embedKey, embedParent, embedLessonPath, embedScanPath, postToHost } from './lib/embed';
import { AppShell, type Place } from './components/AppShell';
import { SignInGate } from './components/SignInGate';
import { SignInSheet } from './components/SignInSheet';
import { useStore } from './lib/store';
import { createExperience, getExperience, getQuota, ApiError } from './lib/api';
import { navigate } from './lib/nav';
import { currentReader, useReader } from './lib/firebase';

// The journey: the homepage (anyone can try a page, a few a day) → sign in → the app: Home (dashboard), Library,
// Progress, and New (scan, photo, short video, chapter film). Lessons open at /x/<id> for anyone with the link.
type Route =
  | { name: 'home' } | { name: 'capture' } | { name: 'experience'; id?: string }
  | { name: 'app' } | { name: 'library' } | { name: 'progress' } | { name: 'newShort' } | { name: 'newChapter' } | { name: 'job'; id: string }
  | { name: 'developers' } | { name: 'docs' }
  | { name: 'embedLesson'; id: string; fromScanner: boolean } | { name: 'embedScan' };

const LEGACY: Record<string, string> = { '/me': '/app/progress', '/library': '/app/library', '/reel': '/app/new/short', '/teach': '/app/new/chapter' };

function parseRoute(): Route {
  const p = location.pathname.replace(/\/+$/, '') || '/';
  if (LEGACY[p]) { history.replaceState(null, '', LEGACY[p]); return parseRoute(); }
  const x = /^\/x\/([^/]+)/.exec(p); if (x) return { name: 'experience', id: decodeURIComponent(x[1]!) };
  const el = /^\/embed\/lesson\/([^/]+)/.exec(p); if (el) return { name: 'embedLesson', id: decodeURIComponent(el[1]!), fromScanner: new URLSearchParams(location.search).get('from') === 'scan' };
  if (p === '/embed/scan') return { name: 'embedScan' };
  if (p === '/app/developers') return { name: 'developers' };
  if (p === '/developers' || p.startsWith('/developers/')) return { name: 'docs' };
  const j = /^\/app\/jobs\/([^/]+)/.exec(p); if (j) return { name: 'job', id: decodeURIComponent(j[1]!) };
  if (p === '/scan') return { name: 'capture' };
  if (p === '/app') return { name: 'app' };
  if (p === '/app/library') return { name: 'library' };
  if (p === '/app/progress') return { name: 'progress' };
  if (p === '/app/new/short') return { name: 'newShort' };
  if (p === '/app/new/chapter') return { name: 'newChapter' };
  return { name: 'home' };
}

export function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [signinMessage, setSigninMessage] = useState('');
  const reader = useReader();
  const status = useStore((s) => s.status);
  const beginGeneration = useStore((s) => s.beginGeneration);
  const applyEvent = useStore((s) => s.applyEvent);
  const loadRecord = useStore((s) => s.loadRecord);
  const fail = useStore((s) => s.fail);
  const reset = useStore((s) => s.reset);
  const currentId = useStore((s) => s.id);

  useEffect(() => {
    const on = () => setRoute(parseRoute());
    window.addEventListener('popstate', on); window.addEventListener('lb:navigate', on);
    return () => { window.removeEventListener('popstate', on); window.removeEventListener('lb:navigate', on); };
  }, []);
  const home = () => (currentReader() ? '/app' : '/');

  // open a saved lesson by URL
  useEffect(() => {
    const lessonId = route.name === 'experience' || route.name === 'embedLesson' ? route.id : undefined;
    if (lessonId === 'new' && status === 'idle') { navigate(route.name === 'embedLesson' ? embedScanPath() : home(), true); return; }
    if (lessonId && lessonId !== 'new' && lessonId !== currentId && status !== 'generating') {
      getExperience(lessonId).then(loadRecord).catch((e) => { fail(String(e?.message || e)); if (route.name === 'embedLesson') postToHost('error', { code: 'lesson_not_found', message: 'This lesson could not be found.' }); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  const onCapture = useCallback(async ({ blob, previewUrl: preview, size, session }: CaptureResult) => {
    const back = home();
    const embedded = isEmbed(); // the scanner inside a partner's app: the lesson is made with their publishable key
    const signal = beginGeneration(preview, size); // a newer capture or leaving the page aborts this request
    useStore.getState().setMode(session && session.tracker.state !== 'idle' ? 'ar' : 'photo');
    const lessonPath = (id: string) => (embedded ? `${embedLessonPath(id)}${embedLessonPath(id).includes('?') ? '&' : '?'}from=scan` : `/x/${id}`);
    navigate(lessonPath('new'));
    let announced = false;
    try {
      await createExperience(blob, (e) => {
        if (signal.aborted) return;
        applyEvent(e);
        if (e.type === 'ready' || e.type === 'done') {
          history.replaceState(null, '', lessonPath(e.experienceId));
          if (embedded && !announced) {
            announced = true;
            const origin = location.origin, title = useStore.getState().quickPartial?.title ?? '';
            postToHost('lesson.created', { lessonId: e.experienceId, title, lesson: { id: e.experienceId, title, share_url: `${origin}/x/${e.experienceId}`, embed_url: `${origin}/embed/lesson/${e.experienceId}` } });
          }
        }
      }, { signal, embed: embedded ? { key: embedKey() ?? '', parent: embedParent() } : undefined });
      // the stream ended: if no scene ever became usable, say so instead of staying on the loading treatment
      const st = useStore.getState();
      if (!signal.aborted && !st.scene && st.phase !== 'failed') fail('no scene');
    } catch (e: any) {
      if (signal.aborted) return;
      if (embedded && e instanceof ApiError) { postToHost('error', { code: e.code, message: e.message }); fail(`msg:${e.message}`); return; }
      if (e instanceof ApiError && (e.code === 'signin-required' || e.code === 'daily-limit')) { reset(); navigate(back, true); setSigninMessage(e.message); return; }
      fail(String(e?.message || e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onPhoto = (f: File) => { void fileToCapture(f).then((r) => { if (r) void onCapture(r); }); };
  // a signed-out reader who has used today's free pages hears it before taking the photo, not after
  useEffect(() => {
    if (route.name !== 'capture' || reader) return;
    getQuota().then((q) => { if (q && !q.signedIn && q.remaining <= 0) setSigninMessage(`You have used today's ${q.limit} free pages. Sign in to keep going; it is free.`); });
  }, [route.name, reader]);

  const sheet = signinMessage && !reader ? <SignInSheet message={signinMessage} onClose={() => setSigninMessage('')} /> : null;
  const shell = (place: Place, body: React.ReactNode, title?: string, line?: string) => (
    <SignInGate title={title} line={line}><AppShell place={place} onPhoto={onPhoto}>{body}</AppShell>{sheet}</SignInGate>
  );

  switch (route.name) {
    case 'embedLesson': return <ExperienceView embed fromScanner={route.fromScanner} onBack={() => { reset(); navigate(embedScanPath()); }} />;
    case 'embedScan': return <ScanExperience autoStart embed onCapture={onCapture} onBack={() => postToHost('close')} />;
    case 'docs': return <DocsView />;
    case 'developers': return shell('developers', <DevelopersView />, 'Sign in to build with Living Textbook', 'Make API keys, watch usage and copy the code that puts living lessons in your app.');
    case 'experience': return <ExperienceView onBack={() => { reset(); navigate(home()); }} />;
    case 'capture': return <><ScanExperience autoStart onCapture={onCapture} onBack={() => navigate(home())} />{sheet}</>;
    case 'app': return shell('home', <DashboardView onPhoto={onPhoto} />, 'Sign in to your library', 'Everything you make is kept, and anything that takes a while keeps going when you leave.');
    case 'library': return shell('library', <LibraryView />, 'Sign in to see your library');
    case 'progress': return shell('progress', <ProgressView onOpen={(id) => navigate(`/x/${id}`)} onScan={() => navigate('/scan')} />, 'Sign in to see your progress');
    case 'newShort': return shell('new', <NewJobView kind="short" />, 'Sign in to make short videos', 'A page in, a narrated short video out. Free with a Google account.');
    case 'newChapter': return shell('new', <NewJobView kind="chapter" />, 'Sign in to make chapter films', 'A chapter PDF in, a film for the class out. Free with a Google account.');
    case 'job': return shell('job', <JobView id={route.id} />, 'Sign in to see this video');
    default: return <><HomeView onScan={() => navigate(`/scan${location.search}`)} onPhoto={onPhoto} onOpen={(id) => navigate(`/x/${id}`)} />{sheet}</>;
  }
}

