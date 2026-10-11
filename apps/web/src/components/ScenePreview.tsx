// A saved experience, alive: the page image with the real renderer on top, self-running through its steps, with one
// slider when asked. The homepage uses it; nothing here touches the lesson flow. The renderer is built once and only
// pauses while it is off screen, so scrolling never rebuilds it.
import { useEffect, useRef, useState } from 'react';
import type { ExperienceRecord, Scene } from '@living-book/scene';
import { SceneRenderer } from '../render/SceneRenderer';
import { getExperience } from '../lib/api';

type Props = { id: string; slider?: string; stepEveryMs?: number; className?: string; resolution?: number; onRecord?: (rec: ExperienceRecord) => void; children?: React.ReactNode };

export function ScenePreview({ id, slider, stepEveryMs = 7000, className = '', resolution = 0.6, onRecord, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SceneRenderer | null>(null);
  const onRecordRef = useRef(onRecord); onRecordRef.current = onRecord;
  const [rec, setRec] = useState<ExperienceRecord | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [alive, setAlive] = useState(false);
  const [failed, setFailed] = useState(false);
  const [near, setNear] = useState(false);
  const nearRef = useRef(false);
  const [value, setValue] = useState<number | null>(null);

  // the record and its page image
  useEffect(() => {
    let cancelled = false;
    setRec(null); setImg(null); setAlive(false); setFailed(false);
    getExperience(id).then((r) => {
      if (cancelled) return;
      setRec(r); onRecordRef.current?.(r);
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { if (!cancelled) setImg(im); };
      im.onerror = () => { if (!cancelled) setFailed(true); };
      im.src = r.page.imageUrl;
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [id]);

  // build only once the preview is near the viewport; afterwards just pause and resume it
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); nearRef.current = true; return; }
    const io = new IntersectionObserver((es) => {
      const n = es.some((e) => e.isIntersecting);
      nearRef.current = n; if (n) setNear(true);
      const r = rendererRef.current; if (r) { if (n) r.resume(); else r.pause(); }
    }, { rootMargin: '900px' }); // built while the reader is still on the hero, so the scroll down never waits for it
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!rec || !img || !near) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const scene: Scene = rec.scene;
    const r = new SceneRenderer({ scene, pageImage: img, assetUrls: Object.fromEntries(rec.assets.map((a) => [a.id, a.url])), resolution, maxFps: 30 });
    rendererRef.current = r;
    let cancelled = false;
    let stepTimer: number | undefined, waitTimer: number | undefined, replayTimer: number | undefined;
    const timeVar = scene.vars.find((v) => v.role === 'time');
    const start = () => {
      if (cancelled) return;
      r.runtime.resetTime();
      if (scene.steps.length) r.runtime.goToStep(0, true);
      if (timeVar) r.runtime.setPlaying(true);
      if (slider) setValue(r.runtime.getVar(slider) ?? null);
      if (!nearRef.current) r.pause();
      setAlive(true);
      // the lesson's steps one after another, then from the top; the simulation keeps running throughout
      if (scene.steps.length > 1) {
        let i = 0;
        stepTimer = window.setInterval(() => { if (cancelled || r.paused) return; i = (i + 1) % scene.steps.length; r.runtime.goToStep(i, true); if (timeVar) r.runtime.setPlaying(true); }, stepEveryMs);
      }
    };
    r.init(canvas).then(() => {
      if (cancelled) { r.destroy(); return; }
      r.runtime.on((e) => {
        // the simulation reached the end of its time range: breathe, then run again
        if (e.type === 'play' && !e.playing && timeVar && (r.runtime.getVar(timeVar.id) ?? 0) >= timeVar.max) {
          replayTimer = window.setTimeout(() => { if (!cancelled) { r.runtime.resetTime(); r.runtime.setPlaying(true); } }, 1200);
        }
      });
      if (r.pendingAssets <= 0) start();
      else waitTimer = window.setInterval(() => { if (r.pendingAssets <= 0 || cancelled) { clearInterval(waitTimer); start(); } }, 150);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (stepTimer) clearInterval(stepTimer); if (waitTimer) clearInterval(waitTimer); if (replayTimer) clearTimeout(replayTimer);
      r.destroy(); if (rendererRef.current === r) rendererRef.current = null;
      setAlive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec, img, near]);

  const sv = slider && rec ? rec.scene.vars.find((v) => v.id === slider) : undefined;
  const shown = (v: number) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
  return (
    <div ref={wrapRef} className={`scene-preview ${alive ? 'alive' : ''} ${failed ? 'failed' : ''} ${className}`} style={{ aspectRatio: rec ? `${rec.page.w} / ${rec.page.h}` : '10 / 13' }}>
      {rec && <img className="scene-preview-page" src={rec.page.imageUrl} alt="" draggable={false} />}
      <canvas ref={canvasRef} className="scene-preview-canvas" aria-hidden="true" />
      {children}
      {sv && value !== null && (
        <label className="scene-preview-slider" onPointerDown={(e) => e.stopPropagation()}>
          <span className="scene-preview-slider-label">{sv.label || sv.id}: {shown(value)}{sv.unit ? ` ${sv.unit}` : ''}</span>
          <input type="range" min={sv.min} max={sv.max} step={(sv.max - sv.min) / 100} value={value} aria-label={sv.label || sv.id}
            onChange={(e) => { const v = Number(e.target.value); setValue(v); rendererRef.current?.runtime.setVar(sv.id, v); }} />
        </label>
      )}
    </div>
  );
}
