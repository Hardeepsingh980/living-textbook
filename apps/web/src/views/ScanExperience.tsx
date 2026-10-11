// Scan: almost nothing on screen. Point at a page, the spark says it will bring it to life. While the reader frames
// the page the tracker warms up, a quality gate gives one quiet hint, and "Bring it to life" starts the transformation.
import { useEffect, useRef, useState } from 'react';
import { mixer } from '../audio/mixer';
import { quality } from '../lib/quality';
import { CameraSession } from '../ar/camera';
import { Icon } from '../components/Icon';
import { GeminiSpark } from '../components/GeminiSpark';

export type CaptureResult = { blob: Blob; previewUrl: string; size: { w: number; h: number }; session: CameraSession | null };
type Props = { onCapture: (r: CaptureResult) => void; onLibrary: () => void };

export function ScanExperience({ onCapture, onLibrary }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const [trackerState, setTrackerState] = useState('');
  const [busy, setBusy] = useState(false);
  const gateRef = useRef<number | null>(null);
  const simParam = Number(new URLSearchParams(location.search).get('sim')) || 0;

  async function startCamera() {
    setCameraError(null);
    try {
      const session = CameraSession.getOrCreate();
      await session.start({ sim: simParam });
      session.attach(stageRef.current!);
      setCameraOn(true);
      gateRef.current = window.setInterval(() => checkQuality(session), 700);
      session.tracker.onLog = (m) => console.log('[tracker]', m);
      setTrackerState('warming up');
      session.prewarm().then(() => setTrackerState('ready')).catch((e) => { console.warn('prewarm failed', e); setTrackerState('unavailable'); });
    } catch (e: any) {
      setCameraError(e?.name === 'NotAllowedError' ? 'The camera is not allowed. You can still use a photo of the page.' : 'The camera is not available here. You can use a photo of the page instead.');
    }
  }
  function closeCamera() {
    if (gateRef.current) clearInterval(gateRef.current);
    CameraSession.current?.stop();
    setCameraOn(false);
  }
  useEffect(() => () => { if (gateRef.current) clearInterval(gateRef.current); }, []);

  function checkQuality(session: CameraSession) {
    const v = session.video; if (!v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = 320; c.height = Math.round((320 * v.videoHeight) / v.videoWidth);
    const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(v, 0, 0, c.width, c.height);
    const q = quality(ctx.getImageData(0, 0, c.width, c.height));
    setHint(q.blur < 60 ? 'Hold still for a moment' : q.mean < 70 ? 'A little more light would help' : q.mean > 235 ? 'Tilt away from the glare' : '');
  }

  async function captureFromCamera() {
    const session = CameraSession.current; if (!session) return;
    setBusy(true); mixer.unlock();
    if (gateRef.current) clearInterval(gateRef.current);
    const { blob, previewUrl, size } = await session.capture();
    onCapture({ blob, previewUrl, size, session });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true); mixer.unlock();
    const bmp = await createImageBitmap(f).catch(() => null);
    if (!bmp) { setCameraError('That file is not a picture.'); setBusy(false); return; }
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
    closeCamera();
    onCapture({ blob, previewUrl: URL.createObjectURL(blob), size: { w: c.width, h: c.height }, session: null });
  }

  return (
    <div className="capture">
      <div ref={stageRef} className={`capture-stage ${cameraOn ? 'on' : ''}`} />
      {!cameraOn && (
        <div className="capture-intro enter">
          <div className="wordmark"><span className="mark" />Living Book</div>
          <h1>Point at a page</h1>
          <GeminiSpark size={28} />
          <p className="lede">I'll bring it to life.</p>
          <div className="actions">
            <button className="primary big" onClick={startCamera} disabled={busy}><Icon name="camera" /> Open camera</button>
            <label className="secondary"><Icon name="upload" size={18} /> Use a photo<input type="file" accept="image/*" onChange={onFile} hidden /></label>
            <button className="link" onClick={onLibrary}><Icon name="library" size={18} /> Saved pages</button>
          </div>
          {cameraError && <div className="note">{cameraError}</div>}
        </div>
      )}
      {cameraOn && (
        <>
          <div className="guide">
            <div className={`guide-frame ${trackerState === 'ready' ? 'ready' : ''}`}><i /></div>
            <div className="guide-text"><span>{trackerState !== 'ready' && trackerState !== 'unavailable' ? <GeminiSpark state="thinking" size={16} /> : null}{hint || (trackerState === 'ready' || trackerState === 'unavailable' ? 'Fit the whole page in the frame' : 'Getting ready')}</span></div>
          </div>
          <div className="capture-actions">
            <label className="round" aria-label="Use a photo"><Icon name="upload" /><input type="file" accept="image/*" onChange={onFile} hidden /></label>
            <button className="primary big" onClick={captureFromCamera} disabled={busy}>Bring it to life</button>
            <button className="round" onClick={closeCamera} aria-label="Close"><Icon name="close" /></button>
          </div>
        </>
      )}
    </div>
  );
}
