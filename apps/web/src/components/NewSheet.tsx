// Everything that makes something, in one place: a lesson from the camera or a photo, a short video, a chapter film.
import { useEffect } from 'react';
import { navigate } from '../lib/nav';
import { Icon } from './Icon';

export function NewSheet({ onClose, onPhoto }: { onClose: () => void; onPhoto: (f: File) => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const go = (to: string) => { onClose(); navigate(to); };
  return (
    <div className="sheet-back" onClick={onClose} role="dialog" aria-modal="true" aria-label="Make something new">
      <div className="new-sheet enter" onClick={(e) => e.stopPropagation()}>
        <span className="tape" aria-hidden="true" />
        <h2>Make something<span className="marker-dot">.</span></h2>
        <div className="new-grid">
          <button className="new-card" onClick={() => go('/scan')}><span className="new-icon"><Icon name="camera" size={28} /></span><b>Scan a page</b><span>Point the camera. The page comes alive.</span></button>
          <label className="new-card"><span className="new-icon"><Icon name="upload" size={28} /></span><b>Upload a photo</b><span>A photo of a page you already took</span>
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { onClose(); onPhoto(f); } e.target.value = ''; }} /></label>
          <button className="new-card" onClick={() => go('/app/new/short')}><span className="new-icon"><Icon name="film" size={28} /></span><b>Short video</b><span>One page becomes a video with a voice</span></button>
          <button className="new-card" onClick={() => go('/app/new/story')}><span className="new-icon"><Icon name="play" size={28} /></span><b>A story comes alive</b><span>Story pages become a film you play with</span></button>
          <button className="new-card" onClick={() => go('/app/new/chapter')}><span className="new-icon"><Icon name="doc" size={28} /></span><b>Chapter film</b><span>A chapter PDF becomes a film for your class</span></button>
        </div>
        <button className="link" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
