// The first page of the sketchbook: one line, three drawings that explain the whole product, one button.
import { Icon } from '../components/Icon';

type Props = { onScan: () => void; onPhoto: (file: File) => void; onLibrary: () => void; onReel?: () => void };

export function LandingView({ onScan, onPhoto, onLibrary, onReel }: Props) {
  return (
    <div className="landing paper enter-page">
      <div className="landing-inner">
        <div className="wordmark"><span className="mark" />Living Book</div>
        <h1>Point at a page.<br />Watch it come alive<span className="bang">!</span></h1>
        <ol className="how">
          <li className="how-step" style={{ transform: 'rotate(-2deg)' }}>
            <PointSketch />
            <span className="how-word">Point</span>
          </li>
          <li className="how-arrow" aria-hidden="true"><svg viewBox="0 0 60 30" fill="none" stroke="#2d5da1" strokeWidth="3" strokeLinecap="round"><path d="M4 18 C 20 6, 36 6, 54 14" strokeDasharray="6 6" /><path d="M46 8 L 54 14 L 45 19" /></svg></li>
          <li className="how-step" style={{ transform: 'rotate(1.5deg)' }}>
            <AliveSketch />
            <span className="how-word">It moves</span>
          </li>
          <li className="how-arrow" aria-hidden="true"><svg viewBox="0 0 60 30" fill="none" stroke="#2d5da1" strokeWidth="3" strokeLinecap="round"><path d="M4 18 C 20 6, 36 6, 54 14" strokeDasharray="6 6" /><path d="M46 8 L 54 14 L 45 19" /></svg></li>
          <li className="how-step" style={{ transform: 'rotate(-1deg)' }}>
            <TalkSketch />
            <span className="how-word">Ask it</span>
          </li>
        </ol>
        <div className="actions">
          <button className="primary big" onClick={onScan}><Icon name="camera" size={26} /> Open camera</button>
          <div className="actions-row-landing">
            <label className="secondary"><Icon name="upload" size={20} /> Use a photo<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); }} /></label>
            {onReel && <button className="secondary" onClick={onReel}><Icon name="film" size={20} /> Make a reel</button>}
          </div>
          <button className="link" onClick={onLibrary}>Saved pages</button>
        </div>
      </div>
    </div>
  );
}

/** A phone held over a page, the page framed in pencil. */
function PointSketch() {
  return (
    <svg className="how-art" viewBox="0 0 160 150" fill="none" stroke="#2d2d2d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 128 C 50 122, 100 124, 142 130 L 138 60 C 100 56, 54 58, 22 54 Z" fill="#ffffff" />
      <path d="M36 76 h 70 M36 92 h 56 M36 108 h 64" stroke="#2d2d2d" opacity="0.45" strokeWidth="2.5" />
      <rect x="54" y="8" width="52" height="92" rx="9" fill="#fff9c4" transform="rotate(-8 80 54)" />
      <rect x="62" y="18" width="36" height="66" rx="3" fill="#ffffff" transform="rotate(-8 80 54)" />
      <path d="M68 44 h 24 M68 54 h 18" stroke="#2d5da1" strokeWidth="2.5" transform="rotate(-8 80 54)" />
      <path d="M62 30 l 6 -6 M98 30 l -6 -6 M62 82 l 6 6 M98 82 l -6 6" stroke="#ff4d4d" strokeWidth="3" transform="rotate(-8 80 54)" />
    </svg>
  );
}
/** The diagram lifting off the page: a ball on a path, a note with a live value. */
function AliveSketch() {
  return (
    <svg className="how-art" viewBox="0 0 160 150" fill="none" stroke="#2d2d2d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 128 C 50 122, 100 124, 142 130 L 138 60 C 100 56, 54 58, 22 54 Z" fill="#ffffff" />
      <path d="M36 112 h 90" stroke="#2d2d2d" opacity="0.45" strokeWidth="2.5" />
      <path d="M40 92 C 60 30, 100 30, 124 94" strokeDasharray="7 6" stroke="#2d5da1" />
      <g className="float"><circle cx="84" cy="36" r="12" fill="#ff4d4d" /></g>
      <g transform="rotate(-6 118 22)"><rect x="92" y="8" width="56" height="26" rx="6" fill="#fff9c4" /><text x="120" y="27" textAnchor="middle" fontFamily="Kalam, sans-serif" fontSize="14" fill="#2d2d2d" stroke="none">h = 20 m</text></g>
      <path d="M26 22 c 2 7 7 12 14 14 c -7 2 -12 7 -14 14 c -2 -7 -7 -12 -14 -14 c 7 -2 12 -7 14 -14 z" fill="#ff4d4d" stroke="none" />
    </svg>
  );
}
/** A speech bubble to the page, and its answer. */
function TalkSketch() {
  return (
    <svg className="how-art" viewBox="0 0 160 150" fill="none" stroke="#2d2d2d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 128 C 50 122, 100 124, 142 130 L 138 60 C 100 56, 54 58, 22 54 Z" fill="#ffffff" />
      <path d="M36 80 h 50 M36 96 h 64" stroke="#2d2d2d" opacity="0.45" strokeWidth="2.5" />
      <g transform="rotate(-3 60 30)"><path d="M14 14 h 78 a 8 8 0 0 1 8 8 v 22 a 8 8 0 0 1 -8 8 h -44 l -12 12 v -12 h -22 a 8 8 0 0 1 -8 -8 v -22 a 8 8 0 0 1 8 -8 z" fill="#ffffff" /><text x="56" y="38" textAnchor="middle" fontFamily="Patrick Hand, sans-serif" fontSize="15" fill="#2d2d2d" stroke="none">what if g doubles?</text></g>
      <g transform="rotate(3 112 112)"><path d="M72 100 h 66 a 7 7 0 0 1 7 7 v 18 a 7 7 0 0 1 -7 7 h -40 l -10 10 v -10 h -16 a 7 7 0 0 1 -7 -7 v -18 a 7 7 0 0 1 7 -7 z" fill="#fff9c4" /><text x="108" y="120" textAnchor="middle" fontFamily="Patrick Hand, sans-serif" fontSize="14" fill="#2d2d2d" stroke="none">it falls in 1.4 s</text></g>
      <path d="M128 62 c 2 7 7 12 14 14 c -7 2 -12 7 -14 14 c -2 -7 -7 -12 -14 -14 c 7 -2 12 -7 14 -14 z" fill="#ff4d4d" stroke="none" />
    </svg>
  );
}
