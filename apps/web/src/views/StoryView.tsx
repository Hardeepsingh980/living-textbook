// A story made alive, played. The page is shown first with its printed picture marked; the picture grows to fill the
// screen and starts to move, and the story plays shot by shot: the book's sentences read by the narrator, the book's
// dialogue acted by each character, captions underneath. At the story's turning point the reader chooses what the
// character does (the other choice is shown as "Imagine...", then the story goes back to the book). At the end the
// reader can talk to a character (Gemini Live, in the character's voice), take a short quiz, or see how the film was
// made and reviewed.
// A page found by the scanner plays on the page itself: the camera stays on, the printed picture is marked, the film
// window grows out of it and follows the page as the phone moves; the words and choices stay on the screen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStory, shown, scannedStory, storyAudio, SILENT_WAV, type Story, type StoryChoice, type StoryLine, type StoryScan, type StoryShot } from '../lib/stories';
import { CameraSession } from '../ar/camera';
import { cornersToMatrix3d, type Corners } from '../ar/PageTracker';
import { LiveTutor, type TutorState } from '../audio/live';
import { navigate } from '../lib/nav';
import { Icon } from '../components/Icon';
import { GeminiSpark } from '../components/GeminiSpark';
import '../story.css';

type Step = { kind: 'shot'; shot: StoryShot; extra: StoryLine[]; tag?: string } | { kind: 'choice'; choice: StoryChoice };
type Phase = 'cover' | 'opening' | 'play' | 'choose' | 'end';
const GAP = 0.4, TAIL = 1.2;
let arPlayers = 0; // the camera stops when the last film on a page closes, unless the reader goes back to scanning
const fetched = new Set<string>();
/** the next clip and its first frame start loading while this shot plays, so the film does not wait between shots */
const prefetch = (...urls: (string | undefined)[]) => { for (const u of urls) if (u && !fetched.has(u)) { fetched.add(u); void fetch(u).catch(() => fetched.delete(u)); } };

export function StoryView({ id }: { id: string }) {
  // the scan is handed over in memory: a reload of this address opens the usual player
  const [scan] = useState<StoryScan | null>(() => {
    const s = scannedStory.current;
    return s && s.match.storyId === id && s.session === CameraSession.current && s.session.stream && new URLSearchParams(location.search).get('ar') === '1' ? s : null;
  });
  useEffect(() => { scannedStory.current = null; }, []);
  const [story, setStory] = useState<Story | null>(scan?.story ?? null);
  const [error, setError] = useState('');
  useEffect(() => {
    let off = false, timer: number | undefined;
    const load = async () => {
      try { const s = await getStory(id); if (off) return; setStory(s); if (s.status === 'making') timer = window.setTimeout(load, 4000); }
      catch (e: any) { if (!off) setError(String(e?.message || e)); }
    };
    if (scan?.story?.status !== 'ready') void load();
    return () => { off = true; clearTimeout(timer); };
  }, [id, scan]);
  if (error) return <div className="story paper-dark"><div className="story-message"><h2>We cannot open this story</h2><p>{error}</p><button className="secondary" onClick={() => navigate('/')}>Home</button></div></div>;
  if (!story) return <div className="story"><div className="story-message"><GeminiSpark state="thinking" size={40} /><p>Opening the story</p></div></div>;
  if (story.status === 'making') return <StoryMaking story={story} />;
  if (story.status === 'failed') return <div className="story"><div className="story-message"><h2>This story could not be made</h2><p>{story.error || story.detail}</p><button className="secondary" onClick={() => navigate('/app/library?tab=stories')}>Back</button></div></div>;
  return <StoryPlayer story={story} scan={scan} />;
}

function StoryMaking({ story }: { story: Story }) {
  const steps = ['reading', 'drawing', 'filming', 'reviewing', 'revising'];
  const at = Math.max(0, steps.indexOf(story.stage));
  return (
    <div className="story">
      <div className="story-message making">
        {story.pages[0] && <img className="making-page" src={story.pages[0].url} alt="" />}
        <h2>{story.title === 'A story' ? 'Making your story' : story.title}</h2>
        <ol className="making-steps">
          {['Reading the story', 'Drawing the cast and the frames', 'Filming and recording the voices', 'Watching the film and reviewing it', 'Fixing what the review found'].map((s, i) => (
            <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''}>{i === at ? <GeminiSpark state="thinking" size={18} /> : <Icon name={i < at ? 'check' : 'clock'} size={16} />}{s}</li>
          ))}
        </ol>
        <p className="muted">{story.detail}. This takes a few minutes. You can leave this page; the story keeps going.</p>
      </div>
    </div>
  );
}

function StoryPlayer({ story, scan }: { story: Story; scan: StoryScan | null }) {
  const names = useMemo(() => Object.fromEntries(story.characters.map((c) => [c.id, c.name])), [story]);
  const canon = useMemo<Step[]>(() => {
    const out: Step[] = [];
    for (const s of story.shots) {
      out.push({ kind: 'shot', shot: s, extra: [] });
      const c = story.choices.find((x) => x.afterShot === s.id);
      if (c) out.push({ kind: 'choice', choice: c });
    }
    return out;
  }, [story]);
  const [phase, setPhase] = useState<Phase>(scan ? 'opening' : 'cover');
  const [queue, setQueue] = useState<Step[]>(canon);
  const [index, setIndex] = useState(0);
  const [shot, setShot] = useState<StoryShot | null>(null);
  const [tag, setTag] = useState<string | undefined>();
  const [caption, setCaption] = useState<StoryLine | null>(null);
  const [choice, setChoice] = useState<StoryChoice | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [talkTo, setTalkTo] = useState<string | null>(null);
  const [quiz, setQuiz] = useState(false);
  const [made, setMade] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const voice = useRef<HTMLAudioElement | null>(null);
  const music = useRef<HTMLAudioElement | null>(null);
  const run = useRef(0);
  const pausedRef = useRef(false);
  const mutedRef = useRef(false);
  const choose = useRef<((o: StoryChoice['options'][number]) => void) | null>(null);

  // the printed picture the film opens with (the cover zooms into it)
  const opening = story.shots.find((s) => s.fromPicture != null);
  const pic = opening?.fromPicture != null ? story.pictures[opening.fromPicture] : undefined;
  const page = story.pages[pic?.page ?? 0];

  const wait = useCallback(async (ms: number, token: number) => {
    const end = performance.now() + ms;
    while (performance.now() < end || pausedRef.current) { if (run.current !== token) return false; await new Promise((r) => setTimeout(r, 60)); }
    return run.current === token;
  }, []);
  const say = useCallback(async (l: StoryLine, token: number) => {
    const a = voice.current;
    setCaption(l);
    if (!a || !l.audioUrl) return wait(Math.max(1500, (l.ms ?? 2500)), token);
    if (music.current) music.current.volume = mutedRef.current ? 0 : 0.07;
    a.src = l.audioUrl; a.muted = mutedRef.current;
    await a.play().catch(() => {});
    await new Promise<void>((res) => {
      const done = () => { a.removeEventListener('ended', done); a.removeEventListener('error', done); clearInterval(watch); res(); };
      const watch = window.setInterval(() => { if (run.current !== token) { a.pause(); done(); } }, 120);
      a.addEventListener('ended', done); a.addEventListener('error', done);
    });
    if (music.current) music.current.volume = mutedRef.current ? 0 : 0.2;
    return run.current === token;
  }, [wait]);

  const playShot = useCallback(async (step: Extract<Step, { kind: 'shot' }>, token: number) => {
    setShot(step.shot); setTag(step.tag); setCaption(null);
    const v = video.current;
    const lines = [...step.shot.lines, ...step.extra];
    const speech = 0.5 + lines.reduce((a, l) => a + (l.ms ?? 2500) / 1000 + GAP, 0);
    if (v && step.shot.clipUrl) {
      if (!v.src.endsWith(step.shot.clipUrl)) { v.src = step.shot.clipUrl; await new Promise<void>((r) => { const t = setTimeout(r, 4000); v.onloadedmetadata = () => { clearTimeout(t); r(); }; }); }
      const clip = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 10;
      v.playbackRate = speech + TAIL > clip ? Math.max(0.78, clip / (speech + TAIL)) : 1;
      v.currentTime = 0; v.volume = 0.35; v.muted = mutedRef.current;
      // a phone that refuses the clip's own sound (no tap yet) still plays the picture
      void v.play().catch(() => { v.muted = true; void v.play().catch(() => {}); });
    }
    if (!(await wait(500, token))) return false;
    for (const l of lines) { if (!(await say(l, token))) return false; if (!(await wait(GAP * 1000, token))) return false; }
    setCaption(null);
    // let the picture finish its movement, at most a little longer
    const until = performance.now() + 2600;
    while (v && !v.ended && v.currentTime < (v.duration || 10) - 0.15 && performance.now() < until) { if (!(await wait(80, token))) return false; }
    return run.current === token;
  }, [say, wait]);

  const ask = useCallback(async (c: StoryChoice, token: number) => {
    setChoice(c); setPhase('choose');
    void say(c.question, token).then(() => setCaption(null));
    const picked = await new Promise<StoryChoice['options'][number]>((res) => { choose.current = res; });
    choose.current = null; setChoice(null); setPhase('play');
    return picked;
  }, [say]);

  const playFrom = useCallback(async (from: number, steps: Step[]) => {
    const token = ++run.current;
    let q = steps;
    for (let i = from; i < q.length; i++) {
      if (run.current !== token) return;
      setIndex(i);
      const step = q[i]!;
      const next = q.slice(i + 1).find((x) => x.kind === 'shot') as Extract<Step, { kind: 'shot' }> | undefined;
      if (next) prefetch(next.shot.clipUrl, next.shot.keyframeUrl);
      if (step.kind === 'choice') for (const o of step.choice.options) if (!o.canon) prefetch(o.shots[0]?.clipUrl, o.shots[0]?.keyframeUrl);
      if (step.kind === 'shot') { if (!(await playShot(step, token))) return; continue; }
      const picked = await ask(step.choice, token);
      if (run.current !== token) return;
      if (!picked.canon && picked.shots[0]) {
        q = [...q.slice(0, i + 1), { kind: 'shot', shot: picked.shots[0], extra: picked.rejoin ? [picked.rejoin] : [], tag: `You chose: ${picked.label}` }, ...q.slice(i + 1)];
        setQueue(q);
      }
    }
    if (run.current === token) { setPhase('end'); setCaption(null); }
  }, [ask, playShot]);

  const begin = () => { setPhase('play'); setQueue(canon); void playFrom(0, canon); };
  const start = () => {
    // sounds can only start from a tap (iOS): make the players now
    voice.current ??= new Audio();
    if (!music.current && story.music?.url) { music.current = new Audio(story.music.url); music.current.loop = true; music.current.volume = 0.2; }
    void music.current?.play().catch(() => {});
    voice.current.src = SILENT_WAV; void voice.current.play().catch(() => {});
    if (scan) { setNeedTap(false); setGrown(true); begin(); return; }
    measureZoom();
    setPhase('opening');
    setTimeout(begin, pic ? 1300 : 200);
  };
  const again = () => { setPhase('play'); setQueue(canon); void playFrom(0, canon); };
  const togglePause = () => {
    const p = !pausedRef.current; pausedRef.current = p; setPaused(p);
    if (p) { video.current?.pause(); voice.current?.pause(); music.current?.pause(); }
    else { if (video.current && !video.current.ended) void video.current.play().catch(() => {}); if (voice.current?.src && !voice.current.ended) void voice.current.play().catch(() => {}); void music.current?.play().catch(() => {}); }
  };
  const toggleMute = () => {
    const m = !mutedRef.current; mutedRef.current = m; setMuted(m);
    if (video.current) video.current.muted = m; if (voice.current) voice.current.muted = m; if (music.current) music.current.volume = m ? 0 : 0.2;
  };
  const openTalk = (cid: string) => { if (!pausedRef.current && phase !== 'end') togglePause(); music.current?.pause(); setTalkTo(cid); };
  const closeTalk = () => { setTalkTo(null); void music.current?.play().catch(() => {}); };
  useEffect(() => () => { run.current++; voice.current?.pause(); music.current?.pause(); }, []);

  // ---------- on the page (a scan): sound readied by the scanner's tap, the film window tracked with the page ----------
  const [needTap, setNeedTap] = useState(false);
  const [grown, setGrown] = useState(false);
  const [arLive, setArLive] = useState(false);
  const [lostLong, setLostLong] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const W = scan?.size.w ?? 1000, H = scan?.size.h ?? 1000;
  useEffect(() => {
    if (!scan) return;
    let off = false;
    voice.current = storyAudio.voice ?? new Audio();
    if (story.music?.url) { const m = storyAudio.music ?? new Audio(); m.src = story.music.url; m.loop = true; m.volume = 0.2; music.current = m; }
    const first = story.shots[0], v = video.current;
    if (v && first?.clipUrl) { v.src = first.clipUrl; v.load(); }
    void (async () => {
      const a = voice.current!; a.src = SILENT_WAV;
      const allowed = await a.play().then(() => true, () => false);
      if (off) return;
      if (!allowed) { setNeedTap(true); return; } // this phone wants a tap before any sound
      void music.current?.play().catch(() => {});
      await new Promise((r) => setTimeout(r, 1300)); // the printed picture is marked, then the film grows out of it
      if (off) return;
      setGrown(true); begin();
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!scan) return;
    const session = scan.session, st = stageRef.current!;
    session.attach(st);
    arPlayers++;
    let live = false, found = false, lostSince: number | null = null;
    session.tracker.onCorners = (c: Corners | null) => {
      const layer = layerRef.current; if (!layer) return;
      if (c) {
        lostSince = null; found = true;
        if (!live) { live = true; setArLive(true); setLostLong(false); }
        const cw = st.clientWidth, ch = st.clientHeight, s = Math.max(cw / session.vw, ch / session.vh);
        const ox = (cw - session.vw * s) / 2, oy = (ch - session.vh * s) / 2;
        const m = cornersToMatrix3d(W, H, c.map((x, i) => (i % 2 === 0 ? x * s + ox : x * s + oy)));
        if (m) layer.style.transform = m;
      } else {
        lostSince ??= performance.now();
        if (live && performance.now() - lostSince > 1800) { live = false; setArLive(false); setLostLong(true); }
      }
    };
    // a page that is not found again stays playable on the photo taken
    const giveUp = window.setTimeout(() => { if (!found) setLostLong(true); }, 4000);
    return () => {
      session.tracker.onCorners = null; clearTimeout(giveUp); arPlayers--;
      setTimeout(() => { if (!arPlayers && location.pathname !== '/scan') session.stop(); }, 0);
    };
  }, [scan, W, H]);
  const [view, setView] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => { const on = () => setView({ w: innerWidth, h: innerHeight }); addEventListener('resize', on); return () => removeEventListener('resize', on); }, []);
  /** the photo taken, whole, between the top bar and the words: where the film plays when the page is out of view */
  const fit = useMemo(() => {
    const top = 70, bottom = 200, s = Math.min((view.w - 24) / W, Math.max(80, view.h - top - bottom) / H);
    return `translate(${(view.w - W * s) / 2}px, ${top + Math.max(0, view.h - top - bottom - H * s) / 2}px) scale(${s})`;
  }, [view, W, H]);
  useEffect(() => { if (lostLong && layerRef.current) layerRef.current.style.transform = fit; }, [lostLong, fit]);
  /** the printed picture in the photo, and the 16:9 film window that grows out of it (inside what the screen shows) */
  const rects = useMemo(() => {
    if (!scan) return null;
    const b = scan.match.box;
    const s = Math.max(view.w / W, view.h / H), visW = Math.min(1, view.w / (W * s)), visH = Math.min(1, view.h / (H * s));
    const x0 = (W * (1 - visW)) / 2 + W * 0.02, x1 = W - x0;
    const y0 = (H * (1 - visH)) / 2 + 70 / s, y1 = H - (H * (1 - visH)) / 2 - 190 / s; // the top bar, the words and buttons
    const pic = b ? { x: (b[1] / 1000) * W, y: (b[0] / 1000) * H, w: ((b[3] - b[1]) / 1000) * W, h: ((b[2] - b[0]) / 1000) * H } : null;
    const cx = pic ? pic.x + pic.w / 2 : W / 2, cy = pic ? pic.y + pic.h / 2 : H * 0.42;
    // at least most of the screen's width, so a small printed picture still opens a film that is easy to watch
    const fw = Math.min(Math.max(pic ? Math.max(pic.w, (pic.h * 16) / 9) : 0, (x1 - x0) * 0.8), x1 - x0, (Math.max(H * 0.2, y1 - y0) * 16) / 9), fh = (fw * 9) / 16;
    const film = { x: Math.min(Math.max(cx - fw / 2, x0), x1 - fw), y: Math.min(Math.max(cy - fh / 2, y0), y1 - fh), w: fw, h: fh };
    return { pic: pic ?? film, film };
  }, [scan, view, W, H]);

  // the cover: the page with its printed picture marked; on start the picture grows to fill the screen
  const pageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<React.CSSProperties>({});
  /** measured at the tap: grow the page so its printed picture fills the screen, centred */
  const measureZoom = () => {
    const el = pageRef.current; if (!el || !pic) return;
    const r = el.getBoundingClientRect();
    const [y0, x0, y1, x1] = pic.box;
    const pw = ((x1 - x0) / 1000) * r.width, ph = ((y1 - y0) / 1000) * r.height;
    const cx = r.left + ((x0 + x1) / 2000) * r.width, cy = r.top + ((y0 + y1) / 2000) * r.height;
    const s = Math.min((innerWidth * 0.94) / pw, (innerHeight * 0.8) / ph);
    setZoom({ transformOrigin: `${(x0 + x1) / 20}% ${(y0 + y1) / 20}%`, transform: `translate(${innerWidth / 2 - cx}px, ${innerHeight / 2 - cy}px) scale(${s})` });
  };

  const steps = queue.filter((s) => s.kind === 'shot').length;
  const done = queue.slice(0, index + 1).filter((s) => s.kind === 'shot').length;
  const header = (
    <header className="story-top">
      <button className="round small" aria-label="Back" onClick={() => { run.current++; history.length > 1 ? history.back() : navigate('/'); }}><Icon name="back" /></button>
      <span className="story-title postit">{story.title}</span>
      <span className="grow" />
      {phase !== 'cover' && <button className="round small" aria-label={muted ? 'Sound on' : 'Sound off'} onClick={toggleMute}><Icon name={muted ? 'soundOff' : 'sound'} /></button>}
      <button className="round small made-button" aria-label="How this film was made" onClick={() => setMade(true)}><GeminiSpark size={20} /></button>
    </header>
  );
  const choiceBox = phase === 'choose' && choice && (
    <div className="story-choice">
      <h2>{shown(choice.question.text)}</h2>
      <div className="choice-options">
        {choice.options.map((o, k) => (
          <button key={o.id} className={`choice-card ${k ? 'b' : 'a'}`} onClick={() => choose.current?.(o)}><span className="choice-letter">{k ? 'B' : 'A'}</span>{o.label}</button>
        ))}
      </div>
    </div>
  );
  const endBox = phase === 'end' && (
    <div className="story-end">
      <h2>The end</h2>
      {story.moral && <p className="moral">{story.moral}</p>}
      <div className="end-actions">
        {story.talk.map((t) => <button key={t.characterId} className="primary" onClick={() => openTalk(t.characterId)}><Icon name="mic" /> Talk to {names[t.characterId]}</button>)}
        {story.quiz.length > 0 && <button className="secondary" onClick={() => setQuiz(true)}><Icon name="question" /> Take the quiz</button>}
        <button className="secondary" onClick={again}><Icon name="replay" /> Watch again</button>
      </div>
      {story.think && <p className="think">{story.think}</p>}
    </div>
  );
  const under = (
    <div className="story-under">
      <div className={`story-caption ${caption ? 'on' : ''}`} aria-live="polite">
        {caption && caption.speaker !== 'narrator' && <span className="speaker">{names[caption.speaker] ?? caption.speaker}</span>}
        {caption && <span className="words">{shown(caption.text)}</span>}
      </div>
      {phase === 'play' && (
        <div className="story-controls">
          <button className="round big" aria-label={paused ? 'Play' : 'Pause'} onClick={togglePause}><Icon name={paused ? 'play' : 'pause'} /></button>
          <div className="story-dots" aria-label={`Part ${done} of ${steps}`}>{Array.from({ length: steps }, (_, i) => <span key={i} className={i < done - 1 ? 'done' : i === done - 1 ? 'on' : ''} />)}</div>
          {story.talk.map((t) => <button key={t.characterId} className="secondary small" onClick={() => openTalk(t.characterId)}><Icon name="mic" size={18} /> {names[t.characterId]}</button>)}
        </div>
      )}
    </div>
  );
  const sheets = (
    <>
      {talkTo && <TalkSheet story={story} characterId={talkTo} onClose={closeTalk} />}
      {quiz && <StoryQuiz story={story} onClose={() => setQuiz(false)} />}
      {made && <MadeSheet story={story} onClose={() => setMade(false)} />}
    </>
  );

  if (scan && rects) {
    const r = grown ? rects.film : rects.pic;
    return (
      <div className={`story ar ${phase} ${lostLong ? 'on-photo' : 'on-camera'}`} style={{ ['--u' as any]: `${W / 1000}px` }}>
        <div ref={stageRef} className="stage">
          <img className="page-photo" src={scan.previewUrl} alt="" style={{ width: W, height: H, transform: fit, opacity: lostLong ? 1 : 0 }} />
          <div ref={layerRef} className={`page-layer ${arLive || lostLong ? '' : 'hidden'}`} style={{ width: W, height: H }}>
            <div className={`ar-film ${grown ? 'grown' : 'opening'}`} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
              <video ref={video} playsInline preload="auto" poster={(shot ?? story.shots[0])?.keyframeUrl} />
            </div>
          </div>
        </div>
        {header}
        {tag && <span className="story-tag ar-tag">{tag}</span>}
        {needTap && <div className="ar-center"><button className="primary big" onClick={start}><Icon name="play" /> Start the story</button></div>}
        {choiceBox}
        {endBox && <div className="ar-center">{endBox}</div>}
        {under}
        {sheets}
      </div>
    );
  }

  return (
    <div className={`story ${phase}`}>
      {header}

      {(phase === 'cover' || phase === 'opening') && (
        <div className="story-cover">
          {page && (
            <div ref={pageRef} className={`cover-page ${phase === 'opening' ? 'zooming' : ''}`} style={phase === 'opening' ? zoom : undefined}>
              <img src={page.url} alt="The page of the book" />
              {pic && <span className="cover-mark" style={{ top: `${pic.box[0] / 10}%`, left: `${pic.box[1] / 10}%`, height: `${(pic.box[2] - pic.box[0]) / 10}%`, width: `${(pic.box[3] - pic.box[1]) / 10}%` }} />}
              {phase === 'opening' && opening?.keyframeUrl && <img className="cover-frame" src={opening.keyframeUrl} alt="" style={pic ? { top: `${pic.box[0] / 10}%`, left: `${pic.box[1] / 10}%`, height: `${(pic.box[2] - pic.box[0]) / 10}%`, width: `${(pic.box[3] - pic.box[1]) / 10}%` } : undefined} />}
            </div>
          )}
          {phase === 'cover' && (
            <div className="cover-card">
              <h1>{story.title}</h1>
              {(story.book || story.credit) && <p className="muted">{[story.credit, story.book].filter(Boolean).join(', ')}</p>}
              <p>This page becomes a short film. You choose what happens, and you can talk to the characters.</p>
              <button className="primary big" onClick={start}><Icon name="play" /> Start the story</button>
            </div>
          )}
        </div>
      )}

      {phase !== 'cover' && phase !== 'opening' && (
        <main className="story-stage">
          <div className="story-screen">
            <video ref={video} playsInline preload="auto" poster={shot?.keyframeUrl} />
            {tag && <span className="story-tag">{tag}</span>}
            {choiceBox}
            {endBox}
          </div>
          {under}
        </main>
      )}

      {sheets}
    </div>
  );
}

/** Talking with a character: Gemini Live in the character's voice, knowing only this story. */
function TalkSheet({ story, characterId, onClose }: { story: Story; characterId: string; onClose: () => void }) {
  const c = story.characters.find((x) => x.id === characterId)!;
  const talk = story.talk.find((t) => t.characterId === characterId);
  const [state, setState] = useState<TutorState>('connecting');
  const [said, setSaid] = useState('');
  const [heard, setHeard] = useState('');
  const [micOff, setMicOff] = useState(false);
  const tutor = useRef<LiveTutor | null>(null);
  useEffect(() => {
    const t = new LiveTutor(`story:${story.id}:${characterId}`, () => ({}), {
      onState: (s) => setState(s),
      onTranscript: (role, text) => { if (role === 'model') { setSaid(text); setHeard(''); } else setHeard(text); },
    });
    tutor.current = t;
    // the character greets first; without a microphone the child can still ask the questions below
    void t.connect().then(() => { t.sendText('The child has just opened the chat. Greet them in character, in one or two short sentences.'); return t.listen().catch(() => setMicOff(true)); }).catch(() => setState('unavailable'));
    return () => { t.stop(); tutor.current = null; };
  }, [story.id, characterId]);
  const listening = state === 'listening';
  return (
    <div className="quiz-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="quiz-card talk-card" role="dialog" aria-label={`Talk to ${c.name}`}>
        <div className="quiz-head"><span className="postit">Talk to {c.name}</span><button className="round small" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
        <div className="talk-state"><GeminiSpark state={state === 'speaking' ? 'speaking' : listening ? 'listening' : state === 'unavailable' ? 'error' : 'thinking'} size={34} />
          <span>{state === 'speaking' ? `${c.name} is talking` : listening ? 'Listening. Ask anything.' : state === 'unavailable' ? 'The voice is not available now.' : micOff && state === 'ready' ? 'Tap a question below' : 'Connecting'}</span></div>
        {said && <p className="talk-said"><b>{c.name}:</b> {said}</p>}
        {heard && <p className="talk-heard">You: {heard}</p>}
        {talk?.suggestions?.length ? (
          <div className="talk-suggest">
            {talk.suggestions.map((s) => <button key={s} className="chip" onClick={() => { setHeard(s); tutor.current?.sendText(s); }}>{s}</button>)}
          </div>
        ) : null}
        <button className={`round big ${listening ? 'on' : ''}`} aria-label={listening ? 'Stop listening' : 'Speak'} onClick={() => { const t = tutor.current; if (!t) return; if (listening) t.mute(); else void t.listen().then(() => setMicOff(false)).catch(() => setMicOff(true)); }}><Icon name={listening ? 'stop' : 'mic'} /></button>
      </div>
    </div>
  );
}

function StoryQuiz({ story, onClose }: { story: Story; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const q = story.quiz[i];
  return (
    <div className="quiz-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="quiz-card" role="dialog" aria-label="Quiz">
        <div className="quiz-head"><span className="postit">Quiz</span><div className="quiz-dots">{story.quiz.map((_, k) => <span key={k} className={k < i ? 'done' : k === i ? 'on' : ''} />)}</div><button className="round small" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
        {q ? (
          <div className="quiz-body">
            <h3 className="quiz-q">{q.q}</h3>
            {q.options.map((o, k) => (
              <button key={o} className={`quiz-option ${picked == null ? '' : k === q.answer ? 'right' : k === picked ? 'wrong' : 'dim'}`} disabled={picked != null}
                onClick={() => { setPicked(k); if (k === q.answer) setScore((s) => s + 1); }}>
                <span className="quiz-letter">{'ABCD'[k]}</span>{o}{picked != null && k === q.answer && <Icon name="check" size={18} />}
              </button>
            ))}
            {picked != null && q.explain && <p className="quiz-why">{q.explain}</p>}
            {picked != null && <button className="primary" onClick={() => { setPicked(null); setI(i + 1); }}>{i + 1 < story.quiz.length ? 'Next' : 'See my score'}</button>}
          </div>
        ) : (
          <div className="quiz-wait"><div className="quiz-score"><b>{score}</b><span>of {story.quiz.length}</span></div><p>{score === story.quiz.length ? 'Every one right.' : 'Well read. Try again any time.'}</p><button className="primary" onClick={onClose}>Back to the story</button></div>
        )}
      </div>
    </div>
  );
}

/** How the film was made: the models, and every version the reviewer watched with its score and what was fixed. */
function MadeSheet({ story, onClose }: { story: Story; onClose: () => void }) {
  return (
    <div className="quiz-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="quiz-card made-card" role="dialog" aria-label="How this film was made">
        <div className="quiz-head"><span className="postit">How it was made</span><button className="round small" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
        <ol className="made-steps">
          <li><b>Read and planned</b> by Gemini 4 Argon from the page: the book's own sentences and dialogue, the cast, the shots and the choice.</li>
          <li><b>Drawn</b> in the book's style by Nano Banana: a cast sheet, then the first frame of every shot.</li>
          <li><b>Filmed</b> by Gemini Omni Flash, one 10-second clip per shot. A shot shown on the page starts from the printed picture.</li>
          <li><b>Voiced</b> by Gemini text-to-speech: a voice and an acting style for each character. Music by Lyria.</li>
          <li><b>Reviewed</b> by Gemini 4 Argon, which watched each version of the film and said what to fix.</li>
        </ol>
        {story.reviews.map((r) => (
          <div key={r.round} className="made-round">
            <div className="made-score"><b>Version {r.round}</b><span className="score-bar"><span style={{ width: `${r.overall * 10}%` }} /></span><b>{r.overall.toFixed(1)}</b></div>
            <p>{r.summary}</p>
            {r.applied?.length ? <p className="muted">Fixed for the next version: {r.applied.join('; ')}.</p> : null}
            {r.filmUrl && <a className="link" href={r.filmUrl} target="_blank" rel="noreferrer">Watch version {r.round}</a>}
          </div>
        ))}
        <p className="muted">Made in {story.shots.length} shots{story.cost?.usd ? `, for about $${story.cost.usd.toFixed(2)} of Google AI` : ''}.</p>
      </div>
    </div>
  );
}
