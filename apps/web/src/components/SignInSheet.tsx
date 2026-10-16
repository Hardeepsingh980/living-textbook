// A gentle stop: the free pages for today are used up (or the thing asked for needs an account).
import { useEffect } from 'react';
import { useReader } from '../lib/firebase';
import { GoogleButton } from './GoogleButton';

export function SignInSheet({ message, onClose }: { message: string; onClose: () => void }) {
  const reader = useReader();
  useEffect(() => { if (reader) onClose(); }, [reader, onClose]);
  return (
    <div className="sheet-back" onClick={onClose} role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="new-sheet signin-sheet enter" onClick={(e) => e.stopPropagation()}>
        <span className="tape" aria-hidden="true" />
        <h2>Keep going<span className="marker-dot">.</span></h2>
        <p>{message}</p>
        <GoogleButton label="Sign in with Google (free)" />
        <button className="link" onClick={onClose}>Not now</button>
      </div>
    </div>
  );
}
