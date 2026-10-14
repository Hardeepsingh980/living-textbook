// A block of code on an index card, with a copy button. Used by the developer dashboard and the docs.
import { useState } from 'react';
import { Icon } from './Icon';

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); }
    catch {
      const t = document.createElement('textarea'); t.value = code; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } finally { t.remove(); }
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="code-block">
      <div className="code-head">
        <span>{label ?? ''}</span>
        <button className="copy-btn" onClick={copy} aria-label={copied ? 'Copied' : 'Copy the code'}><Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}
