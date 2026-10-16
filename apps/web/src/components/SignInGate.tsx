// The signed-in parts of the app ask for an account first, and say what it brings.
import type { ReactNode } from 'react';
import { useAuthReady, useReader } from '../lib/firebase';
import { GoogleButton } from './GoogleButton';
import { GeminiSpark } from './GeminiSpark';
import { Link } from '../lib/nav';
import '../app.css';

export function SignInGate({ children, title = 'Sign in to continue', line }: { children: ReactNode; title?: string; line?: string }) {
  const ready = useAuthReady();
  const reader = useReader();
  if (!ready) return <div className="gate-wait"><GeminiSpark state="thinking" size={34} /></div>;
  if (reader) return <>{children}</>;
  return (
    <div className="gate paper enter-page">
      <div className="gate-card">
        <span className="tape" aria-hidden="true" />
        <Link to="/" className="wordmark"><span className="mark" />Living Textbook</Link>
        <h1>{title}<span className="marker-dot">.</span></h1>
        {line && <p className="muted">{line}</p>}
        <ul className="gate-list">
          <li>Every page that you bring to life, kept in your library, on any device</li>
          <li>Short videos from any page, with the tutor's voice</li>
          <li>Chapter films to show your class</li>
          <li>Your quiz scores, your streak and what to learn next</li>
        </ul>
        <GoogleButton />
        <Link to="/" className="link">Back to the homepage</Link>
      </div>
    </div>
  );
}
