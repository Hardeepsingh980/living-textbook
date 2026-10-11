// The experience, AR-only: the live camera stays on from the first frame; the page layer is warped onto the physical
// page once it is found, and sits on the frozen capture only when there is no camera or the page is lost for a while.
// Nothing is drawn or spoken until the first verified scene has its pictures and the renderer is up; a richer
// version cross-fades in later. From the reveal the tutor narrates the lesson over Gemini Live, moving the scene
// through its steps with the scene tools, listening for the reader all the while; recorded narration is the
// fallback when the live session is not available.
import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore, type AudioClip, type Phase } from '../lib/store';
import { SceneRenderer } from '../render/SceneRenderer';
import { mixer } from '../audio/mixer';
import { SpeechQueue } from '../audio/speech';
import { LiveTutor, type TutorState } from '../audio/live';
import { Theatre } from '../components/Theatre';
import { ValidationStatus } from '../components/ValidationStatus';
import { GeminiSpark, type SparkState } from '../components/GeminiSpark';
import { GenerationOverlay, PHASE_WORDS } from '../components/GenerationOverlay';
import { Icon } from '../components/Icon';
import { CameraSession } from '../ar/camera';
import { cornersToMatrix3d, type Corners, type TrackerState } from '../ar/PageTracker';
import { executeTool, type Scene } from '@living-book/scene';

type Props = { onBack: () => void };
const LOST_TO_PHOTO_MS = 1800;     // a found page that stays lost this long falls back to the frozen capture
const SEARCH_GIVE_UP_MS = 4000;    // a revealed scene whose page was never found shows on the capture after this
const REVEAL_TIMEOUT_MS = 75000;   // generation that produces nothing usable in this time is reported, not waited for
const DEBUG = new URLSearchParams(location.search).has('debug');
const REVIEW = new URLSearchParams(location.search).has('review'); // chrome-free rendering for screenshots and judging
const PRESENT = new URLSearchParams(location.search).has('present'); // whole page, title and captions, no controls: for recordings
const CONTAIN = REVIEW || PRESENT;
const LIVE_LESSON = !REVIEW;       // the tutor narrates over Gemini Live; judging screenshots use the recorded clips
// recordings: when each clip starts (page time), so narration can be mixed into the captured video afterwards
const clipLog: { id: string; url: string; text: string; at: number; durationMs: number }[] = ((window as any).__clipLog ??= []);
const logClip = (c: AudioClip) => { if (PRESENT || REVIEW) clipLog.push({ id: c.id, url: c.url, text: c.text, at: performance.now(), durationMs: c.durationMs }); };

/** The narration clip of a scene version's first step exists (or the step has nothing to say). */
function narrationReady(scene: Scene, version: number, audio: AudioClip[]) {
  const first = scene.steps[0];
  if (!first || !first.narration) return true;
  return audio.some((a) => a.kind === 'narration' && a.stepId === first.id && (a.version ?? 1) === Math.max(1, version));
}

export function ExperienceView({ onBack }: Props) {
  const scene = useStore((s) => s.scene);
  const sceneVersion = useStore((s) => s.sceneVersion);
  const revealedVersion = useStore((s) => s.revealedVersion);
  const markRevealed = useStore((s) => s.markRevealed);
  const verifications = useStore((s) => s.verifications);
  const pendingVersion = useStore((s) => s.pendingVersion);
  const pageImageUrl = useStore((s) => s.pageImageUrl);
  const page = useStore((s) => s.page);
  const assets = useStore((s) => s.assets);
  const audio = useStore((s) => s.audio);
  const status = useStore((s) => s.status);
  const phase = useStore((s) => s.phase);
  const setPhase = useStore((s) => s.setPhase);
  const fail = useStore((s) => s.fail);
  const quick = useStore((s) => s.quickPartial);
  const muted = useStore((s) => s.muted);
  const setMuted = useStore((s) => s.setMuted);
  const theatreOpen = useStore((s) => s.theatreOpen);
  const setTheatre = useStore((s) => s.setTheatre);
  const error = useStore((s) => s.error);
  const trackingInfo = useStore((s) => s.tracking);
  const experienceId = useStore((s) => s.id);

  const stageRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([null, null]); // two slots so a new version can cross-fade over the old one
  const renderers = useRef<(SceneRenderer | null)[]>([null, null]);
  const [activeSlot, setActiveSlot] = useState<number>(-1);
  const activeSlotRef = useRef(-1); // read by callbacks that outlive a render (speech queue, timers, tools)
  const [prepared, setPrepared] = useState<Record<number, boolean>>({}); // renderer initialised and pictures loaded, per version
  const speechRef = useRef(new SpeechQueue());
  const tutorRef = useRef<LiveTutor | null>(null);   // one session per lesson
  const tutorLive = useRef(false);                   // the tutor is narrating: recorded clips stay quiet
  const [pageImg, setPageImg] = useState<HTMLImageElement | null>(null);
  const [caption, setCaption] = useState('');
  const [captionBy, setCaptionBy] = useState<'tutor' | 'you' | 'line'>('tutor');
  const [stepIndex, setStepIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [vars, setVars] = useState<Record<string, number>>({});
  const [knob, setKnob] = useState<string | null>(null);
  const [whatIf, setWhatIf] = useState(false);     // progressive disclosure: knobs appear only when asked for
  const [speaking, setSpeaking] = useState(false);
  const [fit, setFit] = useState({ scale: 1, x: 0, y: 0 });
  const [arState, setArState] = useState<TrackerState>('idle');
  const [arLive, setArLive] = useState(false);
  const [lostLong, setLostLong] = useState(false);
  const [searchGaveUp, setSearchGaveUp] = useState(false);
  const everFound = useRef(false);
  const [tutor, setTutor] = useState<TutorState>('off');
  const [tutorNote, setTutorNote] = useState('');
  const [micOn, setMicOn] = useState(false);
  const [stats, setStats] = useState('');
  const stepTimer = useRef<number | null>(null);
  const lostSince = useRef<number | null>(null);
  const knobTimer = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const session = CameraSession.current;
  const arAvailable = !!session && session.tracker.state !== 'idle';
  const revealed = revealedVersion > 0;
  const report = (event: string, detail = '') => { const id = useStore.getState().id; if (!id || CONTAIN) return; try { void fetch(`/api/experiences/${id}/metrics`, { method: 'POST', body: JSON.stringify({ at: Date.now(), tutor: event, detail: detail.slice(0, 160), ua: navigator.userAgent.slice(0, 80) }), headers: { 'content-type': 'application/json' }, keepalive: true }); } catch { /* best effort */ } };

  // ---------- page image (crops + fallback background) ----------
  useEffect(() => {
    if (!pageImageUrl) return;
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => setPageImg(img);
    img.src = pageImageUrl;
  }, [pageImageUrl]);

  // ---------- a renderer per scene version, prepared offscreen in its own slot ----------
  const active = () => (activeSlotRef.current >= 0 ? renderers.current[activeSlotRef.current] : null);
  const say = (text: string, by: 'tutor' | 'you' | 'line' = 'tutor') => { setCaption(text); setCaptionBy(by); };
  useEffect(() => {
    if (!scene || !pageImg || sceneVersion < 1) return;
    const slot = sceneVersion % 2;
    const canvas = canvasRefs.current[slot]; if (!canvas) return;
    let cancelled = false;
    const r = new SceneRenderer({ scene, pageImage: pageImg, assetUrls: assets });
    renderers.current[slot]?.destroy();
    renderers.current[slot] = r;
    r.init(canvas).then(() => {
      if (cancelled) { r.destroy(); return; }
      r.runtime.on((e) => {
        if (renderers.current[slot] !== r || activeSlotRef.current !== slot) return;
        if (e.type === 'say') playLine(e.lineId);
        if (e.type === 'sfx') mixer.sfx(e.name);
        if (e.type === 'step') { setStepIndex(e.index); if (!tutorLive.current) narrateStep(scene, e.index); else showStepLines(scene, e.index); }
        if (e.type === 'play' && !e.playing && !pausedRef.current) {
          // simulation reached the end of its time range: breathe, then run again
          const tv = scene.vars.find((v) => v.role === 'time');
          if (tv && (r.runtime.getVar(tv.id) ?? 0) >= tv.max) window.setTimeout(() => { if (!pausedRef.current && renderers.current[slot] === r) { r.runtime.resetTime(); r.runtime.setPlaying(true); } }, 1200);
        }
      });
      const done = () => { if (renderers.current[slot] === r) { document.documentElement.dataset.assetsReady = '1'; setPrepared((m) => ({ ...m, [sceneVersion]: true })); } };
      if (r.pendingAssets <= 0) done();
      else { document.documentElement.dataset.assetsReady = '0'; const wait = window.setInterval(() => { if (r.pendingAssets <= 0 || renderers.current[slot] !== r) { clearInterval(wait); done(); } }, 150); }
    }).catch((e) => { console.error('[scene] renderer failed', e); if (!revealed) fail('renderer'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, sceneVersion, pageImg]);
  // pictures that arrive after the renderer was built
  useEffect(() => { for (const r of renderers.current) if (r) void Promise.all(Object.entries(assets).map(([id, url]) => r.addAsset(id, url))); }, [assets]);
  useEffect(() => { mixer.setMuted(muted || CONTAIN); tutorRef.current?.setOutputMuted(muted || pausedRef.current); }, [muted]);
  useEffect(() => { const id = window.setInterval(() => setSpeaking((s) => (s === speechRef.current.busy ? s : speechRef.current.busy)), 250); return () => clearInterval(id); }, []);
  useEffect(() => () => { speechRef.current.clear(); for (const r of renderers.current) r?.destroy(); mixer.destroy(); CameraSession.current?.stop(); tutorRef.current?.stop(); }, []);

  // ---------- the reveal: only a version that is verified, voiced and drawn becomes visible ----------
  const ver = scene ? verifications[sceneVersion] : undefined;
  const validated = !!scene && sceneVersion >= 1 && !!ver && !!prepared[sceneVersion] && narrationReady(scene, sceneVersion, audio);
  useEffect(() => {
    if (!validated || !scene || sceneVersion <= revealedVersion) return;
    const slot = sceneVersion % 2, other = 1 - slot;
    const old = renderers.current[other];
    const prevStep = revealedVersion > 0 && old ? old.runtime.stepIndex : -1; // a richer version continues from the same step
    activeSlotRef.current = slot;
    setActiveSlot(slot);
    markRevealed(sceneVersion);
    const r = renderers.current[slot];
    if (r) {
      setVars(Object.fromEntries(scene.vars.map((v) => [v.id, r.runtime.getVar(v.id) ?? v.init])));
      r.runtime.resetTime();
      const step = prevStep >= 0 ? Math.min(prevStep, scene.steps.length - 1) : 0;
      if (scene.steps.length) r.runtime.goToStep(step, true);
      setStepIndex(Math.max(0, r.runtime.stepIndex));
      if (scene.audio.ambience) mixer.setAmbience(scene.audio.ambience);
      const tv = scene.vars.find((v) => v.role === 'time');
      if (tv && !scene.steps.some((s) => s.play !== undefined)) r.runtime.setPlaying(true);
      if (revealedVersion > 0 && !tutorLive.current && !pausedRef.current) startNarration(scene, Math.max(0, r.runtime.stepIndex)); // a richer version in the recorded-clip path
    }
    if (old) window.setTimeout(() => { if (renderers.current[other] === old) { old.destroy(); renderers.current[other] = null; } }, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validated, sceneVersion]);
  // a richer version that is verified takes over while the tutor is between sentences (or at a loop boundary otherwise)
  useEffect(() => {
    if (!pendingVersion || !tutorLive.current) return;
    const st = useStore.getState();
    if (st.pendingScene && st.verifications[st.pendingVersion] && (tutor === 'ready' || tutor === 'listening')) st.applyPendingScene();
  }, [pendingVersion, tutor, verifications]);
  // generation that never becomes usable is reported instead of leaving the loading treatment on forever
  useEffect(() => {
    if (revealed || status === 'error') return;
    const id = window.setTimeout(() => { if (!useStore.getState().revealedVersion && useStore.getState().phase !== 'failed') fail('timeout'); }, REVEAL_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [revealed, status, fail]);

  // the tutor's session opens as soon as the experience has an id (its provisional record exists), so the lesson can start the moment the scene is revealed
  useEffect(() => { if (LIVE_LESSON && experienceId && !REVIEW) { const t = ensureTutor(); t?.connect().catch(() => { /* the reveal retries and falls back */ }); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experienceId]);

  // the first reveal starts the lesson, as soon as the experience has an id (its record exists for the tutor)
  const lessonStarted = useRef(false);
  useEffect(() => {
    if (!revealed || !scene || lessonStarted.current) return;
    if (LIVE_LESSON && !experienceId) return; // the id arrives a moment after the verification; wait for it
    lessonStarted.current = true;
    startLesson(scene);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, experienceId]);

  // the lesson keeps moving: when the tutor has finished a step and gone quiet, it is asked to carry on (unless the
  // lesson is over, paused, or the reader is in the middle of something)
  useEffect(() => {
    if (!tutorLive.current || !revealed || !scene || paused) return;
    if (!(tutor === 'ready' || tutor === 'listening') || stepIndex >= scene.steps.length - 1) return;
    const id = window.setTimeout(() => { const t = tutorRef.current; if (t && (t.current === 'ready' || t.current === 'listening') && !pausedRef.current) t.sendText('continue'); }, 3000);
    return () => clearTimeout(id);
  }, [tutor, stepIndex, revealed, scene, paused]);

  // ---------- the lesson: the tutor narrates over Gemini Live and drives the steps; recorded clips are the fallback ----------
  function startLesson(sc: Scene) {
    if (!LIVE_LESSON || !experienceId) { startNarration(sc, 0); return; }
    const t = ensureTutor(); if (!t) { startNarration(sc, 0); return; }
    tutorLive.current = true;
    say(sc.steps[0]?.narration ?? '', 'tutor');
    (async () => {
      try {
        await t.connect();
        setPhase('live');
        t.beginLesson();
        report('lesson-begun');
        if (!CONTAIN) t.listen().then(() => setMicOn(true)).catch((e: any) => { setTutorNote(/NotAllowed|denied/i.test(String(e?.message || e?.name)) ? 'microphone not allowed' : ''); report('mic-failed', String(e?.message || e?.name)); });
      } catch (e) {
        console.warn('[tutor] live lesson unavailable, using recorded narration', e);
        report('live-failed', String((e as any)?.message || e));
        tutorLive.current = false; setTutor('unavailable'); setTutorNote('voice unavailable');
        startNarration(sc, Math.max(0, active()?.runtime.stepIndex ?? 0));
      }
    })();
  }
  function showStepLines(sc: Scene, index: number) {
    // in a live lesson the characters' printed lines appear as bubbles while the tutor tells the story
    const s = sc.steps[index]; if (!s) return;
    (s.say ?? []).forEach((l, i) => window.setTimeout(() => active()?.sayBubble(l.el, l.text, 2500 + l.text.length * 70), i * 2600));
  }

  // ---------- recorded narration (fallback and review mode): steps in order, looping ----------
  const clipFor = useCallback((pred: (a: AudioClip) => boolean) => { const st = useStore.getState(); const v = Math.max(1, st.revealedVersion || st.sceneVersion); return st.audio.find((a) => (a.version ?? 1) === v && pred(a)); }, []);
  useEffect(() => {
    // narration for the current step may arrive after the step started
    const sc = scene; const s = sc?.steps[stepIndex];
    if (revealed && sc && s && !tutorLive.current && !speechRef.current.busy && !pausedRef.current) startNarration(sc, stepIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio]);
  function startNarration(sc: Scene, index: number) {
    if (tutorLive.current) return;
    const s = sc.steps[index]; if (!s) return;
    const q = speechRef.current;
    if (q.busy) return;
    const items = [] as { clip: AudioClip; onStart?: () => void }[];
    const narration = clipFor((a) => a.kind === 'narration' && a.stepId === s.id);
    if (narration) items.push({ clip: narration, onStart: () => { say(narration.text); logClip(narration); } });
    else if (s.narration) say(s.narration);
    (s.say ?? []).forEach((l, i) => { const c = clipFor((a) => a.id === `say-${s.id}-${i}` && a.text === l.text) ?? clipFor((a) => a.kind === 'line' && a.text === l.text); if (c) items.push({ clip: c, onStart: () => { say(`${l.speaker}: ${l.text}`, 'line'); logClip(c); active()?.sayBubble(l.el, l.text, c.durationMs); } }); });
    if (!items.length) { scheduleAdvance(sc, index, (s.dur ?? 3) * 1000); return; }
    q.onIdle = () => scheduleAdvance(sc, index, (s.dur ?? 1) * 1000);
    q.enqueue(...items);
  }
  function scheduleAdvance(sc: Scene, index: number, waitMs: number) {
    if (stepTimer.current) clearTimeout(stepTimer.current);
    stepTimer.current = window.setTimeout(() => {
      const r = active(); if (!r || pausedRef.current || r.runtime.stepIndex !== index || tutorLive.current) return;
      if (index + 1 < sc.steps.length) r.runtime.nextStep();
      else { // loop: a breath, then from the top; a richer version that is verified and voiced takes over here
        stepTimer.current = window.setTimeout(() => {
          if (pausedRef.current || active() !== r || tutorLive.current) return;
          const st = useStore.getState();
          if (st.pendingScene && st.verifications[st.pendingVersion] && narrationReady(st.pendingScene, st.pendingVersion, st.audio)) { st.applyPendingScene(); return; } // the reveal effect cross-fades it in
          r.runtime.resetTime(); r.runtime.goToStep(0);
        }, 2500);
      }
    }, waitMs);
  }
  function narrateStep(sc: Scene, index: number) { speechRef.current.clear(); if (stepTimer.current) clearTimeout(stepTimer.current); startNarration(sc, index); }
  function playLine(lineId: string) {
    const l = scene?.audio.lines.find((x) => x.id === lineId);
    if (tutorLive.current) { if (l) { say(`${l.speaker}: ${l.text}`, 'line'); active()?.sayBubble(l.el, l.text, 2500 + l.text.length * 70); } return; }
    const clip = clipFor((a) => a.id === `line-${lineId}`);
    if (clip) speechRef.current.enqueue({ clip, onStart: () => { say(`${clip.speaker ?? ''}: ${clip.text}`, 'line'); logClip(clip); active()?.sayBubble(l?.el, clip.text, clip.durationMs); } });
    else if (l) say(`${l.speaker}: ${l.text}`, 'line');
  }
  function togglePause() {
    const r = active(); if (!r) return;
    const next = !paused; setPaused(next); pausedRef.current = next;
    if (next) { speechRef.current.clear(); if (stepTimer.current) clearTimeout(stepTimer.current); r.runtime.setPlaying(false); tutorRef.current?.setOutputMuted(true); }
    else { tutorRef.current?.setOutputMuted(muted); if (tutorLive.current) tutorRef.current?.sendText('continue'); else if (scene) startNarration(scene, r.runtime.stepIndex); if (scene?.vars.some((v) => v.role === 'time')) r.runtime.setPlaying(true); }
  }
  function replay() {
    const r = active(); if (!r || !scene) return;
    setPaused(false); pausedRef.current = false; tutorRef.current?.setOutputMuted(muted);
    r.runtime.resetTime(); speechRef.current.clear(); r.runtime.goToStep(0); setStepIndex(0);
    if (scene.vars.some((v) => v.role === 'time')) r.runtime.setPlaying(true);
    if (tutorLive.current) tutorRef.current?.sendText('replay');
  }
  function nextStep() {
    const r = active(); if (!r || !scene) return;
    if (r.runtime.stepIndex + 1 < scene.steps.length) { r.runtime.nextStep(); if (tutorLive.current) tutorRef.current?.sendText(`continue from step ${r.runtime.stepIndex + 1}`); }
    else replay();
  }

  // ---------- the tutor: one live session per lesson; the microphone pill turns listening on and off ----------
  const runTool = useCallback((name: string, args: Record<string, unknown>) => {
    const r = active(); if (!r) return { ok: false, reason: 'the scene is not ready yet' };
    const result = executeTool(r.runtime, name, args);
    if (name === 'set_parameter' && result.ok) { setVars(Object.fromEntries(r.runtime.scene.vars.map((v) => [v.id, r.runtime.getVar(v.id) ?? v.init]))); touchKnob(String(result.parameter)); }
    if (name === 'navigate_to_step' && result.ok) setStepIndex(r.runtime.stepIndex);
    if (name === 'reset_simulation' && result.ok) { setVars(Object.fromEntries(r.runtime.scene.vars.map((v) => [v.id, v.init]))); setStepIndex(0); }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot]); // re-created when the active slot changes so the tool executor sees the current renderer
  const runToolRef = useRef(runTool); runToolRef.current = runTool;
  function ensureTutor() {
    if (tutorRef.current || !experienceId) return tutorRef.current;
    const t = new LiveTutor(experienceId, () => ({ ...(active()?.runtime.values() ?? {}) }), {
      onState: (st, detail) => {
        setTutor(st); setTutorNote(detail ?? ''); setMicOn(t.listening);
        if (st === 'unavailable' || st === 'reconnecting' || st === 'listening' || st === 'speaking') report(`tutor-${st}`, detail ?? '');
        if (st === 'unavailable' && tutorLive.current) { tutorLive.current = false; setPhase('ready'); const sc = useStore.getState().scene; if (!pausedRef.current && sc) startNarration(sc, active()?.runtime.stepIndex ?? 0); }
      },
      onTranscript: (role, text) => say(text, role === 'user' ? 'you' : 'tutor'),
      onTool: (name, args) => runToolRef.current(name, args),
    });
    tutorRef.current = t;
    return t;
  }
  async function toggleMic() {
    const t = ensureTutor(); if (!t) return;
    if (t.listening) { t.mute(); setMicOn(false); return; }
    if (!tutorLive.current) { speechRef.current.clear(); if (stepTimer.current) clearTimeout(stepTimer.current); }
    try { await t.listen(); setMicOn(true); setPhase('live'); if (!tutorLive.current) say('I am listening. Ask me anything about this page.'); }
    catch (e: any) { setTutorNote(/NotAllowed|denied/i.test(String(e?.message || e?.name)) ? 'microphone not allowed' : 'voice not available'); setMicOn(false); }
  }
  useEffect(() => { tutorRef.current?.sendState(); }, [vars]);

  // ---------- AR: live video + tracked warp ----------
  useEffect(() => {
    if (!session || !arAvailable) return;
    const st = stageRef.current!;
    session.attach(st);
    session.tracker.onCorners = (c: Corners | null, state: TrackerState) => {
      setArState((prev) => (prev === state ? prev : state));
      const layer = layerRef.current; if (!layer || !page) return;
      if (c) {
        lostSince.current = null; everFound.current = true;
        if (!arLive) setArLive(true);
        setLostLong(false); setSearchGaveUp(false);
        const cw = st.clientWidth, ch = st.clientHeight, s = Math.max(cw / session.vw, ch / session.vh);
        const ox = (cw - session.vw * s) / 2, oy = (ch - session.vh * s) / 2;
        const css = c.map((v, i) => (i % 2 === 0 ? v * s + ox : v * s + oy));
        const m = cornersToMatrix3d(page.w, page.h, css);
        if (m) layer.style.transform = m;
      } else {
        lostSince.current ??= performance.now();
        if (arLive && performance.now() - lostSince.current > LOST_TO_PHOTO_MS) { setArLive(false); setLostLong(true); }
      }
      if (DEBUG) setStats(`${session.tracker.fps} fps · ${session.tracker.trackedPts} pts · ${state}`);
    };
    return () => { session.tracker.onCorners = null; };
  }, [session, arAvailable, page, arLive]);
  // a scene revealed before the page has been found shows on the capture right away (and moves to the camera once
  // the page is found); a page that is never found is simply read on the capture
  useEffect(() => {
    if (!revealed || !arAvailable || everFound.current) return;
    setSearchGaveUp(true);
    const id = window.setTimeout(() => { if (!everFound.current) setSearchGaveUp(true); }, SEARCH_GIVE_UP_MS);
    return () => clearTimeout(id);
  }, [revealed, arAvailable]);
  // AR metrics for evaluation: every 10 s and when leaving, the tracker's counters are stored with the experience
  useEffect(() => {
    if (!session || !arAvailable || !experienceId) return;
    const send = (final = false) => {
      const t = session.tracker;
      const body = JSON.stringify({ at: Date.now(), final, fps: t.fps, state: t.state, trackedPts: t.trackedPts, kf: t.kf, ...t.metrics, ua: navigator.userAgent.slice(0, 120), video: `${session.vw}x${session.vh}` });
      try { if (final && navigator.sendBeacon) navigator.sendBeacon(`/api/experiences/${experienceId}/metrics`, new Blob([body], { type: 'application/json' })); else void fetch(`/api/experiences/${experienceId}/metrics`, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }); } catch { /* best effort */ }
    };
    const id = window.setInterval(() => send(false), 10000);
    const onHide = () => { if (document.visibilityState === 'hidden') send(true); };
    document.addEventListener('visibilitychange', onHide);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide); send(true); };
  }, [session, arAvailable, experienceId]);
  useEffect(() => {
    if (!session || !trackingInfo?.url || !arAvailable) return;
    fetch(trackingInfo.url).then((r) => r.arrayBuffer()).then((b) => session.tracker.loadDetectionData(b)).catch(() => {});
  }, [session, trackingInfo, arAvailable]);

  // presentation: the live camera unless there is none, or the page was lost for a while, or it was never found
  const onPhoto = !arAvailable || lostLong || searchGaveUp;
  const layerPlaced = onPhoto || arLive; // in camera mode the layer has a transform only once the page has been found
  const computeFit = useCallback(() => {
    const st = stageRef.current; if (!st || !page) return;
    const cw = st.clientWidth, ch = st.clientHeight, { w, h } = page;
    const scale = CONTAIN ? Math.min(cw / w, ch / h) : Math.max(cw / w, ch / h); // review and presentation modes: the whole page
    setFit({ scale, x: (cw - w * scale) / 2, y: (ch - h * scale) / 2 });
  }, [page]);
  useEffect(() => { computeFit(); window.addEventListener('resize', computeFit); return () => window.removeEventListener('resize', computeFit); }, [computeFit]);

  const r = active();
  const sliders = scene?.interactions.filter((i) => i.type === 'slider') ?? [];
  const fitTransform = `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`;
  const working = !revealed && status !== 'error';
  const phrase = working ? (PHASE_WORDS[phase as Phase] || 'Bringing it to life') : '';
  const showKnob = knob ? scene?.vars.find((v) => v.id === knob) : undefined;
  const touchKnob = (id: string) => { setKnob(id); setWhatIf(true); if (knobTimer.current) clearTimeout(knobTimer.current); knobTimer.current = window.setTimeout(() => { setKnob(null); setWhatIf(false); }, 10000); };
  const toggleWhatIf = () => { if (whatIf) { setWhatIf(false); setKnob(null); if (knobTimer.current) clearTimeout(knobTimer.current); } else if (sliders[0]?.type === 'slider') touchKnob(sliders[0].var); };
  const spark: SparkState = status === 'error' || tutor === 'unavailable' ? 'error' : tutor === 'listening' && !speaking ? 'listening' : tutor === 'speaking' || speaking ? 'speaking' : tutor === 'thinking' || tutor === 'acting' || tutor === 'connecting' || tutor === 'reconnecting' || working ? 'thinking' : 'idle';
  const micLabel = tutor === 'unavailable' ? (tutorNote === 'microphone not allowed' ? 'Mic off' : 'Voice off') : tutor === 'reconnecting' ? 'Reconnecting' : tutor === 'connecting' ? 'One moment' : tutor === 'acting' ? 'Changing it' : tutor === 'thinking' ? 'Thinking' : micOn ? (tutor === 'speaking' ? 'Interrupt' : 'Listening') : 'Ask';
  const title = quick?.title || quick?.subject || '';
  const mainFigure = quick?.figures?.[0]?.box as [number, number, number, number] | undefined;
  const errorText = /^(camera|network|fetch|server)/i.test(error ?? '') ? 'The connection dropped while the page was being prepared.' : error === 'timeout' || error === 'no scene' || error === 'renderer' ? "I couldn't build this lesson safely yet. You can retry, or point at the main illustration or diagram." : "I couldn't confidently read this page. Try moving closer, with the whole page in the frame.";
  const captionParts = captionBy === 'line' && /^([^:]{1,24}): (.+)$/s.test(caption) ? { who: caption.split(': ')[0]!, text: caption.slice(caption.indexOf(': ') + 2) } : null;

  return (
    <div className={`experience ${onPhoto ? 'on-photo' : 'on-camera'} ${arLive && revealedVersion > 0 ? 'found' : ''} ${revealed ? 'revealed' : 'working'} ${PRESENT ? 'present' : ''}`}>
      <div ref={stageRef} className="stage" onClick={() => mixer.unlock()}>
        {pageImageUrl && page && <img className="page-photo" src={pageImageUrl} alt="" style={{ transform: fitTransform, width: page.w, height: page.h, opacity: onPhoto ? 1 : 0 }} />}
        <div ref={layerRef} className={`page-layer ${layerPlaced ? '' : 'hidden'}`} style={{ width: page?.w, height: page?.h, ...(onPhoto ? { transform: fitTransform } : {}) }}>
          <canvas ref={(el) => { canvasRefs.current[0] = el; }} className={`page-canvas ${activeSlot === 0 ? 'active' : ''}`} />
          <canvas ref={(el) => { canvasRefs.current[1] = el; }} className={`page-canvas ${activeSlot === 1 ? 'active' : ''}`} />
          {working && page && layerPlaced && !REVIEW && <GenerationOverlay phase={phase} page={page} figure={mainFigure} />}
        </div>
        {working && !layerPlaced && !REVIEW && <GenerationOverlay phase={phase} page={page ?? { w: 1000, h: 1400 }} title={title} floating />}
        {status === 'error' && <div className="error-card enter"><b>I couldn't bring this page to life yet.</b><div className="muted">{errorText}</div><button className="primary" onClick={onBack}>Try again</button></div>}
        {arAvailable && !arLive && revealed && status !== 'error' && arState !== 'idle' && everFound.current && <div className="ar-hint note-pill">Point the camera at the page</div>}
      </div>

      {!REVIEW && <div className={`top-bar ${PRESENT ? 'present' : ''}`}>
        {!PRESENT && <button className="round" onClick={onBack} aria-label="Back"><Icon name="back" /></button>}
        {phrase || title ? <div className={`title-pill ${phrase ? 'working' : ''}`}>{phrase ? <GeminiSpark state="thinking" size={18} /> : null}<span>{phrase || title}</span></div> : <div className="spacer" />}
        {!PRESENT && <button className="round small" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'}><Icon name={muted ? 'soundOff' : 'sound'} size={20} /></button>}
        {!PRESENT && <button className={`round small spark-button ${theatreOpen ? 'on' : ''}`} onClick={() => setTheatre(!theatreOpen)} aria-label="How it was made" title="How it was made"><GeminiSpark state={spark} size={22} /></button>}
        <ValidationStatus compact />
      </div>}
      {theatreOpen && !REVIEW && <div className="theatre-dock"><Theatre compact={status === 'ready'} /></div>}
      {DEBUG && stats && <div className="debug">{stats}</div>}

      {!REVIEW && revealed && <div className="bottom">
        {showKnob && (
          <div className="knob-panel enter">
            <label className="knob-label">{showKnob.label ?? showKnob.id}: <b>{(vars[showKnob.id] ?? showKnob.init).toFixed(showKnob.step && showKnob.step < 1 ? 2 : 1)}{showKnob.unit ? ` ${showKnob.unit}` : ''}</b></label>
            <input type="range" min={showKnob.min} max={showKnob.max} step={showKnob.step ?? (showKnob.max - showKnob.min) / 100} value={vars[showKnob.id] ?? showKnob.init}
              onChange={(e) => { const val = Number(e.target.value); r?.runtime.setVar(showKnob.id, val); setVars((s) => ({ ...s, [showKnob.id]: val })); touchKnob(showKnob.id); }} />
          </div>
        )}
        {sliders.length > 0 && whatIf && (
          <div className="knobs enter">
            {sliders.map((it) => { if (it.type !== 'slider') return null; const v = scene!.vars.find((x) => x.id === it.var)!; return (
              <button key={v.id} className={`chip ${knob === v.id ? 'on' : ''}`} onClick={() => touchKnob(v.id)}>{it.label ?? v.label ?? v.id} <b>{(vars[v.id] ?? v.init).toFixed(v.step && v.step < 1 ? 2 : 1)}{v.unit ? ` ${v.unit}` : ''}</b></button>
            ); })}
          </div>
        )}
        {caption && <div key={captionBy + caption.slice(0, 12)} className={`caption ${captionBy === 'you' ? 'you' : ''}`} onClick={nextStep}>{captionParts ? <><span className="who">{captionParts.who}</span>{captionParts.text}</> : captionBy === 'you' ? <><span className="who">You</span>{caption}</> : caption}</div>}
        {scene && !PRESENT && (
          <div className="actions-row">
            <button className="round small" onClick={replay} aria-label="Replay" title="Replay"><Icon name="replay" size={20} /></button>
            <button className="round big" onClick={togglePause} aria-label={paused ? 'Play' : 'Pause'}><Icon name={paused ? 'play' : 'pause'} size={26} /></button>
            <button className={`pill tutor ${tutor === 'off' || tutor === 'ready' ? '' : tutor}`} onClick={toggleMic} aria-label={micOn ? 'Stop listening' : 'Ask a question'} disabled={status !== 'ready'} title={tutorNote || undefined}>{micOn ? <Icon name="mic" size={18} /> : <GeminiSpark size={18} state={tutor === 'unavailable' ? 'error' : 'idle'} />}{micLabel}</button>
            {sliders.length > 0 && <button className={`pill ${whatIf ? 'on' : ''}`} onClick={toggleWhatIf} aria-pressed={whatIf}><Icon name="knob" size={18} />What if?</button>}
            {scene.steps.length > 1 && !tutorLive.current && <button className="round small" onClick={nextStep} aria-label="Next" title="Next"><Icon name="next" size={20} /></button>}
          </div>
        )}
        {scene && scene.steps.length > 1 && !PRESENT && <div className="dots">{scene.steps.map((s, i) => <span key={s.id} className={i === stepIndex ? 'on' : ''} />)}</div>}
      </div>}
    </div>
  );
}
