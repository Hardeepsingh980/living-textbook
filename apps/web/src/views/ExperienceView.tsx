// The experience: the page layer (PixiJS canvas) presented flat, on the frozen photo, or anchored in AR,
// plus controls, captions, narration playback and the verification badge.
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useStore, type AudioClip } from '../lib/store';
import { SceneRenderer } from '../render/SceneRenderer';
import { mixer } from '../audio/mixer';
import { Theatre } from '../components/Theatre';
import { VerificationBadge } from '../components/VerificationBadge';
import type { Scene } from '@living-book/scene';

type Props = { onBack: () => void };

export function ExperienceView({ onBack }: Props) {
  const scene = useStore((s) => s.scene);
  const sceneVersion = useStore((s) => s.sceneVersion);
  const pageImageUrl = useStore((s) => s.pageImageUrl);
  const assets = useStore((s) => s.assets);
  const audio = useStore((s) => s.audio);
  const status = useStore((s) => s.status);
  const quick = useStore((s) => s.quickPartial);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const captionsOn = useStore((s) => s.captionsOn);
  const muted = useStore((s) => s.muted);
  const setMuted = useStore((s) => s.setMuted);
  const theatreOpen = useStore((s) => s.theatreOpen);
  const setTheatre = useStore((s) => s.setTheatre);
  const error = useStore((s) => s.error);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SceneRenderer | null>(null);
  const [pageImg, setPageImg] = useState<HTMLImageElement | null>(null);
  const [caption, setCaption] = useState<string>('');
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [vars, setVars] = useState<Record<string, number>>({});
  const [fit, setFit] = useState({ scale: 1, x: 0, y: 0 });
  const openerPlayed = useRef(false);
  const narratedSteps = useRef(new Set<string>());
  const stepTimer = useRef<number | null>(null);

  // page image for crops and the photo mode background
  useEffect(() => {
    if (!pageImageUrl) return;
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => setPageImg(img);
    img.src = pageImageUrl;
  }, [pageImageUrl]);

  // (re)create the renderer when the scene (version) or page image changes
  useEffect(() => {
    if (!scene || !canvasRef.current || !pageImg) return;
    let cancelled = false;
    const r = new SceneRenderer({ scene, pageImage: pageImg, assetUrls: assets, onTap: () => {} });
    rendererRef.current?.destroy();
    rendererRef.current = r;
    r.init(canvasRef.current).then(() => {
      if (cancelled) { r.destroy(); return; }
      setVars(Object.fromEntries(scene.vars.map((v) => [v.id, r.runtime.getVar(v.id) ?? v.init])));
      setStepIndex(r.runtime.stepIndex);
      setPlaying(r.runtime.playing);
      r.runtime.on((e) => {
        if (e.type === 'say') playLine(e.lineId);
        if (e.type === 'sfx') mixer.sfx(e.name);
        if (e.type === 'play') setPlaying(e.playing);
        if (e.type === 'step') { setStepIndex(e.index); narrateStep(scene, e.index); }
      });
      if (scene.audio.ambience) mixer.setAmbience(scene.audio.ambience);
      if (scene.steps.length) narrateStep(scene, r.runtime.stepIndex);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, sceneVersion, pageImg]);

  // late-arriving generated assets
  useEffect(() => { const r = rendererRef.current; if (!r) return; for (const [id, url] of Object.entries(assets)) void r.addAsset(id, url); }, [assets]);

  // opener narration as soon as it exists
  const audioById = useMemo(() => Object.fromEntries(audio.map((a) => [a.id, a])), [audio]);
  useEffect(() => {
    const opener = audio.find((a) => a.kind === 'opener');
    if (opener && !openerPlayed.current) { openerPlayed.current = true; void speak(opener); }
    // narration for the current step may arrive after the step started
    const s = scene?.steps[stepIndex];
    if (s && !narratedSteps.current.has(s.id)) { const clip = audio.find((a) => a.kind === 'narration' && a.stepId === s.id); if (clip && !mixer.speakingId) { narratedSteps.current.add(s.id); void speak(clip).then(() => autoAdvance(scene!, stepIndex)); } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio]);

  useEffect(() => { mixer.setMuted(muted); }, [muted]);
  // once everything is in, get the theatre out of the way (it stays one tap away)
  useEffect(() => { if (status !== 'ready') return; const id = window.setTimeout(() => setTheatre(false), 2500); return () => clearTimeout(id); }, [status, setTheatre]);
  useEffect(() => () => { rendererRef.current?.destroy(); mixer.destroy(); }, []);

  async function speak(clip: AudioClip) {
    setCaption(clip.speaker ? `${clip.speaker}: ${clip.text}` : clip.text);
    try { await mixer.say(clip.id, clip.url); } catch (e) { console.warn('audio failed', e); }
    setCaption((c) => (c === (clip.speaker ? `${clip.speaker}: ${clip.text}` : clip.text) ? '' : c));
  }
  function narrateStep(sc: Scene, index: number) {
    const s = sc.steps[index]; if (!s) return;
    if (stepTimer.current) { clearTimeout(stepTimer.current); stepTimer.current = null; }
    const clip = useStore.getState().audio.find((a) => a.kind === 'narration' && a.stepId === s.id);
    if (clip) { narratedSteps.current.add(s.id); void speak(clip).then(() => autoAdvance(sc, index)); }
    else if (s.narration) setCaption(s.narration);
    for (const [i, l] of (s.say ?? []).entries()) { const c = useStore.getState().audio.find((a) => a.id === `say-${s.id}-${i}`); if (c) setTimeout(() => { void speak(c); }, 800 * (i + 1)); }
  }
  function autoAdvance(sc: Scene, index: number) {
    const r = rendererRef.current; if (!r || r.runtime.stepIndex !== index) return;
    const s = sc.steps[index];
    const wait = (s?.dur ?? 1.2) * 1000;
    stepTimer.current = window.setTimeout(() => { if (rendererRef.current?.runtime.stepIndex === index && index + 1 < sc.steps.length) rendererRef.current.runtime.nextStep(); }, wait);
  }
  function playLine(lineId: string) {
    const clip = audioById[`line-${lineId}`];
    if (clip) void speak(clip);
    else { const l = scene?.audio.lines.find((x) => x.id === lineId); if (l) setCaption(`${l.speaker}: ${l.text}`); }
  }

  // fit the page layer into the stage (flat and photo modes)
  const computeFit = useCallback(() => {
    const st = stageRef.current; if (!st || !scene) return;
    const cw = st.clientWidth, ch = st.clientHeight;
    const { w, h } = scene.page;
    if (mode === 'photo') { const scale = Math.max(cw / w, ch / h); setFit({ scale, x: (cw - w * scale) / 2, y: (ch - h * scale) / 2 }); return; }
    // flat: keep the page clear of the top bar and the bottom controls
    const top = 64, bottom = Math.min(260, ch * 0.34);
    const avail = Math.max(120, ch - top - bottom);
    const scale = Math.min(cw / w, avail / h);
    setFit({ scale, x: (cw - w * scale) / 2, y: top + (avail - h * scale) / 2 });
  }, [scene, mode]);
  useEffect(() => { computeFit(); window.addEventListener('resize', computeFit); return () => window.removeEventListener('resize', computeFit); }, [computeFit]);

  const r = rendererRef.current;
  const step = scene?.steps[stepIndex];
  const sliders = scene?.interactions.filter((i) => i.type === 'slider') ?? [];

  return (
    <div className="experience">
      <div ref={stageRef} className={`stage mode-${mode}`} onClick={() => mixer.unlock()}>
        {pageImageUrl && <img className="page-photo" src={pageImageUrl} alt="" style={{ transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`, width: scene?.page.w, height: scene?.page.h }} />}
        <div className="page-layer" style={{ width: scene?.page.w, height: scene?.page.h, transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})` }}>
          <canvas ref={canvasRef} className="page-canvas" />
        </div>
        {!scene && status === 'generating' && (
          <div className="awaken">
            <div className="awaken-title">{quick?.title ?? 'Reading the page…'}</div>
            {quick?.gist && <div className="awaken-gist">{quick.gist}</div>}
          </div>
        )}
        {status === 'error' && <div className="error-card"><b>Could not bring this page to life.</b><div>{error}</div><button onClick={onBack}>Try another page</button></div>}
      </div>

      <div className="hud-top">
        <button className="icon" onClick={onBack} aria-label="Back">←</button>
        <div className="title">{quick?.title ?? 'Living Book'}</div>
        <VerificationBadge />
        <button className="icon" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? '🔇' : '🔊'}</button>
        <button className={`icon ${theatreOpen ? 'on' : ''}`} onClick={() => setTheatre(!theatreOpen)} aria-label="Agent theatre">⚙︎</button>
      </div>

      {theatreOpen && <div className="theatre-dock"><Theatre compact={status === 'ready'} /></div>}

      <div className="hud-bottom">
        {captionsOn && caption && <div className="caption">{caption}</div>}
        {scene && scene.steps.length > 0 && (
          <div className="steps">
            <button className="pill" disabled={stepIndex <= 0} onClick={() => r?.runtime.prevStep()}>‹</button>
            <div className="step-title">{step?.title ?? `Step ${stepIndex + 1}`} <span className="muted">{stepIndex + 1}/{scene.steps.length}</span></div>
            <button className="pill" disabled={stepIndex >= scene.steps.length - 1} onClick={() => r?.runtime.nextStep()}>›</button>
            <button className="pill" onClick={() => { r?.runtime.goToStep(0); r?.runtime.resetTime(); }}>↺</button>
          </div>
        )}
        {scene && scene.vars.some((v) => v.role === 'time') && (
          <button className="pill play" onClick={() => { const rt = r?.runtime; if (!rt) return; if (!rt.playing && rt.getVar(scene.vars.find((v) => v.role === 'time')!.id)! >= scene.vars.find((v) => v.role === 'time')!.max) rt.resetTime(); rt.setPlaying(!rt.playing); }}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        )}
        {sliders.length > 0 && (
          <div className="sliders">
            {sliders.map((it) => { if (it.type !== 'slider') return null; const v = scene!.vars.find((x) => x.id === it.var)!; return (
              <label key={it.var} className="slider">
                <span>{it.label ?? v.label ?? v.id} <b>{(vars[v.id] ?? v.init).toFixed(v.step && v.step < 1 ? 2 : 1)}{v.unit ? ` ${v.unit}` : ''}</b></span>
                <input type="range" min={v.min} max={v.max} step={v.step ?? (v.max - v.min) / 100} value={vars[v.id] ?? v.init}
                  onChange={(e) => { const val = Number(e.target.value); r?.runtime.setVar(v.id, val); setVars((s) => ({ ...s, [v.id]: val })); }} />
              </label>
            ); })}
          </div>
        )}
        <div className="modes">
          {(['ar', 'photo', 'flat'] as const).map((m) => <button key={m} className={`pill ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>{m === 'ar' ? 'AR' : m === 'photo' ? 'Photo' : 'Flat'}</button>)}
        </div>
      </div>
    </div>
  );
}
