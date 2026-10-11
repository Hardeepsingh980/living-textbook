// "Sign in with Google", drawn like every other button; the G is Google's mark in its own colours, as their
// branding asks.
import { useState } from 'react';
import { signIn, useSignInAvailable } from '../lib/firebase';
import '../learn.css';

export function GoogleMark() {
  return (
    <svg className="g" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C1 16.5 0 20.1 0 24s1 7.5 2.7 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function GoogleButton({ className = 'primary', label = 'Sign in with Google' }: { className?: string; label?: string }) {
  const available = useSignInAvailable();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!available) return null;
  return (
    <>
      <button className={`${className} google-btn`} disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await signIn(); } catch (e: any) { setError(String(e?.message || e).replace(/^Firebase: /, '')); } finally { setBusy(false); } }}>
        <GoogleMark />{busy ? 'Opening Google' : label}
      </button>
      {error && <span className="muted" role="alert">{error}</span>}
    </>
  );
}
