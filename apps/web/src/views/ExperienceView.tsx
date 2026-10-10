// The experience, AR-only: the live camera with the page layer warped onto the physical page. When the page is
// not in view the layer sits on the frozen capture instead, with no modes to choose. Narration, character lines
// and steps play continuously; the reader can pause, replay, nudge the "magic knobs", or ask the tutor a question.
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useStore, type AudioClip } from '../lib/store';
import { SceneRenderer } from '../render/SceneRenderer';
import { mixer } from '../audio/mixer';
import { SpeechQueue } from '../audio/speech';
import { LiveVoice } from '../audio/live';
import { Theatre } from '../components/Theatre';
import { VerificationBadge } from '../components/VerificationBadge';
import { Icon } from '../components/Icon';
import { CameraSession } from '../ar/camera';
import { cornersToMatrix3d, type Corners, type TrackerState } from '../ar/PageTracker';
import type { Scene } from '@living-book/scene';

type Props = { onBack: () => void };
const LOST_TO_PHOTO_MS = 1800;
const DEBUG = new URLSearchParams(location.search).has('debug');
const REVIEW = new URLSearchParams(location.search).has('review'); // chrome-free rendering for screenshots and judging

const STAGE_PHRASE: Record<string, string> = {
  upload: 'Looking at your page…', read: 'Reading your page…', track: 'Learning your page…', build: 'Bringing it to life…',
  understand: 'Understanding every detail…', voice: 'Giving it a voice…', illustrate: 'Drawing the characters…', verify: 'Double-checking the facts…', save: 'Almost there…',
};

export function ExperienceView({ onBack }: Props) {
  const scene = useStore((s) => s.scene);
  const sceneVersion = useStore((s) => s.sceneVersion);
  const pageImageUrl = useStore((s) => s.pageImageUrl);
  const assets = useStore((s) => s.assets);
  const audio = useStore((s) => s.audio);
  const status = useStore((s) => s.status);
  const stages = useStore((s) => s.stages);
  const quick = useStore((s) => s.quickPartial);
  const muted = useStore((s) => s.muted);
  const setMuted = useStore((s) => s.setMuted);
  const theatreOpen = useStore((s) => s.theatreOpen);
  const setTheatre = useStore((s) => s.setTheatre);
  const error = useStore((s) => s.error);
  const trackingInfo = useStore((s) => s.tracking);
  const experienceId = useStore((s) => s.id);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SceneRenderer | null>(null);
  const speechRef = useRef(new SpeechQueue());
  const liveRef = useRef<LiveVoice | null>(null);
  const [pageImg, setPageImg] = useState<HTMLImageElement | null>(null);
  const [caption, setCaption] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [vars, setVars] = useState<Record<string, number>>({});
  const [knob, setKnob] = useState<string | null>(null);
  const [fit, setFit] = useState({ scale: 1, x: 0, y: 0 });
  const [arState, setArState] = useState<TrackerState>('idle');
  const [arLive, setArLive] = useState(false);
  const [voice, setVoice] = useState<'off' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'>('off');
  const [stats, setStats] = useState('');
  const openerPlayed = useRef(false);
  const stepTimer = useRef<number | null>(null);
  const lostSince = useRef<number | null>(null);
  const knobTimer = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const session = CameraSession.current;
  const arAvailable = !!session && session.tracker.state !== 'idle';

  // ---------- page image (crops + fallback background) ----------
  useEffect(() => {
    if (!pageImageUrl) return;
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => setPageImg(img);
    img.src = pageImageUrl;
  }, [pageImageUrl]);

  // ---------- renderer per scene version ----------
  useEffect(() => {
    if (!scene || !canvasRef.current || !pageImg) return;
    let cancelled = false;
    const r = new SceneRenderer({ scene, pageImage: pageImg, assetUrls: assets });
    rendererRef.current?.destroy();
    rendererRef.current = r;
    speechRef.current.clear();
    if (stepTimer.current) { clearTimeout(stepTimer.current); stepTimer.current = null; }
    r.init(canvasRef.current).then(() => {
      if (cancelled) { r.destroy(); return; }
      document.documentElement.dataset.assetsReady = r.pendingAssets <= 0 ? '1' : '0';
      setVars(Object.fromEntries(scene.vars.map((v) => [v.id, r.runtime.getVar(v.id) ?? v.init])));
      setStepIndex(Math.max(0, r.runtime.stepIndex));
      r.runtime.on((e) => {
        if (e.type === 'say') playLine(e.lineId);
        if (e.type === 'sfx') mixer.sfx(e.name);
        if (e.type === 'step') { setStepIndex(e.index); narrateStep(scene, e.index); }
        if (e.type === 'play' && !e.playing && !pausedRef.current) {
          // simulation reached the end of its time range: breathe, then run again
          const tv = scene.vars.find((v) => v.role === 'time');
          if (tv && (r.runtime.getVar(tv.id) ?? 0) >= tv.max) window.setTimeout(() => { if (!pausedRef.current && rendererRef.current === r) { r.runtime.resetTime(); r.runtime.setPlaying(true); } }, 1200);
        }
      });
      if (scene.audio.ambience) mixer.setAmbience(scene.audio.ambience);
      // continuous: simulations run on their own even if no step says play
      const tv = scene.vars.find((v) => v.role === 'time');
      if (tv && !scene.steps.some((s) => s.play !== undefined)) r.runtime.setPlaying(true);
      if (sceneVersion >= 1) startNarration(scene, r.runtime.stepIndex < 0 ? 0 : r.runtime.stepIndex);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, sceneVersion, pageImg]);

  useEffect(() => { const r = rendererRef.current; if (!r) return; Promise.all(Object.entries(assets).map(([id, url]) => r.addAsset(id, url))).then(() => { document.documentElement.dataset.assetsReady = '1'; }); }, [assets]);
  useEffect(() => { mixer.setMuted(muted || REVIEW); }, [muted]);
  useEffect(() => () => { speechRef.current.clear(); rendererRef.current?.destroy(); mixer.destroy(); CameraSession.current?.stop(); liveRef.current?.stop(); }, []);

  // ---------- narration: opener, then steps in order, looping ----------
  const clipFor = useCallback((pred: (a: AudioClip) => boolean) => { const st = useStore.getState(); const ver = Math.max(1, st.sceneVersion); return st.audio.find((a) => (a.version ?? 1) === ver && pred(a)); }, []);
  useEffect(() => {
    const opener = audio.find((a) => a.kind === 'opener');
    if (opener && !openerPlayed.current) { openerPlayed.current = true; speechRef.current.enqueue({ clip: opener, onStart: () => setCaption(opener.text) }); }
    // narration for the current step may arrive after the step started
    const sc = scene; const s = sc?.steps[stepIndex];
    if (sc && s && sceneVersion >= 1 && !speechRef.current.busy && !pausedRef.current) startNarration(sc, stepIndex);
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
    (s.say ?? []).forEach((l, i) => { const c = clipFor((a) => a.id === `say-${s.id}-${i}`); if (c) items.push({ clip: c, onStart: () => { setCaption(`${l.speaker}: ${l.text}`); rendererRef.current?.sayBubble(l.el, l.text, c.durationMs); } }); });
    if (!items.length) { scheduleAdvance(sc, index, (s.dur ?? 3) * 1000); return; }
    q.onIdle = () => scheduleAdvance(sc, index, (s.dur ?? 1) * 1000);
    q.enqueue(...items);
  }
  function scheduleAdvance(sc: Scene, index: number, waitMs: number) {
    if (stepTimer.current) clearTimeout(stepTimer.current);
    stepTimer.current = window.setTimeout(() => {
      const r = rendererRef.current; if (!r || pausedRef.current || r.runtime.stepIndex !== index || liveRef.current) return;
      if (index + 1 < sc.steps.length) r.runtime.nextStep();
      else { // loop: a breath, then from the top — and if a richer version has arrived, it takes over here
        stepTimer.current = window.setTimeout(() => {
          if (pausedRef.current || rendererRef.current !== r || liveRef.current) return;
          if (useStore.getState().pendingScene) { useStore.getState().applyPendingScene(); return; } // the renderer effect restarts narration
          r.runtime.resetTime(); r.runtime.goToStep(0);
        }, 2500);
      }
    }, waitMs);
  }
  function narrateStep(sc: Scene, index: number) { speechRef.current.clear(); if (stepTimer.current) clearTimeout(stepTimer.current); startNarration(sc, index); }
  function playLine(lineId: string) {
    const clip = clipFor((a) => a.id === `line-${lineId}`);
    const l = scene?.audio.lines.find((x) => x.id === lineId);
    if (clip) speechRef.current.enqueue({ clip, onStart: () => { setCaption(`${clip.speaker ?? ''}: ${clip.text}`); rendererRef.current?.sayBubble(l?.el, clip.text, clip.durationMs); } });
    else if (l) setCaption(`${l.speaker}: ${l.text}`);
  }
  function togglePause() {
    const r = rendererRef.current; if (!r) return;
    const next = !paused; setPaused(next); pausedRef.current = next;
    if (next) { speechRef.current.clear(); if (stepTimer.current) clearTimeout(stepTimer.current); r.runtime.setPlaying(false); }
    else { if (scene) startNarration(scene, r.runtime.stepIndex); if (scene?.vars.some((v) => v.role === 'time')) r.runtime.setPlaying(true); }
  }
  function replay() { const r = rendererRef.current; if (!r || !scene) return; setPaused(false); pausedRef.current = false; r.runtime.resetTime(); speechRef.current.clear(); r.runtime.goToStep(0); if (scene.vars.some((v) => v.role === 'time')) r.runtime.setPlaying(true); }
  function nextStep() { const r = rendererRef.current; if (!r || !scene) return; if (r.runtime.stepIndex + 1 < scene.steps.length) r.runtime.nextStep(); else replay(); }

  // ---------- voice Q&A ----------
  async function toggleVoice() {
    if (liveRef.current) { liveRef.current.stop(); liveRef.current = null; setVoice('off'); if (!pausedRef.current && scene) startNarration(scene, rendererRef.current?.runtime.stepIndex ?? 0); return; }
    if (!experienceId) return;
    speechRef.current.clear(); if (stepTimer.current) clearTimeout(stepTimer.current);
    const lv = new LiveVoice(experienceId, () => ({ ...(rendererRef.current?.runtime.values() ?? {}) }), {
      onStatus: (st) => { setVoice(st === 'closed' ? 'off' : st); if (st === 'closed') liveRef.current = null; },
      onTranscript: (role, text) => setCaption(role === 'user' ? `You: ${text}` : text),
    });
    liveRef.current = lv;
    try { await lv.start(); setCaption('I am listening… ask me anything about this page.'); } catch { setVoice('error'); liveRef.current = null; }
  }
  useEffect(() => { liveRef.current?.sendState(); }, [vars]);

  // ---------- AR: live video + tracked warp ----------
  useEffect(() => {
    if (!session || !arAvailable) return;
    const st = stageRef.current!;
    session.attach(st);
    session.tracker.onCorners = (c: Corners | null, state: TrackerState) => {
      setArState((prev) => (prev === state ? prev : state));
      const layer = layerRef.current; if (!layer || !scene) return;
      if (c) {
        lostSince.current = null;
        if (!arLive) setArLive(true);
        const cw = st.clientWidth, ch = st.clientHeight, s = Math.max(cw / session.vw, ch / session.vh);
        const ox = (cw - session.vw * s) / 2, oy = (ch - session.vh * s) / 2;
        const css = c.map((v, i) => (i % 2 === 0 ? v * s + ox : v * s + oy));
        const m = cornersToMatrix3d(scene.page.w, scene.page.h, css);
        if (m) layer.style.transform = m;
      } else {
        lostSince.current ??= performance.now();
        if (arLive && performance.now() - lostSince.current > LOST_TO_PHOTO_MS) setArLive(false);
      }
      if (DEBUG) setStats(`${session.tracker.fps} fps · ${session.tracker.trackedPts} pts · ${state}`);
    };
    return () => { session.tracker.onCorners = null; };
  }, [session, arAvailable, scene, arLive]);
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

  // photo presentation (no camera, or page out of view): the capture fills the screen and the layer sits on it
  const onPhoto = !(arAvailable && arLive);
  const computeFit = useCallback(() => {
    const st = stageRef.current; if (!st || !scene) return;
    const cw = st.clientWidth, ch = st.clientHeight, { w, h } = scene.page;
    const scale = REVIEW ? Math.min(cw / w, ch / h) : Math.max(cw / w, ch / h); // review mode: the whole page for judging
    setFit({ scale, x: (cw - w * scale) / 2, y: (ch - h * scale) / 2 });
  }, [scene]);
  useEffect(() => { computeFit(); window.addEventListener('resize', computeFit); return () => window.removeEventListener('resize', computeFit); }, [computeFit]);

  const r = rendererRef.current;
  const sliders = scene?.interactions.filter((i) => i.type === 'slider') ?? [];
  const fitTransform = `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`;
  const running = stages.filter((s) => s.status === 'start').map((s) => s.stage);
  const phrase = status === 'generating' ? (STAGE_PHRASE[running[running.length - 1] ?? 'upload'] ?? 'Bringing it to life…') : '';
  const showKnob = knob ? scene?.vars.find((v) => v.id === knob) : undefined;
  const touchKnob = (id: string) => { setKnob(id); if (knobTimer.current) clearTimeout(knobTimer.current); knobTimer.current = window.setTimeout(() => setKnob(null), 5000); };

  return (
    <div className={`experience ${onPhoto ? 'on-photo' : 'on-camera'} ${!scene || sceneVersion < 1 ? 'found' : ''}`}>
      <div ref={stageRef} className="stage" onClick={() => mixer.unlock()}>
        {pageImageUrl && <img className="page-photo" src={pageImageUrl} alt="" style={{ transform: fitTransform, width: scene?.page.w, height: scene?.page.h, opacity: onPhoto ? 1 : 0 }} />}
        <div ref={layerRef} className="page-layer" style={{ width: scene?.page.w, height: scene?.page.h, ...(onPhoto ? { transform: fitTransform } : {}) }}>
          <canvas key={`${sceneVersion}-${scene?.page.w ?? 0}x${scene?.page.h ?? 0}`} ref={canvasRef} className="page-canvas" />
        </div>
        {status === 'error' && <div className="error-card"><b>Hmm, that did not work.</b><div className="muted">{error}</div><button className="primary" onClick={onBack}>Try again</button></div>}
        {arAvailable && !arLive && status !== 'error' && arState !== 'idle' && (lostSince.current ?? 0) > 0 && <div className="ar-hint">Point the camera at the page</div>}
      </div>

      {!REVIEW && <div className="top-bar">
        <button className="round" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        {phrase ? <div className="progress-pill"><span className="bar" />{phrase}</div> : <div className="spacer" />}
        <button className="round small" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'}><Icon name={muted ? 'soundOff' : 'sound'} size={18} /></button>
        <button className={`round small ${theatreOpen ? 'on' : ''}`} onClick={() => setTheatre(!theatreOpen)} aria-label="How it was made"><Icon name="layers" size={18} /></button>
        <VerificationBadge compact />
      </div>}
      {theatreOpen && !REVIEW && <div className="theatre-dock"><Theatre compact={status === 'ready'} /></div>}
      {DEBUG && stats && <div className="debug">{stats}</div>}

      {!REVIEW && <div className="bottom">
        {showKnob && (
          <div className="knob-panel">
            <label className="knob-label">{showKnob.label ?? showKnob.id}: <b>{(vars[showKnob.id] ?? showKnob.init).toFixed(showKnob.step && showKnob.step < 1 ? 2 : 1)}{showKnob.unit ? ` ${showKnob.unit}` : ''}</b></label>
            <input type="range" min={showKnob.min} max={showKnob.max} step={showKnob.step ?? (showKnob.max - showKnob.min) / 100} value={vars[showKnob.id] ?? showKnob.init}
              onChange={(e) => { const val = Number(e.target.value); r?.runtime.setVar(showKnob.id, val); setVars((s) => ({ ...s, [showKnob.id]: val })); touchKnob(showKnob.id); }} />
          </div>
        )}
        {sliders.length > 0 && (
          <div className="knobs">
            {sliders.map((it) => { if (it.type !== 'slider') return null; const v = scene!.vars.find((x) => x.id === it.var)!; return (
              <button key={v.id} className={`chip ${knob === v.id ? 'on' : ''}`} onClick={() => touchKnob(v.id)}>{it.label ?? v.label ?? v.id} <b>{(vars[v.id] ?? v.init).toFixed(v.step && v.step < 1 ? 2 : 1)}{v.unit ? ` ${v.unit}` : ''}</b></button>
            ); })}
          </div>
        )}
        {caption && <div className="caption" onClick={nextStep}>{caption}</div>}
        {scene && (
          <div className="controls">
            <button className="round" onClick={replay} aria-label="Replay"><Icon name="replay" /></button>
            <button className="round big" onClick={togglePause} aria-label={paused ? 'Play' : 'Pause'}><Icon name={paused ? 'play' : 'pause'} size={26} /></button>
            <button className={`round big mic ${voice}`} onClick={toggleVoice} aria-label={voice === 'off' ? 'Ask a question' : 'Stop listening'} disabled={status !== 'ready'}><Icon name={voice === 'off' ? 'mic' : voice === 'error' ? 'cross' : 'stop'} size={26} /></button>
            {scene.steps.length > 1 && <button className="round" onClick={nextStep} aria-label="Next"><Icon name="next" /></button>}
          </div>
        )}
        {scene && scene.steps.length > 1 && <div className="dots">{scene.steps.map((s, i) => <span key={s.id} className={i === stepIndex ? 'on' : ''} />)}</div>}
      </div>}
    </div>
  );
}
