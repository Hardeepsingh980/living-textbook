import { useState } from 'react';
import { useStore } from '../lib/store';

const LABEL: Record<string, { text: string; cls: string }> = {
  'verified-page': { text: 'Verified against the page', cls: 'ok' },
  'checked-independently': { text: 'Checked independently', cls: 'ok' },
  faithful: { text: 'Faithful to the page', cls: 'ok' },
  unverified: { text: 'Unverified', cls: 'warn' },
  failed: { text: 'Check failed', cls: 'bad' },
};

export function VerificationBadge() {
  const v = useStore((s) => s.verification);
  const status = useStore((s) => s.status);
  const [open, setOpen] = useState(false);
  if (!v) return status === 'generating' ? <span className="badge pending">Checking…</span> : null;
  const l = LABEL[v.status] ?? LABEL.unverified!;
  return (
    <>
      <button className={`badge ${l.cls}`} onClick={() => setOpen(true)}>{l.cls === 'ok' ? '✓ ' : l.cls === 'bad' ? '✗ ' : '? '}{l.text}</button>
      {open && (
        <div className="sheet" onClick={() => setOpen(false)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <h3>{l.text}</h3>
            <p>{v.summary}{v.repaired ? ' The scene was corrected after a failed check.' : ''}</p>
            <ul className="checks">
              {v.checks.map((c, i) => (
                <li key={i} className={c.pass ? 'pass' : 'fail'}>
                  <b>{c.pass ? '✓' : '✗'} {c.name}</b> <span className="muted">({c.method === 'page-answer' ? 'page answer' : c.method})</span>
                  {c.expected !== undefined && <div>expected <code>{String(c.expected)}</code>{c.got !== undefined && <> · got <code>{String(c.got)}</code></>}</div>}
                  <div className="muted">{c.detail}</div>
                </li>
              ))}
              {v.checks.length === 0 && <li className="muted">Nothing on this page could be checked numerically.</li>}
            </ul>
            <button className="pill" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
