// "Try now" on a desktop: a QR code that opens the camera on a phone, or carry on here.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Icon } from './Icon';

export function QrModal({ open, url, onClose, onContinue }: { open: boolean; url: string; onClose: () => void; onContinue: () => void }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    if (!open) return;
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2d2d2d', light: '#ffffff' } }).then(setSvg).catch(() => setSvg(''));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, url, onClose]);
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose} role="dialog" aria-modal="true" aria-label="Try it on your phone">
      <div className="modal-card enter" onClick={(e) => e.stopPropagation()}>
        <span className="tape" aria-hidden="true" />
        <h2>Try it on your phone<span className="marker-dot">.</span></h2>
        <p className="muted">Scan, then point the camera at any textbook page.</p>
        <div className="qr" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="muted small">{url.replace(/^https?:\/\//, '')}</p>
        <div className="modal-actions">
          <button className="primary" onClick={onContinue}><Icon name="camera" size={22} /> Continue here</button>
          <button className="link" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
