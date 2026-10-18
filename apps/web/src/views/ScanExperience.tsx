// Scan: the camera opens straight away, a pencil-drawn frame shows where the page should sit, and one button
// brings it to life. While the reader frames the page the tracker warms up and a quality gate gives one quiet hint.
import { useEffect, useRef, useState } from 'react';
import { mixer } from '../audio/mixer';
import { quality } from '../lib/quality';
import { CameraSession } from '../ar/camera';
import { readyStoryAudio } from '../lib/stories';
import { Icon } from '../components/Icon';
import { GeminiSpark } from '../components/GeminiSpark';

export type CaptureResult = { blob: Blob; previewUrl: string; size: { w: number; h: number }; session: CameraSession | null };
/** `embed`: the scanner inside a partner's app; leaving it closes the scanner there. */
type Props = { onCapture: (r: CaptureResult) => void; onBack: () => void; autoStart?: boolean; embed?: boolean };

/** A chosen picture becomes a capture (resized like a camera frame); null when the file is not an image. */
export async function fileToCapture(f: File): Promise<CaptureResult | null> {
  mixer.unlock();
  const bmp = await createImageBitmap(f).catch(() => null);
  if (!bmp) return null;
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
  CameraSession.current?.stop();
  return { blob, previewUrl: URL.createObjectURL(blob), size: { w: c.width, h: c.height }, session: null };
}

// a hand-drawn rectangle: four slightly bowed sides with overshooting corners, like a quick pencil frame
const FRAME_PATH = 'M 6 10 C 40 4, 70 7, 100 6 C 96 40, 98 70, 97 94 C 70 97, 36 96, 4 95 C 7 66, 5 38, 6 10 Z';

export function ScanExperience({ onCapture, onBack, autoStart = false, embed = false }: Props) {
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
      await session.start({ sim: simParam, simPage: new URLSearchParams(location.search).get('simpage') });
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
  useEffect(() => { if (autoStart) void startCamera(); return () => { if (gateRef.current) clearInterval(gateRef.current); }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function checkQuality(session: CameraSession) {
    const v = session.video; if (!v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = 320; c.height = Math.round((320 * v.videoHeight) / v.videoWidth);
    const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(v, 0, 0, c.width, c.height);
    const q = quality(ctx.getImageData(0, 0, c.width, c.height));
    setHint(q.blur < 60 ? 'Hold still for a moment' : q.mean < 70 ? 'Add a little more light' : q.mean > 235 ? 'Tilt the phone away from the shine' : '');
  }

  async function captureFromCamera() {
    const session = CameraSession.current; if (!session) return;
    setBusy(true); mixer.unlock(); readyStoryAudio(); // the tap readies sound for a story film found on this page
    if (gateRef.current) clearInterval(gateRef.current);
    const { blob, previewUrl, size } = await session.capture();
    onCapture({ blob, previewUrl, size, session });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true);
    const r = await fileToCapture(f);
    if (!r) { setCameraError('That file is not a picture.'); setBusy(false); return; }
    if (gateRef.current) clearInterval(gateRef.current);
    setCameraOn(false);
    onCapture(r);
  }

  return (
    <div className={`capture ${cameraOn ? '' : 'paper'}`}>
      <div ref={stageRef} className={`capture-stage ${cameraOn ? 'on' : ''}`} />
      {!cameraOn && (
        <div className="capture-intro enter">
          <GeminiSpark state={cameraError ? 'error' : 'thinking'} size={30} />
          <h1>{cameraError ? 'No camera here' : 'Opening the camera'}</h1>
          {cameraError && <p className="lede">{cameraError}</p>}
          <div className="actions">
            {cameraError && <button className="primary" onClick={startCamera} disabled={busy}><Icon name="camera" /> Try the camera again</button>}
            <label className="secondary"><Icon name="upload" size={18} /> Use a photo<input type="file" accept="image/*" onChange={onFile} hidden /></label>
            <button className="link" onClick={onBack}>{embed ? 'Close' : 'Back'}</button>
          </div>
        </div>
      )}
      {cameraOn && (
        <>
          <div className="guide">
            <div className={`guide-frame ${trackerState === 'ready' ? 'ready' : ''}`}><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={FRAME_PATH} vectorEffect="non-scaling-stroke" /></svg></div>
            <div className="guide-text"><span>{trackerState !== 'ready' && trackerState !== 'unavailable' ? <GeminiSpark state="thinking" size={16} /> : null}{hint || (trackerState === 'ready' || trackerState === 'unavailable' ? 'Fit the whole page in the frame' : 'Getting ready')}</span></div>
          </div>
          {busy && <div className="scan-reading" role="status"><GeminiSpark state="thinking" size={20} />Reading the page</div>}
          <div className="capture-actions">
            <label className="round" aria-label="Use a photo"><Icon name="upload" /><input type="file" accept="image/*" onChange={onFile} hidden /></label>
            <button className="primary big" onClick={captureFromCamera} disabled={busy}>Bring it to life</button>
            <button className="round" onClick={() => { closeCamera(); onBack(); }} aria-label="Close"><Icon name="close" /></button>
          </div>
        </>
      )}
    </div>
  );
}
