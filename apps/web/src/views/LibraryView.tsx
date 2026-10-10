import { useEffect, useState } from 'react';
import { getLibrary, deleteLibrary, type LibraryItem } from '../lib/api';

export function LibraryView({ onOpen, onBack }: { onOpen: (id: string) => void; onBack: () => void }) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  useEffect(() => { getLibrary().then(setItems).catch(() => setItems([])); }, []);
  return (
    <div className="library">
      <div className="hud-top static"><button className="icon" onClick={onBack}>←</button><div className="title">My library</div>
        <button className="link" onClick={async () => { if (confirm('Delete all saved pages? This cannot be undone.')) { await deleteLibrary(); setItems([]); } }}>Delete all</button></div>
      {items === null && <div className="note">Loading…</div>}
      {items && items.length === 0 && <div className="note">No pages yet. Capture one to see it here.</div>}
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
