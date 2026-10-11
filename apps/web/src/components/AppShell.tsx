// The signed-in app: a header with the main places (Home, Library, Progress), a "New" button for everything that
// makes something, the reader's menu; on phones the places move to a tab bar at the bottom.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, navigate } from '../lib/nav';
import { useReader, signOut } from '../lib/firebase';
import { Icon } from './Icon';
import { NewSheet } from './NewSheet';
import '../app.css';

export type Place = 'home' | 'library' | 'progress' | 'new' | 'job';

export function Avatar({ small = false }: { small?: boolean }) {
  const r = useReader();
  if (!r) return null;
  return r.photo ? <img className={`avatar ${small ? 'small' : ''}`} src={r.photo} alt="" referrerPolicy="no-referrer" /> : <span className={`avatar ${small ? 'small' : ''}`}>{(r.name || r.email || '?').slice(0, 1).toUpperCase()}</span>;
}

export function AppShell({ place, children, onPhoto }: { place: Place; children: ReactNode; onPhoto: (f: File) => void }) {
  const reader = useReader();
  const [newOpen, setNewOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener('mousedown', off); return () => window.removeEventListener('mousedown', off);
  }, [menu]);
  const tab = (to: string, p: Place, icon: string, label: string) => (
    <Link to={to} className={`tab ${place === p ? 'on' : ''}`} aria-current={place === p ? 'page' : undefined}><Icon name={icon} size={22} /><span>{label}</span></Link>
  );
  return (
    <div className="app paper">
      <header className="app-top">
        <Link to="/app" className="wordmark"><span className="mark" />Living Textbook</Link>
        <nav className="app-nav" aria-label="Main">
          <Link to="/app" className={place === 'home' ? 'on' : ''}>Home</Link>
          <Link to="/app/library" className={place === 'library' ? 'on' : ''}>Library</Link>
          <Link to="/app/progress" className={place === 'progress' ? 'on' : ''}>Progress</Link>
        </nav>
        <div className="app-top-right">
          <button className="primary new-btn" onClick={() => setNewOpen(true)}><Icon name="plus" size={20} />New</button>
          {reader && (
            <div className="account" ref={menuRef}>
              <button className="me-btn" onClick={() => setMenu((m) => !m)} aria-label="Account" aria-expanded={menu}><Avatar small /></button>
              {menu && (
                <div className="menu enter" role="menu">
                  <div className="menu-who"><b>{reader.name || 'Reader'}</b><span>{reader.email}</span></div>
                  <Link to="/" role="menuitem" onClick={() => setMenu(false)}>Homepage</Link>
                  <button role="menuitem" onClick={async () => { setMenu(false); await signOut(); navigate('/'); }}>Sign out</button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>
      <main className="app-main">{children}</main>
      <nav className="tabbar" aria-label="Main">
        {tab('/app', 'home', 'home', 'Home')}
        {tab('/app/library', 'library', 'library', 'Library')}
        <button className="tab tab-new" onClick={() => setNewOpen(true)} aria-label="New"><span className="tab-plus"><Icon name="plus" size={26} /></span></button>
        {tab('/app/progress', 'progress', 'chart', 'Progress')}
        <Link to="/" className="tab"><Icon name="user" size={22} /><span>Site</span></Link>
      </nav>
      {newOpen && <NewSheet onClose={() => setNewOpen(false)} onPhoto={onPhoto} />}
    </div>
  );
}
