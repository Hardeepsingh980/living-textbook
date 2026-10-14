// Living Textbook inside another app (an iframe from the embed SDK): /embed/lesson/<id> shows a lesson, /embed/scan
// lets a learner scan a page with the partner's publishable key. The frame tells the host page what happens
// (postMessage, source "living-textbook") and takes a few commands from it (play, pause, goTo, mute).

export const isEmbed = () => location.pathname.startsWith('/embed/');

const KEY = 'lt.embedKey';
/** The partner's publishable key: from ?key= on the frame's address (kept for the session, as the frame navigates). */
export function embedKey(): string | null {
  const q = new URLSearchParams(location.search).get('key');
  try {
    if (q) sessionStorage.setItem(KEY, q);
    return q || sessionStorage.getItem(KEY);
  } catch { return q; }
}

/** The site the frame is on: the browser's own record of the frame's ancestors, else the referrer the SDK sends. */
export function embedParent(): string {
  try {
    const anc = (location as any).ancestorOrigins as DOMStringList | undefined;
    if (anc && anc.length) return anc[0]!;
  } catch { /* not available */ }
  try { return document.referrer ? new URL(document.referrer).origin : ''; } catch { return ''; }
}

export const framed = () => { try { return window.parent !== window; } catch { return true; } };

/** Tell the host page something happened. The data is not secret (the host is showing this lesson), so any origin may read it. */
export function postToHost(type: string, data: Record<string, unknown> = {}) {
  if (!framed()) return;
  try { window.parent.postMessage({ source: 'living-textbook', version: 1, type, ...data }, '*'); } catch { /* the host is gone */ }
}

export type HostCommand = { type: 'play' } | { type: 'pause' } | { type: 'goTo'; step: number } | { type: 'mute'; muted: boolean };
/** Commands from the host page (only from the window that holds this frame). */
export function onHostCommand(handler: (cmd: HostCommand) => void): () => void {
  const on = (e: MessageEvent) => {
    if (e.source !== window.parent || window.parent === window) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.target !== 'living-textbook') return;
    if (d.type === 'play' || d.type === 'pause') handler({ type: d.type });
    else if (d.type === 'goTo' && Number.isInteger(d.step)) handler({ type: 'goTo', step: d.step });
    else if (d.type === 'mute') handler({ type: 'mute', muted: !!d.muted });
  };
  window.addEventListener('message', on);
  return () => window.removeEventListener('message', on);
}

/** The address of a lesson inside the embed, keeping the partner's key. */
export function embedLessonPath(id: string): string {
  const k = embedKey();
  return `/embed/lesson/${encodeURIComponent(id)}${k ? `?key=${encodeURIComponent(k)}` : ''}`;
}
export function embedScanPath(): string {
  const k = embedKey();
  return `/embed/scan${k ? `?key=${encodeURIComponent(k)}` : ''}`;
}
