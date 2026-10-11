import { useEffect, useState } from 'react';
import { getLibrary, deleteLibrary, type LibraryItem } from '../lib/api';
import { Icon } from '../components/Icon';

export function LibraryView({ onOpen, onBack }: { onOpen: (id: string) => void; onBack: () => void }) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  useEffect(() => { getLibrary().then(setItems).catch(() => setItems([])); }, []);
  return (
    <div className="library">
      <div className="hud-top static"><button className="round" onClick={onBack} aria-label="Back"><Icon name="back" /></button><div className="title">Saved pages</div>
        {items && items.length > 0 && <button className="link" onClick={async () => { if (confirm('Delete all saved pages? This cannot be undone.')) { await deleteLibrary(); setItems([]); } }}><Icon name="trash" size={18} /> Delete all</button>}</div>
      {items === null && <div className="empty"><p className="muted">Opening your pages</p></div>}
      {items && items.length === 0 && <div className="empty enter"><h2>Your book is waiting to come alive.</h2><p className="muted">Point the camera at a page and it will appear here.</p><button className="primary" onClick={onBack}><Icon name="camera" /> Open camera</button></div>}
      <div className="grid">
        {items?.map((it) => (
          <button key={it.id} className="card" onClick={() => onOpen(it.id)}>
            <img src={it.pageImageUrl} alt="" loading="lazy" />
            <div className="card-title">{it.title || it.subject}</div>
            <div className="card-sub">{it.kind} · {it.language.toUpperCase()} · {new Date(it.createdAt).toLocaleDateString()}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
