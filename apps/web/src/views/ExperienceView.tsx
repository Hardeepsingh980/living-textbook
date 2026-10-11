// The experience, AR-only: the live camera stays on from the first frame; the page layer is warped onto the physical
// page once it is found, and sits on the frozen capture only when there is no camera or the page is lost for a while.
// Nothing is drawn or spoken until the first verified scene has its narration and pictures and the renderer is up;
// a richer version cross-fades in at a step boundary. Narration, character lines and steps then play continuously;
// the reader can pause, replay, nudge the "what if" knobs, or talk to the tutor.
import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore, type AudioClip, type Phase } from '../lib/store';
import { SceneRenderer } from '../render/SceneRenderer';
import { mixer } from '../audio/mixer';
import { SpeechQueue } from '../audio/speech';
import { LiveVoice } from '../audio/live';
import { Theatre } from '../components/Theatre';
import { ValidationStatus } from '../components/ValidationStatus';
import { GeminiSpark, type SparkState } from '../components/GeminiSpark';
import { GenerationOverlay, PHASE_WORDS } from '../components/GenerationOverlay';
import { Icon } from '../components/Icon';
import { CameraSession } from '../ar/camera';
import { cornersToMatrix3d, type Corners, type TrackerState } from '../ar/PageTracker';
import type { Scene } from '@living-book/scene';

type Props = { onBack: () => void };
const LOST_TO_PHOTO_MS = 1800;     // a found page that stays lost this long falls back to the frozen capture
const SEARCH_GIVE_UP_MS = 4000;    // a revealed scene whose page was never found shows on the capture after this
const REVEAL_TIMEOUT_MS = 75000;   // generation that produces nothing usable in this time is reported, not waited for
const DEBUG = new URLSearchParams(location.search).has('debug');
const REVIEW = new URLSearchParams(location.search).has('review'); // chrome-free rendering for screenshots and judging

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
  const [prepared, setPrepared] = useState<Record<number, boolean>>({}); // renderer initialised and pictures loaded, per version
  const speechRef = useRef(new SpeechQueue());
  const liveRef = useRef<LiveVoice | null>(null);
  const [pageImg, setPageImg] = useState<HTMLImageElement | null>(null);
  const [caption, setCaption] = useState('');
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
  const [voice, setVoice] = useState<'off' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'>('off');
  const [stats, setStats] = useState('');
  const stepTimer = useRef<number | null>(null);
  const lostSince = useRef<number | null>(null);
  const knobTimer = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const session = CameraSession.current;
  const arAvailable = !!session && session.tracker.state !== 'idle';
  const revealed = revealedVersion > 0;

  // ---------- page image (crops + fallback background) ----------
  useEffect(() => {
    if (!pageImageUrl) return;
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => setPageImg(img);
    img.src = pageImageUrl;
  }, [pageImageUrl]);

  // ---------- a renderer per scene version, prepared offscreen in its own slot ----------
  const active = () => (activeSlot >= 0 ? renderers.current[activeSlot] : null);
  useEffect(() => {
    if (!scene || !pageImg || sceneVersion < 1) return;
    const slot = sceneVersion % 2;
    const canvas = canvasRefs.current[slot]; if (!canvas) return;
    let cancelled = false;
    const r = new SceneRenderer({ scene, pageImage: pageImg, assetUrls: assets });
    renderers.current[slot]?.destroy();
    renderers.current[slot] = r;
    speechRef.current.clear();
    if (stepTimer.current) { clearTimeout(stepTimer.current); stepTimer.current = null; }
    r.init(canvas).then(() => {
      if (cancelled) { r.destroy(); return; }
      setVars(Object.fromEntries(scene.vars.map((v) => [v.id, r.runtime.getVar(v.id) ?? v.init])));
      setStepIndex(Math.max(0, r.runtime.stepIndex));
      r.runtime.on((e) => {
        if (renderers.current[slot] !== r) return;
        if (e.type === 'say') playLine(e.lineId);
        if (e.type === 'sfx') mixer.sfx(e.name);
        if (e.type === 'step') { setStepIndex(e.index); narrateStep(scene, e.index); }
        if (e.type === 'play' && !e.playing && !pausedRef.current) {
          // simulation reached the end of its time range: breathe, then run again
          const tv = scene.vars.find((v) => v.role === 'time');
          if (tv && (r.runtime.getVar(tv.id) ?? 0) >= tv.max) window.setTimeout(() => { if (!pausedRef.current && renderers.current[slot] === r) { r.runtime.resetTime(); r.runtime.setPlaying(true); } }, 1200);
        }
      });
      // continuous: simulations run on their own even if no step says play (the clock starts at the reveal)
      const tv = scene.vars.find((v) => v.role === 'time');
      if (tv && !scene.steps.some((s) => s.play !== undefined)) r.runtime.setPlaying(true);
      const done = () => { if (renderers.current[slot] === r) { document.documentElement.dataset.assetsReady = '1'; setPrepared((m) => ({ ...m, [sceneVersion]: true })); } };
      if (r.pendingAssets <= 0) done();
      else { document.documentElement.dataset.assetsReady = '0'; const wait = window.setInterval(() => { if (r.pendingAssets <= 0 || renderers.current[slot] !== r) { clearInterval(wait); done(); } }, 150); }
    }).catch((e) => { console.error('[scene] renderer failed', e); if (!revealed) fail('renderer'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, sceneVersion, pageImg]);
  // pictures that arrive after the renderer was built
  useEffect(() => { for (const r of renderers.current) if (r) void Promise.all(Object.entries(assets).map(([id, url]) => r.addAsset(id, url))); }, [assets]);
  useEffect(() => { mixer.setMuted(muted || REVIEW); }, [muted]);
  useEffect(() => { const id = window.setInterval(() => setSpeaking((s) => (s === speechRef.current.busy ? s : speechRef.current.busy)), 250); return () => clearInterval(id); }, []);
  useEffect(() => () => { speechRef.current.clear(); for (const r of renderers.current) r?.destroy(); mixer.destroy(); CameraSession.current?.stop(); liveRef.current?.stop(); }, []);

  // ---------- the reveal: only a version that is verified, voiced and drawn becomes visible ----------
  const ver = scene ? verifications[sceneVersion] : undefined;
  const validated = !!scene && sceneVersion >= 1 && !!ver && !!prepared[sceneVersion] && narrationReady(scene, sceneVersion, audio);
  useEffect(() => {
    if (!validated || !scene || sceneVersion <= revealedVersion) return;
    const slot = sceneVersion % 2, other = 1 - slot;
    setActiveSlot(slot);
    markRevealed(sceneVersion);
    if (sceneVersion >= 1 && ver?.status === 'unverified' && ver.checks.length === 0) setPhase('ready');
    const r = renderers.current[slot];
    if (r) { r.runtime.resetTime(); if (r.runtime.stepIndex < 0 && scene.steps.length) r.runtime.goToStep(0); if (scene.audio.ambience) mixer.setAmbience(scene.audio.ambience); startNarration(scene, Math.max(0, r.runtime.stepIndex)); }
    const old = renderers.current[other];
    if (old) window.setTimeout(() => { if (renderers.current[other] === old) { old.destroy(); renderers.current[other] = null; } }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validated, sceneVersion]);
  // generation that never becomes usable is reported instead of leaving the loading treatment on forever
  useEffect(() => {
    if (revealed || status === 'error') return;
    const id = window.setTimeout(() => { if (!useStore.getState().revealedVersion && useStore.getState().phase !== 'failed') fail('timeout'); }, REVEAL_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [revealed, status, fail]);

  // ---------- narration: steps in order, looping; a richer version takes over at a step boundary ----------
  const clipFor = useCallback((pred: (a: AudioClip) => boolean) => { const st = useStore.getState(); const v = Math.max(1, st.revealedVersion || st.sceneVersion); return st.audio.find((a) => (a.version ?? 1) === v && pred(a)); }, []);
  useEffect(() => {
    // narration for the current step may arrive after the step started
    const sc = scene; const s = sc?.steps[stepIndex];
    if (revealed && sc && s && !speechRef.current.busy && !pausedRef.current && !liveRef.current) startNarration(sc, stepIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio]);

  function startNarration(sc: Scene, index: number) {
    const s = sc.steps[index]; if (!s) return;
    const q = speechRef.current;
    if (q.busy) return;
    const items = [] as { clip: AudioClip; onStart?: () => void }[];
    const narration = clipFor((a) => a.kind === 'narration' && a.stepId === s.id);
    if (narration) items.push({ clip: narration, onStart: () => setCaption(narration.text) });
    else if (s.narration) setCaption(s.narration);
    (s.say ?? []).forEach((l, i) => { const c = clipFor((a) => a.id === `say-${s.id}-${i}` && a.text === l.text) ?? clipFor((a) => a.kind === 'line' && a.text === l.text); if (c) items.push({ clip: c, onStart: () => { setCaption(`${l.speaker}: ${l.text}`); active()?.sayBubble(l.el, l.text, c.durationMs); } }); });
    if (!items.length) { scheduleAdvance(sc, index, (s.dur ?? 3) * 1000); return; }
    q.onIdle = () => scheduleAdvance(sc, index, (s.dur ?? 1) * 1000);
    q.enqueue(...items);
  }
  function scheduleAdvance(sc: Scene, index: number, waitMs: number) {
    if (stepTimer.current) clearTimeout(stepTimer.current);
    stepTimer.current = window.setTimeout(() => {
      const r = active(); if (!r || pausedRef.current || r.runtime.stepIndex !== index || liveRef.current) return;
      if (index + 1 < sc.steps.length) r.runtime.nextStep();
      else { // loop: a breath, then from the top; a richer version that is verified and voiced takes over here
        stepTimer.current = window.setTimeout(() => {
          if (pausedRef.current || active() !== r || liveRef.current) return;
          const st = useStore.getState();
          if (st.pendingScene && st.verifications[st.pendingVersion] && narrationReady(st.pendingScene, st.pendingVersion, st.audio)) { st.applyPendingScene(); return; } // the reveal effect cross-fades it in
          r.runtime.resetTime(); r.runtime.goToStep(0);
        }, 2500);
      }
    }, waitMs);
  }
  function narrateStep(sc: Scene, index: number) { speechRef.current.clear(); if (stepTimer.current) clearTimeout(stepTimer.current); startNarration(sc, index); }
  function playLine(lineId: string) {
    const clip = clipFor((a) => a.id === `line-${lineId}`);
    const l = scene?.audio.lines.find((x) => x.id === lineId);
    if (clip) speechRef.current.enqueue({ clip, onStart: () => { setCaption(`${clip.speaker ?? ''}: ${clip.text}`); active()?.sayBubble(l?.el, clip.text, clip.durationMs); } });
    else if (l) setCaption(`${l.speaker}: ${l.text}`);
  }
  function togglePause() {
    const r = active(); if (!r) return;
    const next = !paused; setPaused(next); pausedRef.current = next;
    if (next) { speechRef.current.clear(); if (stepTimer.current) clearTimeout(stepTimer.current); r.runtime.setPlaying(false); }
    else { if (scene) startNarration(scene, r.runtime.stepIndex); if (scene?.vars.some((v) => v.role === 'time')) r.runtime.setPlaying(true); }
  }
  function replay() { const r = active(); if (!r || !scene) return; setPaused(false); pausedRef.current = false; r.runtime.resetTime(); speechRef.current.clear(); r.runtime.goToStep(0); if (scene.vars.some((v) => v.role === 'time')) r.runtime.setPlaying(true); }
  function nextStep() { const r = active(); if (!r || !scene) return; if (r.runtime.stepIndex + 1 < scene.steps.length) r.runtime.nextStep(); else replay(); }

  // ---------- voice Q&A ----------
  async function toggleVoice() {
    if (liveRef.current) { liveRef.current.stop(); liveRef.current = null; setVoice('off'); setPhase('ready'); if (!pausedRef.current && scene) startNarration(scene, active()?.runtime.stepIndex ?? 0); return; }
    if (!experienceId) return;
    speechRef.current.clear(); if (stepTimer.current) clearTimeout(stepTimer.current);
    const lv = new LiveVoice(experienceId, () => ({ ...(active()?.runtime.values() ?? {}) }), {
      onStatus: (st) => { setVoice(st === 'closed' ? 'off' : st); if (st === 'closed') { liveRef.current = null; setPhase('ready'); } },
      onTranscript: (role, text) => setCaption(role === 'user' ? `You: ${text}` : text),
    });
    liveRef.current = lv;
    try { await lv.start(); setPhase('live'); setCaption('I am listening. Ask me anything about this page.'); } catch { setVoice('error'); liveRef.current = null; }
  }
  useEffect(() => { liveRef.current?.sendState(); }, [vars]);

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
    const scale = REVIEW ? Math.min(cw / w, ch / h) : Math.max(cw / w, ch / h); // review mode: the whole page for judging
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
  const spark: SparkState = status === 'error' || voice === 'error' ? 'error' : voice === 'listening' ? 'listening' : voice === 'speaking' || speaking ? 'speaking' : voice === 'thinking' || voice === 'connecting' || working ? 'thinking' : 'idle';
  const title = quick?.title || quick?.subject || '';
  const mainFigure = quick?.figures?.[0]?.box as [number, number, number, number] | undefined;
  const errorText = /^(camera|network|fetch|server)/i.test(error ?? '') ? 'The connection dropped while the page was being prepared.' : error === 'timeout' || error === 'no scene' || error === 'renderer' ? "I couldn't build this lesson safely yet. You can retry, or point at the main illustration or diagram." : "I couldn't confidently read this page. Try moving closer, with the whole page in the frame.";

  return (
    <div className={`experience ${onPhoto ? 'on-photo' : 'on-camera'} ${arLive && revealedVersion > 0 ? 'found' : ''} ${revealed ? 'revealed' : 'working'}`}>
      <div ref={stageRef} className="stage" onClick={() => mixer.unlock()}>
        {pageImageUrl && page && <img className="page-photo" src={pageImageUrl} alt="" style={{ transform: fitTransform, width: page.w, height: page.h, opacity: onPhoto ? 1 : 0 }} />}
        <div ref={layerRef} className={`page-layer ${layerPlaced ? '' : 'hidden'}`} style={{ width: page?.w, height: page?.h, ...(onPhoto ? { transform: fitTransform } : {}) }}>
          <canvas ref={(el) => { canvasRefs.current[0] = el; }} className={`page-canvas ${activeSlot === 0 ? 'active' : ''}`} />
          <canvas ref={(el) => { canvasRefs.current[1] = el; }} className={`page-canvas ${activeSlot === 1 ? 'active' : ''}`} />
          {working && page && layerPlaced && !REVIEW && <GenerationOverlay phase={phase} page={page} figure={mainFigure} />}
        </div>
        {working && !layerPlaced && !REVIEW && <GenerationOverlay phase={phase} page={page ?? { w: 1000, h: 1400 }} title={title} floating />}
        {status === 'error' && <div className="error-card enter"><b>I couldn't bring this page to life yet.</b><div className="muted">{errorText}</div><button className="primary" onClick={onBack}>Try again</button></div>}
        {arAvailable && !arLive && revealed && status !== 'error' && arState !== 'idle' && everFound.current && <div className="ar-hint">Point the camera at the page</div>}
      </div>

      {!REVIEW && <div className="top-bar">
        <button className="round" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        {phrase || title ? <div className={`title-pill ${phrase ? 'working' : ''}`}>{phrase ? <GeminiSpark state="thinking" size={16} /> : null}<span>{phrase || title}</span></div> : <div className="spacer" />}
        <button className="round small" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'}><Icon name={muted ? 'soundOff' : 'sound'} size={18} /></button>
        <button className={`round small spark-button ${theatreOpen ? 'on' : ''}`} onClick={() => setTheatre(!theatreOpen)} aria-label="How it was made" title="How it was made"><GeminiSpark state={spark} size={20} /></button>
        <ValidationStatus compact />
      </div>}
      {theatreOpen && !REVIEW && <div className="theatre-dock"><Theatre compact={status === 'ready'} /></div>}
      {DEBUG && stats && <div className="debug">{stats}</div>}

      {!REVIEW && revealed && <div className="bottom">
        {showKnob && (
          <div className="knob-panel">
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
        {caption && <div className="caption" onClick={nextStep}>{/^([^:]{1,24}): (.+)$/s.test(caption) ? <><span className="who">{caption.split(': ')[0]}</span>{caption.slice(caption.indexOf(': ') + 2)}</> : caption}</div>}
        {scene && (
          <div className="actions-row">
            <button className="round small" onClick={replay} aria-label="Replay" title="Replay"><Icon name="replay" size={20} /></button>
            <button className="round big" onClick={togglePause} aria-label={paused ? 'Play' : 'Pause'}><Icon name={paused ? 'play' : 'pause'} size={24} /></button>
            <button className={`pill ${voice === 'off' ? '' : voice}`} onClick={toggleVoice} aria-label={voice === 'off' ? 'Ask a question' : 'Stop listening'} disabled={status !== 'ready'}>{voice === 'off' ? <GeminiSpark size={16} /> : <Icon name={voice === 'error' ? 'cross' : 'stop'} size={16} />}{voice === 'off' ? 'Ask' : voice === 'listening' ? 'Listening' : voice === 'speaking' ? 'Answering' : voice === 'error' ? 'Try again' : 'One moment'}</button>
            {sliders.length > 0 && <button className={`pill ${whatIf ? 'on' : ''}`} onClick={toggleWhatIf} aria-pressed={whatIf}><Icon name="knob" size={16} />What if?</button>}
            {scene.steps.length > 1 && <button className="round small" onClick={nextStep} aria-label="Next" title="Next"><Icon name="next" size={20} /></button>}
          </div>
        )}
        {scene && scene.steps.length > 1 && <div className="dots">{scene.steps.map((s, i) => <span key={s.id} className={i === stepIndex ? 'on' : ''} />)}</div>}
      </div>}
    </div>
  );
}
