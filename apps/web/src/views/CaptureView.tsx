// Capture: live camera with framing guidance and a quality gate, or an uploaded photo. The "Bring it to life"
// tap unlocks audio and starts the pipeline.
import { useEffect, useRef, useState } from 'react';
import { mixer } from '../audio/mixer';
import { quality } from '../lib/quality';

type Props = { onCapture: (blob: Blob, preview: string, size: { w: number; h: number }) => void; onLibrary: () => void };

export function CaptureView({ onCapture, onLibrary }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hint, setHint] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const gateRef = useRef<number | null>(null);

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await new Promise<void>((r) => { v.onloadedmetadata = () => r(); });
      await v.play();
      v.setAttribute('width', String(v.videoWidth)); v.setAttribute('height', String(v.videoHeight));
      setCameraOn(true);
      gateRef.current = window.setInterval(checkQuality, 700);
    } catch (e: any) {
      setCameraError(e?.name === 'NotAllowedError' ? 'Camera permission was denied. You can still upload a photo.' : `Camera unavailable (${e?.message || e}). You can upload a photo instead.`);
    }
  }
  function stopCamera() {
    if (gateRef.current) clearInterval(gateRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null; setCameraOn(false);
  }
  useEffect(() => () => stopCamera(), []);

  function checkQuality() {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = 320; c.height = Math.round((320 * v.videoHeight) / v.videoWidth);
    const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(v, 0, 0, c.width, c.height);
    const q = quality(ctx.getImageData(0, 0, c.width, c.height));
    setHint(q.blur < 60 ? 'Hold still — the image is blurry' : q.mean < 70 ? 'Too dark — add some light' : q.mean > 235 ? 'Too bright — avoid glare' : '');
  }

  async function captureFromCamera() {
    const v = videoRef.current; if (!v) return;
    setBusy(true); mixer.unlock();
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
    stopCamera();
    onCapture(blob, URL.createObjectURL(blob), { w: c.width, h: c.height });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true); mixer.unlock();
    const bmp = await createImageBitmap(f).catch(() => null);
    if (!bmp) { setCameraError('That file is not an image.'); setBusy(false); return; }
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
    stopCamera();
    onCapture(blob, URL.createObjectURL(blob), { w: c.width, h: c.height });
  }

  return (
    <div className="capture">
      <video ref={videoRef} className={`capture-video ${cameraOn ? 'on' : ''}`} autoPlay muted playsInline />
      {!cameraOn && (
        <div className="capture-intro">
          <div className="logo">Living Book</div>
          <p>Point your phone at any page of any book, and watch it come alive.</p>
          <button className="primary" onClick={startCamera} disabled={busy}>Open camera</button>
          <label className="secondary">Upload a page photo<input type="file" accept="image/*" onChange={onFile} hidden /></label>
          <button className="link" onClick={onLibrary}>My library</button>
          {cameraError && <div className="note">{cameraError}</div>}
        </div>
      )}
      {cameraOn && (
        <>
          <div className="guide"><div className="guide-frame" /><div className="guide-text">{hint || 'Fit the whole page inside the frame'}</div></div>
          <div className="capture-actions">
            <label className="secondary small">Upload<input type="file" accept="image/*" onChange={onFile} hidden /></label>
            <button className="primary big" onClick={captureFromCamera} disabled={busy}>Bring it to life</button>
            <button className="secondary small" onClick={stopCamera}>Close</button>
          </div>
        </>
      )}
    </div>
  );
}
