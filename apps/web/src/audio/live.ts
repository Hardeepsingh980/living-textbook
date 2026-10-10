// Voice Q&A client: microphone → 16 kHz PCM over WebSocket → server proxy → Gemini Live; 24 kHz PCM back, played
// gap-free through Web Audio; transcripts surface as captions.
import { mixer } from './mixer';

export type LiveEvents = {
  onStatus?: (s: 'connecting' | 'listening' | 'thinking' | 'speaking' | 'closed' | 'error', detail?: string) => void;
  onTranscript?: (role: 'user' | 'model', text: string, final: boolean) => void;
};

export class LiveVoice {
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private playhead = 0;
  private modelText = '';
  private userText = '';
  private speaking = false;
  active = false;

  constructor(private experienceId: string, private getState: () => Record<string, number>, private ev: LiveEvents = {}) {}

  async start() {
    mixer.unlock();
    const ctx = mixer.ctx!;
    this.ev.onStatus?.('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/live`);
    this.ws = ws;
    await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('voice connection failed')); });
    ws.send(JSON.stringify({ type: 'start', experienceId: this.experienceId, state: this.getState() }));
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
    ws.onclose = () => { this.ev.onStatus?.('closed'); this.stop(); };
    // microphone at the context rate, downsampled to 16 kHz PCM16
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    this.source = ctx.createMediaStreamSource(this.mediaStream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    this.processor = proc;
    const ratio = ctx.sampleRate / 16000;
    proc.onaudioprocess = (ev) => {
      if (!this.active || ws.readyState !== ws.OPEN) return;
      const input = ev.inputBuffer.getChannelData(0);
      const n = Math.floor(input.length / ratio);
      const out = new Int16Array(n);
      for (let i = 0; i < n; i++) { let acc = 0, c = 0; const s0 = Math.floor(i * ratio), s1 = Math.floor((i + 1) * ratio); for (let j = s0; j < s1 && j < input.length; j++) { acc += input[j]!; c++; } const v = c ? acc / c : 0; out[i] = Math.max(-1, Math.min(1, v)) * 32767; }
      ws.send(JSON.stringify({ type: 'audio', data: b64(out.buffer) }));
    };
    this.source.connect(proc); proc.connect(ctx.destination); // destination needed for the processor to run; it outputs silence
    this.active = true;
    mixer.stopSpeech();
    this.ev.onStatus?.('listening');
  }

  sendState() { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'state', state: this.getState() })); }
  sendText(text: string) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'text', text })); }

  private onMessage(m: any) {
    const ctx = mixer.ctx!;
    switch (m.type) {
      case 'ready': this.ev.onStatus?.('listening'); break;
      case 'audio': {
        const bytes = Uint8Array.from(atob(m.data), (c) => c.charCodeAt(0));
        const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
        const buf = ctx.createBuffer(1, pcm.length, 24000);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i]! / 32768;
        const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
        const now = ctx.currentTime;
        if (this.playhead < now + 0.05) this.playhead = now + 0.05;
        src.start(this.playhead); this.playhead += buf.duration;
        if (!this.speaking) { this.speaking = true; this.ev.onStatus?.('speaking'); }
        break;
      }
      case 'transcript':
        if (m.role === 'user') { this.userText += m.text; this.ev.onTranscript?.('user', this.userText, !!m.final); if (m.final) this.userText = ''; }
        else { this.modelText += m.text; this.ev.onTranscript?.('model', this.modelText, !!m.final); }
        break;
      case 'turnComplete': this.speaking = false; this.ev.onTranscript?.('model', this.modelText, true); this.modelText = ''; this.ev.onStatus?.('listening'); break;
      case 'interrupted': this.playhead = 0; this.speaking = false; this.modelText = ''; break;
      case 'error': this.ev.onStatus?.('error', m.message); break;
      case 'closed': this.ev.onStatus?.('closed'); break;
    }
  }

  stop() {
    this.active = false;
    try { this.processor?.disconnect(); this.source?.disconnect(); } catch { /* ok */ }
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null; this.processor = null; this.source = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) { try { this.ws.send(JSON.stringify({ type: 'end' })); } catch { /* ok */ } this.ws.close(); }
    this.ws = null;
  }
}

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(s);
}
