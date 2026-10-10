// Agent theatre: what the pipeline is doing right now, in plain words, with live timings.
import { useEffect, useState } from 'react';
import { useStore, type StageState } from '../lib/store';

const LABELS: Record<string, { title: string; verb: string }> = {
  upload: { title: 'Page', verb: 'Preparing the photo' },
  track: { title: 'Anchor', verb: 'Learning what the page looks like' },
  read: { title: 'Read', verb: 'Reading the page' },
  understand: { title: 'Understand', verb: 'Extracting every value, fact and figure' },
  build: { title: 'Build', verb: 'Composing the experience' },
  voice: { title: 'Voice', verb: 'Giving it a voice' },
  illustrate: { title: 'Illustrate', verb: 'Drawing characters and scenes' },
  verify: { title: 'Verify', verb: 'Checking against the page' },
  save: { title: 'Save', verb: 'Saving to your library' },
};

function fmt(ms: number) { return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`; }

export function Theatre({ compact = false }: { compact?: boolean }) {
  const stages = useStore((s) => s.stages);
  const status = useStore((s) => s.status);
  const startedAt = useStore((s) => s.startedAt);
  const quick = useStore((s) => s.quickPartial);
  const timings = useStore((s) => s.timings);
  const costUsd = useStore((s) => s.costUsd);
  const [now, setNow] = useState(performance.now());
  useEffect(() => { if (status !== 'generating') return; const id = setInterval(() => setNow(performance.now()), 100); return () => clearInterval(id); }, [status]);
  const elapsed = status === 'generating' ? now - startedAt : (timings?.total ?? 0);
  const order = ['upload', 'read', 'track', 'build', 'understand', 'voice', 'illustrate', 'verify', 'save'];
  const byStage = new Map<string, StageState>();
  for (const s of stages) byStage.set(s.stage, s);
  const rows = order.filter((k) => byStage.has(k)).map((k) => byStage.get(k)!);
  return (
    <div className={`theatre ${compact ? 'compact' : ''}`} aria-live="polite">
      <div className="theatre-head">
        <div className="theatre-title">{status === 'generating' ? 'Bringing the page to life' : status === 'ready' ? 'Alive' : status === 'error' ? 'Something went wrong' : 'Agent theatre'}</div>
        <div className="theatre-clock">{fmt(elapsed)}{costUsd !== undefined ? ` · $${costUsd.toFixed(3)}` : ''}</div>
      </div>
      {quick?.kind && <div className="theatre-quick">{[quick.kind, quick.subject, quick.language?.toUpperCase()].filter(Boolean).join(' · ')}{quick.title ? ` — ${quick.title}` : ''}</div>}
      <ul className="theatre-rows">
        {rows.map((s) => {
          const running = s.status === 'start';
          const dur = s.ms ?? (running ? now - startedAt - s.startedAt : (s.endedAt ?? s.startedAt) - s.startedAt);
          return (
            <li key={s.stage} className={`theatre-row ${s.status}`}>
              <span className="dot" />
              <span className="stage">{LABELS[s.stage]?.title ?? s.stage}</span>
              <span className="detail">{running ? (LABELS[s.stage]?.verb ?? s.detail) : s.detail}{s.model && !compact ? <em> · {s.model}</em> : null}</span>
              <span className="time">{fmt(Math.max(0, dur))}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
