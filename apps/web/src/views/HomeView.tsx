// The homepage: the cover of a sketchbook. Mostly pictures. A page that is actually alive (the real engine running a
// saved lesson), a wipe between print and the living version, three ways in, a small live preview of the tutor, one
// ask. Nothing here touches the lesson flow; the samples are saved experiences the server curates.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { GeminiSpark } from '../components/GeminiSpark';
import { ScenePreview } from '../components/ScenePreview';
import '../home.css';

type Sample = { id: string; title: string; slider?: string };
type Showcase = { hero: Sample; explore: Sample; ask: Sample };
const FALLBACK: Showcase = {
  hero: { id: '9aee2e9b-606b-4086-bb15-1f872b687149', title: 'Motion and Time', slider: 'L' },
  explore: { id: '26361c93-7794-401c-99a7-9c4c6c9d30c9', title: 'Resistors in Series', slider: 'V' },
  ask: { id: '9aee2e9b-606b-4086-bb15-1f872b687149', title: 'Motion and Time' },
};
const QUESTIONS = ['What is one oscillation?', 'How is the time period measured?', 'Where is the mean position?'];
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

type Props = { onScan: () => void; onPhoto: (file: File) => void; onLibrary: () => void; onReel: () => void; onOpen: (id: string) => void };

export function HomeView({ onScan, onPhoto, onLibrary, onReel, onOpen }: Props) {
  const [show, setShow] = useState<Showcase>(FALLBACK);
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => { fetch('/api/showcase').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.hero?.id) setShow(j); }).catch(() => { /* the fallback samples stay */ }); }, []);
  useReveal(rootRef);
  const photo = <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />;

  return (
    <main ref={rootRef} className="home paper">
      <header className="home-top">
        <div className="wordmark"><span className="mark" />Living Textbook</div>
        <nav className="home-nav">
          <button className="link" onClick={onLibrary}>Saved pages</button>
          <button className="link nav-reel" onClick={onReel}>Make a reel</button>
        </nav>
      </header>

      <section className="hero">
        <Doodles />
        <div className="hero-words reveal">
          <h1>Your textbook,<br /><span className="alive-word">alive<MarkerUnderline /></span><span className="bang">!</span></h1>
          <p className="lede">Point your phone at a page. It moves, it speaks, it answers.</p>
        </div>
        <div className="hero-card-wrap reveal">
          <TiltCard className="hero-card">
            <span className="tape" aria-hidden="true" />
            <ScenePreview id={show.hero.id} slider={show.hero.slider} className="hero-scene" />
            <span className="postit hero-postit"><span className="live-dot" aria-hidden="true" />{show.hero.title}</span>
          </TiltCard>
        </div>
        <div className="hero-actions reveal">
          <button className="primary big" onClick={onScan}><Icon name="camera" size={26} /> Open camera</button>
          <label className="secondary"><Icon name="upload" size={20} /> Use a photo{photo}</label>
          <HeroArrow />
        </div>
      </section>

      <section className="wipe-section">
        <h2 className="reveal">Same page<span className="marker-dot">.</span></h2>
        <div className="reveal"><Wipe /></div>
      </section>

      <section className="ways">
        <div className="ways-grid">
          <Way tag="Learn" rot="-1.5deg" decoration="tape" line="The tutor teaches the page, step by step.">
            <LoopClip src="/home/learn.mp4" poster="/home/learn.jpg" label="The tutor teaching a page about refraction" />
          </Way>
          <Way tag="Explore" rot="1.2deg" decoration="tack" line="Change a value. Watch the page respond.">
            <ScenePreview id={show.explore.id} slider={show.explore.slider} stepEveryMs={9000} />
          </Way>
          <Way tag="Story" rot="-0.8deg" decoration="tape" line="Storybook characters speak their printed lines.">
            <StorySketch />
          </Way>
        </div>
      </section>

      <section className="ask">
        <AskCard sample={show.ask} onOpen={onOpen} />
      </section>

      <section className="final">
        <h2 className="reveal">Point it at a page<span className="marker-dot">.</span></h2>
        <div className="final-actions reveal">
          <button className="primary big" onClick={onScan}><Icon name="camera" size={26} /> Open camera</button>
          <label className="secondary"><Icon name="upload" size={20} /> Use a photo{photo}</label>
          <button className="secondary" onClick={onReel}><Icon name="film" size={20} /> Make a reel</button>
        </div>
        <footer className="home-foot">
          <span className="muted">Built with Gemini on Google Cloud</span>
          <button className="link" onClick={onLibrary}>Saved pages</button>
        </footer>
      </section>
    </main>
  );
}

/** Elements marked .reveal fade and rise once they scroll into view. */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current; if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>('.reveal'));
    if (REDUCED || typeof IntersectionObserver === 'undefined') { items.forEach((i) => i.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { root: el, threshold: 0.15 });
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, [root]);
}

/** A card that leans towards the pointer, like a sheet held up to the light. Touch devices keep it flat. */
function TiltCard({ className = '', children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (REDUCED || COARSE) return;
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(px * 12).toFixed(2)}deg`); el.style.setProperty('--rx', `${(-py * 9).toFixed(2)}deg`);
  };
  const onLeave = () => { const el = ref.current; if (el) { el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg'); } };
  return <div ref={ref} className={`tilt ${className}`} onPointerMove={onMove} onPointerLeave={onLeave}>{children}</div>;
}

/** Print on the left, the living version on the right; the divider sweeps once, then follows the finger. */
function Wipe() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(4);
  const swept = useRef(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (REDUCED || typeof IntersectionObserver === 'undefined') { setPos(66); return; }
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting) || swept.current) return;
      swept.current = true; io.disconnect();
      const t0 = performance.now(), from = 4, to = 66, ms = 1700;
      const tick = (now: number) => { const k = Math.min(1, (now - t0) / ms); const e = 1 - Math.pow(1 - k, 3); setPos(from + (to - from) * e); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, { threshold: 0.55 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const at = (clientX: number) => { const r = ref.current?.getBoundingClientRect(); if (!r) return; swept.current = true; setPos(Math.max(2, Math.min(98, ((clientX - r.left) / r.width) * 100))); };
  return (
    <div ref={ref} className="wipe" style={{ '--pos': `${pos}%` } as CSSProperties}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); at(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons) at(e.clientX); }}>
      <img src="/home/before.jpg" alt="A printed textbook page about Ohm's law" draggable={false} />
      <img className="wipe-after" src="/home/after.jpg" alt="The same page with a moving marker on its graph and live values" draggable={false} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      <div className="wipe-handle" style={{ left: `${pos}%` }} aria-hidden="true"><span className="wipe-knob"><Icon name="knob" size={22} /></span></div>
      <span className="postit wipe-tag left">alive</span>
      <span className="postit wipe-tag right">print</span>
    </div>
  );
}

/** A short muted loop that only plays while on screen. */
function LoopClip({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    if (typeof IntersectionObserver === 'undefined') { v.play().catch(() => {}); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }), { threshold: 0.3 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} className="clip" src={src} poster={poster} muted loop playsInline preload="metadata" aria-label={label} />;
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

/** A dashed pencil arrow from the buttons to the living page (desktop only). */
function HeroArrow() {
  return (
    <svg className="hero-arrow" viewBox="0 0 120 70" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 58 C 30 56, 70 48, 108 14" strokeDasharray="7 7" />
      <path d="M94 12 L 110 12 L 106 28" />
    </svg>
  );
}

/** Scribbles in the margins, drifting a little as the page scrolls. */
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
