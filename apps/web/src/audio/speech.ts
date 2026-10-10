// Speech sequencing: one queue, never interrupts itself. Narration for a step, then that step's character lines,
// then a short beat, then the next step. Looping keeps the experience alive after the last step.
import { mixer } from './mixer';
import type { AudioClip } from '../lib/store';

export type SpeechItem = { clip: AudioClip; onStart?: () => void; onEnd?: () => void };

export class SpeechQueue {
  private items: SpeechItem[] = [];
  private running = false;
  private current: SpeechItem | null = null;
  private generation = 0;
  onIdle: (() => void) | null = null;

  get busy() { return this.running; }
  get playing() { return this.current?.clip ?? null; }

  enqueue(...items: SpeechItem[]) { this.items.push(...items); void this.pump(); }

  /** Drop everything queued (and stop what is playing) — used when the user jumps to another step. */
  clear() { this.generation++; this.items = []; mixer.stopSpeech(); this.current = null; }

  private async pump() {
    if (this.running) return;
    this.running = true;
    const gen = this.generation;
    while (this.items.length && gen === this.generation) {
      const item = this.items.shift()!;
      this.current = item;
      item.onStart?.();
      try { await mixer.say(item.clip.id, item.clip.url); } catch { /* audio failure must not stall the experience */ }
      if (gen !== this.generation) break;
      item.onEnd?.();
      await new Promise((r) => setTimeout(r, 350));
    }
    this.current = null;
    this.running = false;
    if (gen === this.generation) this.onIdle?.();
  }
}
