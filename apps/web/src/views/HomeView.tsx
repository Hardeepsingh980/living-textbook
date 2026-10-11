// The homepage: the cover of a sketchbook, mostly pictures. A phone held over a real book with the app alive on its
// screen (the AR part, first and loudest), clips of it in the room, the same page print-versus-alive with the real
// engine, three ways in, what happens in ten seconds, any page, a page in and a film out, ask the page, and one ask.
// Nothing here touches the lesson flow; the samples are saved experiences the server curates.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { GeminiSpark } from '../components/GeminiSpark';
import { ScenePreview } from '../components/ScenePreview';
import { QrModal } from '../components/QrModal';
import { GoogleButton } from '../components/GoogleButton';
import { useReader, signIn } from '../lib/firebase';
import { navigate } from '../lib/nav';
import { getQuota, type Quota } from '../lib/api';
import { Avatar } from '../components/AppShell';
import '../home.css';

type Sample = { id: string; title: string; slider?: string };
type GalleryItem = { id: string; title: string; subject: string; pageImageUrl: string; verification?: string; moving: number };
type Showcase = { hero: Sample; explore: Sample; ask: Sample; gallery?: GalleryItem[] };
const FALLBACK: Showcase = {
  hero: { id: '9aee2e9b-606b-4086-bb15-1f872b687149', title: 'Motion and Time', slider: 'L' },
  explore: { id: '26361c93-7794-401c-99a7-9c4c6c9d30c9', title: 'Resistors in Series', slider: 'V' },
  ask: { id: '9aee2e9b-606b-4086-bb15-1f872b687149', title: 'Motion and Time' },
};
const QUESTIONS = ['What is one oscillation?', 'How is the time period measured?', 'Where is the mean position?'];
const ROOM = [
  { src: '/home/ar-desk.mp4', poster: '/home/ar-desk.jpg', tag: 'Locked to the page', label: 'Hands holding a phone over the pendulum page; on the screen the app swings the pendulum on the printed figure' },
  { src: '/home/ar-kitchen.mp4', poster: '/home/ar-kitchen.jpg', tag: 'Live values', label: 'A phone over the series-circuit page; on the screen electrons flow along the printed wires and the readouts update' },
  { src: '/home/ar-class.mp4', poster: '/home/ar-class.jpg', tag: 'Any table', label: 'A phone over the distance-time graph page; on the screen the app marks the bus along the printed graph' },
];
const STEPS: { icon: string; word: string }[] = [
  { icon: 'camera', word: 'Point' }, { icon: 'library', word: 'It reads the page' }, { icon: 'layers', word: 'Draws on it' }, { icon: 'sound', word: 'Speaks' }, { icon: 'check', word: 'Checks itself' },
];
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const PHONE = COARSE || (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));

type Props = { onScan: () => void; onPhoto: (file: File) => void; onOpen: (id: string) => void };

export function HomeView({ onScan, onPhoto, onOpen }: Props) {
  const reader = useReader();
  const [quota, setQuota] = useState<Quota | null>(null);
  useEffect(() => { void getQuota().then(setQuota); }, [reader?.uid]);
  const onShort = () => navigate('/app/new/short');
  const onTeach = () => navigate('/app/new/chapter');
  const onProgress = () => (reader ? navigate('/app/progress') : void signIn().catch(() => {}));
  const [show, setShow] = useState<Showcase>(FALLBACK);
  const [qr, setQr] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // ?sample=<id>&slider=<var> previews another saved page in the wipe (used to record the showcase clips)
    const q = new URLSearchParams(location.search); const sample = q.get('sample');
    const override = (sc: Showcase): Showcase => (sample ? { ...sc, hero: { id: sample, title: sc.hero.title, slider: q.get('slider') || undefined } } : sc);
    setShow((sc) => override(sc));
    fetch('/api/showcase').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.hero?.id) setShow(override(j)); }).catch(() => { /* the fallback samples stay */ });
  }, []);
  useReveal(rootRef);
  const tryNow = () => { if (PHONE) onScan(); else setQr(true); };
  const photo = <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />;
  const gallery = show.gallery?.length ? show.gallery : [];

  return (
    <main ref={rootRef} className="home paper">
      <header className="home-top">
        <div className="wordmark"><span className="mark" />Living Textbook</div>
        <nav className="home-nav">
          {reader
            ? <button className="secondary small dash-btn" onClick={() => navigate('/app')}><Avatar small /> <span>Dashboard</span></button>
            : <GoogleButton className="secondary small nav-signin" label="Sign in" />}
          <button className="primary try-small" onClick={tryNow}>Try now</button>
        </nav>
      </header>

      {/* the AR part first: a phone over the real book, the app alive on its screen */}
      <section className="hero">
        <Doodles />
        <div className="hero-words reveal">
          <span className="postit ar-tag"><span className="live-dot" aria-hidden="true" />AR, on the real page</span>
          <h1>Your textbook,<br /><span className="alive-word">alive<MarkerUnderline /></span><span className="bang">!</span></h1>
          <p className="lede">Point your phone at a page. The diagram moves on the page itself, a tutor speaks, and it answers you.</p>
        </div>
        <div className="hero-stage-wrap reveal">
          <Stage />
        </div>
        <div className="hero-actions reveal">
          <button className="primary big" onClick={tryNow}><Icon name="camera" size={26} /> Try now</button>
          <label className="secondary"><Icon name="upload" size={20} /> Use a photo{photo}</label>
          <HeroArrow />
          {!reader && quota && <p className="try-note muted">{quota.remaining > 0 ? `Free to try: ${quota.remaining} ${quota.remaining === 1 ? 'page' : 'pages'} left today.` : 'Today\'s free pages are used up.'} Sign in for more, plus short videos and chapter films.</p>}
        </div>
      </section>

      {/* in the room */}
      <section className="room">
        <h2 className="reveal">In the room<span className="marker-dot">.</span></h2>
        <div className="room-row">
          {ROOM.map((c, i) => (
            <article key={c.src} className="room-card reveal" style={{ '--rot': `${i === 1 ? 1.2 : i === 0 ? -1.6 : -0.6}deg` } as CSSProperties}>
              <LoopClip src={c.src} poster={c.poster} label={c.label} className="room-clip" delay={i * 400} />
              <span className="postit room-tag">{c.tag}</span>
            </article>
          ))}
        </div>
        <p className="fineprint muted">The screen shows the app's own recording; the hands and the room were made with Gemini and Veo.</p>
      </section>

      {/* the same page: print on the right, the real engine on the left */}
      <section className="wipe-section">
        <h2 className="reveal">Same page<span className="marker-dot">.</span></h2>
        <p className="section-line muted reveal">Drag the line. Drag the length.</p>
        <div className="reveal"><WipeLive id={show.hero.id} slider={show.hero.slider} /></div>
      </section>

      {/* three ways in */}
      <section className="ways">
        <div className="ways-grid">
          <Way tag="Learn" rot="-1.5deg" decoration="tape" line="The tutor teaches the page, step by step.">
            <LoopClip src="/home/learn.mp4" poster="/home/learn.jpg" label="The tutor teaching a page about refraction" />
          </Way>
          <Way tag="Explore" rot="1.2deg" decoration="tack" line="Change a value. Watch the page respond.">
            <LoopClip src="/home/explore.mp4" poster="/home/explore.jpg" label="A voltage slider changing the live values on a circuit page" />
          </Way>
          <Way tag="Story" rot="-0.8deg" decoration="tape" line="Storybook characters speak their printed lines.">
            <StorySketch />
          </Way>
        </div>
      </section>

      {/* what happens */}
      <section className="how">
        <h2 className="reveal">Ten seconds<span className="marker-dot">.</span></h2>
        <ol className="pipeline reveal">
          {STEPS.map((s, i) => (
            <li key={s.word} className="step" style={{ '--i': i } as CSSProperties}>
              <span className="step-icon"><Icon name={s.icon} size={30} /></span>
              <span className="step-word">{s.word}</span>
            </li>
          ))}
          <svg className="pipeline-line" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true"><path d="M20 24 C 200 4, 300 40, 500 20 S 800 4, 980 22" /></svg>
        </ol>
      </section>

      {/* any page */}
      {gallery.length > 0 && (
        <section className="gallery">
          <h2 className="reveal">Any page<span className="marker-dot">.</span></h2>
          <div className="marquee reveal" aria-label="Pages brought to life">
            <div className="marquee-track">
              {[...gallery, ...gallery].map((g, i) => (
                <button key={`${g.id}-${i}`} className="page-card" style={{ '--rot': `${((i % 3) - 1) * 1.4}deg` } as CSSProperties} onClick={() => onOpen(g.id)} aria-label={`Open ${g.title}`}>
                  <img src={g.pageImageUrl} alt="" loading="lazy" draggable={false} />
                  <span className="page-title">{g.title}</span>
                  {g.verification && <span className="page-check" title="verified against the page"><Icon name="check" size={16} /></span>}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* a page in, a film out */}
      <section className="film">
        <h2 className="reveal">A page in, a short video out<span className="marker-dot">.</span></h2>
        <div className="film-card reveal">
          <span className="tape" aria-hidden="true" />
          <SoundClip src="/home/reel.mp4" poster="/home/reel.jpg" label="A thirty-second explainer reel of the pendulum page, narrated by the tutor" />
          <span className="postit film-tag">30 s, narrated</span>
        </div>
        <button className="secondary reveal" onClick={onShort}><Icon name="film" size={20} /> Make a short video</button>
      </section>

      <section className="ask">
        <AskCard sample={show.ask} onOpen={onOpen} />
      </section>

      {/* it checks what stuck: the quiz and the reader's progress */}
      <section className="stuck">
        <h2 className="reveal">It checks what stuck<span className="marker-dot">.</span></h2>
        <div className="stuck-row">
          <QuizDemo />
          <ProgressDemo />
        </div>
        <button className="secondary reveal" onClick={onProgress}>{reader ? 'My progress' : 'Sign in to keep your progress'}</button>
      </section>

      {/* for teachers */}
      <section className="teachers">
        <span className="postit teachers-tag reveal">For teachers</span>
        <h2 className="reveal">A chapter in, a film out<span className="marker-dot">.</span></h2>
        <div className="teachers-frame reveal">
          <span className="tape" aria-hidden="true" />
          <LoopClip src="/home/chapter.mp4" poster="/home/chapter.jpg" label="A chapter film: a title card, then each part's lesson beside its key ideas" className="teachers-clip" />
        </div>
        <button className="primary reveal" onClick={onTeach}><Icon name="film" size={22} /> Make a chapter film</button>
      </section>

      <section className="final">
        <div className="final-desk" aria-hidden="true" />
        <h2 className="reveal">Point it at a page<span className="marker-dot">.</span></h2>
        <div className="final-actions reveal">
          <button className="primary big" onClick={tryNow}><Icon name="camera" size={26} /> Try now</button>
          <label className="secondary"><Icon name="upload" size={20} /> Use a photo{photo}</label>
          <button className="secondary" onClick={onShort}><Icon name="film" size={20} /> Make a short video</button>
        </div>
        <footer className="home-foot">
          <span className="muted">Built with Gemini on Google Cloud</span>
          {reader ? <button className="link" onClick={() => navigate('/app')}>Dashboard</button> : <button className="link" onClick={() => void signIn().catch(() => {})}>Sign in</button>}
        </footer>
      </section>

      <QrModal open={qr} url={`${location.origin}/scan`} onClose={() => setQr(false)} onContinue={() => { setQr(false); onScan(); }} />
    </main>
  );
}

/** Elements marked .reveal fade and rise once they scroll into view. */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current; if (!el) return;
    const all = () => Array.from(el.querySelectorAll<HTMLElement>('.reveal:not(.in)'));
    if (REDUCED || typeof IntersectionObserver === 'undefined') { all().forEach((i) => i.classList.add('in')); const mo = new MutationObserver(() => all().forEach((i) => i.classList.add('in'))); mo.observe(el, { childList: true, subtree: true }); return () => mo.disconnect(); }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { root: el, threshold: 0.12 });
    all().forEach((i) => io.observe(i));
    // sections that arrive later (the gallery, once the server answers) are picked up too
    const mo = new MutationObserver(() => all().forEach((i) => io.observe(i)));
    mo.observe(el, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [root]);
}

/** The hero: a photograph of the open book, a drawn phone floating above it with the app on its screen; the phone
 *  and the book drift apart a little under the pointer, the way a camera view separates from the table. */
function Stage() {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (REDUCED || COARSE) return;
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  };
  const leave = () => { const el = ref.current; if (el) { el.style.setProperty('--px', '0'); el.style.setProperty('--py', '0'); } };
  return (
    <div ref={ref} className="hero-stage" onPointerMove={move} onPointerLeave={leave}>
      <div className="desk" />
      <div className="phone-float">
        <div className="phone">
          <span className="phone-notch" aria-hidden="true" />
          <LoopClip src="/home/hero.mp4" poster="/home/hero.jpg" label="The series-circuit page alive on a phone screen: live values, a glowing lamp and the tutor's caption" className="phone-screen" eager />
        </div>
      </div>
      <span className="postit ar-badge" aria-hidden="true"><span className="live-dot" />AR</span>
      <span className="postit hero-postit">Series combination of resistors</span>
    </div>
  );
}

/** Print on the right, the real engine on the left; the divider sweeps once, then follows the finger. */
function WipeLive({ id, slider }: { id: string; slider?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const fixed = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('wipe')) : 0; // ?wipe=<percent> holds the divider (recording aid)
  const [pos, setPos] = useState(fixed || 4);
  const [pageUrl, setPageUrl] = useState('');
  const swept = useRef(!!fixed);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (fixed) return;
    if (REDUCED || typeof IntersectionObserver === 'undefined') { setPos(62); return; }
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting) || swept.current) return;
      swept.current = true; io.disconnect();
      const t0 = performance.now(), from = 4, to = 62, ms = 1700;
      const tick = (now: number) => { const k = Math.min(1, (now - t0) / ms); const e = 1 - Math.pow(1 - k, 3); setPos(from + (to - from) * e); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const at = (clientX: number) => { const r = ref.current?.getBoundingClientRect(); if (!r) return; swept.current = true; setPos(Math.max(2, Math.min(98, ((clientX - r.left) / r.width) * 100))); };
  return (
    <div ref={ref} className="wipe live" style={{ '--pos': `${pos}%` } as CSSProperties}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest('.scene-preview-slider')) return; e.currentTarget.setPointerCapture(e.pointerId); at(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons && !(e.target as HTMLElement).closest('.scene-preview-slider')) at(e.clientX); }}>
      <ScenePreview id={id} slider={slider} className="wipe-scene" onRecord={(r) => setPageUrl(r.page.imageUrl)} />
      {pageUrl && <img className="wipe-print" src={pageUrl} alt="The same page as printed" draggable={false} style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />}
      <div className="wipe-handle" style={{ left: `${pos}%` }} aria-hidden="true"><span className="wipe-knob"><Icon name="knob" size={22} /></span></div>
      <span className="postit wipe-tag left">alive</span>
      <span className="postit wipe-tag right">print</span>
    </div>
  );
}

/** A short muted loop that loads when it is near and plays only while on screen. */
function LoopClip({ src, poster, label, className = '', eager = false, delay = 0 }: { src: string; poster: string; label: string; className?: string; eager?: boolean; delay?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    if (typeof IntersectionObserver === 'undefined') { v.play().catch(() => {}); return; }
    let timer: number | undefined;
    // clips that share a row start a few hundred milliseconds apart, so their decoders do not all spin up in one frame
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { if (v.preload !== 'auto') v.preload = 'auto'; timer = window.setTimeout(() => v.play().catch(() => {}), delay); }
      else { if (timer) clearTimeout(timer); v.pause(); }
    }), { rootMargin: '120px', threshold: 0.2 });
    io.observe(v);
    return () => { io.disconnect(); if (timer) clearTimeout(timer); };
  }, [delay]);
  return <video ref={ref} className={`clip ${className}`} src={src} poster={poster} muted loop playsInline preload={eager ? 'auto' : 'none'} aria-label={label} />;
}

/** A loop with its sound off until the reader asks for it. */
function SoundClip({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);
  useEffect(() => {
    const v = ref.current; if (!v || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { v.preload = 'auto'; v.play().catch(() => {}); } else { v.pause(); } }), { threshold: 0.3 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <div className="sound-clip">
      <video ref={ref} className="clip" src={src} poster={poster} muted={!sound} loop playsInline preload="none" aria-label={label} />
      <button className={`round sound-toggle ${sound ? 'on' : ''}`} onClick={() => { setSound((s) => !s); const v = ref.current; if (v) { v.muted = sound; v.play().catch(() => {}); } }} aria-label={sound ? 'Mute' : 'Hear the tutor'}><Icon name={sound ? 'sound' : 'play'} size={22} /></button>
    </div>
  );
}

function Way({ tag, rot, decoration, line, children }: { tag: string; rot: string; decoration: 'tape' | 'tack'; line: string; children: ReactNode }) {
  return (
    <article className="way-card reveal" style={{ '--rot': rot } as CSSProperties}>
      <span className={decoration} aria-hidden="true" />
      <div className="way-visual">{children}</div>
      <span className="postit way-tag">{tag}</span>
      <p className="way-line">{line}</p>
    </article>
  );
}

/** The quiz as a reader sees it, mid-answer: a real question from the pendulum page. */
function QuizDemo() {
  const options = ['The bob', 'The timer', 'The stand', 'The thread'];
  return (
    <div className="demo-card quiz-demo reveal" aria-label="A quiz question with the right answer marked">
      <span className="tape" aria-hidden="true" />
      <div className="demo-head"><span className="postit">Quiz</span><span className="demo-dots"><i className="done" /><i className="on" /><i /><i /></span></div>
      <h3>What is the small metallic ball of a simple pendulum called?</h3>
      <div className="demo-options">{options.map((o, k) => <div key={o} className={`demo-option ${k === 0 ? 'right' : k === 1 ? 'wrong' : ''}`}><span className="letter">{'ABCD'[k]}</span>{o}{k === 0 && <Icon name="check" size={20} />}{k === 1 && <Icon name="cross" size={20} />}</div>)}</div>
    </div>
  );
}

/** A reader's week at a glance: the tiles and bars of the progress page. */
function ProgressDemo() {
  const bars = [2, 0, 5, 8, 3, 0, 6, 9, 4, 7, 0, 5, 10, 6];
  return (
    <div className="demo-card progress-demo reveal" aria-label="A progress page: pages learned, minutes, quiz accuracy, a streak and two weeks of activity">
      <span className="tack" aria-hidden="true" />
      <div className="demo-tiles"><div><b>12</b>pages</div><div><b>47</b>minutes</div><div><b>83%</b>right</div><div className="hot"><b>4</b>day streak</div></div>
      <div className="demo-bars" aria-hidden="true">{bars.map((b, k) => <span key={k} className={`${b === 0 ? 'zero' : ''} ${k === bars.length - 1 ? 'today' : ''}`} style={{ height: `${Math.max(6, b * 10)}%` }} />)}</div>
      <div className="demo-note"><GeminiSpark size={18} /> Revisit Ohm's law: ask the tutor what happens when the resistance doubles.</div>
    </div>
  );
}

/** Ask the sample page something: the quick model answers from the page's own text; the real tutor is one tap away. */
function AskCard({ sample, onOpen }: { sample: Sample; onOpen: (id: string) => void }) {
  const [text, setText] = useState('');
  const [asked, setAsked] = useState('');
  const [answer, setAnswer] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!answer) { setTyped(''); return; }
    if (REDUCED) { setTyped(answer); return; }
    let i = 0; setTyped('');
    const t = window.setInterval(() => { i += 2; setTyped(answer.slice(0, i)); if (i >= answer.length) clearInterval(t); }, 28);
    return () => clearInterval(t);
  }, [answer]);
  async function ask(q: string) {
    const question = q.trim(); if (!question || busy) return;
    setBusy(true); setError(''); setAnswer(''); setAsked(question); setText('');
    try {
      const r = await fetch('/api/showcase/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: sample.id, question }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'the tutor is busy');
      setAnswer(String(j.answer || ''));
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setBusy(false); }
  }
  const state = busy ? 'thinking' : answer && typed.length < answer.length ? 'speaking' : 'idle';
  return (
    <div className="ask-card reveal">
      <span className="tape" aria-hidden="true" />
      <div className="ask-head"><GeminiSpark state={state} size={30} /><h2>Ask the page</h2></div>
      <p className="ask-sub muted">The sample page is {sample.title}.</p>
      <div className="chips">{QUESTIONS.map((q) => <button key={q} className="chip" onClick={() => ask(q)} disabled={busy}>{q}</button>)}</div>
      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Or ask your own" maxLength={200} aria-label="Your question" />
        <button className="round" type="submit" aria-label="Ask" disabled={busy || !text.trim()}><Icon name="question" /></button>
      </form>
      <div className={`ask-answer ${asked ? 'show' : ''}`} aria-live="polite">
        {!asked && <span className="ask-hint muted">The tutor answers here, from the page.</span>}
        {asked && <span className="ask-you">{asked}</span>}
        {busy && <span className="ask-wait">thinking</span>}
        {error && <span className="ask-error">{error}</span>}
        {typed && <span className="ask-tutor">{typed}{typed.length < answer.length && <span className="caret" aria-hidden="true" />}</span>}
      </div>
      <button className="primary" onClick={() => onOpen(sample.id)}><Icon name="mic" size={22} /> Hear it live</button>
    </div>
  );
}

/** A marker stroke under the word that matters. */
function MarkerUnderline() {
  return <svg viewBox="0 0 200 24" preserveAspectRatio="none" aria-hidden="true"><path d="M4 16 C 40 8, 90 6, 196 12" /><path d="M10 20 C 60 14, 120 16, 180 18" opacity="0.55" /></svg>;
}

/** A dashed pencil arrow from the buttons to the phone (desktop only). */
function HeroArrow() {
  return (
    <svg className="hero-arrow" viewBox="0 0 120 70" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 58 C 30 56, 70 48, 108 14" strokeDasharray="7 7" />
      <path d="M94 12 L 110 12 L 106 28" />
    </svg>
  );
}

/** Scribbles in the margins. */
function Doodles() {
  return (
    <div className="doodles" aria-hidden="true">
      <svg className="doodle star" viewBox="0 0 40 40" fill="currentColor"><path d="M20 3 c 2 9 7 14 16 17 c -9 3 -14 8 -16 17 c -2 -9 -7 -14 -16 -17 c 9 -3 14 -8 16 -17 z" /></svg>
      <svg className="doodle loop" viewBox="0 0 120 60" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M4 40 C 20 10, 40 10, 44 36 S 70 60, 76 30 S 104 6, 116 30" strokeDasharray="6 7" /></svg>
      <svg className="doodle star small" viewBox="0 0 40 40" fill="currentColor"><path d="M20 3 c 2 9 7 14 16 17 c -9 3 -14 8 -16 17 c -2 -9 -7 -14 -16 -17 c 9 -3 14 -8 16 -17 z" /></svg>
    </div>
  );
}

/** A storybook page: a crow on a branch, a fox below, a line being spoken. Drawn, not generated. */
function StorySketch() {
  return (
    <svg className="story-sketch" viewBox="0 0 300 400" fill="none" stroke="#2d2d2d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="A storybook page where a crow speaks to a fox">
      <rect x="14" y="14" width="272" height="372" rx="10" fill="#ffffff" />
      <path d="M30 330 C 80 300, 140 320, 190 300 S 260 290, 274 310 L 274 372 L 30 372 Z" fill="#fdfbf7" />
      <path d="M44 44 h 120 M44 60 h 96 M44 76 h 108" stroke="#2d2d2d" opacity="0.35" strokeWidth="2.5" />
      <path d="M232 70 C 236 110, 236 150, 232 190 M 232 120 C 250 112, 262 100, 270 84 M 232 150 C 214 144, 204 132, 198 116" strokeWidth="4" />
      <g className="crow"><path d="M204 118 C 196 112, 194 100, 202 94 C 210 88, 224 92, 226 102 L 240 100 L 228 106 C 230 116, 218 124, 204 118 Z" fill="#2d2d2d" /><circle cx="214" cy="100" r="2.5" fill="#ffffff" stroke="none" /></g>
      <g className="fox"><path d="M74 300 L 66 272 L 84 284 L 104 284 L 122 272 L 114 300 Z" fill="#ff4d4d" stroke="#2d2d2d" /><path d="M78 300 C 86 318, 102 318, 110 300" fill="#ffffff" /><circle cx="86" cy="292" r="2.5" fill="#2d2d2d" stroke="none" /><circle cx="102" cy="292" r="2.5" fill="#2d2d2d" stroke="none" /><path d="M94 300 l 0 6" /><path d="M114 318 C 150 326, 172 318, 182 302 C 196 310, 196 330, 182 338 C 160 346, 130 342, 114 332 Z" fill="#ff4d4d" /></g>
      <g className="bubble" transform="rotate(-3 120 150)"><path d="M70 130 h 118 a 10 10 0 0 1 10 10 v 30 a 10 10 0 0 1 -10 10 h -70 l -16 18 v -18 h -32 a 10 10 0 0 1 -10 -10 v -30 a 10 10 0 0 1 10 -10 z" fill="#fff9c4" /><path className="wave" d="M86 160 c 8 -14, 14 14, 22 0 s 14 -14, 22 0 s 14 14, 22 0 s 14 -14, 22 0" stroke="#2d5da1" strokeWidth="3.5" /></g>
      <path className="sound" d="M250 86 c 8 6, 8 18, 0 24 M 258 76 c 14 10, 14 34, 0 44" stroke="#2d5da1" />
      <path d="M26 14 c 2 7 7 12 14 14 c -7 2 -12 7 -14 14 c -2 -7 -7 -12 -14 -14 c 7 -2 12 -7 14 -14 z" fill="#ff4d4d" stroke="none" transform="translate(240 330)" />
    </svg>
  );
}
