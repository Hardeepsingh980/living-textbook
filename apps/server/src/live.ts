// The live tutor: a WebSocket proxy between the browser and the Gemini Live API, one session per lesson. The
// service-account credentials stay on the server; the browser sends 16 kHz PCM and receives 24 kHz PCM plus
// transcripts. Gemini acts on the scene only through typed tools: every tool call is forwarded to the browser,
// executed on the running scene, and the confirmed result goes back to the model before it speaks about it.
//
// Client → server: {type:'start', experienceId, state?}, {type:'audio', data:<base64 pcm16 16k>}, {type:'text', text},
//   {type:'state', state:{...}}, {type:'tool-result', id, result}, {type:'end'}
// Server → client: {type:'ready', resumed?}, {type:'audio', data:<base64 pcm16 24k>}, {type:'transcript', role, text, final},
//   {type:'turnComplete'}, {type:'interrupted'}, {type:'tool', id, name, args}, {type:'reconnecting'}, {type:'error', message}, {type:'closed'}
import type { WebSocket } from 'ws';
import { Modality, type LiveServerMessage, type Session } from '@google/genai';
import { clients } from './gemini.js';
import { config } from './config.js';
import { store } from './store.js';
import { TOOL_DECLARATIONS, type ExperienceRecord } from '@living-book/scene';

const TOOL_TIMEOUT_MS = 6000;
const MAX_RECONNECTS = 4;

function systemInstruction(rec: ExperienceRecord): string {
  const ex = rec.extraction;
  const sc = rec.scene;
  const facts = ex ? JSON.stringify({ headings: ex.headings, values: ex.values, worked: ex.worked, equations: ex.equations, entities: ex.entities, setting: ex.setting, dialogue: ex.dialogue, steps: ex.steps, claims: ex.claims }) : '';
  const params = sc.vars.filter((v) => v.role === 'param').map((v) => `${v.id} ("${v.label ?? v.id}", ${v.unit || 'no unit'}, ${v.min}..${v.max}, the page's value ${v.init})`).join('; ');
  const derived = sc.derived.map((d) => `${d.id} = ${d.expr}${d.unit ? ` [${d.unit}]` : ''}`).join('; ');
  const objects = sc.elements.filter((e) => e.type !== 'particles').map((e) => `${e.id}${'text' in e && typeof e.text === 'string' ? ` ("${e.text.slice(0, 40)}")` : ` (${e.type})`}`).join(', ');
  const script = sc.steps.map((s, i) => `${i + 1}. ${s.title ?? s.id}: ${s.narration ?? ''}`).join('\n');
  return `You are the voice of Living Book: a warm, curious tutor who has just brought a book page to life on the reader's phone and is now talking with them about it.
Speak the page's language (${rec.quick.language}). Keep each answer short (one to three sentences), concrete and child-safe; end with a short question when it helps learning. Never read out identifiers or JSON.

GROUNDING. Everything you say must come from THE PAGE, THE LESSON SCRIPT (already verified against the page) or the CURRENT STATE returned by your tools. If a question goes beyond what the page supports, say so briefly and offer what the page does say.

LESSON MODE. When you receive the message "begin", you are the narrator of this lesson: teach it step by step without waiting to be asked. For each step in order: call navigate_to_step with the step number, wait for its result, then explain that step in two or three short sentences based on the script text the result returns (say it in your own warm words; keep every number and name exactly). Where a step shows a simulation, call run_simulation before explaining what moves. Move on to the next step after each explanation. After the last step, invite the reader to try a "what if" or ask a question, and stop talking until they do. The reader may interrupt at any moment: answer them first, do what they ask with the tools, then continue the lesson from where you left off if they have no more questions. If the message "continue" arrives, carry on from the current step; if "replay" arrives, start again from step 1.

TOOLS. You can look at and change the scene only through the tools. Before answering anything about current values, settings or what is on screen, call get_scene_state. When the reader asks "what if" or wants something changed, highlighted or shown, call the matching tool, WAIT for its result, and describe only what the result confirms (the value that was actually applied, the derived values it returned). If a tool says ok=false, tell the reader plainly that this scene cannot do that and what it can do instead; never pretend the scene changed. Do not call tools for small talk.

THE PAGE (${rec.quick.subject}; title "${rec.quick.title}"):
${ex ? ex.text.slice(0, 6000) : rec.quick.gist}

STRUCTURED FACTS: ${facts.slice(0, 4000)}

THE LESSON SCRIPT (what the narrator says, step by step):
${script || '(no steps)'}

THE SCENE: kind ${sc.kind}; adjustable parameters: ${params || 'none'}; formulas: ${derived || 'none'}; objects: ${objects || 'none'}; figures: ${Object.keys(sc.anchors).join(', ') || 'none'}.`;
}

export async function handleLiveSocket(ws: WebSocket) {
  const { liveAi } = await clients();
  let session: Session | null = null;
  let rec: ExperienceRecord | null = null;
  let currentState: Record<string, number> = {};
  let resumeHandle: string | undefined;
  let reconnects = 0;
  let closedByUs = false;
  let wsClosed = false;
  const pendingTools = new Map<string, { resolve: (r: unknown) => void; timer: NodeJS.Timeout }>();
  const send = (m: object) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };

  /** Ask the browser to run a tool on the live scene; the model only hears what actually happened. */
  const runToolInBrowser = (id: string, name: string, args: unknown) => new Promise<unknown>((resolve) => {
    const timer = setTimeout(() => { pendingTools.delete(id); resolve({ ok: false, reason: 'the scene did not respond in time' }); }, TOOL_TIMEOUT_MS);
    pendingTools.set(id, { resolve, timer });
    send({ type: 'tool', id, name, args: args ?? {} });
  });

  const connect = async (): Promise<void> => {
    if (!rec) return;
    const sys = systemInstruction(rec);
    const handle = (m: LiveServerMessage) => {
      if (process.env.LIVE_DEBUG) console.log('[live] <-', JSON.stringify(m).slice(0, 240));
      const sc = m.serverContent;
      if (sc?.modelTurn?.parts) for (const p of sc.modelTurn.parts) if (p.inlineData?.data) send({ type: 'audio', data: p.inlineData.data });
      if (sc?.inputTranscription?.text) send({ type: 'transcript', role: 'user', text: sc.inputTranscription.text, final: !!(sc as any).inputTranscription?.finished });
      if (sc?.outputTranscription?.text) send({ type: 'transcript', role: 'model', text: sc.outputTranscription.text, final: !!(sc as any).outputTranscription?.finished });
      if (sc?.interrupted) send({ type: 'interrupted' });
      if (sc?.turnComplete) send({ type: 'turnComplete' });
      const upd = (m as any).sessionResumptionUpdate;
      if (upd?.resumable && upd.newHandle) resumeHandle = upd.newHandle;
      if ((m as any).goAway) console.log('[live] goAway', JSON.stringify((m as any).goAway).slice(0, 120));
      if (m.toolCall?.functionCalls?.length) {
        const calls = m.toolCall.functionCalls;
        console.log('[live] tool call', calls.map((f) => `${f.name}(${JSON.stringify(f.args ?? {}).slice(0, 80)})`).join(', '));
        void Promise.all(calls.map(async (fc) => {
          const id = fc.id ?? `${fc.name}-${Date.now()}`;
          const known = (TOOL_DECLARATIONS as readonly { name: string }[]).some((d) => d.name === fc.name);
          const result = known ? await runToolInBrowser(id, fc.name!, fc.args) : { ok: false, reason: `unknown tool ${fc.name}` };
          return { id: fc.id, name: fc.name, response: { result } };
        })).then((responses) => { try { session?.sendToolResponse({ functionResponses: responses }); } catch (e: any) { console.error('[live] tool response', e?.message || e); } });
      }
    };
    const mySession = await liveAi.live.connect({
      model: config.models.live.id,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: sys,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voices.narrator[rec.quick.language as 'en' | 'hi'] ?? 'Kore' } } },
        tools: [{ functionDeclarations: TOOL_DECLARATIONS as any }],
        sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
        contextWindowCompression: { slidingWindow: {} },
      } as any,
      callbacks: {
        onopen: () => { /* ready is sent once the session object exists */ },
        onmessage: (m: LiveServerMessage) => { try { handle(m); } catch (e: any) { console.error('[live] onmessage', e); send({ type: 'error', message: String(e?.message || e) }); } },
        onerror: (e: any) => { console.error('[live] error', e?.message || e); send({ type: 'error', message: String(e?.message || e) }); },
        onclose: (e: any) => {
          console.log('[live] gemini session closed', e?.reason || '');
          if (session !== mySession) return;
          session = null;
          if (closedByUs || wsClosed) { send({ type: 'closed', reason: e?.reason }); return; }
          // the model side went away (time limit, network): come back on the same lesson, resuming when possible
          if (reconnects++ < MAX_RECONNECTS) { send({ type: 'reconnecting' }); connect().then(() => send({ type: 'ready', resumed: !!resumeHandle })).catch((err) => { console.error('[live] reconnect failed', err?.message || err); send({ type: 'closed', reason: 'reconnect failed' }); }); }
          else send({ type: 'closed', reason: 'session ended' });
        },
      },
    });
    session = mySession;
  };

  const queue: any[] = [];
  const dispatch = (m: any) => {
    if (m.type === 'tool-result') { const p = pendingTools.get(String(m.id)); if (p) { clearTimeout(p.timer); pendingTools.delete(String(m.id)); p.resolve(m.result ?? { ok: false, reason: 'empty result' }); } return; }
    if (m.type === 'state' && m.state) { currentState = m.state; return; }
    if (!session) { if (m.type !== 'audio') queue.push(m); return; } // audio before the session exists is dropped; text waits
    if (m.type === 'audio' && typeof m.data === 'string') session.sendRealtimeInput({ audio: { data: m.data, mimeType: 'audio/pcm;rate=16000' } });
    else if (m.type === 'text' && typeof m.text === 'string') session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: m.text }] }], turnComplete: true });
    else if (m.type === 'end') { closedByUs = true; session.close(); session = null; }
  };
  ws.on('message', async (raw) => {
    let m: any;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    try {
      if (m.type === 'start') {
        rec = await store.getRecord(String(m.experienceId));
        if (!rec) { send({ type: 'error', message: 'experience not found' }); return; }
        if (m.state) currentState = m.state;
        await connect();
        send({ type: 'ready' });
        while (queue.length) dispatch(queue.shift());
      } else dispatch(m);
    } catch (e: any) { console.error('[live] dispatch', e?.message || e); send({ type: 'error', message: String(e?.message || e) }); }
  });
  ws.on('close', () => { wsClosed = true; closedByUs = true; for (const p of pendingTools.values()) clearTimeout(p.timer); pendingTools.clear(); try { session?.close(); } catch { /* ok */ } session = null; });
  void currentState;
}
