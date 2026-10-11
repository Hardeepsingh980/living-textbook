// The first page of the sketchbook: one line, one drawing, one button. Everything else is a tap away.
import { Icon } from '../components/Icon';

type Props = { onScan: () => void; onPhoto: (file: File) => void; onLibrary: () => void };

export function LandingView({ onScan, onPhoto, onLibrary }: Props) {
  return (
    <div className="landing paper enter-page">
      <div className="landing-inner">
        <div className="wordmark"><span className="mark" />Living Book</div>
        <h1>Point at a page.<br />Watch it come alive<span className="bang">!</span></h1>
        <PageSketch />
        <div className="actions">
          <button className="primary big" onClick={onScan}><Icon name="camera" size={26} /> Open camera</button>
          <label className="secondary"><Icon name="upload" size={20} /> Use a photo<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); }} /></label>
          <button className="link" onClick={onLibrary}>Saved pages</button>
        </div>
      </div>
    </div>
  );
}

/** A book page sketched in pencil, with its diagram lifting off as the spark touches it. */
function PageSketch() {
  return (
    <svg className="sketch" viewBox="0 0 300 220" fill="none" stroke="#2d2d2d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M38 24 C 120 16, 200 20, 262 26 L 258 196 C 190 204, 110 200, 42 194 Z" fill="#ffffff" />
      <path d="M62 60 h 110 M62 80 h 150 M62 100 h 130 M62 120 h 90" strokeWidth="2.5" stroke="#2d2d2d" opacity="0.5" />
      <g className="float">
        <rect x="150" y="104" width="86" height="70" rx="8" ry="14" fill="#fff9c4" transform="rotate(-6 193 139)" />
        <circle cx="178" cy="142" r="12" fill="#ff4d4d" stroke="#2d2d2d" transform="rotate(-6 193 139)" />
        <path d="M196 158 L 222 118 L 230 160 Z" fill="#ffffff" transform="rotate(-6 193 139)" />
        <path d="M156 140 C 170 120, 190 118, 212 112" strokeDasharray="6 6" stroke="#2d5da1" transform="rotate(-6 193 139)" />
      </g>
      <g transform="translate(236 70)">
        <path d="M0 -14 c 2 9 8 15 16 17 c -8 2 -14 8 -16 17 c -2 -9 -8 -15 -16 -17 c 8 -2 14 -8 16 -17 z" fill="#ff4d4d" stroke="none" />
      </g>
      <path d="M40 176 C 70 150, 110 150, 142 166" strokeDasharray="7 7" stroke="#2d5da1" />
      <path d="M134 158 L 142 166 L 131 170" stroke="#2d5da1" />
    </svg>
  );
}

