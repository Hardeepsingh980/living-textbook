// The live tutor client: one session per lesson. Microphone → 16 kHz PCM over WebSocket → server proxy → Gemini
// Live; 24 kHz PCM back, played gap-free through Web Audio; transcripts surface as captions. Tool calls arrive from
// the server, run on the live scene through the executor the view provides, and the confirmed result goes back.
// The microphone can be switched off while the session stays alive, so a later question costs no new session.
import { mixer } from './mixer';

export type TutorState = 'off' | 'connecting' | 'ready' | 'listening' | 'thinking' | 'acting' | 'speaking' | 'interrupted' | 'reconnecting' | 'unavailable';
export type TutorEvents = {
  onState?: (s: TutorState, detail?: string) => void;
  onTranscript?: (role: 'user' | 'model', text: string, final: boolean) => void;
  onTool?: (name: string, args: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** the model finished a turn and its last audio has played; `spoke` is false for a turn that only called a tool
   *  (the model then speaks in the turn that follows the tool's result) */
  onTurnDone?: (spoke: boolean) => void;
};

const RECONNECT_DELAYS = [800, 1600, 3200];

export class LiveTutor {
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private scheduled: AudioBufferSourceNode[] = [];
  private playhead = 0;
  private modelText = '';
  private userText = '';
  private state: TutorState = 'off';
  private micOn = false;
  private sessionReady = false;
  private attempts = 0;
  private stopped = false;
  private lastUserSpeechAt = 0;
  private outputMuted = false;
  private lastError = '';
  private spokeThisTurn = false;
  /** when the model's voice last arrived (performance.now), muted or not */
  lastAudioAt = 0;

  constructor(private experienceId: string, private getState: () => Record<string, number>, private ev: TutorEvents = {}) {}

  get current() { return this.state; }
  get listening() { return this.micOn; }
  get active() { return this.state !== 'off' && this.state !== 'unavailable'; }
  /** the reader made a sound in the last `ms` (the microphone's own level, before any transcript arrives) */
  heardRecently(ms: number) { return performance.now() - this.lastUserSpeechAt < ms; }

  private setState(s: TutorState, detail?: string) { if (this.state === s) return; this.state = s; this.ev.onState?.(s, detail); }

  /** Open the session (no microphone yet). Resolves once the tutor can take a question; a record that is still being saved is retried. */
  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN && this.sessionReady) return; // already open
    if (this.connecting) return this.connecting;
    this.connecting = (async () => { try { await this.connectLoop(); } finally { this.connecting = null; } })();
    return this.connecting;
  }
  private connecting: Promise<void> | null = null;
  private async connectLoop() {
    for (let attempt = 0; ; attempt++) {
      try { await this.connectOnce(); return; }
      catch (e: any) { if (attempt < 3 && /not found|did not answer/i.test(String(e?.message))) { this.setState('connecting'); await new Promise((r) => setTimeout(r, 1500)); continue; } throw e; }
    }
  }
  private async connectOnce() {
    this.stopped = false;
    mixer.unlock();
    this.setState(this.attempts ? 'reconnecting' : 'connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/live`);
    this.ws = ws;
    await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('voice connection failed')); });
    ws.send(JSON.stringify({ type: 'start', experienceId: this.experienceId, state: this.getState() }));
    ws.onmessage = (e) => { try { this.onMessage(JSON.parse(e.data)); } catch (err) { console.warn('[tutor] message', err); } };
    ws.onclose = () => this.onSocketClosed();
    this.lastError = '';
    await new Promise<void>((res, rej) => { const t = setTimeout(() => rej(new Error('tutor did not answer')), 12000); const check = () => { if (this.sessionReady) { clearTimeout(t); res(); } else if (this.lastError) { clearTimeout(t); rej(new Error(this.lastError)); } else if (this.state === 'unavailable') { clearTimeout(t); rej(new Error('unavailable')); } else setTimeout(check, 50); }; check(); });
    this.attempts = 0;
  }

  /** Start listening (asks for the microphone the first time). */
  async listen() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) await this.connect();
    const ctx = mixer.ctx!;
    if (!this.mediaStream) {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      this.source = ctx.createMediaStreamSource(this.mediaStream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      this.processor = proc;
      const ratio = ctx.sampleRate / 16000;
      proc.onaudioprocess = (ev) => {
        const ws = this.ws;
        if (!this.micOn || !ws || ws.readyState !== ws.OPEN) return;
        const input = ev.inputBuffer.getChannelData(0);
        const n = Math.floor(input.length / ratio);
        const out = new Int16Array(n);
        let energy = 0;
        for (let i = 0; i < n; i++) { let acc = 0, c = 0; const s0 = Math.floor(i * ratio), s1 = Math.floor((i + 1) * ratio); for (let j = s0; j < s1 && j < input.length; j++) { acc += input[j]!; c++; } const v = c ? acc / c : 0; energy += v * v; out[i] = Math.max(-1, Math.min(1, v)) * 32767; }
        if (n && energy / n > 0.0004) this.lastUserSpeechAt = performance.now();
        ws.send(JSON.stringify({ type: 'audio', data: b64(out.buffer) }));
      };
      this.source.connect(proc); proc.connect(ctx.destination); // the processor needs a destination to run; it outputs silence
    }
    this.micOn = true;
    mixer.stopSpeech();
    if (this.state === 'ready' || this.state === 'interrupted') this.setState('listening');
  }

  /** Stop listening but keep the session for the next question. */
  mute() {
    this.micOn = false;
    if (this.state === 'listening') this.setState('ready');
  }

  /** Ask the tutor to teach the lesson from the first step (it drives the steps through the tools). */
  beginLesson() { this.sendText('begin'); }
  /** Pause and resume the tutor's voice locally; the session stays open. */
  setOutputMuted(m: boolean) { this.outputMuted = m; if (m) this.cutPlayback(); }
  sendState() { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'state', state: this.getState() })); }
  sendText(text: string) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'text', text })); }

  /** Stop the model's voice right now (the reader interrupted, or the lesson moved on). */
  private cutPlayback() {
    for (const s of this.scheduled) { try { s.stop(); } catch { /* already done */ } }
    this.scheduled = [];
    this.playhead = 0;
  }

  private async onMessage(m: any) {
    const ctx = mixer.ctx!;
    switch (m.type) {
      case 'ready': this.sessionReady = true; this.setState(this.micOn ? 'listening' : 'ready'); break;
      case 'reconnecting': this.sessionReady = false; this.cutPlayback(); this.setState('reconnecting'); break;
      case 'audio': {
        this.spokeThisTurn = true; this.lastAudioAt = performance.now();
        if (this.outputMuted) break;
        const bytes = Uint8Array.from(atob(m.data), (c) => c.charCodeAt(0));
        const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
        const buf = ctx.createBuffer(1, pcm.length, 24000);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i]! / 32768;
        const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
        const now = ctx.currentTime;
        if (this.playhead < now + 0.05) this.playhead = now + 0.05;
        if ((window as any).__captureLive) ((window as any).__liveAudio ??= []).push({ at: performance.now() + (this.playhead - now) * 1000, rate: 24000, data: m.data });
        src.start(this.playhead); this.playhead += buf.duration;
        src.onended = () => { this.scheduled = this.scheduled.filter((x) => x !== src); };
        this.scheduled.push(src);
        if (this.state !== 'speaking') this.setState('speaking');
        break;
      }
      case 'transcript':
        if (m.role === 'user') {
          this.userText += m.text; this.ev.onTranscript?.('user', this.userText, !!m.final);
          if (m.final) { this.userText = ''; if (this.state === 'listening' || this.state === 'interrupted') this.setState('thinking'); }
          else if (this.state === 'listening') this.setState('thinking');
        } else { this.modelText += m.text; this.ev.onTranscript?.('model', this.modelText, !!m.final); }
        break;
      case 'tool': {
        this.setState('acting');
        let result: Record<string, unknown> = { ok: false, reason: 'no scene is running' };
        try { result = (await this.ev.onTool?.(String(m.name), m.args ?? {})) ?? result; } catch (e: any) { result = { ok: false, reason: String(e?.message || e) }; }
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'tool-result', id: m.id, result }));
        if (this.state === 'acting') this.setState('thinking');
        break;
      }
      case 'turnComplete': {
        const spoke = this.spokeThisTurn || !!this.modelText.trim();
        this.spokeThisTurn = false;
        if (this.modelText) this.ev.onTranscript?.('model', this.modelText, true);
        this.modelText = '';
        // the audio tail is still scheduled: switch back once it has played
        const waitMs = Math.max(0, (this.playhead - ctx.currentTime) * 1000);
        setTimeout(() => { if (this.state === 'speaking' || this.state === 'thinking') this.setState(this.micOn ? 'listening' : 'ready'); this.ev.onTurnDone?.(spoke); }, waitMs);
        break;
      }
      case 'interrupted': this.cutPlayback(); this.modelText = ''; this.setState('interrupted'); setTimeout(() => { if (this.state === 'interrupted') this.setState(this.micOn ? 'listening' : 'ready'); }, 600); break;
      case 'error': console.warn('[tutor]', m.message); if (!this.sessionReady) { const notFound = /not found/i.test(String(m.message)); this.lastError = String(m.message); if (!notFound) this.setState('unavailable', m.message); else this.ws?.close(); } break;
      case 'closed': this.sessionReady = false; if (!this.stopped) this.setState('unavailable', m.reason); break;
    }
  }

  private onSocketClosed() {
    this.sessionReady = false;
    this.ws = null;
    if (this.stopped) { this.setState('off'); return; }
    if (this.lastError) return; // connect() is handling it
    // the connection dropped: try to come back a few times, keeping the microphone as it was
    const delay = RECONNECT_DELAYS[this.attempts];
    if (delay === undefined) { this.setState('unavailable', 'connection lost'); return; }
    this.attempts++;
    this.setState('reconnecting');
    setTimeout(() => { if (!this.stopped) this.connect().catch(() => this.setState('unavailable', 'connection lost')); }, delay);
  }

  /** End the session and release the microphone. */
  stop() {
    this.stopped = true;
    this.micOn = false;
    this.cutPlayback();
    try { this.processor?.disconnect(); this.source?.disconnect(); } catch { /* ok */ }
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null; this.processor = null; this.source = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) { try { this.ws.send(JSON.stringify({ type: 'end' })); } catch { /* ok */ } this.ws.close(); }
    this.ws = null;
    this.sessionReady = false;
    this.setState('off');
  }
}

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(s);
}
