// The intelligence indicator: a small spark, never a chatbot avatar. Idle sits still; thinking pulses softly;
// speaking keeps a gentle rhythm with the narration; listening turns green; error goes neutral.
export type SparkState = 'idle' | 'thinking' | 'speaking' | 'listening' | 'error';

export function GeminiSpark({ state = 'idle', size = 22, className = '' }: { state?: SparkState; size?: number; className?: string }) {
  return (
    <span className={`spark ${state} ${className}`} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2c.6 4.9 4.1 8.4 10 10-5.9 1.6-9.4 5.1-10 10-.6-4.9-4.1-8.4-10-10 5.9-1.6 9.4-5.1 10-10z" />
      </svg>
    </span>
  );
}
