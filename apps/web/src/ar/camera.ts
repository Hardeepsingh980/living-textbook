// One camera session for the whole app: the stream and <video> survive the route change from capture to
// experience, so AR tracking can start from the exact frame the user captured.
import { PageTracker } from './PageTracker';

export const CANONICAL_WIDTH = 1000; // page units; the server resizes the uploaded photo to this width too

export class CameraSession {
  static current: CameraSession | null = null;
  video: HTMLVideoElement;
  stream: MediaStream | null = null;
  tracker = new PageTracker();
  vw = 0; vh = 0;
  sim = false;
  private simStop: (() => void) | null = null;

  constructor() {
    this.video = document.createElement('video');
    this.video.autoplay = true; this.video.muted = true; this.video.playsInline = true;
    this.video.setAttribute('playsinline', ''); this.video.setAttribute('muted', '');
    this.video.className = 'camera-video';
  }

  static getOrCreate() { return (CameraSession.current ??= new CameraSession()); }

  async start(opts: { sim?: number } = {}) {
    if (this.stream) return { vw: this.vw, vh: this.vh };
    if (opts.sim) { this.stream = simulatedStream(opts.sim, (stop) => { this.simStop = stop; }); this.sim = true; }
    else this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    this.video.srcObject = this.stream;
    await new Promise<void>((r) => { if (this.video.readyState >= 1) r(); else this.video.onloadedmetadata = () => r(); });
    await this.video.play();
    this.vw = this.video.videoWidth; this.vh = this.video.videoHeight;
    return { vw: this.vw, vh: this.vh };
  }

  prewarmP: Promise<void> | null = null;
  async prewarm() { if (this.tracker.state === 'idle') { this.prewarmP = this.tracker.prewarm(this.video, CANONICAL_WIDTH); await this.prewarmP; } }

  /** Greyscale canonical frame (same pixels the tracker would use) without touching the tracker. */
  captureCanonical(): Uint8Array {
    const tw = CANONICAL_WIDTH, th = Math.round(tw * this.vh / this.vw);
    const c = document.createElement('canvas'); c.width = tw; c.height = th;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.video, 0, 0, tw, th);
    const img = ctx.getImageData(0, 0, tw, th).data;
    const grey = new Uint8Array(tw * th);
    for (let i = 0, j = 0; i < grey.length; i++, j += 4) grey[i] = (img[j]! * 0.299 + img[j + 1]! * 0.587 + img[j + 2]! * 0.114) | 0;
    return grey;
  }

  /** Capture the current frame: full-resolution JPEG for the server, canonical grey for tracking, preview URL. */
  async capture(): Promise<{ blob: Blob; previewUrl: string; size: { w: number; h: number }; grey: Uint8Array | null }> {
    const full = document.createElement('canvas'); full.width = this.vw; full.height = this.vh;
    full.getContext('2d')!.drawImage(this.video, 0, 0, this.vw, this.vh);
    const blob = await new Promise<Blob>((r) => full.toBlob((b) => r(b!), 'image/jpeg', 0.9));
    let grey: Uint8Array | null = null;
    const st = this.tracker.state;
    if (st === 'ready' || st === 'tracking' || st === 'lost' || st === 'searching') {
      grey = this.tracker.captureFrame().grey;
      void this.tracker.seedFromCapture(grey);
    } else if (st === 'prewarming' && this.prewarmP) {
      // the reader tapped before the kernels were ready: keep this frame and seed as soon as they are
      const frame = this.captureCanonical();
      grey = frame;
      this.prewarmP.then(() => this.tracker.seedFromCapture(frame)).catch(() => {});
    }
    return { blob, previewUrl: URL.createObjectURL(blob), size: { w: this.vw, h: this.vh }, grey };
  }

  attach(container: HTMLElement) { if (this.video.parentElement !== container) container.prepend(this.video); }
  detach() { this.video.remove(); }

  stop() {
    this.tracker.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.simStop?.(); this.simStop = null;
    this.stream = null; this.video.srcObject = null; this.detach();
    if (CameraSession.current === this) CameraSession.current = null;
  }
}

/** Desktop/CI stand-in for the camera: a drawn textbook page that drifts, rotates and scales. */
function simulatedStream(motion: number, onStop: (stop: () => void) => void): MediaStream {
  const W = 1080, H = 1920, pageW = 1000, pageH = 1400;
  const pageCanvas = document.createElement('canvas'); pageCanvas.width = pageW; pageCanvas.height = pageH;
  const pc = pageCanvas.getContext('2d')!;
  pc.fillStyle = '#fdfbf5'; pc.fillRect(0, 0, pageW, pageH);
  pc.fillStyle = '#222'; pc.font = '19px Georgia, serif';
  const words = 'When a body falls freely under gravity its velocity increases uniformly with time. The acceleration due to gravity near the surface of the Earth is about 9.8 metres per second squared. A ball dropped from a height h reaches the ground after time t given by h equals half g t squared. Galileo showed that all bodies fall at the same rate in the absence of air resistance. Example 2.3: a stone is dropped from a tower 20 m high; find the time it takes to reach the ground and its speed on impact. Solution: from h = ½gt², t = √(2h/g) = √(40/9.8) ≈ 2.02 s, and v = gt ≈ 19.8 m/s.'.split(' ');
  let wi = 0;
  for (let y = 80; y < pageH - 60; y += 28) {
    if (y > 500 && y < 920) continue;
    let line = ''; while (pc.measureText(line + words[wi % words.length] + ' ').width < pageW - 150) { line += words[wi % words.length] + ' '; wi++; }
    pc.fillText(line, 70, y + 14);
  }
  pc.font = 'bold 30px Georgia, serif'; pc.fillText('2.4 Motion under gravity', 70, 60);
  pc.fillStyle = '#fff'; pc.fillRect(120, 520, pageW - 240, 380); pc.strokeStyle = '#333'; pc.lineWidth = 3; pc.strokeRect(120, 520, pageW - 240, 380);
  pc.fillStyle = '#e63946'; pc.beginPath(); pc.arc(240, 640, 60, 0, Math.PI * 2); pc.fill();
  pc.strokeStyle = '#1d3557'; pc.lineWidth = 8; pc.beginPath(); pc.arc(540, 740, 90, 0, Math.PI * 2); pc.stroke();
  pc.strokeStyle = '#2a9d8f'; pc.lineWidth = 6; pc.beginPath(); pc.moveTo(180, 860); pc.lineTo(420, 580); pc.lineTo(680, 820); pc.closePath(); pc.stroke();
  pc.fillStyle = '#000'; pc.font = '36px sans-serif'; pc.fillText('h = ½ g t²', 320, 870);
  const cam = document.createElement('canvas'); cam.width = W; cam.height = H;
  const cc = cam.getContext('2d')!;
  const t0 = performance.now(); let raf = 0;
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    cc.fillStyle = '#6b6b6b'; cc.fillRect(0, 0, W, H);
    cc.save();
    cc.translate(W / 2 + Math.sin(t * 0.7) * 60 * motion, H / 2 + Math.cos(t * 0.5) * 40 * motion);
    cc.rotate(Math.sin(t * 0.6) * 0.12 * motion);
    const sc = 0.95 + Math.sin(t * 0.4) * 0.06 * motion; cc.scale(sc, sc);
    cc.drawImage(pageCanvas, -pageW / 2, -pageH / 2);
    cc.restore();
    raf = requestAnimationFrame(draw);
  };
  draw();
  onStop(() => cancelAnimationFrame(raf));
  return (cam as any).captureStream(30) as MediaStream;
}
