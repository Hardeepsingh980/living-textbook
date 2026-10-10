// Web Audio mixer: narration/line clips (WAV from the server), procedural ambience and sound effects (no licensed
// assets), speech ducking, global mute. Everything is unlocked by the user's first gesture.
type Clip = { buffer: AudioBuffer; durationMs: number };

const AMBIENCE_PRESETS = ['forest', 'rain', 'wind', 'classroom', 'lab', 'night', 'sea', 'city'] as const;

export class Mixer {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private speechBus!: GainNode;
  private fxBus!: GainNode;
  private ambBus!: GainNode;
  private clips = new Map<string, Promise<Clip>>();
  private current: { src: AudioBufferSourceNode; id: string; resolve: () => void } | null = null;
  private ambience: { name: string; stop: () => void } | null = null;
  muted = false;
  onSpeechState?: (speaking: boolean, id: string | null) => void;

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.speechBus = this.ctx.createGain(); this.speechBus.connect(this.master);
      this.fxBus = this.ctx.createGain(); this.fxBus.gain.value = 0.5; this.fxBus.connect(this.master);
      this.ambBus = this.ctx.createGain(); this.ambBus.gain.value = 0.25; this.ambBus.connect(this.master);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.ctx?.resume().catch(() => {}); });
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    this.applyMute();
  }

  setMuted(m: boolean) { this.muted = m; this.applyMute(); }
  private applyMute() { if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx!.currentTime, 0.02); }

  /** Pre-decode a clip so playback starts instantly. */
  preload(id: string, url: string): Promise<Clip> {
    let p = this.clips.get(id);
    if (!p) {
      p = (async () => {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        if (!this.ctx) this.unlock();
        const buffer = await this.ctx!.decodeAudioData(buf);
        return { buffer, durationMs: Math.round(buffer.duration * 1000) };
      })();
      this.clips.set(id, p);
    }
    return p;
  }

  /** Play a clip (interrupting any current speech); resolves when it ends or is interrupted. */
  async say(id: string, url: string): Promise<void> {
    this.unlock();
    const clip = await this.preload(id, url);
    this.stopSpeech();
    const src = this.ctx!.createBufferSource();
    src.buffer = clip.buffer;
    src.connect(this.speechBus);
    this.duck(true);
    return new Promise<void>((resolve) => {
      const entry = { src, id, resolve: () => { if (this.current === entry) { this.current = null; this.duck(false); this.onSpeechState?.(false, null); } resolve(); } };
      this.current = entry;
      src.onended = entry.resolve;
      this.onSpeechState?.(true, id);
      src.start();
    });
  }

  stopSpeech() {
    if (this.current) { const c = this.current; try { c.src.onended = null; c.src.stop(); } catch { /* already stopped */ } c.resolve(); }
  }
  get speakingId() { return this.current?.id ?? null; }

  private duck(on: boolean) {
    if (!this.ctx) return;
    this.ambBus.gain.setTargetAtTime(on ? 0.08 : 0.25, this.ctx.currentTime, 0.15);
  }

  /** Procedural sound effects. */
  sfx(name: string) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const out = this.fxBus;
    const osc = (type: OscillatorType, f0: number, f1: number, dur: number, gain = 0.3) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
    };
    const noise = (dur: number, f0: number, f1: number, gain = 0.4) => {
      const n = c.createBufferSource(); n.buffer = this.noiseBuffer();
      const filt = c.createBiquadFilter(); filt.type = 'bandpass'; filt.Q.value = 0.8;
      filt.frequency.setValueAtTime(f0, t); filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      n.connect(filt).connect(g).connect(out); n.start(t); n.stop(t + dur + 0.05);
    };
    switch (name) {
      case 'pop': osc('sine', 600, 180, 0.12, 0.4); break;
      case 'chime': osc('sine', 880, 880, 0.9, 0.25); osc('sine', 1320, 1320, 0.7, 0.12); osc('sine', 1760, 1760, 0.5, 0.06); break;
      case 'ding': osc('triangle', 1200, 1180, 0.6, 0.3); break;
      case 'whoosh': case 'swoosh': noise(0.5, 300, 2400, 0.5); break;
      case 'splash': noise(0.6, 1500, 300, 0.5); osc('sine', 300, 80, 0.3, 0.2); break;
      case 'thud': osc('sine', 140, 40, 0.3, 0.6); noise(0.15, 200, 80, 0.3); break;
      case 'sparkle': for (let i = 0; i < 5; i++) setTimeout(() => osc('sine', 1500 + Math.random() * 1500, 2500, 0.25, 0.08), i * 60); break;
      case 'rise': osc('sawtooth', 200, 900, 0.6, 0.12); break;
      default: osc('sine', 500, 400, 0.1, 0.2);
    }
  }

  private _noise: AudioBuffer | null = null;
  private noiseBuffer() {
    if (!this._noise) { const c = this.ctx!; const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this._noise = b; }
    return this._noise;
  }

  /** Looping procedural ambience. */
  setAmbience(name: string | undefined) {
    if (!this.ctx) return;
    const want = name && (AMBIENCE_PRESETS as readonly string[]).includes(name) ? name : null;
    if (this.ambience?.name === want) return;
    this.ambience?.stop(); this.ambience = null;
    if (!want) return;
    const c = this.ctx, nodes: AudioNode[] = [], timers: number[] = [];
    const g = c.createGain(); g.gain.setValueAtTime(0.001, c.currentTime); g.gain.exponentialRampToValueAtTime(1, c.currentTime + 2); g.connect(this.ambBus);
    const loopNoise = (type: BiquadFilterType, freq: number, q: number, gain: number, lfo?: number) => {
      const n = c.createBufferSource(); n.buffer = this.noiseBuffer(); n.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const gg = c.createGain(); gg.gain.value = gain;
      if (lfo) { const o = c.createOscillator(); o.frequency.value = lfo; const og = c.createGain(); og.gain.value = gain * 0.6; o.connect(og).connect(gg.gain); o.start(); nodes.push(o); }
      n.connect(f).connect(gg).connect(g); n.start(); nodes.push(n);
    };
    const chirps = (minF: number, maxF: number, every: number) => {
      const tick = () => { const o = c.createOscillator(), og = c.createGain(); const f = minF + Math.random() * (maxF - minF); o.frequency.setValueAtTime(f, c.currentTime); o.frequency.exponentialRampToValueAtTime(f * 1.4, c.currentTime + 0.12); og.gain.setValueAtTime(0.12, c.currentTime); og.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25); o.connect(og).connect(g); o.start(); o.stop(c.currentTime + 0.3); timers.push(window.setTimeout(tick, every * (0.5 + Math.random()))); };
      timers.push(window.setTimeout(tick, 500));
    };
    switch (want) {
      case 'rain': loopNoise('bandpass', 1800, 0.5, 0.35); loopNoise('lowpass', 400, 0.7, 0.15, 0.3); break;
      case 'wind': loopNoise('bandpass', 500, 0.4, 0.3, 0.2); break;
      case 'forest': loopNoise('lowpass', 900, 0.5, 0.12, 0.15); chirps(1800, 3200, 2500); break;
      case 'night': loopNoise('lowpass', 300, 0.5, 0.1); chirps(3800, 4400, 900); break;
      case 'sea': loopNoise('lowpass', 600, 0.6, 0.3, 0.12); break;
      case 'city': loopNoise('bandpass', 350, 0.7, 0.2, 0.08); break;
      case 'classroom': loopNoise('lowpass', 500, 0.5, 0.06); break;
      case 'lab': { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 60; const og = c.createGain(); og.gain.value = 0.05; o.connect(og).connect(g); o.start(); nodes.push(o); loopNoise('lowpass', 2000, 0.3, 0.03); break; }
    }
    this.ambience = { name: want, stop: () => { g.gain.setTargetAtTime(0.001, c.currentTime, 0.4); timers.forEach(clearTimeout); setTimeout(() => { nodes.forEach((n) => { try { (n as any).stop?.(); } catch { /* ok */ } n.disconnect(); }); g.disconnect(); }, 1500); } };
  }

  destroy() { this.stopSpeech(); this.ambience?.stop(); this.ambience = null; }
}

export const mixer = new Mixer();
